// Geometry of the Blue Planet, in tiles.
//
// Canon layout (One Piece Wiki, "Blue Planet" / "Red Line" / "Grand Line"):
//  * The Red Line is a ring continent; the Grand Line is a ring sea at right
//    angles to it. They cross twice: Reverse Mountain and, on the exact opposite
//    side of the world, Mary Geoise (with Fish-Man Island 10,000 m below).
//  * On the standard map East Blue is top-right, North Blue top-left,
//    West Blue bottom-left, South Blue bottom-right.
//  * Paradise (first half) lies between East and South Blue and runs from
//    Reverse Mountain to Mary Geoise; the New World lies between North and
//    West Blue and runs from Mary Geoise back around to Reverse Mountain.
//
// Our map is an equirectangular strip that wraps east↔west like a planet:
// Reverse Mountain sits in the middle (x = W / 2) and Mary Geoise on the seam
// (x = 0 ≡ W), so the Red Line shows in the centre and at both edges.

// The world was charted on a 4096 × 2048 grid. For the 3D view it is built
// WORLD_SCALE times bigger (islands, seas, distances), 1 tile = 1 metre.
// Island data and the few hand-placed points stay in chart units and go
// through chart() (or the island loader) when used.
export const WORLD_SCALE = 1.5;
/** A distance or coordinate from the chart, in world tiles. */
export const chart = (v) => Math.round(v * WORLD_SCALE);

export const W = chart(4096); // 6144
export const H = chart(2048); // 3072
export const EQ = chart(1024); // equator (Grand Line centre row)
export const GL_HALF = chart(200); // half height of the Grand Line
export const CB = chart(72); // width of each Calm Belt
export const RL_HALF = chart(46); // half width of the Red Line
export const RM_X = chart(2048); // Reverse Mountain meridian
export const MG_X = 0; // Mary Geoise meridian (the wrap seam)
export const POLAR = chart(26); // pack-ice rows at each pole

export const GL_TOP = EQ - GL_HALF; // 824
export const GL_BOTTOM = EQ + GL_HALF; // 1224
export const CB_TOP = GL_TOP - CB; // 752
export const CB_BOTTOM = GL_BOTTOM + CB; // 1296

export const REGION = {
  EAST_BLUE: 1,
  NORTH_BLUE: 2,
  WEST_BLUE: 3,
  SOUTH_BLUE: 4,
  PARADISE: 5,
  NEW_WORLD: 6,
  CALM_NORTH: 7,
  CALM_SOUTH: 8,
  RED_LINE: 9,
  POLAR: 10,
};

export const REGION_INFO = {
  [REGION.EAST_BLUE]: { id: 'east_blue', name: 'East Blue', danger: 1, color: '#4fb3e8', sea: true },
  [REGION.NORTH_BLUE]: { id: 'north_blue', name: 'North Blue', danger: 2, color: '#5a8fd6', sea: true },
  [REGION.WEST_BLUE]: { id: 'west_blue', name: 'West Blue', danger: 2, color: '#4a9fc9', sea: true },
  [REGION.SOUTH_BLUE]: { id: 'south_blue', name: 'South Blue', danger: 2, color: '#3fc1c9', sea: true },
  [REGION.PARADISE]: { id: 'paradise', name: 'Grand Line — Paradise', danger: 4, color: '#2aa198', sea: true },
  [REGION.NEW_WORLD]: { id: 'new_world', name: 'Grand Line — New World', danger: 7, color: '#6c5ce7', sea: true },
  [REGION.CALM_NORTH]: { id: 'calm_belt', name: 'Calm Belt', danger: 6, color: '#8395a7', sea: true },
  [REGION.CALM_SOUTH]: { id: 'calm_belt', name: 'Calm Belt', danger: 6, color: '#8395a7', sea: true },
  [REGION.RED_LINE]: { id: 'red_line', name: 'Red Line', danger: 5, color: '#b33939', sea: false },
  [REGION.POLAR]: { id: 'polar', name: 'Polar Sea', danger: 3, color: '#dfe6e9', sea: true },
};

export const SEA_IDS = {
  east_blue: REGION.EAST_BLUE,
  north_blue: REGION.NORTH_BLUE,
  west_blue: REGION.WEST_BLUE,
  south_blue: REGION.SOUTH_BLUE,
  paradise: REGION.PARADISE,
  new_world: REGION.NEW_WORLD,
  calm_belt: REGION.CALM_NORTH,
  red_line: REGION.RED_LINE,
};

export const wrapX = (x) => ((x % W) + W) % W;
/** Signed shortest x-offset from a to b on the wrapping world. */
export function dxWrap(a, b) {
  let d = (b - a) % W;
  if (d > W / 2) d -= W;
  else if (d < -W / 2) d += W;
  return d;
}
export const distWrap = (ax, ay, bx, by) => Math.hypot(dxWrap(ax, bx), by - ay);

/** Analytic region of a world position (ignores the Red Line's ragged coast). */
export function regionAt(x, y) {
  x = wrapX(x);
  if (y < POLAR || y >= H - POLAR) return REGION.POLAR;
  if (Math.abs(x - RM_X) < RL_HALF || x < RL_HALF || x >= W - RL_HALF) return REGION.RED_LINE;
  const east = x > RM_X; // right half of the map
  if (y >= GL_TOP && y < GL_BOTTOM) return east ? REGION.PARADISE : REGION.NEW_WORLD;
  if (y >= CB_TOP && y < GL_TOP) return REGION.CALM_NORTH;
  if (y >= GL_BOTTOM && y < CB_BOTTOM) return REGION.CALM_SOUTH;
  if (y < EQ) return east ? REGION.EAST_BLUE : REGION.NORTH_BLUE;
  return east ? REGION.SOUTH_BLUE : REGION.WEST_BLUE;
}

export const isCalmBelt = (r) => r === REGION.CALM_NORTH || r === REGION.CALM_SOUTH;
export const isGrandLine = (r) => r === REGION.PARADISE || r === REGION.NEW_WORLD;
export const isBlue = (r) => r >= REGION.EAST_BLUE && r <= REGION.SOUTH_BLUE;
