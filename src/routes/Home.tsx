import { useNavigate } from 'react-router-dom';
import { ArrowRight, Github, Globe2 } from 'lucide-react';

import { GPXUploader } from '@/components/GPXUploader';
import { TrainerConnect } from '@/components/TrainerConnect';
import { ElevationProfile } from '@/components/ElevationProfile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRideStore } from '@/stores/rideStore';

/**
 * Landing / setup page. Three vertically-stacked panels on mobile, a 2-col
 * layout on desktop: pick a route, pair a trainer, jump into the ride.
 */
export function Home() {
  const navigate = useNavigate();
  const route = useRideStore((s) => s.route);
  const connection = useRideStore((s) => s.connection);
  const mode = useRideStore((s) => s.mode);

  const canRide = !!route;
  const willUseDemo = mode === 'demo' || connection !== 'connected';

  return (
    <div className="min-h-full w-full flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 border-b border-border/60">
        <div className="flex items-center gap-3">
          <Globe2 className="h-7 w-7 text-primary" />
          <div>
            <div className="text-lg font-bold tracking-tight text-foreground">GlobeRide</div>
            <div className="text-xs text-muted-foreground">
              Virtual cycling on a 3D Earth · open source
            </div>
          </div>
        </div>
        <a
          href="https://github.com/masonwyatt23/globeride"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="GitHub"
        >
          <Github className="h-5 w-5" />
        </a>
      </header>

      <main className="flex-1 px-6 py-8 max-w-6xl w-full mx-auto grid gap-6 lg:grid-cols-[1.1fr_0.9fr] auto-rows-min">
        <section className="space-y-5">
          <div>
            <Badge variant="default" className="mb-3">Phase 1 · MVP</Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Ride anywhere on Earth.
            </h1>
            <p className="mt-2 text-muted-foreground max-w-prose">
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
              {route && (
                <div className="rounded-lg bg-muted/30 p-3">
                  <ElevationProfile />
                </div>
              )}
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

        <aside className="space-y-4">
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

      <footer className="px-6 py-4 border-t border-border/60 text-xs text-muted-foreground flex items-center justify-between">
        <span>MIT-licensed · made for cyclists who like the open web.</span>
        <span className="num">v0.1.0</span>
      </footer>
    </div>
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
