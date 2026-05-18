/**
 * Web Bluetooth client for the Bluetooth SIG "Fitness Machine Service" (FTMS).
 *
 * Tested against the Wahoo Kickr Core, but the FTMS spec is implemented by
 * every modern smart trainer (Tacx Neo, Saris H3, Elite Suito, JetBlack
 * Volt, etc.). The flow is:
 *
 *   1. Discover device advertising the Fitness Machine service.
 *   2. Connect GATT, get the service & three characteristics.
 *   3. Subscribe to indications on the Control Point.
 *   4. Subscribe to notifications on Indoor Bike Data.
 *   5. Write Request Control (0x00) → expect 0x80 0x00 0x01.
 *   6. Write Start (0x07) → expect 0x80 0x07 0x01.
 *   7. From here, set gradient with opcode 0x11 every 1–2 seconds.
 *
 * Reference implementation: github.com/wklenk/web-bluetooth-bike-trainer.
 */

import type { TrainerData } from '@/types';

// --- UUIDs ---------------------------------------------------------------

export const FTMS_SERVICE_UUID = '00001826-0000-1000-8000-00805f9b34fb';
const INDOOR_BIKE_DATA_UUID = '00002ad2-0000-1000-8000-00805f9b34fb';
const FTMS_CONTROL_POINT_UUID = '00002ad9-0000-1000-8000-00805f9b34fb';
const FTMS_FEATURE_UUID = '00002acc-0000-1000-8000-00805f9b34fb';

// --- Control point op codes ---------------------------------------------

const OP_REQUEST_CONTROL = 0x00;
const OP_RESET = 0x01;
const OP_START_RESUME = 0x07;
const OP_STOP_PAUSE = 0x08;
const OP_SET_SIM_PARAMS = 0x11;
const OP_RESPONSE = 0x80;

const RESULT_SUCCESS = 0x01;

// --- Public types --------------------------------------------------------

export type FtmsListener = (data: TrainerData) => void;
export type FtmsDisconnectListener = () => void;

export interface FtmsConnectOptions {
  /** Override the requestDevice prompt name filter. */
  namePrefix?: string;
}

// --- Module-level state --------------------------------------------------

let device: BluetoothDevice | null = null;
let server: BluetoothRemoteGATTServer | null = null;
let controlPoint: BluetoothRemoteGATTCharacteristic | null = null;
let indoorBikeData: BluetoothRemoteGATTCharacteristic | null = null;
let dataListener: FtmsListener | null = null;
let disconnectListener: FtmsDisconnectListener | null = null;

/** Subscribe to live trainer data. Replaces any previous listener. */
export function onTrainerData(listener: FtmsListener): void {
  dataListener = listener;
}

export function onDisconnect(listener: FtmsDisconnectListener): void {
  disconnectListener = listener;
}

export function isConnected(): boolean {
  return server?.connected === true;
}

export function getDeviceName(): string | null {
  return device?.name ?? null;
}

/**
 * Prompt the user to pick a smart trainer, negotiate control, and start the
 * data stream. Resolves once the trainer is in Simulation Mode and ready to
 * accept grade updates.
 */
export async function connect(opts: FtmsConnectOptions = {}): Promise<void> {
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth is not available in this browser. Use Chrome/Edge on desktop or Android.');
  }

  device = await navigator.bluetooth.requestDevice({
    filters: opts.namePrefix
      ? [{ namePrefix: opts.namePrefix }, { services: [FTMS_SERVICE_UUID] }]
      : [{ services: [FTMS_SERVICE_UUID] }],
    optionalServices: [FTMS_SERVICE_UUID],
  });

  device.addEventListener('gattserverdisconnected', handleGattDisconnect);

  if (!device.gatt) throw new Error('Selected device does not expose a GATT server.');
  server = await device.gatt.connect();

  const service = await server.getPrimaryService(FTMS_SERVICE_UUID);

  controlPoint = await service.getCharacteristic(FTMS_CONTROL_POINT_UUID);
  await controlPoint.startNotifications();
  controlPoint.addEventListener('characteristicvaluechanged', handleControlResponse);

  indoorBikeData = await service.getCharacteristic(INDOOR_BIKE_DATA_UUID);
  await indoorBikeData.startNotifications();
  indoorBikeData.addEventListener('characteristicvaluechanged', handleIndoorBikeData);

  // Optional — read feature flags for sanity. Some Wahoo firmware refuses
  // the read; ignore failures.
  try {
    const featureChar = await service.getCharacteristic(FTMS_FEATURE_UUID);
    await featureChar.readValue();
  } catch {
    /* not critical */
  }

  await writeControl(new Uint8Array([OP_REQUEST_CONTROL]));
  await writeControl(new Uint8Array([OP_START_RESUME]));
}

export async function disconnect(): Promise<void> {
  try {
    if (controlPoint) {
      await writeControl(new Uint8Array([OP_STOP_PAUSE])).catch(() => undefined);
      await writeControl(new Uint8Array([OP_RESET])).catch(() => undefined);
      controlPoint.removeEventListener('characteristicvaluechanged', handleControlResponse);
    }
    if (indoorBikeData) {
      indoorBikeData.removeEventListener('characteristicvaluechanged', handleIndoorBikeData);
    }
    if (server?.connected) server.disconnect();
  } finally {
    controlPoint = null;
    indoorBikeData = null;
    server = null;
    device = null;
  }
}

/**
 * Push a new simulated gradient to the trainer. Most trainers ignore wind
 * speed; we always send 0 m/s. Crr and Cw use realistic road-bike defaults.
 *
 * @param gradePct Slope in percent (+ uphill, − downhill). Internally
 *                 clamped to [-25, +25] for safety.
 */
export async function setGradient(gradePct: number): Promise<void> {
  if (!controlPoint) return;
  const clamped = Math.max(-25, Math.min(25, gradePct));
  const buf = new ArrayBuffer(7);
  const view = new DataView(buf);
  view.setUint8(0, OP_SET_SIM_PARAMS);
  view.setInt16(1, 0, true); // wind speed, m/s * 1000 — always 0
  view.setInt16(3, Math.round(clamped * 100), true); // grade %, scaled ×100
  view.setUint8(5, 40); // Crr = 0.0040  (×10000)
  view.setUint8(6, 51); // Cw  = 0.51    (×100), drag area for hoods
  await writeControl(new Uint8Array(buf));
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

function handleControlResponse(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const v = target.value;
  if (!v || v.byteLength < 3) return;
  const op = v.getUint8(0);
  if (op !== OP_RESPONSE) return;
  const requested = v.getUint8(1);
  const result = v.getUint8(2);
  if (result !== RESULT_SUCCESS) {
    // eslint-disable-next-line no-console
    console.warn(`[FTMS] op 0x${requested.toString(16)} failed with result 0x${result.toString(16)}`);
  }
}

function handleIndoorBikeData(event: Event): void {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const v = target.value;
  if (!v) return;
  const parsed = parseIndoorBikeData(v);
  dataListener?.(parsed);
}

function handleGattDisconnect(): void {
  controlPoint = null;
  indoorBikeData = null;
  server = null;
  disconnectListener?.();
}

/**
 * Parse the variable-length Indoor Bike Data notification per
 * FTMS spec §4.9.
 */
export function parseIndoorBikeData(view: DataView): TrainerData {
  let off = 0;
  const flags = view.getUint16(off, true);
  off += 2;
  const out: TrainerData = {};

  const has = (bit: number) => (flags & (1 << bit)) !== 0;
  const moreData = has(0); // bit 0: "More Data" — when SET, instant speed is omitted

  if (!moreData) {
    out.speed = (view.getUint16(off, true) / 100) / 3.6; // km/h → m/s
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
