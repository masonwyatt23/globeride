import { Globe2, Github } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function LandingFooter() {
  const navigate = useNavigate();

  return (
    <footer className="px-4 sm:px-6 lg:px-10 py-10 border-t border-border/40">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        {/* Brand */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-0.5"
          aria-label="GlobeRide home"
        >
          <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/8 to-accent/16 ring-1 ring-inset ring-border/50 transition-all duration-200 group-hover:scale-105 group-hover:rotate-6">
            <Globe2 className="h-4 w-4 text-primary/80" />
          </span>
          <div>
            <div className="text-sm font-bold tracking-tight text-foreground">GlobeRide</div>
            <div className="text-[10px] text-muted-foreground tracking-wide">MIT licensed</div>
          </div>
        </button>

        {/* Links */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <button
            onClick={() => navigate('/app')}
            className="hover:text-foreground transition-colors"
          >
            Launch app
          </button>
          <a
            href="https://github.com/masonwyatt23/globeride"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            Source on GitHub
          </a>
          <a
            href="https://github.com/masonwyatt23/globeride/issues"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Report an issue
          </a>
        </div>

        <span className="num text-[11px] text-muted-foreground/50">v0.2.0</span>
      </div>
    </footer>
  );
}
