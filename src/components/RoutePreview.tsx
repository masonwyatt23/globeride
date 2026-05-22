/**
 * RoutePreview.tsx
 *
 * Rich pre-ride route summary card. Mount wherever a loaded route should be
 * previewed — typically in the "Pick a route" step on Home.tsx, below the
 * ElevationProfile.
 *
 * Renders nothing when no route is loaded.
 */

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Ruler,
  Mountain,
  Zap,
  ChevronUp,
} from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';
import {
  computeZoneBreakdown,
  computeGradientStats,
  detectClimbs,
  computeDifficulty,
  buildSparkline,
  GRADIENT_ZONES,
  type ClimbCategory,
  type DifficultyLabel,
} from '@/lib/routeAnalysis';

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function RoutePreview() {
  const route = useRideStore((s) => s.route);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'dark';

  const analysis = useMemo(() => {
    if (!route) return null;
    const gradStats = computeGradientStats(route);
    const zones = computeZoneBreakdown(route);
    const climbs = detectClimbs(route);
    const difficulty = computeDifficulty(route, gradStats);
    const spark = buildSparkline(route, 120);
    return { gradStats, zones, climbs, difficulty, spark };
  }, [route]);

  if (!route || !analysis) return null;

  const { gradStats, zones, climbs, difficulty, spark } = analysis;

  // Elevation range
  const eleRangeM = route.maxElevation - route.minElevation;

  // Distance formatting
  const distKm = route.totalDistance / 1000;
  const distLabel = distKm >= 1 ? `${distKm.toFixed(1)} km` : `${Math.round(route.totalDistance)} m`;

  // Chart colors
  const primary   = isDark ? '#22d3ee' : '#0891b2';   // cyan-400 / cyan-600
  const axisColor = isDark ? 'hsl(215 18% 46%)' : 'hsl(215 15% 52%)';

  return (
    <div className="mt-4 space-y-3 animate-fadeUp">
      {/* ── Header row: difficulty badge + route name ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
          Route preview
        </span>
        <DifficultyBadge label={difficulty.label} score={difficulty.score} color={difficulty.color} />
      </div>

      {/* ── Key stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          icon={<Ruler className="h-3.5 w-3.5" />}
          label="Distance"
          value={distLabel}
        />
        <StatTile
          icon={<TrendingUp className="h-3.5 w-3.5 text-green-400" />}
          label="Ascent"
          value={`${Math.round(route.ascent)} m`}
          valueClass="text-green-400"
        />
        <StatTile
          icon={<TrendingDown className="h-3.5 w-3.5 text-sky-400" />}
          label="Descent"
          value={`${Math.round(route.descent)} m`}
          valueClass="text-sky-400"
        />
        <StatTile
          icon={<Mountain className="h-3.5 w-3.5 text-violet-400" />}
          label="Elev. range"
          value={`${Math.round(eleRangeM)} m`}
          valueClass="text-violet-400"
        />
      </div>

      {/* ── Secondary stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          icon={<Zap className="h-3.5 w-3.5 text-amber-400" />}
          label="Avg grade"
          value={`${gradStats.avgGradient.toFixed(1)} %`}
          sub="uphill only"
        />
        <StatTile
          icon={<Zap className="h-3.5 w-3.5 text-rose-400" />}
          label="Max grade"
          value={`${gradStats.maxGradient.toFixed(1)} %`}
        />
        <StatTile
          icon={<Mountain className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Min elev."
          value={`${Math.round(route.minElevation)} m`}
        />
        <StatTile
          icon={<Mountain className="h-3.5 w-3.5 text-cyan-400" />}
          label="Max elev."
          value={`${Math.round(route.maxElevation)} m`}
        />
      </div>

      {/* ── Elevation sparkline ── */}
      <div
        className={cn(
          'rounded-xl border px-3 pt-3 pb-1',
          isDark ? 'border-white/8 bg-white/3' : 'border-black/8 bg-black/2',
        )}
      >
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Elevation profile
        </div>
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="rpElevFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={primary} stopOpacity={isDark ? 0.45 : 0.35} />
                  <stop offset="100%" stopColor={primary} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="d"
                type="number"
                domain={[0, route.totalDistance]}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)} km`}
                stroke={axisColor}
                tick={{ fontSize: 9, fill: axisColor }}
                tickLine={false}
                axisLine={false}
                height={14}
                interval="preserveStartEnd"
              />
              <YAxis
                dataKey="ele"
                stroke={axisColor}
                tick={{ fontSize: 9, fill: axisColor }}
                tickLine={false}
                axisLine={false}
                width={30}
                domain={['dataMin - 5', 'dataMax + 5']}
                tickFormatter={(v) => `${Math.round(v)}`}
              />
              <Tooltip
                contentStyle={{
                  background:   isDark ? 'rgba(12,18,36,0.94)' : 'rgba(255,255,255,0.97)',
                  border:       `1px solid ${isDark ? 'hsl(215 26% 17%)' : 'hsl(214 24% 86%)'}`,
                  borderRadius: 8,
                  fontSize:     11,
                  padding:      '4px 8px',
                  color:        isDark ? 'hsl(210 28% 96%)' : 'hsl(220 40% 10%)',
                }}
                labelFormatter={(v) => `${(Number(v) / 1000).toFixed(2)} km`}
                formatter={(value) => [`${Math.round(Number(value))} m`, 'elev.']}
              />
              <Area
                dataKey="ele"
                type="monotone"
                stroke={primary}
                strokeWidth={1.5}
                fill="url(#rpElevFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Gradient zone breakdown (stacked bar) ── */}
      <GradientBreakdownBar zones={zones} isDark={isDark} />

      {/* ── Climb list ── */}
      {climbs.length > 0 && (
        <ClimbList climbs={climbs} isDark={isDark} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Difficulty badge
// ---------------------------------------------------------------------------

const DIFFICULTY_BG: Record<DifficultyLabel, string> = {
  Flat:        'bg-slate-400/15 text-slate-300 ring-slate-400/25',
  Easy:        'bg-green-400/15 text-green-400 ring-green-400/25',
  Rolling:     'bg-lime-400/15 text-lime-400 ring-lime-400/25',
  Hilly:       'bg-yellow-400/15 text-yellow-400 ring-yellow-400/25',
  Challenging: 'bg-orange-400/15 text-orange-400 ring-orange-400/25',
  Brutal:      'bg-rose-500/15 text-rose-400 ring-rose-500/25',
};

function DifficultyBadge({
  label,
  score,
  color,
}: {
  label: DifficultyLabel;
  score: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Difficulty score ring */}
      <div className="relative h-10 w-10 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor"
            strokeWidth="3" className="text-white/10" />
          <circle
            cx="18" cy="18" r="15" fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${(score / 100) * 94.25} 94.25`}
            strokeLinecap="round"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-[9px] font-bold num"
          style={{ color }}
        >
          {score}
        </span>
      </div>
      <span
        className={cn(
          'text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-pill ring-1',
          DIFFICULTY_BG[label],
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

function StatTile({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 dark:bg-white/3 bg-black/3 px-3 py-2 flex flex-col gap-1">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className={cn('text-sm font-bold num text-foreground leading-none', valueClass)}>
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-muted-foreground/60 leading-none">{sub}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gradient zone stacked bar
// ---------------------------------------------------------------------------

function GradientBreakdownBar({
  zones,
  isDark,
}: {
  zones: ReturnType<typeof import('@/lib/routeAnalysis').computeZoneBreakdown>;
  isDark: boolean;
}) {
  // Filter out zones with zero distance for the bar segments
  const nonEmpty = zones.filter((z) => z.distanceM > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <div className={cn(
      'rounded-xl border px-3 py-3 space-y-2',
      isDark ? 'border-white/8 bg-white/3' : 'border-black/8 bg-black/2',
    )}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Gradient zones
      </div>

      {/* Stacked bar */}
      <div className="h-4 w-full rounded-full overflow-hidden flex" role="img" aria-label="Gradient zone breakdown">
        {GRADIENT_ZONES.map((zone, i) => {
          const z = zones[i];
          if (z.pct < 0.5) return null; // skip sub-0.5 % slivers
          return (
            <div
              key={zone.label}
              style={{ width: `${z.pct}%`, backgroundColor: zone.color }}
              title={`${zone.label}: ${z.pct.toFixed(1)} %`}
              className="transition-all"
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {GRADIENT_ZONES.map((zone, i) => {
          const z = zones[i];
          if (z.pct < 0.5) return null;
          return (
            <div key={zone.label} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: zone.color }}
              />
              <span className="text-[10px] text-muted-foreground leading-none">
                {zone.label}
              </span>
              <span className="text-[10px] num font-semibold text-foreground/80 leading-none">
                {z.pct.toFixed(0)} %
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Climb list
// ---------------------------------------------------------------------------

const CATEGORY_STYLE: Record<ClimbCategory, { bg: string; text: string; border: string }> = {
  'HC':    { bg: 'bg-rose-500/15',    text: 'text-rose-400',   border: 'border-rose-500/30' },
  'Cat 1': { bg: 'bg-orange-400/15',  text: 'text-orange-400', border: 'border-orange-400/30' },
  'Cat 2': { bg: 'bg-yellow-400/15',  text: 'text-yellow-400', border: 'border-yellow-400/30' },
  'Cat 3': { bg: 'bg-green-400/15',   text: 'text-green-400',  border: 'border-green-400/30' },
  'Cat 4': { bg: 'bg-sky-400/15',     text: 'text-sky-400',    border: 'border-sky-400/30' },
};

function ClimbList({
  climbs,
  isDark,
}: {
  climbs: ReturnType<typeof import('@/lib/routeAnalysis').detectClimbs>;
  isDark: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border px-3 py-3 space-y-2',
      isDark ? 'border-white/8 bg-white/3' : 'border-black/8 bg-black/2',
    )}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <ChevronUp className="h-3 w-3" />
        Notable climbs ({climbs.length})
      </div>
      <div className="space-y-1.5">
        {climbs.map((climb, idx) => {
          const style = CATEGORY_STYLE[climb.category];
          const startKm = (climb.startDistance / 1000).toFixed(1);
          const lengthKm = climb.lengthM >= 1000
            ? `${(climb.lengthM / 1000).toFixed(1)} km`
            : `${Math.round(climb.lengthM)} m`;

          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2',
                style.bg, style.border,
              )}
            >
              {/* Category pill */}
              <span
                className={cn(
                  'shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                  style.bg, style.text,
                )}
              >
                {climb.category}
              </span>

              {/* Stats */}
              <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[11px] font-semibold text-foreground num">
                  +{Math.round(climb.elevationGainM)} m
                </span>
                <span className="text-[10px] text-muted-foreground num">
                  {lengthKm}
                </span>
                <span className="text-[10px] text-muted-foreground num">
                  avg {climb.avgGrade.toFixed(1)} %
                </span>
                <span className="text-[10px] text-muted-foreground num">
                  max {climb.maxGrade.toFixed(1)} %
                </span>
              </div>

              {/* Distance marker */}
              <span className="shrink-0 text-[9px] num text-muted-foreground/60">
                @ {startKm} km
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
