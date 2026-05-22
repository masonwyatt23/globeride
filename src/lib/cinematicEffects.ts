/**
 * cinematicEffects.ts — post-process and atmosphere polish for a filmic
 * riding scene.
 *
 * Three layers of cinematic enhancement, each wired to the quality tier:
 *
 *  BLOOM  (medium + high)
 *    Subtle glow on bright surfaces — sun glints off the photoreal mesh,
 *    route line reads as luminous, sky reads with halo depth.
 *    Uses Cesium's built-in bloom composite (contrast → blur → composite).
 *    Kept deliberately faint — we want "premium DSLR", not "Instagram filter".
 *
 *  AMBIENT OCCLUSION  (high only)
 *    Soft contact shadows in building crevices and under trees ground the
 *    scene visually without the full cost of dynamic shadows.
 *    Requires a depth buffer (always present in WebGL2 / Cesium).
 *
 *  VIGNETTE + COLOUR GRADE  (medium + high)
 *    A single custom GLSL post-process stage that does two things cheaply:
 *      • Radial vignette: gently darkens corners → eye drawn to the rider.
 *      • Filmic colour grade: lifts blacks slightly, crushes highlights
 *        a hair, warms shadows, and desaturates extreme chromas — the
 *        "filmic S-curve + cross-process" look beloved by cycling films.
 *
 * All stages are created once and stored.  `applyCinematicEffects()` enables
 * or disables them based on the current quality tier; it is safe to call
 * every time the quality setting changes.
 */

import * as Cesium from 'cesium';
import type { GraphicsQuality } from './graphicsQuality';

// ---------------------------------------------------------------------------
// GLSL — vignette + filmic grade
// ---------------------------------------------------------------------------

/** Filmic vignette + colour-grade fragment shader.
 *
 * Works on the rendered colour texture (czm_colorTexture) which is already
 * in sRGB after Cesium's own tonemapping.  We apply a lightweight s-curve
 * and vignette directly in display space — cheap and effective.
 */
const VIGNETTE_GRADE_GLSL = /* glsl */ `
uniform sampler2D colorTexture;
uniform float vignetteStrength;   // 0 = off, 1 = heavy. Default 0.38
uniform float vignetteRadius;     // 1.0 = corners only, 0.5 = half-screen. Default 0.75
uniform float liftShadows;        // Lift black point (0–0.06). Default 0.025
uniform float crushHighlights;    // Pull white point down (0–0.12). Default 0.04
uniform float warmthShadow;       // Warm colour in shadows (0–0.06). Default 0.03

in vec2 v_textureCoordinates;

// Filmic s-curve: lifts blacks, compresses highlights, adds mid-contrast.
float filmicCurve(float x) {
  // Lift blacks, keep mids, soft roll-off at top.
  float lifted = x * (1.0 - liftShadows) + liftShadows;
  // Soft shoulder: compress highlights above ~0.8.
  float t = max(lifted - (1.0 - crushHighlights), 0.0) / crushHighlights;
  float shoulder = crushHighlights * (t * t * (3.0 - 2.0 * t));
  return lifted - shoulder;
}

void main() {
  vec2 uv = v_textureCoordinates;
  vec4 color = texture(colorTexture, uv);

  // --- Filmic grade ---
  // Apply per-channel s-curve.
  float r = filmicCurve(color.r);
  float g = filmicCurve(color.g);
  float b = filmicCurve(color.b);

  // Warm the shadows: in dark pixels, nudge red up / blue down slightly.
  float luma = dot(vec3(r, g, b), vec3(0.2126, 0.7152, 0.0722));
  float shadowMask = max(0.0, 1.0 - luma * 5.0); // only pixels < 0.2 luma
  r += warmthShadow * shadowMask;
  b -= warmthShadow * 0.5 * shadowMask;

  // --- Vignette ---
  // Smooth radial falloff centred at 0.5, 0.5.
  vec2 offset = uv - vec2(0.5);
  float dist = length(offset) / vignetteRadius;
  float vignette = 1.0 - vignetteStrength * smoothstep(0.0, 1.0, dist * dist);

  out_FragColor = vec4(clamp(vec3(r, g, b) * vignette, 0.0, 1.0), color.a);
}
`;

// ---------------------------------------------------------------------------
// State — stages held for the lifetime of the viewer.
// ---------------------------------------------------------------------------

interface CinematicStages {
  bloom: Cesium.PostProcessStageComposite;
  ao: Cesium.PostProcessStageComposite;
  vignetteGrade: Cesium.PostProcessStage;
}

// We key by viewer to allow multiple simultaneous viewers (uncommon but safe).
// undefined = creation was attempted but failed; absence = not yet attempted.
const stageMap = new WeakMap<Cesium.Viewer, CinematicStages | undefined>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create and register all cinematic post-process stages on the viewer, then
 * set their enabled state according to the quality tier.
 *
 * Safe to call multiple times (idempotent — stages are only created once per
 * viewer instance).
 */
export function applyCinematicEffects(
  viewer: Cesium.Viewer,
  quality: GraphicsQuality,
): void {
  if (viewer.isDestroyed()) return;

  // stageMap.has() distinguishes "never attempted" from "attempted and failed".
  let stages = stageMap.get(viewer);
  if (!stageMap.has(viewer)) {
    const created = createStages(viewer);
    // Store undefined on failure so we don't retry every quality change.
    stageMap.set(viewer, created ?? undefined);
    stages = created ?? undefined;
  }
  if (!stages) return; // creation failed — continue without effects

  const wantBloom = quality === 'medium' || quality === 'high';
  const wantAo = quality === 'high';
  const wantVignette = quality === 'medium' || quality === 'high';

  stages.bloom.enabled = wantBloom;
  stages.ao.enabled = wantAo;
  stages.vignetteGrade.enabled = wantVignette;
}

/**
 * Tear down all cinematic stages attached to this viewer.
 * Call on viewer cleanup so Cesium can release GPU resources.
 */
export function destroyCinematicEffects(viewer: Cesium.Viewer): void {
  if (viewer.isDestroyed()) return;
  const stages = stageMap.get(viewer);
  if (!stages) return;

  const col = viewer.scene.postProcessStages;
  try { col.remove(stages.bloom); } catch { /* already removed */ }
  try { col.remove(stages.ao); } catch { /* already removed */ }
  try { col.remove(stages.vignetteGrade); } catch { /* already removed */ }

  stageMap.delete(viewer);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createStages(viewer: Cesium.Viewer): CinematicStages | undefined {
  try {
    const col = viewer.scene.postProcessStages;

    // PostProcessStageLibrary.createBloomStage() and createAmbientOcclusionStage()
    // exist at runtime in Cesium 1.107+ but are not declared in the bundled
    // Cesium.d.ts shipped with this package version.  We cast through `unknown`
    // so TypeScript accepts the call while the runtime still works correctly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lib = Cesium.PostProcessStageLibrary as unknown as Record<string, (...args: unknown[]) => Cesium.PostProcessStageComposite>;

    // ------------------------------------------------------------------
    // 1. Bloom — subtle glow on bright surfaces
    // ------------------------------------------------------------------
    const bloom = lib.createBloomStage();
    // Cesium's bloom composite has two sub-stages:
    //   czm_bloom_contrast_bias_blur  (sub-stages: contrast_bias, blur_x, blur_y)
    //   czm_bloom_generate_composite  (uniforms: glowOnly, bloomTexture)
    //
    // We tune contrast/brightness/blur to keep the glow feather-light.
    const contrastBiasBlur = bloom.get(0) as Cesium.PostProcessStageComposite;
    const contrastBias = contrastBiasBlur.get(0) as Cesium.PostProcessStage;
    const blurComposite = contrastBiasBlur.get(1) as Cesium.PostProcessStageComposite;
    const blurX = blurComposite.get(0) as Cesium.PostProcessStage;
    const blurY = blurComposite.get(1) as Cesium.PostProcessStage;
    const generateComposite = bloom.get(1) as Cesium.PostProcessStage;

    // contrast ∈ [-1,1], brightness ∈ [-1,1]
    // Low contrast + slight brightness lift = only the very brightest pixels bloom.
    contrastBias.uniforms.contrast = -0.2;
    contrastBias.uniforms.brightness = -0.1;

    // Tight sigma keeps the glow radius small → premium, not hazy.
    blurX.uniforms.sigma = 2.5;
    blurX.uniforms.stepSize = 1.0;
    blurY.uniforms.sigma = 2.5;
    blurY.uniforms.stepSize = 1.0;

    // glowOnly: false = blend glow over scene (not replace). bloomTexture auto-set by pipeline.
    generateComposite.uniforms.glowOnly = false;

    bloom.enabled = false; // disabled until applyCinematicEffects() sets tier
    col.add(bloom);

    // ------------------------------------------------------------------
    // 2. Ambient occlusion — high-tier only
    // ------------------------------------------------------------------
    const ao = lib.createAmbientOcclusionStage();
    // Sub-stages: czm_ambient_occlusion_generate (intensity, bias, lengthCap, …)
    //             czm_ambient_occlusion_composite (ambientOcclusionOnly)
    const aoGenerate = ao.get(0) as Cesium.PostProcessStage;
    const aoComposite = ao.get(1) as Cesium.PostProcessStage;

    aoGenerate.uniforms.intensity = 2.8;       // subtle darkening
    aoGenerate.uniforms.bias = 0.1;            // avoids self-shadowing on flat surfaces
    aoGenerate.uniforms.lengthCap = 0.22;      // sample radius — smaller = tighter contact
    aoGenerate.uniforms.directionCount = 8;    // quality/cost balance
    aoGenerate.uniforms.stepCount = 6;         // ditto

    aoComposite.uniforms.ambientOcclusionOnly = false; // blend AO over colour

    ao.enabled = false;
    col.add(ao);

    // ------------------------------------------------------------------
    // 3. Vignette + filmic grade — custom GLSL
    // ------------------------------------------------------------------
    const vignetteGrade = new Cesium.PostProcessStage({
      name: 'globeride_vignette_grade',
      fragmentShader: VIGNETTE_GRADE_GLSL,
      uniforms: {
        vignetteStrength: 0.38,    // 0 = none, 1 = very heavy
        vignetteRadius: 0.75,      // falloff radius as fraction of half-diagonal
        liftShadows: 0.025,        // raise the black point slightly
        crushHighlights: 0.04,     // pull bright peaks down into legal range
        warmthShadow: 0.03,        // warm cast in shadowy areas
      },
    });

    vignetteGrade.enabled = false;
    col.add(vignetteGrade);

    return { bloom, ao, vignetteGrade };
  } catch (err) {
    // Any failure (e.g. missing WebGL extension) — skip silently, ride works fine.
    console.warn('[GlobeRide] cinematicEffects: could not create post-process stages', err);
    return undefined;
  }
}
