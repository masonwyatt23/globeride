import { describe, it, expect } from 'vitest';
import {
  distanceMeters,
  gpsToGradePct,
  shouldAutoPause,
  isStaleGpsSample,
  watchGpsPosition,
  type GpsSample,
} from '@/lib/outdoorGps';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSample(overrides: Partial<GpsSample> & { lat: number; lon: number }): GpsSample {
  return {
    lat: overrides.lat,
    lon: overrides.lon,
    ele: overrides.ele ?? null,
    speedMs: overrides.speedMs ?? null,
    accuracy: overrides.accuracy ?? 5,
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// distanceMeters — haversine
// ---------------------------------------------------------------------------

describe('distanceMeters', () => {
  it('returns 0 for identical positions', () => {
    const a = makeSample({ lat: 51.5, lon: -0.12 });
    expect(distanceMeters(a, a)).toBe(0);
  });

  it('computes ~111 km per degree of latitude', () => {
    const a = makeSample({ lat: 0, lon: 0 });
    const b = makeSample({ lat: 1, lon: 0 });
    // 1° latitude ≈ 111 195 m at the equator
    expect(distanceMeters(a, b)).toBeCloseTo(111_195, -2);
  });

  it('computes ~111 km per degree of longitude at the equator', () => {
    const a = makeSample({ lat: 0, lon: 0 });
    const b = makeSample({ lat: 0, lon: 1 });
    expect(distanceMeters(a, b)).toBeCloseTo(111_195, -2);
  });

  it('shrinks with latitude for longitudinal distance', () => {
    // At 60° N, cos(60°) = 0.5, so 1° lon ≈ 55 600 m
    const a = makeSample({ lat: 60, lon: 0 });
    const b = makeSample({ lat: 60, lon: 1 });
    expect(distanceMeters(a, b)).toBeCloseTo(55_597, -2);
  });

  it('is symmetric (a→b == b→a)', () => {
    const a = makeSample({ lat: 47.37, lon: 8.54 });
    const b = makeSample({ lat: 48.86, lon: 2.35 });
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 3);
  });

  it('handles known city pair (Paris → Zurich ≈ 490 km)', () => {
    const paris = makeSample({ lat: 48.857, lon: 2.351 });
    const zurich = makeSample({ lat: 47.377, lon: 8.540 });
    const d = distanceMeters(paris, zurich);
    expect(d).toBeGreaterThan(480_000);
    expect(d).toBeLessThan(500_000);
  });
});

// ---------------------------------------------------------------------------
// gpsToGradePct
// ---------------------------------------------------------------------------

describe('gpsToGradePct', () => {
  it('returns 0 when elevation is missing', () => {
    const a = makeSample({ lat: 0, lon: 0, ele: null });
    const b = makeSample({ lat: 0.001, lon: 0, ele: 10 });
    expect(gpsToGradePct(a, b)).toBe(0);
  });

  it('returns 0 for flat ground (same elevation)', () => {
    const a = makeSample({ lat: 0, lon: 0, ele: 100 });
    const b = makeSample({ lat: 0.001, lon: 0, ele: 100 });
    expect(gpsToGradePct(a, b)).toBe(0);
  });

  it('returns positive grade uphill', () => {
    // ~111 m horizontal distance per 0.001° lat at equator, 11.1 m rise → ~10%
    const a = makeSample({ lat: 0, lon: 0, ele: 0 });
    const b = makeSample({ lat: 0.001, lon: 0, ele: 11.12 });
    expect(gpsToGradePct(a, b)).toBeGreaterThan(9);
    expect(gpsToGradePct(a, b)).toBeLessThan(11);
  });

  it('returns negative grade downhill', () => {
    const a = makeSample({ lat: 0, lon: 0, ele: 100 });
    const b = makeSample({ lat: 0.001, lon: 0, ele: 88.88 });
    expect(gpsToGradePct(a, b)).toBeLessThan(-9);
    expect(gpsToGradePct(a, b)).toBeGreaterThan(-11);
  });

  it('clamps extreme grades to ±25%', () => {
    // Same position but huge elevation change → would be infinite grade
    const a = makeSample({ lat: 0, lon: 0, ele: 0 });
    const b = makeSample({ lat: 0.000005, lon: 0, ele: 1000 });
    expect(gpsToGradePct(a, b)).toBe(25);
  });

  it('clamps negative extreme to -25%', () => {
    const a = makeSample({ lat: 0, lon: 0, ele: 1000 });
    const b = makeSample({ lat: 0.000005, lon: 0, ele: 0 });
    expect(gpsToGradePct(a, b)).toBe(-25);
  });
});

// ---------------------------------------------------------------------------
// isStaleGpsSample
// ---------------------------------------------------------------------------

describe('isStaleGpsSample', () => {
  it('returns false for a fresh sample', () => {
    const now = Date.now();
    const s = makeSample({ lat: 0, lon: 0, timestamp: now - 1_000 });
    expect(isStaleGpsSample(s, now)).toBe(false);
  });

  it('returns true for a sample older than 5 s', () => {
    const now = Date.now();
    const s = makeSample({ lat: 0, lon: 0, timestamp: now - 6_000 });
    expect(isStaleGpsSample(s, now)).toBe(true);
  });

  it('returns false for a sample exactly at the threshold', () => {
    const now = Date.now();
    const s = makeSample({ lat: 0, lon: 0, timestamp: now - 5_000 });
    // Exactly 5000 ms: not stale (> threshold, not >=)
    expect(isStaleGpsSample(s, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAutoPause
// ---------------------------------------------------------------------------

describe('shouldAutoPause', () => {
  it('returns false with fewer than 2 samples', () => {
    const s = makeSample({ lat: 0, lon: 0, speedMs: 0 });
    expect(shouldAutoPause([])).toBe(false);
    expect(shouldAutoPause([s])).toBe(false);
  });

  it('returns true when rider is stationary (speedMs = 0)', () => {
    const now = Date.now();
    const samples: GpsSample[] = Array.from({ length: 12 }, (_, i) =>
      makeSample({ lat: 0, lon: 0, speedMs: 0, timestamp: now - (11 - i) * 1_000 }),
    );
    expect(shouldAutoPause(samples)).toBe(true);
  });

  it('returns false when rider is moving fast', () => {
    const now = Date.now();
    const samples: GpsSample[] = Array.from({ length: 12 }, (_, i) =>
      makeSample({ lat: 0, lon: 0, speedMs: 8, timestamp: now - (11 - i) * 1_000 }),
    );
    expect(shouldAutoPause(samples)).toBe(false);
  });

  it('returns true when only old slow samples exist in the window', () => {
    const now = Date.now();
    // Samples 11+ seconds ago are outside the 10-second window and are ignored.
    // Within the window, speed is 0.
    const old = makeSample({ lat: 0, lon: 0, speedMs: 10, timestamp: now - 15_000 });
    const recent: GpsSample[] = Array.from({ length: 5 }, (_, i) =>
      makeSample({ lat: 0, lon: 0, speedMs: 0.1, timestamp: now - (4 - i) * 1_000 }),
    );
    expect(shouldAutoPause([old, ...recent])).toBe(true);
  });

  it('falls back to haversine when speedMs is null', () => {
    const now = Date.now();
    // Two samples at the same position → haversine distance = 0 → speed = 0 → should pause
    const samples: GpsSample[] = Array.from({ length: 12 }, (_, i) =>
      makeSample({ lat: 47.3769, lon: 8.5417, speedMs: null, timestamp: now - (11 - i) * 1_000 }),
    );
    expect(shouldAutoPause(samples)).toBe(true);
  });

  it('does not pause when speedMs is null but rider is actually moving', () => {
    const now = Date.now();
    // 0.001° lat change per second ≈ 111 m/s — clearly moving
    const samples: GpsSample[] = Array.from({ length: 12 }, (_, i) =>
      makeSample({ lat: i * 0.001, lon: 0, speedMs: null, timestamp: now - (11 - i) * 1_000 }),
    );
    expect(shouldAutoPause(samples)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// watchGpsPosition — smoke test (mocked geolocation)
// ---------------------------------------------------------------------------

describe('watchGpsPosition', () => {
  it('calls onSample with throttled smoothed samples and returns an unsubscribe fn', () => {
    const samples: ReturnType<typeof makeSample>[] = [];
    let watchCallback: ((pos: GeolocationPosition) => void) | null = null;
    let clearWatchCalled = false;

    // Mock navigator.geolocation
    const origGeo = (globalThis as Record<string, unknown>).navigator;
    const mockGeo = {
      watchPosition: (_cb: (pos: GeolocationPosition) => void) => {
        watchCallback = _cb;
        return 42; // watch id
      },
      clearWatch: (id: number) => {
        expect(id).toBe(42);
        clearWatchCalled = true;
      },
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: mockGeo },
      configurable: true,
    });

    const unsub = watchGpsPosition((s) => samples.push(s), () => {});

    const makePos = (lat: number, lon: number, t: number): GeolocationPosition => ({
      coords: {
        latitude: lat, longitude: lon, altitude: 10, speed: 5,
        accuracy: 5, altitudeAccuracy: null, heading: null,
        toJSON: () => ({}),
      },
      timestamp: t,
      toJSON: () => ({}),
    });

    // First sample — emitted (ts 1000, last = 0)
    watchCallback!(makePos(47.0, 8.0, 1_000));
    // Second too fast (< 1000 ms later) — throttled
    watchCallback!(makePos(47.001, 8.001, 1_500));
    // Third — 1 Hz elapsed
    watchCallback!(makePos(47.002, 8.002, 2_001));

    expect(samples.length).toBe(2);
    // Lat should be smoothed (3-point avg at size 2 here)
    expect(samples[0].lat).toBeCloseTo(47.0, 4);
    expect(samples[1].lat).toBeCloseTo((47.0 + 47.002) / 2, 4);

    unsub();
    expect(clearWatchCalled).toBe(true);

    // Restore
    Object.defineProperty(globalThis, 'navigator', {
      value: origGeo,
      configurable: true,
    });
  });
});
