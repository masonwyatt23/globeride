import { ArrowRight, Globe2, Github } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative flex flex-col items-center justify-center text-center px-4 pt-28 pb-24 sm:pt-36 sm:pb-32 overflow-hidden">
      {/* Background orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[48rem] w-[48rem] rounded-full bg-primary/8 dark:bg-primary/12 blur-[120px]" />
        <div className="absolute top-1/2 -left-64 h-[36rem] w-[36rem] rounded-full bg-accent/6 dark:bg-accent/10 blur-[100px]" />
        <div className="absolute top-1/2 -right-64 h-[36rem] w-[36rem] rounded-full bg-sky-500/6 dark:bg-sky-500/8 blur-[100px]" />
      </div>

      {/* Eyebrow badge */}
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/6 dark:bg-primary/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary mb-7 animate-fadeUp">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-[livePulse_2s_ease-in-out_infinite]" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        Open source · MIT licensed · no account required
      </div>

      {/* Headline */}
      <h1 className="max-w-4xl text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-extrabold tracking-[-0.04em] leading-[0.96] text-foreground animate-fadeUp [animation-delay:60ms]">
        Ride{' '}
        <span className="text-gradient">anywhere</span>
        <br />
        on Earth.
      </h1>

      {/* Subhead */}
      <p className="mt-7 max-w-2xl text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed animate-fadeUp [animation-delay:120ms]">
        Upload a GPX from Strava or Garmin. GlobeRide renders your route on a{' '}
        <span className="text-foreground font-medium">photorealistic 3D globe</span>, drives{' '}
        real gradient into your{' '}
        <span className="text-foreground font-medium">Wahoo, Tacx, or Saris trainer</span>{' '}
        over Web Bluetooth, and exports a Strava-ready{' '}
        <span className="text-foreground font-medium">.FIT file</span> when you finish.
      </p>

      {/* CTAs */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fadeUp [animation-delay:180ms]">
        <Button
          size="lg"
          variant="accent"
          onClick={() => navigate('/app')}
          className="rounded-full h-14 px-8 text-base shadow-[0_8px_32px_-10px_hsl(var(--accent)/0.65)] hover:shadow-[0_12px_40px_-10px_hsl(var(--accent)/0.75)] transition-all duration-300"
        >
          Start riding
          <ArrowRight className="h-5 w-5" />
        </Button>
        <a
          href="https://github.com/masonwyatt23/globeride"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 h-14 px-8 rounded-full border border-border bg-card/60 text-foreground text-base font-semibold hover:bg-card hover:border-primary/40 hover:text-primary transition-all duration-200"
        >
          <Github className="h-5 w-5" />
          View on GitHub
        </a>
      </div>

      {/* Globe icon flourish */}
      <div
        aria-hidden
        className="mt-16 relative inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 via-primary/8 to-accent/16 ring-1 ring-inset ring-border/50 shadow-[0_24px_64px_-20px_hsl(var(--primary)/0.35)] animate-fadeUp [animation-delay:240ms]"
      >
        <Globe2 className="h-12 w-12 text-primary drop-shadow-[0_0_16px_hsl(var(--primary)/0.5)]" />
        {/* Orbit ring */}
        <div className="absolute inset-0 rounded-3xl ring-[6px] ring-primary/6 scale-[1.4]" />
        <div className="absolute inset-0 rounded-3xl ring-[2px] ring-primary/10 scale-[1.7]" />
      </div>
    </section>
  );
}
