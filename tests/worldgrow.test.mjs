// The Blues' islands grew (data/islands GROW): a save made before is
// moved out with its island (lineage.js migrateWorld v3 → v4), so whoever
// stood a little east of the centre stands proportionally further east; a
// ship far out at sea stays where it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISLAND_BY_ID, GROW } from '../src/data/islands/index.js';
import { migrateWorld, WORLD_VERSION } from '../src/game/lineage.js';

const world = { dx: (a, b) => b - a, wx: (x) => x, walkable: () => true, swimmable: () => true };

test('the Blues\' islands are grown; the Grand Line\'s are not', () => {
  assert.equal(ISLAND_BY_ID.dawn_island._grow, GROW.east_blue);
  const other = Object.values(ISLAND_BY_ID).find((d) => !GROW[d.sea]);
  assert.equal(other._grow, 1);
});

test('a v3 save on a grown island moves out with it; one far at sea stays', () => {
  const d = ISLAND_BY_ID.dawn_island, g = d._grow;
  const char = { worldVer: 3, pos: { x: d.x + 40, y: d.y - 20 }, ships: [{ x: d.x + 5000, y: d.y }] };
  assert.equal(migrateWorld(char, world, Object.values(ISLAND_BY_ID)), true);
  assert.ok(Math.abs(char.pos.x - (d.x + 40 * g)) < 1e-6 && Math.abs(char.pos.y - (d.y - 20 * g)) < 1e-6);
  assert.equal(char.ships[0].x, d.x + 5000);
  assert.equal(char.worldVer, WORLD_VERSION);
});
