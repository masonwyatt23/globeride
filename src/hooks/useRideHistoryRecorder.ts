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
// ADDITIVE: World Tour stage detection (static import — no async needed)
import { WORLD_TOUR_STAGES } from '@/lib/worldTourStages';

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

        // ── Wave 17-23 extra ride metadata ──────────────────────────────────
        // Draft seconds: accumulated via _rideDraftSec on the ride store when
        // the draft-accumulator extension is present; otherwise 0.
        const draftSec: number = (s as { _rideDraftSec?: number })._rideDraftSec ?? 0;

        // Bots: rider beat all bots when all bot distances are behind the rider.
        const paceBots = s.paceBots ?? [];
        const beatAllBots =
          paceBots.length > 0 &&
          paceBots.every((bot) => bot.state.distance < s.distance);

        // World Tour stage: synchronous check against statically-imported catalog.
        const isWorldTourStage = route
          ? WORLD_TOUR_STAGES.some((wts) => wts.route.id === route.id)
          : false;

        // Companion opened: flag set by useCompanionReceiver during this session.
        const companionOpenedThisRide: boolean =
          (s as { _companionOpenedThisRide?: boolean })._companionOpenedThisRide ?? false;

        // Mood: set by CesiumViewer/RideStore extension when available.
        const mood: string | undefined =
          (s as { _activeMood?: string })._activeMood;

        const rideInput = {
          distanceM,
          ascentM: record.ascentM,
          workoutCompleted,
          draftSec,
          beatAllBots,
          isWorldTourStage,
          companionOpenedThisRide,
          mood,
        };

        useProfileStore.getState().recordRide(rideInput);

        // ADDITIVE: evaluate achievements against the post-ride profile snapshot.
        try {
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
