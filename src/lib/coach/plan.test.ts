/**
 * plan.ts unit tests — pure module, no React, no DOM.
 *
 * Covers:
 *   - emptyPlan()              → fresh 7-null grid
 *   - setDay()                 → immutable update, OOB guard
 *   - shiftDaysToNextWeek()    → rotation by 1 (default) and N
 *   - todayDayIndex()          → JS Sun=0 → Mon=0 conversion
 *   - weeklyTSS()              → sums per-workout TSS
 *   - weeklyDurationSec()      → sums per-workout duration
 *   - weeklyIntensityFactor()  → duration-weighted IF
 *   - plannedDayCount() / isPlanEmpty()
 */

import { describe, it, expect } from 'vitest';

import {
  emptyPlan,
  setDay,
  shiftDaysToNextWeek,
  todayDayIndex,
  weeklyTSS,
  weeklyDurationSec,
  weeklyIntensityFactor,
  plannedDayCount,
  isPlanEmpty,
  DAY_LABELS_SHORT,
  DAY_LABELS_LONG,
  type WeeklyPlan,
} from '@/lib/coach/plan';
import type { Workout } from '@/lib/workout';

// ---------------------------------------------------------------------------
// Test fixtures — minimal Workout objects with hand-picked IF / duration.
// ---------------------------------------------------------------------------

function mkWorkout(opts: {
  id: string;
  name?: string;
  durationSec: number;
  ftpPct: number;
}): Workout {
  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    createdAt: 0,
    source: 'manual',
    segments: [
      {
        id: `${opts.id}-s1`,
        kind: 'steady',
        durationSec: opts.durationSec,
        target: { type: 'ftpPct', value: opts.ftpPct },
      },
    ],
  };
}

// Two distinguishable workouts used across multiple tests:
//   easy:  30 min @ 0.65 FTP  →  IF ≈ 0.65, TSS ≈ 21 @ ftp=220
//   hard:  60 min @ 1.00 FTP  →  IF = 1.00, TSS ≈ 100 @ ftp=220
const easy = mkWorkout({ id: 'w-easy', durationSec: 30 * 60, ftpPct: 0.65 });
const hard = mkWorkout({ id: 'w-hard', durationSec: 60 * 60, ftpPct: 1.0 });

// ---------------------------------------------------------------------------
// emptyPlan + day labels
// ---------------------------------------------------------------------------

describe('emptyPlan', () => {
  it('returns a 7-slot grid of nulls and starts at week 1', () => {
    const p = emptyPlan();
    expect(p.week).toBe(1);
    expect(p.days).toHaveLength(7);
    for (const d of p.days) {
      expect(d).toBeNull();
    }
  });

  it('honours the optional starting week argument', () => {
    expect(emptyPlan(5).week).toBe(5);
  });

  it('returns a brand-new tuple each call (not a shared mutable singleton)', () => {
    const a = emptyPlan();
    const b = emptyPlan();
    expect(a.days).not.toBe(b.days);
    // mutating `a` must not leak into `b`
    (a.days as unknown as (Workout | null)[])[0] = hard;
    expect(b.days[0]).toBeNull();
  });
});

describe('day-label constants', () => {
  it('expose Mon..Sun in canonical order', () => {
    expect(DAY_LABELS_SHORT).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(DAY_LABELS_LONG).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ]);
  });
});

// ---------------------------------------------------------------------------
// setDay
// ---------------------------------------------------------------------------

describe('setDay', () => {
  it('places a workout in the requested slot without touching the others', () => {
    const p = setDay(emptyPlan(), 2, hard); // Wednesday
    expect(p.days[2]).toBe(hard);
    for (let i = 0; i < 7; i++) {
      if (i !== 2) expect(p.days[i]).toBeNull();
    }
  });

  it('returns a new object — original is untouched (immutability)', () => {
    const p = emptyPlan();
    const next = setDay(p, 0, easy);
    expect(p.days[0]).toBeNull();      // original unchanged
    expect(next.days[0]).toBe(easy);   // copy updated
    expect(next).not.toBe(p);
  });

  it('clears a slot when given null', () => {
    const filled = setDay(emptyPlan(), 1, hard);
    const cleared = setDay(filled, 1, null);
    expect(cleared.days[1]).toBeNull();
  });

  it('ignores out-of-range indices (no throw, returns input ref)', () => {
    const p = emptyPlan();
    expect(setDay(p, -1, hard)).toBe(p);
    expect(setDay(p, 7, hard)).toBe(p);
    expect(setDay(p, 1.5, hard)).toBe(p);
  });
});

// ---------------------------------------------------------------------------
// shiftDaysToNextWeek
// ---------------------------------------------------------------------------

describe('shiftDaysToNextWeek', () => {
  it('rotates by 1 day by default (Tue moves to Mon, Sun wraps to Sat)', () => {
    // Seed every slot with a distinct sentinel so order is observable.
    const seeded: WeeklyPlan = {
      week: 1,
      days: [
        mkWorkout({ id: 'd0', durationSec: 60, ftpPct: 0.5 }),
        mkWorkout({ id: 'd1', durationSec: 60, ftpPct: 0.5 }),
        mkWorkout({ id: 'd2', durationSec: 60, ftpPct: 0.5 }),
        mkWorkout({ id: 'd3', durationSec: 60, ftpPct: 0.5 }),
        mkWorkout({ id: 'd4', durationSec: 60, ftpPct: 0.5 }),
        mkWorkout({ id: 'd5', durationSec: 60, ftpPct: 0.5 }),
        mkWorkout({ id: 'd6', durationSec: 60, ftpPct: 0.5 }),
      ],
    };
    const next = shiftDaysToNextWeek(seeded);
    expect(next.week).toBe(2);
    // each slot i should now hold the old slot (i+1) % 7
    expect(next.days[0]?.id).toBe('d1');
    expect(next.days[1]?.id).toBe('d2');
    expect(next.days[5]?.id).toBe('d6');
    expect(next.days[6]?.id).toBe('d0'); // Sun wraps to old Mon
  });

  it('preserves nulls during the rotation', () => {
    const p = setDay(emptyPlan(), 3, hard); // Thu
    const next = shiftDaysToNextWeek(p);
    expect(next.days[2]).toBe(hard); // Thu workout now sits on Wed
    let nulls = 0;
    for (const d of next.days) if (d === null) nulls += 1;
    expect(nulls).toBe(6);
  });

  it('supports rotations larger than one day', () => {
    const p = setDay(emptyPlan(), 0, hard); // Mon
    const next = shiftDaysToNextWeek(p, 3);
    // After shifting by 3, slot (-3 mod 7) = 4 holds the workout
    // since out[i] = in[(i+3) % 7], so in[0] is at i such that (i+3)%7 === 0 → i = 4
    expect(next.days[4]).toBe(hard);
    expect(next.week).toBe(2);
  });

  it('bumps the week counter even when offset is zero', () => {
    const p = setDay(emptyPlan(), 0, hard);
    const next = shiftDaysToNextWeek(p, 0);
    expect(next.week).toBe(2);
    expect(next.days[0]).toBe(hard);
  });
});

// ---------------------------------------------------------------------------
// todayDayIndex
// ---------------------------------------------------------------------------

describe('todayDayIndex', () => {
  it('returns 0 for a Monday', () => {
    // 2024-01-01 was a Monday.
    expect(todayDayIndex(new Date('2024-01-01T12:00:00Z'))).toBe(0);
  });

  it('returns 6 for a Sunday', () => {
    // 2024-01-07 was a Sunday.
    expect(todayDayIndex(new Date('2024-01-07T12:00:00Z'))).toBe(6);
  });

  it('returns 2 for a Wednesday', () => {
    // 2024-01-03 was a Wednesday.
    expect(todayDayIndex(new Date('2024-01-03T12:00:00Z'))).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// weeklyTSS / weeklyDurationSec / weeklyIntensityFactor
// ---------------------------------------------------------------------------

describe('weeklyTSS', () => {
  it('sums TSS across the assigned days', () => {
    const ftp = 220;
    // Single 60-min @ FTP day → TSS ≈ 100. Two days = ≈ 200.
    const plan: WeeklyPlan = {
      week: 1,
      days: [hard, null, hard, null, null, null, null],
    };
    const total = weeklyTSS(plan, ftp);
    // estimateTSS uses (hours * intensity^2 * 100); two 60-min sessions at IF=1 → 200
    expect(total).toBe(200);
  });

  it('returns 0 when no days are assigned', () => {
    expect(weeklyTSS(emptyPlan(), 220)).toBe(0);
  });

  it('returns 0 when FTP is non-positive (guards divide-by-zero)', () => {
    const plan: WeeklyPlan = { week: 1, days: [hard, null, null, null, null, null, null] };
    expect(weeklyTSS(plan, 0)).toBe(0);
    expect(weeklyTSS(plan, -10)).toBe(0);
  });
});

describe('weeklyDurationSec', () => {
  it('sums duration across the assigned days', () => {
    const plan: WeeklyPlan = {
      week: 1,
      days: [easy, null, hard, null, easy, null, null],
    };
    // 30 + 60 + 30 = 120 minutes
    expect(weeklyDurationSec(plan)).toBe(120 * 60);
  });

  it('returns 0 for an empty plan', () => {
    expect(weeklyDurationSec(emptyPlan())).toBe(0);
  });
});

describe('weeklyIntensityFactor', () => {
  it('weights by duration, not by raw count', () => {
    // 30 min easy (0.65) + 60 min hard (1.00) →
    //   (30 * 0.65 + 60 * 1.0) / 90 = (19.5 + 60) / 90 ≈ 0.8833
    const plan: WeeklyPlan = {
      week: 1,
      days: [easy, hard, null, null, null, null, null],
    };
    const ifVal = weeklyIntensityFactor(plan);
    expect(ifVal).toBeCloseTo((30 * 0.65 + 60 * 1.0) / 90, 3);
  });

  it('returns 0 when every day is empty', () => {
    expect(weeklyIntensityFactor(emptyPlan())).toBe(0);
  });

  it('matches a single-day plan to that workouts IF', () => {
    const plan: WeeklyPlan = {
      week: 1,
      days: [hard, null, null, null, null, null, null],
    };
    // Hard workout = pure 1.0 FTP → IF = 1.0
    expect(weeklyIntensityFactor(plan)).toBeCloseTo(1.0, 5);
  });
});

// ---------------------------------------------------------------------------
// plannedDayCount / isPlanEmpty
// ---------------------------------------------------------------------------

describe('plannedDayCount / isPlanEmpty', () => {
  it('counts only non-null days', () => {
    const plan: WeeklyPlan = {
      week: 1,
      days: [hard, null, easy, null, hard, null, null],
    };
    expect(plannedDayCount(plan)).toBe(3);
    expect(isPlanEmpty(plan)).toBe(false);
  });

  it('reports zero for an empty plan', () => {
    expect(plannedDayCount(emptyPlan())).toBe(0);
    expect(isPlanEmpty(emptyPlan())).toBe(true);
  });

  it('reports 7 for a fully-loaded week', () => {
    const plan: WeeklyPlan = {
      week: 1,
      days: [hard, hard, hard, hard, hard, hard, hard],
    };
    expect(plannedDayCount(plan)).toBe(7);
    expect(isPlanEmpty(plan)).toBe(false);
  });
});
