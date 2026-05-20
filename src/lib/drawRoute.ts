/**
 * Convert an ordered list of user-clicked lon/lat points (with fetched
 * elevations) into a valid Route that is structurally identical to what
 * gpxParser.ts produces. The rest of the app (CesiumViewer, ride loop,
 * gradient calc, HUD) is unchanged.
 *
 * Clicks are first snapped to real cycling roads via OSRM so dragging a
 * couple of pins across a city produces a rideable route along streets
 * and bike paths rather than a straight line through buildings. If OSRM
 * is unreachable (rate-limited / offline / firewalled) we fall back to
 * the raw click polyline — the user always gets a route.
 */

import type { Route } from '@/types';
import { buildRoute } from '@/lib/gpxParser';
import { fetchElevations, resamplePolyline, type LatLon } from '@/lib/elevation';
import { snapToCyclingRoads } from '@/lib/routeRouter';

export interface DrawnPoint {
  /** Longitude in degrees. */
  lon: number;
  /** Latitude in degrees. */
  lat: number;
}

export interface BuildDrawnRouteOptions {
  /**
   * When true (the default), waypoints are snapped to cycling roads via
   * the public OSRM demo server before resampling. Set false to keep the
   * raw great-circle polyline — useful for tests or off-road drawings.
   */
  snapToRoads?: boolean;
  /**
   * Reports elevation-fetch progress as (fetched, total). The current
   * implementation calls it twice (start + finish) but callers should not
   * rely on intermediate ticks.
   */
  onProgress?: (fetched: number, total: number) => void;
  /**
   * Human-readable status string for each pipeline phase. Surfaces the
   * extra OSRM step so the drawer's status text can say "Snapping…"
   * before "Fetching elevation…".
   */
  onStatus?: (phase: 'snapping' | 'elevation' | 'done', message: string) => void;
}

/**
 * Build a rideable Route from an ordered list of user-drawn clicks.
 *
 * Steps:
 *   1. Snap clicks to real cycling roads via OSRM (silent fallback on
 *      failure so we never block on a routing outage).
 *   2. Resample the resulting polyline to ~30 m spacing so elevation /
 *      gradient sampling is smooth.
 *   3. Fetch real-world elevations from OpenTopoData (fallback: open-elevation).
 *   4. Build the Route through the shared `buildRoute` helper from gpxParser.ts
 *      so cumulative distances, ascent, descent and min/max elevation are
 *      all computed consistently.
 *
 * For backwards compatibility the third argument can still be a plain
 * progress callback — existing callers continue to work unchanged.
 */
export async function buildDrawnRoute(
  clicks: DrawnPoint[],
  name: string,
  optsOrProgress?:
    | BuildDrawnRouteOptions
    | ((fetched: number, total: number) => void),
): Promise<Route> {
  if (clicks.length < 2) {
    throw new Error('Need at least 2 points to build a route');
  }

  const opts: BuildDrawnRouteOptions =
    typeof optsOrProgress === 'function' ? { onProgress: optsOrProgress } : optsOrProgress ?? {};
  const { onProgress, onStatus } = opts;
  const snap = opts.snapToRoads !== false;

  const latLons: LatLon[] = clicks.map((c) => ({ lat: c.lat, lon: c.lon }));

  // 1. Snap to real cycling roads. Soft-fails: any OSRM failure logs a
  //    warning and continues with the raw click polyline so the user
  //    always gets a route.
  let waypoints: LatLon[] = latLons;
  if (snap) {
    onStatus?.('snapping', 'Snapping to roads…');
    try {
      waypoints = await snapToCyclingRoads(latLons);
    } catch (err) {
      console.warn('[drawRoute] OSRM road-snap failed, using great-circle path:', err);
    }
  }

  // 2. Resample to consistent spacing for downstream gradient/elevation work.
  const resampled = resamplePolyline(waypoints, 30);

  onStatus?.('elevation', 'Fetching elevation…');
  onProgress?.(0, resampled.length);

  // 3. Fetch elevations. The elevation module handles batching + throttling.
  const elevations = await fetchElevations(resampled);

  onProgress?.(resampled.length, resampled.length);
  onStatus?.('done', 'Route ready');

  // 4. Assemble the raw array expected by buildRoute.
  const raw = resampled.map((p, i) => ({
    lat: p.lat,
    lon: p.lon,
    ele: elevations[i] ?? 0,
  }));

  return buildRoute(name, raw);
}
