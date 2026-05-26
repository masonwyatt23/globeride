import * as Cesium from 'cesium';
import { sampleGroundHeight } from '@/lib/cesiumUtils';
import { type AvatarColors, DEFAULT_AVATAR_COLORS } from '@/lib/avatarConfig';
import type { RiderPosition } from '@/lib/physics';

export type { AvatarColors } from '@/lib/avatarConfig';

/**
 * Procedural rider avatar — a stylized low-poly cyclist assembled from Cesium
 * primitives (no external 3D assets, so it works offline / in the PWA).
 *
 * Body-local frame: origin on the ground between the wheels,
 *   +X = rider's right, +Y = forward (travel direction), +Z = up.
 * Every part is positioned in that frame, then the whole rig is placed on the
 * globe via a heading/pitch/roll transform so the bike leans into corners,
 * pitches with the gradient, and points along the route.
 *
 * Animation (Wave 30.B):
 *   1. Pedaling legs alternate around the bottom bracket at cadence frequency.
 *   2. Wheels spin with ground speed (radius 0.34 m).
 *   3. Body leans into corners proportional to centripetal acceleration, smoothed.
 *   4. Hand positions shift by rider posture (hoods / tops / drops).
 *   5. Head yaws ±5° toward the direction of heading change.
 *   6. Climb-mode (grade > 8 %): body tilts forward 5° and hips sway at cadence.
 * All driven from `update()` once per frame; zero Cesium-primitive allocations.
 */

// ---- Appearance -----------------------------------------------------------

type ColorRole = keyof AvatarColors;

export interface AvatarUpdate {
  /** Ground position the rider sits on. */
  lon: number;
  lat: number;
  ele: number;
  /** Heading, radians clockwise from north. */
  heading: number;
  /** Speed in m/s — drives wheel spin. */
  speed: number;
  /** Cadence in rpm — drives pedalling. 0 ⇒ estimate from speed. */
  cadence: number;
  /** Grade in percent — drives body pitch + climb-mode. */
  grade: number;
  /** Seconds since the previous update — integrates the animation. */
  dt: number;
  /** Rider's handlebar position — shapes hand/arm placement. Optional; defaults to 'hoods'. */
  riderPosition?: RiderPosition;
}

export interface Avatar {
  entities: Cesium.Entity[];
  update: (u: AvatarUpdate) => void;
  setColors: (c: AvatarColors) => void;
  dispose: () => void;
}

// ---- Small vector / quaternion helpers ------------------------------------

type V3 = readonly [number, number, number];

const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

/** Quaternion rotating the +Z axis (a cylinder/box's long axis) onto `dir`. */
function quatZTo(dir: V3): Cesium.Quaternion {
  const l = len(dir) || 1;
  const d = v3(dir[0] / l, dir[1] / l, dir[2] / l);
  const dot = d[2];
  if (dot > 0.99999) return Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY, new Cesium.Quaternion());
  if (dot < -0.99999) {
    return Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X, Math.PI, new Cesium.Quaternion());
  }
  // axis = normalize(Z × d)
  const axis = new Cesium.Cartesian3(-d[1], d[0], 0);
  Cesium.Cartesian3.normalize(axis, axis);
  return Cesium.Quaternion.fromAxisAngle(axis, Math.acos(dot), new Cesium.Quaternion());
}

const QUAT_IDENTITY = Cesium.Quaternion.IDENTITY;

/** Rotation about the body +X axis (wheel axle / pedalling plane normal). */
function quatRotX(angle: number): Cesium.Quaternion {
  return Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X, angle, new Cesium.Quaternion());
}

/** Rotation about the body +Z axis (yaw — head turning). */
function quatRotZ(angle: number): Cesium.Quaternion {
  return Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, angle, new Cesium.Quaternion());
}

// Suppress unused warning — quatRotZ is used by headPart and exported for tests.
void quatRotZ;

// ---- Part model -----------------------------------------------------------

type GeomKind = 'box' | 'cylinder' | 'ellipsoid';

interface PartDynamic {
  /** Body-local position. */
  pos: V3;
  /** Body-local orientation. */
  rot: Cesium.Quaternion;
}

interface PartSpec {
  name: string;
  kind: GeomKind;
  /** For box: full dimensions. For cylinder: [radius, length, radius]. For ellipsoid: radii. */
  dims: V3;
  role: ColorRole;
  /** Static body-local placement, or a per-frame function for animated parts. */
  place: PartDynamic | ((d: RigDynamics) => PartDynamic);
}

/** Per-frame animation state shared by the dynamic parts. */
interface RigDynamics {
  wheelAngle: number;
  crankAngle: number;
  /** Head yaw offset, radians — positive toward turn direction. */
  headYaw: number;
  /** Hip sway oscillation angle during climb-mode. */
  climbSway: number;
  /** Whether we are in climb-out-of-saddle mode (grade > 8 %). */
  climbing: boolean;
  /** Rider handlebar posture — drives hand / forearm positions. */
  riderPosition: RiderPosition;
}

// ---- Bike + rider geometry (all metres, body-local) -----------------------

const WHEEL_R = 0.34;
const REAR_HUB = v3(0, -0.5, WHEEL_R);
const FRONT_HUB = v3(0, 0.5, WHEEL_R);
const BB = v3(0, 0.03, 0.27); // bottom bracket / crank centre
const HEAD_TOP = v3(0, 0.46, 0.66);
const SADDLE_J = v3(0, -0.13, 0.66); // seat-tube / top-tube junction
const SADDLE = v3(0, -0.15, 0.71);
const BAR = v3(0, 0.46, 0.86);
const CRANK_R = 0.17;
const THIGH_L = 0.43;
const SHIN_L = 0.43;

// Derived geometry constants reused by multiple detail parts
const SEATPOST_TOP = v3(0, -0.13, 0.67);
const SEATPOST_BOT = v3(0, -0.06, 0.52);
const DROP_LEFT  = v3(-0.21, 0.46, 0.86);
const DROP_RIGHT = v3( 0.21, 0.46, 0.86);
const HOOD_LEFT  = v3(-0.21, 0.44, 0.82);
const HOOD_RIGHT = v3( 0.21, 0.44, 0.82);

// ---- Hand positions per posture (Wave 30.B feature 4) ---------------------

/** Body-local hand positions for each rider posture. */
const HAND_POS: Record<RiderPosition, { left: V3; right: V3 }> = {
  hoods: {
    left:  v3(-0.21, 0.46, 0.84),
    right: v3( 0.21, 0.46, 0.84),
  },
  drops: {
    left:  v3(-0.21, 0.50, 0.76),
    right: v3( 0.21, 0.50, 0.76),
  },
  tops: {
    left:  v3(-0.10, 0.40, 0.90),
    right: v3( 0.10, 0.40, 0.90),
  },
};

/** Forearm wrist endpoints per posture (elbow stays fixed, wrist follows hand). */
const FOREARM_END: Record<RiderPosition, { left: V3; right: V3 }> = {
  hoods: { left: v3(-0.21, 0.44, 0.86), right: v3( 0.21, 0.44, 0.86) },
  drops: { left: v3(-0.21, 0.48, 0.78), right: v3( 0.21, 0.48, 0.78) },
  tops:  { left: v3(-0.10, 0.40, 0.92), right: v3( 0.10, 0.40, 0.92) },
};

const ELBOW_LEFT  = v3(-0.19, 0.34, 0.98);
const ELBOW_RIGHT = v3( 0.19, 0.34, 0.98);

// ---- Part factory functions -----------------------------------------------

/** A frame tube: a thin cylinder spanning two body-local points. */
function tube(name: string, a: V3, b: V3, radius: number, role: ColorRole): PartSpec {
  const dir = sub(b, a);
  return {
    name,
    kind: 'cylinder',
    dims: v3(radius, len(dir), radius),
    role,
    place: { pos: mid(a, b), rot: quatZTo(dir) },
  };
}

/** A pedal's body-local position for crank phase `phase`. */
function pedalPos(side: -1 | 1, crankAngle: number): V3 {
  const phase = crankAngle + (side === 1 ? Math.PI : 0);
  return v3(side * 0.085, BB[1] + Math.sin(phase) * CRANK_R, BB[2] - Math.cos(phase) * CRANK_R);
}

/** A crank arm from the bottom bracket to a pedal. */
function crankPart(name: string, side: -1 | 1): PartSpec {
  return {
    name,
    kind: 'cylinder',
    dims: v3(0.02, CRANK_R, 0.02),
    role: 'accent',
    place: (d) => {
      const bb = v3(side * 0.085, BB[1], BB[2]);
      const pedal = pedalPos(side, d.crankAngle);
      return { pos: mid(bb, pedal), rot: quatZTo(sub(pedal, bb)) };
    },
  };
}

/** 2-bone IK leg segment (thigh or shin) for one side. */
function legPart(name: string, side: -1 | 1, segment: 'thigh' | 'shin'): PartSpec {
  const hip = v3(side * 0.1, -0.04, 0.82);
  return {
    name,
    kind: 'box',
    dims: segment === 'thigh' ? v3(0.1, 0.1, THIGH_L) : v3(0.08, 0.08, SHIN_L),
    role: segment === 'thigh' ? 'kit' : 'skin',
    place: (d) => {
      const pedal = pedalPos(side, d.crankAngle);
      // 2-bone IK in the leg's near-vertical Y-Z plane.
      const ay = pedal[1] - hip[1];
      const az = pedal[2] - hip[2];
      let dist = Math.hypot(ay, az);
      dist = Math.min(THIGH_L + SHIN_L - 0.002, Math.max(Math.abs(THIGH_L - SHIN_L) + 0.002, dist));
      const base = Math.atan2(az, ay);
      // Knee bends forward (toward +Y): pick the +offset solution.
      const hipAng = Math.acos(
        Math.min(1, Math.max(-1, (THIGH_L * THIGH_L + dist * dist - SHIN_L * SHIN_L) / (2 * THIGH_L * dist))),
      );
      const thighAng = base + hipAng;
      const knee = v3(hip[0], hip[1] + Math.cos(thighAng) * THIGH_L, hip[2] + Math.sin(thighAng) * THIGH_L);
      if (segment === 'thigh') {
        return { pos: mid(hip, knee), rot: quatZTo(sub(knee, hip)) };
      }
      return { pos: mid(knee, pedal), rot: quatZTo(sub(pedal, knee)) };
    },
  };
}

/** A spinning spoke bar so the wheel visibly rotates. */
function spokePart(name: string, hub: V3): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.05, 0.05, WHEEL_R * 1.85),
    role: 'accent',
    place: (d) => ({ pos: hub, rot: quatRotX(d.wheelAngle) }),
  };
}

/** A wheel hub — small cylinder centred on the hub, aligned with the axle (X). */
function hubPart(name: string, hub: V3): PartSpec {
  return {
    name,
    kind: 'cylinder',
    dims: v3(0.045, 0.09, 0.045),
    role: 'accent',
    place: { pos: hub, rot: quatZTo(v3(1, 0, 0)) },
  };
}

/**
 * Rim accent — a thin-walled ring slightly inside the tyre.
 */
function rimAccent(name: string, hub: V3): PartSpec {
  return {
    name,
    kind: 'cylinder',
    dims: v3(WHEEL_R * 0.88, 0.025, WHEEL_R * 0.88),
    role: 'accent',
    place: { pos: hub, rot: quatZTo(v3(1, 0, 0)) },
  };
}

/** Chainring — thin disc at the bottom bracket, spins with the crank. */
function chainringPart(): PartSpec {
  return {
    name: 'chainring',
    kind: 'cylinder',
    dims: v3(0.125, 0.018, 0.125),
    role: 'accent',
    place: (d) => ({ pos: BB, rot: Cesium.Quaternion.multiply(quatZTo(v3(1, 0, 0)), quatRotX(d.crankAngle), new Cesium.Quaternion()) }),
  };
}

/** Pedal platform — follows crank angle. */
function pedalPart(name: string, side: -1 | 1): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.1, 0.08, 0.018),
    role: 'accent',
    place: (d) => ({ pos: pedalPos(side, d.crankAngle), rot: QUAT_IDENTITY }),
  };
}

/**
 * Hand — position follows rider posture.
 * Wave 30.B feature 4: hoods / drops / tops move the hands.
 */
function handPart(name: string, side: 'left' | 'right'): PartSpec {
  return {
    name,
    kind: 'ellipsoid',
    dims: v3(0.045, 0.06, 0.04),
    role: 'skin',
    place: (d) => ({ pos: HAND_POS[d.riderPosition][side], rot: QUAT_IDENTITY }),
  };
}

/**
 * Forearm — wrist follows posture, elbow is fixed.
 * Wave 30.B feature 4.
 */
function forearmPart(name: string, side: 'left' | 'right'): PartSpec {
  const elbow = side === 'left' ? ELBOW_LEFT : ELBOW_RIGHT;
  return {
    name,
    kind: 'cylinder',
    dims: v3(0.038, 0.20, 0.038),
    role: 'skin',
    place: (d) => {
      const wrist = FOREARM_END[d.riderPosition][side];
      return { pos: mid(elbow, wrist), rot: quatZTo(sub(wrist, elbow)) };
    },
  };
}

/**
 * Head — yaws ±5° toward turn direction.
 * Wave 30.B feature 5.
 */
function headPart(): PartSpec {
  return {
    name: 'head',
    kind: 'ellipsoid',
    dims: v3(0.10, 0.12, 0.13),
    role: 'skin',
    place: (d) => ({
      pos: v3(0, 0.30, 1.19),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/** Helmet — follows head yaw. */
function helmetPart(): PartSpec {
  return {
    name: 'helmet',
    kind: 'ellipsoid',
    dims: v3(0.125, 0.16, 0.105),
    role: 'helmet',
    place: (d) => ({
      pos: v3(0, 0.28, 1.255),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/** Helmet visor — follows head yaw. */
function helmetVisorPart(): PartSpec {
  return {
    name: 'helmet-visor',
    kind: 'box',
    dims: v3(0.12, 0.06, 0.018),
    role: 'helmet',
    place: (d) => ({
      pos: v3(0, 0.40, 1.21),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/**
 * Hips — sway laterally during climb-mode.
 * Wave 30.B feature 6: out-of-saddle dance on steep grades.
 */
function hipsPart(): PartSpec {
  return {
    name: 'hips',
    kind: 'box',
    dims: v3(0.30, 0.22, 0.20),
    role: 'kit',
    place: (d) => {
      if (!d.climbing) return { pos: v3(0, -0.06, 0.82), rot: QUAT_IDENTITY };
      const swayX = Math.sin(d.climbSway) * 0.06;
      return { pos: v3(swayX, -0.06, 0.82), rot: QUAT_IDENTITY };
    },
  };
}

const PARTS: PartSpec[] = [
  // ---- wheels (tyre + rim accent + hub + spokes) ---------------------------
  {
    name: 'wheel-rear',
    kind: 'cylinder',
    dims: v3(WHEEL_R, 0.06, WHEEL_R),
    role: 'wheel',
    place: { pos: REAR_HUB, rot: quatZTo(v3(1, 0, 0)) },
  },
  {
    name: 'wheel-front',
    kind: 'cylinder',
    dims: v3(WHEEL_R, 0.06, WHEEL_R),
    role: 'wheel',
    place: { pos: FRONT_HUB, rot: quatZTo(v3(1, 0, 0)) },
  },
  rimAccent('rim-rear', REAR_HUB),
  rimAccent('rim-front', FRONT_HUB),
  hubPart('hub-rear', REAR_HUB),
  hubPart('hub-front', FRONT_HUB),
  spokePart('spoke-rear', REAR_HUB),
  spokePart('spoke-front', FRONT_HUB),

  // ---- frame ---------------------------------------------------------------
  tube('down-tube',  BB,       HEAD_TOP, 0.035, 'frame'),
  tube('seat-tube',  BB,       SADDLE_J, 0.032, 'frame'),
  tube('top-tube',   SADDLE_J, HEAD_TOP, 0.030, 'frame'),
  tube('chain-stay', REAR_HUB, BB,       0.025, 'frame'),
  tube('seat-stay',  REAR_HUB, SADDLE_J, 0.022, 'frame'),
  tube('fork',       HEAD_TOP, FRONT_HUB, 0.028, 'frame'),
  tube('steerer',    HEAD_TOP, BAR,      0.026, 'frame'),
  tube('seatpost',   SEATPOST_BOT, SEATPOST_TOP, 0.020, 'frame'),

  // Flat top section of the handlebar
  {
    name: 'handlebar',
    kind: 'box',
    dims: v3(0.42, 0.05, 0.04),
    role: 'frame',
    place: { pos: BAR, rot: QUAT_IDENTITY },
  },
  tube('drop-left',  DROP_LEFT,  HOOD_LEFT,  0.018, 'frame'),
  tube('drop-right', DROP_RIGHT, HOOD_RIGHT, 0.018, 'frame'),

  {
    name: 'hood-left',
    kind: 'ellipsoid',
    dims: v3(0.038, 0.065, 0.040),
    role: 'frame',
    place: { pos: HOOD_LEFT, rot: QUAT_IDENTITY },
  },
  {
    name: 'hood-right',
    kind: 'ellipsoid',
    dims: v3(0.038, 0.065, 0.040),
    role: 'frame',
    place: { pos: HOOD_RIGHT, rot: QUAT_IDENTITY },
  },

  {
    name: 'saddle',
    kind: 'box',
    dims: v3(0.14, 0.18, 0.05),
    role: 'frame',
    place: { pos: SADDLE, rot: QUAT_IDENTITY },
  },
  {
    name: 'saddle-nose',
    kind: 'box',
    dims: v3(0.07, 0.10, 0.04),
    role: 'frame',
    place: { pos: v3(0, -0.26, 0.70), rot: QUAT_IDENTITY },
  },

  // ---- drivetrain ----------------------------------------------------------
  crankPart('crank-left',  -1),
  crankPart('crank-right',  1),
  chainringPart(),
  pedalPart('pedal-left',  -1),
  pedalPart('pedal-right',  1),

  // ---- rider body ----------------------------------------------------------
  hipsPart(),
  tube('torso', v3(0, -0.08, 0.86), v3(0, 0.20, 1.12), 0.13, 'kit'),

  tube('upper-arm-left',  v3(-0.16, 0.18, 1.10), v3(-0.19, 0.34, 0.98), 0.048, 'kit'),
  tube('upper-arm-right', v3( 0.16, 0.18, 1.10), v3( 0.19, 0.34, 0.98), 0.048, 'kit'),

  forearmPart('forearm-left',  'left'),
  forearmPart('forearm-right', 'right'),

  handPart('hand-left',  'left'),
  handPart('hand-right', 'right'),

  headPart(),
  helmetPart(),
  helmetVisorPart(),

  // ---- legs ----------------------------------------------------------------
  legPart('thigh-left',  -1, 'thigh'),
  legPart('thigh-right',  1, 'thigh'),
  legPart('shin-left',   -1, 'shin'),
  legPart('shin-right',   1, 'shin'),

  {
    name: 'shoe-left',
    kind: 'box',
    dims: v3(0.09, 0.22, 0.06),
    role: 'accent',
    place: (d) => ({ pos: pedalPos(-1, d.crankAngle), rot: QUAT_IDENTITY }),
  },
  {
    name: 'shoe-right',
    kind: 'box',
    dims: v3(0.09, 0.22, 0.06),
    role: 'accent',
    place: (d) => ({ pos: pedalPos(1, d.crankAngle), rot: QUAT_IDENTITY }),
  },
];

// ---- Animation constants --------------------------------------------------

/** Maximum head yaw in radians (~5°). Wave 30.B feature 5. */
const HEAD_YAW_MAX = (5 * Math.PI) / 180;

/** Additional forward pitch when climbing out of saddle (~5°). Wave 30.B feature 6. */
const CLIMB_FORWARD_TILT_RAD = (5 * Math.PI) / 180;

/** Maximum hip sway during climb-mode (~8°). Wave 30.B feature 6. */
const CLIMB_SWAY_MAX_RAD = (8 * Math.PI) / 180;

// ===========================================================================
// Pure-numeric animation helpers — exported for unit tests (Wave 30.B)
// ===========================================================================

/**
 * Returns the current crank phase in radians (unbounded accumulation; use in sin/cos)
 * given a cadence and an elapsed wall-clock time in milliseconds.
 *
 * At 60 RPM = 1 rev/sec → 1000 ms → exactly 2π.
 */
export function pedalPhaseFromCadence(cadenceRpm: number, elapsedMs: number): number {
  if (cadenceRpm <= 0) return 0;
  return (cadenceRpm / 60000) * elapsedMs * 2 * Math.PI;
}

/**
 * Returns the new accumulated wheel rotation (radians) after dtMs milliseconds
 * at speedMs m/s with a wheel of radius wheelRadius m.
 *
 * ω = v / r  (rad/s); Δθ = ω · dt
 *
 * No wrapping — caller uses result in sin/cos.
 */
export function wheelRotationFromSpeed(
  speedMs: number,
  wheelRadius: number,
  prevRotation: number,
  dtMs: number,
): number {
  if (speedMs <= 0 || wheelRadius <= 0 || dtMs <= 0) return prevRotation;
  const omega = speedMs / wheelRadius;
  return prevRotation + omega * (dtMs / 1000);
}

/**
 * Returns the target body lean angle (radians) for a corner.
 *
 * Centripetal acceleration: a_c = v · |Δheading| / dt.
 * Lean θ = atan2(a_c, g).
 * Sign: right turn (positive Δheading) → lean right → negative Cesium roll.
 *
 * Smooth this result with smoothLean() before applying.
 */
export function cornerLeanAngle(
  headingDeltaRad: number,
  speedMs: number,
  dtSec: number,
): number {
  const G = 9.80665;
  if (dtSec <= 0 || speedMs <= 0 || headingDeltaRad === 0) return 0;
  const turnRateAbs = Math.abs(headingDeltaRad) / dtSec;
  const centripetal = speedMs * turnRateAbs;
  const magnitude = Math.atan2(centripetal, G);
  return Math.sign(headingDeltaRad) * -magnitude;
}

/**
 * Exponential-smoothing helper for lean angle.
 * alpha ∈ [0, 1]: 0 = no movement, 1 = instant.
 */
export function smoothLean(prev: number, target: number, alpha: number): number {
  return prev + (target - prev) * Math.max(0, Math.min(1, alpha));
}

/**
 * Returns hip sway oscillation angle (radians) during climb-out-of-saddle.
 *
 * Returns 0 when grade ≤ 8 % or cadence = 0 (not in climb mode).
 * Oscillates at half-cadence (one body-swing per two pedal strokes).
 * Amplitude scales from 0 at 8 % to CLIMB_SWAY_MAX_RAD at 20 % grade.
 */
export function climbingSwayAngle(
  gradePct: number,
  cadenceRpm: number,
  elapsedMs: number,
): number {
  if (gradePct <= 8 || cadenceRpm <= 0) return 0;
  const halfCadence = cadenceRpm / 2;
  const phase = pedalPhaseFromCadence(halfCadence, elapsedMs);
  const normalizedGrade = Math.min(1, (gradePct - 8) / 12);
  return Math.sin(phase) * normalizedGrade * CLIMB_SWAY_MAX_RAD;
}

// ---- Avatar construction --------------------------------------------------

/**
 * Build the procedural cyclist into `viewer`. Call `update()` each frame from
 * the render loop; `setColors()` to restyle; `dispose()` to remove it.
 *
 * Zero Cesium-primitive allocations inside `update()` — all entities are
 * created once here and mutated in-place via CallbackProperty reads each frame.
 */
export function createAvatar(viewer: Cesium.Viewer): Avatar {
  const scene = viewer.scene;
  let colors: AvatarColors = { ...DEFAULT_AVATAR_COLORS };

  let bodyToWorld = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);
  let bodyQuat = Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY);
  const dyn: RigDynamics = {
    wheelAngle: 0,
    crankAngle: 0,
    headYaw: 0,
    climbSway: 0,
    climbing: false,
    riderPosition: 'hoods',
  };

  const world: { pos: Cesium.Cartesian3; rot: Cesium.Quaternion }[] = PARTS.map(() => ({
    pos: new Cesium.Cartesian3(),
    rot: new Cesium.Quaternion(),
  }));

  let smoothedEle: number | null = null;
  let lean = 0;
  let pitch = 0;
  let lastHeading: number | null = null;
  let smoothedHeadYaw = 0;
  let elapsedMs = 0;

  const roleColor = (role: ColorRole) => Cesium.Color.fromCssColorString(colors[role]);

  const entities: Cesium.Entity[] = PARTS.map((part, i) => {
    const position = new Cesium.CallbackPositionProperty(() => world[i].pos, false);
    const orientation = new Cesium.CallbackProperty(() => world[i].rot, false);
    const material = roleColor(part.role);
    const common = { name: `Rider · ${part.name}`, position, orientation };
    if (part.kind === 'box') {
      return viewer.entities.add({
        ...common,
        box: {
          dimensions: new Cesium.Cartesian3(part.dims[0], part.dims[1], part.dims[2]),
          material,
          shadows: Cesium.ShadowMode.ENABLED,
        },
      });
    }
    if (part.kind === 'cylinder') {
      return viewer.entities.add({
        ...common,
        cylinder: {
          length: part.dims[1],
          topRadius: part.dims[0],
          bottomRadius: part.dims[2],
          material,
          shadows: Cesium.ShadowMode.ENABLED,
          slices: 16,
        },
      });
    }
    return viewer.entities.add({
      ...common,
      ellipsoid: {
        radii: new Cesium.Cartesian3(part.dims[0], part.dims[1], part.dims[2]),
        material,
        shadows: Cesium.ShadowMode.ENABLED,
      },
    });
  });

  function recomputeParts(): void {
    for (let i = 0; i < PARTS.length; i++) {
      const part = PARTS[i];
      const local = typeof part.place === 'function' ? part.place(dyn) : part.place;
      Cesium.Matrix4.multiplyByPoint(
        bodyToWorld,
        new Cesium.Cartesian3(local.pos[0], local.pos[1], local.pos[2]),
        world[i].pos,
      );
      Cesium.Quaternion.multiply(bodyQuat, local.rot, world[i].rot);
    }
  }

  // ---- Avatar render (Wave 30.B) ------------------------------------------
  function update(u: AvatarUpdate): void {
    const dt = Math.min(0.1, Math.max(0, u.dt));
    elapsedMs += dt * 1000;

    // Ground height — smoothed so streaming tile changes don't pop.
    const ground = sampleGroundHeight(scene, u.lon, u.lat);
    const targetEle = ground ?? u.ele;
    if (smoothedEle === null) smoothedEle = targetEle;
    else smoothedEle += (targetEle - smoothedEle) * (1 - Math.exp(-6 * dt));

    // Feature 3: corner lean — centripetal tilt, smoothed.
    const headingDelta = lastHeading === null ? 0 : shortestAngle(lastHeading, u.heading);
    lastHeading = u.heading;
    const targetLean = cornerLeanAngle(headingDelta, u.speed, dt || 1 / 60);
    lean += (targetLean - lean) * (1 - Math.exp(-5 * dt));

    // Pitch from gradient.
    const targetPitch = Math.atan(u.grade / 100);
    pitch += (targetPitch - pitch) * (1 - Math.exp(-4 * dt));

    // Feature 2: wheel rotation.
    dyn.wheelAngle = wheelRotationFromSpeed(u.speed, WHEEL_R, dyn.wheelAngle, dt * 1000);

    // Feature 1: pedaling — crank phase from cadence.
    const rpm = u.cadence > 0 ? u.cadence : estimateCadence(u.speed);
    dyn.crankAngle = pedalPhaseFromCadence(rpm, elapsedMs);

    // Feature 5: head yaw toward turn, capped at ±5°, smoothed.
    const turnRate = headingDelta / (dt || 1 / 60);
    const targetHeadYaw = Math.max(-HEAD_YAW_MAX, Math.min(HEAD_YAW_MAX, turnRate * 0.12));
    smoothedHeadYaw += (targetHeadYaw - smoothedHeadYaw) * (1 - Math.exp(-8 * dt));
    dyn.headYaw = smoothedHeadYaw;

    // Feature 6: climb-mode out-of-saddle.
    const climbing = u.grade > 8;
    dyn.climbing = climbing;
    dyn.climbSway = climbing ? climbingSwayAngle(u.grade, rpm, elapsedMs) : 0;

    // Feature 4: hand posture.
    dyn.riderPosition = u.riderPosition ?? 'hoods';

    // Globe transform: heading + pitch (+ climb tilt) + lean.
    const climbTilt = climbing ? CLIMB_FORWARD_TILT_RAD : 0;
    const origin = Cesium.Cartesian3.fromDegrees(u.lon, u.lat, smoothedEle);
    const hpr = new Cesium.HeadingPitchRoll(u.heading, pitch + climbTilt, lean);
    bodyToWorld = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr, Cesium.Ellipsoid.WGS84, undefined, bodyToWorld);
    bodyQuat = Cesium.Transforms.headingPitchRollQuaternion(origin, hpr, Cesium.Ellipsoid.WGS84, undefined, bodyQuat);

    recomputeParts();
  }
  // ---- End avatar render (Wave 30.B) --------------------------------------

  function setColors(next: AvatarColors): void {
    colors = { ...next };
    for (let i = 0; i < PARTS.length; i++) {
      const ent = entities[i];
      const col = roleColor(PARTS[i].role);
      if (ent.box) ent.box.material = new Cesium.ColorMaterialProperty(col);
      else if (ent.cylinder) ent.cylinder.material = new Cesium.ColorMaterialProperty(col);
      else if (ent.ellipsoid) ent.ellipsoid.material = new Cesium.ColorMaterialProperty(col);
    }
  }

  function dispose(): void {
    for (const ent of entities) {
      if (!viewer.isDestroyed()) viewer.entities.remove(ent);
    }
  }

  return { entities, update, setColors, dispose };
}

// ---- Private helpers ------------------------------------------------------

/** Shortest signed angular delta a→b, radians, in (-π, π]. */
function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Plausible cadence from speed when no sensor reports it (~70 GI gearing). */
function estimateCadence(speedMs: number): number {
  if (speedMs < 0.5) return 0;
  return Math.max(55, Math.min(105, (speedMs / 7.4) * 60));
}
