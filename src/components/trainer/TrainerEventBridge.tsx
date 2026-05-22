import { useEffect } from 'react';

import { useRideStore } from '@/stores/rideStore';
import {
  onBatteryLevel,
  onControlPointError,
  onDisconnect,
  onReconnect,
  onTrainerData,
} from '@/lib/ftms';

/**
 * Mount once at app root. Subscribes to the FTMS module's event hooks and
 * fans them out into the Zustand store + toast queue. Owns no UI of its own
 * (returns null) so it can live next to the Toaster and Router.
 *
 * Effects:
 *   - trainer data       → store.ingestTrainerData
 *   - battery level      → store.setBatteryLevel + low-battery toast
 *   - unexpected drop    → store.setConnection('reconnecting' | 'disconnected')
 *                          + toast
 *   - reconnect phases   → store.setReconnect + toasts (success / failure)
 *   - control-point errs → toasts so the user knows resistance is misbehaving
 */
export function TrainerEventBridge(): null {
  // Pull actions imperatively from the store; we don't need re-renders here.
  useEffect(() => {
    const ingest = useRideStore.getState().ingestTrainerData;
    onTrainerData(ingest);
  }, []);

  useEffect(() => {
    onBatteryLevel((level) => {
      const setBatteryLevel = useRideStore.getState().setBatteryLevel;
      const pushToast = useRideStore.getState().pushToast;
      setBatteryLevel(level);
      if (level <= 15) {
        pushToast({
          id: 'trainer-battery-low',
          kind: 'warning',
          title: `Trainer battery low (${level}%)`,
          message:
            "If it dies mid-ride you'll lose resistance control. Plug in if you can.",
          durationMs: 8_000,
        });
      }
    });
  }, []);

  useEffect(() => {
    onDisconnect(({ unexpected }) => {
      const st = useRideStore.getState();
      if (!unexpected) {
        st.setConnection('disconnected', { deviceName: null });
        return;
      }
      // Unexpected → we expect a reconnect attempt next. Show as
      // reconnecting; the reconnect listener will refine the message.
      st.setConnection('reconnecting', {
        error: 'Trainer dropped — trying to reconnect…',
      });
      st.pushToast({
        id: 'trainer-connection',
        kind: 'warning',
        title: 'Trainer disconnected',
        message: 'Trying to reconnect automatically…',
        durationMs: null,
      });
    });
  }, []);

  useEffect(() => {
    onReconnect((evt) => {
      const st = useRideStore.getState();
      switch (evt.phase) {
        case 'start':
          st.setReconnect(0, evt.maxAttempts);
          break;
        case 'attempt':
          st.setReconnect(evt.attempt, evt.maxAttempts);
          st.pushToast({
            id: 'trainer-connection',
            kind: 'warning',
            title: 'Reconnecting to trainer',
            message: `Attempt ${evt.attempt} of ${evt.maxAttempts}…`,
            durationMs: null,
          });
          break;
        case 'success':
          st.setConnection('connected', { deviceName: st.deviceName });
          st.setReconnect(0, 0);
          st.pushToast({
            id: 'trainer-connection',
            kind: 'success',
            title: 'Trainer reconnected',
            message: 'Resistance control is back online.',
            durationMs: 4_000,
          });
          break;
        case 'failed':
          st.setConnection('disconnected', {
            deviceName: null,
            error: 'Auto-reconnect failed',
            code: 'reconnect-failed',
          });
          st.setReconnect(0, 0);
          // Fall back to demo so the ride doesn't freeze with zero speed.
          if (st.mode === 'trainer') st.setMode('demo');
          st.pushToast({
            id: 'trainer-connection',
            kind: 'error',
            title: "Couldn't reconnect after several attempts",
            message:
              'Switched to Demo Mode so the ride keeps going. Re-pair the trainer when you can.',
            durationMs: 10_000,
          });
          break;
      }
    });
  }, []);

  useEffect(() => {
    onControlPointError((err) => {
      const st = useRideStore.getState();
      st.pushToast({
        id: `ftms-cp-${err.opcode}`,
        kind: err.resultCode === 0x05 ? 'error' : 'warning',
        title: 'Trainer rejected a command',
        message: err.message,
        durationMs: 6_000,
      });
    });
  }, []);

  return null;
}
