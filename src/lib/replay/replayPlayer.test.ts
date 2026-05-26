/**
 * Unit tests for replayPlayer.ts — Wave 35.A.
 */

import { describe, it, expect } from 'vitest';
import {
  createReplayPlayer,
  tickReplay,
  sampleAtTime,
  jumpToTime,
  togglePlayback,
  setCameraMode,
  setPlaybackSpeed,
} from '@/lib/replay/replayPlayer';
import type { TelemetrySample } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSample(t: number, overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    t,
    lat: 46.5,
    lon: 7.9,
    ele: 100,
    distance: t / 1000, // 1 m per ms as a simple proxy
    speed: 5,
    grade: 0,
    ...overrides,
  };
}

/** Build N equally-spaced samples starting at t=0, spacing=1000 ms. */
function buildSamples(n: number, overrides: Partial<TelemetrySample> = {}): TelemetrySample[] {
  return Array.from({ length: n }, (_, i) => makeSample(i * 1000, overrides));
}

// ---------------------------------------------------------------------------
// createReplayPlayer
// ---------------------------------------------------------------------------

describe('createReplayPlayer', () => {
  it('returns paused state', () => {
    const state = createReplayPlayer(buildSamples(10));
    expect(state.isPlaying).toBe(false);
  });

  it('starts at time 0', () => {
    const state = createReplayPlayer(buildSamples(10));
    expect(state.currentTime).toBe(0);
  });

  it('computes durationSec from first and last sample timestamps', () => {
    // 10 samples at 1-second intervals → 9 s duration
    const state = createReplayPlayer(buildSamples(10));
    expect(state.durationSec).toBeCloseTo(9, 5);
  });

  it('defaults to chase camera', () => {
    const state = createReplayPlayer(buildSamples(5));
    expect(state.cameraMode).toBe('chase');
  });

  it('defaults to 1× playback speed', () => {
    const state = createReplayPlayer(buildSamples(5));
    expect(state.playbackSpeed).toBe(1);
  });

  it('handles empty samples gracefully', () => {
    const state = createReplayPlayer([]);
    expect(state.durationSec).toBe(0);
    expect(state.currentTime).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// tickReplay
// ---------------------------------------------------------------------------

describe('tickReplay', () => {
  it('does not advance when paused', () => {
    const state = createReplayPlayer(buildSamples(10));
    const next = tickReplay(state, 1);
    expect(next.currentTime).toBe(0);
  });

  it('advances time by dt when playing', () => {
    const state = { ...createReplayPlayer(buildSamples(10)), isPlaying: true };
    const next = tickReplay(state, 2);
    expect(next.currentTime).toBeCloseTo(2, 5);
  });

  it('applies playbackSpeed multiplier', () => {
    const state = { ...createReplayPlayer(buildSamples(20)), isPlaying: true, playbackSpeed: 4 };
    const next = tickReplay(state, 1);
    expect(next.currentTime).toBeCloseTo(4, 5);
  });

  it('clamps to durationSec at the end', () => {
    const state = { ...createReplayPlayer(buildSamples(5)), isPlaying: true };
    // duration = 4 s; advance 100 s
    const next = tickReplay(state, 100);
    expect(next.currentTime).toBeCloseTo(4, 5);
  });

  it('stops playing when end is reached', () => {
    const state = { ...createReplayPlayer(buildSamples(5)), isPlaying: true };
    const next = tickReplay(state, 100);
    expect(next.isPlaying).toBe(false);
  });

  it('returns same reference when empty samples', () => {
    const state = createReplayPlayer([]);
    const next = tickReplay(state, 1);
    expect(next).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// sampleAtTime
// ---------------------------------------------------------------------------

describe('sampleAtTime', () => {
  it('returns null for empty samples', () => {
    const state = createReplayPlayer([]);
    expect(sampleAtTime(state, 0)).toBeNull();
  });

  it('returns the only sample for single-element arrays', () => {
    const s = [makeSample(0)];
    const state = createReplayPlayer(s);
    expect(sampleAtTime(state, 0)).toBe(s[0]);
  });

  it('returns first sample at t=0', () => {
    const samples = buildSamples(5);
    const state = createReplayPlayer(samples);
    expect(sampleAtTime(state, 0)).toBe(samples[0]);
  });

  it('returns last sample when t exceeds duration', () => {
    const samples = buildSamples(5);
    const state = createReplayPlayer(samples);
    const result = sampleAtTime(state, 1000);
    expect(result).toBe(samples[samples.length - 1]);
  });

  it('picks the closest sample between two candidates', () => {
    // Samples at t=0, 2000, 4000 ms → seconds 0, 2, 4
    const samples = [makeSample(0), makeSample(2000), makeSample(4000)];
    const state = createReplayPlayer(samples);
    // At t=1.0 s: distance to samples[0] = 1000 ms, to samples[1] = 1000 ms → tie → picks samples[1] (hi wins)
    const result = sampleAtTime(state, 1.5);
    expect(result).toBe(samples[1]);
  });
});

// ---------------------------------------------------------------------------
// jumpToTime
// ---------------------------------------------------------------------------

describe('jumpToTime', () => {
  it('sets currentTime correctly', () => {
    const state = createReplayPlayer(buildSamples(20));
    const next = jumpToTime(state, 5);
    expect(next.currentTime).toBeCloseTo(5, 5);
  });

  it('clamps to 0 when t < 0', () => {
    const state = createReplayPlayer(buildSamples(10));
    const next = jumpToTime(state, -3);
    expect(next.currentTime).toBe(0);
  });

  it('clamps to durationSec when t > duration', () => {
    const state = createReplayPlayer(buildSamples(10));
    const next = jumpToTime(state, 999);
    expect(next.currentTime).toBeCloseTo(state.durationSec, 5);
  });

  it('preserves playback state', () => {
    const state = { ...createReplayPlayer(buildSamples(20)), isPlaying: true };
    const next = jumpToTime(state, 3);
    expect(next.isPlaying).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// togglePlayback
// ---------------------------------------------------------------------------

describe('togglePlayback', () => {
  it('starts playing when paused', () => {
    const state = createReplayPlayer(buildSamples(10));
    expect(state.isPlaying).toBe(false);
    const next = togglePlayback(state);
    expect(next.isPlaying).toBe(true);
  });

  it('pauses when playing', () => {
    const state = { ...createReplayPlayer(buildSamples(10)), isPlaying: true };
    const next = togglePlayback(state);
    expect(next.isPlaying).toBe(false);
  });

  it('restarts from beginning when toggled at the end', () => {
    const samples = buildSamples(5);
    const state = createReplayPlayer(samples);
    const atEnd = { ...state, currentTime: state.durationSec, isPlaying: false };
    const next = togglePlayback(atEnd);
    expect(next.isPlaying).toBe(true);
    expect(next.currentTime).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setCameraMode
// ---------------------------------------------------------------------------

describe('setCameraMode', () => {
  it('updates camera mode', () => {
    const state = createReplayPlayer(buildSamples(5));
    const next = setCameraMode(state, 'overhead');
    expect(next.cameraMode).toBe('overhead');
  });

  it('does not mutate original state', () => {
    const state = createReplayPlayer(buildSamples(5));
    setCameraMode(state, 'cinematic');
    expect(state.cameraMode).toBe('chase');
  });

  it('accepts all valid camera modes', () => {
    const modes = ['chase', 'firstPerson', 'overhead', 'sideTracking', 'cinematic'] as const;
    const state = createReplayPlayer(buildSamples(5));
    for (const mode of modes) {
      expect(setCameraMode(state, mode).cameraMode).toBe(mode);
    }
  });
});

// ---------------------------------------------------------------------------
// setPlaybackSpeed
// ---------------------------------------------------------------------------

describe('setPlaybackSpeed', () => {
  it('sets the playback speed', () => {
    const state = createReplayPlayer(buildSamples(5));
    const next = setPlaybackSpeed(state, 2);
    expect(next.playbackSpeed).toBe(2);
  });

  it('ignores zero speed', () => {
    const state = createReplayPlayer(buildSamples(5));
    const next = setPlaybackSpeed(state, 0);
    expect(next.playbackSpeed).toBe(1); // unchanged
  });

  it('ignores negative speed', () => {
    const state = createReplayPlayer(buildSamples(5));
    const next = setPlaybackSpeed(state, -2);
    expect(next.playbackSpeed).toBe(1); // unchanged
  });

  it('supports fractional speed (0.5×)', () => {
    const state = createReplayPlayer(buildSamples(10));
    const next = setPlaybackSpeed(state, 0.5);
    expect(next.playbackSpeed).toBe(0.5);
  });

  it('supports high speed (8×)', () => {
    const state = createReplayPlayer(buildSamples(10));
    const next = setPlaybackSpeed(state, 8);
    expect(next.playbackSpeed).toBe(8);
  });
});
