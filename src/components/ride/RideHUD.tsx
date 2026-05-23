import type { ReactNode } from 'react';
import { useMemo, useEffect, useRef, useState } from 'react';
import { Gauge, Zap, Heart, Activity, Mountain, TrendingUp, Timer, MapPin, Wind } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDistance, formatDuration, msToKmh } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { findClimbs } from '@/lib/climbDetection';
import { playClimbEntrySound } from '@/lib/rideAudio';

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
  const speed         = useRideStore((s) => s.speed);
  const power         = useRideStore((s) => s.power);
  const cadence       = useRideStore((s) => s.cadence);
  const heartRate     = useRideStore((s) => s.heartRate);
  const distance      = useRideStore((s) => s.distance);
  const elevation     = useRideStore((s) => s.elevation);
  const grade         = useRideStore((s) => s.grade);
  const elapsedMs     = useRideStore((s) => s.elapsedMs);
  const route         = useRideStore((s) => s.route);
  const activeWorkout = useRideStore((s) => s.activeWorkout);
  const draft         = useRideStore((s) => s.draft);
  const ftpW          = useSettingsStore((s) => s.ftpW);

  const progress = route && route.totalDistance > 0
    ? Math.min(1, distance / route.totalDistance)
    : 0;

  const kmh = msToKmh(speed ?? 0);

  // Power zone (Coggan 7-zone model, based on %FTP)
  const zone = powerZone(power ?? 0, ftpW);

  // Safely coerce potentially undefined/NaN store values
  const safeGrade     = Number.isFinite(grade)     ? grade     : 0;
  const safeElevation = Number.isFinite(elevation) ? elevation : 0;
  const safePower     = power ?? 0;

  // Grade styling
  const gradeColor =
    safeGrade > 8  ? 'text-rose-400' :
    safeGrade > 5  ? 'text-orange-400' :
    safeGrade > 2  ? 'text-amber-400' :
    safeGrade < -4 ? 'text-sky-400' :
    safeGrade < -1 ? 'text-sky-500/80' :
    'text-foreground/70';

  // Hero metric: power when riding (>0 watts) or workout active, else speed
  const showPowerHero = safePower > 0 || !!activeWorkout;

  return (
    <div
      className="pointer-events-none flex flex-col gap-2 sm:gap-2.5"
      role="region"
      aria-label="Ride metrics"
    >

      {/* ── Primary card ─────────────────────────────────────────── */}
      <div className="pointer-events-auto glass glass-hairline rounded-2xl overflow-hidden ring-halo">
        {/* Zone accent bar — top stripe coloured by power zone */}
        <div
          className="h-0.5 w-full transition-colors duration-700"
          style={{ backgroundColor: zone.hex }}
          aria-hidden="true"
        />

        <div className="p-3 sm:p-4">
          {showPowerHero ? (
            /* Power hero layout */
            <div className="flex items-end gap-3">
              {/* Giant power readout */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5" aria-hidden="true">
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
                  aria-label={`Power: ${Math.round(safePower)} watts, ${zone.label}`}
                  className="num font-bold leading-none tabular-nums transition-colors duration-500"
                  style={{
                    fontSize: 'clamp(2.5rem, 6vw, 3.75rem)',
                    color: zone.hex,
                    textShadow: `0 0 32px ${zone.hex}55`,
                  }}
                >
                  {Math.round(safePower)}
                </div>
              </div>

              {/* Speed alongside */}
              <div className="flex flex-col items-end gap-0.5 pb-0.5">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">
                  <Gauge className="h-3 w-3" />
                  <span>km/h</span>
                </div>
                <div
                  aria-label={`Speed: ${kmh.toFixed(1)} km/h`}
                  className="num text-2xl sm:text-3xl font-bold text-foreground tabular-nums leading-none"
                >
                  {kmh.toFixed(1)}
                </div>
              </div>
            </div>
          ) : (
            /* Speed hero layout (free ride, no power) */
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5" aria-hidden="true">
                  <Gauge className="h-3 w-3 text-primary" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">
                    km/h
                  </span>
                </div>
                <div
                  aria-label={`Speed: ${kmh.toFixed(1)} km/h`}
                  className="num font-bold text-primary leading-none tabular-nums"
                  style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)' }}
                >
                  {kmh.toFixed(1)}
                </div>
              </div>

              {/* Power — no data state */}
              <div className="flex flex-col items-end gap-0.5 pb-0.5">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">
                  <Zap className="h-3 w-3" />
                  <span>watts</span>
                </div>
                <div
                  aria-label="Power: no data"
                  className="num text-2xl sm:text-3xl font-bold text-foreground/40 tabular-nums leading-none"
                >
                  —
                </div>
              </div>
            </div>
          )}

          {/* Grade strip — subtle full-width indicator */}
          <div
            className="mt-3 flex items-center gap-2"
            aria-label={`Grade: ${safeGrade >= 0 ? '+' : ''}${safeGrade.toFixed(1)}%`}
          >
            <TrendingUp className={cn('h-3 w-3 shrink-0', gradeColor)} aria-hidden="true" />
            <div className="flex-1 relative h-1 rounded-full bg-muted/60 overflow-hidden" aria-hidden="true">
              <GradeBar grade={safeGrade} />
            </div>
            <span
              className={cn('num text-xs font-bold tabular-nums min-w-[3.5rem] text-right', gradeColor)}
              aria-hidden="true"
            >
              {safeGrade >= 0 ? '+' : ''}{safeGrade.toFixed(1)}%
            </span>
          </div>

          {/* Draft indicator — animates in/out when slipstream becomes active */}
          <DraftChip draft={draft} />
        </div>
      </div>

      {/* ── Secondary row: cadence · HR · elev · time ────────────── */}
      {/* Desktop / large screens */}
      <div
        className="pointer-events-auto glass glass-hairline rounded-2xl px-3 sm:px-4 py-2.5 grid grid-cols-4 gap-1.5 sm:gap-2"
        role="list"
        aria-label="Secondary metrics"
      >
        <SecondaryMetric
          icon={<Activity className="h-3 w-3 text-primary/80" aria-hidden="true" />}
          label="rpm"
          ariaLabel={cadence ? `Cadence: ${Math.round(cadence)} rpm` : 'Cadence: no data'}
          value={cadence ? Math.round(cadence).toString() : '—'}
        />
        <SecondaryMetric
          icon={<Heart className="h-3 w-3 text-rose-400" aria-hidden="true" />}
          label="bpm"
          ariaLabel={heartRate ? `Heart rate: ${Math.round(heartRate)} bpm` : 'Heart rate: no data'}
          value={heartRate ? Math.round(heartRate).toString() : '—'}
          valueClass={heartRate && heartRate > 170 ? 'text-rose-400' : undefined}
        />
        <SecondaryMetric
          icon={<Mountain className="h-3 w-3 text-emerald-400" aria-hidden="true" />}
          label="m elev"
          ariaLabel={`Elevation: ${Math.round(safeElevation)} metres`}
          value={`${Math.round(safeElevation)}`}
        />
        <SecondaryMetric
          icon={<Timer className="h-3 w-3 text-muted-foreground/70" aria-hidden="true" />}
          label="time"
          ariaLabel={`Elapsed time: ${formatDuration(elapsedMs / 1000)}`}
          value={formatDuration(elapsedMs / 1000)}
        />
      </div>

      {/* ── Route progress strip ─────────────────────────────────── */}
      {route && (
        <div className="pointer-events-auto glass glass-hairline rounded-2xl px-3 sm:px-4 py-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="h-3 w-3 text-muted-foreground/60 shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground leading-tight truncate">
                {route.name}
              </span>
            </div>
            <div
              className="num text-[10px] text-muted-foreground shrink-0 tabular-nums"
              aria-label={`${formatDistance(distance)} of ${formatDistance(route.totalDistance)}`}
            >
              {formatDistance(distance)}{' '}
              <span className="opacity-40" aria-hidden="true">/</span>{' '}
              {formatDistance(route.totalDistance)}
            </div>
          </div>

          {/* Progress bar with glowing dot */}
          <div
            className="relative"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Route progress: ${Math.round(progress * 100)}%`}
          >
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
              aria-hidden="true"
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
// Climb-name HUD banner
// ---------------------------------------------------------------------------

/**
 * ClimbBanner — slides in from the top when the rider enters a detected
 * climb. Stays for 8 seconds, then fades out.
 *
 * Triggered when `distance` crosses into [startDistance, startDistance + 30m].
 * The climb list is memoised so it never recomputes inside the render loop.
 *
 * Props come from the parent via the store — this component is self-contained.
 */
export function ClimbBanner() {
  const distance = useRideStore((s) => s.distance);
  const route    = useRideStore((s) => s.route);

  // Stable climb list — recomputed only when the route changes.
  const climbs = useMemo(
    () => (route ? findClimbs(route) : []),
    [route],
  );

  // Which climb key is currently "active" (recently entered)
  const [activeClimbIdx, setActiveClimbIdx] = useState<number | null>(null);
  const [phase, setPhase]   = useState<'in' | 'hold' | 'out'>('in');
  const seenRef             = useRef<Set<number>>(new Set());
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Portal window: the 30m just after a climb's startDistance.
  const PORTAL_WINDOW_M = 30;

  useEffect(() => {
    // Find any climb whose portal window contains the current distance.
    const idx = climbs.findIndex(
      (c) => distance >= c.startDistance && distance <= c.startDistance + PORTAL_WINDOW_M,
    );

    if (idx !== -1 && !seenRef.current.has(idx)) {
      // New climb entry — show the banner.
      seenRef.current.add(idx);
      setActiveClimbIdx(idx);
      setPhase('in');
      playClimbEntrySound();

      // Clear any previous timer.
      if (timerRef.current) clearTimeout(timerRef.current);

      // After 8s total: start fade-out (600ms), then unmount.
      timerRef.current = setTimeout(() => {
        setPhase('out');
        timerRef.current = setTimeout(() => {
          setActiveClimbIdx(null);
        }, 650);
      }, 8_000);
    }
  }, [distance, climbs]);

  // Cleanup on unmount.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  if (activeClimbIdx === null) return null;

  const climb = climbs[activeClimbIdx];
  if (!climb) return null;

  const lengthKm = (climb.lengthM / 1000).toFixed(1);
  const gradientStr = climb.avgGradient.toFixed(1);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Entering ${climb.name}: ${lengthKm} km at ${gradientStr}% average gradient`}
      className={cn(
        // Position: top-center, above all HUD panels
        'fixed top-4 left-1/2 -translate-x-1/2 z-[300]',
        'pointer-events-none select-none',
        phase === 'in'  && 'animate-slideDown',
        phase === 'out' && 'animate-fadeOut',
      )}
    >
      <div
        className="relative flex items-center gap-3 px-5 py-3 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(8,14,28,0.92) 0%, rgba(3,25,40,0.88) 100%)',
          border: '1px solid rgba(34,211,238,0.30)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          boxShadow: '0 0 32px -8px rgba(34,211,238,0.35), inset 0 1px 0 rgba(255,255,255,0.07)',
        }}
      >
        {/* Cyan glow strip at the bottom */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-3/4 rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.7), transparent)' }}
          aria-hidden="true"
        />

        {/* Mountain icon */}
        <Mountain
          className="h-5 w-5 shrink-0"
          style={{ color: '#22d3ee' }}
          aria-hidden="true"
        />

        {/* Climb info */}
        <div className="flex items-center gap-3 sm:gap-4">
          <span
            className="text-sm sm:text-base font-bold uppercase tracking-widest leading-none"
            style={{ color: '#e2e8f0' }}
          >
            {climb.name}
          </span>

          <div className="flex items-center gap-2 text-[11px] sm:text-xs font-semibold tabular-nums" style={{ color: '#94a3b8' }}>
            <span aria-hidden="true">·</span>
            <span>{lengthKm} km</span>
            <span aria-hidden="true">·</span>
            <span style={{ color: '#22d3ee' }}>{gradientStr}% avg</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft chip — animates in when the rider is in a slipstream
// ---------------------------------------------------------------------------

import type { DraftState } from '@/lib/drafting';

/**
 * Compact pill shown when the rider is drafting another rider.
 * Fades + slides in smoothly; disappears when the gap is lost.
 */
function DraftChip({ draft }: { draft: DraftState }) {
  const savingRounded = Math.round(draft.savingPct * 100);

  return (
    <div
      className={cn(
        'mt-2 flex items-center gap-1.5 overflow-hidden transition-all duration-500 ease-out',
        draft.active
          ? 'max-h-12 opacity-100 translate-y-0'
          : 'max-h-0 opacity-0 -translate-y-1 pointer-events-none',
      )}
      aria-live="polite"
    >
      {draft.active && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider select-none"
          style={{
            background: 'rgba(56, 189, 248, 0.12)',   // sky-400 at low opacity
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#38bdf8',                           // sky-400
            boxShadow: '0 0 10px rgba(56, 189, 248, 0.25)',
          }}
          aria-label={`Drafting -${savingRounded}%${draft.leaderId ? ` behind ${draft.leaderId}` : ''}`}
        >
          <Wind className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>DRAFT −{savingRounded}%</span>
          {draft.leaderId && (
            <span
              className="font-normal opacity-70 normal-case tracking-normal truncate max-w-[6rem]"
              aria-hidden="true"
            >
              on {draft.leaderId}'s wheel
            </span>
          )}
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
  ariaLabel,
  value,
  valueClass,
}: {
  icon?: ReactNode;
  label: string;
  ariaLabel: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" role="listitem" aria-label={ariaLabel}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">
        {icon}
        <span>{label}</span>
      </div>
      <div
        aria-hidden="true"
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
