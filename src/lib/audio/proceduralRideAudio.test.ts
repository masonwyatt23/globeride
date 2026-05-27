/**
 * Tests for proceduralRideAudio.
 *
 * The test environment is Node (no browser AudioContext). We install a minimal
 * mock on globalThis before importing the module under test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mock AudioContext ────────────────────────────────────────────────────────

type AudioParamValue = number;

function makeAudioParam(initial: number): {
  value: AudioParamValue;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
} {
  return {
    value: initial,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

function makeGainNode() {
  return { gain: makeAudioParam(0), connect: vi.fn() };
}

function makeBiquadFilter() {
  return {
    type: 'bandpass' as BiquadFilterType,
    frequency: makeAudioParam(440),
    Q: makeAudioParam(1),
    connect: vi.fn(),
  };
}

function makeOscillator() {
  return {
    type: 'sine' as OscillatorType,
    frequency: makeAudioParam(440),
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeBufferSource() {
  return {
    buffer: null as AudioBuffer | null,
    loop: false,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeAudioBuffer(sampleRate = 44100, duration = 2): AudioBuffer {
  const len = Math.floor(sampleRate * duration);
  // Minimal stub — only getChannelData is needed by the noise generators.
  const data = new Float32Array(len);
  return {
    sampleRate,
    length: len,
    duration,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

let mockGainNodes: ReturnType<typeof makeGainNode>[];
let mockFilters: ReturnType<typeof makeBiquadFilter>[];
let mockOscillators: ReturnType<typeof makeOscillator>[];
let mockBufferSources: ReturnType<typeof makeBufferSource>[];

function installAudioContextMock() {
  mockGainNodes = [];
  mockFilters = [];
  mockOscillators = [];
  mockBufferSources = [];

  const MockAudioContext = vi.fn().mockImplementation(() => ({
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain() {
      const node = makeGainNode();
      mockGainNodes.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = makeBiquadFilter();
      mockFilters.push(node);
      return node;
    },
    createOscillator() {
      const node = makeOscillator();
      mockOscillators.push(node);
      return node;
    },
    createBufferSource() {
      const node = makeBufferSource();
      mockBufferSources.push(node);
      return node;
    },
    createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
      return makeAudioBuffer(sampleRate, length / sampleRate);
    },
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  (globalThis as unknown as Record<string, unknown>).AudioContext = MockAudioContext;
}

function uninstallAudioContextMock() {
  delete (globalThis as unknown as Record<string, unknown>).AudioContext;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createRideAudioEngine', () => {
  beforeEach(() => {
    installAudioContextMock();
  });

  afterEach(() => {
    uninstallAudioContextMock();
    vi.restoreAllMocks();
  });

  it('returns a non-null engine when AudioContext is available', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    expect(engine).not.toBeNull();
  });

  it('exposes the required gain nodes on the engine', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    expect(engine).toBeDefined();
    if (!engine) throw new Error('engine is null');
    expect(engine.chainGain).toBeDefined();
    expect(engine.roadGain).toBeDefined();
    expect(engine.brakeGain).toBeDefined();
    expect(engine.gearShiftGain).toBeDefined();
    expect(engine.masterGain).toBeDefined();
  });

  it('starts noise sources looping on construction', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    createRideAudioEngine();
    const started = mockBufferSources.filter((s) => s.start.mock.calls.length > 0);
    expect(started.length).toBeGreaterThanOrEqual(2); // chain + road noise
  });

  it('starts oscillators on construction', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    createRideAudioEngine();
    const started = mockOscillators.filter((o) => o.start.mock.calls.length > 0);
    expect(started.length).toBeGreaterThanOrEqual(1); // at least brake osc
  });
});

describe('engine.start()', () => {
  beforeEach(() => {
    installAudioContextMock();
  });
  afterEach(() => {
    uninstallAudioContextMock();
    vi.restoreAllMocks();
  });

  it('calls ctx.resume() when context is suspended', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    // Force suspended state on the underlying context mock
    (engine.context as unknown as { state: string }).state = 'suspended';
    engine.start();
    expect(engine.context.resume).toHaveBeenCalled();
  });
});

describe('engine.stop()', () => {
  beforeEach(() => {
    installAudioContextMock();
    vi.useFakeTimers();
  });
  afterEach(() => {
    uninstallAudioContextMock();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('schedules a master gain ramp to 0', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    engine.stop();
    const master = engine.masterGain;
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
  });

  it('calls ctx.suspend() after the fade delay', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    engine.stop();
    vi.advanceTimersByTime(500);
    expect(engine.context.suspend).toHaveBeenCalled();
  });
});

describe('engine.updateFromRideState()', () => {
  beforeEach(() => {
    installAudioContextMock();
  });
  afterEach(() => {
    uninstallAudioContextMock();
    vi.restoreAllMocks();
  });

  it('sets chain gain to 0 when cadence is 0', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    engine.updateFromRideState({ speedMs: 5, cadenceRpm: 0, powerW: 0 });
    // chainGain.gain.linearRampToValueAtTime should be called with 0
    const calls = (engine.chainGain.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls as [number, number][];
    const targetValues = calls.map(([target]) => target);
    expect(targetValues).toContain(0);
  });

  it('increases chain gain above 0 when cadence is 90 RPM', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    engine.updateFromRideState({ speedMs: 8, cadenceRpm: 90, powerW: 200 });
    const calls = (engine.chainGain.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls as [number, number][];
    const maxTarget = Math.max(...calls.map(([v]) => v));
    expect(maxTarget).toBeGreaterThan(0);
    expect(maxTarget).toBeLessThanOrEqual(0.30); // gain cap
  });

  it('sets road gain to 0 when speed is 0', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    engine.updateFromRideState({ speedMs: 0, cadenceRpm: 0, powerW: 0 });
    const calls = (engine.roadGain.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls as [number, number][];
    const targetValues = calls.map(([v]) => v);
    expect(targetValues).toContain(0);
  });

  it('does not throw when called with NaN cadence (graceful degradation)', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    expect(() => {
      engine.updateFromRideState({ speedMs: 5, cadenceRpm: NaN, powerW: 0 });
    }).not.toThrow();
  });

  it('does not throw when called with NaN speed', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    expect(() => {
      engine.updateFromRideState({ speedMs: NaN, cadenceRpm: 80, powerW: 200 });
    }).not.toThrow();
  });

  it('does not throw when brakeAmount is undefined', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    expect(() => {
      engine.updateFromRideState({ speedMs: 10, cadenceRpm: 80, powerW: 200 });
    }).not.toThrow();
  });
});

describe('engine.setMasterVolume()', () => {
  beforeEach(() => {
    installAudioContextMock();
  });
  afterEach(() => {
    uninstallAudioContextMock();
    vi.restoreAllMocks();
  });

  it('clamps master volume to 0.70 maximum', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    engine.setMasterVolume(1.0); // attempt to set too loud
    const calls = (engine.masterGain.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls as [number, number][];
    const maxTarget = Math.max(...calls.map(([v]) => v));
    expect(maxTarget).toBeLessThanOrEqual(0.70);
  });

  it('accepts zero volume', async () => {
    const { createRideAudioEngine } = await import('./proceduralRideAudio');
    const engine = createRideAudioEngine();
    if (!engine) throw new Error('engine is null');

    expect(() => engine.setMasterVolume(0)).not.toThrow();
  });
});
