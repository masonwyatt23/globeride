import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trophy, Star, Zap, Activity, Heart, Mountain, ArrowUp, BatteryCharging } from 'lucide-react';

import { CesiumViewer } from '@/components/CesiumViewer';
import { CesiumTokenPrompt } from '@/components/CesiumTokenPrompt';
import { RideHUD } from '@/components/RideHUD';
import { RideControls } from '@/components/RideControls';
import { ElevationProfile } from '@/components/ElevationProfile';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { SensorStatusPills } from '@/components/SensorConnect';
import { ReplayBadge } from '@/components/ReplayBadge';
import { SettingsButton } from '@/components/SettingsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRideLoop } from '@/hooks/useRideLoop';
import { useReplayLoop } from '@/hooks/useReplayLoop';
import { useWorkoutEngine } from '@/hooks/useWorkoutEngine';
import { useWakeLock } from '@/hooks/useWakeLock';
import { WorkoutHUD } from '@/components/WorkoutHUD';
import { formatDistance, formatDuration, msToKmh, cn } from '@/lib/utils';
import { computeMetrics } from '@/lib/metrics';

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
  const replayData = useRideStore((s) => s.replayData);
  const activeWorkout = useRideStore((s) => s.activeWorkout);

  // Run the replay loop when replay data is present; otherwise the live loop.
  // Both hooks are always called (Rules of Hooks) — each guards on its own
  // condition internally so only one does real work at a time.
  useRideLoop();
  useReplayLoop();
  useWorkoutEngine();
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
          {replayData && <ReplayBadge />}
          <SensorStatusPills />
        </div>

        {/* Right: HUD (tablet+) */}
        <div className="hidden sm:block pointer-events-none w-full max-w-[22rem] md:max-w-[26rem] lg:max-w-[30rem] xl:max-w-[34rem]">
          <RideHUD />
          {activeWorkout && (
            <div className="mt-2">
              <WorkoutHUD />
            </div>
          )}
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
        {activeWorkout && (
          <div className="mt-2">
            <WorkoutHUD />
          </div>
        )}
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

// Compliance colour: green ≥ 97 %, amber 85-96 %, red < 85 %
function complianceColor(c: number | null): string {
  if (c === null) return 'text-muted-foreground';
  if (c >= 0.97) return 'text-emerald-500 dark:text-emerald-400';
  if (c >= 0.85) return 'text-amber-500 dark:text-amber-400';
  return 'text-rose-500 dark:text-rose-400';
}

function complianceBg(c: number | null): string {
  if (c === null) return '';
  if (c >= 0.97) return 'bg-emerald-500/10';
  if (c >= 0.85) return 'bg-amber-500/10';
  return 'bg-rose-500/10';
}

function FinishCard() {
  const distance     = useRideStore((s) => s.distance);
  const elapsedMs    = useRideStore((s) => s.elapsedMs);
  const samples      = useRideStore((s) => s.samples);
  const route        = useRideStore((s) => s.route);
  const activeWorkout = useRideStore((s) => s.activeWorkout);
  const ftpW         = useSettingsStore((s) => s.ftpW);

  const metrics = useMemo(
    () => computeMetrics(samples, ftpW, activeWorkout),
    [samples, ftpW, activeWorkout],
  );

  const avgSpeed =
    samples.length > 0
      ? samples.reduce((a, s) => a + (s.speed ?? 0), 0) / samples.length
      : 0;

  // IF zone badge
  const ifZone = (if_: number): { label: string; variant: 'muted' | 'success' | 'warning' | 'destructive' | 'accent' } => {
    if (if_ === 0) return { label: '—', variant: 'muted' };
    if (if_ < 0.75) return { label: 'Recovery', variant: 'muted' };
    if (if_ < 0.85) return { label: 'Endurance', variant: 'success' };
    if (if_ < 0.95) return { label: 'Tempo', variant: 'accent' };
    if (if_ < 1.05) return { label: 'Threshold', variant: 'warning' };
    return { label: 'VO2max+', variant: 'destructive' };
  };

  const zone = ifZone(metrics.intensityFactor);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-md p-4 sm:p-6 z-20 animate-fadeIn overflow-y-auto">
      <Card className="max-w-lg w-full ring-halo animate-scaleIn my-auto">
        <CardContent className="p-5 sm:p-7 flex flex-col gap-5">

          {/* ---- Hero header ---- */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="rounded-full bg-accent/12 p-3.5 text-accent ring-1 ring-accent/25 shadow-[0_0_28px_-8px_hsl(var(--accent)/0.45)]">
                <Trophy className="h-7 w-7" />
              </div>
              <Star className="absolute -top-1 -right-1 h-4 w-4 text-amber-400 fill-current opacity-90" />
              <Star className="absolute -bottom-1 -left-0.5 h-3 w-3 text-amber-300 fill-current opacity-70" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                Ride complete!
              </div>
              {route && (
                <div className="text-sm text-muted-foreground truncate">{route.name}</div>
              )}
            </div>
            {zone.label !== '—' && (
              <Badge variant={zone.variant} className="shrink-0 hidden sm:flex">
                {zone.label}
              </Badge>
            )}
          </div>

          {/* ---- Power hero trio (NP / IF / TSS) ---- */}
          {metrics.avgPowerW > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <PowerHero
                label="NP"
                value={`${metrics.normalizedPowerW}`}
                unit="W"
                tooltip="Normalized Power"
                accent
              />
              <PowerHero
                label="IF"
                value={metrics.intensityFactor.toFixed(2)}
                unit=""
                tooltip="Intensity Factor"
              />
              <PowerHero
                label="TSS"
                value={`${Math.round(metrics.tss)}`}
                unit=""
                tooltip="Training Stress Score"
              />
            </div>
          )}

          {/* ---- Secondary stats grid ---- */}
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/30 p-3">
            <FinishStat
              icon={<Zap className="h-3 w-3 text-amber-400" />}
              label="Avg W"
              value={metrics.avgPowerW > 0 ? `${Math.round(metrics.avgPowerW)}` : '—'}
            />
            <FinishStat
              icon={<Zap className="h-3 w-3 text-rose-400" />}
              label="Max W"
              value={metrics.maxPowerW > 0 ? `${metrics.maxPowerW}` : '—'}
            />
            <FinishStat
              icon={<Heart className="h-3 w-3 text-rose-500" />}
              label="Avg HR"
              value={metrics.avgHrBpm > 0 ? `${metrics.avgHrBpm}` : '—'}
              unit={metrics.avgHrBpm > 0 ? 'bpm' : undefined}
            />
            <FinishStat
              icon={<Activity className="h-3 w-3 text-primary" />}
              label="Cadence"
              value={metrics.avgCadenceRpm > 0 ? `${metrics.avgCadenceRpm}` : '—'}
              unit={metrics.avgCadenceRpm > 0 ? 'rpm' : undefined}
            />
            <FinishStat
              icon={<Mountain className="h-3 w-3 text-emerald-500" />}
              label="Ascent"
              value={`${Math.round(metrics.totalAscentM)}`}
              unit="m"
            />
            <FinishStat
              icon={<BatteryCharging className="h-3 w-3 text-sky-400" />}
              label="Work"
              value={metrics.workKj > 0 ? `${Math.round(metrics.workKj)}` : '—'}
              unit={metrics.workKj > 0 ? 'kJ' : undefined}
            />
            <FinishStat
              label="Distance"
              value={formatDistance(distance)}
            />
            <FinishStat
              label="Time"
              value={formatDuration(elapsedMs / 1000)}
            />
          </div>

          {/* ---- VI badge row ---- */}
          {metrics.avgPowerW > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span>Variability Index: <span className="num font-semibold text-foreground">{metrics.variabilityIndex.toFixed(2)}</span></span>
              <span className="opacity-40">·</span>
              <span>Avg speed: <span className="num font-semibold text-foreground">{msToKmh(avgSpeed).toFixed(1)} km/h</span></span>
              {metrics.maxHrBpm > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span>Max HR: <span className="num font-semibold text-foreground">{metrics.maxHrBpm} bpm</span></span>
                </>
              )}
            </div>
          )}

          {/* ---- Per-segment compliance table ---- */}
          {metrics.segments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Workout Segments
              </div>
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Segment</th>
                      <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Target</th>
                      <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Actual</th>
                      <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.segments.map((seg, i) => (
                      <tr
                        key={i}
                        className={cn(
                          'border-b border-border/20 last:border-0 transition-colors',
                          complianceBg(seg.compliance),
                        )}
                      >
                        <td className="px-3 py-1.5 text-foreground/80 truncate max-w-[10ch]">{seg.label}</td>
                        <td className="px-3 py-1.5 text-right num tabular-nums text-muted-foreground">
                          {seg.targetW !== null ? `${seg.targetW} W` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right num tabular-nums text-foreground">
                          {seg.actualW !== null ? `${Math.round(seg.actualW)} W` : '—'}
                        </td>
                        <td className={cn('px-3 py-1.5 text-right num tabular-nums font-semibold', complianceColor(seg.compliance))}>
                          {seg.compliance !== null ? `${Math.round(seg.compliance * 100)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- Export / Strava controls ---- */}
          <RideControls />
        </CardContent>
      </Card>
    </div>
  );
}

function PowerHero({
  label,
  value,
  unit,
  tooltip,
  accent = false,
}: {
  label: string;
  value: string;
  unit: string;
  tooltip: string;
  accent?: boolean;
}) {
  return (
    <div
      title={tooltip}
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-xl py-3 px-2',
        accent ? 'bg-accent/8 ring-1 ring-accent/20' : 'bg-muted/40',
      )}
    >
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn('num text-2xl sm:text-3xl font-bold leading-none tabular-nums', accent ? 'text-accent' : 'text-foreground')}>
        {value}
      </div>
      {unit && <div className="text-[10px] text-muted-foreground">{unit}</div>}
    </div>
  );
}

function FinishStat({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 px-1">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="num font-bold text-sm text-foreground tabular-nums leading-tight">
        {value}
        {unit && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
