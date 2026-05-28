import { describe, it, expect } from 'vitest';
import { buildMinimapPath, estimateRideTime } from '@/components/setup/RoutePreview';
import type { Route } from '@/types';

function makeRoute(points: { lat: number; lon: number }[]): Route {
  return {
    id: 'r',
    name: 'r',
    points: points.map((p, i) => ({
      lat: p.lat,
      lon: p.lon,
      ele: 0,
      distance: i * 100,
    })),
    totalDistance: (points.length - 1) * 100,
    ascent: 0,
    descent: 0,
    minElevation: 0,
    maxElevation: 0,
    loadedAt: 0,
  };
}

describe('buildMinimapPath', () => {
  it('returns null for routes with fewer than two points', () => {
    expect(buildMinimapPath(makeRoute([{ lat: 0, lon: 0 }]))).toBeNull();
  });

  it('returns null when the route collapses to a single coordinate', () => {
    // Two identical points → zero bounds → unrenderable.
    expect(
      buildMinimapPath(makeRoute([{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }])),
    ).toBeNull();
  });

  it('emits a path with one point per route point (within stride), all inside the viewport', () => {
    const pts = [
      { lat: 46.59, lon: 7.91 },
      { lat: 46.595, lon: 7.92 },
      { lat: 46.6, lon: 7.93 },
      { lat: 46.605, lon: 7.94 },
    ];
    const m = buildMinimapPath(makeRoute(pts));
    expect(m).not.toBeNull();
    const segments = m!.path.split(' ');
    expect(segments.length).toBeGreaterThanOrEqual(pts.length);
    for (const s of segments) {
      const [x, y] = s.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(280);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(140);
    }
  });

  it('subsamples very long polylines so the path stays bounded', () => {
    const pts = Array.from({ length: 1200 }, (_, i) => ({
      lat: 46.59 + i * 0.0001,
      lon: 7.91 + i * 0.0001,
    }));
    const m = buildMinimapPath(makeRoute(pts));
    expect(m).not.toBeNull();
    const segments = m!.path.split(' ');
    // 300 stride target + the final point.
    expect(segments.length).toBeLessThanOrEqual(305);
  });
});

describe('estimateRideTime', () => {
  it('returns dash for non-positive distance', () => {
    expect(estimateRideTime(0)).toBe('—');
    expect(estimateRideTime(-100)).toBe('—');
  });

  it('formats minutes when under an hour at 25 km/h', () => {
    // 5 km → 12 min
    expect(estimateRideTime(5000)).toBe('12 min');
  });

  it('formats hours and minutes when above an hour', () => {
    // 50 km → 2 h
    expect(estimateRideTime(50000)).toBe('2 h');
    // 45 km @ 25 km/h ≈ 108 min → "1 h 48 min"
    expect(estimateRideTime(45000)).toBe('1 h 48 min');
  });
});
