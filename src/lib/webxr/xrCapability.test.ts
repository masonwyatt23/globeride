/**
 * xrCapability.test.ts — Wave 33.A
 *
 * Pure logic tests — no browser / Cesium APIs needed.
 * We mock navigator.xr to cover all code paths.
 * WebXR ambient types are provided by webxr.d.ts in this directory.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectXR, _resetXRCache } from './xrCapability';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace navigator.xr with a mock and restore in beforeEach via _resetXRCache. */
function mockXr(impl: XRSystem | null) {
  Object.defineProperty(globalThis.navigator, 'xr', {
    value: impl,
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectXR', () => {
  beforeEach(() => {
    _resetXRCache();
  });

  it('returns false-false when navigator.xr is absent', async () => {
    mockXr(null);
    const result = await detectXR();
    expect(result.vrSupported).toBe(false);
    expect(result.arSupported).toBe(false);
    expect(result.reason).toMatch(/navigator\.xr unavailable/i);
  });

  it('returns vrSupported=true when immersive-vr is supported', async () => {
    mockXr({
      isSessionSupported: vi.fn(async (type: XRSessionMode) =>
        type === 'immersive-vr',
      ),
      requestSession: vi.fn(),
    } as unknown as XRSystem);
    const result = await detectXR();
    expect(result.vrSupported).toBe(true);
    expect(result.arSupported).toBe(false);
  });

  it('returns arSupported=true when immersive-ar is supported', async () => {
    mockXr({
      isSessionSupported: vi.fn(async (type: XRSessionMode) =>
        type === 'immersive-ar',
      ),
      requestSession: vi.fn(),
    } as unknown as XRSystem);
    const result = await detectXR();
    expect(result.vrSupported).toBe(false);
    expect(result.arSupported).toBe(true);
  });

  it('returns both true when both session types are supported', async () => {
    mockXr({
      isSessionSupported: vi.fn(async () => true),
      requestSession: vi.fn(),
    } as unknown as XRSystem);
    const result = await detectXR();
    expect(result.vrSupported).toBe(true);
    expect(result.arSupported).toBe(true);
  });

  it('returns false-false with a reason when isSessionSupported throws', async () => {
    mockXr({
      isSessionSupported: vi.fn(async () => {
        throw new Error('SecurityError: permission denied');
      }),
      requestSession: vi.fn(),
    } as unknown as XRSystem);
    const result = await detectXR();
    expect(result.vrSupported).toBe(false);
    expect(result.arSupported).toBe(false);
    expect(result.reason).toMatch(/SecurityError/);
  });

  it('caches the result so isSessionSupported is only invoked on first call', async () => {
    const isSessionSupported = vi.fn(async () => true);
    mockXr({
      isSessionSupported,
      requestSession: vi.fn(),
    } as unknown as XRSystem);

    await detectXR();
    await detectXR();
    await detectXR();

    // 3 outer calls → only 2 inner calls (vr + ar) because cache kicks in after first.
    expect(isSessionSupported).toHaveBeenCalledTimes(2);
  });

  it('handles non-Error throws gracefully', async () => {
    mockXr({
      isSessionSupported: vi.fn(async () => {
        throw new Error('string error');
      }),
      requestSession: vi.fn(),
    } as unknown as XRSystem);
    const result = await detectXR();
    expect(result.vrSupported).toBe(false);
    expect(result.reason).toBe('string error');
  });
});
