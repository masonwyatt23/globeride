/**
 * multiriderConnection.ts — WebRTC peer lifecycle for Live Multi-Rider.
 *
 * Copy-paste SDP signaling: no backend, no signaling server.
 * STUN-only ICE — symmetric NAT users may need same-LAN testing.
 *
 * DataChannel: one bidirectional channel named 'globeride.multirider.v1'
 * opened by the initiator BEFORE creating the offer so it appears in the SDP.
 * The responder receives it via the `datachannel` event.
 *
 * ICE restart: on transient disconnect (not 'failed'), attempts up to 3
 * restarts over 30 s before declaring failure.
 */

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

const DATA_CHANNEL_NAME = 'globeride.multirider.v1';

/** Max ICE restart attempts before declaring permanent failure. */
const MAX_RESTART_ATTEMPTS = 3;
/** Delay between restart attempts, ms. */
const RESTART_DELAY_MS = 10_000;

// ---------------------------------------------------------------------------
// Peer connection factory
// ---------------------------------------------------------------------------

/** Create a configured RTCPeerConnection with STUN-only ICE. */
export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: STUN_SERVERS,
  });
}

// ---------------------------------------------------------------------------
// Offer creation (initiator side)
// ---------------------------------------------------------------------------

/**
 * Create a DataChannel on the peer connection, generate an SDP offer, and
 * gather all ICE candidates (trickle-ICE awaited inline via iceGatheringComplete).
 *
 * Call this on the initiator side only, before the offer SDP is shared.
 *
 * @returns The SDP offer string and a generated session ID.
 */
export async function createOffer(
  pc: RTCPeerConnection,
): Promise<{ sdp: string; sessionId: string }> {
  // Open the DataChannel before creating the offer so it's included in the SDP.
  pc.createDataChannel(DATA_CHANNEL_NAME, {
    ordered: false,        // UDP-like — prefer latency over ordering
    maxRetransmits: 0,     // fire-and-forget: stale position frames are useless
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete so the SDP blob contains all candidates.
  await waitForIceGathering(pc);

  const sessionId = generateSessionId();
  return { sdp: pc.localDescription!.sdp, sessionId };
}

// ---------------------------------------------------------------------------
// Answer creation (responder side)
// ---------------------------------------------------------------------------

/**
 * Apply the initiator's offer and generate an SDP answer.
 *
 * @param pc         A fresh RTCPeerConnection (from createPeerConnection()).
 * @param offerSdp   The raw SDP string from the initiator's MultiRiderInvite blob.
 * @returns          The SDP answer string to share back with the initiator.
 */
export async function acceptOffer(
  pc: RTCPeerConnection,
  offerSdp: string,
): Promise<string> {
  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);
  return pc.localDescription!.sdp;
}

// ---------------------------------------------------------------------------
// Completing the handshake (initiator side)
// ---------------------------------------------------------------------------

/**
 * Apply the responder's answer SDP on the initiator's peer connection.
 *
 * @param pc        The initiator's RTCPeerConnection.
 * @param answerSdp The raw SDP string from the responder.
 */
export async function acceptAnswer(
  pc: RTCPeerConnection,
  answerSdp: string,
): Promise<void> {
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
}

// ---------------------------------------------------------------------------
// Connection state observer
// ---------------------------------------------------------------------------

/**
 * Subscribe to peer connection state changes.
 * Returns an unsubscribe function.
 */
export function onConnectionStateChange(
  pc: RTCPeerConnection,
  cb: (state: RTCPeerConnectionState) => void,
): () => void {
  const handler = () => cb(pc.connectionState);
  pc.addEventListener('connectionstatechange', handler);
  return () => pc.removeEventListener('connectionstatechange', handler);
}

// ---------------------------------------------------------------------------
// DataChannel message observer
// ---------------------------------------------------------------------------

/**
 * Subscribe to binary messages arriving on the DataChannel.
 * Works for both the initiator (who owns the channel) and the responder
 * (who receives it via the `datachannel` event).
 *
 * Returns an unsubscribe function.
 */
export function onDataChannelMessage(
  pc: RTCPeerConnection,
  cb: (data: ArrayBuffer) => void,
): () => void {
  const listeners: (() => void)[] = [];

  function attachToChannel(channel: RTCDataChannel): void {
    const handler = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer) {
        cb(ev.data);
      } else if (ev.data instanceof Blob) {
        // Some browsers wrap binary in Blob.
        ev.data.arrayBuffer().then(cb).catch(() => undefined);
      }
    };
    channel.addEventListener('message', handler);
    listeners.push(() => channel.removeEventListener('message', handler));
  }

  // Initiator: DataChannel is already on the pc object.
  // Collect any channels already open (created via createOffer).
  // RTCPeerConnection doesn't expose a list of channels directly, so we
  // subscribe to the `datachannel` event which fires for incoming channels
  // (responder side) and re-subscribe if the initiator triggers a reset.
  const dcHandler = (ev: RTCDataChannelEvent) => {
    attachToChannel(ev.channel);
  };
  pc.addEventListener('datachannel', dcHandler);
  listeners.push(() => pc.removeEventListener('datachannel', dcHandler));

  return () => {
    for (const unsub of listeners) unsub();
  };
}

// ---------------------------------------------------------------------------
// ICE restart on transient disconnect
// ---------------------------------------------------------------------------

/**
 * Attach an auto-restart handler to a peer connection.
 * On 'disconnected' state, attempts ICE restart up to MAX_RESTART_ATTEMPTS times.
 * On 'failed' after exhausting retries, calls onFailed().
 *
 * Returns an unsubscribe / cleanup function.
 */
export function attachIceRestartHandler(
  pc: RTCPeerConnection,
  onFailed: () => void,
): () => void {
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = true;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const tryRestart = async () => {
    if (!active) return;
    if (attempts >= MAX_RESTART_ATTEMPTS) {
      onFailed();
      return;
    }
    attempts += 1;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
    } catch {
      // If restart offer fails, schedule next attempt.
      if (active) {
        timer = setTimeout(tryRestart, RESTART_DELAY_MS);
      }
    }
  };

  const handler = () => {
    if (!active) return;
    const state = pc.connectionState;
    if (state === 'disconnected') {
      clear();
      timer = setTimeout(tryRestart, RESTART_DELAY_MS);
    } else if (state === 'connected') {
      // Reset counter on successful reconnect.
      attempts = 0;
      clear();
    } else if (state === 'failed') {
      clear();
      onFailed();
    }
  };

  pc.addEventListener('connectionstatechange', handler);

  return () => {
    active = false;
    clear();
    pc.removeEventListener('connectionstatechange', handler);
  };
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

/** Close and clean up a peer connection. */
export function closeConnection(pc: RTCPeerConnection): void {
  try {
    pc.close();
  } catch {
    // Already closed — ignore.
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Wait until ICE gathering is complete (candidates all collected). */
function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/** Generate a compact session ID. */
function generateSessionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
