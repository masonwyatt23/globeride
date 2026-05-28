import * as Cesium from 'cesium';
import type { Route } from '@/types';
import { buildRoute } from '@/lib/gpxParser';
import { snapToCyclingRoads, OsrmRoutingError, type LatLon } from '@/lib/routeRouter';
import { resamplePolyline } from '@/lib/elevation';

/**
 * Synthesize a rideable Route around a chosen lat/lon.
 *
 *   - 'out-and-back': from the origin, head `headingDeg` for `lengthKm/2`,
 *     then snap that two-point line to real cycling roads via OSRM, and
 *     concatenate the reverse to close the ride.
 *   - 'loop': sample N evenly-spaced points around a circle of circumference
 *     `lengthKm`, snap them to real cycling roads via OSRM as a closed
 *     polyline.
 *
 * When OSRM cannot produce a route (network failure, no road graph nearby,
 * remote/ocean location), throws RouteGenerationError so the caller can
 * surface a friendly message and offer a synthetic-routing fallback.
 *
 * Pass `useSynthetic: true` to skip OSRM entirely and use the great-circle
 * geometry directly — the same legacy behaviour as before. Useful as a
 * user-driven fallback when OSRM has no answer.
 *
 * If a Cesium TerrainProvider is supplied (and the ion token is valid),
 * elevations are sampled from the real DEM so the trainer reacts to actual
 * terrain. Without one, points stay at 0 m — the route still rides, but the
 * gradient stream will be flat.
 */
export type GeneratedShape = 'out-and-back' | 'loop';

/** Discrete phases of generation, for the UI progress indicator. */
export type GenerationPhase = 'routing' | 'elevation' | 'smoothing' | 'done';

export interface GenerateRouteOpts {
  shape: GeneratedShape;
  /** Total ride distance in kilometers. */
  lengthKm: number;
  /** Compass heading in degrees (0 = north). Used as the out-and-back
   *  direction, and as the loop's starting angle. */
  headingDeg?: number;
  /** Human-readable name for the generated Route. */
  name: string;
  /** When present + token valid, real-world elevations are sampled. */
  terrainProvider?: Cesium.TerrainProvider | null;
  /**
   * When true, skip OSRM and generate a great-circle synthetic route. Used
   * as the fallback when the user explicitly opts out of road snapping (e.g.
   * after OSRM returned no_route for a remote location).
   */
  useSynthetic?: boolean;
  /** Phase-by-phase progress callback for the UI. */
  onPhase?: (phase: GenerationPhase) => void;
  /** Optional abort signal to cancel an in-flight generation. */
  signal?: AbortSignal;
}

/** Typed error so the wizard can offer a synthetic-routing fallback. */
export type RouteGenerationCode = 'osrm_no_route' | 'osrm_network' | 'aborted' | 'unknown';

export class RouteGenerationError extends Error {
  readonly code: RouteGenerationCode;
  constructor(message: string, code: RouteGenerationCode) {
    super(message);
    this.name = 'RouteGenerationError';
    this.code = code;
  }
}

interface RawPoint {
  lat: number;
  lon: number;
  ele: number;
}

const EARTH_RADIUS_M = 6371008.8;
const SAMPLE_STRIDE_M = 25;
/** Target spacing after OSRM-snapped polyline resampling. */
const POST_SNAP_SPACING_M = 25;
/** Number of seed waypoints around a loop before OSRM snapping. */
const LOOP_SEED_WAYPOINTS = 8;

/**
 * Great-circle destination: from (lat, lon), travel `distanceM` along
 * `bearingRad` (0 = north, clockwise). Returns degrees.
 */
function destination(
  lat: number,
  lon: number,
  distanceM: number,
  bearingRad: number,
): { lat: number; lon: number } {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const lat1 = lat * toRad;
  const lon1 = lon * toRad;
  const angular = distanceM / EARTH_RADIUS_M;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 * toDeg, lon: ((lon2 * toDeg + 540) % 360) - 180 };
}

function generateOutAndBack(
  center: { lat: number; lon: number },
  lengthM: number,
  bearingRad: number,
): RawPoint[] {
  const halfLen = lengthM / 2;
  const N = Math.max(4, Math.round(halfLen / SAMPLE_STRIDE_M));
  const raw: RawPoint[] = [];

  // Outbound: start → turnaround.
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * halfLen;
    const p = destination(center.lat, center.lon, d, bearingRad);
    raw.push({ ...p, ele: 0 });
  }
  // Return: turnaround → start (skip the duplicate apex point).
  for (let i = N - 1; i >= 0; i--) {
    const d = (i / N) * halfLen;
    const p = destination(center.lat, center.lon, d, bearingRad);
    raw.push({ ...p, ele: 0 });
  }
  return raw;
}

function generateLoop(
  center: { lat: number; lon: number },
  lengthM: number,
  startBearingRad: number,
): RawPoint[] {
  const radius = lengthM / (2 * Math.PI);
  // Sample at the same ~25 m density as out-and-back, with a floor that keeps
  // even tiny loops looking circular.
  const N = Math.max(48, Math.round(lengthM / SAMPLE_STRIDE_M));
  const raw: RawPoint[] = [];
  for (let i = 0; i <= N; i++) {
    const theta = startBearingRad + (i / N) * Math.PI * 2;
    const p = destination(center.lat, center.lon, radius, theta);
    raw.push({ ...p, ele: 0 });
  }
  return raw;
}

/**
 * Build the seed waypoints fed to OSRM for an out-and-back. The first leg is
 * a single segment from origin to turnaround — OSRM will route the bike-
 * friendliest path between them. The return leg is appended by the caller
 * after the OSRM response is parsed (mirrored to keep both directions on
 * the same roads).
 */
export function outAndBackSeedWaypoints(
  center: { lat: number; lon: number },
  lengthM: number,
  bearingRad: number,
): LatLon[] {
  const halfLen = lengthM / 2;
  const turnaround = destination(center.lat, center.lon, halfLen, bearingRad);
  return [
    { lat: center.lat, lon: center.lon },
    { lat: turnaround.lat, lon: turnaround.lon },
  ];
}

/**
 * Build the seed waypoints for a loop. Returns LOOP_SEED_WAYPOINTS evenly-
 * spaced points around the circle, then closes the loop by appending the
 * origin. OSRM will stitch them along real roads.
 */
export function loopSeedWaypoints(
  center: { lat: number; lon: number },
  lengthM: number,
  startBearingRad: number,
): LatLon[] {
  const radius = lengthM / (2 * Math.PI);
  const out: LatLon[] = [];
  for (let i = 0; i < LOOP_SEED_WAYPOINTS; i++) {
    const theta = startBearingRad + (i / LOOP_SEED_WAYPOINTS) * Math.PI * 2;
    const p = destination(center.lat, center.lon, radius, theta);
    out.push({ lat: p.lat, lon: p.lon });
  }
  // Close the loop so OSRM routes back to the first waypoint.
  out.push({ ...out[0] });
  return out;
}

/**
 * Snap a sequence of waypoints to real cycling roads via OSRM. Wraps any
 * routing failure in a typed RouteGenerationError so the wizard can show a
 * meaningful message and offer the synthetic fallback.
 */
async function snapWaypoints(
  waypoints: LatLon[],
  signal?: AbortSignal,
): Promise<LatLon[]> {
  try {
    return await snapToCyclingRoads(waypoints, { signal });
  } catch (err) {
    if (signal?.aborted) {
      throw new RouteGenerationError('Generation aborted', 'aborted');
    }
    if (err instanceof OsrmRoutingError) {
      if (err.code === 'no_route') {
        throw new RouteGenerationError(
          'No bike-friendly roads were found near that location.',
          'osrm_no_route',
        );
      }
      throw new RouteGenerationError(
        'Could not reach the cycling router. Try again or use synthetic routing.',
        'osrm_network',
      );
    }
    throw new RouteGenerationError(
      err instanceof Error ? err.message : 'Routing failed',
      'unknown',
    );
  }
}

async function sampleElevations(
  pts: RawPoint[],
  terrain: Cesium.TerrainProvider,
): Promise<RawPoint[]> {
  const cartos = pts.map((p) => Cesium.Cartographic.fromDegrees(p.lon, p.lat));
  const sampled = await Cesium.sampleTerrainMostDetailed(terrain, cartos);
  return pts.map((p, i) => {
    const h = sampled[i]?.height;
    return { ...p, ele: Number.isFinite(h) ? h : 0 };
  });
}

export async function generateRoute(
  center: { lat: number; lon: number },
  opts: GenerateRouteOpts,
): Promise<Route> {
  const lengthM = Math.max(500, opts.lengthKm * 1000);
  const headingRad = ((opts.headingDeg ?? 0) * Math.PI) / 180;
  const onPhase = opts.onPhase ?? (() => undefined);

  let polyline: LatLon[];

  if (opts.useSynthetic) {
    // Synthetic fallback path: skip OSRM, use the great-circle polyline.
    onPhase('routing');
    polyline = (opts.shape === 'out-and-back'
      ? generateOutAndBack(center, lengthM, headingRad)
      : generateLoop(center, lengthM, headingRad)
    ).map((p) => ({ lat: p.lat, lon: p.lon }));
  } else {
    onPhase('routing');
    const seeds =
      opts.shape === 'out-and-back'
        ? outAndBackSeedWaypoints(center, lengthM, headingRad)
        : loopSeedWaypoints(center, lengthM, headingRad);
    const snapped = await snapWaypoints(seeds, opts.signal);

    if (opts.shape === 'out-and-back') {
      // OSRM gave us the outbound route. Mirror it for the return leg so the
      // rider visits the same roads in reverse — keeps the ride continuous
      // and avoids OSRM picking a different return path on cycle-banned
      // one-ways.
      const reversed = snapped.slice(0, -1).reverse();
      polyline = [...snapped, ...reversed];
    } else {
      polyline = snapped;
    }
  }

  onPhase('smoothing');
  // Resample so gradient calculation stays smooth. OSRM gives us road-vertex
  // density which can be uneven; resamplePolyline guarantees consistent
  // spacing for the downstream gradient/elevation pipeline.
  const dense = resamplePolyline(polyline, POST_SNAP_SPACING_M);

  let raw: RawPoint[] = dense.map((p) => ({ lat: p.lat, lon: p.lon, ele: 0 }));

  if (opts.terrainProvider) {
    onPhase('elevation');
    try {
      raw = await sampleElevations(raw, opts.terrainProvider);
    } catch {
      // Terrain server hiccup, missing token, etc — fall back to 0 m. The
      // ride still works, just without gradient-driven resistance.
    }
  }

  onPhase('done');
  return buildRoute(opts.name, raw);
}
