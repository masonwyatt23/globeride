/**
 * Tests for src/lib/strava/activityImport.ts
 *
 * Covers:
 *   1. parseStravaActivityId — all URL variants + null cases (8 tests)
 *   2. fetchActivityStreams — success, 404, 401, 429 (4 tests)
 *   3. fetchActivityMetadata — success, 403 (2 tests)
 *   4. streamsToRoute — point count, distance, ascent, fallback haversine (5 tests)
 *   5. Cache behavior — hit, miss, expiry (3 tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseStravaActivityId,
  fetchActivityStreams,
  fetchActivityMetadata,
  streamsToRoute,
  importStravaActivity,
} from './activityImport';
import type { StravaActivityStreams } from './activityImport';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStreams(n = 5): StravaActivityStreams {
  const latlng: [number, number][] = [];
  const altitude: number[] = [];
  const distance: number[] = [];
  for (let i = 0; i < n; i++) {
    latlng.push([51.5 + i * 0.001, -0.1 + i * 0.001]);
    altitude.push(100 + i * 10); // steady climb: +10m per step
    distance.push(i * 200);      // 200m steps
  }
  return { latlng, altitude, distance };
}

// ---------------------------------------------------------------------------
// 1. parseStravaActivityId
// ---------------------------------------------------------------------------

describe('parseStravaActivityId', () => {
  it('handles a bare numeric ID', () => {
    expect(parseStravaActivityId('12345678')).toBe('12345678');
  });

  it('handles full https URL', () => {
    expect(parseStravaActivityId('https://www.strava.com/activities/12345678')).toBe('12345678');
  });

  it('handles URL with trailing path segment', () => {
    expect(parseStravaActivityId('https://www.strava.com/activities/12345678/overview')).toBe('12345678');
  });

  it('handles URL without protocol', () => {
    expect(parseStravaActivityId('strava.com/activities/12345678')).toBe('12345678');
  });

  it('handles http:// protocol', () => {
    expect(parseStravaActivityId('http://www.strava.com/activities/99999')).toBe('99999');
  });

  it('handles URL with query string', () => {
    expect(parseStravaActivityId('https://www.strava.com/activities/12345678?utm_source=foo')).toBe('12345678');
  });

  it('returns null for non-Strava URL', () => {
    expect(parseStravaActivityId('https://example.com/activities/12345')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseStravaActivityId('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseStravaActivityId('   ')).toBeNull();
  });

  it('returns null for alpha-only string', () => {
    expect(parseStravaActivityId('notanid')).toBeNull();
  });

  it('returns null for a Strava non-activity URL', () => {
    expect(parseStravaActivityId('https://www.strava.com/routes/12345')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. fetchActivityStreams
// ---------------------------------------------------------------------------

describe('fetchActivityStreams', () => {
  const TOKEN = 'test-token';
  const ACTIVITY_ID = '987654';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed streams on success', async () => {
    const mockStreams = makeStreams(3);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          latlng: { data: mockStreams.latlng },
          altitude: { data: mockStreams.altitude },
          distance: { data: mockStreams.distance },
        }),
        { status: 200 },
      ),
    );

    const result = await fetchActivityStreams(ACTIVITY_ID, TOKEN);
    expect(result.latlng).toHaveLength(3);
    expect(result.altitude).toHaveLength(3);
    expect(result.distance).toHaveLength(3);
  });

  it('throws StravaImportError(not_found) on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(fetchActivityStreams(ACTIVITY_ID, TOKEN)).rejects.toMatchObject({
      kind: 'not_found',
    });
  });

  it('throws StravaImportError(auth) on 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(fetchActivityStreams(ACTIVITY_ID, TOKEN)).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('throws StravaImportError(rate_limited) on 429', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(fetchActivityStreams(ACTIVITY_ID, TOKEN)).rejects.toMatchObject({
      kind: 'rate_limited',
    });
  });

  it('throws StravaImportError(no_gps) when latlng is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ latlng: { data: [] }, altitude: { data: [] }, distance: { data: [] } }),
        { status: 200 },
      ),
    );
    await expect(fetchActivityStreams(ACTIVITY_ID, TOKEN)).rejects.toMatchObject({
      kind: 'no_gps',
    });
  });
});

// ---------------------------------------------------------------------------
// 3. fetchActivityMetadata
// ---------------------------------------------------------------------------

describe('fetchActivityMetadata', () => {
  const TOKEN = 'test-token';
  const ACTIVITY_ID = '111222';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns name, distance, elevation on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ name: 'Morning Ride', distance: 25000, total_elevation_gain: 350 }),
        { status: 200 },
      ),
    );

    const meta = await fetchActivityMetadata(ACTIVITY_ID, TOKEN);
    expect(meta.name).toBe('Morning Ride');
    expect(meta.totalDistance).toBe(25000);
    expect(meta.totalElevationGain).toBe(350);
  });

  it('throws StravaImportError(permission) on 403', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(fetchActivityMetadata(ACTIVITY_ID, TOKEN)).rejects.toMatchObject({
      kind: 'permission',
    });
  });

  it('falls back to generated name when name missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ distance: 5000 }), { status: 200 }),
    );
    const meta = await fetchActivityMetadata(ACTIVITY_ID, TOKEN);
    expect(meta.name).toBe(`Strava Activity ${ACTIVITY_ID}`);
  });
});

// ---------------------------------------------------------------------------
// 4. streamsToRoute
// ---------------------------------------------------------------------------

describe('streamsToRoute', () => {
  it('creates the correct number of points', () => {
    const streams = makeStreams(10);
    const route = streamsToRoute('42', 'Test', streams);
    expect(route.points).toHaveLength(10);
  });

  it('uses the distance stream directly when provided', () => {
    const streams = makeStreams(5);
    const route = streamsToRoute('42', 'Test', streams);
    // last distance step is (5-1)*200 = 800
    expect(route.totalDistance).toBe(800);
    expect(route.points[4].distance).toBe(800);
  });

  it('accumulates distance via haversine when distance stream absent', () => {
    const { latlng, altitude } = makeStreams(3);
    const route = streamsToRoute('42', 'Test', { latlng, altitude, distance: [] });
    // Each step is ~111m (0.001° lat+lon combined), just verify it's > 0
    expect(route.totalDistance).toBeGreaterThan(0);
  });

  it('calculates ascent from elevation deltas', () => {
    const streams = makeStreams(5); // +10m per step → 4 steps × 10m = 40m ascent
    const route = streamsToRoute('42', 'Test', streams);
    expect(route.ascent).toBeCloseTo(40, 0);
  });

  it('sets id from activityId with strava- prefix', () => {
    const route = streamsToRoute('99887766', 'Ride', makeStreams(2));
    expect(route.id).toBe('strava-99887766');
  });

  it('computes min/max elevation correctly', () => {
    const streams = makeStreams(5); // altitudes: 100, 110, 120, 130, 140
    const route = streamsToRoute('1', 'R', streams);
    expect(route.minElevation).toBe(100);
    expect(route.maxElevation).toBe(140);
  });
});

// ---------------------------------------------------------------------------
// 5. importStravaActivity — cache behavior
// ---------------------------------------------------------------------------

describe('importStravaActivity (cache)', () => {
  let lsMock: ReturnType<typeof makeLocalStorageMock>;

  beforeEach(() => {
    lsMock = makeLocalStorageMock();
    vi.stubGlobal('localStorage', lsMock);
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchSuccess(streams: StravaActivityStreams, name = 'Cached Ride') {
    vi.mocked(fetch)
      // metadata call
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name, distance: 1000, total_elevation_gain: 50 }), {
          status: 200,
        }),
      )
      // streams call
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            latlng: { data: streams.latlng },
            altitude: { data: streams.altitude },
            distance: { data: streams.distance },
          }),
          { status: 200 },
        ),
      );
  }

  it('returns cached route without hitting the network on second call', async () => {
    const streams = makeStreams(3);
    mockFetchSuccess(streams, 'My Ride');
    const TOKEN = 'tok';
    const ID = '555';

    const first = await importStravaActivity(ID, TOKEN);
    expect(first.name).toBe('My Ride');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2); // meta + streams

    // Second call — should hit cache, fetch count stays at 2
    const second = await importStravaActivity(ID, TOKEN);
    expect(second.id).toBe(first.id);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2); // no new calls
  });

  it('fetches fresh data after cache expiry', async () => {
    const streams = makeStreams(3);
    const ID = '777';
    const TOKEN = 'tok';

    // Write an expired cache entry (8 days ago)
    const expired = {
      route: streamsToRoute(ID, 'Old', streams),
      cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    };
    lsMock.setItem(`strava-activity-${ID}`, JSON.stringify(expired));

    mockFetchSuccess(streams, 'Fresh Ride');
    const result = await importStravaActivity(ID, TOKEN);
    expect(result.name).toBe('Fresh Ride');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('returns the cached route when cache is fresh', async () => {
    const streams = makeStreams(2);
    const ID = '888';
    const route = streamsToRoute(ID, 'Warm Cache', streams);

    // Write fresh cache
    lsMock.setItem(`strava-activity-${ID}`, JSON.stringify({ route, cachedAt: Date.now() }));

    const result = await importStravaActivity(ID, 'any-token');
    expect(result.name).toBe('Warm Cache');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
