// Movesets, skill keys and Devil Fruit forms (game/moveset.js, entries.js,
// keys.js, hotbar.js; data/fruitForms.js): what's out — your fists, a
// weapon, your fruit, one of its forms, its awakened set — puts its skills on
// the skill keys and swings the mouse with it. A fruit's base set is yours on
// eating it; fighting with it opens its forms, and at its height a hard fight
// awakens it. Skill keys are the game's spare keys, changed at will (but
// never onto one the game keeps). Old saves keep everything: techniques come
// off the hotbar onto the keys, and the fruit gets an entry. And Law's ROOM
// stays where it was cast — unless his awakened set is out.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {} } }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../src/game/game.js');
const { Combat } = await import('../src/game/combat.js');
const { FX } = await import('../src/game/fx.js');
const { T } = await import('../src/world/tiles.js');
const { getAbility, abilityTotal, canUse } = await import('../src/game/abilities.js');
const { createCharacter, buildPlayer, migrateHotbar, upgradeChar, setDrawn } = await import('../src/game/lineage.js');
const { defaultLegacy } = await import('../src/game/save.js');
const { addItem, useItem } = await import('../src/game/inventory.js');
const { FRUITS, AWAKEN_MASTERY, fruitTechMastery, unlockedFruitTechniques } = await import('../src/data/fruits.js');
const { STYLES } = await import('../src/data/styles.js');
await import('../src/data/haki.js');
await import('../src/content/index.js');
const { Progression } = await import('../src/game/progression.js');
const { PlayerController } = await import('../src/game/playerController.js');
const { movesetOf, hakiGroupOf, movesetKind, attackSpec, awakenedOn, formBuff, skillHome } = await import('../src/game/moveset.js');
const { takeOut, keepEntries, cycleForm, formLock } = await import('../src/game/entries.js');
const { ENTRY, HOTBAR_SIZE } = await import('../src/game/hotbar.js');
const { keysOf, rebind, resetKeys, gameUse, GAME_KEYS, DEFAULT_KEYS, keyFromEvent, pressed } = await import('../src/game/keys.js');
const { roomFollows, ownRoom } = await import('../src/game/room.js');
const { setFruitMastery, setFruitAwakened, removeFruit } = await import('../src/game/creative.js');

const X0 = 20000, Y0 = 2000;
const nop = () => {};

/** A character just born, live in a little open arena (flat grass), with a foe to fight if wanted. */
function setup(o = {}) {
  const legacy = defaultLegacy();
  const char = createCharacter(legacy, { race: o.race || 'human', traits: o.traits || ['lucky'], seed: 4242 }, { name: 'Tester' });
  char.dead = true; // (persist saves nothing for it)
  char.world.fruitSpawns = [];
  const world = {
    width: 24576, height: 12288, zone: 0, quays: new Set(), islands: [],
    dx: (a, b) => b - a, wx: (x) => x, distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dist2: (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2,
    type: () => T.GRASS, solid: () => false, walkable: () => true, isBlocked: () => false, hitsProp: () => false,
    speedAt: () => 1, isLiquid: () => false, isOverlay: () => false, damageAt: () => 0, isQuay: () => false,
  };
  const g = Object.create(Game.prototype);
  Object.assign(g, { world, surface: world, hooks: {}, hintsShown: new Set(), logLines: [], actors: [], ships: [], areaZones: [], zones: new Map(), time: 0, slowmo: 1, audio: null, env: { time: 0, daylight: 1, day: 1 } });
  g.state = { char, legacy };
  g.settings = o.settings || {};
  g.fx = new FX(g);
  g.combat = new Combat(g);
  g.seaDepth = () => 6;
  g.log = (text) => g.logLines.push({ text });
  g.hint = nop;
  g.toasts = [];
  g.ui = { toast: (t, sub) => g.toasts.push(t + ' ' + (sub || '')), flashSlot: nop, flashAct: nop, banner: nop, blocksInput: () => false, cache: {} };
  g.groundItems = [];
  const p = buildPlayer(g, char);
  p.isPlayer = true; p.faction = 'player';
  p.x = X0; p.y = Y0;
  g.player = p;
  g.actors.push(p);
  g.progression = new Progression(g);
  // (the keys' work, called straight: no keyboard here)
  const pc = new PlayerController(g);
  return { g, c: char, p, pc };
}
function foe(g, o = {}) {
  const p = g.player;
  const a = buildFoe(g, o);
  a.x = p.x + (o.dx ?? 2); a.y = p.y;
  return a;
}
function buildFoe(g, o) {
  const A = g.player.constructor;
  const a = new A({ name: o.name || 'Brute', attrs: { str: o.str ?? 10, agi: 10, end: 10, vit: 10, wil: 10 }, hpMul: o.hpMul || 5, boss: o.boss });
  a.game = g; a.faction = 'pirate'; a.provoked = true; a.recalc(); a.hp = a.d.maxHp;
  g.actors.push(a);
  return a;
}
function step(g, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) {
    g.time += dt; g.env.time += dt;
    keepEntries(g.player);
    for (const a of g.actors) if (a.alive) a.update(dt, g);
    g.combat.update(dt);
    g.updateZones(dt);
    g.fx.update(dt);
  }
}
/** Eat a Devil Fruit, the way it's done from the bag. */
function eat(g, fid) {
  addItem(g, 'fruit_' + fid, 1, { silent: true });
  assert.ok(useItem(g, 'fruit_' + fid), `ate the ${fid}`);
}

// ------------------------------------------------------------------ unlocks
test('eating a fruit gives its first two moves (and its flight) at once, the rest by mastery; an entry on the hotbar, and the fruit out', () => {
  const { g, c, p } = setup();
  assert.deepEqual(c.hotbar.filter(Boolean), [], 'a new hotbar holds no techniques');
  eat(g, 'gomu');
  const gb = FRUITS.gomu.techniques.filter((t) => !t.flight);
  for (const t of gb.slice(0, 2)) assert.ok(c.techniques.includes(t.id), `${t.id} known at mastery 0`);
  for (const t of gb.slice(2)) assert.ok(!c.techniques.includes(t.id), `${t.id} waits for mastery ${fruitTechMastery(FRUITS.gomu, t)}`);
  const msLocked = movesetOf(p).skills;
  assert.ok(msLocked.slice(0, 2).every((s) => !s.locked) && msLocked.slice(2).every((s) => s.locked && /fruit mastery \d+/.test(s.why)), 'the rest shown locked, with the mastery they open at');
  c.fruitMastery = p.fruitMastery = 100;
  for (const id of unlockedFruitTechniques('gomu', 100)) if (!c.techniques.includes(id)) c.techniques.push(id);
  for (const t of FRUITS.gomu.techniques) assert.ok(c.techniques.includes(t.id), `${t.id} known at mastery 100`);
  assert.ok(c.hotbar.includes(ENTRY.fruit), 'the fruit has an entry');
  assert.ok(!c.hotbar.some((id) => id && getAbility(id)), 'no technique on the hotbar');
  assert.equal(movesetKind(p), 'fruit', 'taken out at once');
  const ms = movesetOf(p);
  assert.deepEqual(ms.skills.map((s) => s.id), FRUITS.gomu.techniques.map((t) => t.id), 'the base set, slot by slot');
  assert.ok(ms.skills.every((s) => !s.locked));
  // (Ope Ope: all eight of the surgeon's base, Counter Shock its heavy)
  const o = setup();
  eat(o.g, 'ope');
  assert.equal(movesetOf(o.p).skills.length, 8);
  assert.equal(movesetOf(o.p).heavy, 'ope_counter');
});

test('fighting opens the forms at their mastery (Gear Fourth only once Haki has woken), and mastering it readies the awakening', () => {
  const { g, c, p } = setup();
  eat(g, 'gomu');
  const prog = g.progression;
  const at = (id) => c.hotbar.indexOf(id);
  prog.addFruitMastery(24);
  assert.equal(at(ENTRY.form('gear2')), -1, 'not at 24');
  assert.equal(takeOut(g, p, ENTRY.form('gear2')), false, 'and it can\'t be switched on');
  assert.ok(g.logLines.some((l) => /opens at fruit mastery 25/.test(l.text)), 'it says when');
  prog.addFruitMastery(1);
  assert.ok(!formLock(p, 'gear2'), 'Gear Second open at 25');
  assert.ok(g.toasts.some((t) => /GEAR SECOND/.test(t)));
  prog.addFruitMastery(50); // 75
  assert.ok(!formLock(p, 'gear3'), 'Gear Third at 45');
  assert.equal(at(ENTRY.form('gear4')), -1, 'Gear Fourth keeps hidden while no Haki has woken');
  const locked = movesetOf(p).forms.find((F) => F.id === 'gear4');
  assert.ok(locked.open && /power yet to awaken/.test(locked.why), `the panel keeps the secret (${locked.why})`);
  prog.awakenHaki('armament', 10);
  assert.ok(c.formsShown.includes('gear4'), 'Gear Fourth comes out with Armament');
  // the awakening: at full mastery, then a moment in battle
  const aw = movesetOf(p).forms.find((F) => F.awakening);
  assert.ok(!aw.open && /mastery 100/.test(aw.why));
  prog.addFruitMastery(100);
  assert.equal(p.fruitMastery, AWAKEN_MASTERY);
  assert.ok(/a hard fight/.test(movesetOf(p).forms.find((F) => F.awakening).why));
  assert.equal(at(ENTRY.awake), -1, 'not awakened yet');
});

test('the awakening comes in a hard fight: a worthy foe or a boss, not a weakling — and it brings you back up', () => {
  const { g, c, p } = setup();
  eat(g, 'gomu');
  g.progression.addFruitMastery(100);
  const weak = foe(g, { str: 1, hpMul: 0.2 });
  assert.equal(g.progression.maybeAwakenFruit(weak, 'edge'), false, 'not against a weakling');
  const boss = foe(g, { boss: true, str: 30 });
  p.hp = 1; p.state = 'knocked';
  assert.equal(g.progression.maybeAwakenFruit(boss, 'knocked'), true);
  assert.equal(c.fruitAwakened, true);
  assert.equal(p.state, 'idle', 'back on your feet');
  assert.ok(p.hp >= p.d.maxHp * 0.5);
  assert.ok(c.fruitAwakened, 'its awakened set open');
  assert.ok(!c.hotbar.some((id) => (id && id.startsWith('ms:form')) || id === ENTRY.awake), 'forms never on the hotbar (the form key switches them)');
  step(g, 1.2);
  assert.ok(awakenedOn(p), 'switched on there and then');
  assert.equal(movesetOf(p).skills[0].id, 'gomu_dawn_pistol', 'Gear Fifth\'s moves');
  assert.equal(g.progression.maybeAwakenFruit(boss, 'knocked'), false, 'once');
});

// ------------------------------------------------------------------ movesets
test('fists, a weapon drawn, the fruit: each puts its own skills on the keys, and says what opens the rest', () => {
  const { g, c, p } = setup();
  // fists: the style's techniques in their places, those not learned saying what opens them
  let ms = movesetOf(p);
  assert.equal(ms.kind, 'fists');
  assert.equal(ms.skills.length, STYLES.brawler.techniques.length);
  assert.ok(ms.skills.every((s) => s.locked && /mastery \d+|taught by/.test(s.why)), ms.skills.map((s) => s.why).join(' | '));
  // a sword drawn: its style's moves (from its hotbar entry, which draws it)
  addItem(g, 'cutlass', 1, { silent: true });
  useItem(g, 'cutlass');
  assert.ok(c.hotbar.includes('item:cutlass'), 'a weapon worn goes on the hotbar');
  assert.ok(p.drawn, 'and its entry draws it');
  ms = movesetOf(p);
  assert.equal(ms.kind, 'weapon');
  assert.ok(ms.skills.every((s) => s.def.weapon === 'sword' || s.def.style === p.style), 'sword techniques');
  // the fruit: taking it out sheathes the sword; the sword drawn puts the fruit away
  eat(g, 'mera');
  assert.ok(!p.drawn && movesetKind(p) === 'fruit');
  ms = movesetOf(p);
  assert.equal(ms.title, 'Flame-Flame Fruit');
  assert.equal(ms.m1.element, 'fire');
  setDrawn(g, true);
  assert.equal(movesetKind(p), 'weapon');
  assert.equal(p.fruitOut, false);
  takeOut(g, p, ENTRY.fruit);
  assert.equal(movesetKind(p), 'fruit');
  assert.equal(p.drawn, false);
  takeOut(g, p, ENTRY.fruit);
  assert.equal(movesetKind(p), 'fists', 'pressed again: put away');
});

test('the mouse swings with what\'s out: the fruit\'s power in your fists\' chain (training the fruit), and its own heavy', () => {
  const { g, p } = setup();
  eat(g, 'gomu');
  assert.ok(p.tryM1(g));
  assert.equal(p.action.def.source, 'fruit:gomu', 'an M1 with the fruit out is the fruit\'s');
  assert.ok(p.action.def.m1Chain && p.action.def.infused);
  const base = getAbility(STYLES.brawler.m1Ids[0]);
  const reach = (d) => d.steps.find((s) => s.hit).hit.range;
  assert.ok(reach(p.action.def) > reach(base), 'rubber reaches further');
  p.action = null; p.combo.step = 0;
  assert.ok(p.tryHeavy(g));
  assert.equal(p.action.def.id, 'gomu_whip', 'the fruit\'s own heavy');
  p.action = null;
  assert.ok(p.cooldowns.gomu_whip > 0);
  assert.ok(p.tryHeavy(g));
  assert.equal(p.action.def.source, 'fruit:gomu', 'while it comes back: the fists\' heavy, with the fruit in it');
  p.action = null;
  takeOut(g, p, ENTRY.fruit);
  p.cooldowns = {};
  assert.ok(p.tryM1(g));
  assert.notEqual(p.action.def.source, 'fruit:gomu', 'fists again: plain blows');
  assert.equal(attackSpec(p), null);
});

test('Gear Fourth changes the moveset, runs out, and leaves you exhausted: no Gears, no Haki, for a while', () => {
  const { g, c, p, pc } = setup();
  eat(g, 'gomu');
  g.progression.addFruitMastery(100);
  g.progression.awakenHaki('armament', 30);
  p.haki = p.d.maxHaki;
  assert.ok(!formLock(p, 'gear4'));
  assert.ok(takeOut(g, p, ENTRY.form('gear4')));
  step(g, 1);
  assert.equal(formBuff(p)?.form, 'gear4');
  const ms = movesetOf(p);
  assert.equal(ms.title, 'Gear Fourth');
  assert.deepEqual(ms.skills.map((s) => s.id).slice(0, 4), ['gomu_kong_gun', 'gomu_kong_organ', 'gomu_rhino_schneider', 'gomu_culverin']);
  assert.equal(ms.heavy, 'gomu_leo_bazooka');
  assert.ok(p.armament, 'Haki-hardened');
  // (it lasts its time — drawing on Haki — then wears off)
  p.haki = 1e6;
  step(g, 23);
  assert.equal(formBuff(p), null, 'worn off');
  const spent = p.buffs.find((b) => b.id === 'gear4_spent');
  assert.ok(spent && spent.noHaki && spent.noForms, 'exhausted');
  assert.equal(p.armament, false);
  pc.toggleHaki(p, g, 'armament');
  assert.equal(p.armament, false, 'no Haki while exhausted');
  assert.equal(takeOut(g, p, ENTRY.form('gear2')), false, 'no Gear either');
  assert.equal(canUse(p, getAbility('haki_emission')), false);
  step(g, 13);
  assert.ok(!p.buffs.some((b) => b.noHaki), 'it passes');
  pc.toggleHaki(p, g, 'armament');
  assert.equal(p.armament, true);
  // (straight from Gear Fourth into another form: it ends — and the exhaustion stops the next one)
  p.haki = 1e6; p.cooldowns = {};
  assert.ok(takeOut(g, p, ENTRY.form('gear4')));
  step(g, 1.3);
  assert.equal(formBuff(p)?.form, 'gear4');
  assert.ok(takeOut(g, p, ENTRY.form('gear2')));
  step(g, 1);
  assert.equal(formBuff(p), null, 'no Gear Second after it');
  assert.ok(p.buffs.some((b) => b.id === 'gear4_spent'), 'exhausted');
});

test('a form switches on and, pressed again, off — straight from one into another too; the awakened set toggles at will', () => {
  const { g, c, p } = setup();
  eat(g, 'gomu');
  g.progression.addFruitMastery(60);
  assert.ok(takeOut(g, p, ENTRY.form('gear2')));
  step(g, 0.8);
  assert.equal(formBuff(p)?.form, 'gear2');
  assert.equal(movesetOf(p).skills[0].id, 'gomu_jet_pistol', 'every move a Jet');
  // straight into Gear Third: Second ends (and leaves you spent a moment)
  assert.ok(takeOut(g, p, ENTRY.form('gear3')));
  assert.ok(p.buffs.some((b) => b.id === 'gear2_spent'));
  step(g, 0.8);
  assert.equal(formBuff(p)?.form, 'gear3');
  assert.equal(movesetOf(p).skills[0].id, 'gomu_gigant_pistol');
  assert.ok(takeOut(g, p, ENTRY.form('gear3')), 'pressed again');
  assert.equal(formBuff(p), null);
  assert.equal(movesetKind(p), 'fruit', 'back to the base set, the fruit still out');
  // the awakened set: not before it has awakened; then on and off at will
  assert.equal(takeOut(g, p, ENTRY.awake), false);
  setFruitAwakened(g, true);
  assert.ok(c.fruitAwakened);
  p.cooldowns = {};
  assert.ok(takeOut(g, p, ENTRY.awake));
  step(g, 1.2);
  assert.ok(awakenedOn(p));
  assert.equal(movesetOf(p).entry, ENTRY.awake);
  assert.ok(movesetOf(p).skills.every((s) => s.def.awakened), 'the awakened set');
  assert.ok(takeOut(g, p, ENTRY.awake));
  assert.ok(!awakenedOn(p), 'off again');
  assert.equal(movesetOf(p).skills[0].id, 'gomu_pistol');
  // (a weapon drawn puts the fruit away, and its form with it)
  p.cooldowns = {};
  takeOut(g, p, ENTRY.awake); step(g, 1.2);
  addItem(g, 'cutlass', 1, { silent: true }); useItem(g, 'cutlass');
  assert.ok(!awakenedOn(p) && movesetKind(p) === 'weapon');
});

test('every fruit has an awakened set made from its base (bigger, stronger, faster), and the iconic ones their own moves', () => {
  for (const [fid, f] of Object.entries(FRUITS)) {
    const aw = f.awakening;
    assert.ok(aw && getAbility(aw.activate), `${fid}: an awakening`);
    assert.ok(aw.skills.length >= 1 && aw.skills.length <= 8, `${fid}: 1-8 awakened skills (${aw.skills.length})`);
    for (const id of aw.skills) assert.ok(getAbility(id), `${fid}: ${id} registered`);
    const buff = getAbility(aw.activate).steps.find((s) => s.buff).buff;
    assert.equal(buff.form, 'awake');
    assert.equal(buff.dur, Infinity, 'on until switched off');
  }
  const pistol = getAbility('mera_hiken'), aw = getAbility('mera_hiken_aw');
  const dmg = (d) => d.steps.find((s) => s.proj || s.hit).proj?.damage ?? d.steps.find((s) => s.hit).hit.damage;
  assert.ok(dmg(aw) > dmg(pistol) * 1.4, 'stronger');
  assert.ok(aw.cd < pistol.cd, 'back sooner');
  assert.equal(aw.base, 'mera_hiken', 'looks like the move it was made from');
  assert.ok(FRUITS.ope.awakening.skills.includes('ope_puncture_wille'), 'Law: Puncture Wille');
  assert.ok(FRUITS.gura.awakening.skills.includes('gura_kabutowari'), 'Whitebeard: Kabutowari');
  assert.ok(FRUITS.gomu.awakening.skills.includes('gomu_bajrang_gun'), 'Nika: Bajrang Gun');
});

test('the Haki techniques have their own group and keys: a king\'s Conqueror\'s first, then the active Haki\'s', () => {
  const { g, c, p } = setup();
  assert.equal(hakiGroupOf(p), null, 'nothing until a Haki wakes');
  g.progression.awakenHaki('armament', 60);
  c.techniques.push('haki_emission', 'haki_ryuo');
  assert.equal(hakiGroupOf(p), null, 'shown while one is on');
  p.armament = true;
  let hg = hakiGroupOf(p);
  // (Armament has no techniques of its own: hardened, your blows land; nothing to press)
  assert.deepEqual(hg.rows.filter((r) => !r.locked).map((r) => [r.id, r.slot]), []);
  c.haki.conqueror = 5; c.techniques.push('haki_conqueror');
  hg = hakiGroupOf(p);
  assert.equal(hg.rows[0].id, 'haki_conqueror', 'a king\'s release first, on G');
  assert.equal(hg.rows[0].slot, 0);
  assert.equal(keysOf(g.settings).haki[0], 'G');
  const inf = hg.rows.find((r) => r.id === 'haki_infusion');
  assert.ok(inf.locked && inf.slot === -1 && /Conqueror's 10/.test(inf.why), `still to learn: ${inf.why}`);
  // (and a technique learned says where it sits)
  assert.match(skillHome('haki_futuresight', g.settings), /Haki keys while Observation/);
  assert.match(skillHome('gomu_pistol', g.settings), /on Z with the Gomu Gomu no Mi out/);
});

test('the form key (B) goes through the forms unlocked in turn, and back to the base set', () => {
  const { g, p } = setup();
  eat(g, 'gomu');
  // (nothing to switch to yet: said, nothing happens)
  assert.equal(cycleForm(g, p), false);
  assert.match(g.logLines.at(-1).text, /No form/);
  g.progression.addFruitMastery(50);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    p.cooldowns = {}; p.buffs = p.buffs.filter((b) => !/_spent$/.test(b.id));
    cycleForm(g, p);
    step(g, 1.0);
    seen.push(formBuff(p)?.form || 'base');
  }
  // (Gear Second and Third open by 50; Fourth wants Armament: not on the way round)
  assert.deepEqual(seen, ['gear2', 'gear3', 'base', 'gear2']);
  assert.equal(movesetKind(p), 'fruit', 'the fruit out all the while');
});

// ------------------------------------------------------------------ keys
test('skill keys: defaults nothing else uses; a key the game keeps is refused, one another skill has is swapped, and it\'s saved', () => {
  const s = {};
  const K = keysOf(s);
  assert.deepEqual(K.skills.slice(0, 4), DEFAULT_KEYS.skills);
  assert.equal(K.skills.length, 8);
  assert.deepEqual(K.skills.slice(4), ['', '', '', ''], 'slots past the defaults start without a key');
  assert.deepEqual(K.form, ['B'], 'B switches the fruit\'s form');
  // (an old save's keys as they were by default — B N Y O, the form on Z — move to the new ones, the rest kept)
  const old = { keys: { skills: ['B', 'N', 'Y', 'O', 'K', 'X', '', ''], form: ['Z'] } };
  assert.deepEqual(keysOf(old).skills, ['Z', 'X', 'C', 'V', 'K', '', '', '']);
  assert.deepEqual(keysOf(old).form, ['B']);
  const mine = { keys: { skills: ['B', 'N', 'Y', 'P'], form: ['Z'] } };
  assert.deepEqual(keysOf(mine).skills.slice(0, 4), ['B', 'N', 'Y', 'P'], 'keys of your own choosing stay as they are');
  for (const k of [...DEFAULT_KEYS.skills, ...DEFAULT_KEYS.haki, ...DEFAULT_KEYS.form]) assert.equal(gameUse(k), '', `${k} is free`);
  // every key the game uses is on the list (a sample of what the controller, the menus and the map read)
  for (const k of ['W', 'A', 'S', 'D', 'Space', 'Shift', 'Control', 'Q', 'F', 'E', 'R', 'T', 'Tab', 'H', 'M', 'P', 'Escape', 'Enter', 'Mouse1', 'Mouse2', '1', '0']) assert.ok(gameUse(k), `${k} is the game's`);
  assert.equal(new Set(GAME_KEYS.map(([k]) => k)).size, GAME_KEYS.length, 'each listed once');
  let r = rebind(s, 'skills', 0, 'E');
  assert.equal(r.ok, false);
  assert.match(r.why, /talk, use/);
  r = rebind(s, 'skills', 0, 'Mouse1');
  assert.equal(r.ok, false, 'the attack button');
  assert.equal(rebind(s, 'skills', 0, 'Meta').ok, false, 'the browser\'s');
  assert.equal(s.keys, undefined, 'nothing saved for a refusal');
  // onto another skill's key: the two swap
  r = rebind(s, 'skills', 0, 'X');
  assert.ok(r.ok);
  assert.deepEqual(r.swapped, { group: 'skills', slot: 1, key: 'Z' });
  assert.equal(keysOf(s).skills[0], 'X');
  assert.equal(keysOf(s).skills[1], 'Z');
  // (the form key's too: B onto a skill leaves the form key with that skill's old one)
  r = rebind(s, 'skills', 2, 'B');
  assert.ok(r.ok);
  assert.deepEqual(r.swapped, { group: 'form', slot: 0, key: 'C' });
  assert.equal(keysOf(s).form[0], 'C');
  assert.ok(rebind(s, 'form', 0, 'B').ok, 'and back');
  // across the groups too, and onto a slot with no key yet
  r = rebind(s, 'skills', 6, 'G');
  assert.ok(r.ok);
  assert.equal(keysOf(s).haki[0], '', 'the Haki slot it came from is left without');
  assert.ok(rebind(s, 'skills', 5, 'Mouse4').ok, 'a side button');
  assert.ok(rebind(s, 'skills', 2, '').ok, 'no key at all');
  assert.equal(keysOf(s).skills[2], '');
  assert.ok(Array.isArray(s.keys.skills) && s.keys.skills.length === 8, 'in the settings, saved with them');
  resetKeys(s);
  assert.deepEqual(keysOf(s), keysOf({}));
  // (key names the way the game reads them; a mouse button pressed counts)
  assert.equal(keyFromEvent({ type: 'keydown', code: 'KeyZ' }), 'Z');
  assert.equal(keyFromEvent({ type: 'mousedown', button: 1 }), 'Mouse3');
  assert.equal(pressed({ enabled: true, mouse: { pressed: [false, true, false, false, false] }, wasPressed: () => false }, 'Mouse3'), true);
});

test('pressing a skill key uses the skill in that place of whatever is out — the same key, a different move with a form on', () => {
  const { g, p, pc } = setup();
  eat(g, 'gomu');
  assert.ok(pc.useSkill(p, g, 0, 0, p.x + 5, p.y));
  assert.equal(p.action.def.id, 'gomu_pistol');
  step(g, 1);
  g.progression.addFruitMastery(30);
  takeOut(g, p, ENTRY.form('gear2'));
  step(g, 0.8);
  assert.ok(pc.useSkill(p, g, 0, 0, p.x + 5, p.y));
  assert.equal(p.action.def.id, 'gomu_jet_pistol');
  // (a skill not learned yet says what opens it, and does nothing)
  const f = setup();
  assert.equal(f.pc.useSkill(f.p, f.g, 0, 0, f.p.x + 5, f.p.y), false);
  assert.ok(f.g.logLines.some((l) => /[Tt]aught by|[Mm]astery \d+/.test(l.text)), f.g.logLines.map((l) => l.text).join(' | '));
});

// ------------------------------------------------------------------ old saves
test('an old save: techniques come off the hotbar, a Dial\'s back as the Dial, the fruit gets its entry — nothing lost', () => {
  const { c } = setup();
  c.fruit = 'gomu'; c.fruitMastery = 50;
  c.techniques = ['gomu_pistol', 'gomu_gatling', 'gomu_gear2', 'haki_emission', 'brawl_haymaker', 'dial_impact'];
  c.inventory.push({ id: 'impact_dial', qty: 1 }, { id: 'meat', qty: 2 });
  c.hotbar = ['item:meat', 'gomu_pistol', 'gomu_gatling', 'dial_impact', 'haki_emission', 'brawl_haymaker', 'gomu_gear2', null, null, null];
  delete c.hotbarV;
  const before = c.techniques.slice();
  upgradeChar(c);
  assert.equal(c.hotbarV, 2);
  assert.equal(c.hotbar[0], 'item:meat', 'items stay where they were');
  assert.equal(c.hotbar[1], ENTRY.fruit, 'the fruit where its first technique was');
  assert.equal(c.hotbar[3], 'item:impact_dial', 'a Dial\'s technique: the Dial');
  assert.ok(!c.hotbar.some((id) => id && !id.startsWith('item:') && !id.startsWith('ms:')), `no techniques left (${c.hotbar})`);
  assert.ok(!c.hotbar.some((id) => id && id.startsWith('ms:form')), 'its forms are on the form key, not the hotbar');
  assert.equal(c.hotbar.length, HOTBAR_SIZE);
  for (const id of before) assert.ok(c.techniques.includes(id), `${id} still known`);
  // (once only: a second load changes nothing)
  const hb = c.hotbar.slice();
  migrateHotbar(c);
  assert.deepEqual(c.hotbar, hb);
});

test('creative mode: mastery sets which forms are on the hotbar, the awakening comes and goes, and removing the fruit clears its entries', () => {
  const { g, c, p } = setup();
  eat(g, 'gomu');
  assert.equal(setFruitMastery(g, 50), 2, 'two Gears open at 50');
  assert.ok(!formLock(p, 'gear3'));
  assert.equal(setFruitMastery(g, 30), 1);
  assert.ok(formLock(p, 'gear3'), 'shut again below its mastery');
  setFruitAwakened(g, true);
  assert.ok(c.fruitAwakened);
  removeFruit(g);
  assert.ok(!c.hotbar.some((id) => id && id.startsWith('ms:')), 'its entries gone');
  assert.equal(p.fruitOut, false);
  assert.equal(c.fruitAwakened, false);
});

// ------------------------------------------------------------------ ROOM
test('ROOM stays where it was cast — and follows its surgeon only while the awakened set is out', () => {
  const { g, c, p, pc } = setup();
  eat(g, 'ope');
  assert.ok(pc.useSkill(p, g, 0, 0, p.x + 3, p.y), 'ROOM, on the first key');
  step(g, abilityTotal(getAbility('ope_room')) + 0.1);
  const z = g.areaZones.find((r) => r.kind === 'room' && r.t > 0);
  assert.ok(z && z.owner === p);
  assert.equal(roomFollows(z), false);
  p.x += 4; step(g, 0.5);
  assert.equal(z.x, X0, 'the base ROOM stays put');
  // awakened: the Room cast before starts going with them
  setFruitAwakened(g, true);
  assert.ok(takeOut(g, p, ENTRY.awake));
  step(g, 1);
  assert.ok(awakenedOn(p));
  assert.equal(roomFollows(z), true);
  p.x += 3; step(g, 0.2);
  assert.ok(Math.abs(z.x - p.x) < 1e-6 && Math.abs(z.y - p.y) < 1e-6, 'it follows');
  assert.ok(ownRoom(p, g), 'always in it');
  // and an awakened ROOM cast now (K-ROOM's own, on the same key) goes with them too
  p.cooldowns = {};
  assert.equal(movesetOf(p).skills[0].id, 'ope_room_aw');
  assert.ok(pc.useSkill(p, g, 0, 0, p.x + 3, p.y));
  step(g, 0.8);
  const z2 = g.areaZones.find((r) => r.kind === 'room' && r.t > 0);
  p.y += 3; step(g, 0.2);
  assert.ok(Math.abs(z2.y - p.y) < 1e-6, 'the awakened ROOM follows');
  // switched back to the base set: it stays wherever it then is
  assert.ok(takeOut(g, p, ENTRY.awake));
  assert.ok(!awakenedOn(p));
  const x = z2.x, y = z2.y;
  p.x += 3; p.y -= 2; step(g, 0.3);
  assert.equal(z2.x, x); assert.equal(z2.y, y);
  assert.equal(c.fruit, 'ope');
});
