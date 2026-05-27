import { ArrowRight, Github, Play, MonitorPlay } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { HeroVisual } from './HeroVisual';
import { DemoModal } from './DemoModal';

function StatBadge({ value, label, delay = 0 }: { value: string; label: string; delay?: number }) {
  return (
    <div
      className="inline-flex items-center gap-2.5 rounded-full px-3.5 py-2 animate-fadeUp"
      style={{
        background: 'hsl(220 42% 7% / 0.9)',
        border: '1px solid hsl(195 92% 56% / 0.2)',
        backdropFilter: 'blur(12px)',
        animationDelay: `${delay}ms`,
      }}
    >
      <span className="font-black text-sm text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span className="text-xs" style={{ color: 'hsl(215 18% 50%)' }}>{label}</span>
    </div>
  );
}

export function HeroSection() {
  const navigate = useNavigate();
  const [demoOpen, setDemoOpen] = useState(false);
  const visualRef = useRef<HTMLDivElement>(null);

  // Mouse-tracking parallax on hero visual — ≤8px offset, skipped for reduced-motion
  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    const MAX_OFFSET = 8;
    function onMouseMove(e: MouseEvent) {
      if (!visualRef.current) return;
      const dx = ((e.clientX - window.innerWidth / 2) / (window.innerWidth / 2)) * MAX_OFFSET;
      const dy = ((e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)) * MAX_OFFSET;
      visualRef.current.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
    function onMouseLeave() {
      if (visualRef.current) visualRef.current.style.transform = 'translate(0,0)';
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseleave', onMouseLeave);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
        <div className="absolute inset-0" style={{ background: 'hsl(220 42% 4%)' }} />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: [
              'radial-gradient(1px 1px at 12% 18%, hsl(210 60% 80% / 0.6) 0%, transparent 100%)',
              'radial-gradient(1px 1px at 28% 72%, hsl(210 60% 80% / 0.5) 0%, transparent 100%)',
              'radial-gradient(1px 1px at 42% 9%, hsl(210 60% 80% / 0.4) 0%, transparent 100%)',
              'radial-gradient(1px 1px at 58% 88%, hsl(210 60% 80% / 0.6) 0%, transparent 100%)',
              'radial-gradient(1px 1px at 71% 33%, hsl(210 60% 80% / 0.5) 0%, transparent 100%)',
              'radial-gradient(1px 1px at 84% 57%, hsl(210 60% 80% / 0.4) 0%, transparent 100%)',
              'radial-gradient(1px 1px at 6% 44%, hsl(210 60% 80% / 0.5) 0%, transparent 100%)',
              'radial-gradient(1px 1px at 92% 14%, hsl(210 60% 80% / 0.6) 0%, transparent 100%)',
              'radial-gradient(1.5px 1.5px at 48% 38%, hsl(210 60% 95% / 0.7) 0%, transparent 100%)',
              'radial-gradient(1.5px 1.5px at 76% 22%, hsl(210 60% 95% / 0.6) 0%, transparent 100%)',
            ].join(', ')
          }}
        />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 80% at 72% 50%, hsl(195 92% 56% / 0.07) 0%, transparent 65%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 60% at 15% 80%, hsl(158 80% 42% / 0.05) 0%, transparent 70%)' }} />
      </div>

      {/* Mobile: visual first (flex-col-reverse puts the visual above text), Desktop: text-left visual-right */}
      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-4 pb-10 sm:pt-32 sm:pb-20 lg:py-0 flex flex-col-reverse lg:flex-row items-center gap-4 sm:gap-12 lg:gap-0">
        <div className="relative flex-1 lg:pr-8 text-center lg:text-left z-10">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest mb-6 animate-fadeUp"
            style={{ background: 'hsl(195 92% 56% / 0.08)', border: '1px solid hsl(195 92% 56% / 0.25)', color: '#22d3ee' }}
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-[livePulse_2s_ease-in-out_infinite]" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
            </span>
            Open source · MIT · No account required
          </div>

          <h1
            className="font-extrabold tracking-tight text-white animate-fadeUp [animation-delay:60ms]"
            style={{ fontSize: 'clamp(2rem, 9vw, 6.5rem)', lineHeight: '0.93', letterSpacing: '-0.045em' }}
          >
            Ride{' '}
            <span style={{ background: 'linear-gradient(130deg, #22d3ee, hsl(158 80% 42%))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              anywhere
            </span>
            <br />
            on Earth.
          </h1>

          <p
            className="mt-5 sm:mt-7 max-w-xl text-base sm:text-lg lg:text-xl animate-fadeUp [animation-delay:120ms] mx-auto lg:mx-0"
            style={{ color: 'hsl(215 18% 60%)', lineHeight: '1.75' }}
          >
            Upload a GPX from Strava. GlobeRide renders your route on a{' '}
            <span className="text-white font-medium">photorealistic 3D globe</span> with real terrain,
            streams live gradient to your{' '}
            <span className="text-white font-medium">FTMS smart trainer</span> via Web Bluetooth,
            and exports a{' '}
            <span className="text-white font-medium">Strava-ready .FIT file</span> when you finish.{' '}
            50 iconic climbs. 45-part 3D avatar. Offline PWA.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 sm:gap-4 animate-fadeUp [animation-delay:180ms]">
            {/* Primary CTA — always visible, full-width on mobile */}
            <button
              onClick={() => navigate('/app?demo=1')}
              className="inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm sm:text-base active:scale-[0.97] transition-all duration-200 w-full sm:w-auto"
              style={{ height: '3rem', padding: '0 2rem', background: 'linear-gradient(135deg, #22d3ee, hsl(158 80% 42%))', color: 'hsl(220 42% 4%)', boxShadow: '0 8px 40px -10px hsl(195 92% 56% / 0.7)', border: 'none', cursor: 'pointer', minHeight: '44px' }}
            >
              <Play className="h-4 w-4" fill="currentColor" />
              Try demo route
            </button>

            {/* Secondary CTA — always visible, full-width on mobile */}
            <Button
              size="lg"
              onClick={() => navigate('/app')}
              className="rounded-full text-sm sm:text-base font-bold active:scale-[0.97] w-full sm:w-auto"
              style={{ height: '3rem', padding: '0 2rem', background: 'hsl(220 42% 9%)', color: 'white', border: '1px solid hsl(215 26% 20%)', boxShadow: 'none', minHeight: '44px' }}
            >
              Launch app
              <ArrowRight className="h-4 w-4" />
            </Button>

            {/* Tertiary CTAs — hidden on mobile */}
            <button
              onClick={() => setDemoOpen(true)}
              className="hidden sm:inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm sm:text-base active:scale-[0.97] transition-all duration-200"
              style={{ height: '3rem', padding: '0 1.75rem', background: 'transparent', color: '#22d3ee', border: '1px solid hsl(195 92% 56% / 0.35)', cursor: 'pointer', minHeight: '44px' }}
            >
              <MonitorPlay className="h-4 w-4" />
              Watch demo
            </button>

            <a
              href="https://github.com/masonwyatt23/globeride"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors duration-200 active:scale-[0.97]"
              style={{ height: '3rem', padding: '0 1.5rem', background: 'transparent', color: 'hsl(215 18% 55%)', border: '1px solid hsl(215 26% 18%)', minHeight: '44px' }}
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </div>

          {/* Trust signals: 3 shown on mobile, all 5 on sm+ */}
          <div
            className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-2 text-xs animate-fadeUp [animation-delay:240ms]"
            style={{ color: 'hsl(215 18% 42%)' }}
          >
            {[
              { label: 'Open source', mobileHide: false },
              { label: 'MIT licensed', mobileHide: false },
              { label: 'No account', mobileHide: false },
              { label: 'Works offline', mobileHide: true },
              { label: 'Chrome & Edge', mobileHide: true },
            ].map(({ label, mobileHide }, i) => (
              <span key={label} className={`flex items-center gap-2${mobileHide ? ' hidden sm:flex' : ''}`}>
                {i > 0 && <span className="h-1 w-1 rounded-full" style={{ background: 'hsl(215 26% 22%)' }} aria-hidden />}
                {label}
              </span>
            ))}
          </div>

          {/* Stat pills: horizontal-scroll snap on mobile (shows all 4), wraps on sm+ */}
          <div className="mt-5 animate-fadeUp [animation-delay:300ms]">
            {/* Mobile: 2 pills only, centered */}
            <div className="flex items-center justify-center lg:justify-start gap-2 sm:hidden">
              <StatBadge value="50" label="iconic climbs" delay={320} />
              <StatBadge value="45-part" label="3D avatar" delay={380} />
            </div>
            {/* sm+: all 4 pills wrapping */}
            <div className="hidden sm:flex flex-wrap items-center justify-center lg:justify-start gap-2">
              <StatBadge value="50" label="iconic climbs" delay={320} />
              <StatBadge value="45-part" label="3D avatar" delay={380} />
              <StatBadge value="FTMS" label="smart trainer" delay={440} />
              <StatBadge value=".FIT" label="Strava export" delay={500} />
            </div>
          </div>
        </div>

        <div
          className="relative flex-1 flex items-center justify-center w-full max-w-[280px] sm:max-w-md lg:max-w-xl xl:max-w-2xl animate-fadeUp [animation-delay:200ms]"
          style={{ minHeight: '240px' }}
        >
          {/* Parallax wrapper — mouse-tracking via useEffect above */}
          <div
            ref={visualRef}
            className="relative w-full"
            style={{ transition: 'transform 120ms cubic-bezier(0.2,0.8,0.2,1)', willChange: 'transform' }}
          >
            <HeroVisual />
            {/* Bottom fade: blends visual into the text section on mobile only */}
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 sm:hidden"
              style={{ background: 'linear-gradient(to bottom, transparent, hsl(220 42% 4%))' }}
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 animate-fadeUp [animation-delay:700ms]" aria-hidden>
        <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'hsl(215 18% 35%)' }}>Scroll</span>
        <div className="h-8 w-5 rounded-full flex items-start justify-center pt-1.5" style={{ border: '1px solid hsl(215 26% 18%)' }}>
          <div className="h-1.5 w-1.5 rounded-full bg-cyan-400/70" style={{ animation: 'scrollDot 2s ease-in-out infinite' }} />
        </div>
      </div>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </section>
  );
}
