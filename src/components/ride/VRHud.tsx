/**
 * VRHud — Wave 33.A
 *
 * In-VR HUD overlay. Rendered as a Cesium screen-space fixed overlay when a
 * WebXR session is active. Because DOM HTML elements do not render inside XR
 * sessions, this uses a fixed-position fullscreen div that is composited on
 * the flat screen (visible on the external mirror view). In a full Phase 2
 * integration the labels would be rendered as Cesium LabelCollection entities
 * positioned ~1.5 m in front of the headset's gaze direction.
 *
 * Phase 1 implementation notes:
 *   - This overlay renders as a standard DOM overlay on the flat 2D canvas.
 *   - On headsets, this appears on the "social screen" / mirror output.
 *   - True in-headset HTML overlay requires WebXR DOM Overlays feature
 *     (`dom-overlay` in optionalFeatures) — not yet requested in xrSession.ts.
 *   - Phase 2: add `dom-overlay` to optionalFeatures, set
 *     `domOverlay: { root: containerRef.current }` in requestSession options,
 *     and mark this element with position:fixed so it composites in-headset.
 *
 * Renders nothing when not in a VR session.
 */

import { useEffect, useState } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { msToKmh } from '@/lib/utils';

/**
 * Polls isInVR() at 500 ms intervals — lightweight, no RAF overhead.
 * Returns to null render immediately when the session ends.
 */
function useInVRState(): boolean {
  const [inVR, setInVR] = useState(false);

  useEffect(() => {
    // Poll the module-level flag — avoids wiring XRSession events through
    // the component tree just for a boolean.
    const id = setInterval(() => {
      // Dynamic import to avoid circular dep; resolved at runtime.
      import('@/lib/webxr/xrSession').then(({ isInVR }) => {
        setInVR(isInVR());
      }).catch(() => undefined);
    }, 500);
    return () => clearInterval(id);
  }, []);

  return inVR;
}

export function VRHud() {
  const inVR    = useInVRState();
  const speed   = useRideStore((s) => s.speed);
  const power   = useRideStore((s) => s.power);
  const cadence = useRideStore((s) => s.cadence);
  const hr      = useRideStore((s) => s.heartRate);

  if (!inVR) return null;

  const kmh = msToKmh(speed ?? 0).toFixed(1);

  return (
    /*
     * Phase 1: fixed-position overlay visible on the flat mirror output.
     *
     * Phase 2 checklist for true in-headset rendering:
     *   1. Add 'dom-overlay' to optionalFeatures in xrSession.ts requestSession
     *   2. Pass domOverlay: { root: document.getElementById('vr-hud-root') }
     *   3. Mark this element position:fixed (already done)
     *   4. Headset will composite DOM subtree into the XR frame buffer
     */
    <div
      id="vr-hud-root"
      aria-label="VR HUD overlay"
      className="fixed inset-0 pointer-events-none z-[100] flex items-end justify-center"
      style={{ paddingBottom: '6vh' }}
    >
      {/* Curved panel simulation — wide pill centred at the bottom */}
      <div
        className="flex items-center gap-8 px-10 py-5 rounded-[2rem]"
        style={{
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(12px)',
          border: '1.5px solid rgba(255,255,255,0.12)',
          minWidth: '36rem',
          maxWidth: '90vw',
        }}
      >
        <VRMetric label="SPEED" value={kmh} unit="km/h" />
        <VRMetric label="POWER" value={String(power ?? 0)} unit="W" />
        <VRMetric label="CADENCE" value={String(cadence ?? 0)} unit="rpm" />
        <VRMetric label="HR" value={hr != null ? String(hr) : '—'} unit="bpm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: single metric tile
// ---------------------------------------------------------------------------

interface VRMetricProps {
  label: string;
  value: string;
  unit: string;
}

function VRMetric({ label, value, unit }: VRMetricProps) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[5rem]">
      {/* Label — small caps, muted */}
      <span
        style={{
          color: 'rgba(255,255,255,0.55)',
          fontSize: '0.7rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      {/* Value — large, high contrast for legibility at 1.5 m virtual distance */}
      <span
        style={{
          color: '#ffffff',
          fontSize: '2.4rem',
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {/* Unit */}
      <span
        style={{
          color: 'rgba(255,255,255,0.45)',
          fontSize: '0.65rem',
          letterSpacing: '0.08em',
        }}
      >
        {unit}
      </span>
    </div>
  );
}
