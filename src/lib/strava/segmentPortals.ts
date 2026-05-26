/**
 * src/lib/strava/segmentPortals.ts — 3D portal gate entities in Cesium.
 *
 * Creates a glowing portal gate at each segment's start point (aqua #22d3ee),
 * a checkered-flag billboard at the end, and a floating label with the
 * segment name. Gates are added as a single PrimitiveCollection for efficient
 * bulk teardown.
 *
 * Wave 33.B — no WebXR / cesiumCameras.ts code modified.
 */

import * as Cesium from 'cesium';
import type { RouteSegment } from '@/lib/segmentOverlay';
import type { Route } from '@/types';
import { sampleRouteAtDistance } from '@/lib/gpxParser';

// Brand colors
const AQUA = Cesium.Color.fromCssColorString('#22d3ee');
const AQUA_PULSE = Cesium.Color.fromCssColorString('#22d3eeaa');
const YELLOW = Cesium.Color.fromCssColorString('#fbbf24');
const WHITE = Cesium.Color.WHITE;

export interface SegmentPortalHandle {
  /** Tear down all Cesium entities and collections created for these portals. */
  destroy(): void;
}

/**
 * Create 3D portal entities for each RouteSegment.
 *
 * Each segment gets:
 *   - A glowing aqua ring (polyline ellipse approximation) at the start.
 *   - A floating label with the segment name above the start ring.
 *   - A yellow billboard / pin at the end.
 *
 * Returns a handle with a destroy() method. Call destroy() on route change.
 *
 * @param viewer       The active Cesium.Viewer.
 * @param routeSegments Mapped segments returned by mapSegmentsToRoute().
 * @param route        The loaded route (used to resolve lat/lon from distances).
 */
export function createSegmentPortals(
  viewer: Cesium.Viewer,
  routeSegments: RouteSegment[],
  route: Route,
): SegmentPortalHandle {
  if (viewer.isDestroyed()) return { destroy: () => undefined };

  const entities: Cesium.Entity[] = [];

  for (const rs of routeSegments) {
    const startPt = sampleRouteAtDistance(route, rs.routeStartDistance);
    const endPt   = sampleRouteAtDistance(route, rs.routeEndDistance);

    // ---- Start gate: glowing aqua ring approximated as a small polyline loop ----
    const ringPositions = buildRingPositions(startPt.lat, startPt.lon, startPt.ele + 1.5, 3, 16);

    const startRing = viewer.entities.add({
      name: `strava-seg-start-${rs.segment.id}`,
      polyline: {
        positions: new Cesium.ConstantProperty(ringPositions),
        width: 4,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.4,
          color: AQUA,
        }),
        clampToGround: false,
      },
    });
    entities.push(startRing);

    // ---- Pulse ring (slightly larger, dimmer) ----
    const pulsePositions = buildRingPositions(startPt.lat, startPt.lon, startPt.ele + 1.5, 4.5, 16);
    const pulseRing = viewer.entities.add({
      name: `strava-seg-pulse-${rs.segment.id}`,
      polyline: {
        positions: new Cesium.ConstantProperty(pulsePositions),
        width: 2,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: AQUA_PULSE,
        }),
        clampToGround: false,
      },
    });
    entities.push(pulseRing);

    // ---- Segment name label floating above the start gate ----
    const labelEntity = viewer.entities.add({
      name: `strava-seg-label-${rs.segment.id}`,
      position: new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(startPt.lon, startPt.lat, startPt.ele + 12),
      ),
      label: {
        text: rs.segment.name,
        font: '12px system-ui, sans-serif',
        fillColor: WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        pixelOffset: new Cesium.Cartesian2(0, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#0b122088'),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        scaleByDistance: new Cesium.NearFarScalar(100, 1.2, 2_000, 0.5),
        translucencyByDistance: new Cesium.NearFarScalar(500, 1, 3_000, 0),
      },
    });
    entities.push(labelEntity);

    // ---- End marker: yellow flag billboard ----
    const endEntity = viewer.entities.add({
      name: `strava-seg-end-${rs.segment.id}`,
      position: new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(endPt.lon, endPt.lat, endPt.ele + 3),
      ),
      point: {
        pixelSize: 12,
        color: YELLOW,
        outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(100, 1.4, 2_000, 0.4),
        translucencyByDistance: new Cesium.NearFarScalar(500, 1, 3_000, 0),
      },
    });
    entities.push(endEntity);
  }

  return {
    destroy() {
      for (const entity of entities) {
        if (!viewer.isDestroyed() && viewer.entities.contains(entity)) {
          viewer.entities.remove(entity);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a polygon ring of Cartesian3 positions approximating a circle at
 * (lat, lon, ele) with the given radius (metres) and point count.
 * The ring lies in the local East-North plane (horizontal).
 */
function buildRingPositions(
  lat: number,
  lon: number,
  ele: number,
  radiusM: number,
  points: number,
): Cesium.Cartesian3[] {
  const center = Cesium.Cartesian3.fromDegrees(lon, lat, ele);
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const result: Cesium.Cartesian3[] = [];

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const local = new Cesium.Cartesian3(
      Math.cos(angle) * radiusM,
      Math.sin(angle) * radiusM,
      0,
    );
    const world = new Cesium.Cartesian3();
    Cesium.Matrix4.multiplyByPoint(transform, local, world);
    result.push(world);
  }

  return result;
}
