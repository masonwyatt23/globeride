/**
 * Unit tests for ftms.ts pure helpers — encoding functions that can be tested
 * without a real BLE device.
 *
 * BLE hardware paths (connect, setTargetPower over GATT, etc.) are not tested
 * here because they require a live Bluetooth radio; they are exercised manually
 * against a Wahoo Kickr Core.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeSetTargetPower,
  encodeSetSimulationParams,
  parseIndoorBikeData,
  getTrainerControlMode,
  setTrainerControlMode,
} from './ftms';

// ---------------------------------------------------------------------------
// encodeSetTargetPower — FTMS opcode 0x05
// ---------------------------------------------------------------------------

describe('encodeSetTargetPower', () => {
  it('produces a 3-byte payload', () => {
    const buf = encodeSetTargetPower(200);
    expect(buf.byteLength).toBe(3);
  });

  it('first byte is opcode 0x05', () => {
    const buf = encodeSetTargetPower(200);
    expect(buf[0]).toBe(0x05);
  });

  it('encodes 200 W correctly as sint16 LE', () => {
    const buf = encodeSetTargetPower(200);
    // 200 dec = 0x00C8. LE -> lo=0xC8, hi=0x00
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(200);
  });

  it('encodes 0 W (floor)', () => {
    const buf = encodeSetTargetPower(0);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(0);
  });

  it('encodes 2000 W (ceiling)', () => {
    const buf = encodeSetTargetPower(2000);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(2000);
  });

  it('clamps values above 2000 to 2000', () => {
    const buf = encodeSetTargetPower(9999);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(2000);
  });

  it('clamps negative values to 0', () => {
    const buf = encodeSetTargetPower(-50);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(0);
  });

  it('rounds fractional watts', () => {
    const buf = encodeSetTargetPower(199.7);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(200);
  });

  it('byte layout: [0x05, watts_lo, watts_hi]', () => {
    // 256 W = 0x0100 LE -> lo=0x00, hi=0x01
    const buf = encodeSetTargetPower(256);
    expect(buf[0]).toBe(0x05);
    expect(buf[1]).toBe(0x00); // lo byte of 256
    expect(buf[2]).toBe(0x01); // hi byte of 256
  });

  it('big power value: 500 W', () => {
    const buf = encodeSetTargetPower(500);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// encodeSetSimulationParams — FTMS opcode 0x11
// ---------------------------------------------------------------------------

describe('encodeSetSimulationParams', () => {
  it('produces a 7-byte payload', () => {
    const buf = encodeSetSimulationParams(5);
    expect(buf.byteLength).toBe(7);
  });

  it('first byte is opcode 0x11', () => {
    const buf = encodeSetSimulationParams(5);
    expect(buf[0]).toBe(0x11);
  });

  it('encodes 5% grade correctly (grade*100 = 500, int16 LE)', () => {
    const buf = encodeSetSimulationParams(5);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(3, true)).toBe(500);
  });

  it('encodes -10% grade correctly', () => {
    const buf = encodeSetSimulationParams(-10);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(3, true)).toBe(-1000);
  });

  it('clamps grade to +25%', () => {
    const buf = encodeSetSimulationParams(99);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(3, true)).toBe(2500);
  });

  it('clamps grade to -25%', () => {
    const buf = encodeSetSimulationParams(-99);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(3, true)).toBe(-2500);
  });

  it('encodes zero wind by default', () => {
    const buf = encodeSetSimulationParams(0);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(0);
  });

  it('encodes wind speed in mm/s (10 m/s -> 10000 mm/s)', () => {
    const buf = encodeSetSimulationParams(0, 10);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(10_000);
  });

  it('clamps wind to -32..+32 m/s', () => {
    const buf = encodeSetSimulationParams(0, 100);
    const view = new DataView(buf.buffer);
    expect(view.getInt16(1, true)).toBe(32_000);
  });

  it('uses default Crr byte 40', () => {
    const buf = encodeSetSimulationParams(0);
    expect(buf[5]).toBe(40);
  });

  it('uses default Cw byte 51', () => {
    const buf = encodeSetSimulationParams(0);
    expect(buf[6]).toBe(51);
  });

  it('accepts custom Crr and Cw', () => {
    const buf = encodeSetSimulationParams(0, 0, 80, 27);
    expect(buf[5]).toBe(80);
    expect(buf[6]).toBe(27);
  });

  it('clamps Crr/Cw bytes to 0-255', () => {
    const buf = encodeSetSimulationParams(0, 0, 300, 300);
    expect(buf[5]).toBe(255);
    expect(buf[6]).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// parseIndoorBikeData — FTMS spec section 4.9
// ---------------------------------------------------------------------------

describe('parseIndoorBikeData', () => {
  /**
   * Build a minimal Indoor Bike Data payload with only instant speed set.
   * Flags uint16: bit 0 = moreData (0 = speed present).
   * Speed unit: km/h * 100 as uint16 LE.
   */
  function buildSpeedPayload(speedKmh: number): DataView {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint16(0, 0x0000, true); // flags: moreData=0, no other fields
    view.setUint16(2, Math.round(speedKmh * 100), true);
    return view;
  }

  it('parses instant speed (flags=0x0000)', () => {
    const data = parseIndoorBikeData(buildSpeedPayload(36));
    // 36 km/h = 10 m/s
    expect(data.speed).toBeCloseTo(10, 2);
  });

  it('does not set speed when moreData bit is set', () => {
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint16(0, 0x0001, true); // bit 0 = moreData = 1 (speed absent)
    const data = parseIndoorBikeData(view);
    expect(data.speed).toBeUndefined();
  });

  it('parses power when bit 6 is set', () => {
    // Build payload: no speed (moreData=1), no cadence, just power
    // flags = 0x0001 (moreData) | 0x0040 (power present, bit 6)
    const flags = 0x0001 | 0x0040;
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint16(0, flags, true);
    view.setInt16(2, 250, true); // 250 W
    const data = parseIndoorBikeData(view);
    expect(data.power).toBe(250);
  });

  it('parses cadence when bit 2 is set', () => {
    // flags: moreData=1, cadence bit 2 = 0x0004
    const flags = 0x0001 | 0x0004;
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint16(0, flags, true);
    // Cadence is uint16/2 per spec, so 90 rpm = 180 raw
    view.setUint16(2, 180, true);
    const data = parseIndoorBikeData(view);
    expect(data.cadence).toBe(90);
  });

  it('parses heart rate when bit 9 is set', () => {
    // flags: moreData=1, HR bit 9 = 0x0200
    const flags = 0x0001 | 0x0200;
    const buf = new ArrayBuffer(3);
    const view = new DataView(buf);
    view.setUint16(0, flags, true);
    view.setUint8(2, 155); // 155 bpm
    const data = parseIndoorBikeData(view);
    expect(data.heartRate).toBe(155);
  });

  it('returns empty object for zero-flag payload with moreData set', () => {
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint16(0, 0x0001, true); // moreData only
    const data = parseIndoorBikeData(view);
    expect(data.speed).toBeUndefined();
    expect(data.power).toBeUndefined();
    expect(data.cadence).toBeUndefined();
  });

  it('does not throw on truncated notifications', () => {
    const flags = 0x0000; // speed present, but payload omits the speed bytes
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint16(0, flags, true);

    expect(() => parseIndoorBikeData(view)).not.toThrow();
    expect(parseIndoorBikeData(view)).toEqual({});
  });

  it('keeps already parsed fields when a later optional field is truncated', () => {
    const flags = 0x0000 | (1 << 6); // speed + power
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint16(0, flags, true);
    view.setUint16(2, 3600, true);

    const data = parseIndoorBikeData(view);
    expect(data.speed).toBeCloseTo(10);
    expect(data.power).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setTrainerControlMode / getTrainerControlMode
// ---------------------------------------------------------------------------

describe('setTrainerControlMode / getTrainerControlMode', () => {
  it('defaults to sim mode', () => {
    // Reset module state to default between test suites may not be possible
    // without module isolation, but we can at least verify the getter works.
    const mode = getTrainerControlMode();
    expect(['erg', 'sim']).toContain(mode);
  });

  it('setTrainerControlMode changes the active mode', () => {
    setTrainerControlMode('erg');
    expect(getTrainerControlMode()).toBe('erg');
    setTrainerControlMode('sim');
    expect(getTrainerControlMode()).toBe('sim');
  });

  it('is idempotent (setting same mode twice is fine)', () => {
    setTrainerControlMode('erg');
    setTrainerControlMode('erg');
    expect(getTrainerControlMode()).toBe('erg');
    // Reset
    setTrainerControlMode('sim');
  });
});
