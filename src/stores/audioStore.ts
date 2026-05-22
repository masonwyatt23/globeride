/**
 * Audio preference store — persisted to localStorage.
 *
 * Default: sound is OFF (opt-in) so the app never surprises a user.
 * Volume is a 0–1 linear gain applied to the master output.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AudioStoreState {
  /** Whether the audio engine is enabled. Default: false (opt-in). */
  enabled: boolean;
  /** Master volume 0–1. Default: 0.55. */
  volume: number;
  /** Actions */
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  setVolume: (volume: number) => void;
}

export const useAudioStore = create<AudioStoreState>()(
  persist(
    (set, get) => ({
      enabled: false,
      volume: 0.55,
      setEnabled: (enabled) => set({ enabled }),
      toggleEnabled: () => set({ enabled: !get().enabled }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
    }),
    {
      name: 'globeride.audio',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
