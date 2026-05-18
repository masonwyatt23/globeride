import { describe, it, expect } from 'vitest';
import { buildFit } from '@/lib/fitExporter';
import { parseFit } from '@/lib/fitParser';
import type { TelemetrySample } from '@/types';

const start = Date.UTC(2026, 0, 1, 12, 0, 0);

const samples: TelemetrySample[] = Array.from({ length: 6 }, (_, i) => ({
  t: start + i * 1000,
  lat: 40.0 + i * 0.0002,
  lon: -105.0 + i * 0.0002,
  ele: 1600 + i * 3,
  distance: i * 8,
  speed: 8 + i * 0.25,
  grade: 2.5,
  power: 200 + i,
  cadence: 90,
  heartRate: 145 + i,
}));

describe('FIT export → parse round-trip', () => {
  it('rejects an empty sample set', () => {
    expect(() => buildFit({ startTime: start, samples: [] })).toThrow();
  });

  it('re-decodes the same telemetry the encoder wrote', async () => {
    const blob = buildFit({ startTime: start, samples });
    const buf = await blob.arrayBuffer();
    const parsed = parseFit(buf);

    expect(parsed.route).toBeDefined();
    expect(parsed.route.points.length).toBeGreaterThanOrEqual(2);
    expect(parsed.route.totalDistance).toBeGreaterThan(0);
    expect(parsed.samples).toHaveLength(samples.length);

    parsed.samples.forEach((s, i) => {
      const src = samples[i];
      // Semicircle quantization is ~3.6e-8°; allow a generous 1e-4° envelope.
      expect(s.lat).toBeCloseTo(src.lat, 4);
      expect(s.lon).toBeCloseTo(src.lon, 4);
      // Altitude stored at 1/5 m resolution.
      expect(Math.abs(s.ele - src.ele)).toBeLessThan(0.25);
      // Speed stored at mm/s resolution.
      expect(Math.abs(s.speed - src.speed)).toBeLessThan(0.01);
      // Integer channels survive exactly.
      expect(s.power).toBe(src.power);
      expect(s.cadence).toBe(src.cadence);
      expect(s.heartRate).toBe(src.heartRate);
    });
  });
});
