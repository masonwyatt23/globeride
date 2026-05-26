/**
 * OutdoorModeToggle — UI card shown on the Home / Ride tab.
 *
 * Lets the rider switch between:
 *  • Indoor (trainer)  — existing smart-trainer / Demo Mode experience
 *  • Outdoor (GPS)     — real outdoor ride recorded via device GPS
 *
 * The selection is persisted in rideStore.rideMode and reflected back
 * immediately so downstream hooks (useRideLoop, useGeolocationWatch) pick
 * it up before the user presses Start.
 */

import { Bike, MapPin } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import type { RideMode } from '@/types';

const MODES: { id: RideMode; label: string; sub: string; Icon: typeof Bike }[] = [
  {
    id: 'trainer',
    label: 'Indoor',
    sub: 'Smart trainer or Demo Mode',
    Icon: Bike,
  },
  {
    id: 'outdoor',
    label: 'Outdoor',
    sub: 'Record a real ride via GPS',
    Icon: MapPin,
  },
];

export function OutdoorModeToggle() {
  const rideMode = useRideStore((s) => s.rideMode);
  const setRideMode = useRideStore((s) => s.setRideMode);

  return (
    <div className="flex gap-2">
      {MODES.map(({ id, label, sub, Icon }) => {
        const active = rideMode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setRideMode(id)}
            className={[
              'flex-1 flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150',
              active
                ? 'border-accent bg-accent/10 ring-1 ring-accent/40'
                : 'border-border/60 bg-card/40 hover:border-accent/40 hover:bg-accent/5',
            ].join(' ')}
            aria-pressed={active}
          >
            <span
              className={[
                'mt-0.5 shrink-0 rounded-lg p-1.5',
                active ? 'bg-accent/20 text-accent' : 'bg-muted text-muted-foreground',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className={['text-sm font-semibold leading-tight', active ? 'text-accent' : 'text-foreground'].join(' ')}>
                {label}
              </span>
              <span className="text-xs text-muted-foreground leading-snug">{sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
