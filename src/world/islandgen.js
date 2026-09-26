// Island generation from data definitions.
//
// A definition describes an island loosely (position, size, blob shape,
// climate, named features) and this module turns it into tiles + props.
// Relative feature coordinates (dx, dy) are fractions of the island's half
// extents when |v| <= 1.5, otherwise raw tile offsets.
import { T, CLIMATE, IS_LIQUID, OVERLAY, WALKABLE, MANMADE } from './tiles.js';
import { clamp, lerp } from '../core/math.js';
import { generateTown } from './towngen.js';

export const CLIMATES = {
  temperate: { ground: T.GRASS, beach: T.SAND, clim: CLIMATE.TEMPERATE, trees: ['oak', 'oak', 'pine', 'bush'], density: 0.05 },
  spring: { ground: T.GRASS, beach: T.SAND, clim: CLIMATE.SPRING, trees: ['oak', 'bush', 'blossom'], density: 0.05 },
  tropical: { ground: T.GRASS, beach: T.SAND, clim: CLIMATE.TROPICAL, trees: ['palm', 'palm', 'jungle', 'bush'], density: 0.06 },
  jungle: { ground: T.JUNGLE, beach: T.SAND, clim: CLIMATE.TROPICAL, trees: ['jungle', 'jungle', 'palm', 'fern'], density: 0.16 },
  winter: { ground: T.SNOW, beach: T.SNOW, clim: CLIMATE.WINTER, trees: ['snowpine', 'snowpine', 'deadsnow'], density: 0.06 },
  desert: { ground: T.DESERT, beach: T.SAND, clim: CLIMATE.ARID, trees: ['cactus', 'deadbush'], density: 0.012 },
  autumn: { ground: T.GRASS, beach: T.SAND, clim: CLIMATE.AUTUMN, trees: ['autumn', 'autumn', 'pine'], density: 0.06 },
  volcanic: { ground: T.ASH, beach: T.ROCK, clim: CLIMATE.VOLCANIC, trees: ['dead', 'rock'], density: 0.02 },
  sakura: { ground: T.GRASS, beach: T.SAND, clim: CLIMATE.SAKURA, trees: ['sakura', 'sakura', 'pine', 'bamboo'], density: 0.07 },
  candy: { ground: T.CANDY, beach: T.CAKE, clim: CLIMATE.CANDY, trees: ['lollipop', 'candycane', 'cottoncandy'], density: 0.05 },
  gloom: { ground: T.BONE, beach: T.MUD, clim: CLIMATE.GLOOM, trees: ['spooky', 'dead'], density: 0.05 },
  sky: { ground: T.ISLAND_CLOUD, beach: T.ISLAND_CLOUD, clim: CLIMATE.SKY, trees: ['cloudtree', 'palm'], density: 0.03 },
  undersea: { ground: T.CORAL, beach: T.SEAFLOOR, clim: CLIMATE.UNDERSEA, trees: ['coral', 'kelp'], density: 0.05 },
  rocky: { ground: T.ROCK, beach: T.GRAVEL, clim: CLIMATE.TEMPERATE, trees: ['pine', 'rock'], density: 0.03 },
  mangrove: { ground: T.MANGROVE, beach: T.SAND, clim: CLIMATE.TROPICAL, trees: ['bush'], density: 0.02 },
  marsh: { ground: T.MUD, beach: T.MUD, clim: CLIMATE.GLOOM, trees: ['dead', 'bush'], density: 0.05 },
  prehistoric: { ground: T.JUNGLE, beach: T.SAND, clim: CLIMATE.TROPICAL, trees: ['jungle', 'fern', 'fern', 'palm'], density: 0.14 },
};

const CLIMATE_BY_ID = Object.fromEntries(Object.entries(CLIMATES).map(([k, v]) => [v.clim, k]));

/** Resolve a relative coordinate. */
// Absolute sizes (|v| > 1.5 tiles) grow with the island's scale too (the
// world is built bigger than the chart the data was written on).
let SCALE = 1;
function rel(v, half) { return Math.abs(v) <= 1.5 ? v * half : v * SCALE; }

export function generateIsland(world, def, noise, rng) {
  SCALE = def._scale || 1;
  const preset = CLIMATES[def.climateName || def.climate] || CLIMATES[CLIMATE_BY_ID[def.climate]] || CLIMATES.temperate;
  const ground = def.ground ?? preset.ground;
  const beach = def.beach ?? preset.beach;
  const clim = typeof def.climate === 'number' ? def.climate : preset.clim;
  const hw = def.w / 2, hh = def.h / 2;
  const cx = def.x, cy = def.y;
  const blobs = (def.blobs || [[0, 0, 1, 1]]).map(([bx, by, brx, bry]) => ({
    x: cx + rel(bx, hw), y: cy + rel(by, hh), rx: rel(brx, hw), ry: rel(bry, hh),
  }));
  const rough = def.rough ?? 0.28;
  const nf = def.noiseScale ?? clamp(4 / Math.max(hw, hh), 0.02, 0.25);

  // bounding box of all blobs
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of blobs) {
    x0 = Math.min(x0, b.x - b.rx); x1 = Math.max(x1, b.x + b.rx);
    y0 = Math.min(y0, b.y - b.ry); y1 = Math.max(y1, b.y + b.ry);
  }
  const m = Math.ceil(Math.max(6, Math.max(hw, hh) * rough * 0.8) + 4);
  x0 = Math.floor(x0 - m); y0 = Math.max(1, Math.floor(y0 - m));
  x1 = Math.ceil(x1 + m); y1 = Math.min(world.height - 2, Math.ceil(y1 + m));
  const LW = x1 - x0, LH = y1 - y0;
  if (LW <= 0 || LH <= 0) return null;

  const L = new Uint8Array(LW * LH); // 1 = land
  const li = (i, j) => j * LW + i;
  const seedOff = (def.id.length * 131.7) % 1000;
  for (let j = 0; j < LH; j++) {
    for (let i = 0; i < LW; i++) {
      const px = x0 + i + 0.5, py = y0 + j + 0.5;
      let v = -1;
      for (const b of blobs) {
        const ex = (px - b.x) / b.rx, ey = (py - b.y) / b.ry;
        v = Math.max(v, 1 - Math.sqrt(ex * ex + ey * ey));
      }
      if (v < -rough * 1.4) continue;
      const n = noise.fbm(px * nf + seedOff, py * nf - seedOff, 4);
      const detail = noise.noise2(px * nf * 4.1, py * nf * 4.1) * 0.25;
      if (v + (n + detail) * rough > 0) L[li(i, j)] = 1;
    }
  }
  if (def.ring) {
    // ring-shaped islands (lagoon in the middle)
    for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
      const px = x0 + i + 0.5, py = y0 + j + 0.5;
      const ex = (px - cx) / (hw * def.ring), ey = (py - cy) / (hh * def.ring);
      if (ex * ex + ey * ey < 1 + noise.noise2(px * 0.1, py * 0.1) * 0.15) L[li(i, j)] = 0;
    }
  }
  if (def.keepLargest !== false && !def.archipelago) keepLargestComponent(L, LW, LH);

  // local distance to water (4-connected BFS)
  const CD = localCoastDistance(L, LW, LH);

  // write base terrain
  const beachW = def.beachWidth ?? (ground === T.SNOW ? 1.2 : 2.2);
  let landCount = 0;
  for (let j = 0; j < LH; j++) {
    for (let i = 0; i < LW; i++) {
      const k = li(i, j);
      if (!L[k]) continue;
      landCount++;
      const x = x0 + i, y = y0 + j;
      const cd = CD[k];
      const n = noise.fbm(x * 0.05 + 11, y * 0.05 - 7, 3);
      const e = clamp(20 + cd * (def.elevRate ?? 5) + n * 25, 8, 170);
      const bw = beachW + noise.noise2(x * 0.15, y * 0.15) * 1.2;
      const t = cd <= bw ? beach : ground;
      world.setTile(x, y, t, Math.round(e), clim);
    }
  }
  if (landCount === 0) return null;

  const rec = {
    id: def.id, name: def.name, def, x: cx, y: cy, sea: def.sea,
    radius: Math.max(hw, hh),
    bbox: { cx, hw: (x1 - x0) / 2, x0, x1, y0, y1 },
    towns: [], docks: [], spots: {}, landmarks: [], treeSpots: [],
    containsTile: (x, y) => {
      let i = Math.floor(x) - x0;
      if (i < 0) i += world.width;
      if (i >= world.width) i -= world.width;
      const jj = Math.floor(y) - y0;
      if (i < 0 || jj < 0 || i >= LW || jj >= LH) return false;
      return L[li(i, jj)] === 1 || world.isOverlay(x, y);
    },
  };

  // --- features -------------------------------------------------------------
  const P = (f) => ({ x: cx + rel(f.dx ?? 0, hw), y: cy + rel(f.dy ?? 0, hh) });

  for (const f of def.mountains || []) {
    const c = P(f);
    const r = rel(f.r ?? 0.3, Math.max(hw, hh));
    const peak = f.h ?? 1;
    stampRadial(world, c.x, c.y, r * 1.3, (x, y, dn) => {
      if (world.isLiquid(x, y)) return;
      const ridge = noise.ridged(x * 0.06 + seedOff, y * 0.06, 4);
      const falloff = Math.pow(clamp(1 - dn, 0, 1), 1.6);
      const add = falloff * peak * (140 + ridge * 120);
      const cur = world.elev(x, y);
      const e = clamp(cur + add, 0, 255);
      const idx = world.idx(x, y) << 2;
      world.data[idx + 1] = e;
      if (e > (f.cliff ?? 222)) world.data[idx] = f.snow || clim === CLIMATE.WINTER ? T.SNOWROCK : (f.peak ?? T.MOUNTAIN);
      else if (e > (f.slopeAt ?? 170) && f.slope && world.data[idx] !== beach) world.data[idx] = f.slope;
    });
    rec.landmarks.push({ type: 'mountain', name: f.name, x: c.x, y: c.y, r });
  }

  for (const f of def.areas || []) {
    // paint an organic patch of a ground type (forest, desert, farmland...)
    const c = P(f);
    const rx = rel(f.rx ?? f.r ?? 0.3, hw), ry = rel(f.ry ?? f.r ?? 0.3, hh);
    stampEllipse(world, c.x, c.y, rx, ry, noise, f.rough ?? 0.35, (x, y) => {
      const t = world.type(x, y);
      if (IS_LIQUID[t] || !WALKABLE[t]) return;
      if (t === beach && !f.overBeach) return;
      world.setTile(x, y, f.tile, undefined, f.climate ?? undefined);
    });
    if (f.name) rec.landmarks.push({ type: 'area', name: f.name, x: c.x, y: c.y, r: Math.max(rx, ry) });
  }

  for (const f of def.lakes || []) {
    const c = P(f);
    const rx = rel(f.rx ?? f.r ?? 0.1, hw), ry = rel(f.ry ?? f.r ?? 0.1, hh);
    stampEllipse(world, c.x, c.y, rx, ry, noise, 0.3, (x, y) => {
      if (!world.isLiquid(x, y)) world.setTile(x, y, f.tile ?? T.POND, 0);
    });
  }

  for (const f of def.rivers || []) {
    const pts = f.points.map(([px, py]) => [cx + rel(px, hw), cy + rel(py, hh)]);
    carvePath(world, pts, f.width ?? 3, f.tile ?? T.RIVER, noise, f.meander ?? 1, { elev: 0 });
  }

  for (const p of def.paint || []) paintOp(world, p, cx, cy, hw, hh, noise);

  // towns ---------------------------------------------------------------------
  for (const town of def.towns || []) {
    const c = P(town);
    const t = generateTown(world, {
      ...town,
      x: c.x, y: c.y,
      w: rel(town.w ?? 0.4, hw) * (Math.abs(town.w ?? 0.4) <= 1.5 ? 2 : 1),
      h: rel(town.h ?? 0.3, hh) * (Math.abs(town.h ?? 0.3) <= 1.5 ? 2 : 1),
      islandId: def.id, climate: clim,
    }, rng.fork(town.id || town.name), noise);
    t.island = rec;
    rec.towns.push(t);
  }

  // docks ---------------------------------------------------------------------
  const dockDefs = def.docks || (def.towns && def.towns.length ? def.towns.map((t) => ({ near: t.id || t.name, dir: t.dockDir })) : []);
  for (const dd of dockDefs) {
    let from;
    if (dd.near) {
      const town = rec.towns.find((t) => t.id === dd.near || t.name === dd.near);
      if (town) from = { x: town.x, y: town.y };
    }
    if (!from) from = P(dd);
    const dock = buildDock(world, from, dd.dir, dd.len ?? 8, rec, dd);
    if (dock) {
      const nearTown = dd.near && rec.towns.find((t) => t.id === dd.near || t.name === dd.near);
      dock.name = dd.name || nearTown?.name || (rec.towns[0] && rec.towns[0].name) || def.name;
      rec.docks.push(dock);
      // road from the town to the dock
      if (dd.near) {
        const town = rec.towns.find((t) => t.id === dd.near || t.name === dd.near);
        if (town) connectRoad(world, town.x, town.y, dock.land.x, dock.land.y, town.roadTile || T.DIRT);
      }
    }
  }
  if (!rec.docks.length && !def.noDock && !def.islet) {
    const dock = buildDock(world, { x: cx, y: cy }, def.dockDir, 6, rec, {});
    if (dock) { dock.name = def.name; rec.docks.push(dock); }
  }

  // landmarks & props -------------------------------------------------------
  for (const lm of def.landmarks || []) {
    const c = P(lm);
    const o = { ...lm, x: c.x, y: c.y, kind: lm.kind || lm.type };
    delete o.dx; delete o.dy;
    if (o.block === undefined) o.block = true;
    if (o.kind === 'building' && o.role && !o.door) o.door = { x: o.x, y: o.y + 0.5 };
    if (o.lore && !o.interact) { o.interact = o.loreLabel || `Examine ${o.name || 'it'}`; o.use = 'lore'; o.interactRange = o.interactRange || 2.2; }
    if (o.kind === 'poneglyph' && !o.interact) { o.interact = o.road ? 'Examine the red Road Poneglyph' : 'Examine the Poneglyph'; o.use = 'poneglyph'; o.interactRange = 2.4; }
    if (o.kind === 'bell' && !o.interact) { o.interact = 'Ring the bell'; o.use = 'bell'; o.interactRange = 2.4; }
    placeObject(world, o);
    rec.landmarks.push(o);
    if (lm.spot) rec.spots[lm.spot] = { x: c.x, y: c.y + 1.2 };
  }
  for (const s of def.spots || []) {
    const c = P(s);
    rec.spots[s.id] = { x: c.x, y: c.y, ...s, dx: undefined, dy: undefined };
  }

  // vegetation ----------------------------------------------------------------
  const treeKinds = def.treeKind ? [def.treeKind] : def.trees || preset.trees;
  const density = def.treeDensity ?? preset.density;
  populateVegetation(world, rng, x0, y0, LW, LH, L, li, treeKinds, density, def);

  return rec;
}

// ---------------------------------------------------------------------------

function keepLargestComponent(L, LW, LH) {
  const comp = new Int32Array(LW * LH).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  const stack = [];
  for (let s = 0; s < L.length; s++) {
    if (!L[s] || comp[s] >= 0) continue;
    let size = 0;
    stack.push(s); comp[s] = id;
    while (stack.length) {
      const k = stack.pop(); size++;
      const i = k % LW, j = (k / LW) | 0;
      const nb = [i > 0 ? k - 1 : -1, i < LW - 1 ? k + 1 : -1, j > 0 ? k - LW : -1, j < LH - 1 ? k + LW : -1];
      for (const q of nb) if (q >= 0 && L[q] && comp[q] < 0) { comp[q] = id; stack.push(q); }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  // keep components that are big relative to the largest (archipelago bits)
  const sizes = new Int32Array(id);
  for (let k = 0; k < L.length; k++) if (comp[k] >= 0) sizes[comp[k]]++;
  for (let k = 0; k < L.length; k++) {
    if (L[k] && comp[k] !== best && sizes[comp[k]] < Math.max(30, bestSize * 0.08)) L[k] = 0;
  }
}

function localCoastDistance(L, LW, LH) {
  const CD = new Float32Array(LW * LH).fill(1e6);
  const q = new Int32Array(LW * LH);
  let head = 0, tail = 0;
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
    const k = j * LW + i;
    if (!L[k]) continue;
    const edge = i === 0 || j === 0 || i === LW - 1 || j === LH - 1 || !L[k - 1] || !L[k + 1] || !L[k - LW] || !L[k + LW];
    if (edge) { CD[k] = 1; q[tail++] = k; }
  }
  while (head < tail) {
    const k = q[head++];
    const i = k % LW, j = (k / LW) | 0;
    const nd = CD[k] + 1;
    if (i > 0 && L[k - 1] && CD[k - 1] > nd) { CD[k - 1] = nd; q[tail++] = k - 1; }
    if (i < LW - 1 && L[k + 1] && CD[k + 1] > nd) { CD[k + 1] = nd; q[tail++] = k + 1; }
    if (j > 0 && L[k - LW] && CD[k - LW] > nd) { CD[k - LW] = nd; q[tail++] = k - LW; }
    if (j < LH - 1 && L[k + LW] && CD[k + LW] > nd) { CD[k + LW] = nd; q[tail++] = k + LW; }
  }
  return CD;
}

export function stampRadial(world, cx, cy, r, fn) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      fn(world.wx(x), y, Math.sqrt(d2) / r);
    }
  }
}

export function stampEllipse(world, cx, cy, rx, ry, noise, rough, fn) {
  const m = 1 + rough;
  for (let y = Math.floor(cy - ry * m); y <= Math.ceil(cy + ry * m); y++) {
    for (let x = Math.floor(cx - rx * m); x <= Math.ceil(cx + rx * m); x++) {
      const ex = (x + 0.5 - cx) / rx, ey = (y + 0.5 - cy) / ry;
      const v = 1 - Math.sqrt(ex * ex + ey * ey) + (noise ? noise.fbm(x * 0.09, y * 0.09, 3) * rough : 0);
      if (v > 0) fn(world.wx(x), y);
    }
  }
}

/** Carve a wobbly channel/road through a polyline. */
export function carvePath(world, pts, width, tile, noise, meander = 1, { elev, overWater = true, clim, onlyLand = false } = {}) {
  const hw = width / 2;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, ay] = pts[s], [bx, by] = pts[s + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(len * 2));
    const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const w = noise ? noise.fbm((ax + (bx - ax) * t) * 0.03, (ay + (by - ay) * t) * 0.03, 2) * meander * Math.min(12, len * 0.08) : 0;
      const px = ax + (bx - ax) * t + nx * w, py = ay + (by - ay) * t + ny * w;
      for (let j = Math.floor(py - hw); j <= Math.ceil(py + hw); j++) {
        for (let i = Math.floor(px - hw); i <= Math.ceil(px + hw); i++) {
          if ((i + 0.5 - px) ** 2 + (j + 0.5 - py) ** 2 > hw * hw) continue;
          const cur = world.type(i, j);
          if (!overWater && IS_LIQUID[cur]) continue;
          if (onlyLand && (IS_LIQUID[cur] || OVERLAY[cur])) continue;
          world.setTile(i, j, tile, elev, clim);
        }
      }
    }
  }
}

function paintOp(world, p, cx, cy, hw, hh, noise) {
  const X = (v) => cx + rel(v, hw), Y = (v) => cy + rel(v, hh);
  if (p.op === 'rect') {
    const x0 = Math.floor(X(p.x0)), x1 = Math.ceil(X(p.x1)), y0 = Math.floor(Y(p.y0)), y1 = Math.ceil(Y(p.y1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (p.onlyLand && world.isLiquid(x, y)) continue;
      if (p.onlyWater && !world.isLiquid(x, y)) continue;
      world.setTile(x, y, p.tile, p.elev, p.climate);
    }
  } else if (p.op === 'circle') {
    const r = Math.abs(p.r) <= 1.5 ? p.r * Math.max(hw, hh) : p.r * SCALE;
    stampRadial(world, X(p.x), Y(p.y), r, (x, y) => {
      if (p.onlyLand && world.isLiquid(x, y)) return;
      world.setTile(x, y, p.tile, p.elev, p.climate);
    });
  } else if (p.op === 'ring') {
    const r = Math.abs(p.r) <= 1.5 ? p.r * Math.max(hw, hh) : p.r * SCALE;
    stampRadial(world, X(p.x), Y(p.y), r + (p.width || 2) / 2, (x, y, dn) => {
      const d = dn * (r + (p.width || 2) / 2);
      if (Math.abs(d - r) <= (p.width || 2) / 2) world.setTile(x, y, p.tile, p.elev, p.climate);
    });
  } else if (p.op === 'path') {
    carvePath(world, p.points.map(([a, b]) => [X(a), Y(b)]), p.width ?? 2, p.tile, p.wobble ? noise : null, p.wobble ?? 0, { elev: p.elev, onlyLand: p.onlyLand, overWater: !p.onlyLand });
  } else if (p.op === 'blob') {
    stampEllipse(world, X(p.x), Y(p.y), rel(p.rx, hw), rel(p.ry, hh), noise, p.rough ?? 0.3, (x, y) => {
      if (p.onlyLand && world.isLiquid(x, y)) return;
      world.setTile(x, y, p.tile, p.elev, p.climate);
    });
  } else if (p.op === 'grid') {
    // canal / street grid (Water 7 style)
    const x0 = X(p.x0), x1 = X(p.x1), y0 = Y(p.y0), y1 = Y(p.y1);
    for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) {
      const gx = ((x - x0) % p.step + p.step) % p.step, gy = ((y - y0) % p.step + p.step) % p.step;
      if (gx < p.width || gy < p.width) {
        if (p.onlyLand && world.isLiquid(x, y)) continue;
        world.setTile(x, y, p.tile, p.elev);
      }
    }
  }
}

function buildDock(world, from, dir, len, rec, dd) {
  // Walk outward from `from` in the requested (or best) direction to the coast.
  const dirs = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [0.707, -0.707], nw: [-0.707, -0.707], se: [0.707, 0.707], sw: [-0.707, 0.707] };
  const tryDirs = dir ? [dirs[dir]] : Object.values(dirs);
  let best = null;
  for (const [vx, vy] of tryDirs) {
    for (let s = 0; s < 400; s++) {
      const x = from.x + vx * s, y = from.y + vy * s;
      if (!world.inBounds(Math.floor(x), Math.floor(y))) break;
      if (world.isLiquid(x, y) && world.sailable(x, y)) {
        // make sure it's open water, not a pond
        let open = 0;
        for (let k = 1; k <= 12; k++) if (world.isLiquid(x + vx * k, y + vy * k)) open++;
        if (open >= 10 && (!best || s < best.s)) best = { s, x, y, vx, vy };
        break;
      }
    }
  }
  if (!best) return null;
  const { vx, vy } = best;
  const horizontal = Math.abs(vx) > Math.abs(vy);
  const sx = best.x - vx * 1.5, sy = best.y - vy * 1.5; // start just on land
  const width = dd.width ?? 3;
  let endX = sx, endY = sy;
  for (let s = 0; s <= len; s++) {
    const px = sx + vx * s, py = sy + vy * s;
    for (let w = -Math.floor(width / 2); w <= Math.floor(width / 2); w++) {
      const x = horizontal ? px : px + w, y = horizontal ? py + w : py;
      if (world.isLiquid(x, y) || s < 2) world.setTile(x, y, world.isLiquid(x, y) ? T.PLANK : world.type(x, y), world.isLiquid(x, y) ? 0 : undefined);
    }
    endX = px; endY = py;
  }
  // mooring point: open water past the end of the pier, offset to one side
  const side = horizontal ? [0, 2.5] : [2.5, 0];
  const moor = { x: world.wx(endX + vx * 2.5 + side[0]), y: endY + vy * 2.5 + side[1] };
  const land = { x: world.wx(sx - vx * 2), y: sy - vy * 2 };
  placeObject(world, { kind: 'mooring', x: endX + 0.5, y: endY + 1, block: false });
  return { x: world.wx(endX), y: endY, dirX: vx, dirY: vy, moor, land, end: { x: world.wx(endX), y: endY } };
}

export function connectRoad(world, ax, ay, bx, by, tile) {
  const dx = world.dx(ax, bx), dy = by - ay;
  const steps = Math.ceil(Math.hypot(dx, dy) * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = ax + dx * t, y = ay + dy * t;
    for (let j = -1; j <= 0; j++) for (let i = -1; i <= 0; i++) {
      const cur = world.type(x + i, y + j);
      if (IS_LIQUID[cur] || OVERLAY[cur] || !WALKABLE[cur]) continue;
      if (cur === T.COBBLE || cur === T.STONE || cur === T.MARBLE || cur === T.PLANK || cur === T.FARM) continue;
      if (world.isBlocked(x + i, y + j)) continue;
      world.setType(x + i, y + j, tile);
    }
  }
}

export function placeObject(world, o) {
  if (!world.objects) return null;
  return world.objects.add(o);
}

function populateVegetation(world, rng, x0, y0, LW, LH, L, li, kinds, density, def) {
  const forestTypes = new Set([T.FOREST, T.JUNGLE]);
  for (let j = 0; j < LH; j++) {
    for (let i = 0; i < LW; i++) {
      if (!L[li(i, j)]) continue;
      const x = x0 + i, y = y0 + j;
      const t = world.type(x, y);
      if (world.isBlocked(x, y) || IS_LIQUID[t] || !WALKABLE[t] || world.hitsProp(x + 0.5, y + 0.5, 1.1)) continue;
      let p = density;
      let kindList = kinds;
      if (forestTypes.has(t)) {
        p = t === T.JUNGLE ? 0.3 : 0.26;
        if (def.forestTrees) kindList = def.forestTrees;
        else if (t === T.JUNGLE) kindList = ['jungle', 'jungle', 'palm', 'fern'];
        else if (world.climate(x, y) === CLIMATE.WINTER) kindList = ['snowpine'];
        else if (!kinds.includes('pine') && !kinds.includes('oak')) kindList = kinds;
        else kindList = ['oak', 'pine', 'oak', 'bush'];
      } else if (MANMADE[t] || t === T.DIRT || t === T.GRAVEL) {
        continue;
      } else if (t === def.beach || t === T.SAND) {
        p = kinds.includes('palm') ? density * 0.6 : density * 0.15;
        kindList = kinds.includes('palm') ? ['palm'] : ['bush'];
      } else if (t === T.MOUNTAIN || t === T.ROCK) {
        p = 0.02; kindList = ['rock'];
      }
      if (world.elev(x, y) > 200) continue;
      if (rng.next() > p) continue;
      // spacing: skip if a neighbour already has a tree
      if (world.hitsProp(x + 0.5, y + 1, 1.2) || world.isBlocked(x - 1, y) || world.isBlocked(x, y - 1) || world.isBlocked(x + 1, y) || world.isBlocked(x, y + 1)) {
        if (rng.next() < 0.7) continue;
      }
      const kind = rng.pick(kindList);
      if (kind === 'rock') {
        placeObject(world, { kind: 'rock', x: x + 0.5, y: y + 1, v: rng.int(0, 3), s: rng.range(0.7, 1.4), block: true });
      } else if (kind === 'bush' || kind === 'fern' || kind === 'deadbush') {
        placeObject(world, { kind: 'bush', sub: kind, x: x + rng.range(0.3, 0.7), y: y + 1, v: rng.int(0, 3), s: rng.range(0.8, 1.2), block: false });
      } else {
        placeObject(world, { kind: 'tree', sub: kind, x: x + rng.range(0.35, 0.65), y: y + 1, v: rng.int(0, 3), s: rng.range(0.85, 1.25), block: true });
      }
    }
  }
}

export { lerp };
