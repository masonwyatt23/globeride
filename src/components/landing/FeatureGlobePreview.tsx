/**
 * FeatureGlobePreview — tiny rotating photoreal Earth for the FeatureGrid
 * "3D photoreal world" card.
 *
 * Constraints vs HeroGlobe:
 *   - Card-size container (~280 × 180 px set by the parent card div).
 *   - Auto-rotation at 0.5°/s, no interaction.
 *   - Bing Aerial imagery + SkyAtmosphere.
 *   - No Google Photorealistic 3D Tiles (card is too small to benefit).
 *   - IntersectionObserver threshold 0.05 — mounts only when in viewport,
 *     destroys after 500 ms outside (saves GPU budget for off-screen cards).
 *   - Concurrent-scene cap via module-level counter (max 5 total landing scenes).
 *   - On devices with hardwareConcurrency < 4 the SVG fallback is always shown.
 *   - Cesium is lazy-imported so it shares the same dynamic chunk as HeroGlobe.
 *
 * DO NOT modify HeroGlobe.tsx, DemoRideScene.tsx, or HeroSection.tsx.
 */

import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { GlobeIcon } from './FeatureIcons';
import {
  resolveCesiumToken,
  isWebGLAvailable,
  hasSufficientHardware,
} from '@/lib/landingGates';

// ---------------------------------------------------------------------------
// Concurrent-scene cap — shared across this module and FeatureAvatarPreview.
// Exported so the avatar preview can read/write the same counter.
// ---------------------------------------------------------------------------
export let activeLandingScenes = 0;
export const MAX_LANDING_SCENES = 5;

/** Call on mount of a live scene. Returns true if slot was available. */
export function claimSceneSlot(): boolean {
  if (activeLandingScenes >= MAX_LANDING_SCENES) return false;
  activeLandingScenes++;
  return true;
}

/** Call on unmount of a live scene. */
export function releaseSceneSlot(): void {
  if (activeLandingScenes > 0) activeLandingScenes--;
}

// ---------------------------------------------------------------------------
// Lazy Cesium import — shares bundle chunk with HeroGlobe / DemoRideScene.
// ---------------------------------------------------------------------------
const LazyGlobeScene = lazy(() =>
  import('./FeatureGlobeScene').then((m) => ({ default: m.FeatureGlobeScene })),
);

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export interface FeatureGlobePreviewProps {
  /** Overrides for testing gate logic without mounting Cesium. */
  _tokenOverride?: string | null;
  _webglOverride?: boolean;
  _hardwareOverride?: boolean;
}

export function FeatureGlobePreview({
  _tokenOverride,
  _webglOverride,
  _hardwareOverride,
}: FeatureGlobePreviewProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Evaluate gates synchronously once.
  const { canShow, token } = useMemo(() => {
    const resolvedToken =
      _tokenOverride !== undefined ? _tokenOverride : resolveCesiumToken();
    const webgl = _webglOverride !== undefined ? _webglOverride : isWebGLAvailable();
    const hw = _hardwareOverride !== undefined ? _hardwareOverride : hasSufficientHardware();
    return {
      canShow: !!(resolvedToken && webgl && hw),
      token: resolvedToken,
    };
  }, [_tokenOverride, _webglOverride, _hardwareOverride]);

  // IntersectionObserver — mount on enter, debounced unmount on exit.
  useEffect(() => {
    if (!canShow || !containerRef.current) return;

    const io = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 0;
        if (ratio >= 0.05) {
          if (unmountTimerRef.current !== null) {
            clearTimeout(unmountTimerRef.current);
            unmountTimerRef.current = null;
          }
          setIsIntersecting(true);
        } else {
          // Delay unmount by 500 ms to avoid thrash on slight scroll.
          unmountTimerRef.current = setTimeout(() => {
            setIsIntersecting(false);
            unmountTimerRef.current = null;
          }, 500);
        }
      },
      { threshold: [0, 0.05, 1] },
    );

    io.observe(containerRef.current);
    return () => {
      io.disconnect();
      if (unmountTimerRef.current !== null) clearTimeout(unmountTimerRef.current);
    };
  }, [canShow]);

  const showScene = canShow && isIntersecting && !!token;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ height: 180 }}
      aria-hidden
    >
      {showScene ? (
        <Suspense fallback={<GlobeIconFallback />}>
          <LazyGlobeScene ionToken={token!} />
        </Suspense>
      ) : (
        <GlobeIconFallback />
      )}
    </div>
  );
}

function GlobeIconFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <GlobeIcon
        className="h-full w-full"
        style={{ maxHeight: 180 }}
        aria-hidden
      />
    </div>
  );
}
