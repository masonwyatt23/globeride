/**
 * cesiumUtils.test.ts — unit coverage for the token-aware Cesium helpers.
 *
 * Two concerns:
 *   1. `setupBaseImagery` chooses the right provider per branch:
 *        - with token: Bing Aerial (ion asset 2) — never asset 3812.
 *        - without token: OpenStreetMap raster tiles via the public CDN.
 *   2. `getTerrainProvider` degrades gracefully:
 *        - with token: Cesium World Terrain (createWorldTerrainAsync).
 *        - without token: flat EllipsoidTerrainProvider, no network call.
 *
 * Cesium is mocked so we can assert which constructors were invoked without
 * needing a WebGL context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Cesium surface — just the constructors / static methods touched by
// the helpers under test.
//
// vi.mock factories are hoisted, so they can't close over module-level
// variables. We use vi.hoisted to declare the shared state in the same
// hoisted phase as the mock factory itself.
// ---------------------------------------------------------------------------

const mockState = vi.hoisted(() => ({
  ionAssetIdCalls: [] as number[],
  osmConstructorCalls: [] as Array<{ url?: string; maximumLevel?: number }>,
  ellipsoidTerrainConstructorCalls: [] as unknown[],
  worldTerrainCalls: [] as number[],
  ionAccessor: { defaultAccessToken: '' },
}));

vi.mock('cesium', () => ({
  IonImageryProvider: {
    fromAssetId: vi.fn(async (assetId: number) => {
      mockState.ionAssetIdCalls.push(assetId);
      return {};
    }),
  },
  ImageryLayer: vi.fn(() => ({})),
  OpenStreetMapImageryProvider: vi.fn(function OSMP(this: unknown, opts: { url?: string; maximumLevel?: number }) {
    mockState.osmConstructorCalls.push(opts);
    Object.assign(this as object, { __osm: true });
  }),
  EllipsoidTerrainProvider: vi.fn(function ETP(this: unknown) {
    mockState.ellipsoidTerrainConstructorCalls.push({});
    Object.assign(this as object, { __ellipsoid: true });
  }),
  createWorldTerrainAsync: vi.fn(async () => {
    mockState.worldTerrainCalls.push(Date.now());
    return { __worldTerrain: true };
  }),
  Credit: vi.fn(function C(this: unknown, text: string) {
    Object.assign(this as object, { text });
  }),
  Cesium3DTileset: {
    fromIonAssetId: vi.fn(async (assetId: number) => ({ __tileset: true, assetId })),
  },
  Ion: mockState.ionAccessor,
}));

// Local aliases for readability in test bodies.
const ionAssetIdCalls = mockState.ionAssetIdCalls;
const osmConstructorCalls = mockState.osmConstructorCalls;
const ellipsoidTerrainConstructorCalls = mockState.ellipsoidTerrainConstructorCalls;
const worldTerrainCalls = mockState.worldTerrainCalls;
const ionAccessor = mockState.ionAccessor;

// ---------------------------------------------------------------------------
// Import after the mock is registered.
// ---------------------------------------------------------------------------

import {
  setupBaseImagery,
  setIonToken,
  hasIonToken,
  getTerrainProvider,
  getPhotorealTileset,
} from '@/lib/cesiumUtils';

// Each test creates a fresh fake viewer object so the WeakSet-based
// idempotency guard inside setupBaseImagery never sees the same key twice.

function makeViewer() {
  return {
    isDestroyed: vi.fn(() => false),
    scene: { imageryLayers: { add: vi.fn() } },
  } as unknown as import('cesium').Viewer;
}

describe('cesiumUtils — token-aware behaviour', () => {
  beforeEach(() => {
    // Force-clear the installed flag and invalidate the cached terrain
    // promise BEFORE we zero the counters so the bookkeeping done during
    // reset doesn't pollute the per-test call counts.
    setIonToken(null);
    void getTerrainProvider(true).catch(() => undefined);
    // Now drop all counters so each test sees a clean slate.
    ionAssetIdCalls.length = 0;
    osmConstructorCalls.length = 0;
    ellipsoidTerrainConstructorCalls.length = 0;
    worldTerrainCalls.length = 0;
    ionAccessor.defaultAccessToken = '';
  });

  // -------------------------------------------------------------------------
  // setupBaseImagery — no-token branch
  // -------------------------------------------------------------------------

  describe('setupBaseImagery — without ion token', () => {
    it('uses OSM imagery and never calls ion when no token is installed', async () => {
      const viewer = makeViewer();
      await setupBaseImagery(viewer);

      expect(osmConstructorCalls.length).toBe(1);
      expect(ionAssetIdCalls).toEqual([]);
    });

    it('configures OSM with the public tile.openstreetmap.org endpoint', async () => {
      const viewer = makeViewer();
      await setupBaseImagery(viewer);

      expect(osmConstructorCalls[0].url).toBe('https://tile.openstreetmap.org/');
    });

    it('adds the OSM imagery layer to the viewer scene', async () => {
      const viewer = makeViewer();
      await setupBaseImagery(viewer);

      const addSpy = viewer.scene.imageryLayers.add as ReturnType<typeof vi.fn>;
      expect(addSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // setupBaseImagery — with-token branch
  // -------------------------------------------------------------------------

  describe('setupBaseImagery — with ion token', () => {
    it('requests Bing Aerial (asset 2) when a token is installed', async () => {
      setIonToken('eyJ_a_realistic_looking_jwt_payload_here.signature');
      const viewer = makeViewer();
      await setupBaseImagery(viewer);

      expect(ionAssetIdCalls).toEqual([2]);
      expect(osmConstructorCalls.length).toBe(0);
    });

    it('falls back to OSM when ion Bing fetch rejects', async () => {
      const { IonImageryProvider } = await import('cesium');
      vi.mocked(IonImageryProvider.fromAssetId).mockRejectedValueOnce(
        new Error('401 Unauthorized'),
      );

      setIonToken('eyJ_a_realistic_looking_jwt_payload_here.signature');
      const viewer = makeViewer();
      await setupBaseImagery(viewer);

      // Bing was tried first, then OSM was used as the fallback so the
      // globe is never black.
      expect(osmConstructorCalls.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getTerrainProvider — both branches
  // -------------------------------------------------------------------------

  describe('getTerrainProvider', () => {
    it('returns a flat EllipsoidTerrainProvider when no token is installed', async () => {
      void getTerrainProvider(true).catch(() => undefined);
      const terrain = await getTerrainProvider();

      expect(ellipsoidTerrainConstructorCalls.length).toBe(1);
      expect(worldTerrainCalls.length).toBe(0);
      expect((terrain as { __ellipsoid?: boolean }).__ellipsoid).toBe(true);
    });

    it('returns Cesium World Terrain when a token is installed', async () => {
      setIonToken('eyJ_a_realistic_looking_jwt_payload_here.signature');
      void getTerrainProvider(true).catch(() => undefined);
      const terrain = await getTerrainProvider();

      expect(worldTerrainCalls.length).toBe(1);
      expect(ellipsoidTerrainConstructorCalls.length).toBe(0);
      expect((terrain as { __worldTerrain?: boolean }).__worldTerrain).toBe(true);
    });

    it('caches the result across calls within a single token state', async () => {
      void getTerrainProvider(true).catch(() => undefined);
      const a = await getTerrainProvider();
      const b = await getTerrainProvider();
      expect(a).toBe(b);
      // EllipsoidTerrainProvider should only have been constructed once.
      expect(ellipsoidTerrainConstructorCalls.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // hasIonToken / setIonToken
  // -------------------------------------------------------------------------

  describe('setIonToken / hasIonToken', () => {
    it('reports no token by default', () => {
      expect(hasIonToken()).toBe(false);
    });

    it('reports token after setIonToken with a non-empty string', () => {
      setIonToken('eyJ_some_token_value_here.signature');
      expect(hasIonToken()).toBe(true);
    });

    it('reports no token after setIonToken(null) — clears Cesium default', () => {
      setIonToken('eyJ_x.y');
      setIonToken(null);
      expect(hasIonToken()).toBe(false);
      expect(ionAccessor.defaultAccessToken).toBe('');
    });

    it('treats whitespace-only tokens as no token', () => {
      setIonToken('   ');
      expect(hasIonToken()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getPhotorealTileset — guards against ion calls without a token
  // -------------------------------------------------------------------------

  describe('getPhotorealTileset', () => {
    it('rejects without making an ion network call when no token is installed', async () => {
      await expect(getPhotorealTileset()).rejects.toThrow(/Cesium ion token/);

      const { Cesium3DTileset } = await import('cesium');
      expect(Cesium3DTileset.fromIonAssetId).not.toHaveBeenCalled();
    });

    it('forwards to Cesium3DTileset.fromIonAssetId when a token is installed', async () => {
      setIonToken('eyJ_x.y');
      const tileset = await getPhotorealTileset();
      expect((tileset as { assetId?: number }).assetId).toBe(2275207);
    });
  });

  // -------------------------------------------------------------------------
  // Legacy invariants from the original test file — still hold
  // -------------------------------------------------------------------------

  describe('setupBaseImagery — legacy invariants', () => {
    it('never requests asset 3812 (removed entitlement-gated Bing variant)', async () => {
      setIonToken('eyJ_x.y');
      const viewer = makeViewer();
      await setupBaseImagery(viewer);
      expect(ionAssetIdCalls).not.toContain(3812);
    });

    it('is idempotent — second call for the same viewer is a no-op', async () => {
      setIonToken('eyJ_x.y');
      const viewer = makeViewer();
      await setupBaseImagery(viewer);
      await setupBaseImagery(viewer);

      const addSpy = viewer.scene.imageryLayers.add as ReturnType<typeof vi.fn>;
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    it('does not throw when ion asset 2 is unavailable and OSM fallback succeeds', async () => {
      const { IonImageryProvider } = await import('cesium');
      vi.mocked(IonImageryProvider.fromAssetId).mockRejectedValueOnce(
        new Error('404 Not Found'),
      );

      setIonToken('eyJ_x.y');
      const viewer = makeViewer();
      await expect(setupBaseImagery(viewer)).resolves.toBeUndefined();
    });
  });
});
