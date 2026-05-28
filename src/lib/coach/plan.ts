/**
 * Manual weekly training plan — a 7-day grid the rider fills themselves.
 *
 * Sits alongside the AI Coach (which recommends what to ride based on
 * history) and the multi-week TrainingPlans library. This is the
 * hands-on alternative: pick a workout per day, see weekly TSS / IF,
 * shift the plan into next week when it rolls over.
 *
 * Days are indexed Mon..Sun (0..6) to match the existing TrainingPlans
 * grid and `DOW` labels — JS's `Date.getDay()` returns Sun=0, so callers
 * that derive "today" must convert via {@link todayDayIndex}.
 *
 * Pure module — no React/store imports, safe to unit-test.
 */

import {
  estimateTSS,
  intensityFactor as resolveIF,
  totalDurationSec,
  type Workout,
} from '@/lib/workout';

/**
 * Day slot in a weekly plan — either a workout assigned by the rider, or
 * an empty rest day (null).
 */
export type PlanDaySlot = Workout | null;

/**
 * Fixed-length tuple of 7 day slots, indexed Mon..Sun. A standalone
 * `readonly` tuple keeps the shape explicit at every callsite while still
 * being JSON-friendly for localStorage persistence.
 */
export type PlanDays = [
  PlanDaySlot,
  PlanDaySlot,
  PlanDaySlot,
  PlanDaySlot,
  PlanDaySlot,
  PlanDaySlot,
  PlanDaySlot,
];

/**
 * A single week of manual training. `week` is a monotonic counter that
 * bumps every time {@link shiftDaysToNextWeek} rotates the grid forward,
 * so the UI can show "Week 3" without storing absolute dates.
 */
export interface WeeklyPlan {
  /** Monotonic counter — bumped by shiftToNextWeek. Starts at 1. */
  week: number;
  /** Mon..Sun, length 7. */
  days: PlanDays;
}

/** Human-readable day labels, Mon..Sun. Exposed so UI + tests agree. */
export const DAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_LABELS_LONG = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

// ---------------------------------------------------------------------------
// Constructors / helpers
// ---------------------------------------------------------------------------

/** Build a fresh empty 7-day plan. Returns a brand-new tuple each call. */
export function emptyPlan(week = 1): WeeklyPlan {
  return {
    week,
    days: [null, null, null, null, null, null, null],
  };
}

/**
 * Convert JS's `Date.getDay()` (Sun=0..Sat=6) to our Mon..Sun (Mon=0..Sun=6)
 * day index. Pure — caller passes the Date so tests can fake it.
 */
export function todayDayIndex(date: Date = new Date()): number {
  const js = date.getDay(); // 0 = Sun, 6 = Sat
  // Mon = 0 .. Sun = 6
  return (js + 6) % 7;
}

/**
 * Set the workout for a specific day (0..6). Out-of-range indices are a
 * no-op — the caller will have validated, but we don't trust them.
 * Returns a new plan (immutable update — safe for Zustand selectors).
 */
export function setDay(
  plan: WeeklyPlan,
  dayIdx: number,
  workout: PlanDaySlot,
): WeeklyPlan {
  if (!Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) return plan;
  const days = plan.days.slice() as PlanDaySlot[];
  days[dayIdx] = workout;
  return { ...plan, days: days as unknown as PlanDays };
}

/**
 * Rotate the plan forward by one week. The "today" workout becomes
 * yesterday's slot — i.e. the entire week shifts back by one day so the
 * rider doesn't lose their planned sessions when Monday rolls around
 * mid-week.
 *
 * Implementation: each slot i in the new plan comes from slot (i+1) % 7
 * in the old plan. Empty by default — pass an offset to rotate by more
 * than one day.
 */
export function shiftDaysToNextWeek(
  plan: WeeklyPlan,
  offset = 1,
): WeeklyPlan {
  const n = 7;
  // Normalise offset to 0..6 (positive). Negative offsets rotate backwards.
  const k = ((offset % n) + n) % n;
  if (k === 0) return { ...plan, week: plan.week + 1, days: [...plan.days] as PlanDays };
  const out: PlanDaySlot[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = plan.days[(i + k) % n];
  }
  return {
    week: plan.week + 1,
    days: out as unknown as PlanDays,
  };
}

// ---------------------------------------------------------------------------
// Aggregate stats — used by the editor header
// ---------------------------------------------------------------------------

/**
 * Total Training Stress Score for the week — sums each assigned workout's
 * estimateTSS at the rider's FTP. Rest days (null) contribute zero.
 */
export function weeklyTSS(plan: WeeklyPlan, ftpW: number): number {
  if (ftpW <= 0) return 0;
  let total = 0;
  for (const day of plan.days) {
    if (day) total += estimateTSS(day, ftpW);
  }
  return Math.round(total);
}

/**
 * Total scheduled duration for the week, in seconds. Rest days count zero.
 */
export function weeklyDurationSec(plan: WeeklyPlan): number {
  let total = 0;
  for (const day of plan.days) {
    if (day) total += totalDurationSec(day);
  }
  return total;
}

/**
 * Duration-weighted Intensity Factor for the week. Each assigned workout
 * contributes its own IF weighted by its duration; rest days have no
 * weight. Returns 0 if every day is empty.
 *
 * We weight by duration (not 4th-power of intensity) because we want
 * "what does an average hour of training this week look like", not a
 * normalised-power proxy.
 */
export function weeklyIntensityFactor(plan: WeeklyPlan): number {
  let totalSec = 0;
  let weighted = 0;
  for (const day of plan.days) {
    if (!day) continue;
    const dur = totalDurationSec(day);
    if (dur <= 0) continue;
    const ifVal = resolveIF(day);
    if (ifVal <= 0) continue;
    weighted += dur * ifVal;
    totalSec += dur;
  }
  if (totalSec === 0) return 0;
  return weighted / totalSec;
}

/**
 * Count assigned (non-null) days in the week. Cheap O(7) check — used by
 * the editor's "0 / 7 days planned" badge.
 */
export function plannedDayCount(plan: WeeklyPlan): number {
  let n = 0;
  for (const day of plan.days) if (day) n += 1;
  return n;
}

/**
 * True when every day is null — used by the "Start a plan" empty state.
 */
export function isPlanEmpty(plan: WeeklyPlan): boolean {
  return plannedDayCount(plan) === 0;
}
