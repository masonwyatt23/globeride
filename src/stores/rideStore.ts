import { create } from 'zustand';
import type {
  ConnectionState,
  RideMode,
  RideState,
  Route,
  TelemetrySample,
  Toast,
  TrainerData,
} from '@/types';
import type { ParsedFit } from '@/lib/fitParser';
import type { SensorConnectionStatus } from '@/lib/bleSensors';
import type { TrainerControlMode } from '@/lib/ftms';
import type { Workout } from '@/lib/workout';

/** A camera target requested by the route-search flow. */
export interface FlyToTarget {
  /** Bumps every time a new fly-to is requested, even to the same coords. */
  id: number;
  lat: number;
  lon: number;
  /** [south, north, west, east] in degrees. */
  boundingBox?: [number, number, number, number];
  /** Human label shown as an overlay pin. */
  label?: string;
}

interface RideStoreState {
  // ---- Route & ride lifecycle ----
  route: Route | null;
  rideState: RideState;
  mode: RideMode;
  startedAt: number | null;
  /** Wall-clock ms accumulated while running (excludes pauses). */
  elapsedMs: number;
  /** Cumulative distance ridden, m. */
  distance: number;
  /** Pending camera fly-to request — consumed by the Cesium viewer. */
  flyToTarget: FlyToTarget | null;

  // ---- Live telemetry (last sample) ----
  speed: number;          // m/s
  power: number;          // W
  cadence: number;        // rpm
  heartRate: number | null;
  grade: number;          // %
  elevation: number;      // m above ellipsoid
  /** Last sent grade to the trainer, used to throttle writes. */
  lastSentGrade: number;

  // ---- Recorded telemetry ----
  samples: TelemetrySample[];

  // ---- Trainer connection ----
  connection: ConnectionState;
  deviceName: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  /** 0 when not reconnecting; 1..N during the auto-reconnect loop. */
  reconnectAttempt: number;
  reconnectMaxAttempts: number;
  /** Trainer battery 0..100 when GATT exposes the Battery Service; else null. */
  batteryLevel: number | null;
  /** Wall-clock ms of the last `connected` transition — drives uptime UI. */
  connectedAt: number | null;

  // ---- Toast queue ----
  toasts: Toast[];

  // ---- Route library ----
  /** Monotonic counter bumped whenever the library is mutated; subscribers re-fetch. */
  libraryVersion: number;

  // ---- Draw-route mode ----
  /** Whether the user is actively drawing a route on the globe. */
  drawModeActive: boolean;
  /** Actions to toggle draw mode from any component. */
  setDrawModeActive: (active: boolean) => void;

  // ---- Replay (ADDITIVE) ----
  /**
   * When non-null the ride is a replay session. Contains the full parsed FIT
   * telemetry track. The replay loop reads from this instead of computing
   * physics. Null during a normal live ride.
   */
  replayData: ParsedFit | null;
  /**
   * Index into replayData.samples pointing at the "current" sample.
   * Advances each frame in the replay loop.
   */
  replayIndex: number;
  /** Action: load a parsed FIT as the replay source and enter ready state. */
  loadReplay: (fit: ParsedFit) => void;
  /** Action: clear replay data and return to normal ride state. */
  clearReplay: () => void;

  // ---- ADDITIVE: Standalone BLE sensor state ----
  /**
   * Connection status for the dedicated Heart Rate Monitor sensor.
   * Independent of the FTMS trainer connection.
   *
   * Override/fallback rule:
   *   - When hrSensorStatus === 'connected', heartRate is sourced from
   *     hrSensorValue (set by ingestHrSensorData).
   *   - When hrSensorStatus !== 'connected', heartRate falls back to
   *     whatever ingestTrainerData / tick provides from the FTMS stream.
   *   - On sensor disconnect/error, hrSensorValue is cleared to null so
   *     the HUD immediately shows the trainer-derived value (or '—' if
   *     the trainer also has none).
   */
  hrSensorStatus: SensorConnectionStatus;
  /** Device name of the paired HR sensor, or null when not paired. */
  hrSensorDeviceName: string | null;
  /**
   * Live HR value from the dedicated sensor (bpm).
   * null = no reading yet / sensor disconnected.
   */
  hrSensorValue: number | null;

  /**
   * Connection status for the dedicated Cadence/Speed sensor.
   * Independent of the FTMS trainer connection.
   *
   * Override/fallback rule:
   *   - When cadenceSensorStatus === 'connected', cadence is sourced from
   *     cadenceSensorValue (set by ingestCadenceSensorData).
   *   - When cadenceSensorStatus !== 'connected', cadence falls back to
   *     whatever ingestTrainerData / tick provides from the FTMS stream.
   *   - On sensor disconnect/error, cadenceSensorValue is cleared to null
   *     so the HUD immediately falls back to the trainer-derived value.
   */
  cadenceSensorStatus: SensorConnectionStatus;
  /** Device name of the paired cadence sensor, or null when not paired. */
  cadenceSensorDeviceName: string | null;
  /**
   * Live cadence value from the dedicated sensor (rpm).
   * null = no reading yet / sensor disconnected.
   */
  cadenceSensorValue: number | null;

  // ---- ADDITIVE: ERG/SIM trainer control state ----
  /**
   * Current trainer control mode.
   *   'erg' = the workout engine drives power via setTargetPower (opcode 0x05).
   *   'sim' = the ride loop drives gradient via setSimulationParams (opcode 0x11).
   * Defaults to 'sim' so existing behaviour is unchanged.
   */
  trainerControlMode: TrainerControlMode;
  /**
   * The power target most recently sent to the trainer in ERG mode, watts.
   * null when not in ERG mode or no target has been set yet.
   * Read by ConnectionStatus / TrainerConnect to show current target in the HUD.
   */
  targetPowerW: number | null;

  // ---- ADDITIVE: Workout engine state ----
  /**
   * The workout currently bound to this ride session.
   * null = normal free-ride (no structured workout active).
   * Set before starting a ride via loadWorkout / clearWorkout.
   */
  activeWorkout: Workout | null;
  /**
   * True while the workout engine is driving the trainer.
   * Acts as a mutual-exclusion guard: useRideLoop bails when this is true
   * (same pattern as replayData), and useWorkoutEngine owns tick() instead.
   */
  workoutRunning: boolean;
  /** Elapsed seconds into the active workout (driven by useWorkoutEngine). */
  workoutElapsedSec: number;
  /** Last resolved target watts for the HUD. null = no ERG target (grade/free). */
  workoutTargetWatts: number | null;
  /** Action: attach a workout to the current ride session. */
  loadWorkout: (workout: Workout) => void;
  /** Action: detach the workout and return to free-ride. */
  clearWorkout: () => void;
  /** Action: set workoutRunning flag (called by useWorkoutEngine). */
  setWorkoutRunning: (running: boolean) => void;
  /** Action: advance workout elapsed time (called each frame by useWorkoutEngine). */
  advanceWorkoutElapsed: (dt: number) => void;
  /** Action: update the last resolved ERG target for the HUD. */
  setWorkoutTargetWatts: (watts: number | null) => void;

  // ---- Actions ----
  setRoute: (route: Route | null) => void;
  bumpLibrary: () => void;
  setMode: (mode: RideMode) => void;
  setConnection: (
    s: ConnectionState,
    info?: { deviceName?: string | null; error?: string | null; code?: string | null },
  ) => void;
  setBatteryLevel: (level: number | null) => void;
  setReconnect: (attempt: number, maxAttempts: number) => void;
  ingestTrainerData: (data: TrainerData) => void;
  requestFlyTo: (target: Omit<FlyToTarget, 'id'> | null) => void;

  prepare: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  reset: () => void;

  /** Called once per frame by useRideLoop. */
  tick: (input: TickInput) => void;

  // ---- ADDITIVE: Sensor actions ----
  /** Update HR sensor connection status and optionally set device name. */
  setHrSensorStatus: (status: SensorConnectionStatus, deviceName?: string | null) => void;
  /** Push a new HR reading from the dedicated sensor. */
  ingestHrSensorData: (bpm: number) => void;
  /** Update cadence sensor connection status and optionally set device name. */
  setCadenceSensorStatus: (status: SensorConnectionStatus, deviceName?: string | null) => void;
  /** Push a new cadence reading from the dedicated sensor. */
  ingestCadenceSensorData: (rpm: number) => void;

  // ---- ADDITIVE: ERG control actions ----
  /** Set trainer control mode (erg or sim). Reflects to ftms module. */
  setTrainerControlMode: (mode: TrainerControlMode) => void;
  /** Update the current ERG target power displayed in the HUD. */
  setTargetPowerW: (watts: number | null) => void;

  // ---- Toasts ----
  pushToast: (toast: Omit<Toast, 'id'> & { id?: string }) => string;
  dismissToast: (id: string) => void;
}

export interface TickInput {
  /** Wall-clock now, ms. */
  now: number;
  /** Δt seconds since last tick. */
  dt: number;
  /** Computed grade at the rider's current position. */
  gradeNow: number;
  /** Elevation at the rider's current position. */
  elevationNow: number;
  /** Speed to use for advancing along the route (m/s). */
  speedNow: number;
  /** Position derived from advancing along the route. */
  positionNow: { lat: number; lon: number };
  /** Whether we should also commit a record sample this tick. */
  recordSample: boolean;
  /** Cadence, if known. */
  cadenceNow: number | null;
  /** Power, if known. */
  powerNow: number | null;
  /** Heart rate, if known. */
  heartRateNow: number | null;
}

let toastCounter = 0;
function genToastId(): string {
  toastCounter += 1;
  return `t-${Date.now().toString(36)}-${toastCounter}`;
}

export const useRideStore = create<RideStoreState>((set, get) => ({
  route: null,
  rideState: 'idle',
  mode: 'trainer',
  startedAt: null,
  elapsedMs: 0,
  distance: 0,

  speed: 0,
  power: 0,
  cadence: 0,
  heartRate: null,
  grade: 0,
  elevation: 0,
  lastSentGrade: NaN,

  samples: [],

  connection: 'disconnected',
  deviceName: null,
  errorMessage: null,
  errorCode: null,
  reconnectAttempt: 0,
  reconnectMaxAttempts: 0,
  batteryLevel: null,
  connectedAt: null,

  toasts: [],

  libraryVersion: 0,
  flyToTarget: null,

  drawModeActive: false,

  // Replay initial state (ADDITIVE)
  replayData: null,
  replayIndex: 0,

  // ---- ADDITIVE: Sensor initial state ----
  hrSensorStatus: 'disconnected',
  hrSensorDeviceName: null,
  hrSensorValue: null,
  cadenceSensorStatus: 'disconnected',
  cadenceSensorDeviceName: null,
  cadenceSensorValue: null,

  // ---- ADDITIVE: ERG/SIM initial state ----
  trainerControlMode: 'sim',
  targetPowerW: null,

  // ---- ADDITIVE: Workout engine initial state ----
  activeWorkout: null,
  workoutRunning: false,
  workoutElapsedSec: 0,
  workoutTargetWatts: null,

  // ---- ADDITIVE: Workout actions ----
  loadWorkout: (workout) =>
    set({
      activeWorkout: workout,
      workoutRunning: false,
      workoutElapsedSec: 0,
      workoutTargetWatts: null,
    }),

  clearWorkout: () =>
    set({
      activeWorkout: null,
      workoutRunning: false,
      workoutElapsedSec: 0,
      workoutTargetWatts: null,
    }),

  setWorkoutRunning: (running) => set({ workoutRunning: running }),

  advanceWorkoutElapsed: (dt) =>
    set((st) => ({ workoutElapsedSec: st.workoutElapsedSec + dt })),

  setWorkoutTargetWatts: (watts) => set({ workoutTargetWatts: watts }),

  bumpLibrary: () => set((st) => ({ libraryVersion: st.libraryVersion + 1 })),

  setDrawModeActive: (active) => set({ drawModeActive: active }),

  // ---- Replay actions (ADDITIVE) ----
  loadReplay: (fit) =>
    set({
      route: fit.route,
      replayData: fit,
      replayIndex: 0,
      rideState: 'ready',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      startedAt: null,
      speed: 0,
      power: 0,
      cadence: 0,
      heartRate: null,
      grade: 0,
      elevation: fit.route.points[0].ele,
      lastSentGrade: NaN,
    }),

  clearReplay: () =>
    set((st) => ({
      replayData: null,
      replayIndex: 0,
      // Keep the route loaded so the globe still shows it; reset ride state.
      rideState: st.route ? 'ready' : 'idle',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      startedAt: null,
      speed: 0,
      power: 0,
      cadence: 0,
      heartRate: null,
      grade: 0,
      elevation: st.route?.points[0].ele ?? 0,
      lastSentGrade: NaN,
    })),

  setRoute: (route) =>
    set({
      route,
      rideState: route ? 'ready' : 'idle',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      startedAt: null,
      speed: 0,
      power: 0,
      cadence: 0,
      heartRate: null,
      grade: 0,
      elevation: route?.points[0].ele ?? 0,
      lastSentGrade: NaN,
      // Clear any active replay when a new route is loaded normally
      replayData: null,
      replayIndex: 0,
    }),

  setMode: (mode) => set({ mode }),

  setConnection: (s, info) =>
    set((st) => {
      const next: Partial<RideStoreState> = {
        connection: s,
        deviceName: info?.deviceName !== undefined ? info.deviceName : st.deviceName,
      };
      if (s === 'error') {
        next.errorMessage = info?.error ?? st.errorMessage;
        next.errorCode = info?.code ?? st.errorCode;
      } else if (s === 'connected') {
        next.errorMessage = null;
        next.errorCode = null;
        next.connectedAt = Date.now();
        next.reconnectAttempt = 0;
        next.reconnectMaxAttempts = 0;
      } else if (s === 'disconnected') {
        next.errorMessage = info?.error ?? null;
        next.errorCode = info?.code ?? null;
        next.batteryLevel = null;
        next.connectedAt = null;
        next.reconnectAttempt = 0;
        next.reconnectMaxAttempts = 0;
      } else if (s === 'reconnecting') {
        next.errorMessage = info?.error ?? st.errorMessage;
        next.errorCode = info?.code ?? st.errorCode;
      } else if (s === 'connecting') {
        next.errorMessage = null;
        next.errorCode = null;
      }
      return next;
    }),

  setBatteryLevel: (level) => set({ batteryLevel: level }),

  setReconnect: (attempt, maxAttempts) =>
    set({ reconnectAttempt: attempt, reconnectMaxAttempts: maxAttempts }),

  ingestTrainerData: (d) =>
    set((st) => ({
      speed: d.speed ?? st.speed,
      power: d.power ?? st.power,
      // Cadence: dedicated sensor value wins when sensor is live; fall back to trainer.
      cadence: st.cadenceSensorStatus === 'connected'
        ? st.cadence
        : (d.cadence ?? st.cadence),
      // Heart rate: dedicated sensor value wins when sensor is live; fall back to trainer.
      heartRate: st.hrSensorStatus === 'connected'
        ? st.heartRate
        : (d.heartRate ?? st.heartRate),
    })),

  requestFlyTo: (target) =>
    set((st) => ({
      flyToTarget: target
        ? { ...target, id: (st.flyToTarget?.id ?? 0) + 1 }
        : null,
    })),

  // ---- ADDITIVE: Sensor actions ----

  setHrSensorStatus: (status, deviceName) =>
    set((st) => ({
      hrSensorStatus: status,
      hrSensorDeviceName: deviceName !== undefined ? deviceName : st.hrSensorDeviceName,
      // On disconnect/error, clear the sensor value so the HUD falls back to the trainer.
      hrSensorValue:
        status === 'disconnected' || status === 'error' ? null : st.hrSensorValue,
      // When sensor disconnects, let heartRate fall back to whatever trainer provides next tick.
      heartRate:
        status === 'disconnected' || status === 'error' ? null : st.heartRate,
    })),

  ingestHrSensorData: (bpm) =>
    set({
      hrSensorValue: bpm,
      // Override the canonical heartRate field — this is what the HUD and FIT recorder read.
      heartRate: bpm,
    }),

  setCadenceSensorStatus: (status, deviceName) =>
    set((st) => ({
      cadenceSensorStatus: status,
      cadenceSensorDeviceName: deviceName !== undefined ? deviceName : st.cadenceSensorDeviceName,
      // On disconnect/error, clear sensor value so the HUD falls back to the trainer.
      cadenceSensorValue:
        status === 'disconnected' || status === 'error' ? null : st.cadenceSensorValue,
    })),

  ingestCadenceSensorData: (rpm) =>
    set({
      cadenceSensorValue: rpm,
      // Override the canonical cadence field — this is what the HUD and FIT recorder read.
      cadence: rpm,
    }),

  prepare: () => {
    const { route } = get();
    if (!route) return;
    set({
      rideState: 'ready',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      startedAt: null,
      elevation: route.points[0].ele,
      grade: 0,
      lastSentGrade: NaN,
    });
  },

  start: () => {
    if (!get().route) return;
    set({ rideState: 'running', startedAt: Date.now() });
  },

  pause: () => {
    if (get().rideState !== 'running') return;
    set({ rideState: 'paused' });
  },

  resume: () => {
    if (get().rideState !== 'paused') return;
    set({ rideState: 'running' });
  },

  finish: () => set({ rideState: 'finished' }),

  reset: () =>
    set({
      rideState: get().route ? 'ready' : 'idle',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      startedAt: null,
      speed: 0,
      power: 0,
      cadence: 0,
      heartRate: null,
      grade: 0,
      elevation: get().route?.points[0].ele ?? 0,
      lastSentGrade: NaN,
      replayIndex: 0,
      // Reset workout engine state but keep the bound workout so user can re-ride
      workoutRunning: false,
      workoutElapsedSec: 0,
      workoutTargetWatts: null,
    }),

  tick: (input) =>
    set((st) => {
      if (st.rideState !== 'running' || !st.route) return st;

      const advance = input.speedNow * input.dt; // m
      let newDistance = st.distance + advance;
      let newState: RideState = st.rideState;

      if (newDistance >= st.route.totalDistance) {
        if (st.workoutRunning && st.route.totalDistance > 0) {
          // The workout outlasts the map — loop the route for another lap
          // rather than ending the session early. The workout engine still
          // calls finish() when the workout itself completes.
          newDistance %= st.route.totalDistance;
        } else {
          newDistance = st.route.totalDistance;
          newState = 'finished';
        }
      }

      const elapsedMs = st.elapsedMs + input.dt * 1000;

      const nextSamples = st.samples;
      if (input.recordSample) {
        nextSamples.push({
          t: input.now,
          lat: input.positionNow.lat,
          lon: input.positionNow.lon,
          ele: input.elevationNow,
          distance: newDistance,
          speed: input.speedNow,
          grade: input.gradeNow,
          power: input.powerNow ?? undefined,
          cadence: input.cadenceNow ?? undefined,
          heartRate: input.heartRateNow ?? undefined,
        });
      }

      return {
        ...st,
        rideState: newState,
        distance: newDistance,
        elapsedMs,
        grade: input.gradeNow,
        elevation: input.elevationNow,
        // Demo Mode and replay drive speed from the loop's computed/recorded
        // value; live trainer mode keeps the speed already set by ingest.
        speed: st.mode === 'demo' || st.replayData || st.workoutRunning ? input.speedNow : st.speed,
        power: input.powerNow ?? st.power,
        cadence: input.cadenceNow ?? st.cadence,
        heartRate: input.heartRateNow ?? st.heartRate,
        samples: nextSamples,
      };
    }),

  pushToast: (t) => {
    const id = t.id ?? genToastId();
    const toast: Toast = { ...t, id };
    set((st) => {
      // De-dupe: replace any existing toast with the same id so callers that
      // pass a stable id (e.g. 'reconnect') get an updating notification
      // rather than a stack.
      const existing = st.toasts.findIndex((x) => x.id === id);
      if (existing >= 0) {
        const next = st.toasts.slice();
        next[existing] = toast;
        return { toasts: next };
      }
      // Cap at 5 to keep the stack from running off-screen.
      const trimmed = st.toasts.length >= 5 ? st.toasts.slice(-4) : st.toasts;
      return { toasts: [...trimmed, toast] };
    });
    return id;
  },

  // ---- ADDITIVE: ERG control action implementations ----

  setTrainerControlMode: (mode) => set({ trainerControlMode: mode }),

  setTargetPowerW: (watts) => set({ targetPowerW: watts }),

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
}));
