// Devil Fruit powers as the anime has them, and what each people's body does
// in a fight (game/room.js, powers.js, racial.js; the data: data/fruits.js,
// data/races.js). Law's ROOM is a place: it stays where it was cast, and his
// techniques work in it — swap, lift, cut without killing, take the heart.
// Logia bodies let blows through, but not the surgeon's (or a rubber fist on
// lightning). Ice Age makes a road of the sea; a Black Hole swallows shots
// and Liberation lets them out; a barrier stops what comes at its front;
// Repel sends shots back; the Birdcage lets nobody out; a stolen shadow
// burns in the sun. Minks spark and, under the full moon, become beasts;
// a Lunarian's flame burns them and shields her, until the sea puts it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../src/game/game.js');
const { Actor } = await import('../src/game/actor.js');
const { Combat } = await import('../src/game/combat.js');
const { FX } = await import('../src/game/fx.js');
const { getAbility, abilityTotal, canUse, ownRoom, startAbility } = await import('../src/game/abilities.js');
const { AIController } = await import('../src/game/ai.js');
const { iceAt } = await import('../src/game/powers.js');
const { T } = await import('../src/world/tiles.js');
await import('../src/data/styles.js');
await import('../src/data/fruits.js');
await import('../src/data/haki.js');
await import('../src/content/index.js');

const X0 = 20000, Y0 = 2000;
/** Open flat grass in the Blues (east of `seaFrom`, if given, the open sea), and a game just big enough to fight in. */
function arena(o = {}) {
  const sea = (x) => o.seaFrom !== undefined && x >= o.seaFrom;
  const world = {
    width: 24576, height: 12288, zone: 0, quays: new Set(), islands: [],
    dx: (a, b) => b - a, wx: (x) => x, distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dist2: (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2,
    type: (x) => (sea(x) ? T.SEA : T.GRASS), solid: () => false, walkable: (x) => !sea(x), isBlocked: () => false, hitsProp: () => false,
    speedAt: () => 1, isLiquid: (x) => sea(x), isOverlay: () => false, damageAt: () => 0, isQuay: () => false,
  };
  const g = Object.create(Game.prototype);
  Object.assign(g, { world, surface: world, hooks: {}, hintsShown: new Set(), logLines: [], actors: [], ships: [], areaZones: [], zones: new Map(), time: 0, slowmo: 1, ui: null, audio: null, env: { time: 0, daylight: 1, day: 1 } });
  g.fx = new FX(g);
  g.combat = new Combat(g);
  g.seaDepth = () => 6;
  g.log = (text) => g.logLines.push({ text });
  return g;
}
function body(g, o = {}) {
  const a = new Actor({ name: o.name || 'Fighter', race: o.race || 'human', attrs: { str: 10, agi: 10, end: 10, vit: 10, wil: 10, ...(o.attrs || {}) }, faction: o.faction || 'pirate', hpMul: o.hpMul || 1, boss: o.boss });
  a.game = g; a.x = X0 + (o.dx || 0); a.y = Y0 + (o.dy || 0); a.facing = o.facing ?? 0;
  if (o.player) { a.isPlayer = true; a.faction = 'player'; g.player = a; }
  if (o.fruit) { a.fruit = o.fruit; a.fruitMastery = o.mastery ?? 100; }
  a.hakiSkill = o.haki || {};
  a.recalc(); a.hp = a.d.maxHp;
  g.actors.push(a);
  return a;
}
/** You (a fruit, mastered) and a foe a couple of steps east, facing you. */
function duel(o = {}) {
  const g = arena(o.arena);
  const you = body(g, { player: true, fruit: o.fruit, mastery: o.mastery, race: o.race, haki: o.haki });
  const foe = body(g, { dx: o.gap ?? 2.2, facing: Math.PI, hpMul: o.foeHp ?? 20, fruit: o.foeFruit, boss: o.boss, race: o.foeRace });
  foe.provoked = true;
  return { g, you, foe };
}
function step(g, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) {
    g.time += dt; g.env.time += dt;
    for (const a of g.actors) if (a.alive) a.update(dt, g);
    g.combat.update(dt);
    g.updateZones(dt);
    g.fx.update(dt);
  }
}
/** Use a technique (on `target`) and play it through. */
function use(g, a, id, target, extra = 0) {
  const ok = a.tryTechnique(id, g, target);
  if (ok) step(g, abilityTotal(getAbility(id)) + extra);
  return ok;
}
const blow = (att, tgt, o = {}) => ({ owner: att, x: att.x, y: att.y - 0.4, shape: 'arc', range: 2, arc: 1.8, angle: Math.atan2(tgt.y - att.y, tgt.x - att.x), damage: 20, knockback: 2, stun: 0.2, critChance: 0, ...o });

// ------------------------------------------------------------------ Ope Ope
test('ROOM opens where it is cast and stays there: the surgeon walks off, the Room does not follow', () => {
  const { g, you } = duel({ fruit: 'ope', mastery: 0 });
  assert.ok(use(g, you, 'ope_room'));
  const z = g.areaZones.find((r) => r.kind === 'room');
  assert.ok(z, 'a zone of kind room');
  assert.equal(z.owner, you);
  assert.ok(Math.abs(z.x - X0) < 0.01 && Math.abs(z.y - Y0) < 0.01, 'centred where it was cast');
  assert.ok(z.r >= 6.5 && z.r < 7, `a little Room at mastery 0 (${z.r})`);
  assert.ok(you.hasBuff('room'), 'its chip on the HUD');
  you.x += 5; step(g, 1);
  assert.equal(z.x, X0, 'it did not follow');
  assert.ok(ownRoom(you, g), 'still inside it, 5 m off its middle');
  you.x += 4; step(g, 0.1);
  assert.equal(ownRoom(you, g), null, 'out of it now');
  // (a bigger Room for a surgeon who's mastered it, and a new one replaces the last)
  you.fruitMastery = 100; you.x = X0; you.cooldowns = {};
  assert.ok(use(g, you, 'ope_room'));
  const rooms = g.areaZones.filter((r) => r.kind === 'room' && r.t > 0);
  assert.equal(rooms.length, 1, 'one Room at a time');
  assert.ok(rooms[0].r >= 9.5, `grown with mastery (${rooms[0].r})`);
  // (it fades with time)
  step(g, 17);
  assert.equal(g.areaZones.filter((r) => r.kind === 'room').length, 0, 'gone after its time');
});

test('a Room technique works only inside your own ROOM, with a word and a flash for why', () => {
  const { g, you, foe } = duel({ fruit: 'ope' });
  for (const id of ['ope_shambles', 'ope_amputate', 'ope_takt', 'ope_mes', 'ope_gamma', 'ope_radio']) {
    assert.equal(canUse(you, getAbility(id)), false, `${id} out of a Room`);
    assert.equal(you.tryTechnique(id, g, foe), false);
  }
  assert.ok(g.logLines.some((l) => /only inside your ROOM/.test(l.text)), 'says why');
  assert.ok(g.hintsShown.has('room'), 'and explains the Room, once');
  use(g, you, 'ope_room');
  for (const id of ['ope_shambles', 'ope_amputate', 'ope_takt', 'ope_mes', 'ope_gamma', 'ope_radio']) assert.ok(canUse(you, getAbility(id)), `${id} inside it`);
  // (someone else's Room is no use to you)
  const other = body(g, { faction: 'player', fruit: 'ope', dx: 1 });
  assert.equal(canUse(other, getAbility('ope_shambles')), false);
});

test('Counter Shock and Injection Shot work anywhere — half as strong outside a Room', () => {
  const hits = {};
  for (const inRoom of [false, true]) {
    const { g, you, foe } = duel({ fruit: 'ope', gap: 1.4 });
    if (inRoom) use(g, you, 'ope_room');
    const hp = foe.hp;
    you.tryTechnique('ope_counter', g, foe);
    const mult = you.action.mult;
    step(g, abilityTotal(getAbility('ope_counter')));
    hits[inRoom] = { dealt: hp - foe.hp, mult };
  }
  assert.ok(hits.false.dealt > 0, 'it lands outside a Room');
  assert.ok(Math.abs(hits.false.mult / hits.true.mult - 0.5) < 1e-9, 'at half the power');
});

test('Shambles: swap places with the foe aimed at inside the Room — the swing they had going is gone', () => {
  const { g, you, foe } = duel({ fruit: 'ope', gap: 5 });
  use(g, you, 'ope_room');
  const a0 = { x: you.x, y: you.y }, b0 = { x: foe.x, y: foe.y };
  // (they're winding up a heavy blow)
  foe.facing = Math.PI;
  startAbility(foe, getAbility('brawl_heavy'), g, you);
  assert.ok(foe.action);
  assert.ok(you.tryTechnique('ope_shambles', g, foe));
  step(g, 0.2);
  assert.ok(Math.abs(you.x - b0.x) < 0.05 && Math.abs(you.y - b0.y) < 0.05, 'you are where they were');
  assert.ok(Math.abs(foe.x - a0.x) < 0.3 && Math.abs(foe.y - a0.y) < 0.3, 'they are where you were');
  assert.equal(foe.action, null, 'their blow is gone');
  assert.ok(foe.hitstun > 0, 'and they reel a moment');
});

test('Shambles with nobody aimed at takes you to the spot, kept inside the Room; nobody outside it can be swapped', () => {
  const { g, you, foe } = duel({ fruit: 'ope', gap: 30 });
  use(g, you, 'ope_room');
  const z = ownRoom(you, g);
  // (aimed far beyond the Room's edge, east: kept inside it)
  assert.ok(you.tryTechnique('ope_shambles', g, { x: X0 + 40, y: Y0 }));
  step(g, 0.2);
  assert.ok(you.x > X0 + 3, `moved east (${you.x - X0})`);
  assert.ok(g.world.distance(z.x, z.y, you.x, you.y) <= z.r, 'still in the Room');
  // the foe, 30 m off, is out of the Room: aiming at them only moves you
  you.x = X0; you.cooldowns = {};
  const fx0 = foe.x;
  you.tryTechnique('ope_shambles', g, foe);
  step(g, 0.2);
  assert.equal(foe.x, fx0, 'no swap with someone outside the Room');
});

test('Takt lifts everyone in the Room into the air, helpless, then slams them down', () => {
  const { g, you, foe } = duel({ fruit: 'ope', gap: 3 });
  const out = body(g, { dx: 25, facing: Math.PI, hpMul: 20 });
  out.provoked = true;
  use(g, you, 'ope_room');
  const hp = foe.hp;
  assert.ok(you.tryTechnique('ope_takt', g, foe));
  step(g, 0.5 + 0.35);
  assert.ok(foe.z > 2, `lifted (${foe.z.toFixed(2)} m)`);
  assert.ok(foe.helpless(), 'held helpless');
  assert.equal(foe.tryM1(g), false, 'no swinging up there');
  assert.equal(out.z || 0, 0, 'nobody outside the Room');
  step(g, 2);
  assert.ok(!(foe.z > 0.02), 'down again');
  assert.ok(foe.hp < hp, 'slammed into the ground');
  assert.ok(!foe.lift && !foe.status.lifted, 'and free');
});

test('Amputate cuts without killing: a foe on a sliver of health is left in pieces, alive', () => {
  const { g, you, foe } = duel({ fruit: 'ope', gap: 2 });
  use(g, you, 'ope_room');
  foe.hp = 3;
  assert.ok(you.tryTechnique('ope_amputate', g, foe));
  step(g, 0.4);
  assert.equal(foe.hp, 1, 'one hit point left');
  assert.equal(foe.state, 'idle', 'not knocked out');
  assert.ok(foe.status.pieces, 'in pieces');
  assert.ok(foe.helpless());
  assert.ok(g.fx.shapes.some((s) => s.type === 'pieces' && s.follow === foe), 'the pieces hang where the body was');
  // (Radio Knife: cut to pieces too, and it can kill)
  step(g, 0.6);
  you.cooldowns = {};
  foe.status = {};
  assert.ok(use(g, you, 'ope_radio', foe));
  assert.notEqual(foe.state, 'idle', 'Radio Knife finishes them');
});

test('Mes takes the heart: helpless a long while — a boss half as long, you never long', () => {
  const { g, you, foe } = duel({ fruit: 'ope', gap: 1.5 });
  use(g, you, 'ope_room');
  assert.ok(you.tryTechnique('ope_mes', g, foe));
  step(g, 0.3);
  assert.ok(foe.status.heartless?.t > 3, 'a long hold');
  assert.ok(g.fx.shapes.some((s) => s.type === 'cube' && s.heart && s.follow === you), 'the heart, in a cube in your hand');
  const hp = foe.hp;
  g.combat.applyHit(you, foe, blow(you, foe, { damage: 10 }));
  assert.ok(hp - foe.hp > Math.round(10 * (1 - foe.d.def)), 'blows land harder on a body without its heart');
  // a boss, and you
  const boss = body(g, { dx: 2, boss: true });
  boss.addStatus('heartless', 3.5, you);
  assert.ok(Math.abs(boss.status.heartless.t - 1.75) < 1e-9);
  const p = body(g, { dx: -2 }); p.isPlayer = true;
  p.addStatus('heartless', 3.5, foe);
  assert.ok(p.status.heartless.t <= 1.8);
});

test('Room blows reach a Logia body; plain ones pass through it; a rubber fist lands on lightning', () => {
  const { g, you, foe } = duel({ fruit: 'ope', foeFruit: 'moku', gap: 2 });
  let hp = foe.hp;
  g.combat.applyHit(you, foe, blow(you, foe));
  assert.equal(foe.hp, hp, 'smoke: the blow passes through');
  use(g, you, 'ope_room');
  hp = foe.hp;
  use(g, you, 'ope_amputate', foe);
  assert.ok(foe.hp < hp, 'the surgeon cuts smoke');
  // Luffy on Enel
  const d = duel({ fruit: 'gomu', foeFruit: 'goro', gap: 1.5 });
  hp = d.foe.hp;
  d.g.combat.applyHit(d.you, d.foe, blow(d.you, d.foe));
  assert.ok(d.foe.hp < hp, 'rubber touches lightning');
  // (and lightning does nothing to rubber)
  hp = d.you.hp;
  d.g.combat.applyHit(d.foe, d.you, blow(d.foe, d.you, { element: 'lightning' }));
  assert.equal(d.you.hp, hp);
});

test('the Room goes when its surgeon falls', () => {
  const { g, you } = duel({ fruit: 'ope' });
  use(g, you, 'ope_room');
  you.knockOut(g, null);
  step(g, 0.1);
  assert.equal(g.areaZones.filter((z) => z.kind === 'room' && z.t > 0).length, 0);
});

test('an NPC surgeon opens a ROOM before anything else, and cuts inside it', () => {
  const { g, you, foe } = duel({ fruit: 'ope', gap: 3 });
  // (the foe is the surgeon here)
  foe.fruit = 'ope'; foe.fruitMastery = 100;
  const ctl = new AIController({ kind: 'hostile', moves: ['ope_room', 'ope_shambles', 'ope_amputate', 'ope_takt', 'ope_mes'], skill: 0, aggression: 1 });
  foe.controller = ctl; ctl.target = you; ctl.state = 'chase';
  you.invulnerable = true; // (it's the surgeon's choices we're after)
  let first = null;
  const used = new Set();
  for (let i = 0; i < 900 && used.size < 3; i++) {
    step(g, 1 / 30);
    const id = foe.action?.def.id;
    if (id) { if (!first) first = id; used.add(id); }
  }
  assert.equal(first, 'ope_room', 'the Room first');
  assert.ok([...used].some((id) => id !== 'ope_room'), `then the techniques (${[...used]})`);
});

// ------------------------------------------------------------------ other fruits
test('Ice Age freezes the sea into a road; when it thaws, a Devil Fruit user is back in the water', () => {
  const g = arena({ seaFrom: X0 + 2 });
  const you = body(g, { player: true, fruit: 'hie' });
  you.x = X0 + 1;
  assert.ok(!you.canOccupy(g.world, X0 + 4, Y0), 'a Devil Fruit user won\'t walk into the sea');
  use(g, you, 'hie_ageand');
  assert.ok(iceAt(g, X0 + 4, Y0), 'ice over the water');
  assert.ok(you.canOccupy(g.world, X0 + 4, Y0), 'a road of ice');
  you.x = X0 + 4; step(g, 0.5);
  assert.equal(you.inWater, false, 'standing on the frozen sea');
  step(g, 13);
  assert.equal(iceAt(g, X0 + 4, Y0), false, 'thawed');
  assert.equal(you.inWater, true, 'back in the sea');
});

test('a Black Hole swallows shots; Liberation lets them out', () => {
  const { g, you, foe } = duel({ fruit: 'yami', gap: 6 });
  use(g, you, 'yami_blackhole');
  assert.ok(g.areaZones.some((z) => z.absorb));
  // a foe shoots into the darkness
  const p = g.combat.projectile({ owner: foe, x: foe.x - 0.5, y: Y0 - 0.5, vx: -20, vy: 0, range: 12, radius: 0.3, damage: 40, element: 'physical', isProj: true });
  step(g, 0.5);
  assert.equal(p.alive, false, 'swallowed');
  assert.ok(you.absorbed > 0, 'stored up');
  assert.equal(you.hp, you.d.maxHp, 'and nothing reached you');
  you.cooldowns = {};
  const stored = you.absorbed;
  foe.x = you.x + 2;
  const hp = foe.hp;
  use(g, you, 'yami_liberation', foe);
  assert.equal(you.absorbed, 0, 'let out');
  assert.ok(hp - foe.hp > 0 && stored > 0);
});

test('a barrier stops what comes at its front — not from behind; a Barrier Ball stops everything', () => {
  const { g, you, foe } = duel({ fruit: 'bari', gap: 1.5 });
  you.facing = 0; // (toward the foe)
  use(g, you, 'bari_barrier');
  let hp = you.hp;
  assert.equal(g.combat.applyHit(foe, you, blow(foe, you, { heavy: true, guardBreak: true })), false);
  assert.equal(you.hp, hp, 'nothing gets through the front');
  you.facing = Math.PI; // (turned away)
  g.combat.applyHit(foe, you, blow(foe, you));
  assert.ok(you.hp < hp, 'from behind, it does');
  // a shot that goes through people stops at it
  you.facing = 0; hp = you.hp;
  const p = g.combat.projectile({ owner: foe, x: foe.x - 0.3, y: Y0 - 0.5, vx: -20, vy: 0, range: 12, radius: 0.3, damage: 30, pierce: true, isProj: true });
  step(g, 0.3);
  assert.ok(you.hp >= hp, 'the shot hurt nobody');
  assert.equal(p.alive, false, 'the shot stops dead');
  // the ball: all round, and nothing to do inside it
  you.cooldowns = {}; you.buffs = [];
  use(g, you, 'bari_ball', null, -0.2);
  you.facing = Math.PI; hp = you.hp;
  g.combat.applyHit(foe, you, blow(foe, you));
  assert.equal(you.hp, hp);
  assert.equal(you.tryM1(g), false, 'no swinging out of it');
});

test('Repel sends a shot back at whoever fired it', () => {
  const { g, you, foe } = duel({ fruit: 'nikyu', gap: 8 });
  you.tryTechnique('nikyu_repel', g, foe);
  step(g, 0.05);
  const hpF = foe.hp, hpY = you.hp;
  const p = g.combat.projectile({ owner: foe, x: foe.x - 0.5, y: Y0 - 0.5, vx: -18, vy: 0, range: 14, radius: 0.3, damage: 25, isProj: true });
  step(g, 1.2);
  assert.equal(you.hp, hpY, 'it never reached you');
  assert.equal(p.owner, you, 'it is yours now');
  assert.ok(foe.hp < hpF, 'and it hit them');
});

test('the Birdcage lets nobody out, and closes in', () => {
  const { g, you, foe } = duel({ fruit: 'ito', gap: 4 });
  use(g, you, 'ito_birdcage');
  const z = g.areaZones.find((c) => c.cage);
  assert.ok(z);
  const r0 = z.r;
  // the foe makes a run for it
  foe.x = X0 + 15;
  step(g, 0.1);
  assert.ok(g.world.distance(z.x, z.y, foe.x, foe.y) <= z.r, 'back inside the strings');
  step(g, 4);
  assert.ok(z.r < r0 * 0.85, `closing in (${z.r.toFixed(2)} of ${r0})`);
});

test('without a shadow the sun burns — not in the dark, not indoors', () => {
  const { g, you, foe } = duel({ fruit: 'kage', gap: 2 });
  use(g, you, 'kage_steal', foe);
  assert.ok(foe.status.shadowless);
  let hp = foe.hp;
  step(g, 3);
  assert.ok(foe.hp < hp, 'burning in the daylight');
  g.env.daylight = 0.1; foe.addStatus('shadowless', 12, you);
  hp = foe.hp;
  step(g, 3);
  assert.equal(foe.hp, hp, 'safe at night');
});

test('a mochi body lets some blows through — never one coated in Haki', () => {
  const { g, you, foe } = duel({ foeFruit: 'mochi', gap: 1.5 });
  let passed = 0;
  for (let i = 0; i < 200; i++) { foe.hp = foe.d.maxHp; foe.iframes = 0; if (!g.combat.applyHit(you, foe, blow(you, foe))) passed++; }
  assert.ok(passed > 30 && passed < 110, `about a third pass through (${passed}/200)`);
  you.armament = true; passed = 0;
  for (let i = 0; i < 100; i++) { foe.iframes = 0; if (!g.combat.applyHit(you, foe, blow(you, foe))) passed++; }
  assert.equal(passed, 0);
});

test('a quake throws them off their feet; Send Flying sends them clean off the field', () => {
  const { g, you, foe } = duel({ fruit: 'gura', gap: 2 });
  use(g, you, 'gura_kaishin', foe, -0.3);
  assert.ok(foe.z > 0.3 || foe.vz > 0, 'thrown into the air');
  const d = duel({ fruit: 'nikyu', gap: 1.4 });
  const x0 = d.foe.x;
  use(d.g, d.you, 'nikyu_travel', d.foe, 1.5);
  assert.ok(d.foe.x - x0 > 15, `repelled far off (${(d.foe.x - x0).toFixed(1)} m)`);
});

// ------------------------------------------------------------------ peoples
test('a Longleg\'s kicks hit 30% harder; a Skypiean\'s Dial 25%; a Longarm\'s bare jab snaps back quicker', () => {
  const { g } = duel();
  const kick = getAbility('bleg_1'), jab = getAbility('brawl_1'), dial = getAbility('dial_impact');
  const human = body(g, {}), longleg = body(g, { race: 'longleg' }), sky = body(g, { race: 'skypiean' }), longarm = body(g, { race: 'longarm' });
  for (const a of [human, longleg, sky, longarm]) { a.attrs = { ...human.attrs }; a.recalc(); }
  const { powerFor } = { powerFor: (a, d) => { startAbility(a, d, g); const m = a.action.mult; a.action = null; return m; } };
  assert.ok(Math.abs(powerFor(longleg, kick) / powerFor(human, kick) - 1.3) < 1e-6, 'kicks');
  assert.ok(Math.abs(powerFor(longleg, jab) / powerFor(human, jab) - 1) < 1e-6, 'not punches');
  assert.ok(Math.abs(powerFor(sky, dial) / powerFor(human, dial) - 1.25) < 1e-6, 'dials');
  startAbility(human, { ...jab, m1Chain: true }, g); const t0 = human.action.total; human.action = null;
  startAbility(longarm, { ...jab, m1Chain: true }, g); const t1 = longarm.action.total; longarm.action = null;
  assert.ok(Math.abs(t1 / t0 - 0.8) < 1e-6, 'the second elbow');
});

test('a Buccaneer shrugs off a light blow, and knockback hardly moves him', () => {
  const { g, you, foe } = duel({ foeRace: 'buccaneer' });
  g.combat.applyHit(you, foe, blow(you, foe, { stun: 0.3, knockback: 4 }));
  assert.equal(foe.hitstun, 0, 'no stagger from a light blow');
  const kb = Math.hypot(foe.kb.x, foe.kb.y);
  const human = body(g, { dx: 2 });
  g.combat.applyHit(you, human, blow(you, human, { stun: 0.3, knockback: 4 }));
  assert.ok(human.hitstun > 0);
  assert.ok(kb < Math.hypot(human.kb.x, human.kb.y) * 0.75, 'and barely shoved');
  // (a heavy blow still staggers him)
  g.combat.applyHit(you, foe, blow(you, foe, { stun: 0.8, guardBreak: true }));
  assert.ok(foe.hitstun > 0);
});

test('a Mink\'s bare blows shock now and then; under the full moon, in a fight, Sulong', () => {
  const { g, you, foe } = duel({ race: 'mink', gap: 1.2 });
  let shocks = 0;
  for (let i = 0; i < 200; i++) { delete foe.status.shock; foe.iframes = 0; g.combat.applyHit(you, foe, blow(you, foe, { def: { m1Chain: true } })); if (foe.status.shock) shocks++; }
  assert.ok(shocks > 25 && shocks < 100, `sometimes (${shocks}/200)`);
  // the full moon
  you.inCombat = true;
  Object.assign(g.env, { fullMoon: false, isNight: true });
  step(g, 0.2);
  assert.ok(!you.hasBuff('sulong'), 'not without the full moon');
  Object.assign(g.env, { fullMoon: true, isNight: true, day: 8 });
  step(g, 0.2);
  assert.ok(you.hasBuff('sulong'), 'SULONG');
  you.buffs = []; you.recalc();
  step(g, 0.2);
  assert.ok(!you.hasBuff('sulong'), 'once a night');
});

test('a Lunarian\'s flame: it sets foes alight, halves the harm done her, goes out in the sea and lights again once she\'s dry', () => {
  const g = arena({ seaFrom: X0 + 3 });
  const you = body(g, { player: true, race: 'lunarian' });
  const foe = body(g, { dx: 1.2, facing: Math.PI, hpMul: 20 });
  foe.provoked = true;
  let burns = 0;
  for (let i = 0; i < 200; i++) { delete foe.status.burn; foe.iframes = 0; g.combat.applyHit(you, foe, blow(you, foe)); if (foe.status.burn) burns++; }
  assert.ok(burns > 20 && burns < 90, `ignition (${burns}/200)`);
  let hp = you.hp;
  g.combat.applyHit(foe, you, blow(foe, you, { damage: 40 }));
  const lit = hp - you.hp;
  you.x = X0 + 6; step(g, 0.5);
  assert.ok(you.inWater && you.flameLit === false, 'the sea puts it out');
  you.x = X0; you.y = Y0; step(g, 0.5);
  hp = you.hp; you.iframes = 0;
  g.combat.applyHit(foe, you, blow(foe, you, { damage: 40 }));
  assert.ok(hp - you.hp > lit * 1.5, 'no shield while it\'s out');
  step(g, 7);
  assert.equal(you.flameLit, true, 'lit again');
});

test('a Fish-Man swimming hard leaps out of the sea like a dolphin', () => {
  const g = arena({ seaFrom: X0 - 50 });
  const fm = body(g, { player: true, race: 'fishman' });
  fm.gills = true;
  step(g, 0.5);
  assert.ok(fm.inWater);
  fm.intent.mx = 1; fm.moving = true;
  assert.ok(fm.tryJump(g, 1));
  assert.ok(fm.dash && fm.dash.vx > 5, 'on forward, out of the water');
});
