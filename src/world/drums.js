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

/** How far out a drum's face stands at angle `a` from its middle: round, a little uneven, as rock is. */
export function drumR(d, a) {
  return d.R * (1 + 0.028 * Math.sin(a * 5 + d.seed) + 0.016 * Math.sin(a * 11 + d.seed * 2.3) + 0.009 * Math.sin(a * 23 + d.seed * 0.7));
}

/** Is the point (x, y) inside drum `d`'s round (on its top, or within its face)? */
export function inDrum(world, d, x, y) {
  const dx = world.dx(d.x, x), dy = y - d.y, m = d.R * 1.06;
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
    const dx = world.dx(d.x, x), dy = y - d.y, m = d.R * 1.06 + pad;
    if (dx <= m && dx >= -m && dy <= m && dy >= -m) return d;
  }
  return null;
}

/**
 * The ground on top of drum `d` at (x, y): its height, the snow lying a
 * little deeper toward the middle and drifted here and there.
 */
export function drumTop(world, d, x, y) {
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
