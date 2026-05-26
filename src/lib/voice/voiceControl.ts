/**
 * voiceControl.ts — Web Speech API voice command recognizer + intent parser.
 *
 * Design principles:
 *   - Graceful degrade: when SpeechRecognition is unsupported (Firefox, SSR),
 *     createVoiceRecognizer() returns null and isVoiceRecognitionSupported()
 *     returns false. No errors, no console spam.
 *   - Pure parser: parseVoiceCommand() is a plain function — no side effects,
 *     fully testable without a DOM.
 *   - Continuous mode: the recognizer runs continuously, re-starting on `end`
 *     unless explicitly stopped, so the user doesn't need to tap between
 *     commands.
 *   - Crosstalk guard: callers should pause the recognizer while
 *     window.speechSynthesis.speaking is true to prevent the TTS voice from
 *     triggering its own commands.
 */

// ---------------------------------------------------------------------------
// Intent types
// ---------------------------------------------------------------------------

export type VoiceIntent =
  | 'pause'
  | 'resume'
  | 'lap'
  | 'switchCamera'
  | 'setCamera'
  | 'showStats'
  | 'hideStats'
  | 'endRide'
  | 'endRideConfirmed'
  | 'volumeUp'
  | 'volumeDown';

export interface VoiceCommand {
  intent: VoiceIntent;
  /** Only present for 'setCamera' — the target CameraMode string. */
  param?: string;
}

// ---------------------------------------------------------------------------
// parseVoiceCommand — pure, side-effect-free
// ---------------------------------------------------------------------------

/**
 * Parse a raw speech transcript into a VoiceCommand.
 *
 * Matching is case-insensitive and tolerant of filler words ("the", "my",
 * "please", "now", "a", "to", "go", "switch", "jump", "enter").
 * Returns null if no intent matches.
 *
 * Priority order (first match wins):
 *   endRideConfirmed > endRide > pause > resume > lap >
 *   setCamera > switchCamera > showStats > hideStats > volumeUp > volumeDown
 */
export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  const t = transcript.toLowerCase().trim();

  // ---- End ride confirmed (must be before endRide to avoid early match) ----
  if (/end\s+ride\s+confirm/i.test(t) || /confirm\s+end/i.test(t)) {
    return { intent: 'endRideConfirmed' };
  }

  // ---- End ride ----
  if (/end\s+(the\s+)?ride/i.test(t) || /stop\s+(the\s+)?ride/i.test(t) || /finish\s+(the\s+)?ride/i.test(t)) {
    return { intent: 'endRide' };
  }

  // ---- Pause ----
  if (
    /^pause(\s+(the\s+)?ride)?$/i.test(t) ||
    /^pause\s+(riding|now|please)$/i.test(t) ||
    /^stop\s+riding$/i.test(t)
  ) {
    return { intent: 'pause' };
  }

  // ---- Resume ----
  if (
    /^resume(\s+(the\s+)?ride)?$/i.test(t) ||
    /^resume\s+(riding|now|please)$/i.test(t) ||
    /^(go|start|continue)(\s+(riding|again|now))?$/i.test(t) ||
    /^unpause$/i.test(t)
  ) {
    return { intent: 'resume' };
  }

  // ---- Lap ----
  if (/^(mark\s+)?(a\s+)?lap(\s+(mark|now|please))?$/i.test(t) || /^lap\s+marker$/i.test(t)) {
    return { intent: 'lap' };
  }

  // ---- Set camera to a specific mode (before switchCamera generic check) ----
  // "first person" / "go first person" / "first-person view" / "enter first person"
  if (/first\s*[- ]?person/i.test(t) || /\bfp\s+view\b/i.test(t)) {
    return { intent: 'setCamera', param: 'firstPerson' };
  }
  // "chase" / "chase cam" / "chase camera" / "go to chase"
  if (/\b(go\s+(to\s+)?)?chase(\s+(cam|camera|view|mode))?\b/i.test(t) && !/switch/i.test(t)) {
    return { intent: 'setCamera', param: 'chase' };
  }
  // "overhead" / "top down" / "bird.s eye" / "overhead view"
  if (/\boverhead\b/i.test(t) || /top[\s-]?down/i.test(t) || /bird[''s\s]*eye/i.test(t)) {
    return { intent: 'setCamera', param: 'overhead' };
  }
  // "side" / "side view" / "side tracking" / "side camera"
  if (/\bside(\s+(view|track|camera|cam|mode))?\b/i.test(t) && !/switch/i.test(t)) {
    return { intent: 'setCamera', param: 'sideTracking' };
  }
  // "cinematic" / "cinema" / "cinematic mode" / "cinematic view"
  if (/\bcinema(tic)?(\s+(view|mode|cam|camera))?\b/i.test(t) && !/switch/i.test(t)) {
    return { intent: 'setCamera', param: 'cinematic' };
  }

  // ---- Switch camera (cycle to next mode) ----
  if (
    /switch(\s+(the\s+)?camera)?/i.test(t) ||
    /change(\s+(the\s+)?camera)?/i.test(t) ||
    /next\s+(camera|cam|view)/i.test(t) ||
    /cycle\s+(camera|cam|view)/i.test(t)
  ) {
    return { intent: 'switchCamera' };
  }

  // ---- Show stats / HUD ----
  if (
    /show\s+(stats|hud|data|metrics|info|numbers)/i.test(t) ||
    /display\s+(stats|hud|data)/i.test(t) ||
    /turn\s+on\s+(stats|hud)/i.test(t) ||
    /stats\s+on/i.test(t)
  ) {
    return { intent: 'showStats' };
  }

  // ---- Hide stats / HUD ----
  if (
    /hide\s+(stats|hud|data|metrics|info|numbers)/i.test(t) ||
    /turn\s+off\s+(stats|hud)/i.test(t) ||
    /stats\s+off/i.test(t)
  ) {
    return { intent: 'hideStats' };
  }

  // ---- Volume up ----
  if (
    /volume\s+up/i.test(t) ||
    /louder/i.test(t) ||
    /increase\s+(the\s+)?volume/i.test(t) ||
    /turn\s+(it\s+)?up/i.test(t)
  ) {
    return { intent: 'volumeUp' };
  }

  // ---- Volume down ----
  if (
    /volume\s+down/i.test(t) ||
    /quieter/i.test(t) ||
    /softer/i.test(t) ||
    /decrease\s+(the\s+)?volume/i.test(t) ||
    /turn\s+(it\s+)?down/i.test(t)
  ) {
    return { intent: 'volumeDown' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// isVoiceRecognitionSupported
// ---------------------------------------------------------------------------

/**
 * Returns true if the current browser supports Web Speech API recognition.
 * Chrome/Edge have `window.SpeechRecognition`; older Safari uses the
 * `webkitSpeechRecognition` prefix. Firefox has neither.
 */
export function isVoiceRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'SpeechRecognition' in window ||
    'webkitSpeechRecognition' in window
  );
}

// ---------------------------------------------------------------------------
// VoiceRecognizerHandle
// ---------------------------------------------------------------------------

export interface VoiceRecognizerHandle {
  start(): void;
  stop(): void;
  isListening(): boolean;
}

// ---------------------------------------------------------------------------
// createVoiceRecognizer
// ---------------------------------------------------------------------------

/**
 * Create and configure a SpeechRecognition instance.
 *
 * Returns null when the Web Speech API is unavailable (Firefox, SSR, denied
 * permission). Callers must check for null before using.
 *
 * The recognizer runs in continuous mode with interim results disabled.
 * It automatically restarts on `end` while `listening` is true, so brief
 * network hiccups or browser timeouts don't silently kill it.
 *
 * Crosstalk guard: the recognizer aborts (not stops) when
 * window.speechSynthesis.speaking is true so the TTS voice can't trigger
 * its own commands. The restart-on-end loop will resume it after speech ends.
 */
export function createVoiceRecognizer(
  onCommand: (cmd: VoiceCommand) => void,
  onError: (err: Event) => void,
): VoiceRecognizerHandle | null {
  if (!isVoiceRecognitionSupported()) return null;

  // Resolve the constructor (standard or webkit-prefixed).
  const SR: typeof SpeechRecognition =
    window.SpeechRecognition ?? window.webkitSpeechRecognition!;

  const recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  let listening = false;
  let pendingRestart = false;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    // Skip if TTS is speaking — crosstalk guard.
    if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.speaking
    ) {
      return;
    }

    const last = event.results[event.results.length - 1];
    if (!last.isFinal) return;

    const transcript = last[0].transcript;
    const cmd = parseVoiceCommand(transcript);
    if (cmd) {
      onCommand(cmd);
    }
  };

  recognition.onerror = (event: Event) => {
    // 'no-speech' and 'audio-capture' are transient and will self-resolve
    // on restart — don't surface them to callers.
    const errEvent = event as SpeechRecognitionErrorEvent;
    if (errEvent.error === 'no-speech' || errEvent.error === 'audio-capture') return;

    // 'not-allowed' means permission was denied — don't restart.
    if (errEvent.error === 'not-allowed') {
      listening = false;
      onError(event);
      return;
    }

    onError(event);
  };

  recognition.onend = () => {
    // Auto-restart loop: keep listening unless explicitly stopped.
    if (listening && pendingRestart) {
      pendingRestart = false;
      try {
        recognition.start();
      } catch {
        // Already started (race condition) — ignore.
      }
    }
  };

  return {
    start() {
      if (listening) return;
      listening = true;
      pendingRestart = false;
      try {
        recognition.start();
      } catch {
        // Already running — ignore.
      }
    },

    stop() {
      listening = false;
      pendingRestart = false;
      try {
        recognition.stop();
      } catch {
        // Already stopped — ignore.
      }
    },

    isListening() {
      return listening;
    },
  };
}
