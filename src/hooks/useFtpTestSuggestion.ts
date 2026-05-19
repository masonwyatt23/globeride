/**
 * useFtpTestSuggestion — surfaces a "Set FTP to N W?" action after an FTP
 * test ride finishes.
 *
 * Watches `rideState` → 'finished'. If the active workout was one of the two
 * preset FTP tests (identified by id), estimates FTP from the ride samples and
 * pushes a persistent toast with a CTA that writes settingsStore.ftpW.
 *
 * Mount alongside useRideHistoryRecorder in Ride.tsx with a single call:
 *   useFtpTestSuggestion();
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  estimateFtpFromSamples,
  ftpTestKindFromWorkoutId,
} from '@/lib/ftpTest';
import type { RideState } from '@/types';

export function useFtpTestSuggestion(): void {
  const shownRef = useRef(false);
  const prevStateRef = useRef<RideState>('idle');

  useEffect(() => {
    const unsub = useRideStore.subscribe((state) => {
      const rideState = state.rideState;
      const prev = prevStateRef.current;
      prevStateRef.current = rideState;

      if (rideState !== 'finished') {
        if (shownRef.current) shownRef.current = false;
        return;
      }
      // Only fire on the transition, not on every subscriber call while finished.
      if (prev === 'finished') return;
      if (shownRef.current) return;
      shownRef.current = true;

        const s = useRideStore.getState();
        const workoutId = s.activeWorkout?.id;
        if (!workoutId) return;

        const kind = ftpTestKindFromWorkoutId(workoutId);
        if (!kind) return;

        const estimatedFtp = estimateFtpFromSamples(s.samples, kind);
        if (!estimatedFtp || estimatedFtp <= 0) return;

        const currentFtp = useSettingsStore.getState().ftpW;
        const diff = estimatedFtp - currentFtp;
        const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

        s.pushToast({
          id: 'ftp-suggestion',
          kind: 'success',
          title: `FTP estimate: ${estimatedFtp} W (${diffStr} W)`,
          message: 'Tap "Set FTP" to update your training zones.',
          durationMs: null, // sticky until dismissed
          action: {
            label: `Set FTP to ${estimatedFtp} W`,
            onClick: () => {
              useSettingsStore.getState().setSettings({ ftpW: estimatedFtp });
              // Toaster auto-dismisses after action onClick, so nothing more needed.
            },
          },
        });
      },
    );

    return unsub;
  }, []);
}
