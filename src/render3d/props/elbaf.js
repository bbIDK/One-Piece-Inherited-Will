// Elbaph's landmarks (data/islands/newWorld2.js; the Sun World itself is a
// plate: world/drums.js, render3d/plates3d.js):
//  * Treasure Tree Adam, standing up through the middle of the Sun World:
//    a trunk thirty metres through, ridged bark, buttress roots spread over
//    the plate round it, limbs climbing to its upper canopies — the Heaven
//    World — tier on tier of leaves, smaller as they go up, clouds caught in
//    them;
//  * the spires of rock standing round its foot in the Underworld and out in
//    the sea, snow on their ledges;
//  * the great roots reaching down out of the shade under the canopy into
//    the Underworld's snow.
import * as THREE from 'three';
import { Mesher, radial, capColor } from './kit.js';
import { meshOf, bindCtx, vcMat } from './mats.js';
import { model } from './street.js';
import { registerPropBuilder } from '../registry.js';
import { ADAM } from '../../world/objects.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });
const hash = (i, s) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

const BARK = new THREE.Color('#6e4c33'), BARK_DK = new THREE.Color('#47301f'), BARK_HI = new THREE.Color('#8a6444'), MOSS = new THREE.Color('#556b34');
const LEAF_HI = new THREE.Color('#72c459'), LEAF = new THREE.Color('#4c9e44'), LEAF_LO = new THREE.Color('#2b6230');
const CLOUD = new THREE.Color('#f6f8fb'), CLOUD_LO = new THREE.Color('#cfd8e3');
const ROCK = new THREE.Color('#58616b'), ROCK_HI = new THREE.Color('#6e7883'), SNOW = new THREE.Color('#eef3f8');

/**
 * A tube along `pts` ([x, y, z]…) whose radius goes `radii` (one per point),
 * `seg` round: the trunk's limbs and roots.
 */
function sweep(pts, radii, seg = 8) {
  const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const pos = [], nor = [], idx = [];
  let n0 = null;
  const up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < P.length; i++) {
    t.copy(P[Math.min(P.length - 1, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
    // (a frame carried along the tube, so it doesn't twist)
    if (!n0) { n0 = Math.abs(t.dot(up)) > 0.9 ? new THREE.Vector3(1, 0, 0) : up.clone(); }
    a.copy(n0).sub(q.copy(t).multiplyScalar(n0.dot(t))).normalize();
    n0.copy(a);
    b.crossVectors(t, a).normalize();
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const nx = a.x * c + b.x * s, ny = a.y * c + b.y * s, nz = a.z * c + b.z * s;
      pos.push(P[i].x + nx * radii[i], P[i].y + ny * radii[i], P[i].z + nz * radii[i]);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < P.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const p0 = i * (seg + 1) + j, p1 = p0 + seg + 1;
      idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------ Treasure Tree Adam
/** The trunk's radius `y` metres up from the plate (before its ridges). */
const trunkR = (y) => (y < 0 ? ADAM.trunk + 9 : y < 10 ? ADAM.trunk + 9 * (1 - y / 10) ** 2 : y < 200 ? ADAM.trunk - (y - 10) * 0.085 : 14);

/** The trunk: ridged bark, darker in its grooves, moss low down, twisting a little as it climbs. */
function trunkGeo() {
  const SEG = 56, ys = [];
  for (let y = -4; y <= 214; y += y < 12 ? 2 : 9) ys.push(y);
  const pos = [], nor = [], idx = [];
  ys.forEach((y) => {
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      const ridge = 0.08 * Math.sin(th * 11 + y * 0.012) + 0.035 * Math.sin(th * 23 - y * 0.03) + 0.02 * Math.sin(th * 5 + y * 0.05);
      const r = trunkR(y) * (1 + ridge);
      pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
      nor.push(Math.cos(th), 0.05, Math.sin(th));
    }
  });
  for (let i = 0; i < ys.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j, b = a + SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// the canopies of the Heaven World: [height over the plate, radius, blob radius, how flat]
const TIERS = [[84, 128, 27, 0.4], [126, 92, 23, 0.42], [162, 58, 18, 0.46], [190, 28, 14, 0.55]];

const adamWood = () => model('adamtree-wood', (k) => {
  const tmp = new THREE.Color();
  // the trunk
  k.add(trunkGeo(), {
    color: (p, n) => {
      // (grooves darker — the radius under its mean — moss low down, the ridges catching the light)
      const r = Math.hypot(p.x, p.z), m = trunkR(p.y);
      const g = Math.max(0, Math.min(1, (r / m - 0.94) / 0.14));
      tmp.copy(BARK_DK).lerp(BARK_HI, g);
      if (p.y < 26) tmp.lerp(MOSS, (1 - p.y / 26) * 0.45);
      return tmp;
    },
    outline: 0.35,
  });
  // the buttress roots over the plate (where they stand: world/objects.js ADAM)
  for (const [a, len, r0] of ADAM.roots) {
    const c = Math.cos(a), s = Math.sin(a), pts = [], radii = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, d = ADAM.trunk - 4 + (len + 6) * t;
      const h = 9 * (1 - t) ** 1.6 + r0 * 0.25 - t * r0 * 0.5;
      pts.push([c * d, h, s * d]);
      radii.push(r0 * (1 - t * 0.78));
    }
    k.add(sweep(pts, radii, 9), { color: (p) => tmp.copy(BARK).lerp(MOSS, p.y < 3 ? 0.35 : 0.1), outline: 0.18 });
  }
  // the limbs: up from the trunk and out under each tier
  TIERS.slice(0, 3).forEach(([ty, R], ti) => {
    const n = [7, 6, 5][ti];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ti * 0.7, c = Math.cos(a), s = Math.sin(a);
      const y0 = ty - 34, r0 = trunkR(y0) - 3;
      const pts = [[c * r0, y0, s * r0], [c * (r0 + R * 0.25), y0 + 12, s * (r0 + R * 0.25)], [c * R * 0.55, ty - 9, s * R * 0.55], [c * R * 0.82, ty - 4, s * R * 0.82]];
      k.add(sweep(pts, [7.5 - ti, 5.5 - ti, 3.8 - ti * 0.6, 2.2 - ti * 0.4], 8), { color: BARK, outline: 0.2 });
    }
  });
});

const adamLeaves = () => model('adamtree-leaves', (k) => {
  const tmp = new THREE.Color();
  TIERS.forEach(([ty, R, br, sq], ti) => {
    const y0 = ty - br * sq, y1 = ty + br * sq * 1.6;
    const nf = radial(0, ty - br * 1.5, 0, 0.18);
    const blob = (x, y, z, r, i) => k.add(new THREE.DodecahedronGeometry(r, 1), {
      at: [x, y, z], rot: [hash(i, ti) * 3, hash(i, ti + 1) * 3, hash(i, ti + 2) * 3], scale: [1, sq, 1],
      color: (p) => tmp.copy(LEAF_LO).lerp(LEAF, Math.min(1, Math.max(0, (p.y - y0) / (y1 - y0)))).lerp(LEAF_HI, Math.max(0, Math.min(1, (p.y - ty) / (br * sq)))),
      normals: nf, outline: 0.3,
    });
    // a ring round the rim, an inner ring, a crown in the middle
    const outer = Math.max(6, Math.round((2 * Math.PI * R) / (br * 1.25)));
    for (let i = 0; i < outer; i++) {
      const a = (i / outer) * Math.PI * 2 + hash(i, 40 + ti) * 0.2, rr = R * (0.86 + hash(i, 41 + ti) * 0.14);
      blob(Math.cos(a) * rr, ty + (hash(i, 42 + ti) - 0.5) * br * 0.5, Math.sin(a) * rr, br * (0.85 + hash(i, 43 + ti) * 0.3), i);
    }
    const inner = Math.max(3, Math.round(outer * 0.5));
    for (let i = 0; i < inner; i++) {
      const a = (i / inner) * Math.PI * 2 + 0.4, rr = R * 0.48;
      blob(Math.cos(a) * rr, ty + br * 0.35, Math.sin(a) * rr, br * 1.1, 100 + i);
    }
    blob(0, ty + br * 0.55, 0, br * 1.2, 200);
  });
  // clouds caught in the Heaven World
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + hash(i, 70), ti = 1 + (i % 2), [ty, R] = TIERS[ti];
    const rr = R * (0.95 + hash(i, 71) * 0.35), y = ty - 8 + hash(i, 72) * 16, r = 11 + hash(i, 73) * 9;
    for (let j = 0; j < 3; j++) {
      const ox = (j - 1) * r * 0.9, x = Math.cos(a) * rr - Math.sin(a) * ox, z = Math.sin(a) * rr + Math.cos(a) * ox;
      k.add(new THREE.IcosahedronGeometry(r * (j === 1 ? 1 : 0.75), 1), { at: [x, y + (j === 1 ? 2 : 0), z], scale: [1, 0.55, 1], color: (p) => tmp.copy(CLOUD_LO).lerp(CLOUD, Math.min(1, Math.max(0, (p.y - y + r * 0.4) / (r * 0.9)))), normals: radial(x, y - r, z, 0.3) });
    }
  }
});

reg('adamtree', () => {
  const root = new THREE.Group();
  root.name = 'adamtree';
  const wood = meshOf(adamWood());
  // (the canopies cast no shadow: the Sun World under them is sunny)
  const leaves = new THREE.Mesh(adamLeaves(), vcMat());
  leaves.castShadow = false; leaves.receiveShadow = true;
  root.add(wood, leaves);
  root.userData.founded = true;
  return root;
});

// ------------------------------------------------------------ spires
/** A spire of rock: a stack of jagged courses leaning and narrowing to a point, snow on its ledges. */
reg('spire', (o) => {
  const H = o.h || 24, R = o.r || 4.5, seed = o.seed || 1;
  const geo = model(`spire:${Math.round(H)}:${Math.round(R * 2)}:${Math.round(seed)}`, (k) => {
    const n = 6 + Math.floor(hash(1, seed) * 3);
    let y = -6, x = 0, z = 0, r = R * 1.25;
    const col = capColor(ROCK, SNOW, 0.62);
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n, h = (H + 6) / n * (0.8 + hash(i, seed + 2) * 0.4);
      const r1 = Math.max(0.35, R * (1 - t) ** 0.85 * (0.85 + hash(i, seed + 3) * 0.3));
      const nx = x + (hash(i, seed + 4) - 0.5) * R * 0.35, nz = z + (hash(i, seed + 5) - 0.5) * R * 0.35;
      k.add(new THREE.CylinderGeometry(r1, r, h, 6, 1), { at: [(x + nx) / 2, y + h / 2, (z + nz) / 2], rot: [(nz - z) / h * 0.6, hash(i, seed + 6) * 3, -(nx - x) / h * 0.6], color: i % 2 ? col : capColor(ROCK_HI, SNOW, 0.62), flat: true, outline: 0.1 });
      // (a ledge now and then, snow lying on it)
      if (i < n - 2 && hash(i, seed + 7) < 0.45) k.add(new THREE.CylinderGeometry(r1 * 1.25, r1 * 1.05, 0.9, 6, 1), { at: [nx, y + h, nz], rot: [0, hash(i, seed + 8) * 3, 0], color: capColor(ROCK, SNOW, 0.3), flat: true, outline: 0.06 });
      y += h; x = nx; z = nz; r = r1;
    }
    k.add(new THREE.ConeGeometry(Math.max(0.3, r), 2.5 + hash(9, seed) * 2, 6), { at: [x, y + 1.2, z], color: SNOW, flat: true, outline: 0.06 });
    // rocks fallen at its foot
    for (let i = 0; i < 4; i++) {
      const a = hash(i, seed + 11) * Math.PI * 2, d = R * (1.1 + hash(i, seed + 12) * 0.5);
      k.add(new THREE.DodecahedronGeometry(R * (0.25 + hash(i, seed + 13) * 0.2), 0), { at: [Math.cos(a) * d, 0, Math.sin(a) * d], color: col, flat: true, outline: 0.05 });
    }
  });
  const m = meshOf(geo);
  m.userData.founded = true;
  return m;
});

// ------------------------------------------------------------ the great roots
/**
 * A root reaching down out of the shade under the canopy: from high up in
 * it (`o.H` the plate's height) arching out and down into the snow, a
 * smaller root splitting off near the ground. Heights are the world's own
 * (the ground under it from the terrain), so it meets the land wherever it
 * comes down.
 */
reg('adamroot', (o, ctx) => {
  const g = (z) => ctx.ground(o.x + Math.sin(o.yaw) * z, o.y + Math.cos(o.yaw) * z);
  const H = o.H || 60, s = o.seed || 0;
  const k = new Mesher();
  const side = (hash(1, s) - 0.5) * 3;
  const pts = [[0, H - 16, -14.5], [side * 0.3, H - 24, -10], [side * 0.6, (H - 24 + g(-2)) * 0.5, -3.5], [side, g(3) + 6, 3], [side * 0.8, g(9) + 1.2, 9], [side * 0.5, g(14) - 0.4, 14], [side * 0.3, g(19) - 1.6, 19.5]];
  const tmp = new THREE.Color(), g10 = g(10);
  // (snow lying along its top where it comes down low; the bark lighter higher up)
  const color = (p, n) => (n.y > 0.6 && p.y < H - 30 ? SNOW : tmp.copy(BARK_DK).lerp(BARK, Math.min(1, Math.max(0, (p.y - g10) / 30))));
  k.add(sweep(pts, [5.2, 4.6, 4.0, 3.2, 2.5, 1.8, 1.0], 9), { color, outline: 0.15 });
  // (a smaller one splitting off)
  const sx = side + (hash(2, s) < 0.5 ? -1 : 1) * 4;
  k.add(sweep([[side * 0.7, g(2) + 10, 0], [sx, g(7) + 3, 6], [sx * 1.3, g(11) + 0.2, 11], [sx * 1.5, g(14) - 1.2, 14]], [2.2, 1.7, 1.1, 0.6], 7), { color, outline: 0.1 });
  const m = new THREE.Mesh(k.build(false), vcMat());
  m.castShadow = true; m.receiveShadow = true;
  m.rotation.y = o.yaw;
  const root = new THREE.Group();
  root.add(m);
  root.userData.noGround = true;
  return root;
});
