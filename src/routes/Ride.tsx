import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { CesiumViewer } from '@/components/ride/CesiumViewer';
import { CesiumTokenPrompt } from '@/components/ride/CesiumTokenPrompt';
import { RideHUD } from '@/components/ride/RideHUD';
import { RideControls } from '@/components/ride/RideControls';
import { Minimap } from '@/components/ride/Minimap';
import { ElevationProfile } from '@/components/ride/ElevationProfile';
import { ThemeToggle } from '@/components/setup/ThemeToggle';
import { SoundToggle } from '@/components/ride/SoundToggle';
import { GhostToggle } from '@/components/ride/GhostToggle';
import { ConnectionStatus } from '@/components/ride/ConnectionStatus';
import { SensorStatusPills } from '@/components/trainer/SensorConnect';
import { ReplayBadge } from '@/components/ride/ReplayBadge';
import { SettingsButton } from '@/components/profile/SettingsPanel';
import { Button } from '@/components/ui/button';
import { useRideStore } from '@/stores/rideStore';
import { useRideLoop } from '@/hooks/useRideLoop';
import { useReplayLoop } from '@/hooks/useReplayLoop';
import { useWorkoutEngine } from '@/hooks/useWorkoutEngine';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useRideAudio } from '@/hooks/useRideAudio';
import { useRideHistoryRecorder } from '@/hooks/useRideHistoryRecorder';
import { useFtpTestSuggestion } from '@/hooks/useFtpTestSuggestion';
import { useRideKeyboardShortcuts } from '@/hooks/useRideKeyboardShortcuts';
import { WorkoutHUD } from '@/components/ride/WorkoutHUD';
import { RideShortcutsHelp } from '@/components/ride/RideShortcutsHelp';
import { FinishCard } from '@/components/ride/FinishCard';
import { cn } from '@/lib/utils';

const TOKEN_STORAGE_KEY = 'globeride.cesiumIonToken';

/**
 * Active ride view. Cesium full-bleed in the background; HUD + controls
 * float on top. Boots the requestAnimationFrame ride loop and a screen
 * wake lock for the duration of the run.
 */
export function Ride() {
  const navigate      = useNavigate();
  const route         = useRideStore((s) => s.route);
  const rideState     = useRideStore((s) => s.rideState);
  const replayData    = useRideStore((s) => s.replayData);
  const activeWorkout = useRideStore((s) => s.activeWorkout);

  // Run the replay loop when replay data is present; otherwise the live loop.
  // Both hooks are always called (Rules of Hooks) — each guards on its own
  // condition internally so only one does real work at a time.
  useRideLoop();
  useReplayLoop();
  useWorkoutEngine();
  useRideHistoryRecorder();
  useRideAudio();
  useFtpTestSuggestion();
  useWakeLock(rideState === 'running');

  const [helpOpen, setHelpOpen] = useState(false);
  useRideKeyboardShortcuts({ onToggleHelp: () => setHelpOpen((o) => !o) });

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
        <Button
          variant="ghost"
          size="sm"
          aria-label="Go back to route setup"
          onClick={() => navigate('/')}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back to setup
        </Button>
      </div>
    );
  }

  if (!route) return null;

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-background">
      <CesiumViewer ionToken={token} />

      {/* Paused dim veil — subtle darkening when ride is paused */}
      {rideState === 'paused' && (
        <div
          className="absolute inset-0 bg-background/30 backdrop-blur-[2px] pointer-events-none z-[1] transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 flex items-start justify-between gap-3 pointer-events-none z-[2]"
        style={{
          paddingTop:   'max(env(safe-area-inset-top), 0.75rem)',
          paddingLeft:  'max(env(safe-area-inset-left), 0.75rem)',
          paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        {/* Left cluster: nav + status chips */}
        <div className="flex flex-col gap-2 items-start pointer-events-auto">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Exit ride and return to setup"
              className="rounded-pill glass glass-hairline border-transparent text-foreground hover:text-foreground"
              onClick={() => navigate('/')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Exit
            </Button>
            <ThemeToggle />
            <SoundToggle />
            <GhostToggle />
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

        {/* Right: HUD column (tablet+) — scrollable if workout panel is tall */}
        <div
          className="hidden sm:flex flex-col gap-2 pointer-events-none w-full max-w-[22rem] md:max-w-[25rem] lg:max-w-[28rem] xl:max-w-[31rem] overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 6rem)' }}
        >
          <RideHUD />
          {activeWorkout && <WorkoutHUD />}
        </div>
      </div>

      {/* ── Mobile HUD — below the top bar ─────────────────────────────── */}
      <div
        className="sm:hidden absolute left-0 right-0 pointer-events-none z-[2]"
        style={{
          top:          'calc(max(env(safe-area-inset-top), 0.75rem) + 3.5rem)',
          paddingLeft:  'max(env(safe-area-inset-left), 0.75rem)',
          paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        <RideHUD />
        {activeWorkout && (
          <div className="mt-2">
            <WorkoutHUD />
          </div>
        )}
      </div>

      {/* ── Elevation profile — bottom-left ─────────────────────────────── */}
      <div
        className="absolute pointer-events-auto z-[2]"
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

      {/* ── Minimap — bottom-right ──────────────────────────────────────── */}
      <Minimap className="absolute bottom-[6rem] right-3 z-[2] pointer-events-none hidden sm:block" />

      {/* ── Transport controls — bottom-center ──────────────────────────── */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto z-[3]"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      >
        <RideControls />
      </div>

      {/* ── Finish overlay ──────────────────────────────────────────────── */}
      {rideState === 'finished' && <FinishCard />}

      {/* ── Keyboard shortcuts overlay ──────────────────────────────────── */}
      <RideShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

