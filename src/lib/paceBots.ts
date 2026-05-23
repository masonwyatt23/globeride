/**
 * AI Pace Partners — named bot riders that race the same route alongside the
 * user, each with a distinct power profile and attack behaviour.
 *
 * Design goals:
 *  - All per-frame math is O(1) per bot and allocation-free (no objects created
 *    inside tickPaceBot — only primitives are returned via the BotState literal).
 *  - Speed is derived from the same physics model the demo loop uses
 *    (solveVelocity from physics.ts) so bots behave realistically on climbs /
 *    descents.
 *  - Behaviours are driven by simple state machines; the only mutable state is
 *    stored in PaceBot.state so the caller (rideStore) can keep the whole bot
 *    in a single serialisable struct.
 */

import type { Route } from '@/types';
import { solveVelocity } from '@/lib/physics';
import { sampleRouteAtDistance, headingAt } from '@/lib/gpxParser';
import type { AvatarColors } from '@/lib/avatarConfig';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Personality = 'steady' | 'climber' | 'sprinter' | 'attacker';

/** Live per-frame state for a single bot. */
export interface BotState {
  /** Cumulative distance along the route, meters. */
  distance: number;
  /** Current speed, m/s. */
  speed: number;
  /** Current power output, W. */
  power: number;
  /** Current latitude. */
  lat: number;
  /** Current longitude. */
  lon: number;
  /** Current elevation, m. */
  ele: number;
  /** Current heading, radians clockwise from north. */
  heading: number;
  // ---- Internal behaviour state (kept here to avoid per-frame allocations) ----
  /** Seconds remaining in the current special effort (sprint / attack). 0 = not active. */
  _effortRemaining: number;
  /** Seconds until the next effort triggers. Counts down while effort is inactive. */
  _effortCooldown: number;
}

export interface PaceBot {
  id: string;
  name: string;
  personality: Personality;
  ftpW: number;
  weightKg: number;
  state: BotState;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const BOT_PRESETS: Pick<PaceBot, 'name' | 'personality' | 'ftpW' | 'weightKg'>[] = [
  { name: 'The Diesel',  personality: 'steady',   ftpW: 260, weightKg: 78 },
  { name: 'Niki',        personality: 'climber',  ftpW: 240, weightKg: 62 },
  { name: 'Yuki',        personality: 'sprinter', ftpW: 290, weightKg: 80 },
  { name: 'Attila',      personality: 'attacker', ftpW: 275, weightKg: 72 },
];

// ---------------------------------------------------------------------------
// Avatar colours — one distinct colourway per bot index (0..3)
// ---------------------------------------------------------------------------

export const BOT_COLORWAYS: AvatarColors[] = [
  // 0 — Diesel: slate/grey workhorse
  { frame: '#64748b', wheel: '#1e293b', kit: '#94a3b8', skin: '#d8a877', helmet: '#475569', accent: '#e2e8f0' },
  // 1 — Niki: alpine green lightweight climber
  { frame: '#16a34a', wheel: '#052e16', kit: '#4ade80', skin: '#d8a877', helmet: '#15803d', accent: '#bbf7d0' },
  // 2 — Yuki: hot-red sprinter
  { frame: '#dc2626', wheel: '#450a0a', kit: '#f87171', skin: '#d8a877', helmet: '#b91c1c', accent: '#fca5a5' },
  // 3 — Attila: aggressive orange attacker
  { frame: '#ea580c', wheel: '#431407', kit: '#fb923c', skin: '#d8a877', helmet: '#c2410c', accent: '#fed7aa' },
];

// ---------------------------------------------------------------------------
// Default initial BotState (bot placed at distance 0 before route is set)
// ---------------------------------------------------------------------------

function defaultBotState(): BotState {
  return {
    distance: 0,
    speed: 0,
    power: 0,
    lat: 0,
    lon: 0,
    ele: 0,
    heading: 0,
    _effortRemaining: 0,
    _effortCooldown: 30, // first sprint/attack fires after 30 s of riding
  };
}

/** Create a PaceBot from a preset + an id. */
export function createPaceBot(
  id: string,
  preset: Pick<PaceBot, 'name' | 'personality' | 'ftpW' | 'weightKg'>,
): PaceBot {
  return { id, ...preset, state: defaultBotState() };
}

// ---------------------------------------------------------------------------
// Behaviour constants
// ---------------------------------------------------------------------------

// Sprinter: sprints every ~5 minutes, 30 s at 150% FTP.
const SPRINTER_COOLDOWN_S  = 300; // seconds between sprints
const SPRINTER_EFFORT_S    = 30;  // sprint duration
const SPRINTER_EFFORT_MULT = 1.50;

// Attacker: attacks every 2–4 minutes, 60 s at 130% FTP, then 75% FTP.
const ATTACKER_COOLDOWN_MIN_S = 120;
const ATTACKER_COOLDOWN_MAX_S = 240;
const ATTACKER_EFFORT_S       = 60;
const ATTACKER_EFFORT_MULT    = 1.30;

// Grade threshold above which the climber goes "hard".
const CLIMBER_CLIMB_THRESHOLD_PCT = 4.0;

// ---------------------------------------------------------------------------
// Core tick function
// ---------------------------------------------------------------------------

/**
 * Advance a single PaceBot by one frame. Returns the new BotState.
 * No heap allocations — returns a fresh object literal, but all fields are
 * primitive numbers so the GC pressure is negligible at 60 Hz.
 *
 * @param bot           Current bot (state is read-only here; caller stores new state)
 * @param route         The active route
 * @param dt            Frame delta, seconds
 * @param riderDistance Rider's cumulative distance, meters (for attacker target logic)
 * @param grade         Grade at the bot's current position, percent
 */
export function tickPaceBot(
  bot: PaceBot,
  route: Route,
  dt: number,
  riderDistance: number,
  grade: number,
): BotState {
  // Clamp dt to avoid physics blow-up on tab-suspension.
  const safeDt = Math.min(dt, 0.1);

  const st = bot.state;
  let effortRemaining = st._effortRemaining;
  let effortCooldown  = st._effortCooldown;

  // ---- Determine target power based on personality + behaviour state ----
  let targetPower: number;

  switch (bot.personality) {
    case 'steady': {
      // Always ~80% FTP. Gentle rubber-band: inch ±5% of FTP toward user.
      const gap = riderDistance - st.distance; // positive = rider ahead
      const rubberband = Math.max(-0.05, Math.min(0.05, gap / 200)) * bot.ftpW;
      targetPower = bot.ftpW * 0.80 + rubberband;
      break;
    }

    case 'climber': {
      // Low on flats, pushes hard on climbs.
      if (grade >= CLIMBER_CLIMB_THRESHOLD_PCT) {
        // Lighter rider — the physics model will already give more speed per
        // watt on climbs; we also raise the effort fraction.
        targetPower = bot.ftpW * 1.10;
      } else {
        targetPower = bot.ftpW * 0.70;
      }
      break;
    }

    case 'sprinter': {
      if (effortRemaining > 0) {
        // Active sprint
        targetPower = bot.ftpW * SPRINTER_EFFORT_MULT;
        effortRemaining -= safeDt;
        if (effortRemaining <= 0) {
          effortRemaining = 0;
          effortCooldown  = SPRINTER_COOLDOWN_S;
        }
      } else {
        // Cruising, waiting for next sprint.
        targetPower = bot.ftpW * 0.65;
        effortCooldown -= safeDt;
        if (effortCooldown <= 0) {
          // Only sprint on a flat/descent (grade < 2%) or near rider.
          const nearRider = Math.abs(riderDistance - st.distance) < 200;
          if (grade < 2.0 || nearRider) {
            effortRemaining = SPRINTER_EFFORT_S;
            effortCooldown  = 0;
          } else {
            // Defer — try again next second.
            effortCooldown = 1;
          }
        }
      }
      break;
    }

    case 'attacker': {
      if (effortRemaining > 0) {
        // Active attack
        targetPower    = bot.ftpW * ATTACKER_EFFORT_MULT;
        effortRemaining -= safeDt;
        if (effortRemaining <= 0) {
          effortRemaining = 0;
          // Random cooldown 2–4 min.
          effortCooldown = ATTACKER_COOLDOWN_MIN_S +
            pseudoRandom(bot.id, effortCooldown) *
            (ATTACKER_COOLDOWN_MAX_S - ATTACKER_COOLDOWN_MIN_S);
        }
      } else {
        // Settle at 75% FTP and try to stay 10–50 m ahead of the rider.
        const targetDist = riderDistance + 30; // aim 30 m ahead
        const gap = targetDist - st.distance;
        const rubberband = Math.max(-0.10, Math.min(0.10, gap / 100)) * bot.ftpW;
        targetPower = bot.ftpW * 0.75 + rubberband;
        effortCooldown -= safeDt;
        if (effortCooldown <= 0) {
          effortRemaining = ATTACKER_EFFORT_S;
          effortCooldown  = 0;
        }
      }
      break;
    }

    default:
      targetPower = bot.ftpW * 0.80;
  }

  // Clamp power to physiological range (0 – 200% FTP).
  const clampedPower = Math.max(0, Math.min(bot.ftpW * 2.0, targetPower));

  // ---- Convert power → speed via physics ----
  const speed = solveVelocity(clampedPower, grade, {
    riderMassKg: bot.weightKg,
    bikeMassKg:  8,
    bikeType:    'road',
    riderPosition: 'hoods',
    drivetrainEff: 0.97,
    rho:           1.225,
    windSpeedMs:   0,
    windDirectionDeg: 0,
  });

  // ---- Advance distance ----
  const newDistance = Math.min(
    route.totalDistance,
    Math.max(0, st.distance + speed * safeDt),
  );

  // ---- Sample position on the route ----
  const pos = sampleRouteAtDistance(route, newDistance);
  const heading = headingAt(route, newDistance);

  return {
    distance: newDistance,
    speed,
    power: clampedPower,
    lat: pos.lat,
    lon: pos.lon,
    ele: pos.ele,
    heading,
    _effortRemaining: effortRemaining,
    _effortCooldown:  effortCooldown,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic pseudo-random number in [0,1) from a string seed + a salt.
 * Used so each bot has different cooldown jitter without importing a PRNG.
 * Not cryptographic — just good enough for game-feel variation.
 */
function pseudoRandom(seed: string, salt: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  h ^= (salt * 2654435761) >>> 0;
  h = (h * 0x01000193) >>> 0;
  return (h >>> 0) / 0x100000000;
}
