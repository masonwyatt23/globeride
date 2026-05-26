/**
 * HeroGlobeFallback — pure SVG/CSS animated globe for the hero section.
 * No Cesium dependency here — zero LCP penalty. Just a beautiful
 * rotating Earth-like sphere built entirely with SVG arcs and CSS animations.
 * Shown while the real Cesium HeroGlobe is loading, or whenever WebGL /
 * Cesium ion token is unavailable.
 */
import { useEffect, useRef } from 'react';

export function HeroGlobeFallback() {
  const svgRef = useRef<SVGSVGElement>(null);

  // Subtle parallax tilt on mouse move
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { clientX, clientY, currentTarget } = e;
        const target = currentTarget as Window;
        const cx = target.innerWidth / 2;
        const cy = target.innerHeight / 2;
        const dx = (clientX - cx) / cx;
        const dy = (clientY - cy) / cy;
        el.style.transform = `perspective(800px) rotateY(${dx * 6}deg) rotateX(${-dy * 4}deg)`;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="relative flex items-center justify-center">
      {/* Glow halo behind the globe */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 50%, hsl(195 92% 56% / 0.22) 0%, hsl(195 92% 56% / 0.08) 40%, transparent 70%)',
          filter: 'blur(24px)',
          transform: 'scale(1.3)',
        }}
      />
      {/* Outer pulse ring */}
      <div
        aria-hidden
        className="absolute rounded-full border border-cyan-400/10"
        style={{ inset: '-12%', animation: 'globeRingPulse 4s ease-in-out infinite' }}
      />
      <div
        aria-hidden
        className="absolute rounded-full border border-cyan-400/6"
        style={{ inset: '-28%', animation: 'globeRingPulse 4s ease-in-out infinite 1s' }}
      />

      <svg
        ref={svgRef}
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-full drop-shadow-[0_0_48px_hsl(195_92%_56%_/_0.3)]"
        style={{ transition: 'transform 0.15s ease-out' }}
        aria-hidden
      >
        <defs>
          {/* Main sphere gradient — dark navy core, cyan limb */}
          <radialGradient id="sphereGrad" cx="38%" cy="34%" r="62%" fx="38%" fy="34%">
            <stop offset="0%" stopColor="hsl(215 60% 18%)" />
            <stop offset="45%" stopColor="hsl(220 55% 10%)" />
            <stop offset="100%" stopColor="hsl(210 80% 6%)" />
          </radialGradient>

          {/* Atmosphere limb glow */}
          <radialGradient id="atmosphereGrad" cx="50%" cy="50%" r="50%">
            <stop offset="75%" stopColor="transparent" />
            <stop offset="88%" stopColor="hsl(195 92% 56% / 0.15)" />
            <stop offset="100%" stopColor="hsl(195 92% 56% / 0.35)" />
          </radialGradient>

          {/* Specular highlight */}
          <radialGradient id="specularGrad" cx="36%" cy="32%" r="26%">
            <stop offset="0%" stopColor="hsl(210 60% 80% / 0.18)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Clip to circle */}
          <clipPath id="sphereClip">
            <circle cx="200" cy="200" r="176" />
          </clipPath>

          {/* Grid line gradient — fade out toward limb */}
          <linearGradient id="gridFadeH" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="hsl(195 92% 56% / 0.03)" />
            <stop offset="25%" stopColor="hsl(195 92% 56% / 0.18)" />
            <stop offset="75%" stopColor="hsl(195 92% 56% / 0.18)" />
            <stop offset="100%" stopColor="hsl(195 92% 56% / 0.03)" />
          </linearGradient>
          <linearGradient id="gridFadeV" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="hsl(195 92% 56% / 0.03)" />
            <stop offset="25%" stopColor="hsl(195 92% 56% / 0.18)" />
            <stop offset="75%" stopColor="hsl(195 92% 56% / 0.18)" />
            <stop offset="100%" stopColor="hsl(195 92% 56% / 0.03)" />
          </linearGradient>

          {/* Route path glow filter */}
          <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Atmosphere glow filter */}
          <filter id="atmGlow" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="3" />
          </filter>

          {/* Terrain texture noise */}
          <filter id="terrain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
            <feBlend in="SourceGraphic" in2="grey" mode="overlay" result="blend" />
            <feComposite in="blend" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>

        {/* ── Base sphere ── */}
        <circle cx="200" cy="200" r="176" fill="url(#sphereGrad)" />

        {/* ── "Continent" blobs — abstract landmasses ── */}
        <g clipPath="url(#sphereClip)" opacity="0.55">
          {/* North America-ish */}
          <ellipse cx="148" cy="168" rx="42" ry="34" fill="hsl(158 60% 24%)" transform="rotate(-18 148 168)" />
          <ellipse cx="138" cy="195" rx="28" ry="20" fill="hsl(158 55% 22%)" transform="rotate(-22 138 195)" />
          {/* South America-ish */}
          <ellipse cx="162" cy="248" rx="22" ry="38" fill="hsl(158 55% 21%)" transform="rotate(-8 162 248)" />
          {/* Europe/Africa-ish */}
          <ellipse cx="216" cy="162" rx="18" ry="24" fill="hsl(158 50% 23%)" transform="rotate(12 216 162)" />
          <ellipse cx="222" cy="200" rx="14" ry="30" fill="hsl(158 55% 20%)" transform="rotate(5 222 200)" />
          <ellipse cx="228" cy="240" rx="20" ry="32" fill="hsl(158 52% 19%)" transform="rotate(-4 228 240)" />
          {/* Asia-ish */}
          <ellipse cx="268" cy="158" rx="48" ry="32" fill="hsl(158 55% 22%)" transform="rotate(8 268 158)" />
          <ellipse cx="290" cy="190" rx="36" ry="22" fill="hsl(158 50% 20%)" transform="rotate(15 290 190)" />
          {/* Australia-ish */}
          <ellipse cx="302" cy="254" rx="26" ry="18" fill="hsl(158 52% 21%)" transform="rotate(-12 302 254)" />
        </g>

        {/* ── Latitude lines ── */}
        <g clipPath="url(#sphereClip)">
          {/* Equator — brightest */}
          <ellipse cx="200" cy="200" rx="176" ry="8" stroke="hsl(195 92% 56% / 0.30)" strokeWidth="0.8" fill="none" />
          {/* ±30° */}
          <ellipse cx="200" cy="162" rx="152" ry="7" stroke="hsl(195 92% 56% / 0.18)" strokeWidth="0.6" fill="none" />
          <ellipse cx="200" cy="238" rx="152" ry="7" stroke="hsl(195 92% 56% / 0.18)" strokeWidth="0.6" fill="none" />
          {/* ±60° */}
          <ellipse cx="200" cy="112" rx="88" ry="5" stroke="hsl(195 92% 56% / 0.12)" strokeWidth="0.5" fill="none" />
          <ellipse cx="200" cy="288" rx="88" ry="5" stroke="hsl(195 92% 56% / 0.12)" strokeWidth="0.5" fill="none" />
          {/* Tropics */}
          <ellipse cx="200" cy="178" rx="168" ry="7.5" stroke="hsl(195 92% 56% / 0.09)" strokeWidth="0.4" fill="none" />
          <ellipse cx="200" cy="222" rx="168" ry="7.5" stroke="hsl(195 92% 56% / 0.09)" strokeWidth="0.4" fill="none" />
        </g>

        {/* ── Longitude lines (animated slow rotation) ── */}
        <g clipPath="url(#sphereClip)" style={{ animation: 'globeSpin 36s linear infinite', transformOrigin: '200px 200px' }}>
          {[0, 30, 60, 90, 120, 150].map((deg, i) => (
            <ellipse
              key={deg}
              cx="200"
              cy="200"
              rx={i % 3 === 0 ? 5 : 3}
              ry="176"
              stroke={`hsl(195 92% 56% / ${i % 3 === 0 ? '0.20' : '0.11'})`}
              strokeWidth={i % 3 === 0 ? 0.7 : 0.4}
              fill="none"
              transform={`rotate(${deg} 200 200)`}
            />
          ))}
        </g>

        {/* ── Terminator shadow (day/night divide) ── */}
        <g clipPath="url(#sphereClip)">
          <ellipse
            cx="290"
            cy="200"
            rx="130"
            ry="176"
            fill="hsl(220 60% 4% / 0.55)"
          />
        </g>

        {/* ── Route path — animated GPX trace ── */}
        <g clipPath="url(#sphereClip)" filter="url(#routeGlow)">
          {/* Primary route line */}
          <path
            d="M 118 210 C 128 192 145 182 162 176 C 178 170 194 168 210 165 C 226 162 242 160 255 156"
            stroke="#22d3ee"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            style={{
              strokeDasharray: '200',
              strokeDashoffset: '200',
              animation: 'routeDraw 3s cubic-bezier(0.4, 0, 0.2, 1) 0.8s forwards',
            }}
          />
          {/* Route glow duplicate */}
          <path
            d="M 118 210 C 128 192 145 182 162 176 C 178 170 194 168 210 165 C 226 162 242 160 255 156"
            stroke="#22d3ee"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            opacity="0.25"
            style={{
              strokeDasharray: '200',
              strokeDashoffset: '200',
              animation: 'routeDraw 3s cubic-bezier(0.4, 0, 0.2, 1) 0.8s forwards',
            }}
          />
          {/* Rider dot */}
          <circle
            cx="255"
            cy="156"
            r="4"
            fill="#22d3ee"
            style={{
              opacity: 0,
              animation: 'riderAppear 0.4s ease-out 3.8s forwards',
            }}
          />
          <circle
            cx="255"
            cy="156"
            r="8"
            fill="hsl(195 92% 56% / 0.3)"
            style={{
              opacity: 0,
              animation: 'riderAppear 0.4s ease-out 3.8s forwards, livePulse 2s ease-in-out 4s infinite',
            }}
          />
          {/* Start dot */}
          <circle cx="118" cy="210" r="3" fill="hsl(158 80% 42%)" opacity="0.8" />
        </g>

        {/* ── Atmosphere glow (limb) ── */}
        <circle
          cx="200"
          cy="200"
          r="176"
          fill="url(#atmosphereGrad)"
          style={{ animation: 'atmospherePulse 6s ease-in-out infinite' }}
        />

        {/* ── Specular highlight ── */}
        <circle cx="200" cy="200" r="176" fill="url(#specularGrad)" />

        {/* ── Outer ring ── */}
        <circle cx="200" cy="200" r="176" stroke="hsl(195 92% 56% / 0.25)" strokeWidth="1.5" fill="none" />
      </svg>
    </div>
  );
}
