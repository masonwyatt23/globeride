/**
 * StravaCallback — handles the OAuth redirect from Strava.
 *
 * Strava redirects here after the user approves (or denies) the authorization
 * request when the redirect_uri is set to window.location.origin + '/strava-callback'.
 *
 * URL shapes we handle:
 *   Success:  /strava-callback?code=<code>&scope=<scope>&state=<state>
 *   Denied:   /strava-callback?error=access_denied
 *   Scope mismatch: code present but scope lacks activity:write
 *
 * On success:
 *   1. Exchange the code for a refresh token (via the /strava-api proxy).
 *   2. Save the token to sessionStorage (stravaOauth.ts).
 *   3. Redirect to /app?strava=connected so the user lands back in the app.
 *
 * On failure: stay on this page and show a clear, actionable error message.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { exchangeCodeForRefreshToken } from '@/lib/stravaOauth';
import { clearCachedToken } from '@/lib/strava';

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

const REQUIRED_SCOPES = ['activity:write', 'activity:read_all'] as const;

/**
 * Returns true when the scope string returned by Strava contains all required
 * scopes. Strava returns scopes comma-separated: e.g. "read,activity:write".
 */
export function hasRequiredScopes(scopeParam: string | null): boolean {
  if (!scopeParam) return false;
  const granted = scopeParam.split(',').map((s) => s.trim());
  return REQUIRED_SCOPES.every((required) => granted.includes(required));
}

// ---------------------------------------------------------------------------
// Error message helpers — specific, actionable copy for each failure mode
// ---------------------------------------------------------------------------

export type CallbackErrorKind =
  | 'access_denied'
  | 'scope_insufficient'
  | 'missing_code'
  | 'exchange_failed'
  | 'no_client_id';

export interface CallbackError {
  kind: CallbackErrorKind;
  message: string;
  detail?: string;
}

export function parseCallbackError(params: URLSearchParams): CallbackError | null {
  // Strava sets ?error=access_denied when the user clicks "Cancel"
  const error = params.get('error');
  if (error === 'access_denied') {
    return {
      kind: 'access_denied',
      message: 'Authorization cancelled',
      detail:
        'You cancelled the Strava authorization. Click "Connect Strava" in Settings → Data to try again.',
    };
  }
  if (error) {
    return {
      kind: 'exchange_failed',
      message: `Strava returned an error: ${error}`,
      detail: 'Try the authorization flow again from Settings → Data → Connect Strava.',
    };
  }

  const code = params.get('code');
  if (!code) {
    return {
      kind: 'missing_code',
      message: 'No authorization code in the callback URL',
      detail:
        'The URL is missing the "code" parameter Strava should have added. ' +
        'This can happen if the redirect URI is not registered in your Strava app dashboard. ' +
        'Ensure your deployment domain is listed under "Authorization Callback Domain" at ' +
        'https://www.strava.com/settings/api.',
    };
  }

  const scope = params.get('scope');
  if (!hasRequiredScopes(scope)) {
    return {
      kind: 'scope_insufficient',
      message: 'Insufficient scope — activity:write not granted',
      detail:
        `Strava granted scope "${scope ?? '(none)'}". GlobeRide needs ` +
        '"activity:write,activity:read_all" to upload rides. ' +
        'Click "Re-authorize" and make sure to approve all requested permissions.',
    };
  }

  if (!import.meta.env.VITE_STRAVA_CLIENT_ID || !import.meta.env.VITE_STRAVA_CLIENT_SECRET) {
    return {
      kind: 'no_client_id',
      message: 'Strava credentials not configured',
      detail:
        'VITE_STRAVA_CLIENT_ID and VITE_STRAVA_CLIENT_SECRET must be set in .env.local ' +
        '(dev) or as Vercel environment variables (production) before the OAuth flow can complete.',
    };
  }

  return null; // no parse-time error — exchange can proceed
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Phase = 'exchanging' | 'success' | 'error';

export function StravaCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('exchanging');
  const [error, setError] = useState<CallbackError | null>(null);
  const [athleteName, setAthleteName] = useState<string | null>(null);
  const exchanged = useRef(false);

  useEffect(() => {
    // Strict-mode double-invoke guard — codes can only be used once
    if (exchanged.current) return;
    exchanged.current = true;

    const parseError = parseCallbackError(searchParams);
    if (parseError) {
      setError(parseError);
      setPhase('error');
      return;
    }

    const code = searchParams.get('code')!;

    exchangeCodeForRefreshToken(code)
      .then((result) => {
        clearCachedToken();
        const name =
          result.athlete
            ? [result.athlete.firstname, result.athlete.lastname].filter(Boolean).join(' ')
            : null;
        setAthleteName(name);
        setPhase('success');
        // Give the user a moment to see the success state, then navigate back
        setTimeout(() => {
          navigate('/app?strava=connected', { replace: true });
        }, 2000);
      })
      .catch((err: unknown) => {
        setError({
          kind: 'exchange_failed',
          message: err instanceof Error ? err.message : String(err),
          detail:
            'The authorization code may have expired (codes are valid for 10 minutes and ' +
            'can only be used once). Go back to Settings → Data → Connect Strava to try again.',
        });
        setPhase('error');
      });
  }, [searchParams, navigate]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg space-y-4">
        {/* Logo / brand mark */}
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <span className="text-[#FC4C02] font-bold">GlobeRide</span>
          <span>×</span>
          <span>Strava</span>
        </div>

        {phase === 'exchanging' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-[#FC4C02]" />
            <p className="text-sm text-muted-foreground">Completing Strava authorization…</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                {athleteName ? `Connected as ${athleteName}` : 'Strava connected'}
              </p>
              <p className="text-xs text-muted-foreground">
                Returning to GlobeRide…
              </p>
            </div>
          </div>
        )}

        {phase === 'error' && error && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground text-sm">{error.message}</p>
                {error.detail && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{error.detail}</p>
                )}
              </div>
            </div>

            {/* Actionable next steps per error kind */}
            {error.kind === 'scope_insufficient' && (
              <a
                href="/app"
                className="block text-center text-xs text-[#FC4C02] hover:underline font-medium"
              >
                Go to Settings → Data → Re-authorize Strava
              </a>
            )}
            {(error.kind === 'access_denied' ||
              error.kind === 'exchange_failed' ||
              error.kind === 'missing_code') && (
              <a
                href="/app"
                className="block text-center text-xs text-primary hover:underline font-medium"
              >
                Back to GlobeRide
              </a>
            )}
            {error.kind === 'no_client_id' && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Setup required</p>
                <p>
                  Add <code>VITE_STRAVA_CLIENT_ID</code> and{' '}
                  <code>VITE_STRAVA_CLIENT_SECRET</code> to <code>.env.local</code> (local dev)
                  or your Vercel project environment variables (production), then redeploy.
                </p>
                <p>
                  Get your credentials at{' '}
                  <a
                    href="https://www.strava.com/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    strava.com/settings/api
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
