/**
 * Tests for cadenceShiftDetector — pure logic, no Web Audio dependency.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createShiftDetectorState,
  detectShift,
  type ShiftDetectorState,
} from './cadenceShiftDetector';

describe('createShiftDetectorState', () => {
  it('returns a state with lastCadence -1 and lastShiftMs 0', () => {
    const state = createShiftDetectorState();
    expect(state.lastCadence).toBe(-1);
    expect(state.lastShiftMs).toBe(0);
  });

  it('returns a new object each call (not a shared singleton)', () => {
    const a = createShiftDetectorState();
    const b = createShiftDetectorState();
    expect(a).not.toBe(b);
  });
});

describe('detectShift — threshold', () => {
  let state: ShiftDetectorState;

  beforeEach(() => {
    state = createShiftDetectorState();
  });

  it('returns false on the very first reading (nothing to compare)', () => {
    expect(detectShift(state, 80, 1000)).toBe(false);
  });

  it('returns false when cadence jump is below threshold (< 8 RPM)', () => {
    detectShift(state, 80, 1000);
    expect(detectShift(state, 87, 2000)).toBe(false); // delta = 7 < 8
  });

  it('returns false when cadence jump equals threshold minus 1', () => {
    detectShift(state, 80, 1000);
    expect(detectShift(state, 87.9, 2000)).toBe(false); // delta = 7.9 < 8
  });

  it('returns true when cadence jump meets the 8 RPM threshold exactly', () => {
    detectShift(state, 80, 1000);
    expect(detectShift(state, 88, 2000)).toBe(true); // delta = 8
  });

  it('returns true for a large upward jump', () => {
    detectShift(state, 70, 1000);
    expect(detectShift(state, 95, 2000)).toBe(true); // delta = 25
  });

  it('returns true for a large downward jump (absolute delta)', () => {
    detectShift(state, 95, 1000);
    expect(detectShift(state, 75, 2000)).toBe(true); // delta = 20
  });
});

describe('detectShift — debounce', () => {
  let state: ShiftDetectorState;

  beforeEach(() => {
    state = createShiftDetectorState();
    // Prime with an initial reading
    detectShift(state, 80, 0);
  });

  it('fires on first qualifying jump', () => {
    expect(detectShift(state, 90, 1000)).toBe(true);
  });

  it('does not re-fire within the 500 ms debounce window', () => {
    detectShift(state, 90, 1000);           // fires (first shift)
    state.lastCadence = 90;                 // reset so next delta is large again
    expect(detectShift(state, 80, 1400)).toBe(false); // 400 ms < 500 ms debounce
  });

  it('fires again after the debounce window has elapsed (500 ms+)', () => {
    detectShift(state, 90, 1000);           // fires at t=1000
    state.lastCadence = 90;
    expect(detectShift(state, 80, 1501)).toBe(true); // 501 ms > 500 ms
  });
});

describe('detectShift — edge cases', () => {
  let state: ShiftDetectorState;

  beforeEach(() => {
    state = createShiftDetectorState();
    detectShift(state, 80, 0); // prime
  });

  it('ignores NaN cadence without throwing', () => {
    expect(detectShift(state, NaN, 1000)).toBe(false);
    expect(state.lastCadence).toBe(80); // state unchanged
  });

  it('ignores negative cadence without throwing', () => {
    expect(detectShift(state, -5, 1000)).toBe(false);
    expect(state.lastCadence).toBe(80);
  });

  it('ignores Infinity without throwing', () => {
    expect(detectShift(state, Infinity, 1000)).toBe(false);
  });

  it('updates lastCadence correctly after a non-triggering reading', () => {
    detectShift(state, 83, 1000); // delta 3 — no shift
    expect(state.lastCadence).toBe(83);
  });

  it('handles zero cadence transitions', () => {
    // Large jump from 80 → 0 should still detect (absolute delta 80 >= 8)
    expect(detectShift(state, 0, 2000)).toBe(true);
  });
});
