/**
 * WorkoutHUD — overlay shown during an active workout session.
 *
 * Displayed alongside (below) the existing RideHUD when a workout is running.
 * Shows:
 *   - Current segment name + kind color badge
 *   - Target watts and %FTP
 *   - Countdown timer for current segment
 *   - "Up next" segment
 *   - Overall workout progress bar
 *
 * Premium design: matches RideHUD's glass/card/badge system.
 */

import { Activity, ChevronRight, Zap, Timer } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { segmentAt, resolveTargetWatts } from '@/lib/workout';
import { totalDurationSec } from '@/lib/workout';
import { cn } from '@/lib/utils';

// Segment kind → color class (must match WorkoutBuilder palette)
const KIND_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  warmup:    { bg: 'bg-amber-400/20',  text: 'text-amber-400',  ring: 'ring-amber-400/30' },
  steady:    { bg: 'bg-sky-400/20',    text: 'text-sky-400',    ring: 'ring-sky-400/30' },
  interval:  { bg: 'bg-rose-500/20',   text: 'text-rose-400',   ring: 'ring-rose-400/30' },
  recovery:  { bg: 'bg-emerald-400/20',text: 'text-emerald-400',ring: 'ring-emerald-400/30' },
  ramp:      { bg: 'bg-violet-400/20', text: 'text-violet-400', ring: 'ring-violet-400/30' },
  cooldown:  { bg: 'bg-blue-300/20',   text: 'text-blue-400',   ring: 'ring-blue-400/30' },
  freeride:  { bg: 'bg-slate-400/20',  text: 'text-slate-400',  ring: 'ring-slate-400/30' },
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

export function WorkoutHUD() {
  const activeWorkout    = useRideStore((s) => s.activeWorkout);
  const workoutElapsedSec = useRideStore((s) => s.workoutElapsedSec);
  const workoutTargetWatts = useRideStore((s) => s.workoutTargetWatts);
  const workoutRunning   = useRideStore((s) => s.workoutRunning);
  const rideState        = useRideStore((s) => s.rideState);
  const ftpW             = useSettingsStore((s) => s.ftpW);

  // Only render when workout is attached and ride is active
  if (!activeWorkout || (rideState !== 'running' && rideState !== 'paused')) return null;

  const cursor = segmentAt(activeWorkout, workoutElapsedSec);
  if (!cursor) return null; // workout finished — engine will call finish()

  const { segment, remainingInSegmentSec, elapsedInSegmentSec, next } = cursor;
  const totalSec = totalDurationSec(activeWorkout);
  const progress = totalSec > 0 ? Math.min(1, workoutElapsedSec / totalSec) : 0;
  const segProgress = segment.durationSec > 0
    ? Math.min(1, elapsedInSegmentSec / segment.durationSec)
    : 0;

  const colors = KIND_COLORS[segment.kind] ?? KIND_COLORS['steady'];
  const targetW = workoutTargetWatts;
  const targetPct = ftpW > 0 && targetW !== null ? Math.round((targetW / ftpW) * 100) : null;

  return (
    <div className="pointer-events-none flex flex-col gap-2">
      {/* Main segment card */}
      <div
        className={cn(
          'pointer-events-auto glass glass-hairline rounded-2xl p-3 sm:p-3.5 ring-halo',
          'flex flex-col gap-2',
        )}
      >
        {/* Segment header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Kind badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                colors.bg,
                colors.text,
                'ring-1',
                colors.ring,
              )}
            >
              <Activity className="h-2.5 w-2.5" />
              {KIND_LABELS[segment.kind] ?? segment.kind}
            </span>
            {workoutRunning ? (
              <span className="flex h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            ) : (
              <span className="flex h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            )}
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Timer className="h-3 w-3" />
            <span className="num text-sm font-bold text-foreground tabular-nums">
              {formatSec(Math.max(0, remainingInSegmentSec))}
            </span>
          </div>
        </div>

        {/* Target power + %FTP */}
        {targetW !== null ? (
          <div className="flex items-baseline gap-2">
            <div className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="num text-2xl sm:text-3xl font-bold text-amber-300 tabular-nums leading-none">
                {targetW}
              </span>
              <span className="text-xs text-muted-foreground">W</span>
            </div>
            {targetPct !== null && (
              <span className="text-xs text-muted-foreground">
                {targetPct}% FTP
              </span>
            )}
            {segment.cadenceTarget && (
              <span className="text-xs text-muted-foreground ml-auto">
                {segment.cadenceTarget} rpm
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">
            {segment.target.type === 'grade'
              ? `${segment.target.gradePct >= 0 ? '+' : ''}${segment.target.gradePct}% grade`
              : 'Free ride — no ERG target'}
          </div>
        )}

        {/* Segment progress bar */}
        <div className="relative h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-out',
              colors.bg.replace('/20', '/70'),
            )}
            style={{ width: `${(segProgress * 100).toFixed(1)}%` }}
          />
        </div>

        {/* Up next */}
        {next && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="opacity-70">Up next:</span>
            <span className="font-medium text-foreground/80">
              {KIND_LABELS[next.kind] ?? next.kind}
            </span>
            <span className="opacity-60">·</span>
            <span className="num opacity-60">{formatSec(next.durationSec)}</span>
            {(() => {
              const nextW = resolveTargetWatts(next, 0, ftpW);
              if (nextW === null) return null;
              return (
                <span className="num opacity-60">· {nextW} W</span>
              );
            })()}
          </div>
        )}
      </div>

      {/* Overall progress bar */}
      <div className="pointer-events-auto glass glass-hairline rounded-xl px-3 py-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="font-semibold text-foreground/80 truncate max-w-[16ch]">
            {activeWorkout.name}
          </span>
          <span className="num tabular-nums shrink-0">
            {formatSec(workoutElapsedSec)} / {formatSec(totalSec)}
          </span>
        </div>
        <div className="relative h-1 rounded-full bg-muted/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-sky-300 to-accent transition-[width] duration-500 ease-out"
            style={{ width: `${(progress * 100).toFixed(2)}%` }}
          />
        </div>
        {/* Rider dot */}
        <div
          className="relative -mt-2.5 mb-0 h-0"
          style={{ paddingLeft: `calc(${(progress * 100).toFixed(2)}% - 5px)` }}
        >
          <div className="h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background shadow-[0_0_6px_hsl(var(--accent)/0.6)]" />
        </div>
      </div>
    </div>
  );
}
