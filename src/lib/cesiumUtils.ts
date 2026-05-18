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

/**
 * Place the camera in a follow-cam configuration: trailing the rider along
 * their heading, with a fixed downward pitch.
 *
 * @param viewer Cesium viewer.
 * @param currentDeg Rider's current lat/lon/ele.
 * @param nextDeg A point a few meters ahead of the rider, used to derive heading.
 * @param backMeters How far behind the rider to place the camera.
 * @param upMeters How far above the rider to place the camera.
 * @param pitchDeg Camera pitch in degrees (-90 = straight down).
 */
export function applyFollowCam(
  viewer: Cesium.Viewer,
  currentDeg: { lat: number; lon: number; ele: number },
  nextDeg: { lat: number; lon: number; ele: number },
  backMeters: number,
  upMeters: number,
  pitchDeg: number,
): void {
  const current = Cesium.Cartesian3.fromDegrees(currentDeg.lon, currentDeg.lat, currentDeg.ele);
  const next = Cesium.Cartesian3.fromDegrees(nextDeg.lon, nextDeg.lat, nextDeg.ele);

  // Transform a "next" point into the rider's local ENU frame so we can
  // derive heading from a simple atan2 in flat XY.
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(current);
  const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
  const localNext = Cesium.Matrix4.multiplyByPoint(inv, next, new Cesium.Cartesian3());
  // ENU: x=east, y=north. Heading = bearing from north, clockwise.
  const heading = Math.atan2(localNext.x, localNext.y);

  // Camera offset in local frame: trail behind the heading, lift up.
  const offsetLocal = new Cesium.Cartesian3(
    -Math.sin(heading) * backMeters,
    -Math.cos(heading) * backMeters,
    upMeters,
  );
  const cameraWorld = Cesium.Matrix4.multiplyByPoint(enu, offsetLocal, new Cesium.Cartesian3());

  viewer.camera.setView({
    destination: cameraWorld,
    orientation: {
      heading,
      pitch: Cesium.Math.toRadians(pitchDeg),
      roll: 0,
    },
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

/**
 * Compute heading (radians, clockwise from north) between two lat/lon points.
 * Uses the rider's ENU frame for accuracy near the poles.
 */
export function headingBetween(
  fromDeg: { lat: number; lon: number; ele: number },
  toDeg: { lat: number; lon: number; ele: number },
): number {
  const from = Cesium.Cartesian3.fromDegrees(fromDeg.lon, fromDeg.lat, fromDeg.ele);
  const to = Cesium.Cartesian3.fromDegrees(toDeg.lon, toDeg.lat, toDeg.ele);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(from);
  const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
  const local = Cesium.Matrix4.multiplyByPoint(inv, to, new Cesium.Cartesian3());
  return Math.atan2(local.x, local.y);
}

/** Group of Cesium entities that together render the rider on the globe. */
export interface BikeAvatar {
  /** The whole group — pass to viewer.entities.remove for cleanup. */
  entities: Cesium.Entity[];
  /** Update the avatar's position and forward heading. */
  update: (pos: { lat: number; lon: number; ele: number }, heading: number) => void;
}

/**
 * Build a multi-part rider avatar:
 *  - oriented bike body (a narrow box) that rotates with heading
 *  - a vertical "rider" cylinder above it
 *  - a bright glow point on top, visible from any zoom
 *  - a direction arrow trailing forward
 *  - a soft circular shadow on the ground
 *
 * The whole group is positioned via CallbackProperty so the consumer only
 * needs to call `update()` once per frame from preRender.
 */
export function createBikeAvatar(viewer: Cesium.Viewer): BikeAvatar {
  let lon = 0;
  let lat = 0;
  let ele = 0;
  let heading = 0;

  const position = new Cesium.CallbackPositionProperty(
    () => Cesium.Cartesian3.fromDegrees(lon, lat, ele + 0.2),
    false,
  );
  const positionRider = new Cesium.CallbackPositionProperty(
    () => Cesium.Cartesian3.fromDegrees(lon, lat, ele + 0.9),
    false,
  );
  const positionGlow = new Cesium.CallbackPositionProperty(
    () => Cesium.Cartesian3.fromDegrees(lon, lat, ele + 1.9),
    false,
  );
  const positionShadow = new Cesium.CallbackPositionProperty(
    () => Cesium.Cartesian3.fromDegrees(lon, lat, ele + 0.05),
    false,
  );

  const orientation = new Cesium.CallbackProperty(() => {
    const center = Cesium.Cartesian3.fromDegrees(lon, lat, ele + 0.2);
    const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0);
    return Cesium.Transforms.headingPitchRollQuaternion(center, hpr);
  }, false);

  // Direction arrow: short polyline that extends ~3 m forward from the rider.
  const arrowPositions = new Cesium.CallbackProperty(() => {
    const here = Cesium.Cartesian3.fromDegrees(lon, lat, ele + 0.4);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(here);
    const forwardLocal = new Cesium.Cartesian3(
      Math.sin(heading) * 3.5,
      Math.cos(heading) * 3.5,
      0,
    );
    const tip = Cesium.Matrix4.multiplyByPoint(enu, forwardLocal, new Cesium.Cartesian3());
    return [here, tip];
  }, false);

  const accent = Cesium.Color.fromCssColorString('#22d3ee');
  const primary = Cesium.Color.fromCssColorString('#5eead4');
  const shadow = Cesium.Color.fromCssColorString('#020617').withAlpha(0.45);

  const body = viewer.entities.add({
    name: 'Rider · bike',
    position,
    orientation,
    box: {
      dimensions: new Cesium.Cartesian3(0.55, 1.8, 0.25),
      material: accent.withAlpha(0.95),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
    },
  });

  const rider = viewer.entities.add({
    name: 'Rider · body',
    position: positionRider,
    orientation,
    box: {
      dimensions: new Cesium.Cartesian3(0.45, 0.5, 1.2),
      material: primary.withAlpha(0.95),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
    },
  });

  const glow = viewer.entities.add({
    name: 'Rider · marker',
    position: positionGlow,
    point: {
      pixelSize: 14,
      color: primary,
      outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
      outlineWidth: 3,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const arrow = viewer.entities.add({
    name: 'Rider · arrow',
    polyline: {
      positions: arrowPositions,
      width: 5,
      arcType: Cesium.ArcType.NONE,
      material: new Cesium.PolylineArrowMaterialProperty(accent),
      clampToGround: false,
      depthFailMaterial: new Cesium.PolylineArrowMaterialProperty(accent.withAlpha(0.7)),
    },
  });

  const shadowEntity = viewer.entities.add({
    name: 'Rider · shadow',
    position: positionShadow,
    ellipse: {
      semiMajorAxis: 1.6,
      semiMinorAxis: 1.0,
      material: shadow,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      classificationType: Cesium.ClassificationType.TERRAIN,
    },
  });

  return {
    entities: [body, rider, glow, arrow, shadowEntity],
    update(pos, h) {
      lon = pos.lon;
      lat = pos.lat;
      ele = pos.ele;
      heading = h;
    },
  };
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
