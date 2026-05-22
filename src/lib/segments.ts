/**
 * segments.ts — Segment detection and time-computation logic.
 *
 * A "segment" is a named sub-stretch of a route. This module:
 *   1. Derives segments automatically from a route's notable climbs /
 *      sustained-gradient stretches, plus a full-route "Complete" segment.
 *   2. Computes a rider's elapsed time on each segment from TelemetrySample[].
 *
 * Keep this file pure (no React / Zustand imports) so it is trivially
 * unit-testable and safe to import anywhere.
 */

import type { Route, TelemetrySample } from '@/types';
import { elevationAt } from '@/lib/gradientCalculator';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type SegmentKind =
  | 'full'   // the entire route
  | 'climb'  // sustained uphill stretch
  | 'flat'   // gentle sustained section
  | 'custom'; // user-defined (reserved, not yet wired)

export interface Segment {
  /** Stable id derived from the route + start/end distance. */
  id: string;
  /** Human-readable name, e.g. "Complete Route" or "Col des Aravis Climb". */
  name: string;
  /** Distance along the route where the segment starts, metres. */
  startM: number;
  /** Distance along the route where the segment ends, metres. */
  endM: number;
  /** Length of the segment, metres. */
  lengthM: number;
  /** Elevation gain within this segment, metres. */
  ascentM: number;
  /** Average gradient of this segment, %. */
  avgGradient: number;
  kind: SegmentKind;
}

// ---------------------------------------------------------------------------
// Detection parameters (tunable)
// ---------------------------------------------------------------------------

/** Minimum length a climb must be to qualify as its own segment. */
const MIN_CLIMB_LENGTH_M = 500;

/** Minimum average gradient for a section to be called a "climb". */
const MIN_CLIMB_AVG_GRADIENT = 3.0; // %

/** Minimum elevation gain for a section to qualify as a climb. */
const MIN_CLIMB_ASCENT_M = 20;

/** Sampling interval when scanning the route for gradient changes. */
const SCAN_INTERVAL_M = 50;

/** Gradient window used when evaluating a scan position. */
const GRADIENT_WINDOW_M = 150;

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * Return a sorted list of Segment objects derived from the given route.
 * Always includes a full-route segment first, followed by any detected
 * climbs in route order.
 */
export function detectSegments(route: Route): Segment[] {
  const segments: Segment[] = [];

  // ---- Full-route segment ----
  const routeAscent = computeAscentInRange(route, 0, route.totalDistance);
  const routeGrad = route.totalDistance > 0
    ? (routeAscent / route.totalDistance) * 100
    : 0;

  segments.push({
    id: routeSegmentId(route.id, 0, route.totalDistance, 'full'),
    name: 'Complete Route',
    startM: 0,
    endM: route.totalDistance,
    lengthM: route.totalDistance,
    ascentM: routeAscent,
    avgGradient: routeGrad,
    kind: 'full',
  });

  // ---- Climb detection ----
  // Walk the route in SCAN_INTERVAL_M steps.  Build a gradient profile,
  // then merge adjacent "uphill" windows into candidate climbs.
  const steps = Math.floor(route.totalDistance / SCAN_INTERVAL_M);
  if (steps < 4) return segments; // route too short to subdivide

  // Compute gradient at each scan position (simple rise/run over window).
  const gradients: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = i * SCAN_INTERVAL_M;
    const d0 = Math.max(0, d - GRADIENT_WINDOW_M / 2);
    const d1 = Math.min(route.totalDistance, d + GRADIENT_WINDOW_M / 2);
    const span = d1 - d0;
    const grad = span > 0
      ? ((elevationAt(route, d1) - elevationAt(route, d0)) / span) * 100
      : 0;
    gradients.push(grad);
  }

  // Merge adjacent positions where gradient >= MIN_CLIMB_AVG_GRADIENT into
  // candidate climb runs.
  interface Run { start: number; end: number }
  const runs: Run[] = [];
  let runStart: number | null = null;

  for (let i = 0; i <= steps; i++) {
    const isUphill = gradients[i] >= MIN_CLIMB_AVG_GRADIENT;
    if (isUphill && runStart === null) {
      runStart = i;
    } else if (!isUphill && runStart !== null) {
      runs.push({ start: runStart, end: i - 1 });
      runStart = null;
    }
  }
  if (runStart !== null) {
    runs.push({ start: runStart, end: steps });
  }

  // Filter and convert runs → Segment objects.
  for (const run of runs) {
    const startM = run.start * SCAN_INTERVAL_M;
    const endM = Math.min(run.end * SCAN_INTERVAL_M, route.totalDistance);
    const lengthM = endM - startM;
    if (lengthM < MIN_CLIMB_LENGTH_M) continue;

    const ascentM = computeAscentInRange(route, startM, endM);
    if (ascentM < MIN_CLIMB_ASCENT_M) continue;

    const avgGradient = (ascentM / lengthM) * 100;

    segments.push({
      id: routeSegmentId(route.id, startM, endM, 'climb'),
      name: buildClimbName(segments.length, startM, endM, ascentM, avgGradient),
      startM,
      endM,
      lengthM,
      ascentM: Math.round(ascentM),
      avgGradient: Math.round(avgGradient * 10) / 10,
      kind: 'climb',
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Time computation
// ---------------------------------------------------------------------------

/**
 * Compute the elapsed wall-clock time (seconds) a rider spent traversing
 * each segment, based on the TelemetrySample[] of a finished ride.
 *
 * Returns a map from segment.id → seconds (null if the rider didn't
 * traverse the segment in this ride).
 */
export function computeSegmentTimes(
  segments: Segment[],
  samples: TelemetrySample[],
): Map<string, number> {
  const result = new Map<string, number>();
  if (samples.length < 2) return result;

  for (const seg of segments) {
    // Find the sample where the rider first entered the segment.
    const entryIdx = samples.findIndex((s) => s.distance >= seg.startM);
    if (entryIdx === -1) continue;

    // Find the sample where the rider first reached the segment end.
    const exitIdx = samples.findIndex((s) => s.distance >= seg.endM);
    if (exitIdx === -1) {
      // Rider didn't finish the segment — still in progress or bailed.
      continue;
    }

    const entrySample = samples[entryIdx];
    const exitSample = samples[exitIdx];
    const elapsedSec = (exitSample.t - entrySample.t) / 1000;

    if (elapsedSec > 0) {
      result.set(seg.id, Math.round(elapsedSec));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Stable, URL-safe segment id. */
function routeSegmentId(
  routeId: string,
  startM: number,
  endM: number,
  kind: SegmentKind,
): string {
  return `seg-${routeId}-${kind}-${Math.round(startM)}-${Math.round(endM)}`;
}

/** Compute total elevation gain between two distances on a route. */
function computeAscentInRange(route: Route, startM: number, endM: number): number {
  const pts = route.points;
  if (pts.length < 2) return 0;

  let ascent = 0;
  const STEP = 20; // m — fine enough for accuracy
  let prevEle = elevationAt(route, startM);

  for (let d = startM + STEP; d <= endM; d += STEP) {
    const ele = elevationAt(route, d);
    const delta = ele - prevEle;
    if (delta > 0) ascent += delta;
    prevEle = ele;
  }

  return ascent;
}

/** Derive a human name for an auto-detected climb. */
function buildClimbName(
  existingCount: number,
  startM: number,
  _endM: number,
  ascentM: number,
  avgGradient: number,
): string {
  const index = existingCount; // 1-based (first segment is the full-route one)
  const kmFrom = (startM / 1000).toFixed(1);

  if (avgGradient >= 10) {
    return `Climb ${index} — ${ascentM} m at ${avgGradient.toFixed(1)}% (km ${kmFrom})`;
  }
  if (avgGradient >= 6) {
    return `Ascent ${index} — ${ascentM} m, ${avgGradient.toFixed(1)}% avg`;
  }
  return `Rise ${index} — km ${kmFrom}, +${ascentM} m`;
}
