/**
 * speechSynthesis.test.ts -- Unit tests for the Web Speech API wrapper.
 *
 * Runs in vitest node environment. The speechSynthesis module reads globals
 * at call-time (not import-time), so we can set globalThis.window and
 * globalThis.speechSynthesis in beforeEach/afterEach without module reloads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { speakLine, cancelSpeech, pickPreferredVoice } from './speechSynthesis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockSynth = {
  cancel: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
};

function makeMockSynth(voices: Partial<SpeechSynthesisVoice>[] = []): MockSynth {
  return {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn(() => voices as SpeechSynthesisVoice[]),
  };
}

const G = globalThis as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Test: silent degrade when speechSynthesis is undefined
// Simulate a no-browser environment (window undefined).
// ---------------------------------------------------------------------------

describe('speakLine -- degrade when speechSynthesis unavailable', () => {
  beforeEach(() => {
    delete G.window;
    delete G.speechSynthesis;
  });

  afterEach(() => {
    delete G.window;
    delete G.speechSynthesis;
  });

  it('does not throw when speechSynthesis is undefined', () => {
    expect(() => speakLine('test', { volume: 70, rate: 100 })).not.toThrow();
  });

  it('does not throw cancelSpeech when speechSynthesis is undefined', () => {
    expect(() => cancelSpeech()).not.toThrow();
  });

  it('returns undefined from pickPreferredVoice when window is undefined', () => {
    const result = pickPreferredVoice();
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test: speakLine with mocked speechSynthesis
// Set globalThis.window = globalThis so isSpeechAvailable() returns true.
// ---------------------------------------------------------------------------

describe('speakLine -- with mock speechSynthesis', () => {
  let mockSynth: MockSynth;

  beforeEach(() => {
    mockSynth = makeMockSynth();
    G.window = G;
    G.speechSynthesis = mockSynth;
    // Provide a minimal SpeechSynthesisUtterance constructor
    G.SpeechSynthesisUtterance = vi.fn(function (this: Record<string, unknown>) {
      this.volume = 1;
      this.rate = 1;
      this.voice = null;
    }) as unknown as typeof SpeechSynthesisUtterance;
  });

  afterEach(() => {
    delete G.window;
    delete G.speechSynthesis;
    delete G.SpeechSynthesisUtterance;
    vi.restoreAllMocks();
  });

  it('calls synth.cancel() before speak to clear any queued speech', () => {
    speakLine('Hello GlobeRide', { volume: 70, rate: 100 });
    expect(mockSynth.cancel).toHaveBeenCalledOnce();
  });

  it('calls synth.speak() once', () => {
    speakLine('Hello GlobeRide', { volume: 70, rate: 100 });
    expect(mockSynth.speak).toHaveBeenCalledOnce();
  });

  it('does NOT call speak for empty string', () => {
    speakLine('', { volume: 70, rate: 100 });
    expect(mockSynth.speak).not.toHaveBeenCalled();
  });

  it('does NOT call speak for whitespace-only text', () => {
    speakLine('   ', { volume: 70, rate: 100 });
    expect(mockSynth.speak).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test: cancelSpeech
// ---------------------------------------------------------------------------

describe('cancelSpeech -- with mock speechSynthesis', () => {
  let mockSynth: MockSynth;

  beforeEach(() => {
    mockSynth = makeMockSynth();
    G.window = G;
    G.speechSynthesis = mockSynth;
  });

  afterEach(() => {
    delete G.window;
    delete G.speechSynthesis;
  });

  it('calls synth.cancel()', () => {
    cancelSpeech();
    expect(mockSynth.cancel).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Test: pickPreferredVoice -- voice selection priority
// ---------------------------------------------------------------------------

describe('pickPreferredVoice -- voice selection', () => {
  afterEach(() => {
    delete G.window;
    delete G.speechSynthesis;
  });

  it('returns undefined when no voices are available', () => {
    G.window = G;
    G.speechSynthesis = makeMockSynth([]);
    expect(pickPreferredVoice()).toBeUndefined();
  });

  it('prefers en-GB male voice above all others', () => {
    G.window = G;
    G.speechSynthesis = makeMockSynth([
      { lang: 'de-DE', name: 'German Voice' },
      { lang: 'en-US', name: 'US Voice' },
      { lang: 'en-GB', name: 'Male British Voice' },
    ]);
    const voice = pickPreferredVoice();
    expect(voice?.lang).toBe('en-GB');
    expect(voice?.name).toContain('Male');
  });

  it('falls back to any en-GB voice when no male tag present', () => {
    G.window = G;
    G.speechSynthesis = makeMockSynth([
      { lang: 'de-DE', name: 'German Voice' },
      { lang: 'en-GB', name: 'Serena' },
    ]);
    const voice = pickPreferredVoice();
    expect(voice?.lang).toBe('en-GB');
  });

  it('falls back to any en-* voice when no en-GB', () => {
    G.window = G;
    G.speechSynthesis = makeMockSynth([
      { lang: 'fr-FR', name: 'French Voice' },
      { lang: 'en-US', name: 'US Voice' },
    ]);
    const voice = pickPreferredVoice();
    expect(voice?.lang).toBe('en-US');
  });

  it('falls back to first available voice when no English voices exist', () => {
    G.window = G;
    G.speechSynthesis = makeMockSynth([
      { lang: 'fr-FR', name: 'French Voice' },
      { lang: 'de-DE', name: 'German Voice' },
    ]);
    const voice = pickPreferredVoice();
    expect(voice?.lang).toBe('fr-FR');
  });
});
