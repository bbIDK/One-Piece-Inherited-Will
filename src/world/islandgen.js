// Island generation from data definitions.
//
// A definition describes an island loosely (position, size, blob shape,
// climate, named features) and this module turns it into tiles + props.
// Relative feature coordinates (dx, dy) are fractions of the island's half
// extents when |v| <= 1.5, otherwise raw tile offsets.
import { T, CLIMATE, IS_LIQUID, OVERLAY, WALKABLE, MANMADE } from './tiles.js';
import { clamp, lerp } from '../core/math.js';
import { generateTown } from './towngen.js';
import { bw } from './bframe.js';
import { COLLIDE } from './objects.js';

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
  const shapeNoise = (px, py) => noise.fbm(px * nf + seedOff, py * nf - seedOff, 4) + noise.noise2(px * nf * 4.1, py * nf * 4.1) * 0.25;
  // (on a big island the coast's noise is smooth over a couple of tiles:
  // work it out every other tile and blend between)
  const shape = nf * 4.1 < 0.12 ? coarseField(shapeNoise, x0 + 0.5, y0 + 0.5, LW, LH) : shapeNoise;
  for (let j = 0; j < LH; j++) {
    for (let i = 0; i < LW; i++) {
      const px = x0 + i + 0.5, py = y0 + j + 0.5;
      let v = -1;
      for (const b of blobs) {
        const ex = (px - b.x) / b.rx, ey = (py - b.y) / b.ry;
        v = Math.max(v, 1 - Math.sqrt(ex * ex + ey * ey));
      }
      if (v < -rough * 1.4) continue;
      if (v + shape(px, py) * rough > 0) L[li(i, j)] = 1;
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
  // the land's own extent (the coastline's distance field is measured round it)
  let lx0 = LW, ly0 = LH, lx1 = -1, ly1 = -1;
  for (let j = 0; j < LH; j++) {
    const row = j * LW;
    for (let i = 0; i < LW; i++) if (L[row + i]) { if (i < lx0) lx0 = i; if (i > lx1) lx1 = i; if (j < ly0) ly0 = j; if (j > ly1) ly1 = j; }
  }

  // local distance to water (4-connected BFS)
  const CD = localCoastDistance(L, LW, LH);

  // write base terrain
  const beachW = def.beachWidth ?? (ground === T.SNOW ? 1.2 : 2.2);
  let landCount = 0;
  const lumps = coarseField((x, y) => noise.fbm(x * 0.05 + 11, y * 0.05 - 7, 3), x0, y0, LW, LH);
  for (let j = 0; j < LH; j++) {
    for (let i = 0; i < LW; i++) {
      const k = li(i, j);
      if (!L[k]) continue;
      landCount++;
      const x = x0 + i, y = y0 + j;
      const cd = CD[k];
      const n = lumps(x, y);
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
    // (a few tiles over for quays and sea walls at the water's edge)
    landBox: { x0: x0 + lx0 - 6, y0: y0 + ly0 - 6, x1: x0 + lx1 + 7, y1: y0 + ly1 + 7 },
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
      world.setElev(x, y, e);
      if (e > (f.cliff ?? 222)) world.setType(x, y, f.snow || clim === CLIMATE.WINTER ? T.SNOWROCK : (f.peak ?? T.MOUNTAIN));
      else if (e > (f.slopeAt ?? 170) && f.slope && world.type(x, y) !== beach) world.setType(x, y, f.slope);
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
  // every town can be walked to from the first: a road to any that can't
  for (const t of rec.towns.slice(1)) {
    const a = rec.towns[0].plaza, b = t.plaza;
    if (!walkable(world, rec.landBox, a.x, a.y + 2, b.x, b.y + 2)) connectRoad(world, a.x, a.y, b.x, b.y, t.roadTile || T.DIRT);
  }

  // landmarks & props -------------------------------------------------------
  rec.clearings = [];
  for (const lm of def.landmarks || []) {
    const c = P(lm);
    const o = { ...lm, x: c.x, y: c.y, kind: lm.kind || lm.type };
    delete o.dx; delete o.dy;
    settleLandmark(world, rec, o, ground);
    if (o.block === undefined) o.block = true;
    if (o.kind === 'building' && o.role && !o.door) o.door = bw(o, 0, 0.5);
    if (o.lore && !o.interact) { o.interact = o.loreLabel || `Examine ${o.name || 'it'}`; o.use = 'lore'; o.interactRange = o.interactRange || 2.2; }
    if (o.kind === 'poneglyph' && !o.interact) { o.interact = o.road ? 'Examine the red Road Poneglyph' : 'Examine the Poneglyph'; o.use = 'poneglyph'; o.interactRange = 2.4; }
    if (o.kind === 'bell' && !o.interact) { o.interact = 'Ring the bell'; o.use = 'bell'; o.interactRange = 2.4; }
    placeObject(world, o);
    rec.landmarks.push(o);
    if (lm.spot) rec.spots[lm.spot] = { x: o.x, y: o.y + 1.2 };
  }
  for (const s of def.spots || []) {
    const c = P(s);
    rec.spots[s.id] = { x: c.x, y: c.y, ...s, dx: undefined, dy: undefined };
  }

  // vegetation ----------------------------------------------------------------
  def._clearings = rec.clearings;
  const treeKinds = def.treeKind ? [def.treeKind] : def.trees || preset.trees;
  const density = def.treeDensity ?? preset.density;
  populateVegetation(world, rng, x0, y0, LW, LH, L, li, treeKinds, density, def);
  delete def._clearings;

  return rec;
}

/** Can you walk from (ax, ay) to (bx, by) without leaving box (the island's land)? */
function walkable(world, box, ax, ay, bx, by) {
  const W = box.x1 - box.x0 + 1, H = box.y1 - box.y0 + 1;
  const seen = new Uint8Array(W * H), q = [];
  const ok = (x, y) => x >= box.x0 && y >= box.y0 && x <= box.x1 && y <= box.y1 && WALKABLE[world.type(x, y)] && !world.solid(x, y);
  const sx = Math.floor(ax), sy = Math.floor(ay), tx = Math.floor(bx), ty = Math.floor(by);
  if (!ok(sx, sy)) return true; // (nowhere sensible to start from: leave it be)
  q.push(sx, sy); seen[(sy - box.y0) * W + sx - box.x0] = 1;
  for (let h = 0; h < q.length; h += 2) {
    const x = q[h], y = q[h + 1];
    if (Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1) return true;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ddx, ny = y + ddy;
      if (!ok(nx, ny)) continue;
      const k = (ny - box.y0) * W + nx - box.x0;
      if (seen[k]) continue;
      seen[k] = 1;
      q.push(nx, ny);
    }
  }
  return false;
}

// things that belong in or by the water: left where the data puts them
const SHORE_KINDS = new Set(['boat', 'shipwreck', 'anchor', 'bubble', 'mooring', 'buoy', 'rapids', 'geyser']);

/**
 * Give a landmark firm, level ground: off the water if it landed there (an
 * island's coast is noise, so "on the shore" in the data can be a metre out
 * to sea), the ground under it levelled with a gentle rim (so it neither
 * floats over a dip nor sinks into a rise), and a clearing round it that no
 * tree grows in.
 */
function settleLandmark(world, rec, o, ground) {
  const s = o.s || 1, c = COLLIDE[o.kind];
  const r = o.kind === 'building' ? Math.hypot(o.fw || 4, o.fd || 4) / 2 + 0.5
    : Array.isArray(c) ? Math.hypot(c[0], c[1]) * s + 0.4 : typeof c === 'number' && c > 0 ? c * s + 0.4 : Math.max(1, Math.max(o.fw || 1, o.fd || 1) / 2 + 0.4);
  const shore = SHORE_KINDS.has(o.kind) || o.water;
  /** Every tile the foot (radius R) touches. */
  const tiles = (x, y, R, fn) => {
    for (let ty = Math.floor(y - R); ty <= Math.floor(y + R); ty++) {
      for (let tx = Math.floor(x - R); tx <= Math.floor(x + R); tx++) {
        const nx = Math.max(tx, Math.min(x, tx + 1)), ny = Math.max(ty, Math.min(y, ty + 1));
        if ((nx - x) ** 2 + (ny - y) ** 2 <= R * R && fn(tx, ty)) return true;
      }
    }
    return false;
  };
  // (in the water, or standing in a house — the towns are built first)
  const wet = (x, y) => tiles(x, y, r, (tx, ty) => (!shore && world.isLiquid(tx, ty)) || world.isBlocked(tx, ty));
  // (astride a cliff or the foot of a mountain — rock and cliff stand metres
  // taller than the ground beside them, and the ground's mesh blends a tile
  // either side)
  const LIFT = { [T.MOUNTAIN]: 7, [T.CLIFF]: 4, [T.SNOWROCK]: 9, [T.RED_ROCK]: 7 };
  const steep = (x, y) => {
    let lo = Infinity, hi = -Infinity;
    tiles(x, y, r + 1.2, (tx, ty) => {
      const t = world.type(tx, ty);
      if (IS_LIQUID[t] || OVERLAY[t]) return false;
      const h = world.elev(tx, ty) * 0.075 + (LIFT[t] || 0);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
      return false;
    });
    return hi - lo > 2.5;
  };
  const bad = (x, y) => wet(x, y) || (!o.cliff && steep(x, y));
  if (bad(o.x, o.y)) {
    // step inland (toward the middle of the island first) to the nearest clear, dry, even ground
    const toward = Math.atan2(rec.y - o.y, world.dx(o.x, rec.x));
    let best = null;
    for (let d = 1; d <= 24 && !best; d += 1) {
      for (let k = 0; k < 16 && !best; k++) {
        const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const x = o.x + Math.cos(a) * d, y = o.y + Math.sin(a) * d;
        if (!bad(x, y) && (shore || !world.isLiquid(x, y))) best = { x, y };
      }
    }
    if (best) { o.x = world.wx(best.x); o.y = best.y; if (o.kind === 'building' && o.role) o.door = bw(o, 0, 0.5); }
  }
  // level: the elevation at its middle, blended out over a couple of metres
  const e0 = world.elev(Math.floor(o.x), Math.floor(o.y));
  const R = r + 2.5;
  for (let y = Math.floor(o.y - R); y <= Math.ceil(o.y + R); y++) {
    for (let x = Math.floor(o.x - R); x <= Math.ceil(o.x + R); x++) {
      const t = world.type(x, y);
      // (the water, piers, streets and squares, and anything built, stay as they are)
      if (IS_LIQUID[t] || OVERLAY[t] || MANMADE[t] || world.isBlocked(x, y)) continue;
      if (!WALKABLE[t] && !RAISED_GROUND.has(t) && t !== T.MOUNTAIN && t !== T.CLIFF) continue;
      const d = Math.hypot(x + 0.5 - o.x, y + 0.5 - o.y);
      if (d > R) continue;
      const k = d <= r ? 1 : 1 - (d - r) / (R - r);
      const e = world.elev(x, y);
      // (rocks and woods stand a little taller than their elevation: plain ground under the landmark itself)
      if (d <= r && RAISED_GROUND.has(t)) world.setTile(x, y, ground, Math.round(e0));
      else world.setElev(x, y, Math.round(e + (e0 - e) * k));
    }
  }
  rec.clearings.push({ x: o.x, y: o.y, r: r + 1.2 });
}
const RAISED_GROUND = new Set([T.ROCK, T.FOREST, T.JUNGLE].filter((t) => t !== undefined));

// ---------------------------------------------------------------------------

/**
 * A smooth field sampled every other tile over [x0, x0+w) × [y0, y0+h),
 * worked out only where it's asked for, and blended in between.
 */
function coarseField(fn, x0, y0, w, h) {
  const GW = (w >> 1) + 2, GH = (h >> 1) + 2;
  const g = new Float32Array(GW * GH).fill(NaN);
  const at = (gi, gj) => {
    const k = gj * GW + gi;
    let v = g[k];
    if (v !== v) v = g[k] = fn(x0 + gi * 2, y0 + gj * 2);
    return v;
  };
  return (x, y) => {
    const fx = (x - x0) * 0.5, fy = (y - y0) * 0.5;
    const gi = Math.max(0, Math.min(GW - 2, Math.floor(fx))), gj = Math.max(0, Math.min(GH - 2, Math.floor(fy)));
    const tx = fx - gi, ty = fy - gj;
    const a = at(gi, gj), b = at(gi + 1, gj), c = at(gi, gj + 1), d = at(gi + 1, gj + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

/** A raised floor (ring, stage) at or within r of (x, y)? */
function nearFloor(world, x, y, r) {
  if (world.floorRec(x, y)) return true;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (world.floorRec(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true;
  }
  return false;
}

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
  // A harbour pier: built square to the grid (a diagonal one would be a
  // staircase of tiles), so a diagonal request takes whichever of its two
  // sides reaches open water first. Walk out from `from` to the coast.
  const dirs = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const split = { ne: ['n', 'e'], nw: ['n', 'w'], se: ['s', 'e'], sw: ['s', 'w'] };
  const fx = Math.floor(from.x), fy = Math.floor(from.y);
  const search = (list, need) => {
    let found = null;
    for (const [vx, vy] of list) {
      for (let s = 0; s < 400; s++) {
        const x = fx + vx * s, y = fy + vy * s;
        if (!world.inBounds(x, y)) break;
        if (world.isLiquid(x, y) && world.sailable(x, y)) {
          // make sure it's open water, not a pond
          let open = 0;
          for (let k = 1; k <= 14; k++) if (world.isLiquid(x + vx * k, y + vy * k)) open++;
          if (open >= need && (!found || s < found.s)) found = { s, x, y, vx, vy };
          break;
        }
      }
    }
    return found;
  };
  // the way asked for, then any way at all, wanting open water ahead (a little less, at a pinch)
  const want = dir ? (split[dir] || [dir]).map((k) => dirs[k]).filter(Boolean) : Object.values(dirs);
  const best = search(want, 12) || search(Object.values(dirs), 12) || search(want, 9) || search(Object.values(dirs), 9);
  if (!best) return null;
  const { vx, vy } = best;
  const px = -vy, py = vx; // across the pier
  const W = Math.max(3, dd.width ?? 5) | 1; // an odd number of planks wide, centred on its axis
  const half = (W - 1) / 2, headHalf = half + 2, HEAD = 3;
  const L = Math.max(6, Math.round(len * 1.5));
  // tile a along the pier (0 = the first tile of open water), b across it
  const at = (a, b) => ({ x: world.wx(best.x + vx * a + px * b), y: best.y + vy * a + py * b });
  // the pier: a deck on pilings out over the water, and a T-shaped head to berth at
  let lastA = 0;
  for (let a = 0; a < L; a++) {
    const head = a >= L - HEAD, hb = head ? headHalf : half;
    let placed = false;
    for (let b = -hb; b <= hb; b++) {
      const { x, y } = at(a, b);
      if (world.isOverlay(x, y)) continue;
      // (a sandbar in the way is decked over too, rather than leaving a hole in the pier)
      if (!world.isLiquid(x, y)) {
        const t = world.type(x, y);
        if (world.isBlocked(x, y) || t === T.WALL || t === T.CLIFF || t === T.MOUNTAIN || world.elev(x, y) > 40) continue;
      }
      world.setTile(x, y, T.PLANK, 0);
      world.markDock(x, y, { vx, vy, a, b, hb, head, last: a === L - 1, half });
      placed = true;
    }
    if (placed) lastA = a;
  }
  // the quay: a stone landing at the head of the beach, level with the deck;
  // the ground ramps up (or down) into it (see render3d/height.js), and a sea
  // wall faces the water
  const Q = 4, qh = half + 1;
  for (let a = -Q; a < 0; a++) {
    for (let b = -qh; b <= qh; b++) {
      const { x, y } = at(a, b);
      if (world.isBlocked(x, y) || world.isOverlay(x, y)) continue;
      const t = world.type(x, y);
      if (t === T.WALL || t === T.CLIFF || t === T.MOUNTAIN) continue;
      // (a little inlet under the quay is filled in)
      world.setTile(x, y, T.STONE, world.isLiquid(x, y) ? 0 : undefined);
      world.markQuay(x, y);
    }
  }
  world.dockPads.push({
    // the middle of its front edge (tile corners), which way the sea lies, its size, and how far the ground ramps
    cx: best.x + 0.5 - vx * 0.5, cy: best.y + 0.5 - vy * 0.5, vx, vy, depth: Q, halfW: qh + 0.5, r: 7, pierLen: L + 1, pierHalf: headHalf + 0.5,
    x0: Math.min(at(-Q, -qh).x, at(-1, qh).x), x1: Math.max(at(-Q, -qh).x, at(-1, qh).x),
    y0: Math.min(at(-Q, -qh).y, at(-1, qh).y), y1: Math.max(at(-Q, -qh).y, at(-1, qh).y),
  });
  world.padIndex = null;
  // bollards and a lamp on the quay's corners, a crate or two and a barrel
  for (const sg of [-1, 1]) {
    const c = at(-1, sg * qh);
    placeObject(world, { kind: 'lamp', x: c.x + 0.5, y: c.y + 0.5, block: true });
    const k = at(-Q + 1, sg * qh);
    placeObject(world, { kind: sg > 0 ? 'crate' : 'barrel', x: k.x + 0.5, y: k.y + 0.5, block: true });
  }
  const end = at(lastA, 0);
  const side = headHalf + 3;
  // ships berth beside the head, on whichever side has the deeper water
  // (open water: well away from any shore, or a ship would sit on the bottom)
  const berth = (sg, out = 0) => ({ x: world.wx(end.x + 0.5 - vx + px * side * sg + vx * out), y: end.y + 0.5 - vy + py * side * sg + vy * out });
  // (how far to the nearest land or pier, up to 8 tiles: the coast's distance field isn't made yet)
  const clearance = (m) => {
    const mx = Math.floor(m.x), my = Math.floor(m.y);
    if (!world.isLiquid(mx, my) || world.isOverlay(mx, my)) return 0;
    for (let r = 1; r <= 8; r++) {
      for (let k = -r; k <= r; k++) {
        for (const [ax, ay] of [[mx + k, my - r], [mx + k, my + r], [mx - r, my + k], [mx + r, my + k]]) {
          if (!world.isLiquid(ax, ay) || world.isOverlay(ax, ay)) return r;
        }
      }
    }
    return 9;
  };
  let moor = berth(1), room = clearance(moor);
  for (const [sg, out] of [[-1, 0], [1, 2], [-1, 2], [0, 5], [1, 4], [-1, 4], [0, 8], [0, 11]]) {
    if (room >= 5) break;
    const m = sg ? berth(sg, out) : { x: world.wx(end.x + 0.5 + vx * out), y: end.y + 0.5 + vy * out };
    const c = clearance(m);
    if (c > room) { room = c; moor = m; }
  }
  const land = at(-Q - 2, 0);
  const tip = at(lastA, headHalf);
  placeObject(world, { kind: 'mooring', x: tip.x + 0.5, y: tip.y + 0.5, block: false });
  const stand = shipwrightStand(world, at, { lastA, half, headHalf, qh, vx, vy, px, py });
  return { x: end.x, y: end.y, dirX: vx, dirY: vy, moor, land: { x: land.x + 0.5, y: land.y + 0.5 }, end: { x: end.x, y: end.y }, half, headHalf, len: lastA + 1, stand };
}

/**
 * Where the harbour's shipwright stands (see game/shipwrights.js): on the
 * pier head's shoulder, a step off the walkway, on the side away from where
 * the boats tie up (the + side, whenever there's open water there: see
 * Ship.moorAlongside), facing up the pier. No head to stand on: beside the
 * walkway near the end, or on the quay. { x, y, face } (or null).
 */
function shipwrightStand(world, at, { lastA, half, headHalf, qh, vx, vy, px, py }) {
  let open = true;
  for (let a = lastA - 2; a <= lastA; a++) for (let b = headHalf + 1; b <= headHalf + 3; b++) { const t = at(a, b); if (!world.sailable(t.x + 0.5, t.y + 0.5)) open = false; }
  const far = open ? -1 : 1;
  const cands = [];
  if (headHalf > half) for (const sg of [far, -far]) for (const a of [lastA - 1, lastA - 2]) cands.push([a, sg * (half + 1), 'pier']);
  for (const sg of [far, -far]) for (const a of [lastA - 1, lastA - 2, lastA - 3]) cands.push([a, sg * half, 'pier']);
  for (const sg of [far, -far]) cands.push([-2, sg * qh, 'quay']);
  for (const [a, b, on] of cands) {
    const t = at(a, b), x = t.x + 0.5, y = t.y + 0.5;
    if (on === 'pier' ? !world.isDock(x, y) : !world.isQuay(x, y)) continue;
    if (!world.walkable(x, y) || world.isLiquid(x, y) || world.isBlocked(x, y) || world.hitsProp(x, y, 0.45)) continue;
    const sb = Math.sign(b);
    return { x, y, face: Math.atan2(-vy - py * sb * 0.6, -vx - px * sb * 0.6) };
  }
  return null;
}

/**
 * A road from (ax, ay) to (bx, by), two tiles wide. It opens a gate where it
 * meets a town's wall, and cuts a pass where it meets cliff or mountainside
 * (a town up on a hill can be ringed by its own cliffs).
 */
export function connectRoad(world, ax, ay, bx, by, tile) {
  const dx = world.dx(ax, bx), dy = by - ay;
  const steps = Math.ceil(Math.hypot(dx, dy) * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = ax + dx * t, y = ay + dy * t;
    for (let j = -1; j <= 0; j++) for (let i = -1; i <= 0; i++) {
      let cur = world.type(x + i, y + j);
      if (cur === T.MOUNTAIN || cur === T.CLIFF) { world.setType(x + i, y + j, tile); cur = tile; }
      if (cur === T.WALL) {
        // (through a town's wall: a gate, three tiles wide — the harbour road
        // is laid after the town, and its wall used to cut it off)
        for (let gy = -1; gy <= 1; gy++) for (let gx = -1; gx <= 1; gx++) if (world.type(x + i + gx, y + j + gy) === T.WALL) world.setType(x + i + gx, y + j + gy, tile);
        continue;
      }
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
      if (IS_LIQUID[t] || !WALKABLE[t]) continue;
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
      // (the dice first: the checks below are the dear part)
      if (rng.next() > p) continue;
      if (world.elev(x, y) > 200) continue;
      if (world.isBlocked(x, y) || world.hitsProp(x + 0.5, y + 0.5, 1.1)) continue;
      // (nothing grows through a ring or a stage, or crowds round one — or any other landmark)
      if (world.floors.size && nearFloor(world, x + 0.5, y + 0.8, 3)) continue;
      if (def._clearings?.some((c) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < c.r)) continue;
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
