/**
 * Structured-workout model — the shared contract between the workout builder,
 * the AI workout generator, and the ERG execution engine.
 *
 * A Workout is an ordered list of time-boxed segments. Each segment carries a
 * power/grade target the trainer holds for its duration. %FTP targets are
 * resolved to absolute watts at runtime against the rider's configured FTP
 * (settingsStore.ftpW) so a workout is portable across riders.
 *
 * Keep this file pure (no React/Cesium/store imports) so it is trivially
 * unit-testable and safe to import anywhere.
 */

export type SegmentKind =
  | 'warmup'
  | 'steady'
  | 'interval'
  | 'recovery'
  | 'ramp'
  | 'cooldown'
  | 'freeride';

/** What the trainer should hold for a segment. */
export type SegmentTarget =
  /** Constant power as a fraction of FTP (1.0 = FTP). */
  | { type: 'ftpPct'; value: number }
  /** Constant absolute power, watts. */
  | { type: 'watts'; watts: number }
  /** Linear ramp between two %FTP points over the segment. */
  | { type: 'rampPct'; startPct: number; endPct: number }
  /** Simulation-mode grade override (no ERG), percent. */
  | { type: 'grade'; gradePct: number }
  /** No trainer control — just ride (free ride / scenery). */
  | { type: 'free' };

export interface WorkoutSegment {
  id: string;
  kind: SegmentKind;
  /** Short human label, e.g. "3 min @ 110% FTP". */
  label?: string;
  /** Segment length in seconds (> 0). */
  durationSec: number;
  target: SegmentTarget;
  /** Optional cadence cue, rpm. */
  cadenceTarget?: number;
}

export interface Workout {
  id: string;
  name: string;
  description?: string;
  /**
   * Optional route binding. When set, the workout is ridden along this route
   * (pinned/drawn/GPX) with scenery; when absent it is a structured indoor
   * effort (scenery optional / free demo route).
   */
  routeId?: string;
  segments: WorkoutSegment[];
  createdAt: number;
  source: 'manual' | 'ai' | 'imported';
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in workout.test.ts)
// ---------------------------------------------------------------------------

export function totalDurationSec(w: Workout): number {
  return w.segments.reduce((a, s) => a + Math.max(0, s.durationSec), 0);
}

export interface SegmentCursor {
  segment: WorkoutSegment;
  /** 0-based index of the segment within the workout. */
  index: number;
  /** Seconds elapsed within the current segment. */
  elapsedInSegmentSec: number;
  /** Seconds remaining within the current segment. */
  remainingInSegmentSec: number;
  /** The next segment, if any (for "up next" UI). */
  next: WorkoutSegment | null;
}

/**
 * Resolve which segment is active at `elapsedSec` into the whole workout.
 * Returns null once the workout is complete.
 */
export function segmentAt(w: Workout, elapsedSec: number): SegmentCursor | null {
  if (elapsedSec < 0) elapsedSec = 0;
  let acc = 0;
  for (let i = 0; i < w.segments.length; i++) {
    const seg = w.segments[i];
    const dur = Math.max(0, seg.durationSec);
    if (elapsedSec < acc + dur || i === w.segments.length - 1 && elapsedSec <= acc + dur) {
      const elapsedInSegmentSec = Math.min(dur, Math.max(0, elapsedSec - acc));
      return {
        segment: seg,
        index: i,
        elapsedInSegmentSec,
        remainingInSegmentSec: Math.max(0, dur - elapsedInSegmentSec),
        next: w.segments[i + 1] ?? null,
      };
    }
    acc += dur;
  }
  return null; // workout finished
}

/**
 * Absolute target watts for a segment at a given offset within it, given the
 * rider's FTP. Returns null for `grade`/`free` segments (no ERG target — the
 * caller should fall back to simulation/grade mode).
 */
export function resolveTargetWatts(
  seg: WorkoutSegment,
  elapsedInSegmentSec: number,
  ftpW: number,
): number | null {
  const t = seg.target;
  switch (t.type) {
    case 'watts':
      return Math.round(t.watts);
    case 'ftpPct':
      return Math.round(t.value * ftpW);
    case 'rampPct': {
      const dur = Math.max(1, seg.durationSec);
      const frac = Math.min(1, Math.max(0, elapsedInSegmentSec / dur));
      const pct = t.startPct + (t.endPct - t.startPct) * frac;
      return Math.round(pct * ftpW);
    }
    case 'grade':
    case 'free':
      return null;
  }
}

/** Rough Training Stress Score estimate (intensity-factor based). */
export function estimateTSS(w: Workout, ftpW: number): number {
  if (ftpW <= 0) return 0;
  let stress = 0;
  for (const seg of w.segments) {
    const mid = resolveTargetWatts(seg, seg.durationSec / 2, ftpW);
    if (mid == null) continue;
    const intensity = mid / ftpW;
    stress += (seg.durationSec / 3600) * intensity * intensity * 100;
  }
  return Math.round(stress);
}

let _id = 0;
export function workoutId(prefix = 'w'): string {
  _id += 1;
  return `${prefix}-${Date.now().toString(36)}-${_id}`;
}

/**
 * JSON-schema description handed to the AI model so it returns a Workout that
 * conforms to this contract. Kept here so the schema and the types never drift.
 */
export const WORKOUT_JSON_SCHEMA = {
  type: 'object',
  required: ['name', 'segments'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    segments: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['kind', 'durationSec', 'target'],
        properties: {
          kind: {
            type: 'string',
            enum: ['warmup', 'steady', 'interval', 'recovery', 'ramp', 'cooldown', 'freeride'],
          },
          label: { type: 'string' },
          durationSec: { type: 'number', minimum: 1 },
          cadenceTarget: { type: 'number' },
          target: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['ftpPct', 'watts', 'rampPct', 'grade', 'free'] },
              value: { type: 'number' },
              watts: { type: 'number' },
              startPct: { type: 'number' },
              endPct: { type: 'number' },
              gradePct: { type: 'number' },
            },
          },
        },
      },
    },
  },
} as const;
