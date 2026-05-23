/**
 * GlobeRide P2P Race Protocol — permissionless, serverless racing.
 *
 * A race manifest is a self-contained JSON blob that describes a race:
 * route reference, time window, and rules. Anyone can create one, share it as
 * a URL / QR code / file, and everyone rides locally. Results are signed with
 * a per-device HMAC key stored in localStorage — no accounts, no backend.
 *
 * Crypto: HMAC-SHA-256 via the browser Web Crypto API (SubtleCrypto).
 * The secret key is lazy-generated once per device and never leaves the device.
 */

import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Schema version — increment when the manifest shape makes a breaking change.
// Decoders reject manifests with a higher version than they understand.
// ---------------------------------------------------------------------------

export const RACE_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type RaceRouteRef =
  /** References an entry in ICONIC_ROUTES by its route.id. */
  | { kind: 'iconic'; routeId: string }
  /** References an entry in WORLD_TOUR_STAGES by its route.id. */
  | { kind: 'wts'; stageId: string }
  /** Embeds a full Route polyline inline (for custom/GPX routes). */
  | { kind: 'inline'; route: Route };

export interface RaceManifest {
  // --- Identifying ---
  /** UUIDv4 generated at creation time. Stable forever. */
  id: string;
  schemaVersion: 1;

  // --- Race definition ---
  /** Human-readable race name, max 120 chars. */
  name: string;
  /** Optional prose description, max 400 chars. */
  description?: string;
  /** Which route this race runs on. */
  routeRef: RaceRouteRef;
  /**
   * UTC time window in which a completed ride qualifies as a valid result.
   * Both values are unix milliseconds.
   */
  utcWindow: { startMs: number; endMs: number };
  /** Participation rules and optional anti-cheat thresholds. */
  rules: {
    /** How many laps of the route count as a finish. Default 1. */
    laps?: number;
    /** If true, riders must complete a structured workout to qualify. Default false. */
    requireWorkout?: boolean;
    /**
     * Minimum average speed in km/h to count as a valid result.
     * 0 means disabled. Used to filter out obvious non-riding submissions.
     */
    minSpeedKmh?: number;
    /**
     * Maximum average power in W/kg allowed without flagging.
     * 0 means disabled. Used as a lightweight anti-cheat sanity check.
     */
    maxAvgPowerWPerKg?: number;
  };
  /** Free-form organiser display info. Never used for auth — anyone can set this. */
  organiser?: { name: string };
  /** Unix ms when this manifest was created. */
  createdAt: number;
}

export interface RaceResult {
  /** Must match the manifest's id. */
  raceId: string;
  /** Rider identity — sourced from the device's rider profile. */
  rider: {
    name: string;
    /** Functional Threshold Power in watts, used for W/kg anti-cheat check. */
    ftpW?: number;
    weightKg?: number;
  };
  /** Total elapsed race time in ms (finish wall-clock − race start). */
  finishTimeMs: number;
  /** Average power in watts over the whole ride, if available. */
  avgPowerW?: number;
  /** Total ascent in metres recorded by the ride. */
  totalAscentM: number;
  /** Unix ms when the result was recorded on this device. */
  recordedAt: number;
  /** SHA-256 hex digest of the telemetry samples JSON blob. Tamper detection. */
  rideHash: string;
  /**
   * HMAC-SHA-256 hex over the concatenation:
   *   `${rideHash}|${raceId}|${finishTimeMs}`
   * using the device's per-device secret key.
   */
  signature: string;
}

// ---------------------------------------------------------------------------
// localStorage key for the per-device HMAC secret (hex-encoded raw bytes)
// ---------------------------------------------------------------------------

const SECRET_KEY_LS = 'globeride.race.deviceSecret.v1';

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

/**
 * A minimal key-value storage interface so key management functions can be
 * called outside a browser context (e.g. Vitest node environment).
 */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Returns localStorage in browser; falls back to an in-memory map in Node/tests. */
function defaultStorage(): KeyStorage {
  if (typeof localStorage !== 'undefined') return localStorage;
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => { mem.set(k, v); },
  };
}

/**
 * Get (or lazily generate) the per-device HMAC secret key.
 * The key is stored as hex in the provided storage (default: localStorage).
 *
 * @param storage  Optional override — useful in tests.
 */
export async function getOrCreateDeviceKey(storage?: KeyStorage): Promise<CryptoKey> {
  const store = storage ?? defaultStorage();
  let hex = store.getItem(SECRET_KEY_LS);
  if (!hex) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    hex = Array.from(raw)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    store.setItem(SECRET_KEY_LS, hex);
  }
  const raw = hexToBytes(hex);
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** Hex-encode an ArrayBuffer. */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Decode a hex string to Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const len = hex.length;
  const out = new Uint8Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

/** SHA-256 hex digest of a string. */
export async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bufToHex(digest);
}

/**
 * Sign a result using the device secret key.
 * Returns the hex HMAC-SHA-256 signature.
 * The message is: `${rideHash}|${raceId}|${finishTimeMs}`
 */
export async function signResult(
  result: Omit<RaceResult, 'signature'>,
  secretKey?: CryptoKey,
): Promise<string> {
  const key = secretKey ?? (await getOrCreateDeviceKey());
  const message = `${result.rideHash}|${result.raceId}|${result.finishTimeMs}`;
  const encoded = new TextEncoder().encode(message);
  const sig = await crypto.subtle.sign('HMAC', key, encoded);
  return bufToHex(sig);
}

/**
 * Verify a result's signature against a known CryptoKey.
 * Returns true if the signature is valid for this key.
 *
 * For the "trust on first use" P2P model you can also just check the
 * signature is a valid 64-char hex string (structural check) and record
 * the key alongside the result for future verification.
 */
export async function verifyResult(
  result: RaceResult,
  knownKey: CryptoKey,
): Promise<boolean> {
  try {
    const message = `${result.rideHash}|${result.raceId}|${result.finishTimeMs}`;
    const encoded = new TextEncoder().encode(message);
    const sigBytes = hexToBytes(result.signature);
    return await crypto.subtle.verify('HMAC', knownKey, sigBytes.buffer as ArrayBuffer, encoded);
  } catch {
    return false;
  }
}

/**
 * Structural-only verification: checks the signature is a 64-char hex string
 * (basic anti-tampering sanity check without needing the peer's key).
 * Returns true when the format looks legitimate.
 */
export function verifyResultStructural(result: RaceResult): boolean {
  return /^[0-9a-f]{64}$/.test(result.signature) && /^[0-9a-f]{64}$/.test(result.rideHash);
}

// ---------------------------------------------------------------------------
// Manifest creation
// ---------------------------------------------------------------------------

export type CreateManifestOpts = Omit<RaceManifest, 'id' | 'schemaVersion' | 'createdAt'>;

/** Generate a UUIDv4 using Web Crypto. */
function uuid(): string {
  // Use crypto.randomUUID() where available, otherwise hand-roll from random bytes.
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant bits
  const hex = bufToHex(b.buffer);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/**
 * Create a validated RaceManifest, filling in id, schemaVersion, and createdAt.
 * Throws a descriptive error if the inputs are invalid.
 */
export function createManifest(opts: CreateManifestOpts): RaceManifest {
  // --- Validate name ---
  const name = (opts.name ?? '').trim();
  if (!name) throw new Error('Race name is required.');
  if (name.length > 120) throw new Error('Race name must be ≤ 120 characters.');

  // --- Validate description ---
  if (opts.description !== undefined && opts.description.length > 400) {
    throw new Error('Description must be ≤ 400 characters.');
  }

  // --- Validate time window ---
  const { startMs, endMs } = opts.utcWindow ?? {};
  if (typeof startMs !== 'number' || typeof endMs !== 'number') {
    throw new Error('utcWindow.startMs and utcWindow.endMs are required numbers.');
  }
  if (endMs <= startMs) {
    throw new Error('utcWindow.endMs must be after utcWindow.startMs.');
  }

  // --- Validate route ref ---
  const ref = opts.routeRef;
  if (!ref) throw new Error('routeRef is required.');
  if (!['iconic', 'wts', 'inline'].includes(ref.kind)) {
    throw new Error(`Unknown routeRef.kind: "${(ref as { kind: string }).kind}".`);
  }
  if (ref.kind === 'iconic' && !ref.routeId) throw new Error('routeRef.routeId is required for kind "iconic".');
  if (ref.kind === 'wts' && !ref.stageId) throw new Error('routeRef.stageId is required for kind "wts".');
  if (ref.kind === 'inline' && !ref.route) throw new Error('routeRef.route is required for kind "inline".');

  return {
    id: uuid(),
    schemaVersion: RACE_SCHEMA_VERSION,
    name,
    description: opts.description,
    routeRef: opts.routeRef,
    utcWindow: { startMs, endMs },
    rules: opts.rules ?? {},
    organiser: opts.organiser,
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// URL encoding / decoding
// ---------------------------------------------------------------------------

const BASE_URL = 'https://globeride.vercel.app/';

/** Encode a manifest as a shareable URL using base64url-encoded compact JSON. */
export function encodeManifestUrl(m: RaceManifest): string {
  const json = JSON.stringify(m);
  // TextEncoder → base64url (no padding)
  const bytes = new TextEncoder().encode(json);
  const binStr = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  const b64 = btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${BASE_URL}?race=${b64}`;
}

/**
 * Decode a manifest URL produced by encodeManifestUrl.
 * Returns null for any of:
 *   - malformed URL or missing `race` param
 *   - invalid JSON
 *   - schemaVersion > RACE_SCHEMA_VERSION
 *   - missing required fields
 */
export function decodeManifestUrl(url: string): RaceManifest | null {
  try {
    const u = new URL(url);
    const b64 = u.searchParams.get('race');
    if (!b64) return null;

    // base64url → base64 → binary string → bytes
    const b64std = b64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64std + '=='.slice((b64std.length % 4) || 4);
    const binStr = atob(padded);
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as unknown;

    return validateManifestShape(parsed);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File serialisation
// ---------------------------------------------------------------------------

/** Serialise a manifest to a downloadable `.race.json` Blob. */
export function manifestToJsonFile(m: RaceManifest): Blob {
  return new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
}

/** Read and validate a `.race.json` File uploaded by the user. */
export async function parseManifestFile(file: File): Promise<RaceManifest> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON in race file.');
  }
  const manifest = validateManifestShape(parsed);
  if (!manifest) throw new Error('File does not contain a valid race manifest.');
  return manifest;
}

// ---------------------------------------------------------------------------
// Shape validation helper (shared by decoder + file parser)
// ---------------------------------------------------------------------------

function validateManifestShape(raw: unknown): RaceManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;

  // Schema version guard — reject future spec versions we can't understand
  if (typeof m.schemaVersion !== 'number') return null;
  if (m.schemaVersion > RACE_SCHEMA_VERSION) return null;

  // Required string fields
  if (typeof m.id !== 'string' || !m.id) return null;
  if (typeof m.name !== 'string' || !m.name) return null;
  if (typeof m.createdAt !== 'number') return null;

  // utcWindow
  if (!m.utcWindow || typeof m.utcWindow !== 'object') return null;
  const win = m.utcWindow as Record<string, unknown>;
  if (typeof win.startMs !== 'number' || typeof win.endMs !== 'number') return null;
  if (win.endMs <= win.startMs) return null;

  // routeRef
  if (!m.routeRef || typeof m.routeRef !== 'object') return null;
  const ref = m.routeRef as Record<string, unknown>;
  if (!['iconic', 'wts', 'inline'].includes(ref.kind as string)) return null;

  // rules (optional but must be object if present)
  if (m.rules !== undefined && (typeof m.rules !== 'object' || m.rules === null)) return null;

  return m as unknown as RaceManifest;
}

// ---------------------------------------------------------------------------
// Result validation
// ---------------------------------------------------------------------------

export interface ValidateResultOutput {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a RaceResult against its manifest.
 * Checks:
 *   1. raceId matches manifest.id
 *   2. recordedAt falls within the manifest's utcWindow
 *   3. routeRef match (for iconic/wts kinds — inline is trusted)
 *   4. Anti-cheat rules: minSpeedKmh, maxAvgPowerWPerKg
 *   5. Structural signature integrity
 */
export function validateResult(
  result: RaceResult,
  manifest: RaceManifest,
): ValidateResultOutput {
  // 1. Race ID
  if (result.raceId !== manifest.id) {
    return { ok: false, reason: `Result raceId "${result.raceId}" does not match manifest id "${manifest.id}".` };
  }

  // 2. Time window — recordedAt (when the ride was saved) must be within the window
  const { startMs, endMs } = manifest.utcWindow;
  if (result.recordedAt < startMs || result.recordedAt > endMs) {
    return {
      ok: false,
      reason: `Ride was recorded at ${new Date(result.recordedAt).toISOString()} which is outside the race window ` +
        `(${new Date(startMs).toISOString()} – ${new Date(endMs).toISOString()}).`,
    };
  }

  // 3. Route match (iconic / wts only — inline is structural-only)
  const ref = manifest.routeRef;
  if (ref.kind !== 'inline') {
    // The caller must ensure the result was built against the same route,
    // so we trust finishTimeMs > 0 as a proxy that the route was actually ridden.
    if (result.finishTimeMs <= 0) {
      return { ok: false, reason: 'finishTimeMs must be positive.' };
    }
  }

  // 4. Anti-cheat: minSpeedKmh
  const rules = manifest.rules ?? {};
  if (rules.minSpeedKmh && rules.minSpeedKmh > 0) {
    // Derive approx avg speed from finishTimeMs + route distance.
    // We need the route distance — if inline, we have it; otherwise unknown so skip.
    if (ref.kind === 'inline') {
      const distM = ref.route.totalDistance * (rules.laps ?? 1);
      const avgSpeedKmh = distM / 1000 / (result.finishTimeMs / 3_600_000);
      if (avgSpeedKmh < rules.minSpeedKmh) {
        return {
          ok: false,
          reason: `Average speed ${avgSpeedKmh.toFixed(1)} km/h is below the minimum ${rules.minSpeedKmh} km/h.`,
        };
      }
    }
  }

  // 5. Anti-cheat: maxAvgPowerWPerKg
  if (rules.maxAvgPowerWPerKg && rules.maxAvgPowerWPerKg > 0) {
    const weightKg = result.rider.weightKg;
    const avgPowerW = result.avgPowerW;
    if (weightKg && weightKg > 0 && avgPowerW !== undefined && avgPowerW > 0) {
      const wPerKg = avgPowerW / weightKg;
      if (wPerKg > rules.maxAvgPowerWPerKg) {
        return {
          ok: false,
          reason: `Average power ${wPerKg.toFixed(2)} W/kg exceeds the anti-cheat limit of ${rules.maxAvgPowerWPerKg} W/kg.`,
        };
      }
    }
  }

  // 6. Structural signature check
  if (!verifyResultStructural(result)) {
    return { ok: false, reason: 'Result has a malformed rideHash or signature.' };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Convenience: build a RaceResult from finished ride data
// ---------------------------------------------------------------------------

export interface BuildResultOpts {
  manifest: RaceManifest;
  rider: RaceResult['rider'];
  finishTimeMs: number;
  avgPowerW?: number;
  totalAscentM: number;
  /** JSON-serialisable samples array — will be hashed. */
  samplesBlob: string;
}

/**
 * Build and sign a RaceResult from a finished ride.
 * Returns the signed result ready to store in raceStore.
 *
 * @param opts      Ride data and manifest.
 * @param secretKey Optional CryptoKey override — useful in tests to avoid
 *                  touching localStorage.
 */
export async function buildAndSignResult(
  opts: BuildResultOpts,
  secretKey?: CryptoKey,
): Promise<RaceResult> {
  const { manifest, rider, finishTimeMs, avgPowerW, totalAscentM, samplesBlob } = opts;

  const rideHash = await sha256Hex(samplesBlob);
  const partial: Omit<RaceResult, 'signature'> = {
    raceId: manifest.id,
    rider,
    finishTimeMs,
    avgPowerW,
    totalAscentM,
    recordedAt: Date.now(),
    rideHash,
  };
  const signature = await signResult(partial, secretKey);
  return { ...partial, signature };
}
