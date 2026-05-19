/**
 * WorkoutLibrary — list of saved workouts with load/delete actions.
 * Used on the Home page and in the WorkoutPanel.
 */

import { useCallback, useEffect, useState } from 'react';
import { Dumbbell, Trash2, Play, Clock, Zap, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { listWorkouts, deleteWorkout } from '@/lib/workoutLibrary';
import { totalDurationSec, estimateTSS } from '@/lib/workout';
import type { Workout } from '@/lib/workout';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRideStore } from '@/stores/rideStore';

function formatDurSec(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

interface WorkoutLibraryProps {
  /** Called when user clicks "Select" for a workout — receives the workout. */
  onSelect?: (workout: Workout) => void;
  className?: string;
}

export function WorkoutLibrary({ onSelect, className }: WorkoutLibraryProps) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ftpW = useSettingsStore((s) => s.ftpW);
  const activeWorkout = useRideStore((s) => s.activeWorkout);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    listWorkouts()
      .then(setWorkouts)
      .catch((err) => {
        setWorkouts([]);
        setError(err instanceof Error ? err.message : 'Could not load workouts');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteWorkout(id).catch(() => undefined);
    reload();
  }, [reload]);

  /* ---- Loading skeleton ---- */
  if (loading) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-busy="true" aria-label="Loading workouts">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border/40 bg-muted/20 p-3 h-14 animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    );
  }

  /* ---- Error state ---- */
  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          'flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive',
          className,
        )}
      >
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium leading-snug">Could not load library</p>
          <p className="text-[12px] mt-0.5 opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  /* ---- Empty state ---- */
  if (workouts.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center',
          className,
        )}
      >
        <Dumbbell className="h-7 w-7 mx-auto mb-2.5 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">No saved workouts yet</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">Build one above and save it.</p>
      </div>
    );
  }

  /* ---- List ---- */
  return (
    <ul
      className={cn('flex flex-col gap-2 list-none m-0 p-0', className)}
      aria-label="Saved workouts"
    >
      {workouts.map((w) => {
        const dur = totalDurationSec(w);
        const tss = estimateTSS(w, ftpW);
        const isActive = activeWorkout?.id === w.id;

        return (
          <li
            key={w.id}
            className={cn(
              'glass glass-hairline rounded-xl p-3 flex items-center gap-3 transition-colors',
              isActive
                ? 'ring-1 ring-accent/40 border-accent/30'
                : 'border-border/50 hover:border-border/80',
            )}
          >
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground truncate">
                  {w.name}
                </span>
                {isActive && (
                  <Badge variant="accent" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                    active
                  </Badge>
                )}
                {w.source === 'ai' && (
                  <Badge variant="muted" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                    AI
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {formatDurSec(dur)}
                </span>
                <span className="flex items-center gap-0.5">
                  <Zap className="h-3 w-3" aria-hidden="true" />
                  {tss} TSS
                </span>
                <span>{w.segments.length} seg{w.segments.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {onSelect && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[2.5rem] px-2.5 gap-1 text-xs focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelect(w)}
                  aria-label={`Select workout: ${w.name}`}
                >
                  <Play className="h-3 w-3" fill="currentColor" aria-hidden="true" />
                  Select
                </Button>
              )}
              <button
                type="button"
                aria-label={`Delete workout: ${w.name}`}
                onClick={() => void handleDelete(w.id)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
