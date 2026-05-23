import { Globe2, Bluetooth, PersonStanding, FileDown, Dumbbell, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}

const FEATURES: Feature[] = [
  {
    icon: <Globe2 className="h-6 w-6" />,
    title: '3D photoreal world',
    description: 'Cesium ion + Google Photorealistic 3D Tiles render the entire Earth in stunning detail — real terrain, real buildings, real streets. Your route is exactly where it lives.',
    badge: 'Flagship',
  },
  {
    icon: <Bluetooth className="h-6 w-6" />,
    title: 'Real gradient → real resistance',
    description: 'FTMS Simulation Mode streams current road grade to your Kickr Core, Tacx Neo, Saris H3, or any FTMS-compatible trainer via Web Bluetooth. Every climb is felt in your legs.',
  },
  {
    icon: <PersonStanding className="h-6 w-6" />,
    title: 'Animated 3D rider avatar',
    description: 'A fully articulated 45-part cyclist avatar follows your route in real time — leaning into curves, spinning on flats, grinding through climbs. The chase camera never misses the action.',
  },
  {
    icon: <FileDown className="h-6 w-6" />,
    title: '.FIT export to Strava',
    description: 'Every second — position, power, cadence, heart rate, altitude — recorded into a standards-compliant FIT v2 file you can upload directly to Strava or Garmin Connect.',
  },
  {
    icon: <Dumbbell className="h-6 w-6" />,
    title: 'Structured workouts',
    description: 'Choose from a curated library of 15–45 min ERG workouts. The engine holds your trainer at exact wattage for each segment. Build your own with the visual profile builder.',
  },
  {
    icon: <Smartphone className="h-6 w-6" />,
    title: 'Installable PWA',
    description: 'Add to your home screen — on iPad next to your trainer, or on desktop. Works fully offline once cached. No app store, no subscription, no sign-in, ever.',
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:-translate-y-1.5 animate-fadeUp"
      style={{
        background: 'hsl(220 42% 6%)',
        border: '1px solid hsl(215 26% 14%)',
        animationDelay: `${index * 60}ms`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'hsl(195 92% 56% / 0.3)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 48px -16px hsl(195 92% 56% / 0.15)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'hsl(215 26% 14%)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Corner glow on hover */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: 'radial-gradient(circle, hsl(195 92% 56% / 0.08), transparent 70%)' }}
        aria-hidden
      />

      {/* Badge */}
      {feature.badge && (
        <div
          className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: 'hsl(195 92% 56% / 0.12)', color: '#22d3ee', border: '1px solid hsl(195 92% 56% / 0.25)' }}
        >
          {feature.badge}
        </div>
      )}

      {/* Icon */}
      <div
        className="inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4 transition-transform duration-300 group-hover:scale-110"
        style={{
          background: 'hsl(215 40% 10%)',
          color: 'hsl(215 18% 45%)',
          border: '1px solid hsl(215 26% 16%)',
        }}
        onMouseEnter={e => {
          const parent = (e.currentTarget as HTMLDivElement).closest('.group') as HTMLDivElement;
          if (parent?.matches(':hover')) {
            (e.currentTarget as HTMLDivElement).style.color = '#22d3ee';
          }
        }}
      >
        <div className="transition-colors duration-300 group-hover:text-cyan-400">
          {feature.icon}
        </div>
      </div>

      <h3 className="text-base font-bold text-white tracking-tight mb-2">{feature.title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: 'hsl(215 18% 50%)' }}>{feature.description}</p>
    </div>
  );
}

export function FeatureGrid() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest mb-5"
            style={{ background: 'hsl(195 92% 56% / 0.06)', border: '1px solid hsl(195 92% 56% / 0.18)', color: 'hsl(195 92% 56%)' }}
          >
            Everything you need
          </div>
          <h2
            className="font-extrabold text-white"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', lineHeight: '1.05', letterSpacing: '-0.03em' }}
          >
            Built for serious cyclists.
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-base sm:text-lg leading-relaxed" style={{ color: 'hsl(215 18% 52%)' }}>
            Every piece of GlobeRide works together — no stitching third-party apps, no walled gardens.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
