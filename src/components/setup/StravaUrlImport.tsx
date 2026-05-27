import { useState, useCallback } from 'react';
import { Link2, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { parseStravaActivityId, importStravaActivity, StravaImportError } from '@/lib/strava/activityImport';
import { saveRoute } from '@/lib/routeLibrary';
import { refreshAccessToken, stravaCredsPresent } from '@/lib/strava';
import { Button } from '@/components/ui/button';
import { buildStravaAuthorizeUrl } from '@/lib/stravaOauth';
import { isStravaLinked } from '@/lib/stravaOauth';
import { cn, formatDistance } from '@/lib/utils';

/**
 * Paste-a-Strava-URL import panel. Placed alongside GPXUploader in the
 * "Pick a route" card on Home.tsx.
 *
 * Accepts:
 *   https://www.strava.com/activities/12345678
 *   https://www.strava.com/activities/12345678/overview
 *   strava.com/activities/12345678
 *   12345678  (bare numeric ID)
 */
export function StravaUrlImport() {
  const setRoute    = useRideStore((s) => s.setRoute);
  const bumpLibrary = useRideStore((s) => s.bumpLibrary);

  const [input, setInput]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [imported, setImported] = useState<{ name: string; distance: number } | null>(null);

  const activityId = parseStravaActivityId(input);
  const canImport  = !!activityId && !busy;
  const linked     = isStravaLinked();

  const handleImport = useCallback(async () => {
    if (!activityId) return;
    setBusy(true);
    setError(null);
    setImported(null);

    try {
      const token = await refreshAccessToken();
      const route = await importStravaActivity(activityId, token);

      // Persist to library and load into ride store
      await saveRoute(route, 'strava');
      setRoute(route);
      bumpLibrary();
      setImported({ name: route.name, distance: route.totalDistance });
      setInput('');
    } catch (err) {
      if (err instanceof StravaImportError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [activityId, setRoute, bumpLibrary]);

  // Not connected — show a minimal CTA
  if (!linked && !stravaCredsPresent()) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-4 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Link2 className="h-4 w-4 text-primary shrink-0" />
          Import from Strava URL
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect your Strava account to import any activity by URL — yours or a public ride.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => window.open(buildStravaAuthorizeUrl(), '_blank')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Connect Strava
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Paste a Strava activity URL
      </label>

      <div className="flex gap-2">
        <input
          type="url"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
            setImported(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canImport) void handleImport();
          }}
          placeholder="https://www.strava.com/activities/…"
          aria-label="Strava activity URL"
          className={cn(
            'flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors',
            'placeholder:text-muted-foreground/50',
            'focus:border-primary focus:ring-1 focus:ring-primary/30',
            error
              ? 'border-destructive/60 focus:border-destructive focus:ring-destructive/20'
              : 'border-border/70',
          )}
        />
        <Button
          size="sm"
          disabled={!canImport}
          onClick={() => void handleImport()}
          className="shrink-0 gap-1.5"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-[spinSlow_1.5s_linear_infinite]" /> : null}
          Import
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-1.5 rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-xs text-destructive leading-snug">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Success message */}
      {imported && (
        <div className="flex items-start gap-1.5 rounded-lg border border-accent/35 bg-accent/8 px-3 py-2.5 text-xs text-accent-foreground leading-snug animate-fadeUp">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
          <span>
            Imported <span className="font-semibold">{imported.name}</span>
            {' '}({formatDistance(imported.distance)}) — saved to My Routes.
          </span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        Works with your own activities and any public or shared ride on Strava.
        Imported routes are cached locally for 7 days.
      </p>
    </div>
  );
}
