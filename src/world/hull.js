// The shape of a ship's hull, shared by the 3D view (which builds it) and the
// game (which lets people walk its decks): the dimensions, the half-beam along
// the length, and the floor heights of the decks. Heights are metres above the
// waterline; t runs 0 (stern) → 1 (bow), v across (+ to starboard), u is
// metres forward of the middle.
//
// The big ships (One Piece-scale galleons and battleships, 16 m and up) are
// laid out like the real thing: a waist-high bulwark round the main deck, a
// quarterdeck over the captain's cabin aft (with a poop deck above that on the
// largest), a forecastle forward, stairs up to each along the rails — and the
// masts, the capstan and the ship's boat are things you walk round.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Ships this long or longer are the big ones (decks with stairs, cabins, a hold, walls and fittings). */
export const BIG_SHIP = 8;

/** Everything the hull, the rig and the camera need to agree on. */
export function shipDims(def) {
  if (def._dims) return def._dims;
  const d = def.length >= BIG_SHIP ? bigDims(def) : smallDims(def);
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
  // the smaller ships (a sloop, a caravel, a brigantine) are narrow: one
  // flight of stairs, up the starboard side, and the cabin door beside it
  const narrow = B < 4.8;
  // (the middling ships — a frigate, a galleon — have shorter castles, to
  // leave a main deck to work, and a higher side, for a gun deck below it)
  const large = L >= 22, mid = !narrow && !large;
  const deckY = 0.55 + B * 0.2 + (mid && L >= 16 ? 0.45 : 0);
  const bulH = 1.05;
  const fore = L >= 14;
  const hq = narrow ? 2.15 : 2.3, hf = 2.2;
  const poop = large, hp = poop ? 2.1 : 0;
  const tq = narrow ? Math.max(0.24, 2.9 / L) : mid ? 0.26 : 0.3, tf = fore ? (large ? 0.85 : 0.88) : 1, tp = poop ? 0.13 : 0;
  const yq = deckY + hq, yf = deckY + hf, yp = yq + hp;
  const masts = Math.max(1, Math.min(4, def.masts || 3));
  const tHelm = poop ? tp + 0.02 : narrow ? 0.08 : 0.1;
  const d = {
    L, B, D, open: false, big: true, narrow, deckY, bulH, castle: true, fore, poop, hq, hf, hp, tq, tf, tp, masts,
    mastH: narrow ? L * 0.95 + 3 : L + 4, helmX: -L / 2 + tHelm * L, yq, yf, yp, helmFloor: yq, sheer: 0.4, walk: 0.86,
  };
  // the bow's height (the forecastle, or the rail at the stem)
  d.bowY = fore ? yf : deckY + 0.9;
  // masts: fore, main, mizzen (and a jigger on the four-masters), metres forward of the middle
  d.mastU = ({ 1: [0.06], 2: [0.22, -0.06], 3: large ? [0.27, 0.03, -0.24] : [0.26, 0.02, -0.28], 4: [0.3, 0.1, -0.12, -0.27] })[masts].map((k) => k * L);
  d.mastR = 0.05 + L * 0.011;
  // the wheel just forward of the helmsman, and the binnacle ahead of it (where there's room)
  d.wheelU = d.helmX + 0.9;
  const bu = d.wheelU + 1.45;
  d.binnacleU = !narrow && d.mastU.every((u) => Math.abs(u - bu) > d.mastR + 0.95) && bu < xAt(d, tq) - 0.5 ? bu : null;
  // stairs along the rails: up to the quarterdeck and the forecastle from the
  // main deck, and from the quarterdeck up to the poop
  const W = narrow ? 0.95 : 1.2, sides = narrow ? [1] : [-1, 1];
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
  // ---- below: the hold (on the bigger hulls, the gun deck), a storey under the main deck
  const holdY = deckY - 2.25;
  d.holdY = holdY;
  const holdHalf = (t) => skinAt(d, t, holdY + 0.3) - 0.3;
  let h0 = 0.06, h1 = 0.94;
  while (h0 < 0.4 && holdHalf(h0) < 0.8) h0 += 0.005;
  while (h1 > 0.6 && holdHalf(h1) < 0.8) h1 -= 0.005;
  // the way down to it: on the big ships a companionway, a flight of stairs
  // through an opening amidships; on the smaller ones a hatch and a ladder
  // (clear of the masts, as near the middle of the main deck as it'll go)
  const clearU = (u0, u1, pad) => d.mastU.every((m) => m < u0 - d.mastR - pad || m > u1 + d.mastR + pad);
  const rise = deckY - holdY;
  let comp = null;
  for (const cRun of [...(large ? [rise * 1.15, rise, rise * 0.85] : []), 1.0]) {
    for (let k = 0; k < 80 && !comp; k++) {
      const tc = (mainT0 + mainT1) / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.006;
      const t0 = tc - cRun / L / 2, t1 = tc + cRun / L / 2;
      if (t0 < mainT0 + 0.5 / L || t1 > mainT1 - 0.4 / L || t0 < h0 + 0.3 / L || t1 > h1 - 0.3 / L) continue;
      if (clearU(xAt(d, t0), xAt(d, t1), cRun > 1 ? 0.7 : 0.45)) comp = { t0, t1, ladder: cRun <= 1 };
    }
    if (comp) break;
  }
  if (!comp) comp = { t0: (mainT0 + mainT1) / 2 - 0.5 / L, t1: (mainT0 + mainT1) / 2 + 0.5 / L, ladder: true };
  const cw = comp.ladder ? 0.8 : narrow ? 0.9 : 1.1;
  // (you go down facing aft: the top of the flight is its forward end)
  d.comp = { ...comp, w: cw, u0: xAt(d, comp.t0), u1: xAt(d, comp.t1) };
  d.stairs.push({ ta: comp.t0, tb: comp.t1, ha: holdY, hb: deckY, la: 'hold', lb: 'main', s: 0, va: -cw / 2, vb: cw / 2, down: true, ladder: comp.ladder });
  d.hatchT = (comp.t0 + comp.t1) / 2;
  // amidships: the capstan and the ship's boat on its chocks, where there's room
  const freeT = (want, len, pad) => {
    for (let k = 0; k < 60; k++) {
      const tc = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.008;
      const u0 = xAt(d, tc) - len / 2, u1 = u0 + len;
      if (tc - len / L / 2 < mainT0 + 0.3 / L || tc + len / L / 2 > mainT1 - 0.3 / L) continue;
      if (!clearU(u0, u1, pad)) continue;
      if (u1 > d.comp.u0 - pad && u0 < d.comp.u1 + pad) continue;
      return tc;
    }
    return null;
  };
  d.capstanT = L >= 14 ? freeT(masts >= 4 ? 0.54 : 0.385, 0.9, 0.7) : null;
  const bl = Math.min(4.5, L * 0.16), bt = L >= 16 ? freeT(masts >= 4 ? 0.69 : 0.645, bl, 0.6) : null;
  if (bt !== null && d.capstanT !== null && Math.abs(xAt(d, bt) - xAt(d, d.capstanT)) < bl / 2 + 1.2) d.boat = null;
  else d.boat = bt !== null ? { u0: (bt - 0.5) * L - bl / 2, u1: (bt - 0.5) * L + bl / 2, w: Math.min(1.9, B * 0.3) } : null;
  // the guns: on deck, run out through ports in the bulwarks between the
  // stairs — only where they leave room to walk past a mast, the capstan, the
  // boat or the hatch — and, on the bigger hulls, a gun deck below
  const gs = Math.max(0.6, Math.min(1, B / 6.5));
  d.gunScale = gs;
  const rows = [{ y: deckY + 0.42, t0: mainT0 + 0.5 / L, t1: mainT1 - 0.5 / L, lid: 0.42, open: 1.4, deck: true }];
  if (deckY - 1.3 - 0.3 > 0.3) rows.push({ y: deckY - 1.3, t0: Math.max(0.12, h0 + 0.8 / L), t1: Math.min(0.86, h1 - 0.8 / L), lid: 0.6, open: 1.05 });
  const perSide = Math.ceil((def.cannons || 0) / 2);
  const capU = d.capstanT !== null ? (d.capstanT - 0.5) * L : null;
  const centre = (u) => {
    let w = 0;
    for (const m of d.mastU) if (Math.abs(u - m) < d.mastR + 1.05) w = Math.max(w, d.mastR + 0.5);
    if (capU !== null && Math.abs(u - capU) < 1.17) w = Math.max(w, 0.62);
    if (d.boat && u > d.boat.u0 - 0.55 && u < d.boat.u1 + 0.55) w = Math.max(w, d.boat.w / 2);
    if (u > d.comp.u0 - 0.6 && u < d.comp.u1 + 0.6) w = Math.max(w, cw / 2 + 0.05);
    return w;
  };
  const walkway = large ? 0.9 : mid ? 0.7 : 0.45;
  const offAt = (t) => hbAt(t, B) * 0.93 - 0.95 * gs;
  const fitsGun = (t) => {
    const u = (t - 0.5) * L, reach = 0.5 * gs;
    // (the carriage's width along the side is clear of anything in the middle, too)
    return [u - reach, u, u + reach].every((uu) => offAt(t) - 0.55 * gs - centre(uu) >= walkway);
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
      if (t > comp.t0 - 0.6 / L && t < comp.t1 + 0.6 / L) continue; // (the foot of the companionway)
      const off = skinAt(d, t, low.y) - 0.3 - 0.85 * gs;
      for (const s of [-1, 1]) d.lowGuns.push({ t, u: (t - 0.5) * L, v: s * off, s });
    }
  }
  // ---- rooms: the great cabin under the quarterdeck (and the captain's under
  // the poop), the forecastle, and the hold. You walk in through their doors
  // (or down the companionway); what's inside stands in your way.
  const tS = 0.02 + 0.3 / L;
  const doorV = narrow ? Math.max(-edge(tq) + 0.75, Math.min(0, qs.va - 0.75)) : 0;
  d.rooms = [
    { kind: 'cabin', t0: tS, t1: tq, floor: deckY, ceil: yq - 0.12, doors: [{ t: tq, v: doorV, w: 1.05, face: 1 }] },
  ];
  if (poop) d.rooms.push({ kind: 'captain', t0: tS, t1: tp, floor: yq, ceil: yp - 0.12, doors: [{ t: tp, v: 0, w: 1.05, face: 1 }] });
  if (fore) {
    let fe = 0.95;
    while (fe > tf + 0.03 && innerAt(d, fe, deckY + 1) < 0.85) fe -= 0.005;
    const fdv = narrow ? [Math.max(-edge(tf) + 0.75, Math.min(0, fs.va - 0.75))] : [-0.95, 0.95];
    d.rooms.push({ kind: 'forecastle', t0: tf, t1: fe, floor: deckY, ceil: yf - 0.12, doors: fdv.map((v) => ({ t: tf, v, w: 1.0, face: -1 })) });
  }
  d.rooms.push({ kind: 'hold', t0: h0, t1: h1, floor: holdY, ceil: deckY - 0.12, doors: [] });
  // the walls across the ship with their doorways (the cabin fronts), and the
  // rail round the companionway's opening on the main deck (open at its head)
  d.walls = [];
  for (const r of d.rooms) {
    for (const [t, doors] of r.kind === 'forecastle' ? [[r.t0, r.doors]] : r.kind === 'hold' ? [] : [[r.t1, r.doors]]) {
      const u = xAt(d, t), w = innerAt(d, t, r.floor + 1) + 0.1;
      let v = -w;
      for (const dr of [...doors].sort((a, b) => a.v - b.v)) { d.walls.push({ u0: u, v0: v, u1: u, v1: dr.v - dr.w / 2, y0: r.floor, y1: r.ceil + 0.12 }); v = dr.v + dr.w / 2; }
      d.walls.push({ u0: u, v0: v, u1: u, v1: w, y0: r.floor, y1: r.ceil + 0.12 });
    }
  }
  const cu0 = d.comp.u0, cu1 = d.comp.u1, ch = cw / 2 + 0.05;
  d.walls.push({ u0: cu0, v0: -ch, u1: cu1, v1: -ch, y0: deckY, y1: deckY + 1 }, { u0: cu0, v0: ch, u1: cu1, v1: ch, y0: deckY, y1: deckY + 1 }, { u0: cu0, v0: -ch, u1: cu0, v1: ch, y0: deckY, y1: deckY + 1 });
  // what you walk round: masts (on every deck they pass through), and on
  // each deck the capstan, the boat, the guns, the wheel, the belfry
  // (on deck, the fife rail round each mast; below, in the hold and the cabins, just the mast)
  d.solids = d.mastU.map((u) => ({ u, v: 0, r: d.mastR + 0.5, rIn: d.mastR + 0.08 }));
  for (const gn of d.guns) d.solids.push({ u: gn.u, v: gn.v, r: 0.55 * gs, lvl: 'main' });
  for (const gn of d.lowGuns) d.solids.push({ u: gn.u, v: gn.v, r: 0.5 * gs, lvl: 'hold' });
  if (capU !== null) d.solids.push({ u: capU, v: 0, r: 0.62, lvl: 'main' });
  d.solids.push({ u: d.wheelU, v: 0, r: 0.7, lvl: 'quarter' });
  if (d.binnacleU !== null) d.solids.push({ u: d.binnacleU, v: 0, r: 0.35, lvl: 'quarter' });
  if (fore) d.solids.push({ u: (tf + 0.03 - 0.5) * L, v: 0, r: 0.55, lvl: 'fore' }); // the belfry
  if (d.boat) d.solids.push({ u0: d.boat.u0, u1: d.boat.u1, v0: -d.boat.w / 2, v1: d.boat.w / 2, lvl: 'main' });
  // (the furniture in the rooms: see furnish)
  furnish(d);
  return d;
}

/**
 * What's in the rooms, where it stands (u, v, footprint) — shared by the 3D
 * view, which builds it, and the game, which walks round it and opens the
 * chests. `d.furniture`: { kind, room, u, v, w (along), dp (across), rot }.
 */
function furnish(d) {
  const F = (d.furniture = []);
  const put = (kind, room, t, v, w, dp, extra = {}) => {
    const r = d.rooms.find((x) => x.kind === room);
    F.push({ kind, room, u: xAt(d, t), v, w, dp, floor: r.floor, ...extra });
  };
  // the great cabin: a table with a chart and a lantern, chairs, a bunk, the sea chest
  const c = d.rooms.find((r) => r.kind === 'cabin');
  const cw = innerAt(d, (c.t0 + c.t1) / 2, c.floor + 1);
  const clen = (c.t1 - c.t0) * d.L;
  const tc = c.t0 + (c.t1 - c.t0) * 0.42;
  const big = clen > 3.4 && cw > 1.6;
  put('table', 'cabin', tc, 0, big ? 1.4 : 1.0, big ? 0.9 : 0.7);
  for (const s of [-1, 1]) put('chair', 'cabin', tc, s * ((big ? 0.9 : 0.7) / 2 + 0.3), 0.42, 0.42, { rot: s });
  put('bunk', 'cabin', c.t0 + 0.9 / d.L + 0.05, cw - 0.55, 1.9, 0.85, { along: true });
  put('chest', 'cabin', c.t0 + 0.35 / d.L + 0.02, -cw + 0.55, 0.8, 0.5, { loot: 'cabin' });
  // the captain's cabin under the poop: a desk, a chair, a chest, a bookcase
  if (d.poop) {
    const p = d.rooms.find((r) => r.kind === 'captain'), pw = innerAt(d, (p.t0 + p.t1) / 2, p.floor + 1);
    put('desk', 'captain', p.t0 + (p.t1 - p.t0) * 0.45, 0, 1.2, 0.7);
    put('chest', 'captain', p.t0 + 0.4 / d.L + 0.02, pw - 0.6, 0.8, 0.5, { loot: 'captain' });
    put('shelf', 'captain', p.t0 + (p.t1 - p.t0) * 0.5, -pw + 0.3, 1.4, 0.35);
  }
  // the forecastle: the crew's hammocks, a stove and a mess table
  const f = d.rooms.find((r) => r.kind === 'forecastle');
  if (f) {
    const fw = innerAt(d, (f.t0 + f.t1) / 2, f.floor + 1), fm = (f.t0 + f.t1) / 2;
    put('stove', 'forecastle', f.t0 + 0.7 / d.L + 0.02, fw - 0.5, 0.8, 0.7);
    put('table', 'forecastle', fm, 0, 1.3, 0.75);
    for (let i = 0; i < 3; i++) put('hammock', 'forecastle', f.t0 + (f.t1 - f.t0) * (0.3 + i * 0.22), -fw * 0.45, 1.6, 0.6, { hang: true });
  }
  // the hold: cargo along the sides, the treasure chest at the foot of the companionway
  const h = d.rooms.find((r) => r.kind === 'hold');
  const hw = (t) => skinAt(d, t, h.floor + 0.3) - 0.3;
  const foot = d.comp.t0 - 0.9 / d.L;
  put('chest', 'hold', foot, -Math.min(0.9, hw(foot) - 0.5), 0.9, 0.55, { loot: 'hold', treasure: true });
  const gunT = d.lowGuns.map((g) => g.t);
  const taken = (t, span) => (t > d.comp.t0 - span / d.L && t < d.comp.t1 + span / d.L) || gunT.some((g) => Math.abs(g - t) * d.L < 0.9) || d.mastU.some((m) => Math.abs(xAt(d, t) - m) < d.mastR + 0.9);
  let n = 0;
  for (let t = h.t0 + 0.6 / d.L; t < h.t1 - 0.6 / d.L; t += 1.3 / d.L) {
    if (taken(t, 1.6)) continue;
    const s = n % 2 ? 1 : -1, w = hw(t);
    if (w < 1.1) continue;
    const kind = ['barrel', 'crate', 'barrels', 'sacks', 'crate', 'shot'][n % 6];
    put(kind, 'hold', t, s * (w - 0.45), 0.8, 0.8);
    n++;
  }
  for (const it of F) {
    const along = it.along || it.kind === 'hammock';
    const hu = (along ? it.w : it.dp) / 2, hv = (along ? it.dp : it.w) / 2;
    // (a hammock slung overhead is walked under; everything else is in the way)
    if (it.hang) continue;
    d.solids.push({ u0: it.u - hu, u1: it.u + hu, v0: it.v - hv, v1: it.v + hv, lvl: it.room });
  }
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

/** Half-width of the outside of a big hull at height y, t along. */
export function skinAt(d, t, y) {
  const pr = hullProfile(d, t), hb = hbAt(t, d.B);
  if (y >= pr[0][1]) return pr[0][0] * hb;
  for (let i = 0; i < pr.length - 1; i++) {
    const [w0, y0] = pr[i], [w1, y1] = pr[i + 1];
    if (y <= y0 && y >= y1) return (w0 + (w1 - w0) * (y0 - y) / Math.max(1e-6, y0 - y1)) * hb;
  }
  return 0;
}
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

/** How far (u, v) on a floor at height fl is into a wall (cabin fronts, the companionway's rail): 0 when clear. */
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

/** The flight of stairs at (t, v), if any. */
export function stairAt(d, t, v) {
  for (const s of d.stairs) if (t >= s.ta && t <= s.tb && v >= s.va && v <= s.vb) return s;
  return null;
}

/**
 * Floor height at t (and v, for the stairs of the big ships): the poop,
 * quarterdeck, main deck or forecastle — or, with your feet at height h,
 * the floor of the room you're in (a cabin, the forecastle, the hold).
 */
export function floorAt(d, t, v = null, h = null) {
  if (v !== null && d.stairs.length) {
    const s = stairAt(d, t, v);
    if (s && (!s.down || h === null || h < s.hb - 0.3 || stairHere(s, t, h))) return s.ha + (s.hb - s.ha) * (t - s.ta) / (s.tb - s.ta);
  }
  if (h !== null) { const r = roomAt(d, t, h); if (r) return r.floor; }
  if (d.poop && t < d.tp) return d.yp;
  if (d.castle && t < d.tq) return d.yq;
  if (d.fore && t > d.tf) return d.yf;
  return d.deckY;
}
/** (on the companionway's flight at t: the step there is within reach of feet at h) */
const stairHere = (s, t, h) => Math.abs(s.ha + (s.hb - s.ha) * (t - s.ta) / (s.tb - s.ta) - h) < 0.7;

/** Which deck (t, v) is on: 'poop', 'quarter', 'main' or 'fore' — or the flight of stairs it's on, or (feet at h) the room. */
export function levelAt(d, t, v, h = null) {
  const s = v !== null && d.stairs.length ? stairAt(d, t, v) : null;
  if (s && (!s.down || h === null || h < s.hb - 0.3 || stairHere(s, t, h))) return s;
  if (h !== null) { const r = roomAt(d, t, h); if (r) return r.kind; }
  if (d.poop && t < d.tp) return 'poop';
  if (d.castle && t < d.tq) return 'quarter';
  if (d.fore && t > d.tf) return 'fore';
  return 'main';
}

/** How far (u, v) is inside something standing on the deck (a mast, the capstan, the boat): 0 when clear. `lvl`: only what's on that deck. */
export function solidAt(d, u, v, margin = 0, lvl = null) {
  let depth = 0;
  const inside = lvl === 'hold' || lvl === 'cabin' || lvl === 'captain' || lvl === 'forecastle';
  for (const o of d.solids) {
    if (o.lvl && lvl !== null && o.lvl !== lvl) continue;
    if (o.r !== undefined) depth = Math.max(depth, (inside && o.rIn !== undefined ? o.rIn : o.r) + margin - Math.hypot(u - o.u, v - o.v));
    else depth = Math.max(depth, Math.min(u - (o.u0 - margin), o.u1 + margin - u, v - (o.v0 - margin), o.v1 + margin - v));
  }
  return depth;
}

/** The ship's gentle rise and fall on the swell (as the 3D view draws it). */
export function shipBob(ship, time) { return (ship.lvl || 0) + 0.05 + Math.sin((time + (ship.seed || 0)) * 1.3) * 0.07; }
/** How much higher than the middle a point `along` metres toward the bow rides (the ship pitched up a slope). */
export const pitchRise = (ship, along) => (ship.pitch ? along * Math.tan(ship.pitch) : 0);

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
    const depth = Math.max(margin - out.edge, solidAt(d, u, v, Math.max(0, margin), room.kind), wallDepth(d, u, v, room.floor, margin));
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
    let depth = solidAt(d, u, v, Math.max(0, margin), d.big ? lv ?? 'stairs' : null);
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
