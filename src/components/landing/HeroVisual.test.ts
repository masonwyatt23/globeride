/**
 * HeroVisual unit tests — pure vitest, node environment (no DOM).
 *
 * Tests the three exported helper functions that gate the Cesium globe:
 *   - resolveIonToken()
 *   - isWebGLAvailable()
 *   - hasSufficientHardware()
 *
 * localStorage is mocked via Object.defineProperty(globalThis, ...) — same
 * pattern used by src/lib/strava.test.ts in this repo.
 * document.createElement is mocked via Object.defineProperty(globalThis, ...)
 * since there is no DOM in the node test environment.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveIonToken, isWebGLAvailable, hasSufficientHardware } from './HeroVisual';

// ---------------------------------------------------------------------------
// localStorage mock factory (node-compatible)
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

// ---------------------------------------------------------------------------
// resolveIonToken
// ---------------------------------------------------------------------------

describe('resolveIonToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    setLocalStorage(null);
  });

  it('returns the env-var token when VITE_CESIUM_ION_TOKEN is set', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'env-token-abc');
    setLocalStorage(makeLsMock());
    expect(resolveIonToken()).toBe('env-token-abc');
  });

  it('trims whitespace from the env-var token', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '  trimmed  ');
    setLocalStorage(makeLsMock());
    expect(resolveIonToken()).toBe('trimmed');
  });

  it('falls back to localStorage when env var is absent', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    const ls = makeLsMock();
    ls.setItem('globeride.cesiumIonToken', 'stored-token-xyz');
    setLocalStorage(ls);
    expect(resolveIonToken()).toBe('stored-token-xyz');
  });

  it('returns null when neither env var nor localStorage has a token', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    setLocalStorage(makeLsMock());
    expect(resolveIonToken()).toBeNull();
  });

  it('returns null when localStorage has only whitespace', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    const ls = makeLsMock();
    ls.setItem('globeride.cesiumIonToken', '   ');
    setLocalStorage(ls);
    expect(resolveIonToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isWebGLAvailable — mock document.createElement in node env
// ---------------------------------------------------------------------------

function setDocumentCreateElement(fn: ((tag: string) => unknown) | null) {
  Object.defineProperty(globalThis, 'document', {
    value: fn ? { createElement: fn } : undefined,
    writable: true,
    configurable: true,
  });
}

describe('isWebGLAvailable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset document to undefined so other tests aren't affected.
    setDocumentCreateElement(null);
  });

  it('returns true when webgl2 context is available', () => {
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl2' ? {} : null),
    }));
    expect(isWebGLAvailable()).toBe(true);
  });

  it('returns true when only webgl (v1) context is available', () => {
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl' ? {} : null),
    }));
    expect(isWebGLAvailable()).toBe(true);
  });

  it('returns false when neither webgl2 nor webgl context is available', () => {
    setDocumentCreateElement(() => ({ getContext: () => null }));
    expect(isWebGLAvailable()).toBe(false);
  });

  it('returns false when document is unavailable (throws)', () => {
    // Simulate an environment where document.createElement itself throws.
    setDocumentCreateElement(() => { throw new Error('no DOM'); });
    expect(isWebGLAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasSufficientHardware
// ---------------------------------------------------------------------------

describe('hasSufficientHardware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when hardwareConcurrency is 4', () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(4);
    expect(hasSufficientHardware()).toBe(true);
  });

  it('returns true when hardwareConcurrency is 8', () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    expect(hasSufficientHardware()).toBe(true);
  });

  it('returns false when hardwareConcurrency is 2', () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
    expect(hasSufficientHardware()).toBe(false);
  });

  it('returns true when hardwareConcurrency is 0 (unknown — assume capable)', () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(0);
    expect(hasSufficientHardware()).toBe(true);
  });
});
