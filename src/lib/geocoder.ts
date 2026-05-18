/**
 * Nominatim (OpenStreetMap) geocoding client.
 *
 * Public, key-less, and free — but per
 * https://operations.osmfoundation.org/policies/nominatim/ we MUST:
 *   1. Cap traffic at 1 request / second. We enforce this at the module level
 *      so concurrent callers serialize through a single token bucket.
 *   2. Identify the app. Browsers ignore User-Agent overrides on fetch, so we
 *      rely on the auto-set Referer plus a custom header that the
 *      Nominatim operators can grep for if needed.
 *   3. Cache results client-side. We keep a small LRU keyed on the trimmed
 *      query so typing the same prefix back doesn't repeatedly hit OSM.
 */

export interface GeocodeResult {
  placeId: number;
  displayName: string;
  /** A short label — first comma-separated chunk of displayName. */
  shortName: string;
  lat: number;
  lon: number;
  /** Bounding box [south, north, west, east] in degrees, when available. */
  boundingBox?: [number, number, number, number];
  /** Best-guess OSM type — "city", "village", "peak", "road", … */
  type?: string;
  importance?: number;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MIN_GAP_MS = 1100; // Stay comfortably below 1 req/s.
const CACHE_SIZE = 32;

let lastRequestAt = 0;
let chain: Promise<unknown> = Promise.resolve();
const cache = new Map<string, GeocodeResult[]>();

interface NominatimRow {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
  type?: string;
  importance?: number;
}

/** Serialize callers and stagger them at least MIN_GAP_MS apart. */
function nextSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  // Keep chain alive even if `fn` rejects.
  chain = run.catch(() => undefined);
  return run;
}

function cachePut(key: string, value: GeocodeResult[]): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

/**
 * Geocode a free-form query. Returns up to `limit` results, deduplicated and
 * ranked by Nominatim's own importance score.
 *
 * Honors a 1.1 s minimum gap between outgoing requests — concurrent callers
 * are serialized via a shared promise chain.
 */
export async function geocode(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const limit = opts.limit ?? 6;
  const cacheKey = `${limit}::${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  return nextSlot(async () => {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: String(limit),
      addressdetails: '0',
    });

    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: {
        // Browsers refuse to override User-Agent — Referer is auto-set to the
        // app origin, which already identifies us. Accept-Language biases
        // display names toward the user's locale.
        'Accept-Language': navigator.language || 'en',
        // Custom header that survives same-origin restrictions, so Nominatim
        // operators can correlate traffic back to GlobeRide if needed.
        'X-Client-App': 'globeride/route-search',
      },
      signal: opts.signal,
    });
    if (!res.ok) {
      throw new Error(`Nominatim ${res.status}: ${res.statusText}`);
    }

    const rows = (await res.json()) as NominatimRow[];
    const results = rows
      .map((r): GeocodeResult => {
        const lat = parseFloat(r.lat);
        const lon = parseFloat(r.lon);
        const display = r.display_name ?? '';
        return {
          placeId: r.place_id,
          displayName: display,
          shortName: display.split(',')[0]?.trim() || display,
          lat,
          lon,
          boundingBox: r.boundingbox
            ? [
                parseFloat(r.boundingbox[0]),
                parseFloat(r.boundingbox[1]),
                parseFloat(r.boundingbox[2]),
                parseFloat(r.boundingbox[3]),
              ]
            : undefined,
          type: r.type,
          importance: r.importance,
        };
      })
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));

    cachePut(cacheKey, results);
    return results;
  });
}
