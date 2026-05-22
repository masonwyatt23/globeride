/**
 * Ghost rider store — minimal state: whether ghosts are enabled and how many
 * are currently loaded on the globe.
 *
 * Kept separate from rideStore to avoid bloating it. CesiumViewer reads
 * ghostsEnabled to decide whether to create/update ghost avatars, and writes
 * ghostCount after loading.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GhostState {
  /** User toggle — persisted so the preference survives page reload. */
  ghostsEnabled: boolean;
  /** Number of ghost avatars currently on the globe (0 when none loaded). */
  ghostCount: number;

  setGhostsEnabled: (enabled: boolean) => void;
  setGhostCount: (count: number) => void;
}

export const useGhostStore = create<GhostState>()(
  persist(
    (set) => ({
      ghostsEnabled: true,
      ghostCount: 0,

      setGhostsEnabled: (enabled) => set({ ghostsEnabled: enabled }),
      setGhostCount: (count) => set({ ghostCount: count }),
    }),
    {
      name: 'globeride.ghosts',
      // Only persist the user toggle, not the transient count.
      partialize: (s) => ({ ghostsEnabled: s.ghostsEnabled }),
    },
  ),
);
