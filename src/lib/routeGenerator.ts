import * as Cesium from 'cesium';
import type { Route } from '@/types';
import { buildRoute } from '@/lib/gpxParser';

/**
 * Synthesize a rideable Route around a chosen lat/lon.
 *
 *   - 'out-and-back': great-circle line in `headingDeg` for `lengthKm/2`, then
 *     reverse — total ride = `lengthKm`.
 *   - 'loop': closed circle of circumference `lengthKm`, centered on the point.
 *
 * If a Cesium TerrainProvider is supplied (and the ion token is valid),
 * elevations are sampled from the real DEM so the trainer reacts to actual
 * terrain. Without one, points stay at 0 m — the route still rides, but the
 * gradient stream will be flat.
 */
export type GeneratedShape = 'out-and-back' | 'loop';

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
}

interface RawPoint {
  lat: number;
  lon: number;
  ele: number;
}

const EARTH_RADIUS_M = 6371008.8;
const SAMPLE_STRIDE_M = 25;

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

  let raw =
    opts.shape === 'out-and-back'
      ? generateOutAndBack(center, lengthM, headingRad)
      : generateLoop(center, lengthM, headingRad);

  if (opts.terrainProvider) {
    try {
      raw = await sampleElevations(raw, opts.terrainProvider);
    } catch {
      // Terrain server hiccup, missing token, etc — fall back to 0 m. The
      // ride still works, just without gradient-driven resistance.
    }
  }

  return buildRoute(opts.name, raw);
}
