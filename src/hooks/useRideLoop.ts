import { useEffect, useRef } from 'react';
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

/**
 * The heart of GlobeRide: a requestAnimationFrame loop that advances the
 * rider along the route, computes live gradient, pushes it to the trainer at
 * a throttled rate, and records telemetry samples at 1 Hz.
 *
 * In Demo Mode it feeds the full cycling-power equation (gravity + rolling +
 * aero + drivetrain + wind) so the simulated speed responds realistically to
 * the user's bike/position/wind/weight settings.
 */
export function useRideLoop(): void {
  const store = useRideStore;
  const lastT = useRef<number>(0);
  const lastSentT = useRef<number>(0);
  const lastSampleT = useRef<number>(0);
  const smoother = useRef(new EmaSmoother(0.18));

  useEffect(() => {
    let raf = 0;

    const frame = (tHigh: number) => {
      raf = requestAnimationFrame(frame);

      const s = store.getState();
      // Replay loop handles frames when replayData is present — bail out here.
      // Workout engine handles frames when a workout is running — bail out here too.
      if (s.replayData || s.workoutRunning || s.rideState !== 'running' || !s.route) {
        lastT.current = tHigh;
        return;
      }

      const dt = lastT.current === 0 ? 0 : Math.min(0.1, (tHigh - lastT.current) / 1000);
      lastT.current = tHigh;
      if (dt <= 0) return;

      const distanceNow = s.distance;
      const sampled = sampleRouteAtDistance(s.route, distanceNow);

      // Peek a few meters ahead so we always have a tangent for the camera
      // even at the very last sample.
      const ahead = sampleRouteAtDistance(
        s.route,
        Math.min(s.route.totalDistance, distanceNow + 6),
      );
      (window as unknown as { __globerideAhead?: typeof ahead }).__globerideAhead = ahead;

      const rawGrade = gradientAt(s.route, distanceNow);
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
      let power: number | null = null;
      const cadence: number | null = s.mode === 'trainer' ? s.cadence || null : 78;
      const hr: number | null = s.heartRate;

      if (s.mode === 'trainer' && s.speed > 0) {
        speed = s.speed;
        power = s.power || null;
      } else {
        power = settings.demoPowerW;
        speed = solveVelocity(power, grade, rider);
      }

      // ---- Throttle trainer updates (~1.2 Hz max) ----
      // ERG mode: send opcode 0x05 Set Target Power.
      // SIM mode: send opcode 0x11 Set Indoor Bike Simulation Parameters.
      const now = Date.now();
      if (s.mode === 'trainer' && s.connection === 'connected') {
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
        elevationNow: elevationAt(s.route, distanceNow),
        speedNow: speed,
        positionNow: { lat: sampled.lat, lon: sampled.lon },
        recordSample,
        cadenceNow: cadence,
        powerNow: power,
        heartRateNow: hr,
      });
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [store]);
}
