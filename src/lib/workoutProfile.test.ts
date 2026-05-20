import { describe, it, expect } from 'vitest';
import { buildProfileSeries, peakWatts } from '@/lib/workoutProfile';
import type { Workout } from '@/lib/workout';

const w: Workout = {
  id: 'w',
  name: 'Mixed shapes',
  createdAt: 0,
  source: 'manual',
  segments: [
    { id: 's1', kind: 'warmup',   durationSec: 600, target: { type: 'ftpPct', value: 0.6 } },
    { id: 's2', kind: 'interval', durationSec: 300, target: { type: 'watts', watts: 280 } },
    { id: 's3', kind: 'ramp',     durationSec: 200, target: { type: 'rampPct', startPct: 0.6, endPct: 1.0 } },
    { id: 's4', kind: 'freeride', durationSec: 120, target: { type: 'free' } },
  ],
};

describe('buildProfileSeries', () => {
  const ftpW = 250;

  it('emits two points per segment (start + end)', () => {
    const s = buildProfileSeries(w, ftpW);
    expect(s).toHaveLength(w.segments.length * 2);
  });

  it('lays cumulative time correctly along the x axis', () => {
    const s = buildProfileSeries(w, ftpW);
    expect(s[0].t).toBe(0);
    expect(s[1].t).toBe(600);
    expect(s[2].t).toBe(600);
    expect(s[3].t).toBe(900);
    expect(s[7].t).toBe(1220); // final endpoint = total duration
  });

  it('renders a constant-power segment as a flat block', () => {
    const s = buildProfileSeries(w, ftpW);
    // segment 1: ftpPct 0.6 → 150W for both endpoints
    expect(s[0].watts).toBe(150);
    expect(s[1].watts).toBe(150);
    // segment 2: watts 280 → 280W for both endpoints
    expect(s[2].watts).toBe(280);
    expect(s[3].watts).toBe(280);
  });

  it('renders a ramp segment as a slope', () => {
    const s = buildProfileSeries(w, ftpW);
    // segment 3: ramp 0.6 → 1.0 of FTP, with ftp=250
    expect(s[4].watts).toBe(150);
    expect(s[5].watts).toBe(250);
  });

  it('marks grade / free segments as `free` with 0 watts', () => {
    const s = buildProfileSeries(w, ftpW);
    expect(s[6].free).toBe(true);
    expect(s[7].free).toBe(true);
    expect(s[6].watts).toBe(0);
    expect(s[7].watts).toBe(0);
  });

  it('computes ftpPct from absolute watts when the target is in watts', () => {
    const s = buildProfileSeries(w, ftpW);
    expect(s[2].ftpPct).toBeCloseTo(280 / 250, 5);
  });

  it('falls back to ftpPct=0 when ftpW <= 0', () => {
    const s = buildProfileSeries(w, 0);
    expect(s.every((p) => p.ftpPct === 0)).toBe(true);
  });

  it('carries the owning segment index + kind on every point', () => {
    const s = buildProfileSeries(w, ftpW);
    expect(s[2].segmentIndex).toBe(1);
    expect(s[2].kind).toBe('interval');
    expect(s[5].kind).toBe('ramp');
  });

  it('returns an empty series for a workout with no segments', () => {
    const empty: Workout = { ...w, segments: [] };
    expect(buildProfileSeries(empty, ftpW)).toEqual([]);
  });
});

describe('peakWatts', () => {
  it('returns the highest target watts across the workout', () => {
    expect(peakWatts(w, 250)).toBe(280);
  });

  it('returns 0 for an empty workout', () => {
    expect(peakWatts({ ...w, segments: [] }, 250)).toBe(0);
  });

  it('returns 0 when ftpW=0 and no absolute-watts segments exist', () => {
    const noWatts: Workout = { ...w, segments: w.segments.filter((s) => s.target.type !== 'watts') };
    expect(peakWatts(noWatts, 0)).toBe(0);
  });
});
