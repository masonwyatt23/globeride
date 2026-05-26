/**
 * replayPlayer.ts — Wave 35.A: Pure replay engine.
 *
 * Allocation-free per-frame: tickReplay returns a new state object but
 * does not allocate inside hot paths (binary-search index only).
 *
 * No React, no Cesium, no store imports — fully unit-testable in Node.
 */

import type { TelemetrySample } from '@/types';
import type { CameraMode } from '@/lib/cesiumCameras';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplayState {
  /** Full telemetry track, sorted ascending by sample.t. */
  samples: TelemetrySample[];
  /** Playback cursor, seconds from first sample. */
  currentTime: number;
  /** Total duration of the recording, seconds. */
  durationSec: number;
  /** Speed multiplier applied to wall-clock dt each frame. */
  playbackSpeed: number;
  /** Whether the replay is currently advancing. */
  isPlaying: boolean;
  /** Active camera mode. */
  cameraMode: CameraMode;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a paused ReplayState for the given sample array.
 * Samples must be sorted ascending by `.t` (Unix ms).
 */
export function createReplayPlayer(samples: TelemetrySample[]): ReplayState {
  const durationSec =
    samples.length >= 2
      ? (samples[samples.length - 1].t - samples[0].t) / 1000
      : 0;

  return {
    samples,
    currentTime: 0,
    durationSec,
    playbackSpeed: 1,
    isPlaying: false,
    cameraMode: 'chase',
  };
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/**
 * Advance the replay cursor by `dt` wall-clock seconds × playbackSpeed.
 * Clamps to [0, durationSec]. Automatically stops when end is reached.
 */
export function tickReplay(state: ReplayState, dt: number): ReplayState {
  if (!state.isPlaying || state.samples.length === 0) return state;

  const next = state.currentTime + dt * state.playbackSpeed;
  const clamped = Math.min(next, state.durationSec);
  const isPlaying = clamped < state.durationSec;

  return { ...state, currentTime: clamped, isPlaying };
}

// ---------------------------------------------------------------------------
// Sample lookup — O(log n) binary search
// ---------------------------------------------------------------------------

/**
 * Return the TelemetrySample whose position in the recording is closest
 * to `t` seconds from the start. Returns null for empty arrays.
 */
export function sampleAtTime(
  state: ReplayState,
  t: number,
): TelemetrySample | null {
  const { samples } = state;
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0];

  const targetMs = samples[0].t + t * 1000;

  // Binary search for the largest index where samples[idx].t <= targetMs.
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].t <= targetMs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  // Pick the closer of lo and lo+1 (if exists).
  if (lo < samples.length - 1) {
    const dLo = targetMs - samples[lo].t;
    const dHi = samples[lo + 1].t - targetMs;
    return dHi < dLo ? samples[lo + 1] : samples[lo];
  }
  return samples[lo];
}

// ---------------------------------------------------------------------------
// Mutations (pure — return new state)
// ---------------------------------------------------------------------------

/** Jump the playback cursor to an absolute time (clamped to [0, duration]). */
export function jumpToTime(state: ReplayState, t: number): ReplayState {
  const clamped = Math.max(0, Math.min(t, state.durationSec));
  return { ...state, currentTime: clamped };
}

/** Toggle between playing and paused. */
export function togglePlayback(state: ReplayState): ReplayState {
  // If at the end and toggled, restart from the beginning.
  if (!state.isPlaying && state.currentTime >= state.durationSec) {
    return { ...state, isPlaying: true, currentTime: 0 };
  }
  return { ...state, isPlaying: !state.isPlaying };
}

/** Change the active camera mode. */
export function setCameraMode(
  state: ReplayState,
  mode: CameraMode,
): ReplayState {
  return { ...state, cameraMode: mode };
}

/** Set playback speed multiplier. Must be > 0. */
export function setPlaybackSpeed(
  state: ReplayState,
  speed: number,
): ReplayState {
  if (speed <= 0) return state;
  return { ...state, playbackSpeed: speed };
}
