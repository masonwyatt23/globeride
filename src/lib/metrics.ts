/**
 * Cycling power analytics — pure functions, no React/store imports.
 *
 * Implements the canonical TrainingPeaks/Zwift power analytics formulas:
 *   - Normalized Power (NP): 30 s rolling avg → 4th-power mean → 4th root
 *   - Intensity Factor (IF): NP / FTP
 *   - Training Stress Score (TSS): (sec × NP × IF) / (FTP × 3600) × 100
 *   - Variability Index (VI): NP / avgPower
 *   - avg/max power, avg/max HR, avg cadence, total ascent, kJ work
 *   - Per-segment compliance (when a Workout was ridden)
 *
 * References:
 *   Allen & Coggan, "Training and Racing with a Power Meter", 2nd ed.
 *   Skiba, "Skiba's power formula" (identical derivation to Allen/Coggan NP).
 */

import type { TelemetrySample } from '@/types';
import { segmentAt, resolveTargetWatts } from '@/lib/workout';
import type { Workout } from '@/lib/workout';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface SegmentResult {
  /** 0-based index into workout.segments */
  index: number;
  label: string;
  kind: string;
  durationSec: number;
  /** Target watts resolved at segment midpoint. null = grade/free segment. */
  targetW: number | null;
  /** Mean actual power over this segment's window. null = no power data. */
  actualW: number | null;
  /**
   * Compliance ratio: actualW / targetW (1.0 = perfect).
   * null when either value is null.
   */
  compliance: number | null;
}

export interface RideMetrics {
  /** Duration of samples analysed, seconds */
  durationSec: number;

  // ---- Power metrics ----
  /** Mean power over samples that have power readings, W. 0 if none. */
  avgPowerW: number;
  /** Peak instantaneous power, W. 0 if no power. */
  maxPowerW: number;
  /**
   * Normalized Power, W.
   * Requires ≥ 30 s of data and at least one power sample; else equals avgPowerW.
   */
  normalizedPowerW: number;
  /**
   * Intensity Factor = NP / FTP.
   * 0 when ftpW ≤ 0 or no power data.
   */
  intensityFactor: number;
  /**
   * Training Stress Score = (durationSec × NP × IF) / (FTP × 3600) × 100.
   * 0 when ftpW ≤ 0 or no power data.
   */
  tss: number;
  /**
   * Variability Index = NP / avgPower.
   * 1.0 when avgPower === 0 (avoid divide-by-zero).
   */
  variabilityIndex: number;
  /** Total mechanical work, kJ = sum(power × dt) / 1000 */
  workKj: number;

  // ---- HR / cadence ----
  /** Mean HR over samples with HR data, bpm. 0 if none. */
  avgHrBpm: number;
  /** Peak HR, bpm. 0 if none. */
  maxHrBpm: number;
  /** Mean cadence over samples with cadence data, rpm. 0 if none. */
  avgCadenceRpm: number;

  // ---- Route ----
  /** Total elevation gain, m. */
  totalAscentM: number;
  /** Total distance, m (last sample distance - first sample distance). */
  totalDistanceM: number;

  // ---- Workout compliance ----
  /**
   * Per-segment breakdown. Empty array when no workout was provided or
   * the workout had no ERG segments.
   */
  segments: SegmentResult[];
  /** Data-quality flags detected while analysing the ride. */
  dataQualityFlags?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a 30-second rolling average of power from time-stamped samples.
 * Uses the sample timestamps (ms) rather than assuming uniform spacing.
 * Returns an array aligned 1-to-1 with `samples`; elements before the first
 * full 30 s window receive the mean of whatever data is available.
 */
function rollingAvg30s(samples: TelemetrySample[]): number[] {
  const WINDOW_MS = 30_000;
  const n = samples.length;
  const result = new Array<number>(n).fill(0);

  // For each sample i, find the leftmost j where t[i] - t[j] < WINDOW_MS
  let left = 0;
  let sumW = 0;
  let countW = 0;

  for (let i = 0; i < n; i++) {
    const p = samples[i].power;
    if (p !== undefined && p !== null) {
      sumW += p;
      countW++;
    }

    // Advance left pointer to stay within 30 s window
    while (left < i && samples[i].t - samples[left].t >= WINDOW_MS) {
      const lp = samples[left].power;
      if (lp !== undefined && lp !== null) {
        sumW -= lp;
        countW--;
      }
      left++;
    }

    result[i] = countW > 0 ? sumW / countW : 0;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute all ride analytics from a telemetry sample array and an FTP value.
 *
 * @param samples  Raw telemetry from rideStore.samples (may be empty / sparse).
 * @param ftpW     Rider's Functional Threshold Power in watts (from settingsStore).
 * @param workout  Optional: the Workout that was ridden, for segment compliance.
 */
export function computeMetrics(
  samples: TelemetrySample[],
  ftpW: number,
  workout?: Workout | null,
): RideMetrics {
  // ---- Guard: empty ride ----
  if (samples.length === 0) {
    return emptyMetrics();
  }

  const first = samples[0];
  const last = samples[samples.length - 1];

  // Duration in seconds (wall-clock from timestamps)
  const durationSec = Math.max(0, (last.t - first.t) / 1000);

  // ---- Power ----
  const powerSamples = samples.filter(
    (s) => s.power !== undefined && s.power !== null && s.power >= 0,
  ) as (TelemetrySample & { power: number })[];

  const hasPower = powerSamples.length > 0;

  const avgPowerW = hasPower
    ? powerSamples.reduce((a, s) => a + s.power, 0) / powerSamples.length
    : 0;

  const maxPowerW = hasPower ? Math.max(...powerSamples.map((s) => s.power)) : 0;

  // ---- Normalized Power ----
  // Step 1: 30 s rolling average of all samples (zeros where power absent)
  // Step 2: raise each value to the 4th power
  // Step 3: take the mean
  // Step 4: take the 4th root
  let normalizedPowerW = avgPowerW; // fallback for short/no-power rides

  if (hasPower && durationSec >= 30) {
    const rolling = rollingAvg30s(samples);
    const fourth = rolling.map((v) => v ** 4);
    const meanFourth = fourth.reduce((a, v) => a + v, 0) / fourth.length;
    normalizedPowerW = meanFourth ** 0.25;
  }

  // ---- IF and TSS ----
  const safeNp = isFinite(normalizedPowerW) ? normalizedPowerW : avgPowerW;
  const intensityFactor = ftpW > 0 && hasPower ? safeNp / ftpW : 0;
  const tss =
    ftpW > 0 && hasPower
      ? (durationSec * safeNp * intensityFactor) / (ftpW * 3600) * 100
      : 0;

  // ---- Variability Index ----
  const variabilityIndex = avgPowerW > 0 ? safeNp / avgPowerW : 1.0;

  // ---- Mechanical work (kJ) ----
  // Approximate integral: sum(power[i] * dt[i])
  let workJ = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000; // seconds
    const p = samples[i].power ?? 0;
    workJ += p * dt;
  }
  const workKj = workJ / 1000;

  // ---- HR ----
  const hrSamples = samples.filter(
    (s) => s.heartRate !== undefined && s.heartRate !== null && s.heartRate > 0,
  ) as (TelemetrySample & { heartRate: number })[];

  const avgHrBpm =
    hrSamples.length > 0
      ? hrSamples.reduce((a, s) => a + s.heartRate, 0) / hrSamples.length
      : 0;
  const maxHrBpm = hrSamples.length > 0 ? Math.max(...hrSamples.map((s) => s.heartRate)) : 0;

  // ---- Cadence ----
  const cadSamples = samples.filter(
    (s) => s.cadence !== undefined && s.cadence !== null && s.cadence > 0,
  ) as (TelemetrySample & { cadence: number })[];

  const avgCadenceRpm =
    cadSamples.length > 0
      ? cadSamples.reduce((a, s) => a + s.cadence, 0) / cadSamples.length
      : 0;

  // ---- Elevation gain ----
  let totalAscentM = 0;
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i].ele - samples[i - 1].ele;
    if (delta > 0) totalAscentM += delta;
  }

  // ---- Distance ----
  const totalDistanceM = Math.max(0, last.distance - first.distance);

  // ---- Per-segment compliance ----
  const segmentResults = workout
    ? computeSegmentCompliance(samples, workout, ftpW)
    : [];

  return {
    durationSec,
    avgPowerW: roundTo(avgPowerW, 1),
    maxPowerW: Math.round(maxPowerW),
    normalizedPowerW: Math.round(safeNp),
    intensityFactor: roundTo(intensityFactor, 3),
    tss: roundTo(tss, 1),
    variabilityIndex: roundTo(variabilityIndex, 3),
    workKj: roundTo(workKj, 1),
    avgHrBpm: Math.round(avgHrBpm),
    maxHrBpm: Math.round(maxHrBpm),
    avgCadenceRpm: Math.round(avgCadenceRpm),
    totalAscentM: roundTo(totalAscentM, 1),
    totalDistanceM: roundTo(totalDistanceM, 1),
    segments: segmentResults,
  };
}

/** Canonical public name used by ride history, coach, records, and backups. */
export const computeRideMetrics = computeMetrics;

// ---------------------------------------------------------------------------
// Per-segment compliance
// ---------------------------------------------------------------------------

function computeSegmentCompliance(
  samples: TelemetrySample[],
  workout: Workout,
  ftpW: number,
): SegmentResult[] {
  if (samples.length === 0 || workout.segments.length === 0) return [];

  // Map each sample to its elapsed-seconds offset from the first sample
  const t0 = samples[0].t;

  const results: SegmentResult[] = workout.segments.map((seg, index) => {
    return {
      index,
      label: seg.label ?? `${seg.kind} ${index + 1}`,
      kind: seg.kind,
      durationSec: seg.durationSec,
      targetW: resolveTargetWatts(seg, seg.durationSec / 2, ftpW),
      actualW: null,
      compliance: null,
    };
  });

  // Accumulate actual power per segment from samples
  const segPowerSums = new Array<number>(workout.segments.length).fill(0);
  const segPowerCounts = new Array<number>(workout.segments.length).fill(0);

  for (const sample of samples) {
    const elapsedSec = (sample.t - t0) / 1000;
    const cursor = segmentAt(workout, elapsedSec);
    if (!cursor) continue;
    if (sample.power !== undefined && sample.power !== null && sample.power >= 0) {
      segPowerSums[cursor.index] += sample.power;
      segPowerCounts[cursor.index]++;
    }
  }

  for (let i = 0; i < results.length; i++) {
    const count = segPowerCounts[i];
    if (count > 0) {
      const actual = segPowerSums[i] / count;
      results[i].actualW = roundTo(actual, 1);
      const target = results[i].targetW;
      results[i].compliance =
        target !== null && target > 0 ? roundTo(actual / target, 3) : null;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function roundTo(n: number, decimals: number): number {
  if (!isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function emptyMetrics(): RideMetrics {
  return {
    durationSec: 0,
    avgPowerW: 0,
    maxPowerW: 0,
    normalizedPowerW: 0,
    intensityFactor: 0,
    tss: 0,
    variabilityIndex: 1.0,
    workKj: 0,
    avgHrBpm: 0,
    maxHrBpm: 0,
    avgCadenceRpm: 0,
    totalAscentM: 0,
    totalDistanceM: 0,
    segments: [],
  };
}
