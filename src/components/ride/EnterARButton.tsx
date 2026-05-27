/**
 * EnterARButton
 *
 * Floating button that appears only when the browser supports immersive-ar.
 * On non-AR browsers (most desktop browsers, iOS Safari) renders nothing —
 * invisible and zero-cost. On AR-capable browsers (Quest 3 Meta Browser,
 * Vision Pro WebXR), shows a glasses icon button.
 *
 * Positioned by Ride.tsx in the top-right cluster, below the EnterVRButton.
 * AR and VR are parallel paths — both buttons can coexist.
 *
 * Distinct from EnterVRButton:
 *   - Uses a Glasses icon (vs MonitorSmartphone for VR)
 *   - Calls enterAR / exitAR (vs enterVR / exitVR)
 *   - Supports optional domOverlayRoot for in-headset HUD compositing
 */

import { useEffect, useState, useCallback } from 'react';
import { Glasses } from 'lucide-react';
import type * as CesiumType from 'cesium';

import { Button } from '@/components/ui/button';
import { detectXR } from '@/lib/webxr/xrCapability';
import { enterAR, exitAR, isInAR, type XRARHandle } from '@/lib/webxr/xrAR';

interface Props {
  /** The active Cesium.Viewer instance — passed from CesiumViewer via Ride.tsx. */
  viewer: CesiumType.Viewer | null;
  /**
   * Optional root element for the WebXR DOM Overlay feature.
   * When provided, the browser composites this element's DOM subtree into the
   * XR frame so the HUD is visible inside the headset (not just the mirror).
   */
  domOverlayRoot?: HTMLElement;
}

export function EnterARButton({ viewer, domOverlayRoot }: Props) {
  const [arSupported, setArSupported] = useState(false);
  const [inAR, setInAR] = useState(false);
  const [pending, setPending] = useState(false);
  const [handle, setHandle] = useState<XRARHandle | null>(null);

  // Detect XR capability once on mount.
  useEffect(() => {
    detectXR().then((cap) => {
      setArSupported(cap.arSupported);
    }).catch(() => {
      setArSupported(false);
    });
  }, []);

  const handleEnter = useCallback(async () => {
    if (!viewer || pending) return;
    setPending(true);
    try {
      const h = await enterAR(viewer, { domOverlayRoot });
      if (h) {
        setHandle(h);
        setInAR(true);
        // Sync back when the headset's system button ends the session.
        h.session.addEventListener('end', () => {
          setInAR(false);
          setHandle(null);
          setPending(false);
        }, { once: true });
      }
    } finally {
      setPending(false);
    }
  }, [viewer, pending, domOverlayRoot]);

  const handleExit = useCallback(async () => {
    if (!handle) return;
    await exitAR(handle);
    setInAR(false);
    setHandle(null);
  }, [handle]);

  // Nothing to show on non-AR browsers.
  if (!arSupported) return null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="outline"
        size="icon"
        aria-label={inAR ? 'Exit AR mode' : 'Enter AR mode'}
        title={inAR ? 'Exit AR' : 'Enter AR (passthrough)'}
        disabled={pending || !viewer}
        onClick={inAR ? handleExit : handleEnter}
        className="rounded-full glass glass-hairline border-transparent h-8 w-8"
      >
        <Glasses className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Synchronous check — true only when isInAR() is true. */
export { isInAR };
