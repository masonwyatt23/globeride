/**
 * Tests for src/lib/segmentOverlay.ts
 *
 * Covers:
 *   1. mapSegmentsToRoute — happy path, alignment filter, direction filter
 *   2. detectSegmentEntry — first crossing, no re-trigger, active guard
 *   3. detectSegmentExit  — crossing, wrong ID, already past
 *   4. computePaceVsPR   — ahead, behind, first effort, guard values
 */

import { describe, it, expect } from 'vitest';
import {
  mapSegmentsToRoute,
  detectSegmentEntry,
  detectSegmentExit,
  computePaceVsPR,
  type RouteSegment,
} from './segmentOverlay';
import type { StravaSegment } from '@/lib/strava/segments';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Build a straight east-going route of totalDistance metres with evenly-spaced points.
 * Starts at (51.5, -0.1).
 */
function makeStraightRoute(totalDistance: number = 10_000, numPts: number = 50): Route {
  const startLat = 51.5;
  const startLon = -0.1;
  // 1° lon ≈ 111 139 m * cos(lat) ≈ 69 609 m at 51.5°
  const metersPerDegLon = 111_139 * Math.cos((startLat * Math.PI) / 180);
  const dLon = totalDistance / metersPerDegLon / (numPts - 1);
  const dDist = totalDistance / (numPts - 1);

  const points = Array.from({ length: numPts }, (_, i) => ({
    lat: startLat,
    lon: startLon + i * dLon,
    ele: 100,
    distance: i * dDist,
  }));

  return {
    id: 'test-route',
    name: 'Test Route',
    points,
    totalDistance,
    ascent: 0,
    descent: 0,
    minElevation: 100,
    maxElevation: 100,
    loadedAt: Date.now(),
  };
}

/**
 * Make a StravaSegment that lies on the route between routeDistStart and
 * routeDistEnd (both in metres). Converts route-distances back to lat/lon.
 */
function makeOnRouteSegment(
  route: Route,
  routeDistStart: number,
  routeDistEnd: number,
  id: number = 1,
): StravaSegment {
  const startLat = 51.5;
  const startLon = -0.1;
  const metersPerDegLon = 111_139 * Math.cos((startLat * Math.PI) / 180);

  const startLon_ = startLon + (routeDistStart / metersPerDegLon);
  const endLon_   = startLon + (routeDistEnd   / metersPerDegLon);

  return {
    id,
    name: `Strava Seg ${id}`,
    distance: routeDistEnd - routeDistStart,
    startLat,
    startLon: startLon_,
    endLat: startLat,
    endLon: endLon_,
    prTime: 120,
  };
}

/** A segment placed far from the route (Paris ≈ 400 km from London). */
function makeFarSegment(id: number = 99): StravaSegment {
  return {
    id,
    name: 'Paris Segment',
    distance: 1000,
    startLat: 48.8566,
    startLon: 2.3522,
    endLat: 48.866,
    endLon: 2.362,
  };
}

// ---------------------------------------------------------------------------
// 1. mapSegmentsToRoute
// ---------------------------------------------------------------------------

describe('mapSegmentsToRoute', () => {
  it('maps a segment that lies on the route to correct start/end distances', () => {
    const route = makeStraightRoute(10_000);
    const seg = makeOnRouteSegment(route, 2_000, 4_000, 1);

    const mapped = mapSegmentsToRoute([seg], route);

    expect(mapped).toHaveLength(1);
    // Start distance should be near 2000 m (within 200 m scan resolution).
    expect(mapped[0].routeStartDistance).toBeGreaterThan(1_500);
    expect(mapped[0].routeStartDistance).toBeLessThan(2_500);
    // End distance should be near 4000 m.
    expect(mapped[0].routeEndDistance).toBeGreaterThan(3_500);
    expect(mapped[0].routeEndDistance).toBeLessThan(4_500);
  });

  it('filters out a segment that is far from the route', () => {
    const route = makeStraightRoute(10_000);
    const far = makeFarSegment(99);
    const mapped = mapSegmentsToRoute([far], route);
    expect(mapped).toHaveLength(0);
  });

  it('filters out a reversed segment (startDist >= endDist)', () => {
    const route = makeStraightRoute(10_000);
    // Place start east of end so closestRouteDistance gives start > end.
    const startLat = 51.5;
    const startLon = -0.1;
    const metersPerDegLon = 111_139 * Math.cos((startLat * Math.PI) / 180);

    const reversed: StravaSegment = {
      id: 2,
      name: 'Reversed Seg',
      distance: 1000,
      // Start near 7000 m mark, end near 3000 m mark — reversed on the route.
      startLat,
      startLon: startLon + (7_000 / metersPerDegLon),
      endLat: startLat,
      endLon: startLon + (3_000 / metersPerDegLon),
    };

    const mapped = mapSegmentsToRoute([reversed], route);
    expect(mapped).toHaveLength(0);
  });

  it('sorts mapped segments by routeStartDistance', () => {
    const route = makeStraightRoute(10_000);
    const seg1 = makeOnRouteSegment(route, 5_000, 7_000, 10);
    const seg2 = makeOnRouteSegment(route, 1_000, 3_000, 20);

    const mapped = mapSegmentsToRoute([seg1, seg2], route);

    expect(mapped).toHaveLength(2);
    expect(mapped[0].routeStartDistance).toBeLessThan(mapped[1].routeStartDistance);
  });
});

// ---------------------------------------------------------------------------
// 2. detectSegmentEntry
// ---------------------------------------------------------------------------

describe('detectSegmentEntry', () => {
  function makeRouteSegment(startD: number, endD: number, id: number = 1): RouteSegment {
    return {
      segment: { id, name: `Seg ${id}`, distance: endD - startD, startLat: 0, startLon: 0, endLat: 0, endLon: 0 },
      routeStartDistance: startD,
      routeEndDistance: endD,
    };
  }

  it('fires when the rider crosses the segment start distance', () => {
    const rs = makeRouteSegment(1_000, 2_000, 1);
    const entry = detectSegmentEntry(1_050, [rs], 950, null);
    expect(entry).not.toBeNull();
    expect(entry!.segment.id).toBe(1);
  });

  it('does not fire when rider has already passed the start (no crossing)', () => {
    const rs = makeRouteSegment(1_000, 2_000, 1);
    // lastDistance already past startDistance — no crossing
    const entry = detectSegmentEntry(1_500, [rs], 1_200, null);
    expect(entry).toBeNull();
  });

  it('does not fire when a segment is already active (no nesting)', () => {
    const rs1 = makeRouteSegment(1_000, 2_000, 1);
    const rs2 = makeRouteSegment(1_200, 2_200, 2);
    // Segment 1 is active, rider crosses segment 2 start.
    const entry = detectSegmentEntry(1_250, [rs1, rs2], 1_150, 1);
    expect(entry).toBeNull();
  });

  it('returns null when no segments are provided', () => {
    const entry = detectSegmentEntry(500, [], 400, null);
    expect(entry).toBeNull();
  });

  it('fires on the exact frame the rider lands on startDistance', () => {
    const rs = makeRouteSegment(2_000, 3_000, 5);
    // lastDistance just before, distanceNow exactly at start.
    const entry = detectSegmentEntry(2_000, [rs], 1_999, null);
    expect(entry).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. detectSegmentExit
// ---------------------------------------------------------------------------

describe('detectSegmentExit', () => {
  function makeRouteSegment(startD: number, endD: number, id: number = 1): RouteSegment {
    return {
      segment: { id, name: `Seg ${id}`, distance: endD - startD, startLat: 0, startLon: 0, endLat: 0, endLon: 0 },
      routeStartDistance: startD,
      routeEndDistance: endD,
    };
  }

  it('fires when rider crosses the segment end distance', () => {
    const rs = makeRouteSegment(1_000, 2_000, 1);
    const exit = detectSegmentExit(2_050, [rs], 1, 1_900);
    expect(exit).not.toBeNull();
    expect(exit!.segment.id).toBe(1);
  });

  it('does not fire when activeId is null', () => {
    const rs = makeRouteSegment(1_000, 2_000, 1);
    const exit = detectSegmentExit(2_100, [rs], null, 1_900);
    expect(exit).toBeNull();
  });

  it('does not fire when activeId does not match any segment', () => {
    const rs = makeRouteSegment(1_000, 2_000, 1);
    // activeId is 99, which is not in the list
    const exit = detectSegmentExit(2_100, [rs], 99, 1_900);
    expect(exit).toBeNull();
  });

  it('does not fire when rider has not yet reached the end', () => {
    const rs = makeRouteSegment(1_000, 2_000, 1);
    const exit = detectSegmentExit(1_800, [rs], 1, 1_700);
    expect(exit).toBeNull();
  });

  it('does not re-fire when both lastDistance and distanceNow are past end', () => {
    const rs = makeRouteSegment(1_000, 2_000, 1);
    // Already past end last frame — no crossing this frame
    const exit = detectSegmentExit(2_200, [rs], 1, 2_100);
    expect(exit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. computePaceVsPR
// ---------------------------------------------------------------------------

describe('computePaceVsPR', () => {
  it('returns negative delta when rider is ahead of PR pace', () => {
    // PR is 120s for 1000m. Rider covered 500m in 55s → pace 0.11s/m.
    // Projected = 0.11 * 1000 = 110s → delta = 110 - 120 = -10s.
    const delta = computePaceVsPR(55, 500, 120, 1_000);
    expect(delta).toBeLessThan(0);
  });

  it('returns positive delta when rider is behind PR pace', () => {
    // PR is 120s for 1000m. Rider covered 500m in 70s → pace 0.14s/m.
    // Projected = 0.14 * 1000 = 140s → delta = 140 - 120 = +20s.
    const delta = computePaceVsPR(70, 500, 120, 1_000);
    expect(delta).toBeGreaterThan(0);
  });

  it('returns 0 when PR time is 0 (no PR on record)', () => {
    const delta = computePaceVsPR(60, 500, 0, 1_000);
    expect(delta).toBe(0);
  });

  it('returns 0 when segment distance is 0', () => {
    const delta = computePaceVsPR(60, 0, 120, 0);
    expect(delta).toBe(0);
  });

  it('returns 0 when distanceM is 0 (rider just entered)', () => {
    const delta = computePaceVsPR(0, 0, 120, 1_000);
    expect(delta).toBe(0);
  });

  it('computes correctly when rider matches PR pace exactly', () => {
    // PR 100s / 1000m. Rider covered 500m in 50s → exact match.
    const delta = computePaceVsPR(50, 500, 100, 1_000);
    expect(delta).toBeCloseTo(0, 5);
  });

  it('handles fractional seconds correctly', () => {
    // PR 90.5s / 800m. Rider covered 400m in 46s → pace 0.115s/m.
    // Projected = 92s → delta = 92 - 90.5 = +1.5s.
    const delta = computePaceVsPR(46, 400, 90.5, 800);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeCloseTo(1.5, 0);
  });
});
