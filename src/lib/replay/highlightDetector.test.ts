/**
 * Unit tests for highlightDetector.ts — Wave 35.A.
 */

import { describe, it, expect } from 'vitest';
import { detectHighlights } from '@/lib/replay/highlightDetector';
import type { TelemetrySample } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSample(
  t: number,
  overrides: Partial<TelemetrySample> = {},
): TelemetrySample {
  return {
    t,
    lat: 46.5,
    lon: 7.9,
    ele: 100,
    distance: t / 200,
    speed: 5,
    grade: 0,
    ...overrides,
  };
}

/**
 * Build a block of samples with constant properties from startT to endT,
 * with 1-second spacing.
 */
function buildBlock(
  startT: number,
  endT: number,
  props: Partial<TelemetrySample>,
): TelemetrySample[] {
  const result: TelemetrySample[] = [];
  for (let t = startT; t <= endT; t += 1000) {
    result.push(makeSample(t, props));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('detectHighlights — edge cases', () => {
  it('returns empty array for empty samples', () => {
    expect(detectHighlights([])).toEqual([]);
  });

  it('returns empty array for a single sample', () => {
    expect(detectHighlights([makeSample(0)])).toEqual([]);
  });

  it('returns at most 6 highlights', () => {
    // Create a long ride with many alternating climbs and descents
    const samples: TelemetrySample[] = [];
    for (let i = 0; i < 20; i++) {
      const base = i * 8 * 60 * 1000; // 8-min blocks
      const isClimb = i % 2 === 0;
      samples.push(
        ...buildBlock(base, base + 7 * 60 * 1000, {
          grade: isClimb ? 6 : -2,
          speed: isClimb ? 3 : 60 / 3.6,
          power: isClimb ? 220 : 150,
        }),
      );
    }
    const highlights = detectHighlights(samples);
    expect(highlights.length).toBeLessThanOrEqual(6);
  });

  it('pads to at least 4 highlights for short rides', () => {
    // 2-minute flat ride — no natural highlights
    const samples = buildBlock(0, 2 * 60 * 1000, { grade: 0, speed: 5, power: 150 });
    const highlights = detectHighlights(samples);
    expect(highlights.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Climb detection
// ---------------------------------------------------------------------------

describe('detectHighlights — climb', () => {
  it('detects a sustained climb (>5 min at >4% grade)', () => {
    // 6 minutes at 5% grade
    const samples = buildBlock(0, 6 * 60 * 1000, { grade: 5, speed: 3 });
    const highlights = detectHighlights(samples);
    const climbs = highlights.filter((h) => h.type === 'climb');
    expect(climbs.length).toBeGreaterThanOrEqual(1);
  });

  it('does not detect a climb shorter than 5 minutes', () => {
    // 3 minutes at 6% grade — below threshold
    const samples = buildBlock(0, 3 * 60 * 1000, { grade: 6, speed: 3 });
    // Pad to a real ride length to avoid padding path
    const padSamples = buildBlock(3 * 60 * 1000, 30 * 60 * 1000, { grade: 0, speed: 5 });
    const all = [...samples, ...padSamples];
    const highlights = detectHighlights(all);
    const climbs = highlights.filter((h) => h.type === 'climb');
    expect(climbs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Descent detection
// ---------------------------------------------------------------------------

describe('detectHighlights — descent', () => {
  it('detects a sustained descent (>2 min at >50 km/h)', () => {
    // 3 minutes at 55 km/h, negative grade
    const samples = buildBlock(0, 3 * 60 * 1000, { grade: -3, speed: 55 / 3.6 });
    const highlights = detectHighlights(samples);
    const descents = highlights.filter((h) => h.type === 'descent');
    expect(descents.length).toBeGreaterThanOrEqual(1);
  });

  it('does not detect a slow descent', () => {
    // 5 minutes at 30 km/h — below 50 km/h threshold
    const samples = buildBlock(0, 5 * 60 * 1000, { grade: -2, speed: 30 / 3.6 });
    const padSamples = buildBlock(5 * 60 * 1000, 30 * 60 * 1000, { grade: 0, speed: 5 });
    const all = [...samples, ...padSamples];
    const highlights = detectHighlights(all);
    const descents = highlights.filter((h) => h.type === 'descent');
    expect(descents.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sprint detection
// ---------------------------------------------------------------------------

describe('detectHighlights — sprint', () => {
  it('detects a high-power sprint (>30s at >120% FTP)', () => {
    // Baseline samples for FTP estimation (200 W avg → FTP ≈ 190 W)
    const base = buildBlock(0, 30 * 60 * 1000, { grade: 0, speed: 7, power: 200 });
    // 45-second sprint at 300 W (≈150% of 200 W baseline)
    const sprintStart = 30 * 60 * 1000;
    const sprint = buildBlock(sprintStart, sprintStart + 45 * 1000, { grade: 0, speed: 10, power: 300 });
    const samples = [...base, ...sprint];
    const highlights = detectHighlights(samples);
    const sprints = highlights.filter((h) => h.type === 'sprint');
    expect(sprints.length).toBeGreaterThanOrEqual(1);
  });

  it('does not detect a short spike (<30 s)', () => {
    const base = buildBlock(0, 30 * 60 * 1000, { grade: 0, speed: 7, power: 200 });
    const sprintStart = 30 * 60 * 1000;
    const sprint = buildBlock(sprintStart, sprintStart + 20 * 1000, { grade: 0, speed: 10, power: 350 });
    const samples = [...base, ...sprint];
    const highlights = detectHighlights(samples);
    const sprints = highlights.filter((h) => h.type === 'sprint');
    expect(sprints.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// maxPower detection
// ---------------------------------------------------------------------------

describe('detectHighlights — maxPower', () => {
  it('detects the peak 5-second power effort', () => {
    const base = buildBlock(0, 20 * 60 * 1000, { grade: 0, speed: 7, power: 200 });
    const peakStart = 5 * 60 * 1000;
    // Inject 5 samples at 600 W in the middle of base samples
    const peakSamples = buildBlock(peakStart, peakStart + 5000, { grade: 0, speed: 12, power: 600 });
    // Merge and sort by t
    const merged = [...base, ...peakSamples].sort((a, b) => a.t - b.t);
    const highlights = detectHighlights(merged);
    const maxPower = highlights.find((h) => h.type === 'maxPower');
    expect(maxPower).toBeDefined();
    expect(maxPower!.score).toBeGreaterThan(0);
  });

  it('does not detect maxPower when no power data exists', () => {
    const samples = buildBlock(0, 20 * 60 * 1000, { grade: 0, speed: 5 }); // no power
    const highlights = detectHighlights(samples);
    const maxPower = highlights.filter((h) => h.type === 'maxPower');
    expect(maxPower.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe('detectHighlights — ordering', () => {
  it('returns highlights sorted by score descending', () => {
    // 6-min climb (high score) + 3-min descent at high speed
    const climb = buildBlock(0, 6 * 60 * 1000, { grade: 8, speed: 3, power: 250 });
    const flat = buildBlock(6 * 60 * 1000, 10 * 60 * 1000, { grade: 0, speed: 5, power: 180 });
    const descent = buildBlock(10 * 60 * 1000, 13 * 60 * 1000, { grade: -4, speed: 60 / 3.6 });
    const samples = [...climb, ...flat, ...descent];
    const highlights = detectHighlights(samples);
    for (let i = 1; i < highlights.length; i++) {
      expect(highlights[i - 1].score).toBeGreaterThanOrEqual(highlights[i].score);
    }
  });
});
