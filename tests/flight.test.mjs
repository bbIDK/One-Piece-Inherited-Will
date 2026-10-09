// Flight (game/flight.js): those who fly in canon take off with a second
// press of Space in the air, climb with Space and dive with C, and land by
// coming down onto something. Their gauge drains in the air — far faster
// over the open sea, where it never refills — and fills again on the ground;
// run dry and they come down, into the sea if that's where they are (a
// Devil Fruit user sinks). Cliffs and buildings are walls, the sky has a
// ceiling (a low one over the sea). A blow reaches only what's level with
// it, so a flier swoops onto what it swings at; a shot reaches a flier, and
// a heavy blow knocks one out of the sky. Geppo is a few kicks off the air.
import { test } from 'node:test';
import { legacyV } from '../src/game/physics.js';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../src/game/game.js');
const { Actor } = await import('../src/game/actor.js');
const { Combat } = await import('../src/game/combat.js');
const { FX } = await import('../src/game/fx.js');
const { PlayerController } = await import('../src/game/playerController.js');
const { AIController } = await import('../src/game/ai.js');
const { flightOf, takeOff, cantTakeOff, airStep, geppoSteps, feetOf } = await import('../src/game/flight.js');
const { T } = await import('../src/world/tiles.js');
await import('../src/data/styles.js');
await import('../src/data/fruits.js');
await import('../src/data/haki.js');
await import('../src/content/index.js');

const X0 = 20000, Y0 = 2000;
/**
 * Flat grass in the Blues (east of `seaFrom`, the open sea), seen through a
 * 3D view that knows the ground's height (`ground(x)`: a cliff, say) and a
 * building's roof (`roof`: { x0, x1, y0, y1, h }).
 */
function arena(o = {}) {
  const sea = (x) => o.seaFrom !== undefined && x >= o.seaFrom;
  const world = {
    width: 24576, height: 12288, zone: o.zone ?? 0, quays: new Set(), islands: [],
    dx: (a, b) => b - a, wx: (x) => x, distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dist2: (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2,
    type: (x) => (sea(x) ? T.SEA : T.GRASS), solid: () => false, walkable: (x) => !sea(x), isBlocked: () => false, hitsProp: () => false,
    speedAt: () => 1, isLiquid: (x) => sea(x), isOverlay: () => false, damageAt: () => 0, isQuay: () => false,
    interiorAt: o.indoors ? () => ({}) : () => null, roomOf: () => null,
  };
  const g = Object.create(Game.prototype);
  Object.assign(g, { world, surface: world, hooks: {}, hintsShown: new Set(), logLines: [], actors: [], ships: [], areaZones: [], zones: new Map(), time: 0, slowmo: 1, ui: null, audio: null, env: { time: 0, daylight: 1, day: 1 } });
  g.fx = new FX(g);
  g.combat = new Combat(g);
  g.seaDepth = () => 6;
  g.log = (text) => g.logLines.push({ text });
  const R = o.roof;
  g.view3d = {
    ground: (x) => (sea(x) ? 0 : o.ground ? o.ground(x) : 0),
    roofAt: (x, y, under = Infinity) => (R && x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1 && R.h <= under ? { h: R.h, b: null } : null),
  };
  return g;
}
function body(g, o = {}) {
  const a = new Actor({ name: o.name || 'Flier', race: o.race || 'human', attrs: { str: 10, agi: 10, end: 10, vit: 10, wil: 10 }, faction: o.faction || 'pirate', hpMul: o.hpMul || 1, boss: o.boss });
  a.game = g; a.x = X0 + (o.dx || 0); a.y = Y0 + (o.dy || 0); a.facing = o.facing ?? 0;
  if (o.player) { a.isPlayer = true; a.faction = 'player'; g.player = a; }
  if (o.fruit) { a.fruit = o.fruit; a.fruitMastery = o.mastery ?? 100; }
  if (o.techniques) a.techniques = o.techniques;
  a.recalc(); a.hp = a.d.maxHp;
  g.actors.push(a);
  return a;
}
function step(g, seconds, each = null, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) {
    if (each) each();
    g.time += dt; g.env.time += dt;
    for (const a of g.actors) if (a.alive) a.update(dt, g);
    g.combat.update(dt);
    g.updateZones(dt);
    g.fx.update(dt);
  }
}
/** Up into the air from a standing jump: hop, and Space again on the way up. */
function fly(g, a) {
  const pc = new PlayerController(g);
  assert.ok(a.tryJump(g, 0), 'a hop');
  step(g, 0.1);
  assert.ok(pc.airPress(a, g), 'Space again, in the air');
  return pc;
}

test('who flies: the Phoenix and the Dragon, Logia riders — from the first bite, longer with mastery — a Lunarian always; a Skypiean or a plain human never', () => {
  const g = arena();
  assert.equal(flightOf(body(g, {})), null);
  assert.equal(flightOf(body(g, { race: 'skypiean' })), null, 'a Skypiean\'s wings are too small');
  assert.equal(flightOf(body(g, { race: 'lunarian' })).style, 'wings');
  // (a fruit's flight is part of its base set: yours on eating it — its mastery keeps you up longer)
  const S = { tori_phoenix: 'phoenix', uo_seiryu: 'dragon', moku: 'ride', suna: 'ride', zushi: 'ride', pika: 'float', ito: 'float' };
  for (const [fruit, style] of Object.entries(S)) {
    const fresh = flightOf(body(g, { fruit, mastery: 0 })), master = flightOf(body(g, { fruit, mastery: 100 }));
    assert.equal(fresh.style, style, `${fruit} at mastery 0`);
    assert.ok(master.gauge > fresh.gauge, `${fruit}: longer once mastered (${fresh.gauge} → ${master.gauge})`);
    assert.equal(flightOf(body(g, { fruit, mastery: 40 })).gauge, master.gauge, `${fruit}: as long as it gets by 40`);
  }
  assert.equal(flightOf(body(g, { fruit: 'moku' })).ride, 'smoke');
  assert.equal(flightOf(body(g, { fruit: 'zushi' })).ride, 'rock');
  for (const fruit of ['gomu', 'mera', 'hie', 'goro', 'magu', 'ope', 'bara']) assert.equal(flightOf(body(g, { fruit })), null, `${fruit} doesn't fly`);
  // (a Lunarian who eats the Phoenix flies as the Phoenix: the longer flight)
  assert.equal(flightOf(body(g, { race: 'lunarian', fruit: 'tori_phoenix' })).style, 'phoenix');
});

test('taking off: a hop and Space again; flying sets flying, flightStyle and a gauge — and lands again on the ground', () => {
  const g = arena();
  const p = body(g, { player: true, race: 'lunarian' });
  const pc = new PlayerController(g);
  assert.equal(pc.airPress(p, g), false, 'on the ground, Space is a jump');
  fly(g, p);
  assert.equal(p.flying, true);
  assert.equal(p.flightStyle, 'wings');
  assert.ok(p.flight && p.flightGauge === 1);
  assert.ok(p.takeoffT >= 0, 'the take-off moment, for the animation');
  p.intent.mz = 1;
  step(g, 1);
  assert.ok(p.alt > 4, `climbing (${p.alt.toFixed(1)} m)`);
  assert.ok(p.flightClimb > 0);
  assert.equal(p.z, p.alt, 'height over flat ground');
  // across the sky, leaning into a turn
  p.intent.mz = 0; p.intent.mx = 1;
  step(g, 1);
  assert.ok(p.x > X0 + 5 && p.flightSpeed > 5, 'flying east');
  p.intent.mx = 0; p.intent.my = 1;
  step(g, 0.3);
  assert.ok(Math.abs(p.flightBank) > 0.05, 'banking into the turn');
  // down with C, and onto the ground
  p.intent.my = 0; p.intent.mz = -1;
  step(g, 3);
  assert.equal(p.flying, false, 'landed');
  assert.equal(p.flightStyle, null);
  assert.ok(!(p.z > 0.05) && !p.vz, 'on its feet');
  assert.ok(p.landT > p.takeoffT);
});

test('a double tap of Space in the air lands you', () => {
  const g = arena();
  const p = body(g, { player: true, race: 'lunarian' });
  const pc = fly(g, p);
  p.intent.mz = 1; step(g, 1); p.intent.mz = 0;
  g.time += 0.5;
  pc.airPress(p, g); g.time += 0.1; pc.airPress(p, g);
  assert.ok(p.flight.landing);
  step(g, 3);
  assert.equal(p.flying, false);
});

test('the gauge drains in the air — several times faster over the open sea — and fills up on the ground', () => {
  const g = arena({ seaFrom: X0 + 30 });
  const p = body(g, { player: true, race: 'lunarian' });
  fly(g, p);
  step(g, 5);
  const land = 1 - p.flightGauge;
  assert.ok(land > 0.15 && land < 0.35, `over land: ${land.toFixed(2)} of it in 5 s`);
  p.x = X0 + 40;
  const g0 = p.flightGauge;
  step(g, 2);
  const sea = (g0 - p.flightGauge) / 2;
  assert.ok(sea > land / 5 * 3, `over the sea: ${(sea * 100).toFixed(1)}%/s against ${(land / 5 * 100).toFixed(1)}%/s`);
  // home, down, and it fills up again
  p.x = X0; p.intent.mz = -1;
  for (let i = 0; i < 120 && p.flying; i++) step(g, 1 / 30);
  assert.equal(p.flying, false);
  const low = p.flightGauge;
  p.intent.mz = 0;
  step(g, 2);
  assert.ok(p.flightGauge > low + 0.25, `refilling on the ground (${low.toFixed(2)} → ${p.flightGauge.toFixed(2)})`);
  step(g, 6);
  assert.equal(p.flightGauge, 1);
});

test('run dry over the open sea and you come down into it — a Devil Fruit user sinks', () => {
  const g = arena({ seaFrom: X0 + 3 });
  const p = body(g, { player: true, fruit: 'tori_phoenix' });
  fly(g, p);
  p.intent.mz = 1; step(g, 0.8); p.intent.mz = 0;
  p.x = X0 + 20;
  p.flightGauge = 0.04;
  step(g, 1);
  assert.ok(p.flightTired, 'run dry');
  assert.ok(g.logLines.some((l) => /open sea/.test(l.text)));
  // (no climbing out of it)
  p.intent.mz = 1;
  step(g, 6);
  assert.equal(p.flying, false, 'down');
  assert.ok(p.inWater, 'in the sea');
  step(g, p.struggleTime() + 1);
  assert.ok(p.sinking, 'and the sea takes a Devil Fruit user down');
});

test('a ceiling over the land, a lower one over the sea; a cliff and a building are walls you fly over', () => {
  const g = arena({ seaFrom: X0 + 200, ground: (x) => (x > X0 + 10 ? 12 : 0), roof: { x0: X0 - 40, x1: X0 - 10, y0: Y0 - 8, y1: Y0 + 8, h: 6 } });
  const p = body(g, { player: true, race: 'lunarian' });
  fly(g, p);
  // into the cliff, low down
  p.intent.mz = 0; p.intent.mx = 1;
  step(g, 3);
  assert.ok(p.x < X0 + 10.3, `the cliff stops you (${(p.x - X0).toFixed(2)})`);
  // over it, higher up
  p.intent.mx = 0; p.intent.mz = 1; step(g, 2.5); p.intent.mz = 0;
  assert.ok(p.alt > 12.5);
  p.intent.mx = 1; step(g, 2);
  assert.ok(p.x > X0 + 12, 'over the top');
  assert.ok(Math.abs(p.z - (p.alt - 12)) < 1e-6, 'its height over the clifftop');
  // the ceiling
  p.intent.mx = 0; p.intent.mz = 1;
  step(g, 12);
  assert.ok(p.alt <= 12 + flightOf(p).ceiling + 1e-6, `${p.alt.toFixed(1)} m: no higher than the ceiling`);
  // a building: a wall below its roof; you can come down on it
  p.flightGauge = 1; p.flight.tired = false; p.flightTired = false;
  p.x = X0 - 2; p.alt = 3; p.intent.mz = 0; p.intent.mx = -1;
  step(g, 2);
  assert.ok(p.x > X0 - 10.3, 'its wall stops you');
  p.intent.mx = 0; p.intent.mz = 1; step(g, 1); p.intent.mz = 0;
  p.intent.mx = -1; step(g, 1.2); p.intent.mx = 0;
  assert.ok(p.x < X0 - 11, 'over the roof');
  p.intent.mz = -1; step(g, 3);
  assert.equal(p.flying, false, 'landed');
  assert.ok(Math.abs(feetOf(p, g) - 6) < 0.3, `on the roof (${feetOf(p, g).toFixed(2)} m)`);
  // over the open sea the ceiling's low
  const s = arena({ seaFrom: X0 - 100 });
  const q = body(s, { player: true, race: 'lunarian' });
  q.x = X0 - 102;
  fly(s, q);
  q.x = X0; q.intent.mz = 1;
  step(s, 4);
  assert.ok(q.alt <= 14.01, `over the sea: ${q.alt.toFixed(1)} m`);
});

test('a heavy blow knocks a flier out of the sky; Seastone grounds a fruit\'s flight but not a Lunarian\'s wings', () => {
  const g = arena();
  const p = body(g, { player: true, fruit: 'tori_phoenix' });
  const foe = body(g, { dx: 1, facing: Math.PI });
  foe.provoked = true;
  fly(g, p);
  step(g, 0.3);
  g.combat.applyHit(foe, p, { owner: foe, x: foe.x, y: foe.y - 0.4, shape: 'arc', range: 3, arc: 2, angle: Math.PI, damage: 10, heavy: true, stun: 0.7, critChance: 0, reachZ: 99 });
  assert.equal(p.flying, false, 'downed');
  step(g, 2);
  p.cooldowns = {};
  fly(g, p);
  p.addStatus('seastone', 3);
  step(g, 0.1);
  assert.equal(p.flying, false, 'Seastone: the fruit\'s power is gone');
  assert.equal(cantTakeOff(p, g), 'seastone');
  const l = body(g, { player: true, race: 'lunarian', dx: 5 });
  fly(g, l);
  l.addStatus('seastone', 3);
  step(g, 0.3);
  assert.equal(l.flying, true, 'wings are wings');
});

test('in the air a blow reaches only what\'s about level with it; a shot reaches a flier; a flier swoops onto what it swings at', () => {
  const g = arena();
  const p = body(g, { player: true, race: 'lunarian' });
  const foe = body(g, { dx: 1.2, facing: Math.PI, hpMul: 10 });
  foe.provoked = true;
  fly(g, p);
  p.intent.mz = 1; step(g, 1); p.intent.mz = 0;
  assert.ok(p.alt > 5);
  const swing = { owner: foe, x: foe.x, y: foe.y - 0.4, shape: 'arc', range: 2, arc: 2, angle: Math.PI, damage: 10 };
  assert.equal(g.combat.canHit(foe, p, swing), false, 'no reaching up there with a fist');
  assert.equal(g.combat.canHit(foe, p, { ...swing, vx: -10, vy: 0 }), true, 'a shot does');
  assert.equal(g.combat.canHit(foe, p, { ...swing, shape: 'line' }), true, 'a beam does');
  // (a field on the ground doesn't touch a flier well above it)
  assert.equal(g.combat.canHit(foe, p, { zone: {}, x: foe.x, y: foe.y - 0.4 }), false);
  // swooping: a swing at the foe below brings you down to them
  const hp = foe.hp;
  p.facing = 0;
  assert.ok(p.tryHeavy(g));
  step(g, 0.6);
  assert.ok(p.alt < 2, `swooped down (${p.alt.toFixed(2)} m)`);
  assert.ok(foe.hp < hp, 'and the blow landed');
});

test('a Phoenix Brand from the sky dives onto its target', () => {
  const g = arena();
  const p = body(g, { player: true, fruit: 'tori_phoenix' });
  const foe = body(g, { dx: 5, facing: Math.PI, hpMul: 10 });
  foe.provoked = true;
  fly(g, p);
  p.intent.mz = 1; step(g, 1.2); p.intent.mz = 0;
  const hp = foe.hp;
  p.facing = 0;
  assert.ok(p.tryTechnique('phoenix_brand', g, foe));
  step(g, 1);
  assert.ok(p.alt < 1.5, `down onto them (${p.alt.toFixed(2)} m)`);
  assert.ok(foe.hp < hp, 'and the kick landed');
});

test('Geppo: a few kicks off the air in one jump, and they come back on landing', () => {
  const g = arena();
  const p = body(g, { player: true, techniques: ['roku_geppo'] });
  p.masteries = { rokushiki: 0 };
  assert.equal(geppoSteps(p), 2);
  assert.ok(p.tryJump(g, 0));
  step(g, 0.15);
  assert.ok(airStep(p, g));
  assert.equal(p.flightStyle, 'geppo');
  assert.ok(!p.flying, 'not true flight');
  assert.ok(p.vz > legacyV(5) && p.airStepT >= 0);
  step(g, 0.2);
  assert.ok(airStep(p, g), 'a second');
  step(g, 0.2);
  assert.equal(airStep(p, g), false, 'no third at this mastery');
  step(g, 3);
  assert.equal(p.flightStyle, null, 'down: the style goes');
  assert.equal(p.airSteps, 0, 'and the kicks come back');
  p.masteries.rokushiki = 70;
  assert.equal(geppoSteps(p), 4, 'more with mastery');
  assert.equal(geppoSteps(body(g, {})), 0, 'nobody else');
});

test('no sky indoors, under the sea or in a prison', () => {
  for (const [o, why] of [[{ indoors: true }, 'indoors'], [{ zone: 2 }, 'nosky'], [{ zone: 3 }, 'nosky']]) {
    const g = arena(o);
    const p = body(g, { player: true, race: 'lunarian' });
    assert.equal(cantTakeOff(p, g), why);
    assert.equal(takeOff(p, g), false);
  }
});

test('a foe on wings takes to the air after a target that has', () => {
  const g = arena();
  const p = body(g, { player: true, race: 'lunarian' });
  fly(g, p);
  p.intent.mz = 1; step(g, 1); p.intent.mz = 0;
  const king = body(g, { race: 'lunarian', dx: 4, facing: Math.PI, hpMul: 10 });
  king.provoked = true;
  const ctl = new AIController({ kind: 'hostile', moves: [], skill: 0 });
  king.controller = ctl; ctl.target = p; ctl.state = 'chase';
  p.invulnerable = true;
  step(g, 2, () => { p.intent.mz = 0; });
  assert.equal(king.flying, true, 'up after them');
  assert.ok(Math.abs(king.alt - p.alt) < 2.5, `level with them (${king.alt.toFixed(1)} vs ${p.alt.toFixed(1)})`);
  // they land: so does he
  p.intent.mz = -1;
  step(g, 3, () => { p.intent.mz = -1; });
  assert.equal(p.flying, false);
  step(g, 6);
  assert.equal(king.flying, false, 'down after them');
});
