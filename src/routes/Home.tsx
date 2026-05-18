import { useNavigate } from 'react-router-dom';
import { ArrowRight, Library, Search, Bike, Weight, Wind, Sparkles, Globe2, PenLine, Dumbbell } from 'lucide-react';

import { AppHeader } from '@/components/AppHeader';
import { WorkoutBuilder } from '@/components/WorkoutBuilder';
import { WorkoutLibrary } from '@/components/WorkoutLibrary';
import { GPXUploader } from '@/components/GPXUploader';
import { FITUploader } from '@/components/FITUploader';
import { RouteSearch } from '@/components/RouteSearch';
import { TrainerConnect } from '@/components/TrainerConnect';
import { SensorConnect } from '@/components/SensorConnect';
import { ElevationProfile } from '@/components/ElevationProfile';
import { RouteLibrary } from '@/components/RouteLibrary';
import { SettingsButton } from '@/components/SettingsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRideStore } from '@/stores/rideStore';
import { makeDemoRoute } from '@/lib/sampleRoutes';
import { useSettingsStore, kgToLb, msToKmh, msToMph } from '@/stores/settingsStore';
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
          <Card>
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
                Explore on the 3D globe
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => navigate('/explore')}
                title="Draw a custom route by clicking on the 3D globe"
              >
                <PenLine className="h-4 w-4" />
                Draw a route on the map
              </Button>

              {route && (
                <div className="rounded-lg bg-muted/40 p-3 border border-border/60">
                  <ElevationProfile />
                </div>
              )}
            </CardContent>
          </Card>

          {/* My Routes */}
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
                  className="rounded-pill"
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
