/**
 * multiriderCodec.ts — Binary state message encoding for the DataChannel.
 *
 * Three MESSAGE_TYPE opcodes (v2 adds senderPeerId header + ROOM_ANNOUNCE):
 *   0x01  BASELINE      — lat/lon baseline handshake (sent once per session)
 *   0x02  STATE         — per-frame rider state (sent at ~10 Hz)
 *   0x03  ROOM_ANNOUNCE — host broadcasts when a new peer joins the mesh
 *
 * v2 framing: a 1-byte MESSAGE_TYPE + 16-byte senderPeerId header prefix is
 * prepended to every frame. Legacy v1 receivers (Wave 29.A) will read the
 * MESSAGE_TYPE as the opcode — values 0x01 and 0x02 are unchanged, so a v1
 * decoder still dispatches correctly on the first byte. v2 decoders skip the
 * 17-byte header before reading the payload.
 *
 * v2 STATE frame (34 bytes total):
 *   [0]       u8   MESSAGE_TYPE = 0x02
 *   [1..16]   16B  senderPeerId (ASCII UUID, space-padded to 16 chars)
 *   [17..20]  u32  distance  (m, ×1)
 *   [21..22]  i16  deltaLat  (×1e5)
 *   [23..24]  i16  deltaLon  (×1e5)
 *   [25]      u8   heading   (0–255 → 0–2π)
 *   [26..27]  u16  power     (watts)
 *   [28]      u8   cadence   (rpm)
 *   [29]      u8   speed     (dm/s)
 *   [30..33]  u32  timestamp (unix seconds, lower 32 bits)
 *
 * v2 BASELINE frame (26 bytes):
 *   [0]       u8   MESSAGE_TYPE = 0x01
 *   [1..16]   16B  senderPeerId
 *   [17..20]  i32  baselineLat ×1e5
 *   [21..24]  i32  baselineLon ×1e5
 *
 * ROOM_ANNOUNCE frame (34 bytes):
 *   [0]       u8   MESSAGE_TYPE = 0x03
 *   [1..16]   16B  senderPeerId (host's peer ID)
 *   [17..32]  16B  newPeerId    (peer that just joined)
 *   [33]      u8   totalPeers   (current count including host)
 *
 * Backward-compatible path: if MESSAGE_TYPE is 0x01 or 0x02 and the buffer is
 * the legacy v1 length (9 or 18 bytes), the v1 decode path is used directly.
 */

/** v2 MESSAGE_TYPE opcode constants — exported for mesh consumers. */
export const MSG_TYPE_BASELINE = 0x01;
export const MSG_TYPE_STATE = 0x02;
export const MSG_TYPE_ROOM_ANNOUNCE = 0x03;

// Internal aliases kept for readability.
const OPCODE_BASELINE = MSG_TYPE_BASELINE;
const OPCODE_STATE = MSG_TYPE_STATE;

/** Byte length of the senderPeerId header field. */
const PEER_ID_BYTES = 16;
/** v2 header size: MESSAGE_TYPE (1) + senderPeerId (16). */
const V2_HEADER = 1 + PEER_ID_BYTES; // 17

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PeerStateMsg {
  /** Cumulative distance along the route, metres. */
  distance: number;
  /** WGS-84 latitude, decimal degrees. */
  lat: number;
  /** WGS-84 longitude, decimal degrees. */
  lon: number;
  /** Heading, radians clockwise from north (0–2π). */
  heading: number;
  /** Instantaneous power, watts. */
  power: number;
  /** Cadence, rpm. */
  cadence: number;
  /** Speed, m/s. */
  speed: number;
  /** Unix timestamp, ms. */
  timestamp: number;
}

/** Decoded v2 STATE message including the sender's peer ID. */
export interface PeerStateMsgV2 extends PeerStateMsg {
  senderPeerId: string;
}

/** Decoded ROOM_ANNOUNCE message. */
export interface RoomAnnounceMsg {
  /** Host's peer ID. */
  senderPeerId: string;
  /** Peer that just joined. */
  newPeerId: string;
  /** Total peer count (including host). */
  totalPeers: number;
}

// ---------------------------------------------------------------------------
// v2 Encoding
// ---------------------------------------------------------------------------

/**
 * Encode a PeerStateMsg into a 34-byte v2 STATE frame.
 *
 * @param state        Rider telemetry to encode.
 * @param baselineLat  Session baseline latitude for delta encoding.
 * @param baselineLon  Session baseline longitude for delta encoding.
 * @param senderPeerId This client's peer ID (truncated / padded to 16 ASCII bytes).
 */
export function encodePeerStateV2(
  state: PeerStateMsg,
  baselineLat: number,
  baselineLon: number,
  senderPeerId: string,
): Uint8Array {
  const buf = new Uint8Array(34);
  const view = new DataView(buf.buffer);

  view.setUint8(0, OPCODE_STATE);
  writePeerId(buf, 1, senderPeerId);

  view.setUint32(17, Math.max(0, Math.round(state.distance)), true);
  const dLat = Math.round((state.lat - baselineLat) * 1e5);
  const dLon = Math.round((state.lon - baselineLon) * 1e5);
  view.setInt16(21, clampI16(dLat), true);
  view.setInt16(23, clampI16(dLon), true);
  view.setUint8(25, Math.round((state.heading / (Math.PI * 2)) * 255) & 0xff);
  view.setUint16(26, Math.max(0, Math.min(65534, Math.round(state.power))), true);
  view.setUint8(28, Math.max(0, Math.min(254, Math.round(state.cadence))));
  view.setUint8(29, Math.max(0, Math.min(254, Math.round(state.speed * 10))));
  view.setUint32(30, Math.floor(state.timestamp / 1000) >>> 0, true);

  return buf;
}

/**
 * Decode a 34-byte v2 STATE frame.
 */
export function decodePeerStateV2(
  buf: Uint8Array,
  baselineLat: number,
  baselineLon: number,
): PeerStateMsgV2 {
  if (buf.length < 34) throw new Error(`v2 STATE buffer too short: ${buf.length}`);
  if (buf[0] !== OPCODE_STATE) throw new Error(`Expected MSG_TYPE 0x02, got 0x${buf[0].toString(16)}`);

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const senderPeerId = readPeerId(buf, 1);

  const distance = view.getUint32(17, true);
  const dLat = view.getInt16(21, true);
  const dLon = view.getInt16(23, true);
  const lat = baselineLat + dLat / 1e5;
  const lon = baselineLon + dLon / 1e5;
  const heading = (view.getUint8(25) / 255) * Math.PI * 2;
  const power = view.getUint16(26, true);
  const cadence = view.getUint8(28);
  const speed = view.getUint8(29) / 10;
  const timestamp = view.getUint32(30, true) * 1000;

  return { senderPeerId, distance, lat, lon, heading, power, cadence, speed, timestamp };
}

/**
 * Encode a v2 BASELINE frame (26 bytes).
 */
export function exchangeBaselineV2(
  localLat: number,
  localLon: number,
  senderPeerId: string,
): Uint8Array {
  const buf = new Uint8Array(26);
  const view = new DataView(buf.buffer);
  view.setUint8(0, OPCODE_BASELINE);
  writePeerId(buf, 1, senderPeerId);
  view.setInt32(17, Math.round(localLat * 1e5), true);
  view.setInt32(21, Math.round(localLon * 1e5), true);
  return buf;
}

/**
 * Decode a v2 BASELINE frame.
 * Returns { lat, lon, senderPeerId } or null.
 */
export function decodeBaselineV2(
  buf: Uint8Array,
): { lat: number; lon: number; senderPeerId: string } | null {
  if (buf.length < 26) return null;
  if (buf[0] !== OPCODE_BASELINE) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const senderPeerId = readPeerId(buf, 1);
  const lat = view.getInt32(17, true) / 1e5;
  const lon = view.getInt32(21, true) / 1e5;
  return { lat, lon, senderPeerId };
}

/**
 * Encode a ROOM_ANNOUNCE frame (34 bytes).
 *
 * @param hostPeerId   Host's peer ID.
 * @param newPeerId    Peer that just joined.
 * @param totalPeers   Current peer count (including host).
 */
export function encodeRoomAnnounce(
  hostPeerId: string,
  newPeerId: string,
  totalPeers: number,
): Uint8Array {
  const buf = new Uint8Array(34);
  buf[0] = MSG_TYPE_ROOM_ANNOUNCE;
  writePeerId(buf, 1, hostPeerId);
  writePeerId(buf, 17, newPeerId);
  buf[33] = Math.max(0, Math.min(255, totalPeers));
  return buf;
}

/**
 * Decode a ROOM_ANNOUNCE frame.
 * Returns null if the buffer is not a valid ROOM_ANNOUNCE frame.
 */
export function decodeRoomAnnounce(buf: Uint8Array): RoomAnnounceMsg | null {
  if (buf.length < 34) return null;
  if (buf[0] !== MSG_TYPE_ROOM_ANNOUNCE) return null;
  const senderPeerId = readPeerId(buf, 1);
  const newPeerId = readPeerId(buf, 17);
  const totalPeers = buf[33];
  return { senderPeerId, newPeerId, totalPeers };
}

// ---------------------------------------------------------------------------
// v1 Encoding (preserved — backward-compatible with Wave 29.A)
// ---------------------------------------------------------------------------

/**
 * Encode a PeerStateMsg into an 18-byte v1 Uint8Array for DataChannel transmission.
 *
 * lat/lon are stored as i16 deltas (×1e5) from the session baseline.
 * The precision is ~1.1 m per unit at the equator — good enough for avatar rendering.
 * Maximum drift from baseline: ±32767 / 1e5 ≈ ±0.33° ≈ ±36 km.
 */
export function encodePeerState(
  state: PeerStateMsg,
  baselineLat: number,
  baselineLon: number,
): Uint8Array {
  const buf = new Uint8Array(18);
  const view = new DataView(buf.buffer);

  view.setUint8(0, OPCODE_STATE);
  view.setUint32(1, Math.max(0, Math.round(state.distance)), true);
  const dLat = Math.round((state.lat - baselineLat) * 1e5);
  const dLon = Math.round((state.lon - baselineLon) * 1e5);
  view.setInt16(5, clampI16(dLat), true);
  view.setInt16(7, clampI16(dLon), true);
  view.setUint8(9, Math.round((state.heading / (Math.PI * 2)) * 255) & 0xff);
  view.setUint16(10, Math.max(0, Math.min(65534, Math.round(state.power))), true);
  view.setUint8(12, Math.max(0, Math.min(254, Math.round(state.cadence))));
  view.setUint8(13, Math.max(0, Math.min(254, Math.round(state.speed * 10))));
  view.setUint32(14, Math.floor(state.timestamp / 1000) >>> 0, true);

  return buf;
}

/**
 * Decode an 18-byte v1 STATE buffer back into a PeerStateMsg.
 */
export function decodePeerState(
  buf: Uint8Array,
  baselineLat: number,
  baselineLon: number,
): PeerStateMsg {
  if (buf.length < 18) throw new Error(`STATE buffer too short: ${buf.length}`);
  if (buf[0] !== OPCODE_STATE) throw new Error(`Expected opcode 0x02, got 0x${buf[0].toString(16)}`);

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const distance = view.getUint32(1, true);
  const dLat = view.getInt16(5, true);
  const dLon = view.getInt16(7, true);
  const lat = baselineLat + dLat / 1e5;
  const lon = baselineLon + dLon / 1e5;
  const headingRaw = view.getUint8(9);
  const heading = (headingRaw / 255) * Math.PI * 2;
  const power = view.getUint16(10, true);
  const cadence = view.getUint8(12);
  const speedDms = view.getUint8(13);
  const speed = speedDms / 10;
  const tsRaw = view.getUint32(14, true);
  const timestamp = tsRaw * 1000;

  return { distance, lat, lon, heading, power, cadence, speed, timestamp };
}

// ---------------------------------------------------------------------------
// Baseline handshake (v1 — preserved)
// ---------------------------------------------------------------------------

/**
 * Encode a v1 BASELINE handshake message (9 bytes).
 */
export function exchangeBaseline(
  localLat: number,
  localLon: number,
): Uint8Array {
  const buf = new Uint8Array(9);
  const view = new DataView(buf.buffer);
  view.setUint8(0, OPCODE_BASELINE);
  view.setInt32(1, Math.round(localLat * 1e5), true);
  view.setInt32(5, Math.round(localLon * 1e5), true);
  return buf;
}

/**
 * Decode a v1 BASELINE handshake message.
 * Returns { lat, lon } or null.
 */
export function decodeBaseline(
  buf: Uint8Array,
): { lat: number; lon: number } | null {
  if (buf.length < 9) return null;
  if (buf[0] !== OPCODE_BASELINE) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const lat = view.getInt32(1, true) / 1e5;
  const lon = view.getInt32(5, true) / 1e5;
  return { lat, lon };
}

/**
 * Returns the MESSAGE_TYPE opcode of a raw DataChannel message, or null.
 * Use to dispatch between BASELINE, STATE, and ROOM_ANNOUNCE frames.
 */
export function getOpcode(buf: Uint8Array): number | null {
  if (buf.length === 0) return null;
  return buf[0];
}

/**
 * Detect whether a buffer uses v2 framing (length ≥ 26 for BASELINE,
 * 34 for STATE/ROOM_ANNOUNCE) vs v1.
 */
export function isV2Frame(buf: Uint8Array): boolean {
  if (buf.length === 0) return false;
  const opcode = buf[0];
  if (opcode === MSG_TYPE_BASELINE) return buf.length >= 26;
  if (opcode === MSG_TYPE_STATE) return buf.length >= 34;
  if (opcode === MSG_TYPE_ROOM_ANNOUNCE) return buf.length >= 34;
  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a number to the i16 range. */
function clampI16(n: number): number {
  return Math.max(-32768, Math.min(32767, n));
}

/**
 * Write a peer ID into a buffer at the given offset.
 * The peer ID is truncated or space-padded to exactly PEER_ID_BYTES bytes.
 */
function writePeerId(buf: Uint8Array, offset: number, peerId: string): void {
  // Use only the first PEER_ID_BYTES ASCII characters (UUID is 36 chars but
  // we store the first 16 — enough to uniquely identify within a 4-peer mesh).
  const trimmed = peerId.replace(/-/g, '').slice(0, PEER_ID_BYTES);
  for (let i = 0; i < PEER_ID_BYTES; i++) {
    buf[offset + i] = i < trimmed.length ? trimmed.charCodeAt(i) : 0x20; // space pad
  }
}

/**
 * Read a peer ID from a buffer at the given offset.
 * Returns the trimmed ASCII string.
 */
function readPeerId(buf: Uint8Array, offset: number): string {
  let result = '';
  for (let i = 0; i < PEER_ID_BYTES; i++) {
    result += String.fromCharCode(buf[offset + i]);
  }
  return result.trimEnd();
}

// Re-export header constants for external use.
export { V2_HEADER, PEER_ID_BYTES };
