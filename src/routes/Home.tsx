import { useNavigate } from 'react-router-dom';
import { ArrowRight, Library, Bike, Weight, Wind, Sparkles, Globe2, Dumbbell, History, FlaskConical, Calendar } from 'lucide-react';

import { AppHeader } from '@/components/AppHeader';
import { WorkoutBuilder } from '@/components/WorkoutBuilder';
import { WorkoutLibrary } from '@/components/WorkoutLibrary';
import { WorkoutPicker } from '@/components/WorkoutPicker';
import { TrainingPlans } from '@/components/TrainingPlans';
import { AIWorkoutDesigner } from '@/components/AIWorkoutDesigner';
import { RideHistory } from '@/components/RideHistory';
import { GPXUploader } from '@/components/GPXUploader';
import { FITUploader } from '@/components/FITUploader';
import { RouteSearch } from '@/components/RouteSearch';
import { TrainerConnect } from '@/components/TrainerConnect';
import { SensorConnect } from '@/components/SensorConnect';
import { ElevationProfile } from '@/components/ElevationProfile';
import { RouteLibrary } from '@/components/RouteLibrary';
import { RoutePreview } from '@/components/RoutePreview';
import { IconicRoutes } from '@/components/IconicRoutes';
import { SegmentLeaderboard } from '@/components/SegmentLeaderboard';
import { SettingsButton } from '@/components/SettingsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRideStore } from '@/stores/rideStore';
import { makeDemoRoute } from '@/lib/sampleRoutes';
import { useSettingsStore, kgToLb, msToKmh, msToMph } from '@/stores/settingsStore';
import { buildRampTest, build20MinTest } from '@/lib/ftpTest';
import { getPreset, DAILY_WORKOUT_ID } from '@/lib/presetWorkouts';
import { totalDurationSec, estimateTSS } from '@/lib/workout';
import { cn } from '@/lib/utils';

/**
 * Landing / setup page. Three vertically-stacked panels on mobile, a 2-col
 * layout on tablet/desktop: pick a route, pair a trainer, jump into the ride.
 */
export function Home() {
  const navigate = useNavigate();
  const route = useRideStore((s) => s.route);
  const connection = useRideStore((s) => s.connection);
  const mode = useRideStore((s) => s.mode);
  const settings = useSettingsStore();

  const loadWorkout = useRideStore((s) => s.loadWorkout);
  const clearWorkout = useRideStore((s) => s.clearWorkout);
  const activeWorkout = useRideStore((s) => s.activeWorkout);

  const canRide = !!route;
  const willUseDemo = mode === 'demo' || connection !== 'connected';
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

  return (
    <div className="relative min-h-full w-full flex flex-col overflow-x-hidden">
      {/* Ambient gradient backdrop — decorative depth, sits behind everything */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-primary/10 dark:bg-primary/14 blur-[80px]" />
        <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-accent/10 dark:bg-accent/12 blur-[80px]" />
        <div className="absolute bottom-0 left-1/4 h-[24rem] w-[24rem] rounded-full bg-sky-400/8 dark:bg-sky-500/8 blur-[80px]" />
      </div>

      <AppHeader />

      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-7 sm:py-9 lg:py-11 w-full max-w-7xl mx-auto grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr] auto-rows-min">
        {/* ---- Left column: setup flow ---- */}
        <section className="space-y-5 md:col-span-2 lg:col-span-1 animate-fadeUp">
          {/* Hero */}
          <div>
            <Badge variant="default" className="mb-3 text-[10px]">
              <Sparkles className="h-3 w-3" />
              Open source · MIT licensed
            </Badge>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.05] [letter-spacing:-0.03em]">
              Ride{' '}
              <span className="text-gradient">anywhere on Earth.</span>
            </h1>
            <p className="mt-3 text-muted-foreground max-w-prose text-sm sm:text-base leading-relaxed">
              Upload any GPX from Strava, Komoot or Garmin. GlobeRide renders the
              route on a photorealistic 3D globe, drives real gradient into your
              smart trainer over Web Bluetooth, and exports a Strava-compatible
              .FIT when you're done.
            </p>
          </div>

          {/* Step 1: Route */}
          <Card className="animate-fadeUp [animation-delay:80ms]">
            <CardHeader>
              <CardTitle>
                <StepBadge n={1} /> Pick a route
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <GPXUploader />

              <Divider label="or replay a .FIT" />

              <FITUploader />

              <Divider label="or search a place" />

              <RouteSearch />

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => navigate('/explore')}
              >
                <Globe2 className="h-4 w-4" />
                Explore or draw on the 3D globe
              </Button>

              {route && (
                <div className="rounded-lg bg-muted/40 p-3 border border-border/60">
                  <ElevationProfile />
                </div>
              )}
              <RoutePreview />
            </CardContent>
          </Card>

          {/* Iconic climbs */}
          <Card className="animate-fadeUp [animation-delay:140ms]">
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

          {/* My Routes */}
          <Card className="animate-fadeUp [animation-delay:180ms]">
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

          {/* Training Log */}
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

          {/* Workout panel */}
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

              <TrainingPlans
                onRide={(w) => {
                  loadWorkout(w);
                  if (!route) useRideStore.getState().setRoute(makeDemoRoute());
                  navigate('/ride');
                }}
              />

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

          {/* AI Workout Designer */}
          <AIWorkoutDesigner />

          {/* Step 2: Trainer */}
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

          {/* Optional: standalone HR / cadence sensors */}
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

          {/* Step 3: Roll out */}
          <Card className={cn(canRide && 'ring-1 ring-accent/30')}>
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
                  variant={canRide ? 'accent' : 'outline'}
                  disabled={!canRide}
                  onClick={() => navigate('/ride')}
                  className="rounded-pill active:scale-[0.97] transition-transform"
                >
                  {canRide ? 'Enter the world' : 'Pick a route first'}
                  {canRide && <ArrowRight className="h-5 w-5" />}
                </Button>
                {!canRide && (
                  <span className="text-xs text-muted-foreground">Choose a route above to unlock</span>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ---- Right column: info ---- */}
        <aside className="space-y-5 md:col-span-2 lg:col-span-1 animate-fadeUp [animation-delay:60ms]">
          <Card>
            <CardHeader>
              <CardTitle>What's in the box</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Feature
                icon="🌍"
                title="3D globe with terrain + OSM buildings"
              >
                Powered by Cesium ion. Chase camera follows your bike along the route tangent.
              </Feature>
              <Feature
                icon="⚡"
                title="Real gradient → real resistance"
              >
                FTMS Simulation Mode pushed every 1–2 s to your Kickr Core, Tacx Neo, Saris H3,
                or any FTMS trainer.
              </Feature>
              <Feature
                icon="📊"
                title="Strava-ready .FIT export"
              >
                Per-second telemetry: position, power, cadence, HR, altitude. Upload straight to
                Strava or Garmin Connect.
              </Feature>
              <Feature
                icon="🚀"
                title="Demo Mode"
              >
                No trainer? GlobeRide solves the cycling-power equation and rides for you so you
                can experience the full product immediately.
              </Feature>
              <Feature
                icon="📱"
                title="Installable PWA"
              >
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
        </aside>
      </main>

      <footer className="px-4 sm:px-6 lg:px-10 py-4 border-t border-border/50 text-xs text-muted-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
        <span>MIT-licensed · made for cyclists who like the open web.</span>
        <span className="num opacity-60">v0.2.0</span>
      </footer>
    </div>
  );
}

/* ---- Local components ---- */

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
