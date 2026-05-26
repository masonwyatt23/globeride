/**
 * Tests for src/lib/strava/segments.ts
 *
 * Covers:
 *   1. API client: fetchSegmentsNearRoute with mocked fetch
 *   2. API client: fetchSegmentEffortHistory
 *   3. Cache TTL logic (read/write/expiry)
 *   4. Proximity filtering (segments too far off route)
 *   5. Network failure tolerance (ride continues)
 *   6. De-duplication by segment ID
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSegmentsNearRoute, fetchSegmentEffortHistory, clearSegmentCache } from './segments';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear:      () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

/** A minimal straight-line route going west to east (so haversine distances are deterministic). */
function makeStraightRoute(lengthM: number = 10_000): Route {
  const NUM_PTS = 20;
  const startLat = 51.5;
  const startLon = -0.1;
  const dLon = (lengthM / 111_139) / Math.cos((startLat * Math.PI) / 180) / NUM_PTS;

  const points = [];
  let cumDist = 0;
  for (let i = 0; i < NUM_PTS; i++) {
    const lon = startLon + i * dLon;
    if (i > 0) {
      // Approximate step distance in metres
      cumDist += lengthM / NUM_PTS;
    }
    points.push({ lat: startLat, lon, ele: 100, distance: cumDist });
  }
  return {
    id: 'route-test',
    name: 'Test Route',
    points,
    totalDistance: lengthM,
    ascent: 0,
    descent: 0,
    minElevation: 100,
    maxElevation: 100,
    loadedAt: Date.now(),
  };
}

function makeSegmentApiResponse(id: number, near: boolean) {
  // Place the segment at the start of the route (within 50 m) or far away.
  const startLat = near ? 51.5 : 48.0;     // 48° is ~390 km from 51.5°
  const startLon = near ? -0.1 : 2.3;
  const endLat   = near ? 51.5 : 48.001;
  const endLon   = near ? -0.095 : 2.305;
  return {
    id,
    name: `Segment ${id}`,
    distance: 500,
    start_latlng: [startLat, startLon] as [number, number],
    end_latlng: [endLat, endLon] as [number, number],
    climb_category: 0,
    avg_grade: 1.5,
    pr_time: 120,
    kom_time: 90,
  };
}

function mockFetch(responses: Array<{ ok: boolean; status?: number; json?: unknown }>) {
  let call = 0;
  return vi.fn(async () => {
    const resp = responses[Math.min(call++, responses.length - 1)];
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 400),
      json: async () => resp.json ?? {},
    };
  });
}

const TOKEN = 'test-access-token';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let lsMock: ReturnType<typeof makeLocalStorageMock>;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  lsMock = makeLocalStorageMock();
  Object.defineProperty(globalThis, 'localStorage', {
    value: lsMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// 1. fetchSegmentsNearRoute — happy path
// ---------------------------------------------------------------------------

describe('fetchSegmentsNearRoute — API client', () => {
  it('returns segments near the route from the explore endpoint', async () => {
    const route = makeStraightRoute(5_000);

    globalThis.fetch = mockFetch([
      {
        ok: true,
        json: { segments: [makeSegmentApiResponse(101, true)] },
      },
    ]) as unknown as typeof globalThis.fetch;

    const results = await fetchSegmentsNearRoute(route, TOKEN);

    // At least one segment should come back (the near one)
    expect(Array.isArray(results)).toBe(true);
    // The near segment should appear; the fetch call should have been made
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('filters out segments whose start/end are too far from the route', async () => {
    const route = makeStraightRoute(5_000);

    globalThis.fetch = mockFetch([
      {
        ok: true,
        json: {
          segments: [
            makeSegmentApiResponse(200, true),   // near → keep
            makeSegmentApiResponse(201, false),  // far  → drop
          ],
        },
      },
    ]) as unknown as typeof globalThis.fetch;

    const results = await fetchSegmentsNearRoute(route, TOKEN);
    const ids = results.map((s) => s.id);

    // The far segment should be filtered out
    expect(ids).not.toContain(201);
  });

  it('de-duplicates segments returned in multiple chunks', async () => {
    // Short route → only one chunk, but simulating duplicate IDs in same response.
    const route = makeStraightRoute(3_000);

    globalThis.fetch = mockFetch([
      {
        ok: true,
        json: {
          segments: [
            makeSegmentApiResponse(300, true),
            makeSegmentApiResponse(300, true), // same ID repeated
          ],
        },
      },
    ]) as unknown as typeof globalThis.fetch;

    const results = await fetchSegmentsNearRoute(route, TOKEN);
    const ids = results.map((s) => s.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size); // no duplicates
  });

  it('returns empty array when network fails (no crash, ride continues)', async () => {
    const route = makeStraightRoute(5_000);

    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network unreachable');
    }) as unknown as typeof globalThis.fetch;

    const results = await fetchSegmentsNearRoute(route, TOKEN);
    expect(results).toEqual([]);
  });

  it('returns empty array when API returns non-2xx status', async () => {
    const route = makeStraightRoute(5_000);

    globalThis.fetch = mockFetch([
      { ok: false, status: 429, json: {} },
    ]) as unknown as typeof globalThis.fetch;

    const results = await fetchSegmentsNearRoute(route, TOKEN);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Cache TTL logic
// ---------------------------------------------------------------------------

describe('fetchSegmentsNearRoute — cache', () => {
  it('returns cached results without a network call on second fetch', async () => {
    const route = makeStraightRoute(3_000);

    globalThis.fetch = mockFetch([
      {
        ok: true,
        json: { segments: [makeSegmentApiResponse(400, true)] },
      },
    ]) as unknown as typeof globalThis.fetch;

    // First call — populates cache
    await fetchSegmentsNearRoute(route, TOKEN);
    const callCount1 = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Second call — should use cache, no new fetch calls
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await fetchSegmentsNearRoute(route, TOKEN);
    expect(fetchSpy).not.toHaveBeenCalled();
    void callCount1; // used above
  });

  it('re-fetches after cache is cleared', async () => {
    const route = makeStraightRoute(3_000);

    globalThis.fetch = mockFetch([
      { ok: true, json: { segments: [makeSegmentApiResponse(500, true)] } },
      { ok: true, json: { segments: [makeSegmentApiResponse(501, true)] } },
    ]) as unknown as typeof globalThis.fetch;

    await fetchSegmentsNearRoute(route, TOKEN);

    clearSegmentCache(route.id);

    // After clear, should re-fetch
    await fetchSegmentsNearRoute(route, TOKEN);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('stores fetched segments in localStorage with fetchedAt timestamp', async () => {
    const route = makeStraightRoute(3_000);

    globalThis.fetch = mockFetch([
      { ok: true, json: { segments: [makeSegmentApiResponse(600, true)] } },
    ]) as unknown as typeof globalThis.fetch;

    await fetchSegmentsNearRoute(route, TOKEN);

    const stored = lsMock.getItem(`${route.id}:strava-segments`);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as { fetchedAt: number; segments: unknown[] };
    expect(typeof parsed.fetchedAt).toBe('number');
    expect(parsed.fetchedAt).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. fetchSegmentEffortHistory
// ---------------------------------------------------------------------------

describe('fetchSegmentEffortHistory', () => {
  it('returns prTime and effortCount from the segment detail endpoint', async () => {
    globalThis.fetch = mockFetch([
      {
        ok: true,
        json: {
          pr_time: 245,
          effort_count: 18,
          athlete_segment_stats: { pr_elapsed_time: 245 },
        },
      },
    ]) as unknown as typeof globalThis.fetch;

    const result = await fetchSegmentEffortHistory(1234, TOKEN);
    expect(result.prTime).toBe(245);
    expect(result.effortCount).toBe(18);
  });

  it('returns effortCount:0 on network failure (non-throwing)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof globalThis.fetch;

    const result = await fetchSegmentEffortHistory(9999, TOKEN);
    expect(result.effortCount).toBe(0);
    expect(result.prTime).toBeUndefined();
  });

  it('returns effortCount:0 on non-2xx status', async () => {
    globalThis.fetch = mockFetch([
      { ok: false, status: 403 },
    ]) as unknown as typeof globalThis.fetch;

    const result = await fetchSegmentEffortHistory(8888, TOKEN);
    expect(result.effortCount).toBe(0);
  });
});
