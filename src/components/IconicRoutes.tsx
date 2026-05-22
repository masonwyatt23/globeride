/**
 * IconicRoutes — a curated browser for world-famous cycling climbs.
 *
 * Displays each climb as a polished card with name, region, distance,
 * ascent, avg/max gradient, difficulty badge, and a "Ride this climb" CTA.
 * Calling `setRoute(route)` transitions the app to the ready state; the
 * optional `onPicked` callback lets the parent navigate away.
 *
 * Usage (Home.tsx):
 *   import { IconicRoutes } from '@/components/IconicRoutes';
 *   <IconicRoutes onPicked={() => navigate('/ride')} />
 */

import { Mountain, TrendingUp, Ruler, ChevronUp, Play } from 'lucide-react';
import { ICONIC_ROUTES, type IconicRouteInfo } from '@/lib/iconicRoutes';
import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDistance } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IconicRoutesProps {
  /** Called after a route is loaded into the store — use to navigate away. */
  onPicked?: () => void;
}

// ---------------------------------------------------------------------------
// Difficulty config
// ---------------------------------------------------------------------------

type Difficulty = IconicRouteInfo['difficulty'];

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { label: string; badgeClass: string; dotClass: string }
> = {
  'hors catégorie': {
    label: 'HC',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    dotClass: 'bg-rose-400',
  },
  'category 1': {
    label: 'Cat 1',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    dotClass: 'bg-amber-400',
  },
  'category 2': {
    label: 'Cat 2',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    dotClass: 'bg-emerald-400',
  },
};

// ---------------------------------------------------------------------------
// Gradient severity helper — drives the gradient bar colour
// ---------------------------------------------------------------------------

function gradientSeverityClass(avgGradient: number): string {
  if (avgGradient >= 9) return 'from-rose-500 to-rose-400';
  if (avgGradient >= 7) return 'from-amber-500 to-amber-400';
  if (avgGradient >= 5) return 'from-cyan-500 to-cyan-400';
  return 'from-emerald-500 to-emerald-400';
}

// ---------------------------------------------------------------------------
// Elevation sparkline — a tiny inline SVG profile bar
// ---------------------------------------------------------------------------

function ElevationSparkline({ info }: { info: IconicRouteInfo }) {
  const { route } = info;
  const pts = route.points;
  if (pts.length < 2) return null;

  // Sample ~60 evenly spaced points for the sparkline.
  const samples = 60;
  const step = Math.max(1, Math.floor(pts.length / samples));
  const sampled: { d: number; e: number }[] = [];
  for (let i = 0; i < pts.length; i += step) {
    sampled.push({ d: pts[i].distance, e: pts[i].ele });
  }
  // Always include the last point.
  const last = pts[pts.length - 1];
  if (sampled[sampled.length - 1].d < last.distance) {
    sampled.push({ d: last.distance, e: last.ele });
  }

  const minE = route.minElevation;
  const maxE = route.maxElevation;
  const eleRange = maxE - minE || 1;
  const totalD = route.totalDistance || 1;

  const W = 120;
  const H = 28;
  const PAD = 2;

  const toX = (d: number) => PAD + ((d / totalD) * (W - 2 * PAD));
  const toY = (e: number) => H - PAD - ((e - minE) / eleRange) * (H - 2 * PAD);

  // Build SVG path.
  const pathD = sampled
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.d).toFixed(1)},${toY(p.e).toFixed(1)}`)
    .join(' ');

  // Area fill path (close back to bottom).
  const areaD =
    pathD +
    ` L${toX(sampled[sampled.length - 1].d).toFixed(1)},${H} L${toX(sampled[0].d).toFixed(1)},${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <defs>
        <linearGradient id={`spark-fill-${route.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path
        d={areaD}
        fill={`url(#spark-fill-${route.id})`}
      />
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* Summit dot */}
      <circle
        cx={toX(sampled[sampled.length - 1].d).toFixed(1)}
        cy={toY(sampled[sampled.length - 1].e).toFixed(1)}
        r="2.5"
        fill="hsl(var(--accent))"
        opacity="0.9"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Gradient bar — shows avg gradient as a filled bar, colour-coded severity
// ---------------------------------------------------------------------------

function GradientBar({ avg, max }: { avg: number; max: number }) {
  // Scale: 0–15% maps to 0–100% bar fill.
  const fillPct = Math.min(100, (avg / 15) * 100);
  const severityClass = gradientSeverityClass(avg);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Avg gradient</span>
        <span className="num font-semibold text-foreground">{avg.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r', severityClass)}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
        <TrendingUp className="h-2.5 w-2.5 shrink-0" />
        <span>Max <span className="num font-medium text-foreground">{max}%</span></span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single climb card
// ---------------------------------------------------------------------------

function ClimbCard({
  info,
  isActive,
  onPick,
}: {
  info: IconicRouteInfo;
  isActive: boolean;
  onPick: () => void;
}) {
  const { route, climbName, region, description, avgGradient, maxGradient, difficulty } = info;
  const diff = DIFFICULTY_CONFIG[difficulty];

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-0 rounded-2xl border bg-card/50 overflow-hidden',
        'transition-all duration-200',
        isActive
          ? 'border-accent/50 bg-accent/5 ring-1 ring-accent/25 shadow-[0_0_24px_-6px_hsl(var(--accent)/0.30)]'
          : 'border-border/55 hover:border-accent/30 hover:bg-card/70 hover:shadow-lg hover:shadow-black/20',
      )}
    >
      {/* Top accent line */}
      <div
        className={cn(
          'h-[3px] w-full',
          difficulty === 'hors catégorie'
            ? 'bg-gradient-to-r from-rose-500 via-rose-400 to-amber-400'
            : difficulty === 'category 1'
            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
            : 'bg-gradient-to-r from-emerald-500 to-emerald-400',
        )}
      />

      <div className="flex flex-col gap-3 p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-bold text-foreground leading-tight">
                {climbName}
              </h3>
              {isActive && (
                <Badge variant="accent" className="text-[10px] py-0 px-1.5">Active</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Mountain className="h-3 w-3 shrink-0" />
              <span>{region}</span>
            </div>
          </div>

          {/* Difficulty badge */}
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider shrink-0 uppercase',
              diff.badgeClass,
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', diff.dotClass)} />
            {diff.label}
          </span>
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {description}
        </p>

        {/* Sparkline + key stats */}
        {/* Stats grid — full card width so labels never collide */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <StatPill icon={<Ruler className="h-3 w-3" />} label="Distance">
            <span className="num">{formatDistance(route.totalDistance)}</span>
          </StatPill>
          <StatPill icon={<ChevronUp className="h-3 w-3 text-emerald-400" />} label="Ascent">
            <span className="num text-emerald-400">+{Math.round(route.ascent)} m</span>
          </StatPill>
          <StatPill icon={<TrendingUp className="h-3 w-3" />} label="Avg grad">
            <span className="num">{avgGradient.toFixed(1)}%</span>
          </StatPill>
          <StatPill icon={<TrendingUp className="h-3 w-3 text-rose-400" />} label="Max grad">
            <span className="num text-rose-400">{maxGradient}%</span>
          </StatPill>
        </div>

        {/* Elevation sparkline — its own row */}
        <div className="opacity-70 group-hover:opacity-100 transition-opacity duration-200">
          <ElevationSparkline info={info} />
        </div>

        {/* Gradient bar */}
        <GradientBar avg={avgGradient} max={maxGradient} />

        {/* CTA */}
        <Button
          variant={isActive ? 'ghost' : 'accent'}
          size="sm"
          className={cn(
            'w-full mt-0.5 h-9 text-xs font-semibold tracking-wide',
            isActive && 'border border-accent/30 text-accent hover:bg-accent/10',
          )}
          onClick={onPick}
          title={isActive ? 'This climb is already loaded' : `Ride ${climbName}`}
        >
          <Play className="h-3.5 w-3.5" />
          {isActive ? 'Currently Riding' : 'Ride This Climb'}
        </Button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Stat pill helper
// ---------------------------------------------------------------------------

function StatPill({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold text-foreground">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * A polished browser for world-famous cycling climbs.
 * Renders a responsive grid; clicking "Ride This Climb" calls setRoute()
 * and then the optional onPicked callback.
 */
export function IconicRoutes({ onPicked }: IconicRoutesProps) {
  const setRoute      = useRideStore((s) => s.setRoute);
  const currentRouteId = useRideStore((s) => s.route?.id);

  function handlePick(info: IconicRouteInfo) {
    setRoute(info.route);
    onPicked?.();
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Mountain className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground leading-tight">Iconic Climbs</h2>
          <p className="text-[11px] text-muted-foreground">
            {ICONIC_ROUTES.length} world-famous ascents — pick one and ride
          </p>
        </div>
      </div>

      {/* Responsive grid: 1 col on mobile, 2 on md+, 3 on xl+ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ICONIC_ROUTES.map((info) => (
          <ClimbCard
            key={info.route.id}
            info={info}
            isActive={info.route.id === currentRouteId}
            onPick={() => handlePick(info)}
          />
        ))}
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground/60 text-center leading-snug pt-1">
        Routes are synthetic polylines based on real coordinates and published climb data.
        Connect a smart trainer for resistance simulation.
      </p>
    </section>
  );
}
