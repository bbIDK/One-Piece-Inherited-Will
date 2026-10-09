// Haki (game/haki.js and its users): every character born with their own
// Haki signature — the colour of their Conqueror's, the tint of their
// Observation, the sheen on their Armament, the voice it sounds in — the
// same from the same seed, an old save's made the same way; the Emperors'
// own colours; how Armament and Observation wake (and are taught), the odds
// of a king's birth and the moments a king's Conqueror's wakes; how far a
// coat of Armament spreads, its hardening and Ryou; and when two kings'
// Conqueror's clash instead of washing over each other. (How they look and
// sound: tools/scenarios-haki.mjs, tools/scenarios-audio.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {} } }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const H = await import('../src/game/haki.js');
const { createCharacter, buildPlayer, upgradeChar, rollBirth } = await import('../src/game/lineage.js');
const { defaultLegacy } = await import('../src/game/save.js');
const { Game } = await import('../src/game/game.js');
const { Actor } = await import('../src/game/actor.js');
const { Combat } = await import('../src/game/combat.js');
const { FX } = await import('../src/game/fx.js');
const { conquerorBurst, futureSight } = await import('../src/game/abilities.js');
const { Progression } = await import('../src/game/progression.js');
const { makeNPC, npcDef, registerNPCs } = await import('../src/game/npcs.js');
const { T } = await import('../src/world/tiles.js');
await import('../src/data/styles.js');
await import('../src/data/fruits.js');
await import('../src/data/haki.js');
const { PACKS } = await import('../src/content/index.js');
for (const p of PACKS) if (p.npcs) registerNPCs(p.npcs);

const HEX = /^#[0-9a-f]{6}$/;

// ------------------------------------------------------------------ signatures
test('a Haki signature: the same from the same seed, varied across seeds, from the palettes', () => {
  const a = H.hakiSignature(4242), b = H.hakiSignature(4242);
  assert.deepEqual(a, b);
  for (const k of ['conqueror', 'observation', 'armament']) assert.match(a[k], HEX, k);
  assert.ok(a.voice >= 0 && a.voice <= 1);
  const seen = { conqueror: new Set(), observation: new Set(), armament: new Set() }, voices = new Set();
  for (let s = 1; s <= 400; s++) {
    const g = H.hakiSignature(s);
    assert.ok(H.CONQUEROR_COLOURS.some((c) => c.hex === g.conqueror));
    assert.ok(H.OBSERVATION_TINTS.some((c) => c.hex === g.observation));
    assert.ok(H.ARMAMENT_SHEENS.some((c) => c.hex === g.armament));
    for (const k of Object.keys(seen)) seen[k].add(g[k]);
    voices.add(Math.round(g.voice * 10));
  }
  // (every colour of the palette turns up among 400 births — crimson the commonest — and voices spread wide)
  assert.equal(seen.conqueror.size, H.CONQUEROR_COLOURS.length);
  assert.equal(seen.observation.size, H.OBSERVATION_TINTS.length);
  assert.ok(voices.size >= 9, `voices ${voices.size}`);
  const crimson = Array.from({ length: 400 }, (_, i) => H.hakiSignature(i + 1).conqueror).filter((c) => c === '#ff1a3c').length;
  assert.ok(crimson > 400 / H.CONQUEROR_COLOURS.length, `crimson ${crimson}`);
  assert.equal(H.colourName('#ff1a3c'), 'Crimson');
});

test('a new character carries their signature from birth, onto the live actor; an old save gets the same from its seed', () => {
  const legacy = defaultLegacy();
  const c = createCharacter(legacy, { race: 'human', traits: ['lucky'], seed: 777 }, { name: 'Tester' });
  assert.deepEqual(c.hakiSig, H.hakiSignature(c.runSeed));
  const c2 = createCharacter(legacy, { race: 'human', traits: ['lucky'], seed: 777 }, { name: 'Tester' });
  assert.deepEqual(c2.hakiSig, c.hakiSig, 'deterministic');
  const p = buildPlayer({ fx: {}, env: {} }, c);
  assert.deepEqual(p.hakiSig, c.hakiSig);
  // an old save, from before signatures: made the same way, from the seed it has
  const old = JSON.parse(JSON.stringify(c));
  delete old.hakiSig;
  upgradeChar(old);
  assert.deepEqual(old.hakiSig, c.hakiSig);
  // (and never changed once it has one)
  old.hakiSig = { ...old.hakiSig, conqueror: '#17e07c' };
  upgradeChar(old);
  assert.equal(old.hakiSig.conqueror, '#17e07c');
});

test('NPCs: an Emperor\'s own colours from their definition, anyone else\'s hashed from who they are; kings fight with their Conqueror\'s', () => {
  const kaido = npcDef('kaido');
  assert.equal(kaido.hakiSig.conqueror, '#2e8bff');
  const a = makeNPC(kaido, 0, 0);
  assert.equal(a.hakiSig.conqueror, '#2e8bff');
  assert.match(a.hakiSig.observation, HEX);
  assert.ok(a.techniques.includes('haki_conqueror'), 'a boss born a king lets it loose');
  // (the same NPC, the same signature; a plain one too)
  const grunt = { id: 'some_grunt', name: 'Grunt', level: 5 };
  assert.deepEqual(makeNPC(grunt, 0, 0).hakiSig, makeNPC(grunt, 0, 0).hakiSig);
  assert.ok(!makeNPC(grunt, 0, 0).techniques.includes('haki_conqueror'));
  // (sigOf: anyone at all has one, the same every time it's asked)
  const nobody = new Actor({ name: 'Nobody' });
  assert.equal(H.sigOf(nobody), H.sigOf(nobody));
});

// ------------------------------------------------------------------ how each is obtained
function progressionFor(attrs = {}, extra = {}) {
  const legacy = defaultLegacy();
  const char = createCharacter(legacy, { race: 'human', traits: ['lucky'], seed: 99 }, { name: 'Tester' });
  char.dead = true; // (persist does nothing for a character marked dead)
  Object.assign(char.attrs, attrs);
  Object.assign(char, extra);
  const nop = () => {};
  const game = { state: { char, legacy }, on: nop, emit: nop, log: nop, hint: nop, ui: { toast: nop }, fx: { impactFrame: nop } };
  game.player = buildPlayer(game, char);
  const prog = new Progression(game);
  return { prog, char, game };
}

test('Armament stirs in hard fights once you\'re strong enough (Strength 22+ or weapon mastery 35+; certain at 45 / 80)', () => {
  let r = progressionFor({ str: 21 });
  for (let i = 0; i < 300; i++) r.prog.maybeAwaken('armament', 1);
  assert.equal(r.char.haki.armament, 0, 'never below the bar');
  r = progressionFor({ str: 45 });
  r.prog.maybeAwaken('armament', 0.5);
  assert.equal(r.char.haki.armament, 0, 'not against a weak foe');
  r.prog.maybeAwaken('armament', 0.8);
  assert.ok(r.char.haki.armament > 0, 'certain at Strength 45');
  r = progressionFor({ str: 5 }, { weaponMastery: { fists: 0, legs: 0, sword: 80, gun: 0, staff: 0, axe: 0 } });
  r.prog.maybeAwaken('armament', 1);
  assert.ok(r.char.haki.armament > 0, 'certain at weapon mastery 80');
  // (in between, by chance, a fight at a time)
  r = progressionFor({ str: 30 });
  let n = 0;
  for (let i = 0; i < 3000 && !r.char.haki.armament; i++, n++) r.prog.maybeAwaken('armament', 1);
  assert.ok(r.char.haki.armament > 0 && n > 1, `woke after ${n}`);
});

test('Observation is sharpened by dodging danger (Agility 22+ or 60 dodges; certain at 45 / 400) — and a master can teach either', () => {
  let r = progressionFor({ agi: 21 });
  for (let i = 0; i < 300; i++) r.prog.maybeAwaken('observation', 1);
  assert.equal(r.char.haki.observation, 0);
  r = progressionFor({ agi: 45 });
  r.prog.maybeAwaken('observation', 1);
  assert.ok(r.char.haki.observation > 0);
  r = progressionFor({ agi: 5 });
  r.char.stats.evades = 400;
  r.prog.maybeAwaken('observation', 1);
  assert.ok(r.char.haki.observation > 0, 'certain after 400 dodges');
  assert.match(H.HAKI_HOW.armament, /Strength 22\+.*weapon mastery 35\+.*taught/);
  assert.match(H.HAKI_HOW.observation, /Agility 22\+.*taught/);
  assert.match(H.HAKI_HOW.conqueror, /Cannot be taught/);
});

test('the qualities of a king: everyone is born with them (asleep till the will is tested)', () => {
  assert.equal(H.kingChance(false, false), 1);
  assert.equal(H.kingChance(true, true), 1);
  const legacy = defaultLegacy();
  for (let s = 1; s <= 300; s++) assert.ok(rollBirth(legacy, s * 7919).traits.includes('conqueror'));
});

// ------------------------------------------------------------------ fights
const SPOT = { x: 20000, y: 2000 };
function arena() {
  const world = {
    width: 24576, height: 12288, zone: 0, quays: new Set(), islands: [],
    dx: (a, b) => b - a, wx: (x) => x, distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dist2: (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2,
    type: () => T.GRASS, solid: () => false, walkable: () => true, isBlocked: () => false, hitsProp: () => false,
    speedAt: () => 1, isLiquid: () => false, isOverlay: () => false, damageAt: () => 0, isQuay: () => false,
  };
  const g = Object.create(Game.prototype);
  Object.assign(g, { world, surface: world, hooks: {}, hintsShown: new Set(), logLines: [], actors: [], ships: [], areaZones: [], zones: new Map(), time: 0, slowmo: 1, ui: null, audio: null, env: { time: 0, daylight: 1 } });
  g.fx = new FX(g);
  g.combat = new Combat(g);
  return g;
}
function body(g, o = {}) {
  const L = o.level || 5;
  const a = new Actor({ name: o.name || 'Fighter', race: 'human', attrs: { str: L, agi: L, end: L, vit: L, wil: L }, boss: o.boss, faction: o.faction || 'pirate', hakiSkill: o.haki || {} });
  a.game = g; a.x = SPOT.x + (o.dx || 0); a.y = SPOT.y + (o.dy || 0); a.facing = o.facing ?? 0;
  if (o.player) { a.isPlayer = true; a.faction = 'player'; g.player = a; a.char = { traits: o.traits || [], haki: a.hakiSkill }; }
  else a.aggroPlayer = true;
  a.haki = 500;
  g.actors.push(a);
  return a;
}
const blowAt = (att, tgt, o = {}) => ({ owner: att, x: att.x, y: att.y - 0.4, shape: 'arc', range: 2, arc: 1.8, angle: Math.atan2(tgt.y - att.y, tgt.x - att.x), damage: 40, knockback: 0, stun: 0, critChance: 0, ...o });

test('Armament: the coat spreads further with the level (fists → forearms → whole arms) and hardens you against blows', () => {
  assert.equal(H.armamentReach(0), 0);
  assert.equal(H.armamentReach(10), 0.2);
  assert.ok(H.armamentReach(30) > 0.3 && H.armamentReach(30) < 0.56);
  assert.ok(H.armamentReach(70) >= 1);
  for (let l = 1; l < 100; l++) assert.ok(H.armamentReach(l + 1) >= H.armamentReach(l));
  assert.ok(H.COAT.spread > 0.2 && H.COAT.spread < 0.4);
  // a blow on a hardened body does less (and the more so the higher the level)
  const dmgOn = (lvl, on) => {
    const g = arena();
    const you = body(g, { player: true, haki: { armament: lvl } });
    const foe = body(g, { dx: 1.2, facing: Math.PI });
    you.armament = on;
    const hp0 = you.hp;
    g.combat.applyHit(foe, you, blowAt(foe, you));
    return hp0 - you.hp;
  };
  const bare = dmgOn(40, false), low = dmgOn(10, true), high = dmgOn(90, true);
  assert.ok(low < bare && high < low, `${bare} ${low} ${high}`);
  assert.ok(high >= bare * 0.55, 'never more than 40% off');
});

test('Ryou (level 60+, Armament on): a blow pushes the Haki on through a guard and into the body', () => {
  const g = arena();
  const you = body(g, { player: true, haki: { armament: 70 } });
  assert.ok(!H.hasRyou(you), 'not with Armament off');
  you.armament = true;
  assert.ok(H.hasRyou(you));
  you.hakiSkill = { armament: 59 };
  assert.ok(!H.hasRyou(you), 'not below its level');
  const through = (lvl) => {
    const g2 = arena();
    const att = body(g2, { player: true, haki: { armament: lvl } });
    const foe = body(g2, { dx: 1.2, facing: Math.PI });
    att.armament = true;
    foe.blocking = true; foe.blockTime = 1; // (a guard long up: no parry, a block)
    const hp0 = foe.hp;
    g2.combat.applyHit(att, foe, blowAt(att, foe));
    return hp0 - foe.hp;
  };
  const plain = through(50), ryou = through(60);
  assert.ok(ryou > plain * 2, `through a guard: ${plain} vs ${ryou}`);
  // (and on an open body, a little more, from the inside)
  const open = (lvl) => { const g3 = arena(); const att = body(g3, { player: true, haki: { armament: lvl } }); const foe = body(g3, { dx: 1.2, facing: Math.PI }); att.armament = true; const hp0 = foe.hp; g3.combat.applyHit(att, foe, blowAt(att, foe)); return hp0 - foe.hp; };
  assert.ok(open(60) > open(50) * 1.1);
});

test('Observation: its reach grows with the level; Future Sight shows the blows coming', () => {
  assert.ok(H.senseRange(80) > H.senseRange(10));
  const g = arena();
  const you = body(g, { player: true, haki: { observation: 40 } });
  assert.ok(!futureSight(you));
  you.observation = true;
  assert.ok(!futureSight(you), 'not below its level');
  you.hakiSkill = { observation: H.FUTURE_SIGHT };
  assert.ok(futureSight(you));
  you.observation = false;
  you.addBuff({ id: 'future_sight', dur: 6 });
  assert.ok(futureSight(you), 'the technique too');
});

// ------------------------------------------------------------------ Conqueror's
test("Conqueror's: the weak faint, the strong are shaken, you are never knocked out by it", () => {
  const g = arena();
  const you = body(g, { player: true, level: 40, haki: { conqueror: 50 } });
  const weak = body(g, { dx: 3, level: 2 });
  const strong = body(g, { dx: -3, level: 60 });
  const r = conquerorBurst(you, g, { range: 9, damage: 10 }, 1);
  assert.equal(r.clash, null);
  assert.equal(weak.state, 'knocked');
  assert.ok(weak.fainted);
  assert.equal(strong.state, 'idle');
  assert.ok(strong.hitstun > 0);
  // a foe's on you: your knees buckle, you stay standing
  const g2 = arena();
  const p = body(g2, { player: true, level: 5 });
  const k = body(g2, { dx: 3, level: 60, haki: { conqueror: 60 } });
  conquerorBurst(k, g2, { range: 9, damage: 10 }, 1);
  assert.equal(p.state, 'idle');
  assert.ok(p.hitstun > 0);
});

test("a king-to-be wakes to another's Conqueror's; two kings' Conqueror's clash", () => {
  // born a king, not yet awakened: a boss's Conqueror's washing over you wakes yours (lives.js awaken)
  const g = arena();
  const p = body(g, { player: true, level: 30, traits: ['conqueror'] });
  const boss = body(g, { dx: 4, level: 70, boss: true, haki: { conqueror: 90 } });
  let woke = null;
  g.lives = { awaken: (how, by) => { woke = { how, by }; } };
  conquerorBurst(boss, g, { range: 9, damage: 10 }, 1);
  assert.deepEqual(woke, { how: 'pressure', by: boss });
  // two kings, one a boss: the clash — neither faints, both are thrown back, apart
  const g2 = arena();
  const you = body(g2, { player: true, level: 40, haki: { conqueror: 40 } });
  const emperor = body(g2, { dx: 5, level: 80, boss: true, haki: { conqueror: 95 } });
  const grunt = body(g2, { dx: 2.5, dy: 2, level: 2 });
  assert.ok(H.clashes(you, emperor, 5, 13.5));
  const r = conquerorBurst(you, g2, { range: 9, damage: 10 }, 1);
  assert.equal(r.clash, emperor);
  assert.equal(you.state, 'idle'); assert.equal(emperor.state, 'idle');
  assert.ok(you.kb.x < 0 && emperor.kb.x > 0, 'thrown apart');
  assert.equal(grunt.state, 'knocked', 'an onlooker faints');
  // not a clash: a king who isn't a boss, nor one out of reach, nor one already down
  const g3 = arena();
  const y3 = body(g3, { player: true, level: 40, haki: { conqueror: 40 } });
  const lord = body(g3, { dx: 5, level: 60, haki: { conqueror: 50 } });
  assert.ok(!H.clashes(y3, lord, 5, 13.5));
  assert.equal(conquerorBurst(y3, g3, { range: 9, damage: 10 }, 1).clash, null);
  lord.boss = true;
  assert.ok(!H.clashes(y3, lord, 20, 13.5));
  lord.state = 'knocked';
  assert.ok(!H.clashes(y3, lord, 5, 13.5));
});

test('a Haki master can sense a king (revealing the hidden trait), or honestly says there\'s none; Conqueror\'s is never taught', async () => {
  const { Services } = await import('../src/game/services.js');
  const at = (traits) => {
    const legacy = defaultLegacy();
    const char = createCharacter(legacy, { race: 'human', traits, seed: 5 }, { name: 'Tester' });
    char.dead = true;
    const logs = [];
    const nop = () => {};
    const game = { state: { char, legacy }, log: (t) => logs.push(t), ui: { toast: nop }, emit: nop, on: nop, env: { day: 1 } };
    game.player = buildPlayer(game, char);
    return { S: new Services(game), char, logs };
  };
  const king = at(['lucky', 'conqueror']);
  assert.equal(king.S.hakiSense('rayleigh'), 'king');
  assert.ok(king.char.flags.kingSensed);
  assert.match(king.logs.at(-1), /qualities of a king/);
  const none = at(['lucky']);
  assert.equal(none.S.hakiSense('rayleigh'), 'none');
  assert.ok(!none.char.flags.kingSensed);
  assert.match(none.logs.at(-1), /nothing of the kind/);
  assert.equal(none.S.hakiTrain('rayleigh', 'conqueror'), false);
  assert.match(none.logs.at(-1), /cannot be taught/i);
});
