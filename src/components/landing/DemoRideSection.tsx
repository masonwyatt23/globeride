/**
 * DemoRideSection — landing-page section that plays a cinematic GlobeRide
 * demo ride (Mont Ventoux, 8× speed) in a Cesium globe.
 *
 * Design goals:
 *   - No flicker: static fallback is always present; scene fades in on top.
 *   - No blank section: fallback SVG renders immediately, scene mounts only
 *     after gates pass AND the section enters the viewport.
 *   - Lazy-loaded: DemoRideScene is dynamic-imported so Cesium stays out of
 *     the initial landing bundle (same chunk as HeroGlobe — Vite deduplicates).
 *   - Pause when off-screen: IntersectionObserver unmounts the scene when
 *     intersectionRatio < 0.05, re-mounts when scrolled back in.
 *   - Gate logic: reuses exported helpers from HeroVisual (DRY).
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  hasSufficientHardware,
  isWebGLAvailable,
  resolveIonToken,
} from './HeroVisual';

// ---------------------------------------------------------------------------
// Lazy Cesium scene — dynamic import keeps it out of the initial bundle.
// Vite shares this chunk with HeroGlobe (same cesium import path).
// ---------------------------------------------------------------------------
const LazyDemoRideScene = lazy(() =>
  import('./DemoRideScene').then((m) => ({ default: m.DemoRideScene })),
);

// ---------------------------------------------------------------------------
// Static fallback — shown when gates fail or scene hasn't mounted yet.
// Stylised route profile with a motion-blur cycling silhouette feel.
// ---------------------------------------------------------------------------
function DemoFallback() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      aria-hidden
      style={{ background: 'hsl(220 42% 6%)' }}
    >
      <svg
        viewBox="0 0 960 540"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="demoGlobeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(210 60% 16%)" />
            <stop offset="100%" stopColor="hsl(220 42% 4%)" />
          </radialGradient>
          <radialGradient id="demoAtmos" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="transparent" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.12" />
          </radialGradient>
          <filter id="demoGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(158 80% 42%)" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Globe circle */}
        <circle cx="480" cy="270" r="220" fill="url(#demoGlobeGrad)" />
        <circle cx="480" cy="270" r="220" fill="url(#demoAtmos)" />
        <circle cx="480" cy="270" r="220" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.2" fill="none" />

        {/* Latitude lines */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const y = 270 - (lat / 90) * 220;
          const halfW = Math.sqrt(Math.max(0, 220 * 220 - (y - 270) * (y - 270)));
          return (
            <line
              key={lat}
              x1={480 - halfW}
              y1={y}
              x2={480 + halfW}
              y2={y}
              stroke="#22d3ee"
              strokeWidth="0.5"
              strokeOpacity="0.12"
            />
          );
        })}

        {/* Mont Ventoux route arc */}
        <path
          d="M 360 310 C 390 295, 420 270, 455 245 S 510 215, 560 195"
          stroke="url(#routeGrad)"
          strokeWidth="3"
          fill="none"
          filter="url(#demoGlow)"
          strokeLinecap="round"
        />

        {/* Rider dot at summit */}
        <circle cx="560" cy="195" r="6" fill="#22d3ee" opacity="0.95" filter="url(#demoGlow)" />
        <circle
          cx="560"
          cy="195"
          r="12"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.5"
          strokeOpacity="0.4"
          style={{ animation: 'demoRiderPulse 2s ease-in-out infinite' }}
        />

        {/* Base dot */}
        <circle cx="360" cy="310" r="4" fill="hsl(158 80% 42%)" opacity="0.8" />

        {/* Labels */}
        <text x="560" y="178" textAnchor="middle" fill="#22d3ee" fontSize="11" fontFamily="system-ui, sans-serif" opacity="0.8">
          1912 m
        </text>
        <text x="350" y="328" textAnchor="middle" fill="hsl(215 18% 55%)" fontSize="10" fontFamily="system-ui, sans-serif" opacity="0.7">
          Bédoin
        </text>
        <text x="480" y="490" textAnchor="middle" fill="hsl(215 18% 40%)" fontSize="12" fontFamily="system-ui, sans-serif">
          Mont Ventoux · 21.5 km · 1617 m ascent
        </text>
      </svg>
      <style>{`
        @keyframes demoRiderPulse {
          0%, 100% { opacity: 0.4; r: 12; }
          50% { opacity: 0.1; r: 16; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DemoRideSection
// ---------------------------------------------------------------------------

interface DemoRideSectionProps {
  /** Test overrides — mirror HeroVisual's pattern. */
  _tokenOverride?: string | null;
  _webglOverride?: boolean;
  _hardwareOverride?: boolean;
  /** Test override for intersection — when true, treat as intersecting. */
  _intersectingOverride?: boolean;
}

export function DemoRideSection({
  _tokenOverride,
  _webglOverride,
  _hardwareOverride,
  _intersectingOverride,
}: DemoRideSectionProps = {}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  // Resolve gates once (same logic as HeroVisual — DRY via shared exports).
  const { canShowScene, token } = useMemo(() => {
    const resolvedToken =
      _tokenOverride !== undefined ? _tokenOverride : resolveIonToken();
    const webgl =
      _webglOverride !== undefined ? _webglOverride : isWebGLAvailable();
    const hw =
      _hardwareOverride !== undefined ? _hardwareOverride : hasSufficientHardware();

    return {
      canShowScene: !!(resolvedToken && webgl && hw),
      token: resolvedToken,
    };
  }, [_tokenOverride, _webglOverride, _hardwareOverride]);

  // IntersectionObserver — only mount heavy Cesium scene when visible.
  useEffect(() => {
    if (_intersectingOverride !== undefined) {
      setIsIntersecting(_intersectingOverride);
      return;
    }

    const el = sectionRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 0;
        setIsIntersecting(ratio >= 0.05);
      },
      { threshold: [0, 0.05, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [_intersectingOverride]);

  const showScene = canShowScene && isIntersecting && !!token;

  return (
    <section
      ref={sectionRef}
      className="relative w-full py-16 sm:py-24"
      aria-label="Demo ride — Mont Ventoux"
    >
      {/* Section heading */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-8 text-center">
        <p
          className="text-[10px] font-bold uppercase tracking-widest mb-3"
          style={{ color: '#22d3ee' }}
        >
          Live demo
        </p>
        <h2
          className="font-extrabold text-white"
          style={{
            fontSize: 'clamp(1.5rem, 6vw, 3rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
          }}
        >
          See it in motion.
        </h2>
        <p
          className="mt-3 text-base sm:text-lg max-w-2xl mx-auto"
          style={{ color: 'hsl(215 18% 55%)' }}
        >
          An actual GlobeRide ride — Mont Ventoux, 8× speed, real terrain
          streaming from Cesium ion. No mockups.
        </p>
      </div>

      {/* Globe viewport */}
      <div className="relative z-0 max-w-4xl mx-auto px-4 sm:px-6 lg:px-10">
        <div
          className="relative w-full overflow-hidden rounded-2xl"
          style={{
            height: 'clamp(320px, 60vh, 560px)',
            border: '1px solid hsl(215 26% 14%)',
            boxShadow: '0 0 80px -20px hsl(195 92% 56% / 0.15)',
          }}
        >
          {/* Fallback is always rendered — scene layers on top when ready. */}
          <DemoFallback />

          {showScene && (
            <div className="absolute inset-0" style={{ animation: 'demoFadeIn 0.4s ease-out both' }}>
              <Suspense fallback={null}>
                <LazyDemoRideScene ionToken={token!} />
              </Suspense>
            </div>
          )}
        </div>

        {/* Caption */}
        <p
          className="mt-3 text-center text-xs"
          style={{ color: 'hsl(215 18% 35%)' }}
        >
          Mont Ventoux · Bédoin → Observatory · 21.5 km · 1912 m summit ·
          Autoplay loops continuously
        </p>
      </div>

      <style>{`
        @keyframes demoFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </section>
  );
}
