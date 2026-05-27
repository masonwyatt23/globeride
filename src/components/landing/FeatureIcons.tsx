/**
 * FeatureIcons.tsx — bespoke SVG illustrations for FeatureGrid cards.
 * Each icon is 120×80 viewBox. Multi-stop gradients, proper proportions,
 * brand aqua #22d3ee accents, dark slate #0f172a backgrounds.
 *
 * All SVGs expose:
 *   - <title> for a11y (non-decorative usage)
 *   - animate?: boolean — enables subtle CSS keyframe animations (default off)
 *
 * No runtime computation, no requestAnimationFrame. Pure static SVG.
 */

import type { SVGProps } from 'react';

// ─── Keyframe styles injected once ─────────────────────────────────────────
const ANIM_STYLES = `
@keyframes fi-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes fi-pulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }
@keyframes fi-dash { to { stroke-dashoffset: -24; } }
@keyframes fi-glow { 0%,100% { opacity:0.7; } 50% { opacity:1; } }
@keyframes fi-wave { 0%,100% { transform:scaleY(1); } 50% { transform:scaleY(1.5); } }
@keyframes fi-blink { 0%,90%,100% { opacity:1; } 95% { opacity:0; } }
`;

let _stylesInjected = false;
function ensureStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = ANIM_STYLES;
  document.head.appendChild(s);
}

type IconProps = SVGProps<SVGSVGElement> & { title?: string; animate?: boolean };

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 120 80',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
};

// ── Globe / photoreal world ─────────────────────────────────────────────────
export function GlobeIcon({ title = 'Photoreal 3D world', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <radialGradient id="globe-bg" cx="38%" cy="34%" r="60%">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="55%" stopColor="#0c1f3a" />
          <stop offset="100%" stopColor="#050e1f" />
        </radialGradient>
        <radialGradient id="globe-atm" cx="35%" cy="30%" r="55%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="globe-land" cx="55%" cy="45%" r="45%">
          <stop offset="0%" stopColor="#1a4a2e" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#0d2a1a" stopOpacity="0.4" />
        </radialGradient>
        <filter id="globe-drop">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#22d3ee" floodOpacity="0.25" />
        </filter>
        <clipPath id="globe-clip">
          <circle cx="60" cy="40" r="28" />
        </clipPath>
      </defs>
      {/* sphere base */}
      <circle cx="60" cy="40" r="28" fill="url(#globe-bg)" filter="url(#globe-drop)" />
      <circle cx="60" cy="40" r="28" fill="url(#globe-atm)" />
      {/* land masses */}
      <g clipPath="url(#globe-clip)">
        <ellipse cx="52" cy="34" rx="12" ry="8" fill="url(#globe-land)" />
        <ellipse cx="70" cy="46" rx="9" ry="6" fill="url(#globe-land)" />
        <ellipse cx="44" cy="50" rx="6" ry="4" fill="url(#globe-land)" />
      </g>
      {/* latitude lines */}
      {([-12, 0, 12] as number[]).map((dy, i) => {
        const rx = Math.sqrt(Math.max(0, 784 - dy * dy));
        return (
          <ellipse key={i} cx="60" cy={40 + dy} rx={rx} ry="5"
            stroke="#22d3ee" strokeWidth="0.4" strokeOpacity="0.18"
            clipPath="url(#globe-clip)" />
        );
      })}
      {/* meridians */}
      {([0, 60, -60] as number[]).map((rot, i) => (
        <ellipse key={i} cx="60" cy="40" rx="4" ry="28"
          stroke="#22d3ee" strokeWidth="0.35" strokeOpacity="0.15"
          transform={`rotate(${rot} 60 40)`}
          clipPath="url(#globe-clip)" />
      ))}
      {/* glowing route arc */}
      <path d="M40 52 C48 44 55 41 60 38 C67 35 76 33 84 30"
        stroke="#22d3ee" strokeWidth="2" strokeLinecap="round"
        style={animate ? { animation: 'fi-dash 2s linear infinite', strokeDasharray: '6 3' } : undefined} />
      {/* start dot */}
      <circle cx="40" cy="52" r="2.8" fill="#34d399" />
      {/* end dot with pulse */}
      <circle cx="84" cy="30" r="5" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.3"
        style={animate ? { animation: 'fi-pulse 1.6s ease-in-out infinite' } : undefined} />
      <circle cx="84" cy="30" r="2.2" fill="#22d3ee" />
      {/* atmosphere ring */}
      <circle cx="60" cy="40" r="30" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.22" />
    </svg>
  );
}

// ── FTMS / smart trainer resistance ────────────────────────────────────────
export function FTMSIcon({ title = 'FTMS smart trainer resistance', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="ftms-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      {/* Trainer silhouette — rear wheel + cassette */}
      <circle cx="60" cy="50" r="20" stroke="hsl(215 26% 22%)" strokeWidth="1.5" />
      <circle cx="60" cy="50" r="13" stroke="hsl(215 26% 18%)" strokeWidth="1" />
      <circle cx="60" cy="50" r="3" fill="hsl(215 26% 28%)" />
      {/* spokes */}
      {[0, 45, 90, 135].map(a => (
        <line key={a} x1="60" y1="50"
          x2={60 + 18 * Math.cos((a * Math.PI) / 180)}
          y2={50 + 18 * Math.sin((a * Math.PI) / 180)}
          stroke="hsl(215 26% 20%)" strokeWidth="0.8" />
      ))}
      {/* BT symbol */}
      <path d="M52 20 L56 16 L64 22 L56 28 L64 34 L56 40"
        stroke="#22d3ee" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* grade bars */}
      {[0, 1, 2, 3].map(i => (
        <rect key={i} x={84 + i * 7} y={70 - (i + 1) * 9} width="5" height={(i + 1) * 9}
          rx="1.5" fill="url(#ftms-bar)" opacity={0.6 + i * 0.1} />
      ))}
      <text x="84" y="76" fontSize="5" fill="#22d3ee" fontFamily="monospace" fontWeight="700">+8.4%</text>
    </svg>
  );
}

// ── 3D Animated avatar — proper cyclist on a detailed bike frame ─────────────
export function AvatarIcon({ title = 'Animated 45-part 3D cyclist avatar', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  // Road cyclist in aero tuck on a fully detailed diamond frame.
  // Wheel centers: rear cx=34,cy=62  front cx=86,cy=62
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="av-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="av-kit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
        <radialGradient id="av-helmet" cx="40%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
        <radialGradient id="av-skin" cx="40%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>
        <filter id="av-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* ── BIKE FRAME ── */}
      {/* rear wheel */}
      <circle cx="34" cy="62" r="13" fill="#0f172a" stroke="#475569" strokeWidth="1.2" />
      <circle cx="34" cy="62" r="9.5" fill="none" stroke="#334155" strokeWidth="0.5" />
      {([0, 36, 72, 108, 144, 180, 216, 252, 288, 324] as number[]).map(a => (
        <line key={`rs${a}`}
          x1="34" y1="62"
          x2={34 + 11 * Math.cos((a * Math.PI) / 180)}
          y2={62 + 11 * Math.sin((a * Math.PI) / 180)}
          stroke="#64748b" strokeWidth="0.5" />
      ))}
      <circle cx="34" cy="62" r="2.5" fill="#94a3b8" />
      <circle cx="34" cy="62" r="1" fill="#22d3ee" />

      {/* front wheel */}
      <circle cx="86" cy="62" r="13" fill="#0f172a" stroke="#475569" strokeWidth="1.2" />
      <circle cx="86" cy="62" r="9.5" fill="none" stroke="#334155" strokeWidth="0.5" />
      {([0, 36, 72, 108, 144, 180, 216, 252, 288, 324] as number[]).map(a => (
        <line key={`fs${a}`}
          x1="86" y1="62"
          x2={86 + 11 * Math.cos((a * Math.PI) / 180)}
          y2={62 + 11 * Math.sin((a * Math.PI) / 180)}
          stroke="#64748b" strokeWidth="0.5"
          style={animate ? { transformOrigin: '86px 62px', animation: 'fi-spin 2s linear infinite' } : undefined}
        />
      ))}
      <circle cx="86" cy="62" r="2.5" fill="#94a3b8" />
      <circle cx="86" cy="62" r="1" fill="#22d3ee" />

      {/* seat tube */}
      <line x1="34" y1="62" x2="46" y2="38" stroke="url(#av-frame)" strokeWidth="2.2" strokeLinecap="round" />
      {/* top tube */}
      <line x1="46" y1="38" x2="72" y2="36" stroke="url(#av-frame)" strokeWidth="1.8" strokeLinecap="round" />
      {/* down tube */}
      <line x1="72" y1="36" x2="38" y2="58" stroke="url(#av-frame)" strokeWidth="2" strokeLinecap="round" />
      {/* chain stay */}
      <line x1="38" y1="58" x2="34" y2="62" stroke="url(#av-frame)" strokeWidth="1.6" strokeLinecap="round" />
      {/* fork */}
      <line x1="72" y1="36" x2="86" y2="62" stroke="url(#av-frame)" strokeWidth="1.8" strokeLinecap="round" />
      {/* seat stay */}
      <line x1="46" y1="38" x2="34" y2="62" stroke="url(#av-frame)" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.65" />

      {/* bottom bracket */}
      <circle cx="38" cy="58" r="3.5" fill="#475569" />
      <circle cx="38" cy="58" r="1.8" fill="#94a3b8" />
      {/* crank arm */}
      <line x1="38" y1="58" x2="44" y2="64" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      {/* pedal */}
      <rect x="41" y="63" width="6" height="2" rx="0.5" fill="#475569" />

      {/* saddle */}
      <path d="M42 37 Q46 34 52 35 Q50 38 42 37 Z" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
      <line x1="46" y1="38" x2="47" y2="35" stroke="#475569" strokeWidth="1.5" />

      {/* handlebar stem */}
      <line x1="72" y1="36" x2="74" y2="30" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" />
      {/* drop bars */}
      <path d="M68 30 Q74 28 80 30 Q81 33 79 34" stroke="#64748b" strokeWidth="1.6"
        fill="none" strokeLinecap="round" />
      {/* brake hoods */}
      <ellipse cx="70" cy="30" rx="2.5" ry="1.5" fill="#334155" />
      <ellipse cx="78" cy="30" rx="2.5" ry="1.5" fill="#334155" />

      {/* ── RIDER ── */}
      {/* torso — aero tuck, flat back */}
      <path d="M48 38 L66 28 L68 30 L50 42 Z" fill="url(#av-kit)" filter="url(#av-shadow)" />
      {/* kit stripe */}
      <line x1="50" y1="41" x2="66" y2="30" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.4" />

      {/* upper arm reaching to bars */}
      <path d="M50 40 L62 30" stroke="url(#av-skin)" strokeWidth="3.5" strokeLinecap="round" />
      {/* forearm */}
      <path d="M62 30 L70 30" stroke="url(#av-skin)" strokeWidth="2.8" strokeLinecap="round" />
      {/* glove */}
      <ellipse cx="70" cy="30" rx="2.5" ry="1.5" fill="#1e293b" stroke="#22d3ee" strokeWidth="0.6" />

      {/* hip / bib shorts */}
      <ellipse cx="48" cy="40" rx="5" ry="4" fill="#1e293b" />

      {/* right leg — power stroke down */}
      <path d="M48 42 L44 52 L46 60" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
      <path d="M48 42 L44 52 L46 60" stroke="url(#av-kit)" strokeWidth="2.5" strokeLinecap="round" />
      {/* left leg — recovery */}
      <path d="M49 42 L52 52 L50 60" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.55" />
      <path d="M49 42 L52 52 L50 60" stroke="url(#av-kit)" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.55" />
      {/* cycling shoes */}
      <rect x="42" y="58" width="7" height="3.5" rx="1" fill="#1e293b" stroke="#22d3ee" strokeWidth="0.5" />
      <rect x="47" y="58" width="7" height="3.5" rx="1" fill="#1e293b" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.4" />

      {/* ── HEAD & HELMET ── */}
      {/* head */}
      <circle cx="71" cy="23" r="5" fill="url(#av-skin)" />
      {/* aero helmet shell with vents */}
      <path d="M65.5 22 Q67 16 71 15 Q76 14 77 20 L77 22 Q74 24 71 24 Q68 24 65.5 22 Z"
        fill="url(#av-helmet)" />
      <line x1="68" y1="17" x2="68" y2="22" stroke="#c2410c" strokeWidth="0.6" strokeOpacity="0.45" />
      <line x1="71" y1="16" x2="71" y2="22" stroke="#c2410c" strokeWidth="0.6" strokeOpacity="0.45" />
      <line x1="74" y1="17" x2="74" y2="22" stroke="#c2410c" strokeWidth="0.6" strokeOpacity="0.45" />
      {/* cycling glasses */}
      <path d="M65.5 24 Q68 25.5 70 25 Q72 25.5 74 24.5"
        stroke="#0f172a" strokeWidth="1.2" fill="none" strokeLinecap="round" />

      {/* 45-parts badge */}
      <rect x="3" y="4" width="28" height="11" rx="3"
        fill="#22d3ee1a" stroke="#22d3ee50" strokeWidth="0.7" />
      <text x="17" y="12" textAnchor="middle" fontSize="5" fill="#22d3ee"
        fontFamily="monospace" fontWeight="700">45 parts</text>

      {/* motion lines */}
      <line x1="6" y1="52" x2="20" y2="52" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.5" strokeLinecap="round" />
      <line x1="8" y1="57" x2="18" y2="57" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.3" strokeLinecap="round" />
      <line x1="10" y1="61" x2="17" y2="61" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.2" strokeLinecap="round" />
    </svg>
  );
}

// ── 5 Camera modes ─────────────────────────────────────────────────────────
export function CamerasIcon({ title = '5 cinematic camera modes', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  const views = [
    { x: 8, y: 8, w: 28, h: 20, label: 'CHASE', active: true },
    { x: 40, y: 8, w: 28, h: 20, label: 'FPV', active: false },
    { x: 72, y: 8, w: 28, h: 20, label: 'DRONE', active: false },
    { x: 24, y: 34, w: 28, h: 20, label: 'HELI', active: false },
    { x: 56, y: 34, w: 28, h: 20, label: 'ORBIT', active: false },
  ];
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {views.map(v => (
        <g key={v.label}>
          <rect x={v.x} y={v.y} width={v.w} height={v.h} rx="3"
            fill={v.active ? 'hsl(195 92% 56% / 0.15)' : 'hsl(215 40% 8%)'}
            stroke={v.active ? '#22d3ee' : 'hsl(215 26% 18%)'}
            strokeWidth={v.active ? '1' : '0.7'} />
          {/* mini globe in each */}
          <circle cx={v.x + v.w / 2} cy={v.y + v.h / 2 - 2} r="5"
            fill="hsl(215 55% 14%)" stroke="hsl(215 26% 22%)" strokeWidth="0.5" />
          {/* rider dot */}
          <circle cx={v.x + v.w / 2} cy={v.y + v.h / 2 - 2} r="1.5"
            fill={v.active ? '#22d3ee' : 'hsl(215 26% 36%)'} />
          <text x={v.x + v.w / 2} y={v.y + v.h - 3} textAnchor="middle"
            fontSize="4" fill={v.active ? '#22d3ee' : 'hsl(215 18% 38%)'}
            fontFamily="monospace" fontWeight="700">
            {v.label}
          </text>
        </g>
      ))}
      {/* active indicator */}
      <circle cx="22" cy="9" r="2.5" fill="hsl(158 80% 42%)" />
      <text x="34" y="77" fontSize="6" fill="hsl(215 18% 45%)" textAnchor="middle" fontFamily="monospace">
        ← → switch
      </text>
    </svg>
  );
}

// ── .FIT export to Strava ───────────────────────────────────────────────────
export function FITExportIcon({ title = '.FIT export to Strava', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="fit-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="hsl(158 80% 42%)" />
        </linearGradient>
      </defs>
      {/* File icon */}
      <rect x="32" y="10" width="36" height="46" rx="4"
        fill="hsl(215 40% 8%)" stroke="hsl(215 26% 22%)" strokeWidth="1" />
      <path d="M58 10 L68 20 L58 20 Z" fill="hsl(215 26% 18%)" />
      <line x1="38" y1="28" x2="60" y2="28" stroke="hsl(215 26% 28%)" strokeWidth="1" />
      <line x1="38" y1="34" x2="58" y2="34" stroke="hsl(215 26% 28%)" strokeWidth="1" />
      <text x="50" y="48" textAnchor="middle" fontSize="7" fill="#22d3ee"
        fontFamily="monospace" fontWeight="900">.FIT</text>
      {/* Download arrow */}
      <line x1="60" y1="48" x2="72" y2="48" stroke="url(#fit-line)" strokeWidth="1.5" />
      <polyline points="68,44 72,48 68,52" stroke="url(#fit-line)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Strava S shape hint */}
      <path d="M78 40 Q85 37 82 44 Q79 51 86 48"
        stroke="hsl(25 95% 55%)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      {/* power trace at bottom */}
      <polyline points="10,72 22,68 30,70 40,62 52,60 66,65 80,58 90,55 110,52"
        stroke="url(#fit-line)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ── Structured workouts ─────────────────────────────────────────────────────
export function WorkoutsIcon({ title = 'Structured ERG workouts', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  const bars = [25, 40, 40, 70, 70, 70, 100, 100, 60, 60, 85, 85, 85, 40, 25];
  const zoneColors = (h: number) =>
    h >= 90 ? '#22d3ee' : h >= 70 ? 'hsl(195 92% 56% / 0.75)' : h >= 50 ? 'hsl(195 92% 56% / 0.5)' : 'hsl(195 92% 56% / 0.28)';
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* bars */}
      {bars.map((h, i) => (
        <rect key={i}
          x={8 + i * 7} y={65 - h * 0.42} width="5.5" height={h * 0.42}
          rx="1.5" fill={zoneColors(h)} />
      ))}
      {/* zone label */}
      <text x="8" y="76" fontSize="5" fill="hsl(215 18% 42%)" fontFamily="monospace">Z2</text>
      <text x="40" y="76" fontSize="5" fill="hsl(215 18% 42%)" fontFamily="monospace">Z4</text>
      <text x="56" y="76" fontSize="5" fill="#22d3ee" fontFamily="monospace" fontWeight="700">Z5</text>
      <text x="85" y="76" fontSize="5" fill="hsl(215 18% 42%)" fontFamily="monospace">Z4</text>
      {/* current interval badge */}
      <rect x="8" y="8" width="65" height="16" rx="4"
        fill="hsl(195 92% 56% / 0.1)" stroke="hsl(195 92% 56% / 0.3)" strokeWidth="0.8" />
      <circle cx="15" cy="16" r="2.5" fill="#22d3ee" />
      <text x="22" y="19" fontSize="6" fill="#22d3ee" fontFamily="monospace" fontWeight="700">295 W  ·  5:30</text>
    </svg>
  );
}

// ── PWA / installable ───────────────────────────────────────────────────────
export function PWAIcon({ title = 'Installable PWA — works offline', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* phone / tablet frame */}
      <rect x="36" y="6" width="32" height="52" rx="6"
        fill="hsl(215 40% 7%)" stroke="hsl(215 26% 22%)" strokeWidth="1.2" />
      <rect x="39" y="10" width="26" height="40" rx="3" fill="hsl(215 55% 10%)" />
      {/* home bar */}
      <rect x="49" y="52" width="6" height="2" rx="1" fill="hsl(215 26% 28%)" />
      {/* app icon on screen */}
      <rect x="47" y="20" width="10" height="10" rx="3"
        fill="hsl(215 55% 5%)" stroke="#22d3ee" strokeWidth="0.8" />
      <text x="52" y="28" textAnchor="middle" fontSize="6" fill="#22d3ee" fontWeight="900">G</text>
      {/* download arrow */}
      <line x1="75" y1="26" x2="84" y2="26" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.5" />
      <line x1="80" y1="22" x2="80" y2="32" stroke="#22d3ee" strokeWidth="1.2" />
      <polyline points="76,28 80,32 84,28" stroke="#22d3ee" strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* offline badge */}
      <rect x="8" y="52" width="26" height="14" rx="4"
        fill="hsl(215 40% 8%)" stroke="hsl(215 26% 20%)" strokeWidth="0.8" />
      <text x="21" y="62" textAnchor="middle" fontSize="5.5" fill="hsl(158 80% 42%)"
        fontFamily="monospace" fontWeight="700">OFFLINE</text>
    </svg>
  );
}

// ── WebRTC multi-rider ──────────────────────────────────────────────────────
export function MultiRiderIcon({ title = 'WebRTC multi-rider ghost peloton', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  // Three cyclists in a peloton with distinct colors + draft lines
  type RiderSpec = { cx: number; color: string; opacity: number };
  const riders: RiderSpec[] = [
    { cx: 22, color: '#22d3ee', opacity: 1    },
    { cx: 52, color: '#a78bfa', opacity: 0.9  },
    { cx: 82, color: '#34d399', opacity: 0.85 },
  ];

  function MiniRider({ cx, color, opacity }: RiderSpec) {
    const cy = 44;
    return (
      <g opacity={opacity}>
        <circle cx={cx - 10} cy={cy + 10} r="9" fill="#0f172a" stroke={color} strokeWidth="1" strokeOpacity="0.7" />
        <circle cx={cx + 10} cy={cy + 10} r="9" fill="#0f172a" stroke={color} strokeWidth="1" strokeOpacity="0.7" />
        <polygon points={`${cx - 10},${cy + 10} ${cx - 4},${cy - 2} ${cx + 10},${cy + 10}`}
          fill="none" stroke={color} strokeWidth="1.2" strokeOpacity="0.8" />
        <line x1={cx - 4} y1={cy - 2} x2={cx + 6} y2={cy - 2} stroke={color} strokeWidth="1" strokeOpacity="0.8" />
        <line x1={cx + 6} y1={cy - 2} x2={cx + 10} y2={cy + 10} stroke={color} strokeWidth="1.2" strokeOpacity="0.8" />
        <line x1={cx + 4} y1={cy - 4} x2={cx + 9} y2={cy - 4} stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
        <line x1={cx - 2} y1={cy - 2} x2={cx + 6} y2={cy - 8} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" />
        <circle cx={cx + 6} cy={cy - 11} r="3.5" fill="#1e293b" stroke={color} strokeWidth="0.8" />
        <line x1={cx + 4} y1={cy - 6} x2={cx + 7} y2={cy - 4} stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.8" />
      </g>
    );
  }

  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="rtc-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      {/* road */}
      <rect x="0" y="56" width="120" height="24" fill="#0f172a" />
      <line x1="60" y1="56" x2="60" y2="80" stroke="#334155" strokeWidth="0.8" strokeDasharray="4,4" />
      {/* draft lines */}
      <path d="M32 50 Q42 50 52 50" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.3" strokeDasharray="3,3"
        style={animate ? { animation: 'fi-dash 1.2s linear infinite' } : undefined} />
      <path d="M62 50 Q72 50 82 50" stroke="#a78bfa" strokeWidth="0.6" strokeOpacity="0.3" strokeDasharray="3,3"
        style={animate ? { animation: 'fi-dash 1.2s linear infinite' } : undefined} />
      {/* draft cones */}
      <path d="M32 42 L52 46 L32 50 Z" fill="#22d3ee" fillOpacity="0.05" />
      <path d="M62 42 L82 46 L62 50 Z" fill="#a78bfa" fillOpacity="0.05" />
      {/* riders */}
      {riders.map(r => <MiniRider key={r.cx} {...r} />)}
      {/* WebRTC badge */}
      <rect x="30" y="6" width="60" height="14" rx="4" fill="#1e0a3a" stroke="#a78bfa" strokeWidth="0.8" />
      <text x="60" y="15" textAnchor="middle" fontSize="5.5"
        fill="#a78bfa" fontFamily="monospace" fontWeight="700">WebRTC P2P</text>
    </svg>
  );
}

// ── AI live commentary ──────────────────────────────────────────────────────
export function CommentaryIcon({ title = 'AI live race commentary', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* speech bubble */}
      <path d="M16 12 Q16 8 20 8 L90 8 Q94 8 94 12 L94 38 Q94 42 90 42 L50 42 L44 50 L42 42 L20 42 Q16 42 16 38 Z"
        fill="hsl(215 40% 8%)" stroke="hsl(195 92% 56% / 0.35)" strokeWidth="1" />
      {/* text lines inside bubble */}
      <rect x="22" y="16" width="45" height="3" rx="1.5" fill="hsl(215 26% 28%)" />
      <rect x="22" y="22" width="58" height="3" rx="1.5" fill="hsl(215 26% 28%)" />
      <rect x="22" y="28" width="38" height="3" rx="1.5" fill="hsl(215 26% 28%)" />
      {/* mic icon */}
      <rect x="86" y="54" width="8" height="12" rx="4"
        fill="hsl(215 55% 10%)" stroke="#22d3ee" strokeWidth="1" />
      <path d="M84 62 Q84 70 90 70 Q96 70 96 62" stroke="#22d3ee" strokeWidth="1"
        strokeLinecap="round" fill="none" />
      <line x1="90" y1="70" x2="90" y2="74" stroke="#22d3ee" strokeWidth="1" />
      {/* sound waves */}
      {[4, 8, 12].map((r, i) => (
        <path key={i} d={`M98 66 Q${100 + r} 62 ${100 + r} 66 Q${100 + r} 70 98 66`}
          stroke="#22d3ee" strokeWidth="0.8" strokeOpacity={0.7 - i * 0.2} fill="none" />
      ))}
      {/* AI badge */}
      <rect x="16" y="54" width="24" height="14" rx="4"
        fill="hsl(195 92% 56% / 0.1)" stroke="hsl(195 92% 56% / 0.3)" strokeWidth="0.8" />
      <text x="28" y="64" textAnchor="middle" fontSize="6" fill="#22d3ee"
        fontFamily="monospace" fontWeight="900">AI</text>
    </svg>
  );
}

// ── AI training coach / pace bots ───────────────────────────────────────────
export function PaceBotsIcon({ title = 'AI pace bots with drafting', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* road perspective */}
      <path d="M10 70 L55 30 L65 30 L110 70 Z" fill="hsl(215 40% 7%)" stroke="hsl(215 26% 16%)" strokeWidth="0.8" />
      <line x1="60" y1="30" x2="60" y2="70" stroke="hsl(215 26% 22%)" strokeWidth="0.8" strokeDasharray="4,3" />
      {/* pace bot riders */}
      {[
        { x: 45, y: 56, color: 'hsl(38 90% 56%)' },
        { x: 55, y: 48, color: 'hsl(38 90% 56%)' },
        { x: 63, y: 42, color: 'hsl(38 90% 56%)' },
      ].map((r, i) => (
        <g key={i}>
          <circle cx={r.x} cy={r.y - 4} r="2.5" fill="hsl(215 55% 10%)" stroke={r.color} strokeWidth="0.8" />
          <circle cx={r.x} cy={r.y + 3} r="4" stroke={r.color} strokeWidth="0.8" fill="none" />
          <circle cx={r.x + 8} cy={r.y + 3} r="4" stroke={r.color} strokeWidth="0.8" fill="none" />
        </g>
      ))}
      {/* player rider */}
      <circle cx="75" cy="62" r="3" fill="hsl(215 55% 10%)" stroke="#22d3ee" strokeWidth="1" />
      <circle cx="75" cy="70" r="5" stroke="#22d3ee" strokeWidth="1" fill="none" />
      <circle cx="85" cy="70" r="5" stroke="#22d3ee" strokeWidth="1" fill="none" />
      {/* drafting aero cone */}
      <path d="M47 52 L75 60 L47 68 Z" fill="#22d3ee" fillOpacity="0.06" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.3" />
      {/* W/kg label */}
      <text x="92" y="46" fontSize="5.5" fill="hsl(38 90% 56%)" fontFamily="monospace" fontWeight="700">3.2</text>
      <text x="92" y="53" fontSize="4" fill="hsl(215 18% 42%)" fontFamily="monospace">W/kg</text>
    </svg>
  );
}

// ── Strava live segments ────────────────────────────────────────────────────
export function SegmentsIcon({ title = 'Strava live segments overlay', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* Elevation profile */}
      <polyline points="8,62 22,58 30,54 40,44 52,36 62,32 70,28 82,24 95,20 110,18"
        stroke="hsl(215 26% 28%)" strokeWidth="1.2" fill="none" />
      {/* segment highlight on climb */}
      <polyline points="40,44 52,36 62,32 70,28"
        stroke="hsl(25 95% 55%)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* segment start flag */}
      <line x1="40" y1="44" x2="40" y2="30" stroke="hsl(25 95% 55%)" strokeWidth="1" />
      <path d="M40 30 L48 33 L40 36 Z" fill="hsl(25 95% 55%)" />
      {/* KOM crown */}
      <path d="M58 18 L60 12 L63 17 L66 11 L69 17 L72 12 L74 18 Z"
        fill="hsl(38 90% 56%)" />
      {/* leaderboard card */}
      <rect x="70" y="30" width="38" height="30" rx="4"
        fill="hsl(215 40% 7%)" stroke="hsl(25 95% 55% / 0.3)" strokeWidth="0.8" />
      <text x="89" y="42" textAnchor="middle" fontSize="5" fill="hsl(25 95% 55%)"
        fontFamily="monospace" fontWeight="700">SEGMENT</text>
      <text x="89" y="50" textAnchor="middle" fontSize="7" fill="white"
        fontFamily="monospace" fontWeight="900">8:42</text>
      <text x="89" y="57" textAnchor="middle" fontSize="4" fill="hsl(215 18% 42%)"
        fontFamily="monospace">PR -0:14</text>
    </svg>
  );
}

// ── Outdoor GPS mode ────────────────────────────────────────────────────────
export function OutdoorGPSIcon({ title = 'Outdoor GPS ride recording', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* GPS signal rings */}
      {[8, 16, 24].map((r, i) => (
        <circle key={i} cx="60" cy="52" r={r}
          stroke="#22d3ee" strokeWidth="0.8" strokeOpacity={0.5 - i * 0.12} fill="none" />
      ))}
      {/* location pin */}
      <path d="M60 52 L60 40 Q60 28 70 28 Q80 28 80 38 Q80 50 60 52 Q40 50 40 38 Q40 28 50 28 Q60 28 60 40"
        fill="hsl(215 40% 8%)" stroke="#22d3ee" strokeWidth="1.2" />
      <circle cx="60" cy="38" r="4" fill="#22d3ee" />
      {/* satellite signals */}
      {[
        { x: 20, y: 20 },
        { x: 95, y: 15 },
        { x: 100, y: 45 },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x - 4} y={s.y - 3} width="8" height="6" rx="1"
            fill="hsl(215 40% 10%)" stroke="hsl(215 26% 28%)" strokeWidth="0.6" />
          <line x1={s.x} y1={s.y + 3} x2="60" y2="52"
            stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.2" strokeDasharray="3,3" />
        </g>
      ))}
      <text x="60" y="74" textAnchor="middle" fontSize="5.5" fill="#22d3ee"
        fontFamily="monospace" fontWeight="700">GPS LOCK</text>
    </svg>
  );
}

// ── Voice cues ──────────────────────────────────────────────────────────────
export function VoiceCuesIcon({ title = 'Voice cues and workout coaching', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* waveform */}
      {[6, 14, 22, 34, 44, 52, 60, 68, 52, 40, 26, 14, 8, 12, 18, 24, 30, 22, 14, 8].map((h, i) => (
        <rect key={i}
          x={5 + i * 5.5} y={40 - h / 2} width="3.5" height={h} rx="1.5"
          fill={i > 6 && i < 14 ? '#22d3ee' : `hsl(195 92% 56% / ${0.25 + (h / 68) * 0.4})`} />
      ))}
      {/* speaker icon */}
      <path d="M14 58 L20 54 L20 70 L14 66 Z"
        fill="hsl(215 26% 28%)" stroke="hsl(215 26% 36%)" strokeWidth="0.8" />
      <rect x="8" y="58" width="6" height="8" rx="1"
        fill="hsl(215 26% 28%)" stroke="hsl(215 26% 36%)" strokeWidth="0.8" />
      {/* sound waves right of speaker */}
      {[4, 8, 12].map((r, i) => (
        <path key={i} d={`M24 ${62 - r} Q${26 + r} 62 ${26 + r} 62 Q${26 + r} 62 24 ${62 + r}`}
          stroke="#22d3ee" strokeWidth="0.9" strokeOpacity={0.8 - i * 0.2} fill="none" strokeLinecap="round" />
      ))}
      {/* text bubble */}
      <rect x="42" y="54" width="68" height="18" rx="4"
        fill="hsl(215 40% 8%)" stroke="hsl(195 92% 56% / 0.3)" strokeWidth="0.8" />
      <text x="76" y="66" textAnchor="middle" fontSize="5.5" fill="#22d3ee"
        fontFamily="monospace">"Attack now!"</text>
    </svg>
  );
}

// ── Climb auto-segmentation ─────────────────────────────────────────────────
export function ClimbDetectIcon({ title = 'Automatic climb segmentation', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* elevation profile */}
      <polyline points="8,68 18,64 26,58 36,48 46,36 54,28 62,22 70,20 76,22 82,30 90,42 98,54 108,60 114,64"
        stroke="hsl(215 26% 28%)" strokeWidth="1.5" fill="none" />
      {/* climb highlight */}
      <polyline points="26,58 36,48 46,36 54,28 62,22 70,20"
        stroke="#22d3ee" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* gradient fill under climb */}
      <defs>
        <linearGradient id="climb-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points="26,58 36,48 46,36 54,28 62,22 70,20 70,68 26,68"
        fill="url(#climb-fill)" />
      {/* summit flag */}
      <line x1="70" y1="20" x2="70" y2="8" stroke="hsl(38 90% 56%)" strokeWidth="1" />
      <path d="M70 8 L78 11 L70 14 Z" fill="hsl(38 90% 56%)" />
      {/* stats badge */}
      <rect x="76" y="6" width="38" height="24" rx="4"
        fill="hsl(215 40% 7%)" stroke="hsl(195 92% 56% / 0.25)" strokeWidth="0.8" />
      <text x="95" y="16" textAnchor="middle" fontSize="5" fill="#22d3ee" fontFamily="monospace" fontWeight="700">CLIMB</text>
      <text x="95" y="24" textAnchor="middle" fontSize="5.5" fill="white" fontFamily="monospace" fontWeight="900">+842m</text>
    </svg>
  );
}

// ── Handlebar gestures ──────────────────────────────────────────────────────
export function GesturesIcon({ title = 'Handlebar gesture controls', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* phone / device */}
      <rect x="44" y="8" width="22" height="38" rx="4"
        fill="hsl(215 40% 8%)" stroke="hsl(215 26% 22%)" strokeWidth="1" />
      <rect x="47" y="11" width="16" height="28" rx="2" fill="hsl(215 55% 10%)" />
      {/* gesture arrows */}
      <path d="M26 27 L38 27" stroke="#22d3ee" strokeWidth="1.4"
        strokeLinecap="round" markerEnd="url(#arr)" />
      <path d="M84 27 L72 27" stroke="#22d3ee" strokeWidth="1.4" strokeLinecap="round" />
      <polyline points="76,23 84,27 76,31" stroke="#22d3ee" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* tilt arc */}
      <path d="M55 52 Q55 62 60 68 Q65 62 65 52"
        stroke="hsl(158 80% 42%)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {/* action labels */}
      <text x="32" y="44" textAnchor="middle" fontSize="4.5" fill="#22d3ee"
        fontFamily="monospace">PREV</text>
      <text x="78" y="44" textAnchor="middle" fontSize="4.5" fill="#22d3ee"
        fontFamily="monospace">NEXT</text>
      <text x="60" y="77" textAnchor="middle" fontSize="4.5" fill="hsl(158 80% 42%)"
        fontFamily="monospace">TILT = CAM</text>
      {/* handlebar hint */}
      <path d="M8 27 Q16 22 26 27" stroke="hsl(215 26% 32%)" strokeWidth="2"
        strokeLinecap="round" fill="none" />
      <path d="M84 27 Q94 22 102 27" stroke="hsl(215 26% 32%)" strokeWidth="2"
        strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ── Low-light / night HUD ───────────────────────────────────────────────────
export function LowLightIcon({ title = 'Low-light night HUD mode', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <radialGradient id="night-bg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="hsl(220 60% 6%)" />
          <stop offset="100%" stopColor="hsl(220 70% 3%)" />
        </radialGradient>
      </defs>
      <rect x="8" y="6" width="104" height="62" rx="6" fill="url(#night-bg)"
        stroke="hsl(215 26% 16%)" strokeWidth="1" />
      {/* moon */}
      <path d="M90 18 Q82 22 82 30 Q82 38 90 42 Q80 42 76 34 Q72 26 78 20 Q82 14 90 18"
        fill="hsl(38 90% 70%)" />
      {/* stars */}
      {[[30, 14], [50, 10], [68, 16], [20, 22], [75, 12]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="white" fillOpacity={0.6 + Math.random() * 0.4} />
      ))}
      {/* terrain silhouette */}
      <polygon points="8,55 20,40 35,48 50,30 65,38 80,28 95,36 112,28 112,68 8,68"
        fill="hsl(220 40% 8%)" />
      {/* amber HUD numbers */}
      <text x="26" y="65" textAnchor="middle" fontSize="8" fill="hsl(38 90% 56%)"
        fontFamily="monospace" fontWeight="900">287W</text>
      <text x="60" y="65" textAnchor="middle" fontSize="8" fill="hsl(38 90% 56%)"
        fontFamily="monospace" fontWeight="900">32.4</text>
      <text x="94" y="65" textAnchor="middle" fontSize="8" fill="hsl(38 90% 56%)"
        fontFamily="monospace" fontWeight="900">+6%</text>
    </svg>
  );
}

// ── Sun + atmosphere ────────────────────────────────────────────────────────
export function SkyIcon({ title = 'Dynamic sun, clouds, and atmosphere', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(38 90% 70%)" stopOpacity="0.9" />
          <stop offset="60%" stopColor="hsl(30 80% 55%)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(210 60% 12%)" />
          <stop offset="100%" stopColor="hsl(220 55% 6%)" />
        </linearGradient>
      </defs>
      <rect x="8" y="6" width="104" height="62" rx="6" fill="url(#sky-grad)" />
      {/* sun */}
      <circle cx="80" cy="26" r="16" fill="url(#sun-glow)" />
      <circle cx="80" cy="26" r="8" fill="hsl(38 90% 70%)" />
      {/* sun rays */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
        <line key={a}
          x1={80 + 10 * Math.cos((a * Math.PI) / 180)}
          y1={26 + 10 * Math.sin((a * Math.PI) / 180)}
          x2={80 + 16 * Math.cos((a * Math.PI) / 180)}
          y2={26 + 16 * Math.sin((a * Math.PI) / 180)}
          stroke="hsl(38 90% 70%)" strokeWidth="1" strokeOpacity="0.5" />
      ))}
      {/* clouds */}
      {[[20, 22], [36, 18], [54, 26]].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx={10 - i} ry={5 - i * 0.5}
            fill="hsl(215 30% 20%)" />
          <ellipse cx={x + 4} cy={y - 2} rx={6 - i} ry={4 - i * 0.5}
            fill="hsl(215 30% 22%)" />
        </g>
      ))}
      {/* shadow gradient on ground */}
      <rect x="8" y="52" width="104" height="16" rx="0"
        fill="hsl(220 55% 5%)" />
      {/* terrain */}
      <polyline points="8,58 25,48 42,54 60,42 78,50 96,38 112,44"
        stroke="hsl(215 26% 22%)" strokeWidth="1" fill="none" />
    </svg>
  );
}

// ── Wet road reflections ────────────────────────────────────────────────────
export function WetRoadIcon({ title = 'Wet road PBR reflections', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="wet-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(215 55% 12%)" />
          <stop offset="100%" stopColor="hsl(215 60% 5%)" />
        </linearGradient>
        <linearGradient id="reflection" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      {/* road surface */}
      <path d="M10 70 L45 20 L75 20 L110 70 Z" fill="url(#wet-road)" />
      {/* lane markings */}
      <line x1="60" y1="70" x2="60" y2="20" stroke="hsl(215 26% 28%)" strokeWidth="1" strokeDasharray="5,5" />
      {/* rain streaks */}
      {[20, 35, 50, 65, 80, 95].map((x, i) => (
        <line key={i} x1={x} y1={8 + i * 4} x2={x - 3} y2={22 + i * 4}
          stroke="hsl(210 60% 70%)" strokeWidth="0.8" strokeOpacity="0.35" />
      ))}
      {/* road reflection glow */}
      <path d="M30 65 L50 35 L70 35 L90 65 Z" fill="url(#reflection)" />
      {/* reflection sparkle */}
      {[[45, 52], [58, 44], [72, 56]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.5" fill="#22d3ee" fillOpacity={0.5 - i * 0.1} />
      ))}
    </svg>
  );
}

// ── Spectator crowds ────────────────────────────────────────────────────────
export function SpectatorIcon({ title = 'Spectator crowds on iconic climbs', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* road on climb */}
      <path d="M10 70 L60 20 L70 20 L110 70 Z"
        fill="hsl(215 40% 8%)" stroke="hsl(215 26% 16%)" strokeWidth="0.8" />
      {/* crowd figures on sides */}
      {[
        [14, 60], [20, 55], [26, 50], [32, 45], [38, 40],
        [86, 40], [92, 45], [98, 50], [104, 55], [108, 62],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y - 4} r="2.5"
            fill={i % 3 === 0 ? '#22d3ee' : i % 3 === 1 ? 'hsl(38 90% 56%)' : 'hsl(158 80% 42%)'}
            fillOpacity="0.8" />
          <rect x={x - 2.5} y={y - 1} width="5" height="7" rx="1"
            fill={i % 2 === 0 ? 'hsl(215 40% 18%)' : 'hsl(215 40% 22%)'}
            stroke="hsl(215 26% 26%)" strokeWidth="0.4" />
        </g>
      ))}
      {/* rider on road */}
      <circle cx="60" cy="44" r="3" fill="#22d3ee" />
      <circle cx="56" cy="52" r="4" stroke="#22d3ee" strokeWidth="1" fill="none" />
      <circle cx="64" cy="52" r="4" stroke="#22d3ee" strokeWidth="1" fill="none" />
      {/* confetti dots */}
      {[[30, 32], [42, 28], [72, 30], [84, 26], [50, 24]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.5"
          fill={['#22d3ee', 'hsl(38 90% 56%)', 'hsl(158 80% 42%)', 'hsl(280 70% 60%)'][i % 4]}
          fillOpacity="0.7" />
      ))}
    </svg>
  );
}

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
export function KeyboardIcon({ title = 'Keyboard shortcuts during a ride', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  const keys = [
    { k: '←', x: 12, y: 46 }, { k: '→', x: 28, y: 46 }, { k: '↑', x: 44, y: 46 },
    { k: 'H', x: 60, y: 46 }, { k: 'M', x: 76, y: 46 }, { k: '⏸', x: 92, y: 46 },
  ];
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* keyboard base */}
      <rect x="8" y="38" width="104" height="34" rx="5"
        fill="hsl(215 40% 8%)" stroke="hsl(215 26% 20%)" strokeWidth="1" />
      {/* action descriptions at top */}
      <text x="60" y="20" textAnchor="middle" fontSize="5" fill="hsl(215 18% 42%)" fontFamily="monospace">CAMERA  ·  HUD  ·  MAP  ·  PAUSE</text>
      {keys.map(k => (
        <g key={k.k}>
          <rect x={k.x} y={k.y} width="14" height="14" rx="3"
            fill="hsl(215 40% 12%)" stroke="hsl(215 26% 28%)" strokeWidth="0.8" />
          <text x={k.x + 7} y={k.y + 10} textAnchor="middle"
            fontSize="6" fill="#22d3ee" fontFamily="monospace" fontWeight="700">
            {k.k}
          </text>
        </g>
      ))}
      {/* second row */}
      {[{ k: 'SPACE', x: 28, y: 62, w: 60 }].map(k => (
        <g key={k.k}>
          <rect x={k.x} y={k.y} width={k.w} height="8" rx="3"
            fill="hsl(215 40% 12%)" stroke="hsl(215 26% 28%)" strokeWidth="0.8" />
          <text x={k.x + k.w / 2} y={k.y + 6} textAnchor="middle"
            fontSize="4.5" fill="hsl(215 18% 42%)" fontFamily="monospace">SPRINT BURST</text>
        </g>
      ))}
    </svg>
  );
}

// ── Route library / GPX upload ──────────────────────────────────────────────
export function RouteLibraryIcon({ title = 'GPX route library — 19 iconic climbs', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      {/* stacked cards */}
      {[4, 2, 0].map((offset, i) => (
        <rect key={i} x={12 + offset} y={10 + offset} width="70" height="44" rx="4"
          fill="hsl(215 40% 8%)" stroke="hsl(215 26% 18%)" strokeWidth="0.8"
          fillOpacity={0.6 + i * 0.2} />
      ))}
      {/* route on top card */}
      <polyline points="18,40 26,34 36,28 46,22 54,20 62,22 70,28 76,30"
        stroke="#22d3ee" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="40" r="2" fill="hsl(158 80% 42%)" />
      <circle cx="76" cy="30" r="2" fill="#22d3ee" />
      {/* route name */}
      <text x="18" y="50" fontSize="6" fill="hsl(215 18% 50%)" fontFamily="monospace">Alpe d'Huez</text>
      {/* count badge */}
      <rect x="90" y="10" width="24" height="20" rx="4"
        fill="hsl(195 92% 56% / 0.1)" stroke="hsl(195 92% 56% / 0.3)" strokeWidth="0.8" />
      <text x="102" y="21" textAnchor="middle" fontSize="9" fill="#22d3ee"
        fontFamily="monospace" fontWeight="900">19</text>
      <text x="102" y="28" textAnchor="middle" fontSize="4" fill="hsl(215 18% 42%)"
        fontFamily="monospace">routes</text>
      {/* GPX upload hint */}
      <rect x="10" y="60" width="104" height="14" rx="4"
        fill="hsl(215 40% 7%)" stroke="hsl(215 26% 16%)" strokeWidth="0.8" />
      <text x="62" y="70" textAnchor="middle" fontSize="5.5" fill="hsl(215 18% 40%)"
        fontFamily="monospace">↑ Drop your GPX here</text>
    </svg>
  );
}

// ── Cycling power physics ───────────────────────────────────────────────────
export function PhysicsIcon({ title = 'Real-time cycling power physics', animate = false, ...props }: IconProps) {
  if (animate) ensureStyles();
  return (
    <svg {...base} {...props}>
      <title>{title}</title>
      <defs>
        <linearGradient id="phys-curve" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="hsl(158 80% 42%)" />
        </linearGradient>
      </defs>
      {/* axes */}
      <line x1="16" y1="10" x2="16" y2="60" stroke="hsl(215 26% 28%)" strokeWidth="1" />
      <line x1="16" y1="60" x2="110" y2="60" stroke="hsl(215 26% 28%)" strokeWidth="1" />
      {/* grid */}
      {[20, 35, 50].map(y => (
        <line key={y} x1="16" y1={y} x2="110" y2={y}
          stroke="hsl(215 26% 18%)" strokeWidth="0.5" strokeDasharray="3,3" />
      ))}
      {/* power vs speed curve — Martin et al. 1998 parabola shape */}
      <path d="M16 58 C30 52 50 40 70 28 C85 20 100 14 110 10"
        stroke="url(#phys-curve)" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* operating point */}
      <circle cx="70" cy="28" r="4" fill="#22d3ee" />
      <line x1="70" y1="28" x2="70" y2="60" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="3,3" strokeOpacity="0.5" />
      <line x1="16" y1="28" x2="70" y2="28" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="3,3" strokeOpacity="0.5" />
      {/* labels */}
      <text x="72" y="57" fontSize="5" fill="#22d3ee" fontFamily="monospace">287W</text>
      <text x="8" y="30" fontSize="5" fill="#22d3ee" fontFamily="monospace" textAnchor="end"
        transform="translate(14,28)">32</text>
      <text x="110" y="68" fontSize="4.5" fill="hsl(215 18% 42%)" fontFamily="monospace">km/h →</text>
      <text x="10" y="10" fontSize="4.5" fill="hsl(215 18% 42%)" fontFamily="monospace"
        transform="rotate(-90 10 10)" textAnchor="end">W ↑</text>
    </svg>
  );
}
