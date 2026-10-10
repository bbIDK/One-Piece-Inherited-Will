// The ground moved by a Devil Fruit — for a while. Whitebeard's quake tilts
// the land and the sea with it, Fujitora's gravity presses a crater, a quake
// splits a trench, darkness swallows a pit, ice heaves up... and then it
// settles back as it was. Each deformation is a shape (local, a few dozen
// metres at most) and an envelope in time: it comes on fast, holds, and
// eases back to nothing. The ground under your feet (render3d/height.js
// terrain) and the ground drawn (render3d/deform3d.js: the same shapes in
// the shaders) are the same function of the same list.

const MAX = 8;

/** The live deformations, and the time they're read at (game time, seconds). */
export const DEFORM = { list: [], pads: [], now: 0, world: null, seq: 0 };

const KINDS = { tilt: 1, crater: 2, trench: 3, rise: 4, ice: 5 };

/**
 * A deformation: `kind` tilt (one side up, the other down, the sea with it),
 * crater (a bowl with a rim), trench (a split along `ang` for `r` metres,
 * `w` wide), rise (a mound heaved up); at world (x, y), radius `r`, height
 * `amp` metres; `rise`, `hold`, `fall` seconds; `wob` a shudder while it
 * comes on (a quake); `delay` seconds before it starts (a meteor still falling). Returns it.
 */
export function addDeform(o) {
  const d = {
    kind: KINDS[o.kind] || 1, x: o.x, y: o.y, r: o.r || 12, amp: o.amp ?? 2, ang: o.ang || 0, w: o.w || 2,
    rise: o.rise ?? 0.35, hold: o.hold ?? 4, fall: o.fall ?? 3, wob: o.wob || 0,
    t0: DEFORM.now + (o.delay || 0), id: ++DEFORM.seq,
  };
  d.c = Math.cos(d.ang); d.s = Math.sin(d.ang);
  DEFORM.list.push(d);
  while (DEFORM.list.length > MAX) DEFORM.list.shift();
  return d;
}

/** Advance to game time `now`, dropping those that have settled. */
export function tickDeform(now, world) {
  // (another world — a zone, a new game — or time run back: what was moved belongs to the old one)
  if ((world && DEFORM.world && world !== DEFORM.world) || now < DEFORM.now - 1) DEFORM.list.length = 0;
  DEFORM.now = now;
  if (world) DEFORM.world = world;
  if (DEFORM.list.length) DEFORM.list = DEFORM.list.filter((d) => now - d.t0 < d.rise + d.hold + d.fall && d.t0 - now < 30);
  if (DEFORM.pads.length) DEFORM.pads = DEFORM.pads.filter((d) => now < d.end && d.t0 - now < 30);
}

export function clearDeform() { DEFORM.list.length = 0; DEFORM.pads.length = 0; }

/**
 * A pad of ice frozen under an ice user's feet as they walk out over the sea
 * (game/powers.js iceWalk): stood on like the Ice Age's sheet (iceCover),
 * thawing back into the sea after `hold` seconds.
 */
export function addIcePad(x, y, r, hold = 8) {
  const P = DEFORM.pads;
  P.push({ x, y, r, t0: DEFORM.now, end: DEFORM.now + hold });
  while (P.length > 80) P.shift();
}

const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How far `d` is in, 0..1, just now (with its shudder). */
export function envelope(d, now = DEFORM.now) {
  const t = now - d.t0;
  if (t < 0) return 0;
  let e;
  if (t < d.rise) e = sst(0, 1, t / d.rise);
  else if (t < d.rise + d.hold) e = 1;
  else e = 1 - sst(0, 1, (t - d.rise - d.hold) / d.fall);
  if (d.wob && t < d.rise + 1.2) e *= 1 + d.wob * Math.sin(t * 38) * Math.exp(-t * 2.2);
  return e;
}

/**
 * The shape of `d` at (lx, ly) metres from its centre, at full strength —
 * mirrored exactly in render3d/deform3d.js DEFORM_GLSL.
 */
export function shapeAt(kind, lx, ly, r, amp, c, s, w) {
  const dd = Math.hypot(lx, ly), q = dd / r;
  if (kind === 1) {
    // tilt: a slab of land and sea rocked about a line through the centre
    if (q >= 1) return 0;
    const fade = 1 - sst(0.55, 1, q);
    return amp * ((lx * c + ly * s) / r) * fade;
  }
  if (kind === 2) {
    // crater: pressed down into a bowl, the ground heaped at its lip
    if (q >= 1.5) return 0;
    const bowl = q < 1 ? -amp * (1 - q * q) : 0;
    return bowl + amp * 0.3 * Math.exp(-(((q - 1) / 0.18) ** 2));
  }
  if (kind === 3) {
    // trench: split open along the line, deepest in the middle of its run
    const u = lx * c + ly * s, v = -lx * s + ly * c;
    if (u < -w || u > r + w) return 0;
    const run = sst(-w, w * 0.5, u) * (1 - sst(r - w * 1.5, r + w, u));
    return -amp * Math.exp(-((v / w) ** 2)) * run + amp * 0.18 * Math.exp(-(((Math.abs(v) - w * 1.3) / (w * 0.5)) ** 2)) * run;
  }
  // (ice: the sea frozen over — no change to the ground's shape; see iceCover)
  if (kind === 5) return 0;
  if (kind === 4) {
    // rise: heaved up in a mound
    if (q >= 1) return 0;
    return amp * (1 - sst(0, 1, q));
  }
  return 0;
}

/** The top of the ice a Hie Hie technique froze the sea into (metres over the sea's level). */
export const ICE_TOP = 0.32;

/**
 * Is the sea at world (x, y) frozen over just now (Ice Age: a road of ice)?
 * The edge of the sheet is ragged, as broken ice is.
 */
export function iceCover(x, y) {
  const L = DEFORM.list;
  const w = DEFORM.world;
  // (the pads frozen underfoot as an ice user walks the sea: shrinking as they thaw)
  for (const d of DEFORM.pads) {
    const left = d.end - DEFORM.now, k = Math.min(1, left / 1.5);
    const lx = w?.dx ? w.dx(d.x, x) : x - d.x;
    if (Math.hypot(lx, y - d.y) < d.r * k) return true;
  }
  if (!L.length) return false;
  for (const d of L) {
    if (d.kind !== 5) continue;
    const e = envelope(d);
    if (e < 0.25) continue;
    const lx = w?.dx ? w.dx(d.x, x) : x - d.x, ly = y - d.y;
    const th = Math.atan2(ly, lx);
    const rag = 1 + 0.07 * Math.sin(th * 7 + d.id) + 0.04 * Math.sin(th * 17 + d.id * 3);
    if (Math.hypot(lx, ly) < d.r * rag * Math.min(1, e * 1.3)) return true;
  }
  return false;
}

/**
 * How far the ground at world (x, y) stands off its own height just now.
 * `sea`: only what moves the sea too (a tilt).
 */
export function deformAt(x, y, sea = false) {
  const L = DEFORM.list;
  if (!L.length) return 0;
  const w = DEFORM.world;
  let h = 0;
  for (const d of L) {
    if (sea && d.kind !== 1) continue;
    const lx = w?.dx ? w.dx(d.x, x) : x - d.x, ly = y - d.y;
    const R = d.kind === 3 ? d.r + d.w * 2 : d.r * 1.5;
    if (Math.abs(lx) > R + 2 || Math.abs(ly) > R + 2) continue;
    const e = envelope(d);
    if (e) h += e * shapeAt(d.kind, lx, ly, d.r, d.amp, d.c, d.s, d.w);
  }
  return h;
}
