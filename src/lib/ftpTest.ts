/**
 * FTP test presets and estimation helpers.
 *
 * Two standard test protocols are provided as Workout objects (using the
 * workout.ts schema) so they slot straight into the existing workout engine:
 *
 *   1. Ramp Test   — staged 1-min steps, +20W/step from 100 W.
 *                    Recommended FTP ≈ 75% of best 1-min average power.
 *
 *   2. 20-min Test — warmup → 5-min opener → rest → 20-min max effort → cooldown.
 *                    Recommended FTP ≈ 95% of average power over the 20-min block.
 *
 * Keep this file pure (no React/store imports).
 */

import type { Workout, WorkoutSegment } from '@/lib/workout';
import type { TelemetrySample } from '@/types';

// ---------------------------------------------------------------------------
// Preset: Ramp Test
// ---------------------------------------------------------------------------

/**
 * Build a ramp-test Workout.
 *
 * Steps start at `startW` and increase by `stepW` every `stepSec` seconds.
 * A final over-unders cooldown follows. Total steps: enough to reach 400 W
 * (well above any practical FTP), so the rider will always reach exhaustion.
 */
export function buildRampTest(
  startW = 100,
  stepW = 20,
  stepSec = 60,
  maxW = 400,
): Workout {
  const segments: WorkoutSegment[] = [];

  // Warmup — 10 min at 50% of first step
  segments.push({
    id: 'ramp-warmup',
    kind: 'warmup',
    label: 'Easy warmup',
    durationSec: 600,
    target: { type: 'watts', watts: Math.round(startW * 0.5) },
    cadenceTarget: 90,
  });

  // Ramp steps
  let stepNum = 0;
  for (let w = startW; w <= maxW; w += stepW) {
    stepNum += 1;
    segments.push({
      id: `ramp-step-${stepNum}`,
      kind: 'ramp',
      label: `${w} W`,
      durationSec: stepSec,
      target: { type: 'watts', watts: w },
      cadenceTarget: 95,
    });
  }

  // Cooldown — 5 min easy
  segments.push({
    id: 'ramp-cooldown',
    kind: 'cooldown',
    label: 'Easy spin',
    durationSec: 300,
    target: { type: 'watts', watts: Math.round(startW * 0.4) },
    cadenceTarget: 85,
  });

  return {
    id: 'preset-ramp-test',
    name: 'Ramp Test',
    description:
      'Staged 1-minute ramp: start at 100 W, add 20 W each minute until exhaustion. ' +
      'Your FTP will be estimated at 75% of your best 1-minute average power.',
    segments,
    createdAt: Date.now(),
    source: 'manual',
  };
}

// ---------------------------------------------------------------------------
// Preset: 20-minute FTP Test
// ---------------------------------------------------------------------------

/**
 * Build a classic 20-minute FTP test Workout.
 * The 20-min block target is `ftpHint` watts (defaults to 250 W).
 * Riders should adjust intensity on the fly — the target is just a guide.
 */
export function build20MinTest(ftpHint = 250): Workout {
  const segments: WorkoutSegment[] = [
    // Warmup — 10 min, escalating
    {
      id: '20m-warmup',
      kind: 'warmup',
      label: '10 min warmup',
      durationSec: 600,
      target: { type: 'rampPct', startPct: 0.5, endPct: 0.7 },
      cadenceTarget: 90,
    },
    // 5-min opener at 110% — clears out legs
    {
      id: '20m-opener',
      kind: 'interval',
      label: '5 min opener',
      durationSec: 300,
      target: { type: 'ftpPct', value: 1.1 },
      cadenceTarget: 100,
    },
    // 5-min rest
    {
      id: '20m-rest',
      kind: 'recovery',
      label: '5 min easy',
      durationSec: 300,
      target: { type: 'ftpPct', value: 0.5 },
      cadenceTarget: 85,
    },
    // The 20-min max effort block
    {
      id: '20m-effort',
      kind: 'steady',
      label: '20 min MAX effort',
      durationSec: 1200,
      target: { type: 'watts', watts: ftpHint },
      cadenceTarget: 95,
    },
    // Cooldown — 10 min
    {
      id: '20m-cooldown',
      kind: 'cooldown',
      label: '10 min cooldown',
      durationSec: 600,
      target: { type: 'ftpPct', value: 0.5 },
      cadenceTarget: 85,
    },
  ];

  return {
    id: 'preset-20min-test',
    name: '20-Minute FTP Test',
    description:
      'Classic FTP test: 10 min warmup → 5 min opener → 5 min rest → 20 min all-out. ' +
      'Your FTP will be estimated at 95% of your average power over the 20-min block.',
    segments,
    createdAt: Date.now(),
    source: 'manual',
  };
}

// ---------------------------------------------------------------------------
// FTP estimation from completed ride samples
// ---------------------------------------------------------------------------

export type FtpTestKind = 'ramp' | '20min';

/**
 * Estimate FTP from a completed FTP-test ride.
 *
 * Ramp test:
 *   Sliding 1-minute window over the power samples; best average = peak 1-min
 *   power. Recommended FTP = 75% of that value.
 *
 * 20-min test:
 *   Find the 20-min effort block (the longest run of samples above a power
 *   threshold, or simply the last 1200-second window of sustained effort).
 *   Recommended FTP = 95% of average power over that block.
 *
 * Returns null if there isn't enough data to make an estimate.
 */
export function estimateFtpFromSamples(
  samples: TelemetrySample[],
  kind: FtpTestKind,
): number | null {
  const powered = samples.filter((s) => typeof s.power === 'number' && (s.power ?? 0) > 0);
  if (powered.length === 0) return null;

  if (kind === 'ramp') {
    return estimateFtpRamp(powered);
  }
  return estimateFtp20Min(powered);
}

/** Best 1-minute rolling average power × 0.75, rounded to nearest watt. */
function estimateFtpRamp(samples: TelemetrySample[]): number | null {
  if (samples.length === 0) return null;

  const windowMs = 60_000; // 1 minute
  let bestAvg = 0;

  for (let i = 0; i < samples.length; i++) {
    const windowStart = samples[i].t;
    const windowEnd = windowStart + windowMs;

    // Collect samples within this 1-min window
    const windowSamples = samples.filter(
      (s) => s.t >= windowStart && s.t < windowEnd,
    );
    if (windowSamples.length === 0) continue;

    const avg =
      windowSamples.reduce((a, s) => a + (s.power ?? 0), 0) / windowSamples.length;
    if (avg > bestAvg) bestAvg = avg;
  }

  if (bestAvg === 0) return null;
  return Math.round(bestAvg * 0.75);
}

/**
 * Average power of the best 20-minute rolling window × 0.95.
 * Falls back to last 1200 seconds of data if the ride is too short.
 */
function estimateFtp20Min(samples: TelemetrySample[]): number | null {
  if (samples.length === 0) return null;

  const windowMs = 20 * 60 * 1000; // 20 minutes in ms
  const rideDuration = samples[samples.length - 1].t - samples[0].t;

  // If the ride is shorter than 20 min, use the whole thing
  if (rideDuration < windowMs) {
    const avg = samples.reduce((a, s) => a + (s.power ?? 0), 0) / samples.length;
    return avg > 0 ? Math.round(avg * 0.95) : null;
  }

  // Slide a 20-min window and find the best average power
  let bestAvg = 0;

  for (let i = 0; i < samples.length; i++) {
    const windowStart = samples[i].t;
    const windowEnd = windowStart + windowMs;

    const windowSamples = samples.filter(
      (s) => s.t >= windowStart && s.t < windowEnd,
    );
    if (windowSamples.length < 10) continue; // need enough samples to be meaningful

    const avg =
      windowSamples.reduce((a, s) => a + (s.power ?? 0), 0) / windowSamples.length;
    if (avg > bestAvg) bestAvg = avg;
  }

  if (bestAvg === 0) return null;
  return Math.round(bestAvg * 0.95);
}

// ---------------------------------------------------------------------------
// Detect whether a completed ride was an FTP test
// ---------------------------------------------------------------------------

/** Well-known workout IDs for the preset test workouts. */
export const FTP_TEST_WORKOUT_IDS = new Set<string>([
  'preset-ramp-test',
  'preset-20min-test',
]);

/** Return the test kind if the workout id is a known FTP test, else null. */
export function ftpTestKindFromWorkoutId(workoutId: string): FtpTestKind | null {
  if (workoutId === 'preset-ramp-test') return 'ramp';
  if (workoutId === 'preset-20min-test') return '20min';
  return null;
}
