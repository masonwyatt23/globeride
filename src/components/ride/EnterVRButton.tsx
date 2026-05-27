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
import { enterVR, exitVR, isInVR, type XRHandle } from '@/lib/webxr/xrSession';

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
  const [inVR, setInVR] = useState(false);
  const [pending, setPending] = useState(false);
  const [handle, setHandle] = useState<XRHandle | null>(null);

  // Detect XR capability once on mount — invisible result if not supported.
  useEffect(() => {
    detectXR().then((cap) => {
      setVrSupported(cap.vrSupported);
    }).catch(() => {
      setVrSupported(false);
    });
  }, []);

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
    </div>
  );
}

/** Synchronous check — true only when isInVR() is true. Re-exported for VRHud. */
export { isInVR };
