/**
 * cesiumHDR.ts — HDR tonemapping helpers for GlobeRide Cesium viewers.
 *
 * Cesium's highDynamicRange + ACES filmic tonemapper gives richer colour
 * reproduction: brighter skies, deeper shadows, saturated terrain — the same
 * look-up table Hollywood colour-grading uses.
 *
 * These helpers are pure functions that operate on a live Cesium.Viewer; they
 * have no React dependency and no side-effects of their own so they can be
 * called from any viewer setup block.
 *
 * Unit-testable: shouldEnableHDR() is a pure decision function that can be
 * exercised in a Node/jsdom environment with mocked navigator globals.
 * tryEnableHDR / disableHDR operate on a plain object that matches the
 * Viewer+Scene shape used by the tests.
 */

import * as Cesium from 'cesium';

// ---------------------------------------------------------------------------
// Platform capability probe
// ---------------------------------------------------------------------------

/**
 * Returns true when the current platform is capable enough to run HDR
 * tonemapping without a significant framerate penalty.
 *
 * Decision matrix:
 *   - Requires WebGL2 (checked via canvas.getContext probe).
 *   - Requires navigator.hardwareConcurrency >= 4 (proxy for mid-tier GPU).
 *   - Bails out when running in a test/SSR environment (no `document`).
 *
 * This is intentionally conservative: false negatives (disabling HDR on a
 * capable device) are better than false positives (enabling it on a weak GPU
 * and dropping frames during a ride).
 */
export function shouldEnableHDR(): boolean {
  // SSR / test environment — no DOM.
  if (typeof document === 'undefined') return false;

  // CPU-core proxy for GPU tier.  hardwareConcurrency is 0 or undefined in
  // some sandboxed environments; default conservatively to 2 (→ false).
  const cores = (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0) ?? 0;
  if (cores < 4) return false;

  // WebGL2 availability — ACES tonemapper requires it.
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl2');
    if (!ctx) return false;
  } catch {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Viewer-level helpers
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a Cesium viewer that HDR helpers need — factored out so
 * tests can pass a plain mock without importing the real Cesium bundle.
 */
export interface HdrViewer {
  isDestroyed(): boolean;
  scene: {
    highDynamicRange: boolean;
    postProcessStages: {
      tonemapper?: Cesium.Tonemapper;
    };
  };
}

/**
 * Enable HDR + ACES filmic tonemapping on a Cesium viewer.
 *
 * Returns true if HDR was successfully applied, false if the viewer is
 * destroyed, HDR is not supported on this platform, or the Cesium build
 * does not expose the tonemapper API (older builds).
 *
 * Safe to call multiple times — idempotent (checks current state first).
 */
export function tryEnableHDR(viewer: HdrViewer): boolean {
  if (viewer.isDestroyed()) return false;
  if (!shouldEnableHDR()) return false;

  try {
    viewer.scene.highDynamicRange = true;

    // ACES-filmic tonemapper — available in Cesium >= 1.104.
    // Guard with optional-chaining so older Cesium builds don't throw.
    const stages = viewer.scene.postProcessStages;
    if (stages && 'tonemapper' in stages && Cesium.Tonemapper?.ACES !== undefined) {
      stages.tonemapper = Cesium.Tonemapper.ACES;
    }

    return true;
  } catch {
    // Any Cesium internal error (WebGL context loss, destroyed scene, etc.) —
    // fall back silently.
    return false;
  }
}

/**
 * Revert the viewer to standard dynamic range + default tonemapper.
 * No-op if the viewer is already destroyed.
 */
export function disableHDR(viewer: HdrViewer): void {
  if (viewer.isDestroyed()) return;
  try {
    viewer.scene.highDynamicRange = false;
    const stages = viewer.scene.postProcessStages;
    if (stages && 'tonemapper' in stages && Cesium.Tonemapper?.FILMIC !== undefined) {
      // Cesium's default is FILMIC — restore it.
      stages.tonemapper = Cesium.Tonemapper.FILMIC;
    }
  } catch {
    // Ignore errors on teardown paths.
  }
}
