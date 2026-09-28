// Bodies and clothes for the 3D characters (build.js calls buildFigure).
//
// Two builds, masculine and feminine, shaped like the anime-game art: a
// V-shaped torso with the chest, abs and shoulder blades modelled in (the
// cel ramp draws the muscle lines where the light turns), round deltoids,
// biceps, forearms, thighs and calves on lathe profiles, a narrow waist and
// wider hips for the feminine build. Muscle definition scales with
// `look.muscle` and the build with `look.bulk` (wide or thin).
//
// Clothes are real shells over the body with their own silhouettes and
// outlines: tees and shirts (tucked or hanging over the belt), open shirts
// and Luffy-style open vests, tank and crop tops, jackets over a shirt and
// tie, kimono with wide sleeves and an obi, striped sailor shirts; flared
// shorts with rolled cuffs, rolled-up capris, wide trousers, baggy pants,
// skirts; belts, sashes with hanging ends, belly wraps; boots with folded
// tops, shoes, sandals, geta; and coats worn over the shoulders.
//
// Frames (see bones.js): the model faces +X, +Y up, +Z is the character's
// right. The torso is built on the chest bone (origin at the hip pivot), the
// pelvis on the hips bone, limbs hang along -Y from their joints.
import { Prim, M, mul, grid, lathe, between, lin, THREE } from './geom.js';
import { atlasUV, torsoUV, BLANK_UV } from './detail.js';
import { B, frameOf, frameId } from './bones.js';
import { shade, mixHex } from '../../core/math.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ outfits
export const TOP_STYLES = ['tee', 'shirt', 'tank', 'vest', 'open', 'jacket', 'kimono', 'striped', 'bare', 'crop', 'bikini', 'dress', 'coat'];
export const BOTTOM_STYLES = ['trousers', 'shorts', 'capri', 'baggy', 'slim', 'hakama', 'skirt', 'longskirt'];
export const WAIST_STYLES = ['belt', 'sash', 'haramaki', 'obi', 'none'];
export const SHOE_STYLES = ['boots', 'shoes', 'sandals', 'geta', 'bare'];
const SLEEVES_OF = { tee: 'short', shirt: 'long', tank: 'none', vest: 'none', open: 'short', jacket: 'long', kimono: 'wide', striped: 'short', bare: 'none', crop: 'none', bikini: 'none', dress: 'none', coat: 'long' };
const SASH_COLS = ['#f4c430', '#c62828', '#1e88e5', '#2e7d32', '#6a1b9a', '#ef6c00'];

/** What a look wears: explicit fields first, else derived from the older fields and the seed. */
export function outfitOf(look) {
  const seed = look.seed || 0;
  const fem = !!look.fem;
  let top = look.topStyle;
  if (!TOP_STYLES.includes(top)) top = look.openShirt ? (look.noSleeves ? 'vest' : 'open') : look.noSleeves ? 'tank' : look.sleeve ? 'shirt' : 'tee';
  let sleeves = look.sleeves || SLEEVES_OF[top] || 'short';
  if (look.noSleeves && sleeves !== 'none' && top !== 'jacket' && top !== 'coat') sleeves = 'none';
  let bottom = look.bottomStyle;
  if (!BOTTOM_STYLES.includes(bottom)) bottom = fem ? ['skirt', 'shorts', 'trousers', 'slim', 'longskirt'][seed % 5] : ['trousers', 'shorts', 'trousers', 'capri', 'baggy'][seed % 5];
  if (top === 'dress' && bottom !== 'skirt') bottom = 'longskirt';
  const skirt = bottom === 'skirt' || bottom === 'longskirt';
  let waist = look.waist;
  if (!WAIST_STYLES.includes(waist)) waist = top === 'kimono' ? 'obi' : skirt || top === 'dress' ? 'none' : ['belt', 'sash', 'belt', 'none', 'belt'][Math.floor(seed / 5) % 5];
  let shoes = look.shoeStyle;
  if (!SHOE_STYLES.includes(shoes)) {
    const sandals = look.sandals ?? (seed % 4 === 0);
    shoes = sandals ? 'sandals' : seed % 3 === 1 ? 'boots' : 'shoes';
  }
  const r = look.race;
  const muscle = look.muscle ?? (fem ? 0.25 : r === 'buccaneer' || r === 'giant' ? 0.95 : r === 'fishman' ? 0.8 : r === 'longarm' || r === 'longleg' ? 0.3 : 0.3 + (seed % 5) * 0.12);
  // a shirt hangs loose unless something is worn at the waist over it
  const tucked = look.tucked ?? (waist !== 'none' || top === 'jacket' || top === 'kimono' || top === 'crop' || top === 'bikini' || top === 'bare');
  const F = frameOf(look);
  const bustK = { curvy: 1.28, heavy: 1.3, petite: 0.85, athletic: 0.95, slim: 0.95 }[frameId(look)] || 1;
  return { fem, top, sleeves, bottom, waist, shoes, muscle: clamp(look.muscle ?? F.mus ?? muscle, 0, 1.2), bust: (look.bust ?? (fem ? 1.18 : 1)) * bustK, tucked, skirt };
}

/** Extra colours for clothes (the rest come from build.js palette()). */
export function clothColours(look, pal, o) {
  const seed = look.seed || 0;
  const top2 = look.top2 || (o.top === 'striped' ? '#f5f5f5' : o.top === 'jacket' ? '#f5f5f5' : o.top === 'kimono' ? mixHex(pal.top, '#ffffff', 0.7) : shade(pal.top, -0.25));
  const waist = look.waistCol || (o.waist === 'sash' ? SASH_COLS[seed % SASH_COLS.length] : o.waist === 'haramaki' ? '#2e7d32' : o.waist === 'obi' ? mixHex(pal.top, '#f4f1ea', 0.35) : pal.belt);
  return { top2, waist, lining: shade(pal.top, -0.3), bottomLining: shade(pal.bottom, -0.35), tie: look.tie || null };
}

// ------------------------------------------------------------------ shape tables
// torso rows [s, half width, front depth, back depth]; s = height / chest length
const TORSO = {
  m: [[-0.1, 0.13, 0.088, 0.092], [0.12, 0.126, 0.085, 0.085], [0.32, 0.144, 0.091, 0.09], [0.52, 0.176, 0.1, 0.1], [0.68, 0.203, 0.107, 0.106],
    [0.8, 0.214, 0.102, 0.102], [0.89, 0.2, 0.089, 0.094], [0.955, 0.134, 0.068, 0.076], [1.0, 0.06, 0.051, 0.055]],
  f: [[-0.1, 0.132, 0.082, 0.094], [0.16, 0.107, 0.071, 0.073], [0.36, 0.117, 0.074, 0.077], [0.56, 0.137, 0.079, 0.084], [0.7, 0.145, 0.081, 0.086],
    [0.81, 0.155, 0.073, 0.081], [0.9, 0.139, 0.063, 0.073], [0.96, 0.096, 0.053, 0.061], [1.0, 0.048, 0.043, 0.047]],
};
// pelvis rows [y, half width, front depth, back depth] (hips frame), ascending y
const PELVIS = {
  m: [[-0.215, 0.02, 0.02, 0.02], [-0.18, 0.092, 0.061, 0.067], [-0.13, 0.13, 0.079, 0.092], [-0.06, 0.143, 0.089, 0.101], [0.02, 0.139, 0.091, 0.096], [0.08, 0.134, 0.09, 0.093]],
  f: [[-0.215, 0.02, 0.02, 0.02], [-0.18, 0.1, 0.059, 0.071], [-0.13, 0.153, 0.077, 0.102], [-0.06, 0.167, 0.086, 0.11], [0.02, 0.15, 0.084, 0.098], [0.08, 0.118, 0.079, 0.083]],
};
// limb radius profiles [t, r], t = 0 at the upper joint, 1 at the lower one
const LIMB = {
  uarm: { m: [[0, 0.056], [0.13, 0.058], [0.3, 0.05], [0.5, 0.049], [0.72, 0.045], [0.9, 0.041], [1, 0.04]], f: [[0, 0.044], [0.14, 0.045], [0.35, 0.039], [0.6, 0.036], [0.85, 0.033], [1, 0.032]] },
  farm: { m: [[0, 0.041], [0.15, 0.047], [0.33, 0.044], [0.6, 0.036], [0.86, 0.03], [1, 0.029]], f: [[0, 0.033], [0.15, 0.036], [0.45, 0.031], [0.8, 0.025], [1, 0.024]] },
  thigh: { m: [[0, 0.084], [0.12, 0.088], [0.36, 0.082], [0.62, 0.071], [0.86, 0.06], [1, 0.057]], f: [[0, 0.09], [0.15, 0.092], [0.4, 0.083], [0.7, 0.066], [0.9, 0.054], [1, 0.05]] },
  shin: { m: [[0, 0.057], [0.12, 0.06], [0.27, 0.064], [0.5, 0.054], [0.75, 0.042], [0.92, 0.037], [1, 0.036]], f: [[0, 0.05], [0.14, 0.052], [0.3, 0.054], [0.55, 0.045], [0.8, 0.034], [1, 0.03]] },
};

/** Catmull-Rom through rows sorted by column 0; writes columns 1.. into out. */
function interpRows(rows, s, out, cols = 4) {
  const n = rows.length;
  if (s <= rows[0][0]) { for (let c = 1; c < cols; c++) out[c] = rows[0][c]; return out; }
  if (s >= rows[n - 1][0]) { for (let c = 1; c < cols; c++) out[c] = rows[n - 1][c]; return out; }
  let i = 0;
  while (i < n - 2 && s > rows[i + 1][0]) i++;
  const r0 = rows[Math.max(0, i - 1)], r1 = rows[i], r2 = rows[i + 1], r3 = rows[Math.min(n - 1, i + 2)];
  const h = r2[0] - r1[0];
  const t = (s - r1[0]) / h, t2 = t * t, t3 = t2 * t;
  for (let c = 1; c < cols; c++) {
    const m1 = (r2[c] - r0[c]) / ((r2[0] - r0[0]) || 1) * h;
    const m2 = (r3[c] - r1[c]) / ((r3[0] - r1[0]) || 1) * h;
    out[c] = (2 * t3 - 3 * t2 + 1) * r1[c] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * r2[c] + (t3 - t2) * m2;
  }
  return out;
}
const _r = [0, 0, 0, 0];
const supEl = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);
/** Angles bunch toward the front (more detail where the chest is). */
const warp = (a) => a - 0.42 * Math.sin(a);

function shapeOf(d, o) {
  const F = d.F;
  // the frame reshapes the torso: shoulders and chest above, the waist, the hips below
  const wMul = (s) => {
    const hip = F.wa + (F.hp - F.wa) * (1 - sstep(-0.1, 0.12, s));
    const chest = F.wa + (F.sh * 0.8 + F.ch * 0.2 - F.wa) * sstep(0.3, 0.7, s);
    return s < 0.12 ? hip : chest;
  };
  const dMul = (s) => 1 + (F.ch - 1) * sstep(0.3, 0.62, s) * (1 - sstep(0.9, 1, s)) + (F.wa - 1) * 0.5 * (1 - sstep(0.3, 0.6, s));
  return {
    fem: o.fem, m: o.muscle, bust: o.bust, Bk: d.Bk, BkD: 1 + (d.Bk - 1) * 0.85, cl: d.chestLen, F, belly: F.belly,
    T: TORSO[o.fem ? 'f' : 'm'], P: PELVIS[o.fem ? 'f' : 'm'], wMul, dMul,
  };
}

// ---- the torso's anatomy
// Features are laid out across the body the way the detail texture draws
// them (detail.js): zn is how far out from the middle a point is (-1 at the
// left side, 1 at the right), s its height; the ink lines and the relief
// meet. mS scales the relief down under clothes.
const bell = (x, w) => { const k = x / w; return k > -1 && k < 1 ? (1 - k * k) * (1 - k * k) : 0; };
/** The male chest and belly: pecs over their crease, the abs' plates, obliques, serratus; a belly on heavy frames. */
function maleFront(sh, s, zn, mS) {
  const m = sh.m * mS, az = Math.abs(zn);
  let b = 0;
  // pecs: a slab from beside the sternum out to the armpit, its lower edge
  // dipping below the middle and rising toward the arm, full just above it
  const u = (az - 0.07) / 0.8;
  if (u > -0.12 && u < 1.2) {
    const lo = 0.615 + 0.05 * Math.pow(Math.abs(u - 0.38) / 0.62, 2) + u * 0.08;
    const ds = (s - lo) * sh.cl;
    if (ds > -0.015) {
      const edge = sstep(-0.015, 0.018 + 0.006 * (1 - m), ds);
      const top = 1 - sstep(0.1, 0.19, ds);
      const side = sstep(-0.12, 0.1, u) * (1 - sstep(0.9, 1.2, u));
      b += (0.006 + 0.028 * m) * edge * top * side * (1 - 0.3 * sstep(0.02, 0.14, ds)) * sh.F.ch;
    }
  }
  // collarbones
  if (s > 0.86) { const dc = (s - (0.945 - az * 0.04)) * sh.cl / 0.014; if (az < 0.75 && az > 0.08) b += bell(dc, 1) * (0.004 + 0.003 * m) * mS; }
  // abs: the rectus' plates between the grooves (the lines are drawn in)
  if (az < 0.46 && s > 0.02 && s < 0.6) {
    const across = 1 - sstep(0.3, 0.46, az);
    const upDown = sstep(0.02, 0.12, s) * (1 - sstep(0.52, 0.6, s));
    let plate = 0.003 + 0.009 * m;
    for (const g of [0.505, 0.415, 0.325]) plate -= bell(s - g, 0.03) * (0.002 + 0.006 * m);
    plate -= bell(az, 0.045) * (0.002 + 0.005 * m);
    b += plate * across * upDown;
  }
  // the navel
  b -= bell(az, 0.05) * bell(s - 0.19, 0.03) * 0.006;
  // serratus: fingers of muscle on the ribs under the arm
  if (m > 0.4 && az > 0.72 && s > 0.42 && s < 0.66) for (let i = 0; i < 3; i++) b += bell(s - (0.47 + i * 0.055) - (az - 0.8) * 0.3, 0.022) * bell(az - 0.86, 0.12) * (m - 0.4) * 0.008;
  // the obliques' V: a groove from the hip toward the groin
  const vz = 0.78 - (0.2 - s) / 0.28 * 0.5;
  if (s < 0.24 && s > -0.1) b -= bell(az - vz, 0.05) * (0.001 + 0.004 * m);
  // a belly
  if (sh.belly) b += sh.belly * 0.11 * bell(s - 0.22, 0.42) * Math.pow(Math.max(0, 1 - zn * zn), 0.8);
  return b;
}
function femaleFront(sh, s, zn, mS) {
  const az = Math.abs(zn);
  let b = 0;
  // collarbones, softer
  if (s > 0.86 && az < 0.7 && az > 0.08) b += bell((s - (0.955 - az * 0.03)) * sh.cl / 0.012, 1) * 0.003 * mS;
  // the bust: full at the bottom, a crease beneath, apart in the middle
  let bust = 0;
  for (const zc of [-0.42, 0.42]) {
    const dz = (zn - zc) / 0.4, ds = (s - 0.665) * sh.cl / 0.07;
    const r2 = dz * dz + (ds < 0 ? ds * ds * 1.6 : ds * ds * 0.8);
    if (r2 < 1) bust = Math.max(bust, Math.pow(1 - r2, 0.55) * 0.05 * sh.bust);
  }
  b += bust;
  // a toned belly on athletic women; a navel
  b += (1 - sstep(0.25, 0.4, az)) * sstep(0.08, 0.16, s) * (1 - sstep(0.46, 0.56, s)) * 0.004 * sh.m * mS;
  b -= bell(az, 0.05) * bell(s - 0.19, 0.03) * 0.005;
  if (sh.belly) b += sh.belly * 0.09 * bell(s - 0.2, 0.4) * Math.pow(Math.max(0, 1 - zn * zn), 0.8);
  return b;
}
/** The back: shoulder blades, the spine's groove, the muscles either side of it, the lats. */
function backRelief(sh, s, zn, mS) {
  const m = sh.m * (sh.fem ? 0.35 : 1) * mS, az = Math.abs(zn);
  let b = 0;
  b += bell(s - 0.74, 0.12) * bell(az - 0.36, 0.26) * (0.004 + 0.008 * m);
  b -= bell(az, 0.06) * sstep(0.06, 0.2, s) * (1 - sstep(0.82, 0.92, s)) * (0.003 + 0.004 * m);
  b += bell(az - 0.14, 0.1) * bell(s - 0.26, 0.24) * (0.002 + 0.007 * m);
  b += bell(az - 0.78, 0.2) * bell(s - 0.6, 0.18) * (0.003 + 0.01 * m);
  // glutes' tops and a heavy back
  if (sh.belly) b += sh.belly * 0.025 * bell(s - 0.3, 0.4);
  return b;
}
/** Extra half-width at height s: lats (the V), obliques above the hips, traps sloping up to the neck, love handles. */
function sideWidth(sh, s) {
  const m = sh.fem ? sh.m * 0.3 : sh.m;
  let w = bell(s - 0.66, 0.2) * (0.004 + 0.024 * m) * sh.F.sh;
  w += bell(s - 0.18, 0.16) * (0.002 + 0.006 * m);
  w += bell(s - 0.955, 0.05) * (0.004 + 0.022 * m) * (sh.F.neck > 1 ? sh.F.neck : 1);
  if (sh.belly) w += sh.belly * 0.05 * bell(s - 0.2, 0.3);
  return w;
}

/** A point on the torso (or a garment `off` metres over it) at height s and angle a (0 = front, +π/2 = right). */
function torsoPt(sh, s, a, off = 0, mS = 1) {
  interpRows(sh.T, s, _r);
  const W = (_r[1] * sh.wMul(s) + sideWidth(sh, s) * mS) * sh.Bk + off;
  const dm = sh.dMul(s);
  const Df = _r[2] * sh.BkD * dm + off, Db = _r[3] * sh.BkD * dm + off;
  const c = Math.cos(a), sn = Math.sin(a);
  const zn = supEl(sn, 0.78);
  const z = zn * W;
  let x = c >= 0 ? supEl(c, 0.78) * Df : supEl(c, 0.78) * Db;
  if (c > 0) x += Math.pow(c, 0.6) * (sh.fem ? femaleFront(sh, s, zn, mS) : maleFront(sh, s, zn, mS));
  else x -= Math.pow(-c, 0.6) * backRelief(sh, s, zn, mS);
  return [x, s * sh.cl, z];
}
function pelvisPt(sh, y, a, off = 0) {
  interpRows(sh.P, y, _r);
  const hp = sh.F.hp, bl = sh.belly ? sh.belly * 0.04 * bell(y - 0.05, 0.12) : 0;
  const W = _r[1] * sh.Bk * hp + off, Df = _r[2] * sh.BkD * (0.5 + 0.5 * hp) + off + bl, Db = _r[3] * sh.BkD * (0.5 + 0.5 * hp) + off;
  const c = Math.cos(a), sn = Math.sin(a);
  // the glutes round out the back below the hip bones
  const glute = c < 0 ? bell(y + 0.09, 0.09) * bell(sn, 0.9) * (sh.fem ? 0.022 : 0.012 + 0.008 * sh.m) * Math.pow(-c, 0.8) : 0;
  return [c >= 0 ? supEl(c, 0.8) * Df : supEl(c, 0.8) * Db - glute, y, supEl(sn, 0.8) * W];
}

/** Average the normals across a closed grid's seam (the back of the torso). */
function weldGrid(g, U, V) {
  const n = g.attributes.normal, W = U + 1;
  for (let j = 0; j <= V; j++) {
    const a = j * W, b = j * W + U;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
}

/**
 * A band of a body surface: rows (top → bottom, the surface's height
 * coordinate), angles a0(h) → a1(h) (full circle: -π → π, seam at the back).
 * `pt(h, a)` gives the point; `inward` flips it inside out (linings).
 */
function band(pt, rows, a0, a1, U, inward = false, uv = null) {
  const V = rows.length - 1;
  const full = typeof a0 === 'number' && typeof a1 === 'number' && a1 - a0 >= TAU - 1e-6;
  const g = grid((u, v) => {
    const h = rows[Math.round(v * V)];
    const A0 = typeof a0 === 'function' ? a0(h) : a0, A1 = typeof a1 === 'function' ? a1(h) : a1;
    const uu = inward ? 1 - u : u;
    const a = warp(A0 + (A1 - A0) * uu);
    const p = pt(h, a);
    if (uv) { const t = uv(h, a); p.push(t[0], t[1]); }
    return p;
  }, U, V, !!uv);
  if (full && !inward) weldGrid(g, U, V);
  return g;
}
/** Every other row (keeping both ends): cheap linings nobody looks at closely. */
function half(rows) {
  const out = rows.filter((_, i) => i % 2 === 0);
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return out;
}
/** The rows of `rows` within [lo, hi], with the cut heights added (top → bottom). */
function cut(rows, lo, hi) {
  const out = [hi];
  for (const s of rows) if (s < hi - 1e-4 && s > lo + 1e-4) out.push(s);
  out.push(lo);
  return out;
}

// ------------------------------------------------------------------ limbs
function interp1(tab, t) {
  interpRows(tab, t, _r, 2);
  return _r[1];
}
// (the anime-game look is chunkier than life: arms and legs with some meat on them, the muscles showing)
const LIMB_K = { m: 1.12, f: 1.05 };
// muscles on a limb: [t, half-length, direction, half-width (degrees), size, size per unit of muscle].
// Directions round the limb: F front, B back, L outside, M inside, and between (FL…)
const MUSCLES = {
  // deltoid (wrapping the shoulder), its front head, biceps, triceps, brachialis
  uarm: [[0.17, 0.2, 'L', 100, 0.006, 0.016], [0.14, 0.15, 'FL', 60, 0.002, 0.006], [0.56, 0.3, 'F', 65, 0.003, 0.017], [0.38, 0.32, 'B', 75, 0.003, 0.012], [0.7, 0.2, 'L', 50, 0.001, 0.004]],
  // brachioradialis, flexors, extensors
  farm: [[0.2, 0.3, 'FL', 60, 0.004, 0.013], [0.24, 0.3, 'FM', 60, 0.003, 0.009], [0.25, 0.3, 'BL', 55, 0.002, 0.006]],
  // quads, vastus lateralis, the teardrop above the knee, hamstrings, adductors, the hip's outside
  thigh: [[0.45, 0.38, 'F', 70, 0.004, 0.014], [0.5, 0.35, 'FL', 50, 0.003, 0.01], [0.8, 0.14, 'FM', 45, 0.003, 0.012], [0.45, 0.35, 'B', 70, 0.004, 0.008], [0.2, 0.22, 'M', 60, 0.004, 0.004], [0.08, 0.14, 'L', 60, 0.004, 0]],
  // the calf's two heads, tibialis, ankle bones
  shin: [[0.3, 0.2, 'BM', 50, 0.006, 0.016], [0.26, 0.19, 'BL', 45, 0.004, 0.012], [0.3, 0.3, 'FL', 40, 0.002, 0.004], [0.97, 0.05, 'L', 40, 0.005, 0], [0.955, 0.05, 'M', 40, 0.005, 0]],
};
const FRAME_K = { uarm: 'arm', farm: 'fa', thigh: 'th', shin: 'ca' };
const angDiff = (a, b) => { const d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };
/**
 * A limb's radius at t (0 at the upper joint, 1 at the lower) and angle th
 * (degrees round from the limb's +X: the back of the arm, the front of the
 * leg), for side 1 (right) or -1 (left). Called with t alone: the mean radius.
 */
function limbFn(kind, o, d, side = 1) {
  const fem = o.fem, m = o.muscle;
  const tab = LIMB[kind][fem ? 'f' : 'm'];
  const k = LIMB_K[fem ? 'f' : 'm'] * d.Bk * (d.F[FRAME_K[kind]] || 1);
  const arm = kind === 'uarm' || kind === 'farm';
  // where the named directions point on this limb
  const Fr = arm ? 180 : 0, Bk = arm ? 0 : 180, La = arm ? (side > 0 ? 270 : 90) : (side > 0 ? 90 : 270), Me = (La + 180) % 360;
  const mid = (a, b) => { let x = (a + b) / 2; if (Math.abs(a - b) > 180) x = (x + 180) % 360; return x; };
  const DIR = { F: Fr, B: Bk, L: La, M: Me, FL: mid(Fr, La), FM: mid(Fr, Me), BL: mid(Bk, La), BM: mid(Bk, Me) };
  const mus = MUSCLES[kind].map(([t, wt, dir, wa, a0, a1]) => [t, wt, DIR[dir], wa, (a0 + a1 * m) * (fem ? 0.4 : 1)]);
  return (t, th) => {
    let r = interp1(tab, t) * k;
    if (th === undefined) {
      for (const [tc, wt, , , a] of mus) r += bell(t - tc, wt) * a * 0.45;
      return r;
    }
    for (const [tc, wt, dc, wa, a] of mus) { const bt = bell(t - tc, wt); if (bt > 0) r += bt * bell(angDiff(th, dc), wa) * a; }
    if (kind === 'farm') { const c = Math.cos(th * Math.PI / 180); r *= 1 - 0.16 * sstep(0.7, 1, t) * c * c; }
    else if (kind === 'shin') {
      r -= bell(angDiff(th, Fr), 35) * 0.004 * (1 - sstep(0.8, 1, t));
      r *= 1 - 0.22 * sstep(0.62, 0.9, t) * bell(angDiff(th, Bk), 70);
    }
    return r;
  };
}
/**
 * One stretch of a limb (skin or a garment tube) from t0 to t1 along -Y, its
 * cross-section rf(t, angle): rounded caps close the joints (capK flattens
 * one: a sleeve's seam rather than a dome), open garment ends get a flare and
 * a lining lip so you see the cloth's edge rather than a hole. `uv`: the
 * detail region its lines come from (mirrored for the left side).
 */
function limbSeg(rf, L, rs, rows, seg) {
  const { t0 = 0, t1 = 1, off = 0, capTop = false, capBot = false, flare = 0, flareTop = 0, lining = false, bulge = 0, capK = 1, uv = null, side = 1 } = seg;
  const U = Math.max(6, rs);
  const R = (t, th) => rf(t, th) + off;
  // rows of [t, radius scale, extra radius, y offset (in units of the mean radius), cap]
  const P = [];
  if (capBot) for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k / 3) * (Math.PI / 2); P.push([t1, Math.cos(a), flare, Math.sin(a), 1]); }
  else if (lining) P.push([t1, 1, flare - 0.013, 0.024 / Math.max(0.02, R(t1)), 2]);
  for (let i = rows; i >= 0; i--) {
    const f = i / rows; // 1 at the bottom
    const t = t0 + (t1 - t0) * f;
    P.push([t, 1, flare * sstep(0.5, 1, f) + flareTop * sstep(0.5, 1, 1 - f) + bulge * Math.sin(f * Math.PI), 0, 0]);
  }
  if (capTop) for (let k = 1; k <= 3; k++) { const a = (k / 3) * (Math.PI / 2); P.push([t0, Math.cos(a), flareTop, Math.sin(a) * capK, 1]); }
  else if (lining) P.push([t0, 1, flareTop - 0.013, -0.024 / Math.max(0.02, R(t0)), 2]);
  const pos = [], uvs = [], idx = [];
  const W = U + 1;
  for (const [t, rk, ex, dy, cap] of P) {
    const rm = R(t);
    for (let i = 0; i <= U; i++) {
      const th = (i / U) * 360, a = th * Math.PI / 180;
      // (a cap rounds off toward its pole: a muscle's bulge doesn't carry up into the dome)
      const rt = cap === 1 ? R(t, th) * rk + rm * (1 - rk) : R(t, th);
      const r = Math.max(1e-5, (rt + ex) * rk + (cap ? 1e-5 : 0));
      pos.push(Math.cos(a) * r, -t * L + dy * rm, Math.sin(a) * r);
      if (uv) { const u = side < 0 ? 1 - i / U : i / U; const q = atlasUV(uv, u, 1 - Math.min(1, Math.max(0, t))); uvs.push(q[0], q[1]); } else uvs.push(BLANK_UV[0], BLANK_UV[1]);
    }
  }
  for (let j = 0; j < P.length - 1; j++) {
    for (let i = 0; i < U; i++) {
      const a = j * W + i, b = a + 1, c = a + W, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  weldGrid(g, U, P.length - 1);
  g.userData.detail = !!uv;
  return g;
}
/**
 * Skin weights across a limb's joints: toward the bone above near the top
 * joint and the bone below near the bottom one — [bone, weight at the
 * joint, over how far] — so elbows and knees bend smoothly.
 */
function limbBlend(L, up, down) {
  return (x, y) => {
    if (up) { const dd = -y; if (dd < up[2]) return [up[0], up[1] * (1 - sstep(0, up[2], dd))]; }
    if (down) { const dd = y + L; if (dd < down[2]) return [down[0], down[1] * (1 - sstep(0, down[2], dd))]; }
    return null;
  };
}
const torus = (q) => Prim.torus(0.2, 3, q.cloth ? 12 : 7);
/** Matrix for a torus(0.2) ring around the Y axis at height y: radii rx (front) × rz (side), `thick` tall. */
const ringAt = (y, rx, rz, thick = 0.014) => M(0, y, 0, Math.PI / 2, 0, 0, [rx, rz, thick / 0.2]);

// ------------------------------------------------------------------ the figure
/**
 * Pelvis, torso, arms (without hands), legs, feet and all the clothes.
 * `add(geo, matrix, colour, bone, part)`; parts tag forearms (1, 2) and
 * shins (3, 4) for the Haki / fire-leg shader effects.
 */
export function buildFigure(add0, look, d, pal, q) {
  const o = outfitOf(look);
  const cc = clothColours(look, pal, o);
  const sh = shapeOf(d, o);
  const cloth = q.cloth; // linings, cuffs, buttons (near detail only)
  const bd = q.body ?? (cloth ? 2 : 0); // how finely the body is divided: 2 near, 1 mid, 0 far
  const U = [10, 14, 22][bd];
  const rs = [7, 10, 14][bd];
  const lrows = [2, 4, 7][bd];
  const skin = pal.skin;
  // the waist bends and twists smoothly: toward the hips a part follows the
  // pelvis, higher up the chest (whichever of the two it's built on)
  const hipsW = (y) => 1 - sstep(-0.06, 0.14, y);
  const onChest = { blend: (x, y) => { const w = hipsW(y); return w > 0.002 ? [B.hips, w] : null; } };
  const onHips = { blend: (x, y) => { const w = 1 - hipsW(y); return w > 0.002 ? [B.chest, w] : null; } };
  const add = (g, m, col, bone, part = 0, opts) => add0(g, m, col, bone, part, opts ?? (bone === B.chest ? onChest : bone === B.hips ? onHips : null));

  // ---- torso rows (s, top → bottom): close together over the chest and the abs
  const TR = bd === 2
    ? [1.0, 0.975, 0.955, 0.935, 0.915, 0.89, 0.86, 0.83, 0.8, 0.765, 0.73, 0.7, 0.67, 0.645, 0.62, 0.6, 0.575, 0.55, 0.52, 0.49, 0.46, 0.43, 0.4, 0.37, 0.34, 0.31, 0.28, 0.24, 0.2, 0.16, 0.12, 0.07, 0.02, -0.04, -0.1]
    : bd === 1 ? [1.0, 0.97, 0.93, 0.89, 0.84, 0.78, 0.72, 0.67, 0.62, 0.57, 0.5, 0.42, 0.33, 0.24, 0.14, 0.03, -0.1]
      : [1.0, 0.93, 0.82, 0.7, 0.58, 0.4, 0.2, -0.1];
  const tpt = (mS, off = 0) => (s, a) => torsoPt(sh, s, a, off, mS);
  const skinTorso = tpt(1);
  const TOP = o.top;
  const shirtM = 0.45; // how much muscle shows through a shirt
  // the ink lines on bare skin (by build) and the folds of a shirt
  const skinReg = o.fem ? 'torsoFem' : o.muscle >= 0.55 ? 'torsoMusc' : 'torsoLean';
  const tuv = (reg) => (reg ? (s, a) => torsoUV(reg, a, s) : null);
  const addT = (rows, pt, col, a0 = -Math.PI, a1 = Math.PI, inward = false, reg = null) => add(band(pt, rows, a0, a1, U, inward, inward ? null : tuv(reg)), M(), col, B.chest);
  const neckS = TOP === 'shirt' || TOP === 'jacket' ? 0.955 : TOP === 'tank' || TOP === 'dress' ? 0.84 : 0.93;

  // body torso, split into what the top covers and what shows
  // (a kimono worn open to the sash shows the chest: Zoro's)
  const openKim = TOP === 'kimono' && !!look.openShirt;
  if (TOP === 'bare' || TOP === 'vest' || TOP === 'open' || openKim || TOP === 'coat' && !look.top2) {
    addT(TR, skinTorso, skin, -Math.PI, Math.PI, false, skinReg);
  } else if (TOP === 'crop' || TOP === 'bikini') {
    const lo = TOP === 'crop' ? 0.5 : 0.58, hi = TOP === 'crop' ? 0.86 : 0.78;
    addT(cut(TR, hi, 1), skinTorso, skin, -Math.PI, Math.PI, false, skinReg);
    addT(cut(TR, lo, hi), tpt(1, 0.002), pal.top);
    addT(cut(TR, -0.1, lo), skinTorso, skin, -Math.PI, Math.PI, false, skinReg);
    straps(add, sh, hi, pal.top, q);
  } else if (TOP === 'striped') {
    addT(cut(TR, neckS, 1), skinTorso, skin, -Math.PI, Math.PI, false, skinReg);
    const n = cloth ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const hi = neckS - (neckS + 0.1) * (k / n), lo = neckS - (neckS + 0.1) * ((k + 1) / n);
      addT(cut(TR, lo, hi), tpt(shirtM), k % 2 ? cc.top2 : pal.top, -Math.PI, Math.PI, false, 'torsoCloth');
    }
  } else {
    // one covering garment colour (the inner shirt under a jacket or coat)
    const col = TOP === 'jacket' || TOP === 'coat' ? cc.top2 : pal.top;
    addT(cut(TR, neckS, 1), skinTorso, skin, -Math.PI, Math.PI, false, skinReg);
    addT(cut(TR, -0.1, neckS), tpt(shirtM), col, -Math.PI, Math.PI, false, 'torsoCloth');
    if (TOP === 'tank' || TOP === 'dress') straps(add, sh, neckS, col, q);
    if (cloth && TOP !== 'tank' && TOP !== 'dress') {
      // a ribbed collar at the neckline
      const f = torsoPt(sh, neckS, 0, 0, shirtM)[0], bk = -torsoPt(sh, neckS, Math.PI, 0, shirtM)[0], W = torsoPt(sh, neckS, Math.PI / 2, 0, shirtM)[2];
      add(torus(q), mul(M((f - bk) / 2, 0, 0), ringAt(neckS * sh.cl, (f + bk) / 2 + 0.002, W + 0.002, 0.012)), shade(col, -0.18), B.chest);
    }
  }
  // the neck, its top turning with the head
  const nk = (o.fem ? 0.04 : 0.05 * (1 + (d.Bk - 1) * 0.5) * (1 + o.muscle * 0.14)) * d.F.neck;
  const neckTop = d.chestLen + d.neck;
  add(neckGeo(nk, d.chestLen - 0.05, neckTop + 0.035, o, cloth), M(), skin, B.chest, 0, { blend: (x, y) => { const w = 0.8 * sstep(d.chestLen + d.neck * 0.05, neckTop, y); return w > 0.002 ? [B.head, w] : null; } });

  // ---- tops worn over the body
  const edge = (a) => (s) => a(s), rest = (a) => (s) => TAU - a(s);
  const shell = (rows, aFn, off, mS, col, lin2) => {
    add(band(tpt(mS, off), rows, edge(aFn), rest(aFn), U, false, tuv('torsoCloth')), M(), col, B.chest);
    if (cloth) add(band(tpt(mS, off - 0.005), half(rows), edge(aFn), rest(aFn), U / 2, true), M(), lin2, B.chest);
  };
  if (TOP === 'vest') {
    const rows = cut(TR, 0.1, 0.975);
    shell(rows, (s) => 0.36 + (s - 0.1) * 0.36, 0.009, 1, pal.top, cc.lining);
    if (cloth) for (let k = 0; k < 3; k++) { // three buttons down one edge
      const s = 0.3 + k * 0.17, a = -(0.36 + (s - 0.1) * 0.36) - 0.12;
      const p = torsoPt(sh, s, a, 0.016, 1);
      add(Prim.sphere(6, 4), M(p[0], p[1], p[2], 0, 0, 0, 0.011), '#ffd54f', B.chest);
    }
  } else if (TOP === 'open') {
    const rows = cut(TR, -0.08, 0.97);
    shell(rows, (s) => 0.3 + Math.max(0, s - 0.25) * 0.5, 0.01, 1, pal.top, cc.lining);
    if (cloth) collarFlaps(add, sh, pal.top, 0.62);
  } else if (TOP === 'jacket' || TOP === 'kimono' || TOP === 'coat' && look.top2) {
    const kim = TOP === 'kimono';
    const col = TOP === 'coat' ? look.coat || pal.top : pal.top;
    const rows = cut(TR, -0.1, 0.985);
    const open = openKim ? (s) => 0.06 + sstep(0.05, 0.9, s) * 0.62 : kim ? (s) => 0.02 + sstep(0.28, 0.98, s) * 0.46 : (s) => 0.015 + sstep(0.46, 0.96, s) * 0.62;
    shell(rows, open, kim ? 0.014 : 0.012, openKim ? 1 : 0.2, col, shade(col, -0.3));
    if (cloth) {
      // lapels / the kimono's collar trim along the opening
      const trim = openKim && !look.top2 ? shade(col, -0.2) : kim ? cc.top2 : shade(col, -0.12);
      const up = cut(TR, kim ? 0.28 : 0.46, 0.985);
      const tw = kim ? 0.3 : 0.24;
      const tmS = openKim ? 1 : 0.2;
      add(band(tpt(tmS, 0.017), up, (s) => open(s), (s) => open(s) + tw, Math.max(3, U / 6)), M(), trim, B.chest);
      add(band(tpt(tmS, 0.017), up, (s) => TAU - open(s) - tw, (s) => TAU - open(s), Math.max(3, U / 6)), M(), trim, B.chest);
      if (!kim) for (let k = 0; k < 2; k++) {
        const p = torsoPt(sh, 0.3 - k * 0.14, 0, 0.017, 0.2);
        add(Prim.sphere(6, 4), M(p[0], p[1], p[2], 0, 0, 0, 0.011), shade(col, -0.35), B.chest);
      }
      if (cc.tie && !kim) {
        const a = torsoPt(sh, 0.92, 0, 0.008, 0.2), b = torsoPt(sh, 0.5, 0, 0.012, 0.2);
        add(Prim.rbox(0.4, 6, 5), between(a, b, 0.024, 0.006), cc.tie, B.chest);
      }
    }
    if (TOP === 'jacket') {
      // the jacket's skirt over the hips
      const rows2 = cloth ? [0.075, 0.0, -0.08, -0.16] : [0.075, -0.16];
      const pp = (y, a) => pelvisPt(sh, y, a, 0.022 + (0.075 - y) * 0.12);
      add(band(pp, rows2, 0.22, TAU - 0.22, U), M(), col, B.hips);
      if (cloth) add(band((y, a) => pelvisPt(sh, y, a, 0.017 + (0.075 - y) * 0.12), rows2, 0.22, TAU - 0.22, U, true), M(), shade(col, -0.3), B.hips);
    }
  }
  if (look.vest && TOP !== 'vest') {
    // an extra open vest layer over the shirt
    shell(cut(TR, 0.05, 0.97), (s) => 0.4 + (s - 0.05) * 0.3, 0.02, 0.3, look.vest, shade(look.vest, -0.3));
  }
  // shirts hanging loose over the waist
  const loose = !o.tucked && (TOP === 'tee' || TOP === 'shirt' || TOP === 'striped' || TOP === 'tank' || TOP === 'open');
  if (loose && !o.skirt) {
    const hem = cloth ? [0.2, 0.08, -0.06, -0.2, -0.34] : [0.2, -0.34];
    const col = TOP === 'striped' ? pal.top : pal.top;
    const off = (s) => 0.006 + (0.2 - s) * 0.03;
    const a0 = TOP === 'open' ? 0.3 : -Math.PI, a1 = TOP === 'open' ? TAU - 0.3 : Math.PI;
    add(band((s, a) => torsoPt(sh, s, a, off(s), shirtM * 0.5), hem, a0, a1, U), M(), col, B.chest);
    if (cloth) add(band((s, a) => torsoPt(sh, s, a, off(s) - 0.006, 0.2), hem.slice(-2), a0, a1, U, true), M(), cc.lining, B.chest);
  }

  // ---- pelvis, waist
  const PR = cloth ? [0.08, 0.05, 0.02, -0.02, -0.06, -0.1, -0.13, -0.155, -0.18, -0.2, -0.215] : [0.08, 0.0, -0.08, -0.15, -0.215];
  const skirtPelvis = o.skirt || TOP === 'dress';
  const pelvisCol = TOP === 'dress' ? pal.top : pal.bottom;
  add(band((y, a) => pelvisPt(sh, y, a), PR, -Math.PI, Math.PI, U), M(), pelvisCol, B.hips);
  if (o.waist === 'belt') {
    const rows = [0.082, 0.04];
    add(band((y, a) => pelvisPt(sh, y, a, 0.007), rows, -Math.PI, Math.PI, U), M(), pal.belt, B.hips);
    const p = pelvisPt(sh, 0.061, 0, 0.012);
    add(Prim.rbox(0.4, 6, 5), M(p[0], p[1], p[2], 0, 0, 0, [0.008, 0.026, 0.032]), look.buckle || '#ffd54f', B.hips);
  } else if (o.waist === 'sash') {
    const rows = cloth ? [0.1, 0.07, 0.04, 0.01] : [0.1, 0.01];
    add(band((y, a) => pelvisPt(sh, y, a, 0.011 + Math.abs(y - 0.055) * 0.08), rows, -Math.PI, Math.PI, U), M(), cc.waist, B.hips);
    // the knot on the left hip and its hanging ends
    const k = pelvisPt(sh, 0.05, -1.25, 0.02);
    add(Prim.sphere(q.sph[0], q.sph[1]), M(k[0], k[1], k[2], 0, 0, 0, [0.03, 0.032, 0.026]), shade(cc.waist, -0.08), B.hips);
    for (const [dx, len, rot] of [[0.012, 0.2, 0.12], [-0.02, 0.16, -0.08]]) {
      add(Prim.rbox(0.35, ...q.rboxS), mul(M(k[0] + dx, k[1] - len / 2, k[2] - 0.01, rot, 0, 0.1), M(0, 0, 0, 0, 0, 0, [0.022, len / 2, 0.008])), cc.waist, B.hips);
    }
  } else if (o.waist === 'haramaki' || o.waist === 'obi') {
    const hi = o.waist === 'obi' ? 0.32 : 0.3, lo = o.waist === 'obi' ? 0.08 : -0.06;
    const rows = cut(TR, lo, hi);
    add(band(tpt(0.3, o.waist === 'obi' ? 0.02 : 0.016), rows, -Math.PI, Math.PI, U), M(), cc.waist, B.chest);
    if (o.waist === 'obi' && cloth) {
      const p = torsoPt(sh, 0.2, Math.PI, 0.04, 0.3);
      add(Prim.rbox(0.4, ...q.rboxS), M(p[0], p[1], p[2], 0, 0, 0, [0.03, 0.05, 0.1]), shade(cc.waist, -0.1), B.chest);
    }
  }
  // skirts and dresses hang from the waist
  if (skirtPelvis) {
    const long = o.bottom === 'longskirt';
    const yb = long ? -0.88 * d.Lg : -0.34;
    const col = TOP === 'dress' ? pal.top : pal.bottom;
    const rows = cloth ? [0.08, 0.0, -0.1, -0.1 + (yb + 0.1) * 0.25, -0.1 + (yb + 0.1) * 0.5, -0.1 + (yb + 0.1) * 0.75, yb] : [0.08, -0.1, (yb - 0.1) * 0.5, yb];
    // (the hem clears the hips and thighs, however broad the frame)
    const fw = Math.max(1, sh.F.hp * 0.55 + sh.F.th * 0.45);
    const Wh = (long ? 0.3 : 0.225) * sh.Bk * fw, Dh = (long ? 0.3 : 0.2) * sh.Bk * fw;
    const sp = (y, a, inset = 0) => {
      const k = clamp((0.08 - y) / (0.08 - yb), 0, 1);
      const p = pelvisPt(sh, Math.max(y, -0.06), a, 0.012 - inset);
      const f = Math.pow(k, 0.7);
      const hx = Math.cos(a) * (Dh - inset), hz = Math.sin(a) * (Wh - inset);
      return [p[0] + (hx - p[0]) * f, y, p[2] + (hz - p[2]) * f];
    };
    // (the cloth below the hips goes with the leg it hangs over: a stride carries
    // the skirt forward rather than the knee coming through it)
    const skirtW = { blend: (x, y, z) => {
      const k = clamp((0.08 - y) / (0.08 - yb), 0, 1);
      if (k < 0.12) { const w = 1 - hipsW(y); return w > 0.002 ? [B.chest, w] : null; }
      const w = Math.pow((k - 0.12) / 0.88, 1.1) * 0.82 * (0.35 + 0.65 * sstep(0, 0.5, Math.abs(z) / Wh));
      return w > 0.002 ? [z > 0 ? B.thighR : B.thighL, w] : null;
    } };
    add(band((y, a) => sp(y, a), rows, -Math.PI, Math.PI, U, false, (y, a) => atlasUV('skirt', (a + Math.PI) / TAU, 1 - clamp((0.08 - y) / (0.08 - yb), 0, 1))), M(), col, B.hips, 0, skirtW);
    if (cloth) add(band((y, a) => sp(y, a, 0.008), rows.slice(-2), -Math.PI, Math.PI, U, true), M(), shade(col, -0.35), B.hips, 0, skirtW);
  }

  // ---- arms (skin weights blend across the shoulder into the chest and across the elbow)
  const armCol = pal.sleeve || (TOP === 'coat' ? look.coat || pal.top : TOP === 'jacket' ? pal.top : TOP === 'striped' ? pal.top : pal.top);
  const Lk = Math.sqrt(d.Am);
  for (const [s, Ub, Fb, part] of [[1, B.uarmR, B.farmR, 1], [-1, B.uarmL, B.farmL, 2]]) {
    const sl = o.sleeves;
    // (sleeves hang over the muscles: only a little of them shows through)
    const mA = sl === 'long' || sl === 'wide' ? o.muscle * 0.35 : o.muscle;
    const oA = mA === o.muscle ? o : { ...o, muscle: mA };
    const ua = limbFn('uarm', oA, d, s), fa = limbFn('farm', oA, d, s);
    const U1 = { blend: limbBlend(d.A1, [B.chest, 0.3, 0.07 * Lk], [Fb, 0.5, 0.075 * Lk]) };
    const F1 = { blend: limbBlend(d.A2, [Ub, 0.5, 0.075 * Lk], null) };
    const skU = o.fem ? null : 'uarm', skF = o.fem ? null : 'farm';
    const up = (g, col, m = M()) => add(g, m, col, Ub, 0, U1), fore = (g, col, m = M()) => add(g, m, col, Fb, part, F1);
    if (sl === 'none') {
      up(limbSeg(ua, d.A1, rs, lrows, { capTop: true, capBot: true, capK: 0.6, uv: skU, side: s }), skin);
      fore(limbSeg(fa, d.A2, rs, lrows, { capTop: true, capBot: true, capK: 0.7, uv: skF, side: s }), skin);
    } else if (sl === 'short') {
      up(limbSeg(ua, d.A1, rs, lrows, { t1: 0.5, off: 0.008, capTop: true, capK: 0.45, flare: 0.012, lining: cloth, uv: 'sleeve', side: s }), armCol);
      up(limbSeg(ua, d.A1, rs, lrows, { t0: 0.42, capBot: true, uv: skU, side: s }), skin);
      fore(limbSeg(fa, d.A2, rs, lrows, { capTop: true, capBot: true, capK: 0.7, uv: skF, side: s }), skin);
    } else if (sl === 'rolled') {
      up(limbSeg(ua, d.A1, rs, lrows, { off: 0.01, capTop: true, capK: 0.5, capBot: true, uv: 'sleeve', side: s }), armCol);
      if (cloth) up(torus(q), shade(armCol, -0.12), ringAt(-d.A1 * 0.96, ua(0.96) + 0.02, ua(0.96) + 0.02, 0.03));
      fore(limbSeg(fa, d.A2, rs, lrows, { capTop: true, capBot: true, capK: 0.7, uv: skF, side: s }), skin);
    } else {
      // long and wide sleeves down to the wrist
      const wide = sl === 'wide';
      // (a kimono's sleeve drops from a flat shoulder seam: no ball at the top)
      up(limbSeg(ua, d.A1, rs, lrows, { t0: wide ? 0.07 : 0, off: wide ? 0.015 : 0.01, capTop: true, capK: 0.5, capBot: true, uv: 'sleeve', side: s }), armCol);
      fore(limbSeg(fa, d.A2, rs, lrows, { off: wide ? 0.022 : 0.011, capTop: true, capK: 0.6, flare: wide ? 0.075 : 0.008, lining: cloth, t1: wide ? 1.02 : 0.98, uv: 'sleeve', side: s }), armCol);
      if (cloth && !wide) fore(torus(q), shade(armCol, -0.15), ringAt(-d.A2 * 0.95, fa(0.95) + 0.018, fa(0.95) + 0.018, 0.022));
      fore(limbSeg(fa, d.A2, rs, 2, { t0: 0.8, capBot: true }), skin);
    }
    // (the long-armed folk's second elbow, halfway down the forearm)
    if (d.Am > 1.2) fore(Prim.sphere(q.sph[0], q.sph[1]), sl === 'long' || sl === 'wide' ? armCol : skin, M(0, -d.A2 * 0.5, 0, 0, 0, 0, fa(0.5) * 1.08));
    // the point of the elbow on bare arms
    if (cloth && (sl === 'none' || sl === 'short')) up(Prim.sphere(q.sph[0], q.sph[1]), skin, M(ua(1) * 0.55, -d.A1 * 0.985, 0, 0, 0, 0, [0.022 * d.Bk, 0.026 * d.Bk, 0.024 * d.Bk]));
  }

  // ---- legs (weights blend across the hip into the pelvis and across the knee)
  const bot = o.bottom;
  const bcol = pal.bottom, cuffCol = shade(pal.bottom, -0.22);
  for (const [T, S, Ft, part, s] of [[B.thighR, B.shinR, B.footR, 3, 1], [B.thighL, B.shinL, B.footL, 4, -1]]) {
    const th = limbFn('thigh', o, d, s), sn = limbFn('shin', o, d, s);
    const T1 = { blend: limbBlend(d.T1, [B.hips, 0.35, 0.09], [S, 0.5, 0.09]) };
    const S1 = { blend: limbBlend(d.T2, [T, 0.5, 0.09], null) };
    const skT = o.fem ? null : 'thigh', skS = o.fem ? null : 'shin';
    const thigh = (g, col, m = M()) => add(g, m, col, T, 0, T1), shin = (g, col, m = M()) => add(g, m, col, S, part, S1);
    const boots = o.shoes === 'boots';
    if (skirtPelvis) {
      thigh(limbSeg(th, d.T1, rs, lrows, { capTop: true, capBot: true, capK: 0.7, uv: skT, side: s }), skin);
      if (!boots) shin(limbSeg(sn, d.T2, rs, lrows, { capTop: true, capBot: true, capK: 0.7, uv: skS, side: s }), skin);
    } else if (bot === 'shorts') {
      thigh(limbSeg(th, d.T1, rs, lrows, { t1: 0.86, off: 0.014, capTop: true, flare: 0.024, lining: cloth, uv: 'trouser', side: s }), bcol);
      if (cloth) thigh(torus(q), cuffCol, ringAt(-d.T1 * 0.85, th(0.86) + 0.036, th(0.86) + 0.036, 0.03));
      thigh(limbSeg(th, d.T1, rs, lrows, { t0: 0.78, capBot: true, capK: 0.7, uv: skT, side: s }), skin);
      if (!boots) shin(limbSeg(sn, d.T2, rs, lrows, { capTop: true, capBot: true, capK: 0.7, uv: skS, side: s }), skin);
    } else {
      const baggy = bot === 'baggy' || bot === 'hakama';
      const offT = bot === 'slim' ? 0.008 : bot === 'hakama' ? 0.04 : baggy ? 0.03 : 0.014;
      thigh(limbSeg(th, d.T1, rs, lrows, { off: offT, capTop: true, capBot: true, capK: 0.7, uv: 'trouser', side: s }), bcol);
      if (bot === 'capri') {
        shin(limbSeg(sn, d.T2, rs, lrows, { t1: 0.55, off: 0.013, capTop: true, capK: 0.7, flare: 0.02, lining: cloth, uv: 'trouserShin', side: s }), bcol);
        if (cloth) shin(torus(q), cuffCol, ringAt(-d.T2 * 0.54, sn(0.55) + 0.032, sn(0.55) + 0.032, 0.03));
        if (!boots) shin(limbSeg(sn, d.T2, rs, lrows, { t0: 0.48, capBot: true, uv: skS, side: s }), skin);
      } else if (boots && (baggy || bot === 'slim')) {
        // tucked into the boots
        shin(limbSeg(sn, d.T2, rs, lrows, { t1: 0.6, off: bot === 'slim' ? 0.008 : 0.028, capTop: true, capK: 0.7, bulge: baggy ? 0.012 : 0, uv: 'trouserShin', side: s }), bcol);
      } else {
        const hem = bot === 'hakama' ? 0.075 : baggy ? 0.004 : bot === 'slim' ? 0.004 : 0.026;
        const offS = bot === 'hakama' ? 0.04 : baggy ? 0.03 : bot === 'slim' ? 0.008 : 0.014;
        shin(limbSeg(sn, d.T2, rs, lrows, { off: offS, capTop: true, capK: 0.7, flare: hem, lining: cloth, t1: bot === 'slim' ? 0.97 : 0.99, bulge: baggy ? 0.014 : 0, uv: 'trouserShin', side: s }), bcol);
        if (baggy && bot !== 'hakama' && cloth) shin(torus(q), cuffCol, ringAt(-d.T2 * 0.96, sn(0.96) + 0.034, sn(0.96) + 0.034, 0.024));
      }
    }
    // boots: a shaft up the shin with a folded top (under long trousers only the foot shows)
    if (boots) {
      const bc = pal.shoes;
      const tuck = bot === 'baggy' || bot === 'slim' || bot === 'hakama';
      if (skirtPelvis || bot === 'shorts' || bot === 'capri' || tuck) {
        const t0 = 0.42;
        if (!tuck) shin(limbSeg(sn, d.T2, rs, lrows, { capTop: true, capK: 0.7, t1: t0 + 0.06, uv: skS, side: s }), skin);
        shin(limbSeg(sn, d.T2, rs, lrows, { t0, off: tuck ? 0.034 : 0.016, flareTop: 0.01, capBot: true }), bc);
        if (cloth) shin(torus(q), shade(bc, -0.2), ringAt(-d.T2 * (t0 + 0.02), sn(t0) + (tuck ? 0.044 : 0.027), sn(t0) + (tuck ? 0.044 : 0.027), 0.03));
      }
    }
    // kneecaps and ankle bones where the leg is bare
    if (cloth) {
      const bareKnee = skirtPelvis || bot === 'shorts';
      if (bareKnee) shin(Prim.sphere(q.sph[0], q.sph[1]), skin, M(sn(0) * 0.62, -0.012, 0, 0, 0, 0, [0.026 * d.Bk, 0.034 * d.Bk, 0.032 * d.Bk]));
      const bareAnkle = (skirtPelvis || bot === 'shorts' || bot === 'capri') && !boots && o.bottom !== 'longskirt';
      if (bareAnkle) for (const [zz, yy] of [[1, 0.975], [-1, 0.955]]) shin(Prim.sphere(q.sph[0], q.sph[1]), skin, M(0.004, -d.T2 * yy, zz * sn(0.97) * 0.8, 0, 0, 0, 0.017 * d.Bk));
    }
    feet(add, o, pal, d, q, Ft, part);
  }

  // ---- a coat over the shoulders (coat colour), the tail swings from the waist
  if (look.coat && TOP !== 'coat' || TOP === 'coat' && !look.top2 && look.coat) coat(add, sh, look.coat, TR, U, cloth, d, q);
  else if (TOP === 'coat') coatTail(add, sh, look.coat || pal.top, U, cloth, d, 0.03);
  return o;
}

/**
 * The neck, from inside the collar up into the head: a little wider at the
 * base, the two tendons running from behind the ears down to the notch
 * between the collarbones, and an Adam's apple on men.
 */
function neckGeo(nk, y0, y1, o, cloth) {
  const U = cloth ? 14 : 7, V = cloth ? 6 : 2;
  const g = grid((u, v) => {
    const a = -Math.PI + u * TAU, h = 1 - v; // h: 0 at the base, 1 at the top
    const y = y0 + (y1 - y0) * h;
    let r = nk * (1.1 - 0.12 * sstep(0, 0.5, h));
    if (cloth) {
      // tendons: behind the ears at the top, meeting at the front at the base
      const ang = 0.4 + (1.75 - 0.4) * h;
      const da = Math.abs(Math.abs(a) - ang) / 0.3;
      if (da < 1) r += (1 - da * da) * nk * (o.fem ? 0.05 : 0.09) * sstep(0.05, 0.3, h) * (1 - sstep(0.85, 1, h));
      if (!o.fem) {
        const dx = Math.abs(a) / 0.3, dh = (h - 0.5) / 0.2;
        if (dx < 1 && Math.abs(dh) < 1) r += (1 - dx * dx) * (1 - dh * dh) * nk * 0.16;
      }
    }
    return [Math.cos(a) * r * 0.95, y, Math.sin(a) * r];
  }, U, V);
  // weld the seam at the back
  const n = g.attributes.normal, W = U + 1;
  for (let j = 0; j <= V; j++) {
    const a = j * W, b = j * W + U;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

/** Shoulder straps (tank tops, crop tops, dresses) from a front neckline at s. */
function straps(add, sh, s, col, q) {
  for (const side of [-1, 1]) {
    const f = torsoPt(sh, s, side * 0.62, 0.004, 0.5), back = torsoPt(sh, s - 0.02, side * (Math.PI - 0.62), 0.004, 0.5);
    const top = torsoPt(sh, 0.95, side * Math.PI / 2, 0.006, 0.5);
    top[1] += 0.012;
    add(Prim.cyl(5), between(f, top, 0.013, 0.005), col, B.chest);
    add(Prim.cyl(5), between(top, back, 0.013, 0.005), col, B.chest);
  }
}

/** Folded-down collar points on an open shirt. */
function collarFlaps(add, sh, col, a) {
  for (const side of [-1, 1]) {
    const p = torsoPt(sh, 0.9, side * a, 0.016, 1);
    add(Prim.rbox(0.4, 6, 5), mul(M(p[0], p[1], p[2], 0, 0, 0), M(0, 0, 0, side * 0.5, -side * 0.3, 0.35, [0.03, 0.045, 0.006])), shade(col, -0.05), B.chest);
  }
}

/** Shoes, boots, sandals, geta or bare feet (origin at the ankle, toes along +X). */
function feet(add, o, pal, d, q, Ft, part) {
  const k = o.fem ? 0.9 : 1.06;
  const w = (o.fem ? 0.048 : 0.058) * d.Bk;
  const S = (x, y, z) => [x * k, y, z];
  const skin = pal.skin;
  const rb = (small = true) => Prim.rbox(0.42, ...(small ? q.rboxS : q.rbox));
  if (o.shoes === 'sandals' || o.shoes === 'geta' || o.shoes === 'bare') {
    add(rb(), M(0.05 * k, -0.046, 0, 0, 0, 0, S(0.11, 0.034, w * 0.9)), skin, Ft, part);
    add(rb(), M(0.148 * k, -0.058, 0, 0, 0, 0.1, S(0.034, 0.022, w * 0.86)), shade(skin, -0.04), Ft, part);
    add(Prim.cyl(6, true), M(0, -0.02, 0, 0, 0, 0, [0.042 * d.Bk, 0.05, 0.042 * d.Bk]), skin, Ft, part);
    if (o.shoes === 'bare') return;
    const sole = o.shoes === 'geta' ? '#8d6e4a' : shade(pal.shoes, -0.1);
    add(rb(), M(0.055 * k, -0.079, 0, 0, 0, 0, S(0.125, 0.008, w * 1.02)), sole, Ft, part);
    add(Prim.torus(0.28, 3, 10), M(0.078 * k, -0.05, 0, 0, Math.PI / 2, 0, [w * 0.98, 0.03, 0.022 / 0.28]), o.shoes === 'geta' ? '#c62828' : pal.shoes, Ft, part);
    if (o.shoes === 'geta') for (const x of [-0.02, 0.1]) add(Prim.box(), M(x * k, -0.1, 0, 0, 0, 0, [0.012, 0.014, w * 0.9]), '#6d4c41', Ft, part);
    return;
  }
  const boot = o.shoes === 'boots';
  const col = pal.shoes, sole = shade(col, -0.4);
  add(Prim.rbox(0.4, ...q.rbox), M(0.055 * k, -0.04, 0, 0, 0, 0, S(0.128, 0.045, w)), col, Ft, part);
  add(rb(), M(0.056 * k, -0.078, 0, 0, 0, 0, S(0.132, 0.01, w * 1.04)), sole, Ft, part);
  if (!boot) add(Prim.cyl(6, true), M(-0.005, 0.02, 0, 0, 0, 0, [0.05 * d.Bk, 0.1, 0.05 * d.Bk]), col, Ft, part);
  else add(Prim.cyl(7, true), M(-0.004, 0.03, 0, 0, 0, 0, [0.055 * d.Bk, 0.12, 0.055 * d.Bk]), col, Ft, part);
}

/** A coat worn over the shoulders: open at the front, a stand-up collar, the long tail on its own bone. */
function coat(add, sh, c, TR, U, cloth, d, q) {
  const lining = shade(c, -0.3);
  const off = (s) => 0.024 + sstep(0.55, 0.85, s) * 0.03 - sstep(0.9, 1, s) * 0.02;
  const rows = cut(TR, -0.1, 0.99);
  const open = (s) => 0.5 + sstep(0.75, 1, s) * 0.3;
  const pt = (k) => (s, a) => torsoPt(sh, s, a, off(s) - k, 0);
  add(band(pt(0), rows, open, (s) => TAU - open(s), U), M(), c, B.chest);
  if (cloth) add(band(pt(0.006), rows, open, (s) => TAU - open(s), U, true), M(), lining, B.chest);
  // stand-up collar behind the neck
  const cr = cloth ? [1.1, 1.04, 0.98] : [1.1, 0.98];
  const col = (s, a) => {
    const p = torsoPt(sh, 0.97, a, 0.03, 0);
    const k = 1 + (s - 0.97) * 1.6;
    return [p[0] * k, s * sh.cl, p[2] * k];
  };
  add(band(col, cr, 1.25, TAU - 1.25, Math.max(4, U / 2)), M(), c, B.chest);
  if (cloth) add(band((s, a) => { const p = col(s, a); return [p[0] * 0.95, p[1], p[2] * 0.95]; }, cr, 1.25, TAU - 1.25, Math.max(4, U / 2), true), M(), lining, B.chest);
  coatTail(add, sh, c, U, cloth, d, off(-0.1));
}

/** A coat's tail from the waist down past the knees (coatTail bone, origin at the hip pivot). */
function coatTail(add, sh, c, U, cloth, d, off0) {
  const lining = shade(c, -0.3);
  const L = 0.62 * d.Lg;
  const tr = cloth ? [0.02, -0.12, -0.28, -0.45, -L] : [0.02, -0.3, -L];
  const tp = (inset) => (y, a) => {
    const p = torsoPt(sh, -0.1, a, off0 - inset, 0);
    const k = 1 + clamp(-y / L, 0, 1) * 0.42;
    return [p[0] * k - 0.008, y, p[2] * k];
  };
  const openT = 0.62;
  add(band(tp(0), tr, openT, TAU - openT, U), M(), c, B.coatTail);
  if (cloth) add(band(tp(0.006), half(tr), openT, TAU - openT, U / 2, true), M(), lining, B.coatTail);
}
