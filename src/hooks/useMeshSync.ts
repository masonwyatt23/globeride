/**
 * useMeshSync — React hook for N-rider mesh state sync over WebRTC.
 *
 * Extends useMultiriderSync to fan out to all peers in a MeshState rather
 * than a single DataChannel. Same 10 Hz cadence, same binary codec (v2
 * frames with senderPeerId header). Accepts messages from all peers,
 * deduplicates by peerId+timestamp to prevent re-broadcast loops.
 *
 * Mount once in Ride.tsx when pelotonMesh is active. The hook is inert
 * when mesh is null (no peloton joined).
 */

import { useEffect, useRef } from 'react';
import { useRideStore } from '@/stores/rideStore';
import { useMultiriderStore } from '@/stores/multiriderStore';
import {
  encodePeerStateV2,
  decodePeerStateV2,
  exchangeBaselineV2,
  decodeBaselineV2,
  decodeRoomAnnounce,
  getOpcode,
  MSG_TYPE_BASELINE,
  MSG_TYPE_STATE,
  MSG_TYPE_ROOM_ANNOUNCE,
} from '@/lib/webrtc/multiriderCodec';
import {
  broadcastState,
  emitPeerLeave,
  type MeshState,
} from '@/lib/webrtc/meshTopology';
import { sampleRouteAtDistance, headingAt } from '@/lib/gpxParser';

/** Send rate: 10 Hz. */
const SEND_INTERVAL_MS = 100;
/** Remove peers not heard from in 5 s. */
const PEER_STALE_MS = 5_000;

/**
 * Dedup cache: track (peerId, timestamp) pairs seen in the last 2 s to
 * avoid processing the same frame twice when the host relays a ROOM_ANNOUNCE.
 * Key: `${peerId}:${timestamp}`, value: receivedAt ms.
 */
const DEDUP_TTL_MS = 2_000;

interface Props {
  /** Active mesh state from meshTopology. Null = hook is inert. */
  mesh: MeshState | null;
}

export function useMeshSync({ mesh }: Props): void {
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);
  // Per-peer baseline: keyed by peerId.
  const baselinesRef = useRef<Map<string, { lat: number; lon: number }>>(new Map());
  // Dedup cache.
  const dedupRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!mesh) return;

    // Capture non-null mesh for closures.
    const activeMesh: MeshState = mesh;
    const localPeerId = activeMesh.localPeerId;

    // ---- Dedup helpers ----
    function isDuplicate(peerId: string, timestamp: number): boolean {
      const key = `${peerId}:${timestamp}`;
      const now = Date.now();
      if (dedupRef.current.has(key)) return true;
      dedupRef.current.set(key, now);
      return false;
    }

    function pruneDedup(): void {
      const cutoff = Date.now() - DEDUP_TTL_MS;
      for (const [key, ts] of dedupRef.current) {
        if (ts < cutoff) dedupRef.current.delete(key);
      }
    }

    // ---- Send local state to all peers ----
    function sendLocalState(): void {
      if (activeMesh.dataChannels.size === 0) return;

      const rideState = useRideStore.getState();
      const { route, distance, power, cadence } = rideState;

      let lat = 0;
      let lon = 0;
      let heading = 0;
      if (route) {
        const pos = sampleRouteAtDistance(route, distance);
        lat = pos.lat;
        lon = pos.lon;
        heading = headingAt(route, distance);
      }

      // Use our own position as our baseline (relative to first known peer baseline).
      // For simplicity, encode relative to (0,0) and let receivers use our v2 baseline.
      // The receiver maps senderPeerId → baseline for accurate delta decoding.
      const myBaseline = baselinesRef.current.get(localPeerId) ?? { lat, lon };

      const buf = encodePeerStateV2(
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
        myBaseline.lat,
        myBaseline.lon,
        localPeerId,
      );

      broadcastState(activeMesh, buf);
    }

    // ---- Send our baseline to all peers ----
    function sendBaseline(): void {
      if (activeMesh.dataChannels.size === 0) return;

      const rideState = useRideStore.getState();
      const { route, distance } = rideState;
      let lat = 0;
      let lon = 0;
      if (route) {
        const pos = sampleRouteAtDistance(route, distance);
        lat = pos.lat;
        lon = pos.lon;
      }

      // Register own baseline.
      baselinesRef.current.set(localPeerId, { lat, lon });

      const buf = exchangeBaselineV2(lat, lon, localPeerId);
      broadcastState(activeMesh, buf);
    }

    // ---- Handle incoming message from a peer ----
    function handleMessage(data: ArrayBuffer): void {
      const buf = new Uint8Array(data);
      const opcode = getOpcode(buf);
      if (opcode === null) return;

      if (opcode === MSG_TYPE_BASELINE) {
        const decoded = decodeBaselineV2(buf);
        if (!decoded) return;
        baselinesRef.current.set(decoded.senderPeerId, {
          lat: decoded.lat,
          lon: decoded.lon,
        });
        // Reciprocate baseline so the new peer can decode us.
        sendBaseline();
        return;
      }

      if (opcode === MSG_TYPE_STATE) {
        // Need the sender's baseline to decode deltas.
        if (buf.length < 34) return;
        // Read senderPeerId from bytes 1..16.
        const rawId = Array.from(buf.slice(1, 17))
          .map((b) => String.fromCharCode(b))
          .join('')
          .trimEnd();
        const baseline = baselinesRef.current.get(rawId);
        if (!baseline) return; // can't decode without baseline

        try {
          const state = decodePeerStateV2(buf, baseline.lat, baseline.lon);
          const { senderPeerId, ...peerState } = state;

          // Dedup: skip frames we've already processed.
          if (isDuplicate(senderPeerId, state.timestamp)) return;

          useMultiriderStore
            .getState()
            .setPeerState(senderPeerId, peerState, baseline.lat, baseline.lon);
        } catch {
          // Malformed frame — ignore.
        }
        return;
      }

      if (opcode === MSG_TYPE_ROOM_ANNOUNCE) {
        const announce = decodeRoomAnnounce(buf);
        if (!announce) return;
        // A new peer joined — request their baseline on next send cycle.
        // Nothing to do here beyond logging; the new peer will send a BASELINE
        // automatically when their channel opens.
        return;
      }
    }

    // ---- Subscribe to all currently open DataChannels ----
    function subscribeChannel(peerId: string, channel: RTCDataChannel): void {
      const msgHandler = (ev: MessageEvent) => {
        if (ev.data instanceof ArrayBuffer) {
          handleMessage(ev.data);
        } else if (ev.data instanceof Blob) {
          (ev.data as Blob).arrayBuffer().then(handleMessage).catch(() => undefined);
        }
      };
      const closeHandler = () => {
        emitPeerLeave(activeMesh, peerId);
        useMultiriderStore.getState().removePeer(peerId);
      };
      channel.addEventListener('message', msgHandler);
      channel.addEventListener('close', closeHandler);
      unsubsRef.current.push(() => {
        channel.removeEventListener('message', msgHandler);
        channel.removeEventListener('close', closeHandler);
      });
    }

    // Subscribe to channels that are already open.
    for (const [peerId, channel] of activeMesh.dataChannels) {
      subscribeChannel(peerId, channel);
      if (channel.readyState === 'open') {
        sendBaseline();
      } else {
        channel.addEventListener('open', sendBaseline, { once: true });
      }
    }

    // ---- 10 Hz send loop ----
    sendTimerRef.current = setInterval(sendLocalState, SEND_INTERVAL_MS);

    // ---- Stale peer culling (every 2 s) ----
    staleTimerRef.current = setInterval(() => {
      pruneDedup();
      const { peers } = useMultiriderStore.getState();
      const now = Date.now();
      for (const [peerId, peer] of Object.entries(peers)) {
        if (now - peer.lastUpdateMs > PEER_STALE_MS) {
          useMultiriderStore.getState().removePeer(peerId);
          baselinesRef.current.delete(peerId);
        }
      }
    }, 2_000);

    return () => {
      if (sendTimerRef.current !== null) clearInterval(sendTimerRef.current);
      if (staleTimerRef.current !== null) clearInterval(staleTimerRef.current);
      for (const unsub of unsubsRef.current) unsub();
      unsubsRef.current = [];
      sendTimerRef.current = null;
      staleTimerRef.current = null;
    };
  }, [mesh]);
}

/** Expose subscribeChannel so PelotonRoom can wire new channels after join. */
export function attachChannelToMeshSync(
  mesh: MeshState,
  peerId: string,
  channel: RTCDataChannel,
  onMessage: (data: ArrayBuffer) => void,
): () => void {
  const msgHandler = (ev: MessageEvent) => {
    if (ev.data instanceof ArrayBuffer) onMessage(ev.data);
    else if (ev.data instanceof Blob) {
      (ev.data as Blob).arrayBuffer().then(onMessage).catch(() => undefined);
    }
  };
  const closeHandler = () => {
    emitPeerLeave(mesh as MeshState, peerId);
    useMultiriderStore.getState().removePeer(peerId);
  };
  channel.addEventListener('message', msgHandler);
  channel.addEventListener('close', closeHandler);
  return () => {
    channel.removeEventListener('message', msgHandler);
    channel.removeEventListener('close', closeHandler);
  };
}
