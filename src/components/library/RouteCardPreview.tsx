/**
 * RouteCardPreview — smart wrapper that decides which route preview to show.
 *
 * Decision tree (evaluated on first intersection):
 *   1. IntersectionObserver fires (card enters viewport)
 *   2. Check concurrent scene cap (max 5 active Cesium scenes)
 *   3. Check gates: WebGL + hasSufficientHardware + ionToken present
 *   4. If all pass → lazy-load and mount <RouteCardMiniGlobe />
 *   5. Otherwise  → stay on SVG fallback
 *
 * When a card scrolls away (intersectionRatio < 0.05) the Cesium scene is
 * unmounted so the viewer.destroy() path fires and VRAM is freed.
 *
 * Concurrent scene cap:
 *   A module-level Set tracks all currently mounted mini-globes keyed by
 *   route ID. If 5 are mounted and a 6th card enters the viewport it remains
 *   on the SVG fallback until one of the active scenes unmounts.
 *
 * SVG fallback:
 *   A tiny abstract route polyline generated from the route's points (sampled
 *   down to ~40 points so SVG stays cheap). Provides meaningful shape — not
 *   generic.
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { Route } from '@/types';
import { canRenderCesium } from '@/lib/landingGates';

// ---------------------------------------------------------------------------
// Concurrent scene cap
// ---------------------------------------------------------------------------

/** Hard cap: never mount more than this many Cesium scenes simultaneously. */
const MAX_CONCURRENT_SCENES = 5;

/**
 * Module-level set of currently-mounted scene route IDs.
 * Exported for tests to inspect / reset.
 */
export const _activeMountedScenes = new Set<string>();

/** Attempt to claim a slot for a new scene. Returns true on success. */
export function _tryClaimScene(routeId: string): boolean {
  if (_activeMountedScenes.has(routeId)) return true; // already claimed
  if (_activeMountedScenes.size >= MAX_CONCURRENT_SCENES) return false;
  _activeMountedScenes.add(routeId);
  return true;
}

/** Release a scene slot. Called on unmount. */
export function _releaseScene(routeId: string): void {
  _activeMountedScenes.delete(routeId);
}

// ---------------------------------------------------------------------------
// Lazy Cesium globe
// ---------------------------------------------------------------------------

const LazyMiniGlobe = lazy(() =>
  import('./RouteCardMiniGlobe').then((m) => ({ default: m.RouteCardMiniGlobe })),
);

// ---------------------------------------------------------------------------
// SVG fallback — generates a tiny route-shaped polyline from real points
// ---------------------------------------------------------------------------

interface FallbackSvgProps {
  route: Route;
}

function RouteFallbackSvg({ route }: FallbackSvgProps) {
  const pts = route.points;
  if (pts.length < 2) {
    // Degenerate — plain gradient background.
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
    );
  }

  // Sample ~40 evenly spaced points for the SVG polyline.
  const SAMPLES = 40;
  const step = Math.max(1, Math.floor(pts.length / SAMPLES));
  const sampled: { lat: number; lon: number }[] = [];
  for (let i = 0; i < pts.length; i += step) {
    sampled.push({ lat: pts[i].lat, lon: pts[i].lon });
  }
  // Always include the last point.
  const last = pts[pts.length - 1];
  if (sampled[sampled.length - 1].lon !== last.lon) {
    sampled.push({ lat: last.lat, lon: last.lon });
  }

  // Map lon/lat to SVG coordinate space (200×130).
  const W = 200;
  const H = 130;
  const PAD = 14;

  const lons = sampled.map((p) => p.lon);
  const lats = sampled.map((p) => p.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const lonRange = maxLon - minLon || 1;
  const latRange = maxLat - minLat || 1;

  const toX = (lon: number) => PAD + ((lon - minLon) / lonRange) * (W - 2 * PAD);
  // SVG y-axis is inverted relative to lat (lat increases north = up).
  const toY = (lat: number) => H - PAD - ((lat - minLat) / latRange) * (H - 2 * PAD);

  const pointsStr = sampled
    .map((p) => `${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`)
    .join(' ');

  const gradId = `route-fallback-grad-${route.id}`;

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        aria-hidden="true"
        className="opacity-70"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        {/* Shadow / glow effect under the line */}
        <polyline
          points={pointsStr}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="4"
          strokeOpacity="0.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Main route line */}
        <polyline
          points={pointsStr}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Start dot */}
        <circle
          cx={toX(sampled[0].lon).toFixed(1)}
          cy={toY(sampled[0].lat).toFixed(1)}
          r="3"
          fill="#22d3ee"
          opacity="0.8"
        />
        {/* End dot */}
        <circle
          cx={toX(sampled[sampled.length - 1].lon).toFixed(1)}
          cy={toY(sampled[sampled.length - 1].lat).toFixed(1)}
          r="3"
          fill="#22d3ee"
          opacity="0.8"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RouteCardPreviewProps {
  route: Route;
  /** Ion token resolved once by the parent library component. */
  ionToken: string | null;
  /** Container height. Defaults to 160px. */
  heightPx?: number;
}

// ---------------------------------------------------------------------------
// RouteCardPreview
// ---------------------------------------------------------------------------

/**
 * Debounce threshold in milliseconds. After a card leaves the viewport we
 * wait this long before unmounting — prevents thrashing on rapid scroll.
 */
const UNMOUNT_DEBOUNCE_MS = 400;

export function RouteCardPreview({
  route,
  ionToken,
  heightPx = 160,
}: RouteCardPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we've successfully claimed a scene slot.
  const claimedRef = useRef(false);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const ratio = entries[0]?.intersectionRatio ?? 0;

      if (ratio >= 0.05) {
        // Card entered viewport — cancel any pending unmount.
        if (unmountTimerRef.current !== null) {
          clearTimeout(unmountTimerRef.current);
          unmountTimerRef.current = null;
        }

        // Only mount if gates pass and we haven't already claimed a slot.
        if (!mounted && !claimedRef.current) {
          if (!ionToken) return;
          if (!canRenderCesium()) return;
          if (!_tryClaimScene(route.id)) return; // cap exceeded
          claimedRef.current = true;
          setMounted(true);
        }
      } else {
        // Card left viewport — debounce before unmounting.
        if (mounted && claimedRef.current) {
          if (unmountTimerRef.current === null) {
            unmountTimerRef.current = setTimeout(() => {
              unmountTimerRef.current = null;
              _releaseScene(route.id);
              claimedRef.current = false;
              setMounted(false);
            }, UNMOUNT_DEBOUNCE_MS);
          }
        }
      }
    },
    [mounted, ionToken, route.id],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(handleIntersect, {
      threshold: [0, 0.05, 0.5, 1],
    });
    io.observe(el);

    return () => {
      io.disconnect();
      // On unmount: cancel any pending timer and release slot.
      if (unmountTimerRef.current !== null) {
        clearTimeout(unmountTimerRef.current);
      }
      if (claimedRef.current) {
        _releaseScene(route.id);
        claimedRef.current = false;
      }
    };
  }, [handleIntersect, route.id]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-t-xl bg-slate-900"
      style={{ height: heightPx }}
      aria-label={`Route preview for ${route.name}`}
    >
      {/* SVG fallback — always rendered, Cesium renders on top when mounted */}
      <RouteFallbackSvg route={route} />

      {/* Cesium globe — lazy-loaded, mounted only when gates pass */}
      {mounted && ionToken && (
        <Suspense fallback={null}>
          <LazyMiniGlobe route={route} ionToken={ionToken} />
        </Suspense>
      )}
    </div>
  );
}
