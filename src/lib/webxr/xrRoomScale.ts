/**
 * xrRoomScale.ts WebXR Phase 3: 6DOF room-scale head tracking.
 *
 * Problem:
 *   Phase 2 only applied a per-eye IPD translation offset. The chase-cam's
 *   heading was the sole determinant of where the rider was looking. This
 *   means turning your head in the headset did nothing — you were always
 *   staring down the road.
 *
 * Solution:
 *   Capture a "room-scale anchor" once when the XR session starts. The anchor
 *   records the ENU→ECEF transform at the rider's origin and the chase-cam's
 *   heading at that moment. On every frame, the headset's orientation quaternion
 *   (relative to the session origin) is converted to a heading/pitch offset and
 *   composed with the chase-cam's forward direction before being applied to the
 *   Cesium camera.
 *
 * What this enables:
 *   - Riders can turn their head left/right/up/down and see the world move.
 *   - The follow-cam still drives forward progress; head tracking is additive.
 *
 * Limitations / known gaps (device testing required):
 *   - The `local-floor` reference space must be available. If only `local` is
 *     available the same math still works, but the "floor" anchor may be at
 *     eye height rather than true floor, making pitch feel slightly off.
 *   - Full 6DOF positional tracking (leaning forward / stepping sideways in
 *     room scale) is intentionally NOT mapped — the rider should stay at the
 *     chase-cam anchor while only orientation changes are applied.
 *   - Quaternion→Euler gimbal lock: at pitch ≈ ±90° yaw becomes undefined.
 *     This is acceptable for cycling — riders rarely look straight up/down.
 *   - All untestable in jsdom: actual XRViewerPose quaternion delivery from a
 *     real headset. The math is tested with synthetic quaternions below.
 */

import * as Cesium from 'cesium';
import type * as CesiumType from 'cesium';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Anchor captured once at XR session start.
 * Stores everything needed to convert per-frame XR quaternions into Cesium
 * camera mutations without re-computing ECEF transforms per frame.
 */
export interface RoomScaleState {
  /**
   * Column-major 4×4 ENU→ECEF transform matrix at the rider's starting
   * position. Used to map ENU unit vectors into ECEF for Cesium camera
   * direction setting. Stored as a plain Float64Array so we don't hold a live
   * Cesium.Matrix4 reference across frames (avoids GC pressure from cloning).
   */
  ecefAnchorMatrix: Float64Array;

  /**
   * The chase-cam heading (radians, clockwise from North) at the moment the XR
   * session started. Added to the headset's relative yaw so the headset's
   * "forward" corresponds to the road ahead.
   */
  baseHeading: number;

  /**
   * The chase-cam pitch (radians, positive = up) at session start. Added to
   * the headset's relative pitch so the initial view matches the follow-cam.
   */
  basePitch: number;
}

// ---------------------------------------------------------------------------
// createRoomScaleAnchor
// ---------------------------------------------------------------------------

/**
 * Compute and return a RoomScaleState from the rider's current position and
 * the current chase-cam orientation.
 *
 * Call this once immediately after the XRSession starts (and the first pose
 * frame is available), before the per-frame loop begins.
 *
 * @param viewer  The active Cesium.Viewer (chase-cam must be positioned).
 * @param rider   Geodetic position of the rider at session start (WGS84).
 */
export function createRoomScaleAnchor(
  viewer: CesiumType.Viewer,
  rider: { lat: number; lon: number; ele: number },
): RoomScaleState {
  const cartographic = Cesium.Cartographic.fromDegrees(
    rider.lon,
    rider.lat,
    rider.ele,
  );
  const cartesian = Cesium.Cartographic.toCartesian(cartographic);

  // ENU→ECEF at rider's position. This is the local tangent plane frame:
  //   col 0 = East  (unit vector in ECEF)
  //   col 1 = North
  //   col 2 = Up
  //   col 3 = origin (cartesian position)
  const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(cartesian);

  // Snapshot into a plain Float64Array so we don't mutate through the viewer.
  const ecefAnchorMatrix = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    ecefAnchorMatrix[i] = enuMatrix[i];
  }

  // Capture chase-cam heading/pitch. Cesium Camera.heading is radians CW from
  // North in the local ENU frame; Camera.pitch is radians above/below horizon.
  const baseHeading = viewer.camera.heading;
  const basePitch   = viewer.camera.pitch;

  return { ecefAnchorMatrix, baseHeading, basePitch };
}

// ---------------------------------------------------------------------------
// quaternionToHeadingPitch (internal helper, exported for tests)
// ---------------------------------------------------------------------------

/**
 * Convert a unit quaternion (x, y, z, w) in XR reference-space coordinates
 * (Y-up, right-hand, Z pointing out of the screen / backward) to
 * heading-and-pitch angles in Cesium's ENU convention.
 *
 * XR quaternion convention:
 *   - Identity orientation = looking toward -Z (into the screen / forward).
 *   - Y axis = up.
 *   - Yaw (head turning left/right) = rotation about +Y.
 *   - Pitch (looking up/down) = rotation about +X.
 *   - Roll (tilting head) = rotation about +Z.
 *
 * Cesium heading/pitch convention:
 *   - heading: radians clockwise from North (= -yaw in ENU terms).
 *   - pitch: radians above (positive) or below (negative) horizon.
 *
 * We extract yaw and pitch from the quaternion using standard ZXY Euler
 * decomposition matching WebXR's Y-up convention. Roll is intentionally
 * discarded (Cesium's camera roll is always zero during a ride).
 *
 * Returns { heading, pitch } as radians offsets relative to the identity
 * orientation (facing forward, level). Caller adds baseHeading / basePitch.
 *
 * @param qx  Quaternion x component (from XRRigidTransform.orientation).
 * @param qy  Quaternion y component.
 * @param qz  Quaternion z component.
 * @param qw  Quaternion w component.
 */
export function quaternionToHeadingPitch(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
): { heading: number; pitch: number } {
  // Normalise to defend against floating-point drift from the XR runtime.
  const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (len < 1e-9) return { heading: 0, pitch: 0 };
  const x = qx / len;
  const y = qy / len;
  const z = qz / len;
  const w = qw / len;

  // Extract heading (yaw around Y axis) and pitch (around X axis) from the
  // quaternion using the standard rotation matrix elements.
  //
  // Full rotation matrix column-major (from unit quaternion):
  //   R[0][0] = 1 - 2(y²+z²)    R[1][0] = 2(xy−wz)     R[2][0] = 2(xz+wy)
  //   R[0][1] = 2(xy+wz)         R[1][1] = 1 - 2(x²+z²)  R[2][1] = 2(yz−wx)
  //   R[0][2] = 2(xz−wy)         R[1][2] = 2(yz+wx)      R[2][2] = 1 - 2(x²+y²)
  //
  // WebXR forward direction = -Z in reference space. The rotated forward
  // vector components are:
  //   fwd_x = R[2][0] = 2(xz + wy)
  //   fwd_y = R[2][1] = 2(yz - wx)
  //   fwd_z = R[2][2] = 1 - 2(x² + y²)
  //
  // Heading (CW from North, in ENU where North = +Y, East = +X):
  //   XR-X = East, XR-Z (neg fwd) = -North  → XR yaw CW from North = atan2(-fwd_x, -fwd_z)
  //   But in Cesium heading is CW from North in ENU, so we keep the same sign.
  //
  // Pitch = arcsin(fwd_y) = arcsin(2(yz - wx))

  // R*(0,0,1) = the +Z column of the rotation matrix (the "backward" vector
  // in XR convention, since XR forward = -Z).
  const fwdX = 2 * (x * z + w * y);
  const fwdY = 2 * (y * z - w * x);
  const fwdZ = 1 - 2 * (x * x + y * y);

  // Gaze direction in XR space = -(R*(0,0,1)) = (-fwdX, -fwdY, -fwdZ).
  // Map to ENU (East-North-Up): XR-X → East, XR-Y → Up, XR-Z → -North, so:
  //   gaze_ENU_east  = gaze_XR_x = -fwdX
  //   gaze_ENU_north = -gaze_XR_z = fwdZ     (XR -Z is North)
  //   gaze_ENU_up    = gaze_XR_y = -fwdY
  //
  // Identity check: fwdX=0, fwdY=0, fwdZ=1 → gaze_ENU=(0, 1, 0) = North → heading=0 ✓
  // Right-turn (CW, neg-Y rotation): fwdX=-1, fwdZ=0 → gaze_ENU=(1, 0, 0) = East → heading=+π/2 ✓
  // Left-turn (CCW, pos-Y rotation): fwdX=+1, fwdZ=0 → gaze_ENU=(-1,0,0) = West → heading=-π/2 ✓

  // Heading (CW from North) = atan2(East, North).
  const heading = Math.atan2(-fwdX, fwdZ);

  // Pitch = arcsin(ENU Up component of gaze) = arcsin(-fwdY).
  // Positive X rotation (head tilts back, gaze lifts up): fwdY>0 → pitch>0 ✓
  const sinPitch = Math.max(-1, Math.min(1, -fwdY));
  const pitch    = Math.asin(sinPitch);

  return { heading, pitch };
}

// ---------------------------------------------------------------------------
// applyXRRotationToCesium
// ---------------------------------------------------------------------------

/**
 * Apply the headset's current orientation to the Cesium camera for a single
 * eye view. Must be called AFTER applyXRProjectionToCesium and BEFORE
 * viewer.scene.render() for each eye.
 *
 * Effect: sets camera.direction and camera.up so the rendered scene reflects
 * where the rider is actually looking, not just where the road is going.
 *
 * The IPD eye offset (applyXREyeOffsetToCesium from Phase 2) continues to
 * handle the lateral position shift; this function handles orientation only.
 *
 * @param viewer  Active Cesium.Viewer.
 * @param pose    XRViewerPose from the current frame (contains orientation).
 * @param anchor  RoomScaleState captured at session start.
 * @param _view   The XRView being rendered (reserved for per-eye divergence
 *                in Phase 4; currently unused — orientation is shared).
 */
export function applyXRRotationToCesium(
  viewer: CesiumType.Viewer,
  pose: XRViewerPose,
  anchor: RoomScaleState,
  _view: XRView,
): void {
  const q = pose.transform.orientation;
  const { heading: relHeading, pitch: relPitch } = quaternionToHeadingPitch(
    q.x,
    q.y,
    q.z,
    q.w,
  );

  // Compose with chase-cam base orientation. The rider's head turn is additive
  // on top of the road-following heading.
  const finalHeading = anchor.baseHeading + relHeading;
  const finalPitch   = Cesium.Math.clamp(
    anchor.basePitch + relPitch,
    -Cesium.Math.PI_OVER_TWO + 0.01, // avoid full nadir / zenith singularity
    Cesium.Math.PI_OVER_TWO  - 0.01,
  );

  // Reconstruct camera direction and up vectors from heading/pitch in ENU.
  // ENU basis vectors (column vectors from the anchor matrix, ECEF):
  //   col 0 = East  → matrix indices  0, 1, 2
  //   col 1 = North → matrix indices  4, 5, 6
  //   col 2 = Up    → matrix indices  8, 9,10
  const m = anchor.ecefAnchorMatrix;
  const east  = new Cesium.Cartesian3(m[0], m[1], m[2]);
  const north = new Cesium.Cartesian3(m[4], m[5], m[6]);
  const up    = new Cesium.Cartesian3(m[8], m[9], m[10]);

  // heading is CW from North in ENU → forward = cos(h)*N + sin(h)*E.
  const cosH = Math.cos(finalHeading);
  const sinH = Math.sin(finalHeading);
  const cosp = Math.cos(finalPitch);
  const sinp = Math.sin(finalPitch);

  // Horizontal forward (level, at heading):
  const fwdH = new Cesium.Cartesian3(
    sinH * cosp * east.x  + cosH * cosp * north.x  + sinp * up.x,
    sinH * cosp * east.y  + cosH * cosp * north.y  + sinp * up.y,
    sinH * cosp * east.z  + cosH * cosp * north.z  + sinp * up.z,
  );

  // Camera up: the "up" after pitch is applied is perpendicular to direction
  // in the vertical plane. Simplest: rotate ENU-up by the same rotation.
  //   camUp = -sin(pitch)*fwdH_level + cos(pitch)*up
  // where fwdH_level = the heading-only forward (no pitch yet).
  const fwdLevel = new Cesium.Cartesian3(
    sinH * east.x + cosH * north.x,
    sinH * east.y + cosH * north.y,
    sinH * east.z + cosH * north.z,
  );
  const camUp = new Cesium.Cartesian3(
    -sinp * fwdLevel.x + cosp * up.x,
    -sinp * fwdLevel.y + cosp * up.y,
    -sinp * fwdLevel.z + cosp * up.z,
  );

  // Normalise both vectors (the ENU basis is orthonormal so scaling is 1,
  // but floating-point accumulation can drift over many frames).
  Cesium.Cartesian3.normalize(fwdH,  fwdH);
  Cesium.Cartesian3.normalize(camUp, camUp);

  viewer.camera.direction = fwdH;
  viewer.camera.up        = camUp;
}
