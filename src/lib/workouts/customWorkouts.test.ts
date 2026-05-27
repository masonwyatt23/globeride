/**
 * Unit tests for src/lib/workouts/customWorkouts.ts
 *
 * Tests cover:
 *  - generateWorkoutId format + uniqueness
 *  - workoutTSS math for known cases
 *  - isCustomWorkout type guard
 *  - makeCustomWorkout shape
 *  - round-trip through save / list / delete (mocked IndexedDB layer)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workout } from '@/lib/workout';
import { estimateTSS } from '@/lib/workout';
import {
  generateWorkoutId,
  workoutTSS,
  isCustomWorkout,
  makeCustomWorkout,
  listCustomWorkouts,
  saveCustomWorkout,
  deleteCustomWorkout,
  loadCustomWorkout,
} from '@/lib/workouts/customWorkouts';

// ---------------------------------------------------------------------------
// Mock workoutLibrary so tests don't need IndexedDB
// ---------------------------------------------------------------------------

const _store = new Map<string, Workout>();

vi.mock('@/lib/workoutLibrary', () => ({
  saveWorkout: async (w: Workout) => { _store.set(w.id, w); },
  listWorkouts: async () => Array.from(_store.values()),
  deleteWorkout: async (id: string) => { _store.delete(id); },
  loadWorkout: async (id: string) => _store.get(id),
}));

beforeEach(() => { _store.clear(); });

// ---------------------------------------------------------------------------
// generateWorkoutId
// ---------------------------------------------------------------------------

describe('generateWorkoutId', () => {
  it('starts with "custom-"', () => {
    expect(generateWorkoutId()).toMatch(/^custom-/);
  });

  it('generates unique ids across 100 calls', () => {
    const ids = Array.from({ length: 100 }, generateWorkoutId);
    expect(new Set(ids).size).toBe(100);
  });

  it('contains only safe URL characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateWorkoutId()).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// workoutTSS
// ---------------------------------------------------------------------------

describe('workoutTSS', () => {
  it('returns 0 when ftpW is 0', () => {
    const segs = [{ id: 'x', kind: 'steady' as const, durationSec: 3600, target: { type: 'ftpPct' as const, value: 1.0 } }];
    expect(workoutTSS({ segments: segs }, 0)).toBe(0);
  });

  it('returns 100 TSS for exactly 1 hour at FTP', () => {
    const segs = [{ id: 'x', kind: 'steady' as const, durationSec: 3600, target: { type: 'ftpPct' as const, value: 1.0 } }];
    expect(workoutTSS({ segments: segs }, 250)).toBe(100);
  });

  it('returns 0 for a free-ride segment (no power target)', () => {
    const segs = [{ id: 'x', kind: 'freeride' as const, durationSec: 3600, target: { type: 'free' as const } }];
    expect(workoutTSS({ segments: segs }, 250)).toBe(0);
  });

  it('scales correctly with intensity squared (harder effort = more TSS)', () => {
    const easy = [{ id: 'e', kind: 'steady' as const, durationSec: 3600, target: { type: 'ftpPct' as const, value: 0.65 } }];
    const hard = [{ id: 'h', kind: 'steady' as const, durationSec: 3600, target: { type: 'ftpPct' as const, value: 1.0 } }];
    expect(workoutTSS({ segments: hard }, 200)).toBeGreaterThan(workoutTSS({ segments: easy }, 200));
  });

  it('accumulates TSS across multiple segments', () => {
    const mixed = [
      { id: 'w', kind: 'warmup'  as const, durationSec: 600,  target: { type: 'ftpPct' as const, value: 0.55 } },
      { id: 's', kind: 'steady'  as const, durationSec: 1800, target: { type: 'ftpPct' as const, value: 0.88 } },
      { id: 'c', kind: 'cooldown' as const, durationSec: 600, target: { type: 'ftpPct' as const, value: 0.50 } },
    ];
    const tss = workoutTSS({ segments: mixed }, 250);
    expect(tss).toBeGreaterThan(0);
    // Sanity: 30-min mixed workout with ~Z3 block should be < 60 TSS
    expect(tss).toBeLessThan(60);
  });

  it('matches estimateTSS from workout.ts for the same data', () => {
    const segs = [{ id: 'x', kind: 'interval' as const, durationSec: 300, target: { type: 'ftpPct' as const, value: 1.1 } }];
    const shell: Workout = { id: '', name: '', createdAt: 0, source: 'manual', segments: segs };
    // workoutTSS delegates to estimateTSS internally — results must be identical
    expect(workoutTSS({ segments: segs }, 200)).toBe(estimateTSS(shell, 200));
  });
});

// ---------------------------------------------------------------------------
// isCustomWorkout
// ---------------------------------------------------------------------------

describe('isCustomWorkout', () => {
  it('returns true for manual+custom workouts', () => {
    const w: Workout = { id: 'c1', name: 'Test', createdAt: 0, source: 'manual', category: 'custom', segments: [] };
    expect(isCustomWorkout(w)).toBe(true);
  });

  it('returns false for preset workouts', () => {
    const w: Workout = { id: 'p1', name: 'Preset', createdAt: 0, source: 'preset', segments: [] };
    expect(isCustomWorkout(w)).toBe(false);
  });

  it('returns false for manual workouts without custom category', () => {
    const w: Workout = { id: 'm1', name: 'Manual', createdAt: 0, source: 'manual', category: 'threshold', segments: [] };
    expect(isCustomWorkout(w)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// makeCustomWorkout
// ---------------------------------------------------------------------------

describe('makeCustomWorkout', () => {
  it('sets required fields correctly', () => {
    const w = makeCustomWorkout('Sprint 4×4', []);
    expect(w.source).toBe('manual');
    expect(w.category).toBe('custom');
    expect(w.isCustom).toBe(true);
    expect(w.name).toBe('Sprint 4×4');
  });

  it('trims whitespace from name', () => {
    const w = makeCustomWorkout('  My Workout  ', []);
    expect(w.name).toBe('My Workout');
  });

  it('uses "Untitled Workout" for empty name', () => {
    const w = makeCustomWorkout('', []);
    expect(w.name).toBe('Untitled Workout');
  });

  it('accepts an existing id to support edit round-trips', () => {
    const w = makeCustomWorkout('Edit me', [], undefined, 'custom-existing-id');
    expect(w.id).toBe('custom-existing-id');
  });

  it('sets createdAt to a recent timestamp', () => {
    const before = Date.now();
    const w = makeCustomWorkout('T', []);
    const after = Date.now();
    expect(w.createdAt).toBeGreaterThanOrEqual(before);
    expect(w.createdAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: save / list / load / delete
// ---------------------------------------------------------------------------

describe('save → list → load → delete round-trip', () => {
  it('saved workout appears in listCustomWorkouts', async () => {
    const w = makeCustomWorkout('My 30 min ride', []);
    await saveCustomWorkout(w);
    const list = await listCustomWorkouts();
    expect(list.some((x) => x.id === w.id)).toBe(true);
  });

  it('listCustomWorkouts filters out non-custom workouts', async () => {
    const preset: Workout = { id: 'preset-1', name: 'Daily', createdAt: 0, source: 'preset', segments: [] };
    _store.set(preset.id, preset);
    const custom = makeCustomWorkout('My workout', []);
    await saveCustomWorkout(custom);
    const list = await listCustomWorkouts();
    expect(list.every(isCustomWorkout)).toBe(true);
    expect(list.some((x) => x.id === 'preset-1')).toBe(false);
  });

  it('loadCustomWorkout retrieves the correct workout', async () => {
    const w = makeCustomWorkout('Loaded', []);
    await saveCustomWorkout(w);
    const loaded = await loadCustomWorkout(w.id);
    expect(loaded?.id).toBe(w.id);
    expect(loaded?.name).toBe('Loaded');
  });

  it('loadCustomWorkout returns undefined for a non-custom workout', async () => {
    const preset: Workout = { id: 'preset-2', name: 'Preset', createdAt: 0, source: 'preset', segments: [] };
    _store.set(preset.id, preset);
    expect(await loadCustomWorkout('preset-2')).toBeUndefined();
  });

  it('deleteCustomWorkout removes the workout', async () => {
    const w = makeCustomWorkout('Delete me', []);
    await saveCustomWorkout(w);
    await deleteCustomWorkout(w.id);
    const list = await listCustomWorkouts();
    expect(list.some((x) => x.id === w.id)).toBe(false);
  });

  it('deleteCustomWorkout is a no-op for missing ids', async () => {
    await expect(deleteCustomWorkout('nonexistent-id')).resolves.toBeUndefined();
  });
});
