/**
 * highlightDetector.ts — Wave 35.A: Find the most cinematic moments.
 *
 * Pure functions, no side effects. All time values are in seconds from
 * the first sample.
 */

import type { TelemetrySample } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HighlightType = 'climb' | 'descent' | 'sprint' | 'maxPower' | 'segment';

export interface Highlight {
  /** Seconds from ride start. */
  startSec: number;
  /** Seconds from ride start. */
  endSec: number;
  type: HighlightType;
  /** Higher = more interesting. Used to rank and trim to 4–6 highlights. */
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum sustained duration for a climb highlight, seconds. */
const CLIMB_MIN_SEC = 5 * 60;
/** Minimum average grade for a climb highlight, percent. */
const CLIMB_MIN_GRADE_PCT = 4;

/** Minimum sustained duration for a descent highlight, seconds. */
const DESCENT_MIN_SEC = 2 * 60;
/** Minimum average speed for a descent highlight, km/h. */
const DESCENT_MIN_SPEED_KMH = 50;

/** Minimum sustained duration for a sprint highlight, seconds. */
const SPRINT_MIN_SEC = 30;
/** Minimum power as fraction of FTP to qualify as a sprint. */
const SPRINT_FTP_MULTIPLIER = 1.2;

/** Rolling window for max-power 5-second average, samples. */
const MAX_POWER_WINDOW = 5;

/** Desired output highlight count range. */
const MIN_HIGHLIGHTS = 4;
const MAX_HIGHLIGHTS = 6;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function tSec(samples: TelemetrySample[], idx: number): number {
  return (samples[idx].t - samples[0].t) / 1000;
}

/**
 * Compute FTP estimate from samples: 95% of the best 20-minute average power.
 * Falls back to the overall average when the ride is shorter than 20 minutes.
 */
function estimateFtp(samples: TelemetrySample[]): number {
  const powered = samples.filter((s) => typeof s.power === 'number' && (s.power ?? 0) > 0);
  if (powered.length === 0) return 200; // sensible default

  const avg = powered.reduce((a, s) => a + (s.power ?? 0), 0) / powered.length;

  // Approximate 20-min best power using a 1200-sample window (1 Hz recording).
  const W = Math.min(1200, powered.length);
  let best = 0;
  let windowSum = 0;
  for (let i = 0; i < W; i++) windowSum += powered[i].power ?? 0;
  best = windowSum;
  for (let i = W; i < powered.length; i++) {
    windowSum += (powered[i].power ?? 0) - (powered[i - W].power ?? 0);
    if (windowSum > best) best = windowSum;
  }
  const best20MinAvg = best / W;

  return best20MinAvg > 0 ? best20MinAvg * 0.95 : avg * 0.95;
}

// ---------------------------------------------------------------------------
// Individual detectors
// ---------------------------------------------------------------------------

function detectClimbs(samples: TelemetrySample[]): Highlight[] {
  const highlights: Highlight[] = [];
  const n = samples.length;
  let i = 0;

  while (i < n) {
    if ((samples[i].grade ?? 0) >= CLIMB_MIN_GRADE_PCT) {
      const start = i;
      while (i < n && (samples[i].grade ?? 0) >= CLIMB_MIN_GRADE_PCT) i++;
      const end = i - 1;
      const durationSec = tSec(samples, end) - tSec(samples, start);
      if (durationSec >= CLIMB_MIN_SEC) {
        const avgGrade =
          samples.slice(start, end + 1).reduce((a, s) => a + (s.grade ?? 0), 0) /
          (end - start + 1);
        highlights.push({
          startSec: tSec(samples, start),
          endSec: tSec(samples, end),
          type: 'climb',
          score: avgGrade * durationSec, // steeper + longer = better
        });
      }
    } else {
      i++;
    }
  }

  return highlights;
}

function detectDescents(samples: TelemetrySample[]): Highlight[] {
  const highlights: Highlight[] = [];
  const n = samples.length;
  let i = 0;
  const minSpeedMs = DESCENT_MIN_SPEED_KMH / 3.6;

  while (i < n) {
    if (samples[i].speed >= minSpeedMs && (samples[i].grade ?? 0) <= -1) {
      const start = i;
      while (
        i < n &&
        samples[i].speed >= minSpeedMs &&
        (samples[i].grade ?? 0) <= -1
      ) {
        i++;
      }
      const end = i - 1;
      const durationSec = tSec(samples, end) - tSec(samples, start);
      if (durationSec >= DESCENT_MIN_SEC) {
        const avgSpeed =
          samples.slice(start, end + 1).reduce((a, s) => a + s.speed, 0) /
          (end - start + 1);
        highlights.push({
          startSec: tSec(samples, start),
          endSec: tSec(samples, end),
          type: 'descent',
          score: avgSpeed * durationSec * 0.5,
        });
      }
    } else {
      i++;
    }
  }

  return highlights;
}

function detectSprints(samples: TelemetrySample[], ftp: number): Highlight[] {
  const highlights: Highlight[] = [];
  const n = samples.length;
  const threshold = ftp * SPRINT_FTP_MULTIPLIER;
  let i = 0;

  while (i < n) {
    if ((samples[i].power ?? 0) >= threshold) {
      const start = i;
      while (i < n && (samples[i].power ?? 0) >= threshold) i++;
      const end = i - 1;
      const durationSec = tSec(samples, end) - tSec(samples, start);
      if (durationSec >= SPRINT_MIN_SEC) {
        const avgPower =
          samples.slice(start, end + 1).reduce((a, s) => a + (s.power ?? 0), 0) /
          (end - start + 1);
        highlights.push({
          startSec: tSec(samples, start),
          endSec: tSec(samples, end),
          type: 'sprint',
          score: (avgPower / ftp) * durationSec,
        });
      }
    } else {
      i++;
    }
  }

  return highlights;
}

function detectMaxPower(samples: TelemetrySample[]): Highlight[] {
  const powered = samples.filter((s) => typeof s.power === 'number' && (s.power ?? 0) > 0);
  if (powered.length < MAX_POWER_WINDOW) return [];

  const W = MAX_POWER_WINDOW;
  let bestSum = 0;
  let bestEndIdx = W - 1;
  let windowSum = 0;

  for (let i = 0; i < W; i++) windowSum += powered[i].power ?? 0;
  bestSum = windowSum;

  for (let i = W; i < powered.length; i++) {
    windowSum += (powered[i].power ?? 0) - (powered[i - W].power ?? 0);
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestEndIdx = i;
    }
  }

  const bestStartIdx = bestEndIdx - W + 1;
  const startSec = (powered[bestStartIdx].t - samples[0].t) / 1000;
  const endSec = (powered[bestEndIdx].t - samples[0].t) / 1000;
  const avg5sec = bestSum / W;

  return [
    {
      startSec,
      endSec,
      type: 'maxPower',
      score: avg5sec * 1000, // always high-priority
    },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect the 4–6 most interesting moments in a telemetry track.
 *
 * Returns highlights sorted by score descending, trimmed to MAX_HIGHLIGHTS.
 * May return fewer if the ride lacks sufficient variety.
 */
export function detectHighlights(samples: TelemetrySample[]): Highlight[] {
  if (samples.length < 2) return [];

  const ftp = estimateFtp(samples);

  const all: Highlight[] = [
    ...detectClimbs(samples),
    ...detectDescents(samples),
    ...detectSprints(samples, ftp),
    ...detectMaxPower(samples),
  ];

  // Sort by score descending
  all.sort((a, b) => b.score - a.score);

  // Trim to range [MIN_HIGHLIGHTS, MAX_HIGHLIGHTS]
  const top = all.slice(0, MAX_HIGHLIGHTS);

  // If we have fewer than MIN_HIGHLIGHTS natural highlights, pad with
  // equally-spaced time slices so the reel still has content.
  if (top.length < MIN_HIGHLIGHTS && samples.length >= 2) {
    const totalSec = (samples[samples.length - 1].t - samples[0].t) / 1000;
    const sliceDuration = Math.min(60, totalSec / MIN_HIGHLIGHTS);
    for (let i = top.length; i < MIN_HIGHLIGHTS; i++) {
      const startSec = (totalSec / MIN_HIGHLIGHTS) * i;
      top.push({
        startSec,
        endSec: startSec + sliceDuration,
        // 'segment' is a neutral placeholder for time-slice padding — keeps
        // the reel populated when no natural highlights were detected.
        type: 'segment',
        score: 0,
      });
    }
  }

  return top;
}
