import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trophy } from 'lucide-react';

import { CesiumViewer } from '@/components/CesiumViewer';
import { CesiumTokenPrompt } from '@/components/CesiumTokenPrompt';
import { RideHUD } from '@/components/RideHUD';
import { RideControls } from '@/components/RideControls';
import { ElevationProfile } from '@/components/ElevationProfile';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { SettingsButton } from '@/components/SettingsPanel';
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
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-background">
      <CesiumViewer ionToken={token} />

      {/* Top-left: exit + theme toggle + settings + connection status (always
          visible). Pointer events scoped so the rest of the overlay doesn't
          eat globe interactions. */}
      <div
        className="absolute top-0 left-0 right-0 flex items-start justify-between gap-3 pointer-events-none"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 0.75rem)',
          paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
          paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        <div className="flex flex-col gap-2 items-start pointer-events-auto">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full glass glass-hairline border-transparent"
              onClick={() => navigate('/')}
            >
              <ChevronLeft className="h-4 w-4" /> exit
            </Button>
            <ThemeToggle />
            <SettingsButton
              variant="outline"
              size="icon"
              className="rounded-full glass glass-hairline border-transparent"
            />
          </div>
          <ConnectionStatus compact />
        </div>

        {/* Tablet+: HUD anchored top-right next to the action row. */}
        <div className="hidden sm:block pointer-events-none w-full max-w-[22rem] md:max-w-[26rem] lg:max-w-[30rem] xl:max-w-[34rem]">
          <RideHUD />
        </div>
      </div>

      {/* Mobile-only: HUD slides below the top bar so the row doesn't cram. */}
      <div
        className="sm:hidden absolute left-0 right-0 pointer-events-none"
        style={{
          top: 'calc(max(env(safe-area-inset-top), 0.75rem) + 3.5rem)',
          paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
          paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        <RideHUD />
      </div>

      {/* Bottom-center: controls. Sits above safe-area + elevation card. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto z-10"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      >
        <RideControls />
      </div>

      {/* Bottom-left: elevation profile. Full-width on phones, fixed width
          from sm: up so it doesn't smother the controls in landscape. */}
      <div
        className="absolute pointer-events-auto sm:right-auto"
        style={{
          left: 'max(env(safe-area-inset-left), 0.75rem)',
          right: 'max(env(safe-area-inset-right), 0.75rem)',
          bottom: 'calc(max(env(safe-area-inset-bottom), 1.25rem) + 5rem)',
        }}
      >
        <div className="glass glass-hairline rounded-2xl p-3 sm:p-4 w-full sm:w-[26rem] md:w-[30rem] lg:w-[34rem] xl:w-[38rem] transition-all duration-300">
          <ElevationProfile />
        </div>
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
    <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-md p-4 sm:p-6 z-20 animate-fadeIn">
      <Card className="max-w-md w-full ring-halo animate-scaleIn">
        <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
          <div className="rounded-full bg-accent/15 p-3.5 text-accent ring-1 ring-accent/30">
            <Trophy className="h-7 w-7" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-foreground">Ride complete</div>
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
