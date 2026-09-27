// Bundled by tools/townaudit.mjs: generates the world and measures every town
// — how much of its ground is built on, how much paving stands empty, how
// many people it gets for its size — and every landmark's footing (the ground
// under it should be level, nothing growing through it).
import { ALL_ISLANDS } from '../src/data/islands/index.js';
import { generateWorld } from '../src/world/worldgen.js';
import { TOWN_STYLES } from '../src/world/towngen.js';
import { crowdOf } from '../src/game/townlife.js';
import { bl, bfoot } from '../src/world/bframe.js';
import { WALKABLE, OVERLAY, T } from '../src/world/tiles.js';
import { COLLIDE } from '../src/world/objects.js';
import { HeightField } from '../src/render3d/height.js';

export async function run() {
  const world = await generateWorld({ seed: 'blue-planet', islands: ALL_ISLANDS });
  const towns = [], marks = [];
  const hf = new HeightField(world);
  for (const isl of world.islands) {
    if (!isl.def) continue;
    for (const t of isl.towns) towns.push(townStats(world, isl, t));
    for (const o of isl.landmarks) if (o.kind && o.type !== 'mountain' && o.type !== 'area') marks.push(markStats(world, hf, isl, o));
  }
  // things standing in one another: buildings overlapping buildings, props inside buildings
  const overlaps = [];
  for (const isl of world.islands) {
    if (!isl.def || !isl.landBox) continue;
    const { x0, y0, x1, y1 } = isl.landBox;
    const objs = world.objects.query(x0, y0, x1, y1);
    const blds = objs.filter((o) => o.kind === 'building').map((o) => ({ o, r: bfoot(o) }));
    for (let i = 0; i < blds.length; i++) {
      for (let j = i + 1; j < blds.length; j++) {
        const a = blds[i].r, b = blds[j].r;
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox > 0.3 && oy > 0.3) overlaps.push({ island: isl.id, a: blds[i].o.name || blds[i].o.role, b: blds[j].o.name || blds[j].o.role, x: Math.round(blds[i].o.x), y: Math.round(blds[i].o.y), by: +Math.min(ox, oy).toFixed(1) });
      }
    }
    const BIG = new Set(['statue', 'fountain', 'well', 'tower', 'lighthouse', 'windmill', 'shipwreck', 'boat', 'tent', 'stall', 'platform', 'poneglyph', 'ruins', 'wheel', 'cannon', 'bell', 'totem', 'gate', 'torii', 'arch']);
    for (const o of objs) {
      if (!BIG.has(o.kind)) continue;
      for (const { o: b, r } of blds) {
        if (o.x > r.x0 + 0.2 && o.x < r.x1 - 0.2 && o.y > r.y0 + 0.2 && o.y < r.y1 - 0.2) overlaps.push({ island: isl.id, a: o.name || o.kind, b: b.name || b.role, x: Math.round(o.x), y: Math.round(o.y), prop: true });
      }
    }
  }
  // can you walk from each town's square down to its pier? (the player's own
  // rules: no solid tile, walkable ground or the pier's deck, no prop in the way)
  const piers = [];
  for (const isl of world.islands) {
    if (!isl.def || !isl.docks?.length) continue;
    for (const dk of isl.docks) {
      const town = isl.towns.slice().sort((a, b) => Math.hypot(a.x - dk.land.x, a.y - dk.land.y) - Math.hypot(b.x - dk.land.x, b.y - dk.land.y))[0];
      if (!town) continue;
      const res = walkTo(world, town.plaza.x + 0.5, town.plaza.y + 2.5, dk.end.x + 0.5, dk.end.y + 0.5);
      // (a walk much longer than the way as the crow flies: the direct way is cut off)
      const crow = Math.abs(world.dx(town.plaza.x, dk.end.x)) + Math.abs(dk.end.y - town.plaza.y - 2.5);
      piers.push({ island: isl.id, town: town.id, dock: dk.name, crow: Math.round(crow), detour: res.ok ? +(res.steps / Math.max(1, crow)).toFixed(2) : null, ...res });
    }
    // and every town can be reached from the island's first harbour
    const dk = isl.docks[0];
    for (const town of isl.towns) {
      const res = walkTo(world, dk.land.x, dk.land.y, town.plaza.x + 0.5, town.plaza.y + 2.5);
      if (!res.ok) piers.push({ island: isl.id, town: town.id, dock: 'from ' + dk.name, ...res });
    }
  }
  return { towns, marks, overlaps, piers };
}

/** A walk over the tiles (a body of radius 0.3) from (sx, sy) to within 1.5 m of (tx, ty): { ok, steps, near, why }. */
function walkTo(world, sx, sy, tx, ty) {
  const r = 0.3;
  const free = (x, y) => {
    for (const [dx, dy] of [[0, 0], [-r, 0], [r, 0], [0, -r], [0, r]]) {
      const t = world.type(x + dx, y + dy);
      if (world.solid(x + dx, y + dy) || (!WALKABLE[t] && !OVERLAY[t])) return false;
    }
    return !world.hitsProp(x, y, r * 0.9);
  };
  const seen = new Map(), q = [[Math.floor(sx), Math.floor(sy)]];
  const key = (x, y) => y * 100000 + x;
  seen.set(key(q[0][0], q[0][1]), 0);
  let best = { d: Infinity, x: 0, y: 0 };
  for (let h = 0; h < q.length && q.length < 1500000; h++) {
    const [x, y] = q[h];
    const d = Math.hypot(x + 0.5 - tx, y + 0.5 - ty);
    if (d < best.d) best = { d, x, y };
    if (d < 1.5) return { ok: true, steps: seen.get(key(x, y)) };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (seen.has(k) || !free(nx + 0.5, ny + 0.5)) continue;
      if (Math.hypot(nx - sx, ny - sy) > 700) continue;
      seen.set(k, seen.get(key(x, y)) + 1);
      q.push([nx, ny]);
    }
  }
  // what stands in the way just past the nearest point reached, toward the pier
  const why = [];
  const ang = Math.atan2(ty - best.y, tx - best.x);
  for (let s = 1; s <= 3; s++) {
    const x = best.x + 0.5 + Math.cos(ang) * s, y = best.y + 0.5 + Math.sin(ang) * s, t = world.type(x, y);
    const props = world.objects.near(x, y, 1).filter((o) => world.hitsProp(x, y, 0.3)).map((o) => o.kind);
    why.push(`${Math.floor(x)},${Math.floor(y)}: tile ${Object.keys(T).find((k) => T[k] === t)}${world.solid(x, y) ? ' SOLID' : ''}${props.length ? ' props ' + [...new Set(props)].join('/') : ''}`);
  }
  return { ok: false, near: +best.d.toFixed(1), at: [best.x, best.y], why };
}

function townStats(world, isl, t) {
  const S = TOWN_STYLES[t.style] || TOWN_STYLES.village;
  const paveTiles = new Set([S.ground, S.road, S.plaza, t.roadTile].filter((v) => v != null));
  const W = t.x1 - t.x0, H = t.y1 - t.y0;
  // building footprints, and each tile's distance (in tiles) to the nearest
  const INF = 1e9, dist = new Int32Array(W * H).fill(INF), q = [];
  let foot = 0;
  for (const b of t.buildings) {
    const fw = b.fw || 3, fd = b.fd || 3;
    foot += fw * fd;
    const r = Math.max(fw, fd) / 2 + 0.5;
    for (let y = Math.floor(b.y - r - fd); y <= Math.ceil(b.y + r + fd); y++) {
      for (let x = Math.floor(b.x - r - fd); x <= Math.ceil(b.x + r + fd); x++) {
        if (x < t.x0 || y < t.y0 || x >= t.x1 || y >= t.y1) continue;
        if (!inside(b, x + 0.5, y + 0.5)) continue;
        const k = (y - t.y0) * W + (x - t.x0);
        if (dist[k]) { dist[k] = 0; q.push(k); }
      }
    }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % W, j = (k / W) | 0, d = dist[k] + 1;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const kk = jj * W + ii;
      if (dist[kk] > d) { dist[kk] = d; q.push(kk); }
    }
  }
  let land = 0, paved = 0, emptyPaved = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = t.x0 + i, y = t.y0 + j, tt = world.type(x, y);
    if (!WALKABLE[tt]) continue;
    land++;
    if (!paveTiles.has(tt)) continue;
    paved++;
    if (dist[j * W + i] > 8) emptyPaved++;
  }
  const specials = (t.def.buildings || []).length;
  const placedSpecials = (t.def.buildings || []).filter((b) => t.buildings.some((x) => x.name === b.name && x.role === b.role)).length;
  return {
    island: isl.id, town: t.id, style: t.style, w: W, h: H,
    buildings: t.buildings.length, houses: t.buildings.length - placedSpecials, specials, placedSpecials,
    coverage: +(foot / Math.max(1, land)).toFixed(3), paved, emptyPaved, emptyShare: +(emptyPaved / Math.max(1, paved)).toFixed(2),
    crowd: crowdOf(t), spots: t.npcSpots.length, street: t.streetSpots.length,
  };
}

/** Is (x, y) inside building b's footprint? */
function inside(b, x, y) {
  const { lx, lz } = bl(b, x, y);
  return Math.abs(lx) <= (b.fw || 3) / 2 && lz <= 0 && lz >= -(b.fd || 3);
}

function markStats(world, hf, isl, o) {
  const r = typeof COLLIDE[o.kind] === 'number' ? Math.max(0.6, COLLIDE[o.kind] * (o.s || 1)) : Array.isArray(COLLIDE[o.kind]) ? Math.max(...COLLIDE[o.kind]) * (o.s || 1) : Math.max(1, (o.fw || 1) / 2);
  // where the model stands (see render3d: a prop sits at the ground height at its middle;
  // a platform on the terrain under it) and how far the rendered ground round its foot
  // falls away from that (it floats there) or rises above it (it's sunk there)
  const base = o.kind === 'platform' ? hf.terrain(o.x, o.y) : o.kind === 'building' ? hf.ground(o.x, o.y) : hf.rest(o.x, o.y, r);
  let lo = Infinity, hi = -Infinity, water = 0;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (const f of [0.5, 1]) {
      const x = o.x + Math.cos(a) * r * f, y = o.y + Math.sin(a) * r * f;
      if (world.isLiquid(x, y)) { water++; continue; }
      const tt = world.type(x, y);
      if (OVERLAY[tt] || tt === T.WALL || world.floorRec?.(x, y)) continue;
      const g = hf.terrain(x, y);
      lo = Math.min(lo, g); hi = Math.max(hi, g);
    }
  }
  let trees = 0;
  for (const n of world.objects.near(o.x, o.y, r + 1.5)) if (n !== o && (n.kind === 'tree' || n.kind === 'rock')) trees++;
  const float = lo === Infinity ? 0 : +(base - lo).toFixed(2), sink = hi === -Infinity ? 0 : +(hi - base).toFixed(2);
  return { island: isl.id, kind: o.kind, name: o.name || '', x: Math.round(o.x), y: Math.round(o.y), r: +r.toFixed(1), float, sink, elevSpread: Math.max(float, sink), trees, water };
}

/** The ground round the landmarks of one island matching a kind (for a closer look). */
export async function inspect(island, kind, R = 4) {
  const world = await generateWorld({ seed: 'blue-planet', islands: ALL_ISLANDS });
  const hf = new HeightField(world);
  const isl = world.islands.find((i) => i.id === island);
  const names = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
  const out = [];
  for (const o of isl.landmarks.filter((l) => l.kind === kind)) {
    out.push(`${o.kind} "${o.name || ''}" at ${o.x.toFixed(1)},${o.y.toFixed(1)}  ground ${hf.ground(o.x, o.y).toFixed(2)} rest ${hf.rest(o.x, o.y, 0.8).toFixed(2)}`);
    for (let y = Math.floor(o.y - R); y <= Math.floor(o.y + R); y++) {
      let row = '';
      for (let x = Math.floor(o.x - R); x <= Math.floor(o.x + R); x++) row += `${(names[world.type(x, y)] || '?').slice(0, 5).padEnd(5)}${String(world.elev(x, y)).padStart(4)}/${hf.terrain(x + 0.5, y + 0.5).toFixed(1).padStart(5)} `;
      out.push(row);
    }
  }
  return out.join('\n');
}
