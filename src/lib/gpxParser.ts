import type { Route, RoutePoint } from '@/types';
import { haversine, shortId } from '@/lib/utils';

/**
 * Parse a GPX 1.1 document into a normalized Route. Handles single- and
 * multi-segment tracks, falls back to <rte><rtept> waypoints if no <trk> is
 * present, and gracefully tolerates missing elevation.
 */
export function parseGpx(xml: string, fallbackName = 'GPX route'): Route {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const parserErr = doc.querySelector('parsererror');
  if (parserErr) throw new Error('Invalid GPX file: XML parse error');

  const nameEl =
    doc.querySelector('trk > name') ||
    doc.querySelector('metadata > name') ||
    doc.querySelector('rte > name');
  const name = nameEl?.textContent?.trim() || fallbackName;

  const trkpts = Array.from(doc.querySelectorAll('trkpt'));
  const elements: Element[] = trkpts.length > 0 ? trkpts : Array.from(doc.querySelectorAll('rtept'));

  if (elements.length < 2) {
    throw new Error('GPX file must contain at least 2 track points');
  }

  const raw: { lat: number; lon: number; ele: number; time?: string }[] = [];
  for (const el of elements) {
    const lat = parseFloat(el.getAttribute('lat') ?? '');
    const lon = parseFloat(el.getAttribute('lon') ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleText = el.querySelector('ele')?.textContent;
    const timeText = el.querySelector('time')?.textContent ?? undefined;
    const ele = eleText ? parseFloat(eleText) : 0;
    raw.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0, time: timeText });
  }

  // Backfill elevation if any are missing (use nearest neighbor).
  let lastEle = raw.find((p) => Number.isFinite(p.ele))?.ele ?? 0;
  for (const p of raw) {
    if (!Number.isFinite(p.ele) || p.ele === 0) p.ele = lastEle;
    else lastEle = p.ele;
  }

  return buildRoute(name, raw);
}

/** Build a normalized Route from raw lat/lon/ele points. */
export function buildRoute(
  name: string,
  raw: { lat: number; lon: number; ele: number; time?: string }[],
): Route {
  // Cumulative distance + ascent / descent.
  const points: RoutePoint[] = [];
  let dist = 0;
  let ascent = 0;
  let descent = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;

  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (i > 0) {
      const prev = raw[i - 1];
      const d = haversine(prev.lat, prev.lon, p.lat, p.lon);
      // Throw out zero-distance duplicates (some Strava GPX exports double up).
      if (d < 0.01) continue;
      dist += d;
      const dEle = p.ele - prev.ele;
      if (dEle > 0) ascent += dEle;
      else descent -= dEle;
    }
    points.push({ lat: p.lat, lon: p.lon, ele: p.ele, distance: dist, time: p.time });
    if (p.ele < minEle) minEle = p.ele;
    if (p.ele > maxEle) maxEle = p.ele;
  }

  if (points.length < 2) throw new Error('Route collapsed to <2 points after deduplication');

  return {
    id: shortId(),
    name,
    points,
    totalDistance: dist,
    ascent,
    descent,
    minElevation: minEle,
    maxElevation: maxEle,
    loadedAt: Date.now(),
  };
}

/**
 * Resolve a point on the route by cumulative distance (meters).
 * Returns interpolated lat/lon/ele/grade plus the two source indices.
 */
export function sampleRouteAtDistance(
  route: Route,
  distance: number,
): { lat: number; lon: number; ele: number; index: number; t: number } {
  const pts = route.points;
  const d = Math.max(0, Math.min(distance, route.totalDistance));
  // Binary search.
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].distance <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[Math.min(lo + 1, pts.length - 1)];
  const span = b.distance - a.distance;
  const t = span > 0 ? (d - a.distance) / span : 0;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    ele: a.ele + (b.ele - a.ele) * t,
    index: lo,
    t,
  };
}

/**
 * Heading of the route tangent at a cumulative distance — radians, clockwise
 * from north. Samples a short span either side so the tangent stays stable.
 * Pure (no Cesium dependency) so the ride loop and viewer can both use it.
 */
export function headingAt(route: Route, distance: number): number {
  const span = 4; // metres either side
  const a = sampleRouteAtDistance(route, Math.max(0, distance - span));
  const b = sampleRouteAtDistance(route, Math.min(route.totalDistance, distance + span));
  const dEast = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
  const dNorth = b.lat - a.lat;
  if (dEast === 0 && dNorth === 0) return 0;
  return Math.atan2(dEast, dNorth);
}
