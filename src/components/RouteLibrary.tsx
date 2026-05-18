import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  Library,
  MapPin,
  Mountain,
  Play,
  Trash2,
  Loader2,
  Sparkles,
} from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import {
  deleteRoute,
  listRoutes,
  loadRoute,
  seedSampleRoutesIfMissing,
} from '@/lib/routeLibrary';
import type { SavedRoute } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDistance } from '@/lib/utils';

/**
 * The "My Routes" library panel. Lists every route saved to IndexedDB plus
 * any sample routes seeded on first launch.
 */
export function RouteLibrary() {
  const setRoute        = useRideStore((s) => s.setRoute);
  const currentRouteId  = useRideStore((s) => s.route?.id);
  const libraryVersion  = useRideStore((s) => s.libraryVersion);
  const bumpLibrary     = useRideStore((s) => s.bumpLibrary);

  const [routes, setRoutes]               = useState<SavedRoute[] | null>(null);
  const [seeding, setSeeding]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [loadingId, setLoadingId]         = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await seedSampleRoutesIfMissing();
        if (alive) bumpLibrary();
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Library init failed');
      } finally {
        if (alive) setSeeding(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    listRoutes()
      .then((rs) => { if (alive) setRoutes(rs); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Could not load routes'); });
    return () => { alive = false; };
  }, [libraryVersion]);

  const handleLoad = useCallback(async (saved: SavedRoute) => {
    setLoadingId(saved.id);
    try {
      const full = (await loadRoute(saved.id)) ?? saved;
      setRoute(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load route');
    } finally {
      setLoadingId(null);
    }
  }, [setRoute]);

  const handleDelete = useCallback(async (id: string) => {
    if (pendingDeleteId !== id) { setPendingDeleteId(id); return; }
    try {
      await deleteRoute(id);
      bumpLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete route');
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, bumpLibrary]);

  /* Loading */
  if (seeding && !routes) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-[spinSlow_1.5s_linear_infinite]" />
        Loading your routes…
      </div>
    );
  }

  /* Error */
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-xs text-destructive leading-snug">
        {error}
      </div>
    );
  }

  /* Empty state */
  if (!routes || routes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-7 text-center">
        <Library className="h-7 w-7 text-muted-foreground/60" />
        <div className="text-sm font-semibold text-foreground">No saved routes yet</div>
        <div className="text-xs text-muted-foreground max-w-[22ch]">
          Upload a GPX above, then click{' '}
          <span className="font-semibold text-foreground">Save</span> to keep it here.
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {routes.map((r) => {
        const isActive       = r.id === currentRouteId;
        const isPendingDelete = pendingDeleteId === r.id;
        const isLoading      = loadingId === r.id;
        return (
          <li
            key={r.id}
            className={cn(
              'group flex flex-col gap-2.5 rounded-xl border bg-card/40 p-3 transition-all duration-150',
              isActive
                ? 'border-accent/50 bg-accent/5 ring-1 ring-accent/20'
                : 'border-border/60 hover:border-primary/35 hover:bg-card/60',
            )}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {r.source === 'sample'
                    ? <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
                    : <Bookmark className="h-3.5 w-3.5 text-primary shrink-0" />
                  }
                  <div className="text-sm font-semibold text-foreground truncate">{r.name}</div>
                  {isActive && (
                    <Badge variant="accent" className="ml-1">Active</Badge>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="num truncate">{r.location}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant={isActive ? 'ghost' : 'default'}
                  size="sm"
                  disabled={isLoading}
                  onClick={() => void handleLoad(r)}
                  className="h-8 px-2.5 text-xs"
                  title={isActive ? 'Currently loaded' : 'Load this route'}
                >
                  {isLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-[spinSlow_1.5s_linear_infinite]" />
                    : <Play className="h-3.5 w-3.5" />
                  }
                  {isActive ? 'Loaded' : 'Load'}
                </Button>
                <Button
                  variant={isPendingDelete ? 'destructive' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => void handleDelete(r.id)}
                  onBlur={() => isPendingDelete && setPendingDeleteId(null)}
                  title={isPendingDelete ? 'Click again to confirm' : 'Delete from library'}
                  aria-label={isPendingDelete ? 'Confirm delete' : 'Delete route'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] border-t border-border/40 pt-2.5">
              <Stat label="Distance">{formatDistance(r.totalDistance)}</Stat>
              <Stat label="Ascent">
                <span className="text-emerald-600 dark:text-emerald-400">+{Math.round(r.ascent)} m</span>
              </Stat>
              <Stat label="Descent">
                <span className="text-sky-600 dark:text-sky-400">−{Math.round(r.descent)} m</span>
              </Stat>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="num font-semibold text-foreground">{children}</div>
    </div>
  );
}
