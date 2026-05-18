/**
 * Workout library — IndexedDB persistence for Workout objects.
 *
 * Mirrors routeLibrary.ts pattern exactly: same DB name ('globeride'),
 * upgraded to version 2 to add the 'workouts' object store; the version 1
 * upgrade branch is a no-op so existing route data is untouched.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Workout } from '@/lib/workout';

const DB_NAME = 'globeride';
const DB_VERSION = 2;
const WORKOUT_STORE = 'workouts';

interface GlobeRideDBv2 extends DBSchema {
  routes: {
    key: string;
    value: Record<string, unknown>;
    indexes: { 'by-savedAt': number };
  };
  workouts: {
    key: string;
    value: Workout;
    indexes: { 'by-createdAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<GlobeRideDBv2>> | null = null;

function getDb(): Promise<IDBPDatabase<GlobeRideDBv2>> {
  if (!dbPromise) {
    dbPromise = openDB<GlobeRideDBv2>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1 → v2: add workouts store. The routes store already exists.
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(WORKOUT_STORE)) {
            const store = db.createObjectStore(WORKOUT_STORE, { keyPath: 'id' });
            store.createIndex('by-createdAt', 'createdAt');
          }
        }
      },
    });
  }
  return dbPromise;
}

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
