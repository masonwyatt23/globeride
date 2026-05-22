/**
 * AI provider abstraction for GlobeRide workout generation.
 *
 * Two providers are supported:
 *  - xAI (Grok): OpenAI-compatible chat/completions, accessed through the Vite
 *    dev/preview proxy at /xai (→ https://api.x.ai). Production deployments must
 *    expose the same /xai proxy or a serverless route — never expose the key to
 *    the browser directly via a public URL.
 *  - Ollama: local http://localhost:11434 (no CORS issues), uses /api/chat with
 *    format:'json' for structured output.
 *
 * Provider selection:
 *  VITE_AI_PROVIDER = 'xai' | 'ollama' | 'auto' (default)
 *  'auto' → xAI if VITE_XAI_API_KEY is present, else Ollama.
 *
 * Key env vars (never hard-code):
 *  VITE_XAI_API_KEY      — xAI secret key
 *  VITE_XAI_MODEL        — default: 'grok-4.3'
 *  VITE_OLLAMA_URL       — default: 'http://localhost:11434'
 *  VITE_OLLAMA_MODEL     — default: 'llama3.1'
 *  VITE_AI_PROVIDER      — default: 'auto'
 */

import type { Workout } from '@/lib/workout';
import { WORKOUT_JSON_SCHEMA } from '@/lib/workout';
import { validateAndRepairWorkout } from '@/lib/ai/validate';

export type AIProviderName = 'xai' | 'ollama';

export interface AIProviderInfo {
  name: AIProviderName;
  model: string;
  /** Human-readable label for the UI. */
  label: string;
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

function resolveProviderName(): AIProviderName {
  const env = import.meta.env.VITE_AI_PROVIDER ?? 'auto';
  if (env === 'xai') return 'xai';
  if (env === 'ollama') return 'ollama';
  // 'auto': use xAI when a key is configured
  return import.meta.env.VITE_XAI_API_KEY ? 'xai' : 'ollama';
}

export function getProviderInfo(): AIProviderInfo {
  const name = resolveProviderName();
  if (name === 'xai') {
    const model = import.meta.env.VITE_XAI_MODEL || 'grok-4.3';
    return { name, model, label: `xAI · ${model}` };
  }
  const model = import.meta.env.VITE_OLLAMA_MODEL || 'llama3.1';
  return { name, model, label: `Ollama · ${model}` };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(ftpW: number): string {
  return `You are an expert cycling coach and workout designer for GlobeRide, a virtual cycling simulator.

The rider's FTP (Functional Threshold Power) is ${ftpW} W.

Your task: given a natural-language workout description, generate a structured cycling workout as a single JSON object.

CRITICAL RULES:
1. Output ONLY valid JSON — no markdown fences, no explanation, no text before or after.
2. The JSON must strictly conform to this schema:
${JSON.stringify(WORKOUT_JSON_SCHEMA, null, 2)}

3. Use "ftpPct" targets (value = fraction of FTP, e.g. 0.9 for 90%) whenever the user specifies a % of FTP or a zone.
   Use "watts" targets only if the user specifies an absolute watt number.
   Use "rampPct" for warmups/cooldowns that progressively ramp power.
4. All durations MUST be in seconds (durationSec). Convert minutes to seconds: 5 min = 300 s.
5. Every segment needs "kind": one of warmup|steady|interval|recovery|ramp|cooldown|freeride.
6. Give each segment a concise human "label", e.g. "3×10 min @ 90% FTP".
7. Typical workout structure: warmup → main set → cooldown. Include recoveries between intervals.
8. %FTP fractions guide: Z1 ≤0.55, Z2 0.56–0.75, Z3 0.76–0.90, Z4 0.91–1.05, Z5 1.06–1.20, Z6 >1.20.
9. Sweet spot = 88–93% FTP (0.88–0.93). Threshold = 95–105% (0.95–1.05).

Output only the JSON object now.`;
}

// ---------------------------------------------------------------------------
// xAI provider (OpenAI-compatible, proxied)
// ---------------------------------------------------------------------------

async function callXAI(prompt: string, ftpW: number): Promise<string> {
  const model = import.meta.env.VITE_XAI_MODEL || 'grok-4.3';
  const apiKey = import.meta.env.VITE_XAI_API_KEY;
  if (!apiKey) throw new Error('VITE_XAI_API_KEY is not configured.');

  // Use the Vite proxy (/xai → https://api.x.ai) to avoid CORS in browser.
  // In production, expose /xai via your hosting proxy or a serverless function.
  const res = await fetch('/xai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The key is only included in the header — never logged or stored.
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(ftpW) },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
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

// ---------------------------------------------------------------------------
// Ollama provider
// ---------------------------------------------------------------------------

async function callOllama(prompt: string, ftpW: number): Promise<string> {
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
        { role: 'system', content: buildSystemPrompt(ftpW) },
        { role: 'user', content: prompt },
      ],
      options: { temperature: 0.3 },
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured Workout from a natural-language prompt.
 * Validates + repairs the model output; retries once on schema failure.
 * Throws a user-friendly Error on unrecoverable failures.
 */
export async function generateWorkout(
  prompt: string,
  ctx: { ftpW: number },
): Promise<Workout> {
  const provider = resolveProviderName();

  async function callModel(): Promise<string> {
    if (provider === 'xai') return callXAI(prompt, ctx.ftpW);
    return callOllama(prompt, ctx.ftpW);
  }

  let raw: string;
  try {
    raw = await callModel();
  } catch (err) {
    // Wrap network/configuration errors with clear user guidance.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg, { cause: err });
  }

  // First attempt to validate + auto-repair
  const result = validateAndRepairWorkout(raw, ctx.ftpW);
  if (result.ok) return result.workout;

  // One repair retry: ask the model to fix its own output
  const repairPrompt = `The JSON you returned had errors: ${result.errors.join('; ')}\n\nPlease return a corrected JSON object only. Original output:\n${raw}`;
  let raw2: string;
  try {
    if (provider === 'xai') raw2 = await callXAI(repairPrompt, ctx.ftpW);
    else raw2 = await callOllama(repairPrompt, ctx.ftpW);
  } catch {
    throw new Error(`Workout generation failed: ${result.errors.join('; ')}`);
  }

  const result2 = validateAndRepairWorkout(raw2, ctx.ftpW);
  if (result2.ok) return result2.workout;

  throw new Error(
    `AI returned an invalid workout after two attempts. Errors: ${result2.errors.join('; ')}`,
  );
}
