/**
 * Workout library — IndexedDB persistence for Workout objects.
 *
 * Storage lives in the shared 'globeride' database opened by @/lib/db
 * (single version, single connection, idempotent all-store upgrade). This
 * module just owns the 'workouts' store's CRUD.
 */

import type { Workout } from '@/lib/workout';
import { getDb, WORKOUTS_STORE } from '@/lib/db';

const WORKOUT_STORE = WORKOUTS_STORE;

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
