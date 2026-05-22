import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function LandingCTA() {
  const navigate = useNavigate();

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[40rem] w-[56rem] rounded-full bg-primary/5 dark:bg-primary/8 blur-[120px]" />
      </div>

      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-foreground mb-6">
          Your next ride is{' '}
          <span className="text-gradient">one upload away.</span>
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-10 max-w-xl mx-auto">
          No account. No installation. No subscription. Just open the browser, drop a GPX, and
          ride.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            size="lg"
            variant="accent"
            onClick={() => navigate('/app')}
            className="rounded-full h-14 px-8 text-base shadow-[0_8px_32px_-10px_hsl(var(--accent)/0.65)] hover:shadow-[0_12px_40px_-10px_hsl(var(--accent)/0.75)] transition-all duration-300"
          >
            Start riding free
            <ArrowRight className="h-5 w-5" />
          </Button>
          <a
            href="https://github.com/masonwyatt23/globeride"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 h-14 px-8 rounded-full border border-border bg-card/60 text-foreground text-base font-semibold hover:bg-card hover:border-primary/40 hover:text-primary transition-all duration-200"
          >
            Star on GitHub
          </a>
        </div>

        {/* Trust signals */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground/70">
          <span>MIT licensed</span>
          <span className="h-1 w-1 rounded-full bg-border/60" aria-hidden />
          <span>No account required</span>
          <span className="h-1 w-1 rounded-full bg-border/60" aria-hidden />
          <span>Works offline as a PWA</span>
          <span className="h-1 w-1 rounded-full bg-border/60" aria-hidden />
          <span>Chrome &amp; Edge desktop + Android</span>
        </div>
      </div>
    </section>
  );
}
