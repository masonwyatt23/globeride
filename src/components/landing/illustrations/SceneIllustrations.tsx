/**
 * SceneIllustrations.tsx — evocative SVG scene illustrations for GallerySection.
 * Each scene is a stylized route on an atmospheric gradient sky.
 * All SVGs are decorative; aria-hidden is applied by the parent.
 */

import type { SVGProps } from 'react';

type SceneProps = SVGProps<SVGSVGElement> & { title?: string };

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 280 160',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  className: 'w-full h-full',
};

// ── Mortirolo at Sunset ─────────────────────────────────────────────────────
export function MortiroloSunsetScene({ title = 'Mortirolo climb at sunset', ...props }: SceneProps) {
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="mort-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(20 60% 8%)" />
          <stop offset="40%" stopColor="hsl(25 70% 12%)" />
          <stop offset="100%" stopColor="hsl(220 55% 6%)" />
        </linearGradient>
        <radialGradient id="mort-sun" cx="75%" cy="55%" r="35%">
          <stop offset="0%" stopColor="hsl(30 90% 60%)" stopOpacity="0.6" />
          <stop offset="50%" stopColor="hsl(20 80% 40%)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="mort-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(215 40% 14%)" />
          <stop offset="100%" stopColor="hsl(215 40% 8%)" />
        </linearGradient>
      </defs>
      {/* sky */}
      <rect width="280" height="160" fill="url(#mort-sky)" />
      {/* sun glow */}
      <rect width="280" height="160" fill="url(#mort-sun)" />
      {/* sun disc */}
      <circle cx="208" cy="88" r="18" fill="hsl(30 90% 60%)" fillOpacity="0.55" />
      <circle cx="208" cy="88" r="10" fill="hsl(38 95% 70%)" fillOpacity="0.8" />
      {/* mountain silhouettes — back range */}
      <polygon
        points="0,120 30,85 55,95 80,72 110,90 140,68 170,82 200,60 230,78 255,62 280,80 280,160 0,160"
        fill="hsl(220 40% 10%)" />
      {/* mid range */}
      <polygon
        points="0,140 25,118 50,128 80,108 115,120 150,100 185,115 220,96 255,112 280,104 280,160 0,160"
        fill="hsl(220 40% 7%)" />
      {/* Mortirolo switchback route — tight hairpins up slope */}
      <path
        d="M20 148 L35 138 L55 130 L50 120 L30 116 L35 108 L60 105 L80 110 L75 98 L52 94 L58 84 L82 82 L100 88 L95 76 L72 72 L78 62 L100 60 L115 68"
        stroke="#22d3ee" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity="0.9" />
      {/* gradient meters along route */}
      <circle cx="115" cy="68" r="4" fill="#22d3ee" />
      <circle cx="20" cy="148" r="3" fill="hsl(158 80% 42%)" />
      {/* elevation badge */}
      <rect x="186" y="110" width="82" height="36" rx="6"
        fill="hsl(220 55% 5% / 0.85)" stroke="hsl(195 92% 56% / 0.25)" strokeWidth="0.8" />
      <text x="197" y="126" fontSize="9" fill="hsl(38 90% 56%)" fontFamily="monospace" fontWeight="900">+1,852m</text>
      <text x="197" y="138" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">avg 7.6%</text>
    </svg>
  );
}

// ── Norwegian Fjord in Rain ─────────────────────────────────────────────────
export function FjordRainScene({ title = 'Norwegian fjord in rain', ...props }: SceneProps) {
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="fjord-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(210 45% 8%)" />
          <stop offset="100%" stopColor="hsl(210 50% 10%)" />
        </linearGradient>
        <linearGradient id="fjord-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(210 60% 14%)" />
          <stop offset="100%" stopColor="hsl(210 65% 6%)" />
        </linearGradient>
        <linearGradient id="fjord-refl" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect width="280" height="160" fill="url(#fjord-sky)" />
      {/* cliff walls */}
      <polygon points="0,160 0,50 40,30 70,60 60,160" fill="hsl(210 35% 12%)" />
      <polygon points="280,160 280,40 240,20 210,55 220,160" fill="hsl(210 35% 11%)" />
      {/* fjord water */}
      <ellipse cx="140" cy="138" rx="120" ry="28" fill="url(#fjord-water)" />
      {/* water reflection */}
      <ellipse cx="140" cy="138" rx="120" ry="28" fill="url(#fjord-refl)" />
      {/* mist layers */}
      {[70, 82, 92].map((y, i) => (
        <ellipse key={i} cx="140" cy={y} rx={80 + i * 20} ry={8 + i * 2}
          fill="hsl(210 40% 18%)" fillOpacity={0.3 - i * 0.06} />
      ))}
      {/* rain streaks */}
      {Array.from({ length: 30 }, (_, i) => ({
        x: (i * 37) % 280,
        y: (i * 23) % 120,
      })).map((r, i) => (
        <line key={i} x1={r.x} y1={r.y} x2={r.x - 2} y2={r.y + 14}
          stroke="hsl(210 60% 70%)" strokeWidth="0.6" strokeOpacity="0.25" />
      ))}
      {/* coastal road clinging to cliff */}
      <path
        d="M5 130 Q30 120 55 110 Q80 100 90 88 Q100 76 105 68 Q112 58 120 52 Q130 46 142 46 Q154 46 162 52 Q172 58 180 68"
        stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" strokeOpacity="0.85" />
      <circle cx="5" cy="130" r="3.5" fill="hsl(158 80% 42%)" />
      <circle cx="180" cy="68" r="3.5" fill="#22d3ee" />
      {/* rain ripples on water */}
      {[[100, 135], [150, 142], [190, 138]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={4 + i} ry="2"
          stroke="hsl(210 60% 60%)" strokeWidth="0.5" strokeOpacity="0.3" fill="none" />
      ))}
      {/* badge */}
      <rect x="190" y="12" width="82" height="36" rx="6"
        fill="hsl(210 55% 5% / 0.85)" stroke="hsl(195 92% 56% / 0.2)" strokeWidth="0.8" />
      <text x="201" y="28" fontSize="8" fill="#22d3ee" fontFamily="monospace" fontWeight="900">Hardanger</text>
      <text x="201" y="40" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">fjord route</text>
    </svg>
  );
}

// ── Mont Ventoux ────────────────────────────────────────────────────────────
export function MontVentouxScene({ title = 'Mont Ventoux lunar summit', ...props }: SceneProps) {
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="vent-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(215 55% 4%)" />
          <stop offset="60%" stopColor="hsl(215 45% 8%)" />
          <stop offset="100%" stopColor="hsl(215 40% 12%)" />
        </linearGradient>
        <radialGradient id="vent-moon" cx="28%" cy="25%" r="18%">
          <stop offset="0%" stopColor="hsl(215 25% 85%)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="280" height="160" fill="url(#vent-sky)" />
      <rect width="280" height="160" fill="url(#vent-moon)" />
      {/* stars */}
      {[
        [12, 10], [40, 18], [65, 8], [88, 22], [115, 12], [145, 6], [170, 18],
        [195, 10], [220, 22], [248, 8], [270, 16], [30, 35], [100, 30], [160, 38], [230, 30],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.2 : 0.8}
          fill="white" fillOpacity={0.4 + (i % 4) * 0.12} />
      ))}
      {/* moon */}
      <circle cx="78" cy="38" r="16" fill="hsl(215 25% 78%)" fillOpacity="0.6" />
      {/* lunar bare rock summit — iconic white rock of Ventoux */}
      <polygon
        points="60,160 80,90 100,105 130,70 160,88 190,65 210,78 220,160"
        fill="hsl(215 18% 22%)" />
      {/* white rock cap */}
      <polygon
        points="115,82 130,70 145,76 140,88 125,92"
        fill="hsl(215 8% 55%)" fillOpacity="0.5" />
      {/* radio mast at summit */}
      <line x1="130" y1="70" x2="130" y2="48" stroke="hsl(215 26% 40%)" strokeWidth="1.2" />
      <line x1="126" y1="55" x2="134" y2="55" stroke="hsl(215 26% 36%)" strokeWidth="0.8" />
      <circle cx="130" cy="48" r="2" fill="hsl(38 90% 56%)" />
      {/* switchback route up Ventoux */}
      <path
        d="M8 155 L25 145 L55 138 L60 128 L38 124 L42 114 L68 112 L90 118 L88 106 L65 100 L70 90 L95 88 L112 96 L110 84 L90 78 L95 70 L118 70 L130 72"
        stroke="#22d3ee" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity="0.9" />
      <circle cx="130" cy="72" r="4" fill="#22d3ee" />
      <circle cx="8" cy="155" r="3" fill="hsl(158 80% 42%)" />
      {/* summit badge */}
      <rect x="190" y="116" width="82" height="36" rx="6"
        fill="hsl(215 55% 4% / 0.9)" stroke="hsl(195 92% 56% / 0.22)" strokeWidth="0.8" />
      <text x="201" y="132" fontSize="8.5" fill="hsl(215 8% 75%)" fontFamily="monospace" fontWeight="900">Ventoux</text>
      <text x="201" y="144" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">1,912m summit</text>
    </svg>
  );
}

// ── Alpine Storm / Stelvio ──────────────────────────────────────────────────
export function AlpineStormScene({ title = 'Stelvio Pass in an alpine storm', ...props }: SceneProps) {
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="storm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(220 30% 6%)" />
          <stop offset="100%" stopColor="hsl(220 40% 12%)" />
        </linearGradient>
        <radialGradient id="lightning-glow" cx="60%" cy="35%" r="25%">
          <stop offset="0%" stopColor="hsl(260 80% 70%)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="280" height="160" fill="url(#storm-sky)" />
      <rect width="280" height="160" fill="url(#lightning-glow)" />
      {/* storm clouds — dark masses */}
      {[
        { cx: 60, cy: 28, rx: 55, ry: 18 },
        { cx: 160, cy: 22, rx: 65, ry: 20 },
        { cx: 240, cy: 32, rx: 45, ry: 15 },
      ].map((c, i) => (
        <ellipse key={i} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry}
          fill="hsl(220 30% 14%)" fillOpacity="0.8" />
      ))}
      {/* lightning bolt */}
      <polyline points="166,22 162,38 168,36 160,54"
        stroke="hsl(260 80% 80%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        fill="none" strokeOpacity="0.7" />
      {/* snow/rain mix */}
      {Array.from({ length: 25 }, (_, i) => ({
        x: (i * 43) % 280,
        y: (i * 31 + 10) % 140,
        angle: -15 + (i % 5) * 5,
      })).map((r, i) => (
        <line key={i}
          x1={r.x} y1={r.y}
          x2={r.x - 3} y2={r.y + 10}
          stroke="hsl(210 40% 80%)" strokeWidth="0.5" strokeOpacity="0.2" />
      ))}
      {/* Stelvio switchbacks — iconic 48 hairpins */}
      <path
        d="M10 152 L30 142 L55 136 L52 126 L28 122 L32 112 L58 109 L76 116 L72 104 L48 100 L54 90 L78 88 L94 96 L90 84 L66 80 L72 70 L96 68 L110 76 L106 64 L84 60 L90 50 L112 50 L124 58 L120 46 L100 42 L106 32 L128 32 L138 40"
        stroke="#22d3ee" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity="0.9" />
      {/* mountain bulk */}
      <polygon
        points="0,160 15,105 45,118 70,96 100,110 135,82 165,98 200,74 230,90 265,70 280,82 280,160"
        fill="hsl(220 30% 9%)" />
      <circle cx="138" cy="40" r="4" fill="#22d3ee" />
      <circle cx="10" cy="152" r="3" fill="hsl(158 80% 42%)" />
      {/* badge */}
      <rect x="186" y="12" width="86" height="38" rx="6"
        fill="hsl(220 30% 5% / 0.9)" stroke="hsl(260 80% 60% / 0.3)" strokeWidth="0.8" />
      <text x="197" y="28" fontSize="8.5" fill="hsl(260 60% 75%)" fontFamily="monospace" fontWeight="900">Stelvio</text>
      <text x="197" y="39" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">48 hairpins</text>
    </svg>
  );
}

// ── Alpe d'Huez / Tour Stage Finish ────────────────────────────────────────
export function AlpeHuezScene({ title = "Alpe d'Huez — Tour de France finish", ...props }: SceneProps) {
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="alpe-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(215 60% 6%)" />
          <stop offset="100%" stopColor="hsl(215 50% 10%)" />
        </linearGradient>
        <radialGradient id="alpe-crowd-glow" cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.05" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="280" height="160" fill="url(#alpe-sky)" />
      <rect width="280" height="160" fill="url(#alpe-crowd-glow)" />
      {/* stars */}
      {[[20, 14], [55, 8], [90, 18], [130, 10], [175, 16], [210, 8], [250, 14]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill="white" fillOpacity="0.5" />
      ))}
      {/* mountain silhouette */}
      <polygon
        points="0,160 0,95 35,78 65,90 100,70 135,82 170,60 205,74 240,58 280,68 280,160"
        fill="hsl(215 40% 8%)" />
      {/* spectator wall (crowd along road) */}
      {Array.from({ length: 28 }, (_, i) => {
        const x = 10 + i * 9.5;
        const baseY = 105 - i * 1.2;
        return (
          <g key={i}>
            <circle cx={x} cy={baseY - 5} r="2.8"
              fill={['#22d3ee', 'hsl(38 90% 56%)', 'hsl(158 80% 42%)', 'hsl(280 70% 60%)', 'hsl(25 95% 55%)'][i % 5]}
              fillOpacity="0.75" />
            <rect x={x - 2.5} y={baseY - 1} width="5" height="7" rx="1"
              fill={i % 2 === 0 ? 'hsl(215 35% 18%)' : 'hsl(215 35% 22%)'}
              strokeWidth="0" />
          </g>
        );
      })}
      {/* Alpe d'Huez 21 hairpins */}
      <path
        d="M12 152 L30 145 L52 140 L50 132 L30 128 L35 120 L56 118 L70 124 L68 114 L48 110 L52 100 L74 98 L88 106 L84 96 L62 92 L66 82 L88 80 L102 88 L98 78 L76 74 L82 64 L104 64 L116 72 L112 60 L92 56 L98 46 L120 48 L132 56 L128 44 L108 40 L115 30 L136 32 L144 42"
        stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity="0.95" />
      {/* finish banner */}
      <rect x="136" y="36" width="40" height="14" rx="2"
        fill="hsl(25 95% 50%)" fillOpacity="0.9" />
      <text x="156" y="46" textAnchor="middle" fontSize="7" fill="white"
        fontFamily="monospace" fontWeight="900">FINISH</text>
      <circle cx="144" cy="42" r="4" fill="#22d3ee" />
      <circle cx="12" cy="152" r="3" fill="hsl(158 80% 42%)" />
      {/* badge */}
      <rect x="186" y="110" width="86" height="38" rx="6"
        fill="hsl(215 55% 5% / 0.9)" stroke="hsl(25 95% 55% / 0.3)" strokeWidth="0.8" />
      <text x="197" y="127" fontSize="7.5" fill="hsl(25 95% 60%)" fontFamily="monospace" fontWeight="900">Alpe d'Huez</text>
      <text x="197" y="139" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">21 hairpins</text>
    </svg>
  );
}

// ── Coastal Rolling Stage ───────────────────────────────────────────────────
export function CoastalStageScene({ title = 'Rolling coastal stage at dawn', ...props }: SceneProps) {
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="coast-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(215 60% 5%)" />
          <stop offset="50%" stopColor="hsl(20 50% 10%)" />
          <stop offset="100%" stopColor="hsl(215 55% 8%)" />
        </linearGradient>
        <radialGradient id="coast-dawn" cx="30%" cy="75%" r="40%">
          <stop offset="0%" stopColor="hsl(25 80% 40%)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="coast-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(210 65% 12%)" />
          <stop offset="100%" stopColor="hsl(210 70% 6%)" />
        </linearGradient>
      </defs>
      <rect width="280" height="160" fill="url(#coast-sky)" />
      <rect width="280" height="160" fill="url(#coast-dawn)" />
      {/* sea */}
      <rect x="0" y="118" width="280" height="42" fill="url(#coast-sea)" />
      {/* horizon glow */}
      <ellipse cx="84" cy="118" rx="90" ry="12" fill="hsl(25 80% 40%)" fillOpacity="0.18" />
      {/* sun just rising */}
      <circle cx="84" cy="116" r="12" fill="hsl(30 90% 60%)" fillOpacity="0.5" />
      {/* sea waves */}
      {[126, 134, 142].map((y, i) => (
        <path key={i}
          d={`M0 ${y} Q35 ${y - 3} 70 ${y} Q105 ${y + 3} 140 ${y} Q175 ${y - 3} 210 ${y} Q245 ${y + 3} 280 ${y}`}
          stroke="hsl(210 60% 25%)" strokeWidth="0.6" strokeOpacity={0.4 - i * 0.1} fill="none" />
      ))}
      {/* coastal hills */}
      <polygon
        points="0,118 0,80 30,65 55,75 80,55 110,68 140,50 170,62 200,45 230,58 260,42 280,52 280,118"
        fill="hsl(215 38% 9%)" />
      {/* undulating road following the coast */}
      <path
        d="M0 110 Q20 100 40 104 Q60 108 80 98 Q100 88 120 92 Q140 96 160 86 Q180 76 200 80 Q220 84 240 74 Q255 68 272 72"
        stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" strokeOpacity="0.9" />
      <circle cx="0" cy="110" r="3.5" fill="hsl(158 80% 42%)" />
      <circle cx="272" cy="72" r="3.5" fill="#22d3ee" />
      {/* palm/tree silhouettes on hills */}
      {[[45, 73], [115, 66], [205, 43]].map(([x, y], i) => (
        <g key={i}>
          <line x1={x} y1={y} x2={x} y2={y - 12} stroke="hsl(215 30% 20%)" strokeWidth="1.2" />
          <circle cx={x} cy={y - 14} r="4" fill="hsl(215 30% 18%)" />
        </g>
      ))}
      {/* badge */}
      <rect x="168" y="12" width="104" height="38" rx="6"
        fill="hsl(215 55% 4% / 0.9)" stroke="hsl(195 92% 56% / 0.2)" strokeWidth="0.8" />
      <text x="178" y="28" fontSize="8" fill="#22d3ee" fontFamily="monospace" fontWeight="900">Côte d'Azur</text>
      <text x="178" y="40" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">rolling stage</text>
    </svg>
  );
}
