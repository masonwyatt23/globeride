import { Upload, Bluetooth, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useScrollReveal } from '@/lib/landing/useScrollReveal';

interface Step {
  n: string;
  icon: ReactNode;
  title: string;
  description: string;
  accent: string;
}

const STEPS: Step[] = [
  {
    n: '01',
    icon: <Upload className="h-6 w-6" />,
    title: 'Pick your route',
    description: 'Upload any GPX from Strava, Komoot, or Garmin — or search a place and GlobeRide generates a real OSM cycling route on the spot. 50 iconic climbs included.',
    accent: '#22d3ee',
  },
  {
    n: '02',
    icon: <Bluetooth className="h-6 w-6" />,
    title: 'Pair your trainer',
    description: 'Tap "Connect" and GlobeRide pairs with your FTMS smart trainer via Web Bluetooth in seconds. Wahoo Kickr, Tacx Neo, Saris H3 — no app, no dongle.',
    accent: 'hsl(158 80% 42%)',
  },
  {
    n: '03',
    icon: <Trophy className="h-6 w-6" />,
    title: 'Ride and export',
    description: 'Roll out and ride in real time. The globe follows your position, the trainer feels every climb, every pedal stroke is logged. One tap to export Strava-ready .FIT.',
    accent: 'hsl(38 90% 56%)',
  },
];

export function HowItWorks() {
  const headerRef = useScrollReveal<HTMLDivElement>({ threshold: 0.2 });
  const stepsRef = useScrollReveal<HTMLDivElement>({
    childSelector: '.step-reveal-child',
    delayStep: 100,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.12,
  });

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[60rem] w-[60rem] rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(195 92% 56% / 0.04) 0%, transparent 70%)' }}
        />
      </div>

      <div className="max-w-6xl mx-auto">
        <div
          ref={headerRef}
          className="text-center mb-16 landing-section-reveal"
        >
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest mb-5"
            style={{ background: 'hsl(195 92% 56% / 0.06)', border: '1px solid hsl(195 92% 56% / 0.18)', color: 'hsl(195 92% 56%)' }}
          >
            How it works
          </div>
          <h2
            className="font-extrabold text-white"
            style={{ fontSize: 'clamp(2rem, 4.5vw, 3.25rem)', lineHeight: '1.05', letterSpacing: '-0.03em' }}
          >
            Zero friction from{' '}
            <span style={{ background: 'linear-gradient(130deg, #22d3ee, hsl(158 80% 42%))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              route to Strava.
            </span>
          </h2>
          <p className="mt-4 max-w-lg mx-auto text-base sm:text-lg leading-relaxed" style={{ color: 'hsl(215 18% 52%)' }}>
            Three steps. No account, no backend, no subscription.
          </p>
        </div>

        <div
          ref={stepsRef}
          className="relative grid gap-8 sm:gap-10 md:gap-6 md:grid-cols-3"
        >
          {/* Connector line — desktop */}
          <div
            aria-hidden
            className="hidden md:block absolute top-10 h-px"
            style={{
              left: 'calc(16.67% + 2rem)',
              right: 'calc(16.67% + 2rem)',
              background: 'linear-gradient(90deg, hsl(195 92% 56% / 0.3), hsl(158 80% 42% / 0.3), hsl(38 90% 56% / 0.3))',
            }}
          />

          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className="step-reveal-child landing-fade-in-up relative flex flex-col md:items-center md:text-center items-start text-left group"
            >
              {/* Step bubble — glass treatment */}
              <div
                className="relative mb-5 inline-flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-300 group-hover:-translate-y-1 shrink-0 landing-card-glass"
                style={{
                  border: `1px solid ${step.accent}30`,
                  boxShadow: `0 8px 32px -12px ${step.accent}25`,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.boxShadow = `0 16px 40px -12px ${step.accent}45`;
                  el.style.borderColor = `${step.accent}50`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.boxShadow = `0 8px 32px -12px ${step.accent}25`;
                  el.style.borderColor = `${step.accent}30`;
                }}
              >
                <span
                  className="absolute -top-3 -right-3 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg"
                  style={{ background: step.accent, color: 'hsl(220 42% 4%)' }}
                >
                  {i + 1}
                </span>
                <div className="transition-colors duration-300" style={{ color: 'hsl(215 18% 45%)' }}>
                  <div className="group-hover:scale-110 transition-transform duration-300" style={{ color: step.accent }}>
                    {step.icon}
                  </div>
                </div>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mb-2">{step.title}</h3>
              <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'hsl(215 18% 50%)' }}>{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
