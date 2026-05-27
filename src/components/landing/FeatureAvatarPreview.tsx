/**
 * FeatureAvatarPreview — tiny live cyclist scene for the FeatureGrid
 * "Animated 45-part 3D avatar" card.
 *
 * Constraints:
 *   - Same card size and lazy-load pattern as FeatureGlobePreview.
 *   - Chase-cam follows the actual procedural createAvatar() cyclist.
 *   - Loops over a short flat/rolling demo arc (~10 s per loop at 8× speed).
 *   - Pedals visibly move, wheels visibly spin via avatar.update() per frame.
 *   - IntersectionObserver threshold 0.05, debounced 500 ms unmount.
 *   - Concurrent-scene cap via claimSceneSlot / releaseSceneSlot.
 *   - On devices with hardwareConcurrency < 4 the SVG fallback is shown.
 *   - Cesium is lazy-imported so it shares the same dynamic chunk.
 *
 * DO NOT modify HeroGlobe.tsx, DemoRideScene.tsx, or HeroSection.tsx.
 */

import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AvatarIcon } from './FeatureIcons';
import {
  resolveCesiumToken,
  isWebGLAvailable,
  hasSufficientHardware,
} from '@/lib/landingGates';

const LazyAvatarScene = lazy(() =>
  import('./FeatureAvatarScene').then((m) => ({ default: m.FeatureAvatarScene })),
);

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export interface FeatureAvatarPreviewProps {
  /** Overrides for testing gate logic without mounting Cesium. */
  _tokenOverride?: string | null;
  _webglOverride?: boolean;
  _hardwareOverride?: boolean;
}

export function FeatureAvatarPreview({
  _tokenOverride,
  _webglOverride,
  _hardwareOverride,
}: FeatureAvatarPreviewProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        <Suspense fallback={<AvatarIconFallback />}>
          <LazyAvatarScene ionToken={token!} />
        </Suspense>
      ) : (
        <AvatarIconFallback />
      )}
    </div>
  );
}

function AvatarIconFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <AvatarIcon
        className="h-full w-full"
        style={{ maxHeight: 180 }}
        aria-hidden
      />
    </div>
  );
}
