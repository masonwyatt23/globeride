/**
 * VRHud — Wave 33.A / Wave 35.C (Phase 3: DOM overlay HUD)
 *
 * Exports two components:
 *
 * 1. VRHud — original screen-space HUD (Phase 1 fallback). Renders as a
 *    fixed-position div visible on the flat mirror output. Active when in VR
 *    but dom-overlay was NOT granted (Vision Pro Safari, Firefox Reality, etc.).
 *
 * 2. VRHudOverlay — Phase 3 interactive DOM HUD. Always mounted at
 *    `#vr-hud-root` with position:fixed so EnterVRButton can pass the element
 *    to enterVR() before the session starts. Visibility is controlled via
 *    display style (not conditional rendering) so the ref is stable. When
 *    dom-overlay IS granted the compositor renders this subtree in-headset and
 *    it is fully interactive via controller rays / hand-tracking pinch.
 *
 * Fallback hierarchy:
 *   dom-overlay granted     → VRHudOverlay visible, VRHud hidden
 *   dom-overlay NOT granted → VRHud visible (mirror output), VRHudOverlay hidden
 *   Not in VR               → both hidden / null
 */

import { useEffect, useState } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { msToKmh } from '@/lib/utils';
import { getDomOverlayType } from '@/lib/webxr/xrDomOverlay';

// ---------------------------------------------------------------------------
// Shared hook — polls XR session state every 500 ms
// ---------------------------------------------------------------------------

interface VRPollState {
  inVR: boolean;
  overlayType: 'screen' | 'floating' | 'head-locked' | null;
}

function useVRState(): VRPollState {
  const [state, setState] = useState<VRPollState>({ inVR: false, overlayType: null });

  useEffect(() => {
    const id = setInterval(() => {
      import('@/lib/webxr/xrSession').then(({ isInVR, getActiveSession }) => {
        const inVR = isInVR();
        if (!inVR) {
          setState({ inVR: false, overlayType: null });
          return;
        }
        const session = getActiveSession?.();
        const overlayType = session ? getDomOverlayType(session) : null;
        setState({ inVR: true, overlayType });
      }).catch(() => undefined);
    }, 500);
    return () => clearInterval(id);
  }, []);

  return state;
}

// ---------------------------------------------------------------------------
// VRHud — Phase 1 fallback (mirror / screen output, non-interactive)
// ---------------------------------------------------------------------------

export function VRHud() {
  const { inVR, overlayType } = useVRState();
  const speed   = useRideStore((s) => s.speed);
  const power   = useRideStore((s) => s.power);
  const cadence = useRideStore((s) => s.cadence);
  const hr      = useRideStore((s) => s.heartRate);

  // Hide when: not in VR, OR dom-overlay is active (VRHudOverlay takes over).
  if (!inVR || overlayType !== null) return null;

  const kmh = msToKmh(speed ?? 0).toFixed(1);

  return (
    <div
      aria-label="VR HUD overlay (mirror)"
      className="fixed inset-0 pointer-events-none z-[100] flex items-end justify-center"
      style={{ paddingBottom: '6vh' }}
    >
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
        <VRMetric label="SPEED"   value={kmh}                           unit="km/h" />
        <VRMetric label="POWER"   value={String(power   ?? 0)}          unit="W"    />
        <VRMetric label="CADENCE" value={String(cadence ?? 0)}          unit="rpm"  />
        <VRMetric label="HR"      value={hr != null ? String(hr) : '—'} unit="bpm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VRHudOverlay — Phase 3 interactive DOM overlay (in-headset)
// ---------------------------------------------------------------------------

/**
 * Always mounted; visibility toggled via display:none rather than conditional
 * rendering so document.getElementById('vr-hud-root') is always available for
 * EnterVRButton to pass into enterVR() at any point during the ride.
 */
export function VRHudOverlay() {
  const { inVR, overlayType } = useVRState();
  const speed   = useRideStore((s) => s.speed);
  const power   = useRideStore((s) => s.power);
  const cadence = useRideStore((s) => s.cadence);
  const hr      = useRideStore((s) => s.heartRate);

  const visible = inVR && overlayType !== null;
  const kmh = msToKmh(speed ?? 0).toFixed(1);

  return (
    <div
      id="vr-hud-root"
      aria-label="VR HUD overlay (in-headset)"
      aria-hidden={!visible}
      style={{
        // position:fixed required by the dom-overlay spec — the compositor
        // composites relative to the display, not the page scroll position.
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: visible ? 'flex' : 'none',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: '6vh',
        // Allow pointer events so controller rays can interact.
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2rem',
          padding: '1.25rem 2.5rem',
          borderRadius: '2rem',
          background: 'rgba(0,0,0,0.78)',
          backdropFilter: 'blur(14px)',
          border: '1.5px solid rgba(255,255,255,0.14)',
          minWidth: '36rem',
          maxWidth: '90vw',
        }}
      >
        <VRMetric label="SPEED"   value={kmh}                           unit="km/h" />
        <VRMetric label="POWER"   value={String(power   ?? 0)}          unit="W"    />
        <VRMetric label="CADENCE" value={String(cadence ?? 0)}          unit="rpm"  />
        <VRMetric label="HR"      value={hr != null ? String(hr) : '—'} unit="bpm" />
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.25rem',
        minWidth: '5rem',
      }}
    >
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
