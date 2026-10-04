// The Drum Rockies: Drum Island's mountains, shaped like drums — sheer-sided
// cylinders standing straight up out of the snow, their flat tops capped
// white — and the tallest, Drum Rock, in the middle of the island with Drum
// Castle on top (see islandgen.js `drums`, Drum Island in data/islands).
//
// A drum is a plateau of walkable snow ringed by its cliff: the tiles whose
// corners are all inside its round are its top; those that straddle the
// round are its face (snow-rock: nobody walks up a cliff — off the top of
// one, you fall). The ground's height inside the round is the drum's own (`H`
// metres over the sea, see render3d/height.js), whatever the tiles say, so
// the face is a wall one tile thick.
//
// A plate is a drum of another kind: the lower canopy of Elbaph's Treasure
// Tree Adam, the Sun World, where the giants live (`plate`: oval, `Ry` its
// half-depth north to south). Its top is grassland, rolling a little and
// rising gently toward the trunk, with streams let down into it running out
// to its edge (and a pond or two), and its face the canopy's edge
// (T.CANOPY): leaves over a sheer drop — drawn by render3d/plates3d.js, its
// waters pouring off it in falls.

/** How far out a drum's face stands at angle `a` from its middle: round (a plate oval), a little uneven, as rock is. */
export function drumR(d, a) {
  const r = d.Ry ? (d.R * d.Ry) / Math.hypot(d.Ry * Math.cos(a), d.R * Math.sin(a)) : d.R;
  return r * (1 + 0.028 * Math.sin(a * 5 + d.seed) + 0.016 * Math.sin(a * 11 + d.seed * 2.3) + 0.009 * Math.sin(a * 23 + d.seed * 0.7));
}

/** How far from its middle anything of a drum can be (its widest, uneven, with a little to spare). */
const reach = (d) => Math.max(d.R, d.Ry || 0) * 1.06;

/** Is the point (x, y) inside drum `d`'s round (on its top, or within its face)? */
export function inDrum(world, d, x, y) {
  const dx = world.dx(d.x, x), dy = y - d.y, m = reach(d);
  if (dx > m || dx < -m || dy > m || dy < -m) return false;
  return dx * dx + dy * dy < drumR(d, Math.atan2(dy, dx)) ** 2;
}

/** The drum whose round the point is inside (on the surface), or null. */
export function drumAt(world, x, y) {
  const ds = world.drums;
  if (!ds?.length || world.zone !== 0) return null;
  for (const d of ds) if (inDrum(world, d, x, y)) return d;
  return null;
}

/** Is any drum within `pad` metres of (x, y)? (a cheap test before the exact one) */
export function nearDrum(world, x, y, pad = 2) {
  const ds = world.drums;
  if (!ds?.length || world.zone !== 0) return null;
  for (const d of ds) {
    const dx = world.dx(d.x, x), dy = y - d.y, m = reach(d) + pad;
    if (dx <= m && dx >= -m && dy <= m && dy >= -m) return d;
  }
  return null;
}

/**
 * The ground on top of drum `d` at (x, y): its height, the snow lying a
 * little deeper toward the middle and drifted here and there.
 */
export function drumTop(world, d, x, y) {
  if (d.plate) return plateTop(d, world.dx(d.x, x), y - d.y);
  const dx = world.dx(d.x, x), dy = y - d.y, k = Math.min(1, Math.hypot(dx, dy) / d.R);
  const drift = Math.sin(x * 0.21 + d.seed) * Math.sin(y * 0.17 - d.seed) * 0.25;
  return d.H + (1 - k * k) * Math.min(1.6, d.R * 0.03) + drift;
}

/** How a drum's tile lies: 2 its top (every corner inside), 1 its face (some inside), 0 not of it. */
export function drumTile(world, d, x, y) {
  let n = 0;
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (inDrum(world, d, x + i, y + j)) n++;
  return n === 4 ? 2 : n ? 1 : 0;
}

/** Is the tile at (x, y) the face of a drum (a cliff)? */
export function drumFace(world, x, y) {
  const d = nearDrum(world, x + 0.5, y + 0.5, 1);
  return !!d && drumTile(world, d, Math.floor(x), Math.floor(y)) === 1;
}

// ------------------------------------------------------------ plates

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Distance from (px, py) to the polyline `pts` ([[x, y], …]). */
export function polyDist(pts, px, py) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
    const d = Math.hypot(px - ax - vx * t, py - ay - vy * t);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The ground on plate `d` at (dx, dy) from its middle: level, rising a
 * little toward the trunk and rolling, the streams' beds and the ponds let
 * down into it (their water lies `WET` under the banks: plates3d.js).
 */
export function plateTop(d, dx, dy) {
  const k = Math.min(1, Math.hypot(dx / d.R, dy / d.Ry));
  let h = d.H + (1 - k * k) * 1.4 + Math.sin(dx * 0.043 + d.seed) * Math.sin(dy * 0.051 - d.seed) * 0.4;
  return h - plateCut(d, dx, dy);
}

/** How far the ground's let down at (dx, dy) on plate `d`: a stream's bed or a pond's. */
export function plateCut(d, dx, dy) {
  const w = d.water;
  if (!w) return 0;
  let cut = 0;
  for (const s of w.streams) {
    const b = s.box;
    if (dx < b[0] || dx > b[2] || dy < b[1] || dy > b[3]) continue;
    const q = polyDist(s.pts, dx, dy);
    if (q < s.hw) cut = Math.max(cut, s.depth * (1 - (q / s.hw) ** 2));
  }
  for (const p of w.ponds) {
    const e = Math.hypot((dx - p.x) / p.rx, (dy - p.y) / p.ry);
    if (e < 1.3) cut = Math.max(cut, p.depth * smooth01((1.3 - e) / 0.4));
  }
  return cut;
}

/** How far the water of a plate's streams and ponds lies under the banks (m). */
export const WET = 0.32;

/** Is (x, y) — a tile's middle — kept clear on a plate (its streams, its ponds and their banks, the trunk)? */
export function plateNoBuild(world, x, y) {
  const d = nearDrum(world, x, y, 0);
  if (!d?.plate || !d.water) return false;
  const dx = world.dx(d.x, x), dy = y - d.y;
  for (const s of d.water.streams) if (polyDist(s.pts, dx, dy) < s.hw + 2.5) return true;
  for (const p of d.water.ponds) if (Math.hypot((dx - p.x) / (p.rx + 4), (dy - p.y) / (p.ry + 4)) < 1) return true;
  for (const c of d.water.clear || []) if (Math.hypot(dx - c.x, dy - c.y) < c.r) return true;
  return false;
}
