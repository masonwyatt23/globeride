/**
 * cesiumHDR.test.ts — unit tests for the HDR/tonemapping decision helpers.
 *
 * Uses a minimal mock Cesium viewer — no GPU context required.
 * Runs in the Node vitest environment (vitest.config.ts: environment: 'node').
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Tonemapper } from 'cesium';
import { shouldEnableHDR, tryEnableHDR, disableHDR } from './cesiumHDR';

// ---------------------------------------------------------------------------
// Helpers — build a fake HdrViewer
// ---------------------------------------------------------------------------

function makeViewer(destroyed = false) {
  const viewer = {
    _destroyed: destroyed,
    isDestroyed() {
      return this._destroyed;
    },
    scene: {
      highDynamicRange: false,
      postProcessStages: {
        tonemapper: undefined as Tonemapper | undefined,
      },
    },
  };
  return viewer;
}

// ---------------------------------------------------------------------------
// shouldEnableHDR — decision matrix
// ---------------------------------------------------------------------------

describe('shouldEnableHDR', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when hardwareConcurrency < 4', () => {
    // Simulate a 2-core device (proxy for weak GPU).
    vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
    // Even if WebGL2 exists, cores gate should bail early.
    expect(shouldEnableHDR()).toBe(false);
  });

  it('returns false when WebGL2 is unavailable', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    // Stub document.createElement so canvas.getContext('webgl2') returns null.
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: (_: string) => null,
      }),
    });
    expect(shouldEnableHDR()).toBe(false);
  });

  it('returns true when cores >= 4 and WebGL2 is available', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    // Stub a WebGL2 context that succeeds.
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: (type: string) => (type === 'webgl2' ? {} : null),
      }),
    });
    expect(shouldEnableHDR()).toBe(true);
  });

  it('returns false in SSR/test environments where document is undefined', () => {
    vi.stubGlobal('document', undefined);
    expect(shouldEnableHDR()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tryEnableHDR
// ---------------------------------------------------------------------------

describe('tryEnableHDR', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false and does nothing when viewer is destroyed', () => {
    const viewer = makeViewer(true);
    const result = tryEnableHDR(viewer);
    expect(result).toBe(false);
    expect(viewer.scene.highDynamicRange).toBe(false);
  });

  it('returns false when shouldEnableHDR() is false (low cores)', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
    const viewer = makeViewer(false);
    const result = tryEnableHDR(viewer);
    expect(result).toBe(false);
    expect(viewer.scene.highDynamicRange).toBe(false);
  });

  it('returns true and sets highDynamicRange when platform is capable', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: (type: string) => (type === 'webgl2' ? {} : null),
      }),
    });
    const viewer = makeViewer(false);
    const result = tryEnableHDR(viewer);
    expect(result).toBe(true);
    expect(viewer.scene.highDynamicRange).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// disableHDR
// ---------------------------------------------------------------------------

describe('disableHDR', () => {
  it('resets highDynamicRange to false on a live viewer', () => {
    const viewer = makeViewer(false);
    viewer.scene.highDynamicRange = true;
    disableHDR(viewer);
    expect(viewer.scene.highDynamicRange).toBe(false);
  });

  it('is a no-op when viewer is destroyed', () => {
    const viewer = makeViewer(true);
    // Should not throw.
    expect(() => disableHDR(viewer)).not.toThrow();
  });
});
