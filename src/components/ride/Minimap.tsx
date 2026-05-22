import { useMemo } from 'react';
import { MapPin } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { sampleRouteAtDistance } from '@/lib/gpxParser';
import { cn } from '@/lib/utils';
import type { Route, RoutePoint } from '@/types';

// ─── constants ───────────────────────────────────────────────────────────────

/** Width / height of the panel in px (CSS). The SVG fills this square. */
const SIZE = 176;

/** Padding inside the SVG viewport so strokes aren't clipped at edges. */
const PAD = 10;

/** How many route points we draw. Downsample long routes for perf. */
const MAX_DRAW_PTS = 400;

// ─── projection helpers ──────────────────────────────────────────────────────

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  midLat: number; // for equirectangular cos-correction
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

/**
 * Project a lat/lon point to SVG coordinates in [PAD, SIZE-PAD].
 * Equirectangular with cos-correction to preserve aspect ratio.
 */
function project(
  lat: number,
  lon: number,
  bounds: Bounds,
  drawW: number,
  drawH: number,
): [number, number] {
  const cosLat = Math.cos((bounds.midLat * Math.PI) / 180);
  const dLat = bounds.maxLat - bounds.minLat || 1e-6;
  const dLon = (bounds.maxLon - bounds.minLon) * cosLat || 1e-6;

  // Normalise to [0,1]; flip lat (SVG y increases downward).
  const nx = (lon - bounds.minLon) * cosLat / dLon;
  const ny = 1 - (lat - bounds.minLat) / dLat;

  // Fit into the draw area maintaining aspect ratio, centred.
  const scale = Math.min(drawW, drawH);
  const offX = (drawW - scale) / 2;
  const offY = (drawH - scale) / 2;

  return [PAD + offX + nx * scale, PAD + offY + ny * scale];
}

// ─── downsampler ─────────────────────────────────────────────────────────────

/** Evenly downsample an array to at most `max` entries (keeps first + last). */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.round(i * step)]);
  }
  return out;
}

// ─── derived SVG path strings ────────────────────────────────────────────────

interface PathData {
  fullPath: string;     // entire route outline
  donePath: string;     // completed segment
  remainPath: string;   // remaining segment
  bounds: Bounds;
  /** Project any lat/lon into SVG space using the computed bounds. */
  project: (lat: number, lon: number) => [number, number];
  firstPt: [number, number];
  lastPt: [number, number];
}

function buildPathData(route: Route, riderDistanceM: number): PathData {
  const bounds = routeBounds(route.points);
  const drawW = SIZE - PAD * 2;
  const drawH = SIZE - PAD * 2;

  const proj = (lat: number, lon: number) =>
    project(lat, lon, bounds, drawW, drawH);

  const pts = downsample(route.points, MAX_DRAW_PTS);

  // Build SVG polyline string for all points.
  const toSvgD = (pts: RoutePoint[]) =>
    pts.map((p, i) => {
      const [x, y] = proj(p.lat, p.lon);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

  const fullPath = toSvgD(pts);

  // Split into done / remaining by distance.
  const progress = route.totalDistance > 0
    ? Math.min(1, riderDistanceM / route.totalDistance)
    : 0;
  const splitIdx = Math.round(progress * (pts.length - 1));

  const donePath  = pts.length > 1 ? toSvgD(pts.slice(0, splitIdx + 1)) : '';
  const remainPath = pts.length > 1 ? toSvgD(pts.slice(splitIdx)) : '';

  const [fx, fy] = proj(pts[0].lat, pts[0].lon);
  const [lx, ly] = proj(pts[pts.length - 1].lat, pts[pts.length - 1].lon);

  return {
    fullPath,
    donePath,
    remainPath,
    bounds,
    project: proj,
    firstPt: [fx, fy],
    lastPt: [lx, ly],
  };
}

// ─── Minimap component ───────────────────────────────────────────────────────

/**
 * Minimap — a compact top-down 2-D schematic of the loaded route.
 *
 * Shows:
 *   • The full route as a dim track outline.
 *   • The completed portion in solid cyan.
 *   • The remaining portion in subdued white/gray.
 *   • Start (green dot) and finish (flag) markers.
 *   • A pulsing cyan dot for the rider's live position.
 *
 * Reads from `useRideStore` directly; no props required.
 * Renders nothing when no route is loaded.
 *
 * Mount anywhere in the Ride overlay, e.g. bottom-right corner.
 */
export function Minimap({ className }: { className?: string }) {
  const route    = useRideStore((s) => s.route);
  const distance = useRideStore((s) => s.distance);

  // One buildPathData call per distance change — covers done/remaining split,
  // rider position, and start/finish markers all at once.
  const splitData = useMemo(
    () => (route ? buildPathData(route, distance) : null),
    [route, distance],
  );

  if (!route || !splitData) {
    return null;
  }

  // Rider SVG position derived from the already-computed split data.
  const pt = sampleRouteAtDistance(route, distance);
  const [rx, ry] = splitData.project(pt.lat, pt.lon);
  const [fx, fy] = splitData.firstPt;
  const [lx, ly] = splitData.lastPt;

  return (
    <div
      className={cn(
        'glass glass-hairline rounded-2xl overflow-hidden select-none',
        className,
      )}
      style={{ width: SIZE, height: SIZE }}
      aria-label="Route minimap"
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block"
        style={{ shapeRendering: 'geometricPrecision' }}
      >
        {/* ── Background vignette ─────────────────────────────────────── */}
        <defs>
          <style>{`@keyframes mm-pulse{0%{opacity:.6;r:5}70%{opacity:0;r:11}100%{opacity:0;r:11}}`}</style>
          <radialGradient id="mm-vignette" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </radialGradient>

          {/* Glow filter for the rider dot */}
          <filter id="mm-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Clip to the panel bounds */}
          <clipPath id="mm-clip">
            <rect x={0} y={0} width={SIZE} height={SIZE} rx={16} />
          </clipPath>
        </defs>

        <g clipPath="url(#mm-clip)">
          {/* ── Remaining route (dim) ─────────────────────────────────── */}
          {splitData.remainPath && (
            <path
              d={splitData.remainPath}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* ── Completed route (cyan) ────────────────────────────────── */}
          {splitData.donePath && (
            <path
              d={splitData.donePath}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          )}

          {/* ── Vignette overlay ─────────────────────────────────────── */}
          <rect
            x={0} y={0} width={SIZE} height={SIZE}
            fill="url(#mm-vignette)"
            pointerEvents="none"
          />

          {/* ── Finish marker (hollow square flag) ───────────────────── */}
          <g transform={`translate(${lx},${ly})`}>
            <circle r={5} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
            <rect x={-2} y={-6} width={2} height={7} fill="rgba(255,255,255,0.8)" rx={0.5} />
            <rect x={0} y={-6} width={4} height={3} fill="rgba(255,255,255,0.8)" rx={0.5} />
          </g>

          {/* ── Start marker (green dot) ─────────────────────────────── */}
          <circle
            cx={fx} cy={fy}
            r={4}
            fill="#34d399"
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={1}
            opacity={0.9}
          />

          {/* ── Rider group — translate moves both dot + pulse ring together. */}
          {/* SVG cx/cy CSS transitions are unreliable; transform translate is universal. */}
          <g
            transform={`translate(${rx},${ry})`}
            style={{ transition: 'transform 0.15s linear' }}
          >
            {/* Pulse ring — pure CSS animation via keyframes defined below */}
            <circle
              r={7}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={1.5}
              style={{ animation: 'mm-pulse 1.8s ease-out infinite' }}
            />
            {/* Solid rider dot */}
            <circle
              r={5}
              fill="#22d3ee"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={1.5}
              filter="url(#mm-glow)"
            />
          </g>
        </g>
      </svg>

      {/* ── Label strip ────────────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 px-2.5 py-1.5 flex items-center gap-1.5"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      >
        <MapPin className="h-2.5 w-2.5 text-cyan-400 shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-cyan-300/80 font-semibold truncate leading-none">
          {route.name}
        </span>
      </div>
    </div>
  );
}
