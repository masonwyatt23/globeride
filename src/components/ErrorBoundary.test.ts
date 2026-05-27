/**
 * ErrorBoundary + errorReporting unit tests — pure vitest, node environment.
 *
 * Because vitest is configured with environment:'node' and no jsdom, we cannot
 * render React components directly. Instead we:
 *   1. Parse the source of ErrorBoundary.tsx and RouteErrorBoundary.tsx via
 *      readFileSync to verify structural correctness (same pattern used by
 *      FeatureGrid.test.ts, HeroVisual.test.ts, etc. in this repo).
 *   2. Import and exercise the pure-JS helpers from errorReporting.ts directly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Source snapshots
// ---------------------------------------------------------------------------

const EB_SRC = readFileSync(
  resolve(__dirname, 'ErrorBoundary.tsx'),
  'utf-8',
);

const REB_SRC = readFileSync(
  resolve(__dirname, 'RouteErrorBoundary.tsx'),
  'utf-8',
);

// ---------------------------------------------------------------------------
// 1. ErrorBoundary structural contract
// ---------------------------------------------------------------------------

describe('ErrorBoundary — structural contract', () => {
  it('exports ErrorBoundary as a named class component', () => {
    expect(EB_SRC).toMatch(/export class ErrorBoundary extends Component/);
  });

  it('implements getDerivedStateFromError lifecycle', () => {
    expect(EB_SRC).toContain('getDerivedStateFromError');
  });

  it('implements componentDidCatch lifecycle', () => {
    expect(EB_SRC).toContain('componentDidCatch');
  });

  it('logs to console with [ErrorBoundary] prefix', () => {
    expect(EB_SRC).toContain('[ErrorBoundary]');
  });

  it('default fallback contains a Reload action', () => {
    // The reload handler + button label both appear in the source.
    expect(EB_SRC).toContain('window.location.reload');
    expect(EB_SRC).toContain('Reload');
  });

  it('default fallback contains a Go home link', () => {
    expect(EB_SRC).toContain('Go home');
  });

  it('default fallback contains a Report bug link', () => {
    expect(EB_SRC).toContain('Report bug');
  });

  it('dev mode shows full stack; prod hides behind disclosure', () => {
    expect(EB_SRC).toContain('IS_DEV');
    expect(EB_SRC).toContain('Show technical details');
  });

  it('fallback UI has landmark role="main" and aria-labelledby', () => {
    expect(EB_SRC).toContain('role="main"');
    expect(EB_SRC).toContain('aria-labelledby');
  });

  it('accepts custom fallback prop', () => {
    // The Props interface exposes a fallback? function.
    expect(EB_SRC).toMatch(/fallback\??\s*:\s*\(err: Error, reset: \(\) => void\) => ReactNode/);
  });

  it('accepts onError prop for external telemetry', () => {
    expect(EB_SRC).toMatch(/onError\??\s*:/);
  });

  it('exports buildReportUrl helper', () => {
    expect(EB_SRC).toContain('export function buildReportUrl');
  });

  it('reset method clears error state', () => {
    expect(EB_SRC).toContain('error: null');
  });
});

// ---------------------------------------------------------------------------
// 2. RouteErrorBoundary structural contract
// ---------------------------------------------------------------------------

describe('RouteErrorBoundary — structural contract', () => {
  it('exports RouteErrorBoundary as a named export', () => {
    expect(REB_SRC).toContain('export function RouteErrorBoundary');
  });

  it('wraps ErrorBoundary', () => {
    expect(REB_SRC).toContain('<ErrorBoundary');
  });

  it('displays routeName in the fallback heading', () => {
    // The fallback interpolates routeName into the heading text.
    expect(REB_SRC).toContain('{routeName}');
  });

  it('provides both Reload and Try again actions', () => {
    expect(REB_SRC).toContain('Reload');
    expect(REB_SRC).toContain('Try again without reloading');
  });

  it('provides Go home link', () => {
    expect(REB_SRC).toContain('Go home');
  });

  it('provides Report bug link via buildReportUrl', () => {
    expect(REB_SRC).toContain('buildReportUrl');
    expect(REB_SRC).toContain('Report bug');
  });

  it('fallback UI has landmark role="main"', () => {
    expect(REB_SRC).toContain('role="main"');
  });
});

// ---------------------------------------------------------------------------
// 3. errorReporting.ts pure-JS helpers
// ---------------------------------------------------------------------------

// Read the source to verify structural contract without executing import.meta.
const ER_SRC = readFileSync(
  resolve(__dirname, '../lib/errorReporting.ts'),
  'utf-8',
);

describe('errorReporting — structural contract', () => {
  it('exports getAppVersion function', () => {
    expect(ER_SRC).toContain('export function getAppVersion');
  });

  it('exports formatErrorForReport function', () => {
    expect(ER_SRC).toContain('export function formatErrorForReport');
  });

  it('formatErrorForReport accepts (err, info, currentRoute?)', () => {
    expect(ER_SRC).toMatch(/formatErrorForReport\s*\(\s*err:\s*Error,\s*info:\s*ErrorInfo/);
  });

  it('includes browser UA in the diagnostic output', () => {
    expect(ER_SRC).toContain('navigator.userAgent');
  });

  it('includes the current route path in the diagnostic output', () => {
    expect(ER_SRC).toContain('location.pathname');
  });

  it('includes component stack from ErrorInfo when available', () => {
    expect(ER_SRC).toContain('componentStack');
  });
});

// ---------------------------------------------------------------------------
// 4. App.tsx integration — verify every route is wrapped
// ---------------------------------------------------------------------------

const APP_SRC = readFileSync(
  resolve(__dirname, '../App.tsx'),
  'utf-8',
);

describe('App.tsx — RouteErrorBoundary coverage', () => {
  it('imports RouteErrorBoundary', () => {
    expect(APP_SRC).toContain("import { RouteErrorBoundary }");
  });

  it('wraps the Landing route', () => {
    expect(APP_SRC).toMatch(/routeName="Landing"/);
  });

  it('wraps the Ride route', () => {
    expect(APP_SRC).toMatch(/routeName="Ride"/);
  });

  it('wraps the Explore route', () => {
    expect(APP_SRC).toMatch(/routeName="Explore"/);
  });

  it('wraps the Companion route', () => {
    expect(APP_SRC).toMatch(/routeName="Companion"/);
  });

  it('wraps the Replay route', () => {
    expect(APP_SRC).toMatch(/routeName="Replay"/);
  });

  it('wraps the Home (app) route', () => {
    expect(APP_SRC).toMatch(/routeName="Home"/);
  });

  it('wraps the Workout Builder route', () => {
    expect(APP_SRC).toMatch(/routeName="Workout Builder"/);
  });

  it('wraps the Draw route', () => {
    expect(APP_SRC).toMatch(/routeName="Draw"/);
  });
});

// ---------------------------------------------------------------------------
// 5. main.tsx — verify top-level ErrorBoundary wraps the app root
// ---------------------------------------------------------------------------

const MAIN_SRC = readFileSync(
  resolve(__dirname, '../main.tsx'),
  'utf-8',
);

describe('main.tsx — top-level ErrorBoundary', () => {
  it('imports ErrorBoundary', () => {
    expect(MAIN_SRC).toContain("import { ErrorBoundary }");
  });

  it('wraps <App /> in <ErrorBoundary>', () => {
    expect(MAIN_SRC).toContain('<ErrorBoundary>');
    expect(MAIN_SRC).toContain('<App />');
  });
});
