// The shape of a ship's hull, shared by the 3D view (which builds it) and the
// game (which lets people walk its decks): the dimensions, the half-beam along
// the length, and the floor heights of the decks. Heights are metres above the
// waterline; t runs 0 (stern) → 1 (bow), v across (+ to starboard), u is
// metres forward of the middle.
//
// The big ships (everything but the rowboat, on One Piece's scale: a 20 m
// sloop up to a 62 m great galleon) are laid out like the real thing: a
// waist-high bulwark round the main deck, a quarterdeck over the great cabin
// aft (with a poop deck above that on the largest), a forecastle forward,
// stairs up to each along the rails, a hatch amidships with a ladder (or a
// companionway) down to the hold — and the masts, the capstan and the ship's
// boat are things you walk round.

import { swellAt, swellOn } from '../render3d/swell.js';
import { springStep } from '../core/math.js';
import { BOAT_FEEL } from '../game/boatFeel.js';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Ships this long or longer are the big ones (decks with stairs, cabins, a hold, walls and fittings). */
export const BIG_SHIP = 8;

const dimsCache = new Map();
/** Everything the hull, the rig and the camera need to agree on. */
export function shipDims(def) {
  if (def._dims) return def._dims;
  // (one plan for every ship of a shape: each ship's class, fitted out, is a copy of its own)
  const key = `${def.length}|${def.beam}|${def.masts}|${def.cannons}|${!!def.oarsOnly}`;
  let d = dimsCache.get(key);
  if (!d) { d = def.length >= BIG_SHIP ? bigDims(def) : smallDims(def); dimsCache.set(key, d); }
  Object.defineProperty(def, '_dims', { value: d, enumerable: false, configurable: true });
  return d;
}

function smallDims(def) {
  const L = def.length, B = def.beam;
  const open = L < 3.5; // the rowboat is an open boat
  const D = B * 0.42;
  const deckY = open ? 0.14 : 0.25 + B * 0.2;
  const bulH = open ? 0.36 : 0.3 + B * 0.07;
  const castle = L >= 5.5, fore = L >= 6.8;
  const hq = castle ? 0.85 + (L - 5.5) * 0.1 : 0;
  const hf = fore ? 0.5 : 0;
  const tq = castle ? 0.27 : 0, tf = fore ? 0.83 : 1;
  const masts = def.masts ?? 1;
  const mastH = masts ? 1.2 + L * 0.75 : 0;
  let helmX = -L * 0.42;
  const d = {
    L, B, D, open, deckY, bulH, castle, fore, hq, hf, tq, tf, masts, mastH, helmX,
    yq: deckY + hq, yf: deckY + hf,
    helmFloor: castle ? deckY + hq : deckY,
    big: false, poop: false, hp: 0, tp: 0, sheer: 0.16 * B, walk: 0.94, stairs: [], solids: [],
  };
  // the masts (you walk round them, and a camera keeps out of them) and the wheel's post
  d.mastU = masts ? Array.from({ length: masts }, (_, m) => (masts === 1 ? 0.05 * L : L * (0.28 - m * (0.56 / Math.max(1, masts - 1))))) : [];
  d.mastR = 0.05 + L * 0.011;
  d.solids = d.mastU.map((u) => ({ u, v: 0, r: d.mastR + 0.16 }));
  if (!open) {
    // the wheel on its post (wheelU: the wheel itself), aft of the mizzen mast
    // with room to stand at it; the helmsman just behind (no further aft than the stern)
    const aft = masts > 1 ? d.mastU[masts - 1] : Infinity;
    d.wheelU = Math.min(helmX + 1, aft - d.mastR - 0.35);
    d.helmX = helmX = Math.max(-L / 2 + 0.3, Math.min(helmX, d.wheelU - 1));
    d.solids.push({ u: d.wheelU + 0.1, v: 0, r: 0.2 });
  }
  if (def.oarsOnly) {
    // a rowboat: the rower sits on the thwart amidships facing the bow, and
    // the oars pivot in rowlocks on the gunwales a little ahead of them
    const seatT = 0.44, lockT = seatT + 0.4 / L;
    d.row = {
      seatT, seatU: xAt(d, seatT), seatH: 0.3, // (the top of the thwart, over the floor)
      lockT, lockU: xAt(d, lockT), lockV: hbAt(lockT, B) * 0.965, lockH: topAt(d, lockT) + 0.04,
      inboard: 0.56, outboard: 1.5,
    };
    d.helmX = helmX = d.row.seatU;
  }
  return d;
}

/**
 * A rowboat's oar at stroke phase `ph` (0..1: the catch, the drive, the
 * release, the swing forward again) for `pull` 1 (rowing ahead) or -1
 * (backing water): { a (the sweep round the rowlock, + blade forward), b (the
 * dip, + blade down), f (the feather: 0 blade square, 1 laid flat) }.
 */
export const OAR = { catchA: 0.6, finishA: -0.3, dipB: 0.52, liftB: 0.2 };
const ease = (k) => k * k * (3 - 2 * k);
export function oarStroke(ph, pull = 1) {
  const { catchA: ca, finishA: fa, dipB, liftB } = OAR;
  let a, b, f;
  if (ph < 0.08) { const k = ease(ph / 0.08); a = ca; b = liftB + (dipB - liftB) * k; f = 0; }
  else if (ph < 0.52) { a = ca + (fa - ca) * ease((ph - 0.08) / 0.44); b = dipB; f = 0; }
  else if (ph < 0.6) { const k = ease((ph - 0.52) / 0.08); a = fa; b = dipB + (liftB - dipB) * k; f = k; }
  else { const k = (ph - 0.6) / 0.4; a = fa + (ca - fa) * ease(k); b = liftB + Math.sin(k * Math.PI) * 0.05; f = k < 0.8 ? 1 : 1 - ease((k - 0.8) / 0.2); }
  // backing water: the same stroke run the other way round (in at the stern, swept forward)
  if (pull < 0) a = ca + fa - a;
  return { a, b, f };
}
/**
 * How far a rowboat's rower leans (radians, + forward) with her oars as they
 * lie: sitting back with the hands at the chest at the catch, forward with
 * the arms out at the finish.
 */
export function rowLean(ship) {
  const o = ship.oars;
  if (!o) return 0;
  const k = clamp01((OAR.catchA - (o[0].a + o[1].a) / 2) / (OAR.catchA - OAR.finishA));
  return -0.08 + 0.44 * k;
}

/** How hard a stroke drives at phase `ph` (0 out of the water, 1 mid-drive). */
export const oarDrive = (ph) => (ph < 0.08 || ph > 0.52 ? 0 : Math.sin(((ph - 0.08) / 0.44) * Math.PI));

/**
 * Where an oar's grip and blade are for sweep a and dip b (see oarStroke),
 * in the boat's frame (x forward, y up, z to starboard; side +1 starboard,
 * -1 port).
 */
export function oarPoints(d, side, a, b) {
  const r = d.row, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const ox = sa * cb, oy = -sb, oz = side * ca * cb; // outboard along the loom
  const px = r.lockU, py = r.lockH, pz = side * r.lockV;
  return {
    lock: [px, py, pz], dir: [ox, oy, oz],
    grip: [px - ox * r.inboard, py - oy * r.inboard, pz - oz * r.inboard],
    tip: [px + ox * r.outboard, py + oy * r.outboard, pz + oz * r.outboard],
  };
}

function bigDims(def) {
  const L = def.length, B = def.beam;
  const D = B * 0.45;
  // the smallest (a sloop) is narrow: one flight of stairs, up the starboard
  // side, and the cabin door beside it
  const narrow = B < 7;
  // (the middling ships — a caravel to a carrack — have shorter castles, to
  // leave a main deck to work; the largest a poop deck as well)
  const large = L >= 44, mid = !narrow && !large;
  // her side rises with her beam — but no higher than a jump from a pier's
  // planks reaches over her rail
  const deckY = 0.6 + Math.min(B, 11) * 0.2;
  const bulH = 1.1;
  const fore = L >= 24;
  // the decks over the cabins, a storey up (with more headroom on the bigger ships)
  const hq = narrow ? 2.4 : Math.min(3, 1.95 + B * 0.075), hf = hq - 0.1;
  const poop = large, hp = poop ? hq - 0.2 : 0;
  // (a forecastle long enough to sling the crew's hammocks in)
  const tq = narrow ? Math.max(0.24, 2.9 / L) : mid ? 0.26 : 0.3, tf = fore ? (large ? 0.85 : 1 - Math.max(0.13, 5.4 / L)) : 1, tp = poop ? 0.13 : 0;
  const yq = deckY + hq, yf = deckY + hf, yp = yq + hp;
  const masts = Math.max(1, Math.min(4, def.masts || 3));
  // (with a poop deck, the helm is up on it: the highest deck, where the captain sees over everything)
  const tHelm = poop ? tp - 2.2 / L : narrow ? 0.08 : 0.1;
  const d = {
    L, B, D, open: false, big: true, narrow, deckY, bulH, castle: true, fore, poop, hq, hf, hp, tq, tf, tp, masts,
    mastH: narrow ? L * 0.95 + 3 : L + 4, helmX: -L / 2 + tHelm * L, yq, yf, yp, helmFloor: poop ? yp : yq, sheer: Math.min(1.3, 0.4 + L * 0.016), walk: 0.86,
  };
  // the bow's height (the forecastle, or the rail at the stem)
  d.bowY = fore ? yf : deckY + 0.9;
  // masts: fore, main, mizzen (and a jigger on the four-masters), metres forward of the middle
  d.mastU = ({ 1: [0.06], 2: [0.22, -0.06], 3: large ? [0.27, 0.03, -0.24] : [0.26, 0.02, -0.28], 4: [0.3, 0.1, -0.12, -0.27] })[masts].map((k) => k * L);
  d.mastR = Math.min(0.6, 0.05 + L * 0.011);
  // the wheel just forward of the helmsman, and the binnacle ahead of it (where there's room)
  d.wheelU = d.helmX + 0.9;
  const bu = d.wheelU + 1.45;
  d.binnacleU = !narrow && !poop && d.mastU.every((u) => Math.abs(u - bu) > d.mastR + 0.95) && bu < xAt(d, tq) - 0.5 ? bu : null;
  // stairs along the rails: up to the quarterdeck and the forecastle from the
  // main deck, and from the quarterdeck up to the poop
  const W = narrow ? 1.05 : Math.min(1.6, 0.75 + B * 0.055), sides = narrow ? [1] : [-1, 1];
  const run = (rise) => rise * (narrow ? 1.1 : mid ? 1.15 : 1.3);
  const edge = (t) => hbAt(t, B) * d.walk - 0.22;
  d.stairs = [];
  const flight = (ta, tb, ha, hb, la, lb) => {
    const vo = Math.min(edge(ta), edge(tb)), vi = vo - W;
    for (const s of sides) d.stairs.push({ ta, tb, ha, hb, la, lb, s, va: s > 0 ? vi : -vo, vb: s > 0 ? vo : -vi });
  };
  flight(tq, tq + run(hq) / L, yq, deckY, 'quarter', 'main');
  if (fore) flight(tf - run(hf) / L, tf, deckY, yf, 'main', 'fore');
  if (poop) flight(tp, tp + run(hp) / L, yp, yq, 'poop', 'quarter');
  const qs = d.stairs.find((s) => s.la === 'quarter' && s.lb === 'main'), fs = d.stairs.find((s) => s.lb === 'fore');
  const mainT0 = qs.tb, mainT1 = fs ? fs.ta : 0.84;
  // (her main deck, along her: where a pier's planks want to be when she berths — see Ship.berth)
  d.mainT0 = mainT0; d.mainT1 = mainT1;
  // ---- below: the hold (on the ships with a dozen guns or more, the gun deck), a storey under the main deck
  const holdY = deckY - Math.max(2.25, Math.min(2.7, 1.9 + B * 0.045));
  d.holdY = holdY;
  const holdHalf = (t) => skinAt(d, t, holdY + 0.3) - 0.3;
  let h0 = 0.06, h1 = 0.94;
  while (h0 < 0.4 && holdHalf(h0) < 0.8) h0 += 0.005;
  while (h1 > 0.6 && holdHalf(h1) < 0.8) h1 -= 0.005;
  // the way down to it: on the largest a companionway, a flight of stairs
  // through an opening amidships; on the rest a hatch and a steep ladder. As
  // near the middle of the main deck as it'll go, with nothing in the way:
  // room to step onto it at its head (forward), and off it at its foot below
  const clearU = (u0, u1, pad) => d.mastU.every((m) => m < u0 - d.mastR - pad || m > u1 + d.mastR + pad);
  const clearComp = (u0, u1) => d.mastU.every((m) => m < u0 - d.mastR - 1.2 || m > u1 + d.mastR + 1.5);
  const rise = deckY - holdY;
  let comp = null;
  for (const cRun of [...(large ? [rise * 1.15, rise, rise * 0.85] : []), rise * 0.55]) {
    for (let k = 0; k < 160 && !comp; k++) {
      const tc = (mainT0 + mainT1) / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.003;
      const t0 = tc - cRun / L / 2, t1 = tc + cRun / L / 2;
      if (t0 < mainT0 + 0.5 / L || t1 > mainT1 - 1.8 / L || t0 < h0 + 1.8 / L || t1 > h1 - 0.3 / L) continue;
      if (clearComp(xAt(d, t0), xAt(d, t1))) comp = { t0, t1, ladder: cRun < rise * 0.7 };
    }
    if (comp) break;
  }
  if (!comp) comp = { t0: (mainT0 + mainT1) / 2 - rise * 0.275 / L, t1: (mainT0 + mainT1) / 2 + rise * 0.275 / L, ladder: true };
  const cw = comp.ladder ? 0.9 : 1.3;
  // (you go down facing aft: the top of the flight is its forward end)
  d.comp = { ...comp, w: cw, u0: xAt(d, comp.t0), u1: xAt(d, comp.t1) };
  d.stairs.push({ ta: comp.t0, tb: comp.t1, ha: holdY, hb: deckY, la: 'hold', lb: 'main', s: 0, va: -cw / 2, vb: cw / 2, down: true, ladder: comp.ladder });
  d.hatchT = (comp.t0 + comp.t1) / 2;
  // amidships: the capstan and the ship's boat on its chocks, where there's room
  const freeT = (want, len, pad) => {
    for (let k = 0; k < 80; k++) {
      const tc = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.006;
      const u0 = xAt(d, tc) - len / 2, u1 = u0 + len;
      if (tc - len / L / 2 < mainT0 + 0.3 / L || tc + len / L / 2 > mainT1 - 0.3 / L) continue;
      if (!clearU(u0, u1, pad)) continue;
      // (clear of the hatch, and of the deck at its head where you step down)
      if (u1 > d.comp.u0 - pad && u0 < d.comp.u1 + Math.max(pad, 1.6)) continue;
      return tc;
    }
    return null;
  };
  d.capstanT = L >= 14 ? freeT(masts >= 4 ? 0.54 : 0.385, 0.9, 0.7) : null;
  const bl = Math.min(6, L * 0.14), bt = L >= 24 ? freeT(masts >= 4 ? 0.69 : 0.645, bl, 0.6) : null;
  if (bt !== null && d.capstanT !== null && Math.abs(xAt(d, bt) - xAt(d, d.capstanT)) < bl / 2 + 1.2) d.boat = null;
  else d.boat = bt !== null ? { u0: (bt - 0.5) * L - bl / 2, u1: (bt - 0.5) * L + bl / 2, w: Math.min(2.2, B * 0.22) } : null;
  // the guns: on deck, run out through ports in the bulwarks between the
  // stairs — only where they leave room to walk past a mast, the capstan, the
  // boat or the hatch — and, on a ship with a dozen guns or more, a gun deck below
  const gs = Math.max(0.6, Math.min(1, B / 6.5));
  d.gunScale = gs;
  // (with room to step off the foot of the stairs, not into a gun)
  const rows = [{ y: deckY + 0.42, t0: mainT0 + 1.5 / L, t1: mainT1 - 1.5 / L, lid: 0.42, open: 1.4, deck: true }];
  // (the lower ports at the height of the guns' bores, as the ports on deck are)
  if ((def.cannons || 0) >= 12) rows.push({ y: holdY + 0.42 * Math.max(0.85, gs), t0: Math.max(0.12, h0 + 0.8 / L), t1: Math.min(0.86, h1 - 0.8 / L), lid: 0.6, open: 1.05 });
  const perSide = Math.ceil((def.cannons || 0) / 2);
  const capU = d.capstanT !== null ? (d.capstanT - 0.5) * L : null;
  const centre = (u) => {
    let w = 0;
    for (const m of d.mastU) if (Math.abs(u - m) < d.mastR + 0.6) w = Math.max(w, d.mastR + 0.1);
    if (capU !== null && Math.abs(u - capU) < 1.17) w = Math.max(w, 0.62);
    if (d.boat && u > d.boat.u0 - 0.55 && u < d.boat.u1 + 0.55) w = Math.max(w, d.boat.w / 2);
    if (u > d.comp.u0 - 0.6 && u < d.comp.u1 + 0.6) w = Math.max(w, cw / 2 + 0.05);
    return w;
  };
  const walkway = large ? 0.9 : mid ? 0.7 : 0.45;
  const offAt = (t) => hbAt(t, B) * 0.93 - 0.95 * gs;
  const fitsGun = (t) => {
    const u = (t - 0.5) * L, reach = 0.5 * gs;
    // (the carriage's width along the side, breech and all, is clear of anything in the middle, too)
    return [u - reach, u, u + reach].every((uu) => offAt(t) - gunIn(gs) - centre(uu) >= walkway);
  };
  const top = rows[0], want = rows.length > 1 ? Math.ceil(perSide / 2) : perSide;
  const cand = [];
  for (let t = top.t0; t <= top.t1 + 1e-9; t += 0.1 / L) if (fitsGun(t)) cand.push(t);
  const pick = [], gap = (1.4 * gs + 0.35) / L;
  for (let i = 0; i < want && cand.length; i++) {
    const aim = want === 1 ? (top.t0 + top.t1) / 2 : top.t0 + (top.t1 - top.t0) * i / (want - 1);
    let best = null;
    for (const t of cand) if (pick.every((q) => Math.abs(q - t) >= gap) && (best === null || Math.abs(t - aim) < Math.abs(best - aim))) best = t;
    if (best !== null) pick.push(best);
  }
  pick.sort((a, b) => a - b);
  d.guns = [];
  for (const t of pick) for (const s of [-1, 1]) d.guns.push({ t, u: (t - 0.5) * L, v: s * offAt(t), s });
  top.ts = pick;
  top.n = pick.length;
  for (const r of rows) if (!r.deck) r.n = Math.max(2, Math.min(16, Math.ceil(perSide / 2), Math.floor((r.t1 - r.t0) * L / 1.9)));
  d.gunRows = rows;
  // the guns of the gun deck below, each behind its port
  d.lowGuns = [];
  const low = rows.find((r) => !r.deck);
  if (low) {
    for (let i = 0; i < low.n; i++) {
      const t = low.t0 + (low.t1 - low.t0) * (i + 0.5) / low.n;
      const off = skinAt(d, t, low.y) - 0.3 - 0.85 * gs;
      // (none whose breech would crowd the foot of the companionway)
      if (t > comp.t0 - 1.6 / L && t < comp.t1 + 0.5 / L && off - gunIn(gs) - 0.8 < cw / 2 + 0.5) continue;
      for (const s of [-1, 1]) d.lowGuns.push({ t, u: (t - 0.5) * L, v: s * off, s });
    }
  }
  // ---- rooms: the great cabin under the quarterdeck (and the captain's under
  // the poop), the forecastle, and the hold. You walk in through their doors
  // (or down the companionway); what's inside stands in your way.
  const tS = 0.02 + 0.3 / L;
  // (a mast coming down through the great cabin just inside its front: a door either side of it, not one into it)
  const mastIn = d.mastU.some((m) => m < xAt(d, tq) && m > xAt(d, tq) - 2.6);
  const doorVs = narrow ? [Math.max(-edge(tq) + 0.75, Math.min(0, qs.va - 0.75))] : mastIn ? [-1, 1].map((s) => s * Math.max(0.95, d.mastR + 1.15)) : [0];
  d.rooms = [
    { kind: 'cabin', t0: tS, t1: tq, floor: deckY, ceil: yq - 0.12, top: yq, doors: doorVs.map((v) => ({ t: tq, v, w: 1.05, face: 1 })) },
  ];
  if (poop) d.rooms.push({ kind: 'captain', t0: tS, t1: tp, floor: yq, ceil: yp - 0.12, top: yp, doors: [{ t: tp, v: 0, w: 1.05, face: 1 }] });
  if (fore) {
    let fe = 0.95;
    while (fe > tf + 0.03 && innerAt(d, fe, deckY + 1) < 0.85) fe -= 0.005;
    const fdv = narrow ? [Math.max(-edge(tf) + 0.75, Math.min(0, fs.va - 0.75))] : [-0.95, 0.95];
    d.rooms.push({ kind: 'forecastle', t0: tf, t1: fe, floor: deckY, ceil: yf - 0.12, top: yf, doors: fdv.map((v) => ({ t: tf, v, w: 1.0, face: -1 })) });
  }
  d.rooms.push({ kind: 'hold', t0: h0, t1: h1, floor: holdY, ceil: deckY - 0.12, doors: [] });
  // the rooms' fronts (the cabin fronts, and the forecastle's facing aft):
  // their doors, each door folded back inside against the wall, and windows
  const upTo = { cabin: ['quarter', 'main'], captain: ['poop', 'quarter'], forecastle: ['main', 'fore'] };
  for (const r of d.rooms) if (r.doors.length) roomFront(d, r, d.stairs.filter((s) => s.la === upTo[r.kind][0] && s.lb === upTo[r.kind][1]));
  // the gallery windows across the stern of the cabins
  for (const r of d.rooms) if (r.kind === 'cabin' || r.kind === 'captain') r.windows = sternWindows(d, r);
  // the walls across the ship with their doorways (the cabin fronts) — the
  // companionway's opening has only a low coaming round it: step down onto
  // the ladder at its head (or over the side of it, and down into the hold)
  d.walls = [];
  for (const r of d.rooms) {
    if (!r.doors.length) continue;
    const u = xAt(d, r.front.t), w = innerAt(d, r.front.t, r.floor + 1) + 0.1;
    let v = -w;
    for (const dr of [...r.doors].sort((a, b) => a.v - b.v)) { d.walls.push({ u0: u, v0: v, u1: u, v1: dr.v - dr.w / 2, y0: r.floor, y1: r.ceil + 0.12 }); v = dr.v + dr.w / 2; }
    d.walls.push({ u0: u, v0: v, u1: u, v1: w, y0: r.floor, y1: r.ceil + 0.12 });
  }
  // and the rooms' ends: the stern windows' sills, the bow, the ends of the hold
  for (const r of d.rooms) {
    const hold = r.kind === 'hold';
    for (const [t, off] of hold ? [[r.t0, 0], [r.t1, 0]] : r.kind === 'forecastle' ? [[r.t1, 0]] : [[r.t0, 0.05]]) {
      const u = xAt(d, t) + off, w = (hold ? skinAt(d, t, r.floor + 0.3) : innerAt(d, t, r.floor + 1)) + 0.1;
      d.walls.push({ u0: u, v0: -w, u1: u, v1: w, y0: r.floor, y1: r.ceil + 0.12, end: true });
    }
  }
  // what you walk round: the masts (on every deck they pass through), and on
  // each deck the capstan, the boat, the guns, the wheel, the belfry
  d.solids = d.mastU.map((u) => ({ u, v: 0, r: d.mastR + 0.08 }));
  // (`h`: how tall each stands over its deck — a jump that high clears it; masts and the belfry, never)
  for (const gn of d.guns) d.solids.push({ ...gunBox(gn, gs), lvl: 'main', h: 0.95 * gs });
  for (const gn of d.lowGuns) d.solids.push({ ...gunBox(gn, gs), lvl: 'hold', h: 0.95 * gs });
  if (capU !== null) d.solids.push({ u: capU, v: 0, r: 0.62, lvl: 'main', h: 1.0 });
  d.solids.push({ u: d.wheelU, v: 0, r: 0.7, lvl: d.poop ? 'poop' : 'quarter' });
  if (d.binnacleU !== null) d.solids.push({ u: d.binnacleU, v: 0, r: 0.35, lvl: 'quarter', h: 1.2 });
  if (fore) d.solids.push({ u: (tf + 0.03 - 0.5) * L, v: 0, r: 0.55, lvl: 'fore' }); // the belfry
  if (d.boat) d.solids.push({ u0: d.boat.u0, u1: d.boat.u1, v0: -d.boat.w / 2, v1: d.boat.w / 2, lvl: 'main', h: 1.1 });
  // a pile of round shot beside a mast, out of everybody's way
  d.shotPile = null;
  const mainFirst = [...d.mastU].sort((a, b) => Math.abs(a) - Math.abs(b));
  const S = FURNITURE.shot;
  for (const m of mainFirst) {
    for (const [u, v] of [[m + d.mastR + 0.95, 0], [m - d.mastR - 0.95, 0], [m, d.mastR + 0.85], [m, -d.mastR - 0.85]]) {
      const box = { u0: u - S.w / 2, u1: u + S.w / 2, v0: v - S.dp / 2, v1: v + S.dp / 2 };
      if (deckClear(d, box, 0.55)) { d.shotPile = { u, v, ...box }; break; }
    }
    if (d.shotPile) break;
  }
  if (d.shotPile) { const p = d.shotPile; d.solids.push({ u0: p.u0, u1: p.u1, v0: p.v0, v1: p.v1, lvl: 'main', h: 0.6 }); }
  // (the furniture in the rooms: see furnish)
  furnish(d);
  // a ladder down each side amidships, from the water to her rail: the way up
  // her side from the sea, a boat or a quay below it (her side's too tall to
  // jump) — clear of the gunports and the channels, coming over the rail onto
  // a stretch of the main deck with nothing in the way
  d.ladders = [];
  for (const s of [1, -1]) {
    const t = ladderT(d, def, s, mainT0, mainT1);
    if (t !== null) d.ladders.push({ t, u: xAt(d, t), s, w: LADDER_W });
  }
  return d;
}

/** A side ladder's width (between its stiles' outsides). */
export const LADDER_W = 0.62;

/** Where along a big ship the ladder down side `s` goes: as near the middle of her main deck as there's room for it (or null). */
function ladderT(d, def, s, t0, t1) {
  const L = d.L, mid = (t0 + t1) / 2;
  for (let k = 0; k < 600; k++) {
    const t = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05 / L;
    if (t < t0 + 1 / L || t > t1 - 1 / L) continue;
    const u = xAt(d, t);
    // (not over a gunport, on deck or below — a port's 0.62 m wide)
    if ([...d.guns, ...(d.lowGuns || [])].some((g) => g.s === s && Math.abs(g.u - u) < LADDER_W / 2 + 0.31 + 0.3)) continue;
    // (nor across the channels the shrouds come down to, beside each mast, nor a paddle-box)
    if (d.mastU.some((m) => Math.abs(u - (m - 0.5)) < (2.4 + d.mastR * 2) / 2 + LADDER_W / 2 + 0.25)) continue;
    if (def.paddle && Math.abs(t - 0.34) < (0.72 * d.B / 3.2 + LADDER_W / 2 + 0.5) / L) continue;
    // (and at its top, room to stand inside the rail: on the main deck, clear of everything on it)
    const v = s * (hbAt(t, d.B) * d.walk - 0.5);
    if (levelAt(d, t, v) !== 'main' || solidAt(d, u, v, 0.4, 'main') > 0) continue;
    return t;
  }
  return null;
}

// ---------------------------------------------------------------- the big ships' fittings
/** How far a gun's breech (and the knob behind it) reaches inboard of its trunnions. */
const gunIn = (gs) => 0.92 * gs + 0.05;
/** The deck a gun on its truck carriage takes up (trunnions at u, v; muzzle out to side s), as the 3D view builds it (bigship.js cannon). */
export function gunBox(g, gs) {
  const a = 0.25 * gs + 0.15, i = gunIn(gs), o = 0.6 * gs;
  return { u0: g.u - a, u1: g.u + a, v0: g.s > 0 ? g.v - i : g.v - o, v1: g.s > 0 ? g.v + o : g.v + i };
}

const hits = (a, b, pad = 0) => a.u0 < b.u1 + pad && a.u1 > b.u0 - pad && a.v0 < b.v1 + pad && a.v1 > b.v0 - pad;
const nearRing = (a, u, v, r) => Math.hypot(u - Math.max(a.u0, Math.min(a.u1, u)), v - Math.max(a.v0, Math.min(a.v1, v))) < r;

/** Is a patch of the main deck clear of everything on it (and of the way down the hatch, and the stairs), `pad` all round? */
function deckClear(d, b, pad) {
  const t0 = (b.u0 + d.L / 2) / d.L, t1 = (b.u1 + d.L / 2) / d.L;
  if (t0 < d.tq || t1 > d.tf) return false;
  for (const t of [t0, t1]) if (Math.max(-b.v0, b.v1) > hbAt(t, d.B) * d.walk - pad) return false;
  const cp = d.comp;
  if (hits(b, { u0: cp.u0, u1: cp.u1 + 1.6, v0: -cp.w / 2 - 0.4, v1: cp.w / 2 + 0.4 }, pad)) return false;
  for (const s of d.stairs) if (!s.down && (s.la === 'main' || s.lb === 'main') && hits(b, { u0: xAt(d, s.ta), u1: xAt(d, s.tb), v0: s.va, v1: s.vb }, pad)) return false;
  for (const o of d.solids) {
    if (o.lvl && o.lvl !== 'main') continue;
    if (o.r !== undefined ? nearRing(b, o.u, o.v, o.r + pad) : hits(b, o, pad)) return false;
  }
  return true;
}

/**
 * A room's front wall — a cabin front, or the forecastle's facing aft — as
 * the 3D view builds it (bigship.js cabinFront): its doorways, each door
 * folded back inside against the wall on the side with more wall, and the
 * windows either side (clear of the doors, and of the stairs outside).
 */
function roomFront(d, r, stairs) {
  const face = r.kind === 'forecastle' ? -1 : 1, t = face > 0 ? r.t1 : r.t0, u = xAt(d, t);
  const w = innerAt(d, t, (r.floor + r.top) / 2) + 0.05, dh = Math.min(2.05, r.top - r.floor - 0.12);
  const ds = [...r.doors].sort((a, b) => a.v - b.v);
  ds.forEach((dr, i) => {
    // (a stretch of wall between two doorways is shared: half for each door)
    const lo = i ? (ds[i - 1].v + ds[i - 1].w / 2 + dr.v - dr.w / 2) / 2 : -w, hi = i < ds.length - 1 ? (dr.v + dr.w / 2 + ds[i + 1].v - ds[i + 1].w / 2) / 2 : w;
    const right = hi - (dr.v + dr.w / 2), left = dr.v - dr.w / 2 - lo, sd = right >= left ? 1 : -1;
    const lw = Math.min(dr.w - 0.1, Math.max(right, left) - 0.12), e = dr.v + sd * (dr.w / 2 + 0.04);
    dr.dh = dh;
    dr.leaf = lw > 0.3 ? { u: u - face * 0.12, v0: Math.min(e, e + sd * lw), v1: Math.max(e, e + sd * lw), s: sd } : null;
  });
  const clearOfStairs = (zz, half) => !stairs.some((st) => zz + half > st.va - 0.1 && zz - half < st.vb + 0.1);
  const windows = [];
  if (r.top - r.floor > 1.8) {
    for (let zz = -w + 0.75; zz <= w - 0.75; zz += 1.15) {
      if (ds.some((dr) => Math.abs(zz - dr.v) < dr.w / 2 + 0.5 || (dr.leaf && zz + 0.38 > dr.leaf.v0 && zz - 0.38 < dr.leaf.v1)) || !clearOfStairs(zz, 0.4)) continue;
      windows.push(zz);
    }
  }
  r.front = { t, u, face, w, dh, windows };
}

/** The gallery windows across a cabin's stern (as the 3D view glazes them): [{ v, w }], from the floor + 0.75 to + 1.65. */
function sternWindows(d, r) {
  const w = innerAt(d, r.t0, r.floor + 1);
  if (r.ceil + 0.1 - r.floor <= 1.9) return [];
  const n = Math.max(2, Math.floor((w * 2) / 1.15)), ww = Math.min(0.8, (w * 2) / n - 0.3);
  return Array.from({ length: n }, (_, i) => ({ v: -w + (i + 0.5) * (w * 2) / n, w: ww }));
}

// ---------------------------------------------------------------- furniture
/**
 * The furniture, piece by piece: w across its front, dp front to back, h
 * tall — what the 3D view draws (bigship.js furniture) and what you walk
 * round. (A treasure chest stands with its lid thrown back.)
 */
export const FURNITURE = {
  table: { w: 1.6, dp: 0.9, h: 0.76 },
  chair: { w: 0.46, dp: 0.46, h: 0.95 },
  bench: { w: 1.5, dp: 0.36, h: 0.46 },
  desk: { w: 1.4, dp: 0.75, h: 0.78 },
  bunk: { w: 2.05, dp: 0.95, h: 0.7 },
  chest: { w: 0.9, dp: 0.55, h: 0.62 },
  treasure: { w: 0.9, dp: 0.8, h: 0.98 },
  shelf: { w: 1.3, dp: 0.38, h: 1.8 },
  stove: { w: 1.2, dp: 0.9, h: 0.8 }, // (the range itself 0.9 × 0.7, on its stone hearth)
  hammock: { w: 2.1, dp: 0.8, h: 0.62 },
  barrel: { w: 0.66, dp: 0.66, h: 0.78 },
  barrels: { w: 1.34, dp: 0.66, h: 0.78 },
  crate: { w: 0.8, dp: 0.8, h: 1.2 },
  sacks: { w: 1.2, dp: 0.7, h: 0.48 },
  shot: { w: 0.6, dp: 0.45, h: 0.48 },
  lantern: { w: 0.28, dp: 0.36, h: 0.46 },
};

/**
 * Where a piece of furniture stands on its floor: { u0, u1, v0, v1 }. Every
 * piece stands square to the ship, its front facing along rot (0 to
 * starboard, π to port, π/2 forward, -π/2 aft): w runs along the ship when it
 * faces a side, across it when it faces fore or aft.
 */
export function footprint(it) {
  const across = Math.abs(Math.sin(it.rot || 0)) > 0.5;
  const hu = (across ? it.dp : it.w) / 2, hv = (across ? it.w : it.dp) / 2;
  return { u0: it.u - hu, u1: it.u + hu, v0: it.v - hv, v1: it.v + hv };
}

// (how high you sit on each: a chair's seat, a bench's, the top of a barrel)
const SEAT_H = { chair: 0.47, bench: FURNITURE.bench.h, barrel: 0.8 };

/**
 * Where you can sit aboard her: on every chair and barrel, and along every
 * bench (a place for each 0.6 m of it) — { u, v, floor, h (the seat over its
 * floor), face (the way a sitter looks, from her heading: the piece's front),
 * kind }.
 */
export function seatsOf(d) {
  if (d.seats) return d.seats;
  const out = [];
  for (const it of d.furniture || []) {
    const h = SEAT_H[it.kind];
    if (!h || it.ghost || it.y) continue;
    const face = Math.PI / 2 - (it.rot || 0);
    if (it.kind !== 'bench') { out.push({ u: it.u, v: it.v, floor: it.floor, h, face, kind: it.kind }); continue; }
    const n = Math.max(1, Math.floor(it.w / 0.6)), across = Math.abs(Math.sin(it.rot || 0)) > 0.5;
    for (let i = 0; i < n; i++) {
      const o = ((i + 0.5) / n - 0.5) * it.w;
      out.push({ u: it.u + (across ? 0 : o), v: it.v + (across ? o : 0), floor: it.floor, h, face, kind: 'bench' });
    }
  }
  return (d.seats = out);
}

/** The heights (over its floor) a room's lining is built at, by the 3D view. */
export const liningYs = (r) => (r.kind === 'hold' ? [-0.02, 0.55, 1.15, 1.75, r.ceil + 0.1 - r.floor] : [-0.02, 0.9, r.ceil + 0.1 - r.floor]);

/** The inside of a room's sides (its lining): the half-width at t, y above its floor. */
export function liningAt(d, r, t, y) {
  const ys = liningYs(r);
  const at = (yy) => (r.kind === 'hold' ? Math.max(0.3, skinAt(d, t, r.floor + yy) - 0.22) : innerAt(d, t, r.floor + yy) + 0.01);
  const yc = Math.max(ys[0], Math.min(ys[ys.length - 1], y));
  for (let i = 0; i < ys.length - 1; i++) {
    if (yc <= ys[i + 1]) return at(ys[i]) + (at(ys[i + 1]) - at(ys[i])) * (yc - ys[i]) / (ys[i + 1] - ys[i]);
  }
  return at(ys[ys.length - 1]);
}

/** The inside faces of a room's end walls, [aft, forward] (u): the stern windows' sills and a cabin's front; the forecastle's front and her bow. */
export function roomEnds(d, r) {
  const a = xAt(d, r.t0), b = xAt(d, r.t1);
  if (r.kind === 'forecastle') return [a + 0.07, b];
  if (r.kind === 'hold') return [a, b];
  return [a + 0.1, b - 0.07];
}

/**
 * Fills a room with furniture, piece by piece: each square to the ship,
 * inside the lining at every height it stands to, clear of the other pieces,
 * of the doorways and the doors folded back beside them, of the masts coming
 * through (with room to walk round), of the foot of the companionway and the
 * guns' crews; nothing tall in front of a window.
 */
function roomPlacer(d, r) {
  const [ua, ub] = roomEnds(d, r), H = r.ceil - r.floor;
  const tOf = (u) => (Math.max(ua, Math.min(ub, u)) + d.L / 2) / d.L;
  const ys = liningYs(r);
  const P = { d, r, ua, ub, H, items: [], keep: [], low: [], rings: [] };
  /** How far out from the middle something standing y0..y1 over the floor can reach at u (just clear of the lining). */
  const reached = new Map();
  P.reach = (u, y0, y1) => {
    // (asked again and again as things slide along the walls: to the centimetre, once)
    const key = `${Math.round(u * 100)}|${y0}|${y1}`;
    let m = reached.get(key);
    if (m === undefined) {
      m = Infinity;
      for (const y of [y0, y1, ...ys.filter((yy) => yy > y0 && yy < y1)]) m = Math.min(m, liningAt(d, r, tOf(Math.round(u * 100) / 100), y));
      reached.set(key, m);
    }
    return m - 0.03;
  };
  // (a stove's pipe runs up to the deck overhead)
  const top = (o) => (o.pipe ? H - 0.1 : (o.y || 0) + o.h);
  P.fits = (it) => {
    const fp = footprint(it), y0 = it.y || 0, y1 = top(it);
    // (under the beams — what's slung from them hangs right up to them)
    if (fp.u0 < ua - 1e-6 || fp.u1 > ub + 1e-6 || y1 > H - (it.y ? 0 : 0.06)) return false;
    for (const u of [fp.u0, (fp.u0 + fp.u1) / 2, fp.u1]) { const w = P.reach(u, y0, y1); if (fp.v0 < -w - 1e-6 || fp.v1 > w + 1e-6) return false; }
    // (kept clear up to their height: a hammock slung overhead is out of the way of a walk round a table)
    if (P.keep.some((k) => hits(fp, k) && y0 < (k.top ?? Infinity))) return false;
    if (y1 > 0.72 && P.low.some((k) => hits(fp, k))) return false;
    if (P.rings.some((c) => nearRing(fp, c.u, c.v, c.r))) return false;
    for (const o of P.items) if (hits(fp, footprint(o), 0.02) && y0 < top(o) && (o.y || 0) < y1) return false;
    return true;
  };
  P.put = (it) => { const x = { rot: 0, ...it, room: r.kind, floor: r.floor }; if (!P.fits(x)) return null; P.items.push(x); return x; };
  const spec = (kind, extra = {}) => ({ kind, ...FURNITURE[kind], ...extra });
  /** Where a piece stands back to a side wall (s: 1 starboard, -1 port), facing into the room, its middle at u — and how far its middle stands off the wall (where the hull curves in). */
  const sidePlace = (kind, s, u, extra) => {
    const S = spec(kind, extra), y0 = S.y || 0, y1 = S.pipe ? H - 0.1 : y0 + S.h;
    const w = Math.min(P.reach(u - S.w / 2, y0, y1), P.reach(u, y0, y1), P.reach(u + S.w / 2, y0, y1));
    const it = { rot: s > 0 ? Math.PI : 0, ...S, u, v: s * (w - 0.01 - S.dp / 2), room: r.kind, floor: r.floor };
    return { it, off: P.reach(u, y0, y1) - w };
  };
  P.onSide = (kind, s, u, extra = {}) => P.put(sidePlace(kind, s, u, extra).it);
  /**
   * The same, sliding along the wall from `from` toward `to` (its middle):
   * the first place it fits flush with the wall (or, where the hull curves
   * everywhere, the flushest).
   */
  P.alongSide = (kind, s, from, to, extra = {}) => {
    const dir = to >= from ? 1 : -1;
    let best = null;
    for (let u = from; dir > 0 ? u <= to + 1e-6 : u >= to - 1e-6; u += dir * 0.05) {
      const c = sidePlace(kind, s, u, extra);
      if (!P.fits(c.it)) continue;
      if (c.off < 0.12) { best = c; break; }
      if (!best || c.off < best.off - 0.02) best = c;
    }
    if (!best) return null;
    P.items.push(best.it);
    return best.it;
  };
  /** As many as fit along a side wall between `from` and `to`, `gap` apart. */
  P.row = (kinds, s, from, to, gap, extra = {}) => {
    const out = [], dir = to >= from ? 1 : -1;
    for (let u = from; dir > 0 ? u <= to + 1e-6 : u >= to - 1e-6; u += dir * 0.05) {
      const kind = kinds[out.length % kinds.length], S = spec(kind, extra);
      const it = P.onSide(kind, s, u + dir * S.w / 2, extra);
      if (it) { out.push(it); u += dir * (S.w + (typeof gap === 'function' ? gap(out.length) : gap) - 0.05); }
    }
    return out;
  };
  /** Back to the room's aft (e -1) or forward (e 1) end wall, facing in, its middle at v. */
  P.onEnd = (kind, e, v, extra = {}) => {
    const S = spec(kind, extra);
    return P.put({ ...S, u: e < 0 ? ua + 0.01 + S.dp / 2 : ub - 0.01 - S.dp / 2, v, rot: e < 0 ? Math.PI / 2 : -Math.PI / 2 });
  };
  /** Try fn(u, v) round (u0, v0) — nearest first — until it places something. */
  P.around = (u0, v0, fn) => {
    for (let k = 0; k < 160; k++) {
      const u = u0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1;
      if (u < ua || u > ub) continue;
      for (const dv of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) { const g = fn(u, v0 + dv); if (g) return g; }
    }
    return null;
  };
  /**
   * A group standing free in the room (a table and its seats, a desk and its
   * chair): all of it placed, with room to walk round it (`clear`) — or none
   * of it. Nothing placed later comes within `clear` of it either.
   */
  P.group = (build, clear = 0.55) => {
    const mark = P.items.length;
    const g = build();
    const mine = P.items.slice(mark);
    if (g && mine.length) {
      const b = mine.map(footprint).reduce((a, f) => ({ u0: Math.min(a.u0, f.u0), u1: Math.max(a.u1, f.u1), v0: Math.min(a.v0, f.v0), v1: Math.max(a.v1, f.v1) }));
      if (!P.items.slice(0, mark).some((o) => !o.ghost && hits(b, footprint(o), clear) && (o.y || 0) < 1.7)) { P.keep.push({ u0: b.u0 - clear, u1: b.u1 + clear, v0: b.v0 - clear, v1: b.v1 + clear, top: 1.7 }); return mine; }
    }
    P.items.length = mark;
    return null;
  };
  /** A table lengthwise at (u, v), with chairs (or benches) along its sides and at its ends, facing it. */
  P.table = (u, v, len, wid, seats = 'chairs') => P.group(() => {
    if (!P.put({ kind: 'table', w: len, dp: wid, h: FURNITURE.table.h, u, v, mess: seats === 'benches' })) return null;
    let n = 0;
    if (seats === 'benches') {
      for (const s of [-1, 1]) if (P.put({ ...spec('bench'), w: len, u, v: v + s * (wid / 2 + 0.05 + FURNITURE.bench.dp / 2), rot: s > 0 ? Math.PI : 0 })) n++;
    } else {
      const C = FURNITURE.chair, k = Math.max(1, Math.min(4, Math.floor((len + 0.1) / 0.75)));
      for (const s of [-1, 1]) for (let i = 0; i < k; i++) if (P.put({ ...spec('chair'), u: u - len / 2 + len * (i + 0.5) / k, v: v + s * (wid / 2 + 0.05 + C.dp / 2), rot: s > 0 ? Math.PI : 0 })) n++;
      for (const e of [-1, 1]) if (P.put({ ...spec('chair'), u: u + e * (len / 2 + 0.05 + C.dp / 2), v, rot: e > 0 ? -Math.PI / 2 : Math.PI / 2 })) n++;
    }
    return n >= 2;
  });
  /** A rug under a group (as big as it'll go, clear of everything else and inside the room). Last of all: things don't stand on it. */
  P.rug = (group) => {
    if (!group) return null;
    const b = group.map(footprint).reduce((a, f) => ({ u0: Math.min(a.u0, f.u0), u1: Math.max(a.u1, f.u1), v0: Math.min(a.v0, f.v0), v1: Math.max(a.v1, f.v1) }));
    for (let pad = 0.35; pad > -0.2; pad -= 0.05) {
      const rug = { kind: 'rug', u: (b.u0 + b.u1) / 2, v: (b.v0 + b.v1) / 2, w: b.u1 - b.u0 + 2 * pad, dp: b.v1 - b.v0 + 2 * pad, h: 0.02, rot: 0, ghost: true, room: r.kind, floor: r.floor };
      const fp = footprint(rug);
      if (fp.u0 < ua || fp.u1 > ub || [fp.u0, fp.u1].some((u) => P.reach(u, 0, 0.02) < Math.max(-fp.v0, fp.v1))) continue;
      if (P.items.some((o) => !group.includes(o) && !o.y && !o.wall && hits(fp, footprint(o)))) continue;
      P.items.push(rug);
      return rug;
    }
    return null;
  };
  /**
   * Lanterns on the side walls every few metres, above head height (not over
   * anything tall, nor among the hammocks) — or, where the walls are taken,
   * hung from a beam overhead.
   */
  P.lanterns = () => {
    const S = FURNITURE.lantern, y = Math.min(H - 0.12, 2.25) - S.h, len = ub - ua, n = Math.max(1, Math.round(len / 3.2));
    const free = (lt) => { const fp = footprint(lt); return fp.u0 >= ua && fp.u1 <= ub && !P.items.some((o) => hits(fp, footprint(o), 0.08) && (o.y || 0) < lt.y + S.h && top(o) > lt.y); };
    for (let i = 0; i < n; i++) {
      const u = ua + len * (i + 0.5) / n;
      let put = null;
      for (const s of i % 2 ? [1, -1] : [-1, 1]) {
        const w = Math.min(P.reach(u - S.w / 2, y, y + S.h), P.reach(u, y, y + S.h), P.reach(u + S.w / 2, y, y + S.h)) + 0.02;
        const lt = { kind: 'lantern', ...S, u, v: s * (w - S.dp / 2), y, rot: s > 0 ? Math.PI : 0, ghost: true, wall: s, room: r.kind, floor: r.floor };
        if (free(lt)) { put = lt; break; }
      }
      // (from the beams: over the middle of the room, clear of what's slung there too)
      for (const dv of [0, 0.6, -0.6, 1.2, -1.2]) {
        if (put) break;
        const lt = { kind: 'lantern', ...S, dp: S.w, u, v: dv, y: H - 0.5, h: 0.5, rot: 0, ghost: true, wall: 0, room: r.kind, floor: r.floor };
        if (free(lt)) put = lt;
      }
      if (put) P.items.push(put);
    }
  };
  // the doorways, and a way in through each kept clear; the doors folded back
  // beside them; the windows (nothing tall in front of them)
  for (const dr of r.doors) {
    const f = r.front.face, u = r.front.u;
    const inside = (a, b) => (f > 0 ? { u0: u - b, u1: u - a } : { u0: u + a, u1: u + b });
    P.keep.push({ ...inside(-1, 1.35), v0: dr.v - dr.w / 2 - 0.2, v1: dr.v + dr.w / 2 + 0.2, top: dr.dh + 0.15 });
    if (dr.leaf) P.keep.push({ ...inside(-1, 0.25), v0: dr.leaf.v0 - 0.05, v1: dr.leaf.v1 + 0.05, top: dr.dh + 0.05 });
  }
  if (r.front) for (const zz of r.front.windows) P.low.push({ ...(r.front.face > 0 ? { u0: ub - 0.35, u1: ub + 1 } : { u0: ua - 1, u1: ua + 0.35 }), v0: zz - 0.4, v1: zz + 0.4 });
  for (const wd of r.windows || []) P.low.push({ u0: ua - 1, u1: ua + 0.35, v0: wd.v - wd.w / 2 - 0.1, v1: wd.v + wd.w / 2 + 0.1 });
  // the masts coming through (with room to walk round them)
  for (const m of d.mastU) if (m > ua - 1.5 && m < ub + 1.5) P.rings.push({ u: m, v: 0, r: d.mastR + 0.08 + 0.45 });
  if (r.kind === 'hold') {
    // the companionway: the flight, and the landing at its foot
    const cp = d.comp;
    P.keep.push({ u0: cp.u0 - 1.4, u1: cp.u1 + 0.3, v0: -cp.w / 2 - 0.45, v1: cp.w / 2 + 0.45 });
    // the gun deck's guns, and the room their crews need behind them
    for (const g of d.lowGuns) { const b = gunBox(g, d.gunScale); P.keep.push({ u0: b.u0 - 0.2, u1: b.u1 + 0.2, v0: g.s > 0 ? b.v0 - 0.9 : b.v0, v1: g.s > 0 ? b.v1 : b.v1 + 0.9, top: 1.3 }); }
  }
  return P;
}

const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
const CARGO = ['barrels', 'crate', 'sacks', 'barrel', 'crate', 'shot', 'barrels', 'sacks', 'barrel'];

/** What's in each kind of room (see roomPlacer): along the walls first, then what stands free in the middle. */
const ROOMS = {
  // the great cabin: a bunk along the starboard side with the sea chest at
  // its foot, books and another chest to port (and on the bigger ships a
  // second bunk, a water cask and a chest under the stern windows), the
  // table down the middle with its chairs round it, a rug under it
  cabin(P) {
    const { ua, ub } = P, len = ub - ua;
    const bunk = P.alongSide('bunk', 1, ua + 1.05, ub - 1.05, { head: -1 });
    if (bunk) P.alongSide('chest', 1, bunk.u + bunk.w / 2 + 0.5, ub - 0.5, { loot: 'cabin' });
    P.alongSide('shelf', -1, ua + 0.7, ub - 0.7);
    P.alongSide('chest', -1, ub - 0.5, ua + 0.5, { loot: 'cabin' });
    if (len > 5.5) P.alongSide('bunk', -1, ua + 1.05, ub - 1.05, { head: -1 });
    if (len > 5.5) P.onEnd('chest', -1, 0);
    const half = P.reach((ua + ub) / 2, 0, 1);
    const tl = clampN(len * 0.3, 1.1, 2.6), tw = clampN(half * 0.24, 0.75, 1.05);
    let table = null;
    for (const [l, w] of [[tl, tw], [Math.max(1.0, tl * 0.75), Math.max(0.7, tw - 0.1)]]) if (!table) table = P.around((ua + ub) / 2 - 0.2, 0, (u, v) => P.table(u, v, l, w));
    if (len > 5.5) P.alongSide('barrel', 1, ub - 0.4, ua + 0.4);
    P.rug(table);
    P.lanterns();
  },
  // the captain's cabin under the poop: the desk facing the door, his chair
  // behind it (his back to the stern windows); a bunk with a chest at its
  // foot, bookcases and another chest; a rug
  captain(P) {
    const { ua, ub } = P, C = FURNITURE.chair, D = FURNITURE.desk;
    const bunk = P.alongSide('bunk', 1, ub - 1.05, ua + 1.05, { head: -1 });
    if (bunk) P.alongSide('chest', 1, bunk.u - bunk.w / 2 - 0.5, ua + 0.5, { loot: 'captain' });
    P.alongSide('shelf', -1, ua + 0.7, ub - 0.7);
    P.alongSide('shelf', -1, ua + 0.7, ub - 0.7);
    P.alongSide('chest', -1, ub - 0.5, ua + 0.5, { loot: 'captain' });
    let desk = null;
    for (let du = 0; du < 2.5 && !desk; du += 0.1) {
      for (const v of [0, 0.3, -0.3, 0.6, -0.6]) {
        if (desk) break;
        const cu = ua + 0.42 + du + C.dp / 2;
        desk = P.group(() => P.put({ ...FURNITURE.chair, kind: 'chair', u: cu, v, rot: Math.PI / 2 }) && P.put({ ...D, kind: 'desk', u: cu + C.dp / 2 + 0.05 + D.dp / 2, v, rot: Math.PI / 2 }));
      }
    }
    P.rug(desk);
    P.lanterns();
  },
  // the forecastle: the galley stove, the mess table and its benches, the
  // crew's hammocks slung up under the deck beams and their sea chests below
  forecastle(P) {
    const { ua, ub, H } = P, len = ub - ua;
    const stove = P.alongSide('stove', -1, ua + 0.5, ub - 0.5, { pipe: true });
    // (room to work at the stove: its front and half a metre either side kept clear — no chest pushed up against a fire)
    if (stove) { const f = footprint(stove); P.keep.push({ u0: f.u0 - 0.55, u1: f.u1 + 0.55, v0: f.v0 - 0.1, v1: f.v1 + 0.75, top: 1.2 }); }
    P.row(['chest'], 1, ua + 0.1, ub - 0.1, 1.4, { loot: 'crew' });
    P.row(['chest'], -1, ua + 1.2, ub - 0.1, 1.6, { loot: 'crew' });
    if (P.reach(ua + len * 0.45, 0, 1) > 1.7) {
      const tl = clampN(len * 0.4, 1.1, 2.4);
      for (const l of [tl, 1.1]) if (P.around(ua + len * 0.45, 0, (u, v) => P.table(u, v, l, 0.7, 'benches'))) break;
    }
    for (const s of [1, -1]) P.row(['hammock'], s, ua + 0.05, ub - 0.05, 0.12, { y: H - 0.64, ghost: true });
    P.lanterns();
  },
  // the hold: the treasure chest by the foot of the ladder (its lid thrown
  // back, facing you as you come down), the cargo stowed along both sides —
  // a second row in a wide hold — with the way down the middle clear (on a
  // gun deck, what fits between the guns)
  hold(P) {
    const { d, ua, ub } = P, cp = d.comp, T = FURNITURE.treasure;
    let chest = null;
    for (let du = 0; du < 3 && !chest; du += 0.1) {
      for (const s of [-1, 1]) {
        if (!chest) chest = P.put({ ...T, kind: 'chest', treasure: true, loot: 'hold', u: cp.u0 - 0.7 - du, v: s * (cp.w / 2 + 0.47 + T.dp / 2), rot: s < 0 ? 0 : Math.PI });
      }
    }
    if (!chest) P.around(cp.u0 - 2.2, 0, (u, v) => P.put({ ...T, kind: 'chest', treasure: true, loot: 'hold', u, v, rot: Math.PI / 2 }));
    let n = 0;
    for (const s of [-1, 1]) n += P.row(CARGO.slice(n % 3), s, ua + 0.3, ub - 0.3, (k) => (k % 3 ? 0.15 : 1.1)).length;
    for (const o of P.items.slice()) {
      if (o.treasure || o.kind === 'shot') continue;
      const s = Math.sign(o.v), f = footprint(o), kind = ['barrel', 'sacks', 'barrel', 'crate'][Math.floor(Math.abs(o.u) * 3.7) % 4], S = FURNITURE[kind];
      const v = s > 0 ? f.v0 - 0.08 - S.dp / 2 : f.v1 + 0.08 + S.dp / 2;
      if (Math.abs(v) - S.dp / 2 >= 1.3) P.put({ ...S, kind, u: o.u, v, rot: s > 0 ? Math.PI : 0 });
    }
    P.lanterns();
  },
};

/**
 * What's in the rooms and where it stands — shared by the 3D view, which
 * builds it, and the game, which walks round it and opens the chests.
 * `d.furniture`: [{ kind, room, floor, u, v, w, dp, h, rot, y?, ghost?, … }]
 * (ghosts — a rug, a hammock slung overhead, a lantern on the wall — are
 * walked over, under or past; everything else is in the way).
 */
function furnish(d) {
  d.furniture = [];
  for (const r of d.rooms) {
    const P = roomPlacer(d, r);
    ROOMS[r.kind](P);
    d.furniture.push(...P.items);
  }
  for (const it of d.furniture) if (!it.ghost) d.solids.push({ ...footprint(it), lvl: it.room, h: it.h });
}

// ---------------------------------------------------------------- a big hull's skin
const keelAt = (d, t) => -d.D * (1 - 0.5 * Math.pow(Math.abs(t - 0.45) / 0.55, 4));

/** A big hull's cross-section, rail to keel: [fraction of the half-beam, height]. */
export function hullProfile(d, t) {
  const top = topAt(d, t), dk = d.deckY, D = d.D;
  return [
    [0.875, top], [0.89, top - 0.14], [0.93, dk + 0.95], [0.975, dk - 0.25], [1.0, dk * 0.42],
    [0.985, 0], [0.9, -D * 0.3], [0.68, -D * 0.64], [0.36, -D * 0.9], [0, keelAt(d, t)],
  ];
}

/** A small hull's cross-section (the rowboat's), rail to keel, as the 3D view builds it: [fraction of the half-beam, height]. */
export function smallProfile(d, t) {
  const top = topAt(d, t), dk = d.deckY;
  return [
    [0.965, top], [0.975, top - 0.1], [0.995, dk + (d.open ? 0.02 : 0)], [1.0, dk - 0.12], [1.0, dk * 0.55],
    [0.975, dk * 0.12], [0.9, -d.D * 0.25], [0.68, -d.D * 0.62], [0.36, -d.D * 0.9], [0, -d.D * (1 - 0.55 * Math.pow(Math.abs(t - 0.45) / 0.55, 4))],
  ];
}

/** The half-width a cross-section (rail to keel) has at height y — the rail's above it, nothing below the keel. */
function profileWidth(pr, hb, y) {
  if (y >= pr[0][1]) return pr[0][0] * hb;
  for (let i = 0; i < pr.length - 1; i++) {
    const [w0, y0] = pr[i], [w1, y1] = pr[i + 1];
    if (y <= y0 && y >= y1) return (w0 + (w1 - w0) * (y0 - y) / Math.max(1e-6, y0 - y1)) * hb;
  }
  return 0;
}

/** Half-width of the outside of a big hull at height y, t along. */
export function skinAt(d, t, y) { return profileWidth(hullProfile(d, t), hbAt(t, d.B), y); }

/**
 * Half-width of the outside of any hull — a big ship's or the rowboat's —
 * at height y (above her waterline), t along: her side, where someone
 * alongside her meets it (in at the rail on the big ships' tumblehome, out
 * at her widest near the water, in again under it to the keel).
 */
export function sideAt(d, t, y) { return d.big ? skinAt(d, t, y) : profileWidth(smallProfile(d, t), hbAt(t, d.B), y); }
/** Half-width of the inside of the bulwarks (the deck's edge) at height y. */
export const innerAt = (d, t, y) => Math.max(0.05, skinAt(d, t, y) - 0.2);

/** How far in from its sides you can walk in a room at t (the hull's lining; the hold narrows to the floor). */
export function roomHalf(d, r, t) {
  return r.kind === 'hold' ? skinAt(d, t, r.floor + 0.3) - 0.3 : innerAt(d, t, r.floor + 1) - 0.08;
}

/** The room you're in at t with your feet at height h (above the waterline), if any. */
export function roomAt(d, t, h) {
  if (!d.rooms) return null;
  for (const r of d.rooms) if (t >= r.t0 && t <= r.t1 && h > r.floor - 0.7 && h < r.ceil - 0.9) return r;
  return null;
}

/** How far (u, v) on a floor at height fl is into a wall (the cabin fronts, the rooms' ends): 0 when clear. */
export function wallDepth(d, u, v, fl, margin) {
  let depth = 0;
  for (const w of d.walls || []) {
    if (fl < w.y0 - 0.3 || fl > w.y1 - 1) continue;
    const ex = w.u1 - w.u0, ey = w.v1 - w.v0, l2 = ex * ex + ey * ey;
    const k = l2 ? Math.max(0, Math.min(1, ((u - w.u0) * ex + (v - w.v0) * ey) / l2)) : 0;
    const dd = Math.hypot(u - (w.u0 + ex * k), v - (w.v0 + ey * k));
    depth = Math.max(depth, margin + 0.08 - dd);
  }
  return depth;
}

/** Where the helmsman stands (a rowboat's rower sits): x along the hull (stern < 0) and the floor height above the waterline. */
/**
 * A ship's wheel, as it's built (render3d/ships3d.js wheelGeometry) and
 * held: { u (along her from the middle), floor (the deck under the helmsman),
 * hub (its height over her waterline), R (the rim), grip (how far out from
 * the hub the hands hold its spokes, just outside the rim) } — null on an
 * open boat (no wheel: oars, or a tiller).
 */
export function wheelSpec(d) {
  if (d.open) return null;
  if (d._wheel) return d._wheel;
  let w;
  if (d.big) w = { u: d.wheelU, floor: d.helmFloor, hub: d.helmFloor + 0.92, R: 0.56, grip: 0.66 };
  else {
    const floor = floorAt(d, (d.wheelU + 0.1 + d.L / 2) / d.L);
    w = { u: d.wheelU, floor, hub: floor + 0.92, R: 0.4, grip: 0.47 };
  }
  Object.defineProperty(d, '_wheel', { value: w, enumerable: false });
  return w;
}

export function helmPoint(def) {
  const d = shipDims(def);
  if (d.row) return { x: d.helmX, floor: d.deckY, eye: d.deckY + d.row.seatH + 0.8, seated: true };
  return { x: d.helmX, floor: d.helmFloor, eye: d.helmFloor + (d.open ? 1.45 : 1.7) };
}

export function hbAt(t, B) {
  if (t > 0.58) { const k = (t - 0.58) / 0.42; return B / 2 * Math.sqrt(Math.max(0, 1 - Math.pow(k, 2.2))); }
  if (t < 0.14) return B / 2 * (0.74 + 0.26 * Math.sin((t / 0.14) * Math.PI / 2));
  return B / 2;
}

export function topAt(d, t) {
  let y = d.deckY + d.bulH + d.sheer * Math.pow(Math.abs(t - 0.45) / 0.55, 2);
  if (d.castle) y += d.hq * (1 - smooth(d.tq - 0.015, d.tq + 0.035, t));
  if (d.poop) y += d.hp * (1 - smooth(d.tp - 0.012, d.tp + 0.03, t));
  if (d.fore) y += d.hf * smooth(d.tf - 0.035, d.tf + 0.015, t);
  return y;
}

export const xAt = (d, t) => -d.L / 2 + t * d.L;

/**
 * How far aft (−) or forward (+) a big hull's skin is drawn at (x, y) — her
 * rake: the stem curving back under the bow (a few metres at the keel,
 * hardly anything at the rail, so she cuts the water with a sloping cutwater,
 * not a cliff), and the stern overhanging her rudder (the transom leaning
 * out as it rises). Only the drawing bends: she floats, and you walk, on the
 * plan as it is.
 */
export function rakeDx(d, x, y) {
  if (!d.big) return 0;
  const t = (x + d.L / 2) / d.L;
  // (only past the ends of her hold: the bend never brings her side in through it)
  const hold = d.rooms?.find((r) => r.kind === 'hold');
  const tb = hold ? hold.t1 + 0.005 : 0.9, ts = hold ? hold.t0 - 0.005 : 0.08;
  const eb = smooth(tb, 1, t), es = smooth(ts, 0, t);
  if (eb <= 0 && es <= 0) return 0;
  const top = topAt(d, Math.min(1, Math.max(0, t)));
  const f = Math.max(0, Math.min(1, (top - y) / (top + d.D)));
  return -d.L * 0.045 * eb * Math.pow(f, 1.6) + d.L * 0.03 * es * Math.pow(f, 1.4);
}

/** The flight of stairs at (t, v), if any. */
export function stairAt(d, t, v) {
  for (const s of d.stairs) if (t >= s.ta && t <= s.tb && v >= s.va && v <= s.vb) return s;
  return null;
}

/**
 * Floor height at t (and v, for the stairs of the big ships): the poop,
 * quarterdeck, main deck or forecastle — or, with your feet at height h,
 * the floor of the room you're in (a cabin, the forecastle, the hold). Over
 * the open hatch there's no deck: the floor is the ladder's (or the
 * companionway's) steps — step onto them at its head, or down onto them
 * over its coaming.
 */
export function floorAt(d, t, v = null, h = null) {
  if (v !== null && d.stairs.length) {
    const s = stairAt(d, t, v);
    if (s) return s.ha + (s.hb - s.ha) * (t - s.ta) / (s.tb - s.ta);
  }
  if (h !== null) { const r = roomAt(d, t, h); if (r) return r.floor; }
  if (d.poop && t < d.tp) return d.yp;
  if (d.castle && t < d.tq) return d.yq;
  if (d.fore && t > d.tf) return d.yf;
  return d.deckY;
}

/** Which deck (t, v) is on: 'poop', 'quarter', 'main' or 'fore' — or the flight of stairs it's on, or (feet at h) the room. */
export function levelAt(d, t, v, h = null) {
  const s = v !== null && d.stairs.length ? stairAt(d, t, v) : null;
  if (s) return s;
  if (h !== null) { const r = roomAt(d, t, h); if (r) return r.kind; }
  if (d.poop && t < d.tp) return 'poop';
  if (d.castle && t < d.tq) return 'quarter';
  if (d.fore && t > d.tf) return 'fore';
  return 'main';
}

/** How far (u, v) is inside something standing on the deck (a mast, the capstan, the boat): 0 when clear. `lvl`: only what's on that deck. */
export function solidAt(d, u, v, margin = 0, lvl = null, above = 0) {
  let depth = 0;
  for (const o of d.solids) {
    if (o.lvl && lvl !== null && o.lvl !== lvl) continue;
    // (feet `above` the deck higher than it stands: jumped over it)
    if (o.h !== undefined && above > o.h - 0.1) continue;
    if (o.r !== undefined) depth = Math.max(depth, o.r + margin - Math.hypot(u - o.u, v - o.v));
    else depth = Math.max(depth, Math.min(u - (o.u0 - margin), o.u1 + margin - u, v - (o.v0 - margin), o.v1 + margin - v));
  }
  return depth;
}

/**
 * How the swell under her moves her just now: { h (m up), r (roll), p (pitch) }
 * — the sea's own surface (render3d/swell.js: the same waves the water's
 * drawn with) sampled all over her waterplane, five stations along her and
 * three across each (weighted by how broad she is there), and the plane that
 * fits them best: so a long hull bridges the short seas (they average out
 * under her) and only the long swell lifts her ends, while a small boat rides
 * every one. And she has weight: she follows that plane through a spring
 * (BOAT_FEEL's ride*), so she rises, falls and leans with the sea smoothly,
 * never jolted — led by how fast the sea's moving under her, so she keeps
 * up with the swell and doesn't lag down into it. (Worked out once for each
 * moment and place; asked again for the same moment after she's moved on,
 * the step is redone from where it began.)
 */
const RIDE_U = [-0.4, -0.2, 0, 0.2, 0.4], RIDE_V = [-0.8, 0, 0.8];
const softClamp = (x, m) => m * Math.tanh(x / m);
const _rs = [0, 0];
function rideTarget(ship, time, out) {
  out[0] = out[1] = out[2] = 0;
  if (!swellOn() || ship.lvl || ship.sunk || !ship.def) return out;
  const L = ship.def.length || 6, B = ship.def.beam || L * 0.3;
  const ch = Math.cos(ship.heading), sh = Math.sin(ship.heading);
  let W = 0, Z = 0, Wu = 0, Zu = 0, Wv = 0, Zv = 0;
  const z = _rz;
  for (let i = 0; i < RIDE_U.length; i++) {
    const u = RIDE_U[i] * L, hb = hbAt(RIDE_U[i] + 0.5, B);
    for (let j = 0; j < RIDE_V.length; j++) {
      const v = RIDE_V[j] * hb, k = i * 3 + j;
      z[k] = swellAt(ship.x + ch * u - sh * v, ship.y + sh * u + ch * v, time);
      W += hb; Z += hb * z[k];
    }
  }
  const h = Z / W;
  for (let i = 0; i < RIDE_U.length; i++) {
    const u = RIDE_U[i] * L, hb = hbAt(RIDE_U[i] + 0.5, B);
    for (let j = 0; j < RIDE_V.length; j++) {
      const v = RIDE_V[j] * hb, dz = z[i * 3 + j] - h;
      Wu += hb * u * u; Zu += hb * u * dz;
      Wv += hb * v * v; Zv += hb * v * dz;
    }
  }
  out[0] = h;
  out[1] = Math.atan(Zu / Wu); // (bow up as the sea rises toward her bow)
  out[2] = Math.atan(-Zv / Wv); // (her port side up as the sea rises to port)
  return out;
}
const _rz = new Float64Array(15), _rt = [0, 0, 0];
function waveRide(ship, time) {
  const c = ship._ride || (ship._ride = { t: NaN, x: NaN, y: NaN, hd: NaN, h: 0, r: 0, p: 0, s: new Float64Array(12), s0: new Float64Array(12), t0: NaN, ok: false });
  if (c.t === time && c.x === ship.x && c.y === ship.y && c.hd === ship.heading) return c;
  // a new moment: the state she's in now is where this step starts from
  if (c.t !== time) { c.s0.set(c.s); c.t0 = c.t; }
  c.t = time; c.x = ship.x; c.y = ship.y; c.hd = ship.heading;
  const T = rideTarget(ship, time, _rt), S = c.s, S0 = c.s0, dt = time - c.t0;
  if (!c.ok || !(dt > 0) || dt > 0.5) {
    // (the first moment, or a long gap — loading, a pause: she's simply where the sea has her)
    for (let k = 0; k < 3; k++) { S[k * 2] = T[k]; S[k * 2 + 1] = 0; S[6 + k] = T[k]; S[9 + k] = 0; }
    c.ok = true;
  } else {
    const F = BOAT_FEEL, L = ship.def?.length || 6;
    const w = Math.max(1.6, F.rideRate + F.rideRatePerM * L), z = Math.min(1, Math.max(0.3, F.rideDamp)), lead = 2 * z / w * F.rideLead;
    // (led by how fast the sea's rising or falling under her — the swell's own
    // pace, not every quick little sea she sweeps through turning hard: the
    // bigger she is, the more of those she rides through without answering)
    const kv = 1 - Math.exp(-dt / (0.1 + 0.006 * L));
    for (let k = 0; k < 3; k++) {
      const vS = S0[9 + k] + ((T[k] - S0[6 + k]) / dt - S0[9 + k]) * kv;
      springStep(S0[k * 2], S0[k * 2 + 1], T[k] + vS * lead, w, dt, z, _rs);
      S[k * 2] = _rs[0]; S[k * 2 + 1] = _rs[1]; S[6 + k] = T[k]; S[9 + k] = vS;
    }
  }
  c.h = S[0];
  // (a little boat doesn't stand on her nose in every short sea: her pitch,
  // and a little of her roll, kept to her size — a rowboat a few degrees)
  const Ls = ship.def?.length || 6, small = Math.max(0.3, Math.min(1, Ls / 12));
  c.p = softClamp(S[2] * small, BOAT_FEEL.pitchMax * small);
  c.r = softClamp(S[4] * (0.5 + 0.5 * small), BOAT_FEEL.rollMax);
  return c;
}

/** The ship's rise and fall: on the swell (as the 3D view draws it), and a little of her own. */
export function shipBob(ship, time) { return (ship.lvl || 0) + 0.05 + Math.sin((time + (ship.seed || 0)) * 1.3) * 0.03 + waveRide(ship, time).h; }
/** How much higher than the middle a point `along` metres toward the bow rides (the ship pitched up a slope). */
export const pitchRise = (ship, along) => (ship.pitch ? along * Math.tan(ship.pitch) : 0);
/**
 * How a ship rocks as the 3D view draws her: [roll, pitch] in radians —
 * heeling gently side to side and dipping bow and stern (plus the slope she's
 * on up Reverse Mountain, and the list of a ship going down).
 */
export function shipRock(ship, time) {
  const t = time + (ship.seed || 0), sinking = ship.sunk ? Math.min(1, (ship.sinkT || 0) / 4) : 0;
  const w = waveRide(ship, time);
  return [Math.sin(t * 0.9) * 0.02 + w.r + sinking * 0.5, Math.sin(t * 1.1) * 0.012 + w.p + (ship.pitch || 0)];
}
/**
 * Where a point aboard rides just now, in metres above the sea: `u` along her
 * from the middle (+ toward the bow), `v` across (+ to starboard), `h` above
 * her waterline — with her bob, roll and pitch, exactly as she's drawn, so
 * whoever stands on her deck stands on the planks under them (on a 24 m
 * sloop, the roll and pitch alone lift her ends a quarter of a metre).
 */
export function shipLift(ship, time, u, v, h) {
  const [a, b] = shipRock(ship, time);
  return shipBob(ship, time) + (u * Math.sin(b) + h * Math.cos(b)) * Math.cos(a) - v * Math.sin(a);
}

/**
 * Where a point aboard is just now, all of it: `u` along her from the middle
 * (+ toward the bow), `v` across (+ to starboard), `h` over her waterline —
 * turned with her heading, her roll and her pitch, exactly as she's drawn
 * (ships3d.js: rotation (roll, -heading, pitch) in 'YXZ' order). Into `out`:
 * [x, y, z] — x and z from her middle (world tiles: x east, z = world y),
 * y metres above the sea (the same as shipLift). A point well up on her
 * decks swings a good way to and fro as she rolls and pitches (the helm of
 * a big ship, five metres up, half a metre in a five-degree roll): whatever
 * has to stay on her — the helmsman at the wheel, the hands on its spokes —
 * goes there, not where she'd be lying flat.
 */
export function shipPoint(ship, time, u, v, h, out = [0, 0, 0]) {
  const [a, b] = shipRock(ship, time);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const x1 = u * cb - h * sb, y1 = u * sb + h * cb;
  const x2 = x1, y2 = y1 * ca - v * sa, z2 = y1 * sa + v * ca;
  const ch = Math.cos(ship.heading), shd = Math.sin(ship.heading);
  out[0] = x2 * ch - z2 * shd;
  out[1] = shipBob(ship, time) + y2;
  out[2] = x2 * shd + z2 * ch;
  return out;
}

/**
 * How far a deck point (from deckAt) is swung sideways, just now, from where
 * it'd be on her lying flat: her roll and pitch carry everything on her
 * across as well as up and down (a chair five metres up her side moves half
 * a metre in a few degrees of roll). Into `out`: [x, z] (world tiles, x east,
 * z = world y). Those aboard are drawn there, and the camera rides with them.
 */
export function deckSwing(dk, time, out = [0, 0]) {
  out[0] = 0; out[1] = 0;
  const s = dk?.ship;
  if (!s?.def || dk.plank) return out;
  const u = dk.u ?? (dk.t - 0.5) * s.def.length, v = dk.v || 0, c = Math.cos(s.heading), sn = Math.sin(s.heading);
  const q = shipPoint(s, time, u, v, dk.h || 0, _swq);
  out[0] = q[0] - (u * c - v * sn); out[1] = q[2] - (u * sn + v * c);
  return out;
}
const _swq = [0, 0, 0];

/**
 * How high (m above the sea) a deck point (from deckAt) is just now, as it
 * rides: on a ship's deck, with her (shipLift); on a gangway laid between two
 * ships, on its planks (see game/gangway.js).
 */
export function deckLift(dk, time) {
  return dk.plank ? dk.plank.liftAt(dk.k) : shipLift(dk.ship, time, dk.u ?? (dk.t - 0.5) * dk.ship.def.length, dk.v || 0, dk.h);
}

/**
 * The deck under a point (dx, dy = offset from the ship's centre, world tiles):
 * { t (0 stern → 1 bow), u, v (across, + to starboard), h (floor height), edge
 * (distance in from the rail), lvl (which deck, on the big ships), solid (a
 * mast or the like is in the way) } — or null off the deck. `margin` keeps you
 * that far inside the bulwarks (and clear of whatever stands on the deck).
 * `hRef`: the height your feet are at (above her waterline) — under the upper
 * decks, in a cabin or down in the hold, it's that room's floor you stand on
 * (its walls and what's in it are solid); without it, the deck on top.
 */
export function deckPoint(ship, dx, dy, margin = 0.2, hRef = null) {
  const d = shipDims(ship.def);
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  const t = (u + d.L / 2) / d.L;
  if (t < 0.02 || t > 0.97) return null;
  const room = hRef !== null && d.big ? roomAt(d, t, hRef) : null;
  if (room) {
    const lv = levelAt(d, t, v, hRef);
    const out = { t, u, v, h: floorAt(d, t, v, hRef), edge: roomHalf(d, room, t) - Math.abs(v), lvl: lv, room };
    // (the sides of the room, what's in it and the walls round it stand in the way — never "over the side")
    const depth = Math.max(margin - out.edge, solidAt(d, u, v, Math.max(0, margin), room.kind, Math.max(0, hRef - out.h)), wallDepth(d, u, v, room.floor, margin));
    if (depth > 0) out.solid = depth;
    return out;
  }
  const hb = hbAt(t, d.B) * d.walk - margin;
  if (hb <= 0 || Math.abs(v) > hb) return null;
  // the bow narrows to a point: keep off the very tip
  const out = { t, u, v, h: floorAt(d, t, v, d.big ? hRef : null), edge: hb - Math.abs(v) };
  if (d.big) out.lvl = levelAt(d, t, v, hRef);
  if (d.solids.length) {
    const lv = typeof out.lvl === 'string' ? out.lvl : null;
    let depth = solidAt(d, u, v, Math.max(0, margin), d.big ? lv ?? 'stairs' : null, hRef === null ? 0 : Math.max(0, hRef - out.h));
    if (d.walls) depth = Math.max(depth, wallDepth(d, u, v, out.h, margin));
    if (depth > 0) out.solid = depth;
  }
  return out;
}

/**
 * A point inside a ship's hull outline, out to her planking (plus `pad`):
 * { t, u, v, top (the top of her side there), floor (the deck under it) } —
 * or null. Heights are above her waterline.
 */
export function hullPoint(ship, dx, dy, pad = 0) {
  const d = shipDims(ship.def);
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  const t = (u + d.L / 2) / d.L, tc = clamp01(t);
  if (Math.abs(t - tc) * d.L > pad) return null;
  if (Math.abs(v) > hbAt(tc, d.B) + pad) return null;
  return { t: tc, u, v, top: topAt(d, tc), floor: floorAt(d, tc, v) };
}

/** Each mast's height share by count (fore … aft): see render3d/bigship.js bigMastPlan. */
export const MAST_KS = (n) => (n >= 4 ? [0.92, 1.0, 0.86, 0.7] : n === 3 ? [0.92, 1.0, 0.8] : n === 2 ? [1.0, 0.84] : [1.0]);

/**
 * A big ship's crow's nest, up her mainmast: { m (which mast), u (its middle,
 * along her), y (its floor, above her waterline), r (its radius), mu (the
 * mast), base (the deck at the mast's foot), mr (the mast's radius) } — or null.
 * A ladder runs up the aft side of the mast to it.
 */
export function mastNest(d) {
  if (!d.big || !d.mastU?.length) return null;
  if (d._nest !== undefined) return d._nest;
  const n = d.mastU.length, m = n >= 3 ? 1 : 0, mu = d.mastU[m];
  const k = MAST_KS(n)[m], base = floorAt(d, (mu + d.L / 2) / d.L);
  const H = d.mastH * k, h2 = base + (H - base) * 0.76, mr = d.mastR * Math.sqrt(k);
  const out = { m, u: mu + mr * 1.1, y: h2 + 0.13, r: 0.75, mu, base, mr };
  Object.defineProperty(d, '_nest', { value: out, enumerable: false });
  return out;
}

/** World point of a deck position (t along, v across) of a ship. */
export function deckToWorld(ship, t, v) {
  const d = shipDims(ship.def);
  const u = -d.L / 2 + t * d.L;
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  return { x: ship.x + u * c - v * s, y: ship.y + u * s + v * c, h: floorAt(d, t, v) };
}

/**
 * Is a point (dx, dy from the ship's centre, h metres above the waterline)
 * inside the ship's timbers — the hull below the deck, the bulwarks, the
 * cabins under the quarterdeck, poop and forecastle? (Keeps the camera out.)
 */
export function hullSolid(ship, dx, dy, h) {
  const d = shipDims(ship.def);
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  const u = dx * c + dy * s, v = Math.abs(-dx * s + dy * c);
  const t = (u + d.L / 2) / d.L;
  if (t < 0 || t > 1 || h < -d.D) return false;
  // the masts, all the way up
  if (d.mastU && v < d.mastR + 0.2 && h < d.mastH && d.mastU.some((m) => Math.abs(u - m) < d.mastR + 0.2)) return true;
  const hb = hbAt(t, d.B);
  if (v > hb) return false;
  // inside a cabin, the forecastle or the hold (or the companionway down): open air
  if (d.rooms) {
    for (const r of d.rooms) if (t > r.t0 + 0.004 && t < r.t1 - 0.004 && h > r.floor - 0.05 && h < r.ceil - 0.02 && v < roomHalf(d, r, t) + 0.05) return false;
    const cp = d.comp;
    if (u > cp.u0 && u < cp.u1 && v < cp.w / 2 && h > d.holdY - 0.05 && h < d.deckY + 0.05) return false;
  }
  // the rails along the fronts of the raised decks (and the forecastle's after edge)
  const rail = d.big ? 1 : 0.8, at = (tt) => Math.abs(u - xAt(d, tt)) < 0.15;
  if ((d.castle && at(d.tq) && h < d.yq + rail) || (d.poop && at(d.tp) && h < d.yp + rail) || (d.fore && at(d.tf) && h < d.yf + rail)) return true;
  if (h > topAt(d, t)) return false;
  if (v > hb * d.walk - 0.05 || h < d.deckY - 0.1) return true;
  if (d.poop && t < d.tp) return h < d.yp - 0.1;
  if (d.castle && t < d.tq) return h < d.yq - 0.1;
  if (d.fore && t > d.tf) return h < d.yf - 0.1;
  return false;
}

/**
 * The gap between a point and a ship's hull at the waterline (0 or less:
 * touching or inside it) — for coming alongside, however long the ships are.
 */
export function hullGap(ship, dx, dy) {
  const d = shipDims(ship.def);
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  const t = clamp01((u + d.L / 2) / d.L);
  const along = Math.max(0, Math.abs(u) - d.L / 2);
  return Math.hypot(along, Math.max(0, Math.abs(v) - hbAt(t, d.B)));
}
