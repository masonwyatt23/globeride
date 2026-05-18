import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, MapPin, Mountain, Loader2, Sparkles, BookmarkPlus, Check } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { parseGpx } from '@/lib/gpxParser';
import { makeDemoRoute } from '@/lib/sampleRoutes';
import { hasRoute, saveRoute } from '@/lib/routeLibrary';
import { Button } from '@/components/ui/button';
import { cn, formatDistance } from '@/lib/utils';

/**
 * Drag-and-drop GPX import. Also offers a one-click built-in demo route so
 * first-time users have something to ride immediately.
 */
export function GPXUploader() {
  const setRoute = useRideStore((s) => s.setRoute);
  const route = useRideStore((s) => s.route);
  const bumpLibrary = useRideStore((s) => s.bumpLibrary);
  const libraryVersion = useRideStore((s) => s.libraryVersion);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [savedInLibrary, setSavedInLibrary] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!route) {
      setSavedInLibrary(false);
      return;
    }
    hasRoute(route.id)
      .then((exists) => {
        if (alive) setSavedInLibrary(exists);
      })
      .catch(() => {
        if (alive) setSavedInLibrary(false);
      });
    return () => {
      alive = false;
    };
  }, [route, libraryVersion]);

  const handleSave = useCallback(async () => {
    if (!route || savedInLibrary || saving) return;
    setSaving(true);
    try {
      await saveRoute(route, 'gpx');
      setSavedInLibrary(true);
      bumpLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save route');
    } finally {
      setSaving(false);
    }
  }, [route, savedInLibrary, saving, bumpLibrary]);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const xml = await file.text();
        const r = parseGpx(xml, file.name.replace(/\.gpx$/i, ''));
        setRoute(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not parse GPX file');
      } finally {
        setBusy(false);
      }
    },
    [setRoute],
  );

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        className={cn(
          'group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors cursor-pointer',
          'hover:border-primary/60 hover:bg-primary/5',
          dragOver && 'border-primary bg-primary/10',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,application/gpx+xml,text/xml"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        {busy ? (
          <Loader2 className="h-7 w-7 text-primary animate-spin" />
        ) : (
          <Upload className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
        <div className="mt-2 text-sm font-medium text-foreground">
          {busy ? 'Parsing…' : 'Drop a GPX file here'}
        </div>
        <div className="text-xs text-muted-foreground">
          Or click to browse · Strava, Komoot, Garmin, RideWithGPS all work
        </div>
      </label>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={() => {
            const r = makeDemoRoute();
            setRoute(r);
          }}
        >
          <Sparkles className="h-4 w-4" />
          Load demo route
        </Button>
      </div>

      {route && (
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold text-foreground truncate flex-1">{route.name}</div>
            <Button
              variant={savedInLibrary ? 'ghost' : 'outline'}
              size="sm"
              disabled={savedInLibrary || saving}
              onClick={() => void handleSave()}
              className="shrink-0"
              title={savedInLibrary ? 'Already in My Routes' : 'Save to My Routes'}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : savedInLibrary ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  Saved
                </>
              ) : (
                <>
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Save to Library
                </>
              )}
            </Button>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-3 text-xs">
            <RouteStat icon={<MapPin className="h-3.5 w-3.5" />} label="Distance">
              {formatDistance(route.totalDistance)}
            </RouteStat>
            <RouteStat icon={<Mountain className="h-3.5 w-3.5 text-emerald-400" />} label="Ascent">
              +{Math.round(route.ascent)} m
            </RouteStat>
            <RouteStat icon={<Mountain className="h-3.5 w-3.5 -scale-y-100 text-sky-400" />} label="Descent">
              −{Math.round(route.descent)} m
            </RouteStat>
          </div>
        </div>
      )}
    </div>
  );
}

function RouteStat({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="num font-semibold text-foreground">{children}</div>
    </div>
  );
}
