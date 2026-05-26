/**
 * workoutVoiceCues.test.ts — Unit tests for the workout voice-cue engine.
 *
 * The speechSynthesis module is mocked so tests run in Node (no browser API).
 * We verify that cues fire at the right moments and never repeat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createVoiceCueState,
  detectAndSpeakCue,
  type VoiceCueState,
  type VoiceCueSettings,
} from './workoutVoiceCues';
import type { WorkoutSegment } from './workout';

// ---------------------------------------------------------------------------
// Mock speechSynthesis so speakLine is a no-op we can spy on
// ---------------------------------------------------------------------------

vi.mock('./speechSynthesis', () => ({
  speakLine: vi.fn(),
  pickPreferredVoice: vi.fn(() => undefined),
}));

import { speakLine } from './speechSynthesis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<WorkoutSegment> = {}): WorkoutSegment {
  return {
    id: 'seg-1',
    kind: 'interval',
    label: 'Z4 interval',
    durationSec: 300,
    target: { type: 'ftpPct', value: 1.0 },
    ...overrides,
  };
}

const DEFAULT_SETTINGS: VoiceCueSettings = {
  workoutVoiceCuesEnabled: true,
  commentaryVolume: 70,
  commentaryRate: 100,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectAndSpeakCue — segment transition', () => {
  let state: VoiceCueState;
  beforeEach(() => {
    state = createVoiceCueState();
    vi.mocked(speakLine).mockClear();
  });

  it('fires the transition cue on first call for a new segment', () => {
    const seg = makeSegment({ id: 'seg-1', durationSec: 300 });
    detectAndSpeakCue(seg, null, 0, 300, state, DEFAULT_SETTINGS);
    expect(speakLine).toHaveBeenCalledOnce();
  });

  it('does NOT refire the transition cue on subsequent frames of the same segment', () => {
    const seg = makeSegment({ id: 'seg-1', durationSec: 300 });
    detectAndSpeakCue(seg, null, 0, 300, state, DEFAULT_SETTINGS);
    detectAndSpeakCue(seg, null, 5, 300, state, DEFAULT_SETTINGS);
    detectAndSpeakCue(seg, null, 10, 300, state, DEFAULT_SETTINGS);
    // Only the first call should trigger.
    expect(speakLine).toHaveBeenCalledOnce();
  });

  it('fires a new transition cue when the segment id changes', () => {
    const seg1 = makeSegment({ id: 'seg-1', durationSec: 120 });
    const seg2 = makeSegment({ id: 'seg-2', kind: 'recovery', durationSec: 60 });
    detectAndSpeakCue(seg1, seg2, 0, 120, state, DEFAULT_SETTINGS);
    detectAndSpeakCue(seg2, null, 0, 60, state, DEFAULT_SETTINGS);
    expect(speakLine).toHaveBeenCalledTimes(2);
  });

  it('transition cue text contains the zone name for an interval', () => {
    const seg = makeSegment({ id: 'seg-1', kind: 'interval', durationSec: 120 });
    detectAndSpeakCue(seg, null, 0, 120, state, DEFAULT_SETTINGS);
    const call = vi.mocked(speakLine).mock.calls[0][0];
    expect(call).toMatch(/interval/i);
  });

  it('transition cue text contains "Recover" for a recovery segment', () => {
    const seg = makeSegment({ id: 'seg-1', kind: 'recovery', durationSec: 120 });
    detectAndSpeakCue(seg, null, 0, 120, state, DEFAULT_SETTINGS);
    const call = vi.mocked(speakLine).mock.calls[0][0];
    expect(call.toLowerCase()).toContain('recover');
  });
});

describe('detectAndSpeakCue — halfway cue', () => {
  let state: VoiceCueState;
  beforeEach(() => {
    state = createVoiceCueState();
    vi.mocked(speakLine).mockClear();
  });

  it('fires the halfway cue when elapsed >= 50% for segments >=60 s', () => {
    const seg = makeSegment({ id: 'seg-1', durationSec: 120 });
    // Frame 1: transition cue
    detectAndSpeakCue(seg, null, 0, 120, state, DEFAULT_SETTINGS);
    vi.mocked(speakLine).mockClear();
    // Frame 2: at exactly the halfway point
    detectAndSpeakCue(seg, null, 60, 120, state, DEFAULT_SETTINGS);
    expect(speakLine).toHaveBeenCalledOnce();
    const call = vi.mocked(speakLine).mock.calls[0][0];
    expect(call.toLowerCase()).toContain('halfway');
  });

  it('does NOT fire halfway cue again on subsequent frames', () => {
    const seg = makeSegment({ id: 'seg-1', durationSec: 120 });
    detectAndSpeakCue(seg, null, 0, 120, state, DEFAULT_SETTINGS);
    vi.mocked(speakLine).mockClear();
    detectAndSpeakCue(seg, null, 60, 120, state, DEFAULT_SETTINGS);
    detectAndSpeakCue(seg, null, 70, 120, state, DEFAULT_SETTINGS);
    detectAndSpeakCue(seg, null, 80, 120, state, DEFAULT_SETTINGS);
    expect(speakLine).toHaveBeenCalledOnce();
  });

  it('does NOT fire halfway cue for segments shorter than 60 s', () => {
    const seg = makeSegment({ id: 'seg-1', durationSec: 30 });
    detectAndSpeakCue(seg, null, 0, 30, state, DEFAULT_SETTINGS);
    vi.mocked(speakLine).mockClear();
    detectAndSpeakCue(seg, null, 15, 30, state, DEFAULT_SETTINGS);
    expect(speakLine).not.toHaveBeenCalled();
  });
});

describe('detectAndSpeakCue — 30-second warning', () => {
  let state: VoiceCueState;
  beforeEach(() => {
    state = createVoiceCueState();
    vi.mocked(speakLine).mockClear();
  });

  it('fires the 30s warning when <=30 s remain for segments >=45 s (with next segment)', () => {
    const seg = makeSegment({ id: 'seg-1', durationSec: 300 });
    const nextSeg = makeSegment({ id: 'seg-2', kind: 'recovery', durationSec: 120 });
    // Transition cue fires at elapsed=0
    detectAndSpeakCue(seg, nextSeg, 0, 300, state, DEFAULT_SETTINGS);
    // Pre-fire the halfway cue so it doesn't interfere at elapsed=270
    detectAndSpeakCue(seg, nextSeg, 150, 300, state, DEFAULT_SETTINGS);
    vi.mocked(speakLine).mockClear();
    // At 270 s elapsed, 30 s remain — only the 30s warning should fire
    detectAndSpeakCue(seg, nextSeg, 270, 300, state, DEFAULT_SETTINGS);
    expect(speakLine).toHaveBeenCalledOnce();
  });

  it('does NOT refire the 30s warning on subsequent frames', () => {
    const seg = makeSegment({ id: 'seg-1', durationSec: 300 });
    const nextSeg = makeSegment({ id: 'seg-2', kind: 'recovery', durationSec: 60 });
    // Transition at 0, halfway at 150
    detectAndSpeakCue(seg, nextSeg, 0, 300, state, DEFAULT_SETTINGS);
    detectAndSpeakCue(seg, nextSeg, 150, 300, state, DEFAULT_SETTINGS);
    vi.mocked(speakLine).mockClear();
    // First frame in 30s window fires the warning
    detectAndSpeakCue(seg, nextSeg, 270, 300, state, DEFAULT_SETTINGS);
    // Subsequent frames must not refire
    detectAndSpeakCue(seg, nextSeg, 275, 300, state, DEFAULT_SETTINGS);
    detectAndSpeakCue(seg, nextSeg, 280, 300, state, DEFAULT_SETTINGS);
    expect(speakLine).toHaveBeenCalledOnce();
  });

  it('does NOT fire 30s warning when there is no next segment (fires halfway instead)', () => {
    // At elapsed=270 with no nextSegment the 30s branch skips, then halfway fires
    // (since lastSpokenHalfwayId is still null). Pre-seed halfway to avoid it.
    const seg = makeSegment({ id: 'seg-1', durationSec: 300 });
    detectAndSpeakCue(seg, null, 0, 300, state, DEFAULT_SETTINGS);
    detectAndSpeakCue(seg, null, 150, 300, state, DEFAULT_SETTINGS);
    vi.mocked(speakLine).mockClear();
    detectAndSpeakCue(seg, null, 270, 300, state, DEFAULT_SETTINGS);
    // Nothing should fire: 30s skipped (no next), halfway already spoken
    expect(speakLine).not.toHaveBeenCalled();
  });
});

describe('detectAndSpeakCue — disabled', () => {
  it('is a no-op when workoutVoiceCuesEnabled is false', () => {
    vi.mocked(speakLine).mockClear();
    const state = createVoiceCueState();
    const seg = makeSegment({ id: 'seg-1', durationSec: 300 });
    const settings: VoiceCueSettings = { ...DEFAULT_SETTINGS, workoutVoiceCuesEnabled: false };
    detectAndSpeakCue(seg, null, 0, 300, state, settings);
    expect(speakLine).not.toHaveBeenCalled();
  });

  it('is a no-op when commentaryVolume is 0', () => {
    vi.mocked(speakLine).mockClear();
    const state = createVoiceCueState();
    const seg = makeSegment({ id: 'seg-1', durationSec: 300 });
    const settings: VoiceCueSettings = { ...DEFAULT_SETTINGS, commentaryVolume: 0 };
    detectAndSpeakCue(seg, null, 0, 300, state, settings);
    expect(speakLine).not.toHaveBeenCalled();
  });
});

describe('createVoiceCueState', () => {
  it('starts with all ids null', () => {
    const s = createVoiceCueState();
    expect(s.lastSpokenSegmentId).toBeNull();
    expect(s.lastSpokenHalfwayId).toBeNull();
    expect(s.lastSpokenT30sId).toBeNull();
  });
});
