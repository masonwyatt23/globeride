/**
 * Strava API client — token refresh + .FIT activity upload.
 *
 * All HTTP goes through the Vite dev/preview proxy at /strava-api → https://www.strava.com
 * to avoid browser CORS restrictions. In production you need the same reverse-proxy
 * (nginx, Cloudflare Worker, Netlify function, etc.) to forward /strava-api/* to
 * https://www.strava.com/*. Never ship real credentials to a public host.
 *
 * Required env vars (personal-use only — never commit real values):
 *   VITE_STRAVA_CLIENT_ID       – your Strava app client id
 *   VITE_STRAVA_CLIENT_SECRET   – your Strava app client secret
 *   VITE_STRAVA_REFRESH_TOKEN   – long-lived refresh token with activity:write scope
 *
 * The refresh token can also be stored in localStorage (STRAVA_RT_OVERRIDE_KEY from
 * stravaOauth.ts) — that value takes precedence over the env var, allowing the user
 * to fix an insufficient-scope token via Settings → Strava without editing .env.local.
 */

import { getRefreshTokenOverride } from '@/lib/stravaOauth';

// ---------------------------------------------------------------------------
// Typed error taxonomy
// ---------------------------------------------------------------------------

/**
 * Discriminated union of every failure mode this module can produce.
 *
 * | kind                  | cause                                                    |
 * |-----------------------|----------------------------------------------------------|
 * | creds_missing         | One or more env vars absent AND no localStorage override |
 * | refresh_failed        | /oauth/token returned non-2xx (bad creds / revoked RT)   |
 * | insufficient_scope    | Upload or athlete probe returned 401/403 → no write perm |
 * | duplicate_activity    | Strava recognised this as a duplicate upload             |
 * | processing_error      | Strava processed the file but reported an error          |
 * | network_error         | fetch() threw (offline, proxy unreachable, etc.)         |
 * | rate_limited          | HTTP 429 — too many requests; back off and retry later   |
 * | timeout               | Poll loop exceeded POLL_MAX_ATTEMPTS × POLL_INTERVAL_MS  |
 * | unknown               | Catch-all for anything else                              |
 */
export type StravaErrorKind =
  | 'creds_missing'
  | 'refresh_failed'
  | 'insufficient_scope'
  | 'duplicate_activity'
  | 'processing_error'
  | 'network_error'
  | 'rate_limited'
  | 'timeout'
  | 'unknown';

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

export class StravaError extends Error {
  constructor(
    message: string,
    public readonly kind: StravaErrorKind = 'unknown',
    public readonly statusCode?: number,
    public readonly body?: string,
    /** Deep-link the user to a relevant page (e.g. in-app Settings). */
    public readonly actionUrl?: string,
  ) {
    super(message);
    this.name = 'StravaError';
  }
}

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

/** Returns true when client_id + client_secret exist AND a refresh token is
 *  available (either from localStorage override or env var). */
export function stravaCredsPresent(): boolean {
  const hasClientCreds = !!(
    import.meta.env.VITE_STRAVA_CLIENT_ID &&
    import.meta.env.VITE_STRAVA_CLIENT_SECRET
  );
  const hasRefreshToken = !!(
    getRefreshTokenOverride() || import.meta.env.VITE_STRAVA_REFRESH_TOKEN
  );
  return hasClientCreds && hasRefreshToken;
}

/** Throw a StravaError(creds_missing) when any required credential is absent. */
function assertCredsPresent(): void {
  if (!stravaCredsPresent()) {
    throw new StravaError(
      'Strava credentials are not configured. Add VITE_STRAVA_CLIENT_ID, ' +
        'VITE_STRAVA_CLIENT_SECRET, and a refresh token (via Settings → Strava) ' +
        'to .env.local, then restart the dev server.',
      'creds_missing',
      undefined,
      undefined,
      '#settings-strava',
    );
  }
}

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

const LS_TOKEN_KEY = 'globeride.strava.accessToken';
const LS_EXPIRY_KEY = 'globeride.strava.tokenExpiry';

/** Seconds of buffer before expiry at which we proactively refresh. */
const EXPIRY_BUFFER_SEC = 120;

interface TokenCache {
  accessToken: string;
  /** Unix timestamp (seconds) when the token expires. */
  expiresAt: number;
}

// In-memory first; localStorage as a backup across page reloads.
let memCache: TokenCache | null = null;

function loadCachedToken(): TokenCache | null {
  if (memCache) return memCache;
  try {
    const token = localStorage.getItem(LS_TOKEN_KEY);
    const expiry = localStorage.getItem(LS_EXPIRY_KEY);
    if (token && expiry) {
      const parsed = { accessToken: token, expiresAt: parseInt(expiry, 10) };
      memCache = parsed;
      return parsed;
    }
  } catch {
    // localStorage not available (e.g. private mode with storage blocked) — silent fail.
  }
  return null;
}

function saveCachedToken(cache: TokenCache): void {
  memCache = cache;
  try {
    localStorage.setItem(LS_TOKEN_KEY, cache.accessToken);
    localStorage.setItem(LS_EXPIRY_KEY, String(cache.expiresAt));
  } catch {
    // Storage write failed — in-memory cache still works for this session.
  }
}

export function clearCachedToken(): void {
  memCache = null;
  try {
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_EXPIRY_KEY);
  } catch {
    // ignore
  }
}

/** Returns true if the given token cache is still valid (not within the expiry buffer). */
export function isTokenFresh(cache: TokenCache, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
  return cache.expiresAt - nowSec > EXPIRY_BUFFER_SEC;
}

// ---------------------------------------------------------------------------
// Strava OAuth token refresh
// ---------------------------------------------------------------------------

interface StravaTokenResponse {
  access_token: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  token_type: string;
}

/**
 * Exchange the refresh token for a fresh access token, caching the result.
 * Prefers the localStorage-stored refresh token override over the env var,
 * so a user-pasted token from Settings → Strava takes effect immediately.
 *
 * Throws StravaError (kind: creds_missing | refresh_failed | network_error).
 */
export async function refreshAccessToken(): Promise<string> {
  assertCredsPresent();

  const cached = loadCachedToken();
  if (cached && isTokenFresh(cached)) {
    return cached.accessToken;
  }

  // Prefer the localStorage override (set by the OAuth flow in stravaOauth.ts)
  const refreshToken =
    getRefreshTokenOverride() ||
    (import.meta.env.VITE_STRAVA_REFRESH_TOKEN as string);

  const body = new URLSearchParams({
    client_id: import.meta.env.VITE_STRAVA_CLIENT_ID as string,
    client_secret: import.meta.env.VITE_STRAVA_CLIENT_SECRET as string,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  let res: Response;
  try {
    res = await fetch('/strava-api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    throw new StravaError(
      'Could not reach Strava — check your network connection.',
      'network_error',
      undefined,
      String(err),
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 400/401 on token refresh almost always means bad client credentials or
    // a revoked / wrong-scope refresh token.
    throw new StravaError(
      res.status === 400 || res.status === 401
        ? 'Strava rejected the refresh token. Your client credentials or refresh ' +
          'token may be wrong or revoked — use Settings → Strava to re-authorize.'
        : `Token refresh failed: HTTP ${res.status}`,
      'refresh_failed',
      res.status,
      text,
      '#settings-strava',
    );
  }

  const json = (await res.json()) as StravaTokenResponse;
  const cache: TokenCache = {
    accessToken: json.access_token,
    expiresAt: json.expires_at,
  };
  saveCachedToken(cache);
  return cache.accessToken;
}

// ---------------------------------------------------------------------------
// Connectivity + scope probe
// ---------------------------------------------------------------------------

export interface StravaVerifyResult {
  ok: boolean;
  /** When ok=true, the athlete's display name. */
  athleteName?: string;
  /** When ok=false, the typed error. */
  error?: StravaError;
}

/**
 * Returns a human-readable one-liner for a StravaError kind.
 * Safe to call with any error — falls back to the error message.
 */
export function stravaErrorSummary(err: StravaError): string {
  switch (err.kind) {
    case 'creds_missing':
      return 'Strava credentials are not configured.';
    case 'refresh_failed':
      return 'Strava rejected the refresh token — try re-authorizing.';
    case 'insufficient_scope':
      return 'Token lacks activity:write — re-authorize with the correct scope.';
    case 'duplicate_activity':
      return 'Duplicate activity — already uploaded to Strava.';
    case 'processing_error':
      return 'Strava could not process the activity file.';
    case 'network_error':
      return 'Cannot reach Strava — check your network connection.';
    case 'rate_limited':
      return 'Strava rate limit reached — wait a minute and try again.';
    case 'timeout':
      return 'Strava took too long to process the activity.';
    default:
      return `Upload error: ${err.message}`;
  }
}

/**
 * Returns true when a valid (non-expired) access token is cached in memory
 * or localStorage. Does NOT make a network call — use verifyStravaAccess()
 * for a real connectivity check.
 */
export function isTokenCached(): boolean {
  const cached = loadCachedToken();
  if (!cached) return false;
  return isTokenFresh(cached);
}

/**
 * Probe Strava connectivity and scope before a ride finishes.
 * Refreshes the access token, then calls GET /athlete.
 *
 * Returns a typed result rather than throwing — safe to call directly from UI.
 *
 * Distinguishes:
 *   - creds_missing     → env vars / localStorage override not configured
 *   - refresh_failed    → bad client_id / client_secret / refresh token
 *   - insufficient_scope→ token refreshed OK but /athlete returned 401/403
 *   - network_error     → fetch() threw
 *   - ok                → all good; returns athleteName
 */
export async function verifyStravaAccess(): Promise<StravaVerifyResult> {
  if (!stravaCredsPresent()) {
    return {
      ok: false,
      error: new StravaError(
        'Strava credentials are not configured.',
        'creds_missing',
        undefined,
        undefined,
        '#settings-strava',
      ),
    };
  }

  let token: string;
  try {
    token = await refreshAccessToken();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof StravaError ? err : new StravaError(String(err), 'unknown'),
    };
  }

  let athleteRes: Response;
  try {
    athleteRes = await fetch('/strava-api/api/v3/athlete', {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    return {
      ok: false,
      error: new StravaError(
        'Could not reach Strava — check your network connection.',
        'network_error',
        undefined,
        String(err),
      ),
    };
  }

  if (!athleteRes.ok) {
    if (athleteRes.status === 401 || athleteRes.status === 403) {
      return {
        ok: false,
        error: new StravaError(
          'Strava returned "insufficient scope" — your refresh token may only have ' +
            'activity:read. Use Settings → Strava → Connect to re-authorize with ' +
            'activity:write,activity:read_all scope.',
          'insufficient_scope',
          athleteRes.status,
          undefined,
          '#settings-strava',
        ),
      };
    }
    return {
      ok: false,
      error: new StravaError(
        `Strava athlete probe failed: HTTP ${athleteRes.status}`,
        'unknown',
        athleteRes.status,
      ),
    };
  }

  const athlete = (await athleteRes.json()) as { firstname?: string; lastname?: string };
  const athleteName =
    [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || 'Athlete';

  return { ok: true, athleteName };
}

// ---------------------------------------------------------------------------
// Upload status state machine
// ---------------------------------------------------------------------------

export type UploadPhase =
  | 'idle'
  | 'uploading'
  | 'polling'
  | 'success'
  | 'error';

export interface UploadState {
  phase: UploadPhase;
  /** Set when phase === 'success'. */
  activityId?: number;
  /** Human-readable error when phase === 'error'. */
  errorMessage?: string;
  /** Typed error kind when phase === 'error' — drives actionable UI copy. */
  errorKind?: StravaErrorKind;
  /** Action URL surfaced from the underlying StravaError. */
  actionUrl?: string;
}

// Strava upload status strings returned by GET /uploads/{id}
export type StravaUploadStatus =
  | 'Your activity is still being processed.'
  | 'The created activity has been deleted.'
  | 'There was an error processing your activity.'
  | 'Your activity is ready.';

export interface StravaUploadRecord {
  id: number;
  id_str: string;
  external_id: string | null;
  error: string | null;
  status: string;
  activity_id: number | null;
}

// ---------------------------------------------------------------------------
// Upload helpers — pure / testable
// ---------------------------------------------------------------------------

/**
 * Determines the next UploadState given a Strava upload poll response.
 * Pure function — no side effects, easy to unit-test.
 */
export function uploadStateFromPollResponse(record: StravaUploadRecord): UploadState {
  // Duplicate detected — Strava reports an error string containing "duplicate"
  if (record.error) {
    if (record.error.toLowerCase().includes('duplicate')) {
      // Graceful: treat as success if Strava provided the existing activity id
      if (record.activity_id) {
        return { phase: 'success', activityId: record.activity_id };
      }
      return {
        phase: 'error',
        errorMessage: 'Duplicate activity — already uploaded to Strava.',
        errorKind: 'duplicate_activity',
      };
    }
    return {
      phase: 'error',
      errorMessage: record.error,
      errorKind: 'processing_error',
    };
  }

  if (record.activity_id) {
    return { phase: 'success', activityId: record.activity_id };
  }

  // Still processing
  if (
    record.status === 'Your activity is still being processed.' ||
    record.status === 'Your activity is ready.'
  ) {
    return record.activity_id
      ? { phase: 'success', activityId: record.activity_id }
      : { phase: 'polling' };
  }

  if (record.status.toLowerCase().includes('error')) {
    return {
      phase: 'error',
      errorMessage: record.status,
      errorKind: 'processing_error',
    };
  }

  return { phase: 'polling' };
}

/**
 * Build the multipart/form-data fields for a Strava .FIT upload.
 * Extracted as a pure helper so it can be unit-tested without fetch.
 */
export function buildUploadFormData(
  blob: Blob,
  opts: { name: string; description?: string; trainer?: boolean },
): FormData {
  const form = new FormData();
  form.append('data_type', 'fit');
  form.append('file', blob, 'activity.fit');
  form.append('name', opts.name);
  if (opts.description) form.append('description', opts.description);
  if (opts.trainer) form.append('trainer', '1');
  return form;
}

// ---------------------------------------------------------------------------
// Main upload + poll function
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30; // 30 × 2s = up to 60s

/**
 * Upload a .FIT blob to Strava and poll until the activity is processed.
 *
 * @param blob     The .FIT file produced by buildFit()
 * @param opts     Activity metadata
 * @param onState  Optional progress callback — called at each state transition
 * @returns        { id, status } of the created Strava activity
 *
 * Throws StravaError with a typed `kind` on all unrecoverable failures.
 */
export async function uploadFit(
  blob: Blob,
  opts: { name: string; description?: string; trainer?: boolean },
  onState?: (state: UploadState) => void,
): Promise<{ id: number; status: string }> {
  // 1. Get a valid access token (throws creds_missing | refresh_failed | network_error)
  const token = await refreshAccessToken();

  // 2. POST the multipart upload
  onState?.({ phase: 'uploading' });

  const form = buildUploadFormData(blob, opts);

  let uploadRes: Response;
  try {
    uploadRes = await fetch('/strava-api/api/v3/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (err) {
    throw new StravaError(
      'Could not reach Strava — check your network connection.',
      'network_error',
      undefined,
      String(err),
    );
  }

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    if (uploadRes.status === 401 || uploadRes.status === 403) {
      throw new StravaError(
        'Strava refused the upload — your refresh token lacks activity:write ' +
          'permission. Open Settings → Strava and re-authorize with the correct scope.',
        'insufficient_scope',
        uploadRes.status,
        text,
        '#settings-strava',
      );
    }
    if (uploadRes.status === 429) {
      throw new StravaError(
        'Strava rate limit reached — wait a minute and try again.',
        'rate_limited',
        429,
        text,
      );
    }
    throw new StravaError(
      `Upload failed: HTTP ${uploadRes.status}`,
      'unknown',
      uploadRes.status,
      text,
    );
  }

  const uploadRecord = (await uploadRes.json()) as StravaUploadRecord;

  // Strava may immediately report a duplicate or error in the upload response
  if (uploadRecord.error) {
    const immediateState = uploadStateFromPollResponse(uploadRecord);
    onState?.(immediateState);
    if (immediateState.phase === 'success' && immediateState.activityId) {
      return { id: immediateState.activityId, status: 'duplicate' };
    }
    if (immediateState.phase === 'error') {
      const kind: StravaErrorKind = immediateState.errorKind ?? 'unknown';
      throw new StravaError(immediateState.errorMessage ?? 'Upload error', kind);
    }
  }

  // 3. Poll until processed
  onState?.({ phase: 'polling' });

  const uploadId = uploadRecord.id;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await delay(POLL_INTERVAL_MS);

    let pollRes: Response;
    try {
      pollRes = await fetch(`/strava-api/api/v3/uploads/${uploadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      throw new StravaError(
        'Lost connection to Strava while waiting for activity processing.',
        'network_error',
        undefined,
        String(err),
      );
    }

    if (!pollRes.ok) {
      throw new StravaError(
        `Poll failed: HTTP ${pollRes.status}`,
        'unknown',
        pollRes.status,
      );
    }

    const pollRecord = (await pollRes.json()) as StravaUploadRecord;
    const state = uploadStateFromPollResponse(pollRecord);

    onState?.(state);

    if (state.phase === 'success' && state.activityId) {
      return { id: state.activityId, status: 'Your activity is ready.' };
    }

    if (state.phase === 'error') {
      const kind: StravaErrorKind = state.errorKind ?? 'unknown';
      throw new StravaError(state.errorMessage ?? 'Activity processing error', kind);
    }

    // phase === 'polling' → continue
  }

  throw new StravaError(
    'Upload timed out waiting for Strava to process the activity.',
    'timeout',
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
