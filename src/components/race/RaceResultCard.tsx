/**
 * RaceResultCard — Zwift-style post-race share image generator.
 *
 * Renders a hidden 1080×1350 (Instagram-story) card DOM node and captures
 * it as a PNG via html-to-image when the user clicks "Download result card".
 *
 * Layout (top → bottom):
 *   1. Header   — 🏁 GLOBERIDE RACES overline + race name large + organiser small
 *   2. Hero     — placement ordinal huge + finish time medium
 *   3. Route SVG — 2D route map at card width (projection cloned from ShareCard)
 *   4. Stats    — Distance · Ascent · Avg Power · w/kg
 *   5. Rider    — rider name + date chip
 *   6. Footer   — watermark + signature hash chip
 *
 * Mirrors the exact offscreen-render + toPng + <a>.click() pattern in ShareCard.tsx.
 */

import { useRef, useState, useMemo } from 'react';
import { toPng } from 'html-to-image';
import { Download, Flag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatDuration, formatDistance } from '@/lib/utils';
import type { RoutePoint } from '@/types';
import type { RaceManifest, RaceResult } from '@/lib/race/raceProtocol';

// ─── Card-local prop extensions ──────────────────────────────────────────────
// RaceResultCard needs two fields the core protocol types don't carry:
//   • RaceManifest doesn't include the resolved route polyline (uses routeRef
//     instead), so we extend it for the card's map preview.
//   • RaceResult doesn't include distanceM (the protocol records finishTimeMs
//     and totalAscentM; distance is derived by the caller from the route).
export interface RaceCardManifest extends RaceManifest {
  /** Route points for the 2D map — may be absent before the route resolves. */
  points?: RoutePoint[];
}

export interface RaceCardResult extends Omit<RaceResult, 'signature'> {
  /** Total distance in meters — provided by the caller from the route. */
  distanceM?: number;
  /**
   * HMAC-SHA-256 signature — optional for the card because the component
   * only renders the rideHash chip; callers may pass a pre-signed result or
   * an unsigned preview result.
   */
  signature?: string;
}

// ─── Card dimensions ──────────────────────────────────────────────────────────

const CARD_W = 1080;
const CARD_H = 1350;
const CARD_PX = 72;
const MAP_H = 380;
const MAP_PAD = 20;

// ─── Colour constants (match app dark theme, same as ShareCard) ───────────────

const CYAN        = '#22d3ee';
const DARK_BG     = '#070d1a';
const CARD_BG     = '#0d1626';
const MUTED_TEXT  = '#64748b';
const BRIGHT_TEXT = '#f1f5f9';
const ACCENT_GLOW = 'rgba(34,211,238,0.18)';
const GOLD        = '#fbbf24';   // placement accent for podium

// ─── Placement helpers ────────────────────────────────────────────────────────

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}

function placementColor(placement: number | undefined): string {
  if (!placement) return MUTED_TEXT;
  if (placement === 1) return GOLD;
  if (placement === 2) return '#e2e8f0'; // silver
  if (placement === 3) return '#cd7c3a'; // bronze
  return CYAN;
}

// ─── Projection helpers (cloned from ShareCard / Minimap) ─────────────────────

interface Bounds {
  minLat: number; maxLat: number;
  minLon: number; maxLon: number;
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
  lat: number, lon: number,
  bounds: Bounds,
  drawW: number, drawH: number, pad: number,
): [number, number] {
  const cosLat = Math.cos((bounds.midLat * Math.PI) / 180);
  const dLat = bounds.maxLat - bounds.minLat || 1e-6;
  const dLon = (bounds.maxLon - bounds.minLon) * cosLat || 1e-6;

  const nx = ((lon - bounds.minLon) * cosLat) / dLon;
  const ny = 1 - (lat - bounds.minLat) / dLat;

  const scale = Math.min(drawW, drawH);
  const offX  = (drawW - scale) / 2;
  const offY  = (drawH - scale) / 2;

  return [pad + offX + nx * scale, pad + offY + ny * scale];
}

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

function buildMapPath(points: RoutePoint[]): { pathD: string } {
  const pts    = downsample(points, 600);
  const bounds = routeBounds(pts);
  const drawW  = CARD_W - CARD_PX * 2 - MAP_PAD * 2;
  const drawH  = MAP_H - MAP_PAD * 2;

  const coords = pts.map((p) =>
    projectPoint(p.lat, p.lon, bounds, drawW, drawH, MAP_PAD),
  );

  const pathD = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  return { pathD };
}

// ─── Signature hash chip ──────────────────────────────────────────────────────

function truncateHash(hash: string, len = 12): string {
  if (hash.length <= len) return hash;
  return hash.slice(0, 6) + '…' + hash.slice(-4);
}

// ─── Sub-component: stat cell ─────────────────────────────────────────────────

interface StatItem { label: string; value: string; unit?: string }

function StatCell({ stat }: { stat: StatItem }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: MUTED_TEXT,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
        }}
      >
        {stat.label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 42,
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
          <span style={{ fontSize: 18, fontWeight: 500, color: MUTED_TEXT }}>
            {stat.unit}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface RaceResultCardProps {
  race: RaceCardManifest;
  result: RaceCardResult;
  placement?: number;
}

/**
 * RaceResultCard — renders a hidden share card and a visible Download button.
 *
 * Mount alongside the race finish UI (e.g. in a RaceFinishCard or modal).
 * The component is entirely self-contained; no store access required.
 */
export function RaceResultCard({ race, result, placement }: RaceResultCardProps) {
  const cardRef    = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  // ── Derived display values ────────────────────────────────────────────────

  const finishTimeSec  = result.finishTimeMs / 1000;
  const finishTimeStr  = formatDuration(finishTimeSec);
  const distanceStr    = result.distanceM != null ? formatDistance(result.distanceM) : '—';
  const ascentStr      = `${Math.round(result.totalAscentM)} m`;

  const avgPower = result.avgPowerW;
  const wkg =
    avgPower && result.rider.weightKg
      ? (avgPower / result.rider.weightKg).toFixed(2)
      : null;

  const raceDate = new Date(result.recordedAt).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const ordinal     = placement ? `${placement}${ordinalSuffix(placement)}` : '—';
  const pColor      = placementColor(placement);
  const isPodium    = placement != null && placement <= 3;

  // ── 2D map ────────────────────────────────────────────────────────────────

  const mapData = useMemo(
    () => (race.points && race.points.length > 1 ? buildMapPath(race.points) : null),
    [race.points],
  );

  // ── Stats grid ────────────────────────────────────────────────────────────

  const stats = useMemo((): StatItem[] => {
    const items: StatItem[] = [
      { label: 'Distance',  value: distanceStr },
      { label: 'Ascent',    value: ascentStr },
      { label: 'Avg Power', value: avgPower ? `${Math.round(avgPower)}` : '—', unit: avgPower ? 'W' : undefined },
      { label: 'w/kg',      value: wkg ?? '—' },
    ];
    return items;
  }, [distanceStr, ascentStr, avgPower, wkg]);

  // ── Download handler ──────────────────────────────────────────────────────

  async function handleDownload() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        width: CARD_W,
        height: CARD_H,
        pixelRatio: 1,
        fontEmbedCSS: '',
        filter: () => true,
      });

      const slug = race.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const date = new Date(result.recordedAt).toISOString().slice(0, 10);

      const link = document.createElement('a');
      link.download = `globeride-race-${slug}-${date}.png`;
      link.href     = dataUrl;
      link.click();
    } catch (err) {
      console.error('[RaceResultCard] toPng failed:', err);
    } finally {
      setBusy(false);
    }
  }

  const mapW = CARD_W - CARD_PX * 2;

  return (
    <>
      {/* ── Visible trigger button ──────────────────────────────────────── */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={busy}
        className="gap-2"
        aria-label="Download race result card as PNG"
      >
        {busy ? (
          <>
            <Flag className="h-4 w-4 animate-spin" aria-hidden="true" />
            Capturing…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download result card
          </>
        )}
      </Button>

      {/* ── Offscreen race card ─────────────────────────────────────────── */}
      {/* position:fixed off-viewport: renderable without layout reflow    */}
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

        {/* ── 1. HEADER ────────────────────────────────────────────────── */}
        <div
          style={{
            padding: `48px ${CARD_PX}px 32px`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            borderBottom: `1px solid rgba(255,255,255,0.07)`,
            background: `linear-gradient(180deg, rgba(34,211,238,0.06) 0%, transparent 100%)`,
          }}
        >
          {/* Overline */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {/* Checkered flag icon mark */}
            <svg width={38} height={38} viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx={19} cy={19} r={17} stroke={CYAN} strokeWidth={2} />
              {/* flag pole */}
              <line x1={11} y1={9} x2={11} y2={30} stroke={CYAN} strokeWidth={2} strokeLinecap="round"/>
              {/* flag body — 2×2 checkerboard */}
              <rect x={11} y={9}  width={5} height={5} fill={BRIGHT_TEXT} />
              <rect x={16} y={9}  width={5} height={5} fill={CYAN} opacity={0.8} />
              <rect x={21} y={9}  width={5} height={5} fill={BRIGHT_TEXT} />
              <rect x={11} y={14} width={5} height={5} fill={CYAN} opacity={0.8} />
              <rect x={16} y={14} width={5} height={5} fill={BRIGHT_TEXT} />
              <rect x={21} y={14} width={5} height={5} fill={CYAN} opacity={0.8} />
            </svg>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: CYAN,
              }}
            >
              GlobeRide Races
            </div>
          </div>

          {/* Race name */}
          <div
            style={{
              fontSize: 58,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              color: BRIGHT_TEXT,
              lineHeight: 1.05,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {race.name}
          </div>

          {/* Organiser */}
          {race.organiser && (
            <div
              style={{
                fontSize: 20,
                color: MUTED_TEXT,
                fontWeight: 500,
              }}
            >
              Organised by {race.organiser.name}
            </div>
          )}
        </div>

        {/* ── 2. HERO — placement + finish time ───────────────────────── */}
        <div
          style={{
            padding: `36px ${CARD_PX}px 24px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
          }}
        >
          {/* Placement number */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: MUTED_TEXT,
              }}
            >
              Finish position
            </div>
            <div
              style={{
                fontSize: 140,
                fontWeight: 900,
                letterSpacing: '-0.06em',
                color: pColor,
                lineHeight: 0.9,
                fontVariantNumeric: 'tabular-nums',
                // Podium glow
                ...(isPodium ? {
                  textShadow: `0 0 60px ${pColor}88, 0 0 120px ${pColor}44`,
                } : {}),
              }}
            >
              {ordinal}
            </div>
          </div>

          {/* Finish time */}
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
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: MUTED_TEXT,
              }}
            >
              Finish time
            </div>
            <div
              style={{
                fontSize: 72,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                color: BRIGHT_TEXT,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {finishTimeStr}
            </div>
          </div>
        </div>

        {/* Cyan divider */}
        <div
          style={{
            margin: `0 ${CARD_PX}px`,
            height: 1,
            background: `linear-gradient(to right, ${CYAN}66, transparent)`,
          }}
        />

        {/* ── 3. ROUTE SVG MAP ────────────────────────────────────────── */}
        <div
          style={{
            padding: `24px ${CARD_PX}px 8px`,
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
            {mapData ? (
              <svg
                width={mapW}
                height={MAP_H}
                viewBox={`0 0 ${mapW} ${MAP_H}`}
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block' }}
              >
                <defs>
                  {/* Glow filter */}
                  <filter id="rrc-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  {/* Soft vignette */}
                  <radialGradient id="rrc-vignette" cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="100%" stopColor="rgba(7,13,26,0.55)" />
                  </radialGradient>
                </defs>

                {/* Glow halo */}
                <path
                  d={mapData.pathD}
                  fill="none"
                  stroke={pColor}
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.15}
                  filter="url(#rrc-glow)"
                />
                {/* Route line — tinted with placement colour */}
                <path
                  d={mapData.pathD}
                  fill="none"
                  stroke={pColor}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.9}
                />
                {/* Vignette */}
                <rect x={0} y={0} width={mapW} height={MAP_H}
                  fill="url(#rrc-vignette)" pointerEvents="none" />
              </svg>
            ) : (
              <div
                style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: MUTED_TEXT, fontSize: 20,
                }}
              >
                {race.name}
              </div>
            )}
          </div>
        </div>

        {/* ── 4. STATS GRID ───────────────────────────────────────────── */}
        <div
          style={{
            padding: `20px ${CARD_PX}px 0`,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '14px 16px',
          }}
        >
          {stats.map((stat) => (
            <StatCell key={stat.label} stat={stat} />
          ))}
        </div>

        {/* ── 5. RIDER NAME + DATE ─────────────────────────────────────── */}
        <div
          style={{
            padding: `20px ${CARD_PX}px 0`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 12, color: MUTED_TEXT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Rider
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: BRIGHT_TEXT, letterSpacing: '-0.025em' }}>
              {result.rider.name || 'Anonymous'}
            </div>
          </div>
          <div
            style={{
              background: 'rgba(34,211,238,0.08)',
              border: `1px solid rgba(34,211,238,0.22)`,
              borderRadius: 10,
              padding: '8px 18px',
              fontSize: 16,
              fontWeight: 600,
              color: CYAN,
            }}
          >
            {raceDate}
          </div>
        </div>

        {/* ── 6. FOOTER: watermark + signature hash chip ───────────────── */}
        <div style={{ flex: 1 }} />
        <div
          style={{
            padding: `20px ${CARD_PX}px 44px`,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            borderTop: `1px solid rgba(255,255,255,0.06)`,
          }}
        >
          {/* Watermark */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: CYAN, letterSpacing: '-0.02em' }}>
              globeride.vercel.app
            </div>
            <div style={{ fontSize: 12, color: MUTED_TEXT, letterSpacing: '0.04em' }}>
              Open peer-to-peer races
            </div>
          </div>

          {/* Signature hash chip */}
          {result.rideHash && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 3,
              }}
            >
              <div style={{ fontSize: 11, color: MUTED_TEXT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Verified result
              </div>
              <div
                style={{
                  background: 'rgba(34,211,238,0.07)',
                  border: `1px solid rgba(34,211,238,0.2)`,
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: CYAN,
                  fontFamily: '"Courier New", Courier, monospace',
                  letterSpacing: '0.04em',
                }}
              >
                #{truncateHash(result.rideHash)}
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
