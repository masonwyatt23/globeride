/**
 * PersonalRecords — All-time best performances + long-term trend charts.
 *
 * Sections:
 *   1. Stat cards — best distance, duration, climb, speed, power, TSS, work
 *   2. All-time power curve — bar chart across canonical MMP windows
 *   3. Trend charts — weekly volume (distance / time / elevation / TSS)
 *      switchable via tab strip, over last 16 weeks or 12 months
 *
 * Data is loaded once on mount from IndexedDB via listRides().
 * FTP is read from settingsStore (never null — defaults to 220 W).
 * Graceful empty state when there are no rides.
 *
 * Drop in as <PersonalRecords /> anywhere — no props required.
 */

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  Trophy,
  Zap,
  Route,
  Mountain,
  Gauge,
  Clock,
  Flame,
  TrendingUp,
  Loader2,
  BarChart2,
  CalendarDays,
} from 'lucide-react';

import { cn, formatDistance, formatDuration } from '@/lib/utils';
import { formatDate, formatSpeed } from '@/lib/format';
import { SectionHeader } from '@/components/ui/section-header';
import { useRideHistory } from '@/hooks/useRideHistory';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  computePersonalRecords,
  computeWeeklyTrends,
  computeMonthlyTrends,
  type PersonalRecord,
  type PersonalRecords as PRData,
  type AllTimePowerPoint,
  type TrendWeek,
  type TrendMonth,
} from '@/lib/records';

// ---------------------------------------------------------------------------
// Shared tooltip style (matches RideAnalytics)
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE: React.CSSProperties = {
  background:   'rgba(12, 18, 36, 0.96)',
  border:       '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  color:        'hsl(210 28% 96%)',
  fontSize:     12,
  boxShadow:    '0 10px 30px -12px rgba(0,0,0,0.55)',
  padding:      '6px 10px',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1 · PR stat cards
// ---------------------------------------------------------------------------

interface PrCardDef {
  label: string;
  icon: React.ReactNode;
  iconColor: string;
  record: PersonalRecord<number>;
  formatValue: (v: number) => string;
  unit?: string;
}

function PrCard({ def }: { def: PrCardDef }) {
  const { label, icon, iconColor, record, formatValue, unit } = def;
  const hasData = record.setAt !== null;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card/40 p-3.5 transition-all',
        hasData
          ? 'border-border/60 hover:border-primary/30 hover:bg-card/60'
          : 'border-border/30 opacity-60',
      )}
    >
      {/* Icon + label */}
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span style={{ color: iconColor }} aria-hidden="true">{icon}</span>
        {label}
      </div>

      {/* Value */}
      <div className="num text-xl font-bold text-foreground leading-none">
        {hasData ? formatValue(record.value) : '—'}
        {hasData && unit && (
          <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
        )}
      </div>

      {/* When + ride name */}
      {hasData && (
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] text-muted-foreground leading-tight truncate">
            {record.rideName ?? 'Unnamed ride'}
          </div>
          <div className="text-[10px] text-muted-foreground/60">
            {formatDate(record.setAt)}
          </div>
        </div>
      )}
    </div>
  );
}

function PrGrid({ prs }: { prs: PRData; }) {
  const defs: PrCardDef[] = [
    {
      label:       'Longest ride',
      icon:        <Route className="h-3.5 w-3.5" />,
      iconColor:   '#22d3ee',
      record:      prs.longestDistanceM,
      formatValue: (v) => formatDistance(v),
    },
    {
      label:       'Longest duration',
      icon:        <Clock className="h-3.5 w-3.5" />,
      iconColor:   '#818cf8',
      record:      prs.longestDurationSec,
      formatValue: (v) => formatDuration(v),
    },
    {
      label:       'Biggest climb',
      icon:        <Mountain className="h-3.5 w-3.5" />,
      iconColor:   '#34d399',
      record:      prs.biggestClimbM,
      formatValue: (v) => `${Math.round(v).toLocaleString()} m`,
    },
    {
      label:       'Fastest avg speed',
      icon:        <Gauge className="h-3.5 w-3.5" />,
      iconColor:   '#f59e0b',
      record:      prs.fastestAvgSpeedMs,
      formatValue: formatSpeed,
    },
    {
      label:       'Best avg power',
      icon:        <Zap className="h-3.5 w-3.5" />,
      iconColor:   '#fbbf24',
      record:      prs.highestAvgPowerW,
      formatValue: (v) => `${v} W`,
    },
    {
      label:       'Most TSS',
      icon:        <Flame className="h-3.5 w-3.5" />,
      iconColor:   '#f97316',
      record:      prs.mostTss,
      formatValue: (v) => Math.round(v).toString(),
    },
    {
      label:       'Most work',
      icon:        <TrendingUp className="h-3.5 w-3.5" />,
      iconColor:   '#a78bfa',
      record:      prs.mostWorkKj,
      formatValue: (v) => `${Math.round(v)} kJ`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {defs.map((d) => (
        <PrCard key={d.label} def={d} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · All-time power curve bar chart
// ---------------------------------------------------------------------------

function AllTimePowerCurve({ curve }: { curve: AllTimePowerPoint[] }) {
  const hasPower = curve.some((p) => p.powerW !== null);

  if (!hasPower) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-muted-foreground/60 italic">
        Complete rides with a power meter to see your all-time power curve.
      </div>
    );
  }

  const data = curve
    .filter((p) => p.powerW !== null)
    .map((p) => ({ label: p.label, powerW: p.powerW as number, seconds: p.seconds }));

  // Bars coloured by duration (short efforts brighter, longer muted)
  const maxSec = Math.max(...data.map((d) => d.seconds));

  return (
    <div className="flex flex-col gap-2">
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%" minWidth={40} minHeight={28}>
          <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'hsl(215 18% 56%)' }}
              tickLine={false}
              axisLine={false}
              height={18}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(215 18% 56%)' }}
              tickLine={false}
              axisLine={false}
              width={38}
              tickFormatter={(v) => `${v}W`}
              domain={[0, (dm: number) => Math.ceil(dm * 1.15 / 50) * 50]}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              formatter={(value: unknown, _name: unknown, entry: { payload?: AllTimePowerPoint }) => {
                if (value == null) return ['—', 'All-time best'];
                const w = Math.round(Number(value));
                const rideDate = entry.payload?.rideStartedAt
                  ? ` · ${formatDate(entry.payload.rideStartedAt)}`
                  : '';
                const rideName = entry.payload?.rideName ?? '';
                return [
                  `${w} W${rideDate}`,
                  rideName || 'All-time best',
                ];
              }}
            />
            <Bar dataKey="powerW" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((entry, i) => {
                // Fade from bright cyan (short) to deeper violet (long)
                const t = entry.seconds / maxSec;
                const r = Math.round(34  + t * (168 - 34));
                const g = Math.round(211 + t * (85  - 211));
                const b = Math.round(238 + t * (247 - 238));
                return (
                  <Cell
                    key={i}
                    fill={`rgb(${r},${g},${b})`}
                    fillOpacity={0.85}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* PR row: label + power */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {curve.map((pt) => (
          <div key={pt.label} className="flex flex-col items-center gap-0.5 text-center">
            <span className="num text-xs font-bold text-foreground">
              {pt.powerW !== null ? `${pt.powerW}W` : '—'}
            </span>
            <span className="text-[9px] text-muted-foreground">{pt.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 · Trend charts
// ---------------------------------------------------------------------------

type TrendMetric = 'distance' | 'duration' | 'ascent' | 'tss';
type TrendView   = 'weekly' | 'monthly';

interface TrendDatum {
  label: string;
  distance: number;   // km
  duration: number;   // hours
  ascent: number;     // m
  tss: number;
  rides: number;
}

function weekToTrendDatum(w: TrendWeek): TrendDatum {
  return {
    label:    w.label,
    distance: roundTo(w.distanceM / 1000, 1),
    duration: roundTo(w.durationSec / 3600, 2),
    ascent:   Math.round(w.ascentM),
    tss:      roundTo(w.tss, 0),
    rides:    w.rides,
  };
}

function monthToTrendDatum(m: TrendMonth): TrendDatum {
  return {
    label:    m.label,
    distance: roundTo(m.distanceM / 1000, 1),
    duration: roundTo(m.durationSec / 3600, 2),
    ascent:   Math.round(m.ascentM),
    tss:      roundTo(m.tss, 0),
    rides:    m.rides,
  };
}

const METRIC_META: Record<TrendMetric, {
  label: string;
  color: string;
  formatter: (v: number) => string;
  unit: string;
}> = {
  distance: { label: 'Distance',    color: '#22d3ee', formatter: (v) => `${v} km`,  unit: 'km'  },
  duration: { label: 'Ride Time',   color: '#818cf8', formatter: (v) => `${v} h`,   unit: 'h'   },
  ascent:   { label: 'Elevation',   color: '#34d399', formatter: (v) => `${v} m`,   unit: 'm'   },
  tss:      { label: 'Stress (TSS)',color: '#f97316', formatter: (v) => `${v}`,     unit: 'TSS' },
};

function TrendCharts({
  weekly,
  monthly,
}: {
  weekly: TrendWeek[];
  monthly: TrendMonth[];
}) {
  const [metric, setMetric]  = useState<TrendMetric>('distance');
  const [view,   setView]    = useState<TrendView>('weekly');

  const rawData = view === 'weekly' ? weekly : monthly;
  const data: TrendDatum[] = useMemo(
    () =>
      view === 'weekly'
        ? (rawData as TrendWeek[]).map(weekToTrendDatum)
        : (rawData as TrendMonth[]).map(monthToTrendDatum),
    [view, rawData],
  );

  const meta = METRIC_META[metric];
  const hasData = data.some((d) => d[metric] > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Metric selector */}
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(METRIC_META) as TrendMetric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-colors',
                metric === m
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-muted/30 text-muted-foreground border border-transparent hover:text-foreground',
              )}
            >
              {METRIC_META[m].label}
            </button>
          ))}
        </div>

        {/* Weekly / monthly toggle */}
        <div className="flex rounded-full overflow-hidden border border-border/50 text-[10px] font-semibold">
          {(['weekly', 'monthly'] as TrendView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'px-3 py-1 transition-colors',
                view === v
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {!hasData ? (
        <div className="flex items-center justify-center h-32 text-xs text-muted-foreground/60 italic">
          Not enough data for this view yet.
        </div>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%" minWidth={40} minHeight={28}>
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={meta.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={meta.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: 'hsl(215 18% 56%)' }}
                tickLine={false}
                axisLine={false}
                height={18}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'hsl(215 18% 56%)' }}
                tickLine={false}
                axisLine={false}
                width={38}
                tickFormatter={(v: number) => `${v}${meta.unit}`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                formatter={(value: unknown, _name: unknown, entry: { payload?: TrendDatum }) => {
                  const v = Number(value);
                  const rides = entry.payload?.rides ?? 0;
                  return [
                    meta.formatter(v),
                    `${rides} ride${rides !== 1 ? 's' : ''}`,
                  ];
                }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={meta.color}
                strokeWidth={2}
                fill="url(#trendGrad)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: meta.color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-10 text-center">
      <Trophy className="h-9 w-9 text-muted-foreground/35" />
      <div className="text-sm font-semibold text-foreground">No records yet</div>
      <div className="text-xs text-muted-foreground max-w-[28ch] leading-relaxed">
        Complete your first ride to start tracking personal bests and training trends.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function PersonalRecords() {
  const ftpW = useSettingsStore((s) => s.ftpW);

  const { rides, loading, error } = useRideHistory();

  // Section collapse state
  const [prOpen,    setPrOpen]    = useState(true);
  const [curveOpen, setCurveOpen] = useState(true);
  const [trendOpen, setTrendOpen] = useState(true);

  const prs     = useMemo(() => computePersonalRecords(rides, ftpW), [rides, ftpW]);
  const weekly  = useMemo(() => computeWeeklyTrends(rides, ftpW),   [rides, ftpW]);
  const monthly = useMemo(() => computeMonthlyTrends(rides, ftpW),  [rides, ftpW]);

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-4 w-4 animate-[spinSlow_1.5s_linear_infinite]" />
        Loading records…
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-xs text-destructive">
        {error}
      </div>
    );
  }

  // ---- Empty ----
  if (rides.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Section: Personal Records */}
      <div className="flex flex-col gap-3">
        <SectionHeader
          id="pr-bests-header"
          panelId="pr-bests-panel"
          icon={<Trophy className="h-3.5 w-3.5" />}
          title="Personal Bests"
          open={prOpen}
          onToggle={() => setPrOpen((o) => !o)}
        />
        <div
          id="pr-bests-panel"
          role="region"
          aria-labelledby="pr-bests-header"
          hidden={!prOpen}
        >
          {prOpen && <PrGrid prs={prs} />}
        </div>
      </div>

      <div className="h-px bg-border/30" aria-hidden="true" />

      {/* Section: All-time power curve */}
      <div className="flex flex-col gap-3">
        <SectionHeader
          id="pr-curve-header"
          panelId="pr-curve-panel"
          icon={<BarChart2 className="h-3.5 w-3.5" />}
          title="All-Time Power Curve"
          open={curveOpen}
          onToggle={() => setCurveOpen((o) => !o)}
        />
        <div
          id="pr-curve-panel"
          role="region"
          aria-labelledby="pr-curve-header"
          hidden={!curveOpen}
        >
          {curveOpen && <AllTimePowerCurve curve={prs.powerCurve} />}
        </div>
      </div>

      <div className="h-px bg-border/30" aria-hidden="true" />

      {/* Section: Training Trends */}
      <div className="flex flex-col gap-3">
        <SectionHeader
          id="pr-trends-header"
          panelId="pr-trends-panel"
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          title="Training Trends"
          open={trendOpen}
          onToggle={() => setTrendOpen((o) => !o)}
        />
        <div
          id="pr-trends-panel"
          role="region"
          aria-labelledby="pr-trends-header"
          hidden={!trendOpen}
        >
          {trendOpen && <TrendCharts weekly={weekly} monthly={monthly} />}
        </div>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility (duplicated locally to keep this file self-contained)
// ---------------------------------------------------------------------------

function roundTo(n: number, decimals: number): number {
  if (!isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
