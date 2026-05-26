/**
 * xrSession.ts — Wave 34.B WebXR Phase 2: full stereo rendering.
 *
 * Integration status: PHASE 2 — stereo projection wired to Cesium.
 *
 * What Phase 2 adds on top of Phase 1:
 *   - XRWebGLLayer created from Cesium's WebGL2 context and bound to the
 *     session via session.updateRenderState({ baseLayer }).
 *   - Per-eye rendering: for each XRView we set gl.viewport to the per-eye
 *     sub-rect, apply the view's projection matrix to Cesium's camera frustum,
 *     shift the camera by the IPD eye offset in ECEF, call viewer.scene.render(),
 *     then restore camera state before the next eye.
 *   - viewer.resolutionScale reduced to 0.85 during XR for the 72-90 fps
 *     budget recommended by the Cesium VR/AR performance guide.
 *   - On exit the scale and frustum are restored; the default render loop resumes.
 *
 * Private Cesium API accesses are centralised in getCesiumWebGLContext() with
 * a single @ts-expect-error annotation — one place to update if Cesium adds a
 * public equivalent.
 *
 * Phase 2 gap — still out of scope (Phase 3+):
 *   1. 'dom-overlay' for in-headset HUD (Ride.tsx HUD not yet adapted).
 *   2. Hand-tracking / controller input (XRInputSource).
 *   3. Passthrough / immersive-ar (Quest 3 mixed-reality).
 *   4. Foveated rendering (XRProjectionLayer, not available via XRWebGLLayer).
 */

import * as Cesium from 'cesium';
import type * as CesiumType from 'cesium';

// ---------------------------------------------------------------------------
// Private Cesium API accessor — single call-site so a future public API only
// needs one replacement.
// ---------------------------------------------------------------------------

/**
 * Extract the raw WebGL2RenderingContext from an active Cesium Viewer.
 *
 * Cesium's Scene holds an internal `Context` object at `scene.context`; that
 * object wraps the canvas's WebGL2 context in a private `_gl` field.
 * There is no public API for this in Cesium 1.131.
 *
 * If Cesium ever adds a public accessor (e.g. Scene.context.gl), replace:
 *   `(viewer.scene.context as unknown as { _gl: WebGL2RenderingContext })._gl`
 * with:
 *   `(viewer.scene.context as { gl: WebGL2RenderingContext }).gl`
 */
function getCesiumWebGLContext(viewer: CesiumType.Viewer): WebGL2RenderingContext {
  // @ts-expect-error accessing private Cesium Scene.Context._gl
  return (viewer.scene.context as unknown as { _gl: WebGL2RenderingContext })._gl;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Opaque handle returned by enterVR — passed back to exitVR. */
export interface XRHandle {
  session: XRSession;
  /** Restores Cesium to the pre-XR state (render loop + resolution scale). */
  restoreLoop: () => void;
}

let _activeHandle: XRHandle | null = null;

// Resolution scale applied during XR to hit the 72-90 fps Quest 3 budget.
// Cesium VR/AR performance guide recommends 0.85 as the starting point.
const XR_RESOLUTION_SCALE = 0.85;

// ---------------------------------------------------------------------------
// Projection matrix helpers
// ---------------------------------------------------------------------------

/**
 * Apply an XRView's column-major 4×4 projection matrix to Cesium's camera
 * frustum by recovering the standard perspective parameters from the matrix.
 *
 * OpenGL-convention perspective matrix layout (column-major):
 *
 *   [ m[0]   0    m[8]   0   ]
 *   [  0   m[5]  m[9]   0   ]
 *   [  0    0   m[10]  m[14] ]
 *   [  0    0    -1     0   ]
 *
 *   m[0]  = 1/tan(fovX/2)     (x scale)
 *   m[5]  = 1/tan(fovY/2)     (y scale)
 *   m[10] = -(far+near)/(far-near)
 *   m[14] = -2*far*near/(far-near)
 *
 * From these we recover fovY, aspectRatio, near, and far without needing the
 * session's explicit depth range.
 */
function applyXRProjectionToCesium(
  camera: CesiumType.Camera,
  projectionMatrix: Float32Array,
): void {
  const m = projectionMatrix;
  const scaleX = m[0];
  const scaleY = m[5];

  // Guard against degenerate matrix from a runtime in standby / tracking-lost.
  if (scaleY === 0 || scaleX === 0) return;

  const fov = 2 * Math.atan(1 / scaleY);
  const aspectRatio = scaleY / scaleX;

  // Recover near/far from depth terms.
  const m10 = m[10];
  const m14 = m[14];
  let near = 0.1;
  let far = 10_000_000.0;
  if (m10 !== -1) {
    // Standard OpenGL perspective matrix derivation:
    //   near = m14 / (m10 - 1)   (m10-1 is the larger denominator → smaller value)
    //   far  = m14 / (m10 + 1)   (m10+1 ≈ 0 for large depth ranges → large value)
    const rawNear = m14 / (m10 - 1);
    const rawFar  = m14 / (m10 + 1);
    near = Math.max(rawNear, 0.1);
    far  = Math.max(rawFar, near * 2);
  }

  const frustum = camera.frustum as Cesium.PerspectiveFrustum;
  frustum.fov         = fov;
  frustum.aspectRatio = aspectRatio;
  frustum.near        = near;
  frustum.far         = far;
}

/**
 * Offset the Cesium camera by the XR eye's interpupillary displacement.
 *
 * The XRRigidTransform.matrix translation column (indices 12-14) carries the
 * eye's position in XR reference-space coordinates (metres, Y-up, right-hand).
 * For stereo rendering this is mainly the ±IPD/2 lateral offset (~±32 mm).
 *
 * We apply it relative to the Cesium follow-cam anchor by mapping the XR-space
 * offset through the ENU (East-North-Up) frame at the current camera position:
 *   XR-X (right)  → East
 *   XR-Y (up)     → Up
 *   XR-Z (back)   → -North   (XR Z points out of the screen, i.e. backward)
 *
 * Phase 3 note: for full 6DOF room-scale, multiply the entire XR transform by
 * an ECEF←XR rotation computed at the route-origin reference-space anchor.
 */
function applyXREyeOffsetToCesium(
  camera: CesiumType.Camera,
  viewTransform: XRRigidTransform,
): void {
  const m = viewTransform.matrix; // column-major 4×4
  // Translation column: col=3 → indices 12,13,14.
  const xrX = m[12]; // lateral  (East in ENU)
  const xrY = m[13]; // vertical (Up   in ENU)
  const xrZ = m[14]; // depth    (-North in ENU, since XR-Z points backward)

  const enuToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(camera.position);
  const localOffset = new Cesium.Cartesian3(xrX, -xrZ, xrY);
  const ecefOffset  = Cesium.Matrix4.multiplyByPointAsVector(
    enuToFixed,
    localOffset,
    new Cesium.Cartesian3(),
  );

  camera.position = Cesium.Cartesian3.add(
    camera.position,
    ecefOffset,
    new Cesium.Cartesian3(),
  );
}

// ---------------------------------------------------------------------------
// enterVR — Phase 2 implementation
// ---------------------------------------------------------------------------

/**
 * Request an immersive-vr XRSession and wire full stereo rendering into Cesium.
 *
 * Safe to call on non-XR browsers — returns null without throwing.
 *
 * @param viewer  The active Cesium.Viewer instance.
 * @returns       An XRHandle on success; null if XR is unavailable or denied.
 */
export async function enterVR(viewer: CesiumType.Viewer): Promise<XRHandle | null> {
  if (_activeHandle) return _activeHandle; // already in VR

  if (typeof navigator === 'undefined' || !navigator.xr) return null;

  let session: XRSession;
  try {
    session = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking'],
    });
  } catch {
    // User denied, hardware unavailable, etc.
    return null;
  }

  // ---- Phase 2: bind Cesium's WebGL context to the XR compositor ----------

  let gl: WebGL2RenderingContext;
  try {
    gl = getCesiumWebGLContext(viewer);
  } catch {
    // Cesium's internal structure changed or viewer already destroyed.
    await session.end().catch(() => undefined);
    return null;
  }

  // makeXRCompatible() is a no-op when the context was created with
  // { xrCompatible: true } (Wave 33.A in CesiumViewer.tsx), but is
  // spec-required before constructing an XRWebGLLayer.
  await (gl as WebGL2RenderingContext & { makeXRCompatible?: () => Promise<void> })
    .makeXRCompatible?.();

  // Guard: XRWebGLLayer only exists in a real XR browser; it is undefined in
  // jsdom / vitest test environments.
  if (typeof XRWebGLLayer === 'undefined') {
    await session.end().catch(() => undefined);
    return null;
  }

  const layer = new XRWebGLLayer(session, gl);
  await session.updateRenderState({ baseLayer: layer });

  // ---- Reference space ----------------------------------------------------

  let refSpace: XRReferenceSpace | null = null;
  try {
    refSpace = await session.requestReferenceSpace('local-floor');
  } catch {
    try {
      refSpace = await session.requestReferenceSpace('local');
    } catch {
      await session.end().catch(() => undefined);
      return null;
    }
  }

  // ---- Performance: reduce resolution for 72-90 fps headroom --------------

  const previousResolutionScale = viewer.resolutionScale ?? 1.0;
  viewer.resolutionScale = XR_RESOLUTION_SCALE;

  // Pause Cesium's own render loop — XR RAF drives rendering from here.
  viewer.useDefaultRenderLoop = false;

  // ---- Per-frame stereo callback ------------------------------------------

  let rafId = 0;

  function xrFrame(_time: number, frame: XRFrame) {
    rafId = session.requestAnimationFrame(xrFrame);

    if (!refSpace) return;

    const pose = frame.getViewerPose(refSpace);
    if (!pose) {
      // Tracking lost — skip this frame, keep the loop alive.
      return;
    }

    if (viewer.isDestroyed()) return;

    // Bind the XR compositor's framebuffer so all subsequent draws land there.
    // The XR compositor owns this framebuffer and composites it into the lens.
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);

    // Capture the shared follow-cam state once; each eye rendering shifts the
    // camera by its IPD offset and then restores it for the next eye.
    const sharedPosition = Cesium.Cartesian3.clone(viewer.camera.position);
    const sharedFrustum  = viewer.camera.frustum.clone();

    for (const view of pose.views) {
      const xrViewport = layer.getViewport(view);

      // Restrict WebGL drawing to this eye's sub-rect of the XR framebuffer.
      gl.viewport(xrViewport.x, xrViewport.y, xrViewport.width, xrViewport.height);

      // Apply per-eye projection and IPD offset, render, then restore so the
      // next eye starts from the same follow-cam anchor.
      try {
        applyXRProjectionToCesium(viewer.camera, view.projectionMatrix);
        applyXREyeOffsetToCesium(viewer.camera, view.transform);

        try {
          viewer.scene.render();
        } catch {
          // WebGL context loss during XR — keep the loop alive; the browser
          // will fire a 'webglcontextrestored' event if it recovers.
        }
      } finally {
        // Always restore, even if render threw, so the next eye is not skewed.
        viewer.camera.position = sharedPosition;
        viewer.camera.frustum  = sharedFrustum;
      }
    }
  }

  rafId = session.requestAnimationFrame(xrFrame);

  // ---- Cleanup on session end (headset button or exitVR()) ----------------

  function restoreLoop() {
    session.cancelAnimationFrame(rafId);
    if (!viewer.isDestroyed()) {
      viewer.resolutionScale = previousResolutionScale;
      viewer.useDefaultRenderLoop = true;

      // Reset frustum to a standard perspective so the follow-cam renders
      // correctly after returning from VR (avoids the XR FOV persisting).
      const frustum       = new Cesium.PerspectiveFrustum();
      frustum.fov         = Cesium.Math.toRadians(60);
      frustum.aspectRatio =
        viewer.scene.drawingBufferWidth /
        Math.max(viewer.scene.drawingBufferHeight, 1);
      frustum.near = 0.1;
      frustum.far  = 10_000_000.0;
      viewer.camera.frustum = frustum;
    }
    _activeHandle = null;
  }

  session.addEventListener('end', restoreLoop, { once: true });

  _activeHandle = { session, restoreLoop };
  return _activeHandle;
}

// ---------------------------------------------------------------------------
// exitVR
// ---------------------------------------------------------------------------

/**
 * End the active XRSession and restore Cesium's normal render loop.
 * Safe to call even if the session has already ended (idempotent).
 */
export async function exitVR(handle: XRHandle): Promise<void> {
  handle.restoreLoop();
  try {
    await handle.session.end();
  } catch {
    // Session may already have ended (headset system button or context loss).
  }
}

// ---------------------------------------------------------------------------
// isInVR
// ---------------------------------------------------------------------------

/** Returns true if a VR session is currently active. */
export function isInVR(): boolean {
  return _activeHandle !== null;
}

// ---------------------------------------------------------------------------
// _resetActiveHandle — test-only
// ---------------------------------------------------------------------------

/**
 * Reset the module-level active-handle state. Only used in tests.
 * @internal
 */
export function _resetActiveHandle(): void {
  _activeHandle = null;
}
