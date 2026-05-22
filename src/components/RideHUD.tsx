import { Gauge, Zap, Heart, Activity, Mountain, TrendingUp, Timer, MapPin } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDistance, formatDuration, msToKmh } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Elite ride HUD — the screen a cyclist stares at for an hour.
 *
 * Layout (desktop/tablet):
 *   ┌──────────────────────────────────┐
 *   │  POWER  (hero, zone-coloured)    │
 *   │  speed · grade (secondary duo)   │
 *   ├──────────────────────────────────┤
 *   │  cadence · HR · elev · time      │
 *   ├──────────────────────────────────┤
 *   │  route name · progress           │
 *   └──────────────────────────────────┘
 *
 * When no workout is active, speed becomes the hero metric.
 * Power zone is derived from FTP (settingsStore.ftpW).
 */
export function RideHUD() {
  const speed       = useRideStore((s) => s.speed);
  const power       = useRideStore((s) => s.power);
  const cadence     = useRideStore((s) => s.cadence);
  const heartRate   = useRideStore((s) => s.heartRate);
  const distance    = useRideStore((s) => s.distance);
  const elevation   = useRideStore((s) => s.elevation);
  const grade       = useRideStore((s) => s.grade);
  const elapsedMs   = useRideStore((s) => s.elapsedMs);
  const route       = useRideStore((s) => s.route);
  const activeWorkout = useRideStore((s) => s.activeWorkout);
  const ftpW        = useSettingsStore((s) => s.ftpW);

  const progress = route && route.totalDistance > 0
    ? Math.min(1, distance / route.totalDistance)
    : 0;

  const kmh = msToKmh(speed);

  // Power zone (Coggan 7-zone model, based on %FTP)
  const zone = powerZone(power, ftpW);

  // Grade styling
  const gradeAbs = Math.abs(grade);
  const gradeColor =
    grade > 8  ? 'text-rose-400' :
    grade > 5  ? 'text-orange-400' :
    grade > 2  ? 'text-amber-400' :
    grade < -4 ? 'text-sky-400' :
    grade < -1 ? 'text-sky-500/80' :
    'text-foreground/70';

  // Hero metric: power when riding (>0 watts), else speed
  const showPowerHero = power > 0 || !!activeWorkout;

  return (
    <div className="pointer-events-none flex flex-col gap-2 sm:gap-2.5">

      {/* ── Primary card ─────────────────────────────────────────── */}
      <div className="pointer-events-auto glass glass-hairline rounded-2xl overflow-hidden ring-halo">
        {/* Zone accent bar — 3px top stripe */}
        <div
          className="h-0.5 w-full transition-colors duration-700"
          style={{ backgroundColor: zone.hex }}
        />

        <div className="p-3 sm:p-4">
          {showPowerHero ? (
            /* Power hero layout */
            <div className="flex items-end gap-3">
              {/* Giant power readout */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Zap className="h-3 w-3" style={{ color: zone.hex }} />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">
                    watts
                  </span>
                  <span
                    className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: zone.hex + '22',
                      color: zone.hex,
                    }}
                  >
                    {zone.label}
                  </span>
                </div>
                <div
                  className="num font-bold leading-none tabular-nums transition-colors duration-500"
                  style={{
                    fontSize: 'clamp(2.5rem, 6vw, 3.75rem)',
                    color: zone.hex,
                    textShadow: `0 0 32px ${zone.hex}55`,
                  }}
                >
                  {Math.round(power)}
                </div>
              </div>

              {/* Speed alongside */}
              <div className="flex flex-col items-end gap-0.5 pb-0.5">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                  <Gauge className="h-3 w-3" />
                  <span>km/h</span>
                </div>
                <div className="num text-2xl sm:text-3xl font-bold text-foreground tabular-nums leading-none">
                  {kmh.toFixed(1)}
                </div>
              </div>
            </div>
          ) : (
            /* Speed hero layout (free ride, no power) */
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Gauge className="h-3 w-3 text-primary" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">
                    km/h
                  </span>
                </div>
                <div
                  className="num font-bold text-primary leading-none tabular-nums"
                  style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)' }}
                >
                  {kmh.toFixed(1)}
                </div>
              </div>

              {/* Power alongside if zero but still show it */}
              <div className="flex flex-col items-end gap-0.5 pb-0.5">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                  <Zap className="h-3 w-3" />
                  <span>watts</span>
                </div>
                <div className="num text-2xl sm:text-3xl font-bold text-foreground/50 tabular-nums leading-none">
                  —
                </div>
              </div>
            </div>
          )}

          {/* Grade strip — subtle full-width indicator */}
          <div className="mt-3 flex items-center gap-2">
            <TrendingUp className={cn('h-3 w-3 shrink-0', gradeColor)} />
            <div className="flex-1 relative h-1 rounded-full bg-muted/60 overflow-hidden">
              <GradeBar grade={grade} />
            </div>
            <span className={cn('num text-xs font-bold tabular-nums min-w-[3.5rem] text-right', gradeColor)}>
              {grade >= 0 ? '+' : ''}{grade.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Secondary row: cadence · HR · elev · time ────────────── */}
      <div className="pointer-events-auto glass glass-hairline rounded-2xl px-3 sm:px-4 py-2.5 grid grid-cols-4 gap-1.5 sm:gap-2">
        <SecondaryMetric
          icon={<Activity className="h-3 w-3 text-primary/80" />}
          label="rpm"
          value={cadence ? Math.round(cadence).toString() : '—'}
        />
        <SecondaryMetric
          icon={<Heart className="h-3 w-3 text-rose-400" />}
          label="bpm"
          value={heartRate ? Math.round(heartRate).toString() : '—'}
          valueClass={heartRate && heartRate > 170 ? 'text-rose-400' : undefined}
        />
        <SecondaryMetric
          icon={<Mountain className="h-3 w-3 text-emerald-400" />}
          label="m elev"
          value={`${Math.round(elevation)}`}
        />
        <SecondaryMetric
          icon={<Timer className="h-3 w-3 text-muted-foreground/70" />}
          label="time"
          value={formatDuration(elapsedMs / 1000)}
        />
      </div>

      {/* ── Route progress strip ─────────────────────────────────── */}
      {route && (
        <div className="pointer-events-auto glass glass-hairline rounded-2xl px-3 sm:px-4 py-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              <span className="text-xs font-semibold text-foreground leading-tight truncate">
                {route.name}
              </span>
            </div>
            <div className="num text-[10px] text-muted-foreground shrink-0 tabular-nums">
              {formatDistance(distance)}{' '}
              <span className="opacity-40">/</span>{' '}
              {formatDistance(route.totalDistance)}
            </div>
          </div>

          {/* Progress bar with glowing dot */}
          <div className="relative">
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${(progress * 100).toFixed(2)}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                }}
              />
            </div>
            {/* Rider dot — sits above the bar */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-[left] duration-500 ease-out"
              style={{ left: `${(progress * 100).toFixed(2)}%` }}
            >
              <div className="h-3.5 w-3.5 rounded-full bg-accent ring-2 ring-background shadow-[0_0_10px_hsl(var(--accent)/0.8)]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grade visualiser — centered bar that fills left (descent) or right (climb)
// ---------------------------------------------------------------------------

function GradeBar({ grade }: { grade: number }) {
  // Map grade to [-25, +25] range, normalise to 0-100%
  const clamped = Math.max(-25, Math.min(25, grade));
  const pct = Math.abs(clamped) / 25 * 50; // max 50% each side
  const isClimb = clamped >= 0;

  const color =
    Math.abs(grade) > 8 ? '#f87171' : // rose
    Math.abs(grade) > 5 ? '#fb923c' : // orange
    Math.abs(grade) > 2 ? '#fbbf24' : // amber
    Math.abs(grade) > 1 ? '#38bdf8' : // sky (descent)
    'hsl(var(--primary))';

  return (
    <div className="absolute inset-0 flex">
      {/* Left half — descent fills from center leftward */}
      <div className="flex-1 flex justify-end">
        {!isClimb && (
          <div
            className="h-full rounded-l-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
          />
        )}
      </div>
      {/* Center tick */}
      <div className="w-px bg-border/60 shrink-0" />
      {/* Right half — climb fills from center rightward */}
      <div className="flex-1">
        {isClimb && (
          <div
            className="h-full rounded-r-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal components
// ---------------------------------------------------------------------------

function SecondaryMetric({
  icon,
  label,
  value,
  valueClass,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'num text-sm sm:text-base md:text-lg font-bold tabular-nums leading-tight transition-colors duration-200',
          valueClass ?? 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Power zone model (Coggan 7-zone)
// ---------------------------------------------------------------------------

interface Zone {
  label: string;
  hex: string;
}

function powerZone(watts: number, ftpW: number): Zone {
  if (ftpW <= 0 || watts <= 0) {
    return { label: 'Z—', hex: 'hsl(215 18% 58%)' };
  }
  const pct = watts / ftpW;
  if (pct < 0.55) return { label: 'Z1', hex: '#94a3b8' };  // slate — active recovery
  if (pct < 0.75) return { label: 'Z2', hex: '#38bdf8' };  // sky — endurance
  if (pct < 0.90) return { label: 'Z3', hex: '#34d399' };  // emerald — tempo
  if (pct < 1.05) return { label: 'Z4', hex: '#fbbf24' };  // amber — threshold
  if (pct < 1.20) return { label: 'Z5', hex: '#fb923c' };  // orange — VO2max
  if (pct < 1.50) return { label: 'Z6', hex: '#f87171' };  // red — anaerobic
  return { label: 'Z7', hex: '#c084fc' };                   // violet — neuromuscular
}
