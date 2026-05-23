import { ArrowRight, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function LandingCTA() {
  const navigate = useNavigate();

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, hsl(195 92% 56% / 0.15), transparent)' }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 h-[40rem] w-[56rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse, hsl(195 92% 56% / 0.05) 0%, transparent 70%)' }}
        />
      </div>

      <div className="max-w-3xl mx-auto text-center">
        {/* Eyebrow */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest mb-6"
          style={{ background: 'hsl(195 92% 56% / 0.06)', border: '1px solid hsl(195 92% 56% / 0.18)', color: 'hsl(195 92% 56%)' }}
        >
          Ready to ride?
        </div>

        <h2
          className="font-extrabold text-white mb-6"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)', lineHeight: '1.0', letterSpacing: '-0.035em' }}
        >
          Your next ride is{' '}
          <span style={{ background: 'linear-gradient(130deg, #22d3ee, hsl(158 80% 42%))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            one upload away.
          </span>
        </h2>

        <p className="text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto" style={{ color: 'hsl(215 18% 52%)' }}>
          No account. No installation. No subscription. Open the browser, drop a GPX, and ride.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 max-w-sm sm:max-w-none mx-auto">
          <button
            onClick={() => navigate('/app?demo=1')}
            className="inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm sm:text-base active:scale-[0.97] transition-all duration-200"
            style={{ height: '3.5rem', padding: '0 2rem', background: 'linear-gradient(135deg, #22d3ee, hsl(158 80% 42%))', color: 'hsl(220 42% 4%)', boxShadow: '0 8px 40px -10px hsl(195 92% 56% / 0.65)', border: 'none', cursor: 'pointer' }}
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Try demo route
          </button>

          <button
            onClick={() => navigate('/app')}
            className="inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm sm:text-base active:scale-[0.97] transition-all duration-200"
            style={{ height: '3.5rem', padding: '0 2rem', background: 'hsl(220 42% 8%)', color: 'white', border: '1px solid hsl(215 26% 20%)', cursor: 'pointer', boxShadow: 'none' }}
          >
            Launch app
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Trust signals */}
        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-x-5 sm:gap-x-8 gap-y-2 text-xs"
          style={{ color: 'hsl(215 18% 38%)' }}
        >
          {['MIT licensed', 'No account required', 'Works offline as a PWA', 'Chrome & Edge desktop + Android'].map((t, i) => (
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
