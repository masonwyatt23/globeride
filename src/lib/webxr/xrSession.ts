/**
 * xrSession.ts WebXR Phase 2 + Phase 3.
 *
 * Integration status: PHASE 3 — 6DOF room-scale + DOM overlay HUD.
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
 * What Phase 3 adds:
 *   - 'dom-overlay' optional feature: pass domOverlayRoot to enterVR() to
 *     enable in-headset DOM HUD rendering (Quest 3 / Chrome).
 *   - 6DOF room-scale: a RoomScaleAnchor is captured at session start; each
 *     frame the headset's orientation quaternion is composed with the
 *     chase-cam's heading/pitch so riders can look around freely.
 *   - runXRFrameLoop accepts an optional RoomScaleState — when provided it
 *     calls applyXRRotationToCesium before each eye render.
 *
 * Private Cesium API accesses are centralised in getCesiumWebGLContext() with
 * a single @ts-expect-error annotation — one place to update if Cesium adds a
 * public equivalent.
 *
 * Shared exports for AR reuse:
 *   - getCesiumWebGLContext, createXRWebGLLayer, requestXRReferenceSpace, and
 *     runXRFrameLoop are exported so xrAR.ts can reuse the same rendering
 *     infrastructure without copy-paste.
 *
 * Remaining out of scope (Phase 4+):
 *   1. Hand-tracking / controller input (XRInputSource event loop).
 *   2. Foveated rendering (XRProjectionLayer, not available via XRWebGLLayer).
 *   3. Positional 6DOF (room-scale walking mapped to ECEF translation).
 */

import * as Cesium from 'cesium';
import type * as CesiumType from 'cesium';

import {
  createRoomScaleAnchor,
  applyXRRotationToCesium,
  type RoomScaleState,
} from './xrRoomScale';
import { getDomOverlayInit } from './xrDomOverlay';

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
 *
 * Exported for reuse by xrAR.ts.
 */
export function getCesiumWebGLContext(viewer: CesiumType.Viewer): WebGL2RenderingContext {
  // @ts-expect-error accessing private Cesium Scene.Context._gl
  return (viewer.scene.context as unknown as { _gl: WebGL2RenderingContext })._gl;
}

// ---------------------------------------------------------------------------
// Shared helpers — exported for xrAR.ts
// ---------------------------------------------------------------------------

/**
 * Create an XRWebGLLayer from a WebGL2 context and bind alpha transparency.
 *
 * Returns null in environments where XRWebGLLayer is not defined (jsdom,
 * non-XR desktop browsers). The `alpha` option enables alpha-blending for AR
 * passthrough — ignored in opaque VR mode (the compositor discards alpha).
 *
 * @param session  The active XRSession.
 * @param gl       Cesium's WebGL2 context (must be XR-compatible).
 * @param init     Optional XRWebGLLayerInit overrides (e.g. { alpha: true }).
 * @returns        A new XRWebGLLayer, or null when XRWebGLLayer is undefined.
 */
export function createXRWebGLLayer(
  session: XRSession,
  gl: WebGL2RenderingContext,
  init?: XRWebGLLayerInit,
): XRWebGLLayer | null {
  if (typeof XRWebGLLayer === 'undefined') return null;
  return new XRWebGLLayer(session, gl, init);
}

/**
 * Request a reference space from the XR session, trying 'local-floor' first
 * and falling back to 'local' if the floor variant is unsupported.
 *
 * Returns null if both attempts fail (e.g. tracking unavailable).
 *
 * Exported for reuse by xrAR.ts.
 */
export async function requestXRReferenceSpace(
  session: XRSession,
): Promise<XRReferenceSpace | null> {
  try {
    return await session.requestReferenceSpace('local-floor');
  } catch {
    try {
      return await session.requestReferenceSpace('local');
    } catch {
      return null;
    }
  }
}

/** Handle returned by runXRFrameLoop — call stop() to cancel the RAF loop. */
export interface XRFrameLoopHandle {
  stop: () => void;
}

// Phase 4: the latest XRFrame captured by runXRFrameLoop. Consumers (such as
// xrHandInput) read this synchronously to access getJointPose without owning
// their own RAF loop. Reset to null on session end / restoreLoop().
let _latestFrame: XRFrame | null = null;
let _latestRefSpace: XRReferenceSpace | null = null;

/**
 * Return the most recently captured XRFrame, or null if no frame is in flight.
 * Used by xrHandInput.subscribeHandInput so it doesn't need to own a RAF loop.
 */
export function getLatestXRFrame(): XRFrame | null {
  return _latestFrame;
}

/**
 * Return the reference space active for the current XR session, or null.
 * Mirrors getLatestXRFrame — both are reset together on session end.
 */
export function getLatestXRReferenceSpace(): XRReferenceSpace | null {
  return _latestRefSpace;
}

/**
 * Start the per-frame XR render loop: for each animation frame, retrieve the
 * viewer pose and render one Cesium frame per eye into the XR compositor's
 * framebuffer.
 *
 * This is the same loop used by enterVR, extracted so xrAR.ts can reuse it
 * without copy-pasting the per-eye rendering logic.
 *
 * @param session    Active XRSession (vr or ar).
 * @param layer      The XRWebGLLayer bound to the session.
 * @param refSpace   The reference space acquired for this session.
 * @param viewer     The active Cesium.Viewer.
 * @param roomScale  Optional Phase 3 room-scale anchor. When provided,
 *                   applyXRRotationToCesium() is called per-eye so the
 *                   headset's orientation is reflected in the Cesium camera.
 *                   When absent the loop behaves identically to Phase 2
 *                   (IPD-only offset, no head-rotation tracking).
 * @returns          A handle with a stop() method to cancel the loop.
 */
export function runXRFrameLoop(
  session: XRSession,
  layer: XRWebGLLayer,
  refSpace: XRReferenceSpace,
  viewer: CesiumType.Viewer,
  roomScale?: RoomScaleState,
): XRFrameLoopHandle {
  const gl = getCesiumWebGLContext(viewer);
  let rafId = 0;

  function xrFrame(_time: number, frame: XRFrame) {
    rafId = session.requestAnimationFrame(xrFrame);

    // Phase 4: publish the latest frame + refSpace so xrHandInput.ts can
    // read joint poses without owning a second RAF loop.
    _latestFrame = frame;
    _latestRefSpace = refSpace;

    const pose = frame.getViewerPose(refSpace);
    if (!pose) return; // tracking lost — keep loop alive

    if (viewer.isDestroyed()) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);

    const sharedPosition  = Cesium.Cartesian3.clone(viewer.camera.position);
    const sharedFrustum   = viewer.camera.frustum.clone();
    // Phase 3: also snapshot direction/up so room-scale rotation can be
    // restored cleanly between eyes (orientation is shared, but we must
    // reset it after each eye just like position).
    const sharedDirection = roomScale
      ? Cesium.Cartesian3.clone(viewer.camera.direction)
      : undefined;
    const sharedUp = roomScale
      ? Cesium.Cartesian3.clone(viewer.camera.up)
      : undefined;

    for (const view of pose.views) {
      const xrViewport = layer.getViewport(view);
      gl.viewport(xrViewport.x, xrViewport.y, xrViewport.width, xrViewport.height);

      try {
        applyXRProjectionToCesium(viewer.camera, view.projectionMatrix);
        // Phase 3: apply headset orientation BEFORE the IPD eye offset so
        // the rotation is in the correct world frame. The eye offset is then
        // applied on top of the rotated camera position.
        if (roomScale) {
          applyXRRotationToCesium(viewer, pose, roomScale, view);
        }
        applyXREyeOffsetToCesium(viewer.camera, view.transform);
        try {
          viewer.scene.render();
        } catch {
          // WebGL context loss — keep loop alive; browser fires webglcontextrestored.
        }
      } finally {
        viewer.camera.position = sharedPosition;
        viewer.camera.frustum  = sharedFrustum;
        if (sharedDirection) viewer.camera.direction = sharedDirection;
        if (sharedUp)        viewer.camera.up        = sharedUp;
      }
    }
  }

  rafId = session.requestAnimationFrame(xrFrame);
  return {
    stop: () => {
      session.cancelAnimationFrame(rafId);
      // Phase 4: clear the published frame snapshot so late readers see null
      // instead of a stale frame from a previous session.
      _latestFrame = null;
      _latestRefSpace = null;
    },
  };
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
 * Phase 3 additions:
 *   - domOverlayRoot: when provided, 'dom-overlay' is added to optionalFeatures
 *     and the element is passed as domOverlay.root. On Quest/Chrome the headset
 *     compositor renders the DOM subtree in-headset (head-locked or floating).
 *     Falls back silently if the browser doesn't grant the feature.
 *   - room-scale: a RoomScaleAnchor is computed from the viewer's current camera
 *     state once the session is established. The anchor is threaded into
 *     runXRFrameLoop so every frame applies headset orientation to the camera.
 *     Falls back to Phase 2 IPD-only if anchor creation throws.
 *
 * @param viewer          The active Cesium.Viewer instance.
 * @param domOverlayRoot  Optional HTMLElement root for in-headset DOM HUD.
 * @returns               An XRHandle on success; null if XR is unavailable or denied.
 */
export async function enterVR(
  viewer: CesiumType.Viewer,
  domOverlayRoot?: HTMLElement | null,
): Promise<XRHandle | null> {
  if (_activeHandle) return _activeHandle; // already in VR

  if (typeof navigator === 'undefined' || !navigator.xr) return null;

  // Phase 3: build dom-overlay init fragment (empty object when unsupported).
  const domOverlayFragment = getDomOverlayInit(domOverlayRoot ?? null);
  const hasDomOverlay = 'domOverlay' in domOverlayFragment;

  let session: XRSession;
  try {
    session = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: [
        'bounded-floor',
        'hand-tracking',
        ...(hasDomOverlay ? ['dom-overlay'] : []),
      ],
      ...domOverlayFragment,
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
  // { xrCompatible: true } in CesiumViewer.tsx, but the call is
  // still spec-required before constructing an XRWebGLLayer.
  await (gl as WebGL2RenderingContext & { makeXRCompatible?: () => Promise<void> })
    .makeXRCompatible?.();

  // Use shared helper — returns null when XRWebGLLayer is undefined (jsdom).
  const layer = createXRWebGLLayer(session, gl);
  if (!layer) {
    await session.end().catch(() => undefined);
    return null;
  }

  await session.updateRenderState({ baseLayer: layer });

  // ---- Reference space — shared helper tries local-floor then local -------

  const refSpace = await requestXRReferenceSpace(session);
  if (!refSpace) {
    await session.end().catch(() => undefined);
    return null;
  }

  // ---- Performance: reduce resolution for 72-90 fps headroom --------------

  const previousResolutionScale = viewer.resolutionScale ?? 1.0;
  viewer.resolutionScale = XR_RESOLUTION_SCALE;

  // Pause Cesium's own render loop — XR RAF drives rendering from here.
  viewer.useDefaultRenderLoop = false;

  // ---- Phase 3: room-scale anchor — captured once at session start --------
  // We derive the rider's position from the current Cesium camera position
  // via cartographic conversion. This is the anchor for all subsequent
  // head-rotation compositing.
  let roomScale: RoomScaleState | undefined;
  try {
    const camPos      = viewer.camera.position;
    const cartographic = Cesium.Cartographic.fromCartesian(camPos);
    roomScale = createRoomScaleAnchor(viewer, {
      lat: Cesium.Math.toDegrees(cartographic.latitude),
      lon: Cesium.Math.toDegrees(cartographic.longitude),
      ele: cartographic.height,
    });
  } catch {
    // Anchor creation failed (e.g. viewer position not yet set) — fall back
    // to Phase 2 IPD-only rendering without head rotation.
    roomScale = undefined;
  }

  // ---- Per-frame stereo callback — shared runXRFrameLoop helper -----------

  const frameLoop = runXRFrameLoop(session, layer, refSpace, viewer, roomScale);

  // ---- Cleanup on session end (headset button or exitVR()) ----------------

  function restoreLoop() {
    frameLoop.stop();
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

/**
 * Return the live XRSession from the active handle, or null.
 *
 * Used by VRHud / VRHudOverlay to query session.domOverlayState without
 * storing the session in React state (avoids a re-render on every frame).
 */
export function getActiveSession(): XRSession | null {
  return _activeHandle?.session ?? null;
}
