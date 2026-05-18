/**
 * Validation and repair of AI-generated workout JSON.
 *
 * This module is intentionally pure (no imports from React, Cesium, or stores)
 * so it is trivially unit-testable with vitest in a Node environment.
 *
 * Repair logic handles the most common model mistakes:
 *  - Durations expressed in minutes instead of seconds
 *  - %FTP expressed as whole percentages (e.g. 90) instead of fractions (0.90)
 *  - Missing segment ids
 *  - Missing workout id / createdAt / source
 *  - Extra wrapper keys (e.g. { "workout": { ... } })
 *  - rampPct with wrong key names (from_pct, to_pct, etc.)
 */

import type { Workout, WorkoutSegment, SegmentTarget, SegmentKind } from '@/lib/workout';
import { workoutId } from '@/lib/workout';

export type ValidationResult =
  | { ok: true; workout: Workout }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// JSON extraction — strip markdown fences and find the first JSON object
// ---------------------------------------------------------------------------

export function extractJSON(raw: string): string {
  // Strip ```json ... ``` or ``` ... ``` fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Find the first { ... } block
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
}

// ---------------------------------------------------------------------------
// Repair helpers
// ---------------------------------------------------------------------------

const VALID_KINDS = new Set<string>([
  'warmup', 'steady', 'interval', 'recovery', 'ramp', 'cooldown', 'freeride',
]);
const VALID_TARGET_TYPES = new Set<string>([
  'ftpPct', 'watts', 'rampPct', 'grade', 'free',
]);

/**
 * Heuristic: if ALL segment durations are ≤ 120 and the total is ≤ 180 minutes
 * worth of seconds (10800), assume the model gave minutes and convert.
 * Only fires when the longest segment is ≤ 120 — avoids false-positives on real
 * short efforts like 30-second sprints.
 */
function maybeConvertMinutesToSeconds(segments: unknown[]): void {
  if (!Array.isArray(segments)) return;
  const durations = segments
    .map((s: unknown) => (s as Record<string, unknown>)?.durationSec)
    .filter((d): d is number => typeof d === 'number');
  if (durations.length === 0) return;
  const maxDur = Math.max(...durations);
  // If the longest "duration" is ≤ 120, it's almost certainly minutes
  if (maxDur <= 120) {
    for (const seg of segments) {
      const s = seg as Record<string, unknown>;
      if (typeof s.durationSec === 'number') {
        s.durationSec = Math.round(s.durationSec * 60);
      }
    }
  }
}

/**
 * If a ftpPct value looks like it's a percentage (> 2), divide by 100.
 * Values like 90 → 0.90, 105 → 1.05. Safe upper bound: never divide values
 * already ≤ 2 (those are already fractions).
 */
function repairFtpPctValue(value: unknown): number {
  const v = typeof value === 'number' ? value : parseFloat(String(value));
  if (!isFinite(v)) return 0.75;
  return v > 2 ? v / 100 : v;
}

function repairTarget(raw: Record<string, unknown>): SegmentTarget {
  const type = String(raw.type ?? '');

  if (type === 'ftpPct') {
    return { type: 'ftpPct', value: repairFtpPctValue(raw.value) };
  }
  if (type === 'watts') {
    const w = typeof raw.watts === 'number' ? raw.watts : parseFloat(String(raw.watts ?? 150));
    return { type: 'watts', watts: isFinite(w) ? w : 150 };
  }
  if (type === 'rampPct') {
    // Model may use: start/end, from/to, startPct/endPct, start_pct/end_pct
    const startRaw = raw.startPct ?? raw.start_pct ?? raw.start ?? raw.from ?? raw.fromPct ?? 0.5;
    const endRaw = raw.endPct ?? raw.end_pct ?? raw.end ?? raw.to ?? raw.toPct ?? 0.75;
    return {
      type: 'rampPct',
      startPct: repairFtpPctValue(startRaw),
      endPct: repairFtpPctValue(endRaw),
    };
  }
  if (type === 'grade') {
    const g = typeof raw.gradePct === 'number' ? raw.gradePct : parseFloat(String(raw.gradePct ?? 0));
    return { type: 'grade', gradePct: isFinite(g) ? g : 0 };
  }
  if (type === 'free') {
    return { type: 'free' };
  }

  // Unknown target type — fall back to a gentle ftpPct
  return { type: 'ftpPct', value: 0.6 };
}

function repairSegment(raw: Record<string, unknown>, idx: number): WorkoutSegment {
  const id = typeof raw.id === 'string' && raw.id ? raw.id : workoutId(`seg${idx}`);
  const kind: SegmentKind = VALID_KINDS.has(String(raw.kind)) ? raw.kind as SegmentKind : 'steady';
  const durationSec = Math.max(
    1,
    typeof raw.durationSec === 'number' ? Math.round(raw.durationSec) : 300,
  );
  const label = typeof raw.label === 'string' ? raw.label : undefined;
  const cadenceTarget =
    typeof raw.cadenceTarget === 'number' && raw.cadenceTarget > 0
      ? raw.cadenceTarget
      : undefined;

  const rawTarget =
    raw.target && typeof raw.target === 'object'
      ? (raw.target as Record<string, unknown>)
      : { type: 'ftpPct', value: 0.6 };

  // Handle target.type missing but target has recognizable shape
  if (!rawTarget.type) {
    if ('value' in rawTarget) rawTarget.type = 'ftpPct';
    else if ('watts' in rawTarget) rawTarget.type = 'watts';
    else if ('startPct' in rawTarget || 'start_pct' in rawTarget || 'start' in rawTarget) rawTarget.type = 'rampPct';
    else if ('gradePct' in rawTarget) rawTarget.type = 'grade';
    else rawTarget.type = 'free';
  }

  return {
    id,
    kind,
    durationSec,
    target: repairTarget(rawTarget),
    ...(label !== undefined ? { label } : {}),
    ...(cadenceTarget !== undefined ? { cadenceTarget } : {}),
  };
}

// ---------------------------------------------------------------------------
// Main validator / repairer
// ---------------------------------------------------------------------------

export function validateAndRepairWorkout(raw: string, _ftpW?: number): ValidationResult {
  const errors: string[] = [];

  // 1. Extract JSON
  const jsonStr = extractJSON(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    errors.push(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, errors };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push('Root value is not a JSON object.');
    return { ok: false, errors };
  }

  let obj = parsed as Record<string, unknown>;

  // 2. Unwrap common model wrapper keys: { "workout": { ... } } or { "result": ... }
  for (const key of ['workout', 'result', 'data', 'output']) {
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      const inner = obj[key] as Record<string, unknown>;
      if ('segments' in inner || 'name' in inner) {
        obj = inner;
        break;
      }
    }
  }

  // 3. Required: name
  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    errors.push('Missing or empty "name".');
    obj.name = 'AI Workout';
  }

  // 4. Required: segments array
  if (!Array.isArray(obj.segments) || obj.segments.length === 0) {
    errors.push('Missing or empty "segments" array.');
    return { ok: false, errors };
  }

  // 5. Convert durations in minutes → seconds if needed
  maybeConvertMinutesToSeconds(obj.segments as unknown[]);

  // 6. Repair each segment
  const repairedSegments: WorkoutSegment[] = [];
  for (let i = 0; i < (obj.segments as unknown[]).length; i++) {
    const seg = (obj.segments as unknown[])[i];
    if (!seg || typeof seg !== 'object' || Array.isArray(seg)) {
      errors.push(`Segment ${i} is not an object — skipping.`);
      continue;
    }
    const rawSeg = seg as Record<string, unknown>;

    // Validate target type
    const tgt = rawSeg.target as Record<string, unknown> | undefined;
    if (tgt && tgt.type && !VALID_TARGET_TYPES.has(String(tgt.type))) {
      errors.push(`Segment ${i} has unknown target type "${tgt.type}" — repaired.`);
    }

    repairedSegments.push(repairSegment(rawSeg, i));
  }

  if (repairedSegments.length === 0) {
    errors.push('No valid segments after repair.');
    return { ok: false, errors };
  }

  // 7. Assemble final Workout
  const workout: Workout = {
    id: typeof obj.id === 'string' && obj.id ? obj.id : workoutId('ai'),
    name: String(obj.name).trim(),
    description: typeof obj.description === 'string' ? obj.description : undefined,
    segments: repairedSegments,
    createdAt: Date.now(),
    source: 'ai',
  };

  return { ok: true, workout };
}
