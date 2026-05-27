import { Globe2, Github } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { InstallPWAButton } from '@/components/setup/InstallPWAButton';

export function LandingHeader() {
  const navigate = useNavigate();

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6 lg:px-10 py-2.5 sm:py-3 animate-slideDown"
      style={{
        background: 'hsl(220 42% 4% / 0.85)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid hsl(215 26% 12%)',
      }}
    >
      {/* Brand */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2.5 group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg p-0.5"
        aria-label="GlobeRide home"
      >
        <span
          className="relative inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-105 group-hover:rotate-6"
          style={{
            background: 'linear-gradient(135deg, hsl(195 92% 56% / 0.2), hsl(158 80% 42% / 0.15))',
            border: '1px solid hsl(195 92% 56% / 0.25)',
          }}
        >
          <Globe2 className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: '#22d3ee', filter: 'drop-shadow(0 0 6px hsl(195 92% 56% / 0.6))' }} />
        </span>
        <div className="min-w-0">
          <div className="text-sm sm:text-base font-bold tracking-tight text-white leading-tight">GlobeRide</div>
          <div className="hidden sm:block text-[10px] leading-tight tracking-wide" style={{ color: 'hsl(215 18% 42%)' }}>Virtual cycling · open source</div>
        </div>
      </button>

      {/* Nav actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <a
          href="https://github.com/masonwyatt23/globeride"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          style={{
            background: 'hsl(220 42% 8%)',
            border: '1px solid hsl(215 26% 16%)',
            color: 'hsl(215 18% 50%)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'white'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'hsl(215 26% 24%)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(215 18% 50%)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'hsl(215 26% 16%)'; }}
          aria-label="GitHub repository"
        >
          <Github className="h-4 w-4" />
        </a>
        <InstallPWAButton />
        <button
          onClick={() => navigate('/app?demo=1')}
          className="hidden xs:inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95"
          style={{
            background: 'hsl(195 92% 56% / 0.1)',
            border: '1px solid hsl(195 92% 56% / 0.25)',
            color: '#22d3ee',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(195 92% 56% / 0.18)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(195 92% 56% / 0.1)'; }}
        >
          <Play className="h-3 w-3" fill="currentColor" />
          Demo
        </button>
        <button
          onClick={() => navigate('/app')}
          className="inline-flex items-center h-9 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #22d3ee, hsl(158 80% 42%))',
            color: 'hsl(220 42% 4%)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <span className="hidden xs:inline">Launch{' '}</span>app
        </button>
      </div>
    </header>
  );
}
