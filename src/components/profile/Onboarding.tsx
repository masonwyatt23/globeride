/**
 * Onboarding — first-run multi-step welcome overlay.
 *
 * Self-contained: reads hasSeenOnboarding from onboardingStore and renders
 * nothing when true. Mount once near the app root and it manages itself.
 *
 * Steps:
 *   -1 — Welcome splash
 *    0 — Real Earth  (3D Tiles, moods, weather)
 *    1 — Smart trainer + ride
 *    2 — Pace partners & racing
 *    3 — AI coach + training
 *    4 — Companion screen
 *    5 — Profile setup (name + FTP)
 *
 * Keyboard nav: Esc = skip, ArrowRight / Enter = next, ArrowLeft = back.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Globe2,
  ArrowRight,
  ArrowLeft,
  X,
  Zap,
  User,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useProfileStore } from '@/stores/profileStore';
import { useSettingsStore } from '@/stores/settingsStore';

// ---------------------------------------------------------------------------
// Inline SVG illustrations — CSS-only, no external assets
// ---------------------------------------------------------------------------

/** Rotating globe with a latitudinal orbit ring */
function GlobeIllustration() {
  return (
    <svg
      viewBox="0 0 80 80"
      className="h-14 w-14"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Atmosphere glow */}
      <circle cx="40" cy="40" r="38" fill="hsl(var(--primary)/0.08)" />
      {/* Globe body */}
      <circle cx="40" cy="40" r="28" fill="hsl(var(--primary)/0.18)" stroke="hsl(var(--primary)/0.50)" strokeWidth="1.5" />
      {/* Latitude lines */}
      <ellipse cx="40" cy="40" rx="28" ry="10" stroke="hsl(var(--primary)/0.30)" strokeWidth="1" />
      <ellipse cx="40" cy="40" rx="28" ry="20" stroke="hsl(var(--primary)/0.20)" strokeWidth="0.8" />
      {/* Meridian */}
      <ellipse cx="40" cy="40" rx="10" ry="28" stroke="hsl(var(--primary)/0.30)" strokeWidth="1" />
      {/* Orbit ring */}
      <ellipse cx="40" cy="40" rx="37" ry="13" stroke="hsl(var(--accent)/0.55)" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Rider dot on ring */}
      <circle cx="77" cy="40" r="3.5" fill="hsl(var(--accent))" />
      {/* Sun glint */}
      <circle cx="29" cy="30" r="4" fill="hsl(var(--primary)/0.35)" />
    </svg>
  );
}

/** Trainer silhouette with a gradient resistance bar */
function TrainerIllustration() {
  return (
    <svg
      viewBox="0 0 80 80"
      className="h-14 w-14"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rear wheel */}
      <circle cx="22" cy="54" r="16" stroke="hsl(var(--primary)/0.45)" strokeWidth="2" />
      <circle cx="22" cy="54" r="7" stroke="hsl(var(--primary)/0.30)" strokeWidth="1.5" />
      {/* Front wheel */}
      <circle cx="60" cy="54" r="16" stroke="hsl(var(--primary)/0.45)" strokeWidth="2" />
      <circle cx="60" cy="54" r="7" stroke="hsl(var(--primary)/0.30)" strokeWidth="1.5" />
      {/* Frame */}
      <polyline points="22,54 38,26 54,54" stroke="hsl(var(--primary)/0.70)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="38" y1="26" x2="60" y2="54" stroke="hsl(var(--primary)/0.70)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="38" y1="26" x2="38" y2="20" stroke="hsl(var(--primary)/0.70)" strokeWidth="2.5" strokeLinecap="round" />
      {/* Handlebar */}
      <line x1="33" y1="20" x2="43" y2="20" stroke="hsl(var(--primary)/0.60)" strokeWidth="2" strokeLinecap="round" />
      {/* Gradient resistance indicator */}
      <rect x="14" y="68" width="52" height="5" rx="2.5" fill="hsl(var(--muted)/0.60)" />
      <rect x="14" y="68" width="34" height="5" rx="2.5" fill="hsl(var(--accent)/0.70)" />
      {/* BT badge */}
      <circle cx="67" cy="18" r="9" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary)/0.40)" strokeWidth="1" />
      <path d="M66 13 L70 17 L66 21 M66 21 L70 17 M66 13 L66 21" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Two rider dots in a peloton formation + a dashed P2P link */
function PelotonIllustration() {
  return (
    <svg
      viewBox="0 0 80 80"
      className="h-14 w-14"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Road */}
      <ellipse cx="40" cy="68" rx="34" ry="6" fill="hsl(var(--muted)/0.40)" />
      {/* Lead rider */}
      <circle cx="40" cy="42" r="9" fill="hsl(var(--accent)/0.20)" stroke="hsl(var(--accent)/0.70)" strokeWidth="1.5" />
      <circle cx="40" cy="36" r="4" fill="hsl(var(--accent)/0.55)" />
      {/* Draft rider left */}
      <circle cx="24" cy="50" r="7" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary)/0.50)" strokeWidth="1.5" />
      <circle cx="24" cy="45" r="3" fill="hsl(var(--primary)/0.45)" />
      {/* Draft rider right */}
      <circle cx="56" cy="50" r="7" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary)/0.50)" strokeWidth="1.5" />
      <circle cx="56" cy="45" r="3" fill="hsl(var(--primary)/0.45)" />
      {/* Draft lines */}
      <line x1="30" y1="50" x2="35" y2="46" stroke="hsl(var(--accent)/0.35)" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="50" y1="50" x2="45" y2="46" stroke="hsl(var(--accent)/0.35)" strokeWidth="1" strokeDasharray="2 2" />
      {/* P2P link arc */}
      <path d="M12 20 Q40 8 68 20" stroke="hsl(var(--primary)/0.45)" strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="12" cy="20" r="3" fill="hsl(var(--primary)/0.60)" />
      <circle cx="68" cy="20" r="3" fill="hsl(var(--primary)/0.60)" />
      {/* Link label dots */}
      <circle cx="40" cy="11" r="2" fill="hsl(var(--primary)/0.50)" />
    </svg>
  );
}

/** Brain + upward trend chart = AI coach */
function CoachIllustration() {
  return (
    <svg
      viewBox="0 0 80 80"
      className="h-14 w-14"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Chart base */}
      <line x1="10" y1="66" x2="70" y2="66" stroke="hsl(var(--border))" strokeWidth="1.5" />
      <line x1="10" y1="66" x2="10" y2="20" stroke="hsl(var(--border))" strokeWidth="1.5" />
      {/* CTL/ATL lines */}
      <polyline points="10,60 22,55 34,46 46,40 58,32 70,24"
        stroke="hsl(var(--primary)/0.70)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="10,62 22,58 34,54 46,50 58,46 70,42"
        stroke="hsl(var(--accent)/0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2" />
      {/* Brain icon ring */}
      <circle cx="58" cy="22" r="14" fill="hsl(var(--primary)/0.12)" stroke="hsl(var(--primary)/0.40)" strokeWidth="1" />
      {/* Simplified neuron cross */}
      <circle cx="58" cy="22" r="4" fill="hsl(var(--primary)/0.50)" />
      <line x1="58" y1="12" x2="58" y2="18" stroke="hsl(var(--primary)/0.60)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="58" y1="26" x2="58" y2="32" stroke="hsl(var(--primary)/0.60)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="48" y1="22" x2="54" y2="22" stroke="hsl(var(--primary)/0.60)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="62" y1="22" x2="68" y2="22" stroke="hsl(var(--primary)/0.60)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="51" y1="15" x2="55" y2="19" stroke="hsl(var(--primary)/0.40)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="61" y1="25" x2="65" y2="29" stroke="hsl(var(--primary)/0.40)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Phone outline with HR pulse + cadence number */
function CompanionIllustration() {
  return (
    <svg
      viewBox="0 0 80 80"
      className="h-14 w-14"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Phone body */}
      <rect x="22" y="8" width="36" height="64" rx="6" fill="hsl(var(--card)/0.60)" stroke="hsl(var(--border))" strokeWidth="1.5" />
      {/* Screen */}
      <rect x="26" y="16" width="28" height="44" rx="3" fill="hsl(var(--primary)/0.08)" />
      {/* HR wave */}
      <polyline
        points="27,42 31,42 33,36 35,48 37,38 39,46 41,42 55,42"
        stroke="hsl(4 84% 53%/0.80)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cadence readout */}
      <text x="40" y="28" textAnchor="middle" fontSize="9" fill="hsl(var(--primary))" fontWeight="700" fontFamily="monospace">94 rpm</text>
      {/* Bottom home bar */}
      <rect x="33" y="67" width="14" height="2.5" rx="1.25" fill="hsl(var(--border))" />
      {/* Wifi bars suggesting BroadcastChannel */}
      <path d="M62 26 Q67 21 72 26" stroke="hsl(var(--accent)/0.70)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M64 29 Q67 26 70 29" stroke="hsl(var(--accent)/0.60)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="67" cy="31" r="1.5" fill="hsl(var(--accent)/0.80)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

interface Step {
  id: string;
  illustration: React.ReactNode;
  iconBg: string;
  heading: string;
  subheading: string;
  body: string;
}

const STEPS: Step[] = [
  {
    id: 'real-earth',
    illustration: <GlobeIllustration />,
    iconBg: 'from-sky-500/20 to-primary/10',
    heading: 'Real Earth. Every mile.',
    subheading: 'Photoreal 3D Tiles · Cinematic moods · Live weather',
    body:
      'Google Photorealistic 3D Tiles put you inside the actual landscape — your road, your valley, your Alpe d\'Huez hairpin. Switch cinematic moods (dawn, storm, golden hour) or layer on live weather that bends the sky around your ride.',
  },
  {
    id: 'trainer',
    illustration: <TrainerIllustration />,
    iconBg: 'from-violet-500/20 to-indigo-500/10',
    heading: 'Smart trainer. Real gradient.',
    subheading: 'FTMS Bluetooth · Demo Mode · Strava .FIT export',
    body:
      'Connect any FTMS trainer (Wahoo Kickr, Tacx Neo, Saris H3…) and GlobeRide pushes the exact road gradient every second. Finish your ride and export a Strava-ready .FIT in one click. No trainer? Demo Mode has you covered right now.',
  },
  {
    id: 'peloton',
    illustration: <PelotonIllustration />,
    iconBg: 'from-rose-500/20 to-orange-500/10',
    heading: 'Pace partners. P2P racing.',
    subheading: 'Niki · Yuki · Attila bots · Shareable race links',
    body:
      'Niki, Yuki, and Attila ride beside you with realistic drafting physics — sit on their wheels and save watts. Want to race a friend? Share a link, no accounts needed. Permissionless P2P races start in seconds over WebRTC.',
  },
  {
    id: 'coach',
    illustration: <CoachIllustration />,
    iconBg: 'from-emerald-500/20 to-teal-500/10',
    heading: 'AI coach. Training load.',
    subheading: 'Workout catalog · CTL/ATL/TSB · Iconic climbs',
    body:
      'An AI coach recommends workouts matched to your fitness and flags overtraining before it hits. Track CTL, ATL, and TSB on a live chart. Queue up iconic World Tour climbs or custom intervals — and earn segment badges as you go.',
  },
  {
    id: 'companion',
    illustration: <CompanionIllustration />,
    iconBg: 'from-cyan-500/20 to-sky-500/10',
    heading: 'Companion screen.',
    subheading: 'HR · Cadence · Remote control · Activity feed',
    body:
      'Open GlobeRide on your phone and it instantly mirrors HR, cadence, and power from the desktop — no Bluetooth pairing required. Tap to pause, skip, or control ERG intensity. Your phone becomes a live race dashboard.',
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Onboarding() {
  const hasSeenOnboarding = useOnboardingStore((s) => s.hasSeenOnboarding);
  const dismiss = useOnboardingStore((s) => s.dismiss);

  if (hasSeenOnboarding) return null;

  return <OnboardingInner onDismiss={dismiss} />;
}

// Separated so hooks only run when onboarding is actually visible
function OnboardingInner({ onDismiss }: { onDismiss: () => void }) {
  // -1 = welcome splash, 0..N-1 = concept steps, N = profile step
  const TOTAL_CONCEPT_STEPS = STEPS.length;
  const PROFILE_STEP = TOTAL_CONCEPT_STEPS;
  const TOTAL_STEPS = TOTAL_CONCEPT_STEPS + 1; // concept steps + profile step

  const [stepIndex, setStepIndex] = useState<number>(-1);
  const [exiting, setExiting] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  // Key bumped on each step change to force re-mount → re-animate
  const [animKey, setAnimKey] = useState(0);

  // Profile step local state
  const [riderName, setRiderName] = useState('');
  const [ftpInput, setFtpInput] = useState('');
  const createProfile = useProfileStore((s) => s.createProfile);
  const currentFtp = useSettingsStore((s) => s.ftpW);
  const setSettings = useSettingsStore((s) => s.setSettings);

  // Trap body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard: Escape = skip, ArrowRight / Enter = next, ArrowLeft = back
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { handleDismiss(); return; }
      if (e.key === 'ArrowRight' && stepIndex < PROFILE_STEP) { goNext(); return; }
      if (e.key === 'ArrowLeft' && stepIndex > -1) { goBack(); return; }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, 280);
  }, [onDismiss]);

  const goNext = useCallback(() => {
    setDirection('forward');
    setAnimKey((k) => k + 1);
    setStepIndex((s) => s + 1);
  }, []);

  const goBack = useCallback(() => {
    setDirection('back');
    setAnimKey((k) => k + 1);
    setStepIndex((s) => (s > -1 ? s - 1 : -1));
  }, []);

  const handleFinish = useCallback(() => {
    const trimmedName = riderName.trim();
    if (trimmedName) createProfile(trimmedName);

    const ftpNum = Number(ftpInput);
    if (Number.isFinite(ftpNum) && ftpNum >= 50 && ftpNum <= 600) {
      setSettings({ ftpW: ftpNum });
    }

    handleDismiss();
  }, [riderName, ftpInput, createProfile, setSettings, handleDismiss]);

  const isWelcome = stepIndex === -1;
  const isProfile = stepIndex === PROFILE_STEP;
  const conceptStep = !isWelcome && !isProfile ? STEPS[stepIndex] : null;

  // Progress dots cover concept steps + profile step (not welcome)
  const progressDot = isWelcome ? -1 : stepIndex;

  const stepAnim = direction === 'forward'
    ? 'animate-[stepForward_0.22s_ease_forwards]'
    : 'animate-[stepBack_0.22s_ease_forwards]';

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center p-4',
        'bg-background/60 backdrop-blur-md',
        exiting
          ? 'animate-[fadeIn_0.28s_ease_reverse_forwards]'
          : 'animate-[fadeIn_0.22s_ease_forwards]',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to GlobeRide"
    >
      {/* Skip button — always visible */}
      <button
        onClick={handleDismiss}
        aria-label="Skip onboarding"
        className="absolute top-4 right-4 rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary z-10"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Card */}
      <div
        className={cn(
          'relative w-full max-w-md glass glass-hairline rounded-2xl overflow-hidden',
          exiting
            ? 'animate-[scaleIn_0.24s_ease_reverse_forwards]'
            : 'animate-[scaleIn_0.28s_cubic-bezier(0.34,1.56,0.64,1)_forwards]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient glow blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute -top-24 -left-16 h-56 w-56 rounded-full bg-primary/12 blur-[60px]" />
          <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-accent/10 blur-[56px]" />
        </div>

        <div className="relative">
          {/* ----------------------------------------------------------------
              WELCOME SPLASH (stepIndex === -1)
          ---------------------------------------------------------------- */}
          {isWelcome && (
            <div className="flex flex-col items-center text-center px-8 pt-12 pb-10 gap-6">
              {/* Logo mark */}
              <div className="relative">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/15 flex items-center justify-center shadow-[0_8px_32px_-8px_hsl(var(--primary)/0.45)] ring-1 ring-primary/20">
                  <Globe2 className="h-10 w-10 text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-accent flex items-center justify-center ring-2 ring-background">
                  <Zap className="h-3.5 w-3.5 text-accent-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground [letter-spacing:-0.03em]">
                  Welcome to{' '}
                  <span className="text-gradient">GlobeRide</span>
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  Virtual cycling on a photorealistic 3D globe. Upload any GPX,
                  pair your smart trainer, and ride anywhere on Earth.
                </p>
              </div>

              {/* Feature pills */}
              <div className="flex flex-wrap justify-center gap-2 text-[11px]">
                <Pill>Real gradient → real resistance</Pill>
                <Pill>AI coach + training load</Pill>
                <Pill>No accounts · MIT licensed</Pill>
              </div>

              <Button
                variant="accent"
                size="lg"
                className="w-full rounded-pill shadow-[0_8px_28px_-10px_hsl(var(--accent)/0.6)]"
                onClick={goNext}
              >
                Get started
                <ArrowRight className="h-5 w-5" />
              </Button>

              <button
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                Skip intro
              </button>
            </div>
          )}

          {/* ----------------------------------------------------------------
              CONCEPT STEPS (stepIndex 0..N-1)
          ---------------------------------------------------------------- */}
          {conceptStep && (
            <div key={animKey} className={cn('px-7 pt-8 pb-7', stepAnim)}>
              {/* Illustration */}
              <div
                className={cn(
                  'h-16 w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-5',
                  'ring-1 ring-white/10 shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.35)]',
                  conceptStep.iconBg,
                )}
              >
                {conceptStep.illustration}
              </div>

              <h2 className="text-xl font-bold tracking-tight text-foreground [letter-spacing:-0.025em] mb-0.5">
                {conceptStep.heading}
              </h2>
              <p className="text-[11px] font-medium text-primary/70 uppercase tracking-wider mb-3">
                {conceptStep.subheading}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-7">
                {conceptStep.body}
              </p>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={goBack}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>

                <DotProgress total={TOTAL_STEPS} current={progressDot} />

                <Button variant="accent" size="sm" className="rounded-pill" onClick={goNext}>
                  {stepIndex === TOTAL_CONCEPT_STEPS - 1 ? 'Almost done' : 'Next'}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------
              PROFILE STEP (stepIndex === PROFILE_STEP)
          ---------------------------------------------------------------- */}
          {isProfile && (
            <div key={animKey} className={cn('px-7 pt-8 pb-7', stepAnim)}>
              {/* Icon */}
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center mb-5 ring-1 ring-white/10 shadow-[0_4px_20px_-6px_hsl(var(--accent)/0.3)]">
                <User className="h-7 w-7 text-amber-400" />
              </div>

              <h2 className="text-xl font-bold tracking-tight text-foreground [letter-spacing:-0.025em] mb-1">
                One last thing
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                Optional: set your name and FTP so GlobeRide can calibrate workout
                targets and your AI coach recommendations. Change these any time in
                Settings.
              </p>

              <div className="space-y-3 mb-7">
                {/* Name field */}
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Your name
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. Alex"
                    value={riderName}
                    onChange={(e) => setRiderName(e.target.value)}
                    maxLength={40}
                    className="rounded-lg border border-border bg-card/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors"
                    aria-label="Rider name"
                    autoFocus
                  />
                </label>

                {/* FTP field */}
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    FTP (Functional Threshold Power)
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder={String(currentFtp)}
                      value={ftpInput}
                      onChange={(e) => setFtpInput(e.target.value)}
                      min={50}
                      max={600}
                      step={5}
                      className="w-full rounded-lg border border-border bg-card/40 px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors num"
                      aria-label="FTP in watts"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      W
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    Your 1-hour max sustainable power. Default {currentFtp} W. Run an FTP
                    test any time from the home screen.
                  </span>
                </label>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={goBack}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>

                <DotProgress total={TOTAL_STEPS} current={progressDot} />

                <Button
                  variant="accent"
                  size="sm"
                  className="rounded-pill shadow-[0_6px_22px_-8px_hsl(var(--accent)/0.55)]"
                  onClick={handleFinish}
                >
                  Let's ride
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-muted-foreground">
      {children}
    </span>
  );
}

function DotProgress({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i === current
              ? 'h-2 w-5 bg-accent'
              : i < current
                ? 'h-1.5 w-1.5 bg-primary/50'
                : 'h-1.5 w-1.5 bg-muted-foreground/25',
          )}
        />
      ))}
    </div>
  );
}

