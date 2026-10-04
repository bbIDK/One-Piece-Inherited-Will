// A plate in 3D (see world/drums.js — Elbaph's Sun World, the lower canopy
// of Treasure Tree Adam): its top is the terrain's own grassland; here, all
// round its edge, the canopy — great billows of leaves standing out over
// the drop, bright on top and darker as they go under — and below them the
// shade under the canopy, hung with roots and moss, going down into the
// mist at its foot. Then its waters: the streams across the top, the ponds,
// and the falls pouring off the edge, into the sea or down into the
// Underworld, white where they land. And the mist itself, drifting round the
// foot of it all and the spires standing there.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { vcMat } from './props/mats.js';
import { Mesher, radial } from './props/kit.js';
import { drumR, plateTop, WET } from '../world/drums.js';
import { terraceWater } from './terraces3d.js';

const hash = (i, s) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

const LEAF_HI = new THREE.Color('#6cbf55'), LEAF = new THREE.Color('#4a9a43'), LEAF_LO = new THREE.Color('#2f6f35'), LEAF_DK = new THREE.Color('#24502a');
const SHADE_HI = new THREE.Color('#31552f'), SHADE_LO = new THREE.Color('#222b1d'), ROOT = new THREE.Color('#3b2c20'), ROOT_DK = new THREE.Color('#2a1f17'), MOSS = new THREE.Color('#33502f');

/** The edge of plate `d`, about its middle, every ~2 m: { x, y, nx, ny, a } (n its outward normal). */
function rim(d) {
  const per = 2 * Math.PI * Math.sqrt((d.R * d.R + d.Ry * d.Ry) / 2);
  const n = Math.max(120, Math.round(per / 2));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = drumR(d, a);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const gx = x / (d.R * d.R), gy = y / (d.Ry * d.Ry), g = Math.hypot(gx, gy);
    out.push({ x, y, nx: gx / g, ny: gy / g, a });
  }
  return out;
}

/** Where the canopy's billows must leave a gap: a fall pouring out, a gondola's bay. */
function gapsOf(d, world) {
  const gaps = [];
  for (const f of d.water?.falls || []) gaps.push({ x: f.x, y: f.y, r: f.w / 2 + 3.2 });
  for (const rw of world.ropeways || []) {
    const bx = world.dx(d.x, rw.b.x), by = rw.b.y - d.y;
    if (Math.hypot(bx, by) < Math.max(d.R, d.Ry) * 1.2) gaps.push({ x: bx, y: by, r: 8 });
  }
  return gaps;
}
const inGap = (gaps, x, y, pad = 0) => gaps.some((g) => Math.hypot(x - g.x, y - g.y) < g.r + pad);

/**
 * The canopy's edge and the shade under it, about the plate's middle (x
 * east, z south, y up). `foot(dx, dy)`: the ground (or the sea floor) there.
 */
function edgeOf(d, world, foot) {
  const pts = rim(d), gaps = gapsOf(d, world), H = d.H;
  const k = new Mesher();
  // --- the shade under the canopy: a band all round, from under the leaves
  // down into the ground (or the water), ribbed with hanging roots and moss
  const M = { pos: [], nor: [], col: [], idx: [] };
  const N = pts.length, ROWS = 7;
  const cTmp = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const p = pts[i % N];
    const rib = 0.9 * Math.abs(Math.sin(i * 1.7 + d.seed)) ** 2 + 0.6 * hash(i, d.seed);
    const off = 1.1 + rib;
    const lo = Math.max(-2, foot(p.x + p.nx * 3, p.y + p.ny * 3) - 1.8);
    const dark = 0.8 + 0.2 * hash(i + 3, d.seed); // (the grooves darker)
    // (from the lip — leaves, where the billows leave a gap: a fall, a gondola's bay — down
    // through the shade under them into the ground)
    const rows = [[H + 0.3, LEAF_LO], [H - 3, LEAF_DK], [H - 7.5, SHADE_HI]];
    for (let j = 0; j < ROWS - 3; j++) rows.push([H - 7.5 + (lo - H + 7.5) * ((j + 1) / (ROWS - 3)), null]);
    rows.forEach(([y, c], j) => {
      M.pos.push(p.x + p.nx * (j ? off : off * 0.6), y, p.y + p.ny * (j ? off : off * 0.6));
      M.nor.push(p.nx, j ? 0.15 : 0.6, p.ny);
      if (c) cTmp.copy(c);
      else cTmp.copy(SHADE_HI).lerp(SHADE_LO, Math.min(1, ((j - 2) / (ROWS - 3)) * 1.25));
      cTmp.multiplyScalar(dark);
      M.col.push(cTmp.r, cTmp.g, cTmp.b);
    });
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < ROWS - 1; j++) {
      const a = i * ROWS + j, b = (i + 1) * ROWS + j;
      // (wound to face out, toward whoever looks at it from outside)
      M.idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // the roots and the moss hanging down it
  for (let i = 0; i < N; i += 3) {
    const p = pts[i];
    if (hash(i, d.seed + 1) < 0.35) continue;
    const len = 12 + hash(i, d.seed + 2) * 26, r0 = 0.35 + hash(i, d.seed + 3) * 0.6;
    const g = foot(p.x + p.nx * 3, p.y + p.ny * 3);
    const top = H - 8, bot = Math.max(g + 1.5, top - len);
    if (top - bot < 3) continue;
    const off = 2.3 + hash(i, d.seed + 4) * 1.2;
    k.add(new THREE.CylinderGeometry(r0, r0 * 0.3, top - bot, 5, 1, true), { at: [p.x + p.nx * off, (top + bot) / 2, p.y + p.ny * off], color: hash(i, 9) < 0.4 ? MOSS : hash(i, 8) < 0.5 ? ROOT : ROOT_DK });
  }
  // --- the leaves: three rows of billows round the edge, and a low hedge along the top of it
  const rows = [
    { step: 4.6, out: 1.0, y: H + 0.2, r: [4.4, 5.8], sq: 0.6, c0: LEAF, c1: LEAF_HI, jy: 1.2 },
    { step: 5.6, out: 3.0, y: H - 3.9, r: [5.0, 6.6], sq: 0.62, c0: LEAF_LO, c1: LEAF, jy: 1.0 },
    { step: 7.0, out: 2.4, y: H - 8.2, r: [4.2, 5.6], sq: 0.7, c0: LEAF_DK, c1: LEAF_LO, jy: 0.8 },
  ];
  const per = pts.length * 2; // (metres round, about)
  rows.forEach((row, ri) => {
    const n = Math.round(per / row.step);
    for (let i = 0; i < n; i++) {
      const p = pts[Math.floor((i / n) * pts.length)];
      if (inGap(gaps, p.x, p.y, ri ? 0 : 1)) continue;
      const h = hash(i, ri * 7 + d.seed);
      const r = row.r[0] + (row.r[1] - row.r[0]) * h, out = row.out + hash(i, ri * 7 + 1) * 1.6;
      const x = p.x + p.nx * out, z = p.y + p.ny * out, y = row.y + (hash(i, ri * 7 + 2) - 0.5) * row.jy * 2;
      const nf = radial(p.x - p.nx * 8, y - r * 0.6, p.y - p.ny * 8, 0.2);
      const y0 = y - r * row.sq, y1 = y + r * row.sq;
      k.add(new THREE.DodecahedronGeometry(r, 0), {
        at: [x, y, z], rot: [h * 3, hash(i, 5) * 3, hash(i, 6) * 3], scale: [1, row.sq, 1],
        color: (q) => cTmp.copy(row.c0).lerp(row.c1, Math.min(1, Math.max(0, (q.y - y0) / (y1 - y0)))),
        normals: nf, outline: 0.09,
      });
    }
  });
  // (the hedge along the top: low bushes just inside the edge, a gap where water or a gondola goes over)
  for (let i = 0; i < pts.length; i += 2) {
    const p = pts[i];
    if (inGap(gaps, p.x, p.y, 1.5)) continue;
    const r = 1.2 + hash(i, 21) * 0.7, x = p.x - p.nx * 1.4, z = p.y - p.ny * 1.4;
    const y = plateTop(d, x, z) + r * 0.35;
    k.add(new THREE.DodecahedronGeometry(r, 0), { at: [x, y, z], rot: [hash(i, 22) * 3, hash(i, 23) * 3, 0], scale: [1, 0.7, 1], color: hash(i, 24) < 0.5 ? LEAF : LEAF_HI, normals: radial(x, y - r, z, 0.3), outline: 0.04 });
  }
  const shade = new THREE.Mesh(geometryOf(M), vcMat());
  const leaves = new THREE.Mesh(k.build(false), vcMat());
  shade.receiveShadow = true;
  leaves.castShadow = true; leaves.receiveShadow = true;
  const g = new THREE.Group();
  g.add(shade, leaves);
  return g;
}

function geometryOf(M) {
  const g = new THREE.BufferGeometry();
  const n = M.pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(M.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(M.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(M.col, 3));
  g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  g.setIndex(M.idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------ the water
/** A growing set of water triangles (the terrace water's attributes: kind 0 run, 1 sheet, 2 foam, 3 still). */
class Water {
  constructor() { this.p = []; this.uv = []; this.k = []; this.t = []; this.i = []; }
  v(x, y, z, u, w, k, t) { this.p.push(x, y, z); this.uv.push(u, w); this.k.push(k); this.t.push(t); return this.p.length / 3 - 1; }
  quad(a, b, c, d) { this.i.push(a, b, c, b, d, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.k, 1));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(this.t, 1));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

/** The water on and off plate `d`: its streams, ponds and falls (`foot` as for the edge). */
function waterOf(d, foot) {
  const W = new Water(), w = d.water;
  if (!w) return null;
  // the streams, along their beds (their water under the banks), out to the lip
  for (const s of w.streams) {
    const pts = s.pts.slice(0, -1); // (not the bit through the face)
    let along = 0, prev = null;
    const half = s.hw - 0.35;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i], [x2, y2] = pts[Math.min(pts.length - 1, i + 1)], [x0, y0] = pts[Math.max(0, i - 1)];
      let tx = x2 - x0, ty = y2 - y0;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      if (i) along += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
      const h = plateTop(d, x, y) + s.depth - WET, t = i / (pts.length - 1);
      const a = W.v(x - ty * half, h, y + tx * half, 0, along, 0, t * 0.7);
      const b = W.v(x + ty * half, h, y - tx * half, 1, along, 0, t * 0.7);
      if (prev) W.quad(prev[0], prev[1], a, b);
      prev = [a, b];
    }
  }
  // the ponds: still water, rings spreading where the springs come up
  for (const p of w.ponds) {
    const h = plateTop(d, p.x, p.y) + p.depth - WET, seg = 36;
    const c = W.v(p.x, h, p.y, 0, 0, 3, 0);
    let first = -1, last = -1;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, rx = Math.cos(a) * (p.rx + 0.6), ry = Math.sin(a) * (p.ry + 0.6);
      const v = W.v(p.x + rx, h, p.y + ry, rx, ry, 3, 0);
      if (i) W.i.push(c, v, last); else first = v;
      last = v;
    }
    void first;
  }
  // the falls: tipping over the lip, then a sheet down the face, bowing out as
  // it falls, wider at the bottom; white where it lands
  for (const f of w.falls) {
    const top = f.top, bottom = Math.max(0.15, foot(f.x + f.nx * 5, f.y + f.ny * 5) + (f.sea ? 0.1 : 0.15));
    const tx = -f.ny, ty = f.nx, half = f.w / 2 - 0.2;
    const drop = Math.max(2, top - bottom);
    const rowsN = 14;
    let prev = null;
    // (over the lip: a short run tipping down)
    const l0 = W.v(f.x - f.nx * 1.4 - tx * half, top, f.y - f.ny * 1.4 - ty * half, 0, 0, 0, 0.75);
    const l1 = W.v(f.x - f.nx * 1.4 + tx * half, top, f.y - f.ny * 1.4 + ty * half, 1, 0, 0, 0.75);
    prev = [l0, l1];
    for (let j = 0; j <= rowsN; j++) {
      const v = j / rowsN, y = top - drop * v * v * 0.15 - drop * v * 0.85;
      const out = 0.6 + 2.2 * Math.sqrt(v) * Math.min(1, Math.sqrt(drop / 30)), wide = half * (1 + v * 0.5);
      const a = W.v(f.x + f.nx * out - tx * wide, y, f.y + f.ny * out - ty * wide, 0, drop * v, 1, v);
      const b = W.v(f.x + f.nx * out + tx * wide, y, f.y + f.ny * out + ty * wide, 1, drop * v, 1, v);
      W.quad(prev[0], prev[1], a, b);
      prev = [a, b];
    }
    // where it lands: churning white, spreading
    const fx = f.x + f.nx * 3.2, fy = f.y + f.ny * 3.2, S = half * 2.6 + 3;
    const q = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, v]) => W.v(fx + tx * u * S + f.nx * v * S, bottom + 0.05, fy + ty * u * S + f.ny * v * S, (u + 1) / 2, (v + 1) / 2, 2, 0));
    W.quad(q[0], q[1], q[2], q[3]);
  }
  const m = new THREE.Mesh(W.build(), terraceWater());
  m.renderOrder = 3;
  return m;
}

// ------------------------------------------------------------ the mist
const MIST_VS = /* glsl */`
  attribute vec4 aCard; // x, y, z (about the plate's middle), size
  attribute float aSeed;
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv; vSeed = aSeed;
    // (drifting slowly to and fro, always facing the eye)
    vec3 c = aCard.xyz + vec3(sin(uTime * 0.05 + aSeed * 6.0) * 6.0, sin(uTime * 0.07 + aSeed * 3.0) * 1.2, cos(uTime * 0.04 + aSeed * 5.0) * 6.0);
    vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
    mvPosition.xy += (uv - 0.5) * vec2(aCard.w, aCard.w * 0.45);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const MIST_FS = /* glsl */`
  uniform float uTime;
  uniform float uDay;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vSeed;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec2 q = (vUv - 0.5) * vec2(2.0, 2.0);
    float r = length(q);
    float n = noise(vUv * 3.0 + vec2(uTime * 0.02 + vSeed * 7.0, vSeed * 3.0)) * 0.6 + noise(vUv * 7.0 - uTime * 0.03) * 0.4;
    float a = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.25, 0.75, n) * 0.42;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * mix(0.3, 0.92, uDay), a);
    #include <fog_fragment>
  }
`;
const MU = { uTime: { value: 0 }, uDay: { value: 1 }, uColor: { value: new THREE.Color('#d5dde4') } };
let mistMat = null;
function mistMaterial() {
  if (mistMat) return mistMat;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(uniforms, MU);
  mistMat = new THREE.ShaderMaterial({ uniforms, vertexShader: MIST_VS, fragmentShader: MIST_FS, fog: true, transparent: true, depthWrite: false });
  return mistMat;
}

/** Banks of mist round the foot of plate `d` and round its spires, and spray at its falls. */
function mistOf(d, world, foot) {
  const cards = [];
  const pts = rim(d);
  for (let i = 0; i < pts.length; i += 7) {
    const p = pts[i], out = 8 + hash(i, 31) * 26, x = p.x + p.nx * out, y = p.y + p.ny * out;
    const g = Math.max(0, foot(x, y));
    cards.push([x, g + 5 + hash(i, 32) * 12, y, 30 + hash(i, 33) * 22, hash(i, 34)]);
  }
  for (const o of world.objects?.near?.(d.x, d.y, Math.max(d.R, d.Ry) + 140) || []) {
    if (o.kind !== 'spire') continue;
    const x = world.dx(d.x, o.x), y = o.y - d.y, g = Math.max(0, foot(x, y));
    for (let j = 0; j < 2; j++) cards.push([x + (hash(j, o.seed) - 0.5) * 10, g + 4 + j * (o.h * 0.35), y + (hash(j + 2, o.seed) - 0.5) * 10, 22 + j * 8, hash(j, o.seed + 1)]);
  }
  for (const f of d.water?.falls || []) {
    const x = f.x + f.nx * 5, y = f.y + f.ny * 5, g = Math.max(0, foot(x, y));
    cards.push([x, g + 3, y, 16, hash(3, f.x)], [x + f.nx * 4, g + 8, y + f.ny * 4, 22, hash(4, f.y)]);
  }
  const n = cards.length;
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const card = new Float32Array(n * 4), seed = new Float32Array(n);
  cards.forEach((c, i) => { card[i * 4] = c[0]; card[i * 4 + 1] = c[1]; card[i * 4 + 2] = c[2]; card[i * 4 + 3] = c[3]; seed[i] = c[4]; });
  geo.setAttribute('aCard', new THREE.InstancedBufferAttribute(card, 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  geo.instanceCount = n;
  const R = Math.max(d.R, d.Ry) + 160;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, 0), R);
  const m = new THREE.Mesh(geo, mistMaterial());
  m.renderOrder = 4;
  return m;
}

// ------------------------------------------------------------ in the scene
const views = new Map(); // plate → group
let root = null;

registerFrameHook((env, ctx) => {
  const game = ctx.game, v = game?.view3d, w = ctx.world;
  if (!root) { root = new THREE.Group(); root.name = 'plates'; ctx.scene.add(root); }
  const list = ((w && w === game?.world && w.zone === 0 && w.drums) || []).filter((d) => d.plate);
  for (const [d, g] of views) {
    if (list.includes(d)) continue;
    g.removeFromParent();
    g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    views.delete(d);
  }
  MU.uTime.value = (env.time || 0) % 3600;
  MU.uDay.value = env.daylight ?? 1;
  if (!v || !list.length) return;
  const px = game.player?.x ?? v.ox, py = game.player?.y ?? v.oy;
  for (const d of list) {
    let g = views.get(d);
    const near = w.distance(px, py, d.x, d.y) < 2600;
    if (!near) { if (g) g.visible = false; continue; }
    if (!g) {
      // (the land at the foot, as the terrain has it — or the sea floor)
      const foot = (dx, dy) => (ctx.terrain ? ctx.terrain(d.x + dx, d.y + dy) : 0);
      g = new THREE.Group();
      g.name = 'plate';
      g.add(edgeOf(d, w, foot));
      const wet = waterOf(d, foot);
      if (wet) g.add(wet);
      g.add(mistOf(d, w, foot));
      views.set(d, g);
      root.add(g);
    }
    g.visible = true;
    g.position.set(w.dx(v.ox, d.x), 0, d.y - v.oy);
  }
}, 'plates');
