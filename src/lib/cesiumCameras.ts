/**
 * cesiumCameras.ts — Wave 30.A: Multi-camera mode positioning utilities.
 *
 * Pure functions: no side effects, no imports from Cesium so the math is
 * testable in the node vitest environment. The CesiumViewer preRender handler
 * converts the returned poses into Cesium camera calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CameraMode = 'chase' | 'firstPerson' | 'overhead' | 'sideTracking' | 'cinematic';

/** A rider snapshot fed to the camera each frame. */
export interface RiderPose {
  lat: number;      // degrees
  lon: number;      // degrees
  ele: number;      // metres above ellipsoid
  /** Bearing, radians, 0 = north, clockwise. */
  heading: number;
  /** Cadence in RPM. */
  cadence: number;
  /** Speed in m/s. */
  speed: number;
}

/**
 * Target camera transform in local ENU (East-North-Up) offsets from the rider.
 * The CesiumViewer converts this to a world Cartesian3 + orientation.
 */
export interface CameraPose {
  /**
   * Camera offset from the rider position in ENU metres:
   *   x = east offset
   *   y = north offset
   *   z = up offset
   */
  offsetENU: { x: number; y: number; z: number };
  /** Camera heading, radians (0 = north, clockwise). */
  heading: number;
  /** Camera pitch, radians (negative = looking down). */
  pitch: number;
  /** Camera roll, radians. */
  roll: number;
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/** easeOutCubic: t in [0,1] → eased progress in [0,1]. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ---------------------------------------------------------------------------
// computeCameraPose — pure mode → target pose
// ---------------------------------------------------------------------------

/** Constants (exported for testing). */
export const CHASE_BACK_M      = 45;
export const CHASE_UP_M        = 9;
export const CHASE_PITCH_RAD   = -7 * (Math.PI / 180);

export const FIRST_PERSON_EYE_HEIGHT_M = 1.2;
export const FIRST_PERSON_HEAD_BOB_AMP = 0.04;  // metres

export const OVERHEAD_HEIGHT_M  = 100;
export const SIDE_TRACK_OFFSET_M = 30;

export const CINEMATIC_RADIUS_M      = 50;
export const CINEMATIC_ELEV_OFFSET_M = 15;
export const CINEMATIC_PITCH_DEG     = 25;
export const CINEMATIC_DEG_PER_SEC   = 6;

/**
 * Compute the target camera pose for a given mode.
 *
 * @param mode        Active camera mode.
 * @param riderPose   Current rider state.
 * @param timeMs      performance.now() value — used for head-bob and cinematic orbit.
 * @returns           ENU offset + orientation that the caller should apply.
 */
export function computeCameraPose(
  mode: CameraMode,
  riderPose: RiderPose,
  timeMs: number,
): CameraPose {
  const h = riderPose.heading; // radians, ENU bearing

  switch (mode) {
    // ------------------------------------------------------------------
    case 'chase': {
      // Trail behind and above — same as the legacy applyFollowCam().
      const x = -Math.sin(h) * CHASE_BACK_M;
      const y = -Math.cos(h) * CHASE_BACK_M;
      return {
        offsetENU: { x, y, z: CHASE_UP_M },
        heading: h,
        pitch: CHASE_PITCH_RAD,
        roll: 0,
      };
    }

    // ------------------------------------------------------------------
    case 'firstPerson': {
      // Camera at the rider's eye position; subtle head-bob from cadence.
      const timeS = timeMs / 1000;
      const cadRpm = riderPose.cadence;
      const bob = FIRST_PERSON_HEAD_BOB_AMP * Math.sin((cadRpm * timeS * Math.PI) / 30);
      return {
        offsetENU: { x: 0, y: 0, z: FIRST_PERSON_EYE_HEIGHT_M + bob },
        heading: h,
        pitch: 0,   // horizon
        roll: 0,
      };
    }

    // ------------------------------------------------------------------
    case 'overhead': {
      // Directly above the rider, looking straight down.
      // heading matches rider so "up" = direction of travel.
      return {
        offsetENU: { x: 0, y: 0, z: OVERHEAD_HEIGHT_M },
        heading: h,
        pitch: -Math.PI / 2,  // straight down
        roll: 0,
      };
    }

    // ------------------------------------------------------------------
    case 'sideTracking': {
      // Perpendicular offset (right side), same elevation — TV broadcast.
      // Perpendicular to heading = heading + 90° (east relative to travel).
      const perpHeading = h + Math.PI / 2;
      const x = Math.sin(perpHeading) * SIDE_TRACK_OFFSET_M;
      const y = Math.cos(perpHeading) * SIDE_TRACK_OFFSET_M;
      // Camera looks back toward the rider (heading + 180°).
      const lookback = h - Math.PI / 2;
      return {
        offsetENU: { x, y, z: 0 },
        heading: lookback,
        pitch: 0,
        roll: 0,
      };
    }

    // ------------------------------------------------------------------
    case 'cinematic': {
      const yaw = shouldRotateForCinematicOrbit(timeMs, CINEMATIC_DEG_PER_SEC);
      const yawRad = yaw * (Math.PI / 180);
      const orbitX = Math.cos(yawRad) * CINEMATIC_RADIUS_M;
      const orbitY = Math.sin(yawRad) * CINEMATIC_RADIUS_M;
      // Camera looks toward the rider — heading is inward (180° from orbit angle).
      const camHeading = yawRad + Math.PI;
      const pitchRad = -CINEMATIC_PITCH_DEG * (Math.PI / 180);
      return {
        offsetENU: { x: orbitX, y: orbitY, z: CINEMATIC_ELEV_OFFSET_M },
        heading: camHeading,
        pitch: pitchRad,
        roll: 0,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// easedCameraTransition
// ---------------------------------------------------------------------------

/**
 * Interpolate between two CameraPoses using easeOutCubic.
 *
 * @param from  Starting pose (t=0).
 * @param to    Target pose (t=1).
 * @param t     Progress 0..1 (raw, not yet eased).
 */
export function easedCameraTransition(
  from: CameraPose,
  to: CameraPose,
  t: number,
): CameraPose {
  const e = easeOutCubic(Math.max(0, Math.min(1, t)));

  const lerp = (a: number, b: number) => a + (b - a) * e;

  // Shortest-path angular interpolation.
  const lerpAngle = (a: number, b: number) => {
    const d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return a + d * e;
  };

  return {
    offsetENU: {
      x: lerp(from.offsetENU.x, to.offsetENU.x),
      y: lerp(from.offsetENU.y, to.offsetENU.y),
      z: lerp(from.offsetENU.z, to.offsetENU.z),
    },
    heading: lerpAngle(from.heading, to.heading),
    pitch:   lerp(from.pitch, to.pitch),
    roll:    lerp(from.roll, to.roll),
  };
}

// ---------------------------------------------------------------------------
// shouldRotateForCinematicOrbit
// ---------------------------------------------------------------------------

/**
 * Returns the current yaw angle (degrees) for the cinematic orbit camera.
 *
 * @param elapsedMs     Absolute timestamp from performance.now().
 * @param orbitDegPerSec  Rotation speed.
 */
export function shouldRotateForCinematicOrbit(
  elapsedMs: number,
  orbitDegPerSec: number,
): number {
  return ((elapsedMs / 1000) * orbitDegPerSec) % 360;
}
