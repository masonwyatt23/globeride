/**
 * useRaceRecorder — auto-records finished rides as race results.
 *
 * Mount once in Ride.tsx (alongside useRideHistoryRecorder):
 *   useRaceRecorder();
 *
 * On every ride finish, iterates over all loaded race manifests, checks
 * whether the finished ride qualifies (route match + time window + rules),
 * and if so builds a signed RaceResult and stores it in raceStore.
 *
 * Pushes a toast via rideStore for each qualifying race: "🏁 You finished…".
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRaceStore } from '@/stores/raceStore';
import {
  validateResult,
  buildAndSignResult,
} from '@/lib/race/raceProtocol';
import type { RaceManifest } from '@/lib/race/raceProtocol';
import {
  computeAvgPower,
  computeAscentM,
} from '@/lib/rideHistory';
import type { RideState } from '@/types';

const MIN_DURATION_MS = 30_000;

/**
 * Check whether a finished ride's route matches the manifest's routeRef.
 * For iconic/wts refs we match by route.id.
 * For inline refs we match by checking the route id embedded in the manifest.
 */
function routeMatchesManifest(
  rideRouteId: string | undefined,
  manifest: RaceManifest,
): boolean {
  if (!rideRouteId) return false;
  const ref = manifest.routeRef;
  switch (ref.kind) {
    case 'iconic':
      return ref.routeId === rideRouteId;
    case 'wts':
      return ref.stageId === rideRouteId;
    case 'inline':
      return ref.route.id === rideRouteId;
  }
}

/** Format ms duration as M:SS for the toast message. */
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function useRaceRecorder(): void {
  const savedRef = useRef(false);
  const prevStateRef = useRef<RideState>('idle');

  useEffect(() => {
    const unsub = useRideStore.subscribe((state) => {
      const rideState = state.rideState;
      const prev = prevStateRef.current;
      prevStateRef.current = rideState;

      if (rideState !== 'finished') {
        if (savedRef.current) savedRef.current = false;
        return;
      }

      // Only act on the transition into 'finished'.
      if (prev === 'finished') return;
      if (savedRef.current) return;
      savedRef.current = true;

      // Run async without blocking the store subscription.
      void processRaceResults();
    });

    return unsub;
  }, []);
}

async function processRaceResults(): Promise<void> {
  const rideState = useRideStore.getState();
  const { samples, elapsedMs, route } = rideState;

  // Skip trivially short or empty rides.
  if (elapsedMs < MIN_DURATION_MS) return;
  if (samples.length < 1) return;

  const manifests = useRaceStore.getState().loadedManifests;
  if (manifests.length === 0) return;

  const settings = useSettingsStore.getState();
  const riderName = settings.riderMassKg > 0 ? 'Rider' : 'Rider'; // name from profileStore if available
  const avgPowerW = computeAvgPower(samples);
  const totalAscentM = computeAscentM(samples);
  const finishTimeMs = elapsedMs;
  const recordedAt = Date.now();

  // Compact samples blob for hashing — include only numeric fields for stability.
  const samplesBlob = JSON.stringify(
    samples.map((s) => [s.t, s.distance, s.speed, s.power ?? 0]),
  );

  // Get rider name from profile if available.
  let resolvedRiderName = riderName;
  try {
    // Dynamic import to avoid circular dep issues — profileStore is optional here.
    const { useProfileStore } = await import('@/stores/profileStore');
    const profile = useProfileStore.getState().profile;
    if (profile?.displayName) resolvedRiderName = profile.displayName;
  } catch {
    // profileStore not available — use fallback
  }

  for (const manifest of manifests) {
    // Check route match.
    if (!routeMatchesManifest(route?.id, manifest)) continue;

    // Build a provisional result (pre-sign) so we can validate it.
    const provisionalResult = {
      raceId: manifest.id,
      rider: {
        name: resolvedRiderName,
        ftpW: settings.ftpW,
        weightKg: settings.riderMassKg,
      },
      finishTimeMs,
      avgPowerW: avgPowerW > 0 ? avgPowerW : undefined,
      totalAscentM,
      recordedAt,
      rideHash: '', // filled by buildAndSignResult
      signature: 'a'.repeat(64), // placeholder — structural check needs 64-char hex
    };

    const validation = validateResult(provisionalResult, manifest);
    if (!validation.ok) {
      console.info(`[raceRecorder] Ride does not qualify for "${manifest.name}": ${validation.reason}`);
      continue;
    }

    // Build the real signed result.
    try {
      const result = await buildAndSignResult({
        manifest,
        rider: {
          name: resolvedRiderName,
          ftpW: settings.ftpW,
          weightKg: settings.riderMassKg,
        },
        finishTimeMs,
        avgPowerW: avgPowerW > 0 ? avgPowerW : undefined,
        totalAscentM,
        samplesBlob,
      });

      useRaceStore.getState().recordResult(result);

      // Push a toast to the ride store so the HUD shows it.
      useRideStore.getState().pushToast({
        kind: 'success',
        title: `Race result recorded: ${manifest.name}`,
        message: `Finish time: ${formatDuration(finishTimeMs)}`,
        durationMs: 8_000,
      });
    } catch (err) {
      console.warn(`[raceRecorder] Failed to sign result for "${manifest.name}":`, err);
    }
  }
}
