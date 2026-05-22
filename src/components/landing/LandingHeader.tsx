import { Globe2, Github } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { InstallPWAButton } from '@/components/InstallPWAButton';

export function LandingHeader() {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6 lg:px-10 py-2.5 sm:py-3 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 animate-slideDown">
      {/* Brand */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2.5 group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-0.5"
        aria-label="GlobeRide home"
      >
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
      </button>

      {/* Nav actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <a
          href="https://github.com/masonwyatt23/globeride"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="GitHub repository"
        >
          <Github className="h-4 w-4" />
        </a>
        <InstallPWAButton />
        <ThemeToggle />
        <Button
          size="sm"
          variant="accent"
          onClick={() => navigate('/app')}
          className="rounded-full active:scale-95 text-xs sm:text-sm px-3 sm:px-4"
        >
          <span className="hidden xs:inline">Launch </span>app
        </Button>
      </div>
    </header>
  );
}
