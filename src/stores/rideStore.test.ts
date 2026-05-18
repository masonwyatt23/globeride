import { describe, it, expect, beforeEach } from 'vitest';
import { useRideStore } from '@/stores/rideStore';
import type { Route } from '@/types';

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
