/**
 * HeroVisual — smart wrapper that decides what to render in the hero column.
 *
 * Decision tree (evaluated synchronously before any lazy chunk fires):
 *
 *   1. hardwareConcurrency < 4  → fallback (low-end device, skip GPU work)
 *   2. WebGL unavailable        → fallback (no 3D support)
 *   3. No Cesium ion token      → fallback (can't stream imagery)
 *   4. Otherwise                → React.lazy(HeroGlobe) + Suspense(fallback)
 *
 * The ion token is resolved silently — env var first, localStorage second.
 * The landing page NEVER prompts for a token. Cold visitors always see either
 * a working Cesium globe (if they have a token somehow) or the SVG fallback.
 *
 * The lazy chunk (Cesium ~3 MB) is only requested when all three preconditions
 * pass — so the initial landing JS payload is unaffected.
 */

import React, { lazy, Suspense, useMemo } from 'react';
import { HeroGlobeFallback } from './HeroGlobeFallback';

const TOKEN_STORAGE_KEY = 'globeride.cesiumIonToken';

/**
 * Resolve the Cesium ion token without prompting.
 * Returns the token string or null if neither source has one.
 */
export function resolveIonToken(): string | null {
  // 1. Build-time env var (set in .env.local — gitignored).
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
 * True when the device likely has enough CPU cores to handle a Cesium globe
 * alongside the rest of the landing page without stuttering.
 */
export function hasSufficientHardware(): boolean {
  // navigator.hardwareConcurrency is 0 or undefined in some environments;
  // treat unknown as sufficient so we don't wrongly degrade.
  const cores = navigator.hardwareConcurrency ?? 8;
  return cores === 0 || cores >= 4;
}

// Lazy-loaded Cesium globe — only evaluated when all preconditions pass.
// The dynamic import keeps Cesium out of the initial landing bundle entirely.
const LazyHeroGlobe = lazy(() =>
  import('./HeroGlobe').then((m) => ({ default: m.HeroGlobe })),
);

interface HeroVisualProps {
  /** Override token resolution for testing. */
  _tokenOverride?: string | null;
  /** Override WebGL check for testing. */
  _webglOverride?: boolean;
  /** Override hardware check for testing. */
  _hardwareOverride?: boolean;
}

export function HeroVisual({
  _tokenOverride,
  _webglOverride,
  _hardwareOverride,
}: HeroVisualProps = {}) {
  // Resolve all preconditions once on mount — useMemo so they don't re-run
  // on every render (token reads localStorage, WebGL creates a canvas).
  const { canShowGlobe, token } = useMemo(() => {
    const resolvedToken = _tokenOverride !== undefined ? _tokenOverride : resolveIonToken();
    const webgl = _webglOverride !== undefined ? _webglOverride : isWebGLAvailable();
    const hw = _hardwareOverride !== undefined ? _hardwareOverride : hasSufficientHardware();

    return {
      canShowGlobe: !!(resolvedToken && webgl && hw),
      token: resolvedToken,
    };
  }, [_tokenOverride, _webglOverride, _hardwareOverride]);

  if (!canShowGlobe || !token) {
    return <HeroGlobeFallback />;
  }

  // HeroGlobe's inner container uses `absolute inset-0`, so it needs a
  // positioned ancestor with explicit dimensions. Without this wrapper the
  // Cesium canvas collapses to height:0 and renders as a black void.
  return (
    <div className="relative h-full w-full min-h-[420px]">
      <Suspense fallback={<HeroGlobeFallback />}>
        <LazyHeroGlobe ionToken={token} />
      </Suspense>
    </div>
  );
}
