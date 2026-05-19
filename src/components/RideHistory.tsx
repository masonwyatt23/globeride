/**
 * RideHistory — Training Log panel.
 *
 * Lists past rides from IndexedDB with:
 *   - Name, date, duration, distance, avg power, workout tag
 *   - Delete action
 *   - Re-ride / Replay action (loads the saved samples via the existing
 *     loadReplay path so the globe re-runs the same track)
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Trash2,
  RotateCcw,
  Zap,
  Route,
  ChevronDown,
  History,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDistance, formatDuration } from '@/lib/utils';
import { listRides, deleteRide } from '@/lib/rideHistory';
import type { RideRecord } from '@/lib/rideHistory';
import { useRideStore } from '@/stores/rideStore';
import type { ParsedFit } from '@/lib/fitParser';

const MAX_VISIBLE_DEFAULT = 5;

function formatDate(unixMs: number): string {
  return new Date(unixMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sourceLabel(source: RideRecord['source']): string {
  switch (source) {
    case 'workout': return 'Structured';
    case 'replay':  return 'Replay';
    default:        return 'Route';
  }
}

/**
 * Convert a RideRecord's sample array into a shape that matches ParsedFit
 * closely enough for loadReplay() to accept it. The route is reconstructed
 * from the sample lat/lon/ele/distance data.
 */
function rideRecordToReplayFit(record: RideRecord): ParsedFit {
  const { samples } = record;

  const points = samples.map((s) => ({
    lat: s.lat,
    lon: s.lon,
    ele: s.ele,
    distance: s.distance,
  }));

  const lastDist = samples.length > 0 ? samples[samples.length - 1].distance : 0;

  // Compute ascent / descent
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
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    listRides()
      .then(setRides)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load history'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = useCallback(async (id: string) => {
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id);
      return;
    }
    try {
      await deleteRide(id);
      setRides((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete ride');
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId]);

  const handleReplay = useCallback((record: RideRecord) => {
    if (record.samples.length === 0) return;
    const fit = rideRecordToReplayFit(record);
    loadReplay(fit);
    navigate('/ride');
  }, [loadReplay, navigate]);

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground py-2', className)}>
        <Loader2 className="h-4 w-4 animate-[spinSlow_1.5s_linear_infinite]" />
        Loading training log…
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-xs text-destructive', className)}>
        {error}
      </div>
    );
  }

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
    <div className={cn('flex flex-col gap-2', className)}>
      <ul className="flex flex-col gap-2">
        {visible.map((r) => {
          const isPendingDelete = pendingDeleteId === r.id;
          return (
            <li
              key={r.id}
              className="group flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card/40 p-3 hover:border-primary/35 hover:bg-card/60 transition-all duration-150"
            >
              {/* Header row */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {r.name}
                    </span>
                    {r.workoutName && (
                      <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                        {r.workoutName}
                      </Badge>
                    )}
                    <Badge variant="muted" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                      {sourceLabel(r.source)}
                    </Badge>
                  </div>
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

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 text-[11px] border-t border-border/40 pt-2.5">
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
                  {r.avgPower > 0 ? `${r.avgPower} W` : '—'}
                </RideStat>
                <RideStat label="Ascent">
                  <span className="text-emerald-600 dark:text-emerald-400">+{r.ascentM} m</span>
                </RideStat>
              </div>
            </li>
          );
        })}
      </ul>

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
    </div>
  );
}

function RideStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="num font-semibold text-foreground flex items-center gap-0.5">{children}</div>
    </div>
  );
}
