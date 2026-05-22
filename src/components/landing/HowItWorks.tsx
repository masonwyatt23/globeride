import { Upload, Bluetooth, Trophy } from 'lucide-react';

const STEPS = [
  {
    n: '01',
    icon: <Upload className="h-6 w-6" />,
    title: 'Pick your route',
    description:
      'Upload any GPX from Strava, Komoot, or Garmin. Or search a place and GlobeRide generates a road route on the spot using real OSM cycling paths. Or draw your own directly on the 3D globe.',
  },
  {
    n: '02',
    icon: <Bluetooth className="h-6 w-6" />,
    title: 'Pair your trainer',
    description:
      'Tap "Connect trainer" and GlobeRide pairs with your smart trainer via Web Bluetooth in seconds — Wahoo Kickr, Tacx Neo, Saris H3, and any FTMS-compatible device. No app, no dongle.',
  },
  {
    n: '03',
    icon: <Trophy className="h-6 w-6" />,
    title: 'Ride and record',
    description:
      'Roll out and ride in real time. The globe follows your position, the trainer feels every climb, and every pedal stroke is logged. When you finish, export a Strava-ready .FIT in one tap.',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Background accent */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[60rem] w-[60rem] rounded-full bg-accent/4 dark:bg-accent/6 blur-[140px]" />
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-5">
            How it works
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-foreground">
            Zero friction from<br />
            <span className="text-gradient">route to Strava.</span>
          </h2>
          <p className="mt-4 max-w-lg mx-auto text-muted-foreground text-base sm:text-lg leading-relaxed">
            Three steps. No account, no backend, no subscriptions.
          </p>
        </div>

        {/* Steps — vertical on mobile, 3-col on md+ */}
        <div className="relative grid gap-8 sm:gap-10 md:gap-6 md:grid-cols-3">
          {/* Connector line (desktop only) */}
          <div
            aria-hidden
            className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-primary/30 via-accent/30 to-primary/30"
          />
          {/* Connector line (mobile — vertical) */}
          <div
            aria-hidden
            className="md:hidden absolute left-9 top-20 bottom-20 w-px bg-gradient-to-b from-primary/30 via-accent/30 to-primary/30"
          />

          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className="relative flex flex-col md:items-center md:text-center items-start text-left group animate-fadeUp"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {/* Step number bubble */}
              <div className="relative mb-4 sm:mb-6 inline-flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-card to-muted/50 border border-border/70 shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.25)] group-hover:shadow-[0_16px_40px_-12px_hsl(var(--primary)/0.4)] group-hover:border-primary/30 transition-all duration-300 group-hover:-translate-y-1 shrink-0">
                <span className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-[10px] font-black text-white shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.6)]">
                  {i + 1}
                </span>
                <div className="text-primary group-hover:scale-110 transition-transform duration-300">
                  {step.icon}
                </div>
              </div>

              <div className="md:flex md:flex-col md:items-center">
                <h3 className="text-base sm:text-lg font-bold text-foreground tracking-tight mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
