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
