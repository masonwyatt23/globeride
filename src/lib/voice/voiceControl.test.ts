/**
 * voiceControl.test.ts — unit tests for parseVoiceCommand,
 * isVoiceRecognitionSupported, and createVoiceRecognizer.
 *
 * No DOM required: SpeechRecognition is stubbed via vi.stubGlobal.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseVoiceCommand,
  isVoiceRecognitionSupported,
  createVoiceRecognizer,
} from './voiceControl';

// ---------------------------------------------------------------------------
// parseVoiceCommand
// ---------------------------------------------------------------------------

describe('parseVoiceCommand', () => {
  // ---- pause ----
  it('returns pause for "pause"', () => {
    expect(parseVoiceCommand('pause')).toEqual({ intent: 'pause' });
  });

  it('returns pause for "pause the ride"', () => {
    expect(parseVoiceCommand('pause the ride')).toEqual({ intent: 'pause' });
  });

  it('returns pause for "stop riding"', () => {
    expect(parseVoiceCommand('stop riding')).toEqual({ intent: 'pause' });
  });

  // ---- resume ----
  it('returns resume for "resume"', () => {
    expect(parseVoiceCommand('resume')).toEqual({ intent: 'resume' });
  });

  it('returns resume for "resume the ride"', () => {
    expect(parseVoiceCommand('resume the ride')).toEqual({ intent: 'resume' });
  });

  it('returns resume for "go"', () => {
    expect(parseVoiceCommand('go')).toEqual({ intent: 'resume' });
  });

  it('returns resume for "unpause"', () => {
    expect(parseVoiceCommand('unpause')).toEqual({ intent: 'resume' });
  });

  // ---- lap ----
  it('returns lap for "lap"', () => {
    expect(parseVoiceCommand('lap')).toEqual({ intent: 'lap' });
  });

  it('returns lap for "mark a lap"', () => {
    expect(parseVoiceCommand('mark a lap')).toEqual({ intent: 'lap' });
  });

  it('returns lap for "lap mark"', () => {
    expect(parseVoiceCommand('lap mark')).toEqual({ intent: 'lap' });
  });

  // ---- switch camera (generic cycle) ----
  it('returns switchCamera for "switch camera"', () => {
    expect(parseVoiceCommand('switch camera')).toEqual({ intent: 'switchCamera' });
  });

  it('returns switchCamera for "switch the camera"', () => {
    expect(parseVoiceCommand('switch the camera')).toEqual({ intent: 'switchCamera' });
  });

  it('returns switchCamera for "next camera"', () => {
    expect(parseVoiceCommand('next camera')).toEqual({ intent: 'switchCamera' });
  });

  it('returns switchCamera for "change camera"', () => {
    expect(parseVoiceCommand('change camera')).toEqual({ intent: 'switchCamera' });
  });

  // ---- setCamera: firstPerson ----
  it('returns setCamera firstPerson for "first person"', () => {
    expect(parseVoiceCommand('first person')).toEqual({ intent: 'setCamera', param: 'firstPerson' });
  });

  it('returns setCamera firstPerson for "go to first person"', () => {
    expect(parseVoiceCommand('go to first person')).toEqual({ intent: 'setCamera', param: 'firstPerson' });
  });

  it('returns setCamera firstPerson for "first-person view"', () => {
    expect(parseVoiceCommand('first-person view')).toEqual({ intent: 'setCamera', param: 'firstPerson' });
  });

  // ---- setCamera: overhead ----
  it('returns setCamera overhead for "overhead"', () => {
    expect(parseVoiceCommand('overhead')).toEqual({ intent: 'setCamera', param: 'overhead' });
  });

  it('returns setCamera overhead for "top down"', () => {
    expect(parseVoiceCommand('top down')).toEqual({ intent: 'setCamera', param: 'overhead' });
  });

  // ---- setCamera: chase ----
  it('returns setCamera chase for "chase"', () => {
    expect(parseVoiceCommand('chase')).toEqual({ intent: 'setCamera', param: 'chase' });
  });

  it('returns setCamera chase for "chase cam"', () => {
    expect(parseVoiceCommand('chase cam')).toEqual({ intent: 'setCamera', param: 'chase' });
  });

  // ---- setCamera: sideTracking ----
  it('returns setCamera sideTracking for "side view"', () => {
    expect(parseVoiceCommand('side view')).toEqual({ intent: 'setCamera', param: 'sideTracking' });
  });

  it('returns setCamera sideTracking for "side camera"', () => {
    expect(parseVoiceCommand('side camera')).toEqual({ intent: 'setCamera', param: 'sideTracking' });
  });

  // ---- setCamera: cinematic ----
  it('returns setCamera cinematic for "cinematic"', () => {
    expect(parseVoiceCommand('cinematic')).toEqual({ intent: 'setCamera', param: 'cinematic' });
  });

  it('returns setCamera cinematic for "cinema mode"', () => {
    expect(parseVoiceCommand('cinema mode')).toEqual({ intent: 'setCamera', param: 'cinematic' });
  });

  // ---- showStats ----
  it('returns showStats for "show stats"', () => {
    expect(parseVoiceCommand('show stats')).toEqual({ intent: 'showStats' });
  });

  it('returns showStats for "show hud"', () => {
    expect(parseVoiceCommand('show hud')).toEqual({ intent: 'showStats' });
  });

  // ---- hideStats ----
  it('returns hideStats for "hide stats"', () => {
    expect(parseVoiceCommand('hide stats')).toEqual({ intent: 'hideStats' });
  });

  it('returns hideStats for "hide hud"', () => {
    expect(parseVoiceCommand('hide hud')).toEqual({ intent: 'hideStats' });
  });

  // ---- endRide ----
  it('returns endRide for "end ride"', () => {
    expect(parseVoiceCommand('end ride')).toEqual({ intent: 'endRide' });
  });

  it('returns endRide for "end the ride"', () => {
    expect(parseVoiceCommand('end the ride')).toEqual({ intent: 'endRide' });
  });

  it('returns endRide for "stop the ride"', () => {
    expect(parseVoiceCommand('stop the ride')).toEqual({ intent: 'endRide' });
  });

  // ---- endRideConfirmed ----
  it('returns endRideConfirmed for "end ride confirmed"', () => {
    expect(parseVoiceCommand('end ride confirmed')).toEqual({ intent: 'endRideConfirmed' });
  });

  it('returns endRideConfirmed for "confirm end"', () => {
    expect(parseVoiceCommand('confirm end')).toEqual({ intent: 'endRideConfirmed' });
  });

  // ---- volume ----
  it('returns volumeUp for "volume up"', () => {
    expect(parseVoiceCommand('volume up')).toEqual({ intent: 'volumeUp' });
  });

  it('returns volumeUp for "louder"', () => {
    expect(parseVoiceCommand('louder')).toEqual({ intent: 'volumeUp' });
  });

  it('returns volumeDown for "volume down"', () => {
    expect(parseVoiceCommand('volume down')).toEqual({ intent: 'volumeDown' });
  });

  it('returns volumeDown for "quieter"', () => {
    expect(parseVoiceCommand('quieter')).toEqual({ intent: 'volumeDown' });
  });

  // ---- no match ----
  it('returns null for unrecognized input', () => {
    expect(parseVoiceCommand('hello world')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseVoiceCommand('')).toBeNull();
  });

  // ---- case insensitivity ----
  it('is case-insensitive for "PAUSE"', () => {
    expect(parseVoiceCommand('PAUSE')).toEqual({ intent: 'pause' });
  });

  it('is case-insensitive for "End Ride Confirmed"', () => {
    expect(parseVoiceCommand('End Ride Confirmed')).toEqual({ intent: 'endRideConfirmed' });
  });
});

// ---------------------------------------------------------------------------
// isVoiceRecognitionSupported
// ---------------------------------------------------------------------------

describe('isVoiceRecognitionSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when window.SpeechRecognition exists', () => {
    vi.stubGlobal('window', {
      ...globalThis.window,
      SpeechRecognition: class {},
    });
    expect(isVoiceRecognitionSupported()).toBe(true);
  });

  it('returns true when window.webkitSpeechRecognition exists', () => {
    vi.stubGlobal('window', {
      ...globalThis.window,
      webkitSpeechRecognition: class {},
    });
    expect(isVoiceRecognitionSupported()).toBe(true);
  });

  it('returns false when neither SpeechRecognition variant exists', () => {
    // Create a window-like object without either key.
    const narrowWindow: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(globalThis.window ?? {})) {
      if (key !== 'SpeechRecognition' && key !== 'webkitSpeechRecognition') {
        try {
          narrowWindow[key] = (globalThis.window as unknown as Record<string, unknown>)[key];
        } catch {
          // some window props are not enumerable/configurable — skip
        }
      }
    }
    vi.stubGlobal('window', narrowWindow);
    expect(isVoiceRecognitionSupported()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createVoiceRecognizer
// ---------------------------------------------------------------------------

describe('createVoiceRecognizer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when SpeechRecognition is not supported', () => {
    // Remove both SpeechRecognition keys from window.
    vi.stubGlobal('window', {});
    const handle = createVoiceRecognizer(vi.fn(), vi.fn());
    expect(handle).toBeNull();
  });

  it('returns a handle with start/stop/isListening when SpeechRecognition is supported', () => {
    // Stub a minimal SpeechRecognition class.
    const mockStart = vi.fn();
    const mockStop = vi.fn();

    class MockSR {
      continuous = false;
      interimResults = false;
      lang = '';
      maxAlternatives = 1;
      onresult: null | ((e: unknown) => void) = null;
      onerror: null | ((e: unknown) => void) = null;
      onend: null | (() => void) = null;
      start = mockStart;
      stop = mockStop;
    }

    vi.stubGlobal('window', {
      SpeechRecognition: MockSR,
    });

    const onCommand = vi.fn();
    const onError = vi.fn();
    const handle = createVoiceRecognizer(onCommand, onError);

    expect(handle).not.toBeNull();
    expect(typeof handle!.start).toBe('function');
    expect(typeof handle!.stop).toBe('function');
    expect(typeof handle!.isListening).toBe('function');
    expect(handle!.isListening()).toBe(false);

    handle!.start();
    expect(handle!.isListening()).toBe(true);
    expect(mockStart).toHaveBeenCalledOnce();

    handle!.stop();
    expect(handle!.isListening()).toBe(false);
    expect(mockStop).toHaveBeenCalledOnce();
  });

  it('calls onCommand with parsed intent when a final result arrives', () => {
    let capturedOnResult: ((e: SpeechRecognitionEvent) => void) | null = null;

    class MockSR {
      continuous = false;
      interimResults = false;
      lang = '';
      maxAlternatives = 1;
      set onresult(fn: (e: SpeechRecognitionEvent) => void) { capturedOnResult = fn; }
      onerror = null;
      onend = null;
      start = vi.fn();
      stop = vi.fn();
    }

    vi.stubGlobal('window', {
      SpeechRecognition: MockSR,
      speechSynthesis: { speaking: false },
    });

    const onCommand = vi.fn();
    const handle = createVoiceRecognizer(onCommand, vi.fn());
    handle!.start();

    // Simulate a final recognition result for "pause".
    const fakeEvent = {
      results: [
        Object.assign([{ transcript: 'pause', confidence: 0.99 }], { isFinal: true, length: 1 }),
      ],
    } as unknown as SpeechRecognitionEvent;

    capturedOnResult!(fakeEvent);

    expect(onCommand).toHaveBeenCalledWith({ intent: 'pause' });
  });
});
