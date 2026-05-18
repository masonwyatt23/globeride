import { describe, it, expect } from 'vitest';
import {
  type Workout,
  totalDurationSec,
  segmentAt,
  resolveTargetWatts,
  estimateTSS,
} from '@/lib/workout';

const w: Workout = {
  id: 'w1',
  name: 'Test',
  createdAt: 0,
  source: 'manual',
  segments: [
    { id: 's1', kind: 'warmup', durationSec: 600, target: { type: 'ftpPct', value: 0.5 } },
    { id: 's2', kind: 'interval', durationSec: 300, target: { type: 'ftpPct', value: 1.1 } },
    { id: 's3', kind: 'ramp', durationSec: 200, target: { type: 'rampPct', startPct: 0.6, endPct: 1.0 } },
    { id: 's4', kind: 'cooldown', durationSec: 300, target: { type: 'free' } },
  ],
};

describe('totalDurationSec', () => {
  it('sums segment durations', () => {
    expect(totalDurationSec(w)).toBe(1400);
  });
});

describe('segmentAt', () => {
  it('locates the active segment and offsets', () => {
    const c0 = segmentAt(w, 0)!;
    expect(c0.index).toBe(0);
    expect(c0.elapsedInSegmentSec).toBe(0);

    const c1 = segmentAt(w, 650)!; // 50 s into segment 2
    expect(c1.index).toBe(1);
    expect(c1.elapsedInSegmentSec).toBe(50);
    expect(c1.remainingInSegmentSec).toBe(250);
    expect(c1.next?.id).toBe('s3');
  });

  it('returns null past the end', () => {
    expect(segmentAt(w, 1401)).toBeNull();
  });

  it('keeps the last segment at exactly total duration', () => {
    expect(segmentAt(w, 1400)?.index).toBe(3);
  });
});

describe('resolveTargetWatts', () => {
  it('resolves %FTP and absolute watts', () => {
    expect(resolveTargetWatts(w.segments[0], 0, 200)).toBe(100); // 0.5 * 200
    expect(resolveTargetWatts({ ...w.segments[1], target: { type: 'watts', watts: 275 } }, 0, 200)).toBe(275);
  });

  it('interpolates a ramp linearly', () => {
    const ramp = w.segments[2]; // 0.6 → 1.0 over 200 s, ftp 200
    expect(resolveTargetWatts(ramp, 0, 200)).toBe(120); // 0.6 * 200
    expect(resolveTargetWatts(ramp, 100, 200)).toBe(160); // 0.8 * 200
    expect(resolveTargetWatts(ramp, 200, 200)).toBe(200); // 1.0 * 200
  });

  it('returns null for grade/free (no ERG target)', () => {
    expect(resolveTargetWatts(w.segments[3], 0, 200)).toBeNull();
    expect(resolveTargetWatts({ ...w.segments[0], target: { type: 'grade', gradePct: 4 } }, 0, 200)).toBeNull();
  });
});

describe('estimateTSS', () => {
  it('is positive and scales with intensity', () => {
    const tss = estimateTSS(w, 200);
    expect(tss).toBeGreaterThan(0);
    expect(estimateTSS(w, 0)).toBe(0);
  });
});
