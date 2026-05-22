/**
 * Multi-week structured training plans.
 *
 * A TrainingPlan is an ordered schedule of workout sessions across days
 * and weeks. Each PlanDay references a preset workout ID (or null for
 * rest days). Plans are fully local-first: progress is persisted in
 * localStorage via the usePlanStore (Zustand + persist middleware).
 *
 * Keep this file pure (no React / store imports) — it's the data layer
 * only. Components and stores import from here.
 */

import type { WorkoutCategory } from '@/lib/workout';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface PlanDay {
  /** 1-based day number within the plan (1 = Day 1 of Week 1). */
  day: number;
  /** Stable preset workout ID, or null for rest / active-recovery days. */
  workoutId: string | null;
  /** Short label shown in the weekly grid (e.g. "Z2 Ride", "Rest"). */
  label: string;
  /** Optional coaching note shown in expanded day view. */
  note?: string;
}

export interface TrainingPlan {
  /** Stable identifier — never changes once the plan ships. */
  id: string;
  name: string;
  /** One-line pitch shown on the plan card. */
  tagline: string;
  /** Longer description (2–4 sentences) shown in the plan detail view. */
  description: string;
  /** Number of weeks. */
  weeks: number;
  /**
   * Primary training emphasis of the plan.
   * Drives the accent colour in the UI (mirrors WorkoutCategory colours).
   */
  focus: WorkoutCategory;
  /**
   * Rough fitness prerequisite label shown to the user.
   * Not enforced — just guidance.
   */
  level: 'beginner' | 'intermediate' | 'advanced';
  /** Average hours per week (used in the plan card summary). */
  hoursPerWeek: number;
  /** Ordered list of all days. Length must equal weeks × 7. */
  days: PlanDay[];
}

// ---------------------------------------------------------------------------
// Progress state persisted to localStorage
// (shape only — the actual Zustand store lives in planStore.ts)
// ---------------------------------------------------------------------------

export interface PlanProgress {
  planId: string;
  /** Timestamp when the plan was started (ms since epoch). */
  startedAt: number;
  /**
   * Set of day numbers (1-based) the user has marked complete.
   * We store a flat set rather than a boolean array so it's safely
   * extensible without index-shifting.
   */
  completedDays: number[];
}

// ---------------------------------------------------------------------------
// Helper: current week (1-based) given progress
// ---------------------------------------------------------------------------

export function currentWeek(progress: PlanProgress): number {
  const maxCompleted = Math.max(0, ...progress.completedDays);
  return Math.min(
    Math.ceil((maxCompleted + 1) / 7),
    Math.ceil(
      (TRAINING_PLANS.find((p) => p.id === progress.planId)?.weeks ?? 1) * 1,
    ),
  );
}

/** Group plan days into weeks (7 days each). */
export function daysByWeek(plan: TrainingPlan): PlanDay[][] {
  const out: PlanDay[][] = [];
  for (let w = 0; w < plan.weeks; w++) {
    out.push(plan.days.slice(w * 7, w * 7 + 7));
  }
  return out;
}

/** Next incomplete workout day (workoutId !== null && not yet done). */
export function nextWorkoutDay(
  plan: TrainingPlan,
  progress: PlanProgress,
): PlanDay | null {
  const done = new Set(progress.completedDays);
  return (
    plan.days.find((d) => d.workoutId !== null && !done.has(d.day)) ?? null
  );
}

// ---------------------------------------------------------------------------
// Builder helpers (keep the plan tables below readable)
// ---------------------------------------------------------------------------

type DaySpec = [workoutId: string | null, label: string, note?: string];

function makeDays(specs: DaySpec[]): PlanDay[] {
  return specs.map(([workoutId, label, note], i) => ({
    day: i + 1,
    workoutId,
    label,
    note,
  }));
}

function rest(note?: string): DaySpec {
  return [null, 'Rest', note ?? 'Full rest or gentle walk.'];
}

// ---------------------------------------------------------------------------
// The plans catalog
// ---------------------------------------------------------------------------

export const TRAINING_PLANS: TrainingPlan[] = [

  // ── 1. Beginner Base (4 weeks) ──────────────────────────────────────────
  {
    id: 'plan-beginner-base-4wk',
    name: 'Beginner Base Builder',
    tagline: 'Build your aerobic foundation from scratch in 4 weeks.',
    description:
      'Designed for riders new to structured training. Every week follows a simple pattern: two easy Z2 rides, one tempo session, and four days of rest or recovery. Volume increases gently each week with a full recovery week at the end. Complete this plan and you\'ll have a solid aerobic base to move into harder training.',
    weeks: 4,
    focus: 'endurance',
    level: 'beginner',
    hoursPerWeek: 3,
    days: makeDays([
      // Week 1
      ['preset-recovery-20',      'Easy Spin',      'Keep it light — this is about moving the legs, not training hard.'],
      rest(),
      ['preset-daily-30-easy',    'Z2 Ride',        'Comfortable, conversational pace. If you can\'t speak in sentences, ease off.'],
      rest(),
      ['preset-tempo-30',         'Tempo',          'First structured effort — hold 80% FTP for the 20-min block. It should feel "purposeful but not painful".'],
      rest(),
      rest('Optional: gentle walk or yoga.'),

      // Week 2
      ['preset-daily-30-easy',    'Z2 Ride',        'A little longer than last week. Stay in zone.'],
      rest(),
      ['preset-recovery-20',      'Recovery Spin',  'Shake out the legs from Tuesday.'],
      rest(),
      ['preset-tempo-30',         'Tempo',          'Second tempo session — try to feel more comfortable than last week.'],
      ['preset-daily-30-easy',    'Z2 Ride',        'Back-to-back with tempo. Keep it easy.'],
      rest(),

      // Week 3 — slight volume bump
      ['preset-daily-30-easy',    'Z2 Ride',        'Easy start to the week.'],
      rest(),
      ['preset-z2-endurance-45',  'Z2 Long',        'Longest ride so far. Dial in your hydration and nutrition.'],
      rest(),
      ['preset-tempo-2x15',       'Tempo 2×15',     'Two tempo blocks — a real step up. Pace yourself on the first one.'],
      ['preset-recovery-20',      'Recovery Spin',  'Spin out the legs after yesterday.'],
      rest(),

      // Week 4 — recovery week
      ['preset-recovery-20',      'Easy Spin',      'Recovery week. Keep watts low, RPM high.'],
      rest(),
      ['preset-daily-30-easy',    'Z2 Ride',        'Maintain aerobic contact without adding fatigue.'],
      rest(),
      ['preset-tempo-30',         'Light Tempo',    'One moderate tempo session — no heroics.'],
      rest(),
      rest('Plan complete! Rest up and then consider the FTP Builder plan.'),
    ]),
  },

  // ── 2. 4-Week FTP Builder ───────────────────────────────────────────────
  {
    id: 'plan-ftp-builder-4wk',
    name: '4-Week FTP Builder',
    tagline: 'Raise your threshold with systematic sweet-spot and threshold work.',
    description:
      'A focused four-week block targeting FTP improvement. The structure progresses from sweet-spot volume in week 1 through increasing threshold work in weeks 2 and 3, before a recovery week consolidates the adaptation. Expect measurable FTP gains when combined with adequate sleep and nutrition. Suitable for riders who have already completed a base block.',
    weeks: 4,
    focus: 'threshold',
    level: 'intermediate',
    hoursPerWeek: 5,
    days: makeDays([
      // Week 1 — Sweet Spot focus
      ['preset-recovery-20',        'Recovery',       'Easy opener for the week.'],
      ['preset-sweet-spot-2x10',    'Sweet Spot',     'Your bread-and-butter workout. Aim for smooth power, not heroics.'],
      rest(),
      ['preset-z2-endurance-45',    'Z2 Endurance',   'Long easy ride to build aerobic base alongside the intensity work.'],
      ['preset-sweet-spot-2x10',    'Sweet Spot',     'Second sweet-spot session this week. Execution should feel easier.'],
      rest(),
      ['preset-daily-30-easy',      'Z2 Spin',        'Easy aerobic finish. Keep it conversational.'],

      // Week 2 — More SS volume
      ['preset-recovery-20',        'Recovery',       'Fresh legs for the week ahead.'],
      ['preset-sweet-spot-3x10',    'Sweet Spot',     'Three blocks this week. Pace the first conservatively.'],
      rest(),
      ['preset-z2-endurance-45',    'Z2 Endurance',   'Aerobic base work.'],
      ['preset-threshold-2x12',     'Threshold',      'First true threshold session. Hold 100% FTP — not more.'],
      rest(),
      ['preset-daily-30-easy',      'Z2 Spin',        'Flush the week out with an easy spin.'],

      // Week 3 — Threshold peak
      ['preset-recovery-20',        'Recovery',       'Careful start — this is the hardest week.'],
      ['preset-over-under-30',      'Over-Under',     'The toughest workout in the plan. Nail your pacing.'],
      rest(),
      ['preset-z2-endurance-45',    'Z2 Endurance',   'Important: keep this genuinely easy. Recovery matters.'],
      ['preset-threshold-2x12',     'Threshold',      'Second threshold session. You should feel stronger than week 2.'],
      ['preset-sweet-spot-2x10',    'Sweet Spot',     'Back-to-back with threshold. Reduce target by 2% if fatigued.'],
      rest(),

      // Week 4 — Recovery & test
      ['preset-recovery-20',        'Recovery',       'Recovery week begins. Feel the fatigue lift day by day.'],
      rest(),
      ['preset-daily-30-easy',      'Z2 Ride',        'Easy aerobic maintenance.'],
      rest(),
      ['preset-20min-ftp-test',     'FTP Test',       'Test day! Warm up well, give the 20 min everything you have.'],
      rest(),
      rest('Block complete. Update your FTP in Settings and plan your next block.'),
    ]),
  },

  // ── 3. VO2 Max Booster (3 weeks) ────────────────────────────────────────
  {
    id: 'plan-vo2-booster-3wk',
    name: 'VO2 Max Booster',
    tagline: 'Three weeks of high-intensity work to spike your aerobic ceiling.',
    description:
      'Short, punchy three-week block to develop VO2 max power and economy. Intended as a training stimulus on top of a solid aerobic base — do not start this block without at least 4-6 weeks of base or sweet-spot work first. Two VO2 sessions per week are separated by easy recovery rides. Week 3 backs off intensity so your body can absorb the gains.',
    weeks: 3,
    focus: 'intervals',
    level: 'intermediate',
    hoursPerWeek: 5,
    days: makeDays([
      // Week 1
      ['preset-z2-endurance-45',    'Z2 Endurance',   'Start the block well-rested and aerobically primed.'],
      ['preset-vo2-5x3',            'VO2 Max',        'First VO2 session. The target is high — trust the rest intervals.'],
      ['preset-recovery-20',        'Recovery',       'Flush the legs gently.'],
      rest(),
      ['preset-vo2-5x3',            'VO2 Max',        'Second VO2 session. Notice if execution was easier than Tuesday.'],
      ['preset-daily-30-easy',      'Z2 Spin',        'Easy aerobic close.'],
      rest(),

      // Week 2 — step up to 6×4
      ['preset-z2-endurance-45',    'Z2 Endurance',   'Building the aerobic platform below the intensity.'],
      ['preset-vo2-6x4',            'VO2 Max 6×4',    'Longer intervals this week. Control early reps — the last two should be hard.'],
      ['preset-recovery-20',        'Recovery',       'Keep watts genuinely low. No tempo work today.'],
      rest(),
      ['preset-vo2-30-30',           '30/30 Blasters', 'Micro-intervals — different feel from the 4-min blocks but just as effective.'],
      ['preset-daily-30-easy',      'Z2 Spin',        'Easy close.'],
      rest(),

      // Week 3 — back-off
      ['preset-z2-endurance-45',    'Z2 Endurance',   'Recovery week — volume maintained but intensity drops.'],
      ['preset-vo2-5x3',            'VO2 Maintain',   'One VO2 session to maintain the stimulus. Not a PR attempt.'],
      ['preset-recovery-20',        'Recovery',       'Rest and let the adaptations consolidate.'],
      rest(),
      ['preset-sweet-spot-2x10',    'Sweet Spot',     'Finish the block with a sweet-spot session — should feel strong.'],
      rest(),
      rest('VO2 block done. Test fitness or roll into a threshold block.'),
    ]),
  },

  // ── 4. Century Prep (6 weeks) ───────────────────────────────────────────
  {
    id: 'plan-century-prep-6wk',
    name: 'Century Prep',
    tagline: 'Build the endurance to complete a 100-mile / 160 km ride.',
    description:
      'Six-week plan focused on the sustained aerobic capacity needed to complete a century ride. Training is predominantly Z2 with one weekly tempo or sweet-spot session to build threshold resilience for the inevitably hilly sections. Long rides progress from 45 minutes to 90 minutes by week 4, then a recovery week, then a final big build. Execute every easy session at genuine Z2 power.',
    weeks: 6,
    focus: 'endurance',
    level: 'intermediate',
    hoursPerWeek: 6,
    days: makeDays([
      // Week 1
      ['preset-daily-30-easy',      'Z2 Ride',        'Start conservative — 6 weeks is a long block.'],
      rest(),
      ['preset-z2-endurance-45',    'Long Ride',      'First long ride. Focus on nutrition and hydration practice.'],
      rest(),
      ['preset-tempo-30',           'Tempo',          'One quality session per week.'],
      ['preset-recovery-20',        'Recovery',       'Active recovery to flush Saturday\'s effort.'],
      rest(),

      // Week 2
      ['preset-daily-30-easy',      'Z2 Ride',        'Easy start.'],
      rest(),
      ['preset-z2-endurance-45',    'Long Ride',      'Same duration as last week but aim for more comfort.'],
      rest(),
      ['preset-sweet-spot-2x10',    'Sweet Spot',     'Replace tempo with first sweet-spot session.'],
      ['preset-recovery-20',        'Recovery',       'Short recovery spin.'],
      rest(),

      // Week 3
      ['preset-daily-30-easy',      'Z2 Ride',        'Steady mid-week base.'],
      rest(),
      ['preset-z2-endurance-60',    'Long Ride',      'Step up to 60 minutes of solid Z2.'],
      rest(),
      ['preset-tempo-2x15',         'Tempo',          'Longer tempo this week to boost threshold endurance.'],
      ['preset-recovery-20',        'Recovery',       'Recovery spin.'],
      rest(),

      // Week 4 — biggest long ride
      ['preset-daily-30-easy',      'Z2 Ride',        'Build week — keep the easy days easy.'],
      rest(),
      ['preset-z2-endurance-90',    'Long Ride',      'Peak long ride — 90 minutes. Simulate your century fueling strategy.'],
      rest(),
      ['preset-sweet-spot-3x10',    'Sweet Spot',     'High-volume sweet spot — three blocks.'],
      ['preset-recovery-20',        'Recovery',       'Recovery after the hard week.'],
      rest(),

      // Week 5 — recovery week
      ['preset-recovery-20',        'Easy Spin',      'Recovery week — let the adaptations set in.'],
      rest(),
      ['preset-daily-30-easy',      'Z2 Ride',        'Aerobic maintenance only.'],
      rest(),
      ['preset-tempo-30',           'Light Tempo',    'Maintain sharpness without adding fatigue.'],
      rest(),
      rest('Feel the freshness returning.'),

      // Week 6 — taper + final prep
      ['preset-daily-30-easy',      'Z2 Ride',        'Final build week opener.'],
      rest(),
      ['preset-z2-endurance-60',    'Long Ride',      'Last long ride — shorter than week 4, but execute it perfectly.'],
      rest(),
      ['preset-sweet-spot-2x10',    'Sweet Spot',     'Keep the legs sharp heading into your event.'],
      rest(),
      rest('Century week! Stay off the bike, eat and sleep well. You\'re ready.'),
    ]),
  },

  // ── 5. Sprint & Power (4 weeks) ─────────────────────────────────────────
  {
    id: 'plan-sprint-power-4wk',
    name: 'Sprint & Power',
    tagline: 'Four weeks to develop explosive power and anaerobic capacity.',
    description:
      'Focused on the top end of the power spectrum: neuromuscular sprints, HIIT, and Tabata-style work. Designed for criterium racers, track riders, and cyclists who want to develop their ability to accelerate hard and repeatedly. Aerobic base sessions are included to support recovery. Each week contains two sprint/power sessions with at least two days between them.',
    weeks: 4,
    focus: 'intervals',
    level: 'advanced',
    hoursPerWeek: 5,
    days: makeDays([
      // Week 1
      ['preset-z2-endurance-45',    'Z2 Base',        'Aerobic foundation. Keep this genuinely easy.'],
      ['preset-sprint-20',          'Sprint Power',   'First sprint session. Full recovery between efforts — quality over quantity.'],
      ['preset-recovery-20',        'Recovery',       'Light flush.'],
      rest(),
      ['preset-hiit-15',            'HIIT',           'Short and sharp. 15 minutes but genuinely hard.'],
      ['preset-daily-30-easy',      'Z2 Ride',        'Easy close to the week.'],
      rest(),

      // Week 2
      ['preset-z2-endurance-45',    'Z2 Base',        'Aerobic support for the intensity.'],
      ['preset-sprint-8x15',        'Neuromuscular',  '8 × 15s sprints — focus on peak power and cadence.'],
      ['preset-recovery-20',        'Recovery',       'Keep watts below 55% FTP.'],
      rest(),
      ['preset-tabata',             'Tabata Power',   'Three Tabata rounds. Brutal but brief.'],
      ['preset-daily-30-easy',      'Z2 Ride',        'Easy aerobic close.'],
      rest(),

      // Week 3 — peak sprint week
      ['preset-z2-endurance-45',    'Z2 Base',        'Careful — this is the hardest week.'],
      ['preset-sprint-8x15',        'Neuromuscular',  'Second neuromuscular session — try to beat week 2 peak power.'],
      ['preset-recovery-40',        'Recovery',       'Extended recovery — you need it.'],
      rest(),
      ['preset-hiit-15',            'HIIT',           'Go for broke on the last few intervals.'],
      ['preset-sprint-20',          'Sprint',         'Back-to-back sprint work — reduce reps if fatigued.'],
      rest(),

      // Week 4 — recovery
      ['preset-recovery-20',        'Easy Spin',      'Recovery week. Only spinning.'],
      rest(),
      ['preset-daily-30-easy',      'Z2 Ride',        'Easy aerobic maintenance.'],
      rest(),
      ['preset-sprint-20',          'Sprint (light)', 'One sprint session to maintain the stimulus — 4 reps, full recovery.'],
      rest(),
      rest('Sprint block complete. Roll into racing or another quality block.'),
    ]),
  },

  // ── 6. Sweet Spot Progression (3 weeks) ─────────────────────────────────
  {
    id: 'plan-sweetspot-3wk',
    name: 'Sweet Spot Progression',
    tagline: 'Three weeks of escalating sweet-spot volume for rapid FTP gains.',
    description:
      'A compact but potent three-week sweet-spot block. Week 1 establishes the pattern with 2×10 sessions, week 2 progresses to 3×10, and week 3 introduces the progressive-intensity format (87→90→93% FTP). This is one of the highest bang-for-buck training blocks available — effective at almost any fitness level above beginner.',
    weeks: 3,
    focus: 'sweetspot',
    level: 'intermediate',
    hoursPerWeek: 5,
    days: makeDays([
      // Week 1
      ['preset-recovery-20',          'Recovery',     'Start the block fresh.'],
      ['preset-sweet-spot-2x10',      'SS 2×10',      'Establish the sweet spot feel at 90% FTP.'],
      rest(),
      ['preset-z2-endurance-45',      'Z2 Long',      'Aerobic base — keep this genuinely easy.'],
      ['preset-sweet-spot-2x10',      'SS 2×10',      'Second session. Try to feel more comfortable than Tuesday.'],
      rest(),
      ['preset-daily-30-easy',        'Z2 Spin',      'Easy aerobic close.'],

      // Week 2 — step up
      ['preset-recovery-20',          'Recovery',     'Fresh for the bigger week.'],
      ['preset-sweet-spot-3x10',      'SS 3×10',      'Three blocks — big jump in volume. Pace first block conservatively.'],
      rest(),
      ['preset-z2-endurance-45',      'Z2 Long',      'Important: keep this genuinely easy. Recovery matters today.'],
      ['preset-sweet-spot-3x10',      'SS 3×10',      'Second 3×10 session. Should feel a little easier.'],
      rest(),
      ['preset-daily-30-easy',        'Z2 Spin',      'Easy aerobic close.'],

      // Week 3 — progressive intensity
      ['preset-recovery-20',          'Recovery',     'Last hard week — start it rested.'],
      ['preset-sweet-spot-progressive','SS Progressive','Three blocks with escalating intensity. The last block at 93% will sting.'],
      rest(),
      ['preset-z2-endurance-45',      'Z2 Long',      'Aerobic support.'],
      ['preset-sweet-spot-4x8',       'SS 4×8',       'Peak sweet-spot volume. Short rests keep the intensity honest.'],
      rest(),
      rest('Block done. Rest 3–5 days, then test your FTP — you\'ve earned it.'),
    ]),
  },

];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getPlan(id: string): TrainingPlan | undefined {
  return TRAINING_PLANS.find((p) => p.id === id);
}

/** All workout IDs referenced by a plan (deduplicated, rest days excluded). */
export function planWorkoutIds(plan: TrainingPlan): string[] {
  const ids = new Set<string>();
  for (const d of plan.days) {
    if (d.workoutId) ids.add(d.workoutId);
  }
  return [...ids];
}
