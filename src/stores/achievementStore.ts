/**
 * achievementStore — Zustand persist store for unlocked achievements.
 *
 * Persisted to localStorage under 'globeride.achievements.v1'.
 *
 * State:
 *   unlocked   — map from achievement id → unix ms when it was unlocked
 *
 * Actions:
 *   evaluateRide(profile, ride)
 *     → checks the full catalog against the (post-ride) profile, records any
 *       newly-unlocked achievements, and returns them so the caller can show
 *       a toast. Safe to call multiple times; already-unlocked ids are skipped.
 *   clearAll()
 *     → wipe everything (dev / debug only).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  evaluateNewAchievements,
  getAchievement,
  type Achievement,
} from '@/lib/achievements';
import type { RiderProfile } from '@/stores/profileStore';
import type { RideXpInput } from '@/lib/progression';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number; // unix ms
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AchievementStoreState {
  /** achievement id → unix ms when unlocked */
  unlocked: Record<string, number>;

  /**
   * Evaluate the full achievement catalog against the post-ride profile.
   * Returns full Achievement objects for every newly-unlocked achievement
   * (empty array if nothing new).
   */
  evaluateRide: (profile: RiderProfile, ride: RideXpInput) => Achievement[];

  /** Wipe all records (dev only). */
  clearAll: () => void;
}

export const useAchievementStore = create<AchievementStoreState>()(
  persist(
    (set, get) => ({
      unlocked: {},

      evaluateRide: (profile, ride) => {
        const { unlocked } = get();
        const alreadyUnlocked = new Set(Object.keys(unlocked));

        const newIds = evaluateNewAchievements(profile, ride, alreadyUnlocked);
        if (newIds.length === 0) return [];

        const now = Date.now();
        const patch: Record<string, number> = {};
        for (const id of newIds) {
          patch[id] = now;
        }

        set((state) => ({ unlocked: { ...state.unlocked, ...patch } }));

        // Return the full Achievement objects for toast display.
        return newIds
          .map((id) => getAchievement(id))
          .filter((a): a is Achievement => a !== undefined);
      },

      clearAll: () => set({ unlocked: {} }),
    }),
    {
      name: 'globeride.achievements.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ unlocked: s.unlocked }),
    },
  ),
);
