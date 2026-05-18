import { describe, it, expect } from 'vitest';
import { gradientAt, elevationAt, EmaSmoother } from '@/lib/gradientCalculator';
import type { Route } from '@/types';

function mkRoute(pts: { distance: number; ele: number }[]): Route {
  return {
    id: 't',
    name: 't',
    points: pts.map((p) => ({ lat: 0, lon: 0, ele: p.ele, distance: p.distance })),
    totalDistance: pts[pts.length - 1].distance,
    ascent: 0,
    descent: 0,
    minElevation: Math.min(...pts.map((p) => p.ele)),
    maxElevation: Math.max(...pts.map((p) => p.ele)),
    loadedAt: 0,
  };
}

describe('elevationAt', () => {
  const r = mkRoute([
    { distance: 0, ele: 0 },
    { distance: 100, ele: 10 },
    { distance: 200, ele: 10 },
  ]);

  it('linearly interpolates between points', () => {
    expect(elevationAt(r, 0)).toBe(0);
    expect(elevationAt(r, 50)).toBeCloseTo(5, 6);
    expect(elevationAt(r, 100)).toBe(10);
    expect(elevationAt(r, 150)).toBeCloseTo(10, 6);
  });

  it('clamps out-of-range distances to the route ends', () => {
    expect(elevationAt(r, -10)).toBe(0);
    expect(elevationAt(r, 999)).toBe(10);
  });
});

describe('gradientAt', () => {
  it('computes window-averaged slope as a percentage', () => {
    const r = mkRoute([
      { distance: 0, ele: 0 },
      { distance: 100, ele: 10 }, // steady 10% over first 100 m
      { distance: 200, ele: 10 }, // flat
    ]);
    // window 40 m around 50 m: e(30)=3, e(70)=7 → (7-3)/40 = 0.10 → 10 %
    expect(gradientAt(r, 50, 40)).toBeCloseTo(10, 6);
    // flat region
    expect(gradientAt(r, 150, 40)).toBeCloseTo(0, 6);
  });

  it('clamps absurd slopes to ±25 %', () => {
    const up = mkRoute([{ distance: 0, ele: 0 }, { distance: 10, ele: 100 }]);
    const down = mkRoute([{ distance: 0, ele: 100 }, { distance: 10, ele: 0 }]);
    expect(gradientAt(up, 5, 40)).toBe(25);
    expect(gradientAt(down, 5, 40)).toBe(-25);
  });
});

describe('EmaSmoother', () => {
  it('seeds on first sample then exponentially averages', () => {
    const ema = new EmaSmoother(0.5);
    expect(ema.push(10)).toBe(10);
    expect(ema.push(0)).toBe(5); // 0.5*0 + 0.5*10
    expect(ema.push(0)).toBe(2.5); // 0.5*0 + 0.5*5
  });

  it('reset() drops the running value so the next push re-seeds', () => {
    const ema = new EmaSmoother(0.3);
    ema.push(100);
    ema.reset();
    expect(ema.push(7)).toBe(7);
  });
});
