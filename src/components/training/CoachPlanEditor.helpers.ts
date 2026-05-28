/**
 * Pure helpers for CoachPlanEditor — kept out of the .tsx so they can be
 * unit-tested without spinning up a DOM. Anything date-derived takes a
 * `now: Date` so tests can fake the clock instead of monkey-patching the
 * global.
 */

import {
  DAY_LABELS_LONG,
  DAY_LABELS_SHORT,
  todayDayIndex,
} from '@/lib/coach/plan';

/** Number of days in a planning week. */
export const DAYS_IN_WEEK = 7;

/**
 * Today's column index (0=Mon..6=Sun) using local time. Thin wrapper
 * around {@link todayDayIndex} so the component never imports Date
 * twice with conflicting defaults.
 */
export function currentDayIdx(now: Date = new Date()): number {
  return todayDayIndex(now);
}

/**
 * Date that the column at `dayIdx` represents, anchored to the Monday of
 * the current week. Always returns a date with hours/min/sec zeroed so
 * the day-of-month is stable regardless of `now`'s clock.
 *
 * Example: if today is Wednesday June 4 and dayIdx is 0, returns
 * Monday June 2.
 */
export function dateForDayIdx(dayIdx: number, now: Date = new Date()): Date {
  const safe = clampDayIdx(dayIdx);
  const today = currentDayIdx(now);
  const offset = safe - today;
  const out = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  out.setDate(out.getDate() + offset);
  return out;
}

/**
 * Day-of-month integer (1..31) for the column at `dayIdx`, anchored to
 * the current week's Monday. Used by the cell header chip.
 */
export function dayOfMonthForIdx(dayIdx: number, now: Date = new Date()): number {
  return dateForDayIdx(dayIdx, now).getDate();
}

/** Short label ("Mon".."Sun") for a column. Defensive on OOB indices. */
export function shortLabelFor(dayIdx: number): string {
  return DAY_LABELS_SHORT[clampDayIdx(dayIdx)];
}

/** Long label ("Monday".."Sunday") for a11y / tooltips. */
export function longLabelFor(dayIdx: number): string {
  return DAY_LABELS_LONG[clampDayIdx(dayIdx)];
}

/** Format a weekly IF as a 2-decimal string ("0.00" when empty). */
export function formatWeeklyIF(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  return value.toFixed(2);
}

/**
 * Bucket a single workout's IF into a compact intensity tag for the cell
 * chip. We deliberately keep this independent of `intensityLabel` from
 * `@/lib/workout` so the editor can colour-code without pulling in the
 * full IntensityLabel union (cheaper render, fewer transitive imports).
 */
export type CellIntensity = 'easy' | 'moderate' | 'hard' | 'severe';

export function intensityBucket(ifValue: number): CellIntensity {
  if (!Number.isFinite(ifValue) || ifValue < 0.65) return 'easy';
  if (ifValue < 0.85) return 'moderate';
  if (ifValue < 1.0) return 'hard';
  return 'severe';
}

/** Clamp an arbitrary number into [0, 6]. Falls back to 0 for non-ints. */
function clampDayIdx(dayIdx: number): number {
  if (!Number.isInteger(dayIdx)) return 0;
  if (dayIdx < 0) return 0;
  if (dayIdx > DAYS_IN_WEEK - 1) return DAYS_IN_WEEK - 1;
  return dayIdx;
}
