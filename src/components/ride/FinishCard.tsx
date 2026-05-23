/**
 * FinishCard — emotional story-arc post-ride summary.
 *
 * Structure (top → bottom):
 *   1. Hero moment      — huge distance, route name, date, auto-generated headline
 *   2. Key trio         — NP / IF / TSS (power rides) or speed / ascent / work
 *   3. vs. Your Best    — single most-impressive comparison from ride history
 *   4. Workout segments — celebratory compliance grid (workout rides only)
 *   5. "Want the numbers?" — collapsible RideAnalytics panels
 *   6. Share + Actions  — ShareCard download + RideControls
 *
 * Design language: generous whitespace, cinematic distance number, glass +
 * cyan accent, staggered animate-fadeUp entries.
 */

import { useMemo, useState, useEffect } from 'react';
import {
  Trophy, Star, Mountain, Zap, Activity, Heart,
  BatteryCharging, ChevronDown, ChevronUp, TrendingUp,
  Award, Flame, Timer,
} from 'lucide-react';

import { useRideStore }     from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRideHistory }   from '@/hooks/useRideHistory';
import { RideAnalytics }    from '@/components/ride/RideAnalytics';
import { RideControls }     from '@/components/ride/RideControls';
import { ShareCard }        from '@/components/ride/ShareCard';
import { Badge }            from '@/components/ui/badge';
import { computeMetrics }   from '@/lib/metrics';
import { computePersonalRecords } from '@/lib/records';
import { formatDistance, formatDuration, msToKmh, cn } from '@/lib/utils';
import type { RideRecord } from '@/lib/rideHistory';

// ─── Compliance colour helpers ────────────────────────────────────────────────

function complianceColor(c: number | null): string {
  if (c === null) return 'text-muted-foreground';
  if (c >= 0.97) return 'text-emerald-400';
  if (c >= 0.85) return 'text-amber-400';
  return 'text-rose-400';
}

function complianceBg(c: number | null): string {
  if (c === null) return 'bg-muted/20';
  if (c >= 0.97) return 'bg-emerald-500/10 ring-1 ring-emerald-500/20';
  if (c >= 0.85) return 'bg-amber-500/10 ring-1 ring-amber-500/20';
  return 'bg-rose-500/10 ring-1 ring-rose-500/20';
}

function complianceEmoji(c: number | null): string {
  if (c === null) return '';
  if (c >= 0.97) return '✓';
  if (c >= 0.85) return '~';
  return '✗';
}

// ─── IF-zone classification ───────────────────────────────────────────────────

type ZoneVariant = 'muted' | 'success' | 'warning' | 'destructive' | 'accent';
function ifZone(if_: number): { label: string; variant: ZoneVariant } {
  if (if_ === 0)    return { label: 'No power data', variant: 'muted' };
  if (if_ < 0.75)   return { label: 'Recovery',      variant: 'muted' };
  if (if_ < 0.85)   return { label: 'Endurance',     variant: 'success' };
  if (if_ < 0.95)   return { label: 'Tempo',         variant: 'accent' };
  if (if_ < 1.05)   return { label: 'Threshold',     variant: 'warning' };
  return              { label: 'VO₂max+',             variant: 'destructive' };
}

// ─── Auto-generated ride headline ────────────────────────────────────────────

function buildHeadline(params: {
  routeName: string | undefined;
  durationSec: number;
  distanceM: number;
  avgPowerW: number;
  intensityFactor: number;
  tss: number;
  isFirstEver: boolean;
  isFastestOnRoute: boolean;
  isPowerPR: boolean;
  isLongestEver: boolean;
  variabilityIndex: number;
}): string {
  const {
    routeName, durationSec, distanceM, avgPowerW, intensityFactor, tss,
    isFirstEver, isFastestOnRoute, isPowerPR, isLongestEver, variabilityIndex,
  } = params;

  const dur = formatDuration(durationSec);
  const route = routeName ?? 'this route';

  // First-ever ride wins
  if (isFirstEver) {
    return `Your first GlobeRide — welcome to the road, keep it rolling`;
  }

  // Personal bests, most impressive first
  if (isPowerPR && avgPowerW > 0) {
    return `New power PR — ${Math.round(avgPowerW)} W average. Your strongest ride yet`;
  }
  if (isFastestOnRoute && durationSec > 0) {
    return `You crushed ${route} in ${dur} — your fastest time here`;
  }
  if (isLongestEver && distanceM > 0) {
    return `Furthest you've ever ridden — ${formatDistance(distanceM)} and counting`;
  }

  // Ride character based on IF
  if (intensityFactor >= 1.05) {
    return `Savage effort on ${route} — ${dur} at threshold-busting intensity`;
  }
  if (intensityFactor >= 0.95) {
    return `Threshold session complete — ${dur} at the edge of your limits`;
  }
  if (intensityFactor >= 0.85 && intensityFactor < 0.95) {
    // Detect pacing quality: VI close to 1.0 = very steady
    if (variabilityIndex < 1.05 && avgPowerW > 0) {
      return `Tempo ride, beautifully paced — ${dur} on ${route}`;
    }
    return `Solid tempo block on ${route} — ${dur} well ridden`;
  }
  if (intensityFactor > 0 && intensityFactor < 0.75) {
    if (tss < 50) return `Easy spin on ${route} — legs and lungs nicely recovered`;
    return `Long aerobic base ride — ${dur} building the engine`;
  }

  // Fallback: distance or duration character
  if (distanceM >= 80_000) {
    return `Epic ${formatDistance(distanceM)} — that's a serious day in the saddle`;
  }
  if (durationSec >= 3600) {
    return `Over an hour on ${route} — great endurance work`;
  }
  return `Solid ride on ${route} — ${dur} done and dusted`;
}

// ─── vs-Your-Best comparison picker ──────────────────────────────────────────

type BestCallout = {
  icon: React.ReactNode;
  label: string;
  current: string;
  best: string;
  isNew: boolean;
  detail?: string;
};

function pickBestCallout(params: {
  history: RideRecord[];
  currentDistanceM: number;
  currentDurationSec: number;
  avgPowerW: number;
  tss: number;
  ftpW: number;
  routeName: string | undefined;
  weeklyTss: number;
}): BestCallout | null {
  const { history, currentDistanceM, currentDurationSec, avgPowerW, tss, ftpW, routeName, weeklyTss } = params;

  if (history.length === 0) return null; // first ride handled by headline

  const prs = computePersonalRecords(history, ftpW);

  // Priority 1: new power PR
  if (avgPowerW > 0 && avgPowerW > prs.highestAvgPowerW.value) {
    return {
      icon: <Zap className="h-5 w-5 text-amber-400" />,
      label: 'New Power PR',
      current: `${Math.round(avgPowerW)} W`,
      best: `Prev: ${prs.highestAvgPowerW.value > 0 ? Math.round(prs.highestAvgPowerW.value) + ' W' : '—'}`,
      isNew: true,
      detail: 'Highest avg power you\'ve ever held across a ride',
    };
  }

  // Priority 2: longest ride ever
  if (currentDistanceM > prs.longestDistanceM.value) {
    return {
      icon: <TrendingUp className="h-5 w-5 text-cyan-400" />,
      label: 'Longest Ride Ever',
      current: formatDistance(currentDistanceM),
      best: `Prev: ${formatDistance(prs.longestDistanceM.value)}`,
      isNew: true,
      detail: 'You went further than ever before',
    };
  }

  // Priority 3: highest TSS
  if (tss > 0 && tss > prs.mostTss.value) {
    return {
      icon: <Flame className="h-5 w-5 text-orange-400" />,
      label: 'Highest TSS Ever',
      current: `${Math.round(tss)} TSS`,
      best: `Prev: ${Math.round(prs.mostTss.value)} TSS`,
      isNew: true,
      detail: 'Most training stress you\'ve accumulated in one ride',
    };
  }

  // Priority 4: fastest on this route (compare duration on same-named route)
  const sameRoute = routeName
    ? history.filter((r) => r.name === routeName && r.durationSec > 0)
    : [];
  if (sameRoute.length > 0 && currentDurationSec > 0) {
    const fastest = Math.min(...sameRoute.map((r) => r.durationSec));
    if (currentDurationSec < fastest) {
      return {
        icon: <Timer className="h-5 w-5 text-emerald-400" />,
        label: `Fastest on ${routeName ?? 'this route'}`,
        current: formatDuration(currentDurationSec),
        best: `Prev: ${formatDuration(fastest)}`,
        isNew: true,
        detail: `Beat your previous best by ${formatDuration(fastest - currentDurationSec)}`,
      };
    }
    // Show current standing even if not a PR
    return {
      icon: <Timer className="h-5 w-5 text-muted-foreground" />,
      label: `vs. Best on ${routeName ?? 'this route'}`,
      current: formatDuration(currentDurationSec),
      best: `Best: ${formatDuration(fastest)}`,
      isNew: false,
      detail: `${fastest - currentDurationSec > 0 ? formatDuration(fastest - currentDurationSec) + ' off your best' : 'Matched your best!'}`,
    };
  }

  // Priority 5: weekly TSS milestone
  if (weeklyTss >= 400) {
    return {
      icon: <Award className="h-5 w-5 text-purple-400" />,
      label: 'Big training week',
      current: `${Math.round(weeklyTss)} TSS this week`,
      best: 'That\'s a full training load',
      isNew: false,
      detail: '400+ TSS in a week — solid fitness block',
    };
  }

  // Priority 6: show personal distance PR as context
  if (prs.longestDistanceM.value > 0) {
    return {
      icon: <TrendingUp className="h-5 w-5 text-muted-foreground" />,
      label: 'Distance',
      current: formatDistance(currentDistanceM),
      best: `Best: ${formatDistance(prs.longestDistanceM.value)}`,
      isNew: false,
    };
  }

  return null;
}

// ─── Staggered fade-up wrapper ────────────────────────────────────────────────

function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('animate-fadeUp', className)}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {children}
    </div>
  );
}

// ─── Collapsible analytics section ───────────────────────────────────────────

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  delay = 0,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  delay?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <FadeUp delay={delay}>
      <div className="rounded-2xl border border-border/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold',
            'transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-inset focus-visible:ring-accent/60',
            open ? 'bg-muted/20 text-foreground' : 'text-muted-foreground',
          )}
          aria-expanded={open}
        >
          <span>{title}</span>
          {open
            ? <ChevronUp className="h-4 w-4 opacity-60" aria-hidden="true" />
            : <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
          }
        </button>
        {open && (
          <div className="px-4 pb-4 pt-1">
            {children}
          </div>
        )}
      </div>
    </FadeUp>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FinishCard() {
  const distance      = useRideStore((s) => s.distance);
  const elapsedMs     = useRideStore((s) => s.elapsedMs);
  const samples       = useRideStore((s) => s.samples);
  const route         = useRideStore((s) => s.route);
  const startedAt     = useRideStore((s) => s.startedAt);
  const activeWorkout = useRideStore((s) => s.activeWorkout);
  const ftpW          = useSettingsStore((s) => s.ftpW);

  const { rides: history } = useRideHistory();

  // Delay loading history for a beat so the hero renders first
  const [historyReady, setHistoryReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHistoryReady(true), 400);
    return () => clearTimeout(t);
  }, []);

  const metrics = useMemo(
    () => computeMetrics(samples, ftpW, activeWorkout),
    [samples, ftpW, activeWorkout],
  );

  const avgSpeed =
    samples.length > 0
      ? samples.reduce((a, s) => a + (s.speed ?? 0), 0) / samples.length
      : 0;

  const durationSec = elapsedMs / 1000;

  // ---- Ride date ----
  const rideDate = useMemo(() => {
    const ms = startedAt ?? Date.now();
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [startedAt]);

  // ---- PRs / history context (only computed once history is ready) ----
  const prContext = useMemo(() => {
    if (!historyReady) return null;
    // History from the hook includes the just-finished ride written by
    // useRideHistoryRecorder, but we compare excluding the current ride
    // (same startedAt) to avoid false "new PR" against self.
    const prior = history.filter((r) => r.startedAt !== (startedAt ?? 0));

    const prs = computePersonalRecords(prior, ftpW);

    const isFirstEver    = prior.length === 0;
    const isPowerPR      = metrics.avgPowerW > 0 && metrics.avgPowerW > prs.highestAvgPowerW.value;
    const isLongestEver  = distance > prs.longestDistanceM.value;
    const isFastestOnRoute = (() => {
      if (!route?.name) return false;
      const same = prior.filter((r) => r.name === route.name && r.durationSec > 0);
      if (same.length === 0) return false;
      return durationSec < Math.min(...same.map((r) => r.durationSec));
    })();

    // Weekly TSS: sum TSS from rides in same ISO week as this ride
    const weeklyTss = (() => {
      const now = startedAt ?? Date.now();
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const weekStart = now - (now % weekMs);
      const weekRides = history.filter((r) => r.startedAt >= weekStart);
      return weekRides.reduce((acc, r) => {
        if (ftpW <= 0 || r.avgPower <= 0) return acc;
        const if_ = r.avgPower / ftpW;
        return acc + (r.durationSec * r.avgPower * if_) / (ftpW * 3600) * 100;
      }, 0) + metrics.tss;
    })();

    const headline = buildHeadline({
      routeName: route?.name,
      durationSec,
      distanceM: distance,
      avgPowerW: metrics.avgPowerW,
      intensityFactor: metrics.intensityFactor,
      tss: metrics.tss,
      isFirstEver,
      isFastestOnRoute,
      isPowerPR,
      isLongestEver,
      variabilityIndex: metrics.variabilityIndex,
    });

    const bestCallout = pickBestCallout({
      history: prior,
      currentDistanceM: distance,
      currentDurationSec: durationSec,
      avgPowerW: metrics.avgPowerW,
      tss: metrics.tss,
      ftpW,
      routeName: route?.name,
      weeklyTss,
    });

    return { isFirstEver, isPowerPR, isLongestEver, isFastestOnRoute, headline, bestCallout };
  }, [historyReady, history, startedAt, ftpW, metrics, distance, durationSec, route]);

  const zone = ifZone(metrics.intensityFactor);

  // Format distance for hero — huge number
  const heroDistance = distance >= 1000
    ? `${(distance / 1000).toFixed(1)}`
    : `${Math.round(distance)}`;
  const heroDistanceUnit = distance >= 1000 ? 'km' : 'm';

  const hasPower    = metrics.avgPowerW > 0;
  const hasWorkout  = metrics.segments.length > 0;

  return (
    <div
      className="absolute inset-0 flex items-start sm:items-center justify-center bg-background/80 backdrop-blur-md p-3 sm:p-6 z-20 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Ride complete — summary"
    >
      <div className="max-w-lg w-full my-auto mt-4 sm:mt-0 flex flex-col gap-4">

        {/* ── 1. HERO MOMENT ─────────────────────────────────────────────── */}
        <FadeUp delay={0}>
          <div className="glass glass-hairline rounded-3xl px-6 py-8 sm:px-8 sm:py-10 flex flex-col items-center text-center gap-4 ring-halo relative overflow-hidden">

            {/* Trophy + sparkle */}
            <div className="relative" aria-hidden="true">
              <div className="rounded-full bg-accent/15 p-4 text-accent ring-1 ring-accent/30 shadow-[0_0_40px_-10px_hsl(var(--accent)/0.55)]">
                <Trophy className="h-8 w-8" />
              </div>
              <Star className="absolute -top-1.5 -right-1.5 h-5 w-5 text-amber-400 fill-current opacity-90" />
              <Star className="absolute -bottom-1 -left-1 h-3.5 w-3.5 text-amber-300 fill-current opacity-70" />
            </div>

            {/* Giant distance */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="num font-black tabular-nums leading-none tracking-tight text-foreground"
                style={{ fontSize: 'clamp(4rem, 14vw, 6rem)' }}
                aria-label={`${heroDistance} ${heroDistanceUnit} completed`}
              >
                {heroDistance}
                <span
                  className="text-accent ml-1"
                  style={{ fontSize: 'clamp(2rem, 7vw, 3rem)' }}
                  aria-hidden="true"
                >
                  {heroDistanceUnit}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-semibold tabular-nums num text-muted-foreground/80">
                {formatDuration(durationSec)}
              </div>
            </div>

            {/* Route name + date */}
            <div className="flex flex-col items-center gap-1">
              {route?.name && (
                <div className="text-base sm:text-lg font-semibold text-foreground/90 truncate max-w-full px-2">
                  {route.name}
                </div>
              )}
              <div className="text-xs text-muted-foreground">{rideDate}</div>
            </div>

            {/* Zone badge */}
            {zone.label !== 'No power data' && (
              <Badge variant={zone.variant} className="text-xs px-3 py-1">
                {zone.label}
              </Badge>
            )}

            {/* Auto-generated headline — appears once history loads */}
            {prContext && (
              <p className="text-sm text-muted-foreground/90 italic max-w-sm leading-relaxed animate-fadeUp" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
                "{prContext.headline}"
              </p>
            )}

            {/* Subtle glow orb behind the number */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
              style={{
                background: 'radial-gradient(ellipse 60% 40% at 50% 30%, hsl(var(--accent)/0.07) 0%, transparent 70%)',
              }}
            />
          </div>
        </FadeUp>

        {/* ── 2. KEY METRICS TRIO ────────────────────────────────────────── */}
        <FadeUp delay={80}>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Key ride metrics">
            {hasPower ? (
              <>
                <MetricPill label="NP" value={`${metrics.normalizedPowerW}`} unit="W" tooltip="Normalized Power" accent />
                <MetricPill label="IF" value={metrics.intensityFactor.toFixed(2)} unit="" tooltip="Intensity Factor" />
                <MetricPill label="TSS" value={`${Math.round(metrics.tss)}`} unit="" tooltip="Training Stress Score" />
              </>
            ) : (
              <>
                <MetricPill
                  label="Speed"
                  value={msToKmh(avgSpeed).toFixed(1)}
                  unit="km/h"
                  tooltip="Average speed"
                />
                <MetricPill
                  label="Ascent"
                  value={`${Math.round(metrics.totalAscentM)}`}
                  unit="m"
                  tooltip="Total elevation gain"
                  icon={<Mountain className="h-3.5 w-3.5 text-emerald-400" />}
                />
                <MetricPill
                  label="Time"
                  value={formatDuration(durationSec)}
                  unit=""
                  tooltip="Total ride time"
                />
              </>
            )}
          </div>
        </FadeUp>

        {/* ── 3. vs. YOUR BEST ──────────────────────────────────────────── */}
        {prContext && (prContext.isFirstEver ? (
          <FadeUp delay={160}>
            <div className="glass glass-hairline rounded-2xl px-5 py-4 flex items-center gap-4 border border-accent/20">
              <div className="shrink-0 text-2xl" aria-hidden="true">🌍</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-widest text-accent font-semibold mb-0.5">First Ride</div>
                <div className="text-sm font-semibold text-foreground">Welcome to GlobeRide!</div>
                <div className="text-xs text-muted-foreground">You just completed your first ride. The road starts here.</div>
              </div>
            </div>
          </FadeUp>
        ) : prContext.bestCallout ? (
          <FadeUp delay={160}>
            <BestCalloutCard callout={prContext.bestCallout} />
          </FadeUp>
        ) : null)}

        {/* ── 4. WORKOUT COMPLIANCE (if applicable) ─────────────────────── */}
        {hasWorkout && (
          <FadeUp delay={240}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Workout Segments</div>
                {/* Overall compliance badge */}
                {(() => {
                  const compliances = metrics.segments
                    .map((s) => s.compliance)
                    .filter((c): c is number => c !== null);
                  if (compliances.length === 0) return null;
                  const avg = compliances.reduce((a, b) => a + b, 0) / compliances.length;
                  const pct = Math.round(avg * 100);
                  return (
                    <span className={cn('text-xs font-bold tabular-nums', complianceColor(avg))}>
                      {pct}% overall
                    </span>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {metrics.segments.map((seg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-xl px-3 py-2.5 flex flex-col gap-1',
                      complianceBg(seg.compliance),
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">
                      {seg.label}
                    </div>
                    <div className={cn('text-xl font-black tabular-nums num leading-none', complianceColor(seg.compliance))}>
                      {seg.compliance !== null ? `${Math.round(seg.compliance * 100)}%` : '—'}
                      <span className="ml-1 text-sm" aria-hidden="true">{complianceEmoji(seg.compliance)}</span>
                    </div>
                    {seg.targetW !== null && seg.actualW !== null && (
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {Math.round(seg.actualW)} W <span className="opacity-60">/ {seg.targetW} W</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        )}

        {/* ── 5. SECONDARY STATS (always visible, compact) ──────────────── */}
        <FadeUp delay={300}>
          <div
            className="grid grid-cols-2 xs:grid-cols-4 gap-1 rounded-2xl bg-muted/25 px-3 py-3"
            role="list"
            aria-label="Additional ride statistics"
          >
            {hasPower && (
              <>
                <SmallStat
                  icon={<Zap className="h-3 w-3 text-amber-400" />}
                  label="Avg W"
                  value={`${Math.round(metrics.avgPowerW)}`}
                />
                <SmallStat
                  icon={<Zap className="h-3 w-3 text-rose-400" />}
                  label="Max W"
                  value={`${metrics.maxPowerW}`}
                />
              </>
            )}
            {metrics.avgHrBpm > 0 && (
              <SmallStat
                icon={<Heart className="h-3 w-3 text-rose-500" />}
                label="Avg HR"
                value={`${metrics.avgHrBpm}`}
                unit="bpm"
              />
            )}
            {metrics.avgCadenceRpm > 0 && (
              <SmallStat
                icon={<Activity className="h-3 w-3 text-primary" />}
                label="Cadence"
                value={`${metrics.avgCadenceRpm}`}
                unit="rpm"
              />
            )}
            <SmallStat
              icon={<Mountain className="h-3 w-3 text-emerald-500" />}
              label="Ascent"
              value={`${Math.round(metrics.totalAscentM)}`}
              unit="m"
            />
            {metrics.workKj > 0 && (
              <SmallStat
                icon={<BatteryCharging className="h-3 w-3 text-sky-400" />}
                label="Work"
                value={`${Math.round(metrics.workKj)}`}
                unit="kJ"
              />
            )}
            {!hasPower && (
              <SmallStat label="Avg Speed" value={`${msToKmh(avgSpeed).toFixed(1)}`} unit="km/h" />
            )}
            {metrics.avgPowerW > 0 && (
              <SmallStat label="VI" value={metrics.variabilityIndex.toFixed(2)} />
            )}
          </div>
        </FadeUp>

        {/* ── 6. "WANT THE NUMBERS?" — collapsible analytics ────────────── */}
        <CollapsibleSection title="Want the numbers?" delay={360}>
          <RideAnalytics />
        </CollapsibleSection>

        {/* ── 7. SHARE + ACTIONS ─────────────────────────────────────────── */}
        <FadeUp delay={420}>
          <div className="flex flex-wrap gap-2 items-center justify-center sm:justify-start">
            <RideControls />
            <ShareCard />
          </div>
        </FadeUp>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricPill({
  label,
  value,
  unit,
  tooltip,
  accent = false,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  tooltip: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      title={tooltip}
      aria-label={`${tooltip}: ${value}${unit ? ' ' + unit : ''}`}
      className={cn(
        'flex flex-col items-center gap-1 rounded-2xl py-4 px-2',
        accent ? 'bg-accent/10 ring-1 ring-accent/25' : 'glass glass-hairline',
      )}
    >
      {icon && <div className="mb-0.5" aria-hidden="true">{icon}</div>}
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold" aria-hidden="true">
        {label}
      </div>
      <div
        className={cn(
          'num tabular-nums font-black leading-none',
          accent ? 'text-accent' : 'text-foreground',
          value.length > 5 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl',
        )}
        aria-hidden="true"
      >
        {value}
      </div>
      {unit && (
        <div className="text-[10px] text-muted-foreground" aria-hidden="true">{unit}</div>
      )}
    </div>
  );
}

function SmallStat({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 py-1.5 px-1"
      role="listitem"
      aria-label={`${label}: ${value}${unit ? ' ' + unit : ''}`}
    >
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">
        {icon}
        <span>{label}</span>
      </div>
      <div className="num font-bold text-sm text-foreground tabular-nums leading-tight" aria-hidden="true">
        {value}
        {unit && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

function BestCalloutCard({ callout }: { callout: BestCallout }) {
  return (
    <div
      className={cn(
        'glass glass-hairline rounded-2xl px-5 py-4 flex items-start gap-4',
        callout.isNew ? 'border border-accent/25 shadow-[0_0_24px_-8px_hsl(var(--accent)/0.3)]' : 'border border-border/40',
      )}
    >
      <div className="shrink-0 mt-0.5" aria-hidden="true">{callout.icon}</div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-[10px] uppercase tracking-widest font-semibold mb-0.5', callout.isNew ? 'text-accent' : 'text-muted-foreground')}>
          {callout.isNew ? '🏆 ' : ''}{callout.label}
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="num text-2xl font-black text-foreground tabular-nums">{callout.current}</span>
          <span className="text-xs text-muted-foreground">{callout.best}</span>
        </div>
        {callout.detail && (
          <div className="text-xs text-muted-foreground/70 mt-1">{callout.detail}</div>
        )}
      </div>
    </div>
  );
}
