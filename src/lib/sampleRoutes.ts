import type { Route } from '@/types';
import { buildRoute } from '@/lib/gpxParser';

/**
 * Generate a built-in demo route so first-time users have something to ride
 * immediately. We synthesize a 3 km loop in the Swiss Alps with a believable
 * elevation profile (gentle climb, short steep ramp, fast descent).
 */
export function makeDemoRoute(): Route {
  // Start near Lauterbrunnen, Switzerland — dramatic terrain looks great
  // under OSM Buildings + world terrain.
  const lat0 = 46.5891;
  const lon0 = 7.9085;
  const ele0 = 800;

  const N = 220;
  const raw: { lat: number; lon: number; ele: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // A teardrop-shaped loop ~1.2 km across.
    const theta = t * Math.PI * 2;
    const r = 0.006 + 0.0015 * Math.sin(theta * 3);
    const lon = lon0 + r * Math.cos(theta);
    const lat = lat0 + r * Math.sin(theta) * 0.62;
    // Elevation: climb 130 m on first half, descend on second.
    const climb = Math.sin(t * Math.PI) * 130;
    const ramp = t > 0.35 && t < 0.5 ? (t - 0.35) * 200 : 0;
    raw.push({ lat, lon, ele: ele0 + climb + ramp });
  }

  return buildRoute('Demo · Lauterbrunnen Loop', raw);
}
