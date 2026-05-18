import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trophy } from 'lucide-react';

import { CesiumViewer } from '@/components/CesiumViewer';
import { CesiumTokenPrompt } from '@/components/CesiumTokenPrompt';
import { RideHUD } from '@/components/RideHUD';
import { RideControls } from '@/components/RideControls';
import { ElevationProfile } from '@/components/ElevationProfile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useRideStore } from '@/stores/rideStore';
import { useRideLoop } from '@/hooks/useRideLoop';
import { useWakeLock } from '@/hooks/useWakeLock';
import { formatDistance, formatDuration, msToKmh } from '@/lib/utils';

const TOKEN_STORAGE_KEY = 'globeride.cesiumIonToken';

/**
 * Active ride view. Cesium full-bleed in the background; HUD + controls
 * float on top. Boots the requestAnimationFrame ride loop and a screen
 * wake lock for the duration of the run.
 */
export function Ride() {
  const navigate = useNavigate();
  const route = useRideStore((s) => s.route);
  const rideState = useRideStore((s) => s.rideState);

  useRideLoop();
  useWakeLock(rideState === 'running');

  // Cesium ion token bootstrap: env var → localStorage → prompt.
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fromEnv = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
    if (fromEnv.length > 0) return fromEnv;
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  });

  useEffect(() => {
    if (!route) navigate('/');
  }, [route, navigate]);

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

  if (!route) return null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <CesiumViewer ionToken={token} />

      {/* Top-left: back / route title */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-4 pointer-events-none">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full pointer-events-auto backdrop-blur"
          onClick={() => navigate('/')}
        >
          <ChevronLeft className="h-4 w-4" /> exit
        </Button>
        <div className="pointer-events-none max-w-xs w-full sm:w-80">
          <RideHUD />
        </div>
      </div>

      {/* Bottom-center: controls */}
      <div className="absolute left-1/2 bottom-6 -translate-x-1/2 pointer-events-auto">
        <RideControls />
      </div>

      {/* Bottom-left: elevation profile */}
      <div className="absolute left-4 right-4 sm:right-auto sm:w-[420px] bottom-24 sm:bottom-6 pointer-events-auto glass glass-hairline rounded-2xl p-3">
        <ElevationProfile />
      </div>

      {rideState === 'finished' && <FinishCard />}
    </div>
  );
}

function FinishCard() {
  const distance = useRideStore((s) => s.distance);
  const elapsedMs = useRideStore((s) => s.elapsedMs);
  const samples = useRideStore((s) => s.samples);

  const avgSpeed =
    samples.length > 0
      ? samples.reduce((a, s) => a + (s.speed ?? 0), 0) / samples.length
      : 0;
  const avgPower =
    samples.filter((s) => typeof s.power === 'number').length > 0
      ? samples.reduce((a, s) => a + (s.power ?? 0), 0) /
        samples.filter((s) => typeof s.power === 'number').length
      : 0;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm p-6 z-10">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 flex flex-col items-center text-center gap-3">
          <div className="rounded-full bg-accent/15 p-3 text-accent">
            <Trophy className="h-7 w-7" />
          </div>
          <div className="text-xl font-bold text-foreground">Ride complete</div>
          <div className="grid grid-cols-3 gap-4 w-full text-sm">
            <FinishStat label="distance" value={formatDistance(distance)} />
            <FinishStat label="time" value={formatDuration(elapsedMs / 1000)} />
            <FinishStat label="avg speed" value={`${msToKmh(avgSpeed).toFixed(1)} km/h`} />
            <FinishStat label="avg power" value={`${Math.round(avgPower)} W`} />
            <FinishStat label="samples" value={samples.length.toLocaleString()} />
            <FinishStat label="format" value=".FIT" />
          </div>
          <RideControls />
        </CardContent>
      </Card>
    </div>
  );
}

function FinishStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num font-semibold text-foreground">{value}</div>
    </div>
  );
}
