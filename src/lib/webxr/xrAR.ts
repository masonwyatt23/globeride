/**
 * xrAR.ts AR (immersive-ar) session management.
 *
 * Adds the passthrough AR variant to the GlobeRide WebXR pipeline.
 * AR mode renders the Cesium scene as a transparent overlay through
 * the headset's passthrough cameras (Quest 3 native, Vision Pro WebXR).
 *
 * Design:
 *   - Uses the same XRWebGLLayer / per-frame loop as VR mode (xrSession.ts),
 *     reusing the shared helpers exported from that module.
 *   - Cesium background is set to TRANSPARENT so the passthrough feed shows
 *     through; atmosphere + skyBox are hidden (they'd obscure the real world).
 *   - Resolution scale is lowered to 0.6 (vs 0.85 for VR) — AR has a tighter
 *     latency budget because passthrough adds its own compositor latency.
 *   - Spectator crowds + clouds (ProPelotonAvatars) are hidden via a CSS class
 *     on the document root — they're visual noise over the real environment.
 *
 * AR vs VR coexistence:
 *   - AR and VR use separate module-level handles (_activeARHandle vs
 *     _activeHandle in xrSession.ts). Entering AR does not affect the VR path.
 *   - Both can coexist in detection (detectXR returns both flags), but only one
 *     immersive session can be active at a time per the WebXR spec.
 *
 * Supported hardware (as of 2026):
 *   - Meta Quest 3 — native WebXR AR support in Meta Browser.
 *   - Apple Vision Pro — limited WebXR AR support; background passthrough
 *     requires the `'immersive-ar'` session mode check to pass.
 *   - Most desktop browsers: AR NOT supported → EnterARButton is invisible.
 *
 * Source: https://www.w3.org/TR/webxr-ar-module/
 *         https://immersiveweb.dev/#armodule
 */

import * as Cesium from 'cesium';
import type * as CesiumType from 'cesium';

import {
  getCesiumWebGLContext,
  createXRWebGLLayer,
  requestXRReferenceSpace,
  runXRFrameLoop,
  type XRFrameLoopHandle,
} from './xrSession';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * AR uses a lower resolution scale than VR.
 * Quest 3 passthrough compositing adds ~10–15 ms; reduce GPU budget to stay
 * inside the 20 ms latency ceiling required for comfortable passthrough.
 */
const AR_RESOLUTION_SCALE = 0.6;

/** CSS class added to <html> during AR — hides spectator/cloud layers. */
const AR_SCENE_CLASS = 'globeride-ar-mode';

// ---------------------------------------------------------------------------
// Saved viewer state — restored on exitAR
// ---------------------------------------------------------------------------

interface ViewerARState {
  backgroundColor: CesiumType.Color;
  skyAtmosphereShow: boolean;
  skyBoxShow: boolean;
  imageryLayerAlpha: number;
  resolutionScale: number;
}

// ---------------------------------------------------------------------------
// Module-level AR handle (separate from VR's _activeHandle)
// ---------------------------------------------------------------------------

export interface XRARHandle {
  session: XRSession;
  /** Restore Cesium to pre-AR state and resume the default render loop. */
  restoreViewer: () => void;
}

let _activeARHandle: XRARHandle | null = null;

// ---------------------------------------------------------------------------
// enterAR
// ---------------------------------------------------------------------------

/**
 * Request an immersive-ar XRSession and wire transparent rendering into Cesium.
 *
 * Safe to call on non-AR browsers — returns null without throwing.
 *
 * @param viewer         The active Cesium.Viewer instance.
 * @param opts.domOverlayRoot  Optional root element for in-headset DOM overlay.
 * @returns              An XRARHandle on success; null if AR is unavailable or
 *                       denied by the user / UA.
 */
export async function enterAR(
  viewer: CesiumType.Viewer,
  opts?: { domOverlayRoot?: HTMLElement },
): Promise<XRARHandle | null> {
  // Re-entrant guard: if already in AR, return the existing handle.
  if (_activeARHandle) return _activeARHandle;

  if (typeof navigator === 'undefined' || !navigator.xr) return null;

  // ---- Request the immersive-ar session ----------------------------------

  let session: XRSession;
  try {
    const sessionInit: XRSessionInit = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['dom-overlay'],
    };

    // Wire up dom-overlay if the caller provided a root element.
    // The XRSessionInit interface in webxr.d.ts already declares domOverlay.
    if (opts?.domOverlayRoot) {
      sessionInit.domOverlay = { root: opts.domOverlayRoot };
    }

    session = await navigator.xr.requestSession('immersive-ar', sessionInit);
  } catch {
    // User denied, hardware unavailable, etc.
    return null;
  }

  // ---- Bind Cesium's WebGL context to the XR compositor -----------------

  let gl: WebGL2RenderingContext;
  try {
    gl = getCesiumWebGLContext(viewer);
  } catch {
    await session.end().catch(() => undefined);
    return null;
  }

  await (gl as WebGL2RenderingContext & { makeXRCompatible?: () => Promise<void> })
    .makeXRCompatible?.();

  // Guard: XRWebGLLayer only exists in a real XR browser.
  const layer = createXRWebGLLayer(session, gl, { alpha: true });
  if (!layer) {
    await session.end().catch(() => undefined);
    return null;
  }

  await session.updateRenderState({ baseLayer: layer });

  // ---- Reference space --------------------------------------------------

  const refSpace = await requestXRReferenceSpace(session);
  if (!refSpace) {
    await session.end().catch(() => undefined);
    return null;
  }

  // ---- Save and apply AR visual state -----------------------------------

  const savedState: ViewerARState = saveViewerARState(viewer);
  applyARVisualState(viewer);

  // ---- Start frame loop -------------------------------------------------

  const frameLoopHandle: XRFrameLoopHandle = runXRFrameLoop(session, layer, refSpace, viewer);

  // ---- Cleanup on session end (headset button or exitAR()) --------------

  function restoreViewer() {
    frameLoopHandle.stop();
    restoreViewerARState(viewer, savedState);
    document.documentElement.classList.remove(AR_SCENE_CLASS);
    _activeARHandle = null;
  }

  session.addEventListener('end', restoreViewer, { once: true });

  _activeARHandle = { session, restoreViewer };
  return _activeARHandle;
}

// ---------------------------------------------------------------------------
// exitAR
// ---------------------------------------------------------------------------

/**
 * End the active AR XRSession and restore Cesium's normal render loop.
 * Idempotent — safe to call even if the session has already ended.
 */
export async function exitAR(handle: XRARHandle): Promise<void> {
  handle.restoreViewer();
  try {
    await handle.session.end();
  } catch {
    // Session may already have ended.
  }
}

// ---------------------------------------------------------------------------
// isInAR
// ---------------------------------------------------------------------------

/** Returns true if an AR session is currently active. */
export function isInAR(): boolean {
  return _activeARHandle !== null;
}

// ---------------------------------------------------------------------------
// _resetActiveARHandle — test-only
// ---------------------------------------------------------------------------

/**
 * Reset the module-level AR handle state. Only used in tests.
 * @internal
 */
export function _resetActiveARHandle(): void {
  _activeARHandle = null;
}

// ---------------------------------------------------------------------------
// Viewer state helpers
// ---------------------------------------------------------------------------

/**
 * Capture the Cesium viewer's current visual settings so they can be restored
 * after exiting AR. Called once before applying AR state.
 */
function saveViewerARState(viewer: CesiumType.Viewer): ViewerARState {
  // Base imagery alpha — first layer only (the satellite/street map base).
  const baseLayerAlpha = viewer.imageryLayers.length > 0
    ? viewer.imageryLayers.get(0).alpha
    : 1.0;

  return {
    backgroundColor:   viewer.scene.backgroundColor.clone(),
    skyAtmosphereShow: viewer.scene.skyAtmosphere?.show ?? true,
    skyBoxShow:        viewer.scene.skyBox?.show ?? true,
    imageryLayerAlpha: baseLayerAlpha,
    resolutionScale:   viewer.resolutionScale ?? 1.0,
  };
}

/**
 * Apply AR-mode visual overrides to the Cesium viewer:
 *   - Transparent background (passthrough camera shows through)
 *   - No atmosphere (it would occlude the real world)
 *   - No skybox (same reason)
 *   - Reduced resolution for latency headroom
 *   - CSS class on <html> to hide spectators/clouds via Tailwind variants
 */
function applyARVisualState(viewer: CesiumType.Viewer): void {
  // Fully transparent background — the XR compositor composites Cesium's
  // alpha-blended output over the passthrough camera feed.
  viewer.scene.backgroundColor = Cesium.Color.TRANSPARENT;

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = false;
  }
  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = false;
  }

  // Reduce base imagery opacity — the route + rider stay visible but the
  // satellite tiles are dimmed so the real floor/walls show through more
  // clearly. Set to 0 to fully hide imagery; 0.3 keeps faint road reference.
  if (viewer.imageryLayers.length > 0) {
    viewer.imageryLayers.get(0).alpha = 0.0;
  }

  // Lower resolution scale for AR latency budget.
  viewer.resolutionScale = AR_RESOLUTION_SCALE;

  // Pause Cesium's own render loop — XR RAF drives rendering.
  viewer.useDefaultRenderLoop = false;

  // Apply CSS class — components that render spectator crowds and clouds
  // can use `.globeride-ar-mode` as a selector to hide themselves.
  document.documentElement.classList.add(AR_SCENE_CLASS);
}

/**
 * Restore all Cesium visual settings to their pre-AR values.
 * Called on exitAR() and on the 'end' event from the XR session.
 */
function restoreViewerARState(viewer: CesiumType.Viewer, saved: ViewerARState): void {
  if (viewer.isDestroyed()) return;

  viewer.scene.backgroundColor = saved.backgroundColor;

  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = saved.skyAtmosphereShow;
  }
  if (viewer.scene.skyBox) {
    viewer.scene.skyBox.show = saved.skyBoxShow;
  }

  if (viewer.imageryLayers.length > 0) {
    viewer.imageryLayers.get(0).alpha = saved.imageryLayerAlpha;
  }

  viewer.resolutionScale      = saved.resolutionScale;
  viewer.useDefaultRenderLoop = true;

  // Reset frustum to standard perspective so the follow-cam renders
  // correctly after returning from AR.
  const frustum       = new Cesium.PerspectiveFrustum();
  frustum.fov         = Cesium.Math.toRadians(60);
  frustum.aspectRatio =
    viewer.scene.drawingBufferWidth /
    Math.max(viewer.scene.drawingBufferHeight, 1);
  frustum.near = 0.1;
  frustum.far  = 10_000_000.0;
  viewer.camera.frustum = frustum;
}
