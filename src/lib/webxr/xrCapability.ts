/**
 * xrCapability.ts — Wave 33.A WebXR capability detection.
 *
 * Safe on all browsers: returns false-false if navigator.xr is absent.
 * Caches the result after the first call so repeated queries are free.
 */

export interface XRCapability {
  vrSupported: boolean;
  arSupported: boolean;
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
    _cached = { vrSupported: false, arSupported: false, reason: 'navigator.xr unavailable' };
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

    _cached = { vrSupported, arSupported };
    return _cached;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    _cached = { vrSupported: false, arSupported: false, reason };
    return _cached;
  }
}

/**
 * Reset the module-level cache. Only used in tests.
 * @internal
 */
export function _resetXRCache(): void {
  _cached = null;
}
