// A quest under way keeps its step when the quest's steps change: saves
// remember the step by its id, and a save from before that goes by the list
// of steps the quest had then. The pirate road's first chapter no longer asks
// for a blade: a save sitting on that step moves on to the flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Quests, registerQuests, questDef } = await import('../src/game/quests.js');
const { registerNPCs } = await import('../src/game/npcs.js');
const { PACKS } = await import('../src/content/index.js');
for (const p of PACKS) { if (p.npcs) registerNPCs(p.npcs); if (p.quests) registerQuests(p.quests); }

const game = (quests) => {
  const g = { on() {}, state: { char: { quests, flags: {}, defeated: {}, bosses: [] } } };
  new Quests(g);
  return g;
};

registerQuests([
  { id: 'st_cut', name: 'Cut', was: ['a', 'b', 'c', 'd'], stages: [{ id: 'a', desc: 'A' }, { id: 'c', desc: 'C' }, { id: 'd', desc: 'D' }] },
  { id: 'st_moved', name: 'Moved', stages: [{ id: 'x', desc: 'X' }, { id: 'new', desc: 'New' }, { id: 'y', desc: 'Y' }] },
]);

test('a save from before a step was taken out: on the same step, or the next one left', () => {
  const g = game({ st_cut: { stage: 1 } });
  g.quests.reconcile();
  assert.equal(g.state.char.quests.st_cut.stage, 1, 'step "b" is gone: on to "c"');
  assert.equal(g.state.char.quests.st_cut.sid, 'c');
  const g2 = game({ st_cut: { stage: 3 } });
  g2.quests.reconcile();
  assert.deepEqual([g2.state.char.quests.st_cut.stage, g2.state.char.quests.st_cut.sid], [2, 'd'], '"d" was fourth, is third');
});

test('a save that knows its step by id follows it when steps are put in before it', () => {
  const g = game({ st_moved: { stage: 1, sid: 'y' } });
  g.quests.reconcile();
  assert.deepEqual([g.state.char.quests.st_moved.stage, g.state.char.quests.st_moved.sid], [2, 'y']);
});

test('a quest that has not changed is left where it is (and learns its step id)', () => {
  const g = game({ st_moved: { stage: 1 } });
  g.quests.reconcile();
  assert.deepEqual([g.state.char.quests.st_moved.stage, g.state.char.quests.st_moved.sid], [1, 'new']);
});

test('the pirate road asks for no blade: its first chapter is the flag, then the report', () => {
  const q = questDef('mq:home_dawn_island:pirate');
  assert.deepEqual(q.stages.map((s) => s.id), ['flag', 'report']);
  for (const id of ['mq:home_dawn_island:marine', 'mq:home_dawn_island:hunter']) {
    assert.ok(!questDef(id).stages.some((s) => s.goal?.type === 'weapon'), `${id} asks for no weapon either`);
  }
});

test('an old save on the blade step moves on to the flag; one on the flag or the report stays there', () => {
  const id = 'mq:home_dawn_island:pirate';
  for (const [old, want] of [[0, 'flag'], [1, 'flag'], [2, 'report']]) {
    const g = game({ [id]: { stage: old, done: false } });
    g.quests.reconcile();
    const s = g.state.char.quests[id];
    assert.equal(s.sid, want, `old step ${old}`);
    assert.equal(questDef(id).stages[s.stage].id, want);
  }
});
