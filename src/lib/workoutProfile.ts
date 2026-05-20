/**
 * Pure helpers for visualising a Workout as a power-vs-time curve.
 *
 * Emits a Recharts-friendly point series so the same data drives every
 * preview surface (the builder editor, the in-ride HUD mini-profile, and the
 * library thumbnail). Two points per segment — one at its start, one at its
 * end — so:
 *   - Constant-power segments draw as a flat block (same y at both ends).
 *   - Ramps draw as a sloped line (different y at the two ends).
 *   - The shared x at a segment boundary creates a vertical jump when the
 *     next segment starts at a different power, which is exactly the
 *     Zwift / TrainingPeaks workout-profile look.
 *
 * Kept pure (no React/store imports) so it is trivially unit-testable.
 */

import type { SegmentKind, Workout, WorkoutSegment } from '@/lib/workout';

export interface ProfilePoint {
  /** Cumulative elapsed seconds from the workout start. */
  t: number;
  /** Target watts at this point. 0 for grade / free segments (no ERG target). */
  watts: number;
  /** Watts / FTP at this point. 0 when ftpW <= 0 or there is no ERG target. */
  ftpPct: number;
  /** 0-based index of the owning segment within workout.segments. */
  segmentIndex: number;
  kind: SegmentKind;
  /** Short display label for tooltips. */
  label: string;
  /** True when the segment has no ERG target (grade / free). */
  free: boolean;
}

/** Build the chart point series for a workout. */
export function buildProfileSeries(workout: Workout, ftpW: number): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  let t = 0;
  for (let i = 0; i < workout.segments.length; i++) {
    const seg = workout.segments[i];
    const dur = Math.max(0, seg.durationSec);
    const { startW, endW, free } = resolveSegmentEndpoints(seg, ftpW);
    const label = seg.label ?? defaultLabel(seg);
    out.push({
      t,
      watts: startW,
      ftpPct: ftpW > 0 ? startW / ftpW : 0,
      segmentIndex: i,
      kind: seg.kind,
      label,
      free,
    });
    out.push({
      t: t + dur,
      watts: endW,
      ftpPct: ftpW > 0 ? endW / ftpW : 0,
      segmentIndex: i,
      kind: seg.kind,
      label,
      free,
    });
    t += dur;
  }
  return out;
}

/** Highest target wattage anywhere in the profile — useful for axis sizing. */
export function peakWatts(workout: Workout, ftpW: number): number {
  let max = 0;
  for (const seg of workout.segments) {
    const { startW, endW } = resolveSegmentEndpoints(seg, ftpW);
    if (startW > max) max = startW;
    if (endW > max) max = endW;
  }
  return max;
}

/**
 * Resolve the watts at the start and end of a segment.
 * Pure — does not depend on elapsed time within the workout.
 */
function resolveSegmentEndpoints(
  seg: WorkoutSegment,
  ftpW: number,
): { startW: number; endW: number; free: boolean } {
  const t = seg.target;
  switch (t.type) {
    case 'watts':
      return { startW: Math.round(t.watts), endW: Math.round(t.watts), free: false };
    case 'ftpPct': {
      const w = Math.round(t.value * ftpW);
      return { startW: w, endW: w, free: false };
    }
    case 'rampPct':
      return {
        startW: Math.round(t.startPct * ftpW),
        endW: Math.round(t.endPct * ftpW),
        free: false,
      };
    case 'grade':
    case 'free':
      return { startW: 0, endW: 0, free: true };
  }
}

/** Fallback label used when a segment doesn't carry its own `label`. */
function defaultLabel(seg: WorkoutSegment): string {
  const m = Math.max(1, Math.round(seg.durationSec / 60));
  const minLabel = `${m} min`;
  switch (seg.target.type) {
    case 'watts':
      return `${minLabel} @ ${seg.target.watts} W`;
    case 'ftpPct':
      return `${minLabel} @ ${Math.round(seg.target.value * 100)}% FTP`;
    case 'rampPct':
      return `${minLabel} ramp ${Math.round(seg.target.startPct * 100)}→${Math.round(
        seg.target.endPct * 100,
      )}% FTP`;
    case 'grade':
      return `${minLabel} @ ${seg.target.gradePct >= 0 ? '+' : ''}${seg.target.gradePct}% grade`;
    case 'free':
      return `${minLabel} free`;
  }
}
