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
 *   VITE_STRAVA_REFRESH_TOKEN   – long-lived refresh token
 */

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

/** Returns true when all three required env vars are present and non-empty. */
export function stravaCredsPresent(): boolean {
  return !!(
    import.meta.env.VITE_STRAVA_CLIENT_ID &&
    import.meta.env.VITE_STRAVA_CLIENT_SECRET &&
    import.meta.env.VITE_STRAVA_REFRESH_TOKEN
  );
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
 * Uses the /strava-api Vite proxy to avoid CORS.
 *
 * Throws on network error or non-200 responses — callers should catch.
 */
export async function refreshAccessToken(): Promise<string> {
  const cached = loadCachedToken();
  if (cached && isTokenFresh(cached)) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: import.meta.env.VITE_STRAVA_CLIENT_ID as string,
    client_secret: import.meta.env.VITE_STRAVA_CLIENT_SECRET as string,
    refresh_token: import.meta.env.VITE_STRAVA_REFRESH_TOKEN as string,
    grant_type: 'refresh_token',
  });

  const res = await fetch('/strava-api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new StravaError(`Token refresh failed: HTTP ${res.status}`, res.status, text);
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
// Custom error class
// ---------------------------------------------------------------------------

export class StravaError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'StravaError';
  }
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
      };
    }
    return { phase: 'error', errorMessage: record.error };
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
    return { phase: 'error', errorMessage: record.status };
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
 * Throws StravaError on unrecoverable failures.
 */
export async function uploadFit(
  blob: Blob,
  opts: { name: string; description?: string; trainer?: boolean },
  onState?: (state: UploadState) => void,
): Promise<{ id: number; status: string }> {
  // 1. Get a valid access token
  const token = await refreshAccessToken();

  // 2. POST the multipart upload
  onState?.({ phase: 'uploading' });

  const form = buildUploadFormData(blob, opts);
  const uploadRes = await fetch('/strava-api/api/v3/uploads', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new StravaError(`Upload failed: HTTP ${uploadRes.status}`, uploadRes.status, text);
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
      throw new StravaError(immediateState.errorMessage ?? 'Upload error');
    }
  }

  // 3. Poll until processed
  onState?.({ phase: 'polling' });

  const uploadId = uploadRecord.id;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await delay(POLL_INTERVAL_MS);

    const pollRes = await fetch(`/strava-api/api/v3/uploads/${uploadId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!pollRes.ok) {
      throw new StravaError(`Poll failed: HTTP ${pollRes.status}`, pollRes.status);
    }

    const pollRecord = (await pollRes.json()) as StravaUploadRecord;
    const state = uploadStateFromPollResponse(pollRecord);

    onState?.(state);

    if (state.phase === 'success' && state.activityId) {
      return { id: state.activityId, status: 'Your activity is ready.' };
    }

    if (state.phase === 'error') {
      throw new StravaError(state.errorMessage ?? 'Activity processing error');
    }

    // phase === 'polling' → continue
  }

  throw new StravaError('Upload timed out waiting for Strava to process the activity');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
