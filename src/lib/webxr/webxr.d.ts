/**
 * Minimal WebXR ambient type declarations — Wave 33.A.
 *
 * TypeScript 5.x / lib.dom.d.ts does not yet include WebXR Device API types.
 * This file provides the subset of the WebXR spec we actually reference so
 * the compiler is satisfied without installing a full @types/webxr package.
 *
 * Source: https://www.w3.org/TR/webxr/
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

interface XRSession extends EventTarget {
  requestAnimationFrame(callback: XRFrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
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
  readonly projectionMatrix: Float32Array;
  readonly transform: XRRigidTransform;
}

interface XRRigidTransform {
  readonly position: DOMPointReadOnly;
  readonly orientation: DOMPointReadOnly;
  readonly matrix: Float32Array;
  readonly inverse: XRRigidTransform;
}

// Augment Navigator to include the xr property.
interface Navigator {
  readonly xr?: XRSystem;
}
