import type { Route } from '@/types';
import { buildRoute } from '@/lib/gpxParser';

/**
 * Synthesize a Route from a parametric loop. Used for the built-in demos so
 * first-time users have something to ride immediately.
 */
function syntheticLoop(opts: {
  name: string;
  lat0: number;
  lon0: number;
  ele0: number;
  /** Loop radius in degrees (~111 km / deg). */
  radius?: number;
  /** Latitudinal squash for a teardrop shape. */
  squash?: number;
  /** Peak climb in meters over the first half. */
  climb?: number;
  /** Short steep ramp height layered onto the climb. */
  ramp?: number;
  /** Number of sample points along the loop. */
  points?: number;
}): Route {
  const {
    name,
    lat0,
    lon0,
    ele0,
    radius = 0.006,
    squash = 0.62,
    climb = 130,
    ramp = 0,
    points = 220,
  } = opts;

  const raw: { lat: number; lon: number; ele: number }[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const theta = t * Math.PI * 2;
    const r = radius + radius * 0.25 * Math.sin(theta * 3);
    const lon = lon0 + r * Math.cos(theta);
    const lat = lat0 + r * Math.sin(theta) * squash;
    const climbNow = Math.sin(t * Math.PI) * climb;
    const rampNow = ramp > 0 && t > 0.35 && t < 0.5 ? (t - 0.35) * (ramp / 0.15) : 0;
    raw.push({ lat, lon, ele: ele0 + climbNow + rampNow });
  }

  return buildRoute(name, raw);
}

/**
 * The built-in Lauterbrunnen loop. Kept exported as the original `makeDemoRoute`
 * so existing one-click "Load demo" callers keep working.
 */
export function makeDemoRoute(): Route {
  return syntheticLoop({
    name: 'Demo · Lauterbrunnen Loop',
    lat0: 46.5891,
    lon0: 7.9085,
    ele0: 800,
    climb: 130,
    ramp: 30,
  });
}

/**
 * A small catalogue of synthetic sample routes seeded into the library on
 * first launch. Each one picks dramatic terrain so OSM Buildings + world
 * terrain look great.
 */
export interface SampleRouteSeed {
  /** Stable id so we don't double-seed across reloads. */
  id: string;
  make: () => Route;
}

export const SAMPLE_ROUTES: SampleRouteSeed[] = [
  {
    id: 'sample-lauterbrunnen',
    make: () => ({
      ...syntheticLoop({
        name: 'Sample · Lauterbrunnen Loop (CH)',
        lat0: 46.5891,
        lon0: 7.9085,
        ele0: 800,
        climb: 130,
        ramp: 30,
      }),
      id: 'sample-lauterbrunnen',
    }),
  },
  {
    id: 'sample-stelvio',
    make: () => ({
      ...syntheticLoop({
        name: 'Sample · Stelvio Switchbacks (IT)',
        lat0: 46.5286,
        lon0: 10.4541,
        ele0: 1800,
        radius: 0.004,
        squash: 0.75,
        climb: 480,
        ramp: 80,
        points: 320,
      }),
      id: 'sample-stelvio',
    }),
  },
  {
    id: 'sample-pch',
    make: () => ({
      ...syntheticLoop({
        name: 'Sample · Pacific Coast (US)',
        lat0: 36.5394,
        lon0: -121.929,
        ele0: 60,
        radius: 0.012,
        squash: 0.45,
        climb: 110,
        ramp: 0,
        points: 260,
      }),
      id: 'sample-pch',
    }),
  },
];
