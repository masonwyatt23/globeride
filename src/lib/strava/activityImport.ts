/**
 * src/lib/strava/activityImport.ts — Import a Strava activity as a Route.
 *
 * All HTTP goes through the existing /strava-api/* reverse-proxy (same as
 * upload + segment fetch). Never hits Strava directly from the browser.
 *
 * Rate-limit awareness:
 *   - Imported routes are cached in localStorage (key: strava-activity-{id}),
 *     TTL 7 days. Re-importing the same URL is instant.
 *   - If Strava returns 429, a friendly RateLimitedError is thrown.
 *
 * The `read` scope (included in `activity:write,activity:read_all`) is
 * sufficient for /activities/{id}/streams and /activities/{id}.
 */

import { haversine } from '@/lib/utils';
import type { Route, RoutePoint } from '@/types';

// ---------------------------------------------------------------------------
// Cache constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cacheKey(activityId: string): string {
  return `strava-activity-${activityId}`;
}

interface CachedActivity {
  route: Route;
  cachedAt: number;
}

function readCache(activityId: string): Route | null {
  try {
    const raw = localStorage.getItem(cacheKey(activityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedActivity;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(activityId));
      return null;
    }
    return parsed.route;
  } catch {
    return null;
  }
}

function writeCache(activityId: string, route: Route): void {
  try {
    const entry: CachedActivity = { route, cachedAt: Date.now() };
    localStorage.setItem(cacheKey(activityId), JSON.stringify(entry));
  } catch {
    // localStorage full or blocked — skip silently
  }
}

// ---------------------------------------------------------------------------
// URL / ID parsing
// ---------------------------------------------------------------------------

/**
 * Accept any of:
 *   https://www.strava.com/activities/12345678
 *   https://www.strava.com/activities/12345678/overview
 *   strava.com/activities/12345678
 *   12345678   (bare numeric ID)
 *
 * Returns the numeric ID string, or null for anything that doesn't match.
 */
export function parseStravaActivityId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;

  // URL form — allow optional protocol, optional www, optional trailing path
  const match = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?strava\.com\/activities\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/i,
  );
  if (match) return match[1];

  return null;
}

// ---------------------------------------------------------------------------
// Strava stream types
// ---------------------------------------------------------------------------

export interface StravaActivityStreams {
  /** Array of [lat, lon] pairs. */
  latlng: [number, number][];
  /** Altitude in meters, one per latlng point. */
  altitude: number[];
  /** Cumulative distance in meters, one per latlng point. */
  distance: number[];
}

// ---------------------------------------------------------------------------
// API: activity metadata
// ---------------------------------------------------------------------------

export interface ActivityMetadata {
  name: string;
  totalDistance: number;
  totalElevationGain: number;
}

/**
 * Fetch activity summary from /api/v3/activities/{id}.
 * Throws on 401 (not connected), 403 (permission), 404 (not found), 429 (rate limited).
 */
export async function fetchActivityMetadata(
  activityId: string,
  accessToken: string,
): Promise<ActivityMetadata> {
  let res: Response;
  try {
    res = await fetch(`/strava-api/api/v3/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }

  if (res.status === 401) {
    throw new StravaImportError('Strava is not connected. Please connect your account first.', 'auth');
  }
  if (res.status === 403) {
    throw new StravaImportError(
      'This activity is private or you do not have permission to view it.',
      'permission',
    );
  }
  if (res.status === 404) {
    throw new StravaImportError('Activity not found. Check the URL and try again.', 'not_found');
  }
  if (res.status === 429) {
    throw new StravaImportError(
      'Strava rate limit reached. You can import up to 100 activities per 15 minutes. Please wait and try again.',
      'rate_limited',
    );
  }
  if (!res.ok) {
    throw new StravaImportError(`Strava returned an error (HTTP ${res.status}).`, 'unknown');
  }

  let data: { name?: string; distance?: number; total_elevation_gain?: number };
  try {
    data = await res.json();
  } catch {
    throw new StravaImportError('Could not parse Strava response.', 'unknown');
  }

  return {
    name: data.name ?? `Strava Activity ${activityId}`,
    totalDistance: data.distance ?? 0,
    totalElevationGain: data.total_elevation_gain ?? 0,
  };
}

// ---------------------------------------------------------------------------
// API: GPS streams
// ---------------------------------------------------------------------------

/**
 * Fetch GPS + altitude + distance streams from /api/v3/activities/{id}/streams.
 * All three keys are requested together; distance and altitude fall back to
 * computed values if Strava doesn't include them (older activities sometimes
 * lack the distance stream).
 */
export async function fetchActivityStreams(
  activityId: string,
  accessToken: string,
): Promise<StravaActivityStreams> {
  const params = new URLSearchParams({
    keys: 'latlng,altitude,distance',
    key_by_type: 'true',
  });

  let res: Response;
  try {
    res = await fetch(
      `/strava-api/api/v3/activities/${activityId}/streams?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }

  if (res.status === 401) {
    throw new StravaImportError('Strava is not connected. Please connect your account first.', 'auth');
  }
  if (res.status === 403) {
    throw new StravaImportError(
      'This activity is private or you do not have permission to view it.',
      'permission',
    );
  }
  if (res.status === 404) {
    throw new StravaImportError('Activity not found. Check the URL and try again.', 'not_found');
  }
  if (res.status === 429) {
    throw new StravaImportError(
      'Strava rate limit reached. You can import up to 100 activities per 15 minutes. Please wait and try again.',
      'rate_limited',
    );
  }
  if (!res.ok) {
    throw new StravaImportError(`Strava returned an error (HTTP ${res.status}).`, 'unknown');
  }

  // Strava returns streams as a map keyed by type when key_by_type=true
  let raw: Record<string, { data: unknown[] }>;
  try {
    raw = await res.json();
  } catch {
    throw new StravaImportError('Could not parse Strava stream response.', 'unknown');
  }

  const latlng = (raw['latlng']?.data ?? []) as [number, number][];
  if (latlng.length === 0) {
    throw new StravaImportError(
      'This activity has no GPS data. Only activities with GPS can be imported.',
      'no_gps',
    );
  }

  const altitude = (raw['altitude']?.data ?? []) as number[];
  const distance = (raw['distance']?.data ?? []) as number[];

  return { latlng, altitude, distance };
}

// ---------------------------------------------------------------------------
// Stream → Route conversion
// ---------------------------------------------------------------------------

/**
 * Convert Strava streams into a normalized Route.
 *
 * - Points with missing altitude fall back to 0.
 * - Distance accumulates with haversine when the distance stream is absent or
 *   shorter than latlng.
 * - ascent / descent are computed from adjacent elevation deltas.
 */
export function streamsToRoute(
  activityId: string,
  name: string,
  streams: StravaActivityStreams,
): Route {
  const { latlng, altitude, distance } = streams;
  const n = latlng.length;

  const points: RoutePoint[] = [];
  let ascent = 0;
  let descent = 0;
  let cumDist = 0;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let i = 0; i < n; i++) {
    const [lat, lon] = latlng[i];
    const ele = altitude[i] ?? 0;

    // Prefer the Strava distance stream; fall back to haversine accumulation
    if (distance.length > i) {
      cumDist = distance[i];
    } else if (i > 0) {
      const [prevLat, prevLon] = latlng[i - 1];
      cumDist += haversine(prevLat, prevLon, lat, lon);
    }

    if (i > 0) {
      const prevEle = altitude[i - 1] ?? 0;
      const dEle = ele - prevEle;
      if (dEle > 0) ascent += dEle;
      else descent += Math.abs(dEle);
    }

    if (ele < minElevation) minElevation = ele;
    if (ele > maxElevation) maxElevation = ele;

    points.push({ lat, lon, ele, distance: cumDist });
  }

  if (points.length === 0) {
    throw new StravaImportError('Activity has no GPS points.', 'no_gps');
  }

  return {
    id: `strava-${activityId}`,
    name,
    points,
    totalDistance: cumDist,
    ascent,
    descent,
    minElevation: isFinite(minElevation) ? minElevation : 0,
    maxElevation: isFinite(maxElevation) ? maxElevation : 0,
    loadedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Top-level import function (fetch metadata + streams → Route, with cache)
// ---------------------------------------------------------------------------

/**
 * Full import pipeline: fetch metadata + streams, build a Route, cache it.
 * Callers should call saveRoute() from routeLibrary.ts to persist to IDB.
 */
export async function importStravaActivity(
  activityId: string,
  accessToken: string,
): Promise<Route> {
  // Cache hit — instant return
  const cached = readCache(activityId);
  if (cached) return cached;

  // Fetch metadata and streams in parallel
  const [meta, streams] = await Promise.all([
    fetchActivityMetadata(activityId, accessToken),
    fetchActivityStreams(activityId, accessToken),
  ]);

  const route = streamsToRoute(activityId, meta.name, streams);
  writeCache(activityId, route);
  return route;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type StravaImportErrorKind =
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'rate_limited'
  | 'no_gps'
  | 'unknown';

export class StravaImportError extends Error {
  constructor(
    message: string,
    public readonly kind: StravaImportErrorKind = 'unknown',
  ) {
    super(message);
    this.name = 'StravaImportError';
  }
}
