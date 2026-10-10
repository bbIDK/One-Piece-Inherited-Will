// The big ships in 3D (see world/hull.js for their deck plan): One
// Piece-scale carracks, galleons, men-o'-war and battleships, built like the
// real thing. A tumblehome hull painted in strakes, with two tiers of gunports
// (red lids hinged open, muzzles run out), a stern castle with gallery windows
// and lanterns, and inside the bulwarks a planked main deck, a quarterdeck over
// the great cabin (and a poop deck above that on the largest), a forecastle,
// stairs up to each, carved cabin fronts with doorways and lit windows, the
// wheel and binnacle, the capstan, the companionway down to the hold, the
// ship's boat on its chocks, a belfry and catted anchors. Below (bigInterior):
// the furnished great cabin (and the captain's), the crew's forecastle, and
// the hold with its cargo and lanterns — and on the bigger hulls the gun
// deck's guns behind their ports. Aloft: three-part masts with tops,
// crosstrees and a crow's nest, three square sails a mast, a spanker, a big
// jib to a steeved-up bowsprit, and shrouds with ratlines.
//
// Local frame (as ships3d.js): bow along +x, beam along z (= v), y up; the
// waterline is y = 0.
import * as THREE from 'three';
import { Mesher, box, cyl, cone, torus, tube, lathe, C, shade } from './props/kit.js';
import { hbAt, topAt, xAt, floorAt, skinAt, innerAt, hullProfile, liningAt, liningYs, FURNITURE, rakeDx } from '../world/hull.js';

/** Bend everything built so far to her rake (hull.js rakeDx): the shell and all that's fixed to it, together. */
function rake(k, d) {
  const p = k.pos;
  for (let i = 0; i < p.length; i += 3) p[i] += rakeDx(d, p[i], p[i + 1]);
}

/** Figureheads that ARE the bow (the Going Merry's ram, the Sunny's lion): no bowsprit through them, no rigging to them. */
// (a ship with a figurehead carries no bowsprit: the head is the bow, and a
// spar run out over it only spears it; no jib or bobstay with it either)
export const noSprit = (fh) => !!fh && fh !== 'none';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- palette
export function bigPalette(def) {
  const H = C(def.color || '#6b4526');
  const marine = def.sail === 'marine';
  const white = H.getHSL({}).l > 0.8;
  return {
    hull: H,
    upper: marine ? C('#f5f6fa') : white ? C('#f7f3ea') : shade(H, 0.06),
    cap: marine ? C('#1b4f72') : white ? C('#7a5a3c') : shade(H, -0.5),
    stripe: C(def.stripe || (marine ? '#1b4f72' : '#c8962e')),
    plank: marine ? C('#e9edf1') : H,
    plank2: marine ? C('#dfe4ea') : shade(H, -0.1),
    bottom: C(def.bottom || (marine ? '#5b6770' : '#3a2c22')),
    deck: marine ? C('#c9b28f') : C('#b88c5c'),
    front: marine ? C('#eef1f4') : white ? C('#efe6d4') : C(def.front || '#8e3b2a'),
    trim: C('#d4ac0d'),
    wood: C('#6d4c33'),
    dark: C('#2b1d14'),
    iron: C('#2d3436'),
    port: C('#141414'),
    lid: marine ? C('#1b4f72') : C('#9c2b20'),
    glass: C('#2d4150'),
  };
}

// ---------------------------------------------------------------- the hull's skin
// (its shape is shared with the game: see world/hull.js hullProfile, skinAt, innerAt)
const profile = hullProfile;
export { skinAt };

/** The skin's slope along the length at (t, y): the angle to turn something to lie flat on it. */
function skinYaw(d, t, y, s) {
  const e = 0.004, w1 = skinAt(d, Math.min(1, t + e), y), w0 = skinAt(d, Math.max(0, t - e), y);
  return -Math.atan(s * (w1 - w0) / (2 * e * d.L));
}

// ---------------------------------------------------------------- hull, decks and fittings
export function bigHull(def, d) {
  const P = bigPalette(def);
  const k = new Mesher();
  shell(k, d, P);
  bulwarks(k, d, P);
  decks(k, d, P);
  gunports(k, d, P);
  stern(k, d, P);
  cabinFronts(k, d, P);
  stairs(k, d, P);
  fittings(k, d, P);
  sideLadders(k, d, P);
  stemHead(k, d, P);
  bigFigurehead(k, def, d, P);
  rake(k, d);
  return k;
}

/**
 * The stem head: where her two bulwarks meet at the bow, a solid block of
 * timber from the deck to over the rail (the knightheads the bowsprit is
 * stepped between) — no notch, no gap at the point.
 */
function stemHead(k, d, P) {
  const t0 = 0.968, x0 = xAt(d, t0), x1 = d.L / 2 + 0.04;
  const top = topAt(d, 0.99) + 0.06, fl = floorAt(d, t0) - 0.05;
  const w = skinAt(d, t0, top - 0.05) + 0.02;
  const g = new THREE.Shape();
  g.moveTo(x0, -w); g.lineTo(x1, -0.12); g.lineTo(x1, 0.12); g.lineTo(x0, w); g.closePath();
  const geo = new THREE.ExtrudeGeometry(g, { depth: top - fl, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); geo.translate(0, top, 0);
  k.add(geo, { color: P.cap, outline: 0.015, flat: true });
}

/**
 * The ladders down her sides amidships (hull.js ladders): two stiles that
 * follow her side from the water up past her rail, rounded over it into
 * iron grab-rails to haul yourself aboard by, with a step every 30 cm.
 */
function sideLadders(k, d, P) {
  for (const l of d.ladders || []) {
    const s = l.s, t = l.t, top = topAt(d, t), half = l.w / 2 - 0.035;
    const z0 = skinAt(d, t, 1);
    // (out from her side by a hand's breadth, in her own frame there: she narrows toward the bow)
    const zAt = (y) => s * (skinAt(d, t, Math.min(y, top)) + 0.1) - s * z0;
    k.save(); k.translate(l.u, 0, s * z0); k.rotateY(skinYaw(d, t, 1, s));
    for (const x of [-half, half]) {
      const pts = [];
      for (let y = -0.4; y < top - 0.1; y += 0.35) pts.push(new THREE.Vector3(x, y, zAt(y)));
      pts.push(new THREE.Vector3(x, top, zAt(top)));
      k.add(tube(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), pts.length * 3, 0.035, 5), { color: P.wood, outline: 0.008 });
      // (the grab-rail: up from the stile's head and over the rail cap, inboard)
      const g = [[x, top - 0.15, zAt(top)], [x, top + 0.45, zAt(top)], [x, top + 0.6, zAt(top) - s * 0.15], [x, top + 0.45, zAt(top) - s * 0.36]].map((q) => new THREE.Vector3(...q));
      k.add(tube(new THREE.CatmullRomCurve3(g, false, 'centripetal'), 12, 0.022, 5), { color: P.iron });
    }
    for (let y = -0.25; y < top - 0.25; y += 0.3) k.add(cyl(0.028, 0.028, half * 2 + 0.02, 5), { at: [half + 0.01, y, zAt(y)], rot: [0, 0, Math.PI / 2], color: shade(P.wood, 0.15) });
    k.restore();
  }
}

function shell(k, d, P) {
  const N = 48, NP = 10;
  const band = [P.cap, P.upper, P.stripe, P.plank, P.plank2, P.bottom, P.bottom, shade(P.bottom, -0.12), P.bottom];
  const pos = [], idx = [], triCol = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = xAt(d, t), hb = hbAt(t, d.B);
    for (const s of [1, -1]) for (const [w, y] of profile(d, t)) pos.push(x, y, s * w * hb);
  }
  const vid = (i, s, j) => (i * 2 + s) * NP + j;
  for (let i = 0; i < N; i++) {
    for (let s = 0; s < 2; s++) {
      for (let j = 0; j < NP - 1; j++) {
        const a = vid(i, s, j), b = vid(i + 1, s, j), c = vid(i, s, j + 1), e = vid(i + 1, s, j + 1);
        if (s === 0) idx.push(a, c, b, b, c, e); else idx.push(a, b, c, b, e, c);
        triCol.push(band[j], band[j]);
      }
    }
  }
  // the transom across the stern
  for (let j = 0; j < NP - 1; j++) {
    const A = vid(0, 1, j), B = vid(0, 0, j), Cc = vid(0, 1, j + 1), D = vid(0, 0, j + 1);
    idx.push(A, Cc, B, B, Cc, D);
    const col = j < 1 ? P.cap : j < 4 ? P.upper : P.bottom;
    triCol.push(col, col);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  k.add(g, { split: true, color: (p, n, i) => triCol[Math.floor(i / 3)], outline: 0.06 });
  // wales: heavy mouldings along the sides, in the trim colour
  for (const y of [d.deckY - 0.25, d.deckY + 0.95]) hullBand(k, d, y, 0.14, 0.05, y > d.deckY ? P.cap : P.dark, 0.04, 0.985);
  hullBand(k, d, 0.02, 0.1, 0.03, shade(P.bottom, 0.2), 0.02, 0.99);
}

/** A band round the outside of the hull at height y (h tall, standing `out` proud of the skin). */
function hullBand(k, d, y, h, out, col, t0 = 0.02, t1 = 0.98) {
  for (const s of [1, -1]) {
    const pts = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n;
      const w = skinAt(d, t, y + h / 2);
      if (w < 0.05) continue;
      pts.push([xAt(d, t), s * (w + out)]);
    }
    const pos = [], idx = [];
    pts.forEach(([x, z]) => pos.push(x, y, z, x, y + h, z));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      if (s > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    k.add(g, { color: col });
  }
}

/** A strip between two polylines (quads), coloured `col`. */
function strip(k, pairs, col, flip = false) {
  const sp = [], si = [];
  pairs.forEach(([a, b]) => sp.push(...a, ...b));
  for (let i = 0; i < pairs.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, e = a + 3;
    if (flip) si.push(a, c, b, b, c, e); else si.push(a, b, c, b, e, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  g.setIndex(si);
  g.computeVertexNormals();
  k.add(g, { color: col });
}

function bulwarks(k, d, P) {
  const N = 64;
  for (const s of [1, -1]) {
    const inner = [], cap = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = xAt(d, t);
      const top = topAt(d, t), fl = floorAt(d, t);
      const wt = skinAt(d, t, top), wi = innerAt(d, t, top - 0.12);
      inner.push([[x, top - 0.1, s * wi], [x, fl - 0.02, s * innerAt(d, t, fl)]]);
      cap.push([[x, top, s * wt], [x, top - 0.1, s * wi]]);
    }
    strip(k, inner, shade(P.upper, -0.12), s > 0);
    strip(k, cap, P.cap, s > 0);
  }
  // the inside of the stern, across the transom: 2 cm in from its outer face
  // (flush with it, the two flickered against each other across the whole
  // stern) and no wider than the planking there (measured further forward,
  // where she's broader, its ends stood out of her quarters)
  const ys = floorAt(d, 0.01), ts = topAt(d, 0) - 0.1;
  const wi = Math.min(innerAt(d, 0, ys), innerAt(d, 0, ts)) + 0.04;
  k.add(box(0.2, ts - ys + 0.04, wi * 2), { at: [xAt(d, 0) + 0.12, ys - 0.02, 0], color: shade(P.upper, -0.12) });
}

/**
 * Planking between t0 and t1 at height y, from rail to rail — or, with
 * `vIn`, only outboard of |v| = vIn (the strips alongside an opening).
 * `down`: the underside (a ceiling seen from below).
 */
export function deckGrid(k, d, P, t0, t1, y, vIn = null, down = false, col0 = null) {
  if (t1 <= t0) return;
  const R = Math.max(3, Math.round((t1 - t0) * 48));
  const base = col0 || P.deck;
  const spans = vIn === null ? [[-1, 1, 0]] : [[-1, -vIn, 1], [vIn, 1, 1]];
  for (const [a0, a1, strip] of spans) {
    const M = strip ? Math.max(2, Math.round((d.B / 2 - vIn) / 0.3)) : Math.max(6, Math.round(d.B / 0.3));
    const dp = [], di = [], dc = [];
    for (let i = 0; i <= R; i++) {
      const t = t0 + (t1 - t0) * i / R, x = xAt(d, t);
      const w = innerAt(d, t, y) + 0.04;
      // (z from port to starboard: the strip's ends are its opening edge and the rail)
      const z0 = strip ? (a0 < 0 ? -w : vIn) : -w, z1 = strip ? (a0 < 0 ? -vIn : w) : w;
      for (let m = 0; m <= M; m++) dp.push(x, y, z0 + (z1 - z0) * m / M);
    }
    for (let i = 0; i < R; i++) {
      for (let m = 0; m < M; m++) {
        const a = i * (M + 1) + m, b = a + 1, c = a + M + 1, e = c + 1;
        if (down) di.push(a, c, b, b, c, e); else di.push(a, b, c, b, e, c);
        const col = (m + (i >> 2)) % 2 ? shade(base, -0.07) : base;
        dc.push(col, col);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    g.setIndex(di);
    g.computeVertexNormals();
    k.add(g, { split: true, color: (p, n, i) => dc[Math.floor(i / 3)] });
  }
}

function decks(k, d, P) {
  // the main deck, open where the companionway (or the hatch) goes down
  const cp = d.comp;
  deckGrid(k, d, P, d.tq, cp.t0, d.deckY);
  deckGrid(k, d, P, cp.t0, cp.t1, d.deckY, cp.w / 2);
  deckGrid(k, d, P, cp.t1, d.tf, d.deckY);
  // (aft, the planks run right in under the stern wall's inner face)
  const ta = 0.18 / d.L;
  deckGrid(k, d, P, d.poop ? d.tp - 0.004 : ta, d.tq + 0.006, d.yq);
  if (d.poop) deckGrid(k, d, P, ta, d.tp + 0.006, d.yp);
  if (d.fore) deckGrid(k, d, P, d.tf - 0.006, 0.975, d.yf);
}

// ---------------------------------------------------------------- guns
/**
 * A naval gun on its truck carriage, standing on the floor at the origin,
 * its muzzle out along +z (s = 1) or -z (s = -1): a cast barrel with its
 * reinforcing rings, the muzzle swell and the dark bore, the cascabel knob at
 * the breech, trunnions on the cheeks, and four little wooden wheels. `gs`
 * scales it (a sloop's gun is smaller than a man-o'-war's).
 */
export function cannon(k, P, s, gs = 1, opts = {}) {
  const Lb = 1.8 * gs, r = 0.1 * gs + 0.025;
  const ay = 0.42 * Math.max(0.85, gs);                  // (the bore's height over the floor)
  const cl = 0.95 * gs, cw = 0.5 * gs + 0.06;           // the carriage's length (in and out) and width
  const zc = -s * 0.1 * gs;                             // (the carriage sits a little inboard of the trunnions)
  const wood = opts.wood || P.wood;
  // cheeks: stepped planks either side, the bed between them, the transoms
  for (const a of [-1, 1]) {
    k.add(box(0.09, ay * 0.62, cl), { at: [a * cw / 2, 0.1, zc], color: wood, outline: 0.01 });
    k.add(box(0.09, ay * 0.3, cl * 0.45), { at: [a * cw / 2, 0.1 + ay * 0.62, zc + s * cl * 0.2], color: wood, outline: 0.01 });
  }
  k.add(box(cw, 0.07, cl * 0.92), { at: [0, 0.1, zc], color: shade(wood, -0.18) });
  // axles and the four trucks (wheels)
  for (const zf of [0.34, -0.36]) {
    const z = zc + s * zf * cl;
    k.add(cyl(0.035, 0.035, cw + 0.2, 6), { at: [-(cw + 0.2) / 2, 0.1, z], rot: [0, 0, -Math.PI / 2], color: P.dark });
    for (const a of [-1, 1]) k.add(cyl(0.1 * gs + 0.02, 0.1 * gs + 0.02, 0.07, 10), { at: [a * (cw / 2 + 0.05) - 0.035, 0.1 * gs + 0.02, z], rot: [0, 0, -Math.PI / 2], color: shade(wood, -0.3), outline: 0.008 });
  }
  // the barrel, breech to muzzle, along +y before it's laid down along ±z
  const R = (f) => r * f;
  const prof = [
    [0.001, -0.02], [R(0.9), -0.015], [R(1.45), 0.02], [R(1.6), 0.09], [R(1.6), 0.2], [R(1.72), 0.22], [R(1.72), 0.27], [R(1.55), 0.29],
    [R(1.5), Lb * 0.42], [R(1.62), Lb * 0.43], [R(1.62), Lb * 0.46], [R(1.38), Lb * 0.47],
    [R(1.22), Lb * 0.86], [R(1.42), Lb * 0.91], [R(1.52), Lb * 0.97], [R(1.45), Lb], [R(0.72), Lb], [R(0.72), Lb * 0.9], [0.001, Lb * 0.9],
  ];
  const zb = -s * (Lb * 0.36);   // (the breech sits this far inboard of the trunnions)
  const iron = opts.iron || P.iron;
  // (the last points of the profile line the bore: dark inside the muzzle)
  k.add(lathe(prof, 12), { at: [0, ay, zc + zb], rot: [s * Math.PI / 2, 0, 0], color: (p, n, i) => (i % prof.length >= prof.length - 3 ? '#0b0b0b' : iron), outline: 0.012 });
  // the cascabel: a knob behind the breech
  k.add(new THREE.SphereGeometry(r * 0.75, 8, 6), { at: [0, ay, zc + zb - s * (r * 0.9)], color: iron });
  // trunnions resting on the cheeks
  k.add(cyl(r * 0.55, r * 0.55, cw + 0.08, 8), { at: [-(cw + 0.08) / 2, ay, zc], rot: [0, 0, -Math.PI / 2], color: iron });
  return { muzzle: zc + zb + s * Lb, ay };
}

/** A pyramid of cannonballs in a wooden rack (a shot garland). `seg`: the balls' roundness. */
export function shotPile(k, P, r = 0.075, seg = 8) {
  k.add(box(r * 7.4, 0.08, r * 5.4), { color: P.wood, outline: 0.008 });
  const ball = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2));
  let y = 0.08 + r;
  for (let layer = 0, n = 3; n > 0; layer++, n--) {
    for (let i = 0; i < n + 1; i++) for (let j = 0; j < n; j++) {
      k.add(ball, { at: [(i - n / 2) * r * 2, y, (j - (n - 1) / 2) * r * 2], color: P.iron });
    }
    y += r * 1.62;
  }
}

function gunports(k, d, P) {
  const gs = d.gunScale || 1;
  // the guns on deck: iron barrels on truck carriages, run out through the upper ports
  for (const g of d.guns) {
    const x = xAt(d, g.t), y = d.deckY, s = g.s;
    k.save(); k.translate(x, y, g.v); k.rotateY(skinYaw(d, g.t, y + 0.4, s));
    cannon(k, P, s, gs);
    k.restore();
  }
  const port = (t, y, lid, open, s) => {
    const w = skinAt(d, t, y);
    if (w < 0.3) return;
    const yaw = skinYaw(d, t, y, s);
    k.save(); k.translate(xAt(d, t), y, s * (w + 0.012)); k.rotateY(yaw);
    k.add(box(0.62, 0.58, 0.05), { at: [0, -0.29, 0], color: P.port });
    // the lid, hinged open above the port
    k.add(box(0.66, lid, 0.05), { at: [0, 0.3, 0], rot: [s * open, 0, 0], color: P.lid, outline: 0.012 });
    k.restore();
  };
  const top = d.gunRows[0];
  for (const t of top.ts || []) for (const s of [-1, 1]) port(t, top.y, top.lid, top.open, s);
  const low = d.gunRows.find((r) => !r.deck);
  if (low) {
    const ts = [...new Set(d.lowGuns.map((g) => g.t))];
    for (const t of ts) for (const s of [-1, 1]) port(t, low.y, low.lid, low.open, s);
  }
}

// ---------------------------------------------------------------- the stern
function stern(k, d, P) {
  const x0 = -d.L / 2 - 0.03;
  const half = (y) => skinAt(d, 0.004, y) * 0.9;
  const rowAt = (y0, y1) => {
    const w = half((y0 + y1) / 2);
    const n = Math.max(2, Math.floor((w * 2) / 1.15));
    const ww = Math.min(0.8, (w * 2) / n - 0.3);
    for (let i = 0; i < n; i++) {
      const z = -w + (i + 0.5) * (w * 2) / n;
      k.add(box(0.06, y1 - y0, ww), { at: [x0, y0, z], color: P.glass, glow: '#ffc766', pane: true });
      k.add(box(0.08, 0.08, ww + 0.14), { at: [x0 - 0.01, y1, z], color: P.trim });
      k.add(box(0.08, 0.08, ww + 0.14), { at: [x0 - 0.01, y0 - 0.08, z], color: P.trim });
    }
    // a gilded moulding under each row of windows
    k.add(box(0.1, 0.12, w * 2 + 0.2), { at: [x0 - 0.02, y0 - 0.34, 0], color: P.trim });
  };
  rowAt(d.deckY + 0.75, d.deckY + 1.65);
  if (d.poop) rowAt(d.yq + 0.6, d.yq + 1.45);
  // the taffrail and its lanterns
  const ty = topAt(d, 0.01);
  k.add(box(0.14, 0.18, half(ty) * 2 + 0.1), { at: [x0 - 0.02, ty - 0.2, 0], color: P.trim, outline: 0.015 });
  // two stern lanterns, one at each corner of the taffrail: sat on the rail
  // itself on an iron foot (never on a pole in the air), inboard of her side
  for (const sz of [-1, 1]) {
    const lx = -d.L / 2 + 0.32, w = Math.min(half(ty), skinAt(d, (lx + d.L / 2) / d.L, ty)) - 0.22, lz = sz * w;
    const y0 = ty - 0.02;
    k.add(cyl(0.11, 0.14, 0.08, 8), { at: [lx, y0, lz], color: P.dark, outline: 0.008 }); // the foot, on the rail
    k.add(cyl(0.05, 0.07, 0.12, 6), { at: [lx, y0 + 0.08, lz], color: P.trim });
    k.add(cyl(0.15, 0.13, 0.4, 8), { at: [lx, y0 + 0.2, lz], color: '#fff3c4', glow: '#ffcf70', flicker: 0.2, outline: 0.012 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; k.add(box(0.025, 0.42, 0.025), { at: [lx + Math.cos(a) * 0.145, y0 + 0.19, lz + Math.sin(a) * 0.145], color: P.trim }); }
    k.add(cyl(0.17, 0.17, 0.04, 8), { at: [lx, y0 + 0.19, lz], color: P.trim });
    k.add(cone(0.2, 0.2, 8), { at: [lx, y0 + 0.6, lz], color: P.trim, outline: 0.01 });
    k.add(new THREE.SphereGeometry(0.04, 6, 4), { at: [lx, y0 + 0.82, lz], color: P.trim });
  }
  // quarter galleries: glazed bays bulging from the stern corners — laid
  // along her side as it curves in there, and no deeper into it than her
  // planking (none of it through the lining into the cabin)
  for (const s of [-1, 1]) {
    const t = 0.055, y0 = d.deckY + 0.55, y1 = (d.poop ? d.yq + 1.5 : d.deckY + 1.9), ym = (y0 + y1) / 2;
    const w = Math.max(skinAt(d, t, y0 - 0.9), skinAt(d, t, y0), skinAt(d, t, ym), skinAt(d, t, y1));
    const len = d.L * 0.07;
    k.save(); k.translate(xAt(d, t), 0, s * w); k.rotateY(skinYaw(d, t, ym, s));
    k.add(box(len, y1 - y0, 0.5), { at: [0, y0, s * 0.1], color: P.upper, outline: 0.02 });
    k.add(box(len * 0.8, (y1 - y0) * 0.55, 0.06), { at: [0, y0 + (y1 - y0) * 0.22, s * 0.36], color: P.glass, glow: '#ffc766', pane: true });
    k.add(cone(0.42, 0.9, 6), { at: [0, y0, s * 0.12], rot: [Math.PI, 0, 0], scale: [len * 1.1, 1, 0.62], color: P.trim, outline: 0.015 });
    k.add(cone(0.42, 0.7, 6), { at: [0, y1, s * 0.12], scale: [len * 1.1, 1, 0.62], color: P.cap, outline: 0.015 });
    k.restore();
  }
}

// ---------------------------------------------------------------- the cabin fronts (bulkheads) and rails
function balustrade(k, d, P, t, y, skipFn) {
  const x = xAt(d, t);
  const w = innerAt(d, t, y + 0.5);
  const segs = [];
  let z = -w;
  // runs of rail between the stair openings
  const step = 0.28;
  let run = null;
  for (; z <= w + 1e-6; z += step) {
    const open = skipFn(z);
    if (!open) {
      k.add(cyl(0.04, 0.05, 0.9, 5, true), { at: [x, y, z], color: shade(P.front, 0.35) });
      if (!run) run = [z, z]; else run[1] = z;
    } else if (run) { segs.push(run); run = null; }
  }
  if (run) segs.push(run);
  for (const [a, b] of segs) if (b > a) k.add(box(0.12, 0.08, b - a + 0.12), { at: [x, y + 0.9, (a + b) / 2], color: P.cap, outline: 0.012 });
}

/** A room's front wall (see hull.js roomFront: its doorways, where each door folds back, its windows). */
function cabinFront(k, d, P, r) {
  const f = r.front, face = f.face, y0 = r.floor, y1 = r.top;
  // `face`: +1 the front faces forward (the cabin is aft of it), -1 aft (the forecastle)
  const x = f.u + face * 0.07, w = f.w;
  // (up to a centimetre under the deck above: right up to it, the wall's top
  // lay in the deck's own plane and flickered through its planking)
  const h = y1 - y0 - 0.01, dh = f.dh;
  // the wall, in pieces round its doorways (you walk in through them)
  const ds = [...r.doors].sort((a, b) => a.v - b.v);
  // (and real openings for the windows: you see into the cabin from the deck, and out of it)
  const WW = 0.62, WY0 = 0.95, WY1 = 1.75;
  const holes = [...ds.map((dr) => ({ a: dr.v - dr.w / 2, b: dr.v + dr.w / 2, door: true })), ...f.windows.map((zz) => ({ a: zz - WW / 2, b: zz + WW / 2, win: true }))].sort((p, q) => p.a - q.a);
  let z = -w;
  const piece = (za, zb) => { if (zb - za > 0.02) k.add(box(0.14, h, zb - za), { at: [x - face * 0.07, y0, (za + zb) / 2], color: P.front, outline: 0.02 }); };
  for (const o of holes) {
    piece(z, o.a);
    if (o.win) {
      // the wall under and over the window
      k.add(box(0.14, WY0, WW), { at: [x - face * 0.07, y0, (o.a + o.b) / 2], color: P.front });
      if (h > WY1 + 0.02) k.add(box(0.14, h - WY1, WW), { at: [x - face * 0.07, y0 + WY1, (o.a + o.b) / 2], color: P.front });
    }
    z = Math.max(z, o.b);
  }
  piece(z, w);
  for (const dr of ds) {
    // the lintel over the doorway, its frame, and the door standing open
    // inside, folded back flat against the wall
    k.add(box(0.14, h - dh, dr.w), { at: [x - face * 0.07, y0 + dh, dr.v], color: P.front });
    for (const e of [-1, 1]) k.add(box(0.1, dh, 0.08), { at: [x + face * 0.02, y0, dr.v + e * (dr.w / 2 + 0.02)], color: P.trim, outline: 0.008 });
    k.add(box(0.1, 0.12, dr.w + 0.24), { at: [x + face * 0.03, y0 + dh, dr.v], color: P.trim });
    const lf = dr.leaf;
    if (lf) k.add(box(0.05, dh - 0.06, lf.v1 - lf.v0), { at: [lf.u, y0 + 0.02, (lf.v0 + lf.v1) / 2], color: shade(P.dark, 0.25), outline: 0.008 });
    // a lantern beside the door
    const lz = dr.v + (dr.v > 0 ? -1 : 1) * (dr.w / 2 + 0.3);
    if (Math.abs(lz) < w - 0.2) k.add(cyl(0.1, 0.12, 0.32, 6), { at: [x + face * 0.14, y0 + 1.75, lz], color: '#fff3c4', glow: '#ffcf70', flicker: 0.25, outline: 0.01 });
  }
  // pilasters and a moulding under the deck above
  for (const zz of [-w + 0.1, w - 0.1]) k.add(box(0.1, h, 0.16), { at: [x, y0, zz], color: shade(P.front, -0.25) });
  k.add(box(0.12, 0.14, w * 2), { at: [x + face * 0.02, y1 - 0.18, 0], color: P.trim });
  // windows either side of the doors
  for (const zz of f.windows) {
    // an open casement: its frame round the opening and a cross of glazing bars (no painted pane)
    // (each piece of the frame lapping a few centimetres over the cut edge of the wall: never in its planes)
    k.add(box(0.18, 0.11, 0.78), { at: [x - face * 0.07, y0 + 1.72, zz], color: P.trim, outline: 0.008 });
    k.add(box(0.18, 0.11, 0.78), { at: [x - face * 0.07, y0 + 0.86, zz], color: P.trim, outline: 0.008 });
    for (const e of [-1, 1]) k.add(box(0.18, 0.86, 0.08), { at: [x - face * 0.07, y0 + 0.92, zz + e * 0.34], color: P.trim });
    k.add(box(0.04, 0.8, 0.035), { at: [x - face * 0.07, y0 + 0.95, zz], color: P.trim });
    k.add(box(0.04, 0.035, 0.62), { at: [x - face * 0.07, y0 + 1.35, zz], color: P.trim });
  }
}

function cabinFronts(k, d, P) {
  const on = (lvlA, lvlB) => d.stairs.filter((s) => (s.la === lvlA && s.lb === lvlB) || (s.la === lvlB && s.lb === lvlA));
  const inStair = (list) => (z) => list.some((s) => z > s.va - 0.05 && z < s.vb + 0.05);
  for (const r of d.rooms) if (r.front) cabinFront(k, d, P, r);
  // the rails along the fronts of the raised decks, open at the heads of their stairs
  balustrade(k, d, P, d.tq + 0.004, d.yq, inStair(on('quarter', 'main')));
  if (d.poop) balustrade(k, d, P, d.tp + 0.004, d.yp, inStair(on('poop', 'quarter')));
  if (d.fore) balustrade(k, d, P, d.tf - 0.004, d.yf, inStair(on('main', 'fore')));
}

// ---------------------------------------------------------------- stairs
/**
 * A flight's side board under its steps, from its foot `lo` to its head `hi`
 * ([x, y]), at z: `dv` deep, cut level with the deck at its foot and square
 * at the edge of the deck at its head (not through either).
 */
function stringer(k, lo, hi, z, dv, thick, color) {
  const sh = new THREE.Shape();
  const k0 = dv / (hi[1] - lo[1]);
  sh.moveTo(lo[0], lo[1]);
  sh.lineTo(hi[0], hi[1]);
  sh.lineTo(hi[0], hi[1] - dv);
  sh.lineTo(lo[0] + (hi[0] - lo[0]) * k0, lo[1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  k.add(g, { at: [0, 0, z - thick / 2], color, outline: 0.012 });
}

function stairs(k, d, P) {
  for (const s of d.stairs) {
    if (s.down) { companionway(k, d, P, s); continue; }
    const rise = Math.abs(s.hb - s.ha);
    const n = Math.max(4, Math.round(rise / 0.22));
    const w = s.vb - s.va, zc = (s.va + s.vb) / 2;
    const xa = xAt(d, s.ta), xb = xAt(d, s.tb);
    for (let i = 0; i < n; i++) {
      // step i: its top at the height of the ramp at its far edge
      const f0 = i / n, f1 = (i + 1) / n;
      const lowEnd = s.ha < s.hb ? 'a' : 'b';
      // walking up the flight from its low end
      const fa = lowEnd === 'a' ? f0 : 1 - f1, fb = lowEnd === 'a' ? f1 : 1 - f0;
      const x0 = xa + (xb - xa) * fa, x1 = xa + (xb - xa) * fb;
      // (the top one a centimetre under the deck it climbs to: level with it,
      // the two flickered where it runs in under the deck's edge)
      const top = Math.min(s.ha, s.hb) + rise * (i + 1) / n - (i === n - 1 ? 0.01 : 0);
      k.add(box(Math.abs(x1 - x0) + 0.02, 0.07, w - 0.1), { at: [(x0 + x1) / 2, top - 0.07, zc], color: shade(P.deck, -0.05), outline: 0.01 });
      k.add(box(0.04, top - Math.min(s.ha, s.hb) - 0.02, w - 0.14), { at: [lowEnd === 'a' ? x0 : x1, Math.min(s.ha, s.hb), zc], color: shade(P.deck, -0.3) });
    }
    // a stringer and a handrail on both sides of the flight (the open, inboard one and the one along her side)
    const lo = s.ha < s.hb ? [xa, s.ha] : [xb, s.hb], hi = s.ha < s.hb ? [xb, s.hb] : [xa, s.ha];
    for (const side of [s.va + 0.05, s.vb - 0.05]) {
      stringer(k, lo, hi, side, 0.3, 0.08, P.wood);
      // (the rail on its posts, a hand's height over the steps all the way up — whichever way the flight
      // climbs, fore or aft, it's over them: never down through the deck, nor into the cabin under the landing)
      const len = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]);
      k.save(); k.translate((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2 + 0.88, side);
      if (hi[0] < lo[0]) k.rotateY(Math.PI);
      k.rotateZ(Math.atan2(hi[1] - lo[1], Math.abs(hi[0] - lo[0])));
      k.add(box(len, 0.07, 0.09), { at: [0, -0.035, 0], color: P.cap, outline: 0.01 });
      k.restore();
      for (let i = 0; i <= 3; i++) {
        const f = i / 3;
        k.add(cyl(0.035, 0.035, 0.9, 5), { at: [lo[0] + (hi[0] - lo[0]) * f, lo[1] + (hi[1] - lo[1]) * f, side], color: P.wood });
      }
    }
  }
}

/**
 * The way down to the hold: a ladder (on the largest, a flight of steps) in
 * an opening in the main deck with a low coaming round it — nothing to stop
 * you stepping onto it at its head, or over the coaming anywhere else.
 */
function companionway(k, d, P, s) {
  const xa = xAt(d, s.ta), xb = xAt(d, s.tb), w = s.vb - s.va, lo = s.ha, hi = s.hb;
  const len = Math.hypot(xb - xa, hi - lo), ang = Math.atan2(hi - lo, xb - xa);
  // the coaming: a lip round the opening, ankle high
  const cz = w / 2 + 0.05, ch = 0.12, col = shade(P.deck, -0.3);
  for (const e of [-1, 1]) k.add(box(xb - xa + 0.2, ch, 0.1), { at: [(xa + xb) / 2, d.deckY, e * cz], color: col, outline: 0.01 });
  for (const x of [xa - 0.05, xb + 0.05]) k.add(box(0.1, ch, w), { at: [x, d.deckY, 0], color: col, outline: 0.01 });
  if (s.ladder) {
    // a steep ladder: two sloping side rails (their tops at the coaming) and the rungs
    for (const e of [-1, 1]) {
      k.save(); k.translate((xa + xb) / 2, (lo + hi) / 2, e * (w / 2 - 0.08)); k.rotateZ(ang);
      k.add(box(len, 0.1, 0.06), { at: [0, -0.06, 0], color: P.wood, outline: 0.01 });
      k.restore();
    }
    const n = Math.max(5, Math.round((hi - lo) / 0.3));
    for (let i = 1; i <= n; i++) {
      const f = i / (n + 0.4);
      k.add(box(0.12, 0.05, w - 0.16), { at: [xa + (xb - xa) * f, lo + (hi - lo) * f - 0.03, 0], color: shade(P.deck, -0.12) });
    }
    return;
  }
  // steps, their risers, and a stringer each side
  const n = Math.max(6, Math.round((hi - lo) / 0.22));
  for (let i = 0; i < n; i++) {
    const f0 = i / n, f1 = (i + 1) / n;
    const x0 = xa + (xb - xa) * f0, x1 = xa + (xb - xa) * f1, top = lo + (hi - lo) * f1;
    k.add(box(Math.abs(x1 - x0) + 0.02, 0.06, w - 0.08), { at: [(x0 + x1) / 2, top - 0.06, 0], color: shade(P.deck, -0.05), outline: 0.008 });
    k.add(box(0.03, (hi - lo) / n - 0.01, w - 0.1), { at: [x0, top - (hi - lo) / n, 0], color: shade(P.deck, -0.3) }); // (its top a centimetre under the tread's)
  }
  // (the handrails run up the flight as far as the opening: they end under the deck's edge, not above it)
  const f1 = Math.max(0.1, (hi - 0.95 - lo) / (hi - lo)), x1 = xa + (xb - xa) * f1, y1 = lo + (hi - lo) * f1;
  for (const e of [-1, 1]) {
    stringer(k, [xa, lo], [xb, hi], e * (w / 2 - 0.02), 0.28, 0.07, P.wood);
    k.save(); k.translate((xa + x1) / 2, (lo + y1) / 2 + 0.85, e * (w / 2 - 0.02)); k.rotateZ(ang);
    k.add(box(len * f1, 0.06, 0.07), { color: P.cap, outline: 0.008 });
    k.restore();
    for (const f of [0.02, f1 * 0.5, f1 - 0.02]) k.add(cyl(0.03, 0.03, 0.85, 5), { at: [xa + (xb - xa) * f, lo + (hi - lo) * f, e * (w / 2 - 0.02)], color: P.wood });
  }
}

/**
 * The ship's wheel on its pedestal, turning fore and aft (the helmsman stands
 * aft of it): the rim, eight spokes running out through it to turned
 * handles, the brass hub. `hub`: the axle's height over the deck.
 */
export function helmWheel(k, P, x, y, R = 0.56, hub = 0.92) {
  // the pedestal: a stout post and the barrel the tiller ropes wind round
  // (the wheel itself turns as she's steered: its own mesh, wheelParts — see ships3d.js ShipView)
  k.add(box(0.26, hub + 0.1, 0.34), { at: [x + 0.2, y, 0], color: P.wood, outline: 0.012 });
  k.add(cyl(0.15, 0.15, 0.62, 10), { at: [x + 0.2, y + hub - 0.08, -0.31], rot: [Math.PI / 2, 0, 0], color: shade(P.wood, 0.15), outline: 0.01 });
  k.add(cyl(0.045, 0.045, 0.3, 6), { at: [x + 0.05, y + hub, 0], rot: [0, 0, Math.PI / 2], color: P.dark });
}

/**
 * A big ship's wheel — the rim, its eight spokes with their turned handles,
 * the brass boss — about its hub (the origin), its axle along x (fore and
 * aft): turned about x, as she's steered. Spoke i stands i/8 of the way round
 * from the top, toward starboard (+z).
 */
export function wheelParts(k, P, R = 0.56) {
  k.save(); k.rotateY(Math.PI / 2);
  k.add(torus(R, 0.045, 6, 28), { color: '#7b5230', outline: 0.012 });
  for (let i = 0; i < 8; i++) {
    k.save(); k.rotateZ(i / 8 * TAU);
    k.add(cyl(0.026, 0.034, R + 0.14, 6), { color: '#7b5230' });
    k.add(lathe([[0.028, 0], [0.042, 0.04], [0.03, 0.1], [0.046, 0.15], [0.036, 0.19], [0.001, 0.2]], 7), { at: [0, R + 0.1, 0], color: '#8d6038', outline: 0.006 });
    k.restore();
  }
  k.add(cyl(0.12, 0.12, 0.16, 12), { at: [0, 0, -0.08], rot: [Math.PI / 2, 0, 0], color: P.trim, outline: 0.008 });
  k.restore();
}

// ---------------------------------------------------------------- on deck
function fittings(k, d, P) {
  const dk = d.deckY;
  // the capstan, with its bars shipped
  if (d.capstanT !== null) {
    const x = xAt(d, d.capstanT), fl = floorAt(d, d.capstanT);
    k.add(lathe([[0.42, 0], [0.36, 0.15], [0.3, 0.5], [0.34, 0.8], [0.44, 0.92], [0.4, 1.02], [0.01, 1.04]], 12), { at: [x, fl, 0], color: P.wood, outline: 0.02 });
    for (let i = 0; i < 4; i++) k.add(box(1.25, 0.06, 0.07), { at: [x, fl + 0.82, 0], rot: [0, i * Math.PI / 4, 0], color: '#b08850' });
  }
  // the ship's boat on its chocks, upright
  if (d.boat) {
    const b = d.boat, len = b.u1 - b.u0, xc = (b.u0 + b.u1) / 2;
    const hullG = new THREE.SphereGeometry(1, 14, 6, 0, TAU, Math.PI / 2, Math.PI / 2);
    k.add(hullG, { at: [xc, dk + 0.95, 0], scale: [len / 2, 0.62, b.w / 2], color: '#f2efe6', double: true, outline: 0.02 });
    k.add(torus(1, 0.035, 4, 24), { at: [xc, dk + 0.95, 0], rot: [Math.PI / 2, 0, 0], scale: [len / 2, b.w / 2, 1], color: P.cap });
    for (const f of [-0.28, 0.28]) k.add(box(0.28, 0.46, b.w * 0.9), { at: [xc + f * len, dk, 0], color: P.wood, outline: 0.012 });
    for (const f of [-0.18, 0.12]) k.add(box(0.2, 0.05, b.w * 0.86), { at: [xc + f * len, dk + 0.72, 0], color: '#b08850' });
    for (const zz of [-0.18, 0.18]) k.add(cyl(0.03, 0.03, len * 0.9, 5), { at: [xc - len * 0.45, dk + 0.8, zz * b.w], rot: [0, 0, -Math.PI / 2], color: '#b08850' });
  }
  // the helm: the wheel (just the one) and the binnacle, on the quarterdeck
  helmWheel(k, P, d.wheelU, d.helmFloor);
  if (d.binnacleU !== null) {
    const fy = d.yq;
    k.add(box(0.45, 0.95, 0.45), { at: [d.binnacleU, fy, 0], color: P.wood, outline: 0.012 });
    k.add(new THREE.SphereGeometry(0.2, 10, 6, 0, TAU, 0, Math.PI / 2), { at: [d.binnacleU, fy + 0.95, 0], color: '#cfe8ef', glow: '#fff1c1' });
  }
  // each mast comes up through the deck in a low collar (the mast coat): no
  // rail round it, you walk right up to it (see hull.js: a mast is as solid as it's thick)
  for (const u of d.mastU) {
    const t = (u + d.L / 2) / d.L, fl = floorAt(d, t), r = d.mastR;
    k.add(lathe([[r + 0.07, 0], [r + 0.065, 0.05], [r + 0.03, 0.14], [r + 0.005, 0.2]], 14), { at: [u, fl, 0], color: shade(P.deck, -0.35), outline: 0.008 });
  }
  // a pile of round shot beside a mast
  if (d.shotPile) { k.save(); k.translate(d.shotPile.u, d.deckY, d.shotPile.v); shotPile(k, P); k.restore(); }
  // the belfry at the forecastle's after rail, looking down on the main deck
  if (d.fore) {
    const x = xAt(d, d.tf + 0.03), y = d.yf;
    for (const z of [-0.45, 0.45]) k.add(box(0.12, 1.5, 0.12), { at: [x, y, z], color: P.wood, outline: 0.01 });
    k.add(cone(0.85, 0.5, 4), { at: [x, y + 1.5, 0], rot: [0, Math.PI / 4, 0], color: P.cap, outline: 0.012 });
    k.add(lathe([[0.2, 0], [0.16, 0.1], [0.12, 0.3], [0.1, 0.36], [0.01, 0.38]], 10), { at: [x, y + 0.95, 0], color: P.trim });
  }
  // catted anchors at the bow (hanging clear of her side all the way down:
  // she's broader lower down, and aft, than where the ring's made fast)
  for (const s of [-1, 1]) {
    const t = 0.9, y = topAt(d, t) - 1.1, a = 1.6 + d.B * 0.08, ta = a * 0.3 / d.L;
    let w = 0;
    for (const tt of [t - ta, t, t + ta]) for (const yy of [y - a * 0.6 - 0.1, y - a * 0.3, y, y + a * 0.4]) w = Math.max(w, skinAt(d, tt, yy));
    const z = s * (w + 0.2);
    k.add(cyl(0.07, 0.07, a, 6), { at: [xAt(d, t), y - a * 0.6, z], color: P.iron, outline: 0.012 });
    k.add(torus(a * 0.28, 0.07, 5, 10, Math.PI), { at: [xAt(d, t), y - a * 0.6, z], rot: [0, 0, Math.PI], color: P.iron, outline: 0.012 });
    // (the cathead: out from her rail to over the anchor)
    const yc = topAt(d, t) - 0.25, zi = skinAt(d, t, yc) - 0.15, zo = w + 0.3;
    k.add(box(0.12, 0.12, zo - zi), { at: [xAt(d, t), yc, s * (zi + zo) / 2], color: P.wood });
  }
  // channels: the ledges the shrouds come down to, beside each mast
  for (const u of d.mastU) {
    const t = (u + d.L / 2) / d.L;
    const y = topAt(d, t) - 0.35;
    for (const s of [-1, 1]) {
      const w = skinAt(d, t, y);
      k.add(box(2.4 + d.mastR * 2, 0.12, 0.4), { at: [u - 0.5, y, s * (w + 0.18)], rot: [0, skinYaw(d, t, y, s), 0], color: P.cap, outline: 0.01 });
    }
  }
}

// ---------------------------------------------------------------- figureheads
/**
 * A figurehead's neck (or body): a carved timber that comes out of the stem
 * itself — it starts inside the bow, passes through the stem head and runs on
 * to the figure, so the figure is always joined to the ship (never floating
 * off her bow), thick where it leaves the hull and slimmer at the figure.
 */
function stemNeck(k, from, via, to, r, color) {
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(from[0], from[1], 0), new THREE.Vector3(via[0], via[1], 0), new THREE.Vector3(to[0], to[1], 0)]);
  k.add(tube(c, 14, r, 8), { color, outline: 0.02 });
  // (and a collar where it meets the stem, hiding the join)
  k.add(new THREE.SphereGeometry(r * 1.25, 10, 8), { at: [via[0], via[1], 0], color, outline: 0.015 });
}

/** A tube that tapers from radius r0 at its start to r1 at its end (a neck, a horn, a tail). */
function taperTube(curve, segs, r0, r1, radial = 8) {
  const g = tube(curve, segs, 1, radial), P = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs), r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j;
      if (n >= P.count) break;
      v.fromBufferAttribute(P, n).sub(c).multiplyScalar(r).add(c);
      P.setXYZ(n, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

function bigFigurehead(k, def, d, P) {
  const L = d.L, B = d.B;
  const stem = [L / 2 - 0.1, d.fore ? d.deckY + d.hf * 0.35 : d.deckY + 0.35];
  const fh = def.figurehead;
  const s = B / 7 * (fh === 'seagull' || fh === 'whale' ? 1 : fh === 'mermaid' ? 2.2 : 1.5);
  if (fh === 'ram' || fh === 'lion') {
    // the Going Merry's sheep, the Thousand Sunny's sunflower lion: big and
    // round, up on the stem head where the crew sit on them
    const tip = [L / 2, topAt(d, 1)];
    const g = B / 2.3;
    if (fh === 'ram') {
      const hc = [tip[0] + 0.28 * g, tip[1] + 0.42 * g, 0];
      stemNeck(k, [tip[0] - 0.9, tip[1] - 0.45 * g], [tip[0] - 0.05, tip[1] - 0.05 * g], hc, 0.15 * g, '#f5f6fa');
      k.add(new THREE.SphereGeometry(0.36 * g, 14, 10), { at: hc, scale: [1.15, 1, 1], color: '#f7f5ef', outline: 0.03 });
      k.add(new THREE.SphereGeometry(0.22 * g, 12, 8), { at: [hc[0] + 0.3 * g, hc[1] - 0.1 * g, 0], scale: [1, 0.85, 1.05], color: '#efe8da', outline: 0.02 });
      for (const z of [-1, 1]) {
        k.add(new THREE.SphereGeometry(0.06 * g, 8, 6), { at: [hc[0] + 0.22 * g, hc[1] + 0.12 * g, z * 0.2 * g], color: '#1d1d1d' });
        k.add(new THREE.SphereGeometry(0.035 * g, 6, 4), { at: [hc[0] + 0.47 * g, hc[1] - 0.08 * g, z * 0.07 * g], color: '#5a4a3a' });
        const pts = [];
        for (let i = 0; i <= 24; i++) {
          const a = i / 24 * Math.PI * 2.4 + Math.PI * 0.5, r = 0.24 * g * (1 - i / 24 * 0.72);
          pts.push(new THREE.Vector3(hc[0] - 0.1 * g + Math.cos(a) * r, hc[1] + 0.05 * g + Math.sin(a) * r, z * (0.3 * g + i / 24 * 0.12 * g)));
        }
        k.add(tube(new THREE.CatmullRomCurve3(pts), 24, 0.065 * g, 6), { color: '#c8955a', outline: 0.015 });
      }
    } else {
      const hc = [tip[0] + 0.3 * g, tip[1] + 0.55 * g, 0];
      stemNeck(k, [tip[0] - 0.9, tip[1] - 0.45 * g], [tip[0] - 0.05, tip[1] - 0.05 * g], hc, 0.17 * g, '#e8c26b');
      for (let i = 0; i < 16; i++) {
        k.save(); k.translate(hc[0] - 0.08 * g, hc[1], 0); k.rotateX(i / 16 * TAU);
        k.add(cone(0.17 * g, 0.42 * g, 6), { at: [0, 0.38 * g, 0], color: i % 2 ? '#f39c12' : '#e67e22', outline: 0.015 });
        k.restore();
      }
      k.add(new THREE.SphereGeometry(0.44 * g, 14, 10), { at: hc, scale: [0.75, 1, 1], color: '#fdd663', outline: 0.03 });
      for (const z of [-1, 1]) k.add(new THREE.SphereGeometry(0.07 * g, 8, 6), { at: [hc[0] + 0.3 * g, hc[1] + 0.12 * g, z * 0.17 * g], color: '#1d1d1d' });
      k.add(new THREE.SphereGeometry(0.09 * g, 8, 6), { at: [hc[0] + 0.34 * g, hc[1] - 0.05 * g, 0], color: '#8d5524' });
      k.add(torus(0.12 * g, 0.022 * g, 4, 10, Math.PI), { at: [hc[0] + 0.32 * g, hc[1] - 0.14 * g, 0], rot: [0, Math.PI / 2, Math.PI], color: '#5a3a22' });
    }
    return;
  }
  if (fh === 'whale') {
    // the bow is a great white whale's head: eyes on its sides, a smiling mouth
    const cx = L / 2 - B * 0.42, top = d.yf - 0.06, bot = -1.4;
    const cy = (top + bot) / 2, ry = (top - bot) / 2;
    const rz = hbAt(0.86, B) * 1.04;
    const white = C('#f4f1ea');
    // (the head wraps the bow: wherever it would come inside her — up through
    // the main deck, into the forecastle or the hold — it's drawn forward onto
    // her planking instead, where her bow's no broader than it, never across
    // her; and it never rises over her rail)
    const head = new THREE.SphereGeometry(1, 28, 18, 0, TAU, 0, Math.PI), hp = head.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      let x = cx + hp.getX(i) * B * 0.66, y = cy + hp.getY(i) * ry;
      const z = hp.getZ(i) * rz;
      if (x < L / 2 && x > -L / 2) {
        let t = (x + L / 2) / L;
        y = Math.min(y, topAt(d, t) - 0.08);
        if (Math.abs(z) < skinAt(d, t, y) + 0.05) {
          while (t < 1 && Math.abs(z) < skinAt(d, t, y) + 0.05) t += 0.002;
          x = xAt(d, Math.min(1, t));
        }
      }
      hp.setXYZ(i, x, y, z);
    }
    head.computeVertexNormals();
    k.add(head, { color: white, outline: 0.06 });
    for (const z of [-1, 1]) {
      k.add(new THREE.SphereGeometry(1, 12, 8), { at: [cx + B * 0.33, cy + ry * 0.22, z * rz * 0.84], scale: [0.35 * s, 0.42 * s, 0.25 * s], color: '#141414', outline: 0.02 });
      k.add(new THREE.SphereGeometry(1, 8, 6), { at: [cx + B * 0.36, cy + ry * 0.3, z * rz * 0.9], scale: [0.1 * s, 0.12 * s, 0.08 * s], color: '#ffffff' });
    }
    // a wide smile under the snout, running back along both cheeks
    const mouth = [];
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI * 0.42 + Math.PI * 0.84 * i / 16;
      const ex = Math.cos(a), ez = Math.sin(a);
      const yy = cy - ry * (0.34 - 0.14 * Math.abs(ez)); // (the corners turn up)
      const f = Math.sqrt(Math.max(0, 1 - ((yy - cy) / ry) ** 2));
      mouth.push(new THREE.Vector3(cx + B * 0.66 * f * ex * 1.01, yy, rz * f * ez * 1.01));
    }
    k.add(tube(new THREE.CatmullRomCurve3(mouth), 32, 0.16 * s, 6), { color: '#3b3330' });
    return;
  }
  if (fh === 'seagull') {
    // the Marine gull, big enough to see from the next island
    const g = s * 1.25;
    const hc = [stem[0] + 0.9 * g, stem[1] + 1.1 * g, 0];
    stemNeck(k, [stem[0] - 1.0, stem[1] - 0.6], [stem[0] + 0.05, stem[1] + 0.1], hc, 0.36 * g, '#f5f6fa');
    k.add(new THREE.SphereGeometry(0.75 * g, 14, 10), { at: hc, color: '#f5f6fa', outline: 0.04 });
    k.add(cone(0.26 * g, 1.1 * g, 8), { at: [hc[0] + 0.55 * g, hc[1] - 0.12 * g, 0], rot: [0, 0, -Math.PI / 2], color: '#f5a623', outline: 0.02 });
    for (const z of [-1, 1]) k.add(new THREE.SphereGeometry(0.12 * g, 8, 6), { at: [hc[0] + 0.36 * g, hc[1] + 0.25 * g, z * 0.5 * g], color: '#1d1d1d' });
    k.add(new THREE.CylinderGeometry(0.5 * g, 0.66 * g, 0.26 * g, 12), { at: [hc[0] - 0.05, hc[1] + 0.75 * g, 0], color: '#1b4f72', outline: 0.02 });
    return;
  }
  if (fh === 'dragon') {
    // a sea dragon rearing from the stem: a scaled neck thick at the bow and
    // tapering up to a long-snouted head, jaws open on two rows of fangs, swept
    // horns, glowing eyes, whiskers trailing back and a gold fin down its spine
    const green = '#2e7d32', belly = '#c5b358', gold = '#e8c26b', dark = '#1b5e20';
    const pts = [[stem[0] - 1.0, stem[1] - 0.6 * s], [stem[0] + 0.1, stem[1] + 0.1 * s], [stem[0] + 0.55 * s, stem[1] + 0.55 * s], [stem[0] + 0.62 * s, stem[1] + 1.25 * s], [stem[0] + 1.0 * s, stem[1] + 1.8 * s], [stem[0] + 1.35 * s, stem[1] + 2.0 * s]];
    const neck = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    k.add(taperTube(neck, 24, 0.42 * s, 0.22 * s), { color: green, outline: 0.03 });
    // (its belly plates, down the front of the neck)
    for (let i = 1; i < 9; i++) {
      const u = 0.12 + i * 0.09, P = neck.getPointAt(u), T = neck.getTangentAt(u), r = (0.42 - 0.2 * u) * s;
      k.add(new THREE.SphereGeometry(1, 8, 5), { at: [P.x + T.y * r * 0.82, P.y - T.x * r * 0.82, 0], scale: [r * 0.5, r * 0.32, r * 0.75], rot: [0, 0, Math.atan2(T.y, T.x)], color: belly });
      // (and the spine's fin, over the back)
      k.add(cone(0.1 * s, 0.34 * s * (1 - u * 0.4), 4), { at: [P.x - T.y * r * 0.95, P.y + T.x * r * 0.95, 0], rot: [0, 0, Math.atan2(T.y, T.x) - Math.PI / 2 + 0.5], scale: [1, 1, 0.35], color: gold, outline: 0.01 });
    }
    const hc = [stem[0] + 1.5 * s, stem[1] + 2.05 * s, 0];
    // skull, brow and the long snout
    k.add(new THREE.SphereGeometry(0.42 * s, 14, 10), { at: hc, scale: [1.15, 0.9, 0.95], color: green, outline: 0.03 });
    k.add(new THREE.SphereGeometry(0.3 * s, 12, 8), { at: [hc[0] + 0.55 * s, hc[1] + 0.02 * s, 0], scale: [1.7, 0.62, 0.78], color: green, outline: 0.025 });
    k.add(new THREE.SphereGeometry(0.1 * s, 8, 6), { at: [hc[0] + 1.02 * s, hc[1] + 0.04 * s, 0], scale: [1, 0.8, 1.6], color: dark });
    // the lower jaw hanging open
    k.save(); k.translate(hc[0] + 0.05 * s, hc[1] - 0.18 * s, 0); k.rotateZ(-0.42);
    k.add(new THREE.SphereGeometry(0.26 * s, 12, 8), { at: [0.5 * s, 0, 0], scale: [1.9, 0.38, 0.7], color: green, outline: 0.02 });
    for (const z of [-1, 1]) for (let i = 0; i < 4; i++) k.add(cone(0.035 * s, 0.14 * s, 4), { at: [(0.35 + i * 0.16) * s, 0.12 * s, z * 0.12 * s], color: '#fffdf2' });
    k.add(new THREE.SphereGeometry(0.2 * s, 8, 6), { at: [0.48 * s, 0.03 * s, 0], scale: [1.6, 0.25, 0.45], color: '#8e2430' });
    k.restore();
    for (const z of [-1, 1]) {
      // fangs hanging from the upper jaw
      for (let i = 0; i < 4; i++) k.add(cone(0.04 * s, 0.17 * s, 4), { at: [hc[0] + (0.4 + i * 0.17) * s, hc[1] - 0.2 * s, z * 0.15 * s], rot: [Math.PI, 0, 0], color: '#fffdf2' });
      // nostril, brow ridge, glowing eye
      k.add(new THREE.SphereGeometry(0.04 * s, 6, 4), { at: [hc[0] + 1.06 * s, hc[1] + 0.1 * s, z * 0.09 * s], color: '#0d2b10' });
      k.add(new THREE.SphereGeometry(0.15 * s, 8, 6), { at: [hc[0] + 0.24 * s, hc[1] + 0.25 * s, z * 0.24 * s], scale: [1.6, 0.6, 0.8], color: dark, outline: 0.01 });
      k.add(new THREE.SphereGeometry(0.085 * s, 8, 6), { at: [hc[0] + 0.3 * s, hc[1] + 0.16 * s, z * 0.31 * s], color: '#ffd54f', glow: '#ffb300' });
      k.add(new THREE.SphereGeometry(0.035 * s, 6, 4), { at: [hc[0] + 0.35 * s, hc[1] + 0.16 * s, z * 0.37 * s], scale: [0.5, 1.6, 0.5], color: '#1d1d1d' });
      // horns sweeping back off the brow
      const horn = new THREE.CatmullRomCurve3([new THREE.Vector3(hc[0] + 0.05 * s, hc[1] + 0.3 * s, z * 0.22 * s), new THREE.Vector3(hc[0] - 0.4 * s, hc[1] + 0.55 * s, z * 0.32 * s), new THREE.Vector3(hc[0] - 0.95 * s, hc[1] + 0.6 * s, z * 0.4 * s), new THREE.Vector3(hc[0] - 1.3 * s, hc[1] + 0.85 * s, z * 0.42 * s)]);
      k.add(taperTube(horn, 12, 0.1 * s, 0.015 * s), { color: gold, outline: 0.012 });
      // whiskers trailing back from the snout
      const wh = new THREE.CatmullRomCurve3([new THREE.Vector3(hc[0] + 0.95 * s, hc[1] - 0.02 * s, z * 0.14 * s), new THREE.Vector3(hc[0] + 0.7 * s, hc[1] - 0.25 * s, z * 0.5 * s), new THREE.Vector3(hc[0] + 0.1 * s, hc[1] - 0.45 * s, z * 0.75 * s), new THREE.Vector3(hc[0] - 0.6 * s, hc[1] - 0.35 * s, z * 0.85 * s)]);
      k.add(taperTube(wh, 14, 0.03 * s, 0.008 * s), { color: gold });
      // a frill of fins behind the jaw
      for (let i = 0; i < 3; i++) k.add(cone(0.09 * s, 0.4 * s, 4), { at: [hc[0] - (0.2 + i * 0.12) * s, hc[1] - 0.05 * s + i * 0.08 * s, z * 0.32 * s], rot: [z * (1.2 + i * 0.2), 0, 1.8], scale: [1, 1, 0.3], color: gold, outline: 0.01 });
    }
    return;
  }
  if (fh === 'lion_gold') {
    // a golden lion roaring off the stem: a full face — brow, muzzle, nose,
    // open jaws — in a thick mane of carved locks, ears pricked through it
    const hc = [stem[0] + 0.75 * s, stem[1] + 1.25 * s, 0];
    const gold = '#f2cc4a', deep = '#c9962a', mid = '#e0b12b';
    stemNeck(k, [stem[0] - 1.0, stem[1] - 0.6], [stem[0] + 0.05, stem[1] + 0.1], [hc[0] - 0.3 * s, hc[1] - 0.2 * s], 0.36 * s, deep);
    // the mane: a full round of locks behind the face, two rings deep, and its bulk behind
    k.add(new THREE.SphereGeometry(0.95 * s, 16, 12), { at: [hc[0] - 0.3 * s, hc[1], 0], scale: [0.7, 1, 1], color: deep, outline: 0.03 });
    for (const [ring, n, len, rad, col] of [[0, 18, 0.95, 0.3, mid], [1, 14, 0.7, 0.26, deep]]) {
      for (let i = 0; i < n; i++) {
        const a = (i + ring * 0.5) / n * TAU;
        k.save(); k.translate(hc[0] - (0.12 + ring * 0.25) * s, hc[1], 0); k.rotateX(a); k.rotateZ(-0.35 - ring * 0.25);
        k.add(cone(rad * s, len * s, 6), { at: [0, (0.62 + ring * 0.1) * s + len * s * 0.4, 0], scale: [0.55, 1, 1], color: col, outline: 0.015 });
        k.restore();
      }
    }
    // the face: a broad skull, cheeks swelling either side of the muzzle, a heavy brow
    k.add(new THREE.SphereGeometry(0.62 * s, 16, 12), { at: hc, scale: [0.85, 0.95, 0.9], color: gold, outline: 0.03 });
    k.add(new THREE.SphereGeometry(0.4 * s, 12, 8), { at: [hc[0] + 0.32 * s, hc[1] + 0.3 * s, 0], scale: [0.9, 0.4, 1.2], color: gold, outline: 0.015 });
    for (const z of [-1, 1]) {
      k.add(new THREE.SphereGeometry(0.24 * s, 10, 8), { at: [hc[0] + 0.5 * s, hc[1] - 0.12 * s, z * 0.17 * s], color: gold, outline: 0.015 });
      // deep-set eyes under the brow
      k.add(new THREE.SphereGeometry(0.1 * s, 8, 6), { at: [hc[0] + 0.5 * s, hc[1] + 0.17 * s, z * 0.27 * s], scale: [0.6, 0.75, 1], color: '#3a2a10' });
      k.add(new THREE.SphereGeometry(0.045 * s, 6, 4), { at: [hc[0] + 0.55 * s, hc[1] + 0.18 * s, z * 0.27 * s], color: '#fff3c4', glow: '#ffcf70' });
      // ears pricked up out of the mane
      k.add(new THREE.SphereGeometry(0.16 * s, 8, 6), { at: [hc[0] + 0.05 * s, hc[1] + 0.58 * s, z * 0.42 * s], scale: [0.5, 1, 0.8], color: gold, outline: 0.015 });
      k.add(new THREE.SphereGeometry(0.1 * s, 6, 5), { at: [hc[0] + 0.1 * s, hc[1] + 0.58 * s, z * 0.42 * s], scale: [0.4, 0.8, 0.6], color: deep });
      // fangs at the corners of the open mouth
      k.add(cone(0.05 * s, 0.2 * s, 5), { at: [hc[0] + 0.62 * s, hc[1] - 0.3 * s, z * 0.12 * s], rot: [Math.PI, 0, 0], color: '#fffdf2' });
      k.add(cone(0.045 * s, 0.16 * s, 5), { at: [hc[0] + 0.58 * s, hc[1] - 0.58 * s, z * 0.11 * s], color: '#fffdf2' });
    }
    // the nose, broad and flat on the end of the muzzle
    k.add(new THREE.SphereGeometry(0.16 * s, 10, 6), { at: [hc[0] + 0.72 * s, hc[1] + 0.02 * s, 0], scale: [0.7, 0.55, 1.1], color: '#8d5524', outline: 0.012 });
    // the open mouth and the jaw under it
    k.add(new THREE.SphereGeometry(0.22 * s, 10, 8), { at: [hc[0] + 0.5 * s, hc[1] - 0.42 * s, 0], scale: [0.8, 0.7, 1], color: '#7a1f1f' });
    k.add(new THREE.SphereGeometry(0.26 * s, 10, 8), { at: [hc[0] + 0.42 * s, hc[1] - 0.66 * s, 0], scale: [0.9, 0.45, 0.9], color: gold, outline: 0.015 });
    return;
  }
  if (fh === 'mermaid') {
    // a mermaid leaning out from the stem, arms swept back, her hair streaming
    // down her back; her tail curls down the stem to a fluke at the cutwater
    const skin = '#f2d5b8', hair = '#e6b422', tail = '#2a9d8f', fin = '#e8c26b';
    const hip = [stem[0] + 0.3 * s, stem[1] + 0.55 * s];
    const lean = 0.62; // (leaning out over the sea, as a figurehead does)
    k.save(); k.translate(hip[0], hip[1], 0); k.rotateZ(-lean);
    // torso: hips, waist, ribs, bust, shoulders
    const prof = [[0, 0], [0.24, 0.02], [0.2, 0.22], [0.17, 0.36], [0.22, 0.52], [0.24, 0.62], [0.2, 0.72], [0.1, 0.8], [0, 0.82]].map(([r, y]) => [r * s, y * s]);
    k.add(lathe(prof, 14), { scale: [0.85, 1, 1], color: skin, outline: 0.02 });
    // a girdle of gold scales where the tail begins
    k.add(new THREE.TorusGeometry(0.22 * s, 0.04 * s, 6, 16), { at: [0, 0.06 * s, 0], rot: [Math.PI / 2, 0, 0], scale: [0.85, 1, 1], color: fin });
    k.add(cyl(0.06 * s, 0.07 * s, 0.12 * s, 8), { at: [0, 0.82 * s, 0], color: skin });
    // head, face turned out to sea and a little up
    const H = [0.04 * s, 1.05 * s, 0];
    k.add(new THREE.SphereGeometry(0.17 * s, 14, 10), { at: H, scale: [1, 1.12, 0.95], color: skin, outline: 0.02 });
    k.add(new THREE.SphereGeometry(0.05 * s, 6, 4), { at: [H[0] + 0.16 * s, H[1] - 0.02 * s, 0], color: skin });
    for (const z of [-1, 1]) k.add(new THREE.SphereGeometry(0.025 * s, 6, 4), { at: [H[0] + 0.14 * s, H[1] + 0.04 * s, z * 0.065 * s], color: '#2c4a6e' });
    k.add(new THREE.SphereGeometry(0.18 * s, 12, 8, 0, TAU, 0, Math.PI * 0.6), { at: [H[0] - 0.03 * s, H[1] + 0.01 * s, 0], rot: [0, 0, 1.15], scale: [1.08, 1.15, 1.06], color: hair, outline: 0.015 });
    // her hair in long locks down her back, lifting in the wind
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * 0.06 * s;
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(H[0] - 0.08 * s, H[1] + 0.08 * s, z), new THREE.Vector3(H[0] - 0.24 * s, H[1] - 0.12 * s, z * 1.6), new THREE.Vector3(H[0] - 0.3 * s, H[1] - 0.5 * s, z * 2), new THREE.Vector3(H[0] - 0.42 * s + (i % 2) * 0.06 * s, H[1] - 0.85 * s, z * 2.2)]);
      k.add(taperTube(c, 10, 0.06 * s, 0.015 * s), { color: hair, outline: 0.01 });
    }
    // arms swept back along her sides, hands open behind her
    for (const z of [-1, 1]) {
      const sh = [0, 0.72 * s, z * 0.2 * s], el = [-0.2 * s, 0.5 * s, z * 0.3 * s], hd = [-0.42 * s, 0.38 * s, z * 0.3 * s];
      const arm = new THREE.CatmullRomCurve3([sh, el, hd].map((q) => new THREE.Vector3(...q)));
      k.add(taperTube(arm, 10, 0.055 * s, 0.035 * s), { color: skin, outline: 0.012 });
      k.add(new THREE.SphereGeometry(0.05 * s, 8, 6), { at: hd, scale: [1.4, 0.6, 1], color: skin });
    }
    k.restore();
    // the tail: from her hips, curling down and back along the stem to the fluke
    const ca = Math.cos(-lean), sa = Math.sin(-lean);
    const loc = (x, y) => [hip[0] + x * ca - y * sa, hip[1] + x * sa + y * ca];
    const t0 = loc(0, 0.04 * s);
    const tl = new THREE.CatmullRomCurve3([
      new THREE.Vector3(t0[0], t0[1], 0), new THREE.Vector3(stem[0] + 0.05, stem[1] - 0.15 * s, 0.05 * s),
      new THREE.Vector3(stem[0] - 0.35, stem[1] - 0.9 * s, -0.04 * s), new THREE.Vector3(stem[0] - 0.75, stem[1] - 1.6 * s, 0.04 * s), new THREE.Vector3(stem[0] - 0.95, stem[1] - 2.1 * s, 0),
    ]);
    k.add(taperTube(tl, 22, 0.22 * s, 0.07 * s), { color: tail, outline: 0.02 });
    // gold scale-bands along it, and a fin at each side halfway down
    for (let i = 1; i < 7; i++) {
      const u = i / 7.5, P = tl.getPointAt(u), T = tl.getTangentAt(u), r = (0.22 - 0.15 * u) * s;
      k.add(new THREE.TorusGeometry(r * 1.01, 0.012 * s, 4, 12), { at: [P.x, P.y, P.z], rot: [Math.PI / 2, 0, Math.atan2(T.y, T.x) - Math.PI / 2], color: fin });
    }
    const end = tl.getPointAt(1), eT = tl.getTangentAt(1), ea = Math.atan2(eT.y, eT.x);
    for (const z of [-1, 1]) k.add(cone(0.22 * s, 0.6 * s, 5), { at: [end.x + Math.cos(ea) * 0.15 * s, end.y + Math.sin(ea) * 0.15 * s, z * 0.16 * s], rot: [z * 0.9, 0, ea - Math.PI / 2], scale: [1, 1, 0.25], color: fin, outline: 0.012 });
    return;
  }
  // (no figurehead: a plain stem head)
  void P;
}

// ---------------------------------------------------------------- rig
/** Masts: where they stand, how tall, and where their tops and crosstrees are. */
export function bigMastPlan(d) {
  const n = d.mastU.length;
  const ks = n >= 4 ? [0.92, 1.0, 0.86, 0.7] : n === 3 ? [0.92, 1.0, 0.8] : n === 2 ? [1.0, 0.84] : [1.0];
  return d.mastU.map((u, i) => {
    const t = (u + d.L / 2) / d.L, base = floorAt(d, t);
    const H = d.mastH * ks[i];
    // (a one-master's mast is both her fore and her main; a two-master flies her colours from the foremast)
    return {
      x: u, m: i, base, h: H, main: n >= 3 ? i === 1 : i === 0, aft: n > 1 && i === n - 1, fore: i === 0,
      h1: base + (H - base) * 0.44, h2: base + (H - base) * 0.76, r: d.mastR * Math.sqrt(ks[i]),
    };
  });
}

/** The tip of the bowsprit: steeved up from the stem head. */
export function bigBowTip(d, def) {
  if (def && noSprit(def.figurehead)) {
    // (no bowsprit: the forestays come down to the foredeck, behind the head)
    const x0 = d.L / 2 - 2.2, y0 = (d.bowY ?? d.yf) + 0.2;
    return { x0, y0, a: 0, len: 0, none: true, tip: [x0, y0 + 0.9] };
  }
  const a = 0.3, len = d.L * 0.28;
  const x0 = d.L / 2 - 0.6, y0 = (d.bowY ?? d.yf) + 0.4;
  return { x0, y0, a, len, tip: [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len] };
}

export function bigSailPlan(def, d, mast) {
  const sails = [];
  const wC = Math.min(d.B * 2.05, d.L * 0.5) * (mast.aft ? 0.8 : 1);
  const yr = 0.06 + d.L * 0.0025;
  if (mast.aft) {
    // the spanker: a big fore-and-aft sail aft of the mizzen, its boom head-high
    // over the deck the mast stands on — ending short of a deck that rises aft
    // of it (the quarterdeck, the poop), not in through the front of the cabin
    // under it; or, where that would leave it stunted, carried high enough to
    // clear that deck as well
    const tm = (mast.x + d.L / 2) / d.L, dt = 0.05 / d.L;
    let len = Math.min(d.L * 0.2, 8), y0 = mast.base + 2.6;
    let tUp = null;
    for (let t = tm; t >= tm - len / d.L; t -= dt) if (floorAt(d, t) > mast.base + 0.05) { tUp = t; break; }
    if (tUp !== null) {
      const room = (tm - tUp) * d.L - 0.3;
      if (room >= len * 0.6) len = room;
      else { let top = mast.base; for (let t = tm; t >= tm - len / d.L; t -= dt) top = Math.max(top, floorAt(d, t)); y0 = top + 2.3; }
    }
    sails.push({ type: 'gaff', x: mast.x, y0, y1: mast.h1 - 0.3, len });
  } else {
    // (the course's foot well over the heads of the crew: the deck stays open to see across)
    sails.push({ type: 'square', x: mast.x, w: wC, y0: Math.min(mast.base + 3.9, mast.h1 - 3), y1: mast.h1 - 0.35, emblem: mast.main, yardR: yr });
  }
  sails.push({ type: 'square', x: mast.x, w: wC * 0.82, y0: mast.h1 + 0.5, y1: mast.h2 - 0.35, emblem: mast.fore && def.sail === 'marine', yardR: yr * 0.85 });
  // (on the mainmast the topgallant sets above the crow's nest, not through it)
  sails.push({ type: 'square', x: mast.x, w: wC * 0.62, y0: mast.h2 + (mast.main ? 1.5 : 0.35), y1: mast.h - 0.7, yardR: yr * 0.7 });
  if (mast.fore && !noSprit(def.figurehead)) {
    const b = bigBowTip(d, def);
    sails.push({ type: 'jib', x: mast.x, y1: mast.h2 - 0.4, head: [mast.x + 0.4, mast.h2 - 0.4], tipX: b.tip[0], tipY: b.tip[1] - 0.2, clew: [xAt(d, 0.9), (d.bowY ?? d.yf) + (d.fore ? 2.6 : 1.9)] });
  }
  return sails;
}

/** Masts in three parts with tops, crosstrees, a crow's nest, the bowsprit (one merged mesh). */
export function bigMastGeometry(def, d, plan) {
  const k = new Mesher();
  const wood = '#5d4037', dark = '#3e2723';
  for (const m of plan) {
    const r = m.r;
    // lower mast (down through the decks to the hold's floor), topmast, topgallant
    const foot = d.holdY !== undefined ? d.holdY : m.base - 1;
    k.add(cyl(r * 0.8, r, m.h1 + 0.6 - foot, 10), { at: [m.x, foot, 0], color: wood, outline: 0.02 });
    k.add(cyl(r * 0.55, r * 0.7, m.h2 + 0.5 - (m.h1 - 0.8), 8), { at: [m.x + r * 1.1, m.h1 - 0.8, 0], color: wood, outline: 0.018 });
    k.add(cyl(r * 0.28, r * 0.45, m.h - (m.h2 - 0.6), 8), { at: [m.x + r * 1.7, m.h2 - 0.6, 0], color: wood, outline: 0.015 });
    k.add(new THREE.SphereGeometry(r * 0.5, 8, 6), { at: [m.x + r * 1.7, m.h + 0.05, 0], color: '#d4ac0d' });
    // mast caps
    k.add(box(r * 3.2, 0.3, r * 2.2), { at: [m.x + r * 0.55, m.h1 + 0.45, 0], color: dark, outline: 0.012 });
    k.add(box(r * 2.6, 0.24, r * 1.6), { at: [m.x + r * 1.4, m.h2 + 0.4, 0], color: dark, outline: 0.012 });
    // the top: a platform over the trestletrees
    const tw = Math.min(4.2, d.B * 0.42), tl = Math.min(2.6, 1 + d.L * 0.045);
    k.add(box(tl, 0.14, tw), { at: [m.x + 0.1, m.h1, 0], color: shade(wood, 0.1), outline: 0.015 });
    k.add(box(0.1, 0.5, tw), { at: [m.x + 0.1 - tl / 2, m.h1 + 0.14, 0], color: wood });
    // crosstrees
    k.add(box(0.14, 0.12, tw * 0.75), { at: [m.x + r * 1.2, m.h2, 0], color: wood, outline: 0.01 });
    k.add(box(tl * 0.6, 0.12, 0.14), { at: [m.x + r * 1.2, m.h2, 0], color: wood, outline: 0.01 });
    if (m.main) {
      // the crow's nest, up on the main topmast
      const y = m.h2 + 0.1, R = 0.75;
      k.add(cyl(R, R * 0.85, 1.0, 12, true), { at: [m.x + r * 1.1, y, 0], color: '#8d6e4a', double: true, outline: 0.02 });
      k.add(cyl(R * 0.85, R * 0.85, 0.06, 12), { at: [m.x + r * 1.1, y, 0], color: '#6d4c33' });
      k.add(torus(R, 0.05, 4, 14), { at: [m.x + r * 1.1, y + 1.0, 0], rot: [Math.PI / 2, 0, 0], color: '#5d4037' });
      // and the ladder up to it, up the aft side of the mast from the deck (climbable: see game/masthead.js)
      const lx = m.x - r - 0.14, H = y - m.base + 0.9;
      for (const z of [-0.24, 0.24]) k.add(box(0.07, H, 0.07), { at: [lx, m.base, z], color: '#5d4037', outline: 0.01 });
      for (let h = 0.35; h < H - 0.1; h += 0.34) k.add(box(0.05, 0.05, 0.5), { at: [lx, m.base + h, 0], color: '#8d6e4a' });
    }
    // rope hoops up the lower mast
    for (let y = m.base + 1.6; y < m.h1 - 1; y += 1.4) k.add(torus(r * 1.05, 0.04, 3, 10), { at: [m.x, y, 0], rot: [Math.PI / 2, 0, 0], color: '#c8b89a' });
  }
  // the bowsprit and jibboom
  const b = bigBowTip(d, def);
  if (!b.none) {
    k.save(); k.translate(b.x0, b.y0, 0); k.rotateZ(-Math.PI / 2 + b.a);
    k.add(cyl(0.12 + d.L * 0.003, 0.2 + d.L * 0.006, b.len * 0.7, 8), { color: wood, outline: 0.02 });
    k.add(cyl(0.08, 0.12 + d.L * 0.003, b.len * 0.45, 7), { at: [0, b.len * 0.6, 0], color: wood, outline: 0.015 });
    k.restore();
  }
  // a flagstaff at the taffrail for the ensign
  // (stepped on the deck right by the taffrail, an iron band holding it to
  // the rail, raking aft over the stern: not standing on air at rail height)
  const ty = topAt(d, 0.01), fs = flagstaff(d);
  k.add(cyl(0.05, 0.08, fs.len, 6), { at: [fs.x, fs.y, 0], rot: [0, 0, fs.rake], color: dark, outline: 0.012 });
  k.add(cyl(0.1, 0.1, 0.08, 8), { at: [fs.x - Math.sin(fs.rake) * (ty - 0.25 - fs.y), ty - 0.25, 0], color: '#3a3a3a' });
  k.add(box(0.5, 0.06, 0.08), { at: [fs.x - 0.25 - Math.sin(fs.rake) * (ty - 0.25 - fs.y), ty - 0.23, 0], color: '#3a3a3a' });
  return k.build(true);
}

/** The ensign's staff: { x, y (its foot, on the deck at the stern), len, rake, top: [x, y] }. */
export function flagstaff(d) {
  const x = -d.L / 2 + 0.75, y = floorAt(d, 0.75 / d.L + 0.004, 0), ty = topAt(d, 0.01);
  const len = ty - y + 3.2, rake = 0.18;
  return { x, y, len, rake, top: [x - Math.sin(rake) * len, y + Math.cos(rake) * len] };
}

/** Shrouds with ratlines, stays and backstays (line segment positions). */
export function bigRigging(d, plan, def) {
  const pts = [];
  const Ln = (a, b) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  for (const m of plan) {
    const t = (m.x + d.L / 2) / d.L;
    const rail = topAt(d, t) - 0.3;
    const out = skinAt(d, t, rail) + 0.35;
    const tw = Math.min(4.2, d.B * 0.42) / 2;
    const n = 5;
    // lower shrouds from the top down to the channels, and ratlines across them
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) Ln([m.x - 0.2 + i * 0.05, m.h1 - 0.1, s * (m.r + 0.1)], [m.x - 1.4 + i * 0.55, rail, s * out]);
      for (let y = rail + 0.45; y < m.h1 - 0.9; y += 0.45) {
        const f = (y - rail) / (m.h1 - 0.1 - rail);
        const z = s * (out + (m.r + 0.1 - out) * f);
        Ln([m.x - 1.4 + (1.2) * f, y, z], [m.x - 1.4 + 0.55 * (n - 1) + (1.2 - 0.55 * (n - 1) + 0.2) * f, y, z]);
      }
      // topmast shrouds to the edge of the top, topgallant shrouds to the crosstrees
      for (let i = 0; i < 3; i++) Ln([m.x + m.r, m.h2 - 0.2, s * m.r], [m.x - 0.5 + i * 0.5, m.h1 + 0.1, s * tw]);
      for (let i = 0; i < 2; i++) Ln([m.x + m.r * 1.7, m.h - 1, s * m.r * 0.5], [m.x + m.r * 1.2 - 0.3 + i * 0.6, m.h2 + 0.05, s * tw * 0.75]);
      // backstays from the topmast head down to the rail aft
      Ln([m.x + m.r, m.h2 + 0.3, s * m.r], [m.x - 3.2, rail, s * out]);
    }
  }
  // stays: each mast to the one before it, the foremast to the bowsprit
  const b = bigBowTip(d, def);
  for (let i = 0; i < plan.length; i++) {
    const m = plan[i];
    if (i === 0) {
      Ln([m.x + m.r, m.h2 - 0.2, 0], [b.tip[0], b.tip[1], 0]);
      Ln([m.x, m.h1 + 0.2, 0], [b.x0 + Math.cos(b.a) * b.len * 0.55, b.y0 + Math.sin(b.a) * b.len * 0.55, 0]);
      Ln([m.x + m.r * 1.7, m.h - 0.5, 0], [b.tip[0], b.tip[1], 0]);
    } else {
      const f = plan[i - 1];
      Ln([m.x, m.h1 + 0.2, 0], [f.x, (f.base + f.h1) * 0.5, 0]);
      Ln([m.x + m.r, m.h2, 0], [f.x, f.h1 + 0.4, 0]);
      Ln([m.x + m.r * 1.7, m.h - 0.6, 0], [f.x + f.r, f.h2 + 0.2, 0]);
    }
  }
  // the bobstay under the bowsprit
  if (!b.none) Ln([b.tip[0] - b.len * 0.3, b.tip[1] - b.len * 0.3 * Math.tan(b.a), 0], [d.L / 2 - 0.3, 0.3, 0]);
  return pts;
}

// ---------------------------------------------------------------- below decks, and in the cabins
// (a separate mesh: it's only drawn when you're close by — see ShipView)
const IN = { wall: C('#8a6445'), wall2: C('#7d5a3d'), beam: C('#5b3d26'), floor: C('#a57b52'), dark: C('#3e2a1c'), cloth: C('#c9b99a') };

/** The inside of a room's sides (the hull's lining), from its floor up to the deck over it (see hull.js liningAt). */
function lining(k, d, r) {
  const N = Math.max(4, Math.round((r.t1 - r.t0) * d.L / 0.5));
  const hold = r.kind === 'hold';
  const ys = liningYs(r);
  for (const s of [1, -1]) {
    const pos = [], idx = [], cols = [];
    for (let i = 0; i <= N; i++) {
      const t = r.t0 + (r.t1 - r.t0) * i / N, x = xAt(d, t);
      for (const y of ys) pos.push(x, r.floor + y, s * liningAt(d, r, t, y));
    }
    const M = ys.length;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M - 1; j++) {
        const a = i * M + j, b = a + 1, c = a + M, e = c + 1;
        if (s > 0) idx.push(a, b, c, b, e, c); else idx.push(a, c, b, b, c, e);
        // (the planks run fore and aft; a wainscot below the cabin windows)
        const col = hold ? (j % 2 ? IN.wall2 : IN.wall) : j === 0 ? IN.wall2 : IN.wall;
        cols.push(col, col);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    k.add(g, { split: true, color: (p, n, i) => cols[Math.floor(i / 3)] });
  }
}

/** A wall across the ship at t (from y0 to y1), the width of the hull there. */
function endWall(k, d, t, y0, y1, face, hold = false) {
  const w = hold ? Math.max(0.4, skinAt(d, t, (y0 + y1) / 2) - 0.2) : innerAt(d, t, (y0 + y1) / 2) + 0.05;
  k.add(box(0.1, y1 - y0, w * 2), { at: [xAt(d, t) - face * 0.05, y0, 0], color: IN.wall2 });
}

/** Beams under a deck (ceil: the underside), across the room every metre or so. */
function beams(k, d, r, ceil, skip = null) {
  for (let x = xAt(d, r.t0) + 0.5; x < xAt(d, r.t1) - 0.3; x += 1.15) {
    const t = (x + d.L / 2) / d.L;
    if (skip && skip(x)) continue;
    const w = r.kind === 'hold' ? skinAt(d, t, ceil - 0.1) - 0.2 : innerAt(d, t, ceil - 0.1);
    k.add(box(0.16, 0.14, w * 2), { at: [x, ceil - 0.14, 0], color: IN.beam });
  }
}

// ---------------------------------------------------------------- the furniture
// Each piece is drawn in its own frame: w across it (x), dp from its back to
// its front (z, the front at +z), from its floor (or the height it hangs at)
// up — and turned to face the way it stands (see hull.js furnish, FURNITURE,
// footprint). What's drawn is what you walk round: it fits its footprint.
const WOOD = IN.beam, TOP = C('#8d6038'), BOOKS = ['#8e2b20', '#23527c', '#2e6b2e', '#b08850', '#6a4c93'];

/** A barrel standing at (x, z) of the piece's frame, 0.6 across and 0.78 tall. */
function barrelAt(k, x, z) {
  k.add(lathe([[0.23, 0], [0.275, 0.17], [0.295, 0.39], [0.275, 0.61], [0.23, 0.78], [0.001, 0.78]], 10), { at: [x, 0, z], color: '#8d5b33', outline: 0.008 });
  for (const hy of [0.12, 0.64]) k.add(torus(0.272, 0.016, 3, 10), { at: [x, hy, z], rot: [Math.PI / 2, 0, 0], color: '#3a3a3a' });
}

/** A sea chest's domed lid, hinged along its back edge (the hinge at the origin; the lid runs toward +z). */
function chestLid(k, w, dp, dome, wood, iron) {
  const half = new THREE.CylinderGeometry(dp / 2, dp / 2, w, 14, 1, false, 0, Math.PI);
  k.add(half, { at: [0, 0, dp / 2], rot: [0, 0, Math.PI / 2], scale: [dome / (dp / 2), 1, 1], color: shade(wood, 0.1), outline: 0.01 });
  k.add(box(w - 0.01, 0.02, dp - 0.01), { at: [0, 0, dp / 2], color: shade(wood, -0.25) });
  for (const a of [-0.3, 0.3]) k.add(torus(dp / 2 + 0.006, 0.012, 4, 10, Math.PI), { at: [a * w, 0, dp / 2], rot: [0, Math.PI / 2, 0], scale: [1, dome / (dp / 2), 1], color: iron });
}

const PIECES = {
  table(k, it) {
    const { w, dp, h } = it;
    k.add(box(w, 0.06, dp), { at: [0, h - 0.06, 0], color: TOP, outline: 0.01 });
    k.add(box(w - 0.16, 0.08, dp - 0.16), { at: [0, h - 0.14, 0], color: shade(WOOD, 0.12) });
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(box(0.07, h - 0.06, 0.07), { at: [a * (w / 2 - 0.07), 0, b * (dp / 2 - 0.07)], color: WOOD });
    if (it.mess) {
      // the crew's mess: tankards and plates
      for (const [a, b] of [[-0.32, -0.2], [0.05, 0.22], [0.3, -0.18]]) k.add(cyl(0.045, 0.04, 0.12, 8), { at: [a * w, h, b * dp], color: '#8d8d8d', outline: 0.005 });
      for (const [a, b] of [[-0.12, 0.18], [0.2, 0.16], [-0.05, -0.2]]) k.add(cyl(0.1, 0.085, 0.02, 12), { at: [a * w, h, b * dp], color: '#d9d2c3' });
    } else {
      // a chart spread out, and a candle
      k.add(box(w * 0.5, 0.005, dp * 0.55), { at: [-w * 0.08, h, 0], rot: [0, 0.08, 0], color: '#e8dcb5' });
      k.add(cyl(0.035, 0.035, 0.12, 6), { at: [w * 0.34, h, dp * 0.22], color: '#f5f0e1', glow: '#ffcf70', flicker: 0.4 });
    }
  },
  chair(k, it) {
    // (you sit facing its front: the back is behind you)
    const seat = 0.45;
    k.add(box(0.44, 0.05, 0.44), { at: [0, seat - 0.05, 0.005], color: TOP, outline: 0.008 });
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(box(0.045, seat - 0.05, 0.045), { at: [a * 0.19, 0, b * 0.19], color: WOOD });
    for (const a of [-1, 1]) k.add(box(0.045, it.h - seat, 0.045), { at: [a * 0.19, seat, -0.19], color: WOOD });
    k.add(box(0.42, 0.16, 0.04), { at: [0, it.h - 0.18, -0.19], color: WOOD, outline: 0.008 });
    k.add(box(0.42, 0.05, 0.035), { at: [0, seat + 0.16, -0.19], color: WOOD });
  },
  bench(k, it) {
    const { w, dp, h } = it;
    k.add(box(w, 0.05, dp), { at: [0, h - 0.05, 0], color: TOP, outline: 0.008 });
    for (const a of [-1, 1]) k.add(box(0.05, h - 0.05, dp - 0.08), { at: [a * (w / 2 - 0.14), 0, 0], color: WOOD });
    k.add(box(w - 0.34, 0.05, 0.04), { at: [0, 0.12, 0], color: WOOD });
  },
  desk(k, it) {
    // (its front faces the visitor; the drawers face whoever sits behind it)
    const { w, dp, h } = it, pw = w * 0.3;
    k.add(box(w, 0.05, dp), { at: [0, h - 0.05, 0], color: TOP, outline: 0.01 });
    for (const a of [-1, 1]) {
      const x = a * (w / 2 - pw / 2);
      k.add(box(pw, h - 0.05, dp - 0.04), { at: [x, 0, 0], color: WOOD, outline: 0.008 });
      for (let j = 0; j < 3; j++) {
        const y = 0.06 + j * (h - 0.12) / 3;
        k.add(box(pw - 0.06, (h - 0.12) / 3 - 0.04, 0.02), { at: [x, y, -dp / 2 + 0.01], color: shade(WOOD, 0.15) });
        k.add(box(0.07, 0.02, 0.02), { at: [x, y + (h - 0.12) / 6 - 0.02, -dp / 2], color: '#d4ac0d' });
      }
    }
    k.add(box(w - 2 * pw, h - 0.3, 0.03), { at: [0, 0.25, dp / 2 - 0.035], color: shade(WOOD, -0.1) });
    // books, an inkwell, a chart and a candle
    for (let i = 0; i < 4; i++) k.add(box(0.05, 0.22, 0.16), { at: [-w * 0.4 + i * 0.06, h, dp * 0.18], color: BOOKS[i] });
    k.add(cyl(0.035, 0.04, 0.06, 8), { at: [w * 0.22, h, -dp * 0.18], color: '#1d1d1d' });
    k.add(box(w * 0.36, 0.005, dp * 0.46), { at: [0, h, 0], rot: [0, -0.1, 0], color: '#e8dcb5' });
    k.add(cyl(0.035, 0.035, 0.12, 6), { at: [w * 0.4, h, dp * 0.22], color: '#f5f0e1', glow: '#ffcf70', flicker: 0.4 });
  },
  bunk(k, it) {
    // along a wall, its back to it; the pillow at its head (it.head: -1 aft, 1 forward)
    const { w, dp, h } = it, hx = (Math.sign(Math.cos(it.rot || 0)) || 1) * (it.head || -1);
    k.add(box(w, 0.32, dp), { color: WOOD, outline: 0.01 });
    k.add(box(w - 0.14, 0.14, dp - 0.08), { at: [0, 0.32, 0], color: '#e8e1d0' });
    k.add(box(w * 0.58, 0.05, dp - 0.05), { at: [-hx * w * 0.19, 0.44, 0], color: '#8e3b2a' });
    k.add(box(0.38, 0.1, dp * 0.62), { at: [hx * (w / 2 - 0.3), 0.46, 0], color: '#f7f3ea' });
    k.add(box(0.06, h, dp), { at: [hx * (w / 2 - 0.03), 0, 0], color: WOOD, outline: 0.008 });
    k.add(box(0.06, h - 0.14, dp), { at: [-hx * (w / 2 - 0.03), 0, 0], color: WOOD, outline: 0.008 });
    k.add(box(w - 0.12, h - 0.34, 0.035), { at: [0, 0.32, -dp / 2 + 0.018], color: shade(WOOD, 0.1) });
  },
  chest(k, it) {
    // a sea chest: iron-bound, its lock on the front, a domed lid hinged at
    // the back; a treasure chest's lid thrown back on a heap of gold
    const dp = FURNITURE.chest.dp, body = 0.4, dome = 0.2, iron = '#b8860b';
    const wood = it.treasure ? C('#7a4a26') : C('#6d4c33'), w = it.w;
    k.save(); k.translate(0, 0, it.dp / 2 - dp / 2);
    k.add(box(w, body, dp), { color: wood, outline: 0.01 });
    for (const a of [-0.3, 0.3]) k.add(box(0.06, body, dp + 0.012), { at: [a * w, 0, 0], color: iron });
    k.add(box(0.13, 0.15, 0.02), { at: [0, body - 0.19, dp / 2 + 0.006], color: '#d4ac0d' });
    for (const e of [-1, 1]) k.add(torus(0.055, 0.012, 4, 8, Math.PI), { at: [e * (w / 2 + 0.002), body * 0.62, 0], rot: [0, Math.PI / 2, Math.PI], color: '#2b2b2b' });
    // the boards of its sides, a plinth round its foot, iron corners
    for (const y of [body * 0.33, body * 0.66]) k.add(box(w + 0.004, 0.012, dp + 0.004), { at: [0, y, 0], color: shade(wood, -0.25) });
    k.add(box(w + 0.03, 0.05, dp + 0.03), { at: [0, 0, 0], color: shade(wood, -0.15) });
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) k.add(box(0.07, 0.07, 0.07), { at: [ex * (w / 2 - 0.03), 0.0, ez * (dp / 2 - 0.03)], scale: [1.08, 1, 1.08], color: '#3a3a3a' });
    k.save(); k.translate(0, body, -dp / 2);
    if (it.treasure) k.rotateX(-1.3);
    chestLid(k, w, dp, dome, wood, iron);
    k.restore();
    if (it.treasure) {
      k.add(box(w - 0.08, 0.03, dp - 0.08), { at: [0, body - 0.01, 0], color: '#f4c430', glow: '#6b4f00' });
      for (let i = 0; i < 9; i++) k.add(new THREE.SphereGeometry(0.05 + (i % 3) * 0.012, 7, 5), { at: [(-0.3 + (i % 5) * 0.15) * w, body + 0.03, (((i * 7) % 5) - 2) * 0.05], scale: [1, 0.55, 1], color: i % 4 ? '#f4c430' : '#c0392b', glow: '#6b4f00' });
    }
    k.restore();
  },
  shelf(k, it) {
    // a bookcase against the wall, the books' spines out
    const { w, dp, h } = it;
    for (const a of [-1, 1]) k.add(box(0.04, h, dp), { at: [a * (w / 2 - 0.02), 0, 0], color: WOOD, outline: 0.008 });
    k.add(box(w - 0.08, h, 0.03), { at: [0, 0, -dp / 2 + 0.015], color: shade(WOOD, -0.15) });
    const levels = [0, 0.44, 0.88, 1.32, h - 0.03];
    for (const y of levels) k.add(box(w - 0.08, 0.03, dp - 0.03), { at: [0, y, 0.015], color: WOOD });
    for (let j = 0; j < 4; j++) {
      const y = levels[j] + 0.03, room = levels[j + 1] - y - 0.03;
      let x = -w / 2 + 0.06;
      for (let i = 0; x < w / 2 - 0.12; i++) {
        const bw = 0.045 + ((i * 7 + j * 3) % 4) * 0.012, bh = room * (0.74 + ((i * 5 + j) % 3) * 0.08);
        k.add(box(bw, bh, dp * 0.62), { at: [x + bw / 2, y, -dp / 2 + 0.035 + dp * 0.31], color: BOOKS[(i + j) % 5] });
        x += bw + 0.008;
      }
      // (a batten across each shelf keeps the books in when she rolls)
      k.add(box(w - 0.08, 0.03, 0.02), { at: [0, y + 0.1, dp / 2 - 0.015], color: shade(WOOD, 0.1) });
    }
  },
  stove(k, it, d) {
    // the galley stove: a cast-iron range standing on a stone hearth (no fire
    // on bare planks), a tin heat shield on the wall behind it; the firebox
    // door with its grille glowing, the ash drawer under it, a brass rail
    // along the front to hang a cloth on, two hotplates with a kettle on one,
    // and its pipe up through the deck overhead with a collar where it passes
    const { w: W, dp: DP, h } = it, w = W - 0.3, dp = DP - 0.2, iron = '#2b2b2e', ironL = '#3c3c42', brass = '#c9a227', r = d.rooms.find((x) => x.kind === it.room);
    k.add(box(W, 0.06, DP), { at: [0, 0, 0], color: '#8b8378', outline: 0.008 });
    for (let i = 0; i < 3; i++) k.add(box(0.012, 0.062, DP), { at: [-W / 2 + (i + 1) * W / 4, 0, 0], color: '#6e675e' });
    k.add(box(W - 0.04, 1.3, 0.02), { at: [0, 0.06, -DP / 2 + 0.012], color: '#9aa3a8' });
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(cyl(0.035, 0.05, 0.12, 6), { at: [a * (w / 2 - 0.07), 0.06, b * (dp / 2 - 0.07)], color: iron });
    k.add(box(w, h - 0.22, dp), { at: [0, 0.18, 0], color: iron, outline: 0.01 });
    k.add(box(w + 0.04, 0.05, dp + 0.04), { at: [0, h - 0.06, 0], color: ironL, outline: 0.008 });
    // the firebox door and its grille, the fire behind
    const fx = -w * 0.18, fw = w * 0.42;
    k.add(box(fw, 0.26, 0.02), { at: [fx, 0.3, dp / 2 + 0.006], color: '#ff7a1a', glow: '#ff5a00', flicker: 0.5 });
    k.add(box(fw + 0.06, 0.04, 0.03), { at: [fx, 0.56, dp / 2 + 0.01], color: ironL });
    k.add(box(fw + 0.06, 0.04, 0.03), { at: [fx, 0.27, dp / 2 + 0.01], color: ironL });
    for (let i = 0; i < 5; i++) k.add(box(0.02, 0.26, 0.025), { at: [fx - fw / 2 + (i + 0.5) * fw / 5, 0.3, dp / 2 + 0.015], color: ironL });
    k.add(box(0.1, 0.03, 0.04), { at: [fx + fw / 2 - 0.06, 0.43, dp / 2 + 0.035], color: brass });
    // the ash drawer, and the oven door beside the firebox
    k.add(box(fw, 0.08, 0.02), { at: [fx, 0.18, dp / 2 + 0.006], color: ironL });
    k.add(box(w * 0.34, 0.36, 0.02), { at: [w * 0.27, 0.24, dp / 2 + 0.006], color: ironL, outline: 0.006 });
    k.add(box(0.12, 0.025, 0.03), { at: [w * 0.27, 0.5, dp / 2 + 0.025], color: brass });
    // the brass rail along the front
    k.add(cyl(0.015, 0.015, w - 0.1, 6), { at: [-(w - 0.1) / 2, h - 0.2, dp / 2 + 0.07], rot: [0, 0, -Math.PI / 2], color: brass });
    for (const a of [-1, 1]) k.add(box(0.02, 0.02, 0.08), { at: [a * (w / 2 - 0.06), h - 0.21, dp / 2 + 0.03], color: brass });
    // two hotplates, a kettle on one
    for (const a of [-1, 1]) k.add(cyl(0.13, 0.13, 0.015, 12), { at: [a * w * 0.22, h - 0.01, dp * 0.08], color: ironL });
    const kx = w * 0.22, kz = dp * 0.08;
    k.add(cyl(0.1, 0.13, 0.16, 12), { at: [kx, h, kz], color: '#7b7f86', outline: 0.008 });
    k.add(cyl(0.04, 0.1, 0.05, 12), { at: [kx, h + 0.16, kz], color: '#7b7f86' });
    k.add(cyl(0.012, 0.022, 0.12, 6), { at: [kx + 0.1, h + 0.06, kz], rot: [0, 0, -0.9], color: '#7b7f86' });
    k.add(torus(0.07, 0.01, 4, 10, Math.PI), { at: [kx, h + 0.2, kz], color: '#2b2b2e' });
    // the pipe, with a collar at the stove and where it goes up through the deck
    const top = (r ? r.ceil + 0.12 - r.floor : 2.4);
    k.add(cyl(0.11, 0.11, 0.06, 10), { at: [-w * 0.25, h, -dp / 2 + 0.16], color: ironL });
    k.add(cyl(0.08, 0.08, top - h, 10), { at: [-w * 0.25, h, -dp / 2 + 0.16], color: iron });
    k.add(cyl(0.13, 0.13, 0.05, 10), { at: [-w * 0.25, top - 0.17, -dp / 2 + 0.16], color: brass });
  },
  hammock(k, it) {
    // the canvas slung between two spreader bars, sagging in the middle; the
    // lines gathered to a ring at each end and up to a hook in the beams
    const { w, dp, h } = it, L = w - 0.44, N = 10, sag = 0.22;
    const pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const x = -L / 2 + L * i / N, y = 0.04 + sag * (2 * x / L) ** 2;
      for (const [z, lift] of [[-dp * 0.42, 0.07], [0, 0], [dp * 0.42, 0.07]]) pos.push(x, y + lift, z);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    k.add(g, { color: IN.cloth, double: true, outline: 0.006 });
    const yb = 0.04 + sag + 0.07, dy = 0.12;
    for (const e of [-1, 1]) {
      k.add(box(0.04, 0.04, dp * 0.9), { at: [e * L / 2, yb - 0.02, 0], color: WOOD });
      // (the clews: a line from each end of the bar to the ring, and one up from the ring to the hook)
      const x0 = e * L / 2, x1 = e * (w / 2 - 0.04);
      for (const z of [-1, 1]) {
        const z0 = z * dp * 0.44, ln = Math.hypot(x1 - x0, dy, z0);
        k.save(); k.translate(x0, yb, z0);
        k.rotateY(Math.atan2(z0, x1 - x0)); k.rotateZ(Math.atan2(dy, Math.hypot(x1 - x0, z0)) - Math.PI / 2);
        k.add(cyl(0.008, 0.008, ln, 3), { color: '#8d7b5a' });
        k.restore();
      }
      k.add(cyl(0.012, 0.012, h - 0.03 - yb - dy, 4), { at: [x1, yb + dy, 0], color: '#8d7b5a' });
      k.add(torus(0.03, 0.008, 3, 8), { at: [x1, h - 0.03, 0], color: '#2b2b2b' });
    }
  },
  barrel(k) { barrelAt(k, 0, 0); },
  barrels(k) { for (const a of [-1, 1]) barrelAt(k, a * 0.34, 0); },
  crate(k) {
    // a big crate, and a smaller one stowed on it askew
    k.add(box(0.78, 0.7, 0.78), { color: '#b08850', outline: 0.01 });
    for (const a of [-1, 1]) k.add(box(0.8, 0.07, 0.8), { at: [0, a > 0 ? 0.6 : 0.03, 0], color: '#8d6e4a' });
    k.add(box(0.52, 0.46, 0.52), { at: [0.02, 0.7, -0.02], rot: [0, 0.35, 0], color: '#a57b52', outline: 0.01 });
  },
  sacks(k) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.33, z = i % 2 ? 0.06 : -0.06;
      k.add(new THREE.SphereGeometry(0.26, 7, 5), { at: [x, 0.2, z], scale: [1.05, 0.8, 0.9], color: '#d8c49a', outline: 0.008 });
      k.add(cyl(0.05, 0.07, 0.07, 6), { at: [x, 0.39, z], color: '#c4ae82' });
    }
  },
  shot(k, it, d, P) { shotPile(k, P, 0.075, 6); },
  rug(k, it) {
    const { w, dp } = it;
    k.add(box(w, 0.01, dp), { at: [0, 0.003, 0], color: '#7b2d26' });
    k.add(box(w - 0.16, 0.012, dp - 0.16), { at: [0, 0.003, 0], color: '#a8452f' });
    if (w > 0.8 && dp > 0.8) {
      k.add(box(w - 0.42, 0.014, dp - 0.42), { at: [0, 0.003, 0], color: '#7b2d26' });
      k.add(box(w - 0.52, 0.016, dp - 0.52), { at: [0, 0.003, 0], color: '#b8573a' });
    }
  },
  lantern(k, it) {
    const { dp, h } = it;
    if (!it.wall) {
      // hung from a beam overhead on its chain
      k.add(cyl(0.1, 0.1, 0.04, 6), { at: [0, 0.02, 0], color: '#2b1d14' });
      k.add(cyl(0.08, 0.09, 0.2, 6), { at: [0, 0.06, 0], color: '#fff3c4', glow: '#ffcf70', flicker: 0.25, outline: 0.006 });
      k.add(cone(0.11, 0.08, 6), { at: [0, 0.26, 0], color: '#2b1d14' });
      k.add(cyl(0.008, 0.008, h - 0.34, 3), { at: [0, 0.34, 0], color: '#2b1d14' });
      return;
    }
    // on an iron bracket off the wall behind it, above head height
    const z = dp / 2 - 0.12;
    k.add(box(0.1, 0.16, 0.02), { at: [0, h - 0.2, -dp / 2 + 0.01], color: '#2b1d14' });
    k.add(box(0.04, 0.04, dp - 0.1), { at: [0, h - 0.06, -0.05], color: '#2b1d14' });
    k.add(cyl(0.01, 0.01, 0.1, 4), { at: [0, h - 0.16, z], color: '#2b1d14' });
    k.add(cyl(0.1, 0.1, 0.04, 6), { at: [0, 0.02, z], color: '#2b1d14' });
    k.add(cyl(0.08, 0.09, 0.2, 6), { at: [0, 0.06, z], color: '#fff3c4', glow: '#ffcf70', flicker: 0.25, outline: 0.006 });
    k.add(cone(0.11, 0.08, 6), { at: [0, 0.26, z], color: '#2b1d14' });
  },
};

/** One piece of furniture, standing (or hanging) where hull.js furnish put it, turned to face the way it does. */
export function furniture(k, d, P, it) {
  const draw = PIECES[it.kind];
  if (!draw) return;
  k.save();
  k.translate(it.u, it.floor + (it.y || 0), it.v);
  k.rotateY(it.rot || 0);
  draw(k, it, d, P);
  k.restore();
}

/**
 * Below decks: the rooms and everything in them (`k`) — and, apart, the
 * undersides of the decks over them and their beams (`overhead`), which never
 * see the sun: the shadows of what stands on the deck above aren't to fall on them.
 */
export function bigInterior(def, d) {
  const P = bigPalette(def);
  const k = new Mesher(), overhead = new Mesher();
  const cp = d.comp;
  for (const r of d.rooms) {
    const top = r.ceil + 0.1;     // (the deck over the room: its underside)
    // the floor (the cabin and forecastle floors are the main deck's, running in under the decks above)
    if (r.kind !== 'hold') deckGrid(k, d, P, r.t0, r.t1, r.floor, null, false, IN.floor);
    else deckGrid(k, d, P, r.t0, r.t1, r.floor, null, false, shade(IN.floor, -0.1));
    // the ceiling (open over the companionway)
    if (r.kind === 'hold') {
      deckGrid(overhead, d, P, r.t0, cp.t0, top, null, true, IN.wall);
      deckGrid(overhead, d, P, cp.t0, cp.t1, top, cp.w / 2, true, IN.wall);
      deckGrid(overhead, d, P, cp.t1, r.t1, top, null, true, IN.wall);
    } else deckGrid(overhead, d, P, r.t0, r.t1, top, null, true, IN.wall);
    lining(k, d, r);
    beams(overhead, d, r, top, r.kind === 'hold' ? (x) => x > cp.u0 - 0.2 && x < cp.u1 + 0.2 : null);
    // the ends
    if (r.kind === 'hold') { endWall(k, d, r.t0, r.floor, top, 1, true); endWall(k, d, r.t1, r.floor, top, -1, true); }
    else if (r.kind === 'forecastle') endWall(k, d, r.t1, r.floor, top, -1);
    else {
      // the stern: panelled, with the gallery windows looking out astern (see hull.js sternWindows)
      endWall(k, d, r.t0, r.floor, top, 1);
      const x = xAt(d, r.t0);
      for (const wd of r.windows || []) {
        // (the sea and sky beyond the glass: pale by day, lit from within by night)
        // (glass you see out through: the sea and the sky, as they lie from where you stand — windowpane.js viewMesh)
        k.add(box(0.04, 0.9, wd.w), { at: [x + 0.01, r.floor + 0.75, wd.v], color: '#a9d6ee', pane: true });
        k.add(box(0.06, 0.05, wd.w - 0.02), { at: [x + 0.02, r.floor + 1.18, wd.v], color: IN.beam }); // (a centimetre short of the glass's sides, not ending in their planes)
        k.add(box(0.06, 0.9, 0.05), { at: [x + 0.02, r.floor + 0.75, wd.v], color: IN.beam });
        k.add(box(0.12, 0.06, wd.w + 0.1), { at: [x + 0.04, r.floor + 0.72, wd.v], color: IN.beam });
      }
    }
  }
  // the gun deck's guns, run out through their ports
  const gs = d.gunScale || 1;
  for (const g of d.lowGuns || []) {
    k.save(); k.translate(xAt(d, g.t), d.holdY, g.v); k.rotateY(skinYaw(d, g.t, d.holdY + 1, g.s));
    cannon(k, P, g.s, gs);
    k.restore();
  }
  // the furniture (the rugs, the lanterns on the walls, and all) — but the
  // treasure chest in the hold, each ship's own (plundered, it's gone: ships3d.js)
  for (const it of d.furniture) if (!it.treasure) furniture(k, d, P, it);
  rake(k, d); rake(overhead, d);
  return { k, overhead };
}
/** The treasure chest in a big ship's hold, on its own (or null), and where it stands: { k, at: [u, floor, v] }. */
export function bigTreasure(def, d) {
  const it = d.furniture.find((f) => f.treasure);
  if (!it) return null;
  const k = new Mesher();
  furniture(k, d, bigPalette(def), it);
  return { k, at: [it.u, it.floor + (it.y || 0), it.v] };
}
