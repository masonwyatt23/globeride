import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData, createBackupEnvelope, getLocalDataInventory, restoreBackupEnvelope } from '@/lib/dataBackup';
import { deleteGlobeRideDb } from '@/lib/db';
import { saveRoute, countRoutes } from '@/lib/routeLibrary';
import { saveRide, countRides } from '@/lib/rideHistory';
import type { RideRecord } from '@/lib/rideHistory';
import type { Route } from '@/types';

const storage = () => {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
  } as Storage;
};

const route: Route = {
  id: 'backup-route',
  name: 'Backup Route',
  points: [
    { lat: 1, lon: 2, ele: 3, distance: 0 },
    { lat: 1.1, lon: 2.1, ele: 4, distance: 100 },
  ],
  totalDistance: 100,
  ascent: 1,
  descent: 0,
  minElevation: 3,
  maxElevation: 4,
  loadedAt: 1,
};

const ride: RideRecord = {
  id: 'backup-ride',
  name: 'Backup Ride',
  startedAt: 1,
  durationSec: 60,
  distanceM: 100,
  ascentM: 1,
  avgPower: 150,
  avgSpeed: 2,
  sampleCount: 0,
  samples: [],
  source: 'route',
};

describe('dataBackup', () => {
  beforeEach(async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: storage(), sessionStorage: storage() },
      configurable: true,
    });
    await deleteGlobeRideDb();
  });

  it('exports and restores IndexedDB stores plus GlobeRide persisted state', async () => {
    await saveRoute(route, 'gpx');
    await saveRide(ride);
    window.localStorage.setItem('globeride.settings', '{"state":{}}');
    window.localStorage.setItem('other-app', 'ignored');

    const backup = await createBackupEnvelope();
    expect(backup.stores.routes).toHaveLength(1);
    expect(backup.stores.rides).toHaveLength(1);
    expect(backup.persistedState.localStorage['globeride.settings']).toBeTruthy();
    expect(backup.persistedState.localStorage['other-app']).toBeUndefined();

    await clearAllLocalData();
    expect(await countRoutes()).toBe(0);
    expect(window.localStorage.length).toBe(0);

    await restoreBackupEnvelope(backup);
    expect(await countRoutes()).toBe(1);
    expect(await countRides()).toBe(1);
    expect(window.localStorage.getItem('globeride.settings')).toBeTruthy();
  });

  it('reports a local data inventory', async () => {
    await saveRoute(route, 'gpx');
    window.sessionStorage.setItem('globeride.strava.refreshTokenOverride', 'token');

    const inventory = await getLocalDataInventory();
    expect(inventory.stores.routes.count).toBe(1);
    expect(inventory.persistedState.sessionStorageKeys).toBe(1);
    expect(inventory.totalBytes).toBeGreaterThan(0);
  });
});
