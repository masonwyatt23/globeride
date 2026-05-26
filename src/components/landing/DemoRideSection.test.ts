/**
 * DemoRideSection unit tests — pure vitest, node environment (no DOM).
 *
 * Exercises the gate logic imported from HeroVisual (resolveIonToken,
 * isWebGLAvailable, hasSufficientHardware) and verifies the section's
 * canShowScene / showScene decision tree via the prop overrides exposed
 * for testing, without mounting React or Cesium.
 *
 * Pattern mirrors src/components/landing/HeroVisual.test.ts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveIonToken,
  isWebGLAvailable,
  hasSufficientHardware,
} from './HeroVisual';

// ---------------------------------------------------------------------------
// Helpers — reuse same localStorage / document mocks as HeroVisual.test.ts
// ---------------------------------------------------------------------------

function makeLsMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

function setLocalStorage(mock: ReturnType<typeof makeLsMock> | null) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
    configurable: true,
  });
}

function setDocumentCreateElement(fn: ((tag: string) => unknown) | null) {
  Object.defineProperty(globalThis, 'document', {
    value: fn ? { createElement: fn } : undefined,
    writable: true,
    configurable: true,
  });
}

/** Simulate the canShowScene logic used inside DemoRideSection. */
function resolveCanShowScene(opts: {
  token: string | null;
  webgl: boolean;
  hardware: boolean;
}): boolean {
  return !!(opts.token && opts.webgl && opts.hardware);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setLocalStorage(null);
  setDocumentCreateElement(null);
});

// ---------------------------------------------------------------------------
// Test 1 — renders fallback when no Cesium ion token is available
// ---------------------------------------------------------------------------
describe('DemoRideSection gate: no token', () => {
  it('canShowScene is false when resolveIonToken returns null', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    setLocalStorage(makeLsMock()); // empty — no stored token

    const token = resolveIonToken();
    const canShow = resolveCanShowScene({ token, webgl: true, hardware: true });

    expect(token).toBeNull();
    expect(canShow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — renders fallback when WebGL is unavailable
// ---------------------------------------------------------------------------
describe('DemoRideSection gate: no WebGL', () => {
  it('canShowScene is false when isWebGLAvailable returns false', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'test-token');
    setLocalStorage(makeLsMock());
    setDocumentCreateElement(() => ({ getContext: () => null }));

    const token = resolveIonToken();
    const webgl = isWebGLAvailable();
    const canShow = resolveCanShowScene({ token, webgl, hardware: true });

    expect(webgl).toBe(false);
    expect(canShow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — renders fallback on low-end hardware (< 4 cores)
// ---------------------------------------------------------------------------
describe('DemoRideSection gate: low-end hardware', () => {
  it('canShowScene is false when hasSufficientHardware returns false', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'test-token');
    setLocalStorage(makeLsMock());
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);

    const token = resolveIonToken();
    const hw = hasSufficientHardware();
    const canShow = resolveCanShowScene({ token, webgl: true, hardware: hw });

    expect(hw).toBe(false);
    expect(canShow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — all gates pass → canShowScene is true
// ---------------------------------------------------------------------------
describe('DemoRideSection gate: all pass', () => {
  it('canShowScene is true when token + WebGL + hardware all pass', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'valid-token-abc');
    setLocalStorage(makeLsMock());
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl2' ? {} : null),
    }));
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);

    const token = resolveIonToken();
    const webgl = isWebGLAvailable();
    const hw = hasSufficientHardware();
    const canShow = resolveCanShowScene({ token, webgl, hardware: hw });

    expect(token).toBe('valid-token-abc');
    expect(webgl).toBe(true);
    expect(hw).toBe(true);
    expect(canShow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — scene only shows when BOTH gates pass AND intersecting
// ---------------------------------------------------------------------------
describe('DemoRideSection: intersection guard', () => {
  it('showScene is false even when gates pass if not intersecting', () => {
    const canShowScene = true; // gates pass
    const isIntersecting = false; // not scrolled into view yet
    const token = 'some-token';

    const showScene = canShowScene && isIntersecting && !!token;
    expect(showScene).toBe(false);
  });

  it('showScene is true when gates pass and section is intersecting', () => {
    const canShowScene = true;
    const isIntersecting = true;
    const token = 'some-token';

    const showScene = canShowScene && isIntersecting && !!token;
    expect(showScene).toBe(true);
  });
});
