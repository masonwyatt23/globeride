import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { gradientAt, EmaSmoother, elevationAt } from '@/lib/gradientCalculator';
import { sampleRouteAtDistance } from '@/lib/gpxParser';
import { solveVelocity } from '@/lib/physics';
import { setGradient as ftmsSetGradient } from '@/lib/ftms';

/**
 * The heart of GlobeRide: a requestAnimationFrame loop that advances the
 * rider along the route, computes live gradient, pushes it to the trainer at
 * a throttled rate, and records telemetry samples at 1 Hz.
 */
export function useRideLoop(): void {
  const store = useRideStore;
  const lastT = useRef<number>(0);
  const lastSentT = useRef<number>(0);
  const lastSampleT = useRef<number>(0);
  const smoother = useRef(new EmaSmoother(0.18));
  const demoPower = useRef(190); // baseline rider power for demo mode

  useEffect(() => {
    let raf = 0;

    const frame = (tHigh: number) => {
      raf = requestAnimationFrame(frame);

      const s = store.getState();
      if (s.rideState !== 'running' || !s.route) {
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
      // Stash ahead position on a stable global ref consumed by CesiumViewer.
      (window as unknown as { __globerideAhead?: typeof ahead }).__globerideAhead = ahead;

      const rawGrade = gradientAt(s.route, distanceNow);
      const grade = smoother.current.push(rawGrade);

      // ---- Determine speed source ----
      let speed: number;
      let power: number | null = null;
      const cadence: number | null = s.mode === 'trainer' ? s.cadence || null : 78;
      const hr: number | null = s.heartRate;

      if (s.mode === 'trainer' && s.speed > 0) {
        speed = s.speed;
        power = s.power || null;
      } else {
        // Demo: pretend the rider is producing baseline power, solve for v.
        power = demoPower.current;
        speed = solveVelocity(power, grade);
      }

      // ---- Throttle grade updates to the trainer (1.2 Hz max) ----
      const now = Date.now();
      if (s.mode === 'trainer' && s.connection === 'connected') {
        if (now - lastSentT.current > 850 || Math.abs(grade - s.lastSentGrade) > 0.5) {
          lastSentT.current = now;
          useRideStore.setState({ lastSentGrade: grade });
          ftmsSetGradient(grade).catch(() => undefined);
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
