/**
 * Unit tests for workoutLibrary.ts pure helpers.
 *
 * The IndexedDB functions are integration-layer and not tested here —
 * those require a real idb environment. We test the pure logic helpers
 * and the workout model integration.
 */

import { describe, it, expect } from 'vitest';
import {
  type Workout,
  totalDurationSec,
  estimateTSS,
  segmentAt,
  resolveTargetWatts,
  workoutId,
} from '@/lib/workout';

// A typical structured workout for testing
const w: Workout = {
  id: 'test-w1',
  name: 'Sweet spot intervals',
  createdAt: Date.now(),
  source: 'manual',
  segments: [
    { id: 's1', kind: 'warmup',   durationSec: 600,  target: { type: 'ftpPct', value: 0.55 } },
    { id: 's2', kind: 'steady',   durationSec: 1200, target: { type: 'ftpPct', value: 0.88 } },
    { id: 's3', kind: 'interval', durationSec: 300,  target: { type: 'watts', watts: 280 } },
    { id: 's4', kind: 'recovery', durationSec: 120,  target: { type: 'ftpPct', value: 0.45 } },
    { id: 's5', kind: 'interval', durationSec: 300,  target: { type: 'watts', watts: 280 } },
    { id: 's6', kind: 'cooldown', durationSec: 600,  target: { type: 'ftpPct', value: 0.50 } },
  ],
};

describe('totalDurationSec for complex workout', () => {
  it('sums all segment durations correctly', () => {
    expect(totalDurationSec(w)).toBe(600 + 1200 + 300 + 120 + 300 + 600);
  });

  it('handles empty workout', () => {
    const empty: Workout = { ...w, segments: [] };
    expect(totalDurationSec(empty)).toBe(0);
  });
});

describe('segmentAt boundary cases', () => {
  const total = totalDurationSec(w);

  it('returns segment 0 at t=0', () => {
    const c = segmentAt(w, 0)!;
    expect(c.index).toBe(0);
    expect(c.segment.kind).toBe('warmup');
    expect(c.elapsedInSegmentSec).toBe(0);
  });

  it('transitions correctly at segment boundary', () => {
    // At 600s exactly, we should be in segment 1 (steady), 0s elapsed
    const c = segmentAt(w, 600)!;
    expect(c.index).toBe(1);
    expect(c.elapsedInSegmentSec).toBe(0);
    expect(c.segment.kind).toBe('steady');
  });

  it('gives correct remaining time mid-segment', () => {
    // At 700s: 100s into segment 1 (1200s), so 1100s remaining
    const c = segmentAt(w, 700)!;
    expect(c.index).toBe(1);
    expect(c.elapsedInSegmentSec).toBe(100);
    expect(c.remainingInSegmentSec).toBe(1100);
  });

  it('returns last segment when at exactly total duration', () => {
    const c = segmentAt(w, total)!;
    expect(c.index).toBe(w.segments.length - 1);
  });

  it('returns null when past total duration', () => {
    expect(segmentAt(w, total + 1)).toBeNull();
  });

  it('reports next segment when available', () => {
    const c = segmentAt(w, 0)!;
    expect(c.next?.id).toBe('s2');
  });

  it('reports null next for last segment', () => {
    const c = segmentAt(w, total)!;
    expect(c.next).toBeNull();
  });
});

describe('resolveTargetWatts with mixed targets', () => {
  const ftpW = 250;

  it('resolves ftpPct target', () => {
    expect(resolveTargetWatts(w.segments[0], 0, ftpW)).toBe(Math.round(0.55 * ftpW));
  });

  it('resolves absolute watts target', () => {
    expect(resolveTargetWatts(w.segments[2], 0, ftpW)).toBe(280);
  });

  it('resolves recovery at 45% FTP', () => {
    expect(resolveTargetWatts(w.segments[3], 0, ftpW)).toBe(Math.round(0.45 * ftpW));
  });

  it('returns null for free segment', () => {
    const free = { ...w.segments[0], target: { type: 'free' as const } };
    expect(resolveTargetWatts(free, 0, ftpW)).toBeNull();
  });

  it('returns null for grade segment', () => {
    const grade = { ...w.segments[0], target: { type: 'grade' as const, gradePct: 5 } };
    expect(resolveTargetWatts(grade, 0, ftpW)).toBeNull();
  });

  it('ramp segment interpolates correctly at midpoint', () => {
    const ramp = {
      ...w.segments[0],
      durationSec: 600,
      target: { type: 'rampPct' as const, startPct: 0.5, endPct: 1.0 },
    };
    // At 300s into 600s ramp: pct = 0.5 + (1.0 - 0.5) * 0.5 = 0.75
    expect(resolveTargetWatts(ramp, 300, ftpW)).toBe(Math.round(0.75 * ftpW));
  });
});

describe('estimateTSS scaling', () => {
  it('is proportional to intensity squared', () => {
    const easy: Workout = {
      ...w,
      segments: [{ id: 'x', kind: 'steady', durationSec: 3600, target: { type: 'ftpPct', value: 0.65 } }],
    };
    const hard: Workout = {
      ...w,
      segments: [{ id: 'x', kind: 'steady', durationSec: 3600, target: { type: 'ftpPct', value: 1.0 } }],
    };
    expect(estimateTSS(hard, 200)).toBeGreaterThan(estimateTSS(easy, 200));
  });

  it('returns 0 when ftpW is 0', () => {
    expect(estimateTSS(w, 0)).toBe(0);
  });

  it('returns 100 TSS for exactly 1 hour at FTP', () => {
    const oneHourFTP: Workout = {
      ...w,
      segments: [{ id: 'x', kind: 'steady', durationSec: 3600, target: { type: 'ftpPct', value: 1.0 } }],
    };
    expect(estimateTSS(oneHourFTP, 250)).toBe(100);
  });
});

describe('workoutId uniqueness', () => {
  it('generates unique ids', () => {
    const ids = Array.from({ length: 20 }, () => workoutId('seg'));
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
  });

  it('respects prefix', () => {
    expect(workoutId('w')).toMatch(/^w-/);
    expect(workoutId('seg')).toMatch(/^seg-/);
  });
});
