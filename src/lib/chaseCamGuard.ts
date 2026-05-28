import type { RideState } from '@/types';

/**
 * Predicate for whether the chase cam should be actively updating the
 * Cesium camera each frame. Exists as a standalone helper so the
 * regression we hit twice — gating on too narrow a state set — is
 * covered by unit tests instead of only catching it via a real-browser
 * smoke run.
 *
 * Engage when the route is loaded (`ready`/`running`/`paused`) so the
 * user always sees the chase angle on entering /ride, not just after
 * pressing Start. Disengage on `idle` (no route) and `finished` (the
 * FinishCard overlay should not have the camera lurching).
 */
export function shouldChaseCamUpdate(rideState: RideState): boolean {
  return rideState !== 'idle' && rideState !== 'finished';
}
