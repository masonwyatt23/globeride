/**
 * cesiumCameras.test.ts — Wave 30.A unit tests.
 *
 * All tests run in the node vitest environment (no Cesium / browser APIs).
 * The camera utilities are pure-math functions — no Cesium imports needed.
 */

import { describe, it, expect } from 'vitest';
import {
  computeCameraPose,
  easedCameraTransition,
  easeOutCubic,
  shouldRotateForCinematicOrbit,
  CHASE_BACK_M,
  CHASE_UP_M,
  FIRST_PERSON_EYE_HEIGHT_M,
  OVERHEAD_HEIGHT_M,
  SIDE_TRACK_OFFSET_M,
  CINEMATIC_RADIUS_M,
  CINEMATIC_ELEV_OFFSET_M,
  CINEMATIC_DEG_PER_SEC,
  type CameraMode,
  type RiderPose,
} from '@/lib/cesiumCameras';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkRider(overrides: Partial<RiderPose> = {}): RiderPose {
  return {
    lat: 45,
    lon: 7,
    ele: 1000,
    heading: 0,   // facing north
    cadence: 90,
    speed: 8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeCameraPose — one test per mode (5 tests)
// ---------------------------------------------------------------------------

describe('computeCameraPose', () => {
  const rider = mkRider({ heading: 0 });
  const now = 10_000; // 10 s

  it('chase: trails behind and above rider along heading', () => {
    const pose = computeCameraPose('chase', rider, now);
    // heading=0 (north): offset should be south (negative y) and up.
    expect(pose.offsetENU.z).toBeCloseTo(CHASE_UP_M, 5);
    // For heading=0: sin(0)=0, cos(0)=1 → x≈0, y≈-CHASE_BACK_M.
    expect(pose.offsetENU.x).toBeCloseTo(0, 5);
    expect(pose.offsetENU.y).toBeCloseTo(-CHASE_BACK_M, 5);
    expect(pose.pitch).toBeLessThan(0); // looking slightly down
  });

  it('firstPerson: places camera at eye height with head bob', () => {
    const pose = computeCameraPose('firstPerson', rider, now);
    // z should be near FIRST_PERSON_EYE_HEIGHT_M ± head-bob amplitude (0.04m).
    expect(pose.offsetENU.z).toBeGreaterThan(FIRST_PERSON_EYE_HEIGHT_M - 0.05);
    expect(pose.offsetENU.z).toBeLessThan(FIRST_PERSON_EYE_HEIGHT_M + 0.05);
    // No lateral offset.
    expect(pose.offsetENU.x).toBeCloseTo(0, 5);
    expect(pose.offsetENU.y).toBeCloseTo(0, 5);
    // Looking forward — pitch ≈ 0, heading matches rider.
    expect(pose.pitch).toBeCloseTo(0, 5);
    expect(pose.heading).toBeCloseTo(rider.heading, 5);
  });

  it('overhead: 100m above rider looking straight down', () => {
    const pose = computeCameraPose('overhead', rider, now);
    expect(pose.offsetENU.z).toBeCloseTo(OVERHEAD_HEIGHT_M, 5);
    expect(pose.offsetENU.x).toBeCloseTo(0, 5);
    expect(pose.offsetENU.y).toBeCloseTo(0, 5);
    // Pitch = -π/2 (straight down).
    expect(pose.pitch).toBeCloseTo(-Math.PI / 2, 5);
    // Heading matches rider so "up" = forward.
    expect(pose.heading).toBeCloseTo(rider.heading, 5);
  });

  it('sideTracking: offset perpendicular to heading at rider elevation', () => {
    const pose = computeCameraPose('sideTracking', rider, now);
    // For heading=0 (north), perpendicular is east: x ≈ SIDE_TRACK_OFFSET_M, y ≈ 0.
    expect(pose.offsetENU.x).toBeCloseTo(SIDE_TRACK_OFFSET_M, 3);
    expect(pose.offsetENU.y).toBeCloseTo(0, 3);
    // Camera stays at rider elevation.
    expect(pose.offsetENU.z).toBeCloseTo(0, 5);
  });

  it('cinematic: orbits at CINEMATIC_RADIUS_M elevation with upward offset', () => {
    const pose = computeCameraPose('cinematic', rider, now);
    // Camera must be offset at the orbit radius in x/y plane.
    const r = Math.sqrt(pose.offsetENU.x ** 2 + pose.offsetENU.y ** 2);
    expect(r).toBeCloseTo(CINEMATIC_RADIUS_M, 3);
    // Elevation offset must be positive.
    expect(pose.offsetENU.z).toBeCloseTo(CINEMATIC_ELEV_OFFSET_M, 5);
    // Pitch must be negative (looking slightly down).
    expect(pose.pitch).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// easedCameraTransition — t=0, t=0.5, t=1 (3 tests)
// ---------------------------------------------------------------------------

describe('easedCameraTransition', () => {
  const from: ReturnType<typeof computeCameraPose> = {
    offsetENU: { x: 0, y: 0, z: 0 },
    heading: 0,
    pitch: 0,
    roll: 0,
  };
  const to: ReturnType<typeof computeCameraPose> = {
    offsetENU: { x: 10, y: 20, z: 5 },
    heading: 1,
    pitch: -0.5,
    roll: 0.1,
  };

  it('t=0 returns the from pose', () => {
    const r = easedCameraTransition(from, to, 0);
    expect(r.offsetENU.x).toBeCloseTo(0, 6);
    expect(r.offsetENU.y).toBeCloseTo(0, 6);
    expect(r.offsetENU.z).toBeCloseTo(0, 6);
    expect(r.heading).toBeCloseTo(0, 6);
  });

  it('t=1 returns the to pose', () => {
    const r = easedCameraTransition(from, to, 1);
    expect(r.offsetENU.x).toBeCloseTo(10, 5);
    expect(r.offsetENU.y).toBeCloseTo(20, 5);
    expect(r.offsetENU.z).toBeCloseTo(5, 5);
    expect(r.pitch).toBeCloseTo(-0.5, 5);
  });

  it('t=0.5 interpolates between from and to (eased, not linear midpoint)', () => {
    const r = easedCameraTransition(from, to, 0.5);
    // easeOutCubic(0.5) = 1 - (0.5)^3 = 0.875 → x ≈ 8.75
    const e = easeOutCubic(0.5);
    expect(r.offsetENU.x).toBeCloseTo(10 * e, 5);
    expect(r.offsetENU.z).toBeCloseTo(5 * e, 5);
    // Must be strictly between from and to.
    expect(r.offsetENU.x).toBeGreaterThan(0);
    expect(r.offsetENU.x).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// shouldRotateForCinematicOrbit (2 tests)
// ---------------------------------------------------------------------------

describe('shouldRotateForCinematicOrbit', () => {
  it('returns 0 at time 0', () => {
    expect(shouldRotateForCinematicOrbit(0, CINEMATIC_DEG_PER_SEC)).toBeCloseTo(0, 5);
  });

  it('cycles back toward 0 after a full rotation', () => {
    // Time for one full orbit: 360 / 6 = 60 s → 60_000 ms.
    const period = (360 / CINEMATIC_DEG_PER_SEC) * 1000;
    expect(shouldRotateForCinematicOrbit(period, CINEMATIC_DEG_PER_SEC)).toBeCloseTo(0, 3);
    // 180° is at half period.
    expect(shouldRotateForCinematicOrbit(period / 2, CINEMATIC_DEG_PER_SEC)).toBeCloseTo(180, 3);
  });
});

// ---------------------------------------------------------------------------
// easeOutCubic boundary tests (2 bonus tests)
// ---------------------------------------------------------------------------

describe('easeOutCubic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0, 10);
    expect(easeOutCubic(1)).toBeCloseTo(1, 10);
  });

  it('is monotonically increasing from 0 to 1', () => {
    const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    for (let i = 1; i < samples.length; i++) {
      expect(easeOutCubic(samples[i])).toBeGreaterThan(easeOutCubic(samples[i - 1]));
    }
  });
});

// ---------------------------------------------------------------------------
// Head-bob: varies with time and cadence (1 bonus test)
// ---------------------------------------------------------------------------

describe('firstPerson head-bob', () => {
  it('produces different z offsets at different timestamps', () => {
    const rider = mkRider({ cadence: 90 });
    const t1 = computeCameraPose('firstPerson', rider, 0);
    // At t=0: cadence=90, sin(90*0*π/30)=sin(0)=0 → z=1.2 exactly.
    expect(t1.offsetENU.z).toBeCloseTo(FIRST_PERSON_EYE_HEIGHT_M, 5);
    // At t=250ms: arg = 90 * 0.25 * π/30 = 0.75π → sin(0.75π)=sin(135°)≈0.707 ≠ 0.
    const t2 = computeCameraPose('firstPerson', rider, 250);
    expect(t2.offsetENU.z).not.toBeCloseTo(FIRST_PERSON_EYE_HEIGHT_M, 5);
  });
});

// ---------------------------------------------------------------------------
// All 5 modes return finite numbers (guard for NaN) (1 bonus test)
// ---------------------------------------------------------------------------

describe('computeCameraPose numeric validity', () => {
  const modes: CameraMode[] = ['chase', 'firstPerson', 'overhead', 'sideTracking', 'cinematic'];
  it('all modes return finite heading/pitch/roll/offsets', () => {
    const rider = mkRider({ heading: Math.PI / 4, cadence: 60, speed: 5 });
    for (const mode of modes) {
      const p = computeCameraPose(mode, rider, 12_345);
      expect(Number.isFinite(p.offsetENU.x)).toBe(true);
      expect(Number.isFinite(p.offsetENU.y)).toBe(true);
      expect(Number.isFinite(p.offsetENU.z)).toBe(true);
      expect(Number.isFinite(p.heading)).toBe(true);
      expect(Number.isFinite(p.pitch)).toBe(true);
      expect(Number.isFinite(p.roll)).toBe(true);
    }
  });
});
