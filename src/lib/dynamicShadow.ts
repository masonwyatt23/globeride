/**
 * dynamicShadow.ts
 *
 * Ground shadow under the rider avatar: a flat dark ellipse positioned just
 * below the rider, sized and oriented by the sun's current azimuth/altitude.
 *
 * Low sun (altitude ≈ 10°) → long shadow (high multiplier, offset far).
 * High sun (altitude ≈ 90°) → small shadow directly below the rider.
 * The ellipse is rotated 180° opposite the sun azimuth so it falls "away
 * from the sun" as expected.
 *
 * Implementation uses a Cesium Entity with an `ellipse` geometry clamped to
 * the ground, which is cheaper than a GroundPrimitive for a single shape.
 *
 * No unit tests: every exported function requires a live Cesium.Viewer and
 * real Cesium.Entity objects. Mocking the Cesium runtime faithfully enough
 * to exercise shadow geometry would replicate Cesium internals, not our
 * logic. Integration coverage lives in the CesiumViewer component tests
 * (manual or headless-browser with a GPU context).
 */

import * as Cesium from 'cesium';

// ---------------------------------------------------------------------------
// Shadow entity handle
// ---------------------------------------------------------------------------

export interface ShadowHandle {
  entity: Cesium.Entity;
  destroy(): void;
}

/**
 * Create a ground-shadow entity and add it to the viewer.
 * Returns a handle so the caller can update and destroy it.
 */
export function createShadowEntity(viewer: Cesium.Viewer): ShadowHandle {
  const entity = viewer.entities.add({
    name: 'rider-ground-shadow',
    position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
    ellipse: {
      semiMinorAxis: 1.2,
      semiMajorAxis: 1.8,
      rotation: 0,
      height: 0.05, // 5 cm above ground to avoid z-fighting
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      material: Cesium.Color.fromAlpha(Cesium.Color.BLACK, 0.35),
      outline: false,
      classificationType: Cesium.ClassificationType.BOTH,
    },
    show: false, // hidden until first update call
  });

  return {
    entity,
    destroy() {
      if (!viewer.isDestroyed()) {
        viewer.entities.remove(entity);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Shadow update — called per frame
// ---------------------------------------------------------------------------

/**
 * Rider position passed to updateShadowEntity each frame.
 */
export interface RiderPos {
  lat: number;
  lon: number;
  ele: number;
}

/**
 * Update the shadow entity's position, size, and rotation to match the current
 * sun angle and rider position.
 *
 * @param handle       ShadowHandle returned by createShadowEntity.
 * @param riderPos     Current rider lat/lon/ele.
 * @param sunAzimuth   Sun azimuth in degrees (CW from North).
 * @param sunAltitude  Sun altitude in degrees above horizon.
 */
export function updateShadowEntity(
  handle: ShadowHandle,
  riderPos: RiderPos,
  sunAzimuth: number,
  sunAltitude: number,
): void {
  const entity = handle.entity;
  if (!entity) return;

  // Hide shadow when the sun is below the horizon (nighttime).
  if (sunAltitude <= 0) {
    entity.show = false;
    return;
  }
  entity.show = true;

  // ---- Position: just below the rider ----
  // Place the ellipse origin at rider position, clamped to ground.
  const pos = Cesium.Cartesian3.fromDegrees(riderPos.lon, riderPos.lat, riderPos.ele);
  // Cesium.Entity position is a PositionProperty or Cartesian3-compatible.
  entity.position = new Cesium.ConstantPositionProperty(pos);

  // ---- Size: low sun → long shadow, high sun → tight shadow ----
  // Stretch ratio: cot(altitude) = cos/sin. At 5° → 11.4, at 45° → 1, at 80° → 0.18.
  // We clamp to a sensible range and scale the base minor axis (1.0 m = ~rider footprint).
  const altClamp = Math.max(5, Math.min(sunAltitude, 85));
  const altRad = (altClamp * Math.PI) / 180;
  const stretch = Math.min(8, 1 / Math.tan(altRad)); // 0.18 – 8

  const BASE_MINOR = 1.0; // metres — roughly the rider's footprint width
  const semiMinor = BASE_MINOR;
  const semiMajor = BASE_MINOR * (1 + stretch); // 1.18 m – 9 m

  if (entity.ellipse) {
    entity.ellipse.semiMinorAxis = new Cesium.ConstantProperty(semiMinor);
    entity.ellipse.semiMajorAxis = new Cesium.ConstantProperty(semiMajor);

    // ---- Rotation: shadow cast AWAY from the sun ----
    // Cesium ellipse rotation is measured in radians from East, CCW.
    // Sun azimuth is CW from North. The shadow points 180° opposite the sun.
    // Convert to radians from East (= 90° - azimuth in standard math coords).
    const shadowAzimuth = (sunAzimuth + 180) % 360; // direction shadow points TO
    const rotationRad = (Math.PI / 2) - shadowAzimuth * (Math.PI / 180);
    entity.ellipse.rotation = new Cesium.ConstantProperty(rotationRad);

    // ---- Opacity: weaker shadow when sun is low (more diffuse) ----
    const alpha = Math.min(0.45, 0.15 + (altClamp / 85) * 0.3);
    entity.ellipse.material = new Cesium.ColorMaterialProperty(
      Cesium.Color.fromAlpha(Cesium.Color.BLACK, alpha),
    );
  }
}
