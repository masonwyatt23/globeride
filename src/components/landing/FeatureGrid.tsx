/**
 * FeatureGrid — comprehensive feature showcase for GlobeRide.
 * Each card has a bespoke SVG illustration communicating the feature visually.
 * Glass cards with scroll-reveal stagger, tier-based prominence, mobile-first grid.
 */
import type { ReactNode } from 'react';
import { FeatureGlobePreview } from './FeatureGlobePreview';
import { FeatureAvatarPreview } from './FeatureAvatarPreview';
import { useScrollReveal } from '@/lib/landing/useScrollReveal';
import {
  FTMSIcon,
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

type Tier = 'flagship' | 'standard';

interface Feature {
  id: string;
  illustration: ReactNode;
  title: string;
  description: string;
  badge?: string;
  accentColor?: string;
  tier?: Tier;
}

const FEATURES: Feature[] = [
  {
    id: 'globe',
    illustration: <FeatureGlobePreview />,
    title: '3D photoreal world',
    description:
      'Cesium ion + Google Photorealistic 3D Tiles render the entire Earth — real terrain, real buildings, real streets. Your route lives exactly where it belongs.',
    badge: 'Flagship',
    tier: 'flagship',
  },
  {
    id: 'ftms',
    illustration: <FTMSIcon aria-hidden />,
    title: 'Real gradient → real resistance',
    description:
      'FTMS Simulation Mode streams live road grade to your Kickr Core, Tacx Neo, Saris H3, or any FTMS trainer via Web Bluetooth. Every climb is felt in your legs.',
    badge: 'Flagship',
    tier: 'flagship',
  },
  {
    id: 'avatar',
    illustration: <FeatureAvatarPreview />,
    title: 'Animated 45-part 3D avatar',
    description:
      'A fully articulated cyclist avatar follows your route — leaning into curves, spinning on flats, grinding through climbs. Procedurally animated, no motion-capture needed.',
    badge: 'Flagship',
    tier: 'flagship',
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
    title: '50 iconic route presets',
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

function FeatureCard({ feature }: { feature: Feature }) {
  const accent = feature.accentColor ?? '#22d3ee';
  const isFlagship = feature.tier === 'flagship';

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-2xl h-full',
        'landing-card-glass landing-card-hover',
        'active:scale-[0.98] transition-transform',
        isFlagship ? 'landing-flagship-card' : '',
      ].filter(Boolean).join(' ')}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = `${accent}44`;
        el.style.boxShadow = `0 0 0 1px ${accent}14, 0 ${isFlagship ? 28 : 20}px ${isFlagship ? 64 : 48}px -${isFlagship ? 20 : 16}px ${accent}26`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = '';
        el.style.boxShadow = '';
      }}
    >
      {/* Corner ambient glow */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${accent}14, transparent 70%)` }}
        aria-hidden
      />

      {/* Badge */}
      {feature.badge && (
        <div
          className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full z-10"
          style={{
            background: isFlagship ? `${accent}22` : `${accent}16`,
            color: accent,
            border: `1px solid ${accent}${isFlagship ? '40' : '28'}`,
          }}
        >
          {feature.badge}
        </div>
      )}

      {/* Illustration */}
      <div
        className="mx-3 mt-3 rounded-xl overflow-hidden transition-transform duration-300 group-hover:scale-[1.02]"
        style={{ background: 'hsl(215 50% 5%)' }}
      >
        {feature.illustration}
      </div>

      {/* Text */}
      <div className={`p-4 sm:p-5 lg:p-6 pt-3 ${isFlagship ? 'pb-5' : ''}`}>
        <h3
          className={`font-bold text-white tracking-tight mb-1.5 group-hover:text-cyan-300 transition-colors duration-300 ${isFlagship ? 'text-xl sm:text-xl lg:text-2xl' : 'text-base sm:text-lg'}`}
        >
          {feature.title}
        </h3>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'hsl(215 18% 50%)' }}
        >
          {feature.description}
        </p>
      </div>

      {/* Bottom accent sweep */}
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
  // One shared IntersectionObserver for the grid — stagger delay set per child via --reveal-delay.
  const gridRef = useScrollReveal<HTMLDivElement>({
    childSelector: '.reveal-child',
    delayStep: 50,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.08,
  });
  const headerRef = useScrollReveal<HTMLDivElement>({ threshold: 0.2 });

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
        <div ref={headerRef} className="text-center mb-14 landing-section-reveal">
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
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-[1.05] tracking-tight"
          >
            Built for serious cyclists.
          </h2>
          <p
            className="mt-4 max-w-2xl mx-auto text-sm sm:text-base lg:text-lg leading-relaxed line-clamp-2 sm:line-clamp-none"
            style={{ color: 'hsl(215 18% 52%)' }}
          >
            22 features across photoreal graphics, AI coaching, smart trainer integration, social
            riding, and precision analytics — all local-first, zero subscriptions.
          </p>
        </div>

        {/* Grid — 1 col mobile / 2 col tablet / 3 col desktop.
            Flagship cards span lg:col-span-2 to anchor each desktop row. */}
        <div
          ref={gridRef}
          className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 grid-flow-row-dense"
        >
          {FEATURES.map((f) => (
            <div
              key={f.id}
              className={[
                'reveal-child landing-fade-in-up',
                f.tier === 'flagship' ? 'lg:col-span-2' : '',
              ].filter(Boolean).join(' ')}
            >
              <FeatureCard feature={f} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
