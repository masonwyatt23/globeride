/**
 * Unit tests for proPelotonSimulator.ts — Wave 34.C
 * Pure — no network, no React, no Cesium, no stores.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createProPelotonFromStage,
  tickProPeloton,
  proPelotonFinished,
  type ProPelotonState,
} from '@/lib/proCycling/proPelotonSimulator';
import { STAGE_RESULTS } from '@/lib/proCycling/stageResults';
import type { StageResults } from '@/lib/proCycling/stageResults';
import type { AvatarColors } from '@/lib/avatarConfig';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DUMMY_COLORS: AvatarColors = {
  frame: '#111111',
  wheel: '#222222',
  kit: '#333333',
  skin: '#d8a877',
  helmet: '#444444',
  accent: '#555555',
};

function makeStageResults(numRiders: number, baseTimeSec = 10000): StageResults {
  return {
    stageId: 'test-stage',
    year: 2024,
    results: Array.from({ length: numRiders }, (_, i) => ({
      rider: {
        name: `Rider ${i + 1}`,
        team: 'Test Team',
        nationality: 'TST',
        colorways: DUMMY_COLORS,
      },
      // Each rider is 30 s slower than the one ahead
      finishTimeSec: baseTimeSec + i * 30,
      rank: i + 1,
    })),
  };
}

// A 100 km route in meters
const ROUTE_DISTANCE = 100_000;

// ---------------------------------------------------------------------------
// createProPelotonFromStage
// ---------------------------------------------------------------------------

describe('createProPelotonFromStage', () => {
  it('produces the correct number of riders from stage data', () => {
    const results = makeStageResults(10);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    expect(state.riders).toHaveLength(10);
  });

  it('limits riders to topN when specified', () => {
    const results = makeStageResults(10);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE, 3);
    expect(state.riders).toHaveLength(3);
  });

  it('top 1 rider is the stage winner (rank 1)', () => {
    const results = makeStageResults(5);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE, 1);
    expect(state.riders[0].rank).toBe(1);
  });

  it('all riders start at distance 0', () => {
    const results = makeStageResults(5);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    for (const rider of state.riders) {
      expect(rider.distance).toBe(0);
    }
  });

  it('speed is computed as routeDistance / finishTimeSec', () => {
    const results = makeStageResults(1, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const expectedSpeed = ROUTE_DISTANCE / 10000;
    expect(state.riders[0].speed).toBeCloseTo(expectedSpeed, 5);
  });

  it('faster finisher (lower time) has higher speed than slower finisher', () => {
    const results = makeStageResults(2, 10000); // rider 1 = 10000s, rider 2 = 10030s
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    expect(state.riders[0].speed).toBeGreaterThan(state.riders[1].speed);
  });

  it('handles degenerate routeDistance=0 without throwing', () => {
    const results = makeStageResults(3);
    expect(() => createProPelotonFromStage(results, 0)).not.toThrow();
  });

  it('handles degenerate finishTimeSec=0 without throwing', () => {
    const badResults: StageResults = {
      stageId: 'bad',
      year: 2024,
      results: [
        { rider: { name: 'X', team: 'T', nationality: 'TST', colorways: DUMMY_COLORS }, finishTimeSec: 0, rank: 1 },
      ],
    };
    expect(() => createProPelotonFromStage(badResults, ROUTE_DISTANCE)).not.toThrow();
    const state = createProPelotonFromStage(badResults, ROUTE_DISTANCE);
    expect(state.riders[0].speed).toBe(0);
  });

  it('works with real Giro 2024 S16 data', () => {
    const sr = STAGE_RESULTS['wt-giro-2024-s16'];
    const state = createProPelotonFromStage(sr, 206_000);
    expect(state.riders.length).toBeGreaterThan(0);
    expect(state.riders[0].speed).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// tickProPeloton
// ---------------------------------------------------------------------------

describe('tickProPeloton', () => {
  it('advances each rider by speed * dt', () => {
    const results = makeStageResults(3, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const next = tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    for (let i = 0; i < state.riders.length; i++) {
      const expected = state.riders[i].speed * 1.0;
      expect(next.riders[i].distance).toBeCloseTo(expected, 3);
    }
  });

  it('faster rider advances more distance per tick than slower rider', () => {
    const results = makeStageResults(2, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const next = tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    expect(next.riders[0].distance).toBeGreaterThan(next.riders[1].distance);
  });

  it('does not mutate the original state', () => {
    const results = makeStageResults(2, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const originalDistances = state.riders.map((r) => r.distance);
    tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    // Original distances should be unchanged
    for (let i = 0; i < state.riders.length; i++) {
      expect(state.riders[i].distance).toBe(originalDistances[i]);
    }
  });

  it('clamps distance at routeTotalDistanceM (rider stops at finish)', () => {
    // Put a rider already near the end and advance by enough to overshoot.
    const results = makeStageResults(1, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    // Manually position the rider 1 m before the finish.
    const nearFinish: ProPelotonState = {
      riders: [{ ...state.riders[0], distance: ROUTE_DISTANCE - 1 }],
    };
    // One tick at dt=1 s: speed = 100_000/10_000 = 10 m/s → would advance 10 m, but clamped.
    const next = tickProPeloton(nearFinish, 1.0, ROUTE_DISTANCE);
    expect(next.riders[0].distance).toBe(ROUTE_DISTANCE);
  });

  it('caps dt at 1.0 s internally (matches pace bot behaviour)', () => {
    const results = makeStageResults(1, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    // Large dt should give same result as dt=1.0 due to internal cap
    const big   = tickProPeloton(state, 60, ROUTE_DISTANCE);
    const small  = tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    expect(big.riders[0].distance).toBeCloseTo(small.riders[0].distance, 3);
  });

  it('rider already at finish line stays at routeTotalDistanceM', () => {
    const results = makeStageResults(1, 10000);
    const atFinish: ProPelotonState = {
      riders: [{ ...createProPelotonFromStage(results, ROUTE_DISTANCE).riders[0], distance: ROUTE_DISTANCE }],
    };
    const next = tickProPeloton(atFinish, 1.0, ROUTE_DISTANCE);
    expect(next.riders[0].distance).toBe(ROUTE_DISTANCE);
  });

  it('accumulates correctly over multiple ticks', () => {
    const results = makeStageResults(1, 10000);
    let state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const speed = state.riders[0].speed;
    // Advance 5 ticks of 1 s each
    for (let i = 0; i < 5; i++) {
      state = tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    }
    expect(state.riders[0].distance).toBeCloseTo(speed * 5, 3);
  });
});

// ---------------------------------------------------------------------------
// proPelotonFinished
// ---------------------------------------------------------------------------

describe('proPelotonFinished', () => {
  it('returns false when riders have not yet reached the finish', () => {
    const results = makeStageResults(3, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    expect(proPelotonFinished(state, ROUTE_DISTANCE)).toBe(false);
  });

  it('returns true when all riders are at or past routeTotalDistanceM', () => {
    const results = makeStageResults(2, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const allFinished: ProPelotonState = {
      riders: state.riders.map((r) => ({ ...r, distance: ROUTE_DISTANCE })),
    };
    expect(proPelotonFinished(allFinished, ROUTE_DISTANCE)).toBe(true);
  });

  it('returns false when only some riders have finished', () => {
    const results = makeStageResults(2, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const partial: ProPelotonState = {
      riders: [
        { ...state.riders[0], distance: ROUTE_DISTANCE }, // finished
        { ...state.riders[1], distance: 50_000 },          // not finished
      ],
    };
    expect(proPelotonFinished(partial, ROUTE_DISTANCE)).toBe(false);
  });

  it('returns true for an empty rider list', () => {
    expect(proPelotonFinished({ riders: [] }, ROUTE_DISTANCE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Allocation regression — Wave 38.E
// tickProPeloton allocates a new array and rider objects per tick (necessary
// for Zustand immutability). These tests document the current contract and
// guard against regressions that would add *extra* allocations such as
// Object.assign, Array.from, or JSON.parse inside the hot path.
// ---------------------------------------------------------------------------

describe('tickProPeloton — allocation regression (Wave 38.E)', () => {
  it('does not call Object.assign during a tick', () => {
    const results = makeStageResults(5, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const spy = vi.spyOn(Object, 'assign');
    tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not call Array.from during a tick', () => {
    const results = makeStageResults(5, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const spy = vi.spyOn(Array, 'from');
    tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not call JSON.parse or JSON.stringify during a tick', () => {
    const results = makeStageResults(3, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const parseSpy = vi.spyOn(JSON, 'parse');
    const stringifySpy = vi.spyOn(JSON, 'stringify');
    tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    expect(parseSpy).not.toHaveBeenCalled();
    expect(stringifySpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
    stringifySpy.mockRestore();
  });

  it('returned state is a distinct object from input (immutability preserved)', () => {
    const results = makeStageResults(3, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const next = tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    expect(next).not.toBe(state);
    expect(next.riders).not.toBe(state.riders);
  });

  it('does not mutate input rider objects', () => {
    const results = makeStageResults(3, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    const origDistances = state.riders.map((r) => r.distance);
    tickProPeloton(state, 1.0, ROUTE_DISTANCE);
    for (let i = 0; i < state.riders.length; i++) {
      expect(state.riders[i].distance).toBe(origDistances[i]);
    }
  });

  it('100-rider tick completes without throwing (stress test)', () => {
    const results = makeStageResults(100, 10000);
    const state = createProPelotonFromStage(results, ROUTE_DISTANCE);
    expect(() => {
      let s = state;
      for (let i = 0; i < 10; i++) {
        s = tickProPeloton(s, 0.016, ROUTE_DISTANCE);
      }
    }).not.toThrow();
  });
});
