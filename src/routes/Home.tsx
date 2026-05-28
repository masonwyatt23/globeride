import { useState, useEffect, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Library,
  Bike,
  MapPin,
  Weight,
  Wind,
  Sparkles,
  Globe2,
  Dumbbell,
  History,
  FlaskConical,
  Calendar,
  Route,
  Info,
  Users,
  Trophy,
  Flag,
  PenLine,
} from 'lucide-react';

import { AppHeader } from '@/components/setup/AppHeader';
import { RideSetupWizard } from '@/components/setup/RideSetupWizard';
import { OutdoorModeToggle } from '@/components/setup/OutdoorModeToggle';
import { PaceBotsPanel } from '@/components/ride/PaceBotsPanel';
import { WorkoutBuilder } from '@/components/workouts/WorkoutBuilder';
import { WorkoutLibrary } from '@/components/workouts/WorkoutLibrary';
import { WorkoutPicker } from '@/components/workouts/WorkoutPicker';
// Heavy AI/race panels — lazy-loaded so they don't bloat the initial bundle.
// Each is only rendered when the user navigates to the relevant tab.
const TrainingPlans    = lazy(() => import('@/components/training/TrainingPlans').then(m => ({ default: m.TrainingPlans })));
const AIWorkoutDesigner = lazy(() => import('@/components/workouts/AIWorkoutDesigner').then(m => ({ default: m.AIWorkoutDesigner })));
const AIRouteRecommender = lazy(() => import('@/components/routes/AIRouteRecommender').then(m => ({ default: m.AIRouteRecommender })));
const WorldTourStages  = lazy(() => import('@/components/routes/WorldTourStages').then(m => ({ default: m.WorldTourStages })));
const RaceLobby        = lazy(() => import('@/components/race/RaceLobby').then(m => ({ default: m.RaceLobby })));
const AICoach          = lazy(() => import('@/components/training/AICoach').then(m => ({ default: m.AICoach })));
const CoachPlanEditor  = lazy(() => import('@/components/training/CoachPlanEditor').then(m => ({ default: m.CoachPlanEditor })));

import { RideHistory } from '@/components/training/RideHistory';
// Recharts-heavy panels — lazy-loaded so the ~390 kB Recharts chunk stays
// off the critical path. Each chart pulls Recharts only when its tab/view
// actually renders.
const FitnessChart = lazy(() => import('@/components/training/FitnessChart').then(m => ({ default: m.FitnessChart })));
const PersonalRecords = lazy(() => import('@/components/training/PersonalRecords').then(m => ({ default: m.PersonalRecords })));
const ElevationProfile = lazy(() => import('@/components/ride/ElevationProfile').then(m => ({ default: m.ElevationProfile })));
const RoutePreview = lazy(() => import('@/components/routes/RoutePreview').then(m => ({ default: m.RoutePreview })));
import { GPXUploader } from '@/components/setup/GPXUploader';
import { FITUploader } from '@/components/setup/FITUploader';
import { StravaUrlImport } from '@/components/setup/StravaUrlImport';
import { RouteSearch } from '@/components/setup/RouteSearch';
import { TrainerConnect } from '@/components/trainer/TrainerConnect';
import { SensorConnect } from '@/components/trainer/SensorConnect';
import { RouteLibrary } from '@/components/routes/RouteLibrary';
import { IconicRoutes } from '@/components/routes/IconicRoutes';
import { SegmentLeaderboard } from '@/components/training/SegmentLeaderboard';
import { SettingsButton } from '@/components/profile/SettingsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HomeTabBar, HomeTabPanel, type TabId } from '@/components/setup/HomeTabs';
import { useRaceStore } from '@/stores/raceStore';
import { decodeManifestUrl } from '@/lib/race/raceProtocol';
import { useRideStore } from '@/stores/rideStore';
import { makeDemoRoute } from '@/lib/sampleRoutes';
import { useSettingsStore, kgToLb, msToKmh, msToMph } from '@/stores/settingsStore';
import { buildRampTest, build20MinTest } from '@/lib/ftpTest';
import { getPreset, DAILY_WORKOUT_ID } from '@/lib/presetWorkouts';
import { totalDurationSec, estimateTSS } from '@/lib/workout';
import { ICONIC_ROUTES } from '@/lib/iconicRoutes';
import { ProPelotonSetup } from '@/components/setup/ProPelotonSetup';

/** Minimal inline spinner shown while a lazy tab panel loads. */
function TabSpinner() {
  return (
    <div className="h-16 flex items-center justify-center">
      <div className="h-5 w-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  );
}

/**
 * Landing / setup page — reorganised into four focused tabs:
 *
 *   Ride     — route picking (GPX / FIT / search / draw) + trainer pairing + Start CTA
 *   Routes   — iconic climbs + saved route library
 *   Workouts — daily ride, FTP test, picker, plans, library, builder, AI designer
 *   History  — training log + segment leaderboard
 *
 * Every piece of functionality from the original long-scroll layout is
 * preserved; only the visual grouping has changed.
 */
export function Home() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('ride');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Honor ?tab= query param from wizard "Browse all" links
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const tab = sp.get('tab') as TabId | null;
    if (tab && ['ride','routes','workouts','races','history'].includes(tab)) {
      setShowAdvanced(true);
      setActiveTab(tab);
      const url = new URL(window.location.href);
      url.searchParams.delete('tab');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const route = useRideStore((s) => s.route);
  const connection = useRideStore((s) => s.connection);
  const mode = useRideStore((s) => s.mode);
  const rideMode = useRideStore((s) => s.rideMode);
  const settings = useSettingsStore();

  const loadWorkout = useRideStore((s) => s.loadWorkout);
  const clearWorkout = useRideStore((s) => s.clearWorkout);
  const activeWorkout = useRideStore((s) => s.activeWorkout);

  const willUseDemo = mode === 'demo' || connection !== 'connected';

  // Deep-link: ?race=<base64> → auto-load manifest and strip query param
  useEffect(() => {
    const search = window.location.search;
    if (!search.includes('race=')) return;
    const manifest = decodeManifestUrl(window.location.href);
    if (manifest) {
      useRaceStore.getState().loadManifest(manifest);
      // Switch to races tab so the user sees it
      setActiveTab('races');
    }
    // Strip the ?race= param from the URL without a navigation
    const url = new URL(window.location.href);
    url.searchParams.delete('race');
    window.history.replaceState({}, '', url.toString());
  }, []); // intentional: runs once on mount to consume the ?race= deep-link

  /** Always-enabled CTA: auto-pairs a random iconic route and the daily easy
   *  workout if the user hasn't already picked them, then navigates to /ride. */
  const handleStartRide = () => {
    const store = useRideStore.getState();
    if (!store.route && store.rideMode !== 'outdoor') {
      const iconic = ICONIC_ROUTES[Math.floor(Math.random() * ICONIC_ROUTES.length)];
      store.setRoute(iconic.route);
    }
    if (!store.activeWorkout) {
      const dailyPreset = getPreset(DAILY_WORKOUT_ID);
      if (dailyPreset) store.loadWorkout(dailyPreset);
    }
    navigate('/ride');
  };
  const imperial = settings.units === 'imperial';
  const totalMassDisplay = imperial
    ? `${Math.round(kgToLb(settings.riderMassKg + settings.bikeMassKg))} lb`
    : `${Math.round(settings.riderMassKg + settings.bikeMassKg)} kg`;
  const windDisplay =
    settings.windSpeedMs === 0
      ? 'calm'
      : imperial
        ? `${msToMph(settings.windSpeedMs).toFixed(1)} mph`
        : `${msToKmh(settings.windSpeedMs).toFixed(1)} km/h`;

  const tabs = [
    { id: 'ride' as TabId,     label: 'Ride',     icon: <Bike className="h-3.5 w-3.5" /> },
    { id: 'routes' as TabId,   label: 'Routes',   icon: <Route className="h-3.5 w-3.5" /> },
    { id: 'workouts' as TabId, label: 'Workouts', icon: <Dumbbell className="h-3.5 w-3.5" /> },
    { id: 'races' as TabId,    label: 'Races',    icon: <Flag className="h-3.5 w-3.5" /> },
    { id: 'history' as TabId,  label: 'History',  icon: <History className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="relative min-h-full w-full flex flex-col overflow-x-hidden">
      {/* Ambient gradient backdrop — decorative depth, sits behind everything */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-primary/10 dark:bg-primary/14 blur-[80px]" />
        <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-accent/10 dark:bg-accent/12 blur-[80px]" />
        <div className="absolute bottom-0 left-1/4 h-[24rem] w-[24rem] rounded-full bg-sky-400/8 dark:bg-sky-500/8 blur-[80px]" />
      </div>

      <AppHeader />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-7 sm:py-9 lg:py-11 flex flex-col gap-6">

        {/* Hero — always visible */}
        <div className="animate-fadeUp">
          <Badge variant="default" className="mb-3 text-[10px]">
            <Sparkles className="h-3 w-3" />
            Open source · MIT licensed
          </Badge>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.05] [letter-spacing:-0.03em]">
            Pick your ride.
          </h1>
          <p className="mt-2 text-muted-foreground max-w-prose text-sm sm:text-base leading-relaxed">
            30 seconds, no account required.
          </p>
        </div>

        {/* ── Wizard (default view) ── */}
        {!showAdvanced && <RideSetupWizard />}

        {/* ── Advanced toggle footer ── */}
        {!showAdvanced && (
          <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border/40">
            <button
              type="button"
              onClick={() => setShowAdvanced(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
            <button
              type="button"
              onClick={() => { setShowAdvanced(true); setActiveTab('races'); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Flag className="h-3.5 w-3.5" />
              Races
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Dumbbell className="h-3.5 w-3.5" />
              Advanced view
            </button>
          </div>
        )}

        {/* ── Advanced / power-user tab layout ── */}
        {showAdvanced && (
          <>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                ← Back to quick setup
              </button>
            </div>
            {/* Tab bar */}
            <HomeTabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          </>
        )}

        {/* All tab panels — only rendered in advanced mode */}
        {showAdvanced && (
        <>
        <HomeTabPanel id="ride" activeTab={activeTab}>
          <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">

            {/* Left: route picking */}
            <div className="space-y-5">
              {/* Outdoor / Indoor mode selector */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {rideMode === 'outdoor'
                      ? <MapPin className="h-3.5 w-3.5 text-primary" />
                      : <Bike className="h-3.5 w-3.5 text-primary" />}
                    Ride mode
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <OutdoorModeToggle />
                  {rideMode === 'outdoor' && (
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                      Outdoor mode records your real ride via device GPS. Power is
                      estimated from speed and gradient. No trainer needed — just
                      start the ride and go.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <StepBadge n={1} /> Pick a route
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rideMode !== 'outdoor' ? (
                    <>
                  <RouteSearch />

                  <details className="group" data-gpx-uploader>
                    <summary className="cursor-pointer flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors list-none select-none">
                      <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                      Advanced: upload your own GPX or replay a .FIT
                    </summary>
                    <div className="mt-3 space-y-4">
                      <GPXUploader />
                      <Divider label="or import from Strava" />
                      <StravaUrlImport />
                      <Divider label="or replay a .FIT" />
                      <FITUploader />
                    </div>
                  </details>

                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Your path is recorded live from GPS as you ride — no route
                      selection needed.
                    </p>
                  )}

                  {rideMode !== 'outdoor' && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-muted-foreground hover:text-foreground"
                      onClick={() => navigate('/explore')}
                    >
                      <Globe2 className="h-4 w-4" />
                      Explore globe
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-muted-foreground hover:text-foreground"
                      onClick={() => navigate('/draw')}
                      title="Click waypoints on the 3D globe to draw a custom route"
                    >
                      <PenLine className="h-4 w-4" />
                      Draw a route
                    </Button>
                  </div>
                  )}

                  {route && rideMode !== 'outdoor' && (
                    <div className="rounded-lg bg-muted/40 p-3 border border-border/60">
                      <Suspense fallback={<TabSpinner />}><ElevationProfile /></Suspense>
                    </div>
                  )}
                  {rideMode !== 'outdoor' && (
                    <Suspense fallback={<TabSpinner />}><RoutePreview /></Suspense>
                  )}
                </CardContent>
              </Card>

              {/* Active workout badge — shown if a workout is already attached */}
              {activeWorkout && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{activeWorkout.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {activeWorkout.segments.length} segments · attached to ride
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={clearWorkout}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>

            {/* Right: trainer, sensors, and Start CTA */}
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <StepBadge n={2} /> Pair your smart trainer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TrainerConnect />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    Pair sensors
                    <span className="ml-1.5 text-muted-foreground font-normal normal-case tracking-normal">
                      (optional)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    Pair a standalone heart-rate monitor and/or cadence sensor. When
                    connected, they override the values from your trainer — useful if
                    your trainer doesn't broadcast HR or cadence.
                  </p>
                  <SensorConnect />
                </CardContent>
              </Card>

              {/* Pace partners */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    Pace partners
                    <span className="ml-1.5 text-muted-foreground font-normal normal-case tracking-normal">
                      (optional)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PaceBotsPanel />
                  {/* Pro Peloton overlay — shown only when the loaded route has curated results */}
                  <ProPelotonSetup />
                </CardContent>
              </Card>

              {/* Step 3: Roll out */}
              <Card className="ring-1 ring-accent/30">
                <CardHeader>
                  <CardTitle>
                    <StepBadge n={3} /> Roll out
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {willUseDemo
                      ? 'No trainer connected — Demo Mode will simulate power and speed for you.'
                      : 'Trainer connected. Gradients will stream in real time as you ride.'}
                  </p>

                  {/* Physics chips */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Chip icon={<Weight className="h-3 w-3" />} label={totalMassDisplay} />
                    <Chip
                      icon={<Bike className="h-3 w-3" />}
                      label={`${settings.bikeType.toUpperCase()} · ${settings.riderPosition}`}
                    />
                    <Chip icon={<Wind className="h-3 w-3" />} label={windDisplay} />
                    <SettingsButton variant="ghost" size="sm" showLabel />
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      size="lg"
                      variant="accent"
                      onClick={handleStartRide}
                      className="rounded-pill active:scale-[0.97] transition-transform"
                    >
                      Enter the world
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                    {!route && (
                      <span className="text-xs text-muted-foreground">
                        Auto-pairing a scenic route + easy workout
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* About / browser support — collapsed by default to keep the CTA prominent */}
              <details className="group">
                <summary className="cursor-pointer flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors list-none select-none">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>About GlobeRide &amp; browser support</span>
                  <span className="ml-auto group-open:rotate-180 transition-transform inline-block">▾</span>
                </summary>
                <div className="mt-3 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>What's in the box</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <Feature icon="🌍" title="3D globe with terrain + OSM buildings">
                        Powered by Cesium ion. Chase camera follows your bike along the route tangent.
                      </Feature>
                      <Feature icon="⚡" title="Real gradient → real resistance">
                        FTMS Simulation Mode pushed every 1–2 s to your Kickr Core, Tacx Neo, Saris H3,
                        or any FTMS trainer.
                      </Feature>
                      <Feature icon="📊" title="Strava-ready .FIT export">
                        Per-second telemetry: position, power, cadence, HR, altitude. Upload straight to
                        Strava or Garmin Connect.
                      </Feature>
                      <Feature icon="🚀" title="Demo Mode">
                        No trainer? GlobeRide solves the cycling-power equation and rides for you so you
                        can experience the full product immediately.
                      </Feature>
                      <Feature icon="📱" title="Installable PWA">
                        Add to home screen on iPad next to the trainer. Works fully offline once cached.
                      </Feature>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Browser support</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                      <p>
                        Web Bluetooth ships in{' '}
                        <strong className="text-foreground">Chrome</strong> and{' '}
                        <strong className="text-foreground">Edge</strong> on desktop &amp; Android.
                        Safari and iOS do not expose Web Bluetooth — use Demo Mode there.
                      </p>
                      <p>Cesium needs WebGL2; nearly every modern device qualifies.</p>
                    </CardContent>
                  </Card>
                </div>
              </details>
            </div>
          </div>
        </HomeTabPanel>

        {/* ROUTES tab */}
        <HomeTabPanel id="routes" activeTab={activeTab}>
          <div className="space-y-5">
            {/* Draw-a-route CTA */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PenLine className="h-3.5 w-3.5 text-primary" />
                  Draw a custom route
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Click waypoints anywhere on the 3D globe to trace a custom
                  ride. Real terrain elevation is fetched automatically. Works
                  on roads, trails, or anywhere you can imagine a ride.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/draw')}
                  className="gap-2"
                >
                  <PenLine className="h-4 w-4" />
                  Open globe and draw
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Generate a scenic route
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<TabSpinner />}><AIRouteRecommender onPicked={() => navigate('/ride')} /></Suspense>
              </CardContent>
            </Card>

            <Card data-iconic-routes>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Iconic climbs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <IconicRoutes onPicked={() => navigate('/ride')} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-3.5 w-3.5 text-primary" />
                  World Tour stages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<TabSpinner />}><WorldTourStages onPicked={() => navigate('/ride')} /></Suspense>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Library className="h-3.5 w-3.5 text-primary" />
                  My Routes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RouteLibrary />
              </CardContent>
            </Card>
          </div>
        </HomeTabPanel>

        {/* WORKOUTS tab */}
        <HomeTabPanel id="workouts" activeTab={activeTab}>
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dumbbell className="h-3.5 w-3.5 text-primary" />
                  Structured workout
                  <span className="ml-1.5 text-muted-foreground font-normal normal-case tracking-normal">
                    (optional)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Build a structured workout with ERG power targets and attach it to any route —
                  or ride it indoors on a scenic demo route. The engine holds your trainer at the
                  exact wattage for each segment.
                </p>

                {/* Daily ride — one-tap flagship preset */}
                {!activeWorkout && (
                  <DailyRideCard
                    ftpW={settings.ftpW}
                    onStart={() => {
                      const preset = getPreset(DAILY_WORKOUT_ID);
                      if (!preset) return;
                      loadWorkout(preset);
                      if (!route) useRideStore.getState().setRoute(makeDemoRoute());
                      navigate('/ride');
                    }}
                  />
                )}

                {activeWorkout ? (
                  <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{activeWorkout.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {activeWorkout.segments.length} segments · attached to ride
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={clearWorkout}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}

                {/* FTP Test entry point */}
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <FlaskConical className="h-3.5 w-3.5 text-accent" />
                    FTP Test
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Find your Functional Threshold Power. Choose a protocol, ride it,
                    and GlobeRide will suggest a new FTP when you finish.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        const w = buildRampTest();
                        loadWorkout(w);
                        if (!route) useRideStore.getState().setRoute(makeDemoRoute());
                      }}
                    >
                      <FlaskConical className="h-3 w-3" />
                      Ramp Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        const w = build20MinTest(useSettingsStore.getState().ftpW);
                        loadWorkout(w);
                        if (!route) useRideStore.getState().setRoute(makeDemoRoute());
                      }}
                    >
                      <FlaskConical className="h-3 w-3" />
                      20-Min Test
                    </Button>
                  </div>
                </div>

                <WorkoutPicker
                  onSelect={(w) => {
                    loadWorkout(w);
                    if (!route) useRideStore.getState().setRoute(makeDemoRoute());
                  }}
                  onRide={(w) => {
                    loadWorkout(w);
                    if (!route) useRideStore.getState().setRoute(makeDemoRoute());
                    navigate('/ride');
                  }}
                />

                <Suspense fallback={<TabSpinner />}>
                  <TrainingPlans
                    onRide={(w) => {
                      loadWorkout(w);
                      if (!route) useRideStore.getState().setRoute(makeDemoRoute());
                      navigate('/ride');
                    }}
                  />
                </Suspense>

                <WorkoutLibrary
                  onSelect={(w) => {
                    loadWorkout(w);
                    // If no route yet, load the demo route so there's scenery
                    if (!route) {
                      useRideStore.getState().setRoute(makeDemoRoute());
                    }
                  }}
                />

                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1.5">
                    <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                    Build a new workout
                  </summary>
                  <div className="mt-3">
                    <WorkoutBuilder
                      onSaved={(w) => {
                        loadWorkout(w);
                      }}
                      onRide={(w) => {
                        loadWorkout(w);
                        if (!route) {
                          useRideStore.getState().setRoute(makeDemoRoute());
                        }
                        navigate('/ride');
                      }}
                    />
                  </div>
                </details>
              </CardContent>
            </Card>

            <Suspense fallback={<TabSpinner />}><AIWorkoutDesigner /></Suspense>
          </div>
        </HomeTabPanel>


        {/* RACES tab */}
        <HomeTabPanel id="races" activeTab={activeTab}>
          <div className="space-y-5">
            <Card>
              <CardContent className="pt-5">
                <Suspense fallback={<TabSpinner />}><RaceLobby /></Suspense>
              </CardContent>
            </Card>
          </div>
        </HomeTabPanel>

        {/* HISTORY tab */}
        <HomeTabPanel id="history" activeTab={activeTab}>
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-primary" />
                  Training Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RideHistory />
                {route && <SegmentLeaderboard route={route} className="mt-4" />}
              </CardContent>
            </Card>
            <Suspense fallback={<TabSpinner />}><CoachPlanEditor /></Suspense>
            <Suspense fallback={<TabSpinner />}><AICoach /></Suspense>
            <Suspense fallback={<TabSpinner />}><FitnessChart /></Suspense>
            <Suspense fallback={<TabSpinner />}><PersonalRecords /></Suspense>
          </div>
        </HomeTabPanel>
        </>
        )}

      </main>

      <footer className="px-4 sm:px-6 lg:px-10 py-4 border-t border-border/50 text-xs text-muted-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
        <span>MIT-licensed · made for cyclists who like the open web.</span>
        <span className="num opacity-60">v0.2.0</span>
      </footer>
    </div>
  );
}

/* ── Local components ─────────────────────────────────────────────────────── */

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold shrink-0 mr-1.5">
      {n}
    </span>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border/60" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">{label}</span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-border/70 bg-card/50 px-2.5 py-0.5 text-foreground/80">
      {icon}
      <span className="num">{label}</span>
    </span>
  );
}

function DailyRideCard({
  ftpW,
  onStart,
}: {
  ftpW: number;
  onStart: () => void;
}) {
  const daily = getPreset(DAILY_WORKOUT_ID);
  if (!daily) return null;
  const minutes = Math.round(totalDurationSec(daily) / 60);
  const tss = estimateTSS(daily, ftpW);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/12 via-accent/4 to-transparent p-4 sm:p-5 ring-1 ring-accent/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_hsl(var(--accent)/0.3)] animate-fadeUp">
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-accent/15 blur-3xl pointer-events-none" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] uppercase tracking-widest font-semibold text-accent">
              Daily ride
            </span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold text-foreground tracking-tight leading-snug">
            {daily.name}
          </div>
          <p className="mt-1 text-xs sm:text-[13px] text-muted-foreground leading-relaxed max-w-prose">
            {daily.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="num font-semibold text-foreground/90">{minutes} min</span>
            <span className="opacity-40">·</span>
            <span>Z2 endurance</span>
            <span className="opacity-40">·</span>
            <span>ERG-guided</span>
            {tss > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="num">{tss} TSS</span>
              </>
            )}
          </div>
        </div>
        <Button
          variant="accent"
          size="lg"
          onClick={onStart}
          className="rounded-pill shrink-0 shadow-[0_8px_28px_-10px_hsl(var(--accent)/0.6)] active:scale-[0.97] transition-transform"
        >
          Start
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden>{icon}</span>
      <div className="flex flex-col gap-0.5">
        <div className="font-semibold text-foreground leading-snug">{title}</div>
        <div className="text-muted-foreground leading-relaxed text-[13px]">{children}</div>
      </div>
    </div>
  );
}
