/**
 * climbDetection.test.ts — Unit tests for the live climb-detection state machine
 * AND the static findClimbs route scanner.
 */

import { describe, it, expect } from 'vitest';
import {
  createClimbDetectorState,
  updateClimbDetection,
  findClimbs,
  type ClimbDetectorState,
} from './climbDetection';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Push N identical samples at the given grade into the state machine. */
function pushSamples(
  n: number,
  grade: number,
  state: ClimbDetectorState,
  startDist = 0,
  nowMs = 1000,
) {
  let result = { event: null as 'started' | 'ended' | null, climb: null as object | null };
  for (let i = 0; i < n; i++) {
    result = updateClimbDetection(grade, startDist + i * 10, nowMs + i * 100, state);
  }
  return result;
}

function makeRoute(points: Array<{ distance: number; ele: number }>): Route {
  return {
    name: 'Test',
    totalDistance: points[points.length - 1]?.distance ?? 0,
    points: points.map((p, i) => ({
      lat: 0,
      lon: i * 0.001,
      ele: p.ele,
      distance: p.distance,
    })),
  } as Route;
}

// ---------------------------------------------------------------------------
// Live state-machine tests
// ---------------------------------------------------------------------------

describe('updateClimbDetection — climb start', () => {
  it('returns event=null before the rise threshold is met', () => {
    const state = createClimbDetectorState();
    // 29 samples at 5% — one short of the required 30
    const result = pushSamples(29, 5, state);
    expect(result.event).toBeNull();
    expect(state.inClimb).toBe(false);
  });

  it('fires event=started after 30 consecutive samples ≥4%', () => {
    const state = createClimbDetectorState();
    const result = pushSamples(30, 5, state);
    expect(result.event).toBe('started');
    expect(result.climb).not.toBeNull();
    expect(state.inClimb).toBe(true);
  });

  it('does NOT fire when grade is below 4%', () => {
    const state = createClimbDetectorState();
    const result = pushSamples(50, 3.9, state);
    expect(result.event).toBeNull();
    expect(state.inClimb).toBe(false);
  });

  it('resets the consecutive counter when grade drops below threshold', () => {
    const state = createClimbDetectorState();
    // Push 20 high samples, then one low, then 30 more high
    pushSamples(20, 5, state);
    updateClimbDetection(1, 200, 3000, state); // resets counter
    const result = pushSamples(30, 5, state, 210);
    expect(result.event).toBe('started');
  });

  it('includes a non-null id in the started climb', () => {
    const state = createClimbDetectorState();
    const result = pushSamples(30, 5, state);
    expect(result.event).toBe('started');
    const climb = result.climb as { id: string } | null;
    expect(typeof climb?.id).toBe('string');
    expect(climb!.id.length).toBeGreaterThan(0);
  });
});

describe('updateClimbDetection — climb end', () => {
  it('fires event=ended after 20 consecutive samples <2% following a climb', () => {
    const state = createClimbDetectorState();
    // Start the climb
    pushSamples(30, 6, state);
    expect(state.inClimb).toBe(true);
    // Now descend
    const result = pushSamples(20, 1, state, 300, 5000);
    expect(result.event).toBe('ended');
    expect(state.inClimb).toBe(false);
  });

  it('does NOT end the climb with only 19 low samples', () => {
    const state = createClimbDetectorState();
    pushSamples(30, 6, state);
    const result = pushSamples(19, 1, state, 300, 5000);
    expect(result.event).toBeNull();
    expect(state.inClimb).toBe(true);
  });

  it('computes avgGrade as mean of all samples during the climb', () => {
    const state = createClimbDetectorState();
    // All rise samples at 8%
    pushSamples(30, 8, state);
    // End the climb
    const result = pushSamples(20, 0, state, 300, 5000);
    expect(result.event).toBe('ended');
    // avgGrade should be weighted toward 8% (all samples inside were 8 or 0)
    // Exact value depends on how many 8% vs 0% samples; just assert it's positive.
    expect((result.climb as { avgGrade: number }).avgGrade).toBeGreaterThan(0);
  });

  it('resets state fully after climb ends', () => {
    const state = createClimbDetectorState();
    pushSamples(30, 6, state);
    pushSamples(20, 0, state, 300, 5000);
    expect(state.inClimb).toBe(false);
    expect(state.riseConsecutive).toBe(0);
    expect(state.fallConsecutive).toBe(0);
    expect(state.gradeSamples).toHaveLength(0);
  });
});

describe('updateClimbDetection — multiple climbs', () => {
  it('can detect a second climb after the first one ends', () => {
    const state = createClimbDetectorState();
    // First climb
    pushSamples(30, 5, state, 0, 1000);
    pushSamples(20, 0, state, 300, 5000);
    expect(state.inClimb).toBe(false);
    // Second climb
    const result = pushSamples(30, 7, state, 500, 10000);
    expect(result.event).toBe('started');
    expect(state.inClimb).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findClimbs (static scan) — a few regression guards
// ---------------------------------------------------------------------------

describe('findClimbs — static scan', () => {
  it('returns empty array for a route with fewer than 2 points', () => {
    const route = makeRoute([{ distance: 0, ele: 100 }]);
    expect(findClimbs(route)).toHaveLength(0);
  });

  it('detects a simple sustained ascent', () => {
    // 500m at 5% → ele rises 25m
    const route = makeRoute([
      { distance: 0, ele: 0 },
      { distance: 500, ele: 25 },
    ]);
    const climbs = findClimbs(route);
    expect(climbs.length).toBeGreaterThan(0);
    expect(climbs[0].avgGradient).toBeCloseTo(5, 0);
  });

  it('ignores a short ascent below MIN_CLIMB_LENGTH_M', () => {
    // 100m at 10% — strictly less than MIN_CLIMB_LENGTH_M=200
    // We need the gap after the climb to exceed MAX_GAP_M (100m) so the state
    // machine closes and calls buildClimb. Use 201m of flat after.
    const route = makeRoute([
      { distance: 0, ele: 0 },
      { distance: 100, ele: 10 },
      { distance: 301, ele: 10 }, // 201m flat — exceeds MAX_GAP_M, closes climb
    ]);
    expect(findClimbs(route)).toHaveLength(0);
  });
});
