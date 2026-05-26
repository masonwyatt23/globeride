/**
 * Minimal WebXR ambient type declarations — Wave 33.A / Phase 2 extended.
 *
 * TypeScript 5.x / lib.dom.d.ts does not yet include WebXR Device API types.
 * This file provides the subset of the WebXR spec we actually reference so
 * the compiler is satisfied without installing a full @types/webxr package.
 *
 * Phase 2 additions: XRWebGLLayer, XRViewport, XRRenderState,
 * XRWebGLRenderingContext union, and session.updateRenderState().
 *
 * Source: https://www.w3.org/TR/webxr/
 *         https://www.w3.org/TR/webxr/#xrwebgllayer-interface
 */

type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: { root: Element };
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

interface XRSession extends EventTarget {
  requestAnimationFrame(callback: XRFrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
  /** Phase 2: bind the XRWebGLLayer (or other layer) to the session. */
  updateRenderState(state: XRRenderState): Promise<void>;
  end(): Promise<void>;
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

// Augment Navigator to include the xr property.
interface Navigator {
  readonly xr?: XRSystem;
}
