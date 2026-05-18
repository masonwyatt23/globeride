import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft } from 'lucide-react';

import { CesiumViewer } from '@/components/CesiumViewer';
import { CesiumTokenPrompt } from '@/components/CesiumTokenPrompt';
import { RouteSearch } from '@/components/RouteSearch';
import { Button } from '@/components/ui/button';
import { useRideStore } from '@/stores/rideStore';

const TOKEN_STORAGE_KEY = 'globeride.cesiumIonToken';

/**
 * Explore mode — full-bleed globe with a floating Nominatim search + route
 * generator. Selecting a place flies the camera, then a route can be built
 * around that point that plugs straight into the existing ride pipeline.
 */
export function Explore() {
  const navigate = useNavigate();
  const route = useRideStore((s) => s.route);
  const requestFlyTo = useRideStore((s) => s.requestFlyTo);

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fromEnv = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
    if (fromEnv.length > 0) return fromEnv;
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  });

  // Clear any leftover fly-to pin from a prior session.
  useEffect(() => {
    return () => {
      requestFlyTo(null);
    };
  }, [requestFlyTo]);

  if (!token) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 gap-4">
        <CesiumTokenPrompt
          onSubmit={(t) => {
            window.localStorage.setItem(TOKEN_STORAGE_KEY, t);
            setToken(t);
          }}
        />
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4" /> back to setup
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <CesiumViewer ionToken={token} />

      <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-4 pointer-events-none">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full pointer-events-auto backdrop-blur"
          onClick={() => navigate('/')}
        >
          <ChevronLeft className="h-4 w-4" /> back
        </Button>
        <div className="pointer-events-auto w-full max-w-sm">
          <RouteSearch variant="overlay" />
        </div>
      </div>

      {route && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
          <Button
            size="lg"
            variant="accent"
            onClick={() => navigate('/ride')}
            className="shadow-2xl"
          >
            Ride “{route.name}”
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
