/**
 * Spectator crowd system for iconic World Tour climbs (Wave 30.D).
 *
 * When a route matches a World Tour stage that has `spectatorClimbs` defined,
 * this module places billboard sprites along the final km of named climbs —
 * cheering crowds on alternating sides of the road, fading in as the rider
 * approaches.
 *
 * Density gating:
 *   low     → ×0.5
 *   medium  → ×0.75
 *   high    → ×1.0
 *   ultra   → ×1.0   (same cap as high; extra density is imperceptible)
 */

import * as Cesium from 'cesium';
import type { Route } from '@/types';
import { WORLD_TOUR_STAGES } from '@/lib/worldTourStages';
import { sampleRouteAtDistance } from '@/lib/gpxParser';
import type { GraphicsQuality } from '@/lib/graphicsQuality';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A distance-keyed section of the route where crowds line the road. */
export interface SpectatorZone {
  /** Distance from route start where the crowd begins, meters. */
  startDistance: number;
  /** Distance from route start where the crowd ends, meters. */
  endDistance: number;
  /** Target number of spectators per kilometer of road. */
  densityPerKm: number;
}

export type SpectatorSprite = 'cheering' | 'waving' | 'flag';

export interface SpectatorPosition {
  lat: number;
  lon: number;
  /** -1 = left of direction of travel, +1 = right. */
  sideOfRoad: -1 | 1;
  sprite: SpectatorSprite;
}

export interface SpectatorCollection {
  /** The underlying Cesium billboard collection. */
  collection: Cesium.BillboardCollection;
  /** Remove and destroy the collection cleanly. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Sprite URLs — procedurally generated via canvas-to-data-URL
// ---------------------------------------------------------------------------

/** Cache so we only rasterise each sprite once per session. */
const _spriteCache = new Map<SpectatorSprite, string>();

/**
 * Render a simple 32×64 pixel stick-figure sprite to a canvas and return a
 * data URL.  Three variants: cheering (arms up), waving (one arm raised),
 * flag (holding a yellow polka-dot flag).
 *
 * Deliberately low-res and impressionistic — at crowd distances in a Cesium
 * scene these billboards are tiny anyway.
 */
export function getSpriteDUrl(sprite: SpectatorSprite): string {
  const cached = _spriteCache.get(sprite);
  if (cached) return cached;

  const W = 32, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ---- body colours per sprite ----
  // Alternate jersey colours keyed to sprite type so the crowd looks varied.
  const jerseyColours: Record<SpectatorSprite, string> = {
    cheering: '#e11d48', // red
    waving:   '#2563eb', // blue
    flag:     '#16a34a', // green
  };
  const colour = jerseyColours[sprite];

  // ---- head ----
  ctx.fillStyle = '#f5d0a9';  // skin tone
  ctx.beginPath();
  ctx.arc(W / 2, 10, 6, 0, Math.PI * 2);
  ctx.fill();

  // ---- torso ----
  ctx.fillStyle = colour;
  ctx.fillRect(W / 2 - 5, 16, 10, 18);

  // ---- legs ----
  ctx.fillStyle = '#1e293b';  // dark trousers
  ctx.fillRect(W / 2 - 5, 34, 4, 18);
  ctx.fillRect(W / 2 + 1, 34, 4, 18);

  // ---- arms (pose depends on variant) ----
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  if (sprite === 'cheering') {
    // Both arms raised
    ctx.beginPath(); ctx.moveTo(W / 2 - 5, 20); ctx.lineTo(6, 8);   ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 5, 20); ctx.lineTo(W - 6, 8); ctx.stroke();
  } else if (sprite === 'waving') {
    // Left arm down, right arm raised
    ctx.beginPath(); ctx.moveTo(W / 2 - 5, 20); ctx.lineTo(6, 32);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 5, 20); ctx.lineTo(W - 6, 8); ctx.stroke();
  } else {
    // flag — right arm raised holding a yellow polka-dot flag
    ctx.beginPath(); ctx.moveTo(W / 2 - 5, 20); ctx.lineTo(6, 32);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 5, 20); ctx.lineTo(W - 6, 8); ctx.stroke();
    // flag rectangle
    ctx.fillStyle = '#fef08a';  // yellow
    ctx.fillRect(W - 6, 4, 10, 7);
    // polka dots
    ctx.fillStyle = '#dc2626';
    const dots = [[W - 3, 6], [W + 1, 9]] as const;
    for (const [dx, dy] of dots) {
      ctx.beginPath(); ctx.arc(dx, dy, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  const url = canvas.toDataURL('image/png');
  _spriteCache.set(sprite, url);
  return url;
}

// ---------------------------------------------------------------------------
// Density multiplier per quality tier
// ---------------------------------------------------------------------------

const QUALITY_DENSITY_SCALE: Record<string, number> = {
  low:    0.5,
  medium: 0.75,
  high:   1.0,
  ultra:  1.0,
};

function qualityScale(quality: GraphicsQuality | string): number {
  return QUALITY_DENSITY_SCALE[quality] ?? 1.0;
}

// ---------------------------------------------------------------------------
// Zone lookup
// ---------------------------------------------------------------------------

/**
 * Return the spectator zones for a route.  If the route ID matches a World
 * Tour stage that has `spectatorClimbs` defined, those climbs' zones are
 * returned; otherwise an empty array is returned (no crowds for plain GPX).
 */
export function spectatorZonesForRoute(route: Route): SpectatorZone[] {
  const match = WORLD_TOUR_STAGES.find((s) => s.route.id === route.id);
  if (!match) return [];
  const climbs = match.info.spectatorClimbs;
  if (!climbs || climbs.length === 0) return [];
  return climbs.map((c) => ({
    startDistance: c.startDistance,
    endDistance:   c.endDistance,
    densityPerKm:  c.densityPerKm,
  }));
}

// ---------------------------------------------------------------------------
// Position generation
// ---------------------------------------------------------------------------

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Produces deterministic results for the same seed so spectator positions
 * are stable across re-renders of the same route.
 */
function seededRng(seed: number) {
  let s = seed >>> 0;
  return (): number => {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Convert a route ID string to a numeric seed (simple djb2 hash).
 */
function routeIdToSeed(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h) ^ id.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Compute a lat/lon offset perpendicular to the route direction.
 *
 * @param lat      Current latitude (degrees)
 * @param lon      Current longitude (degrees)
 * @param heading  Route heading in radians (clockwise from north)
 * @param side     -1 = left, +1 = right
 * @param offsetM  How far off the road centre line to place the spectator (m)
 */
function perpendicularOffset(
  lat: number,
  lon: number,
  heading: number,
  side: -1 | 1,
  offsetM: number,
): { lat: number; lon: number } {
  // Perpendicular heading (rotate 90° left or right)
  const perpHeading = heading + (side * Math.PI) / 2;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);

  const dLat = (Math.cos(perpHeading) * offsetM) / mPerDegLat;
  const dLon = (Math.sin(perpHeading) * offsetM) / mPerDegLon;

  return { lat: lat + dLat, lon: lon + dLon };
}

/**
 * Generate spectator billboard positions for a route's zones.
 *
 * Positions are deterministic for the same route.id seed, alternate sides of
 * the road, and include a small random perpendicular jitter (3–6 m off road
 * centre) so the crowd looks natural rather than in a perfect line.
 *
 * Density is scaled by the active graphics quality tier.
 */
export function generateSpectatorPositions(
  route: Route,
  zones: SpectatorZone[],
  quality: GraphicsQuality | string = 'high',
): SpectatorPosition[] {
  if (zones.length === 0) return [];

  const rng = seededRng(routeIdToSeed(route.id));
  const scale = qualityScale(quality);
  const sprites: SpectatorSprite[] = ['cheering', 'waving', 'flag'];
  const positions: SpectatorPosition[] = [];

  for (const zone of zones) {
    const zoneLength = zone.endDistance - zone.startDistance;
    if (zoneLength <= 0) continue;

    // Number of spectators in this zone after quality scaling.
    const count = Math.round((zone.densityPerKm / 1000) * zoneLength * scale);
    if (count === 0) continue;

    // Evenly space spectators through the zone with small random jitter on
    // the along-road position so they don't look like a ruler grid.
    const spacing = zoneLength / count;

    for (let i = 0; i < count; i++) {
      // Jitter ±30% of spacing along the route.
      const jitter = (rng() - 0.5) * spacing * 0.6;
      const dist = Math.max(
        zone.startDistance,
        Math.min(zone.endDistance - 1, zone.startDistance + i * spacing + jitter),
      );

      const pt = sampleRouteAtDistance(route, dist);

      // Compute heading at this distance (forward difference, 5 m span).
      const ptAhead = sampleRouteAtDistance(
        route,
        Math.min(route.totalDistance, dist + 5),
      );
      const dEast  = (ptAhead.lon - pt.lon) * Math.cos((pt.lat * Math.PI) / 180);
      const dNorth = ptAhead.lat - pt.lat;
      const heading = Math.atan2(dEast, dNorth);

      // Alternate sides: even spectators on left (-1), odd on right (+1).
      const side: -1 | 1 = i % 2 === 0 ? -1 : 1;

      // Perpendicular offset: 3–6 m from road centre, jittered.
      const offsetM = 3 + rng() * 3;
      const { lat, lon } = perpendicularOffset(pt.lat, pt.lon, heading, side, offsetM);

      positions.push({
        lat,
        lon,
        sideOfRoad: side,
        sprite: sprites[i % sprites.length],
      });
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Billboard collection
// ---------------------------------------------------------------------------

/**
 * Add a Cesium BillboardCollection containing all spectator sprites to the
 * viewer's scene.  Returns a handle with a `destroy()` method for cleanup.
 *
 * Billboards start fully transparent; call updateSpectatorVisibility() each
 * frame to fade them in near the rider.
 *
 * NOTE: This function calls `getSpriteDUrl()` which uses the Canvas API.
 * Do not call from a worker or test environment without a canvas mock.
 */
export function createSpectatorBillboards(
  viewer: Cesium.Viewer,
  positions: SpectatorPosition[],
): SpectatorCollection {
  const collection = new Cesium.BillboardCollection({ scene: viewer.scene });
  viewer.scene.primitives.add(collection);

  for (const pos of positions) {
    collection.add({
      position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 0),
      image:    getSpriteDUrl(pos.sprite),
      width:    8,
      height:   16,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      color:    new Cesium.Color(1, 1, 1, 0),  // start transparent
      // Store the original position index for visibility calculations.
      // Cesium billboards support a freeform `id` property.
      id: pos,
    });
  }

  return {
    collection,
    destroy() {
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(collection);
      }
      if (!collection.isDestroyed()) collection.destroy();
    },
  };
}

// ---------------------------------------------------------------------------
// Per-frame visibility / fade
// ---------------------------------------------------------------------------

/**
 * Show spectators within `visibleRangeM` of the rider and fade them in over
 * the nearest `fadeRangeM` metres.  Spectators outside the visible range are
 * hidden (alpha = 0) to save GPU bandwidth.
 *
 * @param spectator           The collection returned by createSpectatorBillboards.
 * @param riderDistance       Rider's cumulative distance along the route, meters.
 * @param spectatorDistances  Pre-computed along-route distance per billboard
 *                            (from buildSpectatorDistanceIndex), parallel to the
 *                            collection's billboard array.
 * @param fadeRangeM          Distance over which billboards fade in, meters (200 default).
 * @param visibleRangeM       Only render spectators within this range (1000 m default).
 */
export function updateSpectatorVisibility(
  spectator: SpectatorCollection,
  riderDistance: number,
  spectatorDistances: number[],
  fadeRangeM = 200,
  visibleRangeM = 1000,
): void {
  const col = spectator.collection;
  if (col.isDestroyed()) return;
  const n = Math.min(col.length, spectatorDistances.length);

  for (let i = 0; i < n; i++) {
    const billboard = col.get(i);
    const spectDist = spectatorDistances[i];
    const delta = Math.abs(spectDist - riderDistance);

    if (delta > visibleRangeM) {
      billboard.color = new Cesium.Color(1, 1, 1, 0);
    } else {
      // Full alpha from visibleRangeM down to fadeRangeM; linear fade-in for
      // the final fadeRangeM as the rider closes in.
      const alpha =
        delta <= fadeRangeM
          ? 1.0
          : 1.0 - (delta - fadeRangeM) / (visibleRangeM - fadeRangeM);
      billboard.color = new Cesium.Color(1, 1, 1, Math.max(0, Math.min(1, alpha)));
    }
  }
}

// ---------------------------------------------------------------------------
// Along-route distance index for spectator positions
// ---------------------------------------------------------------------------

/**
 * Pre-compute the along-route distance for each generated SpectatorPosition
 * so updateSpectatorVisibility() doesn't need to re-search per frame.
 *
 * Returns a Float32Array of distances (meters) parallel to `positions`.
 */
export function buildSpectatorDistanceIndex(
  zones: SpectatorZone[],
  positions: SpectatorPosition[],
  route: Route,
  quality: GraphicsQuality | string = 'high',
): number[] {
  // Regenerate positions with the same seed to get distances — we mirror the
  // generation logic but only track the `dist` used per spectator.
  if (positions.length === 0) return [];

  const rng = seededRng(routeIdToSeed(route.id));
  const scale = qualityScale(quality);
  const distances: number[] = [];

  for (const zone of zones) {
    const zoneLength = zone.endDistance - zone.startDistance;
    if (zoneLength <= 0) continue;
    const count = Math.round((zone.densityPerKm / 1000) * zoneLength * scale);
    if (count === 0) continue;
    const spacing = zoneLength / count;

    for (let i = 0; i < count; i++) {
      const jitter = (rng() - 0.5) * spacing * 0.6;
      const dist = Math.max(
        zone.startDistance,
        Math.min(zone.endDistance - 1, zone.startDistance + i * spacing + jitter),
      );
      distances.push(dist);
      // Consume the two rng() calls made in generateSpectatorPositions for
      // heading-sample and offsetM so the streams stay in sync.
      rng(); // perpendicular offset
    }
  }

  return distances;
}
