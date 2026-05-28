/**
 * EnterVRButton (Phase 3: dom-overlay HUD)
 *
 * Floating button that appears only when the browser supports immersive-vr.
 * On non-XR browsers (Safari, Firefox, etc.) renders nothing — invisible and
 * zero-cost. On XR-capable browsers, shows a headset icon button.
 *
 * Positioned by the parent (Ride.tsx) in the top-right cluster, below the
 * CameraSwitcher.
 *
 * Phase 3: passes `document.getElementById('vr-hud-root')` (the VRHudOverlay
 * root element rendered by VRHud.tsx) as the `domOverlayRoot` argument to
 * enterVR(). The XR compositor renders that DOM subtree in-headset when the
 * browser grants the 'dom-overlay' optional feature.
 */

import { useEffect, useState, useCallback } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import type * as CesiumType from 'cesium';

import { Button } from '@/components/ui/button';
import { detectXR } from '@/lib/webxr/xrCapability';
import {
  enterVR,
  exitVR,
  isInVR,
  getLatestXRFrame,
  getLatestXRReferenceSpace,
  type XRHandle,
} from '@/lib/webxr/xrSession';
import { subscribeHandInput } from '@/lib/webxr/xrHandInput';
import { routePinchToHud, updateHudHover } from '@/lib/webxr/xrDomOverlay';

// One-time-tooltip session storage key. Cleared by browser when the tab is
// closed, so it shows once per browsing session (not once-forever).
const HAND_TOOLTIP_SEEN_KEY = 'globeride.xr.handTooltipSeen';

interface Props {
  /** The active Cesium.Viewer instance — passed from CesiumViewer via Ride.tsx. */
  viewer: CesiumType.Viewer | null;
  /**
   * Optional ref to the DOM element that should be rendered as the in-headset
   * HUD via WebXR DOM overlay. Defaults to `document.getElementById('vr-hud-root')`.
   * Pass null to disable dom-overlay for this session.
   */
  hudRootElement?: HTMLElement | null;
}

export function EnterVRButton({ viewer, hudRootElement }: Props) {
  const [vrSupported, setVrSupported] = useState(false);
  const [handTrackingSupported, setHandTrackingSupported] = useState(false);
  const [inVR, setInVR] = useState(false);
  const [pending, setPending] = useState(false);
  const [handle, setHandle] = useState<XRHandle | null>(null);
  const [showHandTooltip, setShowHandTooltip] = useState(false);

  // Detect XR capability once on mount — invisible result if not supported.
  useEffect(() => {
    detectXR().then((cap) => {
      setVrSupported(cap.vrSupported);
      setHandTrackingSupported(cap.handTracking);
    }).catch(() => {
      setVrSupported(false);
      setHandTrackingSupported(false);
    });
  }, []);

  // Phase 4: while in VR, subscribe to hand-input pinches and route them onto
  // the in-headset HUD. The XR RAF loop in xrSession.ts publishes the latest
  // frame for us to read synchronously.
  useEffect(() => {
    if (!inVR || !handle) return;
    const overlayRoot =
      hudRootElement !== undefined
        ? hudRootElement
        : document.getElementById('vr-hud-root');
    if (!overlayRoot) return;

    const unsubscribe = subscribeHandInput(
      handle.session,
      getLatestXRReferenceSpace(),
      () => getLatestXRFrame(),
      {
        onPinchStart: (event) => {
          routePinchToHud(overlayRoot, event.ray);
        },
        onHover: (event) => {
          updateHudHover(overlayRoot, event.ray);
        },
      },
    );
    return unsubscribe;
  }, [inVR, handle, hudRootElement]);

  // Phase 4: show the one-time pinch tooltip the first time we detect hand
  // tracking in an active session. sessionStorage scopes it to the current
  // browsing session so headset-only users don't see it on every entry.
  useEffect(() => {
    if (!inVR || !handTrackingSupported) return;
    try {
      if (sessionStorage.getItem(HAND_TOOLTIP_SEEN_KEY) === '1') return;
      sessionStorage.setItem(HAND_TOOLTIP_SEEN_KEY, '1');
    } catch {
      // sessionStorage unavailable (rare; e.g. some private modes) — fall
      // through and show the tooltip anyway.
    }
    setShowHandTooltip(true);
    const id = window.setTimeout(() => setShowHandTooltip(false), 6000);
    return () => window.clearTimeout(id);
  }, [inVR, handTrackingSupported]);

  const handleEnter = useCallback(async () => {
    if (!viewer || pending) return;
    setPending(true);
    // Phase 3: resolve the HUD root — use the passed ref, fall back to the
    // well-known id that VRHudOverlay renders into, or null (disables overlay).
    const domOverlayRoot =
      hudRootElement !== undefined
        ? hudRootElement
        : document.getElementById('vr-hud-root');
    try {
      const h = await enterVR(viewer, domOverlayRoot);
      if (h) {
        setHandle(h);
        setInVR(true);
        // When the headset's system button ends the session, sync back.
        h.session.addEventListener('end', () => {
          setInVR(false);
          setHandle(null);
          setPending(false);
        }, { once: true });
      }
    } finally {
      setPending(false);
    }
  }, [viewer, pending, hudRootElement]);

  const handleExit = useCallback(async () => {
    if (!handle) return;
    await exitVR(handle);
    setInVR(false);
    setHandle(null);
  }, [handle]);

  // Nothing to show on non-XR browsers.
  if (!vrSupported) return null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="outline"
        size="icon"
        aria-label={inVR ? 'Exit VR mode' : 'Enter VR mode'}
        title={inVR ? 'Exit VR' : 'Enter VR'}
        disabled={pending || !viewer}
        onClick={inVR ? handleExit : handleEnter}
        className="rounded-full glass glass-hairline border-transparent h-8 w-8"
      >
        <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {showHandTooltip && (
        <div
          role="status"
          aria-live="polite"
          className="glass glass-hairline rounded-md px-3 py-1.5 text-[11px] text-foreground/85 shadow-sm"
        >
          Pinch any HUD button to tap.
        </div>
      )}
    </div>
  );
}

/** Synchronous check — true only when isInVR() is true. Re-exported for VRHud. */
export { isInVR };
