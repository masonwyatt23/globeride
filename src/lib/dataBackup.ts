/**
 * Local-first backup utilities.
 *
 * The backup intentionally contains only local app data: IndexedDB stores and
 * GlobeRide-owned persisted browser storage keys. It does not include
 * session-only Strava token overrides unless they are already in sessionStorage
 * at export time.
 */

import { DB_VERSION, RIDES_STORE, ROUTES_STORE, WORKOUTS_STORE, deleteGlobeRideDb, getDb } from '@/lib/db';
import type { RideRecord } from '@/lib/rideHistory';
import type { Workout } from '@/lib/workout';
import type { SavedRoute } from '@/types';

export const BACKUP_SCHEMA_VERSION = 1;

const PERSISTED_KEY_PREFIX = 'globeride.';

export interface BackupEnvelope {
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  stores: {
    routes: SavedRoute[];
    workouts: Workout[];
    rides: RideRecord[];
  };
  persistedState: {
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
  };
}

export interface LocalDataInventory {
  stores: {
    routes: { count: number; bytes: number };
    workouts: { count: number; bytes: number };
    rides: { count: number; bytes: number };
  };
  persistedState: {
    localStorageKeys: number;
    sessionStorageKeys: number;
    bytes: number;
  };
  totalBytes: number;
  networkServices: string[];
}

export async function createBackupEnvelope(): Promise<BackupEnvelope> {
  const db = await getDb();
  const routes = await db.getAll(ROUTES_STORE);
  const workouts = await db.getAll(WORKOUTS_STORE);
  const rides = await db.getAll(RIDES_STORE);

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: import.meta.env.VITE_APP_VERSION ?? '0.1.0',
    createdAt: new Date().toISOString(),
    stores: { routes, workouts, rides },
    persistedState: {
      localStorage: collectStorage(window.localStorage),
      sessionStorage: collectStorage(window.sessionStorage),
    },
  };
}

export async function restoreBackupEnvelope(envelope: BackupEnvelope): Promise<void> {
  validateBackupEnvelope(envelope);
  const localStorageState = sanitizePersistedState(envelope.persistedState.localStorage);
  const sessionStorageState = sanitizePersistedState(envelope.persistedState.sessionStorage);

  await deleteGlobeRideDb();
  const db = await getDb();
  const tx = db.transaction([ROUTES_STORE, WORKOUTS_STORE, RIDES_STORE], 'readwrite');
  await Promise.all([
    ...envelope.stores.routes.map((route) => tx.objectStore(ROUTES_STORE).put(route)),
    ...envelope.stores.workouts.map((workout) => tx.objectStore(WORKOUTS_STORE).put(workout)),
    ...envelope.stores.rides.map((ride) => tx.objectStore(RIDES_STORE).put(migrateRideRecord(ride))),
    tx.done,
  ]);

  replaceStorage(window.localStorage, localStorageState);
  replaceStorage(window.sessionStorage, sessionStorageState);
}

export async function getLocalDataInventory(): Promise<LocalDataInventory> {
  const db = await getDb();
  const routes = await db.getAll(ROUTES_STORE);
  const workouts = await db.getAll(WORKOUTS_STORE);
  const rides = await db.getAll(RIDES_STORE);
  const localStorageData = collectStorage(window.localStorage);
  const sessionStorageData = collectStorage(window.sessionStorage);

  const routeBytes = byteSize(routes);
  const workoutBytes = byteSize(workouts);
  const rideBytes = byteSize(rides);
  const storageBytes = byteSize(localStorageData) + byteSize(sessionStorageData);

  return {
    stores: {
      routes: { count: routes.length, bytes: routeBytes },
      workouts: { count: workouts.length, bytes: workoutBytes },
      rides: { count: rides.length, bytes: rideBytes },
    },
    persistedState: {
      localStorageKeys: Object.keys(localStorageData).length,
      sessionStorageKeys: Object.keys(sessionStorageData).length,
      bytes: storageBytes,
    },
    totalBytes: routeBytes + workoutBytes + rideBytes + storageBytes,
    networkServices: [
      'Cesium ion / terrain and tiles',
      'OpenStreetMap / map tiles',
      'OSRM route snapping',
      'OpenTopoData / Open-Elevation',
      'Strava',
      'AI provider when configured',
    ],
  };
}

export async function clearAllLocalData(): Promise<void> {
  window.localStorage.clear();
  window.sessionStorage.clear();
  await deleteGlobeRideDb();
}

function validateBackupEnvelope(envelope: BackupEnvelope): void {
  if (!envelope || typeof envelope !== 'object') throw new Error('Backup file is not valid JSON.');
  if (envelope.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported backup schema ${String(envelope.schemaVersion)}.`);
  }
  if (!envelope.stores || !Array.isArray(envelope.stores.routes) || !Array.isArray(envelope.stores.workouts) || !Array.isArray(envelope.stores.rides)) {
    throw new Error('Backup is missing one or more data stores.');
  }
  if (!envelope.persistedState || typeof envelope.persistedState.localStorage !== 'object' || typeof envelope.persistedState.sessionStorage !== 'object') {
    throw new Error('Backup is missing persisted settings.');
  }
}

function sanitizePersistedState(values: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(PERSISTED_KEY_PREFIX)) continue;
    if (typeof value !== 'string') continue;
    clean[key] = value;
  }
  return clean;
}

function migrateRideRecord(ride: RideRecord): RideRecord {
  return {
    ...ride,
    metrics: ride.metrics,
    zones: ride.zones ?? undefined,
    bestEfforts: ride.bestEfforts ?? undefined,
    ftpW: ride.ftpW ?? undefined,
    routeRef: ride.routeRef ?? undefined,
    workoutRef: ride.workoutRef ?? undefined,
    rpe: ride.rpe ?? undefined,
    notes: ride.notes ?? undefined,
    tags: ride.tags ?? undefined,
    workoutCompliance: ride.workoutCompliance ?? undefined,
  };
}

function collectStorage(storage: Storage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(PERSISTED_KEY_PREFIX)) continue;
    const value = storage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

function replaceStorage(storage: Storage, values: Record<string, string>): void {
  for (const key of Object.keys(storage)) {
    if (key.startsWith(PERSISTED_KEY_PREFIX)) storage.removeItem(key);
  }
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith(PERSISTED_KEY_PREFIX)) storage.setItem(key, value);
  }
}

function byteSize(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

export { DB_VERSION };
