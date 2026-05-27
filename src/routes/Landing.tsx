import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { DemoRideSection } from '@/components/landing/DemoRideSection';
import { QuickstartSection } from '@/components/landing/QuickstartSection';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { RidersSection } from '@/components/landing/RidersSection';
import { GallerySection } from '@/components/landing/GallerySection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { ComparisonSection } from '@/components/landing/ComparisonSection';
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
 *
 * Section order (newer additions marked with *):
 *   HeroSection → DemoRideSection → *QuickstartSection → FeatureGrid
 *   → *RidersSection → GallerySection → HowItWorks → *ComparisonSection
 *   → LandingCTA
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

        {/* makes "this looks easy to try" visceral before the feature grid */}
        <QuickstartSection />

        <Divider />

        <FeatureGrid />

        <Divider />

        {/* scenario cards showing what the experience offers */}
        <RidersSection />

        <Divider />

        <GallerySection />

        <Divider />

        <HowItWorks />

        <Divider />

        {/* philosophy comparison near the bottom, just before CTA */}
        <ComparisonSection />

        <Divider />

        <LandingCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
