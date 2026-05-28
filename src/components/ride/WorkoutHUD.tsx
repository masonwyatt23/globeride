/**
 * WorkoutHUD — premium overlay shown during a structured workout session.
 *
 * Panels (top to bottom in the HUD column):
 *   1. Segment card — kind badge, target vs actual power, segment countdown,
 *      segment progress arc, up-next strip.
 *   2. Power-shape preview (WorkoutPowerProfile, compact).
 *   3. Overall workout progress bar.
 */

import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { Activity, ChevronRight, Zap, Timer, TrendingUp, TrendingDown, SkipForward } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { segmentAt, resolveTargetWatts, totalDurationSec } from '@/lib/workout';
import { cn } from '@/lib/utils';
import { formatSec } from '@/lib/format';
import { WorkoutPowerProfile } from '@/components/workouts/WorkoutPowerProfile';

// ---------------------------------------------------------------------------
// Segment-kind palette (matches WorkoutBuilder)
// ---------------------------------------------------------------------------

const KIND_COLORS: Record<string, { bg: string; text: string; ring: string; hex: string }> = {
  warmup:   { bg: 'bg-amber-400/15',   text: 'text-amber-400',   ring: 'ring-amber-400/25',   hex: '#fbbf24' },
  steady:   { bg: 'bg-sky-400/15',     text: 'text-sky-400',     ring: 'ring-sky-400/25',     hex: '#38bdf8' },
  interval: { bg: 'bg-rose-500/15',    text: 'text-rose-400',    ring: 'ring-rose-400/25',    hex: '#f87171' },
  recovery: { bg: 'bg-emerald-400/15', text: 'text-emerald-400', ring: 'ring-emerald-400/25', hex: '#34d399' },
  ramp:     { bg: 'bg-violet-400/15',  text: 'text-violet-400',  ring: 'ring-violet-400/25',  hex: '#c084fc' },
  cooldown: { bg: 'bg-blue-300/15',    text: 'text-blue-400',    ring: 'ring-blue-400/25',    hex: '#93c5fd' },
  freeride: { bg: 'bg-slate-400/15',   text: 'text-slate-400',   ring: 'ring-slate-400/25',   hex: '#94a3b8' },
};

const KIND_LABELS: Record<string, string> = {
  warmup:   'Warm-up',
  steady:   'Steady',
  interval: 'Interval',
  recovery: 'Recovery',
  ramp:     'Ramp',
  cooldown: 'Cool-down',
  freeride: 'Free ride',
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function WorkoutHUD() {
  const activeWorkout      = useRideStore((s) => s.activeWorkout);
  const workoutElapsedSec  = useRideStore((s) => s.workoutElapsedSec);
  const workoutTargetWatts = useRideStore((s) => s.workoutTargetWatts);
  const workoutRunning     = useRideStore((s) => s.workoutRunning);
  const rideState          = useRideStore((s) => s.rideState);
  const power              = useRideStore((s) => s.power);
  const ftpW               = useSettingsStore((s) => s.ftpW);

  // Skip to the end of the current segment (advances elapsed past this segment).
  const skipSegment = useCallback(() => {
    const s = useRideStore.getState();
    if (!s.activeWorkout) return;
    const cur = segmentAt(s.activeWorkout, s.workoutElapsedSec);
    if (!cur) return;
    // Jump to 1 ms past the segment boundary so the engine picks up the next segment.
    const jumpTo = cur.remainingInSegmentSec + 0.001;
    s.advanceWorkoutElapsed(jumpTo);
  }, []);

  if (!activeWorkout || (rideState !== 'running' && rideState !== 'paused')) return null;

  const cursor = segmentAt(activeWorkout, workoutElapsedSec);
  if (!cursor) return null;

  const { segment, remainingInSegmentSec, elapsedInSegmentSec, next, index } = cursor;
  const totalSec      = totalDurationSec(activeWorkout);
  const segmentCount  = activeWorkout.segments.length;
  const segmentLabel  = `${index + 1} of ${segmentCount}`;
  const progress      = totalSec > 0 ? Math.min(1, workoutElapsedSec / totalSec) : 0;
  // Clamp segment progress to [0,100] — avoids negative or >100 values at boundaries
  const segPct     = segment.durationSec > 0
    ? Math.min(100, Math.max(0, (elapsedInSegmentSec / segment.durationSec) * 100))
    : 0;

  const colors   = KIND_COLORS[segment.kind] ?? KIND_COLORS['steady'];
  const targetW  = workoutTargetWatts;
  const targetPct = ftpW > 0 && targetW !== null ? Math.round((targetW / ftpW) * 100) : null;

  // Actual vs target gap
  const safePower = power ?? 0;
  const delta = targetW !== null && safePower > 0 ? Math.round(safePower - targetW) : null;
  const deltaColor =
    delta === null ? '' :
    Math.abs(delta) <= 5   ? 'text-emerald-400' :
    Math.abs(delta) <= 15  ? 'text-amber-400'   :
    'text-rose-400';

  // Next segment watts
  let nextW: number | null = null;
  if (next) {
    nextW = resolveTargetWatts(next, 0, ftpW);
  }

  // Safe remaining time — never show a negative countdown
  const safeRemaining = Math.max(0, remainingInSegmentSec);

  return (
    <div
      className="pointer-events-none flex flex-col gap-2"
      role="region"
      aria-label="Workout segment"
    >

      {/* ── Segment card ──────────────────────────────────────────── */}
      <div className="pointer-events-auto glass glass-hairline rounded-2xl overflow-hidden">
        {/* Kind accent bar */}
        <div
          className="h-0.5 w-full transition-colors duration-700"
          style={{ backgroundColor: colors.hex }}
          aria-hidden="true"
        />

        <div className="p-3 sm:p-3.5 flex flex-col gap-2.5">

          {/* Header: kind badge + live indicator + segment index + skip + countdown */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                  'text-[10px] font-semibold uppercase tracking-wide ring-1',
                  colors.bg, colors.text, colors.ring,
                )}
                aria-label={`Segment type: ${KIND_LABELS[segment.kind] ?? segment.kind}`}
              >
                <Activity className="h-2.5 w-2.5" aria-hidden="true" />
                {KIND_LABELS[segment.kind] ?? segment.kind}
              </span>
              {/* Live pulse or paused dot */}
              {workoutRunning ? (
                <span
                  className="flex h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: colors.hex }}
                  aria-label="Workout running"
                  role="status"
                />
              ) : (
                <span
                  className="flex h-1.5 w-1.5 rounded-full bg-muted-foreground/30"
                  aria-label="Workout paused"
                  role="status"
                />
              )}
              {/* Segment index */}
              <span
                className="text-[10px] text-muted-foreground tabular-nums"
                aria-label={`Segment ${index + 1} of ${segmentCount}`}
              >
                {segmentLabel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {/* Skip segment button — only when next segment exists */}
              {next && (
                <button
                  type="button"
                  onClick={skipSegment}
                  aria-label="Skip to next segment"
                  title="Skip to next segment"
                  className={cn(
                    'pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md',
                    'text-muted-foreground transition-colors',
                    'hover:text-foreground hover:bg-muted/50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  <SkipForward className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
              <div
                className="flex items-center gap-1 text-muted-foreground"
                aria-label={`Time remaining in segment: ${formatSec(safeRemaining)}`}
              >
                <Timer className="h-3 w-3" aria-hidden="true" />
                <span className="num text-sm font-bold text-foreground tabular-nums" aria-hidden="true">
                  {formatSec(safeRemaining)}
                </span>
              </div>
            </div>
          </div>

          {/* Power readout: target · actual · delta */}
          {targetW !== null ? (
            <div className="flex items-end gap-3">
              {/* Target */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">
                  <Zap className="h-2.5 w-2.5 text-amber-400" />
                  <span>target</span>
                </div>
                <div
                  aria-label={`Target power: ${targetW} watts${targetPct !== null ? ` (${targetPct}% FTP)` : ''}`}
                  className="num font-bold tabular-nums leading-none transition-colors duration-500"
                  style={{
                    fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                    color: colors.hex,
                  }}
                >
                  {targetW}
                  <span className="text-xs font-normal text-muted-foreground ml-1" aria-hidden="true">W</span>
                </div>
                {targetPct !== null && (
                  <div className="text-[10px] text-muted-foreground" aria-hidden="true">{targetPct}% FTP</div>
                )}
              </div>

              {/* Actual power + delta */}
              {safePower > 0 && (
                <div className="flex flex-col gap-0.5 ml-auto items-end">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">
                    actual
                  </div>
                  <div
                    aria-label={`Actual power: ${Math.round(safePower)} watts`}
                    className="num text-xl sm:text-2xl font-bold text-foreground tabular-nums leading-none"
                  >
                    {Math.round(safePower)}
                    <span className="text-xs font-normal text-muted-foreground ml-1" aria-hidden="true">W</span>
                  </div>
                  {delta !== null && (
                    <DeltaLabel delta={delta} className={cn('num text-[11px] font-semibold tabular-nums', deltaColor)} />
                  )}
                </div>
              )}

              {/* Cadence target */}
              {segment.cadenceTarget && (
                <div className="flex flex-col gap-0.5 items-end" aria-label={`Target cadence: ${segment.cadenceTarget} rpm`}>
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">rpm</div>
                  <div className="num text-sm font-semibold text-foreground/70 tabular-nums" aria-hidden="true">{segment.cadenceTarget}</div>
                </div>
              )}
            </div>
          ) : (
            /* Grade / free ride */
            <div className="text-xs text-muted-foreground italic py-1">
              {segment.target.type === 'grade'
                ? `${segment.target.gradePct >= 0 ? '+' : ''}${segment.target.gradePct}% grade`
                : 'Free ride — no ERG target'}
            </div>
          )}

          {/* Segment progress bar */}
          <div
            className="relative h-1.5 rounded-full bg-muted/40 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(segPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Segment progress: ${Math.round(segPct)}%`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${segPct.toFixed(1)}%`,
                backgroundColor: colors.hex,
                opacity: 0.8,
              }}
            />
          </div>

          {/* Up next */}
          {next && (
            <div
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-0.5 border-t border-border/30"
              aria-label={`Next segment: ${KIND_LABELS[next.kind] ?? next.kind}, ${formatSec(next.durationSec)}${nextW !== null ? `, ${nextW} W` : ''}`}
            >
              <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
              <span className="opacity-60" aria-hidden="true">Next:</span>
              <span
                className="font-semibold"
                style={{ color: (KIND_COLORS[next.kind] ?? KIND_COLORS['steady']).hex }}
                aria-hidden="true"
              >
                {KIND_LABELS[next.kind] ?? next.kind}
              </span>
              <span className="opacity-40" aria-hidden="true">·</span>
              <span className="num opacity-60 tabular-nums" aria-hidden="true">{formatSec(next.durationSec)}</span>
              {nextW !== null && (
                <>
                  <span className="opacity-40" aria-hidden="true">·</span>
                  <span className="num opacity-60 tabular-nums" aria-hidden="true">{nextW} W</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Power-shape minimap ────────────────────────────────────── */}
      <div className="pointer-events-auto glass glass-hairline rounded-xl px-2 py-1.5">
        <WorkoutPowerProfile
          workout={activeWorkout}
          ftpW={ftpW}
          cursorSec={workoutElapsedSec}
          variant="compact"
        />
      </div>

      {/* ── Overall workout progress ───────────────────────────────── */}
      <div className="pointer-events-auto glass glass-hairline rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold text-foreground/80 truncate max-w-[16ch]">
              {activeWorkout.name}
            </span>
            <span
              className="text-muted-foreground/70"
              aria-label={`Segment ${index + 1} of ${segmentCount}`}
            >
              Seg {segmentLabel}
            </span>
          </div>
          <span
            className="num tabular-nums text-muted-foreground shrink-0"
            aria-label={`Workout time: ${formatSec(workoutElapsedSec)} of ${formatSec(totalSec)}`}
          >
            {formatSec(workoutElapsedSec)}{' '}
            <span className="opacity-40" aria-hidden="true">/</span>{' '}
            {formatSec(totalSec)}
          </span>
        </div>
        <div
          className="relative"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Workout progress: ${Math.round(progress * 100)}%`}
        >
          <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${(progress * 100).toFixed(2)}%`,
                background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
              }}
            />
          </div>
          {/* Rider dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-[left] duration-500 ease-out"
            style={{ left: `${(progress * 100).toFixed(2)}%` }}
            aria-hidden="true"
          >
            <div className="h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background shadow-[0_0_6px_hsl(var(--accent)/0.7)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delta label — shows +/- difference between actual and target power
// ---------------------------------------------------------------------------

function DeltaLabel({ delta, className }: { delta: number; className?: string }): ReactNode {
  if (delta > 0) {
    return (
      <span className={className} aria-label={`${delta} watts above target`}>
        <TrendingUp className="inline h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
        +{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className={className} aria-label={`${Math.abs(delta)} watts below target`}>
        <TrendingDown className="inline h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
        {delta}
      </span>
    );
  }
  return <span className={className} aria-label="On target">✓ on target</span>;
}
