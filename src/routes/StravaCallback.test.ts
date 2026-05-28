/**
 * Unit tests for src/routes/StravaCallback.tsx
 *
 * Tests the pure helpers that can run without a DOM:
 *   1.  hasRequiredScopes — scope string validation
 *   2.  parseCallbackError — every error branch
 *   3.  STRAVA_OOB_REDIRECT_URI — correct value (regression guard)
 *   4.  buildStravaAuthorizeUrl — OOB vs callback redirect_uri
 *   5.  stravaCallbackUri — returns origin + /strava-callback
 *   6.  forceReauth — navigates with callback URI, clears stale token
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hasRequiredScopes, parseCallbackError } from '@/routes/StravaCallback';
import {
  buildStravaAuthorizeUrl,
  STRAVA_OOB_REDIRECT_URI,
  stravaCallbackUri,
  forceReauth,
  clearRefreshTokenOverride,
  saveRefreshTokenOverride,
} from '@/lib/stravaOauth';
import { clearCachedToken } from '@/lib/strava';

// ---------------------------------------------------------------------------
// Env stubs
// ---------------------------------------------------------------------------

vi.stubEnv('VITE_STRAVA_CLIENT_ID', 'test-client-id');
vi.stubEnv('VITE_STRAVA_CLIENT_SECRET', 'test-client-secret');
vi.stubEnv('VITE_STRAVA_REFRESH_TOKEN', 'test-refresh-token');

// ---------------------------------------------------------------------------
// Storage mock
// ---------------------------------------------------------------------------

function makeStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

// ---------------------------------------------------------------------------
// 1. hasRequiredScopes
// ---------------------------------------------------------------------------

describe('hasRequiredScopes', () => {
  it('returns true when both required scopes are present', () => {
    expect(hasRequiredScopes('read,activity:write,activity:read_all')).toBe(true);
  });

  it('returns true with exactly the two required scopes', () => {
    expect(hasRequiredScopes('activity:write,activity:read_all')).toBe(true);
  });

  it('returns false when activity:write is missing', () => {
    expect(hasRequiredScopes('activity:read_all,read')).toBe(false);
  });

  it('returns false when activity:read_all is missing', () => {
    expect(hasRequiredScopes('activity:write,read')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(hasRequiredScopes('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasRequiredScopes(null)).toBe(false);
  });

  it('returns false for a partial scope like activity:read', () => {
    expect(hasRequiredScopes('activity:read')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. parseCallbackError — every branch
// ---------------------------------------------------------------------------

describe('parseCallbackError', () => {
  function params(obj: Record<string, string>) {
    return new URLSearchParams(obj);
  }

  it('returns access_denied when ?error=access_denied', () => {
    const err = parseCallbackError(params({ error: 'access_denied' }));
    expect(err).not.toBeNull();
    expect(err!.kind).toBe('access_denied');
    expect(err!.message).toMatch(/cancelled/i);
  });

  it('returns exchange_failed for an unknown ?error value', () => {
    const err = parseCallbackError(params({ error: 'server_error' }));
    expect(err).not.toBeNull();
    expect(err!.kind).toBe('exchange_failed');
    expect(err!.message).toContain('server_error');
  });

  it('returns missing_code when no code or error param', () => {
    const err = parseCallbackError(params({}));
    expect(err).not.toBeNull();
    expect(err!.kind).toBe('missing_code');
    expect(err!.detail).toMatch(/redirect URI/i);
  });

  it('returns scope_insufficient when code present but scope lacks activity:write', () => {
    const err = parseCallbackError(params({ code: 'abc', scope: 'read,activity:read_all' }));
    expect(err).not.toBeNull();
    expect(err!.kind).toBe('scope_insufficient');
    expect(err!.message).toMatch(/activity:write/i);
  });

  it('returns null (no error) when code and full scope are present and creds are set', () => {
    const err = parseCallbackError(
      params({ code: 'abc123', scope: 'read,activity:write,activity:read_all' }),
    );
    expect(err).toBeNull();
  });

  it('returns no_client_id when env vars are missing', () => {
    vi.stubEnv('VITE_STRAVA_CLIENT_ID', '');
    vi.stubEnv('VITE_STRAVA_CLIENT_SECRET', '');
    const err = parseCallbackError(
      params({ code: 'abc123', scope: 'activity:write,activity:read_all' }),
    );
    expect(err).not.toBeNull();
    expect(err!.kind).toBe('no_client_id');
    // restore
    vi.stubEnv('VITE_STRAVA_CLIENT_ID', 'test-client-id');
    vi.stubEnv('VITE_STRAVA_CLIENT_SECRET', 'test-client-secret');
  });

  it('includes actionable detail text in missing_code error', () => {
    const err = parseCallbackError(params({}));
    expect(err!.detail).toMatch(/strava\.com\/settings\/api/i);
  });

  it('includes scope value in scope_insufficient detail', () => {
    const err = parseCallbackError(params({ code: 'x', scope: 'read' }));
    expect(err!.detail).toContain('"read"');
  });
});

// ---------------------------------------------------------------------------
// 3. STRAVA_OOB_REDIRECT_URI — regression guard for the root bug
// ---------------------------------------------------------------------------

describe('STRAVA_OOB_REDIRECT_URI', () => {
  it('is the Strava developers OOB page', () => {
    expect(STRAVA_OOB_REDIRECT_URI).toBe('http://developers.strava.com');
  });

  it('is NOT the authorize endpoint (regression guard for original bug)', () => {
    // The old, broken value caused every OAuth redirect to fail silently
    expect(STRAVA_OOB_REDIRECT_URI).not.toBe('https://www.strava.com/oauth/authorize');
  });
});

// ---------------------------------------------------------------------------
// 4. buildStravaAuthorizeUrl — OOB vs callback redirect_uri
// ---------------------------------------------------------------------------

describe('buildStravaAuthorizeUrl', () => {
  it('uses OOB redirect by default', () => {
    const url = buildStravaAuthorizeUrl();
    expect(url).toContain(encodeURIComponent(STRAVA_OOB_REDIRECT_URI));
  });

  it('does NOT use the broken authorize endpoint as redirect_uri by default', () => {
    const url = buildStravaAuthorizeUrl();
    // The encoded authorize URL must not appear as the redirect_uri value
    expect(url.split('redirect_uri=')[1]).not.toContain(
      encodeURIComponent('https://www.strava.com/oauth/authorize'),
    );
  });

  it('uses the supplied redirectUri when provided', () => {
    const url = buildStravaAuthorizeUrl({ redirectUri: 'https://myapp.com/strava-callback' });
    expect(url).toContain(encodeURIComponent('https://myapp.com/strava-callback'));
    expect(url).not.toContain(encodeURIComponent(STRAVA_OOB_REDIRECT_URI));
  });

  it('includes required OAuth params regardless of redirectUri', () => {
    const url = buildStravaAuthorizeUrl();
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('response_type=code');
    expect(url).toContain('approval_prompt=force');
    expect(url).toContain('scope=activity%3Awrite%2Cactivity%3Aread_all');
  });
});

// ---------------------------------------------------------------------------
// 5. stravaCallbackUri — returns origin + /strava-callback
// ---------------------------------------------------------------------------

describe('stravaCallbackUri', () => {
  it('returns a string ending with /strava-callback', () => {
    const uri = stravaCallbackUri();
    expect(uri).toMatch(/\/strava-callback$/);
  });

  it('returns a valid http(s) URL', () => {
    const uri = stravaCallbackUri();
    expect(uri).toMatch(/^https?:\/\//);
  });

  it('respects a mocked globalThis.location.origin', () => {
    const orig = (globalThis as Record<string, unknown>).location;
    (globalThis as Record<string, unknown>).location = { origin: 'https://my-deploy.vercel.app' };
    const uri = stravaCallbackUri();
    expect(uri).toBe('https://my-deploy.vercel.app/strava-callback');
    (globalThis as Record<string, unknown>).location = orig;
  });
});

// ---------------------------------------------------------------------------
// 6. forceReauth — uses callback URI, clears stale token
// ---------------------------------------------------------------------------

describe('forceReauth', () => {
  let capturedHref = '';
  let origLocation: unknown;

  beforeEach(() => {
    // Install storage mocks
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: makeStorageMock(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeStorageMock(),
      writable: true,
      configurable: true,
    });

    // Mock globalThis.location so forceReauth can set .href without crashing
    origLocation = (globalThis as Record<string, unknown>).location;
    capturedHref = '';
    (globalThis as Record<string, unknown>).location = {
      origin: 'https://test.example.com',
      get href() { return capturedHref; },
      set href(v: string) { capturedHref = v; },
    };

    saveRefreshTokenOverride('stale-token');
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).location = origLocation;
    clearRefreshTokenOverride();
    clearCachedToken();
  });

  it('navigates to the Strava authorize URL', () => {
    forceReauth();
    expect(capturedHref).toMatch(/^https:\/\/www\.strava\.com\/oauth\/authorize/);
  });

  it('uses the /strava-callback URI as redirect_uri, not the OOB page', () => {
    forceReauth();
    expect(capturedHref).toContain(
      encodeURIComponent('https://test.example.com/strava-callback'),
    );
    expect(capturedHref).not.toContain(encodeURIComponent(STRAVA_OOB_REDIRECT_URI));
  });

  it('calls the supplied clearCachedTokenFn', () => {
    const spy = vi.fn();
    forceReauth(spy);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('works without a clearCachedTokenFn argument', () => {
    expect(() => forceReauth()).not.toThrow();
  });
});
