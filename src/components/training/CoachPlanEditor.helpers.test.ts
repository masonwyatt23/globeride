/**
 * CoachPlanEditor.helpers — pure helper tests.
 *
 * The component itself lives in .tsx and renders Cesium-adjacent
 * primitives; the vitest config runs in `environment: 'node'` with no
 * DOM, so we keep these tests on the pure helpers only.
 */

import { describe, it, expect } from 'vitest';

import {
  DAYS_IN_WEEK,
  currentDayIdx,
  dateForDayIdx,
  dayOfMonthForIdx,
  shortLabelFor,
  longLabelFor,
  formatWeeklyIF,
  intensityBucket,
} from '@/components/training/CoachPlanEditor.helpers';

// 2026-05-27 is a Wednesday — DAY_LABELS_SHORT[2] === 'Wed'.
// We pick this date so tests don't drift with the calendar.
const WEDNESDAY = new Date(2026, 4, 27); // month is 0-indexed → May
const MONDAY    = new Date(2026, 4, 25);
const SUNDAY    = new Date(2026, 4, 31);

describe('DAYS_IN_WEEK', () => {
  it('is exactly 7 — sanity guard against accidental edits', () => {
    expect(DAYS_IN_WEEK).toBe(7);
  });
});

describe('currentDayIdx', () => {
  it('returns 2 (Wed) for the anchor Wednesday', () => {
    expect(currentDayIdx(WEDNESDAY)).toBe(2);
  });

  it('returns 0 for Monday and 6 for Sunday', () => {
    expect(currentDayIdx(MONDAY)).toBe(0);
    expect(currentDayIdx(SUNDAY)).toBe(6);
  });
});

describe('dateForDayIdx', () => {
  it('returns todays date when dayIdx equals currentDayIdx', () => {
    const out = dateForDayIdx(2, WEDNESDAY);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(4);
    expect(out.getDate()).toBe(27);
  });

  it('walks backward to Monday when dayIdx = 0 on a Wednesday', () => {
    const out = dateForDayIdx(0, WEDNESDAY);
    expect(out.getDate()).toBe(25);
  });

  it('walks forward to Sunday when dayIdx = 6 on a Wednesday', () => {
    const out = dateForDayIdx(6, WEDNESDAY);
    expect(out.getDate()).toBe(31);
  });

  it('zeroes hours / minutes / seconds for stable day-of-month maths', () => {
    const at1145pm = new Date(2026, 4, 27, 23, 45, 12);
    const out = dateForDayIdx(2, at1145pm);
    expect(out.getHours()).toBe(0);
    expect(out.getMinutes()).toBe(0);
    expect(out.getSeconds()).toBe(0);
  });

  it('clamps out-of-range indices instead of throwing', () => {
    expect(() => dateForDayIdx(-1, WEDNESDAY)).not.toThrow();
    expect(() => dateForDayIdx(99, WEDNESDAY)).not.toThrow();
    // -1 clamps to 0 (Monday this week)
    expect(dateForDayIdx(-1, WEDNESDAY).getDate()).toBe(25);
    // 99 clamps to 6 (Sunday this week)
    expect(dateForDayIdx(99, WEDNESDAY).getDate()).toBe(31);
  });
});

describe('dayOfMonthForIdx', () => {
  it('returns the 1..31 integer for the column', () => {
    expect(dayOfMonthForIdx(0, WEDNESDAY)).toBe(25);
    expect(dayOfMonthForIdx(2, WEDNESDAY)).toBe(27);
    expect(dayOfMonthForIdx(6, WEDNESDAY)).toBe(31);
  });
});

describe('shortLabelFor / longLabelFor', () => {
  it('maps 0..6 to Mon..Sun (short and long)', () => {
    expect(shortLabelFor(0)).toBe('Mon');
    expect(shortLabelFor(6)).toBe('Sun');
    expect(longLabelFor(0)).toBe('Monday');
    expect(longLabelFor(6)).toBe('Sunday');
  });

  it('clamps OOB indices instead of returning undefined', () => {
    expect(shortLabelFor(-5)).toBe('Mon');
    expect(longLabelFor(42)).toBe('Sunday');
  });
});

describe('formatWeeklyIF', () => {
  it('returns "0.00" for empty / non-finite values', () => {
    expect(formatWeeklyIF(0)).toBe('0.00');
    expect(formatWeeklyIF(NaN)).toBe('0.00');
    expect(formatWeeklyIF(-0.4)).toBe('0.00');
  });

  it('returns 2-decimal string for valid values', () => {
    expect(formatWeeklyIF(0.755)).toBe('0.76');
    expect(formatWeeklyIF(1)).toBe('1.00');
    expect(formatWeeklyIF(0.8)).toBe('0.80');
  });
});

describe('intensityBucket', () => {
  it('buckets IF into easy/moderate/hard/severe', () => {
    expect(intensityBucket(0.5)).toBe('easy');
    expect(intensityBucket(0.64)).toBe('easy');
    expect(intensityBucket(0.65)).toBe('moderate');
    expect(intensityBucket(0.84)).toBe('moderate');
    expect(intensityBucket(0.85)).toBe('hard');
    expect(intensityBucket(0.99)).toBe('hard');
    expect(intensityBucket(1.0)).toBe('severe');
    expect(intensityBucket(1.2)).toBe('severe');
  });

  it('treats non-finite IF as easy (defensive)', () => {
    expect(intensityBucket(NaN)).toBe('easy');
  });
});
