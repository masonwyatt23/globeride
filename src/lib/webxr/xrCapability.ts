/**
 * xrCapability.ts WebXR capability detection.
 *
 * Safe on all browsers: returns false-false if navigator.xr is absent.
 * Caches the result after the first call so repeated queries are free.
 */

export interface XRCapability {
  vrSupported: boolean;
  arSupported: boolean;
  /**
   * Phase 4: articulated hand tracking. True when the runtime exposes the
   * WebXR Hand Input API (XRHand on the input-source prototype). Note that
   * `'hand-tracking'` is requested as an *optional* feature on a per-session
   * basis — even when this is true the user/runtime may still deny it. The
   * authoritative check is `'hand' in source` inside an active session.
   */
  handTracking: boolean;
  /** Human-readable reason for false results, useful for debug logging. */
  reason?: string;
}

let _cached: XRCapability | null = null;

/**
 * Detect WebXR session support for immersive-vr and immersive-ar.
 *
 * Safe to call on Safari/iOS (returns false-false; no errors thrown).
 * Result is module-cached after the first resolved call.
 */
export async function detectXR(): Promise<XRCapability> {
  if (_cached !== null) return _cached;

  // navigator.xr is undefined on non-XR browsers (Safari, Firefox stable, etc.)
  if (typeof navigator === 'undefined' || !navigator.xr) {
    _cached = {
      vrSupported: false,
      arSupported: false,
      handTracking: false,
      reason: 'navigator.xr unavailable',
    };
    return _cached;
  }

  try {
    const xr = navigator.xr as XRSystem;
    // Check both session types; let errors propagate to the outer catch so we
    // can surface a meaningful `reason` rather than silently returning false.
    const [vrSupported, arSupported] = await Promise.all([
      xr.isSessionSupported('immersive-vr'),
      xr.isSessionSupported('immersive-ar'),
    ]);

    _cached = { vrSupported, arSupported, handTracking: detectHandTracking() };
    return _cached;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    _cached = { vrSupported: false, arSupported: false, handTracking: false, reason };
    return _cached;
  }
}

/**
 * Probe for WebXR Hand Input API availability without starting a session.
 *
 * The spec has no `navigator.xr.supportsFeature('hand-tracking')` call yet —
 * the accepted feature-check is prototype presence: when a runtime supports
 * hand input it exposes `XRHand` on the global, and (post-session) `hand` on
 * `XRInputSource`. We probe the global because it's the only signal available
 * before a session starts. Returns false in jsdom and on Vision Pro Safari
 * (which exposes pinch via `'transient-pointer'` instead).
 *
 * Spec: https://www.w3.org/TR/webxr-hand-input-1/#xrhand-interface
 */
function detectHandTracking(): boolean {
  if (typeof globalThis === 'undefined') return false;
  // Tests can override by setting (globalThis as any).XRHand = undefined.
  return typeof (globalThis as { XRHand?: unknown }).XRHand !== 'undefined';
}

/**
 * Reset the module-level cache. Only used in tests.
 * @internal
 */
export function _resetXRCache(): void {
  _cached = null;
}
