/**
 * Replay ride loop — drives position/HUD from recorded FIT telemetry instead
 * of trainer/Demo physics.
 *
 * When `replayData` is present in the store this hook takes over from
 * useRideLoop: each animation frame it advances `replayIndex` to the sample
 * whose timestamp matches (or exceeds) the elapsed playback time, then
 * pushes the recorded speed/power/cadence/HR directly into the store via
 * `tick()`. The avatar and chase-cam follow the recorded GPS track exactly.
 *
 * Play / pause reuse the existing store actions (start / pause / resume /
 * finish) — no new state machine needed.
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { gradientAt, elevationAt } from '@/lib/gradientCalculator';
import type { TelemetrySample } from '@/types';

export function useReplayLoop(): void {
  const store = useRideStore;
  const lastWallT = useRef<number>(0);
  // Wall-clock ms at the moment the replay started (or last resumed).
  const resumedAt = useRef<number>(0);
  // Elapsed playback time accumulated before the most recent pause, ms.
  const elapsedBeforePause = useRef<number>(0);
  // Whether we were running on the previous frame (to detect resume transitions).
  const wasRunning = useRef(false);

  useEffect(() => {
    let raf = 0;

    const frame = (tHigh: number) => {
      raf = requestAnimationFrame(frame);

      const s = store.getState();

      // Only active when there is replay data
      if (!s.replayData || !s.route) {
        lastWallT.current = tHigh;
        wasRunning.current = false;
        return;
      }

      if (s.rideState !== 'running') {
        if (wasRunning.current) {
          // Just paused — record how much playback time we accumulated
          elapsedBeforePause.current += tHigh - resumedAt.current;
        }
        wasRunning.current = false;
        lastWallT.current = tHigh;
        return;
      }

      // Detect resume / start transitions
      if (!wasRunning.current) {
        resumedAt.current = tHigh;
        wasRunning.current = true;
      }

      const dt = lastWallT.current === 0 ? 0 : Math.min(0.5, (tHigh - lastWallT.current) / 1000);
      lastWallT.current = tHigh;
      if (dt <= 0) return;

      // How many ms of replay time have elapsed since the activity start
      const playbackMs = elapsedBeforePause.current + (tHigh - resumedAt.current);

      const { samples } = s.replayData;
      const startMs = samples[0].t;

      // Find the sample index whose timestamp corresponds to playbackMs
      // (samples[i].t - startMs gives seconds into the recording).
      const targetMs = startMs + playbackMs;

      let idx = s.replayIndex;
      // Advance index to catch up to current playback position
      while (idx < samples.length - 1 && samples[idx + 1].t <= targetMs) {
        idx++;
      }

      // Clamp and persist the new index
      const clampedIdx = Math.min(idx, samples.length - 1);
      if (clampedIdx !== s.replayIndex) {
        store.setState({ replayIndex: clampedIdx });
      }

      const sample: TelemetrySample = samples[clampedIdx];

      const grade = gradientAt(s.route, sample.distance);
      const elevation = sample.ele ?? elevationAt(s.route, sample.distance);

      const now = Date.now();
      const recordSample = false; // replay does not re-record telemetry

      s.tick({
        now,
        dt,
        gradeNow: grade,
        elevationNow: elevation,
        // Speed drives distance advance in tick(); use the recorded speed so
        // the progress bar and distance HUD match the original activity.
        speedNow: sample.speed,
        positionNow: { lat: sample.lat, lon: sample.lon },
        recordSample,
        cadenceNow: sample.cadence ?? null,
        powerNow: sample.power ?? null,
        heartRateNow: sample.heartRate ?? null,
      });

      // If we've reached the last sample, finish the ride
      if (clampedIdx >= samples.length - 1) {
        s.finish();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      // Reset refs on unmount so a fresh mount starts clean
      lastWallT.current = 0;
      resumedAt.current = 0;
      elapsedBeforePause.current = 0;
      wasRunning.current = false;
    };
  }, [store]);
}
