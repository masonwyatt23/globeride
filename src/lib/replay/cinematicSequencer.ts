/**
 * cinematicSequencer.ts — Wave 35.A: Camera selection for highlight reel.
 *
 * Pure functions — no side effects, no DOM, fully testable.
 */

import type { CameraMode } from '@/lib/cesiumCameras';
import type { Highlight } from '@/lib/replay/highlightDetector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CameraSegment {
  startSec: number;
  endSec: number;
  cameraMode: CameraMode;
}

// ---------------------------------------------------------------------------
// Camera assignment rules
// ---------------------------------------------------------------------------

/**
 * Map a highlight type to its cinematic camera mode.
 *
 *   climb     → sideTracking  (broadcast TV shot — shows the gradient)
 *   descent   → firstPerson   (speed immersion)
 *   sprint    → chase         (close energy behind the rider)
 *   maxPower  → cinematic     (orbiting hero shot)
 */
function cameraModeForHighlight(type: Highlight['type']): CameraMode {
  switch (type) {
    case 'climb':    return 'sideTracking';
    case 'descent':  return 'firstPerson';
    case 'sprint':   return 'chase';
    case 'maxPower': return 'cinematic';
    case 'segment':  return 'chase';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a sequence of CameraSegment objects for the highlight reel.
 *
 * Structure:
 *   1. Intro  — overhead shot, first 10 s
 *   2. Per-highlight segments sorted by startSec
 *   3. Outro  — cinematic hero pan, last 15 s
 *
 * Segments are guaranteed non-overlapping and sorted ascending by startSec.
 * If highlights overlap in time, the later-starting one wins.
 */
export function sequenceCameras(
  highlights: Highlight[],
  totalDuration: number,
): CameraSegment[] {
  const segments: CameraSegment[] = [];

  // 1. Intro — overhead
  const INTRO_DUR = Math.min(10, totalDuration * 0.05);
  if (totalDuration > 0) {
    segments.push({
      startSec: 0,
      endSec: INTRO_DUR,
      cameraMode: 'overhead',
    });
  }

  // 2. Per-highlight — sorted by startSec
  const sorted = [...highlights].sort((a, b) => a.startSec - b.startSec);
  for (const h of sorted) {
    segments.push({
      startSec: h.startSec,
      endSec: h.endSec,
      cameraMode: cameraModeForHighlight(h.type),
    });
  }

  // 3. Outro — cinematic hero pan
  const OUTRO_DUR = Math.min(15, totalDuration * 0.05);
  if (totalDuration > OUTRO_DUR) {
    segments.push({
      startSec: totalDuration - OUTRO_DUR,
      endSec: totalDuration,
      cameraMode: 'cinematic',
    });
  }

  // Sort all by startSec — intro always first, outro always last.
  segments.sort((a, b) => a.startSec - b.startSec);

  return segments;
}
