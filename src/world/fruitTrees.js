// Which trees bear fruit, and where the fruit hangs. Pure functions shared by
// the renderer (draws the fruit) and the foraging system (picks it). Decided
// by a hash of the tree's position, so it never disturbs world generation.
const BEARS = {
  palm: { chance: 0.75, fruit: ['coconut', 'coconut', 'coconut', 'banana'] },
  oak: { chance: 0.3, fruit: ['apple', 'apple', 'cherry'] },
  autumn: { chance: 0.35, fruit: ['apple'] },
  jungle: { chance: 0.4, fruit: ['banana', 'mango', 'banana'] },
  sakura: { chance: 0.3, fruit: ['cherry'] },
  blossom: { chance: 0.3, fruit: ['cherry'] },
};
export const FRUIT_COLORS = { coconut: ['#7a4a20', '#5b3514'], apple: ['#e53935', '#8e1b16'], banana: ['#ffd54f', '#b8860b'], mango: ['#ffb300', '#e65100'], cherry: ['#c2185b', '#6d0f33'] };
export const REGROW_DAYS = 2;

function hash(x, y) {
  let h = Math.imul(Math.round(x * 100) | 0, 73856093) ^ Math.imul(Math.round(y * 100) | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The fruit a tree bears, or null. Cached on the object. */
export function fruitOf(o) {
  if (o._fruit !== undefined) return o._fruit;
  let f = null;
  const b = o.kind === 'tree' ? BEARS[o.sub] : null;
  if (b) {
    const hv = hash(o.x, o.y);
    if ((hv % 1000) / 1000 < b.chance) f = b.fruit[(hv >>> 10) % b.fruit.length];
  }
  o._fruit = f;
  return f;
}

export const fruitKey = (worldId, o) => `${worldId || 's'}:${Math.round(o.x * 10)},${Math.round(o.y * 10)}`;

// picked trees: key → the day the fruit is back
export const PICKED = new Map();
export function isPicked(worldId, o, day) {
  const d = PICKED.get(fruitKey(worldId, o));
  return d !== undefined && day < d;
}

/** Fruit positions for a tree, in the tree's local tile units (origin at its base). */
export function fruitSpots(o) {
  const v = o.v || 0;
  if (o.sub === 'palm') {
    const r1 = ((v * 9301 + 49297) % 233280) / 233280;
    const lean = (r1 - 0.5) * 0.9;
    return [[lean - 0.02, -2.38, 0.15], [lean + 0.14, -2.34, 0.13], [lean - 0.16, -2.32, 0.12]];
  }
  const tall = o.sub === 'jungle' ? 1.3 : 1;
  const cy = -1.6 * tall;
  return [[-0.42, cy + 0.15, 0.09], [0.36, cy - 0.12, 0.09], [0.05, cy + 0.38, 0.09], [-0.12, cy - 0.35, 0.08], [0.5, cy + 0.3, 0.08]];
}
