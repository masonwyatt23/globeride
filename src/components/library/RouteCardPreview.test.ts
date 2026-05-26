/**
 * RouteCardPreview unit tests — pure vitest, node environment (no DOM/React).
 *
 * We test the gating and scene-cap logic that lives in RouteCardPreview.tsx:
 *   - _tryClaimScene / _releaseScene (concurrent cap)
 *   - canRenderCesium gate function (from landingGates.ts)
 *   - resolveCesiumToken (from landingGates.ts)
 *
 * IntersectionObserver and React component rendering are NOT tested here —
 * those need jsdom. The pure logic surface is what matters for correctness.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Gate helpers — from landingGates.ts
// ---------------------------------------------------------------------------

import {
  resolveCesiumToken,
  isWebGLAvailable,
  hasSufficientHardware,
  canRenderCesium,
} from '@/lib/landingGates';

// ---------------------------------------------------------------------------
// Scene cap helpers — from RouteCardPreview.tsx
// (imported as value so _activeMountedScenes can be inspected)
// ---------------------------------------------------------------------------

import {
  _activeMountedScenes,
  _tryClaimScene,
  _releaseScene,
} from './RouteCardPreview';

// ---------------------------------------------------------------------------
// localStorage mock factory (node-compatible, same pattern as HeroVisual.test)
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

// ---------------------------------------------------------------------------
// 1. Concurrent scene cap
// ---------------------------------------------------------------------------

describe('concurrent scene cap', () => {
  beforeEach(() => {
    // Clear the shared set before each test so tests are independent.
    _activeMountedScenes.clear();
  });

  it('allows up to 5 concurrent scenes', () => {
    for (let i = 0; i < 5; i++) {
      expect(_tryClaimScene(`route-${i}`)).toBe(true);
    }
    expect(_activeMountedScenes.size).toBe(5);
  });

  it('rejects a 6th scene when 5 are mounted', () => {
    for (let i = 0; i < 5; i++) _tryClaimScene(`route-${i}`);
    expect(_tryClaimScene('route-6')).toBe(false);
    expect(_activeMountedScenes.size).toBe(5);
  });

  it('allows a new scene after one is released', () => {
    for (let i = 0; i < 5; i++) _tryClaimScene(`route-${i}`);
    _releaseScene('route-0');
    expect(_tryClaimScene('route-new')).toBe(true);
    expect(_activeMountedScenes.size).toBe(5);
  });

  it('is idempotent — re-claiming the same route id does not exceed the cap', () => {
    _tryClaimScene('route-A');
    _tryClaimScene('route-A'); // second claim of same id
    expect(_activeMountedScenes.size).toBe(1);
  });

  it('_releaseScene is a no-op for an unknown id', () => {
    _tryClaimScene('route-B');
    _releaseScene('route-unknown'); // should not throw
    expect(_activeMountedScenes.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveCesiumToken
// ---------------------------------------------------------------------------

describe('resolveCesiumToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    setLocalStorage(null);
  });

  it('returns the env-var token when VITE_CESIUM_ION_TOKEN is set', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'env-token-abc');
    setLocalStorage(makeLsMock());
    expect(resolveCesiumToken()).toBe('env-token-abc');
  });

  it('falls back to localStorage when env var is absent', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    const ls = makeLsMock();
    ls.setItem('globeride.cesiumIonToken', 'stored-token-xyz');
    setLocalStorage(ls);
    expect(resolveCesiumToken()).toBe('stored-token-xyz');
  });

  it('returns null when neither env var nor localStorage has a token', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    setLocalStorage(makeLsMock());
    expect(resolveCesiumToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. isWebGLAvailable
// ---------------------------------------------------------------------------

describe('isWebGLAvailable', () => {
  afterEach(() => {
    setDocumentCreateElement(null);
  });

  it('returns true when webgl2 context is available', () => {
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl2' ? {} : null),
    }));
    expect(isWebGLAvailable()).toBe(true);
  });

  it('returns false when neither webgl2 nor webgl context is available', () => {
    setDocumentCreateElement(() => ({ getContext: () => null }));
    expect(isWebGLAvailable()).toBe(false);
  });

  it('returns false when document is unavailable (throws)', () => {
    setDocumentCreateElement(() => { throw new Error('no DOM'); });
    expect(isWebGLAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. hasSufficientHardware
// ---------------------------------------------------------------------------

describe('hasSufficientHardware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when hardwareConcurrency is 4', () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(4);
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

// ---------------------------------------------------------------------------
// 5. canRenderCesium — combined gate
// ---------------------------------------------------------------------------

describe('canRenderCesium', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setDocumentCreateElement(null);
  });

  it('returns true when WebGL is available and hardware is sufficient', () => {
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl2' ? {} : null),
    }));
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    expect(canRenderCesium()).toBe(true);
  });

  it('returns false when WebGL is unavailable even if hardware is sufficient', () => {
    setDocumentCreateElement(() => ({ getContext: () => null }));
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    expect(canRenderCesium()).toBe(false);
  });

  it('returns false on low-end device (hardwareConcurrency < 4) even with WebGL', () => {
    setDocumentCreateElement(() => ({
      getContext: (type: string) => (type === 'webgl2' ? {} : null),
    }));
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
    expect(canRenderCesium()).toBe(false);
  });
});
