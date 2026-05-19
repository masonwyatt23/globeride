/**
 * Regression + integration test for the single shared 'globeride' IndexedDB.
 *
 * Before src/lib/db.ts existed, routeLibrary / workoutLibrary / rideHistory
 * each called openDB('globeride', V) with its own hardcoded V (1 / 2 / 3).
 * IndexedDB allows only one version per database and throws VersionError if
 * opened below the on-disk version, so whichever module opened the DB first
 * won and the other two silently lost every read and write — order-dependent
 * data loss for every user.
 *
 * This suite exercises CRUD across all three persistence modules in one
 * process. Under the old code the second/third module's open would throw
 * VersionError; with the unified opener every module shares one connection
 * at one version with all stores created by one idempotent upgrade.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  DB_NAME,
  DB_VERSION,
  ROUTES_STORE,
  WORKOUTS_STORE,
  RIDES_STORE,
  getDb,
} from '@/lib/db';
import { saveRoute, listRoutes, countRoutes } from '@/lib/routeLibrary';
import { saveWorkout, listWorkouts, countWorkouts } from '@/lib/workoutLibrary';
import { saveRide, listRides, countRides, rideId } from '@/lib/rideHistory';
import type { RideRecord } from '@/lib/rideHistory';
import type { Route } from '@/types';
import type { Workout } from '@/lib/workout';

const route: Route = {
  id: 'route-1',
  name: 'Alpe Test',
  points: [
    { lat: 45.0, lon: 6.0, ele: 700, distance: 0 },
    { lat: 45.01, lon: 6.01, ele: 900, distance: 2000 },
  ],
  totalDistance: 2000,
  ascent: 200,
  descent: 0,
  minElevation: 700,
  maxElevation: 900,
  loadedAt: Date.now(),
};

const workout: Workout = {
  id: 'workout-1',
  name: 'Sweet Spot 2x20',
  createdAt: Date.now(),
  source: 'manual',
  segments: [
    { id: 's1', kind: 'warmup', durationSec: 600, target: { type: 'ftpPct', value: 0.55 } },
    { id: 's2', kind: 'steady', durationSec: 1200, target: { type: 'ftpPct', value: 0.9 } },
  ],
};

const ride: RideRecord = {
  id: rideId(),
  name: 'Alpe Test — ride',
  startedAt: Date.now(),
  durationSec: 1800,
  distanceM: 2000,
  ascentM: 200,
  avgPower: 210,
  avgSpeed: 7.2,
  sampleCount: 1800,
  samples: [],
  source: 'route',
};

describe('shared db.ts invariants', () => {
  it('exposes a single DB version and stable store-name constants', () => {
    expect(DB_NAME).toBe('globeride');
    expect(DB_VERSION).toBe(3);
    expect(ROUTES_STORE).toBe('routes');
    expect(WORKOUTS_STORE).toBe('workouts');
    expect(RIDES_STORE).toBe('rides');
  });

  it('opens one connection that contains every store (idempotent upgrade)', async () => {
    const db = await getDb();
    expect(db.version).toBe(DB_VERSION);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(
      [ROUTES_STORE, WORKOUTS_STORE, RIDES_STORE].sort(),
    );
  });
});

describe('cross-module CRUD on the same database (regression)', () => {
  it('routeLibrary persists and reads back without VersionError', async () => {
    const saved = await saveRoute(route, 'gpx');
    expect(saved.id).toBe('route-1');
    expect(await countRoutes()).toBe(1);
    const all = await listRoutes();
    expect(all.map((r) => r.id)).toContain('route-1');
  });

  it('workoutLibrary persists and reads back on the same DB', async () => {
    await saveWorkout(workout);
    expect(await countWorkouts()).toBe(1);
    const all = await listWorkouts();
    expect(all.map((w) => w.id)).toContain('workout-1');
  });

  it('rideHistory persists and reads back on the same DB', async () => {
    await saveRide(ride);
    expect(await countRides()).toBe(1);
    const all = await listRides();
    expect(all.map((r) => r.id)).toContain(ride.id);
  });

  it('all three stores hold their data simultaneously (no module clobbered another)', async () => {
    expect(await countRoutes()).toBe(1);
    expect(await countWorkouts()).toBe(1);
    expect(await countRides()).toBe(1);
  });
});
