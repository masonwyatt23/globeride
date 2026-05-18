/**
 * ERG / mode-switching façade.
 *
 * Originally a shim while the FTMS ERG implementation was built on a parallel
 * branch. That implementation now lives in `@/lib/ftms` (real Control Point
 * 0x05 Set Target Power, 0x11 Set Simulation Parameters, ERG/SIM mode state +
 * Kickr reliability). This module is now a thin re-export so the workout
 * engine (which imports from '@/lib/ftmsErg') transparently drives the real
 * trainer — single source of truth for control mode lives in ftms.ts.
 */

import {
  setTargetPower,
  setTrainerControlMode,
  getTrainerControlMode,
  setSimulationParams,
  isConnected,
  type SimParams,
  type TrainerControlMode,
} from '@/lib/ftms';

export {
  setTargetPower,
  setTrainerControlMode,
  getTrainerControlMode,
  setSimulationParams,
};
export type { SimParams, TrainerControlMode };

/**
 * True when a real FTMS trainer is connected (so ERG writes will land).
 * The workout engine uses this to choose trainer ERG vs demo physics.
 */
export function hasFtmsControlWriter(): boolean {
  return isConnected();
}

/**
 * Deprecated no-op. ftms.ts owns its Control Point characteristic directly,
 * so no external writer injection is needed. Kept so any legacy caller is
 * harmless.
 */
export function registerFtmsControlWriter(): void {
  /* no-op — ftms.ts manages its own GATT control point */
}
