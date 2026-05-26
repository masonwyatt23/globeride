/**
 * Minimal WebXR ambient type declarations — Wave 33.A / Phase 2 / Phase 3.
 *
 * TypeScript 5.x / lib.dom.d.ts does not yet include WebXR Device API types.
 * This file provides the subset of the WebXR spec we actually reference so
 * the compiler is satisfied without installing a full @types/webxr package.
 *
 * Phase 2 additions: XRWebGLLayer, XRViewport, XRRenderState,
 * XRWebGLRenderingContext union, and session.updateRenderState().
 *
 * Phase 3 additions (Wave 35.C):
 *   - XRHandedness: input source hand identifier.
 *   - XRInputSource: controller / hand-tracking input source.
 *   - XRDOMOverlayState: compositor overlay state reported after session creation.
 *   - XRSession.domOverlayState: per-session DOM overlay state.
 *   - XRSession.inputSources: live list of connected input sources.
 *   - XRSessionInit.domOverlay tightened to HTMLElement (was Element).
 *   - XRViewerPose.transform: viewer-level pose transform.
 *
 * Source: https://www.w3.org/TR/webxr/
 *         https://www.w3.org/TR/webxr/#xrwebgllayer-interface
 *         https://immersive-web.github.io/dom-overlays/
 *         https://immersive-web.github.io/webxr-gamepads-module/
 */

type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  /**
   * Phase 3: DOM overlay root element. The compositor renders this DOM subtree
   * directly into the XR frame when the \'dom-overlay\' optional feature is
   * granted. Must be an HTMLElement in the live document.
   *
   * Spec: https://immersive-web.github.io/dom-overlays/#dom-xrsessioninit-domoverlay
   */
  domOverlay?: { root: HTMLElement };
}

interface XRSystem {
  isSessionSupported(mode: XRSessionMode): Promise<boolean>;
  requestSession(mode: XRSessionMode, options?: XRSessionInit): Promise<XRSession>;
}

// ---------------------------------------------------------------------------
// Phase 2: render state — used to bind XRWebGLLayer to the session.
// ---------------------------------------------------------------------------

interface XRRenderState {
  baseLayer?: XRWebGLLayer;
  depthFar?: number;
  depthNear?: number;
  inlineVerticalFieldOfView?: number;
}


// ---------------------------------------------------------------------------
// Phase 3: input sources — controllers and hand tracking. (Wave 35.C)
// https://www.w3.org/TR/webxr/#xrinputsource-interface
// ---------------------------------------------------------------------------

/**
 * Which physical hand (or no hand) an input source is associated with.
 * 'none' covers gaze-based / non-handed controllers.
 */
type XRHandedness = 'left' | 'right' | 'none';

/** Opaque reference space used to locate input sources. */
type XRSpace = EventTarget;

/**
 * A single input source (controller, hand, or gaze) connected to the XR
 * session. The `gamepad` field exposes button / axis state in the standard
 * Gamepad API format (same as navigator.getGamepads(), but XR-bound).
 */
interface XRInputSource {
  /** Which hand this source is associated with, or 'none'. */
  readonly handedness: XRHandedness;
  /**
   * Reference space anchored to the grip pose (physical controller handle).
   * null if the source does not have a physical grip (e.g. gaze).
   */
  readonly gripSpace: XRSpace | null;
  /**
   * Reference space for the targeting ray origin (tip of pointer / gaze ray).
   * Always present.
   */
  readonly targetRaySpace: XRSpace;
  /**
   * Standard Gamepad API object for button / axis state. null for sources
   * that don't have a gamepad (some hand-tracking implementations).
   */
  readonly gamepad: Gamepad | null;
  /** 'gaze' | 'tracked-pointer' | 'screen' | 'transient-pointer'. */
  readonly targetRayMode: string;
}

// ---------------------------------------------------------------------------
// Phase 3: DOM overlay state — reported after session creation. (Wave 35.C)
// https://immersive-web.github.io/dom-overlays/#xrdomoverlaystate
// ---------------------------------------------------------------------------

/**
 * Describes how the compositor is displaying the DOM overlay root element:
 *   'screen'      — flat 2D render (desktop emulation / browser window).
 *   'floating'    — free-floating panel in space (some headsets).
 *   'head-locked' — fixed to the headset view (Quest / most VR headsets).
 */
interface XRDOMOverlayState {
  readonly type: 'screen' | 'floating' | 'head-locked';
}

interface XRSession extends EventTarget {
  requestAnimationFrame(callback: XRFrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
  /** Phase 2: bind the XRWebGLLayer (or other layer) to the session. */
  updateRenderState(state: XRRenderState): Promise<void>;
  end(): Promise<void>;

  /**
   * Phase 3: live read-only list of currently connected input sources
   * (controllers, hands, gaze). Updated by the runtime; not a snapshot.
   */
  readonly inputSources: ReadonlyArray<XRInputSource>;

  /**
   * Phase 3: present only when 'dom-overlay' was granted as an optional
   * feature. Describes how the compositor is displaying the overlay root.
   * Undefined if dom-overlay was not enabled for this session.
   *
   * Spec: https://immersive-web.github.io/dom-overlays/#dom-xrsession-domoverlaystate
   */
  readonly domOverlayState?: XRDOMOverlayState;

  /**
   * Wave 35.D: how the XR compositor blends the rendered output with the real
   * world. 'opaque' for VR; 'alpha-blend' for video-passthrough AR (Quest 3,
   * Vision Pro); 'additive' for optical AR (HoloLens).
   * Undefined on browsers that predate the AR module spec.
   */
  readonly environmentBlendMode?: XREnvironmentBlendMode;
}

type XRFrameRequestCallback = (time: number, frame: XRFrame) => void;

type XRReferenceSpaceType =
  | 'viewer'
  | 'local'
  | 'local-floor'
  | 'bounded-floor'
  | 'unbounded';

type XRReferenceSpace = EventTarget;

interface XRFrame {
  readonly session: XRSession;
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | null;
}

interface XRViewerPose {
  readonly views: ReadonlyArray<XRView>;
  /** Phase 3: the viewer's pose transform (position + orientation) in reference space. */
  readonly transform: XRRigidTransform;
}

interface XRView {
  readonly eye: 'left' | 'right' | 'none';
  /** Column-major 4×4 projection matrix supplied by the XR runtime. */
  readonly projectionMatrix: Float32Array;
  /** Pose of this eye in reference-space coordinates. */
  readonly transform: XRRigidTransform;
}

interface XRRigidTransform {
  readonly position: DOMPointReadOnly;
  readonly orientation: DOMPointReadOnly;
  /** Column-major 4×4 rigid-body transform matrix. */
  readonly matrix: Float32Array;
  readonly inverse: XRRigidTransform;
}

// ---------------------------------------------------------------------------
// Phase 2: XRWebGLLayer — bridge between the WebGL context and XR compositor.
// https://www.w3.org/TR/webxr/#xrwebgllayer-interface
// ---------------------------------------------------------------------------

/**
 * WebGL rendering context types accepted by XRWebGLLayer.
 * Cesium always creates a WebGL2 context, so WebGL2RenderingContext is the
 * relevant branch in practice.
 */
type XRWebGLRenderingContext = WebGLRenderingContext | WebGL2RenderingContext;

interface XRWebGLLayerInit {
  antialias?: boolean;
  depth?: boolean;
  stencil?: boolean;
  alpha?: boolean;
  ignoreDepthValues?: boolean;
  framebufferScaleFactor?: number;
}

/**
 * XRWebGLLayer — wraps a WebGL framebuffer for delivery to the XR compositor.
 * The constructor signals to the WebGL context that it will be used for XR
 * rendering; the context must have been created with { xrCompatible: true }.
 */
declare class XRWebGLLayer {
  constructor(
    session: XRSession,
    context: XRWebGLRenderingContext,
    layerInit?: XRWebGLLayerInit,
  );
  /** Compositor-owned framebuffer — bind before issuing draw calls for XR. */
  readonly framebuffer: WebGLFramebuffer | null;
  readonly framebufferWidth: number;
  readonly framebufferHeight: number;
  readonly antialias: boolean;
  readonly ignoreDepthValues: boolean;
  /**
   * Returns the sub-rectangle of the XR framebuffer that corresponds to the
   * given view (left eye, right eye, etc.). Set gl.viewport() to this rect
   * before rendering each eye.
   */
  getViewport(view: XRView): XRViewport;
}

/** Pixel-space viewport rectangle inside the XRWebGLLayer framebuffer. */
interface XRViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Wave 35.D: AR environment blend mode
// https://www.w3.org/TR/webxr-ar-module/#xrenvironmentblendmode-enum
// ---------------------------------------------------------------------------

/**
 * How the XR compositor blends the rendered output with the real world:
 *   - 'opaque'      — fully replaces the real world (standard VR headsets).
 *   - 'additive'    — adds rendered light on top of the real world (optical
 *                     AR, e.g. HoloLens). Black pixels are transparent.
 *   - 'alpha-blend' — blends via the rendered alpha channel (video-passthrough
 *                     AR, e.g. Quest 3, Vision Pro). TRANSPARENT pixels show
 *                     the camera feed through.
 */
type XREnvironmentBlendMode = 'opaque' | 'additive' | 'alpha-blend';

// Augment Navigator to include the xr property.
interface Navigator {
  readonly xr?: XRSystem;
}
