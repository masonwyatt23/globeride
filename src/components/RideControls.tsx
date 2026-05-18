import { useCallback, useState } from 'react';
import { Play, Pause, Square, Save, RotateCcw, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildFit, downloadFit } from '@/lib/fitExporter';
import { uploadFit, stravaCredsPresent, StravaError, type UploadState } from '@/lib/strava';

/**
 * Start / pause / stop transport for the ride, plus end-of-ride export.
 * Pill-shaped glass bar — large enough to hit with sweaty fingers (h-12 = 48px).
 */
export function RideControls() {
  const rideState  = useRideStore((s) => s.rideState);
  const start      = useRideStore((s) => s.start);
  const pause      = useRideStore((s) => s.pause);
  const resume     = useRideStore((s) => s.resume);
  const finish     = useRideStore((s) => s.finish);
  const reset      = useRideStore((s) => s.reset);
  const samples    = useRideStore((s) => s.samples);
  const startedAt  = useRideStore((s) => s.startedAt);
  const route      = useRideStore((s) => s.route);

  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });

  const handleExport = useCallback(() => {
    if (!startedAt || samples.length === 0) return;
    const blob = buildFit({ startTime: startedAt, samples });
    const safe  = (route?.name ?? 'globeride').replace(/[^a-z0-9-_]+/gi, '_');
    const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadFit(blob, `${safe}_${stamp}.fit`);
  }, [startedAt, samples, route?.name]);

  const handleStravaUpload = useCallback(async () => {
    if (!startedAt || samples.length === 0) return;
    if (uploadState.phase === 'uploading' || uploadState.phase === 'polling') return;

    const blob = buildFit({ startTime: startedAt, samples });
    const activityName =
      route?.name
        ? `${route.name} — GlobeRide`
        : `GlobeRide — ${new Date(startedAt).toLocaleDateString()}`;

    try {
      await uploadFit(
        blob,
        { name: activityName, description: 'Uploaded via GlobeRide', trainer: true },
        (state) => setUploadState(state),
      );
    } catch (err) {
      const message =
        err instanceof StravaError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upload failed — check console for details.';
      setUploadState({ phase: 'error', errorMessage: message });
    }
  }, [startedAt, samples, route?.name, uploadState.phase]);

  if (!route) return null;

  return (
    <div className="glass glass-hairline rounded-pill px-3 py-2.5 flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        {rideState === 'ready' && (
          <Button variant="accent" size="lg" className="rounded-pill min-w-[7rem]" onClick={start}>
            <Play className="h-4.5 w-4.5" fill="currentColor" />
            Start ride
          </Button>
        )}

        {rideState === 'running' && (
          <>
            <Button variant="outline" size="lg" className="rounded-pill" onClick={pause}>
              <Pause className="h-4 w-4" />
              Pause
            </Button>
            <Button variant="destructive" size="lg" className="rounded-pill" onClick={finish}>
              <Square className="h-3.5 w-3.5" fill="currentColor" />
              Finish
            </Button>
          </>
        )}

        {rideState === 'paused' && (
          <>
            <Button variant="accent" size="lg" className="rounded-pill" onClick={resume}>
              <Play className="h-4 w-4" fill="currentColor" />
              Resume
            </Button>
            <Button variant="destructive" size="lg" className="rounded-pill" onClick={finish}>
              <Square className="h-3.5 w-3.5" fill="currentColor" />
              Finish
            </Button>
          </>
        )}

        {rideState === 'finished' && (
          <>
            <Button variant="default" size="lg" className="rounded-pill" onClick={handleExport}>
              <Save className="h-4 w-4" />
              Export .FIT
            </Button>

            <StravaUploadButton
              uploadState={uploadState}
              onUpload={handleStravaUpload}
              onReset={() => setUploadState({ phase: 'idle' })}
            />

            <Button variant="outline" size="lg" className="rounded-pill" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              New ride
            </Button>
          </>
        )}
      </div>

      {/* Strava status badge row — only shown when there is something to report */}
      {rideState === 'finished' && uploadState.phase !== 'idle' && (
        <StravaStatusBadge state={uploadState} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StravaUploadButtonProps {
  uploadState: UploadState;
  onUpload: () => void;
  onReset: () => void;
}

function StravaUploadButton({ uploadState, onUpload, onReset }: StravaUploadButtonProps) {
  const credsPresent = stravaCredsPresent();
  const { phase, activityId } = uploadState;

  const isLoading = phase === 'uploading' || phase === 'polling';

  // Success: show a link to the activity
  if (phase === 'success' && activityId) {
    return (
      <Button
        variant="accent"
        size="lg"
        className="rounded-pill"
        asChild
      >
        <a
          href={`https://www.strava.com/activities/${activityId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <CheckCircle2 className="h-4 w-4" />
          View on Strava
        </a>
      </Button>
    );
  }

  // Error: allow retry by resetting state
  if (phase === 'error') {
    return (
      <Button
        variant="outline"
        size="lg"
        className="rounded-pill border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10"
        onClick={onReset}
        title="Click to dismiss and retry"
      >
        <AlertCircle className="h-4 w-4" />
        Upload failed
      </Button>
    );
  }

  // Disabled state when credentials are not configured
  if (!credsPresent) {
    return (
      <Button
        variant="outline"
        size="lg"
        className="rounded-pill"
        disabled
        title="Set VITE_STRAVA_CLIENT_ID, VITE_STRAVA_CLIENT_SECRET, and VITE_STRAVA_REFRESH_TOKEN in .env.local to enable direct Strava upload."
      >
        <Upload className="h-4 w-4" />
        Upload to Strava
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="lg"
      className="rounded-pill hover:border-[#FC4C02]/50 hover:text-[#FC4C02] focus-visible:ring-[#FC4C02]/50"
      onClick={onUpload}
      disabled={isLoading}
      title={isLoading ? 'Uploading to Strava…' : 'Upload this activity directly to Strava'}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {phase === 'uploading' ? 'Uploading…' : 'Processing…'}
        </>
      ) : (
        <>
          <Upload className="h-4 w-4" />
          Upload to Strava
        </>
      )}
    </Button>
  );
}

function StravaStatusBadge({ state }: { state: UploadState }) {
  if (state.phase === 'uploading') {
    return (
      <Badge variant="muted" className="text-[10px]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Uploading .FIT to Strava…
      </Badge>
    );
  }

  if (state.phase === 'polling') {
    return (
      <Badge variant="muted" className="text-[10px]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Strava is processing your activity…
      </Badge>
    );
  }

  if (state.phase === 'success' && state.activityId) {
    return (
      <Badge variant="success" className="text-[10px]">
        <CheckCircle2 className="h-3 w-3" />
        Activity #{state.activityId} saved to Strava
      </Badge>
    );
  }

  if (state.phase === 'error' && state.errorMessage) {
    return (
      <Badge variant="destructive" className="text-[10px] max-w-[24rem] truncate" title={state.errorMessage}>
        <AlertCircle className="h-3 w-3 shrink-0" />
        {state.errorMessage}
      </Badge>
    );
  }

  return null;
}
