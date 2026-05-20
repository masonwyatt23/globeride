import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OsrmRoutingError,
  buildOsrmUrl,
  parseOsrmResponse,
  snapToCyclingRoads,
} from '@/lib/routeRouter';

describe('buildOsrmUrl', () => {
  it('formats lon,lat pairs separated by semicolons with the cycling profile', () => {
    const url = buildOsrmUrl([
      { lat: 46.59, lon: 7.91 },
      { lat: 46.6,  lon: 7.92 },
    ]);
    // OSRM expects lon,lat order — the rest of the codebase uses {lat,lon} so
    // this transform is the bug-prone bit. Lock it down.
    expect(url).toContain('7.91,46.59;7.92,46.6');
    expect(url).toContain('/route/v1/cycling/');
    expect(url).toContain('geometries=geojson');
    expect(url).toContain('overview=full');
  });

  it('honours a custom endpoint override', () => {
    const url = buildOsrmUrl(
      [
        { lat: 0, lon: 0 },
        { lat: 1, lon: 1 },
      ],
      'http://localhost:5000/route/v1/cycling',
    );
    expect(url.startsWith('http://localhost:5000/route/v1/cycling/0,0;1,1')).toBe(true);
  });
});

describe('parseOsrmResponse', () => {
  const okResponse = {
    code: 'Ok',
    routes: [
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [7.91, 46.59],
            [7.915, 46.595],
            [7.92, 46.6],
          ],
        },
      },
    ],
  };

  it('extracts the polyline as lat/lon (NOT lon/lat) objects', () => {
    const poly = parseOsrmResponse(okResponse);
    expect(poly).toEqual([
      { lat: 46.59,  lon: 7.91 },
      { lat: 46.595, lon: 7.915 },
      { lat: 46.6,   lon: 7.92 },
    ]);
  });

  it('throws no_route when OSRM signals failure', () => {
    const err = catchErr(() => parseOsrmResponse({ code: 'NoRoute' }));
    expect(err).toBeInstanceOf(OsrmRoutingError);
    expect(err?.code).toBe('no_route');
  });

  it('throws no_route when routes is missing or empty', () => {
    expect(catchErr(() => parseOsrmResponse({ code: 'Ok' }))?.code).toBe('no_route');
    expect(catchErr(() => parseOsrmResponse({ code: 'Ok', routes: [] }))?.code).toBe('no_route');
  });

  it('throws parse on malformed geometry', () => {
    expect(catchErr(() => parseOsrmResponse({ code: 'Ok', routes: [{}] }))?.code).toBe('parse');
    expect(
      catchErr(() =>
        parseOsrmResponse({ code: 'Ok', routes: [{ geometry: { coordinates: [[1, 2]] } }] }),
      )?.code,
    ).toBe('parse');
    expect(
      catchErr(() =>
        parseOsrmResponse({
          code: 'Ok',
          routes: [{ geometry: { coordinates: [['a', 'b'], [1, 2]] } }],
        }),
      )?.code,
    ).toBe('parse');
  });

  it('throws parse on a non-object payload', () => {
    expect(catchErr(() => parseOsrmResponse(null))?.code).toBe('parse');
    expect(catchErr(() => parseOsrmResponse('nope'))?.code).toBe('parse');
  });
});

describe('snapToCyclingRoads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects when there are fewer than 2 waypoints', async () => {
    await expect(snapToCyclingRoads([])).rejects.toMatchObject({ code: 'too_few_waypoints' });
    await expect(snapToCyclingRoads([{ lat: 0, lon: 0 }])).rejects.toMatchObject({
      code: 'too_few_waypoints',
    });
  });

  it('returns the parsed polyline on a successful single-request response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 'Ok',
            routes: [{ geometry: { coordinates: [[1, 2], [3, 4]] } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const out = await snapToCyclingRoads([
      { lat: 2, lon: 1 },
      { lat: 4, lon: 3 },
    ]);
    expect(out).toEqual([
      { lat: 2, lon: 1 },
      { lat: 4, lon: 3 },
    ]);
  });

  it('throws http on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(
      snapToCyclingRoads([
        { lat: 0, lon: 0 },
        { lat: 1, lon: 1 },
      ]),
    ).rejects.toMatchObject({ code: 'http' });
  });

  it('throws network on a fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(
      snapToCyclingRoads([
        { lat: 0, lon: 0 },
        { lat: 1, lon: 1 },
      ]),
    ).rejects.toMatchObject({ code: 'network' });
  });
});

function catchErr(fn: () => unknown): OsrmRoutingError | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof OsrmRoutingError ? e : undefined;
  }
  return undefined;
}
