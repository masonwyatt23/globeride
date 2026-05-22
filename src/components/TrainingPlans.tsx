/**
 * TrainingPlans — browse structured multi-week training plans, view the
 * weekly schedule, and start/continue a plan's workout session.
 *
 * Layout:
 *   1. If a plan is active → show the active plan dashboard (progress bar,
 *      weekly grid, "Do Today's Workout" CTA, and a full schedule).
 *   2. If no plan is active → show the plan catalog (cards with description,
 *      focus badge, level, hours/week) and let the user start one.
 *
 * Local-first: all progress is in localStorage via usePlanStore. No backend.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Calendar,
  ChevronRight,
  CheckCircle2,
  Circle,
  Play,
  Trophy,
  Zap,
  Clock,
  BarChart2,
  X,
  ArrowLeft,
  Flame,
  Target,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import {
  TRAINING_PLANS,
  getPlan,
  daysByWeek,
  nextWorkoutDay,
  type TrainingPlan,
  type PlanDay,
} from '@/lib/trainingPlans';
import { getPreset } from '@/lib/presetWorkouts';
import { totalDurationSec, estimateTSS } from '@/lib/workout';
import type { Workout } from '@/lib/workout';
import { usePlanStore } from '@/stores/planStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { WorkoutPowerProfile } from '@/components/WorkoutPowerProfile';

// ---------------------------------------------------------------------------
// Category colours (mirrors WorkoutPicker)
// ---------------------------------------------------------------------------

const FOCUS_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  endurance: { label: 'Endurance',  color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-500/12',        border: 'border-sky-500/40',       dot: 'bg-sky-400' },
  tempo:     { label: 'Tempo',      color: 'text-amber-600 dark:text-amber-400',      bg: 'bg-amber-500/12',      border: 'border-amber-500/40',     dot: 'bg-amber-400' },
  sweetspot: { label: 'Sweet Spot', color: 'text-violet-600 dark:text-violet-400',    bg: 'bg-violet-500/12',     border: 'border-violet-500/40',    dot: 'bg-violet-400' },
  threshold: { label: 'Threshold',  color: 'text-rose-600 dark:text-rose-400',        bg: 'bg-rose-500/12',       border: 'border-rose-500/40',      dot: 'bg-rose-400' },
  intervals: { label: 'Intervals',  color: 'text-orange-600 dark:text-orange-400',    bg: 'bg-orange-500/12',     border: 'border-orange-500/40',    dot: 'bg-orange-400' },
  test:      { label: 'FTP Test',   color: 'text-emerald-600 dark:text-emerald-400',  bg: 'bg-emerald-500/12',    border: 'border-emerald-500/40',   dot: 'bg-emerald-400' },
  custom:    { label: 'Custom',     color: 'text-foreground',                          bg: 'bg-muted/80',          border: 'border-border',           dot: 'bg-muted-foreground' },
};

const LEVEL_META: Record<string, { label: string; color: string }> = {
  beginner:     { label: 'Beginner',     color: 'text-emerald-600 dark:text-emerald-400' },
  intermediate: { label: 'Intermediate', color: 'text-amber-600 dark:text-amber-400' },
  advanced:     { label: 'Advanced',     color: 'text-rose-600 dark:text-rose-400' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMin(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TrainingPlansProps {
  /** Called when the user wants to ride a specific workout from the plan. */
  onRide?: (workout: Workout) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function TrainingPlans({ onRide, className }: TrainingPlansProps) {
  const activePlan = usePlanStore((s) => s.activePlan);
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);

  // If a plan is active, always show that first (unless previewing another).
  if (activePlan && !previewPlanId) {
    const plan = getPlan(activePlan.planId);
    if (plan) {
      return (
        <ActivePlanDashboard
          plan={plan}
          onRide={onRide}
          onBrowse={() => setPreviewPlanId('browse')}
          className={className}
        />
      );
    }
  }

  if (previewPlanId && previewPlanId !== 'browse') {
    const plan = getPlan(previewPlanId);
    if (plan) {
      return (
        <PlanDetail
          plan={plan}
          onBack={() => setPreviewPlanId(null)}
          onRide={onRide}
          className={className}
        />
      );
    }
  }

  return (
    <PlanCatalog
      onPreview={setPreviewPlanId}
      onBack={activePlan ? () => setPreviewPlanId(null) : undefined}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Active plan dashboard
// ---------------------------------------------------------------------------

function ActivePlanDashboard({
  plan,
  onRide,
  onBrowse,
  className,
}: {
  plan: TrainingPlan;
  onRide?: (w: Workout) => void;
  onBrowse?: () => void;
  className?: string;
}) {
  const { activePlan, completeDay, uncompleteDay, abandonPlan } = usePlanStore();
  const ftpW = useSettingsStore((s) => s.ftpW);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState<number>(0); // 0-based

  if (!activePlan) return null;

  const completedSet = useMemo(() => new Set(activePlan.completedDays), [activePlan.completedDays]);
  const weeks = daysByWeek(plan);
  const totalWorkoutDays = plan.days.filter((d) => d.workoutId !== null).length;
  const completedWorkoutDays = plan.days.filter(
    (d) => d.workoutId !== null && completedSet.has(d.day),
  ).length;
  const progressPct = totalWorkoutDays > 0 ? (completedWorkoutDays / totalWorkoutDays) * 100 : 0;
  const isFinished = completedWorkoutDays >= totalWorkoutDays;
  const nextDay = nextWorkoutDay(plan, activePlan);
  const nextWorkout = nextDay?.workoutId ? getPreset(nextDay.workoutId) : null;

  const focusMeta = FOCUS_META[plan.focus] ?? FOCUS_META.custom;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Plan header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                focusMeta.bg, focusMeta.border, focusMeta.color,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', focusMeta.dot)} />
              {focusMeta.label}
            </span>
            <Badge variant="accent" className="text-[9px] px-1.5 py-0 h-4">Active</Badge>
          </div>
          <h2 className="text-base font-bold text-foreground leading-tight">{plan.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{plan.weeks} weeks · ~{plan.hoursPerWeek}h/week</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground text-xs h-7"
          onClick={onBrowse}
        >
          Browse plans
        </Button>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">
            {isFinished ? 'Plan complete!' : `${completedWorkoutDays} / ${totalWorkoutDays} sessions done`}
          </span>
          <span className="text-muted-foreground num">{Math.round(progressPct)}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isFinished ? 'bg-emerald-500' : 'bg-primary',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* "Today's workout" CTA */}
      {!isFinished && nextDay && nextWorkout && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-primary">Next up: Day {nextDay.day}</span>
            <span className="text-xs text-muted-foreground">{nextDay.label}</span>
          </div>
          <WorkoutPowerProfile
            workout={nextWorkout}
            ftpW={ftpW}
            variant="compact"
            heightClass="h-16"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatMin(totalDurationSec(nextWorkout))}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {estimateTSS(nextWorkout, ftpW)} TSS
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRide && (
              <Button
                variant="accent"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  if (nextDay) completeDay(nextDay.day);
                  onRide(nextWorkout);
                }}
              >
                <Play className="h-3 w-3" fill="currentColor" />
                Start workout
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => nextDay && completeDay(nextDay.day)}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Mark done
            </Button>
          </div>
          {nextDay.note && (
            <p className="text-[11px] text-muted-foreground italic leading-relaxed border-t border-border/30 pt-2">
              {nextDay.note}
            </p>
          )}
        </div>
      )}

      {/* Finished state */}
      {isFinished && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 flex items-center gap-3">
          <Trophy className="h-8 w-8 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Plan complete!</p>
            <p className="text-xs text-muted-foreground mt-0.5">You finished every session in the {plan.name}. Time to level up.</p>
          </div>
        </div>
      )}

      {/* Weekly grid */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Schedule</span>
        </div>
        {weeks.map((weekDays, wi) => {
          const isExpanded = expandedWeek === wi;
          const weekNum = wi + 1;
          const weekDone = weekDays.filter(
            (d) => d.workoutId !== null && completedSet.has(d.day),
          ).length;
          const weekTotal = weekDays.filter((d) => d.workoutId !== null).length;

          return (
            <div key={wi} className="rounded-xl border border-border/50 overflow-hidden">
              {/* Week header */}
              <button
                type="button"
                onClick={() => setExpandedWeek(isExpanded ? -1 : wi)}
                aria-expanded={isExpanded}
                aria-controls={`week-panel-${wi}`}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold text-foreground flex-1">Week {weekNum}</span>
                <span className="text-[11px] text-muted-foreground num">{weekDone}/{weekTotal} done</span>
                <ChevronRight
                  className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', isExpanded && 'rotate-90')}
                />
              </button>

              {/* Compact 7-day strip (always visible) */}
              <div className="grid grid-cols-7 gap-px bg-border/30 px-0">
                {weekDays.map((d, di) => {
                  const done = completedSet.has(d.day);
                  const isRest = d.workoutId === null;
                  const isNext = nextDay?.day === d.day;
                  return (
                    <div
                      key={d.day}
                      className={cn(
                        'flex flex-col items-center py-2 gap-0.5 text-center transition-colors',
                        isNext && 'bg-primary/8',
                        done && !isRest && 'bg-emerald-500/8',
                      )}
                    >
                      <span className="text-[9px] text-muted-foreground/60 font-medium">{DOW[di]}</span>
                      {isRest ? (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      ) : done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : isNext ? (
                        <Flame className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                      )}
                      <span className={cn(
                        'text-[9px] leading-tight font-medium truncate max-w-full px-0.5',
                        done ? 'text-emerald-600 dark:text-emerald-400' :
                        isNext ? 'text-primary' :
                        isRest ? 'text-muted-foreground/30' :
                        'text-muted-foreground/60',
                      )}>
                        {isRest ? 'Rest' : d.label.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Expanded day list */}
              {isExpanded && (
                <div id={`week-panel-${wi}`} className="border-t border-border/40 divide-y divide-border/30">
                  {weekDays.map((d) => (
                    <DayRow
                      key={d.day}
                      day={d}
                      done={completedSet.has(d.day)}
                      isNext={nextDay?.day === d.day}
                      ftpW={ftpW}
                      onComplete={() => completeDay(d.day)}
                      onUncomplete={() => uncompleteDay(d.day)}
                      onRide={onRide}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Abandon plan */}
      <div className="flex justify-end pt-1">
        {!confirmAbandon ? (
          <button
            type="button"
            onClick={() => setConfirmAbandon(true)}
            className="text-[11px] text-muted-foreground/60 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Abandon plan
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-destructive">Sure? Progress will be lost.</span>
            <button
              type="button"
              onClick={() => { abandonPlan(); setConfirmAbandon(false); }}
              className="text-[11px] font-semibold text-destructive hover:underline focus-visible:outline-none"
            >
              Yes, abandon
            </button>
            <button
              type="button"
              onClick={() => setConfirmAbandon(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day row (inside expanded week)
// ---------------------------------------------------------------------------

function DayRow({
  day,
  done,
  isNext,
  ftpW,
  onComplete,
  onUncomplete,
  onRide,
}: {
  day: PlanDay;
  done: boolean;
  isNext: boolean;
  ftpW: number;
  onComplete: () => void;
  onUncomplete: () => void;
  onRide?: (w: Workout) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const workout = day.workoutId ? getPreset(day.workoutId) : null;
  const isRest = day.workoutId === null;

  return (
    <div
      className={cn(
        'px-3 py-2.5 flex flex-col gap-1.5 transition-colors',
        isNext && 'bg-primary/5',
        done && !isRest && 'bg-emerald-500/5',
      )}
    >
      <div className="flex items-center gap-2">
        {/* Status icon / toggle */}
        {isRest ? (
          <span className="h-4 w-4 shrink-0 text-muted-foreground/30 text-xs flex items-center justify-center">—</span>
        ) : done ? (
          <button type="button" onClick={onUncomplete} aria-label="Mark incomplete" className="shrink-0 focus-visible:outline-none">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 hover:text-muted-foreground transition-colors" />
          </button>
        ) : (
          <button type="button" onClick={onComplete} aria-label="Mark complete" className="shrink-0 focus-visible:outline-none">
            <Circle className={cn('h-4 w-4 transition-colors', isNext ? 'text-primary/60 hover:text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground/60')} />
          </button>
        )}

        {/* Label + name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              'text-xs font-semibold truncate',
              done ? 'text-muted-foreground line-through' :
              isNext ? 'text-primary' :
              'text-foreground',
            )}>
              {day.label}
            </span>
            {workout && (
              <span className="text-[10px] text-muted-foreground truncate">
                · {workout.name}
              </span>
            )}
            {isNext && <Badge variant="accent" className="text-[9px] px-1.5 py-0 h-4 shrink-0">Next</Badge>}
          </div>
          {workout && !done && (
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {formatMin(totalDurationSec(workout))}
              </span>
              <span className="flex items-center gap-0.5">
                <Zap className="h-2.5 w-2.5" />
                {estimateTSS(workout, ftpW)} TSS
              </span>
            </div>
          )}
        </div>

        {/* Expand / ride buttons */}
        {workout && !done && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={expanded ? 'Hide preview' : 'Show preview'}
            >
              <BarChart2 className="h-3 w-3" />
            </button>
            {onRide && (
              <Button
                variant={isNext ? 'accent' : 'outline'}
                size="sm"
                className="h-6 px-2 gap-0.5 text-[10px]"
                onClick={() => { onComplete(); onRide(workout); }}
              >
                <Play className="h-2.5 w-2.5" fill="currentColor" />
                Ride
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Day note */}
      {day.note && (
        <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed ml-6">
          {day.note}
        </p>
      )}

      {/* Expanded power preview */}
      {expanded && workout && (
        <div className="ml-6 mt-1">
          <WorkoutPowerProfile workout={workout} ftpW={ftpW} variant="compact" heightClass="h-14" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan catalog
// ---------------------------------------------------------------------------

function PlanCatalog({
  onPreview,
  onBack,
  className,
}: {
  onPreview: (id: string) => void;
  onBack?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-sm font-bold text-foreground">Training Plans</h2>
          <p className="text-[11px] text-muted-foreground">
            Structured multi-week programs — pick one and follow along.
          </p>
        </div>
      </div>

      {/* Plan cards */}
      <ul className="flex flex-col gap-2.5 list-none m-0 p-0">
        {TRAINING_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onPreview={onPreview} />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function PlanCard({
  plan,
  onPreview,
}: {
  plan: TrainingPlan;
  onPreview: (id: string) => void;
}) {
  const { activePlan, startPlan } = usePlanStore();
  const focusMeta = FOCUS_META[plan.focus] ?? FOCUS_META.custom;
  const levelMeta = LEVEL_META[plan.level] ?? LEVEL_META.intermediate;
  const isActive = activePlan?.planId === plan.id;

  return (
    <li
      className={cn(
        'rounded-xl border transition-all duration-150',
        isActive
          ? 'border-accent/40 bg-accent/5 ring-1 ring-accent/25'
          : 'border-border/60 bg-card/40 hover:border-border/90 hover:bg-card/60',
      )}
    >
      <button
        type="button"
        className="w-full text-left p-3 flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
        onClick={() => onPreview(plan.id)}
      >
        {/* Focus colour bar */}
        <div className={cn('w-1 self-stretch rounded-full shrink-0 mt-0.5', focusMeta.dot)} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-1">
            <span className="text-sm font-bold text-foreground leading-snug">{plan.name}</span>
            {isActive && <Badge variant="accent" className="text-[9px] px-1.5 py-0 h-4 shrink-0">Active</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{plan.tagline}</p>
          <div className="flex items-center gap-3 flex-wrap text-[10px]">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 font-semibold',
                focusMeta.bg, focusMeta.border, focusMeta.color,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', focusMeta.dot)} />
              {focusMeta.label}
            </span>
            <span className={cn('font-semibold', levelMeta.color)}>{levelMeta.label}</span>
            <span className="text-muted-foreground flex items-center gap-0.5">
              <Calendar className="h-2.5 w-2.5" />
              {plan.weeks}wk
            </span>
            <span className="text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              ~{plan.hoursPerWeek}h/wk
            </span>
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
      </button>

      {/* Quick start / continue */}
      <div className="px-3 pb-3 pt-0 flex justify-end">
        {isActive ? (
          <Button
            variant="accent"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onPreview(plan.id)}
          >
            <Play className="h-3 w-3" fill="currentColor" />
            Continue plan
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              startPlan(plan.id);
              onPreview(plan.id);
            }}
          >
            Start plan
          </Button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Plan detail view
// ---------------------------------------------------------------------------

function PlanDetail({
  plan,
  onBack,
  onRide,
  className,
}: {
  plan: TrainingPlan;
  onBack: () => void;
  onRide?: (w: Workout) => void;
  className?: string;
}) {
  const { activePlan, startPlan } = usePlanStore();
  const ftpW = useSettingsStore((s) => s.ftpW);
  const focusMeta = FOCUS_META[plan.focus] ?? FOCUS_META.custom;
  const levelMeta = LEVEL_META[plan.level] ?? LEVEL_META.intermediate;
  const isActive = activePlan?.planId === plan.id;
  const weeks = daysByWeek(plan);

  // Aggregate stats
  const totalWorkouts = plan.days.filter((d) => d.workoutId !== null).length;
  const totalRestDays = plan.days.filter((d) => d.workoutId === null).length;

  // Sample power profiles for all unique workouts in the plan
  const sampleWorkouts = useMemo(() => {
    const seen = new Set<string>();
    const out: Workout[] = [];
    for (const d of plan.days) {
      if (d.workoutId && !seen.has(d.workoutId)) {
        const w = getPreset(d.workoutId);
        if (w) { out.push(w); seen.add(d.workoutId); }
      }
      if (out.length >= 3) break;
    }
    return out;
  }, [plan]);

  const handleStart = useCallback(() => {
    startPlan(plan.id);
    onBack();
  }, [plan.id, startPlan, onBack]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Back + header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          aria-label="Back to plans"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <h2 className="text-sm font-bold text-foreground leading-tight flex-1">{plan.name}</h2>
      </div>

      {/* Focus + level badges */}
      <div className="flex items-center gap-2 flex-wrap -mt-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            focusMeta.bg, focusMeta.border, focusMeta.color,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', focusMeta.dot)} />
          {focusMeta.label}
        </span>
        <Badge variant="muted" className={cn('text-[10px] h-5', levelMeta.color)}>{levelMeta.label}</Badge>
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
          <Calendar className="h-2.5 w-2.5" />{plan.weeks} weeks
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" />~{plan.hoursPerWeek}h/week
        </span>
        <span className="text-[10px] text-muted-foreground">
          {totalWorkouts} sessions · {totalRestDays} rest days
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed">{plan.description}</p>

      {/* Sample workout profiles */}
      {sampleWorkouts.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Sample workouts</span>
          <div className="flex flex-col gap-2">
            {sampleWorkouts.map((w) => (
              <div key={w.id} className="rounded-xl border border-border/50 p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground truncate">{w.name}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                    <span>{formatMin(totalDurationSec(w))}</span>
                    <span>·</span>
                    <span>{estimateTSS(w, ftpW)} TSS</span>
                  </div>
                </div>
                <WorkoutPowerProfile workout={w} ftpW={ftpW} variant="compact" heightClass="h-12" />
                {onRide && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
                      onClick={() => onRide(w)}
                    >
                      <Play className="h-2.5 w-2.5" fill="currentColor" />
                      Preview ride
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly schedule summary */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Full schedule</span>
        {weeks.map((weekDays, wi) => (
          <div key={wi} className="rounded-xl border border-border/40 overflow-hidden">
            <div className="px-3 py-2 bg-muted/20 border-b border-border/30">
              <span className="text-xs font-semibold text-foreground">Week {wi + 1}</span>
            </div>
            <div className="divide-y divide-border/20">
              {weekDays.map((d, di) => {
                const workout = d.workoutId ? getPreset(d.workoutId) : null;
                return (
                  <div key={d.day} className="flex items-center gap-2.5 px-3 py-1.5">
                    <span className="text-[10px] text-muted-foreground/60 font-medium w-7 shrink-0">{DOW[di]}</span>
                    <span className={cn(
                      'text-[11px] font-medium flex-1 truncate',
                      d.workoutId === null ? 'text-muted-foreground/50' : 'text-foreground',
                    )}>
                      {d.label}
                    </span>
                    {workout && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {formatMin(totalDurationSec(workout))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex items-center gap-2 pt-1">
        {isActive ? (
          <>
            <Button variant="accent" size="sm" className="h-9 gap-1.5" onClick={onBack}>
              <Play className="h-3.5 w-3.5" fill="currentColor" />
              Continue plan
            </Button>
            <span className="text-xs text-muted-foreground">This plan is already active.</span>
          </>
        ) : (
          <>
            <Button variant="accent" size="sm" className="h-9 gap-1.5" onClick={handleStart}>
              <Play className="h-3.5 w-3.5" fill="currentColor" />
              Start this plan
            </Button>
            {activePlan && (
              <span className="text-[11px] text-muted-foreground">
                Starting this will replace your current plan.
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
