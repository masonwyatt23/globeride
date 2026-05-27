/**
 * cadenceShiftDetector — pure, allocation-free cadence-jump detector.
 *
 * Detects gear-shift events by watching for cadence jumps > 8 RPM
 * with a 500 ms debounce to prevent double-firing on sensor noise.
 *
 * Design: plain objects + functions (no classes) so the logic is trivially
 * unit-testable without any Web Audio dependency.
 */

/** Mutable state bag — initialise once via createShiftDetectorState(). */
export interface ShiftDetectorState {
  /** Cadence at the time of the previous call (RPM). -1 = no reading yet. */
  lastCadence: number;
  /** Wall-clock ms of the last detected shift event. 0 = never detected. */
  lastShiftMs: number;
}

/** Cadence delta that counts as a gear shift (RPM). */
const SHIFT_THRESHOLD_RPM = 8;

/** Minimum gap between detected shifts (ms). Prevents double-firing. */
const DEBOUNCE_MS = 500;

/**
 * Create a fresh detector state — pass this into detectShift() each frame.
 */
export function createShiftDetectorState(): ShiftDetectorState {
  return { lastCadence: -1, lastShiftMs: 0 };
}

/**
 * Check whether the cadence jump since the last frame constitutes a gear shift.
 *
 * @param state     Mutable state object. Mutated in-place on detection.
 * @param cadenceRpm  Current cadence reading (RPM). NaN / negative are ignored.
 * @param nowMs     Current wall-clock time (ms). Use performance.now() or Date.now().
 * @returns true exactly once per detected shift, false otherwise.
 */
export function detectShift(
  state: ShiftDetectorState,
  cadenceRpm: number,
  nowMs: number,
): boolean {
  // Guard: ignore invalid readings.
  if (!Number.isFinite(cadenceRpm) || cadenceRpm < 0) return false;

  const prev = state.lastCadence;
  state.lastCadence = cadenceRpm;

  // First reading — nothing to compare against.
  if (prev < 0) return false;

  const delta = Math.abs(cadenceRpm - prev);

  if (delta >= SHIFT_THRESHOLD_RPM && nowMs - state.lastShiftMs >= DEBOUNCE_MS) {
    state.lastShiftMs = nowMs;
    return true;
  }

  return false;
}
