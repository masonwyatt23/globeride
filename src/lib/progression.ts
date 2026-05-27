/**
 * XP & level progression — pure functions, no side-effects.
 *
 * Curve: level L requires cumulative 500 * L * (L + 1) XP to reach.
 *   Level 1:  1,000 XP total
 *   Level 5:  15,000 XP total
 *   Level 10: 55,000 XP total
 *   Level 20: 210,000 XP total
 */

export interface XpProgress {
  /** Current level (1-based). */
  level: number;
  /** XP accumulated inside the current level. */
  into: number;
  /** XP needed to complete the current level. */
  needed: number;
  /** Fraction 0..1 through the current level. */
  pct: number;
}

export interface RideXpInput {
  distanceM: number;
  ascentM: number;
  workoutCompleted: boolean;
  // ── later waves feature fields (all optional for backwards-compat) ─────────
  /** True when this ride finished a P2P race (any manifest). */
  raceFinished?: boolean;
  /** Finishing position in the race (1 = first). 0 or undefined = no race. */
  racePosition?: number;
  /** Total seconds spent in an aerodynamic draft cone during this ride. */
  draftSec?: number;
  /** True when the rider finished ahead of all loaded pace bots. */
  beatAllBots?: boolean;
  /** True when this ride's workout was recommended by the AI Coach within the same week. */
  followedCoachRecommendation?: boolean;
  /** The active scene mood id when the ride finished (from cesiumUtils MoodId). */
  mood?: string;
  /** ISO-3166-1 alpha-2 country code derived from the route start coords (optional). */
  startCountry?: string;
  /** True when this ride used a World Tour stage route. */
  isWorldTourStage?: boolean;
  /** True when the /companion screen was opened at least once during this session. */
  companionOpenedThisRide?: boolean;
}

/** Cumulative XP required to reach level `level` (level 1 = 1000 XP). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 500 * l * (l + 1);
}

/** XP awarded for a single completed ride. */
export function xpForRide({ distanceM, ascentM, workoutCompleted }: RideXpInput): number {
  const distanceXp = distanceM / 100;          // 1 XP per 100 m
  const ascentXp   = ascentM * 0.5;            // 0.5 XP per m of ascent
  const workoutXp  = workoutCompleted ? 250 : 0;
  return Math.round(distanceXp + ascentXp + workoutXp);
}

/**
 * Derive the current level from cumulative XP.
 * Level L is reached when xp >= xpForLevel(L).
 * We cap at level 50 to avoid an infinite loop.
 */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 50 && xp >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}

/** Full progress breakdown for the current XP value. */
export function xpProgressInLevel(xp: number): XpProgress {
  const level  = levelForXp(xp);
  const floor  = level > 1 ? xpForLevel(level) : 0;
  const ceil   = xpForLevel(level + 1);
  const into   = Math.max(0, xp - floor);
  const needed = ceil - floor;
  const pct    = needed > 0 ? Math.min(1, into / needed) : 1;
  return { level, into, needed, pct };
}
