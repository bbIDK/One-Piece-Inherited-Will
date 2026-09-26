// Trees, bushes and rocks: low-poly cel-shaded models, instanced per 32 m cell
// (see instancer.js). Each species is a handful of shared geometries; the
// leaves are vertex-coloured grey and recoloured per instance with the 2D
// palette (tint), so four colour variants cost nothing. Canopies use normals
// radiating from the crown, so the toon ramp paints them like one soft mass,
// and a baked inverted-hull outline gives the anime ink line.
// Fruit trees carry their fruit as a separate instanced part that is hidden
// while the tree is picked.
import * as THREE from 'three';
import { Mesher, cyl, cone, box, ribbon, tube, slab, C, shade, hash, rng, radial, KIT } from './kit.js';
import { instanced, setPartVisible } from './instancer.js';
import { registerPropBuilder } from '../registry.js';
import { fruitOf, fruitSpots, isPicked } from '../../world/fruitTrees.js';
import { T, CLIMATE } from '../../world/tiles.js';

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const GEO = new Map();
/** Build a model once (and its outline-free far variant, kept in geometry.userData.far). */
function cached(key, fn) {
  let g = GEO.get(key);
  if (!g) {
    g = fn();
    if (!KIT.noOutline) {
      KIT.noOutline = true;
      let f;
      try { f = fn(); } finally { KIT.noOutline = false; }
      const ng = g.isBufferGeometry ? g : g.geo, fg = f.isBufferGeometry ? f : f.geo;
      fg.userData.shared = true;
      ng.userData.far = fg;
    }
    GEO.set(key, g);
  }
  return g;
}
const lin = (v) => new THREE.Color(v, v, v);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const TREE_COLORS = {
  oak: ['#3f9a3a', '#4aa843', '#378f35', '#52b04a'],
  autumn: ['#d35400', '#e67e22', '#c0392b', '#f39c12'],
  sakura: ['#f8b4cf', '#f5a3c4', '#fbc6dc', '#f29bbf'],
  blossom: ['#f7d6e4', '#fff0f6', '#fde2ec', '#f9cfe0'],
  jungle: ['#2e8b3a', '#237a33', '#3a9e45', '#1f6f2e'],
  spooky: ['#4b3b5b', '#3c3050', '#56466a', '#352a47'],
  cottoncandy: ['#f8a5c2', '#9ad0f5', '#f7c1d9', '#b8e0f7'],
  cloudtree: ['#ffffff', '#f4f8ff', '#eef4ff', '#ffffff'],
  pine: ['#2d6a4f', '#2f7352', '#28604a', '#327a56'],
  palm: ['#37b24d', '#2f9e44', '#40c057', '#35a84a'],
  bamboo: ['#8bc34a', '#7cb342', '#9ccc65', '#8bc34a'],
  coral: ['#ff7675', '#fd79a8', '#fdcb6e', '#a29bfe'],
  lollipop: ['#e74c3c', '#9b59b6', '#3498db', '#f39c12'],
  kelp: ['#27ae60', '#229954', '#2ecc71', '#1e8449'],
  cactus: ['#3f8f3f', '#468f3c', '#3a8a45', '#4b9a42'],
};
const TRUNK = { oak: '#6d4c33', autumn: '#6d4c33', sakura: '#5a3d2b', blossom: '#6d4c33', jungle: '#6b4f36', cottoncandy: '#f5f5f5', cloudtree: '#c8d6e5', spooky: '#3b2f3f' };

// ------------------------------------------------------------ building blocks

/** Leafy blobs sharing one crown: grey vertex colours (tinted per instance), radial normals, outline. */
function crown(k, blobs, c, { lo = 0.62, hi = 1.12, outline = 0.045, squash = 1 } = {}) {
  let y0 = Infinity, y1 = -Infinity;
  for (const b of blobs) { y0 = Math.min(y0, b[1] - b[3] * squash); y1 = Math.max(y1, b[1] + b[3] * squash); }
  const nf = radial(c[0], c[1], c[2], 0.12);
  const tmp = new THREE.Color();
  blobs.forEach(([x, y, z, r, f = 1], i) => {
    k.add(new THREE.DodecahedronGeometry(r, 0), {
      at: [x, y, z], rot: [hash(i, 1) * 3, hash(i, 2) * 3, hash(i, 3) * 3], scale: [1, squash, 1],
      color: (p) => { const v = (lo + (hi - lo) * clamp01((p.y - y0) / (y1 - y0))) * f; return tmp.setRGB(v, v, v); },
      tint: 1, normals: nf, outline,
    });
  });
}

/** Where a ray from `c` along `d` leaves the crown blobs (for hanging fruit and petals). */
function crownPoint(blobs, c, d, inset = 0.86, squash = 1) {
  let best = 0;
  for (const [x, y, z, r] of blobs) {
    const ox = c[0] - x, oy = (c[1] - y) / squash, oz = c[2] - z;
    const dy = d[1] / squash;
    const a = d[0] * d[0] + dy * dy + d[2] * d[2];
    const b = ox * d[0] + oy * dy + oz * d[2];
    const cc = ox * ox + oy * oy + oz * oz - (r * inset) ** 2;
    const disc = b * b - a * cc;
    if (disc < 0) continue;
    const t = (-b + Math.sqrt(disc)) / a;
    if (t > best) best = t;
  }
  return [c[0] + d[0] * best, c[1] + d[1] * best, c[2] + d[2] * best];
}

/** A cylinder from point a to point b. */
function limb(k, a, b, r0, r1, seg, o) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  d.normalize();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Quaternion().setFromUnitVectors(UP, d), ONE);
  k.save(); k.transform(m);
  k.add(cyl(r1, r0, len, seg, o.open !== false), o);
  k.restore();
}

/** Recursive bare branches (dead trees, coral, spooky trees). */
function branches(k, R, pos, dir, len, r, depth, o, tips) {
  const end = pos.clone().addScaledVector(dir, len);
  limb(k, pos.toArray(), end.toArray(), r, r * 0.66, o.seg || 5, o);
  if (depth <= 0) { tips?.push(end); return; }
  const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
  side.applyAxisAngle(dir, R() * Math.PI * 2);
  for (let i = 0; i < 2; i++) {
    const nd = dir.clone().applyAxisAngle(side, (i ? 1 : -1) * (o.spread || 0.55) * (0.7 + R() * 0.6));
    nd.y += o.lift || 0.15;
    nd.normalize();
    branches(k, R, end, nd, len * (o.shrink || 0.7), r * 0.64, depth - 1, o, tips);
  }
}

const trunkColor = (col, h) => {
  const a = C(shade(col, -0.35)), b = C(col), tmp = new THREE.Color();
  return (p) => tmp.copy(a).lerp(b, clamp01(p.y / h));
};

// ------------------------------------------------------------ species models
// Each returns { geo, sway, tint: true, crown: { blobs, c, squash } (for fruit), top } .

const BROAD = {
  // round oak crown
  0: { trunkH: 2.5, c: [0.05, 3.55, 0], blobs: [[0, 3.75, 0, 1.25], [0.95, 3.3, 0.3, 0.95, 0.92], [-0.85, 3.35, -0.25, 1.0, 0.9], [0.2, 3.25, -0.95, 0.9, 0.86], [-0.15, 3.3, 0.95, 0.92, 0.95]] },
  // taller crown
  1: { trunkH: 2.8, c: [0, 4.0, 0], blobs: [[0, 4.1, 0, 1.1], [0.72, 3.6, 0.35, 0.86, 0.92], [-0.7, 3.65, -0.2, 0.9, 0.88], [0.05, 3.55, -0.78, 0.8, 0.86], [0, 4.85, 0.05, 0.78, 1.04]] },
};

function broadleaf(sub, variant) {
  return cached(`tree:broad:${sub}:${variant}`, () => {
    const k = new Mesher();
    const S = BROAD[variant];
    const tc = TRUNK[sub] || TRUNK.oak;
    const H = S.trunkH;
    k.add(cyl(0.2, 0.36, 0.45, 7, true), { color: trunkColor(tc, 3), outline: 0.03 });
    k.add(cyl(0.12, 0.2, H, 7, true), { at: [0, 0.35, 0], rot: [0, 0, 0.04], color: trunkColor(tc, 3), outline: 0.03 });
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4;
      limb(k, [0, H * 0.8, 0], [Math.cos(a) * 0.75, H + 0.45, Math.sin(a) * 0.75], 0.08, 0.04, 5, { color: tc });
    }
    crown(k, S.blobs, S.c, { outline: 0.045 });
    if (sub === 'cloudtree' || sub === 'cottoncandy') {
      // fluffy puffs under the crown
      crown(k, [[0.6, S.c[1] - 0.9, 0.5, 0.5, 0.9], [-0.55, S.c[1] - 0.85, -0.45, 0.48, 0.9]], S.c, { outline: 0.03 });
    }
    return { geo: k.build(), sway: true, crown: S };
  });
}

const WIDE = { trunkH: 1.5, c: [0.25, 3.05, 0], squash: 0.78, blobs: [[0.25, 3.2, 0, 1.2], [1.3, 2.95, 0.4, 0.92, 0.94], [-0.8, 3.0, -0.3, 0.95, 0.9], [0.45, 2.9, -1.05, 0.86, 0.88], [0.05, 2.95, 1.05, 0.9, 0.96], [0.4, 3.75, 0.1, 0.7, 1.05]] };

function blossomTree(sub, variant) {
  return cached(`tree:wide:${sub}:${variant}`, () => {
    const k = new Mesher();
    const tc = TRUNK[sub];
    const tcol = trunkColor(tc, 2.5);
    k.add(cyl(0.18, 0.32, 0.4, 7, true), { color: tcol, outline: 0.03 });
    // a crooked trunk in two bends
    limb(k, [0, 0.3, 0], [0.35, 1.6, 0.05], 0.2, 0.15, 7, { color: tcol, outline: 0.03 });
    limb(k, [0.35, 1.55, 0.05], [0.1, 2.6, -0.1], 0.15, 0.1, 6, { color: tcol, outline: 0.03 });
    limb(k, [0.3, 1.5, 0.05], [1.2, 2.4, 0.3], 0.1, 0.05, 5, { color: tc });
    limb(k, [0.2, 2.1, 0], [-0.7, 2.7, -0.3], 0.08, 0.04, 5, { color: tc });
    crown(k, WIDE.blobs, WIDE.c, { squash: WIDE.squash, outline: 0.045 });
    // petals: little white flecks on the crown
    const R = rng(7 + variant);
    for (let i = 0; i < 12; i++) {
      const a = R() * Math.PI * 2, e = (R() - 0.3) * 0.9;
      const p = crownPoint(WIDE.blobs, WIDE.c, [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], 0.97, WIDE.squash);
      k.add(new THREE.TetrahedronGeometry(0.09, 0), { at: p, rot: [R() * 3, R() * 3, 0], color: '#ffffff' });
    }
    return { geo: k.build(), sway: true, crown: WIDE };
  });
}

const JUNGLE = { c: [0, 5.0, 0], squash: 0.62, blobs: [[0, 5.2, 0, 1.6], [1.45, 4.85, 0.3, 1.2, 0.92], [-1.35, 4.9, -0.4, 1.25, 0.9], [0.2, 4.8, -1.4, 1.1, 0.86], [-0.2, 4.85, 1.35, 1.15, 0.95]] };

function jungleTree(variant) {
  return cached(`tree:jungle:${variant}`, () => {
    const k = new Mesher();
    const tc = TRUNK.jungle;
    const tcol = trunkColor(tc, 4);
    k.add(cyl(0.2, 0.3, 4.6, 7, true), { color: tcol, outline: 0.035 });
    // buttress roots
    for (let i = 0; i < 4; i++) {
      k.save(); k.rotateY(i * Math.PI / 2 + 0.4 + variant * 0.3);
      k.add(slab([[0.1, 0], [0.9, 0], [0.1, 1.3]], 0.12), { rot: [0, Math.PI / 2, 0], color: shade(tc, -0.15), outline: 0.02 });
      k.restore();
    }
    crown(k, JUNGLE.blobs, JUNGLE.c, { squash: JUNGLE.squash, outline: 0.05 });
    // hanging vines
    const R = rng(3 + variant);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + R(), rr = 0.9 + R() * 0.6;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const pts = [];
      for (let s = 0; s <= 4; s++) pts.push([x + Math.sin(s * 1.3 + i) * 0.08, 4.5 - s * 0.55, z, 0.05]);
      k.add(ribbon(pts, { side: [Math.cos(a + 1.57), 0, Math.sin(a + 1.57)] }), { color: '#1e6b2a', double: true });
    }
    return { geo: k.build(), sway: true, crown: JUNGLE };
  });
}

function pineTree(snow, variant) {
  return cached(`tree:pine:${snow ? 1 : 0}:${variant}`, () => {
    const k = new Mesher();
    k.add(cyl(0.1, 0.2, 1.8, 6, true), { color: trunkColor('#5d4030', 2), outline: 0.03 });
    const tiers = variant ? 5 : 4;
    const tmp = new THREE.Color();
    for (let i = 0; i < tiers; i++) {
      const y = 0.9 + i * (variant ? 0.95 : 1.1);
      const r = (variant ? 1.45 : 1.6) - i * (variant ? 0.24 : 0.3);
      const h = 1.9 - i * 0.16;
      const g = cone(r, h, 12, false, 1);
      // jagged branch tips: every other rim vertex pulled in and lifted
      const P = g.attributes.position;
      for (let v = 0; v < P.count; v++) {
        if (Math.abs(P.getY(v)) > 1e-4) continue;
        const a = Math.atan2(P.getZ(v), P.getX(v));
        const seg = Math.round((a / (Math.PI * 2)) * 12 + 12) % 2;
        if (seg && Math.hypot(P.getX(v), P.getZ(v)) > 1e-3) { P.setX(v, P.getX(v) * 0.8); P.setZ(v, P.getZ(v) * 0.8); P.setY(v, 0.12); }
      }
      g.computeVertexNormals();
      const lo = 0.62 + i * 0.05, hi = 1.0;
      k.add(g, { at: [0, y, 0], color: (p) => { const t = clamp01((p.y - y) / h); const v = lo + (hi - lo) * t; return tmp.setRGB(v, v, v); }, tint: 1, outline: 0.04 });
      if (snow) {
        const q = 0.52;
        const cap = cone(r * q * 1.07, h * q, 12, true);
        const CP = cap.attributes.position;
        for (let v = 0; v < CP.count; v++) if (Math.abs(CP.getY(v)) < 1e-4 && (v % 2)) CP.setY(v, -0.07);
        cap.computeVertexNormals();
        k.add(cap, { at: [0, y + h * (1 - q) + 0.02, 0], color: '#f4f9ff' });
      }
    }
    return { geo: k.build(), sway: true };
  });
}

function palmTree(variant) {
  return cached(`tree:palm:${variant}`, () => {
    const k = new Mesher();
    const lean = variant ? 1.0 : 0.55, H = variant ? 5.1 : 4.6, segs = 7;
    const pt = (t) => [lean * t * t, H * t];
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const a = pt(t0), b = pt(t1);
      const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const rB = 0.21 - t0 * 0.08, rT = rB * 0.78;
      k.add(cyl(rT, rB, len * 1.04, 7, true), { at: [a[0], a[1], 0], rot: [0, 0, -ang], color: i % 2 ? '#8d6e4a' : '#7b5d3d', outline: 0.025 });
    }
    const top = pt(1);
    k.add(new THREE.DodecahedronGeometry(0.24, 0), { at: [top[0], top[1] + 0.02, 0], color: '#5d7a2e' });
    // fronds: arched, drooping, V-folded leaves
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + variant * 0.3 + hash(i, variant) * 0.3;
      const L = 2.0 + hash(i, 5) * 0.5;
      const pts = [];
      for (let s = 0; s <= 5; s++) {
        const u = s / 5;
        const d = L * u;
        const y = top[1] + 0.45 * Math.sin(Math.PI * u * 0.75) - 1.25 * u * u;
        const w = 0.34 * Math.sin(Math.PI * (0.12 + 0.88 * u)) + 0.02;
        pts.push([top[0] + Math.cos(a) * d, y, Math.sin(a) * d, w]);
      }
      const g = ribbon(pts, { fold: 0.35 });
      k.add(g, { color: (p, nn, idx) => (idx % 3 === 1 ? shade('#2b8a3e', -0.1) : (i % 2 ? '#37b24d' : '#2f9e44')), tint: 1, double: true, backShade: 0.75 });
    }
    return { geo: k.build(), sway: true, crown: { palm: true, top: [top[0], top[1], 0] } };
  });
}

function deadTree(sub, variant) {
  return cached(`tree:dead:${sub}:${variant}`, () => {
    const k = new Mesher();
    const col = sub === 'spooky' ? '#3b2f3f' : '#6b5a4a';
    const R = rng(11 + variant * 7 + (sub === 'spooky' ? 3 : 0));
    const snowCol = C('#f4f9ff'), wood = C(col);
    const color = sub === 'deadsnow' ? (p, n) => (n.y > 0.35 ? snowCol : wood) : col;
    k.add(cyl(0.16, 0.3, 0.4, 6, true), { color: shade(col, -0.2), outline: 0.03 });
    const dir = new THREE.Vector3((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25).normalize();
    branches(k, R, new THREE.Vector3(0, 0.3, 0), dir, sub === 'spooky' ? 2.0 : 1.8, 0.2, 3, { color, outline: 0.025, spread: 0.6, shrink: 0.68, lift: 0.2 });
    let crownInfo = null;
    if (sub === 'spooky') {
      const c = [0, 3.7, 0];
      const blobs = [[0, 3.8, 0, 0.95], [0.75, 3.45, 0.2, 0.7, 0.9], [-0.7, 3.5, -0.15, 0.72, 0.88]];
      crown(k, blobs, c, { outline: 0.04, lo: 0.6 });
      // glowing eyes in the leaves
      for (const s of [-1, 1]) k.add(new THREE.SphereGeometry(0.1, 6, 4), { at: [s * 0.22, 3.75, 0.86], scale: [1, 0.75, 0.6], color: '#f1c40f', glow: '#ffd54f', flicker: 0.3 });
      crownInfo = { c, blobs };
    }
    return { geo: k.build(), sway: sub === 'spooky', crown: crownInfo };
  });
}

function cactus(variant) {
  return cached(`tree:cactus:${variant}`, () => {
    const k = new Mesher();
    const col = '#3f8f3f';
    const o = { color: col, flat: true, outline: 0.03, tint: 1 };
    k.add(cyl(0.26, 0.3, 2.5, 8, true), o);
    k.add(new THREE.SphereGeometry(0.26, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), { ...o, at: [0, 2.5, 0] });
    const arm = (s, y0, len, up) => {
      k.add(cyl(0.17, 0.17, len, 8, true), { ...o, at: [s * 0.2, y0, 0], rot: [0, 0, -s * Math.PI / 2] });
      k.add(new THREE.SphereGeometry(0.17, 8, 4), { ...o, at: [s * (0.2 + len), y0, 0] });
      k.add(cyl(0.17, 0.17, up, 8, true), { ...o, at: [s * (0.2 + len), y0, 0] });
      k.add(new THREE.SphereGeometry(0.17, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), { ...o, at: [s * (0.2 + len), y0 + up, 0] });
    };
    arm(-1, 1.1, 0.42, 0.85);
    if (variant & 1) arm(1, 1.5, 0.36, 0.7);
    if (variant & 2) {
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        k.add(new THREE.SphereGeometry(0.08, 5, 3), { at: [Math.cos(a) * 0.09, 2.78, Math.sin(a) * 0.09], color: '#ff6b9a' });
      }
      k.add(new THREE.SphereGeometry(0.06, 5, 3), { at: [0, 2.82, 0], color: '#ffd54f' });
    }
    return { geo: k.build(), sway: false };
  });
}

function lollipop() {
  return cached('tree:lollipop', () => {
    const k = new Mesher();
    k.add(cyl(0.05, 0.06, 2.3, 6, true), { color: '#fdfefe', outline: 0.02 });
    // the candy: a thick disc with a pinwheel swirl on both faces
    const R = 0.78, th = 0.22, seg = 16;
    k.save(); k.translate(0, 2.25 + R, 0); k.rotateX(Math.PI / 2);
    const side = cyl(R, R, th, seg, true);
    k.add(side, { at: [0, -th / 2, 0], color: '#ffffff', tint: 1, outline: 0.035 });
    for (const face of [1, -1]) {
      const pos = [];
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const tw = 0.9; // swirl: the inner point is rotated
        pos.push(0, face * th / 2, 0, Math.cos(a1 + tw) * R * 0.45, face * th / 2, Math.sin(a1 + tw) * R * 0.45, Math.cos(a0 + tw) * R * 0.45, face * th / 2, Math.sin(a0 + tw) * R * 0.45);
        pos.push(Math.cos(a0 + tw) * R * 0.45, face * th / 2, Math.sin(a0 + tw) * R * 0.45, Math.cos(a1 + tw) * R * 0.45, face * th / 2, Math.sin(a1 + tw) * R * 0.45, Math.cos(a1) * R, face * th / 2, Math.sin(a1) * R);
        pos.push(Math.cos(a0 + tw) * R * 0.45, face * th / 2, Math.sin(a0 + tw) * R * 0.45, Math.cos(a1) * R, face * th / 2, Math.sin(a1) * R, Math.cos(a0) * R, face * th / 2, Math.sin(a0) * R);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (face < 0) g.scale(1, 1, -1);
      g.computeVertexNormals();
      k.add(g, { color: (p, n, i) => (Math.floor(i / 9) % 2 ? '#ffffff' : '#ffffff'), tint: (p, n, i) => (Math.floor(i / 9) % 2 ? 0 : 1), flat: true });
    }
    k.restore();
    return { geo: k.build(), sway: false };
  });
}

function candycane() {
  return cached('tree:candycane', () => {
    const k = new Mesher();
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.0, 0)));
    const arc = new THREE.EllipseCurve(0.4, 2.0, 0.4, 0.4, Math.PI, 0, true);
    const pts = arc.getPoints(10).map((p) => new THREE.Vector3(p.x, p.y, 0));
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    path.add(new THREE.LineCurve3(new THREE.Vector3(0.8, 2.0, 0), new THREE.Vector3(0.8, 1.72, 0)));
    const radial = 8, tubular = 28;
    const g = tube(path, tubular, 0.13, radial);
    const red = C('#e74c3c'), white = C('#ffffff');
    k.add(g, { split: true, color: (p, n, i) => { const t = Math.floor(i / 3); const j = Math.floor(t / (2 * radial)), r = Math.floor((t % (2 * radial)) / 2); return ((j + Math.floor(r / 2)) % 4) < 2 ? red : white; }, outline: 0.025 });
    return { geo: k.build(), sway: false };
  });
}

function bamboo(variant) {
  return cached(`tree:bamboo:${variant}`, () => {
    const k = new Mesher();
    const R = rng(5 + variant);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + R();
      const x = Math.cos(a) * 0.28, z = Math.sin(a) * 0.28;
      const h = 3.4 + R() * 1.4;
      const segs = 5;
      const lean = (R() - 0.5) * 0.12;
      for (let s = 0; s < segs; s++) {
        k.add(cyl(0.062, 0.075, h / segs, 5, true), { at: [x + lean * s, s * h / segs, z], rot: [0, 0, -lean], color: s % 2 ? '#8bc34a' : '#7cb342', tint: 1 });
      }
      for (let l = 0; l < 3; l++) {
        const la = a + l * 2.1;
        const y = h * (0.72 + l * 0.1);
        const pts = [];
        for (let s = 0; s <= 3; s++) pts.push([x + lean * 5 + Math.cos(la) * s * 0.25, y - s * s * 0.06, z + Math.sin(la) * s * 0.25, 0.07 * Math.sin(Math.PI * (0.2 + s / 3.6))]);
        k.add(ribbon(pts), { color: '#9ccc65', double: true, tint: 1 });
      }
    }
    return { geo: k.build(), sway: true };
  });
}

function coral(variant) {
  return cached(`tree:coral:${variant}`, () => {
    const k = new Mesher();
    const R = rng(21 + variant);
    const tips = [];
    branches(k, R, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.75, 0.13, 3, { color: '#ffffff', tint: 1, outline: 0.02, spread: 0.7, shrink: 0.78, lift: 0.3, seg: 5 }, tips);
    for (const t of tips) k.add(new THREE.IcosahedronGeometry(0.075, 0), { at: t.toArray(), color: '#ffffff', tint: 1 });
    // the tint colours the whole coral; give it a paler base
    return { geo: k.build(), sway: false };
  });
}

function kelp(variant) {
  return cached(`tree:kelp:${variant}`, () => {
    const k = new Mesher();
    for (let i = -1; i <= 1; i++) {
      const pts = [];
      for (let s = 0; s <= 9; s++) {
        const y = s * 0.34;
        pts.push([i * 0.25 + Math.sin(y * 3 + i + variant) * 0.15, y, Math.cos(y * 2 + i) * 0.1, 0.1 + Math.sin(s / 9 * Math.PI) * 0.06]);
      }
      k.add(ribbon(pts, { side: [1, 0, 0.3] }), { color: '#ffffff', tint: 1, double: true });
    }
    return { geo: k.build(), sway: true };
  });
}

/** The tree model for a sub-kind and variant. */
function treeModel(sub, v) {
  const var2 = (v || 0) % 2;
  switch (sub) {
    case 'palm': return palmTree(var2);
    case 'pine': return pineTree(false, var2);
    case 'snowpine': return pineTree(true, var2);
    case 'jungle': return jungleTree(var2);
    case 'cactus': return cactus((v || 0) % 4);
    case 'dead': case 'deadsnow': case 'spooky': return deadTree(sub, var2);
    case 'lollipop': return lollipop();
    case 'candycane': return candycane();
    case 'bamboo': return bamboo(var2);
    case 'coral': return coral(var2);
    case 'kelp': return kelp(var2);
    case 'sakura': case 'blossom': return blossomTree(sub, var2);
    case 'oak': case 'autumn': case 'cottoncandy': case 'cloudtree': return broadleaf(sub, var2);
    default: return broadleaf('oak', var2);
  }
}

function paletteOf(sub) {
  if (sub === 'snowpine') return TREE_COLORS.pine;
  if (sub === 'deadsnow' || sub === 'dead' || sub === 'candycane') return null;
  return TREE_COLORS[sub] || TREE_COLORS.oak;
}

// ------------------------------------------------------------ fruit
const FRUIT_LOOK = {
  coconut: { col: '#7a4a20', r: 0.15 },
  apple: { col: '#e53935', r: 0.12 },
  banana: { col: '#ffd54f', r: 0.1 },
  mango: { col: '#ffb300', r: 0.12 },
  cherry: { col: '#c2185b', r: 0.07 },
};

function addFruit(k, fruit, at, s = 1) {
  const L = FRUIT_LOOK[fruit];
  const [x, y, z] = at;
  if (fruit === 'banana') {
    // a hand of bananas under a short stalk
    k.add(cyl(0.02, 0.025, 0.25, 4, true), { at: [x, y - 0.1, z], color: '#6d8b3a' });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      limb(k, [x + Math.cos(a) * 0.05, y - 0.05, z + Math.sin(a) * 0.05], [x + Math.cos(a) * 0.13, y - 0.28, z + Math.sin(a) * 0.13], 0.035 * s, 0.022 * s, 5, { color: L.col, outline: 0.012, open: false });
    }
    return;
  }
  if (fruit === 'cherry') {
    for (const d of [-1, 1]) {
      limb(k, [x, y + 0.12, z], [x + d * 0.06, y, z], 0.008, 0.008, 3, { color: '#4e6b2a' });
      k.add(new THREE.IcosahedronGeometry(L.r * s, 1), { at: [x + d * 0.06, y - 0.03, z], color: L.col, outline: 0.012, normals: radial(x + d * 0.06, y - 0.03, z, 0) });
    }
    return;
  }
  const r = L.r * s;
  const sc = fruit === 'mango' ? [0.85, 1.15, 0.85] : [1, 0.95, 1];
  const top = C(fruit === 'mango' ? '#e65100' : fruit === 'apple' ? '#ff6f60' : '#5b3514'), base = C(L.col), tmp = new THREE.Color();
  k.add(new THREE.DodecahedronGeometry(r, 0), {
    at: [x, y, z], scale: sc, normals: radial(x, y, z, 0),
    color: (p) => tmp.copy(base).lerp(top, clamp01((p.y - y) / r) * (fruit === 'coconut' ? 0.2 : 0.55)), outline: 0.014,
  });
  if (fruit !== 'coconut') k.add(cyl(0.01, 0.012, 0.07, 3, true), { at: [x, y + r * 0.9, z], color: '#5d4037' });
}

function fruitModel(sub, v, fruit, model) {
  const var2 = (v || 0) % 2;
  return cached(`fruit:${sub}:${var2}:${fruit}`, () => {
    const k = new Mesher();
    const cr = model.crown;
    if (cr?.palm) {
      const [tx, ty] = cr.top;
      if (fruit === 'banana') addFruit(k, 'banana', [tx + 0.25, ty - 0.15, 0.1]);
      else for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.5; addFruit(k, fruit, [tx + Math.cos(a) * 0.2, ty - 0.2 - (i === 1 ? 0.08 : 0), Math.sin(a) * 0.2]); }
    } else if (cr) {
      const n = fruit === 'banana' ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + 0.35;
        const e = fruit === 'banana' ? -0.55 : (i % 2 ? -0.3 : 0.05);
        const d = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
        const p = crownPoint(cr.blobs, cr.c, d, fruit === 'banana' ? 0.7 : 0.9, cr.squash || 1);
        addFruit(k, fruit, p, 1.05);
      }
    }
    return k.build();
  });
}

// ------------------------------------------------------------ bushes & rocks

function bushModel(sub, v) {
  const var2 = sub === 'bush' ? (v === 1 ? 1 : 0) : 0;
  return cached(`bush:${sub}:${var2}`, () => {
    const k = new Mesher();
    if (sub === 'fern') {
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + hash(i, 3) * 0.4;
        const L = 0.75 + hash(i, 4) * 0.3;
        const pts = [];
        for (let s = 0; s <= 4; s++) { const u = s / 4; pts.push([Math.cos(a) * L * u, 0.05 + 0.75 * Math.sin(u * Math.PI * 0.8) - 0.1 * u, Math.sin(a) * L * u, 0.13 * Math.sin(Math.PI * (0.1 + 0.9 * u)) + 0.01]); }
        k.add(ribbon(pts, { fold: 0.3 }), { color: i % 2 ? '#2e7d32' : '#388e3c', tint: 1, double: true });
      }
      return { geo: k.build(), tinted: true };
    }
    if (sub === 'deadbush') {
      const R = rng(4);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + R() * 0.5;
        const tip = [Math.cos(a) * 0.45, 0.45 + R() * 0.25, Math.sin(a) * 0.45];
        limb(k, [0, 0, 0], tip, 0.03, 0.012, 3, { color: '#8d6e4a' });
        limb(k, [tip[0] * 0.6, tip[1] * 0.6, tip[2] * 0.6], [tip[0] * 0.8 + 0.1, tip[1] * 0.95, tip[2] * 0.8], 0.015, 0.008, 3, { color: '#8d6e4a' });
      }
      return { geo: k.build(), tinted: false };
    }
    const blobs = [[0, 0.42, 0, 0.5], [0.4, 0.32, 0.12, 0.38, 0.9], [-0.36, 0.33, -0.1, 0.4, 0.88], [0.05, 0.3, 0.38, 0.36, 0.95], [-0.05, 0.3, -0.36, 0.34, 0.85]];
    crown(k, blobs, [0, 0.25, 0], { outline: 0.03, lo: 0.55 });
    if (var2) {
      const R = rng(9);
      for (let i = 0; i < 7; i++) {
        const a = R() * Math.PI * 2, e = R() * 0.8;
        const p = crownPoint(blobs, [0, 0.25, 0], [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], 0.98);
        k.add(new THREE.IcosahedronGeometry(0.06, 0), { at: p, color: i % 2 ? '#f06292' : '#fff176' });
      }
    }
    return { geo: k.build(), tinted: true };
  });
}

const ROCK_COLORS = ['#8e8a82', '#9a948a', '#7f7a72', '#a39d92'];

function rockModel(shape, cap) {
  return cached(`rock:${shape}:${cap}`, () => {
    const k = new Mesher();
    const g = new THREE.IcosahedronGeometry(0.72, 1);
    const P = g.attributes.position;
    // lumpy, squashed boulder that sits a little into the ground
    const seen = new Map();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let f = seen.get(key);
      if (f === undefined) { f = 0.78 + hash(x * 3 + shape, y * 3, z * 3) * 0.42; seen.set(key, f); }
      const sx = shape === 1 ? 1.25 : 1, sy = shape === 2 ? 0.85 : 0.62, sz = shape === 1 ? 0.85 : 1;
      P.setXYZ(i, x * f * sx, Math.max(-0.18, y * f * sy) + 0.12, z * f * sz);
    }
    const capC = C(cap === 'snow' ? '#f4f9ff' : cap === 'moss' ? '#6a9a3a' : '#ffffff');
    const tmp = new THREE.Color();
    k.add(g, {
      flat: true, outline: 0.03,
      color: (p, n) => (cap !== 'none' && n.y > 0.72 ? capC : tmp.setRGB(0.78 + n.y * 0.22, 0.78 + n.y * 0.22, 0.78 + n.y * 0.22)),
      tint: (p, n) => (cap !== 'none' && n.y > 0.72 ? 0 : 1),
    });
    if (shape === 0) {
      // a smaller stone at its side
      const s = new THREE.IcosahedronGeometry(0.3, 0);
      k.add(s, { at: [0.72, 0.08, 0.35], flat: true, outline: 0.02, color: '#d0d0d0', tint: 1 });
    }
    return k.build();
  });
}

function climateAt(ctx, o) {
  const w = ctx?.world;
  if (!w) return 'none';
  const t = w.type(o.x, o.y - 0.5), c = w.climate(o.x, o.y - 0.5);
  if (t === T.SNOW || t === T.ICE || t === T.PACK_ICE || t === T.SNOWROCK || c === CLIMATE.WINTER) return 'snow';
  if (c === CLIMATE.VOLCANIC || t === T.ASH) return 'ash';
  if (c === CLIMATE.ARID || t === T.DESERT || t === T.SAND) return 'sand';
  if (t === T.GRASS || t === T.FOREST || t === T.JUNGLE || c === CLIMATE.TROPICAL) return 'moss';
  return 'none';
}

// ------------------------------------------------------------ builders
const jitter = (col, o) => {
  const c = C(col).clone();
  const k = 0.9 + hash(o.x, o.y, 7) * 0.2;
  return c.multiplyScalar(k);
};

/** A tree of the given species (o.sub for 'tree' objects, or the kind itself). */
function buildTree(o, ctx, sub) {
  const v = o.v || 0;
  const model = treeModel(sub, v);
  const pal = paletteOf(sub);
  const color = pal ? jitter(pal[v % pal.length], o) : null;
  const part = { key: `t:${sub}:${v % 2}:${sub === 'cactus' ? v % 4 : 0}`, geo: model.geo, sway: model.sway, tinted: !!pal, color, receiveShadow: false };
  const parts = [part];
  let dyn = null;
  const fr = fruitOf(o);
  if (fr && model.crown) {
    const fp = { key: `f:${sub}:${v % 2}:${fr}`, geo: fruitModel(sub, v, fr, model), sway: model.sway, hidden: false, receiveShadow: false, castShadow: false };
    parts.push(fp);
    dyn = (oo, env, c, u) => setPartVisible(u, fp, !isPicked(c.world?.id, oo, env.day));
    void fruitSpots;
  }
  const yaw = hash(o.x, o.y) * Math.PI * 2;
  return instanced(o, ctx, parts, { yaw, scale: o.s || 1, dyn });
}

registerPropBuilder('tree', (o, ctx) => buildTree(o, ctx, o.sub || 'oak'));
// the species also work as object kinds of their own
for (const sub of ['palm', 'pine', 'snowpine', 'jungle', 'cactus', 'dead', 'deadsnow', 'spooky', 'lollipop', 'candycane', 'bamboo', 'coral', 'kelp', 'sakura', 'blossom', 'oak', 'autumn', 'cottoncandy', 'cloudtree']) {
  registerPropBuilder(sub, (o, ctx) => buildTree(o, ctx, sub));
}

registerPropBuilder('bush', (o, ctx) => {
  const sub = o.sub || 'bush';
  const v = o.v || 0;
  const m = bushModel(sub, v);
  const pal = sub === 'fern' ? ['#2e7d32', '#33873a', '#2a7430', '#388e3c'] : ['#4caf50', '#43a047', '#66bb6a', '#388e3c'];
  const color = m.tinted ? jitter(pal[v % 4], o) : null;
  const part = { key: `b:${sub}:${sub === 'bush' && v === 1 ? 1 : 0}`, geo: m.geo, tinted: m.tinted, color, castShadow: false, receiveShadow: false };
  return instanced(o, ctx, [part], { yaw: hash(o.x, o.y) * Math.PI * 2, scale: o.s || 1 });
});

registerPropBuilder('rock', (o, ctx) => {
  const v = o.v || 0;
  const clim = climateAt(ctx, o);
  const cap = clim === 'snow' ? 'snow' : clim === 'moss' && v % 2 === 0 ? 'moss' : 'none';
  const shape = v % 3;
  let col = C(ROCK_COLORS[v % 4]).clone();
  if (clim === 'ash') col = C('#5d5652').clone();
  else if (clim === 'sand') col = C('#c2a27a').clone();
  col.multiplyScalar(0.92 + hash(o.x, o.y, 3) * 0.16);
  const part = { key: `r:${shape}:${cap}`, geo: rockModel(shape, cap), tinted: true, color: col };
  return instanced(o, ctx, [part], { yaw: hash(o.x, o.y) * Math.PI * 2, scale: o.s || 1 });
});

export { treeModel, bushModel, rockModel, box };
