// The 3D height model. The game simulation stays on the 2D tile plane; this
// turns a tile map (type, elevation, coastline distance) into ground heights
// in metres (1 tile = 1 m, sea level = 0) so the 3D view, the camera and every
// entity agree on where the ground is.
//
//  * Land rises from the waterline over a few tiles to its tile elevation.
//  * Mountains, cliffs and the Red Line get extra height so they tower.
//  * Water tiles slope down to a sea floor.
//  * Decks (docks, bridges, sea-train rails) are platforms above the water.
//  * Walls are vertical blocks (see WALL_H), not hills.
import { T, IS_LIQUID, OVERLAY } from '../world/tiles.js';
import { RM_X, RL_HALF } from '../world/constants.js';

export const SEA_Y = 0;
export const DECK_Y = 0.55; // top of docks and bridges
export const WALL_H = 3.2; // town walls, prison walls
export const CHUNK = 32; // tiles per terrain chunk side

const ELEV_K = 0.075; // metres per elevation unit
const BOOST = new Float32Array(256);
BOOST[T.MOUNTAIN] = 7;
BOOST[T.CLIFF] = 4;
BOOST[T.SNOWROCK] = 9;
BOOST[T.RED_ROCK] = 0; // the Red Line gets its own curve below
BOOST[T.ROCK] = 1.2;
BOOST[T.FOREST] = 0.3;
BOOST[T.JUNGLE] = 0.4;

export const isWallTile = (t) => t === T.WALL;

/** Is this surface tile part of the Red Line (or the Reverse Mountain massif)? */
function onRedLine(world, x) {
  if (world.zone !== 0) return false;
  const dm = Math.abs(world.dx(x, RM_X)), ds = Math.abs(world.dx(x, 0));
  return dm < RL_HALF + 90 || ds < RL_HALF + 30;
}

/** Height of one land tile before the coastal ramp. */
function landHeight(world, x, t, e) {
  if (t === T.RED_ROCK || (t === T.SNOWROCK && onRedLine(world, x))) {
    // the Red Line: a wall of red rock that dwarfs everything
    return 38 + Math.max(0, e - 90) * 0.55 + (t === T.SNOWROCK ? 9 : 0);
  }
  return 0.45 + Math.min(e, 190) * ELEV_K + BOOST[t];
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Height at a tile corner (integer cx, cy). Averages the land tiles around the
 * corner and ramps down to the waterline using the smooth coastline distance.
 */
export function cornerHeight(world, cx, cy) {
  let sum = 0, n = 0, walls = 0, tall = 0;
  for (let j = -1; j <= 0; j++) {
    for (let i = -1; i <= 0; i++) {
      const x = cx + i, y = cy + j;
      const t = world.type(x, y);
      if (IS_LIQUID[t] || OVERLAY[t]) continue;
      if (t === T.WALL) { walls++; continue; }
      const h = landHeight(world, x, t, world.elev(x, y));
      sum += h; n++;
      if (h > tall) tall = h;
    }
  }
  const sd = world.sd(cx, cy);
  if (!n) {
    if (walls) return 0.4; // wall blocks stand on flat ground
    return Math.max(-12, sd * 0.9) - 0.25;
  }
  // mostly keep the average, but let peaks read as peaks
  const land = sum / n * 0.75 + tall * 0.25;
  if (sd <= 0) return 0.2 + sd * 0.4;
  return 0.25 + (land - 0.25) * smooth(0, 3.2, sd);
}

/**
 * Per-world cache of chunk height grids ((CHUNK+1)^2 corners each), shared by
 * the terrain meshes and by ground queries for entities.
 */
export class HeightField {
  constructor(world) {
    this.world = world;
    this.chunks = new Map();
    this.cw = Math.ceil(world.width / CHUNK);
    this.ch = Math.ceil(world.height / CHUNK);
  }

  key(cx, cy) { return cy * 100000 + cx; }

  /** Height grid for chunk (cx, cy); cx is wrapped for wrapping worlds. */
  grid(cx, cy) {
    const w = this.world;
    if (w.wrap) cx = ((cx % this.cw) + this.cw) % this.cw;
    const k = this.key(cx, cy);
    let g = this.chunks.get(k);
    if (g) return g;
    const N = CHUNK + 1;
    g = new Float32Array(N * N);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) g[j * N + i] = cornerHeight(w, x0 + i, y0 + j);
    }
    this.chunks.set(k, g);
    if (this.chunks.size > 2400) {
      // forget the oldest grids (they are cheap to rebuild)
      const first = this.chunks.keys().next().value;
      this.chunks.delete(first);
    }
    return g;
  }

  /** Height of the terrain surface at (x, y), matching the rendered mesh. */
  terrain(x, y) {
    const w = this.world;
    x = w.wx(x);
    if (y < 0 || y >= w.height || (!w.wrap && (x < 0 || x >= w.width))) return -12;
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const g = this.grid(cx, cy);
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
    const i = Math.min(CHUNK - 1, Math.floor(lx)), j = Math.min(CHUNK - 1, Math.floor(ly));
    const fx = lx - i, fy = ly - j;
    const N = CHUNK + 1;
    const a = g[j * N + i], b = g[j * N + i + 1], c = g[(j + 1) * N + i], d = g[(j + 1) * N + i + 1];
    // the mesh splits each quad along the a–d diagonal
    if (fx >= fy) return a + (b - a) * fx + (d - b) * fy;
    return a + (d - c) * fx + (c - a) * fy;
  }

  /** Where feet rest at (x, y): decks and wall tops over the terrain. */
  ground(x, y) {
    const t = this.world.type(x, y);
    if (OVERLAY[t]) return DECK_Y;
    const h = this.terrain(x, y);
    if (IS_LIQUID[t]) return Math.max(h, SEA_Y);
    return h;
  }

  /** Invalidate after the tile map changed in a rectangle (tiles). */
  invalidate(x0, y0, x1, y1) {
    for (let cy = Math.floor((y0 - 1) / CHUNK); cy <= Math.floor((y1 + 1) / CHUNK); cy++) {
      for (let cx = Math.floor((x0 - 1) / CHUNK); cx <= Math.floor((x1 + 1) / CHUNK); cx++) {
        const wcx = this.world.wrap ? ((cx % this.cw) + this.cw) % this.cw : cx;
        this.chunks.delete(this.key(wcx, cy));
      }
    }
  }
}
