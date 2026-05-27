import { describe, it, expect } from 'vitest';
import {
  GRADIENT_ZONES,
  computeZoneBreakdown,
  computeGradientStats,
  detectClimbs,
  computeDifficulty,
  buildSparkline,
} from '@/lib/routeAnalysis';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Route from (distance, elevation) pairs. */
function makeRoute(points: Array<{ d: number; ele: number }>, ascent = 0): Route {
  return {
    name: 'Test Route',
    totalDistance: points[points.length - 1]?.d ?? 0,
    ascent,
    points: points.map(({ d, ele }) => ({
      lat: 0,
      lon: 0,
      ele,
      distance: d,
    })),
  } as unknown as Route;
}

// ---------------------------------------------------------------------------
// GRADIENT_ZONES
// ---------------------------------------------------------------------------

describe('GRADIENT_ZONES', () => {
  it('has 6 zones', () => {
    expect(GRADIENT_ZONES).toHaveLength(6);
  });

  it('first zone is Descent (min = -Infinity)', () => {
    expect(GRADIENT_ZONES[0].min).toBe(-Infinity);
  });

  it('last zone extends to +Infinity', () => {
    expect(GRADIENT_ZONES[GRADIENT_ZONES.length - 1].max).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// computeZoneBreakdown
// ---------------------------------------------------------------------------

describe('computeZoneBreakdown', () => {
  it('returns one entry per gradient zone', () => {
    const route = makeRoute([{ d: 0, ele: 0 }, { d: 1000, ele: 20 }]);
    const breakdown = computeZoneBreakdown(route);
    expect(breakdown).toHaveLength(GRADIENT_ZONES.length);
  });

  it('all fractions sum to 1 for a simple route', () => {
    const route = makeRoute([
      { d: 0, ele: 0 },
      { d: 500, ele: 10 },  // 2% — zone "1–4%"
      { d: 1000, ele: 10 }, // flat — zone "0–1%"
    ]);
    const breakdown = computeZoneBreakdown(route);
    const total = breakdown.reduce((sum, b) => sum + b.fraction, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('correctly classifies a 5% climb as 4–8% zone', () => {
    // 500 m horizontal, 25 m rise → 5%
    const route = makeRoute([{ d: 0, ele: 0 }, { d: 500, ele: 25 }]);
    const breakdown = computeZoneBreakdown(route);
    const zone48 = breakdown.find((b) => b.zone.label === '4–8 %');
    expect(zone48?.distanceM).toBeCloseTo(500, 0);
    expect(zone48?.fraction).toBeCloseTo(1, 5);
  });

  it('correctly classifies a descent as Descent zone', () => {
    const route = makeRoute([{ d: 0, ele: 100 }, { d: 1000, ele: 50 }]);
    const breakdown = computeZoneBreakdown(route);
    const desc = breakdown.find((b) => b.zone.label === 'Descent');
    expect(desc?.distanceM).toBeCloseTo(1000, 0);
  });

  it('correctly classifies a 15% pitch as 12%+ zone', () => {
    const route = makeRoute([{ d: 0, ele: 0 }, { d: 1000, ele: 150 }]);
    const breakdown = computeZoneBreakdown(route);
    const steep = breakdown.find((b) => b.zone.shortLabel === '12 %+');
    expect(steep?.distanceM).toBeCloseTo(1000, 0);
  });
});

// ---------------------------------------------------------------------------
// computeGradientStats
// ---------------------------------------------------------------------------

describe('computeGradientStats', () => {
  it('returns 0s for a flat route', () => {
    const route = makeRoute([{ d: 0, ele: 100 }, { d: 1000, ele: 100 }]);
    const stats = computeGradientStats(route);
    expect(stats.avgGradient).toBe(0);
    expect(stats.maxGradient).toBe(0);
  });

  it('computes max gradient correctly', () => {
    const route = makeRoute([
      { d: 0,    ele: 0  },
      { d: 1000, ele: 50 }, // 5%
      { d: 1500, ele: 80 }, // 6%
      { d: 2000, ele: 90 }, // 2%
    ]);
    const stats = computeGradientStats(route);
    expect(stats.maxGradient).toBeCloseTo(6, 1);
  });

  it('ignores descents in avgGradient', () => {
    const route = makeRoute([
      { d: 0,    ele: 0   },
      { d: 1000, ele: 100 }, // 10% up
      { d: 2000, ele: 0   }, // 10% down
    ]);
    const stats = computeGradientStats(route);
    // Only uphill counted in avg
    expect(stats.avgGradient).toBeCloseTo(10, 1);
    expect(stats.maxGradient).toBeCloseTo(10, 1);
  });
});

// ---------------------------------------------------------------------------
// detectClimbs
// ---------------------------------------------------------------------------

describe('detectClimbs', () => {
  it('returns empty array for a flat route', () => {
    const route = makeRoute([{ d: 0, ele: 0 }, { d: 5000, ele: 0 }]);
    expect(detectClimbs(route)).toHaveLength(0);
  });

  it('detects a single obvious climb', () => {
    // 3 km at ~8% → score = 3 × 64 = 192 → HC
    const pts = Array.from({ length: 31 }, (_, i) => ({
      d: i * 100,
      ele: i * 8,
    }));
    const route = makeRoute(pts);
    const climbs = detectClimbs(route);
    expect(climbs.length).toBeGreaterThanOrEqual(1);
    expect(climbs[0].category).toBe('HC');
  });

  it('ignores very short bumps (< 400 m)', () => {
    // 300 m at 10% then immediately flat — finalizeClimb sees lengthM=300 < 400
    const pts = [
      { d: 0,   ele: 0  },
      { d: 300, ele: 30 }, // 10% for 300 m — below MIN_CLIMB_LENGTH_M
    ];
    const route = makeRoute(pts);
    // lengthM at finalize = 300 < 400 → rejected
    expect(detectClimbs(route)).toHaveLength(0);
  });

  it('returns climbs sorted by start distance', () => {
    // Two separate climbs
    const pts: Array<{ d: number; ele: number }> = [];
    // flat start
    for (let i = 0; i <= 10; i++) pts.push({ d: i * 100, ele: 0 });
    // first climb: 1 km at 8%
    for (let i = 1; i <= 10; i++) pts.push({ d: 1000 + i * 100, ele: i * 8 });
    // flat gap > 150 m to reset
    for (let i = 1; i <= 5; i++) pts.push({ d: 2000 + i * 50, ele: 80 });
    // second climb
    for (let i = 1; i <= 10; i++) pts.push({ d: 2250 + i * 100, ele: 80 + i * 8 });

    const route = makeRoute(pts);
    const climbs = detectClimbs(route);
    for (let i = 1; i < climbs.length; i++) {
      expect(climbs[i].startDistance).toBeGreaterThan(climbs[i - 1].startDistance);
    }
  });
});

// ---------------------------------------------------------------------------
// computeDifficulty
// ---------------------------------------------------------------------------

describe('computeDifficulty', () => {
  it('labels a purely flat route as Flat', () => {
    const route = makeRoute([{ d: 0, ele: 0 }, { d: 10_000, ele: 0 }], 0);
    const stats = { avgGradient: 0, maxGradient: 0 };
    const { label, score } = computeDifficulty(route, stats);
    expect(label).toBe('Flat');
    expect(score).toBe(0);
  });

  it('labels a big mountain route as Brutal', () => {
    // 20 m ascent per km, 10% avg, 20% max → max score
    const route = makeRoute([{ d: 0, ele: 0 }, { d: 100_000, ele: 2000 }], 2000);
    const stats = { avgGradient: 10, maxGradient: 20 };
    const { label } = computeDifficulty(route, stats);
    expect(label).toBe('Brutal');
  });

  it('score is always an integer in 0..100', () => {
    const cases = [
      { asc: 0, avg: 0, max: 0 },
      { asc: 500, avg: 5, max: 10 },
      { asc: 2000, avg: 10, max: 20 },
    ];
    for (const c of cases) {
      const route = makeRoute([{ d: 0, ele: 0 }, { d: 100_000, ele: c.asc }], c.asc);
      const { score } = computeDifficulty(route, { avgGradient: c.avg, maxGradient: c.max });
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ---------------------------------------------------------------------------
// buildSparkline
// ---------------------------------------------------------------------------

describe('buildSparkline', () => {
  it('returns empty array for a route with no points', () => {
    const route = makeRoute([]);
    expect(buildSparkline(route)).toHaveLength(0);
  });

  it('returns all points when count <= maxPoints', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ d: i * 100, ele: i * 2 }));
    const route = makeRoute(pts);
    const spark = buildSparkline(route, 120);
    expect(spark.length).toBeGreaterThanOrEqual(10);
  });

  it('downsamples to at most maxPoints', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ d: i * 10, ele: i }));
    const route = makeRoute(pts);
    const spark = buildSparkline(route, 50);
    // step = floor(1000/50) = 20, so ~50 points + possibly the last point
    expect(spark.length).toBeLessThanOrEqual(52);
  });

  it('always includes the last route point', () => {
    const pts = Array.from({ length: 101 }, (_, i) => ({ d: i * 100, ele: i }));
    const route = makeRoute(pts);
    const spark = buildSparkline(route, 50);
    const last = spark[spark.length - 1];
    expect(last.d).toBe(100 * 100);
    expect(last.ele).toBe(100);
  });
});
