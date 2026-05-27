import { Github, Play, Download } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function LandingCTA() {
  const navigate = useNavigate();
  const [installing, setInstalling] = useState(false);

  function handleInstall() {
    // PWA install prompt — stored by the usePWAInstall hook / PWA affordance
    // mounted in App.tsx. We dispatch a custom event that the existing handler
    // listens for, rather than duplicating the deferredPrompt logic here.
    setInstalling(true);
    window.dispatchEvent(new CustomEvent('globeride:requestInstall'));
    setTimeout(() => setInstalling(false), 2000);
  }

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-24 sm:py-32 overflow-hidden">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Top separator line */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, hsl(195 92% 56% / 0.18), transparent)' }}
        />
        {/* Aqua glow bloom */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 h-[48rem] w-[64rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse, hsl(195 92% 56% / 0.06) 0%, transparent 68%)' }}
        />
        {/* Subtle green accent bottom-left */}
        <div
          className="absolute bottom-0 left-0 h-[24rem] w-[36rem]"
          style={{ background: 'radial-gradient(ellipse at 0% 100%, hsl(158 80% 42% / 0.04) 0%, transparent 70%)' }}
        />
      </div>

      <div className="max-w-3xl mx-auto text-center">
        {/* Eyebrow */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest mb-6"
          style={{ background: 'hsl(195 92% 56% / 0.07)', border: '1px solid hsl(195 92% 56% / 0.2)', color: 'hsl(195 92% 56%)' }}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
          </span>
          Ready to ride?
        </div>

        {/* Headline */}
        <h2
          className="font-extrabold text-white mb-5"
          style={{ fontSize: 'clamp(2.25rem, 5.5vw, 4rem)', lineHeight: '1.0', letterSpacing: '-0.038em' }}
        >
          Start riding in{' '}
          <span style={{ background: 'linear-gradient(130deg, #22d3ee, hsl(158 80% 42%))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            30 seconds.
          </span>
        </h2>

        <p className="text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto" style={{ color: 'hsl(215 18% 52%)' }}>
          No account. No server. No subscription. Open Chrome, drop a GPX, and feel the gradient.
        </p>

        {/* CTA row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 max-w-sm sm:max-w-none mx-auto">
          {/* Primary: Try demo */}
          <button
            onClick={() => navigate('/app?demo=1')}
            className="inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm sm:text-base active:scale-[0.97] transition-all duration-200"
            style={{ height: '3.5rem', padding: '0 2rem', background: 'linear-gradient(135deg, #22d3ee, hsl(158 80% 42%))', color: 'hsl(220 42% 4%)', boxShadow: '0 8px 40px -10px hsl(195 92% 56% / 0.65)', border: 'none', cursor: 'pointer' }}
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Try demo route
          </button>

          {/* Secondary: Install */}
          <button
            onClick={handleInstall}
            disabled={installing}
            className="inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm sm:text-base active:scale-[0.97] transition-all duration-200 disabled:opacity-60"
            style={{ height: '3.5rem', padding: '0 1.75rem', background: 'hsl(220 42% 8%)', color: 'white', border: '1px solid hsl(215 26% 20%)', cursor: 'pointer', boxShadow: 'none' }}
          >
            <Download className="h-4 w-4" />
            {installing ? 'Installing…' : 'Install app'}
          </button>

          {/* Tertiary: GitHub */}
          <a
            href="https://github.com/masonwyatt23/globeride"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors duration-200 active:scale-[0.97]"
            style={{ height: '3.5rem', padding: '0 1.5rem', background: 'transparent', color: 'hsl(215 18% 55%)', border: '1px solid hsl(215 26% 18%)' }}
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>

        {/* Install note */}
        <p className="mt-3 text-xs" style={{ color: 'hsl(215 18% 32%)' }}>
          Install to your home screen — works fully offline as a PWA
        </p>

        {/* Trust signals */}
        <div
          className="mt-8 flex flex-wrap items-center justify-center gap-x-5 sm:gap-x-8 gap-y-2 text-xs"
          style={{ color: 'hsl(215 18% 38%)' }}
        >
          {['Open source', 'MIT licensed', 'No account', 'Chrome & Edge desktop + Android'].map((t, i) => (
            <span key={t} className="flex items-center gap-2">
              {i > 0 && <span className="h-1 w-1 rounded-full" style={{ background: 'hsl(215 26% 20%)' }} aria-hidden />}
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
