/**
 * landingGates.ts — shared Cesium render-gate helpers.
 *
 * Used by:
 *   - src/components/landing/HeroVisual.tsx   (hero globe)
 *   - src/components/library/RouteCardPreview.tsx (per-card mini-globes)
 *
 * Keep this file free of React / DOM side-effects — pure synchronous
 * functions only so tests can import it in a Node environment.
 */

const TOKEN_STORAGE_KEY = 'globeride.cesiumIonToken';

/**
 * Resolve the Cesium ion access token without prompting the user.
 * Returns the token string, or null if neither source has one.
 *
 * Resolution order:
 *   1. VITE_CESIUM_ION_TOKEN build-time env var (.env.local — gitignored)
 *   2. localStorage['globeride.cesiumIonToken'] (written by CesiumTokenPrompt)
 */
export function resolveCesiumToken(): string | null {
  // 1. Build-time env var.
  const envToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
  if (envToken && envToken.trim().length > 0) return envToken.trim();

  // 2. Persisted by the in-app CesiumTokenPrompt on a previous visit.
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored && stored.trim().length > 0) return stored.trim();
  } catch {
    // localStorage may be blocked (private browsing, iframe sandbox).
  }

  return null;
}

/**
 * Quick synchronous WebGL availability check.
 * Returns true if the browser can render WebGL content.
 */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Returns true when the device likely has enough CPU cores to handle a
 * Cesium scene alongside other page work.
 *
 * navigator.hardwareConcurrency is 0 or undefined in some environments;
 * treat unknown (0) as sufficient so we don't wrongly degrade capable devices.
 */
export function hasSufficientHardware(): boolean {
  const cores = navigator.hardwareConcurrency ?? 8;
  return cores === 0 || cores >= 4;
}

/**
 * Combined gate: all three preconditions must pass for a Cesium globe to
 * render safely.
 */
export function canRenderCesium(): boolean {
  return isWebGLAvailable() && hasSufficientHardware();
}
