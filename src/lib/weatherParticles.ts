import * as Cesium from 'cesium';
import type { GraphicsQuality } from '@/lib/graphicsQuality';

/**
 * Supported weather kinds — matches the optional `weather` field that the mood
 * is adding to SceneMood MOODS entries in cesiumUtils.ts. Import-safe: this
 * module defines the canonical type so the parallel agent only needs to
 * reference it (or declare the same string union).
 */
export type WeatherKind = 'rain' | 'snow' | 'fog' | 'none';

/** Rider position passed to update() every preRender frame. */
export interface WeatherRiderState {
  lat: number;
  lon: number;
  ele: number;
  /** Rider heading in radians (east = 0, north = π/2). Not used by particles
   *  internally but kept so callers can pass through the same state object. */
  heading?: number;
}

/** Handle returned by createWeatherSystem. */
export interface WeatherSystem {
  /**
   * Reposition the emitter volume over the rider. Called every preRender
   * frame. MUST NOT allocate new objects — it runs at 60 fps.
   */
  update(state: WeatherRiderState): void;
  /**
   * Tear down Cesium resources. Call on viewer unmount and route change.
   * Safe to call multiple times (idempotent after first call).
   */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// No-op system — returned for 'none' kind or when quality = 'low'.
// ---------------------------------------------------------------------------

const NOOP_SYSTEM: WeatherSystem = {
  update() { /* intentional no-op */ },
  dispose() { /* intentional no-op */ },
};

// ---------------------------------------------------------------------------
// Particle count per tier
// ---------------------------------------------------------------------------

interface TierCounts {
  rain: number;
  snow: number;
  fog: number;
}

const PARTICLE_COUNTS: Record<GraphicsQuality, TierCounts> = {
  low:    { rain: 0,   snow: 0,   fog: 0  },
  medium: { rain: 150, snow: 100, fog: 20 },
  high:   { rain: 400, snow: 200, fog: 40 },
};

// ---------------------------------------------------------------------------
// Helper — build a 1×1 white canvas data URL for a simple sprite.
// We use a single 8×8 pixel image to avoid loading external assets.
// Rain gets a tall thin shape; snow and fog get a square blob.
// ---------------------------------------------------------------------------

function makeRainImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 24;
  const ctx = c.getContext('2d')!;
  // White streak with soft edges
  const grad = ctx.createLinearGradient(0, 0, 0, 24);
  grad.addColorStop(0, 'rgba(200,220,255,0)');
  grad.addColorStop(0.2, 'rgba(200,220,255,0.85)');
  grad.addColorStop(0.8, 'rgba(200,220,255,0.85)');
  grad.addColorStop(1, 'rgba(200,220,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 24);
  return c;
}

function makeSnowImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(6, 6, 0, 6, 6, 6);
  grad.addColorStop(0, 'rgba(240,245,255,0.92)');
  grad.addColorStop(0.5, 'rgba(220,235,255,0.65)');
  grad.addColorStop(1, 'rgba(200,220,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(6, 6, 6, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function makeFogImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(220,225,230,0.38)');
  grad.addColorStop(0.4, 'rgba(210,215,220,0.22)');
  grad.addColorStop(1, 'rgba(200,210,215,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

// ---------------------------------------------------------------------------
// Core factory
// ---------------------------------------------------------------------------

/**
 * Create a weather particle system attached to `viewer`.
 *
 * The system repositions itself over the rider each frame via `update()`.
 * Call `dispose()` when tearing down (viewer unmount or route change).
 *
 * Quality gating:
 *   low    — always returns NOOP_SYSTEM (0 particles).
 *   medium — half particle counts.
 *   high   — full particle counts.
 */
export function createWeatherSystem(
  viewer: Cesium.Viewer,
  kind: WeatherKind,
  quality: GraphicsQuality,
): WeatherSystem {
  if (kind === 'none') return NOOP_SYSTEM;
  if (quality === 'low') return NOOP_SYSTEM;
  if (viewer.isDestroyed()) return NOOP_SYSTEM;

  const counts = PARTICLE_COUNTS[quality];
  const maxParticles = counts[kind];
  if (maxParticles === 0) return NOOP_SYSTEM;

  // ---- Shared mutable position (updated in update(), read by callback) ----
  // We hold a single Cartesian3 in a 1-element array so the CallbackProperty
  // closure can read it without any allocation per frame.
  const emitterPos: [Cesium.Cartesian3] = [
    new Cesium.Cartesian3(0, 0, 0),
  ];

  // ---- Build ParticleSystem config per kind ----
  let imageCanvas: HTMLCanvasElement;
  // Typed to match the ParticleSystem constructor's inline options shape.
  let config: {
    modelMatrix?: Cesium.Matrix4;
    emitter?: Cesium.ParticleEmitter;
    emissionRate?: number;
    maximumParticleLife?: number;
    minimumParticleLife?: number;
    minimumSpeed?: number;
    maximumSpeed?: number;
    startScale?: number;
    endScale?: number;
    startColor?: Cesium.Color;
    endColor?: Cesium.Color;
    particleLife?: number;
    imageSize?: Cesium.Cartesian2;
  };

  if (kind === 'rain') {
    imageCanvas = makeRainImage();
    config = {
      // Spawn cube: 60m wide, 30m tall above the rider
      modelMatrix: Cesium.Matrix4.IDENTITY.clone(),
      emitter: new Cesium.BoxEmitter(new Cesium.Cartesian3(60, 60, 30)),
      emissionRate: maxParticles * 3,           // high emission rate so streaks are dense
      maximumParticleLife: 0.8,
      minimumParticleLife: 0.4,
      minimumSpeed: 12,                          // ~2 m/s downward + wind drift
      maximumSpeed: 18,
      startScale: 1.0,
      endScale: 0.8,
      startColor: new Cesium.Color(0.78, 0.88, 1.0, 0.75),
      endColor: new Cesium.Color(0.78, 0.88, 1.0, 0.0),
      // Slight tilt so streaks drift like real rain in wind
      // gravity vector in local ENU — mostly -Z (down) with small X drift
      // We'll apply via particle update callback below.
      particleLife: 0.6,
      imageSize: new Cesium.Cartesian2(2, 18),
    };
  } else if (kind === 'snow') {
    imageCanvas = makeSnowImage();
    config = {
      modelMatrix: Cesium.Matrix4.IDENTITY.clone(),
      emitter: new Cesium.BoxEmitter(new Cesium.Cartesian3(80, 80, 40)),
      emissionRate: maxParticles * 0.8,
      maximumParticleLife: 4.0,
      minimumParticleLife: 2.0,
      minimumSpeed: 1.5,
      maximumSpeed: 3.5,
      startScale: 1.0,
      endScale: 1.2,
      startColor: new Cesium.Color(0.94, 0.96, 1.0, 0.85),
      endColor: new Cesium.Color(0.94, 0.96, 1.0, 0.0),
      particleLife: 3.0,
      imageSize: new Cesium.Cartesian2(8, 8),
    };
  } else {
    // fog
    imageCanvas = makeFogImage();
    config = {
      modelMatrix: Cesium.Matrix4.IDENTITY.clone(),
      emitter: new Cesium.SphereEmitter(50),    // sphere radius 50m at rider altitude
      emissionRate: maxParticles * 0.15,         // very slow — fog drifts lazily
      maximumParticleLife: 12.0,
      minimumParticleLife: 6.0,
      minimumSpeed: 0.3,
      maximumSpeed: 1.2,
      startScale: 2.5,
      endScale: 4.0,
      startColor: new Cesium.Color(0.86, 0.88, 0.90, 0.22),
      endColor: new Cesium.Color(0.86, 0.88, 0.90, 0.0),
      particleLife: 9.0,
      imageSize: new Cesium.Cartesian2(120, 120),
    };
  }

  // Per-particle update callback — applies gravity/drift without allocation.
  // Re-used scratch vectors declared once per system (not per frame).
  const _gravityWorld = new Cesium.Cartesian3();
  const _enuMatrix = new Cesium.Matrix4();
  const _gravLocal = new Cesium.Cartesian3(
    kind === 'rain'  ? 2.5 : kind === 'snow' ? 0.6 : 0.5,   // small east drift
    kind === 'rain'  ? 0.8 : kind === 'snow' ? 0.4 : 0.3,   // tiny north drift
    kind === 'rain'  ? -16 : kind === 'snow' ? -1.5 : 0.0,  // downward accel
  );

  const updateParticle = (particle: Cesium.Particle, dt: number) => {
    // Transform the local-ENU gravity vector into world ECEF.
    // emitterPos[0] is updated before this fires, so it's always current.
    Cesium.Transforms.eastNorthUpToFixedFrame(emitterPos[0], undefined, _enuMatrix);
    Cesium.Matrix4.multiplyByPointAsVector(_enuMatrix, _gravLocal, _gravityWorld);
    Cesium.Cartesian3.add(
      particle.velocity,
      Cesium.Cartesian3.multiplyByScalar(_gravityWorld, dt, _gravityWorld),
      particle.velocity,
    );
  };

  // Build the primitive ParticleSystem — not an entity, so we use
  // viewer.scene.primitives directly for full control.
  const system = new Cesium.ParticleSystem({
    ...config,
    image: imageCanvas,
    updateCallback: updateParticle,
    // modelMatrix is overwritten each frame inside update() to track the rider.
    modelMatrix: Cesium.Matrix4.fromTranslation(emitterPos[0], new Cesium.Matrix4()),
  });

  viewer.scene.primitives.add(system);

  // Reuse scratch objects in update() — declared once per system.
  const _scratch4 = new Cesium.Matrix4();

  let disposed = false;

  return {
    update(state: WeatherRiderState) {
      if (disposed) return;
      if (viewer.isDestroyed()) return;

      // Reposition spawn volume above rider.
      // For rain/snow we raise by 25m so particles fall INTO the rider's view.
      // For fog we stay at rider altitude so patches drift through the scene.
      const spawnLift = kind === 'fog' ? 3 : 25;
      Cesium.Cartesian3.fromDegrees(
        state.lon,
        state.lat,
        state.ele + spawnLift,
        undefined,
        emitterPos[0],          // writes in-place, zero allocation
      );

      // Update the particle system's modelMatrix to the new spawn position.
      Cesium.Matrix4.fromTranslation(emitterPos[0], _scratch4);
      Cesium.Matrix4.clone(_scratch4, system.modelMatrix);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (!viewer.isDestroyed()) {
        try {
          viewer.scene.primitives.remove(system);
        } catch {
          // Viewer may be mid-teardown — ignore.
        }
      }
      if (!system.isDestroyed()) {
        system.destroy();
      }
    },
  };
}
