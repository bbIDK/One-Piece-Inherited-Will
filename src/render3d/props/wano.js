// Wano Country and Onigashima (data/islands/newWorld2.js), as the anime draws them:
//  * the cliffs walling the whole country in high over the sea (`cliffwall`,
//    laid along the coast by world/islandgen.js placeCliffRing), pines and
//    cherry trees along their tops, and the great waterfall the carp — and
//    the ships riding them — climb to get in (`carpfall`);
//  * Mt. Fuji standing over the Flower Capital (`wanofuji`), and the
//    Shogun's castle up on its crag of rock above the capital — white walls,
//    tier on tier of dark roofs, gold on the ridge — a cherry tree by it
//    (`wanocastle`);
//  * Onigashima's skull: a dome of bone-white rock with black eye sockets
//    (glowing at night), teeth, two great horns, Kaido's castle on top and a
//    giant's katana driven into the rock beside it (`skulldome`, its size
//    world/objects.js SKULL).
import * as THREE from 'three';
import { Mesher } from './kit.js';
import { meshOf, animate, bindCtx, glowMat, vcMat } from './mats.js';
import { model } from './street.js';
import { registerPropBuilder } from '../registry.js';
import { terraceWater } from '../terraces3d.js';
import { SKULL } from '../../world/objects.js';
import { moundGeo, hashN, smoke } from './punkhazard.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });
const col = (c) => new THREE.Color(c);
const smoothN = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hashN(i, s) * (1 - u) + hashN(i + 1, s) * u; };

// ------------------------------------------------------------ the cliffs
const CL_DK = col('#57565c'), CL = col('#7b7670'), CL_HI = col('#9a9286'), CL_TOP = col('#5c8f43'), CL_SLOPE = col('#6c8a4a'), PINE = col('#2d5a37'), PINE_DK = col('#22432b'), TRUNK = col('#5b4030'), PINK = col('#f3b5cb'), PINK_DK = col('#e08aa8');

/**
 * An arc of the cliffs, along `o.pts` ([x, z, nx, nz] from its middle, the
 * normal out to sea): a sheer face of columned rock from under the water up
 * `o.h` metres, a grassy top a few metres across, and its back sloping down
 * to the land behind (heights the world's own: noGround).
 */
reg('cliffwall', (o, ctx) => {
  const P = o.pts || [], n = P.length, H = o.h || 46, seed = o.seed || 1;
  if (n < 2) return null;
  // the cross-section, out (+) to in (−): [offset along the normal, height share, how much of the land behind]
  const PROF = [[4.5, -14, 0], [3.0, 0.32, 0], [2.0, 0.66, 0], [1.0, 0.92, 0], [0, 1, 0], [-5, 0.985, 0], [-10, 0.6, 0.4], [-16, 0.22, 0.78], [-22, 0, 1]];
  const pos = [], idx = [];
  const NP = PROF.length;
  for (let i = 0; i < n; i++) {
    const [x, z, nx, nz] = P[i];
    const gi = ctx.ground(o.x + x - nx * 22, o.y + z - nz * 22) - 0.8;
    const end = Math.min(i, n - 1 - i);
    const taper = end >= 3 ? 1 : [0.12, 0.45, 0.8][end];
    const hi = Math.max(gi + 2, H * (0.84 + 0.3 * smoothN(i * 0.11, seed)) * taper);
    // (the face in columns: each standing a little proud of the next)
    const col0 = (hashN(i, seed + 3) - 0.5) * 1.8 + (smoothN(i * 0.3, seed + 5) - 0.5) * 2.5;
    for (const [off, k, land] of PROF) {
      // (the foot under the sea; up the face; down the back to the land behind)
      const y = k < -1 ? k : hi * k + gi * land;
      const d = off + (off > -1 && off < 4 ? col0 : 0);
      pos.push(x + nx * d, y, z + nz * d);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < NP - 1; j++) {
      const a = i * NP + j, b = a + NP;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const k = new Mesher();
  const tmp = new THREE.Color();
  k.add(g, {
    flat: true,
    color: (p, nn) => {
      if (nn.y > 0.55) return p.y > H * 0.6 ? CL_TOP : CL_SLOPE;
      // (strata across the face, darker low down where the sea washes it)
      const band = Math.sin(p.y * 0.55 + Math.sin(p.x * 0.05 + p.z * 0.05) * 2);
      tmp.copy(CL_DK).lerp(CL, Math.min(1, Math.max(0, p.y / (H * 0.5)))).lerp(CL_HI, band > 0.6 ? 0.4 : 0);
      return tmp;
    },
    outline: 0.35,
  });
  // pines along the top, and now and then a cherry tree
  for (let i = 2; i < n - 2; i += 2) {
    if (hashN(i, seed + 11) < 0.35) continue;
    const [x, z, nx, nz] = P[i];
    const d = -2 - hashN(i, seed + 12) * 5, j = 4 + (d < -4.5 ? 1 : 0);
    const by = pos[(i * NP + j) * 3 + 1];
    const tx = x + nx * d + (hashN(i, seed + 13) - 0.5) * 2, tz = z + nz * d;
    const s = 0.8 + hashN(i, seed + 14) * 0.7;
    k.add(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 3 * s, 5), { at: [tx, by + 1.5 * s, tz], color: TRUNK });
    if (hashN(i, seed + 15) < 0.2) {
      k.add(new THREE.IcosahedronGeometry(2.6 * s, 0), { at: [tx, by + 4 * s, tz], scale: [1.3, 0.8, 1.3], color: (p, nn) => (nn.y > 0.2 ? PINK : PINK_DK), flat: true, outline: 0.1 });
    } else {
      k.add(new THREE.ConeGeometry(2.2 * s, 4 * s, 6), { at: [tx, by + 4 * s, tz], color: PINE, flat: true, outline: 0.1 });
      k.add(new THREE.ConeGeometry(1.5 * s, 3 * s, 6), { at: [tx, by + 6.3 * s, tz], color: PINE_DK, flat: true, outline: 0.08 });
    }
  }
  const m = new THREE.Mesh(k.build(false), vcMat());
  m.castShadow = true; m.receiveShadow = true;
  const root = new THREE.Group();
  root.name = 'cliffwall';
  root.add(m);
  root.userData.noGround = true;
  return root;
});

// ------------------------------------------------------------ the waterfall
/** Water triangles in the terrace water's attributes (kind 0 run, 1 sheet, 2 foam). */
function waterGeo(pos, uv, kind, t, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** A koi: a fat orange body, white patches, a fanned tail (nose +y, `s` metres long). */
function koiGeo(s) {
  const k = new Mesher();
  k.add(new THREE.SphereGeometry(s * 0.22, 10, 8), { scale: [1, 2.3, 0.75], color: (p) => (Math.sin(p.y * 3 / s + p.x * 2 / s) > 0.4 ? '#f7f2ea' : '#f0661e'), outline: s * 0.02 });
  k.add(new THREE.ConeGeometry(s * 0.2, s * 0.32, 4), { at: [0, -s * 0.58, 0], rot: [Math.PI, 0, 0], scale: [1.4, 1, 0.25], color: '#f28a3a', outline: s * 0.015 });
  for (const sx of [-1, 1]) k.add(new THREE.SphereGeometry(s * 0.035, 6, 4), { at: [sx * s * 0.12, s * 0.34, s * 0.11], color: '#111' });
  return k.build(false);
}

/**
 * The great waterfall over the cliffs (local +z out to sea): the river
 * running to the lip, a sheet falling `o.h` metres into the sea, white water
 * and spray where it lands — and a pair of carp fighting their way up it.
 */
reg('carpfall', (o) => {
  const H = o.h || 46, W = 22;
  const root = new THREE.Group();
  root.name = 'carpfall';
  const pos = [], uv = [], kind = [], t = [], idx = [];
  const V = 14, U = 6;
  // the sheet: from the lip (z −2) bulging out as it falls, to the sea
  for (const [w, zo] of [[W, 0], [W * 0.75, -1.2]]) {
    const base = pos.length / 3;
    for (let j = 0; j <= V; j++) {
      const v = j / V, y = H + 0.6 - (H + 1) * v, z = -2 + zo + 9 * Math.sqrt(v) + 2.5 * v;
      for (let i = 0; i <= U; i++) {
        const u = i / U;
        pos.push((u - 0.5) * w * (1 + v * 0.35), y, z); uv.push(u, (H + 1) * v); kind.push(1); t.push(v);
      }
    }
    for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) { const a = base + j * (U + 1) + i, b = a + U + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  // the river running to the lip, along the top
  {
    const base = pos.length / 3;
    for (let j = 0; j <= 4; j++) {
      const z = -2 - (4 - j) * 5;
      pos.push(-W / 2, H + 0.6, z, W / 2, H + 0.6, z); uv.push(0, j * 5, 1, j * 5); kind.push(0, 0); t.push(j / 4, j / 4);
      if (j) { const a = base + (j - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  // white water where it lands
  {
    const base = pos.length / 3, F = 46, zc = 13;
    pos.push(-F / 2, 0.35, zc - F * 0.35, F / 2, 0.35, zc - F * 0.35, -F / 2, 0.35, zc + F * 0.65, F / 2, 0.35, zc + F * 0.65);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1); kind.push(2, 2, 2, 2); t.push(0, 0, 0, 0);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const wm = new THREE.Mesh(waterGeo(pos, uv, kind, t, idx), terraceWater());
  wm.renderOrder = 3;
  root.add(wm);
  // spray
  smoke(root, { n: 9, y0: 0.5, rise: H * 0.45, r0: 4, r1: 11, drift: 6, speed: 0.08, color: '#f2f7fb', spread: 8 });
  // the carp climbing it
  const koi = [];
  const kg = koiGeo(7);
  for (let i = 0; i < 2; i++) { const m = meshOf(kg, { castShadow: false }); koi.push(m); root.add(m); }
  animate(root, (time) => {
    koi.forEach((m, i) => {
      const ph = (time * 0.025 + i * 0.5) % 1, v = 1 - ph;
      m.position.set((i ? 4 : -5) + Math.sin(time * 2 + i) * 0.8, H - (H + 1) * v + 2, -2 + 9 * Math.sqrt(v) + 2.5 * v + 1.2);
      m.rotation.set(-0.25, 0, Math.sin(time * 6 + i * 2) * 0.15);
      m.visible = ph < 0.97;
    });
  });
  root.rotation.y = o.yaw || 0;
  const g = new THREE.Group();
  g.add(root);
  g.userData.noGround = true;
  return g;
});

// ------------------------------------------------------------ Mt. Fuji
const FUJI_LO = col('#4f7d46'), FUJI = col('#5a6aa6'), FUJI_HI = col('#7d8cc4'), FUJI_SNOW = col('#f6f8fc');

reg('wanofuji', (o, ctx) => {
  const R = o.r || 58, H = o.h || 140, rTop = R * 0.15, seed = 2.3;
  const g0 = ctx.ground(o.x, o.y);
  let gmin = g0;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gmin = Math.min(gmin, ctx.ground(o.x + Math.cos(a) * R, o.y + Math.sin(a) * R)); }
  const sink = g0 - gmin + 3;
  const geo = model(`wanofuji:${Math.round(R)}:${Math.round(H)}:${Math.round(sink)}`, (k) => {
    const tmp = new THREE.Color();
    const surf = (a, s) => {
      if (s > 1) { const c = s - 1, r = rTop * (1 - c * 0.7); return [Math.cos(a) * r, H - c * 4, Math.sin(a) * r]; }
      if (s < 0) return [Math.cos(a) * R * 1.05, -sink, Math.sin(a) * R * 1.05];
      // (the long sweep of its flanks, steepening to the summit)
      const r = rTop + (R - rTop) * (1 - s) ** 1.55 * (1 + 0.025 * Math.sin(a * 7 + seed));
      return [Math.cos(a) * r, H * s, Math.sin(a) * r];
    };
    k.add(moundGeo(surf, [-0.02, 0, 0.04, 0.09, 0.15, 0.22, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.96, 1, 1.4, 1.8], 48), {
      color: (p) => {
        const a = Math.atan2(p.z, p.x), h = p.y / H;
        // (the snow running down its gullies in streaks)
        if (h > 0.56 - 0.12 * Math.max(0, Math.sin(a * 11 + seed)) ** 3 - 0.04 * Math.sin(a * 5)) return FUJI_SNOW;
        if (h < 0.1) return tmp.copy(FUJI_LO).lerp(FUJI, h / 0.1);
        return tmp.copy(FUJI).lerp(FUJI_HI, (h - 0.1) * 1.4);
      },
      outline: 0.6,
    });
  });
  const root = new THREE.Group();
  root.name = 'wanofuji';
  root.add(meshOf(geo));
  root.userData.founded = true;
  return root;
});

// ------------------------------------------------------------ a Wano castle
const WHITE = col('#f1eee6'), ROOF = col('#2f3b3c'), ROOF_HI = col('#465656'), GOLD = col('#d9a62e'), STONE = col('#a39b8c'), STONE_DK = col('#7f786c'), WIN = col('#2a2420');

/**
 * A tenshukaku into `k` at its current transform: a sloping stone base, then
 * tier on tier of white walls, each under a dark roof flaring out at its
 * eaves, a gable over the middle of each side, gold fish on the top ridge.
 * `w`, `d` its base; `n` tiers.
 */
export function castleInto(k, { w = 20, d = 16, n = 5, th = 4.2, base = 6, wall = WHITE, roof = ROOF } = {}) {
  // the stone base (ishigaki), leaning in
  k.add(new THREE.CylinderGeometry(Math.SQRT1_2 * Math.hypot(w, d) * 0.5, Math.SQRT1_2 * Math.hypot(w + 4, d + 4) * 0.5, base, 4, 1), { at: [0, base / 2, 0], rot: [0, Math.PI / 4, 0], scale: [w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414], color: (p, nn) => (nn.y > 0.5 ? STONE_DK : STONE), flat: true, outline: 0.15 });
  let y = base;
  for (let i = 0; i < n; i++) {
    const s = 1 - i * (0.7 / n), tw = w * s * 0.9, td = d * s * 0.9;
    // the wall, its windows
    k.add(new THREE.BoxGeometry(tw, th, td), { at: [0, y + th / 2, 0], color: wall, outline: 0.12 });
    const nw = Math.max(1, Math.round(tw / 3.2));
    for (let j = 0; j < nw; j++) {
      const x = -tw / 2 + (j + 0.5) * (tw / nw);
      for (const sz of [-1, 1]) k.add(new THREE.BoxGeometry(1.1, 1.3, 0.2), { at: [x, y + th * 0.55, sz * (td / 2 + 0.05)], color: WIN, glow: '#ffcf80' });
    }
    y += th;
    // the roof: a low hipped cap flaring past the wall, its corners turned up
    const rw = tw + 3.2, rd = td + 3.2, rh = i === n - 1 ? th * 1.1 : th * 0.55;
    const R0 = Math.hypot(rw, rd) / 2;
    k.add(new THREE.CylinderGeometry(i === n - 1 ? R0 * 0.18 : R0 * 0.62, R0, rh, 4, 1), { at: [0, y + rh / 2 - 0.3, 0], rot: [0, Math.PI / 4, 0], scale: [rw / (R0 * 1.414), 1, rd / (R0 * 1.414)], color: (p, nn) => (nn.y > 0.75 ? ROOF_HI : roof), flat: true, outline: 0.14 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      k.add(new THREE.ConeGeometry(0.45, 1.6, 4), { at: [sx * rw / 2, y + 0.2, sz * rd / 2], rot: [sz * 0.9, 0, -sx * 0.9], color: roof, flat: true });
    }
    // (a gable over the middle of the front and back)
    if (i < n - 1) {
      for (const sz of [-1, 1]) {
        const gw = tw * 0.5;
        const sh = new THREE.Shape([new THREE.Vector2(-gw / 2, 0), new THREE.Vector2(gw / 2, 0), new THREE.Vector2(0, th * 0.75)]);
        const gg = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false });
        k.add(gg, { at: [0, y - 0.1, sz * (td / 2 + 1.0) - 0.6], color: wall, outline: 0.08 });
        k.add(new THREE.BoxGeometry(gw * 0.62, 0.35, 1.8), { at: [-gw * 0.22, y + th * 0.38, sz * (td / 2 + 1.0)], rot: [0, 0, 0.98], color: roof });
        k.add(new THREE.BoxGeometry(gw * 0.62, 0.35, 1.8), { at: [gw * 0.22, y + th * 0.38, sz * (td / 2 + 1.0)], rot: [0, 0, -0.98], color: roof });
      }
    }
    y += rh * 0.55;
  }
  // gold shachihoko on the top ridge
  for (const sx of [-1, 1]) k.add(new THREE.ConeGeometry(0.55, 2.2, 5), { at: [sx * w * 0.12, y + 0.7, 0], rot: [0, 0, sx * 0.5], color: GOLD, outline: 0.05 });
  return y;
}

/** A cherry tree: a twisting trunk, a broad cloud of blossom (`s` its height). */
function sakuraInto(k, x, z, y0, s) {
  k.add(new THREE.CylinderGeometry(0.06 * s, 0.11 * s, 0.55 * s, 6), { at: [x, y0 + 0.27 * s, z], rot: [0, 0, 0.15], color: TRUNK, outline: 0.06 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, r = 0.28 * s;
    k.add(new THREE.IcosahedronGeometry(0.24 * s, 1), { at: [x + Math.cos(a) * r, y0 + 0.62 * s + hashN(i, 3) * 0.12 * s, z + Math.sin(a) * r], scale: [1, 0.7, 1], color: (p, nn) => (nn.y > 0.1 ? PINK : PINK_DK), outline: 0.1 });
  }
  k.add(new THREE.IcosahedronGeometry(0.3 * s, 1), { at: [x, y0 + 0.78 * s, z], scale: [1, 0.7, 1], color: PINK, outline: 0.1 });
}

/** The Shogun's castle on its crag over the Flower Capital (o.r the crag's radius, o.h its height). */
reg('wanocastle', (o, ctx) => {
  const R = o.r || 18, H = o.h || 26;
  const g0 = ctx.ground(o.x, o.y);
  let gmin = g0;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gmin = Math.min(gmin, ctx.ground(o.x + Math.cos(a) * R, o.y + Math.sin(a) * R)); }
  const sink = g0 - gmin + 2;
  const geo = model(`wanocastle:${Math.round(R)}:${Math.round(H)}:${Math.round(sink)}`, (k) => {
    const tmp = new THREE.Color();
    // the crag: steep, cracked rock, green on its ledges
    const surf = (a, s, i) => {
      if (s > 1) return [Math.cos(a) * R * 0.75 * (2 - s), H, Math.sin(a) * R * 0.75 * (2 - s)];
      const jag = 1 + 0.12 * (hashN(i + Math.round(s * 10) * 13, 5) - 0.5) + 0.06 * Math.sin(a * 5);
      const r = R * (1.12 - 0.37 * Math.max(0, s) ** 0.7) * jag;
      return [Math.cos(a) * r, s < 0 ? -sink : H * s, Math.sin(a) * r];
    };
    k.add(moundGeo(surf, [-0.01, 0, 0.18, 0.36, 0.55, 0.72, 0.88, 1, 1.5, 2], 18), {
      color: (p, nn) => (nn.y > 0.55 ? (p.y > H - 0.5 ? STONE : CL_TOP) : tmp.copy(CL_DK).lerp(CL_HI, Math.min(1, Math.max(0, p.y / H)) * 0.8)),
      flat: true, outline: 0.3,
    });
    k.save();
    k.translate(0, H, -R * 0.08);
    castleInto(k, { w: R * 1.15, d: R * 0.9, n: 5, th: 4.4, base: 4 });
    k.restore();
    // pines on its ledges, a great cherry tree beside the keep
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, r = R * (0.9 - hashN(i, 7) * 0.12), y = H * (0.3 + hashN(i, 8) * 0.55);
      k.add(new THREE.ConeGeometry(2, 4, 6), { at: [Math.cos(a) * r, y + 2, Math.sin(a) * r], color: PINE, flat: true, outline: 0.08 });
    }
    sakuraInto(k, R * 0.62, R * 0.45, H, 13);
    sakuraInto(k, -R * 0.66, R * 0.4, H, 10);
  });
  const root = new THREE.Group();
  root.name = 'wanocastle';
  root.add(meshOf(geo));
  root.userData.founded = true;
  return root;
});

// ------------------------------------------------------------ Onigashima's skull
const BONE = col('#cfc6b8'), BONE_DK = col('#9d9384'), SOCKET = col('#171110'), HORN = col('#bdb19c'), HORN_DK = col('#8c8170'), ROCKO = col('#5d5651'), ROCKO_HI = col('#7a716a');

/** A tube along `pts` ([x, y, z]…) whose radius goes `radii`: a horn. */
function tubeGeo(pts, radii, seg = 10) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const N = 24, pos = [], idx = [];
  const frames = curve.computeFrenetFrames(N, false);
  for (let i = 0; i <= N; i++) {
    const u = i / N, c = curve.getPointAt(u), r = radii[0] + (radii[1] - radii[0]) * u ** 1.3;
    const nn = frames.normals[i], b = frames.binormals[i];
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      pos.push(c.x + (nn.x * cs + b.x * sn) * r, c.y + (nn.y * cs + b.y * sn) * r, c.z + (nn.z * cs + b.z * sn) * r);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, bb = a + seg + 1; idx.push(a, a + 1, bb, a + 1, bb + 1, bb); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

reg('skulldome', (o, ctx) => {
  const R = SKULL.r, Hs = SKULL.h;
  let gmin = Infinity;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; gmin = Math.min(gmin, ctx.ground(o.x + Math.cos(a) * R * 1.25, o.y + Math.sin(a) * R * 1.25)); }
  const by = gmin - 1.5;
  const geo = model('skulldome', (k) => {
    const tmp = new THREE.Color();
    // the rock it rises out of
    const rock = (a, s, i) => {
      const jag = 1 + 0.16 * (hashN(i + Math.round(s * 10) * 17, 9) - 0.5);
      return [Math.cos(a) * R * (1.45 - s * 0.5) * jag, -4 + s * 11, Math.sin(a) * R * (1.45 - s * 0.5) * jag];
    };
    k.add(moundGeo(rock, [0, 0.35, 0.7, 1], 22), { color: (p, nn) => (nn.y > 0.6 ? ROCKO_HI : ROCKO), flat: true, outline: 0.3 });
    // the cranium: a dome, a little longer than wide, the face toward +z
    const cy = Hs - R * 0.95;
    k.add(new THREE.SphereGeometry(R, 40, 26), {
      at: [0, cy, -2], scale: [1, 1.02, 1.05],
      color: (p, nn) => tmp.copy(BONE_DK).lerp(BONE, Math.min(1, Math.max(0, 0.45 + nn.y * 0.55))),
      outline: 0.6,
    });
    // cheekbones and the upper jaw, a band of great square teeth under them
    k.add(new THREE.SphereGeometry(R * 0.8, 28, 16), { at: [0, cy - R * 0.5, R * 0.3], scale: [1, 0.6, 0.92], color: BONE, outline: 0.4 });
    const nt = 8;
    for (let i = 0; i < nt; i++) {
      const a = ((i + 0.5) / nt - 0.5) * 1.5;
      const tx = Math.sin(a) * R * 0.62, tz = R * 0.28 + Math.cos(a) * R * 0.62;
      k.add(new THREE.BoxGeometry(R * 0.15, R * 0.3, R * 0.14), { at: [tx, cy - R * 0.78, tz + R * 0.08], rot: [0, a, 0], color: (p, nn) => (nn.y > 0.5 ? BONE : '#e2dbcd'), flat: true, outline: 0.2 });
    }
    // the eye sockets and the nose: black hollows (their depths glowing at night)
    for (const sx of [-1, 1]) {
      k.add(new THREE.SphereGeometry(R * 0.31, 18, 12), { at: [sx * R * 0.4, cy + R * 0.14, R * 0.9], scale: [1.15, 0.82, 0.42], rot: [-0.15, sx * 0.4, sx * -0.2], color: SOCKET, glow: '#ff9a2e' });
    }
    k.add(new THREE.ConeGeometry(R * 0.14, R * 0.28, 3), { at: [0, cy - R * 0.2, R * 1.0], rot: [0.3, 0, Math.PI], scale: [1, 1, 0.5], color: SOCKET, glow: '#ff8a1e' });
    // the horns: out from the sides of the crown, sweeping out and up
    for (const sx of [-1, 1]) {
      const pts = [[sx * R * 0.72, cy + R * 0.38, -R * 0.1], [sx * R * 1.25, cy + R * 0.42, -R * 0.05], [sx * R * 1.62, cy + R * 0.85, -R * 0.1], [sx * R * 1.62, cy + R * 1.45, -R * 0.2], [sx * R * 1.38, cy + R * 1.9, -R * 0.25]];
      k.add(tubeGeo(pts, [R * 0.24, R * 0.035], 12), { color: (p) => tmp.copy(HORN_DK).lerp(HORN, Math.min(1, Math.max(0, (p.y - cy) / (R * 1.5)))), outline: 0.35 });
    }
    // Kaido's castle on the crown
    k.save();
    k.translate(0, cy + R * 0.9, -R * 0.25);
    castleInto(k, { w: R * 0.75, d: R * 0.55, n: 4, th: 3.8, base: 3, wall: col('#e9dfcf'), roof: col('#3a2a2a') });
    k.restore();
    // the giant's katana driven into the rock beside it
    k.save();
    k.translate(R * 1.25, 0, R * 0.55);
    k.rotateZ(-0.22); k.rotateX(0.1);
    k.add(new THREE.BoxGeometry(2.4, 52, 0.5), { at: [0, 18, 0], color: (p, nn) => (Math.abs(nn.z) > 0.5 ? '#dfe6ec' : '#9aa6b0'), outline: 0.12 });
    k.add(new THREE.CylinderGeometry(3.4, 3.4, 0.8, 14), { at: [0, 44.4, 0], color: '#2a2622', outline: 0.1 });
    k.add(new THREE.CylinderGeometry(1.25, 1.25, 13, 8), { at: [0, 51.3, 0], color: (p) => (Math.sin(p.y * 4) > 0 ? '#2b2b45' : '#c9c3b3'), outline: 0.1 });
    k.add(new THREE.CylinderGeometry(1.35, 1.35, 1, 8), { at: [0, 58.2, 0], color: GOLD });
    k.restore();
  });
  const root = new THREE.Group();
  root.name = 'skulldome';
  const m = meshOf(geo);
  m.position.y = by;
  root.add(m);
  root.userData.noGround = true;
  return root;
});
