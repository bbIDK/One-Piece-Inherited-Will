// Builds a character's merged, skinned geometry from its look: head (with the
// face decal patch), 3D hair per style, hats, torso and clothes, limbs, hands
// (fist / open palm / pointing finger), boots or sandals, coat, race features
// (mink ears and tail, fins, wings, long arms and legs, bulk) and sheathed
// weapons. Every part is rigidly bound to one bone (see bones.js).
//
// Three detail levels: 0 (near, ~1.5k triangles), 1 (far crowds, ~0.7k) and
// -1 (the first-person viewmodel: articulated fingers). Geometry is cached
// per look signature + level and shared (ref-counted) by every character
// that looks the same.
import { Builder, Prim, M, between, mul, grid, lathe, tcap, lin, THREE } from './geom.js';
import { B, dims } from './bones.js';
import { buildFigure } from './body.js';
import { FACE_TOP, FACE_BOTTOM } from './face.js';
import { shade, mixHex } from '../../core/math.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// detail per level: [near, far, viewmodel]
const DETAIL = {
  0: { head: [20, 16], cap: [16, 6], cone: 5, sph: [7, 5], blob: [10, 7], limb: [9, 3], lathe: 14, rbox: [7, 6], rboxS: [6, 5], hat: 18, hatS: [12, 7], fringe: 1, hands: 1, cloth: 1 },
  1: { head: [8, 6], cap: [10, 4], cone: 3, sph: [5, 3], blob: [6, 4], limb: [5, 1], lathe: 7, rbox: [5, 4], rboxS: [4, 3], hat: 9, hatS: [7, 4], fringe: 0, hands: 0, cloth: 0 },
  [-1]: { head: [14, 10], cap: [16, 6], cone: 5, sph: [8, 6], blob: [10, 7], limb: [10, 3], lathe: 14, rbox: [10, 8], rboxS: [8, 6], hat: 16, hatS: [12, 8], fringe: 1, hands: 2, cloth: 1 },
};

// ------------------------------------------------------------------ head shape
// The head is built the way anime heads are drawn: a round cranium that
// carries on behind the neck, cheek planes, a jawline from under the ears to
// the chin (broad and square for men, narrow and pointed for women), a flat
// front where the eyes are painted and flattened temples. It is a signed
// distance field sampled along rays from the head centre, so every part
// that sits on the head (face decal, hair, ears, hats) finds its surface.
// Head units: radius ~1, +X forward, +Y up, +Z the character's right.
const clampU = (v, a, b) => (v < a ? a : v > b ? b : v);
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
// (Math.sqrt rather than Math.hypot: these run tens of thousands of times per new head)
function ellipsoid(px, py, pz, rx, ry, rz) {
  const ax = px / rx, ay = py / ry, az = pz / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
function capsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clampU((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const x = pax - bax * h, y = pay - bay * h, z = paz - baz * h;
  return Math.sqrt(x * x + y * y + z * z) - r;
}
const sphere = (px, py, pz, r) => Math.sqrt(px * px + py * py + pz * pz) - r;

// ---- head-shape parameters (character creation: face shape, jaw, chin, nose, cheekbones, brow)
export const FACE_SHAPES = ['oval', 'round', 'square', 'long', 'heart'];
export const CHINS = ['pointed', 'round', 'strong'];
export const NOSES = ['small', 'normal', 'big', 'button', 'hooked', 'long', 'red'];
const NOSE_DIM = {
  small: { len: 0.1, h: 0.95, r0: 0.028, tip: 0.045, wing: 0.034 },
  normal: { len: 0.14, h: 1, r0: 0.034, tip: 0.055, wing: 0.042 },
  big: { len: 0.2, h: 1.08, r0: 0.044, tip: 0.075, wing: 0.056 },
  button: { len: 0.1, h: 0.86, r0: 0.02, tip: 0.07, wing: 0.036 },
  hooked: { len: 0.2, h: 1.1, r0: 0.05, tip: 0.05, wing: 0.042, hook: 0.035 },
};
/** The head-shape parameters of a look (explicit choices, else from build and seed). */
export function headParams(look) {
  const fem = !!look.fem;
  const seed = look.seed || 0;
  const shape = FACE_SHAPES.includes(look.faceShape) ? look.faceShape : fem ? ['oval', 'heart', 'oval', 'round'][seed % 4] : ['oval', 'square', 'oval', 'long', 'square', 'round'][seed % 6];
  const chin = CHINS.includes(look.chin) ? look.chin : fem ? 'pointed' : shape === 'square' ? 'strong' : 'round';
  let nose = NOSES.includes(look.noseShape) ? look.noseShape : look.nose === 'long' ? 'long' : look.nose === 'red' ? 'red' : fem ? 'small' : ['normal', 'normal', 'small', 'big', 'hooked'][(seed >> 1) % 5];
  if (look.race === 'mink' || look.muzzle || look.race === 'fishman') nose = 'flat';
  const q = (v, d) => Math.round((v ?? d) * 4) / 4; // quarter steps (shared geometry)
  return { fem, shape, chin, nose, jaw: q(look.jaw, 0.5), cheek: q(look.cheek, fem ? 0.5 : 0.5), brow: q(look.brow, fem ? 0.25 : 0.6) };
}
const headKey = (hp) => `${hp.fem ? 'f' : 'm'}.${hp.shape}.${hp.chin}.${hp.nose}.${hp.jaw}.${hp.cheek}.${hp.brow}`;

/** Resolved proportions for the distance field. */
function headKind(hp) {
  const S = {
    oval: { cw: 0.72, jw: 0.5, jy: -0.58, cy: -1.03, jr: 0.16 },
    round: { cw: 0.8, jw: 0.56, jy: -0.54, cy: -0.96, jr: 0.2 },
    square: { cw: 0.76, jw: 0.6, jy: -0.62, cy: -1.03, jr: 0.18 },
    long: { cw: 0.7, jw: 0.49, jy: -0.64, cy: -1.15, jr: 0.16 },
    heart: { cw: 0.77, jw: 0.42, jy: -0.54, cy: -1.0, jr: 0.14 },
  }[hp.shape] || { cw: 0.72, jw: 0.5, jy: -0.58, cy: -1.03, jr: 0.16 };
  const k = { ...S };
  if (hp.fem) { k.jw *= 0.9; k.jr *= 0.88; k.cw *= 0.96; }
  k.jw *= 0.86 + hp.jaw * 0.28;
  // the chin: pointed, round or strong (square-cut, forward)
  const C = { pointed: { cx: 0.6, cz: 0.02, cr: 0.15 }, round: { cx: 0.6, cz: 0.1, cr: 0.19 }, strong: { cx: 0.65, cz: 0.2, cr: 0.21 } }[hp.chin];
  Object.assign(k, C);
  k.cheek = hp.cheek;
  k.brow = hp.brow;
  k.nose = NOSE_DIM[hp.nose] || null;
  k.fem = hp.fem;
  return k;
}

// The head is sculpted the way anime heads are built: a round cranium that
// carries on behind the neck, a brow ridge over recessed eye sockets, a
// nose (bridge, tip, nostrils), cheekbones, the mouth set a little forward,
// the jaw rising from its corner toward the ear and running down to the chin.
function sdfHead(x, y, z, k) {
  const az = Math.abs(z);
  // cranium (narrower side to side than front to back)
  let d = ellipsoid(x + 0.06, y - 0.07, z, 1.0, 0.99, 0.9);
  // the face mass under the cheekbones
  d = smin(d, ellipsoid(x - 0.2, y + 0.3, z, 0.64, 0.6, k.cw), 0.3);
  // jaw: the ramus up toward the ear, the jawline down to the chin, the chin
  d = smin(d, capsule(x, y, az, -0.24, -0.2, k.jw + 0.08, -0.14, k.jy, k.jw, k.jr * 0.8), 0.2);
  d = smin(d, capsule(x, y, az, -0.14, k.jy, k.jw, k.cx - 0.12, k.cy + 0.1, k.cz, k.jr), 0.24);
  d = smin(d, ellipsoid(x - k.cx, y - k.cy - 0.02, z, k.cr, k.cr * 0.92, k.cr + k.cz * 0.7), 0.18);
  // the mouth (upper jaw) sits forward of the face
  d = smin(d, ellipsoid(x - 0.58, y + 0.6, z, 0.24, 0.19, 0.32), 0.2);
  // cheekbones
  d = smin(d, ellipsoid(x - 0.66, y + 0.12, az - 0.5, 0.2, 0.12, 0.2), 0.05 + 0.12 * k.cheek);
  // flatter temples
  d = smax(d, az - 0.87, 0.3);
  // eye sockets, under the brow
  d = smax(d, -ellipsoid(x - 0.96, y + 0.04, az - 0.34, 0.13, 0.12, 0.19), 0.08);
  // brow ridge
  d = smin(d, capsule(x, y, az, 0.88, 0.19, 0.0, 0.76, 0.17, 0.52, 0.035 + 0.04 * k.brow), 0.08 + 0.04 * k.brow);
  // the nose: bridge, tip and nostril wings
  const n = k.nose;
  if (n) {
    const tx = 0.9 + n.len, ty = -0.36 * n.h;
    let nd = capsule(x, y, z, 0.9, 0.02, 0, tx, ty + 0.02, 0, n.r0);
    if (n.hook) nd = smin(nd, sphere(x - 0.92 - n.len * 0.55, y + 0.15, z, n.r0 + n.hook), 0.05);
    nd = smin(nd, sphere(x - tx + 0.01, y - ty, z, n.tip), 0.05);
    nd = smin(nd, sphere(x - tx + 0.07, y - ty + 0.03, az - 0.07, n.wing), 0.04);
    d = smin(d, nd, 0.06);
  }
  return d;
}

let HEAD = null;      // { hp, key, k } of the build being made (set around buildBody)
const HEAD_R = new Map(); // head key → Map(direction → distance)
/** Distance from the head centre to the outermost surface along a unit direction. */
function headRay(dx, dy, dz) {
  const H = HEAD || headOf({});
  let cache = H.cache;
  if (!cache) {
    cache = HEAD_R.get(H.key);
    if (!cache) { if (HEAD_R.size > 400) HEAD_R.clear(); cache = new Map(); HEAD_R.set(H.key, cache); }
    H.cache = cache;
  }
  const key = (Math.round(dx * 1e4) + 10001) * 4.0004e8 + (Math.round(dy * 1e4) + 10001) * 20002 + (Math.round(dz * 1e4) + 10001);
  let t = cache.get(key);
  if (t !== undefined) return t;
  const k = H.k;
  // march in from outside (the first crossing is the visible surface), then bisect
  let out = 1.7, cur = 1.7;
  for (let i = 0; i < 80; i++) {
    const d = sdfHead(dx * cur, dy * cur, dz * cur, k);
    if (d < 0) break;
    out = cur;
    cur -= Math.max(d * 0.9, 0.006);
    if (cur < 0.1) { cur = 0.1; break; }
  }
  let lo = cur, hi = out;
  for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (sdfHead(dx * m, dy * m, dz * m, k) < 0) lo = m; else hi = m; }
  t = (lo + hi) / 2;
  cache.set(key, t);
  return t;
}
function headOf(look) {
  const hp = headParams(look);
  return { hp, key: headKey(hp), k: headKind(hp) };
}
/** Direction → point on the head surface (head units). */
export function headShape(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  const t = headRay(x / l, y / l, z / l);
  return [x / l * t, y / l * t, z / l * t];
}
const dirOf = (thD, phD) => { const t = thD * DEG, p = phD * DEG; return [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)]; };
/** A point on the head surface at polar angle th (0 = top) and azimuth ph (0 = front, 90 = right), scaled by k. */
export function surf(thD, phD, k = 1) { const d = dirOf(thD, phD); const p = headShape(d[0], d[1], d[2]); return [p[0] * k, p[1] * k, p[2] * k]; }

/**
 * Anime face shading. The grid's normals are smoothed (the cel ramp turns
 * every small wobble into a blotch), then lean toward the direction from the
 * head centre: strongly over the jaw and cheeks (clean, round shading), less
 * over the brow, nose and cheekbones (the face's structure still catches the
 * light); the front of the face turns a little toward the viewer.
 */
function faceNormals(g, U, V) {
  const P = g.attributes.position, N = g.attributes.normal;
  const W = U + 1, n = N.count;
  let a = Float32Array.from(N.array), b = new Float32Array(a.length);
  for (let it = 0; it < 3; it++) {
    for (let j = 0; j <= V; j++) {
      for (let i = 0; i <= U; i++) {
        const k = (j * W + i) * 3;
        const il = i === 0 ? U - 1 : i - 1, ir = i === U ? 1 : i + 1;
        const nb = [j * W + il, j * W + ir, Math.max(0, j - 1) * W + i, Math.min(V, j + 1) * W + i];
        let x = a[k] * 2, y = a[k + 1] * 2, z = a[k + 2] * 2;
        for (const q of nb) { x += a[q * 3]; y += a[q * 3 + 1]; z += a[q * 3 + 2]; }
        const l = Math.hypot(x, y, z) || 1;
        b[k] = x / l; b[k + 1] = y / l; b[k + 2] = z / l;
      }
    }
    [a, b] = [b, a];
  }
  for (let i = 0; i < n; i++) {
    const px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
    const l = Math.hypot(px, py, pz) || 1;
    const dx = px / l, dy = py / l, dz = pz / l;
    // how much of the sculpted shape shows: most over the brow, nose and cheekbones
    const feat = Math.max(0, 1 - Math.abs(py + 0.12) / 0.5) * Math.max(0, 1 - Math.abs(pz) / 0.7) * Math.max(0, Math.min(1, dx * 2));
    const wg = 0.3 + 0.4 * feat;
    const f = Math.max(0, Math.min(1, (dx + 0.1) / 0.7));
    const nx = a[i * 3] * wg + dx * (1 - wg) + f * 0.2, ny = a[i * 3 + 1] * wg + dy * (1 - wg) + f * 0.05, nz = a[i * 3 + 2] * wg + dz * (1 - wg);
    const m = Math.hypot(nx, ny, nz) || 1;
    N.setXYZ(i, nx / m, ny / m, nz / m);
  }
  return g;
}

// Sampling: rows of polar angles (dense over the face and jaw), columns
// bunched at the front, so the nose, brow and lips have enough vertices.
const HEAD_GRID = {
  near: { U: 34, warp: 0.74, rows: [0, 16, 32, 46, 58, 67, 74, 80, 85, 90, 94, 98, 102, 106, 110, 114, 118, 122, 126, 130, 134, 138, 142, 146, 150, 155, 160, 166, 173, 180] },
  far: { U: 12, warp: 0.4, rows: [0, 36, 66, 86, 102, 118, 134, 150, 166, 180] },
};
const phOf = (G, i) => { const u = i / G.U; return (u + G.warp * Math.sin((u - 0.5) * TAU) / TAU) * TAU - Math.PI; }; // -π..π, front at 0
function headPoint(G, i, j) {
  const ph = phOf(G, i), th = G.rows[j] * DEG;
  return headShape(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
}
const HEADS = new Map();
function headGeo(level) {
  const G = HEAD_GRID[level];
  const key = HEAD.key + '|' + level;
  let g = HEADS.get(key);
  if (!g) {
    const V = G.rows.length - 1;
    g = grid((u, v) => headPoint(G, Math.round(u * G.U), Math.round(v * V)), G.U, V);
    // weld the seam at the back
    const n = g.attributes.normal, W = G.U + 1;
    for (let j = 0; j <= V; j++) {
      const a = j * W, b = j * W + G.U;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
    faceNormals(g, G.U, V);
    if (HEADS.size > 300) HEADS.clear();
    HEADS.set(key, g);
  }
  return g;
}
const FACE_GEO = new Map();
/**
 * The face decal for a look: the head grid's own vertices over the face
 * (pushed out a hair), so the painted eyes lie exactly on the sculpted face.
 * UVs are a front projection (see face.js).
 */
export function faceGeo(look = {}, level = 'near') {
  const was = HEAD;
  HEAD = headOf(look);
  const key = HEAD.key + '|' + level;
  let g = FACE_GEO.get(key);
  if (!g) {
    const G = HEAD_GRID[level];
    const head = headGeo(level);
    const HP = head.attributes.position, HN = head.attributes.normal, W = G.U + 1;
    const cols = [], rws = [];
    for (let i = 0; i <= G.U; i++) if (Math.abs(phOf(G, i)) <= 72 * DEG) cols.push(i);
    for (let j = 0; j < G.rows.length; j++) if (G.rows[j] >= 55 && G.rows[j] <= 172) rws.push(j);
    const pos = [], nor = [], uv = [], idx = [];
    for (const j of rws) {
      for (const i of cols) {
        const v = j * W + i, s = 1.006;
        const x = HP.getX(v) * s, y = HP.getY(v) * s, z = HP.getZ(v) * s;
        pos.push(x, y, z);
        nor.push(HN.getX(v), HN.getY(v), HN.getZ(v));
        uv.push(0.5 - z / 2, (y - FACE_BOTTOM) / (FACE_TOP - FACE_BOTTOM));
      }
    }
    const C = cols.length;
    for (let r = 0; r < rws.length - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        const a = r * C + c, b = a + 1, cc = a + C, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.userData.shared = true;
    if (FACE_GEO.size > 300) FACE_GEO.clear();
    FACE_GEO.set(key, g);
  }
  HEAD = was;
  return g;
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
// Hair is built in head-centre units (head radius 1) through a context `h`:
// h.add(geo, matrix, colour, bone, part, anchor) — parts anchored above the
// hat band are dropped when a hat covers the head; h.q holds the detail.
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
function spike(h, a, b, wide, thin = wide, seg, anchor = a) {
  h.add(Prim.cone(seg || h.q.cone), between(a, b, thin, wide), h.col, h.bone, 0, anchor);
}
function blob(h, c, r, rot = [0, 0, 0], seg) {
  const rr = Array.isArray(r) ? r : [r, r, r];
  const s = seg || h.q.blob;
  h.add(Prim.sphere(s[0], s[1]), M(c[0], c[1], c[2], rot[0], rot[1], rot[2], rr), h.col, h.bone, 0, c);
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
  if (!h.q.fringe) n = Math.max(2, Math.round(n * 0.6));
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
    for (const s of [-1, 1]) spike(h, surf(78, s * 84, 1.05), surf(112, s * 86, 1.04), 0.12, 0.06, 3);
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
    for (const s of [-1, 1]) {
      const a = surf(64, s * 74, 1.07);
      spike(h, a, [a[0] - 0.05, -1.45, a[2] * 0.96 + s * 0.12], 0.3, 0.12, 5);
    }
    h.withBone(B.hairTail, () => {
      blob(h, [-0.6, -0.72, 0], [0.42, 1.22, 0.94], [0, 0, -0.06]);
      spike(h, [-0.6, -1.5, 0], [-0.52, -2.3, 0], 0.74, 0.32, 6);
    });
  },
  ponytail(h) {
    h.cap(1.07, 58, 98, 116);
    fringe(h, 4, 90, 36, 0.24);
    const tie = surf(52, 180, 1.1);
    const s = h.q.sph;
    h.addC(Prim.sphere(s[0], s[1]), M(tie[0], tie[1], tie[2], 0, 0, 0, [0.17, 0.17, 0.2]), '#c8372d', h.bone);
    h.withBone(B.hairTail, () => {
      blob(h, [tie[0] - 0.2, tie[1] - 0.08, 0], [0.3, 0.26, 0.26], [0, 0, 0.7]);
      blob(h, [tie[0] - 0.36, tie[1] - 0.55, 0], [0.26, 0.42, 0.24], [0, 0, 0.15]);
      spike(h, [tie[0] - 0.4, tie[1] - 0.85, 0], [tie[0] - 0.3, tie[1] - 1.6, 0], 0.24, 0.2, 5);
    });
  },
  curly(h) {
    h.cap(1.1, 56, 100, 118);
    const P = [[10, 0], [26, 60], [26, 180], [26, 300], [46, 0], [46, 90], [46, 150], [46, 210], [46, 270], [68, 120], [68, 180], [68, 240], [86, 160], [86, 200]];
    for (const [th, ph] of P) { const c = surf(th, ph, 1.12); blob(h, c, 0.32, [0, 0, 0], h.q.sph); }
  },
  afro(h) {
    h.cap(1.08, 58, 100, 118);
    blob(h, [-0.36, 0.56, 0], 1.42, [0, 0, 0], [h.q.blob[0] + 2, h.q.blob[1] + 2]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const c = [-0.36 + Math.cos(a) * 1.32 * 0.72, 0.56 + Math.sin(a) * 1.32, Math.sin(a * 2.3) * 0.5];
      if (c[0] > 0.2 && c[1] < 0.1) continue;
      blob(h, c, 0.36, [0, 0, 0], h.q.sph);
    }
    for (const s of [-1, 1]) blob(h, [-0.36, 0.56, s * 1.3], 0.38, [0, 0, 0], h.q.sph);
  },
  topknot(h) {
    h.cap(1.035, 60, 95, 112);
    h.addC(Prim.torus(0.35, 4, 8), mul(M(0, 1.04, 0, 0, 0, 0.35), M(0, 0, 0, Math.PI / 2, 0, 0, 0.14)), '#f4f1ea', h.bone);
    spike(h, [0.04, 1.0, 0], [-0.62, 1.28, 0], 0.16, 0.13, 5);
    blob(h, [-0.58, 1.26, 0], [0.12, 0.1, 0.12], [0, 0, 0], h.q.sph);
  },
  mohawk(h) {
    h.cap(1.02, 62, 94, 118, null, 'stubble');
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
    blob(h, [-0.55, 0.92, 0], 0.44);
    h.addC(Prim.torus(0.3, 4, 8), mul(M(-0.36, 0.7, 0, 0, 0, 0.9), M(0, 0, 0, Math.PI / 2, 0, 0, 0.26)), '#c8372d', h.bone);
  },
  pompadour(h) {
    h.cap(1.07, 60, 98, 116);
    blob(h, [0.42, 0.98, 0], [0.9, 0.52, 0.78], [0, 0, -0.38]);
    spike(h, [0.9, 1.1, 0], [1.3, 0.72, 0], 0.3, 0.2, 5);
  },
};

// ------------------------------------------------------------------ hats
// Hats sit on the head at their band; `k` scales them for big hair.
const STRAW = '#f0cd62', STRAW_D = '#e9c150', BAND_RED = '#c8372d', GOLD = '#e0b24a';
const HAT_COVER = { hood: 1, chef: 1, straw: 1, captain: 1, tricorne: 1, cowboy: 1, marine: 1, pinkhat: 1, tophat: 1, topHat: 1, beanie: 1, bandana: 1, cap: 1, helm: 1 };
function hatKind(hat, look) {
  if (!hat) return null;
  if (hat === 'horns' && !(look && look.hatColor)) return 'helm';
  return HATS[hat] ? hat : 'cap';
}
const disc = (h, y, r, t, col, rx = 0, rz = 0, sx = 1) => h.addC(Prim.cyl(h.q.hat), mul(M(0, y, 0, rx, 0, rz), M(0, 0, 0, 0, 0, 0, [r * sx, t, r])), col, h.bone);
const dome = (h, y, r, col, rz = 0) => h.addC(Prim.sphere(h.q.hatS[0], h.q.hatS[1]), M(0, y, 0, 0, 0, rz, r), col, h.bone);
const ring = (h, y, r, t, col, rz = 0) => h.addC(Prim.cyl(h.q.hat, true), M(0, y, 0, 0, 0, rz, [r[0], t, r[1] ?? r[0]]), col, h.bone);
const HATS = {
  straw(h) {
    disc(h, 0.52, 1.72, 0.07, STRAW, 0, 0.08);
    dome(h, 0.58, [0.96, 0.66, 0.96], STRAW_D, 0.08);
    ring(h, 0.68, [0.975], 0.22, BAND_RED, 0.08);
  },
  chef(h, col) {
    const c = col || '#fafafa';
    h.addC(Prim.frustum(0.9, h.q.hat), M(0, 0.93, 0, 0, 0, 0, [0.99, 1.05, 0.99]), c, h.bone);
    dome(h, 1.62, [1.12, 0.62, 1.12], c);
  },
  captain(h, col) {
    const c = col || '#2c2831';
    h.addC(Prim.frustum(0.84, h.q.hat), M(0, 0.98, 0, 0, 0, 0, [1.02, 0.9, 1.02]), c, h.bone);
    dome(h, 1.42, [0.86, 0.3, 0.86], c);
    disc(h, 0.56, 1.5, 0.08, shade(c, -0.12), 0, 0, 1.1);
    h.addC(Prim.torus(0.06, 3, 16), mul(M(0, 0.57, 0), M(0, 0, 0, Math.PI / 2, 0, 0, [1.66, 1.5, 1])), GOLD, h.bone);
    spike({ ...h, col: lin('#c8372d') }, [-0.35, 1.3, 0.55], [-1.2, 1.9, 1.1], 0.34, 0.1, 5);
    h.addC(Prim.sphere(h.q.sph[0], h.q.sph[1]), M(0.95, 1.05, 0, 0, 0, 0, [0.08, 0.2, 0.2]), '#f4f1ea', h.bone);
  },
  tricorne(h, col) {
    const c = col || '#302b35';
    h.addC(Prim.frustum(0.8, h.q.hat), M(0, 0.86, 0, 0, 0, 0, [1.0, 0.62, 1.0]), c, h.bone);
    dome(h, 1.16, [0.8, 0.26, 0.8], c);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 3;
      const x = Math.cos(a), z = Math.sin(a);
      h.addC(Prim.rbox(0.3, h.q.rboxS[0], h.q.rboxS[1]), mul(M(x * 1.02, 0.78, z * 1.02, 0, -a, 0), M(0, 0, 0, 0, 0, 0.9, [0.36, 0.06, 1.0])), c, h.bone);
      h.addC(Prim.box(), mul(M(x * 1.14, 0.92, z * 1.14, 0, -a, 0), M(0, 0, 0, 0, 0, 0.9, [0.06, 0.04, 0.9])), GOLD, h.bone);
    }
    disc(h, 0.62, 1.16, 0.06, c);
  },
  cowboy(h, col) {
    const c = col || '#9a6a3f';
    dome(h, 0.8, [0.9, 0.72, 0.84], c);
    ring(h, 0.66, [0.93, 0.88], 0.2, shade(c, -0.5));
    disc(h, 0.56, 1.82, 0.07, shade(c, -0.1), 0, 0.06);
    for (const s of [-1, 1]) h.addC(Prim.rbox(0.4, h.q.rboxS[0], h.q.rboxS[1]), M(0, 0.66, s * 1.55, s * 0.55, 0, 0, [1.2, 0.05, 0.42]), shade(c, -0.1), h.bone);
  },
  marine(h) {
    const white = '#f6f5f0';
    dome(h, 0.52, [1.1, 0.74, 1.1], white);
    ring(h, 0.5, [1.13], 0.2, '#27466e');
    h.addC(Prim.cyl(h.q.hat), mul(M(0.88, 0.42, 0, 0, 0, -0.12), M(0, 0, 0, 0, 0, 0, [0.62, 0.05, 0.92])), '#1d1a20', h.bone);
    // neck curtain down the back
    h.add(lathe([[1.14, -0.62], [1.14, 0.46]], 8, Math.PI * 0.62, Math.PI * 0.76), M(), white, h.bone);
    h.add(lathe([[1.1, -0.62], [1.1, 0.46]], 8, Math.PI * 0.62, Math.PI * 0.76, true), M(), shade(white, -0.2), h.bone);
    h.addC(Prim.torus(0.35, 3, 8), M(0.98, 0.94, 0, 0, Math.PI / 2, 0, 0.1), '#2f5f96', h.bone);
  },
  tophat(h, col, cross) {
    const c = col || '#2b2631';
    disc(h, 0.66, 1.34, 0.07, shade(c, -0.1));
    h.addC(Prim.cyl(h.q.hat), M(0, 1.34, 0, 0, 0, 0, [0.82, 1.36, 0.82]), c, h.bone);
    ring(h, 0.84, [0.84], 0.3, shade(c, -0.35));
    if (cross) for (const s of [-1, 1]) h.addC(Prim.box(), M(0.84, 1.42, 0, s * 0.8, 0, 0, [0.04, 0.42, 0.07]), '#ffffff', h.bone);
  },
  pinkhat(h, col) { HATS.tophat(h, col || '#f190b7', true); },
  topHat(h, col) { HATS.tophat(h, col); },
  beanie(h, col, look) {
    const c = col || '#e74c3c';
    h.add(capGeo(1.14, 62, 88, 100, null, h.q.cap[0], h.q.cap[1]), M(), c, h.bone);
    ring(h, 0.36, [1.16, 1.14], 0.28, shade(c, -0.12), -0.12);
    if (((look && look.seed) || 0) % 3 !== 0) h.addC(Prim.sphere(h.q.sph[0], h.q.sph[1]), M(0, 1.26, 0, 0, 0, 0, 0.27), mixHex(c, '#ffffff', 0.55), h.bone);
  },
  bandana(h, col) {
    const c = col || '#2f5f96';
    h.add(capGeo(1.12, 56, 86, 98, null, h.q.cap[0], h.q.cap[1]), M(), c, h.bone);
    const k = surf(90, 180, 1.12);
    h.addC(Prim.sphere(h.q.sph[0], h.q.sph[1]), M(k[0], k[1], k[2], 0, 0, 0, [0.16, 0.18, 0.2]), shade(c, -0.2), h.bone);
    for (const s of [-1, 1]) spike({ ...h, col: lin(shade(c, -0.1)) }, k, [k[0] - 0.45, k[1] - 0.55, s * 0.25], 0.2, 0.05, 4);
  },
  headband(h, col) {
    const c = col || '#2e2a31';
    h.add(lathe([[1.1, 0.3], [1.1, 0.52]], h.q.hat), M(0, 0, 0, 0, 0, -0.1), c, h.bone);
    const k = surf(84, 180, 1.12);
    h.addC(Prim.sphere(h.q.sph[0], h.q.sph[1]), M(k[0], k[1] + 0.3, k[2], 0, 0, 0, 0.14), shade(c, 0.2), h.bone);
    for (const s of [-1, 1]) spike({ ...h, col: lin(c) }, [k[0], k[1] + 0.3, k[2]], [k[0] - 0.5, k[1] - 0.3, s * 0.3], 0.16, 0.04, 4);
  },
  goggles(h, col) {
    h.add(lathe([[1.1, 0.48], [1.1, 0.64]], h.q.hat), M(0, 0, 0, 0, 0, -0.05), '#6b4a32', h.bone);
    for (const s of [-1, 1]) {
      const a = surf(52, s * 27, 1.1);
      const n = norm(a);
      h.addC(Prim.cyl(8), between(a, add3(a, n, 0.2), 0.27), '#c9a04a', h.bone);
      h.addC(Prim.cyl(8), between(add3(a, n, 0.15), add3(a, n, 0.22), 0.19), col || '#f0a53a', h.bone);
    }
  },
  horns(h, col) {
    const c = col || '#efe4c8';
    for (const s of [-1, 1]) {
      const a = surf(34, s * 60, 0.96);
      const b = [a[0] + 0.1, a[1] + 0.5, a[2] + s * 0.45];
      h.addC(Prim.frustum(0.62, 6), between(a, b, 0.2), c, h.bone);
      spike({ ...h, col: lin(c) }, b, [b[0] + 0.2, b[1] + 0.6, b[2] + s * 0.05], 0.13, 0.13, 6);
    }
  },
  helm(h) {
    const metal = '#aab5bd';
    h.add(capGeo(1.13, 70, 88, 96, null, h.q.cap[0], h.q.cap[1]), M(), metal, h.bone);
    ring(h, 0.42, [1.15], 0.2, '#8a6a44', -0.06);
    h.addC(Prim.box(), M(0, 1.0, 0, 0, 0, 0, [0.9, 0.1, 0.08]), '#8a6a44', h.bone);
    HATS.horns(h, '#efe4c8');
  },
  crown(h, col, look, top) {
    const c = col || '#ffd54f';
    const y = top - 0.12;
    h.add(lathe([[0.62, y], [0.66, y + 0.3]], h.q.hat), M(), c, h.bone);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      spike({ ...h, col: lin(c) }, [Math.cos(a) * 0.64, y + 0.26, Math.sin(a) * 0.64], [Math.cos(a) * 0.7, y + 0.62, Math.sin(a) * 0.7], 0.14, 0.1, 4);
    }
    h.addC(Prim.sphere(h.q.sph[0], h.q.sph[1]), M(0.66, y + 0.14, 0, 0, 0, 0, 0.09), '#e53935', h.bone);
  },
  halo(h, col, look, top) {
    h.addC(Prim.torus(0.1, 4, 16), M(0, top + 0.42, 0, Math.PI / 2, 0, 0, 0.72), col || '#ffe082', h.bone);
  },
  bubble() { /* the transparent bubble helmet is a separate mesh (model.js) */ },
  antlers(h, col) {
    const c = lin(col || '#8d6e63');
    for (const s of [-1, 1]) {
      const a = surf(28, s * 50, 0.96), b = [a[0] - 0.1, a[1] + 0.8, a[2] + s * 0.6];
      h.addC(Prim.cyl(5), between(a, b, 0.09), c, h.bone);
      h.addC(Prim.cyl(5), between(add3(a, [-0.05, 0.4, s * 0.3]), [a[0] + 0.35, a[1] + 0.75, a[2] + s * 0.4], 0.07), c, h.bone);
      h.addC(Prim.cyl(5), between(add3(a, [-0.08, 0.62, s * 0.46]), [b[0] - 0.3, b[1] + 0.35, b[2] + s * 0.1], 0.06), c, h.bone);
    }
  },
  hood(h, col) {
    const c = col || '#6a5643';
    const U = h.q.cap[0] + 4, V = h.q.cap[1] + 2;
    // a deep cowl over the crown, down the sides and the back, framing the face
    h.add(capGeo(1.25, 60, 134, 160, null, U, V), M(0.07, 0.03, 0, 0, 0, 0, [1.08, 1.02, 1.05]), c, h.bone);
    // its shadowed inside, seen through the face opening
    h.add(capGeo(1.21, 60, 134, 160, null, U, V), M(0.07, 0.03, 0, 0, 0, 0, [1.06, 1.0, -1.03]), shade(c, -0.7), h.bone);
    // the peak's soft fold and the cape over the shoulders
    const k = surf(12, 180, 1.28);
    h.addC(Prim.sphere(h.q.sph[0], h.q.sph[1]), M(k[0] - 0.12, k[1] + 0.02, 0, 0, 0, 0.5, [0.34, 0.2, 0.3]), shade(c, -0.06), h.bone);
    h.add(lathe([[1.0, -0.8], [1.42, -1.3], [1.62, -1.58]], 14), M(), shade(c, -0.06), h.bone);
  },
  cap(h, col) {
    const c = col || '#5d6d7e';
    h.add(capGeo(1.12, 64, 88, 96, null, h.q.cap[0], h.q.cap[1]), M(), c, h.bone);
    h.addC(Prim.cyl(10), mul(M(0.9, 0.46, 0, 0, 0, -0.18), M(0, 0, 0, 0, 0, 0, [0.62, 0.05, 0.86])), shade(c, -0.25), h.bone);
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
export function geoKey(look, wpn, lod = 0) {
  const L = look;
  return [lod, L.race, L.skin, L.hair, L.hairColor, L.top, L.bottom, L.shoes, L.hat, L.hatColor, L.coat, L.openShirt ? 1 : 0, L.sleeve, L.noSleeves ? 1 : 0,
    L.hand, L.arms, L.legs, L.bulk, L.ears, L.fur, L.furFace ? 1 : 0, L.furWhite ? 1 : 0, L.tail, L.fin ? 1 : 0, L.wings, L.nose, L.kind, L.vest, L.belt,
    L.sandals ?? ((L.seed || 0) % 4 === 0 ? 's' : 'b'), L.neck, L.nika ? 1 : 0, L.drums ? 1 : 0, L.seed || 0, wpn ? `${wpn.kind}${wpn.count}` : '-',
    L.fem ? 1 : 0, L.topStyle, L.bottomStyle, L.waist, L.waistCol, L.shoeStyle, L.top2, L.sleeves, L.muscle, L.bust, L.tie, L.tucked, L.buckle,
    headKey(headParams(L))].join('|');
}

/** Build a character's geometry (not cached; see getBody). */
export function buildBody(look, wpn, lod = 0) {
  const was = HEAD;
  HEAD = headOf(look);
  try { return buildBody0(look, wpn, lod); } finally { HEAD = was; }
}
function buildBody0(look, wpn, lod) {
  const q = DETAIL[lod] || DETAIL[0];
  const d = dims(look);
  const pal = palette(look);
  const b = new Builder();
  const Bk = d.Bk;
  const add = (g, m, col, bone, part = 0) => b.add(g, m, col, bone, part);
  const rb = (k = 0.4, small = true) => Prim.rbox(k, ...(small ? q.rboxS : q.rbox));

  // ---- pelvis, torso, arms, legs, feet and clothes (body.js)
  const outfit = buildFigure(add, look, d, pal, q);

  // ---- head (+ ears, race features, hair, hat)
  const R = d.headR;
  const HM = (m) => mul(M(d.hx, d.hc, 0, 0, 0, 0, R), m || M());
  const hb = B.head;
  add(headGeo(lod === 0 ? 'near' : 'far'), HM(), pal.face, hb);
  const style = styleId(look.hair, look);
  const meta = META[style];
  const kind = hatKind(look.hat, look);
  const cover = kind && HAT_COVER[kind];
  const hairCol = lin(pal.hair);
  const stubble = lin(mixHex(pal.face, pal.hair, 0.3));
  const h = {
    q, col: hairCol, bone: hb,
    add(g, m, col, bone, part, anchor) {
      // drop hair poking through a covering hat (anything anchored above the band)
      if (cover && anchor && anchor[1] > 0.5 && style !== 'afro') return;
      if (bone === B.hairTail) b.add(g, mul(M(0, 0, 0, 0, 0, 0, R), m), col, bone, 0);
      else b.add(g, HM(m), col, bone, 0);
    },
    addC(g, m, col, bone) {
      if (bone === B.hairTail) b.add(g, mul(M(0, 0, 0, 0, 0, 0, R), m), col, bone, 0);
      else b.add(g, HM(m), col, bone, 0);
    },
    cap(rs, f, s, bk, zig, tone) { b.add(capGeo(rs, f, s, bk, zig, q.cap[0], q.cap[1]), HM(), tone === 'stubble' ? stubble : hairCol, hb, 0); },
    withBone(bone, fn) { const o = this.bone; this.bone = bone; fn(); this.bone = o; },
  };
  (HAIR[style] || HAIR.short)(h);
  if (look.ears) minkEars(b, HM, look, pal, hb, q);
  else for (const s of [-1, 1]) { const e = surf(98, s * 95, 0.97); add(Prim.sphere(q.sph[0], q.sph[1]), HM(M(e[0] - 0.02, e[1], e[2], 0, 0, s * 0.12, [0.19, 0.28, 0.13])), pal.face, hb); }
  if (look.fin && look.kind !== 'Octopus') {
    const a = surf(18, 180, 0.9);
    b.add(Prim.cone(4), HM(between(a, [a[0] - 0.55, a[1] + 0.85, 0], 0.08, 0.42)), shade(pal.skin, -0.18), hb);
  }
  if (look.race === 'skypiean') for (const s of [-1, 1]) {
    const a = surf(22, s * 28, 1.0), t = [a[0] + 0.25, a[1] + 0.5, a[2] + s * 0.2];
    b.add(Prim.cyl(4), HM(between(a, t, 0.035)), pal.skin, hb);
    b.add(Prim.sphere(q.sph[0], q.sph[1]), HM(M(t[0], t[1], t[2], 0, 0, 0, 0.09)), pal.skin, hb);
  }
  const hp = HEAD.hp;
  if (hp.nose === 'long') b.add(Prim.frustum(0.75, 6), HM(between([0.88, -0.2, 0], [1.95, -0.16, 0], 0.075)), pal.face, hb);
  else if (hp.nose === 'red') b.add(Prim.sphere(q.sph[0] + 2, q.sph[1] + 2), HM(M(1.0, -0.3, 0, 0, 0, 0, 0.17)), '#e53935', hb);
  if (look.kind === 'Saw Shark') {
    b.add(rb(0.3), HM(M(1.5, -0.3, 0, 0, 0, 0.05, [0.6, 0.06, 0.1])), '#9fb0bf', hb);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.add(Prim.cone(3), HM(M(1.1 + i * 0.18, -0.3, s * 0.1, s * Math.PI / 2, 0, 0, [0.04, 0.08, 0.03])), '#f4f1ea', hb);
  }
  if (kind && HATS[kind]) {
    const k = cover ? meta.hatK : 1;
    const lift = cover ? meta.lift || 0 : 0;
    const hh = { ...h };
    hh.addC = (g, m, col, bone) => b.add(g, HM(mul(M(0, 0.45 + lift, 0, 0, 0, 0, k), mul(M(0, -0.45, 0), m))), col, bone ?? hb, 0);
    hh.add = (g, m, col, bone) => hh.addC(g, m, col, bone);
    hh.bone = hb;
    HATS[kind](hh, look.hatColor, look, meta.top);
  }

  // ---- hands
  for (const [s, Hd, part] of [[1, 'R', 1], [-1, 'L', 2]]) hands(b, Hd, s, pal.hand, Bk, part, q, outfit.fem ? 0.9 : 1.12);

  if (look.drums) {
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * 0.55 + (k / 5) * Math.PI * 0.9;
      add(Prim.cyl(6), M(Math.cos(a) * 0.5 - 0.15, d.chestLen + 0.1 + Math.sin(k / 5 * Math.PI) * 0.35, Math.sin(a) * 0.5, Math.PI / 2, 0, 0, [0.08, 0.07, 0.08]), '#ffb300', B.chest);
    }
  }
  // ---- tail, wings
  if (look.tail) {
    const fl = look.tail === 'fluffy';
    const r = fl ? 0.055 : 0.024;
    const pts = [[0, 0, 0], [-0.16, 0.02, 0], [-0.3, 0.12, 0], [-0.36, 0.3, 0]];
    for (let i = 0; i < 3; i++) add(Prim.cyl(5), between(pts[i], pts[i + 1], r * (1 - i * 0.12) * (fl ? 1 + i * 0.25 : 1)), pal.fur, B.tail);
    for (let i = 1; i < 4; i++) add(Prim.sphere(q.sph[0], q.sph[1]), M(...pts[i], 0, 0, 0, r * (fl ? 1.35 + i * 0.1 : 1)), pal.fur, B.tail);
  }
  if (look.wings === 'sky' || look.wings === 'lunar') {
    const lunar = look.wings === 'lunar';
    const col = lunar ? '#1e1e24' : '#ffffff';
    for (const [s, W] of [[1, B.wingR], [-1, B.wingL]]) {
      for (let i = 0; i < 3; i++) {
        const a = (lunar ? 0.35 : 0.55) - i * 0.42;
        const L = (lunar ? 0.62 : 0.34) * (1 - i * 0.12);
        add(Prim.sphere(q.sph[0], q.sph[1]), mul(M(0, 0, 0, s * (Math.PI / 2 - a), 0, 0), M(0, L * 0.5, 0, 0, 0, 0, [0.03, L * 0.55, lunar ? 0.11 : 0.085])), i ? shade(col, lunar ? 0.1 : -0.08) : col, W);
      }
    }
  }

  // ---- sheathed weapons
  if (wpn && wpn.kind === 'sword') {
    const cols = ['#ecf0f1', '#2c3e50', '#c0392b'];
    for (let k = 0; k < Math.min(3, wpn.count || 1); k++) {
      const z = -(0.165 * Bk + 0.02 + k * 0.035);
      const a = [0.1 - k * 0.03, 0.02 + k * 0.01, z], e = [-0.62 - k * 0.04, -0.4 + k * 0.03, z - 0.1];
      add(Prim.cyl(5), between(a, e, 0.019), cols[k], B.sheath);
      const dir = norm([a[0] - e[0], a[1] - e[1], a[2] - e[2]]);
      add(Prim.cyl(6), between(add3(a, dir, -0.01), add3(a, dir, 0.012), 0.036), GOLD, B.hilts);
      add(Prim.cyl(5), between(add3(a, dir, 0.012), add3(a, dir, 0.23), 0.017), k === 2 ? '#fafafa' : '#2d2a32', B.hilts);
    }
  } else if (wpn && wpn.kind === 'gun') {
    add(Prim.box(), M(0.02, -0.06, 0.17 * Bk, 0, 0, 0.3, [0.05, 0.08, 0.02]), '#6d4c41', B.sheath);
    add(Prim.box(), M(0.05, 0.03, 0.17 * Bk, 0, 0, 0.9, [0.02, 0.05, 0.018]), '#8d5b33', B.hilts);
  } else if (wpn && (wpn.kind === 'axe' || wpn.kind === 'staff')) {
    const a = [-0.16 * Bk, d.chestLen - 0.02, 0.22], e = [-0.17 * Bk, 0.05, -0.28];
    add(Prim.cyl(5), between(a, e, 0.018, 0.018, 0.5), wpn.kind === 'axe' ? '#6d4c41' : '#4fc3f7', B.backWpn);
    if (wpn.kind === 'axe') add(Prim.box(), M(a[0] - 0.02, a[1] + 0.1, a[2] + 0.05, 0.9, 0, 0, [0.015, 0.12, 0.16]), '#cfd8dc', B.backWpn);
  }

  const geo = b.build();
  return { geo, dims: d, style, meta, hatKind: kind, bubble: kind === 'bubble', lod };
}

function minkEars(b, HM, look, pal, hb, q) {
  const fur = pal.fur, inner = look.kind === 'Panda' ? '#2b2b2b' : mixHex(fur, '#f48fb1', 0.55);
  const col = look.kind === 'Panda' ? '#2b2b2b' : fur;
  const S = Prim.sphere(q.sph[0], q.sph[1]);
  for (const s of [-1, 1]) {
    const a = surf(34, s * 52, 0.92);
    if (look.ears === 'round') {
      b.add(S, HM(M(a[0] - 0.05, a[1] + 0.12, a[2] + s * 0.06, 0, 0, 0, [0.14, 0.3, 0.3])), col, hb);
      b.add(S, HM(M(a[0] + 0.05, a[1] + 0.12, a[2] + s * 0.06, 0, 0, 0, [0.08, 0.18, 0.18])), inner, hb);
    } else if (look.ears === 'long') {
      const t = [a[0] - 0.1, a[1] + 1.05, a[2] + s * 0.18];
      b.add(S, HM(between(a, t, 0.1, 0.22)), col, hb);
      b.add(S, HM(between(add3(a, [0.07, 0.15, 0]), add3(t, [0.07, -0.12, 0]), 0.04, 0.12)), inner, hb);
    } else {
      const t = [a[0] - 0.02, a[1] + 0.62, a[2] + s * 0.22];
      b.add(Prim.cone(4), HM(between(a, t, 0.1, 0.3)), col, hb);
      b.add(Prim.cone(4), HM(between(add3(a, [0.07, 0.04, 0]), add3(t, [0.07, -0.16, 0]), 0.04, 0.17)), inner, hb);
    }
  }
}

/**
 * Hand shapes on child bones of hand R/L: fist, open palm, and the pointing
 * index finger (shown together with the fist). The viewmodel level (q.hands
 * 2) gets knuckles and separate fingers; the far level only a fist.
 */
function hands(b, H, s, col, Bk, part, q, kMul = 1) {
  const k = (0.95 + (Bk - 1) * 0.6) * kMul;
  const th = -s; // thumb side on local Z (right hand: -Z)
  const fist = B['fist' + H], palm = B['palm' + H], finger = B['finger' + H];
  const S = (x, y, z) => [x * k, y * k, z * k];
  const dark = shade(col, -0.08);
  if (q.hands === 2) {
    // viewmodel: back of the hand, four curled fingers (knuckle row), the thumb across
    b.add(Prim.rbox(0.42, 10, 8), M(0, -0.036 * k, 0, 0, 0, 0, S(0.027, 0.04, 0.041)), col, fist, part);
    for (let f = 0; f < 4; f++) {
      const z = (f - 1.5) * 0.0205 * k;
      const len = [0.95, 1, 0.97, 0.85][f];
      b.add(tcap(0.0115 * k, 0.0105 * k, 0.034 * k * len, 8, 2), mul(M(0.012 * k, -0.074 * k, z), M(0, 0, 0, 0, 0, -Math.PI / 2 - 0.35)), f % 2 ? col : dark, fist, part);
    }
    b.add(tcap(0.012 * k, 0.011 * k, 0.045 * k, 8, 2), mul(M(-0.02 * k, -0.045 * k, th * 0.032 * k), M(0, 0, 0, th * 1.2, 0, -0.9)), col, fist, part);
    // knuckles along the back of the fist
    for (let f = 0; f < 4; f++) {
      const z = (f - 1.5) * 0.0205 * k;
      b.add(Prim.sphere(8, 6), M(-0.006 * k, -0.078 * k, z, 0, 0, 0, S(0.012, 0.011, 0.0105)), shade(col, 0.05), fist, part);
    }
    // open palm: plate, four fingers, thumb out
    b.add(Prim.rbox(0.4, 10, 8), M(0, -0.045 * k, 0, 0, 0, 0, S(0.017, 0.048, 0.044)), col, palm, part);
    for (let f = 0; f < 4; f++) {
      const z = (f - 1.5) * 0.021 * k;
      const len = [0.8, 1, 0.95, 0.72][f];
      b.add(tcap(0.0105 * k, 0.0095 * k, 0.068 * k * len, 8, 2), mul(M(0, -0.086 * k, z), M(0, 0, 0, (f - 1.5) * 0.06, 0, 0)), f % 2 ? col : dark, palm, part);
    }
    b.add(tcap(0.012 * k, 0.01 * k, 0.05 * k, 8, 2), mul(M(-0.006, -0.03 * k, th * 0.04 * k), M(0, 0, 0, th * 0.75, 0, 0)), col, palm, part);
    b.add(tcap(0.0105 * k, 0.0095 * k, 0.07 * k, 8, 2), M(0.008 * k, -0.07 * k, -th * 0.03 * k), col, finger, part);
    return;
  }
  // fist: a rounded block of knuckles with the thumb wrapped over the front
  b.add(Prim.rbox(0.42, ...q.rboxS), M(0, -0.045 * k, 0, 0, 0, 0, S(0.033, 0.046, 0.043)), col, fist, part);
  b.add(Prim.sphere(q.sph[0], q.sph[1]), M(-0.012 * k, -0.055 * k, th * 0.036 * k, 0, 0, 0, S(0.016, 0.03, 0.016)), dark, fist, part);
  if (!q.hands) return;
  // the pointing index finger (Shigan), shown with the fist
  b.add(tcap(0.011 * k, 0.009 * k, 0.07 * k, 5, 1), M(0.02 * k, -0.085 * k, -th * 0.02 * k), col, finger, part);
  // open palm: one flat hand, thumb out
  b.add(Prim.rbox(0.4, ...q.rboxS), M(0, -0.075 * k, 0, 0, 0, 0, S(0.017, 0.08, 0.045)), col, palm, part);
  b.add(tcap(0.011 * k, 0.009 * k, 0.05 * k, 5, 1), mul(M(-0.004, -0.03 * k, th * 0.04 * k), M(0, 0, 0, th * 0.7, 0, 0)), col, palm, part);
}

// ------------------------------------------------------------------ cache
const BODIES = new Map();
/** A shared built body for a look (ref-counted; call releaseBody when done). */
export function getBody(look, wpn, lod = 0) {
  const key = geoKey(look, wpn, lod);
  let e = BODIES.get(key);
  if (!e) {
    e = { key, ...buildBody(look, wpn, lod), refs: 0 };
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
    // keep recently used bodies a while (NPCs stream in and out of range)
    e.idleT = performance.now();
    setTimeout(() => {
      if (e.refs <= 0 && BODIES.get(e.key) === e && performance.now() - e.idleT >= 29000) { BODIES.delete(e.key); e.geo.dispose(); }
    }, 30000);
  }
}
export function bodyCacheSize() { return BODIES.size; }

export { THREE };
