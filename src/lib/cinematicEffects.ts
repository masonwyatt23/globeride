/**
 * cinematicEffects.ts — single-pass post-process pipeline for a filmic ride scene.
 *
 * Previous implementation crashed in production because it reached into Cesium's
 * internal bloom-composite sub-stage tree (bloom.get(0).get(0) etc.).  That tree
 * shape is undocumented and varies between Cesium versions / asset combos.  On the
 * photoreal-tiles + glTF avatar combination, one of those nested handles returned a
 * placeholder whose `_target` was set lazily, and the first render threw:
 *   TypeError: Cannot read properties of undefined (reading '_target')
 *
 * The new approach avoids PostProcessStageLibrary entirely.  We create exactly one
 * `new Cesium.PostProcessStage` with a hand-written GLSL fragment shader that does
 * THREE things in a SINGLE pass:
 *
 *   1. FILMIC COLOUR GRADE
 *      Filmic s-curve: lifts blacks slightly, soft-rolls highlights to avoid
 *      blow-out, adds mid-range punch.  A warm tint is blended into shadow
 *      pixels (<0.2 luma) for the "cycling-film" look without being garish.
 *
 *   2. BLOOM-LITE (single-pass gaussian tap loop)
 *      Bright pixels (luma > luminanceThreshold) are sampled at 5x5 offsets
 *      with gaussian weights, accumulated, and added back at low strength.
 *      No ping-pong, no composite — one stage, no internal tree to break.
 *      The glow is intentionally subtle: sun glints and the route line read
 *      as luminous but the scene never looks over-filtered.
 *
 *   3. RADIAL VIGNETTE
 *      Smooth smoothstep falloff darkens the corners so the eye stays on
 *      the rider, replicating the depth-of-field compression of a long lens.
 *
 * All three effects are driven by uniforms so quality tiers can dial them
 * independently.  On "low" the stage is disabled entirely (zero GPU cost).
 */

import * as Cesium from 'cesium';
import type { GraphicsQuality } from './graphicsQuality';
import { QUALITY_PARAMS } from './graphicsQuality';

// ---------------------------------------------------------------------------
// GLSL — single-pass filmic grade + bloom-lite + vignette
// ---------------------------------------------------------------------------

/**
 * Fragment shader that implements all three cinematic passes in one draw call.
 *
 * Reads: colorTexture (the scene's rendered output, post-tone-map sRGB).
 * Writes: out_FragColor.
 *
 * No depth texture access — avoids cross-version Cesium uniform-name pain.
 * No PostProcessStageLibrary — avoids internal tree traversal crashes.
 */
const CINEMATIC_GLSL = /* glsl */ `
// ---- Scene input ----
uniform sampler2D colorTexture;

// ---- Filmic grade uniforms ----
uniform float liftShadows;       // raise the black point (0-0.06). Default 0.020
uniform float crushHighlights;   // compress peaks above (1 - crushHighlights) (0-0.12). Default 0.045
uniform float warmthShadow;      // warm orange push into sub-0.2-luma pixels (0-0.06). Default 0.030

// ---- Bloom-lite uniforms ----
uniform float bloomStrength;        // additive blend factor for bloom layer (0-0.35). Default 0.08
uniform float luminanceThreshold;   // pixels above this luma value contribute to bloom (0-1). Default 0.72
uniform vec2  texelSize;            // 1/viewportWidth, 1/viewportHeight

// ---- Vignette uniforms ----
uniform float vignetteStrength;  // 0 = off, 1 = heavy darkness at corners. Default 0.40
uniform float vignetteRadius;    // falloff radius as fraction of half-diagonal. Default 0.72

in vec2 v_textureCoordinates;

// ---------------------------------------------------------------------------
// Filmic s-curve
// Lifts blacks, keeps mids punchy, soft shoulder on highlights.
// Operates per-channel so chromatic contrast is preserved.
// ---------------------------------------------------------------------------
float filmicCurve(float x) {
  // Lift: shift the entire range upward so pure black becomes liftShadows.
  float lifted = x * (1.0 - liftShadows) + liftShadows;
  // Soft shoulder: smoothstep compression above (1 - crushHighlights).
  float pivot  = 1.0 - crushHighlights;
  float t      = clamp((lifted - pivot) / crushHighlights, 0.0, 1.0);
  float shoulder = crushHighlights * (t * t * (3.0 - 2.0 * t));
  return lifted - shoulder;
}

// ---------------------------------------------------------------------------
// Single-pass bloom-lite: 5x5 gaussian tap loop.
// Weights follow a separable gaussian kernel (sigma approx 1.0).
// Only pixels whose luma exceeds luminanceThreshold contribute.
// ---------------------------------------------------------------------------
vec3 bloomSample(vec2 uv) {
  // Gaussian kernel weights for offsets -2,-1,0,+1,+2 (sigma approx 1.0, normalised).
  // [0.0625, 0.25, 0.375, 0.25, 0.0625] -- separable so the 5x5 product
  // is just w[i]*w[j].  We evaluate all 25 taps in one loop.
  float w[5];
  w[0] = 0.0625; w[1] = 0.25; w[2] = 0.375; w[3] = 0.25; w[4] = 0.0625;

  vec3  bloom  = vec3(0.0);
  float wTotal = 0.0;

  for (int x = 0; x < 5; x++) {
    for (int y = 0; y < 5; y++) {
      vec2  offset  = vec2(float(x - 2), float(y - 2)) * texelSize;
      vec4  sample4 = texture(colorTexture, uv + offset);
      float luma    = dot(sample4.rgb, vec3(0.2126, 0.7152, 0.0722));
      // Threshold: only bright pixels contribute, faded by how far they exceed it.
      float contrib = max(luma - luminanceThreshold, 0.0) / (1.0 - luminanceThreshold);
      float tapW    = w[x] * w[y] * contrib;
      bloom  += sample4.rgb * tapW;
      wTotal += tapW;
    }
  }

  // Normalise so the weight sum is 1 when there are bright pixels.
  return wTotal > 0.0 ? bloom / wTotal : vec3(0.0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
void main() {
  vec2 uv     = v_textureCoordinates;
  vec4 color  = texture(colorTexture, uv);

  // ---- 1. Filmic grade ----
  float r = filmicCurve(color.r);
  float g = filmicCurve(color.g);
  float b = filmicCurve(color.b);

  // Warm shadows: push red up / blue down in the dark parts of the image.
  float luma       = dot(vec3(r, g, b), vec3(0.2126, 0.7152, 0.0722));
  float shadowMask = clamp(1.0 - luma * 5.0, 0.0, 1.0); // only < 0.2 luma
  r += warmthShadow * shadowMask;
  b -= warmthShadow * 0.55 * shadowMask;

  vec3 graded = clamp(vec3(r, g, b), 0.0, 1.0);

  // ---- 2. Bloom-lite ----
  // bloomStrength == 0.0 means the tier wants no bloom (medium without bloom flag).
  vec3 bloomLayer = (bloomStrength > 0.0) ? bloomSample(uv) : vec3(0.0);
  vec3 withBloom  = graded + bloomLayer * bloomStrength;

  // ---- 3. Vignette ----
  vec2  offset   = uv - vec2(0.5);
  float dist     = length(offset) / vignetteRadius;
  float vignette = 1.0 - vignetteStrength * smoothstep(0.0, 1.0, dist * dist);

  out_FragColor = vec4(clamp(withBloom * vignette, 0.0, 1.0), color.a);
}
`;

// ---------------------------------------------------------------------------
// Per-tier uniform sets
// ---------------------------------------------------------------------------

interface CinematicUniforms {
  liftShadows: number;
  crushHighlights: number;
  warmthShadow: number;
  bloomStrength: number;
  luminanceThreshold: number;
  vignetteStrength: number;
  vignetteRadius: number;
}

/** Uniforms for medium quality: vignette + grade on, bloom very subtle. */
const UNIFORMS_MEDIUM: CinematicUniforms = {
  liftShadows: 0.020,
  crushHighlights: 0.045,
  warmthShadow: 0.030,
  bloomStrength: 0.04,        // very subtle — sun-glint edges only
  luminanceThreshold: 0.80,   // only the very brightest pixels bleed
  vignetteStrength: 0.38,
  vignetteRadius: 0.72,
};

/** Uniforms for high quality: vignette + grade + bloom at tasteful defaults. */
const UNIFORMS_HIGH: CinematicUniforms = {
  liftShadows: 0.022,
  crushHighlights: 0.048,
  warmthShadow: 0.032,
  bloomStrength: 0.10,        // tasteful glow — sun glints + route line
  luminanceThreshold: 0.72,   // slightly lower threshold = richer bloom halo
  vignetteStrength: 0.42,
  vignetteRadius: 0.70,
};

// ---------------------------------------------------------------------------
// State — single stage per viewer, held for its lifetime.
// ---------------------------------------------------------------------------

interface CinematicState {
  stage: Cesium.PostProcessStage;
}

// WeakMap: viewer -> state  (undefined = creation attempted + failed)
const stageMap = new WeakMap<Cesium.Viewer, CinematicState | undefined>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create (once) and configure the cinematic post-process stage on the viewer,
 * then set its enabled state according to the quality tier.
 *
 * Safe to call every time the quality setting changes — the stage is created
 * once per viewer instance and then just has its uniforms + enabled flag updated.
 *
 *   low    -> stage disabled (zero GPU cost).
 *   medium -> vignette + grade on, bloom very subtle.
 *   high   -> vignette + grade + bloom at tasteful defaults.
 */
export function applyCinematicEffects(
  viewer: Cesium.Viewer,
  quality: GraphicsQuality,
): void {
  if (viewer.isDestroyed()) return;

  const p = QUALITY_PARAMS[quality];

  // Low tier: disable the stage if it exists, skip creation.
  if (!p.vignetteGrade) {
    const existing = stageMap.get(viewer);
    if (existing?.stage && !existing.stage.isDestroyed()) {
      existing.stage.enabled = false;
    }
    return;
  }

  // Lazily create the stage on first medium/high call.
  if (!stageMap.has(viewer)) {
    const created = _createStage(viewer);
    stageMap.set(viewer, created);
  }
  const state = stageMap.get(viewer);
  if (!state?.stage || state.stage.isDestroyed()) return;

  // Pick uniform set for the tier.
  const unis = quality === 'high' ? UNIFORMS_HIGH : UNIFORMS_MEDIUM;

  // Texel size must be computed from the canvas at call time.
  const canvas = viewer.scene.canvas;
  const tw = canvas.width  > 0 ? 1.0 / canvas.width  : 1.0 / 1920;
  const th = canvas.height > 0 ? 1.0 / canvas.height : 1.0 / 1080;

  const u = state.stage.uniforms as Record<string, unknown>;
  u['liftShadows']        = unis.liftShadows;
  u['crushHighlights']    = unis.crushHighlights;
  u['warmthShadow']       = unis.warmthShadow;
  u['bloomStrength']      = p.bloom ? unis.bloomStrength : 0.0;
  u['luminanceThreshold'] = unis.luminanceThreshold;
  u['texelSize']          = new Cesium.Cartesian2(tw, th);
  u['vignetteStrength']   = unis.vignetteStrength;
  u['vignetteRadius']     = unis.vignetteRadius;

  state.stage.enabled = true;
}

/**
 * Remove and destroy the cinematic stage attached to this viewer.
 * Call during viewer cleanup so Cesium can release GPU resources.
 */
export function destroyCinematicEffects(viewer: Cesium.Viewer): void {
  if (viewer.isDestroyed()) return;
  const state = stageMap.get(viewer);
  if (!state) return;

  try {
    if (!state.stage.isDestroyed()) {
      viewer.scene.postProcessStages.remove(state.stage);
    }
  } catch {
    // Already removed or scene destroyed — ignore.
  }

  stageMap.delete(viewer);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _createStage(viewer: Cesium.Viewer): CinematicState | undefined {
  try {
    const canvas = viewer.scene.canvas;
    const tw = canvas.width  > 0 ? 1.0 / canvas.width  : 1.0 / 1920;
    const th = canvas.height > 0 ? 1.0 / canvas.height : 1.0 / 1080;

    const stage = new Cesium.PostProcessStage({
      name: 'globeride_cinematic',
      fragmentShader: CINEMATIC_GLSL,
      uniforms: {
        liftShadows:        UNIFORMS_MEDIUM.liftShadows,
        crushHighlights:    UNIFORMS_MEDIUM.crushHighlights,
        warmthShadow:       UNIFORMS_MEDIUM.warmthShadow,
        bloomStrength:      UNIFORMS_MEDIUM.bloomStrength,
        luminanceThreshold: UNIFORMS_MEDIUM.luminanceThreshold,
        texelSize:          new Cesium.Cartesian2(tw, th),
        vignetteStrength:   UNIFORMS_MEDIUM.vignetteStrength,
        vignetteRadius:     UNIFORMS_MEDIUM.vignetteRadius,
      },
    });

    stage.enabled = false; // applyCinematicEffects() will enable it
    viewer.scene.postProcessStages.add(stage);

    return { stage };
  } catch (err) {
    // Graceful degradation: if PostProcessStage creation fails for any reason
    // (unsupported WebGL extension, older driver, strict CSP) the ride works
    // fine — just without the filmic polish.
    console.warn('[GlobeRide] cinematicEffects: could not create post-process stage', err);
    return undefined;
  }
}
