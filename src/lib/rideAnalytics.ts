/**
 * rideAnalytics.ts — post-ride deep analytics over finished TelemetrySample[].
 *
 * All functions are pure (no React/store imports) and work over the same
 * TelemetrySample[] that rideStore.samples collects at ~1 Hz.
 *
 * Exports:
 *   - POWER_CURVE_DURATIONS  — canonical MMP windows (5 s … 60 min)
 *   - POWER_ZONES            — 7-zone model derived from FTP
 *   - computePowerCurve      — best-mean-power per window
 *   - computeTimeInZones     — seconds in each of the 7 zones
 *   - computeSplits          — per-km pace + power + HR splits
 *   - computeSpeedStats      — avg / max / min speed
 *   - computeGradeStats      — avg / max / min grade
 */

import type { TelemetrySample } from '@/types';

// ---------------------------------------------------------------------------
// Power curve (Mean-Maximal Power)
// ---------------------------------------------------------------------------

/** Standard MMP windows shown on a power curve chart (seconds). */
export const POWER_CURVE_DURATIONS: { label: string; seconds: number }[] = [
  { label: '5s',  seconds: 5 },
  { label: '15s', seconds: 15 },
  { label: '30s', seconds: 30 },
  { label: '1m',  seconds: 60 },
  { label: '2m',  seconds: 120 },
  { label: '5m',  seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '20m', seconds: 1200 },
  { label: '30m', seconds: 1800 },
  { label: '60m', seconds: 3600 },
];

export interface PowerCurvePoint {
  label: string;
  /** Window width in seconds. */
  seconds: number;
  /** Best mean power over this window, W. null if not enough data. */
  powerW: number | null;
  /** Power expressed as W/kg (if bodyMassKg provided). null if no mass. */
  wPerKg: number | null;
  /** Percentage of FTP. null if ftpW is 0 or no power. */
  pctFtp: number | null;
}

/**
 * Compute the Mean-Maximal Power (MMP) curve.
 *
 * Uses a sliding-window approach over actual timestamps (not assumed 1 Hz)
 * so it is robust to variable sample rates. For each window duration we find
 * the contiguous time-slice that maximises mean power.
 *
 * @param samples      Ride telemetry (any length).
 * @param ftpW         Rider FTP in watts. 0 = skip %FTP column.
 * @param bodyMassKg   Rider mass in kg. 0 = skip W/kg column.
 */
export function computePowerCurve(
  samples: TelemetrySample[],
  ftpW: number,
  bodyMassKg: number,
): PowerCurvePoint[] {
  // Filter to samples with valid power
  const powered = samples.filter(
    (s): s is TelemetrySample & { power: number } =>
      typeof s.power === 'number' && s.power >= 0,
  );

  return POWER_CURVE_DURATIONS.map(({ label, seconds }) => {
    const windowMs = seconds * 1000;
    const best = bestMeanPower(powered, windowMs);
    return {
      label,
      seconds,
      powerW: best,
      wPerKg: best !== null && bodyMassKg > 0 ? roundTo(best / bodyMassKg, 2) : null,
      pctFtp: best !== null && ftpW > 0 ? Math.round((best / ftpW) * 100) : null,
    };
  });
}

/** Sliding-window best mean power over a time-duration window (ms). */
function bestMeanPower(
  powered: (TelemetrySample & { power: number })[],
  windowMs: number,
): number | null {
  const n = powered.length;
  if (n === 0) return null;

  // If ride shorter than window, return overall mean
  const span = powered[n - 1].t - powered[0].t;
  if (span < windowMs) {
    if (span === 0) return powered[0].power;
    // Mean over whole ride (weighted by dt)
    return weightedMean(powered, 0, n - 1);
  }

  let best = 0;
  let left = 0;
  let sumW = 0;

  // Running sum (unweighted for speed; samples are ~1 Hz)
  for (let r = 0; r < n; r++) {
    sumW += powered[r].power;

    // Shrink left so the window stays ≤ windowMs wide
    while (powered[r].t - powered[left].t > windowMs) {
      sumW -= powered[left].power;
      left++;
    }

    const count = r - left + 1;
    const mean = sumW / count;
    if (mean > best) best = mean;
  }

  return roundTo(best, 1);
}

/** Time-weighted mean power over powered[lo..hi] inclusive. */
function weightedMean(
  powered: (TelemetrySample & { power: number })[],
  lo: number,
  hi: number,
): number {
  if (lo === hi) return powered[lo].power;
  let totalJ = 0;
  let totalSec = 0;
  for (let i = lo + 1; i <= hi; i++) {
    const dt = (powered[i].t - powered[i - 1].t) / 1000;
    totalJ += powered[i].power * dt;
    totalSec += dt;
  }
  return totalSec > 0 ? roundTo(totalJ / totalSec, 1) : powered[lo].power;
}

// ---------------------------------------------------------------------------
// Time in zones (7-zone model — Andrew Coggan / TrainingPeaks standard)
// ---------------------------------------------------------------------------

/**
 * 7-zone power model expressed as FTP multipliers.
 * Zone 7 has no upper bound (>1.50 FTP).
 */
export const POWER_ZONES: {
  zone: number;
  label: string;
  description: string;
  minPct: number;   // lower bound inclusive (% of FTP, 0-based fraction)
  maxPct: number;   // upper bound exclusive (% of FTP). Infinity for Z7.
  color: string;    // Tailwind / CSS colour for charts
}[] = [
  { zone: 1, label: 'Z1', description: 'Active Recovery',    minPct: 0,    maxPct: 0.55, color: '#64748b' },
  { zone: 2, label: 'Z2', description: 'Endurance',          minPct: 0.55, maxPct: 0.75, color: '#22d3ee' },
  { zone: 3, label: 'Z3', description: 'Tempo',              minPct: 0.75, maxPct: 0.90, color: '#34d399' },
  { zone: 4, label: 'Z4', description: 'Threshold',          minPct: 0.90, maxPct: 1.05, color: '#fbbf24' },
  { zone: 5, label: 'Z5', description: 'VO₂max',             minPct: 1.05, maxPct: 1.20, color: '#f97316' },
  { zone: 6, label: 'Z6', description: 'Anaerobic Capacity', minPct: 1.20, maxPct: 1.50, color: '#ef4444' },
  { zone: 7, label: 'Z7', description: 'Neuromuscular',      minPct: 1.50, maxPct: Infinity, color: '#a855f7' },
];

export interface ZoneTime {
  zone: number;
  label: string;
  description: string;
  color: string;
  /** Seconds spent in zone. */
  seconds: number;
  /** Fraction of total riding time 0–1. */
  fraction: number;
}

/**
 * Compute time in each of the 7 power zones.
 * Samples without power are counted but assigned to Z1 (recovery/coasting).
 *
 * @param samples  Ride telemetry.
 * @param ftpW     Functional Threshold Power in watts. 0 → all zeros returned.
 */
export function computeTimeInZones(
  samples: TelemetrySample[],
  ftpW: number,
): ZoneTime[] {
  const zeroResult = (): ZoneTime[] =>
    POWER_ZONES.map((z) => ({ ...z, seconds: 0, fraction: 0 }));

  if (samples.length < 2 || ftpW <= 0) return zeroResult();

  const zoneSec = new Array<number>(POWER_ZONES.length).fill(0);
  let totalSec = 0;

  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const p = samples[i].power ?? 0;
    const pct = p / ftpW;

    let zi = 0; // default Z1 (coasting / recovery)
    for (let z = POWER_ZONES.length - 1; z >= 0; z--) {
      if (pct >= POWER_ZONES[z].minPct) {
        zi = z;
        break;
      }
    }
    zoneSec[zi] += dt;
    totalSec += dt;
  }

  return POWER_ZONES.map((z, i) => ({
    ...z,
    seconds: roundTo(zoneSec[i], 1),
    fraction: totalSec > 0 ? roundTo(zoneSec[i] / totalSec, 4) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Per-km splits
// ---------------------------------------------------------------------------

export interface RideSplit {
  /** Split number (1-based). */
  km: number;
  /** Start distance (m). */
  startM: number;
  /** End distance (m). */
  endM: number;
  /** Duration of this split in seconds. */
  durationSec: number;
  /** Average speed in m/s. */
  avgSpeedMs: number;
  /** Pace: seconds per km. */
  secPerKm: number;
  /** Mean power W (null if no power data in this split). */
  avgPowerW: number | null;
  /** Mean HR bpm (null if no HR data). */
  avgHrBpm: number | null;
  /** Net elevation change in this split, m. */
  elevDeltaM: number;
  /** Total ascent within this split, m. */
  ascentM: number;
}

/**
 * Compute per-kilometre splits from the ride telemetry.
 *
 * Splits are determined by cumulative distance in TelemetrySample.distance,
 * so they follow the route geometry rather than wall-clock time.
 *
 * @param samples  Ride telemetry in chronological order.
 * @param splitKm  Split interval in km (default 1.0).
 */
export function computeSplits(
  samples: TelemetrySample[],
  splitKm = 1.0,
): RideSplit[] {
  if (samples.length < 2) return [];

  const splitM = splitKm * 1000;
  const splits: RideSplit[] = [];

  let splitStart = samples[0].distance;
  let splitNum = 1;

  // Accumulate per-split buckets
  let tStart = samples[0].t;
  let eleStart = samples[0].ele;
  let powerSum = 0;
  let powerCount = 0;
  let hrSum = 0;
  let hrCount = 0;
  let localAscent = 0;
  let prevEle = samples[0].ele;

  const flush = (endDist: number, endT: number, endEle: number) => {
    const durationSec = Math.max(0, (endT - tStart) / 1000);
    const distM = endDist - splitStart;
    const avgSpeedMs = durationSec > 0 ? distM / durationSec : 0;
    const secPerKm = avgSpeedMs > 0 ? 1000 / avgSpeedMs : 0;

    splits.push({
      km: splitNum,
      startM: splitStart,
      endM: endDist,
      durationSec: roundTo(durationSec, 1),
      avgSpeedMs: roundTo(avgSpeedMs, 2),
      secPerKm: roundTo(secPerKm, 1),
      avgPowerW: powerCount > 0 ? roundTo(powerSum / powerCount, 1) : null,
      avgHrBpm: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
      elevDeltaM: roundTo(endEle - eleStart, 1),
      ascentM: roundTo(localAscent, 1),
    });

    splitNum++;
    splitStart = endDist;
    tStart = endT;
    eleStart = endEle;
    powerSum = 0;
    powerCount = 0;
    hrSum = 0;
    hrCount = 0;
    localAscent = 0;
    prevEle = endEle;
  };

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    const eleGain = s.ele - prevEle;
    if (eleGain > 0) localAscent += eleGain;
    prevEle = s.ele;

    if (typeof s.power === 'number' && s.power >= 0) {
      powerSum += s.power;
      powerCount++;
    }
    if (typeof s.heartRate === 'number' && s.heartRate > 0) {
      hrSum += s.heartRate;
      hrCount++;
    }

    // Crossed a split boundary?
    if (s.distance - splitStart >= splitM) {
      flush(splitStart + splitM, s.t, s.ele);
    }
  }

  // Flush final partial split (if ridden more than 200 m past last full km)
  const lastSample = samples[samples.length - 1];
  if (lastSample.distance - splitStart > 200) {
    flush(lastSample.distance, lastSample.t, lastSample.ele);
  }

  return splits;
}

// ---------------------------------------------------------------------------
// Speed / grade aggregate stats
// ---------------------------------------------------------------------------

export interface ChannelStats {
  avg: number;
  max: number;
  min: number;
}

/** Compute avg/max/min speed (m/s) from samples. Returns zeros if empty. */
export function computeSpeedStats(samples: TelemetrySample[]): ChannelStats {
  if (samples.length === 0) return { avg: 0, max: 0, min: 0 };
  const vals = samples.map((s) => s.speed).filter((v) => v >= 0);
  if (vals.length === 0) return { avg: 0, max: 0, min: 0 };
  const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
  return {
    avg: roundTo(avg, 2),
    max: roundTo(Math.max(...vals), 2),
    min: roundTo(Math.min(...vals), 2),
  };
}

/** Compute avg/max/min grade (%) from samples. Returns zeros if empty. */
export function computeGradeStats(samples: TelemetrySample[]): ChannelStats {
  if (samples.length === 0) return { avg: 0, max: 0, min: 0 };
  const vals = samples.map((s) => s.grade);
  const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
  return {
    avg: roundTo(avg, 1),
    max: roundTo(Math.max(...vals), 1),
    min: roundTo(Math.min(...vals), 1),
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function roundTo(n: number, decimals: number): number {
  if (!isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
