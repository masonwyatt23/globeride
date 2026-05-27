/**
 * Custom workout persistence — thin, typed wrapper over workoutLibrary's
 * IndexedDB store. Keeps custom-workout–specific semantics (id scheme,
 * TSS helper, list/save/delete) separate from the generic library CRUD.
 *
 * Custom workouts are stored as ordinary Workout objects with
 *   source: 'manual'
 *   category: 'custom'
 * so they appear under the "Custom" tab in WorkoutPicker automatically.
 *
 * Pure helpers (generateWorkoutId, workoutTSS) are dependency-free so they
 * can be unit-tested in the Vitest node environment without any DOM or idb.
 */

import type { Workout, WorkoutSegment } from '@/lib/workout';
import { estimateTSS, workoutId } from '@/lib/workout';
import {
  saveWorkout as libSave,
  listWorkouts as libList,
  deleteWorkout as libDelete,
  loadWorkout as libLoad,
} from '@/lib/workoutLibrary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A user-created workout. Extends the base Workout with an explicit isCustom
 * discriminant so callers can narrow the type without inspecting `source`.
 */
export interface CustomWorkout extends Workout {
  source: 'manual';
  category: 'custom';
  isCustom: true;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested, no I/O)
// ---------------------------------------------------------------------------

/**
 * Generate a stable, collision-resistant id for a new custom workout.
 * Format: `custom-<base36 timestamp>-<random hex>`
 */
export function generateWorkoutId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `custom-${ts}-${rand}`;
}

/**
 * Rough Training Stress Score (intensity-factor–based, same formula as
 * estimateTSS in workout.ts) for a workout shape without needing the
 * full Workout object. Used for live TSS preview in the builder.
 *
 * Returns 0 when ftpW is 0 or no power-target segments are present.
 */
export function workoutTSS(
  workout: { segments: WorkoutSegment[] },
  ftpW: number,
): number {
  // Delegate to the canonical implementation so they never drift.
  const shell: Workout = {
    id: '',
    name: '',
    createdAt: 0,
    source: 'manual',
    segments: workout.segments,
  };
  return estimateTSS(shell, ftpW);
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

export function isCustomWorkout(w: Workout): w is CustomWorkout {
  return w.source === 'manual' && w.category === 'custom';
}

// ---------------------------------------------------------------------------
// Persistence (delegates to workoutLibrary IndexedDB)
// ---------------------------------------------------------------------------

/**
 * List all custom workouts (source === 'manual', category === 'custom'),
 * newest first. Returns an empty array on any error.
 */
export async function listCustomWorkouts(): Promise<CustomWorkout[]> {
  const all = await libList();
  return all.filter(isCustomWorkout);
}

/**
 * Persist a custom workout. Fills in required fields so callers don't have
 * to repeat them. Overwrites any existing entry with the same id.
 */
export async function saveCustomWorkout(workout: CustomWorkout): Promise<void> {
  await libSave(workout);
}

/**
 * Load a single custom workout by id. Returns undefined if missing or if
 * the stored workout is not a custom workout.
 */
export async function loadCustomWorkout(id: string): Promise<CustomWorkout | undefined> {
  const w = await libLoad(id);
  if (!w || !isCustomWorkout(w)) return undefined;
  return w;
}

/**
 * Delete a custom workout by id. No-op if missing.
 */
export async function deleteCustomWorkout(id: string): Promise<void> {
  await libDelete(id);
}

/**
 * Build a brand-new CustomWorkout object ready to save. Fills in id,
 * createdAt, source, category, and isCustom.
 */
export function makeCustomWorkout(
  name: string,
  segments: WorkoutSegment[],
  description?: string,
  existingId?: string,
): CustomWorkout {
  return {
    id: existingId ?? generateWorkoutId(),
    name: name.trim() || 'Untitled Workout',
    description,
    createdAt: Date.now(),
    source: 'manual',
    category: 'custom',
    isCustom: true,
    segments,
  };
}

// ---------------------------------------------------------------------------
// Re-export workoutId for callers that only import from this module
// ---------------------------------------------------------------------------
export { workoutId };
