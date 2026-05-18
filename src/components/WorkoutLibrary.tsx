/**
 * WorkoutLibrary — list of saved workouts with load/delete actions.
 * Used on the Home page and in the WorkoutPanel.
 */

import { useCallback, useEffect, useState } from 'react';
import { Dumbbell, Trash2, Play, Clock, Zap } from 'lucide-react';

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
  /** Called when user clicks "Ride" for a workout — receives the workout. */
  onSelect?: (workout: Workout) => void;
  className?: string;
}

export function WorkoutLibrary({ onSelect, className }: WorkoutLibraryProps) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const ftpW = useSettingsStore((s) => s.ftpW);
  const activeWorkout = useRideStore((s) => s.activeWorkout);

  const reload = useCallback(() => {
    setLoading(true);
    listWorkouts()
      .then(setWorkouts)
      .catch(() => setWorkouts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteWorkout(id).catch(() => undefined);
    reload();
  }, [reload]);

  if (loading) {
    return (
      <div className={cn('text-sm text-muted-foreground animate-pulse', className)}>
        Loading workouts…
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className={cn('rounded-xl border border-dashed border-border/60 p-5 text-center text-sm text-muted-foreground', className)}>
        <Dumbbell className="h-6 w-6 mx-auto mb-2 opacity-30" />
        No saved workouts yet. Build one above and save it.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {workouts.map((w) => {
        const dur = totalDurationSec(w);
        const tss = estimateTSS(w, ftpW);
        const isActive = activeWorkout?.id === w.id;

        return (
          <div
            key={w.id}
            className={cn(
              'rounded-xl border border-border/60 bg-card/50 p-3 flex items-center gap-3',
              isActive && 'ring-1 ring-accent/40 border-accent/30',
            )}
          >
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground truncate">
                  {w.name}
                </span>
                {isActive && (
                  <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4">
                    active
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {formatDurSec(dur)}
                </span>
                <span className="flex items-center gap-0.5">
                  <Zap className="h-3 w-3" />
                  {tss} TSS
                </span>
                <span>{w.segments.length} seg</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {onSelect && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs"
                  onClick={() => onSelect(w)}
                >
                  <Play className="h-3 w-3" fill="currentColor" />
                  Select
                </Button>
              )}
              <button
                type="button"
                aria-label={`Delete workout ${w.name}`}
                onClick={() => void handleDelete(w.id)}
                className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
