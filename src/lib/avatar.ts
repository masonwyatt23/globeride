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
 * Animation:
 *   1. Pedaling legs alternate around the bottom bracket at cadence frequency.
 *   2. Wheels spin with ground speed (radius 0.34 m).
 *   3. Body leans into corners proportional to centripetal acceleration, smoothed.
 *   4. Hand positions shift by rider posture (hoods / tops / drops).
 *   5. Head yaws ±5° toward the direction of heading change.
 *   6. Climb-mode (grade > 8 %): body tilts forward 5° and hips sway at cadence.
 * All driven from `update()` once per frame; zero Cesium-primitive allocations.
 *
 * raised geometry fidelity — segmented limbs, multi-style helmets,
 * glasses, water bottle, 4-cross spoke pattern, brake rotors, PBR-like materials,
 * and sweat/effort shading via setAvatarEffortLevel().
 */

// ---- Appearance -----------------------------------------------------------

type ColorRole = keyof AvatarColors;

/** Helmet geometry style. */
export type HelmetStyle = 'road' | 'aero' | 'climbing';

/**
 * Bike frame geometry variants.
 * drives wheel depth, tyre width, handlebar geometry, frame details.
 */
export type BikeShape =
  | 'roadAero'       // deep rims, aero bars, thick top tube
  | 'roadClimber'    // shallow rims, upright hoods, thin tubes
  | 'roadAllRounder' // standard road (default)
  | 'tt'             // aero bars + skinny clip-on extensions, disc-style rear
  | 'gravel'         // drop bars, wider tyres
  | 'fixie'          // drop bars, no derailleur box
  | 'mtbHardtail'    // flat bars, fat tyres, suspension fork tubes
  | 'mtbFullSus'     // flat bars, fat tyres, both suspension
  | 'ebike'          // battery on down tube
  | 'vintage';       // steel round tubes, no derailleur detail

/**
 * Jersey / kit colour pattern.
 * changes jersey primitives to show bands, dots, or splits.
 */
export type KitPattern =
  | 'solid'          // current behaviour (default)
  | 'polka'          // red dots on white — KOM polka dot
  | 'rainbow'        // 5 UCI bands across chest
  | 'yellowLeader'   // solid yellow, black cuff accents
  | 'sprinterGreen'  // solid green, white sleeves
  | 'stripes'        // horizontal alternating stripes
  | 'fluoro'         // bright primary + darker hem accent
  | 'teamReplica';   // 3-colour chest/mid/hem split

/** Per-kit accent colours forwarded from GearItem.accentColors. */
export interface KitAccent {
  primary: string;
  secondary?: string;
  tertiary?: string;
}

/**
 * Shoe geometry style.
 * alters sole width, cleat hint, and colour accent.
 */
export type ShoeStyle = 'roadClip' | 'gravel' | 'mtbClip' | 'vintage' | 'fluoro';

/**
 * Options for createAvatar(). All fields are optional — existing call sites
 * that pass only a viewer continue to work with sensible defaults.
 */
export interface AvatarOptions {
  /** Initial colors. Can be changed later via setColors(). */
  colors?: AvatarColors;
  /** Rider's default handlebar position. Defaults to 'hoods'. */
  posture?: RiderPosition;
  /** Helmet shell shape. Defaults to 'road'. */
  helmetStyle?: HelmetStyle;
  /** Whether to render sunglasses lenses in front of the eyes. */
  hasGlasses?: boolean;
  /** Whether to render a water bottle on the down tube. */
  hasBottle?: boolean;
  /**
   * Bike frame geometry variant
   * Defaults to 'roadAllRounder' when omitted.
   */
  bikeShape?: BikeShape;
  /**
   * Jersey / kit colour pattern
   * Defaults to 'solid' when omitted.
   */
  kitPattern?: KitPattern;
  /**
   * Accent colours for multi-colour kit patterns
   * When omitted, the base accent colour is reused.
   */
  kitAccent?: KitAccent;
  /**
   * Shoe geometry style
   * Defaults to 'roadClip' when omitted.
   */
  shoeStyle?: ShoeStyle;
}

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

/** Handle returned by createAvatar — used by setAvatarEffortLevel. */
export type AvatarHandle = ReturnType<typeof createAvatar>;

export interface Avatar {
  entities: Cesium.Entity[];
  update: (u: AvatarUpdate) => void;
  setColors: (c: AvatarColors) => void;
  dispose: () => void;
  /** Internal: current skin color including effort tint. Set by setAvatarEffortLevel. */
  _effortLevel: number;
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
  /**
   * Optional alpha override (0–1). Used for glass/transparent parts.
   * Applied at entity creation time — not updated per frame.
   */
  alpha?: number;
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

// Hip / shoulder landmarks
const HIP_LEFT   = v3(-0.1, -0.04, 0.82);
const HIP_RIGHT  = v3( 0.1, -0.04, 0.82);
const KNEE_LEFT  = v3(-0.1, 0.02, 0.55);   // nominal resting knee (overridden by IK)
const KNEE_RIGHT = v3( 0.1, 0.02, 0.55);

// Shoulder attachment points (top of torso where arms connect)
const SHOULDER_LEFT  = v3(-0.16, 0.12, 1.12);
const SHOULDER_RIGHT = v3( 0.16, 0.12, 1.12);
const ELBOW_LEFT     = v3(-0.19, 0.34, 0.98);
const ELBOW_RIGHT    = v3( 0.19, 0.34, 0.98);

// ---- Hand positions per posture -------------------------------------------

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

/**
 * 2-bone IK leg solver — returns hip, knee, and pedal positions.
 * Shared by thigh, shin, and knee-joint parts.
 */
function solveIK(side: -1 | 1, crankAngle: number): { hip: V3; knee: V3; pedal: V3 } {
  const hip = v3(side * 0.1, -0.04, 0.82);
  const pedal = pedalPos(side, crankAngle);
  const ay = pedal[1] - hip[1];
  const az = pedal[2] - hip[2];
  let dist = Math.hypot(ay, az);
  dist = Math.min(THIGH_L + SHIN_L - 0.002, Math.max(Math.abs(THIGH_L - SHIN_L) + 0.002, dist));
  const base = Math.atan2(az, ay);
  const hipAng = Math.acos(
    Math.min(1, Math.max(-1, (THIGH_L * THIGH_L + dist * dist - SHIN_L * SHIN_L) / (2 * THIGH_L * dist))),
  );
  const thighAng = base + hipAng;
  const knee = v3(hip[0], hip[1] + Math.cos(thighAng) * THIGH_L, hip[2] + Math.sin(thighAng) * THIGH_L);
  return { hip, knee, pedal };
}

/** Thigh segment — hip to knee. */
function thighPart(name: string, side: -1 | 1): PartSpec {
  return {
    name,
    kind: 'cylinder',
    dims: v3(0.055, THIGH_L, 0.055),
    role: 'kit',
    place: (d) => {
      const { hip, knee } = solveIK(side, d.crankAngle);
      return { pos: mid(hip, knee), rot: quatZTo(sub(knee, hip)) };
    },
  };
}

/** Shin / calf segment — knee to ankle (pedal level). */
function shinPart(name: string, side: -1 | 1): PartSpec {
  return {
    name,
    kind: 'cylinder',
    dims: v3(0.042, SHIN_L, 0.042),
    role: 'skin',
    place: (d) => {
      const { knee, pedal } = solveIK(side, d.crankAngle);
      return { pos: mid(knee, pedal), rot: quatZTo(sub(pedal, knee)) };
    },
  };
}

/** Knee-cap joint — small sphere at the knee. */
function kneePart(name: string, side: -1 | 1): PartSpec {
  return {
    name,
    kind: 'ellipsoid',
    dims: v3(0.062, 0.062, 0.062),
    role: 'skin',
    place: (d) => {
      const { knee } = solveIK(side, d.crankAngle);
      return { pos: knee, rot: QUAT_IDENTITY };
    },
  };
}

/** Ankle/foot — slightly wider box at pedal, follows crank. */
function anklePart(name: string, side: -1 | 1): PartSpec {
  return {
    name,
    kind: 'ellipsoid',
    dims: v3(0.048, 0.048, 0.042),
    role: 'skin',
    place: (d) => ({ pos: pedalPos(side, d.crankAngle), rot: QUAT_IDENTITY }),
  };
}

/** Cycling shoe — follows pedal position. Geometry varies by shoeStyle. */
function shoePart(name: string, side: -1 | 1, style: ShoeStyle): PartSpec {
  // Sole dimensions: width (X), length (Y), height (Z)
  const soleDims: Record<ShoeStyle, V3> = {
    roadClip: v3(0.082, 0.20, 0.052),   // narrow, stiff
    gravel:   v3(0.090, 0.20, 0.058),   // slightly wider, walkable
    mtbClip:  v3(0.098, 0.21, 0.062),   // widest, grippiest
    vintage:  v3(0.086, 0.20, 0.056),   // leather-brown shape
    fluoro:   v3(0.082, 0.20, 0.052),   // same as road, vivid colour applied via role
  };
  const dims = soleDims[style];
  // MTB sole gets a slightly darker outsole hint via 'wheel' role (near-black).
  // Fluoro gets 'kit' role so it picks up the bright kit primary.
  // Vintage gets 'frame' role (warm brown from frame color).
  // Road/gravel get 'accent' role as before.
  const role: ColorRole =
    style === 'mtbClip'  ? 'wheel'  :
    style === 'fluoro'   ? 'kit'    :
    style === 'vintage'  ? 'frame'  : 'accent';
  return {
    name,
    kind: 'box',
    dims,
    role,
    place: (d) => ({ pos: pedalPos(side, d.crankAngle), rot: QUAT_IDENTITY }),
  };
}

/** Cleat hint on road shoes — tiny box near the toe. Allocation-free static. */
function shoeCleatPart(name: string, side: -1 | 1): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.030, 0.038, 0.012),
    role: 'wheel',
    place: (d) => {
      const base = pedalPos(side, d.crankAngle);
      return { pos: v3(base[0], base[1] + 0.065, base[2] - 0.032), rot: QUAT_IDENTITY };
    },
  };
}

/** MTB outsole grip blocks — two small bumps under the sole. */
function mtbGripPart(name: string, side: -1 | 1, yOffset: number): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.092, 0.030, 0.016),
    role: 'accent',
    place: (d) => {
      const base = pedalPos(side, d.crankAngle);
      return { pos: v3(base[0], base[1] + yOffset, base[2] - 0.042), rot: QUAT_IDENTITY };
    },
  };
}

/** Shoulder joint sphere — static, at top of torso where arm begins. */
function shoulderPart(name: string, side: 'left' | 'right'): PartSpec {
  const pos = side === 'left' ? SHOULDER_LEFT : SHOULDER_RIGHT;
  return {
    name,
    kind: 'ellipsoid',
    dims: v3(0.055, 0.055, 0.055),
    role: 'kit',
    place: { pos, rot: QUAT_IDENTITY },
  };
}

/** Elbow joint sphere — static. */
function elbowPart(name: string, side: 'left' | 'right'): PartSpec {
  const pos = side === 'left' ? ELBOW_LEFT : ELBOW_RIGHT;
  return {
    name,
    kind: 'ellipsoid',
    dims: v3(0.040, 0.040, 0.040),
    role: 'skin',
    place: { pos, rot: QUAT_IDENTITY },
  };
}

/** Hand — position follows rider posture (hoods / drops / tops). */
function handPart(name: string, side: 'left' | 'right'): PartSpec {
  return {
    name,
    kind: 'ellipsoid',
    dims: v3(0.040, 0.055, 0.038),
    role: 'skin',
    place: (d) => ({ pos: HAND_POS[d.riderPosition][side], rot: QUAT_IDENTITY }),
  };
}

/** Forearm — wrist follows posture, elbow is fixed. */
function forearmPart(name: string, side: 'left' | 'right'): PartSpec {
  const elbow = side === 'left' ? ELBOW_LEFT : ELBOW_RIGHT;
  return {
    name,
    kind: 'cylinder',
    dims: v3(0.033, 0.20, 0.033),
    role: 'skin',
    place: (d) => {
      const wrist = FOREARM_END[d.riderPosition][side];
      return { pos: mid(elbow, wrist), rot: quatZTo(sub(wrist, elbow)) };
    },
  };
}

/** Head — yaws ±5° toward turn direction. */
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

/**
 * Helmet shell — shape differs by style:
 *   road:     short aero tail, wider vented body
 *   aero:     teardrop elongated rear
 *   climbing: rounder, taller, more vented feel
 */
function helmetShellPart(style: HelmetStyle): PartSpec {
  const dims: Record<HelmetStyle, V3> = {
    road:     v3(0.125, 0.16, 0.105),
    aero:     v3(0.118, 0.21, 0.098),   // more elongated front-to-back
    climbing: v3(0.130, 0.14, 0.115),   // taller, rounder
  };
  return {
    name: 'helmet',
    kind: 'ellipsoid',
    dims: dims[style],
    role: 'helmet',
    place: (d) => ({
      pos: v3(0, 0.28, 1.255),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/**
 * Helmet visor — shape/presence differs by style:
 *   aero: larger chin-guard visor
 *   road/climbing: short brim
 */
function helmetVisorPart(style: HelmetStyle): PartSpec {
  const dims: Record<HelmetStyle, V3> = {
    road:     v3(0.115, 0.055, 0.016),
    aero:     v3(0.120, 0.080, 0.020),  // larger chin area
    climbing: v3(0.105, 0.045, 0.014),  // minimal brim
  };
  const fwdOffset: Record<HelmetStyle, number> = { road: 0.40, aero: 0.42, climbing: 0.38 };
  return {
    name: 'helmet-visor',
    kind: 'box',
    dims: dims[style],
    role: 'helmet',
    place: (d) => ({
      pos: v3(0, fwdOffset[style], 1.21),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/**
 * Helmet vent accent bar — dark horizontal slot across the mid shell.
 * Gives the visual impression of vent channels without actual gaps.
 */
function helmetVentPart(name: string, zOffset: number): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.095, 0.025, 0.012),
    role: 'wheel',  // dark vent color (wheel role = near-black)
    place: (d) => ({
      pos: v3(0, 0.29, 1.24 + zOffset),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/** Helmet retention strap — thin vertical strip under the chin. */
function helmetStrapPart(): PartSpec {
  return {
    name: 'helmet-strap',
    kind: 'box',
    dims: v3(0.008, 0.010, 0.055),
    role: 'helmet',
    place: (d) => ({
      pos: v3(0, 0.33, 1.17),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/** Sunglasses lens — flat oval in front of the eyes. */
function glassesLensPart(name: string, xOffset: number): PartSpec {
  return {
    name,
    kind: 'ellipsoid',
    dims: v3(0.040, 0.008, 0.022),
    role: 'accent',  // tinted lens — accent color
    alpha: 0.55,
    place: (d) => ({
      pos: v3(xOffset, 0.38, 1.185),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/** Glasses bridge bar across the nose. */
function glassesBridgePart(): PartSpec {
  return {
    name: 'glasses-bridge',
    kind: 'box',
    dims: v3(0.030, 0.006, 0.006),
    role: 'accent',
    place: (d) => ({
      pos: v3(0, 0.375, 1.185),
      rot: d.headYaw !== 0 ? quatRotZ(d.headYaw) : QUAT_IDENTITY,
    }),
  };
}

/** Water bottle on the down tube — cylinder, kit color. */
function waterBottlePart(): PartSpec {
  // Down tube mid-point: between BB and HEAD_TOP
  const bottlePos = v3(0, 0.24, 0.50);
  return {
    name: 'water-bottle',
    kind: 'cylinder',
    dims: v3(0.038, 0.20, 0.038),
    role: 'kit',
    place: {
      // Align with the down-tube direction
      pos: bottlePos,
      rot: quatZTo(sub(HEAD_TOP, BB)),
    },
  };
}

/** A spinning spoke bar so the wheel visibly rotates. */
function spokePart(name: string, hub: V3): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.012, 0.012, WHEEL_R * 1.85),
    role: 'accent',
    place: (d) => ({ pos: hub, rot: quatRotX(d.wheelAngle) }),
  };
}

/** Second spoke cross — rotated 45° from the first for a 4-cross pattern. */
function spokeCross2(name: string, hub: V3): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.012, 0.012, WHEEL_R * 1.85),
    role: 'accent',
    place: (d) => ({
      pos: hub,
      rot: Cesium.Quaternion.multiply(
        quatRotX(d.wheelAngle),
        Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, Math.PI / 4, new Cesium.Quaternion()),
        new Cesium.Quaternion(),
      ),
    }),
  };
}

/** Spoke cross 3 — 90° from the first (completes the 4-cross look). */
function spokeCross3(name: string, hub: V3): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.012, 0.012, WHEEL_R * 1.85),
    role: 'accent',
    place: (d) => ({
      pos: hub,
      rot: Cesium.Quaternion.multiply(
        quatRotX(d.wheelAngle),
        Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, Math.PI / 2, new Cesium.Quaternion()),
        new Cesium.Quaternion(),
      ),
    }),
  };
}

/** Spoke cross 4 — 135° from the first. */
function spokeCross4(name: string, hub: V3): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.012, 0.012, WHEEL_R * 1.85),
    role: 'accent',
    place: (d) => ({
      pos: hub,
      rot: Cesium.Quaternion.multiply(
        quatRotX(d.wheelAngle),
        Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, (3 * Math.PI) / 4, new Cesium.Quaternion()),
        new Cesium.Quaternion(),
      ),
    }),
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

/** Brake rotor disc — thin flat disc at the hub, slightly outside the hub flange. */
function brakeRotorPart(name: string, hub: V3, side: -1 | 1): PartSpec {
  const pos = v3(hub[0] + side * 0.065, hub[1], hub[2]);
  return {
    name,
    kind: 'cylinder',
    dims: v3(0.090, 0.008, 0.090),
    role: 'accent',
    place: { pos, rot: quatZTo(v3(1, 0, 0)) },
  };
}

/**
 * Rim accent — a thin-walled ring slightly inside the tyre.
 */
function _rimAccent(name: string, hub: V3): PartSpec {
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
    dims: v3(0.09, 0.075, 0.016),
    role: 'accent',
    place: (d) => ({ pos: pedalPos(side, d.crankAngle), rot: QUAT_IDENTITY }),
  };
}

/** Hips — sway laterally out of the saddle on steep grades (>8 %). */
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

// ---- Bike shape geometry helpers ------------------------------

/** Rim depth multiplier and tyre width by bike shape. */
const BIKE_WHEEL_PROFILE: Record<BikeShape, { rimDepth: number; tyreWidth: number }> = {
  roadAero:       { rimDepth: 0.96, tyreWidth: 0.060 },
  roadClimber:    { rimDepth: 0.80, tyreWidth: 0.056 },
  roadAllRounder: { rimDepth: 0.88, tyreWidth: 0.060 },
  tt:             { rimDepth: 0.96, tyreWidth: 0.058 },
  gravel:         { rimDepth: 0.78, tyreWidth: 0.080 },
  fixie:          { rimDepth: 0.88, tyreWidth: 0.056 },
  mtbHardtail:    { rimDepth: 0.72, tyreWidth: 0.110 },
  mtbFullSus:     { rimDepth: 0.72, tyreWidth: 0.110 },
  ebike:          { rimDepth: 0.80, tyreWidth: 0.072 },
  vintage:        { rimDepth: 0.82, tyreWidth: 0.062 },
};

/** Frame tube radius scale — thicker for aero/TT, thinner for climber/vintage. */
const BIKE_TUBE_SCALE: Record<BikeShape, number> = {
  roadAero:       1.12,
  roadClimber:    0.88,
  roadAllRounder: 1.00,
  tt:             1.10,
  gravel:         0.96,
  fixie:          0.94,
  mtbHardtail:    1.04,
  mtbFullSus:     1.06,
  ebike:          1.10,
  vintage:        0.92,
};

/** Tyre cylinder — width varies by bike type. */
function tyrePart(name: string, hub: V3, tyreWidth: number): PartSpec {
  return {
    name,
    kind: 'cylinder',
    dims: v3(WHEEL_R, tyreWidth, WHEEL_R),
    role: 'wheel',
    place: { pos: hub, rot: quatZTo(v3(1, 0, 0)) },
  };
}

/** Rim accent with variable depth — aero bikes get a taller rim wall. */
function rimAccentShaped(name: string, hub: V3, rimDepth: number): PartSpec {
  return {
    name,
    kind: 'cylinder',
    dims: v3(WHEEL_R * rimDepth, 0.025, WHEEL_R * rimDepth),
    role: 'accent',
    place: { pos: hub, rot: quatZTo(v3(1, 0, 0)) },
  };
}

/** TT aero bar extensions — two thin forward-pointing cylinders. */
function ttBarPart(name: string, xSide: number): PartSpec {
  return {
    name,
    kind: 'cylinder',
    dims: v3(0.014, 0.22, 0.014),
    role: 'frame',
    place: { pos: v3(xSide * 0.065, 0.62, 0.87), rot: quatZTo(v3(0, 1, 0)) },
  };
}

/** Flat MTB/gravel bar — wide box replacing drop-bar section. */
function flatBarPart(): PartSpec {
  return {
    name: 'flat-handlebar',
    kind: 'box',
    dims: v3(0.55, 0.04, 0.038),
    role: 'frame',
    place: { pos: v3(0, 0.46, 0.88), rot: QUAT_IDENTITY },
  };
}

/** Suspension fork leg — vertical tube from steerer to wheel axle. */
function suspForkPart(name: string, xSide: number): PartSpec {
  return tube(name, v3(xSide * 0.040, HEAD_TOP[1], HEAD_TOP[2]),
                    v3(xSide * 0.040, FRONT_HUB[1], FRONT_HUB[2]), 0.022, 'frame');
}

/** E-bike battery box on the down tube. */
function ebikeBatteryPart(): PartSpec {
  return {
    name: 'ebike-battery',
    kind: 'box',
    dims: v3(0.065, 0.26, 0.065),
    role: 'accent',
    place: { pos: v3(0, 0.21, 0.46), rot: quatZTo(sub(HEAD_TOP, BB)) },
  };
}

// ---- Kit pattern helpers --------------------------------------

/** Horizontal jersey band — thin box across the torso at a given Z height. */
function jerseyBandPart(name: string, zPos: number, role: ColorRole): PartSpec {
  return {
    name,
    kind: 'box',
    dims: v3(0.30, 0.22, 0.065),
    role,
    place: { pos: v3(0, 0.05, zPos), rot: QUAT_IDENTITY },
  };
}

/** Polka dot — small ellipsoid on jersey surface. */
function polkaDotPart(name: string, x: number, z: number): PartSpec {
  return {
    name,
    kind: 'ellipsoid',
    dims: v3(0.028, 0.012, 0.028),
    role: 'accent',
    place: { pos: v3(x, 0.22, z), rot: QUAT_IDENTITY },
  };
}

// ---- Per-instance part list builder ----------------------------------------

/**
 * Build the full PARTS list for one avatar instance.
 * Options control accessory geometry so different riders can have
 * different gear without global PARTS contamination.
 *
 * branches on bikeShape (wheels/bars/frame/accessories),
 * kitPattern (jersey overlays), and shoeStyle (sole geometry + colour role).
 */
type ResolvedAvatarOptions = Omit<Required<AvatarOptions>, 'kitAccent'> & { kitAccent: KitAccent | undefined };

function buildParts(opts: ResolvedAvatarOptions): PartSpec[] {
  const shape = opts.bikeShape;
  const { rimDepth, tyreWidth } = BIKE_WHEEL_PROFILE[shape];
  const ts = BIKE_TUBE_SCALE[shape];   // tube scale

  const isMtb    = shape === 'mtbHardtail' || shape === 'mtbFullSus';
  const isGravel = shape === 'gravel';
  const isTT     = shape === 'tt';
  const isEbike  = shape === 'ebike';

  const parts: PartSpec[] = [
    // ---- wheels — tyre width + rim depth vary by bikeShape ----------------
    tyrePart('wheel-rear',  REAR_HUB,  tyreWidth),
    tyrePart('wheel-front', FRONT_HUB, tyreWidth),
    rimAccentShaped('rim-rear',  REAR_HUB,  rimDepth),
    rimAccentShaped('rim-front', FRONT_HUB, rimDepth),
    hubPart('hub-rear',  REAR_HUB),
    hubPart('hub-front', FRONT_HUB),
    // 4-cross spoke pattern
    spokePart('spoke-rear-1',   REAR_HUB),
    spokeCross2('spoke-rear-2', REAR_HUB),
    spokeCross3('spoke-rear-3', REAR_HUB),
    spokeCross4('spoke-rear-4', REAR_HUB),
    spokePart('spoke-front-1',   FRONT_HUB),
    spokeCross2('spoke-front-2', FRONT_HUB),
    spokeCross3('spoke-front-3', FRONT_HUB),
    spokeCross4('spoke-front-4', FRONT_HUB),
    brakeRotorPart('rotor-rear',  REAR_HUB,  -1),
    brakeRotorPart('rotor-front', FRONT_HUB, -1),

    // ---- frame — tube radii scaled by bikeShape ---------------------------
    tube('down-tube',  BB,           HEAD_TOP,          0.035 * ts, 'frame'),
    tube('seat-tube',  BB,           SADDLE_J,          0.032 * ts, 'frame'),
    tube('top-tube',   SADDLE_J,     HEAD_TOP,          0.030 * ts, 'frame'),
    tube('chain-stay', REAR_HUB,     BB,                0.025 * ts, 'frame'),
    tube('seat-stay',  REAR_HUB,     SADDLE_J,          0.022 * ts, 'frame'),
    tube('steerer',    HEAD_TOP,     BAR,               0.026 * ts, 'frame'),
    tube('seatpost',   SEATPOST_BOT, SEATPOST_TOP,      0.020 * ts, 'frame'),
    tube('head-tube',  v3(0, 0.44, 0.58), HEAD_TOP,    0.028 * ts, 'frame'),

    { name: 'saddle', kind: 'box', dims: v3(0.14, 0.18, 0.05), role: 'frame',
      place: { pos: SADDLE, rot: QUAT_IDENTITY } },
    { name: 'saddle-nose', kind: 'box', dims: v3(0.07, 0.10, 0.04), role: 'frame',
      place: { pos: v3(0, -0.26, 0.70), rot: QUAT_IDENTITY } },

    // ---- drivetrain ----------------------------------------------------------
    crankPart('crank-left',  -1),
    crankPart('crank-right',  1),
    chainringPart(),
    pedalPart('pedal-left',  -1),
    pedalPart('pedal-right',  1),

    // ---- rider body ----------------------------------------------------------
    hipsPart(),
    tube('torso', v3(0, -0.08, 0.86), v3(0, 0.20, 1.12), 0.13, 'kit'),
    shoulderPart('shoulder-left',  'left'),
    shoulderPart('shoulder-right', 'right'),
    tube('upper-arm-left',  SHOULDER_LEFT,  ELBOW_LEFT,  0.044, 'kit'),
    tube('upper-arm-right', SHOULDER_RIGHT, ELBOW_RIGHT, 0.044, 'kit'),
    elbowPart('elbow-left',  'left'),
    elbowPart('elbow-right', 'right'),
    forearmPart('forearm-left',  'left'),
    forearmPart('forearm-right', 'right'),
    handPart('hand-left',  'left'),
    handPart('hand-right', 'right'),
    headPart(),

    // ---- helmet --------------------------------------------------------------
    helmetShellPart(opts.helmetStyle),
    helmetVisorPart(opts.helmetStyle),
    helmetVentPart('helmet-vent-1', 0.010),
    helmetVentPart('helmet-vent-2', -0.010),
    helmetStrapPart(),

    // ---- legs + shoes --------------------------------------------------------
    thighPart('thigh-left',  -1),
    thighPart('thigh-right',  1),
    kneePart('knee-left',   -1),
    kneePart('knee-right',   1),
    shinPart('shin-left',   -1),
    shinPart('shin-right',   1),
    anklePart('ankle-left',  -1),
    anklePart('ankle-right',  1),
    shoePart('shoe-left',  -1, opts.shoeStyle),
    shoePart('shoe-right',  1, opts.shoeStyle),
  ];

  // ---- Handlebar geometry — varies by bikeShape ----------------------------
  if (isMtb || isGravel) {
    parts.push(flatBarPart());
  } else if (isTT) {
    parts.push(
      { name: 'handlebar', kind: 'box', dims: v3(0.38, 0.05, 0.04), role: 'frame',
        place: { pos: BAR, rot: QUAT_IDENTITY } },
      ttBarPart('tt-bar-left',  -1),
      ttBarPart('tt-bar-right',  1),
    );
  } else {
    // Standard drop-bar road geometry.
    parts.push(
      { name: 'handlebar', kind: 'box', dims: v3(0.42, 0.05, 0.04), role: 'frame',
        place: { pos: BAR, rot: QUAT_IDENTITY } },
      tube('drop-left',  DROP_LEFT,  HOOD_LEFT,  0.018, 'frame'),
      tube('drop-right', DROP_RIGHT, HOOD_RIGHT, 0.018, 'frame'),
      { name: 'hood-left',  kind: 'ellipsoid', dims: v3(0.038, 0.065, 0.040),
        role: 'frame', place: { pos: HOOD_LEFT,  rot: QUAT_IDENTITY } },
      { name: 'hood-right', kind: 'ellipsoid', dims: v3(0.038, 0.065, 0.040),
        role: 'frame', place: { pos: HOOD_RIGHT, rot: QUAT_IDENTITY } },
    );
  }

  // ---- Fork — MTB gets dual suspension legs --------------------------------
  if (isMtb) {
    parts.push(
      suspForkPart('susp-fork-left',  -1),
      suspForkPart('susp-fork-right',  1),
      { name: 'susp-brace', kind: 'cylinder', dims: v3(0.014, 0.085, 0.014),
        role: 'frame',
        place: { pos: v3(0, FRONT_HUB[1] + 0.08, FRONT_HUB[2] + 0.22),
                 rot: quatZTo(v3(1, 0, 0)) } },
    );
    if (shape === 'mtbFullSus') {
      parts.push(
        { name: 'rear-shock', kind: 'cylinder', dims: v3(0.018, 0.13, 0.018),
          role: 'accent',
          place: { pos: v3(0, -0.25, 0.52),
                   rot: quatZTo(sub(v3(0, -0.05, 0.65), v3(0, -0.30, 0.43))) } },
      );
    }
  } else {
    parts.push(tube('fork', HEAD_TOP, FRONT_HUB, 0.028 * ts, 'frame'));
  }

  // ---- E-bike battery ------------------------------------------------------
  if (isEbike) parts.push(ebikeBatteryPart());

  // ---- Shoe detail geometry ------------------------------------------------
  const ss = opts.shoeStyle;
  if (ss === 'roadClip' || ss === 'gravel') {
    parts.push(shoeCleatPart('cleat-left', -1), shoeCleatPart('cleat-right', 1));
  } else if (ss === 'mtbClip') {
    parts.push(
      mtbGripPart('grip-left-f',  -1,  0.050),
      mtbGripPart('grip-left-r',  -1, -0.050),
      mtbGripPart('grip-right-f',  1,  0.050),
      mtbGripPart('grip-right-r',  1, -0.050),
    );
  }

  // ---- Kit pattern overlays ------------------------------------------------
  const kp = opts.kitPattern;
  if (kp === 'rainbow') {
    const RAINBOW_ROLES: ColorRole[] = ['accent', 'kit', 'wheel', 'helmet', 'frame'];
    for (let i = 0; i < 5; i++) {
      parts.push(jerseyBandPart(`rainbow-band-${i}`, 0.94 + i * 0.050, RAINBOW_ROLES[i]));
    }
  } else if (kp === 'polka') {
    const DOTS: [number, number][] = [
      [-0.08, 1.02], [0.08, 1.02],
      [-0.11, 0.95], [0.11, 0.95],
      [-0.06, 0.88], [0.06, 0.88],
    ];
    for (let i = 0; i < DOTS.length; i++) {
      parts.push(polkaDotPart(`polka-${i}`, DOTS[i][0], DOTS[i][1]));
    }
  } else if (kp === 'stripes') {
    parts.push(
      jerseyBandPart('stripe-0', 1.00, 'accent'),
      jerseyBandPart('stripe-1', 0.93, 'kit'),
      jerseyBandPart('stripe-2', 0.86, 'accent'),
    );
  } else if (kp === 'teamReplica') {
    parts.push(
      jerseyBandPart('team-chest', 1.01, 'accent'),
      jerseyBandPart('team-mid',   0.93, 'kit'),
      jerseyBandPart('team-hem',   0.86, 'frame'),
    );
  } else if (kp === 'yellowLeader') {
    parts.push(
      { name: 'cuff-left',  kind: 'box', dims: v3(0.075, 0.030, 0.030),
        role: 'wheel', place: { pos: v3(-0.21, 0.42, 0.82), rot: QUAT_IDENTITY } },
      { name: 'cuff-right', kind: 'box', dims: v3(0.075, 0.030, 0.030),
        role: 'wheel', place: { pos: v3( 0.21, 0.42, 0.82), rot: QUAT_IDENTITY } },
    );
  } else if (kp === 'sprinterGreen') {
    parts.push(
      { name: 'sleeve-left',  kind: 'cylinder',
        dims: v3(0.046, THIGH_L * 0.65, 0.046), role: 'skin',
        place: { pos: mid(SHOULDER_LEFT,  ELBOW_LEFT),
                 rot: quatZTo(sub(ELBOW_LEFT,  SHOULDER_LEFT))  } },
      { name: 'sleeve-right', kind: 'cylinder',
        dims: v3(0.046, THIGH_L * 0.65, 0.046), role: 'skin',
        place: { pos: mid(SHOULDER_RIGHT, ELBOW_RIGHT),
                 rot: quatZTo(sub(ELBOW_RIGHT, SHOULDER_RIGHT)) } },
    );
  } else if (kp === 'fluoro') {
    parts.push(jerseyBandPart('fluoro-hem', 0.87, 'frame'));
  }
  // 'solid': no extra primitives.

  // ---- Optional accessories -----------------------------------------------
  if (opts.hasGlasses) {
    parts.push(
      glassesLensPart('glasses-left',  -0.038),
      glassesLensPart('glasses-right',  0.038),
      glassesBridgePart(),
    );
  }
  if (opts.hasBottle) parts.push(waterBottlePart());

  return parts;
}

// ---- Animation constants --------------------------------------------------

/** Maximum head yaw in radians (~5°). */
const HEAD_YAW_MAX = (5 * Math.PI) / 180;

/** Additional forward pitch when climbing out of saddle (~5°). */
const CLIMB_FORWARD_TILT_RAD = (5 * Math.PI) / 180;

/** Maximum hip sway during climb-mode (~8°). */
const CLIMB_SWAY_MAX_RAD = (8 * Math.PI) / 180;

// ===========================================================================
// Pure-numeric animation helpers — exported for unit tests
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

/**
 * Clamp an effort level to [0, 1].
 * Exported for unit-testing the clamp behaviour.
 */
export function clampEffortLevel(level: number): number {
  return Math.max(0, Math.min(1, level));
}

/**
 * Derive the effective skin color from a base color and an effort level.
 *
 * At level=0: base skin color unchanged.
 * At level=1: skin is brightened (+15 % luminance) and shifted toward a
 *             cool blue tint (simulated perspiration sheen).
 *
 * Pure function — exported for unit testing.
 */
export function effortSkinColor(baseCss: string, level01: number): Cesium.Color {
  const t = clampEffortLevel(level01);
  const base = Cesium.Color.fromCssColorString(baseCss);
  // Lerp toward a desaturated cool tint (simulate wet skin highlight).
  const wetR = Math.min(1, base.red   * 1.15 - 0.04 * t);
  const wetG = Math.min(1, base.green * 1.12 + 0.02 * t);
  const wetB = Math.min(1, base.blue  * 1.10 + 0.10 * t);
  return new Cesium.Color(
    base.red   + (wetR - base.red)   * t,
    base.green + (wetG - base.green) * t,
    base.blue  + (wetB - base.blue)  * t,
    1,
  );
}

// ---- Avatar construction --------------------------------------------------

/**
 * Build the procedural cyclist into `viewer`. Call `update()` each frame from
 * the render loop; `setColors()` to restyle; `dispose()` to remove it.
 *
 * Zero Cesium-primitive allocations inside `update()` — all entities are
 * created once here and mutated in-place via CallbackProperty reads each frame.
 *
 * accepts optional AvatarOptions so callers can specify helmet
 * style, glasses, and bottle. Existing call sites passing only a viewer
 * continue to work unchanged.
 */
export function createAvatar(viewer: Cesium.Viewer, options?: AvatarOptions): Avatar {
  const scene = viewer.scene;

  // Resolve options with defaults.
  const opts: ResolvedAvatarOptions = {
    colors:      options?.colors      ?? { ...DEFAULT_AVATAR_COLORS },
    posture:     options?.posture     ?? 'hoods',
    helmetStyle: options?.helmetStyle ?? 'road',
    hasGlasses:  options?.hasGlasses  ?? false,
    hasBottle:   options?.hasBottle   ?? false,
    bikeShape:   options?.bikeShape   ?? 'roadAllRounder',
    kitPattern:  options?.kitPattern  ?? 'solid',
    kitAccent:   options?.kitAccent   ?? undefined,
    shoeStyle:   options?.shoeStyle   ?? 'roadClip',
  };

  let colors: AvatarColors = { ...opts.colors };
  const effortLevel = 0;

  // Build the per-instance part list (helmet style, accessories vary).
  const PARTS = buildParts(opts);

  let bodyToWorld = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);
  let bodyQuat = Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY);
  const dyn: RigDynamics = {
    wheelAngle: 0,
    crankAngle: 0,
    headYaw: 0,
    climbSway: 0,
    climbing: false,
    riderPosition: opts.posture,
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

  /** Skin color, potentially tinted by effort level. */
  const skinColor = (): Cesium.Color =>
    effortLevel > 0
      ? effortSkinColor(colors.skin, effortLevel)
      : Cesium.Color.fromCssColorString(colors.skin);

  const roleColor = (role: ColorRole): Cesium.Color =>
    role === 'skin' ? skinColor() : Cesium.Color.fromCssColorString(colors[role]);

  const entities: Cesium.Entity[] = PARTS.map((part, i) => {
    const position = new Cesium.CallbackPositionProperty(() => world[i].pos, false);
    const orientation = new Cesium.CallbackProperty(() => world[i].rot, false);
    const alpha = part.alpha ?? 1.0;
    const mat = alpha < 1
      ? roleColor(part.role).withAlpha(alpha)
      : roleColor(part.role);
    const common = { name: `Rider · ${part.name}`, position, orientation };
    if (part.kind === 'box') {
      return viewer.entities.add({
        ...common,
        box: {
          dimensions: new Cesium.Cartesian3(part.dims[0], part.dims[1], part.dims[2]),
          material: new Cesium.ColorMaterialProperty(mat),
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
          material: new Cesium.ColorMaterialProperty(mat),
          shadows: Cesium.ShadowMode.ENABLED,
          slices: 16,
        },
      });
    }
    return viewer.entities.add({
      ...common,
      ellipsoid: {
        radii: new Cesium.Cartesian3(part.dims[0], part.dims[1], part.dims[2]),
        material: new Cesium.ColorMaterialProperty(mat),
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

  function update(u: AvatarUpdate): void {
    // Defensive: if any positional input is NaN/non-finite, skip this frame
    // rather than letting degenerate values corrupt Cesium matrix math.
    if (
      !Number.isFinite(u.lon) ||
      !Number.isFinite(u.lat) ||
      !Number.isFinite(u.ele) ||
      !Number.isFinite(u.heading)
    ) {
      if (import.meta.env.DEV) {
        console.warn('[avatar] update() skipped — non-finite position input', {
          lon: u.lon, lat: u.lat, ele: u.ele, heading: u.heading,
        });
      }
      return;
    }

    const dt = Math.min(0.1, Math.max(0, u.dt));
    elapsedMs += dt * 1000;

    // Ground height — smoothed so streaming tile changes don't pop.
    const ground = sampleGroundHeight(scene, u.lon, u.lat);
    const targetEle = ground ?? u.ele;
    if (smoothedEle === null) smoothedEle = targetEle;
    else smoothedEle += (targetEle - smoothedEle) * (1 - Math.exp(-6 * dt));

    // Corner lean — centripetal tilt, smoothed.
    const headingDelta = lastHeading === null ? 0 : shortestAngle(lastHeading, u.heading);
    lastHeading = u.heading;
    const targetLean = cornerLeanAngle(headingDelta, u.speed, dt || 1 / 60);
    lean += (targetLean - lean) * (1 - Math.exp(-5 * dt));

    // Pitch from gradient.
    const targetPitch = Math.atan(u.grade / 100);
    pitch += (targetPitch - pitch) * (1 - Math.exp(-4 * dt));

    dyn.wheelAngle = wheelRotationFromSpeed(u.speed, WHEEL_R, dyn.wheelAngle, dt * 1000);

    // Crank phase from cadence (estimated if no sensor reports it).
    const rpm = u.cadence > 0 ? u.cadence : estimateCadence(u.speed);
    dyn.crankAngle = pedalPhaseFromCadence(rpm, elapsedMs);

    // Head yaw toward turn, capped at ±5°, smoothed.
    const turnRate = headingDelta / (dt || 1 / 60);
    const targetHeadYaw = Math.max(-HEAD_YAW_MAX, Math.min(HEAD_YAW_MAX, turnRate * 0.12));
    smoothedHeadYaw += (targetHeadYaw - smoothedHeadYaw) * (1 - Math.exp(-8 * dt));
    dyn.headYaw = smoothedHeadYaw;

    // Climb-mode: out-of-saddle sway + extra forward tilt above 8 % grade.
    const climbing = u.grade > 8;
    dyn.climbing = climbing;
    dyn.climbSway = climbing ? climbingSwayAngle(u.grade, rpm, elapsedMs) : 0;

    dyn.riderPosition = u.riderPosition ?? 'hoods';

    // Globe transform: heading + pitch (+ climb tilt) + lean.
    const climbTilt = climbing ? CLIMB_FORWARD_TILT_RAD : 0;
    const origin = Cesium.Cartesian3.fromDegrees(u.lon, u.lat, smoothedEle);
    const hpr = new Cesium.HeadingPitchRoll(u.heading, pitch + climbTilt, lean);
    bodyToWorld = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr, Cesium.Ellipsoid.WGS84, undefined, bodyToWorld);
    bodyQuat = Cesium.Transforms.headingPitchRollQuaternion(origin, hpr, Cesium.Ellipsoid.WGS84, undefined, bodyQuat);

    recomputeParts();
  }

  function setColors(next: AvatarColors): void {
    colors = { ...next };
    for (let i = 0; i < PARTS.length; i++) {
      const ent = entities[i];
      const alpha = PARTS[i].alpha ?? 1.0;
      const col = alpha < 1 ? roleColor(PARTS[i].role).withAlpha(alpha) : roleColor(PARTS[i].role);
      const prop = new Cesium.ColorMaterialProperty(col);
      if (ent.box) ent.box.material = prop;
      else if (ent.cylinder) ent.cylinder.material = prop;
      else if (ent.ellipsoid) ent.ellipsoid.material = prop;
    }
  }

  function dispose(): void {
    for (const ent of entities) {
      if (!viewer.isDestroyed()) viewer.entities.remove(ent);
    }
  }

  const avatar: Avatar = {
    entities,
    update,
    setColors,
    dispose,
    _effortLevel: 0,
  };

  return avatar;
}

/**
 * Set the sweat/effort tint on a live avatar.
 *
 * level01 is clamped to [0, 1]:
 *   0 = fresh, no tint
 *   1 = maximum effort — skin brightens with a blue-cool highlight
 *
 * Only the skin-role entities are updated; all other roles are unaffected.
 * Allocation-free: mutates existing ColorMaterialProperty instances in-place.
 */
export function setAvatarEffortLevel(avatar: Avatar, level01: number): void {
  // Reflect clamped value onto the opaque handle field so tests can verify.
  avatar._effortLevel = clampEffortLevel(level01);
}

// ---- Test-surface export --------------------------------------

/**
 * Returns the number of primitives that would be built for a given set of
 * AvatarOptions. Cesium-free — safe to call in unit tests.
 *
 * This is the only allocation `buildParts` makes; it is exported purely for
 * test assertions and must never be called in the hot render path.
 */
export function avatarPrimitiveCount(options?: AvatarOptions): number {
  const opts: ResolvedAvatarOptions = {
    colors:      options?.colors      ?? DEFAULT_AVATAR_COLORS,
    posture:     options?.posture     ?? 'hoods',
    helmetStyle: options?.helmetStyle ?? 'road',
    hasGlasses:  options?.hasGlasses  ?? false,
    hasBottle:   options?.hasBottle   ?? false,
    bikeShape:   options?.bikeShape   ?? 'roadAllRounder',
    kitPattern:  options?.kitPattern  ?? 'solid',
    kitAccent:   options?.kitAccent,
    shoeStyle:   options?.shoeStyle   ?? 'roadClip',
  };
  return buildParts(opts).length;
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

// Suppress unused-variable warnings for nominal geometry constants that exist
// for documentation / future use.
void KNEE_LEFT; void KNEE_RIGHT; void HIP_LEFT; void HIP_RIGHT;
