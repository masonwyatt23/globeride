/**
 * Curated workout catalog — the Zwift-style "I just want to ride 30 minutes"
 * starter set, ready to use without any setup. Seeded into the workout
 * library on first launch (idempotent, mirrors seedSampleRoutesIfMissing).
 *
 * Design goals:
 *  - Every workout is 15–90 min so they fit a real training week.
 *  - Power targets are %FTP, so the trainer holds the right resistance for
 *    every rider once they've set their FTP in Settings.
 *  - One flagship "Daily 30 Easy" leads the list — endurance, Z2, the ride
 *    you do most days. Idle ERG-resistance Zwift-equivalent.
 *  - Zones follow the standard Coggan model (Z1 <55%, Z2 56–75%, Z3 76–90%,
 *    Sweet Spot 84–97%, Threshold ~100%, VO2 106–120%, Anaerobic 121–150%).
 *  - Catalog spans all categories and durations so every training need is
 *    covered: endurance, tempo, sweet spot, threshold, VO2 max, sprints,
 *    over-under, FTP tests, recovery, and climbing-specific work.
 *
 * Preset IDs are stable so the seeding stays idempotent and rebuilding the
 * catalog never duplicates entries. Reseeding logic only inserts the gaps,
 * so a user who deleted "Sweet Spot 3x10" doesn't get it back uninvited.
 */

import type { Workout, WorkoutSegment, SegmentTarget, WorkoutCategory } from '@/lib/workout';

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
  category: WorkoutCategory = 'custom',
): Workout {
  return {
    id,
    name,
    description,
    createdAt: 0,
    source: 'preset',
    segments,
    category,
  };
}

// ---------------------------------------------------------------------------
// The catalog. Re-ordered so the daily ride is first.
// ---------------------------------------------------------------------------

export const PRESET_WORKOUTS: Workout[] = [

  // ── Daily flagship ──────────────────────────────────────────────────────
  build(
    'preset-daily-30-easy',
    'Daily 30 Easy',
    'Aerobic foundation ride. Sit at Z2 with a soft warmup and cooldown. Best done daily — builds the base, lets the legs recover from harder days.',
    [
      seg('w', 'warmup',   300, ramp(0.50, 0.60), '5 min warmup ramp 50→60% FTP'),
      seg('s', 'steady',  1200, pct(0.65),         '20 min steady @ 65% FTP'),
      seg('c', 'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown ramp 55→40% FTP'),
    ],
    'endurance',
  ),

  // ── Recovery ────────────────────────────────────────────────────────────
  build(
    'preset-recovery-20',
    'Recovery Spin',
    'Light spin to flush the legs after a hard day. Stay in Z1, keep cadence high (90+ rpm). Your body rebuilds during these sessions.',
    [
      seg('w', 'warmup',   180, pct(0.45), '3 min easy', 90),
      seg('s', 'steady',   840, pct(0.55), '14 min recovery @ 55% FTP', 92),
      seg('c', 'cooldown', 180, pct(0.40), '3 min spin-down', 90),
    ],
    'endurance',
  ),

  build(
    'preset-recovery-40',
    'Extended Recovery',
    '40-min Z1 active recovery. Ideal the day after a race or your hardest session of the week. Keep watts low, RPM high, and enjoy the spin.',
    [
      seg('w', 'warmup',   300, ramp(0.40, 0.55), '5 min easy ramp', 90),
      seg('s', 'steady',  1800, pct(0.55),          '30 min easy @ 55% FTP', 92),
      seg('c', 'cooldown', 300, ramp(0.50, 0.40),  '5 min spin-down', 90),
    ],
    'endurance',
  ),

  // ── Endurance (Z2) ──────────────────────────────────────────────────────
  build(
    'preset-z2-endurance-45',
    'Z2 Endurance 45',
    'Long aerobic ride at 68% FTP. Builds fat oxidation + mitochondrial density. The "miracle workout" — boring to some, invaluable to all.',
    [
      seg('w', 'warmup',   300, ramp(0.50, 0.65), '5 min warmup ramp'),
      seg('s', 'steady',  2100, pct(0.68),          '35 min steady @ 68% FTP'),
      seg('c', 'cooldown', 300, ramp(0.60, 0.45), '5 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-z2-endurance-60',
    'Z2 Endurance 60',
    'One-hour aerobic ride at the top of Z2. The cornerstone of any base-building block — teaches the body to burn fat and spares glycogen for hard efforts.',
    [
      seg('w', 'warmup',   360, ramp(0.50, 0.65), '6 min warmup ramp'),
      seg('s', 'steady',  3000, pct(0.70),          '50 min steady @ 70% FTP'),
      seg('c', 'cooldown', 240, ramp(0.60, 0.45), '4 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-z2-endurance-90',
    'Z2 Long Ride 90',
    '90-minute low-intensity aerobic session. This is the single most important type of training for aerobic development. Put on a podcast and spin.',
    [
      seg('w', 'warmup',   360, ramp(0.50, 0.65), '6 min warmup ramp'),
      seg('s1','steady',  2400, pct(0.68),          '40 min @ 68% FTP'),
      seg('m', 'steady',   300, pct(0.58),          '5 min mid-ride ease', 92),
      seg('s2','steady',  2100, pct(0.70),          '35 min @ 70% FTP'),
      seg('c', 'cooldown', 240, ramp(0.60, 0.45), '4 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-endurance-surges',
    'Endurance with Surges',
    '5 × 1-minute Z4 accelerations inside a Z2 endurance ride. Trains your ability to respond to attacks without blowing up.',
    [
      seg('w',  'warmup',   600, ramp(0.50, 0.65), '10 min warmup ramp'),
      seg('b1', 'steady',   600, pct(0.65),          '10 min Z2 base'),
      seg('s1', 'interval',  60, pct(1.00),           '1 min surge @ 100% FTP'),
      seg('r1', 'recovery', 240, pct(0.65),           '4 min Z2 recovery'),
      seg('s2', 'interval',  60, pct(1.00),           '1 min surge @ 100% FTP'),
      seg('r2', 'recovery', 240, pct(0.65),           '4 min Z2 recovery'),
      seg('s3', 'interval',  60, pct(1.00),           '1 min surge @ 100% FTP'),
      seg('r3', 'recovery', 240, pct(0.65),           '4 min Z2 recovery'),
      seg('s4', 'interval',  60, pct(1.00),           '1 min surge @ 100% FTP'),
      seg('r4', 'recovery', 240, pct(0.65),           '4 min Z2 recovery'),
      seg('s5', 'interval',  60, pct(1.00),           '1 min surge @ 100% FTP'),
      seg('b2', 'steady',   600, pct(0.65),           '10 min Z2 finish'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'endurance',
  ),

  // ── Tempo (Z3) ──────────────────────────────────────────────────────────
  build(
    'preset-tempo-30',
    'Tempo Builder',
    '20 minutes of Z3 tempo — sustained but conversational. Great mid-week aerobic bump that improves your ability to hold hard steady-state power.',
    [
      seg('w', 'warmup',   300, ramp(0.55, 0.75), '5 min warmup ramp'),
      seg('t', 'steady',  1200, pct(0.80),          '20 min tempo @ 80% FTP'),
      seg('c', 'cooldown', 300, ramp(0.65, 0.45), '5 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-2x15',
    'Tempo 2×15',
    'Two 15-minute Z3 blocks with 5 min recovery. Extends time in the aerobic-glycolytic zone without crossing into threshold territory.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.78), '8 min warmup ramp'),
      seg('t1', 'steady',   900, pct(0.82),          '15 min tempo @ 82% FTP'),
      seg('r',  'recovery', 300, pct(0.55),           '5 min easy'),
      seg('t2', 'steady',   900, pct(0.82),           '15 min tempo @ 82% FTP'),
      seg('c',  'cooldown', 300, ramp(0.65, 0.45),  '5 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-3x10',
    'Tempo 3×10',
    'Three 10-minute Z3 blocks with short recoveries. High total tempo volume in a compact workout — effective mid-season sharpener.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.78), '7 min warmup ramp'),
      seg('t1', 'steady',   600, pct(0.80),          '10 min tempo @ 80% FTP'),
      seg('r1', 'recovery', 180, pct(0.55),           '3 min easy'),
      seg('t2', 'steady',   600, pct(0.82),           '10 min tempo @ 82% FTP'),
      seg('r2', 'recovery', 180, pct(0.55),           '3 min easy'),
      seg('t3', 'steady',   600, pct(0.84),           '10 min tempo @ 84% FTP'),
      seg('c',  'cooldown', 240, ramp(0.65, 0.45),  '4 min cooldown'),
    ],
    'tempo',
  ),

  // ── Sweet Spot ──────────────────────────────────────────────────────────
  build(
    'preset-sweet-spot-2x10',
    'Sweet Spot 2×10',
    'Two 10-minute sweet-spot blocks at 90% FTP with 3 min recovery. The classic FTP-building session — high stimulus with manageable fatigue.',
    [
      seg('w',  'warmup',   300, ramp(0.55, 0.80), '5 min warmup ramp'),
      seg('s1', 'interval', 600, pct(0.90),          '10 min @ 90% FTP'),
      seg('r1', 'recovery', 180, pct(0.55),           '3 min recovery'),
      seg('s2', 'interval', 600, pct(0.90),           '10 min @ 90% FTP'),
      seg('c',  'cooldown', 120, ramp(0.55, 0.40),  '2 min cooldown'),
    ],
    'sweetspot',
  ),

  build(
    'preset-sweet-spot-3x10',
    'Sweet Spot 3×10',
    'Three 10-minute sweet-spot blocks at 90% FTP. Extends time-at-intensity beyond the 2×10 — the standard next step in a sweet-spot progression.',
    [
      seg('w',  'warmup',   300, ramp(0.55, 0.80), '5 min warmup ramp'),
      seg('s1', 'interval', 600, pct(0.90),          '10 min @ 90% FTP'),
      seg('r1', 'recovery', 180, pct(0.55),           '3 min recovery'),
      seg('s2', 'interval', 600, pct(0.90),           '10 min @ 90% FTP'),
      seg('r2', 'recovery', 180, pct(0.55),           '3 min recovery'),
      seg('s3', 'interval', 600, pct(0.90),           '10 min @ 90% FTP'),
      seg('c',  'cooldown', 240, ramp(0.55, 0.40),  '4 min cooldown'),
    ],
    'sweetspot',
  ),

  build(
    'preset-sweet-spot-4x8',
    'Sweet Spot 4×8',
    'Four 8-minute sweet-spot intervals with short 2-minute recoveries. High overall training stress — best saved for the peak of a training block.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.82), '7 min warmup ramp'),
      seg('s1', 'interval', 480, pct(0.90),          '8 min @ 90% FTP'),
      seg('r1', 'recovery', 120, pct(0.55),           '2 min recovery'),
      seg('s2', 'interval', 480, pct(0.90),           '8 min @ 90% FTP'),
      seg('r2', 'recovery', 120, pct(0.55),           '2 min recovery'),
      seg('s3', 'interval', 480, pct(0.92),           '8 min @ 92% FTP'),
      seg('r3', 'recovery', 120, pct(0.55),           '2 min recovery'),
      seg('s4', 'interval', 480, pct(0.92),           '8 min @ 92% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'sweetspot',
  ),

  build(
    'preset-sweet-spot-progressive',
    'Sweet Spot Progressive',
    'Three 12-minute blocks with increasing intensity (87→90→93% FTP). Prepares the lactate system to handle escalating demand — a smart early-season build.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.80), '8 min warmup ramp'),
      seg('s1', 'interval', 720, pct(0.87),          '12 min @ 87% FTP'),
      seg('r1', 'recovery', 240, pct(0.55),           '4 min recovery'),
      seg('s2', 'interval', 720, pct(0.90),           '12 min @ 90% FTP'),
      seg('r2', 'recovery', 240, pct(0.55),           '4 min recovery'),
      seg('s3', 'interval', 720, pct(0.93),           '12 min @ 93% FTP'),
      seg('c',  'cooldown', 360, ramp(0.60, 0.45),  '6 min cooldown'),
    ],
    'sweetspot',
  ),

  // ── Threshold ───────────────────────────────────────────────────────────
  build(
    'preset-threshold-2x12',
    'Threshold 2×12',
    'Two 12-minute blocks at 100% FTP. The bread-and-butter session for raising threshold — enough stimulus to drive adaptation, short enough to execute well.',
    [
      seg('w',  'warmup',   300, ramp(0.55, 0.85), '5 min warmup ramp'),
      seg('t1', 'interval', 720, pct(1.00),          '12 min @ 100% FTP'),
      seg('r',  'recovery', 300, pct(0.55),           '5 min recovery'),
      seg('t2', 'interval', 720, pct(1.00),           '12 min @ 100% FTP'),
      seg('c',  'cooldown', 360, ramp(0.55, 0.40),  '6 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-threshold-20min',
    '20-Minute Threshold',
    'One sustained 20-minute effort at 100% FTP. The classic "just ride as hard as you can" test-and-train session. Execute at even power — resist going hard early.',
    [
      seg('w', 'warmup',    480, ramp(0.55, 0.85), '8 min warmup ramp'),
      seg('t', 'interval', 1200, pct(1.00),          '20 min @ 100% FTP'),
      seg('c', 'cooldown',  480, ramp(0.65, 0.45), '8 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-threshold-3x8',
    'Threshold 3×8',
    'Three 8-minute threshold intervals with 4 min recovery. Higher repetition makes each interval feel more achievable while accumulating serious training load.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.85), '7 min warmup ramp'),
      seg('t1', 'interval', 480, pct(1.00),          '8 min @ 100% FTP'),
      seg('r1', 'recovery', 240, pct(0.55),           '4 min recovery'),
      seg('t2', 'interval', 480, pct(1.00),           '8 min @ 100% FTP'),
      seg('r2', 'recovery', 240, pct(0.55),           '4 min recovery'),
      seg('t3', 'interval', 480, pct(1.02),           '8 min @ 102% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-over-under-30',
    'Over-Under 30',
    'Pairs of "under" (90% FTP) and "over" (105% FTP) efforts. Brutal at the lactate transition — trains your body to clear lactate faster than it accumulates.',
    [
      seg('w', 'warmup',    300, ramp(0.55, 0.80), '5 min warmup ramp'),
      ...overUnderSet('ou1', 4, 90, 60, pct(0.90), pct(1.05), 'OU set 1'),
      seg('rec','recovery', 240, pct(0.55),          '4 min recovery'),
      ...overUnderSet('ou2', 4, 90, 60, pct(0.90), pct(1.05), 'OU set 2'),
      seg('c', 'cooldown',  360, ramp(0.55, 0.40), '6 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-over-under-advanced',
    'Over-Under Advanced',
    'Three sets of 5-minute over-under blocks with progressively tighter margins (92/103%). Demands sustained lactate management — reserve for peak fitness.',
    [
      seg('w',   'warmup',   480, ramp(0.55, 0.85), '8 min warmup ramp'),
      ...overUnderSet('ou1', 5, 60, 60, pct(0.92), pct(1.03), 'Set 1'),
      seg('r1',  'recovery', 300, pct(0.55),          '5 min recovery'),
      ...overUnderSet('ou2', 5, 60, 60, pct(0.92), pct(1.05), 'Set 2'),
      seg('r2',  'recovery', 300, pct(0.55),           '5 min recovery'),
      ...overUnderSet('ou3', 5, 60, 60, pct(0.93), pct(1.07), 'Set 3'),
      seg('c',   'cooldown', 360, ramp(0.60, 0.45), '6 min cooldown'),
    ],
    'threshold',
  ),

  // ── VO2 Max / Intervals ─────────────────────────────────────────────────
  build(
    'preset-vo2-5x3',
    'VO2 Max 5×3',
    'Five 3-minute VO2-max intervals at 115% FTP with equal recovery. Develops top-end aerobic capacity — push hard but keep form clean on every rep.',
    [
      seg('w', 'warmup',   480, ramp(0.50, 0.80), '8 min warmup ramp'),
      ...intervalSet('v', 5, 180, 180, pct(1.15), pct(0.50), '3 min @ 115% FTP', '3 min recovery'),
      seg('c', 'cooldown', 120, ramp(0.55, 0.40), '2 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-6x4',
    'VO2 Max 6×4',
    'Six 4-minute VO2-max intervals at 110% FTP. Longer efforts than the classic 5×3 — more total VO2 time per session for well-trained athletes.',
    [
      seg('w', 'warmup',   600, ramp(0.50, 0.82), '10 min warmup ramp'),
      ...intervalSet('v', 6, 240, 240, pct(1.10), pct(0.50), '4 min @ 110% FTP', '4 min recovery'),
      seg('c', 'cooldown', 240, ramp(0.55, 0.40), '4 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-30-30',
    '30/30 VO2 Blasters',
    '20 × 30s on / 30s off at 130% FTP. Micro-intervals that accumulate huge VO2 time without the deep fatigue of longer reps — a Seiler-style classic.',
    [
      seg('w', 'warmup',   600, ramp(0.50, 0.80), '10 min warmup ramp'),
      ...intervalSet('x', 20, 30, 30, pct(1.30), pct(0.55), '30s @ 130% FTP', '30s @ 55%'),
      seg('c', 'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-pyramid-intervals',
    'Pyramid Intervals',
    'Ascending then descending interval durations (1-2-3-4-3-2-1 min) at 110% FTP with equal rest. Forces pacing discipline across different effort lengths.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.82), '8 min warmup ramp'),
      seg('i1', 'interval',  60, pct(1.10),          '1 min @ 110% FTP'),
      seg('r1', 'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('i2', 'interval', 120, pct(1.10),           '2 min @ 110% FTP'),
      seg('r2', 'recovery', 120, pct(0.55),           '2 min recovery'),
      seg('i3', 'interval', 180, pct(1.10),           '3 min @ 110% FTP'),
      seg('r3', 'recovery', 180, pct(0.55),           '3 min recovery'),
      seg('i4', 'interval', 240, pct(1.10),           '4 min @ 110% FTP'),
      seg('r4', 'recovery', 240, pct(0.55),           '4 min recovery'),
      seg('i5', 'interval', 180, pct(1.10),           '3 min @ 110% FTP'),
      seg('r5', 'recovery', 180, pct(0.55),           '3 min recovery'),
      seg('i6', 'interval', 120, pct(1.10),           '2 min @ 110% FTP'),
      seg('r6', 'recovery', 120, pct(0.55),           '2 min recovery'),
      seg('i7', 'interval',  60, pct(1.10),           '1 min @ 110% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'intervals',
  ),

  // ── Sprints / Anaerobic ─────────────────────────────────────────────────
  build(
    'preset-sprint-20',
    'Sprint Power 20',
    '6 × 30s all-out neuromuscular sprints with 90s recovery. Quick total-body power session — develops peak power and the ability to accelerate out of corners.',
    [
      seg('w', 'warmup',   300, ramp(0.50, 0.70), '5 min warmup ramp'),
      ...intervalSet('sp', 6, 30, 90, pct(1.50), pct(0.50), '30s @ 150%', '90s recovery'),
      seg('c', 'cooldown', 180, ramp(0.55, 0.40), '3 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-hiit-15',
    'HIIT 15',
    'Short, sharp anaerobic stimulus. 8 × 40s near-max efforts with 20s float — leaves you cooked in 15 minutes. Perfect for busy days.',
    [
      seg('w', 'warmup',   180, ramp(0.50, 0.75), '3 min warmup ramp'),
      ...intervalSet('h', 8, 40, 20, pct(1.20), pct(0.50), '40s @ 120%', '20s @ 50%'),
      seg('c', 'cooldown', 240, ramp(0.55, 0.40), '4 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-tabata',
    'Tabata Power',
    '4 rounds of Tabata protocol (8 × 20s all-out / 10s off). Each round is 4 minutes of pure suffering. Raises peak power and anaerobic capacity.',
    [
      seg('w',  'warmup',   600, ramp(0.50, 0.78), '10 min warmup ramp'),
      ...intervalSet('t1', 8, 20, 10, pct(1.50), pct(0.50), 'Tabata 1: 20s effort', '10s off'),
      seg('r1', 'recovery', 300, pct(0.50),          '5 min recovery'),
      ...intervalSet('t2', 8, 20, 10, pct(1.50), pct(0.50), 'Tabata 2: 20s effort', '10s off'),
      seg('r2', 'recovery', 300, pct(0.50),           '5 min recovery'),
      ...intervalSet('t3', 8, 20, 10, pct(1.50), pct(0.50), 'Tabata 3: 20s effort', '10s off'),
      seg('c',  'cooldown', 300, ramp(0.55, 0.40),  '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-sprint-8x15',
    'Neuromuscular 8×15',
    '8 × 15-second full-gas sprints with 3-minute full recoveries. Focus on peak cadence and force application — not fitness, pure power development.',
    [
      seg('w', 'warmup',   600, ramp(0.50, 0.72), '10 min warmup ramp', 90),
      ...intervalSet('s', 8, 15, 180, pct(1.60), pct(0.50), '15s sprint @ 160%', '3 min full recovery'),
      seg('c', 'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  // ── Climbing ────────────────────────────────────────────────────────────
  build(
    'preset-climbing-repeats',
    'Climbing Repeats',
    '5 × 6-minute sustained climbing efforts at 95% FTP with 3-minute descents. Simulates repeated category climbs — builds climbing-specific lactate tolerance.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.80), '8 min warmup ramp', 80),
      seg('c1', 'interval', 360, pct(0.95),          '6 min climb @ 95% FTP', 70),
      seg('d1', 'recovery', 180, pct(0.55),           '3 min descent @ 55% FTP', 90),
      seg('c2', 'interval', 360, pct(0.95),           '6 min climb @ 95% FTP', 70),
      seg('d2', 'recovery', 180, pct(0.55),           '3 min descent @ 55% FTP', 90),
      seg('c3', 'interval', 360, pct(0.95),           '6 min climb @ 95% FTP', 70),
      seg('d3', 'recovery', 180, pct(0.55),           '3 min descent @ 55% FTP', 90),
      seg('c4', 'interval', 360, pct(0.95),           '6 min climb @ 95% FTP', 70),
      seg('d4', 'recovery', 180, pct(0.55),           '3 min descent @ 55% FTP', 90),
      seg('c5', 'interval', 360, pct(0.97),           '6 min climb @ 97% FTP', 68),
      seg('dn', 'cooldown', 360, ramp(0.65, 0.45),  '6 min cooldown'),
    ],
    'sweetspot',
  ),

  build(
    'preset-seated-climbing',
    'Seated Climb Power',
    'Three 10-minute blocks at 88% FTP targeting a low cadence (65-70 rpm). Forces high torque through the pedal stroke — builds climbing-specific muscle strength.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.80), '8 min warmup ramp', 85),
      seg('c1', 'interval', 600, pct(0.88),          '10 min climb @ 88% FTP', 68),
      seg('r1', 'recovery', 300, pct(0.55),           '5 min recovery', 90),
      seg('c2', 'interval', 600, pct(0.88),           '10 min climb @ 88% FTP', 68),
      seg('r2', 'recovery', 300, pct(0.55),           '5 min recovery', 90),
      seg('c3', 'interval', 600, pct(0.90),           '10 min climb @ 90% FTP', 68),
      seg('dn', 'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown', 85),
    ],
    'sweetspot',
  ),

  // ── Ramp Tests ──────────────────────────────────────────────────────────
  build(
    'preset-ramp-test',
    'FTP Ramp Test',
    'Classic 1-min-per-step ramp test. Ride as long as you can; your new FTP = peak 1-min power × 0.75. Accurate, repeatable, and max effort lasts only a few minutes.',
    [
      seg('w',  'warmup',    300, pct(0.45),            '5 min easy warmup'),
      seg('r1', 'ramp',      300, ramp(0.45, 0.70),   '5 min easy ramp'),
      seg('r2', 'ramp',      300, ramp(0.70, 0.90),   '5 min moderate ramp'),
      seg('r3', 'ramp',      300, ramp(0.90, 1.10),   '5 min hard ramp'),
      seg('r4', 'ramp',      300, ramp(1.10, 1.30),   '5 min very hard ramp'),
      seg('r5', 'ramp',      300, ramp(1.30, 1.50),   '5 min extreme ramp (hold as long as possible)'),
      seg('c',  'cooldown',  600, pct(0.45),            '10 min recovery'),
    ],
    'test',
  ),

  build(
    'preset-20min-ftp-test',
    '20-Minute FTP Test',
    'Perform a 20-minute all-out TT effort; subtract 5% for your FTP estimate. Do a brief 5-min openers effort first. Go out steady — the first 10 min should feel almost easy.',
    [
      seg('w',  'warmup',   600, ramp(0.55, 0.80), '10 min warmup ramp'),
      seg('o1', 'interval', 300, pct(1.00),          '5 min openers @ 100% FTP'),
      seg('r',  'recovery', 300, pct(0.50),           '5 min full recovery'),
      seg('tt', 'interval',1200, pct(1.05),           '20 min all-out TT effort'),
      seg('c',  'cooldown', 600, ramp(0.65, 0.45), '10 min cooldown'),
    ],
    'test',
  ),

  // ── Additional Endurance ────────────────────────────────────────────────
  build(
    'preset-z2-endurance-75',
    'Z2 Endurance 75',
    '75-min aerobic base ride with a mid-session tempo spike. Builds mitochondrial density while the brief tempo block maintains top-end sharpness without digging a fatigue hole.',
    [
      seg('w',  'warmup',   420, ramp(0.50, 0.65), '7 min warmup ramp'),
      seg('s1', 'steady',  1800, pct(0.68),          '30 min @ 68% FTP'),
      seg('t',  'steady',   600, pct(0.78),           '10 min tempo spike @ 78% FTP'),
      seg('s2', 'steady',  1500, pct(0.68),           '25 min @ 68% FTP'),
      seg('c',  'cooldown', 180, ramp(0.60, 0.45),  '3 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-aerobic-decoupler',
    'Aerobic Decoupler',
    '60-min Z2 ride designed to test cardiac decoupling — monitor how your power:HR ratio drifts over the second 30 minutes. A healthy aerobic base shows < 5% drift.',
    [
      seg('w',  'warmup',   300, ramp(0.50, 0.65), '5 min warmup ramp'),
      seg('s1', 'steady',  1800, pct(0.67),          '30 min aerobic @ 67% FTP'),
      seg('s2', 'steady',  1500, pct(0.70),           '25 min aerobic @ 70% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'endurance',
  ),

  // ── Additional Tempo ────────────────────────────────────────────────────
  build(
    'preset-tempo-race-pace',
    'Race-Pace Tempo',
    '3 × 20-min tempo blocks at 83% FTP with 5-min recoveries. Simulates the sustained mid-race effort of a road race or gran fondo — tough but completable.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.78), '8 min warmup ramp'),
      seg('t1', 'steady',  1200, pct(0.83),          '20 min tempo @ 83% FTP'),
      seg('r1', 'recovery', 300, pct(0.55),           '5 min easy'),
      seg('t2', 'steady',  1200, pct(0.83),           '20 min tempo @ 83% FTP'),
      seg('r2', 'recovery', 300, pct(0.55),           '5 min easy'),
      seg('t3', 'steady',  1200, pct(0.83),           '20 min tempo @ 83% FTP'),
      seg('c',  'cooldown', 300, ramp(0.65, 0.45),  '5 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-sweetspot-blend',
    'Tempo / Sweet Spot Blend',
    'Alternating 10-min tempo and 5-min sweet-spot blocks — a metabolic seesaw that raises both thresholds simultaneously without crossing into true threshold territory.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.78), '7 min warmup ramp'),
      seg('t1', 'steady',   600, pct(0.78),          '10 min tempo @ 78% FTP'),
      seg('s1', 'interval', 300, pct(0.90),           '5 min sweet spot @ 90% FTP'),
      seg('t2', 'steady',   600, pct(0.80),           '10 min tempo @ 80% FTP'),
      seg('s2', 'interval', 300, pct(0.90),           '5 min sweet spot @ 90% FTP'),
      seg('t3', 'steady',   600, pct(0.82),           '10 min tempo @ 82% FTP'),
      seg('s3', 'interval', 300, pct(0.92),           '5 min sweet spot @ 92% FTP'),
      seg('c',  'cooldown', 300, ramp(0.65, 0.45),  '5 min cooldown'),
    ],
    'tempo',
  ),

  // ── Additional Sweet Spot ───────────────────────────────────────────────
  build(
    'preset-sweet-spot-long-2x20',
    'Sweet Spot Long 2×20',
    'Two 20-minute sweet-spot blocks at 90% FTP with 5 min recovery. High training load in a single session — the staple of winter base building for serious amateurs.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.82), '8 min warmup ramp'),
      seg('s1', 'interval',1200, pct(0.90),          '20 min @ 90% FTP'),
      seg('r',  'recovery', 300, pct(0.55),           '5 min recovery'),
      seg('s2', 'interval',1200, pct(0.90),           '20 min @ 90% FTP'),
      seg('c',  'cooldown', 360, ramp(0.60, 0.45),  '6 min cooldown'),
    ],
    'sweetspot',
  ),

  build(
    'preset-sweet-spot-ladder',
    'Sweet Spot Ladder',
    'Ascending sweet-spot blocks: 6-8-10-12 min with 2-min floats. The ladder format builds mental toughness — each block feels shorter than the accumulated fatigue warrants.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.82), '7 min warmup ramp'),
      seg('s1', 'interval', 360, pct(0.88),          '6 min @ 88% FTP'),
      seg('r1', 'recovery', 120, pct(0.55),           '2 min float'),
      seg('s2', 'interval', 480, pct(0.89),           '8 min @ 89% FTP'),
      seg('r2', 'recovery', 120, pct(0.55),           '2 min float'),
      seg('s3', 'interval', 600, pct(0.90),           '10 min @ 90% FTP'),
      seg('r3', 'recovery', 120, pct(0.55),           '2 min float'),
      seg('s4', 'interval', 720, pct(0.91),           '12 min @ 91% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'sweetspot',
  ),

  // ── Additional Threshold ────────────────────────────────────────────────
  build(
    'preset-threshold-4x6',
    'Threshold 4×6',
    'Four 6-minute threshold intervals at 100% FTP with 3-min recoveries. Short enough to execute cleanly; enough volume to drive strong adaptation. Quality over quantity.',
    [
      seg('w',  'warmup',   360, ramp(0.55, 0.85), '6 min warmup ramp'),
      seg('t1', 'interval', 360, pct(1.00),          '6 min @ 100% FTP'),
      seg('r1', 'recovery', 180, pct(0.55),           '3 min recovery'),
      seg('t2', 'interval', 360, pct(1.00),           '6 min @ 100% FTP'),
      seg('r2', 'recovery', 180, pct(0.55),           '3 min recovery'),
      seg('t3', 'interval', 360, pct(1.00),           '6 min @ 100% FTP'),
      seg('r3', 'recovery', 180, pct(0.55),           '3 min recovery'),
      seg('t4', 'interval', 360, pct(1.02),           '6 min @ 102% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-micro-burst-threshold',
    'Micro-Burst Threshold',
    '4 sets of 5 × 30s micro-bursts at 115% / 85% FTP inside a threshold envelope. Spikes lactate then forces clearance — brutal lactate-shuttle training.',
    [
      seg('w',   'warmup',   480, ramp(0.55, 0.85), '8 min warmup ramp'),
      ...intervalSet('mb1', 5, 30, 30, pct(1.15), pct(0.85), '30s @ 115% FTP', '30s @ 85% FTP'),
      seg('r1',  'recovery', 180, pct(0.55),          '3 min recovery'),
      ...intervalSet('mb2', 5, 30, 30, pct(1.15), pct(0.85), '30s @ 115% FTP', '30s @ 85% FTP'),
      seg('r2',  'recovery', 180, pct(0.55),           '3 min recovery'),
      ...intervalSet('mb3', 5, 30, 30, pct(1.15), pct(0.85), '30s @ 115% FTP', '30s @ 85% FTP'),
      seg('r3',  'recovery', 180, pct(0.55),           '3 min recovery'),
      ...intervalSet('mb4', 5, 30, 30, pct(1.15), pct(0.85), '30s @ 115% FTP', '30s @ 85% FTP'),
      seg('c',   'cooldown', 360, ramp(0.60, 0.45), '6 min cooldown'),
    ],
    'threshold',
  ),

  // ── Additional VO2 Max / Intervals ──────────────────────────────────────
  build(
    'preset-vo2-40-20',
    '40/20 VO2 Blasters',
    '3 sets of 8 × 40s on / 20s off at 120% FTP. Longer on-intervals than the classic 30/30 — accumulates even more VO2 time while the 20s float keeps you honest.',
    [
      seg('w',  'warmup',   600, ramp(0.50, 0.82), '10 min warmup ramp'),
      ...intervalSet('a1', 8, 40, 20, pct(1.20), pct(0.55), '40s @ 120% FTP', '20s @ 55%'),
      seg('r1', 'recovery', 300, pct(0.50),          '5 min recovery'),
      ...intervalSet('a2', 8, 40, 20, pct(1.20), pct(0.55), '40s @ 120% FTP', '20s @ 55%'),
      seg('r2', 'recovery', 300, pct(0.50),           '5 min recovery'),
      ...intervalSet('a3', 8, 40, 20, pct(1.20), pct(0.55), '40s @ 120% FTP', '20s @ 55%'),
      seg('c',  'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-attack-and-recover',
    'Attack & Recover',
    'Six 2-min VO2 efforts at 118% FTP with 4-min active recovery. Models the repeated attacks of a road race — you must recover quickly and go again.',
    [
      seg('w',  'warmup',   480, ramp(0.50, 0.80), '8 min warmup ramp'),
      seg('a1', 'interval', 120, pct(1.18),          '2 min attack @ 118% FTP'),
      seg('r1', 'recovery', 240, pct(0.60),           '4 min active recovery'),
      seg('a2', 'interval', 120, pct(1.18),           '2 min attack @ 118% FTP'),
      seg('r2', 'recovery', 240, pct(0.60),           '4 min active recovery'),
      seg('a3', 'interval', 120, pct(1.18),           '2 min attack @ 118% FTP'),
      seg('r3', 'recovery', 240, pct(0.60),           '4 min active recovery'),
      seg('a4', 'interval', 120, pct(1.18),           '2 min attack @ 118% FTP'),
      seg('r4', 'recovery', 240, pct(0.60),           '4 min active recovery'),
      seg('a5', 'interval', 120, pct(1.18),           '2 min attack @ 118% FTP'),
      seg('r5', 'recovery', 240, pct(0.60),           '4 min active recovery'),
      seg('a6', 'interval', 120, pct(1.20),           '2 min attack @ 120% FTP'),
      seg('c',  'cooldown', 300, ramp(0.55, 0.40),  '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-punch-and-grind',
    'Punch & Grind',
    '5 rounds of 15s sprint + 5-min sweet-spot block. Simulates the race pattern of attacking out of corners then grinding over rolling terrain. Brutal combination.',
    [
      seg('w',   'warmup',   480, ramp(0.50, 0.78), '8 min warmup ramp'),
      seg('p1',  'interval',  15, pct(1.60),          'Sprint 1 @ 160% FTP', 110),
      seg('g1',  'interval', 300, pct(0.91),           '5 min grind @ 91% FTP', 72),
      seg('p2',  'interval',  15, pct(1.60),           'Sprint 2 @ 160% FTP', 110),
      seg('g2',  'interval', 300, pct(0.91),           '5 min grind @ 91% FTP', 72),
      seg('p3',  'interval',  15, pct(1.60),           'Sprint 3 @ 160% FTP', 110),
      seg('g3',  'interval', 300, pct(0.91),           '5 min grind @ 91% FTP', 72),
      seg('p4',  'interval',  15, pct(1.60),           'Sprint 4 @ 160% FTP', 110),
      seg('g4',  'interval', 300, pct(0.91),           '5 min grind @ 91% FTP', 72),
      seg('p5',  'interval',  15, pct(1.60),           'Sprint 5 @ 160% FTP', 110),
      seg('g5',  'interval', 300, pct(0.93),           '5 min grind @ 93% FTP', 72),
      seg('c',   'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'intervals',
  ),

  // ── Additional Climbing ─────────────────────────────────────────────────
  build(
    'preset-hc-climb-simulation',
    'HC Climb Simulation',
    '45-min sustained effort at 92% FTP mimicking a hors-catégorie climb at race pace. Low cadence, high torque — your legs will feel every metre of imaginary altitude.',
    [
      seg('w', 'warmup',   480, ramp(0.55, 0.82), '8 min warmup ramp', 80),
      seg('c', 'interval',2700, pct(0.92),          '45 min HC climb @ 92% FTP', 68),
      seg('d', 'cooldown', 420, ramp(0.65, 0.45), '7 min descent cooldown', 90),
    ],
    'sweetspot',
  ),

  build(
    'preset-col-repeats-short',
    'Short Col Repeats',
    '8 × 4-min climbing efforts at 96% FTP with 2-min recovery descents. High-frequency lactate exposure builds the ability to repeat hard climbing efforts.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.82), '7 min warmup ramp', 80),
      seg('c1', 'interval', 240, pct(0.96),          '4 min col effort @ 96% FTP', 70),
      seg('d1', 'recovery', 120, pct(0.55),           '2 min descent @ 55% FTP', 92),
      seg('c2', 'interval', 240, pct(0.96),           '4 min col effort @ 96% FTP', 70),
      seg('d2', 'recovery', 120, pct(0.55),           '2 min descent @ 55% FTP', 92),
      seg('c3', 'interval', 240, pct(0.96),           '4 min col effort @ 96% FTP', 70),
      seg('d3', 'recovery', 120, pct(0.55),           '2 min descent @ 55% FTP', 92),
      seg('c4', 'interval', 240, pct(0.96),           '4 min col effort @ 96% FTP', 70),
      seg('d4', 'recovery', 120, pct(0.55),           '2 min descent @ 55% FTP', 92),
      seg('c5', 'interval', 240, pct(0.96),           '4 min col effort @ 96% FTP', 70),
      seg('d5', 'recovery', 120, pct(0.55),           '2 min descent @ 55% FTP', 92),
      seg('c6', 'interval', 240, pct(0.96),           '4 min col effort @ 96% FTP', 70),
      seg('d6', 'recovery', 120, pct(0.55),           '2 min descent @ 55% FTP', 92),
      seg('c7', 'interval', 240, pct(0.97),           '4 min col effort @ 97% FTP', 70),
      seg('d7', 'recovery', 120, pct(0.55),           '2 min descent @ 55% FTP', 92),
      seg('c8', 'interval', 240, pct(0.98),           '4 min col effort @ 98% FTP', 70),
      seg('dn', 'cooldown', 360, ramp(0.65, 0.45),  '6 min cooldown'),
    ],
    'sweetspot',
  ),

  // ── Recovery & Z2 Endurance (extended) ──────────────────────────────────
  build(
    'preset-recovery-15-flush',
    'Quick Leg Flush',
    '15-minute active recovery spin — pure Z1, high cadence. The fastest way to move metabolic waste out of the legs before tomorrow\'s hard session.',
    [
      seg('w', 'warmup',   120, pct(0.42), '2 min easy', 90),
      seg('s', 'steady',   720, pct(0.50), '12 min easy flush @ 50% FTP', 95),
      seg('c', 'cooldown', 60,  pct(0.40), '1 min spin-down', 95),
    ],
    'endurance',
  ),

  build(
    'preset-z2-morning-spin-30',
    'Morning Activator',
    '30-min gentle Z2 ride to wake up the body and prime the aerobic system before the day. Perfect pre-breakfast or before a hard afternoon session.',
    [
      seg('w', 'warmup',   300, ramp(0.45, 0.60), '5 min easy ramp'),
      seg('s', 'steady',  1200, pct(0.63),          '20 min aerobic @ 63% FTP'),
      seg('c', 'cooldown', 300, ramp(0.58, 0.42), '5 min wind-down'),
    ],
    'endurance',
  ),

  build(
    'preset-z2-foundation-50',
    'Foundation 50',
    '50-min pure Z2 aerobic foundation ride. No intensity spikes — just build the base. The boring sessions are the ones that matter most.',
    [
      seg('w',  'warmup',   360, ramp(0.50, 0.65), '6 min warmup ramp'),
      seg('s1', 'steady',  1500, pct(0.67),          '25 min aerobic @ 67% FTP'),
      seg('s2', 'steady',  1200, pct(0.69),           '20 min aerobic @ 69% FTP'),
      seg('c',  'cooldown', 360, ramp(0.60, 0.45),  '6 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-z2-steady-state-60',
    'Steady State 60',
    '60-min Z2 with a tightly controlled power band (65-70% FTP). Develops fat oxidation, mitochondrial density, and cardiac output at minimal fatigue cost.',
    [
      seg('w',  'warmup',   420, ramp(0.50, 0.65), '7 min warmup ramp'),
      seg('s1', 'steady',  1500, pct(0.66),          '25 min @ 66% FTP'),
      seg('s2', 'steady',  1200, pct(0.68),           '20 min @ 68% FTP'),
      seg('s3', 'steady',   600, pct(0.70),           '10 min @ 70% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-base-miles-75',
    'Base Miles 75',
    '75-min pure aerobic base session. Three equal blocks at progressive Z2 intensity — the kind of ride that builds champions when done consistently.',
    [
      seg('w',  'warmup',   420, ramp(0.50, 0.64), '7 min warmup ramp'),
      seg('s1', 'steady',  1500, pct(0.65),          '25 min @ 65% FTP'),
      seg('s2', 'steady',  1200, pct(0.68),           '20 min @ 68% FTP'),
      seg('s3', 'steady',   900, pct(0.70),           '15 min @ 70% FTP'),
      seg('c',  'cooldown', 480, ramp(0.62, 0.45),  '8 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-recovery-spin-45',
    'Long Recovery Spin',
    '45-min Z1 active recovery — longer than the 20-min flush but still below any meaningful training threshold. For the day after your hardest session of the week.',
    [
      seg('w', 'warmup',   300, pct(0.42), '5 min easy', 90),
      seg('s', 'steady',  2100, pct(0.52), '35 min easy @ 52% FTP', 92),
      seg('c', 'cooldown', 300, pct(0.42), '5 min wind-down', 90),
    ],
    'endurance',
  ),

  build(
    'preset-endurance-tempo-burst-60',
    'Endurance + Tempo Bursts 60',
    '60-min Z2 base ride with three 5-min tempo surges. Teaches the body to return to aerobic metabolism quickly after a brief intensity spike.',
    [
      seg('w',  'warmup',   360, ramp(0.50, 0.65), '6 min warmup ramp'),
      seg('b1', 'steady',   600, pct(0.66),          '10 min Z2 base'),
      seg('t1', 'steady',   300, pct(0.80),           '5 min tempo surge @ 80% FTP'),
      seg('b2', 'steady',   600, pct(0.67),           '10 min Z2 recovery base'),
      seg('t2', 'steady',   300, pct(0.82),           '5 min tempo surge @ 82% FTP'),
      seg('b3', 'steady',   600, pct(0.66),           '10 min Z2 recovery base'),
      seg('t3', 'steady',   300, pct(0.80),           '5 min tempo surge @ 80% FTP'),
      seg('b4', 'steady',   480, pct(0.65),           '8 min Z2 finish'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.45),  '5 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-endurance-neg-split',
    'Negative Split Ride',
    '60-min endurance ride where the second half is slightly harder than the first. Trains pacing discipline and metabolic efficiency under progressive load.',
    [
      seg('w',  'warmup',   300, ramp(0.50, 0.62), '5 min warmup ramp'),
      seg('s1', 'steady',  1800, pct(0.64),          '30 min aerobic @ 64% FTP'),
      seg('s2', 'steady',  1200, pct(0.70),           '20 min aerobic @ 70% FTP'),
      seg('s3', 'steady',   300, pct(0.73),           '5 min final push @ 73% FTP'),
      seg('c',  'cooldown', 300, ramp(0.62, 0.45),  '5 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-z2-muscle-tension',
    'Low-Cadence Z2',
    '45-min Z2 ride at deliberately low cadence (60-65 rpm). Forces high pedal torque at aerobic intensity — builds climbing-specific muscular endurance without threshold stress.',
    [
      seg('w',  'warmup',   300, ramp(0.50, 0.64), '5 min warmup ramp', 85),
      seg('s1', 'steady',   900, pct(0.65),          '15 min Z2 low-cadence @ 65% FTP', 62),
      seg('r',  'steady',   300, pct(0.58),           '5 min normal cadence', 88),
      seg('s2', 'steady',   900, pct(0.67),           '15 min Z2 low-cadence @ 67% FTP', 62),
      seg('c',  'cooldown', 300, ramp(0.58, 0.42),  '5 min cooldown', 85),
    ],
    'endurance',
  ),

  build(
    'preset-aerobic-sweet-blend-75',
    'Aerobic Sweet Blend 75',
    '75-min ride mixing long Z2 blocks with two sweet-spot efforts. Builds aerobic volume while maintaining threshold contact — a versatile base-build session.',
    [
      seg('w',  'warmup',   360, ramp(0.50, 0.66), '6 min warmup ramp'),
      seg('b1', 'steady',  1200, pct(0.67),          '20 min Z2 base'),
      seg('s1', 'interval', 480, pct(0.88),           '8 min sweet spot @ 88% FTP'),
      seg('b2', 'steady',  1200, pct(0.66),           '20 min Z2 base'),
      seg('s2', 'interval', 480, pct(0.90),           '8 min sweet spot @ 90% FTP'),
      seg('b3', 'steady',   600, pct(0.65),           '10 min Z2 finish'),
      seg('c',  'cooldown', 180, ramp(0.58, 0.42),  '3 min cooldown'),
    ],
    'endurance',
  ),

  build(
    'preset-long-easy-90-v2',
    'Long Ride Steady 90',
    '90-min steady aerobic session — the single most effective workout for building aerobic capacity per unit of fatigue cost. Put on a long playlist and grind.',
    [
      seg('w',  'warmup',   360, ramp(0.50, 0.64), '6 min warmup ramp'),
      seg('s1', 'steady',  2400, pct(0.66),          '40 min steady @ 66% FTP'),
      seg('s2', 'steady',  2400, pct(0.69),           '40 min steady @ 69% FTP'),
      seg('c',  'cooldown', 240, ramp(0.62, 0.44),  '4 min cooldown'),
    ],
    'endurance',
  ),

  // ── Tempo (Z3) extended ──────────────────────────────────────────────────
  build(
    'preset-tempo-25-progressive',
    'Tempo 25 Progressive',
    '25-min progressive tempo ride that builds from 75% to 85% FTP across three blocks. Eases you into the tempo zone and finishes with real bite.',
    [
      seg('w', 'warmup',   300, ramp(0.52, 0.72), '5 min warmup ramp'),
      seg('t1','steady',   480, pct(0.75),          '8 min @ 75% FTP'),
      seg('t2','steady',   480, pct(0.80),           '8 min @ 80% FTP'),
      seg('t3','steady',   480, pct(0.85),           '8 min @ 85% FTP — push hard here'),
      seg('c', 'cooldown', 300, ramp(0.65, 0.45),  '5 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-freeform-45',
    'Freeform Tempo 45',
    '30 min of uninterrupted Z3 tempo at 82% FTP. No intervals, no surges — just sustained effort. Trains mental toughness alongside metabolic efficiency.',
    [
      seg('w', 'warmup',   480, ramp(0.55, 0.78), '8 min warmup ramp'),
      seg('t', 'steady',  1800, pct(0.82),          '30 min tempo @ 82% FTP'),
      seg('c', 'cooldown', 240, ramp(0.68, 0.46),  '4 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-4x8',
    'Tempo 4×8',
    'Four 8-minute tempo blocks at 81% FTP with 2-min floats. High total tempo volume in a compact session — strong mid-week quality stimulus.',
    [
      seg('w',  'warmup',   360, ramp(0.55, 0.78), '6 min warmup ramp'),
      seg('t1', 'steady',   480, pct(0.80),          '8 min tempo @ 80% FTP'),
      seg('r1', 'recovery', 120, pct(0.55),           '2 min float'),
      seg('t2', 'steady',   480, pct(0.81),           '8 min tempo @ 81% FTP'),
      seg('r2', 'recovery', 120, pct(0.55),           '2 min float'),
      seg('t3', 'steady',   480, pct(0.82),           '8 min tempo @ 82% FTP'),
      seg('r3', 'recovery', 120, pct(0.55),           '2 min float'),
      seg('t4', 'steady',   480, pct(0.83),           '8 min tempo @ 83% FTP'),
      seg('c',  'cooldown', 240, ramp(0.65, 0.45),  '4 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-mountain-sim',
    'Mountain Tempo',
    '40-min sustained Z3 tempo at 83% FTP with a low cadence to simulate a long Alpine climb. Build climbing-specific tempo endurance.',
    [
      seg('w', 'warmup',   480, ramp(0.54, 0.76), '8 min warmup ramp', 82),
      seg('t', 'steady',  2400, pct(0.83),          '40 min mountain tempo @ 83% FTP', 68),
      seg('c', 'cooldown', 240, ramp(0.68, 0.46),  '4 min cooldown', 88),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-breakaway-sim',
    'Breakaway Simulator',
    'Five 6-min tempo blocks with 2-min rests — simulates the repeated effort of bridging to, then staying in, a race breakaway.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.78), '7 min warmup ramp'),
      seg('t1', 'steady',   360, pct(0.82),          '6 min breakaway effort @ 82% FTP'),
      seg('r1', 'recovery', 120, pct(0.56),           '2 min recovery'),
      seg('t2', 'steady',   360, pct(0.83),           '6 min breakaway effort @ 83% FTP'),
      seg('r2', 'recovery', 120, pct(0.56),           '2 min recovery'),
      seg('t3', 'steady',   360, pct(0.84),           '6 min breakaway effort @ 84% FTP'),
      seg('r3', 'recovery', 120, pct(0.56),           '2 min recovery'),
      seg('t4', 'steady',   360, pct(0.83),           '6 min breakaway effort @ 83% FTP'),
      seg('r4', 'recovery', 120, pct(0.55),           '2 min recovery'),
      seg('t5', 'steady',   360, pct(0.84),           '6 min breakaway effort @ 84% FTP'),
      seg('c',  'cooldown', 300, ramp(0.65, 0.45),  '5 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-aerobic-threshold-builder',
    'Aerobic Threshold Builder',
    '55-min ride at the upper edge of Z2 / lower Z3 (72-76% FTP). Raises the ceiling of your aerobic zone — the foundation for all threshold improvements.',
    [
      seg('w',  'warmup',   360, ramp(0.52, 0.70), '6 min warmup ramp'),
      seg('s1', 'steady',  1200, pct(0.72),          '20 min @ 72% FTP'),
      seg('s2', 'steady',  1200, pct(0.74),           '20 min @ 74% FTP'),
      seg('s3', 'steady',   600, pct(0.76),           '10 min @ 76% FTP'),
      seg('c',  'cooldown', 300, ramp(0.65, 0.46),  '5 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-surge-45',
    'Tempo with Surges',
    '45-min session: 20 min steady tempo with six 30-second threshold surges distributed throughout. Keeps your fast-twitch fibres awake inside a tempo effort.',
    [
      seg('w',   'warmup',   420, ramp(0.54, 0.78), '7 min warmup ramp'),
      seg('t1',  'steady',   180, pct(0.82),          '3 min tempo'),
      seg('s1',  'interval',  30, pct(1.02),          '30s surge @ 102% FTP'),
      seg('t2',  'steady',   180, pct(0.82),          '3 min tempo'),
      seg('s2',  'interval',  30, pct(1.02),          '30s surge @ 102% FTP'),
      seg('t3',  'steady',   180, pct(0.82),          '3 min tempo'),
      seg('s3',  'interval',  30, pct(1.02),          '30s surge @ 102% FTP'),
      seg('t4',  'steady',   180, pct(0.82),          '3 min tempo'),
      seg('s4',  'interval',  30, pct(1.02),          '30s surge @ 102% FTP'),
      seg('t5',  'steady',   180, pct(0.82),          '3 min tempo'),
      seg('s5',  'interval',  30, pct(1.04),          '30s surge @ 104% FTP'),
      seg('t6',  'steady',   180, pct(0.82),          '3 min tempo'),
      seg('s6',  'interval',  30, pct(1.04),          '30s surge @ 104% FTP'),
      seg('t7',  'steady',   600, pct(0.80),           '10 min tempo finish'),
      seg('c',   'cooldown', 240, ramp(0.65, 0.45),  '4 min cooldown'),
    ],
    'tempo',
  ),

  build(
    'preset-tempo-cruise-60',
    'Tempo Cruise 60',
    '60-min ride with 40 minutes in the Z3 tempo zone. One long sustained block — no recovery intervals, just sustained effort and honest pacing.',
    [
      seg('w', 'warmup',   600, ramp(0.54, 0.79), '10 min warmup ramp'),
      seg('t', 'steady',  2400, pct(0.81),          '40 min cruise tempo @ 81% FTP'),
      seg('c', 'cooldown', 600, ramp(0.68, 0.46),  '10 min cooldown'),
    ],
    'tempo',
  ),

  // ── Sweet Spot / Threshold extended ─────────────────────────────────────
  build(
    'preset-sweet-spot-1x30',
    'Sweet Spot 1×30',
    '30-minute unbroken sweet-spot effort at 89% FTP. Tests your ability to hold a hard but sub-threshold effort for an extended duration — the race-simulation standard.',
    [
      seg('w', 'warmup',   480, ramp(0.56, 0.82), '8 min warmup ramp'),
      seg('s', 'interval',1800, pct(0.89),          '30 min @ 89% FTP'),
      seg('c', 'cooldown', 420, ramp(0.60, 0.44),  '7 min cooldown'),
    ],
    'sweetspot',
  ),

  build(
    'preset-sweet-spot-5x6',
    'Sweet Spot 5×6',
    'Five 6-minute sweet-spot intervals with 90-second recovery. High total volume (30 min in zone) with short breaks — challenging accumulation workout.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.82), '7 min warmup ramp'),
      seg('s1', 'interval', 360, pct(0.90),          '6 min @ 90% FTP'),
      seg('r1', 'recovery',  90, pct(0.55),           '90s recovery'),
      seg('s2', 'interval', 360, pct(0.90),           '6 min @ 90% FTP'),
      seg('r2', 'recovery',  90, pct(0.55),           '90s recovery'),
      seg('s3', 'interval', 360, pct(0.91),           '6 min @ 91% FTP'),
      seg('r3', 'recovery',  90, pct(0.55),           '90s recovery'),
      seg('s4', 'interval', 360, pct(0.91),           '6 min @ 91% FTP'),
      seg('r4', 'recovery',  90, pct(0.55),           '90s recovery'),
      seg('s5', 'interval', 360, pct(0.92),           '6 min @ 92% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.44),  '5 min cooldown'),
    ],
    'sweetspot',
  ),

  build(
    'preset-threshold-builder-2x15',
    'Threshold Builder 2×15',
    'Two 15-minute threshold blocks at 100% FTP with 5-min recovery. The next step after 2×12 — more time at FTP drives stronger adaptation without total blow-up.',
    [
      seg('w',  'warmup',   420, ramp(0.55, 0.86), '7 min warmup ramp'),
      seg('t1', 'interval', 900, pct(1.00),          '15 min @ 100% FTP'),
      seg('r',  'recovery', 300, pct(0.55),           '5 min recovery'),
      seg('t2', 'interval', 900, pct(1.00),           '15 min @ 100% FTP'),
      seg('c',  'cooldown', 360, ramp(0.58, 0.42),  '6 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-threshold-5x5',
    'Threshold 5×5',
    'Five 5-minute threshold intervals with 2.5-minute recovery. High repetition makes each effort feel manageable while accumulating 25 minutes at FTP.',
    [
      seg('w',  'warmup',   360, ramp(0.55, 0.86), '6 min warmup ramp'),
      seg('t1', 'interval', 300, pct(1.00),          '5 min @ 100% FTP'),
      seg('r1', 'recovery', 150, pct(0.55),           '2.5 min recovery'),
      seg('t2', 'interval', 300, pct(1.00),           '5 min @ 100% FTP'),
      seg('r2', 'recovery', 150, pct(0.55),           '2.5 min recovery'),
      seg('t3', 'interval', 300, pct(1.01),           '5 min @ 101% FTP'),
      seg('r3', 'recovery', 150, pct(0.55),           '2.5 min recovery'),
      seg('t4', 'interval', 300, pct(1.01),           '5 min @ 101% FTP'),
      seg('r4', 'recovery', 150, pct(0.55),           '2.5 min recovery'),
      seg('t5', 'interval', 300, pct(1.02),           '5 min @ 102% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.44),  '5 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-demolition',
    'Demolition',
    '3×15-min threshold blocks at 102% FTP with 4-min recoveries. The biggest threshold stimulus in the catalog — reserve for your highest fitness days.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.86), '8 min warmup ramp'),
      seg('t1', 'interval', 900, pct(1.02),          '15 min @ 102% FTP'),
      seg('r1', 'recovery', 240, pct(0.55),           '4 min recovery'),
      seg('t2', 'interval', 900, pct(1.02),           '15 min @ 102% FTP'),
      seg('r2', 'recovery', 240, pct(0.55),           '4 min recovery'),
      seg('t3', 'interval', 900, pct(1.03),           '15 min @ 103% FTP'),
      seg('c',  'cooldown', 360, ramp(0.60, 0.44),  '6 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-bear-trap',
    'Bear Trap',
    '9 × 3-min threshold intervals at 103% FTP with 90-second rest. The short recovery is the trap — lactate accumulates relentlessly. Go steady on the early reps.',
    [
      seg('w',  'warmup',   480, ramp(0.55, 0.86), '8 min warmup ramp'),
      ...intervalSet('bt', 9, 180, 90, pct(1.03), pct(0.55), '3 min @ 103% FTP', '90s recovery'),
      seg('c',  'cooldown', 360, ramp(0.60, 0.44), '6 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-sweet-spot-over-under-blend',
    'SS Over-Under Blend',
    'Four sets alternating 3-min sweet-spot "under" at 90% FTP with 2-min "over" at 104% FTP. Teaches lactate buffering at the threshold crossover.',
    [
      seg('w',   'warmup',   420, ramp(0.55, 0.84), '7 min warmup ramp'),
      ...overUnderSet('ou1', 4, 180, 120, pct(0.90), pct(1.04), 'SS over-under set 1'),
      seg('r1',  'recovery', 240, pct(0.55),          '4 min recovery'),
      ...overUnderSet('ou2', 4, 180, 120, pct(0.90), pct(1.04), 'SS over-under set 2'),
      seg('c',   'cooldown', 360, ramp(0.60, 0.44), '6 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-threshold-ramp-30',
    'Threshold Ramp 30',
    'Continuous ramp from 90% to 107% FTP over 20 minutes, then steady finish at 100%. Tests your ability to pace through rising intensity — a mental and physical challenge.',
    [
      seg('w', 'warmup',   480, ramp(0.55, 0.88), '8 min warmup ramp'),
      seg('r', 'ramp',    1200, ramp(0.90, 1.07),  '20 min ramp 90→107% FTP'),
      seg('t', 'interval', 300, pct(1.00),           '5 min hold @ 100% FTP'),
      seg('c', 'cooldown', 300, ramp(0.62, 0.44),  '5 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-9-anvils',
    '9 Anvils',
    '9 × 5-min blocks alternating between 95% and 105% FTP with 1-min recovery — relentless accumulation of threshold stress. Only for your best days.',
    [
      seg('w',   'warmup',   480, ramp(0.55, 0.87), '8 min warmup ramp'),
      seg('a1',  'interval', 300, pct(0.95),          'Anvil 1 @ 95% FTP'),
      seg('r1',  'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('a2',  'interval', 300, pct(1.05),           'Anvil 2 @ 105% FTP'),
      seg('r2',  'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('a3',  'interval', 300, pct(0.95),           'Anvil 3 @ 95% FTP'),
      seg('r3',  'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('a4',  'interval', 300, pct(1.05),           'Anvil 4 @ 105% FTP'),
      seg('r4',  'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('a5',  'interval', 300, pct(0.95),           'Anvil 5 @ 95% FTP'),
      seg('r5',  'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('a6',  'interval', 300, pct(1.05),           'Anvil 6 @ 105% FTP'),
      seg('r6',  'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('a7',  'interval', 300, pct(0.97),           'Anvil 7 @ 97% FTP'),
      seg('r7',  'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('a8',  'interval', 300, pct(1.06),           'Anvil 8 @ 106% FTP'),
      seg('r8',  'recovery',  60, pct(0.55),           '1 min recovery'),
      seg('a9',  'interval', 300, pct(0.98),           'Anvil 9 @ 98% FTP — hold on'),
      seg('c',   'cooldown', 360, ramp(0.60, 0.44), '6 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-threshold-long-1x25',
    'Long Threshold 1×25',
    '25-min unbroken effort at 100% FTP — the single hardest sustained workout in the catalog. A true test of threshold fitness and mental fortitude.',
    [
      seg('w', 'warmup',   480, ramp(0.55, 0.87), '8 min warmup ramp'),
      seg('t', 'interval',1500, pct(1.00),          '25 min @ 100% FTP — hold on'),
      seg('c', 'cooldown', 420, ramp(0.60, 0.44), '7 min cooldown'),
    ],
    'threshold',
  ),

  // ── VO2 Max extended ─────────────────────────────────────────────────────
  build(
    'preset-vo2-5x5',
    'VO2 Max 5×5',
    'Five 5-minute VO2-max intervals at 108% FTP with 5-min full recovery. Classic Billat protocol — the gold standard for VO2max development.',
    [
      seg('w', 'warmup',   600, ramp(0.50, 0.82), '10 min warmup ramp'),
      ...intervalSet('v', 5, 300, 300, pct(1.08), pct(0.50), '5 min @ 108% FTP', '5 min full recovery'),
      seg('c', 'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-4x6',
    'VO2 Max 4×6',
    'Four 6-minute VO2-max intervals at 107% FTP with equal recovery. Maximises time in the VO2-max zone per session — best saved for peak fitness.',
    [
      seg('w', 'warmup',   600, ramp(0.50, 0.82), '10 min warmup ramp'),
      ...intervalSet('v', 4, 360, 360, pct(1.07), pct(0.50), '6 min @ 107% FTP', '6 min recovery'),
      seg('c', 'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-micro-burst-15s',
    'VO2 Micro-Bursts 15/15',
    '3 × 12 reps of 15s on / 15s off at 125% FTP. Accumulates VO2-max time without the deep glycogen depletion of longer intervals — tolerable training load, massive stimulus.',
    [
      seg('w',  'warmup',   480, ramp(0.50, 0.80), '8 min warmup ramp'),
      ...intervalSet('m1', 12, 15, 15, pct(1.25), pct(0.55), '15s @ 125% FTP', '15s @ 55%'),
      seg('r1', 'recovery', 240, pct(0.50),          '4 min full recovery'),
      ...intervalSet('m2', 12, 15, 15, pct(1.25), pct(0.55), '15s @ 125% FTP', '15s @ 55%'),
      seg('r2', 'recovery', 240, pct(0.50),           '4 min full recovery'),
      ...intervalSet('m3', 12, 15, 15, pct(1.25), pct(0.55), '15s @ 125% FTP', '15s @ 55%'),
      seg('c',  'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-4x4-norwegian',
    '4×4 Norwegian',
    'The original Norwegian VO2-max protocol — 4 × 4-min at 90-95% of maxHR (approx 110% FTP) with 3-min active recovery. Proven to maximally elevate VO2max.',
    [
      seg('w',  'warmup',   600, ramp(0.50, 0.82), '10 min warmup ramp'),
      seg('i1', 'interval', 240, pct(1.10),          '4 min @ 110% FTP'),
      seg('r1', 'recovery', 180, pct(0.60),           '3 min active recovery'),
      seg('i2', 'interval', 240, pct(1.10),           '4 min @ 110% FTP'),
      seg('r2', 'recovery', 180, pct(0.60),           '3 min active recovery'),
      seg('i3', 'interval', 240, pct(1.11),           '4 min @ 111% FTP'),
      seg('r3', 'recovery', 180, pct(0.60),           '3 min active recovery'),
      seg('i4', 'interval', 240, pct(1.11),           '4 min @ 111% FTP'),
      seg('c',  'cooldown', 480, ramp(0.60, 0.44), '8 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-ascending-ladder',
    'VO2 Ascending Ladder',
    'Intervals that climb from 2→3→4→5 minutes at 112% FTP with equal recovery. Each rep is harder than the last — tests pacing and builds VO2 from multiple time domains.',
    [
      seg('w',  'warmup',   540, ramp(0.50, 0.82), '9 min warmup ramp'),
      seg('i1', 'interval', 120, pct(1.12),          '2 min @ 112% FTP'),
      seg('r1', 'recovery', 120, pct(0.52),           '2 min recovery'),
      seg('i2', 'interval', 180, pct(1.12),           '3 min @ 112% FTP'),
      seg('r2', 'recovery', 180, pct(0.52),           '3 min recovery'),
      seg('i3', 'interval', 240, pct(1.12),           '4 min @ 112% FTP'),
      seg('r3', 'recovery', 240, pct(0.52),           '4 min recovery'),
      seg('i4', 'interval', 300, pct(1.12),           '5 min @ 112% FTP'),
      seg('c',  'cooldown', 360, ramp(0.55, 0.40), '6 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-3x8-blocks',
    'VO2 3×8 Blocks',
    'Three 8-min VO2-max intervals at 106% FTP with 8-min recovery. The longer block duration forces you to spend more consecutive time at true VO2max pace.',
    [
      seg('w',  'warmup',   600, ramp(0.50, 0.82), '10 min warmup ramp'),
      seg('i1', 'interval', 480, pct(1.06),          '8 min @ 106% FTP'),
      seg('r1', 'recovery', 480, pct(0.50),           '8 min recovery'),
      seg('i2', 'interval', 480, pct(1.06),           '8 min @ 106% FTP'),
      seg('r2', 'recovery', 480, pct(0.50),           '8 min recovery'),
      seg('i3', 'interval', 480, pct(1.07),           '8 min @ 107% FTP'),
      seg('c',  'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-40-20-extended',
    'VO2 Extended 40/20',
    '4 sets of 10 × 40/20s at 118% FTP. A taxing but volume-efficient way to accumulate VO2-max time — the extended version for well-trained athletes.',
    [
      seg('w',  'warmup',   600, ramp(0.50, 0.82), '10 min warmup ramp'),
      ...intervalSet('a1', 10, 40, 20, pct(1.18), pct(0.55), '40s @ 118% FTP', '20s @ 55%'),
      seg('r1', 'recovery', 240, pct(0.50),          '4 min full recovery'),
      ...intervalSet('a2', 10, 40, 20, pct(1.18), pct(0.55), '40s @ 118% FTP', '20s @ 55%'),
      seg('r2', 'recovery', 240, pct(0.50),           '4 min full recovery'),
      ...intervalSet('a3', 10, 40, 20, pct(1.18), pct(0.55), '40s @ 118% FTP', '20s @ 55%'),
      seg('r3', 'recovery', 240, pct(0.50),           '4 min full recovery'),
      ...intervalSet('a4', 10, 40, 20, pct(1.18), pct(0.55), '40s @ 118% FTP', '20s @ 55%'),
      seg('c',  'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-crisscross',
    'VO2 Crisscross',
    'Intervals that alternate between 110% and 95% FTP every 90 seconds — forces repeated transitions across the VO2-max threshold. Develops lactate dynamics from both sides.',
    [
      seg('w',   'warmup',   480, ramp(0.50, 0.82), '8 min warmup ramp'),
      seg('h1',  'interval',  90, pct(1.10),          '90s @ 110% FTP'),
      seg('l1',  'recovery',  90, pct(0.95),           '90s @ 95% FTP'),
      seg('h2',  'interval',  90, pct(1.10),           '90s @ 110% FTP'),
      seg('l2',  'recovery',  90, pct(0.95),           '90s @ 95% FTP'),
      seg('h3',  'interval',  90, pct(1.10),           '90s @ 110% FTP'),
      seg('l3',  'recovery',  90, pct(0.95),           '90s @ 95% FTP'),
      seg('h4',  'interval',  90, pct(1.10),           '90s @ 110% FTP'),
      seg('l4',  'recovery',  90, pct(0.95),           '90s @ 95% FTP'),
      seg('r1',  'recovery', 240, pct(0.52),           '4 min full recovery'),
      seg('h5',  'interval',  90, pct(1.10),           '90s @ 110% FTP'),
      seg('l5',  'recovery',  90, pct(0.95),           '90s @ 95% FTP'),
      seg('h6',  'interval',  90, pct(1.10),           '90s @ 110% FTP'),
      seg('l6',  'recovery',  90, pct(0.95),           '90s @ 95% FTP'),
      seg('h7',  'interval',  90, pct(1.10),           '90s @ 110% FTP'),
      seg('l7',  'recovery',  90, pct(0.95),           '90s @ 95% FTP'),
      seg('h8',  'interval',  90, pct(1.10),           '90s @ 110% FTP'),
      seg('l8',  'recovery',  90, pct(0.95),           '90s @ 95% FTP'),
      seg('c',   'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-vo2-30-30-extended',
    '30/30 Extended',
    '3 × 15 reps of 30/30s at 128% FTP — more total VO2 time than the standard 20-rep version. For well-trained athletes who have outgrown the original.',
    [
      seg('w',  'warmup',   600, ramp(0.50, 0.82), '10 min warmup ramp'),
      ...intervalSet('x1', 15, 30, 30, pct(1.28), pct(0.55), '30s @ 128% FTP', '30s @ 55%'),
      seg('r1', 'recovery', 240, pct(0.50),          '4 min full recovery'),
      ...intervalSet('x2', 15, 30, 30, pct(1.28), pct(0.55), '30s @ 128% FTP', '30s @ 55%'),
      seg('r2', 'recovery', 240, pct(0.50),           '4 min full recovery'),
      ...intervalSet('x3', 15, 30, 30, pct(1.28), pct(0.55), '30s @ 128% FTP', '30s @ 55%'),
      seg('c',  'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  // ── Sprint / Anaerobic extended ──────────────────────────────────────────
  build(
    'preset-sprint-atp-10s',
    'ATP Sprints 10s',
    '10 × 10-second maximal ATP-phosphocreatine sprints with 4-min full recovery. Pure neuromuscular power development — go all-out every rep.',
    [
      seg('w', 'warmup',   600, ramp(0.50, 0.72), '10 min warmup ramp', 90),
      ...intervalSet('s', 10, 10, 240, pct(1.80), pct(0.45), '10s ATP sprint @ 180% FTP', '4 min full recovery'),
      seg('c', 'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-sprint-30s-power',
    '30s Power Sprints',
    '6 × 30-second maximal power sprints with 4.5-min full recovery. Develops the Wingate-style anaerobic power essential for criterium racing and final kilometre attacks.',
    [
      seg('w', 'warmup',   540, ramp(0.50, 0.72), '9 min warmup ramp', 90),
      ...intervalSet('s', 6, 30, 270, pct(1.50), pct(0.45), '30s max sprint @ 150% FTP', '4.5 min full recovery'),
      seg('c', 'cooldown', 300, ramp(0.55, 0.40), '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-sprint-standing-starts',
    'Standing Starts',
    '8 × 20-second seated/standing acceleration sprints from low speed with 3-min recovery. Trains the force-velocity relationship at the top of the power curve.',
    [
      seg('w', 'warmup',   600, ramp(0.50, 0.72), '10 min warmup ramp'),
      ...intervalSet('s', 8, 20, 180, pct(1.60), pct(0.48), '20s sprint @ 160% FTP', '3 min recovery'),
      seg('c', 'cooldown', 240, ramp(0.55, 0.40), '4 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-sprint-criterium-sim',
    'Criterium Simulator',
    'Six rounds of crit-style effort: 10s sprint + 50s hard riding (120% FTP) + 3-min tempo recovery. Trains the unique demands of repeated-sprint crit racing.',
    [
      seg('w',  'warmup',   480, ramp(0.52, 0.78), '8 min warmup ramp'),
      seg('s1', 'interval',  10, pct(1.70),          'Crit sprint 1 @ 170% FTP'),
      seg('h1', 'interval',  50, pct(1.20),           '50s hard riding @ 120% FTP'),
      seg('r1', 'recovery', 180, pct(0.75),           '3 min tempo recovery'),
      seg('s2', 'interval',  10, pct(1.70),           'Crit sprint 2 @ 170% FTP'),
      seg('h2', 'interval',  50, pct(1.20),           '50s hard riding @ 120% FTP'),
      seg('r2', 'recovery', 180, pct(0.75),           '3 min tempo recovery'),
      seg('s3', 'interval',  10, pct(1.70),           'Crit sprint 3 @ 170% FTP'),
      seg('h3', 'interval',  50, pct(1.20),           '50s hard riding @ 120% FTP'),
      seg('r3', 'recovery', 180, pct(0.75),           '3 min tempo recovery'),
      seg('s4', 'interval',  10, pct(1.70),           'Crit sprint 4 @ 170% FTP'),
      seg('h4', 'interval',  50, pct(1.20),           '50s hard riding @ 120% FTP'),
      seg('r4', 'recovery', 180, pct(0.75),           '3 min tempo recovery'),
      seg('s5', 'interval',  10, pct(1.70),           'Crit sprint 5 @ 170% FTP'),
      seg('h5', 'interval',  50, pct(1.20),           '50s hard riding @ 120% FTP'),
      seg('r5', 'recovery', 180, pct(0.75),           '3 min tempo recovery'),
      seg('s6', 'interval',  10, pct(1.80),           'Crit sprint 6 — final lap'),
      seg('h6', 'interval',  50, pct(1.25),           '50s hard riding @ 125% FTP'),
      seg('c',  'cooldown', 300, ramp(0.60, 0.42),  '5 min cooldown'),
    ],
    'intervals',
  ),

  build(
    'preset-anaerobic-capacity-block',
    'Anaerobic Capacity Block',
    '4 sets of 3 × 60s maximal anaerobic intervals at 140% FTP with 2-min recovery and 4-min set rest. Builds and sustains peak anaerobic capacity over accumulated fatigue.',
    [
      seg('w',   'warmup',   480, ramp(0.52, 0.78), '8 min warmup ramp'),
      ...intervalSet('b1', 3, 60, 120, pct(1.40), pct(0.50), '60s @ 140% FTP', '2 min recovery'),
      seg('r1',  'recovery', 240, pct(0.50),          '4 min set recovery'),
      ...intervalSet('b2', 3, 60, 120, pct(1.40), pct(0.50), '60s @ 140% FTP', '2 min recovery'),
      seg('r2',  'recovery', 240, pct(0.50),           '4 min set recovery'),
      ...intervalSet('b3', 3, 60, 120, pct(1.40), pct(0.50), '60s @ 140% FTP', '2 min recovery'),
      seg('c',   'cooldown', 360, ramp(0.58, 0.42), '6 min cooldown'),
    ],
    'intervals',
  ),

  // ── Mixed / Free-Ride with Structure ─────────────────────────────────────
  build(
    'preset-freeride-progression-60',
    'Freeride Progression 60',
    '60-min structured freeride that builds intensity in thirds: Z2, Z3, then Z4 finish. Great for riders who want variety and a satisfying final push.',
    [
      seg('w',  'warmup',   300, ramp(0.50, 0.64), '5 min warmup ramp'),
      seg('z2', 'steady',  1200, pct(0.67),          '20 min Z2 @ 67% FTP'),
      seg('z3', 'steady',  1200, pct(0.81),           '20 min Z3 @ 81% FTP'),
      seg('z4', 'steady',   900, pct(0.96),           '15 min Z4 @ 96% FTP'),
      seg('c',  'cooldown', 300, ramp(0.65, 0.44),  '5 min cooldown'),
    ],
    'custom',
  ),

  build(
    'preset-mixed-energy-systems',
    'Mixed Energy Systems',
    'A complete workout hitting every energy system: Z2 base, tempo block, sweet spot, threshold, and VO2 micro-intervals — in 60 minutes. Great for variety blocks.',
    [
      seg('w',  'warmup',   360, ramp(0.50, 0.78), '6 min warmup ramp'),
      seg('z2', 'steady',   600, pct(0.67),          '10 min Z2 @ 67% FTP'),
      seg('t',  'steady',   480, pct(0.81),           '8 min tempo @ 81% FTP'),
      seg('ss', 'interval', 360, pct(0.90),           '6 min sweet spot @ 90% FTP'),
      seg('r1', 'recovery', 120, pct(0.55),           '2 min recovery'),
      seg('th', 'interval', 300, pct(1.00),           '5 min threshold @ 100% FTP'),
      seg('r2', 'recovery', 180, pct(0.52),           '3 min recovery'),
      ...intervalSet('v', 6, 30, 30, pct(1.25), pct(0.55), '30s VO2 @ 125% FTP', '30s float'),
      seg('c',  'cooldown', 360, ramp(0.58, 0.42), '6 min cooldown'),
    ],
    'custom',
  ),

  build(
    'preset-gran-fondo-prep',
    'Gran Fondo Prep',
    'Simulates the demands of a 3-4 hour gran fondo in 75 minutes: long Z2 base, two sustained Z3 climbs, a punchy threshold finish, and sweet-spot work throughout.',
    [
      seg('w',  'warmup',   360, ramp(0.52, 0.66), '6 min warmup ramp'),
      seg('b1', 'steady',   900, pct(0.67),          '15 min Z2 base'),
      seg('c1', 'steady',   600, pct(0.82),           '10 min Z3 climb @ 82% FTP', 70),
      seg('d1', 'steady',   300, pct(0.60),           '5 min descent @ 60% FTP', 92),
      seg('b2', 'steady',   600, pct(0.67),           '10 min Z2 base'),
      seg('c2', 'steady',   600, pct(0.84),           '10 min Z3 climb @ 84% FTP', 70),
      seg('d2', 'steady',   300, pct(0.60),           '5 min descent @ 60% FTP', 92),
      seg('b3', 'steady',   600, pct(0.68),           '10 min Z2 base'),
      seg('f',  'interval', 300, pct(1.00),           '5 min threshold finish @ 100% FTP'),
      seg('c',  'cooldown', 300, ramp(0.62, 0.44),  '5 min cooldown'),
    ],
    'custom',
  ),

  build(
    'preset-race-simulation-75',
    'Race Simulation 75',
    'Simulates the power profile of a 75-min road race: breakaway surges, peloton tempo, a climb at threshold, and a sprint finish. No two intervals the same.',
    [
      seg('w',  'warmup',   420, ramp(0.52, 0.78), '7 min warmup ramp'),
      seg('n1', 'steady',   480, pct(0.76),          '8 min peloton pace @ 76% FTP'),
      seg('a1', 'interval', 120, pct(1.18),           '2 min attack @ 118% FTP'),
      seg('r1', 'recovery', 180, pct(0.60),           '3 min tempo recovery'),
      seg('n2', 'steady',   600, pct(0.79),           '10 min race pace @ 79% FTP'),
      seg('cl', 'interval', 480, pct(0.98),           '8 min threshold climb @ 98% FTP', 68),
      seg('r2', 'steady',   300, pct(0.62),           '5 min descent @ 62% FTP', 90),
      seg('n3', 'steady',   480, pct(0.78),           '8 min peloton chase @ 78% FTP'),
      seg('a2', 'interval',  60, pct(1.20),           '1 min race attack @ 120% FTP'),
      seg('r3', 'recovery', 180, pct(0.62),           '3 min recovery'),
      seg('sp', 'interval',  30, pct(1.60),           '30s sprint finish @ 160% FTP'),
      seg('c',  'cooldown', 300, ramp(0.62, 0.44),  '5 min cooldown'),
    ],
    'custom',
  ),

  build(
    'preset-crit-race-warmup',
    'Crit Race Warm-Up',
    '20-min pre-race warm-up that opens the legs with a progressive ramp, a short threshold effort, and two sprint openers. Shows up to the start line ready.',
    [
      seg('w',  'warmup',   480, ramp(0.50, 0.85), '8 min ramp to threshold'),
      seg('t',  'interval', 180, pct(1.00),          '3 min threshold opener'),
      seg('r',  'recovery', 180, pct(0.50),           '3 min recovery'),
      seg('s1', 'interval',  20, pct(1.50),           '20s sprint opener 1'),
      seg('r1', 'recovery', 100, pct(0.50),           '1.5 min recovery'),
      seg('s2', 'interval',  20, pct(1.50),           '20s sprint opener 2 — race start'),
      seg('c',  'cooldown', 160, ramp(0.55, 0.42),  '2.5 min easy ride to line'),
    ],
    'custom',
  ),

  build(
    'preset-mixed-endurance-intervals-75',
    'Endurance Interval Mix 75',
    '75-min ride that sandwiches two threshold intervals inside a long Z2 base. Builds both aerobic volume and threshold fitness in one efficient session.',
    [
      seg('w',  'warmup',   420, ramp(0.52, 0.78), '7 min warmup ramp'),
      seg('b1', 'steady',  1200, pct(0.68),          '20 min Z2 base'),
      seg('t1', 'interval', 600, pct(1.00),           '10 min threshold @ 100% FTP'),
      seg('r',  'recovery', 300, pct(0.55),           '5 min recovery'),
      seg('t2', 'interval', 600, pct(1.00),           '10 min threshold @ 100% FTP'),
      seg('b2', 'steady',  1200, pct(0.68),           '20 min Z2 base'),
      seg('c',  'cooldown', 180, ramp(0.62, 0.44),  '3 min cooldown'),
    ],
    'custom',
  ),

  build(
    'preset-gravel-race-prep',
    'Gravel Race Prep',
    'Long-effort workout simulating gravel race demands: extended Z2 base, two sustained sweet-spot efforts mimicking punchy climbs, and a big final surge.',
    [
      seg('w',  'warmup',   360, ramp(0.52, 0.68), '6 min warmup ramp'),
      seg('b1', 'steady',  1200, pct(0.68),          '20 min Z2 base'),
      seg('ss1','interval', 720, pct(0.91),           '12 min sweet spot @ 91% FTP'),
      seg('r1', 'recovery', 300, pct(0.58),           '5 min recovery'),
      seg('b2', 'steady',   600, pct(0.68),           '10 min Z2 base'),
      seg('ss2','interval', 720, pct(0.92),           '12 min sweet spot @ 92% FTP'),
      seg('r2', 'recovery', 240, pct(0.58),           '4 min recovery'),
      seg('sg', 'interval', 120, pct(1.15),           '2 min big surge @ 115% FTP'),
      seg('c',  'cooldown', 240, ramp(0.62, 0.44),  '4 min cooldown'),
    ],
    'custom',
  ),

  build(
    'preset-structured-freeride-easy-70',
    'Easy Day + Openers',
    '70-min Z2 ride with four 30-second activation openers distributed throughout. Keeps the legs fresh while maintaining aerobic contact on easy days.',
    [
      seg('w',  'warmup',   360, ramp(0.50, 0.64), '6 min warmup ramp'),
      seg('b1', 'steady',   900, pct(0.66),          '15 min Z2 base'),
      seg('o1', 'interval',  30, pct(1.10),           '30s opener @ 110% FTP'),
      seg('b2', 'steady',   900, pct(0.66),           '15 min Z2 base'),
      seg('o2', 'interval',  30, pct(1.10),           '30s opener @ 110% FTP'),
      seg('b3', 'steady',   900, pct(0.68),           '15 min Z2 base'),
      seg('o3', 'interval',  30, pct(1.12),           '30s opener @ 112% FTP'),
      seg('b4', 'steady',   900, pct(0.68),           '15 min Z2 base'),
      seg('o4', 'interval',  30, pct(1.12),           '30s opener @ 112% FTP'),
      seg('c',  'cooldown', 360, ramp(0.60, 0.44),  '6 min cooldown'),
    ],
    'custom',
  ),

  // ── Additional threshold / test ───────────────────────────────────────────
  build(
    'preset-ftp-guesstimate-45',
    'FTP Guesstimate 45',
    '45-min session: 10-min ramp to gauge aerobic readiness, then a 20-min sub-maximal sustained effort at 95% FTP, then cooldown. Not a test — a calibration ride.',
    [
      seg('w', 'warmup',   600, ramp(0.50, 0.85), '10 min ramp'),
      seg('t', 'interval',1200, pct(0.95),          '20 min sustained @ 95% FTP'),
      seg('c', 'cooldown', 900, ramp(0.65, 0.44), '15 min cooldown'),
    ],
    'test',
  ),

  build(
    'preset-sweet-spot-opener',
    'Sweet Spot Opener',
    'Short 30-min session with a punchy sweet-spot block — ideal as a pre-race opener the day before a target event. Activates the system without creating fatigue.',
    [
      seg('w',  'warmup',   360, ramp(0.52, 0.84), '6 min warmup ramp'),
      seg('s1', 'interval', 240, pct(0.91),          '4 min sweet spot @ 91% FTP'),
      seg('r1', 'recovery', 120, pct(0.52),           '2 min recovery'),
      seg('s2', 'interval', 240, pct(0.92),           '4 min sweet spot @ 92% FTP'),
      seg('r2', 'recovery', 120, pct(0.52),           '2 min recovery'),
      seg('s3', 'interval', 240, pct(0.93),           '4 min sweet spot @ 93% FTP'),
      seg('c',  'cooldown', 420, ramp(0.60, 0.44),  '7 min cooldown'),
    ],
    'sweetspot',
  ),

  build(
    'preset-vo2-race-openers',
    'Race Day Openers',
    '20-min pre-race warm-up with VO2-level openers to fully prime the cardiovascular system. Shows up to the start with open lungs and primed fast-twitch fibres.',
    [
      seg('w',  'warmup',   360, ramp(0.50, 0.82), '6 min progressive ramp'),
      seg('o1', 'interval', 120, pct(1.12),          '2 min VO2 opener @ 112% FTP'),
      seg('r1', 'recovery', 120, pct(0.52),           '2 min recovery'),
      seg('o2', 'interval',  60, pct(1.15),           '1 min hard opener @ 115% FTP'),
      seg('r2', 'recovery', 120, pct(0.52),           '2 min recovery'),
      seg('s',  'interval',  15, pct(1.60),           '15s sprint activation @ 160% FTP'),
      seg('c',  'cooldown', 405, ramp(0.55, 0.44),  '6.75 min easy roll to line'),
    ],
    'custom',
  ),

  build(
    'preset-threshold-tempo-combo',
    'Threshold Tempo Combo',
    'Alternating threshold and tempo blocks — 5 min at 100% FTP followed by 8 min at 80% FTP, repeated three times. Teaches recovery at a still-demanding power output.',
    [
      seg('w',  'warmup',   420, ramp(0.54, 0.84), '7 min warmup ramp'),
      seg('t1', 'interval', 300, pct(1.00),          '5 min threshold @ 100% FTP'),
      seg('m1', 'steady',   480, pct(0.80),           '8 min tempo @ 80% FTP'),
      seg('t2', 'interval', 300, pct(1.00),           '5 min threshold @ 100% FTP'),
      seg('m2', 'steady',   480, pct(0.81),           '8 min tempo @ 81% FTP'),
      seg('t3', 'interval', 300, pct(1.01),           '5 min threshold @ 101% FTP'),
      seg('m3', 'steady',   480, pct(0.82),           '8 min tempo @ 82% FTP'),
      seg('c',  'cooldown', 360, ramp(0.62, 0.44),  '6 min cooldown'),
    ],
    'threshold',
  ),

  build(
    'preset-sweet-spot-time-trial',
    'Sweet Spot Time Trial',
    '45-min sustained effort at 91% FTP with no breaks. Develops the ability to sustain sub-maximal power for race durations — a key predictor of endurance performance.',
    [
      seg('w', 'warmup',   480, ramp(0.54, 0.84), '8 min warmup ramp'),
      seg('t', 'interval',2700, pct(0.91),          '45 min time-trial at sweet spot'),
      seg('c', 'cooldown', 300, ramp(0.62, 0.44), '5 min cooldown'),
    ],
    'sweetspot',
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
    out.push(seg(`${prefix}${i + 1}u`, 'steady',   underSec, underTarget, `${label}: ${i + 1}/${count} under`));
    out.push(seg(`${prefix}${i + 1}o`, 'interval', overSec,  overTarget,  `${label}: ${i + 1}/${count} over`));
  }
  return out;
}
