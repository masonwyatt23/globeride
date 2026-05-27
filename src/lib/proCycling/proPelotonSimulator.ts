/**
 * Pro Peloton Simulator
 *
 * Pure functions — no Cesium, no React, no stores. Advances ghost pro-rider
 * positions based on their official finish time and route total distance,
 * assuming a constant pace throughout the stage. This gives game-feel
 * positioning: Pogacar rides at the pace required to finish in his actual time,
 * and the user can see exactly how far ahead or behind they are.
 *
 * Design: allocation-free per-frame tick (returns new object literals with
 * primitive fields — identical pattern to tickPaceBot in paceBots.ts).
 */

import type { StageResults, StageFinisher, ProRider } from '@/lib/proCycling/stageResults';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Live state for a single pro-rider ghost. */
export interface ProRiderState {
  rider: ProRider;
  /** Official stage finish time in seconds. Determines constant pace. */
  finishTimeSec: number;
  /** GC stage rank. */
  rank: number;
  /** Cumulative distance along the route, meters. Advances each tick. */
  distance: number;
  /** Current speed in m/s (constant: routeTotalDistanceM / finishTimeSec). */
  speed: number;
}

/**
 * All ghost pro riders active for the current stage.
 * Null when no stage data is loaded or the user hasn't opted in.
 */
export interface ProPelotonState {
  /** Ordered by stage rank (rank 1 = stage winner first). */
  riders: ProRiderState[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ProPelotonState from stage results. Each rider starts at distance 0
 * with their constant speed derived from finish time and route distance.
 *
 * @param results              Curated stage finishing data.
 * @param routeTotalDistanceM  Total route length in meters (from Route.totalDistance).
 * @param topN                 Only include the top N finishers. Defaults to all.
 */
export function createProPelotonFromStage(
  results: StageResults,
  routeTotalDistanceM: number,
  topN?: number,
): ProPelotonState {
  const sorted = [...results.results].sort((a, b) => a.rank - b.rank);
  const selected: StageFinisher[] = topN !== undefined ? sorted.slice(0, topN) : sorted;

  const riders: ProRiderState[] = selected.map((finisher) => {
    // Constant pace: entire route / official finish time.
    // Guard against division by zero (degenerate route or data error).
    const speed =
      finisher.finishTimeSec > 0 && routeTotalDistanceM > 0
        ? routeTotalDistanceM / finisher.finishTimeSec
        : 0;

    return {
      rider: finisher.rider,
      finishTimeSec: finisher.finishTimeSec,
      rank: finisher.rank,
      distance: 0,
      speed,
    };
  });

  return { riders };
}

// ---------------------------------------------------------------------------
// Per-frame tick — immutable update
// ---------------------------------------------------------------------------

/**
 * Advance each rider's distance by their constant speed * dt.
 * Riders stop at routeTotalDistanceM (they've finished the stage).
 *
 * @param state                 Current peloton state (read-only).
 * @param dt                    Frame delta in seconds.
 * @param routeTotalDistanceM   Route length in meters (clamp ceiling).
 * @returns                     New state (immutable — original is untouched).
 */
export function tickProPeloton(
  state: ProPelotonState,
  dt: number,
  routeTotalDistanceM: number,
): ProPelotonState {
  // Cap dt at 1.0 s to match the same guard in tickPaceBot — prevents teleporting
  // after a tab suspension recovery. The ride loop already caps dt at 0.1 s in
  // production; this guard is for direct test-time callers.
  const safeDt = Math.min(dt, 1.0);

  const nextRiders: ProRiderState[] = state.riders.map((r) => {
    const newDistance = Math.min(
      routeTotalDistanceM,
      r.distance + r.speed * safeDt,
    );
    // Return a new object — never mutate the previous state.
    return { ...r, distance: newDistance };
  });

  return { riders: nextRiders };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * True when all riders in the peloton have reached or passed the finish line.
 * Once true, the caller may hide all peloton avatars.
 */
export function proPelotonFinished(
  state: ProPelotonState,
  routeTotalDistanceM: number,
): boolean {
  if (state.riders.length === 0) return true;
  return state.riders.every((r) => r.distance >= routeTotalDistanceM);
}
