import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Users } from 'lucide-react';

import { CesiumViewer } from '@/components/ride/CesiumViewer';
import { CesiumTokenPrompt } from '@/components/ride/CesiumTokenPrompt';
import { RideHUD } from '@/components/ride/RideHUD';
import { EnterVRButton } from '@/components/ride/EnterVRButton';
import { EnterARButton } from '@/components/ride/EnterARButton';
import { VRHud } from '@/components/ride/VRHud';
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
import { GestureLegend } from '@/components/ride/GestureLegend';
import { CameraSwitcher } from '@/components/ride/CameraSwitcher';
import { Button } from '@/components/ui/button';
import { useRideStore } from '@/stores/rideStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRideLoop } from '@/hooks/useRideLoop';
import { useReplayLoop } from '@/hooks/useReplayLoop';
import { useWorkoutEngine } from '@/hooks/useWorkoutEngine';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useRideAudio } from '@/hooks/useRideAudio';
import { useRideHistoryRecorder } from '@/hooks/useRideHistoryRecorder';
import { useFtpTestSuggestion } from '@/hooks/useFtpTestSuggestion';
import { useRideKeyboardShortcuts } from '@/hooks/useRideKeyboardShortcuts';
import { useHandlebarGestures } from '@/hooks/useHandlebarGestures';
import { WorkoutHUD } from '@/components/ride/WorkoutHUD';
import { RideShortcutsHelp } from '@/components/ride/RideShortcutsHelp';
import { FinishCard } from '@/components/ride/FinishCard';
import { useCompanionReceiver } from '@/hooks/useCompanionReceiver';
import { useGeolocationWatch } from '@/hooks/useGeolocationWatch';
import { useRaceRecorder } from '@/hooks/useRaceRecorder';
import { cancelSpeech } from '@/lib/speechSynthesis';
import { useVoiceControl } from '@/hooks/useVoiceControl';
import { VoiceControlButton } from '@/components/ride/VoiceControlButton';
import { useMultiriderSync } from '@/hooks/useMultiriderSync';
import { MultiRiderInvite } from '@/components/ride/MultiRiderInvite';
import { SegmentHUD } from '@/components/ride/SegmentHUD';
import { fetchSegmentsNearRoute } from '@/lib/strava/segments';
import { mapSegmentsToRoute } from '@/lib/segmentOverlay';
import { refreshAccessToken, stravaCredsPresent } from '@/lib/strava';

const TOKEN_STORAGE_KEY = 'globeride.cesiumIonToken';

/**
 * Active ride view. Cesium full-bleed in the background; HUD + controls
 * float on top. Boots the requestAnimationFrame ride loop and a screen
 * wake lock for the duration of the run.
 *
 * A global click handler cancels any in-progress commentary speech so the
 * user can dismiss the commentator by tapping anywhere.
 *
 * HUD overlays mounted:
 *   - Handlebar gesture detection on the main ride container (double-tap,
 *     long-press, two-finger swipe) — gated by settings.gestureControlsEnabled.
 *   - GestureLegend overlay (the "?" chip in the top-right corner of the
 *     ride canvas).
 *   - CameraSwitcher overlay (top-right, below gesture legend) — always shown.
 */
export function Ride() {
  const navigate      = useNavigate();
  const route         = useRideStore((s) => s.route);
  const rideState     = useRideStore((s) => s.rideState);
  const replayData    = useRideStore((s) => s.replayData);
  const activeWorkout = useRideStore((s) => s.activeWorkout);
  const rideMode      = useRideStore((s) => s.rideMode);

  const gestureControlsEnabled = useSettingsStore((s) => s.gestureControlsEnabled);

  // Ref for the main ride canvas container — used by gesture detection.
  const rideCanvasRef = useRef<HTMLDivElement>(null);

  // Viewer ref populated by CesiumViewer.onViewerReady — passed to
  // EnterVRButton / EnterARButton so they can call enter{VR,AR}(viewer)
  // without prop-drilling Cesium through the HUD tree.
  const [cesiumViewer, setCesiumViewer] = useState<import('cesium').Viewer | null>(null);

  // ---- Outdoor GPS watcher ----
  // Always called (Rules of Hooks). Only does work when rideMode === 'outdoor'.
  // The samples ref is passed to useRideLoop so the frame loop can consume GPS.
  const { samples: gpsSamples, error: gpsError } = useGeolocationWatch();
  // We use a ref so the RAF callback always sees the latest samples array
  // without re-subscribing the effect (no stale closure risk).
  const gpsSamplesRef = useRef(gpsSamples);
  gpsSamplesRef.current = gpsSamples;

  // Run the replay loop when replay data is present; otherwise the live loop.
  // Both hooks are always called (Rules of Hooks) -- each guards on its own
  // condition internally so only one does real work at a time.
  useRideLoop(rideMode === 'outdoor' ? gpsSamplesRef : undefined);
  useReplayLoop();
  useWorkoutEngine();
  useRideHistoryRecorder();
  useRaceRecorder();
  useMultiriderSync();
  useRideAudio();
  useCompanionReceiver();  // phone companion -- ingests phone HR/cadence + handles remote control
  useFtpTestSuggestion();
  useWakeLock(rideState === 'running');

  // ---- Handlebar gestures ----
  // Always called — the hook is a no-op when gestureControlsEnabled=false.
  useHandlebarGestures(rideCanvasRef, { enabled: gestureControlsEnabled });

  // ---- Voice control ----
  // Always called (Rules of Hooks). No-op when unsupported or setting is off.
  const { isListening, startListening, stopListening } = useVoiceControl();

  const [helpOpen, setHelpOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  useRideKeyboardShortcuts({ onToggleHelp: () => setHelpOpen((o) => !o) });

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fromEnv = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
    if (fromEnv.length > 0) return fromEnv;
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  });

  useEffect(() => {
    if (!route && rideMode !== 'outdoor') navigate('/');
  }, [route, rideMode, navigate]);

  // ---- Strava segment fetch ----
  // Fire once per route load, in the background. Ride continues on failure.
  useEffect(() => {
    if (!route || !stravaCredsPresent()) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await refreshAccessToken();
        if (cancelled) return;

        const stravaSegs = await fetchSegmentsNearRoute(route, token);
        if (cancelled || stravaSegs.length === 0) return;

        const routeSegments = mapSegmentsToRoute(stravaSegs, route);
        if (cancelled) return;

        useRideStore.getState().setLoadedSegments(routeSegments);
      } catch {
        // Strava unavailable — segment overlay is optional; ride continues.
      }
    })();

    return () => { cancelled = true; };
  }, [route]);

  // Surface GPS errors as toasts in outdoor mode.
  useEffect(() => {
    if (rideMode !== 'outdoor' || !gpsError) return;
    const msg =
      gpsError.code === 1
        ? 'Location permission denied. Allow location access in browser settings.'
        : gpsError.code === 2
          ? 'GPS position unavailable. Check that location services are enabled.'
          : 'GPS timed out. Move outdoors or check location settings.';
    useRideStore.getState().pushToast({
      kind: 'error',
      title: 'GPS error',
      message: msg,
      durationMs: 8_000,
    });
  }, [gpsError, rideMode]);

  // Cancel commentary speech on pause or finish so the user isn't talked at
  // while stopped. The useRideLoop cleanup handles the unmount case.
  useEffect(() => {
    if (rideState === 'paused' || rideState === 'finished') {
      cancelSpeech();
    }
  }, [rideState]);

  // Global click handler: tap anywhere to dismiss in-progress speech.
  useEffect(() => {
    const handler = () => cancelSpeech();
    document.addEventListener('click', handler, { capture: true, passive: true });
    return () => document.removeEventListener('click', handler, { capture: true });
  }, []);

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
    <div
      ref={rideCanvasRef}
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-background"
    >
      <CesiumViewer ionToken={token} onViewerReady={setCesiumViewer} />

      {/* Paused dim veil -- subtle darkening when ride is paused */}
      {rideState === 'paused' && (
        <div
          className="absolute inset-0 bg-background/30 backdrop-blur-[2px] pointer-events-none z-[1] transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* -- Top bar -------------------------------------------------------- */}
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
            <Button
              variant="outline"
              size="icon"
              aria-label="Invite a friend to ride with you"
              className="rounded-full glass glass-hairline border-transparent"
              onClick={() => setInviteOpen((o) => !o)}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
            </Button>
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

        {/* Right: HUD column (tablet+) -- scrollable if workout panel is tall */}
        <div
          className="hidden sm:flex flex-col gap-2 pointer-events-none w-full max-w-[22rem] md:max-w-[25rem] lg:max-w-[28rem] xl:max-w-[31rem] overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 6rem)' }}
        >
          <RideHUD />
          {activeWorkout && <WorkoutHUD />}
          {/* Strava Live Segments HUD */}
          <SegmentHUD />
        </div>
      </div>

      {/* -- Mobile HUD -- below the top bar -------------------------------- */}
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
        {/* Strava Live Segments HUD — mobile */}
        <div className="mt-2">
          <SegmentHUD />
        </div>
      </div>

      {/* -- Elevation profile -- bottom-left -------------------------------- */}
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

      {/* -- Minimap -- bottom-right ---------------------------------------- */}
      <Minimap className="absolute bottom-[6rem] right-3 z-[2] pointer-events-none hidden sm:block" />

      {/* -- Transport controls -- bottom-center ----------------------------- */}
      {/* z-50 (above every other HUD layer) so the Start ride button can
          never be intercepted by a stray sibling. pointer-events-auto on
          the wrapper means clicks always land on the button. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto z-50"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      >
        <RideControls />
      </div>

      {/* -- Gesture legend "?" chip + overlay ------------------- */}
      {gestureControlsEnabled && (
        <div className="absolute inset-0 pointer-events-none z-[4]">
          {/* GestureLegend positions itself absolutely within this container */}
          <div className="relative w-full h-full pointer-events-auto">
            <GestureLegend />
          </div>
        </div>
      )}

      {/* -- Camera switcher — top-right, below gesture chip ----- */}
      <div
        className="absolute pointer-events-auto z-[4]"
        style={{
          top:   'calc(max(env(safe-area-inset-top), 0.75rem) + 2.5rem)',
          right: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        <CameraSwitcher />
      </div>

      {/* -- Enter VR button — top-right, below camera switcher -- */}
      {/* Invisible on non-XR browsers (EnterVRButton returns null). */}
      <div
        className="absolute pointer-events-auto z-[4]"
        style={{
          top:   'calc(max(env(safe-area-inset-top), 0.75rem) + 6.5rem)',
          right: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        <EnterVRButton viewer={cesiumViewer} />
      </div>

      {/* -- Enter AR button — top-right, below VR button -------- */}
      {/* Invisible on non-AR browsers (EnterARButton returns null). */}
      <div
        className="absolute pointer-events-auto z-[4]"
        style={{
          top:   'calc(max(env(safe-area-inset-top), 0.75rem) + 10rem)',
          right: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        <EnterARButton viewer={cesiumViewer} />
      </div>

      {/* -- Voice control button — top-right, below AR button -- */}
      {/* Invisible on Firefox / unsupported browsers (returns null). */}
      <div
        className="absolute pointer-events-auto z-[4]"
        style={{
          top:   'calc(max(env(safe-area-inset-top), 0.75rem) + 13.5rem)',
          right: 'max(env(safe-area-inset-right), 0.75rem)',
        }}
      >
        <VoiceControlButton
          isListening={isListening}
          onToggle={isListening ? stopListening : startListening}
        />
      </div>

      {/* -- VR HUD overlay — visible only during XR session ------ */}
      <VRHud />

      {/* -- Finish overlay ------------------------------------------------- */}
      {rideState === 'finished' && <FinishCard />}

      {/* -- Keyboard shortcuts overlay ------------------------------------- */}
      <RideShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* -- Multi-rider invite overlay ---------------------------------------- */}
      {inviteOpen && <MultiRiderInvite onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
