/**
 * Unit tests for ftpTest.ts pure helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  buildRampTest,
  build20MinTest,
  estimateFtpFromSamples,
  ftpTestKindFromWorkoutId,
  FTP_TEST_WORKOUT_IDS,
} from '@/lib/ftpTest';
import { totalDurationSec } from '@/lib/workout';
import type { TelemetrySample } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSamples(opts: {
  count: number;
  power: number;
  durationMs: number;
  startT?: number;
}): TelemetrySample[] {
  const { count, power, durationMs, startT = 0 } = opts;
  const interval = durationMs / count;
  return Array.from({ length: count }, (_, i) => ({
    t: startT + i * interval,
    lat: 0,
    lon: 0,
    ele: 100,
    distance: i * 10,
    speed: 5,
    grade: 0,
    power,
  }));
}

// ---------------------------------------------------------------------------
// buildRampTest
// ---------------------------------------------------------------------------

describe('buildRampTest', () => {
  const ramp = buildRampTest();

  it('has correct preset id', () => {
    expect(ramp.id).toBe('preset-ramp-test');
  });

  it('starts with a warmup segment', () => {
    expect(ramp.segments[0].kind).toBe('warmup');
  });

  it('ends with a cooldown segment', () => {
    expect(ramp.segments[ramp.segments.length - 1].kind).toBe('cooldown');
  });

  it('has ramp step segments between warmup and cooldown', () => {
    const steps = ramp.segments.slice(1, -1);
    expect(steps.length).toBeGreaterThan(0);
    steps.forEach((s) => expect(s.kind).toBe('ramp'));
  });

  it('has increasing power in step segments', () => {
    const steps = ramp.segments.slice(1, -1);
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1].target;
      const curr = steps[i].target;
      if (prev.type === 'watts' && curr.type === 'watts') {
        expect(curr.watts).toBeGreaterThan(prev.watts);
      }
    }
  });

  it('total duration is positive', () => {
    expect(totalDurationSec(ramp)).toBeGreaterThan(0);
  });

  it('custom start/step/max params are respected', () => {
    const custom = buildRampTest(120, 10, 90, 200);
    const steps = custom.segments.slice(1, -1);
    const firstStep = steps[0].target;
    if (firstStep.type === 'watts') {
      expect(firstStep.watts).toBe(120);
    }
    // 120 → 200 at +10 W = 9 steps
    expect(steps.length).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// build20MinTest
// ---------------------------------------------------------------------------

describe('build20MinTest', () => {
  const test20 = build20MinTest(260);

  it('has correct preset id', () => {
    expect(test20.id).toBe('preset-20min-test');
  });

  it('contains a 1200-second effort segment', () => {
    const effort = test20.segments.find((s) => s.id === '20m-effort');
    expect(effort).toBeDefined();
    expect(effort!.durationSec).toBe(1200);
  });

  it('effort segment uses the provided ftpHint', () => {
    const effort = test20.segments.find((s) => s.id === '20m-effort')!;
    if (effort.target.type === 'watts') {
      expect(effort.target.watts).toBe(260);
    }
  });

  it('starts with warmup, ends with cooldown', () => {
    expect(test20.segments[0].kind).toBe('warmup');
    expect(test20.segments[test20.segments.length - 1].kind).toBe('cooldown');
  });

  it('total duration is at least 40 minutes', () => {
    expect(totalDurationSec(test20)).toBeGreaterThanOrEqual(2400);
  });
});

// ---------------------------------------------------------------------------
// estimateFtpFromSamples — ramp
// ---------------------------------------------------------------------------

describe('estimateFtpFromSamples (ramp)', () => {
  it('returns null for empty samples', () => {
    expect(estimateFtpFromSamples([], 'ramp')).toBeNull();
  });

  it('returns null for samples with no power', () => {
    const noPower: TelemetrySample[] = Array.from({ length: 10 }, (_, i) => ({
      t: i * 1000,
      lat: 0, lon: 0, ele: 100, distance: 0, speed: 5, grade: 0,
    }));
    expect(estimateFtpFromSamples(noPower, 'ramp')).toBeNull();
  });

  it('estimates 75% of best 1-min average power', () => {
    // 70 samples at 300 W over 70 seconds — best 1-min avg ≈ 300 W
    const samples = makeSamples({ count: 70, power: 300, durationMs: 70_000 });
    const ftp = estimateFtpFromSamples(samples, 'ramp');
    expect(ftp).toBe(Math.round(300 * 0.75)); // 225 W
  });

  it('finds the peak 1-min window even when power varies', () => {
    // Low effort samples followed by high effort
    const low = makeSamples({ count: 60, power: 150, durationMs: 60_000 });
    const high = makeSamples({
      count: 60,
      power: 400,
      durationMs: 60_000,
      startT: 60_000,
    });
    const ftp = estimateFtpFromSamples([...low, ...high], 'ramp');
    // Best 1-min is all at 400 W → FTP estimate = 300 W
    expect(ftp).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// estimateFtpFromSamples — 20min
// ---------------------------------------------------------------------------

describe('estimateFtpFromSamples (20min)', () => {
  it('returns null for empty samples', () => {
    expect(estimateFtpFromSamples([], '20min')).toBeNull();
  });

  it('estimates 95% of 20-min average power for a long ride', () => {
    // 25 min of samples at constant 280 W
    const samples = makeSamples({ count: 1500, power: 280, durationMs: 25 * 60_000 });
    const ftp = estimateFtpFromSamples(samples, '20min');
    expect(ftp).toBe(Math.round(280 * 0.95)); // 266 W
  });

  it('uses entire ride when shorter than 20 min', () => {
    // 10 min at 300 W
    const samples = makeSamples({ count: 600, power: 300, durationMs: 10 * 60_000 });
    const ftp = estimateFtpFromSamples(samples, '20min');
    expect(ftp).toBe(Math.round(300 * 0.95)); // 285 W
  });

  it('finds the best 20-min window when power is mixed', () => {
    // 10 min at 200 W then 25 min at 320 W
    const easy = makeSamples({ count: 600, power: 200, durationMs: 10 * 60_000 });
    const hard = makeSamples({
      count: 1500,
      power: 320,
      durationMs: 25 * 60_000,
      startT: 10 * 60_000,
    });
    const ftp = estimateFtpFromSamples([...easy, ...hard], '20min');
    // Best 20-min window is all at 320 W → FTP = Math.round(320 * 0.95) = 304
    expect(ftp).toBe(Math.round(320 * 0.95));
  });
});

// ---------------------------------------------------------------------------
// ftpTestKindFromWorkoutId
// ---------------------------------------------------------------------------

describe('ftpTestKindFromWorkoutId', () => {
  it('identifies ramp test id', () => {
    expect(ftpTestKindFromWorkoutId('preset-ramp-test')).toBe('ramp');
  });

  it('identifies 20min test id', () => {
    expect(ftpTestKindFromWorkoutId('preset-20min-test')).toBe('20min');
  });

  it('returns null for unknown ids', () => {
    expect(ftpTestKindFromWorkoutId('some-other-workout')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FTP_TEST_WORKOUT_IDS set
// ---------------------------------------------------------------------------

describe('FTP_TEST_WORKOUT_IDS', () => {
  it('contains both preset ids', () => {
    expect(FTP_TEST_WORKOUT_IDS.has('preset-ramp-test')).toBe(true);
    expect(FTP_TEST_WORKOUT_IDS.has('preset-20min-test')).toBe(true);
  });
});
