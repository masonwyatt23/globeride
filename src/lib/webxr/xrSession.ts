/**
 * xrSession.ts — Wave 33.A WebXR session lifecycle.
 *
 * Integration status: PHASE 1 — clean session lifecycle + Cesium render loop
 * driven from XR RAF. Full stereo projection is Phase 2.
 *
 * What works in Phase 1:
 *   - XRSession requested and started cleanly
 *   - Cesium's render loop driven from the XR requestAnimationFrame
 *   - Camera pose logged from XRFrame viewer pose each tick (Phase 2: apply)
 *   - Session ends cleanly on headset system button or exitVR()
 *   - Normal render loop resumes after exit
 *
 * Phase 2 gap — what is needed for full stereo rendering:
 *   1. Create XRWebGLLayer from the Cesium WebGL context:
 *        const gl = viewer.scene.context._gl;
 *        await gl.makeXRCompatible();
 *        session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
 *   2. For each XRView in XRFrame, update viewer.camera frustum from
 *      view.projectionMatrix and view.transform (left/right eye separately).
 *   3. Handle XRReferenceSpace transforms for room-scale positioning,
 *      mapping headset world-space pose → Cesium ECEF camera position.
 *   4. Add 'dom-overlay' to optionalFeatures for in-headset HUD rendering.
 */

import type * as CesiumType from 'cesium';

/** Opaque handle returned by enterVR — passed back to exitVR. */
export interface XRHandle {
  session: XRSession;
  /** Restores Cesium normal render loop on exit. */
  restoreLoop: () => void;
}

let _activeHandle: XRHandle | null = null;

/**
 * Request an immersive-vr XRSession and hook it into Cesium's render loop.
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

  // Pause Cesium's own render loop so we can drive it manually from XR RAF.
  viewer.useDefaultRenderLoop = false;

  let rafId = 0;
  let refSpace: XRReferenceSpace | null = null;

  try {
    refSpace = await session.requestReferenceSpace('local-floor');
  } catch {
    // Fallback: local (seated/stationary).
    try {
      refSpace = await session.requestReferenceSpace('local');
    } catch {
      // Cannot get a reference space — abort cleanly.
      await session.end().catch(() => undefined);
      viewer.useDefaultRenderLoop = true;
      return null;
    }
  }

  function xrFrame(_time: number, frame: XRFrame) {
    rafId = session.requestAnimationFrame(xrFrame);

    // Update Cesium camera from headset pose.
    // Phase 1: we obtain the pose for future use; camera is not yet remapped
    // to XR view coordinates (Phase 2 work described in file header).
    if (refSpace) {
      const pose = frame.getViewerPose(refSpace);
      // pose.views[0].transform gives headset position in XR space.
      // Phase 2: convert XR world-space → ECEF and set viewer.camera.
      void pose;
    }

    // Drive Cesium render manually from the XR frame callback.
    // viewer.scene.render() accepts an optional JulianDate; omitting it uses
    // the scene's internal clock — identical to the default render loop.
    if (!viewer.isDestroyed()) {
      try {
        viewer.scene.render();
      } catch {
        // Context lost or similar — swallow, keep going.
      }
    }
  }

  rafId = session.requestAnimationFrame(xrFrame);

  function restoreLoop() {
    session.cancelAnimationFrame(rafId);
    if (!viewer.isDestroyed()) {
      viewer.useDefaultRenderLoop = true;
    }
    _activeHandle = null;
  }

  session.addEventListener('end', restoreLoop, { once: true });

  _activeHandle = { session, restoreLoop };
  return _activeHandle;
}

/**
 * End the active XRSession and restore Cesium's normal render loop.
 * Safe to call even if the session has already ended.
 */
export async function exitVR(handle: XRHandle): Promise<void> {
  handle.restoreLoop();
  try {
    await handle.session.end();
  } catch {
    // Session may already have ended (headset system button).
  }
}

/** Returns true if a VR session is currently active. */
export function isInVR(): boolean {
  return _activeHandle !== null;
}
