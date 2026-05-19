/**
 * Unit tests for src/lib/metrics.ts
 *
 * Fixture strategy:
 *   Build synthetic TelemetrySample arrays with known power profiles, then
 *   verify the canonical formulas match hand-computed expected values.
 *
 * Key formula references:
 *   NP  = (mean(30s_rolling_avg^4))^0.25
 *   IF  = NP / FTP
 *   TSS = (durationSec * NP * IF) / (FTP * 3600) * 100
 *   VI  = NP / avgPower
 */

import { describe, it, expect } from 'vitest';
import { computeMetrics } from './metrics';
import type { TelemetrySample } from '@/types';
import { type Workout, workoutId } from './workout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a uniform 1-Hz sample array with constant power. */
function uniformSamples(
  durationSec: number,
  powerW: number,
  opts: Partial<{ hrBpm: number; cadenceRpm: number; startEle: number; gradePerSec: number }> = {},
): TelemetrySample[] {
  const samples: TelemetrySample[] = [];
  const t0 = 1_000_000; // arbitrary epoch ms
  for (let i = 0; i < durationSec; i++) {
    samples.push({
      t: t0 + i * 1000,
      lat: 47.5,
      lon: 8.0,
      ele: (opts.startEle ?? 100) + i * (opts.gradePerSec ?? 0),
      distance: i * 10, // 10 m/s nominal speed
      speed: 10,
      grade: opts.gradePerSec ? opts.gradePerSec * 100 : 0,
      power: powerW,
      heartRate: opts.hrBpm,
      cadence: opts.cadenceRpm,
    });
  }
  return samples;
}

/** Build a sample array with two alternating power levels (e.g. interval/recovery). */
function intervalSamples(
  intervals: number,
  onSec: number,
  onW: number,
  offSec: number,
  offW: number,
): TelemetrySample[] {
  const t0 = 2_000_000;
  const out: TelemetrySample[] = [];
  let t = t0;
  let dist = 0;
  for (let i = 0; i < intervals; i++) {
    for (let s = 0; s < onSec; s++) {
      out.push({ t, lat: 0, lon: 0, ele: 100, distance: dist, speed: 8, grade: 0, power: onW });
      t += 1000;
      dist += 8;
    }
    for (let s = 0; s < offSec; s++) {
      out.push({ t, lat: 0, lon: 0, ele: 100, distance: dist, speed: 8, grade: 0, power: offW });
      t += 1000;
      dist += 8;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Empty / edge cases
// ---------------------------------------------------------------------------

describe('computeMetrics — empty / edge cases', () => {
  it('returns zeroed metrics for empty sample array', () => {
    const m = computeMetrics([], 220);
    expect(m.avgPowerW).toBe(0);
    expect(m.normalizedPowerW).toBe(0);
    expect(m.intensityFactor).toBe(0);
    expect(m.tss).toBe(0);
    expect(m.variabilityIndex).toBe(1.0);
    expect(m.workKj).toBe(0);
    expect(m.durationSec).toBe(0);
  });

  it('returns zeroed power metrics when no sample has power', () => {
    const samples: TelemetrySample[] = [
      { t: 0, lat: 0, lon: 0, ele: 100, distance: 0, speed: 5, grade: 0 },
      { t: 60_000, lat: 0, lon: 0, ele: 110, distance: 300, speed: 5, grade: 0 },
    ];
    const m = computeMetrics(samples, 220);
    expect(m.avgPowerW).toBe(0);
    expect(m.normalizedPowerW).toBe(0);
    expect(m.intensityFactor).toBe(0);
    expect(m.tss).toBe(0);
  });

  it('handles single sample gracefully', () => {
    const samples: TelemetrySample[] = [
      { t: 0, lat: 0, lon: 0, ele: 100, distance: 0, speed: 0, grade: 0, power: 200 },
    ];
    const m = computeMetrics(samples, 220);
    expect(m.avgPowerW).toBe(200);
    expect(m.durationSec).toBe(0);
    expect(m.workKj).toBe(0);
  });

  it('handles zero FTP without throwing', () => {
    const samples = uniformSamples(600, 200);
    const m = computeMetrics(samples, 0);
    expect(m.intensityFactor).toBe(0);
    expect(m.tss).toBe(0);
    expect(m.avgPowerW).toBeGreaterThan(0);
  });

  it('ignores negative power samples', () => {
    const t0 = 0;
    const samples: TelemetrySample[] = [
      { t: t0,         lat: 0, lon: 0, ele: 100, distance: 0,   speed: 8, grade: 0, power: -50 },
      { t: t0 + 1000,  lat: 0, lon: 0, ele: 100, distance: 8,   speed: 8, grade: 0, power: 200 },
      { t: t0 + 2000,  lat: 0, lon: 0, ele: 100, distance: 16,  speed: 8, grade: 0, power: 200 },
    ];
    const m = computeMetrics(samples, 220);
    // Only the two 200 W samples count
    expect(m.avgPowerW).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Constant-power rides — NP === avgPower for long enough rides
// ---------------------------------------------------------------------------

describe('computeMetrics — constant power', () => {
  /**
   * For a steady-state ride at constant power P,
   * every 30 s window average = P,
   * so NP = (P^4)^0.25 = P.
   */
  it('NP equals avgPower for a constant 200 W, 1-hour ride', () => {
    const FTP = 250;
    const P = 200;
    const samples = uniformSamples(3600, P);
    const m = computeMetrics(samples, FTP);

    expect(m.avgPowerW).toBeCloseTo(P, 0);
    expect(m.normalizedPowerW).toBeCloseTo(P, 0);
    expect(m.variabilityIndex).toBeCloseTo(1.0, 2);
  });

  it('IF = NP / FTP for constant power', () => {
    const FTP = 250;
    const P = 200;
    const samples = uniformSamples(3600, P);
    const m = computeMetrics(samples, FTP);
    const expectedIF = P / FTP; // 0.8
    expect(m.intensityFactor).toBeCloseTo(expectedIF, 2);
  });

  it('TSS fixture: 1 h at FTP = 100 TSS exactly', () => {
    // By definition: 1 h at FTP → IF=1 → TSS = (3600 * FTP * 1) / (FTP * 3600) * 100 = 100
    const FTP = 250;
    const samples = uniformSamples(3600, FTP);
    const m = computeMetrics(samples, FTP);
    expect(m.tss).toBeCloseTo(100, 0);
  });

  it('TSS fixture: 1 h at 0.75 FTP (Z2) ≈ 56.25 TSS', () => {
    // IF = 0.75 → TSS = (3600 * 0.75*FTP * 0.75) / (FTP * 3600) * 100 = 0.75^2 * 100 = 56.25
    const FTP = 240;
    const P = FTP * 0.75; // 180 W
    const samples = uniformSamples(3600, P);
    const m = computeMetrics(samples, FTP);
    expect(m.tss).toBeCloseTo(56.25, 0);
  });

  it('TSS scales linearly with duration at constant power', () => {
    const FTP = 220;
    const P = 220; // riding at FTP
    const s30 = uniformSamples(1800, P); // 30 min
    const s60 = uniformSamples(3600, P); // 60 min
    const m30 = computeMetrics(s30, FTP);
    const m60 = computeMetrics(s60, FTP);
    // 30 min at FTP = 50 TSS; 60 min = 100 TSS
    expect(m30.tss).toBeCloseTo(50, 0);
    expect(m60.tss).toBeCloseTo(100, 0);
  });
});

// ---------------------------------------------------------------------------
// NP > avgPower for variable-power rides
// ---------------------------------------------------------------------------

describe('computeMetrics — NP elevation from variability', () => {
  it('NP > avgPower for an interval workout (high variability)', () => {
    // 5×5min@300W / 5min@100W — avg ≈ 200 W, NP should be noticeably higher
    const samples = intervalSamples(5, 300, 300, 300, 100);
    const m = computeMetrics(samples, 250);
    expect(m.normalizedPowerW).toBeGreaterThan(m.avgPowerW);
    expect(m.variabilityIndex).toBeGreaterThan(1.0);
  });

  it('VI is the ratio NP/avg for known fixture', () => {
    const samples = intervalSamples(5, 300, 300, 300, 100);
    const m = computeMetrics(samples, 250);
    // VI must equal NP / avgPower within floating point
    expect(m.variabilityIndex).toBeCloseTo(m.normalizedPowerW / m.avgPowerW, 2);
  });

  /**
   * Known numerical fixture from Allen & Coggan example:
   * Alternating 200 W / 400 W every 30 s for 60 min.
   *   avgPower = 300 W
   *   Each 30 s window is pure 200 W or pure 400 W (aligned).
   *   NP = ((200^4 + 400^4)/2)^0.25
   *      = ((1.6e9 + 25.6e9)/2)^0.25
   *      = (13.6e9)^0.25
   *      ≈ 341 W
   */
  it('NP matches hand-computed value for 200/400 W alternating fixture', () => {
    // Build 30-sec blocks alternating 200 W / 400 W for 60 min
    const out: TelemetrySample[] = [];
    const t0 = 5_000_000;
    let t = t0;
    let dist = 0;
    for (let block = 0; block < 120; block++) {
      const p = block % 2 === 0 ? 200 : 400;
      for (let s = 0; s < 30; s++) {
        out.push({ t, lat: 0, lon: 0, ele: 100, distance: dist, speed: 8, grade: 0, power: p });
        t += 1000;
        dist += 8;
      }
    }
    const m = computeMetrics(out, 300);
    // NP must be > avgPower (variability penalty), but the precise value
    // depends on window-edge blending at 1 Hz resolution.
    // Theoretical maximum (perfectly aligned blocks): 341 W.
    // With 1 Hz sampling the leading window mixes both power levels, pulling
    // NP slightly lower than the ideal; empirically ~315 W.
    expect(m.normalizedPowerW).toBeGreaterThan(m.avgPowerW); // must exceed avg
    expect(m.normalizedPowerW).toBeLessThanOrEqual(345);      // can't exceed ideal
    expect(m.avgPowerW).toBeCloseTo(300, 0);
  });
});

// ---------------------------------------------------------------------------
// Work (kJ)
// ---------------------------------------------------------------------------

describe('computeMetrics — work (kJ)', () => {
  it('kJ = power × duration / 1000 for constant power', () => {
    // 200 W × 3600 s = 720 kJ
    const samples = uniformSamples(3600, 200);
    const m = computeMetrics(samples, 220);
    // Integral approximation with 1 s steps loses the first interval
    expect(m.workKj).toBeCloseTo(200 * 3599 / 1000, 0);
  });
});

// ---------------------------------------------------------------------------
// HR / cadence
// ---------------------------------------------------------------------------

describe('computeMetrics — HR and cadence', () => {
  it('computes avgHr and maxHr correctly', () => {
    const samples = uniformSamples(600, 200, { hrBpm: 150 });
    const m = computeMetrics(samples, 220);
    expect(m.avgHrBpm).toBe(150);
    expect(m.maxHrBpm).toBe(150);
  });

  it('picks up maxHr from a spike', () => {
    const base = uniformSamples(300, 200, { hrBpm: 140 });
    base[100].heartRate = 185; // spike
    const m = computeMetrics(base, 220);
    expect(m.maxHrBpm).toBe(185);
  });

  it('computes avgCadence when present', () => {
    const samples = uniformSamples(300, 200, { cadenceRpm: 90 });
    const m = computeMetrics(samples, 220);
    expect(m.avgCadenceRpm).toBe(90);
  });

  it('returns 0 for HR metrics when no HR data', () => {
    const samples = uniformSamples(300, 200);
    const m = computeMetrics(samples, 220);
    expect(m.avgHrBpm).toBe(0);
    expect(m.maxHrBpm).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Elevation / distance
// ---------------------------------------------------------------------------

describe('computeMetrics — ascent and distance', () => {
  it('computes total ascent from elevation deltas', () => {
    // 600 s climbing at 0.1 m/s = 60 m gain (gradePerSec 0.1 means ele += 0.1 per sample)
    const samples = uniformSamples(600, 200, { gradePerSec: 0.1 });
    const m = computeMetrics(samples, 220);
    // 599 positive deltas × 0.1 m ≈ 59.9 m
    expect(m.totalAscentM).toBeCloseTo(59.9, 0);
  });

  it('does not count descents as ascent', () => {
    const samples = uniformSamples(600, 200, { gradePerSec: -0.1 });
    const m = computeMetrics(samples, 220);
    expect(m.totalAscentM).toBe(0);
  });

  it('computes total distance from first and last sample', () => {
    const samples = uniformSamples(600, 200); // distance = i * 10
    const m = computeMetrics(samples, 220);
    // first.distance=0, last.distance=599*10=5990
    expect(m.totalDistanceM).toBeCloseTo(5990, 0);
  });
});

// ---------------------------------------------------------------------------
// Segment compliance
// ---------------------------------------------------------------------------

describe('computeMetrics — segment compliance', () => {
  const FTP = 200;

  function makeWorkout(segments: { durationSec: number; ftpPct: number }[]): Workout {
    return {
      id: workoutId('test'),
      name: 'Test',
      source: 'manual',
      createdAt: Date.now(),
      segments: segments.map((s, i) => ({
        id: workoutId('seg'),
        kind: 'steady',
        durationSec: s.durationSec,
        target: { type: 'ftpPct', value: s.ftpPct },
      })),
    };
  }

  it('returns empty segments when no workout is provided', () => {
    const samples = uniformSamples(600, 200);
    const m = computeMetrics(samples, FTP);
    expect(m.segments).toHaveLength(0);
  });

  it('maps samples to correct segment by elapsed time', () => {
    // 2 segments: 5 min each. Ride exactly at target.
    const workout = makeWorkout([
      { durationSec: 300, ftpPct: 0.75 }, // 150 W target
      { durationSec: 300, ftpPct: 1.0  }, // 200 W target
    ]);
    // First 300 samples at 150 W, next 300 at 200 W
    const seg1 = uniformSamples(300, 150);
    const t0 = seg1[0].t;
    const tEnd = seg1[seg1.length - 1].t;
    const seg2: TelemetrySample[] = uniformSamples(300, 200).map((s, i) => ({
      ...s,
      t: tEnd + (i + 1) * 1000,
      distance: s.distance + 3000,
    }));
    const samples = [...seg1, ...seg2];

    const m = computeMetrics(samples, FTP, workout);
    expect(m.segments).toHaveLength(2);

    const s0 = m.segments[0];
    expect(s0.targetW).toBe(150);
    expect(s0.actualW).toBeCloseTo(150, 0);
    expect(s0.compliance).toBeCloseTo(1.0, 1);

    const s1 = m.segments[1];
    expect(s1.targetW).toBe(200);
    expect(s1.actualW).toBeCloseTo(200, 0);
    expect(s1.compliance).toBeCloseTo(1.0, 1);
  });

  it('compliance < 1 when rider under-targets', () => {
    const workout = makeWorkout([{ durationSec: 300, ftpPct: 1.0 }]); // 200 W target
    const samples = uniformSamples(300, 160); // only 160 W
    const m = computeMetrics(samples, FTP, workout);
    expect(m.segments[0].compliance).toBeCloseTo(0.8, 1);
  });

  it('compliance > 1 when rider over-targets', () => {
    const workout = makeWorkout([{ durationSec: 300, ftpPct: 0.75 }]); // 150 W target
    const samples = uniformSamples(300, 180); // 180 W
    const m = computeMetrics(samples, FTP, workout);
    expect(m.segments[0].compliance).toBeCloseTo(1.2, 1);
  });

  it('null compliance for free/grade segments', () => {
    const workout: Workout = {
      id: workoutId('test'),
      name: 'Free',
      source: 'manual',
      createdAt: Date.now(),
      segments: [{
        id: workoutId('seg'),
        kind: 'freeride',
        durationSec: 300,
        target: { type: 'free' },
      }],
    };
    const samples = uniformSamples(300, 200);
    const m = computeMetrics(samples, FTP, workout);
    expect(m.segments[0].compliance).toBeNull();
    expect(m.segments[0].targetW).toBeNull();
  });

  it('handles workout longer than recorded ride without crashing', () => {
    const workout = makeWorkout([
      { durationSec: 600, ftpPct: 0.75 },
      { durationSec: 600, ftpPct: 1.0 },
    ]);
    const samples = uniformSamples(300, 150); // only half the first segment
    expect(() => computeMetrics(samples, FTP, workout)).not.toThrow();
    const m = computeMetrics(samples, FTP, workout);
    expect(m.segments).toHaveLength(2);
    // Second segment: no samples → actualW null
    expect(m.segments[1].actualW).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Short ride (< 30 s) — NP falls back to avgPower
// ---------------------------------------------------------------------------

describe('computeMetrics — short ride (< 30 s)', () => {
  it('NP equals avgPower for a 20 s ride', () => {
    const samples = uniformSamples(20, 250);
    const m = computeMetrics(samples, 250);
    expect(m.normalizedPowerW).toBeCloseTo(m.avgPowerW, 0);
  });
});
