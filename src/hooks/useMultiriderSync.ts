/**
 * useMultiriderSync — React hook for live multi-rider state sync over WebRTC.
 *
 * Mount once in Ride.tsx alongside useRideLoop.
 *
 * Responsibilities:
 *   - At 10 Hz, encode the local rider's position/telemetry into the
 *     32-byte binary STATE format and send via the DataChannel.
 *   - On incoming DataChannel messages, decode the STATE frame and push to
 *     multiriderStore so peer avatars update on the globe.
 *   - Send a BASELINE handshake on DataChannel open so both peers can
 *     delta-decode each other's lat/lon.
 *   - Stale peer culling: remove peers not heard from in 5 s.
 *   - Cleanup on unmount.
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useMultiriderStore } from '@/stores/multiriderStore';
import {
  encodePeerState,
  decodePeerState,
  exchangeBaseline,
  decodeBaseline,
  getOpcode,
} from '@/lib/webrtc/multiriderCodec';
import { onDataChannelMessage } from '@/lib/webrtc/multiriderConnection';
import { sampleRouteAtDistance } from '@/lib/gpxParser';
import { headingAt } from '@/lib/gpxParser';

/** Send rate: 10 Hz. */
const SEND_INTERVAL_MS = 100;
/** Remove peers not heard from in 5 s. */
const PEER_STALE_MS = 5_000;

/**
 * A single stable peer ID derived from the session ID + local role, so each
 * side knows which key to use for the remote peer's state.
 */
function makePeerId(sessionId: string, role: 'initiator' | 'responder'): string {
  // Each side uses the opposite role as the remote peer's ID.
  return `${sessionId}:${role === 'initiator' ? 'responder' : 'initiator'}`;
}

export function useMultiriderSync(): void {
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubChannelRef = useRef<(() => void) | null>(null);
  // Per-peer baseline state; keyed by peer ID.
  const baselineRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    // ---- Helper: get the active DataChannel ----
    function getChannel(): RTCDataChannel | null {
      return useMultiriderStore.getState().dataChannel;
    }

    // ---- Helper: send local state over the DataChannel ----
    function sendLocalState(): void {
      const channel = getChannel();
      if (!channel || channel.readyState !== 'open') return;

      const rideState = useRideStore.getState();
      const { route, distance, power, cadence } = rideState;

      // Derive lat/lon from route position.
      let lat = 0;
      let lon = 0;
      let heading = 0;
      if (route) {
        const pos = sampleRouteAtDistance(route, distance);
        lat = pos.lat;
        lon = pos.lon;
        heading = headingAt(route, distance);
      }

      // Use local position as our own baseline (session-level baseline was exchanged at open).
      const { sessionId, localRole } = useMultiriderStore.getState();
      if (!sessionId || !localRole) return;

      // Baseline for delta encoding: use the stored peer's baseline lat/lon from store.
      // We encode relative to the remote baseline so the peer can decode directly.
      // If no baseline yet (race condition), skip this frame.
      if (!baselineRef.current) return;

      const buf = encodePeerState(
        {
          distance,
          lat,
          lon,
          heading,
          power: power ?? 0,
          cadence: cadence ?? 0,
          speed: rideState.speed ?? 0,
          timestamp: Date.now(),
        },
        baselineRef.current.lat,
        baselineRef.current.lon,
      );

      try {
        // slice() copies into a new plain ArrayBuffer, satisfying RTCDataChannel.send().
        channel.send(buf.slice());
      } catch {
        // Channel may have closed between the readyState check and send.
      }
    }

    // ---- Helper: send our own baseline to the peer ----
    function sendBaseline(): void {
      const channel = getChannel();
      if (!channel || channel.readyState !== 'open') return;

      const rideState = useRideStore.getState();
      const { route, distance } = rideState;

      let lat = 0;
      let lon = 0;
      if (route) {
        const pos = sampleRouteAtDistance(route, distance);
        lat = pos.lat;
        lon = pos.lon;
      }

      // Store our own position as the initial baseline so we can decode incoming deltas.
      // If no baseline from peer yet, use our own position as placeholder.
      if (!baselineRef.current) {
        baselineRef.current = { lat, lon };
      }

      const buf = exchangeBaseline(lat, lon);
      try {
        // slice() copies into a new plain ArrayBuffer, satisfying RTCDataChannel.send().
        channel.send(buf.slice());
      } catch {
        // Ignore.
      }
    }

    // ---- Subscribe to incoming DataChannel messages ----
    const pc = useMultiriderStore.getState().connection;
    if (!pc) return;

    const unsubMessages = onDataChannelMessage(pc, (data: ArrayBuffer) => {
      const buf = new Uint8Array(data);
      const opcode = getOpcode(buf);
      const { sessionId, localRole } = useMultiriderStore.getState();
      if (!sessionId || !localRole) return;

      if (opcode === 0x01) {
        // BASELINE frame: store peer's baseline for decoding.
        const baseline = decodeBaseline(buf);
        if (baseline) {
          baselineRef.current = baseline;
        }
        // Send our baseline back if we haven't yet.
        sendBaseline();
        return;
      }

      if (opcode === 0x02) {
        // STATE frame.
        if (!baselineRef.current) return; // can't decode without baseline
        try {
          const state = decodePeerState(buf, baselineRef.current.lat, baselineRef.current.lon);
          const peerId = makePeerId(sessionId, localRole);
          useMultiriderStore
            .getState()
            .setPeerState(peerId, state, baselineRef.current.lat, baselineRef.current.lon);
        } catch {
          // Malformed frame — ignore.
        }
      }
    });
    unsubChannelRef.current = unsubMessages;

    // ---- Handle DataChannel open event (for responder side) ----
    // The initiator's channel fires 'open' before the connection reaches 'connected'.
    // We attach to both the pc's datachannel event and the stored dataChannel.
    const dcHandler = (ev: RTCDataChannelEvent) => {
      const ch = ev.channel;
      ch.addEventListener('open', () => {
        useMultiriderStore.getState().setDataChannel(ch);
        sendBaseline();
      });
    };
    pc.addEventListener('datachannel', dcHandler);

    // Also watch the stored dataChannel for its open event (initiator case).
    const existingChannel = useMultiriderStore.getState().dataChannel;
    if (existingChannel) {
      if (existingChannel.readyState === 'open') {
        sendBaseline();
      } else {
        existingChannel.addEventListener('open', sendBaseline, { once: true });
      }
    }

    // ---- 10 Hz send loop ----
    sendTimerRef.current = setInterval(sendLocalState, SEND_INTERVAL_MS);

    // ---- Stale peer culling (every 2 s) ----
    staleTimerRef.current = setInterval(() => {
      const { peers } = useMultiriderStore.getState();
      const now = Date.now();
      for (const [peerId, peer] of Object.entries(peers)) {
        if (now - peer.lastUpdateMs > PEER_STALE_MS) {
          useMultiriderStore.getState().removePeer(peerId);
        }
      }
    }, 2_000);

    return () => {
      if (sendTimerRef.current !== null) {
        clearInterval(sendTimerRef.current);
        sendTimerRef.current = null;
      }
      if (staleTimerRef.current !== null) {
        clearInterval(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      unsubChannelRef.current?.();
      unsubChannelRef.current = null;
      pc.removeEventListener('datachannel', dcHandler);
    };
  // Re-run when the peer connection changes (new session or reconnect).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useMultiriderStore.getState().connection]);
}
