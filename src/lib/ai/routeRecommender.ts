/**
 * routeRecommender — natural language prompt → AI route metadata + Route polyline.
 *
 * Pattern mirrors provider.ts / generateWorkout:
 *   1. Build system prompt with strict JSON-only instruction + few-shot example.
 *   2. Call callXAI (or Ollama).
 *   3. Strip markdown fences, parse JSON.
 *   4. Validate via validateRouteInfo. On failure, one repair attempt.
 *   5. Call generateRoute() with the validated metadata.
 *   6. Return { info: AIRouteInfo, route: Route }.
 *
 * Only xAI is used for route recommendation (Ollama is kept as fallback
 * via the same provider resolution logic used everywhere else in the app).
 */

import type { Route } from '@/types';
import { generateRoute } from '@/lib/routeGenerator';
import { validateRouteInfo, extractRouteJSON, type AIRouteInfo } from '@/lib/ai/validateRoute';

// ---------------------------------------------------------------------------
// AI provider plumbing — mirrors provider.ts exactly
// ---------------------------------------------------------------------------

function resolveProviderName(): 'xai' | 'ollama' {
  const env = import.meta.env.VITE_AI_PROVIDER ?? 'auto';
  if (env === 'xai') return 'xai';
  if (env === 'ollama') return 'ollama';
  return import.meta.env.VITE_XAI_API_KEY ? 'xai' : 'ollama';
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ROUTE_SYSTEM_PROMPT = `You are an expert cycling route designer for GlobeRide, a virtual cycling simulator.

Your task: given a natural-language description of a desired cycling route, generate a JSON object describing a real, scenic cycling location that matches the request.

CRITICAL RULES:
1. Output ONLY valid JSON — no markdown fences, no explanation, no text before or after.
2. The JSON must strictly conform to this schema:
{
  "centerLat":    number,   // WGS-84 latitude of the route center, -90..90
  "centerLon":    number,   // WGS-84 longitude of the route center, -180..180
  "name":         string,   // Evocative route name, 2–80 chars
  "description":  string,   // Vivid, atmospheric prose description, 2–400 chars
  "lengthKm":     number,   // Total route length in km, 5..200
  "shape":        "loop" | "out-and-back" | "point-to-point",
  "scenicRating": number,   // Integer 1 (decent) to 5 (jaw-dropping), honest assessment
  "difficulty":   "easy" | "moderate" | "hard" | "epic",
  "region":       string    // Free-form location, e.g. "Pacific Coast, California, USA"
}

3. Use REAL, accurate geographic coordinates. centerLat/centerLon must be a plausible center for the named region — not 0,0 or a placeholder.
4. Choose genuinely scenic locations: coastal cliffs, mountain passes, river valleys, vineyard roads, lakeshores, fjords, etc.
5. "description" should be vivid and inspiring — mention the specific terrain, views, landmarks, or character of the ride. 1–3 sentences.
6. "lengthKm" should honor the user's request if they specified a distance. If unspecified, choose a natural length for the terrain (loops: 30–80 km; climbs: 15–40 km).
7. "shape" guide: loops for flat/rolling terrain; out-and-back for climbs/point-to-point features; point-to-point for traversals.
8. "difficulty" guide: easy = flat, <500 m ascent; moderate = rolling, 500–1200 m; hard = sustained climbing, 1200–2500 m; epic = extreme ascent/distance.
9. "scenicRating" should be honest — 5 is reserved for truly world-class scenery (Dolomites, Na Pali Coast, Amalfi, etc.).

FEW-SHOT EXAMPLE:
User: "a rolling 60 km loop along the Pacific coast near Big Sur"
AI output:
{
  "centerLat": 36.2704,
  "centerLon": -121.8081,
  "name": "Big Sur Coastal Loop",
  "description": "Thundering surf, redwood canyons, and the vertiginous Highway 1 cliffs define this iconic 60 km loop through the Big Sur coastline — one of the most photographed cycling roads on earth. Rolling terrain keeps the legs honest while panoramic Pacific views demand frequent stops.",
  "lengthKm": 60,
  "shape": "loop",
  "scenicRating": 5,
  "difficulty": "moderate",
  "region": "Big Sur, California, USA"
}

Output only the JSON object now.`;

// ---------------------------------------------------------------------------
// Provider call helpers — identical pattern to provider.ts
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
        { role: 'system', content: ROUTE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7, // slightly higher than workouts — encourages creative geo variety
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
        { role: 'system', content: ROUTE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      options: { temperature: 0.7 },
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
// Public API
// ---------------------------------------------------------------------------

export interface RouteRecommendation {
  /** AI metadata — used for the UI card (name, description, scenic rating, etc.) */
  info: AIRouteInfo;
  /** Generated Route polyline — ready to pass to setRoute() */
  route: Route;
}

/**
 * Recommend a scenic cycling route from a natural-language prompt.
 *
 * Steps:
 *   1. Call AI with the route system prompt.
 *   2. Parse + validate JSON. On schema error, send repair prompt and retry once.
 *   3. Call generateRoute() with the validated center + options.
 *   4. Return { info, route }.
 *
 * Throws a user-friendly Error on unrecoverable failure.
 */
export async function recommendRoute(prompt: string): Promise<RouteRecommendation> {
  // --- Step 1: first AI call ---
  let raw: string;
  try {
    raw = await callModel(prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg, { cause: err });
  }

  // --- Step 2: validate ---
  let result = validateRouteInfo(raw);

  if (!result.ok) {
    // One repair attempt: send the AI the validation errors and ask it to fix
    const repairPrompt =
      `The JSON you returned had validation errors: ${result.errors.join('; ')}\n\n` +
      `Please return a corrected JSON object only. The original output was:\n${extractRouteJSON(raw)}`;

    let raw2: string;
    try {
      raw2 = await callModel(repairPrompt);
    } catch {
      throw new Error(
        `Route generation failed (validation errors): ${result.errors.join('; ')}`,
      );
    }

    result = validateRouteInfo(raw2);
    if (!result.ok) {
      throw new Error(
        `AI returned an invalid route after two attempts. Errors: ${result.errors.join('; ')}`,
      );
    }
  }

  const info = result.info;

  // --- Step 3: generate the polyline ---
  // 'point-to-point' is not supported by generateRoute (which only has
  // 'loop' and 'out-and-back') — treat it as out-and-back.
  const shape: 'loop' | 'out-and-back' =
    info.shape === 'point-to-point' ? 'out-and-back' : info.shape;

  // Give loops a random starting heading so repeated calls to the same
  // center produce visually different routes (NE, SE, SW, NW quadrants).
  const headingDeg = Math.floor(Math.random() * 360);

  const route = await generateRoute(
    { lat: info.centerLat, lon: info.centerLon },
    {
      shape,
      lengthKm: info.lengthKm,
      headingDeg,
      name: info.name,
      // terrainProvider omitted — caller (the component) can pass one if it
      // has a live Cesium viewer; we don't couple this lib to Cesium here.
    },
  );

  return { info, route };
}
