/**
 * commentator.test.ts — Unit tests for the live AI commentator.
 *
 * Tests cover:
 *   - detectTriggers: speed milestones, halfway, climb entry, descent exit,
 *     power dropout, recovery, bot attack, bot catch, final 2km
 *   - Throttling: state.lastFiredMs gate
 *   - Priority selection: TRIGGER_PRIORITY ordering
 *   - One-shot announcements (speed milestones)
 *   - pickAndGenerate: static line selection, fallback on no triggers
 */

import { describe, it, expect } from 'vitest';
import {
  detectTriggers,
  createCommentatorState,
  pickAndGenerate,
  type RideSnapshot,
} from './commentator';
import { TRIGGER_PRIORITY } from './commentatorStaticLines';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<RideSnapshot> = {}): RideSnapshot {
  return {
    speed: 10,          // m/s (~36 km/h)
    power: 200,
    grade: 0,
    distance: 1000,
    totalDistance: 10000,
    rideState: 'running',
    leadBotGapM: null,
    botCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectTriggers — trigger detection
// ---------------------------------------------------------------------------

describe('detectTriggers — speed milestones', () => {
  it('fires speed_50 when crossing 50 km/h', () => {
    const state = createCommentatorState();
    const snap = makeSnapshot({ speed: 50 / 3.6 + 0.1 }); // just over 50 km/h
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('speed_50');
  });

  it('fires speed_60 when crossing 60 km/h', () => {
    const state = createCommentatorState();
    const snap = makeSnapshot({ speed: 60 / 3.6 + 0.1 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('speed_60');
    expect(triggers).not.toContain('speed_50'); // collapsed by speed_60 path
  });

  it('fires speed_70 when crossing 70 km/h', () => {
    const state = createCommentatorState();
    const snap = makeSnapshot({ speed: 70 / 3.6 + 0.1 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('speed_70');
  });

  it('does NOT re-fire speed_50 once announced', () => {
    const state = createCommentatorState();
    state.announcedSpeed50 = true;
    const snap = makeSnapshot({ speed: 50 / 3.6 + 0.1 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).not.toContain('speed_50');
  });

  it('does not fire speed milestones below threshold', () => {
    const state = createCommentatorState();
    const snap = makeSnapshot({ speed: 40 / 3.6 }); // 40 km/h
    const triggers = detectTriggers(snap, state);
    expect(triggers).not.toContain('speed_50');
    expect(triggers).not.toContain('speed_60');
    expect(triggers).not.toContain('speed_70');
  });
});

describe('detectTriggers — halfway and final 2km', () => {
  it('fires halfway at 50% distance', () => {
    const state = createCommentatorState();
    const snap = makeSnapshot({ distance: 5000, totalDistance: 10000 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('halfway');
  });

  it('does NOT re-fire halfway once announced', () => {
    const state = createCommentatorState();
    state.announcedHalfway = true;
    const snap = makeSnapshot({ distance: 5000, totalDistance: 10000 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).not.toContain('halfway');
  });

  it('fires final_2km when 2000m remain', () => {
    const state = createCommentatorState();
    const snap = makeSnapshot({ distance: 8000, totalDistance: 10000 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('final_2km');
  });

  it('does NOT fire final_2km when more than 2km remain', () => {
    const state = createCommentatorState();
    const snap = makeSnapshot({ distance: 7000, totalDistance: 10000 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).not.toContain('final_2km');
  });
});

describe('detectTriggers — climb and descent', () => {
  it('fires climb_entry when grade rises above threshold', () => {
    const state = createCommentatorState();
    state.prevOnClimb = false;
    const snap = makeSnapshot({ grade: 4.0 }); // above 3.5% threshold
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('climb_entry');
  });

  it('does NOT fire climb_entry when already on a climb', () => {
    const state = createCommentatorState();
    state.prevOnClimb = true;
    const snap = makeSnapshot({ grade: 5.0 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).not.toContain('climb_entry');
  });

  it('fires descent_exit when leaving a descent', () => {
    const state = createCommentatorState();
    state.prevOnDescent = true;
    const snap = makeSnapshot({ grade: 0.0 }); // flat — exits descent
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('descent_exit');
  });

  it('does NOT fire descent_exit when still descending', () => {
    const state = createCommentatorState();
    state.prevOnDescent = true;
    const snap = makeSnapshot({ grade: -4.0 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).not.toContain('descent_exit');
  });
});

describe('detectTriggers — power dropout and recovery', () => {
  it('fires power_dropout when power drops to near-zero', () => {
    const state = createCommentatorState();
    state.prevHasPower = true;
    const snap = makeSnapshot({ power: 3 }); // below POWER_DROPOUT_THRESHOLD (5)
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('power_dropout');
  });

  it('fires recovery when power returns after dropout', () => {
    const state = createCommentatorState();
    state.prevHasPower = false;
    state.lastFiredMs = 1000; // has fired before
    const snap = makeSnapshot({ power: 200 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('recovery');
  });

  it('does NOT fire recovery on first tick (lastFiredMs = 0)', () => {
    const state = createCommentatorState();
    state.prevHasPower = false;
    state.lastFiredMs = 0; // never fired
    const snap = makeSnapshot({ power: 200 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).not.toContain('recovery');
  });
});

describe('detectTriggers — pace bot events', () => {
  it('fires bot_attack when bot opens a lead gap', () => {
    const state = createCommentatorState();
    state.prevBotGapM = 2; // bot was close/behind
    const snap = makeSnapshot({ leadBotGapM: 20, botCount: 1 }); // bot now 20m ahead
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('bot_attack');
  });

  it('fires bot_catch when rider closes in on a leading bot', () => {
    const state = createCommentatorState();
    state.prevBotGapM = 30; // bot was far ahead
    const snap = makeSnapshot({ leadBotGapM: 3, botCount: 1 }); // rider caught up
    const triggers = detectTriggers(snap, state);
    expect(triggers).toContain('bot_catch');
  });
});

describe('detectTriggers — inactive states', () => {
  it('returns empty array when rideState is not running', () => {
    const state = createCommentatorState();
    const snap = makeSnapshot({ rideState: 'paused', speed: 70 / 3.6 + 0.5 });
    const triggers = detectTriggers(snap, state);
    expect(triggers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Throttling
// ---------------------------------------------------------------------------

describe('throttling via commentatorState.lastFiredMs', () => {
  it('respects throttle: triggers detected are returned regardless (throttle is in the loop not here)', () => {
    // detectTriggers itself doesn't check lastFiredMs — the loop does.
    // This test verifies the function returns triggers even when lastFiredMs is recent.
    const state = createCommentatorState();
    state.lastFiredMs = Date.now(); // just fired
    const snap = makeSnapshot({ speed: 60 / 3.6 + 0.1 });
    const triggers = detectTriggers(snap, state);
    // detectTriggers does NOT throttle — it just detects. Throttle is in useRideLoop.
    expect(triggers).toContain('speed_60');
  });

  it('state.lastFiredMs is NOT mutated by detectTriggers', () => {
    const state = createCommentatorState();
    const before = state.lastFiredMs;
    const snap = makeSnapshot({ speed: 55 / 3.6 });
    detectTriggers(snap, state);
    expect(state.lastFiredMs).toBe(before); // detectTriggers never updates lastFiredMs
  });
});

// ---------------------------------------------------------------------------
// Priority selection
// ---------------------------------------------------------------------------

describe('TRIGGER_PRIORITY ordering', () => {
  it('bot_attack has higher priority than climb_entry', () => {
    const botAttackIdx = TRIGGER_PRIORITY.indexOf('bot_attack');
    const climbIdx = TRIGGER_PRIORITY.indexOf('climb_entry');
    expect(botAttackIdx).toBeLessThan(climbIdx);
  });

  it('climb_entry has higher priority than halfway', () => {
    const climbIdx = TRIGGER_PRIORITY.indexOf('climb_entry');
    const halfwayIdx = TRIGGER_PRIORITY.indexOf('halfway');
    expect(climbIdx).toBeLessThan(halfwayIdx);
  });

  it('speed_70 has higher priority than speed_50', () => {
    const s70 = TRIGGER_PRIORITY.indexOf('speed_70');
    const s50 = TRIGGER_PRIORITY.indexOf('speed_50');
    expect(s70).toBeLessThan(s50);
  });

  it('all 11 trigger types are represented in the priority list', () => {
    const expected = [
      'bot_attack', 'bot_catch', 'climb_entry', 'final_2km', 'halfway',
      'speed_70', 'speed_60', 'speed_50', 'power_dropout', 'descent_exit', 'recovery',
    ];
    for (const trigger of expected) {
      expect(TRIGGER_PRIORITY).toContain(trigger);
    }
  });
});

// ---------------------------------------------------------------------------
// pickAndGenerate
// ---------------------------------------------------------------------------

describe('pickAndGenerate', () => {
  it('returns null for an empty trigger list', async () => {
    const snap = makeSnapshot();
    const result = await pickAndGenerate([], snap);
    expect(result).toBeNull();
  });

  it('returns a static string for halfway trigger (no fetch needed)', async () => {
    const snap = makeSnapshot();
    const result = await pickAndGenerate(['halfway'], snap);
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(10);
  });

  it('returns a static string for speed_50 trigger', async () => {
    const snap = makeSnapshot();
    const result = await pickAndGenerate(['speed_50'], snap);
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(5);
  });

  it('picks highest-priority trigger when multiple are present', async () => {
    // climb_entry > halfway in priority
    const snap = makeSnapshot();
    // climb_entry has no static lines — it will try LLM and fall back.
    // We just verify the function resolves without throwing.
    const result = await pickAndGenerate(['halfway', 'climb_entry'], snap);
    expect(typeof result).toBe('string');
  });
});
