/**
 * VoiceControlButton — floating mic button for hands-free voice control.
 *
 * Renders only when:
 *   1. isVoiceRecognitionSupported() is true (hidden on Firefox / unsupported browsers).
 *   2. voiceControlEnabled is true in settings (user hasn't turned it off).
 *
 * Visual states:
 *   - Idle (not listening): muted mic icon, glass pill style.
 *   - Listening: pulsing green glow + solid mic icon to indicate active mic.
 *
 * The parent (Ride.tsx) passes in the hook return value so this component is
 * purely presentational — no store access, no recognizer lifecycle.
 */

import { Mic, MicOff } from 'lucide-react';
import { isVoiceRecognitionSupported } from '@/lib/voice/voiceControl';
import { useSettingsStore } from '@/stores/settingsStore';

export interface VoiceControlButtonProps {
  isListening: boolean;
  onToggle: () => void;
}

export function VoiceControlButton({ isListening, onToggle }: VoiceControlButtonProps) {
  const voiceControlEnabled = useSettingsStore((s) => s.voiceControlEnabled);

  // Invisible on unsupported browsers or when disabled in settings.
  if (!isVoiceRecognitionSupported() || !voiceControlEnabled) return null;

  return (
    <button
      type="button"
      aria-label={isListening ? 'Stop voice control' : 'Start voice control'}
      aria-pressed={isListening}
      onClick={onToggle}
      className={[
        // Base: rounded glass pill — matches CameraSwitcher style.
        'flex items-center gap-1.5 rounded-full px-3 py-1.5',
        'text-xs font-medium select-none',
        'glass glass-hairline border border-transparent',
        'transition-all duration-200',
        // Listening state: green tint + pulsing ring.
        isListening
          ? [
              'text-green-400 border-green-500/40',
              'shadow-[0_0_12px_2px_rgba(74,222,128,0.35)]',
              'animate-[voicePulse_1.5s_ease-in-out_infinite]',
            ].join(' ')
          : 'text-foreground hover:text-foreground',
      ].join(' ')}
      style={
        isListening
          ? {
              // Inline fallback for the pulse animation if Tailwind's arbitrary
              // animation isn't compiled. Prefer the Tailwind class above.
              animation: 'voicePulse 1.5s ease-in-out infinite',
            }
          : undefined
      }
    >
      {isListening ? (
        <Mic className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{isListening ? 'Listening' : 'Voice'}</span>
    </button>
  );
}
