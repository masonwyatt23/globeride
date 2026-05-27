/**
 * QuickstartSection — 4-step illustrated walkthrough.
 * Makes "this looks easy to try" visceral before visitors reach the feature grid.
 *
 * Layout: 4-col desktop / 2×2 tablet / 1-col mobile.
 * Each step: aqua number circle + inline SVG illustration + title + description.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// ── Step illustrations (inline SVG, 160×120 viewBox) ─────────────────────────

function RoutePickerIllustration() {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      role="img"
      aria-labelledby="qs-ill-1-title"
    >
      <title id="qs-ill-1-title">Route picker with a GPX file being uploaded</title>
      {/* Background card */}
      <rect x="12" y="14" width="136" height="92" rx="8" fill="hsl(215 32% 8%)" stroke="hsl(215 26% 14%)" strokeWidth="1" />
      {/* Map grid lines */}
      {[30, 46, 62, 78, 94].map(y => (
        <line key={y} x1="20" y1={y} x2="148" y2={y} stroke="hsl(215 26% 12%)" strokeWidth="0.6" />
      ))}
      {[35, 55, 75, 95, 115, 135].map(x => (
        <line key={x} x1={x} y1="20" x2={x} y2="100" stroke="hsl(215 26% 12%)" strokeWidth="0.6" />
      ))}
      {/* Route arc */}
      <path
        d="M28 90 C 45 72, 65 58, 85 50 C 105 42, 125 44, 142 34"
        stroke="#22d3ee"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="5 3"
        opacity="0.9"
      />
      {/* Start dot */}
      <circle cx="28" cy="90" r="4" fill="#22d3ee" fillOpacity="0.9" />
      {/* End flag */}
      <line x1="142" y1="34" x2="142" y2="22" stroke="#22d3ee" strokeWidth="1.5" />
      <path d="M142 22 L152 26 L142 30Z" fill="#22d3ee" fillOpacity="0.8" />
      {/* GPX upload chip */}
      <rect x="30" y="18" width="52" height="18" rx="4" fill="hsl(195 92% 56% / 0.15)" stroke="hsl(195 92% 56% / 0.4)" strokeWidth="0.8" />
      <text x="38" y="30" fontSize="7" fill="#22d3ee" fontFamily="monospace" fontWeight="700">.GPX upload</text>
      {/* Elevation mini-chart */}
      <polyline
        points="20,102 35,97 55,88 75,84 95,89 115,80 135,75 148,78"
        stroke="#22d3ee"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

function TrainerPairIllustration() {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      role="img"
      aria-labelledby="qs-ill-2-title"
    >
      <title id="qs-ill-2-title">Smart trainer pairing via Bluetooth</title>
      {/* Trainer body */}
      <rect x="48" y="70" width="64" height="22" rx="5" fill="hsl(215 32% 10%)" stroke="hsl(215 26% 18%)" strokeWidth="1.2" />
      {/* Flywheel */}
      <ellipse cx="80" cy="70" rx="18" ry="9" fill="hsl(215 32% 8%)" stroke="hsl(215 26% 20%)" strokeWidth="1.2" />
      <ellipse cx="80" cy="70" rx="10" ry="5" fill="hsl(215 42% 6%)" stroke="hsl(215 26% 16%)" strokeWidth="1" />
      {/* Dropout skewer */}
      <line x1="112" y1="70" x2="124" y2="60" stroke="hsl(215 18% 30%)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="48" y1="70" x2="36" y2="60" stroke="hsl(215 18% 30%)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Bluetooth symbol */}
      <g transform="translate(80, 35)">
        {/* BT icon simplified */}
        <path d="M0 -12 L8 -6 L-6 4 L8 12 L0 18 L0 -12" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* Pulse rings */}
        <circle cx="0" cy="3" r="18" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.3" />
        <circle cx="0" cy="3" r="26" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.15" />
      </g>
      {/* "Connected" badge */}
      <rect x="52" y="96" width="56" height="14" rx="7" fill="hsl(195 92% 56% / 0.15)" stroke="hsl(195 92% 56% / 0.4)" strokeWidth="0.8" />
      <text x="58" y="106" fontSize="7" fill="#22d3ee" fontFamily="monospace" fontWeight="700">Connected</text>
    </svg>
  );
}

function CameraModIllustration() {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      role="img"
      aria-labelledby="qs-ill-3-title"
    >
      <title id="qs-ill-3-title">Camera mode selector showing chase and drone views</title>
      {/* Camera body */}
      <rect x="44" y="42" width="72" height="48" rx="7" fill="hsl(215 32% 8%)" stroke="hsl(215 26% 16%)" strokeWidth="1.2" />
      {/* Lens barrel */}
      <circle cx="80" cy="66" r="18" fill="hsl(215 42% 6%)" stroke="hsl(215 26% 18%)" strokeWidth="1.2" />
      <circle cx="80" cy="66" r="12" fill="hsl(220 42% 4%)" stroke="hsl(215 26% 14%)" strokeWidth="1" />
      <circle cx="80" cy="66" r="6" fill="hsl(215 60% 8%)" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.6" />
      {/* Viewfinder bump */}
      <rect x="68" y="34" width="24" height="10" rx="3" fill="hsl(215 32% 10%)" stroke="hsl(215 26% 16%)" strokeWidth="1" />
      {/* Mode chips */}
      <rect x="12" y="18" width="44" height="14" rx="7" fill="hsl(195 92% 56% / 0.15)" stroke="hsl(195 92% 56% / 0.5)" strokeWidth="0.8" />
      <text x="17" y="28" fontSize="6.5" fill="#22d3ee" fontFamily="monospace" fontWeight="700">Chase cam</text>
      <rect x="62" y="18" width="36" height="14" rx="7" fill="hsl(215 32% 8%)" stroke="hsl(215 26% 16%)" strokeWidth="0.8" />
      <text x="67" y="28" fontSize="6.5" fill="hsl(215 18% 42%)" fontFamily="monospace">Drone</text>
      <rect x="104" y="18" width="40" height="14" rx="7" fill="hsl(215 32% 8%)" stroke="hsl(215 26% 16%)" strokeWidth="0.8" />
      <text x="109" y="28" fontSize="6.5" fill="hsl(215 18% 42%)" fontFamily="monospace">FPV</text>
      {/* Shutter button */}
      <circle cx="110" cy="56" r="5" fill="#22d3ee" fillOpacity="0.8" />
    </svg>
  );
}

function RideIllustration() {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      role="img"
      aria-labelledby="qs-ill-4-title"
    >
      <title id="qs-ill-4-title">Photoreal Earth globe with a cycling route arc</title>
      {/* Globe */}
      <circle cx="80" cy="64" r="46" fill="hsl(215 60% 8%)" stroke="hsl(215 26% 16%)" strokeWidth="1.2" />
      {/* Ocean fill */}
      <circle cx="80" cy="64" r="44" fill="hsl(210 55% 10%)" />
      {/* Continent blobs */}
      <ellipse cx="62" cy="56" rx="18" ry="22" fill="hsl(145 30% 16%)" opacity="0.85" />
      <ellipse cx="100" cy="52" rx="14" ry="18" fill="hsl(145 30% 16%)" opacity="0.85" />
      <ellipse cx="88" cy="74" rx="10" ry="8" fill="hsl(145 30% 14%)" opacity="0.7" />
      {/* Atmosphere rim */}
      <circle cx="80" cy="64" r="44" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.2" />
      {/* Route arc on globe */}
      <path
        d="M 52 80 Q 68 34, 108 44"
        stroke="#22d3ee"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 2.5"
        opacity="0.95"
      />
      {/* Rider dot */}
      <circle cx="76" cy="54" r="3.5" fill="#22d3ee" fillOpacity="0.95" />
      <circle cx="76" cy="54" r="7" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.3" />
      {/* Stars */}
      {[[14, 18], [138, 24], [148, 52], [24, 90], [145, 95], [32, 40]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="white" opacity="0.4" />
      ))}
    </svg>
  );
}

// ── Step data ─────────────────────────────────────────────────────────────────

export const QUICKSTART_STEPS = [
  {
    n: 1,
    title: 'Upload a GPX or pick an iconic route',
    description: 'Any GPX from Strava, Komoot, or Garmin. Or search a city — GlobeRide generates a real OSM cycling route on the spot.',
    Illustration: RoutePickerIllustration,
  },
  {
    n: 2,
    title: 'Pair your smart trainer (optional)',
    description: 'Tap "Connect" for Web Bluetooth FTMS pairing. No ANT+ dongle, no app. Or skip it — Demo Mode rides itself.',
    Illustration: TrainerPairIllustration,
  },
  {
    n: 3,
    title: 'Pick your camera mode',
    description: 'Chase cam, cinematic drone, first-person, or satellite overview. Switch live with a single tap.',
    Illustration: CameraModIllustration,
  },
  {
    n: 4,
    title: 'Ride',
    description: 'Your trainer resistance follows the real gradient in real time. Record the session and export a .FIT file for Strava.',
    Illustration: RideIllustration,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function QuickstartSection() {
  const navigate = useNavigate();

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute top-0 left-1/4 h-[28rem] w-[40rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse, hsl(195 92% 56% / 0.04) 0%, transparent 70%)' }}
        />
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#22d3ee' }}>
            Getting started
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Up and riding in four steps
          </h2>
          <p className="mt-4 text-base sm:text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'hsl(215 18% 52%)' }}>
            No account. No install. Open a browser tab and go.
          </p>
        </div>

        {/* Steps grid — desktop: 4-col; tablet: 2×2; mobile: vertical timeline */}
        <div className="relative grid gap-0 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Mobile-only vertical connecting line — dashed aqua running the full height */}
          <div
            aria-hidden
            className="sm:hidden absolute left-[17px] top-[36px] bottom-[36px] w-px"
            style={{
              background: 'repeating-linear-gradient(to bottom, hsl(195 92% 56% / 0.3) 0px, hsl(195 92% 56% / 0.3) 6px, transparent 6px, transparent 12px)',
            }}
          />

          {QUICKSTART_STEPS.map(({ n, title, description, Illustration }) => (
            <div
              key={n}
              className="relative flex sm:flex-col rounded-none sm:rounded-2xl p-4 sm:p-6 gap-4 sm:gap-0 transition-colors duration-300"
              style={{
                background: 'transparent',
                // On sm+ restore card background
              }}
            >
              {/* sm+ card background — can't use responsive inline styles, so use a wrapper */}
              <div
                className="hidden sm:block absolute inset-0 rounded-2xl pointer-events-none"
                style={{ background: 'hsl(215 32% 6%)', border: '1px solid hsl(215 26% 12%)' }}
                aria-hidden
              />

              {/* Mobile left column: step circle + line spacer */}
              <div className="sm:hidden relative flex flex-col items-center shrink-0 z-10" style={{ width: '36px' }}>
                {/* Step number circle */}
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold shrink-0"
                  style={{
                    background: 'hsl(195 92% 56% / 0.15)',
                    border: '1.5px solid hsl(195 92% 56% / 0.4)',
                    color: '#22d3ee',
                  }}
                >
                  {n}
                </div>
              </div>

              {/* Desktop step number (hidden on mobile, shown inside card) */}
              <div
                className="hidden sm:flex relative z-10 items-center justify-center w-9 h-9 rounded-full text-sm font-bold mb-5 shrink-0"
                style={{ background: 'hsl(195 92% 56% / 0.15)', border: '1.5px solid hsl(195 92% 56% / 0.4)', color: '#22d3ee' }}
              >
                {n}
              </div>

              {/* Mobile right column / desktop: illustration + text */}
              <div className="flex-1 relative z-10 pb-6 sm:pb-0">
                {/* Illustration — smaller on mobile */}
                <div
                  className="w-full aspect-[4/3] mb-4 rounded-lg overflow-hidden"
                  style={{ background: 'hsl(220 42% 4%)' }}
                >
                  <Illustration />
                </div>

                {/* Text */}
                <h3 className="text-base font-bold text-white tracking-tight mb-2">{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'hsl(215 18% 50%)' }}>{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 flex justify-center px-4">
          <button
            onClick={() => navigate('/app')}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 rounded-full text-sm font-semibold transition-all duration-200"
            style={{
              height: '3rem',
              minHeight: '44px',
              background: 'hsl(195 92% 56% / 0.12)',
              border: '1px solid hsl(195 92% 56% / 0.35)',
              color: '#22d3ee',
            }}
          >
            Try a demo route
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
