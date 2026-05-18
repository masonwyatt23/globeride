import { Gauge, Zap, Heart, Activity, Mountain, TrendingUp } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { formatDistance, formatDuration, msToKmh } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Floating heads-up display. Six numbers a cyclist cares about while pedaling:
 * speed, power, grade, cadence, HR, elevation, distance progress, elapsed time.
 *
 * Layout: two glass panels stacked, then a route progress strip.
 */
export function RideHUD() {
  const speed     = useRideStore((s) => s.speed);
  const power     = useRideStore((s) => s.power);
  const cadence   = useRideStore((s) => s.cadence);
  const heartRate = useRideStore((s) => s.heartRate);
  const distance  = useRideStore((s) => s.distance);
  const elevation = useRideStore((s) => s.elevation);
  const grade     = useRideStore((s) => s.grade);
  const elapsedMs = useRideStore((s) => s.elapsedMs);
  const route     = useRideStore((s) => s.route);

  const progress = route && route.totalDistance > 0
    ? Math.min(1, distance / route.totalDistance)
    : 0;

  const gradeTone =
    grade > 6  ? 'hard' :
    grade > 2  ? 'climb' :
    grade < -4 ? 'descent' :
    'neutral';

  return (
    <div className="pointer-events-none flex flex-col gap-2 sm:gap-2.5">
      {/* Primary trio: speed · power · grade */}
      <div className="pointer-events-auto glass glass-hairline rounded-2xl p-3 sm:p-4 grid grid-cols-3 gap-1 sm:gap-2 ring-halo">
        <BigStat
          icon={<Gauge className="h-3.5 w-3.5" />}
          label="km/h"
          value={msToKmh(speed).toFixed(1)}
          colorClass="text-primary"
        />
        <BigStat
          icon={<Zap className="h-3.5 w-3.5" />}
          label="watts"
          value={Math.round(power).toString()}
          colorClass={power > 300 ? 'text-amber-400 dark:text-amber-300' : 'text-foreground'}
        />
        <BigStat
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="grade"
          value={`${grade >= 0 ? '+' : ''}${grade.toFixed(1)}%`}
          colorClass={
            gradeTone === 'hard'    ? 'text-rose-500 dark:text-rose-400' :
            gradeTone === 'climb'   ? 'text-amber-500 dark:text-amber-400' :
            gradeTone === 'descent' ? 'text-sky-500 dark:text-sky-400' :
            'text-foreground'
          }
        />
      </div>

      {/* Secondary row: cadence · HR · elevation · time */}
      <div className="pointer-events-auto glass glass-hairline rounded-2xl px-3 sm:px-4 py-2.5 grid grid-cols-4 gap-1.5 sm:gap-2">
        <SmallStat
          icon={<Activity className="h-3 w-3 text-primary/70" />}
          label="rpm"
          value={cadence ? Math.round(cadence).toString() : '—'}
        />
        <SmallStat
          icon={<Heart className="h-3 w-3 text-rose-500 dark:text-rose-400" />}
          label="bpm"
          value={heartRate ? Math.round(heartRate).toString() : '—'}
        />
        <SmallStat
          icon={<Mountain className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
          label="elev"
          value={`${Math.round(elevation)} m`}
        />
        <SmallStat
          label="time"
          value={formatDuration(elapsedMs / 1000)}
        />
      </div>

      {/* Route progress strip */}
      {route && (
        <div className="pointer-events-auto glass glass-hairline rounded-2xl px-3 sm:px-4 py-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-foreground leading-tight">
              {route.name}
            </span>
            <span className="num text-[10px] text-muted-foreground shrink-0">
              {formatDistance(distance)}{' '}
              <span className="opacity-50">/</span>{' '}
              {formatDistance(route.totalDistance)}
            </span>
          </div>
          {/* Progress bar */}
          <div className="relative h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-sky-300 to-accent transition-[width] duration-500 ease-out"
              style={{ width: `${(progress * 100).toFixed(2)}%` }}
            />
          </div>
          {/* Rider dot outside overflow-hidden */}
          <div
            className="relative -mt-3.5 mb-0.5 h-0"
            style={{ paddingLeft: `calc(${(progress * 100).toFixed(2)}% - 6px)` }}
          >
            <div className="h-3 w-3 rounded-full bg-accent ring-2 ring-background shadow-[0_0_8px_hsl(var(--accent)/0.7)]" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Internal components ---- */

function BigStat({
  icon,
  label,
  value,
  colorClass = 'text-foreground',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'num text-2xl sm:text-3xl md:text-[2.25rem] font-bold leading-none tabular-nums transition-colors duration-150',
          colorClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SmallStat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="num text-sm sm:text-base md:text-lg font-semibold text-foreground tabular-nums leading-tight">
        {value}
      </div>
    </div>
  );
}
