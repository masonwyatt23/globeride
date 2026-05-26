/**
 * Hand-rolled FIT v2 binary encoder.
 *
 * Implements just the subset of messages needed for a valid cycling activity
 * that Strava (and Garmin Connect, mostly) will accept:
 *
 *   file_id  (0)   – activity, manufacturer, timestamp
 *   activity (34)  – timestamp, total_timer_time, num_sessions, event
 *   session  (18)  – aggregate stats, sport=cycling, sub_sport=indoor_cycling
 *   lap      (19)  – single lap covering the whole ride
 *   record   (20)  – per-second telemetry: position, ele, speed, power, etc.
 *
 * References:
 *   https://developer.garmin.com/fit/protocol/  – binary layout & CRC
 *   https://developer.garmin.com/fit/file-types/activity/
 */

import type { TelemetrySample } from '@/types';

// --- FIT primitives -----------------------------------------------------

/** FIT epoch = 1989-12-31 UTC. */
const FIT_EPOCH_OFFSET = 631065600;
const fitTime = (unixMs: number) => Math.floor(unixMs / 1000) - FIT_EPOCH_OFFSET;

/** Convert decimal degrees to FIT semicircles (sint32). */
const semicircles = (deg: number) => Math.round((deg / 180) * 2 ** 31);

/** Invalid sentinels per FIT base types. */
const INV_U8 = 0xff;
const INV_U16 = 0xffff;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- FIT protocol sentinels kept for reference
const INV_U32 = 0xffffffff;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- FIT protocol sentinels kept for reference
const INV_S16 = 0x7fff;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- FIT protocol sentinels kept for reference
const INV_S32 = 0x7fffffff;

// --- CRC table (per FIT SDK) -------------------------------------------

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

function fitCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc & 0xffff;
}

// --- Tiny growable buffer ----------------------------------------------

class Writer {
  private buf: Uint8Array = new Uint8Array(4096);
  private view: DataView = new DataView(this.buf.buffer);
  private len = 0;

  private grow(extra: number) {
    if (this.len + extra <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  u8(n: number) { this.grow(1); this.view.setUint8(this.len, n & 0xff); this.len += 1; }
  u16(n: number) { this.grow(2); this.view.setUint16(this.len, n & 0xffff, true); this.len += 2; }
  u32(n: number) { this.grow(4); this.view.setUint32(this.len, n >>> 0, true); this.len += 4; }
  s16(n: number) { this.grow(2); this.view.setInt16(this.len, n, true); this.len += 2; }
  s32(n: number) { this.grow(4); this.view.setInt32(this.len, n, true); this.len += 4; }

  bytes(): Uint8Array { return this.buf.subarray(0, this.len); }
  length(): number { return this.len; }
}

// --- Base types ---------------------------------------------------------

const BASE_ENUM = 0x00;
const BASE_U8 = 0x02;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- FIT base-type table kept for reference
const BASE_S16 = 0x83;
const BASE_U16 = 0x84;
const BASE_S32 = 0x85;
const BASE_U32 = 0x86;
const BASE_U32Z = 0x8c;

interface FieldDef {
  num: number;
  size: number;
  type: number;
}

interface MsgDef {
  globalMsgNum: number;
  fields: FieldDef[];
}

/** Emit a Definition Message into the data section. */
function writeDefinition(out: Writer, localId: number, def: MsgDef) {
  out.u8(0x40 | (localId & 0x0f)); // record header w/ definition bit
  out.u8(0); // reserved
  out.u8(0); // architecture = little-endian
  out.u16(def.globalMsgNum);
  out.u8(def.fields.length);
  for (const f of def.fields) {
    out.u8(f.num);
    out.u8(f.size);
    out.u8(f.type);
  }
}

// --- Message field schemas ---------------------------------------------

const FILE_ID_DEF: MsgDef = {
  globalMsgNum: 0,
  fields: [
    { num: 3, size: 4, type: BASE_U32Z }, // serial_number
    { num: 4, size: 4, type: BASE_U32 },  // time_created
    { num: 1, size: 2, type: BASE_U16 },  // manufacturer
    { num: 2, size: 2, type: BASE_U16 },  // product
    { num: 0, size: 1, type: BASE_ENUM }, // type
  ],
};

const ACTIVITY_DEF: MsgDef = {
  globalMsgNum: 34,
  fields: [
    { num: 253, size: 4, type: BASE_U32 }, // timestamp
    { num: 0, size: 4, type: BASE_U32 },   // total_timer_time
    { num: 1, size: 2, type: BASE_U16 },   // num_sessions
    { num: 2, size: 1, type: BASE_ENUM },  // type
    { num: 3, size: 1, type: BASE_ENUM },  // event
    { num: 4, size: 1, type: BASE_ENUM },  // event_type
  ],
};

const SESSION_DEF: MsgDef = {
  globalMsgNum: 18,
  fields: [
    { num: 253, size: 4, type: BASE_U32 }, // timestamp
    { num: 2, size: 4, type: BASE_U32 },   // start_time
    { num: 7, size: 4, type: BASE_U32 },   // total_elapsed_time (ms ×1000)
    { num: 8, size: 4, type: BASE_U32 },   // total_timer_time
    { num: 9, size: 4, type: BASE_U32 },   // total_distance (m ×100)
    { num: 11, size: 2, type: BASE_U16 },  // total_calories
    { num: 14, size: 2, type: BASE_U16 },  // avg_speed (m/s ×1000)
    { num: 15, size: 2, type: BASE_U16 },  // max_speed
    { num: 20, size: 2, type: BASE_U16 },  // avg_power
    { num: 21, size: 2, type: BASE_U16 },  // max_power
    { num: 25, size: 2, type: BASE_U16 },  // first_lap_index
    { num: 26, size: 2, type: BASE_U16 },  // num_laps
    { num: 5, size: 1, type: BASE_ENUM },  // sport (2 = cycling)
    { num: 6, size: 1, type: BASE_ENUM },  // sub_sport (6 = indoor_cycling)
    { num: 0, size: 1, type: BASE_ENUM },  // event (8 = session)
    { num: 1, size: 1, type: BASE_ENUM },  // event_type (1 = stop)
  ],
};

const LAP_DEF: MsgDef = {
  globalMsgNum: 19,
  fields: [
    { num: 253, size: 4, type: BASE_U32 }, // timestamp
    { num: 2, size: 4, type: BASE_U32 },   // start_time
    { num: 7, size: 4, type: BASE_U32 },   // total_elapsed_time
    { num: 8, size: 4, type: BASE_U32 },   // total_timer_time
    { num: 9, size: 4, type: BASE_U32 },   // total_distance
    { num: 0, size: 1, type: BASE_ENUM },  // event (9 = lap)
    { num: 1, size: 1, type: BASE_ENUM },  // event_type (1 = stop)
    { num: 25, size: 1, type: BASE_ENUM }, // sport
  ],
};

const RECORD_DEF: MsgDef = {
  globalMsgNum: 20,
  fields: [
    { num: 253, size: 4, type: BASE_U32 }, // timestamp
    { num: 0, size: 4, type: BASE_S32 },   // position_lat (semicircles)
    { num: 1, size: 4, type: BASE_S32 },   // position_long
    { num: 5, size: 4, type: BASE_U32 },   // distance (m ×100)
    { num: 6, size: 2, type: BASE_U16 },   // speed (m/s ×1000)
    { num: 2, size: 2, type: BASE_U16 },   // altitude ((m + 500) ×5)
    { num: 7, size: 2, type: BASE_U16 },   // power
    { num: 4, size: 1, type: BASE_U8 },    // cadence
    { num: 3, size: 1, type: BASE_U8 },    // heart_rate
  ],
};

// --- Local message IDs we'll assign ------------------------------------

const LID_FILE_ID = 0;
const LID_ACTIVITY = 1;
const LID_SESSION = 2;
const LID_LAP = 3;
const LID_RECORD = 4;

// --- Public API --------------------------------------------------------

export interface FitExportInput {
  /** Sport-wide start time (unix ms). */
  startTime: number;
  samples: TelemetrySample[];
  /**
   * Optional peer ID of the connected multi-rider partner.
   * The FIT v2 protocol does not provide a standard notes or name field in the
   * session/activity messages supported by this minimal writer, so this field
   * is currently not embedded in the binary output. It is reserved here for
   * when a WorkoutName (field 254) or developer data extension is added.
   */
  multiriderId?: string;
}

/** Build a complete .FIT file as a Blob ready for download. */
export function buildFit({ startTime, samples }: FitExportInput): Blob {
  if (samples.length === 0) {
    throw new Error('Cannot build a FIT file with zero samples');
  }

  const endTime = samples[samples.length - 1].t;
  const startFit = fitTime(startTime);
  const endFit = fitTime(endTime);
  const elapsedSec = Math.max(1, Math.floor((endTime - startTime) / 1000));
  const totalDistance = samples[samples.length - 1].distance ?? 0;

  let maxPower = 0;
  let sumPower = 0;
  let powerN = 0;
  let maxSpeed = 0;
  let sumSpeed = 0;
  let speedN = 0;
  for (const s of samples) {
    if (typeof s.power === 'number') {
      maxPower = Math.max(maxPower, s.power);
      sumPower += s.power;
      powerN += 1;
    }
    if (typeof s.speed === 'number') {
      maxSpeed = Math.max(maxSpeed, s.speed);
      sumSpeed += s.speed;
      speedN += 1;
    }
  }
  const avgPower = powerN > 0 ? Math.round(sumPower / powerN) : 0;
  const avgSpeed = speedN > 0 ? sumSpeed / speedN : 0;

  const data = new Writer();

  // ---- file_id ----
  writeDefinition(data, LID_FILE_ID, FILE_ID_DEF);
  data.u8(LID_FILE_ID);
  data.u32(0); // serial_number
  data.u32(startFit); // time_created
  data.u16(255); // manufacturer: development
  data.u16(0); // product
  data.u8(4); // type: activity

  // ---- record definition (one shot) ----
  writeDefinition(data, LID_RECORD, RECORD_DEF);
  for (const s of samples) {
    data.u8(LID_RECORD);
    data.u32(fitTime(s.t));
    data.s32(semicircles(s.lat));
    data.s32(semicircles(s.lon));
    data.u32(Math.round((s.distance ?? 0) * 100));
    data.u16(typeof s.speed === 'number' ? Math.round(s.speed * 1000) : INV_U16);
    data.u16(Math.round((s.ele + 500) * 5));
    data.u16(typeof s.power === 'number' ? Math.max(0, Math.min(65534, Math.round(s.power))) : INV_U16);
    data.u8(typeof s.cadence === 'number' ? Math.max(0, Math.min(254, Math.round(s.cadence))) : INV_U8);
    data.u8(typeof s.heartRate === 'number' ? Math.max(0, Math.min(254, Math.round(s.heartRate))) : INV_U8);
  }

  // ---- lap ----
  writeDefinition(data, LID_LAP, LAP_DEF);
  data.u8(LID_LAP);
  data.u32(endFit);
  data.u32(startFit);
  data.u32(elapsedSec * 1000);
  data.u32(elapsedSec * 1000);
  data.u32(Math.round(totalDistance * 100));
  data.u8(9); // event: lap
  data.u8(1); // event_type: stop
  data.u8(2); // sport: cycling

  // ---- session ----
  writeDefinition(data, LID_SESSION, SESSION_DEF);
  data.u8(LID_SESSION);
  data.u32(endFit);
  data.u32(startFit);
  data.u32(elapsedSec * 1000);
  data.u32(elapsedSec * 1000);
  data.u32(Math.round(totalDistance * 100));
  data.u16(Math.round((avgPower * elapsedSec) / 4184)); // ~kcal, rough
  data.u16(Math.round(avgSpeed * 1000));
  data.u16(Math.round(maxSpeed * 1000));
  data.u16(avgPower);
  data.u16(maxPower);
  data.u16(0); // first_lap_index
  data.u16(1); // num_laps
  data.u8(2); // sport = cycling
  data.u8(6); // sub_sport = indoor_cycling
  data.u8(8); // event = session
  data.u8(1); // event_type = stop

  // ---- activity ----
  writeDefinition(data, LID_ACTIVITY, ACTIVITY_DEF);
  data.u8(LID_ACTIVITY);
  data.u32(endFit);
  data.u32(elapsedSec * 1000);
  data.u16(1); // num_sessions
  data.u8(0); // type: manual
  data.u8(26); // event: activity
  data.u8(1); // event_type: stop

  const dataBytes = data.bytes();
  const dataSize = dataBytes.length;

  // ---- header + crc ----
  const header = new Uint8Array(14);
  const hv = new DataView(header.buffer);
  header[0] = 14; // header size
  header[1] = 0x20; // protocol version 2.0
  hv.setUint16(2, 2140, true); // profile version
  hv.setUint32(4, dataSize, true);
  header.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  const headerCrc = fitCrc(header.subarray(0, 12));
  hv.setUint16(12, headerCrc, true);

  // CRC of (header + data) is the file CRC.
  const headerPlusData = new Uint8Array(header.length + dataSize);
  headerPlusData.set(header, 0);
  headerPlusData.set(dataBytes, header.length);
  const fileCrc = fitCrc(headerPlusData);

  const out = new Uint8Array(headerPlusData.length + 2);
  out.set(headerPlusData, 0);
  out[out.length - 2] = fileCrc & 0xff;
  out[out.length - 1] = (fileCrc >> 8) & 0xff;
  return new Blob([out], { type: 'application/vnd.ant.fit' });
}

/** Trigger a browser download of the produced .fit file. */
export function downloadFit(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.fit') ? filename : `${filename}.fit`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
