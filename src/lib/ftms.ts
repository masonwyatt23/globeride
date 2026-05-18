/**
 * Web Bluetooth client for the Bluetooth SIG "Fitness Machine Service" (FTMS).
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PUBLIC API SURFACE (consumed by useRideLoop + workout engine)
 * ║
 * ║  connect(opts?)          → Promise<void>
 * ║    Prompt the user to pick an FTMS trainer, GATT-connect,
 * ║    negotiate control, and start the data stream.
 * ║    Throws FtmsError with discriminable .code.
 * ║
 * ║  disconnect()            → Promise<void>
 * ║    Send Stop + Reset, tear down listeners, null all handles.
 * ║
 * ║  setTargetPower(watts)   → Promise<void>
 * ║    ERG MODE: FTMS opcode 0x05 "Set Target Power".
 * ║    Payload: [0x05, sint16 LE watts].
 * ║    Silently no-ops when not connected.
 * ║    Clamps to [0, 2000] W for safety.
 * ║
 * ║  setSimulationParams({   → Promise<void>
 * ║    gradePct,             SIM MODE: FTMS opcode 0x11.
 * ║    windMs?,              Grade clamped to ±25 %.
 * ║    crrScaled?,           Existing call-site API preserved.
 * ║    cwScaled? })
 * ║
 * ║  setTrainerControlMode('erg' | 'sim') → void
 * ║    Switches the active control mode.  The ride loop reads
 * ║    this to decide which opcode to call each frame.
 * ║    'erg'  → calls setTargetPower; ignores grade
 * ║    'sim'  → calls setSimulationParams; ignores target power
 * ║    Default: 'sim'
 * ║
 * ║  getTrainerControlMode() → 'erg' | 'sim'
 * ║
 * ║  isConnected()           → boolean
 * ║  getDeviceName()         → string | null
 * ║  getBatteryLevel()       → number | null
 * ║
 * ║  ── Subscriptions (replace any previous listener) ──────────
 * ║  onTrainerData(fn)        data: TrainerData
 * ║  onDisconnect(fn)         { unexpected: boolean }
 * ║  onReconnect(fn)          ReconnectEvent
 * ║  onBatteryLevel(fn)       level: number
 * ║  onControlPointError(fn)  ControlPointError
 * ║  onModeChange(fn)         'erg' | 'sim'
 * ║
 * ║  ── Workout engine ERG integration ─────────────────────────
 * ║  1. Call setTrainerControlMode('erg') when entering a
 * ║     structured workout segment with a power target.
 * ║  2. Each frame (throttled ~1 Hz), call
 * ║     setTargetPower(resolvedWatts). The ride loop MUST skip
 * ║     setSimulationParams while mode === 'erg'.
 * ║  3. For grade/free segments, call setTrainerControlMode('sim')
 * ║     and resume calling setSimulationParams(...) as before.
 * ║  4. On workout end / ride finish, call
 * ║     setTrainerControlMode('sim') to restore normal routing.
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Tested against the Wahoo Kickr Core, but the FTMS spec is implemented by
 * every modern smart trainer (Tacx Neo, Saris H3, Elite Suito, JetBlack
 * Volt, etc.). The flow is:
 *
 *   1. Discover device advertising the Fitness Machine service.
 *   2. Connect GATT, get the service & three characteristics.
 *   3. Subscribe to indications on the Control Point.
 *   4. Subscribe to notifications on Indoor Bike Data.
 *   5. Write Request Control (0x00) -> expect 0x80 0x00 0x01.
 *   6. Write Start (0x07) -> expect 0x80 0x07 0x01.
 *   7a. SIM mode: set gradient with opcode 0x11 every 1-2 seconds.
 *   7b. ERG mode: set target power with opcode 0x05 every 1-2 seconds.
 *
 * Reference implementation: github.com/wklenk/web-bluetooth-bike-trainer.
 *
 * On unexpected disconnect (cable yanked, trainer slept, BLE radio
 * hiccup) we transparently retry GATT reconnect on the same device handle
 * with capped exponential backoff. The user-facing UI surfaces this as a
 * `reconnecting` state without tearing down the session.
 *
 * Optional characteristics subscribed when present:
 *   - FTMS Training Status (0x2AD3): reflects trainer training state.
 *   - Fitness Machine Status (0x2ADA): reflects async trainer events
 *     (e.g., "stopped by safety key", "fitness machine stopped").
 *   - Battery Service (0x180F / 0x2A19): battery level %.
 */

import { detectBluetoothSupport } from './bluetoothSupport';
import type { TrainerData } from '@/types';

// --- UUIDs ---------------------------------------------------------------

export const FTMS_SERVICE_UUID = '00001826-0000-1000-8000-00805f9b34fb';
const INDOOR_BIKE_DATA_UUID         = '00002ad2-0000-1000-8000-00805f9b34fb';
const FTMS_CONTROL_POINT_UUID       = '00002ad9-0000-1000-8000-00805f9b34fb';
const FTMS_FEATURE_UUID             = '00002acc-0000-1000-8000-00805f9b34fb';
const FTMS_TRAINING_STATUS_UUID     = '00002ad3-0000-1000-8000-00805f9b34fb';
const FITNESS_MACHINE_STATUS_UUID   = '00002ada-0000-1000-8000-00805f9b34fb';

const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL_UUID   = '00002a19-0000-1000-8000-00805f9b34fb';

// --- Control point op codes ---------------------------------------------

const OP_REQUEST_CONTROL  = 0x00;
const OP_RESET            = 0x01;
const OP_SET_TARGET_POWER = 0x05;
const OP_START_RESUME     = 0x07;
const OP_STOP_PAUSE       = 0x08;
const OP_SET_SIM_PARAMS   = 0x11;
const OP_RESPONSE         = 0x80;

const RESULT_SUCCESS               = 0x01;
const RESULT_OP_NOT_SUPPORTED      = 0x02;
const RESULT_INVALID_PARAMETER     = 0x03;
const RESULT_OP_FAILED             = 0x04;
const RESULT_CONTROL_NOT_PERMITTED = 0x05;

// --- ERG / SIM safety limits --------------------------------------------

/** Maximum wattage we will ever write to the trainer (prevents runaway ERG). */
const ERG_MAX_WATTS = 2000;
/** Grade clamp for sim mode (standard smart-trainer limit). */
const SIM_MAX_GRADE_PCT = 25;

// --- Reconnect tuning ---------------------------------------------------

const RECONNECT_MAX_ATTEMPTS  = 4;
const RECONNECT_BASE_DELAY_MS = 600;
const RECONNECT_MAX_DELAY_MS  = 4_000;

// --- Public types --------------------------------------------------------

export type TrainerControlMode = 'erg' | 'sim';

export type FtmsListener             = (data: TrainerData) => void;
export type FtmsDisconnectListener   = (info: { unexpected: boolean }) => void;
export type FtmsReconnectListener    = (info: ReconnectEvent) => void;
export type FtmsBatteryListener      = (level: number) => void;
export type FtmsControlErrorListener = (err: ControlPointError) => void;
export type FtmsModeChangeListener   = (mode: TrainerControlMode) => void;

export type ReconnectEvent =
  | { phase: 'start';   attempt: number; maxAttempts: number }
  | { phase: 'attempt'; attempt: number; maxAttempts: number }
  | { phase: 'success'; attempt: number }
  | { phase: 'failed';  attempts: number };

export interface ControlPointError {
  opcode: number;
  /** Decoded result byte from the indication. */
  resultCode: number;
  resultText: string;
  message: string;
}

/**
 * Stable, discriminable error type for the FTMS connect path. The UI maps
 * `code` to a friendly message and (sometimes) a remediation action.
 */
export type FtmsErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'no-device-selected'
  | 'no-device-found'
  | 'gatt-connect-failed'
  | 'service-not-found'
  | 'control-point-failed'
  | 'already-paired-elsewhere'
  | 'unknown';

export class FtmsError extends Error {
  readonly code: FtmsErrorCode;
  readonly cause?: unknown;
  constructor(code: FtmsErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'FtmsError';
    this.code = code;
    this.cause = cause;
  }
}

export interface FtmsConnectOptions {
  /** Override the requestDevice prompt name filter. */
  namePrefix?: string;
}

// --- Module-level state --------------------------------------------------

let device:       BluetoothDevice | null = null;
let server:       BluetoothRemoteGATTServer | null = null;
let controlPoint: BluetoothRemoteGATTCharacteristic | null = null;
let indoorBikeData: BluetoothRemoteGATTCharacteristic | null = null;
let batteryLevel: BluetoothRemoteGATTCharacteristic | null = null;
// Optional status characteristics (best-effort; many trainers omit them)
let trainingStatus:       BluetoothRemoteGATTCharacteristic | null = null;
let fitnessMachineStatus: BluetoothRemoteGATTCharacteristic | null = null;

let dataListener:         FtmsListener | null = null;
let disconnectListener:   FtmsDisconnectListener | null = null;
let reconnectListener:    FtmsReconnectListener | null = null;
let batteryListener:      FtmsBatteryListener | null = null;
let controlErrorListener: FtmsControlErrorListener | null = null;
let modeChangeListener:   FtmsModeChangeListener | null = null;

/** Active trainer control mode -- 'sim' default matches existing behaviour. */
let trainerControlMode: TrainerControlMode = 'sim';

/** Flag set by `disconnect()` so we don't treat a user-initiated tear-down
 *  as an unexpected drop. */
let userInitiatedDisconnect = false;
let reconnectInFlight = false;
let lastBatteryLevel: number | null = null;

// --- Subscriptions -------------------------------------------------------

/** Subscribe to live trainer data. Replaces any previous listener. */
export function onTrainerData(listener: FtmsListener): void {
  dataListener = listener;
}

export function onDisconnect(listener: FtmsDisconnectListener): void {
  disconnectListener = listener;
}

export function onReconnect(listener: FtmsReconnectListener): void {
  reconnectListener = listener;
}

export function onBatteryLevel(listener: FtmsBatteryListener): void {
  batteryListener = listener;
  if (lastBatteryLevel !== null) listener(lastBatteryLevel);
}

export function onControlPointError(listener: FtmsControlErrorListener): void {
  controlErrorListener = listener;
}

/** Subscribe to ERG <-> SIM mode transitions. Replaces any previous listener. */
export function onModeChange(listener: FtmsModeChangeListener): void {
  modeChangeListener = listener;
}

export function isConnected(): boolean {
  return server?.connected === true;
}

export function getDeviceName(): string | null {
  return device?.name ?? null;
}

export function getBatteryLevel(): number | null {
  return lastBatteryLevel;
}

/**
 * Switch between ERG and SIM control modes.
 * Notifies any registered modeChange listener.
 * Safe to call whether or not the trainer is connected.
 */
export function setTrainerControlMode(mode: TrainerControlMode): void {
  if (trainerControlMode === mode) return;
  trainerControlMode = mode;
  modeChangeListener?.(mode);
}

/** Read the current ERG/SIM mode without side effects. */
export function getTrainerControlMode(): TrainerControlMode {
  return trainerControlMode;
}

// --- Connect / disconnect -----------------------------------------------

/**
 * Prompt the user to pick a smart trainer, negotiate control, and start the
 * data stream. Resolves once the trainer is ready to accept updates.
 * Throws `FtmsError` with a discriminable `code`.
 */
export async function connect(opts: FtmsConnectOptions = {}): Promise<void> {
  const support = detectBluetoothSupport();
  if (!support.apiPresent) {
    throw new FtmsError(
      'unsupported',
      support.reason ?? 'Web Bluetooth is not available in this browser.',
    );
  }
  if (!support.secureContext) {
    throw new FtmsError(
      'insecure-context',
      'Web Bluetooth requires HTTPS or localhost. Reload the app from a secure origin.',
    );
  }

  userInitiatedDisconnect = false;
  lastBatteryLevel = null;

  // 1. Device chooser
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: opts.namePrefix
        ? [{ namePrefix: opts.namePrefix }, { services: [FTMS_SERVICE_UUID] }]
        : [{ services: [FTMS_SERVICE_UUID] }],
      optionalServices: [
        FTMS_SERVICE_UUID,
        BATTERY_SERVICE_UUID,
      ],
    });
  } catch (err) {
    throw classifyChooserError(err);
  }

  device.addEventListener('gattserverdisconnected', handleGattDisconnect);

  if (!device.gatt) {
    throw new FtmsError('gatt-connect-failed', 'The selected device does not expose a GATT server.');
  }

  // 2. GATT + FTMS service
  try {
    await setupGattSession(device);
  } catch (err) {
    // Tear down anything partial so a retry starts clean.
    void disconnect().catch(() => undefined);
    throw err;
  }
}

/** Internal: GATT connect + characteristic wiring + start/resume handshake. */
async function setupGattSession(dev: BluetoothDevice): Promise<void> {
  if (!dev.gatt) throw new FtmsError('gatt-connect-failed', 'Device has no GATT.');

  try {
    server = await dev.gatt.connect();
  } catch (err) {
    throw new FtmsError(
      'gatt-connect-failed',
      'Could not open a GATT connection. Wake the trainer (one pedal stroke) and try again.',
      err,
    );
  }

  let service: BluetoothRemoteGATTService;
  try {
    service = await server.getPrimaryService(FTMS_SERVICE_UUID);
  } catch (err) {
    throw new FtmsError(
      'service-not-found',
      "The trainer didn't advertise the FTMS service. It may already be paired with another app -- quit Zwift / Wahoo / TrainerRoad and try again.",
      err,
    );
  }

  try {
    controlPoint = await service.getCharacteristic(FTMS_CONTROL_POINT_UUID);
    await controlPoint.startNotifications();
    controlPoint.addEventListener('characteristicvaluechanged', handleControlResponse);

    indoorBikeData = await service.getCharacteristic(INDOOR_BIKE_DATA_UUID);
    await indoorBikeData.startNotifications();
    indoorBikeData.addEventListener('characteristicvaluechanged', handleIndoorBikeData);
  } catch (err) {
    throw new FtmsError(
      'service-not-found',
      'FTMS characteristics could not be subscribed. This trainer may use a non-standard FTMS profile.',
      err,
    );
  }

  // Optional -- read feature flags for sanity. Some Wahoo firmware refuses
  // the read; ignore failures.
  try {
    const featureChar = await service.getCharacteristic(FTMS_FEATURE_UUID);
    await featureChar.readValue();
  } catch {
    /* not critical */
  }

  // Optional -- Training Status (0x2AD3). Subscribed best-effort.
  try {
    trainingStatus = await service.getCharacteristic(FTMS_TRAINING_STATUS_UUID);
    await trainingStatus.startNotifications();
    trainingStatus.addEventListener('characteristicvaluechanged', handleTrainingStatus);
  } catch {
    trainingStatus = null;
  }

  // Optional -- Fitness Machine Status (0x2ADA). Notifies async trainer events
  // (stop, start, reset, spin-down request, control-permission-lost, etc.).
  try {
    fitnessMachineStatus = await service.getCharacteristic(FITNESS_MACHINE_STATUS_UUID);
    await fitnessMachineStatus.startNotifications();
    fitnessMachineStatus.addEventListener('characteristicvaluechanged', handleFitnessMachineStatus);
  } catch {
    fitnessMachineStatus = null;
  }

  // Optional -- Battery Service. Many smart trainers expose it; we surface
  // the value as a status badge so the user can see when it's getting low.
  try {
    const batterySvc = await server.getPrimaryService(BATTERY_SERVICE_UUID);
    batteryLevel = await batterySvc.getCharacteristic(BATTERY_LEVEL_UUID);
    const initial = await batteryLevel.readValue();
    handleBatteryRead(initial);
    try {
      await batteryLevel.startNotifications();
      batteryLevel.addEventListener('characteristicvaluechanged', handleBatteryNotify);
    } catch {
      /* notifications optional */
    }
  } catch {
    batteryLevel = null;
  }

  // Handshake -- Request Control then Start/Resume.
  // The Kickr Core requires this exact sequence before accepting any
  // control-point write. If another app holds control we will get
  // RESULT_CONTROL_NOT_PERMITTED back, which writeControl will surface.
  try {
    await writeControl(new Uint8Array([OP_REQUEST_CONTROL]));
    await writeControl(new Uint8Array([OP_START_RESUME]));
  } catch (err) {
    throw new FtmsError(
      'control-point-failed',
      'The trainer refused the control handshake. It may be claimed by another Bluetooth client.',
      err,
    );
  }
}

export async function disconnect(): Promise<void> {
  userInitiatedDisconnect = true;
  try {
    if (controlPoint) {
      await writeControl(new Uint8Array([OP_STOP_PAUSE])).catch(() => undefined);
      await writeControl(new Uint8Array([OP_RESET])).catch(() => undefined);
      controlPoint.removeEventListener('characteristicvaluechanged', handleControlResponse);
    }
    if (indoorBikeData) {
      indoorBikeData.removeEventListener('characteristicvaluechanged', handleIndoorBikeData);
    }
    if (batteryLevel) {
      batteryLevel.removeEventListener('characteristicvaluechanged', handleBatteryNotify);
    }
    if (trainingStatus) {
      trainingStatus.removeEventListener('characteristicvaluechanged', handleTrainingStatus);
    }
    if (fitnessMachineStatus) {
      fitnessMachineStatus.removeEventListener('characteristicvaluechanged', handleFitnessMachineStatus);
    }
    if (device) {
      device.removeEventListener('gattserverdisconnected', handleGattDisconnect);
    }
    if (server?.connected) server.disconnect();
  } finally {
    controlPoint = null;
    indoorBikeData = null;
    batteryLevel = null;
    trainingStatus = null;
    fitnessMachineStatus = null;
    server = null;
    device = null;
    lastBatteryLevel = null;
  }
}

// --- ERG: Set Target Power (opcode 0x05) --------------------------------

/**
 * ERG mode: command the trainer to hold `watts` of resistance.
 * Uses FTMS Control Point opcode 0x05 "Set Target Power".
 * Payload: [0x05, sint16 LE watts].
 *
 * Silently no-ops when not connected -- safe to call every frame in the
 * ride loop; guard on s.connection === 'connected' to avoid the overhead.
 */
export async function setTargetPower(watts: number): Promise<void> {
  if (!controlPoint) return;
  await writeControl(encodeSetTargetPower(watts));
}

// --- SIM: Set Simulation Parameters (opcode 0x11) -----------------------

export interface SimParams {
  /** Grade in percent, + uphill. */
  gradePct: number;
  /** Headwind speed in m/s, + against rider (subtracted from rider's perceived speed). */
  windMs?: number;
  /** Crr x 10000, e.g. 40 = 0.0040 (road tarmac). 0-255. */
  crrScaled?: number;
  /** Cw x 100, e.g. 51 = 0.51 (hoods position). 0-255. */
  cwScaled?: number;
}

/**
 * SIM mode: push a new simulated gradient + (optionally) wind/Crr/Cw to the
 * trainer. Most trainers fold wind into the perceived resistance; some ignore
 * it. Internally clamps grade to +-25 % for safety.
 */
export async function setSimulationParams(params: SimParams): Promise<void> {
  if (!controlPoint) return;
  await writeControl(
    encodeSetSimulationParams(
      params.gradePct,
      params.windMs,
      params.crrScaled,
      params.cwScaled,
    ),
  );
}

/**
 * Back-compat shim -- kept so older call sites keep working. New code should
 * use `setSimulationParams` so user-tuned Crr/Cw/wind reach the trainer.
 */
export async function setGradient(gradePct: number): Promise<void> {
  await setSimulationParams({ gradePct });
}

/** Internal: serialized write to the control point. */
async function writeControl(payload: Uint8Array): Promise<void> {
  if (!controlPoint) throw new Error('FTMS control point not available');
  // writeValueWithResponse blocks until the indication response arrives,
  // which is required for FTMS reliability on macOS / Linux BlueZ stacks.
  // The TS 5.7+ Uint8Array generic over ArrayBufferLike is too loose for
  // the DOM `BufferSource` signature; assert to a plain BufferSource.
  await controlPoint.writeValueWithResponse(payload as unknown as BufferSource);
}

// --- Indication / notification handlers ---------------------------------

function handleControlResponse(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const v = target.value;
  if (!v || v.byteLength < 3) return;
  const op        = v.getUint8(0);
  if (op !== OP_RESPONSE) return;
  const requested = v.getUint8(1);
  const result    = v.getUint8(2);
  if (result !== RESULT_SUCCESS) {
    const err: ControlPointError = {
      opcode: requested,
      resultCode: result,
      resultText: resultCodeText(result),
      message: friendlyControlError(requested, result),
    };
    // eslint-disable-next-line no-console
    console.warn(`[FTMS] op 0x${requested.toString(16)} -> ${err.resultText}`);
    controlErrorListener?.(err);
  }
}

function resultCodeText(code: number): string {
  switch (code) {
    case RESULT_SUCCESS:               return 'success';
    case RESULT_OP_NOT_SUPPORTED:      return 'op-not-supported';
    case RESULT_INVALID_PARAMETER:     return 'invalid-parameter';
    case RESULT_OP_FAILED:             return 'operation-failed';
    case RESULT_CONTROL_NOT_PERMITTED: return 'control-not-permitted';
    default:                           return `unknown-0x${code.toString(16)}`;
  }
}

function friendlyControlError(opcode: number, resultCode: number): string {
  const opLabel =
    opcode === OP_SET_TARGET_POWER ? 'ERG target power'
    : opcode === OP_SET_SIM_PARAMS  ? 'gradient update'
    : opcode === OP_REQUEST_CONTROL ? 'control handshake'
    : opcode === OP_START_RESUME    ? 'start command'
    : `op 0x${opcode.toString(16)}`;

  switch (resultCode) {
    case RESULT_OP_NOT_SUPPORTED:
      return `Trainer doesn't support ${opLabel}. Resistance won't follow the route.`;
    case RESULT_INVALID_PARAMETER:
      return `Trainer rejected ${opLabel} as out of range.`;
    case RESULT_CONTROL_NOT_PERMITTED:
      return `Trainer refused ${opLabel} -- another app may be controlling it. Quit Zwift / Wahoo / TrainerRoad and reconnect.`;
    case RESULT_OP_FAILED:
    default:
      return `Trainer reported ${opLabel} failed (${resultCodeText(resultCode)}).`;
  }
}

function handleIndoorBikeData(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const v = target.value;
  if (!v) return;
  const parsed = parseIndoorBikeData(v);
  dataListener?.(parsed);
}

/**
 * Training Status (0x2AD3) -- reflects the trainer's internal workout phase.
 * Logged for diagnostics; available for future UI use.
 */
function handleTrainingStatus(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const v = target.value;
  if (!v || v.byteLength < 1) return;
  const statusByte = v.getUint8(0);
  // eslint-disable-next-line no-console
  console.debug(`[FTMS] Training status: 0x${statusByte.toString(16).padStart(2, '0')}`);
}

/**
 * Fitness Machine Status (0x2ADA) -- async trainer events.
 * Op codes of interest:
 *   0x02 = Stopped or Paused by User
 *   0x04 = Stopped by Safety Key
 *   0xFF = Control Permission Lost
 *
 * We map the loss-of-control codes to a ControlPointError so the UI can
 * surface them through the existing controlErrorListener path.
 */
function handleFitnessMachineStatus(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const v = target.value;
  if (!v || v.byteLength < 1) return;
  const opCode = v.getUint8(0);

  const MACHINE_STOPPED_BY_USER  = 0x02;
  const MACHINE_STOPPED_SAFE_KEY = 0x04;
  const CONTROL_PERMISSION_LOST  = 0xff;

  // eslint-disable-next-line no-console
  console.debug(`[FTMS] Machine status: 0x${opCode.toString(16).padStart(2, '0')}`);

  if (opCode === CONTROL_PERMISSION_LOST) {
    controlErrorListener?.({
      opcode: opCode,
      resultCode: RESULT_CONTROL_NOT_PERMITTED,
      resultText: 'control-not-permitted',
      message:
        'Another app took control of the trainer. Reconnect GlobeRide to regain control.',
    });
  } else if (opCode === MACHINE_STOPPED_BY_USER || opCode === MACHINE_STOPPED_SAFE_KEY) {
    controlErrorListener?.({
      opcode: opCode,
      resultCode: RESULT_OP_FAILED,
      resultText: 'machine-stopped',
      message:
        opCode === MACHINE_STOPPED_SAFE_KEY
          ? 'Trainer stopped by safety key. Remove and re-insert to resume.'
          : 'Trainer was stopped or paused by the user.',
    });
  }
}

function handleBatteryNotify(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  if (!target.value) return;
  handleBatteryRead(target.value);
}

function handleBatteryRead(v: DataView): void {
  if (v.byteLength < 1) return;
  const pct = v.getUint8(0);
  lastBatteryLevel = pct;
  batteryListener?.(pct);
}

function handleGattDisconnect(): void {
  controlPoint = null;
  indoorBikeData = null;
  batteryLevel = null;
  trainingStatus = null;
  fitnessMachineStatus = null;
  // Don't null out `server` / `device` -- we need the BluetoothDevice handle
  // to attempt a silent re-connect (it survives across GATT drops as long
  // as the page still holds the user-granted permission).

  if (userInitiatedDisconnect) {
    disconnectListener?.({ unexpected: false });
    server = null;
    device = null;
    return;
  }

  disconnectListener?.({ unexpected: true });

  if (!device) return;
  if (reconnectInFlight) return;
  void runReconnectLoop(device);
}

async function runReconnectLoop(dev: BluetoothDevice): Promise<void> {
  reconnectInFlight = true;
  reconnectListener?.({ phase: 'start', attempt: 1, maxAttempts: RECONNECT_MAX_ATTEMPTS });

  try {
    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
      reconnectListener?.({ phase: 'attempt', attempt, maxAttempts: RECONNECT_MAX_ATTEMPTS });

      const delay = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
      );
      await sleep(delay);

      // If the user explicitly disconnected mid-loop, abort.
      if (userInitiatedDisconnect) return;

      try {
        await setupGattSession(dev);
        reconnectListener?.({ phase: 'success', attempt });
        return;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[FTMS] reconnect attempt ${attempt} failed`, err);
      }
    }
    reconnectListener?.({ phase: 'failed', attempts: RECONNECT_MAX_ATTEMPTS });
    // Give up -- clean state for next manual pair.
    server = null;
    device = null;
  } finally {
    reconnectInFlight = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// --- Error classification ------------------------------------------------

/**
 * Map the raw exception thrown by `requestDevice` to a stable FtmsError.
 * The Web Bluetooth spec throws DOMException with `name` values like
 * "NotFoundError" (user cancelled) or "SecurityError" (no permission).
 */
function classifyChooserError(err: unknown): FtmsError {
  if (err instanceof FtmsError) return err;
  if (err instanceof DOMException || err instanceof Error) {
    const name    = (err as DOMException).name ?? '';
    const message = err.message ?? '';

    // `NotFoundError` is what Chrome throws both when the user closes the
    // chooser AND when no devices matched the filter. The message text is
    // currently the only signal that distinguishes them.
    if (name === 'NotFoundError') {
      if (/user cancelled|cancelled/i.test(message)) {
        return new FtmsError('no-device-selected', 'You closed the device chooser before picking a trainer.', err);
      }
      return new FtmsError(
        'no-device-found',
        "No FTMS-compatible trainer was discovered. Make sure it's awake (pedal once), close other apps that might have claimed it, and try again.",
        err,
      );
    }
    if (name === 'SecurityError' || /permission/i.test(message)) {
      return new FtmsError(
        'permission-denied',
        'The browser blocked Bluetooth access. Allow it in the site permissions and try again.',
        err,
      );
    }
    if (name === 'NotSupportedError') {
      return new FtmsError(
        'unsupported',
        "This browser reports Bluetooth as unsupported. Use Chrome or Edge on a supported platform.",
        err,
      );
    }
    if (name === 'NetworkError') {
      return new FtmsError(
        'gatt-connect-failed',
        'The trainer dropped during connection setup. Wake it (pedal once) and try again.',
        err,
      );
    }
  }
  return new FtmsError('unknown', err instanceof Error ? err.message : 'Unknown Bluetooth error', err);
}

// --- Parsing -------------------------------------------------------------

/**
 * Parse the variable-length Indoor Bike Data notification per
 * FTMS spec section 4.9.
 */
export function parseIndoorBikeData(view: DataView): TrainerData {
  let off = 0;
  const flags = view.getUint16(off, true);
  off += 2;
  const out: TrainerData = {};

  const has = (bit: number) => (flags & (1 << bit)) !== 0;
  const moreData = has(0); // bit 0: "More Data" -- when SET, instant speed is omitted

  if (!moreData) {
    out.speed = (view.getUint16(off, true) / 100) / 3.6; // km/h -> m/s
    off += 2;
  }
  if (has(1)) off += 2; // average speed
  if (has(2)) {
    out.cadence = view.getUint16(off, true) / 2;
    off += 2;
  }
  if (has(3)) off += 2; // average cadence
  if (has(4)) {
    // Total Distance is uint24 LE.
    out.distance = view.getUint8(off) | (view.getUint8(off + 1) << 8) | (view.getUint8(off + 2) << 16);
    off += 3;
  }
  if (has(5)) {
    out.resistance = view.getInt16(off, true);
    off += 2;
  }
  if (has(6)) {
    out.power = view.getInt16(off, true);
    off += 2;
  }
  if (has(7)) off += 2; // average power
  if (has(8)) off += 5; // expended energy (uint16 + uint16 + uint8)
  if (has(9)) {
    out.heartRate = view.getUint8(off);
    off += 1;
  }
  // Remaining flag bits are not needed for basic riding.
  return out;
}

// --- Payload encoding helpers (exported for unit tests) ------------------

/**
 * Build the raw 3-byte payload for FTMS opcode 0x05 Set Target Power.
 * Exported so unit tests can verify encoding without a real BLE device.
 * @param watts  Target power in watts, clamped to [0, 2000].
 * @returns      Uint8Array: [0x05, lo, hi] (sint16 LE, little-endian).
 */
export function encodeSetTargetPower(watts: number): Uint8Array {
  const clamped = Math.max(0, Math.min(ERG_MAX_WATTS, Math.round(watts)));
  const buf  = new ArrayBuffer(3);
  const view = new DataView(buf);
  view.setUint8(0, OP_SET_TARGET_POWER);
  // sint16 LE -- FTMS spec defines this as a signed 16-bit integer.
  view.setInt16(1, clamped, true);
  return new Uint8Array(buf);
}

/**
 * Build the raw 7-byte payload for FTMS opcode 0x11 Set Indoor Bike
 * Simulation Parameters. Exported so unit tests can verify encoding.
 * @param gradePct  Grade %, clamped to +-25.
 * @param windMs    Headwind m/s (default 0).
 * @param crr       Crr x 10000 byte (default 40).
 * @param cw        Cw x 100 byte (default 51).
 * @returns         Uint8Array: [0x11, windLo, windHi, gradeLo, gradeHi, crr, cw].
 */
export function encodeSetSimulationParams(
  gradePct: number,
  windMs = 0,
  crr = 40,
  cw  = 51,
): Uint8Array {
  const grade   = Math.max(-SIM_MAX_GRADE_PCT, Math.min(SIM_MAX_GRADE_PCT, gradePct));
  const windMmS = Math.round(Math.max(-32, Math.min(32, windMs ?? 0)) * 1000);
  const crrByte = Math.max(0, Math.min(255, crr ?? 40));
  const cwByte  = Math.max(0, Math.min(255, cw ?? 51));

  const buf  = new ArrayBuffer(7);
  const view = new DataView(buf);
  view.setUint8(0, OP_SET_SIM_PARAMS);
  view.setInt16(1, windMmS, true);
  view.setInt16(3, Math.round(grade * 100), true);
  view.setUint8(5, crrByte);
  view.setUint8(6, cwByte);
  return new Uint8Array(buf);
}
