/**
 * AIWorkoutDesigner — natural language → validated structured Workout.
 *
 * Displays a prompt box, provider indicator, generate button, workout preview,
 * and Save / Ride action buttons. Wired into the Home page.
 */

import * as React from 'react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Check,
  Zap,
  Clock,
  Activity,
  Cpu,
  Server,
  Bike,
  RotateCcw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAIStore } from '@/stores/aiStore';
import { useRideStore } from '@/stores/rideStore';
import { makeDemoRoute } from '@/lib/sampleRoutes';
import { generateWorkout, getProviderInfo } from '@/lib/ai/provider';
import {
  type Workout,
  type WorkoutSegment,
  totalDurationSec,
  estimateTSS,
} from '@/lib/workout';

// ---------------------------------------------------------------------------
// Prompt suggestions
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  '45 min sweet spot, 3×10 @ 90% with 5 min recoveries',
  '1 hour Z2 endurance with a 10 min ramp warm-up',
  '30 min threshold: 2×15 @ 95% FTP, 5 min rest',
  '20 min FTP test protocol',
  '75 min base with 3×5 min VO2max bursts at 115%',
];

// ---------------------------------------------------------------------------
// Segment row
// ---------------------------------------------------------------------------

function kindColor(kind: WorkoutSegment['kind']): string {
  switch (kind) {
    case 'warmup':   return 'bg-amber-500/20 text-amber-600 dark:text-amber-400';
    case 'cooldown': return 'bg-sky-500/20 text-sky-600 dark:text-sky-400';
    case 'interval': return 'bg-rose-500/20 text-rose-600 dark:text-rose-400';
    case 'recovery': return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400';
    case 'ramp':     return 'bg-violet-500/20 text-violet-600 dark:text-violet-400';
    case 'steady':   return 'bg-blue-500/20 text-blue-600 dark:text-blue-400';
    case 'freeride': return 'bg-muted/60 text-muted-foreground';
    default:         return 'bg-muted/60 text-muted-foreground';
  }
}

function formatDurShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function targetLabel(seg: WorkoutSegment, ftpW: number): string {
  const t = seg.target;
  switch (t.type) {
    case 'ftpPct':  return `${Math.round(t.value * 100)}% FTP (${Math.round(t.value * ftpW)}W)`;
    case 'watts':   return `${Math.round(t.watts)}W`;
    case 'rampPct': return `${Math.round(t.startPct * 100)}→${Math.round(t.endPct * 100)}% FTP`;
    case 'grade':   return `${t.gradePct > 0 ? '+' : ''}${t.gradePct}% grade`;
    case 'free':    return 'Free ride';
    default:        return '';
  }
}

function intensityBar(seg: WorkoutSegment): number {
  const t = seg.target;
  switch (t.type) {
    case 'ftpPct':  return Math.min(1, t.value / 1.3);
    case 'rampPct': return Math.min(1, ((t.startPct + t.endPct) / 2) / 1.3);
    case 'watts':   return 0.5; // unknown FTP context here — neutral
    default:        return 0;
  }
}

function SegmentRow({ seg, ftpW }: { seg: WorkoutSegment; ftpW: number }) {
  const barPct = intensityBar(seg);
  return (
    <div className="flex items-center gap-2.5 py-1.5 group">
      {/* Intensity bar */}
      <div className="relative h-7 w-1.5 rounded-full bg-border/40 shrink-0 overflow-hidden">
        <div
          className="absolute bottom-0 left-0 w-full rounded-full bg-primary/70 transition-all"
          style={{ height: `${barPct * 100}%` }}
        />
      </div>

      {/* Kind badge */}
      <span className={cn('text-[10px] font-semibold uppercase tracking-widest rounded-full px-2 py-0.5 shrink-0', kindColor(seg.kind))}>
        {seg.kind}
      </span>

      {/* Label + target */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-snug truncate">
          {seg.label ?? targetLabel(seg, ftpW)}
        </p>
        {seg.label && (
          <p className="text-[11px] text-muted-foreground truncate">{targetLabel(seg, ftpW)}</p>
        )}
      </div>

      {/* Duration */}
      <span className="num text-xs text-muted-foreground shrink-0 tabular-nums">
        {formatDurShort(seg.durationSec)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider badge
// ---------------------------------------------------------------------------

function ProviderBadge({ name, model }: { name: string; model: string }) {
  const isXai = name === 'xai';
  return (
    <Badge
      variant="muted"
      className="gap-1 text-[10px] cursor-default select-none"
      title={`Active AI provider: ${model}`}
    >
      {isXai ? <Zap className="h-2.5 w-2.5" /> : <Cpu className="h-2.5 w-2.5" />}
      {isXai ? 'xAI' : 'Ollama'} · {model}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Provider switcher
// ---------------------------------------------------------------------------

function ProviderSwitcher() {
  const { providerOverride, setProviderOverride } = useAIStore();
  const envProvider = import.meta.env.VITE_AI_PROVIDER ?? 'auto';
  const hasXaiKey = !!import.meta.env.VITE_XAI_API_KEY;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-muted-foreground">Provider:</span>
      {(['auto', 'xai', 'ollama'] as const).map((p) => (
        <button
          key={p}
          onClick={() => setProviderOverride(p)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
            providerOverride === p
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border/60 bg-card/50 text-muted-foreground hover:border-primary/30 hover:text-foreground',
          )}
        >
          {p === 'auto' && <Activity className="h-2.5 w-2.5" />}
          {p === 'xai' && <Zap className="h-2.5 w-2.5" />}
          {p === 'ollama' && <Server className="h-2.5 w-2.5" />}
          {p === 'auto' ? `auto${envProvider !== 'auto' ? ` (env: ${envProvider})` : hasXaiKey ? ' → xAI' : ' → Ollama'}` : p}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workout preview
// ---------------------------------------------------------------------------

function WorkoutPreview({ workout, ftpW }: { workout: Workout; ftpW: number }) {
  const [expanded, setExpanded] = React.useState(true);
  const totalSec = totalDurationSec(workout);
  const tss = estimateTSS(workout, ftpW);

  return (
    <div className="glass glass-hairline rounded-xl overflow-hidden">
      {/* Header — accordion toggle */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="ai-workout-preview-body"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Bike className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <span className="font-semibold text-sm text-foreground truncate">{workout.name}</span>
        </div>
        <div className="flex items-center gap-2.5 ml-2 shrink-0">
          <span className="flex items-center gap-1 text-xs text-muted-foreground num tabular-nums">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatDurShort(totalSec)}
          </span>
          {tss > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground num tabular-nums">
              <Activity className="h-3 w-3" aria-hidden="true" />
              {tss} TSS
            </span>
          )}
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
        </div>
      </button>

      <div id="ai-workout-preview-body" hidden={!expanded}>
        {/* Description */}
        {workout.description && (
          <p className="px-4 pb-1 text-xs text-muted-foreground leading-relaxed border-t border-border/30 pt-2">
            {workout.description}
          </p>
        )}

        {/* Segment list */}
        <div className="px-4 pb-3 divide-y divide-border/20">
          {workout.segments.map((seg) => (
            <SegmentRow key={seg.id} seg={seg} ftpW={ftpW} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AIWorkoutDesigner() {
  const navigate = useNavigate();
  const ftpW = useSettingsStore((s) => s.ftpW);
  const setRoute = useRideStore((s) => s.setRoute);
  const { addRecentWorkout } = useAIStore();

  const [prompt, setPrompt] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [workout, setWorkout] = React.useState<Workout | null>(null);
  const [saved, setSaved] = React.useState(false);

  const providerInfo = getProviderInfo();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleGenerate = React.useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setWorkout(null);
    setSaved(false);

    try {
      const result = await generateWorkout(trimmed, { ftpW });
      setWorkout(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error generating workout.');
    } finally {
      setLoading(false);
    }
  }, [prompt, ftpW]);

  const handleSave = React.useCallback(() => {
    if (!workout) return;
    addRecentWorkout(workout);
    setSaved(true);
  }, [workout, addRecentWorkout]);

  const handleRide = React.useCallback(() => {
    if (!workout) return;
    addRecentWorkout(workout);
    // Keep globe scenery while riding the workout in ERG mode
    setRoute(makeDemoRoute());
    navigate('/ride');
  }, [workout, addRecentWorkout, setRoute, navigate]);

  const handleReset = React.useCallback(() => {
    setWorkout(null);
    setError(null);
    setSaved(false);
    setPrompt('');
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !loading) {
        e.preventDefault();
        void handleGenerate();
      }
    },
    [handleGenerate, loading],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Workout Designer
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Provider info + switcher */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <ProviderBadge name={providerInfo.name} model={providerInfo.model} />
            <span className="text-[11px] text-muted-foreground">FTP: {ftpW} W</span>
          </div>
          <ProviderSwitcher />
        </div>

        {/* Prompt area */}
        <div className="space-y-2">
          <label htmlFor="ai-workout-prompt" className="sr-only">
            Describe your workout
          </label>
          <div className="relative">
            <textarea
              id="ai-workout-prompt"
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setSaved(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Describe your workout… e.g. &quot;45 min sweet spot, 3×10 @ 90% with 5 min recoveries&quot;"
              rows={3}
              disabled={loading}
              className={cn(
                'w-full resize-none rounded-lg border bg-card/60 px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-150',
                error ? 'border-destructive/60' : 'border-border/70 hover:border-border',
              )}
            />
            <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/50 pointer-events-none select-none hidden sm:block">
              ⌘↵ to generate
            </span>
          </div>

          {/* Suggestions */}
          {!workout && !loading && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setPrompt(s);
                    setError(null);
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }}
                  className={cn(
                    'text-[10px] rounded-full border border-border/60 bg-card/40 px-2.5 py-0.5 text-muted-foreground',
                    'hover:border-primary/40 hover:text-foreground hover:bg-card/70 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full h-10 focus-visible:ring-2 focus-visible:ring-ring"
          variant={workout ? 'outline' : 'default'}
          size="default"
          aria-label={loading ? 'Generating workout, please wait' : 'Generate workout from description'}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Generate Workout
            </>
          )}
        </Button>

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {[80, 60, 70, 55].map((w, i) => (
              <div
                key={i}
                className="h-3 rounded-full bg-muted/60 animate-pulse"
                style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium leading-snug">Generation failed</p>
              <p className="text-[12px] mt-0.5 opacity-80 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Workout preview */}
        {workout && (
          <div className="space-y-3 animate-fadeUp">
            <WorkoutPreview workout={workout} ftpW={ftpW} />

            {/* Actions */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <Button
                size="sm"
                variant={saved ? 'outline' : 'default'}
                onClick={handleSave}
                disabled={saved}
                className={cn(saved && 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40')}
              >
                {saved ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Saved
                  </>
                ) : (
                  'Save workout'
                )}
              </Button>

              <Button size="sm" variant="accent" onClick={handleRide}>
                <Bike className="h-3.5 w-3.5" />
                Ride it now
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleReset}
                className="text-muted-foreground hover:text-foreground ml-auto"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New workout
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
