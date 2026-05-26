import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { DemoRideSection } from '@/components/landing/DemoRideSection';
import { GallerySection } from '@/components/landing/GallerySection';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { LandingCTA } from '@/components/landing/LandingCTA';
import { LandingFooter } from '@/components/landing/LandingFooter';

function Divider() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
      <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, hsl(215 26% 14%), transparent)' }} />
    </div>
  );
}

/**
 * Public marketing landing page — entry point at /.
 * The ride-setup app lives at /app.
 * Dark "deep space" theme with cyan (#22d3ee) accent throughout.
 */
export function Landing() {
  return (
    <div
      className="relative min-h-full w-full flex flex-col overflow-x-hidden"
      style={{ background: 'hsl(220 42% 4%)', color: 'white' }}
    >
      <LandingHeader />

      {/* pt-16 to clear the fixed header */}
      <main className="flex-1 pt-16">
        <HeroSection />

        <Divider />

        <DemoRideSection />

        <Divider />

        <GallerySection />

        <Divider />

        <FeatureGrid />

        <Divider />

        <HowItWorks />

        <Divider />

        <LandingCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
