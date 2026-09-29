// A quest's waypoint points at whoever the step is about — where they stand,
// or, not about yet, where they'll be on the island they live on (not the
// middle of the quest's island) — and a step that sends you to someone by
// name ("Return to Makino") points at them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { registerNPCs } = await import('../src/game/npcs.js');
const { Quests, registerQuests } = await import('../src/game/quests.js');

// two small islands, far apart; the quest is set on the first
const island = (id, name, x, y, spots = {}) => ({ id, name, x, y, radius: 40, def: { w: 80, h: 60, sea: 'east_blue' }, sea: 'east_blue', towns: [], docks: [], landmarks: [], spots });
const home = island('wp_home', 'Home Isle', 1000, 1000);
const far = island('wp_far', 'Far Isle', 3000, 1000, { wp_lair: { x: 3020, y: 990 } });
const world = { id: 'surface', islands: [home, far], distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dx: (a, b) => b - a };

registerNPCs([
  { id: 'wp_boss', name: 'Grimtooth', island: 'wp_far', at: { spot: 'wp_lair' }, boss: true },
  { id: 'wp_friend', name: 'Old Wendel', island: 'wp_home', at: { spot: 'nowhere' } },
]);
registerQuests([{
  id: 'wp_quest', name: 'A Long Way', island: 'wp_home',
  stages: [
    { id: 'beat', desc: 'Sail out and beat Grimtooth.', goal: { type: 'defeat', npc: 'wp_boss' } },
    { id: 'report', desc: 'Return to Old Wendel.' },
  ],
}]);

function game(stage) {
  const g = { world, surface: world, actors: [], player: { x: 1000, y: 1000 }, time: 0, on() {}, state: { char: { quests: { wp_quest: { stage } }, defeated: {}, bosses: [], flags: {} } } };
  new Quests(g);
  return g;
}

test('a foe on another island: the waypoint is where they are, not the quest island', () => {
  const g = game(0);
  const m = g.quests.marker('wp_quest');
  assert.ok(m, 'there is a waypoint');
  assert.ok(Math.hypot(m.x - 3020, m.y - 990) < 1, `at their lair (${m.x}, ${m.y})`);
  // and once they're about, where they stand
  g.actors.push({ alive: true, npcId: 'wp_boss', name: 'Grimtooth', x: 3050, y: 1010 });
  const m2 = g.quests.marker('wp_quest');
  assert.deepEqual([m2.x, m2.y], [3050, 1010]);
});

test('a step that sends you to someone by name points at them', () => {
  const g = game(1);
  g.actors.push({ alive: true, npcId: 'wp_friend', name: 'Old Wendel', x: 1012, y: 988 });
  const m = g.quests.marker('wp_quest');
  assert.deepEqual([m.x, m.y], [1012, 988]);
});

// ------------------------------------------------------------ a step's own place
// an island with a town (a square, a navigator's, a general store), a harbour
// and a landmark; a second island in the same sea with a navigator's, and a
// third in another sea with one closer to you
const { registerPlaces } = await import('../src/game/quests.js');
const port = {
  ...island('wp_port', 'Port Isle', 5000, 5000, { wp_gate: { x: 5030, y: 4970 } }),
  sea: 'west_blue',
  towns: [{ id: 'wp_town', name: 'Port Town', x: 5000, y: 5000, plaza: { x: 5002, y: 5004 }, buildings: [
    { role: 'shop', name: 'Port Town Outfitters', door: { x: 5010, y: 5010 } },
    { role: 'hall', name: 'Town Hall', door: { x: 4990, y: 5012 } },
  ] }],
  docks: [{ x: 5060, y: 5000, end: { x: 5060, y: 5000 }, land: { x: 5040, y: 5000 }, stand: { x: 5058, y: 5002 }, name: 'Port Town' }],
  landmarks: [
    { kind: 'bell', name: 'The Old Bell', x: 4960, y: 4950 },
    { kind: 'chest', key: 'wp_basket_1', item: 'wp_herb', name: 'Herb basket', x: 4980, y: 5040 },
    { kind: 'chest', key: 'wp_basket_2', item: 'wp_herb', name: 'Herb basket', x: 4900, y: 5100 },
  ],
};
const sister = { ...island('wp_sister', 'Sister Isle', 7000, 5000), sea: 'west_blue', towns: [{ id: 'wp_s_town', name: 'Sister Town', x: 7000, y: 5000, plaza: { x: 7000, y: 5000 }, buildings: [{ role: 'shop', name: 'Navigator Supplies (Log Poses)', door: { x: 7005, y: 5005 } }] }] };
const yonder = { ...island('wp_yonder', 'Yonder Isle', 5200, 5200), sea: 'south_blue', towns: [{ id: 'wp_y_town', name: 'Yonder Town', x: 5200, y: 5200, plaza: { x: 5200, y: 5200 }, buildings: [{ role: 'shop', name: 'Yonder Navigator', door: { x: 5201, y: 5201 } }] }] };
const world2 = { id: 'surface', islands: [port, sister, yonder], distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dx: (a, b) => b - a };

registerNPCs([{ id: 'wp_grunt', name: 'Deckhand', island: 'wp_port' }, { id: 'wp_brute', name: 'Brute', island: 'wp_port' }]);
registerPlaces({ wp_rang: { island: 'wp_port', landmark: 'The Old Bell' }, wp_saw_square: { island: 'wp_port', town: 'wp_town' } });
registerQuests([{
  id: 'wp_places', name: 'Places', island: 'wp_port',
  stages: [
    { id: 'bell', desc: 'Ring the bell.', goal: { type: 'event', event: 'wp_rang' } },
    { id: 'square', desc: 'Stand in the square.', goal: { type: 'event', event: 'wp_saw_square' } },
    { id: 'hall', desc: 'Look in at the Town Hall.', goal: { type: 'flag', flag: 'wp_hall' }, at: { door: 'Town Hall' } },
    { id: 'sail', desc: 'Sail to Port Isle.', goal: { type: 'reach', island: 'wp_port' } },
    { id: 'pose', desc: 'Get a Log Pose.', goal: { type: 'item', item: 'log_pose' } },
    { id: 'ship', desc: 'Get a ship.', goal: { type: 'ship', grandLine: true } },
    { id: 'raid', desc: 'Break the raiders at the gate.', goal: { type: 'defeat', any: ['wp_grunt'], count: 3 }, at: { spot: 'wp_gate' } },
    { id: 'two', desc: 'Beat two of them.', goal: { type: 'flag', flag: 'wp_two' }, foes: ['wp_grunt', 'wp_brute'] },
    { id: 'herbs', desc: 'Collect the herbs.', goal: { type: 'item', item: 'wp_herb', n: 2 } },
  ],
}]);

function game2(stage, p = { x: 5000, y: 5000 }) {
  const g = { world: world2, surface: world2, actors: [], player: p, time: 0, on() {}, state: { char: { quests: { wp_places: { stage } }, defeated: {}, bosses: [], flags: {}, world: { chests: {}, containers: {} } } } };
  new Quests(g);
  return g;
}
const near = (m, x, y, what) => assert.ok(m && Math.hypot(m.x - x, m.y - y) < 0.5, `${what}: (${m?.x}, ${m?.y}) — wanted (${x}, ${y})`);

test('an event that happens somewhere points there: a landmark, a town square', () => {
  near(game2(0).quests.marker('wp_places'), 4960, 4950, 'the bell');
  near(game2(1).quests.marker('wp_places'), 5002, 5004, 'the square');
});

test('a step with a place of its own: a building\'s door', () => {
  near(game2(2).quests.marker('wp_places'), 4990, 5012, 'the Town Hall door');
});

test('an island to sail to: its harbour, not its middle', () => {
  near(game2(3, { x: 9000, y: 9000 }).quests.marker('wp_places'), 5060, 5000, 'the pier head');
});

test('something to buy: the shop that sells it, in the same sea before a nearer one in another', () => {
  // (the Outfitters has "log" in no navigator's sense; Yonder's navigator is closer but in another sea)
  const m = game2(4).quests.marker('wp_places');
  near(m, 7005, 5005, 'Sister Town\'s navigator');
  assert.match(m.place, /Navigator Supplies/);
});

test('a ship to get: the shipwright on the pier (or where they work)', () => {
  near(game2(5).quests.marker('wp_places'), 5058, 5002, 'the shipwright\'s stand');
  const g = game2(5);
  g.actors.push({ alive: true, shipwright: { island: port }, name: 'Shipwright Ole', x: 5057, y: 5003 });
  near(g.quests.marker('wp_places'), 5057, 5003, 'the shipwright');
});

test('a fight with a crowd: whoever is about, else where they gather', () => {
  near(game2(6).quests.marker('wp_places'), 5030, 4970, 'the gate');
  const g = game2(6);
  g.actors.push({ alive: true, npcId: 'wp_grunt', name: 'Deckhand', x: 5025, y: 4975 });
  near(g.quests.marker('wp_places'), 5025, 4975, 'the grunt');
});

test('beat some of these: the ones still standing', () => {
  const g = game2(7);
  g.state.char.defeated.wp_grunt = 1;
  g.actors.push({ alive: true, npcId: 'wp_grunt', name: 'Deckhand', x: 5001, y: 5001 }, { alive: true, npcId: 'wp_brute', name: 'Brute', x: 5100, y: 5100 });
  near(g.quests.marker('wp_places'), 5100, 5100, 'the brute (the grunt is beaten)');
});

test('things left in chests: the nearest chest that still holds one', () => {
  const g = game2(8);
  near(g.quests.marker('wp_places'), 4980, 5040, 'the near basket');
  g.state.char.world.chests.chest_wp_basket_1 = true;
  near(g.quests.marker('wp_places'), 4900, 5100, 'the far basket, once the near one is emptied');
});
