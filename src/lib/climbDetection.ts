/**
 * climbDetection.ts — Detect named climbs along a GPX route.
 *
 * Wave 18.A will replace this stub with a full implementation that integrates
 * Cesium portal detection. The exported types and function signature are the
 * integration contract — do not change them without updating all callers.
 *
 * Algorithm (stub):
 *   Scans route points for sustained positive grade sections (≥3%, ≥200m).
 *   Groups contiguous climbing segments into a named climb object.
 *   Names fall back to "Climb <N>" when no geographic label is available.
 */

import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Public types — Wave 18.A must honour this shape
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
// Constants
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

  // State machine: track whether we are currently inside a climb.
  let inClimb = false;
  let climbStartIdx = 0;
  let gapAccum = 0; // accumulated non-climbing distance during a potential gap

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
      // Already in a climb.
      if (!isClimbing) {
        gapAccum += segLen;
        if (gapAccum > MAX_GAP_M) {
          // Gap too large — close out the climb at the last climbing point.
          const climb = buildClimb(pts, climbStartIdx, i - 1, ++climbNum);
          if (climb) climbs.push(climb);
          inClimb = false;
          gapAccum = 0;
        }
      } else {
        // Resumed climbing — reset gap accumulator.
        gapAccum = 0;
      }
    }
  }

  // Close any open climb at end of route.
  if (inClimb) {
    const climb = buildClimb(pts, climbStartIdx, pts.length - 1, ++climbNum);
    if (climb) climbs.push(climb);
  }

  return climbs;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
