import {
  Globe2,
  Bluetooth,
  PersonStanding,
  FileDown,
  Dumbbell,
  Smartphone,
} from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
}

const FEATURES: Feature[] = [
  {
    icon: <Globe2 className="h-6 w-6" />,
    title: '3D photoreal world',
    description:
      'Cesium ion + Google Photorealistic 3D Tiles render the entire Earth in stunning detail — real terrain, real buildings, real streets. Your route is drawn exactly where it lives in the world.',
    accent: true,
  },
  {
    icon: <Bluetooth className="h-6 w-6" />,
    title: 'Real gradient → real resistance',
    description:
      'FTMS Simulation Mode streams the current road grade to your Kickr Core, Tacx Neo, Saris H3, or any FTMS-compatible trainer via Web Bluetooth. Every climb is felt in your legs.',
  },
  {
    icon: <PersonStanding className="h-6 w-6" />,
    title: 'Animated 3D rider avatar',
    description:
      'A fully articulated cyclist avatar follows your route in real time — leaning into curves, spinning on flats, grinding through climbs. The chase camera never misses the action.',
  },
  {
    icon: <FileDown className="h-6 w-6" />,
    title: '.FIT export to Strava',
    description:
      'Every second of your ride — position, power, cadence, heart rate, altitude — is recorded into a standards-compliant FIT v2 file you can upload directly to Strava or Garmin Connect.',
  },
  {
    icon: <Dumbbell className="h-6 w-6" />,
    title: 'Structured workouts',
    description:
      'Choose from a curated library of 15–45 min ERG workouts, or build your own power-profile with the visual builder. The engine holds your trainer at exact wattage for each segment.',
  },
  {
    icon: <Smartphone className="h-6 w-6" />,
    title: 'Installable PWA',
    description:
      'Add GlobeRide to your home screen — on iPad next to your trainer, or on desktop. Works fully offline once cached. No app store, no subscription, no sign-in.',
  },
];

export function FeatureGrid() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-5">
            Everything you need
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-foreground">
            Built for serious cyclists.
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-muted-foreground text-base sm:text-lg leading-relaxed">
            Every piece of GlobeRide works together — no stitching third-party apps, no walled
            gardens.
          </p>
        </div>

        {/* Grid */}
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_-16px_hsl(var(--primary)/0.22)] ${
        feature.accent
          ? 'border-primary/30 bg-gradient-to-br from-primary/10 via-primary/4 to-transparent'
          : 'border-border/60 bg-card/50 hover:border-primary/25'
      }`}
    >
      {/* Hover glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(380px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), hsl(var(--primary)/0.07), transparent 70%)',
        }}
      />

      {/* Icon */}
      <div
        className={`inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4 transition-transform duration-300 group-hover:scale-110 ${
          feature.accent
            ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
            : 'bg-muted/60 text-muted-foreground group-hover:text-primary group-hover:bg-primary/10'
        }`}
      >
        {feature.icon}
      </div>

      {/* Content */}
      <h3 className="text-base font-bold text-foreground tracking-tight mb-2">{feature.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
    </div>
  );
}
