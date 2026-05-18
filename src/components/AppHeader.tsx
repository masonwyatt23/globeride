import { Github, Globe2 } from 'lucide-react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

/**
 * Shared top-of-page chrome. A subtle glass bar so we don't compete with the
 * 3D scene on the Ride view while still anchoring the brand consistently
 * across routes. Floats over content when `floating` is set (used on /ride).
 */
export function AppHeader({
  floating = false,
  className,
}: {
  floating?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4',
        floating
          ? 'glass glass-hairline rounded-2xl mx-3 sm:mx-4 mt-3 sm:mt-4 pointer-events-auto'
          : 'border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20',
        className,
      )}
    >
      <a
        href="/"
        className="flex items-center gap-3 group min-w-0"
        aria-label="GlobeRide home"
      >
        <span className="relative inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/5 to-accent/15 ring-1 ring-inset ring-border/70 transition-transform duration-300 group-hover:rotate-6">
          <Globe2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.55)]" />
        </span>
        <div className="min-w-0">
          <div className="text-base sm:text-lg font-bold tracking-tight text-foreground leading-tight">
            GlobeRide
          </div>
          <div className="hidden sm:block text-[11px] text-muted-foreground leading-tight">
            Virtual cycling on a 3D Earth · open source
          </div>
        </div>
      </a>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <a
          href="https://github.com/masonwyatt23/globeride"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all duration-200 active:scale-95"
          aria-label="GitHub repository"
          title="View source on GitHub"
        >
          <Github className="h-4 w-4" />
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
