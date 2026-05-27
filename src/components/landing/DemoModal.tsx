/**
 * DemoModal — "Watch the demo" modal for the GlobeRide landing page.
 *
 * Opens a full-screen (mobile) / 720×480 (desktop) modal that embeds a
 * focused DemoRideScene running immediately — no token prompt.
 *
 * A11y:
 *   - role="dialog" + aria-modal="true" + aria-label
 *   - Focus trap: Tab/Shift+Tab cycles only within the modal while open
 *   - Escape closes
 *   - Body scroll-locked while open (overflow:hidden on <body>)
 *   - Click outside (backdrop) closes
 *
 * If no Cesium ion token is available (or WebGL/hardware gates fail),
 * the DemoFallback SVG is shown instead.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  hasSufficientHardware,
  isWebGLAvailable,
  resolveIonToken,
} from './HeroVisual';

// ---------------------------------------------------------------------------
// Lazy DemoRideScene — same dynamic import chunk as DemoRideSection.
// ---------------------------------------------------------------------------
const LazyDemoRideScene = lazy(() =>
  import('./DemoRideScene').then((m) => ({ default: m.DemoRideScene })),
);

// ---------------------------------------------------------------------------
// Static fallback shown when Cesium gates fail.
// ---------------------------------------------------------------------------
function DemoModalFallback() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      aria-hidden
      style={{ background: 'hsl(220 42% 6%)' }}
    >
      <svg
        viewBox="0 0 720 480"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="mgGlobeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(210 60% 16%)" />
            <stop offset="100%" stopColor="hsl(220 42% 4%)" />
          </radialGradient>
          <radialGradient id="mgAtmos" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="transparent" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.14" />
          </radialGradient>
          <filter id="mgGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="mgRouteGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(158 80% 42%)" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Globe */}
        <circle cx="360" cy="240" r="195" fill="url(#mgGlobeGrad)" />
        <circle cx="360" cy="240" r="195" fill="url(#mgAtmos)" />
        <circle cx="360" cy="240" r="195" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.2" fill="none" />

        {/* Latitude lines */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const y = 240 - (lat / 90) * 195;
          const halfW = Math.sqrt(Math.max(0, 195 * 195 - (y - 240) * (y - 240)));
          return (
            <line
              key={lat}
              x1={360 - halfW} y1={y}
              x2={360 + halfW} y2={y}
              stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.12"
            />
          );
        })}

        {/* Mont Ventoux route arc */}
        <path
          d="M 255 295 C 280 278, 310 255, 342 228 S 392 200, 435 180"
          stroke="url(#mgRouteGrad)"
          strokeWidth="3.5"
          fill="none"
          filter="url(#mgGlow)"
          strokeLinecap="round"
        />

        {/* Summit rider dot */}
        <circle cx="435" cy="180" r="7" fill="#22d3ee" opacity="0.95" filter="url(#mgGlow)" />
        <circle
          cx="435" cy="180" r="14"
          fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeOpacity="0.4"
          style={{ animation: 'mgPulse 2s ease-in-out infinite' }}
        />

        {/* Base dot */}
        <circle cx="255" cy="295" r="5" fill="hsl(158 80% 42%)" opacity="0.8" />

        {/* Labels */}
        <text x="435" y="163" textAnchor="middle" fill="#22d3ee" fontSize="12" fontFamily="system-ui, sans-serif" opacity="0.8">
          1912 m
        </text>
        <text x="242" y="314" textAnchor="middle" fill="hsl(215 18% 55%)" fontSize="11" fontFamily="system-ui, sans-serif" opacity="0.7">
          Bédoin
        </text>
        <text x="360" y="440" textAnchor="middle" fill="hsl(215 18% 45%)" fontSize="13" fontFamily="system-ui, sans-serif">
          Mont Ventoux · 21.5 km · 1617 m ascent
        </text>
        <text x="360" y="462" textAnchor="middle" fill="hsl(215 18% 32%)" fontSize="11" fontFamily="system-ui, sans-serif">
          Install GlobeRide or open in Chrome/Edge to see the live 3D demo
        </text>
      </svg>
      <style>{`
        @keyframes mgPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.1; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface DemoModalProps {
  open: boolean;
  onClose: () => void;
  /** Test overrides — mirror HeroVisual pattern */
  _tokenOverride?: string | null;
  _webglOverride?: boolean;
  _hardwareOverride?: boolean;
}

// ---------------------------------------------------------------------------
// Focus-trap helper — returns all focusable elements inside a container.
// ---------------------------------------------------------------------------
const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableEls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
}

// ---------------------------------------------------------------------------
// DemoModal
// ---------------------------------------------------------------------------
export function DemoModal({
  open,
  onClose,
  _tokenOverride,
  _webglOverride,
  _hardwareOverride,
}: DemoModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Resolve Cesium gates once.
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

  // Body scroll lock.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus management: move focus into modal on open, restore on close.
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    // Small rAF to let the DOM paint before we query focusable children.
    const raf = requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      previousFocus?.focus?.();
    };
  }, [open]);

  // Keyboard: Escape closes; Tab traps focus.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const els = getFocusableEls(dialogRef.current);
        if (els.length === 0) { e.preventDefault(); return; }
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  // Click outside (on backdrop) closes.
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    // Backdrop overlay
    <div
      ref={overlayRef}
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6"
      style={{ background: 'hsl(220 42% 2% / 0.88)', backdropFilter: 'blur(6px)' }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="GlobeRide live demo — Mont Ventoux"
        className="relative flex flex-col w-full h-full sm:h-auto sm:w-auto sm:rounded-2xl overflow-hidden"
        style={{
          maxWidth: '720px',
          maxHeight: '100dvh',
          background: 'hsl(220 42% 5%)',
          border: '1px solid hsl(215 26% 14%)',
          boxShadow: '0 0 100px -20px hsl(195 92% 56% / 0.25), 0 40px 80px -20px hsl(220 42% 2% / 0.8)',
        }}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid hsl(215 26% 12%)' }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ background: 'hsl(195 92% 56% / 0.1)', color: '#22d3ee', border: '1px solid hsl(195 92% 56% / 0.22)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" aria-hidden />
              Live demo
            </span>
            <span className="text-xs" style={{ color: 'hsl(215 18% 40%)' }}>
              Mont Ventoux · 8× speed
            </span>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close demo"
            className="flex items-center justify-center rounded-full transition-colors duration-150"
            style={{
              width: '2rem',
              height: '2rem',
              background: 'hsl(220 42% 10%)',
              border: '1px solid hsl(215 26% 18%)',
              color: 'hsl(215 18% 55%)',
              cursor: 'pointer',
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Scene viewport */}
        <div
          className="relative w-full"
          style={{ height: 'clamp(280px, 56vw, 480px)' }}
        >
          {/* Fallback always present; scene overlays it */}
          <DemoModalFallback />

          {canShowScene && token && (
            <div
              className="absolute inset-0"
              style={{ animation: 'demoModalFadeIn 0.35s ease-out both' }}
            >
              <Suspense fallback={null}>
                <LazyDemoRideScene ionToken={token} />
              </Suspense>
            </div>
          )}
        </div>

        {/* Footer caption */}
        <div
          className="px-4 py-2.5 shrink-0 text-center text-xs"
          style={{
            borderTop: '1px solid hsl(215 26% 10%)',
            color: 'hsl(215 18% 38%)',
            background: 'hsl(220 42% 4%)',
          }}
        >
          8× speed · Mont Ventoux (Bédoin → Observatory) · 21.5 km · 1912 m summit · Loops continuously
        </div>
      </div>

      <style>{`
        @keyframes demoModalFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
