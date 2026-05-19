/**
 * Shared IndexedDB opener for the single 'globeride' database.
 *
 * CRITICAL: every store the app uses lives in ONE IndexedDB database
 * ('globeride'). IndexedDB allows only a single version per database, and
 * opening it at a version lower than the one already on disk throws a
 * VersionError. Previously routeLibrary (v1), workoutLibrary (v2) and
 * rideHistory (v3) each opened 'globeride' at their own hardcoded version,
 * so whichever module opened the DB first won and the other two threw
 * VersionError — silently breaking persistence (routes / workouts /
 * history) depending on import + call order. This module is the single
 * source of truth: one DB_VERSION, one memoized connection, one idempotent
 * upgrade that creates every store.
 *
 * All persistence modules MUST import getDb + the store-name constants from
 * here and never call openDB('globeride', ...) directly. When adding a
 * store: bump DB_VERSION and append a new additive branch to `upgrade`.
 * Every branch stays idempotent (guarded by objectStoreNames.contains) so
 * the upgrade is safe to run from any prior version, including a fresh DB.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SavedRoute } from '@/types';
import type { Workout } from '@/lib/workout';
// Type-only import — erased at compile time, so no runtime import cycle
// (rideHistory imports getDb from here at runtime; this does not).
import type { RideRecord } from '@/lib/rideHistory';

export const DB_NAME = 'globeride';
/** Current schema version. Bump + add an additive upgrade branch per new store. */
export const DB_VERSION = 3;

export const ROUTES_STORE = 'routes';
export const WORKOUTS_STORE = 'workouts';
export const RIDES_STORE = 'rides';

export interface GlobeRideDB extends DBSchema {
  routes: {
    key: string;
    value: SavedRoute;
    indexes: { 'by-savedAt': number };
  };
  workouts: {
    key: string;
    value: Workout;
    indexes: { 'by-createdAt': number };
  };
  rides: {
    key: string;
    value: RideRecord;
    indexes: { 'by-startedAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<GlobeRideDB>> | null = null;

/**
 * Open (once) the shared 'globeride' database at the current version. The
 * connection is memoized for the page lifetime so every persistence module
 * shares one IDBPDatabase and a single upgrade transaction.
 */
export function getDb(): Promise<IDBPDatabase<GlobeRideDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GlobeRideDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Pure store creation, no data migrations — so each branch is
        // guarded only by "does this store exist yet?" rather than by
        // version. That makes the upgrade fully idempotent AND
        // self-healing: it (re)creates any missing store regardless of
        // how the DB reached its current version (brand-new, legacy
        // v1/v2, or a partially-created state). createObjectStore is
        // therefore only ever called when the store is genuinely absent.
        if (!db.objectStoreNames.contains(ROUTES_STORE)) {
          const store = db.createObjectStore(ROUTES_STORE, { keyPath: 'id' });
          store.createIndex('by-savedAt', 'savedAt');
        }
        if (!db.objectStoreNames.contains(WORKOUTS_STORE)) {
          const store = db.createObjectStore(WORKOUTS_STORE, { keyPath: 'id' });
          store.createIndex('by-createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(RIDES_STORE)) {
          const store = db.createObjectStore(RIDES_STORE, { keyPath: 'id' });
          store.createIndex('by-startedAt', 'startedAt');
        }
      },
    });
  }
  return dbPromise;
}
