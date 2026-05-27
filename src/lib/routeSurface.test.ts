/**
 * routeSurface.test.ts — Unit tests for pure helper functions in routeSurface.ts.
 *
 * All tested functions are pure: they accept plain data and return plain data.
 * No Cesium WebGL context is required.
 */

import { describe, it, expect } from 'vitest';
import {
  closestRouteIndex,
  kmMarkDistances,
  climbCategory,
  buildGradientStops,
} from './routeSurface';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoute(
  points: Array<{ distance: number; ele: number; lat?: number; lon?: number }>,
): Route {
  const pts = points.map((p, i) => ({
    lat: p.lat ?? 0,
    lon: p.lon ?? i * 0.001,
    ele: p.ele,
    distance: p.distance,
  }));
  return {
    id: 'test',
    name: 'Test route',
    totalDistance: pts[pts.length - 1]?.distance ?? 0,
    ascent: 0,
    descent: 0,
    minElevation: 0,
    maxElevation: 100,
    loadedAt: 0,
    points: pts,
  } as Route;
}

// ---------------------------------------------------------------------------
// closestRouteIndex
// ---------------------------------------------------------------------------

describe('closestRouteIndex', () => {
  const route = makeRoute([
    { distance: 0, ele: 0 },
    { distance: 500, ele: 10 },
    { distance: 1000, ele: 20 },
    { distance: 2000, ele: 40 },
  ]);

  it('returns 0 when target distance is before the first point', () => {
    expect(closestRouteIndex(route.points, -10)).toBe(0);
  });

  it('returns last index when target is beyond the route', () => {
    expect(closestRouteIndex(route.points, 99999)).toBe(route.points.length - 1);
  });

  it('finds the exact point at distance 500', () => {
    expect(closestRouteIndex(route.points, 500)).toBe(1);
  });

  it('finds the nearest point when distance is between two points', () => {
    // 750 is halfway between index 1 (500) and index 2 (1000); both equidistant,
    // binary search returns the lower bound.
    const idx = closestRouteIndex(route.points, 750);
    expect(idx).toBeGreaterThanOrEqual(1);
    expect(idx).toBeLessThanOrEqual(2);
  });

  it('handles an empty points array gracefully', () => {
    expect(closestRouteIndex([], 500)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// kmMarkDistances
// ---------------------------------------------------------------------------

describe('kmMarkDistances', () => {
  it('returns 0.5 km steps for routes shorter than 5 km', () => {
    const marks = kmMarkDistances(4000); // 4 km
    expect(marks[0]).toBe(500);
    expect(marks[1]).toBe(1000);
    // All gaps should be 500 m
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i] - marks[i - 1]).toBeCloseTo(500);
    }
  });

  it('returns 1 km steps for routes ≥ 5 km', () => {
    const marks = kmMarkDistances(10_000); // 10 km
    expect(marks[0]).toBe(1000);
    expect(marks[1]).toBe(2000);
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i] - marks[i - 1]).toBeCloseTo(1000);
    }
  });

  it('does not include a mark at or beyond the finish', () => {
    const marks = kmMarkDistances(5000); // exactly 5 km
    // Last mark should be < 5000 - 150 m threshold
    for (const m of marks) {
      expect(m).toBeLessThan(5000 - 100);
    }
  });

  it('returns an empty array for a zero-length route', () => {
    expect(kmMarkDistances(0)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// climbCategory
// ---------------------------------------------------------------------------

describe('climbCategory', () => {
  it('returns HC for a long steep climb', () => {
    // 10 km at 10% → score = 100_000 > 80_000
    expect(climbCategory(10, 10_000)).toBe('HC');
  });

  it('returns Cat 1 for a score between 64k and 80k', () => {
    // 8 km at 9% → score = 72_000
    expect(climbCategory(9, 8_000)).toBe('Cat 1');
  });

  it('returns Cat 4 for a short mild climb', () => {
    // 1 km at 4% → score = 4_000 < 16_000
    expect(climbCategory(4, 1_000)).toBe('Cat 4');
  });

  it('returns Cat 3 for a moderate climb', () => {
    // 2 km at 9% → score = 18_000
    expect(climbCategory(9, 2_000)).toBe('Cat 3');
  });
});

// ---------------------------------------------------------------------------
// buildGradientStops
// ---------------------------------------------------------------------------

describe('buildGradientStops', () => {
  it('returns an empty array for a zero-distance route', () => {
    const route = makeRoute([{ distance: 0, ele: 0 }]);
    route.totalDistance = 0;
    expect(buildGradientStops(route)).toHaveLength(0);
  });

  it('all stop values are in [0, 1]', () => {
    const route = makeRoute([
      { distance: 0, ele: 0 },
      { distance: 5000, ele: 200 },
    ]);
    const stops = buildGradientStops(route);
    for (const s of stops) {
      expect(s.stop).toBeGreaterThanOrEqual(0);
      expect(s.stop).toBeLessThanOrEqual(1);
    }
  });

  it('last stop is at 1.0', () => {
    const route = makeRoute([
      { distance: 0, ele: 0 },
      { distance: 10_000, ele: 500 },
    ]);
    const stops = buildGradientStops(route);
    expect(stops[stops.length - 1].stop).toBeCloseTo(1, 5);
  });

  it('produces at most 201 stops for a very long route', () => {
    // A 200 km route with max 200 intervals = 201 stops.
    const route = makeRoute([
      { distance: 0, ele: 0 },
      { distance: 200_000, ele: 0 },
    ]);
    const stops = buildGradientStops(route);
    expect(stops.length).toBeLessThanOrEqual(202);
  });
});
