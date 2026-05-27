# `src/lib/voice/` — Voice recognition and intent parsing

## What's here

- `speech.d.ts` — Ambient TypeScript declarations for the Web Speech API (`SpeechRecognition`, `SpeechRecognitionEvent`, etc.) — TypeScript 5.x does not ship these types
- `voiceControl.ts` — Web Speech API wrapper: intent parser, continuous recognizer handle, crosstalk guard against TTS playback

## Public API

```ts
// voiceControl.ts
isVoiceRecognitionSupported(): boolean
// Returns false on Firefox, SSR, and browsers without SpeechRecognition

parseVoiceCommand(transcript: string): VoiceCommand | null
// Pure function — no side effects, fully testable in Node
// VoiceCommand: { intent: VoiceIntent; confidence?: number }
// VoiceIntent: 'pause' | 'resume' | 'stop' | 'boost' | 'recover'
//            | 'camera_chase' | 'camera_overhead' | 'camera_cinematic'
//            | 'camera_first_person' | 'mute' | 'unmute' | 'unknown'

createVoiceRecognizer(onCommand: (cmd: VoiceCommand) => void): VoiceRecognizerHandle | null
// Returns null when unsupported — caller must guard
// VoiceRecognizerHandle: { start(): void; stop(): void; isListening(): boolean }
```

## How it's consumed

- `src/hooks/useVoiceControl.ts` — React hook that wraps `createVoiceRecognizer`; manages lifecycle (start/stop on mount/unmount); imports `speakLine` + `pickPreferredVoice` from `@/lib/speechSynthesis` for TTS confirmation and the mic-pause crosstalk guard
- `src/components/ride/VoiceControlButton.tsx` — toggle button; calls `useVoiceControl`

## Constraints / gotchas

- **Browser support**: Chrome and Edge (desktop + Android) only. `isVoiceRecognitionSupported()` returns false on Firefox (all versions), Safari (no `webkitSpeechRecognition`), and SSR.
- **HTTPS required**: `SpeechRecognition` is blocked on `http://` origins in Chrome. Dev server on `localhost` is exempted.
- **Microphone permission**: the browser prompts the user on first `start()` call. Denial causes the recognizer to silently stop.
- **Continuous mode**: the recognizer auto-restarts on the `end` event unless `stop()` was called explicitly. This prevents the user needing to re-tap between commands.
- **Crosstalk guard**: `voiceControl.ts` checks `window.speechSynthesis.speaking` before dispatching a result; results received while TTS is active are suppressed. `useVoiceControl.ts` also calls `recognizer.stop()` before TTS and `recognizer.start()` after — see `@/lib/speechSynthesis` for the TTS side.
- **TTS cross-reference**: TTS playback is handled by `src/lib/speechSynthesis.ts` (not in this directory). `useVoiceControl.ts` imports `speakLine` and `pickPreferredVoice` from there for spoken command confirmations.
