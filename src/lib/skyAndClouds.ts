/**
 * skyAndClouds.ts
 *
 * Sky, cloud, real-sun, and atmosphere helpers. Kept pure where possible so
 * the solar-position math can be unit-tested without a Cesium environment.
 *
 * Exports:
 *   SkyConfig          — per-mood sky descriptor
 *   configureSky()     — applies clock, lighting, atmosphere; returns cleanup fn
 *   spawnCumulusClouds()  — adds CloudCollection primitives above route center
 *   updateCloudParallax() — drifts cloud positions per frame (mutates, no alloc)
 *   sunAzimuthAndAltitude() — pure NOAA solar-position math
 */

import * as Cesium from 'cesium';
import type { GraphicsQuality } from '@/lib/graphicsQuality';

// ---------------------------------------------------------------------------
// SkyConfig — attached to each SceneMood entry
// ---------------------------------------------------------------------------

export interface SkyConfig {
  /**
   * When true: Cesium's clock is set to real wall-clock time geo-aligned to
   * the route's lon, and clock.shouldAnimate=true so the sun moves.
   * When false: clock stays pinned to the mood's julianDate.
   */
  useRealSun: boolean;
  /**
   * Number of CumulusCloud primitives to spawn (at full / high quality).
   * Scaled by quality tier: medium = ½, low = 0.
   */
  cloudCount: number;
  /** Altitude in metres above MSL for the cloud layer. */
  cloudAltitudeM: number;
  /**
   * Show the Milky Way / star skybox at maximum intensity.
   * Only meaningful for night/dusk moods — the skyBox is always present but
   * this flag lets us know we should NOT suppress it with over-bright atmosphere.
   */
  starsVisible: boolean;
}

// ---------------------------------------------------------------------------
// Quality scaling for cloud count
// ---------------------------------------------------------------------------

/**
 * Scale the mood's nominal cloud count for the active graphics-quality tier.
 * low  → 0 (no clouds — integrated GPU / battery saver)
 * medium → 50 % of nominal
 * high → 100 %
 */
export function scaledCloudCount(
  nominalCount: number,
  quality: GraphicsQuality,
): number {
  if (quality === 'low') return 0;
  if (quality === 'medium') return Math.floor(nominalCount / 2);
  return nominalCount; // high
}

// ---------------------------------------------------------------------------
// Pure math: NOAA solar position
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Result of the solar-position calculation. */
export interface SolarPosition {
  /** Sun azimuth in degrees, measured clockwise from North (0–360). */
  azimuth: number;
  /** Sun altitude (elevation) in degrees above the horizon (−90 to +90). */
  altitude: number;
}

/**
 * Compute solar azimuth and altitude for a given wall-clock time and position.
 *
 * Uses the NOAA Solar Position algorithm based on the work of Meeus (1998) and
 * Spencer (1971). Accurate to within ~0.01° for dates 2000–2050.
 *
 * Reference: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 *
 * @param now   Wall-clock Date to evaluate (typically `new Date()`).
 * @param lat   Observer latitude in degrees, positive = N.
 * @param lon   Observer longitude in degrees, positive = E.
 * @returns     { azimuth (°, CW from N), altitude (°) }
 */
export function sunAzimuthAndAltitude(
  now: Date,
  lat: number,
  lon: number,
): SolarPosition {
  // ---- Julian Day Number ----
  const julianDay = now.getTime() / 86_400_000 + 2_440_587.5;

  // ---- Julian Century ----
  const jc = (julianDay - 2_451_545.0) / 36_525.0;

  // ---- Geometric mean longitude of the sun (degrees) ----
  const geoMeanLon = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;

  // ---- Geometric mean anomaly of the sun (degrees) ----
  const geoMeanAnom = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);

  // ---- Eccentricity of Earth's orbit ----
  const eccOrbit = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);

  // ---- Equation of Center ----
  const anomRad = geoMeanAnom * DEG;
  const eqCtr =
    Math.sin(anomRad) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * anomRad) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * anomRad) * 0.000289;

  // ---- Sun's true longitude ----
  const sunTrueLon = geoMeanLon + eqCtr;

  // ---- Sun's apparent longitude ----
  const omega = 125.04 - 1934.136 * jc;
  const sunAppLon = sunTrueLon - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  // ---- Mean obliquity of ecliptic ----
  const meanObliq =
    23.0 +
    (26.0 + (21.448 - jc * (46.8150 + jc * (0.00059 - jc * 0.001813))) / 60.0) / 60.0;

  // ---- Corrected obliquity ----
  const corrObliq = meanObliq + 0.00256 * Math.cos(omega * DEG);

  // ---- Sun declination ----
  const sunDecl = Math.asin(Math.sin(corrObliq * DEG) * Math.sin(sunAppLon * DEG)) * RAD;

  // ---- Equation of Time (minutes) ----
  const y = Math.tan((corrObliq / 2) * DEG) ** 2;
  const eqTime =
    4 *
    RAD *
    (y * Math.sin(2 * geoMeanLon * DEG) -
      2 * eccOrbit * Math.sin(geoMeanAnom * DEG) +
      4 * eccOrbit * y * Math.sin(geoMeanAnom * DEG) * Math.cos(2 * geoMeanLon * DEG) -
      0.5 * y * y * Math.sin(4 * geoMeanLon * DEG) -
      1.25 * eccOrbit * eccOrbit * Math.sin(2 * geoMeanAnom * DEG));

  // ---- True solar time (minutes) ----
  const utcMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  const trueSolarTime = ((utcMinutes + eqTime + 4 * lon) % 1440 + 1440) % 1440;

  // ---- Hour angle (degrees) ----
  const hourAngle = trueSolarTime / 4 < 0 ? trueSolarTime / 4 + 180 : trueSolarTime / 4 - 180;

  // ---- Solar zenith angle ----
  const latRad = lat * DEG;
  const declRad = sunDecl * DEG;
  const haRad = hourAngle * DEG;

  const cosZenith =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
  const zenithDeg = Math.acos(Math.max(-1, Math.min(1, cosZenith))) * RAD;
  const altitudeDeg = 90.0 - zenithDeg;

  // ---- Atmospheric refraction correction ----
  let refractionCorr = 0;
  if (altitudeDeg > 85) {
    refractionCorr = 0;
  } else if (altitudeDeg > 5) {
    refractionCorr =
      (58.1 / Math.tan(altitudeDeg * DEG) -
        0.07 / Math.tan(altitudeDeg * DEG) ** 3 +
        0.000086 / Math.tan(altitudeDeg * DEG) ** 5) /
      3600;
  } else if (altitudeDeg > -0.575) {
    refractionCorr =
      (1735 +
        altitudeDeg *
          (-518.2 + altitudeDeg * (103.4 + altitudeDeg * (-12.79 + altitudeDeg * 0.711)))) /
      3600;
  } else {
    refractionCorr = -20.774 / (3600 * Math.tan(altitudeDeg * DEG));
  }
  const correctedAlt = altitudeDeg + refractionCorr;

  // ---- Solar azimuth (clockwise from North) ----
  let azimuthDeg: number;
  if (hourAngle > 0) {
    azimuthDeg =
      (Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            (Math.sin(latRad) * cosZenith - Math.sin(declRad)) /
              (Math.cos(latRad) * Math.sin(zenithDeg * DEG)),
          ),
        ),
      ) *
        RAD +
        180) %
      360;
  } else {
    azimuthDeg =
      (540 -
        Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (Math.sin(latRad) * cosZenith - Math.sin(declRad)) /
                (Math.cos(latRad) * Math.sin(zenithDeg * DEG)),
            ),
          ),
        ) *
          RAD) %
      360;
  }

  return { azimuth: azimuthDeg, altitude: correctedAlt };
}

// ---------------------------------------------------------------------------
// configureSky — sets up clock, globe lighting, and skyBox
// ---------------------------------------------------------------------------

/**
 * Configure a Cesium Viewer's sky, clock, and lighting to match the given
 * SkyConfig. The real-sun path starts the clock animating at wall-clock UTC
 * geo-aligned to the route's longitude; the static path leaves the clock
 * pinned (julianDateForMood handles that separately).
 *
 * @param viewer    Active Cesium Viewer (must not be destroyed).
 * @param config    SkyConfig from the active mood.
 * @param centerLon Route's representative longitude (for real-sun offset).
 * @returns A cleanup function that stops clock animation if started.
 */
export function configureSky(
  viewer: Cesium.Viewer,
  config: SkyConfig,
  centerLon: number,
): () => void {
  if (viewer.isDestroyed()) return () => undefined;

  const scene = viewer.scene;

  // Globe lighting — always on so the sun angle casts real shadows on terrain.
  scene.globe.enableLighting = true;

  // SkyBox — show stars; intensity is only perceived at night when the
  // skyAtmosphere brightness is low. Let Cesium handle show naturally.
  if (scene.skyBox) scene.skyBox.show = true;

  if (config.useRealSun) {
    // Real wall-clock time, geo-aligned to route longitude.
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const utcBase = Cesium.JulianDate.fromIso8601(`${todayIso}T00:00:00Z`);
    const utcHour =
      now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const solarOffset = centerLon / 15;
    // Clamp solar time so sun never goes below the horizon during a ride.
    const localSolar = utcHour + solarOffset;
    const localFromNoon = ((localSolar - 12) % 24 + 36) % 24 - 12;
    const maxAbsHours = 3.0; // ~15 deg floor keeps sun readable
    const chosenFromNoon = Math.max(-maxAbsHours, Math.min(maxAbsHours, localFromNoon));
    const utcNoon = 12 - solarOffset;
    const targetUtcHr = utcNoon + chosenFromNoon;
    viewer.clock.currentTime = Cesium.JulianDate.addHours(
      utcBase,
      targetUtcHr,
      new Cesium.JulianDate(),
    );
    // Animate at real-time rate (multiplier=1) so sun drifts naturally.
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;
  }
  // If useRealSun=false, the caller (CesiumViewer route effect) already set
  // viewer.clock via julianDateForMood — leave it alone.

  return () => {
    // Stop animation only if we started it.
    if (config.useRealSun && !viewer.isDestroyed()) {
      viewer.clock.shouldAnimate = false;
    }
  };
}

// ---------------------------------------------------------------------------
// spawnCumulusClouds — adds a CloudCollection above the route
// ---------------------------------------------------------------------------

// Seeded pseudo-random so cloud placement is deterministic per route.
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Scatter CumulusCloud primitives in a ~10 km radius disk above the route
 * centre at the given altitude.  Returns the CloudCollection so the caller
 * can remove it from the scene on cleanup.
 *
 * Returns `null` when count ≤ 0 or when CloudCollection is unavailable
 * (e.g. old Cesium build without the primitive).
 */
export function spawnCumulusClouds(
  viewer: Cesium.Viewer,
  centerLat: number,
  centerLon: number,
  count: number,
  altitudeM: number,
): Cesium.CloudCollection | null {
  if (viewer.isDestroyed()) return null;
  if (count <= 0) return null;

  // CloudCollection was added in Cesium 1.102; guard for older bundles.
  if (!('CloudCollection' in Cesium)) return null;

  // Cesium.CloudCollection is a runtime API added in 1.102 not yet reflected in
  // @types/cesium — narrow with a typed constructor shape instead of `any`.
  type CesiumWithClouds = typeof Cesium & { CloudCollection: new () => Cesium.CloudCollection };
  const collection = new (Cesium as CesiumWithClouds).CloudCollection();
  const rand = seededRandom(Math.round(centerLat * 1000 + centerLon * 1000));
  const RADIUS_DEG = 0.09; // ~10 km at mid-latitudes

  for (let i = 0; i < count; i++) {
    // Uniform disk sampling (Box-Muller won't do — use rejection sampling).
    let dx = 0;
    let dy = 0;
    do {
      dx = (rand() * 2 - 1) * RADIUS_DEG;
      dy = (rand() * 2 - 1) * RADIUS_DEG;
    } while (dx * dx + dy * dy > RADIUS_DEG * RADIUS_DEG);

    const lon = centerLon + dx;
    const lat = centerLat + dy / Math.cos(centerLat * Math.PI / 180);

    // Cloud width 800–2400 m, height 400–900 m — varied for natural look.
    const wScale = 800 + rand() * 1600;
    const hScale = 400 + rand() * 500;

    collection.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, altitudeM),
      scale: new Cesium.Cartesian2(wScale, hScale),
      maximumSize: new Cesium.Cartesian3(
        wScale * 0.5,
        hScale * 0.5,
        wScale * 0.2,
      ),
      slice: 0.36 + rand() * 0.2, // 0.36–0.56 gives puffy-to-flat range
    });
  }

  viewer.scene.primitives.add(collection);
  return collection;
}

// ---------------------------------------------------------------------------
// updateCloudParallax — drift cloud positions with simulated wind
// ---------------------------------------------------------------------------

// Cartesian3 scratch to avoid per-frame allocations.
// Lazily initialized on first call so module-level eval works in test environments.
let _scratchCartographic: Cesium.Cartographic | null = null;
let _scratchCartesian: Cesium.Cartesian3 | null = null;

/**
 * Advance all clouds in a CloudCollection by one wind-driven step.
 * Mutates `cloud.position` in-place — no allocation beyond the two module-
 * level scratch objects.
 *
 * @param collection   CloudCollection returned by spawnCumulusClouds.
 * @param windMs       Wind speed in m/s.
 * @param windDirDeg   Wind direction FROM which wind blows (met. convention),
 *                     in degrees clockwise from North.
 * @param dtMs         Frame delta time in milliseconds.
 */
export function updateCloudParallax(
  collection: Cesium.CloudCollection,
  windMs: number,
  windDirDeg: number,
  dtMs: number,
): void {
  const dtSec = dtMs / 1000;
  const distM = windMs * dtSec;
  if (distM === 0) return;

  // Wind direction FROM → movement heading = windDirDeg + 180° (blows TO).
  const moveDeg = (windDirDeg + 180) % 360;
  const moveRad = moveDeg * DEG;
  // In metres: N component = cos(heading), E component = sin(heading).
  const dNorth = Math.cos(moveRad) * distM;
  const dEast = Math.sin(moveRad) * distM;

  // Degrees per metre — approximate at the collection's rough latitude.
  // We use 1°≈111,320 m for lat; lon degrees are wider toward equator.
  const DEG_PER_M_LAT = 1 / 111_320;

  const length = collection.length;
  for (let i = 0; i < length; i++) {
    const cloud = collection.get(i);
    // Convert to cartographic, nudge, convert back.
    if (!_scratchCartographic) _scratchCartographic = new Cesium.Cartographic();
    if (!_scratchCartesian) _scratchCartesian = new Cesium.Cartesian3();
    Cesium.Cartographic.fromCartesian(cloud.position, undefined, _scratchCartographic);
    const latDeg = _scratchCartographic.latitude * RAD;
    const DEG_PER_M_LON = DEG_PER_M_LAT / Math.max(0.01, Math.cos(latDeg * DEG));
    _scratchCartographic.latitude += dNorth * DEG_PER_M_LAT * DEG;
    _scratchCartographic.longitude += dEast * DEG_PER_M_LON * DEG;
    cloud.position = Cesium.Cartesian3.fromRadians(
      _scratchCartographic.longitude,
      _scratchCartographic.latitude,
      _scratchCartographic.height,
      undefined,
      _scratchCartesian,
    );
  }
}
