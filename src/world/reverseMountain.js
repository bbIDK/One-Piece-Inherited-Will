// Reverse Mountain, where the Red Line meets the Grand Line. The currents of
// all four Blues run into the Red Line's cliffs through great stone gates,
// along gorges cut through the rock, and then UP the mountain — the sea
// climbing a slope of rock — to meet in a pool on the snowy summit. From there
// one torrent plunges down the far side and out between the Twin Capes into
// Paradise. Every current runs one way: once you're in, the only way out is
// the Grand Line.
//
// This module holds the shape of it all (world tiles, 1 tile = 1 m): the
// canals as smooth centre lines with a water level along them, the mountain
// they climb, and queries for the rest of the game (how high the water is
// here, which way it flows, how far to the canal's middle).
import { RM_X, EQ } from './constants.js';

export const RM = {
  x: RM_X,
  y: EQ,
  rx: 900, // the massif's reach across the Red Line (the coast bulges out this far)…
  ry: 2150, // …and along it
  top: 160, // water level of the summit pool, metres above the sea
  poolR: 56, // (room for the greatest ships to turn out into the torrent)
  halfW: 17, // half the width of a canal (a great galleon rides it with room either side)
  climb: 740, // the last stretch of each canal, where it climbs the mountain
  drop: 620, // the torrent down to Paradise
  cone: { rx: 760, ry: 1250, h: 110 }, // the mountain standing on the Red Line
  upSpeed: 20, // m/s of the currents up the mountain…
  downSpeed: 28, // …and of the torrent down
};

// the canals, as control points relative to the summit (out along +x and
// +y; each canal's sx, sy turn them toward its Blue: north is −y)
// (the last point is inside the summit pool, so the canal runs right into it)
const UP_PTS = [[1150, 2020], [620, 1900], [300, 1560], [150, 950], [70, 420], [24, 70], [8, 22]];
const EXIT_PTS = [[30, 0], [260, 6], [620, -8], [980, 4], [1230, 0]];
export const CANALS = [
  { id: 'east_blue', sx: 1, sy: -1 },
  { id: 'north_blue', sx: -1, sy: -1 },
  { id: 'west_blue', sx: -1, sy: 1 },
  { id: 'south_blue', sx: 1, sy: 1 },
  { id: 'exit', exit: true },
];

const STEP = 4; // metres between samples along a canal
const CELL = 32; // spatial index cell

function catmull(pts, step) {
  // a smooth curve through the points, sampled every `step` metres (roughly)
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Build the canals' sample lines (absolute world tiles). */
function build() {
  for (const c of CANALS) {
    const pts = c.exit ? EXIT_PTS : UP_PTS.map(([x, y]) => [x * c.sx, y * c.sy]);
    const raw = catmull(pts, STEP);
    const n = raw.length;
    c.x = new Float32Array(n); c.y = new Float32Array(n); c.s = new Float32Array(n);
    c.lv = new Float32Array(n); c.fx = new Float32Array(n); c.fy = new Float32Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i) s += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
      c.x[i] = RM.x + raw[i][0]; c.y[i] = RM.y + raw[i][1]; c.s[i] = s;
    }
    c.len = s;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = c.x[b] - c.x[a], dy = c.y[b] - c.y[a], d = Math.hypot(dx, dy) || 1;
      c.fx[i] = dx / d; c.fy[i] = dy / d;
      const si = c.s[i];
      // up: level with the sea, then climbing the last stretch; exit: down from the summit
      c.lv[i] = c.exit ? RM.top * (1 - smooth((si - 30) / RM.drop)) : RM.top * smooth((si - (s - RM.climb)) / RM.climb);
    }
  }
  // spatial index of the samples
  const grid = new Map();
  CANALS.forEach((c, ci) => {
    for (let i = 0; i < c.x.length; i++) {
      const k = Math.floor(c.x[i] / CELL) * 65536 + Math.floor(c.y[i] / CELL);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(ci, i);
    }
  });
  RM.grid = grid;
}
build();

/** The level of a canal at distance s along it. */
export function canalLevel(c, s) {
  if (c.exit) return RM.top * (1 - smooth((s - 30) / RM.drop));
  return RM.top * smooth((s - (c.len - RM.climb)) / RM.climb);
}

const HIT = { canal: null, i: 0, d: 0, s: 0, level: 0, fx: 0, fy: 0, side: 0, pool: false };
// (how hard the pool's current, heading out, turns onto the torrent's line: a metre off it)
const POOL_CURL = 0.2;
/**
 * The canal nearest (x, y) within `reach` metres of its middle — { canal, d
 * (from the middle line), s (along it), level, fx, fy (the way it flows),
 * side (+ right of the flow), pool } — or null. The summit pool counts as
 * the head of the torrent. (x must be unwrapped near RM.x: pass RM.x + dx.)
 */
export function canalAt(x, y, reach = 40, out = HIT) {
  const dxs = x - RM.x, dys = y - RM.y;
  if (Math.abs(dxs) > 1400 || Math.abs(dys) > 2200) return null;
  const pd = Math.hypot(dxs, dys);
  if (pd < RM.poolR) {
    out.canal = CANALS[4]; out.i = 0; out.d = 0; out.s = 0; out.level = RM.top; out.pool = true;
    // the four currents meet in the middle and pour out east into the
    // torrent: in to the middle first (so even the longest ship has her whole
    // length in the pool, clear of the canal she came up, before she turns),
    // then out along the torrent's line — never round the rim, where a ship
    // carried in from the north or the south would scrape the rock
    const c = pd > 1e-3 ? dxs / pd : 1;
    const a = smooth((pd - 3) / 7) * (1 - smooth((c - 0.7) / 0.27));
    out.fx = (pd > 1e-3 ? -dxs / pd * a : 0) + (1 - a);
    out.fy = (pd > 1e-3 ? -dys / pd * a : 0) - (1 - a) * dys * POOL_CURL;
    const f = Math.hypot(out.fx, out.fy) || 1; out.fx /= f; out.fy /= f;
    out.side = 0;
    return out;
  }
  let best = -1, bc = 0, bd = reach * reach;
  const r = Math.ceil(reach / CELL);
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      const l = RM.grid.get((cx + i) * 65536 + (cy + j));
      if (!l) continue;
      for (let k = 0; k < l.length; k += 2) {
        const c = CANALS[l[k]], si = l[k + 1];
        const ex = x - c.x[si], ey = y - c.y[si];
        const d2 = ex * ex + ey * ey;
        if (d2 < bd) { bd = d2; best = si; bc = l[k]; }
      }
    }
  }
  if (best < 0) return null;
  const c = CANALS[bc];
  // onto the segment either side of the nearest sample, for a smooth answer
  let s = c.s[best], px = c.x[best], py = c.y[best];
  const ax = x - px, ay = y - py;
  const along = ax * c.fx[best] + ay * c.fy[best];
  s = Math.max(0, Math.min(c.len, s + along));
  const side = ax * -c.fy[best] + ay * c.fx[best];
  out.canal = c; out.i = best; out.s = s; out.d = Math.abs(side); out.side = side;
  out.level = canalLevel(c, s); out.fx = c.fx[best]; out.fy = c.fy[best]; out.pool = false;
  return out;
}

/** Height of the mountain standing on the Red Line at (x, y) (0 away from it). */
export function coneAt(x, y) {
  const C = RM.cone;
  const r = Math.hypot((x - RM.x) / C.rx, (y - RM.y) / C.ry);
  if (r >= 1) return 0;
  const k = 1 - r;
  return C.h * k * k * (3 - 2 * k);
}

/** Is (x, y) (unwrapped near RM.x) anywhere near the mountain? */
export const nearRM = (x, y) => Math.abs(x - RM.x) < RM.rx + 500 && Math.abs(y - RM.y) < RM.ry + 400;
