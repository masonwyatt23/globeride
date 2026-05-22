import * as Cesium from 'cesium';
import { sampleGroundHeight } from '@/lib/cesiumUtils';
import { type AvatarColors, DEFAULT_AVATAR_COLORS } from '@/lib/avatarConfig';

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
 * Animation: wheels spin with speed, cranks + legs pedal with cadence, the
 * body leans with turn rate. All driven from `update()` once per frame.
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
  /** Grade in percent — drives body pitch. */
  grade: number;
  /** Seconds since the previous update — integrates the animation. */
  dt: number;
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

/** Rotation about the body +X axis (the wheel axle / pedalling plane normal). */
function quatRotX(angle: number): Cesium.Quaternion {
  return Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X, angle, new Cesium.Quaternion());
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
}

/** Per-frame animation state shared by the dynamic parts. */
interface RigDynamics {
  wheelAngle: number;
  crankAngle: number;
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

const PARTS: PartSpec[] = [
  // --- wheels ---
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
  spokePart('spoke-rear', REAR_HUB),
  spokePart('spoke-front', FRONT_HUB),
  // --- frame ---
  tube('down-tube', BB, HEAD_TOP, 0.035, 'frame'),
  tube('seat-tube', BB, SADDLE_J, 0.032, 'frame'),
  tube('top-tube', SADDLE_J, HEAD_TOP, 0.03, 'frame'),
  tube('chain-stay', REAR_HUB, BB, 0.025, 'frame'),
  tube('seat-stay', REAR_HUB, SADDLE_J, 0.022, 'frame'),
  tube('fork', HEAD_TOP, FRONT_HUB, 0.028, 'frame'),
  tube('steerer', HEAD_TOP, BAR, 0.026, 'frame'),
  {
    name: 'handlebar',
    kind: 'box',
    dims: v3(0.42, 0.07, 0.05),
    role: 'frame',
    place: { pos: BAR, rot: QUAT_IDENTITY },
  },
  {
    name: 'saddle',
    kind: 'box',
    dims: v3(0.12, 0.26, 0.06),
    role: 'frame',
    place: { pos: SADDLE, rot: QUAT_IDENTITY },
  },
  crankPart('crank-left', -1),
  crankPart('crank-right', 1),
  // --- rider ---
  {
    name: 'hips',
    kind: 'box',
    dims: v3(0.32, 0.22, 0.2),
    role: 'kit',
    place: { pos: v3(0, -0.06, 0.82), rot: QUAT_IDENTITY },
  },
  tube('torso', v3(0, -0.08, 0.86), v3(0, 0.2, 1.12), 0.13, 'kit'),
  {
    name: 'head',
    kind: 'ellipsoid',
    dims: v3(0.1, 0.12, 0.13),
    role: 'skin',
    place: { pos: v3(0, 0.3, 1.19), rot: QUAT_IDENTITY },
  },
  {
    name: 'helmet',
    kind: 'ellipsoid',
    dims: v3(0.12, 0.15, 0.1),
    role: 'helmet',
    place: { pos: v3(0, 0.29, 1.25), rot: QUAT_IDENTITY },
  },
  tube('arm-left', v3(-0.15, 0.2, 1.1), v3(-0.2, 0.46, 0.9), 0.05, 'kit'),
  tube('arm-right', v3(0.15, 0.2, 1.1), v3(0.2, 0.46, 0.9), 0.05, 'kit'),
  legPart('thigh-left', -1, 'thigh'),
  legPart('thigh-right', 1, 'thigh'),
  legPart('shin-left', -1, 'shin'),
  legPart('shin-right', 1, 'shin'),
  {
    name: 'shoe-left',
    kind: 'box',
    dims: v3(0.09, 0.22, 0.07),
    role: 'accent',
    place: (d) => ({ pos: pedalPos(-1, d.crankAngle), rot: QUAT_IDENTITY }),
  },
  {
    name: 'shoe-right',
    kind: 'box',
    dims: v3(0.09, 0.22, 0.07),
    role: 'accent',
    place: (d) => ({ pos: pedalPos(1, d.crankAngle), rot: QUAT_IDENTITY }),
  },
];

// ---- Avatar construction --------------------------------------------------

/**
 * Build the procedural cyclist into `viewer`. Call `update()` each frame from
 * the render loop; `setColors()` to restyle; `dispose()` to remove it.
 */
export function createAvatar(viewer: Cesium.Viewer): Avatar {
  const scene = viewer.scene;
  let colors: AvatarColors = { ...DEFAULT_AVATAR_COLORS };

  // Shared, mutated each frame; the CallbackProperties below read from it.
  let bodyToWorld = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);
  let bodyQuat = Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY);
  const dyn: RigDynamics = { wheelAngle: 0, crankAngle: 0 };

  // Per-part computed world transform, recomputed each update().
  const world: { pos: Cesium.Cartesian3; rot: Cesium.Quaternion }[] = PARTS.map(() => ({
    pos: new Cesium.Cartesian3(),
    rot: new Cesium.Quaternion(),
  }));

  // Smoothed ground height + lean so the rig doesn't pop or snap.
  let smoothedEle: number | null = null;
  let lean = 0;
  let pitch = 0;
  let lastHeading: number | null = null;

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
      // Body-local position → world.
      Cesium.Matrix4.multiplyByPoint(
        bodyToWorld,
        new Cesium.Cartesian3(local.pos[0], local.pos[1], local.pos[2]),
        world[i].pos,
      );
      // Body-local orientation → world.
      Cesium.Quaternion.multiply(bodyQuat, local.rot, world[i].rot);
    }
  }

  function update(u: AvatarUpdate): void {
    const dt = Math.min(0.1, Math.max(0, u.dt));

    // Sit the rig on whatever surface is rendered (photoreal mesh / terrain),
    // smoothing so streaming tiles don't make it jump.
    const ground = sampleGroundHeight(scene, u.lon, u.lat);
    const targetEle = ground ?? u.ele;
    if (smoothedEle === null) smoothedEle = targetEle;
    else smoothedEle += (targetEle - smoothedEle) * (1 - Math.exp(-6 * dt));

    // Lean into corners from the turn rate; pitch with the gradient.
    const turnRate = lastHeading === null ? 0 : shortestAngle(lastHeading, u.heading) / (dt || 1 / 60);
    lastHeading = u.heading;
    const targetLean = Math.max(-0.45, Math.min(0.45, -turnRate * 0.35));
    lean += (targetLean - lean) * (1 - Math.exp(-5 * dt));
    const targetPitch = Math.atan(u.grade / 100);
    pitch += (targetPitch - pitch) * (1 - Math.exp(-4 * dt));

    // Wheels spin with ground speed; cranks pedal with cadence (estimated
    // from speed when no cadence sensor / trainer value is available).
    dyn.wheelAngle += (u.speed / WHEEL_R) * dt;
    const rpm = u.cadence > 0 ? u.cadence : estimateCadence(u.speed);
    dyn.crankAngle += ((rpm * 2 * Math.PI) / 60) * dt;

    // Body transform: place the rig on the globe, oriented by heading, pitched
    // by the gradient, rolled into the corner.
    const origin = Cesium.Cartesian3.fromDegrees(u.lon, u.lat, smoothedEle);
    const hpr = new Cesium.HeadingPitchRoll(u.heading, pitch, lean);
    bodyToWorld = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr, Cesium.Ellipsoid.WGS84, undefined, bodyToWorld);
    bodyQuat = Cesium.Transforms.headingPitchRollQuaternion(origin, hpr, Cesium.Ellipsoid.WGS84, undefined, bodyQuat);

    recomputeParts();
  }

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

/** Shortest signed angular delta a→b, radians, in (-π, π]. */
function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Plausible cadence from speed when no sensor reports it (≈70 GI gearing). */
function estimateCadence(speedMs: number): number {
  if (speedMs < 0.5) return 0;
  // ~7.4 m per pedal revolution at a moderate gear; clamp to a human range.
  return Math.max(55, Math.min(105, (speedMs / 7.4) * 60));
}
