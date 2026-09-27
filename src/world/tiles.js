// Tile types. Ids < 16 are liquids (they render as water/lava/cloud and take
// part in the coastline distance field as "sea"); ids >= 16 are solid ground.
// "Overlay" tiles (docks, bridges, sea-train rails) are walkable decks drawn on
// top of water, so they count as water for the coastline.

export const T = {
  SEA: 0,
  RIVER: 1,
  CANAL: 2,
  CLOUD_SEA: 3,
  LAVA: 4,
  REEF: 5,
  ABYSS: 6,
  POND: 7,
  ACID: 8,
  RAPIDS: 9, // Reverse Mountain's canals: the sea running up (and down) a mountain

  SAND: 16,
  GRASS: 17,
  DIRT: 18,
  FOREST: 19,
  JUNGLE: 20,
  SNOW: 21,
  ICE: 22,
  DESERT: 23,
  ROCK: 24,
  MOUNTAIN: 25,
  CLIFF: 26,
  RED_ROCK: 27,
  STONE: 28,
  COBBLE: 29,
  PLANK: 30,
  FARM: 31,
  FLOWERS: 32,
  SAKURA: 33,
  CANDY: 34,
  ISLAND_CLOUD: 35,
  CORAL: 36,
  MANGROVE: 37,
  ASH: 38,
  MUD: 39,
  MARBLE: 40,
  WALL: 41,
  GOLD: 42,
  BONE: 43,
  RAIL: 44,
  BRIDGE: 45,
  GRAVEL: 46,
  LAWN: 47,
  CAKE: 48,
  SEAFLOOR: 49,
  SNOWROCK: 50,
  PACK_ICE: 51,
  CARPET: 52,
  TATAMI: 53,
  STEEL: 54,
};

export const TILE_NAMES = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));

const N = 256;
export const IS_LIQUID = new Uint8Array(N);
export const WALKABLE = new Uint8Array(N);
export const SAILABLE = new Uint8Array(N);
export const SWIMMABLE = new Uint8Array(N);
export const OVERLAY = new Uint8Array(N);
export const MANMADE = new Uint8Array(N);
export const SPEED = new Float32Array(N).fill(1);
export const DAMAGE = new Float32Array(N); // hp/sec standing in it

for (let i = 0; i < 16; i++) IS_LIQUID[i] = 1;
for (let i = 16; i < N; i++) WALKABLE[i] = 1;
for (const t of [T.SEA, T.RIVER, T.CANAL, T.CLOUD_SEA, T.POND, T.RAPIDS]) { SAILABLE[t] = 1; SWIMMABLE[t] = 1; }
SWIMMABLE[T.REEF] = 1;
SWIMMABLE[T.ACID] = 1;
for (const t of [T.MOUNTAIN, T.CLIFF, T.RED_ROCK, T.WALL, T.SNOWROCK]) WALKABLE[t] = 0;
for (const t of [T.PLANK, T.RAIL, T.BRIDGE]) { OVERLAY[t] = 1; WALKABLE[t] = 1; }
for (const t of [T.STONE, T.COBBLE, T.PLANK, T.FARM, T.MARBLE, T.WALL, T.RAIL, T.BRIDGE, T.CARPET, T.TATAMI, T.STEEL, T.GOLD]) MANMADE[t] = 1;
WALKABLE[T.PACK_ICE] = 1;

SPEED[T.SAND] = 0.92;
SPEED[T.DESERT] = 0.8;
SPEED[T.SNOW] = 0.8;
SPEED[T.MUD] = 0.6;
SPEED[T.JUNGLE] = 0.85;
SPEED[T.STONE] = 1.08;
SPEED[T.COBBLE] = 1.06;
SPEED[T.MARBLE] = 1.08;
SPEED[T.ICE] = 1.15;
SPEED[T.ISLAND_CLOUD] = 1.1;
SPEED[T.REEF] = 0.55;

DAMAGE[T.LAVA] = 40;
DAMAGE[T.ACID] = 12;

// Base and accent colours per tile (RGB 0-255), fed to the terrain shader.
export const PALETTE = {
  [T.SEA]: ['#1d6fb8', '#39a7d8'],
  [T.RIVER]: ['#2b8fc4', '#58bde0'],
  [T.CANAL]: ['#2a86b0', '#4fb0cf'],
  [T.RAPIDS]: ['#3a9ccf', '#bfe9f5'],
  [T.CLOUD_SEA]: ['#dbe9f7', '#ffffff'],
  [T.LAVA]: ['#e8420e', '#ffb02e'],
  [T.REEF]: ['#34b3b8', '#e7d9a8'],
  [T.ABYSS]: ['#061a33', '#0b2d52'],
  [T.POND]: ['#2f8fb0', '#6fc6d6'],
  [T.ACID]: ['#6ab04c', '#badc58'],

  [T.SAND]: ['#e8d49a', '#f5e6b8'],
  [T.GRASS]: ['#5aa843', '#7cc653'],
  [T.DIRT]: ['#a9824f', '#c19a64'],
  [T.FOREST]: ['#3d8a35', '#57a53f'],
  [T.JUNGLE]: ['#2f8a3a', '#4fb34a'],
  [T.SNOW]: ['#eef4fa', '#ffffff'],
  [T.ICE]: ['#bfe3f2', '#e6f7ff'],
  [T.DESERT]: ['#e3bf78', '#f0d396'],
  [T.ROCK]: ['#8f8a80', '#a8a296'],
  [T.MOUNTAIN]: ['#7d7468', '#9b9184'],
  [T.CLIFF]: ['#6b6258', '#857a6d'],
  [T.RED_ROCK]: ['#9e3b2a', '#c0563a'],
  [T.STONE]: ['#b8b0a2', '#cfc8ba'],
  [T.COBBLE]: ['#9c958a', '#b5ada0'],
  [T.PLANK]: ['#9a6a3c', '#b8844f'],
  [T.FARM]: ['#8f7a3e', '#b59a4c'],
  [T.FLOWERS]: ['#6bb54a', '#f06292'],
  [T.SAKURA]: ['#7fb069', '#f8b4cf'],
  [T.CANDY]: ['#f7a8c8', '#fff0f6'],
  [T.ISLAND_CLOUD]: ['#f4f8ff', '#ffffff'],
  [T.CORAL]: ['#e8a0a0', '#f7d0b8'],
  [T.MANGROVE]: ['#6f8f45', '#93b35a'],
  [T.ASH]: ['#4d4a48', '#6a6461'],
  [T.MUD]: ['#5f5236', '#75683f'],
  [T.MARBLE]: ['#e8e4dc', '#fdfbf6'],
  [T.WALL]: ['#6e6457', '#8a7f70'],
  [T.GOLD]: ['#e1b12c', '#fbc531'],
  [T.BONE]: ['#8a8574', '#a8a28f'],
  [T.RAIL]: ['#6d5a47', '#9a9a9a'],
  [T.BRIDGE]: ['#8c5f36', '#a9764a'],
  [T.GRAVEL]: ['#9d968c', '#b7b0a5'],
  [T.LAWN]: ['#66b84d', '#7fcf5f'],
  [T.CAKE]: ['#f3d9a4', '#ffffff'],
  [T.SEAFLOOR]: ['#3f6f7a', '#5a8f8f'],
  [T.SNOWROCK]: ['#9aa3ad', '#e8eef5'],
  [T.PACK_ICE]: ['#dff3fb', '#ffffff'],
  [T.CARPET]: ['#8e2436', '#c0392b'],
  [T.TATAMI]: ['#c8b77a', '#ddd09b'],
  [T.STEEL]: ['#7f8c8d', '#95a5a6'],
};

// Climate ids stored per tile; the shader tints vegetation with them.
export const CLIMATE = {
  TEMPERATE: 0,
  TROPICAL: 1,
  AUTUMN: 2,
  WINTER: 3,
  ARID: 4,
  VOLCANIC: 5,
  SKY: 6,
  UNDERSEA: 7,
  SAKURA: 8,
  CANDY: 9,
  GLOOM: 10,
  SPRING: 11,
};

export const isLiquid = (t) => t < 16;
