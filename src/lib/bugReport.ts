/**
 * bugReport.ts — Pre-filled GitHub issue URL builder.
 *
 * Collects non-PII diagnostic info (browser UA, screen size, app version,
 * current route) and encodes it into a GitHub new-issue URL so users can
 * submit a bug report with one click.
 *
 * Hard rules:
 *  - Never include localStorage values, OAuth tokens, or any personal data.
 *  - Always use noopener + noreferrer on window.open.
 */

import { getAppVersion } from '@/lib/errorReporting';

const ISSUES_URL = 'https://github.com/masonwyatt23/globeride/issues/new';

export interface BugReportContext {
  /** Short human-readable description of the error, if any. */
  errorMessage?: string;
  /** Stack trace snippet, if any. Truncated to 800 chars to keep URLs sane. */
  errorStack?: string;
  /** Loaded route name or GPX route title, if known. */
  routeName?: string;
  /** What the user was doing when the error occurred. */
  userAction?: string;
}

/** Collect non-PII environment diagnostics. */
function collectDiagnostics(): Record<string, string> {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const win = typeof window !== 'undefined' ? window : null;

  return {
    browser: nav?.userAgent ?? 'unknown',
    language: nav?.language ?? 'unknown',
    platform: nav?.platform ?? 'unknown',
    screenResolution: win
      ? `${win.screen.width}x${win.screen.height}`
      : 'unknown',
    viewportSize: win
      ? `${win.innerWidth}x${win.innerHeight}`
      : 'unknown',
    devicePixelRatio: win ? String(win.devicePixelRatio ?? 1) : '1',
    appVersion: getAppVersion(),
    currentPath: win?.location?.pathname ?? 'unknown',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build the full GitHub new-issue URL with pre-filled title + body.
 * Returns a string safe to pass to window.open or an <a href>.
 */
export function buildBugReportUrl(ctx?: BugReportContext): string {
  const diag = collectDiagnostics();

  // Title: use errorMessage if available, else generic prompt.
  const rawTitle = ctx?.errorMessage
    ? `[bug] ${ctx.errorMessage.slice(0, 120)}`
    : '[bug] ';

  // Build body sections.
  const what = ctx?.userAction
    ? `**What were you doing?**\n${ctx.userAction}\n\n`
    : '';

  const errorSection = ctx?.errorMessage
    ? `**Error**\n\`\`\`\n${ctx.errorMessage}\n\`\`\`\n\n`
    : '';

  const stackSection = ctx?.errorStack
    ? `**Stack trace**\n\`\`\`\n${ctx.errorStack.slice(0, 800)}\n\`\`\`\n\n`
    : '';

  const routeSection = ctx?.routeName
    ? `**Route**\n${ctx.routeName}\n\n`
    : '';

  const envSection =
    `**Environment**\n` +
    `| Key | Value |\n` +
    `|-----|-------|\n` +
    `| App version | ${diag.appVersion} |\n` +
    `| Browser | ${diag.browser} |\n` +
    `| Language | ${diag.language} |\n` +
    `| Platform | ${diag.platform} |\n` +
    `| Screen | ${diag.screenResolution} |\n` +
    `| Viewport | ${diag.viewportSize} |\n` +
    `| DPR | ${diag.devicePixelRatio} |\n` +
    `| Path | ${diag.currentPath} |\n` +
    `| Time (UTC) | ${diag.timestamp} |\n\n`;

  const stepsSection =
    `**Steps to reproduce**\n` +
    `1. \n` +
    `2. \n` +
    `3. \n\n`;

  const extraSection =
    `**Additional context**\n` +
    `<!-- Console errors, screenshots, anything else helpful -->\n`;

  const body =
    what +
    errorSection +
    stackSection +
    routeSection +
    stepsSection +
    envSection +
    extraSection;

  const params = new URLSearchParams({
    title: rawTitle,
    body,
    labels: 'bug',
  });

  return `${ISSUES_URL}?${params.toString()}`;
}

/**
 * Open a pre-filled GitHub bug report in a new tab.
 * Always uses noopener + noreferrer.
 */
export function openBugReport(ctx?: BugReportContext): void {
  const url = buildBugReportUrl(ctx);
  window.open(url, '_blank', 'noopener,noreferrer');
}
