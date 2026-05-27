/**
 * bugReport.test.ts — unit tests for bugReport.ts.
 *
 * Pure node environment — no DOM, no import.meta. We use two strategies:
 *
 *   1. Source inspection (readFileSync) — verifies structural/contractual
 *      properties (same pattern used throughout this repo).
 *   2. Direct import of buildBugReportUrl with minimal stubs — exercises the
 *      actual URL-building logic for URL encoding and context handling.
 *
 * The stubs use Object.defineProperty to avoid the read-only restriction on
 * globalThis.navigator in Node 25.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Source snapshot
// ---------------------------------------------------------------------------

const SRC = readFileSync(
  resolve(__dirname, 'bugReport.ts'),
  'utf-8',
);

// ---------------------------------------------------------------------------
// 1. Structural contract (source inspection)
// ---------------------------------------------------------------------------

describe('bugReport.ts — structural contract', () => {
  it('exports buildBugReportUrl function', () => {
    expect(SRC).toContain('export function buildBugReportUrl');
  });

  it('exports openBugReport function', () => {
    expect(SRC).toContain('export function openBugReport');
  });

  it('exports BugReportContext interface', () => {
    expect(SRC).toContain('export interface BugReportContext');
  });

  it('BugReportContext has errorMessage field', () => {
    expect(SRC).toContain('errorMessage?');
  });

  it('BugReportContext has errorStack field', () => {
    expect(SRC).toContain('errorStack?');
  });

  it('BugReportContext has routeName field', () => {
    expect(SRC).toContain('routeName?');
  });

  it('BugReportContext has userAction field', () => {
    expect(SRC).toContain('userAction?');
  });

  it('targets the correct GitHub issues URL', () => {
    expect(SRC).toContain('https://github.com/masonwyatt23/globeride/issues/new');
  });

  it('openBugReport uses noopener,noreferrer', () => {
    expect(SRC).toContain("'noopener,noreferrer'");
  });

  it('openBugReport opens in _blank tab', () => {
    expect(SRC).toContain("'_blank'");
  });

  it('does not call localStorage (only mentions it in comments)', () => {
    // Strip single-line comments and block comments, then check no localStorage usage.
    const codeOnly = SRC
      .replace(/\/\/.*$/gm, '')          // strip // comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // strip /* */ blocks
    expect(codeOnly).not.toContain('localStorage');
  });

  it('does not reference sessionStorage', () => {
    const codeOnly = SRC
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toContain('sessionStorage');
  });

  it('truncates errorStack to 800 chars', () => {
    expect(SRC).toContain('800');
  });

  it('truncates errorMessage title to 120 chars', () => {
    expect(SRC).toContain('120');
  });
});

// ---------------------------------------------------------------------------
// 2. Runtime URL-building tests (with minimal globalThis stubs)
// ---------------------------------------------------------------------------

// Restore descriptors so we can clean up after the suite.
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

const NAV_STUB = {
  userAgent: 'TestAgent/1.0',
  language: 'en-US',
  platform: 'MacIntel',
};

const WIN_STUB = {
  screen: { width: 1920, height: 1080 },
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 2,
  location: { pathname: '/app/ride' },
};

beforeAll(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: NAV_STUB,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: WIN_STUB,
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    // @ts-expect-error — cleanup
    delete globalThis.navigator;
  }
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    // @ts-expect-error — cleanup
    delete globalThis.window;
  }
});

// Lazy import so stubs are in place before the module initialises.
async function getBuildBugReportUrl() {
  const mod = await import('./bugReport');
  return mod.buildBugReportUrl;
}

function parseUrl(url: string) {
  const qIdx = url.indexOf('?');
  const base = url.slice(0, qIdx);
  const params = new URLSearchParams(url.slice(qIdx + 1));
  return { base, params };
}

describe('buildBugReportUrl — runtime URL encoding', () => {
  it('returns a string starting with the correct GitHub issues URL', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const url = buildBugReportUrl();
    expect(url).toMatch(/^https:\/\/github\.com\/masonwyatt23\/globeride\/issues\/new/);
  });

  it('always sets labels=bug', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const { params } = parseUrl(buildBugReportUrl());
    expect(params.get('labels')).toBe('bug');
  });

  it('always sets labels=bug even when errorMessage is provided', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const { params } = parseUrl(buildBugReportUrl({ errorMessage: 'Oops' }));
    expect(params.get('labels')).toBe('bug');
  });

  it('uses a generic [bug] title when no errorMessage is provided', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const { params } = parseUrl(buildBugReportUrl());
    expect(params.get('title')).toBe('[bug] ');
  });

  it('prefixes title with [bug] and includes errorMessage', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const { params } = parseUrl(buildBugReportUrl({ errorMessage: 'Cannot read route' }));
    expect(params.get('title')).toBe('[bug] Cannot read route');
  });

  it('truncates very long errorMessages in the title to ≤ 126 chars (prefix + 120)', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const longMsg = 'x'.repeat(200);
    const { params } = parseUrl(buildBugReportUrl({ errorMessage: longMsg }));
    const title = params.get('title')!;
    expect(title.length).toBeLessThanOrEqual(126); // '[bug] ' (6) + 120
  });

  it('includes errorMessage in body when provided', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const { params } = parseUrl(buildBugReportUrl({ errorMessage: 'Gradient exploded' }));
    expect(params.get('body')).toContain('Gradient exploded');
  });

  it('handles special chars in errorMessage without breaking URL structure', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const url = buildBugReportUrl({ errorMessage: 'Failed: <route> & "path" = null' });
    const { params } = parseUrl(url);
    expect(params.get('labels')).toBe('bug');
    expect(params.get('title')).toContain('Failed:');
  });

  it('includes routeName in body when provided', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const { params } = parseUrl(buildBugReportUrl({ routeName: "Alpe d'Huez" }));
    expect(params.get('body')).toContain("Alpe d'Huez");
  });

  it('includes userAction in body when provided', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    const { params } = parseUrl(buildBugReportUrl({ userAction: 'Clicked connect trainer' }));
    expect(params.get('body')).toContain('Clicked connect trainer');
  });

  it('handles undefined ctx gracefully (no throws)', async () => {
    const buildBugReportUrl = await getBuildBugReportUrl();
    expect(() => buildBugReportUrl(undefined)).not.toThrow();
    expect(() => buildBugReportUrl({})).not.toThrow();
  });
});
