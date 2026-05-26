import { describe, it, expect } from 'vitest';
import { estimatePowerFromGps } from '@/lib/outdoorPower';
import { powerRequired, solveVelocity, DEFAULT_RIDER } from '@/lib/physics';

// ---------------------------------------------------------------------------
// estimatePowerFromGps — correctness via round-trip with physics.ts
// ---------------------------------------------------------------------------

describe('estimatePowerFromGps', () => {
  it('returns 0 for near-zero speed', () => {
    expect(estimatePowerFromGps(0.1, 0, DEFAULT_RIDER)).toBe(0);
    expect(estimatePowerFromGps(0, 5, DEFAULT_RIDER)).toBe(0);
  });

  it('round-trips with powerRequired on flat ground', () => {
    // At 10 m/s on flat ground, powerRequired gives ~235 W.
    // estimatePowerFromGps should return the same value.
    const expected = powerRequired(10, 0, DEFAULT_RIDER);
    const estimated = estimatePowerFromGps(10, 0, DEFAULT_RIDER);
    expect(estimated).toBeCloseTo(expected, 0);
  });

  it('round-trips with powerRequired on a 5% climb', () => {
    const v = 6; // m/s
    const grade = 5;
    const expected = powerRequired(v, grade, DEFAULT_RIDER);
    const estimated = estimatePowerFromGps(v, grade, DEFAULT_RIDER);
    expect(estimated).toBeCloseTo(expected, 0);
  });

  it('round-trips with solveVelocity: speed from power should reproduce same power', () => {
    const targetPower = 200;
    const grade = 3;
    // Solve for the speed that corresponds to 200 W at 3% grade
    const speed = solveVelocity(targetPower, grade, DEFAULT_RIDER);
    // Now estimate power from that speed — should be close to 200 W
    const estimatedPower = estimatePowerFromGps(speed, grade, DEFAULT_RIDER);
    expect(estimatedPower).toBeCloseTo(targetPower, 0);
  });

  it('returns higher power for the same speed on steeper grades', () => {
    const v = 8; // m/s
    const p0 = estimatePowerFromGps(v, 0, DEFAULT_RIDER);
    const p5 = estimatePowerFromGps(v, 5, DEFAULT_RIDER);
    const p10 = estimatePowerFromGps(v, 10, DEFAULT_RIDER);
    expect(p5).toBeGreaterThan(p0);
    expect(p10).toBeGreaterThan(p5);
  });

  it('is capped at 1500 W maximum', () => {
    // Extremely fast speed on steep grade — must cap at 1500 W
    const p = estimatePowerFromGps(25, 20, DEFAULT_RIDER);
    expect(p).toBeLessThanOrEqual(1500);
  });

  it('floors at 0 W on steep descents (coasting)', () => {
    // Fast speed, steep downhill: raw power would be negative (gravity does the work)
    const p = estimatePowerFromGps(15, -10, DEFAULT_RIDER);
    expect(p).toBeGreaterThanOrEqual(0);
  });

  it('applies wind heading correctly', () => {
    // With a pure headwind (heading = 0, windDirection = 0 → relative = 0°)
    // power should be higher than with a tailwind.
    const headwind = {
      ...DEFAULT_RIDER,
      windSpeedMs: 5,
      windDirectionDeg: 0,
      headingDeg: 0,
    };
    const tailwind = {
      ...DEFAULT_RIDER,
      windSpeedMs: 5,
      windDirectionDeg: 180,
      headingDeg: 0,
    };
    const pHead = estimatePowerFromGps(8, 0, headwind);
    const pTail = estimatePowerFromGps(8, 0, tailwind);
    expect(pHead).toBeGreaterThan(pTail);
  });

  it('round-trips with different rider masses', () => {
    const heavyRider = { ...DEFAULT_RIDER, riderMassKg: 100, bikeMassKg: 10 };
    const v = 9;
    const grade = 4;
    const expected = powerRequired(v, grade, heavyRider);
    const estimated = estimatePowerFromGps(v, grade, heavyRider);
    expect(estimated).toBeCloseTo(expected, 0);
  });

  it('round-trips with MTB bike type (higher Crr)', () => {
    const mtb = { ...DEFAULT_RIDER, bikeType: 'mtb' as const };
    const v = 7;
    const grade = 2;
    const expected = powerRequired(v, grade, mtb);
    const estimated = estimatePowerFromGps(v, grade, mtb);
    expect(estimated).toBeCloseTo(expected, 0);
  });
});
