import { Globe2, Github } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function LandingFooter() {
  const navigate = useNavigate();

  return (
    <footer
      className="px-4 sm:px-6 lg:px-10 py-10"
      style={{ borderTop: '1px solid hsl(215 26% 12%)' }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        {/* Brand */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg p-0.5"
          aria-label="GlobeRide home"
        >
          <span
            className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-105 group-hover:rotate-6"
            style={{
              background: 'linear-gradient(135deg, hsl(195 92% 56% / 0.2), hsl(158 80% 42% / 0.15))',
              border: '1px solid hsl(195 92% 56% / 0.2)',
            }}
          >
            <Globe2 className="h-4 w-4" style={{ color: '#22d3ee' }} />
          </span>
          <div>
            <div className="text-sm font-bold tracking-tight text-white">GlobeRide</div>
            <div className="text-[10px] tracking-wide" style={{ color: 'hsl(215 18% 40%)' }}>MIT licensed</div>
          </div>
        </button>

        {/* Links */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" style={{ color: 'hsl(215 18% 42%)' }}>
          <button
            onClick={() => navigate('/app')}
            className="hover:text-white transition-colors"
          >
            Launch app
          </button>
          <a
            href="https://github.com/masonwyatt23/globeride/releases"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            What's new
          </a>
          <a
            href="https://github.com/masonwyatt23/globeride"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            Source on GitHub
          </a>
          <a
            href="https://github.com/masonwyatt23/globeride/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            MIT License
          </a>
        </div>

        <span className="num text-[11px]" style={{ color: 'hsl(215 18% 30%)' }}>v0.2.0</span>
      </div>
    </footer>
  );
}
