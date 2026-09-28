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
import { hbAt, topAt, xAt, floorAt, skinAt, innerAt, hullProfile, roomHalf } from '../world/hull.js';

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
  bigFigurehead(k, def, d, P);
  return k;
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
  // the inside of the stern, across the transom
  const ys = floorAt(d, 0.01), ts = topAt(d, 0) - 0.1;
  k.add(box(0.2, ts - ys + 0.04, innerAt(d, 0.01, (ys + ts) / 2) * 2 + 0.1), { at: [xAt(d, 0) + 0.1, ys - 0.02, 0], color: shade(P.upper, -0.12) });
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
  deckGrid(k, d, P, d.poop ? d.tp - 0.004 : 0.012, d.tq + 0.006, d.yq);
  if (d.poop) deckGrid(k, d, P, 0.012, d.tp + 0.006, d.yp);
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

/** A pyramid of cannonballs in a wooden rack (a shot garland). */
export function shotPile(k, P, r = 0.075) {
  k.add(box(r * 7.4, 0.08, r * 5.4), { color: P.wood, outline: 0.008 });
  const ball = new THREE.SphereGeometry(r, 8, 6);
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
  // a pile of shot by the mainmast (or amidships)
  {
    const m = d.mastU.find((u) => u > xAt(d, d.tq) + 1 && u < xAt(d, d.fore ? d.tf : 0.9) - 1);
    const u = m !== undefined ? m - d.mastR - 0.95 : xAt(d, (d.tq + (d.fore ? d.tf : 0.9)) / 2);
    const t = (u + d.L / 2) / d.L;
    if (u > d.comp.u1 + 0.4 || u < d.comp.u0 - 0.9) { k.save(); k.translate(u, d.deckY, 0); shotPile(k, P); k.restore(); }
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
      k.add(box(0.06, y1 - y0, ww), { at: [x0, y0, z], color: P.glass, glow: '#ffc766' });
      k.add(box(0.08, 0.08, ww + 0.14), { at: [x0 - 0.01, y1, z], color: P.trim });
      k.add(box(0.08, 0.08, ww + 0.14), { at: [x0 - 0.01, y0 - 0.08, z], color: P.trim });
    }
    // a gilded moulding under each row of windows
    k.add(box(0.1, 0.12, w * 2 + 0.2), { at: [x0 - 0.02, y0 - 0.34, 0], color: P.trim });
  };
  rowAt(d.deckY + 0.75, d.deckY + 1.65);
  if (d.poop) rowAt(d.yq + 0.6, d.yq + 1.45);
  // the taffrail and three great stern lanterns
  const ty = topAt(d, 0.01);
  k.add(box(0.14, 0.18, half(ty) * 2 + 0.1), { at: [x0 - 0.02, ty - 0.2, 0], color: P.trim, outline: 0.015 });
  for (const z of [-0.62, 0, 0.62]) {
    const lz = z * half(ty), ly = ty + (z ? 0 : 0.3);
    k.add(cyl(0.04, 0.04, 0.6, 5), { at: [-d.L / 2 + 0.25, ly, lz], color: P.dark });
    k.add(cyl(0.16, 0.19, 0.45, 8), { at: [-d.L / 2 + 0.25, ly + 0.6, lz], color: '#fff3c4', glow: '#ffcf70', flicker: 0.2, outline: 0.012 });
    k.add(cone(0.22, 0.24, 8), { at: [-d.L / 2 + 0.25, ly + 1.05, lz], color: P.trim, outline: 0.01 });
  }
  // quarter galleries: glazed bays bulging from the stern corners
  for (const s of [-1, 1]) {
    const t = 0.055, y0 = d.deckY + 0.55, y1 = (d.poop ? d.yq + 1.5 : d.deckY + 1.9);
    const w = skinAt(d, t, (y0 + y1) / 2);
    const len = d.L * 0.07;
    k.add(box(len, y1 - y0, 0.5), { at: [xAt(d, t), y0, s * (w + 0.1)], color: P.upper, outline: 0.02 });
    k.add(box(len * 0.8, (y1 - y0) * 0.55, 0.06), { at: [xAt(d, t), y0 + (y1 - y0) * 0.22, s * (w + 0.36)], color: P.glass, glow: '#ffc766' });
    k.add(cone(0.42, 0.9, 6), { at: [xAt(d, t), y0, s * (w + 0.12)], rot: [Math.PI, 0, 0], scale: [len * 1.1, 1, 0.9], color: P.trim, outline: 0.015 });
    k.add(cone(0.42, 0.7, 6), { at: [xAt(d, t), y1, s * (w + 0.12)], scale: [len * 1.1, 1, 0.9], color: P.cap, outline: 0.015 });
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

function cabinFront(k, d, P, t, y0, y1, face, doors, stairsHere) {
  // `face`: +1 the front faces forward (the cabin is aft of it), -1 aft (the forecastle)
  const x = xAt(d, t) + face * 0.07;
  const w = innerAt(d, t, (y0 + y1) / 2) + 0.05;
  const h = y1 - y0, dh = Math.min(2.05, h - 0.12);
  // the wall, in pieces round its doorways (you walk in through them)
  const ds = [...doors].sort((a, b) => a.v - b.v);
  let z = -w;
  const piece = (za, zb) => { if (zb - za > 0.02) k.add(box(0.14, h, zb - za), { at: [x - face * 0.07, y0, (za + zb) / 2], color: P.front, outline: 0.02 }); };
  for (const dr of ds) { piece(z, dr.v - dr.w / 2); z = dr.v + dr.w / 2; }
  piece(z, w);
  for (const dr of ds) {
    // the lintel over the doorway, its frame and a door swung open inside
    k.add(box(0.14, h - dh, dr.w), { at: [x - face * 0.07, y0 + dh, dr.v], color: P.front });
    for (const e of [-1, 1]) k.add(box(0.1, dh, 0.08), { at: [x + face * 0.02, y0, dr.v + e * (dr.w / 2 + 0.02)], color: P.trim, outline: 0.008 });
    k.add(box(0.1, 0.12, dr.w + 0.24), { at: [x + face * 0.03, y0 + dh, dr.v], color: P.trim });
    // (the door stands open, folded back flat against the inside of the wall, on whichever side has room)
    const lw = dr.w - 0.1, right = w - (dr.v + dr.w / 2), left = (dr.v - dr.w / 2) + w, sd = right >= left ? 1 : -1;
    const room = Math.max(right, left) - 0.12;
    if (room > 0.3) k.add(box(0.05, dh - 0.06, Math.min(lw, room)), { at: [x - face * 0.19, y0 + 0.02, dr.v + sd * (dr.w / 2 + Math.min(lw, room) / 2 + 0.04)], color: shade(P.dark, 0.25), outline: 0.008 });
    // a lantern beside the door
    const lz = dr.v + (dr.v > 0 ? -1 : 1) * (dr.w / 2 + 0.3);
    if (Math.abs(lz) < w - 0.2) k.add(cyl(0.1, 0.12, 0.32, 6), { at: [x + face * 0.14, y0 + 1.75, lz], color: '#fff3c4', glow: '#ffcf70', flicker: 0.25, outline: 0.01 });
  }
  // pilasters and a moulding under the deck above
  for (const zz of [-w + 0.1, w - 0.1]) k.add(box(0.1, h, 0.16), { at: [x, y0, zz], color: shade(P.front, -0.25) });
  k.add(box(0.12, 0.14, w * 2), { at: [x + face * 0.02, y1 - 0.18, 0], color: P.trim });
  const clearOfStairs = (zz, half) => !stairsHere.some((st) => zz + half > st.va - 0.1 && zz - half < st.vb + 0.1);
  // windows either side of the doors
  if (h > 1.8) {
    for (let zz = -w + 0.75; zz <= w - 0.75; zz += 1.15) {
      if (ds.some((dr) => Math.abs(zz - dr.v) < dr.w / 2 + 0.5) || !clearOfStairs(zz, 0.4)) continue;
      k.add(box(0.06, 0.8, 0.62), { at: [x + face * 0.02, y0 + 0.95, zz], color: P.glass, glow: '#ffc766' });
      k.add(box(0.08, 0.07, 0.76), { at: [x + face * 0.03, y0 + 1.75, zz], color: P.trim });
      k.add(box(0.08, 0.07, 0.76), { at: [x + face * 0.03, y0 + 0.88, zz], color: P.trim });
    }
  }
}

function cabinFronts(k, d, P) {
  const on = (lvlA, lvlB) => d.stairs.filter((s) => (s.la === lvlA && s.lb === lvlB) || (s.la === lvlB && s.lb === lvlA));
  const inStair = (list) => (z) => list.some((s) => z > s.va - 0.05 && z < s.vb + 0.05);
  const room = (kind) => d.rooms.find((r) => r.kind === kind);
  // the great cabin under the quarterdeck
  const q = on('quarter', 'main');
  cabinFront(k, d, P, d.tq, d.deckY, d.yq, 1, room('cabin').doors, q);
  balustrade(k, d, P, d.tq + 0.004, d.yq, inStair(q));
  // the captain's cabin under the poop
  if (d.poop) {
    const pp = on('poop', 'quarter');
    cabinFront(k, d, P, d.tp, d.yq, d.yp, 1, room('captain').doors, pp);
    balustrade(k, d, P, d.tp + 0.004, d.yp, inStair(pp));
  }
  // the forecastle, facing aft
  if (d.fore) {
    const f = on('main', 'fore');
    cabinFront(k, d, P, d.tf, d.deckY, d.yf, -1, room('forecastle').doors, f);
    balustrade(k, d, P, d.tf - 0.004, d.yf, inStair(f));
  }
}

// ---------------------------------------------------------------- stairs
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
      const top = Math.min(s.ha, s.hb) + rise * (i + 1) / n;
      k.add(box(Math.abs(x1 - x0) + 0.02, 0.07, w - 0.1), { at: [(x0 + x1) / 2, top - 0.07, zc], color: shade(P.deck, -0.05), outline: 0.01 });
      k.add(box(0.04, top - Math.min(s.ha, s.hb) - 0.02, w - 0.14), { at: [lowEnd === 'a' ? x0 : x1, Math.min(s.ha, s.hb), zc], color: shade(P.deck, -0.3) });
    }
    // the stringer and the handrail on the open (inboard) side
    const inb = s.s > 0 ? s.va : s.vb;
    const lo = s.ha < s.hb ? [xa, s.ha] : [xb, s.hb], hi = s.ha < s.hb ? [xb, s.hb] : [xa, s.ha];
    const len = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]), ang = Math.atan2(hi[1] - lo[1], hi[0] - lo[0]);
    k.save(); k.translate((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, inb); k.rotateZ(ang);
    k.add(box(len, 0.28, 0.08), { at: [0, -0.3, 0], color: P.wood, outline: 0.012 });
    k.add(box(len, 0.07, 0.09), { at: [0, 0.88, 0], color: P.cap, outline: 0.01 });
    k.restore();
    for (let i = 0; i <= 3; i++) {
      const f = i / 3;
      k.add(cyl(0.035, 0.035, 0.9, 5), { at: [lo[0] + (hi[0] - lo[0]) * f, lo[1] + (hi[1] - lo[1]) * f, inb], color: P.wood });
    }
  }
}

/** The way down to the hold: a flight of steps (or a ladder) through a railed opening in the main deck. */
function companionway(k, d, P, s) {
  const xa = xAt(d, s.ta), xb = xAt(d, s.tb), w = s.vb - s.va, lo = s.ha, hi = s.hb;
  const len = Math.hypot(xb - xa, hi - lo), ang = Math.atan2(hi - lo, xb - xa);
  // the coaming round the opening, and a rail along its sides and after end (its head is open)
  const cz = w / 2 + 0.06;
  for (const e of [-1, 1]) k.add(box(xb - xa + 0.12, 0.18, 0.1), { at: [(xa + xb) / 2, d.deckY, e * cz], color: shade(P.deck, -0.3), outline: 0.01 });
  k.add(box(0.1, 0.18, w + 0.22), { at: [xa - 0.05, d.deckY, 0], color: shade(P.deck, -0.3), outline: 0.01 });
  const rail = (za, zb, x0, x1) => {
    k.add(box(Math.max(0.08, x1 - x0), 0.07, Math.max(0.08, zb - za)), { at: [(x0 + x1) / 2, d.deckY + 0.95, (za + zb) / 2], color: P.cap, outline: 0.01 });
  };
  for (const e of [-1, 1]) {
    rail(e * cz - 0.04, e * cz + 0.04, xa - 0.05, xb);
    for (let i = 0; i <= 3; i++) k.add(cyl(0.035, 0.04, 0.95, 5), { at: [xa + (xb - xa) * i / 3, d.deckY, e * cz], color: P.wood });
  }
  rail(-cz, cz, xa - 0.09, xa - 0.01);
  if (s.ladder) {
    // a steep ladder: two sloping rails and rungs
    for (const e of [-1, 1]) {
      k.save(); k.translate((xa + xb) / 2, (lo + hi) / 2, e * (w / 2 - 0.08)); k.rotateZ(ang);
      k.add(box(len + 0.1, 0.1, 0.06), { color: P.wood, outline: 0.01 });
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
    k.add(box(0.03, (hi - lo) / n, w - 0.1), { at: [x0, top - (hi - lo) / n, 0], color: shade(P.deck, -0.3) });
  }
  for (const e of [-1, 1]) {
    k.save(); k.translate((xa + xb) / 2, (lo + hi) / 2, e * (w / 2 - 0.02)); k.rotateZ(ang);
    k.add(box(len, 0.26, 0.07), { at: [0, -0.28, 0], color: P.wood, outline: 0.01 });
    k.add(box(len, 0.06, 0.07), { at: [0, 0.85, 0], color: P.cap, outline: 0.008 });
    k.restore();
  }
}

/**
 * The ship's wheel on its pedestal, turning fore and aft (the helmsman stands
 * aft of it): the rim, eight spokes running out through it to turned
 * handles, the brass hub. `hub`: the axle's height over the deck.
 */
export function helmWheel(k, P, x, y, R = 0.56, hub = 0.92) {
  // the pedestal: a stout post and the barrel the tiller ropes wind round
  k.add(box(0.26, hub + 0.1, 0.34), { at: [x + 0.2, y, 0], color: P.wood, outline: 0.012 });
  k.add(cyl(0.15, 0.15, 0.62, 10), { at: [x + 0.2, y + hub - 0.08, -0.31], rot: [Math.PI / 2, 0, 0], color: shade(P.wood, 0.15), outline: 0.01 });
  k.add(cyl(0.045, 0.045, 0.3, 6), { at: [x + 0.05, y + hub, 0], rot: [0, 0, Math.PI / 2], color: P.dark });
  k.save(); k.translate(x, y + hub, 0); k.rotateY(Math.PI / 2);
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
  helmWheel(k, P, d.wheelU, d.yq);
  if (d.binnacleU !== null) {
    const fy = d.yq;
    k.add(box(0.45, 0.95, 0.45), { at: [d.binnacleU, fy, 0], color: P.wood, outline: 0.012 });
    k.add(new THREE.SphereGeometry(0.2, 10, 6, 0, TAU, 0, Math.PI / 2), { at: [d.binnacleU, fy + 0.95, 0], color: '#cfe8ef', glow: '#fff1c1' });
  }
  // fife rails round each mast
  for (const u of d.mastU) {
    const t = (u + d.L / 2) / d.L, fl = floorAt(d, t), rr = d.mastR + 0.42;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      k.add(box(a ? 0.1 : rr * 2, 0.08, b ? 0.1 : rr * 2), { at: [u + a * rr, fl + 0.72, b * rr], color: P.wood, outline: 0.01 });
      for (const q of [-0.5, 0, 0.5]) k.add(cyl(0.04, 0.05, 0.72, 5), { at: [u + a * rr + (b ? q * rr * 1.6 : 0), fl, b * rr + (a ? q * rr * 1.6 : 0)], color: P.wood });
    }
  }
  // the belfry at the forecastle's after rail, looking down on the main deck
  if (d.fore) {
    const x = xAt(d, d.tf + 0.03), y = d.yf;
    for (const z of [-0.45, 0.45]) k.add(box(0.12, 1.5, 0.12), { at: [x, y, z], color: P.wood, outline: 0.01 });
    k.add(cone(0.85, 0.5, 4), { at: [x, y + 1.5, 0], rot: [0, Math.PI / 4, 0], color: P.cap, outline: 0.012 });
    k.add(lathe([[0.2, 0], [0.16, 0.1], [0.12, 0.3], [0.1, 0.36], [0.01, 0.38]], 10), { at: [x, y + 0.95, 0], color: P.trim });
  }
  // catted anchors at the bow
  for (const s of [-1, 1]) {
    const t = 0.9, y = topAt(d, t) - 1.1, z = s * (skinAt(d, t, y) + 0.2);
    const a = 1.6 + d.B * 0.08;
    k.add(cyl(0.07, 0.07, a, 6), { at: [xAt(d, t), y - a * 0.6, z], color: P.iron, outline: 0.012 });
    k.add(torus(a * 0.28, 0.07, 5, 10, Math.PI), { at: [xAt(d, t), y - a * 0.6, z], rot: [0, 0, Math.PI], color: P.iron, outline: 0.012 });
    k.add(box(0.12, 0.12, 0.9), { at: [xAt(d, t), topAt(d, t) - 0.25, z * 0.8], color: P.wood });
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
function bigFigurehead(k, def, d, P) {
  const L = d.L, B = d.B;
  const stem = [L / 2 - 0.1, d.fore ? d.deckY + d.hf * 0.35 : d.deckY + 0.35];
  const fh = def.figurehead;
  const s = B / 7 * (fh === 'seagull' || fh === 'whale' ? 1 : 1.5);
  if (fh === 'ram' || fh === 'lion') {
    // the Going Merry's sheep, the Thousand Sunny's sunflower lion: big and
    // round, up on the stem head where the crew sit on them
    const tip = [L / 2, topAt(d, 1)];
    const g = B / 2.3;
    if (fh === 'ram') {
      k.add(cyl(0.12 * g, 0.16 * g, 0.6 * g, 8), { at: [tip[0] - 0.12 * g, tip[1] - 0.25 * g, 0], rot: [0, 0, -0.5], color: '#f5f6fa', outline: 0.02 });
      const hc = [tip[0] + 0.28 * g, tip[1] + 0.42 * g, 0];
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
      k.add(cyl(0.14 * g, 0.2 * g, 0.7 * g, 8), { at: [tip[0] - 0.15 * g, tip[1] - 0.25 * g, 0], rot: [0, 0, -0.45], color: '#e8c26b', outline: 0.02 });
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
    k.add(new THREE.SphereGeometry(1, 28, 18, 0, TAU, 0, Math.PI), { at: [cx, cy, 0], scale: [B * 0.66, ry, rz], color: white, outline: 0.06 });
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
    k.add(cyl(0.3 * g, 0.45 * g, 1.3 * g, 8), { at: [stem[0] - 0.2, stem[1] - 0.4, 0], rot: [0, 0, -0.6], color: '#f5f6fa', outline: 0.03 });
    k.add(new THREE.SphereGeometry(0.75 * g, 14, 10), { at: hc, color: '#f5f6fa', outline: 0.04 });
    k.add(cone(0.26 * g, 1.1 * g, 8), { at: [hc[0] + 0.55 * g, hc[1] - 0.12 * g, 0], rot: [0, 0, -Math.PI / 2], color: '#f5a623', outline: 0.02 });
    for (const z of [-1, 1]) k.add(new THREE.SphereGeometry(0.12 * g, 8, 6), { at: [hc[0] + 0.36 * g, hc[1] + 0.25 * g, z * 0.5 * g], color: '#1d1d1d' });
    k.add(new THREE.CylinderGeometry(0.5 * g, 0.66 * g, 0.26 * g, 12), { at: [hc[0] - 0.05, hc[1] + 0.75 * g, 0], color: '#1b4f72', outline: 0.02 });
    return;
  }
  if (fh === 'dragon') {
    // a green dragon rearing from the stem, jaws open
    const green = '#2e7d32', gold = '#e8c26b';
    const neck = new THREE.CatmullRomCurve3([
      new THREE.Vector3(stem[0] - 0.4, stem[1] - 0.6 * s, 0), new THREE.Vector3(stem[0] + 0.5 * s, stem[1] + 0.2 * s, 0),
      new THREE.Vector3(stem[0] + 0.7 * s, stem[1] + 1.2 * s, 0), new THREE.Vector3(stem[0] + 1.2 * s, stem[1] + 1.8 * s, 0),
    ]);
    k.add(tube(neck, 12, 0.34 * s, 8), { color: green, outline: 0.03 });
    const hc = [stem[0] + 1.45 * s, stem[1] + 2.0 * s, 0];
    k.add(new THREE.SphereGeometry(0.5 * s, 12, 9), { at: hc, scale: [1.2, 0.85, 0.85], color: green, outline: 0.03 });
    k.add(box(0.9 * s, 0.28 * s, 0.5 * s), { at: [hc[0] + 0.55 * s, hc[1] - 0.05 * s, 0], color: green, outline: 0.02 });
    k.add(box(0.8 * s, 0.14 * s, 0.44 * s), { at: [hc[0] + 0.45 * s, hc[1] - 0.42 * s, 0], rot: [0, 0, -0.35], color: '#1b5e20', outline: 0.02 });
    for (const z of [-1, 1]) {
      k.add(cone(0.1 * s, 0.75 * s, 6), { at: [hc[0] - 0.2 * s, hc[1] + 0.25 * s, z * 0.25 * s], rot: [z * 0.5, 0, 1.9], color: gold, outline: 0.015 });
      k.add(new THREE.SphereGeometry(0.1 * s, 8, 6), { at: [hc[0] + 0.25 * s, hc[1] + 0.22 * s, z * 0.36 * s], color: '#ffd54f', glow: '#ffb300' });
      for (let i = 0; i < 3; i++) k.add(cone(0.035 * s, 0.14 * s, 4), { at: [hc[0] + (0.75 - i * 0.2) * s, hc[1] - 0.2 * s, z * 0.2 * s], rot: [Math.PI, 0, 0], color: '#ffffff' });
    }
    for (let i = 0; i < 5; i++) k.add(cone(0.12 * s, 0.35 * s, 4), { at: [stem[0] + (0.3 + i * 0.25) * s, stem[1] + (0.1 + i * 0.45) * s, 0], rot: [0, 0, 0.6], color: gold });
    return;
  }
  if (fh === 'lion_gold') {
    const hc = [stem[0] + 0.7 * s, stem[1] + 1.2 * s, 0];
    k.add(cyl(0.3 * s, 0.42 * s, 1.4 * s, 8), { at: [stem[0] - 0.3, stem[1] - 0.5, 0], rot: [0, 0, -0.5], color: '#c9a227', outline: 0.03 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      k.save(); k.translate(hc[0] - 0.18 * s, hc[1], 0); k.rotateX(a);
      k.add(cone(0.34 * s, 0.85 * s, 6), { at: [0, 0.72 * s, 0], color: i % 2 ? '#e0b12b' : '#c9962a', outline: 0.02 });
      k.restore();
    }
    k.add(new THREE.SphereGeometry(0.85 * s, 14, 10), { at: hc, scale: [0.75, 1, 1], color: '#f2cc4a', outline: 0.04 });
    for (const z of [-1, 1]) k.add(new THREE.SphereGeometry(0.13 * s, 8, 6), { at: [hc[0] + 0.58 * s, hc[1] + 0.22 * s, z * 0.32 * s], color: '#1d1d1d' });
    k.add(new THREE.SphereGeometry(0.17 * s, 8, 6), { at: [hc[0] + 0.66 * s, hc[1] - 0.1 * s, 0], color: '#8d5524' });
    return;
  }
  if (fh === 'mermaid') {
    // a gilded mermaid leaning out under the bowsprit, her tail curled along the stem
    const skin = '#f2d5b8', hair = '#e6b422', tail = '#2a9d8f';
    const body = [stem[0] + 0.5 * s, stem[1] + 0.9 * s, 0];
    k.add(cyl(0.2 * s, 0.26 * s, 0.9 * s, 8), { at: [body[0], body[1] - 0.45 * s, 0], rot: [0, 0, -0.55], color: skin, outline: 0.02 });
    k.add(new THREE.SphereGeometry(0.22 * s, 10, 8), { at: [body[0] + 0.45 * s, body[1] + 0.45 * s, 0], color: skin, outline: 0.02 });
    k.add(new THREE.SphereGeometry(0.26 * s, 10, 8), { at: [body[0] + 0.36 * s, body[1] + 0.52 * s, 0], scale: [1.1, 1, 1.05], color: hair, outline: 0.02 });
    k.add(cyl(0.06 * s, 0.06 * s, 0.7 * s, 5), { at: [body[0] + 0.2 * s, body[1] + 0.2 * s, 0.22 * s], rot: [0, 0, -1.1], color: skin });
    const tl = new THREE.CatmullRomCurve3([
      new THREE.Vector3(body[0] - 0.2 * s, body[1] - 0.8 * s, 0), new THREE.Vector3(stem[0] - 0.2, stem[1] - 0.6 * s, 0),
      new THREE.Vector3(stem[0] - 0.7, stem[1] - 1.3 * s, 0), new THREE.Vector3(stem[0] - 0.9, stem[1] - 2.0 * s, 0),
    ]);
    k.add(tube(tl, 12, 0.2 * s, 8), { color: tail, outline: 0.02 });
    k.add(cone(0.35 * s, 0.5 * s, 4), { at: [stem[0] - 0.9, stem[1] - 2.3 * s, 0], rot: [Math.PI, 0, 0], scale: [1, 1, 0.3], color: tail });
    return;
  }
  // a carved scroll at the stem head
  k.add(torus(0.3, 0.1, 5, 10, Math.PI * 1.5), { at: [stem[0] + 0.1, stem[1] + 0.3, 0], color: P.trim, outline: 0.015 });
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
export function bigBowTip(d) {
  const a = 0.3, len = d.L * 0.28;
  const x0 = d.L / 2 - 0.6, y0 = (d.bowY ?? d.yf) + 0.4;
  return { x0, y0, a, len, tip: [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len] };
}

export function bigSailPlan(def, d, mast) {
  const sails = [];
  const wC = Math.min(d.B * 2.05, d.L * 0.5) * (mast.aft ? 0.8 : 1);
  const yr = 0.06 + d.L * 0.0025;
  if (mast.aft) {
    // the spanker: a big fore-and-aft sail aft of the mizzen
    sails.push({ type: 'gaff', x: mast.x, y0: mast.base + 2.3, y1: mast.h1 - 0.3, len: Math.min(d.L * 0.2, 8) });
  } else {
    sails.push({ type: 'square', x: mast.x, w: wC, y0: mast.base + 2.7, y1: mast.h1 - 0.35, emblem: mast.main, yardR: yr });
  }
  sails.push({ type: 'square', x: mast.x, w: wC * 0.82, y0: mast.h1 + 0.5, y1: mast.h2 - 0.35, emblem: mast.fore && def.sail === 'marine', yardR: yr * 0.85 });
  sails.push({ type: 'square', x: mast.x, w: wC * 0.62, y0: mast.h2 + 0.35, y1: mast.h - 0.7, yardR: yr * 0.7 });
  if (mast.fore) {
    const b = bigBowTip(d);
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
    }
    // rope hoops up the lower mast
    for (let y = m.base + 1.6; y < m.h1 - 1; y += 1.4) k.add(torus(r * 1.05, 0.04, 3, 10), { at: [m.x, y, 0], rot: [Math.PI / 2, 0, 0], color: '#c8b89a' });
  }
  // the bowsprit and jibboom
  const b = bigBowTip(d);
  k.save(); k.translate(b.x0, b.y0, 0); k.rotateZ(-Math.PI / 2 + b.a);
  k.add(cyl(0.12 + d.L * 0.003, 0.2 + d.L * 0.006, b.len * 0.7, 8), { color: wood, outline: 0.02 });
  k.add(cyl(0.08, 0.12 + d.L * 0.003, b.len * 0.45, 7), { at: [0, b.len * 0.6, 0], color: wood, outline: 0.015 });
  k.restore();
  // a flagstaff at the taffrail for the ensign
  const ty = topAt(d, 0.01);
  k.add(cyl(0.05, 0.08, 3.4, 6), { at: [-d.L / 2 + 0.5, ty, 0], rot: [0, 0, 0.18], color: dark, outline: 0.012 });
  return k.build(true);
}

/** Shrouds with ratlines, stays and backstays (line segment positions). */
export function bigRigging(d, plan) {
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
  const b = bigBowTip(d);
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
  Ln([b.tip[0] - b.len * 0.3, b.tip[1] - b.len * 0.3 * Math.tan(b.a), 0], [d.L / 2 - 0.3, 0.3, 0]);
  return pts;
}

// ---------------------------------------------------------------- below decks, and in the cabins
// (a separate mesh: it's only drawn when you're close by — see ShipView)
const IN = { wall: C('#8a6445'), wall2: C('#7d5a3d'), beam: C('#5b3d26'), floor: C('#a57b52'), dark: C('#3e2a1c'), cloth: C('#c9b99a') };

/** The inside of a room's sides (the hull's lining), from its floor up to the deck over it. */
function lining(k, d, r, top) {
  const N = Math.max(4, Math.round((r.t1 - r.t0) * d.L / 0.5));
  const hold = r.kind === 'hold';
  const ys = hold ? [r.floor - 0.02, r.floor + 0.55, r.floor + 1.15, r.floor + 1.75, top] : [r.floor - 0.02, r.floor + 0.9, top];
  for (const s of [1, -1]) {
    const pos = [], idx = [], cols = [];
    for (let i = 0; i <= N; i++) {
      const t = r.t0 + (r.t1 - r.t0) * i / N, x = xAt(d, t);
      for (const y of ys) pos.push(x, y, s * (hold ? Math.max(0.3, skinAt(d, t, y) - 0.22) : innerAt(d, t, y) + 0.01));
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

/** A lantern on an iron bracket on the wall (s: which side), above head height. */
function lantern(k, x, y, z, s) {
  k.add(box(0.06, 0.06, 0.26), { at: [x, y + 0.1, z - s * 0.13], color: '#2b1d14' });
  k.add(cyl(0.012, 0.012, 0.12, 4), { at: [x, y - 0.02, z - s * 0.24], color: '#2b1d14' });
  k.add(cyl(0.08, 0.09, 0.22, 6), { at: [x, y - 0.26, z - s * 0.24], color: '#fff3c4', glow: '#ffcf70', flicker: 0.25, outline: 0.006 });
  k.add(cone(0.11, 0.09, 6), { at: [x, y - 0.05, z - s * 0.24], color: '#2b1d14' });
}

/** One piece of furniture (see hull.js furnish): at (u, floor, v). */
function furniture(k, d, P, it) {
  const { u: x, v: z, floor: y, w, dp } = it;
  const wood = IN.beam, top = C('#8d6038');
  switch (it.kind) {
    case 'table': case 'desk': {
      const h = 0.76;
      k.add(box(w, 0.06, dp), { at: [x, y + h - 0.06, z], color: top, outline: 0.01 });
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(box(0.07, h - 0.06, 0.07), { at: [x + a * (w / 2 - 0.08), y, z + b * (dp / 2 - 0.08)], color: wood });
      if (it.kind === 'desk') {
        for (const a of [-1, 1]) k.add(box(w * 0.3, h - 0.12, dp - 0.1), { at: [x + a * w * 0.3, y, z], color: wood, outline: 0.008 });
        for (let i = 0; i < 4; i++) k.add(box(0.05, 0.22, 0.16), { at: [x - w * 0.3 + i * 0.07, y + h, z - dp * 0.3], color: ['#8e2b20', '#23527c', '#2e6b2e', '#6a4c93'][i] });
      }
      if (it.room !== 'forecastle') {
        // a chart spread out, dividers, and a candle
        k.add(box(w * 0.55, 0.005, dp * 0.6), { at: [x - w * 0.05, y + h, z], rot: [0, 0.08, 0], color: '#e8dcb5' });
        k.add(cyl(0.035, 0.035, 0.12, 6), { at: [x + w * 0.33, y + h, z + dp * 0.25], color: '#f5f0e1', glow: '#ffcf70', flicker: 0.4 });
      } else {
        for (const a of [-0.3, 0.2]) k.add(cyl(0.05, 0.04, 0.1, 6), { at: [x + a * w, y + h, z], color: '#8d8d8d' });
      }
      break;
    }
    case 'chair': {
      const s = it.rot || 1;
      k.add(box(0.42, 0.05, 0.42), { at: [x, y + 0.44, z], color: top, outline: 0.008 });
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(box(0.05, 0.44, 0.05), { at: [x + a * 0.17, y, z + b * 0.17], color: wood });
      k.add(box(0.42, 0.5, 0.05), { at: [x, y + 0.49, z + s * 0.19], color: wood, outline: 0.008 });
      break;
    }
    case 'bunk': {
      // (along the side: w along the ship, dp across)
      k.add(box(w, 0.4, dp), { at: [x, y, z], color: wood, outline: 0.01 });
      k.add(box(w - 0.1, 0.14, dp - 0.1), { at: [x, y + 0.4, z], color: '#e8e1d0' });
      k.add(box(w * 0.62, 0.04, dp - 0.06), { at: [x + w * 0.16, y + 0.54, z], color: '#8e3b2a' });
      k.add(box(0.36, 0.1, dp * 0.6), { at: [x - w / 2 + 0.26, y + 0.54, z], color: '#f7f3ea' });
      k.add(box(w, 0.5, 0.06), { at: [x, y, z - Math.sign(z || 1) * (dp / 2 - 0.03)], color: wood });
      break;
    }
    case 'chest': {
      // a sea chest: iron-bound, a domed lid (a treasure chest shows its gold)
      const c = it.treasure ? C('#7a4a26') : C('#6d4c33');
      k.add(box(w, dp * 0.9, dp), { at: [x, y, z], color: c, outline: 0.01 });
      k.add(cyl(dp / 2, dp / 2, w, 10, false, 1), { at: [x - w / 2, y + dp * 0.9, z], rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.5], color: shade(c, 0.1), outline: 0.01 });
      for (const a of [-0.32, 0.32]) k.add(box(0.06, dp * 1.2, dp + 0.02), { at: [x + a * w, y, z], color: '#b8860b' });
      k.add(box(0.1, 0.12, 0.04), { at: [x, y + dp * 0.72, z + Math.sign(-z || 1) * (dp / 2 + 0.01)], color: '#d4ac0d' });
      if (it.treasure) for (let i = 0; i < 6; i++) k.add(cyl(0.04, 0.04, 0.015, 8), { at: [x - 0.2 + (i % 3) * 0.14, y + dp * 0.9 + 0.02 + Math.floor(i / 3) * 0.02, z + ((i * 7) % 3 - 1) * 0.08], color: '#f4c430', glow: '#6b4f00' });
      break;
    }
    case 'shelf': {
      k.add(box(0.35, 1.7, w), { at: [x, y, z], color: wood, outline: 0.01 });
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < Math.floor(w / 0.09); i++) k.add(box(0.2, 0.26 + ((i * 5 + j) % 3) * 0.03, 0.06), { at: [x + 0.02, y + 0.12 + j * 0.4, z - w / 2 + 0.08 + i * 0.09], color: ['#8e2b20', '#23527c', '#2e6b2e', '#b08850', '#6a4c93'][(i + j) % 5] });
      }
      break;
    }
    case 'stove': {
      k.add(box(w, 0.7, dp), { at: [x, y, z], color: '#2f2f2f', outline: 0.01 });
      k.add(box(w * 0.5, 0.25, 0.04), { at: [x, y + 0.2, z - Math.sign(z || 1) * (dp / 2 + 0.01)], color: '#ff7a1a', glow: '#ff5a00', flicker: 0.5 });
      k.add(cyl(0.08, 0.08, 1.6, 8), { at: [x, y + 0.7, z], color: '#2f2f2f' });
      k.add(cyl(0.2, 0.17, 0.26, 10), { at: [x, y + 0.7, z + Math.sign(-z || 1) * 0.1], color: '#6b6b6b', outline: 0.008 });
      break;
    }
    case 'hammock': {
      // slung between two hooks under the deck beams, sagging in the middle
      const hy = y + 1.35, pts = [];
      for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push(new THREE.Vector3(x - w / 2 + w * f, hy - Math.sin(f * Math.PI) * 0.3, z)); }
      k.add(tube(new THREE.CatmullRomCurve3(pts), 10, 0.2, 6), { scale: [1, 0.4, 1], at: [0, hy * 0.6, 0], color: IN.cloth, outline: 0.008 });
      break;
    }
    case 'barrel': case 'barrels': {
      const n = it.kind === 'barrels' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const bx = x + (n > 1 ? (i - 1) * 0.5 : 0), by = y + (i === 1 && n > 1 ? 0 : 0);
        k.add(lathe([[0.2, 0], [0.26, 0.18], [0.27, 0.36], [0.26, 0.54], [0.2, 0.72], [0.001, 0.72]], 10), { at: [bx, by, z], color: '#8d5b33', outline: 0.01 });
        for (const hy of [0.1, 0.62]) k.add(torus(0.235, 0.018, 4, 12), { at: [bx, by + hy, z], rot: [Math.PI / 2, 0, 0], color: '#3a3a3a' });
      }
      break;
    }
    case 'crate': {
      k.add(box(0.7, 0.62, 0.7), { at: [x, y, z], color: '#b08850', outline: 0.01 });
      k.add(box(0.5, 0.45, 0.5), { at: [x + 0.06, y + 0.62, z - 0.04], rot: [0, 0.3, 0], color: '#a57b52', outline: 0.01 });
      break;
    }
    case 'sacks': {
      for (let i = 0; i < 3; i++) k.add(new THREE.SphereGeometry(0.28, 8, 6), { at: [x + (i - 1) * 0.36, y + 0.22, z + (i % 2) * 0.1], scale: [1, 0.8, 0.9], color: '#d8c49a', outline: 0.008 });
      break;
    }
    case 'shot': {
      k.save(); k.translate(x, y, z); shotPile(k, P); k.restore();
      break;
    }
    default: break;
  }
}

export function bigInterior(def, d) {
  const P = bigPalette(def);
  const k = new Mesher();
  const cp = d.comp;
  for (const r of d.rooms) {
    const top = r.ceil + 0.1;     // (the deck over the room: its underside)
    // the floor (the cabin and forecastle floors are the main deck's, running in under the decks above)
    if (r.kind !== 'hold') deckGrid(k, d, P, r.t0, r.t1, r.floor, null, false, IN.floor);
    else deckGrid(k, d, P, r.t0, r.t1, r.floor, null, false, shade(IN.floor, -0.1));
    // the ceiling (open over the companionway)
    if (r.kind === 'hold') {
      deckGrid(k, d, P, r.t0, cp.t0, top, null, true, IN.wall);
      deckGrid(k, d, P, cp.t0, cp.t1, top, cp.w / 2, true, IN.wall);
      deckGrid(k, d, P, cp.t1, r.t1, top, null, true, IN.wall);
    } else deckGrid(k, d, P, r.t0, r.t1, top, null, true, IN.wall);
    lining(k, d, r, top);
    beams(k, d, r, top, r.kind === 'hold' ? (x) => x > cp.u0 - 0.2 && x < cp.u1 + 0.2 : null);
    // the ends
    if (r.kind === 'hold') { endWall(k, d, r.t0, r.floor, top, 1, true); endWall(k, d, r.t1, r.floor, top, -1, true); }
    else if (r.kind === 'forecastle') endWall(k, d, r.t1, r.floor, top, -1);
    else {
      // the stern: panelled, with the gallery windows glowing
      endWall(k, d, r.t0, r.floor, top, 1);
      const w = innerAt(d, r.t0, r.floor + 1);
      const n = Math.max(2, Math.floor((w * 2) / 1.15)), ww = Math.min(0.8, (w * 2) / n - 0.3);
      if (top - r.floor > 1.9) {
        for (let i = 0; i < n; i++) {
          // (the sea and sky beyond the glass: pale by day, lit from within by night)
          const zz = -w + (i + 0.5) * (w * 2) / n;
          k.add(box(0.04, 0.9, ww), { at: [xAt(d, r.t0) + 0.01, r.floor + 0.75, zz], color: '#a9d6ee', glow: '#ffd58a' });
          k.add(box(0.06, 0.05, ww), { at: [xAt(d, r.t0) + 0.02, r.floor + 1.18, zz], color: IN.beam });
          k.add(box(0.06, 0.9, 0.05), { at: [xAt(d, r.t0) + 0.02, r.floor + 0.75, zz], color: IN.beam });
          k.add(box(0.12, 0.06, ww + 0.1), { at: [xAt(d, r.t0) + 0.04, r.floor + 0.72, zz], color: IN.beam });
        }
      }
    }
    // lanterns on the walls, above head height
    const len = (r.t1 - r.t0) * d.L, nL = Math.max(1, Math.round(len / 3.5));
    for (let i = 0; i < nL; i++) {
      const t = r.t0 + (r.t1 - r.t0) * (i + 0.5) / nL, x = xAt(d, t), sd = i % 2 ? 1 : -1;
      const ly = Math.min(top - 0.2, r.floor + 2.05);
      const wz = r.kind === 'hold' ? Math.max(0.35, skinAt(d, t, ly) - 0.22) : innerAt(d, t, ly);
      if (d.furniture.some((f) => f.room === r.kind && Math.abs(f.u - x) < f.w / 2 + 0.3 && Math.sign(f.v) === sd && f.kind === 'shelf')) continue;
      lantern(k, x, ly, sd * wz, sd);
    }
    // a rug in the great cabin
    if (r.kind === 'cabin' || r.kind === 'captain') {
      const t = (r.t0 + r.t1) / 2, w = Math.min(1.1, roomHalf(d, r, t) - 0.3);
      k.add(box(Math.min(2.2, len * 0.55), 0.012, w * 2), { at: [xAt(d, t), r.floor + 0.004, 0], color: '#7b2d26' });
      k.add(box(Math.min(2.2, len * 0.55) - 0.2, 0.014, w * 2 - 0.2), { at: [xAt(d, t), r.floor + 0.004, 0], color: '#a8452f' });
    }
  }
  // the gun deck's guns, run out through their ports
  const gs = d.gunScale || 1;
  for (const g of d.lowGuns || []) {
    k.save(); k.translate(xAt(d, g.t), d.holdY, g.v); k.rotateY(skinYaw(d, g.t, d.holdY + 1, g.s));
    cannon(k, P, g.s, gs);
    k.restore();
  }
  for (const it of d.furniture) furniture(k, d, P, it);
  return k;
}
