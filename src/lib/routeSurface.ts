/**
 * routeSurface.ts — Zwift-grade road surface rendering (Wave 37.B).
 *
 * Replaces the thin aqua glow polyline with a physically-recognisable road:
 *   • CorridorGraphics corridor clamped to terrain (4–8 m wide asphalt surface)
 *   • Two thin white edge-stripe polylines offset perpendicular to the center line
 *   • Floating km-marker labels every 1 km (0.5 km for short routes)
 *   • Translucent climb arches at detected climbs ≥4% sustained ≥1 km
 *
 * Create-once, destroy-on-route-change pattern.  All helpers return a
 * `destroy()` function — call it before replacing the route.
 *
 * Performance budget: ~2–5 ms initial creation; 0 ms per frame (no rAF work).
 */

import * as Cesium from 'cesium';
import type { Route } from '@/types';
import { findClimbs } from '@/lib/climbDetection';
import { sampleRouteAtDistance, headingAt } from '@/lib/gpxParser';
import { createAsphaltMaterial, createGradientColoredAsphaltMaterial, type GradientStop } from '@/lib/asphaltMaterial';
import { gradeToColor } from '@/lib/routeVisuals';
import { gradientAt } from '@/lib/gradientCalculator';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RouteSurfaceOptions {
  /** Corridor half-width in metres.  Default: 3.5 (→ 7 m road width). */
  width?: number;
  /** Colour corridor edges by gradient severity.  Default: true. */
  gradientColored?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Lift a Cartesian3 by `liftMeters` along the local up-vector so labels
 * float above the terrain surface.
 */
export function liftCartesian(pos: Cesium.Cartesian3, liftMeters: number): Cesium.Cartesian3 {
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pos, new Cesium.Cartesian3());
  return Cesium.Cartesian3.add(
    pos,
    Cesium.Cartesian3.multiplyByScalar(up, liftMeters, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
}

/**
 * Compute a perpendicular offset to the route at a given distance.
 * Returns a Cartesian3 displaced laterally by `offsetMeters` (positive = left).
 */
export function perpendicularOffset(
  route: Route,
  distanceM: number,
  offsetMeters: number,
): Cesium.Cartesian3 {
  const pt = sampleRouteAtDistance(route, distanceM);
  const heading = headingAt(route, distanceM);
  // The perpendicular heading is 90° to the right of travel direction.
  // Positive offsetMeters pushes left of travel; negate for right.
  const perpHeading = heading - Math.PI / 2;
  const latOffset = Math.cos(perpHeading) * offsetMeters / 111_320;
  const lonOffset =
    (Math.sin(perpHeading) * offsetMeters) /
    (111_320 * Math.cos((pt.lat * Math.PI) / 180));
  return Cesium.Cartesian3.fromDegrees(pt.lon + lonOffset, pt.lat + latOffset, pt.ele);
}

/**
 * Build an array of gradient stops (route-fraction → color) from the route's
 * elevation profile.  Sampled every 100 m for compact GLSL upload.
 */
export function buildGradientStops(route: Route): GradientStop[] {
  const stops: GradientStop[] = [];
  const total = route.totalDistance;
  if (total <= 0) return stops;

  const stepM = Math.max(100, total / 200); // at most 200 samples
  for (let d = 0; d <= total; d += stepM) {
    const grade = gradientAt(route, d, 40);
    stops.push({
      stop: d / total,
      color: gradeToColor(grade),
    });
  }
  // Ensure exactly one stop at 1.0
  if (stops.length === 0 || stops[stops.length - 1].stop < 1) {
    const grade = gradientAt(route, total, 40);
    stops.push({ stop: 1, color: gradeToColor(grade) });
  }
  return stops;
}

/**
 * Find the index of the route point whose cumulative distance is closest to
 * `targetM`.  Pure function — safe to test without Cesium.
 */
export function closestRouteIndex(
  points: Route['points'],
  targetM: number,
): number {
  if (points.length === 0) return 0;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distance <= targetM) lo = mid;
    else hi = mid;
  }
  const dLo = Math.abs(points[lo].distance - targetM);
  const dHi = Math.abs(points[hi].distance - targetM);
  return dLo <= dHi ? lo : hi;
}

/**
 * Return the km-mark distances (in metres) that should carry a marker label.
 * Pure function — safe to test without Cesium.
 */
export function kmMarkDistances(totalDistanceM: number): number[] {
  const totalKm = totalDistanceM / 1000;
  const stepKm = totalKm < 5 ? 0.5 : 1;
  const marks: number[] = [];
  let km = stepKm;
  while (km < totalKm - 0.15) {
    marks.push(km * 1000);
    km += stepKm;
  }
  return marks;
}

/** Climb category string from avg gradient and length. */
export function climbCategory(avgGradePct: number, lengthM: number): string {
  const score = avgGradePct * lengthM;
  if (score > 80_000) return 'HC';
  if (score > 64_000) return 'Cat 1';
  if (score > 32_000) return 'Cat 2';
  if (score > 16_000) return 'Cat 3';
  return 'Cat 4';
}

// ---------------------------------------------------------------------------
// createRoadEntity
// ---------------------------------------------------------------------------

export interface RoadEntityHandle {
  entity: Cesium.Entity;
  destroy(): void;
}

/**
 * Create a wide CorridorGraphics entity clamped to terrain that renders as an
 * asphalt road surface.  The corridor is 7 m wide by default (road-width for
 * a single lane + shoulders).
 *
 * Returns the Cesium.Entity and a `destroy()` cleanup function.
 */
export function createRoadEntity(
  viewer: Cesium.Viewer,
  route: Route,
  cartesians: Cesium.Cartesian3[],
  options: RouteSurfaceOptions = {},
): RoadEntityHandle {
  const halfWidthM = options.width ?? 3.5;
  const widthM = halfWidthM * 2; // corridor width in metres

  const useGradient = options.gradientColored !== false;
  const material = useGradient
    ? createGradientColoredAsphaltMaterial(buildGradientStops(route))
    : createAsphaltMaterial();

  const entity = viewer.entities.add({
    name: '__road_surface_37b',
    corridor: {
      positions: cartesians,
      width: widthM,
      // CLAMP_TO_GROUND drapes the corridor onto the terrain surface.
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      material: material as any,
      outline: false,
    },
  });

  return {
    entity,
    destroy() {
      if (!viewer.isDestroyed()) viewer.entities.remove(entity);
    },
  };
}

// ---------------------------------------------------------------------------
// createRoadEdgeStripes
// ---------------------------------------------------------------------------

export interface EdgeStripesHandle {
  entities: Cesium.Entity[];
  destroy(): void;
}

/**
 * Add two thin white polylines offset perpendicular to the road centerline.
 * They are sampled every 200 m so the offset geometry stays accurate on curves.
 */
export function createRoadEdgeStripes(
  viewer: Cesium.Viewer,
  route: Route,
  halfWidthM = 3.5,
): EdgeStripesHandle {
  const total = route.totalDistance;
  // Sample the edge line at regular intervals; denser sampling for tight routes.
  const sampleInterval = Math.max(20, total / 500);

  const leftPts: Cesium.Cartesian3[] = [];
  const rightPts: Cesium.Cartesian3[] = [];

  for (let d = 0; d <= total; d += sampleInterval) {
    leftPts.push(perpendicularOffset(route, d, halfWidthM - 0.2));
    rightPts.push(perpendicularOffset(route, d, -(halfWidthM - 0.2)));
  }

  const stripeWidth = 1.2;
  const stripeColor = Cesium.Color.WHITE.withAlpha(0.90);

  const makeStripe = (positions: Cesium.Cartesian3[], name: string) =>
    viewer.entities.add({
      name,
      polyline: {
        positions,
        width: stripeWidth,
        clampToGround: true,
        material: new Cesium.ColorMaterialProperty(stripeColor),
      },
    });

  const left = makeStripe(leftPts, '__road_edge_left_37b');
  const right = makeStripe(rightPts, '__road_edge_right_37b');
  const entities = [left, right];

  return {
    entities,
    destroy() {
      if (viewer.isDestroyed()) return;
      for (const e of entities) viewer.entities.remove(e);
    },
  };
}

// ---------------------------------------------------------------------------
// createKmMarkers
// ---------------------------------------------------------------------------

export interface KmMarkersHandle {
  entities: Cesium.Entity[];
  destroy(): void;
}

/**
 * Place floating label entities at each kilometre boundary.  Labels are
 * small enough not to clutter a chase-cam view but legible from overhead.
 */
export function createKmMarkers(
  viewer: Cesium.Viewer,
  route: Route,
  cartesians: Cesium.Cartesian3[],
): KmMarkersHandle {
  const entities: Cesium.Entity[] = [];
  const marks = kmMarkDistances(route.totalDistance);
  const totalKm = route.totalDistance / 1000;
  const stepKm = totalKm < 5 ? 0.5 : 1;

  for (const distM of marks) {
    const idx = closestRouteIndex(route.points, distM);
    if (idx < 0 || idx >= cartesians.length) continue;

    const lifted = liftCartesian(cartesians[idx], 4);
    const km = distM / 1000;
    const label = `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;

    const entity = viewer.entities.add({
      name: `__km_marker_${label}_37b`,
      position: lifted,
      label: {
        text: label,
        font: stepKm < 1 ? '10px sans-serif' : '11px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -4),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        // Scale gracefully: readable at chase-cam (~45m), tiny from far away.
        scaleByDistance: new Cesium.NearFarScalar(50, 1.1, 3000, 0.4),
        translucencyByDistance: new Cesium.NearFarScalar(100, 1.0, 5000, 0.2),
      },
      point: {
        pixelSize: 5,
        color: Cesium.Color.WHITE.withAlpha(0.8),
        outlineColor: Cesium.Color.fromCssColorString('#1e293b'),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.NONE,
      },
    });
    entities.push(entity);
  }

  return {
    entities,
    destroy() {
      if (viewer.isDestroyed()) return;
      for (const e of entities) viewer.entities.remove(e);
    },
  };
}

// ---------------------------------------------------------------------------
// createClimbArches
// ---------------------------------------------------------------------------

export interface ClimbArchesHandle {
  entities: Cesium.Entity[];
  destroy(): void;
}

/**
 * Place a translucent banner / arch entity at each detected climb start.
 * Only climbs ≥4% average and ≥1 km length get an arch (avoids clutter for
 * minor rollers).
 *
 * The "arch" is a floating label with the climb category + length since Cesium
 * entity-layer doesn't support arbitrary 3D arch geometry without primitives.
 * The label uses a large pixel-size for impact and is always depth-test-disabled
 * so it shows through terrain at a distance.
 */
export function createClimbArches(
  viewer: Cesium.Viewer,
  route: Route,
  cartesians: Cesium.Cartesian3[],
): ClimbArchesHandle {
  const entities: Cesium.Entity[] = [];

  const climbs = findClimbs(route).filter(
    (c) => c.avgGradient >= 4 && c.lengthM >= 1000,
  );

  for (const climb of climbs) {
    const idx = closestRouteIndex(route.points, climb.startDistance);
    if (idx < 0 || idx >= cartesians.length) continue;

    const lifted = liftCartesian(cartesians[idx], 10);
    const cat = climbCategory(climb.avgGradient, climb.lengthM);
    const lenKm = (climb.lengthM / 1000).toFixed(1);
    const avgPct = climb.avgGradient.toFixed(1);

    // Background billboard — wide semi-transparent orange arch banner.
    const bgEntity = viewer.entities.add({
      name: `__climb_arch_bg_${idx}_37b`,
      position: lifted,
      billboard: {
        // Use a 1×1 white image scaled to make the arch rectangle; tinted orange.
        image: createArchImage(),
        color: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.70),
        width: 120,
        height: 24,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(50, 1.2, 4000, 0.3),
      },
    });

    const labelEntity = viewer.entities.add({
      name: `__climb_arch_label_${idx}_37b`,
      position: lifted,
      label: {
        text: `${cat}  ${lenKm} km  avg ${avgPct}%`,
        font: 'bold 11px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#431407'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -6),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(50, 1.2, 4000, 0.3),
        translucencyByDistance: new Cesium.NearFarScalar(100, 1.0, 6000, 0.0),
      },
    });

    entities.push(bgEntity, labelEntity);
  }

  return {
    entities,
    destroy() {
      if (viewer.isDestroyed()) return;
      for (const e of entities) viewer.entities.remove(e);
    },
  };
}

// ---------------------------------------------------------------------------
// Utility: tiny 1×1 white canvas image for billboard backgrounds
// ---------------------------------------------------------------------------

let _archImageUri: string | null = null;

/**
 * Return a data URI for a plain white 1×1 pixel PNG.
 * Cached after first call so the same URI is reused across all arch billboards.
 */
function createArchImage(): string {
  if (_archImageUri) return _archImageUri;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
  }
  _archImageUri = canvas.toDataURL();
  return _archImageUri;
}
