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

// ---------------------------------------------------------------------------
// Base imagery
// ---------------------------------------------------------------------------

/**
 * Add a Bing Maps Aerial imagery layer to the viewer as the permanent globe
 * base.  Must be called once after the Viewer is constructed so terrain and
 * OSM buildings always have imagery to render on — regardless of whether
 * Google Photorealistic 3D Tiles has data for the current area.
 *
 * Idempotent: if an imagery layer has already been added by this function the
 * call is a no-op (guarded by the _baseImageryAdded WeakSet).
 *
 * Auth is via the user's Cesium ion token (set via setIonToken before calling
 * this), not via a separate Bing API key.
 */
const _baseImageryAdded = new WeakSet<object>();

export async function setupBaseImagery(viewer: Cesium.Viewer): Promise<void> {
  if (viewer.isDestroyed()) return;
  // Idempotency guard — the Viewer object is the key.
  if (_baseImageryAdded.has(viewer)) return;
  _baseImageryAdded.add(viewer);

  // Try asset 2 (Bing Maps Aerial with Labels) first, then fall back to
  // asset 3812 (Bing Aerial without labels) if the first isn't available.
  const assetIds = [2, 3812];

  for (const assetId of assetIds) {
    try {
      const provider = await Cesium.IonImageryProvider.fromAssetId(assetId);
      if (viewer.isDestroyed()) return;
      const layer = new Cesium.ImageryLayer(provider, {});
      viewer.scene.imageryLayers.add(layer);
      return; // success — don't try the fallback
    } catch {
      // This asset isn't accessible with the current token — try the next one.
    }
  }
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

// ---------------------------------------------------------------------------
// Scene mood / time-of-day atmosphere
// ---------------------------------------------------------------------------

/**
 * A "mood" is a coherent set of scene-atmosphere parameters that makes the
 * globe feel like a specific time of day or weather condition.  We keep it
 * subtle — just enough variety to feel alive, never garish.
 */
export type SceneMood = 'clear-afternoon' | 'golden-hour' | 'overcast';

interface MoodParams {
  /** UTC hour offset from the route's local noon for the sun angle. */
  sunHourFromNoon: number;
  fogDensity: number;
  fogMinimumBrightness: number;
  /** Exponential fog height scalar — higher = fog fades faster with altitude. */
  fogHeightScalar: number;
  atmosphereHueShift: number;
  atmosphereSaturationShift: number;
  atmosphereBrightnessShift: number;
  /** SkyAtmosphere: enable per-fragment scattering for richer limb glow. */
  perFragmentAtmosphere: boolean;
  /** SkyAtmosphere light intensity multiplier (default ~50). */
  atmosphereLightIntensity: number;
  /**
   * scene.atmosphere (ground scattering) tuning.
   * hue/saturation/brightness shifts applied to the ground-level haze band.
   */
  groundHueShift: number;
  groundSaturationShift: number;
  groundBrightnessShift: number;
}

const MOODS: Record<SceneMood, MoodParams> = {
  'clear-afternoon': {
    sunHourFromNoon: 4,   // ~16:00 local — long shadows, warm directional light
    fogDensity: 0.00012,
    fogMinimumBrightness: 0.25,
    fogHeightScalar: 1.0,
    atmosphereHueShift: 0.0,
    atmosphereSaturationShift: 0.05,   // slightly more vivid blue sky
    atmosphereBrightnessShift: 0.02,
    perFragmentAtmosphere: true,       // smooth limb glow on terrain silhouettes
    atmosphereLightIntensity: 55,      // slightly brighter than default 50
    groundHueShift: 0.0,
    groundSaturationShift: 0.05,
    groundBrightnessShift: 0.0,
  },
  'golden-hour': {
    sunHourFromNoon: 6.5, // ~18:30 local — low sun, golden haze
    fogDensity: 0.00022,
    fogMinimumBrightness: 0.18,
    fogHeightScalar: 0.8,              // fog lingers higher — hazy horizon feel
    atmosphereHueShift: 0.04,          // warm orange sky push
    atmosphereSaturationShift: 0.18,   // rich saturated sunset sky
    atmosphereBrightnessShift: -0.04,
    perFragmentAtmosphere: true,
    atmosphereLightIntensity: 45,      // softer — sun is low
    groundHueShift: 0.03,              // warm cast on ground haze
    groundSaturationShift: 0.12,
    groundBrightnessShift: -0.05,
  },
  'overcast': {
    sunHourFromNoon: 2,  // sun near zenith but diffuse through clouds
    fogDensity: 0.00035,
    fogMinimumBrightness: 0.55,        // brighter fog = milky overcast sky
    fogHeightScalar: 1.2,              // fog cuts off sharply at altitude
    atmosphereHueShift: 0.0,
    atmosphereSaturationShift: -0.20,  // desaturate — flat cloud light
    atmosphereBrightnessShift: 0.08,
    perFragmentAtmosphere: false,      // per-fragment limb glow looks odd under clouds
    atmosphereLightIntensity: 38,      // dimmer diffuse light
    groundHueShift: 0.0,
    groundSaturationShift: -0.15,
    groundBrightnessShift: 0.05,
  },
};

/**
 * Pick a scene mood from the route's characteristics:
 * - Long/hilly alpine routes → golden-hour (dramatic)
 * - Short flat routes → clear-afternoon (default)
 * - High ascent:distance ratio → clear-afternoon (mountains look best sunny)
 * Falls back to 'clear-afternoon' for any route.
 */
export function moodForRoute(route: { totalDistance: number; ascent: number }): SceneMood {
  const km = route.totalDistance / 1000;
  const ascentPerKm = route.ascent / Math.max(km, 1);

  if (km >= 40 && ascentPerKm < 10) return 'golden-hour'; // long flat/rolling
  if (ascentPerKm >= 20) return 'clear-afternoon';         // big mountains — sunny
  if (km >= 20) return 'golden-hour';                      // medium routes
  return 'clear-afternoon';
}

/**
 * Apply a SceneMood to the viewer.  Should be called after the clock time is
 * already set (so sun position is set first, then atmosphere is layered on top).
 */
export function applySceneMood(viewer: Cesium.Viewer, mood: SceneMood): void {
  if (viewer.isDestroyed()) return;
  const p = MOODS[mood];
  const scene = viewer.scene;

  // Fog — density + height falloff for atmospheric depth.
  scene.fog.density = p.fogDensity;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fog = scene.fog as any;
  if ('minimumBrightness' in fog) fog.minimumBrightness = p.fogMinimumBrightness;
  if ('heightScalar' in fog) fog.heightScalar = p.fogHeightScalar;

  // Sky atmosphere — limb glow, saturation, warmth.
  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.hueShift = p.atmosphereHueShift;
    scene.skyAtmosphere.saturationShift = p.atmosphereSaturationShift;
    scene.skyAtmosphere.brightnessShift = p.atmosphereBrightnessShift;
    scene.skyAtmosphere.perFragmentAtmosphere = p.perFragmentAtmosphere;
    // atmosphereLightIntensity controls how bright the Rayleigh scattering appears.
    if ('atmosphereLightIntensity' in scene.skyAtmosphere) {
      scene.skyAtmosphere.atmosphereLightIntensity = p.atmosphereLightIntensity;
    }
  }

  // Ground atmosphere (scene.atmosphere) — haze band at terrain level.
  // Available in Cesium 1.107+; guard with 'atmosphere' in scene check.
  if ('atmosphere' in scene && scene.atmosphere) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const atm = scene.atmosphere as any;
    if ('hueShift' in atm) atm.hueShift = p.groundHueShift;
    if ('saturationShift' in atm) atm.saturationShift = p.groundSaturationShift;
    if ('brightnessShift' in atm) atm.brightnessShift = p.groundBrightnessShift;
    // Tie ground atmosphere lighting to the sun so it shifts with mood.
    if ('dynamicLighting' in atm && Cesium.DynamicAtmosphereLightingType) {
      atm.dynamicLighting = Cesium.DynamicAtmosphereLightingType.SUNLIGHT;
    }
  }
}

/**
 * Compute the UTC JulianDate that places the sun at a given local-time offset
 * from noon at a longitude.  Used to set the scene clock for mood lighting.
 *
 * @param lonDeg   Route's representative longitude (degrees).
 * @param hoursFromNoon  Positive = afternoon/evening, negative = morning.
 */
export function julianDateForMood(lonDeg: number, hoursFromNoon: number): Cesium.JulianDate {
  const utcBase = Cesium.JulianDate.fromIso8601(
    `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
  );
  // Local noon in UTC = 12 - lon/15
  const utcNoon = 12 - lonDeg / 15;
  return Cesium.JulianDate.addHours(
    utcBase,
    utcNoon + hoursFromNoon,
    new Cesium.JulianDate(),
  );
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
