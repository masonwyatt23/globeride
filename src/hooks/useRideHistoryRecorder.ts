/**
 * useRideHistoryRecorder — auto-saves a completed ride to IndexedDB.
 *
 * Watches `rideState` in the ride store. When the state transitions to
 * 'finished', saves the ride once (guarded against double-save with a ref).
 * Skips rides shorter than 30 seconds or with fewer than 1 sample.
 *
 * Mount in Ride.tsx with a single call — no props needed:
 *   useRideHistoryRecorder();
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import {
  saveRide,
  rideId,
  computeAvgPower,
  computeAvgSpeed,
  computeAscentM,
} from '@/lib/rideHistory';
import type { RideState } from '@/types';

const MIN_DURATION_SEC = 30;

export function useRideHistoryRecorder(): void {
  const savedRef = useRef(false);
  const prevStateRef = useRef<RideState>('idle');

  useEffect(() => {
    // Zustand 5 subscribe takes a single listener receiving full state.
    // We track the previous rideState ourselves to detect transitions.
    const unsub = useRideStore.subscribe((state) => {
      const rideState = state.rideState;
      const prev = prevStateRef.current;
      prevStateRef.current = rideState;

      if (rideState !== 'finished') {
        // Reset the guard whenever we leave 'finished' (e.g. user clicks New Ride).
        if (savedRef.current) savedRef.current = false;
        return;
      }

      // Only act on the transition into 'finished', not on every re-render.
      if (prev === 'finished') return;

      // Already saved this finish event.
      if (savedRef.current) return;
      savedRef.current = true;

        const s = useRideStore.getState();
        const { samples, elapsedMs, route, activeWorkout, startedAt, replayData } = s;

        // Skip trivially short rides.
        if (elapsedMs / 1000 < MIN_DURATION_SEC) return;
        if (samples.length < 1) return;

        const durationSec = Math.round(elapsedMs / 1000);
        const distanceM = samples.length > 0
          ? (samples[samples.length - 1].distance ?? 0)
          : 0;

        const name =
          activeWorkout?.name ??
          route?.name ??
          (replayData ? 'Replay' : 'Ride') +
            ` — ${new Date(startedAt ?? Date.now()).toLocaleDateString()}`;

        let source: 'route' | 'workout' | 'replay' = 'route';
        if (replayData) source = 'replay';
        else if (activeWorkout) source = 'workout';

        const record = {
          id: rideId(),
          name,
          startedAt: startedAt ?? Date.now() - elapsedMs,
          durationSec,
          distanceM,
          ascentM: computeAscentM(samples),
          avgPower: computeAvgPower(samples),
          avgSpeed: computeAvgSpeed(samples),
          sampleCount: samples.length,
          workoutName: activeWorkout?.name,
          samples: [...samples], // snapshot so the store can be reset freely
          source,
        };

        saveRide(record).catch((err) => {
          console.warn('[rideHistory] Failed to save ride:', err);
        });
      },
    );

    return unsub;
  }, []);
}
