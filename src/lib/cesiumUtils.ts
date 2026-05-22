import * as Cesium from 'cesium';
import type { Route } from '@/types';

/**
 * Centralized Cesium helpers. Keeps Cesium-specific knowledge out of the
 * React components so the viewer can stay a thin wrapper around `<div>`.
 */

/** Configure the Cesium ion access token from env var or localStorage. */
export function setIonToken(token: string | null | undefined): void {
  if (token && token.trim().length > 0) {
    Cesium.Ion.defaultAccessToken = token.trim();
  }
}

let terrainPromise: Promise<Cesium.TerrainProvider> | null = null;
/**
 * Lazy, shared Cesium World Terrain provider. The viewer and the route
 * generator both need terrain — but only the first caller pays the network
 * cost. If the ion token is missing or revoked this rejects; callers should
 * treat that as "no DEM available" and fall back gracefully.
 *
 * Pass `reset: true` to invalidate the cached promise (e.g. after the user
 * pastes a new ion token).
 */
export function getTerrainProvider(reset = false): Promise<Cesium.TerrainProvider> {
  if (reset) terrainPromise = null;
  if (!terrainPromise) {
    terrainPromise = Cesium.createWorldTerrainAsync().catch((err) => {
      terrainPromise = null;
      throw err;
    });
  }
  return terrainPromise;
}

/** Convert a Route into a packed array of Cartesian3 positions. */
export function routeToCartesians(route: Route): Cesium.Cartesian3[] {
  const out: Cesium.Cartesian3[] = new Array(route.points.length);
  for (let i = 0; i < route.points.length; i++) {
    const p = route.points[i];
    out[i] = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.ele);
  }
  return out;
}

/** Cesium ion asset ID for Google Photorealistic 3D Tiles. */
const GOOGLE_PHOTOREAL_ASSET_ID = 2275207;

/**
 * Create a Google Photorealistic 3D Tiles tileset — a real-world photoreal
 * mesh (buildings, trees, terrain) — via Cesium ion.
 *
 * Not cached: a Cesium3DTileset is bound to one scene, so every viewer mount
 * needs its own. Rejects if the ion token lacks access to the asset; callers
 * must fall back to terrain + OSM buildings.
 */
export function getPhotorealTileset(): Promise<Cesium.Cesium3DTileset> {
  return Cesium.Cesium3DTileset.fromIonAssetId(GOOGLE_PHOTOREAL_ASSET_ID, {
    // A slightly relaxed screen-space error keeps framerate healthy on
    // modest GPUs without a visible quality hit at ride distances.
    maximumScreenSpaceError: 16,
  });
}

/**
 * Clamp positions onto whatever surface the scene is rendering (the
 * photoreal tileset, or terrain) and optionally lift them a few metres so a
 * line/marker sits just above the ground instead of z-fighting it.
 *
 * Async — it loads the tiles it needs to a high detail level first.
 */
export async function clampCartesiansToScene(
  scene: Cesium.Scene,
  positions: Cesium.Cartesian3[],
  liftMeters = 0,
): Promise<Cesium.Cartesian3[]> {
  const clamped = await scene.clampToHeightMostDetailed(positions);
  return clamped.map((c, i) => {
    // A position the picker couldn't resolve comes back undefined — keep
    // the route's original point there rather than dropping it.
    const base = c ?? positions[i];
    if (liftMeters === 0) return base;
    const carto = Cesium.Cartographic.fromCartesian(base);
    if (!carto) return base;
    return Cesium.Cartesian3.fromRadians(
      carto.longitude,
      carto.latitude,
      carto.height + liftMeters,
    );
  });
}

/**
 * Synchronously sample the height of the rendered surface at a lon/lat — used
 * each frame to sit the avatar on the photoreal mesh. Returns `undefined`
 * when the tiles under that point haven't streamed in yet (the caller should
 * fall back to the route's own elevation until they do).
 */
export function sampleGroundHeight(
  scene: Cesium.Scene,
  lon: number,
  lat: number,
): number | undefined {
  if (!scene.sampleHeightSupported) return undefined;
  const carto = Cesium.Cartographic.fromDegrees(lon, lat);
  return scene.sampleHeight(carto);
}

/** Tuning for the trailing follow camera. */
export interface FollowCamOptions {
  /** Metres the camera trails behind the rider. */
  backMeters: number;
  /** Metres the camera sits above the rider. */
  upMeters: number;
  /** Camera pitch in degrees (-90 = straight down). */
  pitchDeg: number;
}

// Eased follow-cam state, held across frames so the camera glides rather
// than snapping. Cleared by resetFollowCam() on route change / ride restart.
let lastCamPos: Cesium.Cartesian3 | null = null;
let lastHeading: number | null = null;
let lastPitch: number | null = null;

/** Clear eased follow-cam state — call on route change or ride (re)start. */
export function resetFollowCam(): void {
  lastCamPos = null;
  lastHeading = null;
  lastPitch = null;
}

/** Shortest signed angular delta a→b, radians, in (-π, π]. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Place the camera trailing the rider along their heading, easing toward the
 * target each frame so motion stays smooth and cinematic instead of snapping.
 *
 * @param viewer Cesium viewer.
 * @param currentDeg Rider's current lat/lon/ele.
 * @param nextDeg A point ahead of the rider, used to derive heading + corner look-ahead.
 * @param opts Trailing distance / height / pitch.
 * @param dt Seconds since the previous frame — keeps easing framerate-independent.
 */
export function applyFollowCam(
  viewer: Cesium.Viewer,
  currentDeg: { lat: number; lon: number; ele: number },
  nextDeg: { lat: number; lon: number; ele: number },
  opts: FollowCamOptions,
  dt: number,
): void {
  const current = Cesium.Cartesian3.fromDegrees(currentDeg.lon, currentDeg.lat, currentDeg.ele);
  const next = Cesium.Cartesian3.fromDegrees(nextDeg.lon, nextDeg.lat, nextDeg.ele);

  // Transform the "next" point into the rider's local ENU frame so we can
  // derive heading from a simple atan2 in flat XY.
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(current);
  const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
  const localNext = Cesium.Matrix4.multiplyByPoint(inv, next, new Cesium.Cartesian3());
  // ENU: x=east, y=north. Heading = bearing from north, clockwise.
  const targetHeading = Math.atan2(localNext.x, localNext.y);

  // Camera offset in local frame: trail behind the heading, lift up.
  const offsetLocal = new Cesium.Cartesian3(
    -Math.sin(targetHeading) * opts.backMeters,
    -Math.cos(targetHeading) * opts.backMeters,
    opts.upMeters,
  );
  const targetCamPos = Cesium.Matrix4.multiplyByPoint(enu, offsetLocal, new Cesium.Cartesian3());
  const targetPitch = Cesium.Math.toRadians(opts.pitchDeg);

  // Framerate-independent easing: blend = 1 - e^(-k·dt).
  const clampedDt = Math.min(Math.max(dt, 0), 0.1);
  const posBlend = 1 - Math.exp(-3.0 * clampedDt);
  const rotBlend = 1 - Math.exp(-2.5 * clampedDt);

  const camPos =
    lastCamPos === null
      ? Cesium.Cartesian3.clone(targetCamPos, new Cesium.Cartesian3())
      : Cesium.Cartesian3.lerp(lastCamPos, targetCamPos, posBlend, new Cesium.Cartesian3());
  const heading =
    lastHeading === null
      ? targetHeading
      : lastHeading + angleDelta(lastHeading, targetHeading) * rotBlend;
  const pitch =
    lastPitch === null ? targetPitch : lastPitch + (targetPitch - lastPitch) * rotBlend;

  lastCamPos = Cesium.Cartesian3.clone(camPos, new Cesium.Cartesian3());
  lastHeading = heading;
  lastPitch = pitch;

  viewer.camera.setView({
    destination: camPos,
    orientation: { heading, pitch, roll: 0 },
  });
}

/** Frame the entire route nicely on the globe. */
export function flyToRoute(viewer: Cesium.Viewer, positions: Cesium.Cartesian3[]): void {
  if (positions.length === 0) return;
  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  viewer.camera.flyToBoundingSphere(sphere, {
    duration: 1.4,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), sphere.radius * 2.8),
  });
}

/**
 * Fly the camera to a (lat, lon) target — used by the route-search flow to
 * preview a geocoded place before the user commits to generating a ride.
 *
 * `boundingBox` (south, north, west, east in degrees) is honored when present
 * so cities frame at city scale and peaks frame tightly; without it we fall
 * back to a fixed 4 km altitude that feels right for a single point.
 */
export function flyToPoint(
  viewer: Cesium.Viewer,
  target: {
    lat: number;
    lon: number;
    boundingBox?: [number, number, number, number];
  },
): void {
  const { lat, lon, boundingBox } = target;

  if (boundingBox) {
    const [south, north, west, east] = boundingBox;
    const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);
    viewer.camera.flyTo({
      destination: rect,
      duration: 1.6,
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
    });
    return;
  }

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, 4000),
    duration: 1.6,
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
  });
}

// ---- Active viewer registry -----------------------------------------------
// Allows non-React code (RouteDrawer event handlers) to obtain the live
// viewer instance without prop-drilling or a context provider.

let _activeViewer: Cesium.Viewer | null = null;

/** Called by CesiumViewer on mount to register itself. */
export function setActiveViewer(v: Cesium.Viewer | null): void {
  _activeViewer = v;
}

/** Returns the currently-mounted Cesium Viewer, or null if unmounted. */
export function getActiveViewer(): Cesium.Viewer | null {
  return _activeViewer;
}
