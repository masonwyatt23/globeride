/**
 * GallerySection — "Where will you ride?" evocative scene cards.
 * Each card has an artful SVG illustration of a real cycling destination,
 * a name, mood description, and a link into the app.
 *
 * Layout: horizontal scroll on mobile, 3-col grid on desktop.
 */
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollReveal } from '@/lib/landing/useScrollReveal';
import {
  MortiroloSunsetScene,
  FjordRainScene,
  MontVentouxScene,
  AlpineStormScene,
  AlpeHuezScene,
  CoastalStageScene,
} from './illustrations/SceneIllustrations';

interface SceneCard {
  id: string;
  name: string;
  region: string;
  mood: string;
  description: string;
  illustration: React.ReactNode;
  accentColor: string;
  stats: { label: string; value: string }[];
  routeParam?: string;
}

const SCENES: SceneCard[] = [
  {
    id: 'mortirolo',
    name: 'Mortirolo',
    region: 'Italian Alps',
    mood: 'Sunset suffering',
    description:
      'The hardest climb in the Giro. Narrow tarmac carved into a cliff face, average 10.9% for 12.4 km. Pantani made it legend.',
    illustration: <MortiroloSunsetScene aria-hidden />,
    accentColor: 'hsl(25 90% 55%)',
    stats: [
      { label: 'Length', value: '12.4 km' },
      { label: 'Avg grade', value: '10.9%' },
      { label: 'Gain', value: '+1,300m' },
    ],
    routeParam: 'mortirolo',
  },
  {
    id: 'fjord',
    name: 'Hardangerfjord',
    region: 'Norway',
    mood: 'Fjord in the rain',
    description:
      'A coastal road that clings to a sheer granite wall above glassy fjord water. Mist, waterfalls, and 200 km of silence.',
    illustration: <FjordRainScene aria-hidden />,
    accentColor: '#22d3ee',
    stats: [
      { label: 'Length', value: '48 km' },
      { label: 'Climbing', value: '+820m' },
      { label: 'Vibe', value: 'Remote' },
    ],
    routeParam: 'hardangerfjord',
  },
  {
    id: 'ventoux',
    name: 'Mont Ventoux',
    region: 'Provence, France',
    mood: 'Lunar summit',
    description:
      'The Giant of Provence. Three faces, one barren moon-rock summit, perpetual wind. No shelter above 1,500 m. Go.',
    illustration: <MontVentouxScene aria-hidden />,
    accentColor: 'hsl(215 25% 78%)',
    stats: [
      { label: 'From Bédoin', value: '21.8 km' },
      { label: 'Avg grade', value: '7.6%' },
      { label: 'Summit', value: '1,912m' },
    ],
    routeParam: 'ventoux',
  },
  {
    id: 'stelvio',
    name: 'Passo dello Stelvio',
    region: 'Dolomites, Italy',
    mood: 'Alpine storm',
    description:
      '48 hairpins. The second highest paved pass in the Alps at 2,758 m. Snow possible in July. Lightning optional.',
    illustration: <AlpineStormScene aria-hidden />,
    accentColor: 'hsl(260 60% 72%)',
    stats: [
      { label: 'Hairpins', value: '48' },
      { label: 'Summit', value: '2,758m' },
      { label: 'Gain', value: '+1,808m' },
    ],
    routeParam: 'stelvio',
  },
  {
    id: 'alpe-dhuez',
    name: "Alpe d'Huez",
    region: 'French Alps',
    mood: 'Tour de France finish',
    description:
      "21 numbered hairpins, each named after a Tour winner. The crowd wall is so thick you can touch both sides. Incroyable.",
    illustration: <AlpeHuezScene aria-hidden />,
    accentColor: 'hsl(38 90% 56%)',
    stats: [
      { label: 'Hairpins', value: '21' },
      { label: 'Length', value: '13.8 km' },
      { label: 'Gain', value: '+1,071m' },
    ],
    routeParam: 'alpe-dhuez',
  },
  {
    id: 'cote-dazur',
    name: "Côte d'Azur",
    region: 'French Riviera',
    mood: 'Rolling stage at dawn',
    description:
      'Undulating coastal roads above a flat-calm Mediterranean. The kind of stage that ends in a sprint but feels like a painting.',
    illustration: <CoastalStageScene aria-hidden />,
    accentColor: 'hsl(195 92% 56%)',
    stats: [
      { label: 'Length', value: '92 km' },
      { label: 'Climbing', value: '+1,240m' },
      { label: 'Vibe', value: 'Rolling' },
    ],
    routeParam: 'cote-dazur',
  },
];

// ── Scene Card ──────────────────────────────────────────────────────────────

function SceneCardItem({ card }: { card: SceneCard }) {
  const navigate = useNavigate();
  const accent = card.accentColor;

  function handleLaunch() {
    navigate(`/app?route=${card.routeParam ?? 'demo'}&demo=1`);
  }

  return (
    <article
      className="group relative flex-none w-[88vw] sm:w-80 lg:w-auto rounded-2xl overflow-hidden cursor-pointer landing-card-glass landing-card-hover"
      style={{ border: `1px solid ${accent}28` }}
      onClick={handleLaunch}
      onKeyDown={e => e.key === 'Enter' && handleLaunch()}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = `${accent}55`;
        el.style.boxShadow = `0 0 0 1px ${accent}18, 0 20px 48px -16px ${accent}22`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = `${accent}28`;
        el.style.boxShadow = '';
      }}
      role="button"
      tabIndex={0}
      aria-label={`Ride ${card.name} — ${card.mood}`}
    >
      {/* Inner inset glow on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: `inset 0 0 40px ${accent}06` }}
        aria-hidden
      />

      {/* Illustration */}
      <div className="relative aspect-[16/9] overflow-hidden">
        {card.illustration}
        {/* Mood badge */}
        <div
          className="absolute top-3 left-3 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
          style={{ background: 'hsl(220 55% 4% / 0.85)', color: accent, border: `1px solid ${accent}40`, backdropFilter: 'blur(8px)' }}
        >
          {card.mood}
        </div>
        {/* Ride CTA — appears on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: 'hsl(220 55% 4% / 0.55)', backdropFilter: 'blur(2px)' }}
          aria-hidden
        >
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 font-bold text-xs"
            style={{ background: accent, color: 'hsl(220 42% 4%)' }}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
              <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm-1 4v6l5-3-5-3z" />
            </svg>
            Ride this route
          </div>
        </div>
      </div>

      {/* Text block */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight leading-tight">
              {card.name}
            </h3>
            <p className="text-[10px] mt-0.5 font-semibold uppercase tracking-widest" style={{ color: accent }}>
              {card.region}
            </p>
          </div>
          {/* Stats pills */}
          <div className="flex flex-wrap justify-end gap-1 shrink-0">
            {card.stats.slice(0, 2).map(s => (
              <span
                key={s.label}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: `${accent}14`, color: accent }}
              >
                {s.value}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs leading-relaxed mt-2" style={{ color: 'hsl(215 18% 50%)' }}>
          {card.description}
        </p>
      </div>

      {/* Bottom accent sweep */}
      <div
        className="h-px w-0 group-hover:w-full transition-all duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        aria-hidden
      />
    </article>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

export function GallerySection() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useScrollReveal<HTMLDivElement>({ threshold: 0.2 });
  const desktopGridRef = useScrollReveal<HTMLDivElement>({
    childSelector: '.gallery-reveal-child',
    delayStep: 80,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.08,
  });

  return (
    <section role="region" aria-labelledby="gallery-heading" className="relative py-20 sm:py-28 overflow-hidden">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, hsl(195 92% 56% / 0.04), transparent)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        {/* Section header */}
        <div ref={headerRef} className="text-center mb-12 landing-section-reveal">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest mb-5"
            style={{
              background: 'hsl(195 92% 56% / 0.08)',
              border: '1px solid hsl(195 92% 56% / 0.2)',
              color: '#22d3ee',
            }}
          >
            Where will you ride?
          </div>
          <h2
            id="gallery-heading"
            className="font-extrabold tracking-tight text-white"
            style={{ fontSize: 'clamp(1.625rem, 5vw, 3.5rem)', lineHeight: '1.05', letterSpacing: '-0.03em' }}
          >
            The world's greatest climbs.<br />
            <span
              style={{
                background: 'linear-gradient(130deg, #22d3ee, hsl(158 80% 42%))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Waiting for you.
            </span>
          </h2>
          <p
            className="mt-4 max-w-xl mx-auto text-base sm:text-lg leading-relaxed"
            style={{ color: 'hsl(215 18% 52%)' }}
          >
            50 routes ready to ride — or upload your own GPX. Every kilometre rendered in
            photorealistic 3D, every watt felt through your trainer.
          </p>
        </div>
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="lg:hidden relative">
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto px-4 sm:px-6 pb-4 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {SCENES.map((card) => (
            <div key={card.id} className="snap-start">
              <SceneCardItem card={card} />
            </div>
          ))}
        </div>
        {/* Right fade */}
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-16"
          style={{ background: 'linear-gradient(to left, hsl(220 42% 4%), transparent)' }}
          aria-hidden
        />
      </div>

      {/* Desktop: grid with scroll-reveal stagger */}
      <div
        ref={desktopGridRef}
        className="hidden lg:grid max-w-7xl mx-auto px-10 gap-5 grid-cols-3"
      >
        {SCENES.map((card) => (
          <div key={card.id} className="gallery-reveal-child landing-fade-in-up">
            <SceneCardItem card={card} />
          </div>
        ))}
      </div>

      {/* Browse all CTA */}
      <div className="mt-12 px-4 flex justify-center">
        <button
          onClick={() => {
            // Navigate to app with route library open
            window.location.href = '/app';
          }}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-full text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-[0.97]"
          style={{
            minHeight: '44px',
            height: '3rem',
            padding: '0 1.75rem',
            background: 'hsl(220 42% 9%)',
            color: '#22d3ee',
            border: '1px solid hsl(195 92% 56% / 0.25)',
          }}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M2 2h12v12H2V2zm1 5v5h10V7H3zm0-1h10V3H3v3z" />
          </svg>
          Browse all 50 routes
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
