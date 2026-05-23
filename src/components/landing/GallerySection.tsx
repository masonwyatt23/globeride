/**
 * GallerySection — "What's inside" scrolling feature gallery.
 * Each card is a polished mockup tile showcasing a product area.
 * Horizontal scroll on mobile, 2-3 col grid on desktop.
 */
import { useRef } from 'react';

interface GalleryCard {
  id: string;
  headline: string;
  subline: string;
  visual: React.ReactNode;
  accent: string;
  accentDim: string;
}

// ── Mockup visuals — inline SVG/div compositions ──────────────────────────

function RideHUDMockup() {
  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl" style={{ background: 'linear-gradient(160deg, hsl(220 55% 8%), hsl(215 60% 5%))' }}>
      {/* Globe preview */}
      <div className="absolute inset-0 opacity-40">
        <svg viewBox="0 0 200 120" fill="none" className="w-full h-full">
          <defs>
            <radialGradient id="g1" cx="45%" cy="40%" r="55%">
              <stop offset="0%" stopColor="hsl(215 55% 18%)" />
              <stop offset="100%" stopColor="hsl(215 70% 6%)" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="60" r="50" fill="url(#g1)" />
          <circle cx="100" cy="60" r="50" stroke="hsl(195 92% 56% / 0.3)" strokeWidth="0.6" fill="none" />
          <ellipse cx="100" cy="60" rx="50" ry="4" stroke="hsl(195 92% 56% / 0.2)" strokeWidth="0.4" fill="none" />
          <ellipse cx="100" cy="60" rx="3" ry="50" stroke="hsl(195 92% 56% / 0.15)" strokeWidth="0.4" fill="none" />
          <ellipse cx="100" cy="60" rx="3" ry="50" stroke="hsl(195 92% 56% / 0.15)" strokeWidth="0.4" fill="none" transform="rotate(60 100 60)" />
          {/* Route */}
          <path d="M65 72 C75 65 85 61 100 58 C115 55 128 53 138 50" stroke="#22d3ee" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <circle cx="65" cy="72" r="2.5" fill="hsl(158 80% 42%)" />
          <circle cx="138" cy="50" r="2.5" fill="#22d3ee" />
        </svg>
      </div>
      {/* HUD overlay — bottom */}
      <div className="absolute bottom-0 inset-x-0 p-3 flex gap-2">
        {[
          { label: 'POWER', value: '287', unit: 'W', color: '#22d3ee' },
          { label: 'SPEED', value: '32.4', unit: 'km/h', color: 'hsl(158 80% 42%)' },
          { label: 'GRADE', value: '+6.2', unit: '%', color: 'hsl(38 90% 56%)' },
        ].map(m => (
          <div key={m.label} className="flex-1 rounded-lg p-2 text-center" style={{ background: 'hsl(220 50% 10% / 0.9)', border: `1px solid ${m.color}22` }}>
            <div className="text-[8px] font-bold tracking-widest mb-0.5" style={{ color: m.color }}>{m.label}</div>
            <div className="font-black text-white leading-none" style={{ fontSize: '15px', fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
            <div className="text-[7px] text-white/40 mt-0.5">{m.unit}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkoutMockup() {
  const bars = [40, 55, 55, 80, 80, 80, 100, 100, 65, 65, 90, 90, 90, 55, 40];
  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl p-3 flex flex-col gap-2" style={{ background: 'linear-gradient(160deg, hsl(220 55% 8%), hsl(215 60% 5%))' }}>
      <div className="text-[9px] font-bold tracking-widest text-cyan-400/80 uppercase">Threshold Builder · 40 min</div>
      {/* Power profile */}
      <div className="flex-1 flex items-end gap-0.5">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${h}%`,
              background: h >= 90 ? '#22d3ee' : h >= 75 ? 'hsl(195 92% 56% / 0.7)' : h >= 55 ? 'hsl(195 92% 56% / 0.45)' : 'hsl(195 92% 56% / 0.25)',
            }}
          />
        ))}
      </div>
      {/* Zone labels */}
      <div className="flex justify-between text-[7px] text-white/30 font-mono">
        <span>Z2</span><span>Z3</span><span>Z4</span><span>Z5</span><span>Z3</span>
      </div>
      {/* Current interval badge */}
      <div className="flex items-center gap-2 rounded-lg p-2" style={{ background: 'hsl(195 92% 56% / 0.12)', border: '1px solid hsl(195 92% 56% / 0.3)' }}>
        <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
        <div>
          <div className="text-[9px] font-black text-cyan-400">295 W  ·  5:30 remaining</div>
          <div className="text-[8px] text-white/40">Threshold interval 2 of 3</div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsMockup() {
  const points = '10,55 25,48 40,52 55,38 70,34 85,40 100,28 115,32 130,25 145,30 160,18';
  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl p-3 flex flex-col gap-2" style={{ background: 'linear-gradient(160deg, hsl(220 55% 8%), hsl(215 60% 5%))' }}>
      <div className="text-[9px] font-bold tracking-widest text-cyan-400/80 uppercase">Post-Ride Analytics</div>
      {/* Power curve */}
      <div className="flex-1 relative">
        <svg viewBox="0 0 170 70" fill="none" className="w-full h-full">
          <defs>
            <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(195 92% 56% / 0.35)" />
              <stop offset="100%" stopColor="hsl(195 92% 56% / 0)" />
            </linearGradient>
          </defs>
          {/* Area fill */}
          <polygon points={`10,55 ${points.split(' ').map(p => p).join(' ')} 160,65`} fill="url(#curveGrad)" />
          {/* Line */}
          <polyline points={points} stroke="#22d3ee" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Grid */}
          {[20, 40, 60].map(y => (
            <line key={y} x1="8" y1={y} x2="165" y2={y} stroke="hsl(215 30% 20%)" strokeWidth="0.5" strokeDasharray="3,3" />
          ))}
          {/* Peak dot */}
          <circle cx="160" cy="18" r="3" fill="#22d3ee" />
          <line x1="160" y1="18" x2="160" y2="65" stroke="hsl(195 92% 56% / 0.4)" strokeWidth="0.6" strokeDasharray="2,2" />
        </svg>
      </div>
      {/* Stats row */}
      <div className="flex gap-2">
        {[
          { v: '342', l: 'Peak W' },
          { v: '1.12', l: 'W/kg' },
          { v: '87%', l: 'Efficiency' },
        ].map(s => (
          <div key={s.l} className="flex-1 text-center rounded-lg p-1.5" style={{ background: 'hsl(220 50% 10%)' }}>
            <div className="font-black text-cyan-400 leading-none" style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
            <div className="text-[7px] text-white/35 mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrainingCalendarMockup() {
  const days = ['M','T','W','T','F','S','S'];
  const rides = [3, 0, 4, 0, 3, 5, 2, 0, 4, 3, 0, 4, 0, 5, 3, 0, 3, 4, 0, 0, 4];
  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl p-3 flex flex-col gap-2" style={{ background: 'linear-gradient(160deg, hsl(220 55% 8%), hsl(215 60% 5%))' }}>
      <div className="text-[9px] font-bold tracking-widest text-cyan-400/80 uppercase">Training Calendar</div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => (
          <div key={d} className="text-center text-[7px] text-white/30 font-bold">{d}</div>
        ))}
        {rides.map((r, i) => (
          <div
            key={i}
            className="aspect-square rounded flex items-center justify-center text-[7px] font-bold"
            style={{
              background: r === 0 ? 'hsl(220 40% 12%)' : r >= 4 ? 'hsl(195 92% 56% / 0.8)' : r >= 3 ? 'hsl(195 92% 56% / 0.5)' : 'hsl(195 92% 56% / 0.25)',
              color: r === 0 ? 'hsl(215 18% 40%)' : 'white',
            }}
          >
            {r || '·'}
          </div>
        ))}
      </div>
      {/* Week summary */}
      <div className="flex gap-2 mt-auto">
        <div className="flex-1 rounded-lg p-1.5 text-center" style={{ background: 'hsl(220 50% 10%)' }}>
          <div className="font-black text-cyan-400 text-xs">4 rides</div>
          <div className="text-[7px] text-white/35">this week</div>
        </div>
        <div className="flex-1 rounded-lg p-1.5 text-center" style={{ background: 'hsl(220 50% 10%)' }}>
          <div className="font-black text-cyan-400 text-xs">8.4 h</div>
          <div className="text-[7px] text-white/35">total time</div>
        </div>
      </div>
    </div>
  );
}

function FitnessChartMockup() {
  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl p-3 flex flex-col gap-2" style={{ background: 'linear-gradient(160deg, hsl(220 55% 8%), hsl(215 60% 5%))' }}>
      <div className="text-[9px] font-bold tracking-widest text-cyan-400/80 uppercase">Fitness / Form</div>
      <div className="flex-1 relative">
        <svg viewBox="0 0 170 70" fill="none" className="w-full h-full">
          <defs>
            <linearGradient id="fitnessGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(195 92% 56% / 0.3)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
            <linearGradient id="formGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(158 80% 42% / 0.3)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          {/* Grid */}
          {[15, 35, 55].map(y => (
            <line key={y} x1="0" y1={y} x2="170" y2={y} stroke="hsl(215 30% 18%)" strokeWidth="0.5" />
          ))}
          {/* CTL / Fitness */}
          <polyline points="0,60 20,55 40,48 60,42 80,36 100,30 120,26 140,22 160,18" stroke="#22d3ee" strokeWidth="1.5" fill="none" />
          <polygon points="0,60 20,55 40,48 60,42 80,36 100,30 120,26 140,22 160,18 160,70 0,70" fill="url(#fitnessGrad)" />
          {/* ATL / Form */}
          <polyline points="0,58 15,50 30,55 50,44 65,50 80,38 95,45 110,32 125,38 145,25 160,30" stroke="hsl(158 80% 42%)" strokeWidth="1" fill="none" strokeDasharray="4,2" />
          {/* Legend */}
          <rect x="5" y="5" width="6" height="2" fill="#22d3ee" rx="1" />
          <text x="14" y="8" fontSize="5" fill="hsl(215 18% 55%)" fontFamily="monospace">Fitness</text>
          <rect x="55" y="5" width="6" height="2" fill="hsl(158 80% 42%)" rx="1" />
          <text x="64" y="8" fontSize="5" fill="hsl(215 18% 55%)" fontFamily="monospace">Form</text>
        </svg>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg p-1.5 text-center" style={{ background: 'hsl(220 50% 10%)' }}>
          <div className="font-black text-cyan-400 text-xs">CTL 68</div>
          <div className="text-[7px] text-white/35">↑ +4 this week</div>
        </div>
        <div className="flex-1 rounded-lg p-1.5 text-center" style={{ background: 'hsl(220 50% 10%)' }}>
          <div className="font-black" style={{ color: 'hsl(158 80% 42%)', fontSize: '12px' }}>TSB +12</div>
          <div className="text-[7px] text-white/35">Fresh & ready</div>
        </div>
      </div>
    </div>
  );
}

function AchievementsMockup() {
  const badges = [
    { label: 'Alpe d\'Huez', sub: 'Conquered', color: '#22d3ee', icon: '⛰' },
    { label: '5,000 km', sub: 'Lifetime', color: 'hsl(158 80% 42%)', icon: '🌍' },
    { label: '10,000 W', sub: 'Total work', color: 'hsl(38 90% 56%)', icon: '⚡' },
    { label: 'Century', sub: '100km ride', color: 'hsl(280 70% 60%)', icon: '🏅' },
  ];
  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl p-3 flex flex-col gap-2" style={{ background: 'linear-gradient(160deg, hsl(220 55% 8%), hsl(215 60% 5%))' }}>
      <div className="text-[9px] font-bold tracking-widest text-cyan-400/80 uppercase">Achievements</div>
      <div className="grid grid-cols-2 gap-2 flex-1">
        {badges.map(b => (
          <div
            key={b.label}
            className="rounded-xl p-2 flex flex-col items-center justify-center gap-1 text-center"
            style={{ background: `${b.color}12`, border: `1px solid ${b.color}30` }}
          >
            <div style={{ fontSize: '20px', lineHeight: 1 }}>{b.icon}</div>
            <div className="font-black text-white leading-tight" style={{ fontSize: '9px' }}>{b.label}</div>
            <div style={{ fontSize: '7px', color: b.color }}>{b.sub}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg p-2 flex items-center gap-2" style={{ background: 'hsl(195 92% 56% / 0.08)', border: '1px solid hsl(195 92% 56% / 0.2)' }}>
        <div className="text-[18px]">🔥</div>
        <div>
          <div className="text-[9px] font-black text-cyan-400">14-day streak</div>
          <div className="text-[7px] text-white/40">Keep it going!</div>
        </div>
      </div>
    </div>
  );
}

// ── Card data ──────────────────────────────────────────────────────────────

const GALLERY_CARDS: GalleryCard[] = [
  {
    id: 'ride-hud',
    headline: 'Cinematic ride view + live HUD',
    subline: 'Real gradient, real resistance — photorealistic 3D world around you.',
    visual: <RideHUDMockup />,
    accent: '#22d3ee',
    accentDim: 'hsl(195 92% 56% / 0.12)',
  },
  {
    id: 'workout',
    headline: 'Structured workout pacing',
    subline: 'Curated 15–45 min ERG plans. Your trainer holds every watt, automatically.',
    visual: <WorkoutMockup />,
    accent: 'hsl(195 92% 56%)',
    accentDim: 'hsl(195 92% 56% / 0.10)',
  },
  {
    id: 'analytics',
    headline: 'Post-ride power analytics',
    subline: 'Power curve, W/kg, and efficiency metrics the moment you cross the line.',
    visual: <AnalyticsMockup />,
    accent: 'hsl(158 80% 42%)',
    accentDim: 'hsl(158 80% 42% / 0.10)',
  },
  {
    id: 'calendar',
    headline: 'Training calendar & plans',
    subline: 'Visualise your load, spot gaps, and build consistent weeks.',
    visual: <TrainingCalendarMockup />,
    accent: 'hsl(38 90% 56%)',
    accentDim: 'hsl(38 90% 56% / 0.10)',
  },
  {
    id: 'fitness',
    headline: 'Fitness / Form chart',
    subline: 'CTL, ATL, and TSB in one view — know when you\'re ripe to race.',
    visual: <FitnessChartMockup />,
    accent: 'hsl(195 92% 56%)',
    accentDim: 'hsl(195 92% 56% / 0.10)',
  },
  {
    id: 'achievements',
    headline: 'Achievements & streaks',
    subline: 'Climb every iconic col. Collect badges. Keep the streak alive.',
    visual: <AchievementsMockup />,
    accent: 'hsl(280 70% 60%)',
    accentDim: 'hsl(280 70% 60% / 0.10)',
  },
];

// ── GalleryCard component ──────────────────────────────────────────────────

function GalleryCardItem({ card, index }: { card: GalleryCard; index: number }) {
  return (
    <div
      className="group relative flex-none w-72 sm:w-80 lg:w-auto rounded-2xl overflow-hidden"
      style={{
        background: 'hsl(220 42% 6%)',
        border: `1px solid ${card.accent}22`,
        animationDelay: `${index * 80}ms`,
      }}
    >
      {/* Hover border glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: `0 0 0 1px ${card.accent}55, inset 0 0 32px ${card.accent}08` }}
      />

      {/* Mockup visual */}
      <div className="aspect-[4/3] p-3">
        {card.visual}
      </div>

      {/* Text */}
      <div className="p-4 pt-2">
        <h3
          className="text-sm font-bold text-white tracking-tight leading-snug mb-1"
        >
          {card.headline}
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: 'hsl(215 18% 52%)' }}>
          {card.subline}
        </p>
      </div>

      {/* Accent line at bottom */}
      <div
        className="h-0.5 w-0 group-hover:w-full transition-all duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${card.accent}, transparent)` }}
      />
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────

export function GallerySection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* Dim ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, hsl(195 92% 56% / 0.04), transparent)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        {/* Section header */}
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest mb-5"
            style={{
              background: 'hsl(195 92% 56% / 0.08)',
              border: '1px solid hsl(195 92% 56% / 0.2)',
              color: '#22d3ee',
            }}
          >
            What's inside
          </div>
          <h2
            className="font-extrabold tracking-tight text-white"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: '1.05', letterSpacing: '-0.03em' }}
          >
            Every tool a serious cyclist needs.
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-base sm:text-lg leading-relaxed" style={{ color: 'hsl(215 18% 52%)' }}>
            One app. Zero subscriptions. Everything from real-road routing to post-ride analytics — built in.
          </p>
        </div>
      </div>

      {/* Horizontal scroll on mobile — grid on desktop */}
      <div className="lg:hidden">
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto px-4 sm:px-6 pb-4 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {GALLERY_CARDS.map((card, i) => (
            <div key={card.id} className="snap-start animate-fadeUp" style={{ animationDelay: `${i * 80}ms` }}>
              <GalleryCardItem card={card} index={i} />
            </div>
          ))}
        </div>
        {/* Scroll hint fade on right */}
        <div
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-16 h-full lg:hidden"
          style={{ background: 'linear-gradient(to left, hsl(220 42% 4%), transparent)' }}
          aria-hidden
        />
      </div>

      {/* Desktop grid */}
      <div className="hidden lg:grid max-w-7xl mx-auto px-10 gap-5 grid-cols-3">
        {GALLERY_CARDS.map((card, i) => (
          <div key={card.id} className="animate-fadeUp" style={{ animationDelay: `${i * 80}ms` }}>
            <GalleryCardItem card={card} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
