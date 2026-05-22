import { useCallback, useState } from 'react';
import {
  Play, Pause, Square, Save, RotateCcw, Upload,
  CheckCircle2, AlertCircle, Loader2, Settings,
  Flag,
} from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildFit, downloadFit } from '@/lib/fitExporter';
import { uploadFit, stravaCredsPresent, StravaError, type UploadState, type StravaErrorKind } from '@/lib/strava';
import { cn } from '@/lib/utils';

/**
 * Ride transport controls — the primary action bar the rider reaches for
 * to start, pause, resume, or finish a ride.
 *
 * Design: a pill-shaped glass bar with a glow that changes color based on
 * ride state. Large touch targets (min 48 px) for sweaty-finger use.
 *
 * Post-ride: export .FIT and Strava upload inline.
 */
export function RideControls() {
  const rideState = useRideStore((s) => s.rideState);
  const start     = useRideStore((s) => s.start);
  const pause     = useRideStore((s) => s.pause);
  const resume    = useRideStore((s) => s.resume);
  const finish    = useRideStore((s) => s.finish);
  const reset     = useRideStore((s) => s.reset);
  const samples   = useRideStore((s) => s.samples);
  const startedAt = useRideStore((s) => s.startedAt);
  const route     = useRideStore((s) => s.route);

  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });

  const handleExport = useCallback(() => {
    if (!startedAt || samples.length === 0) return;
    const blob  = buildFit({ startTime: startedAt, samples });
    const safe  = (route?.name ?? 'globeride').replace(/[^a-z0-9-_]+/gi, '_');
    const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadFit(blob, `${safe}_${stamp}.fit`);
  }, [startedAt, samples, route?.name]);

  const handleStravaUpload = useCallback(async () => {
    if (!startedAt || samples.length === 0) return;
    if (uploadState.phase === 'uploading' || uploadState.phase === 'polling') return;

    const blob         = buildFit({ startTime: startedAt, samples });
    const activityName = route?.name
      ? `${route.name} — GlobeRide`
      : `GlobeRide — ${new Date(startedAt).toLocaleDateString()}`;

    try {
      await uploadFit(
        blob,
        { name: activityName, description: 'Uploaded via GlobeRide', trainer: true },
        (state) => setUploadState(state),
      );
    } catch (err) {
      if (err instanceof StravaError) {
        setUploadState({
          phase: 'error',
          errorMessage: err.message,
          errorKind: err.kind,
          actionUrl: err.actionUrl,
        });
      } else {
        setUploadState({
          phase: 'error',
          errorMessage: err instanceof Error ? err.message : 'Upload failed — check console.',
          errorKind: 'unknown',
        });
      }
    }
  }, [startedAt, samples, route?.name, uploadState.phase]);

  if (!route) return null;

  // Glow color varies by ride state
  const glowClass =
    rideState === 'running' ? 'shadow-[0_0_28px_-6px_hsl(var(--accent)/0.6)]' :
    rideState === 'paused'  ? 'shadow-[0_0_24px_-6px_hsl(var(--primary)/0.5)]' :
    rideState === 'finished'? 'shadow-[0_0_28px_-6px_hsl(var(--primary)/0.4)]' :
    '';

  return (
    <div className={cn(
      'glass glass-hairline rounded-2xl sm:rounded-pill px-3 py-2.5 flex flex-col items-center gap-2 transition-shadow duration-500 max-w-[calc(100vw-1.5rem)]',
      glowClass,
    )}>
      <div className="flex flex-wrap items-center justify-center gap-2">

        {rideState === 'ready' && (
          <Button
            variant="accent"
            size="lg"
            className="rounded-pill min-w-[8rem] gap-2 shadow-[0_0_20px_-4px_hsl(var(--accent)/0.5)] hover:shadow-[0_0_28px_-4px_hsl(var(--accent)/0.7)] active:scale-[0.97] transition-all"
            onClick={start}
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Start ride
          </Button>
        )}

        {rideState === 'running' && (
          <>
            <Button
              variant="outline"
              size="default"
              className="rounded-pill sm:text-base sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={pause}
            >
              <Pause className="h-4 w-4" />
              Pause
            </Button>
            <Button
              variant="destructive"
              size="default"
              className="rounded-pill sm:text-base sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={finish}
            >
              <Flag className="h-3.5 w-3.5" />
              Finish
            </Button>
          </>
        )}

        {rideState === 'paused' && (
          <>
            <Button
              variant="accent"
              size="default"
              className="rounded-pill sm:text-base sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={resume}
            >
              <Play className="h-4 w-4" fill="currentColor" />
              Resume
            </Button>
            <Button
              variant="destructive"
              size="default"
              className="rounded-pill sm:text-base sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={finish}
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" />
              Finish
            </Button>
          </>
        )}

        {rideState === 'finished' && (
          <>
            <Button
              variant="default"
              size="default"
              className="rounded-pill sm:size-lg active:scale-[0.97] transition-transform"
              onClick={handleExport}
              title="Download your ride as a .FIT file"
            >
              <Save className="h-4 w-4" />
              Export .FIT
            </Button>

            <StravaUploadButton
              uploadState={uploadState}
              onUpload={handleStravaUpload}
              onReset={() => setUploadState({ phase: 'idle' })}
            />

            <Button
              variant="outline"
              size="default"
              className="rounded-pill sm:size-lg active:scale-[0.97] transition-transform"
              onClick={reset}
              title="Reset to start of route"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New ride
            </Button>
          </>
        )}
      </div>

      {/* Strava status badge — only when there's something to show */}
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

function errorButtonLabel(kind: StravaErrorKind | undefined): string {
  switch (kind) {
    case 'creds_missing':      return 'Configure Strava';
    case 'refresh_failed':     return 'Re-authorize Strava';
    case 'insufficient_scope': return 'Fix Strava permission';
    case 'network_error':      return 'Network error — retry?';
    case 'timeout':            return 'Timed out — retry?';
    default:                   return 'Upload failed';
  }
}

function StravaUploadButton({ uploadState, onUpload, onReset }: StravaUploadButtonProps) {
  const credsPresent = stravaCredsPresent();
  const { phase, activityId, errorKind, actionUrl } = uploadState;
  const isLoading = phase === 'uploading' || phase === 'polling';

  if (phase === 'success' && activityId) {
    return (
      <Button variant="accent" size="default" className="rounded-pill active:scale-[0.97] transition-transform" asChild>
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

  if (phase === 'error' && actionUrl) {
    return (
      <Button
        variant="outline"
        size="default"
        className="rounded-pill border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 active:scale-[0.97] transition-transform"
        asChild
      >
        <a href={actionUrl}>
          <Settings className="h-4 w-4" />
          {errorButtonLabel(errorKind)}
        </a>
      </Button>
    );
  }

  if (phase === 'error') {
    return (
      <Button
        variant="outline"
        size="default"
        className="rounded-pill border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 active:scale-[0.97] transition-transform"
        onClick={onReset}
        title="Click to dismiss and retry"
      >
        <AlertCircle className="h-4 w-4" />
        {errorButtonLabel(errorKind)}
      </Button>
    );
  }

  if (!credsPresent) {
    return (
      <Button
        variant="outline"
        size="default"
        className="rounded-pill opacity-60 active:scale-[0.97] transition-transform"
        asChild
        title="Strava credentials not configured — open Settings to connect"
      >
        <a href="#settings-strava">
          <Upload className="h-4 w-4" />
          Upload to Strava
        </a>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="default"
      className="rounded-pill hover:border-[#FC4C02]/50 hover:text-[#FC4C02] focus-visible:ring-[#FC4C02]/50 active:scale-[0.97] transition-transform"
      onClick={onUpload}
      disabled={isLoading}
      title={isLoading ? 'Uploading to Strava…' : 'Upload this activity to Strava'}
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
    const isSettingsIssue =
      state.errorKind === 'insufficient_scope' ||
      state.errorKind === 'creds_missing' ||
      state.errorKind === 'refresh_failed';
    return (
      <Badge
        variant="destructive"
        className="text-[10px] max-w-[28rem] truncate cursor-pointer"
        title={state.errorMessage}
        {...(isSettingsIssue && state.actionUrl
          ? { onClick: () => { window.location.hash = state.actionUrl!.replace(/^#/, ''); } }
          : {})}
      >
        <AlertCircle className="h-3 w-3 shrink-0" />
        {isSettingsIssue
          ? `${state.errorMessage.split('.')[0]} — fix in Settings`
          : state.errorMessage}
      </Badge>
    );
  }
  return null;
}
