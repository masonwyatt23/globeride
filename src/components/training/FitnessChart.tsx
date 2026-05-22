/**
 * FitnessChart — Performance Management Chart (PMC).
 *
 * Displays the classic CTL / ATL / TSB trio sourced from the rider's local
 * IndexedDB ride history:
 *
 *   - CTL (Chronic Training Load) — cyan line   — "Fitness"
 *   - ATL (Acute Training Load)   — amber line   — "Fatigue"
 *   - TSB (Training Stress Balance) — area fill  — "Form"
 *
 * Above the chart: three headline cards showing today's Fitness / Fatigue /
 * Form with a plain-language interpretation label.
 *
 * Graceful empty state when there is little or no ride history.
 *
 * Mount anywhere — the component is self-contained (reads IndexedDB + stores
 * internally, no props required for data). An optional `className` prop is
 * provided for layout control.
 *
 *   import { FitnessChart } from '@/components/training/FitnessChart';
 *   // Suggested mount: HomeTabs "Training" tab or ProfilePanel after Stats.
 */

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  TrendingUp,
  Zap,
  Wind,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { useRideHistory } from '@/hooks/useRideHistory';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  computeTrainingLoadFromRecords,
  classifyForm,
  type DailyLoad,
  type FormLabel,
} from '@/lib/trainingLoad';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Chart colours — matches app's cyan accent + zone palette
// ---------------------------------------------------------------------------

const COLOR_CTL = '#22d3ee'; // cyan — Fitness
const COLOR_ATL = '#f59e0b'; // amber — Fatigue
const COLOR_TSB_POS = '#34d399'; // emerald — positive Form (fresh)
const COLOR_TSB_NEG = '#f97316'; // orange  — negative Form (tired)

// ---------------------------------------------------------------------------
// Tooltip styles (matches RideAnalytics.tsx)
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(12, 18, 36, 0.96)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  color: 'hsl(210 28% 96%)',
  fontSize: 12,
  boxShadow: '0 10px 30px -12px rgba(0,0,0,0.55)',
  padding: '8px 12px',
};

// ---------------------------------------------------------------------------
// Form metadata
// ---------------------------------------------------------------------------

interface FormMeta {
  label: FormLabel;
  color: string;
  bg: string;
  description: string;
}

function getFormMeta(label: FormLabel): FormMeta {
  switch (label) {
    case 'Fresh':
      return {
        label,
        color: '#818cf8', // indigo
        bg:    'rgba(129,140,248,0.12)',
        description: 'Well recovered — ideal for racing or testing',
      };
    case 'Optimal':
      return {
        label,
        color: '#34d399', // emerald
        bg:    'rgba(52,211,153,0.12)',
        description: 'Peak performance window — go for it',
      };
    case 'Neutral':
      return {
        label,
        color: '#22d3ee', // cyan
        bg:    'rgba(34,211,238,0.10)',
        description: 'Steady training block — fitness building',
      };
    case 'Tired':
      return {
        label,
        color: '#f59e0b', // amber
        bg:    'rgba(245,158,11,0.10)',
        description: 'Heavy load — adaptation in progress',
      };
    case 'Very Tired':
      return {
        label,
        color: '#ef4444', // red
        bg:    'rgba(239,68,68,0.10)',
        description: 'Overreach risk — ease off and recover',
      };
  }
}

// ---------------------------------------------------------------------------
// Headline stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  sub: React.ReactNode;
  color: string;
  bg: string;
  className?: string;
}

function StatCard({ icon, label, value, unit, sub, color, bg, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border border-border/50 px-3.5 py-3 transition-colors',
        className,
      )}
      style={{ background: bg, borderColor: `${color}30` }}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold"
        style={{ color }}>
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="num text-2xl font-bold leading-none text-foreground">
          {value >= 0 ? value.toFixed(1) : value.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <div className="text-[11px] text-muted-foreground leading-snug">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form pill badge
// ---------------------------------------------------------------------------

function FormPill({ label }: { label: FormLabel }) {
  const meta = getFormMeta(label);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}
    >
      {label === 'Very Tired' && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Custom PMC Tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
}

function PmcTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;

  // Determine TSB for form label (find TSB entry)
  const tsbEntry = payload.find((p) => p.name === 'tsb');
  const tsbVal = tsbEntry?.value ?? 0;
  const formLabel = classifyForm(tsbVal);
  const meta = getFormMeta(formLabel);

  // Format date nicely
  const dateStr = new Date(label + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const rows: { key: string; label: string; color: string }[] = [
    { key: 'ctl', label: 'Fitness (CTL)', color: COLOR_CTL },
    { key: 'atl', label: 'Fatigue (ATL)', color: COLOR_ATL },
    { key: 'tsb', label: 'Form (TSB)',    color: meta.color },
    { key: 'tss', label: 'Daily TSS',     color: 'hsl(215 18% 56%)' },
  ];

  return (
    <div style={TOOLTIP_STYLE}>
      <div className="mb-2 font-semibold text-foreground/90">{dateStr}</div>
      <div className="flex flex-col gap-1">
        {rows.map(({ key, label: rowLabel, color }) => {
          const entry = payload.find((p) => p.name === key);
          if (!entry) return null;
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span style={{ color }} className="text-[11px]">{rowLabel}</span>
              <span className="num font-semibold text-foreground">
                {key === 'tss' ? Math.round(entry.value) : entry.value.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center gap-1.5">
        <span style={{ color: meta.color }} className="text-[11px] font-semibold">{formLabel}</span>
        <span className="text-[10px] text-muted-foreground">{meta.description}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// X-axis tick formatter — show fewer labels on small charts
// ---------------------------------------------------------------------------

function formatXTick(dateKey: string, _index: number, ticks: string[]): string {
  // Show ~5 ticks evenly; always show first and last
  const n = ticks.length;
  const i = ticks.indexOf(dateKey);
  if (i < 0) return '';
  // Show if it's at a ~20% interval
  const step = Math.max(1, Math.floor(n / 5));
  if (i % step !== 0 && i !== n - 1) return '';

  return new Date(dateKey + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// The main chart
// ---------------------------------------------------------------------------

function PmcChart({ series }: { series: DailyLoad[] }) {
  // For the TSB area we need two datasets: positive and negative regions
  // Recharts handles this with a gradient + clip approach via a single Area
  // using both fill colors defined in a linearGradient.

  // Build chart data — pass all four metrics; Recharts handles missing nulls.
  const data = series.map((d) => ({
    date: d.date,
    ctl: d.ctl,
    atl: d.atl,
    tsb: d.tsb,
    tss: d.tss,
  }));

  const allTicks = data.map((d) => d.date);

  // Y-axis domain: accommodate all three signals + some headroom
  const allValues = data.flatMap((d) => [d.ctl, d.atl, d.tsb]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(10, ...allValues);
  const pad = (maxVal - minVal) * 0.12;
  const yMin = Math.floor((minVal - pad) / 5) * 5;
  const yMax = Math.ceil((maxVal + pad) / 5) * 5;

  return (
    <div className="h-56 w-full select-none" aria-label="Performance Management Chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 6, bottom: 0, left: 0 }}
        >
          <defs>
            {/* TSB gradient: green above 0, orange below */}
            <linearGradient id="tsbGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={COLOR_TSB_POS} stopOpacity={0.35} />
              <stop offset="50%"  stopColor={COLOR_TSB_POS} stopOpacity={0.05} />
              <stop offset="50%"  stopColor={COLOR_TSB_NEG} stopOpacity={0.05} />
              <stop offset="100%" stopColor={COLOR_TSB_NEG} stopOpacity={0.30} />
            </linearGradient>
            <linearGradient id="tsbLineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={COLOR_TSB_POS} />
              <stop offset="100%" stopColor={COLOR_TSB_NEG} />
            </linearGradient>
          </defs>

          <CartesianGrid
            vertical={false}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey="date"
            ticks={allTicks}
            tickFormatter={(v) => formatXTick(v, allTicks.indexOf(v), allTicks)}
            tick={{ fontSize: 10, fill: 'hsl(215 18% 56%)' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            height={22}
            interval="preserveStartEnd"
          />

          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(215 18% 56%)' }}
            tickLine={false}
            axisLine={false}
            width={32}
            domain={[yMin, yMax]}
            tickCount={5}
          />

          {/* Zero reference line for TSB */}
          <ReferenceLine
            y={0}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="4 3"
          />

          <Tooltip
            content={<PmcTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
          />

          {/* TSB area (renders behind the lines) */}
          <Area
            type="monotone"
            dataKey="tsb"
            name="tsb"
            stroke="url(#tsbLineGradient)"
            strokeWidth={1.5}
            fill="url(#tsbGradient)"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />

          {/* CTL — Fitness — cyan */}
          <Line
            type="monotone"
            dataKey="ctl"
            name="ctl"
            stroke={COLOR_CTL}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: COLOR_CTL, strokeWidth: 0 }}
            isAnimationActive={false}
          />

          {/* ATL — Fatigue — amber */}
          <Line
            type="monotone"
            dataKey="atl"
            name="atl"
            stroke={COLOR_ATL}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: COLOR_ATL, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend() {
  const items = [
    { color: COLOR_CTL,      label: 'Fitness (CTL)',  sub: '42-day avg' },
    { color: COLOR_ATL,      label: 'Fatigue (ATL)',  sub: '7-day avg' },
    { color: COLOR_TSB_POS,  label: 'Form (TSB)',     sub: 'CTL − ATL' },
  ];
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {items.map(({ color, label, sub }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div
            className="h-0.5 w-5 rounded-full"
            style={{ background: color }}
            aria-hidden="true"
          />
          <span className="text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{label}</span>
            {' '}
            <span className="hidden sm:inline text-muted-foreground/70">{sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-10 text-center">
      <Activity className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
      <div className="text-sm font-semibold text-foreground">No training data yet</div>
      <div className="text-xs text-muted-foreground max-w-[28ch] leading-relaxed">
        Complete a few rides and your fitness, fatigue, and form will appear here.
        The chart uses the standard 42-day / 7-day model.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export interface FitnessChartProps {
  className?: string;
}

/**
 * FitnessChart — Performance Management Chart panel.
 *
 * Self-contained: reads IndexedDB ride history and settingsStore.ftpW
 * internally. No props required for data.
 *
 * Suggested mount location: Home.tsx "Training" tab, or after the
 * RideHistory component in any tab that shows training overview.
 */
export function FitnessChart({ className }: FitnessChartProps) {
  const ftpW = useSettingsStore((s) => s.ftpW);

  const { rides, loading, error, reload } = useRideHistory();

  const result = useMemo(
    () => computeTrainingLoadFromRecords(rides, ftpW),
    [rides, ftpW],
  );

  const { series, today } = result;

  // ---- Loading ----
  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground py-3', className)}>
        <Loader2 className="h-4 w-4 animate-[spinSlow_1.5s_linear_infinite]" aria-hidden="true" />
        Loading training load…
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div className={cn('rounded-xl border border-destructive/35 bg-destructive/8 px-3 py-3 text-xs text-destructive flex items-center gap-2', className)}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {error}
        <button
          onClick={reload}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Retry"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ---- No rides ----
  if (rides.length === 0) {
    return (
      <div className={cn('flex flex-col gap-4', className)}>
        <SectionTitle />
        <EmptyState />
      </div>
    );
  }

  const formMeta = getFormMeta(today.formLabel);

  // ---- Full PMC ----
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <SectionTitle />

      {/* ── Headline cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          icon={<TrendingUp className="h-3 w-3" aria-hidden="true" />}
          label="Fitness"
          value={today.fitness}
          unit="CTL"
          sub={today.hasData ? 'Chronic training load' : 'Building…'}
          color={COLOR_CTL}
          bg="rgba(34,211,238,0.07)"
        />
        <StatCard
          icon={<Zap className="h-3 w-3" aria-hidden="true" />}
          label="Fatigue"
          value={today.fatigue}
          unit="ATL"
          sub={today.hasData ? 'Acute training load' : 'Building…'}
          color={COLOR_ATL}
          bg="rgba(245,158,11,0.07)"
        />
        <StatCard
          icon={<Wind className="h-3 w-3" aria-hidden="true" />}
          label="Form"
          value={today.form}
          unit="TSB"
          sub={<FormDescription label={today.formLabel} />}
          color={formMeta.color}
          bg={formMeta.bg}
        />
      </div>

      {/* ── Form interpretation ────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
        style={{
          borderColor: `${formMeta.color}25`,
          background: formMeta.bg,
        }}
        aria-label={`Current form: ${today.formLabel}`}
      >
        <FormPill label={today.formLabel} />
        <span className="text-xs text-muted-foreground leading-snug">
          {formMeta.description}
        </span>
        {!today.hasData && (
          <span className="ml-auto text-[10px] text-muted-foreground italic shrink-0">
            &lt;7 days data
          </span>
        )}
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────── */}
      <PmcChart series={series} />

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <Legend />

      {/* ── Footnote ───────────────────────────────────────────────────── */}
      <div className="text-[10px] text-muted-foreground/60 leading-relaxed">
        CTL/ATL uses exponentially weighted moving averages (τ=42d / τ=7d). TSS
        estimated from avg power vs FTP{ftpW > 0 ? ` (${ftpW} W)` : ''};
        rides without power use a 0.65 IF proxy.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section title — mirrors RideAnalytics SectionHeader style
// ---------------------------------------------------------------------------

function SectionTitle() {
  return (
    <div className="flex items-center gap-2">
      <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
      <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
        Fitness &amp; Form
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormDescription — handles the "sub" prop for Form StatCard
// ---------------------------------------------------------------------------

function FormDescription({ label }: { label: FormLabel }) {
  const meta = getFormMeta(label);
  return (
    <span style={{ color: meta.color }} className="font-semibold">
      {label}
    </span>
  );
}
