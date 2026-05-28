/**
 * CoachPlanEditor — manual weekly training plan grid.
 *
 * A hands-on alternative to the AI Coach: the rider drops a workout onto
 * each day of the week, sees the weekly TSS / IF roll up live, and can
 * shift the plan forward when the week rolls over. Lives ABOVE the AI
 * Coach on the Training (History) tab so the AI coach remains the
 * automatic option for riders who don't want to plan by hand.
 *
 * Layout:
 *   - Header row: title, week counter, day count, TSS + IF totals.
 *   - 7-col grid (Mon..Sun). Today's column has a subtle ring.
 *   - Each cell: day label + day-of-month chip + workout summary
 *     (or "+ Add workout" affordance).
 *   - Picker modal: pops the existing WorkoutPicker for selection.
 *   - Cell actions popover: Replace / Clear / "Start this now".
 *   - Footer: Shift week forward + Clear plan (with confirm).
 *
 * All state lives in `useSettingsStore`. The pure helpers in
 * `CoachPlanEditor.helpers.ts` are unit-tested separately.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange,
  Plus,
  Play,
  X,
  Trash2,
  ChevronRight,
  Clock,
  Zap,
  Flame,
  ArrowRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDurMin } from '@/lib/format';
import {
  emptyPlan,
  isPlanEmpty,
  plannedDayCount,
  weeklyTSS,
  weeklyIntensityFactor,
  type WeeklyPlan,
} from '@/lib/coach/plan';
import {
  totalDurationSec,
  estimateTSS,
  intensityFactor as resolveIF,
  type Workout,
  type WorkoutPhase,
} from '@/lib/workout';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRideStore } from '@/stores/rideStore';
import { WorkoutPicker } from '@/components/workouts/WorkoutPicker';
import {
  DAYS_IN_WEEK,
  currentDayIdx,
  dayOfMonthForIdx,
  shortLabelFor,
  longLabelFor,
  formatWeeklyIF,
  intensityBucket,
  type CellIntensity,
} from '@/components/training/CoachPlanEditor.helpers';

// ---------------------------------------------------------------------------
// Visual metadata for phase + intensity chips — matches WorkoutPicker palette.
// ---------------------------------------------------------------------------

const PHASE_META: Record<WorkoutPhase, { label: string; cls: string }> = {
  recovery: { label: 'Recovery', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  base:     { label: 'Base',     cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  build:    { label: 'Build',    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  peak:     { label: 'Peak',     cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
};

const INTENSITY_META: Record<CellIntensity, { label: string; cls: string }> = {
  easy:     { label: 'Easy',     cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  moderate: { label: 'Moderate', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  hard:     { label: 'Hard',     cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  severe:   { label: 'Severe',   cls: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CoachPlanEditorProps {
  className?: string;
}

export function CoachPlanEditor({ className }: CoachPlanEditorProps) {
  const navigate = useNavigate();

  const coachPlan       = useSettingsStore((s) => s.coachPlan);
  const ftpW            = useSettingsStore((s) => s.ftpW);
  const setCoachPlanDay = useSettingsStore((s) => s.setCoachPlanDay);
  const clearCoachPlan  = useSettingsStore((s) => s.clearCoachPlan);
  const shiftWeek       = useSettingsStore((s) => s.shiftCoachPlanToNextWeek);

  const loadWorkout     = useRideStore((s) => s.loadWorkout);

  // dayIdx currently being edited via the modal picker; null means closed.
  const [pickerForDay,   setPickerForDay]   = useState<number | null>(null);
  // dayIdx whose action popover is open. -1 / null = closed.
  const [actionsForDay,  setActionsForDay]  = useState<number | null>(null);
  const [confirmClear,   setConfirmClear]   = useState(false);

  // Re-derive "today" each render so the highlight stays correct if the
  // tab is left open across midnight.
  const todayIdx = useMemo(() => currentDayIdx(), []);

  // Esc closes whichever overlay is open.
  useEffect(() => {
    if (pickerForDay === null && actionsForDay === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPickerForDay(null);
        setActionsForDay(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pickerForDay, actionsForDay]);

  const handleSelectForDay = useCallback(
    (dayIdx: number, workout: Workout) => {
      setCoachPlanDay(dayIdx, workout);
      setPickerForDay(null);
      setActionsForDay(null);
    },
    [setCoachPlanDay],
  );

  const handleClearDay = useCallback(
    (dayIdx: number) => {
      setCoachPlanDay(dayIdx, null);
      setActionsForDay(null);
    },
    [setCoachPlanDay],
  );

  const handleStartNow = useCallback(
    (workout: Workout) => {
      loadWorkout(workout);
      setActionsForDay(null);
      navigate('/app');
    },
    [loadWorkout, navigate],
  );

  // -------------------------------------------------------------------------
  // Empty CTA — null plan or every-day-empty
  // -------------------------------------------------------------------------

  if (!coachPlan || isPlanEmpty(coachPlan)) {
    return (
      <EmptyState
        className={className}
        plan={coachPlan}
        onStart={() => {
          // Seed an empty grid by writing null to day 0 — the store
          // lazily creates the plan on first write.
          setCoachPlanDay(0, null);
          // Open the picker on today so the next click is meaningful.
          setPickerForDay(todayIdx);
        }}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Plan exists — render the grid
  // -------------------------------------------------------------------------

  const weekTSS  = weeklyTSS(coachPlan, ftpW);
  const weekIF   = weeklyIntensityFactor(coachPlan);
  const planned  = plannedDayCount(coachPlan);

  return (
    <section
      className={cn(
        'rounded-xl glass glass-hairline text-card-foreground p-4 sm:p-5',
        className,
      )}
      aria-label="Manual weekly training plan"
      data-testid="coach-plan-editor"
    >
      {/* Header */}
      <header className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CalendarRange className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground leading-tight">My Plan</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Manual week — drop a workout on each day.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="muted" className="text-[10px] h-5 num">Week {coachPlan.week}</Badge>
          <Badge variant="muted" className="text-[10px] h-5 num">
            {planned}/{DAYS_IN_WEEK} days
          </Badge>
          <Badge variant="default" className="text-[10px] h-5 num" data-testid="weekly-tss">
            <Zap className="h-2.5 w-2.5 mr-0.5" aria-hidden />{weekTSS} TSS
          </Badge>
          <Badge variant="muted" className="text-[10px] h-5 num" data-testid="weekly-if">
            IF {formatWeeklyIF(weekIF)}
          </Badge>
        </div>
      </header>

      {/* Grid */}
      <div
        className="mt-4 grid grid-cols-7 gap-1.5"
        role="list"
        aria-label="Days of the week"
      >
        {coachPlan.days.map((workout, dayIdx) => (
          <DayCell
            key={dayIdx}
            dayIdx={dayIdx}
            workout={workout}
            isToday={dayIdx === todayIdx}
            ftpW={ftpW}
            actionsOpen={actionsForDay === dayIdx}
            onAdd={() => setPickerForDay(dayIdx)}
            onClick={() =>
              setActionsForDay((prev) => (prev === dayIdx ? null : dayIdx))
            }
            onReplace={() => {
              setActionsForDay(null);
              setPickerForDay(dayIdx);
            }}
            onClear={() => handleClearDay(dayIdx)}
            onStartNow={() => workout && handleStartNow(workout)}
          />
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-4 flex items-center gap-2 flex-wrap pt-3 border-t border-border/30">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => {
            shiftWeek();
            setConfirmClear(false);
            setActionsForDay(null);
          }}
          data-testid="shift-week-btn"
        >
          <ArrowRight className="h-3 w-3" aria-hidden />
          Shift week forward
        </Button>

        <div className="grow" />

        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="text-[11px] text-muted-foreground/70 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
            data-testid="clear-plan-btn"
          >
            Clear plan
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-destructive">Clear every day?</span>
            <button
              type="button"
              onClick={() => {
                clearCoachPlan();
                setConfirmClear(false);
                setActionsForDay(null);
              }}
              className="text-[11px] font-semibold text-destructive hover:underline focus-visible:outline-none"
              data-testid="clear-plan-confirm"
            >
              Yes, clear
            </button>
            <button
              type="button"
              aria-label="Cancel clearing plan"
              onClick={() => setConfirmClear(false)}
              className="text-muted-foreground hover:text-foreground focus-visible:outline-none"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
      </footer>

      {/* Workout picker modal */}
      {pickerForDay !== null && (
        <PickerModal
          dayIdx={pickerForDay}
          onSelect={(w) => handleSelectForDay(pickerForDay, w)}
          onClose={() => setPickerForDay(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state — null plan or fully-empty grid
// ---------------------------------------------------------------------------

function EmptyState({
  className,
  plan,
  onStart,
}: {
  className?: string;
  plan: WeeklyPlan | null;
  onStart: () => void;
}) {
  // Pre-build a sample empty plan so the preview row always has 7 cells.
  const preview = plan ?? emptyPlan();
  return (
    <section
      className={cn(
        'rounded-xl glass glass-hairline text-card-foreground p-4 sm:p-5',
        className,
      )}
      aria-label="Start a manual training plan"
      data-testid="coach-plan-empty"
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CalendarRange className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground leading-tight">My Plan</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Build your week by hand — pick a workout per day and ride.
            </p>
          </div>
        </div>
        <Button
          variant="accent"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={onStart}
          data-testid="start-plan-btn"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Start a manual plan
        </Button>
      </div>

      {/* Faint preview row so the user sees what they're starting */}
      <div className="mt-4 grid grid-cols-7 gap-1.5 opacity-50 pointer-events-none">
        {preview.days.map((_, dayIdx) => (
          <div
            key={dayIdx}
            className="rounded-lg border border-dashed border-border/40 bg-muted/10 px-1.5 py-2 flex flex-col items-center text-center gap-1 min-h-[64px]"
          >
            <span className="text-[10px] font-medium text-muted-foreground">
              {shortLabelFor(dayIdx)}
            </span>
            <span className="text-[10px] text-muted-foreground/50">—</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Day cell
// ---------------------------------------------------------------------------

interface DayCellProps {
  dayIdx: number;
  workout: Workout | null;
  isToday: boolean;
  ftpW: number;
  actionsOpen: boolean;
  onAdd: () => void;
  onClick: () => void;
  onReplace: () => void;
  onClear: () => void;
  onStartNow: () => void;
}

function DayCell({
  dayIdx,
  workout,
  isToday,
  ftpW,
  actionsOpen,
  onAdd,
  onClick,
  onReplace,
  onClear,
  onStartNow,
}: DayCellProps) {
  const dom = dayOfMonthForIdx(dayIdx);
  const label = shortLabelFor(dayIdx);
  const longLabel = longLabelFor(dayIdx);

  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside-click.
  useEffect(() => {
    if (!actionsOpen) return;
    const handler = (e: MouseEvent) => {
      const node = popoverRef.current;
      if (node && !node.contains(e.target as Node)) {
        onClick(); // toggles closed
      }
    };
    // Defer one frame so the click that opened it isn't picked up.
    const id = window.setTimeout(() => {
      window.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('mousedown', handler);
    };
  }, [actionsOpen, onClick]);

  // Empty cell -- "+ Add workout" affordance
  if (!workout) {
    return (
      <div
        role="listitem"
        className={cn(
          'relative rounded-lg border border-dashed border-border/50 bg-muted/10 transition-colors',
          'hover:border-primary/40 hover:bg-primary/5',
          isToday && 'ring-1 ring-primary/40 ring-offset-1 ring-offset-background',
        )}
        data-testid={`day-cell-${dayIdx}`}
        data-today={isToday ? 'true' : 'false'}
      >
        <button
          type="button"
          onClick={onAdd}
          className="w-full h-full px-1.5 py-2 flex flex-col items-center text-center gap-1 min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          aria-label={`Add workout for ${longLabel} (day ${dom})`}
          data-testid={`day-add-${dayIdx}`}
        >
          <span className="flex items-baseline gap-1 text-[10px] font-medium text-muted-foreground">
            <span>{label}</span>
            <span className="num text-muted-foreground/60">{dom}</span>
          </span>
          <span className="mt-auto inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
            <Plus className="h-2.5 w-2.5" aria-hidden />
            Add
          </span>
        </button>
      </div>
    );
  }

  // Filled cell
  const phase = workout.phase;
  const phaseMeta = phase ? PHASE_META[phase] : null;
  const ifVal = resolveIF(workout);
  const intMeta = INTENSITY_META[intensityBucket(ifVal)];
  const dur = totalDurationSec(workout);
  const tss = estimateTSS(workout, ftpW);

  return (
    <div
      role="listitem"
      className={cn(
        'relative rounded-lg border bg-card/50 transition-colors',
        'border-border/60 hover:border-border/90 hover:bg-card/80',
        isToday && 'ring-1 ring-primary/40 ring-offset-1 ring-offset-background',
      )}
      data-testid={`day-cell-${dayIdx}`}
      data-today={isToday ? 'true' : 'false'}
      ref={popoverRef}
    >
      <button
        type="button"
        onClick={onClick}
        aria-haspopup="menu"
        aria-expanded={actionsOpen}
        aria-label={`${workout.name} on ${longLabel}, ${formatDurMin(dur)}. Click for actions.`}
        className="w-full px-1.5 py-2 flex flex-col text-left gap-1 min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        data-testid={`day-filled-${dayIdx}`}
      >
        {/* Day header */}
        <div className="flex items-baseline gap-1 text-[10px] font-medium text-muted-foreground">
          <span>{label}</span>
          <span className="num text-muted-foreground/60">{dom}</span>
        </div>

        {/* Workout name — single-line truncate */}
        <div className="text-[11px] font-semibold text-foreground leading-tight truncate">
          {workout.name}
        </div>

        {/* Phase + intensity chips */}
        <div className="flex flex-wrap gap-0.5 mt-0.5">
          {phaseMeta && (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-1 py-0 text-[9px] font-semibold leading-3',
                phaseMeta.cls,
              )}
            >
              {phaseMeta.label}
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full border px-1 py-0 text-[9px] font-semibold leading-3',
              intMeta.cls,
            )}
            title={`Intensity factor ${ifVal.toFixed(2)}`}
          >
            <Flame className="h-2 w-2" aria-hidden />
            {intMeta.label}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-auto pt-0.5">
          <span className="inline-flex items-center gap-0.5 num">
            <Clock className="h-2.5 w-2.5" aria-hidden /> {formatDurMin(dur)}
          </span>
          <span className="num">{tss} TSS</span>
        </div>
      </button>

      {actionsOpen && (
        <div
          role="menu"
          aria-label={`Actions for ${longLabel}`}
          className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border/60 bg-popover/95 backdrop-blur-sm shadow-lg p-1 flex flex-col gap-0.5"
          data-testid={`day-actions-${dayIdx}`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={onStartNow}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left"
            data-testid={`day-start-${dayIdx}`}
          >
            <Play className="h-3 w-3 text-primary" fill="currentColor" aria-hidden />
            Start this now
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onReplace}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left"
            data-testid={`day-replace-${dayIdx}`}
          >
            <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            Replace
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left"
            data-testid={`day-clear-${dayIdx}`}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            Clear day
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Picker modal — wraps the shared WorkoutPicker
// ---------------------------------------------------------------------------

function PickerModal({
  dayIdx,
  onSelect,
  onClose,
}: {
  dayIdx: number;
  onSelect: (w: Workout) => void;
  onClose: () => void;
}) {
  // Body scroll-lock while modal is open. Mirrors DemoModal's approach.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const longLabel = longLabelFor(dayIdx);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Choose workout for ${longLabel}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="picker-modal"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close picker"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm focus-visible:outline-none"
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl max-h-[88vh] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl border border-border/60 bg-popover/95 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
          <CalendarRange className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <span className="text-sm font-semibold text-foreground flex-1 truncate">
            Pick a workout for {longLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          <WorkoutPicker onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}
