// Procedural towns, laid out the way people build them. A main street runs
// through, bending here and there; side streets and lanes branch off it; a
// square sits in the middle with the important buildings round it (taverns,
// shops, dojos, shipwrights…). Houses front onto the streets from both sides
// — shoulder to shoulder in terraces in towns and cities, each its own width,
// height and colour, or standing apart in their gardens in villages — most
// thickly round the square and thinning out towards the edge of town, with
// yards and trees behind, lamps and benches along the way and market stalls
// on the square. Returns a record used for NPC placement and interaction.
import { T, IS_LIQUID, WALKABLE, OVERLAY } from './tiles.js';
import { placeObject } from './islandgen.js';
import { bw } from './bframe.js';
import { RNG } from '../core/rng.js';

export const TOWN_STYLES = {
  village: { ground: null, road: T.DIRT, plaza: T.DIRT, walls: ['#caa77a', '#b8915f', '#d8c29d', '#c49a6c'], roofs: ['#9c4a2a', '#7d5a3a', '#b5452f', '#6d7a4a'], roof: 'gable', rowStep: 8, lamps: false, fences: true },
  town: { ground: T.COBBLE, road: T.STONE, plaza: T.STONE, walls: ['#f1e3c8', '#e8d5b5', '#e9e4dc', '#f5cba7', '#dbe4e6'], roofs: ['#c0392b', '#d35400', '#a04000', '#2e86c1', '#8e3b2e'], roof: 'gable', rowStep: 8, lamps: true },
  port: { ground: T.COBBLE, road: T.STONE, plaza: T.STONE, walls: ['#d7c4a3', '#c9b08d', '#e5d3b3', '#bfa37f'], roofs: ['#7b241c', '#1f618d', '#6e2c00', '#4d5656'], roof: 'gable', rowStep: 8, lamps: true },
  city: { ground: T.STONE, road: T.COBBLE, plaza: T.STONE, walls: ['#d98c5f', '#c97b4f', '#e4a47a', '#e8b996', '#b8735a'], roofs: ['#8e4430', '#5d6d7e', '#6e2c00', '#7f5539'], roof: 'gable', rowStep: 9, lamps: true, tall: true },
  desert: { ground: T.DESERT, road: T.STONE, plaza: T.STONE, walls: ['#e7c9a0', '#dcb98a', '#f0dcb8', '#e2c290'], roofs: ['#e7c9a0', '#d9b27c', '#f3e0bd'], roof: 'flat', domes: true, rowStep: 8, lamps: false },
  snow: { ground: T.SNOW, road: T.GRAVEL, plaza: T.GRAVEL, walls: ['#8e6e53', '#a1887f', '#795548'], roofs: ['#f4f8fb', '#e8eef3'], roof: 'gable', rowStep: 8, lamps: true },
  wano: { ground: T.DIRT, road: T.GRAVEL, plaza: T.GRAVEL, walls: ['#6d4c41', '#5d4037', '#efebe9', '#d7ccc8'], roofs: ['#37474f', '#263238', '#4e342e', '#455a64'], roof: 'pagoda', rowStep: 8, lamps: true, lantern: true },
  sky: { ground: T.ISLAND_CLOUD, road: T.ISLAND_CLOUD, plaza: T.ISLAND_CLOUD, walls: ['#fdfefe', '#f4f6f7', '#fef9e7'], roofs: ['#aed6f1', '#f9e79f', '#d2b4de'], roof: 'dome', rowStep: 8, lamps: false },
  candy: { ground: T.CANDY, road: T.CAKE, plaza: T.CAKE, walls: ['#fadbd8', '#fcf3cf', '#d6eaf8', '#e8daef'], roofs: ['#e74c3c', '#8e44ad', '#f5b041', '#ec7063'], roof: 'dome', rowStep: 8, lamps: true },
  fishman: { ground: T.CORAL, road: T.MARBLE, plaza: T.MARBLE, walls: ['#f5b7b1', '#aed6f1', '#f9e79f', '#a3e4d7'], roofs: ['#48c9b0', '#5dade2', '#f1948a', '#bb8fce'], roof: 'shell', rowStep: 8, lamps: true },
  marine: { ground: T.STONE, road: T.STONE, plaza: T.STONE, walls: ['#fdfefe', '#f2f3f4'], roofs: ['#2874a6', '#1b4f72', '#2e86c1'], roof: 'flat', rowStep: 9, lamps: true, flags: true },
  noble: { ground: T.MARBLE, road: T.MARBLE, plaza: T.MARBLE, walls: ['#fdfefe', '#fef9e7', '#fbeee6'], roofs: ['#d4ac0d', '#1a5276', '#7d3c98'], roof: 'gable', rowStep: 9, lamps: true },
  spooky: { ground: T.BONE, road: T.GRAVEL, plaza: T.GRAVEL, walls: ['#5b4a6b', '#4a4a5a', '#6c5b7b'], roofs: ['#2c2c3a', '#3b2f4a', '#1c2833'], roof: 'gable', rowStep: 8, lamps: true },
  future: { ground: T.STEEL, road: T.MARBLE, plaza: T.MARBLE, walls: ['#ecf0f1', '#d0ece7', '#fdedec'], roofs: ['#48c9b0', '#f1948a', '#85c1e9'], roof: 'dome', rowStep: 9, lamps: true },
  tribal: { ground: null, road: T.DIRT, plaza: T.DIRT, walls: ['#a1887f', '#8d6e63', '#bcaaa4'], roofs: ['#d4ac0d', '#b7950b', '#c9a227'], roof: 'hut', rowStep: 8, lamps: false },
  chinese: { ground: T.STONE, road: T.COBBLE, plaza: T.STONE, walls: ['#f6ddcc', '#fdebd0', '#e8daef'], roofs: ['#b03a2e', '#1e8449', '#b9770e'], roof: 'pagoda', rowStep: 8, lamps: true, lantern: true },
  mink: { ground: null, road: T.DIRT, plaza: T.DIRT, walls: ['#a0785a', '#8d6e63', '#b08563'], roofs: ['#4e7d3a', '#6b8e23', '#556b2f'], roof: 'gable', rowStep: 8, lamps: true },
  giant: { ground: null, road: T.DIRT, plaza: T.STONE, walls: ['#8d6e63', '#795548'], roofs: ['#5d4037', '#3e2723'], roof: 'gable', rowStep: 14, lamps: false, big: true },
  ruins: { ground: null, road: T.GRAVEL, plaza: T.STONE, walls: ['#9e9e9e', '#bdbdbd', '#a1887f'], roofs: ['#757575'], roof: 'ruin', rowStep: 8, lamps: false },
};

// tile types the height model lifts above their elevation (see render3d/height.js)
const RAISED = new Set([T.MOUNTAIN, T.CLIFF, T.SNOWROCK, T.ROCK, T.FOREST, T.JUNGLE].filter((t) => t !== undefined));

// special buildings: [width, depth] (a little more is fine, less is not)
const ROLE_SIZES = {
  tavern: [7, 6], inn: [7, 6], shop: [6, 5], weapons: [6, 5], dojo: [9, 7], doctor: [6, 5], shipwright: [9, 6],
  marine_base: [11, 8], bounty: [6, 5], house: [6, 5], hall: [10, 7], palace: [14, 9], church: [7, 8], bank: [7, 6],
  cafe: [6, 5], library: [8, 6], lighthouse: [4, 4], trainer: [7, 6], bar: [7, 6], market: [7, 5], restaurant: [7, 6],
};
// how a style builds: shoulder to shoulder or apart; set back from the street or on it
// (styles whose roofs overhang all round — pagodas, domes, shells, huts — stand apart)
const TERRACED = new Set(['town', 'port', 'city', 'noble', 'marine', 'spooky', 'desert']);
const APART_SETBACK = { village: 1, snow: 1, tribal: 2, mink: 1, giant: 2, wano: 1, chinese: 0, sky: 1, candy: 1, fishman: 1, future: 1, ruins: 1 };

// occupancy of the town grid
const FREE = 0, STREET = -1, SQUARE = -2, YARD = -3, NOPE = -4;

export function generateTown(world, town, rng, noise) {
  let w = Math.max(10, Math.round(town.w)), h = Math.max(8, Math.round(town.h));
  if (town.houses != null) ({ w, h } = fitTown(world, town, rng, noise, w, h));
  return layTown(world, { ...town, w, h }, rng, noise, false);
}

/**
 * The ground a town with a set number of houses needs. The island data was
 * written on a smaller chart and the islands have grown since, so a town
 * sized by its outline alone would be a big paved square with a few houses
 * in the middle of it. Instead its outline shrinks (keeping its shape) to
 * about what its buildings and streets take up, and the town is laid out on
 * paper — the same dice, nothing built — growing a step at a time until
 * every named building and nearly every house has a lot.
 */
function fitTown(world, town, rng, noise, w, h) {
  const S = TOWN_STYLES[town.style] || TOWN_STYLES.village;
  const big = !!S.big, terraced = TERRACED.has(town.style) && !big;
  let need = 0;
  for (const spec of town.buildings || []) {
    const [dw, dd] = ROLE_SIZES[spec.role] || [6, 5];
    need += ((spec.w ?? dw) + (big ? 4 : 1)) * ((spec.d ?? dd) + (big ? 5 : 2));
  }
  need += town.houses * (big ? 12 * 13 : terraced ? 5.5 * 7 : 9 * 8);
  if (town.plaza !== false) need += (2 * (town.plazaR ?? 4) + 3) ** 2;
  const k = Math.min(1, Math.sqrt(need / 0.6 / (w * h)));
  let fw = Math.max(Math.min(w, 22), Math.round(w * k)), fh = Math.max(Math.min(h, 16), Math.round(h * k));
  for (let i = 0; i < 12 && (fw < w || fh < h); i++) {
    const dice = new RNG(1);
    dice.s = rng.s;
    const plan = layTown(world, { ...town, w: fw, h: fh }, dice, noise, true);
    if (!plan.missing && plan.houses >= Math.floor(plan.wanted * 0.9)) break;
    fw = Math.min(w, Math.round(fw * 1.1) + 1);
    fh = Math.min(h, Math.round(fh * 1.1) + 1);
  }
  return { w: fw, h: fh };
}

/**
 * Lay a town out and build it. `dry`: only work out where everything would
 * go (nothing is written to the world) and report how much of it fitted.
 */
function layTown(world, town, rng, noise, dry) {
  const S = TOWN_STYLES[town.style] || TOWN_STYLES.village;
  const cx = town.x, cy = town.y;
  const w = town.w, h = town.h;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  const x1 = x0 + w, y1 = y0 + h;
  const roadTile = town.road ?? S.road;
  const groundTile = town.ground === undefined ? S.ground : town.ground;
  const plazaTile = town.plazaTile ?? S.plaza;
  const big = !!S.big;
  const terraced = TERRACED.has(town.style) && !big;
  const setback = terraced ? 0 : APART_SETBACK[town.style] ?? 1;
  const laneTile = terraced ? roadTile : (S.ground === null ? T.DIRT : roadTile);

  const okLand = (x, y) => {
    const t = world.type(x, y);
    return !IS_LIQUID[t] && WALKABLE[t] && !OVERLAY[t];
  };

  // ground (and what was there before: paving far from anything built goes back to it, see below)
  const bare = groundTile != null && !dry ? new Int16Array(w * h).fill(-1) : null;
  if (bare) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!okLand(x, y)) continue;
      const ex = (x - cx) / (w / 2), ey = (y - cy) / (h / 2);
      const v = 1.08 - Math.max(Math.abs(ex), Math.abs(ey)) + noise.noise2(x * 0.2, y * 0.2) * 0.08;
      if (v > 0) { bare[(y - y0) * w + (x - x0)] = world.type(x, y); world.setType(x, y, groundTile); }
    }
  }

  // ---- the town grid (with a margin): what each tile is used for
  const M = 3, GX = x0 - M, GY = y0 - M, GW = w + 2 * M, GH = h + 2 * M;
  const occ = new Int16Array(GW * GH);
  const gi = (x, y) => { const i = Math.floor(x) - GX, j = Math.floor(y) - GY; return i < 0 || j < 0 || i >= GW || j >= GH ? -1 : j * GW + i; };
  const occAt = (x, y) => { const k = gi(x, y); return k < 0 ? NOPE : occ[k]; };
  const setOcc = (x, y, v) => { const k = gi(x, y); if (k >= 0) occ[k] = v; };
  for (let y = GY; y < GY + GH; y++) for (let x = GX; x < GX + GW; x++) if (!okLand(x, y) || world.isBlocked(x, y)) setOcc(x, y, NOPE);

  // ---- streets: rectangles of tiles { x0, x1, y0, y1 } (inclusive), 'h' or 'v', and how important
  const streets = [];
  const paint = (r, tile, kind) => {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (!okLand(x, y)) continue;
      const o = occAt(x, y);
      if (o === SQUARE) continue;
      if (!dry) world.setType(x, y, tile);
      setOcc(x, y, kind);
    }
  };
  const horiz = town.mainDir ? town.mainDir === 'h' : w >= h;
  // (streets are made in "along/across" terms and turned for a north-south main street)
  const A0 = horiz ? x0 : y0, A1 = horiz ? x1 : y1, C0 = horiz ? y0 : x0, C1 = horiz ? y1 : x1, CC = horiz ? cy : cx, AC = horiz ? cx : cy;
  const rect = (a0, a1, c0, c1) => (horiz ? { x0: a0, x1: a1, y0: c0, y1: c1 } : { x0: c0, x1: c1, y0: a0, y1: a1 });
  const mw = w * h > 1500 || S.tall ? 3 : 2;
  // the main street: straight for a stretch, then a jog of a tile or two, and on
  let off = 0, a = A0;
  const mainSegs = [];
  while (a < A1) {
    const len = rng.int(9, 16);
    const b = Math.min(A1 - 1, a + len);
    const c = Math.round(CC - mw / 2) + off;
    const r = rect(a, b, c, c + mw - 1);
    r.dir = horiz ? 'h' : 'v'; r.rank = 0;
    mainSegs.push(r);
    a = b + 1 - mw; // (overlap the next piece so a jog stays joined up)
    if (b >= A1 - 1) break;
    if (rng.chance(0.55)) off = Math.max(-2, Math.min(2, off + rng.sign()));
  }
  // the square, on the main street near the middle
  const plazaR = town.plazaR ?? (w > 40 ? 5 : 3.5);
  const seg0 = mainSegs.reduce((p, q) => (Math.abs((q[horiz ? 'x0' : 'y0'] + q[horiz ? 'x1' : 'y1']) / 2 - AC) < Math.abs((p[horiz ? 'x0' : 'y0'] + p[horiz ? 'x1' : 'y1']) / 2 - AC) ? q : p), mainSegs[0]);
  const mainC = horiz ? (seg0.y0 + seg0.y1 + 1) / 2 : (seg0.x0 + seg0.x1 + 1) / 2;
  const plaza = horiz ? { x: Math.round(cx), y: Math.round(mainC) } : { x: Math.round(mainC), y: Math.round(cy) };
  const pa = Math.round(plazaR + 1.5), pc = Math.round(plazaR + 0.5);
  const sq = horiz ? { x0: plaza.x - pa, x1: plaza.x + pa - 1, y0: plaza.y - pc, y1: plaza.y + pc - 1 } : { x0: plaza.x - pc, x1: plaza.x + pc - 1, y0: plaza.y - pa, y1: plaza.y + pa - 1 };
  if (town.plaza !== false) {
    for (let y = sq.y0; y <= sq.y1; y++) for (let x = sq.x0; x <= sq.x1; x++) {
      // (the corners cut off, so it isn't a hard box)
      const cut = (x === sq.x0 || x === sq.x1) && (y === sq.y0 || y === sq.y1);
      if (cut || !okLand(x, y)) continue;
      if (!dry) world.setType(x, y, plazaTile);
      setOcc(x, y, SQUARE);
    }
  }
  for (const r of mainSegs) paint(r, roadTile, STREET);
  streets.push(...mainSegs);
  // how much town there'll be (a hamlet of three houses doesn't need a grid of streets)
  const houseCount = town.houses ?? Math.round((w * h) / (big ? 150 : 46));
  const planned = houseCount + (town.buildings || []).length;
  // side streets off the main street (crossroads and T-junctions), some with a jog
  const sideAt = [];
  for (let s = A0 + rng.int(5, 9); planned >= 7 && s < A1 - 4; s += rng.int(10, 15)) {
    if (town.plaza !== false && Math.abs(s - (horiz ? plaza.x : plaza.y)) < pa + 2) continue;
    sideAt.push(s);
  }
  if (!sideAt.length && A1 - A0 > 16 && planned >= 7) sideAt.push(Math.round(AC + (A1 - A0) * 0.28));
  const mainAt = (s) => mainSegs.find((r) => (horiz ? s >= r.x0 && s <= r.x1 : s >= r.y0 && s <= r.y1)) || seg0;
  for (const s of sideAt) {
    const m = mainAt(s);
    const mc0 = horiz ? m.y0 : m.x0, mc1 = horiz ? m.y1 : m.x1;
    const both = rng.chance(0.6), up = both || rng.chance(0.5);
    for (const dirn of [-1, 1]) {
      if (!both && (dirn < 0) !== up) continue;
      let c = dirn < 0 ? mc0 - 1 : mc1 + 1, sa = s;
      const end = dirn < 0 ? C0 : C1 - 1;
      const jogAt = rng.chance(0.5) ? Math.round((c + end) / 2) : null;
      // a piece from c to the jog (or the end), then the rest shifted a tile
      const pieces = jogAt === null ? [[c, end]] : [[c, jogAt], [jogAt, end]];
      pieces.forEach(([p0, p1], k) => {
        if (k === 1) sa += rng.sign();
        const r = rect(sa, sa + 1, Math.min(p0, p1), Math.max(p0, p1));
        r.dir = horiz ? 'v' : 'h'; r.rank = 1;
        paint(r, laneTile, STREET);
        streets.push(r);
      });
    }
  }
  // back lanes parallel to the main street in bigger towns (joining the side streets into blocks)
  const across = C1 - C0;
  if (across >= 28 && sideAt.length >= 2 && planned >= 20) {
    const s0 = sideAt[0], s1 = sideAt[sideAt.length - 1];
    for (const dirn of [-1, 1]) {
      const d = rng.int(11, 14);
      const c = Math.round(CC + dirn * d);
      if (c <= C0 + 3 || c >= C1 - 4) continue;
      const r = rect(s0, s1 + 1, c, c + 1);
      r.dir = horiz ? 'h' : 'v'; r.rank = 2;
      paint(r, laneTile, STREET);
      streets.push(r);
    }
  }

  // walls around the town (with gates where the streets leave it)
  if (town.walls) {
    const gate = (x, y) => occAt(x, y) === STREET || occAt(x, y) === SQUARE;
    for (let x = x0 - 1; x <= x1; x++) for (const y of [y0 - 1, y1]) {
      if (gate(x, y) || gate(x, y + (y < y0 ? 1 : -1))) continue;
      if (okLand(x, y)) { if (!dry) world.setType(x, y, T.WALL); setOcc(x, y, NOPE); }
    }
    for (let y = y0 - 1; y <= y1; y++) for (const x of [x0 - 1, x1]) {
      if (gate(x, y) || gate(x + (x < x0 ? 1 : -1), y)) continue;
      if (okLand(x, y)) { if (!dry) world.setType(x, y, T.WALL); setOcc(x, y, NOPE); }
    }
  }

  // ---- frontages: the edges of the streets and the square that buildings can face.
  // rot: 0 faces +y (a building on the north side of an east-west street), 2 faces -y,
  // 1 faces +x (the west side of a north-south street), 3 faces -x.
  const runs = [];
  const addRuns = (r, rank) => {
    if (r.dir === 'h' || r.dir === 'sq') {
      runs.push({ rot: 0, line: r.y0, s0: r.x0, s1: r.x1 + 1, rank });
      runs.push({ rot: 2, line: r.y1 + 1, s0: r.x0, s1: r.x1 + 1, rank });
    }
    if (r.dir === 'v' || r.dir === 'sq') {
      runs.push({ rot: 1, line: r.x0, s0: r.y0, s1: r.y1 + 1, rank });
      runs.push({ rot: 3, line: r.x1 + 1, s0: r.y0, s1: r.y1 + 1, rank });
    }
  };
  if (town.plaza !== false) addRuns({ ...sq, dir: 'sq' }, -1);
  for (const r of streets) addRuns(r, r.rank);
  const distToSquare = (x, y) => Math.hypot(x - plaza.x, y - plaza.y);

  /** The building record for a lot: `s` along the run, width fw, depth fd, set back sb. */
  const lotOf = (run, s, fw, fd, sb) => {
    const L = run.line;
    switch (run.rot) {
      case 0: return { x: s + fw / 2, y: L - sb, fx0: s, fx1: s + fw, fy0: L - sb - fd, fy1: L - sb };
      case 2: return { x: s + fw / 2, y: L + sb, fx0: s, fx1: s + fw, fy0: L + sb, fy1: L + sb + fd };
      case 1: return { x: L - sb, y: s + fw / 2, fx0: L - sb - fd, fx1: L - sb, fy0: s, fy1: s + fw };
      default: return { x: L + sb, y: s + fw / 2, fx0: L + sb, fx1: L + sb + fd, fy0: s, fy1: s + fw };
    }
  };
  const lotFree = (q) => {
    for (let y = q.fy0; y < q.fy1; y++) for (let x = q.fx0; x < q.fx1; x++) if (occAt(x, y) !== FREE) return false;
    return true;
  };
  /** How deep a lot can go before it runs into something (up to `want`, leaving `keep` tiles behind). */
  const depthFor = (run, s, fw, sb, want, keep) => {
    let d = 0;
    for (; d < want + keep; d++) {
      const q = lotOf(run, s, fw, d + 1, sb);
      // the new back row of tiles
      const row = run.rot === 0 ? [q.fx0, q.fx1, q.fy0, q.fy0 + 1] : run.rot === 2 ? [q.fx0, q.fx1, q.fy1 - 1, q.fy1] : run.rot === 1 ? [q.fx0, q.fx0 + 1, q.fy0, q.fy1] : [q.fx1 - 1, q.fx1, q.fy0, q.fy1];
      let ok = true;
      for (let y = row[2]; y < row[3] && ok; y++) for (let x = row[0]; x < row[1] && ok; x++) if (occAt(x, y) !== FREE) ok = false;
      if (!ok) break;
    }
    return Math.min(want, d - (d >= want + keep ? 0 : keep));
  };
  // the setback strip in front must be open ground too (not someone else's house)
  const frontFree = (run, s, fw, sb) => {
    if (!sb) return true;
    const q = lotOf(run, s, fw, sb, 0);
    return lotFree(q);
  };

  const buildings = [];
  const place = (run, s, fw, fd, sb, spec) => {
    const q = lotOf(run, s, fw, fd, sb);
    if (!lotFree(q) || !frontFree(run, s, fw, sb)) return null;
    // the door: in the middle of small fronts, off to one side on wide ones
    const doorX = fw >= 6 && spec.role === 'house' ? rng.pick([-1, 1]) * rng.range(0.6, fw / 2 - 1.3) : 0;
    const colors = { wall: spec.wall || rng.pick(S.walls), roof: spec.roof || rng.pick(S.roofs) };
    const role = spec.role;
    const tall = S.tall ? rng.int(3, 5) : terraced ? rng.pick([3, 3, 3, 4]) : rng.chance(0.35) ? 3 : 2;
    if (dry) {
      // (on paper: the lot is taken, nothing is built)
      const b = { x: q.x, y: q.y, rot: run.rot, fw, fd, role, name: spec.name };
      b.door = bw(b, doorX, 0.5);
      buildings.push(b);
      const id = buildings.length;
      for (let y = q.fy0; y < q.fy1; y++) for (let x = q.fx0; x < q.fx1; x++) setOcc(x, y, id);
      return b;
    }
    const b = placeObject(world, {
      kind: 'building',
      style: spec.style || town.style || 'village',
      roofType: spec.roofType || S.roof,
      x: q.x, y: q.y, rot: run.rot,
      fw, fd,
      hgt: spec.hgt ?? (big ? 5 : role === 'house' ? tall : Math.max(3, tall)),
      ...colors,
      role,
      name: spec.name,
      sign: spec.sign,
      npc: spec.npc,
      trainer: spec.trainer,
      shop: spec.shop,
      doorX,
      town: town.id,
      island: town.islandId,
      v: rng.int(0, 7),
      block: true,
    });
    if (!b) return null;
    b.door = bw(b, doorX, 0.5);
    buildings.push(b);
    const id = buildings.length;
    for (let y = q.fy0; y < q.fy1; y++) for (let x = q.fx0; x < q.fx1; x++) setOcc(x, y, id);
    // level the lot (and a tile round it) with the street in front, so the
    // ground floor is one step up from the street and flat inside
    const f = bw(b, 0, 0.5);
    const e0 = world.elev(Math.floor(f.x), Math.floor(f.y));
    for (let y = q.fy0 - 1; y <= q.fy1; y++) {
      for (let x = q.fx0 - 1; x <= q.fx1; x++) {
        const inLot = x >= q.fx0 && x < q.fx1 && y >= q.fy0 && y < q.fy1;
        if (!inLot && (!okLand(x, y) || occAt(x, y) === STREET || occAt(x, y) === SQUARE || occAt(x, y) > 0)) continue;
        // rock, forest and the like stand taller than their elevation: plain ground instead
        const t = world.type(x, y);
        world.setTile(x, y, RAISED.has(t) ? (groundTile ?? T.GRASS) : t, e0);
      }
    }
    return b;
  };

  // special buildings first, as close to the square as they'll go
  const specials = (town.buildings || []).slice();
  let missing = 0;
  for (const spec of specials) {
    const [dw, dd] = ROLE_SIZES[spec.role] || [6, 5];
    const fw = spec.w ?? (big ? dw + 3 : dw), want = spec.d ?? (big ? dd + 3 : dd);
    const sb = spec.role === 'palace' || spec.role === 'marine_base' ? Math.max(1, setback) : setback;
    const cands = [];
    for (const run of runs) {
      for (let s = run.s0; s + fw <= run.s1; s++) {
        const q = lotOf(run, s, fw, 1, sb);
        cands.push({ run, s, d: distToSquare(q.x, q.y) + (run.rank > 0 ? 3 * run.rank : 0) });
      }
    }
    cands.sort((p, q) => p.d - q.d);
    let ok = false;
    for (const c of cands) {
      const fd = depthFor(c.run, c.s, fw, sb, want, 0);
      if (fd < Math.min(want, Math.max(4, want - 2))) continue;
      if (place(c.run, c.s, fw, fd, sb, spec)) { ok = true; break; }
    }
    if (!ok) missing++;
  }

  // houses: along each frontage, from the square outwards, until the town is full
  let houses = 0;
  // (fill order: the square, then the main street out from the middle, the side streets, the lanes)
  const order = runs.map((run) => ({ run, d: run.rank * 30 + distToSquare(...(() => { const m = lotOf(run, (run.s0 + run.s1) / 2, 0, 1, 0); return [m.x, m.y]; })()) }));
  order.sort((p, q) => p.d - q.d);
  const widths = big ? [8, 11] : terraced ? [4, 7] : [5, 7];
  const depths = big ? [8, 10] : terraced ? [5, 7] : [4, 6];
  for (const { run } of order) {
    if (houses >= houseCount) break;
    // start from the end nearer the square
    const mid = lotOf(run, run.s0, 0, 1, 0), end = lotOf(run, run.s1, 0, 1, 0);
    const fromStart = distToSquare(mid.x, mid.y) <= distToSquare(end.x, end.y);
    let s = fromStart ? run.s0 : run.s1;
    let prevGap = 0;
    while (houses < houseCount) {
      const fw = rng.int(widths[0], widths[1]);
      const at = fromStart ? s : s - fw;
      if (fromStart ? at + fw > run.s1 : at < run.s0) break;
      const sb = setback && rng.chance(0.3) ? setback + 1 : setback;
      const want = rng.int(depths[0], depths[1]);
      const fd = depthFor(run, at, fw, sb, want, terraced ? 1 : 2);
      let b = null;
      if (fd >= (big ? 6 : 4)) b = place(run, at, fw, fd, sb, { role: 'house' });
      if (b) {
        houses++;
        // terraces: the next house shoulder to shoulder (now and then an alley between);
        // villages: a garden's width apart
        const gap = terraced ? (rng.chance(0.12) && prevGap === 0 ? 1 : 0) : rng.int(2, 4);
        prevGap = gap;
        s = fromStart ? at + fw + gap : at - gap;
      } else s += fromStart ? 1 : -1;
    }
  }

  if (dry) return { missing, houses, wanted: houseCount };

  // which sides of each building stand against a neighbour (no windows or eaves there)
  for (const b of buildings) {
    const fw = b.fw, fd = b.fd;
    b.attach = {};
    for (const side of [-1, 1]) {
      let n = 0;
      for (let z = -0.5; z > -fd; z -= 1) {
        const p = bw(b, side * (fw / 2 + 0.5), z);
        const o = occAt(p.x, p.y);
        if (o > 0 && buildings[o - 1] !== b) n++;
      }
      if (n >= Math.min(2, fd - 1)) b.attach[side < 0 ? 'left' : 'right'] = true;
    }
  }

  // ---- the square: its feature in the middle, stalls round it
  if (town.plaza !== false) {
    const feature = town.plaza || (S.flags ? 'flagpole' : town.style === 'desert' ? 'well' : w > 30 ? 'fountain' : 'well');
    placeObject(world, { kind: feature, x: plaza.x, y: plaza.y + (horiz ? 0 : 0.5), block: true, fw: feature === 'platform' ? 3 : 1, fd: feature === 'platform' ? 2 : 1, town: town.id });
  }

  // ---- street furniture
  const clearAt = (x, y, r) => okLand(x, y) && !world.isBlocked(x, y) && !world.hitsProp(x, y, r);
  const nearDoor = (x, y, r) => buildings.some((b) => Math.hypot(world.dx(b.door.x, x), b.door.y - y) < r);
  if (S.lamps) {
    // along the edges of the streets, alternating sides, never in front of a door
    for (const st of streets) {
      const len = st.dir === 'h' ? st.x1 - st.x0 + 1 : st.y1 - st.y0 + 1;
      const step = st.rank === 0 ? 7 : 9;
      for (let i = 2 + rng.int(0, 2); i < len - 1; i += step) {
        const side = (i / step | 0) % 2 ? 1 : -1;
        const x = st.dir === 'h' ? st.x0 + i + 0.5 : side < 0 ? st.x0 - 0.35 : st.x1 + 1.35;
        const y = st.dir === 'h' ? (side < 0 ? st.y0 - 0.35 : st.y1 + 1.35) : st.y0 + i + 0.5;
        if (!okLand(x, y) || nearDoor(x, y, 1.6) || world.hitsProp(x, y, 0.9)) continue;
        if (occAt(x, y) > 0) {
          // on the pavement in front of a house wall: step it out onto the street edge
          const ix = st.dir === 'h' ? x : side < 0 ? st.x0 + 0.35 : st.x1 + 0.65;
          const iy = st.dir === 'h' ? (side < 0 ? st.y0 + 0.35 : st.y1 + 0.65) : y;
          if (!nearDoor(ix, iy, 1.6) && clearAt(ix, iy, 0.9)) placeObject(world, { kind: S.lantern ? 'lantern' : 'lamp', x: ix, y: iy, block: true, light: true });
          continue;
        }
        if (clearAt(x, y, 0.9)) placeObject(world, { kind: S.lantern ? 'lantern' : 'lamp', x, y, block: true, light: true });
      }
    }
  }
  const propKinds = town.style === 'village' || town.style === 'tribal' ? ['barrel', 'crate', 'haystack'] : ['barrel', 'crate', 'barrel'];
  for (const b of buildings) {
    // barrels and crates at the corner of the front (more at shops and taverns)
    const n = b.role !== 'house' ? 2 : rng.chance(0.3) ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const side = k ? -1 : rng.sign();
      const p = bw(b, side * (b.fw / 2 - 0.55), 0.55);
      if (nearDoor(p.x, p.y, 1.3) || !clearAt(p.x, p.y, 0.7)) continue;
      placeObject(world, { kind: rng.pick(propKinds), x: p.x, y: p.y, block: true, v: rng.int(0, 3) });
    }
  }
  if (!terraced) {
    // village gardens: a vegetable plot or a fruit tree behind the house, a fence along the front
    for (const b of buildings) {
      if (b.role !== 'house') continue;
      const back = [];
      for (let z = -b.fd - 1; z >= -b.fd - 2; z--) for (let x = -b.fw / 2 + 0.5; x < b.fw / 2; x += 1) back.push(bw(b, x, z));
      if (S.fences && rng.chance(0.55)) for (const p of back) if (occAt(p.x, p.y) === FREE && okLand(p.x, p.y)) { world.setType(p.x, p.y, T.FARM); setOcc(p.x, p.y, YARD); }
      if (rng.chance(0.45)) {
        const p = bw(b, rng.pick([-1, 1]) * (b.fw / 2 + 1.2), -b.fd * 0.6);
        if (occAt(p.x, p.y) === FREE && clearAt(p.x, p.y, 1.4)) placeObject(world, { kind: 'tree', x: p.x, y: p.y, v: rng.int(0, 5), s: rng.range(0.8, 1.1), block: true });
      }
    }
  }
  if (town.stalls !== false && town.plaza !== false && (town.style === 'town' || town.style === 'port' || town.style === 'desert' || town.style === 'city' || town.style === 'wano' || town.style === 'chinese' || town.style === 'village')) {
    // market stalls round the square's edge, facing in
    const spots = [[sq.x0 + 1.4, sq.y0 + 1.2], [sq.x1 - 0.4, sq.y0 + 1.2], [sq.x0 + 1.4, sq.y1 - 0.2], [sq.x1 - 0.4, sq.y1 - 0.2]];
    for (const [px, py] of rng.shuffle(spots).slice(0, town.style === 'village' ? 2 : 4)) {
      if (clearAt(px, py - 0.5, 1.5) && !nearDoor(px, py, 2.2)) placeObject(world, { kind: 'stall', x: px, y: py, block: true, v: rng.int(0, 5) });
    }
    // benches on the square
    for (const [px, py] of [[plaza.x - 2.6, plaza.y + 2.2], [plaza.x + 2.6, plaza.y - 2.2]]) {
      if (clearAt(px, py, 1.1)) placeObject(world, { kind: 'bench', x: px, y: py, block: true });
    }
  }

  // ---- paving only where the town is: ground more than a few steps from any
  // house, yard, street or square goes back to what it was (a hamlet stands
  // in its fields, not in the middle of a paved square)
  if (bare) {
    const PAVE = 4, dist = new Uint8Array(w * h).fill(255), q = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = occAt(x0 + i, y0 + j);
      if (o > 0 || o === STREET || o === SQUARE || o === YARD) { dist[j * w + i] = 0; q.push(j * w + i); }
    }
    for (let k = 0; k < q.length; k++) {
      const c = q[k], i = c % w, j = (c / w) | 0, d = dist[c] + 1;
      if (d > PAVE) continue;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const n = jj * w + ii;
        if (dist[n] > d) { dist[n] = d; q.push(n); }
      }
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (dist[k] <= PAVE || bare[k] < 0 || world.type(x0 + i, y0 + j) !== groundTile) continue;
      world.setType(x0 + i, y0 + j, bare[k]);
    }
  }

  // NPC standing spots: beside the doors, along the streets
  const npcSpots = [];
  for (const b of buildings) npcSpots.push({ ...bw(b, (b.doorX || 0) + (b.fw >= 5 ? 1.6 : 1.25), 1.3), building: b });
  const streetSpots = [];
  for (const st of streets) {
    const ax = st.dir === 'h';
    const len = ax ? st.x1 - st.x0 + 1 : st.y1 - st.y0 + 1;
    for (let i = 1; i < len - 1; i += 3) {
      const x = ax ? st.x0 + i + 0.5 : (st.x0 + st.x1 + 1) / 2, y = ax ? (st.y0 + st.y1 + 1) / 2 : st.y0 + i + 0.5;
      // (with the street's width across, so people don't all walk down its middle)
      const across = ax ? [st.y0, st.y1 + 1] : [st.x0, st.x1 + 1];
      if (okLand(x, y)) { streetSpots.push({ x, y, ax, across }); if (i % 6 === 1) npcSpots.push({ x, y }); }
    }
  }

  return {
    id: town.id, name: town.name, x: plaza.x, y: plaza.y + 2, w, h, x0, y0, x1, y1,
    style: town.style, buildings, plaza, npcSpots, streetSpots, streets, roadTile, rows: [], mainX: plaza.x, def: town,
  };
}
