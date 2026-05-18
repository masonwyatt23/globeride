/**
 * Convert an ordered list of user-clicked lon/lat points (with fetched
 * elevations) into a valid Route that is structurally identical to what
 * gpxParser.ts produces. The rest of the app (CesiumViewer, ride loop,
 * gradient calc, HUD) is unchanged.
 */

import type { Route } from '@/types';
import { buildRoute } from '@/lib/gpxParser';
import { fetchElevations, resamplePolyline, type LatLon } from '@/lib/elevation';

export interface DrawnPoint {
  /** Longitude in degrees. */
  lon: number;
  /** Latitude in degrees. */
  lat: number;
}

/**
 * Build a rideable Route from an ordered list of user-drawn clicks.
 *
 * Steps:
 *   1. Resample the raw polyline to ~30 m spacing so elevation/gradient
 *      sampling is smooth.
 *   2. Fetch real-world elevations from OpenTopoData (fallback: open-elevation).
 *   3. Build the Route through the shared `buildRoute` helper from gpxParser.ts
 *      so cumulative distances, ascent, descent, and min/max elevation are all
 *      computed consistently.
 *
 * @param clicks  At least 2 lon/lat points from user clicks on the globe.
 * @param name    Human-readable label for the route.
 * @param onProgress  Optional callback called with (fetched, total) as
 *                    elevation batches complete — used to drive a loading state.
 */
export async function buildDrawnRoute(
  clicks: DrawnPoint[],
  name: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<Route> {
  if (clicks.length < 2) {
    throw new Error('Need at least 2 points to build a route');
  }

  // 1. Resample to consistent spacing.
  const latLons: LatLon[] = clicks.map((c) => ({ lat: c.lat, lon: c.lon }));
  const resampled = resamplePolyline(latLons, 30);

  onProgress?.(0, resampled.length);

  // 2. Fetch elevations. The elevation module handles batching + throttling.
  const elevations = await fetchElevations(resampled);

  onProgress?.(resampled.length, resampled.length);

  // 3. Assemble the raw array expected by buildRoute.
  const raw = resampled.map((p, i) => ({
    lat: p.lat,
    lon: p.lon,
    ele: elevations[i] ?? 0,
  }));

  return buildRoute(name, raw);
}
