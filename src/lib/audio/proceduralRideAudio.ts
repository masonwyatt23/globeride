/**
 * proceduralRideAudio — cycling-specific procedural audio synthesisers.
 *
 * All sounds are synthesised via Web Audio API — no audio asset files.
 * Designed to layer on top of the existing RideAudioEngine without
 * replacing it. Exposes a factory function + RideAudioEngine-shaped
 * interface that useRideAudio can drive each frame.
 *
 * Layers
 * ──────
 * • Chain noise   — bandpass-filtered white noise, freq + gain scale with cadence.
 * • Road rumble   — low-pass pink-noise approximation, gain + cutoff scale with speed.
 * • Brake squeal  — high-freq sine sweep, activated by brakeAmount > 0, fades 0.5 s.
 * • Gear-shift click — 1 kHz square-wave burst (50 ms) on cadence jumps.
 *
 * Gain budgets (no clipping)
 * ─────────────────────────
 * Master ≤ 0.70  Chain ≤ 0.30  Road ≤ 0.30  Brake ≤ 0.20  GearShift ≤ 0.25
 *
 * Lifecycle
 * ─────────
 * start()  — creates AudioContext, builds graph, begins Page Visibility listener.
 * stop()   — fades to silence, suspends context, tears down listener.
 * updateFromRideState() — called each rAF; schedules AudioParam ramps. Cheap.
 */

import { createShiftDetectorState, detectShift } from './cadenceShiftDetector';
import type { ShiftDetectorState } from './cadenceShiftDetector';

// ─── helpers ────────────────────────────────────────────────────────────────

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function ramp(param: AudioParam, target: number, durationSec: number, ctx: AudioContext): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + durationSec);
}

/** Approximate pink noise by summing three white-noise buffers with different
 *  sample rates and summing their gains. Good enough for road rumble. */
function createPinkNoiseBuffer(ctx: AudioContext, durationSec = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);

  // Running state for the Paul Kellett pink-noise algorithm.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    data[i] = clamp(pink, -1, 1);
  }
  return buf;
}

function createWhiteNoiseBuffer(ctx: AudioContext, durationSec = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

// ─── public interface ────────────────────────────────────────────────────────

export interface RideAudioState {
  /** Speed in m/s. */
  speedMs: number;
  /** Cadence in RPM. */
  cadenceRpm: number;
  /** Power in watts. */
  powerW: number;
  /** Brake amount 0–1. 0 = no braking, 1 = full stop. Optional. */
  brakeAmount?: number;
}

export interface ProceduralRideAudioEngine {
  /** The underlying AudioContext. */
  context: AudioContext;
  /** Master gain node — routed to destination. */
  masterGain: GainNode;
  /** Chain/drivetrain gain node. */
  chainGain: GainNode;
  /** Road rumble gain node. */
  roadGain: GainNode;
  /** Brake squeal gain node. */
  brakeGain: GainNode;
  /** Gear-shift click gain node. */
  gearShiftGain: GainNode;

  /** Resume AudioContext if suspended (call from a user gesture). */
  start(): void;
  /** Fade to silence and suspend the AudioContext. */
  stop(): void;
  /** Drive all layers from current ride telemetry. Call each rAF. */
  updateFromRideState(state: RideAudioState): void;
  /** Set the master volume (0–1). Clamped to 0.70 max. */
  setMasterVolume(volume: number): void;
}

// ─── factory ────────────────────────────────────────────────────────────────

/**
 * Build the procedural ride audio engine.
 *
 * Returns null silently when AudioContext is unavailable (unlikely in modern
 * browsers, but defensive for test / SSR environments).
 */
export function createRideAudioEngine(): ProceduralRideAudioEngine | null {
  if (typeof AudioContext === 'undefined' && typeof window === 'undefined') {
    return null;
  }

  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }

  // ── Master gain ────────────────────────────────────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.55, ctx.currentTime); // default volume
  masterGain.connect(ctx.destination);

  // ── Chain noise ────────────────────────────────────────────────────────────
  // White noise → bandpass filter → gain → master
  const chainNoiseSrc = ctx.createBufferSource();
  chainNoiseSrc.buffer = createWhiteNoiseBuffer(ctx);
  chainNoiseSrc.loop = true;

  const chainFilter = ctx.createBiquadFilter();
  chainFilter.type = 'bandpass';
  chainFilter.frequency.setValueAtTime(600, ctx.currentTime);
  chainFilter.Q.setValueAtTime(2.5, ctx.currentTime);

  const chainGain = ctx.createGain();
  chainGain.gain.setValueAtTime(0, ctx.currentTime);

  chainNoiseSrc.connect(chainFilter);
  chainFilter.connect(chainGain);
  chainGain.connect(masterGain);
  chainNoiseSrc.start();

  // ── Road rumble ────────────────────────────────────────────────────────────
  // Pink noise → low-pass filter → gain → master
  const roadNoiseSrc = ctx.createBufferSource();
  roadNoiseSrc.buffer = createPinkNoiseBuffer(ctx);
  roadNoiseSrc.loop = true;

  const roadFilter = ctx.createBiquadFilter();
  roadFilter.type = 'lowpass';
  roadFilter.frequency.setValueAtTime(200, ctx.currentTime);
  roadFilter.Q.setValueAtTime(0.8, ctx.currentTime);

  const roadGain = ctx.createGain();
  roadGain.gain.setValueAtTime(0, ctx.currentTime);

  roadNoiseSrc.connect(roadFilter);
  roadFilter.connect(roadGain);
  roadGain.connect(masterGain);
  roadNoiseSrc.start();

  // ── Brake squeal ───────────────────────────────────────────────────────────
  // High-freq sine oscillator → gain → master; activated on brake events
  const brakeOsc = ctx.createOscillator();
  brakeOsc.type = 'sine';
  brakeOsc.frequency.setValueAtTime(2800, ctx.currentTime);

  const brakeGain = ctx.createGain();
  brakeGain.gain.setValueAtTime(0, ctx.currentTime);

  brakeOsc.connect(brakeGain);
  brakeGain.connect(masterGain);
  brakeOsc.start();

  // ── Gear-shift click ───────────────────────────────────────────────────────
  // Transient: a square-wave burst scheduled by fireGearShiftClick().
  // gearShiftGain is the output bus — connect once; the per-shift burst
  // oscillators are created on demand and connect into this node.
  const gearShiftGain = ctx.createGain();
  gearShiftGain.gain.setValueAtTime(1, ctx.currentTime);
  gearShiftGain.connect(masterGain);

  // ── Page Visibility listener ───────────────────────────────────────────────
  function handleVisibilityChange() {
    if (document.hidden) {
      ctx.suspend().catch(() => undefined);
    } else {
      ctx.resume().catch(() => undefined);
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // ── Shift detector state ───────────────────────────────────────────────────
  const shiftState: ShiftDetectorState = createShiftDetectorState();

  // ── Brake fade timer ───────────────────────────────────────────────────────
  let brakeFadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let brakeActive = false;

  // ── Internal helpers ───────────────────────────────────────────────────────

  function fireGearShiftClick() {
    if (ctx.state === 'closed') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1000, now);

    // 50 ms burst with fast attack + fast decay to avoid click artifacts
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.25, now + 0.005);
    env.gain.linearRampToValueAtTime(0, now + 0.055);

    osc.connect(env);
    env.connect(gearShiftGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // ── Engine object ──────────────────────────────────────────────────────────

  const engine: ProceduralRideAudioEngine = {
    context: ctx,
    masterGain,
    chainGain,
    roadGain,
    brakeGain,
    gearShiftGain,

    start() {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => undefined);
      }
    },

    stop() {
      // Fade to silence over 400 ms then suspend.
      const g = masterGain.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.4);

      setTimeout(() => {
        try {
          chainNoiseSrc.stop();
          roadNoiseSrc.stop();
          brakeOsc.stop();
        } catch {
          // Nodes may already be stopped.
        }
        ctx.suspend().catch(() => undefined);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
        if (brakeFadeTimeoutId !== null) {
          clearTimeout(brakeFadeTimeoutId);
          brakeFadeTimeoutId = null;
        }
      }, 420);
    },

    setMasterVolume(volume: number) {
      const target = clamp(volume, 0, 0.70);
      ramp(masterGain.gain, target, 0.3, ctx);
    },

    updateFromRideState(state: RideAudioState) {
      if (ctx.state === 'closed') return;

      const { speedMs, cadenceRpm, brakeAmount = 0 } = state;
      const safeCadence = Number.isFinite(cadenceRpm) && cadenceRpm >= 0 ? cadenceRpm : 0;
      const safeSpeed   = Number.isFinite(speedMs)   && speedMs   >= 0 ? speedMs   : 0;
      const safeBrake   = Number.isFinite(brakeAmount) ? clamp(brakeAmount, 0, 1) : 0;
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

      // ── Chain noise ──────────────────────────────────────────────────────
      // Gain: 0 at 0 RPM → 0.30 at 90+ RPM (linear).
      const chainAmp = clamp(safeCadence / 90, 0, 1) * 0.30;
      ramp(chainGain.gain, chainAmp, 0.3, ctx);

      // Filter frequency: 400 Hz at 60 RPM → 2000 Hz at 110 RPM.
      const cadenceNorm = clamp((safeCadence - 60) / 50, 0, 1);
      const chainHz = lerp(400, 2000, cadenceNorm);
      ramp(chainFilter.frequency, chainHz, 0.5, ctx);

      // ── Road rumble ──────────────────────────────────────────────────────
      // Gain: 0 at rest → 0.30 at 15 m/s (~54 km/h).
      const roadAmp = clamp(safeSpeed / 15, 0, 1) * 0.30;
      ramp(roadGain.gain, roadAmp, 0.6, ctx);

      // Low-pass cutoff: 200 Hz at 0 → 600 Hz at 15 m/s.
      const roadCutoff = lerp(200, 600, clamp(safeSpeed / 15, 0, 1));
      ramp(roadFilter.frequency, roadCutoff, 0.6, ctx);

      // ── Brake squeal ─────────────────────────────────────────────────────
      if (safeBrake > 0 && !brakeActive) {
        brakeActive = true;
        if (brakeFadeTimeoutId !== null) {
          clearTimeout(brakeFadeTimeoutId);
          brakeFadeTimeoutId = null;
        }
        // Sweeping pitch: 2500–3200 Hz based on brake intensity.
        const squealHz = lerp(2500, 3200, safeBrake);
        ramp(brakeOsc.frequency, squealHz, 0.05, ctx);
        ramp(brakeGain.gain, clamp(safeBrake * 0.20, 0, 0.20), 0.05, ctx);
      } else if (safeBrake <= 0 && brakeActive) {
        brakeActive = false;
        // Fade out over 500 ms.
        ramp(brakeGain.gain, 0, 0.5, ctx);
        brakeFadeTimeoutId = setTimeout(() => {
          brakeFadeTimeoutId = null;
        }, 550);
      } else if (safeBrake > 0 && brakeActive) {
        // Update squeal pitch continuously while braking.
        const squealHz = lerp(2500, 3200, safeBrake);
        ramp(brakeOsc.frequency, squealHz, 0.1, ctx);
        ramp(brakeGain.gain, clamp(safeBrake * 0.20, 0, 0.20), 0.1, ctx);
      }

      // ── Gear-shift click ─────────────────────────────────────────────────
      if (detectShift(shiftState, safeCadence, nowMs)) {
        fireGearShiftClick();
      }
    },
  };

  return engine;
}
