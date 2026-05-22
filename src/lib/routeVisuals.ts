/**
 * routeVisuals.ts — helpers for the gradient-coloured route line and
 * route markers (start / finish / kilometre posts).
 *
 * Design goals
 * ─────────────
 * • Gradient colour — green→yellow→orange→red by steepness, matching
 *   Strava's segment colour convention so riders parse it intuitively.
 * • Markers — tasteful billboard points, no clutter. Start = green flag,
 *   Finish = chequered, km posts = tiny white dots with distance labels.
 * • All Cesium entities returned with stable names so CesiumViewer can
 *   remove them atomically on route change.
 */

import * as Cesium from 'cesium';
import type { Route } from '@/types';
import { gradientAt } from '@/lib/gradientCalculator';

// ---------------------------------------------------------------------------
// Gradient colour ramp
// ---------------------------------------------------------------------------

/**
 * Map a grade (%) to an RGBA colour following the conventional climbing
 * colour scale used in cycling apps.
 *
 *   ≤ −3 %   vivid cyan   (steep descent)
 *   −3 – 0   teal-green   (gentle descent / flat)
 *    0 –  3   lime-green   (flat / rolling)
 *    3 –  6   yellow-green (easy climb)
 *    6 –  9   amber        (moderate climb)
 *    9 – 12   orange       (hard climb)
 *   > 12 %    red          (steep / very hard)
 */
export function gradeToColor(grade: number): Cesium.Color {
  if (grade <= -3) return Cesium.Color.fromCssColorString('#06b6d4'); // cyan
  if (grade <= 0) return Cesium.Color.fromCssColorString('#34d399'); // emerald
  if (grade <= 3) return Cesium.Color.fromCssColorString('#86efac'); // light green
  if (grade <= 6) return Cesium.Color.fromCssColorString('#fde047'); // yellow
  if (grade <= 9) return Cesium.Color.fromCssColorString('#fb923c'); // orange
  if (grade <= 12) return Cesium.Color.fromCssColorString('#ef4444'); // red
  return Cesium.Color.fromCssColorString('#b91c1c'); // dark red
}

// ---------------------------------------------------------------------------
// Gradient polyline entities
// ---------------------------------------------------------------------------

/**
 * Segment the route into colour runs and emit one Cesium Entity per run.
 * We use a simple "run-length" approach: group consecutive points whose
 * colour matches, then emit a polyline spanning that run.  This keeps
 * entity count low (typically 20–80 for a 50 km ride) versus one entity
 * per point pair (potentially thousands).
 *
 * Each segment is clamped to ground (clampToGround: true) so it hugs the
 * photoreal surface just like the original single-colour entity.
 * The caller is responsible for clamping the returned positions to the
 * scene after photoreal tiles load (same as the existing flow).
 */
export interface GradientSegment {
  entity: Cesium.Entity;
  /** Index into route.points of the first point in this segment. */
  startIdx: number;
  /** Index into route.points of the last point in this segment (inclusive). */
  endIdx: number;
}

export function buildGradientPolylines(
  viewer: Cesium.Viewer,
  route: Route,
  cartesians: Cesium.Cartesian3[],
): GradientSegment[] {
  const pts = route.points;
  if (pts.length < 2) return [];

  const segments: GradientSegment[] = [];

  // Determine the colour bucket for each point.
  const colors: Cesium.Color[] = pts.map((p) =>
    gradeToColor(gradientAt(route, p.distance, 40)),
  );

  // Walk points, flushing a segment whenever the colour changes.
  let runStart = 0;
  let runColor = colors[0];

  const flush = (endIdx: number) => {
    if (endIdx <= runStart) return;
    const positions = cartesians.slice(runStart, endIdx + 1);
    if (positions.length < 2) return;

    const entity = viewer.entities.add({
      name: `__gradient_seg_${runStart}_${endIdx}`,
      polyline: {
        positions,
        width: 6,
        clampToGround: true,
        material: new Cesium.PolylineOutlineMaterialProperty({
          color: runColor.withAlpha(0.92),
          outlineWidth: 1.5,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.35),
        }),
      },
    });

    segments.push({ entity, startIdx: runStart, endIdx });
  };

  for (let i = 1; i < pts.length; i++) {
    if (!colors[i].equals(runColor)) {
      flush(i - 1);
      runStart = i - 1; // overlap by 1 point so segments share endpoints
      runColor = colors[i];
    }
  }
  flush(pts.length - 1);

  return segments;
}

// ---------------------------------------------------------------------------
// Route markers
// ---------------------------------------------------------------------------

/** The set of marker entities added for one route. */
export interface RouteMarkers {
  entities: Cesium.Entity[];
}

/**
 * Add start/finish flags and kilometre-post dots along the route.
 * Returns a handle so the caller can remove them on route change.
 */
export function buildRouteMarkers(
  viewer: Cesium.Viewer,
  route: Route,
  cartesians: Cesium.Cartesian3[],
): RouteMarkers {
  const entities: Cesium.Entity[] = [];

  // Helper — add a point marker with optional label.
  const addPoint = (
    position: Cesium.Cartesian3,
    pixelSize: number,
    color: Cesium.Color,
    outlineColor: Cesium.Color,
    outlineWidth: number,
    label?: string,
    labelPixelOffset = new Cesium.Cartesian2(0, -20),
    labelFont = '12px sans-serif',
  ) => {
    entities.push(
      viewer.entities.add({
        name: label ? `__marker_${label}` : '__marker_km',
        position,
        point: {
          pixelSize,
          color,
          outlineColor,
          outlineWidth,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.NONE,
        },
        label: label
          ? {
              text: label,
              font: labelFont,
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: labelPixelOffset,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: new Cesium.NearFarScalar(200, 1.1, 5000, 0.55),
              translucencyByDistance: new Cesium.NearFarScalar(300, 1.0, 8000, 0.3),
            }
          : undefined,
      }),
    );
  };

  // Start marker — bright green with "START" label.
  if (cartesians.length > 0) {
    addPoint(
      liftPosition(cartesians[0], 3),
      18,
      Cesium.Color.fromCssColorString('#22c55e'),
      Cesium.Color.fromCssColorString('#052e16'),
      3,
      'START',
      new Cesium.Cartesian2(0, -24),
      'bold 13px sans-serif',
    );
  }

  // Finish marker — red with "FINISH" label.
  if (cartesians.length > 1) {
    addPoint(
      liftPosition(cartesians[cartesians.length - 1], 3),
      18,
      Cesium.Color.fromCssColorString('#ef4444'),
      Cesium.Color.fromCssColorString('#450a0a'),
      3,
      'FINISH',
      new Cesium.Cartesian2(0, -24),
      'bold 13px sans-serif',
    );
  }

  // Kilometre posts — every 1 km (or 0.5 km for very short routes < 5 km).
  const totalKm = route.totalDistance / 1000;
  const stepKm = totalKm < 5 ? 0.5 : 1;
  const pts = route.points;

  let kmMark = stepKm; // start at first km mark (not 0 = start)
  while (kmMark < totalKm - 0.2) {
    // Find the route point closest to this distance.
    const targetDist = kmMark * 1000;
    const idx = closestPointIndex(pts, targetDist);
    if (idx > 0 && idx < cartesians.length) {
      const label = `${kmMark % 1 === 0 ? kmMark.toFixed(0) : kmMark.toFixed(1)} km`;
      addPoint(
        liftPosition(cartesians[idx], 2),
        8,
        Cesium.Color.WHITE.withAlpha(0.9),
        Cesium.Color.fromCssColorString('#1e293b'),
        2,
        label,
        new Cesium.Cartesian2(0, -16),
        '11px sans-serif',
      );
    }
    kmMark += stepKm;
  }

  return { entities };
}

/** Lift a Cartesian3 position by liftMeters along the local up-vector. */
function liftPosition(pos: Cesium.Cartesian3, liftMeters: number): Cesium.Cartesian3 {
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pos, new Cesium.Cartesian3());
  return Cesium.Cartesian3.add(
    pos,
    Cesium.Cartesian3.multiplyByScalar(up, liftMeters, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
}

/** Binary-search for the route point index whose distance is closest to targetDist. */
function closestPointIndex(
  pts: Route['points'],
  targetDist: number,
): number {
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].distance <= targetDist) lo = mid;
    else hi = mid;
  }
  const dLo = Math.abs(pts[lo].distance - targetDist);
  const dHi = Math.abs(pts[hi].distance - targetDist);
  return dLo <= dHi ? lo : hi;
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/** Remove all gradient segment entities from the viewer. */
export function removeGradientPolylines(
  viewer: Cesium.Viewer,
  segments: GradientSegment[],
): void {
  if (viewer.isDestroyed()) return;
  for (const seg of segments) {
    viewer.entities.remove(seg.entity);
  }
}

/** Remove all route marker entities from the viewer. */
export function removeRouteMarkers(
  viewer: Cesium.Viewer,
  markers: RouteMarkers,
): void {
  if (viewer.isDestroyed()) return;
  for (const e of markers.entities) {
    viewer.entities.remove(e);
  }
}
