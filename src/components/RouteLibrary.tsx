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
import { cn, formatDistance } from '@/lib/utils';

/**
 * The "My Routes" library panel. Lists every route the user has saved to
 * IndexedDB plus any sample routes seeded on first launch. Click a row to
 * load a route into the rider; click the trash icon to delete it.
 */
export function RouteLibrary() {
  const setRoute = useRideStore((s) => s.setRoute);
  const currentRouteId = useRideStore((s) => s.route?.id);
  const libraryVersion = useRideStore((s) => s.libraryVersion);
  const bumpLibrary = useRideStore((s) => s.bumpLibrary);

  const [routes, setRoutes] = useState<SavedRoute[] | null>(null);
  const [seeding, setSeeding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Seed sample routes on first mount (idempotent).
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
    return () => {
      alive = false;
    };
    // bumpLibrary is stable from zustand; we intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch whenever the library is bumped.
  useEffect(() => {
    let alive = true;
    listRoutes()
      .then((rs) => {
        if (alive) setRoutes(rs);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load routes');
      });
    return () => {
      alive = false;
    };
  }, [libraryVersion]);

  const handleLoad = useCallback(
    async (saved: SavedRoute) => {
      setLoadingId(saved.id);
      try {
        // Round-trip through loadRoute so we always hand the store the
        // canonical persisted copy (and confirm the read works).
        const full = (await loadRoute(saved.id)) ?? saved;
        setRoute(full);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load route');
      } finally {
        setLoadingId(null);
      }
    },
    [setRoute],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (pendingDeleteId !== id) {
        setPendingDeleteId(id);
        return;
      }
      try {
        await deleteRoute(id);
        bumpLibrary();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete route');
      } finally {
        setPendingDeleteId(null);
      }
    },
    [pendingDeleteId, bumpLibrary],
  );

  if (seeding && !routes) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your routes…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
        {error}
      </div>
    );
  }

  if (!routes || routes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
        <Library className="h-7 w-7 text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">No saved routes yet</div>
        <div className="text-xs text-muted-foreground">
          Upload a GPX above, then click <span className="font-semibold">Save to Library</span> to keep it here.
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {routes.map((r) => {
        const isActive = r.id === currentRouteId;
        const isPendingDelete = pendingDeleteId === r.id;
        const isLoading = loadingId === r.id;
        return (
          <li
            key={r.id}
            className={cn(
              'group flex flex-col gap-2 rounded-lg border bg-card/40 p-3 transition-colors',
              isActive
                ? 'border-primary/60 bg-primary/5'
                : 'border-border hover:border-primary/40 hover:bg-card/70',
            )}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {r.source === 'sample' ? (
                    <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                  <div className="text-sm font-semibold text-foreground truncate">{r.name}</div>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span className="num">{r.location}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant={isActive ? 'ghost' : 'default'}
                  size="sm"
                  disabled={isLoading}
                  onClick={() => void handleLoad(r)}
                  title={isActive ? 'Currently loaded' : 'Load this route'}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
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
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <Stat label="Distance">{formatDistance(r.totalDistance)}</Stat>
              <Stat label="Ascent">
                <span className="text-emerald-300">+{Math.round(r.ascent)} m</span>
              </Stat>
              <Stat label="Descent">
                <span className="text-sky-300">−{Math.round(r.descent)} m</span>
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
      <div className="flex items-center gap-1 text-muted-foreground">
        <Mountain className="h-3 w-3 opacity-0" aria-hidden />
        <span>{label}</span>
      </div>
      <div className="num font-semibold text-foreground">{children}</div>
    </div>
  );
}
