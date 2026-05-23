/**
 * WorkoutBuilder — drag-free structured-workout editor.
 *
 * Features:
 *  - Add/edit/delete/reorder segments (warmup/steady/interval/recovery/ramp/cooldown/freeride)
 *  - Each segment: kind, duration (min:sec), target (%FTP, watts, ramp, grade, free), cadence
 *  - Live total duration + estimated TSS
 *  - Visual color-coded segment timeline bar
 *  - Quick "interval set" helper: N × [on + off] seconds
 *  - Save to workout library / load directly into ride
 */

import { useCallback, useId, useReducer, useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Zap,
  Timer,
  Activity,
  RepeatIcon,
  Save,
  Play,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDurSec } from '@/lib/format';
import {
  type Workout,
  type WorkoutSegment,
  type SegmentKind,
  type SegmentTarget,
  estimateTSS,
  workoutId,
} from '@/lib/workout';
import { saveWorkout } from '@/lib/workoutLibrary';
import { useSettingsStore } from '@/stores/settingsStore';
import { WorkoutPowerProfile } from '@/components/workouts/WorkoutPowerProfile';

// ---------------------------------------------------------------------------
// Segment color palette by kind
// ---------------------------------------------------------------------------

const KIND_COLORS: Record<SegmentKind, string> = {
  warmup:    'bg-amber-400/80',
  steady:    'bg-sky-400/80',
  interval:  'bg-rose-500/90',
  recovery:  'bg-emerald-400/80',
  ramp:      'bg-violet-400/80',
  cooldown:  'bg-blue-300/70',
  freeride:  'bg-slate-400/60',
};

const KIND_LABELS: Record<SegmentKind, string> = {
  warmup:   'Warm-up',
  steady:   'Steady',
  interval: 'Interval',
  recovery: 'Recovery',
  ramp:     'Ramp',
  cooldown: 'Cool-down',
  freeride: 'Free ride',
};

// ---------------------------------------------------------------------------
// Intensity → opacity for the timeline bar block tooltip
// ---------------------------------------------------------------------------

function intensityClass(target: SegmentTarget, ftpW: number): string {
  if (target.type === 'free' || target.type === 'grade') return 'opacity-40';
  let pct = 0;
  if (target.type === 'ftpPct') pct = target.value;
  else if (target.type === 'watts') pct = ftpW > 0 ? target.watts / ftpW : 0;
  else if (target.type === 'rampPct') pct = (target.startPct + target.endPct) / 2;
  if (pct >= 1.05) return 'opacity-100';
  if (pct >= 0.9)  return 'opacity-90';
  if (pct >= 0.76) return 'opacity-80';
  if (pct >= 0.6)  return 'opacity-65';
  return 'opacity-50';
}

// ---------------------------------------------------------------------------
// Local state shape for the editor
// ---------------------------------------------------------------------------

interface EditableSegment extends WorkoutSegment {
  // Duration split for UX
  durMin: number;
  durSec: number;
}

type EditorAction =
  | { type: 'add'; kind: SegmentKind }
  | { type: 'remove'; index: number }
  | { type: 'move'; index: number; dir: 'up' | 'down' }
  | { type: 'update'; index: number; patch: Partial<EditableSegment> }
  | { type: 'reset'; segments: EditableSegment[] };

function toEditable(seg: WorkoutSegment): EditableSegment {
  const durMin = Math.floor(seg.durationSec / 60);
  const durSec = seg.durationSec % 60;
  return { ...seg, durMin, durSec };
}

function fromEditable(seg: EditableSegment): WorkoutSegment {
  const { durMin, durSec, ...rest } = seg;
  return { ...rest, durationSec: Math.max(1, (durMin || 0) * 60 + (durSec || 0)) };
}

function makeSegment(kind: SegmentKind): EditableSegment {
  const defaults: Record<SegmentKind, { durMin: number; target: SegmentTarget }> = {
    warmup:   { durMin: 10, target: { type: 'ftpPct', value: 0.55 } },
    steady:   { durMin: 20, target: { type: 'ftpPct', value: 0.75 } },
    interval: { durMin: 5,  target: { type: 'ftpPct', value: 1.05 } },
    recovery: { durMin: 5,  target: { type: 'ftpPct', value: 0.5 } },
    ramp:     { durMin: 10, target: { type: 'rampPct', startPct: 0.5, endPct: 1.0 } },
    cooldown: { durMin: 10, target: { type: 'ftpPct', value: 0.5 } },
    freeride: { durMin: 30, target: { type: 'free' } },
  };
  const d = defaults[kind];
  return {
    id: workoutId('seg'),
    kind,
    durationSec: d.durMin * 60,
    durMin: d.durMin,
    durSec: 0,
    target: d.target,
  };
}

function editorReducer(state: EditableSegment[], action: EditorAction): EditableSegment[] {
  switch (action.type) {
    case 'add':
      return [...state, makeSegment(action.kind)];
    case 'remove':
      return state.filter((_, i) => i !== action.index);
    case 'move': {
      const next = [...state];
      const i = action.index;
      if (action.dir === 'up' && i > 0) {
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
      } else if (action.dir === 'down' && i < next.length - 1) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
      return next;
    }
    case 'update': {
      const next = [...state];
      next[action.index] = { ...next[action.index], ...action.patch };
      return next;
    }
    case 'reset':
      return action.segments;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WorkoutBuilderProps {
  /** Initial workout to edit (e.g. loading from library). Defaults to a fresh workout. */
  initialWorkout?: Workout;
  /** Called after a workout is saved to the library with the saved workout. */
  onSaved?: (workout: Workout) => void;
  /** Called when user clicks "Ride this workout" — passes the finalized Workout. */
  onRide?: (workout: Workout) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkoutBuilder({
  initialWorkout,
  onSaved,
  onRide,
  className,
}: WorkoutBuilderProps) {
  const ftpW = useSettingsStore((s) => s.ftpW);
  const formId = useId();

  const [segments, dispatch] = useReducer(
    editorReducer,
    undefined,
    () => initialWorkout ? initialWorkout.segments.map(toEditable) : [makeSegment('warmup'), makeSegment('steady'), makeSegment('cooldown')],
  );
  const [name, setName] = useState(initialWorkout?.name ?? 'My Workout');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Interval set helper state
  const [intervalN, setIntervalN] = useState(4);
  const [intervalOnSec, setIntervalOnSec] = useState(120); // 2 min on
  const [intervalOffSec, setIntervalOffSec] = useState(120); // 2 min off

  const totalSec = segments.reduce((a, s) => a + Math.max(1, (s.durMin || 0) * 60 + (s.durSec || 0)), 0);
  const workout = buildWorkout(name, segments, initialWorkout?.id);
  const tss = estimateTSS(workout, ftpW);

  // Build interval/recovery pairs then bulk-add in one reducer dispatch
  const addIntervalSetBulk = useCallback(() => {
    if (intervalN < 1 || intervalOnSec < 1) return;
    const newSegs: EditableSegment[] = [];
    for (let i = 0; i < intervalN; i++) {
      newSegs.push({
        ...makeSegment('interval'),
        id: workoutId('seg'),
        durMin: Math.floor(intervalOnSec / 60),
        durSec: intervalOnSec % 60,
        durationSec: intervalOnSec,
      });
      if (intervalOffSec > 0) {
        newSegs.push({
          ...makeSegment('recovery'),
          id: workoutId('seg'),
          durMin: Math.floor(intervalOffSec / 60),
          durSec: intervalOffSec % 60,
          durationSec: intervalOffSec,
        });
      }
    }
    dispatch({ type: 'reset', segments: [...segments, ...newSegs] });
  }, [intervalN, intervalOnSec, intervalOffSec, segments]);

  const handleSave = useCallback(async () => {
    if (segments.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await saveWorkout(workout);
      setSaved(true);
      onSaved?.(workout);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save workout');
    } finally {
      setSaving(false);
    }
  }, [workout, segments.length, onSaved]);

  const handleRide = useCallback(() => {
    onRide?.(workout);
  }, [workout, onRide]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Header: name + stats */}
      <div className="flex flex-col gap-2">
        <input
          id={`${formId}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(
            'w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-base font-semibold',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          placeholder="Workout name…"
          aria-label="Workout name"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="muted" className="gap-1">
            <Timer className="h-3 w-3" />
            {formatDurSec(totalSec)}
          </Badge>
          <Badge variant="muted" className="gap-1">
            <Zap className="h-3 w-3" />
            {tss} TSS
          </Badge>
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            {segments.length} segment{segments.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Workout shape preview + kind-color ribbon */}
      {segments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <WorkoutPowerProfile workout={workout} ftpW={ftpW} variant="full" />
          <TimelineBar segments={segments} ftpW={ftpW} totalSec={totalSec} />
        </div>
      )}

      {/* Segment list */}
      <div className="flex flex-col gap-2">
        {segments.map((seg, i) => (
          <SegmentRow
            key={seg.id}
            seg={seg}
            index={i}
            total={segments.length}
            ftpW={ftpW}
            dispatch={dispatch}
          />
        ))}
        {segments.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
            <Activity className="h-7 w-7 mx-auto mb-2.5 text-muted-foreground/35" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">No segments yet</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Add a segment using the buttons below.</p>
          </div>
        )}
      </div>

      {/* Add segment buttons */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(KIND_LABELS) as SegmentKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => dispatch({ type: 'add', kind })}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium',
              'hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', KIND_COLORS[kind])} />
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      {/* Interval set helper */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <RepeatIcon className="h-3.5 w-3.5 text-primary" />
            Quick interval set
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <NumField
              label="Repeats"
              value={intervalN}
              min={1}
              max={20}
              onChange={setIntervalN}
            />
            <NumField
              label="On (sec)"
              value={intervalOnSec}
              min={10}
              max={3600}
              step={10}
              onChange={setIntervalOnSec}
            />
            <NumField
              label="Off (sec)"
              value={intervalOffSec}
              min={0}
              max={3600}
              step={10}
              onChange={setIntervalOffSec}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 self-end"
              onClick={addIntervalSetBulk}
            >
              <Plus className="h-3.5 w-3.5" />
              Add {intervalN}×
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Adds {intervalN} interval/recovery pairs using the default interval target (105% FTP).
            Edit each segment after adding.
          </p>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
        >
          <span className="mt-0.5 shrink-0" aria-hidden="true">⚠</span>
          <p>{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 min-w-[7rem] focus-visible:ring-2 focus-visible:ring-ring"
          disabled={saving || segments.length === 0}
          onClick={() => void handleSave()}
          aria-label={saving ? 'Saving workout' : saved ? 'Workout saved' : 'Save workout to library'}
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save workout'}
        </Button>
        {onRide && (
          <Button
            variant="accent"
            size="sm"
            className="h-9 gap-1.5 focus-visible:ring-2 focus-visible:ring-ring"
            disabled={segments.length === 0}
            onClick={handleRide}
            aria-label="Start riding this workout"
          >
            <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
            Ride this workout
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline bar
// ---------------------------------------------------------------------------

function TimelineBar({
  segments,
  ftpW,
  totalSec,
}: {
  segments: EditableSegment[];
  ftpW: number;
  totalSec: number;
}) {
  if (totalSec <= 0) return null;
  return (
    <div
      className="flex h-8 w-full overflow-hidden rounded-xl ring-1 ring-border/40"
      role="img"
      aria-label="Workout timeline"
    >
      {segments.map((seg) => {
        const dur = Math.max(1, (seg.durMin || 0) * 60 + (seg.durSec || 0));
        const widthPct = (dur / totalSec) * 100;
        return (
          <div
            key={seg.id}
            title={`${KIND_LABELS[seg.kind]} · ${formatDurSec(dur)}`}
            className={cn(
              'h-full transition-all duration-200',
              KIND_COLORS[seg.kind],
              intensityClass(seg.target, ftpW),
            )}
            style={{ width: `${widthPct.toFixed(2)}%`, minWidth: '2px' }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment row
// ---------------------------------------------------------------------------

function SegmentRow({
  seg,
  index,
  total,
  ftpW,
  dispatch,
}: {
  seg: EditableSegment;
  index: number;
  total: number;
  ftpW: number;
  dispatch: React.Dispatch<EditorAction>;
}) {
  const targetLabel = describeTarget(seg.target, ftpW);

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-2.5 flex flex-col gap-2">
      {/* Row header */}
      <div className="flex items-center gap-2">
        {/* Color dot */}
        <span className={cn('h-3 w-3 shrink-0 rounded-full', KIND_COLORS[seg.kind])} />

        {/* Kind selector */}
        <select
          value={seg.kind}
          onChange={(e) =>
            dispatch({ type: 'update', index, patch: { kind: e.target.value as SegmentKind } })
          }
          className="text-xs font-semibold text-foreground bg-transparent border-none outline-none focus-visible:ring-1 focus-visible:ring-ring rounded cursor-pointer"
          aria-label="Segment kind"
        >
          {(Object.keys(KIND_LABELS) as SegmentKind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>

        {/* Duration */}
        <div className="flex items-center gap-1 ml-1">
          <input
            type="number"
            min={0}
            max={999}
            value={seg.durMin}
            onChange={(e) =>
              dispatch({ type: 'update', index, patch: { durMin: Math.max(0, Number(e.target.value) | 0) } })
            }
            className="w-10 text-xs text-center rounded border border-border/60 bg-background/40 py-0.5 px-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Minutes"
          />
          <span className="text-xs text-muted-foreground">m</span>
          <input
            type="number"
            min={0}
            max={59}
            value={seg.durSec}
            onChange={(e) =>
              dispatch({ type: 'update', index, patch: { durSec: Math.max(0, Math.min(59, Number(e.target.value) | 0)) } })
            }
            className="w-10 text-xs text-center rounded border border-border/60 bg-background/40 py-0.5 px-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Seconds"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Move up/down + delete — ≥40px hit targets */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => dispatch({ type: 'move', index, dir: 'up' })}
            disabled={index === 0}
            aria-label="Move segment up"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'move', index, dir: 'down' })}
            disabled={index === total - 1}
            aria-label="Move segment down"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'remove', index })}
            aria-label="Delete segment"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Target editor */}
      <TargetEditor
        target={seg.target}
        ftpW={ftpW}
        onChange={(target) => dispatch({ type: 'update', index, patch: { target } })}
      />

      {/* Target summary + optional cadence */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground">{targetLabel}</span>
        <div className="flex items-center gap-1 ml-auto">
          <Activity className="h-3 w-3 text-muted-foreground" />
          <input
            type="number"
            min={60}
            max={120}
            placeholder="—"
            value={seg.cadenceTarget ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              dispatch({ type: 'update', index, patch: { cadenceTarget: v } });
            }}
            className="w-12 text-xs text-center rounded border border-border/60 bg-background/40 py-0.5 px-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/50"
            aria-label="Cadence target (rpm)"
          />
          <span className="text-[11px] text-muted-foreground">rpm</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target editor
// ---------------------------------------------------------------------------

function TargetEditor({
  target,
  ftpW,
  onChange,
}: {
  target: SegmentTarget;
  ftpW: number;
  onChange: (t: SegmentTarget) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Target type selector */}
      <select
        value={target.type}
        onChange={(e) => {
          const t = e.target.value as SegmentTarget['type'];
          if (t === 'ftpPct') onChange({ type: 'ftpPct', value: 0.75 });
          else if (t === 'watts') onChange({ type: 'watts', watts: Math.round(ftpW * 0.75) });
          else if (t === 'rampPct') onChange({ type: 'rampPct', startPct: 0.55, endPct: 1.0 });
          else if (t === 'grade') onChange({ type: 'grade', gradePct: 3 });
          else onChange({ type: 'free' });
        }}
        className="text-xs rounded border border-border/60 bg-background/40 px-1.5 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Target type"
      >
        <option value="ftpPct">% FTP</option>
        <option value="watts">Watts</option>
        <option value="rampPct">Ramp %FTP</option>
        <option value="grade">Grade %</option>
        <option value="free">Free</option>
      </select>

      {target.type === 'ftpPct' && (
        <>
          <input
            type="number"
            min={20}
            max={200}
            value={Math.round(target.value * 100)}
            onChange={(e) => onChange({ type: 'ftpPct', value: Number(e.target.value) / 100 })}
            className="w-14 text-xs text-center rounded border border-border/60 bg-background/40 py-0.5 px-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="% FTP value"
          />
          <span className="text-xs text-muted-foreground">%FTP</span>
          {ftpW > 0 && (
            <span className="text-[11px] text-muted-foreground">
              ≈ {Math.round(target.value * ftpW)} W
            </span>
          )}
        </>
      )}

      {target.type === 'watts' && (
        <>
          <input
            type="number"
            min={10}
            max={2000}
            step={5}
            value={target.watts}
            onChange={(e) => onChange({ type: 'watts', watts: Number(e.target.value) })}
            className="w-16 text-xs text-center rounded border border-border/60 bg-background/40 py-0.5 px-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Watts target"
          />
          <span className="text-xs text-muted-foreground">W</span>
          {ftpW > 0 && (
            <span className="text-[11px] text-muted-foreground">
              ≈ {Math.round((target.watts / ftpW) * 100)}% FTP
            </span>
          )}
        </>
      )}

      {target.type === 'rampPct' && (
        <>
          <input
            type="number"
            min={20}
            max={200}
            value={Math.round(target.startPct * 100)}
            onChange={(e) =>
              onChange({ type: 'rampPct', startPct: Number(e.target.value) / 100, endPct: target.endPct })
            }
            className="w-12 text-xs text-center rounded border border-border/60 bg-background/40 py-0.5 px-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Ramp start % FTP"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="number"
            min={20}
            max={200}
            value={Math.round(target.endPct * 100)}
            onChange={(e) =>
              onChange({ type: 'rampPct', startPct: target.startPct, endPct: Number(e.target.value) / 100 })
            }
            className="w-12 text-xs text-center rounded border border-border/60 bg-background/40 py-0.5 px-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Ramp end % FTP"
          />
          <span className="text-xs text-muted-foreground">%FTP</span>
        </>
      )}

      {target.type === 'grade' && (
        <>
          <input
            type="number"
            min={-25}
            max={25}
            step={0.5}
            value={target.gradePct}
            onChange={(e) => onChange({ type: 'grade', gradePct: Number(e.target.value) })}
            className="w-14 text-xs text-center rounded border border-border/60 bg-background/40 py-0.5 px-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Grade percent"
          />
          <span className="text-xs text-muted-foreground">% grade</span>
        </>
      )}

      {target.type === 'free' && (
        <span className="text-xs text-muted-foreground italic">No trainer control</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function NumField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const id = `numfield-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 text-xs text-center rounded border border-border/60 bg-background/40 py-1 px-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}

function describeTarget(target: SegmentTarget, ftpW: number): string {
  switch (target.type) {
    case 'ftpPct':
      return `${Math.round(target.value * 100)}% FTP${ftpW > 0 ? ` · ${Math.round(target.value * ftpW)} W` : ''}`;
    case 'watts':
      return `${target.watts} W${ftpW > 0 ? ` · ${Math.round((target.watts / ftpW) * 100)}% FTP` : ''}`;
    case 'rampPct':
      return `Ramp ${Math.round(target.startPct * 100)}%→${Math.round(target.endPct * 100)}% FTP`;
    case 'grade':
      return `${target.gradePct >= 0 ? '+' : ''}${target.gradePct}% grade (sim mode)`;
    case 'free':
      return 'Free ride';
  }
}

function buildWorkout(name: string, segments: EditableSegment[], existingId?: string): Workout {
  return {
    id: existingId ?? workoutId('w'),
    name: name.trim() || 'Untitled Workout',
    createdAt: Date.now(),
    source: 'manual',
    segments: segments.map(fromEditable),
  };
}
