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

import { useRideStore } from '@/stores/rideStore';
import { useThemeStore } from '@/stores/themeStore';

/**
 * Live elevation profile across the entire route, with the rider's
 * current position marked. Downsamples to ~220 points for snappiness.
 */
export function ElevationProfile() {
  const route    = useRideStore((s) => s.route);
  const distance = useRideStore((s) => s.distance);
  const theme    = useThemeStore((s) => s.theme);
  const isDark   = theme === 'dark';

  const series = useMemo(() => {
    if (!route) return [];
    const N = route.points.length;
    const step = Math.max(1, Math.floor(N / 220));
    const out: { d: number; ele: number }[] = [];
    for (let i = 0; i < N; i += step) {
      const p = route.points[i];
      out.push({ d: p.distance, ele: p.ele });
    }
    const last = route.points[N - 1];
    if (out[out.length - 1]?.d !== last.distance) out.push({ d: last.distance, ele: last.ele });
    return out;
  }, [route]);

  if (!route || series.length === 0) return null;

  /* Theme-reactive tokens */
  const axisColor   = isDark ? 'hsl(215 18% 56%)' : 'hsl(215 15% 48%)';
  const primary     = isDark ? 'hsl(200 92% 56%)' : 'hsl(200 92% 42%)';
  const accent      = isDark ? 'hsl(158 80% 42%)' : 'hsl(158 80% 32%)';
  const tooltipBg   = isDark ? 'rgba(12, 18, 36, 0.94)' : 'rgba(255, 255, 255, 0.97)';
  const tooltipBrd  = isDark ? 'hsl(215 26% 17%)' : 'hsl(214 24% 86%)';
  const tooltipFg   = isDark ? 'hsl(210 28% 96%)' : 'hsl(220 40% 10%)';

  return (
    <div className="h-28 sm:h-32 w-full min-w-0" style={{ minHeight: '6rem' }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={60} minHeight={80}>
        <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={primary} stopOpacity={isDark ? 0.50 : 0.38} />
              <stop offset="100%" stopColor={primary} stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="d"
            type="number"
            domain={[0, route.totalDistance]}
            tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`}
            stroke={axisColor}
            tick={{ fontSize: 10, fill: axisColor }}
            tickLine={false}
            axisLine={false}
            height={18}
          />
          <YAxis
            dataKey="ele"
            stroke={axisColor}
            tick={{ fontSize: 10, fill: axisColor }}
            tickLine={false}
            axisLine={false}
            width={34}
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => `${Math.round(v)}`}
          />
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
            labelFormatter={(v) => `${(Number(v) / 1000).toFixed(2)} km`}
            formatter={(value) => [`${Math.round(Number(value))} m`, 'elevation']}
          />
          <Area
            dataKey="ele"
            type="monotone"
            stroke={primary}
            strokeWidth={1.75}
            fill="url(#elevFill)"
            isAnimationActive={false}
          />
          <ReferenceLine
            x={distance}
            stroke={accent}
            strokeWidth={2}
            label={{
              value: '▲',
              fill:  accent,
              position: 'top',
              fontSize: 10,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
