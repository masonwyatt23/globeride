/**
 * ShareCard — Zwift-style post-ride share image generator.
 *
 * Renders a hidden 1080×1350 (Instagram-story) card DOM node and captures
 * it as a PNG via html-to-image when the user clicks "Download share card".
 * Fully offline / PWA-compatible — all rendering is client-side.
 *
 * Layout (top → bottom):
 *   1. Header  — GlobeRide logotype + tagline
 *   2. Route SVG — full-route 2-D map at card width, elevation-tinted glow
 *   3. Route name — large
 *   4. Big-six stats grid — Distance · Duration · Avg Power · Elev Gain · IF · TSS
 *   5. Date footer + watermark
 */

import { useRef, useState, useMemo, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { Download, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { computeMetrics } from '@/lib/metrics';
import { formatDuration } from '@/lib/utils';
import { resolveIonToken, isWebGLAvailable } from '@/components/landing/HeroVisual';
import { ShareCardGlobe } from '@/components/share/ShareCardGlobe';
import type { Route, RoutePoint } from '@/types';

// ─── Card dimensions ──────────────────────────────────────────────────────────

/** Physical pixel dimensions of the share card (Instagram story vertical). */
const CARD_W = 1080;
const CARD_H = 1350;

/**
 * Resolve whether we can render a Cesium globe in the share card.
 * Requires a Cesium ion token AND WebGL support.
 * Called once per download attempt (not at module load) so it's always fresh.
 */
function canRenderGlobe(): { ok: boolean; token: string | null } {
  const token = resolveIonToken();
  const webgl = isWebGLAvailable();
  return { ok: !!(token && webgl), token };
}

/** Horizontal padding inside the card, px. */
const CARD_PX = 72;

/** Height of the route-map area inside the card. */
const MAP_H = 480;
const MAP_PAD = 24;

// ─── Accent / colour constants (match app dark theme) ────────────────────────

const CYAN = '#22d3ee';
const DARK_BG = '#070d1a';        // near-black navy (dark theme background)
const CARD_BG = '#0d1626';        // slightly lighter card surface
const MUTED_TEXT = '#64748b';     // slate-500
const BRIGHT_TEXT = '#f1f5f9';    // slate-100
const ACCENT_GLOW = 'rgba(34,211,238,0.18)';

// ─── Projection helpers (cloned from Minimap.tsx) ────────────────────────────

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  midLat: number;
}

function routeBounds(points: RoutePoint[]): Bounds {
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon, midLat: (minLat + maxLat) / 2 };
}

function projectPoint(
  lat: number,
  lon: number,
  bounds: Bounds,
  drawW: number,
  drawH: number,
  pad: number,
): [number, number] {
  const cosLat = Math.cos((bounds.midLat * Math.PI) / 180);
  const dLat = bounds.maxLat - bounds.minLat || 1e-6;
  const dLon = (bounds.maxLon - bounds.minLon) * cosLat || 1e-6;

  const nx = ((lon - bounds.minLon) * cosLat) / dLon;
  const ny = 1 - (lat - bounds.minLat) / dLat;

  const scale = Math.min(drawW, drawH);
  const offX = (drawW - scale) / 2;
  const offY = (drawH - scale) / 2;

  return [pad + offX + nx * scale, pad + offY + ny * scale];
}

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

/** Build an SVG <path d="…"> string for the full route at card-map dimensions. */
interface GradientStop { offset: string; stopColor: string }
function buildMapPath(route: Route): {
  pathD: string;
  gradientStops: GradientStop[];
} {
  const pts = downsample(route.points, 600);
  const bounds = routeBounds(pts);
  const drawW = CARD_W - CARD_PX * 2 - MAP_PAD * 2;
  const drawH = MAP_H - MAP_PAD * 2;

  // Elevation range for tint gradient
  const eles = pts.map((p) => p.ele);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const eleRange = maxEle - minEle || 1;

  const coords = pts.map((p) =>
    projectPoint(p.lat, p.lon, bounds, drawW, drawH, MAP_PAD),
  );

  const pathD = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  // Build a gradient that tints from flat (cyan/50%) to steep (amber/100%).
  // Simplified: 5 stops across the route length, mapped to elevation.
  const stopCount = 6;
  const stops: GradientStop[] = [];
  for (let i = 0; i < stopCount; i++) {
    const t = i / (stopCount - 1);
    const idx = Math.round(t * (pts.length - 1));
    const eleFrac = Math.min(1, (pts[idx].ele - minEle) / eleRange);
    // interpolate cyan → amber as elevation rises
    const r = Math.round(34 + (251 - 34) * eleFrac);    // 34→251
    const g = Math.round(211 + (191 - 211) * eleFrac);  // 211→191
    const b = Math.round(238 + (36 - 238) * eleFrac);   // 238→36
    const color = `rgb(${r},${g},${b})`;
    stops.push({ offset: `${(t * 100).toFixed(1)}%`, stopColor: color });
  }

  return { pathD, gradientStops: stops };
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

interface StatItem {
  label: string;
  value: string;
  unit?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * ShareCard — renders a hidden share card and a visible Download button.
 *
 * Mount this inside `FinishCard` in Ride.tsx.
 */
export function ShareCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // ---- Globe state ----
  // globeToken: non-null → ShareCardGlobe is mounted; null → SVG minimap.
  // globeReadyRef: resolves the promise that handleDownload awaits before toPng.
  const [globeToken, setGlobeToken] = useState<string | null>(null);
  const globeReadyRef = useRef<(() => void) | null>(null);

  // Called when the user clicks Download — decide whether to show the globe.
  // We set state here (triggering a re-render that mounts ShareCardGlobe)
  // and then wait for the globe's onReady callback before capturing.
  const triggerGlobeCapture = useCallback(
    (token: string): Promise<void> =>
      new Promise<void>((resolve) => {
        globeReadyRef.current = resolve;
        setGlobeToken(token);
      }),
    [],
  );

  const handleGlobeReady = useCallback(() => {
    globeReadyRef.current?.();
    globeReadyRef.current = null;
  }, []);

  const handleGlobeError = useCallback(() => {
    // Globe failed — resolve so capture proceeds with whatever is rendered
    // (the SVG minimap, which is already in the DOM as fallback).
    globeReadyRef.current?.();
    globeReadyRef.current = null;
    setGlobeToken(null);
  }, []);

  // ---- Data from stores ----
  const route       = useRideStore((s) => s.route);
  const distance    = useRideStore((s) => s.distance);
  const elapsedMs   = useRideStore((s) => s.elapsedMs);
  const samples     = useRideStore((s) => s.samples);
  const startedAt   = useRideStore((s) => s.startedAt);
  const activeWorkout = useRideStore((s) => s.activeWorkout);
  const ftpW        = useSettingsStore((s) => s.ftpW);

  const metrics = useMemo(
    () => computeMetrics(samples, ftpW, activeWorkout),
    [samples, ftpW, activeWorkout],
  );

  // Route map SVG data — only computed when we have a route
  const mapData = useMemo(
    () => (route ? buildMapPath(route) : null),
    [route],
  );

  // ---- Big-six stats ----
  const stats = useMemo((): StatItem[] => {
    const hasPower = metrics.avgPowerW > 0;
    return [
      {
        label: 'Distance',
        value: distance >= 1000
          ? (distance / 1000).toFixed(2)
          : String(Math.round(distance)),
        unit: distance >= 1000 ? 'km' : 'm',
      },
      {
        label: 'Duration',
        value: formatDuration(elapsedMs / 1000),
      },
      {
        label: 'Avg Power',
        value: hasPower ? String(Math.round(metrics.avgPowerW)) : '—',
        unit: hasPower ? 'W' : undefined,
      },
      {
        label: 'Elev Gain',
        value: String(Math.round(metrics.totalAscentM)),
        unit: 'm',
      },
      {
        label: 'IF',
        value: hasPower ? metrics.intensityFactor.toFixed(2) : '—',
      },
      {
        label: 'TSS',
        value: hasPower ? String(Math.round(metrics.tss)) : '—',
      },
    ];
  }, [distance, elapsedMs, metrics]);

  // ---- Ride date ----
  const rideDate = useMemo(() => {
    const ms = startedAt ?? Date.now();
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [startedAt]);

  // ---- Download handler ----
  async function handleDownload() {
    if (!cardRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      // Check globe capability once per download attempt.
      const { ok, token } = canRenderGlobe();

      if (ok && token && route) {
        // Mount the globe and wait for it to signal tile-load completion
        // before firing html-to-image. This prevents a gray/blank capture.
        await triggerGlobeCapture(token);
      }

      const dataUrl = await toPng(cardRef.current, {
        width: CARD_W,
        height: CARD_H,
        pixelRatio: 1,
        // Ensure fonts render even if @import hasn't fired in the offscreen node
        fontEmbedCSS: '',
        // No custom filter needed — capture everything in the card.
        filter: () => true,
      });

      const slug = route?.name
        ? route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : 'ride';
      const date = new Date(startedAt ?? Date.now())
        .toISOString()
        .slice(0, 10); // YYYY-MM-DD

      const link = document.createElement('a');
      link.download = `globeride-${slug}-${date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('[ShareCard] toPng failed:', err);
    } finally {
      // Unmount the Cesium globe (destroys viewer, frees GPU memory).
      setGlobeToken(null);
      setIsCapturing(false);
    }
  }

  // ── SVG map dimensions (inside the card) ────────────────────────────────
  const mapW = CARD_W - CARD_PX * 2;

  return (
    <>
      {/* ── Visible trigger button ─────────────────────────────────────── */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={isCapturing}
        className="gap-2"
        aria-label="Download share card as PNG"
      >
        {isCapturing ? (
          <>
            <Share2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Capturing…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" aria-hidden="true" />
            Share card
          </>
        )}
      </Button>

      {/* ── Offscreen share card — rendered but invisible ─────────────── */}
      {/* position:absolute + top/left off-viewport keeps it renderable   */}
      {/* without causing layout reflow or scroll bars.                   */}
      <div
        ref={cardRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: -CARD_H - 100,
          left: -CARD_W - 100,
          width: CARD_W,
          height: CARD_H,
          background: DARK_BG,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {/* ── 1. Header ──────────────────────────────────────────────── */}
        <div
          style={{
            padding: `52px ${CARD_PX}px 36px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid rgba(255,255,255,0.07)`,
          }}
        >
          {/* Logotype */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              {/* Globe icon mark */}
              <svg
                width={52}
                height={52}
                viewBox="0 0 52 52"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Outer ring */}
                <circle cx={26} cy={26} r={24} stroke={CYAN} strokeWidth={2.5} />
                {/* Equator */}
                <ellipse
                  cx={26}
                  cy={26}
                  rx={24}
                  ry={10}
                  stroke={CYAN}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.55}
                />
                {/* Meridian */}
                <ellipse
                  cx={26}
                  cy={26}
                  rx={10}
                  ry={24}
                  stroke={CYAN}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.55}
                />
                {/* Rider dot */}
                <circle cx={26} cy={16} r={3.5} fill={CYAN} />
                {/* Route arc */}
                <path
                  d="M 14 32 Q 20 20 26 16 Q 32 12 38 20"
                  stroke={CYAN}
                  strokeWidth={2}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>

              <div>
                <div
                  style={{
                    fontSize: 38,
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: BRIGHT_TEXT,
                    lineHeight: 1,
                  }}
                >
                  Globe<span style={{ color: CYAN }}>Ride</span>
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 18,
                color: MUTED_TEXT,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
            >
              Ride anywhere on Earth
            </div>
          </div>

          {/* Route name chip */}
          {route && (
            <div
              style={{
                background: 'rgba(34,211,238,0.1)',
                border: `1px solid rgba(34,211,238,0.25)`,
                borderRadius: 12,
                padding: '10px 22px',
                fontSize: 22,
                fontWeight: 600,
                color: CYAN,
                maxWidth: 420,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {route.name}
            </div>
          )}
        </div>

        {/* ── 2. Route map — photoreal globe (with SVG fallback) ────── */}
        <div
          style={{
            padding: `28px ${CARD_PX}px 8px`,
            flex: '0 0 auto',
          }}
        >
          <div
            style={{
              width: mapW,
              height: MAP_H,
              borderRadius: 20,
              background: CARD_BG,
              border: `1px solid rgba(255,255,255,0.06)`,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: `0 0 60px -20px ${ACCENT_GLOW}`,
            }}
          >
            {/* Globe view — mounted only when token+WebGL available AND
                a download is in progress. Destroyed after capture. */}
            {globeToken && route ? (
              <ShareCardGlobe
                route={route}
                ionToken={globeToken}
                width={mapW}
                height={MAP_H}
                onReady={handleGlobeReady}
                onError={handleGlobeError}
              />
            ) : mapData ? (
              /* SVG minimap fallback — shown when globe unavailable */
              <svg
                width={mapW}
                height={MAP_H}
                viewBox={`0 0 ${mapW} ${MAP_H}`}
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block' }}
              >
                <defs>
                  {/* Elevation-tinted gradient along the route */}
                  <linearGradient id="sc-route-grad" x1="0%" y1="0%" x2="100%" y2="0%"
                    gradientUnits="userSpaceOnUse"
                  >
                    {mapData.gradientStops.map((s, i) => (
                      <stop key={i} offset={s.offset} stopColor={s.stopColor} />
                    ))}
                  </linearGradient>

                  {/* Glow filter */}
                  <filter id="sc-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  {/* Soft vignette */}
                  <radialGradient id="sc-vignette" cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="100%" stopColor="rgba(7,13,26,0.55)" />
                  </radialGradient>
                </defs>

                {/* Dim track halo (glow shadow) */}
                <path
                  d={mapData.pathD}
                  fill="none"
                  stroke={CYAN}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.18}
                  filter="url(#sc-glow)"
                />

                {/* Route line with elevation gradient */}
                <path
                  d={mapData.pathD}
                  fill="none"
                  stroke="url(#sc-route-grad)"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.92}
                />

                {/* Vignette overlay */}
                <rect
                  x={0} y={0}
                  width={mapW} height={MAP_H}
                  fill="url(#sc-vignette)"
                  pointerEvents="none"
                />
              </svg>
            ) : (
              /* No route data at all */
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: MUTED_TEXT,
                  fontSize: 22,
                }}
              >
                No route data
              </div>
            )}
          </div>
        </div>

        {/* ── 3. Route name (large) ─────────────────────────────────── */}
        <div
          style={{
            padding: `28px ${CARD_PX}px 0`,
          }}
        >
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              color: BRIGHT_TEXT,
              lineHeight: 1.1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {route?.name ?? 'GlobeRide Workout'}
          </div>
        </div>

        {/* ── Divider ─────────────────────────────────────────────────── */}
        <div
          style={{
            margin: `24px ${CARD_PX}px`,
            height: 1,
            background: `linear-gradient(to right, ${CYAN}55, transparent)`,
          }}
        />

        {/* ── 4. Big-six stats grid ─────────────────────────────────── */}
        <div
          style={{
            padding: `0 ${CARD_PX}px`,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '20px 24px',
          }}
        >
          {stats.map((stat) => (
            <StatCell key={stat.label} stat={stat} />
          ))}
        </div>

        {/* ── 5. Date footer + watermark ────────────────────────────── */}
        <div style={{ flex: 1 }} />
        <div
          style={{
            padding: `28px ${CARD_PX}px 48px`,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            borderTop: `1px solid rgba(255,255,255,0.06)`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                fontSize: 14,
                color: MUTED_TEXT,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 500,
              }}
            >
              Completed
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: BRIGHT_TEXT,
              }}
            >
              {rideDate}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: CYAN,
                letterSpacing: '-0.02em',
              }}
            >
              globeride.vercel.app
            </div>
            <div
              style={{
                fontSize: 13,
                color: MUTED_TEXT,
                letterSpacing: '0.04em',
              }}
            >
              Open-source · MIT
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── StatCell sub-component (inline styles — no Tailwind in offscreen DOM) ───

function StatCell({ stat }: { stat: StatItem }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: MUTED_TEXT,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
        }}
      >
        {stat.label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: BRIGHT_TEXT,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {stat.value}
        </span>
        {stat.unit && (
          <span
            style={{
              fontSize: 22,
              fontWeight: 500,
              color: MUTED_TEXT,
            }}
          >
            {stat.unit}
          </span>
        )}
      </div>
    </div>
  );
}
