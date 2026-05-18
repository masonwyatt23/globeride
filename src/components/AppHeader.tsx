import { Globe2, Github } from 'lucide-react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { SettingsButton } from '@/components/SettingsPanel';
import { cn } from '@/lib/utils';

/**
 * Shared top-of-page chrome. A glass bar that doesn't compete with the
 * 3D scene on the Ride view while anchoring the brand consistently.
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
        'flex items-center justify-between gap-3 px-4 sm:px-6 py-3',
        floating
          ? 'glass glass-hairline rounded-2xl mx-3 sm:mx-4 mt-3 sm:mt-4 pointer-events-auto'
          : 'border-b border-border/50 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20',
        className,
      )}
    >
      <a
        href="/"
        className="flex items-center gap-2.5 group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-0.5"
        aria-label="GlobeRide home"
      >
        {/* Brand mark */}
        <span className="relative inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-accent/20 ring-1 ring-inset ring-border/60 transition-all duration-300 group-hover:scale-105 group-hover:rotate-6 group-hover:ring-primary/40">
          <Globe2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />
        </span>
        <div className="min-w-0">
          <div className="text-sm sm:text-base font-bold tracking-tight text-foreground leading-tight">
            GlobeRide
          </div>
          <div className="hidden sm:block text-[10px] text-muted-foreground leading-tight tracking-wide">
            Virtual cycling · open source
          </div>
        </div>
      </a>

      <div className="flex items-center gap-1.5">
        <a
          href="https://github.com/masonwyatt23/globeride"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="GitHub repository"
          title="View source on GitHub"
        >
          <Github className="h-4 w-4" />
        </a>
        <SettingsButton variant="outline" size="icon" />
        <ThemeToggle />
      </div>
    </header>
  );
}
