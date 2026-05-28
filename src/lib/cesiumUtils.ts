/**
 * cesiumUtils.ts — Centralized Cesium helpers for the GlobeRide viewer.
 *
 * No unit tests: this module is a direct wrapper around Cesium.Viewer,
 * Cesium.Ion, Cesium.JulianDate, and related runtime APIs. Every meaningful
 * function either mutates viewer state or delegates to Cesium internals that
 * cannot be instantiated in a Node/jsdom environment without a GPU context.
 * Integration coverage requires a real browser with WebGL or the Cesium
 * sandcastle emulator; no meaningful unit seam exists here.
 */

import * as Cesium from 'cesium';
import type { Route } from '@/types';
import type { SkyConfig } from '@/lib/skyAndClouds';

// Re-export SkyConfig so consumers can import it from this canonical module.
export type { SkyConfig };

/**
 * Centralized Cesium helpers. Keeps Cesium-specific knowledge out of the
 * React components so the viewer can stay a thin wrapper around `<div>`.
 */

// Tracks whether a valid-looking ion token has been installed. We use this
// (not Cesium.Ion.defaultAccessToken directly) because Cesium ships with a
// rotating demo token baked into the bundle that would otherwise make us
// think we have a token when production has none configured.
let _ionTokenInstalled = false;

/** Configure the Cesium ion access token from env var or localStorage. */
export function setIonToken(token: string | null | undefined): void {
  if (token && token.trim().length > 0) {
    Cesium.Ion.defaultAccessToken = token.trim();
    _ionTokenInstalled = true;
  } else {
    // No user-supplied token: clear any inherited default so ion-gated
    // assets (Bing Aerial, World Terrain, Google Photoreal Tiles) reject
    // fast instead of using Cesium's bundled demo token, which quietly
    // rate-limits and pollutes the console.
    Cesium.Ion.defaultAccessToken = '';
    _ionTokenInstalled = false;
  }
}

/** Whether a user-supplied ion token is currently active. */
export function hasIonToken(): boolean {
  return _ionTokenInstalled;
}

let terrainPromise: Promise<Cesium.TerrainProvider> | null = null;
/**
 * Lazy, shared terrain provider.
 *
 * With a Cesium ion token: returns Cesium World Terrain (a global high-res
 * DEM hosted on ion). The viewer and the route generator both share the
 * same promise so only the first caller pays the network cost.
 *
 * Without a token: returns a flat `EllipsoidTerrainProvider`. The avatar
 * and polylines still position correctly because the route already carries
 * sampled elevations from the GPX (or Open-Elevation fallback). Mountains
 * appear flat, but the world is visible and the ride is playable.
 *
 * Pass `reset: true` to invalidate the cached promise (e.g. after the user
 * pastes a new ion token via Settings → Graphics).
 */
export function getTerrainProvider(reset = false): Promise<Cesium.TerrainProvider> {
  if (reset) terrainPromise = null;
  if (!terrainPromise) {
    if (!_ionTokenInstalled) {
      // Flat ellipsoid — no network, no ion auth, no console errors. Cesium
      // still renders the OSM imagery against this surface and the route's
      // own GPX elevations drive the avatar/camera height.
      terrainPromise = Promise.resolve(new Cesium.EllipsoidTerrainProvider());
    } else {
      terrainPromise = Cesium.createWorldTerrainAsync().catch((err) => {
        terrainPromise = null;
        throw err;
      });
    }
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
 * Add a base imagery layer to the viewer so the globe always shows the
 * world — never a black starfield with markers floating in space.
 *
 * Idempotent: if an imagery layer has already been added by this function the
 * call is a no-op (guarded by the _baseImageryAdded WeakSet).
 *
 * Source selection:
 *   - **With Cesium ion token**: Bing Maps Aerial (ion asset 2). Photoreal
 *     satellite imagery worldwide. Same behaviour as before.
 *   - **Without token**: OpenStreetMap raster tiles via the public
 *     tile.openstreetmap.org endpoint. No auth, no ion dependency. Looks
 *     like a paper map (roads + labels + terrain shading) rather than
 *     photoreal satellite — but the globe is visible and the ride is
 *     legible.
 *
 * If the with-token Bing fetch fails (revoked / lacks entitlement) we fall
 * back to OSM imagery rather than leaving the globe black — that guarantees
 * "broken token" still produces a visible globe.
 */
const _baseImageryAdded = new WeakSet<object>();

/** Public OSM tile server — also whitelisted in the production CSP. */
const OSM_TILE_URL = 'https://tile.openstreetmap.org/';

function buildOsmImagery(): Cesium.OpenStreetMapImageryProvider {
  return new Cesium.OpenStreetMapImageryProvider({
    url: OSM_TILE_URL,
    // OSM tiles are 256×256 and capped at zoom 19.
    maximumLevel: 19,
    // The OSM Foundation requires attribution — Cesium renders this in
    // the credit container at the bottom of the viewer.
    credit: new Cesium.Credit(
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      true,
    ),
  });
}

export async function setupBaseImagery(viewer: Cesium.Viewer): Promise<void> {
  if (viewer.isDestroyed()) return;
  // Idempotency guard — the Viewer object is the key.
  if (_baseImageryAdded.has(viewer)) return;
  _baseImageryAdded.add(viewer);

  // No ion token — go straight to OSM. Skips the inevitable 401/403 from
  // IonImageryProvider that would otherwise spam the console on every mount.
  if (!_ionTokenInstalled) {
    try {
      const provider = buildOsmImagery();
      if (viewer.isDestroyed()) return;
      const layer = new Cesium.ImageryLayer(provider, {});
      viewer.scene.imageryLayers.add(layer);
    } catch {
      // OSM provider construction is synchronous and never throws in practice
      // — guard anyway so we never leave the user staring at a black globe.
      console.warn(
        '[CesiumViewer] OSM imagery unavailable; the globe will render without a base layer.',
      );
    }
    return;
  }

  // Asset 2 = Bing Maps Aerial with Labels — available with every Cesium ion
  // token (free tier included).
  try {
    const provider = await Cesium.IonImageryProvider.fromAssetId(2);
    if (viewer.isDestroyed()) return;
    const layer = new Cesium.ImageryLayer(provider, {});
    viewer.scene.imageryLayers.add(layer);
  } catch {
    // Ion token failed (revoked / lacks Bing entitlement). Fall back to OSM
    // rather than leaving the globe black.
    if (viewer.isDestroyed()) return;
    try {
      const fallback = buildOsmImagery();
      if (viewer.isDestroyed()) return;
      viewer.scene.imageryLayers.add(new Cesium.ImageryLayer(fallback, {}));
    } catch {
      // Both failed — surface a single console warning and move on.
      console.warn(
        '[CesiumViewer] Bing Aerial and OSM fallback both unavailable; ' +
          'the globe will render without a base layer.',
      );
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
 * needs its own. Rejects immediately if no ion token is installed (no point
 * making the network call) or if the token lacks access to the asset; callers
 * must fall back to terrain + OSM buildings.
 */
export function getPhotorealTileset(): Promise<Cesium.Cesium3DTileset> {
  if (!_ionTokenInstalled) {
    return Promise.reject(
      new Error('Photoreal tileset requires a Cesium ion token; falling back to base imagery.'),
    );
  }
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
 *
 * Mood catalog:
 *   clear-noon         — bright midday, deep blue sky, minimal fog
 *   clear-afternoon    — warm ~16:00 afternoon light (legacy, kept for compat)
 *   golden-hour        — low amber sun, hazy horizon, saturated sky
 *   overcast           — flat grey sky, muted light, soft ground
 *   fjord-rain         — cool blue, heavy low cloud, dense desaturated fog
 *   alpine-storm       — dark dramatic sky, cold blue-purple, partial rays
 *   mediterranean-mist — warm hazy yellow sun, light sea-salt fog
 *   dusk-cool          — purple/pink horizon, low blue twilight
 */
export type SceneMood =
  | 'clear-noon'
  | 'clear-afternoon'
  | 'golden-hour'
  | 'overcast'
  | 'fjord-rain'
  | 'alpine-storm'
  | 'mediterranean-mist'
  | 'dusk-cool';

/** Convenience alias exported for route-metadata typing. */
export type MoodId = SceneMood;

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
  // ---- Sky + clouds descriptor ----
  sky: SkyConfig;
}

export const MOODS: Record<SceneMood, MoodParams> = {
  // ------------------------------------------------------------------
  // clear-noon — bright midday, deep blue sky, minimal fog
  // ------------------------------------------------------------------
  'clear-noon': {
    sunHourFromNoon: 0,   // exactly noon — sun high, short shadows, crisp light
    fogDensity: 0.00008,
    fogMinimumBrightness: 0.20,
    fogHeightScalar: 1.0,
    atmosphereHueShift: 0.0,
    atmosphereSaturationShift: 0.08,   // punchy deep blue sky
    atmosphereBrightnessShift: 0.05,   // bright high-altitude feel
    perFragmentAtmosphere: true,
    atmosphereLightIntensity: 60,      // strongest direct sun
    groundHueShift: 0.0,
    groundSaturationShift: 0.06,
    groundBrightnessShift: 0.03,
    sky: {
      useRealSun: true,
      cloudCount: 6,          // sparse fair-weather cumulus
      cloudAltitudeM: 2800,
      starsVisible: false,
    },
  },
  // ------------------------------------------------------------------
  // clear-afternoon — warm ~16:00 light (legacy mood, kept for compat)
  // ------------------------------------------------------------------
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
    sky: {
      useRealSun: true,
      cloudCount: 8,          // afternoon convective cumulus
      cloudAltitudeM: 3000,
      starsVisible: false,
    },
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
    sky: {
      useRealSun: true,
      cloudCount: 10,         // dramatic sunset clouds
      cloudAltitudeM: 2500,
      starsVisible: false,
    },
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
    sky: {
      useRealSun: false,      // pinned clock — overcast has flat diffuse light
      cloudCount: 28,         // heavy cloud deck
      cloudAltitudeM: 1800,   // low ceiling
      starsVisible: false,
    },
  },
  // ------------------------------------------------------------------
  // fjord-rain — cool blue, heavy cloud, dense desaturated fog.
  // Norwegian fjords: low ceiling, dripping slate, moody silver light.
  // ------------------------------------------------------------------
  'fjord-rain': {
    sunHourFromNoon: 1,   // near-overhead but heavily diffused through cloud
    fogDensity: 0.00065,  // heavy — fjord mist blots the mid-distance
    fogMinimumBrightness: 0.60,        // bright silver-grey fog fills the valleys
    fogHeightScalar: 1.4,              // fog clings tight to the valley floor
    atmosphereHueShift: -0.04,         // cool blue push
    atmosphereSaturationShift: -0.30,  // heavily desaturated grey sky
    atmosphereBrightnessShift: 0.10,   // diffuse cloud brightness
    perFragmentAtmosphere: false,
    atmosphereLightIntensity: 32,      // very low — thick cloud cover
    groundHueShift: -0.03,             // cool blue ground haze
    groundSaturationShift: -0.25,
    groundBrightnessShift: 0.08,
    sky: {
      useRealSun: false,      // pinned — rain scenes look better with fixed flat light
      cloudCount: 32,         // near-solid cloud deck
      cloudAltitudeM: 1200,   // very low ceiling — fjord scale
      starsVisible: false,
    },
  },
  // ------------------------------------------------------------------
  // alpine-storm — dramatic dark clouds, cold blue-purple, partial rays.
  // Galibier in August when a front rolls in from the west.
  // ------------------------------------------------------------------
  'alpine-storm': {
    sunHourFromNoon: 3,   // mid-afternoon but storm light — low effective elevation
    fogDensity: 0.00045,
    fogMinimumBrightness: 0.35,        // dark, brooding fog layer
    fogHeightScalar: 1.3,
    atmosphereHueShift: -0.06,         // cold blue-purple sky tint
    atmosphereSaturationShift: -0.10,  // slight desaturation — bruised storm sky
    atmosphereBrightnessShift: -0.08,  // darker overall — storm shadow
    perFragmentAtmosphere: true,       // partial rays between cloud gaps look great
    atmosphereLightIntensity: 36,      // muted sun piercing cloud
    groundHueShift: -0.05,             // cold purple-grey ground cast
    groundSaturationShift: -0.12,
    groundBrightnessShift: -0.06,
    sky: {
      useRealSun: false,      // storm — dramatic fixed light sculpts the clouds better
      cloudCount: 35,         // aggressive storm deck, many overlapping layers
      cloudAltitudeM: 2200,
      starsVisible: false,
    },
  },
  // ------------------------------------------------------------------
  // mediterranean-mist — warm hazy yellow sun, light sea-salt fog.
  // Mallorca, Nice, Côte d'Azur: warm, bright, slightly washed out.
  // ------------------------------------------------------------------
  'mediterranean-mist': {
    sunHourFromNoon: 2.5, // mid-afternoon — sun still high but soft haze
    fogDensity: 0.00020,
    fogMinimumBrightness: 0.30,        // warm creamy sea haze
    fogHeightScalar: 0.9,              // haze lingers above the coastline
    atmosphereHueShift: 0.02,          // slight warm-yellow sky push
    atmosphereSaturationShift: 0.06,   // modest — haze softens colour
    atmosphereBrightnessShift: 0.06,   // bright bleached-out noon feel
    perFragmentAtmosphere: true,
    atmosphereLightIntensity: 58,      // strong Mediterranean sun
    groundHueShift: 0.02,              // warm ochre/sea-salt ground tint
    groundSaturationShift: 0.04,
    groundBrightnessShift: 0.04,
    sky: {
      useRealSun: true,
      cloudCount: 4,          // almost cloudless Mediterranean sky
      cloudAltitudeM: 3500,   // high cirrus-like layer
      starsVisible: false,
    },
  },
  // ------------------------------------------------------------------
  // dusk-cool — purple/pink horizon, low blue twilight.
  // Post-golden-hour: sun just below the horizon, blue-hour quality.
  // ------------------------------------------------------------------
  'dusk-cool': {
    sunHourFromNoon: 7.5, // ~19:30 — sun at/below horizon, blue-hour ambience
    fogDensity: 0.00030,
    fogMinimumBrightness: 0.15,        // dark purplish twilight murk
    fogHeightScalar: 0.75,             // haze spreads wide at low angles
    atmosphereHueShift: -0.08,         // cool blue-purple horizon tint
    atmosphereSaturationShift: 0.14,   // vivid purple-pink twilight band
    atmosphereBrightnessShift: -0.10,  // distinctly dark — twilight
    perFragmentAtmosphere: true,       // beautiful limb-glow at dusk
    atmosphereLightIntensity: 30,      // very low — sun is gone
    groundHueShift: -0.06,             // cool blue-violet ground haze
    groundSaturationShift: 0.08,
    groundBrightnessShift: -0.08,
    sky: {
      useRealSun: false,      // twilight — fixed time captures the blue-hour look
      cloudCount: 5,          // a few silhouetted clouds on the horizon
      cloudAltitudeM: 2000,
      starsVisible: true,     // Milky Way visible at dusk
    },
  },
};

/**
 * Pick a scene mood from the route's characteristics when no explicit mood is
 * attached to the route.  Callers should prefer the route's own `mood` field
 * (set on IconicRouteInfo / WorldTourStageInfo) when available.
 *
 * Heuristics:
 *   - Very long flat rides → golden-hour (dramatic light on open roads)
 *   - Big alpine ascents   → clear-noon  (mountains look best in crisp sun)
 *   - Medium routes        → golden-hour
 *   - Default              → clear-noon
 */
export function moodForRoute(route: { totalDistance: number; ascent: number }): SceneMood {
  const km = route.totalDistance / 1000;
  const ascentPerKm = route.ascent / Math.max(km, 1);

  if (km >= 40 && ascentPerKm < 10) return 'golden-hour'; // long flat/rolling
  if (ascentPerKm >= 20) return 'clear-noon';              // big mountains — crisp
  if (km >= 20) return 'golden-hour';                      // medium routes
  return 'clear-noon';
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
  // FogExtended narrows the subset of private Cesium.Fog fields we probe at runtime.
  type FogExtended = Cesium.Fog & { minimumBrightness?: number; heightScalar?: number };
  scene.fog.density = p.fogDensity;
  const fog = scene.fog as FogExtended;
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
  // AtmosphereExtended narrows the private Cesium ground-atmosphere fields we probe.
  type AtmosphereExtended = {
    hueShift?: number;
    saturationShift?: number;
    brightnessShift?: number;
    dynamicLighting?: number;
  };
  if ('atmosphere' in scene && scene.atmosphere) {
    const atm = scene.atmosphere as AtmosphereExtended;
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
 * Compute the UTC JulianDate that places the sun at the user's current local
 * time of day at the route's longitude — so morning rides look like morning
 * and evening rides look like evening.
 *
 * The sun elevation is clamped to at least MIN_SUN_ELEVATION_DEG above the
 * horizon so we never end up in midnight darkness mid-ride, regardless of the
 * user's actual wall-clock time.
 *
 * The `hoursFromNoon` parameter is used as a fallback when the clamping
 * logic overrides the real time (e.g. for night-time users who still want
 * a readable daytime scene).
 *
 * @param lonDeg         Route's representative longitude (degrees, -180...180).
 * @param hoursFromNoon  Mood-requested offset from local noon; used only when
 *                       real local time would place the sun below the 15-degree
 *                       floor.
 */
export function julianDateForMood(lonDeg: number, hoursFromNoon: number): Cesium.JulianDate {
  const now      = new Date();
  const todayIso = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const utcBase  = Cesium.JulianDate.fromIso8601(`${todayIso}T00:00:00Z`);

  // Current UTC decimal hour (0-24).
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;

  // Solar offset: how many hours ahead of UTC the route longitude is.
  // (lon/15 gives the offset in hours; +ve east, -ve west.)
  const solarOffset = lonDeg / 15;

  // Local solar decimal hour at the route's longitude.
  const localSolar = utcHour + solarOffset;

  // Hours from local solar noon — in the range (-12, 12].
  const localFromNoon = ((localSolar - 12) % 24 + 36) % 24 - 12;

  // Sun elevation at solar noon is approximately 90 - |latitude|.  We don't
  // have the latitude here, so use a conservative 60-degree estimate that
  // holds for latitudes 0-50 degrees.  The sun drops ~15 deg/hr from noon.
  const noonElevDeg = 60;    // degrees, conservative estimate
  const minSunDeg   = 15;    // never allow the sun below this elevation
  // Maximum |hoursFromNoon| where the sun is still above minSunDeg.
  const maxAbsHours = (noonElevDeg - minSunDeg) / 15; // = 3.0 hours

  // If it's currently daytime at the route location, use the real time.
  // If it's night or very low sun, fall back to the mood-requested offset,
  // clamped so the sun stays above the floor.
  let chosenFromNoon: number;
  if (Math.abs(localFromNoon) <= maxAbsHours) {
    chosenFromNoon = localFromNoon;
  } else {
    // Night at route location — use mood offset but keep sun readable.
    chosenFromNoon = Math.max(-maxAbsHours, Math.min(maxAbsHours, hoursFromNoon));
  }

  // UTC noon at the route's longitude = 12 - solarOffset.
  const utcNoon     = 12 - solarOffset;
  const targetUtcHr = utcNoon + chosenFromNoon;

  return Cesium.JulianDate.addHours(utcBase, targetUtcHr, new Cesium.JulianDate());
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
