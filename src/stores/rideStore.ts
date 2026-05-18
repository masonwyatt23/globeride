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

  bumpLibrary: () => set((st) => ({ libraryVersion: st.libraryVersion + 1 })),

  setDrawModeActive: (active) => set({ drawModeActive: active }),

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
      cadence: d.cadence ?? st.cadence,
      heartRate: d.heartRate ?? st.heartRate,
    })),

  requestFlyTo: (target) =>
    set((st) => ({
      flyToTarget: target
        ? { ...target, id: (st.flyToTarget?.id ?? 0) + 1 }
        : null,
    })),

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
    }),

  tick: (input) =>
    set((st) => {
      if (st.rideState !== 'running' || !st.route) return st;

      const advance = input.speedNow * input.dt; // m
      let newDistance = st.distance + advance;
      let newState: RideState = st.rideState;

      if (newDistance >= st.route.totalDistance) {
        newDistance = st.route.totalDistance;
        newState = 'finished';
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
        speed: st.mode === 'demo' ? input.speedNow : st.speed, // trainer-mode speed already set by ingest
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

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
}));
