/**
 * useCompanionReceiver — tablet side of the companion channel.
 *
 * Mount this once in Ride.tsx (alongside useRideLoop).  It:
 *   - Opens the companion BroadcastChannel with role 'tablet'.
 *   - Ingests HR and cadence from the phone, preferring phone readings when
 *     fresh (within PHONE_STALENESS_MS).
 *   - Dispatches remote-control actions (pause/resume/lap/next-segment) into
 *     the rideStore.
 *   - Broadcasts workout-segment and toast updates back to the phone so the
 *     companion screen can mirror state.
 *
 * HR/cadence override rule
 * ────────────────────────
 * The phone sensor is preferred when its most-recent reading arrived within
 * PHONE_STALENESS_MS.  After that window, the tablet falls back to its own
 * BLE sensors (or trainer-derived values) as normal.  We implement this by
 * calling ingestHrSensorData / ingestCadenceSensorData, which already have
 * override priority in the store.  When the phone goes stale we call
 * setHrSensorStatus('disconnected') so the store falls back automatically.
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  openCompanionChannel,
  type CompanionChannel,
  type CompanionMessage,
} from '@/lib/companion/companionChannel';
import { segmentAt, resolveTargetWatts, totalDurationSec } from '@/lib/workout';

/** Phone readings older than this fall back to the tablet's own sensors. */
const PHONE_STALENESS_MS = 5_000;

/**
 * How often (ms) we broadcast the current workout-segment state to the phone.
 * Keeps the companion screen in sync without hammering the channel.
 */
const SEGMENT_BROADCAST_INTERVAL_MS = 1_000;

export function useCompanionReceiver(): void {
  const channelRef = useRef<CompanionChannel | null>(null);
  const lastHrFromPhone    = useRef<number>(0);
  const lastCadFromPhone   = useRef<number>(0);
  const lastSegmentBcast   = useRef<number>(0);
  // Track whether we've synthetically marked the phone sensor as connected
  // so we can disconnect it cleanly when stale.
  const phoneHrActive      = useRef<boolean>(false);
  const phoneCadActive     = useRef<boolean>(false);

  useEffect(() => {
    const store = useRideStore;
    const ch = openCompanionChannel('tablet');
    channelRef.current = ch;

    // ── Inbound: phone → tablet ──────────────────────────────────────────
    const unsub = ch.onMessage((msg: CompanionMessage) => {
      switch (msg.type) {
        case 'hr': {
          lastHrFromPhone.current = Date.now();
          if (!phoneHrActive.current) {
            phoneHrActive.current = true;
            store.getState().setHrSensorStatus('connected', 'Phone companion');
          }
          store.getState().ingestHrSensorData(msg.bpm);
          break;
        }

        case 'cadence': {
          lastCadFromPhone.current = Date.now();
          if (!phoneCadActive.current) {
            phoneCadActive.current = true;
            store.getState().setCadenceSensorStatus('connected', 'Phone companion');
          }
          store.getState().ingestCadenceSensorData(msg.rpm);
          break;
        }

        case 'remote-control': {
          const s = store.getState();
          switch (msg.action) {
            case 'pause':        if (s.rideState === 'running')  s.pause();  break;
            case 'resume':       if (s.rideState === 'paused')   s.resume(); break;
            case 'lap':
              // Mark lap by pushing a toast (lap segment markers are a future feature).
              s.pushToast({ kind: 'info', title: 'Lap marked', durationMs: 2_500 });
              break;
            case 'next-segment':
              // Advance the workout by jumping to the next segment boundary.
              // We do this by bumping elapsedSec past the current segment end.
              if (s.activeWorkout && s.workoutRunning) {
                const cursor = segmentAt(s.activeWorkout, s.workoutElapsedSec);
                if (cursor) {
                  s.advanceWorkoutElapsed(cursor.remainingInSegmentSec + 0.1);
                }
              }
              break;
          }
          break;
        }

        // Ignore hello/bye/workout-segment/toast — those flow tablet → phone.
        default:
          break;
      }
    });

    // ── Staleness checker + segment broadcaster ──────────────────────────
    const interval = setInterval(() => {
      const now = Date.now();

      // Drop phone HR if stale.
      if (phoneHrActive.current && now - lastHrFromPhone.current > PHONE_STALENESS_MS) {
        phoneHrActive.current = false;
        store.getState().setHrSensorStatus('disconnected', null);
      }

      // Drop phone cadence if stale.
      if (phoneCadActive.current && now - lastCadFromPhone.current > PHONE_STALENESS_MS) {
        phoneCadActive.current = false;
        store.getState().setCadenceSensorStatus('disconnected', null);
      }

      // Broadcast workout segment state to phone.
      if (now - lastSegmentBcast.current >= SEGMENT_BROADCAST_INTERVAL_MS) {
        lastSegmentBcast.current = now;
        broadcastSegment(ch);
      }
    }, 500);

    // ── Broadcast toasts to phone ────────────────────────────────────────
    // Zustand 5: subscribe takes a single listener receiving full state.
    // Track the last toast id we broadcast so we only send new ones.
    let lastBroadcastToastId = '';
    const unsubToasts = useRideStore.subscribe((state) => {
      const toasts = state.toasts;
      const latest = toasts[toasts.length - 1];
      if (!latest || latest.id === lastBroadcastToastId) return;
      lastBroadcastToastId = latest.id;
      ch.post({
        type: 'toast',
        t: Date.now(),
        id: latest.id,
        kind: latest.kind,
        title: latest.title,
        message: latest.message,
      });
    });

    return () => {
      unsub();
      unsubToasts();
      clearInterval(interval);
      ch.close();
      channelRef.current = null;
      // Clean up any phone-sourced sensor states.
      if (phoneHrActive.current) {
        useRideStore.getState().setHrSensorStatus('disconnected', null);
        phoneHrActive.current = false;
      }
      if (phoneCadActive.current) {
        useRideStore.getState().setCadenceSensorStatus('disconnected', null);
        phoneCadActive.current = false;
      }
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function broadcastSegment(ch: CompanionChannel): void {
  const s = useRideStore.getState();
  const workout = s.activeWorkout;
  if (!workout || !s.workoutRunning) return;

  const cursor = segmentAt(workout, s.workoutElapsedSec);
  if (!cursor) return;

  const ftpW = useSettingsStore.getState().ftpW;
  const seg = cursor.segment;

  let targetLabel = seg.label ?? seg.kind;
  const watts = resolveTargetWatts(seg, cursor.elapsedInSegmentSec, ftpW);
  if (watts !== null) {
    const pct = ftpW > 0 ? Math.round((watts / ftpW) * 100) : null;
    targetLabel = pct !== null ? `${watts} W · ${pct}% FTP` : `${watts} W`;
  } else if (seg.target.type === 'grade') {
    targetLabel = `${seg.target.gradePct > 0 ? '+' : ''}${seg.target.gradePct}% grade`;
  } else if (seg.target.type === 'free') {
    targetLabel = 'Free ride';
  }

  ch.post({
    type: 'workout-segment',
    t: Date.now(),
    label: seg.label ?? seg.kind.charAt(0).toUpperCase() + seg.kind.slice(1),
    targetLabel,
    remainingSec: Math.round(cursor.remainingInSegmentSec),
    durationSec: seg.durationSec,
    workoutElapsedSec: Math.round(s.workoutElapsedSec),
    workoutDurationSec: totalDurationSec(workout),
  });
}
