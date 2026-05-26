/**
 * lowLightMode.test.ts
 *
 * Tests for isLowLightHour() and resolveLowLightMode().
 */

import { describe, it, expect } from 'vitest';
import { isLowLightHour, resolveLowLightMode } from '@/lib/lowLightMode';

// ---------------------------------------------------------------------------
// isLowLightHour — hour-based detection
// ---------------------------------------------------------------------------

describe('isLowLightHour', () => {
  function d(hour: number): Date {
    const dt = new Date();
    dt.setHours(hour, 0, 0, 0);
    return dt;
  }

  it('returns false at 08:00 (morning)', () => {
    expect(isLowLightHour(d(8))).toBe(false);
  });

  it('returns false at 12:00 (midday)', () => {
    expect(isLowLightHour(d(12))).toBe(false);
  });

  it('returns true at 19:00 (evening)', () => {
    expect(isLowLightHour(d(19))).toBe(true);
  });

  it('returns true at 02:00 (night)', () => {
    expect(isLowLightHour(d(2))).toBe(true);
  });

  it('returns false at exactly 06:00 (threshold — daytime starts)', () => {
    expect(isLowLightHour(d(6))).toBe(false);
  });

  it('returns true at exactly 18:00 (threshold — low-light starts)', () => {
    expect(isLowLightHour(d(18))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveLowLightMode — setting resolution
// ---------------------------------------------------------------------------

describe('resolveLowLightMode', () => {
  function d(hour: number): Date {
    const dt = new Date();
    dt.setHours(hour, 0, 0, 0);
    return dt;
  }

  it('always returns true for "on"', () => {
    expect(resolveLowLightMode('on', d(10))).toBe(true);
    expect(resolveLowLightMode('on', d(22))).toBe(true);
  });

  it('always returns false for "off"', () => {
    expect(resolveLowLightMode('off', d(20))).toBe(false);
    expect(resolveLowLightMode('off', d(3))).toBe(false);
  });

  it('returns true for "auto" during low-light hours', () => {
    expect(resolveLowLightMode('auto', d(21))).toBe(true);
  });

  it('returns false for "auto" during daylight hours', () => {
    expect(resolveLowLightMode('auto', d(9))).toBe(false);
  });
});
