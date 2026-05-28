/**
 * RoutePreview — preview card shown between route generation and commit.
 *
 * Renders a tiny SVG minimap of the actual polyline, plus the headline
 * stats: distance (km), total ascent (m), and an estimated ride time at
 * a conservative 25 km/h average. Two buttons let the user commit the
 * route or re-generate with the same params.
 *
 * Lives in src/components/setup/ so it's used only inside the wizard.
 * Local-first by design — pure presentation, no network calls.
 */

import { useMemo } from 'react';
import { Check, RotateCcw, Mountain, Route as RouteIcon, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Route } from '@/types';

interface RoutePreviewProps {
  route: Route;
  onCommit: () => void;
  onRegenerate: () => void;
  regenerating?: boolean;
}

/** Conservative steady-state average for time estimates. */
const ESTIMATE_AVG_KMH = 25;
/** SVG minimap viewport — keeps a 2:1 aspect that reads well in the panel. */
const MAP_W = 280;
const MAP_H = 140;
const MAP_PAD = 8;

interface MapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Compute the polyline SVG `points` string from route points. Pure so it can
 * be unit-tested in isolation. Returns null when the route is too small
 * to render meaningfully (single point, degenerate bounds).
 */
export function buildMinimapPath(
  route: Route,
  width: number = MAP_W,
  height: number = MAP_H,
  pad: number = MAP_PAD,
): { path: string; bounds: MapBounds } | null {
  if (route.points.length < 2) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of route.points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const dLat = maxLat - minLat;
  const dLon = maxLon - minLon;
  if (dLat === 0 && dLon === 0) return null;

  // Square-out the bounds so the polyline isn't squashed onto a tiny axis.
  // The aspect we render is width:height; pad each axis to match.
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const targetAspect = innerW / innerH;
  // Account for latitude convergence: a degree of longitude shrinks as
  // latitude moves away from the equator. Without this, mid-latitude routes
  // look stretched east-west on the minimap.
  const latMid = (minLat + maxLat) / 2;
  const lonScale = Math.cos((latMid * Math.PI) / 180);
  const dataW = Math.max(1e-9, dLon * lonScale);
  const dataH = Math.max(1e-9, dLat);
  const dataAspect = dataW / dataH;

  let extraLonHalf = 0;
  let extraLatHalf = 0;
  if (dataAspect < targetAspect) {
    // Data is taller than the viewport — pad longitude.
    const desiredDataW = targetAspect * dataH;
    extraLonHalf = (desiredDataW - dataW) / 2 / lonScale;
  } else {
    // Data is wider — pad latitude.
    const desiredDataH = dataW / targetAspect;
    extraLatHalf = (desiredDataH - dataH) / 2;
  }

  const south = minLat - extraLatHalf;
  const north = maxLat + extraLatHalf;
  const west = minLon - extraLonHalf;
  const east = maxLon + extraLonHalf;
  const spanLat = north - south;
  const spanLon = east - west;

  // Subsample very dense polylines for SVG-render performance — a real-roads
  // route can have 1000+ points; 300 is plenty for a thumbnail.
  const stride = Math.max(1, Math.floor(route.points.length / 300));
  const segments: string[] = [];
  for (let i = 0; i < route.points.length; i += stride) {
    const p = route.points[i];
    const x = pad + ((p.lon - west) / spanLon) * innerW;
    const y = pad + (1 - (p.lat - south) / spanLat) * innerH;
    segments.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  // Always include the last point so the polyline closes correctly.
  const last = route.points[route.points.length - 1];
  const lx = pad + ((last.lon - west) / spanLon) * innerW;
  const ly = pad + (1 - (last.lat - south) / spanLat) * innerH;
  segments.push(`${lx.toFixed(1)},${ly.toFixed(1)}`);

  return {
    path: segments.join(' '),
    bounds: { minLat: south, maxLat: north, minLon: west, maxLon: east },
  };
}

/** Format an estimated ride time at a fixed average speed. */
export function estimateRideTime(distanceM: number, avgKmh = ESTIMATE_AVG_KMH): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return '—';
  const hours = distanceM / 1000 / avgKmh;
  const totalMin = Math.round(hours * 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function RoutePreview({ route, onCommit, onRegenerate, regenerating }: RoutePreviewProps) {
  const minimap = useMemo(() => buildMinimapPath(route), [route]);
  const distanceKm = (route.totalDistance / 1000).toFixed(1);
  const ascentM = Math.round(route.ascent);
  const eta = estimateRideTime(route.totalDistance);

  return (
    <div className="rounded-xl border border-border/70 bg-card/55 p-3.5 flex flex-col gap-3 animate-fadeUp">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Preview
          </div>
          <div className="text-sm font-semibold text-foreground truncate" title={route.name}>
            {route.name}
          </div>
        </div>
      </div>

      {/* Minimap */}
      <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
        {minimap ? (
          <svg
            role="img"
            aria-label="Route minimap"
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            className="block w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Subtle backdrop dots for visual context */}
            <defs>
              <pattern id="route-preview-dots" width="12" height="12" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.7" className="fill-foreground/10" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#route-preview-dots)" />
            <polyline
              points={minimap.path}
              fill="none"
              className="stroke-primary"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Start marker */}
            {(() => {
              const head = minimap.path.split(' ')[0]?.split(',');
              if (!head || head.length !== 2) return null;
              return (
                <circle
                  cx={head[0]}
                  cy={head[1]}
                  r={3.5}
                  className="fill-accent stroke-background"
                  strokeWidth={1.5}
                />
              );
            })()}
          </svg>
        ) : (
          <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
            No preview available
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <PreviewStat
          icon={<RouteIcon className="h-3.5 w-3.5" />}
          label="Distance"
          value={`${distanceKm} km`}
        />
        <PreviewStat
          icon={<Mountain className="h-3.5 w-3.5" />}
          label="Ascent"
          value={ascentM > 0 ? `${ascentM} m` : '—'}
        />
        <PreviewStat
          icon={<Timer className="h-3.5 w-3.5" />}
          label={`~${ESTIMATE_AVG_KMH} km/h`}
          value={eta}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="default" onClick={onCommit} className="min-w-[9rem]">
          <Check className="h-4 w-4" />
          Use this route
        </Button>
        <Button variant="outline" onClick={onRegenerate} disabled={regenerating}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}

interface PreviewStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function PreviewStat({ icon, label, value }: PreviewStatProps) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/15 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-sm font-semibold text-foreground num leading-snug truncate">{value}</div>
    </div>
  );
}
