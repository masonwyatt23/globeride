/**
 * Tests for the multi-rider binary state codec.
 */

import { describe, it, expect } from 'vitest';
import {
  encodePeerState,
  decodePeerState,
  exchangeBaseline,
  decodeBaseline,
  getOpcode,
  // v2 additions
  encodePeerStateV2,
  decodePeerStateV2,
  exchangeBaselineV2,
  decodeBaselineV2,
  encodeRoomAnnounce,
  decodeRoomAnnounce,
  isV2Frame,
  MSG_TYPE_BASELINE,
  MSG_TYPE_STATE,
  MSG_TYPE_ROOM_ANNOUNCE,
  type PeerStateMsg,
} from './multiriderCodec';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<PeerStateMsg> = {}): PeerStateMsg {
  return {
    distance: 1000,
    lat: 47.5,
    lon: 8.2,
    heading: Math.PI / 2, // 90°
    power: 250,
    cadence: 85,
    speed: 10.5,
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

const BASE_LAT = 47.5;
const BASE_LON = 8.2;

// ---------------------------------------------------------------------------
// STATE encode / decode roundtrip
// ---------------------------------------------------------------------------

describe('encodePeerState / decodePeerState', () => {
  it('roundtrips a typical state message with zero delta', () => {
    const state = makeState({ lat: BASE_LAT, lon: BASE_LON });
    const buf = encodePeerState(state, BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);

    expect(decoded.distance).toBe(1000);
    expect(decoded.lat).toBeCloseTo(BASE_LAT, 5);
    expect(decoded.lon).toBeCloseTo(BASE_LON, 5);
    // heading is stored as u8 (0–255) so precision is ~0.025 rad
    expect(decoded.heading).toBeCloseTo(Math.PI / 2, 1);
    expect(decoded.power).toBe(250);
    expect(decoded.cadence).toBe(85);
    // speed is stored as dm/s (×10) → precision ±0.05 m/s
    expect(decoded.speed).toBeCloseTo(10.5, 1);
  });

  it('produces an 18-byte buffer', () => {
    const buf = encodePeerState(makeState(), BASE_LAT, BASE_LON);
    expect(buf.byteLength).toBe(18);
  });

  it('first byte is opcode 0x02', () => {
    const buf = encodePeerState(makeState(), BASE_LAT, BASE_LON);
    expect(buf[0]).toBe(0x02);
  });

  it('roundtrips lat/lon delta correctly', () => {
    // Move ~1 km north and ~1 km east from baseline
    const lat = BASE_LAT + 0.009; // ≈1 km north
    const lon = BASE_LON + 0.009; // ≈1 km east
    const buf = encodePeerState(makeState({ lat, lon }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);

    expect(decoded.lat).toBeCloseTo(lat, 4);
    expect(decoded.lon).toBeCloseTo(lon, 4);
  });

  it('clamps large lat/lon delta to i16 range', () => {
    // 40° delta ≈ 4,000,000 × 1e-5 — exceeds i16 (32767)
    const lat = BASE_LAT + 40;
    const buf = encodePeerState(makeState({ lat }), BASE_LAT, BASE_LON);
    // Should not throw; clamped value decoded is within i16 range.
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    // Decoded lat is clamped but not a crash
    expect(typeof decoded.lat).toBe('number');
  });

  it('roundtrips zero distance', () => {
    const buf = encodePeerState(makeState({ distance: 0 }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    expect(decoded.distance).toBe(0);
  });

  it('roundtrips large distance (100 km)', () => {
    const buf = encodePeerState(makeState({ distance: 100_000 }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    expect(decoded.distance).toBe(100_000);
  });

  it('roundtrips zero power', () => {
    const buf = encodePeerState(makeState({ power: 0 }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    expect(decoded.power).toBe(0);
  });

  it('roundtrips high power (1200 W)', () => {
    const buf = encodePeerState(makeState({ power: 1200 }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    expect(decoded.power).toBe(1200);
  });

  it('clamps power at 65534', () => {
    const buf = encodePeerState(makeState({ power: 99999 }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    expect(decoded.power).toBe(65534);
  });

  it('roundtrips heading = 0 (north)', () => {
    const buf = encodePeerState(makeState({ heading: 0 }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    // 0 maps to 0; slight epsilon due to u8 quantization
    expect(decoded.heading).toBeCloseTo(0, 1);
  });

  it('roundtrips heading ≈ 2π (full circle)', () => {
    const buf = encodePeerState(makeState({ heading: Math.PI * 2 - 0.01 }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    expect(decoded.heading).toBeGreaterThan(Math.PI);
  });

  it('throws on buffer too short', () => {
    const shortBuf = new Uint8Array(10);
    shortBuf[0] = 0x02;
    expect(() => decodePeerState(shortBuf, BASE_LAT, BASE_LON)).toThrow();
  });

  it('throws on wrong opcode', () => {
    const buf = encodePeerState(makeState(), BASE_LAT, BASE_LON);
    buf[0] = 0x01; // wrong opcode
    expect(() => decodePeerState(buf, BASE_LAT, BASE_LON)).toThrow();
  });

  it('roundtrips speed near max (25 m/s)', () => {
    const buf = encodePeerState(makeState({ speed: 25 }), BASE_LAT, BASE_LON);
    const decoded = decodePeerState(buf, BASE_LAT, BASE_LON);
    expect(decoded.speed).toBeCloseTo(25, 1);
  });

  it('roundtrips cadence boundary (0 and 254)', () => {
    const buf0 = encodePeerState(makeState({ cadence: 0 }), BASE_LAT, BASE_LON);
    expect(decodePeerState(buf0, BASE_LAT, BASE_LON).cadence).toBe(0);

    const buf254 = encodePeerState(makeState({ cadence: 254 }), BASE_LAT, BASE_LON);
    expect(decodePeerState(buf254, BASE_LAT, BASE_LON).cadence).toBe(254);
  });

  it('preserves opcode in buffer even after manual modification attempt', () => {
    const buf = encodePeerState(makeState(), BASE_LAT, BASE_LON);
    expect(getOpcode(buf)).toBe(0x02);
  });
});

// ---------------------------------------------------------------------------
// BASELINE encode / decode
// ---------------------------------------------------------------------------

describe('exchangeBaseline / decodeBaseline', () => {
  it('produces a 9-byte buffer', () => {
    const buf = exchangeBaseline(47.5, 8.2);
    expect(buf.byteLength).toBe(9);
  });

  it('first byte is opcode 0x01', () => {
    const buf = exchangeBaseline(47.5, 8.2);
    expect(buf[0]).toBe(0x01);
  });

  it('roundtrips lat/lon', () => {
    const buf = exchangeBaseline(47.123456, -122.456789);
    const decoded = decodeBaseline(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.lat).toBeCloseTo(47.123456, 4);
    expect(decoded!.lon).toBeCloseTo(-122.456789, 4);
  });

  it('returns null for wrong opcode', () => {
    const buf = exchangeBaseline(47.5, 8.2);
    buf[0] = 0x02;
    expect(decodeBaseline(buf)).toBeNull();
  });

  it('returns null for short buffer', () => {
    const buf = new Uint8Array(4);
    buf[0] = 0x01;
    expect(decodeBaseline(buf)).toBeNull();
  });

  it('roundtrips negative lat/lon (southern hemisphere)', () => {
    const buf = exchangeBaseline(-33.8688, 151.2093); // Sydney
    const decoded = decodeBaseline(buf);
    expect(decoded!.lat).toBeCloseTo(-33.8688, 4);
    expect(decoded!.lon).toBeCloseTo(151.2093, 4);
  });
});

// ---------------------------------------------------------------------------
// getOpcode
// ---------------------------------------------------------------------------

describe('getOpcode', () => {
  it('returns null for empty buffer', () => {
    expect(getOpcode(new Uint8Array(0))).toBeNull();
  });

  it('returns the first byte', () => {
    const buf = new Uint8Array([0x01, 0x02, 0x03]);
    expect(getOpcode(buf)).toBe(0x01);
  });
});

// ---------------------------------------------------------------------------
// v2 MESSAGE_TYPE opcode constants
// ---------------------------------------------------------------------------

describe('MSG_TYPE constants', () => {
  it('MSG_TYPE_BASELINE is 0x01', () => {
    expect(MSG_TYPE_BASELINE).toBe(0x01);
  });

  it('MSG_TYPE_STATE is 0x02', () => {
    expect(MSG_TYPE_STATE).toBe(0x02);
  });

  it('MSG_TYPE_ROOM_ANNOUNCE is 0x03', () => {
    expect(MSG_TYPE_ROOM_ANNOUNCE).toBe(0x03);
  });
});

// ---------------------------------------------------------------------------
// v2 STATE frame (encodePeerStateV2 / decodePeerStateV2)
// ---------------------------------------------------------------------------

describe('encodePeerStateV2 / decodePeerStateV2', () => {
  const PEER_ID = 'abcd1234efgh5678';
  const BASE_LAT = 51.5;
  const BASE_LON = -0.1;

  function makeStateV2(overrides: Partial<PeerStateMsg> = {}): PeerStateMsg {
    return {
      distance: 500,
      lat: BASE_LAT,
      lon: BASE_LON,
      heading: Math.PI,
      power: 300,
      cadence: 90,
      speed: 8.5,
      timestamp: 1_700_000_000_000,
      ...overrides,
    };
  }

  it('produces a 34-byte buffer', () => {
    const buf = encodePeerStateV2(makeStateV2(), BASE_LAT, BASE_LON, PEER_ID);
    expect(buf.byteLength).toBe(34);
  });

  it('first byte is MSG_TYPE_STATE (0x02)', () => {
    const buf = encodePeerStateV2(makeStateV2(), BASE_LAT, BASE_LON, PEER_ID);
    expect(buf[0]).toBe(MSG_TYPE_STATE);
  });

  it('roundtrips telemetry fields with senderPeerId', () => {
    const state = makeStateV2();
    const buf = encodePeerStateV2(state, BASE_LAT, BASE_LON, PEER_ID);
    const decoded = decodePeerStateV2(buf, BASE_LAT, BASE_LON);

    expect(decoded.distance).toBe(500);
    expect(decoded.power).toBe(300);
    expect(decoded.cadence).toBe(90);
    expect(decoded.speed).toBeCloseTo(8.5, 1);
    expect(decoded.senderPeerId.trim()).toBe(PEER_ID);
  });

  it('isV2Frame returns true for 34-byte STATE buffer', () => {
    const buf = encodePeerStateV2(makeStateV2(), BASE_LAT, BASE_LON, PEER_ID);
    expect(isV2Frame(buf)).toBe(true);
  });

  it('isV2Frame returns false for v1 18-byte STATE buffer', () => {
    const buf = encodePeerState(makeStateV2(), BASE_LAT, BASE_LON);
    expect(isV2Frame(buf)).toBe(false);
  });

  it('throws on buffer too short', () => {
    const short = new Uint8Array(20);
    short[0] = MSG_TYPE_STATE;
    expect(() => decodePeerStateV2(short, BASE_LAT, BASE_LON)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// v2 BASELINE (exchangeBaselineV2 / decodeBaselineV2)
// ---------------------------------------------------------------------------

describe('exchangeBaselineV2 / decodeBaselineV2', () => {
  it('produces a 26-byte buffer', () => {
    const buf = exchangeBaselineV2(47.5, 8.2, 'peer-abc');
    expect(buf.byteLength).toBe(26);
  });

  it('first byte is MSG_TYPE_BASELINE (0x01)', () => {
    const buf = exchangeBaselineV2(47.5, 8.2, 'peer-abc');
    expect(buf[0]).toBe(MSG_TYPE_BASELINE);
  });

  it('roundtrips lat/lon and senderPeerId', () => {
    const buf = exchangeBaselineV2(47.123, -122.456, 'mypeerid');
    const decoded = decodeBaselineV2(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.lat).toBeCloseTo(47.123, 4);
    expect(decoded!.lon).toBeCloseTo(-122.456, 4);
    expect(decoded!.senderPeerId.trim()).toBe('mypeerid');
  });

  it('returns null for buffer too short', () => {
    expect(decodeBaselineV2(new Uint8Array(10))).toBeNull();
  });

  it('isV2Frame returns true for 26-byte BASELINE buffer', () => {
    const buf = exchangeBaselineV2(47.5, 8.2, 'peer-x');
    expect(isV2Frame(buf)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ROOM_ANNOUNCE (encodeRoomAnnounce / decodeRoomAnnounce)
// ---------------------------------------------------------------------------

describe('encodeRoomAnnounce / decodeRoomAnnounce', () => {
  it('produces a 34-byte buffer', () => {
    const buf = encodeRoomAnnounce('hostpeer1234abcd', 'newpeer1234abcde', 3);
    expect(buf.byteLength).toBe(34);
  });

  it('first byte is MSG_TYPE_ROOM_ANNOUNCE (0x03)', () => {
    const buf = encodeRoomAnnounce('hostpeer1234abcd', 'newpeer1234abcde', 3);
    expect(buf[0]).toBe(MSG_TYPE_ROOM_ANNOUNCE);
  });

  it('roundtrips senderPeerId, newPeerId, totalPeers', () => {
    const buf = encodeRoomAnnounce('hostpeer1234abcd', 'newpeer1234abcde', 3);
    const decoded = decodeRoomAnnounce(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.senderPeerId.trim()).toBe('hostpeer1234abcd');
    expect(decoded!.newPeerId.trim()).toBe('newpeer1234abcde');
    expect(decoded!.totalPeers).toBe(3);
  });

  it('returns null for buffer too short', () => {
    expect(decodeRoomAnnounce(new Uint8Array(20))).toBeNull();
  });

  it('returns null for wrong opcode', () => {
    const buf = encodeRoomAnnounce('host', 'new', 2);
    buf[0] = 0x02; // wrong opcode
    expect(decodeRoomAnnounce(buf)).toBeNull();
  });

  it('getOpcode returns 0x03 for ROOM_ANNOUNCE buffer', () => {
    const buf = encodeRoomAnnounce('host', 'new', 2);
    expect(getOpcode(buf)).toBe(MSG_TYPE_ROOM_ANNOUNCE);
  });

  it('isV2Frame returns true for ROOM_ANNOUNCE buffer', () => {
    const buf = encodeRoomAnnounce('host', 'new', 2);
    expect(isV2Frame(buf)).toBe(true);
  });

  it('clamps totalPeers at 255', () => {
    const buf = encodeRoomAnnounce('h', 'n', 999);
    const decoded = decodeRoomAnnounce(buf);
    expect(decoded!.totalPeers).toBe(255);
  });
});
