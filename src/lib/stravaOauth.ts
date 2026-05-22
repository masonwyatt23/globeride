/**
 * Strava OAuth helpers — manual / backend-less authorization flow.
 *
 * Because GlobeRide has no backend, the OAuth exchange runs entirely in the
 * browser via the /strava-api Vite proxy (mirrors the same proxy used for
 * token refresh + upload). The flow:
 *
 *   1. User clicks "Connect Strava" → open buildStravaAuthorizeUrl() in a new tab.
 *   2. User approves on Strava, gets redirected to the redirect_uri with ?code=…
 *   3. User copies the `code` value and pastes it into the in-app input.
 *   4. App calls exchangeCodeForRefreshToken(code) via the proxy.
 *   5. The returned refresh_token is saved to localStorage (STRAVA_RT_OVERRIDE_KEY).
 *   6. strava.ts prefers the localStorage override over the .env.local value.
 *
 * Scope requested: activity:write,activity:read_all  (covers upload + read).
 *
 * NEVER log or persist the client_secret beyond what the env var already does.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for the user-supplied refresh token override. */
export const STRAVA_RT_OVERRIDE_KEY = 'globeride.strava.refreshTokenOverride';

/**
 * The redirect URI used when building the authorize URL.
 * We use Strava's own "out-of-band" redirect so the user lands on a Strava
 * confirmation page that shows the auth code in the URL bar — they copy it
 * and paste it back into GlobeRide.
 *
 * Alternatively callers can pass window.location.origin + '/strava-callback'
 * if they set up a redirect handler, but for a backend-less personal app the
 * OOB approach requires no extra routing.
 */
const DEFAULT_REDIRECT_URI = 'https://www.strava.com/oauth/authorize';

// ---------------------------------------------------------------------------
// Authorize URL builder
// ---------------------------------------------------------------------------

export interface StravaAuthorizeUrlOpts {
  /** Override the redirect_uri (default: Strava OOB page). */
  redirectUri?: string;
}

/**
 * Build the Strava OAuth authorize URL.
 * Open this in a new tab; the user approves then copies the `code` param.
 */
export function buildStravaAuthorizeUrl(opts: StravaAuthorizeUrlOpts = {}): string {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error('VITE_STRAVA_CLIENT_ID is not set — add it to .env.local');
  }

  const redirectUri = opts.redirectUri ?? DEFAULT_REDIRECT_URI;

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
// localStorage override helpers
// ---------------------------------------------------------------------------

/**
 * Persist a user-supplied refresh token to localStorage.
 * strava.ts calls getRefreshTokenOverride() in preference to the env var.
 */
export function saveRefreshTokenOverride(token: string): void {
  try {
    localStorage.setItem(STRAVA_RT_OVERRIDE_KEY, token);
  } catch {
    // storage blocked — ignore, env var will be used as fallback
  }
}

/** Return the localStorage-stored refresh token, or null if absent. */
export function getRefreshTokenOverride(): string | null {
  try {
    return localStorage.getItem(STRAVA_RT_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/** Remove the localStorage refresh token override (revert to env var). */
export function clearRefreshTokenOverride(): void {
  try {
    localStorage.removeItem(STRAVA_RT_OVERRIDE_KEY);
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
 * a refresh token override in localStorage (i.e. the user has completed
 * the OAuth flow at least once). Does NOT verify the token is still valid.
 */
export function isStravaLinked(): boolean {
  return !!(
    import.meta.env.VITE_STRAVA_CLIENT_ID &&
    import.meta.env.VITE_STRAVA_CLIENT_SECRET &&
    getRefreshTokenOverride()
  );
}
