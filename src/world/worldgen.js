// Builds the Blue Planet: polar ice, the Red Line ring (Reverse Mountain in
// the centre, Mary Geoise + Red Ports on the seam), the Grand Line and Calm
// Belts (analytic regions), every island from data, filler islets, and the
// coastline distance field used by the renderer.
import { World } from './world.js';
import { ObjectIndex } from './objects.js';
import { T, CLIMATE, IS_LIQUID, OVERLAY, PALETTE } from './tiles.js';
import { W, H, EQ, RL_HALF, RM_X, POLAR, GL_TOP, GL_BOTTOM, CB_TOP, CB_BOTTOM, regionAt, REGION, isBlue } from './constants.js';
import { Noise } from '../core/noise.js';
import { RNG, hash2 } from '../core/rng.js';
import { hexToRgb, clamp } from '../core/math.js';
import { generateIsland, carvePath, placeObject } from './islandgen.js';
import { generateTown } from './towngen.js';

export const REVERSE_MOUNTAIN = {
  x: RM_X,
  y: EQ,
  rx: 118,
  ry: 350,
  // canal mouths in each Blue and the exit into Paradise (Twin Cape)
  mouths: {
    east_blue: { x: RM_X + 150, y: EQ - 318 },
    north_blue: { x: RM_X - 150, y: EQ - 318 },
    west_blue: { x: RM_X - 150, y: EQ + 318 },
    south_blue: { x: RM_X + 150, y: EQ + 318 },
  },
  exit: { x: RM_X + 150, y: EQ },
};

export const MARY_GEOISE = {
  x: 0,
  y: EQ,
  portParadise: { x: W - RL_HALF + 4, y: EQ },
  portNewWorld: { x: RL_HALF - 4, y: EQ },
};

function yieldFrame() { return new Promise((r) => setTimeout(r, 0)); }

export async function generateWorld({ seed = 'blue-planet', islands = [], onProgress = () => {} } = {}) {
  const world = new World(W, H, { wrap: true, zone: 0, id: 'surface' });
  world.seed = seed;
  world.objects = new ObjectIndex(world);
  const noise = new Noise(seed);
  const rng = new RNG(seed + ':gen');
  const d = world.data;

  onProgress(0.02, 'Filling the Blue Sea');
  // Ocean elevation 0 / climate 0 already. Give each tile a variant byte.
  for (let i = 0, n = W * H; i < n; i++) d[i * 4 + 3] = (Math.imul(i, 2654435761) >>> 25) & 127;

  onProgress(0.05, 'Freezing the poles');
  buildPoles(world, noise);
  await yieldFrame();

  onProgress(0.1, 'Raising the Red Line');
  buildRedLine(world, noise, rng);
  await yieldFrame();

  // Islands from data.
  const total = islands.length;
  for (let i = 0; i < total; i++) {
    const def = islands[i];
    if (i % 4 === 0) {
      onProgress(0.18 + 0.55 * (i / Math.max(1, total)), `Charting ${def.name}`);
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

  onProgress(0.75, 'Scattering uncharted islets');
  scatterIslets(world, noise, rng);
  await yieldFrame();

  onProgress(0.82, 'Measuring the coasts');
  computeDistanceField(world);
  await yieldFrame();

  onProgress(0.92, 'Drawing the chart');
  world.map = buildMapImage(world);
  onProgress(1, 'Ready');
  return world;
}

// ---------------------------------------------------------------------------

function buildPoles(world, noise) {
  const d = world.data;
  for (let x = 0; x < W; x++) {
    const n1 = noise.fbm(x * 0.02, 3.3, 3) * 10 + 4;
    const n2 = noise.fbm(x * 0.02, 91.7, 3) * 10 + 4;
    const top = POLAR + n1, bottom = H - POLAR - n2;
    for (let y = 0; y < POLAR + 20; y++) {
      if (y < top) {
        const i = (y * W + x) * 4;
        d[i] = T.PACK_ICE; d[i + 1] = 20 + Math.floor((top - y) * 3); d[i + 2] = CLIMATE.WINTER;
      }
    }
    for (let y = H - POLAR - 20; y < H; y++) {
      if (y > bottom) {
        const i = (y * W + x) * 4;
        d[i] = T.PACK_ICE; d[i + 1] = 20 + Math.floor((y - bottom) * 3); d[i + 2] = CLIMATE.WINTER;
      }
    }
  }
  // drifting floes
  for (let k = 0; k < 900; k++) {
    const x = Math.floor(hash2(k, 1, 77) * W);
    const north = k % 2 === 0;
    const y = north ? POLAR + 6 + Math.floor(hash2(k, 2, 77) * 60) : H - POLAR - 6 - Math.floor(hash2(k, 2, 77) * 60);
    const r = 1.5 + hash2(k, 3, 77) * 4;
    for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) {
      for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
        if (i * i + j * j > r * r) continue;
        const regn = regionAt(x + i, y + j);
        if (regn === REGION.RED_LINE) continue;
        world.setTile(x + i, y + j, T.PACK_ICE, 30, CLIMATE.WINTER);
      }
    }
  }
}

function buildRedLine(world, noise, rng) {
  const M = REVERSE_MOUNTAIN;
  // Two meridians: the centre (Reverse Mountain) and the seam (Mary Geoise).
  for (const mx of [RM_X, 0]) {
    for (let y = 0; y < H; y++) {
      const wobL = noise.fbm(mx * 0.01 + 5, y * 0.012, 4) * 14 + noise.noise2(y * 0.08, mx) * 3;
      const wobR = noise.fbm(mx * 0.01 + 50, y * 0.012, 4) * 14 + noise.noise2(y * 0.08, mx + 9) * 3;
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
      for (let dx = Math.floor(left) - 1; dx <= Math.ceil(right) + 1; dx++) {
        if (dx < left || dx > right) continue;
        const x = world.wx(mx + dx);
        const edge = Math.min(dx - left, right - dx);
        const i = (y * W + x) * 4;
        const ridge = noise.ridged(x * 0.03, y * 0.03, 4);
        let e = clamp(90 + edge * 4 + ridge * 90, 0, 255);
        if (mx === RM_X) {
          const r = Math.hypot((x - M.x) / M.rx, (y - M.y) / M.ry);
          if (r < 1) e = clamp(e + (1 - r) * 140, 0, 255);
        }
        const polar = y < POLAR + 40 || y > H - POLAR - 40;
        const summit = mx === RM_X && Math.hypot((x - M.x) * 1.6, y - M.y) < 70 + noise.noise2(x * 0.05, y * 0.05) * 12;
        world.data[i] = polar || summit ? T.SNOWROCK : T.RED_ROCK;
        world.data[i + 1] = e;
        world.data[i + 2] = y < POLAR + 30 || y > H - POLAR - 30 ? CLIMATE.WINTER : CLIMATE.TEMPERATE;
      }
    }
  }

  // --- Reverse Mountain canals: four up from the Blues, one down to Paradise.
  const summit = { x: M.x, y: M.y };
  for (const key of Object.keys(M.mouths)) {
    const m = M.mouths[key];
    // start a little out at sea so the mouth opens into the Blue
    const sx = m.x + Math.sign(m.x - M.x) * 20, sy = m.y + Math.sign(m.y - M.y) * 20;
    carvePath(world, [[sx, sy], [m.x, m.y], [summit.x + Math.sign(m.x - M.x) * 6, summit.y + Math.sign(m.y - M.y) * 6]], 7, T.SEA, noise, 0.5, { elev: 0 });
  }
  carvePath(world, [[summit.x, summit.y], [M.exit.x, M.exit.y], [M.exit.x + 24, M.exit.y]], 9, T.SEA, noise, 0.4, { elev: 0 });
  // the summit pool where the four currents meet
  for (let j = -9; j <= 9; j++) for (let i = -9; i <= 9; i++) {
    if (i * i + j * j <= 81) world.setTile(summit.x + i, summit.y + j, T.SEA, 0);
  }
  // Mouth arches: ten gates per canal (drawn as objects later by the renderer)
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
  for (let j = -58; j <= 58; j++) {
    for (let i = -22; i <= 22; i++) {
      const x = world.wx(MG.x + i), y = MG.y + j;
      const r = Math.hypot(i / 22, j / 58);
      if (r < 0.95) world.setTile(x, y, r < 0.35 ? T.MARBLE : (r < 0.8 ? T.LAWN : T.STONE), 180, CLIMATE.SPRING);
    }
  }
  world.maryGeoise = MG;
}

/** The Holy Land on top of the Red Line, as an island record (NPCs, town). */
export const MARY_GEOISE_DEF = {
  id: 'mary_geoise', name: 'Mary Geoise', sea: 'red_line', x: 0, y: EQ, w: 44, h: 116, noFruit: true, noDock: true, danger: 10,
  tagline: 'The Holy Land. Home of the Celestial Dragons, 10,000 metres above the sea.',
  towns: [{ id: 'holy_land', name: 'The Holy Land', dx: 0, dy: -0.05, w: 36, h: 70, style: 'noble', walls: false, plaza: 'fountain',
    buildings: [
      { role: 'palace', name: 'Pangaea Castle', w: 12, d: 7, hgt: 6 },
      { role: 'hall', name: 'Reverie Assembly Hall' },
      { role: 'house', name: "Celestial Dragons' Mansion" },
      { role: 'church', name: 'Chapel of the First Twenty' },
    ], houses: 3 }],
};

function buildMaryGeoise(world, rng) {
  const def = MARY_GEOISE_DEF;
  const rec = {
    id: def.id, name: def.name, def, x: 0, y: EQ, sea: 'red_line', radius: 58,
    bbox: { cx: 0, hw: 22, x0: -22, x1: 22, y0: EQ - 58, y1: EQ + 58 },
    towns: [], docks: [], spots: {}, landmarks: [], treeSpots: [],
    containsTile: (x, y) => { const dx = world.dx(0, x); return Math.hypot(dx / 22, (y - EQ) / 58) < 0.95; },
  };
  const t = def.towns[0];
  const town = generateTown(world, { ...t, x: 0, y: EQ - 3, islandId: def.id }, rng.fork('mary_geoise'), { noise2: () => 0 });
  town.island = rec;
  rec.towns.push(town);
  rec.spots.bondola_newworld = { x: 16, y: EQ + 3 };
  rec.spots.bondola_paradise = { x: world.wx(-16), y: EQ + 3 };
  rec.spots.empty_throne = { x: town.plaza.x, y: town.plaza.y - 6 };
  placeObject(world, { kind: 'elevator', x: world.wx(-19), y: EQ + 1, block: true, interact: 'Ride the Bondola down to the Paradise side', use: 'bondola', port: 'down_paradise' });
  placeObject(world, { kind: 'elevator', x: 19, y: EQ + 1, block: true, interact: 'Ride the Bondola down to the New World side', use: 'bondola', port: 'down_newworld' });
  world.islands.push(rec);
  // Red Port lifts at the foot of the wall
  const MG = MARY_GEOISE;
  placeObject(world, { kind: 'elevator', x: MG.portParadise.bondola.x, y: MG.portParadise.bondola.y + 1, block: true, interact: 'Ride the Bondola up to Mary Geoise', use: 'bondola', port: 'paradise' });
  placeObject(world, { kind: 'elevator', x: MG.portNewWorld.bondola.x, y: MG.portNewWorld.bondola.y + 1, block: true, interact: 'Ride the Bondola up to Mary Geoise', use: 'bondola', port: 'newworld' });
}

/** Small uncharted islands for exploration (treasure, hermits, wildlife). */
function scatterIslets(world, noise, rng) {
  world.islets = [];
  const tries = 1400;
  let placed = 0;
  for (let k = 0; k < tries && placed < 260; k++) {
    const x = rng.range(60, W - 60);
    const y = rng.range(POLAR + 40, H - POLAR - 40);
    const reg = regionAt(x, y);
    if (reg === REGION.RED_LINE || reg === REGION.POLAR) continue;
    if (Math.abs(x - RM_X) < REVERSE_MOUNTAIN.rx + 40 && Math.abs(y - EQ) < REVERSE_MOUNTAIN.ry + 40) continue;
    const r = rng.range(3, reg === REGION.PARADISE || reg === REGION.NEW_WORLD ? 11 : 9);
    // keep clear of charted islands
    let ok = true;
    for (const isl of world.islands) {
      const dd = world.distance(x, y, isl.x, isl.y);
      if (dd < isl.radius + r + 30) { ok = false; break; }
    }
    if (!ok) continue;
    for (const o of world.islets) if (world.distance(x, y, o.x, o.y) < o.r + r + 40) { ok = false; break; }
    if (!ok) continue;
    const calm = reg === REGION.CALM_NORTH || reg === REGION.CALM_SOUTH;
    const cold = y < 260 || y > H - 260;
    const tropical = !cold && Math.abs(y - EQ) < 500;
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

/** Signed distance to the coast (+land / −water), encoded 128 + 4*d. */
export function computeDistanceField(world) {
  const w = world.width, h = world.height, n = w * h;
  const d = world.data;
  const f = new Float32Array(n);
  const INF = 1e6;
  const solid = (i) => d[i << 2] >= 16 && !OVERLAY[d[i << 2]];
  // boundary seeds
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const s = solid(i);
      let boundary = false;
      const xl = world.wrap ? (x + w - 1) % w : Math.max(0, x - 1);
      const xr = world.wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      if (solid(y * w + xl) !== s || solid(y * w + xr) !== s) boundary = true;
      else if (y > 0 && solid(i - w) !== s) boundary = true;
      else if (y < h - 1 && solid(i + w) !== s) boundary = true;
      f[i] = boundary ? 0.5 : INF;
    }
  }
  const D = Math.SQRT2;
  // forward pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = f[i];
      if (x > 0) v = Math.min(v, f[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, f[i - w] + 1);
        if (x > 0) v = Math.min(v, f[i - w - 1] + D);
        if (x < w - 1) v = Math.min(v, f[i - w + 1] + D);
      }
      f[i] = v;
    }
  }
  // backward pass
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = f[i];
      if (x < w - 1) v = Math.min(v, f[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, f[i + w] + 1);
        if (x < w - 1) v = Math.min(v, f[i + w + 1] + D);
        if (x > 0) v = Math.min(v, f[i + w - 1] + D);
      }
      f[i] = v;
    }
  }
  // signed, then a light separable blur so stair-stepped tile coasts become
  // smooth curves (collision still uses tiles; the offset is < half a tile)
  for (let i = 0; i < n; i++) f[i] = clamp(solid(i) ? f[i] : -f[i], -32, 32);
  const tmp = new Float32Array(n);
  const K = [0.1, 0.2, 0.4, 0.2, 0.1];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -2; k <= 2; k++) {
        let xx = x + k;
        if (world.wrap) xx = (xx + w) % w; else xx = clamp(xx, 0, w - 1);
        acc += f[row + xx] * K[k + 2];
      }
      tmp[row + x] = acc;
    }
  }
  const out = world.dist;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -2; k <= 2; k++) acc += tmp[clamp(y + k, 0, h - 1) * w + x] * K[k + 2];
      const i = y * w + x;
      // keep the sign of the tile itself so thin features never vanish
      const raw = f[i];
      let v = acc;
      if (raw > 0 && v < 0.15) v = 0.15;
      if (raw < 0 && v > -0.15) v = -0.15;
      out[i] = clamp(Math.round(128 + v * 4), 0, 255);
    }
  }
}

/** Painted half-resolution chart used by the world map. */
export function buildMapImage(world) {
  const mw = world.width >> 1, mh = world.height >> 1;
  const img = new Uint8Array(mw * mh * 4);
  const d = world.data;
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
    for (let x = 0; x < mw; x++) {
      const tx = x * 2, ty = y * 2;
      const t = d[(ty * world.width + tx) * 4];
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
    }
  }
  return { data: img, w: mw, h: mh };
}

export function isSeaRegionBlue(x, y) { return isBlue(regionAt(x, y)); }
export { GL_TOP, GL_BOTTOM, CB_TOP, CB_BOTTOM };
