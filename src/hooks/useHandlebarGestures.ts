/**
 * useHandlebarGestures — React hook that attaches handlebar gesture detection
 * to a DOM element ref and wires callbacks to rideStore actions.
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useHandlebarGestures(containerRef, { enabled: settings.gestureControlsEnabled });
 *
 * The hook is a no-op when enabled=false or the ref is not yet attached.
 * All gesture callbacks are stable closures that call the Zustand store
 * getState() directly (never stale) so they are safe to define once on mount.
 */

import { useEffect, type RefObject } from 'react';
import { attachGestures } from '@/lib/handlebarGestures';
import { useRideStore } from '@/stores/rideStore';

export interface UseHandlebarGesturesOptions {
  /** Gate — set to false to disable all gestures (e.g. when setting is off). */
  enabled?: boolean;
}

export function useHandlebarGestures(
  ref: RefObject<HTMLElement | null>,
  options: UseHandlebarGesturesOptions = {},
) {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const cleanup = attachGestures(el, {
      // Double-tap → toggle pause / resume.
      onDoubleTap: () => {
        const { rideState, pause, resume } = useRideStore.getState();
        if (rideState === 'running') {
          pause();
        } else if (rideState === 'paused') {
          resume();
        }
      },

      // Long-press → quick-action overlay is rendered by the parent (Ride.tsx).
      // We publish to the store via a toast so the overlay can react.
      onLongPress: () => {
        useRideStore.getState().pushToast({
          id: 'gesture-longpress',
          kind: 'info',
          title: 'Gesture menu',
          message: 'Long-press detected — open quick actions.',
          durationMs: 3_000,
        });
      },

      // Two-finger swipe up/down → adjust ERG target power by ±10 W.
      onTwoFingerSwipeUp: () => {
        const { trainerControlMode, targetPowerW, setTargetPowerW } = useRideStore.getState();
        if (trainerControlMode === 'erg') {
          setTargetPowerW((targetPowerW ?? 0) + 10);
        }
      },

      onTwoFingerSwipeDown: () => {
        const { trainerControlMode, targetPowerW, setTargetPowerW } = useRideStore.getState();
        if (trainerControlMode === 'erg') {
          const next = Math.max(0, (targetPowerW ?? 0) - 10);
          setTargetPowerW(next);
        }
      },
    });

    return cleanup;
  }, [enabled, ref]);
}
