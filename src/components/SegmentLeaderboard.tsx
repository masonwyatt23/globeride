/**
 * SegmentLeaderboard — Personal segment records for the current route.
 *
 * Shows each detected segment with:
 *   - Segment name, distance, elevation gain, avg gradient badge
 *   - Personal Best time (highlighted gold when it's the newly-set PR)
 *   - Last attempt time + delta vs PR
 *   - Attempt history (expandable) — ranked list of all attempts
 *
 * This is a "local-only leaderboard": the rider races themselves.
 *
 * Mounting: import and render inside the Home page alongside RideHistory,
 * wrapped in a route-aware guard (only show when a route is loaded).
 *
 *   import { SegmentLeaderboard } from '@/components/SegmentLeaderboard';
 *   // in Home.tsx, after the RideHistory section:
 *   {route && <SegmentLeaderboard route={route} className="..." />}
 */

import { useMemo, useState, useCallback } from 'react';
import {
  Trophy,
  ChevronDown,
  ChevronRight,
  Mountain,
  Timer,
  TrendingUp,
  Flag,
  Flame,
  Medal,
} from 'lucide-react';

import { cn, formatDuration, formatDistance } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { detectSegments } from '@/lib/segments';
import { useSegmentStore } from '@/stores/segmentStore';
import type { Route } from '@/types';
import type { Segment } from '@/lib/segments';
import type { SegmentRecord, SegmentAttempt } from '@/stores/segmentStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  route: Route;
  className?: string;
  /** When truthy, flash the newly-set PR for these segment IDs. */
  newPrIds?: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatGradient(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function formatDelta(timeSec: number, prSec: number): string {
  const delta = timeSec - prSec;
  if (delta === 0) return '= PR';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${formatDuration(Math.abs(delta))}`;
}

function gradientBadgeVariant(avgGradient: number): 'success' | 'warning' | 'destructive' | 'muted' {
  if (avgGradient >= 10) return 'destructive';
  if (avgGradient >= 6)  return 'warning';
  if (avgGradient >= 3)  return 'success';
  return 'muted';
}

function segmentIcon(seg: Segment) {
  if (seg.kind === 'full') return <Flag className="h-3.5 w-3.5 text-primary shrink-0" />;
  if (seg.avgGradient >= 8) return <Flame className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
  return <Mountain className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
}

// ---------------------------------------------------------------------------
// AttemptRow
// ---------------------------------------------------------------------------

function AttemptRow({
  attempt,
  rank,
  bestTimeSec,
}: {
  attempt: SegmentAttempt;
  rank: number;
  bestTimeSec: number;
}) {
  const isPr = attempt.timeSec === bestTimeSec && rank === 1;
  const delta = rank === 1 ? null : attempt.timeSec - bestTimeSec;

  return (
    <div className="flex items-center justify-between py-1 text-[11px] border-b border-border/30 last:border-0">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'num w-4 text-right font-semibold shrink-0',
            rank === 1
              ? 'text-amber-500'
              : rank === 2
              ? 'text-slate-400'
              : rank === 3
              ? 'text-amber-700'
              : 'text-muted-foreground',
          )}
        >
          {rank}
        </span>
        {isPr && <Trophy className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
        <span className="text-muted-foreground">
          {new Date(attempt.attemptedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {delta !== null && delta !== 0 && (
          <span className={cn('num', delta > 0 ? 'text-muted-foreground/70' : 'text-emerald-600 dark:text-emerald-400')}>
            {delta > 0 ? '+' : '−'}{formatDuration(Math.abs(delta))}
          </span>
        )}
        <span className={cn('num font-semibold', isPr ? 'text-amber-500' : 'text-foreground')}>
          {formatDuration(attempt.timeSec)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SegmentCard
// ---------------------------------------------------------------------------

function SegmentCard({
  seg,
  record,
  isNewPr,
}: {
  seg: Segment;
  record: SegmentRecord | undefined;
  isNewPr: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((p) => !p), []);

  const hasAttempts = record && record.attempts.length > 0;
  const lastAttempt = record?.attempts[0]; // newest first
  const isLastAttemptPr =
    lastAttempt && record && lastAttempt.timeSec === record.bestTimeSec;

  // Sort attempts by time ascending for the history ranking.
  const rankedAttempts = useMemo(() => {
    if (!record) return [];
    return [...record.attempts].sort((a, b) => a.timeSec - b.timeSec);
  }, [record]);

  return (
    <li
      className={cn(
        'group flex flex-col rounded-xl border bg-card/40 p-3 transition-all duration-200',
        isNewPr
          ? 'border-amber-400/60 bg-amber-500/5 shadow-[0_0_12px_-2px_rgba(251,191,36,0.25)]'
          : expanded
          ? 'border-primary/30 bg-card/60'
          : 'border-border/60 hover:border-primary/25 hover:bg-card/55',
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {segmentIcon(seg)}
            <button
              type="button"
              onClick={hasAttempts ? toggle : undefined}
              className={cn(
                'flex items-center gap-0.5 text-sm font-semibold text-foreground text-left truncate',
                hasAttempts && 'hover:text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded',
                !hasAttempts && 'cursor-default',
              )}
              disabled={!hasAttempts}
              aria-expanded={hasAttempts ? expanded : undefined}
              aria-label={hasAttempts ? (expanded ? `Collapse attempts for ${seg.name}` : `Expand attempts for ${seg.name}`) : undefined}
            >
              {hasAttempts && (
                <span className="shrink-0 text-muted-foreground">
                  {expanded
                    ? <ChevronDown className="h-3.5 w-3.5" />
                    : <ChevronRight className="h-3.5 w-3.5" />
                  }
                </span>
              )}
              <span className="truncate">{seg.name}</span>
            </button>

            {isNewPr && (
              <Badge variant="warning" className="text-[9px] px-1.5 py-0 h-4 animate-pulse shrink-0">
                New PR!
              </Badge>
            )}

            {seg.kind === 'full' && (
              <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                Full Route
              </Badge>
            )}

            {seg.kind === 'climb' && (
              <Badge
                variant={gradientBadgeVariant(seg.avgGradient)}
                className="text-[9px] px-1.5 py-0 h-4 shrink-0"
              >
                {formatGradient(seg.avgGradient)}
              </Badge>
            )}
          </div>

          {/* Sub-info */}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{formatDistance(seg.lengthM)}</span>
            {seg.ascentM > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">+{seg.ascentM} m</span>
            )}
          </div>
        </div>

        {/* PR badge */}
        {record && (
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-bold num',
                isNewPr ? 'text-amber-500' : 'text-foreground',
              )}
            >
              <Trophy className="h-3 w-3" />
              {formatDuration(record.bestTimeSec)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {record.attempts.length} attempt{record.attempts.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      {hasAttempts && (
        <div className="grid grid-cols-3 gap-2 text-[11px] border-t border-border/40 pt-2.5 mt-2.5">
          {/* Personal best */}
          <SegStat
            label="Personal Best"
            icon={<Medal className="h-3 w-3 text-amber-500 shrink-0" />}
          >
            <span className="text-amber-600 dark:text-amber-400 num font-bold">
              {formatDuration(record!.bestTimeSec)}
            </span>
          </SegStat>

          {/* Last attempt */}
          <SegStat
            label="Last Time"
            icon={<Timer className="h-3 w-3 shrink-0" />}
          >
            <span className="num font-semibold text-foreground">
              {formatDuration(lastAttempt!.timeSec)}
            </span>
            {!isLastAttemptPr && record && (
              <span
                className={cn(
                  'num text-[10px]',
                  lastAttempt!.timeSec < record.bestTimeSec
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground',
                )}
              >
                {formatDelta(lastAttempt!.timeSec, record.bestTimeSec)}
              </span>
            )}
          </SegStat>

          {/* Avg speed on segment implied from length/time */}
          <SegStat
            label="PR Speed"
            icon={<TrendingUp className="h-3 w-3 shrink-0" />}
          >
            <span className="num font-semibold text-foreground">
              {record && record.bestTimeSec > 0
                ? `${((seg.lengthM / record.bestTimeSec) * 3.6).toFixed(1)} km/h`
                : '—'}
            </span>
          </SegStat>
        </div>
      )}

      {/* Empty state */}
      {!hasAttempts && (
        <div className="mt-2.5 pt-2.5 border-t border-border/40 text-[11px] text-muted-foreground italic">
          No attempts yet — complete this route to set a time.
        </div>
      )}

      {/* Attempt history (expanded) */}
      {expanded && hasAttempts && (
        <div className="mt-3 pt-2.5 border-t border-border/40">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Attempt history ({record!.attempts.length})
          </div>
          <div className="flex flex-col">
            {rankedAttempts.map((attempt, i) => (
              <AttemptRow
                key={`${attempt.attemptedAt}-${i}`}
                attempt={attempt}
                rank={i + 1}
                bestTimeSec={record!.bestTimeSec}
              />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SegmentLeaderboard({ route, className, newPrIds }: Props) {
  const records = useSegmentStore((s) => s.records);

  const segments = useMemo(() => detectSegments(route), [route]);

  if (segments.length === 0) {
    return null;
  }

  const attemptedCount = segments.filter((s) => !!records[s.id]).length;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-foreground">
            Personal Records
          </span>
        </div>
        {attemptedCount > 0 && (
          <span className="text-[11px] text-muted-foreground num">
            {attemptedCount}/{segments.length} segments attempted
          </span>
        )}
      </div>

      {/* Segment list */}
      <ul className="flex flex-col gap-2">
        {segments.map((seg) => (
          <SegmentCard
            key={seg.id}
            seg={seg}
            record={records[seg.id]}
            isNewPr={newPrIds?.has(seg.id) ?? false}
          />
        ))}
      </ul>

      {/* Footer context */}
      {attemptedCount === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center">
          <Timer className="h-7 w-7 text-muted-foreground/50" />
          <div className="text-sm font-semibold text-foreground">Beat your own clock</div>
          <div className="text-xs text-muted-foreground max-w-[28ch] leading-relaxed">
            Ride this route to set personal records on {segments.length} segment{segments.length !== 1 ? 's' : ''}. Your best times are stored locally.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-component
// ---------------------------------------------------------------------------

function SegStat({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5 text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-1 font-semibold text-foreground">
        {children}
      </div>
    </div>
  );
}
