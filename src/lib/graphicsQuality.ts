import * as Cesium from 'cesium';

/**
 * Graphics quality tiers — each maps to a concrete set of Cesium scene params.
 *
 * low    — fastest: no MSAA, no shadows, high tile SSE, light fog.
 *           Best for integrated GPUs, older machines, or battery-saver mode.
 * medium — balanced: MSAA×2, shadows off (big cost), moderate SSE, fog on.
 *           Good for mid-range GPUs without sacrificing tile detail too much.
 * high   — maximum fidelity (the original look): MSAA×4, soft shadows,
 *           low SSE (more tile detail), full fog. For discrete GPUs.
 */
export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface QualityParams {
  /** MSAA sample count. 1 = off. */
  msaaSamples: number;
  /** FXAA post-process enabled. */
  fxaa: boolean;
  /** Shadow map enabled on the viewer. */
  shadows: boolean;
  /** Shadow map soft-shadows. Only relevant when shadows = true. */
  softShadows: boolean;
  /** Shadow map texel size (power of 2). Only relevant when shadows = true. */
  shadowMapSize: number;
  /** Maximum shadow draw distance in metres. */
  shadowMaxDistance: number;
  /** Tileset maximumScreenSpaceError — lower = more detail, higher = faster. */
  maximumScreenSpaceError: number;
  /** Fog density (scene.fog.density). */
  fogDensity: number;
}

export const QUALITY_PARAMS: Record<GraphicsQuality, QualityParams> = {
  low: {
    msaaSamples: 1,
    fxaa: false,
    shadows: false,
    softShadows: false,
    shadowMapSize: 512,
    shadowMaxDistance: 1000,
    maximumScreenSpaceError: 24,
    fogDensity: 0.0002,
  },
  medium: {
    msaaSamples: 2,
    fxaa: true,
    shadows: false,
    softShadows: false,
    shadowMapSize: 1024,
    shadowMaxDistance: 1500,
    maximumScreenSpaceError: 16,
    fogDensity: 0.00015,
  },
  high: {
    msaaSamples: 4,
    fxaa: true,
    shadows: true,
    softShadows: true,
    shadowMapSize: 2048,
    shadowMaxDistance: 2500,
    maximumScreenSpaceError: 8,
    fogDensity: 0.00012,
  },
};

export const QUALITY_LABELS: Record<GraphicsQuality, { label: string; sub: string }> = {
  low: { label: 'Low', sub: 'fastest' },
  medium: { label: 'Medium', sub: 'balanced' },
  high: { label: 'High', sub: 'best quality' },
};

/**
 * Apply a quality tier to a live Cesium Viewer + optional 3D-tileset.
 * Safe to call after mount (viewer must not be destroyed).
 */
export function applyGraphicsQuality(
  viewer: Cesium.Viewer,
  quality: GraphicsQuality,
  tileset?: Cesium.Cesium3DTileset | null,
): void {
  if (viewer.isDestroyed()) return;

  const p = QUALITY_PARAMS[quality];
  const scene = viewer.scene;

  // Anti-aliasing
  scene.postProcessStages.fxaa.enabled = p.fxaa;
  if (scene.msaaSupported) scene.msaaSamples = p.msaaSamples;

  // Shadows
  viewer.shadows = p.shadows;
  scene.shadowMap.enabled = p.shadows;
  if (p.shadows) {
    scene.shadowMap.softShadows = p.softShadows;
    scene.shadowMap.size = p.shadowMapSize;
    scene.shadowMap.maximumDistance = p.shadowMaxDistance;
  }

  // Fog
  scene.fog.density = p.fogDensity;

  // Tileset detail
  if (tileset && !tileset.isDestroyed()) {
    tileset.maximumScreenSpaceError = p.maximumScreenSpaceError;
  }
}
