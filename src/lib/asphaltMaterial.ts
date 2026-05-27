/**
 * asphaltMaterial.ts — Cesium custom materials for a road-surface appearance
 *.
 *
 * Two variants:
 *   createAsphaltMaterial()              — flat noise-based dark-grey asphalt
 *   createGradientColoredAsphaltMaterial — edge colors keyed to gradient stops
 *
 * Both target Cesium.CorridorGraphics / CorridorGeometry which uses ST
 * coordinates in the same (0–1, 0–1) space as polyline materials.
 *
 * No WebGL context is needed to import this module; Cesium.Material is
 * instantiated lazily when the factory functions are called.
 */

import * as Cesium from 'cesium';

// ---------------------------------------------------------------------------
// GLSL — flat asphalt
// ---------------------------------------------------------------------------

const ASPHALT_GLSL = `
uniform float u_roughness;

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);

  vec2 uv = materialInput.st;

  // Cheap noise: layered sine hash that looks like fine asphalt granules.
  float n = sin(uv.x * 87.3 + uv.y * 53.1) * 0.5
          + sin(uv.x * 41.1 - uv.y * 71.7) * 0.3
          + sin(uv.x * 120.0 + uv.y * 19.3) * 0.2;
  n = n * 0.5 + 0.5; // remap to [0,1]

  // Base asphalt colour: very dark grey, subtly warm.
  vec3 base = vec3(0.13, 0.12, 0.11);
  // Granule brightness variation: ±0.05 around base.
  vec3 colour = base + vec3(n * u_roughness - u_roughness * 0.5);

  // White centre-line dashes (U in [0.44, 0.56]).
  float centreStripe = step(0.44, uv.x) - step(0.56, uv.x);
  // Dash pattern along V: on for 4m, off for 4m (assume corridor 8m/tile).
  float dash = step(0.5, fract(uv.y * 8.0));
  colour = mix(colour, vec3(0.95, 0.90, 0.60), centreStripe * dash * 0.85);

  // White edge stripes at U ≈ 0 and U ≈ 1 (6% width each).
  float edgeL = 1.0 - step(0.06, uv.x);
  float edgeR = step(0.94, uv.x);
  colour = mix(colour, vec3(0.92, 0.92, 0.92), (edgeL + edgeR) * 0.90);

  material.diffuse  = colour;
  material.specular = 0.08;
  material.shininess = 8.0;
  material.alpha    = 1.0;
  return material;
}
`;

/**
 * Create a Cesium Material that renders as photoreal asphalt with white edge
 * stripes and a dashed yellow centre line.
 *
 * Intended for use with CorridorGraphics (wide corridor clamped to terrain).
 */
export function createAsphaltMaterial(): Cesium.Material {
  return new Cesium.Material({
    fabric: {
      uniforms: {
        u_roughness: 0.07,
      },
      source: ASPHALT_GLSL,
    },
    translucent: false,
  });
}

// ---------------------------------------------------------------------------
// GLSL — gradient-colored edge variant
// ---------------------------------------------------------------------------

/**
 * Gradient stop descriptor: a fraction along the route [0–1] paired with a
 * Cesium.Color used to tint the corridor edge at that point.
 */
export interface GradientStop {
  stop: number;
  color: Cesium.Color;
}

const GRADIENT_ASPHALT_GLSL = `
uniform float u_roughness;
// Packed as vec4 arrays: r, g, b per stop + stop position.
// We support up to 16 gradient stops; unused entries have stop = -1.
uniform vec4 u_stops[16]; // .rgb = colour, .a = stop position

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);

  vec2 uv = materialInput.st;

  // Asphalt base noise.
  float n = sin(uv.x * 87.3 + uv.y * 53.1) * 0.5
          + sin(uv.x * 41.1 - uv.y * 71.7) * 0.3
          + sin(uv.x * 120.0 + uv.y * 19.3) * 0.2;
  n = n * 0.5 + 0.5;
  vec3 base = vec3(0.13, 0.12, 0.11) + vec3(n * u_roughness - u_roughness * 0.5);

  // Resolve gradient edge colour by interpolating u_stops at current V.
  vec3 edgeColour = vec3(0.13, 0.7, 0.13); // default green
  float v = uv.y;
  for (int i = 0; i < 15; i++) {
    vec4 curr = u_stops[i];
    vec4 next = u_stops[i + 1];
    if (curr.a < 0.0) break;
    if (next.a < 0.0 || v <= next.a) {
      if (next.a < 0.0) {
        edgeColour = curr.rgb;
      } else {
        float t = clamp((v - curr.a) / max(next.a - curr.a, 0.0001), 0.0, 1.0);
        edgeColour = mix(curr.rgb, next.rgb, t);
      }
      break;
    }
  }

  // Edge stripe width: 10% of corridor width.
  float edgeL = 1.0 - step(0.10, uv.x);
  float edgeR = step(0.90, uv.x);
  vec3 colour = mix(base, edgeColour, (edgeL + edgeR) * 0.95);

  // White centre-line dashes.
  float centreStripe = step(0.46, uv.x) - step(0.54, uv.x);
  float dash = step(0.5, fract(uv.y * 8.0));
  colour = mix(colour, vec3(0.95, 0.90, 0.60), centreStripe * dash * 0.80);

  material.diffuse  = colour;
  material.specular = 0.06;
  material.shininess = 6.0;
  material.alpha    = 1.0;
  return material;
}
`;

/**
 * Create an asphalt material whose edge stripe color follows the route
 * gradient (green = flat, yellow = moderate, orange = hard, red = steep).
 *
 * `gradientColors` should be sorted by stop (ascending 0→1) and have at
 * most 16 entries. Pass the output of buildGradientStops() for best results.
 */
export function createGradientColoredAsphaltMaterial(
  gradientColors: GradientStop[],
): Cesium.Material {
  // Pack stops into 16 vec4 slots. Sentinel: .a = -1 marks end.
  const packed: number[][] = [];
  const stops = gradientColors.slice(0, 15); // max 15 to allow sentinel at 15
  for (const s of stops) {
    packed.push([s.color.red, s.color.green, s.color.blue, s.stop]);
  }
  // Sentinel entry at index stops.length.
  while (packed.length < 16) {
    packed.push([0, 0, 0, -1]);
  }

  return new Cesium.Material({
    fabric: {
      uniforms: {
        u_roughness: 0.07,
        u_stops: packed.map((p) => new Cesium.Cartesian4(p[0], p[1], p[2], p[3])),
      },
      source: GRADIENT_ASPHALT_GLSL,
    },
    translucent: false,
  });
}
