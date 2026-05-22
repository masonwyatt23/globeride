/**
 * StravaConnect — reusable Strava connect + upload widget.
 *
 * Drop into any screen. Handles the full lifecycle:
 *   not-connected → connecting (OAuth flow) → connected → uploading → uploaded / error
 *
 * Props:
 *   fitBlob     – Blob from buildFit(), required for the Upload action.
 *                 When null the upload button is hidden (connection-only mode).
 *   activityName – Name to give the uploaded Strava activity.
 *   className   – Optional wrapper class.
 *   onUploaded  – Called with the new Strava activity id when upload succeeds.
 *
 * Usage (post-ride summary):
 *   <StravaConnect fitBlob={blob} activityName="Morning Ride" onUploaded={(id) => …} />
 *
 * Usage (connection-only, e.g. in a settings-style panel):
 *   <StravaConnect fitBlob={null} />
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Upload,
  ArrowRight,
  Link2Off,
  Copy,
  RefreshCw,
  Activity,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  buildStravaAuthorizeUrl,
  exchangeCodeForRefreshToken,
  saveRefreshTokenOverride,
  getRefreshTokenOverride,
  clearRefreshTokenOverride,
} from '@/lib/stravaOauth';
import {
  verifyStravaAccess,
  stravaCredsPresent,
  clearCachedToken,
  uploadFit,
  StravaError,
  type StravaVerifyResult,
  type UploadState,
} from '@/lib/strava';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectStatus =
  | 'unconfigured'   // VITE_STRAVA_CLIENT_ID / SECRET not set
  | 'not-connected'  // creds present but no refresh token
  | 'connecting'     // OAuth flow open / code paste waiting
  | 'verifying'      // probing /athlete
  | 'connected'      // verified OK
  | 'error';         // verify failed (not scope — that's sub-state of connected)

type OAuthStep = 'idle' | 'waiting_code' | 'exchanging';

export interface StravaConnectProps {
  /** .FIT blob to upload. Omit / null to show connection UI only. */
  fitBlob?: Blob | null;
  /** Activity name passed to Strava on upload. */
  activityName?: string;
  /** Called when an activity is successfully created on Strava. */
  onUploaded?: (activityId: number) => void;
  className?: string;
  /** Compact single-line mode — just the status badge + action button. */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userFriendlyError(err: unknown): string {
  if (err instanceof StravaError) {
    switch (err.kind) {
      case 'creds_missing':
        return 'Strava credentials are not configured. Add them to .env.local.';
      case 'refresh_failed':
        return 'Strava rejected your credentials. Try re-connecting.';
      case 'insufficient_scope':
        return 'Token lacks activity:write scope. Re-connect to fix.';
      case 'duplicate_activity':
        return 'Already uploaded — this ride is on Strava.';
      case 'network_error':
        return 'Cannot reach Strava. Check your connection.';
      case 'timeout':
        return 'Strava took too long to process the activity. Check Strava manually.';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Status badge — matches SettingsPanel's StravaStatusChip style. */
function StatusBadge({
  status,
  athleteName,
  verifyResult,
}: {
  status: ConnectStatus;
  athleteName?: string;
  verifyResult: StravaVerifyResult | null;
}) {
  if (status === 'verifying') {
    return (
      <Badge variant="muted" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking…
      </Badge>
    );
  }
  if (status === 'unconfigured') {
    return <Badge variant="muted">Not configured</Badge>;
  }
  if (status === 'not-connected') {
    return <Badge variant="muted">Not connected</Badge>;
  }
  if (status === 'connecting') {
    return (
      <Badge variant="muted" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Connecting…
      </Badge>
    );
  }
  if (status === 'connected') {
    const scope = verifyResult?.error?.kind === 'insufficient_scope';
    if (scope) {
      return (
        <Badge variant="warning" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Insufficient scope
        </Badge>
      );
    }
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {athleteName ? `Connected as ${athleteName}` : 'Connected'}
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }
  return null;
}

/** Upload status display — shown while or after uploading. */
function UploadStatus({ state, activityId }: { state: UploadState; activityId?: number }) {
  if (state.phase === 'uploading') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        Uploading to Strava…
      </div>
    );
  }
  if (state.phase === 'polling') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        Processing activity…
      </div>
    );
  }
  if (state.phase === 'success') {
    const id = activityId ?? state.activityId;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Activity saved to Strava
        </div>
        {id && (
          <a
            href={`https://www.strava.com/activities/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }
  if (state.phase === 'error') {
    const isDuplicate = state.errorKind === 'duplicate_activity';
    return (
      <div className={cn(
        'flex items-start gap-1.5 text-xs rounded-lg px-3 py-2 border',
        isDuplicate
          ? 'border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300'
          : 'border-destructive/30 bg-destructive/8 text-destructive',
      )}>
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{state.errorMessage ?? 'Upload failed'}</span>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// OAuth code-paste flow
// ---------------------------------------------------------------------------

function OAuthCodeStep({
  step,
  onCancel,
  onExchange,
}: {
  step: OAuthStep;
  onCancel: () => void;
  onExchange: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    try {
      onExchange(trimmed);
    } catch {
      setErr('Invalid code — try the flow again.');
      setBusy(false);
    }
  }, [code, onExchange]);

  if (step === 'idle') return null;

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-card/40 px-3.5 py-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">Step 1 —</span>{' '}
        A Strava authorization page opened in a new tab. Approve the request
        (scope: <code className="text-[10px]">activity:write,activity:read_all</code>).
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">Step 2 —</span>{' '}
        After approving, copy the <code className="text-[10px]">code=…</code> value
        from the redirect URL and paste it below.
      </p>

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Paste authorization code…"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
          disabled={busy || step === 'exchanging'}
          className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
          aria-label="Authorization code"
        />
        <Button
          size="sm"
          variant="default"
          onClick={() => void handleSubmit()}
          disabled={!code.trim() || busy || step === 'exchanging'}
        >
          {step === 'exchanging' ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exchanging…</>
          ) : (
            <>Confirm <ArrowRight className="h-3.5 w-3.5" /></>
          )}
        </Button>
      </div>

      {err && <p className="text-[11px] text-destructive">{err}</p>}

      <button
        onClick={onCancel}
        className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StravaConnect({
  fitBlob = null,
  activityName = 'GlobeRide Activity',
  onUploaded,
  className,
  compact = false,
}: StravaConnectProps) {
  // --- Connection state ---
  const [status, setStatus] = useState<ConnectStatus>('not-connected');
  const [reverifying, setReverifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<StravaVerifyResult | null>(null);
  const [athleteName, setAthleteName] = useState<string | undefined>();
  const [oauthStep, setOauthStep] = useState<OAuthStep>('idle');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(() => !!getRefreshTokenOverride());

  // --- Upload state ---
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });
  const [uploadedId, setUploadedId] = useState<number | undefined>();

  // Determine initial status from env + localStorage
  useEffect(() => {
    const canConfigure = !!(
      import.meta.env.VITE_STRAVA_CLIENT_ID &&
      import.meta.env.VITE_STRAVA_CLIENT_SECRET
    );
    if (!canConfigure) {
      setStatus('unconfigured');
      return;
    }
    if (!stravaCredsPresent()) {
      setStatus('not-connected');
      return;
    }
    // Auto-verify
    setStatus('verifying');
    verifyStravaAccess().then((result) => {
      setVerifyResult(result);
      if (result.ok) {
        setAthleteName(result.athleteName);
        setStatus('connected');
      } else {
        // If we have insufficient scope, still show as "connected" (with warning sub-state)
        if (result.error?.kind === 'insufficient_scope') {
          setStatus('connected');
        } else {
          setStatus('error');
        }
      }
    }).catch(() => setStatus('error'));
  }, []);

  // --- OAuth connect flow ---
  const handleConnect = useCallback(() => {
    if (!import.meta.env.VITE_STRAVA_CLIENT_ID) {
      setConnectError('VITE_STRAVA_CLIENT_ID is not set — add it to .env.local');
      return;
    }
    try {
      const url = buildStravaAuthorizeUrl();
      window.open(url, '_blank', 'noopener,noreferrer');
      setOauthStep('waiting_code');
      setConnectError(null);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleExchange = useCallback(async (code: string) => {
    setOauthStep('exchanging');
    setConnectError(null);
    try {
      const result = await exchangeCodeForRefreshToken(code);
      // Token auto-saved by exchangeCodeForRefreshToken
      setHasOverride(true);
      clearCachedToken();
      setOauthStep('idle');
      setStatus('verifying');

      const fresh = await verifyStravaAccess();
      setVerifyResult(fresh);

      if (fresh.ok) {
        setAthleteName(fresh.athleteName);
        setStatus('connected');
      } else if (!fresh.ok && result.athlete) {
        // Exchange gave us an athlete even if verify is flaky
        const name = [result.athlete.firstname, result.athlete.lastname]
          .filter(Boolean)
          .join(' ');
        setAthleteName(name);
        setStatus('connected');
        setVerifyResult({ ok: true, athleteName: name });
      } else if (fresh.error?.kind === 'insufficient_scope') {
        setStatus('connected');
      } else {
        setStatus('error');
        setConnectError(fresh.error ? userFriendlyError(fresh.error) : 'Verification failed');
      }
    } catch (err) {
      setConnectError(userFriendlyError(err));
      setOauthStep('waiting_code');
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    clearRefreshTokenOverride();
    clearCachedToken();
    setHasOverride(false);
    setVerifyResult(null);
    setAthleteName(undefined);
    setStatus('not-connected');
    setOauthStep('idle');
    setConnectError(null);
    setUploadState({ phase: 'idle' });
    setUploadedId(undefined);
  }, []);

  const handleReVerify = useCallback(async () => {
    setReverifying(true);
    setVerifyResult(null);
    const result = await verifyStravaAccess();
    setVerifyResult(result);
    setReverifying(false);
    if (result.ok) {
      setAthleteName(result.athleteName);
      setStatus('connected');
    } else if (result.error?.kind === 'insufficient_scope') {
      setStatus('connected');
    } else {
      setStatus('error');
    }
  }, []);

  // --- Upload ---
  const handleUpload = useCallback(async () => {
    if (!fitBlob) return;
    setUploadState({ phase: 'uploading' });
    setUploadedId(undefined);
    try {
      const result = await uploadFit(
        fitBlob,
        { name: activityName, trainer: true },
        setUploadState,
      );
      setUploadState({ phase: 'success', activityId: result.id });
      setUploadedId(result.id);
      onUploaded?.(result.id);
    } catch (err) {
      const msg = userFriendlyError(err);
      const kind = err instanceof StravaError ? err.kind : 'unknown';
      setUploadState({ phase: 'error', errorMessage: msg, errorKind: kind });
    }
  }, [fitBlob, activityName, onUploaded]);

  const isUploading = uploadState.phase === 'uploading' || uploadState.phase === 'polling';
  const isUploaded = uploadState.phase === 'success';
  const canUpload = !!fitBlob && status === 'connected' && !isUploading && !isUploaded;
  const canConnect = status === 'not-connected' || status === 'error';
  const isConnected = status === 'connected';
  const isConfigured = status !== 'unconfigured';

  // ---------------------------------------------------------------------------
  // COMPACT mode — just badge + action
  // ---------------------------------------------------------------------------
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 flex-wrap', className)}>
        <StatusBadge status={status} athleteName={athleteName} verifyResult={verifyResult} />

        {canConnect && isConfigured && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 hover:border-[#FC4C02]/60 hover:text-[#FC4C02]"
            onClick={handleConnect}
          >
            <ExternalLink className="h-3 w-3" />
            Connect
          </Button>
        )}

        {isConnected && canUpload && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 hover:border-[#FC4C02]/60 hover:text-[#FC4C02]"
            onClick={() => void handleUpload()}
          >
            <Upload className="h-3 w-3" />
            Upload to Strava
          </Button>
        )}

        {isConnected && isUploading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {uploadState.phase === 'uploading' ? 'Uploading…' : 'Processing…'}
          </span>
        )}

        {isConnected && isUploaded && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            On Strava
            {uploadedId && (
              <a
                href={`https://www.strava.com/activities/${uploadedId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </span>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // FULL mode
  // ---------------------------------------------------------------------------
  return (
    <div className={cn('space-y-3', className)}>
      {/* Header row — status + secondary actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Strava wordmark accent */}
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#FC4C02]">
          <Activity className="h-3.5 w-3.5" />
          Strava
        </span>

        <StatusBadge
          status={reverifying ? 'verifying' : status}
          athleteName={athleteName}
          verifyResult={verifyResult}
        />

        {/* Re-check link */}
        {isConnected && (
          <button
            onClick={() => void handleReVerify()}
            disabled={reverifying}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            <span className="flex items-center gap-0.5">
              {reverifying ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
              {reverifying ? 'Checking…' : 'Recheck'}
            </span>
          </button>
        )}

        {/* Disconnect */}
        {hasOverride && isConnected && (
          <button
            onClick={handleDisconnect}
            className="ml-auto text-[11px] text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors flex items-center gap-0.5"
          >
            <Link2Off className="h-2.5 w-2.5" />
            Disconnect
          </button>
        )}
      </div>

      {/* Unconfigured notice */}
      {status === 'unconfigured' && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Credentials not configured</p>
          <p>
            Add <code>VITE_STRAVA_CLIENT_ID</code> and <code>VITE_STRAVA_CLIENT_SECRET</code>{' '}
            to <code>.env.local</code>, then restart the dev server.
          </p>
        </div>
      )}

      {/* Connect / re-authorize button */}
      {isConfigured && (canConnect || (isConnected && verifyResult?.error?.kind === 'insufficient_scope')) && oauthStep === 'idle' && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 hover:border-[#FC4C02]/60 hover:text-[#FC4C02] focus-visible:ring-[#FC4C02]/40"
            onClick={handleConnect}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {hasOverride || isConnected ? 'Re-authorize Strava' : 'Connect Strava'}
          </Button>
        </div>
      )}

      {/* Insufficient scope warning */}
      {isConnected && verifyResult?.error?.kind === 'insufficient_scope' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300 space-y-1">
          <p className="font-semibold">Token lacks activity:write scope</p>
          <p>Uploads will fail. Re-authorize above to get the correct permissions.</p>
        </div>
      )}

      {/* OAuth code-paste step */}
      {oauthStep !== 'idle' && (
        <OAuthCodeStep
          step={oauthStep}
          onCancel={() => { setOauthStep('idle'); setConnectError(null); }}
          onExchange={(code) => void handleExchange(code)}
        />
      )}

      {connectError && oauthStep === 'idle' && (
        <p className="text-[11px] text-destructive">{connectError}</p>
      )}

      {/* Manual token paste (collapsed by default) */}
      {isConfigured && oauthStep === 'idle' && (
        <details className="group">
          <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded select-none">
            <Copy className="h-3 w-3" />
            Or paste a refresh token directly
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Paste a refresh token with <code>activity:write</code> scope. Stored in{' '}
              <code>localStorage</code> — overrides the env var immediately.
            </p>
            <PasteTokenField
              onSave={(token) => {
                saveRefreshTokenOverride(token);
                clearCachedToken();
                setHasOverride(true);
                void handleReVerify();
              }}
            />
          </div>
        </details>
      )}

      {/* Upload section — only shown when a FIT blob is provided */}
      {fitBlob && isConnected && verifyResult?.error?.kind !== 'insufficient_scope' && (
        <div className="border-t border-border/50 pt-3 space-y-2.5">
          {/* Upload button */}
          {!isUploaded && (
            <Button
              variant="default"
              size="sm"
              className="w-full gap-1.5 bg-[#FC4C02] hover:bg-[#FC4C02] hover:brightness-110 text-white shadow-[0_4px_18px_-5px_#FC4C0255] hover:shadow-[0_6px_22px_-5px_#FC4C0265] focus-visible:ring-[#FC4C02]/40"
              onClick={() => void handleUpload()}
              disabled={isUploading}
            >
              {isUploading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {uploadState.phase === 'uploading' ? 'Uploading…' : 'Processing…'}</>
              ) : (
                <><Upload className="h-3.5 w-3.5" /> Upload to Strava</>
              )}
            </Button>
          )}

          {/* Upload status */}
          <UploadStatus state={uploadState} activityId={uploadedId} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline token paste field
// ---------------------------------------------------------------------------

function PasteTokenField({ onSave }: { onSave: (token: string) => void }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        placeholder="Paste refresh token…"
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-label="Strava refresh token override"
        autoComplete="off"
        spellCheck={false}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!value.trim() || saved}
        onClick={() => {
          if (!value.trim()) return;
          onSave(value.trim());
          setValue('');
          setSaved(true);
        }}
      >
        {saved ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : 'Save'}
      </Button>
    </div>
  );
}
