/**
 * rideAudio — Web Audio engine for GlobeRide.
 *
 * All sound is synthesised in-browser (oscillators + noise + filters + gain).
 * No audio assets, no network requests. Fully offline-capable.
 *
 * Design goals
 * ────────────
 * • Tasteful and minimal — never distracting.
 * • Ambient wind/road hum scales with speed (quasi-realistic).
 * • Effort layer: low-drone frequency rises with gradient/power intensity.
 * • Event chimes: short, pleasant; used for workout-segment change & ride finish.
 * • Master gain exposed so the toggle/volume control can duck cleanly.
 * • Respects autoplay policy — AudioContext is resumed only from a user gesture
 *   (the caller must call `engine.resumeContext()` from an interaction handler).
 */

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Clamp x to [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Schedule a linear ramp on an AudioParam (safe: no-op before context is ready). */
function rampTo(
  param: AudioParam,
  target: number,
  durationSec: number,
  ctx: AudioContext,
): void {
  param.cancelScheduledValues(ctx.currentTime);
  param.setValueAtTime(param.value, ctx.currentTime);
  param.linearRampToValueAtTime(target, ctx.currentTime + durationSec);
}

// ──────────────────────────────────────────────────────────────────────────────
// Noise source (white → band-pass filtered → "road hum")
// ──────────────────────────────────────────────────────────────────────────────

function createNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
  // 2-second stereo noise buffer, looped.
  const bufLen = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

// ──────────────────────────────────────────────────────────────────────────────
// Chime synthesiser
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Play a short, pleasant chime. Uses two sine oscillators a perfect 5th apart,
 * each with a fast attack and slow exponential decay.
 *
 * @param ctx      AudioContext
 * @param dest     Destination node (master gain)
 * @param rootHz   Root frequency (default 880 for segment, 1046 for finish)
 * @param volume   Linear amplitude 0–1
 */
function playChime(
  ctx: AudioContext,
  dest: AudioNode,
  rootHz: number,
  volume: number,
): void {
  const now = ctx.currentTime;
  const peaks = [rootHz, rootHz * 1.5]; // root + perfect fifth

  for (const freq of peaks) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(volume * 0.22, now + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    osc.connect(env);
    env.connect(dest);
    osc.start(now);
    osc.stop(now + 1.5);
    // GC: nodes are automatically garbage collected after stop()
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public engine interface
// ──────────────────────────────────────────────────────────────────────────────

export interface RideAudioParams {
  /** Current speed, m/s. */
  speedMs: number;
  /** Current grade, %. */
  gradePct: number;
  /** Current power output, W. */
  powerW: number;
  /** Master volume 0–1. */
  volume: number;
}

export class RideAudioEngine {
  private ctx: AudioContext | null = null;

  // Master output
  private masterGain: GainNode | null = null;

  // ── Ambient wind/road layer ──
  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;

  // ── Effort drone layer ──
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;

  // ── Wind whistle layer ──
  private whistleOsc: OscillatorNode | null = null;
  private whistleGain: GainNode | null = null;

  /** True after start() has been called. */
  private running = false;

  // ────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────

  /**
   * Must be called from a user-gesture handler (click, keypress, etc.) to
   * satisfy the browser's autoplay policy before audio can be heard.
   */
  async resumeContext(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Start all continuous layers. Call once when the ride begins (or when the
   * user enables audio mid-ride). Safe to call multiple times — idempotent.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.ctx = new AudioContext();

    // Master gain — volume control lives here.
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // ── Road noise ──────────────────────────────────────────────────────────
    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
    this.noiseFilter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.noiseSrc = createNoiseSource(this.ctx);
    this.noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.masterGain);
    this.noiseSrc.start();

    // ── Effort drone ────────────────────────────────────────────────────────
    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = 'sine';
    this.droneOsc.frequency.setValueAtTime(60, this.ctx.currentTime);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.droneOsc.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);
    this.droneOsc.start();

    // ── Wind whistle (high-freq air) ────────────────────────────────────────
    this.whistleOsc = this.ctx.createOscillator();
    this.whistleOsc.type = 'sine';
    this.whistleOsc.frequency.setValueAtTime(1800, this.ctx.currentTime);

    this.whistleGain = this.ctx.createGain();
    this.whistleGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.whistleOsc.connect(this.whistleGain);
    this.whistleGain.connect(this.masterGain);
    this.whistleOsc.start();
  }

  /**
   * Update the continuous layers every animation frame. Very cheap — just
   * schedules AudioParam ramps; no allocation.
   */
  update(params: RideAudioParams): void {
    if (!this.running || !this.ctx) return;

    const { speedMs, gradePct, powerW, volume } = params;
    const ctx = this.ctx;

    // ── Master gain ──────────────────────────────────────────────────────────
    // Target: full volume when sound is on, 0 when stopped.
    const targetMaster = volume;
    rampTo(this.masterGain!.gain, targetMaster, 0.4, ctx);

    // Speed in km/h for perceptual scaling.
    const speedKmh = speedMs * 3.6;

    // ── Road noise ───────────────────────────────────────────────────────────
    // Noise amplitude: 0 at rest → 0.45 at 40 km/h, gentle ceiling.
    const noiseAmp = clamp(speedKmh / 40, 0, 1) * 0.45;
    rampTo(this.noiseGain!.gain, noiseAmp, 0.8, ctx);

    // Filter centre frequency shifts up with speed (higher pitch = faster).
    const filterHz = lerp(180, 480, clamp(speedKmh / 50, 0, 1));
    rampTo(this.noiseFilter!.frequency, filterHz, 0.8, ctx);

    // ── Effort drone ─────────────────────────────────────────────────────────
    // Grade contribution: steep climb bumps drone pitch.
    const gradeNorm = clamp(gradePct / 15, 0, 1); // 0 % → 15 % maps 0→1
    // Power contribution (cap at 400 W for normalisation).
    const powerNorm = clamp(powerW / 400, 0, 1);
    // Blend: grade 60 %, power 40 %.
    const effortNorm = gradeNorm * 0.6 + powerNorm * 0.4;

    const droneFreq = lerp(55, 95, effortNorm);
    rampTo(this.droneOsc!.frequency, droneFreq, 1.2, ctx);

    // Drone volume: only audible when actually pedalling with some effort.
    const droneAmp = speedKmh > 3 ? effortNorm * 0.07 : 0;
    rampTo(this.droneGain!.gain, droneAmp, 1.5, ctx);

    // ── Wind whistle ─────────────────────────────────────────────────────────
    // Kicks in above ~25 km/h, peaks around 55 km/h.
    const whistleAmp = clamp((speedKmh - 25) / 30, 0, 1) * 0.035;
    const whistleFreq = lerp(1600, 2400, clamp(speedKmh / 60, 0, 1));
    rampTo(this.whistleGain!.gain, whistleAmp, 1.0, ctx);
    rampTo(this.whistleOsc!.frequency, whistleFreq, 1.0, ctx);
  }

  /**
   * Pause all audio without destroying the context (e.g. ride paused).
   * Fade to silence over `fadeMs` milliseconds.
   */
  pause(fadeMs = 600): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const g = this.masterGain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + fadeMs / 1000);
  }

  /**
   * Resume from pause — the update() loop will ramp back up naturally.
   */
  unpause(): void {
    // update() will re-ramp master gain back to the user's volume setting.
    // No explicit action needed.
  }

  /**
   * Play the workout-segment-change chime (soft, mid-register).
   */
  playSegmentChime(): void {
    if (!this.ctx || !this.masterGain || !this.running) return;
    playChime(this.ctx, this.masterGain, 880, 0.6);
  }

  /**
   * Play the ride-finish chime (brighter, celebratory).
   */
  playFinishChime(): void {
    if (!this.ctx || !this.masterGain || !this.running) return;
    // Three ascending notes, staggered 180 ms apart.
    const ctx = this.ctx;
    const dest = this.masterGain;
    const freqs = [523.25, 659.25, 783.99]; // C5 E5 G5 — major triad
    freqs.forEach((freq, i) => {
      const delay = i * 0.18;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.2, now + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      osc.connect(env);
      env.connect(dest);
      osc.start(now);
      osc.stop(now + 1.8);
    });
  }

  /**
   * Gracefully stop and tear down all nodes. Call when the ride screen unmounts
   * or the user navigates away.
   */
  stop(): void {
    if (!this.ctx) return;
    // Fade out over 400 ms then close.
    const ctx = this.ctx;
    const g = this.masterGain?.gain;
    if (g) {
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    }
    setTimeout(() => {
      try {
        this.noiseSrc?.stop();
        this.droneOsc?.stop();
        this.whistleOsc?.stop();
      } catch {
        // Nodes may already be stopped — ignore.
      }
      ctx.close().catch(() => undefined);
      this.ctx = null;
      this.masterGain = null;
      this.noiseSrc = null;
      this.noiseFilter = null;
      this.noiseGain = null;
      this.droneOsc = null;
      this.droneGain = null;
      this.whistleOsc = null;
      this.whistleGain = null;
      this.running = false;
    }, 420);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Standalone one-shot helpers
// (Use these from components that don't own a RideAudioEngine instance.)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lazily created shared AudioContext for standalone helpers.
 * Avoids the autoplay restriction — created on first call after a user gesture.
 */
let _sharedCtx: AudioContext | null = null;

function getSharedCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_sharedCtx) {
    try {
      _sharedCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (_sharedCtx.state === 'suspended') {
    _sharedCtx.resume().catch(() => {/* ignore */});
  }
  return _sharedCtx;
}

/**
 * Gentle ascending chime — played when an achievement unlocks.
 * Three short sine tones: C5 → E5 → G5 (major triad arpeggio).
 */
export function playAchievementSound(): void {
  const ctx = getSharedCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  const noteDuration = 0.12;
  const noteGap      = 0.09;

  notes.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = freq;

    const start = now + i * (noteDuration + noteGap);
    const end   = start + noteDuration;

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, end);

    osc.start(start);
    osc.stop(end + 0.05);
  });
}

/**
 * Subtle bass pulse — played when the rider enters a named climb.
 * Deep bass hit + subtle bell accent to signal the start of a challenge.
 */
export function playClimbEntrySound(): void {
  const ctx = getSharedCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  const notes = [
    { freq: 110, start: 0,    dur: 0.18, vol: 0.22 },  // deep bass hit
    { freq: 440, start: 0.12, dur: 0.22, vol: 0.10 },  // subtle bell accent
  ];

  notes.forEach(({ freq, start, dur, vol }) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = freq;

    const t0 = now + start;
    const t1 = t0 + dur;

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t1);

    osc.start(t0);
    osc.stop(t1 + 0.05);
  });
}
