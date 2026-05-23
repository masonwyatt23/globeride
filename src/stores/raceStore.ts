/**
 * raceStore — Zustand persisted store for the P2P race protocol.
 *
 * Persists:
 *   - loadedManifests: races the user has imported / created
 *   - localResults: own finished results + imported peer results, deduped by signature
 *
 * Nothing is sent to a server. Everything lives in localStorage.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RaceManifest, RaceResult } from '@/lib/race/raceProtocol';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface RaceStoreState {
  /** All race manifests the user has loaded (created or imported). */
  loadedManifests: RaceManifest[];

  /**
   * Results keyed by raceId → array of RaceResults.
   * Contains both the user's own results AND imported peer results.
   * Deduped on signature at insert time.
   */
  localResults: Record<string, RaceResult[]>;

  // --- Actions ---

  /**
   * Add a manifest to the store, ignoring duplicates (same id).
   */
  loadManifest: (m: RaceManifest) => void;

  /** Remove a manifest (and optionally its results) by id. */
  removeManifest: (id: string) => void;

  /**
   * Record a result produced by this device.
   * Deduped by signature — silently drops exact duplicates.
   */
  recordResult: (r: RaceResult) => void;

  /**
   * Import a result received from a peer.
   * Same dedup logic as recordResult — one signature per race per store.
   */
  importPeerResult: (r: RaceResult) => void;

  /** Remove all results for a given raceId. */
  clearResults: (raceId: string) => void;

  /** Return results for a specific race, sorted by finishTimeMs ascending. */
  getResultsForRace: (raceId: string) => RaceResult[];
}

// ---------------------------------------------------------------------------
// Dedup helper
// ---------------------------------------------------------------------------

function insertResult(
  existing: RaceResult[],
  incoming: RaceResult,
): RaceResult[] {
  // Dedup by signature — signatures are HMAC-SHA-256 hex, collision-resistant
  if (existing.some((r) => r.signature === incoming.signature)) {
    return existing;
  }
  return [...existing, incoming];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useRaceStore = create<RaceStoreState>()(
  persist(
    (set, get) => ({
      loadedManifests: [],
      localResults: {},

      loadManifest: (m) =>
        set((s) => {
          if (s.loadedManifests.some((x) => x.id === m.id)) return s;
          return { loadedManifests: [...s.loadedManifests, m] };
        }),

      removeManifest: (id) =>
        set((s) => ({
          loadedManifests: s.loadedManifests.filter((m) => m.id !== id),
        })),

      recordResult: (r) =>
        set((s) => {
          const existing = s.localResults[r.raceId] ?? [];
          const updated = insertResult(existing, r);
          if (updated === existing) return s; // no change, avoid re-render
          return {
            localResults: { ...s.localResults, [r.raceId]: updated },
          };
        }),

      importPeerResult: (r) =>
        set((s) => {
          const existing = s.localResults[r.raceId] ?? [];
          const updated = insertResult(existing, r);
          if (updated === existing) return s;
          return {
            localResults: { ...s.localResults, [r.raceId]: updated },
          };
        }),

      clearResults: (raceId) =>
        set((s) => {
          const next = { ...s.localResults };
          delete next[raceId];
          return { localResults: next };
        }),

      getResultsForRace: (raceId) => {
        const results = get().localResults[raceId] ?? [];
        return [...results].sort((a, b) => a.finishTimeMs - b.finishTimeMs);
      },
    }),
    {
      name: 'globeride.race.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) =>
        ({
          loadedManifests: s.loadedManifests,
          localResults: s.localResults,
        }) satisfies Pick<RaceStoreState, 'loadedManifests' | 'localResults'>,
    },
  ),
);
