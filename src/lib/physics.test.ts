import { describe, it, expect } from 'vitest';
import {
  deriveCoefficients,
  powerRequired,
  solveVelocity,
  ftmsCrr,
  ftmsCw,
  DEFAULT_RIDER,
  type RiderParams,
} from '@/lib/physics';

describe('deriveCoefficients', () => {
  it('sums rider + bike mass and maps presets', () => {
    const c = deriveCoefficients(DEFAULT_RIDER);
    expect(c.mass).toBe(83); // 75 + 8
    expect(c.crr).toBe(0.004); // road
    expect(c.cdA).toBe(0.32); // hoods
    expect(c.headwindMs).toBe(0);
  });

  it('projects wind onto the forward axis by direction', () => {
    const head: RiderParams = { ...DEFAULT_RIDER, windSpeedMs: 5, windDirectionDeg: 0 };
    const tail: RiderParams = { ...DEFAULT_RIDER, windSpeedMs: 5, windDirectionDeg: 180 };
    const cross: RiderParams = { ...DEFAULT_RIDER, windSpeedMs: 5, windDirectionDeg: 90 };
    expect(deriveCoefficients(head).headwindMs).toBeCloseTo(5, 6);
    expect(deriveCoefficients(tail).headwindMs).toBeCloseTo(-5, 6);
    expect(deriveCoefficients(cross).headwindMs).toBeCloseTo(0, 6);
  });
});

describe('powerRequired', () => {
  it('matches a hand-computed flat-ground value', () => {
    // 83 kg, road Crr 0.004, hoods CdA 0.32, rho 1.225, v=10 m/s, 0 % grade.
    // fRoll = 83*9.80665*0.004 ≈ 3.2558 N ; fAero = 0.5*1.225*0.32*100 = 19.6 N
    // wheel = 22.8558 * 10 = 228.558 W ; pedal = /0.97 ≈ 235.63 W
    const p = powerRequired(10, 0, DEFAULT_RIDER);
    expect(p).toBeGreaterThan(234.5);
    expect(p).toBeLessThan(236.5);
  });

  it('requires more power uphill than on the flat at the same speed', () => {
    expect(powerRequired(8, 6)).toBeGreaterThan(powerRequired(8, 0));
  });
});

describe('solveVelocity ∘ powerRequired round-trips', () => {
  for (const grade of [0, 2, 5]) {
    for (const v of [6, 9, 12]) {
      it(`recovers v=${v} m/s at ${grade}% grade`, () => {
        const power = powerRequired(v, grade);
        const vBack = solveVelocity(power, grade);
        expect(vBack).toBeCloseTo(v, 0); // within ~0.5 m/s
      });
    }
  }

  it('clamps to the documented [0.5, 27.8] m/s range', () => {
    expect(solveVelocity(5000, 0)).toBeLessThanOrEqual(27.8);
    expect(solveVelocity(5000, 0)).toBeGreaterThanOrEqual(0.5);
    expect(solveVelocity(0, 12)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('FTMS coefficient bytes', () => {
  it('encodes Crr and Cw in the units FTMS expects', () => {
    expect(ftmsCrr(DEFAULT_RIDER)).toBe(40); // 0.004 * 10000
    expect(ftmsCw(DEFAULT_RIDER)).toBe(32); // 0.32 * 100
    expect(ftmsCrr({ ...DEFAULT_RIDER, bikeType: 'mtb' })).toBe(140); // 0.014 * 10000
    expect(ftmsCw({ ...DEFAULT_RIDER, riderPosition: 'tops' })).toBe(40); // 0.40 * 100
  });
});
