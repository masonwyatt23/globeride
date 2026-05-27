/**
 * FeatureGrid — comprehensive feature showcase for GlobeRide.
 * Each card has a bespoke SVG illustration communicating the feature visually.
 * Layout: 3-col desktop / 2-col tablet / 1-col mobile.
 */
import type { ReactNode } from 'react';
import {
  GlobeIcon,
  FTMSIcon,
  AvatarIcon,
  CamerasIcon,
  FITExportIcon,
  WorkoutsIcon,
  PWAIcon,
  MultiRiderIcon,
  CommentaryIcon,
  PaceBotsIcon,
  SegmentsIcon,
  OutdoorGPSIcon,
  VoiceCuesIcon,
  ClimbDetectIcon,
  GesturesIcon,
  LowLightIcon,
  SkyIcon,
  WetRoadIcon,
  SpectatorIcon,
  KeyboardIcon,
  RouteLibraryIcon,
  PhysicsIcon,
} from './FeatureIcons';

interface Feature {
  id: string;
  illustration: ReactNode;
  title: string;
  description: string;
  badge?: string;
  accentColor?: string;
}

const FEATURES: Feature[] = [
  {
    id: 'globe',
    illustration: <GlobeIcon aria-hidden />,
    title: '3D photoreal world',
    description:
      'Cesium ion + Google Photorealistic 3D Tiles render the entire Earth — real terrain, real buildings, real streets. Your route lives exactly where it belongs.',
    badge: 'Flagship',
  },
  {
    id: 'ftms',
    illustration: <FTMSIcon aria-hidden />,
    title: 'Real gradient → real resistance',
    description:
      'FTMS Simulation Mode streams live road grade to your Kickr Core, Tacx Neo, Saris H3, or any FTMS trainer via Web Bluetooth. Every climb is felt in your legs.',
  },
  {
    id: 'avatar',
    illustration: <AvatarIcon aria-hidden />,
    title: 'Animated 45-part 3D avatar',
    description:
      'A fully articulated cyclist avatar follows your route — leaning into curves, spinning on flats, grinding through climbs. Procedurally animated, no motion-capture needed.',
  },
  {
    id: 'cameras',
    illustration: <CamerasIcon aria-hidden />,
    title: '5 cinematic camera modes',
    description:
      'Chase cam, first-person POV, helicopter orbit, drone follow, and broadcast-style spectator. Switch mid-ride with a single keypress.',
  },
  {
    id: 'fit-export',
    illustration: <FITExportIcon aria-hidden />,
    title: '.FIT export to Strava',
    description:
      'Every second — position, power, cadence, heart rate, altitude — recorded into a standards-compliant FIT v2 file. Upload directly to Strava or Garmin Connect.',
  },
  {
    id: 'workouts',
    illustration: <WorkoutsIcon aria-hidden />,
    title: 'Structured ERG workouts',
    description:
      'Curated 15–45 min plans: threshold builders, VO2 intervals, recovery spins. Your trainer holds exact wattage per segment. Build your own with the visual profile editor.',
  },
  {
    id: 'pwa',
    illustration: <PWAIcon aria-hidden />,
    title: 'Installable PWA — works offline',
    description:
      'Add to your home screen — iPad next to your trainer, or desktop. Fully cached after first visit. No app store, no subscription, no account. Ever.',
  },
  {
    id: 'multi-rider',
    illustration: <MultiRiderIcon aria-hidden />,
    title: 'WebRTC multi-rider ghosts',
    description:
      'Ride alongside friends or recorded ghosts via peer-to-peer WebRTC. No server, no account — share a link and race. Drafting physics simulate real peloton aerodynamics.',
  },
  {
    id: 'commentary',
    illustration: <CommentaryIcon aria-hidden />,
    title: 'AI live race commentary',
    description:
      "AI commentator reacts to your efforts in real time — calls out your attacks, suffers with you on the climbs, and loses its mind when you hit a PR.",
  },
  {
    id: 'pace-bots',
    illustration: <PaceBotsIcon aria-hidden />,
    title: 'AI pace bots + drafting',
    description:
      'Target a W/kg and a bot peloton paces you precisely — pulling turns, surging on climbs. Draft in their slipstream for a real 20–30% power saving.',
  },
  {
    id: 'segments',
    illustration: <SegmentsIcon aria-hidden />,
    title: 'Strava live segments overlay',
    description:
      "Strava segments fire as you enter them — live countdown, real-time gap to your PR and the segment KOM. The suffering has context.",
  },
  {
    id: 'outdoor-gps',
    illustration: <OutdoorGPSIcon aria-hidden />,
    title: 'Outdoor GPS recording',
    description:
      'Ride outside with full GPS tracking. GlobeRide records your actual path and syncs it back — same FIT export, same analytics, same Strava upload flow.',
  },
  {
    id: 'voice-cues',
    illustration: <VoiceCuesIcon aria-hidden />,
    title: 'Voice cues + coaching',
    description:
      'Spoken interval prompts, grade warnings, power-target nudges, and motivational calls. Eyes on the road, ears on the coach.',
  },
  {
    id: 'climb-detect',
    illustration: <ClimbDetectIcon aria-hidden />,
    title: 'Auto climb segmentation',
    description:
      'Every ascent detected automatically — name, length, avg grade, total elevation. Climb cards appear mid-ride and track your time against historical bests.',
  },
  {
    id: 'gestures',
    illustration: <GesturesIcon aria-hidden />,
    title: 'Handlebar gesture controls',
    description:
      'Mounted phone detects tilt and shake — switch cameras, toggle HUD, skip intervals without touching the screen. Works with any phone mount.',
  },
  {
    id: 'low-light',
    illustration: <LowLightIcon aria-hidden />,
    title: 'Low-light night HUD',
    description:
      "After dark, the HUD shifts to amber-on-black — maximum contrast, minimum eye strain. The 3D world dims to a moonlit silhouette. Atmospheric.",
  },
  {
    id: 'sky',
    illustration: <SkyIcon aria-hidden />,
    title: 'Dynamic sun + clouds',
    description:
      "Real-time sun position, procedural cloud layer, and dynamic shadow casting on terrain and buildings — the world looks alive as hours pass during your ride.",
  },
  {
    id: 'wet-road',
    illustration: <WetRoadIcon aria-hidden />,
    title: 'Wet road PBR reflections',
    description:
      'Rain mode activates a PBR wet-asphalt material — puddle reflections, rain streaks, the glow of headlights on wet tarmac. Purely cinematic.',
  },
  {
    id: 'spectators',
    illustration: <SpectatorIcon aria-hidden />,
    title: 'Spectator crowds on climbs',
    description:
      "Iconic climbs spawn procedural spectator crowds — hundreds of fans lining the road, flags waving. Alpe d'Huez feels like Alpe d'Huez.",
  },
  {
    id: 'keyboard',
    illustration: <KeyboardIcon aria-hidden />,
    title: 'Full keyboard shortcuts',
    description:
      'Every action mapped: camera switch, HUD toggle, sprint burst, pause, map zoom. Power users keep their hands on the bars and eyes forward.',
  },
  {
    id: 'route-library',
    illustration: <RouteLibraryIcon aria-hidden />,
    title: '19 iconic route presets',
    description:
      "Alpe d'Huez, Mont Ventoux, Stelvio, Mortirolo, and 15 more — ready to ride without a GPX. Or drag-drop your own route from Strava, Komoot, or Garmin.",
  },
  {
    id: 'physics',
    illustration: <PhysicsIcon aria-hidden />,
    title: 'Real cycling power physics',
    description:
      'Martin et al. 1998 steady-state power model: rolling resistance, aerodynamic drag, gravity, drivetrain loss. Newton-Raphson solved every frame.',
  },
];

// ── Card ────────────────────────────────────────────────────────────────────

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const accent = feature.accentColor ?? '#22d3ee';
  return (
    <article
      className="group relative overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1.5 animate-fadeUp"
      style={{
        background: 'hsl(220 42% 6%)',
        border: '1px solid hsl(215 26% 14%)',
        animationDelay: `${Math.min(index * 40, 400)}ms`,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = `${accent}44`;
        el.style.boxShadow = `0 20px 48px -16px ${accent}20`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'hsl(215 26% 14%)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Corner glow */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${accent}12, transparent 70%)` }}
        aria-hidden
      />

      {/* Badge */}
      {feature.badge && (
        <div
          className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full z-10"
          style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
        >
          {feature.badge}
        </div>
      )}

      {/* SVG illustration */}
      <div
        className="mx-3 mt-3 rounded-xl overflow-hidden transition-transform duration-300 group-hover:scale-[1.02]"
        style={{ background: 'hsl(215 50% 5%)' }}
      >
        {feature.illustration}
      </div>

      {/* Text */}
      <div className="p-4 pt-3">
        <h3 className="text-sm font-bold text-white tracking-tight mb-1.5 group-hover:text-cyan-300 transition-colors duration-300">
          {feature.title}
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: 'hsl(215 18% 50%)' }}>
          {feature.description}
        </p>
      </div>

      {/* Bottom accent line on hover */}
      <div
        className="h-px w-0 group-hover:w-full transition-all duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}80, transparent)` }}
        aria-hidden
      />
    </article>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

export function FeatureGrid() {
  return (
    <section
      className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28"
      aria-labelledby="features-heading"
    >
      {/* Subtle ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 50%, hsl(195 92% 56% / 0.03), transparent)',
        }}
      />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest mb-5"
            style={{
              background: 'hsl(195 92% 56% / 0.06)',
              border: '1px solid hsl(195 92% 56% / 0.18)',
              color: '#22d3ee',
            }}
          >
            Everything you need
          </div>
          <h2
            id="features-heading"
            className="font-extrabold text-white"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', lineHeight: '1.05', letterSpacing: '-0.03em' }}
          >
            Built for serious cyclists.
          </h2>
          <p
            className="mt-4 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed"
            style={{ color: 'hsl(215 18% 52%)' }}
          >
            22 features across photoreal graphics, AI coaching, smart trainer integration, social
            riding, and precision analytics — all local-first, zero subscriptions.
          </p>
        </div>

        {/* Grid */}
        <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.id} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
