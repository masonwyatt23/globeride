/**
 * WorldTourStages — a curated browser for iconic Grand Tour stage routes.
 *
 * Displays each stage as a polished glass card with a grand-tour badge
 * (yellow/pink/red), year, stage number, name, region, key-climbs chips,
 * distance + ascent + difficulty badge, an elevation sparkline, and a
 * hero-narrative quote. Clicking "Ride this stage" loads the route into
 * the ride store.
 *
 * Integration note:
 *   Mount this component inside the Routes tab panel, below <IconicRoutes />.
 *   Example (Home.tsx or wherever the Routes tab lives):
 *
 *     import { WorldTourStages } from '@/components/routes/WorldTourStages';
 *     // …inside the tab panel JSX:
 *     <WorldTourStages onPicked={() => navigate('/ride')} />
 *
 *   No other wiring required — the component reads/writes the ride store directly.
 */

import { Trophy, MapPin, ChevronUp, Ruler, Mountain, Play } from 'lucide-react';
import { WORLD_TOUR_STAGES, type WorldTourStageInfo } from '@/lib/worldTourStages';
import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { cn, formatDistance } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WorldTourStagesProps {
  /** Called after a route is loaded into the store — use to navigate away. */
  onPicked?: () => void;
}

// ---------------------------------------------------------------------------
// Grand-tour badge config — yellow (TdF) / pink (Giro) / red (Vuelta)
// ---------------------------------------------------------------------------

type GrandTour = WorldTourStageInfo['info']['grandTour'];

const TOUR_CONFIG: Record<
  GrandTour,
  {
    label: string;
    shortLabel: string;
    /** Tailwind classes for the badge pill */
    badgeClass: string;
    /** Tailwind classes for the top accent bar gradient */
    accentBar: string;
    /** Dot colour for the difficulty chip */
    dotClass: string;
  }
> = {
  tour: {
    label: 'Tour de France',
    shortLabel: 'TdF',
    badgeClass: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
    accentBar: 'from-yellow-400 via-yellow-300 to-amber-300',
    dotClass: 'bg-yellow-300',
  },
  giro: {
    label: "Giro d'Italia",
    shortLabel: 'Giro',
    badgeClass: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
    accentBar: 'from-pink-500 via-pink-400 to-rose-300',
    dotClass: 'bg-pink-300',
  },
  vuelta: {
    label: 'Vuelta a España',
    shortLabel: 'Vuelta',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    accentBar: 'from-red-500 via-red-400 to-orange-400',
    dotClass: 'bg-red-400',
  },
};

// ---------------------------------------------------------------------------
// Difficulty badge config
// ---------------------------------------------------------------------------

type Difficulty = WorldTourStageInfo['info']['difficulty'];

const DIFF_CONFIG: Record<
  Difficulty,
  { label: string; badgeClass: string }
> = {
  flat: {
    label: 'Flat',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  },
  hilly: {
    label: 'Hilly',
    badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  },
  mountain: {
    label: 'Mountain',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  },
  queen: {
    label: 'Queen Stage',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
  },
};

// ---------------------------------------------------------------------------
// Elevation sparkline — identical approach to IconicRoutes.tsx
// ---------------------------------------------------------------------------

function ElevationSparkline({ stageInfo }: { stageInfo: WorldTourStageInfo }) {
  const { route } = stageInfo;
  const pts = route.points;
  if (pts.length < 2) return null;

  const samples = 80;
  const step = Math.max(1, Math.floor(pts.length / samples));
  const sampled: { d: number; e: number }[] = [];
  for (let i = 0; i < pts.length; i += step) {
    sampled.push({ d: pts[i].distance, e: pts[i].ele });
  }
  const last = pts[pts.length - 1];
  if (sampled[sampled.length - 1].d < last.distance) {
    sampled.push({ d: last.distance, e: last.ele });
  }

  const minE = route.minElevation;
  const maxE = route.maxElevation;
  const eleRange = maxE - minE || 1;
  const totalD = route.totalDistance || 1;

  const W = 140;
  const H = 32;
  const PAD = 2;

  const toX = (d: number) => PAD + ((d / totalD) * (W - 2 * PAD));
  const toY = (e: number) => H - PAD - ((e - minE) / eleRange) * (H - 2 * PAD);

  const pathD = sampled
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.d).toFixed(1)},${toY(p.e).toFixed(1)}`)
    .join(' ');
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
        <linearGradient id={`wt-spark-fill-${route.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.30" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#wt-spark-fill-${route.id})`} />
      <path
        d={pathD}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.80"
      />
      {/* Summit dot — highest elevation point */}
      {(() => {
        const peak = sampled.reduce((hi, p) => (p.e > hi.e ? p : hi), sampled[0]);
        return (
          <circle
            cx={toX(peak.d).toFixed(1)}
            cy={toY(peak.e).toFixed(1)}
            r="2.5"
            fill="hsl(var(--accent))"
            opacity="0.90"
          />
        );
      })()}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stat pill helper (same as IconicRoutes)
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
// Key-climbs chips
// ---------------------------------------------------------------------------

function ClimbChips({ climbs }: { climbs: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {climbs.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-0.5 rounded-md bg-accent/10 border border-accent/20 px-1.5 py-0.5 text-[9px] font-medium text-accent/80 leading-none"
        >
          <Mountain className="h-2 w-2 shrink-0" />
          {c}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single stage card
// ---------------------------------------------------------------------------

function StageCard({
  stageInfo,
  isActive,
  onPick,
}: {
  stageInfo: WorldTourStageInfo;
  isActive: boolean;
  onPick: () => void;
}) {
  const { route, info } = stageInfo;
  const tour = TOUR_CONFIG[info.grandTour];
  const diff = DIFF_CONFIG[info.difficulty];

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
      {/* Top accent bar — coloured by grand tour */}
      <div className={cn('h-[3px] w-full bg-gradient-to-r', tour.accentBar)} />

      <div className="flex flex-col gap-3 p-4">
        {/* Header row: title + grand-tour badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            {/* Grand tour + year + stage */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase shrink-0',
                  tour.badgeClass,
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', tour.dotClass)} />
                {tour.shortLabel}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {info.year} · S{info.stageNumber}
              </span>
            </div>

            {/* Stage name */}
            <h3 className="text-[15px] font-bold text-foreground leading-snug mt-0.5">
              {info.name}
            </h3>

            {/* Region */}
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span>{info.region}</span>
            </div>
          </div>

          {/* Difficulty badge */}
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider shrink-0 uppercase mt-0.5',
              diff.badgeClass,
            )}
          >
            {diff.label}
          </span>
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
          {info.description}
        </p>

        {/* Key climbs chips */}
        <ClimbChips climbs={info.keyClimbs} />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <StatPill icon={<Ruler className="h-3 w-3" />} label="Distance">
            <span className="num">{formatDistance(route.totalDistance)}</span>
          </StatPill>
          <StatPill icon={<ChevronUp className="h-3 w-3 text-emerald-400" />} label="Ascent">
            <span className="num text-emerald-400">+{Math.round(route.ascent)} m</span>
          </StatPill>
          <StatPill icon={<Trophy className="h-3 w-3" />} label="Tour">
            <span className="num">{tour.label}</span>
          </StatPill>
          <StatPill icon={<Mountain className="h-3 w-3 text-amber-400" />} label="Climbs">
            <span className="num">{info.keyClimbs.length}</span>
          </StatPill>
        </div>

        {/* Elevation sparkline */}
        <div className="opacity-70 group-hover:opacity-100 transition-opacity duration-200">
          <ElevationSparkline stageInfo={stageInfo} />
        </div>

        {/* Hero narrative quote */}
        <blockquote className="text-[10px] italic text-muted-foreground/75 leading-snug border-l-2 border-accent/30 pl-2">
          "{info.heroNarrative}"
        </blockquote>

        {/* CTA */}
        <Button
          variant={isActive ? 'ghost' : 'accent'}
          size="sm"
          className={cn(
            'w-full mt-0.5 h-9 text-xs font-semibold tracking-wide',
            isActive && 'border border-accent/30 text-accent hover:bg-accent/10',
          )}
          onClick={onPick}
          title={isActive ? 'This stage is already loaded' : `Ride ${info.name}`}
        >
          <Play className="h-3.5 w-3.5" />
          {isActive ? 'Currently Riding' : 'Ride This Stage'}
        </Button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * A polished browser for curated Grand Tour stages.
 * Renders a responsive 3-col grid (lg) / 2-col (sm) / 1-col (mobile).
 * Clicking "Ride This Stage" calls setRoute() then the optional onPicked callback.
 *
 * INTEGRATION: Mount below <IconicRoutes /> inside the Routes tab panel.
 * See the file header for a minimal usage example.
 */
export function WorldTourStages({ onPicked }: WorldTourStagesProps) {
  const setRoute       = useRideStore((s) => s.setRoute);
  const currentRouteId = useRideStore((s) => s.route?.id);

  function handlePick(stageInfo: WorldTourStageInfo) {
    setRoute(stageInfo.route);
    onPicked?.();
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Trophy className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground leading-tight">World Tour Stages</h2>
          <p className="text-[11px] text-muted-foreground">
            {WORLD_TOUR_STAGES.length} curated Grand Tour stages — TdF · Giro · Vuelta
          </p>
        </div>
      </div>

      {/* Responsive grid: 1 col mobile → 2 col sm → 3 col lg */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WORLD_TOUR_STAGES.map((stageInfo) => (
          <StageCard
            key={stageInfo.route.id}
            stageInfo={stageInfo}
            isActive={stageInfo.route.id === currentRouteId}
            onPick={() => handlePick(stageInfo)}
          />
        ))}
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground/60 text-center leading-snug pt-1">
        Stages are synthetic polylines based on real stage data, published climb coordinates, and official Grand Tour statistics.
        Connect a smart trainer for gradient simulation.
      </p>
    </section>
  );
}
