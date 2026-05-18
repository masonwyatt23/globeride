import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Route, SavedRoute } from '@/types';
import { SAMPLE_ROUTES } from '@/lib/sampleRoutes';

const DB_NAME = 'globeride';
const DB_VERSION = 1;
const STORE = 'routes';

interface GlobeRideDB extends DBSchema {
  routes: {
    key: string;
    value: SavedRoute;
    indexes: { 'by-savedAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<GlobeRideDB>> | null = null;

function getDb(): Promise<IDBPDatabase<GlobeRideDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GlobeRideDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('by-savedAt', 'savedAt');
        }
      },
    });
  }
  return dbPromise;
}

/** Format a coordinate pair as "46.59°N, 7.91°E" for display. */
function formatLocation(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** Build a SavedRoute envelope from a Route (adds savedAt + derived location). */
export function toSavedRoute(route: Route, source: SavedRoute['source'] = 'gpx'): SavedRoute {
  const first = route.points[0];
  return {
    ...route,
    savedAt: Date.now(),
    location: formatLocation(first.lat, first.lon),
    source,
  };
}

/** Persist a route to the library. Overwrites any existing entry with the same id. */
export async function saveRoute(route: Route, source: SavedRoute['source'] = 'gpx'): Promise<SavedRoute> {
  const db = await getDb();
  const saved = toSavedRoute(route, source);
  await db.put(STORE, saved);
  return saved;
}

/** List every saved route, newest first. */
export async function listRoutes(): Promise<SavedRoute[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE, 'by-savedAt');
  return all.reverse();
}

/** Load a single saved route by id. Returns undefined if missing. */
export async function loadRoute(id: string): Promise<SavedRoute | undefined> {
  const db = await getDb();
  return db.get(STORE, id);
}

/** Delete a saved route. No-op if missing. */
export async function deleteRoute(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

/** Check whether a route id already exists in the library. */
export async function hasRoute(id: string): Promise<boolean> {
  const db = await getDb();
  const key = await db.getKey(STORE, id);
  return key !== undefined;
}

/** Total number of saved routes — cheap, uses the store's key count. */
export async function countRoutes(): Promise<number> {
  const db = await getDb();
  return db.count(STORE);
}

/**
 * Insert any sample routes that aren't already present. Idempotent: runs every
 * launch but only writes the gaps, so users who deleted a sample don't get it
 * back uninvited.
 */
export async function seedSampleRoutesIfMissing(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const seedKey = 'globeride.samplesSeeded.v1';
  if (localStorage.getItem(seedKey)) {
    await tx.done;
    return;
  }
  for (const seed of SAMPLE_ROUTES) {
    const existing = await store.getKey(seed.id);
    if (existing) continue;
    const route = seed.make();
    await store.put(toSavedRoute(route, 'sample'));
  }
  await tx.done;
  localStorage.setItem(seedKey, '1');
}
