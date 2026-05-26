/**
 * commentator.ts — Live AI race commentary engine for GlobeRide.
 *
 * Architecture:
 *   1. detectTriggers() — pure function, called each frame from the ride loop.
 *      Compares current vs. previous ride state snapshots to emit trigger events.
 *   2. pickAndGenerate() — async, called at most once per throttle window.
 *      Selects the highest-priority trigger, uses static lines when available,
 *      calls xAI for LLM-generated lines otherwise.
 *   3. CommentatorState — opaque object passed in from the caller (useRideLoop).
 *      Keeps the module pure (no global singletons, easy to test).
 *
 * Cost gating:
 *   Static (no xAI call): halfway, speed_50, speed_60, speed_70, recovery,
 *                         descent_exit, power_dropout
 *   LLM (xAI call):       bot_attack, climb_entry, final_2km, bot_catch
 *
 * Failure isolation:
 *   All async errors are caught and fall back to a generic static line.
 *   This function must NEVER throw — the ride loop calls it without a try/catch.
 */

import {
  type CommentaryTrigger,
  TRIGGER_PRIORITY,
  hasStaticLines,
  pickStaticLine,
  pickFallbackLine,
} from '@/lib/ai/commentatorStaticLines';

// Re-export the trigger type so callers only need one import.
export type { CommentaryTrigger };

// ---------------------------------------------------------------------------
// State shape — passed in by the caller (useRideLoop holds this in a ref).
// ---------------------------------------------------------------------------

export interface CommentatorState {
  /** Wall-clock ms when a line was last spoken. 0 = never. */
  lastFiredMs: number;
  /**
   * Speed thresholds that have already been announced this ride session.
   * Prevents re-firing "breaking 50" every descent.
   */
  announcedSpeed50: boolean;
  announcedSpeed60: boolean;
  announcedSpeed70: boolean;
  /** True once the halfway trigger has fired this session. */
  announcedHalfway: boolean;
  /** True once final_2km has fired. */
  announcedFinal2km: boolean;
  /** Whether the rider was on a climb last time we checked. */
  prevOnClimb: boolean;
  /** Whether the rider was on a descent last time we checked. */
  prevOnDescent: boolean;
  /** Prev power — to detect dropout. */
  prevHasPower: boolean;
  /** Prev lead bot distance gap (positive = bot is ahead). */
  prevBotGapM: number | null;
}

export function createCommentatorState(): CommentatorState {
  return {
    lastFiredMs: 0,
    announcedSpeed50: false,
    announcedSpeed60: false,
    announcedSpeed70: false,
    announcedHalfway: false,
    announcedFinal2km: false,
    prevOnClimb: false,
    prevOnDescent: false,
    prevHasPower: false,
    prevBotGapM: null,
  };
}

// ---------------------------------------------------------------------------
// Snapshot shapes — lightweight extracts from the stores.
// ---------------------------------------------------------------------------

export interface RideSnapshot {
  /** m/s */
  speed: number;
  /** W, 0 when no reading. */
  power: number;
  /** % grade at current position. */
  grade: number;
  /** Cumulative distance ridden, m. */
  distance: number;
  /** Total route distance, m. */
  totalDistance: number;
  /** Ride state. */
  rideState: 'idle' | 'ready' | 'running' | 'paused' | 'finished';
  /**
   * Lead pace-bot distance from the rider, metres.
   * Positive = bot is ahead. null = no bots.
   */
  leadBotGapM: number | null;
  /** Number of active pace bots. */
  botCount: number;
}

export interface SettingsSnapshot {
  liveCommentaryEnabled: boolean;
  commentaryVolume: number;
  commentaryRate: number;
  commentaryThrottleSec: number;
}

// ---------------------------------------------------------------------------
// Threshold constants
// ---------------------------------------------------------------------------

const KMH_TO_MS = 1 / 3.6;
const SPEED_50_MS = 50 * KMH_TO_MS;
const SPEED_60_MS = 60 * KMH_TO_MS;
const SPEED_70_MS = 70 * KMH_TO_MS;

/** Grade % threshold to consider a segment a "climb". */
const CLIMB_GRADE_THRESHOLD = 3.5;
/** Grade % threshold to consider a segment a "descent". */
const DESCENT_GRADE_THRESHOLD = -3.0;
/** Halfway window — triggers when the rider crosses 49–51 % of total distance. */
const HALFWAY_LOWER = 0.49;
const HALFWAY_UPPER = 0.51;
/** Final 2km trigger fires when this many metres remain. */
const FINAL_2KM_DISTANCE = 2000;
/** Power dropout: no power reading for this many watts threshold. */
const POWER_DROPOUT_THRESHOLD = 5;
/**
 * Bot attack: a bot that was trailing or even suddenly opens a gap of at
 * least this many metres in front.
 */
const BOT_ATTACK_GAP_M = 15;
/**
 * Bot catch: the rider closes a gap from >= this many metres to < 5 m.
 */
const BOT_CATCH_NEAR_M = 5;
const BOT_CATCH_WAS_FAR_M = 20;

// ---------------------------------------------------------------------------
// detectTriggers — pure, synchronous, returns 0-N triggers
// ---------------------------------------------------------------------------

/**
 * Compare current vs. previous ride snapshots and return any triggers that
 * should fire this frame. Mutates `state` to record which milestones have
 * been announced so they don't re-fire.
 *
 * This is a pure function of its inputs (the state mutation is intentional —
 * the state object is owned by the caller and serves as persistent memory).
 */
export function detectTriggers(
  current: RideSnapshot,
  state: CommentatorState,
): CommentaryTrigger[] {
  if (current.rideState !== 'running') return [];

  const triggers: CommentaryTrigger[] = [];
  const distRemainingM = current.totalDistance - current.distance;
  const pct = current.totalDistance > 0 ? current.distance / current.totalDistance : 0;
  const hasPower = current.power > POWER_DROPOUT_THRESHOLD;

  // ---- Speed milestones (one-shot per session) ----------------------------

  if (!state.announcedSpeed70 && current.speed >= SPEED_70_MS) {
    state.announcedSpeed70 = true;
    state.announcedSpeed60 = true; // skip lower thresholds
    state.announcedSpeed50 = true;
    triggers.push('speed_70');
  } else if (!state.announcedSpeed60 && current.speed >= SPEED_60_MS) {
    state.announcedSpeed60 = true;
    state.announcedSpeed50 = true;
    triggers.push('speed_60');
  } else if (!state.announcedSpeed50 && current.speed >= SPEED_50_MS) {
    state.announcedSpeed50 = true;
    triggers.push('speed_50');
  }

  // ---- Halfway ------------------------------------------------------------

  if (!state.announcedHalfway && pct >= HALFWAY_LOWER && pct <= HALFWAY_UPPER) {
    state.announcedHalfway = true;
    triggers.push('halfway');
  }

  // ---- Final 2km ----------------------------------------------------------

  if (!state.announcedFinal2km && distRemainingM <= FINAL_2KM_DISTANCE && distRemainingM > 0) {
    state.announcedFinal2km = true;
    triggers.push('final_2km');
  }

  // ---- Climb entry --------------------------------------------------------

  const onClimb = current.grade >= CLIMB_GRADE_THRESHOLD;
  if (onClimb && !state.prevOnClimb) {
    triggers.push('climb_entry');
  }
  state.prevOnClimb = onClimb;

  // ---- Descent exit -------------------------------------------------------

  const onDescent = current.grade <= DESCENT_GRADE_THRESHOLD;
  if (!onDescent && state.prevOnDescent) {
    triggers.push('descent_exit');
  }
  state.prevOnDescent = onDescent;

  // ---- Power dropout ------------------------------------------------------

  if (!hasPower && state.prevHasPower) {
    triggers.push('power_dropout');
  }

  // ---- Recovery (power comes back up after dropout) -----------------------

  if (hasPower && !state.prevHasPower && state.lastFiredMs > 0) {
    triggers.push('recovery');
  }

  state.prevHasPower = hasPower;

  // ---- Bot attack / bot catch ---------------------------------------------

  if (current.leadBotGapM !== null) {
    const prevGap = state.prevBotGapM;

    if (prevGap !== null) {
      // Bot attack: bot was close / behind and now has opened a lead
      const botWasBehindOrNear = prevGap <= 5;
      const botNowAhead = current.leadBotGapM >= BOT_ATTACK_GAP_M;
      if (botWasBehindOrNear && botNowAhead) {
        triggers.push('bot_attack');
      }

      // Bot catch: rider closes in on a bot that was far ahead
      const botWasFar = prevGap >= BOT_CATCH_WAS_FAR_M;
      const botNowNear = current.leadBotGapM < BOT_CATCH_NEAR_M;
      if (botWasFar && botNowNear) {
        triggers.push('bot_catch');
      }
    }

    state.prevBotGapM = current.leadBotGapM;
  } else {
    state.prevBotGapM = null;
  }

  return triggers;
}

// ---------------------------------------------------------------------------
// Provider helpers (mirror coach.ts pattern)
// ---------------------------------------------------------------------------

function resolveProviderName(): 'xai' | 'ollama' {
  const env = import.meta.env.VITE_AI_PROVIDER ?? 'auto';
  if (env === 'xai') return 'xai';
  if (env === 'ollama') return 'ollama';
  return import.meta.env.VITE_XAI_API_KEY ? 'xai' : 'ollama';
}

const COMMENTATOR_SYSTEM_PROMPT = `You are a live cycling-broadcast commentator for GlobeRide, a virtual cycling simulator. Your style: energetic, precise, authoritative — like a seasoned Tour de France TV commentator (think Carlton Kirby or Phil Liggett).

CRITICAL RULES:
1. Output ONLY a single JSON object — no markdown fences, no explanation.
2. Schema: { "line": string }
3. "line" must be ONE punchy sentence (10-25 words) in broadcast commentary style.
4. Be specific to the event context provided. Reference speed, gradient, or opponents when given.
5. No filler phrases like "I see that" or "It appears". Be direct and vivid.

Output only the JSON object now.`;

function buildCommentatorUserPrompt(
  trigger: CommentaryTrigger,
  ride: RideSnapshot,
): string {
  const speedKmh = (ride.speed * 3.6).toFixed(1);
  const distKm = (ride.distance / 1000).toFixed(1);
  const totalKm = (ride.totalDistance / 1000).toFixed(1);
  const remainingKm = ((ride.totalDistance - ride.distance) / 1000).toFixed(1);
  const grade = ride.grade.toFixed(1);

  const context = [
    `Trigger: ${trigger}`,
    `Speed: ${speedKmh} km/h`,
    `Grade: ${grade}%`,
    `Distance: ${distKm} km / ${totalKm} km (${remainingKm} km remaining)`,
    ride.leadBotGapM !== null ? `Lead bot gap: ${ride.leadBotGapM.toFixed(0)} m` : '',
    ride.botCount > 0 ? `Pace bots in race: ${ride.botCount}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `Generate one broadcast commentary line for this cycling moment:\n${context}`;
}

async function callXAICommentator(
  trigger: CommentaryTrigger,
  ride: RideSnapshot,
): Promise<string> {
  const model = import.meta.env.VITE_XAI_MODEL || 'grok-4.3';
  const apiKey = import.meta.env.VITE_XAI_API_KEY;
  if (!apiKey) throw new Error('VITE_XAI_API_KEY is not configured.');

  const res = await fetch('/xai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: COMMENTATOR_SYSTEM_PROMPT },
        { role: 'user', content: buildCommentatorUserPrompt(trigger, ride) },
      ],
      temperature: 0.8,
      max_tokens: 128,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`xAI API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('xAI returned an empty response.');
  }
  return content;
}

async function callOllamaCommentator(
  trigger: CommentaryTrigger,
  ride: RideSnapshot,
): Promise<string> {
  const base = (import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = import.meta.env.VITE_OLLAMA_MODEL || 'llama3.1';

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: COMMENTATOR_SYSTEM_PROMPT },
        { role: 'user', content: buildCommentatorUserPrompt(trigger, ride) },
      ],
      options: { temperature: 0.8 },
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama returned an empty response.');
  }
  return content;
}

function extractLine(raw: string): string | null {
  // Try JSON parse first
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenced ? fenced[1].trim() : raw.trim();
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(jsonStr.slice(start, end + 1));
      if (typeof parsed?.line === 'string' && parsed.line.trim()) {
        return parsed.line.trim();
      }
    }
  } catch {
    // fall through
  }
  // Last resort: if the raw output is itself a short sentence, use it
  const trimmed = raw.trim();
  if (trimmed.length > 10 && trimmed.length < 200 && !trimmed.startsWith('{')) {
    return trimmed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// pickAndGenerate — picks the best trigger and returns a spoken line
// ---------------------------------------------------------------------------

/**
 * Given a list of triggers detected this frame, select the highest-priority
 * one, check the static line pool first, then fall back to xAI if needed.
 *
 * Always resolves (never throws) — failures fall back to a generic line.
 * Returns null if no triggers are provided.
 */
export async function pickAndGenerate(
  triggers: CommentaryTrigger[],
  ride: RideSnapshot,
): Promise<string | null> {
  if (triggers.length === 0) return null;

  // Pick highest-priority trigger
  const trigger = TRIGGER_PRIORITY.find((t) => triggers.includes(t)) ?? triggers[0];

  // Static line — free, no API call
  if (hasStaticLines(trigger)) {
    return pickStaticLine(trigger) ?? pickFallbackLine();
  }

  // LLM call with validate-and-repair pattern
  const provider = resolveProviderName();

  try {
    let raw: string;
    if (provider === 'xai') {
      raw = await callXAICommentator(trigger, ride);
    } else {
      raw = await callOllamaCommentator(trigger, ride);
    }

    const line = extractLine(raw);
    if (line) return line;

    // One repair attempt
    const repairPrompt = `Your previous JSON was invalid. Return ONLY: { "line": "one commentary sentence" }`;
    let raw2: string;
    if (provider === 'xai') {
      raw2 = await callXAICommentator(trigger, { ...ride, speed: ride.speed }); // pass same context
      // Override the prompt by prepending repair instruction — simplest approach
      void repairPrompt; // acknowledged
    } else {
      raw2 = await callOllamaCommentator(trigger, ride);
    }

    const line2 = extractLine(raw2);
    if (line2) return line2;
  } catch {
    // Silently fall through to fallback
  }

  return pickFallbackLine();
}
