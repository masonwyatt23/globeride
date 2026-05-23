/**
 * achievements.ts — Achievement catalog + unlock evaluation.
 *
 * Each Achievement has:
 *   id          — stable string key (never rename)
 *   name        — display name
 *   description — what you did to earn it
 *   icon        — emoji used in the badge face
 *   tier        — 'bronze' | 'silver' | 'gold' | 'platinum'
 *   predicate   — pure function: (profile snapshot, ride input) → boolean
 *
 * evaluateNewAchievements(profile, ride, alreadyUnlocked)
 *   returns the ids of achievements newly unlocked by this ride.
 */

import type { RiderProfile } from '@/stores/profileStore';
import type { RideXpInput } from '@/lib/progression';
import { levelForXp } from '@/lib/progression';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Emoji rendered in the badge face. */
  icon: string;
  tier: AchievementTier;
  /**
   * Called with the *updated* profile (after recordRide has already run) and
   * the raw ride input that triggered this evaluation. Returns true when the
   * achievement condition is met.
   */
  predicate: (profile: RiderProfile, ride: RideXpInput) => boolean;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS: Achievement[] = [
  // ── Distance milestones ──────────────────────────────────────────────────
  {
    id: 'dist_10km',
    name: 'First 10 km',
    description: 'Ride a combined 10 km across all your sessions.',
    icon: '🚴',
    tier: 'bronze',
    predicate: (p) => p.totalDistanceM >= 10_000,
  },
  {
    id: 'dist_50km',
    name: '50 km Rider',
    description: 'Clock up 50 km of total riding distance.',
    icon: '🛣️',
    tier: 'bronze',
    predicate: (p) => p.totalDistanceM >= 50_000,
  },
  {
    id: 'dist_100km',
    name: 'Century Rider',
    description: 'Accumulate 100 km — a classic cycling milestone.',
    icon: '💯',
    tier: 'silver',
    predicate: (p) => p.totalDistanceM >= 100_000,
  },
  {
    id: 'dist_500km',
    name: '500 km Explorer',
    description: 'Half a thousand kilometers in the legs.',
    icon: '🗺️',
    tier: 'silver',
    predicate: (p) => p.totalDistanceM >= 500_000,
  },
  {
    id: 'dist_1000km',
    name: 'Kilo Club',
    description: 'Reach 1,000 km of lifetime distance.',
    icon: '🌍',
    tier: 'gold',
    predicate: (p) => p.totalDistanceM >= 1_000_000,
  },
  {
    id: 'dist_5000km',
    name: 'Grand Tour',
    description: '5,000 km — you could have crossed a continent.',
    icon: '✈️',
    tier: 'platinum',
    predicate: (p) => p.totalDistanceM >= 5_000_000,
  },

  // ── Single-ride distance ──────────────────────────────────────────────────
  {
    id: 'single_50km',
    name: 'Half-Century',
    description: 'Complete a single ride of at least 50 km.',
    icon: '⚡',
    tier: 'silver',
    predicate: (_p, ride) => ride.distanceM >= 50_000,
  },
  {
    id: 'single_100km',
    name: 'Solo Century',
    description: 'Ride 100 km in a single effort.',
    icon: '🏅',
    tier: 'gold',
    predicate: (_p, ride) => ride.distanceM >= 100_000,
  },

  // ── Elevation milestones ─────────────────────────────────────────────────
  {
    id: 'ascent_1000m',
    name: 'Altitude Seeker',
    description: 'Climb a cumulative 1,000 m — a real mountain day.',
    icon: '⛰️',
    tier: 'bronze',
    predicate: (p) => p.totalAscentM >= 1_000,
  },
  {
    id: 'ascent_everest',
    name: 'Everesting',
    description: 'Accumulate 8,849 m of ascent — the height of Everest.',
    icon: '🏔️',
    tier: 'gold',
    predicate: (p) => p.totalAscentM >= 8_849,
  },
  {
    id: 'ascent_3x_everest',
    name: 'Beyond the Summit',
    description: 'Triple Everest: 26,547 m of total climbing.',
    icon: '🌌',
    tier: 'platinum',
    predicate: (p) => p.totalAscentM >= 26_547,
  },
  {
    id: 'single_ascent_hc',
    name: 'HC Climber',
    description: 'Conquer 1,500 m of elevation in a single ride.',
    icon: '🦅',
    tier: 'gold',
    predicate: (_p, ride) => ride.ascentM >= 1_500,
  },

  // ── Ride count milestones ────────────────────────────────────────────────
  {
    id: 'rides_1',
    name: 'First Spin',
    description: 'Complete your very first ride.',
    icon: '🎉',
    tier: 'bronze',
    predicate: (p) => p.totalRides >= 1,
  },
  {
    id: 'rides_10',
    name: 'Regular Rider',
    description: 'Finish 10 rides in total.',
    icon: '🔟',
    tier: 'bronze',
    predicate: (p) => p.totalRides >= 10,
  },
  {
    id: 'rides_50',
    name: 'Committed',
    description: 'Log 50 completed rides.',
    icon: '🗓️',
    tier: 'silver',
    predicate: (p) => p.totalRides >= 50,
  },
  {
    id: 'rides_100',
    name: 'Century of Rides',
    description: '100 rides — consistency is your superpower.',
    icon: '💪',
    tier: 'gold',
    predicate: (p) => p.totalRides >= 100,
  },

  // ── Workout milestones ───────────────────────────────────────────────────
  {
    id: 'workout_1',
    name: 'Structured Start',
    description: 'Complete your first structured workout.',
    icon: '📋',
    tier: 'bronze',
    predicate: (p) => p.totalWorkoutsCompleted >= 1,
  },
  {
    id: 'workout_10',
    name: 'Interval Addict',
    description: 'Finish 10 structured workout sessions.',
    icon: '🏋️',
    tier: 'silver',
    predicate: (p) => p.totalWorkoutsCompleted >= 10,
  },
  {
    id: 'workout_50',
    name: 'Training Machine',
    description: 'Power through 50 structured workouts.',
    icon: '🤖',
    tier: 'gold',
    predicate: (p) => p.totalWorkoutsCompleted >= 50,
  },

  // ── Level milestones ─────────────────────────────────────────────────────
  {
    id: 'level_5',
    name: 'Rising Star',
    description: 'Reach Level 5.',
    icon: '⭐',
    tier: 'bronze',
    predicate: (p) => levelForXp(p.xp) >= 5,
  },
  {
    id: 'level_10',
    name: 'Elite Rider',
    description: 'Reach Level 10.',
    icon: '🌟',
    tier: 'silver',
    predicate: (p) => levelForXp(p.xp) >= 10,
  },
  {
    id: 'level_20',
    name: 'Legend',
    description: 'Reach Level 20.',
    icon: '🏆',
    tier: 'gold',
    predicate: (p) => levelForXp(p.xp) >= 20,
  },
  {
    id: 'level_50',
    name: 'GlobeRide Master',
    description: 'Reach the pinnacle — Level 50.',
    icon: '👑',
    tier: 'platinum',
    predicate: (p) => levelForXp(p.xp) >= 50,
  },

  // ── Wave 17-23: Racing ───────────────────────────────────────────────────
  {
    id: 'race_first_finish',
    name: 'First Race Finished',
    description: 'Complete any P2P race — cross the finish line against real-time opponents.',
    icon: '🏁',
    tier: 'bronze',
    predicate: (p) => (p.totalRacesFinished ?? 0) >= 1,
  },
  {
    id: 'race_podium',
    name: 'Podium Finish',
    description: 'Place 1st, 2nd, or 3rd in a P2P race.',
    icon: '🥇',
    tier: 'gold',
    predicate: (_p, ride) =>
      ride.raceFinished === true &&
      typeof ride.racePosition === 'number' &&
      ride.racePosition >= 1 &&
      ride.racePosition <= 3,
  },
  {
    id: 'race_organiser',
    name: 'Race Organiser',
    description: 'Create and share at least one race manifest.',
    icon: '📋',
    tier: 'silver',
    predicate: (p) => (p.totalManifestsCreated ?? 0) >= 1,
  },

  // ── Wave 17-23: Drafting ─────────────────────────────────────────────────
  {
    id: 'draft_60s',
    name: 'Drafted 60 Seconds',
    description: 'Accumulate 60+ seconds in a draft cone during a single ride.',
    icon: '💨',
    tier: 'bronze',
    predicate: (_p, ride) => (ride.draftSec ?? 0) >= 60,
  },
  {
    id: 'draft_5min',
    name: 'Sat on the Wheel',
    description: 'Finish a ride with 5+ minutes of total drafting time.',
    icon: '🚴‍♂️',
    tier: 'silver',
    predicate: (_p, ride) => (ride.draftSec ?? 0) >= 300,
  },
  {
    id: 'bot_beater',
    name: 'Bot Beater',
    description: 'Finish a ride ahead of all loaded AI pace bots on the same route.',
    icon: '🤖',
    tier: 'silver',
    predicate: (_p, ride) => ride.beatAllBots === true,
  },

  // ── Wave 17-23: Atmosphere / Moods ───────────────────────────────────────
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    description: 'Complete a ride bathed in golden-hour light.',
    icon: '🌅',
    tier: 'bronze',
    predicate: (_p, ride) => ride.mood === 'golden-hour',
  },

  // ── Wave 17-23: Globe exploration ────────────────────────────────────────
  {
    id: 'globe_explorer',
    name: 'Globe Explorer',
    description: 'Start rides in 3 or more different countries.',
    icon: '🌐',
    tier: 'gold',
    predicate: (p) => (p.startCountries ?? []).length >= 3,
  },
  {
    id: 'world_tour_veteran',
    name: 'World Tour Veteran',
    description: 'Ride any of the curated Grand Tour stages.',
    icon: '🏆',
    tier: 'silver',
    predicate: (p) => (p.totalWorldTourStages ?? 0) >= 1,
  },

  // ── Wave 17-23: Companion ────────────────────────────────────────────────
  {
    id: 'companion_user',
    name: 'Companion User',
    description: 'Open the /companion phone screen at least once during a ride.',
    icon: '📱',
    tier: 'bronze',
    predicate: (p) => (p.totalCompanionSessions ?? 0) >= 1,
  },

  // ── New achievements ─────────────────────────────────────────────────────
  {
    id: 'first-race',
    name: 'First Race',
    description: 'Complete any P2P race.',
    icon: '🏁',
    tier: 'bronze',
    predicate: (p) => (p.totalRacesFinished ?? 0) >= 1,
  },
  {
    id: 'race-podium',
    name: 'Podium Finish',
    description: 'Finish top 3 in a race.',
    icon: '🥇',
    tier: 'gold',
    predicate: (_p, ride) =>
      ride.raceFinished === true &&
      typeof ride.racePosition === 'number' &&
      ride.racePosition >= 1 &&
      ride.racePosition <= 3,
  },
  {
    id: 'race-organiser',
    name: 'Race Organiser',
    description: 'Create and share a race.',
    icon: '📋',
    tier: 'silver',
    predicate: (p) => (p.totalManifestsCreated ?? 0) >= 1,
  },
  {
    id: 'draft-60s',
    name: 'Drafted 60s',
    description: 'Spend 60 seconds in a draft cone.',
    icon: '💨',
    tier: 'bronze',
    predicate: (_p, ride) => (ride.draftSec ?? 0) >= 60,
  },
  {
    id: 'draft-5min',
    name: 'On the Wheel',
    description: 'Spend 5 minutes drafting in one ride.',
    icon: '🚴‍♂️',
    tier: 'silver',
    predicate: (_p, ride) => (ride.draftSec ?? 0) >= 300,
  },
  {
    id: 'bot-beater',
    name: 'Bot Beater',
    description: 'Finish ahead of all pace bots on a ride.',
    icon: '🤖',
    tier: 'gold',
    predicate: (_p, ride) => ride.beatAllBots === true,
  },
  {
    id: 'coached',
    name: 'Coached',
    description: 'Ride an AI-recommended workout.',
    icon: '🧠',
    tier: 'silver',
    predicate: (_p, ride) => ride.followedCoachRecommendation === true,
  },
  {
    id: 'stormrider',
    name: 'Stormrider',
    description: 'Complete a ride in fjord-rain or alpine-storm mood.',
    icon: '⛈️',
    tier: 'silver',
    predicate: (_p, ride) =>
      ride.mood === 'fjord-rain' || ride.mood === 'alpine-storm',
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    description: 'Complete a ride in golden-hour mood.',
    icon: '🌅',
    tier: 'bronze',
    predicate: (_p, ride) => ride.mood === 'golden-hour',
  },
  {
    id: 'wts-veteran',
    name: 'World Tour Veteran',
    description: 'Complete a World Tour stage.',
    icon: '🏆',
    tier: 'gold',
    predicate: (p) => (p.totalWorldTourStages ?? 0) >= 1,
  },
  {
    id: 'globe-explorer',
    name: 'Globe Explorer',
    description: 'Ride starts in 3+ different countries.',
    icon: '🌐',
    tier: 'gold',
    predicate: (p) => (p.startCountries ?? []).length >= 3,
  },
  {
    id: 'companion-user',
    name: 'Companion User',
    description: 'Use the companion phone screen.',
    icon: '📱',
    tier: 'bronze',
    predicate: (p) => (p.totalCompanionSessions ?? 0) >= 1,
  },
];

// ---------------------------------------------------------------------------
// Evaluation helper
// ---------------------------------------------------------------------------

/**
 * Returns the ids of achievements that are newly unlocked by the most recent
 * ride. Call this *after* profileStore.recordRide() so the profile totals
 * already include the ride being evaluated.
 *
 * @param profile       Updated profile (post-ride totals)
 * @param ride          The ride input that triggered evaluation
 * @param alreadyUnlocked  Set of achievement ids already recorded in the store
 */
export function evaluateNewAchievements(
  profile: RiderProfile,
  ride: RideXpInput,
  alreadyUnlocked: ReadonlySet<string>,
): string[] {
  const newlyUnlocked: string[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(achievement.id)) continue;
    try {
      if (achievement.predicate(profile, ride)) {
        newlyUnlocked.push(achievement.id);
      }
    } catch {
      // Never let a broken predicate crash the ride-finish flow.
    }
  }

  return newlyUnlocked;
}

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

const ACHIEVEMENT_MAP = new Map<string, Achievement>(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENT_MAP.get(id);
}
