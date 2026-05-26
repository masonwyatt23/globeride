/**
 * src/lib/strava/segments.ts — Strava segment API client.
 *
 * Fetches segments near a route from the Strava /segments/explore endpoint
 * and segment PR data from /segments/{id}. All HTTP goes through the
 * /strava-api/* reverse-proxy that already exists for the .FIT upload flow.
 *
 * Rate-limit awareness:
 *   - Results are cached in localStorage per route (key = route.id + ":strava-segments"),
 *     TTL 7 days. Re-fetching is skipped when a fresh cache hit exists.
 *   - Chunk-level bounding boxes are de-duplicated by segment ID, capped at 25.
 *   - No per-frame calls — fetch once per route load.
 *
 * Keep this file pure (no React / Zustand) — it is imported from hooks and
 * the background fetch kickoff in CesiumViewer.
 */

import type { Route } from '@/types';
import { haversine } from '@/lib/utils';
import { sampleRouteAtDistance } from '@/lib/gpxParser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StravaSegment {
  id: number;
  name: string;
  /** Total distance of the Strava segment, meters. */
  distance: number;
  /** Start of the Strava segment. */
  startLat: number;
  startLon: number;
  /** End of the Strava segment. */
  endLat: number;
  endLon: number;
  /** Rider's personal record time for this segment, seconds. null = no attempt. */
  prTime?: number;
  /** KOM (King of Mountain) time, seconds. null = unknown. */
  komTime?: number;
  /** Strava climb category 0–5 (0=none). */
  climbCategory?: number;
  /** Average grade of the segment, %. */
  avgGrade?: number;
}

interface StravaSegmentExploreResult {
  segments?: {
    id: number;
    name: string;
    distance: number;
    start_latlng: [number, number];
    end_latlng: [number, number];
    climb_category: number;
    avg_grade: number;
    kom_time?: number;
    pr_time?: number;
  }[];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SegmentCache {
  segments: StravaSegment[];
  fetchedAt: number;
}

function cacheKey(routeId: string): string {
  return `${routeId}:strava-segments`;
}

function readCache(routeId: string): StravaSegment[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(routeId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as SegmentCache;
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(routeId));
      return null;
    }
    return cached.segments;
  } catch {
    return null;
  }
}

function writeCache(routeId: string, segments: StravaSegment[]): void {
  try {
    const entry: SegmentCache = { segments, fetchedAt: Date.now() };
    localStorage.setItem(cacheKey(routeId), JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silent fail. Cache miss next time.
  }
}

export function clearSegmentCache(routeId: string): void {
  try {
    localStorage.removeItem(cacheKey(routeId));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a [swLat, swLon, neLat, neLon] bounding box for a chunk of the route.
 * Takes all route points sampled every sampleM metres in the range [startM, endM].
 */
function routeChunkBounds(
  route: Route,
  startM: number,
  endM: number,
  sampleM: number,
): { swLat: number; swLon: number; neLat: number; neLon: number } {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;

  for (let d = startM; d <= endM + sampleM; d += sampleM) {
    const clamped = Math.min(d, endM, route.totalDistance);
    const { lat, lon } = sampleRouteAtDistance(route, clamped);
    if (lat < minLat) minLat = lat;
    if (lon < minLon) minLon = lon;
    if (lat > maxLat) maxLat = lat;
    if (lon > maxLon) maxLon = lon;
  }

  // Expand by ~200 m to capture segments that start/end just off the route
  const PAD_DEG = 0.002; // ≈ 200 m
  return {
    swLat: minLat - PAD_DEG,
    swLon: minLon - PAD_DEG,
    neLat: maxLat + PAD_DEG,
    neLon: maxLon + PAD_DEG,
  };
}

/**
 * Minimum distance in metres from any route point to the segment start or end.
 * Used to filter out segments that are geographically near the route but whose
 * start/end anchors are too far off-track.
 */
function nearestPointOnRoute(route: Route, lat: number, lon: number): number {
  // Sample every 100 m — good enough for proximity filtering.
  const STEP = 100;
  let nearest = Infinity;
  for (let d = 0; d <= route.totalDistance; d += STEP) {
    const pt = sampleRouteAtDistance(route, d);
    const dist = haversine(lat, lon, pt.lat, pt.lon);
    if (dist < nearest) nearest = dist;
  }
  return nearest;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Fetch Strava segments that intersect the route from /segments/explore.
 *
 * Strategy:
 *   1. Slice the route into ~5 km chunks.
 *   2. Build a bounding box for each chunk.
 *   3. Query /segments/explore?bounds=... for each box (activity_type=riding).
 *   4. De-duplicate results by segment ID.
 *   5. Filter to segments whose start AND end are within 100 m of the route.
 *   6. Keep the closest 25 by average proximity.
 *
 * Returns empty array (silently) on network failure — the ride continues.
 * Uses localStorage cache (TTL 7 days) to respect Strava's rate limits.
 */
export async function fetchSegmentsNearRoute(
  route: Route,
  accessToken: string,
): Promise<StravaSegment[]> {
  // Cache hit — skip network entirely.
  const cached = readCache(route.id);
  if (cached) return cached;

  const CHUNK_M = 5_000;    // 5 km per bbox query
  const PROXIMITY_M = 100;  // max distance from route for start/end
  const MAX_SEGMENTS = 25;

  const chunks: Array<{ swLat: number; swLon: number; neLat: number; neLon: number }> = [];
  for (let start = 0; start < route.totalDistance; start += CHUNK_M) {
    const end = Math.min(start + CHUNK_M, route.totalDistance);
    chunks.push(routeChunkBounds(route, start, end, 200));
  }

  const seen = new Set<number>();
  const raw: StravaSegment[] = [];

  // Fire requests sequentially to be gentle on rate limits.
  for (const box of chunks) {
    const boundsStr = `${box.swLat},${box.swLon},${box.neLat},${box.neLon}`;
    let res: Response;
    try {
      res = await fetch(
        `/strava-api/api/v3/segments/explore?bounds=${boundsStr}&activity_type=riding`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch {
      // Network error — skip this chunk but continue with others.
      continue;
    }
    if (!res.ok) continue;

    let data: StravaSegmentExploreResult;
    try {
      data = (await res.json()) as StravaSegmentExploreResult;
    } catch {
      continue;
    }

    for (const seg of data.segments ?? []) {
      if (seen.has(seg.id)) continue;
      seen.add(seg.id);

      const [startLat, startLon] = seg.start_latlng;
      const [endLat, endLon] = seg.end_latlng;

      raw.push({
        id: seg.id,
        name: seg.name,
        distance: seg.distance,
        startLat,
        startLon,
        endLat,
        endLon,
        climbCategory: seg.climb_category,
        avgGrade: seg.avg_grade,
        prTime: seg.pr_time,
        komTime: seg.kom_time,
      });
    }
  }

  // Filter by proximity (start AND end must be within PROXIMITY_M of the route).
  const proximate = raw.filter((seg) => {
    const startDist = nearestPointOnRoute(route, seg.startLat, seg.startLon);
    const endDist   = nearestPointOnRoute(route, seg.endLat, seg.endLon);
    return startDist <= PROXIMITY_M && endDist <= PROXIMITY_M;
  });

  // Sort by average proximity (start + end distance to route), take top 25.
  const ranked = proximate
    .map((seg) => ({
      seg,
      score:
        nearestPointOnRoute(route, seg.startLat, seg.startLon) +
        nearestPointOnRoute(route, seg.endLat, seg.endLon),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_SEGMENTS)
    .map((x) => x.seg);

  writeCache(route.id, ranked);
  return ranked;
}

/**
 * Fetch detailed segment info including the rider's PR time.
 * Falls back gracefully — on error returns { effortCount: 0 }.
 */
export async function fetchSegmentEffortHistory(
  segmentId: number,
  accessToken: string,
): Promise<{ prTime?: number; bestEffort?: number; effortCount: number }> {
  let res: Response;
  try {
    res = await fetch(`/strava-api/api/v3/segments/${segmentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { effortCount: 0 };
  }
  if (!res.ok) return { effortCount: 0 };

  let data: {
    pr_time?: number;
    effort_count?: number;
    athlete_segment_stats?: { pr_elapsed_time?: number };
  };
  try {
    data = await res.json();
  } catch {
    return { effortCount: 0 };
  }

  const prTime =
    data.athlete_segment_stats?.pr_elapsed_time ??
    data.pr_time ??
    undefined;

  return {
    prTime,
    effortCount: data.effort_count ?? 0,
  };
}
