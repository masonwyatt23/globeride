/**
 * Validation for AI-generated route recommendation JSON.
 *
 * Intentionally pure — no React, Cesium, or store imports — so it is
 * trivially unit-testable in a Node/vitest environment.
 *
 * Expected shape from the AI:
 * {
 *   centerLat:    number   // -90..90
 *   centerLon:    number   // -180..180
 *   name:         string   // 2..80 chars
 *   description:  string   // 2..400 chars
 *   lengthKm:     number   // 5..200
 *   shape:        'loop' | 'out-and-back' | 'point-to-point'
 *   scenicRating: 1..5     // integer
 *   difficulty:   'easy' | 'moderate' | 'hard' | 'epic'
 *   region:       string   // free-form, e.g. "Pacific Coast, USA"
 * }
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AIRouteInfo {
  centerLat: number;
  centerLon: number;
  name: string;
  description: string;
  lengthKm: number;
  shape: 'loop' | 'out-and-back' | 'point-to-point';
  scenicRating: number;
  difficulty: 'easy' | 'moderate' | 'hard' | 'epic';
  region: string;
}

export type RouteValidationResult =
  | { ok: true; info: AIRouteInfo }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// JSON extraction — mirrors validate.ts (strip fences, find first { })
// ---------------------------------------------------------------------------

export function extractRouteJSON(raw: string): string {
  // Strip ```json ... ``` or ``` ... ``` fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Find the outermost { ... } block
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_SHAPES = new Set(['loop', 'out-and-back', 'point-to-point']);
const VALID_DIFFICULTIES = new Set(['easy', 'moderate', 'hard', 'epic']);

// ---------------------------------------------------------------------------
// Repair helpers
// ---------------------------------------------------------------------------

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function coerceShape(v: unknown): AIRouteInfo['shape'] {
  const s = String(v ?? '').toLowerCase().trim();
  // Accept common model variations
  if (s === 'loop' || s === 'circular') return 'loop';
  if (s.includes('out') || s.includes('back')) return 'out-and-back';
  if (s.includes('point') || s.includes('p2p') || s.includes('one-way')) return 'point-to-point';
  // Default to loop — most scenic routes are loops
  return 'loop';
}

function coerceDifficulty(v: unknown): AIRouteInfo['difficulty'] {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'easy' || s === 'beginner' || s === 'flat') return 'easy';
  if (s === 'moderate' || s === 'medium' || s === 'intermediate') return 'moderate';
  if (s === 'hard' || s === 'difficult' || s === 'challenging') return 'hard';
  if (s === 'epic' || s === 'extreme' || s === 'very hard' || s === 'very_hard') return 'epic';
  return 'moderate';
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

export function validateRouteInfo(raw: string): RouteValidationResult {
  const errors: string[] = [];

  // 1. Extract JSON
  const jsonStr = extractRouteJSON(raw);
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

  let obj = parsed as Record<string, unknown>;

  // 2. Unwrap common wrapper keys: { "route": { ... } } etc.
  for (const key of ['route', 'result', 'data', 'recommendation', 'output']) {
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      const inner = obj[key] as Record<string, unknown>;
      if ('centerLat' in inner || 'name' in inner) {
        obj = inner;
        break;
      }
    }
  }

  // 3. Validate + repair centerLat / centerLon
  const centerLat = clampNumber(obj.centerLat ?? obj.lat ?? obj.latitude, -90, 90, NaN);
  const centerLon = clampNumber(
    obj.centerLon ?? obj.lon ?? obj.longitude,
    -180,
    180,
    NaN,
  );
  if (!isFinite(centerLat)) {
    errors.push('"centerLat" is missing or out of range (-90..90).');
  }
  if (!isFinite(centerLon)) {
    errors.push('"centerLon" is missing or out of range (-180..180).');
  }

  // 4. name
  const rawName = String(obj.name ?? '').trim();
  if (rawName.length < 2 || rawName.length > 80) {
    errors.push(`"name" must be 2–80 characters (got ${rawName.length}).`);
  }

  // 5. description
  const rawDesc = String(obj.description ?? '').trim();
  if (rawDesc.length < 2 || rawDesc.length > 400) {
    errors.push(`"description" must be 2–400 characters (got ${rawDesc.length}).`);
  }

  // 6. lengthKm
  const lengthKm = clampNumber(obj.lengthKm ?? obj.length_km ?? obj.distanceKm, 5, 200, NaN);
  if (!isFinite(lengthKm)) {
    errors.push('"lengthKm" is missing or out of range (5..200).');
  }

  // 7. shape — coerce with tolerance, warn if not recognized
  const rawShape = obj.shape ?? obj.routeShape ?? obj.route_shape;
  if (!VALID_SHAPES.has(String(rawShape ?? ''))) {
    errors.push(
      `"shape" must be "loop", "out-and-back", or "point-to-point" (got "${rawShape}") — auto-coerced.`,
    );
  }

  // 8. scenicRating 1..5
  const scenicRating = clampNumber(
    obj.scenicRating ?? obj.scenic_rating ?? obj.scenery,
    1,
    5,
    3,
  );

  // 9. difficulty
  const rawDifficulty = obj.difficulty ?? obj.level ?? obj.grade;
  if (!VALID_DIFFICULTIES.has(String(rawDifficulty ?? ''))) {
    errors.push(
      `"difficulty" must be "easy", "moderate", "hard", or "epic" (got "${rawDifficulty}") — auto-coerced.`,
    );
  }

  // 10. region
  const rawRegion = String(obj.region ?? obj.location ?? obj.area ?? '').trim();
  if (rawRegion.length < 2) {
    errors.push('"region" is missing or too short.');
  }

  // Bail on hard errors (missing coords, missing length — can't build a route)
  if (!isFinite(centerLat) || !isFinite(centerLon) || !isFinite(lengthKm)) {
    return { ok: false, errors };
  }

  // Assemble repaired info
  const info: AIRouteInfo = {
    centerLat,
    centerLon,
    name: rawName.length >= 2 ? rawName : 'AI Scenic Route',
    description: rawDesc.length >= 2 ? rawDesc : 'A beautiful AI-generated cycling route.',
    lengthKm: Math.round(lengthKm * 10) / 10,
    shape: coerceShape(rawShape),
    scenicRating: Math.round(scenicRating),
    difficulty: coerceDifficulty(rawDifficulty),
    region: rawRegion.length >= 2 ? rawRegion : 'Unknown region',
  };

  return { ok: true, info };
}
