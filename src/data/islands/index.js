// Every charted island on the surface of the Blue Planet, by sea.
import { EAST_BLUE } from './eastBlue.js';
import { NORTH_BLUE } from './northBlue.js';
import { WEST_BLUE } from './westBlue.js';
import { SOUTH_BLUE } from './southBlue.js';
import { PARADISE_1 } from './paradise1.js';
import { PARADISE_2 } from './paradise2.js';
import { NEW_WORLD } from './newWorld.js';
import { NEW_WORLD_2 } from './newWorld2.js';

export const ALL_ISLANDS = [...EAST_BLUE, ...NORTH_BLUE, ...WEST_BLUE, ...SOUTH_BLUE, ...PARADISE_1, ...PARADISE_2, ...NEW_WORLD, ...NEW_WORLD_2];
export const ISLAND_BY_ID = Object.fromEntries(ALL_ISLANDS.map((i) => [i.id, i]));
