/**
 * Workout library — IndexedDB persistence for Workout objects.
 *
 * Storage lives in the shared 'globeride' database opened by @/lib/db
 * (single version, single connection, idempotent all-store upgrade). This
 * module just owns the 'workouts' store's CRUD.
 */

import type { Workout } from '@/lib/workout';
import { getDb, WORKOUTS_STORE } from '@/lib/db';
import { PRESET_WORKOUTS } from '@/lib/presetWorkouts';

const WORKOUT_STORE = WORKOUTS_STORE;
const SEED_KEY = 'globeride.presetWorkoutsSeeded.v1';

/** Persist a workout. Overwrites any existing entry with the same id. */
export async function saveWorkout(workout: Workout): Promise<void> {
  const db = await getDb();
  await db.put(WORKOUT_STORE, workout);
}

/** List every saved workout, newest first. */
export async function listWorkouts(): Promise<Workout[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(WORKOUT_STORE, 'by-createdAt');
  return all.reverse();
}

/** Load a single workout by id. Returns undefined if missing. */
export async function loadWorkout(id: string): Promise<Workout | undefined> {
  const db = await getDb();
  return db.get(WORKOUT_STORE, id);
}

/** Delete a workout. No-op if missing. */
export async function deleteWorkout(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(WORKOUT_STORE, id);
}

/** Check whether a workout id already exists in the library. */
export async function hasWorkout(id: string): Promise<boolean> {
  const db = await getDb();
  const key = await db.getKey(WORKOUT_STORE, id);
  return key !== undefined;
}

/** Total number of saved workouts. */
export async function countWorkouts(): Promise<number> {
  const db = await getDb();
  return db.count(WORKOUT_STORE);
}

/**
 * Insert any preset workouts that aren't already present. Idempotent: runs
 * every launch but only writes the gaps, so users who deleted a preset
 * don't get it back uninvited (the localStorage flag short-circuits future
 * seed passes once the catalog has been processed once).
 */
export async function seedPresetWorkoutsIfMissing(): Promise<void> {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(SEED_KEY)) return;
  const db = await getDb();
  const tx = db.transaction(WORKOUT_STORE, 'readwrite');
  const store = tx.objectStore(WORKOUT_STORE);
  // The library reads via the by-createdAt index and reverses, so newest
  // sorts to the top. We seed the catalog into a fixed past window
  // (now - 1 hour … now - millisPerPreset) so:
  //   - any user-saved workout (createdAt = present) appears ABOVE presets,
  //   - among the presets, PRESET_WORKOUTS[0] (the flagship Daily) gets the
  //     newest timestamp and sits at the top of the preset block.
  const baseTs = Date.now() - 60 * 60 * 1000;
  for (let i = 0; i < PRESET_WORKOUTS.length; i++) {
    const preset = PRESET_WORKOUTS[i];
    const existing = await store.getKey(preset.id);
    if (existing) continue;
    const stamped: Workout = { ...preset, createdAt: baseTs - i * 1000 };
    await store.put(stamped);
  }
  await tx.done;
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(SEED_KEY, '1'); } catch { /* private-mode safe */ }
  }
}
