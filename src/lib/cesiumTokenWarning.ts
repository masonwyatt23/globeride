/**
 * cesiumTokenWarning.ts — dev-mode build-time hint when no Cesium ion token
 * is configured.
 *
 * Call once from main.tsx. No-op in production builds (import.meta.env.PROD).
 * Pure function — no React, no DOM side-effects — safe to import in tests.
 */

/**
 * Emits a styled console.warn when running in dev mode and
 * VITE_CESIUM_ION_TOKEN is absent or empty.
 *
 * Does nothing in production (import.meta.env.PROD === true).
 */
export function warnIfTokenMissing(): void {
  // No-op in production bundles.
  if (import.meta.env.PROD) return;

  const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
  if (token && token.trim().length > 0) return;

  console.warn(
    [
      '%c GlobeRide — Cesium ion token missing ',
      'background:#1e3a5f;color:#7dd3fc;font-weight:bold;border-radius:4px;padding:2px 6px',
      '\n\nThe photoreal 3D globe needs a free Cesium ion token.',
      '\n  1. Visit https://ion.cesium.com/tokens',
      '\n  2. Create or copy your default token',
      '\n  3. Add to .env.local:  VITE_CESIUM_ION_TOKEN=<your token>',
      '\n\nSee .env.example for all available variables.',
      '\nWithout a token the app still works — users will be prompted in-browser.',
    ].join(''),
  );
}
