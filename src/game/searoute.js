// Sea routes for the ships that aren't yours: round the land between a ship
// and where she's going, not into it and along its shore. A coarse grid over
// the stretch of sea between the two (cells a few metres across — as many as
// it takes to keep to a few thousand of them), open where a ship her size has
// room (sailable, and that far off the coast all across the cell), searched
// A* from her to it; then its corners pulled tight (a straight leg kept
// wherever the water all along it is open), so she sails straight legs round
// the headlands, not a staircase. (traffic.js: trafficAI, and engage for a
// chase.)

/** Is there open water for a ship (`room` metres of it each side) all along the way from (ax, ay) to (bx, by)? */
export function seaClear(w, ax, ay, bx, by, room) {
  const dx = w.dx(ax, bx), dy = by - ay, l = Math.hypot(dx, dy);
  const n = Math.max(1, Math.ceil(l / Math.max(2, room * 0.6)));
  for (let i = 1; i <= n; i++) {
    const x = ax + dx * (i / n), y = ay + dy * (i / n);
    if (!w.sailable(x, y) || w.sd(x, y) > -room) return false;
  }
  return true;
}

// (the most cells a search covers, and how far round the land it looks: past
// the box between the two ends, by a part of the way between them)
const MAX_CELLS = 7000, PAD_MIN = 120, PAD_MAX = 420;
const SQ2 = Math.SQRT2;

/**
 * A way by sea from (sx, sy) to (tx, ty) for a ship that needs `room` metres
 * of open water each side: the points to sail for, in order (not the start;
 * the last is the end, or the open water nearest it), or null if there's none
 * in reach. (The world wraps east-west: worked out in a frame round the start.)
 */
export function planRoute(w, sx, sy, tx, ty, room) {
  const ex = w.dx(sx, tx), ey = ty - sy, dist = Math.hypot(ex, ey);
  const pad = Math.min(PAD_MAX, Math.max(PAD_MIN, dist * 0.35));
  const x0 = Math.min(0, ex) - pad, y0 = Math.min(0, ey) - pad;
  const bw = Math.abs(ex) + pad * 2, bh = Math.abs(ey) + pad * 2;
  const c = Math.max(6, Math.sqrt((bw * bh) / MAX_CELLS));
  const nx = Math.ceil(bw / c), ny = Math.ceil(bh / c), N = nx * ny;
  // (a cell's open if she has her room all across it: its middle that much further off the coast)
  const need = Math.min(31, room + c * 0.71);
  const open = new Int8Array(N).fill(-1);
  const isOpen = (i) => {
    if (open[i] < 0) {
      const x = sx + x0 + ((i % nx) + 0.5) * c, y = sy + y0 + (Math.floor(i / nx) + 0.5) * c;
      open[i] = w.sailable(x, y) && w.sd(x, y) < -need ? 1 : 0;
    }
    return open[i] === 1;
  };
  const cellOf = (lx, ly) => {
    const cx = Math.floor((lx - x0) / c), cy = Math.floor((ly - y0) / c);
    return cx < 0 || cy < 0 || cx >= nx || cy >= ny ? -1 : cy * nx + cx;
  };
  // (from the open cell nearest an end, if the end itself is too close in to the land — up to 160 m off)
  const nearestOpen = (i0) => {
    if (i0 < 0) return -1;
    if (isOpen(i0)) return i0;
    const cx0 = i0 % nx, cy0 = Math.floor(i0 / nx);
    for (let r = 1, rmax = Math.ceil(160 / c); r <= rmax; r++) {
      let best = -1, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = cx0 + dx, cy = cy0 + dy;
          if (cx < 0 || cy < 0 || cx >= nx || cy >= ny) continue;
          const i = cy * nx + cx, d = dx * dx + dy * dy;
          if (d < bd && isOpen(i)) { bd = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  const start = nearestOpen(cellOf(0, 0)), goal = nearestOpen(cellOf(ex, ey));
  if (start < 0 || goal < 0) return null;
  // A* over the cells, eight ways round
  const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
  const gx = goal % nx, gy = Math.floor(goal / nx);
  const h = (i) => { const dx = Math.abs((i % nx) - gx), dy = Math.abs(Math.floor(i / nx) - gy); return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy); };
  const heap = [], f = new Float32Array(N);
  const push = (i) => { heap.push(i); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; }
    }
    return top;
  };
  g[start] = 0; f[start] = h(start); push(start);
  let found = false;
  while (heap.length) {
    const i = pop();
    if (shut[i]) continue;
    if (i === goal) { found = true; break; }
    shut[i] = 1;
    const cx = i % nx, cy = Math.floor(i / nx);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const qx = cx + dx, qy = cy + dy;
        if (qx < 0 || qy < 0 || qx >= nx || qy >= ny) continue;
        const j = qy * nx + qx;
        if (shut[j] || !isOpen(j)) continue;
        // (no cutting a corner of the land diagonally)
        if (dx && dy && (!isOpen(cy * nx + qx) || !isOpen(qy * nx + cx))) continue;
        const ng = g[i] + (dx && dy ? SQ2 : 1);
        if (ng < g[j]) { g[j] = ng; from[j] = i; f[j] = ng + h(j); push(j); }
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let i = goal; i >= 0; i = from[i]) { cells.push(i); if (i === start) break; }
  cells.reverse();
  // the corners pulled tight: from each point, on to the furthest one in a clear line
  const at = (i) => ({ x: w.wx(sx + x0 + ((i % nx) + 0.5) * c), y: sy + y0 + (Math.floor(i / nx) + 0.5) * c });
  const pts = cells.map(at);
  pts.push({ x: w.wx(tx), y: ty });
  const out = [];
  let cur = { x: sx, y: sy }, k = 0;
  while (k < pts.length - 1) {
    let j = pts.length - 1;
    while (j > k + 1 && !seaClear(w, cur.x, cur.y, pts[j].x, pts[j].y, room)) j--;
    out.push(pts[j]);
    cur = pts[j]; k = j;
  }
  // (the end itself, if it's in among the land, is left off: the open water nearest it is the last point)
  if (out.length > 1 && !seaClear(w, out[out.length - 2].x, out[out.length - 2].y, w.wx(tx), ty, room * 0.5)) out.pop();
  return out.length ? out : null;
}

/**
 * The heading for ship `s` to sail for (gx, gy) by sea: straight at it while
 * the water between is open, else along a route round the land (planned when
 * it's needed and kept on `s.route`; planned afresh once the end's moved on —
 * a ship she's chasing — and she's stuck, or lost it). `room`: the open water
 * she wants each side.
 */
export function seaHeading(game, s, gx, gy, room) {
  const w = game.world, now = game.time || 0;
  const direct = Math.atan2(gy - s.y, w.dx(s.x, gx));
  let R = s.route;
  // (every second or so: is the way straight there open? then there's no need of a route)
  if (!R || now >= R.check) {
    if (seaClear(w, s.x, s.y, gx, gy, room)) { s.route = { pts: null, check: now + 1 }; return direct; }
    // (planned afresh only once where she's bound has moved on — a ship she's
    // chasing — never on a whim: a fresh plan from where she's got to can
    // choose the other way round an island and turn her back on her wake)
    const moved = R?.pts ? w.distance(R.gx, R.gy, gx, gy) : Infinity;
    if (!R?.pts || moved > Math.max(30, w.distance(s.x, s.y, gx, gy) * 0.15) || (moved > 4 && now >= R.replan)) {
      const pts = planRoute(w, s.x, s.y, gx, gy, room);
      // (none in reach: straight at it, and the coast-hugging below — asked again in a while)
      R = s.route = { pts, i: 0, gx, gy, check: now + (pts ? 1 : 3), replan: now + 8, adv: 0 };
    } else R.check = now + 1;
  }
  if (!R.pts) return direct;
  // on along it: past each point once she's up with it (not turning for the next one early, across
  // the corner toward the land), or (now and then) once the next is in a clear line from her
  const L = s.def.length;
  while (R.i < R.pts.length - 1 && w.distance(s.x, s.y, R.pts[R.i].x, R.pts[R.i].y) < Math.max(8, L * 0.35)) R.i++;
  if (now >= R.adv) {
    R.adv = now + 0.3;
    while (R.i < R.pts.length - 1 && seaClear(w, s.x, s.y, R.pts[R.i + 1].x, R.pts[R.i + 1].y, room)) R.i++;
  }
  // (at the end of a route that stops short, in open water off a coast where it is: straight at it from there)
  if (routeEnded(w, s)) return direct;
  const p = R.pts[R.i];
  s.onRoute = now;
  return Math.atan2(p.y - s.y, w.dx(s.x, p.x));
}

/** The open water a ship keeps between her and a coast (from her middle): half her beam and a good berth, more for a long one. */
export const seaRoom = (s) => Math.min(22, s.def.beam * 0.5 + 10 + s.def.length * 0.1);

/** Has ship `s` come to the end of her route short of where she was bound (it lies in among the land)? */
export function routeEnded(w, s) {
  const R = s.route;
  if (!R?.pts || R.i < R.pts.length - 1) return false;
  const q = R.pts[R.pts.length - 1];
  return w.distance(s.x, s.y, q.x, q.y) < s.def.length * 0.5 + 12;
}
