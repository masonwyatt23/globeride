/**
 * RouteErrorBoundary — lightweight functional wrapper around ErrorBoundary
 * that renders a route-aware fallback message.
 *
 * Usage (in App.tsx):
 *   <RouteErrorBoundary routeName="Ride">
 *     <Suspense fallback={<LoadingFallback />}>
 *       <Ride />
 *     </Suspense>
 *   </RouteErrorBoundary>
 */

import React, { ReactNode } from 'react';
import { ErrorBoundary, buildReportUrl } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Route-specific fallback
// ---------------------------------------------------------------------------

function RouteFallback({
  routeName,
  error,
  onReload,
  onReset,
}: {
  routeName: string;
  error: Error;
  onReload: () => void;
  onReset: () => void;
}) {
  const reportUrl = buildReportUrl(error, null);

  return (
    <main
      role="main"
      aria-labelledby="route-error-heading"
      className="flex min-h-[60vh] items-center justify-center p-6"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-7 text-center shadow-xl backdrop-blur-md"
        role="alert"
        aria-live="assertive"
      >
        <h2 id="route-error-heading" className="mb-2 text-lg font-semibold text-foreground">
          The {routeName} view crashed
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Try reloading this page or go back home. Your ride data is not
          affected.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={onReload} className="w-full">
            Reload
          </Button>
          <Button variant="ghost" onClick={onReset} className="w-full">
            Try again without reloading
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <a href="/">Go home</a>
          </Button>
        </div>
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Report bug on GitHub
        </a>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// RouteErrorBoundary
// ---------------------------------------------------------------------------

interface RouteErrorBoundaryProps {
  routeName: string;
  children: ReactNode;
}

export function RouteErrorBoundary({
  routeName,
  children,
}: RouteErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <RouteFallback
          routeName={routeName}
          error={err}
          onReload={() => window.location.reload()}
          onReset={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export default RouteErrorBoundary;
