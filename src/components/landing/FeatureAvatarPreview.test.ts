/**
 * FeatureAvatarPreview unit tests — pure vitest, node environment (no DOM).
 *
 * Exercises the gate logic that FeatureAvatarPreview uses to decide whether to
 * mount a live Cesium avatar scene or fall back to the static SVG.
 * The three gates are: ion token present · WebGL available · hasSufficientHardware.
 *
 * Pattern mirrors DemoRideSection.test.ts — no React, no Cesium, no DOM.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveCesiumToken,
  isWebGLAvailable,
  hasSufficientHardware,
} from '@/lib/landingGates';

// ---------------------------------------------------------------------------
// Helpers
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

/** Mirrors FeatureAvatarPreview's canShow logic. */
function resolveCanShow(opts: {
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
// Test 1 — no token → SVG fallback
// ---------------------------------------------------------------------------
describe('FeatureAvatarPreview gate: no token', () => {
  it('canShow is false when resolveCesiumToken returns null', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    setLocalStorage(makeLsMock());

    const token = resolveCesiumToken();
    const canShow = resolveCanShow({ token, webgl: true, hardware: true });

    expect(token).toBeNull();
    expect(canShow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — no WebGL → SVG fallback
// ---------------------------------------------------------------------------
describe('FeatureAvatarPreview gate: no WebGL', () => {
  it('canShow is false when isWebGLAvailable returns false', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'tok');
    setLocalStorage(makeLsMock());
    setDocumentCreateElement(() => ({ getContext: () => null }));

    const token = resolveCesiumToken();
    const webgl = isWebGLAvailable();
    const canShow = resolveCanShow({ token, webgl, hardware: true });

    expect(webgl).toBe(false);
    expect(canShow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — low-end hardware (< 4 cores) → SVG fallback
// ---------------------------------------------------------------------------
describe('FeatureAvatarPreview gate: low-end hardware', () => {
  it('canShow is false when hardwareConcurrency < 4', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'tok');
    setLocalStorage(makeLsMock());
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl2' ? {} : null),
    }));
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);

    const token = resolveCesiumToken();
    const webgl = isWebGLAvailable();
    const hw = hasSufficientHardware();
    const canShow = resolveCanShow({ token, webgl, hardware: hw });

    expect(hw).toBe(false);
    expect(canShow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — all gates pass → canShow true
// ---------------------------------------------------------------------------
describe('FeatureAvatarPreview gate: all pass', () => {
  it('canShow is true when token + WebGL + hardware all pass', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'valid-token');
    setLocalStorage(makeLsMock());
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl2' ? {} : null),
    }));
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);

    const token = resolveCesiumToken();
    const webgl = isWebGLAvailable();
    const hw = hasSufficientHardware();
    const canShow = resolveCanShow({ token, webgl, hardware: hw });

    expect(token).toBe('valid-token');
    expect(webgl).toBe(true);
    expect(hw).toBe(true);
    expect(canShow).toBe(true);
  });
});
