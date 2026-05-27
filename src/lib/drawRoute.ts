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
 *
 * ## Higher-level API (Wave 39.B)
 *
 * DrawnWaypoint          — waypoint with optional elevation (lat/lon/ele|null)
 * pointsToWaypoints      — convert plain {lat,lon,ele?} objects → DrawnWaypoints
 * densifyPolyline        — linear-interpolate N extra samples between each pair
 * computeRouteFromWaypoints — build a fully-normalised Route (sync, no network)
 */

import type { Route } from '@/types';
import { buildRoute } from '@/lib/gpxParser';
import { fetchElevations, resamplePolyline, type LatLon } from '@/lib/elevation';
import { snapToCyclingRoads } from '@/lib/routeRouter';
import { haversine } from '@/lib/utils';

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

// ---------------------------------------------------------------------------
// Wave 39.B — higher-level drawing API
// ---------------------------------------------------------------------------

/**
 * A user-placed waypoint. Elevation may be null when the user just clicked
 * (before terrain sampling resolves) or when the caller doesn't supply it.
 */
export interface DrawnWaypoint {
  lat: number;
  lon: number;
  /** Elevation in meters above ellipsoid, or null when not yet resolved. */
  ele: number | null;
}

/**
 * Convert plain lat/lon/ele? objects (e.g. from a JSON import or test
 * fixture) into the DrawnWaypoint shape.
 */
export function pointsToWaypoints(
  points: { lat: number; lon: number; ele?: number }[],
): DrawnWaypoint[] {
  return points.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele ?? null }));
}

/**
 * Densify an ordered list of waypoints by linearly interpolating
 * `samplesPerSegment` extra points between each consecutive pair.
 *
 * Given N waypoints this produces up to N + (N-1)*samplesPerSegment points.
 * Elevation is interpolated linearly when both endpoints have non-null ele;
 * if either end is null the intermediate ele is null.
 *
 * The first and last original waypoints are always preserved exactly.
 */
export function densifyPolyline(
  waypoints: DrawnWaypoint[],
  samplesPerSegment: number,
): DrawnWaypoint[] {
  if (waypoints.length < 2) return waypoints.slice();
  if (samplesPerSegment < 1) return waypoints.slice();

  const out: DrawnWaypoint[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    out.push(a);

    const steps = samplesPerSegment + 1; // +1 because we exclude the endpoint
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const ele =
        a.ele != null && b.ele != null ? a.ele + (b.ele - a.ele) * t : null;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
        ele,
      });
    }
  }

  // Always include the last waypoint.
  out.push(waypoints[waypoints.length - 1]);
  return out;
}

/**
 * Build a fully-normalised Route from an ordered list of DrawnWaypoints.
 *
 * This is the synchronous, no-network counterpart of `buildDrawnRoute`:
 * it expects elevation to already be present (or falls back to 0). It is
 * the function used by tests and by callers that have already resolved
 * terrain elevation via Cesium or OpenTopoData.
 *
 * Computes totalDistance (haversine), ascent, descent, and min/max
 * elevation identically to `buildRoute` in gpxParser.ts.
 */
export function computeRouteFromWaypoints(
  name: string,
  waypoints: DrawnWaypoint[],
): Route {
  const raw = waypoints.map((w) => ({
    lat: w.lat,
    lon: w.lon,
    ele: w.ele ?? 0,
  }));
  return buildRoute(name, raw);
}

// Re-export haversine so tests / callers can verify distances without a
// separate import. Not part of the public contract — internal use only.
export { haversine as _haversine };
