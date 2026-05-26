/**
 * Unit tests for cinematicSequencer.ts — Wave 35.A.
 */

import { describe, it, expect } from 'vitest';
import { sequenceCameras } from '@/lib/replay/cinematicSequencer';
import type { Highlight } from '@/lib/replay/highlightDetector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHighlight(
  type: Highlight['type'],
  startSec: number,
  endSec: number,
  score = 100,
): Highlight {
  return { type, startSec, endSec, score };
}

// ---------------------------------------------------------------------------
// Camera mapping per highlight type
// ---------------------------------------------------------------------------

describe('sequenceCameras — camera selection per highlight type', () => {
  const DURATION = 600; // 10-minute ride

  it('maps climb highlights to sideTracking', () => {
    const highlights = [makeHighlight('climb', 60, 360)];
    const segments = sequenceCameras(highlights, DURATION);
    const climbSeg = segments.find((s) => s.startSec === 60);
    expect(climbSeg?.cameraMode).toBe('sideTracking');
  });

  it('maps descent highlights to firstPerson', () => {
    const highlights = [makeHighlight('descent', 60, 240)];
    const segments = sequenceCameras(highlights, DURATION);
    const descentSeg = segments.find((s) => s.startSec === 60);
    expect(descentSeg?.cameraMode).toBe('firstPerson');
  });

  it('maps sprint highlights to chase', () => {
    const highlights = [makeHighlight('sprint', 300, 360)];
    const segments = sequenceCameras(highlights, DURATION);
    const sprintSeg = segments.find((s) => s.startSec === 300);
    expect(sprintSeg?.cameraMode).toBe('chase');
  });

  it('maps maxPower highlights to cinematic', () => {
    const highlights = [makeHighlight('maxPower', 100, 106)];
    const segments = sequenceCameras(highlights, DURATION);
    const maxPowerSeg = segments.find((s) => s.startSec === 100);
    expect(maxPowerSeg?.cameraMode).toBe('cinematic');
  });
});

// ---------------------------------------------------------------------------
// Intro / outro
// ---------------------------------------------------------------------------

describe('sequenceCameras — intro and outro', () => {
  it('adds an overhead intro segment', () => {
    const segments = sequenceCameras([], 600);
    const intro = segments.find((s) => s.startSec === 0);
    expect(intro?.cameraMode).toBe('overhead');
  });

  it('adds a cinematic outro segment', () => {
    const segments = sequenceCameras([], 600);
    const outro = segments[segments.length - 1];
    expect(outro?.cameraMode).toBe('cinematic');
    expect(outro?.endSec).toBeCloseTo(600, 1);
  });

  it('returns empty for zero-duration rides', () => {
    const segments = sequenceCameras([], 0);
    expect(segments.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ordering and structure
// ---------------------------------------------------------------------------

describe('sequenceCameras — ordering', () => {
  it('returns segments sorted by startSec', () => {
    const highlights = [
      makeHighlight('sprint', 300, 340),
      makeHighlight('climb', 60, 360),
      makeHighlight('descent', 400, 500),
    ];
    const segments = sequenceCameras(highlights, 600);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].startSec).toBeGreaterThanOrEqual(segments[i - 1].startSec);
    }
  });

  it('includes all highlight segments in output', () => {
    const highlights = [
      makeHighlight('climb', 60, 360),
      makeHighlight('sprint', 400, 440),
    ];
    const segments = sequenceCameras(highlights, 600);
    // Should have intro + 2 highlights + outro = 4
    expect(segments.length).toBeGreaterThanOrEqual(4);
  });
});
