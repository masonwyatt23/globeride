/**
 * GlobeRide — glTF 2.0 cyclist avatar generator
 *
 * Produces binary .glb files for road, gravel, and TT variants.
 * Run with:  node --loader ts-node/esm scripts/gen-avatar-gltf.ts
 *         or npx vite-node scripts/gen-avatar-gltf.ts
 *
 * Output:
 *   public/models/cyclist-road.glb
 *   public/models/cyclist-gravel.glb
 *   public/models/cyclist-tt.glb
 *
 * CONTRACT (matches public/models/CONTRACT.md):
 *   Named nodes: wheelFront, wheelRear, crank, thighL, shinL, thighR, shinR
 *   Named materials: frame, wheel, kit, skin, helmet, accent
 *   Units: meters  Up: +Y  Forward: +X  Origin: ground-contact midpoint
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Vec2 {
  u: number;
  v: number;
}

interface Vertex {
  pos: Vec3;
  nor: Vec3;
  uv: Vec2;
}

interface Mesh {
  vertices: Vertex[];
  indices: number[];
  materialIndex: number;
}

interface GltfNode {
  name: string;
  meshIndex?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number]; // xyzw
  scale?: [number, number, number];
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function addV(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function subV(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scaleV(a: Vec3, s: number): Vec3 {
  return vec3(a.x * s, a.y * s, a.z * s);
}

function normalizeV(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-8) return vec3(0, 1, 0);
  return vec3(v.x / len, v.y / len, v.z / len);
}

function crossV(a: Vec3, b: Vec3): Vec3 {
  return vec3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
}

function quatFromAxisAngle(axis: Vec3, angle: number): [number, number, number, number] {
  const a = normalizeV(axis);
  const s = Math.sin(angle / 2);
  return [a.x * s, a.y * s, a.z * s, Math.cos(angle / 2)];
}

// ---------------------------------------------------------------------------
// Primitive geometry builders
// All produce flat arrays of vertices + indices, ready to merge into a Mesh.
// ---------------------------------------------------------------------------

/** Torus (ring) in the XZ plane, centred at origin. Used for wheels/tires. */
function buildTorus(
  ringRadius: number,
  tubeRadius: number,
  ringSegs: number,
  tubeSegs: number
): { verts: Vertex[]; idxs: number[] } {
  const verts: Vertex[] = [];
  const idxs: number[] = [];

  for (let i = 0; i <= ringSegs; i++) {
    const phi = (i / ringSegs) * Math.PI * 2;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    for (let j = 0; j <= tubeSegs; j++) {
      const theta = (j / tubeSegs) * Math.PI * 2;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      // Centre of tube cross-section
      const cx = cosPhi * ringRadius;
      const cz = sinPhi * ringRadius;

      // Surface point
      const px = cosPhi * (ringRadius + tubeRadius * cosTheta);
      const py = tubeRadius * sinTheta;
      const pz = sinPhi * (ringRadius + tubeRadius * cosTheta);

      // Normal = direction from tube centre to surface point
      const nx = px - cx;
      const ny = py;
      const nz = pz - cz;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);

      verts.push({
        pos: vec3(px, py, pz),
        nor: vec3(nx / nl, ny / nl, nz / nl),
        uv: { u: i / ringSegs, v: j / tubeSegs },
      });
    }
  }

  for (let i = 0; i < ringSegs; i++) {
    for (let j = 0; j < tubeSegs; j++) {
      const a = i * (tubeSegs + 1) + j;
      const b = (i + 1) * (tubeSegs + 1) + j;
      const c = (i + 1) * (tubeSegs + 1) + j + 1;
      const d = i * (tubeSegs + 1) + j + 1;
      idxs.push(a, b, c, a, c, d);
    }
  }

  return { verts, idxs };
}

/** Flat disc (filled circle) in the XZ plane. Used for wheel spokes/hub face. */
function buildDisc(
  radius: number,
  segments: number,
  normalUp: boolean
): { verts: Vertex[]; idxs: number[] } {
  const verts: Vertex[] = [];
  const idxs: number[] = [];
  const ny = normalUp ? 1 : -1;

  // Centre
  verts.push({ pos: vec3(0, 0, 0), nor: vec3(0, ny, 0), uv: { u: 0.5, v: 0.5 } });

  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const cx = Math.cos(a) * radius;
    const cz = Math.sin(a) * radius;
    verts.push({
      pos: vec3(cx, 0, cz),
      nor: vec3(0, ny, 0),
      uv: { u: 0.5 + Math.cos(a) * 0.5, v: 0.5 + Math.sin(a) * 0.5 },
    });
  }

  if (normalUp) {
    for (let i = 1; i <= segments; i++) {
      idxs.push(0, i, i + 1);
    }
  } else {
    for (let i = 1; i <= segments; i++) {
      idxs.push(0, i + 1, i);
    }
  }

  return { verts, idxs };
}

/** Smooth cylinder (open ends) along Y axis. */
function buildCylinder(
  radiusBottom: number,
  radiusTop: number,
  height: number,
  segments: number,
  withCaps: boolean
): { verts: Vertex[]; idxs: number[] } {
  const verts: Vertex[] = [];
  const idxs: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    // Slope normal (for tapered cylinders)
    const dr = radiusBottom - radiusTop;
    const sl = Math.sqrt(dr * dr + height * height);
    const nSlope = height / sl;
    const nR = dr / sl;

    // Bottom ring
    verts.push({
      pos: vec3(cosA * radiusBottom, 0, sinA * radiusBottom),
      nor: vec3(cosA * nSlope, nR, sinA * nSlope),
      uv: { u: i / segments, v: 0 },
    });
    // Top ring
    verts.push({
      pos: vec3(cosA * radiusTop, height, sinA * radiusTop),
      nor: vec3(cosA * nSlope, nR, sinA * nSlope),
      uv: { u: i / segments, v: 1 },
    });
  }

  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    const t = i * 2 + 1;
    const bn = (i + 1) * 2;
    const tn = (i + 1) * 2 + 1;
    idxs.push(b, bn, t, bn, tn, t);
  }

  if (withCaps) {
    // Bottom cap
    const botBase = verts.length;
    verts.push({ pos: vec3(0, 0, 0), nor: vec3(0, -1, 0), uv: { u: 0.5, v: 0.5 } });
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      verts.push({
        pos: vec3(Math.cos(a) * radiusBottom, 0, Math.sin(a) * radiusBottom),
        nor: vec3(0, -1, 0),
        uv: { u: 0.5 + Math.cos(a) * 0.5, v: 0.5 + Math.sin(a) * 0.5 },
      });
    }
    for (let i = 1; i <= segments; i++) {
      idxs.push(botBase, botBase + i + 1, botBase + i);
    }

    // Top cap
    const topBase = verts.length;
    verts.push({ pos: vec3(0, height, 0), nor: vec3(0, 1, 0), uv: { u: 0.5, v: 0.5 } });
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      verts.push({
        pos: vec3(Math.cos(a) * radiusTop, height, Math.sin(a) * radiusTop),
        nor: vec3(0, 1, 0),
        uv: { u: 0.5 + Math.cos(a) * 0.5, v: 0.5 + Math.sin(a) * 0.5 },
      });
    }
    for (let i = 1; i <= segments; i++) {
      idxs.push(topBase, topBase + i, topBase + i + 1);
    }
  }

  return { verts, idxs };
}

/** Sphere (UV sphere) — used for head and joints. */
function buildSphere(
  radius: number,
  widthSegs: number,
  heightSegs: number
): { verts: Vertex[]; idxs: number[] } {
  const verts: Vertex[] = [];
  const idxs: number[] = [];

  for (let j = 0; j <= heightSegs; j++) {
    const phi = (j / heightSegs) * Math.PI; // 0..PI
    for (let i = 0; i <= widthSegs; i++) {
      const theta = (i / widthSegs) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      verts.push({
        pos: vec3(x * radius, y * radius, z * radius),
        nor: vec3(x, y, z),
        uv: { u: i / widthSegs, v: j / heightSegs },
      });
    }
  }

  for (let j = 0; j < heightSegs; j++) {
    for (let i = 0; i < widthSegs; i++) {
      const a = j * (widthSegs + 1) + i;
      const b = a + widthSegs + 1;
      idxs.push(a, b, a + 1);
      idxs.push(b, b + 1, a + 1);
    }
  }

  return { verts, idxs };
}

/** Rounded box — sphere-subdivided box, used for torso / helmet. */
function buildRoundedBox(
  w: number,
  h: number,
  d: number,
  cornerR: number,
  segs: number
): { verts: Vertex[]; idxs: number[] } {
  // Build a UV sphere and scale/clamp to produce a rounded box shape.
  const { verts: sv, idxs } = buildSphere(1, segs * 2, segs);

  const verts: Vertex[] = sv.map((v) => {
    // Push each axis toward ±(halfExtent - cornerR) then clamp
    const hW = w / 2 - cornerR;
    const hH = h / 2 - cornerR;
    const hD = d / 2 - cornerR;

    const bx = Math.max(-hW, Math.min(hW, v.pos.x * w));
    const by = Math.max(-hH, Math.min(hH, v.pos.y * h));
    const bz = Math.max(-hD, Math.min(hD, v.pos.z * d));

    // Offset = corner sphere contribution
    const dx = v.pos.x * cornerR;
    const dy = v.pos.y * cornerR;
    const dz = v.pos.z * cornerR;

    const px = bx + dx;
    const py = by + dy;
    const pz = bz + dz;

    // Normal = outward from box core
    const nx = px - bx;
    const ny = py - by;
    const nz = pz - bz;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

    return {
      pos: vec3(px, py, pz),
      nor: vec3(nx / nl, ny / nl, nz / nl),
      uv: v.uv,
    };
  });

  return { verts, idxs };
}

/**
 * Swept tube along a polyline of Vec3 control points.
 * Produces a smooth swept cylinder — used for tubes (frame tubes, arms, legs).
 */
function buildSweptTube(
  points: Vec3[],
  radius: number,
  segments: number,
  radialSegs: number
): { verts: Vertex[]; idxs: number[] } {
  if (points.length < 2) return { verts: [], idxs: [] };

  const verts: Vertex[] = [];
  const idxs: number[] = [];

  // Build a "frame" at each point (tangent, normal, binormal)
  const frames: { t: Vec3; n: Vec3; b: Vec3 }[] = [];
  for (let i = 0; i < points.length; i++) {
    let t: Vec3;
    if (i === 0) {
      t = normalizeV(subV(points[1], points[0]));
    } else if (i === points.length - 1) {
      t = normalizeV(subV(points[i], points[i - 1]));
    } else {
      t = normalizeV(subV(points[i + 1], points[i - 1]));
    }
    // Pick an up vector not parallel to t
    const up = Math.abs(t.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
    const b = normalizeV(crossV(t, up));
    const n = normalizeV(crossV(b, t));
    frames.push({ t, n, b });
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const fr = frames[i];
    const t = i / (points.length - 1);

    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      const nx = fr.n.x * cosA + fr.b.x * sinA;
      const ny = fr.n.y * cosA + fr.b.y * sinA;
      const nz = fr.n.z * cosA + fr.b.z * sinA;

      verts.push({
        pos: vec3(p.x + nx * radius, p.y + ny * radius, p.z + nz * radius),
        nor: vec3(nx, ny, nz),
        uv: { u: j / radialSegs, v: t },
      });
    }
  }

  const cols = radialSegs + 1;
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = (i + 1) * cols + j + 1;
      const d = i * cols + j + 1;
      idxs.push(a, b, c, a, c, d);
    }
  }

  return { verts, idxs };
}

// ---------------------------------------------------------------------------
// Mesh assembly helpers
// ---------------------------------------------------------------------------

function offsetIndices(idxs: number[], offset: number): number[] {
  return idxs.map((i) => i + offset);
}

function mergeMesh(materialIndex: number, ...parts: { verts: Vertex[]; idxs: number[] }[]): Mesh {
  const vertices: Vertex[] = [];
  const indices: number[] = [];
  for (const p of parts) {
    const off = vertices.length;
    vertices.push(...p.verts);
    indices.push(...offsetIndices(p.idxs, off));
  }
  return { vertices, indices, materialIndex };
}

function translateMesh(mesh: Mesh, offset: Vec3): Mesh {
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => ({ ...v, pos: addV(v.pos, offset) })),
  };
}

function rotateMeshX(mesh: Mesh, angle: number): Mesh {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => ({
      ...v,
      pos: vec3(v.pos.x, v.pos.y * c - v.pos.z * s, v.pos.y * s + v.pos.z * c),
      nor: vec3(v.nor.x, v.nor.y * c - v.nor.z * s, v.nor.y * s + v.nor.z * c),
    })),
  };
}

function rotateMeshZ(mesh: Mesh, angle: number): Mesh {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => ({
      ...v,
      pos: vec3(v.pos.x * c - v.pos.y * s, v.pos.x * s + v.pos.y * c, v.pos.z),
      nor: vec3(v.nor.x * c - v.nor.y * s, v.nor.x * s + v.nor.y * c, v.nor.z),
    })),
  };
}

function scaleMeshY(mesh: Mesh, sy: number): Mesh {
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => ({
      ...v,
      pos: vec3(v.pos.x, v.pos.y * sy, v.pos.z),
      nor: vec3(v.nor.x, v.nor.y, v.nor.z), // normals unaffected for uniform-ish scale
    })),
  };
}

// Mirror mesh in Z (for left→right)
function mirrorMeshZ(mesh: Mesh): Mesh {
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => ({
      ...v,
      pos: vec3(v.pos.x, v.pos.y, -v.pos.z),
      nor: vec3(v.nor.x, v.nor.y, -v.nor.z),
    })),
    indices: [...mesh.indices].reverse(), // flip winding
  };
}

// ---------------------------------------------------------------------------
// Material index constants
// ---------------------------------------------------------------------------
const MAT_FRAME = 0;
const MAT_WHEEL = 1;
const MAT_KIT = 2;
const MAT_SKIN = 3;
const MAT_HELMET = 4;
const MAT_ACCENT = 5;

// ---------------------------------------------------------------------------
// Bike + rider geometry
// ---------------------------------------------------------------------------

interface BikeVariant {
  name: string;
  // Frame geometry tweaks
  topTubeAngle: number;   // slight slope of top tube
  seatTubeAngle: number;  // seat tube lean (rad from vertical, positive = forward)
  headTubeAngle: number;  // head tube angle (rad from vertical)
  bbDrop: number;         // bottom bracket drop from wheel axle height
  headTubeLen: number;    // head tube height
  reach: number;          // horizontal distance BB→head tube top
  stack: number;          // vertical distance BB→head tube top
  forkOffset: number;     // fork rake
  riderReach: number;     // how far forward rider leans (0=upright,1=TT)
  barHeight: number;      // handlebar height relative to saddle
  barType: "drop" | "flat" | "tt"; // handlebar shape
}

const VARIANTS: BikeVariant[] = [
  {
    name: "road",
    topTubeAngle: 0.04,
    seatTubeAngle: 0.13,
    headTubeAngle: 0.11,
    bbDrop: 0.07,
    headTubeLen: 0.13,
    reach: 0.39,
    stack: 0.54,
    forkOffset: 0.045,
    riderReach: 0.55,
    barHeight: -0.04,
    barType: "drop",
  },
  {
    name: "gravel",
    topTubeAngle: 0.03,
    seatTubeAngle: 0.14,
    headTubeAngle: 0.10,
    bbDrop: 0.05,
    headTubeLen: 0.15,
    reach: 0.37,
    stack: 0.56,
    forkOffset: 0.05,
    riderReach: 0.45,
    barHeight: -0.02,
    barType: "flat",
  },
  {
    name: "tt",
    topTubeAngle: 0.0,
    seatTubeAngle: 0.20,
    headTubeAngle: 0.08,
    bbDrop: 0.065,
    headTubeLen: 0.09,
    reach: 0.44,
    stack: 0.50,
    forkOffset: 0.04,
    riderReach: 0.85,
    barHeight: 0.02,
    barType: "tt",
  },
];

// Shared bike proportions
const WHEEL_RADIUS = 0.34;
const WHEEL_TUBE_R = 0.022;
const WHEELBASE = 1.00;
const SPOKE_R = 0.004;
const TUBE_R = 0.015;   // main frame tube radius
const TUBE_R_SM = 0.011; // chainstay/seatstay tube radius

// Rider proportions (m)
const RIDER_HEIGHT = 1.75;
const TORSO_H = 0.52;
const TORSO_W = 0.22;
const TORSO_D = 0.14;
const UPPER_ARM_L = 0.31;
const LOWER_ARM_L = 0.27;
const ARM_R = 0.036;
const THIGH_L = 0.44;
const SHIN_L = 0.40;
const LEG_R = 0.044;
const HEAD_R = 0.115;
const NECK_R = 0.047;
const NECK_H = 0.08;
const FOOT_L = 0.23;
const FOOT_H = 0.06;

// ---------------------------------------------------------------------------
// Wheel builder — wheel mesh centred at origin, in XZ plane
// (integration agent rotates around Y to spin)
// ---------------------------------------------------------------------------
function buildWheel(): Mesh[] {
  const torus = buildTorus(WHEEL_RADIUS, WHEEL_TUBE_R, 36, 12);

  // Hub cylinder
  const hub = buildCylinder(0.028, 0.028, 0.052, 12, true);
  const hubT = translateMesh(
    { vertices: hub.verts, indices: hub.idxs, materialIndex: MAT_WHEEL },
    vec3(0, -0.026, 0)
  );

  // Spokes — 16 spokes radiating from hub to rim
  const spokeParts: { verts: Vertex[]; idxs: number[] }[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rimX = Math.cos(a) * WHEEL_RADIUS;
    const rimZ = Math.sin(a) * WHEEL_RADIUS;
    const spoke = buildSweptTube(
      [vec3(0, 0, 0), vec3(rimX, 0, rimZ)],
      SPOKE_R,
      1,
      6
    );
    spokeParts.push(spoke);
  }
  const spokeMesh = mergeMesh(MAT_WHEEL, ...spokeParts);

  const rimMesh: Mesh = {
    vertices: torus.verts,
    indices: torus.idxs,
    materialIndex: MAT_WHEEL,
  };

  return [rimMesh, spokeMesh, hubT];
}

// ---------------------------------------------------------------------------
// Frame builder — returns an array of Meshes with correct material indices
// Origin: bottom bracket centre
// ---------------------------------------------------------------------------
function buildFrame(v: BikeVariant): Mesh[] {
  const meshes: Mesh[] = [];

  // Key geometry points (all in XZ plane of frame, Z=0)
  // BB = origin (0,0,0)
  const bb = vec3(0, 0, 0);

  // Wheel axle positions
  const rearAxle = vec3(-WHEELBASE / 2, WHEEL_RADIUS - v.bbDrop, 0);
  const frontAxle = vec3(WHEELBASE / 2, WHEEL_RADIUS - v.bbDrop, 0);

  // Seat tube top (going up + slightly back from BB)
  const seatTubeTop = vec3(
    -Math.sin(v.seatTubeAngle) * 0.58,
    Math.cos(v.seatTubeAngle) * 0.58,
    0
  );

  // Head tube bottom and top
  // Head tube is at X = frontAxle.x - (reach compensation)
  const htBottomX = frontAxle.x - v.reach;
  const htBottomY = rearAxle.y + v.bbDrop + (v.stack - v.headTubeLen);
  const htTopY = htBottomY + v.headTubeLen;
  const htAngleX = -Math.sin(v.headTubeAngle) * v.headTubeLen;
  const headTubeBot = vec3(htBottomX, htBottomY, 0);
  const headTubeTop = vec3(htBottomX + htAngleX, htTopY, 0);

  // Down tube: BB → head tube bottom
  const dt = buildSweptTube([bb, headTubeBot], TUBE_R, 3, 10);
  meshes.push(mergeMesh(MAT_FRAME, dt));

  // Top tube: seat tube top → head tube top
  const tt = buildSweptTube([seatTubeTop, headTubeTop], TUBE_R * 0.95, 3, 10);
  meshes.push(mergeMesh(MAT_FRAME, tt));

  // Seat tube: BB → seat tube top
  const st = buildSweptTube([bb, seatTubeTop], TUBE_R, 3, 10);
  meshes.push(mergeMesh(MAT_FRAME, st));

  // Head tube cylinder
  const ht = buildCylinder(TUBE_R * 1.4, TUBE_R * 1.4, v.headTubeLen, 12, true);
  const htMesh = translateMesh(
    rotateMeshX(
      { vertices: ht.verts, indices: ht.idxs, materialIndex: MAT_FRAME },
      -v.headTubeAngle
    ),
    headTubeBot
  );
  meshes.push(htMesh);

  // Fork — from head tube bottom, curving to front axle
  const forkMid = vec3(
    (headTubeBot.x + frontAxle.x) / 2 + v.forkOffset,
    (headTubeBot.y + frontAxle.y) / 2 - 0.08,
    0
  );
  const forkL = buildSweptTube(
    [headTubeBot, forkMid, vec3(frontAxle.x, frontAxle.y, 0.025)],
    TUBE_R_SM * 1.1, 4, 10
  );
  const forkR = buildSweptTube(
    [headTubeBot, forkMid, vec3(frontAxle.x, frontAxle.y, -0.025)],
    TUBE_R_SM * 1.1, 4, 10
  );
  meshes.push(mergeMesh(MAT_FRAME, forkL, forkR));

  // Chainstays: BB → rear axle (split L/R)
  const csL = buildSweptTube(
    [vec3(bb.x, bb.y, 0.04), vec3(rearAxle.x, rearAxle.y, 0.055)],
    TUBE_R_SM, 2, 8
  );
  const csR = buildSweptTube(
    [vec3(bb.x, bb.y, -0.04), vec3(rearAxle.x, rearAxle.y, -0.055)],
    TUBE_R_SM, 2, 8
  );
  meshes.push(mergeMesh(MAT_FRAME, csL, csR));

  // Seatstays: seat tube top → rear axle (split L/R)
  const ssL = buildSweptTube(
    [vec3(seatTubeTop.x, seatTubeTop.y, 0.02), vec3(rearAxle.x, rearAxle.y, 0.055)],
    TUBE_R_SM, 2, 8
  );
  const ssR = buildSweptTube(
    [vec3(seatTubeTop.x, seatTubeTop.y, -0.02), vec3(rearAxle.x, rearAxle.y, -0.055)],
    TUBE_R_SM, 2, 8
  );
  meshes.push(mergeMesh(MAT_FRAME, ssL, ssR));

  // Bottom bracket shell
  const bbShell = buildCylinder(0.038, 0.038, 0.076, 14, true);
  meshes.push(
    translateMesh(
      rotateMeshX(
        { vertices: bbShell.verts, indices: bbShell.idxs, materialIndex: MAT_FRAME },
        Math.PI / 2
      ),
      vec3(0, 0, -0.038)
    )
  );

  // Saddle rail + saddle
  const saddleX = seatTubeTop.x - Math.sin(v.seatTubeAngle) * 0.02;
  const saddleY = seatTubeTop.y + Math.cos(v.seatTubeAngle) * 0.02 + 0.025;
  const saddlePost = buildCylinder(0.013, 0.013, 0.12, 10, false);
  meshes.push(
    translateMesh(
      { vertices: saddlePost.verts, indices: saddlePost.idxs, materialIndex: MAT_FRAME },
      vec3(seatTubeTop.x, seatTubeTop.y, 0)
    )
  );
  // Saddle shape — squashed rounded box
  const saddle = buildRoundedBox(0.26, 0.04, 0.14, 0.015, 8);
  meshes.push(
    translateMesh(
      { vertices: saddle.verts, indices: saddle.idxs, materialIndex: MAT_ACCENT },
      vec3(saddleX, saddleY, 0)
    )
  );

  // Handlebars — position at head tube top
  const barX = headTubeTop.x;
  const barY = headTubeTop.y + 0.06 + v.barHeight;
  const stemLen = 0.09;

  // Stem
  const stem = buildSweptTube(
    [headTubeTop, vec3(barX - stemLen * 0.7, barY, 0)],
    TUBE_R * 0.9, 2, 8
  );
  meshes.push(mergeMesh(MAT_FRAME, stem));

  if (v.barType === "drop") {
    // Drop bar — curved outward then drops
    const barW = 0.40; // total width
    const barParts: { verts: Vertex[]; idxs: number[] }[] = [];
    // Top bar (horizontal)
    barParts.push(
      buildSweptTube(
        [vec3(barX - stemLen * 0.7, barY, -barW / 2), vec3(barX - stemLen * 0.7, barY, barW / 2)],
        TUBE_R * 0.75, 2, 8
      )
    );
    // Left drop
    const lDrop = [
      vec3(barX - stemLen * 0.7, barY, -barW / 2),
      vec3(barX - stemLen * 0.7 - 0.04, barY - 0.05, -barW / 2 - 0.01),
      vec3(barX - stemLen * 0.7 - 0.08, barY - 0.12, -barW / 2 + 0.02),
      vec3(barX - stemLen * 0.7 - 0.06, barY - 0.17, -barW / 2 + 0.06),
    ];
    barParts.push(buildSweptTube(lDrop, TUBE_R * 0.75, 3, 8));
    // Right drop (mirror)
    const rDrop = lDrop.map((p) => vec3(p.x, p.y, -p.z));
    barParts.push(buildSweptTube(rDrop, TUBE_R * 0.75, 3, 8));
    meshes.push(mergeMesh(MAT_FRAME, ...barParts));
  } else if (v.barType === "flat") {
    const barW = 0.50;
    const flatBar = buildSweptTube(
      [vec3(barX - stemLen * 0.7, barY, -barW / 2), vec3(barX - stemLen * 0.7, barY, barW / 2)],
      TUBE_R * 0.75, 2, 8
    );
    meshes.push(mergeMesh(MAT_FRAME, flatBar));
  } else {
    // TT aero bars
    const ttArm = buildSweptTube(
      [
        vec3(barX - stemLen * 0.7, barY, 0),
        vec3(barX - stemLen * 0.7 - 0.12, barY, 0),
        vec3(barX - stemLen * 0.7 - 0.28, barY + 0.015, 0),
      ],
      TUBE_R * 0.75, 3, 8
    );
    const ttL = buildSweptTube(
      [vec3(barX - stemLen * 0.7 - 0.05, barY - 0.04, -0.10), vec3(barX - stemLen * 0.7 - 0.05, barY - 0.04, 0)],
      TUBE_R * 0.65, 2, 6
    );
    const ttR = buildSweptTube(
      [vec3(barX - stemLen * 0.7 - 0.05, barY - 0.04, 0.10), vec3(barX - stemLen * 0.7 - 0.05, barY - 0.04, 0)],
      TUBE_R * 0.65, 2, 6
    );
    meshes.push(mergeMesh(MAT_FRAME, ttArm, ttL, ttR));
  }

  // Cranks — centred at BB, in XZ plane. Two arms 180° apart.
  const crankLen = 0.175;
  const crankParts: { verts: Vertex[]; idxs: number[] }[] = [];
  // Right crank arm (Z positive side, pointing toward +X)
  crankParts.push(
    buildSweptTube(
      [vec3(0, 0, 0.038), vec3(crankLen, 0, 0.038)],
      0.01, 2, 8
    )
  );
  // Left crank arm (Z negative side, pointing toward -X)
  crankParts.push(
    buildSweptTube(
      [vec3(0, 0, -0.038), vec3(-crankLen, 0, -0.038)],
      0.01, 2, 8
    )
  );
  // Pedals
  crankParts.push(
    buildRoundedBox(0.10, 0.012, 0.08, 0.005, 4)
  );
  const pedalR = buildRoundedBox(0.10, 0.012, 0.08, 0.005, 4);
  const pedalRMesh = translateMesh(
    { vertices: pedalR.verts, indices: pedalR.idxs, materialIndex: MAT_ACCENT },
    vec3(crankLen, 0, 0.038)
  );
  meshes.push(pedalRMesh);
  const pedalL = buildRoundedBox(0.10, 0.012, 0.08, 0.005, 4);
  const pedalLMesh = translateMesh(
    { vertices: pedalL.verts, indices: pedalL.idxs, materialIndex: MAT_ACCENT },
    vec3(-crankLen, 0, -0.038)
  );
  meshes.push(pedalLMesh);

  meshes.push(mergeMesh(MAT_ACCENT, ...crankParts));

  return meshes;
}

// ---------------------------------------------------------------------------
// Rider builder
// Returns meshes + pivot info for animatable nodes.
// Origin: BB centre (same as frame).
// ---------------------------------------------------------------------------

interface RiderPivots {
  thighLPivot: Vec3;  // hip joint (left)
  shinLPivot: Vec3;   // knee joint (left)
  thighRPivot: Vec3;
  shinRPivot: Vec3;
}

function buildRider(v: BikeVariant): { meshes: Mesh[]; pivots: RiderPivots } {
  const meshes: Mesh[] = [];

  // Bike geometry we need
  const rearAxle = vec3(-WHEELBASE / 2, WHEEL_RADIUS - v.bbDrop, 0);
  const saddleX = -Math.sin(v.seatTubeAngle) * 0.60;
  const saddleY = Math.cos(v.seatTubeAngle) * 0.60 + 0.06;

  // Lean angle of torso (forward)
  const leanAngle = v.riderReach * 0.85; // radians forward from vertical

  // Hip position = saddle + small offset
  const hipY = saddleY + 0.05;
  const hipX = saddleX;
  const hipZ = 0.0;

  // Thigh connects hip to knee; knee connects to ankle (= BB when pedal is down)
  // For static pose: right leg pedal at bottom, left at top
  const rightPhase = -Math.PI / 2; // pedal at bottom → thigh near vertical
  const leftPhase = Math.PI / 2;   // pedal at top

  function legPoints(phase: number, side: number): { hip: Vec3; knee: Vec3; ankle: Vec3 } {
    const hipPt = vec3(hipX, hipY, side * 0.085);
    // Ankle at crank end position (rotating pedal)
    const crankAngle = phase;
    const anklePt = vec3(
      0.175 * Math.cos(crankAngle),
      0.175 * Math.sin(crankAngle),
      side * 0.038
    );
    // Knee is midpoint + outward offset (IK-style)
    const mid = scaleV(addV(hipPt, anklePt), 0.5);
    const kneePt = vec3(
      mid.x - 0.05,
      mid.y,
      mid.z + side * 0.03
    );
    return { hip: hipPt, knee: kneePt, ankle: anklePt };
  }

  const rightLeg = legPoints(rightPhase, 1);
  const leftLeg = legPoints(leftPhase, -1);

  // Thighs
  const thighRMesh = mergeMesh(
    MAT_KIT,
    buildSweptTube([rightLeg.hip, rightLeg.knee], LEG_R, 3, 10)
  );
  meshes.push(thighRMesh);

  const thighLMesh = mergeMesh(
    MAT_KIT,
    buildSweptTube([leftLeg.hip, leftLeg.knee], LEG_R, 3, 10)
  );
  meshes.push(thighLMesh);

  // Shins
  const shinRMesh = mergeMesh(
    MAT_KIT,
    buildSweptTube([rightLeg.knee, rightLeg.ankle], LEG_R * 0.85, 3, 10)
  );
  meshes.push(shinRMesh);

  const shinLMesh = mergeMesh(
    MAT_KIT,
    buildSweptTube([leftLeg.knee, leftLeg.ankle], LEG_R * 0.85, 3, 10)
  );
  meshes.push(shinLMesh);

  // Cycling shoes
  function buildShoe(ankle: Vec3, side: number): Mesh {
    const shoe = buildRoundedBox(FOOT_L, FOOT_H, 0.09, 0.018, 6);
    return translateMesh(
      { vertices: shoe.verts, indices: shoe.idxs, materialIndex: MAT_ACCENT },
      vec3(ankle.x + 0.06, ankle.y - FOOT_H / 2, ankle.z)
    );
  }
  meshes.push(buildShoe(rightLeg.ankle, 1));
  meshes.push(buildShoe(leftLeg.ankle, -1));

  // Torso — leaned forward
  const torsoBase = vec3(hipX, hipY + 0.06, hipZ);

  // Torso top position (leaned forward)
  const torsoCx = torsoBase.x - Math.sin(leanAngle) * TORSO_H * 0.5;
  const torsoCy = torsoBase.y + Math.cos(leanAngle) * TORSO_H * 0.5;
  const torsoC = vec3(torsoCx, torsoCy, 0);

  const torso = buildRoundedBox(TORSO_W, TORSO_H, TORSO_D, 0.03, 10);
  let torsoMesh: Mesh = {
    vertices: torso.verts,
    indices: torso.idxs,
    materialIndex: MAT_KIT,
  };
  torsoMesh = rotateMeshZ(torsoMesh, -leanAngle);
  torsoMesh = translateMesh(torsoMesh, torsoC);
  meshes.push(torsoMesh);

  // Neck
  const torsoTopX = torsoBase.x - Math.sin(leanAngle) * TORSO_H;
  const torsoTopY = torsoBase.y + Math.cos(leanAngle) * TORSO_H;
  const neckBase = vec3(torsoTopX, torsoTopY, 0);
  const neckTip = vec3(torsoTopX - Math.sin(leanAngle) * 0.02, torsoTopY + NECK_H, 0);
  const neck = buildSweptTube([neckBase, neckTip], NECK_R, 2, 8);
  meshes.push(mergeMesh(MAT_SKIN, neck));

  // Head — slightly more upright than torso
  const headCx = neckTip.x - Math.sin(leanAngle * 0.4) * 0.04;
  const headCy = neckTip.y + HEAD_R + 0.01;
  const headSph = buildSphere(HEAD_R, 14, 10);
  const headMesh = translateMesh(
    { vertices: headSph.verts, indices: headSph.idxs, materialIndex: MAT_SKIN },
    vec3(headCx, headCy, 0)
  );
  meshes.push(headMesh);

  // Helmet — slightly larger sphere squashed in Y, offset forward
  const helmetSph = buildSphere(HEAD_R * 1.12, 14, 10);
  let helmetMesh: Mesh = {
    vertices: helmetSph.verts,
    indices: helmetSph.idxs,
    materialIndex: MAT_HELMET,
  };
  helmetMesh = scaleMeshY(helmetMesh, 0.82);
  helmetMesh = translateMesh(helmetMesh, vec3(headCx - 0.02, headCy + 0.02, 0));
  meshes.push(helmetMesh);

  // Shoulders
  const shoulderY = torsoTopY - 0.06;
  const shoulderX = torsoTopX;
  const shoulderW = TORSO_W * 0.6;

  // Upper arms — from shoulder to elbow, going forward+down at lean angle
  const headTubeTop = vec3(
    WHEELBASE / 2 - (v.reach + Math.sin(v.headTubeAngle) * v.headTubeLen),
    WHEEL_RADIUS - v.bbDrop + v.stack,
    0
  );
  const barPos = vec3(
    headTubeTop.x - 0.09 * 0.7,
    headTubeTop.y + 0.06 + v.barHeight,
    0
  );

  function buildArm(side: number): Mesh[] {
    const armMeshes: Mesh[] = [];
    const shoulder = vec3(shoulderX, shoulderY, side * shoulderW);
    // Elbow — midway between shoulder and bar, pulled outward + down slightly
    const elbowX = (shoulder.x + barPos.x) / 2 - 0.05;
    const elbowY = (shoulder.y + barPos.y) / 2 - 0.04;
    const elbowZ = side * (Math.abs(shoulder.z) + 0.02);
    const elbow = vec3(elbowX, elbowY, elbowZ);
    const barGrip = vec3(barPos.x, barPos.y, side * 0.16);

    const upperArm = buildSweptTube([shoulder, elbow], ARM_R, 3, 8);
    const lowerArm = buildSweptTube([elbow, barGrip], ARM_R * 0.85, 3, 8);
    armMeshes.push(mergeMesh(MAT_KIT, upperArm));
    armMeshes.push(mergeMesh(MAT_KIT, lowerArm));
    // Glove hand
    const hand = buildRoundedBox(0.07, 0.045, 0.06, 0.015, 4);
    armMeshes.push(
      translateMesh(
        { vertices: hand.verts, indices: hand.idxs, materialIndex: MAT_SKIN },
        barGrip
      )
    );
    return armMeshes;
  }

  meshes.push(...buildArm(1));
  meshes.push(...buildArm(-1));

  const pivots: RiderPivots = {
    thighLPivot: leftLeg.hip,
    shinLPivot: leftLeg.knee,
    thighRPivot: rightLeg.hip,
    shinRPivot: rightLeg.knee,
  };

  return { meshes, pivots };
}

// ---------------------------------------------------------------------------
// glTF 2.0 binary writer
// ---------------------------------------------------------------------------

interface GltfMaterial {
  name: string;
  baseColorFactor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  doubleSided?: boolean;
}

const MATERIALS: GltfMaterial[] = [
  { name: "frame",   baseColorFactor: [0.12, 0.14, 0.16, 1], metallicFactor: 0.7,  roughnessFactor: 0.3 },
  { name: "wheel",   baseColorFactor: [0.08, 0.08, 0.09, 1], metallicFactor: 0.4,  roughnessFactor: 0.6 },
  { name: "kit",     baseColorFactor: [0.72, 0.08, 0.10, 1], metallicFactor: 0.0,  roughnessFactor: 0.85 },
  { name: "skin",    baseColorFactor: [0.87, 0.68, 0.52, 1], metallicFactor: 0.0,  roughnessFactor: 0.9  },
  { name: "helmet",  baseColorFactor: [0.92, 0.92, 0.94, 1], metallicFactor: 0.05, roughnessFactor: 0.5  },
  { name: "accent",  baseColorFactor: [0.05, 0.38, 0.72, 1], metallicFactor: 0.2,  roughnessFactor: 0.55 },
];

/** Pack all meshes into one binary buffer; return accessor + bufferView data. */
function packMeshesIntoBuffer(allMeshes: Mesh[]): {
  buffer: Buffer;
  accessors: object[];
  bufferViews: object[];
  primitives: object[];
} {
  const buffers: Buffer[] = [];
  const accessors: object[] = [];
  const bufferViews: object[] = [];
  const primitives: object[] = [];

  let byteOffset = 0;

  for (const mesh of allMeshes) {
    if (mesh.vertices.length === 0 || mesh.indices.length === 0) continue;

    const vertCount = mesh.vertices.length;
    const idxCount = mesh.indices.length;

    // Determine if we need 32-bit indices
    const use32bit = vertCount > 65535;
    const idxBytes = use32bit ? 4 : 2;
    const idxComponentType = use32bit ? 5125 : 5123; // UNSIGNED_INT or UNSIGNED_SHORT

    // Index buffer
    const idxBufLen = idxCount * idxBytes;
    const idxBuf = Buffer.allocUnsafe(idxBufLen);
    for (let i = 0; i < idxCount; i++) {
      if (use32bit) idxBuf.writeUInt32LE(mesh.indices[i]!, i * 4);
      else idxBuf.writeUInt16LE(mesh.indices[i]!, i * 2);
    }
    // Align to 4 bytes
    const idxPadded = Math.ceil(idxBufLen / 4) * 4;
    const idxBufPadded = Buffer.alloc(idxPadded);
    idxBuf.copy(idxBufPadded);

    const idxBvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: idxPadded,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    });
    byteOffset += idxPadded;
    buffers.push(idxBufPadded);

    const idxAccIdx = accessors.length;
    accessors.push({
      bufferView: idxBvIdx,
      byteOffset: 0,
      componentType: idxComponentType,
      count: idxCount,
      type: "SCALAR",
    });

    // Attribute buffers — POSITION (vec3), NORMAL (vec3), TEXCOORD_0 (vec2)
    const posData = Buffer.allocUnsafe(vertCount * 3 * 4);
    const norData = Buffer.allocUnsafe(vertCount * 3 * 4);
    const uvData  = Buffer.allocUnsafe(vertCount * 2 * 4);

    let posMin = [Infinity, Infinity, Infinity];
    let posMax = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < vertCount; i++) {
      const v = mesh.vertices[i]!;
      posData.writeFloatLE(v.pos.x, i * 12);
      posData.writeFloatLE(v.pos.y, i * 12 + 4);
      posData.writeFloatLE(v.pos.z, i * 12 + 8);
      norData.writeFloatLE(v.nor.x, i * 12);
      norData.writeFloatLE(v.nor.y, i * 12 + 4);
      norData.writeFloatLE(v.nor.z, i * 12 + 8);
      uvData.writeFloatLE(v.uv.u, i * 8);
      uvData.writeFloatLE(v.uv.v, i * 8 + 4);

      if (v.pos.x < posMin[0]!) posMin[0] = v.pos.x;
      if (v.pos.y < posMin[1]!) posMin[1] = v.pos.y;
      if (v.pos.z < posMin[2]!) posMin[2] = v.pos.z;
      if (v.pos.x > posMax[0]!) posMax[0] = v.pos.x;
      if (v.pos.y > posMax[1]!) posMax[1] = v.pos.y;
      if (v.pos.z > posMax[2]!) posMax[2] = v.pos.z;
    }

    // Position BV + accessor
    const posBvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: vertCount * 12, target: 34962, byteStride: 12 });
    byteOffset += vertCount * 12;
    buffers.push(posData);

    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posBvIdx, byteOffset: 0, componentType: 5126, count: vertCount,
      type: "VEC3", min: posMin, max: posMax,
    });

    // Normal BV + accessor
    const norBvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: vertCount * 12, target: 34962, byteStride: 12 });
    byteOffset += vertCount * 12;
    buffers.push(norData);

    const norAccIdx = accessors.length;
    accessors.push({ bufferView: norBvIdx, byteOffset: 0, componentType: 5126, count: vertCount, type: "VEC3" });

    // UV BV + accessor
    const uvBvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: vertCount * 8, target: 34962, byteStride: 8 });
    byteOffset += vertCount * 8;
    buffers.push(uvData);

    const uvAccIdx = accessors.length;
    accessors.push({ bufferView: uvBvIdx, byteOffset: 0, componentType: 5126, count: vertCount, type: "VEC2" });

    primitives.push({
      attributes: { POSITION: posAccIdx, NORMAL: norAccIdx, TEXCOORD_0: uvAccIdx },
      indices: idxAccIdx,
      material: mesh.materialIndex,
    });
  }

  return {
    buffer: Buffer.concat(buffers),
    accessors,
    bufferViews,
    primitives,
  };
}

/** Write a complete .glb file. */
function writeGlb(outputPath: string, variant: BikeVariant): void {
  // ------- Build all meshes -------
  const frameMeshes = buildFrame(variant);
  const wheelMeshes = buildWheel();
  const { meshes: riderMeshes, pivots } = buildRider(variant);

  const rearAxle = vec3(-WHEELBASE / 2, WHEEL_RADIUS - variant.bbDrop, 0);
  const frontAxle = vec3(WHEELBASE / 2, WHEEL_RADIUS - variant.bbDrop, 0);

  // Collect all meshes grouped by which glTF mesh they belong to.
  // We'll create one glTF Mesh per logical part so each gets its own node.
  // Indices within allMeshLists refer to glTF mesh indices.

  // Wheel mesh (shared between front/rear nodes — we reference same mesh twice)
  const wheelMeshList = wheelMeshes;

  // Crank meshes (just the crank arms + pedals) — already in frameMeshes at end
  // We need to separate them. Let's restructure: build crank mesh separately.

  // Rebuild so crank parts are isolated
  const crankParts: { verts: Vertex[]; idxs: number[] }[] = [];
  const crankLen = 0.175;
  crankParts.push(
    buildSweptTube([vec3(0, 0, 0.038), vec3(crankLen, 0, 0.038)], 0.01, 2, 8),
    buildSweptTube([vec3(0, 0, -0.038), vec3(-crankLen, 0, -0.038)], 0.01, 2, 8)
  );
  const crankMesh = mergeMesh(MAT_ACCENT, ...crankParts);

  // Pedal right
  const pedalRBox = buildRoundedBox(0.10, 0.012, 0.08, 0.005, 4);
  const pedalRMesh = translateMesh(
    { vertices: pedalRBox.verts, indices: pedalRBox.idxs, materialIndex: MAT_ACCENT },
    vec3(crankLen, 0, 0.038)
  );
  // Pedal left
  const pedalLBox = buildRoundedBox(0.10, 0.012, 0.08, 0.005, 4);
  const pedalLMesh = translateMesh(
    { vertices: pedalLBox.verts, indices: pedalLBox.idxs, materialIndex: MAT_ACCENT },
    vec3(-crankLen, 0, -0.038)
  );

  const crankMeshFull: Mesh[] = [crankMesh, pedalRMesh, pedalLMesh];

  // Separate thigh / shin meshes (already built in riderMeshes at indices 0..3)
  // riderMeshes: [thighR, thighL, shinR, shinL, ...rest]
  const thighRMesh = riderMeshes[0]!;
  const thighLMesh = riderMeshes[1]!;
  const shinRMesh = riderMeshes[2]!;
  const shinLMesh = riderMeshes[3]!;
  const restRiderMeshes = riderMeshes.slice(4);

  // ------- Assign glTF mesh indices -------
  // 0: frame body (all frame meshes concatenated)
  // 1: wheel (shared by front + rear nodes)
  // 2: crank
  // 3: thighL
  // 4: shinL
  // 5: thighR
  // 6: shinR
  // 7: rider body (everything else on rider)

  const MESH_IDX_FRAME = 0;
  const MESH_IDX_WHEEL = 1;
  const MESH_IDX_CRANK = 2;
  const MESH_IDX_THIGH_L = 3;
  const MESH_IDX_SHIN_L = 4;
  const MESH_IDX_THIGH_R = 5;
  const MESH_IDX_SHIN_R = 6;
  const MESH_IDX_RIDER_BODY = 7;

  // Map: meshGroupIndex → array of Mesh objects
  const meshGroups: Mesh[][] = [
    frameMeshes,                // 0 frame
    wheelMeshList,              // 1 wheel
    crankMeshFull,              // 2 crank
    [thighLMesh],               // 3 thighL
    [shinLMesh],                // 4 shinL
    [thighRMesh],               // 5 thighR
    [shinRMesh],                // 6 shinR
    restRiderMeshes,            // 7 rider body
  ];

  // Flatten all mesh groups into a single array with offsets tracked
  const allPrimitives: { meshGroupIdx: number; primitive: object }[] = [];
  const primOffsets: number[] = [];
  let globalPrimIdx = 0;

  for (let gi = 0; gi < meshGroups.length; gi++) {
    primOffsets.push(globalPrimIdx);
    globalPrimIdx += meshGroups[gi]!.length;
  }

  const allFlatMeshes: Mesh[] = meshGroups.flat();

  // Pack all meshes into one binary buffer
  const { buffer: binBuf, accessors, bufferViews, primitives } = packMeshesIntoBuffer(allFlatMeshes);

  // Build glTF meshes — each glTF mesh has one or more primitives
  const gltfMeshes: object[] = [];
  const groupNames = ["frame", "wheel", "crank", "thighL", "shinL", "thighR", "shinR", "riderBody"];

  let primCursor = 0;
  for (let gi = 0; gi < meshGroups.length; gi++) {
    const groupPrims: object[] = [];
    for (let j = 0; j < meshGroups[gi]!.length; j++) {
      if (primCursor < primitives.length) {
        groupPrims.push(primitives[primCursor]!);
        primCursor++;
      }
    }
    gltfMeshes.push({ name: groupNames[gi], primitives: groupPrims });
  }

  // ------- Build node hierarchy -------
  // All positions relative to world origin (ground-contact midpoint between wheels,
  // which is at (0, 0, 0) in the BB-centric space offset by bb height)

  // The origin contract says: "ground-contact midpoint between wheels"
  // BB is at height (WHEEL_RADIUS - bbDrop) above ground, X = 0.
  // We offset the entire model down by -(WHEEL_RADIUS - bbDrop) so wheels touch ground.
  const bbHeight = WHEEL_RADIUS - variant.bbDrop;

  // Helper: node with a mesh positioned in world space
  const nodes: GltfNode[] = [];
  const rootChildIds: number[] = [];

  function addNode(node: GltfNode): number {
    const id = nodes.length;
    nodes.push(node);
    return id;
  }

  // Frame body node
  const frameNodeId = addNode({
    name: "frame",
    meshIndex: MESH_IDX_FRAME,
    translation: [0, bbHeight, 0],
  });
  rootChildIds.push(frameNodeId);

  // Wheel front — pivot at front axle
  const wheelFrontId = addNode({
    name: "wheelFront",
    meshIndex: MESH_IDX_WHEEL,
    translation: [frontAxle.x, frontAxle.y + bbHeight, frontAxle.z],
    // Wheel torus is in XZ plane, Y-axis is spin axis — no initial rotation needed
  });
  rootChildIds.push(wheelFrontId);

  // Wheel rear — pivot at rear axle
  const wheelRearId = addNode({
    name: "wheelRear",
    meshIndex: MESH_IDX_WHEEL,
    translation: [rearAxle.x, rearAxle.y + bbHeight, rearAxle.z],
  });
  rootChildIds.push(wheelRearId);

  // Crank — pivot at BB centre
  const crankId = addNode({
    name: "crank",
    meshIndex: MESH_IDX_CRANK,
    translation: [0, bbHeight, 0],
  });
  rootChildIds.push(crankId);

  // Leg nodes — pivots at joints, all offset by bbHeight in Y
  const thighLId = addNode({
    name: "thighL",
    meshIndex: MESH_IDX_THIGH_L,
    translation: [pivots.thighLPivot.x, pivots.thighLPivot.y + bbHeight, pivots.thighLPivot.z],
  });
  rootChildIds.push(thighLId);

  const shinLId = addNode({
    name: "shinL",
    meshIndex: MESH_IDX_SHIN_L,
    translation: [pivots.shinLPivot.x, pivots.shinLPivot.y + bbHeight, pivots.shinLPivot.z],
  });
  rootChildIds.push(shinLId);

  const thighRId = addNode({
    name: "thighR",
    meshIndex: MESH_IDX_THIGH_R,
    translation: [pivots.thighRPivot.x, pivots.thighRPivot.y + bbHeight, pivots.thighRPivot.z],
  });
  rootChildIds.push(thighRId);

  const shinRId = addNode({
    name: "shinR",
    meshIndex: MESH_IDX_SHIN_R,
    translation: [pivots.shinRPivot.x, pivots.shinRPivot.y + bbHeight, pivots.shinRPivot.z],
  });
  rootChildIds.push(shinRId);

  // Rider body
  const riderBodyId = addNode({
    name: "riderBody",
    meshIndex: MESH_IDX_RIDER_BODY,
    translation: [0, bbHeight, 0],
  });
  rootChildIds.push(riderBodyId);

  // Root node
  const rootId = addNode({
    name: `cyclist-${variant.name}`,
    children: rootChildIds,
    // Forward = +X, origin = ground midpoint, facing direction already correct
  });

  // ------- Build glTF JSON -------
  const gltfJson: Record<string, unknown> = {
    asset: { version: "2.0", generator: "GlobeRide avatar generator", copyright: "MIT" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [rootId] }],
    nodes: nodes.map((n) => {
      const out: Record<string, unknown> = { name: n.name };
      if (n.meshIndex !== undefined) out["mesh"] = n.meshIndex;
      if (n.children) out["children"] = n.children;
      if (n.translation) out["translation"] = n.translation;
      if (n.rotation) out["rotation"] = n.rotation;
      if (n.scale) out["scale"] = n.scale;
      return out;
    }),
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuf.byteLength }],
    materials: MATERIALS.map((m) => ({
      name: m.name,
      doubleSided: m.doubleSided ?? false,
      pbrMetallicRoughness: {
        baseColorFactor: m.baseColorFactor,
        metallicFactor: m.metallicFactor,
        roughnessFactor: m.roughnessFactor,
      },
    })),
  };

  // ------- Serialise to .glb -------
  const jsonStr = JSON.stringify(gltfJson);
  // JSON chunk must be padded to 4-byte boundary with spaces (0x20)
  const jsonPadLen = Math.ceil(jsonStr.length / 4) * 4;
  const jsonBuf = Buffer.alloc(jsonPadLen, 0x20); // space padding
  Buffer.from(jsonStr, "utf8").copy(jsonBuf);

  // BIN chunk padded to 4-byte boundary with zeros
  const binPadLen = Math.ceil(binBuf.byteLength / 4) * 4;
  const binBufPadded = Buffer.alloc(binPadLen);
  binBuf.copy(binBufPadded);

  // Header: magic(4) + version(4) + length(4) = 12 bytes
  // JSON chunk: chunkLength(4) + chunkType(4) + data
  // BIN  chunk: chunkLength(4) + chunkType(4) + data
  const totalLen = 12 + 8 + jsonPadLen + 8 + binPadLen;
  const out = Buffer.alloc(totalLen);

  let offset = 0;
  // Header
  out.writeUInt32LE(0x46546C67, offset); offset += 4; // magic 'glTF'
  out.writeUInt32LE(2, offset);          offset += 4; // version 2
  out.writeUInt32LE(totalLen, offset);   offset += 4; // total length

  // JSON chunk
  out.writeUInt32LE(jsonPadLen, offset); offset += 4; // chunk length
  out.writeUInt32LE(0x4E4F534A, offset); offset += 4; // chunk type 'JSON'
  jsonBuf.copy(out, offset);             offset += jsonPadLen;

  // BIN chunk
  out.writeUInt32LE(binPadLen, offset);  offset += 4; // chunk length
  out.writeUInt32LE(0x004E4942, offset); offset += 4; // chunk type 'BIN\0'
  binBufPadded.copy(out, offset);

  fs.writeFileSync(outputPath, out);
  console.log(`Wrote ${outputPath} (${(out.byteLength / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/models");
fs.mkdirSync(outDir, { recursive: true });

for (const variant of VARIANTS) {
  writeGlb(path.join(outDir, `cyclist-${variant.name}.glb`), variant);
}
console.log("Done.");
