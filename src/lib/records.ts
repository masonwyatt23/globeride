/**
 * records.ts — Personal Records + long-term trend aggregation.
 *
 * All functions are pure (no React / store imports) and operate over
 * RideRecord[] loaded from IndexedDB via rideHistory.ts.
 *
 * Exports:
 *   PR_POWER_WINDOWS   — canonical durations for the all-time power curve
 *   computeAllTimePowerCurve  — best mean power across all rides per window
 *   computePersonalRecords    — all-time bests (distance, climb, speed, TSS…)
 *   computeWeeklyTrends       — per-week distance / time / elevation / TSS
 *   computeMonthlyTrends      — per-month aggregates (same shape)
 */

import type { RideRecord } from '@/lib/rideHistory';
import type { TelemetrySample } from '@/types';

// ---------------------------------------------------------------------------
// Power-curve windows
// ---------------------------------------------------------------------------

/** Canonical MMP windows shown on the all-time power-curve card (seconds). */
export const PR_POWER_WINDOWS: { label: string; seconds: number }[] = [
  { label: '5s',  seconds: 5 },
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
  { label: '20m', seconds: 1200 },
  { label: '60m', seconds: 3600 },
];

// ---------------------------------------------------------------------------
// All-time power curve
// ---------------------------------------------------------------------------

export interface AllTimePowerPoint {
  label: string;
  seconds: number;
  /** Best mean power in watts across all rides. null = no power data. */
  powerW: number | null;
  /** Unix ms of the ride where this PR was set. null if no data. */
  rideStartedAt: number | null;
  /** Ride name where the PR was set. */
  rideName: string | null;
}

/**
 * Compute the all-time Mean-Maximal Power curve across every ride.
 * For each canonical window we find the best single-ride best-mean-power.
 */
export function computeAllTimePowerCurve(
  rides: RideRecord[],
): AllTimePowerPoint[] {
  return PR_POWER_WINDOWS.map(({ label, seconds }) => {
    let bestW: number | null = null;
    let bestRideStartedAt: number | null = null;
    let bestRideName: string | null = null;

    for (const ride of rides) {
      if (!ride.samples || ride.samples.length === 0) continue;
      const w = bestMeanPower(ride.samples, seconds * 1000);
      if (w !== null && (bestW === null || w > bestW)) {
        bestW = w;
        bestRideStartedAt = ride.startedAt;
        bestRideName = ride.name;
      }
    }

    return {
      label,
      seconds,
      powerW: bestW !== null ? Math.round(bestW) : null,
      rideStartedAt: bestRideStartedAt,
      rideName: bestRideName,
    };
  });
}

/** Sliding-window best mean power (W) over windowMs milliseconds. */
function bestMeanPower(
  samples: TelemetrySample[],
  windowMs: number,
): number | null {
  const powered = samples.filter(
    (s): s is TelemetrySample & { power: number } =>
      typeof s.power === 'number' && s.power >= 0,
  );
  const n = powered.length;
  if (n === 0) return null;

  const span = powered[n - 1].t - powered[0].t;
  if (span < windowMs) {
    // Ride shorter than window — return mean over available data
    const mean = powered.reduce((a, s) => a + s.power, 0) / n;
    return roundTo(mean, 1);
  }

  let best = 0;
  let left = 0;
  let sum = 0;

  for (let r = 0; r < n; r++) {
    sum += powered[r].power;
    while (powered[r].t - powered[left].t > windowMs) {
      sum -= powered[left].power;
      left++;
    }
    const mean = sum / (r - left + 1);
    if (mean > best) best = mean;
  }

  return roundTo(best, 1);
}

// ---------------------------------------------------------------------------
// Personal Records (all-time bests)
// ---------------------------------------------------------------------------

export interface PersonalRecord<T> {
  /** The record value. */
  value: T;
  /** Unix ms when the record was set. null = never set. */
  setAt: number | null;
  /** Name of the ride where it was set. */
  rideName: string | null;
}

export interface PersonalRecords {
  /** Longest single ride by distance (metres). */
  longestDistanceM: PersonalRecord<number>;
  /** Longest single ride by duration (seconds). */
  longestDurationSec: PersonalRecord<number>;
  /** Most elevation gain in a single ride (metres). */
  biggestClimbM: PersonalRecord<number>;
  /** Fastest average speed across a single ride (m/s). */
  fastestAvgSpeedMs: PersonalRecord<number>;
  /** Highest average power in a single ride (watts). */
  highestAvgPowerW: PersonalRecord<number>;
  /** Most TSS in a single ride (requires power + FTP at time of ride). */
  mostTss: PersonalRecord<number>;
  /** Most kJ of mechanical work done in a single ride. */
  mostWorkKj: PersonalRecord<number>;
  /** All-time power curve — best mean power per canonical window. */
  powerCurve: AllTimePowerPoint[];
}

/** Compute all personal records from a list of rides. FTP is required for TSS. */
export function computePersonalRecords(
  rides: RideRecord[],
  ftpW: number,
): PersonalRecords {
  const empty = <T>(v: T): PersonalRecord<T> => ({
    value: v,
    setAt: null,
    rideName: null,
  });

  let longestDistanceM   = empty(0);
  let longestDurationSec = empty(0);
  let biggestClimbM      = empty(0);
  let fastestAvgSpeedMs  = empty(0);
  let highestAvgPowerW   = empty(0);
  let mostTss            = empty(0);
  let mostWorkKj         = empty(0);

  for (const ride of rides) {
    const tss  = computeRideTss(ride, ftpW);
    const work = computeRideWorkKj(ride);

    if (ride.distanceM > longestDistanceM.value) {
      longestDistanceM = { value: ride.distanceM, setAt: ride.startedAt, rideName: ride.name };
    }
    if (ride.durationSec > longestDurationSec.value) {
      longestDurationSec = { value: ride.durationSec, setAt: ride.startedAt, rideName: ride.name };
    }
    if (ride.ascentM > biggestClimbM.value) {
      biggestClimbM = { value: ride.ascentM, setAt: ride.startedAt, rideName: ride.name };
    }
    if (ride.avgSpeed > fastestAvgSpeedMs.value) {
      fastestAvgSpeedMs = { value: ride.avgSpeed, setAt: ride.startedAt, rideName: ride.name };
    }
    if (ride.avgPower > highestAvgPowerW.value) {
      highestAvgPowerW = { value: ride.avgPower, setAt: ride.startedAt, rideName: ride.name };
    }
    if (tss > mostTss.value) {
      mostTss = { value: tss, setAt: ride.startedAt, rideName: ride.name };
    }
    if (work > mostWorkKj.value) {
      mostWorkKj = { value: work, setAt: ride.startedAt, rideName: ride.name };
    }
  }

  return {
    longestDistanceM,
    longestDurationSec,
    biggestClimbM,
    fastestAvgSpeedMs,
    highestAvgPowerW,
    mostTss,
    mostWorkKj,
    powerCurve: computeAllTimePowerCurve(rides),
  };
}

// ---------------------------------------------------------------------------
// Per-ride derived metrics (TSS / work) — approximations from stored data
// ---------------------------------------------------------------------------

/**
 * Approximate TSS for a stored ride.
 *
 * Uses the stored avgPower as a proxy for Normalized Power
 * (exact NP requires the full sample array, which is present on most rides
 * but expensive to recompute for every PR calculation).
 * TSS ≈ (durationSec × avgPower²) / (ftpW² × 3600) × 100
 */
function computeRideTss(ride: RideRecord, ftpW: number): number {
  if (ftpW <= 0 || ride.avgPower <= 0) return 0;
  const if_ = ride.avgPower / ftpW;
  return roundTo((ride.durationSec * ride.avgPower * if_) / (ftpW * 3600) * 100, 1);
}

/**
 * Approximate kJ of work from stored ride (uses samples when available,
 * otherwise falls back to avgPower × duration).
 */
function computeRideWorkKj(ride: RideRecord): number {
  if (ride.samples && ride.samples.length > 1) {
    let j = 0;
    for (let i = 1; i < ride.samples.length; i++) {
      const dt = (ride.samples[i].t - ride.samples[i - 1].t) / 1000;
      j += (ride.samples[i].power ?? 0) * dt;
    }
    return roundTo(j / 1000, 1);
  }
  return roundTo((ride.avgPower * ride.durationSec) / 1000, 1);
}

// ---------------------------------------------------------------------------
// Weekly / monthly trend aggregation
// ---------------------------------------------------------------------------

export interface TrendWeek {
  /** ISO week label e.g. "W21 2026" or short "May 18". */
  label: string;
  /** Monday of this ISO week, Unix ms. */
  weekStart: number;
  distanceM: number;
  durationSec: number;
  ascentM: number;
  tss: number;
  rides: number;
}

export interface TrendMonth {
  /** e.g. "Jan 2026" */
  label: string;
  /** First day of this month, Unix ms. */
  monthStart: number;
  distanceM: number;
  durationSec: number;
  ascentM: number;
  tss: number;
  rides: number;
}

/**
 * Aggregate ride data into per-ISO-week buckets.
 * Returns up to `maxWeeks` weeks ending with the current week, sorted oldest → newest.
 */
export function computeWeeklyTrends(
  rides: RideRecord[],
  ftpW: number,
  maxWeeks = 16,
): TrendWeek[] {
  if (rides.length === 0) return [];

  // Build a map keyed by ISO week start (Monday 00:00:00 UTC).
  const map = new Map<number, TrendWeek>();

  for (const ride of rides) {
    const ws = isoWeekStart(ride.startedAt);
    let bucket = map.get(ws);
    if (!bucket) {
      bucket = {
        label: weekLabel(ws),
        weekStart: ws,
        distanceM: 0,
        durationSec: 0,
        ascentM: 0,
        tss: 0,
        rides: 0,
      };
      map.set(ws, bucket);
    }
    bucket.distanceM  += ride.distanceM;
    bucket.durationSec += ride.durationSec;
    bucket.ascentM    += ride.ascentM;
    bucket.tss        += computeRideTss(ride, ftpW);
    bucket.rides      += 1;
  }

  // Sort and return last N weeks
  const sorted = Array.from(map.values()).sort((a, b) => a.weekStart - b.weekStart);

  // Backfill any missing weeks in the tail so chart x-axis is contiguous
  const filledTail = fillWeekGaps(sorted, maxWeeks);

  return filledTail;
}

/**
 * Aggregate ride data into per-calendar-month buckets.
 * Returns up to `maxMonths` months, oldest → newest.
 */
export function computeMonthlyTrends(
  rides: RideRecord[],
  ftpW: number,
  maxMonths = 12,
): TrendMonth[] {
  if (rides.length === 0) return [];

  const map = new Map<number, TrendMonth>();

  for (const ride of rides) {
    const ms = monthStart(ride.startedAt);
    let bucket = map.get(ms);
    if (!bucket) {
      bucket = {
        label: monthLabel(ms),
        monthStart: ms,
        distanceM: 0,
        durationSec: 0,
        ascentM: 0,
        tss: 0,
        rides: 0,
      };
      map.set(ms, bucket);
    }
    bucket.distanceM  += ride.distanceM;
    bucket.durationSec += ride.durationSec;
    bucket.ascentM    += ride.ascentM;
    bucket.tss        += computeRideTss(ride, ftpW);
    bucket.rides      += 1;
  }

  const sorted = Array.from(map.values()).sort((a, b) => a.monthStart - b.monthStart);
  return sorted.slice(-maxMonths);
}

// ---------------------------------------------------------------------------
// Date helpers (ISO week / month)
// ---------------------------------------------------------------------------

/** Return the Monday 00:00:00 UTC for the week containing `unixMs`. */
function isoWeekStart(unixMs: number): number {
  const d = new Date(unixMs);
  // getDay() returns 0=Sun, 1=Mon … 6=Sat
  const day = d.getUTCDay(); // 0–6
  const monday = day === 0 ? 6 : day - 1; // days to subtract to get to Monday
  d.setUTCDate(d.getUTCDate() - monday);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Return the 1st of the month 00:00:00 UTC. */
function monthStart(unixMs: number): number {
  const d = new Date(unixMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Short label like "May 18" for the week starting at weekStartMs. */
function weekLabel(weekStartMs: number): string {
  const d = new Date(weekStartMs);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Label like "Jan 2026". */
function monthLabel(monthStartMs: number): string {
  const d = new Date(monthStartMs);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Given a sorted list of TrendWeek buckets, backfill any gaps between the
 * earliest week that has data and today so the chart x-axis is contiguous.
 * Returns up to `max` trailing weeks.
 */
function fillWeekGaps(sorted: TrendWeek[], max: number): TrendWeek[] {
  if (sorted.length === 0) return [];

  const nowWeek = isoWeekStart(Date.now());
  const firstWeek = sorted[0].weekStart;
  const weeks: TrendWeek[] = [];

  // Build dense week sequence from first ride week to current week
  let cursor = firstWeek;
  const dataMap = new Map<number, TrendWeek>(sorted.map((w) => [w.weekStart, w]));

  while (cursor <= nowWeek) {
    const existing = dataMap.get(cursor);
    weeks.push(
      existing ?? {
        label: weekLabel(cursor),
        weekStart: cursor,
        distanceM: 0,
        durationSec: 0,
        ascentM: 0,
        tss: 0,
        rides: 0,
      },
    );
    cursor += 7 * 24 * 60 * 60 * 1000; // advance one week
  }

  return weeks.slice(-max);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function roundTo(n: number, decimals: number): number {
  if (!isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
