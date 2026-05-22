import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { LandingCTA } from '@/components/landing/LandingCTA';
import { LandingFooter } from '@/components/landing/LandingFooter';

/**
 * Public marketing landing page — the new entry point at /.
 * The ride-setup app lives at /app.
 */
export function Landing() {
  return (
    <div className="relative min-h-full w-full flex flex-col overflow-x-hidden bg-background">
      {/* Ambient gradient backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 h-[72rem] w-[72rem] rounded-full bg-primary/4 dark:bg-primary/6 blur-[160px]" />
        <div className="absolute top-[60vh] -left-96 h-[50rem] w-[50rem] rounded-full bg-accent/3 dark:bg-accent/5 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[40rem] w-[40rem] rounded-full bg-sky-500/3 dark:bg-sky-500/5 blur-[120px]" />
      </div>

      <LandingHeader />

      {/* pt-16 to clear the fixed header */}
      <main className="flex-1 pt-16">
        <HeroSection />

        {/* Divider */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </div>

        <FeatureGrid />

        {/* Divider */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </div>

        <HowItWorks />

        {/* Divider */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </div>

        <LandingCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
