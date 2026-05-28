/**
 * RideSetupWizard — 2-step streamlined setup for GlobeRide.
 *
 * Step 1: Pick workout (Free ride default, or structured from library)
 * Step 2: Pick route  (iconic preset, city search → generate, GPX upload, draw)
 * Step 3: Pair trainer (collapsed by default — optional)
 * CTA: Start ride (always enabled; defaults fill in if nothing picked)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Globe2,
  Loader2,
  MapPin,
  PenLine,
  Plus,
  Route as RouteIcon,
  Search,
  Sparkles,
  Upload,
  X,
  Zap,
  Repeat,
  Compass,
  Bike,
  Wifi,
  WifiOff,
  Mountain,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDurMin } from '@/lib/format';
import { geocode, type GeocodeResult } from '@/lib/geocoder';
import { generateRoute, type GeneratedShape } from '@/lib/routeGenerator';
import { getTerrainProvider } from '@/lib/cesiumUtils';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { listWorkouts, seedPresetWorkoutsIfMissing } from '@/lib/workoutLibrary';
import { totalDurationSec, estimateTSS } from '@/lib/workout';
import type { Workout } from '@/lib/workout';
import { ICONIC_ROUTES } from '@/lib/iconicRoutes';
import { TrainerConnect } from '@/components/trainer/TrainerConnect';
import { GPXUploader } from '@/components/setup/GPXUploader';
import { WorkoutPowerProfile } from '@/components/workouts/WorkoutPowerProfile';

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

// ─── Category colour helpers (minimal subset) ─────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  endurance: 'text-sky-600 dark:text-sky-400',
  tempo: 'text-amber-600 dark:text-amber-400',
  sweetspot: 'text-violet-600 dark:text-violet-400',
  threshold: 'text-rose-600 dark:text-rose-400',
  intervals: 'text-orange-600 dark:text-orange-400',
  test: 'text-emerald-600 dark:text-emerald-400',
  custom: 'text-muted-foreground',
};
const CAT_LABEL: Record<string, string> = {
  endurance: 'Endurance',
  tempo: 'Tempo',
  sweetspot: 'Sweet Spot',
  threshold: 'Threshold',
  intervals: 'Intervals',
  test: 'FTP Test',
  custom: 'Custom',
};

// ─── Featured iconic routes (first 6 from library) ───────────────────────────

const FEATURED_ROUTES = ICONIC_ROUTES.slice(0, 6);

// ─── Step badge ───────────────────────────────────────────────────────────────

function StepCircle({
  n,
  done,
  active,
}: {
  n: WizardStep;
  done: boolean;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold shrink-0 transition-colors',
        done
          ? 'bg-primary text-primary-foreground'
          : active
            ? 'bg-primary/20 text-primary ring-2 ring-primary/40'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : n}
    </span>
  );
}

// ─── Step header row ─────────────────────────────────────────────────────────

function StepHeader({
  n,
  title,
  subtitle,
  done,
  active,
  onClick,
}: {
  n: WizardStep;
  title: string;
  subtitle?: string;
  done: boolean;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left focus-visible:outline-none"
    >
      <StepCircle n={n} done={done} active={active} />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-sm font-semibold leading-snug',
            active ? 'text-foreground' : done ? 'text-foreground/80' : 'text-muted-foreground',
          )}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitle}</div>
        )}
      </div>
      {done && !active && <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      {active && <ChevronDown className="h-4 w-4 text-primary shrink-0 rotate-180" />}
    </button>
  );
}

// ─── Step 1: Workout picker ───────────────────────────────────────────────────

interface WorkoutStepProps {
  selected: Workout | null;
  onFreeRide: () => void;
  onSelect: (w: Workout) => void;
}

function WorkoutStep({ selected, onFreeRide, onSelect }: WorkoutStepProps) {
  const navigate = useNavigate();
  const ftpW = useSettingsStore((s) => s.ftpW);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const isFreeRide = selected === null;

  useEffect(() => {
    seedPresetWorkoutsIfMissing()
      .catch(() => undefined)
      .then(() => listWorkouts())
      .then((ws) => setWorkouts(ws.slice(0, showAll ? 999 : 12)))
      .catch(() => setWorkouts([]))
      .finally(() => setLoading(false));
  }, [showAll]);

  return (
    <div className="flex flex-col gap-3">
      {/* Free ride option */}
      <button
        type="button"
        onClick={onFreeRide}
        className={cn(
          'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
          isFreeRide
            ? 'border-primary/50 bg-primary/8 ring-1 ring-primary/25'
            : 'border-border/60 bg-card/40 hover:border-border hover:bg-card/60',
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isFreeRide ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Bike className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">Free ride</div>
          <div className="text-xs text-muted-foreground">Just pedal, no targets</div>
        </div>
        {isFreeRide && <Check className="h-4 w-4 text-primary shrink-0" />}
      </button>

      {/* Structured workout list */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading workouts…
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {workouts.map((w) => {
            const dur = totalDurationSec(w);
            const tss = estimateTSS(w, ftpW);
            const cat = w.category ?? 'custom';
            const isActive = selected?.id === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onSelect(w)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all',
                  isActive
                    ? 'border-accent/50 bg-accent/8 ring-1 ring-accent/25'
                    : 'border-border/50 bg-card/30 hover:border-border/80 hover:bg-card/50',
                )}
              >
                {/* Thumbnail */}
                <div className="hidden sm:block shrink-0 w-14" aria-hidden>
                  <WorkoutPowerProfile workout={w} ftpW={ftpW} variant="thumbnail" heightClass="h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">{w.name}</span>
                    <span className={cn('text-[10px] font-medium', CAT_COLOR[cat])}>
                      {CAT_LABEL[cat] ?? cat}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5 num">
                      <Clock className="h-3 w-3" /> {formatDurMin(dur)}
                    </span>
                    {tss > 0 && (
                      <span className="flex items-center gap-0.5 num">
                        <Zap className="h-3 w-3" /> {tss} TSS
                      </span>
                    )}
                  </div>
                </div>
                {isActive && <Check className="h-4 w-4 text-accent shrink-0" />}
              </button>
            );
          })}

          {!showAll && workouts.length >= 12 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs text-muted-foreground hover:text-foreground py-1 text-center transition-colors"
            >
              See all workouts
            </button>
          )}
        </div>
      )}

      {/* Build custom */}
      <button
        type="button"
        onClick={() => navigate('/workouts/new')}
        className="flex items-center gap-2.5 rounded-xl border border-dashed border-border/60 bg-muted/10 px-3.5 py-2.5 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition-colors"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/60">
          <Plus className="h-3.5 w-3.5" />
        </span>
        Build custom workout
      </button>
    </div>
  );
}

// ─── Step 2: Route picker ─────────────────────────────────────────────────────

interface RouteStepProps {
  onRouteSelected: () => void;
}

function RouteStep({ onRouteSelected }: RouteStepProps) {
  const navigate = useNavigate();
  const setRoute = useRideStore((s) => s.setRoute);
  const requestFlyTo = useRideStore((s) => s.requestFlyTo);
  const currentRoute = useRideStore((s) => s.route);

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Generation state
  const [shape, setShape] = useState<GeneratedShape>('out-and-back');
  const [lengthKm, setLengthKm] = useState(15);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // GPX upload expansion
  const [showGpx, setShowGpx] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Nominatim search with debounce
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearchError(null); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await geocode(q, { signal: ctrl.signal });
        if (!ctrl.signal.aborted) { setResults(r); setShowResults(true); }
      } catch (err) {
        if (ctrl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        setSearchError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const onPlaceSelect = useCallback(
    (r: GeocodeResult) => {
      setSelected(r);
      setShowResults(false);
      setGenError(null);
      requestFlyTo({ lat: r.lat, lon: r.lon, boundingBox: r.boundingBox, label: r.shortName });
    },
    [requestFlyTo],
  );

  const onGenerate = useCallback(async () => {
    if (!selected) return;
    setGenerating(true);
    setGenError(null);
    try {
      let terrainProvider = null;
      try { terrainProvider = await getTerrainProvider(); } catch { /* no token */ }
      const route = await generateRoute(
        { lat: selected.lat, lon: selected.lon },
        {
          shape,
          lengthKm,
          headingDeg,
          name:
            shape === 'loop'
              ? `${selected.shortName} · ${lengthKm} km loop`
              : `${selected.shortName} · ${lengthKm} km out-and-back`,
          terrainProvider,
        },
      );
      setRoute(route);
      onRouteSelected();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Could not generate route');
    } finally {
      setGenerating(false);
    }
  }, [selected, shape, lengthKm, headingDeg, setRoute, onRouteSelected]);

  return (
    <div className="flex flex-col gap-4">

      {/* City search */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Search any city or place
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            aria-label="Search for a place"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder='"Mont Ventoux", "Staunton VA", "Kyoto"…'
            className="w-full rounded-lg border border-border bg-muted/35 pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/40 transition-colors"
            spellCheck={false}
            autoComplete="off"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setSelected(null); setShowResults(false); }}
              aria-label="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex items-center justify-center transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {/* Results dropdown */}
          {showResults && results.length > 0 && (
            <ul
              role="listbox"
              className="absolute z-30 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-border bg-card shadow-lg ring-1 ring-border/40 divide-y divide-border/40"
            >
              {results.map((r) => (
                <li key={r.placeId}>
                  <button
                    type="button"
                    onClick={() => onPlaceSelect(r)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 focus:bg-muted/50 outline-none flex items-start gap-2 transition-colors"
                  >
                    <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-foreground truncate">{r.shortName}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.displayName}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {searchError && (
          <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2 text-xs text-destructive">
            {searchError}
          </div>
        )}

        {/* Route generator panel */}
        {selected && (
          <div className="rounded-xl border border-border/70 bg-card/45 p-3.5 flex flex-col gap-3 animate-fadeUp">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{selected.shortName}</div>
                <div className="text-xs text-muted-foreground truncate">{selected.displayName}</div>
              </div>
              <button
                type="button"
                onClick={() => { setSelected(null); setQuery(''); }}
                aria-label="Clear selection"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ShapeButton active={shape === 'out-and-back'} onClick={() => setShape('out-and-back')} icon={<Repeat className="h-4 w-4" />} label="Out & back" />
              <ShapeButton active={shape === 'loop'} onClick={() => setShape('loop')} icon={<RouteIcon className="h-4 w-4" />} label="Loop" />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Distance</span>
                <span className="num font-semibold text-foreground">{lengthKm} km</span>
              </div>
              <input
                type="range"
                aria-label="Route distance in km"
                min={2} max={80} step={1}
                value={lengthKm}
                onChange={(e) => setLengthKm(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </div>

            {shape === 'out-and-back' && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><Compass className="h-3 w-3" /> Heading</span>
                  <span className="num font-semibold text-foreground">{headingDeg}°</span>
                </div>
                <input
                  type="range"
                  aria-label="Route heading in degrees"
                  min={0} max={359} step={1}
                  value={headingDeg}
                  onChange={(e) => setHeadingDeg(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>
            )}

            {genError && (
              <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2 text-xs text-destructive">{genError}</div>
            )}

            <Button variant="default" onClick={onGenerate} disabled={generating} className="self-start">
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sampling terrain…</>
                : <><RouteIcon className="h-4 w-4" /> Generate route</>}
            </Button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/50" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">or choose an iconic climb</span>
        <div className="h-px flex-1 bg-border/50" />
      </div>

      {/* Featured iconic routes — 2-column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FEATURED_ROUTES.map((r) => {
          const distKm = r.route.totalDistance ? (r.route.totalDistance / 1000).toFixed(1) : '—';
          const ascentM = r.route.ascent ? Math.round(r.route.ascent) : null;
          const isSelected = currentRoute?.id === r.route.id;
          return (
            <button
              key={r.route.id}
              type="button"
              onClick={() => { setRoute(r.route); onRouteSelected(); }}
              className={cn(
                'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                isSelected
                  ? 'border-primary/50 bg-primary/8 ring-1 ring-primary/25'
                  : 'border-border/50 bg-card/30 hover:border-border/80 hover:bg-card/50',
              )}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 text-primary">
                <Mountain className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{r.climbName}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground num">
                  <span>{distKm} km</span>
                  {ascentM && <><span className="opacity-40">·</span><span>{ascentM} m</span></>}
                </div>
              </div>
              {isSelected && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Browse all routes link */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => navigate('/?tab=routes')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Browse all iconic routes
        </button>

        <button
          type="button"
          onClick={() => navigate('/draw')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <PenLine className="h-3.5 w-3.5" />
          Draw a route
        </button>

        <button
          type="button"
          onClick={() => navigate('/explore')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Globe2 className="h-3.5 w-3.5" />
          Explore globe
        </button>

        <button
          type="button"
          onClick={() => setShowGpx((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload GPX
        </button>
      </div>

      {/* GPX uploader inline */}
      {showGpx && (
        <div className="rounded-xl border border-border/60 bg-muted/10 p-3 animate-fadeUp">
          <GPXUploader />
        </div>
      )}
    </div>
  );
}

// ─── ShapeButton helper ───────────────────────────────────────────────────────

function ShapeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150',
        active
          ? 'border-primary/50 bg-primary/12 text-primary ring-1 ring-primary/20'
          : 'border-border/70 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:border-border',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Step 3: Trainer ──────────────────────────────────────────────────────────

function TrainerStep() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Connect a smart trainer (FTMS) to receive real-time resistance from route gradients.
        Skip this and Demo Mode will simulate power for you.
      </p>
      <TrainerConnect />
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function RideSetupWizard() {
  const navigate = useNavigate();

  const route = useRideStore((s) => s.route);
  const connection = useRideStore((s) => s.connection);
  const loadWorkout = useRideStore((s) => s.loadWorkout);
  const clearWorkout = useRideStore((s) => s.clearWorkout);

  // null = free ride selected; Workout = structured selected
  const [pickedWorkout, setPickedWorkout] = useState<Workout | null>(null);

  // Which step is expanded
  const [openStep, setOpenStep] = useState<WizardStep>(1);

  // Step completion flags
  const step1Done = true; // workout always satisfied (free ride is valid)
  const step2Done = route !== null;
  const step3Done = connection === 'connected';

  // Subtitle text for collapsed steps
  const step1Subtitle = pickedWorkout ? `${pickedWorkout.name} · ${formatDurMin(totalDurationSec(pickedWorkout))}` : 'Free ride';
  const step2Subtitle = route ? route.name : undefined;
  const step3Subtitle = step3Done ? 'Trainer connected' : 'Demo mode (no trainer)';

  const handleSelectWorkout = useCallback(
    (w: Workout) => {
      setPickedWorkout(w);
      loadWorkout(w);
      setOpenStep(2);
    },
    [loadWorkout],
  );

  const handleFreeRide = useCallback(() => {
    setPickedWorkout(null);
    clearWorkout();
    setOpenStep(2);
  }, [clearWorkout]);

  const handleRouteSelected = useCallback(() => {
    setOpenStep(3);
  }, []);

  const handleStartRide = useCallback(() => {
    const store = useRideStore.getState();
    // Auto-fill route if still none
    if (!store.route) {
      const r = ICONIC_ROUTES[Math.floor(Math.random() * ICONIC_ROUTES.length)];
      store.setRoute(r.route);
    }
    // Auto-fill workout if user picked free ride (null = no workout attached)
    // Nothing to do — free ride means no activeWorkout
    navigate('/ride');
  }, [navigate]);

  const toggleStep = useCallback(
    (s: WizardStep) => setOpenStep((prev) => (prev === s ? (s === 1 ? 2 : 1) : s)),
    [],
  );

  return (
    <div className="flex flex-col gap-3">

      {/* ── Step 1: Workout ── */}
      <div
        className={cn(
          'rounded-2xl border transition-all duration-200',
          openStep === 1
            ? 'border-border/80 bg-card/60 shadow-sm'
            : 'border-border/40 bg-card/30',
        )}
      >
        <div className="px-4 py-3.5">
          <StepHeader
            n={1}
            title="Choose your workout"
            subtitle={openStep !== 1 ? step1Subtitle : undefined}
            done={step1Done}
            active={openStep === 1}
            onClick={() => toggleStep(1)}
          />
        </div>

        {openStep === 1 && (
          <div className="px-4 pb-4">
            <WorkoutStep
              selected={pickedWorkout}
              onFreeRide={handleFreeRide}
              onSelect={handleSelectWorkout}
            />
          </div>
        )}
      </div>

      {/* ── Step 2: Route ── */}
      <div
        className={cn(
          'rounded-2xl border transition-all duration-200',
          openStep === 2
            ? 'border-border/80 bg-card/60 shadow-sm'
            : 'border-border/40 bg-card/30',
        )}
      >
        <div className="px-4 py-3.5">
          <StepHeader
            n={2}
            title="Choose your route"
            subtitle={openStep !== 2 ? step2Subtitle : undefined}
            done={step2Done}
            active={openStep === 2}
            onClick={() => toggleStep(2)}
          />
        </div>

        {openStep === 2 && (
          <div className="px-4 pb-4">
            <RouteStep onRouteSelected={handleRouteSelected} />
          </div>
        )}
      </div>

      {/* ── Step 3: Trainer (collapsible) ── */}
      <div
        className={cn(
          'rounded-2xl border transition-all duration-200',
          openStep === 3
            ? 'border-border/80 bg-card/60 shadow-sm'
            : 'border-border/40 bg-card/30',
        )}
      >
        <div className="px-4 py-3.5">
          <StepHeader
            n={3}
            title={
              step3Done
                ? 'Trainer connected'
                : 'Pair trainer'
            }
            subtitle={openStep !== 3 ? step3Subtitle : undefined}
            done={step3Done}
            active={openStep === 3}
            onClick={() => toggleStep(3)}
          />
        </div>

        {openStep === 3 && (
          <div className="px-4 pb-4">
            <TrainerStep />
          </div>
        )}
      </div>

      {/* ── Start CTA ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
        <Button
          size="lg"
          variant="accent"
          onClick={handleStartRide}
          className="rounded-pill active:scale-[0.97] transition-transform w-full sm:w-auto"
        >
          {step2Done ? 'Start ride' : 'Auto-pick a route & start'}
          <ArrowRight className="h-5 w-5" />
        </Button>

        {/* Connection status chip */}
        <div className={cn(
          'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border',
          step3Done
            ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/8'
            : 'text-muted-foreground border-border/50 bg-muted/20',
        )}>
          {step3Done
            ? <><Wifi className="h-3 w-3" /> Trainer connected</>
            : <><WifiOff className="h-3 w-3" /> Demo mode</>}
        </div>
      </div>
    </div>
  );
}
