/**
 * AI workout store — persists the user's provider preference and recent
 * generated workouts. Additive to settingsStore; does not modify it.
 *
 * Persisted keys added to localStorage:
 *   globeride.ai.v1
 *
 * Additive changes to settingsStore: NONE — we read ftpW from useSettingsStore
 * in the UI layer only; no coupling at the store level.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AIProviderName } from '@/lib/ai/provider';
import type { Workout } from '@/lib/workout';

export interface AIStoreState {
  /**
   * Override for the provider. 'auto' means respect VITE_AI_PROVIDER env.
   * When the user explicitly switches in the UI, this is set to 'xai' or
   * 'ollama' and takes precedence over the env var at runtime.
   *
   * Note: this is a UI preference — the actual resolution still falls back
   * to env vars if the override is 'auto'.
   */
  providerOverride: AIProviderName | 'auto';

  /** Recently AI-generated workouts (newest first, capped at 20). */
  recentWorkouts: Workout[];

  /** Setter for the provider preference. */
  setProviderOverride: (p: AIProviderName | 'auto') => void;

  /** Save a newly generated workout to the recents list. */
  addRecentWorkout: (w: Workout) => void;

  /** Remove a workout by id. */
  removeRecentWorkout: (id: string) => void;
}

export const useAIStore = create<AIStoreState>()(
  persist(
    (set) => ({
      providerOverride: 'auto',
      recentWorkouts: [],

      setProviderOverride: (p) => set({ providerOverride: p }),

      addRecentWorkout: (w) =>
        set((s) => ({
          recentWorkouts: [w, ...s.recentWorkouts.filter((x) => x.id !== w.id)].slice(0, 20),
        })),

      removeRecentWorkout: (id) =>
        set((s) => ({
          recentWorkouts: s.recentWorkouts.filter((w) => w.id !== id),
        })),
    }),
    {
      name: 'globeride.ai.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({
        providerOverride: s.providerOverride,
        recentWorkouts: s.recentWorkouts,
      }),
    },
  ),
);
