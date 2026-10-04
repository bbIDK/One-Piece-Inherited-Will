// Terraced cities: Water 7's great stepped mound, the City of Water (see
// Water 7 in data/islands/paradise2.js and islandgen.js `terraces`).
//
// A terrace is a stack of levels round one middle — rounded rectangles, each
// smaller than the one under it — every level a flat paved top `h` metres
// over the sea. The innermost level a point lies inside is the one it's on
// (render3d/height.js asks here first). Each level's edge is a retaining wall
// of cut stone: the tiles that straddle it are the face, a wall nobody walks
// up (they're T.MASONRY), drawn over by render3d/terraces3d.js.
//
// Stairways climb every wall, a flight on each side (east and west) hugging
// it on the level below: from its foot level with that level, up to a
// landing level with the top, where the wall opens onto it — and turning back
// the other way for the next wall up, so the flights zigzag up the mound.
//
// The great fountain on the top level overflows to its four corners in
// shallow stone gutters; the water pours over each corner to the level
// below, runs on across it to the next corner, and so down to the foot,
// where a canal takes it out to the sea.

const R2 = Math.SQRT1_2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A terrace from its data, round (x, y) (tiles; rounded to whole metres, so
 * its edges fall on the tile grid): `levels` [{ ax, ay, rc, h }] from the
 * outermost in (half extents, corner radius, height), all in metres; the
 * stairways' width and pitch; the fountain basin's radius on the top level.
 */
export function makeTerrace(spec, x, y, island) {
  const T = {
    x: Math.round(x), y: Math.round(y), island,
    base: spec.base ?? 2, // (about where the land round its foot lies)
    L: spec.levels.map((l) => ({ ax: l.ax, ay: l.ay, rc: l.rc ?? 8, h: l.h })),
    ramps: [], chans: [], falls: [],
    basinR: spec.basin ?? 9,
    gutter: { hw: 1.25, depth: 0.42 },
  };
  const n = T.L.length;
  const W = spec.stairWidth ?? 4, pitch = spec.pitch ?? 3, land = 4;
  // the stairways: one each side of every wall, rising north and south by turns
  for (let k = 0; k < n; k++) {
    const lo = k ? T.L[k - 1].h : T.base, rise = T.L[k].h - lo;
    const len = Math.round(rise * pitch) + land;
    const room = T.L[k].ay - T.L[k].rc - 1.5;
    const half = Math.min(len / 2, room);
    for (const side of [1, -1]) {
      T.ramps.push({ k, side, up: k % 2 ? 1 : -1, a0: -half, a1: half, land, w: W, lo, hi: T.L[k].h });
    }
  }
  // the water: lips at every level's corners; gutters from one to the next
  const lip = (k, sx, sy) => {
    const l = T.L[k];
    return { x: sx * (l.ax - l.rc + l.rc * R2), y: sy * (l.ay - l.rc + l.rc * R2) };
  };
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (let k = 0; k < n; k++) {
        const b = lip(k, sx, sy);
        // (from the fountain's rim on the top level, else from the foot of the fall above)
        const a = k === n - 1 ? { x: sx * (T.basinR + 0.4) * R2, y: sy * (T.basinR + 0.4) * R2 } : (() => { const p = lip(k + 1, sx, sy); return { x: p.x + sx * 1.6 * R2, y: p.y + sy * 1.6 * R2 }; })();
        T.chans.push({ k, ax: a.x, ay: a.y, bx: b.x, by: b.y, sx, sy });
        T.falls.push({ k, sx, sy, x: b.x, y: b.y, top: T.L[k].h, foot: k ? T.L[k - 1].h : 0 });
      }
    }
  }
  // the ways kept open across each level, from a stairway's landing to the
  // foot of the next one up (nothing is built on them: see terraceNoBuild)
  T.ways = [];
  for (let k = 0; k < n - 1; k++) {
    const r = T.ramps.find((q) => q.k === k), y0 = r.up * (r.a1 - r.land) - 1, y1 = r.up * r.a1 + r.up;
    for (const side of [1, -1]) {
      const xa = side * (T.L[k + 1].ax + 0.5), xb = side * (T.L[k].ax - 0.5);
      T.ways.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: Math.min(y0, y1) - 1, y1: Math.max(y0, y1) + 1 });
    }
  }
  const o = T.L[0];
  T.box = { x0: -o.ax - W - 4, x1: o.ax + W + 4, y0: -o.ay - 4, y1: o.ay + 4 };
  return T;
}

/**
 * Signed distance from a level's edge: negative inside, positive outside
 * (a rounded rectangle's).
 */
export function edgeDist(l, dx, dy) {
  const qx = Math.abs(dx) - (l.ax - l.rc), qy = Math.abs(dy) - (l.ay - l.rc);
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - l.rc;
}

/** The innermost level (dx, dy) is on, or -1 (off the terrace: the land at its foot). */
export function levelOf(T, dx, dy) {
  for (let k = T.L.length - 1; k >= 0; k--) if (edgeDist(T.L[k], dx, dy) <= 1e-6) return k;
  return -1;
}

/** How far up stairway `r` the point is (0 at its foot … 1 on its landing), or -1 off it. */
function rampT(T, r, dx, dy) {
  const l = T.L[r.k];
  const b = r.side * dx - l.ax; // (out from the wall)
  if (b <= 0 || b > r.w) return -1;
  const along = dy * r.up;
  if (along < r.a0 || along > r.a1) return -1;
  return clamp01((along - r.a0) / Math.max(1, r.a1 - r.land - r.a0));
}

/** Distance from (px, py) to the segment a–b. */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? clamp01(((px - ax) * vx + (py - ay) * vy) / l2) : 0;
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

/**
 * The ground at a tile corner on the terrace, as offsets from its middle:
 * into `out` { h, base } — h the height (base: true for the lowest flight,
 * whose foot is the land's own: the height is then out.t of the way from
 * the land to out.h) — and true; false off it (the land's own height).
 */
export function terraceGround(T, dx, dy, out) {
  if (dx < T.box.x0 || dx > T.box.x1 || dy < T.box.y0 || dy > T.box.y1) return false;
  const k = levelOf(T, dx, dy);
  // (a stairway up to level k + 1 stands on level k, or on the land for the first)
  for (const r of T.ramps) {
    if (r.k !== k + 1) continue;
    const t = rampT(T, r, dx, dy);
    if (t < 0) continue;
    out.base = r.k === 0;
    out.t = t;
    out.h = out.base ? r.hi : r.lo + (r.hi - r.lo) * t;
    return true;
  }
  if (k < 0) return false;
  let h = T.L[k].h;
  // (the gutters are a little below the paving)
  for (const c of T.chans) if (c.k === k && segDist(dx, dy, c.ax, c.ay, c.bx, c.by) < T.gutter.hw) { h -= T.gutter.depth; break; }
  out.h = h; out.base = false; out.t = 1;
  return true;
}

const G = { h: 0, base: false, t: 1 };
/**
 * What tile (x, y) of the terrace is: 'wall' (a face, or a stairway's
 * parapet or end — the ground across it jumps), 'stair' (a flight or its
 * landing), 'gutter', 'top' (paving), or null off it. (The land at the foot
 * is taken as level with the terrace's base here.)
 */
export function terraceTile(T, x, y) {
  const dx0 = x - T.x, dy0 = y - T.y;
  if (dx0 < T.box.x0 - 1 || dx0 > T.box.x1 + 1 || dy0 < T.box.y0 - 1 || dy0 > T.box.y1 + 1) return null;
  let lo = Infinity, hi = -Infinity, on = 0;
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= 1; i++) {
      let h = T.base;
      if (terraceGround(T, dx0 + i, dy0 + j, G)) { on++; h = G.base ? T.base + (G.h - T.base) * G.t : G.h; }
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  if (!on) return null;
  if (hi - lo > 0.75) return 'wall';
  const cx = dx0 + 0.5, cy = dy0 + 0.5;
  if (rampAt(T, cx, cy)) return 'stair';
  const k = levelOf(T, cx, cy);
  if (k < 0) return null;
  for (const c of T.chans) if (c.k === k && segDist(cx, cy, c.ax, c.ay, c.bx, c.by) < T.gutter.hw + 0.5) return 'gutter';
  return 'top';
}

/** Is (dx, dy) on a stairway (its flight or its landing)? */
function rampAt(T, dx, dy) {
  const k = levelOf(T, dx, dy);
  for (const r of T.ramps) if (r.k === k + 1 && rampT(T, r, dx, dy) >= 0) return true;
  return false;
}

/** The terrace (if any) whose ground (x, y) is on, with the world's wrap. */
export function terraceAt(world, x, y) {
  const ts = world.terraces;
  if (!ts?.length || world.zone !== 0) return null;
  for (const T of ts) {
    const dx = world.dx(T.x, x), dy = y - T.y;
    if (dx >= T.box.x0 - 1 && dx <= T.box.x1 + 1 && dy >= T.box.y0 - 1 && dy <= T.box.y1 + 1) return T;
  }
  return null;
}

/** Nothing is built on a stairway or across a gutter (see towngen.js). */
export function terraceNoBuild(world, x, y) {
  const T = terraceAt(world, x, y);
  if (!T) return false;
  const tx = T.x + world.dx(T.x, Math.floor(x)), ty = Math.floor(y);
  const k = terraceTile(T, tx, ty);
  if (k === 'stair' || k === 'gutter' || k === 'wall') return true;
  // (and the ways across from one stairway to the next)
  const dx = tx + 0.5 - T.x, dy = ty + 0.5 - T.y;
  for (const b of T.ways) if (dx >= b.x0 && dx <= b.x1 && dy >= b.y0 && dy <= b.y1) return true;
  return false;
}
