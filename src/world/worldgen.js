// Builds the Blue Planet: polar ice, the Red Line ring (Reverse Mountain in
// the centre, Mary Geoise + Red Ports on the seam), the Grand Line and Calm
// Belts (analytic regions), every island from data, filler islets, and the
// coastline distance field used by the renderer.
import { World } from './world.js';
import { ObjectIndex } from './objects.js';
import { T, CLIMATE, IS_LIQUID, OVERLAY, PALETTE } from './tiles.js';
import { W, H, EQ, RL_HALF, RM_X, POLAR, GL_TOP, GL_BOTTOM, CB_TOP, CB_BOTTOM, regionAt, REGION, isBlue, chart, csize, POS_SCALE, SIZE_SCALE } from './constants.js';
import { BS, MIXED } from './world.js';
import { RM, CANALS } from './reverseMountain.js';
import { Noise } from '../core/noise.js';
import { RNG, hash2 } from '../core/rng.js';
import { hexToRgb, clamp } from '../core/math.js';
import { generateIsland, carvePath, placeObject } from './islandgen.js';
import { generateTown } from './towngen.js';

/** Reverse Mountain (see reverseMountain.js): the massif, its canals and the summit pool. */
export const REVERSE_MOUNTAIN = RM;

export const MARY_GEOISE = {
  x: 0,
  y: EQ,
  portParadise: { x: W - RL_HALF + 4, y: EQ },
  portNewWorld: { x: RL_HALF - 4, y: EQ },
};

function yieldFrame() { return new Promise((r) => setTimeout(r, 0)); }

export async function generateWorld({ seed = 'blue-planet', islands = [], onProgress = () => {} } = {}) {
  const world = new World(W, H, { wrap: true, zone: 0, id: 'surface', fogCell: 16 });
  world.seed = seed;
  world.objects = new ObjectIndex(world);
  const noise = new Noise(seed);
  const rng = new RNG(seed + ':gen');

  onProgress(0.05, 'Freezing the poles');
  // The Red Line and the polar ice are worked out from a formula wherever
  // they're looked at (see World: MIXED blocks); only what's built into them
  // (canals, ports, the Holy Land) is stored.
  setupBase(world, noise);
  buildFloes(world, noise);
  await yieldFrame();

  onProgress(0.1, 'Raising the Red Line');
  buildRedLine(world, noise, rng);
  await yieldFrame();

  // Islands from data.
  const total = islands.length;
  for (let i = 0; i < total; i++) {
    const def = islands[i];
    if (i % 4 === 0) {
      onProgress(0.18 + 0.5 * (i / Math.max(1, total)), `Charting ${def.name}`);
      await yieldFrame();
    }
    try {
      const rec = generateIsland(world, def, noise, rng.fork(def.id));
      if (rec) world.islands.push(rec);
    } catch (e) {
      console.error(`island ${def.id} failed`, e);
    }
  }

  buildMaryGeoise(world, rng);

  onProgress(0.7, 'Scattering uncharted islets');
  scatterIslets(world, noise, rng);
  await yieldFrame();

  onProgress(0.8, 'Measuring the coasts');
  await computeDistanceField(world, yieldFrame);
  compactDistance(world);

  onProgress(0.92, 'Drawing the chart');
  world.map = buildMapImage(world);
  onProgress(1, 'Ready');
  return world;
}

// ---------------------------------------------------------------------------
// The procedural base: polar pack ice and the Red Line ring, from formulas.

const POLE_EDGE = chart(20); // how far the ice edge wanders from POLAR (at most)
const EDGE_PAD = 34; // tiles of sea kept "procedural" past a coast (the distance field reaches 32)

function setupBase(world, noise) {
  const M = REVERSE_MOUNTAIN;
  // the ice edge per column
  const ptop = new Float32Array(W), pbot = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    ptop[x] = POLAR + noise.fbm(x * 0.02, 3.3, 3) * 10 + 4;
    pbot[x] = H - POLAR - (noise.fbm(x * 0.02, 91.7, 3) * 10 + 4);
  }
  // the Red Line's two coasts per row, for both meridians (offsets from the meridian)
  const MER = [RM_X, 0];
  const L = [new Float32Array(H), new Float32Array(H)], R = [new Float32Array(H), new Float32Array(H)];
  for (let m = 0; m < 2; m++) {
    const mx = MER[m];
    for (let y = 0; y < H; y++) {
      const yc = y / POS_SCALE; // noise in chart units keeps the coast's shape
      const wobL = noise.fbm(mx * 0.01 + 5, yc * 0.012, 4) * chart(14) + noise.noise2(yc * 0.08, mx) * 3;
      const wobR = noise.fbm(mx * 0.01 + 50, yc * 0.012, 4) * chart(14) + noise.noise2(yc * 0.08, mx + 9) * 3;
      let left = -RL_HALF + wobL, right = RL_HALF + wobR;
      // Reverse Mountain massif bulges out around the equator.
      if (mx === RM_X) {
        const ey = (y - M.y) / M.ry;
        if (Math.abs(ey) < 1) {
          const bulge = M.rx * Math.sqrt(1 - ey * ey);
          left = Math.min(left, -bulge + wobL * 0.6);
          right = Math.max(right, bulge + wobR * 0.6);
        }
      }
      L[m][y] = left; R[m][y] = right;
    }
  }
  const polarRow = (y) => y < POLAR + chart(40) || y > H - POLAR - chart(40);
  const wintry = (y) => y < POLAR + chart(30) || y > H - POLAR - chart(30);
  const base = {
    ptop, pbot, L, R,
    /** The tile type alone (cheap: no elevation). */
    type(x, y) {
      for (let m = 0; m < 2; m++) {
        const dx = world.dx(MER[m], x);
        if (dx < L[m][y] || dx > R[m][y]) continue;
        if (polarRow(y)) return T.SNOWROCK;
        if (m === 0 && Math.hypot((x - M.x) * 1.6, y - M.y) < chart(70) + noise.noise2(x * 0.05, y * 0.05) * 12) return T.SNOWROCK;
        return T.RED_ROCK;
      }
      if (y < ptop[x] || y > pbot[x]) return T.PACK_ICE;
      return T.SEA;
    },
    /** Type, elevation and climate. */
    tile(x, y, out) {
      for (let m = 0; m < 2; m++) {
        const dx = world.dx(MER[m], x);
        const left = L[m][y], right = R[m][y];
        if (dx < left || dx > right) continue;
        const edge = Math.min(dx - left, right - dx);
        const ridge = noise.ridged(x * 0.03, y * 0.03, 4);
        let e = clamp(90 + edge * 4 + ridge * 90, 0, 255);
        let summit = false;
        if (m === 0) {
          const r = Math.hypot((x - M.x) / M.rx, (y - M.y) / M.ry);
          if (r < 1) e = clamp(e + (1 - r) * 140, 0, 255);
          summit = Math.hypot((x - M.x) * 1.6, y - M.y) < chart(70) + noise.noise2(x * 0.05, y * 0.05) * 12;
        }
        out[0] = polarRow(y) || summit ? T.SNOWROCK : T.RED_ROCK;
        out[1] = Math.round(e);
        out[2] = wintry(y) ? CLIMATE.WINTER : CLIMATE.TEMPERATE;
        return out;
      }
      if (y < ptop[x]) { out[0] = T.PACK_ICE; out[1] = clamp(20 + Math.floor((ptop[x] - y) * 3), 0, 255); out[2] = CLIMATE.WINTER; return out; }
      if (y > pbot[x]) { out[0] = T.PACK_ICE; out[1] = clamp(20 + Math.floor((y - pbot[x]) * 3), 0, 255); out[2] = CLIMATE.WINTER; return out; }
      out[0] = T.SEA; out[1] = 0; out[2] = 0;
      return out;
    },
    /** Encoded coastline distance: across to the Red Line's coast, up or down to the ice edge. */
    dist(x, y) {
      let best = -32;
      for (let m = 0; m < 2; m++) {
        const dx = world.dx(MER[m], x);
        const left = L[m][y], right = R[m][y];
        if (dx >= left && dx <= right) { best = Math.max(best, Math.min(32, dx - left, right - dx)); continue; }
        best = Math.max(best, -(dx < left ? left - dx : dx - right));
      }
      const t = ptop[x], b = pbot[x];
      if (y < t) best = Math.max(best, Math.min(32, t - y));
      else best = Math.max(best, -(y - t));
      if (y > b) best = Math.max(best, Math.min(32, y - b));
      else best = Math.max(best, -(b - y));
      return clamp(Math.round(128 + clamp(best, -32, 32) * 4), 0, 255);
    },
    /** Is there Red Line or ice anywhere in block (bx, by)? */
    hasLand(bx, by) {
      const x0 = bx * BS, y0 = by * BS, y1 = Math.min(H, y0 + BS);
      for (let m = 0; m < 2; m++) {
        const a = world.dx(MER[m], x0), b = a + BS - 1;
        for (let y = y0; y < y1; y++) if (b >= L[m][y] && a <= R[m][y]) return true;
      }
      for (let x = x0; x < x0 + BS; x++) if (ptop[x] > y0 || pbot[x] < y1 - 1) return true;
      return false;
    },
  };
  world.base = base;
  // Which blocks are procedural: the Red Line bands and the ice, and the
  // sea next to them (for the distance field); everything else is open sea.
  const bw = world.bw, bh = world.bh;
  for (let by = 0; by < bh; by++) {
    const y0 = by * BS, y1 = Math.min(H, y0 + BS);
    for (let m = 0; m < 2; m++) {
      let lo = Infinity, hi = -Infinity;
      for (let y = y0; y < y1; y++) { lo = Math.min(lo, L[m][y]); hi = Math.max(hi, R[m][y]); }
      const bx0 = Math.floor((MER[m] + lo - EDGE_PAD) / BS), bx1 = Math.floor((MER[m] + hi + EDGE_PAD) / BS);
      for (let bx = bx0; bx <= bx1; bx++) world.ut[by * bw + (((bx % bw) + bw) % bw)] = MIXED;
    }
  }
  const topMax = POLAR + 14 + EDGE_PAD, botMin = H - POLAR - 14 - EDGE_PAD;
  for (let by = 0; by < bh; by++) {
    const y0 = by * BS, y1 = y0 + BS;
    if (y0 > topMax && y1 < botMin) continue;
    for (let bx = 0; bx < bw; bx++) world.ut[by * bw + bx] = MIXED;
  }
}

/** Drifting floes off the pack ice. */
function buildFloes(world, noise) {
  world.floes = [];
  for (let k = 0; k < 180; k++) {
    const x = Math.floor(hash2(k, 1, 77) * W);
    const north = k % 2 === 0;
    const y = north ? POLAR + 20 + Math.floor(hash2(k, 2, 77) * chart(12)) : H - POLAR - 20 - Math.floor(hash2(k, 2, 77) * chart(12));
    const r = 2 + hash2(k, 3, 77) * 6;
    if (regionAt(x, y) === REGION.RED_LINE) continue;
    for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) {
      for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
        if (i * i + j * j > r * r * (0.85 + noise.noise2((x + i) * 0.3, (y + j) * 0.3) * 0.25)) continue;
        world.setTile(x + i, y + j, T.PACK_ICE, 30, CLIMATE.WINTER);
      }
    }
    world.floes.push({ x, y, r });
  }
  // (a floe's coast is measured in a little window of its own, not a whole patch)
  world.editedMixed.clear();
}

function buildRedLine(world, noise, rng) {
  const M = REVERSE_MOUNTAIN;
  // --- Reverse Mountain canals: four up from the Blues, one down to Paradise.
  // (only through the rock: out at sea the current runs in the open water)
  world.rmGates = [];
  M.mouths = {};
  for (const c of CANALS) {
    const n = c.x.length;
    const land = (i) => world.base.type(Math.round(c.x[i]), Math.round(c.y[i])) !== T.SEA;
    let i0 = 0, i1 = n - 1;
    if (!c.exit) { while (i0 < n - 1 && !land(i0)) i0++; i0 = Math.max(0, i0 - 3); }
    else { while (i1 > 0 && !land(i1)) i1--; i1 = Math.min(n - 1, i1 + 3); }
    c.i0 = i0; c.i1 = i1;
    const R = M.halfW;
    for (let i = i0; i <= i1; i++) {
      const cx = c.x[i], cy = c.y[i];
      for (let j = -R - 1; j <= R + 1; j++) {
        for (let k = -R - 1; k <= R + 1; k++) {
          if (k * k + j * j > (R + 0.5) * (R + 0.5)) continue;
          // (only through the rock: where it's already open sea it stays the sea)
          const tx = Math.floor(cx + k), ty = Math.floor(cy + j);
          if (world.isLiquid(tx, ty) && world.type(tx, ty) !== T.RAPIDS) continue;
          world.setTile(tx, ty, T.RAPIDS, 0, CLIMATE.TEMPERATE);
        }
      }
    }
    if (!c.exit) {
      M.mouths[c.id] = { x: c.x[0], y: c.y[0], gate: { x: c.x[i0 + 3], y: c.y[i0 + 3] } };
      // stone gates over the canal: at the cliff, along the gorge, where the climb begins
      const sGate = c.s[i0 + 3];
      for (const s of [sGate + 2, sGate + (c.len - M.climb - sGate) * 0.5, c.len - M.climb + 20, c.len - M.climb * 0.45]) {
        let i = 0;
        while (i < n - 1 && c.s[i] < s) i++;
        world.rmGates.push({ x: c.x[i], y: c.y[i], a: Math.atan2(c.fy[i], c.fx[i]), level: c.lv[i], canal: c.id });
      }
    } else {
      M.exit = { x: c.x[i1], y: c.y[i1] };
      world.rmGates.push({ x: c.x[i1 - 4], y: c.y[i1 - 4], a: 0, level: 0, canal: 'exit' });
    }
  }
  // the summit pool where the four currents meet
  const pr = M.poolR;
  for (let j = -pr; j <= pr; j++) for (let i = -pr; i <= pr; i++) {
    if (i * i + j * j <= pr * pr) world.setTile(M.x + i, M.y + j, T.RAPIDS, 0, CLIMATE.WINTER);
  }
  world.reverseMountain = M;

  // --- Red Ports at the foot of Mary Geoise, one on each side of the seam.
  const MG = MARY_GEOISE;
  for (const port of [MG.portParadise, MG.portNewWorld]) {
    const dir = port.x > W / 2 ? 1 : -1; // direction into the Red Line
    port.dir = dir;
    for (let j = -18; j <= 18; j++) {
      for (let i = -26; i <= 14; i++) {
        const x = world.wx(port.x + dir * i), y = port.y + j;
        if (i < 0) {
          // make sure open water leads into the harbour
          if (Math.abs(j) < 10) world.setTile(x, y, T.SEA, 0);
          continue;
        }
        const inBay = i < 9 && Math.abs(j) < 10 - i * 0.3;
        const shelf = Math.abs(j) <= 17 - i * 0.3;
        if (inBay) world.setTile(x, y, T.SEA, 0);
        else if (shelf) world.setTile(x, y, T.STONE, 40, CLIMATE.TEMPERATE);
      }
    }
    for (let i = 0; i <= 7; i++) {
      for (const jj of [-6, 6]) world.setTile(world.wx(port.x + dir * (8 - i)), port.y + jj, T.PLANK, 0);
    }
    port.bondola = { x: world.wx(port.x + dir * 12), y: port.y };
    port.moor = { x: world.wx(port.x - dir * 4), y: port.y };
  }
  // Mary Geoise: a marble city on top of the Red Line, reachable only by Bondola.
  const mgW = csize(22), mgH = csize(58);
  for (let j = -mgH; j <= mgH; j++) {
    for (let i = -mgW; i <= mgW; i++) {
      const x = world.wx(MG.x + i), y = MG.y + j;
      const r = Math.hypot(i / mgW, j / mgH);
      if (r < 0.95) world.setTile(x, y, r < 0.35 ? T.MARBLE : (r < 0.8 ? T.LAWN : T.STONE), 180, CLIMATE.SPRING);
    }
  }
  world.maryGeoise = MG;
}

/** The Holy Land on top of the Red Line, as an island record (NPCs, town). */
export const MARY_GEOISE_DEF = {
  id: 'mary_geoise', name: 'Mary Geoise', sea: 'red_line', x: 0, y: EQ, w: csize(44), h: csize(116), noFruit: true, noDock: true, danger: 10,
  tagline: 'The Holy Land. Home of the Celestial Dragons, 10,000 metres above the sea.',
  towns: [{ id: 'holy_land', name: 'The Holy Land', dx: 0, dy: -0.05, w: csize(36), h: csize(70), style: 'noble', walls: false, plaza: 'fountain',
    buildings: [
      { role: 'palace', name: 'Pangaea Castle', w: 12, d: 7, hgt: 6 },
      { role: 'hall', name: 'Reverie Assembly Hall' },
      { role: 'house', name: "Celestial Dragons' Mansion" },
      { role: 'church', name: 'Chapel of the First Twenty' },
    ], houses: 8 }],
};

function buildMaryGeoise(world, rng) {
  const def = MARY_GEOISE_DEF;
  const rec = {
    id: def.id, name: def.name, def, x: 0, y: EQ, sea: 'red_line', radius: csize(58),
    bbox: { cx: 0, hw: csize(22), x0: -csize(22), x1: csize(22), y0: EQ - csize(58), y1: EQ + csize(58) },
    towns: [], docks: [], spots: {}, landmarks: [], treeSpots: [],
    containsTile: (x, y) => { const dx = world.dx(0, x); return Math.hypot(dx / csize(22), (y - EQ) / csize(58)) < 0.95; },
  };
  const t = def.towns[0];
  const town = generateTown(world, { ...t, x: 0, y: EQ - 3, islandId: def.id }, rng.fork('mary_geoise'), { noise2: () => 0 });
  town.island = rec;
  rec.towns.push(town);
  rec.spots.bondola_newworld = { x: csize(16), y: EQ + 3 };
  rec.spots.bondola_paradise = { x: world.wx(-csize(16)), y: EQ + 3 };
  rec.spots.empty_throne = { x: town.plaza.x, y: town.plaza.y - 6 };
  placeObject(world, { kind: 'elevator', x: world.wx(-csize(19)), y: EQ + 1, block: true, interact: 'Ride the Bondola down to the Paradise side', use: 'bondola', port: 'down_paradise' });
  placeObject(world, { kind: 'elevator', x: csize(19), y: EQ + 1, block: true, interact: 'Ride the Bondola down to the New World side', use: 'bondola', port: 'down_newworld' });
  world.islands.push(rec);
  // Red Port lifts at the foot of the wall
  const MG = MARY_GEOISE;
  placeObject(world, { kind: 'elevator', x: MG.portParadise.bondola.x, y: MG.portParadise.bondola.y + 1, block: true, interact: 'Ride the Bondola up to Mary Geoise', use: 'bondola', port: 'paradise' });
  placeObject(world, { kind: 'elevator', x: MG.portNewWorld.bondola.x, y: MG.portNewWorld.bondola.y + 1, block: true, interact: 'Ride the Bondola up to Mary Geoise', use: 'bondola', port: 'newworld' });
}

/** Small uncharted islands for exploration (treasure, hermits, wildlife). */
function scatterIslets(world, noise, rng) {
  world.islets = [];
  const tries = 6000;
  let placed = 0;
  for (let k = 0; k < tries && placed < 640; k++) {
    const x = rng.range(chart(60), W - chart(60));
    const y = rng.range(POLAR + chart(40), H - POLAR - chart(40));
    const reg = regionAt(x, y);
    if (reg === REGION.RED_LINE || reg === REGION.POLAR) continue;
    if (Math.abs(x - RM_X) < REVERSE_MOUNTAIN.rx + chart(40) && Math.abs(y - EQ) < REVERSE_MOUNTAIN.ry + chart(40)) continue;
    // (not in the Red Line's procedural band: an islet there would be cut by the coast)
    if (world.ut[world._b(Math.floor(world.wx(x)), Math.floor(y))] === MIXED) continue;
    const r = rng.range(3, reg === REGION.PARADISE || reg === REGION.NEW_WORLD ? 11 : 9) * SIZE_SCALE;
    // keep clear of charted islands
    let ok = true;
    for (const isl of world.islands) {
      const dd = world.distance(x, y, isl.x, isl.y);
      if (dd < isl.radius + r + chart(30)) { ok = false; break; }
    }
    if (!ok) continue;
    for (const o of world.islets) if (world.distance(x, y, o.x, o.y) < o.r + r + chart(40)) { ok = false; break; }
    if (!ok) continue;
    const calm = reg === REGION.CALM_NORTH || reg === REGION.CALM_SOUTH;
    const cold = y < chart(260) || y > H - chart(260);
    const tropical = !cold && Math.abs(y - EQ) < chart(500);
    const kind = rng.next();
    let ground = T.GRASS, clim = CLIMATE.TEMPERATE, trees = 'oak';
    if (cold) { ground = T.SNOW; clim = CLIMATE.WINTER; trees = 'snowpine'; }
    else if (reg === REGION.NEW_WORLD && kind < 0.15) { ground = T.ASH; clim = CLIMATE.VOLCANIC; trees = 'dead'; }
    else if (tropical) { clim = CLIMATE.TROPICAL; trees = 'palm'; if (kind < 0.25) { ground = T.DESERT; clim = CLIMATE.ARID; trees = 'cactus'; } }
    else if (kind < 0.2) { ground = T.ROCK; trees = 'pine'; }
    const id = `islet_${placed}`;
    const def = {
      id, name: null, islet: true, x, y, w: r * 2, h: r * 2 * rng.range(0.7, 1.3),
      rough: 0.45, ground, climate: clim, treeKind: trees, treeDensity: rng.range(0.05, 0.25), calm,
    };
    const rec = generateIsland(world, def, noise, rng.fork(id));
    if (rec) {
      world.islets.push({ id, x, y, r, rec, region: reg });
      world.islands.push(rec);
      placed++;
    }
  }
}

/**
 * Signed distance to the coast (+land / −water), encoded 128 + 4*d, capped at
 * 32 tiles. Worked out in windows round everything built (islands, islets,
 * canals, ports, floes); the open sea is −32 and the Red Line and the ice
 * work theirs out from their formula.
 */
export async function computeDistanceField(world, yieldFn = null) {
  const wins = [];
  // what was built into the Red Line (canals, ports, the Holy Land), a patch of blocks at a time
  const G = 8; // blocks per patch side
  const patches = new Set();
  for (const b of world.editedMixed) patches.add(Math.floor(Math.floor(b / world.bw) / G) * 100000 + Math.floor((b % world.bw) / G));
  for (const k of patches) {
    const py = Math.floor(k / 100000), px = k % 100000;
    wins.push({ x0: px * G * BS, y0: py * G * BS, x1: (px + 1) * G * BS, y1: (py + 1) * G * BS });
  }
  for (const isl of world.islands) {
    const b = isl.bbox;
    wins.push(isl.landBox ? { ...isl.landBox } : { x0: b.cx - b.hw, y0: b.y0, x1: b.cx + b.hw, y1: b.y1 });
  }
  for (const f of world.floes || []) wins.push({ x0: f.x - f.r - 1, y0: f.y - f.r - 1, x1: f.x + f.r + 1, y1: f.y + f.r + 1 });
  // (zones are small: one window over the lot)
  if (!world.wrap) wins.splice(0, wins.length, { x0: 0, y0: 0, x1: world.width, y1: world.height });
  let t0 = performance.now();
  const S = 1100; // (a huge window goes in pieces)
  // a window needs working out past its edge only if there's other land near it
  const boxes = wins.map((w) => ({ x0: Math.floor(w.x0) - 34, y0: Math.floor(w.y0) - 34, x1: Math.ceil(w.x1) + 34, y1: Math.ceil(w.y1) + 34 }));
  const near = (a, b) => {
    const dx = Math.abs(world.dx((a.x0 + a.x1) / 2, (b.x0 + b.x1) / 2)), dy = Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
    return dx < (a.x1 - a.x0 + b.x1 - b.x0) / 2 + 40 && dy < (a.y1 - a.y0 + b.y1 - b.y0) / 2 + 40;
  };
  const mixedNear = (a) => {
    for (let by = Math.floor((a.y0 - 40) / BS); by <= Math.floor((a.y1 + 40) / BS); by++) {
      if (by < 0 || by >= world.bh) continue;
      for (let bx = Math.floor((a.x0 - 40) / BS); bx <= Math.floor((a.x1 + 40) / BS); bx++) {
        const wb = world.wrap ? ((bx % world.bw) + world.bw) % world.bw : bx;
        if (wb >= 0 && wb < world.bw && world.ut[by * world.bw + wb] === MIXED) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    let crowded = !world.wrap || mixedNear(a);
    for (let j = 0; j < boxes.length && !crowded; j++) if (j !== i && near(a, boxes[j])) crowded = true;
    for (let y = a.y0; y < a.y1; y += S) {
      for (let x = a.x0; x < a.x1; x += S) {
        distanceWindow(world, x, y, Math.min(a.x1, x + S), Math.min(a.y1, y + S), crowded || a.x1 - a.x0 > S || a.y1 - a.y0 > S ? 34 : 0);
        if (yieldFn && performance.now() - t0 > 60) { await yieldFn(); t0 = performance.now(); }
      }
    }
  }
}

// scratch buffers, reused from window to window
let SCR = { n: 0 };
function scratch(n, w) {
  if (SCR.n < n) SCR = { n, sol: new Uint8Array(n), f: new Float32Array(n), tmp: new Float32Array(n), row: SCR.row };
  if (!SCR.row || SCR.row.length < w) SCR.row = new Uint8Array(w);
  return SCR;
}

/** The distance field over [X0, X1) × [Y0, Y1) (x may wrap), written into the world. */
function distanceWindow(world, X0, Y0, X1, Y1, PAD = 34) {
  // (worked out PAD tiles past the window so its edge is right: other land may be near)
  const h0 = Math.max(0, Y0 - PAD), h1 = Math.min(world.height, Y1 + PAD);
  const x0 = X0 - PAD, x1 = X1 + PAD;
  const w = x1 - x0, h = h1 - h0;
  if (w <= 0 || h <= 0) return;
  const n = w * h;
  const { sol, f, tmp, row } = scratch(n, w);
  for (let j = 0; j < h; j++) world.solidRow(h0 + j, x0, w, sol, j * w);
  const INF = 1e6;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i, s = sol[k];
      let boundary = false;
      if (i > 0 && sol[k - 1] !== s) boundary = true;
      else if (i < w - 1 && sol[k + 1] !== s) boundary = true;
      else if (j > 0 && sol[k - w] !== s) boundary = true;
      else if (j < h - 1 && sol[k + w] !== s) boundary = true;
      f[k] = boundary ? 0.5 : INF;
    }
  }
  const D = Math.SQRT2;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let v = f[k];
      if (i > 0) v = Math.min(v, f[k - 1] + 1);
      if (j > 0) {
        v = Math.min(v, f[k - w] + 1);
        if (i > 0) v = Math.min(v, f[k - w - 1] + D);
        if (i < w - 1) v = Math.min(v, f[k - w + 1] + D);
      }
      f[k] = v;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      let v = f[k];
      if (i < w - 1) v = Math.min(v, f[k + 1] + 1);
      if (j < h - 1) {
        v = Math.min(v, f[k + w] + 1);
        if (i < w - 1) v = Math.min(v, f[k + w + 1] + D);
        if (i > 0) v = Math.min(v, f[k + w - 1] + D);
      }
      f[k] = v;
    }
  }
  // signed, then a light separable blur so stair-stepped tile coasts become
  // smooth curves (collision still uses tiles; the offset is < half a tile)
  for (let k = 0; k < n; k++) { const v = sol[k] ? f[k] : -f[k]; f[k] = v < -32 ? -32 : v > 32 ? 32 : v; }
  for (let j = 0; j < h; j++) {
    const row = j * w, last = row + w - 1;
    for (let i = 0; i < w; i++) {
      const c = row + i;
      const a = c - 2 < row ? row : c - 2, b = c - 1 < row ? row : c - 1, d = c + 1 > last ? last : c + 1, e = c + 2 > last ? last : c + 2;
      tmp[c] = f[a] * 0.1 + f[b] * 0.2 + f[c] * 0.4 + f[d] * 0.2 + f[e] * 0.1;
    }
  }
  // write the inner window
  const jy0 = Math.max(0, Y0) - h0, jy1 = Math.min(world.height, Y1) - h0;
  for (let j = jy0; j < jy1; j++) {
    const r0 = Math.max(0, j - 2) * w, r1 = Math.max(0, j - 1) * w, r2 = j * w, r3 = Math.min(h - 1, j + 1) * w, r4 = Math.min(h - 1, j + 2) * w;
    for (let i = PAD; i < w - PAD; i++) {
      let v = tmp[r0 + i] * 0.1 + tmp[r1 + i] * 0.2 + tmp[r2 + i] * 0.4 + tmp[r3 + i] * 0.2 + tmp[r4 + i] * 0.1;
      // keep the sign of the tile itself so thin features never vanish
      const raw = f[r2 + i];
      if (raw > 0 && v < 0.15) v = 0.15;
      if (raw < 0 && v > -0.15) v = -0.15;
      const e = Math.round(128 + v * 4);
      row[i] = e < 0 ? 0 : e > 255 ? 255 : e;
    }
    world.setDistRow(h0 + j, x0 + PAD, w - 2 * PAD, row, PAD);
  }
}

/** Blocks whose coastline distance came out all one value keep just that value. */
export function compactDistance(world) {
  const N = BS * BS;
  for (let b = 0; b < world.bs.length; b++) {
    const s = world.bs[b];
    if (!s || world.ut[b] === MIXED) continue;
    const v = s[0];
    let same = true;
    for (let i = 1; i < N; i++) if (s[i] !== v) { same = false; break; }
    if (same) { world.us[b] = v; world.bs[b] = null; }
  }
}

/** The painted chart used by the world map: a fixed size for the surface, half resolution for zones. */
export function buildMapImage(world) {
  const mw = world.wrap ? 3072 : Math.max(1, world.width >> 1), mh = world.wrap ? 1536 : Math.max(1, world.height >> 1);
  const sx = world.width / mw, sy = world.height / mh;
  const img = new Uint8Array(mw * mh * 4);
  const dist = new Uint8Array(mw * mh);
  const seaCol = {
    [REGION.EAST_BLUE]: '#9fd0e6',
    [REGION.NORTH_BLUE]: '#a3c4e3',
    [REGION.WEST_BLUE]: '#9cc9dc',
    [REGION.SOUTH_BLUE]: '#9bd6d6',
    [REGION.PARADISE]: '#7fc8c0',
    [REGION.NEW_WORLD]: '#a69bd6',
    [REGION.CALM_NORTH]: '#b6c2c9',
    [REGION.CALM_SOUTH]: '#b6c2c9',
    [REGION.RED_LINE]: '#9fd0e6',
    [REGION.POLAR]: '#d8e8ef',
  };
  const seaRGB = {};
  for (const k of Object.keys(seaCol)) seaRGB[k] = hexToRgb(seaCol[k]);
  const landRGB = {};
  for (const k of Object.keys(PALETTE)) landRGB[k] = hexToRgb(PALETTE[k][0]);
  landRGB[T.RED_ROCK] = hexToRgb('#a8452f');
  landRGB[T.SNOWROCK] = hexToRgb('#c9c3bd');
  for (let y = 0; y < mh; y++) {
    const ty = Math.min(world.height - 1, Math.floor((y + 0.5) * sy));
    for (let x = 0; x < mw; x++) {
      const tx = Math.min(world.width - 1, Math.floor((x + 0.5) * sx));
      const t = world.type(tx, ty);
      let c;
      if (IS_LIQUID[t] || OVERLAY[t]) {
        c = world.zone === 0 ? seaRGB[regionAt(tx, ty)] : world.zone === 2 ? [40, 90, 150] : world.zone === 3 ? [20, 16, 24] : [150, 200, 230];
        if (t === T.LAVA) c = [220, 90, 40];
        if (t === T.CLOUD_SEA) c = [235, 242, 250];
      } else {
        c = landRGB[t] || [200, 190, 160];
      }
      const o = (y * mw + x) * 4;
      img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 255;
      dist[y * mw + x] = world.distRaw(tx, ty);
    }
  }
  return { data: img, w: mw, h: mh, dist };
}

export function isSeaRegionBlue(x, y) { return isBlue(regionAt(x, y)); }
export { GL_TOP, GL_BOTTOM, CB_TOP, CB_BOTTOM };
