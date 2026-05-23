/**
 * exporters.ts — Data-export functions, each returning a Blob ready for
 * download.
 *
 * All functions are async and read from IndexedDB / Zustand stores at call
 * time so exports always reflect current data.
 */

import { listRides, type RideRecord } from '@/lib/rideHistory';
import { computePersonalRecords } from '@/lib/records';
import { useAchievementStore } from '@/stores/achievementStore';
import { useRaceStore } from '@/stores/raceStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { encodeCsv } from '@/lib/exports/csv';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toJson(value: unknown): Blob {
  return new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
}

// ---------------------------------------------------------------------------
// Rides CSV
// ---------------------------------------------------------------------------

/**
 * Export all rides from IndexedDB as a CSV Blob.
 *
 * Columns: date, name, distanceKm, durationMin, elevationM, tss,
 *          avgPowerW, avgHeartRateBpm, workoutType, source
 */
export async function exportRidesCsv(): Promise<Blob> {
  const rides = await listRides();
  const ftpW = useSettingsStore.getState().ftpW;

  const rows = rides.map((r: RideRecord) => {
    const durationMin = +(r.durationSec / 60).toFixed(2);
    const distanceKm = +(r.distanceM / 1000).toFixed(3);
    const tss =
      ftpW > 0 && r.avgPower > 0
        ? +((r.durationSec * r.avgPower * (r.avgPower / ftpW)) / (ftpW * 3600) * 100).toFixed(1)
        : 0;

    return {
      date: new Date(r.startedAt).toISOString(),
      name: r.name,
      distanceKm,
      durationMin,
      elevationM: r.ascentM,
      tss,
      avgPowerW: r.avgPower,
      avgHeartRateBpm: null, // not stored in RideRecord; reserved column
      workoutType: r.workoutName ?? '',
      source: r.source,
    };
  });

  return new Blob([encodeCsv(rows)], { type: 'text/csv' });
}

// ---------------------------------------------------------------------------
// Achievements JSON
// ---------------------------------------------------------------------------

/**
 * Export unlocked achievements (id → unlockedAt ms) as a JSON Blob.
 */
export async function exportAchievementsJson(): Promise<Blob> {
  const { unlocked } = useAchievementStore.getState();
  return toJson(unlocked);
}

// ---------------------------------------------------------------------------
// Personal Records JSON
// ---------------------------------------------------------------------------

/**
 * Export computed personal records as a JSON Blob.
 * Uses the current FTP setting from settingsStore.
 */
export async function exportRecordsJson(): Promise<Blob> {
  const rides = await listRides();
  const ftpW = useSettingsStore.getState().ftpW;
  const records = computePersonalRecords(rides, ftpW);
  return toJson(records);
}

// ---------------------------------------------------------------------------
// Races JSON
// ---------------------------------------------------------------------------

/**
 * Export loaded race manifests and all local results as a JSON Blob.
 */
export async function exportRacesJson(): Promise<Blob> {
  const { loadedManifests, localResults } = useRaceStore.getState();
  return toJson({ loadedManifests, localResults });
}

// ---------------------------------------------------------------------------
// All-in-one JSON
// ---------------------------------------------------------------------------

/**
 * Export a single JSON Blob bundling rides, achievements, records, and races.
 */
export async function exportAllJson(): Promise<Blob> {
  const [rides] = await Promise.all([listRides()]);
  const ftpW = useSettingsStore.getState().ftpW;
  const { unlocked } = useAchievementStore.getState();
  const { loadedManifests, localResults } = useRaceStore.getState();
  const records = computePersonalRecords(rides, ftpW);

  return toJson({
    exportedAt: new Date().toISOString(),
    rides,
    achievements: unlocked,
    personalRecords: records,
    races: { loadedManifests, localResults },
  });
}
