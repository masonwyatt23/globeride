/**
 * Wet road material for rain-themed moods (Wave 30.D).
 *
 * Produces a Cesium custom PolylineMaterial that simulates a wet road:
 * - Blue-grey sky colour reflected in the asphalt surface
 * - Animated rain-streak normal-map pattern scrolling along the direction
 *   of travel (driven by czm_frameNumber)
 * - Subtle specular highlight from the streak pattern
 *
 * Use shouldUseWetMaterial() to test whether the active mood warrants this
 * material; fall back to PolylineGlowMaterialProperty for dry conditions.
 */

import * as Cesium from 'cesium';
import type { MoodId } from '@/lib/cesiumUtils';

// ---------------------------------------------------------------------------
// Rain mood set
// ---------------------------------------------------------------------------

/**
 * Mood IDs that represent precipitating / wet conditions and therefore
 * warrant the wet-road reflective material.
 */
const RAIN_MOODS = new Set<MoodId>([
  'fjord-rain',
  'alpine-storm',
]);

/**
 * Returns true when the given mood ID indicates wet / rain conditions and the
 * wet-road material should replace the standard glow polyline.
 */
export function shouldUseWetMaterial(moodId: string): boolean {
  return RAIN_MOODS.has(moodId as MoodId);
}

// ---------------------------------------------------------------------------
// GLSL shader source
// ---------------------------------------------------------------------------

/**
 * Fabric source string for the custom Cesium material.
 *
 * Uniforms exposed:
 *   u_time     – driven by czm_frameNumber * 0.008, advances the streak UV
 *   u_alpha    – overall opacity of the wet layer (0–1)
 *
 * The streaks are generated procedurally by sampling a sawtooth pattern
 * along the V axis of the polyline UV (0 = start, 1 = end of segment),
 * producing subtle diagonal rain lines that scroll along the road surface.
 */
const WET_ROAD_GLSL = `
uniform float u_time;
uniform float u_alpha;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);

  vec2 uv = materialInput.st;

  // Scroll UV along V (direction of travel).
  float scrolledV = fract(uv.y - u_time);

  // Rain-streak pattern: thin diagonal bands using a fract-based hash.
  float streak = fract(uv.x * 6.0 + scrolledV * 12.0);
  float streakMask = smoothstep(0.88, 1.0, streak) * 0.35;

  // Blue-grey sky reflection base colour.
  vec3 skyReflect = vec3(0.42, 0.48, 0.56);

  // Slightly brighten at streak positions to simulate specular glint.
  vec3 colour = skyReflect + vec3(streakMask * 0.45);

  // Vignette: fade the edges of the polyline width for a softer road feel.
  float edge = abs(uv.x - 0.5) * 2.0; // 0 centre, 1 edge
  float vignette = 1.0 - smoothstep(0.55, 1.0, edge);

  material.diffuse = colour * vignette;
  material.alpha   = u_alpha * vignette;
  material.emission = skyReflect * 0.08 * vignette;
  return material;
}
`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Cesium custom Material that gives a polyline a wet-road look.
 *
 * The material animates each frame via `u_time` linked to `czm_frameNumber`.
 * Callers are responsible for assigning it to a polyline entity:
 *
 *   entity.polyline!.material = createWetRoadMaterial() as unknown as Cesium.MaterialProperty;
 *
 * Note: Cesium's entity API accepts a `Cesium.Material` only through a
 * PolylineMaterialAppearance; for entities the caller should wrap it with
 * `new Cesium.PolylineMaterialAppearance({ material })` OR assign it directly
 * and let the entity system handle it via the MaterialProperty duck-type path.
 * In practice the entity system accepts `Cesium.Material` on `.material` for
 * polyline entities — so we return the raw Material here.
 */
export function createWetRoadMaterial(): Cesium.Material {
  return new Cesium.Material({
    fabric: {
      uniforms: {
        u_time: 0.0,
        u_alpha: 0.82,
      },
      source: WET_ROAD_GLSL,
    },
    // Animate u_time from the frame counter each render.
    // Cesium evaluates the `getValue` callback on the Material during each
    // render if we attach an update hook via the material's `uniforms` object.
    // We handle animation in updateWetMaterialTime() instead (called from the
    // CesiumViewer preRender handler), so no extra setup needed here.
  });
}

/**
 * Advance the wet material's time uniform.  Call once per preRender frame
 * with `performance.now()` (milliseconds since page load) so the rain streaks
 * scroll smoothly.  The scale factor keeps the streak drift at a visually
 * comfortable pace (~one full scroll per ~100 seconds).
 */
export function updateWetMaterialTime(
  material: Cesium.Material,
  nowMs: number,
): void {
  material.uniforms.u_time = nowMs * 0.00001;
}
