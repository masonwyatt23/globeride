/**
 * AIRouteRecommender — the primary route surface for GlobeRide.
 *
 * Users type a natural-language prompt ("a rolling 60 km loop along the
 * Pacific coast") → AI suggests a beautiful scenic route → one-tap to load
 * and ride.
 *
 * Visual language matches AIWorkoutDesigner + IconicRoutes:
 *   - Dark glassmorphic cards, cyan accent (hsl(var(--accent)))
 *   - Same suggestion-chip UX as AIWorkoutDesigner
 *   - Same error / loading states
 *   - Recent results cached in localStorage (last 5)
 *
 * Integration (Home.tsx or wherever you want to mount it):
 *   import { AIRouteRecommender } from '@/components/routes/AIRouteRecommender';
 *   <AIRouteRecommender onPicked={() => navigate('/ride')} />
 */

import * as React from 'react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  MapPin,
  Ruler,
  ChevronUp,
  TrendingUp,
  Star,
  RotateCcw,
  Play,
  Clock,
  Globe,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatDistance } from '@/lib/utils';
import { useRideStore } from '@/stores/rideStore';
import { recommendRoute, type RouteRecommendation } from '@/lib/ai/routeRecommender';
import type { AIRouteInfo } from '@/lib/ai/validateRoute';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// localStorage cache — last 5 successful recommendations
// ---------------------------------------------------------------------------

const CACHE_KEY = 'globeride.aiRoutes.recent.v1';
const CACHE_MAX = 5;

interface CachedRecommendation {
  info: AIRouteInfo;
  /** We only cache the route metadata, not the full polyline (too large).
   *  Re-calling recommendRoute with the same prompt regenerates it.
   *  We store the prompt so the chip can re-fill it. */
  prompt: string;
  /** Unix ms when this recommendation was generated. */
  savedAt: number;
}

function loadCache(): CachedRecommendation[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CachedRecommendation[];
  } catch {
    return [];
  }
}

function saveToCache(entry: CachedRecommendation): CachedRecommendation[] {
  const prev = loadCache().filter((c) => c.prompt !== entry.prompt);
  const next = [entry, ...prev].slice(0, CACHE_MAX);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded — silently skip
  }
  return next;
}

// ---------------------------------------------------------------------------
// Suggestion prompts
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  'A rolling 60 km loop along the Pacific coast near Big Sur',
  'An hour of gentle climbing near Boulder, Colorado',
  'Something scenic in the Dolomites under 40 km',
  'A flat coastal loop in Mallorca, about 50 km',
  'A challenging Alpine climb in Switzerland, 30–50 km',
];

// ---------------------------------------------------------------------------
// Difficulty config
// ---------------------------------------------------------------------------

type Difficulty = AIRouteInfo['difficulty'];

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { label: string; badgeClass: string }
> = {
  easy: {
    label: 'Easy',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  },
  moderate: {
    label: 'Moderate',
    badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  },
  hard: {
    label: 'Hard',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  },
  epic: {
    label: 'Epic',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
  },
};

// ---------------------------------------------------------------------------
// Scenic star rating
// ---------------------------------------------------------------------------

function ScenicStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Scenic rating: ${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < rating
              ? 'fill-amber-400 text-amber-400'
              : 'fill-none text-muted-foreground/40',
          )}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route stat pill (matches IconicRoutes.tsx)
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
    <div className="flex items-center gap-1 text-[11px]">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold text-foreground">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accent top-line — mirrors IconicRoutes ClimbCard
// ---------------------------------------------------------------------------

function DifficultyTopLine({ difficulty }: { difficulty: Difficulty }) {
  const cls =
    difficulty === 'epic'
      ? 'from-rose-500 via-rose-400 to-amber-400'
      : difficulty === 'hard'
      ? 'from-amber-500 to-amber-400'
      : difficulty === 'moderate'
      ? 'from-cyan-500 to-cyan-400'
      : 'from-emerald-500 to-emerald-400';
  return <div className={cn('h-[3px] w-full bg-gradient-to-r', cls)} />;
}

// ---------------------------------------------------------------------------
// Route summary card — shown after a successful generation
// ---------------------------------------------------------------------------

function RouteSummaryCard({
  info,
  route,
  onRide,
  onTryAnother,
}: {
  info: AIRouteInfo;
  route: Route;
  onRide: () => void;
  onTryAnother: () => void;
}) {
  const diff = DIFFICULTY_CONFIG[info.difficulty];

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-0 rounded-2xl border overflow-hidden',
        'border-accent/50 bg-accent/5 ring-1 ring-accent/25',
        'shadow-[0_0_32px_-8px_hsl(var(--accent)/0.25)]',
        'animate-fadeUp',
      )}
    >
      <DifficultyTopLine difficulty={info.difficulty} />

      <div className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="text-[15px] font-bold text-foreground leading-tight">
              {info.name}
            </h3>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{info.region}</span>
            </div>
          </div>

          {/* Difficulty badge */}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider shrink-0 uppercase',
              diff.badgeClass,
            )}
          >
            {diff.label}
          </span>
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {info.description}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <StatPill icon={<Ruler className="h-3 w-3" />} label="Distance">
            <span className="num">{formatDistance(route.totalDistance)}</span>
          </StatPill>
          <StatPill icon={<ChevronUp className="h-3 w-3 text-emerald-400" />} label="Ascent">
            <span className="num text-emerald-400">+{Math.round(route.ascent)} m</span>
          </StatPill>
          <StatPill icon={<TrendingUp className="h-3 w-3" />} label="Shape">
            <span className="capitalize">{info.shape.replace('-', ' ')}</span>
          </StatPill>
          <StatPill icon={<Star className="h-3 w-3 text-amber-400" />} label="Scenic">
            <ScenicStars rating={info.scenicRating} />
          </StatPill>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5 flex-wrap pt-0.5">
          <Button
            variant="accent"
            size="sm"
            className="flex-1 h-9 text-xs font-semibold tracking-wide"
            onClick={onRide}
          >
            <Play className="h-3.5 w-3.5" />
            Ride this route
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground hover:text-foreground"
            onClick={onTryAnother}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try another
          </Button>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Recent recommendation chip
// ---------------------------------------------------------------------------

function RecentChip({
  cached,
  onRestore,
}: {
  cached: CachedRecommendation;
  onRestore: (prompt: string) => void;
}) {
  const ageMin = Math.round((Date.now() - cached.savedAt) / 60_000);
  const ageLabel =
    ageMin < 2 ? 'just now' : ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin / 60)}h ago`;

  return (
    <button
      onClick={() => onRestore(cached.prompt)}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-left',
        'hover:border-accent/40 hover:bg-card/70 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
      )}
    >
      <span className="text-[11px] font-semibold text-foreground leading-snug line-clamp-1">
        {cached.info.name}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">{cached.info.region}</span>
        <span className="text-[9px] text-muted-foreground/50">·</span>
        <span className="text-[9px] text-muted-foreground/60 flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" />
          {ageLabel}
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {/* Animated globe icon */}
      <div className="flex items-center gap-2 text-accent/70">
        <Globe className="h-4 w-4 animate-pulse" />
        <span className="text-xs text-muted-foreground animate-pulse">
          Finding the perfect route…
        </span>
      </div>
      {[75, 55, 65, 40, 80].map((w, i) => (
        <div
          key={i}
          className="h-2.5 rounded-full bg-muted/60 animate-pulse"
          style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AIRouteRecommenderProps {
  /** Called after a route is loaded into the store — use to navigate away. */
  onPicked?: () => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AIRouteRecommender({ onPicked }: AIRouteRecommenderProps) {
  const setRoute = useRideStore((s) => s.setRoute);

  const [prompt, setPrompt] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RouteRecommendation | null>(null);
  const [recentCache, setRecentCache] = React.useState<CachedRecommendation[]>(loadCache);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // --- Generate ---
  const handleGenerate = React.useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const rec = await recommendRoute(trimmed);
      setResult(rec);

      // Cache the result (no polyline — just the metadata + prompt)
      const entry: CachedRecommendation = {
        info: rec.info,
        prompt: trimmed,
        savedAt: Date.now(),
      };
      setRecentCache(saveToCache(entry));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error generating route.');
    } finally {
      setLoading(false);
    }
  }, [prompt]);

  // --- Ride this route ---
  const handleRide = React.useCallback(() => {
    if (!result) return;
    setRoute(result.route);
    onPicked?.();
  }, [result, setRoute, onPicked]);

  // --- Try another ---
  const handleTryAnother = React.useCallback(() => {
    setResult(null);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  // --- Reset ---
  const handleReset = React.useCallback(() => {
    setResult(null);
    setError(null);
    setPrompt('');
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  // --- Restore from recent cache ---
  const handleRestoreRecent = React.useCallback((cachedPrompt: string) => {
    setPrompt(cachedPrompt);
    setResult(null);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  // --- Keyboard shortcut: ⌘↵ to generate ---
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !loading) {
        e.preventDefault();
        void handleGenerate();
      }
    },
    [handleGenerate, loading],
  );

  // --- Suggestion click ---
  const handleSuggestion = React.useCallback((s: string) => {
    setPrompt(s);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-accent" />
          AI Route Recommender
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Prompt area */}
        <div className="space-y-2">
          <label htmlFor="ai-route-prompt" className="sr-only">
            Describe the route you want
          </label>
          <div className="relative">
            <textarea
              id="ai-route-prompt"
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Describe your ideal route… e.g. &quot;a rolling 60 km loop along the Pacific coast near Big Sur&quot;"
              rows={3}
              disabled={loading}
              className={cn(
                'w-full resize-none rounded-lg border bg-card/60 px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-150',
                error ? 'border-destructive/60' : 'border-border/70 hover:border-border',
              )}
            />
            <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/50 pointer-events-none select-none hidden sm:block">
              ⌘↵ to generate
            </span>
          </div>

          {/* Suggestion chips — only when idle */}
          {!result && !loading && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className={cn(
                    'text-[10px] rounded-full border border-border/60 bg-card/40 px-2.5 py-0.5 text-muted-foreground',
                    'hover:border-accent/40 hover:text-foreground hover:bg-card/70 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Generate button */}
        {!result && (
          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full h-10"
            variant="default"
            aria-label={loading ? 'Finding your route, please wait' : 'Generate route from description'}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Finding your route…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Find My Route
              </>
            )}
          </Button>
        )}

        {/* Loading state */}
        {loading && <LoadingSkeleton />}

        {/* Error state */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug">Route generation failed</p>
              <p className="text-[12px] mt-0.5 opacity-80 leading-relaxed">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 h-7 text-[11px] text-destructive/80 hover:text-destructive hover:bg-destructive/10 px-2"
              onClick={handleReset}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Success: route summary card */}
        {result && !loading && (
          <RouteSummaryCard
            info={result.info}
            route={result.route}
            onRide={handleRide}
            onTryAnother={handleTryAnother}
          />
        )}

        {/* Recent recommendations */}
        {recentCache.length > 0 && !loading && !result && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Recent
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {recentCache.map((c) => (
                <RecentChip
                  key={`${c.savedAt}-${c.info.name}`}
                  cached={c}
                  onRestore={handleRestoreRecent}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-[10px] text-muted-foreground/50 text-center leading-snug pt-1">
          Routes are AI-generated polylines around real coordinates.
          Connect a smart trainer for resistance simulation.
        </p>
      </CardContent>
    </Card>
  );
}
