import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft } from 'lucide-react';

import { CesiumViewer } from '@/components/ride/CesiumViewer';
import { CesiumTokenPrompt } from '@/components/ride/CesiumTokenPrompt';
import { RouteSearch } from '@/components/setup/RouteSearch';
import { RouteDrawer } from '@/components/routes/RouteDrawer';
import { Button } from '@/components/ui/button';
import { useRideStore } from '@/stores/rideStore';
import { ExploreMarkers } from '@/components/explore/ExploreMarkers';
import { ExploreIntro } from '@/components/explore/ExploreIntro';

const TOKEN_STORAGE_KEY = 'globeride.cesiumIonToken';

/**
 * Explore mode — full-bleed globe with a floating Nominatim search +
 * route generator. Selecting a place flies the camera, then a route
 * can be built that plugs straight into the existing ride pipeline.
 */
export function Explore() {
  const navigate     = useNavigate();
  const route        = useRideStore((s) => s.route);
  const requestFlyTo = useRideStore((s) => s.requestFlyTo);

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fromEnv = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
    if (fromEnv.length > 0) return fromEnv;
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  });

  useEffect(() => {
    return () => { requestFlyTo(null); };
  }, [requestFlyTo]);

  if (!token) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 gap-5 bg-background">
        <CesiumTokenPrompt
          onSubmit={(t) => {
            window.localStorage.setItem(TOKEN_STORAGE_KEY, t);
            setToken(t);
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => navigate('/app')}>
          <ChevronLeft className="h-4 w-4" /> Back to setup
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <CesiumViewer ionToken={token} />
      {/* Discovery overlay — pulsing globe pins for every curated route */}
      <ExploreMarkers />
      {/* Intro caption pill */}
      <ExploreIntro />

      {/* Top overlay: back + search */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-4 pointer-events-none">
        <Button
          variant="outline"
          size="sm"
          className="rounded-pill pointer-events-auto glass glass-hairline border-transparent text-foreground"
          onClick={() => navigate('/app')}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <div className="pointer-events-auto w-full max-w-sm">
          <RouteSearch variant="overlay" />
        </div>
        <RouteDrawer variant="overlay" onRouteReady={() => navigate('/ride')} />
      </div>

      {/* Bottom CTA: ride this route */}
      {route && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto animate-fadeUp">
          <Button
            size="lg"
            variant="accent"
            onClick={() => navigate('/ride')}
            className="rounded-pill shadow-[0_8px_32px_-8px_hsl(var(--accent)/0.6)] hover:shadow-[0_12px_36px_-8px_hsl(var(--accent)/0.65)]"
          >
            Ride "{route.name}"
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
