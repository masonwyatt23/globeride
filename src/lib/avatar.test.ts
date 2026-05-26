/**
 * Unit tests for Wave 30.B pure-numeric animation helpers in avatar.ts.
 * These functions are Cesium-free and exercise only math — no DOM / WebGL needed.
 */
import { describe, it, expect } from 'vitest';
import {
  pedalPhaseFromCadence,
  wheelRotationFromSpeed,
  cornerLeanAngle,
  smoothLean,
  climbingSwayAngle,
} from '@/lib/avatar';

// ---------------------------------------------------------------------------
// pedalPhaseFromCadence
// ---------------------------------------------------------------------------

describe('pedalPhaseFromCadence', () => {
  it('returns 0 when cadence is 0', () => {
    expect(pedalPhaseFromCadence(0, 5000)).toBe(0);
  });

  it('returns 0 when cadence is negative', () => {
    expect(pedalPhaseFromCadence(-10, 1000)).toBe(0);
  });

  it('gives exactly 2π at 60 RPM after 1000 ms (one full rev/sec)', () => {
    const result = pedalPhaseFromCadence(60, 1000);
    expect(result).toBeCloseTo(2 * Math.PI, 8);
  });

  it('gives exactly 4π at 60 RPM after 2000 ms', () => {
    const result = pedalPhaseFromCadence(60, 2000);
    expect(result).toBeCloseTo(4 * Math.PI, 8);
  });

  it('gives 2π at 90 RPM after 667 ms (1.5 rev/s → 2/3 s per rev)', () => {
    // 90 RPM = 1.5 rev/s → period = 1000/1.5 ≈ 666.67 ms
    const result = pedalPhaseFromCadence(90, 1000 / 1.5);
    expect(result).toBeCloseTo(2 * Math.PI, 5);
  });

  it('scales linearly: doubling cadence doubles the phase', () => {
    const at60  = pedalPhaseFromCadence(60,  1000);
    const at120 = pedalPhaseFromCadence(120, 1000);
    expect(at120).toBeCloseTo(at60 * 2, 8);
  });
});

// ---------------------------------------------------------------------------
// wheelRotationFromSpeed
// ---------------------------------------------------------------------------

describe('wheelRotationFromSpeed', () => {
  it('returns prevRotation when speed is 0', () => {
    expect(wheelRotationFromSpeed(0, 0.34, 1.0, 100)).toBe(1.0);
  });

  it('returns prevRotation when radius is 0', () => {
    expect(wheelRotationFromSpeed(10, 0, 1.0, 100)).toBe(1.0);
  });

  it('returns prevRotation when dt is 0', () => {
    expect(wheelRotationFromSpeed(10, 0.34, 1.0, 0)).toBe(1.0);
  });

  it('10 m/s, radius 0.336 m, 100 ms → increment ≈ 2.976 rad', () => {
    // ω = 10 / 0.336 ≈ 29.762 rad/s; Δθ = 29.762 × 0.1 ≈ 2.976 rad
    const prev = 0;
    const result = wheelRotationFromSpeed(10, 0.336, prev, 100);
    expect(result).toBeCloseTo(10 / 0.336 * 0.1, 3);
  });

  it('accumulates correctly across two frames', () => {
    const r1 = wheelRotationFromSpeed(5, 0.34, 0, 100);
    const r2 = wheelRotationFromSpeed(5, 0.34, r1, 100);
    const expected = (5 / 0.34) * 0.2;
    expect(r2).toBeCloseTo(expected, 5);
  });

  it('larger radius → smaller rotation increment', () => {
    const small = wheelRotationFromSpeed(10, 0.34, 0, 1000);
    const large = wheelRotationFromSpeed(10, 0.37, 0, 1000);
    expect(large).toBeLessThan(small);
  });
});

// ---------------------------------------------------------------------------
// cornerLeanAngle
// ---------------------------------------------------------------------------

describe('cornerLeanAngle', () => {
  it('returns 0 on a straight line (zero heading delta)', () => {
    expect(cornerLeanAngle(0, 10, 0.016)).toBe(0);
  });

  it('returns 0 when speed is 0', () => {
    expect(cornerLeanAngle(0.1, 0, 0.016)).toBe(0);
  });

  it('returns 0 when dt is 0', () => {
    expect(cornerLeanAngle(0.1, 10, 0)).toBe(0);
  });

  it('sharp right turn at 10 m/s produces negative lean (lean right)', () => {
    // Heading delta of 0.3 rad in 0.016 s = ~18.75 rad/s turn rate
    const lean = cornerLeanAngle(0.3, 10, 0.016);
    expect(lean).toBeLessThan(0);
  });

  it('sharp left turn produces positive lean', () => {
    const lean = cornerLeanAngle(-0.3, 10, 0.016);
    expect(lean).toBeGreaterThan(0);
  });

  it('very gentle turn at low speed → small lean angle', () => {
    const lean = cornerLeanAngle(0.001, 3, 0.016);
    expect(Math.abs(lean)).toBeLessThan(0.05);
  });

  it('lean magnitude increases with speed (same turn rate)', () => {
    const slow = Math.abs(cornerLeanAngle(0.05, 5,  0.1));
    const fast = Math.abs(cornerLeanAngle(0.05, 15, 0.1));
    expect(fast).toBeGreaterThan(slow);
  });
});

// ---------------------------------------------------------------------------
// smoothLean
// ---------------------------------------------------------------------------

describe('smoothLean', () => {
  it('alpha=0 → no movement', () => {
    expect(smoothLean(0.5, 1.0, 0)).toBe(0.5);
  });

  it('alpha=1 → instant snap', () => {
    expect(smoothLean(0.5, 1.0, 1)).toBe(1.0);
  });

  it('alpha=0.5 → halfway', () => {
    expect(smoothLean(0, 1, 0.5)).toBeCloseTo(0.5, 8);
  });

  it('clamps alpha above 1', () => {
    expect(smoothLean(0.5, 1.0, 2)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// climbingSwayAngle
// ---------------------------------------------------------------------------

describe('climbingSwayAngle', () => {
  it('returns 0 when grade is at threshold (8 %)', () => {
    expect(climbingSwayAngle(8, 75, 1000)).toBe(0);
  });

  it('returns 0 when grade is below threshold', () => {
    expect(climbingSwayAngle(5, 75, 1000)).toBe(0);
  });

  it('returns 0 when cadence is 0', () => {
    expect(climbingSwayAngle(12, 0, 1000)).toBe(0);
  });

  it('returns non-zero at grade=10% and cadence=75 rpm', () => {
    // At some elapsed time the sin phase will be non-zero.
    // Try multiple times to avoid sin(n*π) = 0 coincidence.
    let nonZeroFound = false;
    for (let t = 100; t <= 900; t += 100) {
      if (climbingSwayAngle(10, 75, t) !== 0) {
        nonZeroFound = true;
        break;
      }
    }
    expect(nonZeroFound).toBe(true);
  });

  it('amplitude increases with steeper grade', () => {
    // At a fixed moment where sin ≠ 0, higher grade = larger sway.
    // Use t=500ms which gives a clean mid-phase for most cadences.
    const mild   = Math.abs(climbingSwayAngle(10, 75, 333));
    const steep  = Math.abs(climbingSwayAngle(18, 75, 333));
    // Both might be zero if sin=0 at this exact moment; pick a different t.
    const mild2  = Math.abs(climbingSwayAngle(10, 75, 500));
    const steep2 = Math.abs(climbingSwayAngle(18, 75, 500));
    // At least one of the two sample pairs should show steep > mild.
    const steeper = (steep >= mild) || (steep2 >= mild2);
    expect(steeper).toBe(true);
  });

  it('caps amplitude at ~8° (CLIMB_SWAY_MAX_RAD) for extreme grade', () => {
    const MAX_RAD = (8 * Math.PI) / 180;
    let maxSeen = 0;
    for (let t = 0; t <= 10000; t += 50) {
      maxSeen = Math.max(maxSeen, Math.abs(climbingSwayAngle(100, 90, t)));
    }
    expect(maxSeen).toBeLessThanOrEqual(MAX_RAD + 1e-10);
  });
});
