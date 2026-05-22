/**
 * Web Bluetooth clients for standalone BLE heart-rate and cadence sensors.
 *
 * Two independent clients, each following the same pattern as ftms.ts:
 *   - module-level device/server/characteristic handles
 *   - subscription callbacks pushed from outside (the Zustand store wires them)
 *   - transparent GATT reconnect with capped exponential back-off
 *   - user-initiated disconnect flag so we don't treat a clean tear-down as
 *     an unexpected drop
 *
 * Supported profiles
 * ──────────────────
 * Heart Rate Monitor
 *   Service  : 0x180D  Heart Rate Service
 *   Char     : 0x2A37  Heart Rate Measurement
 *   Parsing  : flags byte bit-0 → 8-bit (0) or 16-bit (1) HR value field
 *
 * Cadence sensor (two alternate profiles, both tried at connect time)
 *   Primary  : 0x1816  Cycling Speed and Cadence (CSC)
 *              0x2A5C  CSC Measurement — crank revolution counter + event time
 *   Fallback : 0x1818  Cycling Power Service
 *              0x2A63  Cycling Power Measurement — cumulative crank revolutions
 *
 * Cadence math (CSC / Power crank fields)
 * ────────────────────────────────────────
 * Both profiles give a running 16-bit revolution counter and a 16-bit
 * event-time counter.  The delta between successive notifications, with
 * proper uint16 roll-over handling, gives revolutions-per-tick, which is
 * then converted to rpm.
 *
 * To tame jitter (GPS-style: single-revolution resolution ≈ ±1 tick at
 * 1/1024 s = ±60/1024 rpm ≈ ±3.5 rpm) we apply an Exponential Moving
 * Average with α = 0.3 — responsive enough to see sprint surges, smooth
 * enough to suppress single-sample noise.
 *
 * Reference specs
 * ───────────────
 *   Bluetooth SIG GATT: https://www.bluetooth.com/specifications/gatt/
 *   Heart Rate Service 1.0: 0x180D / 0x2A37
 *   Cycling Speed and Cadence Service 1.0: 0x1816 / 0x2A5C
 *   Cycling Power Service 1.1: 0x1818 / 0x2A63
 */

import { detectBluetoothSupport } from './bluetoothSupport';

// ---------------------------------------------------------------------------
// UUIDs
// ---------------------------------------------------------------------------

export const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

export const CSC_SERVICE_UUID = '00001816-0000-1000-8000-00805f9b34fb';
const CSC_MEASUREMENT_UUID = '00002a5c-0000-1000-8000-00805f9b34fb';

export const CYCLING_POWER_SERVICE_UUID = '00001818-0000-1000-8000-00805f9b34fb';
const CYCLING_POWER_MEASUREMENT_UUID = '00002a63-0000-1000-8000-00805f9b34fb';

// ---------------------------------------------------------------------------
// Reconnect tuning (same as ftms.ts)
// ---------------------------------------------------------------------------

const RECONNECT_MAX_ATTEMPTS = 4;
const RECONNECT_BASE_DELAY_MS = 600;
const RECONNECT_MAX_DELAY_MS = 4_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Shared error type
// ---------------------------------------------------------------------------

export type BleSensorErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'no-device-selected'
  | 'no-device-found'
  | 'gatt-connect-failed'
  | 'service-not-found'
  | 'unknown';

export class BleSensorError extends Error {
  readonly code: BleSensorErrorCode;
  readonly cause?: unknown;
  constructor(code: BleSensorErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'BleSensorError';
    this.code = code;
    this.cause = cause;
  }
}

function classifyChooserError(err: unknown): BleSensorError {
  if (err instanceof BleSensorError) return err;
  if (err instanceof DOMException || err instanceof Error) {
    const name = (err as DOMException).name ?? '';
    const msg = err.message ?? '';
    if (name === 'NotFoundError') {
      if (/user cancelled|cancelled/i.test(msg))
        return new BleSensorError('no-device-selected', 'You closed the device chooser.', err);
      return new BleSensorError('no-device-found', 'No compatible sensor was found.', err);
    }
    if (name === 'SecurityError' || /permission/i.test(msg))
      return new BleSensorError('unsupported', 'Bluetooth permission was denied.', err);
    if (name === 'NotSupportedError')
      return new BleSensorError('unsupported', 'Web Bluetooth is not supported in this browser.', err);
    if (name === 'NetworkError')
      return new BleSensorError('gatt-connect-failed', 'Sensor dropped during connection setup.', err);
  }
  return new BleSensorError('unknown', err instanceof Error ? err.message : 'Unknown Bluetooth error', err);
}

// ---------------------------------------------------------------------------
// Reconnect loop (shared template — called by both clients)
// ---------------------------------------------------------------------------

async function runReconnectLoop(
  dev: BluetoothDevice,
  setupSession: (dev: BluetoothDevice) => Promise<void>,
  isUserDisconnect: () => boolean,
  onReconnect: (phase: 'attempt' | 'success' | 'failed', attempt: number) => void,
  onGiveUp: () => void,
): Promise<void> {
  for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
    if (isUserDisconnect()) return;
    onReconnect('attempt', attempt);
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1));
    await sleep(delay);
    if (isUserDisconnect()) return;
    try {
      await setupSession(dev);
      onReconnect('success', attempt);
      return;
    } catch {
      console.warn(`[BLE] reconnect attempt ${attempt} failed`);
    }
  }
  onReconnect('failed', RECONNECT_MAX_ATTEMPTS);
  onGiveUp();
}

// ===========================================================================
// HEART RATE CLIENT
// ===========================================================================

export type HrListener = (bpm: number) => void;
export type HrStatusListener = (status: SensorConnectionStatus) => void;

export type SensorConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

interface HrState {
  device: BluetoothDevice | null;
  server: BluetoothRemoteGATTServer | null;
  char: BluetoothRemoteGATTCharacteristic | null;
  dataListener: HrListener | null;
  statusListener: HrStatusListener | null;
  userDisconnect: boolean;
  reconnectInFlight: boolean;
}

const hr: HrState = {
  device: null,
  server: null,
  char: null,
  dataListener: null,
  statusListener: null,
  userDisconnect: false,
  reconnectInFlight: false,
};

export function onHrData(listener: HrListener | null): void {
  hr.dataListener = listener;
}

export function onHrStatus(listener: HrStatusListener | null): void {
  hr.statusListener = listener;
}

export function hrIsConnected(): boolean {
  return hr.server?.connected === true;
}

export function hrDeviceName(): string | null {
  return hr.device?.name ?? null;
}

/**
 * Prompt the user to pick a Heart Rate Monitor and start streaming.
 * Throws `BleSensorError` with a discriminable `code` on failure.
 */
export async function connectHr(): Promise<void> {
  const support = detectBluetoothSupport();
  if (!support.apiPresent) {
    throw new BleSensorError('unsupported', support.reason ?? 'Web Bluetooth is not available.');
  }
  if (!support.secureContext) {
    throw new BleSensorError('insecure-context', 'Web Bluetooth requires HTTPS or localhost.');
  }

  hr.userDisconnect = false;
  hr.statusListener?.('connecting');

  try {
    hr.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [HR_SERVICE_UUID] }],
      optionalServices: [HR_SERVICE_UUID],
    });
  } catch (err) {
    hr.statusListener?.('error');
    throw classifyChooserError(err);
  }

  hr.device.addEventListener('gattserverdisconnected', handleHrGattDisconnect);

  try {
    await setupHrSession(hr.device);
    hr.statusListener?.('connected');
  } catch (err) {
    hr.statusListener?.('error');
    void disconnectHr().catch(() => undefined);
    throw err;
  }
}

async function setupHrSession(dev: BluetoothDevice): Promise<void> {
  if (!dev.gatt) throw new BleSensorError('gatt-connect-failed', 'Device has no GATT server.');

  try {
    hr.server = await dev.gatt.connect();
  } catch (err) {
    throw new BleSensorError('gatt-connect-failed', 'Could not open GATT connection to HR monitor.', err);
  }

  let service: BluetoothRemoteGATTService;
  try {
    service = await hr.server.getPrimaryService(HR_SERVICE_UUID);
  } catch (err) {
    throw new BleSensorError('service-not-found', 'Heart Rate Service (0x180D) not found on this device.', err);
  }

  try {
    hr.char = await service.getCharacteristic(HR_MEASUREMENT_UUID);
    await hr.char.startNotifications();
    hr.char.addEventListener('characteristicvaluechanged', handleHrNotification);
  } catch (err) {
    throw new BleSensorError('service-not-found', 'Heart Rate Measurement characteristic could not be subscribed.', err);
  }
}

export async function disconnectHr(): Promise<void> {
  hr.userDisconnect = true;
  try {
    if (hr.char) {
      hr.char.removeEventListener('characteristicvaluechanged', handleHrNotification);
    }
    if (hr.device) {
      hr.device.removeEventListener('gattserverdisconnected', handleHrGattDisconnect);
    }
    if (hr.server?.connected) hr.server.disconnect();
  } finally {
    hr.char = null;
    hr.server = null;
    hr.device = null;
  }
  hr.statusListener?.('disconnected');
}

function handleHrNotification(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  if (!target.value) return;
  const bpm = parseHrMeasurement(target.value);
  if (bpm !== null) hr.dataListener?.(bpm);
}

function handleHrGattDisconnect(): void {
  hr.char = null;
  if (hr.userDisconnect) {
    hr.server = null;
    hr.device = null;
    return;
  }
  hr.statusListener?.('reconnecting');
  if (!hr.device || hr.reconnectInFlight) return;
  hr.reconnectInFlight = true;
  void runReconnectLoop(
    hr.device,
    setupHrSession,
    () => hr.userDisconnect,
    (phase, attempt) => {
      if (phase === 'success') {
        hr.statusListener?.('connected');
      } else if (phase === 'failed') {
        hr.statusListener?.('error');
        hr.server = null;
        hr.device = null;
      } else {
        // attempt
        void attempt; // used by console.warn in runReconnectLoop
      }
    },
    () => {
      hr.server = null;
      hr.device = null;
    },
  ).finally(() => {
    hr.reconnectInFlight = false;
  });
}

/**
 * Parse Heart Rate Measurement (0x2A37).
 *
 * Flags byte (octet 0):
 *   bit 0 → 0 = HR value is uint8, 1 = HR value is uint16 LE
 *   bit 1–2 → sensor contact status
 *   bit 3 → energy expended present
 *   bit 4 → RR-interval present
 */
export function parseHrMeasurement(view: DataView): number | null {
  if (view.byteLength < 2) return null;
  const flags = view.getUint8(0);
  const is16bit = (flags & 0x01) !== 0;
  if (is16bit) {
    if (view.byteLength < 3) return null;
    return view.getUint16(1, true);
  }
  return view.getUint8(1);
}

// ===========================================================================
// CADENCE CLIENT
// ===========================================================================

export type CadenceListener = (rpm: number) => void;
export type CadenceStatusListener = (status: SensorConnectionStatus) => void;

/** Which BLE profile was successfully negotiated. */
export type CadenceProfile = 'csc' | 'cycling-power' | null;

interface CadState {
  device: BluetoothDevice | null;
  server: BluetoothRemoteGATTServer | null;
  char: BluetoothRemoteGATTCharacteristic | null;
  profile: CadenceProfile;
  dataListener: CadenceListener | null;
  statusListener: CadenceStatusListener | null;
  userDisconnect: boolean;
  reconnectInFlight: boolean;
  // Rolling cadence calculation state
  lastCrankRevs: number | null;
  lastEventTime: number | null; // 1/1024 s units
  emaRpm: number | null;
}

const cad: CadState = {
  device: null,
  server: null,
  char: null,
  profile: null,
  dataListener: null,
  statusListener: null,
  userDisconnect: false,
  reconnectInFlight: false,
  lastCrankRevs: null,
  lastEventTime: null,
  emaRpm: null,
};

/** EMA smoothing factor for cadence — 0.3 balances responsiveness vs. jitter. */
const CADENCE_EMA_ALPHA = 0.3;

export function onCadenceData(listener: CadenceListener | null): void {
  cad.dataListener = listener;
}

export function onCadenceStatus(listener: CadenceStatusListener | null): void {
  cad.statusListener = listener;
}

export function cadenceIsConnected(): boolean {
  return cad.server?.connected === true;
}

export function cadenceDeviceName(): string | null {
  return cad.device?.name ?? null;
}

export function cadenceProfile(): CadenceProfile {
  return cad.profile;
}

/**
 * Prompt the user to pick a cadence sensor.  We try CSC (0x1816) first; if
 * the device doesn't expose that service we fall back to Cycling Power
 * (0x1818) and parse the crank-revolution field.
 *
 * The `requestDevice` filter lists BOTH services so the browser chooser shows
 * any device advertising either one.
 */
export async function connectCadence(): Promise<void> {
  const support = detectBluetoothSupport();
  if (!support.apiPresent) {
    throw new BleSensorError('unsupported', support.reason ?? 'Web Bluetooth is not available.');
  }
  if (!support.secureContext) {
    throw new BleSensorError('insecure-context', 'Web Bluetooth requires HTTPS or localhost.');
  }

  cad.userDisconnect = false;
  resetCadenceState();
  cad.statusListener?.('connecting');

  try {
    cad.device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [CSC_SERVICE_UUID] },
        { services: [CYCLING_POWER_SERVICE_UUID] },
      ],
      optionalServices: [CSC_SERVICE_UUID, CYCLING_POWER_SERVICE_UUID],
    });
  } catch (err) {
    cad.statusListener?.('error');
    throw classifyChooserError(err);
  }

  cad.device.addEventListener('gattserverdisconnected', handleCadGattDisconnect);

  try {
    await setupCadSession(cad.device);
    cad.statusListener?.('connected');
  } catch (err) {
    cad.statusListener?.('error');
    void disconnectCadence().catch(() => undefined);
    throw err;
  }
}

async function setupCadSession(dev: BluetoothDevice): Promise<void> {
  if (!dev.gatt) throw new BleSensorError('gatt-connect-failed', 'Device has no GATT server.');

  try {
    cad.server = await dev.gatt.connect();
  } catch (err) {
    throw new BleSensorError('gatt-connect-failed', 'Could not open GATT connection to cadence sensor.', err);
  }

  // Try CSC first, then fall back to Cycling Power.
  const cscOk = await trySetupCsc();
  if (!cscOk) {
    const cpOk = await trySetupCyclingPower();
    if (!cpOk) {
      throw new BleSensorError(
        'service-not-found',
        'Neither CSC (0x1816) nor Cycling Power (0x1818) service found on this device.',
      );
    }
  }
}

async function trySetupCsc(): Promise<boolean> {
  if (!cad.server) return false;
  try {
    const service = await cad.server.getPrimaryService(CSC_SERVICE_UUID);
    const char = await service.getCharacteristic(CSC_MEASUREMENT_UUID);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', handleCscNotification);
    cad.char = char;
    cad.profile = 'csc';
    resetCadenceState();
    return true;
  } catch {
    return false;
  }
}

async function trySetupCyclingPower(): Promise<boolean> {
  if (!cad.server) return false;
  try {
    const service = await cad.server.getPrimaryService(CYCLING_POWER_SERVICE_UUID);
    const char = await service.getCharacteristic(CYCLING_POWER_MEASUREMENT_UUID);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', handleCyclingPowerNotification);
    cad.char = char;
    cad.profile = 'cycling-power';
    resetCadenceState();
    return true;
  } catch {
    return false;
  }
}

export async function disconnectCadence(): Promise<void> {
  cad.userDisconnect = true;
  try {
    if (cad.char) {
      const handler = cad.profile === 'csc' ? handleCscNotification : handleCyclingPowerNotification;
      cad.char.removeEventListener('characteristicvaluechanged', handler);
    }
    if (cad.device) {
      cad.device.removeEventListener('gattserverdisconnected', handleCadGattDisconnect);
    }
    if (cad.server?.connected) cad.server.disconnect();
  } finally {
    cad.char = null;
    cad.server = null;
    cad.device = null;
    cad.profile = null;
    resetCadenceState();
  }
  cad.statusListener?.('disconnected');
}

function resetCadenceState(): void {
  cad.lastCrankRevs = null;
  cad.lastEventTime = null;
  cad.emaRpm = null;
}

function handleCadGattDisconnect(): void {
  cad.char = null;
  if (cad.userDisconnect) {
    cad.server = null;
    cad.device = null;
    return;
  }
  cad.statusListener?.('reconnecting');
  if (!cad.device || cad.reconnectInFlight) return;
  cad.reconnectInFlight = true;
  void runReconnectLoop(
    cad.device,
    setupCadSession,
    () => cad.userDisconnect,
    (phase) => {
      if (phase === 'success') {
        cad.statusListener?.('connected');
      } else if (phase === 'failed') {
        cad.statusListener?.('error');
        cad.server = null;
        cad.device = null;
      }
    },
    () => {
      cad.server = null;
      cad.device = null;
    },
  ).finally(() => {
    cad.reconnectInFlight = false;
  });
}

// ---------------------------------------------------------------------------
// CSC Measurement parsing (0x2A5C)
// ---------------------------------------------------------------------------

/**
 * CSC Measurement flags:
 *   bit 0 → Wheel Revolution Data present
 *   bit 1 → Crank Revolution Data present
 *
 * Crank Revolution Data (when bit 1 set):
 *   uint16 LE  Cumulative Crank Revolutions
 *   uint16 LE  Last Crank Event Time  (1/1024 s)
 */
function handleCscNotification(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  if (!target.value) return;
  const rpm = parseCscCrankRpm(target.value);
  if (rpm !== null) pushCadence(rpm);
}

export function parseCscCrankRpm(view: DataView): number | null {
  if (view.byteLength < 1) return null;
  const flags = view.getUint8(0);
  const hasCrank = (flags & 0x02) !== 0;
  if (!hasCrank) return null;

  // Layout: flags(1) + optional wheel block(6 if bit 0 set) + crank block(4).
  // Wheel block = uint32 cumulative wheel revs + uint16 last wheel event time.
  const hasWheel = (flags & 0x01) !== 0;
  let off = 1;
  if (hasWheel) off += 6; // uint32 cumWheelRevs + uint16 lastWheelEventTime

  if (view.byteLength < off + 4) return null;
  const revs = view.getUint16(off, true);
  const time = view.getUint16(off + 2, true);

  return computeCrankRpm(revs, time);
}

// ---------------------------------------------------------------------------
// Cycling Power Measurement parsing (0x2A63)
// ---------------------------------------------------------------------------

/**
 * Cycling Power Measurement is large; we only need the crank revolution fields.
 *
 * Flags (uint16 LE at offset 0):
 *   bit 5 → Crank Revolution Data present
 *
 * Mandatory fields before crank data (when flags permit):
 *   offset 0: uint16 LE flags
 *   offset 2: int16 LE  instantaneous power (W)  — always present
 *
 * When bit 4 (Accumulated Torque) is set, 2 more bytes appear before crank.
 * When bit 5 is set, the crank block follows:
 *   uint16 LE  Cumulative Crank Revolutions
 *   uint16 LE  Last Crank Event Time  (1/1024 s)
 */
function handleCyclingPowerNotification(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  if (!target.value) return;
  const rpm = parseCyclingPowerCrankRpm(target.value);
  if (rpm !== null) pushCadence(rpm);
}

export function parseCyclingPowerCrankRpm(view: DataView): number | null {
  if (view.byteLength < 4) return null;
  const flags = view.getUint16(0, true);
  const hasCrank = (flags & (1 << 5)) !== 0;
  if (!hasCrank) return null;

  let off = 4; // flags(2) + instantaneous power(2)
  // bit 2: Accumulated Torque present (uint16)
  if (flags & (1 << 2)) off += 2;
  // bit 3: Wheel Revolution Data present (uint32 + uint16)
  if (flags & (1 << 3)) off += 6;
  // bit 4: (unused in this version, but some Garmin firmware sets it: uint16 Accumulated Torque)
  // The spec doesn't define bit4 for extra torque; leave alone.

  if (view.byteLength < off + 4) return null;
  const revs = view.getUint16(off, true);
  const time = view.getUint16(off + 2, true);

  return computeCrankRpm(revs, time);
}

// ---------------------------------------------------------------------------
// Shared cadence calculation
// ---------------------------------------------------------------------------

/**
 * Compute instantaneous cadence (rpm) from a pair of cumulative-crank-
 * revolution counter readings.
 *
 * Both the revolution counter and the event-time counter are uint16 and wrap
 * at 65536.  We handle roll-over by treating negative delta as a wrap.
 *
 * The event-time unit is 1/1024 second, so:
 *   rpm = (ΔRevs / ΔTime_in_1024ths) * 1024 * 60
 *
 * We skip the calculation when:
 *   - This is the first notification (no previous reading).
 *   - ΔTime == 0 (same event — sensor was stationary, don't divide by zero).
 *   - Computed rpm is obviously unphysical (> 250 rpm).
 */
function computeCrankRpm(revs: number, time: number): number | null {
  if (cad.lastCrankRevs === null || cad.lastEventTime === null) {
    cad.lastCrankRevs = revs;
    cad.lastEventTime = time;
    return null;
  }

  // uint16 roll-over: delta wraps at 65536.
  const deltaRevs = (revs - cad.lastCrankRevs + 65536) % 65536;
  const deltaTime = (time - cad.lastEventTime + 65536) % 65536;

  cad.lastCrankRevs = revs;
  cad.lastEventTime = time;

  if (deltaTime === 0) return cad.emaRpm; // no new crank event yet
  if (deltaRevs === 0) {
    // Sensor still spinning but no new revolution in this window — cadence
    // is below 1 rpm or the sensor stopped.  Return last EMA or 0.
    return cad.emaRpm ?? 0;
  }

  // 1/1024 s per tick → multiply by 1024 to get revs/s → multiply by 60 for rpm.
  const rawRpm = (deltaRevs / deltaTime) * 1024 * 60;

  // Sanity clamp — if a sensor glitches and emits a huge delta we ignore it.
  if (rawRpm > 250 || rawRpm < 0) return cad.emaRpm;

  // EMA smoothing.
  cad.emaRpm = cad.emaRpm === null
    ? rawRpm
    : cad.emaRpm + CADENCE_EMA_ALPHA * (rawRpm - cad.emaRpm);

  return cad.emaRpm;
}

function pushCadence(rpm: number): void {
  cad.dataListener?.(rpm);
}
