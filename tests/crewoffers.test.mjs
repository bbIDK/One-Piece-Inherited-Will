// Crewmates are offered, never forced. Someone who'd sail with you asks
// first (a ! over their head, and their offer leads the conversation): yes
// takes them aboard, no leaves them where they are — the story goes on
// either way — and they can be asked again. The words fit who you are (a
// pirate's nakama, a Marine's subordinate, a hunter's partner, a free
// sailor's shipmate). Every crew stop and last port of the Blues makes an
// offer on every road, so the story can take two crewmates over the
// mountain; the last ports' people also ask anyone with a Grand Line ship.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { PACKS } = await import('../src/content/index.js');
const { registerNPCs, npcDef } = await import('../src/game/npcs.js');
const { Quests, registerQuests, questDef } = await import('../src/game/quests.js');
const { Crew, roadOf } = await import('../src/game/crew.js');
const { installMainStory } = await import('../src/content/mainStory.js');
const { createCharacter, upgradeChar } = await import('../src/game/lineage.js');
const { CHAPTERS } = await import('../src/content/main/define.js');
for (const p of PACKS) { if (p.npcs) registerNPCs(p.npcs); if (p.quests) registerQuests(p.quests); }

function makeGame() {
  const on = {};
  const char = createCharacter({ generation: 1, perks: {}, charted: [] }, { race: 'human', traits: [], seed: 3 }, { name: 'Test Captain' });
  const game = {
    on: (ev, fn) => (on[ev] ||= []).push(fn),
    emit: (ev, ...a) => { for (const f of on[ev] || []) f(...a); },
    env: { day: 2 }, time: 0, log() {}, hint() {},
    ui: { banner() {}, toast() {}, hint() {} },
    fx: { burst() {}, text() {} },
    surface: { islands: [], distance: () => 1 }, world: { islands: [] }, player: { x: 0, y: 0 }, currentIsland: null,
    actors: [], ships: [], spawner: { populated: new Map() },
    state: { char, legacy: {} },
    dialogue: { decorators: [], active: null, ctx: () => ({ game }) },
  };
  new Quests(game);
  new Crew(game);
  installMainStory(game);
  return game;
}
const npc = (id) => ({ def: npcDef(id), alive: false, x: 0, y: 0 });
/** Their conversation as it opens, decorated as the game does (crew.js first). */
function convo(game, id) {
  const a = npc(id);
  const ctx = { game, char: game.state.char, setFlag() {}, flag: () => false, quest: () => null };
  const tree = game.crew.decorate(a.def.dialogue(ctx), a);
  const label = (c) => (typeof c.text === 'function' ? c.text(ctx) : c.text);
  const node = (k) => tree.nodes[k];
  return { tree, ctx, a, start: tree.start, text: (k = tree.start) => (typeof node(k).text === 'function' ? node(k).text(ctx) : node(k).text), choices: (k = tree.start) => (node(k).choices || []).filter((c) => !c.if || c.if(ctx)), label };
}
const done = (game, qid) => { game.state.char.quests[qid] = { stage: 0, done: true }; };

test('someone who would sail with you asks first: a !, and the offer leads their conversation', () => {
  const g = makeGame();
  const def = npcDef('patty');
  assert.equal(g.crew.offerPending(def), false, 'not before the Baratie is saved');
  assert.equal(g.crew.marker(npc('patty')), null);
  done(g, 'baratie_krieg');
  assert.equal(g.crew.offerPending(def), true);
  assert.equal(g.crew.marker(npc('patty')), '!');
  const cv = convo(g, 'patty');
  assert.equal(cv.start, '__recruit');
  const labels = cv.choices().map(cv.label);
  assert.ok(labels.some((t) => /^Welcome aboard/.test(t)), labels.join(' | '));
  assert.ok(labels.includes('Not this time.'));
  assert.ok(labels.includes('About something else...'), 'their own talk is still there');
});

test('turning them down: they stay, the ! goes, and they can be asked again — with a line for it', () => {
  const g = makeGame();
  done(g, 'baratie_krieg');
  const cv = convo(g, 'patty');
  const no = cv.choices().find((c) => c.text === 'Not this time.');
  no.do(cv.ctx);
  const c = g.state.char;
  assert.equal(c.crewOffers.patty.said, 'no');
  assert.equal(c.crew.length, 0);
  assert.equal(g.crew.marker(npc('patty')), null);
  assert.ok(/kitchen/.test(cv.text('__no')), cv.text('__no'));
  // (asked again later: "Join my crew!" in the words that suit you)
  c.crewName = 'Test Pirates';
  const again = convo(g, 'patty');
  assert.notEqual(again.start, '__recruit', 'no longer leading with the offer');
  const ask = again.choices().find((ch) => /Join my crew/.test(again.label(ch)));
  assert.ok(ask, again.choices().map(again.label).join(' | '));
  assert.ok(/packed my knives/.test(again.text('__recruit')), 'the again line');
  again.choices('__recruit').find((ch) => /^Welcome aboard/.test(again.label(ch))).do(again.ctx);
  assert.ok(g.crew.has('patty'));
  assert.equal(c.crewOffers.patty.said, 'yes');
});

test('the words fit who you are: nakama, subordinate, partner, shipmate', () => {
  const g = makeGame();
  const c = g.state.char;
  done(g, 'baratie_krieg');
  c.crewOffers = { patty: { said: 'no', day: 1 } }; // (so the ask is offered)
  const ask = () => { const cv = convo(g, 'patty'); return cv.choices().map(cv.label).find((t) => /^"/.test(t)); };
  assert.equal(roadOf(c), 'free');
  assert.equal(ask(), '"Sail with me!"');
  c.main = { path: 'hunter' };
  assert.equal(ask(), '"Partner up with me!"');
  c.main = null; c.faction = 'marine';
  assert.equal(ask(), '"Serve under my command!"');
  c.faction = 'pirate'; c.crewName = 'Ask Pirates';
  assert.equal(ask(), '"Join my crew!"');
  // and the pitch is theirs for each road
  c.crewOffers = {};
  for (const [faction, crewName, re] of [['marine', null, /Navy galley/], ['pirate', 'P', /cook for your crew/]]) {
    c.faction = faction; c.crewName = crewName;
    assert.match(convo(g, 'patty').text('__recruit'), re);
  }
});

test('no step of the story forces a crewmate: every crew stop and last port offers one, on every road', () => {
  let n = 0;
  for (const ch of CHAPTERS.values()) {
    if (ch.part !== 1 || !['crew', 'last'].includes(ch.role)) continue;
    for (const path of ['pirate', 'marine', 'hunter']) {
      const q = questDef(`mq:${ch.id}:${path}`);
      assert.ok(!q.stages.some((s) => s.goal?.type === 'crew'), `${q.id} forces a crewmate`);
      const st = q.stages.find((s) => s.offer);
      assert.ok(st, `${q.id} has no offer`);
      assert.ok(npcDef(st.offer)?.recruit, `${q.id}: ${st.offer} would never join`);
      assert.equal(q.stages[q.stages.length - 1].id, 'report', `${q.id}: the offer comes before the report`);
      n++;
    }
  }
  assert.equal(n, 39, 'thirteen chapters, three roads');
});

test('a no finishes the step as surely as a yes: the story goes on', () => {
  const st = questDef('mq:eb_baratie:marine').stages.find((s) => s.offer === 'patty');
  const c = { crew: [], flags: {}, crewOffers: {} };
  assert.equal(st.goal.fn(c), false);
  assert.equal(st.goal.fn({ ...c, crewOffers: { patty: { said: 'no' } } }), true);
  assert.equal(st.goal.fn({ ...c, crew: [{ id: 'patty' }] }), true);
  assert.equal(st.goal.fn({ ...c, flags: { leftCrew_patty: true } }), true, '(gone for good)');
});

test('the last ports\' people: on the story, when its offer comes — or for anyone with a Grand Line ship', () => {
  const g = makeGame();
  const c = g.state.char;
  const isla = npcDef('eb_isla');
  assert.equal(g.crew.offerPending(isla), false, 'a rowboat and no story: not yet');
  // (on the pirate road, the Loguetown chapter at its offer)
  const q = 'mq:eb_logue:pirate';
  const at = questDef(q).stages.findIndex((s) => s.offer === 'eb_isla');
  c.quests[q] = { stage: at, sid: 'o_eb_isla' };
  assert.equal(g.crew.offerPending(isla), true);
  // (turned down, the chapter moves on to the report — and she can still be asked, before you report back)
  c.crewOffers = { eb_isla: { said: 'no', day: 2 } };
  c.quests[q] = { stage: at + 1, sid: 'report' };
  assert.equal(g.crew.offerPending(isla), false);
  assert.equal(g.crew.canRecruit(isla), true);
  const cv = convo(g, 'eb_isla');
  assert.ok(cv.choices().some((ch) => /^"(Join my crew|Sail with me)/.test(cv.label(ch))), cv.choices().map(cv.label).join(' | '));
  c.crewOffers = {};
  delete c.quests[q];
  // (no story at all — a free sailor with a ship that can take the Grand Line)
  c.freeSail = { day: 1, from: 'birth' };
  c.fleet = [{ type: 'sloop', upgrades: [] }];
  assert.equal(g.crew.offerPending(isla), true);
  for (const id of ['nb_ingrid', 'wb_fiora', 'wb_tavo', 'sb_augie', 'sb_delphine']) assert.equal(g.crew.offerPending(npcDef(id)), true, id);
  // the free sailor hears the free sailor's pitch
  assert.match(convo(g, 'eb_isla').text('__recruit'), /eleven years for a ship worth trusting/);
});

test('every Blue can send two crewmates over the mountain: a crew stop and a last port on each road', () => {
  const byBlue = {};
  for (const ch of CHAPTERS.values()) {
    if (ch.part !== 1 || !['crew', 'last'].includes(ch.role)) continue;
    const sea = ch.id.slice(0, 2);
    (byBlue[sea] ||= new Set()).add(ch.role);
  }
  for (const sea of ['eb', 'nb', 'wb', 'sb']) assert.deepEqual([...byBlue[sea]].sort(), ['crew', 'last'], sea);
});

test('old saves: everyone already aboard said yes', () => {
  const old = { name: 'Old Salt', equipped: { weapons: [] }, inventory: [], flags: {}, quests: {}, crew: [{ id: 'nb_otto', joined: 9 }] };
  upgradeChar(old);
  assert.deepEqual(old.crewOffers, { nb_otto: { said: 'yes', day: 9 } });
});
