/**
 * WorkoutPowerProfile — Zwift-grade workout shape preview.
 *
 * One Recharts area chart that plots target watts vs elapsed seconds across
 * a Workout. The point series (two points per segment) means constant
 * blocks render flat, ramps render as slopes, and the vertical edge at
 * segment boundaries shows up automatically.
 *
 * Three variants share one component so the same visualisation appears
 * everywhere it's useful:
 *   - 'full'       — full axes, FTP reference line, tooltip. The builder.
 *   - 'compact'    — no axes, FTP reference line, tooltip. The in-ride HUD.
 *   - 'thumbnail'  — no axes, no FTP line, no tooltip. The library list.
 *
 * Mirrors the theme-reactive HSL palette of ElevationProfile so the look is
 * consistent across the app.
 */

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { Workout } from '@/lib/workout';
import { totalDurationSec } from '@/lib/workout';
import { buildProfileSeries, peakWatts } from '@/lib/workoutProfile';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

export type WorkoutProfileVariant = 'full' | 'compact' | 'thumbnail';

export interface WorkoutPowerProfileProps {
  workout: Workout;
  /** Rider FTP — resolves %FTP targets and draws the FTP reference line. */
  ftpW: number;
  /**
   * Optional elapsed seconds into the workout. When present (and within
   * range) the chart draws a vertical cursor at that point.
   */
  cursorSec?: number | null;
  variant?: WorkoutProfileVariant;
  className?: string;
  /** Override the default container height (Tailwind class, e.g. 'h-32'). */
  heightClass?: string;
}

/** mm:ss when under an hour, h:mm above — used on the axis + tooltip label. */
function formatTimeShort(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function WorkoutPowerProfile({
  workout,
  ftpW,
  cursorSec,
  variant = 'full',
  className,
  heightClass,
}: WorkoutPowerProfileProps) {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'dark';

  const totalSec = useMemo(() => totalDurationSec(workout), [workout]);
  const series = useMemo(() => buildProfileSeries(workout, ftpW), [workout, ftpW]);
  const peak = useMemo(() => peakWatts(workout, ftpW), [workout, ftpW]);

  if (workout.segments.length === 0 || totalSec === 0) return null;

  // Y ceiling: max of the peak target, 1.15×FTP (so the FTP dashed line sits
  // comfortably inside), and a 200W floor so trivial workouts don't look flat.
  const yMax = Math.max(200, peak * 1.08, ftpW > 0 ? ftpW * 1.15 : 0);

  // Theme-reactive palette (kept consistent with ElevationProfile).
  const accent     = isDark ? 'hsl(158 80% 48%)'        : 'hsl(158 80% 36%)';
  const accentSoft = isDark ? 'hsl(158 80% 48% / 0.55)' : 'hsl(158 80% 36% / 0.55)';
  const ftpLine    = isDark ? 'hsl(40 95% 60%)'         : 'hsl(38 95% 42%)';
  const cursorClr  = isDark ? 'hsl(0 95% 65%)'          : 'hsl(0 85% 45%)';
  const axisColor  = isDark ? 'hsl(215 18% 56%)'        : 'hsl(215 15% 48%)';
  const tooltipBg  = isDark ? 'rgba(12, 18, 36, 0.94)'  : 'rgba(255, 255, 255, 0.97)';
  const tooltipBrd = isDark ? 'hsl(215 26% 17%)'        : 'hsl(214 24% 86%)';
  const tooltipFg  = isDark ? 'hsl(210 28% 96%)'        : 'hsl(220 40% 10%)';

  const showAxes    = variant === 'full';
  const showTooltip = variant !== 'thumbnail';
  const showFtpRef  = variant !== 'thumbnail' && ftpW > 0;
  const showCursor  =
    cursorSec != null && cursorSec >= 0 && cursorSec <= totalSec;

  const height =
    heightClass ??
    (variant === 'thumbnail' ? 'h-8' : variant === 'compact' ? 'h-20' : 'h-32');

  const margin =
    variant === 'thumbnail'
      ? { top: 1, right: 1, bottom: 1, left: 1 }
      : variant === 'compact'
        ? { top: 4, right: 4, bottom: 0, left: 0 }
        : { top: 8, right: 8, bottom: 0, left: 0 };

  // Unique gradient id per variant — multiple chart instances on the same
  // page (e.g. the library) need distinct SVG defs to avoid id collisions.
  const gradId = `wppFill-${variant}`;

  return (
    <div
      className={cn('w-full min-w-0', height, className)}
      role="img"
      aria-label={`Workout power profile · ${formatTimeShort(totalSec)} total`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={40} minHeight={28}>
        <AreaChart data={series} margin={margin}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={accent} stopOpacity={isDark ? 0.55 : 0.45} />
              <stop offset="100%" stopColor={accent} stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="t"
            type="number"
            domain={[0, totalSec]}
            hide={!showAxes}
            stroke={axisColor}
            tick={{ fontSize: 10, fill: axisColor }}
            tickFormatter={(v) => formatTimeShort(Number(v))}
            tickLine={false}
            axisLine={false}
            height={showAxes ? 18 : 0}
          />
          <YAxis
            dataKey="watts"
            type="number"
            domain={[0, yMax]}
            hide={!showAxes}
            stroke={axisColor}
            tick={{ fontSize: 10, fill: axisColor }}
            tickFormatter={(v) => `${Math.round(Number(v))}`}
            tickLine={false}
            axisLine={false}
            width={showAxes ? 34 : 0}
          />

          {showFtpRef && (
            <ReferenceLine
              y={ftpW}
              stroke={ftpLine}
              strokeDasharray="3 3"
              strokeWidth={1}
              label={
                variant === 'full'
                  ? { value: 'FTP', fill: ftpLine, fontSize: 9, position: 'right' }
                  : undefined
              }
            />
          )}

          {showTooltip && (
            <Tooltip
              contentStyle={{
                background:   tooltipBg,
                border:       `1px solid ${tooltipBrd}`,
                borderRadius: 10,
                color:        tooltipFg,
                fontSize:     12,
                boxShadow:    '0 10px 30px -12px rgba(0, 0, 0, 0.35)',
                padding:      '6px 10px',
              }}
              labelStyle={{ color: tooltipFg, fontWeight: 600 }}
              labelFormatter={(v) => formatTimeShort(Number(v))}
              formatter={(value, _name, p) => {
                const pt = p.payload as { ftpPct: number; label: string; free: boolean };
                if (pt.free) return [pt.label, 'segment'];
                const pct = pt.ftpPct > 0 ? ` · ${Math.round(pt.ftpPct * 100)}% FTP` : '';
                return [`${Math.round(Number(value))} W${pct}`, pt.label];
              }}
              cursor={{ stroke: accentSoft, strokeWidth: 1 }}
            />
          )}

          <Area
            dataKey="watts"
            type="linear"
            stroke={accent}
            strokeWidth={variant === 'thumbnail' ? 1 : 1.75}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            connectNulls
          />

          {showCursor && (
            <ReferenceLine
              x={cursorSec ?? 0}
              stroke={cursorClr}
              strokeWidth={variant === 'thumbnail' ? 1 : 2}
              label={
                variant === 'full'
                  ? { value: '▲', fill: cursorClr, position: 'top', fontSize: 10 }
                  : undefined
              }
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
