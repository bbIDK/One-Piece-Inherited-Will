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
import { Prim, M, mul, grid, lathe, between, lin } from './geom.js';
import { B } from './bones.js';
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
  return { fem, top, sleeves, bottom, waist, shoes, muscle: clamp(muscle, 0, 1.2), bust: look.bust ?? 1, tucked, skirt };
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
  m: [[-0.1, 0.13, 0.088, 0.092], [0.12, 0.126, 0.085, 0.085], [0.32, 0.142, 0.09, 0.09], [0.52, 0.17, 0.097, 0.099], [0.68, 0.194, 0.103, 0.104],
    [0.8, 0.204, 0.098, 0.1], [0.89, 0.19, 0.086, 0.092], [0.955, 0.128, 0.066, 0.074], [1.0, 0.058, 0.05, 0.054]],
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
// muscle bulges [t, radius per unit of muscle, half width]
const BULGE = { uarm: [[0.1, 0.007, 0.12], [0.48, 0.008, 0.2]], farm: [[0.17, 0.006, 0.2]], thigh: [[0.3, 0.009, 0.26]], shin: [[0.26, 0.008, 0.17]] };

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
  return {
    fem: o.fem, m: o.muscle, bust: o.bust, Bk: d.Bk, BkD: 1 + (d.Bk - 1) * 0.85, cl: d.chestLen,
    T: TORSO[o.fem ? 'f' : 'm'], P: PELVIS[o.fem ? 'f' : 'm'],
  };
}

// chest, abs and shoulder blades (mS scales them down under clothes)
function frontBump(sh, s, z, mS) {
  const Bk = sh.Bk;
  let b = 0;
  if (sh.fem) {
    for (const zc of [-0.06, 0.06]) {
      const dz = (z - zc * Bk) / (0.066 * Bk), ds = (s - 0.665) * sh.cl / 0.068;
      const r2 = dz * dz + ds * ds;
      if (r2 < 1) b = Math.max(b, Math.pow(1 - r2, 0.6) * 0.046 * sh.bust);
    }
    return b;
  }
  const m = sh.m;
  const pz = Math.abs(z) / (0.19 * Bk);
  const lobe = Math.max(0, 1 - ((pz - 0.4) / 0.52) ** 2);
  b = sstep(0.55, 0.62, s) * (1 - sstep(0.8, 0.94, s)) * lobe * (0.012 + 0.024 * m);
  if (s > 0.1 && s < 0.53) {
    const az = Math.abs(z) / 0.075;
    if (az < 1) b += Math.sin(((s - 0.1) / 0.43 * 3 % 1) * Math.PI) * Math.sin(az * Math.PI) * 0.008 * m;
  }
  return b * mS;
}
function backBump(sh, s, z, mS) {
  const bz = Math.abs(z) / (0.19 * sh.Bk);
  return sstep(0.55, 0.66, s) * (1 - sstep(0.82, 0.94, s)) * Math.max(0, 1 - ((bz - 0.42) / 0.42) ** 2) * (0.005 + 0.008 * sh.m) * mS;
}

/** A point on the torso (or a garment `off` metres over it) at height s and angle a (0 = front, +π/2 = right). */
function torsoPt(sh, s, a, off = 0, mS = 1) {
  interpRows(sh.T, s, _r);
  const W = _r[1] * sh.Bk + off, Df = _r[2] * sh.BkD + off, Db = _r[3] * sh.BkD + off;
  const c = Math.cos(a), sn = Math.sin(a);
  const z = supEl(sn, 0.78) * W;
  let x = c >= 0 ? supEl(c, 0.78) * Df : supEl(c, 0.78) * Db;
  if (c > 0) x += Math.pow(c, 0.7) * frontBump(sh, s, z, mS);
  else x -= Math.pow(-c, 0.7) * backBump(sh, s, z, mS);
  return [x, s * sh.cl, z];
}
function pelvisPt(sh, y, a, off = 0) {
  interpRows(sh.P, y, _r);
  const W = _r[1] * sh.Bk + off, Df = _r[2] * sh.BkD + off, Db = _r[3] * sh.BkD + off;
  const c = Math.cos(a), sn = Math.sin(a);
  return [c >= 0 ? supEl(c, 0.8) * Df : supEl(c, 0.8) * Db, y, supEl(sn, 0.8) * W];
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
function band(pt, rows, a0, a1, U, inward = false) {
  const V = rows.length - 1;
  const full = typeof a0 === 'number' && typeof a1 === 'number' && a1 - a0 >= TAU - 1e-6;
  const g = grid((u, v) => {
    const h = rows[Math.round(v * V)];
    const A0 = typeof a0 === 'function' ? a0(h) : a0, A1 = typeof a1 === 'function' ? a1(h) : a1;
    const uu = inward ? 1 - u : u;
    return pt(h, warp(A0 + (A1 - A0) * uu));
  }, U, V);
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
function limbFn(kind, fem, m, k) {
  const tab = LIMB[kind][fem ? 'f' : 'm'];
  const bul = fem ? [] : BULGE[kind];
  return (t) => {
    let r = interp1(tab, t);
    for (const [c, a, w] of bul) { const x = (t - c) / w; if (x > -1 && x < 1) r += a * m * (1 - x * x) ** 2; }
    return r * k;
  };
}
/**
 * One stretch of a limb (skin or a garment tube) from t0 to t1 along -Y:
 * rounded caps close the joints; open garment ends get a flare and a lining
 * lip so you see the cloth's edge rather than a hole.
 */
function limbSeg(rf, L, rs, rows, seg) {
  const { t0 = 0, t1 = 1, off = 0, capTop = false, capBot = false, flare = 0, flareTop = 0, lining = false, bulge = 0 } = seg;
  const R = (t) => rf(t) + off;
  const yb = -t1 * L, yt = -t0 * L;
  const rb = R(t1) + flare, rt = R(t0) + flareTop;
  const prof = [];
  if (capBot) for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k / 3) * (Math.PI / 2); prof.push([Math.cos(a) * rb + 1e-5, yb + Math.sin(a) * rb]); }
  else if (lining) prof.push([Math.max(0.004, rb - 0.013), yb + 0.024]);
  for (let i = rows; i >= 0; i--) {
    const f = i / rows; // 1 at the bottom
    const t = t0 + (t1 - t0) * f;
    const r = R(t) + flare * sstep(0.5, 1, f) + flareTop * sstep(0.5, 1, 1 - f) + bulge * Math.sin(f * Math.PI);
    prof.push([r, -t * L]);
  }
  if (capTop) for (let k = 1; k <= 3; k++) { const a = (k / 3) * (Math.PI / 2); prof.push([Math.cos(a) * rt + 1e-5, yt + Math.sin(a) * rt]); }
  else if (lining) prof.push([Math.max(0.004, rt - 0.013), yt - 0.024]);
  return lathe(prof, rs);
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
export function buildFigure(add, look, d, pal, q) {
  const o = outfitOf(look);
  const cc = clothColours(look, pal, o);
  const sh = shapeOf(d, o);
  const cloth = q.cloth; // linings, cuffs, buttons (near detail only)
  const U = cloth ? 16 : 9;
  const rs = cloth ? 12 : 7;
  const lrows = cloth ? 5 : 2;
  const skin = pal.skin;

  // ---- torso rows (s, top → bottom)
  const TR = cloth
    ? [1.0, 0.955, 0.91, 0.86, 0.81, 0.765, 0.72, 0.68, 0.64, 0.6, 0.565, 0.5, 0.42, 0.33, 0.24, 0.14, 0.03, -0.1]
    : [1.0, 0.93, 0.82, 0.7, 0.58, 0.4, 0.2, -0.1];
  const tpt = (mS, off = 0) => (s, a) => torsoPt(sh, s, a, off, mS);
  const skinTorso = tpt(1);
  const TOP = o.top;
  const shirtM = 0.45; // how much muscle shows through a shirt
  const addT = (rows, pt, col, a0 = -Math.PI, a1 = Math.PI, inward = false) => add(band(pt, rows, a0, a1, U, inward), M(), col, B.chest);
  const neckS = TOP === 'shirt' || TOP === 'jacket' ? 0.955 : TOP === 'tank' || TOP === 'dress' ? 0.84 : 0.93;

  // body torso, split into what the top covers and what shows
  if (TOP === 'bare' || TOP === 'vest' || TOP === 'open' || TOP === 'coat' && !look.top2) {
    addT(TR, skinTorso, skin);
  } else if (TOP === 'crop' || TOP === 'bikini') {
    const lo = TOP === 'crop' ? 0.5 : 0.58, hi = TOP === 'crop' ? 0.86 : 0.78;
    addT(cut(TR, hi, 1), skinTorso, skin);
    addT(cut(TR, lo, hi), tpt(1, 0.002), pal.top);
    addT(cut(TR, -0.1, lo), skinTorso, skin);
    straps(add, sh, hi, pal.top, q);
  } else if (TOP === 'striped') {
    addT(cut(TR, neckS, 1), skinTorso, skin);
    const n = cloth ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const hi = neckS - (neckS + 0.1) * (k / n), lo = neckS - (neckS + 0.1) * ((k + 1) / n);
      addT(cut(TR, lo, hi), tpt(shirtM), k % 2 ? cc.top2 : pal.top);
    }
  } else {
    // one covering garment colour (the inner shirt under a jacket or coat)
    const col = TOP === 'jacket' || TOP === 'coat' ? cc.top2 : pal.top;
    addT(cut(TR, neckS, 1), skinTorso, skin);
    addT(cut(TR, -0.1, neckS), tpt(shirtM), col);
    if (TOP === 'tank' || TOP === 'dress') straps(add, sh, neckS, col, q);
    if (cloth && TOP !== 'tank' && TOP !== 'dress') {
      // a ribbed collar at the neckline
      const f = torsoPt(sh, neckS, 0, 0, shirtM)[0], bk = -torsoPt(sh, neckS, Math.PI, 0, shirtM)[0], W = torsoPt(sh, neckS, Math.PI / 2, 0, shirtM)[2];
      add(torus(q), mul(M((f - bk) / 2, 0, 0), ringAt(neckS * sh.cl, (f + bk) / 2 + 0.002, W + 0.002, 0.012)), shade(col, -0.18), B.chest);
    }
  }
  // the neck
  const nk = o.fem ? 0.04 : 0.05 * (1 + (d.Bk - 1) * 0.5);
  add(Prim.cyl(Math.max(6, rs - 2), true), M(0, d.chestLen + d.neck * 0.5 - 0.01, 0, 0, 0, 0, [nk * 0.96, d.neck + 0.08, nk]), skin, B.chest);

  // ---- tops worn over the body
  const edge = (a) => (s) => a(s), rest = (a) => (s) => TAU - a(s);
  const shell = (rows, aFn, off, mS, col, lin2) => {
    add(band(tpt(mS, off), rows, edge(aFn), rest(aFn), U), M(), col, B.chest);
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
    const open = kim ? (s) => 0.02 + sstep(0.28, 0.98, s) * 0.46 : (s) => 0.015 + sstep(0.46, 0.96, s) * 0.62;
    shell(rows, open, kim ? 0.014 : 0.012, 0.2, col, shade(col, -0.3));
    if (cloth) {
      // lapels / the kimono's collar trim along the opening
      const trim = kim ? cc.top2 : shade(col, -0.12);
      const up = cut(TR, kim ? 0.28 : 0.46, 0.985);
      const tw = kim ? 0.3 : 0.24;
      add(band(tpt(0.2, 0.017), up, (s) => open(s), (s) => open(s) + tw, Math.max(3, U / 6)), M(), trim, B.chest);
      add(band(tpt(0.2, 0.017), up, (s) => TAU - open(s) - tw, (s) => TAU - open(s), Math.max(3, U / 6)), M(), trim, B.chest);
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
    const rows = cloth ? [0.08, 0.0, -0.1, (0.0 + yb) * 0.55, yb] : [0.08, -0.1, yb];
    const Wh = (long ? 0.3 : 0.225) * sh.Bk, Dh = (long ? 0.3 : 0.2) * sh.Bk;
    const sp = (y, a, inset = 0) => {
      const k = clamp((0.08 - y) / (0.08 - yb), 0, 1);
      const p = pelvisPt(sh, Math.max(y, -0.06), a, 0.012 - inset);
      const f = Math.pow(k, 0.7);
      const hx = Math.cos(a) * (Dh - inset), hz = Math.sin(a) * (Wh - inset);
      return [p[0] + (hx - p[0]) * f, y, p[2] + (hz - p[2]) * f];
    };
    add(band((y, a) => sp(y, a), rows, -Math.PI, Math.PI, U), M(), col, B.hips);
    if (cloth) add(band((y, a) => sp(y, a, 0.008), rows.slice(-2), -Math.PI, Math.PI, U, true), M(), shade(col, -0.35), B.hips);
  }

  // ---- arms
  const armCol = pal.sleeve || (TOP === 'coat' ? look.coat || pal.top : TOP === 'jacket' ? pal.top : TOP === 'striped' ? pal.top : pal.top);
  for (const [s, Ub, Fb, part] of [[1, B.uarmR, B.farmR, 1], [-1, B.uarmL, B.farmL, 2]]) {
    const ua = limbFn('uarm', o.fem, o.muscle, d.Bk), fa = limbFn('farm', o.fem, o.muscle, d.Bk);
    const sl = o.sleeves;
    if (sl === 'none') {
      add(limbSeg(ua, d.A1, rs, lrows, { capTop: true, capBot: true }), M(), skin, Ub);
      add(limbSeg(fa, d.A2, rs, lrows, { capTop: true, capBot: true }), M(), skin, Fb, part);
    } else if (sl === 'short') {
      add(limbSeg(ua, d.A1, rs, lrows, { t1: 0.5, off: 0.012, capTop: true, flare: 0.012, lining: cloth }), M(), armCol, Ub);
      add(limbSeg(ua, d.A1, rs, lrows, { t0: 0.42, capBot: true }), M(), skin, Ub);
      add(limbSeg(fa, d.A2, rs, lrows, { capTop: true, capBot: true }), M(), skin, Fb, part);
    } else if (sl === 'rolled') {
      add(limbSeg(ua, d.A1, rs, lrows, { off: 0.012, capTop: true, capBot: true }), M(), armCol, Ub);
      if (cloth) add(torus(q), ringAt(-d.A1 * 0.96, ua(0.96) + 0.02, ua(0.96) + 0.02, 0.03), shade(armCol, -0.12), Ub);
      add(limbSeg(fa, d.A2, rs, lrows, { capTop: true, capBot: true }), M(), skin, Fb, part);
    } else {
      // long and wide sleeves down to the wrist
      const wide = sl === 'wide';
      add(limbSeg(ua, d.A1, rs, lrows, { off: wide ? 0.02 : 0.012, capTop: true, capBot: true }), M(), armCol, Ub);
      add(limbSeg(fa, d.A2, rs, lrows, { off: wide ? 0.022 : 0.011, capTop: true, flare: wide ? 0.075 : 0.008, lining: cloth, t1: wide ? 1.02 : 0.98 }), M(), armCol, Fb, part);
      if (cloth && !wide) add(torus(q), ringAt(-d.A2 * 0.95, fa(0.95) + 0.018, fa(0.95) + 0.018, 0.022), shade(armCol, -0.15), Fb, part);
      add(limbSeg(fa, d.A2, rs, 2, { t0: 0.8, capBot: true }), M(), skin, Fb, part);
    }
    if (d.Am > 1.2) add(Prim.sphere(q.sph[0], q.sph[1]), M(0, -d.A2 * 0.5, 0, 0, 0, 0, fa(0.5) * 1.1), sl === 'long' || sl === 'wide' ? armCol : skin, Fb, part);
  }

  // ---- legs
  const bot = o.bottom;
  const bcol = pal.bottom, cuffCol = shade(pal.bottom, -0.22);
  for (const [T, S, Ft, part] of [[B.thighR, B.shinR, B.footR, 3], [B.thighL, B.shinL, B.footL, 4]]) {
    const th = limbFn('thigh', o.fem, o.muscle, d.Bk), sn = limbFn('shin', o.fem, o.muscle, d.Bk);
    const boots = o.shoes === 'boots';
    if (skirtPelvis) {
      add(limbSeg(th, d.T1, rs, lrows, { capTop: true, capBot: true }), M(), skin, T);
      if (!boots) add(limbSeg(sn, d.T2, rs, lrows, { capTop: true, capBot: true }), M(), skin, S, part);
    } else if (bot === 'shorts') {
      add(limbSeg(th, d.T1, rs, lrows, { t1: 0.86, off: 0.014, capTop: true, flare: 0.024, lining: cloth }), M(), bcol, T);
      if (cloth) add(torus(q), ringAt(-d.T1 * 0.85, th(0.86) + 0.036, th(0.86) + 0.036, 0.03), cuffCol, T);
      add(limbSeg(th, d.T1, rs, lrows, { t0: 0.78, capBot: true }), M(), skin, T);
      if (!boots) add(limbSeg(sn, d.T2, rs, lrows, { capTop: true, capBot: true }), M(), skin, S, part);
    } else {
      const baggy = bot === 'baggy' || bot === 'hakama';
      const offT = bot === 'slim' ? 0.008 : bot === 'hakama' ? 0.04 : baggy ? 0.03 : 0.014;
      add(limbSeg(th, d.T1, rs, lrows, { off: offT, capTop: true, capBot: true }), M(), bcol, T);
      if (bot === 'capri') {
        add(limbSeg(sn, d.T2, rs, lrows, { t1: 0.55, off: 0.013, capTop: true, flare: 0.02, lining: cloth }), M(), bcol, S, part);
        if (cloth) add(torus(q), ringAt(-d.T2 * 0.54, sn(0.55) + 0.032, sn(0.55) + 0.032, 0.03), cuffCol, S, part);
        if (!boots) add(limbSeg(sn, d.T2, rs, lrows, { t0: 0.48, capBot: true }), M(), skin, S, part);
      } else if (boots && (baggy || bot === 'slim')) {
        // tucked into the boots
        add(limbSeg(sn, d.T2, rs, lrows, { t1: 0.6, off: bot === 'slim' ? 0.008 : 0.028, capTop: true, bulge: baggy ? 0.012 : 0 }), M(), bcol, S, part);
      } else {
        const hem = bot === 'hakama' ? 0.075 : baggy ? 0.004 : bot === 'slim' ? 0.004 : 0.026;
        const offS = bot === 'hakama' ? 0.04 : baggy ? 0.03 : bot === 'slim' ? 0.008 : 0.014;
        add(limbSeg(sn, d.T2, rs, lrows, { off: offS, capTop: true, flare: hem, lining: cloth, t1: bot === 'slim' ? 0.97 : 0.99, bulge: baggy ? 0.014 : 0 }), M(), bcol, S, part);
        if (baggy && bot !== 'hakama' && cloth) add(torus(q), ringAt(-d.T2 * 0.96, sn(0.96) + 0.034, sn(0.96) + 0.034, 0.024), cuffCol, S, part);
      }
    }
    // boots: a shaft up the shin with a folded top (under long trousers only the foot shows)
    if (boots) {
      const bc = pal.shoes;
      const tuck = bot === 'baggy' || bot === 'slim' || bot === 'hakama';
      if (skirtPelvis || bot === 'shorts' || bot === 'capri' || tuck) {
        const t0 = 0.42;
        if (!tuck) add(limbSeg(sn, d.T2, rs, lrows, { capTop: true, t1: t0 + 0.06 }), M(), skin, S, part);
        add(limbSeg(sn, d.T2, rs, lrows, { t0, off: tuck ? 0.034 : 0.016, flareTop: 0.01, capBot: true }), M(), bc, S, part);
        if (cloth) add(torus(q), ringAt(-d.T2 * (t0 + 0.02), sn(t0) + (tuck ? 0.044 : 0.027), sn(t0) + (tuck ? 0.044 : 0.027), 0.03), shade(bc, -0.2), S, part);
      }
    }
    feet(add, o, pal, d, q, Ft, part);
  }

  // ---- a coat over the shoulders (coat colour), the tail swings from the waist
  if (look.coat && TOP !== 'coat' || TOP === 'coat' && !look.top2 && look.coat) coat(add, sh, look.coat, TR, U, cloth, d, q);
  else if (TOP === 'coat') coatTail(add, sh, look.coat || pal.top, U, cloth, d, 0.03);
  return o;
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
