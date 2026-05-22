/**
 * TrainingCalendar — date-anchored schedule view for an active training plan.
 *
 * Shows the full plan laid out week by week, with each day mapped to a real
 * calendar date.  Today is highlighted, completed days are checked, and the
 * current week auto-expands with the "today" workout pinned as a hero CTA.
 *
 * Includes overall progress stats: % complete, sessions done, streak,
 * days remaining, and projected end date.
 */

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Play,
  Clock,
  Zap,
  Flame,
  Trophy,
  Target,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  CalendarCheck,
  Timer,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import {
  type TrainingPlan,
  type PlanDay,
  daysByWeek,
  dayIndexToDate,
  todayMidnight,
  todaysPlanDay,
  computeStreak,
  currentCalendarWeek,
  formatShortDate,
  daysRemaining,
  planEndDate,
  nextWorkoutDay,
} from '@/lib/trainingPlans';
import { getPreset } from '@/lib/presetWorkouts';
import { totalDurationSec, estimateTSS } from '@/lib/workout';
import type { Workout } from '@/lib/workout';
import { usePlanStore } from '@/stores/planStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { WorkoutPowerProfile } from '@/components/WorkoutPowerProfile';

// ---------------------------------------------------------------------------
// Category colours
// ---------------------------------------------------------------------------

const FOCUS_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  endurance: { label: 'Endurance',  color: 'text-sky-600 dark:text-sky-400',        bg: 'bg-sky-500/12',     border: 'border-sky-500/40',    dot: 'bg-sky-400' },
  tempo:     { label: 'Tempo',      color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-500/12',   border: 'border-amber-500/40',  dot: 'bg-amber-400' },
  sweetspot: { label: 'Sweet Spot', color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-500/12',  border: 'border-violet-500/40', dot: 'bg-violet-400' },
  threshold: { label: 'Threshold',  color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-500/12',    border: 'border-rose-500/40',   dot: 'bg-rose-400' },
  intervals: { label: 'Intervals',  color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-500/12',  border: 'border-orange-500/40', dot: 'bg-orange-400' },
  test:      { label: 'FTP Test',   color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/12', border: 'border-emerald-500/40',dot: 'bg-emerald-400' },
  custom:    { label: 'Custom',     color: 'text-foreground',                         bg: 'bg-muted/80',       border: 'border-border',        dot: 'bg-muted-foreground' },
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

const SHORT_DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** True if two Dates are on the same calendar day. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TrainingCalendarProps {
  plan: TrainingPlan;
  onRide?: (workout: Workout) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function TrainingCalendar({ plan, onRide, className }: TrainingCalendarProps) {
  const { activePlan, completeDay, uncompleteDay } = usePlanStore();
  const ftpW = useSettingsStore((s) => s.ftpW);

  const progress = activePlan;
  if (!progress) return null;

  const today = todayMidnight();
  const completedSet = useMemo(
    () => new Set(progress.completedDays),
    [progress.completedDays],
  );
  const weeks = useMemo(() => daysByWeek(plan), [plan]);

  // Stats
  const totalWorkoutDays = plan.days.filter((d) => d.workoutId !== null).length;
  const completedWorkoutDays = plan.days.filter(
    (d) => d.workoutId !== null && completedSet.has(d.day),
  ).length;
  const progressPct = totalWorkoutDays > 0
    ? Math.round((completedWorkoutDays / totalWorkoutDays) * 100)
    : 0;
  const isFinished = completedWorkoutDays >= totalWorkoutDays;
  const streak = useMemo(() => computeStreak(plan, progress), [plan, progress]);
  const remaining = useMemo(() => daysRemaining(plan, progress), [plan, progress]);
  const endDate = useMemo(() => planEndDate(plan, progress), [plan, progress]);

  // Today's day / next workout
  const todayDay = useMemo(() => todaysPlanDay(plan, progress), [plan, progress, today]);
  const nextDay = useMemo(() => nextWorkoutDay(plan, progress), [plan, progress]);
  const todayWorkout = (todayDay?.workoutId ? getPreset(todayDay.workoutId) : null) ?? null;
  const nextWorkout = (nextDay?.workoutId ? getPreset(nextDay.workoutId) : null) ?? null;

  // Which week to start expanded: current calendar week, or 0 if before start
  const calWeek = useMemo(() => currentCalendarWeek(plan, progress), [plan, progress]);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    if (calWeek >= 0) initial.add(calWeek);
    return initial;
  });

  const toggleWeek = (wi: number) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(wi)) next.delete(wi);
      else next.add(wi);
      return next;
    });
  };

  const focusMeta = FOCUS_META[plan.focus] ?? FOCUS_META.custom;

  return (
    <div className={cn('flex flex-col gap-4', className)}>

      {/* ── Progress summary bar ── */}
      <ProgressSummary
        plan={plan}
        completedWorkoutDays={completedWorkoutDays}
        totalWorkoutDays={totalWorkoutDays}
        progressPct={progressPct}
        streak={streak}
        remaining={remaining}
        endDate={endDate}
        isFinished={isFinished}
        focusMeta={focusMeta}
      />

      {/* ── Today / next-up hero ── */}
      {!isFinished && (
        <TodayHero
          todayDay={todayDay}
          todayWorkout={todayWorkout}
          nextDay={nextDay}
          nextWorkout={nextWorkout}
          completedSet={completedSet}
          ftpW={ftpW}
          onRide={onRide}
          onComplete={completeDay}
          onUncomplete={uncompleteDay}
        />
      )}

      {/* ── Finished state ── */}
      {isFinished && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 flex items-center gap-3">
          <Trophy className="h-8 w-8 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Plan complete!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You finished every session in {plan.name}. Time to level up.
            </p>
          </div>
        </div>
      )}

      {/* ── Calendar grid ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Full schedule</span>
        </div>

        {weeks.map((weekDays, wi) => {
          const isExpanded = expandedWeeks.has(wi);
          const isCurrentWeek = wi === calWeek;

          // Week date range
          const weekStart = dayIndexToDate(progress.startedAt, weekDays[0].day);
          const weekEnd = dayIndexToDate(progress.startedAt, weekDays[weekDays.length - 1].day);

          const weekWorkouts = weekDays.filter((d) => d.workoutId !== null).length;
          const weekDone = weekDays.filter(
            (d) => d.workoutId !== null && completedSet.has(d.day),
          ).length;

          return (
            <div
              key={wi}
              className={cn(
                'rounded-xl border overflow-hidden transition-colors',
                isCurrentWeek
                  ? 'border-primary/30 bg-primary/3'
                  : 'border-border/50',
              )}
            >
              {/* Week header */}
              <button
                type="button"
                onClick={() => toggleWeek(wi)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">
                    Week {wi + 1}
                  </span>
                  {isCurrentWeek && (
                    <Badge variant="accent" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                      Current
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground/60">
                    {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground num shrink-0">
                  {weekDone}/{weekWorkouts}
                </span>
                {isExpanded
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                }
              </button>

              {/* 7-day compact strip (always visible) */}
              <WeekStrip
                weekDays={weekDays}
                completedSet={completedSet}
                startedAt={progress.startedAt}
                today={today}
                todayDay={todayDay}
                nextDay={nextDay}
              />

              {/* Expanded day list */}
              {isExpanded && (
                <div className="border-t border-border/40 divide-y divide-border/20">
                  {weekDays.map((d) => {
                    const pdDate = dayIndexToDate(progress.startedAt, d.day);
                    return (
                      <CalendarDayRow
                        key={d.day}
                        day={d}
                        date={pdDate}
                        isToday={isSameDay(pdDate, today)}
                        done={completedSet.has(d.day)}
                        isNext={nextDay?.day === d.day && !completedSet.has(d.day)}
                        ftpW={ftpW}
                        onComplete={() => completeDay(d.day)}
                        onUncomplete={() => uncompleteDay(d.day)}
                        onRide={onRide}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress summary bar
// ---------------------------------------------------------------------------

function ProgressSummary({
  plan,
  completedWorkoutDays,
  totalWorkoutDays,
  progressPct,
  streak,
  remaining,
  endDate,
  isFinished,
  focusMeta,
}: {
  plan: TrainingPlan;
  completedWorkoutDays: number;
  totalWorkoutDays: number;
  progressPct: number;
  streak: number;
  remaining: number;
  endDate: Date;
  isFinished: boolean;
  focusMeta: { label: string; color: string; bg: string; border: string; dot: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Plan name + focus badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0',
            focusMeta.bg, focusMeta.border, focusMeta.color,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', focusMeta.dot)} />
          {focusMeta.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {plan.weeks} weeks · ~{plan.hoursPerWeek}h/week
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {isFinished
              ? 'Complete!'
              : `${completedWorkoutDays} of ${totalWorkoutDays} sessions`}
          </span>
          <span className="num text-muted-foreground font-medium">{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isFinished ? 'bg-emerald-500' : 'bg-primary',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Stat pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {streak > 0 && (
          <StatPill icon={<Flame className="h-3 w-3 text-orange-400" />} label={`${streak} day streak`} />
        )}
        <StatPill
          icon={<CalendarCheck className="h-3 w-3 text-primary" />}
          label={`${remaining} days left`}
        />
        <StatPill
          icon={<Timer className="h-3 w-3 text-muted-foreground" />}
          label={`Ends ${formatShortDate(endDate)}`}
        />
        {progressPct > 0 && (
          <StatPill
            icon={<TrendingUp className="h-3 w-3 text-emerald-500" />}
            label={`${completedWorkoutDays} done`}
          />
        )}
      </div>
    </div>
  );
}

function StatPill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
      {icon}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Today / next-up hero card
// ---------------------------------------------------------------------------

function TodayHero({
  todayDay,
  todayWorkout,
  nextDay,
  nextWorkout,
  completedSet,
  ftpW,
  onRide,
  onComplete,
  onUncomplete,
}: {
  todayDay: PlanDay | null;
  todayWorkout: Workout | null;
  nextDay: PlanDay | null;
  nextWorkout: Workout | null;
  completedSet: Set<number>;
  ftpW: number;
  onRide?: (w: Workout) => void;
  onComplete: (day: number) => void;
  onUncomplete: (day: number) => void;
}) {
  // Decide what to show in the hero:
  // 1. If today has a workout and it's not done → show it
  // 2. If today has a workout and it IS done → show "done today" celebration
  // 3. If today is a rest day → show rest day message + show "next up"
  // 4. If we're before the plan starts, or between days → show next workout

  const todayIsWorkout = todayDay !== null && todayDay.workoutId !== null;
  const todayIsDone = todayDay !== null && completedSet.has(todayDay.day);
  const todayIsRest = todayDay !== null && todayDay.workoutId === null;

  // Show next-up if: today is done, today is rest, or there's no today
  const showNext = !todayIsWorkout || todayIsDone;
  const heroDay = (!todayIsDone && todayIsWorkout) ? todayDay : null;
  const heroWorkout = heroDay ? todayWorkout : null;

  if (!heroDay && !nextDay) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Today's workout */}
      {heroDay && heroWorkout && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-bold text-primary">Today — Day {heroDay.day}</span>
            <span className="text-xs text-muted-foreground">{heroDay.label}</span>
          </div>
          <WorkoutPowerProfile workout={heroWorkout} ftpW={ftpW} variant="compact" heightClass="h-16" />
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatMin(totalDurationSec(heroWorkout))}
            </span>
            <span className="flex items-center gap-0.5">
              <Zap className="h-3 w-3" />
              {estimateTSS(heroWorkout, ftpW)} TSS
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onRide && (
              <Button
                variant="accent"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  onComplete(heroDay.day);
                  onRide(heroWorkout);
                }}
              >
                <Play className="h-3 w-3" fill="currentColor" />
                Start today's ride
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onComplete(heroDay.day)}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Mark done
            </Button>
          </div>
          {heroDay.note && (
            <p className="text-[11px] text-muted-foreground italic leading-relaxed border-t border-border/30 pt-2">
              {heroDay.note}
            </p>
          )}
        </div>
      )}

      {/* Today is done celebration */}
      {todayIsWorkout && todayIsDone && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3 flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Today's session complete!
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Day {todayDay.day} – {todayDay.label}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUncomplete(todayDay.day)}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors focus-visible:outline-none shrink-0"
          >
            Undo
          </button>
        </div>
      )}

      {/* Today is rest day */}
      {todayIsRest && (
        <div className="rounded-xl border border-border/40 bg-muted/20 p-3 flex items-center gap-2.5">
          <span className="text-lg" aria-hidden>😴</span>
          <div>
            <p className="text-xs font-semibold text-foreground">Rest day today</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {todayDay.note ?? 'Take it easy — recovery is training.'}
            </p>
          </div>
        </div>
      )}

      {/* Next up (when today is done, rest, or we're between days) */}
      {showNext && nextDay && nextWorkout && !completedSet.has(nextDay.day) && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-foreground">Next up: Day {nextDay.day}</span>
            <span className="text-xs text-muted-foreground">{nextDay.label}</span>
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatMin(totalDurationSec(nextWorkout))}
            </span>
            <span className="flex items-center gap-0.5">
              <Zap className="h-3 w-3" />
              {estimateTSS(nextWorkout, ftpW)} TSS
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onRide && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => {
                  onComplete(nextDay.day);
                  onRide(nextWorkout);
                }}
              >
                <Play className="h-3 w-3" fill="currentColor" />
                Ride now
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onComplete(nextDay.day)}
            >
              Mark done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7-day compact strip inside each week accordion
// ---------------------------------------------------------------------------

function WeekStrip({
  weekDays,
  completedSet,
  startedAt,
  today,
  todayDay,
  nextDay,
}: {
  weekDays: PlanDay[];
  completedSet: Set<number>;
  startedAt: number;
  today: Date;
  todayDay: PlanDay | null;
  nextDay: PlanDay | null;
}) {
  return (
    <div className="grid grid-cols-7 gap-px bg-border/20">
      {weekDays.map((d, di) => {
        const done = completedSet.has(d.day);
        const isRest = d.workoutId === null;
        const pdDate = dayIndexToDate(startedAt, d.day);
        const isToday = isSameDay(pdDate, today);
        const isNext = nextDay?.day === d.day && !done;
        const isPast = pdDate.getTime() < today.getTime() && !isToday;

        return (
          <div
            key={d.day}
            className={cn(
              'flex flex-col items-center py-2 gap-0.5 text-center',
              isToday && 'bg-primary/10',
              done && !isRest && 'bg-emerald-500/8',
            )}
          >
            <span
              className={cn(
                'text-[9px] font-medium',
                isToday ? 'text-primary' : 'text-muted-foreground/50',
              )}
            >
              {SHORT_DOW[di]}
            </span>
            {/* Date number */}
            <span
              className={cn(
                'text-[9px] num',
                isToday ? 'text-primary font-bold' : 'text-muted-foreground/40',
              )}
            >
              {pdDate.getDate()}
            </span>
            {/* Status icon */}
            {isRest ? (
              <span className="text-[8px] text-muted-foreground/25 leading-tight">—</span>
            ) : done ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : isNext || isToday ? (
              <Flame className={cn('h-3 w-3', isToday ? 'text-primary' : 'text-primary/50')} />
            ) : (
              <Circle
                className={cn(
                  'h-3 w-3',
                  isPast ? 'text-destructive/30' : 'text-muted-foreground/20',
                )}
              />
            )}
            {/* Label abbrev */}
            <span
              className={cn(
                'text-[8px] leading-tight font-medium truncate max-w-full px-0.5',
                done ? 'text-emerald-600 dark:text-emerald-400' :
                isToday ? 'text-primary' :
                isNext ? 'text-primary/70' :
                isRest ? 'text-muted-foreground/25' :
                isPast ? 'text-muted-foreground/30' :
                'text-muted-foreground/50',
              )}
            >
              {isRest ? 'Rest' : d.label.split(' ')[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded day row
// ---------------------------------------------------------------------------

function CalendarDayRow({
  day,
  date,
  isToday,
  done,
  isNext,
  ftpW,
  onComplete,
  onUncomplete,
  onRide,
}: {
  day: PlanDay;
  date: Date;
  isToday: boolean;
  done: boolean;
  isNext: boolean;
  ftpW: number;
  onComplete: () => void;
  onUncomplete: () => void;
  onRide?: (w: Workout) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const workout = day.workoutId ? getPreset(day.workoutId) : null;
  const isRest = day.workoutId === null;
  const today = todayMidnight();
  const isPast = date.getTime() < today.getTime() && !isToday;

  return (
    <div
      className={cn(
        'px-3 py-2.5 flex flex-col gap-1.5 transition-colors',
        isToday && !done && 'bg-primary/5',
        done && !isRest && 'bg-emerald-500/5',
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* Date badge */}
        <div
          className={cn(
            'shrink-0 flex flex-col items-center justify-center w-8 h-8 rounded-lg text-center',
            isToday
              ? 'bg-primary text-primary-foreground'
              : done && !isRest
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted/30 text-muted-foreground',
          )}
        >
          <span className="text-[8px] font-medium leading-tight">
            {date.toLocaleDateString(undefined, { month: 'short' })}
          </span>
          <span className="text-sm font-bold leading-tight num">
            {date.getDate()}
          </span>
        </div>

        {/* Toggle / status icon */}
        <div className="shrink-0">
          {isRest ? (
            <span className="text-muted-foreground/30 text-lg leading-none">—</span>
          ) : done ? (
            <button type="button" onClick={onUncomplete} aria-label="Mark incomplete" className="focus-visible:outline-none">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 hover:text-muted-foreground transition-colors" />
            </button>
          ) : (
            <button type="button" onClick={onComplete} aria-label="Mark complete" className="focus-visible:outline-none">
              <Circle
                className={cn(
                  'h-4 w-4 transition-colors',
                  isToday ? 'text-primary/60 hover:text-primary' :
                  isPast ? 'text-destructive/40 hover:text-destructive/60' :
                  'text-muted-foreground/25 hover:text-muted-foreground/50',
                )}
              />
            </button>
          )}
        </div>

        {/* Label + workout name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'text-xs font-semibold truncate',
                done ? 'text-muted-foreground line-through' :
                isToday ? 'text-primary' :
                isRest ? 'text-muted-foreground/50' :
                'text-foreground',
              )}
            >
              {day.label}
            </span>
            {workout && (
              <span className="text-[10px] text-muted-foreground/60 truncate">
                · {workout.name}
              </span>
            )}
            {isToday && !done && (
              <Badge variant="accent" className="text-[9px] px-1.5 py-0 h-4 shrink-0">Today</Badge>
            )}
            {isNext && !isToday && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0 text-primary border-primary/40">
                Next
              </Badge>
            )}
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

        {/* Actions */}
        {workout && !done && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={showPreview ? 'Hide power profile' : 'Show power profile'}
            >
              <TrendingUp className="h-3 w-3" />
            </button>
            {onRide && (
              <Button
                variant={isToday ? 'accent' : 'outline'}
                size="sm"
                className="h-6 px-2 gap-0.5 text-[10px]"
                onClick={() => {
                  onComplete();
                  onRide(workout);
                }}
              >
                <Play className="h-2.5 w-2.5" fill="currentColor" />
                Ride
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Coaching note */}
      {day.note && !isRest && (
        <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed ml-11">
          {day.note}
        </p>
      )}

      {/* Power profile preview */}
      {showPreview && workout && (
        <div className="ml-11 mt-1">
          <WorkoutPowerProfile workout={workout} ftpW={ftpW} variant="compact" heightClass="h-14" />
        </div>
      )}
    </div>
  );
}
