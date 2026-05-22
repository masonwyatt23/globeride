/**
 * WorkoutHUD — premium overlay shown during a structured workout session.
 *
 * Panels (top to bottom in the HUD column):
 *   1. Segment card — kind badge, target vs actual power, segment countdown,
 *      segment progress arc, up-next strip.
 *   2. Power-shape preview (WorkoutPowerProfile, compact).
 *   3. Overall workout progress bar.
 */

import { Activity, ChevronRight, Zap, Timer, TrendingUp, TrendingDown } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { segmentAt, resolveTargetWatts, totalDurationSec } from '@/lib/workout';
import { cn } from '@/lib/utils';
import { WorkoutPowerProfile } from '@/components/WorkoutPowerProfile';

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

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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

  if (!activeWorkout || (rideState !== 'running' && rideState !== 'paused')) return null;

  const cursor = segmentAt(activeWorkout, workoutElapsedSec);
  if (!cursor) return null;

  const { segment, remainingInSegmentSec, elapsedInSegmentSec, next } = cursor;
  const totalSec   = totalDurationSec(activeWorkout);
  const progress   = totalSec > 0 ? Math.min(1, workoutElapsedSec / totalSec) : 0;
  const segPct     = segment.durationSec > 0
    ? Math.min(1, elapsedInSegmentSec / segment.durationSec) * 100
    : 0;

  const colors   = KIND_COLORS[segment.kind] ?? KIND_COLORS['steady'];
  const targetW  = workoutTargetWatts;
  const targetPct = ftpW > 0 && targetW !== null ? Math.round((targetW / ftpW) * 100) : null;

  // Actual vs target gap
  const delta = targetW !== null && power > 0 ? Math.round(power - targetW) : null;
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

  return (
    <div className="pointer-events-none flex flex-col gap-2">

      {/* ── Segment card ──────────────────────────────────────────── */}
      <div className="pointer-events-auto glass glass-hairline rounded-2xl overflow-hidden">
        {/* Kind accent bar */}
        <div
          className="h-0.5 w-full transition-colors duration-700"
          style={{ backgroundColor: colors.hex }}
        />

        <div className="p-3 sm:p-3.5 flex flex-col gap-2.5">

          {/* Header: kind badge + live indicator + countdown */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                  'text-[10px] font-semibold uppercase tracking-wide ring-1',
                  colors.bg, colors.text, colors.ring,
                )}
              >
                <Activity className="h-2.5 w-2.5" />
                {KIND_LABELS[segment.kind] ?? segment.kind}
              </span>
              {/* Live pulse or paused dot */}
              {workoutRunning ? (
                <span className="flex h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: colors.hex }} />
              ) : (
                <span className="flex h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              )}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Timer className="h-3 w-3" />
              <span className="num text-sm font-bold text-foreground tabular-nums">
                {formatSec(Math.max(0, remainingInSegmentSec))}
              </span>
            </div>
          </div>

          {/* Power readout: target · actual · delta */}
          {targetW !== null ? (
            <div className="flex items-end gap-3">
              {/* Target */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                  <Zap className="h-2.5 w-2.5 text-amber-400" />
                  <span>target</span>
                </div>
                <div
                  className="num font-bold tabular-nums leading-none transition-colors duration-500"
                  style={{
                    fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                    color: colors.hex,
                  }}
                >
                  {targetW}
                  <span className="text-xs font-normal text-muted-foreground ml-1">W</span>
                </div>
                {targetPct !== null && (
                  <div className="text-[10px] text-muted-foreground">{targetPct}% FTP</div>
                )}
              </div>

              {/* Actual power + delta */}
              {power > 0 && (
                <div className="flex flex-col gap-0.5 ml-auto items-end">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    actual
                  </div>
                  <div className="num text-xl sm:text-2xl font-bold text-foreground tabular-nums leading-none">
                    {Math.round(power)}
                    <span className="text-xs font-normal text-muted-foreground ml-1">W</span>
                  </div>
                  {delta !== null && (
                    <div className={cn('num text-[11px] font-semibold tabular-nums', deltaColor)}>
                      {delta > 0
                        ? <><TrendingUp className="inline h-2.5 w-2.5 mr-0.5" />+{delta}</>
                        : delta < 0
                          ? <><TrendingDown className="inline h-2.5 w-2.5 mr-0.5" />{delta}</>
                          : '✓ on target'
                      }
                    </div>
                  )}
                </div>
              )}

              {/* Cadence target */}
              {segment.cadenceTarget && (
                <div className="flex flex-col gap-0.5 items-end">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">rpm</div>
                  <div className="num text-sm font-semibold text-foreground/70 tabular-nums">{segment.cadenceTarget}</div>
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
          <div className="relative h-1.5 rounded-full bg-muted/40 overflow-hidden">
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
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-0.5 border-t border-border/30">
              <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
              <span className="opacity-60">Next:</span>
              <span
                className="font-semibold"
                style={{ color: (KIND_COLORS[next.kind] ?? KIND_COLORS['steady']).hex }}
              >
                {KIND_LABELS[next.kind] ?? next.kind}
              </span>
              <span className="opacity-40">·</span>
              <span className="num opacity-60 tabular-nums">{formatSec(next.durationSec)}</span>
              {nextW !== null && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="num opacity-60 tabular-nums">{nextW} W</span>
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
          <span className="font-semibold text-foreground/80 truncate max-w-[16ch]">
            {activeWorkout.name}
          </span>
          <span className="num tabular-nums text-muted-foreground shrink-0">
            {formatSec(workoutElapsedSec)}{' '}
            <span className="opacity-40">/</span>{' '}
            {formatSec(totalSec)}
          </span>
        </div>
        <div className="relative">
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
          >
            <div className="h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background shadow-[0_0_6px_hsl(var(--accent)/0.7)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
