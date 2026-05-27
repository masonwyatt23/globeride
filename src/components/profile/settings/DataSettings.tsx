/**
 * DataSettings.tsx — Data tab: Strava connection, auto-upload, clear data.
 *
 * Pulls the full Strava section out of SettingsPanel. The clear-data control
 * is new here; it calls localStorage.clear() + a page reload to give users a
 * clean reset without manually clearing DevTools.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Trash2,
  Zap,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  buildStravaAuthorizeUrl,
  exchangeCodeForRefreshToken,
  saveRefreshTokenOverride,
  getRefreshTokenOverride,
  clearRefreshTokenOverride,
  forceReauth,
} from '@/lib/stravaOauth';
import {
  verifyStravaAccess,
  stravaCredsPresent,
  clearCachedToken,
  type StravaVerifyResult,
} from '@/lib/strava';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/section-header';
import { ToggleRow } from './shared';

// ---------------------------------------------------------------------------
// Data tab root
// ---------------------------------------------------------------------------

export function DataSettings() {
  return (
    <div className="space-y-6">
      <StravaSection />
      <ClearDataSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strava (lifted verbatim from SettingsPanel — logic unchanged)
// ---------------------------------------------------------------------------

type StravaFlowStep = 'idle' | 'waiting_code' | 'exchanging' | 'done';

function StravaSection() {
  const autoUploadStrava = useSettingsStore((st) => st.autoUploadStrava);
  const setSettings = useSettingsStore((st) => st.setSettings);

  const [verifyResult, setVerifyResult] = useState<StravaVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [flowStep, setFlowStep] = useState<StravaFlowStep>('idle');
  const [codeInput, setCodeInput] = useState('');
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(() => !!getRefreshTokenOverride());

  useEffect(() => {
    if (stravaCredsPresent()) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    const result = await verifyStravaAccess();
    setVerifyResult(result);
    setVerifying(false);
  }, []);

  const handleConnect = useCallback(() => {
    if (!import.meta.env.VITE_STRAVA_CLIENT_ID) {
      setExchangeError(
        'VITE_STRAVA_CLIENT_ID is not set. Add it to .env.local and restart the dev server.',
      );
      return;
    }
    const url = buildStravaAuthorizeUrl();
    window.open(url, '_blank', 'noopener,noreferrer');
    setFlowStep('waiting_code');
    setExchangeError(null);
  }, []);

  const handleExchange = useCallback(async () => {
    const trimmed = codeInput.trim();
    if (!trimmed) return;
    setFlowStep('exchanging');
    setExchangeError(null);
    try {
      const result = await exchangeCodeForRefreshToken(trimmed);
      setHasOverride(true);
      setFlowStep('done');
      setCodeInput('');
      clearCachedToken();
      setVerifying(true);
      const freshResult = await verifyStravaAccess();
      setVerifyResult(freshResult);
      setVerifying(false);
      if (!freshResult.ok && result.athlete) {
        setVerifyResult({
          ok: true,
          athleteName: [result.athlete.firstname, result.athlete.lastname]
            .filter(Boolean)
            .join(' '),
        });
      }
    } catch (err) {
      setExchangeError(err instanceof Error ? err.message : String(err));
      setFlowStep('waiting_code');
    }
  }, [codeInput]);

  const handleDisconnect = useCallback(() => {
    clearRefreshTokenOverride();
    clearCachedToken();
    setHasOverride(false);
    setVerifyResult(null);
    setFlowStep('idle');
    setCodeInput('');
    setExchangeError(null);
  }, []);

  const canConnect = !!(
    import.meta.env.VITE_STRAVA_CLIENT_ID &&
    import.meta.env.VITE_STRAVA_CLIENT_SECRET
  );

  return (
    <Section icon={<Zap className="h-4 w-4" />} title="Strava">
      <div className="space-y-3">
        {/* Status chip */}
        <div className="flex items-center gap-2">
          <StravaStatusChip verifying={verifying} result={verifyResult} />
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            aria-label="Test Strava connection"
          >
            {verifying ? 'Checking…' : 'Test connection'}
          </button>
        </div>

        {/* Auto-upload toggle */}
        <ToggleRow
          label="Auto-upload finished rides"
          description="Automatically upload to Strava when a ride finishes (requires Strava connected)"
          checked={autoUploadStrava}
          ariaLabel="Auto-upload finished rides to Strava"
          onChange={(v) => setSettings({ autoUploadStrava: v })}
        />

        {/* Insufficient scope warning */}
        {verifyResult && !verifyResult.ok && verifyResult.error?.kind === 'insufficient_scope' && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <p className="font-semibold">Refresh token lacks activity:write scope</p>
            <p>
              Your current token only has <code>activity:read</code>. Uploads will fail with 401.
              Click below to re-authorize with the correct scope — this will clear the stale token
              and open the Strava authorization page immediately.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 border-amber-500/50 text-amber-700 dark:text-amber-300 hover:border-amber-500 hover:bg-amber-500/10 focus-visible:ring-amber-500/40"
              onClick={() => forceReauth(clearCachedToken)}
            >
              Re-authorize with activity:write
            </Button>
          </div>
        )}

        {/* Not configured notice */}
        {!canConnect && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Credentials not configured</p>
            <p>
              Add <code>VITE_STRAVA_CLIENT_ID</code> and <code>VITE_STRAVA_CLIENT_SECRET</code> to{' '}
              <code>.env.local</code>, then restart the dev server.
            </p>
          </div>
        )}

        {/* Connect / Re-authorize button */}
        {canConnect && flowStep === 'idle' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hover:border-[#FC4C02]/60 hover:text-[#FC4C02] focus-visible:ring-[#FC4C02]/40"
              onClick={handleConnect}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {hasOverride || verifyResult?.ok ? 'Re-authorize Strava' : 'Connect Strava'}
            </Button>
            {hasOverride && (
              <button
                onClick={handleDisconnect}
                className="text-[11px] text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive rounded"
              >
                Disconnect
              </button>
            )}
          </div>
        )}

        {/* Authorization flow — waiting for the user to paste the code */}
        {canConnect && (flowStep === 'waiting_code' || flowStep === 'exchanging') && (
          <div className="space-y-2 rounded-lg border border-border bg-card/40 px-3 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Step 1</span> — A Strava
              authorization page opened in a new tab. Approve the request (scope:{' '}
              <code className="text-[10px]">activity:write,activity:read_all</code>).
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Step 2</span> — After approving,
              copy the <code className="text-[10px]">code</code> value from the URL bar (it looks
              like <code className="text-[10px]">?code=abc123…</code>) and paste it below.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                placeholder="Paste authorization code…"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleExchange(); }}
                disabled={flowStep === 'exchanging'}
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
                aria-label="Authorization code"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                size="sm"
                variant="default"
                onClick={handleExchange}
                disabled={!codeInput.trim() || flowStep === 'exchanging'}
              >
                {flowStep === 'exchanging' ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exchanging…</>
                ) : (
                  'Confirm'
                )}
              </Button>
            </div>
            {exchangeError && (
              <p className="text-[11px] text-destructive mt-1">{exchangeError}</p>
            )}
            <button
              onClick={() => { setFlowStep('idle'); setCodeInput(''); setExchangeError(null); }}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Success confirmation after exchange */}
        {flowStep === 'done' && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            New refresh token saved — uploads will use activity:write scope.
          </div>
        )}

        {/* Paste a refresh token directly */}
        <details className="group">
          <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
            <Copy className="h-3 w-3" />
            <span>Or paste a refresh token directly</span>
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If you already have a refresh token with <code>activity:write</code> scope, paste it
              here. It will be stored in <code>sessionStorage</code> and override the env var
              without requiring a server restart. You will need to reconnect after closing the
              browser.
            </p>
            <PasteRefreshTokenField
              onSave={(token) => {
                saveRefreshTokenOverride(token);
                clearCachedToken();
                setHasOverride(true);
                handleVerify();
              }}
            />
          </div>
        </details>
      </div>
    </Section>
  );
}

function StravaStatusChip({
  verifying,
  result,
}: {
  verifying: boolean;
  result: StravaVerifyResult | null;
}) {
  if (verifying) {
    return (
      <Badge variant="muted" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking…
      </Badge>
    );
  }
  if (!stravaCredsPresent()) {
    return <Badge variant="muted">Not configured</Badge>;
  }
  if (!result) {
    return <Badge variant="muted">Not tested</Badge>;
  }
  if (result.ok) {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Connected{result.athleteName ? ` as ${result.athleteName}` : ''}
      </Badge>
    );
  }
  const kind = result.error?.kind;
  if (kind === 'insufficient_scope') {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Insufficient scope
      </Badge>
    );
  }
  if (kind === 'creds_missing') {
    return <Badge variant="muted">Not configured</Badge>;
  }
  if (kind === 'refresh_failed') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Auth failed
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertCircle className="h-3 w-3" />
      Error
    </Badge>
  );
}

function PasteRefreshTokenField({ onSave }: { onSave: (token: string) => void }) {
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

// ---------------------------------------------------------------------------
// Clear local data
// ---------------------------------------------------------------------------

function ClearDataSection() {
  const [confirming, setConfirming] = useState(false);

  const handleClear = useCallback(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  }, []);

  return (
    <Section icon={<Trash2 className="h-4 w-4" />} title="Local data">
      <div className="space-y-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          GlobeRide stores all your data locally — routes, rides, gear, and settings. Clearing resets
          everything to factory defaults and removes all saved routes from IndexedDB.
        </p>
        {!confirming ? (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive focus-visible:ring-destructive/40"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all local data…
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" onClick={handleClear}>
              Yes, clear everything
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}
