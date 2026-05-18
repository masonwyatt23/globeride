/**
 * Public elevation lookups — no API key required.
 *
 * Primary:  OpenTopoData SRTM30m  (https://api.opentopodata.org)
 * Fallback: Open-Elevation        (https://api.open-elevation.com)
 *
 * Both services ask for at most 100 locations per request and prefer ~1 req/s.
 * We batch the input, throttle at 1100 ms between requests (same pattern as
 * geocoder.ts), and fall back gracefully so a failed lookup never crashes the
 * ride.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

// ---- throttle / serialization (same pattern as geocoder.ts) ----------------

const MIN_GAP_MS = 1100;
let lastRequestAt = 0;
let requestChain: Promise<unknown> = Promise.resolve();

function nextSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  requestChain = run.catch(() => undefined);
  return run;
}

// ---- OpenTopoData ----------------------------------------------------------

const OTD_ENDPOINT = 'https://api.opentopodata.org/v1/srtm30m';
const MAX_PER_REQUEST = 100;

interface OtdResult {
  elevation: number | null;
  location: { lat: number; lng: number };
}
interface OtdResponse {
  results?: OtdResult[];
  status?: string;
}

async function fetchOpenTopoDataBatch(pts: LatLon[]): Promise<(number | null)[]> {
  const locations = pts.map((p) => `${p.lat},${p.lon}`).join('|');
  const res = await fetch(`${OTD_ENDPOINT}?locations=${encodeURIComponent(locations)}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`OpenTopoData ${res.status}`);
  const data = (await res.json()) as OtdResponse;
  if (!data.results) throw new Error('OpenTopoData: no results');
  return data.results.map((r) => (r.elevation != null && Number.isFinite(r.elevation) ? r.elevation : null));
}

// ---- Open-Elevation fallback -----------------------------------------------

const OE_ENDPOINT = 'https://api.open-elevation.com/api/v1/lookup';

interface OeResult { elevation: number }
interface OeResponse { results?: OeResult[] }

async function fetchOpenElevationBatch(pts: LatLon[]): Promise<(number | null)[]> {
  const body = { locations: pts.map((p) => ({ latitude: p.lat, longitude: p.lon })) };
  const res = await fetch(OE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Open-Elevation ${res.status}`);
  const data = (await res.json()) as OeResponse;
  if (!data.results) throw new Error('Open-Elevation: no results');
  return data.results.map((r) =>
    r.elevation != null && Number.isFinite(r.elevation) ? r.elevation : null,
  );
}

// ---- public API ------------------------------------------------------------

/**
 * Fetch real-world elevations (meters) for an ordered array of lat/lon points.
 *
 * - Batches up to 100 locations per HTTP request.
 * - Serializes requests at ≥1.1 s spacing so we stay within the public
 *   service rate limits.
 * - Falls back to open-elevation.com if OpenTopoData fails.
 * - If both fail, fills missing values with 0 so the ride still works
 *   (flat, but rideable).
 *
 * Returns an array of elevations (meters) parallel to `points`.
 */
export async function fetchElevations(points: LatLon[]): Promise<number[]> {
  if (points.length === 0) return [];

  // Split into batches of ≤100.
  const batches: LatLon[][] = [];
  for (let i = 0; i < points.length; i += MAX_PER_REQUEST) {
    batches.push(points.slice(i, i + MAX_PER_REQUEST));
  }

  const results: (number | null)[] = new Array(points.length).fill(null);
  let offset = 0;

  for (const batch of batches) {
    // Each batch is queued through the shared throttle chain.
    // eslint-disable-next-line no-await-in-loop
    const elevs = await nextSlot(async () => {
      try {
        return await fetchOpenTopoDataBatch(batch);
      } catch (primaryErr) {
        // Primary failed — try the fallback.
        try {
          return await fetchOpenElevationBatch(batch);
        } catch {
          // Both failed: return nulls for the whole batch.
          console.warn('[elevation] Both services failed for batch:', primaryErr);
          return batch.map(() => null);
        }
      }
    });

    for (let i = 0; i < elevs.length; i++) {
      results[offset + i] = elevs[i];
    }
    offset += batch.length;
  }

  // Backfill nulls with nearest-neighbor so we never return NaN.
  let lastGood = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i] != null) lastGood = results[i] as number;
    else results[i] = lastGood;
  }

  return results as number[];
}

// ---- Polyline resampling ---------------------------------------------------

import { haversine } from '@/lib/utils';

/**
 * Resample a polyline so consecutive points are at most `spacingM` meters
 * apart (default 30 m). This ensures gradient calc is smooth after elevation
 * lookup — coarse GPS points would otherwise produce jagged gradients.
 *
 * The first and last points are always preserved.
 */
export function resamplePolyline(
  pts: LatLon[],
  spacingM = 30,
): LatLon[] {
  if (pts.length < 2) return pts.slice();

  const out: LatLon[] = [pts[0]];

  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const segLen = haversine(prev.lat, prev.lon, cur.lat, cur.lon);

    if (segLen <= spacingM) {
      out.push(cur);
      continue;
    }

    // Insert intermediate points at `spacingM` spacing along this segment.
    const steps = Math.ceil(segLen / spacingM);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        lat: prev.lat + (cur.lat - prev.lat) * t,
        lon: prev.lon + (cur.lon - prev.lon) * t,
      });
    }
  }

  return out;
}
