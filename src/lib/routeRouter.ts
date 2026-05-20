/**
 * OSRM cycling routing — snap a list of waypoints to real-world cycling
 * roads. Used by the route drawer so clicks anywhere in the world stitch
 * together along actual streets, paths and bike infrastructure instead of
 * cutting great-circle lines across cities.
 *
 * Talks to the public OSRM demo at router.project-osrm.org (CORS-open,
 * key-less, ~1 req/sec rate limit). One request per finished route —
 * coordinates are batched into a single semicolon-separated path, so a
 * 10-point drawing is still one network round-trip.
 *
 * On any failure (network, HTTP, OSRM "no route"), throws OsrmRoutingError
 * so the caller can degrade gracefully (drawRoute falls back to the raw
 * great-circle path so the user always gets *some* route).
 *
 * No backend, no API key — keeps GlobeRide's local-first promise intact.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export type OsrmErrorCode = 'http' | 'no_route' | 'network' | 'parse' | 'too_few_waypoints';

export class OsrmRoutingError extends Error {
  readonly code: OsrmErrorCode;
  constructor(message: string, code: OsrmErrorCode) {
    super(message);
    this.name = 'OsrmRoutingError';
    this.code = code;
  }
}

export interface SnapOptions {
  /** Override the OSRM server (e.g. a self-hosted instance). */
  endpoint?: string;
  /** Abort signal so callers can cancel a long fetch. */
  signal?: AbortSignal;
}

const DEFAULT_ENDPOINT = 'https://router.project-osrm.org/route/v1/cycling';
/** OSRM has a coordinate cap per request; chunking covers very long drawings. */
const MAX_WAYPOINTS_PER_REQUEST = 100;

/**
 * Build the OSRM URL for a sequence of waypoints. Pure — exposed for tests.
 */
export function buildOsrmUrl(waypoints: LatLon[], endpoint: string = DEFAULT_ENDPOINT): string {
  const coords = waypoints.map((w) => `${w.lon},${w.lat}`).join(';');
  return `${endpoint}/${coords}?overview=full&geometries=geojson&steps=false`;
}

/**
 * Extract the LatLon polyline from an OSRM /route/v1/cycling response.
 * Pure — exposed for tests and reuse without the fetch surface.
 *
 * Throws OsrmRoutingError when the payload isn't a usable cycling route.
 */
export function parseOsrmResponse(data: unknown): LatLon[] {
  if (!isObject(data)) {
    throw new OsrmRoutingError('OSRM response was not an object', 'parse');
  }
  const code = (data as { code?: unknown }).code;
  if (code !== 'Ok') {
    const detail = typeof code === 'string' ? code : 'unknown';
    throw new OsrmRoutingError(`OSRM did not find a route (${detail})`, 'no_route');
  }
  const routes = (data as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new OsrmRoutingError('OSRM returned no routes', 'no_route');
  }
  const first = routes[0];
  if (!isObject(first)) throw new OsrmRoutingError('OSRM route was not an object', 'parse');
  const geometry = (first as { geometry?: unknown }).geometry;
  if (!isObject(geometry)) throw new OsrmRoutingError('Missing route geometry', 'parse');
  const coords = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new OsrmRoutingError('Geometry has fewer than two coordinates', 'parse');
  }
  const out: LatLon[] = [];
  for (const pair of coords) {
    if (!Array.isArray(pair) || pair.length < 2) {
      throw new OsrmRoutingError('Invalid coordinate pair in geometry', 'parse');
    }
    const lon = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new OsrmRoutingError('Non-finite coordinate in geometry', 'parse');
    }
    out.push({ lat, lon });
  }
  return out;
}

/**
 * Snap a sequence of click-waypoints to real cycling roads via OSRM.
 *
 * For long drawings (>100 waypoints) the request is split into chunks
 * with a 1-waypoint overlap so each segment of road geometry is fetched
 * exactly once. The chunks are concatenated into a single polyline.
 *
 * Returns a flat polyline of LatLon points sampling the road geometry.
 * Throws OsrmRoutingError on any failure — callers decide whether to
 * fall back to the raw waypoints.
 */
export async function snapToCyclingRoads(
  waypoints: LatLon[],
  opts: SnapOptions = {},
): Promise<LatLon[]> {
  if (waypoints.length < 2) {
    throw new OsrmRoutingError('Need at least 2 waypoints to route', 'too_few_waypoints');
  }
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;

  // Single-request fast path covers the overwhelming majority of drawings.
  if (waypoints.length <= MAX_WAYPOINTS_PER_REQUEST) {
    return fetchAndParse(waypoints, endpoint, opts.signal);
  }

  // Chunked path for unusually long drawings — overlap 1 waypoint per chunk
  // so the seams join exactly and we avoid duplicate polyline vertices.
  const stride = MAX_WAYPOINTS_PER_REQUEST - 1;
  const out: LatLon[] = [];
  for (let i = 0; i < waypoints.length - 1; i += stride) {
    const chunk = waypoints.slice(i, i + MAX_WAYPOINTS_PER_REQUEST);
    if (chunk.length < 2) break;
    const segment = await fetchAndParse(chunk, endpoint, opts.signal);
    // Drop the leading point of every chunk after the first to dedupe the seam.
    if (out.length > 0) segment.shift();
    out.push(...segment);
  }
  if (out.length < 2) {
    throw new OsrmRoutingError('Chunked OSRM responses produced no geometry', 'parse');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function fetchAndParse(
  waypoints: LatLon[],
  endpoint: string,
  signal?: AbortSignal,
): Promise<LatLon[]> {
  const url = buildOsrmUrl(waypoints, endpoint);
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network error';
    throw new OsrmRoutingError(detail, 'network');
  }
  if (!response.ok) {
    throw new OsrmRoutingError(`OSRM HTTP ${response.status}`, 'http');
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new OsrmRoutingError('OSRM response was not valid JSON', 'parse');
  }
  return parseOsrmResponse(json);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
