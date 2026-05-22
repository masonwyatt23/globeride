/**
 * RideHistory — Rich Training Log panel.
 *
 * Features:
 *   - Trend summary strip: this-week distance, all-time distance, total rides,
 *     best power, total ascent
 *   - Per-ride cards: date, distance, duration, elevation gain, avg power,
 *     avg speed, source badge, workout tag
 *   - Per-ride expandable detail: speed chart sparkline, per-metric drill-down
 *   - One-tap replay (existing behaviour preserved)
 *   - Confirm-before-delete (existing behaviour preserved)
 *   - Show more / less pagination
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Trash2,
  RotateCcw,
  Zap,
  Route,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  TrendingUp,
  Mountain,
  Gauge,
  Calendar,
  BarChart2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDistance, formatDuration } from '@/lib/utils';
import { listRides, deleteRide } from '@/lib/rideHistory';
import type { RideRecord } from '@/lib/rideHistory';
import { useRideStore } from '@/stores/rideStore';
import type { ParsedFit } from '@/lib/fitParser';

const MAX_VISIBLE_DEFAULT = 5;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(unixMs: number): string {
  return new Date(unixMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSpeed(ms: number): string {
  const kmh = ms * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

function formatPower(w: number): string {
  return w > 0 ? `${w} W` : '—';
}

function sourceLabel(source: RideRecord['source']): string {
  switch (source) {
    case 'workout': return 'Structured';
    case 'replay':  return 'Replay';
    default:        return 'Route';
  }
}

function sourceBadgeVariant(source: RideRecord['source']): 'default' | 'accent' | 'muted' {
  switch (source) {
    case 'workout': return 'default';
    case 'replay':  return 'accent';
    default:        return 'muted';
  }
}

// ---------------------------------------------------------------------------
// Trend computation
// ---------------------------------------------------------------------------

interface TrendStats {
  totalRides: number;
  totalDistanceM: number;
  totalDurationSec: number;
  totalAscentM: number;
  bestPowerW: number;
  weekDistanceM: number;
  weekRides: number;
}

function computeTrends(rides: RideRecord[]): TrendStats {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  let totalDistanceM = 0;
  let totalDurationSec = 0;
  let totalAscentM = 0;
  let bestPowerW = 0;
  let weekDistanceM = 0;
  let weekRides = 0;

  for (const r of rides) {
    totalDistanceM += r.distanceM;
    totalDurationSec += r.durationSec;
    totalAscentM += r.ascentM;
    if (r.avgPower > bestPowerW) bestPowerW = r.avgPower;
    if (r.startedAt >= weekAgo) {
      weekDistanceM += r.distanceM;
      weekRides += 1;
    }
  }

  return {
    totalRides: rides.length,
    totalDistanceM,
    totalDurationSec,
    totalAscentM,
    bestPowerW,
    weekDistanceM,
    weekRides,
  };
}

// ---------------------------------------------------------------------------
// Replay helper (unchanged from original)
// ---------------------------------------------------------------------------

function rideRecordToReplayFit(record: RideRecord): ParsedFit {
  const { samples } = record;

  const points = samples.map((s) => ({
    lat: s.lat,
    lon: s.lon,
    ele: s.ele,
    distance: s.distance,
  }));

  const lastDist = samples.length > 0 ? samples[samples.length - 1].distance : 0;

  let ascent = 0;
  let descent = 0;
  let minEle = points[0]?.ele ?? 0;
  let maxEle = points[0]?.ele ?? 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].ele - points[i - 1].ele;
    if (delta > 0) ascent += delta;
    else descent += Math.abs(delta);
    if (points[i].ele < minEle) minEle = points[i].ele;
    if (points[i].ele > maxEle) maxEle = points[i].ele;
  }

  const route = {
    id: `replay-${record.id}`,
    name: record.name,
    points,
    totalDistance: lastDist,
    ascent,
    descent,
    minElevation: minEle,
    maxElevation: maxEle,
    loadedAt: record.startedAt,
  };

  return {
    route,
    samples,
    startTimeMs: record.startedAt,
  };
}

// ---------------------------------------------------------------------------
// Tiny sparkline — SVG path from an array of numbers
// ---------------------------------------------------------------------------

function Sparkline({
  values,
  className,
  color = 'currentColor',
}: {
  values: number[];
  className?: string;
  color?: string;
}) {
  if (values.length < 2) return null;

  const W = 80;
  const H = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Trend summary strip
// ---------------------------------------------------------------------------

function TrendStrip({ stats }: { stats: TrendStats }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <TrendCell
        icon={<Calendar className="h-3.5 w-3.5 text-primary" />}
        label="This week"
        value={formatDistance(stats.weekDistanceM)}
        sub={`${stats.weekRides} ride${stats.weekRides !== 1 ? 's' : ''}`}
      />
      <TrendCell
        icon={<Route className="h-3.5 w-3.5 text-cyan-500" />}
        label="All-time"
        value={formatDistance(stats.totalDistanceM)}
        sub={`${stats.totalRides} rides`}
      />
      <TrendCell
        icon={<Mountain className="h-3.5 w-3.5 text-emerald-500" />}
        label="Total ascent"
        value={`${stats.totalAscentM.toLocaleString()} m`}
        sub={formatDuration(stats.totalDurationSec)}
      />
      <TrendCell
        icon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
        label="Best avg power"
        value={formatPower(stats.bestPowerW)}
        sub="peak ride"
      />
    </div>
  );
}

function TrendCell({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/50 bg-card/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="num text-base font-bold text-foreground leading-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-ride expanded detail
// ---------------------------------------------------------------------------

function RideDetail({ record }: { record: RideRecord }) {
  const { samples } = record;

  // Downsample power / speed for sparklines (max 60 points)
  const downsampled = useMemo(() => {
    if (samples.length === 0) return { power: [], speed: [], grade: [] };
    const step = Math.max(1, Math.floor(samples.length / 60));
    const power: number[] = [];
    const speed: number[] = [];
    const grade: number[] = [];
    for (let i = 0; i < samples.length; i += step) {
      power.push(samples[i].power ?? 0);
      speed.push(samples[i].speed * 3.6); // to km/h
      grade.push(samples[i].grade);
    }
    return { power, speed, grade };
  }, [samples]);

  const hasPower = record.avgPower > 0;
  const lastSample = samples[samples.length - 1];
  const maxSpeed = samples.length > 0
    ? Math.max(...samples.map((s) => s.speed)) * 3.6
    : 0;
  const maxPower = hasPower
    ? Math.max(...samples.map((s) => s.power ?? 0))
    : 0;

  return (
    <div className="flex flex-col gap-3 pt-2.5 border-t border-border/40 mt-0.5">
      {/* Extended stats grid */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <DetailCell label="Avg speed" value={formatSpeed(record.avgSpeed)} icon={<Gauge className="h-3 w-3" />} />
        <DetailCell label="Max speed" value={maxSpeed > 0 ? `${maxSpeed.toFixed(1)} km/h` : '—'} icon={<TrendingUp className="h-3 w-3" />} />
        <DetailCell label="Ascent" value={`+${record.ascentM} m`} icon={<Mountain className="h-3 w-3 text-emerald-500" />} />
        {hasPower && (
          <>
            <DetailCell label="Avg power" value={`${record.avgPower} W`} icon={<Zap className="h-3 w-3 text-amber-500" />} />
            <DetailCell label="Max power" value={`${maxPower} W`} icon={<Zap className="h-3 w-3 text-amber-400" />} />
          </>
        )}
        <DetailCell label="Samples" value={record.sampleCount.toLocaleString()} icon={<BarChart2 className="h-3 w-3" />} />
      </div>

      {/* Sparklines */}
      {samples.length >= 4 && (
        <div className="grid grid-cols-2 gap-2">
          {hasPower && downsampled.power.some((v) => v > 0) && (
            <SparkCard label="Power" unit="W" values={downsampled.power} color="#f59e0b" />
          )}
          <SparkCard label="Speed" unit="km/h" values={downsampled.speed} color="#22d3ee" />
          {downsampled.grade.some((v) => Math.abs(v) > 0.1) && (
            <SparkCard label="Grade" unit="%" values={downsampled.grade} color="#10b981" />
          )}
        </div>
      )}

      {/* Last known position */}
      {lastSample && (lastSample.lat !== 0 || lastSample.lon !== 0) && (
        <div className="text-[10px] text-muted-foreground">
          Last position: {lastSample.lat.toFixed(5)}°, {lastSample.lon.toFixed(5)}°
        </div>
      )}
    </div>
  );
}

function DetailCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5 text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="num font-semibold text-foreground">{value}</div>
    </div>
  );
}

function SparkCard({
  label,
  unit,
  values,
  color,
}: {
  label: string;
  unit: string;
  values: number[];
  color: string;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2 flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="num text-foreground">{max.toFixed(1)} {unit}</span>
      </div>
      <Sparkline values={values} color={color} className="w-full h-6" />
      <div className="flex items-center justify-between text-[9px] text-muted-foreground/70 num">
        <span>{min.toFixed(1)}</span>
        <span>{max.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RideHistoryProps {
  className?: string;
}

export function RideHistory({ className }: RideHistoryProps) {
  const navigate = useNavigate();
  const loadReplay = useRideStore((s) => s.loadReplay);

  const [rides, setRides] = useState<RideRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    listRides()
      .then(setRides)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load history'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const trends = useMemo(() => computeTrends(rides), [rides]);

  const handleDelete = useCallback(async (id: string) => {
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id);
      return;
    }
    try {
      await deleteRide(id);
      setRides((prev) => prev.filter((r) => r.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete ride');
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, expandedId]);

  const handleReplay = useCallback((record: RideRecord) => {
    if (record.samples.length === 0) return;
    const fit = rideRecordToReplayFit(record);
    loadReplay(fit);
    navigate('/ride');
  }, [loadReplay, navigate]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ---- Loading ----
  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground py-2', className)}>
        <Loader2 className="h-4 w-4 animate-[spinSlow_1.5s_linear_infinite]" />
        Loading training log…
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-xs text-destructive', className)}>
        {error}
      </div>
    );
  }

  // ---- Empty ----
  if (rides.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-7 text-center', className)}>
        <History className="h-7 w-7 text-muted-foreground/50" />
        <div className="text-sm font-semibold text-foreground">No rides yet</div>
        <div className="text-xs text-muted-foreground max-w-[24ch] leading-relaxed">
          Completed rides will appear here automatically.
        </div>
      </div>
    );
  }

  const visible = showAll ? rides : rides.slice(0, MAX_VISIBLE_DEFAULT);
  const hasMore = rides.length > MAX_VISIBLE_DEFAULT;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Trend summary — only shown when there's meaningful data */}
      {rides.length >= 1 && <TrendStrip stats={trends} />}

      {/* Ride list */}
      <ul className="flex flex-col gap-2">
        {visible.map((r) => {
          const isPendingDelete = pendingDeleteId === r.id;
          const isExpanded = expandedId === r.id;
          const hasDetail = r.samples.length > 0;

          return (
            <li
              key={r.id}
              className={cn(
                'group flex flex-col rounded-xl border border-border/60 bg-card/40 p-3 transition-all duration-150',
                isExpanded
                  ? 'border-primary/30 bg-card/60 shadow-sm'
                  : 'hover:border-primary/25 hover:bg-card/55',
              )}
            >
              {/* Header row */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {/* Title + badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Expand toggle — title is the clickable area */}
                    <button
                      type="button"
                      onClick={() => hasDetail && toggleExpand(r.id)}
                      className={cn(
                        'flex items-center gap-0.5 text-sm font-semibold text-foreground truncate text-left',
                        hasDetail && 'hover:text-primary transition-colors cursor-pointer',
                        !hasDetail && 'cursor-default',
                      )}
                      disabled={!hasDetail}
                      aria-expanded={isExpanded}
                    >
                      {hasDetail && (
                        <span className="shrink-0 text-muted-foreground">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />
                          }
                        </span>
                      )}
                      <span className="truncate">{r.name}</span>
                    </button>

                    {r.workoutName && (
                      <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                        {r.workoutName}
                      </Badge>
                    )}
                    <Badge variant={sourceBadgeVariant(r.source)} className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                      {sourceLabel(r.source)}
                    </Badge>
                  </div>

                  {/* Date */}
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDate(r.startedAt)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {r.samples.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 gap-1 text-xs"
                      onClick={() => handleReplay(r)}
                      title="Replay this ride on the globe"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Replay
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label={isPendingDelete ? 'Confirm delete' : `Delete ride ${r.name}`}
                    title={isPendingDelete ? 'Click again to confirm delete' : 'Delete from log'}
                    onClick={() => void handleDelete(r.id)}
                    onBlur={() => isPendingDelete && setPendingDeleteId(null)}
                    className={cn(
                      'p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      isPendingDelete
                        ? 'text-destructive'
                        : 'text-muted-foreground hover:text-destructive',
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Stats row — always visible */}
              <div className="grid grid-cols-4 gap-2 text-[11px] border-t border-border/40 pt-2.5 mt-2.5">
                <RideStat label="Distance">
                  <Route className="h-3 w-3 shrink-0" />
                  {formatDistance(r.distanceM)}
                </RideStat>
                <RideStat label="Time">
                  <Clock className="h-3 w-3 shrink-0" />
                  {formatDuration(r.durationSec)}
                </RideStat>
                <RideStat label="Avg Power">
                  <Zap className="h-3 w-3 shrink-0" />
                  {formatPower(r.avgPower)}
                </RideStat>
                <RideStat label="Ascent">
                  <span className="text-emerald-600 dark:text-emerald-400">+{r.ascentM} m</span>
                </RideStat>
              </div>

              {/* Expanded detail */}
              {isExpanded && hasDetail && <RideDetail record={r} />}
            </li>
          );
        })}
      </ul>

      {/* Show more / less */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-foreground text-xs"
          onClick={() => setShowAll((prev) => !prev)}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-180')} />
          {showAll ? 'Show fewer' : `Show ${rides.length - MAX_VISIBLE_DEFAULT} more`}
        </Button>
      )}

      {/* All-time footer */}
      {rides.length > 1 && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/30 pt-2">
          <span>{rides.length} rides · {formatDistance(trends.totalDistanceM)} total</span>
          <span>{formatDuration(trends.totalDurationSec)} riding time</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function RideStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="num font-semibold text-foreground flex items-center gap-0.5">{children}</div>
    </div>
  );
}
