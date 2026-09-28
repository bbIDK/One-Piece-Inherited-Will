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

/** Ships this long or longer are the big ones (decks with stairs, walls and fittings). */
export const BIG_SHIP = 12;

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
  const masts = def.masts || 1;
  const mastH = 1.2 + L * 0.75;
  const helmX = -L * 0.42;
  const d = {
    L, B, D, open, deckY, bulH, castle, fore, hq, hf, tq, tf, masts, mastH, helmX,
    yq: deckY + hq, yf: deckY + hf,
    helmFloor: castle ? deckY + hq : deckY,
    big: false, poop: false, hp: 0, tp: 0, sheer: 0.16 * B, walk: 0.94, stairs: [], solids: [],
  };
  // the masts (you walk round them, and a camera keeps out of them) and the wheel's post
  d.mastU = Array.from({ length: masts }, (_, m) => (masts === 1 ? 0.05 * L : L * (0.28 - m * (0.56 / Math.max(1, masts - 1)))));
  d.mastR = 0.05 + L * 0.011;
  d.solids = d.mastU.map((u) => ({ u, v: 0, r: d.mastR + 0.16 }));
  if (!open) d.solids.push({ u: helmX + 1.1, v: 0, r: 0.2 });
  return d;
}

function bigDims(def) {
  const L = def.length, B = def.beam;
  const D = B * 0.45;
  const deckY = 0.55 + B * 0.2;
  const bulH = 1.05;
  const hq = 2.3, hf = 2.2;
  const poop = L >= 20, hp = poop ? 2.1 : 0;
  const tq = 0.3, tf = 0.85, tp = poop ? 0.13 : 0;
  const yq = deckY + hq, yf = deckY + hf, yp = yq + hp;
  const masts = def.masts || 3;
  const tHelm = poop ? tp + 0.02 : 0.1;
  const d = {
    L, B, D, open: false, big: true, deckY, bulH, castle: true, fore: true, poop, hq, hf, hp, tq, tf, tp, masts,
    mastH: L + 4, helmX: -L / 2 + tHelm * L, yq, yf, yp, helmFloor: yq, sheer: 0.4, walk: 0.86,
  };
  // masts: fore, main, mizzen (and a jigger on the four-masters), metres forward of the middle
  d.mastU = (masts >= 4 ? [0.3, 0.1, -0.12, -0.27] : [0.27, 0.03, -0.24]).map((k) => k * L);
  d.mastR = 0.05 + L * 0.011;
  // the double wheel just forward of the helmsman, and the binnacle ahead of it (where there's room)
  d.wheelU = d.helmX + 0.9;
  const bu = d.wheelU + 1.45;
  d.binnacleU = d.mastU.every((u) => Math.abs(u - bu) > d.mastR + 0.95) ? bu : null;
  // amidships: the main hatch (a grating), the capstan, and the ship's boat on its chocks
  d.hatchT = masts >= 4 ? 0.47 : 0.45;
  d.capstanT = masts >= 4 ? 0.54 : 0.385;
  const bl = Math.min(4.5, L * 0.16), bt = masts >= 4 ? 0.69 : 0.645;
  d.boat = { u0: (bt - 0.5) * L - bl / 2, u1: (bt - 0.5) * L + bl / 2, w: Math.min(1.9, B * 0.3) };
  // stairs along the rails: up to the quarterdeck and the forecastle from the
  // main deck, and from the quarterdeck up to the poop
  const run = (rise) => rise * 1.3;
  const edge = (t) => hbAt(t, B) * d.walk - 0.22;
  const W = 1.2;
  d.stairs = [];
  const flight = (ta, tb, ha, hb, la, lb) => {
    const vo = Math.min(edge(ta), edge(tb)), vi = vo - W;
    for (const s of [-1, 1]) d.stairs.push({ ta, tb, ha, hb, la, lb, s, va: s > 0 ? vi : -vo, vb: s > 0 ? vo : -vi });
  };
  flight(tq, tq + run(hq) / L, yq, deckY, 'quarter', 'main');
  flight(tf - run(hf) / L, tf, deckY, yf, 'main', 'fore');
  if (poop) flight(tp, tp + run(hp) / L, yp, yq, 'poop', 'quarter');
  // the gunports: a row through the bulwarks between the stairs (with the guns
  // on deck behind them) and, on the bigger hulls, a gun deck below
  const qs = d.stairs.find((s) => s.la === 'quarter' && s.lb === 'main'), fs = d.stairs.find((s) => s.lb === 'fore');
  const rows = [{ y: deckY + 0.42, t0: qs.tb + 0.6 / L, t1: fs.ta - 0.6 / L, lid: 0.42, open: 1.4, deck: true }];
  if (deckY - 1.25 > 0.45) rows.push({ y: deckY - 0.95, t0: 0.1, t1: 0.86, lid: 0.6, open: 1.05 });
  const per = Math.max(3, Math.min(16, Math.round((def.cannons || 12) / 2 / rows.length)));
  for (const r of rows) r.n = r.deck ? Math.max(2, Math.min(per, Math.floor((r.t1 - r.t0) * L / 1.9))) : per;
  d.gunRows = rows;
  // the guns on deck, run out through the upper ports — except where one would
  // leave no room to walk past a mast, the capstan or the boat (that port stays shut)
  const capU = (d.capstanT - 0.5) * L;
  const centre = (u) => {
    let w = 0;
    for (const m of d.mastU) if (Math.abs(u - m) < d.mastR + 1.05) w = Math.max(w, d.mastR + 0.5);
    if (Math.abs(u - capU) < 1.17) w = Math.max(w, 0.62);
    if (u > d.boat.u0 - 0.55 && u < d.boat.u1 + 0.55) w = Math.max(w, d.boat.w / 2);
    return w;
  };
  d.guns = [];
  const top = rows[0];
  for (let i = 0; i < top.n; i++) {
    const t = top.t0 + (top.t1 - top.t0) * (i + 0.5) / top.n, u = (t - 0.5) * L;
    const off = hbAt(t, B) * 0.93 - 0.95;
    const stowed = off - 0.55 - centre(u) < 0.9;
    for (const s of [-1, 1]) d.guns.push({ t, u, v: s * off, s, stowed });
  }
  // what you walk round: masts, the capstan, the boat, the guns
  d.solids = d.mastU.map((u) => ({ u, v: 0, r: d.mastR + 0.5 })); // (the fife rail round each mast)
  for (const gn of d.guns) if (!gn.stowed) d.solids.push({ u: gn.u, v: gn.v, r: 0.55 });
  d.solids.push({ u: (d.capstanT - 0.5) * L, v: 0, r: 0.62 });
  d.solids.push({ u: d.wheelU, v: 0, r: 0.7 });
  if (d.binnacleU !== null) d.solids.push({ u: d.binnacleU, v: 0, r: 0.35 });
  d.solids.push({ u: (tf + 0.03 - 0.5) * L, v: 0, r: 0.55 }); // the belfry
  d.solids.push({ u0: d.boat.u0, u1: d.boat.u1, v0: -d.boat.w / 2, v1: d.boat.w / 2 });
  return d;
}

/** Where the helmsman stands: x along the hull (stern < 0) and the floor height above the waterline. */
export function helmPoint(def) {
  const d = shipDims(def);
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

/** Floor height at t (and v, for the stairs of the big ships): the poop, quarterdeck, main deck or forecastle. */
export function floorAt(d, t, v = null) {
  if (v !== null && d.stairs.length) {
    const s = stairAt(d, t, v);
    if (s) return s.ha + (s.hb - s.ha) * (t - s.ta) / (s.tb - s.ta);
  }
  if (d.poop && t < d.tp) return d.yp;
  if (d.castle && t < d.tq) return d.yq;
  if (d.fore && t > d.tf) return d.yf;
  return d.deckY;
}

/** Which deck (t, v) is on: 'poop', 'quarter', 'main' or 'fore' — or the flight of stairs it's on. */
export function levelAt(d, t, v) {
  const s = v !== null && d.stairs.length ? stairAt(d, t, v) : null;
  if (s) return s;
  if (d.poop && t < d.tp) return 'poop';
  if (d.castle && t < d.tq) return 'quarter';
  if (d.fore && t > d.tf) return 'fore';
  return 'main';
}

/** How far (u, v) is inside something standing on the deck (a mast, the capstan, the boat): 0 when clear. */
export function solidAt(d, u, v, margin = 0) {
  let depth = 0;
  for (const o of d.solids) {
    if (o.r !== undefined) depth = Math.max(depth, o.r + margin - Math.hypot(u - o.u, v - o.v));
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
 */
export function deckPoint(ship, dx, dy, margin = 0.2) {
  const d = shipDims(ship.def);
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  const t = (u + d.L / 2) / d.L;
  if (t < 0.02 || t > 0.97) return null;
  const hb = hbAt(t, d.B) * d.walk - margin;
  if (hb <= 0 || Math.abs(v) > hb) return null;
  // the bow narrows to a point: keep off the very tip
  const out = { t, u, v, h: floorAt(d, t, v), edge: hb - Math.abs(v) };
  if (d.big) out.lvl = levelAt(d, t, v);
  if (d.solids.length) {
    const depth = solidAt(d, u, v, Math.max(0, margin));
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
  if (h > topAt(d, t)) return false;
  const hb = hbAt(t, d.B);
  if (v > hb) return false;
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
