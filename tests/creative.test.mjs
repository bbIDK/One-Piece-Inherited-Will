// The creative panel's work (game/creative.js): becoming another race there
// and then (the live body as well as the record: jumping, swimming, breathing,
// reach, size, lives, looks), Devil Fruits handed out without a second copy
// of any coming into the world — eaten the usual way, and their power taken
// away again to try another — and Haki set to a level, with the techniques
// that level opens. (The panel itself, and the model rebuilt in 3D, are
// looked at in the browser.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {} } }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createCharacter, buildPlayer } = await import('../src/game/lineage.js');
const { defaultLegacy } = await import('../src/game/save.js');
const { count, useItem } = await import('../src/game/inventory.js');
const { FRUITS } = await import('../src/data/fruits.js');
const { RACES } = await import('../src/data/races.js');
await import('../src/data/haki.js');
const { PACKS } = await import('../src/content/index.js');
const { registerNPCs } = await import('../src/game/npcs.js');
const { changeRace, raceLook, giveFruit, removeFruit, fruitWhere, setFruitMastery, setHaki } = await import('../src/game/creative.js');
// (the canon Devil Fruit users, as installContent registers them)
for (const p of PACKS) if (p.npcs) registerNPCs(p.npcs);

function setup(race = 'human') {
  const legacy = defaultLegacy();
  const char = createCharacter(legacy, { race, traits: ['lucky'], seed: 4242 }, { name: 'Tester' });
  // (persist does nothing for a character marked dead: there's nothing to save here)
  char.dead = true;
  char.world.fruitSpawns = [];
  const nop = () => {};
  const game = {
    state: { char, legacy }, emit: nop, log: nop, hint: nop, ui: { toast: nop }, fx: { ring: nop, burst: nop, text: nop }, audio: null,
    surface: { islands: [{ id: 'far_isle', name: 'Far Isle' }] }, groundItems: [], env: { day: 1, clock: 8 },
  };
  const p = buildPlayer(game, char);
  p.isPlayer = true;
  game.player = p;
  return { game, char, p };
}

test('a new race is taken on whole, there and then: body, attributes, lives and looks', () => {
  const { game, char: c, p } = setup('human');
  const attrs0 = { ...c.attrs }, look0 = p.look;
  assert.ok(changeRace(game, 'mink'));
  assert.equal(c.race, 'mink');
  assert.equal(p.race, 'mink');
  // (a Mink springs higher, and its build is on the attributes in place of a human's)
  assert.equal(p.jumpStats().v, RACES.mink.jump);
  assert.equal(p.jumpStats().charge, RACES.mink.charge);
  assert.equal(c.attrs.agi, attrs0.agi + RACES.mink.stats.agi);
  assert.equal(c.attrs.wil, attrs0.wil - RACES.human.stats.wil);
  assert.ok(c.techniques.includes('elec_discharge') && c.masteries.electro >= 5, 'a Mink is born with Electro');
  assert.equal(c.look.race, 'mink');
  assert.ok(c.look.ears && c.look.fur && c.look.skin === c.look.fur, 'fur, ears, and the fur for skin');
  assert.notEqual(p.look, look0, 'a new look object: the model is built again');
  assert.equal(p.look.race, 'mink');

  changeRace(game, 'fishman');
  assert.equal(p.gills, true);
  assert.equal(p.canSwimRace, RACES.fishman.swim);
  assert.equal(p.maxOxygen, Infinity);
  assert.equal(c.look.fin, true);
  assert.equal(c.look.ears, undefined, 'no Mink ears on a Fish-Man');
  assert.ok(c.masteries.fishman_karate >= 8);

  changeRace(game, 'buccaneer');
  assert.equal(p.gills, false);
  assert.ok(Number.isFinite(p.maxOxygen));
  assert.equal(c.look.scale, RACES.buccaneer.scale);
  assert.equal(p.look.scale, RACES.buccaneer.scale);
  assert.equal(p.baseMods.speedMul, 0.92);
  assert.equal(p.baseMods.hpMul, RACES.buccaneer.hpMul);

  changeRace(game, 'lunarian');
  assert.equal(c.maxLives, RACES.lunarian.lives, 'a Lunarian\'s vitality is a life more');
  assert.equal(p.flameLit, true);
  assert.equal(c.look.wings, 'lunar');
  assert.equal(c.look.scale, 1);

  changeRace(game, 'skypiean');
  assert.equal(c.look.wings, 'sky', 'a Skypiean\'s little wings for a Lunarian\'s');
  assert.equal(p.flameLit, false);
  assert.equal(c.look.backFlame, undefined);

  // and back where we started: the races' builds come off as they went on
  changeRace(game, 'human');
  assert.deepEqual(c.attrs, attrs0);
  assert.equal(c.maxLives, RACES.human.lives);
  assert.equal(p.reach, 1);
  assert.equal(p.baseMods.stride, 1);
  assert.equal(changeRace(game, 'human'), false, 'already human');
});

test('a race\'s looks change, and nothing else of yours does', () => {
  const look = { race: 'human', skin: '#f1c9a0', hair: 'mohawk', hairColor: '#c0392b', top: '#123456', topStyle: 'vest', fem: false, frame: 'athletic', seed: 3 };
  const mink = raceLook(look, 'mink', 11);
  assert.equal(mink.race, 'mink');
  assert.equal(mink.top, '#123456');
  assert.equal(mink.topStyle, 'vest');
  assert.equal(mink.hair, 'mohawk');
  assert.equal(mink.frame, 'athletic');
  assert.equal(mink.skin, mink.fur, 'a Mink\'s fur is its skin');
  const back = raceLook(mink, 'human', 12);
  assert.equal(back.ears, undefined);
  assert.equal(back.fur, undefined);
  assert.notEqual(back.skin, mink.fur, 'and a human\'s skin is skin again');
  // a skin chosen in the creator stays, for races that leave it to you
  assert.equal(raceLook(look, 'skypiean', 5).skin, look.skin);
  assert.equal(raceLook(look, 'three_eye', 5).thirdEye, true);
});

test('a Devil Fruit handed out is the only one: taken from where it grows, eaten the usual way, its power taken away again', () => {
  const { game, char: c, p } = setup('human');
  const spot = { island: 'far_isle', fruit: 'hana', x: 10, y: 10, taken: false };
  c.world.fruitSpawns.push(spot);
  c.world.fruitsTaken = ['hana'];
  game.groundItems.push({ x: 10, y: 10, id: 'fruit_hana', fruitSpawn: spot });
  assert.equal(fruitWhere(game, 'hana').kind, 'world');
  assert.equal(fruitWhere(game, 'hana').island, 'Far Isle');
  assert.equal(fruitWhere(game, 'bara').kind, 'npc', 'Buggy\'s');
  assert.equal(fruitWhere(game, 'gomu').kind, 'free');

  assert.ok(giveFruit(game, 'hana'));
  assert.equal(count(c, 'fruit_hana'), 1);
  assert.equal(spot.taken, true, 'the one growing out there is the one you got');
  assert.equal(game.groundItems.length, 0);
  assert.equal(fruitWhere(game, 'hana').kind, 'bag');
  assert.equal(giveFruit(game, 'hana'), false, 'no second copy');
  assert.equal(count(c, 'fruit_hana'), 1);

  // eaten as any Devil Fruit is (inventory.js eatFruit)
  assert.ok(useItem(game, 'fruit_hana'));
  assert.equal(c.fruit, 'hana');
  assert.equal(p.fruit, 'hana');
  assert.equal(count(c, 'fruit_hana'), 0);
  assert.equal(fruitWhere(game, 'hana').kind, 'eaten');
  assert.equal(giveFruit(game, 'hana'), false);
  // (and a body still holds only one)
  assert.ok(giveFruit(game, 'gomu'));
  assert.equal(useItem(game, 'fruit_gomu'), false);
  assert.equal(c.fruit, 'hana');

  // (its first two moves are yours on eating it; mastery opens the rest — and they stay yours)
  const hana = FRUITS.hana.techniques.map((t) => t.id);
  assert.ok(hana.slice(0, 2).every((id) => c.techniques.includes(id)));
  assert.equal(setFruitMastery(game, 100), 0);
  for (const id of hana) if (!c.techniques.includes(id)) c.techniques.push(id); // (what fighting at 100 opens: progression.js syncUnlocks)
  setFruitMastery(game, 0);
  assert.ok(hana.every((id) => c.techniques.includes(id)), 'what you opened stays yours at mastery 0');
  assert.equal(c.fruitMastery, 0);
  assert.equal(p.fruitMastery, 0);
  assert.ok(c.hotbar.includes('ms:fruit'), 'its entry on the hotbar');

  assert.equal(removeFruit(game), 'hana');
  assert.equal(c.fruit, null);
  assert.equal(p.fruit, null);
  assert.ok(!c.techniques.some((id) => hana.includes(id)), 'its techniques go with it');
  assert.ok(!c.hotbar.some((id) => hana.includes(id) || id === 'ms:fruit'), 'and its entry');
  assert.ok(c.world.fruitsTaken.includes('hana'), 'never rolled into the world again: there\'s still only the one');
  assert.equal(fruitWhere(game, 'hana').kind, 'picked');
  assert.equal(removeFruit(game), null);
  // now another can be eaten; one that was never out in the world isn't counted as if it were
  assert.ok(useItem(game, 'fruit_gomu'));
  assert.equal(c.fruit, 'gomu');
  assert.equal(removeFruit(game), 'gomu');
  assert.equal(fruitWhere(game, 'gomu').kind, 'free');
});

test('Haki set to a level is awakened, with the techniques that level opens', () => {
  const { game, char: c, p } = setup('human');
  assert.equal(p.hakiUnlocked(), false);
  setHaki(game, 'armament', 40);
  assert.equal(c.haki.armament, 40);
  assert.ok(p.hakiUnlocked());
  assert.equal(p.haki, p.d.maxHaki, 'the spirit bar comes up full');
  assert.ok(c.techniques.includes('haki_emission'));
  assert.ok(!c.techniques.includes('haki_ryuo'), 'Ryuo wants level 55');
  setHaki(game, 'conqueror', 60);
  assert.ok(c.traits.includes('conqueror'), 'born of the King\'s Disposition');
  assert.ok(c.techniques.includes('haki_conqueror') && c.techniques.includes('haki_infusion'));
  assert.ok(!c.hotbar.some((id) => id && id.startsWith('haki_')), '(Haki techniques sit on the Haki keys, not the hotbar)');
  p.armament = true;
  setHaki(game, 'armament', 0);
  assert.equal(c.haki.armament, 0);
  assert.equal(p.armament, false);
  setHaki(game, 'conqueror', 0);
  assert.equal(p.hakiUnlocked(), false);
  assert.equal(p.haki, 0);
  // a Three-Eye is born with Observation: becoming one awakens it
  changeRace(game, 'three_eye');
  assert.ok(c.haki.observation >= 8 && p.hakiUnlocked());
});
