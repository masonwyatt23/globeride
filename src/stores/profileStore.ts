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
  // ── Wave 17-23 counters (default 0 for existing profiles) ─────────────────
  /** Total P2P races finished. */
  totalRacesFinished: number;
  /** Number of race manifests created by this rider. */
  totalManifestsCreated: number;
  /** Lifetime seconds spent in an aerodynamic draft cone. */
  totalDraftSec: number;
  /** How many times the rider finished ahead of all loaded pace bots. */
  totalBotBeats: number;
  /** How many times the rider followed an AI Coach recommendation within a week. */
  totalCoachFollowed: number;
  /**
   * Set of ISO-3166-1 alpha-2 country codes where rides have started.
   * Stored as a serialisable array; converted to a Set for checks.
   */
  startCountries: string[];
  /** Total World Tour stage rides completed. */
  totalWorldTourStages: number;
  /** How many times /companion was opened during a ride. */
  totalCompanionSessions: number;
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
    totalRacesFinished: 0,
    totalManifestsCreated: 0,
    totalDraftSec: 0,
    totalBotBeats: 0,
    totalCoachFollowed: 0,
    startCountries: [],
    totalWorldTourStages: 0,
    totalCompanionSessions: 0,
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
  /**
   * Increment the race-manifests-created counter.
   * Call this when the user successfully creates and saves a new race manifest.
   */
  incrementManifestsCreated: () => void;
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

      incrementManifestsCreated: () => {
        const { profile } = get();
        if (!profile) return;
        set({
          profile: {
            ...profile,
            totalManifestsCreated: (profile.totalManifestsCreated ?? 0) + 1,
          },
        });
      },

      recordRide: (input) => {
        const { profile } = get();
        if (!profile) return;
        const earned = xpForRide(input);

        // Merge new start country into the set (deduped).
        const prevCountries = profile.startCountries ?? [];
        const nextCountries =
          input.startCountry && !prevCountries.includes(input.startCountry)
            ? [...prevCountries, input.startCountry]
            : prevCountries;

        set({
          profile: {
            ...profile,
            totalDistanceM:        profile.totalDistanceM + input.distanceM,
            totalRides:            profile.totalRides + 1,
            totalAscentM:          profile.totalAscentM + input.ascentM,
            totalWorkoutsCompleted:
              profile.totalWorkoutsCompleted + (input.workoutCompleted ? 1 : 0),
            xp: profile.xp + earned,
            // Wave 17-23 counters — default missing fields to 0 for old profiles.
            totalRacesFinished:
              (profile.totalRacesFinished ?? 0) + (input.raceFinished ? 1 : 0),
            totalDraftSec:
              (profile.totalDraftSec ?? 0) + (input.draftSec ?? 0),
            totalBotBeats:
              (profile.totalBotBeats ?? 0) + (input.beatAllBots ? 1 : 0),
            totalCoachFollowed:
              (profile.totalCoachFollowed ?? 0) + (input.followedCoachRecommendation ? 1 : 0),
            startCountries: nextCountries,
            totalWorldTourStages:
              (profile.totalWorldTourStages ?? 0) + (input.isWorldTourStage ? 1 : 0),
            totalCompanionSessions:
              (profile.totalCompanionSessions ?? 0) + (input.companionOpenedThisRide ? 1 : 0),
            // totalManifestsCreated is incremented separately via incrementManifestsCreated().
            totalManifestsCreated: profile.totalManifestsCreated ?? 0,
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
