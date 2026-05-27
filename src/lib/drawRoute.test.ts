import { describe, it, expect } from 'vitest';
import {
  densifyPolyline,
  computeRouteFromWaypoints,
  pointsToWaypoints,
  type DrawnWaypoint,
} from '@/lib/drawRoute';
import { haversine } from '@/lib/utils';

// ---------------------------------------------------------------------------
// pointsToWaypoints
// ---------------------------------------------------------------------------

describe('pointsToWaypoints', () => {
  it('maps lat/lon and defaults missing ele to null', () => {
    const wps = pointsToWaypoints([
      { lat: 46, lon: 7 },
      { lat: 46.1, lon: 7.1, ele: 500 },
    ]);
    expect(wps).toHaveLength(2);
    expect(wps[0]).toEqual({ lat: 46, lon: 7, ele: null });
    expect(wps[1]).toEqual({ lat: 46.1, lon: 7.1, ele: 500 });
  });

  it('returns empty array for empty input', () => {
    expect(pointsToWaypoints([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// densifyPolyline
// ---------------------------------------------------------------------------

describe('densifyPolyline', () => {
  const a: DrawnWaypoint = { lat: 0, lon: 0, ele: 100 };
  const b: DrawnWaypoint = { lat: 0, lon: 1, ele: 200 };

  it('produces correct sample count for 2 waypoints, N samples per segment', () => {
    const result = densifyPolyline([a, b], 10);
    // 1 original + 10 intermediates + 1 original = 12
    expect(result).toHaveLength(12);
  });

  it('first and last points are preserved exactly', () => {
    const result = densifyPolyline([a, b], 5);
    expect(result[0]).toEqual(a);
    expect(result[result.length - 1]).toEqual(b);
  });

  it('intermediate lat/lon is linearly interpolated', () => {
    const result = densifyPolyline([a, b], 1);
    // [a, midpoint, b] — 3 points total
    expect(result).toHaveLength(3);
    const mid = result[1];
    expect(mid.lat).toBeCloseTo(0, 6);
    expect(mid.lon).toBeCloseTo(0.5, 6);
  });

  it('intermediate elevation is linearly interpolated when both endpoints have ele', () => {
    const result = densifyPolyline([a, b], 1);
    const mid = result[1];
    expect(mid.ele).toBeCloseTo(150, 6); // midpoint of 100..200
  });

  it('intermediate elevation is null when either endpoint ele is null', () => {
    const nullA: DrawnWaypoint = { lat: 0, lon: 0, ele: null };
    const result = densifyPolyline([nullA, b], 1);
    expect(result[1].ele).toBeNull();
  });

  it('returns single-waypoint array unchanged', () => {
    const single: DrawnWaypoint = { lat: 10, lon: 20, ele: 500 };
    expect(densifyPolyline([single], 5)).toEqual([single]);
  });

  it('returns empty array for empty input', () => {
    expect(densifyPolyline([], 5)).toEqual([]);
  });

  it('handles samplesPerSegment=0 — returns original waypoints unchanged', () => {
    const result = densifyPolyline([a, b], 0);
    expect(result).toEqual([a, b]);
  });

  it('multi-segment: total count = N_wps + (N_wps-1)*samplesPerSegment', () => {
    const c: DrawnWaypoint = { lat: 0, lon: 2, ele: 300 };
    const result = densifyPolyline([a, b, c], 3);
    // 3 wps + 2 segments * 3 intermediates = 3 + 6 = 9
    expect(result).toHaveLength(9);
  });
});

// ---------------------------------------------------------------------------
// computeRouteFromWaypoints
// ---------------------------------------------------------------------------

describe('computeRouteFromWaypoints', () => {
  it('computes totalDistance via haversine', () => {
    const wps: DrawnWaypoint[] = [
      { lat: 0, lon: 0, ele: 0 },
      { lat: 0, lon: 0.001, ele: 0 },
    ];
    const route = computeRouteFromWaypoints('test', wps);
    const expected = haversine(0, 0, 0, 0.001);
    expect(route.totalDistance).toBeCloseTo(expected, 0);
  });

  it('computes correct ascent and descent from elevation deltas', () => {
    const wps: DrawnWaypoint[] = [
      { lat: 0, lon: 0, ele: 100 },
      { lat: 0, lon: 0.001, ele: 150 }, // +50
      { lat: 0, lon: 0.002, ele: 120 }, // -30
    ];
    const route = computeRouteFromWaypoints('ascent-test', wps);
    expect(route.ascent).toBeCloseTo(50, 6);
    expect(route.descent).toBeCloseTo(30, 6);
  });

  it('sets name correctly', () => {
    const wps: DrawnWaypoint[] = [
      { lat: 10, lon: 10, ele: 0 },
      { lat: 10.01, lon: 10, ele: 0 },
    ];
    const route = computeRouteFromWaypoints('My Route', wps);
    expect(route.name).toBe('My Route');
  });

  it('falls back to ele=0 when waypoint ele is null', () => {
    const wps: DrawnWaypoint[] = [
      { lat: 0, lon: 0, ele: null },
      { lat: 0, lon: 0.001, ele: null },
    ];
    const route = computeRouteFromWaypoints('null-ele', wps);
    expect(route.minElevation).toBe(0);
    expect(route.maxElevation).toBe(0);
    expect(route.ascent).toBe(0);
    expect(route.descent).toBe(0);
  });

  it('first point has distance=0', () => {
    const wps: DrawnWaypoint[] = [
      { lat: 46, lon: 7, ele: 800 },
      { lat: 46.01, lon: 7.01, ele: 900 },
    ];
    const route = computeRouteFromWaypoints('first-dist', wps);
    expect(route.points[0].distance).toBe(0);
  });

  it('throws for fewer than 2 waypoints', () => {
    expect(() =>
      computeRouteFromWaypoints('one', [{ lat: 0, lon: 0, ele: 0 }]),
    ).toThrow();
  });

  it('throws for 0 waypoints', () => {
    expect(() => computeRouteFromWaypoints('empty', [])).toThrow();
  });

  it('drops duplicate points (zero-distance pairs)', () => {
    const wps: DrawnWaypoint[] = [
      { lat: 0, lon: 0, ele: 100 },
      { lat: 0, lon: 0, ele: 100 }, // exact duplicate
      { lat: 0, lon: 0.001, ele: 110 },
    ];
    const route = computeRouteFromWaypoints('dupes', wps);
    // buildRoute drops the zero-distance duplicate
    expect(route.points).toHaveLength(2);
  });

  it('produces a route with a unique id each call', () => {
    const wps: DrawnWaypoint[] = [
      { lat: 0, lon: 0, ele: 0 },
      { lat: 0, lon: 0.001, ele: 0 },
    ];
    const r1 = computeRouteFromWaypoints('a', wps);
    const r2 = computeRouteFromWaypoints('b', wps);
    expect(r1.id).not.toBe(r2.id);
  });
});
