// Finding a way round. When the straight line to where someone is going runs
// into a wall, a house, a fence or a cart, a small A* search over the tile grid
// near them finds a way past (never cutting corners), and the path is pulled
// taut so they walk it in straight runs rather than tile by tile.

/**
 * Can someone of radius r stand here? (Inside a building only counts for the
 * building you're already in: going in and out is by the door — see
 * game/buildings.js route().)
 */
export function standable(w, x, y, r = 0.3, inside = null) {
  if (!w.walkable(x, y) || w.solid(x, y)) return false;
  if (w.isBlocked(x, y) && (!inside || w.interiorAt(x, y) !== inside)) return false;
  return !w.hitsProp(x, y, r);
}

/** Is the straight walk from (x0, y0) to (x1, y1) clear? */
export function clearLine(w, x0, y0, x1, y1, r = 0.3) {
  const inside = w.interiorAt ? w.interiorAt(x0, y0) : null;
  const dx = w.dx(x0, x1), dy = y1 - y0;
  const n = Math.ceil(Math.hypot(dx, dy) / 0.3);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!standable(w, w.wx(x0 + dx * t), y0 + dy * t, r, inside)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- A*
const R = 36, N = 2 * R + 1, CELLS = N * N;
const G = new Float32Array(CELLS), F = new Float32Array(CELLS), FROM = new Int32Array(CELLS);
const STATE = new Uint8Array(CELLS); // 0 unseen, 1 open, 2 closed
const OK = new Int8Array(CELLS);     // 0 unknown, 1 standable, -1 blocked
const HEAP = new Int32Array(CELLS * 2);
const SQ2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

/**
 * A walkable path of points from (sx, sy) toward (tx, ty) — or, if the goal
 * itself can't be reached, to the reachable spot nearest it. Null when there
 * is no way (or it's too far to search).
 */
export function findPath(w, sx, sy, tx, ty, r = 0.3, maxNodes = 2600) {
  const ox = Math.floor(sx) - R, oy = Math.floor(sy) - R;
  const gx = Math.floor(sx + w.dx(sx, tx)) - ox, gy = Math.floor(ty) - oy;
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return null;
  STATE.fill(0); OK.fill(0);
  const inside = w.interiorAt ? w.interiorAt(sx, sy) : null;
  const ok = (i, j) => {
    const k = j * N + i;
    if (OK[k] === 0) OK[k] = standable(w, w.wx(ox + i + 0.5), oy + j + 0.5, r, inside) ? 1 : -1;
    return OK[k] === 1;
  };
  const h = (i, j) => { const dx = Math.abs(i - gx), dy = Math.abs(j - gy); return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy); };
  let hn = 0;
  const push = (k) => {
    let i = hn++;
    HEAP[i] = k;
    while (i > 0) { const p = (i - 1) >> 1; if (F[HEAP[p]] <= F[HEAP[i]]) break; const t = HEAP[p]; HEAP[p] = HEAP[i]; HEAP[i] = t; i = p; }
  };
  const pop = () => {
    const top = HEAP[0];
    HEAP[0] = HEAP[--hn];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, rr = l + 1;
      let m = i;
      if (l < hn && F[HEAP[l]] < F[HEAP[m]]) m = l;
      if (rr < hn && F[HEAP[rr]] < F[HEAP[m]]) m = rr;
      if (m === i) break;
      const t = HEAP[m]; HEAP[m] = HEAP[i]; HEAP[i] = t; i = m;
    }
    return top;
  };
  const si = R, sj = R, sk = sj * N + si;
  G[sk] = 0; F[sk] = h(si, sj); FROM[sk] = -1; STATE[sk] = 1; OK[sk] = 1;
  push(sk);
  let best = sk, bestH = h(si, sj), expanded = 0;
  while (hn > 0 && expanded < maxNodes) {
    const k = pop();
    if (STATE[k] === 2) continue;
    STATE[k] = 2;
    expanded++;
    const i = k % N, j = (k / N) | 0;
    const hk = h(i, j);
    if (hk < bestH) { bestH = hk; best = k; }
    if (i === gx && j === gy) { best = k; break; }
    for (const [di, dj, c] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (STATE[nk] === 2 || !ok(ni, nj)) continue;
      // no squeezing diagonally past a corner
      if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue;
      // nothing thin (a wall, a fence) between the two tile centres
      if (w.hitsProp(w.wx(ox + i + 0.5 + di * 0.5), oy + j + 0.5 + dj * 0.5, r * 0.8)) continue;
      const g = G[k] + c;
      if (STATE[nk] === 1 && g >= G[nk]) continue;
      G[nk] = g; F[nk] = g + h(ni, nj) * 1.05; FROM[nk] = k; STATE[nk] = 1;
      push(nk);
    }
  }
  if (best === sk) return null;
  // back from the goal to the start
  const cells = [];
  for (let k = best; k !== -1 && k !== sk; k = FROM[k]) cells.push(k);
  cells.reverse();
  const pts = cells.map((k) => ({ x: w.wx(ox + (k % N) + 0.5), y: oy + ((k / N) | 0) + 0.5 }));
  // the real goal as the last point, when it's where the path ends up
  if (best % N === gx && ((best / N) | 0) === gy && standable(w, tx, ty, r)) pts[pts.length - 1] = { x: tx, y: ty };
  // pull it taut: skip ahead to the farthest point in a clear straight line
  const out = [];
  let cx = sx, cy = sy, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clearLine(w, cx, cy, pts[j].x, pts[j].y, r)) j--;
    out.push(pts[j]);
    cx = pts[j].x; cy = pts[j].y;
    i = j + 1;
  }
  return out;
}
