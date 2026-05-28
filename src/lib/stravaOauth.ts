/**
 * Strava OAuth helpers — manual / backend-less authorization flow.
 *
 * Because GlobeRide has no backend, the OAuth exchange runs entirely in the
 * browser via the /strava-api Vite proxy (mirrors the same proxy used for
 * token refresh + upload). The flow:
 *
 *   Auto-capture path (preferred, used by forceReauth / Connect button):
 *   1. User clicks "Connect Strava" → current tab navigates to the Strava
 *      authorize URL with redirect_uri = window.location.origin + '/strava-callback'.
 *   2. User approves on Strava → redirected to /strava-callback?code=…
 *   3. The StravaCallback route extracts the code and calls exchangeCodeForRefreshToken().
 *   4. On success, redirect to /app?strava=connected.
 *
 *   Manual copy-paste path (fallback, shown in Settings → Data):
 *   1. User clicks "Connect Strava" → new tab opens the authorize URL.
 *      redirect_uri is Strava's own OOB page (http://developers.strava.com).
 *   2. After approval the code appears in the OOB page URL bar.
 *   3. User copies the code, pastes it in the input, clicks Confirm.
 *   4. App calls exchangeCodeForRefreshToken(code) directly.
 *
 * Scope requested: activity:write,activity:read_all  (covers upload + read).
 *
 * NEVER log or persist the client_secret beyond what the env var already does.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** sessionStorage key for the user-supplied refresh token override. */
export const STRAVA_RT_OVERRIDE_KEY = 'globeride.strava.refreshTokenOverride';

/**
 * Strava's official out-of-band redirect URI for apps without a web server.
 * After approval the user lands on the Strava developers page; the `code`
 * parameter is visible in the URL bar and the user copies it manually.
 *
 * See: https://developers.strava.com/docs/authentication/
 *
 * NOTE: the previous value ('https://www.strava.com/oauth/authorize') was
 * incorrect — it pointed at the authorize endpoint itself, causing Strava to
 * reject every redirect with an OAuth error ("redirect_uri did not match").
 */
export const STRAVA_OOB_REDIRECT_URI = 'http://developers.strava.com';

/**
 * Default redirect URI for the auto-capture flow.
 * The /strava-callback route reads ?code= from the URL and completes the
 * exchange automatically (no copy-paste required).
 */
export function stravaCallbackUri(): string {
  // Use globalThis so this can be called in server-side / test environments
  // that mock globalThis.location without a full jsdom setup.
  const origin =
    typeof globalThis !== 'undefined' && globalThis.location
      ? globalThis.location.origin
      : 'http://localhost';
  return `${origin}/strava-callback`;
}

// ---------------------------------------------------------------------------
// Authorize URL builder
// ---------------------------------------------------------------------------

export interface StravaAuthorizeUrlOpts {
  /** Override the redirect_uri (default: Strava OOB page). */
  redirectUri?: string;
}

/**
 * Build the Strava OAuth authorize URL.
 *
 * By default uses the OOB redirect (http://developers.strava.com) so the user
 * can see and copy the code manually. Pass redirectUri: stravaCallbackUri() to
 * use the auto-capture /strava-callback route instead (no copy-paste needed).
 */
export function buildStravaAuthorizeUrl(opts: StravaAuthorizeUrlOpts = {}): string {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error('VITE_STRAVA_CLIENT_ID is not set — add it to .env.local');
  }

  const redirectUri = opts.redirectUri ?? STRAVA_OOB_REDIRECT_URI;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'force', // always show the approval screen so scope is confirmed
    scope: 'activity:write,activity:read_all',
  });

  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Code → refresh token exchange
// ---------------------------------------------------------------------------

interface StravaTokenExchangeResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  athlete?: { id: number; firstname: string; lastname: string };
}

export interface StravaTokenExchangeResult {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  athlete?: { id: number; firstname: string; lastname: string };
}

/**
 * Exchange a one-time authorization code for tokens.
 * Uses the /strava-api proxy to avoid CORS.
 *
 * On success, automatically persists the refresh token to localStorage so
 * strava.ts picks it up immediately without requiring a page reload.
 *
 * Throws a descriptive Error on failure — callers should catch and display.
 */
export async function exchangeCodeForRefreshToken(
  code: string,
): Promise<StravaTokenExchangeResult> {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;
  const clientSecret = import.meta.env.VITE_STRAVA_CLIENT_SECRET as string | undefined;

  if (!clientId || !clientSecret) {
    throw new Error(
      'VITE_STRAVA_CLIENT_ID and VITE_STRAVA_CLIENT_SECRET must be set in .env.local',
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  });

  const res = await fetch('/strava-api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // surface the most common mistakes clearly
    if (res.status === 400) {
      throw new Error(
        `Invalid authorization code (HTTP 400). Codes expire in 10 minutes and can only be used once — try the flow again.`,
      );
    }
    if (res.status === 401) {
      throw new Error(
        `Bad client_id or client_secret (HTTP 401). Check your .env.local values.`,
      );
    }
    throw new Error(`Token exchange failed: HTTP ${res.status} — ${text}`);
  }

  const json = (await res.json()) as StravaTokenExchangeResponse;

  // Persist override so strava.ts picks it up immediately
  saveRefreshTokenOverride(json.refresh_token);

  // Cache athlete info for display without re-fetching
  if (json.athlete) {
    saveAthleteCache({
      id: json.athlete.id,
      firstname: json.athlete.firstname,
      lastname: json.athlete.lastname,
    });
  }

  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    expiresAt: json.expires_at,
    athlete: json.athlete,
  };
}

// ---------------------------------------------------------------------------
// sessionStorage override helpers
// ---------------------------------------------------------------------------

/**
 * Persist a user-supplied refresh token to sessionStorage.
 * strava.ts calls getRefreshTokenOverride() in preference to the env var.
 *
 * Security note: sessionStorage is chosen over localStorage deliberately —
 * the refresh token is a long-lived OAuth credential and storing it in
 * localStorage exposes it to any XSS payload that runs in this origin
 * (it persists indefinitely across tabs and browser restarts). sessionStorage
 * is cleared when the browser tab/window closes, limiting the exfiltration
 * window significantly. The trade-off is the user must reconnect Strava after
 * closing the browser — this is intentional and preferred over the security
 * risk of indefinite localStorage persistence.
 */
export function saveRefreshTokenOverride(token: string): void {
  try {
    sessionStorage.setItem(STRAVA_RT_OVERRIDE_KEY, token);
  } catch {
    // storage blocked — ignore, env var will be used as fallback
  }
}

/** Return the sessionStorage-stored refresh token, or null if absent. */
export function getRefreshTokenOverride(): string | null {
  try {
    return sessionStorage.getItem(STRAVA_RT_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/** Remove the sessionStorage refresh token override (revert to env var). */
export function clearRefreshTokenOverride(): void {
  try {
    sessionStorage.removeItem(STRAVA_RT_OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Athlete cache helpers — persist basic athlete info after a successful
// OAuth exchange so the UI can show the athlete name without re-fetching.
// ---------------------------------------------------------------------------

const LS_ATHLETE_KEY = 'globeride.strava.athlete';

export interface CachedAthlete {
  id: number;
  firstname: string;
  lastname: string;
}

/**
 * Persist basic athlete info returned by the OAuth exchange.
 * Call after a successful exchangeCodeForRefreshToken().
 */
export function saveAthleteCache(athlete: CachedAthlete): void {
  try {
    localStorage.setItem(LS_ATHLETE_KEY, JSON.stringify(athlete));
  } catch {
    // ignore
  }
}

/** Return the cached athlete, or null if absent / malformed. */
export function getAthleteCache(): CachedAthlete | null {
  try {
    const raw = localStorage.getItem(LS_ATHLETE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedAthlete;
  } catch {
    return null;
  }
}

/** Clear the athlete cache (call on disconnect). */
export function clearAthleteCache(): void {
  try {
    localStorage.removeItem(LS_ATHLETE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns true when the app has both client credentials configured AND
 * a refresh token override in sessionStorage (i.e. the user has completed
 * the OAuth flow at least once). Does NOT verify the token is still valid.
 */
export function isStravaLinked(): boolean {
  return !!(
    import.meta.env.VITE_STRAVA_CLIENT_ID &&
    import.meta.env.VITE_STRAVA_CLIENT_SECRET &&
    getRefreshTokenOverride()
  );
}

// ---------------------------------------------------------------------------
// Force re-authorization — clears stale cached state then opens the OAuth URL
// ---------------------------------------------------------------------------

/**
 * Clears the stale refresh-token override AND the cached access token, then
 * redirects the current window to the Strava OAuth authorize URL so the user
 * can re-grant the correct scope (`activity:write,activity:read_all`).
 *
 * Uses the /strava-callback auto-capture route as the redirect_uri so the user
 * is returned to the app automatically after approving — no copy-paste needed.
 *
 * Pass `clearCachedTokenFn` (= `clearCachedToken` from strava.ts) to also
 * invalidate the in-memory + localStorage access-token cache.
 *
 * Opens in the SAME tab (not a new tab) — a direct user gesture is required
 * to avoid popup blockers when navigating to a cross-origin URL.
 *
 * IMPORTANT: the redirect_uri passed here MUST be registered in your Strava
 * app dashboard (https://www.strava.com/settings/api) under "Authorization
 * Callback Domain". Add your deployment domain (e.g. globeride.vercel.app)
 * and/or localhost for local dev.
 */
export function forceReauth(clearCachedTokenFn?: () => void): void {
  // 1. Wipe the stale refresh token so it isn't reused after the redirect
  clearRefreshTokenOverride();
  // 2. Wipe the cached access token if caller supplied the helper
  clearCachedTokenFn?.();
  // 3. Redirect current tab to Strava with the auto-capture callback URI.
  //    Use globalThis.location so this is mockable in Node test environments.
  const url = buildStravaAuthorizeUrl({ redirectUri: stravaCallbackUri() });
  globalThis.location.href = url;
}
