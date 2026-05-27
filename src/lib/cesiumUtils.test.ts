/**
 * cesiumUtils.test.ts — Wave 45.B unit tests.
 *
 * Covers the asset-3812 removal: verifies that setupBaseImagery only ever
 * requests ion asset 2 (Bing Aerial with Labels) and never falls back to
 * asset 3812 (which 404s for most tokens and triggers Cesium's E1 error).
 *
 * All tests run in the node vitest environment — no Cesium / browser APIs.
 * Cesium is mocked so we can assert which asset IDs are requested.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal Cesium mock — only the surface touched by setupBaseImagery.
// ---------------------------------------------------------------------------

const mockLayer = {};

const mockImaginaryLayers = {
  add: vi.fn(),
};

const mockScene = {
  imageryLayers: mockImaginaryLayers,
};

const mockViewer = {
  isDestroyed: vi.fn(() => false),
  scene: mockScene,
};

// Track which asset IDs IonImageryProvider.fromAssetId was called with.
const ionAssetIdCalls: number[] = [];

vi.mock('cesium', () => ({
  IonImageryProvider: {
    fromAssetId: vi.fn(async (assetId: number) => {
      ionAssetIdCalls.push(assetId);
      return {}; // resolved provider stub
    }),
  },
  ImageryLayer: vi.fn(() => mockLayer),
}));

// ---------------------------------------------------------------------------
// Import after mock is set up.
// ---------------------------------------------------------------------------

import { setupBaseImagery } from '@/lib/cesiumUtils';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupBaseImagery', () => {
  beforeEach(() => {
    ionAssetIdCalls.length = 0;
    mockImaginaryLayers.add.mockClear();
    mockViewer.isDestroyed.mockReturnValue(false);
    // Reset the WeakSet-based idempotency guard by using a fresh viewer object
    // each test via the cast below.
  });

  it('requests only ion asset 2 — never asset 3812', async () => {
    const freshViewer = {
      ...mockViewer,
      scene: { imageryLayers: { add: vi.fn() } },
    } as unknown as import('cesium').Viewer;

    await setupBaseImagery(freshViewer);

    expect(ionAssetIdCalls).toEqual([2]);
    expect(ionAssetIdCalls).not.toContain(3812);
  });

  it('adds exactly one imagery layer on success', async () => {
    const addSpy = vi.fn();
    const freshViewer = {
      isDestroyed: vi.fn(() => false),
      scene: { imageryLayers: { add: addSpy } },
    } as unknown as import('cesium').Viewer;

    await setupBaseImagery(freshViewer);

    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — second call for the same viewer is a no-op', async () => {
    const addSpy = vi.fn();
    const freshViewer = {
      isDestroyed: vi.fn(() => false),
      scene: { imageryLayers: { add: addSpy } },
    } as unknown as import('cesium').Viewer;

    await setupBaseImagery(freshViewer);
    await setupBaseImagery(freshViewer);

    // Layer should only be added once.
    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it('does not throw when ion asset 2 is unavailable', async () => {
    const { IonImageryProvider } = await import('cesium');
    vi.mocked(IonImageryProvider.fromAssetId).mockRejectedValueOnce(
      new Error('404 Not Found'),
    );

    const freshViewer = {
      isDestroyed: vi.fn(() => false),
      scene: { imageryLayers: { add: vi.fn() } },
    } as unknown as import('cesium').Viewer;

    // Must not throw — graceful degradation.
    await expect(setupBaseImagery(freshViewer)).resolves.toBeUndefined();
  });

  it('does not request asset 3812 as a fallback when asset 2 fails', async () => {
    const { IonImageryProvider } = await import('cesium');
    vi.mocked(IonImageryProvider.fromAssetId).mockRejectedValueOnce(
      new Error('404 Not Found'),
    );

    const callsBefore = ionAssetIdCalls.length;

    const freshViewer = {
      isDestroyed: vi.fn(() => false),
      scene: { imageryLayers: { add: vi.fn() } },
    } as unknown as import('cesium').Viewer;

    await setupBaseImagery(freshViewer);

    // Whatever calls were made after the rejection, none should be for 3812.
    const newCalls = ionAssetIdCalls.slice(callsBefore);
    expect(newCalls).not.toContain(3812);
  });
});
