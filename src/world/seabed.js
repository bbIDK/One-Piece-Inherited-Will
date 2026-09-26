// What lies on the sea floor, shared by the 3D view (which draws it) and the
// game (divers find giant clams and meet the sea's wildlife): how warm the
// water is at a point, and where the giant clams sit. All derived from the
// map, so nothing needs saving.
import { T, CLIMATE } from './tiles.js';
import { EQ, H } from './constants.js';

export function hash(x, y, k) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(k | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * How warm the water is (0 polar … 1 tropical): the tropics are warm and the
 * high latitudes cold, and the nearest island's climate has the last word.
 */
const WARM = new Map();
export function warmth(world, x, y) {
  const key = Math.floor(x / 64) * 100000 + Math.floor(y / 64);
  if (WARM.world !== world) { WARM.clear(); WARM.world = world; }
  let w = WARM.get(key);
  if (w !== undefined) return w;
  if (world.zone !== 0) w = world.zone === 2 ? 0.9 : 0.5; // Fish-Man Island's sea is a garden
  else {
    const lat = Math.abs(y - EQ) / (H / 2);
    w = 1 - smooth(0.2, 0.72, lat);
    const isl = world.nearestIsland ? world.nearestIsland(x, y, 260) : null;
    if (isl) {
      const c = world.climate(isl.x, isl.y);
      if (c === CLIMATE.WINTER) w = Math.min(w, 0.12);
      else if (c === CLIMATE.TROPICAL || c === CLIMATE.ARID || c === CLIMATE.SAKURA || c === CLIMATE.CANDY) w = Math.max(w, 0.82);
      else if (c === CLIMATE.VOLCANIC) w = Math.max(w, 0.62);
      else if (c === CLIMATE.AUTUMN || c === CLIMATE.GLOOM) w = Math.min(w, 0.42);
    }
  }
  if (WARM.size > 4000) WARM.clear();
  WARM.set(key, w);
  return w;
}

/**
 * Is there a giant clam on this sea tile (depth = metres of water there)?
 * Warm, reef-deep water only.
 */
export function clamAt(world, x, y, depth) {
  x = Math.floor(x); y = Math.floor(y);
  if (!(depth > 2.2 && depth < 22) || world.type(x, y) !== T.SEA) return false;
  if (hash(x, y, 77) > 0.0045) return false;
  return warmth(world, x, y) > 0.55;
}
