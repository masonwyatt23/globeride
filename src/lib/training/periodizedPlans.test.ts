import { describe, it, expect } from 'vitest';
import {
  PERIODIZED_PLANS,
  PERIODIZED_PLAN_IDS,
  workoutsForPlanDay,
  planProgress,
  workoutsForWeek,
  type PeriodizedPlan,
} from '@/lib/training/periodizedPlans';
import { PRESET_WORKOUTS } from '@/lib/presetWorkouts';

const presetIds = new Set(PRESET_WORKOUTS.map((w) => w.id));

// ---------------------------------------------------------------------------
// Catalog structure
// ---------------------------------------------------------------------------
describe('PERIODIZED_PLANS catalog', () => {
  it('exports exactly 3 plans', () => {
    expect(PERIODIZED_PLAN_IDS.length).toBe(3);
  });

  it('includes base-builder-6w, race-builder-8w, and sharpening-4w', () => {
    expect(PERIODIZED_PLAN_IDS).toContain('base-builder-6w');
    expect(PERIODIZED_PLAN_IDS).toContain('race-builder-8w');
    expect(PERIODIZED_PLAN_IDS).toContain('sharpening-4w');
  });

  it('every plan has a non-empty name, description, and positive durationWeeks', () => {
    for (const id of PERIODIZED_PLAN_IDS) {
      const plan = PERIODIZED_PLANS[id];
      expect(plan.name.length).toBeGreaterThan(0);
      expect(plan.description.length).toBeGreaterThan(0);
      expect(plan.durationWeeks).toBeGreaterThan(0);
    }
  });

  it('every plan has at least one scheduled day', () => {
    for (const id of PERIODIZED_PLAN_IDS) {
      expect(PERIODIZED_PLANS[id].days.length).toBeGreaterThan(0);
    }
  });

  it('every referenced workoutId exists in PRESET_WORKOUTS', () => {
    for (const id of PERIODIZED_PLAN_IDS) {
      const plan = PERIODIZED_PLANS[id];
      for (const pw of plan.days) {
        expect(
          presetIds.has(pw.workoutId),
          `Plan "${plan.name}" references unknown workoutId "${pw.workoutId}"`,
        ).toBe(true);
      }
    }
  });

  it('all dayOffsets are within plan bounds (0 to durationWeeks*7 - 1)', () => {
    for (const id of PERIODIZED_PLAN_IDS) {
      const plan = PERIODIZED_PLANS[id];
      const max = plan.durationWeeks * 7 - 1;
      for (const pw of plan.days) {
        expect(pw.dayOffset, `${plan.id} dayOffset ${pw.dayOffset}`).toBeGreaterThanOrEqual(0);
        expect(pw.dayOffset, `${plan.id} dayOffset ${pw.dayOffset}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('no plan has two workouts with the same workoutId on the same dayOffset', () => {
    for (const id of PERIODIZED_PLAN_IDS) {
      const plan = PERIODIZED_PLANS[id];
      const seen = new Set<string>();
      for (const pw of plan.days) {
        const key = `${pw.dayOffset}:${pw.workoutId}`;
        expect(seen.has(key), `Duplicate ${key} in plan ${plan.id}`).toBe(false);
        seen.add(key);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Plan-specific structure assertions
// ---------------------------------------------------------------------------
describe('base-builder-6w plan', () => {
  const plan: PeriodizedPlan = PERIODIZED_PLANS['base-builder-6w'];

  it('is 6 weeks long', () => {
    expect(plan.durationWeeks).toBe(6);
  });

  it('averages at least 4 sessions per week', () => {
    const avg = plan.days.length / plan.durationWeeks;
    expect(avg).toBeGreaterThanOrEqual(4);
  });

  it('goalFtpDeltaPct is positive', () => {
    expect(plan.goalFtpDeltaPct).toBeGreaterThan(0);
  });
});

describe('race-builder-8w plan', () => {
  const plan: PeriodizedPlan = PERIODIZED_PLANS['race-builder-8w'];

  it('is 8 weeks long', () => {
    expect(plan.durationWeeks).toBe(8);
  });

  it('references VO2-max workouts (the build block must include intensity)', () => {
    const hasVo2 = plan.days.some((pw) => pw.workoutId.includes('vo2'));
    expect(hasVo2).toBe(true);
  });

  it('references threshold workouts', () => {
    const hasThreshold = plan.days.some((pw) => pw.workoutId.includes('threshold'));
    expect(hasThreshold).toBe(true);
  });
});

describe('sharpening-4w plan', () => {
  const plan: PeriodizedPlan = PERIODIZED_PLANS['sharpening-4w'];

  it('is 4 weeks long', () => {
    expect(plan.durationWeeks).toBe(4);
  });

  it('has lower session count than race-builder (taper/peak is lower volume)', () => {
    const sharp = PERIODIZED_PLANS['sharpening-4w'];
    const race = PERIODIZED_PLANS['race-builder-8w'];
    const sharpPerWeek = sharp.days.length / sharp.durationWeeks;
    const racePerWeek = race.days.length / race.durationWeeks;
    expect(sharpPerWeek).toBeLessThanOrEqual(racePerWeek);
  });
});

// ---------------------------------------------------------------------------
// workoutsForPlanDay
// ---------------------------------------------------------------------------
describe('workoutsForPlanDay', () => {
  it('returns empty array for an unknown planId', () => {
    expect(workoutsForPlanDay('does-not-exist', 0)).toEqual([]);
  });

  it('returns empty array for a rest day (no workout scheduled)', () => {
    // Day 2 (Wed) of base-builder week 1 is a rest day
    const result = workoutsForPlanDay('base-builder-6w', 2);
    expect(result).toHaveLength(0);
  });

  it('returns the correct workout for a known scheduled day', () => {
    // Day 0 of base-builder-6w is preset-daily-30-easy
    const result = workoutsForPlanDay('base-builder-6w', 0);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].workoutId).toBe('preset-daily-30-easy');
  });
});

// ---------------------------------------------------------------------------
// workoutsForWeek
// ---------------------------------------------------------------------------
describe('workoutsForWeek', () => {
  it('returns empty array for unknown planId', () => {
    expect(workoutsForWeek('nope', 0)).toEqual([]);
  });

  it('week 0 of base-builder-6w has workouts', () => {
    const week0 = workoutsForWeek('base-builder-6w', 0);
    expect(week0.length).toBeGreaterThan(0);
  });

  it('all returned dayOffsets are within the week range', () => {
    for (const id of PERIODIZED_PLAN_IDS) {
      for (let w = 0; w < PERIODIZED_PLANS[id].durationWeeks; w++) {
        const days = workoutsForWeek(id, w);
        for (const pw of days) {
          expect(pw.dayOffset).toBeGreaterThanOrEqual(w * 7);
          expect(pw.dayOffset).toBeLessThan((w + 1) * 7);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// planProgress
// ---------------------------------------------------------------------------
describe('planProgress', () => {
  it('returns zero progress for unknown planId', () => {
    const r = planProgress('nope', new Date(), []);
    expect(r.completionPct).toBe(0);
    expect(r.nextWorkout).toBeNull();
  });

  it('completionPct is 0 when no workouts completed', () => {
    const r = planProgress('base-builder-6w', new Date(), []);
    expect(r.completionPct).toBe(0);
  });

  it('completionPct reaches 1.0 when all workouts are completed', () => {
    const plan = PERIODIZED_PLANS['base-builder-6w'];
    const allIds = plan.days.map((pw) => pw.workoutId);
    const r = planProgress('base-builder-6w', new Date(), allIds);
    expect(r.completionPct).toBe(1);
  });

  it('nextWorkout is null when all workouts are completed', () => {
    const plan = PERIODIZED_PLANS['base-builder-6w'];
    const allIds = plan.days.map((pw) => pw.workoutId);
    const r = planProgress('base-builder-6w', new Date(), allIds);
    expect(r.nextWorkout).toBeNull();
  });

  it('nextWorkout points to the first incomplete workout', () => {
    const plan = PERIODIZED_PLANS['base-builder-6w'];
    // Find the first workoutId that appears ONLY once in the plan so we can
    // leave just that one undone and confirm nextWorkout returns it.
    const idCounts = new Map<string, number>();
    for (const pw of plan.days) {
      idCounts.set(pw.workoutId, (idCounts.get(pw.workoutId) ?? 0) + 1);
    }
    const uniqueEntry = plan.days.find((pw) => (idCounts.get(pw.workoutId) ?? 0) === 1);
    if (!uniqueEntry) {
      // All IDs appear multiple times — just verify nextWorkout is non-null
      const r = planProgress('base-builder-6w', new Date(), []);
      expect(r.nextWorkout).not.toBeNull();
      return;
    }
    // Mark every workoutId done except the one that appears uniquely
    const doneIds = plan.days
      .filter((pw) => pw.workoutId !== uniqueEntry.workoutId)
      .map((pw) => pw.workoutId);
    const r = planProgress('base-builder-6w', new Date(), doneIds);
    // nextWorkout should be the unique undone entry
    expect(r.nextWorkout?.workoutId).toBe(uniqueEntry.workoutId);
  });

  it('dayInPlan is 0 when plan started today', () => {
    const r = planProgress('base-builder-6w', new Date(), []);
    expect(r.dayInPlan).toBe(0);
  });

  it('dayInPlan advances by 1 per calendar day', () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const r = planProgress('base-builder-6w', threeDaysAgo, []);
    expect(r.dayInPlan).toBe(3);
  });

  it('dayInPlan is clamped to the last day of the plan', () => {
    const plan = PERIODIZED_PLANS['base-builder-6w'];
    const wayBack = new Date();
    wayBack.setDate(wayBack.getDate() - 999);
    const r = planProgress('base-builder-6w', wayBack, []);
    expect(r.dayInPlan).toBeLessThanOrEqual(plan.durationWeeks * 7 - 1);
  });

  it('completionPct is between 0 and 1 for partial completion', () => {
    const plan = PERIODIZED_PLANS['race-builder-8w'];
    const halfIds = plan.days.slice(0, Math.floor(plan.days.length / 2)).map((pw) => pw.workoutId);
    const r = planProgress('race-builder-8w', new Date(), halfIds);
    expect(r.completionPct).toBeGreaterThan(0);
    expect(r.completionPct).toBeLessThan(1);
  });
});
