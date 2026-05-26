/**
 * multiriderCodec.ts — Binary state message encoding for the DataChannel.
 *
 * Two message opcodes:
 *   0x01  BASELINE  — lat/lon baseline handshake (sent once per session)
 *   0x02  STATE     — per-frame rider state (sent at ~10 Hz)
 *
 * STATE frame layout (little-endian, 18 bytes after the 1-byte opcode):
 *   [0]       u8   opcode = 0x02
 *   [1..4]    u32  distance  (m, ×1 — integer metres)
 *   [5..6]    i16  deltaLat  (×1e5 arc-degrees relative to baselineLat)
 *   [7..8]    i16  deltaLon  (×1e5 arc-degrees relative to baselineLon)
 *   [9]       u8   heading   (0–255 linearly maps to 0–2π radians)
 *   [10..11]  u16  power     (watts, capped at 65534)
 *   [12]      u8   cadence   (rpm, capped at 254)
 *   [13]      u8   speed     (dm/s i.e. ×10, capped at 254 → max 25.4 m/s = 91 km/h)
 *   [14..17]  u32  timestamp (unix seconds, lower 32 bits)
 * Total: 18 bytes
 *
 * BASELINE frame layout (9 bytes after opcode):
 *   [0]      u8   opcode = 0x01
 *   [1..4]   i32  baselineLat ×1e5 (integer arc-degrees)
 *   [5..8]   i32  baselineLon ×1e5
 * Total: 9 bytes
 */

const OPCODE_BASELINE = 0x01;
const OPCODE_STATE = 0x02;

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

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * Encode a PeerStateMsg into an 18-byte Uint8Array for DataChannel transmission.
 *
 * lat/lon are stored as i16 deltas (×1e5) from the session baseline.
 * The precision is ~1.1 m per unit at the equator — good enough for avatar rendering.
 * Maximum drift from baseline: ±32767 / 1e5 ≈ ±0.33° ≈ ±36 km. Routes longer
 * than ~36 km from the baseline point will wrap; for those, the baseline should
 * be updated via a new BASELINE handshake (not yet implemented — sufficient for MVP).
 */
export function encodePeerState(
  state: PeerStateMsg,
  baselineLat: number,
  baselineLon: number,
): Uint8Array {
  const buf = new Uint8Array(18);
  const view = new DataView(buf.buffer);

  view.setUint8(0, OPCODE_STATE);
  // distance: integer metres, u32
  view.setUint32(1, Math.max(0, Math.round(state.distance)), true);
  // deltaLat / deltaLon: i16, ×1e5 precision
  const dLat = Math.round((state.lat - baselineLat) * 1e5);
  const dLon = Math.round((state.lon - baselineLon) * 1e5);
  view.setInt16(5, clampI16(dLat), true);
  view.setInt16(7, clampI16(dLon), true);
  // heading: u8, 0–255 maps to 0–2π
  view.setUint8(9, Math.round((state.heading / (Math.PI * 2)) * 255) & 0xff);
  // power: u16, watts
  view.setUint16(10, Math.max(0, Math.min(65534, Math.round(state.power))), true);
  // cadence: u8, rpm
  view.setUint8(12, Math.max(0, Math.min(254, Math.round(state.cadence))));
  // speed: u8 in dm/s (×10), max 25.4 m/s
  view.setUint8(13, Math.max(0, Math.min(254, Math.round(state.speed * 10))));
  // timestamp: u32, unix seconds (lower 32 bits)
  view.setUint32(14, Math.floor(state.timestamp / 1000) >>> 0, true);

  return buf;
}

/**
 * Decode an 18-byte STATE buffer back into a PeerStateMsg.
 *
 * @param buf          The raw ArrayBuffer or Uint8Array from the DataChannel.
 * @param baselineLat  Session baseline latitude for delta decoding.
 * @param baselineLon  Session baseline longitude for delta decoding.
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
  // Reconstruct ms timestamp from 32-bit seconds (wrap-safe for ±68 years from epoch).
  const timestamp = tsRaw * 1000;

  return { distance, lat, lon, heading, power, cadence, speed, timestamp };
}

// ---------------------------------------------------------------------------
// Baseline handshake
// ---------------------------------------------------------------------------

/**
 * Encode a BASELINE handshake message (9 bytes).
 * Both peers must exchange baselines at session start so delta encoding works.
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
 * Decode a BASELINE handshake message.
 * Returns { lat, lon } in decimal degrees, or null if not a baseline frame.
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
 * Returns the opcode of a raw DataChannel message, or null if the buffer
 * is too short. Use to dispatch between BASELINE and STATE frames.
 */
export function getOpcode(buf: Uint8Array): number | null {
  if (buf.length === 0) return null;
  return buf[0];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a number to the i16 range. */
function clampI16(n: number): number {
  return Math.max(-32768, Math.min(32767, n));
}
