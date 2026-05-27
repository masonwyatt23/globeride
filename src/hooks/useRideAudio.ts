/**
 * useRideAudio — wires the RideAudioEngine + ProceduralRideAudioEngine to live ride state.
 *
 * Mount this hook inside the Ride screen (alongside useRideLoop). It:
 *   • Starts the existing RideAudioEngine (ambient wind/road/drone) when rideState
 *     becomes 'running' and audio is enabled.
 *   • Starts the ProceduralRideAudioEngine (chain noise, road rumble, brake squeal,
 *     gear-shift clicks) when rideState becomes 'running' and rideAudioEnabled is true.
 *   • Updates both engines each animation frame.
 *   • Plays chimes on workout-segment transitions and ride finish.
 *   • Fades to silence on pause; resumes on unpause.
 *   • Tears down cleanly when the component unmounts.
 *
 * Autoplay policy compliance:
 *   Both AudioContexts are created lazily on the first user gesture (the ride
 *   Start button click) — that action already satisfies the browser's policy.
 *   engine.resumeContext() is called whenever audio becomes enabled while the
 *   ride is already running (e.g. user toggles sound on mid-ride).
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useAudioStore } from '@/stores/audioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { RideAudioEngine } from '@/lib/rideAudio';
import { createRideAudioEngine } from '@/lib/audio/proceduralRideAudio';
import type { ProceduralRideAudioEngine } from '@/lib/audio/proceduralRideAudio';

export function useRideAudio(): void {
  // Lazy-initialise inside the ref so we never allocate during render
  // (avoids a dangling AudioContext on React StrictMode's double-invoke).
  const engineRef = useRef<RideAudioEngine | null>(null);
  function getEngine(): RideAudioEngine {
    if (!engineRef.current) engineRef.current = new RideAudioEngine();
    return engineRef.current;
  }

  // Procedural engine ref — created once, on first use.
  const procEngineRef = useRef<ProceduralRideAudioEngine | null | undefined>(undefined);
  function getProcEngine(): ProceduralRideAudioEngine | null {
    if (procEngineRef.current === undefined) {
      procEngineRef.current = createRideAudioEngine();
    }
    return procEngineRef.current;
  }

  // Track previous workout-segment index so we can detect transitions.
  const prevSegmentRef = useRef<number>(-1);
  // Track whether a finish chime has been played for this ride session.
  const finishChimeFiredRef = useRef(false);
  // Track whether the ambient engine is currently started (to avoid double-start).
  const engineRunningRef = useRef(false);
  // Track whether the procedural engine is currently started.
  const procRunningRef = useRef(false);

  useEffect(() => {
    const engine = getEngine();
    let rafId = 0;

    /**
     * rAF loop — runs independently of useRideLoop so audio updates every
     * frame even when useRideLoop's own conditions bail early.
     */
    const frame = () => {
      rafId = requestAnimationFrame(frame);

      const ride    = useRideStore.getState();
      const audio   = useAudioStore.getState();
      const settings = useSettingsStore.getState();

      // ── Ambient engine: start / stop based on ride + audio state ──────────
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

      // ── Procedural engine: start / stop ────────────────────────────────────
      const procEngine = getProcEngine();
      if (procEngine) {
        if (settings.rideAudioEnabled && ride.rideState === 'running' && !procRunningRef.current) {
          procEngine.start();
          procRunningRef.current = true;
          // Sync initial volume from settings (0-100 → 0-0.7 clamped inside setMasterVolume).
          procEngine.setMasterVolume(settings.rideAudioVolume / 100);
        }

        if (!settings.rideAudioEnabled && procRunningRef.current) {
          procEngine.stop();
          procRunningRef.current = false;
        }
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
        const elapsed  = ride.workoutElapsedSec;
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

      // ── Update ambient / effort layers ────────────────────────────────────
      engine.update({
        speedMs:  ride.speed,
        gradePct: ride.grade,
        powerW:   ride.power,
        volume:   audio.volume,
      });

      // ── Update procedural layers ───────────────────────────────────────────
      if (procEngine && procRunningRef.current) {
        // Sync volume every frame so slider changes take effect immediately.
        procEngine.setMasterVolume(settings.rideAudioVolume / 100);
        procEngine.updateFromRideState({
          speedMs:     ride.speed,
          cadenceRpm:  ride.cadence,
          powerW:      ride.power,
          // brakeAmount is not yet exposed in rideStore — omit (treated as 0).
        });
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      engine.stop();
      engineRunningRef.current = false;
      prevSegmentRef.current = -1;
      finishChimeFiredRef.current = false;

      // Tear down procedural engine.
      const procEngine = procEngineRef.current;
      if (procEngine && procRunningRef.current) {
        procEngine.stop();
      }
      procRunningRef.current = false;
      // Do not null-out procEngineRef — stop() suspends but doesn't destroy;
      // the ref is cleaned up when the component fully unmounts (GC handles it).
    };
  }, []); // Runs once — engines are stable refs; state is read via getState().
}
