/**
 * Floating REPLAY badge displayed during a replay session.
 * Clearly distinguishes replay from a live ride.
 */

import { Clapperboard } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';

export function ReplayBadge() {
  const replayData = useRideStore((s) => s.replayData);
  const rideState = useRideStore((s) => s.rideState);

  if (!replayData) return null;
  if (rideState === 'idle' || rideState === 'finished') return null;

  return (
    <div
      className="
        inline-flex items-center gap-1.5
        rounded-full
        bg-amber-500/20 border border-amber-500/40
        px-2.5 py-1
        text-xs font-semibold uppercase tracking-wider
        text-amber-400
        animate-pulse
        pointer-events-none
        select-none
      "
      title="Ride replay from recorded FIT file"
    >
      <Clapperboard className="h-3.5 w-3.5" />
      Replay
    </div>
  );
}
