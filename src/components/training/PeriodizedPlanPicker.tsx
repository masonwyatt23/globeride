/**
 * PeriodizedPlanPicker — browse the three periodized training plans and
 * start one. Integrates with usePlanStore so starting a periodized plan
 * replaces any previously active plan.
 *
 * Shows:
 *   - A card per plan: name, description, duration, hours/week, FTP delta goal
 *   - Weekly session count summary
 *   - "Start plan" / "Continue" button
 */

import { useMemo } from 'react';
import { Calendar, Clock, TrendingUp, CheckCircle2, Play } from 'lucide-react';
import { PERIODIZED_PLANS, PERIODIZED_PLAN_IDS, type PeriodizedPlan } from '@/lib/training/periodizedPlans';
import { usePlanStore } from '@/stores/planStore';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Zone badge colours matching the workout category palette used elsewhere
// ---------------------------------------------------------------------------
const PLAN_ACCENT: Record<string, string> = {
  'base-builder-6w':  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'race-builder-8w':  'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'sharpening-4w':    'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const PLAN_BAR: Record<string, string> = {
  'base-builder-6w':  'bg-blue-500',
  'race-builder-8w':  'bg-orange-500',
  'sharpening-4w':    'bg-rose-500',
};

const PLAN_LABEL: Record<string, string> = {
  'base-builder-6w':  'Base',
  'race-builder-8w':  'Build',
  'sharpening-4w':    'Peak',
};

// ---------------------------------------------------------------------------
// PlanCard
// ---------------------------------------------------------------------------
interface PlanCardProps {
  plan: PeriodizedPlan;
  isActive: boolean;
  onStart: () => void;
  onContinue: () => void;
}

function PlanCard({ plan, isActive, onStart, onContinue }: PlanCardProps) {
  const accent = PLAN_ACCENT[plan.id] ?? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
  const bar    = PLAN_BAR[plan.id]    ?? 'bg-zinc-500';
  const label  = PLAN_LABEL[plan.id]  ?? 'Plan';

  // Weekly session count
  const sessionsPerWeek = useMemo(() => {
    const counts: number[] = Array(plan.durationWeeks).fill(0);
    for (const pw of plan.days) {
      const w = Math.floor(pw.dayOffset / 7);
      if (w < plan.durationWeeks) counts[w]++;
    }
    const avg = counts.reduce((a, b) => a + b, 0) / plan.durationWeeks;
    return Math.round(avg * 10) / 10;
  }, [plan]);

  return (
    <div className={`
      relative rounded-xl border border-white/8 bg-white/3 overflow-hidden
      transition-all duration-200 hover:border-white/16 hover:bg-white/5
      ${isActive ? 'ring-1 ring-white/20' : ''}
    `}>
      {/* Accent bar */}
      <div className={`h-0.5 w-full ${bar}`} />

      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`
                inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold
                border ${accent}
              `}>
                {label}
              </span>
              {isActive && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Active
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-white leading-tight">{plan.name}</h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {plan.description}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px]">Duration</span>
            </div>
            <span className="text-sm font-semibold text-white">
              {plan.durationWeeks} weeks
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px]">Avg hrs/wk</span>
            </div>
            <span className="text-sm font-semibold text-white">
              ~{plan.weeklyHours} h
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px]">FTP goal</span>
            </div>
            <span className="text-sm font-semibold text-white">
              +{plan.goalFtpDeltaPct}%
            </span>
          </div>
        </div>

        {/* Session summary */}
        <div className="rounded-lg bg-white/4 px-3 py-2 text-[12px] text-muted-foreground">
          <span className="font-medium text-white/70">{plan.days.length}</span> total sessions
          &nbsp;·&nbsp;
          <span className="font-medium text-white/70">{sessionsPerWeek}</span> sessions/week avg
          &nbsp;·&nbsp;
          {plan.durationWeeks} weeks
        </div>

        {/* CTA */}
        <div className="pt-1">
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 gap-1.5 border-white/12 text-white/80 hover:bg-white/8"
              onClick={onContinue}
            >
              <Play className="h-3.5 w-3.5" fill="currentColor" />
              Continue plan
            </Button>
          ) : (
            <Button
              variant="accent"
              size="sm"
              className="w-full h-9 gap-1.5"
              onClick={onStart}
            >
              <Play className="h-3.5 w-3.5" fill="currentColor" />
              Start plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PeriodizedPlanPicker (exported)
// ---------------------------------------------------------------------------
interface PeriodizedPlanPickerProps {
  /** Called after the user starts or continues a plan — lets the parent navigate. */
  onPlanStarted?: (planId: string) => void;
}

export function PeriodizedPlanPicker({ onPlanStarted }: PeriodizedPlanPickerProps) {
  const { activePlan, startPlan } = usePlanStore();

  function handleStart(planId: string) {
    startPlan(planId);
    onPlanStarted?.(planId);
  }

  function handleContinue(planId: string) {
    onPlanStarted?.(planId);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">Periodized Plans</h2>
        <p className="text-sm text-muted-foreground">
          Coach-designed multi-week blocks that follow standard base → build → peak
          cycling periodization. Each plan references real workouts from the catalog.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PERIODIZED_PLAN_IDS.map((planId) => {
          const plan = PERIODIZED_PLANS[planId];
          const isActive = activePlan?.planId === planId;
          return (
            <PlanCard
              key={planId}
              plan={plan}
              isActive={isActive}
              onStart={() => handleStart(planId)}
              onContinue={() => handleContinue(planId)}
            />
          );
        })}
      </div>

      {activePlan && !PERIODIZED_PLAN_IDS.includes(activePlan.planId) && (
        <p className="text-xs text-muted-foreground/60 pt-1">
          You have a different plan active. Starting one of these will replace it.
        </p>
      )}
    </div>
  );
}
