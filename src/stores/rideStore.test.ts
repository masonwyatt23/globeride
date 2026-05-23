import { describe, it, expect, beforeEach } from 'vitest';
import { useRideStore } from '@/stores/rideStore';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const route: Route = {
  id: 'r',
  name: 'r',
  points: [
    { lat: 0, lon: 0, ele: 0, distance: 0 },
    { lat: 0, lon: 0, ele: 0, distance: 1000 },
  ],
  totalDistance: 1000,
  ascent: 0,
  descent: 0,
  minElevation: 0,
  maxElevation: 0,
  loadedAt: 0,
};

/** Convenience: fire tick() with only speedNow varying (original helper). */
function tickWith(speedNow: number) {
  useRideStore.getState().tick({
    now: Date.now(),
    dt: 1,
    gradeNow: 0,
    elevationNow: 0,
    speedNow,
    positionNow: { lat: 0, lon: 0 },
    recordSample: false,
    cadenceNow: 80,
    powerNow: 200,
    heartRateNow: 140,
  });
}

/** Build a full TickInput with optional overrides (new tests use this). */
function makeTick(
  overrides: Partial<Parameters<ReturnType<typeof useRideStore.getState>['tick']>[0]> = {},
) {
  return {
    now: Date.now(),
    dt: 1,
    gradeNow: 0,
    elevationNow: 0,
    speedNow: 5,
    positionNow: { lat: 0, lon: 0 } as { lat: number; lon: number },
    recordSample: false,
    cadenceNow: 80 as number | null,
    powerNow: 200 as number | null,
    heartRateNow: 140 as number | null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// EXISTING tests (preserved verbatim)
// ---------------------------------------------------------------------------

describe('rideStore.tick — speed source resolution', () => {
  beforeEach(() => {
    useRideStore.setState({
      route,
      rideState: 'running',
      distance: 0,
      samples: [],
      speed: 0,
      replayData: null,
      mode: 'trainer',
    });
  });

  it('drives speed from the recorded sample during a replay (regression)', () => {
    // replayData truthy → replay session; mode stays the default 'trainer'.
    useRideStore.setState({ replayData: {} as never });
    tickWith(7.5);
    expect(useRideStore.getState().speed).toBe(7.5);
  });

  it('keeps trainer-ingested speed in live trainer mode', () => {
    useRideStore.setState({ speed: 5, replayData: null, mode: 'trainer' });
    tickWith(99);
    expect(useRideStore.getState().speed).toBe(5);
  });

  it('drives speed from the solved value in Demo Mode', () => {
    useRideStore.setState({ mode: 'demo', replayData: null });
    tickWith(12);
    expect(useRideStore.getState().speed).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// NEW tests — Task B2 (~25 additional cases)
// ---------------------------------------------------------------------------

// ---- Distance advancement --------------------------------------------------

describe('rideStore.tick — distance advancement', () => {
  beforeEach(() => {
    useRideStore.setState({
      route,
      rideState: 'running',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      speed: 0,
      replayData: null,
      mode: 'demo',
      workoutRunning: false,
    });
  });

  it('advances distance by speedNow × dt each tick', () => {
    useRideStore.getState().tick(makeTick({ speedNow: 10, dt: 2 }));
    expect(useRideStore.getState().distance).toBe(20);
  });

  it('distance starts at 0 and ticking with speedNow=0 keeps it at 0', () => {
    useRideStore.getState().tick(makeTick({ speedNow: 0, dt: 1 }));
    expect(useRideStore.getState().distance).toBe(0);
  });

  it('reaching totalDistance in normal mode transitions to "finished" and clamps distance', () => {
    useRideStore.getState().tick(makeTick({ speedNow: 1001, dt: 1 }));
    expect(useRideStore.getState().rideState).toBe('finished');
    expect(useRideStore.getState().distance).toBe(1000);
  });

  it('distance is never set beyond totalDistance on finish', () => {
    useRideStore.getState().tick(makeTick({ speedNow: 9999, dt: 1 }));
    expect(useRideStore.getState().distance).toBeLessThanOrEqual(route.totalDistance);
  });

  it('distance just past totalDistance (ε overshoot) still finishes', () => {
    useRideStore.setState({ distance: 999.99 });
    useRideStore.getState().tick(makeTick({ speedNow: 1, dt: 1 }));
    expect(useRideStore.getState().rideState).toBe('finished');
  });

  it('with workoutRunning=true overshoot loops distance instead of finishing', () => {
    useRideStore.setState({ workoutRunning: true });
    // 1001 m advance on 1000 m route → wraps to 1 m, stays running
    useRideStore.getState().tick(makeTick({ speedNow: 1001, dt: 1 }));
    expect(useRideStore.getState().rideState).toBe('running');
    expect(useRideStore.getState().distance).toBeCloseTo(1, 5);
  });

  it('looped distance is always in [0, totalDistance)', () => {
    useRideStore.setState({ workoutRunning: true, distance: 999 });
    useRideStore.getState().tick(makeTick({ speedNow: 500, dt: 1 }));
    const d = useRideStore.getState().distance;
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(route.totalDistance);
  });
});

// ---- Paused / inactive state -----------------------------------------------

describe('rideStore.tick — paused / inactive state', () => {
  beforeEach(() => {
    useRideStore.setState({
      route,
      rideState: 'paused',
      distance: 100,
      elapsedMs: 500,
      samples: [],
      speed: 5,
      replayData: null,
      mode: 'demo',
      workoutRunning: false,
    });
  });

  it('tick does nothing when rideState is "paused"', () => {
    useRideStore.getState().tick(makeTick({ speedNow: 10, dt: 1 }));
    expect(useRideStore.getState().distance).toBe(100);
    expect(useRideStore.getState().rideState).toBe('paused');
  });

  it('paused tick does not grow samples even when recordSample=true', () => {
    useRideStore.getState().tick(makeTick({ recordSample: true }));
    expect(useRideStore.getState().samples).toHaveLength(0);
  });

  it('paused tick does not advance elapsedMs', () => {
    const before = useRideStore.getState().elapsedMs;
    useRideStore.getState().tick(makeTick({ dt: 5 }));
    expect(useRideStore.getState().elapsedMs).toBe(before);
  });

  it('tick is a no-op when rideState is "finished"', () => {
    useRideStore.setState({ rideState: 'finished', distance: 1000 });
    useRideStore.getState().tick(makeTick({ speedNow: 10, dt: 1 }));
    expect(useRideStore.getState().distance).toBe(1000);
  });

  it('tick is a no-op when route is null', () => {
    useRideStore.setState({ route: null, rideState: 'running' });
    useRideStore.getState().tick(makeTick({ speedNow: 10, dt: 1 }));
    expect(useRideStore.getState().distance).toBe(100); // unchanged
  });
});

// ---- Sample recording -------------------------------------------------------

describe('rideStore.tick — sample recording', () => {
  beforeEach(() => {
    useRideStore.setState({
      route,
      rideState: 'running',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      speed: 0,
      replayData: null,
      mode: 'demo',
      workoutRunning: false,
    });
  });

  it('recordSample:true appends exactly one new sample', () => {
    useRideStore.getState().tick(makeTick({ recordSample: true, now: 1000 }));
    expect(useRideStore.getState().samples).toHaveLength(1);
  });

  it('recordSample:false does not grow samples', () => {
    useRideStore.getState().tick(makeTick({ recordSample: false }));
    expect(useRideStore.getState().samples).toHaveLength(0);
  });

  it('sample array is a new reference each tick (immutable update — Wave 8 regression guard)', () => {
    // In-place push breaks Zustand reference-equality subscriber detection.
    const before = useRideStore.getState().samples;
    useRideStore.getState().tick(makeTick({ recordSample: true }));
    const after = useRideStore.getState().samples;
    expect(after).not.toBe(before);
  });

  it('multiple recordSample ticks accumulate all samples in order', () => {
    useRideStore.getState().tick(makeTick({ recordSample: true, now: 1000 }));
    useRideStore.getState().tick(makeTick({ recordSample: true, now: 2000 }));
    useRideStore.getState().tick(makeTick({ recordSample: true, now: 3000 }));
    const samples = useRideStore.getState().samples;
    expect(samples).toHaveLength(3);
    expect(samples[0].t).toBe(1000);
    expect(samples[2].t).toBe(3000);
  });

  it('sample stores the correct telemetry fields from the tick input', () => {
    const now = 12345;
    useRideStore.getState().tick(makeTick({
      recordSample: true,
      now,
      positionNow: { lat: 1.23, lon: 4.56 },
      elevationNow: 789,
      speedNow: 7,
      gradeNow: 5,
      powerNow: 250,
      cadenceNow: 90,
      heartRateNow: 150,
    }));
    const s = useRideStore.getState().samples[0];
    expect(s.t).toBe(now);
    expect(s.lat).toBe(1.23);
    expect(s.lon).toBe(4.56);
    expect(s.ele).toBe(789);
    expect(s.speed).toBe(7);
    expect(s.grade).toBe(5);
    expect(s.power).toBe(250);
    expect(s.cadence).toBe(90);
    expect(s.heartRate).toBe(150);
  });

  it('sample distance field reflects post-advance distance, not pre-tick value', () => {
    useRideStore.setState({ distance: 0 });
    useRideStore.getState().tick(makeTick({ recordSample: true, speedNow: 10, dt: 1 }));
    // After advancing 10 m the sample should record distance=10
    expect(useRideStore.getState().samples[0].distance).toBe(10);
  });
});

// ---- elapsedMs accounting --------------------------------------------------

describe('rideStore.tick — elapsedMs', () => {
  beforeEach(() => {
    useRideStore.setState({
      route,
      rideState: 'running',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      speed: 0,
      replayData: null,
      mode: 'demo',
      workoutRunning: false,
    });
  });

  it('elapsedMs accumulates dt×1000 per tick', () => {
    useRideStore.getState().tick(makeTick({ dt: 0.5 }));
    expect(useRideStore.getState().elapsedMs).toBeCloseTo(500, 1);
  });

  it('elapsedMs does not advance during pause, then resumes correctly', () => {
    useRideStore.getState().tick(makeTick({ dt: 2 }));
    expect(useRideStore.getState().elapsedMs).toBe(2000);
    useRideStore.getState().pause();
    useRideStore.getState().tick(makeTick({ dt: 5 })); // ignored
    expect(useRideStore.getState().elapsedMs).toBe(2000);
    useRideStore.getState().resume();
    useRideStore.getState().tick(makeTick({ dt: 1 }));
    expect(useRideStore.getState().elapsedMs).toBe(3000);
  });
});

// ---- Telemetry pass-through ------------------------------------------------

describe('rideStore.tick — telemetry pass-through', () => {
  beforeEach(() => {
    useRideStore.setState({
      route,
      rideState: 'running',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      speed: 0,
      power: 0,
      cadence: 0,
      heartRate: null,
      grade: 0,
      elevation: 0,
      replayData: null,
      mode: 'demo',
      workoutRunning: false,
    });
  });

  it('grade is set to gradeNow on each running tick', () => {
    useRideStore.getState().tick(makeTick({ gradeNow: 8.5 }));
    expect(useRideStore.getState().grade).toBe(8.5);
  });

  it('elevation is set to elevationNow on each running tick', () => {
    useRideStore.getState().tick(makeTick({ elevationNow: 1234 }));
    expect(useRideStore.getState().elevation).toBe(1234);
  });

  it('power is updated from powerNow when provided', () => {
    useRideStore.getState().tick(makeTick({ powerNow: 300 }));
    expect(useRideStore.getState().power).toBe(300);
  });

  it('power falls back to previous value when powerNow is null', () => {
    useRideStore.setState({ power: 250 });
    useRideStore.getState().tick(makeTick({ powerNow: null }));
    expect(useRideStore.getState().power).toBe(250);
  });

  it('cadence falls back to previous value when cadenceNow is null', () => {
    useRideStore.setState({ cadence: 85 });
    useRideStore.getState().tick(makeTick({ cadenceNow: null }));
    expect(useRideStore.getState().cadence).toBe(85);
  });

  it('heartRate falls back to previous value when heartRateNow is null', () => {
    useRideStore.setState({ heartRate: 145 });
    useRideStore.getState().tick(makeTick({ heartRateNow: null }));
    expect(useRideStore.getState().heartRate).toBe(145);
  });
});

// ---- State transitions / lifecycle -----------------------------------------

describe('rideStore — state transitions', () => {
  beforeEach(() => {
    useRideStore.setState({
      route,
      rideState: 'idle',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      speed: 0,
      replayData: null,
      mode: 'demo',
      workoutRunning: false,
    });
  });

  it('start() transitions ready→running', () => {
    useRideStore.setState({ rideState: 'ready' });
    useRideStore.getState().start();
    expect(useRideStore.getState().rideState).toBe('running');
  });

  it('start() is a no-op when there is no route', () => {
    useRideStore.setState({ route: null, rideState: 'idle' });
    useRideStore.getState().start();
    expect(useRideStore.getState().rideState).toBe('idle');
  });

  it('pause() transitions running→paused', () => {
    useRideStore.setState({ rideState: 'running' });
    useRideStore.getState().pause();
    expect(useRideStore.getState().rideState).toBe('paused');
  });

  it('pause() is a no-op when not running', () => {
    useRideStore.setState({ rideState: 'ready' });
    useRideStore.getState().pause();
    expect(useRideStore.getState().rideState).toBe('ready');
  });

  it('resume() transitions paused→running', () => {
    useRideStore.setState({ rideState: 'paused' });
    useRideStore.getState().resume();
    expect(useRideStore.getState().rideState).toBe('running');
  });

  it('resume() is a no-op when already running', () => {
    useRideStore.setState({ rideState: 'running' });
    useRideStore.getState().resume();
    expect(useRideStore.getState().rideState).toBe('running');
  });

  it('finish() sets rideState to "finished"', () => {
    useRideStore.setState({ rideState: 'running' });
    useRideStore.getState().finish();
    expect(useRideStore.getState().rideState).toBe('finished');
  });

  it('reset() zeros distance/elapsedMs/samples and returns to ready when route exists', () => {
    useRideStore.setState({
      rideState: 'finished', distance: 1000, elapsedMs: 5000,
      samples: [{ t: 0, lat: 0, lon: 0, ele: 0, distance: 0, speed: 0, grade: 0 }],
    });
    useRideStore.getState().reset();
    const s = useRideStore.getState();
    expect(s.distance).toBe(0);
    expect(s.elapsedMs).toBe(0);
    expect(s.rideState).toBe('ready');
    expect(s.samples).toHaveLength(0);
  });

  it('reset() returns to idle when no route', () => {
    useRideStore.setState({ route: null, rideState: 'finished' });
    useRideStore.getState().reset();
    expect(useRideStore.getState().rideState).toBe('idle');
  });

  it('pause then resume preserves accumulated distance', () => {
    useRideStore.setState({ rideState: 'running', distance: 450 });
    useRideStore.getState().pause();
    useRideStore.getState().tick(makeTick({ speedNow: 10, dt: 1 })); // ignored
    useRideStore.getState().resume();
    expect(useRideStore.getState().distance).toBe(450);
  });
});

// ---- workoutRunning speed routing ------------------------------------------

describe('rideStore.tick — workoutRunning speed routing', () => {
  beforeEach(() => {
    useRideStore.setState({
      route,
      rideState: 'running',
      distance: 0,
      elapsedMs: 0,
      samples: [],
      speed: 3,
      replayData: null,
      mode: 'trainer',
      workoutRunning: true,
    });
  });

  it('drives speed from speedNow when workoutRunning=true (even in trainer mode)', () => {
    useRideStore.getState().tick(makeTick({ speedNow: 8 }));
    expect(useRideStore.getState().speed).toBe(8);
  });
});
