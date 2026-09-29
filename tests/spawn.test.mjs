// Nobody is born in a town held by a crew who fight on sight: a Fish-Man
// used to wake in Arlong Park's square, among Arlong's officers, and was set
// upon before they could stand.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { heldTowns, resolveSpawn, townAt } = await import('../src/game/lineage.js');

const town = (id, x, y) => ({ id, name: id, plaza: { x, y }, x0: x - 12, y0: y - 10, x1: x + 12, y1: y + 10 });
const conomi = {
  id: 'conomi_islands', name: 'Conomi Islands', x: 2660, y: 420, radius: 80, def: { w: 210, h: 150 }, spots: {},
  towns: [town('arlong_park', 2720, 400), town('cocoyasi', 2610, 440)], docks: [],
};
const world = { islands: [conomi], distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dx: (a, b) => b - a };

const defs = [
  { id: 'kuroobi', hostile: true, at: { town: 'arlong_park', plaza: true }, when: (c) => !c.defeated.kuroobi },
  { id: 'arlong', hostile: true, boss: true, at: { town: 'arlong_park', building: 'Arlong Park Tower' } },
  // (a lone troublemaker down at the pier, and a crew who keep to themselves)
  { id: 'kobbe', hostile: true, at: { town: 'cocoyasi', dock: true } },
  { id: 'lounger', hostile: true, calm: true, at: { town: 'cocoyasi', plaza: true } },
];

test('a town is held while a crew who fight on sight stand about its square', () => {
  const c = { defeated: {}, bosses: [] };
  assert.deepEqual([...heldTowns(world, defs, [], c)], ['arlong_park']);
  // (and it's theirs no longer once they're beaten)
  assert.equal(heldTowns(world, defs, [], { defeated: { kuroobi: true }, bosses: [] }).size, 0);
  // a band camped right by a town's square holds it too
  const camp = [{ island: 'conomi_islands', dx: -0.47, dy: 0.27, radius: 5, enemies: [] }];
  assert.ok(heldTowns(world, [], camp, c).has('cocoyasi'));
  assert.equal(heldTowns(world, [], [{ ...camp[0], calm: true }], c).size, 0);
});

test('a Fish-Man is born in Cocoyasi, never inside Arlong Park', () => {
  const held = heldTowns(world, defs, [], { defeated: {}, bosses: [] });
  for (let i = 0; i < 20; i++) {
    const s = resolveSpawn(world, { race: 'fishman', runSeed: 'seed' + i }, held);
    assert.equal(s.town.id, 'cocoyasi');
    assert.equal(townAt(world, s.x, s.y, held), null, 'not in a held town');
  }
});
