/**
 * climbDetection.ts — Detect named climbs along a GPX route AND provide a
 * real-time live-ride state machine for auto-segmenting climbs as they happen.
 *
 * Two APIs live here:
 *
 *   1. `findClimbs(route)` — pre-ride static scan over the full route. Unchanged
 *      contract from the original stub so RideHUD keeps working.
 *
 *   2. `createClimbDetectorState()` / `updateClimbDetection(...)` — per-frame
 *      live state machine used in useRideLoop to detect climbs in real time
 *      and announce them over voice + mark lap boundaries.
 *
 * Live detection algorithm:
 *   ENTERING a climb: 30 consecutive grade samples (≥1/10 s apart → ≈3 s) must
 *   all be ≥4% AND the rolling window average must be ≥4%.
 *
 *   LEAVING a climb: 20 consecutive samples all below 2%.
 *
 *   avgGrade is computed as the mean of all gradeSamples accumulated during
 *   the climb so we have a meaningful value when reporting climb end.
 */

import type { Route } from '@/types';

// ===========================================================================
// Section 1 — Static route scan (findClimbs)
// ===========================================================================

// ---------------------------------------------------------------------------
// Public types — original original contract (unchanged)
// ---------------------------------------------------------------------------

export interface DetectedClimb {
  /** Display name, e.g. "Alpe d'Huez" or "Climb 1". */
  name: string;
  /** Cumulative distance from route start to the climb start, meters. */
  startDistance: number;
  /** Cumulative distance from route start to the climb end, meters. */
  endDistance: number;
  /** Total horizontal length of the climb, meters. */
  lengthM: number;
  /** Mean gradient over the climb, percent. */
  avgGradient: number;
  /** Total elevation gained in the climb, meters. */
  elevationGainM: number;
}

// ---------------------------------------------------------------------------
// Constants (static scan)
// ---------------------------------------------------------------------------

/** Minimum grade (%) for a segment to count as climbing. */
const MIN_GRADE_PCT = 3.0;

/** Minimum sustained length (m) to constitute a "climb". */
const MIN_CLIMB_LENGTH_M = 200;

/**
 * Gap tolerance (m) — a flat/slight-descent section shorter than this is
 * swallowed into the surrounding climb rather than splitting it.
 */
const MAX_GAP_M = 100;

// ---------------------------------------------------------------------------
// findClimbs
// ---------------------------------------------------------------------------

/**
 * Scans `route.points` and returns an array of detected climb segments,
 * sorted by startDistance ascending.
 *
 * The result is stable for the same route — safe to memoize in React.
 * Returns an empty array when the route has fewer than two points or no
 * qualifying ascent.
 */
export function findClimbs(route: Route): DetectedClimb[] {
  const pts = route.points;
  if (pts.length < 2) return [];

  const climbs: DetectedClimb[] = [];
  let climbNum = 0;

  let inClimb = false;
  let climbStartIdx = 0;
  let gapAccum = 0;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const segLen = curr.distance - prev.distance;
    if (segLen <= 0) continue;

    const rise = curr.ele - prev.ele;
    const grade = (rise / segLen) * 100;
    const isClimbing = grade >= MIN_GRADE_PCT;

    if (!inClimb) {
      if (isClimbing) {
        inClimb = true;
        climbStartIdx = i - 1;
        gapAccum = 0;
      }
    } else {
      if (!isClimbing) {
        gapAccum += segLen;
        if (gapAccum > MAX_GAP_M) {
          const climb = buildClimb(pts, climbStartIdx, i - 1, ++climbNum);
          if (climb) climbs.push(climb);
          inClimb = false;
          gapAccum = 0;
        }
      } else {
        gapAccum = 0;
      }
    }
  }

  if (inClimb) {
    const climb = buildClimb(pts, climbStartIdx, pts.length - 1, ++climbNum);
    if (climb) climbs.push(climb);
  }

  return climbs;
}

function buildClimb(
  pts: Route['points'],
  startIdx: number,
  endIdx: number,
  n: number,
): DetectedClimb | null {
  const start = pts[startIdx];
  const end   = pts[endIdx];
  const lengthM = end.distance - start.distance;

  if (lengthM < MIN_CLIMB_LENGTH_M) return null;

  const elevationGainM = Math.max(0, end.ele - start.ele);
  const avgGradient = lengthM > 0 ? (elevationGainM / lengthM) * 100 : 0;

  return {
    name:           `Climb ${n}`,
    startDistance:  start.distance,
    endDistance:    end.distance,
    lengthM,
    elevationGainM,
    avgGradient,
  };
}

// ===========================================================================
// Section 2 — Live ride state machine (updateClimbDetection)
// ===========================================================================

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClimbSegment {
  /** Unique identifier for this climb event. */
  id: string;
  /** Distance (m from route start) at which the climb began. */
  startDistance: number;
  /** Distance (m from route start) at which the climb ended. null while ongoing. */
  endDistance: number | null;
  /** Mean grade (%) over all samples collected during the climb. */
  avgGrade: number;
  /** Horizontal distance of the climb, metres. Computed when ended. */
  lengthMeters: number;
  /** Wall-clock ms when the climb started. */
  startedAtMs: number;
  /** Wall-clock ms when the climb ended. null while ongoing. */
  endedAtMs: number | null;
}

export interface ClimbDetectorState {
  inClimb: boolean;
  climbStartDistance: number | null;
  climbStartedAtMs: number | null;
  /** Accumulated grade samples since climb started (or rise counter pre-start). */
  gradeSamples: number[];
  /** Counter: consecutive samples ≥4% grade (used to trigger climb start). */
  riseConsecutive: number;
  /** Counter: consecutive samples <2% grade (used to trigger climb end). */
  fallConsecutive: number;
  /** Monotonic counter for generating stable IDs. */
  _idCounter: number;
}

export function createClimbDetectorState(): ClimbDetectorState {
  return {
    inClimb: false,
    climbStartDistance: null,
    climbStartedAtMs: null,
    gradeSamples: [],
    riseConsecutive: 0,
    fallConsecutive: 0,
    _idCounter: 0,
  };
}

// ---------------------------------------------------------------------------
// Constants (live detection)
// ---------------------------------------------------------------------------

/** Grade must be ≥ this to count toward a climb. */
const LIVE_MIN_CLIMB_GRADE = 4.0;

/** Grade must be < this for descent samples. */
const LIVE_MIN_DESCENT_GRADE = 2.0;

/**
 * Number of consecutive samples ≥4% required to declare "climb started".
 * At ~10 Hz this is ≈3 seconds of sustained climbing.
 */
const RISE_SAMPLES_REQUIRED = 30;

/**
 * Number of consecutive samples <2% required to declare "climb ended".
 * At ~10 Hz this is ≈2 seconds of flat/descent.
 */
const FALL_SAMPLES_REQUIRED = 20;

// ---------------------------------------------------------------------------
// updateClimbDetection
// ---------------------------------------------------------------------------

export interface ClimbDetectionResult {
  /** 'started' when a climb threshold is crossed, 'ended' when descent confirmed. */
  event: 'started' | 'ended' | null;
  /** Partial ClimbSegment data relevant to the event. null when event is null. */
  climb: Partial<ClimbSegment> | null;
}

/**
 * Pure state-machine tick. Call once per rAF frame (or whenever a new grade
 * sample is available). Mutates `state` in place — hold it in a React ref.
 *
 * @param currentGrade    Smoothed grade at rider's current position (%).
 * @param currentDistance Cumulative distance ridden (m).
 * @param nowMs           Wall-clock timestamp (Date.now() or performance.now()).
 * @param state           Mutable ClimbDetectorState from createClimbDetectorState().
 * @returns               { event, climb } — both null when nothing changed.
 */
export function updateClimbDetection(
  currentGrade: number,
  currentDistance: number,
  nowMs: number,
  state: ClimbDetectorState,
): ClimbDetectionResult {
  const NULL_RESULT: ClimbDetectionResult = { event: null, climb: null };

  if (!state.inClimb) {
    // ---- Waiting for climb to start ----
    if (currentGrade >= LIVE_MIN_CLIMB_GRADE) {
      state.riseConsecutive += 1;
      state.gradeSamples.push(currentGrade);
    } else {
      state.riseConsecutive = 0;
      state.gradeSamples = [];
    }

    if (state.riseConsecutive >= RISE_SAMPLES_REQUIRED) {
      // Compute rolling average over the accumulated samples.
      const avg = state.gradeSamples.reduce((a, b) => a + b, 0) / state.gradeSamples.length;
      if (avg >= LIVE_MIN_CLIMB_GRADE) {
        // Climb confirmed.
        state.inClimb = true;
        state.climbStartDistance = currentDistance;
        state.climbStartedAtMs = nowMs;
        state.fallConsecutive = 0;
        // Keep gradeSamples for ongoing avg tracking.

        state._idCounter += 1;
        return {
          event: 'started',
          climb: {
            id: `climb-${state._idCounter}`,
            startDistance: currentDistance,
            startedAtMs: nowMs,
            endDistance: null,
            endedAtMs: null,
            avgGrade: avg,
            lengthMeters: 0,
          },
        };
      }
    }
    return NULL_RESULT;
  }

  // ---- Inside a climb ----
  state.gradeSamples.push(currentGrade);

  if (currentGrade < LIVE_MIN_DESCENT_GRADE) {
    state.fallConsecutive += 1;
  } else {
    state.fallConsecutive = 0;
  }

  if (state.fallConsecutive >= FALL_SAMPLES_REQUIRED) {
    // Climb ended.
    const avgGrade =
      state.gradeSamples.length > 0
        ? state.gradeSamples.reduce((a, b) => a + b, 0) / state.gradeSamples.length
        : 0;
    const startDist = state.climbStartDistance ?? currentDistance;
    const lengthMeters = Math.max(0, currentDistance - startDist);

    // Reset state.
    state.inClimb = false;
    state.climbStartDistance = null;
    state.climbStartedAtMs = null;
    state.gradeSamples = [];
    state.riseConsecutive = 0;
    state.fallConsecutive = 0;

    state._idCounter += 1;
    return {
      event: 'ended',
      climb: {
        id: `climb-${state._idCounter}`,
        endDistance: currentDistance,
        endedAtMs: nowMs,
        avgGrade: Math.max(0, avgGrade),
        lengthMeters,
      },
    };
  }

  return NULL_RESULT;
}
