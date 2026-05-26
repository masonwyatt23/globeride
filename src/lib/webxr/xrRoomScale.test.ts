/**
 * xrRoomScale.test.ts — Wave 35.C
 *
 * Unit tests for 6DOF room-scale utilities.
 *
 * What IS testable in jsdom:
 *   - quaternionToHeadingPitch math (pure function, no DOM / WebGL required)
 *   - createRoomScaleAnchor shape and numeric sanity (mocked Cesium viewer)
 *   - applyXRRotationToCesium side-effects on a mocked camera (mocked viewer)
 *   - Normalisation of malformed quaternions (zero-length guard)
 *   - Clamping of extreme pitch values
 *
 * What is NOT testable in jsdom:
 *   - Actual XRViewerPose delivery from a real headset runtime
 *   - GPU-side scene.render() output resulting from the camera mutation
 *   - `local-floor` vs `local` reference space quality difference at runtime
 *   - Roll handling (intentionally discarded; no real headset to verify)
 *
 * These gaps require integration testing on Quest 3 / Vision Pro or a WebXR
 * device emulator (Chrome DevTools XR Emulator extension).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Cartesian3 } from 'cesium';
import {
  createRoomScaleAnchor,
  quaternionToHeadingPitch,
  applyXRRotationToCesium,
  type RoomScaleState,
} from './xrRoomScale';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Minimal Cesium Viewer stub with a mutable camera. */
function makeMockViewer(headingRad = 0, pitchRad = 0) {
  return {
    camera: {
      heading: headingRad,
      pitch:   pitchRad,
      // These will be set by applyXRRotationToCesium.
      direction: new Cartesian3(),
      up:        new Cartesian3(),
    },
    scene: {
      render: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
  } as unknown as import('cesium').Viewer;
}

/** Build a synthetic RoomScaleState for a viewer at the equator/prime-meridian. */
function makeAnchor(baseHeading = 0, basePitch = 0): RoomScaleState {
  const viewer = makeMockViewer(baseHeading, basePitch);
  // Rider at lat=0, lon=0 for a clean identity-like ENU matrix.
  return createRoomScaleAnchor(viewer, { lat: 0, lon: 0, ele: 0 });
}

/** Build a synthetic XRViewerPose from a quaternion. */
function makePose(qx: number, qy: number, qz: number, qw: number): XRViewerPose {
  return {
    transform: {
      orientation: { x: qx, y: qy, z: qz, w: qw } as DOMPointReadOnly,
      position: { x: 0, y: 0, z: 0, w: 1 } as DOMPointReadOnly,
      matrix: new Float32Array(16),
      inverse: {} as XRRigidTransform,
    },
    views: [],
  } as unknown as XRViewerPose;
}

const stubView: XRView = {
  eye: 'left',
  projectionMatrix: new Float32Array(16),
  transform: {
    orientation: { x: 0, y: 0, z: 0, w: 1 } as DOMPointReadOnly,
    position: { x: 0, y: 0, z: 0, w: 1 } as DOMPointReadOnly,
    matrix: new Float32Array(16),
    inverse: {} as XRRigidTransform,
  },
};

// ---------------------------------------------------------------------------
// quaternionToHeadingPitch — pure math tests
// ---------------------------------------------------------------------------

describe('quaternionToHeadingPitch', () => {
  it('returns {0, 0} for identity quaternion (facing forward, level)', () => {
    // Identity: no rotation, looking toward -Z (forward in XR convention).
    const { heading, pitch } = quaternionToHeadingPitch(0, 0, 0, 1);
    expect(heading).toBeCloseTo(0, 5);
    expect(pitch).toBeCloseTo(0, 5);
  });

  it('returns heading ≈ -π/2 for 90° CCW yaw about +Y (head turned left in right-hand XR convention)', () => {
    // WebXR uses right-hand rule: positive rotation about +Y is CCW viewed from above.
    // CCW yaw = turning LEFT → gaze moves from -Z toward -X (West in ENU) → heading ≈ -π/2.
    // q = (0, sin(π/4), 0, cos(π/4)) encodes a +90° CCW (left) yaw.
    const angle = Math.PI / 2;
    const { heading, pitch } = quaternionToHeadingPitch(
      0,
      Math.sin(angle / 2),
      0,
      Math.cos(angle / 2),
    );
    expect(heading).toBeCloseTo(-Math.PI / 2, 4);
    expect(pitch).toBeCloseTo(0, 4);
  });

  it('returns heading ≈ +π/2 for 90° CW yaw (head turned right, negative Y rotation)', () => {
    // CW yaw (right) = negative rotation about +Y.
    // q = (0, -sin(π/4), 0, cos(π/4)) encodes -90° (CW / rightward) yaw.
    const angle = Math.PI / 2;
    const { heading, pitch } = quaternionToHeadingPitch(
      0,
      -Math.sin(angle / 2),
      0,
      Math.cos(angle / 2),
    );
    expect(heading).toBeCloseTo(Math.PI / 2, 4);
    expect(pitch).toBeCloseTo(0, 4);
  });

  it('returns pitch ≈ +π/6 for 30° look-up (positive X rotation in XR lifts gaze)', () => {
    // In WebXR right-hand rule: positive rotation about +X tilts the top of the
    // head backward, lifting the gaze direction upward in world space.
    // q = (sin(π/12), 0, 0, cos(π/12)) → look-up by 30°.
    const angle = Math.PI / 6; // 30°
    const { heading, pitch } = quaternionToHeadingPitch(
      Math.sin(angle / 2),
      0,
      0,
      Math.cos(angle / 2),
    );
    expect(pitch).toBeCloseTo(angle, 3);
    expect(heading).toBeCloseTo(0, 3);
  });

  it('returns {0, 0} for zero-length quaternion (degenerate guard)', () => {
    // Should return zeros without throwing or producing NaN.
    const { heading, pitch } = quaternionToHeadingPitch(0, 0, 0, 0);
    expect(heading).toBe(0);
    expect(pitch).toBe(0);
  });

  it('normalises a non-unit quaternion correctly', () => {
    // Double the identity quaternion — should normalise to identity.
    const { heading, pitch } = quaternionToHeadingPitch(0, 0, 0, 2);
    expect(heading).toBeCloseTo(0, 5);
    expect(pitch).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// createRoomScaleAnchor
// ---------------------------------------------------------------------------

describe('createRoomScaleAnchor', () => {
  it('returns a Float64Array ecefAnchorMatrix of length 16', () => {
    const anchor = makeAnchor();
    expect(anchor.ecefAnchorMatrix).toBeInstanceOf(Float64Array);
    expect(anchor.ecefAnchorMatrix.length).toBe(16);
  });

  it('captures baseHeading from the viewer camera', () => {
    const viewer = makeMockViewer(1.23, -0.1);
    const anchor = createRoomScaleAnchor(viewer, { lat: 51.5, lon: -0.12, ele: 10 });
    expect(anchor.baseHeading).toBeCloseTo(1.23, 5);
  });

  it('captures basePitch from the viewer camera', () => {
    const viewer = makeMockViewer(0, -0.3);
    const anchor = createRoomScaleAnchor(viewer, { lat: 51.5, lon: -0.12, ele: 10 });
    expect(anchor.basePitch).toBeCloseTo(-0.3, 5);
  });

  it('ecefAnchorMatrix is non-zero for a real coordinate', () => {
    // At lat=51.5°N, lon=-0.12°E, the ECEF origin is ~6371 km from centre —
    // the translation column (indices 12-14) must be non-zero.
    const anchor = makeAnchor(); // lat=0, lon=0 — ECEF (6378137, 0, 0)
    // Translation column indices (column-major 4×4): col 3 → indices 12,13,14.
    const tx = anchor.ecefAnchorMatrix[12];
    const ty = anchor.ecefAnchorMatrix[13];
    const tz = anchor.ecefAnchorMatrix[14];
    const dist = Math.sqrt(tx * tx + ty * ty + tz * tz);
    // Earth radius ≈ 6,356,752 – 6,378,137 m at various latitudes.
    expect(dist).toBeGreaterThan(6_000_000);
  });
});

// ---------------------------------------------------------------------------
// applyXRRotationToCesium
// ---------------------------------------------------------------------------

describe('applyXRRotationToCesium', () => {
  let viewer: ReturnType<typeof makeMockViewer>;
  let anchor: RoomScaleState;

  beforeEach(() => {
    viewer = makeMockViewer(0, 0);
    anchor = makeAnchor(0, 0);
  });

  it('sets camera.direction to a non-zero vector for identity quaternion', () => {
    const pose = makePose(0, 0, 0, 1); // identity — facing forward
    applyXRRotationToCesium(viewer as unknown as import('cesium').Viewer, pose, anchor, stubView);
    const dir = viewer.camera.direction as Cartesian3;
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    expect(len).toBeGreaterThan(0.9); // should be unit vector
    expect(len).toBeLessThan(1.1);
  });

  it('camera.direction changes when yaw quaternion changes', () => {
    // Identity pose
    const pose0 = makePose(0, 0, 0, 1);
    applyXRRotationToCesium(viewer as unknown as import('cesium').Viewer, pose0, anchor, stubView);
    const dir0 = { ...viewer.camera.direction } as Cartesian3;

    // 45° CW yaw
    const angle = Math.PI / 4;
    const pose1 = makePose(0, Math.sin(angle / 2), 0, Math.cos(angle / 2));
    applyXRRotationToCesium(viewer as unknown as import('cesium').Viewer, pose1, anchor, stubView);
    const dir1 = viewer.camera.direction as Cartesian3;

    // Direction vectors must differ — the camera moved.
    const diff = Math.abs(dir0.x - dir1.x) + Math.abs(dir0.y - dir1.y) + Math.abs(dir0.z - dir1.z);
    expect(diff).toBeGreaterThan(0.01);
  });

  it('pitch clamping prevents camera.up from becoming invalid at extreme angles', () => {
    // 89° look-up — near the singularity. Should not throw or produce NaN.
    const angle = (89 * Math.PI) / 180;
    const pose  = makePose(-Math.sin(angle / 2), 0, 0, Math.cos(angle / 2));
    expect(() => {
      applyXRRotationToCesium(viewer as unknown as import('cesium').Viewer, pose, anchor, stubView);
    }).not.toThrow();
    const up = viewer.camera.up as Cartesian3;
    expect(isNaN(up.x)).toBe(false);
    expect(isNaN(up.y)).toBe(false);
    expect(isNaN(up.z)).toBe(false);
  });

  it('baseHeading offset is respected — same quaternion at different base headings gives different directions', () => {
    const pose = makePose(0, 0, 0, 1); // identity quaternion
    const anchor0 = makeAnchor(0, 0);
    const anchor1 = makeAnchor(Math.PI / 2, 0); // 90° base heading

    applyXRRotationToCesium(viewer as unknown as import('cesium').Viewer, pose, anchor0, stubView);
    const dir0 = { ...viewer.camera.direction } as Cartesian3;

    applyXRRotationToCesium(viewer as unknown as import('cesium').Viewer, pose, anchor1, stubView);
    const dir1 = viewer.camera.direction as Cartesian3;

    const diff = Math.abs(dir0.x - dir1.x) + Math.abs(dir0.y - dir1.y) + Math.abs(dir0.z - dir1.z);
    expect(diff).toBeGreaterThan(0.01);
  });
});
