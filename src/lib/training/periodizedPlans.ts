/**
 * Periodized training plans — three coach-designed blocks that follow
 * standard cycling periodization principles (base → build → peak).
 *
 * These plans use a different interface from the legacy TrainingPlan in
 * trainingPlans.ts: they reference workouts by ID and schedule them by
 * day-offset from the plan start date, giving date-anchored progress tracking.
 *
 * Keep this file pure (no React / store imports).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanWorkout {
  /** 0-based day offset from plan start (0 = day 1). */
  dayOffset: number;
  /** Preset workout ID. Must exist in PRESET_WORKOUTS. */
  workoutId: string;
  /** Optional coaching note shown alongside the scheduled workout. */
  note?: string;
}

export interface PeriodizedPlan {
  id: string;
  name: string;
  description: string;
  /** Number of weeks the plan spans. */
  durationWeeks: number;
  /** Expected FTP improvement as a percentage (e.g. 8 = +8%). */
  goalFtpDeltaPct: number;
  /** Average training hours per week across the plan. */
  weeklyHours: number;
  /** All scheduled workout days (rest days are simply absent). */
  days: PlanWorkout[];
}

// ---------------------------------------------------------------------------
// Helper — converts week/day-of-week to a 0-based day offset.
// week is 0-based, dow is 0=Mon … 6=Sun.
// ---------------------------------------------------------------------------
function d(week: number, dow: number, workoutId: string, note?: string): PlanWorkout {
  return { dayOffset: week * 7 + dow, workoutId, note };
}

// ---------------------------------------------------------------------------
// Plan 1: 6-Week Base Builder
//   Focus: Z2 aerobic base. 5-6 sessions/week, ~6-8 h/wk.
//   Includes 1-2 tempo days per week; no VO2 or sprint work.
//   Recovery week at week 4; slight reload in weeks 5-6.
// ---------------------------------------------------------------------------
const BASE_BUILDER_6W: PeriodizedPlan = {
  id: 'base-builder-6w',
  name: '6-Week Base Builder',
  description:
    'A six-week aerobic foundation block built around high-volume Z2 riding. ' +
    'One to two tempo sessions per week add a small threshold stimulus while ' +
    'staying well below the training load that would require deep recovery. ' +
    'Ideal as the first block of any season or after an extended break.',
  durationWeeks: 6,
  goalFtpDeltaPct: 5,
  weeklyHours: 7,
  days: [
    // ── Week 1 — establish rhythm ──────────────────────────────────────────
    d(0, 0, 'preset-daily-30-easy',       'First session — settle into Z2. No heroics.'),
    d(0, 1, 'preset-z2-foundation-50',    '50-min aerobic base.'),
    // Wed rest
    d(0, 3, 'preset-tempo-30',            'First tempo block — hold 80% FTP for 20 min.'),
    d(0, 4, 'preset-recovery-20',         'Flush the legs after tempo.'),
    d(0, 5, 'preset-z2-endurance-45',     'Weekend long ride #1.'),
    // Sun rest

    // ── Week 2 — volume nudge ──────────────────────────────────────────────
    d(1, 0, 'preset-recovery-20',         'Easy Monday to start the week fresh.'),
    d(1, 1, 'preset-z2-steady-state-60',  '60-min controlled Z2.'),
    // Wed rest
    d(1, 3, 'preset-tempo-2x15',          'Two 15-min tempo blocks — pace the first conservatively.'),
    d(1, 4, 'preset-z2-morning-spin-30',  'Short aerobic activator.'),
    d(1, 5, 'preset-base-miles-75',       'Longest ride yet. Focus on nutrition.'),
    d(1, 6, 'preset-recovery-20',         'Easy Sunday flush.'),

    // ── Week 3 — peak base week ────────────────────────────────────────────
    d(2, 0, 'preset-z2-morning-spin-30',  'Gentle opener for the hardest week.'),
    d(2, 1, 'preset-z2-endurance-60',     '60-min aerobic.'),
    // Wed rest
    d(2, 3, 'preset-aerobic-threshold-builder', 'Upper Z2 / lower Z3 — raises the aerobic ceiling.'),
    d(2, 4, 'preset-recovery-20',         'Recovery spin.'),
    d(2, 5, 'preset-long-easy-90-v2',     '90-min peak base ride — put on a podcast.'),
    d(2, 6, 'preset-recovery-20',         'Easy Sunday.'),

    // ── Week 4 — recovery week ─────────────────────────────────────────────
    d(3, 0, 'preset-recovery-15-flush',   'Recovery week — 15-min leg flush only.'),
    // Tue rest
    d(3, 2, 'preset-daily-30-easy',       'Easy 30 — stay in Z2.'),
    // Thu rest
    d(3, 4, 'preset-tempo-30',            'Single light tempo to maintain sharpness.'),
    d(3, 5, 'preset-z2-endurance-45',     'Shorter long ride.'),
    // Sun rest

    // ── Week 5 — reload ────────────────────────────────────────────────────
    d(4, 0, 'preset-z2-foundation-50',    'Back to normal load.'),
    d(4, 1, 'preset-z2-steady-state-60',  'Solid Z2 hour.'),
    // Wed rest
    d(4, 3, 'preset-tempo-freeform-45',   '30-min unbroken tempo.'),
    d(4, 4, 'preset-recovery-20',         'Recovery.'),
    d(4, 5, 'preset-base-miles-75',       '75-min base miles.'),
    d(4, 6, 'preset-z2-muscle-tension',   'Low-cadence Z2 for muscular endurance.'),

    // ── Week 6 — peak + blend ──────────────────────────────────────────────
    d(5, 0, 'preset-recovery-20',         'Easy start.'),
    d(5, 1, 'preset-aerobic-sweet-blend-75', '75-min base + sweet-spot blend.'),
    // Wed rest
    d(5, 3, 'preset-tempo-cruise-60',     '60-min tempo cruise — the capstone of the base block.'),
    d(5, 4, 'preset-recovery-20',         'Recovery.'),
    d(5, 5, 'preset-long-easy-90-v2',     'Final long ride. Finish the block strong.'),
    // Sun rest
  ],
};

// ---------------------------------------------------------------------------
// Plan 2: 8-Week Race Builder
//   Focus: Racing fitness. 5-6 sessions/week, ~8-10 h/wk.
//   Progressive overload across 3 build weeks, recovery at week 4,
//   second build block weeks 5-7, taper week 8.
// ---------------------------------------------------------------------------
const RACE_BUILDER_8W: PeriodizedPlan = {
  id: 'race-builder-8w',
  name: '8-Week Race Builder',
  description:
    'An eight-week build block designed for riders preparing to race or target ' +
    'a peak performance. Sweet-spot and threshold work in weeks 1-3 lays the ' +
    'power foundation; VO2-max intervals are added in weeks 5-7; week 8 is a ' +
    'taper. Requires a solid aerobic base — complete the 6-Week Base Builder first.',
  durationWeeks: 8,
  goalFtpDeltaPct: 10,
  weeklyHours: 9,
  days: [
    // ── Week 1 — sweet spot entry ──────────────────────────────────────────
    d(0, 0, 'preset-recovery-20',           'Opener — keep it easy.'),
    d(0, 1, 'preset-sweet-spot-2x10',       'First SS session. Establish 90% FTP feel.'),
    d(0, 2, 'preset-z2-endurance-45',       'Z2 aerobic base.'),
    // Thu rest
    d(0, 4, 'preset-sweet-spot-3x10',       'Three SS blocks — the weekly workhorse.'),
    d(0, 5, 'preset-z2-foundation-50',      'Easy aerobic.'),
    d(0, 6, 'preset-recovery-20',           'Easy Sunday.'),

    // ── Week 2 — threshold intro ───────────────────────────────────────────
    d(1, 0, 'preset-recovery-20',           'Easy Monday.'),
    d(1, 1, 'preset-sweet-spot-4x8',        'Four SS blocks with short rest.'),
    d(1, 2, 'preset-z2-steady-state-60',    '60-min controlled Z2.'),
    // Thu rest
    d(1, 4, 'preset-threshold-2x12',        'First true threshold session — hold 100%.'),
    d(1, 5, 'preset-z2-endurance-60',       '60-min aerobic support.'),
    d(1, 6, 'preset-recovery-20',           'Easy Sunday.'),

    // ── Week 3 — peak build week 1 ────────────────────────────────────────
    d(2, 0, 'preset-z2-morning-spin-30',    'Light opener.'),
    d(2, 1, 'preset-over-under-30',         'Over-under session — lactate buffering.'),
    d(2, 2, 'preset-z2-endurance-45',       'Aerobic base.'),
    // Thu rest
    d(2, 4, 'preset-threshold-builder-2x15','Two 15-min threshold blocks.'),
    d(2, 5, 'preset-sweet-spot-long-2x20',  '2×20 sweet spot — big weekend stimulus.'),
    d(2, 6, 'preset-recovery-20',           'Easy Sunday.'),

    // ── Week 4 — recovery ─────────────────────────────────────────────────
    d(3, 0, 'preset-recovery-15-flush',     'Recovery week — legs only.'),
    // Tue rest
    d(3, 2, 'preset-daily-30-easy',         'Easy Z2.'),
    // Thu rest
    d(3, 4, 'preset-sweet-spot-2x10',       'One moderate SS session.'),
    d(3, 5, 'preset-z2-endurance-45',       'Recovery long ride — keep it easy.'),
    // Sun rest

    // ── Week 5 — VO2 intro ────────────────────────────────────────────────
    d(4, 0, 'preset-recovery-20',           'Fresh legs for VO2 week.'),
    d(4, 1, 'preset-vo2-5x3',              'First VO2 session — trust the rest intervals.'),
    d(4, 2, 'preset-z2-endurance-45',       'Aerobic base below the intensity.'),
    // Thu rest
    d(4, 4, 'preset-threshold-3x8',         'Three threshold intervals.'),
    d(4, 5, 'preset-endurance-surges',       'Z2 ride with threshold surges.'),
    d(4, 6, 'preset-recovery-20',           'Easy Sunday.'),

    // ── Week 6 — peak build week 2 ────────────────────────────────────────
    d(5, 0, 'preset-z2-morning-spin-30',    'Light opener.'),
    d(5, 1, 'preset-vo2-6x4',              'Six 4-min VO2 intervals.'),
    d(5, 2, 'preset-z2-steady-state-60',    'Controlled Z2.'),
    // Thu rest
    d(5, 4, 'preset-bear-trap',             '9×3-min threshold — hardest session yet.'),
    d(5, 5, 'preset-sweet-spot-long-2x20',  '2×20 sweet spot.'),
    d(5, 6, 'preset-recovery-20',           'Easy Sunday.'),

    // ── Week 7 — peak build week 3 ────────────────────────────────────────
    d(6, 0, 'preset-recovery-20',           'Careful — hardest week.'),
    d(6, 1, 'preset-vo2-4x4-norwegian',     'Norwegian 4×4 VO2 protocol.'),
    d(6, 2, 'preset-z2-endurance-45',       'Aerobic base.'),
    // Thu rest
    d(6, 4, 'preset-attack-and-recover',    'Six 2-min VO2 attacks — race simulation.'),
    d(6, 5, 'preset-race-simulation-75',    '75-min race simulation.'),
    d(6, 6, 'preset-recovery-20',           'Easy Sunday.'),

    // ── Week 8 — taper ────────────────────────────────────────────────────
    d(7, 0, 'preset-recovery-15-flush',     'Taper week — feel the freshness return.'),
    d(7, 1, 'preset-sweet-spot-opener',     'Short SS opener — activate without fatiguing.'),
    // Wed rest
    d(7, 3, 'preset-vo2-race-openers',      'Race-day openers to prime the system.'),
    // Fri rest
    d(7, 5, 'preset-crit-race-warmup',      'Pre-race warm-up or final sharpener.'),
    // Sun rest — race day!
  ],
};

// ---------------------------------------------------------------------------
// Plan 3: 4-Week Sharpening Peak
//   Focus: Race-peak sharpness. 4-5 sessions/week, ~4-6 h/wk.
//   Reduced volume, high intensity. VO2max + anaerobic emphasis.
//   Designed to follow the Race Builder or similar build block.
// ---------------------------------------------------------------------------
const SHARPENING_4W: PeriodizedPlan = {
  id: 'sharpening-4w',
  name: '4-Week Peak Sharpener',
  description:
    'A four-week sharpening block designed to convert accumulated aerobic fitness ' +
    'into peak racing performance. Volume is reduced dramatically; intensity climbs ' +
    'to VO2-max and anaerobic territory. Use this in the final month before a target ' +
    'event. Do not stack this on top of a fatigued body — come in rested.',
  durationWeeks: 4,
  goalFtpDeltaPct: 3,
  weeklyHours: 5,
  days: [
    // ── Week 1 — VO2 activation ────────────────────────────────────────────
    d(0, 0, 'preset-recovery-20',           'Open the block fresh.'),
    d(0, 1, 'preset-vo2-5x5',              'Billat 5×5 — gold standard VO2max protocol.'),
    // Wed rest
    d(0, 3, 'preset-threshold-5x5',         'Five 5-min threshold intervals.'),
    d(0, 4, 'preset-recovery-20',           'Recovery.'),
    d(0, 5, 'preset-punch-and-grind',       'Sprint + sweet-spot combos.'),
    // Sun rest

    // ── Week 2 — anaerobic emphasis ────────────────────────────────────────
    d(1, 0, 'preset-recovery-15-flush',     'Keep it brief.'),
    d(1, 1, 'preset-vo2-40-20',             '40/20s VO2 blasters.'),
    // Wed rest
    d(1, 3, 'preset-sprint-criterium-sim',  'Criterium simulation — race-specific pain.'),
    d(1, 4, 'preset-z2-morning-spin-30',    'Easy activation.'),
    d(1, 5, 'preset-attack-and-recover',    'Six repeated race attacks.'),
    // Sun rest

    // ── Week 3 — sharpness peak ────────────────────────────────────────────
    d(2, 0, 'preset-recovery-20',           'Start fresh — this is the hardest week.'),
    d(2, 1, 'preset-vo2-ascending-ladder',  'VO2 ladder — tests pacing across durations.'),
    // Wed rest
    d(2, 3, 'preset-anaerobic-capacity-block', 'Peak anaerobic session.'),
    d(2, 4, 'preset-recovery-15-flush',     'Brief leg flush.'),
    d(2, 5, 'preset-race-simulation-75',    'Full race simulation.'),
    // Sun rest

    // ── Week 4 — taper ────────────────────────────────────────────────────
    d(3, 0, 'preset-recovery-15-flush',     'Final taper — very easy.'),
    // Tue rest
    d(3, 2, 'preset-sweet-spot-opener',     'Short sweet-spot activation.'),
    // Thu rest
    d(3, 4, 'preset-vo2-race-openers',      'VO2 openers — arrive sharp.'),
    // Sat/Sun — race!
  ],
};

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const PERIODIZED_PLANS: Record<string, PeriodizedPlan> = {
  [BASE_BUILDER_6W.id]: BASE_BUILDER_6W,
  [RACE_BUILDER_8W.id]: RACE_BUILDER_8W,
  [SHARPENING_4W.id]: SHARPENING_4W,
};

export const PERIODIZED_PLAN_IDS = Object.keys(PERIODIZED_PLANS) as Array<
  keyof typeof PERIODIZED_PLANS
>;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Return all PlanWorkouts scheduled for a given day offset (0-based).
 * Most days have 0 or 1 workout; double-day sessions can return 2.
 */
export function workoutsForPlanDay(planId: string, dayOffset: number): PlanWorkout[] {
  const plan = PERIODIZED_PLANS[planId];
  if (!plan) return [];
  return plan.days.filter((d) => d.dayOffset === dayOffset);
}

export interface PlanProgressResult {
  /** Which day of the plan today is (0-based). Clamped to plan length. */
  dayInPlan: number;
  /** Fraction of scheduled workout days completed (0.0–1.0). */
  completionPct: number;
  /** The next unfinished workout, or null if the plan is done. */
  nextWorkout: PlanWorkout | null;
}

/**
 * Compute live progress for a running plan.
 *
 * @param planId           Stable plan identifier
 * @param startDate        The date the rider started the plan
 * @param completedWorkoutIds  List of workout IDs the rider has finished
 */
export function planProgress(
  planId: string,
  startDate: Date,
  completedWorkoutIds: string[],
): PlanProgressResult {
  const plan = PERIODIZED_PLANS[planId];
  if (!plan) {
    return { dayInPlan: 0, completionPct: 0, nextWorkout: null };
  }

  // dayInPlan — how many days have elapsed since the plan started (0-based)
  const msPerDay = 1000 * 60 * 60 * 24;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const elapsed = Math.floor((today.getTime() - start.getTime()) / msPerDay);
  const totalDays = plan.durationWeeks * 7;
  const dayInPlan = Math.min(Math.max(0, elapsed), totalDays - 1);

  // completionPct — scheduled workouts that are done
  const doneSet = new Set(completedWorkoutIds);
  const totalScheduled = plan.days.length;
  const completed = plan.days.filter((pw) => doneSet.has(pw.workoutId)).length;
  const completionPct = totalScheduled === 0 ? 0 : completed / totalScheduled;

  // nextWorkout — first scheduled workout not yet done
  const nextWorkout =
    plan.days.find((pw) => !doneSet.has(pw.workoutId)) ?? null;

  return { dayInPlan, completionPct, nextWorkout };
}

/**
 * Return the plan day entries that fall in a given week (0-based week index).
 */
export function workoutsForWeek(planId: string, weekIndex: number): PlanWorkout[] {
  const plan = PERIODIZED_PLANS[planId];
  if (!plan) return [];
  const start = weekIndex * 7;
  const end = start + 7;
  return plan.days.filter((d) => d.dayOffset >= start && d.dayOffset < end);
}
