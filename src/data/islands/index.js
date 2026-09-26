// Every charted island on the surface of the Blue Planet, by sea.
import { EAST_BLUE } from './eastBlue.js';
import { NORTH_BLUE } from './northBlue.js';
import { WEST_BLUE } from './westBlue.js';
import { SOUTH_BLUE } from './southBlue.js';
import { PARADISE_1 } from './paradise1.js';
import { PARADISE_2 } from './paradise2.js';
import { NEW_WORLD } from './newWorld.js';
import { NEW_WORLD_2 } from './newWorld2.js';

import { WORLD_SCALE } from '../../world/constants.js';

/**
 * Island data is written in chart units (the original 4096 × 2048 grid). Move
 * and grow every island onto the bigger world grid, in place, once. Offsets
 * inside an island are relative to its size (or scaled by `_scale`, see
 * islandgen.js), so towns, spots and landmarks follow.
 */
function toWorld(d) {
  if (d._scale) return d;
  d.x = Math.round(d.x * WORLD_SCALE);
  d.y = Math.round(d.y * WORLD_SCALE);
  d.w = Math.round(d.w * WORLD_SCALE);
  d.h = Math.round(d.h * WORLD_SCALE);
  d._scale = WORLD_SCALE;
  return d;
}

export const ALL_ISLANDS = [...EAST_BLUE, ...NORTH_BLUE, ...WEST_BLUE, ...SOUTH_BLUE, ...PARADISE_1, ...PARADISE_2, ...NEW_WORLD, ...NEW_WORLD_2].map(toWorld);
export const ISLAND_BY_ID = Object.fromEntries(ALL_ISLANDS.map((i) => [i.id, i]));
