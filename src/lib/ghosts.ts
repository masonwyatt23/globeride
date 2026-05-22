/**
 * Ghost rider logic — replays past ride telemetry as a shadow position on the
 * current route, so the rider races their previous attempts.
 *
 * Matching: past rides are considered "same route" when both the route name
 * AND the recorded total distance are within 2 % of the current route. This
 * works because the ride recorder stores route.name and the last sample's
 * distance which equals route.totalDistance at finish.
 *
 * Playback is driven by the live rider's elapsed wall-clock seconds. For each
 * frame the ghost's distance along the route is obtained by linearly
 * interpolating the ghost's recorded sample `distance` values keyed on their
 * wall-clock offset from the ghost's startedAt.
 */

import type { Route, TelemetrySample } from '@/types';
import { listRides } from '@/lib/rideHistory';
import type { RideRecord } from '@/lib/rideHistory';

// Max ghosts rendered simultaneously.
export const MAX_GHOSTS = 3;

// Two routes are considered the same when distances are within this fraction.
const DISTANCE_TOLERANCE = 0.02; // 2 %

// ---- Public types ------------------------------------------------------------

/** A resolved ghost: the past ride record + a fast lookup function. */
export interface GhostRide {
  /** Display label for the UI (ride name + date). */
  label: string;
  /** Total duration of the past ride, seconds. */
  durationSec: number;
  /**
   * Given the live rider's elapsed seconds, returns the ghost's cumulative
   * distance along the route in metres, clamped to [0, route.totalDistance].
   * Returns null only when the ghost has not yet started (elapsedSec < 0).
   */
  distanceAt: (elapsedSec: number) => number | null;
}

// ---- Internal helpers -------------------------------------------------------

/**
 * Build a fast interpolation function over the sample array.
 * The ghost samples are keyed by seconds-since-ride-start so we can look up
 * any elapsed time in O(log n) via binary search.
 */
function buildInterpolator(
  samples: TelemetrySample[],
  startedAt: number,
): (elapsedSec: number) => number | null {
  if (samples.length === 0) return () => null;

  // Pre-compute offsets in seconds from ride start.
  const times = samples.map((s) => (s.t - startedAt) / 1000);
  const distances = samples.map((s) => s.distance);

  const first = times[0];
  const last = times[times.length - 1];

  return (elapsedSec: number): number | null => {
    if (elapsedSec < first) return null;
    if (elapsedSec >= last) return distances[distances.length - 1];

    // Binary search for the bracket [lo, hi] around elapsedSec.
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= elapsedSec) lo = mid;
      else hi = mid;
    }

    // Linear interpolation between lo and hi.
    const t0 = times[lo];
    const t1 = times[hi];
    const span = t1 - t0;
    if (span <= 0) return distances[lo];
    const frac = (elapsedSec - t0) / span;
    return distances[lo] + frac * (distances[hi] - distances[lo]);
  };
}

/**
 * Decide if a recorded ride matches the current route well enough to ghost.
 * Matching criteria:
 *   - Same route name (case-insensitive, trimmed).
 *   - Recorded distance within DISTANCE_TOLERANCE of route.totalDistance.
 *   - Has at least 2 samples (enough to interpolate).
 *   - Not a replay or workout-only ride (source !== 'replay').
 */
function isEligible(record: RideRecord, route: Route): boolean {
  if (record.source === 'replay') return false;
  if (record.sampleCount < 2 || record.samples.length < 2) return false;
  const nameMismatch =
    record.name.toLowerCase().split('—')[0].trim() !==
    route.name.toLowerCase().trim();
  if (nameMismatch) {
    // Also accept if the ride name starts with the route name (common when
    // workout name is prepended) or the route name starts with the ride name.
    const ridePart = record.name.toLowerCase().split('—')[0].trim();
    const routePart = route.name.toLowerCase().trim();
    if (!ridePart.includes(routePart) && !routePart.includes(ridePart)) {
      return false;
    }
  }
  const recordedDist = record.distanceM;
  const routeDist = route.totalDistance;
  if (routeDist === 0) return false;
  const ratio = Math.abs(recordedDist - routeDist) / routeDist;
  return ratio <= DISTANCE_TOLERANCE;
}

// ---- Public API -------------------------------------------------------------

/**
 * Load up to MAX_GHOSTS ghost rides for the given route from IndexedDB.
 * Selects the best past attempts (fastest average speed) and returns them
 * sorted fastest-first. Returns an empty array when no eligible rides exist.
 */
export async function loadGhosts(route: Route): Promise<GhostRide[]> {
  let all: RideRecord[];
  try {
    all = await listRides();
  } catch {
    return [];
  }

  const eligible = all.filter((r) => isEligible(r, route));
  if (eligible.length === 0) return [];

  // Sort by average speed descending (fastest first) — pick up to MAX_GHOSTS.
  eligible.sort((a, b) => b.avgSpeed - a.avgSpeed);
  const picked = eligible.slice(0, MAX_GHOSTS);

  return picked.map((record): GhostRide => {
    const interpolate = buildInterpolator(record.samples, record.startedAt);
    const date = new Date(record.startedAt).toLocaleDateString();
    return {
      label: `${record.name} · ${date}`,
      durationSec: record.durationSec,
      distanceAt: interpolate,
    };
  });
}
