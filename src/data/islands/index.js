import { EAST_BLUE } from './eastBlue.js';

export const ALL_ISLANDS = [...EAST_BLUE];
export const ISLAND_BY_ID = Object.fromEntries(ALL_ISLANDS.map((i) => [i.id, i]));
