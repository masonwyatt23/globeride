/**
 * Curated workout catalog — the Zwift-style "I just want to ride 30 minutes"
 * starter set, ready to use without any setup. Seeded into the workout
 * library on first launch (idempotent, mirrors seedSampleRoutesIfMissing).
 *
 * Design goals:
 *  - Every workout is 15–45 min so they fit a real weekday schedule.
 *  - Power targets are %FTP, so the trainer holds the right resistance for
 *    every rider once they've set their FTP in Settings.
 *  - One flagship "Daily 30 Easy" leads the list — endurance, Z2, the ride
 *    you do most days. Idle ERG-resistance Zwift-equivalent.
 *  - Zones follow the standard Coggan model (Z1 <55%, Z2 56–75%, Z3 76–90%,
 *    Sweet Spot 84–97%, Threshold ~100%, VO2 106–120%, Anaerobic 121–150%).
 *
 * Preset IDs are stable so the seeding stays idempotent and rebuilding the
 * catalog never duplicates entries. Reseeding logic only inserts the gaps,
 * so a user who deleted "Sweet Spot 3x10" doesn't get it back uninvited.
 */

import type { Workout, WorkoutSegment, SegmentTarget } from '@/lib/workout';

/** Tiny constructor that fills in id + cadence default and keeps the data table readable. */
function seg(
  id: string,
  kind: WorkoutSegment['kind'],
  durationSec: number,
  target: SegmentTarget,
  label?: string,
  cadenceTarget?: number,
): WorkoutSegment {
  return { id, kind, durationSec, target, label, cadenceTarget };
}

/** %FTP helper so the segment tables stay tight. */
const pct = (value: number): SegmentTarget => ({ type: 'ftpPct', value });
/** Ramp helper. */
const ramp = (startPct: number, endPct: number): SegmentTarget => ({
  type: 'rampPct',
  startPct,
  endPct,
});

function build(
  id: string,
  name: string,
  description: string,
  segments: WorkoutSegment[],
): Workout {
  return {
    id,
    name,
    description,
    createdAt: 0,
    source: 'preset',
    segments,
  };
}

// ---------------------------------------------------------------------------
// The catalog. Re-ordered so the daily ride is first.
// ---------------------------------------------------------------------------

export const PRESET_WORKOUTS: Workout[] = [
  // ── Daily flagship ──
  build(
    'preset-daily-30-easy',
    'Daily 30 Easy',
    'Aerobic foundation ride. Sit at Z2 with a soft warmup and cooldown. Best done daily — builds the base, lets the legs recover from harder days.',
    [
      seg('w', 'warmup',   300, ramp(0.50, 0.60), '5 min warmup ramp 50→60% FTP'),
      seg('s', 'steady',  1200, pct(0.65),         '20 min steady @ 65% FTP'),
      seg('c', 'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown ramp 55→40% FTP'),
    ],
  ),

  // ── 15-min slots ──
  build(
    'preset-hiit-15',
    'HIIT 15',
    'Short, sharp anaerobic stimulus. 8 × 40s near-max efforts with 20s float — leaves you cooked in 15 minutes.',
    [
      seg('w', 'warmup',   180, ramp(0.50, 0.75), '3 min warmup ramp 50→75% FTP'),
      ...intervalSet('h', 8, 40, 20, pct(1.20), pct(0.50), '40s @ 120%', '20s @ 50%'),
      seg('c', 'cooldown', 240, ramp(0.55, 0.40), '4 min cooldown'),
    ],
  ),

  // ── 20-min slots ──
  build(
    'preset-recovery-20',
    'Recovery Spin',
    'Light spin to flush the legs after a hard day. Stay in Z1, keep cadence high (90+ rpm).',
    [
      seg('w', 'warmup',   180, pct(0.45), '3 min easy', 90),
      seg('s', 'steady',   840, pct(0.55), '14 min recovery @ 55% FTP', 92),
      seg('c', 'cooldown', 180, pct(0.40), '3 min spin-down', 90),
    ],
  ),

  build(
    'preset-sprint-20',
    'Sprint Power 20',
    '6 × 30s all-out neuromuscular sprints with 90s recovery. Quick total-body power session.',
    [
      seg('w', 'warmup',   300, ramp(0.50, 0.70), '5 min warmup ramp 50→70% FTP'),
      ...intervalSet('sp', 6, 30, 90, pct(1.50), pct(0.50), '30s @ 150%', '90s recovery'),
      seg('c', 'cooldown', 180, ramp(0.55, 0.40), '3 min cooldown'),
    ],
  ),

  // ── 30-min slots ──
  build(
    'preset-tempo-30',
    'Tempo Builder',
    '20 minutes of Z3 tempo — sustained but conversational. Great mid-week aerobic bump.',
    [
      seg('w', 'warmup',   300, ramp(0.55, 0.75), '5 min warmup ramp'),
      seg('t', 'steady',  1200, pct(0.80),         '20 min tempo @ 80% FTP'),
      seg('c', 'cooldown', 300, ramp(0.65, 0.45), '5 min cooldown'),
    ],
  ),

  build(
    'preset-sweet-spot-2x10',
    'Sweet Spot 2×10',
    'Two 10-minute sweet-spot blocks at 90% FTP with 3 min recovery. The classic FTP-building session.',
    [
      seg('w', 'warmup',   300, ramp(0.55, 0.80), '5 min warmup ramp'),
      seg('s1','interval', 600, pct(0.90),         '10 min @ 90% FTP'),
      seg('r1','recovery', 180, pct(0.55),         '3 min recovery'),
      seg('s2','interval', 600, pct(0.90),         '10 min @ 90% FTP'),
      seg('c', 'cooldown', 120, ramp(0.55, 0.40), '2 min cooldown'),
    ],
  ),

  build(
    'preset-vo2-5x3',
    'VO2 Max 5×3',
    'Five 3-minute VO2-max intervals at 115% FTP with equal recovery. Top-end aerobic capacity.',
    [
      seg('w', 'warmup',   480, ramp(0.50, 0.80), '8 min warmup ramp'),
      ...intervalSet('v', 5, 180, 180, pct(1.15), pct(0.50), '3 min @ 115% FTP', '3 min recovery'),
      seg('c', 'cooldown', 120, ramp(0.55, 0.40), '2 min cooldown'),
    ],
  ),

  build(
    'preset-over-under-30',
    'Over-Under 30',
    'Pairs of "over" (105% FTP) and "under" (90% FTP) minutes. Brutal at the lactate transition — improves clearance.',
    [
      seg('w', 'warmup',   300, ramp(0.55, 0.80), '5 min warmup ramp'),
      ...overUnderSet('ou1', 4, 90, 60, pct(0.90), pct(1.05), 'OU set 1'),
      seg('rec','recovery', 240, pct(0.55),       '4 min recovery'),
      ...overUnderSet('ou2', 4, 90, 60, pct(0.90), pct(1.05), 'OU set 2'),
      seg('c', 'cooldown', 360, ramp(0.55, 0.40), '6 min cooldown'),
    ],
  ),

  // ── 40-45-min slots ──
  build(
    'preset-z2-endurance-45',
    'Z2 Endurance 45',
    'Long aerobic ride at 68% FTP. Builds fat oxidation + mitochondrial density. The "miracle workout".',
    [
      seg('w', 'warmup',   300, ramp(0.50, 0.65), '5 min warmup ramp'),
      seg('s', 'steady',  2100, pct(0.68),         '35 min steady @ 68% FTP'),
      seg('c', 'cooldown', 300, ramp(0.60, 0.45), '5 min cooldown'),
    ],
  ),

  build(
    'preset-sweet-spot-3x10',
    'Sweet Spot 3×10',
    'Three 10-minute sweet-spot blocks at 90% FTP. Extends time-at-intensity beyond the 2×10.',
    [
      seg('w', 'warmup',   300, ramp(0.55, 0.80), '5 min warmup ramp'),
      seg('s1','interval', 600, pct(0.90),         '10 min @ 90% FTP'),
      seg('r1','recovery', 180, pct(0.55),         '3 min recovery'),
      seg('s2','interval', 600, pct(0.90),         '10 min @ 90% FTP'),
      seg('r2','recovery', 180, pct(0.55),         '3 min recovery'),
      seg('s3','interval', 600, pct(0.90),         '10 min @ 90% FTP'),
      seg('c', 'cooldown', 240, ramp(0.55, 0.40), '4 min cooldown'),
    ],
  ),

  build(
    'preset-threshold-2x12',
    'Threshold 2×12',
    'Two 12-minute blocks at 100% FTP. The bread-and-butter session for raising threshold.',
    [
      seg('w', 'warmup',   300, ramp(0.55, 0.85), '5 min warmup ramp'),
      seg('t1','interval', 720, pct(1.00),         '12 min @ 100% FTP'),
      seg('r', 'recovery', 300, pct(0.55),         '5 min recovery'),
      seg('t2','interval', 720, pct(1.00),         '12 min @ 100% FTP'),
      seg('c', 'cooldown', 360, ramp(0.55, 0.40), '6 min cooldown'),
    ],
  ),
];

/** ID of the flagship daily workout — referenced from the Home featured card. */
export const DAILY_WORKOUT_ID = 'preset-daily-30-easy';

/** Lookup by id — handy for the Home featured card and reseed logic. */
export function getPreset(id: string): Workout | undefined {
  return PRESET_WORKOUTS.find((w) => w.id === id);
}

// ---------------------------------------------------------------------------
// Internal interval-set builders so the catalog above stays readable.
// ---------------------------------------------------------------------------

function intervalSet(
  prefix: string,
  count: number,
  onSec: number,
  offSec: number,
  onTarget: SegmentTarget,
  offTarget: SegmentTarget,
  onLabel: string,
  offLabel: string,
): WorkoutSegment[] {
  const out: WorkoutSegment[] = [];
  for (let i = 0; i < count; i++) {
    out.push(seg(`${prefix}${i + 1}on`, 'interval', onSec, onTarget, `${onLabel} (${i + 1}/${count})`));
    out.push(seg(`${prefix}${i + 1}off`, 'recovery', offSec, offTarget, offLabel));
  }
  return out;
}

function overUnderSet(
  prefix: string,
  count: number,
  underSec: number,
  overSec: number,
  underTarget: SegmentTarget,
  overTarget: SegmentTarget,
  label: string,
): WorkoutSegment[] {
  const out: WorkoutSegment[] = [];
  for (let i = 0; i < count; i++) {
    out.push(seg(`${prefix}${i + 1}u`, 'steady', underSec, underTarget, `${label}: ${i + 1}/${count} under`));
    out.push(seg(`${prefix}${i + 1}o`, 'interval', overSec, overTarget, `${label}: ${i + 1}/${count} over`));
  }
  return out;
}
