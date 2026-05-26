/**
 * speechSynthesis.ts — Web Speech API wrapper for GlobeRide live commentary.
 *
 * Design principles:
 *   - Silent degrade: when speechSynthesis is undefined (Safari/iOS, SSR,
 *     test environments), all exports are safe no-ops.
 *   - No throws: every function is guarded. The ride loop calls these
 *     without try/catch.
 *   - One utterance at a time: speakLine() cancels any in-progress speech
 *     before queuing the new line so the commentator never piles up.
 */

// ---------------------------------------------------------------------------
// Availability guard
// ---------------------------------------------------------------------------

function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// ---------------------------------------------------------------------------
// Voice selection
// ---------------------------------------------------------------------------

/**
 * Pick the preferred commentary voice.
 *
 * Priority:
 *   1. Male British English (en-GB) — closest to a cycling broadcast voice
 *   2. First en-* voice (any English locale)
 *   3. First available voice (any language)
 *   4. undefined → browser default
 */
export function pickPreferredVoice(): SpeechSynthesisVoice | undefined {
  if (!isSpeechAvailable()) return undefined;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;

  // 1. Male British English
  const enGB = voices.find(
    (v) => v.lang === 'en-GB' && /male/i.test(v.name),
  );
  if (enGB) return enGB;

  // 2. Any British English
  const anyGB = voices.find((v) => v.lang === 'en-GB');
  if (anyGB) return anyGB;

  // 3. Any English
  const anyEn = voices.find((v) => v.lang.startsWith('en'));
  if (anyEn) return anyEn;

  // 4. First available
  return voices[0];
}

// ---------------------------------------------------------------------------
// speak / cancel
// ---------------------------------------------------------------------------

export interface SpeakOptions {
  /** 0–100 (maps to SpeechSynthesisUtterance.volume 0–1). */
  volume: number;
  /** 80–120 (maps to rate: 0.8–1.2). */
  rate: number;
  voice?: SpeechSynthesisVoice;
}

/**
 * Speak `text` aloud using the browser's built-in TTS engine.
 * Cancels any currently-playing utterance first.
 *
 * Safe to call in a rAF loop — the synth queue caps at 1 item.
 */
export function speakLine(text: string, opts: SpeakOptions): void {
  if (!isSpeechAvailable()) return;
  if (!text.trim()) return;

  const synth = window.speechSynthesis;

  // Cancel whatever is playing / queued.
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.volume = Math.max(0, Math.min(1, opts.volume / 100));
  utterance.rate = Math.max(0.5, Math.min(2, opts.rate / 100));

  if (opts.voice) {
    utterance.voice = opts.voice;
  }

  // Chrome bug: voices list is sometimes empty immediately after page load.
  // If no voice is set and the list is non-empty, pick one now.
  if (!utterance.voice) {
    const preferred = pickPreferredVoice();
    if (preferred) utterance.voice = preferred;
  }

  try {
    synth.speak(utterance);
  } catch {
    // speechSynthesis.speak can throw on some browsers in restrictive
    // contexts (e.g., before first user interaction on mobile).
    // Silently ignore — the commentary is best-effort.
  }
}

/**
 * Cancel any currently-playing or queued speech immediately.
 * Safe to call at any time (pause, finish, user tap).
 */
export function cancelSpeech(): void {
  if (!isSpeechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // No-op on failure.
  }
}
