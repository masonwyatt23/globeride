/**
 * profileStore — local-first rider profile with XP progression.
 *
 * Persisted to localStorage exactly like settingsStore. No server, no auth.
 * A "profile" is just a named rider identity with accumulated ride stats.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { xpForRide, type RideXpInput } from '@/lib/progression';
import { shortId } from '@/lib/utils';

export interface RiderProfile {
  /** Stable local identifier. */
  id: string;
  displayName: string;
  createdAt: number;
  totalDistanceM: number;
  totalRides: number;
  totalAscentM: number;
  totalWorkoutsCompleted: number;
  xp: number;
}

function makeProfile(name: string): RiderProfile {
  return {
    id: shortId(),
    displayName: name.trim() || 'Rider',
    createdAt: Date.now(),
    totalDistanceM: 0,
    totalRides: 0,
    totalAscentM: 0,
    totalWorkoutsCompleted: 0,
    xp: 0,
  };
}

interface ProfileStoreState {
  profile: RiderProfile | null;

  /** Create a profile if none exists (idempotent — won't overwrite). */
  createProfile: (name: string) => void;
  /** Rename the active profile. */
  renameProfile: (name: string) => void;
  /**
   * Record a finished ride: increment lifetime totals and award XP.
   * No-op if no profile exists.
   */
  recordRide: (input: RideXpInput) => void;
}

export const useProfileStore = create<ProfileStoreState>()(
  persist(
    (set, get) => ({
      profile: null,

      createProfile: (name) => {
        if (get().profile) return; // never overwrite existing profile
        set({ profile: makeProfile(name) });
      },

      renameProfile: (name) => {
        const { profile } = get();
        if (!profile) return;
        set({ profile: { ...profile, displayName: name.trim() || 'Rider' } });
      },

      recordRide: (input) => {
        const { profile } = get();
        if (!profile) return;
        const earned = xpForRide(input);
        set({
          profile: {
            ...profile,
            totalDistanceM:        profile.totalDistanceM + input.distanceM,
            totalRides:            profile.totalRides + 1,
            totalAscentM:          profile.totalAscentM + input.ascentM,
            totalWorkoutsCompleted:
              profile.totalWorkoutsCompleted + (input.workoutCompleted ? 1 : 0),
            xp: profile.xp + earned,
          },
        });
      },
    }),
    {
      name: 'globeride.profile.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
