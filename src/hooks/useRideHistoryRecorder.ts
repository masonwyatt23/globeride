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
import { useProfileStore } from '@/stores/profileStore';
import { totalDurationSec } from '@/lib/workout';
import type { RideState } from '@/types';
// ADDITIVE: segment leaderboard recording
import { detectSegments, computeSegmentTimes } from '@/lib/segments';
import { useSegmentStore } from '@/stores/segmentStore';
// ADDITIVE: achievement evaluation
import { useAchievementStore } from '@/stores/achievementStore';
import { enqueueAchievementToast } from '@/components/ride/AchievementToast';

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
        const { samples, elapsedMs, route, activeWorkout, workoutElapsedSec, startedAt, replayData } = s;

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

        // Award XP and update lifetime stats in the profile store.
        const workoutCompleted =
          !!activeWorkout &&
          workoutElapsedSec > 0 &&
          workoutElapsedSec >= totalDurationSec(activeWorkout);
        useProfileStore.getState().recordRide({
          distanceM: distanceM,
          ascentM: record.ascentM,
          workoutCompleted,
        });

        // ADDITIVE: evaluate achievements against the post-ride profile snapshot.
        try {
          const rideInput = { distanceM, ascentM: record.ascentM, workoutCompleted };
          const updatedProfile = useProfileStore.getState().profile;
          if (updatedProfile) {
            const newAchievements = useAchievementStore.getState().evaluateRide(updatedProfile, rideInput);
            if (newAchievements.length > 0) {
              enqueueAchievementToast(newAchievements);
            }
          }
        } catch (err) {
          console.warn('[achievements] Failed to evaluate achievements:', err);
        }

        // ADDITIVE: record segment times for the completed ride.
        // Only applies to real route rides (not replays / pure workouts with
        // no route, though those do have a route set so we still track them).
        if (route && samples.length >= 2) {
          try {
            const segments = detectSegments(route);
            const times = computeSegmentTimes(segments, samples);
            const now = Date.now();
            times.forEach((timeSec, segmentId) => {
              useSegmentStore.getState().recordAttempt(segmentId, timeSec, now);
            });
          } catch (err) {
            console.warn('[segments] Failed to record segment times:', err);
          }
        }
      },
    );

    return unsub;
  }, []);
}
