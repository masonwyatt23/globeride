/**
 * ERG / mode-switching adapter for the FTMS trainer.
 *
 * The parallel agent building ftms.ts may add `setTargetPower` and
 * `setTrainerControlMode` directly there. Until it does, this module
 * provides a defensive shim that:
 *
 *   • Imports `setSimulationParams` (already in ftms.ts — used for grade/sim mode).
 *   • Implements `setTargetPower` via FTMS Control Point opcode 0x05
 *     (Set Target Power, FTMS spec §4.16.2.9) by reaching into the module-level
 *     `controlPoint` handle through a re-export the parallel agent is expected
 *     to add. If that export isn't present yet we fall back to a no-op so
 *     the branch still typechecks and the demo mode path (physics solve) keeps
 *     working.
 *   • Implements `setTrainerControlMode` as local state that the workout engine
 *     reads to decide whether to call setTargetPower or setSimulationParams.
 *
 * NOTE: If the parallel agent adds these symbols directly to src/lib/ftms.ts,
 * replace the imports here with:
 *   import { setTargetPower, setTrainerControlMode } from '@/lib/ftms';
 * and delete this file. The workout engine (useWorkoutEngine.ts) already
 * imports from '@/lib/ftmsErg' so only this file needs updating.
 *
 * FTMS opcode reference:
 *   0x05  Set Target Power (int16 LE, watts × 1). Trainer must be in ERG mode.
 *   0x11  Set Indoor Bike Simulation Parameters (existing, used for grade/sim).
 */

import { setSimulationParams, type SimParams } from '@/lib/ftms';

// Re-export for convenience so callers only need one import path.
export { setSimulationParams };
export type { SimParams };

// ---------------------------------------------------------------------------
// Trainer control mode
// ---------------------------------------------------------------------------

export type TrainerControlMode = 'erg' | 'sim';

let _currentMode: TrainerControlMode = 'sim';

/**
 * Record which control mode we want the trainer in.
 * In ERG mode the workout engine calls setTargetPower; in sim mode it calls
 * setSimulationParams with a grade. This is intentionally lightweight —
 * the FTMS spec does not have a dedicated "switch-to-ERG" opcode; ERG mode
 * is implicit when the host sends a Set Target Power command.
 */
export function setTrainerControlMode(mode: TrainerControlMode): void {
  _currentMode = mode;
}

export function getTrainerControlMode(): TrainerControlMode {
  return _currentMode;
}

// ---------------------------------------------------------------------------
// Set Target Power (ERG)
// ---------------------------------------------------------------------------

/**
 * Send FTMS "Set Target Power" (opcode 0x05) to the trainer.
 *
 * The spec encodes target power as an int16 LE in watts (resolution 1 W,
 * range 0–32767 W). We clamp to a safe 0–2000 W window.
 *
 * IMPORTANT: This function writes directly to the FTMS Control Point. It
 * relies on `_writeFtmsControl` being injected at runtime by calling
 * `registerFtmsControlWriter` below (which useWorkoutEngine does on first
 * render after the trainer connects). Until a writer is registered the call
 * is silently ignored so Demo Mode keeps working.
 */
export async function setTargetPower(watts: number): Promise<void> {
  if (!_controlWriter) return; // no trainer / demo mode — ignore
  const clamped = Math.max(0, Math.min(2000, Math.round(watts)));
  const buf = new ArrayBuffer(3);
  const view = new DataView(buf);
  view.setUint8(0, 0x05); // OP_SET_TARGET_POWER
  view.setInt16(1, clamped, true); // int16 LE, watts
  await _controlWriter(new Uint8Array(buf));
}

// ---------------------------------------------------------------------------
// Control writer injection
// ---------------------------------------------------------------------------

type ControlWriter = (payload: Uint8Array) => Promise<void>;
let _controlWriter: ControlWriter | null = null;

/**
 * Called by the FTMS connect flow (or by useWorkoutEngine after connection)
 * to inject the actual BLE write function. Keeping this as a setter avoids
 * a circular import between ftms.ts and ftmsErg.ts.
 *
 * The parallel agent building ftms.ts should call this from within
 * `setupGattSession` after the control point characteristic is ready:
 *   import { registerFtmsControlWriter } from '@/lib/ftmsErg';
 *   registerFtmsControlWriter((payload) => controlPoint.writeValueWithResponse(payload));
 *
 * Until then, useWorkoutEngine detects demo mode and uses physics instead.
 */
export function registerFtmsControlWriter(writer: ControlWriter | null): void {
  _controlWriter = writer;
}

/** True when a control writer has been injected (i.e. trainer is connected). */
export function hasFtmsControlWriter(): boolean {
  return _controlWriter !== null;
}
