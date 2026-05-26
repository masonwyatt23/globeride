/**
 * meshTopology.ts — N-rider mesh peloton management (up to 4 peers).
 *
 * Architecture overview
 * ---------------------
 * Without a signaling server, we cannot automatically connect N peers to each
 * other. Instead, the room HOST acts as a manual relay for SDP exchanges:
 *
 *   1. Host calls createRoom() → gets a 6-char room code + local peer ID.
 *   2. Each joiner calls generateJoinManifest() → produces an invite blob
 *      containing the room code + their peer ID + their SDP offer.
 *   3. Host pastes each join manifest into acceptJoinRequest() → returns the
 *      host's SDP answer for that joiner.
 *   4. Joiner pastes the host's answer into completeJoin().
 *   5. Existing peers learn about the new arrival via ROOM_ANNOUNCE messages
 *      that the host broadcasts after each handshake.
 *
 * Mesh cap: 4 peers (host + 3 joiners). Raising to 8 requires a lightweight
 * signaling channel (WebSocket relay or TURN) so peers can exchange SDPs
 * without the host manually relaying each one.
 *
 * DataChannel name: 'globeride.mesh.v1'
 */

import {
  createPeerConnection,
  createOffer,
  acceptOffer,
  acceptAnswer,
  closeConnection,
} from './multiriderConnection';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MESH_DATA_CHANNEL = 'globeride.mesh.v1';

/** Maximum peers in one room (host + joiners). */
export const MESH_MAX_PEERS = 4;

/** Characters used for room codes. Unambiguous alphabet (no 0/O, 1/I/L). */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mutable mesh state managed by the local client. */
export interface MeshState {
  /** This client's stable peer ID (UUID). */
  localPeerId: string;
  /** 6-char room code shared verbally / via text. */
  roomCode: string;
  /** Connected RTCPeerConnections keyed by remote peer ID. */
  peers: Map<string, RTCPeerConnection>;
  /** Open DataChannels keyed by remote peer ID. */
  dataChannels: Map<string, RTCDataChannel>;
  /** Whether this client created the room (i.e. is the relay host). */
  isHost: boolean;
}

/** Compact join manifest exchanged as a base64 blob (copy-paste signaling). */
export interface JoinManifest {
  schemaVersion: 2;
  type: 'join-offer' | 'join-answer';
  roomCode: string;
  /** The peer that generated this manifest. */
  fromPeerId: string;
  /** The peer this manifest is addressed to (for answer blobs). */
  toPeerId?: string;
  sdp: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Room creation
// ---------------------------------------------------------------------------

/**
 * Create a new mesh room. Call on the host side only.
 *
 * Returns a room code to share verbally / via any messaging app, and a
 * stable peer ID for this client. Neither is registered with any server —
 * they are purely mnemonic strings.
 */
export function createRoom(): { roomCode: string; localPeerId: string; mesh: MeshState } {
  const roomCode = generateRoomCode();
  const localPeerId = generatePeerId();
  const mesh: MeshState = {
    localPeerId,
    roomCode,
    peers: new Map(),
    dataChannels: new Map(),
    isHost: true,
  };
  return { roomCode, localPeerId, mesh };
}

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

/**
 * Joiner: create a mesh state and generate an SDP offer to send to the host.
 *
 * The joiner does not know any existing peers yet — they only know the room
 * code (shared verbally). The host will relay additional SDPs once connected.
 *
 * @param roomCode   6-char code shared by the host.
 * @returns          Mesh state + a base64 join manifest to send to the host.
 */
export async function generateJoinManifest(
  roomCode: string,
): Promise<{ mesh: MeshState; manifest: string; pc: RTCPeerConnection }> {
  const localPeerId = generatePeerId();
  const mesh: MeshState = {
    localPeerId,
    roomCode: roomCode.toUpperCase().trim(),
    peers: new Map(),
    dataChannels: new Map(),
    isHost: false,
  };

  // Create a peer connection toward the host.
  const pc = createPeerConnection();
  // DataChannel must be created before the offer so it is included in the SDP.
  pc.createDataChannel(MESH_DATA_CHANNEL, { ordered: false, maxRetransmits: 0 });

  const { sdp } = await createOffer(pc);

  const manifest = encodeManifest({
    schemaVersion: 2,
    type: 'join-offer',
    roomCode: mesh.roomCode,
    fromPeerId: localPeerId,
    sdp,
    createdAt: Date.now(),
  });

  return { mesh, manifest, pc };
}

/**
 * Host: receive a joiner's manifest, generate an SDP answer, register the
 * peer connection in the mesh, and return the answer manifest to send back.
 *
 * @param mesh         The host's MeshState (modified in place).
 * @param joinManifest Base64 manifest from the joiner.
 * @param onChannel    Called when the DataChannel with this peer opens.
 * @returns            Base64 answer manifest to send to the joiner, or null
 *                     if the manifest is invalid / room is full.
 */
export async function acceptJoinRequest(
  mesh: MeshState,
  joinManifest: string,
  onChannel: (peerId: string, channel: RTCDataChannel) => void,
): Promise<string | null> {
  const decoded = decodeManifest(joinManifest);
  if (!decoded || decoded.type !== 'join-offer') return null;
  if (decoded.roomCode !== mesh.roomCode) return null;
  if (mesh.peers.size >= MESH_MAX_PEERS - 1) return null; // host counts as 1

  const joinerPeerId = decoded.fromPeerId;

  const pc = createPeerConnection();
  mesh.peers.set(joinerPeerId, pc);

  // Receive the DataChannel from the joiner (who created it).
  pc.addEventListener('datachannel', (ev) => {
    const ch = ev.channel;
    ch.addEventListener('open', () => {
      mesh.dataChannels.set(joinerPeerId, ch);
      onChannel(joinerPeerId, ch);
    });
    ch.addEventListener('close', () => {
      mesh.dataChannels.delete(joinerPeerId);
    });
  });

  const answerSdp = await acceptOffer(pc, decoded.sdp);

  const manifest = encodeManifest({
    schemaVersion: 2,
    type: 'join-answer',
    roomCode: mesh.roomCode,
    fromPeerId: mesh.localPeerId,
    toPeerId: joinerPeerId,
    sdp: answerSdp,
    createdAt: Date.now(),
  });

  return manifest;
}

/**
 * Joiner: complete the handshake by applying the host's answer SDP.
 *
 * @param mesh          The joiner's MeshState (modified in place).
 * @param pc            The RTCPeerConnection created in generateJoinManifest.
 * @param answerManifest Base64 answer manifest from the host.
 * @param onChannel     Called when the DataChannel opens.
 * @returns             true on success, false if the manifest is invalid.
 */
export async function completeJoin(
  mesh: MeshState,
  pc: RTCPeerConnection,
  answerManifest: string,
  onChannel: (peerId: string, channel: RTCDataChannel) => void,
): Promise<boolean> {
  const decoded = decodeManifest(answerManifest);
  if (!decoded || decoded.type !== 'join-answer') return false;
  if (decoded.roomCode !== mesh.roomCode) return false;

  const hostPeerId = decoded.fromPeerId;
  mesh.peers.set(hostPeerId, pc);

  // Track the DataChannel we created (initiator side — it's on the pc).
  // Listen for its open event.
  const attachInitiatorChannel = () => {
    // The DataChannel was created inside createOffer; retrieve it by
    // listening for the 'datachannel' event on the pc. The initiator's own
    // channel will NOT fire 'datachannel' — we need to intercept it at
    // negotiationneeded/open time.
    // Workaround: store a reference via the negotiation event, or simply
    // track via the 'open' event fired on the channel we already created.
    //
    // Since RTCPeerConnection doesn't expose a list of local channels,
    // we use the connectionstatechange + a one-time open listener approach:
    // the channel is stored when the peer's DataChannel fires 'open'.
  };
  void attachInitiatorChannel;

  // For the joiner (initiator), listen for the channel to open via
  // the pc's existing internal channel. We can listen on 'datachannel'
  // events from the peer (but that won't fire for our own channel).
  // Instead, we rely on the host side: the joiner's channel is created by
  // the joiner and received by the host. The joiner listens on their own
  // RTCDataChannel object for 'open'.
  //
  // Since we don't have a direct reference to the DataChannel object here,
  // we use the 'datachannel' event which fires for *incoming* channels.
  // The joiner's *outgoing* channel is wired up in the PelotonRoom component
  // which holds the pc reference directly.

  try {
    await acceptAnswer(pc, decoded.sdp);
  } catch {
    mesh.peers.delete(hostPeerId);
    return false;
  }

  // Register a callback for the joiner's own DataChannel open.
  // We use a custom event approach: the component that owns 'pc' will
  // call onChannel once the channel opens. Register here so meshTopology
  // knows the peerId mapping.
  const setupChannel = (ch: RTCDataChannel) => {
    mesh.dataChannels.set(hostPeerId, ch);
    onChannel(hostPeerId, ch);
    ch.addEventListener('close', () => {
      mesh.dataChannels.delete(hostPeerId);
    });
  };

  // Expose the setup function via a custom property so PelotonRoom can call it.
  (pc as RTCPeerConnection & { _meshSetupChannel?: (ch: RTCDataChannel) => void })._meshSetupChannel = setupChannel;

  return true;
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

/**
 * Broadcast a binary message to ALL connected peers in the mesh.
 *
 * Fire-and-forget — skips channels that are not open.
 */
export function broadcastState(mesh: MeshState, encodedState: Uint8Array): void {
  for (const [, channel] of mesh.dataChannels) {
    if (channel.readyState === 'open') {
      try {
        channel.send(encodedState.slice());
      } catch {
        // Channel closed between readyState check and send — ignore.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Event subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to peer join events on the mesh.
 * The callback fires when a new DataChannel is added to mesh.dataChannels.
 *
 * Returns an unsubscribe function.
 *
 * Note: This is a polling-based subscription since RTCPeerConnection does not
 * emit JS custom events. For a full event system, wrap MeshState in a class
 * with EventTarget. For this wave, the PelotonRoom component tracks joins
 * directly via the onChannel callback passed to acceptJoinRequest / completeJoin.
 */
export function onPeerJoin(
  mesh: MeshState,
  callback: (peerId: string) => void,
): () => void {
  // Attach callback to the mesh so broadcastState callers can notify it.
  const joinCallbacks = getOrCreateCallbacks(mesh, 'join');
  joinCallbacks.add(callback);
  return () => joinCallbacks.delete(callback);
}

/**
 * Subscribe to peer leave events on the mesh.
 * Returns an unsubscribe function.
 */
export function onPeerLeave(
  mesh: MeshState,
  callback: (peerId: string) => void,
): () => void {
  const leaveCallbacks = getOrCreateCallbacks(mesh, 'leave');
  leaveCallbacks.add(callback);
  return () => leaveCallbacks.delete(callback);
}

/**
 * Emit a peer join event. Call this from the onChannel handler after
 * a DataChannel opens, so subscribers are notified.
 */
export function emitPeerJoin(mesh: MeshState, peerId: string): void {
  const callbacks = getMeshCallbacks(mesh, 'join');
  if (callbacks) {
    for (const cb of callbacks) cb(peerId);
  }
}

/**
 * Emit a peer leave event. Call this when a peer's connection closes.
 */
export function emitPeerLeave(mesh: MeshState, peerId: string): void {
  const callbacks = getMeshCallbacks(mesh, 'leave');
  if (callbacks) {
    for (const cb of callbacks) cb(peerId);
  }
  // Clean up peer references.
  mesh.peers.delete(peerId);
  mesh.dataChannels.delete(peerId);
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

/**
 * Close all peer connections in the mesh and clear state.
 */
export function closeMesh(mesh: MeshState): void {
  for (const [peerId, pc] of mesh.peers) {
    closeConnection(pc);
    emitPeerLeave(mesh, peerId);
  }
  mesh.peers.clear();
  mesh.dataChannels.clear();
  // Clear callback registries.
  const registry = getMeshCallbackRegistry(mesh);
  if (registry) {
    registry.clear();
  }
}

// ---------------------------------------------------------------------------
// Manifest encode / decode
// ---------------------------------------------------------------------------

export function encodeManifest(manifest: JoinManifest): string {
  const json = JSON.stringify(manifest);
  const bytes = new TextEncoder().encode(json);
  const binStr = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  return btoa(binStr);
}

export function decodeManifest(blob: string): JoinManifest | null {
  try {
    const b64 = blob.trim().replace(/-/g, '+').replace(/_/g, '/');
    const binStr = atob(b64);
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(json);
    return validateManifest(parsed);
  } catch {
    return null;
  }
}

function validateManifest(raw: unknown): JoinManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.schemaVersion !== 2) return null;
  if (m.type !== 'join-offer' && m.type !== 'join-answer') return null;
  if (typeof m.roomCode !== 'string' || !m.roomCode) return null;
  if (typeof m.fromPeerId !== 'string' || !m.fromPeerId) return null;
  if (typeof m.sdp !== 'string' || !m.sdp) return null;
  if (typeof m.createdAt !== 'number') return null;
  return m as unknown as JoinManifest;
}

// ---------------------------------------------------------------------------
// Room code generation
// ---------------------------------------------------------------------------

/**
 * Generate a 6-character room code from an unambiguous alphabet.
 * Not cryptographically unique — just memorable and unlikely to collide
 * among a small friend group (32^6 ≈ 1 billion combos).
 */
export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes)
    .map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length])
    .join('');
}

// ---------------------------------------------------------------------------
// Peer ID generation
// ---------------------------------------------------------------------------

export function generatePeerId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Internal callback registry (WeakMap-based, no GC pressure)
// ---------------------------------------------------------------------------

type CallbackEvent = 'join' | 'leave';

const callbackRegistry = new WeakMap<
  MeshState,
  Map<CallbackEvent, Set<(peerId: string) => void>>
>();

function getOrCreateCallbacks(
  mesh: MeshState,
  event: CallbackEvent,
): Set<(peerId: string) => void> {
  let registry = callbackRegistry.get(mesh);
  if (!registry) {
    registry = new Map();
    callbackRegistry.set(mesh, registry);
  }
  let callbacks = registry.get(event);
  if (!callbacks) {
    callbacks = new Set();
    registry.set(event, callbacks);
  }
  return callbacks;
}

function getMeshCallbacks(
  mesh: MeshState,
  event: CallbackEvent,
): Set<(peerId: string) => void> | undefined {
  return callbackRegistry.get(mesh)?.get(event);
}

function getMeshCallbackRegistry(
  mesh: MeshState,
): Map<CallbackEvent, Set<(peerId: string) => void>> | undefined {
  return callbackRegistry.get(mesh);
}
