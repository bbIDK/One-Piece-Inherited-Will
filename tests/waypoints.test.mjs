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
