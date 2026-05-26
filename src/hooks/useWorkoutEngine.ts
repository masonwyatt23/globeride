/**
 * useWorkoutEngine — requestAnimationFrame loop that drives a structured workout.
 *
 * Mutual exclusion contract:
 *   - When `activeWorkout` is non-null AND `rideState === 'running'`,
 *     this hook sets `workoutRunning = true` and takes over from useRideLoop.
 *   - useRideLoop bails early when `workoutRunning === true` (see the guard
 *     added there).
 *   - useReplayLoop is already guarded on `replayData !== null`, which is
 *     mutually exclusive with a workout session.
 *
 * Each frame this hook:
 *   1. Advances `workoutElapsedSec` by dt.
 *   2. Calls `segmentAt(workout, elapsed)` to find the current segment.
 *   3. Calls `resolveTargetWatts(seg, elapsed, ftpW)` to get the ERG target.
 *   4a. If target is watts/ftpPct/rampPct → ERG mode:
 *         - Connected trainer: setTrainerControlMode('erg') + setTargetPower(watts) throttled ~1 Hz.
 *         - Demo mode: solveVelocity(targetWatts, grade, rider) for realistic speed.
 *   4b. If target is grade → sim mode: setTrainerControlMode('sim') + setSimulationParams.
 *   4c. If target is free → no trainer control; reuse demo/trainer speed as-is.
 *   5. Calls `tick()` with the computed speed/power/position so telemetry is
 *      recorded and the FIT export includes the full structured effort.
 *
 * When the workout finishes (segmentAt returns null) it calls store.finish().
 *
 * FTMS ERG note:
 *   This hook imports from '@/lib/ftmsErg' which provides setTargetPower and
 *   setTrainerControlMode. Those functions are shims — if the parallel agent
 *   adds them directly to ftms.ts, update the import path; no other changes needed.
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gradientAt, EmaSmoother, elevationAt } from '@/lib/gradientCalculator';
import { sampleRouteAtDistance } from '@/lib/gpxParser';
import { solveVelocity, ftmsCrr, ftmsCw, type RiderParams } from '@/lib/physics';
import { segmentAt, resolveTargetWatts } from '@/lib/workout';
import {
  setTargetPower,
  setTrainerControlMode,
  setSimulationParams,
  hasFtmsControlWriter,
} from '@/lib/ftmsErg';
import {
  detectAndSpeakCue,
  createVoiceCueState,
  type VoiceCueState,
} from '@/lib/workoutVoiceCues';

export function useWorkoutEngine(): void {
  const store = useRideStore;
  const lastT = useRef<number>(0);
  const lastSentT = useRef<number>(0);
  const lastSampleT = useRef<number>(0);
  const smoother = useRef(new EmaSmoother(0.18));
  // Track whether we've set workoutRunning=true so we can clean up on unmount.
  const engineActive = useRef(false);
  // Voice cue state — persists across frames so repeat-fire guards work.
  const voiceCueStateRef = useRef<VoiceCueState>(createVoiceCueState());

  useEffect(() => {
    let raf = 0;

    const frame = (tHigh: number) => {
      raf = requestAnimationFrame(frame);

      const s = store.getState();

      // Only active when a workout is bound and the ride is running.
      if (!s.activeWorkout || !s.route || s.rideState !== 'running') {
        // If we were previously active, turn off the workoutRunning flag.
        if (engineActive.current) {
          store.setState({ workoutRunning: false });
          engineActive.current = false;
        }
        lastT.current = tHigh;
        return;
      }

      // Take ownership: mark workoutRunning so useRideLoop backs off.
      if (!engineActive.current) {
        store.setState({ workoutRunning: true });
        engineActive.current = true;
      }

      const dt = lastT.current === 0 ? 0 : Math.min(0.1, (tHigh - lastT.current) / 1000);
      lastT.current = tHigh;
      if (dt <= 0) return;

      // Advance elapsed time in store (drives WorkoutHUD) then read back the
      // committed value so segmentAt and the HUD always see the same number.
      s.advanceWorkoutElapsed(dt);
      const elapsedSec = useRideStore.getState().workoutElapsedSec;

      // ---- Resolve current segment ----
      const cursor = segmentAt(s.activeWorkout, elapsedSec);
      if (cursor === null) {
        // Workout complete.
        store.setState({ workoutRunning: false, workoutTargetWatts: null });
        engineActive.current = false;
        s.finish();
        return;
      }

      const settings = useSettingsStore.getState();
      const ftpW = settings.ftpW;
      const rider: RiderParams = {
        riderMassKg: settings.riderMassKg,
        bikeMassKg: settings.bikeMassKg,
        bikeType: settings.bikeType,
        riderPosition: settings.riderPosition,
        drivetrainEff: settings.drivetrainEff,
        rho: settings.rho,
        windSpeedMs: settings.windSpeedMs,
        windDirectionDeg: settings.windDirectionDeg,
      };

      // ---- Compute route position ----
      const distanceNow = s.distance;
      const sampled = sampleRouteAtDistance(s.route, distanceNow);
      const rawGrade = gradientAt(s.route, distanceNow);
      const grade = smoother.current.push(rawGrade);

      // ---- Resolve target and drive trainer ----
      const targetW = resolveTargetWatts(cursor.segment, cursor.elapsedInSegmentSec, ftpW);
      const seg = cursor.segment;
      const now = Date.now();
      const shouldSend = now - lastSentT.current > 850;

      let speed: number;
      let power: number | null;
      const cadence: number | null = s.cadence || null;
      const hr: number | null = s.heartRate;

      if (seg.target.type === 'grade') {
        // Simulation mode — push grade to trainer (same as free ride).
        setTrainerControlMode('sim');
        if (s.connection === 'connected' && shouldSend) {
          lastSentT.current = now;
          store.setState({ lastSentGrade: seg.target.gradePct });
          const headwindMs =
            settings.windSpeedMs * Math.cos((settings.windDirectionDeg * Math.PI) / 180);
          setSimulationParams({
            gradePct: seg.target.gradePct,
            windMs: headwindMs,
            crrScaled: ftmsCrr(rider),
            cwScaled: ftmsCw(rider),
          }).catch(() => undefined);
        }
        // Speed: use trainer speed when connected; fall back to demo physics on grade.
        if (s.mode === 'trainer' && s.speed > 0) {
          speed = s.speed;
          power = s.power || null;
        } else {
          speed = solveVelocity(settings.demoPowerW, seg.target.gradePct, rider);
          power = settings.demoPowerW;
        }
        store.setState({ workoutTargetWatts: null });

      } else if (seg.target.type === 'free') {
        // Free ride — no trainer control; ride as normal.
        setTrainerControlMode('sim');
        if (s.mode === 'trainer' && s.speed > 0) {
          speed = s.speed;
          power = s.power || null;
        } else {
          speed = solveVelocity(settings.demoPowerW, grade, rider);
          power = settings.demoPowerW;
        }
        store.setState({ workoutTargetWatts: null });

      } else {
        // ERG mode — targetW is non-null here (watts / ftpPct / rampPct).
        setTrainerControlMode('erg');
        const ergW = targetW!; // resolveTargetWatts returns non-null for these types

        if (s.connection === 'connected' && hasFtmsControlWriter() && shouldSend) {
          lastSentT.current = now;
          setTargetPower(ergW).catch(() => undefined);
        }

        store.setState({ workoutTargetWatts: ergW });

        // Speed: if trainer is reporting speed, use it; otherwise solve from ERG target.
        if (s.mode === 'trainer' && s.speed > 0) {
          speed = s.speed;
          power = s.power > 0 ? s.power : ergW;
        } else {
          // Demo mode: solve velocity at the ERG target power + current grade.
          speed = solveVelocity(ergW, grade, rider);
          power = ergW;
        }
      }

      // ---- Sample telemetry at 1 Hz ----
      const recordSample = now - lastSampleT.current >= 1000;
      if (recordSample) lastSampleT.current = now;

      s.tick({
        now,
        dt,
        gradeNow: grade,
        elevationNow: elevationAt(s.route, distanceNow),
        speedNow: speed,
        positionNow: { lat: sampled.lat, lon: sampled.lon },
        recordSample,
        cadenceNow: cadence,
        powerNow: power,
        heartRateNow: hr,
      });

      // ---- Workout voice cues ----
      // Only fire while a workout is actively running. The commentator in
      // useRideLoop bails when workoutRunning===true, so there is no TTS
      // competition between the two systems.
      detectAndSpeakCue(
        cursor.segment,
        cursor.next,
        cursor.elapsedInSegmentSec,
        cursor.segment.durationSec,
        voiceCueStateRef.current,
        {
          workoutVoiceCuesEnabled: settings.workoutVoiceCuesEnabled,
          commentaryVolume: settings.commentaryVolume,
          commentaryRate: settings.commentaryRate,
        },
      );
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      // Reset refs so a fresh mount starts clean.
      lastT.current = 0;
      lastSentT.current = 0;
      lastSampleT.current = 0;
      // Reset voice cue state so the next ride starts fresh.
      voiceCueStateRef.current = createVoiceCueState();
      // Ensure workoutRunning is cleared on unmount.
      if (engineActive.current) {
        useRideStore.setState({ workoutRunning: false });
        engineActive.current = false;
      }
    };
  }, [store]);
}
