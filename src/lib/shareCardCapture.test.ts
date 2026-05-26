/**
 * shareCardCapture — unit tests.
 *
 * All Cesium viewer methods are mocked with plain objects / functions.
 * The test environment is Node (no DOM, no real Cesium bundle).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeRouteBounds,
  spanToAltitude,
  fitCameraToRoute,
  waitForCesiumReady,
  type CesiumViewer,
} from './shareCardCapture';
import type { Route } from '@/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRoute(points: { lat: number; lon: number; ele: number }[]): Route {
  return {
    id: 'test',
    name: 'Test Route',
    points: points.map((p, i) => ({ ...p, distance: i * 100 })),
    totalDistance: points.length * 100,
    ascent: 0,
    descent: 0,
    minElevation: Math.min(...points.map((p) => p.ele)),
    maxElevation: Math.max(...points.map((p) => p.ele)),
    loadedAt: 0,
  };
}

const ALPS_ROUTE = makeRoute([
  { lat: 46.0, lon: 10.0, ele: 500 },
  { lat: 46.2, lon: 10.3, ele: 1200 },
  { lat: 46.4, lon: 10.6, ele: 1850 },
]);

const SINGLE_POINT_ROUTE = makeRoute([{ lat: 51.5, lon: -0.1, ele: 10 }]);

const EMPTY_ROUTE: Route = {
  id: 'empty',
  name: 'Empty',
  points: [],
  totalDistance: 0,
  ascent: 0,
  descent: 0,
  minElevation: 0,
  maxElevation: 0,
  loadedAt: 0,
};

// ── Mock Cesium module ────────────────────────────────────────────────────────

const mockCartesian3FromDegrees = vi.fn(
  (lon: number, lat: number, alt: number) => ({ lon, lat, alt }),
);
const MockCesium = {
  Cartesian3: { fromDegrees: mockCartesian3FromDegrees },
  Math: { PI_OVER_TWO: Math.PI / 2 },
};

// ── computeRouteBounds ────────────────────────────────────────────────────────

describe('computeRouteBounds', () => {
  it('returns null for an empty route', () => {
    expect(computeRouteBounds(EMPTY_ROUTE)).toBeNull();
  });

  it('computes correct centre for a multi-point route', () => {
    const bounds = computeRouteBounds(ALPS_ROUTE);
    expect(bounds).not.toBeNull();
    expect(bounds!.midLat).toBeCloseTo(46.2, 5);
    expect(bounds!.midLon).toBeCloseTo(10.3, 5);
  });

  it('handles single-point route with non-zero spans', () => {
    const bounds = computeRouteBounds(SINGLE_POINT_ROUTE);
    expect(bounds).not.toBeNull();
    // Both spans should fall back to the 1e-4 minimum, not 0.
    expect(bounds!.spanLat).toBeGreaterThan(0);
    expect(bounds!.spanLonCos).toBeGreaterThan(0);
  });

  it('applies cosine correction to the longitude span', () => {
    // At latitude 60° cos ≈ 0.5 — lon span should be ~half of raw degrees.
    const route = makeRoute([
      { lat: 59.9, lon: 10.0, ele: 0 },
      { lat: 60.1, lon: 12.0, ele: 0 },
    ]);
    const bounds = computeRouteBounds(route)!;
    const rawLon = 2.0;                          // 12 - 10
    const cos60 = Math.cos((60 * Math.PI) / 180); // ≈ 0.5
    expect(bounds.spanLonCos).toBeCloseTo(rawLon * cos60, 4);
  });
});

// ── spanToAltitude ────────────────────────────────────────────────────────────

describe('spanToAltitude', () => {
  it('returns a positive altitude for a positive span', () => {
    expect(spanToAltitude(0.5)).toBeGreaterThan(0);
  });

  it('scales linearly with span degrees', () => {
    const alt1 = spanToAltitude(1.0);
    const alt2 = spanToAltitude(2.0);
    expect(alt2 / alt1).toBeCloseTo(2.0, 4);
  });

  it('padding factor multiplies the result linearly', () => {
    const base = spanToAltitude(1.0, 1.0);
    const padded = spanToAltitude(1.0, 2.0);
    expect(padded / base).toBeCloseTo(2.0, 4);
  });
});

// ── fitCameraToRoute ──────────────────────────────────────────────────────────

describe('fitCameraToRoute', () => {
  let setView: ReturnType<typeof vi.fn>;
  let mockViewer: CesiumViewer;

  beforeEach(() => {
    setView = vi.fn();
    mockCartesian3FromDegrees.mockClear();
    mockViewer = {
      isDestroyed: () => false,
      scene: {
        globe: { tilesLoaded: false },
        postRender: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
      camera: {
        flyTo: vi.fn(),
        setView,
      },
      destroy: vi.fn(),
    };
  });

  it('calls setView with midLon/midLat of the route', () => {
    fitCameraToRoute(mockViewer, ALPS_ROUTE, MockCesium);
    expect(mockCartesian3FromDegrees).toHaveBeenCalledOnce();
    const [lon, lat] = mockCartesian3FromDegrees.mock.calls[0];
    expect(lon).toBeCloseTo(10.3, 4);
    expect(lat).toBeCloseTo(46.2, 4);
  });

  it('passes altitude > 0', () => {
    fitCameraToRoute(mockViewer, ALPS_ROUTE, MockCesium);
    const [, , alt] = mockCartesian3FromDegrees.mock.calls[0];
    expect(alt).toBeGreaterThan(0);
  });

  it('sets pitch to -PI/2 (nadir / straight down)', () => {
    fitCameraToRoute(mockViewer, ALPS_ROUTE, MockCesium);
    const opts = setView.mock.calls[0][0];
    expect(opts.orientation.pitch).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('does nothing for an empty route', () => {
    fitCameraToRoute(mockViewer, EMPTY_ROUTE, MockCesium);
    expect(setView).not.toHaveBeenCalled();
  });

  it('padding factor increases altitude proportionally', () => {
    fitCameraToRoute(mockViewer, ALPS_ROUTE, MockCesium, 1.0);
    const [, , alt1] = mockCartesian3FromDegrees.mock.calls[0];
    mockCartesian3FromDegrees.mockClear();
    fitCameraToRoute(mockViewer, ALPS_ROUTE, MockCesium, 2.0);
    const [, , alt2] = mockCartesian3FromDegrees.mock.calls[0];
    expect(alt2 / alt1).toBeCloseTo(2.0, 3);
  });
});

// ── waitForCesiumReady ────────────────────────────────────────────────────────

describe('waitForCesiumReady', () => {
  it('resolves immediately when the viewer is already destroyed', async () => {
    const viewer: CesiumViewer = {
      isDestroyed: () => true,
      scene: {
        globe: { tilesLoaded: false },
        postRender: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
      camera: { flyTo: vi.fn(), setView: vi.fn() },
      destroy: vi.fn(),
    };
    await expect(waitForCesiumReady(viewer, 100)).resolves.toBeUndefined();
    // Should not have subscribed to postRender.
    expect(viewer.scene.postRender.addEventListener).not.toHaveBeenCalled();
  });

  it('resolves after N stable frames once tilesLoaded is true', async () => {
    const listeners: Array<() => void> = [];
    const viewer: CesiumViewer = {
      isDestroyed: () => false,
      scene: {
        globe: { tilesLoaded: false },
        postRender: {
          addEventListener: (cb) => listeners.push(cb),
          removeEventListener: vi.fn(),
        },
      },
      camera: { flyTo: vi.fn(), setView: vi.fn() },
      destroy: vi.fn(),
    };

    const promise = waitForCesiumReady(viewer, 2_000, 2);

    // Fire 1 frame with tiles still loading — should NOT resolve yet.
    listeners.forEach((cb) => cb());
    await Promise.resolve(); // flush microtasks

    // Now mark tiles as loaded and fire 2 stable frames.
    viewer.scene.globe.tilesLoaded = true;
    listeners.forEach((cb) => cb()); // frame 1
    listeners.forEach((cb) => cb()); // frame 2 → should resolve

    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves on timeout if tiles never load', async () => {
    const viewer: CesiumViewer = {
      isDestroyed: () => false,
      scene: {
        globe: { tilesLoaded: false },
        postRender: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
      camera: { flyTo: vi.fn(), setView: vi.fn() },
      destroy: vi.fn(),
    };

    // 50 ms timeout, no postRender frames fired — must still resolve.
    await expect(waitForCesiumReady(viewer, 50, 3)).resolves.toBeUndefined();
  }, 3_000);
});
