// The main story is optional: instead of a road a character can sail their
// own way — chosen at birth, from any of the three who could set them on a
// road, or in the Quests menu — and nothing of the story is marked, pinned
// or tracked any more. It can be undone (a contact's offer still stands, or
// look for a calling again), and a road under way can be set aside and
// taken up again where it was left. Old saves come through as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };

const { PACKS } = await import('../src/content/index.js');
const { registerNPCs, npcDef } = await import('../src/game/npcs.js');
const { Quests, registerQuests } = await import('../src/game/quests.js');
const { installMainStory } = await import('../src/content/mainStory.js');
const { createCharacter, upgradeChar } = await import('../src/game/lineage.js');
for (const p of PACKS) { if (p.npcs) registerNPCs(p.npcs); if (p.quests) registerQuests(p.quests); }

const HOME = 'dawn_island';
const PIRATE = `mq_home_${HOME}_pirate`, MARINE = `mq_home_${HOME}_marine`;

/** A small stand-in for the game: quests, the story, events — no world. */
function makeGame(choices = {}) {
  const on = {};
  const char = createCharacter({ generation: 1, perks: {}, charted: [] }, { race: 'human', traits: [], seed: 7 }, { name: 'Test Sailor', ...choices });
  const game = {
    on: (ev, fn) => (on[ev] ||= []).push(fn),
    emit: (ev, ...a) => { for (const f of on[ev] || []) f(...a); },
    env: { day: 4 }, time: 0, log() {}, hint() {},
    ui: { banner() {}, toast() {}, hint() {} },
    surface: { islands: [], distance: () => 1 }, world: { islands: [] }, player: { x: 0, y: 0 }, currentIsland: null,
    actors: [], spawner: { populated: new Map() },
    state: { char, legacy: {} },
    dialogue: { decorators: [], active: null, ctx: () => ({ game }) },
  };
  new Quests(game);
  installMainStory(game);
  game.emit('characterStart', { char, isNew: true, spawn: { island: { id: HOME } } });
  return game;
}

/** The dialogue context a conversation gets (dialogue.js). */
const ctxOf = (game) => ({ game, char: game.state.char, setFlag: (k, v = true) => { game.state.char.flags[k] = v; }, flag: (k) => game.state.char.flags[k] });
/** Talk to someone, taking the choice whose label matches each pattern in turn; returns what was said. */
function talk(game, npcId, picks) {
  const ctx = ctxOf(game);
  const tree = npcDef(npcId).dialogue(ctx);
  let id = tree.start;
  const said = [];
  for (let n = 0; n < 40 && id; n++) {
    const node = tree.nodes[id];
    if (!node) break;
    node.onEnter?.(ctx);
    if (node.redirect) { id = node.redirect; continue; }
    said.push(typeof node.text === 'function' ? node.text(ctx) : node.text);
    const choices = (node.choices || []).filter((c) => !c.if || c.if(ctx));
    if (!choices.length) { id = typeof node.next === 'function' ? node.next(ctx) : node.next; continue; }
    const want = picks.shift();
    const ch = want ? choices.find((c) => want.test(typeof c.text === 'function' ? c.text(ctx) : c.text)) : null;
    if (!ch) { said.push(`(no choice ${want})`); break; }
    said.push(`> ${typeof ch.text === 'function' ? ch.text(ctx) : ch.text}`);
    ch.do?.(ctx);
    if (ch.end) break;
    id = ch.next;
  }
  return said;
}
const marker = (game, id) => game.storyMarker({ npcId: id });

test('a new character is looking for a calling: the three are marked', () => {
  const g = makeGame();
  const c = g.state.char;
  assert.equal(c.freeSail, null);
  assert.ok(c.mainIntro, 'the calling is on the tracker');
  assert.equal(marker(g, PIRATE), 'M!');
  assert.equal(marker(g, MARINE), 'M!');
});

test('turning every road down with a contact: no markers, no calling, nothing begun', () => {
  const g = makeGame();
  const c = g.state.char;
  const said = talk(g, PIRATE, [/sail my own way/i]);
  assert.ok(said.some((s) => /sail my own way/i.test(s)), said.join(' | '));
  assert.ok(c.freeSail && c.freeSail.from === 'contact');
  assert.ok(!c.main, 'no road begun');
  assert.equal(c.mainIntro, null);
  assert.equal(marker(g, PIRATE), null);
  assert.equal(marker(g, MARINE), null);
  assert.deepEqual(g.storyPins().filter((p) => p.main), []);
  assert.equal(g.quests.main(), null);
  // (and a character starting again with it set isn't sent looking either)
  g.emit('characterStart', { char: c, isNew: false });
  assert.equal(c.mainIntro, null);
});

test('chosen at birth: sailing your own way from the first day', () => {
  const g = makeGame({ story: 'free' });
  const c = g.state.char;
  assert.ok(c.freeSail && c.freeSail.from === 'birth');
  assert.equal(c.mainIntro, null);
  assert.equal(marker(g, PIRATE), null);
});

test('a free sailor can still take a road from a contact — the offer stands', () => {
  const g = makeGame({ story: 'free' });
  const c = g.state.char;
  const said = talk(g, MARINE, [/marines/i, /leave it/i]);
  assert.ok(/sailing your own way/i.test(said[0]), `reminded first: ${said[0]}`);
  assert.equal(c.main?.path, 'marine', said.join(' | '));
  assert.equal(c.freeSail, null);
  assert.ok(g.quests.main(), 'the first chapter is under way');
});

test('or look for a calling again (the Quests menu): the three are marked again', () => {
  const g = makeGame({ story: 'free' });
  const c = g.state.char;
  assert.ok(g.story.seekCalling());
  assert.equal(c.freeSail, null);
  assert.ok(c.mainIntro);
  assert.equal(marker(g, PIRATE), 'M!');
  // (and the fourth way is there again)
  assert.ok(g.story.sailFree('quests'));
  assert.equal(c.freeSail.from, 'quests');
});

test('a road under way set aside, then taken up again where it was left', () => {
  const g = makeGame();
  const c = g.state.char;
  talk(g, PIRATE, [/pirate/i, /leave it/i]);
  const q = g.quests.main();
  assert.equal(q.id, `mq:home_${HOME}:pirate`);
  assert.equal(marker(g, PIRATE), null, 'no report due yet');
  assert.ok(g.story.setAside());
  assert.equal(c.main, null);
  assert.ok(c.freeSail && c.mainShelf);
  assert.equal(g.quests.main(), null, 'nothing on the tracker');
  assert.equal(marker(g, MARINE), null, 'and nobody offers a new road meanwhile');
  assert.equal(g.story.begin(`home_${HOME}`, 'marine'), false, 'a road set aside is taken up again, not begun over');
  // the flag goes up while the story waits
  c.crewName = 'Shelf Pirates';
  assert.ok(g.story.takeUp());
  assert.equal(c.main.path, 'pirate');
  assert.equal(c.freeSail, null);
  assert.equal(c.mainShelf, null);
  for (let i = 0; i < 4; i++) g.emit('tick', 0.5);
  assert.equal(g.quests.stageId(q.id), 'report', 'the chapter carried on: the flag is up, report back');
  assert.equal(marker(g, PIRATE), 'M?');
});

test('old saves: no story choice on record means looking for a calling (or on a road)', () => {
  const old = { name: 'Old Timer', equipped: { weapons: [] }, inventory: [], faction: 'civilian', flags: {}, quests: {}, mainIntro: 'Three people…' };
  upgradeChar(old);
  assert.equal(old.freeSail, null);
  assert.equal(old.mainShelf, null);
  const onRoad = { name: 'Old Salt', equipped: { weapons: [] }, inventory: [], faction: 'pirate', crewName: 'Salt Pirates', flags: {}, quests: {}, main: { path: 'pirate' }, freeSail: { day: 1 } };
  upgradeChar(onRoad);
  assert.equal(onRoad.freeSail, null, 'a road under way wins over a stray choice');
});
