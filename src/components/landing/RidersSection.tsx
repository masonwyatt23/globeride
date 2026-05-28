/**
 * RidersSection — social-proof-style cards showing what the experience offers.
 *
 * No fake testimonials or quotes. Each card describes a real ride scenario
 * with an evocative inline SVG illustration and a factual 2-line description.
 */

import type { SVGProps } from 'react';

type SceneProps = SVGProps<SVGSVGElement> & { titleId: string; title: string };

// ── Scene illustrations ───────────────────────────────────────────────────────

function TourDeFramceScene({ titleId, title, ...props }: SceneProps) {
  return (
    <svg
      viewBox="0 0 280 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      role="img"
      aria-labelledby={titleId}
      {...props}
    >
      <title id={titleId}>{title}</title>
      {/* Sky gradient */}
      <defs>
        <linearGradient id="tdf-sky" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="hsl(220 55% 6%)" />
          <stop offset="100%" stopColor="hsl(210 45% 10%)" />
        </linearGradient>
        <linearGradient id="tdf-road" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="hsl(215 20% 12%)" />
          <stop offset="100%" stopColor="hsl(215 20% 8%)" />
        </linearGradient>
      </defs>
      <rect width="280" height="160" fill="url(#tdf-sky)" />
      {/* Mountain silhouettes */}
      <polygon points="0,120 40,70 80,105 120,55 160,90 200,60 240,80 280,65 280,160 0,160" fill="hsl(215 30% 10%)" />
      <polygon points="0,135 30,110 60,125 100,100 140,118 180,95 220,112 260,100 280,108 280,160 0,160" fill="hsl(215 30% 8%)" />
      {/* Road */}
      <path d="M0 148 Q140 130 280 142" stroke="hsl(215 18% 16%)" strokeWidth="14" strokeLinecap="round" />
      <path d="M0 148 Q140 130 280 142" stroke="hsl(215 18% 10%)" strokeWidth="12" />
      {/* Road markings */}
      <path d="M30 146 Q80 138 130 140" stroke="hsl(215 18% 22%)" strokeWidth="1" strokeDasharray="8 6" />
      <path d="M150 141 Q200 138 250 142" stroke="hsl(215 18% 22%)" strokeWidth="1" strokeDasharray="8 6" />
      {/* Peloton silhouettes */}
      {[[80, 138], [92, 136], [104, 137], [116, 136], [128, 138]].map(([x, y], i) => (
        <g key={i}>
          {/* Bike wheels */}
          <circle cx={x} cy={y} r="5" stroke="hsl(215 18% 30%)" strokeWidth="1" />
          <circle cx={x + 10} cy={y} r="5" stroke="hsl(215 18% 30%)" strokeWidth="1" />
          {/* Rider silhouette */}
          <ellipse cx={x + 5} cy={y - 8} rx="4" ry="5" fill="hsl(215 30% 20%)" />
          <circle cx={x + 5} cy={y - 14} r="3" fill="hsl(215 30% 22%)" />
        </g>
      ))}
      {/* Lead rider in aqua */}
      <g>
        <circle cx="68" cy="138" r="5" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.7" />
        <circle cx="78" cy="138" r="5" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.7" />
        <ellipse cx="73" cy="130" rx="4" ry="5" fill="hsl(195 92% 30%)" fillOpacity="0.8" />
        <circle cx="73" cy="124" r="3" fill="hsl(195 92% 35%)" fillOpacity="0.9" />
      </g>
      {/* Stats badge */}
      <rect x="168" y="12" width="104" height="38" rx="6" fill="hsl(215 55% 4% / 0.9)" stroke="hsl(195 92% 56% / 0.2)" strokeWidth="0.8" />
      <text x="178" y="28" fontSize="8" fill="#22d3ee" fontFamily="monospace" fontWeight="900">Tour de France</text>
      <text x="178" y="42" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">Stage 17 replay</text>
    </svg>
  );
}

function MontVentouxScene({ titleId, title, ...props }: SceneProps) {
  return (
    <svg
      viewBox="0 0 280 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      role="img"
      aria-labelledby={titleId}
      {...props}
    >
      <title id={titleId}>{title}</title>
      <defs>
        <linearGradient id="mv-sky" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="hsl(25 60% 12%)" />
          <stop offset="35%" stopColor="hsl(18 55% 16%)" />
          <stop offset="100%" stopColor="hsl(215 40% 8%)" />
        </linearGradient>
        <radialGradient id="mv-sun" cx="70%" cy="28%" r="30%">
          <stop offset="0%" stopColor="hsl(35 90% 65%)" stopOpacity="0.6" />
          <stop offset="60%" stopColor="hsl(25 70% 45%)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="280" height="160" fill="url(#mv-sky)" />
      <rect width="280" height="160" fill="url(#mv-sun)" />
      {/* Sun disc */}
      <circle cx="196" cy="44" r="18" fill="hsl(38 90% 60%)" fillOpacity="0.7" />
      <circle cx="196" cy="44" r="12" fill="hsl(45 95% 75%)" fillOpacity="0.5" />
      {/* Mont Ventoux limestone cap */}
      <polygon points="60,110 100,40 140,110" fill="hsl(215 10% 72%)" />
      <polygon points="80,110 100,55 120,110" fill="hsl(215 10% 78%)" />
      {/* Rock texture lines */}
      <line x1="90" y1="95" x2="110" y2="90" stroke="hsl(215 10% 65%)" strokeWidth="0.5" />
      <line x1="85" y1="80" x2="105" y2="76" stroke="hsl(215 10% 65%)" strokeWidth="0.5" />
      {/* Lower slopes — scrub */}
      <polygon points="0,130 60,110 140,110 200,120 280,115 280,160 0,160" fill="hsl(145 20% 14%)" />
      {/* Road hairpin */}
      <path d="M20 155 Q50 130 80 125 Q100 120 105 108 Q110 100 95 96 Q80 92 85 80" stroke="hsl(215 18% 22%)" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Rider on the road */}
      <circle cx="97" cy="94" r="4" fill="hsl(215 30% 18%)" />
      <circle cx="97" cy="89" r="2.5" fill="hsl(215 30% 22%)" />
      {/* Shadow/glow behind sun */}
      <ellipse cx="196" cy="44" rx="40" ry="40" fill="hsl(35 90% 60%)" fillOpacity="0.06" />
      {/* Badge */}
      <rect x="158" y="12" width="114" height="38" rx="6" fill="hsl(215 55% 4% / 0.9)" stroke="hsl(195 92% 56% / 0.2)" strokeWidth="0.8" />
      <text x="168" y="28" fontSize="8" fill="#22d3ee" fontFamily="monospace" fontWeight="900">Mont Ventoux</text>
      <text x="168" y="42" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">sunset ascent</text>
    </svg>
  );
}

function PelotonScene({ titleId, title, ...props }: SceneProps) {
  return (
    <svg
      viewBox="0 0 280 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      role="img"
      aria-labelledby={titleId}
      {...props}
    >
      <title id={titleId}>{title}</title>
      <defs>
        <linearGradient id="pelt-sky" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="hsl(220 50% 6%)" />
          <stop offset="100%" stopColor="hsl(215 45% 10%)" />
        </linearGradient>
      </defs>
      <rect width="280" height="160" fill="url(#pelt-sky)" />
      {/* Horizon city lights */}
      {[[20, 105], [35, 98], [50, 102], [65, 95], [80, 100], [160, 97], [185, 102], [210, 95], [240, 100], [260, 105]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="3" height={130 - y} rx="1" fill={i % 3 === 0 ? 'hsl(195 92% 56%)' : 'hsl(215 18% 28%)'} fillOpacity="0.4" />
      ))}
      {/* Road */}
      <path d="M0 142 Q140 128 280 140" stroke="hsl(215 18% 14%)" strokeWidth="18" />
      <path d="M0 142 Q140 128 280 140" stroke="hsl(215 18% 10%)" strokeWidth="14" />
      {/* Lane marking */}
      <path d="M50 140 Q100 133 150 135" stroke="hsl(215 18% 20%)" strokeWidth="1" strokeDasharray="10 8" />
      <path d="M160 135 Q210 132 260 137" stroke="hsl(215 18% 20%)" strokeWidth="1" strokeDasharray="10 8" />
      {/* Connection lines (WebRTC mesh) */}
      {[[75, 134], [100, 132], [125, 133]].flatMap(([x1, y1], i, arr) =>
        arr.slice(i + 1).map(([x2, y2], j) => (
          <line key={`${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.25" strokeDasharray="3 2" />
        ))
      )}
      {/* Group of riders */}
      {[[75, 134], [90, 132], [105, 133], [120, 131], [135, 133]].map(([x, y], i) => {
        const isActive = i === 0;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="4.5" stroke={isActive ? '#22d3ee' : 'hsl(215 18% 28%)'} strokeWidth="1" strokeOpacity={isActive ? 0.8 : 0.6} />
            <circle cx={x + 9} cy={y} r="4.5" stroke={isActive ? '#22d3ee' : 'hsl(215 18% 28%)'} strokeWidth="1" strokeOpacity={isActive ? 0.8 : 0.6} />
            <ellipse cx={x + 4.5} cy={y - 7} rx="3.5" ry="4.5" fill={isActive ? 'hsl(195 92% 30%)' : 'hsl(215 30% 18%)'} fillOpacity="0.9" />
            <circle cx={x + 4.5} cy={y - 13} r="2.8" fill={isActive ? 'hsl(195 92% 35%)' : 'hsl(215 30% 22%)'} fillOpacity="0.9" />
          </g>
        );
      })}
      {/* P2P badge */}
      <rect x="10" y="12" width="110" height="38" rx="6" fill="hsl(215 55% 4% / 0.9)" stroke="hsl(195 92% 56% / 0.2)" strokeWidth="0.8" />
      <text x="20" y="28" fontSize="8" fill="#22d3ee" fontFamily="monospace" fontWeight="900">Friday peloton</text>
      <text x="20" y="42" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">5-rider mesh · WebRTC</text>
    </svg>
  );
}

// ── Card data ─────────────────────────────────────────────────────────────────

export const RIDER_CARDS = [
  {
    id: 'tour-de-france',
    heading: 'Tour de France stage replay',
    body: 'Upload an official stage GPX and pedal the same kilometers the pros raced. Real gradient, real terrain — your trainer resistance follows every switchback.',
    Scene: TourDeFramceScene,
    sceneTitleId: 'riders-scene-1-title',
    sceneTitle: 'Riders in a peloton on a mountain stage resembling Tour de France',
  },
  {
    id: 'mont-ventoux',
    heading: 'Mont Ventoux at sunset',
    body: 'GlobeRide renders the real Cesium terrain with a dynamic sun angle matching your local time. The limestone summit turns amber as you grind through the final switchbacks.',
    Scene: MontVentouxScene,
    sceneTitleId: 'riders-scene-2-title',
    sceneTitle: 'Mont Ventoux limestone summit at sunset with a rider on the road',
  },
  {
    id: 'friday-peloton',
    heading: 'Friday peloton with friends',
    body: 'WebRTC P2P mesh keeps everyone in sync without a server. Up to eight riders share the same virtual road — ghost positions update at 20 Hz over a direct connection.',
    Scene: PelotonScene,
    sceneTitleId: 'riders-scene-3-title',
    sceneTitle: 'Group of connected riders in a WebRTC peloton at night',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function RidersSection() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-14 sm:py-20 lg:py-28 overflow-hidden">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute bottom-0 right-1/4 h-[28rem] w-[40rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse, hsl(195 92% 56% / 0.04) 0%, transparent 70%)' }}
        />
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-[11px] sm:text-xs font-semibold tracking-widest uppercase mb-2 sm:mb-3" style={{ color: '#22d3ee' }}>
            In the saddle
          </p>
          <h2
            className="font-extrabold tracking-tight text-white"
            style={{ fontSize: 'clamp(1.75rem, 7vw, 2.5rem)', lineHeight: 1.05, letterSpacing: '-0.025em' }}
          >
            What riders see
          </h2>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base lg:text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'hsl(215 18% 52%)' }}>
            Three scenarios. Same browser tab. No subscription required.
          </p>
        </div>

        {/* Cards — 1-col mobile, 2-col tablet, 3-col desktop */}
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {RIDER_CARDS.map(({ id, heading, body, Scene, sceneTitleId, sceneTitle }) => (
            <div
              key={id}
              className="landing-card-glass landing-card-hover flex flex-col rounded-2xl overflow-hidden group"
            >
              {/* Scene illustration — aspect-video fills full card width on all breakpoints */}
              <div
                className="w-full overflow-hidden"
                style={{ aspectRatio: '16/9', background: 'hsl(220 42% 4%)' }}
              >
                <Scene
                  titleId={sceneTitleId}
                  title={sceneTitle}
                  className="w-full h-full transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </div>

              {/* Text — clear hierarchy: heading large, body muted */}
              <div className="flex flex-col flex-1 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mb-1.5 sm:mb-2 leading-snug">
                  {heading}
                </h3>
                <p className="text-[13px] sm:text-sm leading-relaxed" style={{ color: 'hsl(215 18% 50%)' }}>
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
