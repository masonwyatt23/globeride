import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, Square, Save, RotateCcw, Upload,
  CheckCircle2, AlertCircle, Loader2, Settings,
  Flag, Home,
} from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildFit, downloadFit } from '@/lib/fitExporter';
import { uploadFit, stravaCredsPresent, StravaError, clearCachedToken, type UploadState, type StravaErrorKind } from '@/lib/strava';
import { forceReauth } from '@/lib/stravaOauth';
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
  const navigate  = useNavigate();
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
    rideState === 'running'  ? 'shadow-[0_0_28px_-6px_hsl(var(--accent)/0.6)]' :
    rideState === 'paused'   ? 'shadow-[0_0_24px_-6px_hsl(var(--primary)/0.5)]' :
    rideState === 'finished' ? 'shadow-[0_0_28px_-6px_hsl(var(--primary)/0.4)]' :
    '';

  return (
    <div
      className={cn(
        'glass glass-hairline rounded-2xl sm:rounded-pill px-3 py-2.5 flex flex-col items-center gap-2 transition-shadow duration-500 max-w-[calc(100vw-1.5rem)]',
        glowClass,
      )}
      role="group"
      aria-label="Ride controls"
    >
      <div className="flex flex-wrap items-center justify-center gap-2">

        {rideState === 'ready' && (
          <Button
            variant="accent"
            size="lg"
            aria-label="Start ride"
            className="rounded-pill min-w-[8rem] gap-2 shadow-[0_0_20px_-4px_hsl(var(--accent)/0.5)] hover:shadow-[0_0_28px_-4px_hsl(var(--accent)/0.7)] active:scale-[0.97] transition-all"
            onClick={start}
          >
            <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
            Start ride
          </Button>
        )}

        {rideState === 'running' && (
          <>
            <Button
              variant="outline"
              size="default"
              aria-label="Pause ride"
              className="rounded-pill sm:text-base sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={pause}
            >
              <Pause className="h-4 w-4" aria-hidden="true" />
              Pause
            </Button>
            <Button
              variant="destructive"
              size="default"
              aria-label="Finish ride"
              className="rounded-pill sm:text-base sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={finish}
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              Finish
            </Button>
          </>
        )}

        {rideState === 'paused' && (
          <>
            <Button
              variant="accent"
              size="default"
              aria-label="Resume ride"
              className="rounded-pill sm:text-base sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={resume}
            >
              <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
              Resume
            </Button>
            <Button
              variant="destructive"
              size="default"
              aria-label="Finish ride"
              className="rounded-pill sm:text-base sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={finish}
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
              Finish
            </Button>
          </>
        )}

        {rideState === 'finished' && (
          <>
            <Button
              variant="default"
              size="default"
              aria-label="Download ride as .FIT file"
              className="rounded-pill sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={handleExport}
              disabled={samples.length === 0}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
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
              aria-label="Start a new ride from the beginning"
              className="rounded-pill sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={reset}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              New ride
            </Button>

            <Button
              variant="outline"
              size="default"
              aria-label="Return to the home setup page"
              className="rounded-pill sm:h-11 sm:px-5 active:scale-[0.97] transition-transform"
              onClick={() => navigate('/app')}
            >
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              Home
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
      <Button
        variant="accent"
        size="default"
        aria-label={`View activity #${activityId} on Strava (opens in new tab)`}
        className="rounded-pill active:scale-[0.97] transition-transform"
        asChild
      >
        <a
          href={`https://www.strava.com/activities/${activityId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          View on Strava
        </a>
      </Button>
    );
  }

  // insufficient_scope: force re-auth in same tab (clears stale token + opens OAuth URL)
  if (phase === 'error' && errorKind === 'insufficient_scope') {
    return (
      <Button
        variant="outline"
        size="default"
        aria-label="Re-authorize Strava with activity:write scope"
        className="rounded-pill border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 active:scale-[0.97] transition-transform"
        onClick={() => forceReauth(clearCachedToken)}
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
        Fix Strava permission
      </Button>
    );
  }

  // Other actionable errors (creds_missing, refresh_failed) — navigate to Settings
  if (phase === 'error' && actionUrl) {
    return (
      <Button
        variant="outline"
        size="default"
        aria-label={`${errorButtonLabel(errorKind)} — opens Strava settings`}
        className="rounded-pill border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 active:scale-[0.97] transition-transform"
        asChild
      >
        <a href={actionUrl}>
          <Settings className="h-4 w-4" aria-hidden="true" />
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
        aria-label={`${errorButtonLabel(errorKind)} — click to dismiss`}
        className="rounded-pill border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 active:scale-[0.97] transition-transform"
        onClick={onReset}
      >
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {errorButtonLabel(errorKind)}
      </Button>
    );
  }

  if (!credsPresent) {
    return (
      <Button
        variant="outline"
        size="default"
        aria-label="Strava not configured — open Settings to connect"
        className="rounded-pill opacity-60 cursor-default active:scale-[0.97] transition-transform"
        disabled
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        Upload to Strava
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="default"
      aria-label={isLoading ? (phase === 'uploading' ? 'Uploading to Strava…' : 'Strava is processing…') : 'Upload this activity to Strava'}
      aria-busy={isLoading}
      className="rounded-pill hover:border-[#FC4C02]/50 hover:text-[#FC4C02] focus-visible:ring-[#FC4C02]/50 active:scale-[0.97] transition-transform"
      onClick={onUpload}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {phase === 'uploading' ? 'Uploading…' : 'Processing…'}
        </>
      ) : (
        <>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Upload to Strava
        </>
      )}
    </Button>
  );
}

function StravaStatusBadge({ state }: { state: UploadState }) {
  if (state.phase === 'uploading') {
    return (
      <Badge variant="muted" className="text-[10px]" role="status" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Uploading .FIT to Strava…
      </Badge>
    );
  }
  if (state.phase === 'polling') {
    return (
      <Badge variant="muted" className="text-[10px]" role="status" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Strava is processing your activity…
      </Badge>
    );
  }
  if (state.phase === 'success' && state.activityId) {
    return (
      <Badge variant="success" className="text-[10px]" role="status" aria-live="polite">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
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
        role="alert"
        aria-live="assertive"
        title={state.errorMessage}
        {...(isSettingsIssue && state.actionUrl
          ? { onClick: () => { window.location.hash = state.actionUrl!.replace(/^#/, ''); } }
          : {})}
      >
        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
        {isSettingsIssue
          ? `${state.errorMessage.split('.')[0]} — fix in Settings`
          : state.errorMessage}
      </Badge>
    );
  }
  return null;
}
