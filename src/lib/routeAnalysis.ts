/**
 * routeAnalysis.ts
 *
 * Pure analysis helpers for RoutePreview. Derives gradient zones, notable
 * climbs, a climb category (HC / Cat 1-4, à la pro-cycling rules), and an
 * overall difficulty score from a loaded Route.
 *
 * All functions are pure and synchronous — safe to call inside useMemo.
 */

import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Gradient zone definitions
// ---------------------------------------------------------------------------

export interface GradientZone {
  /** Display label shown in the stacked bar. */
  label: string;
  /** Lower bound, inclusive (%). −Infinity for the descent bucket. */
  min: number;
  /** Upper bound, exclusive (%). +Infinity for the 12 %+ bucket. */
  max: number;
  /** Tailwind / CSS color token for this band. */
  color: string;
  /** Short label used in tooltip / legend. */
  shortLabel: string;
}

export const GRADIENT_ZONES: GradientZone[] = [
  { label: 'Descent',  shortLabel: '▼',       min: -Infinity, max: -1,   color: '#38bdf8' }, // sky-400
  { label: 'Flat',     shortLabel: '0–1 %',   min: -1,        max: 1,    color: '#94a3b8' }, // slate-400
  { label: '1–4 %',   shortLabel: '1–4 %',   min: 1,         max: 4,    color: '#4ade80' }, // green-400
  { label: '4–8 %',   shortLabel: '4–8 %',   min: 4,         max: 8,    color: '#facc15' }, // yellow-400
  { label: '8–12 %',  shortLabel: '8–12 %',  min: 8,         max: 12,   color: '#fb923c' }, // orange-400
  { label: '12 %+',   shortLabel: '12 %+',   min: 12,        max: Infinity, color: '#f43f5e' }, // rose-500
];

// ---------------------------------------------------------------------------
// Gradient zone breakdown
// ---------------------------------------------------------------------------

export interface ZoneBreakdown {
  zone: GradientZone;
  /** Distance in this zone, meters. */
  distanceM: number;
  /** Fraction of total distance [0, 1]. */
  fraction: number;
  /** Percentage of total distance. */
  pct: number;
}

/**
 * Walk every consecutive pair of route points and accumulate distance into
 * the appropriate gradient zone.
 */
export function computeZoneBreakdown(route: Route): ZoneBreakdown[] {
  const buckets = new Array<number>(GRADIENT_ZONES.length).fill(0);

  const pts = route.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segDist = b.distance - a.distance;
    if (segDist <= 0) continue;
    const grade = ((b.ele - a.ele) / segDist) * 100;
    const idx = GRADIENT_ZONES.findIndex((z) => grade >= z.min && grade < z.max);
    if (idx >= 0) buckets[idx] += segDist;
  }

  const total = route.totalDistance || 1;
  return GRADIENT_ZONES.map((zone, i) => ({
    zone,
    distanceM: buckets[i],
    fraction: buckets[i] / total,
    pct: (buckets[i] / total) * 100,
  }));
}

// ---------------------------------------------------------------------------
// Average & max gradient across the whole route
// ---------------------------------------------------------------------------

export interface GradientStats {
  avgGradient: number; // % — average of absolute uphill grades
  maxGradient: number; // % — max instantaneous grade (smoothed 50 m window)
}

export function computeGradientStats(route: Route): GradientStats {
  const pts = route.points;
  let sumGrade = 0;
  let sumDist = 0;
  let maxGrade = 0;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segDist = b.distance - a.distance;
    if (segDist <= 0) continue;
    const grade = ((b.ele - a.ele) / segDist) * 100;
    if (grade > 0) {
      sumGrade += grade * segDist;
      sumDist += segDist;
    }
    if (grade > maxGrade) maxGrade = grade;
  }

  return {
    avgGradient: sumDist > 0 ? sumGrade / sumDist : 0,
    maxGradient: maxGrade,
  };
}

// ---------------------------------------------------------------------------
// Climb detection & categorization
// ---------------------------------------------------------------------------

/**
 * Pro-cycling climb category based on VAM-equivalent scoring:
 *   score = length_km × avg_grade²
 *
 * Rough mappings (adapted from UCI + Strava convention):
 *   HC  : score >= 80
 *   Cat1: score >= 32
 *   Cat2: score >= 16
 *   Cat3: score >= 8
 *   Cat4: score >= 2
 */
export type ClimbCategory = 'HC' | 'Cat 1' | 'Cat 2' | 'Cat 3' | 'Cat 4';

export interface DetectedClimb {
  /** Start cumulative distance along the route, meters. */
  startDistance: number;
  /** End cumulative distance along the route, meters. */
  endDistance: number;
  /** Length of the climb, meters. */
  lengthM: number;
  /** Average gradient over the climb, %. */
  avgGrade: number;
  /** Maximum gradient within the climb, %. */
  maxGrade: number;
  /** Total elevation gain of this climb, meters. */
  elevationGainM: number;
  /** Computed difficulty score (length_km × avgGrade²). */
  score: number;
  /** UCI-style category. */
  category: ClimbCategory;
}

function climbScore(lengthM: number, avgGrade: number): number {
  return (lengthM / 1000) * avgGrade * avgGrade;
}

function categoryFromScore(score: number): ClimbCategory {
  if (score >= 80) return 'HC';
  if (score >= 32) return 'Cat 1';
  if (score >= 16) return 'Cat 2';
  if (score >= 8)  return 'Cat 3';
  return 'Cat 4';
}

/**
 * Detect notable climbs using a simple state machine:
 * - Enter a climb when grade >= CLIMB_THRESHOLD for at least MIN_LENGTH meters.
 * - Exit a climb when grade drops below -1 % or the descent is >= DESCENT_RESET meters.
 * - Only record climbs with score >= MIN_SCORE (filters out Cat 5 / bumps).
 */
const CLIMB_THRESHOLD_PCT = 2.5; // % grade to consider "climbing"
const MIN_CLIMB_LENGTH_M  = 400; // minimum 400 m to count
const MIN_CLIMB_SCORE     = 2;   // must be at least Cat 4

export function detectClimbs(route: Route): DetectedClimb[] {
  const pts = route.points;
  const climbs: DetectedClimb[] = [];

  let inClimb = false;
  let climbStart = 0;
  let climbStartEle = 0;
  let descendSince = 0; // meters of consecutive descent inside a climb

  // Per-segment accumulators
  let gainAcc = 0;
  let gradeWeightAcc = 0;
  let distAcc = 0;
  let localMaxGrade = 0;

  const DESCENT_RESET_M = 150; // descend > 150 m consecutively → end climb

  const finalizeClimb = (endIdx: number) => {
    const endDist = pts[endIdx].distance;
    const lengthM = endDist - climbStart;
    if (lengthM >= MIN_CLIMB_LENGTH_M && distAcc > 0) {
      const avgGrade = gradeWeightAcc / distAcc;
      const sc = climbScore(lengthM, avgGrade);
      if (sc >= MIN_CLIMB_SCORE) {
        climbs.push({
          startDistance: climbStart,
          endDistance: endDist,
          lengthM,
          avgGrade,
          maxGrade: localMaxGrade,
          elevationGainM: gainAcc,
          score: sc,
          category: categoryFromScore(sc),
        });
      }
    }
    inClimb = false;
    gainAcc = 0;
    gradeWeightAcc = 0;
    distAcc = 0;
    localMaxGrade = 0;
    descendSince = 0;
  };

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segDist = b.distance - a.distance;
    if (segDist <= 0) continue;
    const grade = ((b.ele - a.ele) / segDist) * 100;

    if (!inClimb) {
      if (grade >= CLIMB_THRESHOLD_PCT) {
        inClimb = true;
        climbStart = a.distance;
        climbStartEle = a.ele;
        gainAcc = Math.max(0, b.ele - a.ele);
        gradeWeightAcc = grade * segDist;
        distAcc = segDist;
        localMaxGrade = grade;
        descendSince = 0;
      }
    } else {
      if (grade < -1) {
        descendSince += segDist;
        if (descendSince >= DESCENT_RESET_M) {
          finalizeClimb(i);
        }
      } else {
        descendSince = 0;
        if (grade >= CLIMB_THRESHOLD_PCT) {
          gainAcc += Math.max(0, b.ele - a.ele);
          gradeWeightAcc += grade * segDist;
          distAcc += segDist;
          if (grade > localMaxGrade) localMaxGrade = grade;
        }
      }
    }
  }

  if (inClimb) finalizeClimb(pts.length - 1);

  // Deduplicate overlapping climbs (keep the higher-scored one)
  return deduplicateClimbs(climbs);
}

function deduplicateClimbs(climbs: DetectedClimb[]): DetectedClimb[] {
  // Sort by score descending
  const sorted = [...climbs].sort((a, b) => b.score - a.score);
  const kept: DetectedClimb[] = [];
  for (const c of sorted) {
    const overlaps = kept.some(
      (k) => c.startDistance < k.endDistance && c.endDistance > k.startDistance,
    );
    if (!overlaps) kept.push(c);
  }
  // Return in route order
  return kept.sort((a, b) => a.startDistance - b.startDistance);
}

// ---------------------------------------------------------------------------
// Overall difficulty rating
// ---------------------------------------------------------------------------

export type DifficultyLabel = 'Flat' | 'Easy' | 'Rolling' | 'Hilly' | 'Challenging' | 'Brutal';

export interface DifficultyRating {
  /** Numeric score 0..100. */
  score: number;
  label: DifficultyLabel;
  /** CSS color for the label. */
  color: string;
}

/**
 * Composite difficulty score:
 *   - 50 % from ascent-per-km (VAM proxy): 0 → 0, 20 m/km → 100
 *   - 30 % from avg uphill gradient: 0 → 0, 10 % avg → 100
 *   - 20 % from max gradient: 0 → 0, 20 % → 100
 */
export function computeDifficulty(route: Route, gradStats: GradientStats): DifficultyRating {
  const distKm = route.totalDistance / 1000 || 1;
  const ascentPerKm = route.ascent / distKm;

  const vadComponent = Math.min(ascentPerKm / 20, 1) * 50;
  const avgComponent = Math.min(gradStats.avgGradient / 10, 1) * 30;
  const maxComponent = Math.min(gradStats.maxGradient / 20, 1) * 20;

  const score = Math.round(vadComponent + avgComponent + maxComponent);

  let label: DifficultyLabel;
  let color: string;

  if (score < 8)  { label = 'Flat';        color = '#94a3b8'; }
  else if (score < 20) { label = 'Easy';   color = '#4ade80'; }
  else if (score < 35) { label = 'Rolling'; color = '#a3e635'; }
  else if (score < 52) { label = 'Hilly';  color = '#facc15'; }
  else if (score < 70) { label = 'Challenging'; color = '#fb923c'; }
  else                  { label = 'Brutal'; color = '#f43f5e'; }

  return { score, label, color };
}

// ---------------------------------------------------------------------------
// Elevation sparkline data (lightweight downsampled series)
// ---------------------------------------------------------------------------

export interface SparkPoint {
  d: number;   // cumulative distance, m
  ele: number; // elevation, m
}

/** Downsample route points to at most `maxPoints` for the mini sparkline. */
export function buildSparkline(route: Route, maxPoints = 120): SparkPoint[] {
  const pts = route.points;
  const N = pts.length;
  if (N === 0) return [];
  const step = Math.max(1, Math.floor(N / maxPoints));
  const out: SparkPoint[] = [];
  for (let i = 0; i < N; i += step) {
    out.push({ d: pts[i].distance, ele: pts[i].ele });
  }
  const last = pts[N - 1];
  if (out[out.length - 1]?.d !== last.distance) {
    out.push({ d: last.distance, ele: last.ele });
  }
  return out;
}
