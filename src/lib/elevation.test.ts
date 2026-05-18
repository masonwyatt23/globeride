import { describe, it, expect } from 'vitest';
import { resamplePolyline } from '@/lib/elevation';

describe('resamplePolyline', () => {
  it('returns a copy unchanged for < 2 points', () => {
    const one = [{ lat: 1, lon: 2 }];
    const out = resamplePolyline(one, 30);
    expect(out).toHaveLength(1);
    expect(out).not.toBe(one); // copy, not the same reference
    expect(resamplePolyline([], 30)).toHaveLength(0);
  });

  it('preserves the exact first and last points', () => {
    const pts = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.003 }, // ~334 m east
    ];
    const out = resamplePolyline(pts, 30);
    expect(out[0].lat).toBeCloseTo(0, 9);
    expect(out[0].lon).toBeCloseTo(0, 9);
    expect(out[out.length - 1].lat).toBeCloseTo(0, 9);
    expect(out[out.length - 1].lon).toBeCloseTo(0.003, 9);
  });

  it('densifies long segments to roughly the requested spacing', () => {
    // ~334 m at 30 m spacing → ceil(334/30)=12 inserted → 13 points total
    const out = resamplePolyline([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.003 }], 30);
    expect(out.length).toBeGreaterThan(10);
    expect(out.length).toBeLessThan(16);
  });

  it('leaves short segments alone', () => {
    // ~11 m segment, 30 m spacing → no subdivision
    const out = resamplePolyline([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.0001 }], 30);
    expect(out).toHaveLength(2);
  });
});
