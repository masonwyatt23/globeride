/**
 * trainingLoad.ts — Performance Management Chart (PMC) engine.
 *
 * Computes the classic cycling trio:
 *   - CTL  (Chronic Training Load  / "Fitness")  — 42-day EWMA of daily TSS
 *   - ATL  (Acute Training Load    / "Fatigue")   — 7-day  EWMA of daily TSS
 *   - TSB  (Training Stress Balance / "Form")     = yesterday's CTL − ATL
 *
 * References: Andrew Coggan / TrainingPeaks PMC model. EWMA decay constant:
 *   α = 1 − exp(−1/τ)  where τ is the time constant in days.
 *
 * TSS per ride formula (IF-based):
 *   TSS = (durationHours × IF² × 100)
 *   IF  = avgPower / FTP   (Intensity Factor)
 *
 * When a ride has no power data (avgPower === 0) we assume a default IF of 0.65
 * (steady endurance pace) so that non-power rides still contribute to load — a
 * reasonable conservative estimate in the spirit of hrTSS or rTSS proxies.
 *
 * Keep this file pure (no React / store imports) — safe to import anywhere,
 * trivially unit-testable.
 */

import type { RideRecord } from '@/lib/rideHistory';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CTL time constant — 42 days (standard Coggan model). */
const CTL_TAU = 42;
/** ATL time constant — 7 days (standard Coggan model). */
const ATL_TAU = 7;

/** Decay multiplier for a single day given a time constant τ. */
const CTL_DECAY = 1 - Math.exp(-1 / CTL_TAU); // ≈ 0.02326
const ATL_DECAY = 1 - Math.exp(-1 / ATL_TAU);  // ≈ 0.13353

/**
 * Default Intensity Factor assumed for rides with no power data (avgPower = 0).
 * 0.65 ≈ steady Zone 2 / endurance ride — a conservative proxy.
 */
const DEFAULT_NO_POWER_IF = 0.65;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A minimal ride summary needed by the training load model.
 * Accepts the full RideRecord shape (sub-type compatible).
 */
export interface RideSummary {
  /** Unix ms when the ride started — used to assign it to a calendar day. */
  startedAt: number;
  /** Moving time in seconds. */
  durationSec: number;
  /** Average power, watts. 0 if no power data was recorded. */
  avgPower: number;
}

/** One entry in the daily PMC time series. */
export interface DailyLoad {
  /** Calendar date as ISO string, e.g. "2024-06-15". */
  date: string;
  /** Total Training Stress Score on this day (may be 0 for rest days). */
  tss: number;
  /**
   * Chronic Training Load at end-of-day (Fitness).
   * Long-term average of daily TSS over ~42 days.
   */
  ctl: number;
  /**
   * Acute Training Load at end-of-day (Fatigue).
   * Short-term average of daily TSS over ~7 days.
   */
  atl: number;
  /**
   * Training Stress Balance (Form) = CTL − ATL, using *yesterday's* values.
   * Positive  → fresh / recovered.
   * Negative  → fatigued / loaded.
   * Near zero → neutral.
   */
  tsb: number;
}

/** Summary of the current fitness / fatigue / form state. */
export interface TrainingLoadSummary {
  /** Today's CTL (Fitness). */
  fitness: number;
  /** Today's ATL (Fatigue). */
  fatigue: number;
  /** Today's TSB (Form). */
  form: number;
  /**
   * Plain-language form state label.
   *
   * | TSB range   | label       | intent                                   |
   * |-------------|-------------|------------------------------------------|
   * | > +25       | "Fresh"     | well recovered, ready to race/test       |
   * | +5 … +25    | "Optimal"   | ideal race window, good snap              |
   * | −10 … +5    | "Neutral"   | steady training block                    |
   * | −30 … −10   | "Tired"     | heavy load, adaptation in progress       |
   * | < −30       | "Very Tired"| overreach risk — ease off                |
   */
  formLabel: FormLabel;
  /** Whether there is enough history to trust the numbers (at least 7 days). */
  hasData: boolean;
}

export type FormLabel = 'Fresh' | 'Optimal' | 'Neutral' | 'Tired' | 'Very Tired';

/** Result returned by computeTrainingLoad. */
export interface TrainingLoadResult {
  /** Full daily series, ordered oldest → newest, spanning training history. */
  series: DailyLoad[];
  /** Current (today) summary figures for headline display. */
  today: TrainingLoadSummary;
}

// ---------------------------------------------------------------------------
// TSS helpers
// ---------------------------------------------------------------------------

/**
 * Estimate TSS for a single ride given the rider's FTP.
 *
 * Uses the standard IF-based formula:
 *   IF = avgPower / FTP
 *   TSS = durationHours × IF² × 100
 *
 * Falls back to DEFAULT_NO_POWER_IF when avgPower is zero or FTP is unknown.
 */
export function rideToTss(ride: RideSummary, ftpW: number): number {
  const durationHours = ride.durationSec / 3600;
  if (durationHours <= 0) return 0;

  let intensityFactor: number;
  if (ftpW > 0 && ride.avgPower > 0) {
    intensityFactor = ride.avgPower / ftpW;
  } else {
    // No power data — use conservative endurance-pace proxy
    intensityFactor = DEFAULT_NO_POWER_IF;
  }

  // Cap IF at 2.0 to guard against bad data
  const IF = Math.min(2.0, intensityFactor);
  return Math.round(durationHours * IF * IF * 100);
}

// ---------------------------------------------------------------------------
// Core PMC computation
// ---------------------------------------------------------------------------

/**
 * Compute the full Performance Management Chart series from a list of rides.
 *
 * Algorithm:
 *  1. Convert each ride to a TSS with rideToTss().
 *  2. Group TSS by calendar day (YYYY-MM-DD in local time).
 *  3. Walk day-by-day from the earliest ride date through today, applying
 *     EWMA for CTL and ATL. Rest days contribute 0 TSS (EWMA still decays).
 *  4. TSB for each day = yesterday's CTL − yesterday's ATL.
 *
 * @param rides  Array of ride summaries (need not be sorted).
 * @param ftpW   Rider FTP in watts. 0 → all rides get proxy TSS.
 * @param today  Override for "today" (primarily for unit tests). Defaults to now.
 */
export function computeTrainingLoad(
  rides: RideSummary[],
  ftpW: number,
  today: Date = new Date(),
): TrainingLoadResult {
  // ---- 1. Build date → dailyTSS map ----------------------------------------
  const tssMap = new Map<string, number>();
  for (const ride of rides) {
    const dateKey = toDateKey(new Date(ride.startedAt));
    const tss = rideToTss(ride, ftpW);
    tssMap.set(dateKey, (tssMap.get(dateKey) ?? 0) + tss);
  }

  // ---- 2. Determine date range ----------------------------------------------
  const todayKey = toDateKey(today);

  if (tssMap.size === 0) {
    // No rides at all — return a single today entry with zeroes
    const zero: DailyLoad = { date: todayKey, tss: 0, ctl: 0, atl: 0, tsb: 0 };
    return {
      series: [zero],
      today: {
        fitness: 0,
        fatigue: 0,
        form: 0,
        formLabel: 'Neutral',
        hasData: false,
      },
    };
  }

  // Sort all ride dates and find the earliest
  const sortedDateKeys = [...tssMap.keys()].sort();
  const firstDate = parseLocalDate(sortedDateKeys[0]);

  // ---- 3. Walk day-by-day from firstDate → today ---------------------------
  const series: DailyLoad[] = [];

  let ctl = 0; // start fully de-trained
  let atl = 0;
  let prevCtl = 0;
  let prevAtl = 0;

  const cursor = new Date(firstDate);

  while (toDateKey(cursor) <= todayKey) {
    const dateKey = toDateKey(cursor);
    const tss = tssMap.get(dateKey) ?? 0;

    // TSB is computed from *yesterday's* CTL/ATL (before today's training)
    const tsb = prevCtl - prevAtl;

    // EWMA update: new = old + α × (tss − old)  ≡  old × (1−α) + tss × α
    prevCtl = ctl;
    prevAtl = atl;

    ctl = ctl + CTL_DECAY * (tss - ctl);
    atl = atl + ATL_DECAY * (tss - atl);

    series.push({
      date: dateKey,
      tss,
      ctl: roundTo(ctl, 1),
      atl: roundTo(atl, 1),
      tsb: roundTo(tsb, 1),
    });

    // Advance by one day
    cursor.setDate(cursor.getDate() + 1);
  }

  // ---- 4. Build today summary -----------------------------------------------
  const last = series[series.length - 1];
  const fitness = last.ctl;
  const fatigue = last.atl;
  const form    = last.tsb; // TSB = yesterday's CTL − ATL, already in last entry

  // Need at least 7 days of data for ATL to be trustworthy
  const hasData = series.length >= 7;

  return {
    series,
    today: {
      fitness: roundTo(fitness, 1),
      fatigue: roundTo(fatigue, 1),
      form:    roundTo(form, 1),
      formLabel: classifyForm(form),
      hasData,
    },
  };
}

// ---------------------------------------------------------------------------
// Form classification
// ---------------------------------------------------------------------------

/**
 * Classify TSB into a plain-language form label.
 *
 * Thresholds from Coggan/Allen "Training and Racing with a Power Meter":
 *   > +25   → Fresh    (well recovered; race-ready or taper)
 *   +5…+25  → Optimal  (peak performance window)
 *   -10…+5  → Neutral  (steady training, baseline fitness building)
 *   -30…-10 → Tired    (loaded but adapting; expected in training blocks)
 *   < -30   → Very Tired (overreach risk)
 */
export function classifyForm(tsb: number): FormLabel {
  if (tsb > 25)  return 'Fresh';
  if (tsb > 5)   return 'Optimal';
  if (tsb > -10) return 'Neutral';
  if (tsb > -30) return 'Tired';
  return 'Very Tired';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Produce a "YYYY-MM-DD" key from a Date using *local* calendar date.
 * Important: don't use toISOString() which is always UTC.
 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a "YYYY-MM-DD" key back into a local-time Date set to midnight.
 */
function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function roundTo(n: number, decimals: number): number {
  if (!isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Re-export RideRecord adaptor — callers can pass full RideRecord[] directly
// since RideRecord satisfies RideSummary (has startedAt, durationSec, avgPower).
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper: accepts full RideRecord[] (from listRides()) and
 * computes the PMC. The ftpW should come from settingsStore.ftpW.
 */
export function computeTrainingLoadFromRecords(
  records: RideRecord[],
  ftpW: number,
): TrainingLoadResult {
  return computeTrainingLoad(records as RideSummary[], ftpW);
}
