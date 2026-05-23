/**
 * coach.ts — AI-powered training coach for GlobeRide.
 *
 * Pattern mirrors provider.ts / routeRecommender.ts:
 *   1. Build a tight system prompt + structured user prompt with JSON-only
 *      output instruction.
 *   2. Call xAI or Ollama via the same provider resolution.
 *   3. Extract JSON, validate (workoutId must exist in PRESET_WORKOUTS).
 *   4. One repair attempt if invalid.
 *   5. Return typed CoachRecommendation.
 *
 * The coach NEVER generates raw workouts — it picks an id from the existing
 * curated PRESET_WORKOUTS catalog. This keeps training quality high and
 * avoids the segment-level validation complexity.
 */

import { PRESET_WORKOUTS } from '@/lib/presetWorkouts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CoachContext {
  recentRides: {
    date: string;          // YYYY-MM-DD
    distanceKm: number;
    durationMin: number;
    tss?: number;
    avgPowerW?: number;
    avgGradient?: number;
    workoutType?: string;
  }[];
  fitness: { ctl: number; atl: number; tsb: number };
  ftpW: number;
  weeklyVolumeMin?: number;
  goal?: string;           // free-form e.g. "build base for a century"
  daysSinceLastHardEffort?: number;
}

export interface CoachRecommendation {
  /** ID from the presetWorkouts catalog. REQUIRED — always a valid preset id. */
  workoutId: string;
  /** 2-3 sentence explanation of why this workout was chosen. */
  rationale: string;
  intensityNote: 'go-easy' | 'normal' | 'push-it';
  /** Optional: "rest day suggested" or "easy spin only". */
  restRecommendation?: string;
  /** Optional: "your VO2 work is light this week". */
  weaknessNote?: string;
  /** Optional: "build week — back off Friday". */
  weeklyOutlook?: string;
}

// ---------------------------------------------------------------------------
// Catalog summary — injected into the prompt so the model can pick by id
// ---------------------------------------------------------------------------

const CATALOG_SUMMARY = PRESET_WORKOUTS.map((w) => {
  const durMin = Math.round(w.segments.reduce((s, seg) => s + seg.durationSec, 0) / 60);
  return `  - id: "${w.id}" | name: "${w.name}" | duration: ~${durMin} min | category: ${w.category ?? 'custom'}`;
}).join('\n');

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const COACH_SYSTEM_PROMPT = `You are an expert cycling coach for GlobeRide, a virtual cycling simulator.

Your task: given a rider's recent training data, recommend the single best workout for TODAY by picking one id from the provided catalog.

CRITICAL RULES:
1. Output ONLY valid JSON — no markdown fences, no explanation, no text before or after.
2. The JSON must strictly conform to this schema:
{
  "workoutId":          string,  // MUST be one of the ids in the catalog below — no other value is valid
  "rationale":          string,  // 2-3 sentences explaining why this workout suits the rider today
  "intensityNote":      "go-easy" | "normal" | "push-it",
  "restRecommendation": string | null,   // "rest day suggested" / "easy spin only" / null
  "weaknessNote":       string | null,   // e.g. "your VO2 work is light this week" / null
  "weeklyOutlook":      string | null    // e.g. "build week — plan an easy day Friday" / null
}
3. "workoutId" MUST exactly match one of the ids in the catalog. Do NOT invent a new id.
4. "intensityNote" rules:
   - TSB < -15 → "go-easy"
   - TSB -15 to +10 → "normal"
   - TSB > +10 → "push-it"
   Override if the rider clearly needs recovery (e.g., 3+ hard days in a row).
5. "rationale" must be personalised — reference the rider's CTL, recent rides, or goal.
6. If TSB < -20 or the rider rode hard 3+ consecutive days, set "restRecommendation" to a useful string.
7. Detect weaknesses: if the rider has done only endurance for 7+ days with no threshold/VO2 work,
   set "weaknessNote" to flag it. If they have never done sweet-spot work, flag that too.
8. "weeklyOutlook" should give a 1-sentence forward-looking tip for the week.

WORKOUT CATALOG (pick workoutId from this list only):
${CATALOG_SUMMARY}

Output only the JSON object now.`;

// ---------------------------------------------------------------------------
// Provider resolution — identical to provider.ts
// ---------------------------------------------------------------------------

function resolveProviderName(): 'xai' | 'ollama' {
  const env = import.meta.env.VITE_AI_PROVIDER ?? 'auto';
  if (env === 'xai') return 'xai';
  if (env === 'ollama') return 'ollama';
  return import.meta.env.VITE_XAI_API_KEY ? 'xai' : 'ollama';
}

// ---------------------------------------------------------------------------
// Provider call helpers
// ---------------------------------------------------------------------------

async function callXAI(userPrompt: string): Promise<string> {
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
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    }),
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

async function callOllama(userPrompt: string): Promise<string> {
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
        { role: 'system', content: COACH_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      options: { temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 0 || body === '') {
      throw new Error(`Cannot reach Ollama at ${base}. Is it running? (ollama serve)`);
    }
    throw new Error(`Ollama error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama returned an empty response.');
  }
  return content;
}

async function callModel(userPrompt: string): Promise<string> {
  const provider = resolveProviderName();
  if (provider === 'xai') return callXAI(userPrompt);
  return callOllama(userPrompt);
}

// ---------------------------------------------------------------------------
// JSON extraction (mirrors validate.ts extractJSON)
// ---------------------------------------------------------------------------

function extractCoachJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_PRESET_IDS = new Set(PRESET_WORKOUTS.map((w) => w.id));
const VALID_INTENSITY_NOTES = new Set<string>(['go-easy', 'normal', 'push-it']);

export type CoachValidationResult =
  | { ok: true; recommendation: CoachRecommendation }
  | { ok: false; errors: string[] };

export function validateCoachRecommendation(raw: string): CoachValidationResult {
  const errors: string[] = [];

  const jsonStr = extractCoachJSON(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    errors.push(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, errors };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push('Root value is not a JSON object.');
    return { ok: false, errors };
  }

  const obj = parsed as Record<string, unknown>;

  // Unwrap common wrapper keys
  let data = obj;
  for (const key of ['recommendation', 'result', 'data', 'output', 'coach']) {
    const inner = obj[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const cand = inner as Record<string, unknown>;
      if ('workoutId' in cand || 'rationale' in cand) {
        data = cand;
        break;
      }
    }
  }

  // Required: workoutId
  if (typeof data.workoutId !== 'string' || !data.workoutId.trim()) {
    errors.push('Missing "workoutId".');
    return { ok: false, errors };
  }
  const workoutId = data.workoutId.trim();
  if (!VALID_PRESET_IDS.has(workoutId)) {
    errors.push(
      `"workoutId" "${workoutId}" is not in the preset catalog. ` +
        `Valid ids: ${[...VALID_PRESET_IDS].slice(0, 5).join(', ')}…`,
    );
    return { ok: false, errors };
  }

  // Required: rationale
  if (typeof data.rationale !== 'string' || !data.rationale.trim()) {
    errors.push('Missing "rationale".');
    return { ok: false, errors };
  }

  // Required: intensityNote
  if (!VALID_INTENSITY_NOTES.has(String(data.intensityNote ?? ''))) {
    errors.push(
      `"intensityNote" must be "go-easy" | "normal" | "push-it", got "${data.intensityNote}".`,
    );
    return { ok: false, errors };
  }

  const recommendation: CoachRecommendation = {
    workoutId,
    rationale: String(data.rationale).trim(),
    intensityNote: data.intensityNote as CoachRecommendation['intensityNote'],
    restRecommendation:
      typeof data.restRecommendation === 'string' && data.restRecommendation
        ? data.restRecommendation.trim()
        : undefined,
    weaknessNote:
      typeof data.weaknessNote === 'string' && data.weaknessNote
        ? data.weaknessNote.trim()
        : undefined,
    weeklyOutlook:
      typeof data.weeklyOutlook === 'string' && data.weeklyOutlook
        ? data.weeklyOutlook.trim()
        : undefined,
  };

  return { ok: true, recommendation };
}

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

function buildUserPrompt(ctx: CoachContext): string {
  const lines: string[] = [];

  lines.push(`Rider profile:`);
  lines.push(`  FTP: ${ctx.ftpW} W`);
  lines.push(`  Fitness (CTL): ${ctx.fitness.ctl.toFixed(1)}`);
  lines.push(`  Fatigue (ATL): ${ctx.fitness.atl.toFixed(1)}`);
  lines.push(`  Form (TSB):    ${ctx.fitness.tsb.toFixed(1)}`);

  if (ctx.goal) {
    lines.push(`  Goal: ${ctx.goal}`);
  }
  if (ctx.weeklyVolumeMin !== undefined) {
    lines.push(`  Weekly volume so far: ${Math.round(ctx.weeklyVolumeMin)} min`);
  }
  if (ctx.daysSinceLastHardEffort !== undefined) {
    lines.push(`  Days since last hard effort (TSS > 60): ${ctx.daysSinceLastHardEffort}`);
  }

  if (ctx.recentRides.length === 0) {
    lines.push('\nNo recent rides recorded.');
  } else {
    lines.push('\nRecent rides (newest first):');
    for (const r of ctx.recentRides.slice(0, 7)) {
      const parts = [
        `  - ${r.date}`,
        `${r.durationMin} min`,
        `${r.distanceKm.toFixed(1)} km`,
      ];
      if (r.tss !== undefined) parts.push(`TSS ${r.tss}`);
      if (r.avgPowerW !== undefined) parts.push(`avg ${r.avgPowerW} W`);
      if (r.workoutType) parts.push(`type: ${r.workoutType}`);
      lines.push(parts.join(' · '));
    }
  }

  lines.push('\nRecommend the single best workout from the catalog for this rider today.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ask the AI coach what to ride today.
 *
 * Steps:
 *   1. Build system prompt (catalog embedded) + user prompt (rider context).
 *   2. Call AI. Parse + validate. On failure, one repair attempt.
 *   3. Return typed CoachRecommendation.
 *
 * Throws a user-friendly Error on unrecoverable failure.
 */
export async function coachRecommendation(ctx: CoachContext): Promise<CoachRecommendation> {
  const userPrompt = buildUserPrompt(ctx);

  // --- Step 1: first call ---
  let raw: string;
  try {
    raw = await callModel(userPrompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg, { cause: err });
  }

  // --- Step 2: validate ---
  let result = validateCoachRecommendation(raw);
  if (result.ok) return result.recommendation;

  // --- Step 3: one repair attempt ---
  const repairPrompt =
    `The JSON you returned had validation errors: ${result.errors.join('; ')}\n\n` +
    `IMPORTANT: "workoutId" must be an id that exists exactly in the catalog provided in the system prompt.\n` +
    `Please return a corrected JSON object only. Original output:\n${extractCoachJSON(raw)}`;

  let raw2: string;
  try {
    raw2 = await callModel(repairPrompt);
  } catch {
    throw new Error(`Coach recommendation failed: ${result.errors.join('; ')}`);
  }

  result = validateCoachRecommendation(raw2);
  if (result.ok) return result.recommendation;

  throw new Error(
    `AI returned an invalid recommendation after two attempts. Errors: ${result.errors.join('; ')}`,
  );
}
