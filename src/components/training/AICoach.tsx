/**
 * AICoach — personalised daily training recommendation panel.
 *
 * Layout:
 *   - Header: "Coach" + "Powered by AI" tag.
 *   - Optional "Set my goal" input that persists to settingsStore.coachGoal.
 *   - "What should I ride today?" CTA → calls coachRecommendation(), shows result.
 *   - Result card: workout name + rationale + intensity-note chip + "Ride this workout" action.
 *   - Weekly outlook section: CTL / ATL / TSB + AI's weeklyOutlook + weaknessNote.
 */

import * as React from 'react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Brain,
  Bike,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Pencil,
  Check,
  AlertTriangle,
  Calendar,
  BarChart2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRideStore } from '@/stores/rideStore';
import { usePlanStore } from '@/stores/planStore';
import { makeDemoRoute } from '@/lib/sampleRoutes';
import { getPreset } from '@/lib/presetWorkouts';
import { listRides } from '@/lib/rideHistory';
import { computeTrainingLoadFromRecords, rideToTss, toDateKey } from '@/lib/trainingLoad';
import { coachRecommendation } from '@/lib/ai/coach';
import type { CoachContext, CoachRecommendation } from '@/lib/ai/coach';
import { totalDurationSec } from '@/lib/workout';

// ---------------------------------------------------------------------------
// Intensity chip
// ---------------------------------------------------------------------------

function IntensityChip({ note }: { note: CoachRecommendation['intensityNote'] }) {
  const map = {
    'go-easy': {
      label: 'Go Easy',
      className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      icon: <TrendingDown className="h-3 w-3" />,
    },
    normal: {
      label: 'Normal Day',
      className: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      icon: <Minus className="h-3 w-3" />,
    },
    'push-it': {
      label: 'Push It',
      className: 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400',
      icon: <TrendingUp className="h-3 w-3" />,
    },
  } as const;

  const { label, className, icon } = map[note];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Fitness stat pill
// ---------------------------------------------------------------------------

function StatPill({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: number;
  sub: string;
  highlight?: 'good' | 'warn' | 'neutral';
}) {
  const colorMap = {
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    neutral: 'text-foreground',
  };
  const color = highlight ? colorMap[highlight] : 'text-foreground';
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 min-w-[64px]">
      <span className={cn('num text-lg font-bold tabular-nums leading-none', color)}>
        {value.toFixed(0)}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground/70">{sub}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goal input
// ---------------------------------------------------------------------------

function GoalInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const commit = () => {
    onChange(draft.trim());
    setEditing(false);
  };

  React.useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
          }}
          placeholder="e.g. build base for a century ride"
          className={cn(
            'flex-1 rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          )}
        />
        <Button size="sm" variant="ghost" onClick={commit} className="shrink-0 h-8 px-2">
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
    >
      <Pencil className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
      <span className="truncate">
        {value ? (
          <><span className="text-foreground/80 font-medium">Goal:</span> {value}</>
        ) : (
          <span className="italic opacity-70">Set a training goal (optional)</span>
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Recommendation result card
// ---------------------------------------------------------------------------

function RecommendationCard({
  rec,
  onRide,
}: {
  rec: CoachRecommendation;
  onRide: () => void;
}) {
  const workout = getPreset(rec.workoutId);
  if (!workout) return null;

  const durMin = Math.round(totalDurationSec(workout) / 60);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-primary/3 to-transparent p-4 ring-1 ring-primary/15 animate-fadeUp">
      {/* Ambient glow */}
      <div
        className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-primary/10 blur-3xl pointer-events-none"
        aria-hidden
      />

      <div className="relative space-y-3">
        {/* Workout identity */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-widest font-semibold text-primary">
                Today's ride
              </span>
            </div>
            <h3 className="text-base font-bold text-foreground tracking-tight leading-snug">
              {workout.name}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="num font-semibold text-foreground/80">{durMin} min</span>
              {workout.category && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="capitalize">{workout.category}</span>
                </>
              )}
            </div>
          </div>
          <IntensityChip note={rec.intensityNote} />
        </div>

        {/* Rationale */}
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {rec.rationale}
        </p>

        {/* Rest recommendation */}
        {rec.restRecommendation && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{rec.restRecommendation}</span>
          </div>
        )}

        {/* Weakness note */}
        {rec.weaknessNote && (
          <div className="flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/8 px-3 py-2 text-xs text-violet-700 dark:text-violet-400">
            <Brain className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{rec.weaknessNote}</span>
          </div>
        )}

        {/* CTA */}
        <Button
          variant="accent"
          size="sm"
          onClick={onRide}
          className="w-full rounded-pill shadow-[0_6px_20px_-8px_hsl(var(--accent)/0.5)] active:scale-[0.98] transition-transform"
        >
          <Bike className="h-3.5 w-3.5" />
          Ride this workout
          <ChevronRight className="h-3.5 w-3.5 ml-auto" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly outlook section
// ---------------------------------------------------------------------------

function WeeklyOutlook({
  fitness,
  weeklyOutlook,
}: {
  fitness: { ctl: number; atl: number; tsb: number };
  weeklyOutlook?: string;
}) {
  const { ctl, atl, tsb } = fitness;

  const tsbHighlight: 'good' | 'warn' | 'neutral' =
    tsb > 5 ? 'good' : tsb < -20 ? 'warn' : 'neutral';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        <BarChart2 className="h-3.5 w-3.5" />
        Weekly overview
      </div>

      {/* CTL / ATL / TSB pills */}
      <div className="flex gap-2 flex-wrap">
        <StatPill label="CTL" value={ctl} sub="Fitness" highlight="neutral" />
        <StatPill label="ATL" value={atl} sub="Fatigue" highlight="neutral" />
        <StatPill label="TSB" value={tsb} sub="Form" highlight={tsbHighlight} />
      </div>

      {/* Weekly outlook */}
      {weeklyOutlook && (
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3 italic">
          {weeklyOutlook}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AICoach() {
  const navigate = useNavigate();
  const ftpW = useSettingsStore((s) => s.ftpW);
  const coachGoal = useSettingsStore((s) => s.coachGoal);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const loadWorkout = useRideStore((s) => s.loadWorkout);
  const route = useRideStore((s) => s.route);
  const activePlan = usePlanStore((s) => s.activePlan);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [recommendation, setRecommendation] = React.useState<CoachRecommendation | null>(null);
  const [fitness, setFitness] = React.useState<{ ctl: number; atl: number; tsb: number }>({
    ctl: 0,
    atl: 0,
    tsb: 0,
  });

  const handleAsk = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setRecommendation(null);

    try {
      // Load rides from IndexedDB
      const rides = await listRides();

      // Compute training load
      const loadResult = computeTrainingLoadFromRecords(rides, ftpW);
      const today = loadResult.today;
      const fitnessSnapshot = {
        ctl: today.fitness,
        atl: today.fatigue,
        tsb: today.form,
      };
      setFitness(fitnessSnapshot);

      // Weekly volume (last 7 days)
      const nowMs = Date.now();
      const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
      const weekRides = rides.filter((r) => r.startedAt >= sevenDaysAgoMs);
      const weeklyVolumeMin = Math.round(
        weekRides.reduce((s, r) => s + r.durationSec, 0) / 60,
      );

      // Days since last hard effort (TSS > 60)
      const sortedRides = [...rides].sort((a, b) => b.startedAt - a.startedAt);
      let daysSinceLastHardEffort: number | undefined;
      for (const r of sortedRides) {
        const tss = rideToTss(r, ftpW);
        if (tss > 60) {
          const diffMs = nowMs - r.startedAt;
          daysSinceLastHardEffort = Math.floor(diffMs / (24 * 60 * 60 * 1000));
          break;
        }
      }

      // Format recent rides for the context
      const recentRides = sortedRides.slice(0, 7).map((r) => {
        const tss = rideToTss(r, ftpW);
        return {
          date: toDateKey(new Date(r.startedAt)),
          distanceKm: r.distanceM / 1000,
          durationMin: Math.round(r.durationSec / 60),
          tss,
          avgPowerW: r.avgPower > 0 ? r.avgPower : undefined,
          workoutType: r.workoutName ?? r.source,
        };
      });

      // Build context
      const ctx: CoachContext = {
        recentRides,
        fitness: fitnessSnapshot,
        ftpW,
        weeklyVolumeMin,
        goal: coachGoal || undefined,
        daysSinceLastHardEffort,
      };

      // Call AI coach
      const rec = await coachRecommendation(ctx);
      setRecommendation(rec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error from coach.');
    } finally {
      setLoading(false);
    }
  }, [ftpW, coachGoal]);

  const handleRide = React.useCallback(() => {
    if (!recommendation) return;
    const workout = getPreset(recommendation.workoutId);
    if (!workout) return;
    loadWorkout(workout);
    if (!route) useRideStore.getState().setRoute(makeDemoRoute());
    navigate('/ride');
  }, [recommendation, loadWorkout, route, navigate]);

  // Suppress plan info (available for future context enrichment)
  void activePlan;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-primary" />
          Coach
          <Badge variant="muted" className="gap-1 text-[10px] ml-1">
            <Sparkles className="h-2.5 w-2.5" />
            Powered by AI
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Goal input */}
        <GoalInput
          value={coachGoal}
          onChange={(v) => setSettings({ coachGoal: v })}
        />

        {/* CTA */}
        <Button
          onClick={handleAsk}
          disabled={loading}
          className="w-full h-11 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring"
          variant={recommendation ? 'outline' : 'default'}
          aria-label={loading ? 'Coach is thinking, please wait' : 'Ask the coach what to ride today'}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Analysing your training…
            </>
          ) : (
            <>
              <Brain className="h-4 w-4" aria-hidden="true" />
              What should I ride today?
            </>
          )}
        </Button>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2" aria-hidden="true">
            {[75, 90, 55, 70].map((w, i) => (
              <div
                key={i}
                className="h-3 rounded-full bg-muted/60 animate-pulse"
                style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium leading-snug">Coach unavailable</p>
              <p className="text-[12px] mt-0.5 opacity-80 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Recommendation */}
        {recommendation && (
          <RecommendationCard rec={recommendation} onRide={handleRide} />
        )}

        {/* Weekly outlook — shown after a recommendation is loaded */}
        {(recommendation || fitness.ctl > 0) && (
          <div className="border-t border-border/30 pt-4">
            <WeeklyOutlook
              fitness={fitness}
              weeklyOutlook={recommendation?.weeklyOutlook}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
