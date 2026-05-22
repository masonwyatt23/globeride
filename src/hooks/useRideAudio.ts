/**
 * useRideAudio — wires the RideAudioEngine to live ride state.
 *
 * Mount this hook inside the Ride screen (alongside useRideLoop). It:
 *   • Starts the engine when rideState becomes 'running' and audio is enabled.
 *   • Updates ambient/effort params every animation frame via a rAF loop.
 *   • Plays chimes on workout-segment transitions and ride finish.
 *   • Fades to silence on pause; resumes on unpause.
 *   • Tears down cleanly when the component unmounts.
 *
 * Autoplay policy compliance:
 *   The AudioContext is created lazily on the first user gesture (the ride
 *   Start button click) — that action already satisfies the browser's policy.
 *   engine.resumeContext() is called whenever audio becomes enabled while the
 *   ride is already running (e.g. user toggles sound on mid-ride).
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useAudioStore } from '@/stores/audioStore';
import { RideAudioEngine } from '@/lib/rideAudio';

export function useRideAudio(): void {
  const engineRef = useRef<RideAudioEngine | null>(null);

  // Ensure we have a single stable engine instance for the component lifetime.
  if (!engineRef.current) {
    engineRef.current = new RideAudioEngine();
  }

  // Track previous workout-segment index so we can detect transitions.
  const prevSegmentRef = useRef<number>(-1);
  // Track whether a finish chime has been played for this ride session.
  const finishChimeFiredRef = useRef(false);
  // Track whether the engine is currently started (to avoid double-start).
  const engineRunningRef = useRef(false);

  useEffect(() => {
    const engine = engineRef.current!;
    let rafId = 0;

    /**
     * rAF loop — runs independently of useRideLoop so audio updates every
     * frame even when useRideLoop's own conditions bail early.
     */
    const frame = () => {
      rafId = requestAnimationFrame(frame);

      const ride = useRideStore.getState();
      const audio = useAudioStore.getState();

      // ── Handle engine start / stop based on ride + audio state ────────────
      if (audio.enabled && ride.rideState === 'running' && !engineRunningRef.current) {
        engine.start();
        engine.resumeContext().catch(() => undefined);
        engineRunningRef.current = true;
      }

      if (!audio.enabled && engineRunningRef.current) {
        engine.stop();
        engineRunningRef.current = false;
        prevSegmentRef.current = -1;
        finishChimeFiredRef.current = false;
        return;
      }

      if (!engineRunningRef.current) return;

      // ── Pause / unpause handling ───────────────────────────────────────────
      if (ride.rideState === 'paused') {
        engine.pause(600);
        return;
      }

      if (ride.rideState === 'finished') {
        if (!finishChimeFiredRef.current) {
          finishChimeFiredRef.current = true;
          engine.playFinishChime();
        }
        engine.pause(2000);
        return;
      }

      if (ride.rideState !== 'running') return;

      // ── Workout-segment change detection ──────────────────────────────────
      if (ride.activeWorkout && ride.workoutRunning) {
        const elapsed = ride.workoutElapsedSec;
        const segments = ride.activeWorkout.segments;
        let cursor = 0;
        let currentSegIdx = 0;
        for (let i = 0; i < segments.length; i++) {
          cursor += segments[i].durationSec;
          if (elapsed < cursor) {
            currentSegIdx = i;
            break;
          }
          currentSegIdx = i;
        }
        if (prevSegmentRef.current !== -1 && currentSegIdx !== prevSegmentRef.current) {
          engine.playSegmentChime();
        }
        prevSegmentRef.current = currentSegIdx;
      }

      // ── Update continuous ambient / effort layers ─────────────────────────
      engine.update({
        speedMs: ride.speed,
        gradePct: ride.grade,
        powerW: ride.power,
        volume: audio.volume,
      });
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      engine.stop();
      engineRunningRef.current = false;
      prevSegmentRef.current = -1;
      finishChimeFiredRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Runs once — engine is a stable ref; state is read via getState().
}
