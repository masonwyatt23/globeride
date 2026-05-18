import type { Route } from '@/types';
import { clamp } from '@/lib/utils';

/**
 * Compute the instantaneous gradient (% slope) at a given cumulative distance
 * along the route, averaged across a smoothing window. Sampling a narrow
 * window jitters wildly on noisy GPS elevation data; a 30-50 m window has
 * been shown to track real-world trainer behavior well.
 */
export function gradientAt(route: Route, distance: number, windowMeters = 40): number {
  const half = windowMeters / 2;
  const total = route.totalDistance;
  const d0 = clamp(distance - half, 0, total);
  const d1 = clamp(distance + half, 0, total);
  if (d1 - d0 < 1) return 0;
  const e0 = elevationAt(route, d0);
  const e1 = elevationAt(route, d1);
  const slope = (e1 - e0) / (d1 - d0);
  // Clamp to ±25% — beyond that is almost always GPS noise / a smart-trainer
  // limit that simulators apply for safety.
  return clamp(slope * 100, -25, 25);
}

/** Linearly-interpolated elevation at a cumulative distance. */
export function elevationAt(route: Route, distance: number): number {
  const pts = route.points;
  const d = clamp(distance, 0, route.totalDistance);
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].distance <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[Math.min(lo + 1, pts.length - 1)];
  const span = b.distance - a.distance;
  if (span === 0) return a.ele;
  const t = (d - a.distance) / span;
  return a.ele + (b.ele - a.ele) * t;
}

/** Exponential moving average — used to soften last-second grade jumps before sending to the trainer. */
export class EmaSmoother {
  private value: number | null = null;
  constructor(private readonly alpha: number) {}
  push(x: number): number {
    if (this.value === null) this.value = x;
    else this.value = this.alpha * x + (1 - this.alpha) * this.value;
    return this.value;
  }
  reset(): void {
    this.value = null;
  }
}
