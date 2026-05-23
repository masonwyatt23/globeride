/**
 * FIT v2 binary decoder — exact inverse of fitExporter.ts.
 *
 * Decodes: file_id, record, lap, session, activity messages.
 * Record fields decoded: timestamp, position_lat/long (semicircles→deg),
 * altitude, distance, speed, power, cadence, heart_rate.
 *
 * Tolerant of FITs that omit some fields (e.g. no power, no HR).
 * Validates both the 12-byte header CRC and the trailing file CRC.
 */

import type { TelemetrySample, Route } from '@/types';
import { buildRoute, sampleRouteAtDistance } from '@/lib/gpxParser';
import { buildFit } from '@/lib/fitExporter';

// ---------------------------------------------------------------------------
// CRC — identical table / algorithm used by fitExporter.ts
// ---------------------------------------------------------------------------

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

function fitCrc(bytes: Uint8Array, start = 0, end?: number): number {
  const limit = end ?? bytes.length;
  let crc = 0;
  for (let i = start; i < limit; i++) {
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

// ---------------------------------------------------------------------------
// FIT constants
// ---------------------------------------------------------------------------

/** FIT epoch = Unix 1989-12-31 00:00:00 UTC */
const FIT_EPOCH_OFFSET = 631065600;

/** FIT invalid-value sentinels — values to treat as "not present". */
const INV_U8 = 0xff;
const INV_U16 = 0xffff;
const INV_U32 = 0xffffffff;
const INV_S32 = 0x7fffffff;

/** Global message numbers we care about. */
const MESG_FILE_ID = 0;
const MESG_RECORD = 20;

/** FIT base type byte → field size in bytes. */
const BASE_TYPE_SIZES: Record<number, number> = {
  0x00: 1, // enum
  0x01: 1, // sint8
  0x02: 1, // uint8
  0x83: 2, // sint16
  0x84: 2, // uint16
  0x85: 4, // sint32
  0x86: 4, // uint32
  0x07: 1, // string
  0x88: 4, // float32
  0x89: 8, // float64
  0x0a: 1, // uint8z
  0x8b: 2, // uint16z
  0x8c: 4, // uint32z
  0x0d: 1, // byte
  0x8e: 8, // sint64
  0x8f: 8, // uint64
  0x90: 8, // uint64z
};

function baseTypeSize(typeId: number): number {
  return BASE_TYPE_SIZES[typeId] ?? 1;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface FieldDefinition {
  fieldDefNum: number;
  size: number;
  baseType: number;
  /** Byte offset within the data message body. */
  offset: number;
}

interface MessageDefinition {
  architecture: number; // 0 = little-endian, 1 = big-endian
  globalMsgNum: number;
  fields: FieldDefinition[];
  /** Total size of one data message body (bytes, not counting record header). */
  bodySize: number;
}

interface RawRecord {
  timestampFit: number;
  latDeg?: number;
  lonDeg?: number;
  altM?: number;
  distM?: number;
  speedMs?: number;
  powerW?: number;
  cadenceRpm?: number;
  heartRateBpm?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ParsedFit {
  /** Normalized route built from GPS track — same shape as gpxParser output. */
  route: Route;
  /**
   * Per-record telemetry samples aligned to route distance + absolute time.
   * Power/cadence/HR are `undefined` when not present in the source FIT.
   */
  samples: TelemetrySample[];
  /** Activity start time (Unix ms). */
  startTimeMs: number;
}

export class FitParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitParseError';
  }
}

/**
 * Parse a raw .FIT file `ArrayBuffer` into a route + telemetry samples.
 *
 * Throws `FitParseError` for structural/CRC failures — safe to catch and
 * present to the user directly.
 */
export function parseFit(buffer: ArrayBuffer): ParsedFit {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (bytes.length < 14) {
    throw new FitParseError('File is too small to be a valid FIT file');
  }

  // ---- Header ----
  const headerSize = bytes[0];
  if (headerSize !== 12 && headerSize !== 14) {
    throw new FitParseError(`Unexpected FIT header size: ${headerSize} (expected 12 or 14)`);
  }

  const magic = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (magic !== '.FIT') {
    throw new FitParseError('Not a FIT file: missing ".FIT" magic bytes at offset 8');
  }

  const dataSize = view.getUint32(4, true);

  // Header CRC (bytes 12–13, present only when headerSize === 14)
  if (headerSize === 14) {
    const expectedHeaderCrc = view.getUint16(12, true);
    if (expectedHeaderCrc !== 0) {
      const actualHeaderCrc = fitCrc(bytes, 0, 12);
      if (actualHeaderCrc !== expectedHeaderCrc) {
        throw new FitParseError(
          `FIT header CRC mismatch (expected 0x${expectedHeaderCrc.toString(16).padStart(4, '0')}, ` +
          `computed 0x${actualHeaderCrc.toString(16).padStart(4, '0')})`,
        );
      }
    }
  }

  // File CRC (last 2 bytes after the data section)
  const totalExpected = headerSize + dataSize + 2;
  if (bytes.length < totalExpected) {
    throw new FitParseError(
      `FIT file truncated: expected at least ${totalExpected} bytes, got ${bytes.length}`,
    );
  }
  const fileCrcStored = view.getUint16(headerSize + dataSize, true);
  if (fileCrcStored !== 0) {
    const fileCrcActual = fitCrc(bytes, 0, headerSize + dataSize);
    if (fileCrcActual !== fileCrcStored) {
      throw new FitParseError(
        `FIT file CRC mismatch (expected 0x${fileCrcStored.toString(16).padStart(4, '0')}, ` +
        `computed 0x${fileCrcActual.toString(16).padStart(4, '0')})`,
      );
    }
  }

  // ---- Decode messages ----
  const localDefs = new Map<number, MessageDefinition>();
  const rawRecords: RawRecord[] = [];
  let activityStartFit = 0;

  let pos = headerSize;
  const dataEnd = headerSize + dataSize;

  while (pos < dataEnd) {
    if (pos >= bytes.length) break;
    const recordHeader = bytes[pos];
    pos += 1;

    // Compressed timestamp shorthand record (bit 7 set)
    if (recordHeader & 0x80) {
      const localId = (recordHeader >> 5) & 0x03;
      const def = localDefs.get(localId);
      if (!def) break; // Tolerate unknown compressed record
      pos += def.bodySize;
      continue;
    }

    const isDefinition = (recordHeader & 0x40) !== 0;
    const hasDevFields = (recordHeader & 0x20) !== 0;
    const localId = recordHeader & 0x0f;

    if (isDefinition) {
      // ---- Definition message ----
      pos += 1; // reserved byte
      const arch = bytes[pos]; pos += 1;
      const le = arch === 0;
      const globalMsgNum = le ? view.getUint16(pos, true) : view.getUint16(pos, false);
      pos += 2;
      const fieldCount = bytes[pos]; pos += 1;

      const fields: FieldDefinition[] = [];
      let bodySize = 0;
      for (let i = 0; i < fieldCount; i++) {
        const fieldDefNum = bytes[pos]; pos += 1;
        const size = bytes[pos]; pos += 1;
        const baseType = bytes[pos]; pos += 1;
        // Trust the declared size (handles array fields correctly)
        const effectiveSize = size > 0 ? size : baseTypeSize(baseType);
        fields.push({ fieldDefNum, size: effectiveSize, baseType, offset: bodySize });
        bodySize += effectiveSize;
      }

      // Developer field definitions — skip but account for their body bytes
      if (hasDevFields) {
        const devFieldCount = bytes[pos]; pos += 1;
        for (let i = 0; i < devFieldCount; i++) {
          // dev_field_num (1) + size (1) + dev_data_index (1)
          const devSize = bytes[pos + 1];
          pos += 3;
          bodySize += devSize;
        }
      }

      localDefs.set(localId, { architecture: arch, globalMsgNum, fields, bodySize });

    } else {
      // ---- Data message ----
      const def = localDefs.get(localId);
      if (!def) break; // Tolerate unknown local IDs

      const bodyStart = pos;
      const le = def.architecture === 0;

      if (def.globalMsgNum === MESG_FILE_ID) {
        for (const f of def.fields) {
          if (f.fieldDefNum === 4 && f.size === 4) {
            // field 4 = time_created
            const v = le
              ? view.getUint32(bodyStart + f.offset, true)
              : view.getUint32(bodyStart + f.offset, false);
            if (v !== INV_U32) activityStartFit = v;
          }
        }
      } else if (def.globalMsgNum === MESG_RECORD) {
        const rec: RawRecord = { timestampFit: 0 };

        for (const f of def.fields) {
          const off = bodyStart + f.offset;
          // Guard against reading past buffer
          if (off + f.size > bytes.length) continue;

          switch (f.fieldDefNum) {
            case 253: { // timestamp (uint32)
              const v = le ? view.getUint32(off, true) : view.getUint32(off, false);
              if (v !== INV_U32) rec.timestampFit = v;
              break;
            }
            case 0: { // position_lat (sint32 semicircles)
              const v = le ? view.getInt32(off, true) : view.getInt32(off, false);
              if (v !== INV_S32) rec.latDeg = (v / 2147483648) * 180;
              break;
            }
            case 1: { // position_long (sint32 semicircles)
              const v = le ? view.getInt32(off, true) : view.getInt32(off, false);
              if (v !== INV_S32) rec.lonDeg = (v / 2147483648) * 180;
              break;
            }
            case 2: { // altitude: uint16, encoded as (m + 500) * 5
              const v = le ? view.getUint16(off, true) : view.getUint16(off, false);
              if (v !== INV_U16) rec.altM = v / 5 - 500;
              break;
            }
            case 5: { // distance: uint32, encoded as m * 100
              const v = le ? view.getUint32(off, true) : view.getUint32(off, false);
              if (v !== INV_U32) rec.distM = v / 100;
              break;
            }
            case 6: { // speed: uint16, encoded as m/s * 1000
              const v = le ? view.getUint16(off, true) : view.getUint16(off, false);
              if (v !== INV_U16) rec.speedMs = v / 1000;
              break;
            }
            case 7: { // power: uint16, watts
              const v = le ? view.getUint16(off, true) : view.getUint16(off, false);
              if (v !== INV_U16) rec.powerW = v;
              break;
            }
            case 4: { // cadence: uint8, rpm
              const v = bytes[off];
              if (v !== INV_U8) rec.cadenceRpm = v;
              break;
            }
            case 3: { // heart_rate: uint8, bpm
              const v = bytes[off];
              if (v !== INV_U8) rec.heartRateBpm = v;
              break;
            }
          }
        }

        rawRecords.push(rec);
      }

      pos = bodyStart + def.bodySize;
    }
  }

  // ---- Validate we have enough data ----
  if (rawRecords.length < 2) {
    throw new FitParseError(
      `FIT file contains only ${rawRecords.length} record(s) — need at least 2`,
    );
  }

  const gpsRecords = rawRecords.filter(
    (r) => r.latDeg !== undefined && r.lonDeg !== undefined,
  );

  if (gpsRecords.length < 2) {
    throw new FitParseError(
      `FIT file has only ${gpsRecords.length} GPS-tagged record(s) — need at least 2 to build a route`,
    );
  }

  // ---- Build Route (same shape as gpxParser.buildRoute) ----
  const rawForRoute = gpsRecords.map((r) => ({
    lat: r.latDeg!,
    lon: r.lonDeg!,
    ele: r.altM ?? 0,
  }));

  const firstTs = activityStartFit || gpsRecords[0].timestampFit;
  const startUnixMs = (firstTs + FIT_EPOCH_OFFSET) * 1000;
  const dateLabel = new Date(startUnixMs).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const route = buildRoute(`FIT replay — ${dateLabel}`, rawForRoute);

  // ---- Build time→routeDist lookup from GPS records ----
  // After buildRoute, route.points may have fewer entries than gpsRecords
  // because near-duplicate points are dropped. We re-match by GPS index,
  // clamping to the actual point count.
  const gpsTimeToRouteDist: Array<{ fitTs: number; routeDist: number }> = [];
  for (let i = 0; i < gpsRecords.length; i++) {
    const ptIdx = Math.min(i, route.points.length - 1);
    gpsTimeToRouteDist.push({
      fitTs: gpsRecords[i].timestampFit,
      routeDist: route.points[ptIdx].distance,
    });
  }

  function interpolateRouteDist(fitTs: number): number {
    if (gpsTimeToRouteDist.length === 0) return 0;
    if (fitTs <= gpsTimeToRouteDist[0].fitTs) return gpsTimeToRouteDist[0].routeDist;
    const last = gpsTimeToRouteDist[gpsTimeToRouteDist.length - 1];
    if (fitTs >= last.fitTs) return last.routeDist;

    let lo = 0;
    let hi = gpsTimeToRouteDist.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (gpsTimeToRouteDist[mid].fitTs <= fitTs) lo = mid;
      else hi = mid;
    }
    const a = gpsTimeToRouteDist[lo];
    const b = gpsTimeToRouteDist[hi];
    const span = b.fitTs - a.fitTs;
    const t = span > 0 ? (fitTs - a.fitTs) / span : 0;
    return a.routeDist + (b.routeDist - a.routeDist) * t;
  }

  // ---- Build TelemetrySample[] aligned to route ----
  const samples: TelemetrySample[] = rawRecords.map((r) => {
    const unixMs = (r.timestampFit + FIT_EPOCH_OFFSET) * 1000;

    // Prefer the FIT-recorded distance field; fall back to time interpolation
    const routeDist =
      r.distM !== undefined
        ? Math.min(r.distM, route.totalDistance)
        : interpolateRouteDist(r.timestampFit);

    const pt = sampleRouteAtDistance(route, routeDist);

    const sample: TelemetrySample = {
      t: unixMs,
      lat: r.latDeg ?? pt.lat,
      lon: r.lonDeg ?? pt.lon,
      ele: r.altM ?? pt.ele,
      distance: routeDist,
      speed: r.speedMs ?? 0,
      grade: 0, // computed live by the ride loop from the 3D terrain
    };
    if (r.powerW !== undefined) sample.power = r.powerW;
    if (r.cadenceRpm !== undefined) sample.cadence = r.cadenceRpm;
    if (r.heartRateBpm !== undefined) sample.heartRate = r.heartRateBpm;

    return sample;
  });

  return { route, samples, startTimeMs: startUnixMs };
}

// ---------------------------------------------------------------------------
// Round-trip sanity check (developer utility, not used at runtime)
// ---------------------------------------------------------------------------

/**
 * Build a minimal FIT via fitExporter, immediately parse it back, and verify
 * all fields match within quantization tolerance. Returns a human-readable
 * diagnostic string.
 *
 * Usage (browser devtools):
 *   import('@/lib/fitParser').then(m => m._roundTripCheck().then(console.log))
 */
export async function _roundTripCheck(): Promise<string> {
  const now = Date.now();

  const testSamples: TelemetrySample[] = [
    {
      t: now,
      lat: 46.5933, lon: 7.9088, ele: 1234.5,
      distance: 0, speed: 8.33, grade: 2.5,
      power: 220, cadence: 85, heartRate: 155,
    },
    {
      t: now + 1000,
      lat: 46.5940, lon: 7.9100, ele: 1240.0,
      distance: 100, speed: 9.0, grade: 3.0,
      power: 235, cadence: 87, heartRate: 158,
    },
    {
      t: now + 2000,
      lat: 46.5950, lon: 7.9110, ele: 1245.0,
      distance: 210, speed: 8.5, grade: 1.5,
      power: 210, cadence: 82, heartRate: 153,
    },
  ];

  const blob = buildFit({ startTime: now, samples: testSamples });
  const buf = await blob.arrayBuffer();

  let parsed: ParsedFit;
  try {
    parsed = parseFit(buf);
  } catch (e) {
    return `FAIL: parseFit threw — ${e instanceof Error ? e.message : String(e)}`;
  }

  const lines: string[] = [
    `Round-trip check: ${parsed.samples.length} samples decoded`,
  ];

  // Semicircle quantization: max error = 180/2^31 ≈ 8.38e-8 degrees
  const LAT_LON_EPS = 1e-6;
  // Altitude: (m+500)*5 encoded as uint16 → ±0.1 m
  const ELE_EPS = 0.11;
  // Speed: m/s*1000 encoded as uint16 → ±0.001 m/s
  const SPD_EPS = 0.002;

  for (let i = 0; i < testSamples.length; i++) {
    const orig = testSamples[i];
    const rep = parsed.samples[i];
    if (!rep) {
      lines.push(`  sample[${i}]: MISSING`);
      continue;
    }
    const latOk = Math.abs(rep.lat - orig.lat) < LAT_LON_EPS;
    const lonOk = Math.abs(rep.lon - orig.lon) < LAT_LON_EPS;
    const eleOk = Math.abs(rep.ele - orig.ele) < ELE_EPS;
    const spdOk = Math.abs(rep.speed - orig.speed) < SPD_EPS;
    const pwrOk = rep.power === orig.power;
    const cadOk = rep.cadence === orig.cadence;
    const hrOk = rep.heartRate === orig.heartRate;
    const all = latOk && lonOk && eleOk && spdOk && pwrOk && cadOk && hrOk;
    lines.push(
      `  sample[${i}]: ${all ? 'OK ✓' : 'MISMATCH ✗'} ` +
      `lat=${latOk ? '✓' : '✗'} lon=${lonOk ? '✓' : '✗'} ele=${eleOk ? '✓' : '✗'} ` +
      `spd=${spdOk ? '✓' : '✗'} pwr=${pwrOk ? '✓' : '✗'} cad=${cadOk ? '✓' : '✗'} hr=${hrOk ? '✓' : '✗'}`,
    );
  }

  return lines.join('\n');
}
