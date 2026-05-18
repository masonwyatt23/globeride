import { Gauge, Zap, Heart, Activity, Mountain, TrendingUp } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { formatDistance, formatDuration, msToKmh } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Floating heads-up display. Shows the canonical six numbers a cyclist
 * cares about while riding: speed, power, heart rate, cadence, distance,
 * elevation, time, and live gradient.
 */
export function RideHUD() {
  const speed = useRideStore((s) => s.speed);
  const power = useRideStore((s) => s.power);
  const cadence = useRideStore((s) => s.cadence);
  const heartRate = useRideStore((s) => s.heartRate);
  const distance = useRideStore((s) => s.distance);
  const elevation = useRideStore((s) => s.elevation);
  const grade = useRideStore((s) => s.grade);
  const elapsedMs = useRideStore((s) => s.elapsedMs);
  const route = useRideStore((s) => s.route);

  const progress = route && route.totalDistance > 0 ? Math.min(1, distance / route.totalDistance) : 0;

  return (
    <div className="pointer-events-none flex flex-col gap-3">
      <div className="pointer-events-auto glass glass-hairline rounded-2xl p-4 grid grid-cols-3 gap-3">
        <BigStat icon={<Gauge className="h-4 w-4" />} label="km/h" value={msToKmh(speed).toFixed(1)} accent />
        <BigStat icon={<Zap className="h-4 w-4" />} label="watts" value={Math.round(power).toString()} />
        <BigStat
          icon={<TrendingUp className="h-4 w-4" />}
          label="grade"
          value={`${grade >= 0 ? '+' : ''}${grade.toFixed(1)}%`}
          tone={grade > 4 ? 'warn' : grade < -4 ? 'cool' : 'neutral'}
        />
      </div>

      <div className="pointer-events-auto glass glass-hairline rounded-2xl px-4 py-3 grid grid-cols-4 gap-3">
        <SmallStat icon={<Activity className="h-3.5 w-3.5" />} label="rpm" value={cadence ? Math.round(cadence).toString() : '—'} />
        <SmallStat
          icon={<Heart className="h-3.5 w-3.5 text-rose-400" />}
          label="bpm"
          value={heartRate ? Math.round(heartRate).toString() : '—'}
        />
        <SmallStat
          icon={<Mountain className="h-3.5 w-3.5 text-emerald-400" />}
          label="elev"
          value={`${Math.round(elevation)} m`}
        />
        <SmallStat label="time" value={formatDuration(elapsedMs / 1000)} />
      </div>

      {route && (
        <div className="pointer-events-auto glass glass-hairline rounded-2xl px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground">{route.name}</span>
            <span className="num">
              {formatDistance(distance)} / {formatDistance(route.totalDistance)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary via-cyan-300 to-accent transition-[width] duration-500"
              style={{ width: `${(progress * 100).toFixed(2)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BigStat({
  icon,
  label,
  value,
  accent = false,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  tone?: 'neutral' | 'warn' | 'cool';
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'num text-3xl font-bold leading-tight tabular-nums',
          accent && 'text-primary',
          tone === 'warn' && 'text-amber-400',
          tone === 'cool' && 'text-sky-400',
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
    <div className="flex flex-col">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="num text-lg font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
