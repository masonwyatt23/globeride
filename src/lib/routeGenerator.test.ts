import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  RouteGenerationError,
  generateRoute,
  loopSeedWaypoints,
  outAndBackSeedWaypoints,
} from '@/lib/routeGenerator';

describe('outAndBackSeedWaypoints', () => {
  it('returns the origin and a single turnaround point at the requested distance', () => {
    const seeds = outAndBackSeedWaypoints({ lat: 46.59, lon: 7.91 }, 4000, 0);
    expect(seeds).toHaveLength(2);
    // Origin echoed verbatim.
    expect(seeds[0]).toEqual({ lat: 46.59, lon: 7.91 });
    // Turnaround should be ~2 km (4 km / 2) due north — lon barely shifts,
    // lat shifts by roughly 2000 m / 111_320 m ≈ 0.018°.
    expect(seeds[1].lon).toBeCloseTo(7.91, 3);
    expect(seeds[1].lat).toBeGreaterThan(46.59);
    expect(seeds[1].lat - 46.59).toBeCloseTo(0.018, 2);
  });
});

describe('loopSeedWaypoints', () => {
  it('returns N+1 points with the last equal to the first (closed loop)', () => {
    const seeds = loopSeedWaypoints({ lat: 0, lon: 0 }, 8000, 0);
    expect(seeds.length).toBe(9); // 8 around the ring + 1 closing duplicate
    expect(seeds[seeds.length - 1]).toEqual(seeds[0]);
  });

  it('spreads points around a circle whose circumference matches lengthM', () => {
    const seeds = loopSeedWaypoints({ lat: 0, lon: 0 }, 8000, 0);
    // Drop the closing duplicate.
    const ring = seeds.slice(0, -1);
    // The 8 points should be roughly equidistant from origin.
    const dists = ring.map((p) => Math.hypot(p.lat, p.lon));
    const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
    for (const d of dists) {
      // Within 2 % of the mean (great-circle distortion at equator is tiny).
      expect(Math.abs(d - mean) / mean).toBeLessThan(0.02);
    }
  });
});

describe('generateRoute', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockOsrmOk(coords: [number, number][]): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 'Ok',
            routes: [{ geometry: { coordinates: coords } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
  }

  it('produces a usable Route from an OSRM-snapped out-and-back', async () => {
    mockOsrmOk([
      [7.91, 46.59],
      [7.913, 46.595],
      [7.916, 46.6],
    ]);

    const phases: string[] = [];
    const route = await generateRoute(
      { lat: 46.59, lon: 7.91 },
      {
        shape: 'out-and-back',
        lengthKm: 4,
        headingDeg: 0,
        name: 'Test out-and-back',
        onPhase: (p) => phases.push(p),
      },
    );

    expect(route.name).toBe('Test out-and-back');
    expect(route.points.length).toBeGreaterThan(2);
    // The polyline is mirrored so the route returns to the origin (within ~1
    // metre after resampling rounding).
    const first = route.points[0];
    const last = route.points[route.points.length - 1];
    const dEast = (last.lon - first.lon) * 111000;
    const dNorth = (last.lat - first.lat) * 111000;
    expect(Math.hypot(dEast, dNorth)).toBeLessThan(50);
    // Phases reported in order.
    expect(phases).toEqual(['routing', 'smoothing', 'done']);
  });

  it('throws RouteGenerationError(osrm_no_route) when OSRM cannot route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 'NoRoute' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      generateRoute(
        { lat: 0, lon: 0 },
        { shape: 'out-and-back', lengthKm: 5, headingDeg: 90, name: 'Nowhere' },
      ),
    ).rejects.toMatchObject({
      name: 'RouteGenerationError',
      code: 'osrm_no_route',
    });
  });

  it('throws RouteGenerationError(osrm_network) on a fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const err = await generateRoute(
      { lat: 46.59, lon: 7.91 },
      { shape: 'loop', lengthKm: 8, name: 'Loop' },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(RouteGenerationError);
    expect((err as RouteGenerationError).code).toBe('osrm_network');
  });

  it('with useSynthetic: true skips OSRM entirely and still builds a route', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);

    const route = await generateRoute(
      { lat: 46.59, lon: 7.91 },
      {
        shape: 'loop',
        lengthKm: 6,
        headingDeg: 0,
        name: 'Synthetic loop',
        useSynthetic: true,
      },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(route.points.length).toBeGreaterThan(2);
    expect(route.totalDistance).toBeGreaterThan(0);
  });
});
