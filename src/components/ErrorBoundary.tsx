/**
 * ErrorBoundary — catches React render/lifecycle errors and displays a polished
 * fallback UI instead of white-screening. Wrap any subtree that may throw.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 *   // Custom fallback:
 *   <ErrorBoundary fallback={(err, reset) => <MyFallback error={err} onReset={reset} />}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

const IS_DEV = import.meta.env.DEV;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback renderer. Receives the caught error and a reset callback. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
  /** Optional side-effect hook for telemetry / external reporting. */
  onError?: (err: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  detailsOpen: boolean;
}

// ---------------------------------------------------------------------------
// Report URL helper — consumed by 41.C
// ---------------------------------------------------------------------------

export function buildReportUrl(err: Error, info: ErrorInfo | null): string {
  const base = 'https://github.com/masonwyatt23/globeride/issues/new';
  const title = encodeURIComponent(`[crash] ${err.message.slice(0, 80)}`);
  const body = encodeURIComponent(
    [
      '**Describe what you were doing when the crash happened:**',
      '',
      '<!-- paste the technical details below -->',
      '',
      '```',
      `Error: ${err.message}`,
      err.stack ?? '',
      '',
      'Component stack:',
      info?.componentStack ?? '(unavailable)',
      '```',
      '',
      `**Browser:** ${navigator.userAgent}`,
      `**Route:** ${location.pathname}`,
    ].join('\n'),
  );
  return `${base}?template=bug_report.md&title=${title}&body=${body}`;
}

// ---------------------------------------------------------------------------
// Default fallback UI
// ---------------------------------------------------------------------------

function DefaultFallback({
  error,
  detailsOpen,
  onToggleDetails,
  onReload,
  reportUrl,
}: {
  error: Error;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onReload: () => void;
  reportUrl: string;
}) {
  return (
    <main
      role="main"
      aria-labelledby="error-heading"
      className="fixed inset-0 flex items-center justify-center bg-background p-4"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md"
        role="alert"
        aria-live="assertive"
      >
        {/* Icon */}
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
          <svg
            aria-hidden="true"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        {/* Headline */}
        <h1
          id="error-heading"
          className="mb-2 text-xl font-semibold text-foreground"
        >
          Something went wrong
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          An unexpected error occurred. You can try reloading — your local data
          is safe.
        </p>

        {/* Technical details (dev: always expanded; prod: disclosure) */}
        {IS_DEV ? (
          <pre className="mb-6 max-h-48 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-xs text-red-300 whitespace-pre-wrap break-all">
            {error.stack ?? error.message}
          </pre>
        ) : (
          <div className="mb-6">
            <button
              type="button"
              onClick={onToggleDetails}
              aria-expanded={detailsOpen}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                aria-hidden="true"
                className={`h-3 w-3 transition-transform ${detailsOpen ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
              </svg>
              Show technical details
            </button>
            {detailsOpen && (
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-xs text-red-300 whitespace-pre-wrap break-all">
                {error.message}
              </pre>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={onReload} className="flex-1">
            Reload
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            asChild
          >
            <a href="/">Go home</a>
          </Button>
        </div>
        <div className="mt-3 text-center">
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Report bug on GitHub
          </a>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ErrorBoundary class component
// ---------------------------------------------------------------------------

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, errorInfo: null, detailsOpen: false };
    this.reset = this.reset.bind(this);
    this.handleToggleDetails = this.handleToggleDetails.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error.message, info);
    this.setState({ errorInfo: info });
    this.props.onError?.(error, info);
  }

  reset(): void {
    this.setState({ error: null, errorInfo: null, detailsOpen: false });
  }

  handleToggleDetails(): void {
    this.setState(s => ({ detailsOpen: !s.detailsOpen }));
  }

  handleReload(): void {
    window.location.reload();
  }

  render() {
    const { error, errorInfo, detailsOpen } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (fallback) {
        return fallback(error, this.reset);
      }

      const reportUrl = buildReportUrl(error, errorInfo);

      return (
        <DefaultFallback
          error={error}
          detailsOpen={detailsOpen}
          onToggleDetails={this.handleToggleDetails}
          onReload={this.handleReload}
          reportUrl={reportUrl}
        />
      );
    }

    return children;
  }
}

export default ErrorBoundary;
