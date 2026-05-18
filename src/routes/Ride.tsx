import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trophy, Star } from 'lucide-react';

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
  const navigate   = useNavigate();
  const route      = useRideStore((s) => s.route);
  const rideState  = useRideStore((s) => s.rideState);

  useRideLoop();
  useWakeLock(rideState === 'running');

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
      <div className="min-h-full flex flex-col items-center justify-center p-6 gap-5 bg-background">
        <CesiumTokenPrompt
          onSubmit={(t) => {
            window.localStorage.setItem(TOKEN_STORAGE_KEY, t);
            setToken(t);
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4" /> Back to setup
        </Button>
      </div>
    );
  }

  if (!route) return null;

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-background">
      <CesiumViewer ionToken={token} />

      {/* Top bar: exit + theme + settings + connection status */}
      <div
        className="absolute top-0 left-0 right-0 flex items-start justify-between gap-3 pointer-events-none"
        style={{
          paddingTop:   'max(env(safe-area-inset-top), 0.75rem)',
          paddingLeft:  'max(env(safe-area-inset-left), 0.75rem)',
          paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        {/* Left cluster */}
        <div className="flex flex-col gap-2 items-start pointer-events-auto">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-pill glass glass-hairline border-transparent text-foreground hover:text-foreground"
              onClick={() => navigate('/')}
            >
              <ChevronLeft className="h-4 w-4" /> Exit
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

        {/* Right: HUD (tablet+) */}
        <div className="hidden sm:block pointer-events-none w-full max-w-[22rem] md:max-w-[26rem] lg:max-w-[30rem] xl:max-w-[34rem]">
          <RideHUD />
        </div>
      </div>

      {/* Mobile-only HUD — below the top bar */}
      <div
        className="sm:hidden absolute left-0 right-0 pointer-events-none"
        style={{
          top:         'calc(max(env(safe-area-inset-top), 0.75rem) + 3.5rem)',
          paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
          paddingRight:'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        <RideHUD />
      </div>

      {/* Bottom-center: transport controls */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto z-10"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      >
        <RideControls />
      </div>

      {/* Bottom-left: elevation profile */}
      <div
        className="absolute pointer-events-auto sm:right-auto"
        style={{
          left:   'max(env(safe-area-inset-left), 0.75rem)',
          right:  'max(env(safe-area-inset-right), 0.75rem)',
          bottom: 'calc(max(env(safe-area-inset-bottom), 1.25rem) + 5rem)',
        }}
      >
        <div className="glass glass-hairline rounded-2xl p-3 sm:p-4 w-full sm:w-[26rem] md:w-[30rem] lg:w-[34rem] xl:w-[38rem] transition-all duration-300">
          <ElevationProfile />
        </div>
      </div>

      {/* Finish overlay */}
      {rideState === 'finished' && <FinishCard />}
    </div>
  );
}

/* ---- Finish card ---- */

function FinishCard() {
  const distance  = useRideStore((s) => s.distance);
  const elapsedMs = useRideStore((s) => s.elapsedMs);
  const samples   = useRideStore((s) => s.samples);
  const route     = useRideStore((s) => s.route);

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
    <div className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-md p-4 sm:p-6 z-20 animate-fadeIn">
      <Card className="max-w-md w-full ring-halo animate-scaleIn">
        <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-5">
          {/* Trophy icon */}
          <div className="relative">
            <div className="rounded-full bg-accent/12 p-4 text-accent ring-1 ring-accent/25 shadow-[0_0_28px_-8px_hsl(var(--accent)/0.45)]">
              <Trophy className="h-8 w-8" />
            </div>
            {/* Sparkle stars */}
            <Star className="absolute -top-1 -right-1 h-4 w-4 text-amber-400 fill-current opacity-90" />
            <Star className="absolute -bottom-1 -left-0.5 h-3 w-3 text-amber-300 fill-current opacity-70" />
          </div>

          <div>
            <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              Ride complete!
            </div>
            {route && (
              <div className="mt-1 text-sm text-muted-foreground truncate max-w-[22ch] mx-auto">
                {route.name}
              </div>
            )}
          </div>

          {/* Stats grid */}
          <div className="w-full grid grid-cols-3 gap-1 rounded-xl bg-muted/30 p-3">
            <FinishStat label="Distance"  value={formatDistance(distance)} />
            <FinishStat label="Time"      value={formatDuration(elapsedMs / 1000)} />
            <FinishStat label="Avg speed" value={`${msToKmh(avgSpeed).toFixed(1)} km/h`} accent />
            <FinishStat label="Avg power" value={`${Math.round(avgPower)} W`} accent />
            <FinishStat label="Samples"   value={samples.length.toLocaleString()} />
            <FinishStat label="Format"    value=".FIT" />
          </div>

          <RideControls />
        </CardContent>
      </Card>
    </div>
  );
}

function FinishStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`num font-bold text-sm ${accent ? 'text-accent' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}
