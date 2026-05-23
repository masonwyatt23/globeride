import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X, Route as RouteIcon, Repeat, Compass } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { geocode, type GeocodeResult } from '@/lib/geocoder';
import { generateRoute, type GeneratedShape } from '@/lib/routeGenerator';
import { getTerrainProvider } from '@/lib/cesiumUtils';
import { useRideStore } from '@/stores/rideStore';

interface RouteSearchProps {
  /** When true (used on /explore) the input has a translucent, floating look. */
  variant?: 'inline' | 'overlay';
  /** Called after a route is generated — used by /explore to navigate. */
  onRouteReady?: () => void;
}

/**
 * Combined search-and-generate panel. Three sequential stages:
 *   1. Type a place name → Nominatim returns candidates.
 *   2. Pick a candidate → camera flies there; generator panel opens.
 *   3. Pick a shape + length → Route built and pushed to the rideStore.
 */
export function RouteSearch({ variant = 'inline', onRouteReady }: RouteSearchProps) {
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState<GeocodeResult[]>([]);
  const [searching, setSearching]     = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected]       = useState<GeocodeResult | null>(null);
  const [showResults, setShowResults] = useState(false);

  const [shape, setShape]           = useState<GeneratedShape>('out-and-back');
  const [lengthKm, setLengthKm]     = useState(10);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);

  const setRoute      = useRideStore((s) => s.setRoute);
  const requestFlyTo  = useRideStore((s) => s.requestFlyTo);
  const abortRef      = useRef<AbortController | null>(null);

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
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSearchError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const onSelect = useCallback((r: GeocodeResult) => {
    setSelected(r);
    setShowResults(false);
    setGenError(null);
    requestFlyTo({ lat: r.lat, lon: r.lon, boundingBox: r.boundingBox, label: r.shortName });
  }, [requestFlyTo]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setQuery('');
    setResults([]);
    setGenError(null);
  }, []);

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
          name: shape === 'loop'
            ? `${selected.shortName} · ${lengthKm} km loop`
            : `${selected.shortName} · ${lengthKm} km out-and-back`,
          terrainProvider,
        },
      );
      setRoute(route);
      onRouteReady?.();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Could not generate route');
    } finally {
      setGenerating(false);
    }
  }, [selected, shape, lengthKm, headingDeg, setRoute, onRouteReady]);

  const wrapperCls = useMemo(
    () =>
      cn(
        'flex flex-col gap-3',
        variant === 'overlay' &&
          'rounded-2xl border border-border/70 glass-strong glass-hairline p-3 shadow-2xl',
      ),
    [variant],
  );

  return (
    <div className={wrapperCls}>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          aria-label="Search for a place"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={'Search a place — "Staunton, VA", "Mont Ventoux"…'}
          className={cn(
            'w-full rounded-lg border border-border bg-muted/35 pl-9 pr-9 py-2.5 text-sm text-foreground',
            'placeholder:text-muted-foreground/55 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/40 transition-colors',
          )}
          spellCheck={false}
          autoComplete="off"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-[spinSlow_1.5s_linear_infinite]" />
        ) : query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setShowResults(false); }}
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
            className="absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card shadow-lg ring-1 ring-border/40 divide-y divide-border/40"
          >
            {results.map((r) => (
              <li key={r.placeId}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
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

      {/* Search error */}
      {searchError && (
        <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          {searchError}
        </div>
      )}

      {/* Generator panel — appears after selecting a place */}
      {selected && (
        <div className="rounded-xl border border-border/70 bg-card/45 p-3.5 flex flex-col gap-3.5 animate-fadeUp">
          {/* Place header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{selected.shortName}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">{selected.displayName}</div>
              <div className="text-[11px] num text-muted-foreground/70 mt-0.5">
                {selected.lat.toFixed(4)}°, {selected.lon.toFixed(4)}°
              </div>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear selection"
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Shape picker */}
          <div className="grid grid-cols-2 gap-2">
            <ShapeButton
              active={shape === 'out-and-back'}
              onClick={() => setShape('out-and-back')}
              icon={<Repeat className="h-4 w-4" />}
              label="Out & back"
            />
            <ShapeButton
              active={shape === 'loop'}
              onClick={() => setShape('loop')}
              icon={<RouteIcon className="h-4 w-4" />}
              label="Loop"
            />
          </div>

          {/* Distance slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Distance</span>
              <span className="num font-semibold text-foreground">{lengthKm} km</span>
            </div>
            <input
              type="range"
              aria-label="Route distance in km"
              min={2}
              max={80}
              step={1}
              value={lengthKm}
              onChange={(e) => setLengthKm(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>

          {/* Heading slider */}
          {shape === 'out-and-back' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Compass className="h-3.5 w-3.5" /> Heading
                </span>
                <span className="num font-semibold text-foreground">{headingDeg}°</span>
              </div>
              <input
                type="range"
                aria-label="Route heading in degrees"
                min={0}
                max={359}
                step={1}
                value={headingDeg}
                onChange={(e) => setHeadingDeg(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </div>
          )}

          {/* Generate error */}
          {genError && (
            <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2 text-xs text-destructive">
              {genError}
            </div>
          )}

          <Button variant="default" onClick={onGenerate} disabled={generating} className="self-start">
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-[spinSlow_1.5s_linear_infinite]" /> Sampling terrain…</>
            ) : (
              <><RouteIcon className="h-4 w-4" /> Generate route</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

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
