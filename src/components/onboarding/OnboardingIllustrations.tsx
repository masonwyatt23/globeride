/**
 * OnboardingIllustrations — bespoke SVG scene illustrations for each
 * onboarding step. One illustration per concept step:
 *
 *   RealEarthScene    — photoreal 3D globe with route polyline
 *   TrainerScene      — smart trainer + Bluetooth waves + gradient bar
 *   PelotonScene      — three riders in peloton formation, P2P arc
 *   CoachScene        — CTL/ATL fitness chart + AI neural motif
 *   CompanionScene    — phone mirror + broadcast waves
 *
 * Style matches Wave 33 (SceneIllustrations.tsx):
 *   viewBox 280×160 · dark hsl(220 55% 4-8%) backgrounds · #22d3ee accents
 *   hsl(158 80% 42%) start-dot · monospace badge overlays · inline <title>
 *
 * All illustrations are self-contained inline SVG; no external deps.
 */

import type { SVGProps } from 'react';

type IllustrationProps = SVGProps<SVGSVGElement> & { title?: string };

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 280 160',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  className: 'w-full h-full',
};

// ── Real Earth — photoreal globe with GPX route polyline ────────────────────
export function RealEarthScene({
  title = 'Photoreal 3D globe with a cycling route',
  ...props
}: IllustrationProps) {
  return (
    <svg {...base} {...props} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <linearGradient id="re-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(220 55% 4%)" />
          <stop offset="55%" stopColor="hsl(215 50% 7%)" />
          <stop offset="100%" stopColor="hsl(210 45% 10%)" />
        </linearGradient>
        <radialGradient id="re-globe-fill" cx="42%" cy="42%" r="50%">
          <stop offset="0%" stopColor="hsl(210 60% 18%)" />
          <stop offset="60%" stopColor="hsl(215 55% 10%)" />
          <stop offset="100%" stopColor="hsl(220 50% 6%)" />
        </radialGradient>
        <radialGradient id="re-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.12" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="re-sunspot" cx="38%" cy="36%" r="30%">
          <stop offset="0%" stopColor="hsl(210 80% 80%)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <clipPath id="re-globe-clip">
          <circle cx="116" cy="80" r="64" />
        </clipPath>
      </defs>

      {/* Starfield */}
      <rect width="280" height="160" fill="url(#re-sky)" />
      {[
        [12, 8], [40, 14], [68, 6], [92, 20], [200, 10], [230, 18],
        [258, 6], [24, 36], [52, 28], [180, 30], [246, 28], [270, 40],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.1 : 0.7}
          fill="white" fillOpacity={0.35 + (i % 4) * 0.1} />
      ))}

      {/* Globe body */}
      <circle cx="116" cy="80" r="64" fill="url(#re-globe-fill)" />
      <circle cx="116" cy="80" r="64" fill="url(#re-glow)" />
      <circle cx="116" cy="80" r="64" fill="url(#re-sunspot)" />

      {/* Continent silhouettes (clipped) */}
      <g clipPath="url(#re-globe-clip)">
        {/* Europe / west patch */}
        <path d="M80 52 Q90 46 102 50 Q110 54 108 62 Q104 70 96 72 Q86 74 80 68 Z"
          fill="hsl(158 60% 14%)" fillOpacity="0.65" />
        {/* Africa patch */}
        <path d="M96 72 Q106 70 110 80 Q114 92 108 104 Q100 114 90 112 Q80 108 78 96 Q76 84 82 76 Z"
          fill="hsl(158 55% 12%)" fillOpacity="0.60" />
        {/* Scandinavia sliver */}
        <path d="M98 38 Q104 34 108 40 Q106 48 100 50 Z"
          fill="hsl(158 55% 13%)" fillOpacity="0.55" />
        {/* Ocean texture lines */}
        {[56, 68, 80, 92, 104].map((y, i) => (
          <line key={i} x1="52" y1={y} x2="178" y2={y}
            stroke="hsl(210 60% 22%)" strokeWidth="0.5" strokeOpacity="0.25" />
        ))}
        {/* Meridians */}
        {[86, 116, 146].map((x, i) => (
          <ellipse key={i} cx="116" cy="80" rx={Math.abs(x - 116) || 1} ry="64"
            stroke="hsl(210 55% 20%)" strokeWidth="0.5" strokeOpacity="0.18" fill="none" />
        ))}
        {/* Equator */}
        <ellipse cx="116" cy="80" rx="64" ry="14"
          stroke="hsl(210 55% 28%)" strokeWidth="0.6" strokeOpacity="0.25" fill="none" />

        {/* GPX route polyline — Alpine switchbacks */}
        <path
          d="M68 108 L80 100 L96 96 L92 86 L76 82 L80 72 L100 70 L114 78 L110 66 L92 62 L96 52 L116 52 L128 60"
          stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          strokeOpacity="0.95" fill="none" />
        {/* Start dot */}
        <circle cx="68" cy="108" r="3.5" fill="hsl(158 80% 42%)" />
        {/* Rider dot at head */}
        <circle cx="128" cy="60" r="4.5" fill="#22d3ee" />
        <circle cx="128" cy="60" r="7" fill="#22d3ee" fillOpacity="0.18" />
      </g>

      {/* Globe rim */}
      <circle cx="116" cy="80" r="64"
        stroke="hsl(210 60% 35%)" strokeWidth="1" strokeOpacity="0.35" fill="none" />

      {/* Orbit ring */}
      <ellipse cx="116" cy="80" rx="76" ry="22"
        stroke="#22d3ee" strokeWidth="1.2" strokeDasharray="5 4"
        strokeOpacity="0.40" fill="none" />
      {/* Satellite dot on ring */}
      <circle cx="192" cy="80" r="3" fill="#22d3ee" fillOpacity="0.75" />

      {/* Badge */}
      <rect x="186" y="112" width="86" height="38" rx="6"
        fill="hsl(220 55% 4% / 0.88)" stroke="hsl(195 92% 56% / 0.22)" strokeWidth="0.8" />
      <text x="196" y="128" fontSize="8.5" fill="#22d3ee" fontFamily="monospace" fontWeight="900">Real Earth</text>
      <text x="196" y="141" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">3D Tiles · moods</text>
    </svg>
  );
}

// ── Smart Trainer — FTMS trainer + BT waves + gradient resistance bar ────────
export function TrainerScene({
  title = 'Smart trainer connected via Bluetooth with gradient resistance',
  ...props
}: IllustrationProps) {
  return (
    <svg {...base} {...props} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <linearGradient id="tr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(245 40% 5%)" />
          <stop offset="100%" stopColor="hsl(220 45% 8%)" />
        </linearGradient>
        <linearGradient id="tr-resist" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(158 80% 42%)" />
          <stop offset="55%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="hsl(280 70% 60%)" />
        </linearGradient>
        <radialGradient id="tr-glow" cx="38%" cy="55%" r="45%">
          <stop offset="0%" stopColor="hsl(245 70% 55%)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <rect width="280" height="160" fill="url(#tr-sky)" />
      <rect width="280" height="160" fill="url(#tr-glow)" />

      {/* Floor shadow */}
      <ellipse cx="108" cy="148" rx="88" ry="8" fill="hsl(245 40% 3%)" fillOpacity="0.6" />

      {/* ── Bike silhouette ── */}
      {/* Rear wheel */}
      <circle cx="58" cy="116" r="34" stroke="hsl(215 35% 28%)" strokeWidth="2.5" fill="none" />
      <circle cx="58" cy="116" r="22" stroke="hsl(215 35% 22%)" strokeWidth="1.2" fill="none" />
      {/* Spokes rear */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={i}
            x1={58 + 6 * Math.cos(rad)} y1={116 + 6 * Math.sin(rad)}
            x2={58 + 22 * Math.cos(rad)} y2={116 + 22 * Math.sin(rad)}
            stroke="hsl(215 30% 24%)" strokeWidth="0.8" strokeOpacity="0.6" />
        );
      })}

      {/* Front wheel */}
      <circle cx="166" cy="116" r="34" stroke="hsl(215 35% 28%)" strokeWidth="2.5" fill="none" />
      <circle cx="166" cy="116" r="22" stroke="hsl(215 35% 22%)" strokeWidth="1.2" fill="none" />
      {/* Spokes front */}
      {[30, 90, 150, 210, 270, 330].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={i}
            x1={166 + 6 * Math.cos(rad)} y1={116 + 6 * Math.sin(rad)}
            x2={166 + 22 * Math.cos(rad)} y2={116 + 22 * Math.sin(rad)}
            stroke="hsl(215 30% 24%)" strokeWidth="0.8" strokeOpacity="0.6" />
        );
      })}

      {/* Frame — main triangle */}
      <polyline
        points="58,116 96,60 132,116"
        stroke="hsl(215 50% 45%)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        fill="none" />
      {/* Chain stay */}
      <line x1="58" y1="116" x2="130" y2="116"
        stroke="hsl(215 45% 38%)" strokeWidth="2.5" strokeLinecap="round" />
      {/* Fork */}
      <line x1="96" y1="60" x2="166" y2="116"
        stroke="hsl(215 50% 45%)" strokeWidth="3" strokeLinecap="round" />
      {/* Seat tube */}
      <line x1="96" y1="60" x2="96" y2="48"
        stroke="hsl(215 50% 42%)" strokeWidth="2.5" strokeLinecap="round" />
      {/* Saddle */}
      <line x1="86" y1="46" x2="110" y2="46"
        stroke="hsl(215 45% 52%)" strokeWidth="3" strokeLinecap="round" />
      {/* Handlebars */}
      <line x1="160" y1="74" x2="172" y2="74"
        stroke="hsl(215 45% 50%)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="166" y1="78" x2="166" y2="68"
        stroke="hsl(215 45% 48%)" strokeWidth="2.5" strokeLinecap="round" />

      {/* Trainer stand arms */}
      <line x1="58" y1="128" x2="28" y2="150"
        stroke="hsl(215 30% 32%)" strokeWidth="3" strokeLinecap="round" />
      <line x1="58" y1="128" x2="88" y2="150"
        stroke="hsl(215 30% 32%)" strokeWidth="3" strokeLinecap="round" />
      <line x1="28" y1="150" x2="88" y2="150"
        stroke="hsl(215 30% 28%)" strokeWidth="2" strokeLinecap="round" />

      {/* ── Gradient resistance bar ── */}
      <rect x="16" y="10" width="118" height="12" rx="6"
        fill="hsl(220 40% 10%)" />
      <rect x="16" y="10" width="78" height="12" rx="6"
        fill="url(#tr-resist)" fillOpacity="0.85" />
      <text x="140" y="20" fontSize="8" fill="hsl(215 18% 52%)" fontFamily="monospace">6.2 %</text>

      {/* ── Bluetooth badge + waves ── */}
      <circle cx="222" cy="64" r="28"
        fill="hsl(220 55% 6%)" stroke="hsl(215 60% 28%)" strokeWidth="0.8" />
      {/* BT symbol */}
      <path
        d="M222 48 L230 56 L222 64 M222 64 L230 72 L222 80 M222 48 L222 80"
        stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* BT waves */}
      <path d="M240 52 Q250 64 240 76" stroke="#22d3ee" strokeWidth="1.5"
        strokeLinecap="round" fill="none" strokeOpacity="0.65" />
      <path d="M246 46 Q260 64 246 82" stroke="#22d3ee" strokeWidth="1.2"
        strokeLinecap="round" fill="none" strokeOpacity="0.40" />
      <path d="M252 40 Q270 64 252 88" stroke="#22d3ee" strokeWidth="0.9"
        strokeLinecap="round" fill="none" strokeOpacity="0.22" />

      {/* Badge */}
      <rect x="186" y="112" width="86" height="38" rx="6"
        fill="hsl(220 55% 4% / 0.88)" stroke="hsl(195 92% 56% / 0.22)" strokeWidth="0.8" />
      <text x="196" y="128" fontSize="8" fill="#22d3ee" fontFamily="monospace" fontWeight="900">FTMS trainer</text>
      <text x="196" y="141" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">real gradient</text>
    </svg>
  );
}

// ── Peloton — three riders in formation, P2P arc, draft lines ───────────────
export function PelotonScene({
  title = 'Three riders in peloton formation connected peer-to-peer',
  ...props
}: IllustrationProps) {
  return (
    <svg {...base} {...props} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <linearGradient id="pel-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(10 45% 5%)" />
          <stop offset="45%" stopColor="hsl(15 40% 7%)" />
          <stop offset="100%" stopColor="hsl(220 40% 8%)" />
        </linearGradient>
        <radialGradient id="pel-lead-glow" cx="50%" cy="55%" r="30%">
          <stop offset="0%" stopColor="hsl(25 90% 55%)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="pel-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(220 35% 12%)" />
          <stop offset="100%" stopColor="hsl(220 30% 7%)" />
        </linearGradient>
      </defs>

      <rect width="280" height="160" fill="url(#pel-sky)" />
      <rect width="280" height="160" fill="url(#pel-lead-glow)" />

      {/* Mountain silhouette */}
      <polygon
        points="0,105 20,80 45,92 70,72 100,84 130,62 160,76 190,58 220,72 250,55 280,68 280,160 0,160"
        fill="hsl(220 35% 9%)" />

      {/* Road */}
      <rect x="0" y="128" width="280" height="32" fill="url(#pel-road)" />
      {/* Road center dashes */}
      {[10, 50, 90, 130, 170, 210, 250].map((x, i) => (
        <rect key={i} x={x} y="143" width="28" height="2.5" rx="1.25"
          fill="hsl(38 80% 50%)" fillOpacity="0.35" />
      ))}

      {/* ── Lead rider ── */}
      {/* Body */}
      <ellipse cx="140" cy="118" rx="10" ry="7"
        fill="hsl(25 90% 18%)" stroke="hsl(25 90% 40%)" strokeWidth="1" />
      {/* Head */}
      <circle cx="148" cy="112" r="5"
        fill="hsl(25 90% 45%)" />
      {/* Wheel */}
      <circle cx="124" cy="124" r="8"
        stroke="hsl(215 35% 30%)" strokeWidth="2" fill="none" />
      <circle cx="156" cy="124" r="8"
        stroke="hsl(215 35% 30%)" strokeWidth="2" fill="none" />
      {/* Draft aura */}
      <ellipse cx="128" cy="120" rx="14" ry="6"
        fill="#22d3ee" fillOpacity="0.06" />

      {/* ── Draft rider left (Niki) ── */}
      <ellipse cx="100" cy="122" rx="9" ry="6"
        fill="hsl(195 70% 14%)" stroke="#22d3ee" strokeWidth="0.9" strokeOpacity="0.6" />
      <circle cx="108" cy="117" r="4.5"
        fill="#22d3ee" fillOpacity="0.7" />
      <circle cx="84" cy="126" r="7"
        stroke="hsl(215 30% 28%)" strokeWidth="1.8" fill="none" />
      <circle cx="115" cy="126" r="7"
        stroke="hsl(215 30% 28%)" strokeWidth="1.8" fill="none" />

      {/* ── Draft rider right (Yuki) ── */}
      <ellipse cx="180" cy="122" rx="9" ry="6"
        fill="hsl(280 55% 14%)" stroke="hsl(280 70% 55%)" strokeWidth="0.9" strokeOpacity="0.6" />
      <circle cx="188" cy="117" r="4.5"
        fill="hsl(280 70% 55%)" fillOpacity="0.7" />
      <circle cx="164" cy="126" r="7"
        stroke="hsl(215 30% 28%)" strokeWidth="1.8" fill="none" />
      <circle cx="195" cy="126" r="7"
        stroke="hsl(215 30% 28%)" strokeWidth="1.8" fill="none" />

      {/* Draft lines from lead to followers */}
      <path d="M126 120 Q116 120 112 120" stroke="#22d3ee" strokeWidth="1"
        strokeDasharray="3 3" strokeOpacity="0.50" fill="none" />
      <path d="M156 120 Q168 120 172 120" stroke="hsl(280 70% 55%)" strokeWidth="1"
        strokeDasharray="3 3" strokeOpacity="0.45" fill="none" />

      {/* ── P2P WebRTC arc ── */}
      <path d="M18 28 Q140 8 262 28"
        stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="5 4"
        strokeOpacity="0.40" fill="none" />
      {/* Node dots on arc */}
      <circle cx="18" cy="28" r="4" fill="hsl(215 50% 32%)" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.6" />
      <circle cx="140" cy="12" r="3.5" fill="hsl(215 50% 28%)" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.5" />
      <circle cx="262" cy="28" r="4" fill="hsl(215 50% 32%)" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.6" />
      {/* WebRTC label */}
      <text x="110" y="10" fontSize="7" fill="#22d3ee" fontFamily="monospace" fillOpacity="0.65">WebRTC</text>

      {/* Badge */}
      <rect x="186" y="30" width="86" height="38" rx="6"
        fill="hsl(220 55% 4% / 0.88)" stroke="hsl(25 90% 55% / 0.25)" strokeWidth="0.8" />
      <text x="196" y="46" fontSize="8" fill="hsl(25 90% 60%)" fontFamily="monospace" fontWeight="900">P2P Racing</text>
      <text x="196" y="59" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">drafting physics</text>
    </svg>
  );
}

// ── AI Coach — fitness chart + neural motif ──────────────────────────────────
export function CoachScene({
  title = 'AI coach showing fitness chart with CTL and ATL curves',
  ...props
}: IllustrationProps) {
  return (
    <svg {...base} {...props} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <linearGradient id="coach-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(155 40% 4%)" />
          <stop offset="100%" stopColor="hsl(215 45% 8%)" />
        </linearGradient>
        <radialGradient id="coach-brain-glow" cx="75%" cy="35%" r="30%">
          <stop offset="0%" stopColor="hsl(158 80% 42%)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="coach-ctl-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="coach-atl-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(158 80% 42%)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="hsl(158 80% 42%)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="280" height="160" fill="url(#coach-sky)" />
      <rect width="280" height="160" fill="url(#coach-brain-glow)" />

      {/* Chart area */}
      {/* Grid lines */}
      {[40, 60, 80, 100, 120].map((y, i) => (
        <line key={i} x1="28" y1={y} x2="200" y2={y}
          stroke="hsl(215 30% 18%)" strokeWidth="0.6" strokeOpacity="0.5" />
      ))}
      {/* Axes */}
      <line x1="28" y1="130" x2="200" y2="130"
        stroke="hsl(215 30% 28%)" strokeWidth="1.2" />
      <line x1="28" y1="30" x2="28" y2="130"
        stroke="hsl(215 30% 28%)" strokeWidth="1.2" />

      {/* CTL area fill */}
      <path
        d="M28,118 L56,112 L84,102 L112,92 L140,80 L168,68 L196,55 L196,130 L28,130 Z"
        fill="url(#coach-ctl-area)" />
      {/* ATL area fill */}
      <path
        d="M28,122 L56,118 L84,112 L112,105 L140,98 L168,90 L196,80 L196,130 L28,130 Z"
        fill="url(#coach-atl-area)" />

      {/* CTL line (fitness, solid aqua) */}
      <polyline
        points="28,118 56,112 84,102 112,92 140,80 168,68 196,55"
        stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        fill="none" />
      {/* ATL line (fatigue, dashed green) */}
      <polyline
        points="28,122 56,118 84,112 112,105 140,98 168,90 196,80"
        stroke="hsl(158 80% 42%)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="4 3" fill="none" />
      {/* TSB zone fill between lines */}

      {/* Axis labels */}
      <text x="14" y="60" fontSize="7" fill="hsl(215 18% 46%)" fontFamily="monospace" textAnchor="middle">CTL</text>
      <text x="14" y="105" fontSize="7" fill="hsl(158 60% 38%)" fontFamily="monospace" textAnchor="middle">ATL</text>
      {/* Week ticks */}
      {[28, 56, 84, 112, 140, 168, 196].map((x, i) => (
        <g key={i}>
          <line x1={x} y1="130" x2={x} y2="134" stroke="hsl(215 25% 32%)" strokeWidth="0.8" />
          <text x={x} y="142" fontSize="6" fill="hsl(215 18% 42%)" fontFamily="monospace" textAnchor="middle">
            {`W${i + 1}`}
          </text>
        </g>
      ))}

      {/* ── Neural / AI motif (top-right) ── */}
      {/* Central node */}
      <circle cx="238" cy="64" r="12"
        fill="hsl(158 50% 8%)" stroke="hsl(158 80% 42%)" strokeWidth="1.2" strokeOpacity="0.7" />
      <text x="238" y="68" fontSize="9" fill="hsl(158 80% 55%)"
        fontFamily="monospace" textAnchor="middle" fontWeight="900">AI</text>
      {/* Satellite nodes */}
      {[
        [220, 40], [256, 42], [260, 84], [220, 86], [238, 28],
      ].map(([x, y], i) => (
        <g key={i}>
          <line x1="238" y1="64" x2={x} y2={y}
            stroke="hsl(158 70% 38%)" strokeWidth="0.9" strokeOpacity="0.45" />
          <circle cx={x} cy={y} r={i === 4 ? 4 : 3.5}
            fill="hsl(158 40% 8%)" stroke="hsl(158 70% 38%)" strokeWidth="0.9" strokeOpacity="0.6" />
        </g>
      ))}
      {/* Pulse ring on AI node */}
      <circle cx="238" cy="64" r="18"
        fill="none" stroke="hsl(158 80% 42%)" strokeWidth="0.8" strokeOpacity="0.22" />

      {/* "Form peak" annotation */}
      <line x1="196" y1="55" x2="210" y2="42"
        stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.5" />
      <text x="212" y="40" fontSize="7" fill="#22d3ee" fontFamily="monospace">peak</text>

      {/* Badge */}
      <rect x="186" y="112" width="86" height="38" rx="6"
        fill="hsl(220 55% 4% / 0.88)" stroke="hsl(158 80% 42% / 0.25)" strokeWidth="0.8" />
      <text x="196" y="128" fontSize="8" fill="hsl(158 80% 52%)" fontFamily="monospace" fontWeight="900">AI Coach</text>
      <text x="196" y="141" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">CTL · ATL · TSB</text>
    </svg>
  );
}

// ── Companion Screen — phone mirror + broadcast waves ────────────────────────
export function CompanionScene({
  title = 'Phone companion screen mirroring heart rate and cadence',
  ...props
}: IllustrationProps) {
  return (
    <svg {...base} {...props} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <linearGradient id="comp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(200 45% 4%)" />
          <stop offset="100%" stopColor="hsl(215 45% 8%)" />
        </linearGradient>
        <radialGradient id="comp-screen-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.07" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="comp-screen-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(215 55% 8%)" />
          <stop offset="100%" stopColor="hsl(215 60% 5%)" />
        </linearGradient>
      </defs>

      <rect width="280" height="160" fill="url(#comp-sky)" />

      {/* Desktop glow — source app */}
      <rect x="8" y="20" width="130" height="90" rx="6"
        fill="hsl(215 50% 6%)" stroke="hsl(215 40% 22%)" strokeWidth="1" />
      <rect x="8" y="20" width="130" height="90" rx="6" fill="url(#comp-screen-glow)" />
      {/* Desktop label bar */}
      <rect x="8" y="20" width="130" height="10" rx="3"
        fill="hsl(215 40% 10%)" />
      <circle cx="16" cy="25" r="2.5" fill="hsl(0 75% 48%)" fillOpacity="0.6" />
      <circle cx="24" cy="25" r="2.5" fill="hsl(38 90% 56%)" fillOpacity="0.6" />
      <circle cx="32" cy="25" r="2.5" fill="hsl(158 70% 44%)" fillOpacity="0.6" />
      <text x="73" y="27" fontSize="6.5" fill="hsl(215 20% 50%)"
        fontFamily="monospace" textAnchor="middle">GlobeRide</text>

      {/* Mini globe on desktop */}
      <circle cx="52" cy="68" r="22"
        fill="hsl(215 55% 9%)" stroke="hsl(210 50% 28%)" strokeWidth="0.8" />
      <ellipse cx="52" cy="68" rx="22" ry="7"
        stroke="hsl(210 50% 22%)" strokeWidth="0.5" fill="none" />
      <path d="M38 60 L46 56 L52 62 L46 68 L38 72 Z"
        fill="hsl(158 55% 12%)" fillOpacity="0.6" />
      {/* Mini route on globe */}
      <path d="M36 74 L42 68 L50 66 L48 60 L42 58 L46 52"
        stroke="#22d3ee" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
        fill="none" strokeOpacity="0.85" />
      <circle cx="46" cy="52" r="2.5" fill="#22d3ee" />

      {/* HUD metrics strip on desktop */}
      <rect x="16" y="93" width="114" height="12" rx="3"
        fill="hsl(215 45% 8%)" />
      <text x="24" y="102" fontSize="7.5" fill="#22d3ee" fontFamily="monospace" fontWeight="700">142W</text>
      <text x="60" y="102" fontSize="7.5" fill="hsl(38 90% 56%)" fontFamily="monospace" fontWeight="700">84rpm</text>
      <text x="98" y="102" fontSize="7.5" fill="hsl(0 75% 60%)" fontFamily="monospace" fontWeight="700">158bpm</text>

      {/* ── Broadcast arc ── */}
      <path d="M138 65 Q168 50 172 65" stroke="#22d3ee" strokeWidth="1.8"
        strokeLinecap="round" fill="none" strokeOpacity="0.70" />
      <path d="M138 65 Q172 40 178 65" stroke="#22d3ee" strokeWidth="1.2"
        strokeLinecap="round" fill="none" strokeOpacity="0.45" />
      <path d="M138 65 Q176 30 184 65" stroke="#22d3ee" strokeWidth="0.8"
        strokeLinecap="round" fill="none" strokeOpacity="0.22" />
      {/* Arrow head */}
      <polygon points="170,60 176,65 170,70"
        fill="#22d3ee" fillOpacity="0.6" />

      {/* ── Phone body ── */}
      <rect x="184" y="14" width="80" height="138" rx="10"
        fill="hsl(215 55% 7%)" stroke="hsl(215 45% 24%)" strokeWidth="1.2" />
      {/* Notch */}
      <rect x="212" y="14" width="24" height="8" rx="4"
        fill="hsl(215 50% 10%)" />
      {/* Screen */}
      <rect x="190" y="28" width="68" height="110" rx="4"
        fill="url(#comp-screen-bg)" />
      {/* Home bar */}
      <rect x="210" y="148" width="28" height="2.5" rx="1.25"
        fill="hsl(215 30% 30%)" />

      {/* Phone screen content */}
      {/* HR large number */}
      <text x="224" y="58" fontSize="22" fill="hsl(0 75% 60%)"
        fontFamily="monospace" fontWeight="900" textAnchor="middle">158</text>
      <text x="224" y="68" fontSize="7" fill="hsl(0 60% 50%)"
        fontFamily="monospace" textAnchor="middle">bpm</text>
      {/* HR pulse wave */}
      <polyline
        points="192,82 198,82 200,76 202,88 204,78 206,84 208,82 226,82"
        stroke="hsl(0 75% 55%)" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Cadence */}
      <text x="224" y="106" fontSize="16" fill="#22d3ee"
        fontFamily="monospace" fontWeight="700" textAnchor="middle">84</text>
      <text x="224" y="116" fontSize="7" fill="hsl(195 60% 45%)"
        fontFamily="monospace" textAnchor="middle">rpm</text>

      {/* Power */}
      <text x="224" y="134" fontSize="13" fill="hsl(38 90% 56%)"
        fontFamily="monospace" fontWeight="700" textAnchor="middle">142W</text>

      {/* Badge */}
      <rect x="8" y="118" width="120" height="32" rx="6"
        fill="hsl(220 55% 4% / 0.90)" stroke="hsl(195 92% 56% / 0.22)" strokeWidth="0.8" />
      <text x="18" y="131" fontSize="8" fill="#22d3ee" fontFamily="monospace" fontWeight="900">Companion</text>
      <text x="18" y="143" fontSize="7" fill="hsl(215 18% 52%)" fontFamily="monospace">BroadcastChannel sync</text>
    </svg>
  );
}
