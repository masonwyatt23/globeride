/**
 * GlobeRide — Gear asset glTF 2.0 generator
 *
 * Produces 7 new .glb files under public/models/gear/:
 *
 *   Bikes (standalone, no rider):
 *     bike-aero.glb      — deep-section wheels, aero bars, matte black + blue accent
 *     bike-climbing.glb  — thin tubes, drop bars, white + cyan
 *     bike-mtb.glb       — flat bars, fat tires, front-suspension hint, orange/black
 *
 *   Helmets (standalone):
 *     helmet-aero.glb    — long TT teardrop shell
 *     helmet-road.glb    — vented road helmet with recessed panels
 *
 *   Kit (rider body only, two colour-scheme variants):
 *     kit-polka.glb      — King of the Mountains: red dots on white
 *     kit-rainbow.glb    — UCI world champion: rainbow stripes
 *
 * Run:  npx vite-node scripts/gen-gear-gltf.ts
 *
 * CONTRACT (matches public/models/CONTRACT.md + gear extension):
 *   Same coordinate system as cyclist-*.glb.
 *   Bike files: named nodes wheelFront, wheelRear, crank, frame
 *   Helmet files: single node "helmet"
 *   Kit files: same rider node set as cyclist-*.glb minus frame/wheels
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types (duplicated from gen-avatar-gltf.ts — standalone script)
// ---------------------------------------------------------------------------

interface Vec3 { x: number; y: number; z: number }
interface Vec2 { u: number; v: number }
interface Vertex { pos: Vec3; nor: Vec3; uv: Vec2 }
interface Mesh { vertices: Vertex[]; indices: number[]; materialIndex: number }
interface GltfNode {
  name: string;
  meshIndex?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}
interface GltfMaterial {
  name: string;
  baseColorFactor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  doubleSided?: boolean;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function vec3(x: number, y: number, z: number): Vec3 { return { x, y, z } }
function addV(a: Vec3, b: Vec3): Vec3 { return vec3(a.x+b.x, a.y+b.y, a.z+b.z) }
function subV(a: Vec3, b: Vec3): Vec3 { return vec3(a.x-b.x, a.y-b.y, a.z-b.z) }
function scaleV(a: Vec3, s: number): Vec3 { return vec3(a.x*s, a.y*s, a.z*s) }
function normalizeV(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
  if (len < 1e-8) return vec3(0,1,0);
  return vec3(v.x/len, v.y/len, v.z/len);
}
function crossV(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x);
}

// ---------------------------------------------------------------------------
// Primitive geometry builders
// ---------------------------------------------------------------------------

function buildTorus(ringRadius: number, tubeRadius: number, ringSegs: number, tubeSegs: number): { verts: Vertex[]; idxs: number[] } {
  const verts: Vertex[] = [];
  const idxs: number[] = [];
  for (let i = 0; i <= ringSegs; i++) {
    const phi = (i / ringSegs) * Math.PI * 2;
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    for (let j = 0; j <= tubeSegs; j++) {
      const theta = (j / tubeSegs) * Math.PI * 2;
      const cosTheta = Math.cos(theta), sinTheta = Math.sin(theta);
      const cx = cosPhi * ringRadius, cz = sinPhi * ringRadius;
      const px = cosPhi * (ringRadius + tubeRadius * cosTheta);
      const py = tubeRadius * sinTheta;
      const pz = sinPhi * (ringRadius + tubeRadius * cosTheta);
      const nx = px - cx, ny = py, nz = pz - cz;
      const nl = Math.sqrt(nx*nx + ny*ny + nz*nz);
      verts.push({ pos: vec3(px,py,pz), nor: vec3(nx/nl,ny/nl,nz/nl), uv: { u: i/ringSegs, v: j/tubeSegs } });
    }
  }
  for (let i = 0; i < ringSegs; i++) {
    for (let j = 0; j < tubeSegs; j++) {
      const a = i*(tubeSegs+1)+j, b = (i+1)*(tubeSegs+1)+j;
      const c = (i+1)*(tubeSegs+1)+j+1, d = i*(tubeSegs+1)+j+1;
      idxs.push(a,b,c, a,c,d);
    }
  }
  return { verts, idxs };
}

function buildCylinder(radiusBottom: number, radiusTop: number, height: number, segments: number, withCaps: boolean): { verts: Vertex[]; idxs: number[] } {
  const verts: Vertex[] = [];
  const idxs: number[] = [];
  const dr = radiusBottom - radiusTop;
  const sl = Math.sqrt(dr*dr + height*height);
  const nSlope = height/sl, nR = dr/sl;
  for (let i = 0; i <= segments; i++) {
    const a = (i/segments)*Math.PI*2;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    verts.push({ pos: vec3(cosA*radiusBottom,0,sinA*radiusBottom), nor: vec3(cosA*nSlope,nR,sinA*nSlope), uv: { u: i/segments, v: 0 } });
    verts.push({ pos: vec3(cosA*radiusTop,height,sinA*radiusTop), nor: vec3(cosA*nSlope,nR,sinA*nSlope), uv: { u: i/segments, v: 1 } });
  }
  for (let i = 0; i < segments; i++) {
    const b = i*2, t = i*2+1, bn = (i+1)*2, tn = (i+1)*2+1;
    idxs.push(b,bn,t, bn,tn,t);
  }
  if (withCaps) {
    const botBase = verts.length;
    verts.push({ pos: vec3(0,0,0), nor: vec3(0,-1,0), uv: { u:0.5,v:0.5 } });
    for (let i = 0; i <= segments; i++) {
      const a = (i/segments)*Math.PI*2;
      verts.push({ pos: vec3(Math.cos(a)*radiusBottom,0,Math.sin(a)*radiusBottom), nor: vec3(0,-1,0), uv: { u:0.5+Math.cos(a)*0.5, v:0.5+Math.sin(a)*0.5 } });
    }
    for (let i = 1; i <= segments; i++) idxs.push(botBase, botBase+i+1, botBase+i);
    const topBase = verts.length;
    verts.push({ pos: vec3(0,height,0), nor: vec3(0,1,0), uv: { u:0.5,v:0.5 } });
    for (let i = 0; i <= segments; i++) {
      const a = (i/segments)*Math.PI*2;
      verts.push({ pos: vec3(Math.cos(a)*radiusTop,height,Math.sin(a)*radiusTop), nor: vec3(0,1,0), uv: { u:0.5+Math.cos(a)*0.5, v:0.5+Math.sin(a)*0.5 } });
    }
    for (let i = 1; i <= segments; i++) idxs.push(topBase, topBase+i, topBase+i+1);
  }
  return { verts, idxs };
}

function buildSphere(radius: number, widthSegs: number, heightSegs: number): { verts: Vertex[]; idxs: number[] } {
  const verts: Vertex[] = [];
  const idxs: number[] = [];
  for (let j = 0; j <= heightSegs; j++) {
    const phi = (j/heightSegs)*Math.PI;
    for (let i = 0; i <= widthSegs; i++) {
      const theta = (i/widthSegs)*Math.PI*2;
      const x = Math.sin(phi)*Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi)*Math.sin(theta);
      verts.push({ pos: vec3(x*radius,y*radius,z*radius), nor: vec3(x,y,z), uv: { u:i/widthSegs, v:j/heightSegs } });
    }
  }
  for (let j = 0; j < heightSegs; j++) {
    for (let i = 0; i < widthSegs; i++) {
      const a = j*(widthSegs+1)+i, b = a+widthSegs+1;
      idxs.push(a,b,a+1, b,b+1,a+1);
    }
  }
  return { verts, idxs };
}

function buildRoundedBox(w: number, h: number, d: number, cornerR: number, segs: number): { verts: Vertex[]; idxs: number[] } {
  const { verts: sv, idxs } = buildSphere(1, segs*2, segs);
  const verts: Vertex[] = sv.map((v) => {
    const hW = w/2-cornerR, hH = h/2-cornerR, hD = d/2-cornerR;
    const bx = Math.max(-hW, Math.min(hW, v.pos.x*w));
    const by = Math.max(-hH, Math.min(hH, v.pos.y*h));
    const bz = Math.max(-hD, Math.min(hD, v.pos.z*d));
    const px = bx + v.pos.x*cornerR, py = by + v.pos.y*cornerR, pz = bz + v.pos.z*cornerR;
    const nx = px-bx, ny = py-by, nz = pz-bz;
    const nl = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
    return { pos: vec3(px,py,pz), nor: vec3(nx/nl,ny/nl,nz/nl), uv: v.uv };
  });
  return { verts, idxs };
}

function buildSweptTube(points: Vec3[], radius: number, _segments: number, radialSegs: number): { verts: Vertex[]; idxs: number[] } {
  if (points.length < 2) return { verts: [], idxs: [] };
  const verts: Vertex[] = [];
  const idxs: number[] = [];
  const frames: { t: Vec3; n: Vec3; b: Vec3 }[] = [];
  for (let i = 0; i < points.length; i++) {
    let t: Vec3;
    if (i === 0) t = normalizeV(subV(points[1]!, points[0]!));
    else if (i === points.length-1) t = normalizeV(subV(points[i]!, points[i-1]!));
    else t = normalizeV(subV(points[i+1]!, points[i-1]!));
    const up = Math.abs(t.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0);
    const b = normalizeV(crossV(t, up));
    const n = normalizeV(crossV(b, t));
    frames.push({ t, n, b });
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, fr = frames[i]!;
    const tv = i/(points.length-1);
    for (let j = 0; j <= radialSegs; j++) {
      const a = (j/radialSegs)*Math.PI*2;
      const cosA = Math.cos(a), sinA = Math.sin(a);
      const nx = fr.n.x*cosA + fr.b.x*sinA;
      const ny = fr.n.y*cosA + fr.b.y*sinA;
      const nz = fr.n.z*cosA + fr.b.z*sinA;
      verts.push({ pos: vec3(p.x+nx*radius, p.y+ny*radius, p.z+nz*radius), nor: vec3(nx,ny,nz), uv: { u:j/radialSegs, v:tv } });
    }
  }
  const cols = radialSegs+1;
  for (let i = 0; i < points.length-1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i*cols+j, b = (i+1)*cols+j, c = (i+1)*cols+j+1, d = i*cols+j+1;
      idxs.push(a,b,c, a,c,d);
    }
  }
  return { verts, idxs };
}

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------

function offsetIndices(idxs: number[], offset: number): number[] { return idxs.map(i => i+offset) }

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
  return { ...mesh, vertices: mesh.vertices.map(v => ({ ...v, pos: addV(v.pos, offset) })) };
}

function rotateMeshX(mesh: Mesh, angle: number): Mesh {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { ...mesh, vertices: mesh.vertices.map(v => ({
    ...v,
    pos: vec3(v.pos.x, v.pos.y*c - v.pos.z*s, v.pos.y*s + v.pos.z*c),
    nor: vec3(v.nor.x, v.nor.y*c - v.nor.z*s, v.nor.y*s + v.nor.z*c),
  })) };
}

function rotateMeshZ(mesh: Mesh, angle: number): Mesh {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { ...mesh, vertices: mesh.vertices.map(v => ({
    ...v,
    pos: vec3(v.pos.x*c - v.pos.y*s, v.pos.x*s + v.pos.y*c, v.pos.z),
    nor: vec3(v.nor.x*c - v.nor.y*s, v.nor.x*s + v.nor.y*c, v.nor.z),
  })) };
}

function scaleMeshY(mesh: Mesh, sy: number): Mesh {
  return { ...mesh, vertices: mesh.vertices.map(v => ({ ...v, pos: vec3(v.pos.x, v.pos.y*sy, v.pos.z) })) };
}

function scaleMesh(mesh: Mesh, sx: number, sy: number, sz: number): Mesh {
  return { ...mesh, vertices: mesh.vertices.map(v => ({
    ...v,
    pos: vec3(v.pos.x*sx, v.pos.y*sy, v.pos.z*sz),
    nor: normalizeV(vec3(v.nor.x/sx, v.nor.y/sy, v.nor.z/sz)),
  })) };
}

// ---------------------------------------------------------------------------
// Shared bike dimensions
// ---------------------------------------------------------------------------

const WHEEL_RADIUS = 0.34;
const WHEELBASE = 1.00;
const TUBE_R = 0.015;
const TUBE_R_SM = 0.011;

// Material index constants (per-file palettes defined inline)
const MAT_FRAME  = 0;
const MAT_WHEEL  = 1;
const MAT_ACCENT = 2;
// Kit files also use:
const MAT_KIT    = 0; // overrides in kit context
const MAT_SKIN   = 1;
const MAT_HELMET_KIT = 2;

// ---------------------------------------------------------------------------
// Wheel builder — reused by all bike variants
// ---------------------------------------------------------------------------

function buildWheel(tubeR: number, spokeCount: number): Mesh[] {
  const torus = buildTorus(WHEEL_RADIUS, tubeR, 36, 12);
  const hub = buildCylinder(0.028, 0.028, 0.052, 12, true);
  const hubMesh = translateMesh(
    { vertices: hub.verts, indices: hub.idxs, materialIndex: MAT_WHEEL },
    vec3(0, -0.026, 0)
  );
  const spokeParts: { verts: Vertex[]; idxs: number[] }[] = [];
  for (let i = 0; i < spokeCount; i++) {
    const a = (i/spokeCount)*Math.PI*2;
    spokeParts.push(buildSweptTube([vec3(0,0,0), vec3(Math.cos(a)*WHEEL_RADIUS,0,Math.sin(a)*WHEEL_RADIUS)], 0.004, 1, 6));
  }
  const rimMesh: Mesh = { vertices: torus.verts, indices: torus.idxs, materialIndex: MAT_WHEEL };
  const spokeMesh = mergeMesh(MAT_WHEEL, ...spokeParts);
  return [rimMesh, spokeMesh, hubMesh];
}

// Deep-section rim disc (for aero bike) — adds solid disc overlay to simulate deep carbon rim
function buildDeepRimDisc(rimDepth: number): Mesh[] {
  // Two discs (inner faces) at ±half-width, creating a deep-section side-wall appearance
  const result: Mesh[] = [];
  for (const side of [-1, 1]) {
    const disc = buildCylinder(WHEEL_RADIUS, WHEEL_RADIUS - rimDepth*0.15, rimDepth, 36, false);
    let m: Mesh = { vertices: disc.verts, indices: disc.idxs, materialIndex: MAT_WHEEL };
    m = rotateMeshX(m, Math.PI/2);
    m = translateMesh(m, vec3(0, 0, side*0.012));
    result.push(m);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Crank builder (shared)
// ---------------------------------------------------------------------------

function buildCrankMeshes(): Mesh[] {
  const crankLen = 0.175;
  const arms = mergeMesh(MAT_ACCENT,
    buildSweptTube([vec3(0,0,0.038), vec3(crankLen,0,0.038)], 0.01, 2, 8),
    buildSweptTube([vec3(0,0,-0.038), vec3(-crankLen,0,-0.038)], 0.01, 2, 8)
  );
  const pr = buildRoundedBox(0.10, 0.012, 0.08, 0.005, 4);
  const pedalR = translateMesh({ vertices: pr.verts, indices: pr.idxs, materialIndex: MAT_ACCENT }, vec3(crankLen,0,0.038));
  const pl = buildRoundedBox(0.10, 0.012, 0.08, 0.005, 4);
  const pedalL = translateMesh({ vertices: pl.verts, indices: pl.idxs, materialIndex: MAT_ACCENT }, vec3(-crankLen,0,-0.038));
  return [arms, pedalR, pedalL];
}

// ---------------------------------------------------------------------------
// Frame builders
// ---------------------------------------------------------------------------

interface FrameSpec {
  bbDrop: number;
  seatTubeAngle: number;
  headTubeAngle: number;
  headTubeLen: number;
  reach: number;
  stack: number;
  forkOffset: number;
  tubeR: number;       // main frame tube radius
  tubeRSm: number;     // chainstay/seatstay radius
  barType: "drop" | "flat" | "tt" | "aero";
  barHeight: number;
}

function buildFrameMeshes(spec: FrameSpec): Mesh[] {
  const meshes: Mesh[] = [];
  const bb = vec3(0,0,0);
  const rearAxle = vec3(-WHEELBASE/2, WHEEL_RADIUS - spec.bbDrop, 0);
  const frontAxle = vec3(WHEELBASE/2, WHEEL_RADIUS - spec.bbDrop, 0);

  const seatTubeTop = vec3(
    -Math.sin(spec.seatTubeAngle)*0.58,
    Math.cos(spec.seatTubeAngle)*0.58,
    0
  );

  const htBottomX = frontAxle.x - spec.reach;
  const htBottomY = rearAxle.y + spec.bbDrop + (spec.stack - spec.headTubeLen);
  const htTopY = htBottomY + spec.headTubeLen;
  const htAngleX = -Math.sin(spec.headTubeAngle)*spec.headTubeLen;
  const headTubeBot = vec3(htBottomX, htBottomY, 0);
  const headTubeTop = vec3(htBottomX + htAngleX, htTopY, 0);

  // Down tube
  meshes.push(mergeMesh(MAT_FRAME, buildSweptTube([bb, headTubeBot], spec.tubeR, 3, 10)));
  // Top tube
  meshes.push(mergeMesh(MAT_FRAME, buildSweptTube([seatTubeTop, headTubeTop], spec.tubeR*0.95, 3, 10)));
  // Seat tube
  meshes.push(mergeMesh(MAT_FRAME, buildSweptTube([bb, seatTubeTop], spec.tubeR, 3, 10)));

  // Head tube
  const ht = buildCylinder(spec.tubeR*1.4, spec.tubeR*1.4, spec.headTubeLen, 12, true);
  meshes.push(translateMesh(rotateMeshX({ vertices: ht.verts, indices: ht.idxs, materialIndex: MAT_FRAME }, -spec.headTubeAngle), headTubeBot));

  // Fork
  const forkMid = vec3((headTubeBot.x + frontAxle.x)/2 + spec.forkOffset, (headTubeBot.y + frontAxle.y)/2 - 0.08, 0);
  meshes.push(mergeMesh(MAT_FRAME,
    buildSweptTube([headTubeBot, forkMid, vec3(frontAxle.x, frontAxle.y, 0.025)], spec.tubeRSm*1.1, 4, 10),
    buildSweptTube([headTubeBot, forkMid, vec3(frontAxle.x, frontAxle.y, -0.025)], spec.tubeRSm*1.1, 4, 10)
  ));

  // Chainstays
  meshes.push(mergeMesh(MAT_FRAME,
    buildSweptTube([vec3(bb.x,bb.y,0.04), vec3(rearAxle.x,rearAxle.y,0.055)], spec.tubeRSm, 2, 8),
    buildSweptTube([vec3(bb.x,bb.y,-0.04), vec3(rearAxle.x,rearAxle.y,-0.055)], spec.tubeRSm, 2, 8)
  ));

  // Seatstays
  meshes.push(mergeMesh(MAT_FRAME,
    buildSweptTube([vec3(seatTubeTop.x,seatTubeTop.y,0.02), vec3(rearAxle.x,rearAxle.y,0.055)], spec.tubeRSm, 2, 8),
    buildSweptTube([vec3(seatTubeTop.x,seatTubeTop.y,-0.02), vec3(rearAxle.x,rearAxle.y,-0.055)], spec.tubeRSm, 2, 8)
  ));

  // BB shell
  const bbShell = buildCylinder(0.038, 0.038, 0.076, 14, true);
  meshes.push(translateMesh(rotateMeshX({ vertices: bbShell.verts, indices: bbShell.idxs, materialIndex: MAT_FRAME }, Math.PI/2), vec3(0,0,-0.038)));

  // Saddle
  const saddleX = seatTubeTop.x - Math.sin(spec.seatTubeAngle)*0.02;
  const saddleY = seatTubeTop.y + Math.cos(spec.seatTubeAngle)*0.02 + 0.025;
  const saddlePost = buildCylinder(0.013, 0.013, 0.12, 10, false);
  meshes.push(translateMesh({ vertices: saddlePost.verts, indices: saddlePost.idxs, materialIndex: MAT_FRAME }, vec3(seatTubeTop.x, seatTubeTop.y, 0)));
  const saddle = buildRoundedBox(0.26, 0.04, 0.14, 0.015, 8);
  meshes.push(translateMesh({ vertices: saddle.verts, indices: saddle.idxs, materialIndex: MAT_ACCENT }, vec3(saddleX, saddleY, 0)));

  // Handlebars
  const barX = headTubeTop.x;
  const barY = headTubeTop.y + 0.06 + spec.barHeight;
  const stemLen = 0.09;
  meshes.push(mergeMesh(MAT_FRAME, buildSweptTube([headTubeTop, vec3(barX - stemLen*0.7, barY, 0)], spec.tubeR*0.9, 2, 8)));

  if (spec.barType === "drop") {
    const barW = 0.40;
    meshes.push(mergeMesh(MAT_FRAME,
      buildSweptTube([vec3(barX-stemLen*0.7,barY,-barW/2), vec3(barX-stemLen*0.7,barY,barW/2)], spec.tubeR*0.75, 2, 8),
      buildSweptTube([vec3(barX-stemLen*0.7,barY,-barW/2), vec3(barX-stemLen*0.7-0.04,barY-0.05,-barW/2-0.01), vec3(barX-stemLen*0.7-0.08,barY-0.12,-barW/2+0.02), vec3(barX-stemLen*0.7-0.06,barY-0.17,-barW/2+0.06)], spec.tubeR*0.75, 3, 8),
      buildSweptTube([vec3(barX-stemLen*0.7,barY,barW/2), vec3(barX-stemLen*0.7-0.04,barY-0.05,barW/2+0.01), vec3(barX-stemLen*0.7-0.08,barY-0.12,barW/2-0.02), vec3(barX-stemLen*0.7-0.06,barY-0.17,barW/2-0.06)], spec.tubeR*0.75, 3, 8)
    ));
  } else if (spec.barType === "flat") {
    const barW = 0.54;
    meshes.push(mergeMesh(MAT_FRAME,
      buildSweptTube([vec3(barX-stemLen*0.7,barY,-barW/2), vec3(barX-stemLen*0.7,barY,barW/2)], spec.tubeR*0.75, 2, 8)
    ));
  } else if (spec.barType === "aero") {
    // Aero bars: narrow base + two forward-pointing extensions
    const baseW = 0.34;
    const extLen = 0.30;
    meshes.push(mergeMesh(MAT_FRAME,
      // Base bar (narrow)
      buildSweptTube([vec3(barX-stemLen*0.7,barY,-baseW/2), vec3(barX-stemLen*0.7,barY,baseW/2)], spec.tubeR*0.80, 2, 8),
      // Left extension pointing forward (-X in our coord = forward)
      buildSweptTube([
        vec3(barX-stemLen*0.7, barY, -0.08),
        vec3(barX-stemLen*0.7 - extLen*0.5, barY+0.01, -0.07),
        vec3(barX-stemLen*0.7 - extLen, barY+0.02, -0.06),
      ], spec.tubeR*0.65, 3, 8),
      // Right extension
      buildSweptTube([
        vec3(barX-stemLen*0.7, barY, 0.08),
        vec3(barX-stemLen*0.7 - extLen*0.5, barY+0.01, 0.07),
        vec3(barX-stemLen*0.7 - extLen, barY+0.02, 0.06),
      ], spec.tubeR*0.65, 3, 8),
      // Arm pads (small rounded boxes on each side)
    ));
    // Arm pad left
    const padL = buildRoundedBox(0.16, 0.025, 0.06, 0.01, 4);
    meshes.push(translateMesh({ vertices: padL.verts, indices: padL.idxs, materialIndex: MAT_ACCENT }, vec3(barX-stemLen*0.7-0.08, barY-0.01, -0.07)));
    // Arm pad right
    const padR = buildRoundedBox(0.16, 0.025, 0.06, 0.01, 4);
    meshes.push(translateMesh({ vertices: padR.verts, indices: padR.idxs, materialIndex: MAT_ACCENT }, vec3(barX-stemLen*0.7-0.08, barY-0.01, 0.07)));
  } else {
    // TT
    const ttArm = buildSweptTube([vec3(barX-stemLen*0.7,barY,0), vec3(barX-stemLen*0.7-0.12,barY,0), vec3(barX-stemLen*0.7-0.28,barY+0.015,0)], spec.tubeR*0.75, 3, 8);
    meshes.push(mergeMesh(MAT_FRAME, ttArm,
      buildSweptTube([vec3(barX-stemLen*0.7-0.05,barY-0.04,-0.10), vec3(barX-stemLen*0.7-0.05,barY-0.04,0)], spec.tubeR*0.65, 2, 6),
      buildSweptTube([vec3(barX-stemLen*0.7-0.05,barY-0.04,0.10), vec3(barX-stemLen*0.7-0.05,barY-0.04,0)], spec.tubeR*0.65, 2, 6)
    ));
  }

  return meshes;
}

// MTB front suspension fork (thicker blades + crown)
function buildMtbFork(headTubeBot: Vec3, frontAxle: Vec3, forkOffset: number): Mesh[] {
  const meshes: Mesh[] = [];
  const forkMid = vec3((headTubeBot.x + frontAxle.x)/2 + forkOffset, (headTubeBot.y + frontAxle.y)/2 - 0.05, 0);
  // Thick fork blades (suspension lowers)
  meshes.push(mergeMesh(MAT_FRAME,
    buildSweptTube([headTubeBot, forkMid, vec3(frontAxle.x,frontAxle.y,0.028)], TUBE_R_SM*1.8, 4, 10),
    buildSweptTube([headTubeBot, forkMid, vec3(frontAxle.x,frontAxle.y,-0.028)], TUBE_R_SM*1.8, 4, 10)
  ));
  // Suspension crown (horizontal bar connecting fork legs to head tube)
  const crownY = headTubeBot.y - 0.12;
  meshes.push(mergeMesh(MAT_FRAME,
    buildSweptTube([vec3(headTubeBot.x,crownY,-0.03), vec3(headTubeBot.x,crownY,0.03)], TUBE_R*1.2, 2, 10)
  ));
  // Lower fork stanchions (visible cylinders below crown)
  const lower1 = buildCylinder(0.016, 0.016, 0.20, 10, true);
  meshes.push(translateMesh({ vertices: lower1.verts, indices: lower1.idxs, materialIndex: MAT_ACCENT }, vec3(frontAxle.x+0.01, frontAxle.y, 0.028)));
  const lower2 = buildCylinder(0.016, 0.016, 0.20, 10, true);
  meshes.push(translateMesh({ vertices: lower2.verts, indices: lower2.idxs, materialIndex: MAT_ACCENT }, vec3(frontAxle.x+0.01, frontAxle.y, -0.028)));
  return meshes;
}

// ---------------------------------------------------------------------------
// Bike GLB writer — standalone bike (no rider)
// ---------------------------------------------------------------------------

interface BikeGlbSpec {
  name: string;
  frame: FrameSpec;
  wheelTubeR: number;
  spokeCount: number;
  deepRim: boolean;
  materials: GltfMaterial[];
  mtbFork?: boolean;
}

function writeBikeGlb(outputPath: string, spec: BikeGlbSpec): void {
  const bbDrop = spec.frame.bbDrop;
  const bbHeight = WHEEL_RADIUS - bbDrop;
  const rearAxle = vec3(-WHEELBASE/2, WHEEL_RADIUS - bbDrop, 0);
  const frontAxle = vec3(WHEELBASE/2, WHEEL_RADIUS - bbDrop, 0);

  let frameMeshes = buildFrameMeshes(spec.frame);

  // For MTB, replace fork with suspension fork
  if (spec.mtbFork) {
    // Rebuild without fork (fork is part of buildFrameMeshes at index 4)
    // We'll just add MTB fork on top — the regular fork tubes are thin and mostly hidden
    const htBottomX = frontAxle.x - spec.frame.reach;
    const htBottomY = rearAxle.y + bbDrop + (spec.frame.stack - spec.frame.headTubeLen);
    const headTubeBot = vec3(htBottomX, htBottomY, 0);
    const mtbForkMeshes = buildMtbFork(headTubeBot, frontAxle, spec.frame.forkOffset);
    frameMeshes = [...frameMeshes, ...mtbForkMeshes];
  }

  const wheelMeshes = buildWheel(spec.wheelTubeR, spec.spokeCount);
  const deepRimMeshes = spec.deepRim ? buildDeepRimDisc(0.06) : [];
  const allWheelMeshes = [...wheelMeshes, ...deepRimMeshes];

  const crankMeshes = buildCrankMeshes();

  // Group: 0=frame, 1=wheel, 2=crank
  const meshGroups: Mesh[][] = [frameMeshes, allWheelMeshes, crankMeshes];
  const groupNames = ["frame", "wheel", "crank"];

  const allFlat = meshGroups.flat();
  const { buffer: binBuf, accessors, bufferViews, primitives } = packMeshesIntoBuffer(allFlat, spec.materials.length);

  const gltfMeshes: object[] = [];
  let primCursor = 0;
  for (let gi = 0; gi < meshGroups.length; gi++) {
    const groupPrims: object[] = [];
    for (let j = 0; j < meshGroups[gi]!.length; j++) {
      if (primCursor < primitives.length) { groupPrims.push(primitives[primCursor]!); primCursor++; }
    }
    gltfMeshes.push({ name: groupNames[gi], primitives: groupPrims });
  }

  // Node hierarchy
  const nodes: GltfNode[] = [];
  function addNode(n: GltfNode): number { const id = nodes.length; nodes.push(n); return id; }

  const frameId = addNode({ name: "frame", meshIndex: 0, translation: [0, bbHeight, 0] });
  const wfId = addNode({ name: "wheelFront", meshIndex: 1, translation: [frontAxle.x, frontAxle.y + bbHeight, 0] });
  const wrId = addNode({ name: "wheelRear", meshIndex: 1, translation: [rearAxle.x, rearAxle.y + bbHeight, 0] });
  const crankId = addNode({ name: "crank", meshIndex: 2, translation: [0, bbHeight, 0] });
  const rootId = addNode({ name: spec.name, children: [frameId, wfId, wrId, crankId] });

  const gltfJson = buildGltfJson(nodes, rootId, gltfMeshes, accessors, bufferViews, binBuf, spec.materials);
  writeGlbFile(outputPath, gltfJson, binBuf);
}

// ---------------------------------------------------------------------------
// Helmet GLB writers
// ---------------------------------------------------------------------------

function writeHelmetAeroGlb(outputPath: string): void {
  // TT teardrop — elongated sphere squashed sideways
  // Mounted at origin, with the pointed tail going backward (+X in bike coords)
  const materials: GltfMaterial[] = [
    { name: "helmet", baseColorFactor: [0.06, 0.06, 0.08, 1], metallicFactor: 0.15, roughnessFactor: 0.25 },
    { name: "accent", baseColorFactor: [0.05, 0.38, 0.72, 1], metallicFactor: 0.2,  roughnessFactor: 0.55 },
  ];

  const HEAD_R = 0.115;
  // Main teardrop shell: elongated sphere (scale X for length, flatten Z for narrow side profile)
  const shell = buildSphere(HEAD_R, 16, 12);
  let shellMesh: Mesh = { vertices: shell.verts, indices: shell.idxs, materialIndex: 0 };
  // Scale: X=1.8 (long tail), Y=1.0, Z=0.85 (narrow)
  shellMesh = scaleMesh(shellMesh, 1.8, 1.0, 0.85);
  // Shift so front of helmet aligns with head centre
  shellMesh = translateMesh(shellMesh, vec3(HEAD_R*0.3, 0, 0));

  // Visor — thin elongated disc at the face
  const visor = buildRoundedBox(0.06, 0.02, 0.22, 0.008, 6);
  let visorMesh: Mesh = { vertices: visor.verts, indices: visor.idxs, materialIndex: 1 };
  visorMesh = translateMesh(visorMesh, vec3(-HEAD_R*1.2, -HEAD_R*0.3, 0));

  // Chin strap hint (thin swept tube)
  const strap = buildSweptTube([vec3(-HEAD_R*0.9,-HEAD_R*0.6,-HEAD_R*0.5), vec3(-HEAD_R*0.8,-HEAD_R*0.85,0), vec3(-HEAD_R*0.9,-HEAD_R*0.6,HEAD_R*0.5)], 0.006, 3, 6);
  const strapMesh = mergeMesh(1, strap);

  const meshGroups: Mesh[][] = [[shellMesh, visorMesh, strapMesh]];

  writeSingleNodeGlb(outputPath, "helmet", meshGroups, materials);
}

function writeHelmetRoadGlb(outputPath: string): void {
  const materials: GltfMaterial[] = [
    { name: "helmet", baseColorFactor: [0.92, 0.92, 0.94, 1], metallicFactor: 0.05, roughnessFactor: 0.5 },
    { name: "accent", baseColorFactor: [0.05, 0.38, 0.72, 1], metallicFactor: 0.2,  roughnessFactor: 0.55 },
  ];

  const HEAD_R = 0.115;
  // Main shell: rounded box + sphere blend
  const shell = buildSphere(HEAD_R, 16, 12);
  let shellMesh: Mesh = { vertices: shell.verts, indices: shell.idxs, materialIndex: 0 };
  shellMesh = scaleMeshY(shellMesh, 0.80); // slightly flat top

  // Vent panels — recessed elongated slots running front-to-back
  // Represented as thin inset boxes (slightly inside the shell surface)
  const ventMeshes: Mesh[] = [];
  const ventPositions = [
    { z: 0,    yOff: 0.04 },
    { z: 0.04, yOff: 0.02 },
    { z: -0.04, yOff: 0.02 },
  ];
  for (const vp of ventPositions) {
    const vent = buildRoundedBox(0.09, 0.012, 0.022, 0.004, 4);
    let vm: Mesh = { vertices: vent.verts, indices: vent.idxs, materialIndex: 1 };
    vm = translateMesh(vm, vec3(-0.01, HEAD_R*0.72 + vp.yOff, vp.z));
    ventMeshes.push(vm);
  }
  // Rear vent
  const rearVent = buildRoundedBox(0.10, 0.012, 0.06, 0.004, 4);
  let rvm: Mesh = { vertices: rearVent.verts, indices: rearVent.idxs, materialIndex: 1 };
  rvm = translateMesh(rvm, vec3(HEAD_R*0.9, HEAD_R*0.3, 0));
  ventMeshes.push(rvm);

  // Rear retention system (small bump at back)
  const retainer = buildRoundedBox(0.05, 0.03, 0.08, 0.01, 4);
  let retMesh: Mesh = { vertices: retainer.verts, indices: retainer.idxs, materialIndex: 1 };
  retMesh = translateMesh(retMesh, vec3(HEAD_R*1.0, -HEAD_R*0.1, 0));

  const meshGroups: Mesh[][] = [[shellMesh, ...ventMeshes, retMesh]];
  writeSingleNodeGlb(outputPath, "helmet", meshGroups, materials);
}

// ---------------------------------------------------------------------------
// Kit GLB writers (rider body only, different colour palettes)
// ---------------------------------------------------------------------------

// Rider proportions (matching gen-avatar-gltf.ts)
const TORSO_H = 0.52, TORSO_W = 0.22, TORSO_D = 0.14;
const ARM_R = 0.036, LEG_R = 0.044;
const HEAD_R_RIDER = 0.115, NECK_R = 0.047, NECK_H = 0.08;
const FOOT_L = 0.23, FOOT_H = 0.06;

interface KitColours {
  /** Returns materialIndex for a given stripe band index (0..N-1) and total count */
  bandMat: (band: number, total: number) => number;
}

// Build rider body meshes with a given kit material setup
// Returns array of mesh groups: [torso+arms, legs, head+helmet, shoes]
function buildKitRiderMeshes(
  riderReach: number,
  kitMats: number[],    // per-segment materialIndex overrides: [torso, thighR, thighL, shinR, shinL, shoe, helmet, skin, accent]
): Mesh[] {
  const meshes: Mesh[] = [];

  // We use a simplified road-bike-like position
  const saddleX = -Math.sin(0.13)*0.60;
  const saddleY = Math.cos(0.13)*0.60 + 0.06;
  const leanAngle = riderReach * 0.85;
  const hipY = saddleY + 0.05;
  const hipX = saddleX;

  const rightPhase = -Math.PI/2;
  const leftPhase = Math.PI/2;

  function legPoints(phase: number, side: number) {
    const hipPt = vec3(hipX, hipY, side*0.085);
    const crankAngle = phase;
    const anklePt = vec3(0.175*Math.cos(crankAngle), 0.175*Math.sin(crankAngle), side*0.038);
    const mid = scaleV(addV(hipPt, anklePt), 0.5);
    const kneePt = vec3(mid.x-0.05, mid.y, mid.z + side*0.03);
    return { hip: hipPt, knee: kneePt, ankle: anklePt };
  }

  const rightLeg = legPoints(rightPhase, 1);
  const leftLeg = legPoints(leftPhase, -1);

  // Legs
  meshes.push(mergeMesh(kitMats[1]!, buildSweptTube([rightLeg.hip, rightLeg.knee], LEG_R, 3, 10)));
  meshes.push(mergeMesh(kitMats[2]!, buildSweptTube([leftLeg.hip, leftLeg.knee], LEG_R, 3, 10)));
  meshes.push(mergeMesh(kitMats[3]!, buildSweptTube([rightLeg.knee, rightLeg.ankle], LEG_R*0.85, 3, 10)));
  meshes.push(mergeMesh(kitMats[4]!, buildSweptTube([leftLeg.knee, leftLeg.ankle], LEG_R*0.85, 3, 10)));

  // Shoes
  function buildShoe(ankle: Vec3): Mesh {
    const shoe = buildRoundedBox(FOOT_L, FOOT_H, 0.09, 0.018, 6);
    return translateMesh({ vertices: shoe.verts, indices: shoe.idxs, materialIndex: kitMats[5]! }, vec3(ankle.x+0.06, ankle.y-FOOT_H/2, ankle.z));
  }
  meshes.push(buildShoe(rightLeg.ankle));
  meshes.push(buildShoe(leftLeg.ankle));

  // Torso
  const torsoBase = vec3(hipX, hipY+0.06, 0);
  const torsoCx = torsoBase.x - Math.sin(leanAngle)*TORSO_H*0.5;
  const torsoCy = torsoBase.y + Math.cos(leanAngle)*TORSO_H*0.5;
  let torsoMesh: Mesh = { vertices: buildRoundedBox(TORSO_W, TORSO_H, TORSO_D, 0.03, 10).verts, indices: buildRoundedBox(TORSO_W, TORSO_H, TORSO_D, 0.03, 10).idxs, materialIndex: kitMats[0]! };
  torsoMesh = rotateMeshZ(torsoMesh, -leanAngle);
  torsoMesh = translateMesh(torsoMesh, vec3(torsoCx, torsoCy, 0));
  meshes.push(torsoMesh);

  // Neck + head
  const torsoTopX = torsoBase.x - Math.sin(leanAngle)*TORSO_H;
  const torsoTopY = torsoBase.y + Math.cos(leanAngle)*TORSO_H;
  const neckBase = vec3(torsoTopX, torsoTopY, 0);
  const neckTip = vec3(torsoTopX - Math.sin(leanAngle)*0.02, torsoTopY + NECK_H, 0);
  meshes.push(mergeMesh(kitMats[7]!, buildSweptTube([neckBase, neckTip], NECK_R, 2, 8)));

  const headCx = neckTip.x - Math.sin(leanAngle*0.4)*0.04;
  const headCy = neckTip.y + HEAD_R_RIDER + 0.01;
  const headSph = buildSphere(HEAD_R_RIDER, 14, 10);
  meshes.push(translateMesh({ vertices: headSph.verts, indices: headSph.idxs, materialIndex: kitMats[7]! }, vec3(headCx, headCy, 0)));

  // Helmet
  const helmetSph = buildSphere(HEAD_R_RIDER*1.12, 14, 10);
  let helmetMesh: Mesh = { vertices: helmetSph.verts, indices: helmetSph.idxs, materialIndex: kitMats[6]! };
  helmetMesh = scaleMeshY(helmetMesh, 0.82);
  helmetMesh = translateMesh(helmetMesh, vec3(headCx-0.02, headCy+0.02, 0));
  meshes.push(helmetMesh);

  // Arms
  const shoulderY = torsoTopY - 0.06;
  const shoulderX = torsoTopX;
  const shoulderW = TORSO_W*0.6;
  const barX = 0.5/2 - (0.39 + Math.sin(0.11)*0.13) - 0.09*0.7;
  const barY_base = WHEEL_RADIUS - 0.07 + 0.54 + 0.06 - 0.04;

  for (const side of [1,-1]) {
    const shoulder = vec3(shoulderX, shoulderY, side*shoulderW);
    const elbowX = (shoulder.x + barX)/2 - 0.05;
    const elbowY = (shoulder.y + barY_base)/2 - 0.04;
    const elbowZ = side*(Math.abs(shoulder.z)+0.02);
    const elbow = vec3(elbowX, elbowY, elbowZ);
    const barGrip = vec3(barX, barY_base, side*0.16);
    meshes.push(mergeMesh(kitMats[0]!, buildSweptTube([shoulder, elbow], ARM_R, 3, 8)));
    meshes.push(mergeMesh(kitMats[0]!, buildSweptTube([elbow, barGrip], ARM_R*0.85, 3, 8)));
    const hand = buildRoundedBox(0.07, 0.045, 0.06, 0.015, 4);
    meshes.push(translateMesh({ vertices: hand.verts, indices: hand.idxs, materialIndex: kitMats[7]! }, barGrip));
  }

  return meshes;
}

// ---------------------------------------------------------------------------
// Kit: Polka-dot (KOM) — red dots on white jersey
// Build as multi-sub-mesh: white base torso + red dot patches + white bib
// ---------------------------------------------------------------------------

function writeKitPolkaGlb(outputPath: string): void {
  const materials: GltfMaterial[] = [
    { name: "kit",     baseColorFactor: [0.95, 0.95, 0.95, 1], metallicFactor: 0.0, roughnessFactor: 0.85 }, // 0 white base
    { name: "dot",     baseColorFactor: [0.80, 0.06, 0.08, 1], metallicFactor: 0.0, roughnessFactor: 0.85 }, // 1 red dot
    { name: "skin",    baseColorFactor: [0.87, 0.68, 0.52, 1], metallicFactor: 0.0, roughnessFactor: 0.9  }, // 2 skin
    { name: "helmet",  baseColorFactor: [0.95, 0.95, 0.95, 1], metallicFactor: 0.05, roughnessFactor: 0.5 }, // 3 helmet white
    { name: "accent",  baseColorFactor: [0.80, 0.06, 0.08, 1], metallicFactor: 0.2, roughnessFactor: 0.55 }, // 4 red accent
  ];

  // Kit mats: [torso=0(white), thighR=0, thighL=0, shinR=0, shinL=0, shoe=4, helmet=3, skin=2, accent=4]
  const baseMeshes = buildKitRiderMeshes(0.55, [0, 0, 0, 0, 0, 4, 3, 2, 4]);

  // Add polka dots — small spheres embedded slightly on torso surface
  const dotMeshes: Mesh[] = [];
  // torso centre is around (torsoCx, torsoCy, 0) at ~(saddleX - lean, saddle+torso/2, 0)
  // Approximate torso centre
  const dotPositions: Vec3[] = [
    vec3(-0.10, 1.05, 0.08), vec3(-0.10, 1.05, -0.08),
    vec3(-0.10, 1.10, 0.00),
    vec3(-0.13, 0.95, 0.07), vec3(-0.13, 0.95, -0.07),
    vec3(-0.07, 0.95, 0.09),
    vec3(-0.16, 1.00, 0.00),
    vec3(-0.12, 1.20, 0.05), vec3(-0.12, 1.20, -0.05),
  ];
  for (const dp of dotPositions) {
    const dot = buildSphere(0.025, 8, 6);
    dotMeshes.push(translateMesh({ vertices: dot.verts, indices: dot.idxs, materialIndex: 1 }, dp));
  }

  const allMeshes = [...baseMeshes, ...dotMeshes];
  const meshGroups: Mesh[][] = [allMeshes];
  writeSingleNodeGlb(outputPath, "kit-polka", meshGroups, materials);
}

// ---------------------------------------------------------------------------
// Kit: Rainbow stripes (UCI world champion)
// Build torso as 5 horizontal stripe bands (blue, red, black, yellow, green) on white
// ---------------------------------------------------------------------------

function writeKitRainbowGlb(outputPath: string): void {
  // UCI rainbow colours: 5 stripes on white base
  // blue=0, red=1, black=2, yellow=3, green=4, white=5, skin=6, accent=7
  const materials: GltfMaterial[] = [
    { name: "stripe-blue",   baseColorFactor: [0.00, 0.20, 0.70, 1], metallicFactor: 0.0, roughnessFactor: 0.85 },
    { name: "stripe-red",    baseColorFactor: [0.80, 0.06, 0.08, 1], metallicFactor: 0.0, roughnessFactor: 0.85 },
    { name: "stripe-black",  baseColorFactor: [0.05, 0.05, 0.05, 1], metallicFactor: 0.0, roughnessFactor: 0.85 },
    { name: "stripe-yellow", baseColorFactor: [0.95, 0.78, 0.00, 1], metallicFactor: 0.0, roughnessFactor: 0.85 },
    { name: "stripe-green",  baseColorFactor: [0.00, 0.55, 0.15, 1], metallicFactor: 0.0, roughnessFactor: 0.85 },
    { name: "kit-white",     baseColorFactor: [0.95, 0.95, 0.95, 1], metallicFactor: 0.0, roughnessFactor: 0.85 },
    { name: "skin",          baseColorFactor: [0.87, 0.68, 0.52, 1], metallicFactor: 0.0, roughnessFactor: 0.9  },
    { name: "accent",        baseColorFactor: [0.00, 0.20, 0.70, 1], metallicFactor: 0.2, roughnessFactor: 0.55 },
    { name: "helmet",        baseColorFactor: [0.95, 0.95, 0.95, 1], metallicFactor: 0.05, roughnessFactor: 0.5 },
  ];

  // Base rider with white kit
  const baseMeshes = buildKitRiderMeshes(0.55, [5, 5, 5, 5, 5, 7, 8, 6, 7]);

  // Rainbow stripe bands on torso — thin elongated rounded boxes layered across the chest
  // Torso lean: ~0.47 rad, torso centre at roughly (-0.12, 1.06, 0)
  const stripeMeshes: Mesh[] = [];
  const stripeColors = [0, 1, 2, 3, 4]; // blue, red, black, yellow, green
  const torsoAngle = -0.55 * 0.85; // leanAngle for reach=0.55
  const stripeW = TORSO_W * 1.05;
  const stripeD = TORSO_D * 1.05;
  const stripeH = 0.032;
  const torsoCentreX = -Math.sin(0.55*0.85)*TORSO_H*0.5 + (-Math.sin(0.13)*0.60);
  const torsoCentreY = Math.cos(0.55*0.85)*TORSO_H*0.5 + (Math.cos(0.13)*0.60 + 0.06) + 0.06;
  // Spread 5 stripes centred on torso mid-point
  const stripeSpan = stripeH * 5 * 1.1;
  for (let s = 0; s < 5; s++) {
    const tOffset = (s - 2) * stripeH * 1.1; // offset along torso axis
    const stripeBox = buildRoundedBox(stripeW, stripeH, stripeD, 0.005, 4);
    let sm: Mesh = { vertices: stripeBox.verts, indices: stripeBox.idxs, materialIndex: stripeColors[s]! };
    sm = rotateMeshZ(sm, torsoAngle);
    // Translate along lean direction
    const cx = torsoCentreX + Math.sin(torsoAngle) * tOffset * (-1);
    const cy = torsoCentreY + Math.cos(torsoAngle) * tOffset;
    sm = translateMesh(sm, vec3(cx, cy, 0));
    stripeMeshes.push(sm);
  }

  const allMeshes = [...baseMeshes, ...stripeMeshes];
  const meshGroups: Mesh[][] = [allMeshes];
  writeSingleNodeGlb(outputPath, "kit-rainbow", meshGroups, materials);
}

// ---------------------------------------------------------------------------
// Single-node glb writer (helmet + kit files)
// ---------------------------------------------------------------------------

function writeSingleNodeGlb(
  outputPath: string,
  nodeName: string,
  meshGroups: Mesh[][],
  mats: GltfMaterial[]
): void {
  const allFlat = meshGroups.flat();
  const { buffer: binBuf, accessors, bufferViews, primitives } = packMeshesIntoBuffer(allFlat, mats.length);

  const gltfMeshes: object[] = [];
  let primCursor = 0;
  for (let gi = 0; gi < meshGroups.length; gi++) {
    const groupPrims: object[] = [];
    for (let j = 0; j < meshGroups[gi]!.length; j++) {
      if (primCursor < primitives.length) { groupPrims.push(primitives[primCursor]!); primCursor++; }
    }
    gltfMeshes.push({ name: `${nodeName}-mesh-${gi}`, primitives: groupPrims });
  }

  const nodes: GltfNode[] = [];
  const children: number[] = [];
  for (let gi = 0; gi < meshGroups.length; gi++) {
    const id = nodes.length;
    nodes.push({ name: `${nodeName}-part-${gi}`, meshIndex: gi });
    children.push(id);
  }
  const rootId = nodes.length;
  nodes.push({ name: nodeName, children: children.length === 1 ? undefined : children, meshIndex: children.length === 1 ? 0 : undefined });

  const gltfJson = buildGltfJson(nodes, rootId, gltfMeshes, accessors, bufferViews, binBuf, mats);
  writeGlbFile(outputPath, gltfJson, binBuf);
}

// ---------------------------------------------------------------------------
// glTF 2.0 binary packer
// ---------------------------------------------------------------------------

function packMeshesIntoBuffer(allMeshes: Mesh[], _matCount?: number): {
  buffer: Buffer; accessors: object[]; bufferViews: object[]; primitives: object[];
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
    const use32bit = vertCount > 65535;
    const idxBytes = use32bit ? 4 : 2;
    const idxComponentType = use32bit ? 5125 : 5123;

    const idxBufLen = idxCount * idxBytes;
    const idxBuf = Buffer.allocUnsafe(idxBufLen);
    for (let i = 0; i < idxCount; i++) {
      if (use32bit) idxBuf.writeUInt32LE(mesh.indices[i]!, i*4);
      else idxBuf.writeUInt16LE(mesh.indices[i]!, i*2);
    }
    const idxPadded = Math.ceil(idxBufLen/4)*4;
    const idxBufPadded = Buffer.alloc(idxPadded);
    idxBuf.copy(idxBufPadded);

    const idxBvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: idxPadded, target: 34963 });
    byteOffset += idxPadded;
    buffers.push(idxBufPadded);

    const idxAccIdx = accessors.length;
    accessors.push({ bufferView: idxBvIdx, byteOffset: 0, componentType: idxComponentType, count: idxCount, type: "SCALAR" });

    const posData = Buffer.allocUnsafe(vertCount*3*4);
    const norData = Buffer.allocUnsafe(vertCount*3*4);
    const uvData  = Buffer.allocUnsafe(vertCount*2*4);
    let posMin = [Infinity, Infinity, Infinity];
    let posMax = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < vertCount; i++) {
      const v = mesh.vertices[i]!;
      posData.writeFloatLE(v.pos.x, i*12);   posData.writeFloatLE(v.pos.y, i*12+4);   posData.writeFloatLE(v.pos.z, i*12+8);
      norData.writeFloatLE(v.nor.x, i*12);   norData.writeFloatLE(v.nor.y, i*12+4);   norData.writeFloatLE(v.nor.z, i*12+8);
      uvData.writeFloatLE(v.uv.u, i*8);      uvData.writeFloatLE(v.uv.v, i*8+4);
      if (v.pos.x < posMin[0]!) posMin[0] = v.pos.x;
      if (v.pos.y < posMin[1]!) posMin[1] = v.pos.y;
      if (v.pos.z < posMin[2]!) posMin[2] = v.pos.z;
      if (v.pos.x > posMax[0]!) posMax[0] = v.pos.x;
      if (v.pos.y > posMax[1]!) posMax[1] = v.pos.y;
      if (v.pos.z > posMax[2]!) posMax[2] = v.pos.z;
    }

    const posBvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: vertCount*12, target: 34962, byteStride: 12 });
    byteOffset += vertCount*12;
    buffers.push(posData);

    const posAccIdx = accessors.length;
    accessors.push({ bufferView: posBvIdx, byteOffset: 0, componentType: 5126, count: vertCount, type: "VEC3", min: posMin, max: posMax });

    const norBvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: vertCount*12, target: 34962, byteStride: 12 });
    byteOffset += vertCount*12;
    buffers.push(norData);

    const norAccIdx = accessors.length;
    accessors.push({ bufferView: norBvIdx, byteOffset: 0, componentType: 5126, count: vertCount, type: "VEC3" });

    const uvBvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: vertCount*8, target: 34962, byteStride: 8 });
    byteOffset += vertCount*8;
    buffers.push(uvData);

    const uvAccIdx = accessors.length;
    accessors.push({ bufferView: uvBvIdx, byteOffset: 0, componentType: 5126, count: vertCount, type: "VEC2" });

    primitives.push({ attributes: { POSITION: posAccIdx, NORMAL: norAccIdx, TEXCOORD_0: uvAccIdx }, indices: idxAccIdx, material: mesh.materialIndex });
  }

  return { buffer: Buffer.concat(buffers), accessors, bufferViews, primitives };
}

function buildGltfJson(
  nodes: GltfNode[],
  rootId: number,
  gltfMeshes: object[],
  accessors: object[],
  bufferViews: object[],
  binBuf: Buffer,
  materials: GltfMaterial[]
): Record<string, unknown> {
  return {
    asset: { version: "2.0", generator: "GlobeRide gear generator", copyright: "MIT" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [rootId] }],
    nodes: nodes.map(n => {
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
    materials: materials.map(m => ({
      name: m.name,
      doubleSided: m.doubleSided ?? false,
      pbrMetallicRoughness: {
        baseColorFactor: m.baseColorFactor,
        metallicFactor: m.metallicFactor,
        roughnessFactor: m.roughnessFactor,
      },
    })),
  };
}

function writeGlbFile(outputPath: string, gltfJson: Record<string, unknown>, binBuf: Buffer): void {
  const jsonStr = JSON.stringify(gltfJson);
  const jsonPadLen = Math.ceil(jsonStr.length/4)*4;
  const jsonBuf = Buffer.alloc(jsonPadLen, 0x20);
  Buffer.from(jsonStr, "utf8").copy(jsonBuf);

  const binPadLen = Math.ceil(binBuf.byteLength/4)*4;
  const binBufPadded = Buffer.alloc(binPadLen);
  binBuf.copy(binBufPadded);

  const totalLen = 12 + 8 + jsonPadLen + 8 + binPadLen;
  const out = Buffer.alloc(totalLen);
  let offset = 0;
  out.writeUInt32LE(0x46546C67, offset); offset += 4;
  out.writeUInt32LE(2, offset);          offset += 4;
  out.writeUInt32LE(totalLen, offset);   offset += 4;
  out.writeUInt32LE(jsonPadLen, offset); offset += 4;
  out.writeUInt32LE(0x4E4F534A, offset); offset += 4;
  jsonBuf.copy(out, offset);             offset += jsonPadLen;
  out.writeUInt32LE(binPadLen, offset);  offset += 4;
  out.writeUInt32LE(0x004E4942, offset); offset += 4;
  binBufPadded.copy(out, offset);

  fs.writeFileSync(outputPath, out);
  console.log(`Wrote ${outputPath} (${(out.byteLength/1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gearDir = path.resolve(__dirname, "../public/models/gear");
fs.mkdirSync(gearDir, { recursive: true });

// ---- Bike: Aero ----
writeBikeGlb(path.join(gearDir, "bike-aero.glb"), {
  name: "bike-aero",
  frame: {
    bbDrop: 0.065,
    seatTubeAngle: 0.20,
    headTubeAngle: 0.08,
    headTubeLen: 0.09,
    reach: 0.44,
    stack: 0.50,
    forkOffset: 0.04,
    tubeR: TUBE_R,
    tubeRSm: TUBE_R_SM,
    barType: "aero",
    barHeight: 0.02,
  },
  wheelTubeR: 0.022,
  spokeCount: 18,  // fewer spokes = aero look
  deepRim: true,
  materials: [
    { name: "frame",  baseColorFactor: [0.04, 0.04, 0.05, 1], metallicFactor: 0.8,  roughnessFactor: 0.25 }, // matte carbon black
    { name: "wheel",  baseColorFactor: [0.06, 0.06, 0.07, 1], metallicFactor: 0.5,  roughnessFactor: 0.4  }, // dark carbon rim
    { name: "accent", baseColorFactor: [0.05, 0.38, 0.72, 1], metallicFactor: 0.3,  roughnessFactor: 0.45 }, // blue accent
  ],
});

// ---- Bike: Climbing ----
writeBikeGlb(path.join(gearDir, "bike-climbing.glb"), {
  name: "bike-climbing",
  frame: {
    bbDrop: 0.07,
    seatTubeAngle: 0.13,
    headTubeAngle: 0.11,
    headTubeLen: 0.13,
    reach: 0.39,
    stack: 0.54,
    forkOffset: 0.045,
    tubeR: TUBE_R * 0.82,      // thin tubes = lightweight look
    tubeRSm: TUBE_R_SM * 0.80,
    barType: "drop",
    barHeight: -0.04,
  },
  wheelTubeR: 0.020,   // slightly narrower tire
  spokeCount: 24,
  deepRim: false,
  materials: [
    { name: "frame",  baseColorFactor: [0.93, 0.93, 0.95, 1], metallicFactor: 0.1,  roughnessFactor: 0.45 }, // white
    { name: "wheel",  baseColorFactor: [0.08, 0.08, 0.09, 1], metallicFactor: 0.4,  roughnessFactor: 0.6  }, // dark rim
    { name: "accent", baseColorFactor: [0.00, 0.85, 0.85, 1], metallicFactor: 0.2,  roughnessFactor: 0.5  }, // cyan accent
  ],
});

// ---- Bike: MTB ----
writeBikeGlb(path.join(gearDir, "bike-mtb.glb"), {
  name: "bike-mtb",
  frame: {
    bbDrop: 0.04,              // lower BB drop = slacker
    seatTubeAngle: 0.12,
    headTubeAngle: 0.08,       // slack head angle
    headTubeLen: 0.16,
    reach: 0.38,
    stack: 0.60,               // taller stack
    forkOffset: 0.05,
    tubeR: TUBE_R * 1.15,      // beefier tubes
    tubeRSm: TUBE_R_SM * 1.1,
    barType: "flat",
    barHeight: 0.04,           // risers
  },
  wheelTubeR: 0.035,           // fat tires
  spokeCount: 32,
  deepRim: false,
  mtbFork: true,
  materials: [
    { name: "frame",  baseColorFactor: [0.70, 0.25, 0.02, 1], metallicFactor: 0.15, roughnessFactor: 0.55 }, // orange
    { name: "wheel",  baseColorFactor: [0.06, 0.06, 0.06, 1], metallicFactor: 0.3,  roughnessFactor: 0.7  }, // black tire
    { name: "accent", baseColorFactor: [0.06, 0.06, 0.06, 1], metallicFactor: 0.6,  roughnessFactor: 0.3  }, // black accent
  ],
});

// ---- Helmets ----
writeHelmetAeroGlb(path.join(gearDir, "helmet-aero.glb"));
writeHelmetRoadGlb(path.join(gearDir, "helmet-road.glb"));

// ---- Kits ----
writeKitPolkaGlb(path.join(gearDir, "kit-polka.glb"));
writeKitRainbowGlb(path.join(gearDir, "kit-rainbow.glb"));

console.log("Done — all gear assets written to public/models/gear/");
