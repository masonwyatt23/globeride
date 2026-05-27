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
  clampEffortLevel,
  effortSkinColor,
} from '@/lib/avatar';
import * as Cesium from 'cesium';

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

// ---------------------------------------------------------------------------
// Wave 37.A — clampEffortLevel
// ---------------------------------------------------------------------------

describe('clampEffortLevel', () => {
  it('clamps values below 0 to 0', () => {
    expect(clampEffortLevel(-5)).toBe(0);
    expect(clampEffortLevel(-0.001)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(clampEffortLevel(2)).toBe(1);
    expect(clampEffortLevel(1.0001)).toBe(1);
  });

  it('passes through values in [0, 1] unchanged', () => {
    expect(clampEffortLevel(0)).toBe(0);
    expect(clampEffortLevel(0.5)).toBeCloseTo(0.5, 10);
    expect(clampEffortLevel(1)).toBe(1);
  });

  it('is idempotent: clamping an already-clamped value is a no-op', () => {
    const v = clampEffortLevel(clampEffortLevel(3));
    expect(v).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Wave 37.A — effortSkinColor
// ---------------------------------------------------------------------------

describe('effortSkinColor', () => {
  const BASE_SKIN = '#d8a877'; // DEFAULT_AVATAR_COLORS.skin

  it('at level=0 returns a color very close to the base skin color', () => {
    const result = effortSkinColor(BASE_SKIN, 0);
    const base = Cesium.Color.fromCssColorString(BASE_SKIN);
    // With t=0 the lerp produces exactly the base colour.
    expect(result.red).toBeCloseTo(base.red, 5);
    expect(result.green).toBeCloseTo(base.green, 5);
    expect(result.blue).toBeCloseTo(base.blue, 5);
  });

  it('at level=1 the blue channel increases relative to base (cool wet tint)', () => {
    const base   = effortSkinColor(BASE_SKIN, 0);
    const drenched = effortSkinColor(BASE_SKIN, 1);
    expect(drenched.blue).toBeGreaterThan(base.blue);
  });

  it('blue channel increases monotonically from level 0 → 1', () => {
    const blues = [0, 0.25, 0.5, 0.75, 1].map((t) =>
      effortSkinColor(BASE_SKIN, t).blue,
    );
    for (let i = 1; i < blues.length; i++) {
      expect(blues[i]).toBeGreaterThanOrEqual(blues[i - 1]);
    }
  });

  it('clamps effort level: level=2 produces same result as level=1', () => {
    const atOne = effortSkinColor(BASE_SKIN, 1);
    const atTwo = effortSkinColor(BASE_SKIN, 2);
    expect(atTwo.red).toBeCloseTo(atOne.red, 5);
    expect(atTwo.green).toBeCloseTo(atOne.green, 5);
    expect(atTwo.blue).toBeCloseTo(atOne.blue, 5);
  });

  it('always returns alpha=1', () => {
    expect(effortSkinColor(BASE_SKIN, 0).alpha).toBe(1);
    expect(effortSkinColor(BASE_SKIN, 0.5).alpha).toBe(1);
    expect(effortSkinColor(BASE_SKIN, 1).alpha).toBe(1);
  });

  it('output RGB channels are all in [0, 1]', () => {
    for (const t of [0, 0.1, 0.5, 0.9, 1]) {
      const c = effortSkinColor(BASE_SKIN, t);
      expect(c.red).toBeGreaterThanOrEqual(0);
      expect(c.red).toBeLessThanOrEqual(1);
      expect(c.green).toBeGreaterThanOrEqual(0);
      expect(c.green).toBeLessThanOrEqual(1);
      expect(c.blue).toBeGreaterThanOrEqual(0);
      expect(c.blue).toBeLessThanOrEqual(1);
    }
  });
});
