/**
 * Ride history — IndexedDB persistence for completed ride records.
 *
 * Uses the same 'globeride' IDB database, bumped to version 3 to add the
 * 'rides' object store. Upgrade is strictly additive:
 *   v1 → routes store (routeLibrary.ts)
 *   v2 → workouts store (workoutLibrary.ts)
 *   v3 → rides store (this file)
 * The onupgradeneeded handler only creates stores that are missing, so
 * existing data in earlier stores is never touched.
 *
 * Keep this file pure (no React/store imports) so it is trivially
 * unit-testable and safe to import anywhere.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TelemetrySample } from '@/types';

export type RideSource = 'route' | 'workout' | 'replay';

/** A completed ride record stored in IndexedDB. */
export interface RideRecord {
  /** Unique ride id — generated at save time. */
  id: string;
  /** Human-readable name (route name or workout name + date). */
  name: string;
  /** Unix ms when the ride started. */
  startedAt: number;
  /** Total moving time, seconds. */
  durationSec: number;
  /** Total distance, metres. */
  distanceM: number;
  /** Total elevation gain, metres. */
  ascentM: number;
  /** Average power over the ride, watts (0 if no power data). */
  avgPower: number;
  /** Average speed, m/s. */
  avgSpeed: number;
  /** Number of telemetry samples recorded. */
  sampleCount: number;
  /** Workout name, if a structured workout was active. */
  workoutName?: string;
  /** Full telemetry track — enables replay / re-export. */
  samples: TelemetrySample[];
  /** How the ride was sourced. */
  source: RideSource;
}

// ---------------------------------------------------------------------------
// DB schema
// ---------------------------------------------------------------------------

const DB_NAME = 'globeride';
const DB_VERSION = 3;
const RIDES_STORE = 'rides';

interface GlobeRideDBv3 extends DBSchema {
  routes: {
    key: string;
    value: Record<string, unknown>;
    indexes: { 'by-savedAt': number };
  };
  workouts: {
    key: string;
    value: Record<string, unknown>;
    indexes: { 'by-createdAt': number };
  };
  rides: {
    key: string;
    value: RideRecord;
    indexes: { 'by-startedAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<GlobeRideDBv3>> | null = null;

function getDb(): Promise<IDBPDatabase<GlobeRideDBv3>> {
  if (!dbPromise) {
    dbPromise = openDB<GlobeRideDBv3>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Each version branch is additive — only create stores that don't exist.
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('routes')) {
            const store = db.createObjectStore('routes', { keyPath: 'id' });
            store.createIndex('by-savedAt', 'savedAt');
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('workouts')) {
            const store = db.createObjectStore('workouts', { keyPath: 'id' });
            store.createIndex('by-createdAt', 'createdAt');
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(RIDES_STORE)) {
            const store = db.createObjectStore(RIDES_STORE, { keyPath: 'id' });
            store.createIndex('by-startedAt', 'startedAt');
          }
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in rideHistory.test.ts)
// ---------------------------------------------------------------------------

/** Generate a ride id. */
export function rideId(): string {
  return `ride-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Compute average power from a sample array (0 if no power readings). */
export function computeAvgPower(samples: TelemetrySample[]): number {
  const powered = samples.filter((s) => typeof s.power === 'number');
  if (powered.length === 0) return 0;
  return Math.round(powered.reduce((a, s) => a + (s.power ?? 0), 0) / powered.length);
}

/** Compute average speed from a sample array (m/s). */
export function computeAvgSpeed(samples: TelemetrySample[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((a, s) => a + s.speed, 0) / samples.length;
}

/** Compute total elevation gain (ascent) from a sample array, metres. */
export function computeAscentM(samples: TelemetrySample[]): number {
  if (samples.length < 2) return 0;
  let gain = 0;
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i].ele - samples[i - 1].ele;
    if (delta > 0) gain += delta;
  }
  return Math.round(gain);
}

// ---------------------------------------------------------------------------
// CRUD — IndexedDB
// ---------------------------------------------------------------------------

/** Persist a completed ride. Overwrites any existing entry with the same id. */
export async function saveRide(ride: RideRecord): Promise<void> {
  const db = await getDb();
  await db.put(RIDES_STORE, ride);
}

/** List all rides, newest first. */
export async function listRides(): Promise<RideRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(RIDES_STORE, 'by-startedAt');
  return all.reverse();
}

/** Load a single ride by id. Returns undefined if missing. */
export async function getRide(id: string): Promise<RideRecord | undefined> {
  const db = await getDb();
  return db.get(RIDES_STORE, id);
}

/** Delete a ride. No-op if missing. */
export async function deleteRide(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(RIDES_STORE, id);
}

/** Total number of saved rides. */
export async function countRides(): Promise<number> {
  const db = await getDb();
  return db.count(RIDES_STORE);
}
