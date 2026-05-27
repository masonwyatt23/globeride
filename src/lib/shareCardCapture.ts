/**
 * shareCardCapture — helpers for capturing a Cesium-backed share card.
 *
 * The core problem: html-to-image captures the DOM at a fixed instant.
 * Cesium loads terrain and imagery tiles progressively, so a naive capture
 * immediately after mount yields a gray or partially-loaded globe.
 *
 * Solution:
 *   1. Wait for `viewer.scene.globe.tilesLoaded` to become true, OR
 *   2. Count N consecutive `postRender` frames without new tile requests.
 *   3. Hard timeout to never block the user forever.
 *
 * Both helpers are pure async functions — no React dependency — so they can
 * be unit-tested with lightweight mocks.
 */

import type { Route } from '@/types';

// ── Types that mirror the Cesium API surface we actually use ─────────────────
// (Using `any` types in the interface avoids importing the full Cesium package
// at test time — the real Cesium module is aliased in vite.config but not in
// vitest's node environment.)

export interface CesiumViewer {
  isDestroyed(): boolean;
  scene: {
    globe: {
      tilesLoaded: boolean;
    };
    postRender: {
      addEventListener(cb: () => void): void;
      removeEventListener(cb: () => void): void;
    };
  };
  camera: {
    flyTo(options: {
      destination: unknown;
      orientation?: unknown;
      duration?: number;
    }): void;
    setView(options: { destination?: unknown; orientation?: unknown }): void;
  };
  destroy(): void;
}

// ── Bounding-box helpers ──────────────────────────────────────────────────────

interface RouteBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  /** Centre lat, for cosine correction. */
  midLat: number;
  /** Centre lon. */
  midLon: number;
  /** Span in degrees (lat). */
  spanLat: number;
  /** Span in degrees (lon, cosine-corrected). */
  spanLonCos: number;
}

/**
 * Compute the geographic bounding box of a route.
 * Returns null when the route has no points (guard for empty routes).
 */
export function computeRouteBounds(route: Route): RouteBounds | null {
  if (!route.points || route.points.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  for (const p of route.points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  const spanLat = maxLat - minLat || 1e-4;  // avoid zero for very short routes
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const spanLonCos = (maxLon - minLon || 1e-4) * cosLat;

  return { minLat, maxLat, minLon, maxLon, midLat, midLon, spanLat, spanLonCos };
}

/**
 * Compute the camera altitude needed to frame a route's bounding box.
 *
 * Uses a simplified field-of-view model: altitude = max(spanLat, spanLonCos)
 * in degrees converted to metres, then scaled by paddingFactor and a
 * vertical FOV constant (60°).
 *
 * @param spanDeg  The larger of the lat/lon span in degrees.
 * @param paddingFactor  Multiplier to add breathing room (default 1.3).
 */
export function spanToAltitude(spanDeg: number, paddingFactor = 1.3): number {
  // 1° ≈ 111 km at the equator; divide by tan(FOV/2) ≈ tan(30°) ≈ 0.577
  const METRES_PER_DEG = 111_000;
  return (spanDeg * METRES_PER_DEG * paddingFactor) / Math.tan(Math.PI / 6);
}

/**
 * Frame the camera to fit the route's geographic bounding box with padding.
 *
 * Uses `setView` (instant, no animation) — the share card is a still capture,
 * so we need a stable position, not a fly-to animation.
 *
 * Requires the real `Cesium` module to be in scope at the call site.
 * The function is typed generically so unit tests can pass mocks.
 *
 * @param viewer       Cesium Viewer instance.
 * @param route        The route to frame.
 * @param Cesium       The Cesium module (passed explicitly to keep the lib
 *                     tree-shakeable and testable without the full bundle).
 * @param paddingFactor Zoom-out multiplier, default 1.3.
 */
/** Minimal Cesium namespace shape required by fitCameraToRoute. */
type CesiumNS = {
  Cartesian3: { fromDegrees(lon: number, lat: number, alt: number): object };
  Math: { PI_OVER_TWO: number };
};

export function fitCameraToRoute(
  viewer: CesiumViewer,
  route: Route,
  Cesium: CesiumNS,
  paddingFactor = 1.3,
): void {
  const bounds = computeRouteBounds(route);
  if (!bounds) return;

  const spanDeg = Math.max(bounds.spanLat, bounds.spanLonCos);
  const altitude = spanToAltitude(spanDeg, paddingFactor);

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      bounds.midLon,
      bounds.midLat,
      altitude,
    ),
    orientation: {
      heading: 0,
      pitch: -Cesium.Math.PI_OVER_TWO, // straight down
      roll: 0,
    },
  });
}

// ── Tile-load race guard ──────────────────────────────────────────────────────

/**
 * Wait until the Cesium scene's globe tiles are fully loaded and at least
 * `stableFrames` consecutive `postRender` events have fired without any new
 * tile work outstanding.
 *
 * Capture timing strategy:
 *   - Poll `scene.globe.tilesLoaded` on every `postRender` frame.
 *   - Once it is true, increment a stable-frame counter.
 *   - Resolve when the counter reaches `stableFrames`.
 *   - Hard-timeout at `timeoutMs` ms so the user is never blocked forever —
 *     we capture whatever is rendered by then (partial tiles > gray).
 *
 * @param viewer        Cesium Viewer instance.
 * @param timeoutMs     Maximum wait time in ms (default 4 000).
 * @param stableFrames  Number of consecutive loaded frames before resolve
 *                      (default 3 — empirically enough for Bing tiles to settle).
 */
export function waitForCesiumReady(
  viewer: CesiumViewer,
  timeoutMs = 4_000,
  stableFrames = 3,
): Promise<void> {
  return new Promise<void>((resolve) => {
    // If the viewer is already destroyed or tiles happen to be loaded
    // synchronously (e.g. in tests), resolve immediately.
    if (viewer.isDestroyed()) {
      resolve();
      return;
    }

    let stableCount = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      viewer.scene.postRender.removeEventListener(onFrame);
      clearTimeout(timer);
      resolve();
    };

    const onFrame = () => {
      if (viewer.isDestroyed()) {
        finish();
        return;
      }
      if (viewer.scene.globe.tilesLoaded) {
        stableCount++;
        if (stableCount >= stableFrames) finish();
      } else {
        // Reset: tiles are still loading.
        stableCount = 0;
      }
    };

    viewer.scene.postRender.addEventListener(onFrame);

    // Hard timeout — resolve even if tiles never fully load.
    const timer = setTimeout(finish, timeoutMs);
  });
}
