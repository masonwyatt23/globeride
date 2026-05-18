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

/**
 * A live elevation profile across the entire route, with the rider's current
 * position marked. Downsamples the route to ~200 points so the SVG stays
 * snappy even for hour-long alpine routes with 10 000+ trackpoints.
 */
export function ElevationProfile() {
  const route = useRideStore((s) => s.route);
  const distance = useRideStore((s) => s.distance);

  const series = useMemo(() => {
    if (!route) return [];
    const N = route.points.length;
    const targetPoints = 220;
    const step = Math.max(1, Math.floor(N / targetPoints));
    const out: { d: number; ele: number }[] = [];
    for (let i = 0; i < N; i += step) {
      const p = route.points[i];
      out.push({ d: p.distance, ele: p.ele });
    }
    // Always include the final point so the chart fills its x-axis cleanly.
    const last = route.points[N - 1];
    if (out[out.length - 1]?.d !== last.distance) out.push({ d: last.distance, ele: last.ele });
    return out;
  }, [route]);

  if (!route || series.length === 0) return null;

  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(199 89% 56%)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="hsl(199 89% 56%)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="d"
            type="number"
            domain={[0, route.totalDistance]}
            tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`}
            stroke="hsl(215 20% 65%)"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            height={18}
          />
          <YAxis
            dataKey="ele"
            stroke="hsl(215 20% 65%)"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={32}
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => `${Math.round(v)}`}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15, 23, 42, 0.92)',
              border: '1px solid hsl(215 28% 22%)',
              borderRadius: 8,
              color: 'hsl(210 40% 98%)',
              fontSize: 12,
            }}
            labelFormatter={(v) => `${(Number(v) / 1000).toFixed(2)} km`}
            formatter={(value) => [`${Math.round(Number(value))} m`, 'elevation']}
          />
          <Area
            dataKey="ele"
            type="monotone"
            stroke="hsl(199 89% 56%)"
            strokeWidth={1.5}
            fill="url(#elevFill)"
            isAnimationActive={false}
          />
          <ReferenceLine
            x={distance}
            stroke="hsl(161 84% 39%)"
            strokeWidth={2}
            label={{
              value: '●',
              fill: 'hsl(161 84% 39%)',
              position: 'top',
              fontSize: 16,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
