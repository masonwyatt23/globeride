/**
 * Ride history — IndexedDB persistence for completed ride records.
 *
 * Storage lives in the shared 'globeride' database opened by @/lib/db
 * (single version, single connection, idempotent all-store upgrade — see
 * that file). This module owns the 'rides' store's CRUD and the pure
 * aggregate helpers.
 *
 * Keep this file pure (no React/store imports) so it is trivially
 * unit-testable and safe to import anywhere.
 */

import type { TelemetrySample } from '@/types';
import { getDb, RIDES_STORE } from '@/lib/db';

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
