/**
 * Tests for cesiumTokenWarning.ts — warnIfTokenMissing helper.
 *
 * import.meta.env is mocked via vi.stubEnv / vi.unstubAllEnvs so each test
 * gets an isolated environment snapshot. console.warn is spied on to verify
 * it fires (or stays silent) under the right conditions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Re-import the module fresh so import.meta.env reads are re-evaluated. */
async function freshWarn() {
  // Invalidate module cache so the re-import picks up new env stubs.
  vi.resetModules();
  const { warnIfTokenMissing } = await import('./cesiumTokenWarning');
  return warnIfTokenMissing;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('warnIfTokenMissing — dev mode (PROD = false)', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', false as unknown as string);
  });

  it('warns when VITE_CESIUM_ION_TOKEN is undefined', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', undefined as unknown as string);
    const fn = await freshWarn();
    fn();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('warns when VITE_CESIUM_ION_TOKEN is an empty string', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    const fn = await freshWarn();
    fn();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('warns when VITE_CESIUM_ION_TOKEN is only whitespace', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '   ');
    const fn = await freshWarn();
    fn();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('does NOT warn when a valid token is present', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid');
    const fn = await freshWarn();
    fn();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warning message references ion.cesium.com', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    const fn = await freshWarn();
    fn();
    const [msg] = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0] as string[];
    expect(msg).toContain('ion.cesium.com');
  });

  it('warning message references .env.example', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
    const fn = await freshWarn();
    fn();
    const [msg] = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0] as string[];
    expect(msg).toContain('.env.example');
  });
});

describe('warnIfTokenMissing — production mode (PROD = true)', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true as unknown as string);
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
  });

  it('is completely silent even when token is missing', async () => {
    const fn = await freshWarn();
    fn();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
