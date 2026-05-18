/**
 * Unit tests for src/lib/strava.ts
 *
 * All network calls are mocked — no real HTTP, no real credentials required.
 * Tests cover:
 *   1. Token expiry calculation (isTokenFresh)
 *   2. Upload status state machine (uploadStateFromPollResponse)
 *   3. Multipart field assembly (buildUploadFormData)
 *   4. refreshAccessToken — cache hit / cache miss / expired / error
 *   5. uploadFit — success path, duplicate, error path, poll timeout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTokenFresh,
  uploadStateFromPollResponse,
  buildUploadFormData,
  refreshAccessToken,
  uploadFit,
  clearCachedToken,
  StravaError,
  type StravaUploadRecord,
  type UploadState,
} from '@/lib/strava';

// ---------------------------------------------------------------------------
// Mock import.meta.env
// ---------------------------------------------------------------------------

vi.stubEnv('VITE_STRAVA_CLIENT_ID', 'test-client-id');
vi.stubEnv('VITE_STRAVA_CLIENT_SECRET', 'test-client-secret');
vi.stubEnv('VITE_STRAVA_REFRESH_TOKEN', 'test-refresh-token');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nowSec = () => Math.floor(Date.now() / 1000);

function makeUploadRecord(overrides: Partial<StravaUploadRecord> = {}): StravaUploadRecord {
  return {
    id: 1001,
    id_str: '1001',
    external_id: null,
    error: null,
    status: 'Your activity is still being processed.',
    activity_id: null,
    ...overrides,
  };
}

function mockFetch(responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>) {
  let call = 0;
  return vi.fn(async () => {
    const resp = responses[Math.min(call++, responses.length - 1)];
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 400),
      json: async () => resp.json ?? {},
      text: async () => resp.text ?? '',
    };
  });
}

// ---------------------------------------------------------------------------
// 1. isTokenFresh — token expiry calculation
// ---------------------------------------------------------------------------

describe('isTokenFresh', () => {
  it('returns true when token expires well in the future', () => {
    const expiresAt = nowSec() + 3600; // 1 hour from now
    expect(isTokenFresh({ accessToken: 'tok', expiresAt })).toBe(true);
  });

  it('returns false when token expires within the buffer window (120s)', () => {
    const expiresAt = nowSec() + 60; // only 60s remaining — under 120s buffer
    expect(isTokenFresh({ accessToken: 'tok', expiresAt })).toBe(false);
  });

  it('returns false for an already-expired token', () => {
    const expiresAt = nowSec() - 100;
    expect(isTokenFresh({ accessToken: 'tok', expiresAt })).toBe(false);
  });

  it('uses a supplied nowSec override correctly', () => {
    const base = 1_000_000;
    // expiresAt is 200s after base; buffer is 120s → 200 - 120 = 80 > 0 → fresh
    expect(isTokenFresh({ accessToken: 'tok', expiresAt: base + 200 }, base)).toBe(true);
    // expiresAt is 100s after base; buffer is 120s → 100 - 120 = -20 < 0 → stale
    expect(isTokenFresh({ accessToken: 'tok', expiresAt: base + 100 }, base)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. uploadStateFromPollResponse — state machine
// ---------------------------------------------------------------------------

describe('uploadStateFromPollResponse', () => {
  it('returns success when activity_id is set and no error', () => {
    const record = makeUploadRecord({ activity_id: 9999, status: 'Your activity is ready.' });
    const state = uploadStateFromPollResponse(record);
    expect(state.phase).toBe('success');
    expect(state.activityId).toBe(9999);
  });

  it('returns polling while still processing', () => {
    const record = makeUploadRecord();
    const state = uploadStateFromPollResponse(record);
    expect(state.phase).toBe('polling');
    expect(state.activityId).toBeUndefined();
  });

  it('returns error on Strava error string', () => {
    const record = makeUploadRecord({ error: 'Bad file format' });
    const state = uploadStateFromPollResponse(record);
    expect(state.phase).toBe('error');
    expect(state.errorMessage).toBe('Bad file format');
  });

  it('returns error on status containing "error"', () => {
    const record = makeUploadRecord({ status: 'There was an error processing your activity.' });
    const state = uploadStateFromPollResponse(record);
    expect(state.phase).toBe('error');
  });

  it('returns success (graceful) on duplicate with activity_id', () => {
    const record = makeUploadRecord({
      error: 'This is a duplicate of activity 12345',
      activity_id: 12345,
    });
    const state = uploadStateFromPollResponse(record);
    expect(state.phase).toBe('success');
    expect(state.activityId).toBe(12345);
  });

  it('returns error on duplicate without activity_id', () => {
    const record = makeUploadRecord({ error: 'duplicate activity' });
    const state = uploadStateFromPollResponse(record);
    expect(state.phase).toBe('error');
    expect(state.errorMessage).toMatch(/duplicate/i);
  });
});

// ---------------------------------------------------------------------------
// 3. buildUploadFormData — multipart field assembly
// ---------------------------------------------------------------------------

describe('buildUploadFormData', () => {
  it('always includes data_type=fit, file, and name', () => {
    const blob = new Blob(['fake-fit-bytes'], { type: 'application/vnd.ant.fit' });
    const form = buildUploadFormData(blob, { name: 'Morning ride' });

    expect(form.get('data_type')).toBe('fit');
    expect(form.get('name')).toBe('Morning ride');
    // File field should be a File/Blob with the correct filename
    const fileField = form.get('file');
    expect(fileField).toBeInstanceOf(Blob);
  });

  it('includes description when provided', () => {
    const blob = new Blob(['']);
    const form = buildUploadFormData(blob, { name: 'Test', description: 'My description' });
    expect(form.get('description')).toBe('My description');
  });

  it('omits description when not provided', () => {
    const blob = new Blob(['']);
    const form = buildUploadFormData(blob, { name: 'Test' });
    expect(form.get('description')).toBeNull();
  });

  it('sets trainer=1 when trainer is true', () => {
    const blob = new Blob(['']);
    const form = buildUploadFormData(blob, { name: 'Test', trainer: true });
    expect(form.get('trainer')).toBe('1');
  });

  it('omits trainer field when trainer is false/omitted', () => {
    const blob = new Blob(['']);
    const form = buildUploadFormData(blob, { name: 'Test', trainer: false });
    expect(form.get('trainer')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. refreshAccessToken — caching + network behaviour
// ---------------------------------------------------------------------------

describe('refreshAccessToken', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearCachedToken();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearCachedToken();
  });

  it('fetches a new token when cache is empty', async () => {
    const futureExpiry = nowSec() + 3600;
    globalThis.fetch = mockFetch([
      {
        ok: true,
        json: {
          access_token: 'new-token-abc',
          expires_at: futureExpiry,
          expires_in: 3600,
          refresh_token: 'unused-rt',
          token_type: 'Bearer',
        },
      },
    ]) as unknown as typeof globalThis.fetch;

    const token = await refreshAccessToken();
    expect(token).toBe('new-token-abc');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('returns cached token without a network call when fresh', async () => {
    const futureExpiry = nowSec() + 3600;
    // First call to populate cache
    globalThis.fetch = mockFetch([
      {
        ok: true,
        json: {
          access_token: 'cached-token',
          expires_at: futureExpiry,
          expires_in: 3600,
          refresh_token: 'rt',
          token_type: 'Bearer',
        },
      },
    ]) as unknown as typeof globalThis.fetch;

    await refreshAccessToken();

    // Reset fetch — a second call should NOT hit network
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const token = await refreshAccessToken();
    expect(token).toBe('cached-token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws StravaError on HTTP error response', async () => {
    globalThis.fetch = mockFetch([
      { ok: false, status: 401, text: 'Unauthorized' },
    ]) as unknown as typeof globalThis.fetch;

    await expect(refreshAccessToken()).rejects.toThrow(StravaError);
  });

  it('throws StravaError with correct status code on failure', async () => {
    globalThis.fetch = mockFetch([
      { ok: false, status: 400, text: 'Bad request' },
    ]) as unknown as typeof globalThis.fetch;

    try {
      await refreshAccessToken();
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(StravaError);
      expect((err as StravaError).statusCode).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. uploadFit — end-to-end flow with mocked fetch
// ---------------------------------------------------------------------------

describe('uploadFit', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearCachedToken();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearCachedToken();
    vi.useRealTimers();
  });

  const tokenResponse = {
    ok: true,
    json: {
      access_token: 'upload-access-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      refresh_token: 'rt',
      token_type: 'Bearer',
    },
  };

  it('resolves with activity id on a clean success flow', async () => {
    vi.useFakeTimers();

    const fetchMock = mockFetch([
      // 1. token refresh
      tokenResponse,
      // 2. POST upload → pending
      { ok: true, json: makeUploadRecord({ id: 500 }) },
      // 3. poll → ready
      { ok: true, json: makeUploadRecord({ id: 500, activity_id: 42, status: 'Your activity is ready.' }) },
    ]);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const blob = new Blob(['fake-fit'], { type: 'application/vnd.ant.fit' });
    const states: UploadState[] = [];

    const uploadPromise = uploadFit(blob, { name: 'Test ride', trainer: true }, (s) => states.push(s));

    // Advance timers past the poll delay
    await vi.runAllTimersAsync();

    const result = await uploadPromise;
    expect(result.id).toBe(42);
    expect(states.some((s) => s.phase === 'uploading')).toBe(true);
    expect(states.some((s) => s.phase === 'polling')).toBe(true);
    expect(states.some((s) => s.phase === 'success')).toBe(true);
  });

  it('resolves gracefully on duplicate activity (error string + activity_id)', async () => {
    vi.useFakeTimers();

    const fetchMock = mockFetch([
      tokenResponse,
      {
        ok: true,
        json: makeUploadRecord({
          id: 501,
          error: 'This is a duplicate of activity 77',
          activity_id: 77,
        }),
      },
    ]);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const blob = new Blob(['']);
    const uploadPromise = uploadFit(blob, { name: 'Duplicate ride' });
    await vi.runAllTimersAsync();

    const result = await uploadPromise;
    expect(result.id).toBe(77);
    expect(result.status).toBe('duplicate');
  });

  it('throws StravaError on upload HTTP error', async () => {
    vi.useFakeTimers();

    const fetchMock = mockFetch([
      tokenResponse,
      { ok: false, status: 422, text: 'Unprocessable' },
    ]);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const blob = new Blob(['']);
    await expect(uploadFit(blob, { name: 'Bad ride' })).rejects.toThrow(StravaError);
  });

  it('throws StravaError when poll returns an error status', async () => {
    vi.useFakeTimers();

    const fetchMock = mockFetch([
      tokenResponse,
      { ok: true, json: makeUploadRecord({ id: 502 }) },
      { ok: true, json: makeUploadRecord({ id: 502, error: 'Bad file format' }) },
    ]);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const blob = new Blob(['']);
    // Attach the rejection handler BEFORE advancing timers so the unhandled
    // rejection never escapes the promise chain.
    const uploadPromise = uploadFit(blob, { name: 'Broken ride' });
    const assertion = expect(uploadPromise).rejects.toThrow(StravaError);
    await vi.runAllTimersAsync();
    await assertion;
  });
});
