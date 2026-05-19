/**
 * Unit tests for rideHistory.ts pure helpers.
 *
 * The IDB CRUD functions require a real IDB environment and are not tested
 * here. We cover the pure computation helpers exhaustively.
 */

import { describe, it, expect } from 'vitest';
import {
  rideId,
  computeAvgPower,
  computeAvgSpeed,
  computeAscentM,
} from '@/lib/rideHistory';
import type { TelemetrySample } from '@/types';

// ---------------------------------------------------------------------------
// Helpers to build sample arrays
// ---------------------------------------------------------------------------

function makeSample(overrides: Partial<TelemetrySample> & { t?: number } = {}): TelemetrySample {
  return {
    t: overrides.t ?? Date.now(),
    lat: 46.5,
    lon: 7.9,
    ele: overrides.ele ?? 100,
    distance: overrides.distance ?? 0,
    speed: overrides.speed ?? 5,
    grade: overrides.grade ?? 0,
    power: overrides.power,
    cadence: overrides.cadence,
    heartRate: overrides.heartRate,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// rideId
// ---------------------------------------------------------------------------

describe('rideId', () => {
  it('produces a string with ride- prefix', () => {
    expect(rideId()).toMatch(/^ride-/);
  });

  it('generates unique ids', () => {
    const ids = Array.from({ length: 50 }, () => rideId());
    expect(new Set(ids).size).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// computeAvgPower
// ---------------------------------------------------------------------------

describe('computeAvgPower', () => {
  it('returns 0 for empty samples', () => {
    expect(computeAvgPower([])).toBe(0);
  });

  it('returns 0 when no power readings present', () => {
    const samples = [makeSample({ speed: 5 }), makeSample({ speed: 6 })];
    expect(computeAvgPower(samples)).toBe(0);
  });

  it('averages power from samples that have it', () => {
    const samples = [
      makeSample({ power: 200 }),
      makeSample({ power: 250 }),
      makeSample({ power: 300 }),
    ];
    expect(computeAvgPower(samples)).toBe(250);
  });

  it('ignores samples without power', () => {
    const samples = [
      makeSample({ power: 200 }),
      makeSample(), // no power
      makeSample({ power: 300 }),
    ];
    // avg of [200, 300] = 250
    expect(computeAvgPower(samples)).toBe(250);
  });

  it('rounds to nearest integer', () => {
    const samples = [makeSample({ power: 201 }), makeSample({ power: 202 })];
    expect(computeAvgPower(samples)).toBe(202); // Math.round(201.5) = 202
  });
});

// ---------------------------------------------------------------------------
// computeAvgSpeed
// ---------------------------------------------------------------------------

describe('computeAvgSpeed', () => {
  it('returns 0 for empty samples', () => {
    expect(computeAvgSpeed([])).toBe(0);
  });

  it('averages speed correctly', () => {
    const samples = [makeSample({ speed: 4 }), makeSample({ speed: 6 })];
    expect(computeAvgSpeed(samples)).toBeCloseTo(5);
  });

  it('handles single sample', () => {
    expect(computeAvgSpeed([makeSample({ speed: 7.5 })])).toBeCloseTo(7.5);
  });
});

// ---------------------------------------------------------------------------
// computeAscentM
// ---------------------------------------------------------------------------

describe('computeAscentM', () => {
  it('returns 0 for empty samples', () => {
    expect(computeAscentM([])).toBe(0);
  });

  it('returns 0 for single sample', () => {
    expect(computeAscentM([makeSample({ ele: 100 })])).toBe(0);
  });

  it('counts only positive elevation deltas', () => {
    const samples = [
      makeSample({ ele: 100 }),
      makeSample({ ele: 150 }), // +50
      makeSample({ ele: 120 }), // -30, not counted
      makeSample({ ele: 180 }), // +60
    ];
    expect(computeAscentM(samples)).toBe(110);
  });

  it('returns 0 for a pure descent', () => {
    const samples = [
      makeSample({ ele: 300 }),
      makeSample({ ele: 250 }),
      makeSample({ ele: 200 }),
    ];
    expect(computeAscentM(samples)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const samples = [
      makeSample({ ele: 0 }),
      makeSample({ ele: 1.4 }), // rounds to 1
    ];
    expect(Number.isInteger(computeAscentM(samples))).toBe(true);
  });
});
