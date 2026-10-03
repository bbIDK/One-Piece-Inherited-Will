// The guard and the fair fight: a parry is a fresh press of F just before a
// blow lands (mashing doesn't count), perfect at the very start; a parried
// foe reels and your next blow on them is a counter; guard-breaking blows
// can't be parried, blasts neither; a sword turns shots aside. Foes in the
// four Blues wind up long enough to read, glint before the blow lands, hit
// softer, never parry and space out their guard-breaking blows, and nobody
// can hold you helpless for long. (How it plays as a whole: tools/duel.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../src/game/game.js');
const { Actor } = await import('../src/game/actor.js');
const { Combat, parryWindow, blowWeight } = await import('../src/game/combat.js');
const { FX } = await import('../src/game/fx.js');
const { TIERS, PARRY, tierAt, stretchWindup } = await import('../src/game/difficulty.js');
const { getAbility, updateAbility, breaksGuard } = await import('../src/game/abilities.js');
const { AIController } = await import('../src/game/ai.js');
const { T } = await import('../src/world/tiles.js');
await import('../src/data/styles.js');
await import('../src/data/fruits.js');
await import('../src/data/haki.js');
await import('../src/content/index.js');

const SEAS = { blue: { x: 20000, y: 2000 }, paradise: { x: 20000, y: 6000 }, newWorld: { x: 6000, y: 6000 } };

/** Just enough of a game to fight in, on open flat ground in one of the seas. */
function arena(sea = 'blue') {
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
  g.at = SEAS[sea];
  return g;
}
/** Someone in the arena: the player (you) or a foe, `dx` tiles east of the spot. */
function body(g, o = {}) {
  const a = new Actor({ name: o.name || 'Fighter', race: 'human', attrs: { str: 5, agi: 5, end: 5, vit: 5, wil: 5, ...(o.attrs || {}) }, boss: o.boss, style: o.style || 'brawler', faction: o.faction || 'pirate' });
  a.game = g; a.x = g.at.x + (o.dx || 0); a.y = g.at.y; a.facing = o.facing ?? 0;
  if (o.player) { a.isPlayer = true; a.faction = 'player'; g.player = a; }
  if (o.sword) { a.weapon = { kind: 'sword', power: 1, count: 1 }; a.drawn = true; }
  g.actors.push(a);
  return a;
}
/** A duel: you facing east, a foe a step east of you facing you. */
function duel(sea = 'blue', o = {}) {
  const g = arena(sea);
  const you = body(g, { player: true, ...(o.you || {}) });
  const foe = body(g, { dx: 1.2, facing: Math.PI, ...(o.foe || {}) });
  foe.provoked = true;
  return { g, you, foe };
}
/** A blow from `att` at `tgt` (a hitbox like a technique's, aimed straight at them). */
const blow = (att, tgt, o = {}) => ({ owner: att, x: att.x, y: att.y - 0.4, shape: 'arc', range: 2, arc: 1.8, angle: Math.atan2(tgt.y - att.y, tgt.x - att.x), damage: 20, knockback: 2, stun: 0.3, ...o });
/** Raise your guard on a fresh press, `ago` seconds before the blow lands. */
function guardUp(a, ago) { a.setBlock(true); a.blockTime = ago; }
const step = (a, dt, g, n = 1) => { for (let i = 0; i < n; i++) { g.time += dt; g.env.time += dt; a.update(dt, g); } };

test('the parry window: generous in the Blues, tighter in Paradise and the New World, wider with Observation Haki', () => {
  for (const [sea, w] of [['blue', 0.3], ['paradise', 0.25], ['newWorld', 0.21]]) {
    const { g, you, foe } = duel(sea);
    assert.equal(tierAt(g, you.x, you.y).id, sea);
    const pw = parryWindow(g, foe, you);
    assert.ok(Math.abs(pw.window - w) < 0.02, `${sea}: ${pw.window}`);
    assert.ok(pw.perfect > 0.05 && pw.perfect < pw.window / 2);
    you.observation = true;
    assert.ok(Math.abs(parryWindow(g, foe, you).window - pw.window - PARRY.observation) < 1e-9);
  }
  // (a far stronger foe is harder to read: the window narrows, but never below 85% of the tier's)
  const { g, you, foe } = duel('blue', { foe: { attrs: { str: 60, agi: 60, end: 60, vit: 60, wil: 60 } } });
  const pw = parryWindow(g, foe, you);
  assert.ok(pw.window < 0.3 && pw.window >= 0.3 * 0.85 - 1e-9, `${pw.window}`);
});

test('a fresh press just before the blow lands parries it: no damage, the attacker reels and you have a counter', () => {
  const { g, you, foe } = duel();
  const hp = you.hp;
  guardUp(you, 0.15);
  const swing = g.combat.hitbox(blow(foe, you, { duration: 0.5, interval: 0.1 }));
  assert.equal(g.combat.applyHit(foe, you, swing), false);
  assert.equal(you.hp, hp);
  assert.ok(foe.hitstun >= PARRY.reel - 1e-9, `the attacker reels ${foe.hitstun}`);
  assert.ok(Number.isFinite(foe.parriedT) && Number.isFinite(you.parryT));
  assert.equal(you.parryPerfect, false);
  assert.equal(you.counterOn, foe);
  assert.ok(you.counterLeft > 0);
  // (the rest of that move never lands: a multi-hit blow stops)
  assert.equal(swing.cancelled, true);
  // the counter: harder, and staggers them
  const before = foe.hp;
  foe.hitstun = 0;
  g.combat.applyHit(you, foe, blow(you, foe, { damage: 10, stun: 0.1, critChance: 0 }));
  const dealt = before - foe.hp;
  assert.ok(dealt >= Math.round(10 * PARRY.counterMul * (1 - foe.d.def)) - 1, `counter dealt ${dealt}`);
  assert.ok(foe.hitstun >= PARRY.counterStun * 0.99, 'a counter staggers');
  assert.ok(Number.isFinite(you.counterT));
  // (one counter per parry)
  assert.equal(you.counterOn, null);
  const again = foe.hp;
  g.combat.applyHit(you, foe, blow(you, foe, { damage: 10, critChance: 0 }));
  assert.ok(again - foe.hp < dealt);
});

test('a counter strike begun while the foe reels still counts if it lands just after', () => {
  const { g, you, foe } = duel();
  guardUp(you, 0.15);
  g.combat.applyHit(foe, you, blow(foe, you));
  you.setBlock(false);
  you.counterLeft = 0.05;
  assert.equal(you.tryHeavy(g), true);
  for (let i = 0; i < 20; i++) step(you, 1 / 60, g);
  assert.equal(you.counterOn, foe, 'the counter waits on the heavy');
  you.action = null;
  for (let i = 0; i < 6; i++) step(you, 1 / 60, g);
  assert.equal(you.counterOn, null, 'and runs out once it has been and gone');
});

test('a perfect parry: at the very start of the window — a longer reel, a harder counter, health and Haki back', () => {
  const { g, you, foe } = duel();
  you.hakiSkill = { observation: 5 };
  you.haki = 0;
  you.hp = 50;
  guardUp(you, 0.03);
  g.combat.applyHit(foe, you, blow(foe, you));
  assert.equal(you.parryPerfect, true);
  assert.ok(foe.hitstun >= PARRY.reel + PARRY.perfectReel - 1e-9);
  assert.equal(you.counterMul, PARRY.perfectCounterMul);
  assert.ok(you.hp > 50 && you.haki >= PARRY.haki - 1e-9);
});

test('a boss reels for less, but reels', () => {
  const { g, you, foe } = duel('blue', { foe: { boss: true } });
  guardUp(you, 0.15);
  g.combat.applyHit(foe, you, blow(foe, you));
  assert.ok(Math.abs(foe.hitstun - PARRY.reel * PARRY.bossReel) < 1e-9, `${foe.hitstun}`);
  // and a counter goes through a boss's poise (a plain jab doesn't)
  foe.hitstun = 0;
  g.combat.applyHit(you, foe, blow(you, foe, { damage: 5, stun: 0.2 }));
  assert.ok(foe.hitstun > 0);
  foe.hitstun = 0;
  g.combat.applyHit(you, foe, blow(you, foe, { damage: 5, stun: 0.2 }));
  assert.equal(foe.hitstun, 0);
});

test('a guard held too long only blocks: a little chip damage gets through', () => {
  const { g, you, foe } = duel();
  const hp = you.hp;
  guardUp(you, 0.6);
  assert.equal(g.combat.applyHit(foe, you, blow(foe, you, { critChance: 0 })), true);
  assert.ok(you.hp < hp && hp - you.hp <= Math.ceil(20 * 0.62 * you.guardChip() * (1 - you.d.def)) + 1, `took ${hp - you.hp}`);
  assert.equal(foe.hitstun, 0);
  assert.equal(you.counterOn, null);
});

test('mashing F gets no parry: a guard raised again hard on letting go of it only blocks', () => {
  const { g, you, foe } = duel();
  you.setBlock(true); step(you, 0.05, g); you.setBlock(false); step(you, 0.1, g);
  you.setBlock(true);
  assert.equal(you.blocking, true);
  assert.equal(you.guardFresh, false);
  you.blockTime = 0.1;
  const hp = you.hp;
  g.combat.applyHit(foe, you, blow(foe, you));
  assert.ok(you.hp < hp, 'not parried');
  assert.equal(g.hintsShown.has('mash'), true);
  // let go, wait out the lockout, press once: a parry
  you.setBlock(false);
  step(you, PARRY.lockout + 0.02, g);
  you.setBlock(true);
  assert.equal(you.guardFresh, true);
  you.blockTime = 0.1;
  const hp2 = you.hp;
  g.combat.applyHit(foe, you, blow(foe, you));
  assert.equal(you.hp, hp2);
  // and a parry earns the next press a fresh guard, however soon it comes
  you.setBlock(false); step(you, 0.05, g); you.setBlock(true);
  assert.equal(you.guardFresh, true);
});

test('a press during your own swing comes up fresh once the swing ends — a guard held through it does not', () => {
  const { g, you } = duel();
  you.tryM1(g);
  assert.ok(you.action);
  you.setBlock(true);
  assert.equal(you.blocking, false, 'no guard mid-swing');
  for (let i = 0; i < 30 && you.action; i++) { step(you, 1 / 60, g); you.setBlock(true); }
  assert.equal(you.blocking, true);
  assert.equal(you.guardFresh, true, 'the buffered press counts');
  // (holding F and swinging: the swing drops the guard, and it comes back up stale)
  for (let i = 0; i < 40; i++) step(you, 1 / 60, g);
  you.tryM1(g);
  assert.equal(you.blocking, false, 'a swing lowers the guard');
  for (let i = 0; i < 60; i++) { step(you, 1 / 60, g); you.setBlock(true); }
  assert.equal(you.blocking, true);
  assert.equal(you.guardFresh, false);
});

test('a guard-breaking blow cannot be parried: it smashes the guard (a gentler stagger in the Blues)', () => {
  for (const sea of ['blue', 'newWorld']) {
    const { g, you, foe } = duel(sea);
    const hp = you.hp;
    guardUp(you, 0.05);
    g.combat.applyHit(foe, you, blow(foe, you, { guardBreak: true, stun: 0.1 }));
    assert.ok(you.hp < hp);
    assert.equal(you.blocking, false);
    assert.ok(you.guardCd > 0);
    assert.ok(Number.isFinite(you.guardBrokenT));
    assert.ok(Math.abs(you.hitstun - TIERS[sea].gbStun) < 1e-9, `${sea}: ${you.hitstun}`);
    assert.equal(foe.hitstun, 0);
  }
  // an unblockable one goes straight through
  const { g, you, foe } = duel();
  guardUp(you, 0.05);
  const hp = you.hp;
  g.combat.applyHit(foe, you, blow(foe, you, { unblockable: true, critChance: 0 }));
  assert.ok(hp - you.hp >= Math.round(20 * TIERS.blue.dmg * (1 - you.d.def)) - 1);
});

test('a blast can be blocked but never parried; a sword turns a shot aside, fists only block it', () => {
  const { g, you, foe } = duel();
  guardUp(you, 0.05);
  const hp = you.hp;
  g.combat.applyHit(foe, you, { owner: foe, x: foe.x, y: foe.y, shape: 'circle', range: 3, radial: true, damage: 20, blast: true });
  assert.ok(you.hp < hp, 'blocked, not parried');
  assert.equal(foe.hitstun, 0);
  const shot = (o = {}) => ({ owner: foe, x: you.x + 0.5, y: you.y - 0.5, vx: -20, vy: 0, angle: Math.PI, damage: 12, isProj: true, ...o });
  for (const [sword, deflected] of [[true, true], [false, false]]) {
    const d = duel('blue', { you: { sword } });
    guardUp(d.you, 0.05);
    const h0 = d.you.hp;
    d.g.combat.applyHit(d.foe, d.you, { ...shot(), owner: d.foe });
    assert.equal(d.you.hp === h0, deflected, `sword ${sword}`);
    assert.equal(d.foe.hitstun, 0, 'the shooter does not reel');
  }
  // (a shot that goes off on impact is only blocked, sword or no)
  const d = duel('blue', { you: { sword: true } });
  guardUp(d.you, 0.05);
  const h0 = d.you.hp;
  d.g.combat.applyHit(d.foe, d.you, { ...shot({ explodes: true }), owner: d.foe });
  assert.ok(d.you.hp < h0);
});

test('a foe never parries in the Blues; elsewhere its guard parries only when its AI says so', () => {
  const { g, you, foe } = duel();
  foe.setBlock(true);
  assert.equal(foe.guardFresh, false, 'a foe\'s guard is never fresh by itself');
  foe.blockTime = 0.05;
  const hp = foe.hp;
  g.combat.applyHit(you, foe, blow(you, foe));
  assert.ok(foe.hp < hp);
  assert.equal(you.hitstun, 0, 'you don\'t reel');
  assert.equal(TIERS.blue.npcParry, 0);
  // a foe that parries you: you reel for less than they would
  const d = duel('newWorld');
  d.foe.setBlock(true, true);
  d.foe.blockTime = 0.12;
  d.g.combat.applyHit(d.you, d.foe, blow(d.you, d.foe));
  assert.ok(Math.abs(d.you.hitstun - PARRY.playerReel) < 1e-9);
  assert.equal(d.foe.counterOn, d.you);
});

test('a foe\'s blows land softer the gentler the sea, burns and bleeds too', () => {
  const dealt = {};
  for (const sea of ['blue', 'paradise', 'newWorld']) {
    const { g, you, foe } = duel(sea);
    const hp = you.hp;
    g.combat.applyHit(foe, you, blow(foe, you, { critChance: 0 }));
    dealt[sea] = hp - you.hp;
  }
  assert.ok(dealt.blue < dealt.paradise && dealt.paradise <= dealt.newWorld, JSON.stringify(dealt));
  assert.ok(Math.abs(dealt.blue / dealt.newWorld - TIERS.blue.dmg) < 0.08);
  const burn = {};
  for (const sea of ['blue', 'newWorld']) {
    const { g, you, foe } = duel(sea);
    you.addStatus('bleed', 2, foe);
    const hp = you.hp;
    step(you, 0.51, g);
    burn[sea] = hp - you.hp;
  }
  assert.ok(burn.blue < burn.newWorld, JSON.stringify(burn));
});

test('no stun-locks: after a tier\'s run of blows you break free, untouchable for a moment', () => {
  for (const sea of ['blue', 'paradise']) {
    const { g, you, foe } = duel(sea);
    let n = 0;
    while (!(you.iframes > 0) && n < 10) {
      g.time += 0.2;
      g.combat.applyHit(foe, you, blow(foe, you, { damage: 2, stun: 0.5 }));
      n++;
    }
    assert.equal(n, TIERS[sea].stunHits, `${sea}: broke free after ${n}`);
    assert.equal(you.hitstun, 0);
    assert.equal(g.combat.applyHit(foe, you, blow(foe, you)), false, 'nothing lands just after');
  }
});

test('a foe\'s wind-up is stretched where fights are gentle (never yours), and the glint comes cueLead before the blow', () => {
  const land = (sea, who) => {
    const { g, you, foe } = duel(sea);
    const a = who === 'you' ? you : foe;
    if (a === foe) foe.controller = { target: you };
    let cue = null;
    g.fx.parryCue = () => { cue = g.time; };
    a.combo.step = 0; a.combo.window = 0;
    a.tryM1(g);
    const steps = a.action.def.steps;
    let t = 0;
    while (a.action && a.action.step < steps.length && t < 2) { t += 1 / 120; g.time = t; g.env.time = t; updateAbility(a, 1 / 120, g); }
    return { t, cue };
  };
  const blue = land('blue', 'foe'), nw = land('newWorld', 'foe'), mine = land('blue', 'you');
  assert.ok(blue.t >= TIERS.blue.windupMin - 0.02, `a Blues foe's jab lands after ${blue.t}`);
  assert.ok(nw.t < blue.t);
  assert.ok(mine.t < 0.12, `your own jab lands after ${mine.t}`);
  assert.ok(blue.cue !== null && Math.abs(blue.t - blue.cue - TIERS.blue.cueLead) < 0.03, `glint ${blue.cue} before ${blue.t}`);
  assert.equal(mine.cue, null, 'no glint on your own swings');
  assert.equal(stretchWindup(TIERS.blue, 0.07, true), TIERS.blue.chainWindup);
  assert.equal(stretchWindup(TIERS.newWorld, 0.3, false), 0.3);
});

test('a foe spaces out its guard-breaking blows, and never throws two running', () => {
  const ai = new AIController({ kind: 'hostile' });
  const smash = getAbility('alvida_mace');
  const jab = getAbility('brawl_1');
  assert.equal((smash.steps || []).some(breaksGuard), true);
  ai.used(smash, TIERS.blue, 10);
  assert.equal(ai.smashed, true);
  assert.equal(ai.smashT, 10 + TIERS.blue.breakGap);
  ai.used(jab, TIERS.blue, 11);
  assert.equal(ai.smashed, false);
});

test('the moments the animations read: a hit\'s time, direction and weight; parries, reels, broken guards and counters', () => {
  const { g, you, foe } = duel();
  g.env.time = 5;
  g.combat.applyHit(foe, you, blow(foe, you, { heavy: true, critChance: 0 }));
  assert.equal(you.hitT, 5);
  assert.ok(Math.abs(you.hitDir - Math.PI) < 1e-6, `pushed west, away from the foe: ${you.hitDir}`);
  assert.ok(you.hitW >= 0.72 && you.hitW <= 1.5);
  g.env.time = 6;
  const pose = you.visualPose({ time: 6.25 }, you.look, null, null, null);
  assert.ok(Math.abs(pose.hitAge - 1.25) < 1e-9);
  assert.ok(Math.abs(Math.abs(pose.hitDirRel) - Math.PI) < 1e-6, 'shoved straight back');
  assert.equal(pose.hitW, you.hitW);
  for (const k of ['parryAge', 'parriedAge', 'guardBrokenAge', 'counterAge']) assert.equal(pose[k], Infinity, k);
  assert.equal(pose.parryPerfect, false);
  you.hitstun = 0;
  guardUp(you, 0.02);
  g.combat.applyHit(foe, you, blow(foe, you));
  const p2 = you.visualPose({ time: 6.5 }, you.look, null, null, null);
  assert.ok(Math.abs(p2.parryAge - 0.5) < 1e-9);
  assert.equal(p2.parryPerfect, true);
  assert.ok(Math.abs(foe.visualPose({ time: 6.5 }, foe.look, null, null, null).parriedAge - 0.5) < 1e-9);
  // (weights: a jab light, a heavy heavier, a counter heaviest)
  const jab = blowWeight(foe, you, { def: { m1Chain: true } }, 5, false, false);
  const heavy = blowWeight(foe, you, { heavy: true }, 20, false, false);
  assert.ok(jab < heavy && heavy < blowWeight(foe, you, { heavy: true }, 20, false, true));
});

test('a flurry of your jabs doesn\'t keep a foe from ever swinging back', () => {
  const { g, you, foe } = duel();
  foe.controller = new AIController({ kind: 'hostile', skill: 0 });
  foe.controller.target = you; foe.controller.state = 'chase'; foe.controller.sawAt(you, g, foe);
  let swung = false;
  for (let i = 0; i < 60 * 6 && !swung; i++) {
    g.time += 1 / 60; g.env.time += 1 / 60;
    if (!you.action) { you.combo.window = 0; you.tryM1(g); }
    you.update(1 / 60, g);
    foe.update(1 / 60, g);
    g.combat.update(1 / 60);
    if (foe.action) swung = true;
  }
  assert.equal(swung, true);
});
