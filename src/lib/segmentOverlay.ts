/**
 * src/lib/segmentOverlay.ts — Segment-on-route mapping utilities.
 *
 * Pure utility module: no React, no Zustand, no Cesium.
 * Maps StravaSegment objects onto a Route by resolving their lat/lon start/end
 * points to cumulative route-distances. Provides per-frame crossing detectors
 * and a PR-pace computation function.
 *
 * All functions are zero-allocation in the hot path (no object creation per
 * frame — detectSegmentEntry and detectSegmentExit only do arithmetic).
 */

import type { Route } from '@/types';
import type { StravaSegment } from '@/lib/strava/segments';
import { haversine } from '@/lib/utils';
import { sampleRouteAtDistance } from '@/lib/gpxParser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteSegment {
  segment: StravaSegment;
  /**
   * Distance along the route (metres) corresponding to the segment's
   * start lat/lon.
   */
  routeStartDistance: number;
  /**
   * Distance along the route (metres) corresponding to the segment's
   * end lat/lon.
   */
  routeEndDistance: number;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Resolve the route-distance for a given lat/lon by scanning the route
 * in steps and finding the closest point, then returning its cumulative distance.
 *
 * Resolution: 50 m scan step — sufficient for segment detection accuracy.
 */
function closestRouteDistance(route: Route, lat: number, lon: number): number {
  const STEP = 50;
  let bestDist = Infinity;
  let bestD = 0;

  for (let d = 0; d <= route.totalDistance; d += STEP) {
    const pt = sampleRouteAtDistance(route, d);
    const dist = haversine(lat, lon, pt.lat, pt.lon);
    if (dist < bestDist) {
      bestDist = dist;
      bestD = d;
    }
  }

  return bestD;
}

/**
 * Map StravaSegment objects onto the route by converting their lat/lon
 * anchors to cumulative route-distances.
 *
 * Filters out segments where:
 *   - The mapped start distance >= end distance (reversed or degenerate).
 *   - The closest route point to the segment's START lat/lon is more than
 *     150 m away (the segment doesn't align with this route).
 */
export function mapSegmentsToRoute(
  segments: StravaSegment[],
  route: Route,
): RouteSegment[] {
  const ALIGNMENT_THRESHOLD_M = 150;
  const result: RouteSegment[] = [];

  for (const seg of segments) {
    // Find closest route distance for start and end.
    const routeStartDistance = closestRouteDistance(route, seg.startLat, seg.startLon);
    const routeEndDistance   = closestRouteDistance(route, seg.endLat, seg.endLon);

    // Verify the segment start actually touches the route.
    const startPt = sampleRouteAtDistance(route, routeStartDistance);
    const startGap = haversine(seg.startLat, seg.startLon, startPt.lat, startPt.lon);
    if (startGap > ALIGNMENT_THRESHOLD_M) continue;

    // Direction sanity: start must come before end along the route.
    if (routeStartDistance >= routeEndDistance) continue;

    result.push({ segment: seg, routeStartDistance, routeEndDistance });
  }

  // Sort by route start distance so they can be iterated in order.
  return result.sort((a, b) => a.routeStartDistance - b.routeStartDistance);
}

// ---------------------------------------------------------------------------
// Per-frame crossing detectors
// ---------------------------------------------------------------------------

/**
 * Returns the first RouteSegment the rider just entered this frame, or null.
 *
 * "Entered" means the rider's distance crossed from below routeStartDistance
 * to at-or-above it in this frame (lastDistance < startDistance <= distanceNow).
 * This prevents re-triggering if the rider stays inside the segment.
 *
 * activeId: the currently-active segment ID, or null when no segment is running.
 * When a segment is already running, entry is suppressed (no nesting).
 */
export function detectSegmentEntry(
  distanceNow: number,
  segments: RouteSegment[],
  lastDistance: number,
  activeId: number | null,
): RouteSegment | null {
  // Never nest — if something is already active, don't start a new one.
  if (activeId !== null) return null;

  for (const rs of segments) {
    if (
      lastDistance < rs.routeStartDistance &&
      distanceNow >= rs.routeStartDistance
    ) {
      return rs;
    }
  }
  return null;
}

/**
 * Returns the RouteSegment the rider just exited this frame, or null.
 *
 * "Exited" means the rider's distance crossed from below routeEndDistance
 * to at-or-above it in this frame, AND the active segment matches.
 */
export function detectSegmentExit(
  distanceNow: number,
  segments: RouteSegment[],
  activeId: number | null,
  lastDistance: number,
): RouteSegment | null {
  if (activeId === null) return null;

  const active = segments.find((rs) => rs.segment.id === activeId);
  if (!active) return null;

  if (
    lastDistance < active.routeEndDistance &&
    distanceNow >= active.routeEndDistance
  ) {
    return active;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pace vs PR
// ---------------------------------------------------------------------------

/**
 * Compute how many seconds ahead of (negative) or behind (positive) PR pace
 * the rider currently is, mid-segment.
 *
 * @param elapsedSec  Seconds since the rider entered the segment.
 * @param distanceM   Metres covered since entering the segment.
 * @param segmentPrTime   The rider's PR time for this segment, seconds.
 * @param segmentDistanceM  Total distance of the segment, metres.
 * @returns delta seconds — negative = ahead of PR, positive = behind.
 *
 * Returns 0 when segmentPrTime or segmentDistanceM is ≤ 0 (guard against
 * division by zero and missing-PR state).
 */
export function computePaceVsPR(
  elapsedSec: number,
  distanceM: number,
  segmentPrTime: number,
  segmentDistanceM: number,
): number {
  if (segmentPrTime <= 0 || segmentDistanceM <= 0 || distanceM <= 0) {
    return 0;
  }

  // Projected finish time at current pace.
  const paceSec = elapsedSec / distanceM;          // s/m
  const projectedFinish = paceSec * segmentDistanceM;

  return projectedFinish - segmentPrTime;
}
