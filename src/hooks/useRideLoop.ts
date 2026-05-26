import { useEffect, useRef, type RefObject } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gradientAt, EmaSmoother, elevationAt } from '@/lib/gradientCalculator';
import { sampleRouteAtDistance } from '@/lib/gpxParser';
import { solveVelocity, ftmsCrr, ftmsCw, type RiderParams } from '@/lib/physics';
import {
  setSimulationParams,
  setTargetPower,
  getTrainerControlMode,
} from '@/lib/ftms';
import { gpsToGradePct, shouldAutoPause, distanceMeters } from '@/lib/outdoorGps';
import { estimatePowerFromGps } from '@/lib/outdoorPower';
import type { GpsSample } from '@/lib/outdoorGps';
import {
  detectTriggers,
  pickAndGenerate,
  createCommentatorState,
  type CommentatorState,
  type RideSnapshot,
} from '@/lib/ai/commentator';
import { speakLine, cancelSpeech, pickPreferredVoice } from '@/lib/speechSynthesis';

/**
 * The heart of GlobeRide: a requestAnimationFrame loop that advances the
 * rider along the route, computes live gradient, pushes it to the trainer at
 * a throttled rate, and records telemetry samples at 1 Hz.
 *
 * In Demo Mode it feeds the full cycling-power equation (gravity + rolling +
 * aero + drivetrain + wind) so the simulated speed responds realistically to
 * the user's bike/position/wind/weight settings.
 */
export function useRideLoop(outdoorSamplesRef?: RefObject<GpsSample[]>): void {
  const store = useRideStore;
  const lastT = useRef<number>(0);
  const lastSentT = useRef<number>(0);
  const lastSampleT = useRef<number>(0);
  const smoother = useRef(new EmaSmoother(0.18));

  // ---- Commentator state (persists across frames) ----
  const commentatorStateRef = useRef<CommentatorState>(createCommentatorState());
  /** True while a pickAndGenerate() call is in-flight (prevents double-firing). */
  const commentatorBusyRef = useRef(false);

  useEffect(() => {
    let raf = 0;

    const frame = (tHigh: number) => {
      raf = requestAnimationFrame(frame);

      const s = store.getState();
      // Replay loop handles frames when replayData is present — bail out here.
      // Workout engine handles frames when a workout is running — bail out here too.
      // Outdoor rides don't require a pre-loaded route — route is built live.
      if (s.replayData || s.workoutRunning || s.rideState !== 'running') {
        lastT.current = tHigh;
        return;
      }
      if (!s.route && s.rideMode !== 'outdoor') {
        lastT.current = tHigh;
        return;
      }

      const dt = lastT.current === 0 ? 0 : Math.min(0.1, (tHigh - lastT.current) / 1000);
      lastT.current = tHigh;
      if (dt <= 0) return;

      const distanceNow = s.distance;
      // For outdoor rides the route may not exist yet — use safe defaults.
      const sampled = s.route
        ? sampleRouteAtDistance(s.route, distanceNow)
        : { lat: 0, lon: 0, ele: 0 };
      const rawGrade = s.route ? gradientAt(s.route, distanceNow) : 0;
      const grade = smoother.current.push(rawGrade);

      const settings = useSettingsStore.getState();
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

      // ---- Determine speed source ----
      let speed: number;
      let power: number | null;
      let positionOverride: { lat: number; lon: number } | null = null;
      let elevationOverride: number | null = null;
      const cadence: number | null = s.mode === 'trainer' ? s.cadence || null : 78;
      const hr: number | null = s.heartRate;

      if (s.rideMode === 'outdoor') {
        // Outdoor GPS mode: speed and position come from GPS, power is estimated.
        const gpsSamples = outdoorSamplesRef?.current ?? [];

        // Auto-pause: if the rider appears stationary, bail without advancing.
        if (shouldAutoPause(gpsSamples)) {
          lastT.current = tHigh;
          return;
        }

        const latestGps = gpsSamples[gpsSamples.length - 1] ?? null;
        const prevGps = gpsSamples.length >= 2 ? gpsSamples[gpsSamples.length - 2] : null;

        if (latestGps) {
          speed = latestGps.speedMs ?? 0;
          if (prevGps) {
            // Compute grade from consecutive GPS samples.
            const rawGpsGrade = gpsToGradePct(prevGps, latestGps);
            // Smooth the GPS grade through the same EMA smoother.
            smoother.current.push(rawGpsGrade);
          }
          positionOverride = { lat: latestGps.lat, lon: latestGps.lon };
          elevationOverride = latestGps.ele ?? null;
          // Append GPS point to the live polyline.
          s.appendLivePoint({
            lat: latestGps.lat,
            lon: latestGps.lon,
            ele: latestGps.ele ?? 0,
          });
        } else {
          speed = 0;
        }

        // Estimate power from GPS speed + current grade.
        power = speed > 0
          ? estimatePowerFromGps(speed, grade, {
              ...rider,
              headingDeg: undefined,
            })
          : 0;

        // Compute cumulative distance from haversine between GPS samples.
        if (prevGps && latestGps) {
          const stepDist = distanceMeters(prevGps, latestGps);
          // We advance distance manually via appendLivePoint tracking.
          // useRideLoop's tick() will still advance distance by speed*dt,
          // which is our best continuous estimate between GPS fixes.
          void stepDist; // informational; tick() handles distance advance
        }
      } else if (s.mode === 'trainer' && s.speed > 0) {
        speed = s.speed;
        power = s.power || null;
      } else {
        power = settings.demoPowerW;
        speed = solveVelocity(power, grade, rider);
      }

      // ---- Throttle trainer updates (~1.2 Hz max) ----
      // ERG mode: send opcode 0x05 Set Target Power.
      // SIM mode: send opcode 0x11 Set Indoor Bike Simulation Parameters.
      // Skip in outdoor mode — no trainer is connected.
      const now = Date.now();
      if (s.rideMode !== 'outdoor' && s.mode === 'trainer' && s.connection === 'connected') {
        const controlMode = getTrainerControlMode();
        if (controlMode === 'erg') {
          // ERG: only push if we have a target power configured in the store.
          const targetW = s.targetPowerW;
          if (targetW !== null && now - lastSentT.current > 850) {
            lastSentT.current = now;
            setTargetPower(targetW).catch(() => undefined);
          }
        } else {
          // SIM: push gradient (+ physics coefficients) to trainer.
          const gradeChanged = Math.abs(grade - s.lastSentGrade) > 0.5;
          if (now - lastSentT.current > 850 || gradeChanged) {
            lastSentT.current = now;
            useRideStore.setState({ lastSentGrade: grade });
            // Project headwind onto the rider's forward axis for the trainer.
            const headwindMs =
              settings.windSpeedMs * Math.cos((settings.windDirectionDeg * Math.PI) / 180);
            setSimulationParams({
              gradePct: grade,
              windMs: headwindMs,
              crrScaled: ftmsCrr(rider),
              cwScaled: ftmsCw(rider),
            }).catch(() => undefined);
          }
        }
      }

      // ---- Sample telemetry at 1 Hz ----
      const recordSample = now - lastSampleT.current >= 1000;
      if (recordSample) lastSampleT.current = now;

      s.tick({
        now,
        dt,
        gradeNow: grade,
        elevationNow: elevationOverride ?? (s.route ? elevationAt(s.route, distanceNow) : 0),
        speedNow: speed,
        positionNow: positionOverride ?? { lat: sampled.lat, lon: sampled.lon },
        recordSample,
        cadenceNow: cadence,
        powerNow: power,
        heartRateNow: hr,
      });

      // Advance pace bots in the same frame (cheap — no allocations per bot).
      // Skip for outdoor mode — pace bots are an indoor-only feature.
      if (s.rideMode !== 'outdoor' && s.paceBots.length > 0) s.tickBots(dt);

      // ---- Live commentary ------------------------------------------------
      // Guard: skip if disabled, muted, or already firing.
      if (
        settings.liveCommentaryEnabled &&
        settings.commentaryVolume > 0 &&
        !commentatorBusyRef.current
      ) {
        const csRef = commentatorStateRef.current;
        const throttleMs = settings.commentaryThrottleSec * 1000;

        if (now - csRef.lastFiredMs >= throttleMs) {
          // Build a lightweight snapshot for trigger detection.
          // Outdoor mode may not have a pre-loaded route — fall back to 0 totalDistance
          // (the commentator's halfway/final-2km triggers will just no-op in that case).
          const leadBot = s.paceBots.length > 0
            ? s.paceBots.reduce<number | null>((closest, bot) => {
                const gap = bot.state.distance - distanceNow;
                if (closest === null) return gap;
                return Math.abs(gap) < Math.abs(closest) ? gap : closest;
              }, null)
            : null;

          const snapshot: RideSnapshot = {
            speed,
            power: power ?? 0,
            grade,
            distance: distanceNow,
            totalDistance: s.route?.totalDistance ?? 0,
            rideState: s.rideState,
            leadBotGapM: leadBot,
            botCount: s.paceBots.length,
          };

          const triggers = detectTriggers(snapshot, csRef);

          if (triggers.length > 0) {
            commentatorBusyRef.current = true;
            csRef.lastFiredMs = now;

            pickAndGenerate(triggers, snapshot)
              .then((line) => {
                if (line) {
                  speakLine(line, {
                    volume: settings.commentaryVolume,
                    rate: settings.commentaryRate,
                    voice: pickPreferredVoice(),
                  });
                }
              })
              .catch(() => undefined)
              .finally(() => {
                commentatorBusyRef.current = false;
              });
          }
        }
      }
    };

    // Cancel speech when the loop mounts (e.g., ride resets).
    cancelSpeech();
    commentatorStateRef.current = createCommentatorState();
    commentatorBusyRef.current = false;

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cancelSpeech();
    };
    // outdoorSamplesRef is a RefObject — its identity is stable across renders,
    // and reads happen inside the rAF callback so we don't need to re-run the
    // effect when the ref changes. Suppress exhaustive-deps for that ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
}
