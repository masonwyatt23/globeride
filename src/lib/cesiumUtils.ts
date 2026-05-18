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
