// Builds a character's merged, skinned geometry from its look: head (with the
// face decal patch), 3D hair per style, hats, torso and clothes, limbs, hands
// (fist / open palm / pointing finger), boots or sandals, coat, race features
// (mink ears and tail, fins, wings, long arms and legs, bulk) and sheathed
// weapons. Every part is rigidly bound to one bone (see bones.js).
//
// Geometry is cached per look signature and shared (ref-counted) by every
// character that looks the same.
import { Builder, Prim, M, between, mul, grid, lathe, tcap, lin, THREE } from './geom.js';
import { B, dims } from './bones.js';
import { shade, mixHex } from '../../core/math.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ head shape
/** Unit direction → point on the head surface (head units): a sphere with an anime jaw. */
export function headShape(x, y, z) {
  let X = x * 0.955, Y = y * 1.04, Z = z * 0.985;
  if (Y < 0) {
    const k = Math.min(1, -Y / 1.04);
    const f = 1 - 0.34 * k * k;
    X *= f + 0.16 * k * k * Math.max(0, x);
    Z *= f;
    Y *= 1 + 0.07 * k;
  }
  return [X, Y, Z];
}
const dirOf = (thD, phD) => { const t = thD * DEG, p = phD * DEG; return [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)]; };
/** A point on the head surface at polar angle th (0 = top) and azimuth ph (0 = front, 90 = right), scaled by k. */
export function surf(thD, phD, k = 1) { const d = dirOf(thD, phD); const p = headShape(d[0], d[1], d[2]); return [p[0] * k, p[1] * k, p[2] * k]; }

let HEAD_GEO = null;
function headGeo() {
  if (HEAD_GEO) return HEAD_GEO;
  HEAD_GEO = grid((u, v) => {
    const ph = Math.PI + u * TAU, th = v * Math.PI;
    return headShape(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
  }, 14, 11);
  return HEAD_GEO;
}
let FACE_GEO = null;
/** The face decal: a patch over the front of the head, UVs as a front projection (see face.js). */
export function faceGeo() {
  if (FACE_GEO) return FACE_GEO;
  const ph0 = -64 * DEG, ph1 = 64 * DEG, th0 = 48 * DEG, th1 = 154 * DEG;
  FACE_GEO = grid((u, v) => {
    const ph = ph0 + u * (ph1 - ph0), th = th0 + v * (th1 - th0);
    const p = headShape(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    const k = 1.012;
    return [p[0] * k, p[1] * k, p[2] * k, 0.5 - p[2] / 2, (p[1] + 1.05) / 1.67];
  }, 12, 10, true);
  return FACE_GEO;
}

/** A hair (or cloth) cap hugging the head: hairline at polar angle thF (front), thS (sides), thB (back). */
function capGeo(rs, thF, thS, thB, zig = null, U = 16, V = 6) {
  return grid((u, v) => {
    const ph = Math.PI + u * TAU;
    const c = Math.cos(ph);
    let th = thS + (thF - thS) * Math.pow(Math.max(0, c), 1.4) + (thB - thS) * Math.pow(Math.max(0, -c), 1.4);
    if (zig && v >= 1) th += zig(ph);
    const t = v * th * DEG;
    const p = headShape(Math.sin(t) * Math.cos(ph), Math.cos(t), Math.sin(t) * Math.sin(ph));
    return [p[0] * rs, p[1] * rs, p[2] * rs];
  }, U, V);
}
const napeZig = (n, amp) => (ph) => { const b = Math.max(0, -Math.cos(ph)); return b * amp * Math.abs(Math.sin(ph * n)); };

// ------------------------------------------------------------------ hair
// Hair is built in head-centre units (head radius 1). `ctx.add(geo, matrix,
// colour, bone)` adds a part; spikes/locks above the hat band are dropped
// when a hat covers the head.
const META = {
  short: { top: 1.16, hatK: 1 }, spiky: { top: 1.55, hatK: 1.04 }, long: { top: 1.18, hatK: 1 }, ponytail: { top: 1.16, hatK: 1 },
  buzz: { top: 1.08, hatK: 0.98 }, curly: { top: 1.38, hatK: 1.1 }, afro: { top: 2.1, hatK: 1.42, lift: 0.5 }, topknot: { top: 1.5, hatK: 1 },
  mohawk: { top: 2.0, hatK: 1 }, bald: { top: 1.02, hatK: 0.96 }, bun: { top: 1.55, hatK: 1 }, pompadour: { top: 1.7, hatK: 1.04 }, nika: { top: 1.8, hatK: 1.06 },
};
const ALIAS = { straight: 'long', braid: 'ponytail', bob: 'short', crew: 'buzz', shaved: 'buzz', dreads: 'curly', wavy: 'curly', twintails: 'ponytail', odango: 'bun', quiff: 'pompadour' };
export function styleId(s, look) {
  if (look && look.nika) return 'nika';
  if (s && META[s]) return s;
  if (s && ALIAS[s]) return ALIAS[s];
  return 'short';
}

/** Spike/lock: a cone from base point a to tip b; wide × thin at the base. */
function spike(h, a, b, wide, thin = wide, seg = 5, anchor = a) {
  h.add(Prim.cone(seg), between(a, b, thin, wide), h.col, h.bone, 0, anchor);
}
function blob(h, c, r, rot = [0, 0, 0], seg = [9, 7]) {
  const rr = Array.isArray(r) ? r : [r, r, r];
  h.add(Prim.sphere(seg[0], seg[1]), M(c[0], c[1], c[2], rot[0], rot[1], rot[2], rr), h.col, h.bone, 0, c);
}
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** A spike growing out of the cap at (th, ph), bent upward by `up`. */
function outSpike(h, th, ph, len, w, up = 0.25, rs = 1.02, thin) {
  const a = surf(th, ph, rs);
  const n = norm(add3(norm(a), [0, 1, 0], up));
  spike(h, a, add3(a, n, len), w, thin ?? w * 0.8);
}
/** Front fringe: n locks hanging over the forehead from the hairline. */
function fringe(h, n, spread, len, w, rs = 1.06, th0 = 42, skew = 0.25) {
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5;
    const ph = u * spread;
    const a = surf(th0, ph, rs);
    const b = surf(th0 + len, ph + u * 14 + skew * 6, rs + 0.02);
    spike(h, a, b, w, 0.075, 4, b);
  }
}

const HAIR = {
  bald() {},
  buzz(h) { h.cap(1.035, 62, 94, 112); },
  short(h) {
    h.cap(1.08, 60, 98, 126, napeZig(3, 12));
    fringe(h, 5, 100, 36, 0.24);
    outSpike(h, 12, 170, 0.32, 0.16, 0.6);
    outSpike(h, 20, 205, 0.26, 0.14, 0.5);
    // sideburns
    for (const s of [-1, 1]) spike(h, surf(78, s * 84, 1.05), surf(112, s * 86, 1.04), 0.12, 0.06, 4);
  },
  spiky(h, k = 1, n = 1) {
    h.cap(1.08, 58, 95, 118, napeZig(4, 10));
    const S = [[14, 180, 0.7, 0.34, 0.7], [18, 130, 0.62, 0.32, 0.5], [18, 230, 0.62, 0.32, 0.5], [34, 88, 0.6, 0.3, 0.45], [34, 272, 0.6, 0.3, 0.45],
      [44, 158, 0.62, 0.3, 0.2], [44, 202, 0.62, 0.3, 0.2], [66, 180, 0.55, 0.28, -0.1], [72, 125, 0.48, 0.26, -0.1], [72, 235, 0.48, 0.26, -0.1],
      [36, 32, 0.5, 0.26, 0.55], [36, 328, 0.5, 0.26, 0.55], [8, 60, 0.55, 0.28, 0.8]];
    for (const [th, ph, L, w, up] of S) outSpike(h, th, ph, L * k, w * (0.9 + 0.1 * k), up);
    if (n > 1) for (const [th, ph] of [[26, 0], [54, 100], [54, 260], [28, 200], [58, 145], [58, 215]]) outSpike(h, th, ph, 0.55 * k, 0.26, 0.6);
    fringe(h, 4, 90, 38, 0.26, 1.06, 40, 0.5);
  },
  nika(h) { HAIR.spiky(h, 1.35, 2); },
  long(h) {
    h.cap(1.08, 58, 102, 118);
    fringe(h, 5, 104, 40, 0.24);
    // side locks framing the face down to the chin
    for (const s of [-1, 1]) {
      const a = surf(64, s * 74, 1.07);
      spike(h, a, [a[0] - 0.05, -1.45, a[2] * 0.96 + s * 0.12], 0.3, 0.12, 5);
    }
    // the mass down the back hangs from hairTail (it sways and stays upright)
    h.withBone(B.hairTail, () => {
      blob(h, [-0.6, -0.72, 0], [0.42, 1.22, 0.94], [0, 0, -0.06]);
      spike(h, [-0.6, -1.5, 0], [-0.52, -2.3, 0], 0.74, 0.32, 6);
    });
  },
  ponytail(h) {
    h.cap(1.07, 58, 98, 116);
    fringe(h, 4, 90, 36, 0.24);
    const tie = surf(52, 180, 1.1);
    h.addC(Prim.sphere(8, 6), M(tie[0], tie[1], tie[2], 0, 0, 0, [0.17, 0.17, 0.2]), '#c8372d', h.bone);
    h.withBone(B.hairTail, () => {
      blob(h, [tie[0] - 0.2, tie[1] - 0.08, 0], [0.3, 0.26, 0.26], [0, 0, 0.7]);
      blob(h, [tie[0] - 0.36, tie[1] - 0.55, 0], [0.26, 0.42, 0.24], [0, 0, 0.15]);
      spike(h, [tie[0] - 0.4, tie[1] - 0.85, 0], [tie[0] - 0.3, tie[1] - 1.6, 0], 0.24, 0.2, 6);
    });
  },
  curly(h) {
    h.cap(1.1, 56, 100, 118);
    const P = [[8, 0], [24, 45], [24, 135], [24, 225], [24, 315], [44, 0], [44, 72], [44, 144], [44, 216], [44, 288], [66, 110], [66, 180], [66, 250], [84, 150], [84, 210], [52, 30], [52, 330]];
    for (const [th, ph] of P) { const c = surf(th, ph, 1.12); blob(h, c, 0.3, [0, 0, 0], [7, 5]); }
  },
  afro(h) {
    h.cap(1.08, 58, 100, 118);
    blob(h, [-0.36, 0.56, 0], 1.42, [0, 0, 0], [12, 9]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const c = [-0.36 + Math.cos(a) * 1.32 * 0.72, 0.56 + Math.sin(a) * 1.32, Math.sin(a * 2.3) * 0.5];
      if (c[0] > 0.2 && c[1] < 0.1) continue;
      blob(h, c, 0.36, [0, 0, 0], [7, 5]);
    }
    for (const s of [-1, 1]) blob(h, [-0.36, 0.56, s * 1.3], 0.38, [0, 0, 0], [7, 5]);
  },
  topknot(h) {
    h.cap(1.035, 60, 95, 112);
    const base = [0, 1.02, 0];
    h.addC(Prim.torus(0.35, 5, 10), mul(M(base[0], base[1] + 0.02, base[2], 0, 0, 0.35), M(0, 0, 0, Math.PI / 2, 0, 0, 0.14)), '#f4f1ea', h.bone);
    spike(h, [0.04, 1.0, 0], [-0.62, 1.28, 0], 0.16, 0.13, 6);
    blob(h, [-0.58, 1.26, 0], [0.12, 0.1, 0.12]);
  },
  mohawk(h) {
    h.cap(1.02, 62, 94, 118, null, 16, 5, 'stubble');
    const fins = [[18, 0, 0.75], [4, 0, 0.9], [14, 180, 0.95], [34, 180, 0.9], [56, 180, 0.75], [78, 180, 0.5]];
    for (const [th, ph, L] of fins) {
      const a = surf(th, ph, 1.0);
      const n = norm(add3(norm(a), [ph ? -0.35 : 0.3, 0.5, 0]));
      spike(h, a, add3(a, n, L), 0.36, 0.08, 4);
    }
  },
  bun(h) {
    h.cap(1.07, 58, 98, 116);
    fringe(h, 4, 88, 32, 0.22);
    const c = [-0.55, 0.92, 0];
    blob(h, c, 0.44, [0, 0, 0], [10, 8]);
    h.addC(Prim.torus(0.3, 5, 10), mul(M(-0.36, 0.7, 0, 0, 0, 0.9), M(0, 0, 0, Math.PI / 2, 0, 0, 0.26)), '#c8372d', h.bone);
  },
  pompadour(h) {
    h.cap(1.07, 60, 98, 116);
    blob(h, [0.42, 0.98, 0], [0.9, 0.52, 0.78], [0, 0, -0.38], [11, 8]);
    spike(h, [0.9, 1.1, 0], [1.3, 0.72, 0], 0.3, 0.2, 5);
  },
};

// ------------------------------------------------------------------ hats
// Hats sit on the head at their band; `k` scales them for big hair.
const STRAW = '#f0cd62', STRAW_D = '#e9c150', BAND_RED = '#c8372d', GOLD = '#e0b24a';
const HAT_COVER = { straw: 1, captain: 1, tricorne: 1, cowboy: 1, marine: 1, pinkhat: 1, tophat: 1, topHat: 1, beanie: 1, bandana: 1, cap: 1, helm: 1 };
function hatKind(hat, look) {
  if (!hat) return null;
  if (hat === 'horns' && !(look && look.hatColor)) return 'helm';
  return HATS[hat] ? hat : 'cap';
}
const disc = (h, y, r, t, col, rx = 0, rz = 0, sx = 1) => h.addC(Prim.cyl(18), mul(M(0, y, 0, rx, 0, rz), M(0, 0, 0, 0, 0, 0, [r * sx, t, r])), col, h.bone);
const HATS = {
  straw(h) {
    disc(h, 0.52, 1.72, 0.07, STRAW, 0, 0.08);
    h.addC(Prim.sphere(14, 7), M(0, 0.58, 0, 0, 0, 0.08, [0.96, 0.66, 0.96]), STRAW_D, h.bone);
    h.addC(Prim.cyl(16, true), M(0.02, 0.68, 0, 0, 0, 0.08, [0.975, 0.22, 0.975]), BAND_RED, h.bone);
  },
  captain(h, col) {
    const c = col || '#2c2831';
    h.addC(Prim.frustum(0.84, 14), M(0, 0.98, 0, 0, 0, 0, [1.02, 0.9, 1.02]), c, h.bone);
    h.addC(Prim.sphere(12, 6), M(0, 1.42, 0, 0, 0, 0, [0.86, 0.3, 0.86]), c, h.bone);
    disc(h, 0.56, 1.5, 0.08, shade(c, -0.12), 0, 0, 1.1);
    h.addC(Prim.torus(0.06, 4, 20), mul(M(0, 0.57, 0), M(0, 0, 0, Math.PI / 2, 0, 0, [1.66, 1.5, 1])), GOLD, h.bone);
    spike({ ...h, col: lin('#c8372d') }, [-0.35, 1.3, 0.55], [-1.2, 1.9, 1.1], 0.34, 0.1, 5);
    h.addC(Prim.sphere(8, 6), M(0.95, 1.05, 0, 0, 0, 0, [0.08, 0.2, 0.2]), '#f4f1ea', h.bone);
  },
  tricorne(h, col) {
    const c = col || '#302b35';
    h.addC(Prim.frustum(0.8, 14), M(0, 0.86, 0, 0, 0, 0, [1.0, 0.62, 1.0]), c, h.bone);
    h.addC(Prim.sphere(12, 6), M(0, 1.16, 0, 0, 0, 0, [0.8, 0.26, 0.8]), c, h.bone);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 3;
      const x = Math.cos(a), z = Math.sin(a);
      h.addC(Prim.rbox(0.3), mul(M(x * 1.02, 0.78, z * 1.02, 0, -a, 0), M(0, 0, 0, 0, 0, 0.9, [0.36, 0.06, 1.0])), c, h.bone);
      h.addC(Prim.rbox(0.3), mul(M(x * 1.14, 0.92, z * 1.14, 0, -a, 0), M(0, 0, 0, 0, 0, 0.9, [0.1, 0.05, 1.0])), GOLD, h.bone);
    }
    disc(h, 0.62, 1.16, 0.06, c);
  },
  cowboy(h, col) {
    const c = col || '#9a6a3f';
    h.addC(Prim.sphere(12, 8), M(0, 0.8, 0, 0, 0, 0, [0.9, 0.72, 0.84]), c, h.bone);
    h.addC(Prim.cyl(14, true), M(0, 0.66, 0, 0, 0, 0, [0.93, 0.2, 0.88]), shade(c, -0.5), h.bone);
    disc(h, 0.56, 1.82, 0.07, shade(c, -0.1), 0, 0.06);
    for (const s of [-1, 1]) h.addC(Prim.rbox(0.4), M(0, 0.66, s * 1.55, s * 0.55, 0, 0, [1.2, 0.05, 0.42]), shade(c, -0.1), h.bone);
  },
  marine(h) {
    const white = '#f6f5f0';
    h.addC(Prim.sphere(14, 8), M(0, 0.52, 0, 0, 0, 0, [1.1, 0.74, 1.1]), white, h.bone);
    h.addC(Prim.cyl(16, true), M(0, 0.5, 0, 0, 0, 0, [1.13, 0.2, 1.13]), '#27466e', h.bone);
    h.addC(Prim.cyl(12, false), mul(M(0.88, 0.42, 0, 0, 0, -0.12), M(0, 0, 0, 0, 0, 0, [0.62, 0.05, 0.92])), '#1d1a20', h.bone);
    // neck curtain down the back
    h.add(lathe([[1.14, -0.62], [1.14, 0.46]], 12, Math.PI * 0.62, Math.PI * 0.76), M(), white, h.bone);
    h.add(lathe([[1.1, -0.62], [1.1, 0.46]], 12, Math.PI * 0.62, Math.PI * 0.76, true), M(), shade(white, -0.2), h.bone);
    h.addC(Prim.torus(0.35, 4, 8), M(0.98, 0.94, 0, 0, Math.PI / 2, 0, 0.1), '#2f5f96', h.bone);
  },
  tophat(h, col, cross) {
    const c = col || '#2b2631';
    disc(h, 0.66, 1.34, 0.07, shade(c, -0.1));
    h.addC(Prim.cyl(14), M(0, 1.34, 0, 0, 0, 0, [0.82, 1.36, 0.82]), c, h.bone);
    h.addC(Prim.cyl(14, true), M(0, 0.84, 0, 0, 0, 0, [0.84, 0.3, 0.84]), shade(c, -0.35), h.bone);
    if (cross) for (const s of [-1, 1]) h.addC(Prim.rbox(0.3), M(0.84, 1.42, 0, s * 0.8, 0, 0, [0.05, 0.42, 0.08]), '#ffffff', h.bone);
  },
  pinkhat(h, col) { HATS.tophat(h, col || '#f190b7', true); },
  topHat(h, col) { HATS.tophat(h, col); },
  beanie(h, col, look) {
    const c = col || '#e74c3c';
    h.add(capGeo(1.14, 62, 88, 100), M(), c, h.bone);
    h.addC(Prim.cyl(16, true), M(0.03, 0.36, 0, 0, 0, -0.12, [1.16, 0.28, 1.14]), shade(c, -0.12), h.bone);
    if (((look && look.seed) || 0) % 3 !== 0) h.addC(Prim.sphere(8, 6), M(0, 1.26, 0, 0, 0, 0, 0.27), mixHex(c, '#ffffff', 0.55), h.bone);
  },
  bandana(h, col) {
    const c = col || '#2f5f96';
    h.add(capGeo(1.12, 56, 86, 98), M(), c, h.bone);
    const k = surf(90, 180, 1.12);
    h.addC(Prim.sphere(8, 6), M(k[0], k[1], k[2], 0, 0, 0, [0.16, 0.18, 0.2]), shade(c, -0.2), h.bone);
    for (const s of [-1, 1]) spike({ ...h, col: lin(shade(c, -0.1)) }, k, [k[0] - 0.45, k[1] - 0.55, s * 0.25], 0.2, 0.05, 4);
  },
  headband(h, col) {
    const c = col || '#2e2a31';
    h.add(lathe([[1.1, 0.3], [1.1, 0.52]], 16), M(0, 0, 0, 0, 0, -0.1), c, h.bone);
    const k = surf(84, 180, 1.12);
    h.addC(Prim.sphere(7, 5), M(k[0], k[1] + 0.3, k[2], 0, 0, 0, 0.14), shade(c, 0.2), h.bone);
    for (const s of [-1, 1]) spike({ ...h, col: lin(c) }, [k[0], k[1] + 0.3, k[2]], [k[0] - 0.5, k[1] - 0.3, s * 0.3], 0.16, 0.04, 4);
  },
  goggles(h, col) {
    h.add(lathe([[1.1, 0.48], [1.1, 0.64]], 16), M(0, 0, 0, 0, 0, -0.05), '#6b4a32', h.bone);
    for (const s of [-1, 1]) {
      const a = surf(52, s * 27, 1.1);
      const n = norm(a);
      h.addC(Prim.cyl(10), between(a, add3(a, n, 0.2), 0.27), '#c9a04a', h.bone);
      h.addC(Prim.cyl(10), between(add3(a, n, 0.15), add3(a, n, 0.22), 0.19), col || '#f0a53a', h.bone);
    }
  },
  horns(h, col) {
    const c = col || '#efe4c8';
    for (const s of [-1, 1]) {
      const a = surf(34, s * 60, 0.96);
      const b = [a[0] + 0.1, a[1] + 0.5, a[2] + s * 0.45];
      h.addC(Prim.frustum(0.62, 7), between(a, b, 0.2), c, h.bone);
      spike({ ...h, col: lin(c) }, b, [b[0] + 0.2, b[1] + 0.6, b[2] + s * 0.05], 0.13, 0.13, 6);
    }
  },
  helm(h) {
    const metal = '#aab5bd';
    h.add(capGeo(1.13, 70, 88, 96), M(), metal, h.bone);
    h.addC(Prim.cyl(16, true), M(0, 0.42, 0, 0, 0, -0.06, [1.15, 0.2, 1.15]), '#8a6a44', h.bone);
    h.addC(Prim.rbox(0.3), M(0, 1.0, 0, 0, 0, 0, [0.9, 0.12, 0.1]), '#8a6a44', h.bone);
    HATS.horns(h, '#efe4c8');
  },
  crown(h, col, look, top) {
    const c = col || '#ffd54f';
    const y = top - 0.12;
    h.add(lathe([[0.62, y], [0.66, y + 0.3]], 14), M(), c, h.bone);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      spike({ ...h, col: lin(c) }, [Math.cos(a) * 0.64, y + 0.26, Math.sin(a) * 0.64], [Math.cos(a) * 0.7, y + 0.62, Math.sin(a) * 0.7], 0.14, 0.1, 4);
    }
    h.addC(Prim.sphere(6, 5), M(0.66, y + 0.14, 0, 0, 0, 0, 0.09), '#e53935', h.bone);
  },
  halo(h, col, look, top) {
    h.addC(Prim.torus(0.1, 5, 18), M(0, top + 0.42, 0, Math.PI / 2, 0, 0, 0.72), col || '#ffe082', h.bone);
  },
  bubble() { /* a transparent bubble helmet: drawn as an effect (see model.js) */ },
  antlers(h, col) {
    const c = lin(col || '#8d6e63');
    for (const s of [-1, 1]) {
      const a = surf(28, s * 50, 0.96), b = [a[0] - 0.1, a[1] + 0.8, a[2] + s * 0.6];
      h.addC(Prim.cyl(6), between(a, b, 0.09), c, h.bone);
      h.addC(Prim.cyl(6), between(add3(a, [-0.05, 0.4, s * 0.3]), [a[0] + 0.35, a[1] + 0.75, a[2] + s * 0.4], 0.07), c, h.bone);
      h.addC(Prim.cyl(6), between(add3(a, [-0.08, 0.62, s * 0.46]), [b[0] - 0.3, b[1] + 0.35, b[2] + s * 0.1], 0.06), c, h.bone);
    }
  },
  cap(h, col) {
    const c = col || '#5d6d7e';
    h.add(capGeo(1.12, 64, 88, 96), M(), c, h.bone);
    h.addC(Prim.cyl(12), mul(M(0.9, 0.46, 0, 0, 0, -0.18), M(0, 0, 0, 0, 0, 0, [0.62, 0.05, 0.86])), shade(c, -0.25), h.bone);
  },
};

// ------------------------------------------------------------------ the body
/** Colours of a look (matching the 2D renderer's defaults). */
export function palette(look) {
  const white = !!look.furWhite;
  const skin = white ? '#fafafa' : look.skin || '#f1c9a0';
  const bottom = look.bottom || '#2d3436';
  return {
    skin,
    face: white ? '#fafafa' : look.fur && look.furFace ? look.fur : skin,
    hair: white ? '#fafafa' : look.nika ? '#ffffff' : look.hairColor || '#2d2d2d',
    top: look.top || '#d63031', bottom,
    shoes: look.shoes || '#3b2a1a',
    belt: look.belt || shade(bottom, -0.32),
    hand: white ? '#fafafa' : look.hand || skin,
    sleeve: look.sleeve || null,
    fur: white ? '#fafafa' : look.fur || look.hairColor || skin,
  };
}

/** Cache key: everything the geometry depends on. */
export function geoKey(look, wpn) {
  const L = look;
  return [L.race, L.skin, L.hair, L.hairColor, L.top, L.bottom, L.shoes, L.hat, L.hatColor, L.coat, L.openShirt ? 1 : 0, L.sleeve, L.noSleeves ? 1 : 0,
    L.hand, L.arms, L.legs, L.bulk, L.ears, L.fur, L.furFace ? 1 : 0, L.furWhite ? 1 : 0, L.tail, L.fin ? 1 : 0, L.wings, L.nose, L.kind, L.vest, L.belt,
    L.sandals ?? ((L.seed || 0) % 4 === 0 ? 's' : 'b'), L.neck, L.nika ? 1 : 0, L.drums ? 1 : 0, L.seed % 3, wpn ? `${wpn.kind}${wpn.count}` : '-'].join('|');
}

/** Build a character's geometry (not cached; see getBody). */
export function buildBody(look, wpn) {
  const d = dims(look);
  const pal = palette(look);
  const b = new Builder();
  const Bk = d.Bk;
  const dep = d.depth;
  const skinArm = pal.sleeve || pal.skin;
  const add = (g, m, col, bone, part = 0) => b.add(g, m, col, bone, part);

  // ---- pelvis + belt
  add(lathe([[0.02, -0.19], [0.1 * Bk, -0.18], [0.143 * Bk, -0.125], [0.151 * Bk, -0.05], [0.142 * Bk, 0.03], [0.13 * Bk, 0.09]], 12), M(0, 0, 0, 0, 0, 0, [dep + 0.03, 1, 1]), pal.bottom, B.hips);
  add(Prim.cyl(14, true), M(0, 0.02, 0, 0, 0, 0, [0.152 * Bk * (dep + 0.03), 0.055, 0.152 * Bk]), pal.belt, B.hips);
  add(Prim.rbox(0.3), M(0.152 * Bk * (dep + 0.03) + 0.004, 0.02, 0, 0, 0, 0, [0.008, 0.026, 0.03]), '#ffd54f', B.hips);

  // ---- torso (chest frame = hip pivot), shirt / open shirt / vest
  const cl = d.chestLen / 0.46;
  const tp = [[0.132, -0.03], [0.138, 0.08], [0.15, 0.18], [0.17, 0.28], [0.186, 0.36], [0.182, 0.41], [0.148, 0.448], [0.09, 0.472], [0.05, 0.482]]
    .map(([r, y]) => [r * Bk, y * cl]);
  const torsoM = M(0, 0, 0, 0, 0, 0, [dep, 1, 1]);
  if (look.openShirt) {
    add(lathe(tp, 14), torsoM, pal.skin, B.chest);
    const sp = tp.map(([r, y]) => [r + 0.007, y]);
    add(lathe(sp, 14, 0.42, TAU - 0.84), torsoM, pal.top, B.chest);
  } else {
    add(lathe(tp, 14), torsoM, pal.top, B.chest);
    // collar
    add(Prim.torus(0.28, 4, 10), M(0.012, tp[7][1] - 0.004, 0, Math.PI / 2, 0, 0, [0.075 * Bk, 0.07 * Bk, 0.06]), shade(pal.top, -0.25), B.chest);
  }
  if (look.vest) add(lathe(tp.slice(0, 7).map(([r, y]) => [r + 0.013, y]), 14, 0.62, TAU - 1.24), torsoM, look.vest, B.chest);
  // neck
  add(Prim.cyl(8, true), M(0, d.chestLen + d.neck * 0.5 + 0.005, 0, 0, 0, 0, [0.046 * (1 + (Bk - 1) * 0.5), d.neck + 0.07, 0.048 * (1 + (Bk - 1) * 0.5)]), pal.skin, B.chest);
  if (look.gills) for (const s of [-1, 1]) add(Prim.rbox(0.4), M(0.02, d.chestLen + 0.04, s * 0.04, 0, 0, 0, [0.02, 0.012, 0.005]), shade(pal.skin, -0.3), B.chest);

  // ---- head (+ ears, race features, hair, hat)
  const R = d.headR;
  const HM = (m) => mul(M(0, d.hc, 0, 0, 0, 0, R), m || M());
  const hb = B.head;
  add(headGeo(), HM(), pal.face, hb);
  const style = styleId(look.hair, look);
  const meta = META[style];
  const kind = hatKind(look.hat, look);
  const cover = kind && HAT_COVER[kind];
  // hair helper (head-centre units)
  const hairCol = lin(style === 'mohawk' ? pal.hair : pal.hair);
  const stubble = lin(mixHex(pal.face, pal.hair, 0.3));
  const h = {
    col: hairCol, bone: hb,
    add(g, m, col, bone, part, anchor) {
      // drop hair poking through a covering hat (anything anchored above the band)
      if (cover && anchor && anchor[1] > 0.5 && !(style === 'afro')) return;
      b.add(g, HM(m), col, bone, 0);
    },
    addC(g, m, col, bone) { b.add(g, HM(m), col, bone, 0); },
    cap(rs, f, s, bk, zig, U, V, tone) { b.add(capGeo(rs, f, s, bk, zig, U, V), HM(), tone === 'stubble' ? stubble : hairCol, hb, 0); },
    withBone(bone, fn) { const o = this.bone; this.bone = bone; fn(); this.bone = o; },
  };
  // hairTail geometry: head-centre units; the bone sits at the head centre
  const hTail = {
    ...h,
    add(g, m, col, bone, part, anchor) {
      if (bone !== B.hairTail) return h.add(g, m, col, bone, part, anchor);
      b.add(g, mul(M(0, 0, 0, 0, 0, 0, R), m), col, bone, 0);
    },
    addC(g, m, col, bone) {
      if (bone !== B.hairTail) return h.addC(g, m, col, bone);
      b.add(g, mul(M(0, 0, 0, 0, 0, 0, R), m), col, bone, 0);
    },
  };
  (HAIR[style] || HAIR.short)(hTail);
  // ears
  if (look.ears) minkEars(b, HM, look, pal, hb);
  else for (const s of [-1, 1]) { const e = surf(96, s * 88, 0.98); add(Prim.sphere(7, 5), HM(M(e[0] - 0.03, e[1], e[2], 0, 0, s * 0.1, [0.2, 0.3, 0.14])), pal.face, hb); }
  if (look.fin && look.kind !== 'Octopus') {
    const a = surf(18, 180, 0.9);
    b.add(Prim.cone(4), HM(between(a, [a[0] - 0.55, a[1] + 0.85, 0], 0.08, 0.42)), shade(pal.skin, -0.18), hb);
  }
  if (look.race === 'skypiean') for (const s of [-1, 1]) {
    const a = surf(22, s * 28, 1.0), t = [a[0] + 0.25, a[1] + 0.5, a[2] + s * 0.2];
    b.add(Prim.cyl(5), HM(between(a, t, 0.035)), pal.skin, hb);
    b.add(Prim.sphere(6, 5), HM(M(t[0], t[1], t[2], 0, 0, 0, 0.09)), pal.skin, hb);
  }
  if (look.nose === 'long') b.add(Prim.frustum(0.75, 7), HM(between([0.9, -0.28, 0], [1.95, -0.22, 0], 0.075)), pal.face, hb);
  else if (look.nose === 'red') b.add(Prim.sphere(8, 6), HM(M(0.98, -0.34, 0, 0, 0, 0, 0.17)), '#e53935', hb);
  if (look.kind === 'Saw Shark') {
    b.add(Prim.rbox(0.3), HM(M(1.5, -0.3, 0, 0, 0, 0.05, [0.6, 0.06, 0.1])), '#9fb0bf', hb);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.add(Prim.cone(3), HM(M(1.1 + i * 0.18, -0.3, s * 0.1, s * Math.PI / 2, 0, 0, [0.04, 0.08, 0.03])), '#f4f1ea', hb);
  }
  // hat
  if (kind && HATS[kind]) {
    const k = cover ? meta.hatK : 1;
    const lift = cover ? meta.lift || 0 : 0;
    const hh = { ...h, add: h.addC, bone: hb };
    hh.addC = (g, m, col, bone) => b.add(g, HM(mul(M(0, 0.45 + lift, 0, 0, 0, 0, k), mul(M(0, -0.45, 0), m))), col, bone, 0);
    hh.add = (g, m, col, bone) => hh.addC(g, m, col, bone);
    HATS[kind](hh, look.hatColor, look, meta.top);
  }

  // ---- arms
  for (const [s, U, F, Hd, part] of [[1, B.uarmR, B.farmR, 'R', 1], [-1, B.uarmL, B.farmL, 'L', 2]]) {
    const r0 = 0.05 * Bk, r1 = 0.043 * Bk, r2 = 0.036 * Bk;
    add(tcap(r0, r1, d.A1, 8, 2), M(), skinArm, U);
    if (!pal.sleeve && !look.noSleeves) add(tcap(r0 * 1.28, r0 * 1.16, d.A1 * 0.4, 9, 2), M(), look.openShirt ? pal.top : pal.top, U);
    add(tcap(r1, r2, d.A2, 8, 2), M(), skinArm, F, part);
    if (d.Am > 1.2) add(Prim.sphere(7, 5), M(0, -d.A2 * 0.5, 0, 0, 0, 0, r1 * 1.12), skinArm, F, part);
    if (pal.sleeve) add(tcap(r2 * 1.2, r2 * 1.15, 0.02, 8, 1), M(0, -d.A2 + 0.02, 0), shade(pal.sleeve, -0.2), F, part);
    hands(b, Hd, s, pal.hand, Bk, part);
  }

  // ---- legs + feet
  const sandals = look.sandals ?? ((look.seed || 0) % 4 === 0);
  for (const [T, S, Ft, part] of [[B.thighR, B.shinR, B.footR, 3], [B.thighL, B.shinL, B.footL, 4]]) {
    add(tcap(0.078 * Bk, 0.063 * Bk, d.T1, 8, 2), M(), pal.bottom, T);
    add(tcap(0.061 * Bk, 0.047 * Bk, d.T2, 8, 2), M(), pal.bottom, S, part);
    add(Prim.frustum(0.9, 9), M(0, -d.T2 * 0.86, 0, 0, 0, 0, [0.056 * Bk, 0.05, 0.056 * Bk]), shade(pal.bottom, -0.25), S, part);
    if (sandals) {
      add(Prim.rbox(0.45), M(0.045, -0.052, 0, 0, 0, 0, [0.095, 0.024, 0.042 * Bk]), pal.skin, Ft, part);
      add(Prim.rbox(0.3), M(0.045, -0.071, 0, 0, 0, 0, [0.105, 0.008, 0.048 * Bk]), '#6d4c41', Ft, part);
      add(Prim.torus(0.25, 4, 8), M(0.06, -0.05, 0, 0, 0, Math.PI / 2, [0.03, 0.045 * Bk, 0.03]), pal.shoes, Ft, part);
      add(Prim.cyl(7, true), M(0, -0.02, 0, 0, 0, 0, [0.043 * Bk, 0.05, 0.043 * Bk]), pal.skin, Ft, part);
    } else {
      add(Prim.rbox(0.4), M(0.04, -0.035, 0, 0, 0, 0, [0.108, 0.042, 0.052 * Bk]), pal.shoes, Ft, part);
      add(Prim.rbox(0.3), M(0.04, -0.07, 0, 0, 0, 0, [0.11, 0.01, 0.054 * Bk]), shade(pal.shoes, -0.35), Ft, part);
      add(Prim.cyl(8), M(-0.005, 0.02, 0, 0, 0, 0, [0.05 * Bk, 0.1, 0.05 * Bk]), pal.shoes, Ft, part);
    }
  }

  // ---- coat: a cape over the shoulders, the tail swings from the waist
  if (look.coat) {
    const c = look.coat, lining = shade(c, -0.28);
    const gap = 0.55;
    const up = [[0.2, 0.0], [0.205, 0.2], [0.214, 0.36], [0.2, 0.43], [0.12, 0.475]].map(([r, y]) => [r * Bk, y * cl]);
    const cm = M(-0.01, 0, 0, 0, 0, 0, [dep + 0.12, 1, 1.02]);
    add(lathe(up, 14, gap, TAU - 2 * gap), cm, c, B.chest);
    add(lathe(up.map(([r, y]) => [r - 0.008, y]), 14, gap, TAU - 2 * gap, true), cm, lining, B.chest);
    const lo = [[0.3, -0.52], [0.26, -0.26], [0.212, 0.02]].map(([r, y]) => [r * Bk, y]);
    add(lathe(lo, 14, gap + 0.15, TAU - 2 * gap - 0.3), cm, c, B.coatTail);
    add(lathe(lo.map(([r, y]) => [r - 0.008, y]), 14, gap + 0.15, TAU - 2 * gap - 0.3, true), cm, lining, B.coatTail);
  }
  if (look.drums) {
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * 0.55 + (k / 5) * Math.PI * 0.9;
      add(Prim.cyl(8), M(Math.cos(a) * 0.5 - 0.15, d.chestLen + 0.1 + Math.sin(k / 5 * Math.PI) * 0.35, Math.sin(a) * 0.5, Math.PI / 2, 0, 0, [0.08, 0.07, 0.08]), '#ffb300', B.chest);
    }
  }
  // ---- tail, wings
  if (look.tail) {
    const fl = look.tail === 'fluffy';
    const r = fl ? 0.055 : 0.024;
    const pts = [[0, 0, 0], [-0.16, 0.02, 0], [-0.3, 0.12, 0], [-0.36, 0.3, 0]];
    for (let i = 0; i < 3; i++) add(Prim.cyl(6), between(pts[i], pts[i + 1], r * (1 - i * 0.12) * (fl ? 1 + i * 0.25 : 1)), pal.fur, B.tail);
    for (let i = 1; i < 4; i++) add(Prim.sphere(6, 4), M(...pts[i], 0, 0, 0, r * (fl ? 1.35 + i * 0.1 : 1)), pal.fur, B.tail);
  }
  if (look.wings === 'sky' || look.wings === 'lunar') {
    const lunar = look.wings === 'lunar';
    const col = lunar ? '#1e1e24' : '#ffffff';
    for (const [s, W] of [[1, B.wingR], [-1, B.wingL]]) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = (lunar ? 0.35 : 0.55) - i * 0.42;
        const L = (lunar ? 0.62 : 0.34) * (1 - i * 0.12);
        add(Prim.sphere(8, 5), mul(M(0, 0, 0, s * (Math.PI / 2 - a), 0, 0), M(0, L * 0.5, 0, 0, 0, 0, [0.03, L * 0.55, lunar ? 0.11 : 0.085])), i ? shade(col, lunar ? 0.1 : -0.08) : col, W);
      }
    }
  }

  // ---- sheathed weapons
  if (wpn && wpn.kind === 'sword') {
    const cols = ['#ecf0f1', '#2c3e50', '#c0392b'];
    for (let k = 0; k < Math.min(3, wpn.count || 1); k++) {
      const z = -(0.165 * Bk + 0.02 + k * 0.035);
      const a = [0.1 - k * 0.03, 0.02 + k * 0.01, z], e = [-0.62 - k * 0.04, -0.4 + k * 0.03, z - 0.1];
      add(Prim.cyl(6), between(a, e, 0.019), cols[k], B.sheath);
      const dir = norm([a[0] - e[0], a[1] - e[1], a[2] - e[2]]);
      add(Prim.cyl(8), between(add3(a, dir, -0.01), add3(a, dir, 0.012), 0.036), GOLD, B.hilts);
      add(Prim.cyl(6), between(add3(a, dir, 0.012), add3(a, dir, 0.23), 0.017), k === 2 ? '#fafafa' : '#2d2a32', B.hilts);
    }
  } else if (wpn && wpn.kind === 'gun') {
    add(Prim.rbox(0.4), M(0.02, -0.06, 0.17 * Bk, 0, 0, 0.3, [0.05, 0.08, 0.02]), '#6d4c41', B.sheath);
    add(Prim.rbox(0.4), M(0.05, 0.03, 0.17 * Bk, 0, 0, 0.9, [0.02, 0.05, 0.018]), '#8d5b33', B.hilts);
  } else if (wpn && (wpn.kind === 'axe' || wpn.kind === 'staff')) {
    const a = [-0.16 * Bk, d.chestLen - 0.02, 0.22], e = [-0.17 * Bk, 0.05, -0.28];
    add(Prim.cyl(6), between(a, e, 0.018, 0.018, 0.5), wpn.kind === 'axe' ? '#6d4c41' : '#4fc3f7', B.backWpn);
    if (wpn.kind === 'axe') add(Prim.rbox(0.3), M(a[0] - 0.02, a[1] + 0.1, a[2] + 0.05, 0.9, 0, 0, [0.02, 0.12, 0.16]), '#cfd8dc', B.backWpn);
  }

  const geo = b.build();
  return { geo, dims: d, style, meta, hatKind: kind, bubble: kind === 'bubble' };
}

function minkEars(b, HM, look, pal, hb) {
  const fur = pal.fur, inner = look.kind === 'Panda' ? '#2b2b2b' : mixHex(fur, '#f48fb1', 0.55);
  const col = look.kind === 'Panda' ? '#2b2b2b' : fur;
  for (const s of [-1, 1]) {
    const a = surf(34, s * 52, 0.92);
    if (look.ears === 'round') {
      b.add(Prim.sphere(8, 6), HM(M(a[0] - 0.05, a[1] + 0.12, a[2] + s * 0.06, 0, 0, 0, [0.14, 0.3, 0.3])), col, hb);
      b.add(Prim.sphere(7, 5), HM(M(a[0] + 0.05, a[1] + 0.12, a[2] + s * 0.06, 0, 0, 0, [0.08, 0.18, 0.18])), inner, hb);
    } else if (look.ears === 'long') {
      const t = [a[0] - 0.1, a[1] + 1.05, a[2] + s * 0.18];
      b.add(Prim.sphere(8, 6), HM(between(a, t, 0.1, 0.22)), col, hb);
      b.add(Prim.sphere(6, 5), HM(between(add3(a, [0.07, 0.15, 0]), add3(t, [0.07, -0.12, 0]), 0.04, 0.12)), inner, hb);
    } else {
      const t = [a[0] - 0.02, a[1] + 0.62, a[2] + s * 0.22];
      b.add(Prim.cone(4), HM(between(a, t, 0.1, 0.3)), col, hb);
      b.add(Prim.cone(4), HM(between(add3(a, [0.07, 0.04, 0]), add3(t, [0.07, -0.16, 0]), 0.04, 0.17)), inner, hb);
    }
  }
}

/** Hand shapes (fist / open palm / pointing finger) on child bones of hand R/L. */
function hands(b, H, s, col, Bk, part) {
  const k = 0.95 + (Bk - 1) * 0.6;
  const th = -s; // thumb side on local Z (right hand: -Z)
  const fist = B['fist' + H], palm = B['palm' + H], finger = B['finger' + H];
  const S = (x, y, z) => [x * k, y * k, z * k];
  // fist: a rounded block of knuckles with the thumb wrapped over the front
  for (const bone of [fist, finger]) {
    b.add(Prim.rbox(0.42), M(0, -0.045 * k, 0, 0, 0, 0, S(0.033, 0.046, 0.043)), col, bone, part);
    b.add(Prim.sphere(6, 5), M(-0.012 * k, -0.055 * k, th * 0.036 * k, 0, 0, 0, S(0.016, 0.03, 0.016)), shade(col, -0.06), bone, part);
  }
  b.add(tcap(0.011 * k, 0.009 * k, 0.07 * k, 6, 2), M(0.02 * k, -0.085 * k, -th * 0.02 * k), col, finger, part);
  // open palm: flat hand, fingers together (a mitten), thumb out
  b.add(Prim.rbox(0.4), M(0, -0.05 * k, 0, 0, 0, 0, S(0.018, 0.052, 0.046)), col, palm, part);
  b.add(Prim.rbox(0.45), M(0, -0.118 * k, 0, 0, 0, 0, S(0.014, 0.036, 0.043)), col, palm, part);
  b.add(tcap(0.011 * k, 0.009 * k, 0.05 * k, 6, 2), mul(M(-0.004, -0.03 * k, th * 0.04 * k), M(0, 0, 0, th * 0.7, 0, 0)), col, palm, part);
}

// ------------------------------------------------------------------ cache
const BODIES = new Map();
/** A shared built body for a look (ref-counted; call releaseBody when done). */
export function getBody(look, wpn) {
  const key = geoKey(look, wpn);
  let e = BODIES.get(key);
  if (!e) {
    e = { key, ...buildBody(look, wpn), refs: 0 };
    e.geo.userData.shared = true;
    BODIES.set(key, e);
  }
  e.refs++;
  return e;
}
export function releaseBody(e) {
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    // keep a few recently used bodies around (NPCs streaming in and out)
    e.idleT = performance.now();
    setTimeout(() => {
      if (e.refs <= 0 && BODIES.get(e.key) === e && performance.now() - e.idleT >= 29000) { BODIES.delete(e.key); e.geo.dispose(); }
    }, 30000);
  }
}
export function bodyCacheSize() { return BODIES.size; }

export { THREE };
