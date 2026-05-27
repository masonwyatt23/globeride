/**
 * errorReporting.ts — diagnostic helpers consumed by ErrorBoundary (41.B) and
 * the GitHub issue flow (41.C).
 *
 * Intentionally kept framework-free so it can be imported in both class
 * components and server-side contexts without side effects.
 */

import type { ErrorInfo } from 'react';

// ---------------------------------------------------------------------------
// App version
// ---------------------------------------------------------------------------

/**
 * Returns the app version from the Vite-injected package.json field.
 * Falls back to 'unknown' in test environments where import.meta.env is
 * unavailable.
 */
export function getAppVersion(): string {
  try {
    // Vite replaces import.meta.env.VITE_APP_VERSION at build time if set;
    // otherwise we fall back to the package.json version injected via define.
    const v =
      (typeof import.meta !== 'undefined' && (import.meta.env as Record<string, string>)?.VITE_APP_VERSION) ||
      (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined);
    return v ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Diagnostic blob formatter
// ---------------------------------------------------------------------------

/**
 * Formats a diagnostic string suitable for pre-filling a GitHub issue body.
 * Called by 41.C's bug-report flow and by ErrorBoundary's buildReportUrl.
 *
 * @param err         The caught Error object.
 * @param info        React ErrorInfo (componentStack). May be null when called
 *                    outside a componentDidCatch context.
 * @param currentRoute Optional override for the current pathname; defaults to
 *                     window.location.pathname.
 */
export function formatErrorForReport(
  err: Error,
  info: ErrorInfo | null,
  currentRoute?: string,
): string {
  const route =
    currentRoute ??
    (typeof window !== 'undefined' ? window.location.pathname : '(unknown)');
  const ua =
    typeof navigator !== 'undefined' ? navigator.userAgent : '(server)';
  const version = getAppVersion();
  const ts = new Date().toISOString();

  const lines: string[] = [
    `**GlobeRide crash report** — v${version} — ${ts}`,
    '',
    '### Error',
    '```',
    `${err.name}: ${err.message}`,
    '',
    err.stack ?? '(no stack trace)',
    '```',
    '',
  ];

  if (info?.componentStack) {
    lines.push('### Component stack');
    lines.push('```');
    lines.push(info.componentStack.trim());
    lines.push('```');
    lines.push('');
  }

  lines.push('### Context');
  lines.push(`- **Route:** \`${route}\``);
  lines.push(`- **Browser:** \`${ua}\``);
  lines.push(`- **App version:** \`${version}\``);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// __APP_VERSION__ ambient declaration (injected by vite.config.ts define)
// ---------------------------------------------------------------------------
declare const __APP_VERSION__: string | undefined;
