/**
 * workoutVoiceCues.ts — Voice-cue engine for structured workout transitions.
 *
 * Design principles:
 *   - One cue per segment transition (fires once on segment entry).
 *   - One halfway cue per segment ≥60 s (fires once at 50% elapsed).
 *   - One 30-second warning per segment (fires once when ≤30 s remain).
 *   - All state is plain objects — no React, no stores.
 *   - Safe no-op when speechSynthesis is unavailable.
 *
 * Usage (inside a rAF loop):
 *   const vcState = useRef(createVoiceCueState());
 *   detectAndSpeakCue(cursor.segment, cursor.next, cursor.elapsedInSegmentSec,
 *     cursor.segment.durationSec, vcState.current, settings);
 */

import type { WorkoutSegment } from '@/lib/workout';
import { speakLine, pickPreferredVoice } from '@/lib/speechSynthesis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceCueState {
  /** ID of the last segment for which we fired the "starts now" cue. */
  lastSpokenSegmentId: string | null;
  /** ID of the last segment for which we fired the "halfway" cue. */
  lastSpokenHalfwayId: string | null;
  /** ID of the last segment for which we fired the "30 seconds" warning. */
  lastSpokenT30sId: string | null;
}

export function createVoiceCueState(): VoiceCueState {
  return {
    lastSpokenSegmentId: null,
    lastSpokenHalfwayId: null,
    lastSpokenT30sId: null,
  };
}

// ---------------------------------------------------------------------------
// Settings subset — passed in so the function stays pure and testable
// ---------------------------------------------------------------------------

export interface VoiceCueSettings {
  workoutVoiceCuesEnabled: boolean;
  /** 0-100 — passed through to speakLine. */
  commentaryVolume: number;
  /** 80-120 — passed through to speakLine. */
  commentaryRate: number;
}

// ---------------------------------------------------------------------------
// Zone label helpers
// ---------------------------------------------------------------------------

/**
 * Map a workout segment kind + target to a concise spoken zone name.
 * Returns a string like "Z2", "sweet spot", "threshold", "max effort", etc.
 */
function zoneLabel(seg: WorkoutSegment): string {
  const t = seg.target;
  if (t.type === 'free') return 'free ride';
  if (t.type === 'grade') return `${t.gradePct > 0 ? `${t.gradePct.toFixed(0)} percent` : 'flat'} grade`;

  // Power-based: derive from segment kind
  switch (seg.kind) {
    case 'warmup':   return 'Z1';
    case 'cooldown': return 'Z1';
    case 'recovery': return 'Z1 recovery';
    case 'steady':   return 'Z2';
    case 'interval': return 'interval';
    case 'ramp':     return 'ramp';
    case 'freeride': return 'free ride';
    default:         return seg.kind;
  }
}

/**
 * Convert a target to a spoken power description (e.g. "90 percent FTP" or
 * "200 watts"). Returns null for grade/free targets.
 */
function powerDescription(seg: WorkoutSegment): string | null {
  const t = seg.target;
  if (t.type === 'ftpPct') return `${Math.round(t.value * 100)} percent FTP`;
  if (t.type === 'watts')  return `${t.watts} watts`;
  if (t.type === 'rampPct') return `${Math.round(t.startPct * 100)} to ${Math.round(t.endPct * 100)} percent FTP`;
  return null;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s} second${s !== 1 ? 's' : ''}`;
  if (s === 0) return `${m} minute${m !== 1 ? 's' : ''}`;
  return `${m} minute${m !== 1 ? 's' : ''} ${s} second${s !== 1 ? 's' : ''}`;
}

// ---------------------------------------------------------------------------
// Cue text builders
// ---------------------------------------------------------------------------

function buildTransitionCue(seg: WorkoutSegment): string {
  const zone = zoneLabel(seg);
  const dur  = formatDuration(seg.durationSec);
  const power = powerDescription(seg);

  // Recovery / cooldown: say "Recover."
  if (seg.kind === 'recovery' || seg.kind === 'cooldown') {
    return power
      ? `Recover. ${zone}. ${dur}. ${power}.`
      : `Recover. ${zone} for ${dur}.`;
  }

  // Warmup
  if (seg.kind === 'warmup') {
    return `Warm up. ${dur} easy.`;
  }

  return power
    ? `${zone} starts now. ${dur}. ${power}.`
    : `${zone} for ${dur}.`;
}

function buildHalfwayCue(seg: WorkoutSegment): string {
  const remaining = formatDuration(seg.durationSec / 2);
  return `Halfway. ${remaining} remaining.`;
}

function buildThirtySecCue(seg: WorkoutSegment): string {
  const zone = zoneLabel(seg);
  if (seg.kind === 'recovery' || seg.kind === 'cooldown') {
    return '30 seconds. Next interval coming.';
  }
  return `30 seconds to ${zone}.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Call once per rAF frame while a workout is running.
 *
 * @param activeSegment  Current WorkoutSegment.
 * @param nextSegment    Next WorkoutSegment (or null if last).
 * @param elapsedInSegment  Seconds elapsed within the current segment.
 * @param totalSegmentSec   Total duration of the current segment.
 * @param state          Mutable VoiceCueState held in a ref.
 * @param settings       Current settings snapshot.
 */
export function detectAndSpeakCue(
  activeSegment: WorkoutSegment,
  nextSegment: WorkoutSegment | null,
  elapsedInSegment: number,
  totalSegmentSec: number,
  state: VoiceCueState,
  settings: VoiceCueSettings,
): void {
  if (!settings.workoutVoiceCuesEnabled) return;
  if (settings.commentaryVolume <= 0) return;

  const opts = {
    volume: settings.commentaryVolume,
    rate: settings.commentaryRate,
    voice: pickPreferredVoice(),
  };

  const segId = activeSegment.id;

  // ---- 1. Segment-transition cue (fires once on entry) ----
  if (state.lastSpokenSegmentId !== segId) {
    state.lastSpokenSegmentId = segId;
    // Reset halfway + 30s trackers for the new segment.
    state.lastSpokenHalfwayId = null;
    state.lastSpokenT30sId = null;
    speakLine(buildTransitionCue(activeSegment), opts);
    return; // only one cue per frame
  }

  // ---- 2. 30-second warning (fires once when ≤30 s remain, for segments ≥45 s) ----
  const remaining = totalSegmentSec - elapsedInSegment;
  if (
    totalSegmentSec >= 45 &&
    remaining <= 30 &&
    remaining > 0 &&
    state.lastSpokenT30sId !== segId
  ) {
    // Only fire 30s warning if there IS a next segment (otherwise it's confusing).
    if (nextSegment !== null) {
      state.lastSpokenT30sId = segId;
      speakLine(buildThirtySecCue(nextSegment), opts);
      return;
    }
  }

  // ---- 3. Halfway cue (fires once at ≥50% elapsed, only for segments ≥60 s) ----
  if (
    totalSegmentSec >= 60 &&
    elapsedInSegment >= totalSegmentSec / 2 &&
    state.lastSpokenHalfwayId !== segId
  ) {
    state.lastSpokenHalfwayId = segId;
    speakLine(buildHalfwayCue(activeSegment), opts);
    return;
  }
}
