import { useNavigate } from 'react-router-dom';
import { ArrowRight, Library, Search, Bike, Weight, Wind, PenLine } from 'lucide-react';

import { AppHeader } from '@/components/AppHeader';
import { GPXUploader } from '@/components/GPXUploader';
import { RouteSearch } from '@/components/RouteSearch';
import { TrainerConnect } from '@/components/TrainerConnect';
import { ElevationProfile } from '@/components/ElevationProfile';
import { RouteLibrary } from '@/components/RouteLibrary';
import { SettingsButton } from '@/components/SettingsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore, kgToLb, msToKmh, msToMph } from '@/stores/settingsStore';

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
      {/* Ambient gradient backdrop — purely decorative, gives the page a sense
          of depth without an opaque hero image. Sits behind everything. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-primary/15 dark:bg-primary/20 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[26rem] w-[26rem] rounded-full bg-accent/15 dark:bg-accent/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[22rem] w-[22rem] rounded-full bg-sky-400/10 dark:bg-sky-500/10 blur-3xl" />
      </div>

      <AppHeader />

      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 w-full max-w-7xl mx-auto grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr] auto-rows-min">
        <section className="space-y-5 md:col-span-2 lg:col-span-1">
          <div>
            <Badge variant="default" className="mb-3">Phase 2 · Polish</Badge>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.05]">
              Ride anywhere on Earth.
            </h1>
            <p className="mt-3 text-muted-foreground max-w-prose text-sm sm:text-base leading-relaxed">
              Upload any GPX from Strava, Komoot or Garmin. GlobeRide renders
              the route on a photorealistic 3D globe, drives the real gradient
              into your smart trainer over Web Bluetooth, and exports a
              Strava-compatible .FIT when you're done.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>1 · Pick a route</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <GPXUploader />

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  or search a place
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>

              <RouteSearch />

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => navigate('/explore')}
              >
                <Search className="h-4 w-4" />
                Explore on the globe
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => navigate('/explore')}
                title="Draw a custom route by clicking on the 3D globe"
              >
                <PenLine className="h-4 w-4" />
                Draw a route on the map
              </Button>

              {route && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <ElevationProfile />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Library className="h-4 w-4 text-primary" />
                My Routes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RouteLibrary />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2 · Pair your smart trainer</CardTitle>
            </CardHeader>
            <CardContent>
              <TrainerConnect />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3 · Roll out</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {willUseDemo
                  ? 'No trainer connected — Demo Mode will simulate power and speed for you.'
                  : 'Trainer connected. Gradients will stream in real time.'}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Chip icon={<Weight className="h-3 w-3" />} label={totalMassDisplay} />
                <Chip
                  icon={<Bike className="h-3 w-3" />}
                  label={`${settings.bikeType.toUpperCase()} · ${settings.riderPosition}`}
                />
                <Chip icon={<Wind className="h-3 w-3" />} label={windDisplay} />
                <SettingsButton variant="ghost" size="sm" showLabel />
              </div>
              <Button
                size="lg"
                variant="accent"
                disabled={!canRide}
                onClick={() => navigate('/ride')}
                className="self-start"
              >
                {canRide ? 'Enter the world' : 'Pick a route first'}
                <ArrowRight className="h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4 md:col-span-2 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>What's in the box</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Feature title="3D globe with terrain + OSM buildings">
                Powered by Cesium ion. Sweeping camera follows your bike along
                the route tangent.
              </Feature>
              <Feature title="Real gradient → real resistance">
                FTMS Simulation Mode is pushed every 1–2 s to your Kickr Core,
                Tacx Neo, Saris H3, or any FTMS-compliant trainer.
              </Feature>
              <Feature title="Strava-ready .FIT export">
                Per-second telemetry — position, power, cadence, HR, altitude.
                Upload straight to Strava or Garmin Connect.
              </Feature>
              <Feature title="Demo Mode">
                No trainer? GlobeRide will solve the cycling-power equation and
                ride for you so you can test the experience.
              </Feature>
              <Feature title="Installable PWA">
                Add to home screen on iPad next to the trainer; works fully
                offline once cached.
              </Feature>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Browser support</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Web Bluetooth ships in <strong className="text-foreground">Chrome</strong> and{' '}
                <strong className="text-foreground">Edge</strong> on desktop &amp; Android.
                Safari and iOS do not expose Web Bluetooth — use Demo Mode there.
              </p>
              <p>
                Cesium needs WebGL2; nearly every modern device qualifies.
              </p>
            </CardContent>
          </Card>
        </aside>
      </main>

      <footer className="px-4 sm:px-6 lg:px-10 py-4 border-t border-border/60 text-xs text-muted-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
        <span>MIT-licensed · made for cyclists who like the open web.</span>
        <span className="num">v0.2.0</span>
      </footer>
    </div>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/40 px-2 py-0.5 text-foreground">
      {icon}
      <span className="num">{label}</span>
    </span>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="font-medium text-foreground">{title}</div>
      <div className="text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}
