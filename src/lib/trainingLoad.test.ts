import { describe, it, expect } from 'vitest';
import {
  rideToTss,
  classifyForm,
  computeTrainingLoad,
  toDateKey,
  type RideSummary,
} from '@/lib/trainingLoad';

// ---------------------------------------------------------------------------
// rideToTss
// ---------------------------------------------------------------------------

describe('rideToTss', () => {
  it('returns 0 for a zero-duration ride', () => {
    const ride: RideSummary = { startedAt: 0, durationSec: 0, avgPower: 200 };
    expect(rideToTss(ride, 250)).toBe(0);
  });

  it('computes TSS for a 1-hour ride at FTP (IF=1.0)', () => {
    // 1 h × 1.0² × 100 = 100
    const ride: RideSummary = { startedAt: 0, durationSec: 3600, avgPower: 250 };
    expect(rideToTss(ride, 250)).toBe(100);
  });

  it('computes TSS for a 2-hour ride at 0.75 FTP', () => {
    // 2 h × 0.75² × 100 = 112.5 → rounds to 113
    const ride: RideSummary = { startedAt: 0, durationSec: 7200, avgPower: 187 };
    const result = rideToTss(ride, 250);
    expect(result).toBeGreaterThan(100);
    expect(result).toBeLessThan(130);
  });

  it('uses default IF=0.65 when no power data', () => {
    // 1 h × 0.65² × 100 = 42.25 → 42
    const ride: RideSummary = { startedAt: 0, durationSec: 3600, avgPower: 0 };
    expect(rideToTss(ride, 250)).toBe(42);
  });

  it('uses default IF=0.65 when FTP is 0', () => {
    const ride: RideSummary = { startedAt: 0, durationSec: 3600, avgPower: 200 };
    expect(rideToTss(ride, 0)).toBe(42);
  });

  it('caps IF at 2.0 to guard against bad data', () => {
    // avgPower 1000 W / FTP 100 W would be IF=10, should be capped at 2
    // 1 h × 4 × 100 = 400
    const ride: RideSummary = { startedAt: 0, durationSec: 3600, avgPower: 1000 };
    expect(rideToTss(ride, 100)).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// classifyForm
// ---------------------------------------------------------------------------

describe('classifyForm', () => {
  it('returns Fresh for TSB > 25', () => {
    expect(classifyForm(30)).toBe('Fresh');
    expect(classifyForm(26)).toBe('Fresh');
  });

  it('returns Optimal for TSB in (5, 25]', () => {
    expect(classifyForm(25)).toBe('Optimal');
    expect(classifyForm(10)).toBe('Optimal');
    expect(classifyForm(6)).toBe('Optimal');
  });

  it('returns Neutral for TSB in (-10, 5]', () => {
    expect(classifyForm(5)).toBe('Neutral');
    expect(classifyForm(0)).toBe('Neutral');
    expect(classifyForm(-9)).toBe('Neutral');
  });

  it('returns Tired for TSB in (-30, -10]', () => {
    expect(classifyForm(-10)).toBe('Tired');
    expect(classifyForm(-20)).toBe('Tired');
    expect(classifyForm(-29)).toBe('Tired');
  });

  it('returns Very Tired for TSB <= -30', () => {
    expect(classifyForm(-30)).toBe('Very Tired');
    expect(classifyForm(-50)).toBe('Very Tired');
  });
});

// ---------------------------------------------------------------------------
// toDateKey
// ---------------------------------------------------------------------------

describe('toDateKey', () => {
  it('formats a date as YYYY-MM-DD using local time', () => {
    const d = new Date(2025, 5, 7); // June 7 2025 local
    expect(toDateKey(d)).toBe('2025-06-07');
  });

  it('pads month and day with leading zeros', () => {
    const d = new Date(2025, 0, 1); // Jan 1
    expect(toDateKey(d)).toBe('2025-01-01');
  });
});

// ---------------------------------------------------------------------------
// computeTrainingLoad
// ---------------------------------------------------------------------------

describe('computeTrainingLoad', () => {
  it('returns zero series when no rides are given', () => {
    const today = new Date(2025, 0, 20);
    const result = computeTrainingLoad([], 250, today);
    expect(result.series).toHaveLength(1);
    expect(result.series[0].ctl).toBe(0);
    expect(result.today.hasData).toBe(false);
    expect(result.today.formLabel).toBe('Neutral');
  });

  it('returns hasData=false for fewer than 7 days of history', () => {
    const today = new Date(2025, 0, 5);
    const rides: RideSummary[] = [
      { startedAt: new Date(2025, 0, 4).getTime(), durationSec: 3600, avgPower: 200 },
    ];
    const result = computeTrainingLoad(rides, 250, today);
    expect(result.today.hasData).toBe(false);
  });

  it('returns hasData=true for 7+ days of history', () => {
    const today = new Date(2025, 0, 20);
    const rides: RideSummary[] = [
      { startedAt: new Date(2025, 0, 10).getTime(), durationSec: 3600, avgPower: 200 },
    ];
    const result = computeTrainingLoad(rides, 250, today);
    // 10 days span → hasData true
    expect(result.today.hasData).toBe(true);
  });

  it('CTL grows monotonically with repeated daily rides at same load', () => {
    // 14 daily rides, all same TSS
    const rides: RideSummary[] = Array.from({ length: 14 }, (_, i) => ({
      startedAt: new Date(2025, 0, i + 1).getTime(),
      durationSec: 3600,
      avgPower: 200,
    }));
    const today = new Date(2025, 0, 15);
    const { series } = computeTrainingLoad(rides, 250, today);
    // CTL should strictly increase across the first 14 days
    for (let i = 1; i < series.length - 1; i++) {
      expect(series[i].ctl).toBeGreaterThanOrEqual(series[i - 1].ctl);
    }
  });

  it('TSB starts near 0 and goes negative under heavy training', () => {
    const rides: RideSummary[] = Array.from({ length: 10 }, (_, i) => ({
      startedAt: new Date(2025, 0, i + 1).getTime(),
      durationSec: 3600,
      avgPower: 350, // very hard
    }));
    const today = new Date(2025, 0, 12);
    const { today: summary } = computeTrainingLoad(rides, 250, today);
    // 10 days of hard training → fatigue > fitness → form negative
    expect(summary.form).toBeLessThan(0);
  });

  it('series spans from first ride date to today', () => {
    const firstRide = new Date(2025, 0, 1);
    const today = new Date(2025, 0, 10);
    const rides: RideSummary[] = [
      { startedAt: firstRide.getTime(), durationSec: 3600, avgPower: 200 },
    ];
    const { series } = computeTrainingLoad(rides, 250, today);
    expect(series[0].date).toBe('2025-01-01');
    expect(series[series.length - 1].date).toBe('2025-01-10');
    expect(series).toHaveLength(10);
  });

  it('accumulates multiple rides on the same day into a single TSS entry', () => {
    const day = new Date(2025, 0, 5).getTime();
    const today = new Date(2025, 0, 5);
    const rides: RideSummary[] = [
      { startedAt: day, durationSec: 3600, avgPower: 250 }, // TSS=100
      { startedAt: day + 1000, durationSec: 3600, avgPower: 250 }, // TSS=100
    ];
    const { series } = computeTrainingLoad(rides, 250, today);
    const rideDay = series.find((s) => s.date === '2025-01-05');
    expect(rideDay?.tss).toBe(200);
  });
});
