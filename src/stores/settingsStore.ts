import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BikeType, RiderPosition } from '@/lib/physics';
import { type AvatarColors, DEFAULT_AVATAR_COLORS } from '@/lib/avatarConfig';
import type { GraphicsQuality } from '@/lib/graphicsQuality';
import type { LowLightSetting } from '@/lib/lowLightMode';
import { type CameraMode, isCameraMode } from '@/lib/cesiumCameras';

/** Unit system for HUD + Settings UI. The physics engine is always SI. */
export type UnitSystem = 'metric' | 'imperial';

export interface RiderSettings {
  /** Rider body mass, kg. The UI may render this in lbs. */
  riderMassKg: number;
  /** Bike mass, kg. */
  bikeMassKg: number;
  bikeType: BikeType;
  riderPosition: RiderPosition;
  /** Drivetrain efficiency, 0-1. */
  drivetrainEff: number;
  /** Air density, kg/m3 (1.225 = sea level, 15 C). */
  rho: number;
  /** Wind speed magnitude, m/s. */
  windSpeedMs: number;
  /** Wind heading relative to the rider, degrees. 0 = headwind, 180 = tailwind. */
  windDirectionDeg: number;
  /** Constant pedal power used by Demo Mode, W. */
  demoPowerW: number;
  /** Functional Threshold Power, W -- the basis for %FTP workout targets. */
  ftpW: number;
  /** Display unit system. */
  units: UnitSystem;
  /** Procedural-avatar appearance (jersey / frame / wheel / helmet colours). */
  avatar: AvatarColors;
  /** 3-D globe rendering quality tier. */
  graphicsQuality: GraphicsQuality;
  /** Automatically upload the .FIT to Strava when a ride finishes (requires Strava connected). */
  autoUploadStrava: boolean;
  /** Currently equipped helmet id -- defaults to the level-0 starter. */
  helmetId: string;
  /** Free-form training goal persisted for the AI coach (e.g. "build base for a century"). */
  coachGoal: string;
  // ---- Live AI commentary (Wave 28) ----
  /** Whether live AI race commentary is enabled. */
  liveCommentaryEnabled: boolean;
  /** Commentary volume, 0-100. */
  commentaryVolume: number;
  /** Speech rate, 80-120 (maps to 0.8-1.2 on the Web Speech API). */
  commentaryRate: number;
  /** Minimum seconds between commentary lines, 30-90. */
  commentaryThrottleSec: number;
  // ---- Display & Gestures (Wave 29.B) ----
  /**
   * Low-light HUD mode.
   *   'auto' — enable automatically between 18:00–06:00 local time.
   *   'on'   — always on.
   *   'off'  — always off.
   */
  lowLightHud: LowLightSetting;
  /** Whether handlebar gesture controls are active during a ride. */
  gestureControlsEnabled: boolean;
  // ---- Voice cues (Wave 29.C) ----
  /** Whether spoken workout segment transition cues are enabled. */
  workoutVoiceCuesEnabled: boolean;
  /** Whether spoken climb detection announcements are enabled. */
  climbAnnouncementsEnabled: boolean;
  // ---- Camera mode (Wave 30.A) ----
  /** Active cinematic camera mode — persisted between rides. */
  cameraMode: CameraMode;
}

export const DEFAULT_SETTINGS: RiderSettings = {
  riderMassKg: 75,
  bikeMassKg: 8,
  bikeType: 'road',
  riderPosition: 'hoods',
  drivetrainEff: 0.97,
  rho: 1.225,
  windSpeedMs: 0,
  windDirectionDeg: 0,
  demoPowerW: 190,
  ftpW: 220,
  units: 'metric',
  avatar: DEFAULT_AVATAR_COLORS,
  graphicsQuality: 'high' as GraphicsQuality,
  autoUploadStrava: true,
  helmetId: 'helmet-starter',
  coachGoal: '',
  liveCommentaryEnabled: true,
  commentaryVolume: 70,
  commentaryRate: 100,
  commentaryThrottleSec: 45,
  lowLightHud: 'auto',
  gestureControlsEnabled: true,
  workoutVoiceCuesEnabled: true,
  climbAnnouncementsEnabled: true,
  cameraMode: 'chase',
};

type CommentaryPatch = Partial<
  Pick<
    RiderSettings,
    | 'liveCommentaryEnabled'
    | 'commentaryVolume'
    | 'commentaryRate'
    | 'commentaryThrottleSec'
  >
>;

interface SettingsStoreState extends RiderSettings {
  setSettings: (patch: Partial<RiderSettings>) => void;
  /** Dedicated setter for commentary fields -- convenience for CommentarySettings UI. */
  setCommentarySettings: (patch: CommentaryPatch) => void;
  /** Set the low-light HUD mode. */
  setLowLightHud: (mode: LowLightSetting) => void;
  /** Toggle handlebar gesture controls on/off. */
  setGestureControlsEnabled: (enabled: boolean) => void;
  /** Set the active camera mode (Wave 30.A). */
  setCameraMode: (mode: CameraMode) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setSettings: (patch) => set((s) => ({ ...s, ...patch })),
      setCommentarySettings: (patch) => set((s) => ({ ...s, ...patch })),
      setLowLightHud: (mode) => set({ lowLightHud: mode }),
      setGestureControlsEnabled: (enabled) => set({ gestureControlsEnabled: enabled }),
      setCameraMode: (mode) => set({ cameraMode: mode }),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'globeride.settings.v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Graceful migration: new fields default if missing in existing localStorage.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<SettingsStoreState>),
        // Ensure commentary fields default when upgrading from pre-Wave-28 saves.
        liveCommentaryEnabled:
          (persisted as Partial<RiderSettings>).liveCommentaryEnabled ??
          DEFAULT_SETTINGS.liveCommentaryEnabled,
        commentaryVolume:
          (persisted as Partial<RiderSettings>).commentaryVolume ??
          DEFAULT_SETTINGS.commentaryVolume,
        commentaryRate:
          (persisted as Partial<RiderSettings>).commentaryRate ??
          DEFAULT_SETTINGS.commentaryRate,
        commentaryThrottleSec:
          (persisted as Partial<RiderSettings>).commentaryThrottleSec ??
          DEFAULT_SETTINGS.commentaryThrottleSec,
        // Ensure Wave-29.B fields default when upgrading from pre-Wave-29.B saves.
        lowLightHud:
          (persisted as Partial<RiderSettings>).lowLightHud ??
          DEFAULT_SETTINGS.lowLightHud,
        gestureControlsEnabled:
          (persisted as Partial<RiderSettings>).gestureControlsEnabled ??
          DEFAULT_SETTINGS.gestureControlsEnabled,
        // Graceful migration for Wave 29.C fields.
        workoutVoiceCuesEnabled:
          (persisted as Partial<RiderSettings>).workoutVoiceCuesEnabled ??
          DEFAULT_SETTINGS.workoutVoiceCuesEnabled,
        climbAnnouncementsEnabled:
          (persisted as Partial<RiderSettings>).climbAnnouncementsEnabled ??
          DEFAULT_SETTINGS.climbAnnouncementsEnabled,
        // Graceful migration for Wave 30.A camera mode. Validate against the
        // CameraMode union so a corrupted localStorage value can't slip through
        // and cause computeCameraPose() to return undefined.
        cameraMode: isCameraMode((persisted as Partial<RiderSettings>).cameraMode)
          ? (persisted as Partial<RiderSettings>).cameraMode!
          : DEFAULT_SETTINGS.cameraMode,
      }),
      partialize: (s) =>
        ({
          riderMassKg: s.riderMassKg,
          bikeMassKg: s.bikeMassKg,
          bikeType: s.bikeType,
          riderPosition: s.riderPosition,
          drivetrainEff: s.drivetrainEff,
          rho: s.rho,
          windSpeedMs: s.windSpeedMs,
          windDirectionDeg: s.windDirectionDeg,
          demoPowerW: s.demoPowerW,
          ftpW: s.ftpW,
          units: s.units,
          avatar: s.avatar,
          graphicsQuality: s.graphicsQuality,
          autoUploadStrava: s.autoUploadStrava,
          helmetId: s.helmetId,
          coachGoal: s.coachGoal,
          liveCommentaryEnabled: s.liveCommentaryEnabled,
          commentaryVolume: s.commentaryVolume,
          commentaryRate: s.commentaryRate,
          commentaryThrottleSec: s.commentaryThrottleSec,
          lowLightHud: s.lowLightHud,
          gestureControlsEnabled: s.gestureControlsEnabled,
          workoutVoiceCuesEnabled: s.workoutVoiceCuesEnabled,
          climbAnnouncementsEnabled: s.climbAnnouncementsEnabled,
          cameraMode: s.cameraMode,
        }) satisfies RiderSettings,
    },
  ),
);

// ---------------------------------------------------------------------------
// Unit conversion helpers.
// ---------------------------------------------------------------------------

export const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export const MS_PER_KMH = 1 / 3.6;
export const MS_PER_MPH = 0.44704;

export function msToKmh(mps: number): number {
  return mps / MS_PER_KMH;
}

export function msToMph(mps: number): number {
  return mps / MS_PER_MPH;
}
