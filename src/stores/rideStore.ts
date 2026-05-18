import { create } from 'zustand';
import type {
  ConnectionState,
  RideMode,
  RideState,
  Route,
  TelemetrySample,
  TrainerData,
} from '@/types';

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

  // ---- Actions ----
  setRoute: (route: Route | null) => void;
  setMode: (mode: RideMode) => void;
  setConnection: (s: ConnectionState, deviceName?: string | null, err?: string | null) => void;
  ingestTrainerData: (data: TrainerData) => void;

  prepare: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  reset: () => void;

  /** Called once per frame by useRideLoop. */
  tick: (input: TickInput) => void;
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

  setConnection: (s, deviceName, err) =>
    set({
      connection: s,
      deviceName: deviceName ?? get().deviceName,
      errorMessage: err ?? (s === 'error' ? get().errorMessage : null),
    }),

  ingestTrainerData: (d) =>
    set((st) => ({
      speed: d.speed ?? st.speed,
      power: d.power ?? st.power,
      cadence: d.cadence ?? st.cadence,
      heartRate: d.heartRate ?? st.heartRate,
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
}));
