/**
 * useVoiceControl — React hook that wires the VoiceRecognizer to ride store
 * actions and settings.
 *
 * Usage (in Ride.tsx):
 *   const { isListening, startListening, stopListening } = useVoiceControl();
 *
 * The hook:
 *   - Is a no-op on mount if voiceControlEnabled=false or the API is unsupported.
 *   - Creates the recognizer once on mount; cleans up on unmount.
 *   - Dispatches parsed commands to rideStore / settingsStore.
 *   - Handles the two-phase "end ride" confirmation pattern with a 10-second
 *     timeout: on 'endRide', speaks a confirmation prompt and waits; on
 *     'endRideConfirmed' (within 10 s), calls finish().
 *   - Speaks a brief TTS confirmation for every fired command (using speakLine).
 *   - Pauses mic when window.speechSynthesis.speaking to avoid crosstalk —
 *     the recognizer's own crosstalk guard also handles this inline.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createVoiceRecognizer,
  isVoiceRecognitionSupported,
  type VoiceCommand,
  type VoiceRecognizerHandle,
} from '@/lib/voice/voiceControl';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CAMERA_MODES, type CameraMode } from '@/lib/cesiumCameras';
import { speakLine, pickPreferredVoice } from '@/lib/speechSynthesis';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const VOLUME_STEP = 10;
const END_RIDE_CONFIRM_TIMEOUT_MS = 10_000;

function confirm(text: string, volume: number, rate: number): void {
  const voice = pickPreferredVoice();
  speakLine(text, { volume, rate, voice });
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseVoiceControlReturn {
  /** True while the mic is actively listening. */
  isListening: boolean;
  /** Start listening. No-op if already listening or unsupported. */
  startListening: () => void;
  /** Stop listening. No-op if not listening. */
  stopListening: () => void;
}

// ---------------------------------------------------------------------------
// useVoiceControl
// ---------------------------------------------------------------------------

export function useVoiceControl(): UseVoiceControlReturn {
  const voiceControlEnabled = useSettingsStore((s) => s.voiceControlEnabled);
  const [isListening, setIsListening] = useState(false);
  const recognizerRef = useRef<VoiceRecognizerHandle | null>(null);
  // Timer handle for the end-ride confirmation window.
  const endRideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether we are currently waiting for the verbal confirmation.
  const awaitingEndConfirmRef = useRef(false);

  // Stable refs for store getters — avoids stale closures in the recognizer callback.
  const rideStoreRef = useRef(useRideStore.getState);
  const settingsStoreRef = useRef(useSettingsStore.getState);

  const cancelEndRideTimer = useCallback(() => {
    if (endRideTimerRef.current !== null) {
      clearTimeout(endRideTimerRef.current);
      endRideTimerRef.current = null;
    }
    awaitingEndConfirmRef.current = false;
  }, []);

  const handleCommand = useCallback(
    (cmd: VoiceCommand) => {
      const rideState = rideStoreRef.current();
      const settings = settingsStoreRef.current();
      const vol = settings.commentaryVolume;
      const rate = settings.commentaryRate;

      switch (cmd.intent) {
        // ---- end ride confirmed ----------------------------------------
        case 'endRideConfirmed': {
          if (!awaitingEndConfirmRef.current) break;
          cancelEndRideTimer();
          confirm('Ending ride.', vol, rate);
          rideState.finish();
          break;
        }

        // ---- end ride --------------------------------------------------
        case 'endRide': {
          // Don't allow while already awaiting confirmation.
          if (awaitingEndConfirmRef.current) break;
          awaitingEndConfirmRef.current = true;
          confirm("Are you sure? Say 'end ride confirmed' to finish.", vol, rate);
          endRideTimerRef.current = setTimeout(() => {
            awaitingEndConfirmRef.current = false;
            endRideTimerRef.current = null;
            confirm('End ride cancelled.', vol, rate);
          }, END_RIDE_CONFIRM_TIMEOUT_MS);
          break;
        }

        // ---- pause -----------------------------------------------------
        case 'pause': {
          cancelEndRideTimer();
          if (rideState.rideState === 'running') {
            rideState.pause();
            confirm('Paused.', vol, rate);
          }
          break;
        }

        // ---- resume ----------------------------------------------------
        case 'resume': {
          cancelEndRideTimer();
          if (rideState.rideState === 'paused') {
            rideState.resume();
            confirm('Resuming.', vol, rate);
          }
          break;
        }

        // ---- lap -------------------------------------------------------
        case 'lap': {
          cancelEndRideTimer();
          rideState.pushToast({
            id: 'voice-lap',
            kind: 'info',
            title: 'Lap marked',
            message: 'Lap boundary recorded.',
            durationMs: 2_500,
          });
          confirm('Lap marked.', vol, rate);
          break;
        }

        // ---- switch camera (cycle) -------------------------------------
        case 'switchCamera': {
          cancelEndRideTimer();
          const current = settings.cameraMode;
          const idx = CAMERA_MODES.indexOf(current);
          const next = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length] as CameraMode;
          settings.setCameraMode(next);
          confirm(`Switching to ${next.replace(/([A-Z])/g, ' $1').toLowerCase()} camera.`, vol, rate);
          break;
        }

        // ---- set camera to a specific mode ----------------------------
        case 'setCamera': {
          cancelEndRideTimer();
          const target = cmd.param as CameraMode | undefined;
          if (target && CAMERA_MODES.includes(target)) {
            settings.setCameraMode(target);
            const label = target.replace(/([A-Z])/g, ' $1').toLowerCase();
            confirm(`Switching to ${label} view.`, vol, rate);
          }
          break;
        }

        // ---- show stats -----------------------------------------------
        case 'showStats': {
          cancelEndRideTimer();
          // Toggle HUD visibility via a toast-based signal consumed by RideHUD.
          rideState.pushToast({
            id: 'voice-stats-toggle',
            kind: 'info',
            title: 'Stats shown',
            message: '',
            durationMs: 1_500,
          });
          confirm('Showing stats.', vol, rate);
          break;
        }

        // ---- hide stats -----------------------------------------------
        case 'hideStats': {
          cancelEndRideTimer();
          rideState.pushToast({
            id: 'voice-stats-toggle',
            kind: 'info',
            title: 'Stats hidden',
            message: '',
            durationMs: 1_500,
          });
          confirm('Hiding stats.', vol, rate);
          break;
        }

        // ---- volume up ------------------------------------------------
        case 'volumeUp': {
          cancelEndRideTimer();
          const newVol = Math.min(100, settings.commentaryVolume + VOLUME_STEP);
          settings.setCommentarySettings({ commentaryVolume: newVol });
          confirm(`Volume ${newVol}.`, newVol, rate);
          break;
        }

        // ---- volume down ----------------------------------------------
        case 'volumeDown': {
          cancelEndRideTimer();
          const newVol = Math.max(0, settings.commentaryVolume - VOLUME_STEP);
          settings.setCommentarySettings({ commentaryVolume: newVol });
          confirm(`Volume ${newVol}.`, newVol, rate);
          break;
        }
      }
    },
    [cancelEndRideTimer],
  );

  // ---- Create / destroy the recognizer based on enabled flag ----
  useEffect(() => {
    if (!voiceControlEnabled || !isVoiceRecognitionSupported()) return;

    const recognizer = createVoiceRecognizer(handleCommand, (_err) => {
      // On unrecoverable error (not-allowed etc.), stop listening gracefully.
      setIsListening(false);
    });

    recognizerRef.current = recognizer;

    return () => {
      recognizer?.stop();
      recognizerRef.current = null;
      cancelEndRideTimer();
      setIsListening(false);
    };
  }, [voiceControlEnabled, handleCommand, cancelEndRideTimer]);

  const startListening = useCallback(() => {
    const r = recognizerRef.current;
    if (!r || r.isListening()) return;
    r.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    const r = recognizerRef.current;
    if (!r || !r.isListening()) return;
    r.stop();
    setIsListening(false);
    cancelEndRideTimer();
  }, [cancelEndRideTimer]);

  return { isListening, startListening, stopListening };
}
