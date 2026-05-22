/**
 * WorkoutPicker — browsable, filterable workout catalog.
 *
 * Replaces the flat WorkoutLibrary list with:
 *   - Category tabs (All · Endurance · Tempo · Sweet Spot · Threshold · Intervals)
 *   - Duration filter chips (Any · ≤20 min · 21–35 min · 36+ min)
 *   - Power-profile thumbnail for every card
 *   - Clear description + key stats per card
 *   - One-tap "Select" and optional "Ride now" actions
 *
 * Drop-in wherever WorkoutLibrary is used; accepts the same `onSelect` prop.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dumbbell,
  Play,
  Clock,
  Zap,
  AlertCircle,
  Filter,
  ChevronRight,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { listWorkouts, deleteWorkout, seedPresetWorkoutsIfMissing } from '@/lib/workoutLibrary';
import { totalDurationSec, estimateTSS } from '@/lib/workout';
import type { Workout, WorkoutCategory } from '@/lib/workout';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRideStore } from '@/stores/rideStore';
import { WorkoutPowerProfile } from '@/components/WorkoutPowerProfile';

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

interface CategoryMeta {
  label: string;
  color: string;       // Tailwind text color class for active tab
  bgColor: string;     // Tailwind bg class for active tab
  borderColor: string; // Tailwind border class for active tab
  dot: string;         // dot color for badges
}

const CATEGORY_META: Record<WorkoutCategory | 'all', CategoryMeta> = {
  all:        { label: 'All',        color: 'text-foreground',                bgColor: 'bg-muted/80',          borderColor: 'border-border',          dot: 'bg-muted-foreground' },
  endurance:  { label: 'Endurance',  color: 'text-sky-600 dark:text-sky-400', bgColor: 'bg-sky-500/12',        borderColor: 'border-sky-500/40',       dot: 'bg-sky-400' },
  tempo:      { label: 'Tempo',      color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/12',  borderColor: 'border-amber-500/40',     dot: 'bg-amber-400' },
  sweetspot:  { label: 'Sweet Spot', color: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-500/12', borderColor: 'border-violet-500/40', dot: 'bg-violet-400' },
  threshold:  { label: 'Threshold',  color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-500/12',    borderColor: 'border-rose-500/40',      dot: 'bg-rose-400' },
  intervals:  { label: 'Intervals',  color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-500/12', borderColor: 'border-orange-500/40', dot: 'bg-orange-400' },
  test:       { label: 'FTP Test',   color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/12', borderColor: 'border-emerald-500/40', dot: 'bg-emerald-400' },
  custom:     { label: 'Custom',     color: 'text-foreground',                bgColor: 'bg-muted/80',          borderColor: 'border-border',          dot: 'bg-muted-foreground' },
};

const CATEGORY_TABS: Array<WorkoutCategory | 'all'> = [
  'all', 'endurance', 'tempo', 'sweetspot', 'threshold', 'intervals', 'test', 'custom',
];

// ---------------------------------------------------------------------------
// Duration buckets
// ---------------------------------------------------------------------------

type DurationFilter = 'any' | 'short' | 'medium' | 'long';

const DURATION_FILTERS: Array<{ value: DurationFilter; label: string }> = [
  { value: 'any',    label: 'Any length' },
  { value: 'short',  label: '≤20 min' },
  { value: 'medium', label: '21–35 min' },
  { value: 'long',   label: '36+ min' },
];

function matchesDuration(durationSec: number, filter: DurationFilter): boolean {
  const min = durationSec / 60;
  switch (filter) {
    case 'short':  return min <= 20;
    case 'medium': return min > 20 && min <= 35;
    case 'long':   return min > 35;
    default:       return true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDurMin(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function resolveCategory(w: Workout): WorkoutCategory | 'all' {
  return w.category ?? 'custom';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WorkoutPickerProps {
  /** Called when the user selects a workout from the list. */
  onSelect?: (workout: Workout) => void;
  /** If provided, shows a "Ride now" button that bypasses saving. */
  onRide?: (workout: Workout) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkoutPicker({ onSelect, onRide, className }: WorkoutPickerProps) {
  const [workouts, setWorkouts]         = useState<Workout[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [activeCategory, setCategory]   = useState<WorkoutCategory | 'all'>('all');
  const [durationFilter, setDuration]   = useState<DurationFilter>('any');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const ftpW         = useSettingsStore((s) => s.ftpW);
  const activeWorkout = useRideStore((s) => s.activeWorkout);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    seedPresetWorkoutsIfMissing()
      .catch(() => undefined)
      .then(() => listWorkouts())
      .then(setWorkouts)
      .catch((err) => {
        setWorkouts([]);
        setError(err instanceof Error ? err.message : 'Could not load workouts');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = useCallback(async (id: string) => {
    if (pendingDelete !== id) { setPendingDelete(id); return; }
    await deleteWorkout(id).catch(() => undefined);
    setPendingDelete(null);
    reload();
  }, [pendingDelete, reload]);

  // Filtered list
  const filtered = useMemo(() => {
    return workouts.filter((w) => {
      const catOk = activeCategory === 'all' || resolveCategory(w) === activeCategory;
      const durOk = matchesDuration(totalDurationSec(w), durationFilter);
      return catOk && durOk;
    });
  }, [workouts, activeCategory, durationFilter]);

  // Category counts (for badges)
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<WorkoutCategory | 'all', number>> = { all: workouts.length };
    for (const w of workouts) {
      const cat = resolveCategory(w);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [workouts]);

  // ---------------------------------------------------------------------------
  // Loading / error / empty
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border/40 bg-muted/20 h-16 animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className={cn('flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive', className)}>
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium leading-snug">Could not load workouts</p>
          <p className="text-[12px] mt-0.5 opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className={cn('rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center', className)}>
        <Dumbbell className="h-7 w-7 mx-auto mb-2.5 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">No workouts yet</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">Build one and save it, or use an AI-generated plan.</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn('flex flex-col gap-3', className)}>

      {/* Category filter toggles */}
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filter by category">
        {CATEGORY_TABS.map((cat) => {
          const meta    = CATEGORY_META[cat];
          const count   = categoryCounts[cat] ?? 0;
          const isActive = cat === activeCategory;
          if (cat !== 'all' && count === 0) return null;
          return (
            <button
              key={cat}
              aria-pressed={isActive}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? `${meta.bgColor} ${meta.borderColor} ${meta.color}`
                  : 'border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {isActive && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', meta.dot)} aria-hidden />}
              {meta.label}
              <span className={cn('opacity-60', isActive && 'opacity-80')}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Duration filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden />
        {DURATION_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setDuration(value)}
            className={cn(
              'rounded-full border px-2 py-0 text-[11px] font-medium transition-all leading-5',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              durationFilter === value
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/50 bg-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Result count */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 py-6 text-center text-sm text-muted-foreground">
          No workouts match these filters.
        </div>
      ) : (
        <ul className="flex flex-col gap-2 list-none m-0 p-0" aria-label="Workout list">
          {filtered.map((w) => (
            <WorkoutCard
              key={w.id}
              workout={w}
              ftpW={ftpW}
              isActive={activeWorkout?.id === w.id}
              isExpanded={expanded === w.id}
              isPendingDelete={pendingDelete === w.id}
              onToggleExpand={() => setExpanded((prev) => prev === w.id ? null : w.id)}
              onSelect={onSelect}
              onRide={onRide}
              onDelete={() => void handleDelete(w.id)}
              onDeleteBlur={() => pendingDelete === w.id && setPendingDelete(null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual workout card
// ---------------------------------------------------------------------------

interface WorkoutCardProps {
  workout: Workout;
  ftpW: number;
  isActive: boolean;
  isExpanded: boolean;
  isPendingDelete: boolean;
  onToggleExpand: () => void;
  onSelect?: (w: Workout) => void;
  onRide?: (w: Workout) => void;
  onDelete: () => void;
  onDeleteBlur: () => void;
}

function WorkoutCard({
  workout: w,
  ftpW,
  isActive,
  isExpanded,
  isPendingDelete,
  onToggleExpand,
  onSelect,
  onRide,
  onDelete,
  onDeleteBlur,
}: WorkoutCardProps) {
  const dur  = totalDurationSec(w);
  const tss  = estimateTSS(w, ftpW);
  const cat  = resolveCategory(w);
  const meta = CATEGORY_META[cat];

  return (
    <li
      className={cn(
        'rounded-xl border transition-all duration-150',
        isActive
          ? 'border-accent/40 bg-accent/5 ring-1 ring-accent/25'
          : 'border-border/60 bg-card/40 hover:border-border/90 hover:bg-card/60',
      )}
    >
      {/* Main row — always visible */}
      <div className="flex items-center gap-2.5 p-3">

        {/* Power profile thumbnail */}
        <div className="hidden sm:block shrink-0 w-16 md:w-20" aria-hidden>
          <WorkoutPowerProfile workout={w} ftpW={ftpW} variant="thumbnail" heightClass="h-10" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{w.name}</span>
            {isActive && (
              <Badge variant="accent" className="text-[9px] px-1.5 py-0 h-4 shrink-0">active</Badge>
            )}
            {w.source === 'preset' && (
              <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4 shrink-0">Preset</Badge>
            )}
            {w.source === 'ai' && (
              <Badge variant="muted" className="text-[9px] px-1.5 py-0 h-4 shrink-0">AI</Badge>
            )}
            {/* Category dot badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[9px] font-semibold',
                meta.bgColor, meta.borderColor, meta.color,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', meta.dot)} aria-hidden />
              {meta.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5 num">
              <Clock className="h-3 w-3" aria-hidden /> {formatDurMin(dur)}
            </span>
            <span className="flex items-center gap-0.5 num">
              <Zap className="h-3 w-3" aria-hidden /> {tss} TSS
            </span>
            <span>{w.segments.length} seg{w.segments.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Expand/collapse for description + full-size chart */}
          <button
            type="button"
            aria-label={isExpanded ? 'Collapse workout details' : 'Expand workout details'}
            aria-expanded={isExpanded}
            onClick={onToggleExpand}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-200', isExpanded && 'rotate-90')} />
          </button>

          {onSelect && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 gap-1 text-xs"
              onClick={() => onSelect(w)}
              aria-label={`Select workout: ${w.name}`}
            >
              <Play className="h-3 w-3" fill="currentColor" aria-hidden />
              Select
            </Button>
          )}

          <button
            type="button"
            aria-label={isPendingDelete ? 'Confirm delete' : `Delete ${w.name}`}
            title={isPendingDelete ? 'Click again to confirm' : 'Delete workout'}
            onClick={onDelete}
            onBlur={onDeleteBlur}
            className={cn(
              'h-7 w-7 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isPendingDelete
                ? 'text-destructive bg-destructive/10'
                : 'text-muted-foreground hover:text-destructive hover:bg-destructive/8',
            )}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Expanded details panel */}
      {isExpanded && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2.5 flex flex-col gap-2.5">
          {/* Full-size power profile */}
          <WorkoutPowerProfile workout={w} ftpW={ftpW} variant="compact" heightClass="h-24" />

          {/* Description */}
          {w.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{w.description}</p>
          )}

          {/* "Ride now" action */}
          {onRide && (
            <div className="flex justify-end pt-0.5">
              <Button
                variant="accent"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => onRide(w)}
              >
                <Play className="h-3 w-3" fill="currentColor" aria-hidden />
                Ride this workout
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
