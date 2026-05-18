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
      className="glass glass-hairline rounded-full inline-flex items-center gap-2 px-3 py-1.5 pointer-events-none select-none"
      title="Ride replay from recorded FIT file"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/60 animate-[livePulse_1.6s_ease-in-out_infinite]" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
      </span>
      <Clapperboard className="h-3.5 w-3.5 text-amber-400" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
        Replay
      </span>
    </div>
  );
}
