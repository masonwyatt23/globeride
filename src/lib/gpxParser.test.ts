import { describe, it, expect } from 'vitest';
import { buildRoute } from '@/lib/gpxParser';

describe('buildRoute', () => {
  it('computes cumulative distance, ascent/descent and elevation bounds', () => {
    const r = buildRoute('test', [
      { lat: 0, lon: 0, ele: 100 },
      { lat: 0, lon: 0.001, ele: 110 }, // ~111 m east, +10 m
      { lat: 0, lon: 0.002, ele: 90 }, // ~111 m east, -20 m
    ]);

    expect(r.name).toBe('test');
    expect(r.points).toHaveLength(3);
    expect(r.points[0].distance).toBe(0);
    expect(r.ascent).toBeCloseTo(10, 6);
    expect(r.descent).toBeCloseTo(20, 6);
    expect(r.minElevation).toBe(90);
    expect(r.maxElevation).toBe(110);
    expect(r.totalDistance).toBe(r.points[2].distance);
    expect(r.totalDistance).toBeGreaterThan(200); // ~222 m total
  });

  it('keeps cumulative distance monotonically non-decreasing', () => {
    const r = buildRoute('mono', [
      { lat: 10, lon: 10, ele: 0 },
      { lat: 10.0005, lon: 10, ele: 5 },
      { lat: 10.001, lon: 10, ele: 5 },
      { lat: 10.0015, lon: 10, ele: 2 },
    ]);
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i].distance).toBeGreaterThanOrEqual(r.points[i - 1].distance);
    }
  });

  it('drops zero-distance duplicate points', () => {
    const r = buildRoute('dupes', [
      { lat: 0, lon: 0, ele: 100 },
      { lat: 0, lon: 0, ele: 100 }, // exact duplicate — discarded
      { lat: 0, lon: 0.001, ele: 105 },
    ]);
    expect(r.points).toHaveLength(2);
  });
});
