/**
 * multiriderStore.ts — Zustand store for live multi-rider WebRTC session.
 *
 * Manages the RTCPeerConnection lifecycle, DataChannel reference, connection
 * state machine, and the map of live peer positions received over the channel.
 */

import { create } from 'zustand';
import type { PeerStateMsg } from '@/lib/webrtc/multiriderCodec';

// ---------------------------------------------------------------------------
// State shapes
// ---------------------------------------------------------------------------

/** Extended peer state including metadata stored in the store. */
export interface PeerEntry extends PeerStateMsg {
  peerId: string;
  /** Unix ms of the last received STATE message. */
  lastUpdateMs: number;
  /** Session baseline latitude used for delta decoding. */
  baselineLat: number;
  /** Session baseline longitude used for delta decoding. */
  baselineLon: number;
}

/** Connection state machine states. */
export type MultiRiderConnectionState =
  | 'idle'
  | 'inviting'        // initiator: generated offer, waiting for paste-back of answer
  | 'awaiting-answer' // alias for 'inviting' (same meaning, clearer for UI)
  | 'joining'         // responder: generated answer, waiting for connection
  | 'connected'
  | 'disconnected'
  | 'failed';

interface MultiRiderStoreState {
  // ---- Connection ----
  connection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  localRole: 'initiator' | 'responder' | null;
  connectionState: MultiRiderConnectionState;
  /** Active session ID shared by both peers. */
  sessionId: string | null;
  error: string | null;

  // ---- Peer positions ----
  /** Map of peerId → PeerEntry. Stored as Record for Zustand reactivity. */
  peers: Record<string, PeerEntry>;

  // ---- Mesh peloton (Wave 35.B) ----
  /** True if this client created the room (acts as SDP relay for joiners). */
  meshHost: boolean;
  /** 6-char room code shared with friends. Null when not in a peloton. */
  roomCode: string | null;
  /**
   * Host-only queue of join requests awaiting an answer.
   * Each entry is a peerId + their SDP offer; host generates an answer
   * and returns it to the joiner out-of-band.
   */
  pendingJoinRequests: { peerId: string; sdp: string }[];

  // ---- Actions ----
  /** Set the RTCPeerConnection (called when connection is created). */
  setConnection: (pc: RTCPeerConnection | null) => void;
  /** Set the DataChannel reference. */
  setDataChannel: (channel: RTCDataChannel | null) => void;
  /** Set the local role. */
  setLocalRole: (role: 'initiator' | 'responder' | null) => void;
  /** Update the connection state machine. */
  setConnectionState: (state: MultiRiderConnectionState) => void;
  /** Set the shared session ID. */
  setSessionId: (id: string | null) => void;
  /** Set or clear the error message. */
  setError: (msg: string | null) => void;

  /** Update or insert a peer's live state. */
  setPeerState: (peerId: string, state: PeerStateMsg, baselineLat: number, baselineLon: number) => void;
  /** Remove a peer (on disconnect). */
  removePeer: (peerId: string) => void;

  // ---- Mesh actions ----
  /** Mark this client as the room host and store the room code. */
  setMeshHost: (isHost: boolean) => void;
  /** Set the current room code. */
  setRoomCode: (code: string | null) => void;
  /** Host only: enqueue a join request to display in the UI. */
  addPendingJoinRequest: (peerId: string, sdp: string) => void;
  /** Host only: remove a join request after it has been answered. */
  acceptPendingJoinRequest: (peerId: string) => void;

  /**
   * Initiate as the offer-creating side.
   * Sets role + transitions to 'inviting'.
   */
  startAsInitiator: (sessionId: string) => void;

  /**
   * Respond to an invite (answer side).
   * Sets role + transitions to 'joining'.
   */
  joinAsResponder: () => void;

  /** Tear down the current session completely. */
  disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMultiriderStore = create<MultiRiderStoreState>((set, get) => ({
  // Initial state
  connection: null,
  dataChannel: null,
  localRole: null,
  connectionState: 'idle',
  sessionId: null,
  error: null,
  peers: {},
  meshHost: false,
  roomCode: null,
  pendingJoinRequests: [],

  // ---- Low-level setters ----

  setConnection: (pc) => set({ connection: pc }),

  setDataChannel: (channel) => set({ dataChannel: channel }),

  setLocalRole: (role) => set({ localRole: role }),

  setConnectionState: (state) => set({ connectionState: state }),

  setSessionId: (id) => set({ sessionId: id }),

  setError: (msg) => set({ error: msg }),

  // ---- Peer state management ----

  setPeerState: (peerId, state, baselineLat, baselineLon) =>
    set((st) => ({
      peers: {
        ...st.peers,
        [peerId]: {
          ...state,
          peerId,
          lastUpdateMs: Date.now(),
          baselineLat,
          baselineLon,
        },
      },
    })),

  removePeer: (peerId) =>
    set((st) => {
      const next = { ...st.peers };
      delete next[peerId];
      return { peers: next };
    }),

  // ---- Mesh actions ----

  setMeshHost: (isHost) => set({ meshHost: isHost }),

  setRoomCode: (code) => set({ roomCode: code }),

  addPendingJoinRequest: (peerId, sdp) =>
    set((st) => ({
      pendingJoinRequests: [
        ...st.pendingJoinRequests.filter((r) => r.peerId !== peerId),
        { peerId, sdp },
      ],
    })),

  acceptPendingJoinRequest: (peerId) =>
    set((st) => ({
      pendingJoinRequests: st.pendingJoinRequests.filter((r) => r.peerId !== peerId),
    })),

  // ---- Session lifecycle ----

  startAsInitiator: (sessionId) =>
    set({
      localRole: 'initiator',
      connectionState: 'inviting',
      sessionId,
      error: null,
      peers: {},
    }),

  joinAsResponder: () =>
    set({
      localRole: 'responder',
      connectionState: 'joining',
      error: null,
      peers: {},
    }),

  disconnect: () => {
    const { connection } = get();
    if (connection) {
      try {
        connection.close();
      } catch {
        // Already closed — ignore.
      }
    }
    set({
      connection: null,
      dataChannel: null,
      localRole: null,
      connectionState: 'idle',
      sessionId: null,
      error: null,
      peers: {},
      meshHost: false,
      roomCode: null,
      pendingJoinRequests: [],
    });
  },
}));
