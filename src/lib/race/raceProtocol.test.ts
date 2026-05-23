/**
 * Tests for the GlobeRide P2P Race Protocol.
 *
 * 22 tests in vitest node environment.
 * localStorage polyfilled via Object.defineProperty.
 * window = globalThis so Zustand's window.localStorage access works.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createManifest,
  encodeManifestUrl,
  decodeManifestUrl,
  manifestToJsonFile,
  validateResult,
  signResult,
  verifyResult,
  getOrCreateDeviceKey,
  buildAndSignResult,
  RACE_SCHEMA_VERSION,
} from '@/lib/race/raceProtocol';
import type { RaceManifest, RaceResult } from '@/lib/race/raceProtocol';

// ---------------------------------------------------------------------------
// Polyfill localStorage + window for the vitest node environment.
// ---------------------------------------------------------------------------

const _lsStore: Record<string, string> = {};
const _lsMock = {
  getItem:    (k: string) => _lsStore[k] ?? null,
  setItem:    (k: string, v: string) => { _lsStore[k] = v; },
  removeItem: (k: string) => { delete _lsStore[k]; },
  clear:      () => { Object.keys(_lsStore).forEach((k) => delete _lsStore[k]); },
  get length() { return Object.keys(_lsStore).length; },
  key:        (i: number) => Object.keys(_lsStore)[i] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: _lsMock, writable: true, configurable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: globalThis, writable: true, configurable: true,
});

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

const NOW = Date.now();
const WINDOW_START = NOW - 60 * 60 * 1000;
const WINDOW_END   = NOW + 60 * 60 * 1000;

let TEST_KEY: CryptoKey;

beforeAll(async () => {
  TEST_KEY = await getOrCreateDeviceKey();
});

function makeManifest(overrides?: Partial<Parameters<typeof createManifest>[0]>): RaceManifest {
  return createManifest({
    name: 'Test Race',
    routeRef: { kind: 'iconic', routeId: 'alpe-du-huez' },
    utcWindow: { startMs: WINDOW_START, endMs: WINDOW_END },
    rules: {},
    ...overrides,
  });
}

async function makeResult(
  manifest: RaceManifest,
  overrides?: Partial<Pick<RaceResult, 'avgPowerW' | 'finishTimeMs' | 'totalAscentM' | 'rider'>>,
): Promise<RaceResult> {
  return buildAndSignResult({
    manifest,
    rider: overrides?.rider ?? { name: 'Alice', weightKg: 65, ftpW: 280 },
    finishTimeMs: overrides?.finishTimeMs ?? 2_522_000,
    avgPowerW: overrides?.avgPowerW ?? 220,
    totalAscentM: overrides?.totalAscentM ?? 1200,
    samplesBlob: JSON.stringify([[NOW, 0, 5, 200], [NOW + 1000, 10, 5.2, 210]]),
  }, TEST_KEY);
}

// ---------------------------------------------------------------------------
// 1. Roundtrip: create → encode → decode
// ---------------------------------------------------------------------------

describe('create + encode + decode roundtrip', () => {
  it('decodes to an identical manifest', () => {
    const m = makeManifest();
    const decoded = decodeManifestUrl(encodeManifestUrl(m));
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(m.id);
    expect(decoded!.name).toBe(m.name);
    expect(decoded!.schemaVersion).toBe(RACE_SCHEMA_VERSION);
    expect(decoded!.utcWindow.startMs).toBe(m.utcWindow.startMs);
    expect((decoded!.routeRef as { routeId: string }).routeId).toBe('alpe-du-huez');
  });

  it('encodes a wts routeRef and roundtrips correctly', () => {
    const m = makeManifest({ routeRef: { kind: 'wts', stageId: 'tdf-2023-stage19' } });
    const decoded = decodeManifestUrl(encodeManifestUrl(m));
    expect(decoded?.routeRef.kind).toBe('wts');
    expect((decoded!.routeRef as { stageId: string }).stageId).toBe('tdf-2023-stage19');
  });
});

// ---------------------------------------------------------------------------
// 2. decodeManifestUrl rejects malformed input
// ---------------------------------------------------------------------------

describe('decodeManifestUrl — malformed input', () => {
  it('returns null for a plain URL with no race param', () => {
    expect(decodeManifestUrl('https://globeride.vercel.app/')).toBeNull();
  });

  it('returns null for an invalid base64 race param', () => {
    expect(decodeManifestUrl('https://globeride.vercel.app/?race=!!!notbase64!!!')).toBeNull();
  });

  it('returns null when JSON is valid but missing required fields', () => {
    const bad = btoa(JSON.stringify({ schemaVersion: 1, name: 'Oops' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(decodeManifestUrl(`https://globeride.vercel.app/?race=${bad}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. decodeManifestUrl rejects future schemaVersion
// ---------------------------------------------------------------------------

describe('decodeManifestUrl — future schemaVersion', () => {
  it('returns null for schemaVersion 2', () => {
    const m = makeManifest();
    const future = { ...m, schemaVersion: 2 } as unknown as RaceManifest;
    expect(decodeManifestUrl(encodeManifestUrl(future))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. validateResult — time window
// ---------------------------------------------------------------------------

describe('validateResult — time window', () => {
  it('rejects a result recorded before the window opens', async () => {
    const manifest = makeManifest();
    const result = await makeResult(manifest);
    const v = validateResult({ ...result, recordedAt: WINDOW_START - 1 }, manifest);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/outside the race window/i);
  });

  it('rejects a result recorded after the window closes', async () => {
    const manifest = makeManifest();
    const result = await makeResult(manifest);
    const v = validateResult({ ...result, recordedAt: WINDOW_END + 1 }, manifest);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/outside the race window/i);
  });

  it('accepts a result recorded exactly at window start', async () => {
    const manifest = makeManifest();
    const result = await makeResult(manifest);
    const v = validateResult({ ...result, recordedAt: WINDOW_START }, manifest);
    expect(v.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. validateResult — mismatched raceId
// ---------------------------------------------------------------------------

describe('validateResult — mismatched routeRef', () => {
  it('rejects when raceId does not match manifest id', async () => {
    const manifest = makeManifest();
    const result = await makeResult(manifest);
    const v = validateResult({ ...result, raceId: 'wrong-id' }, manifest);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/does not match manifest id/i);
  });
});

// ---------------------------------------------------------------------------
// 6. signResult / verifyResult roundtrip
// ---------------------------------------------------------------------------

describe('signResult / verifyResult', () => {
  it('verifies a freshly signed result', async () => {
    const result = await makeResult(makeManifest());
    expect(await verifyResult(result, TEST_KEY)).toBe(true);
  });

  it('rejects a tampered finishTimeMs', async () => {
    const result = await makeResult(makeManifest());
    expect(await verifyResult({ ...result, finishTimeMs: result.finishTimeMs + 1 }, TEST_KEY)).toBe(false);
  });

  it('sign is deterministic — same input → same signature', async () => {
    const manifest = makeManifest();
    const result = await makeResult(manifest);
    const { signature: _sig, ...resultWithoutSig } = result;
    const sig2 = await signResult(resultWithoutSig, TEST_KEY);
    expect(sig2).toBe(result.signature);
  });
});

// ---------------------------------------------------------------------------
// 7. Anti-cheat: maxAvgPowerWPerKg
// ---------------------------------------------------------------------------

describe('validateResult — anti-cheat W/kg', () => {
  it('rejects 600 W for a 65 kg rider (≈9.2 W/kg > 5.0 limit)', async () => {
    const manifest = makeManifest({ rules: { maxAvgPowerWPerKg: 5.0 } });
    const result = await makeResult(manifest, { avgPowerW: 600 });
    const v = validateResult(result, manifest);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/W\/kg/);
  });

  it('accepts 280 W for a 65 kg rider (≈4.3 W/kg < 5.0 limit)', async () => {
    const manifest = makeManifest({ rules: { maxAvgPowerWPerKg: 5.0 } });
    const result = await makeResult(manifest, { avgPowerW: 280 });
    expect(validateResult(result, manifest).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. manifestToJsonFile produces valid JSON
// ---------------------------------------------------------------------------

describe('manifestToJsonFile', () => {
  it('Blob text is valid JSON matching the manifest', async () => {
    const m = makeManifest();
    const blob = manifestToJsonFile(m);
    expect(blob.type).toBe('application/json');
    const parsed = JSON.parse(await blob.text()) as RaceManifest;
    expect(parsed.id).toBe(m.id);
    expect(parsed.schemaVersion).toBe(RACE_SCHEMA_VERSION);
  });
});

// ---------------------------------------------------------------------------
// 9. Dedup logic (pure, no Zustand)
// ---------------------------------------------------------------------------

function insertResult(existing: RaceResult[], incoming: RaceResult): RaceResult[] {
  if (existing.some((r) => r.signature === incoming.signature)) return existing;
  return [...existing, incoming];
}

describe('importPeerResult deduplication logic', () => {
  it('does not insert the same result twice', async () => {
    const result = await makeResult(makeManifest());
    let arr: RaceResult[] = [];
    arr = insertResult(arr, result);
    arr = insertResult(arr, result);
    expect(arr.length).toBe(1);
  });

  it('inserts two different-signature results as separate entries', async () => {
    const manifest = makeManifest();
    const r1 = await makeResult(manifest);
    const r2 = await buildAndSignResult({
      manifest,
      rider: { name: 'Bob', weightKg: 70 },
      finishTimeMs: 3_000_000,
      totalAscentM: 1200,
      samplesBlob: JSON.stringify([[NOW + 1, 0, 4, 180]]),
    }, TEST_KEY);
    let arr: RaceResult[] = [];
    arr = insertResult(arr, r1);
    arr = insertResult(arr, r2);
    expect(arr.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 10. raceStore Zustand persist integration
// ---------------------------------------------------------------------------

describe('raceStore — Zustand persist', () => {
  it('importPeerResult deduplicates by signature in the real store', async () => {
    const { useRaceStore } = await import('@/stores/raceStore');
    const manifest = makeManifest();
    useRaceStore.getState().loadManifest(manifest);

    const result = await makeResult(manifest);
    useRaceStore.getState().importPeerResult(result);
    useRaceStore.getState().importPeerResult(result); // duplicate

    const stored = useRaceStore.getState().getResultsForRace(manifest.id);
    expect(stored.length).toBe(1);

    useRaceStore.getState().clearResults(manifest.id);
    useRaceStore.getState().removeManifest(manifest.id);
  });
});

// ---------------------------------------------------------------------------
// 11. createManifest input validation
// ---------------------------------------------------------------------------

describe('createManifest — input validation', () => {
  it('throws when name is empty', () => {
    expect(() => makeManifest({ name: '' })).toThrow(/name is required/i);
  });

  it('throws when endMs <= startMs', () => {
    expect(() => makeManifest({ utcWindow: { startMs: NOW, endMs: NOW - 1 } }))
      .toThrow(/endMs must be after/i);
  });

  it('throws when description exceeds 400 chars', () => {
    expect(() => makeManifest({ description: 'x'.repeat(401) }))
      .toThrow(/400 characters/i);
  });
});
