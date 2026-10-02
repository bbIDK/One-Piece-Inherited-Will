// No stamina: nothing drains a bar any more. Dodges come back on a cooldown,
// a guard smashed aside by a heavy blow can't come up again for a moment,
// every technique has a cooldown of its own, and everyone but you sprints in
// bursts. These pin the rules down (the live checks — a blow against a raised
// guard, the HUD — are in the browser scenarios).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Actor } = await import('../src/game/actor.js');
const { derive, baseAttrs } = await import('../src/game/stats.js');
const { allAbilities, canUse } = await import('../src/game/abilities.js');
const { ITEMS } = await import('../src/data/items.js');
const { STYLES } = await import('../src/data/styles.js');
await import('../src/data/fruits.js');
await import('../src/data/haki.js');
await import('../src/content/index.js');

const actor = (attrs = {}, o = {}) => new Actor({ name: 'Tester', race: 'human', attrs: { ...baseAttrs(), ...attrs }, ...o });

test('there is no stamina left anywhere: not on a body, not in its numbers', () => {
  const a = actor();
  assert.equal('stamina' in a, false);
  const d = derive(baseAttrs());
  assert.equal('maxStamina' in d, false);
  assert.equal('staminaRegen' in d, false);
});

test('no technique costs stamina, no buff drains it, no food restores it', () => {
  const abilities = allAbilities();
  assert.ok(abilities.length > 300, `only ${abilities.length} techniques registered`);
  for (const def of abilities) {
    assert.equal(def.cost?.stamina, undefined, `${def.id} still costs stamina`);
    for (const s of def.steps || []) assert.equal(s.buff?.drain?.stamina, undefined, `${def.id}'s buff still drains stamina`);
  }
  for (const [id, it] of Object.entries(ITEMS)) assert.equal(it.stamina, undefined, `${id} still restores stamina`);
});

test('every technique but the basic combo is paced by a cooldown of its own', () => {
  // (the basic combo is paced by its own swings: each strike's wind-up and recovery)
  const m1s = new Set(Object.values(STYLES).flatMap((st) => st.m1Ids || []));
  assert.ok(m1s.size > 30);
  const uncooled = allAbilities().filter((d) => !m1s.has(d.id) && d.source && !d.source.startsWith('undefined') && !(d.cd > 0) && (d.steps || []).some((s) => s.hit || s.proj || s.dash || s.zone || s.buff));
  assert.deepEqual(uncooled.map((d) => d.id), []);
});

test('a technique with a Haki cost waits on Haki, nothing else', () => {
  const a = actor();
  const def = { id: 'test_haki_move', cd: 3, cost: { haki: 10 }, steps: [] };
  a.haki = 5;
  assert.equal(canUse(a, def), false);
  a.haki = 10;
  assert.equal(canUse(a, def), true);
  a.cooldowns[def.id] = 1;
  assert.equal(canUse(a, def), false);
});

test('a dodge comes back after a moment: sooner with Agility, a quarter sooner with Quick Feet', () => {
  const base = actor({ agi: 5 }).dodgeCooldown();
  assert.ok(base > 0.85 && base < 0.9, `base dodge cooldown ${base}`);
  const agile = actor({ agi: 100 }).dodgeCooldown();
  assert.ok(agile < base && agile >= 0.9 * 0.75 - 1e-9, `agile dodge cooldown ${agile}`);
  const quick = actor({ agi: 5 });
  quick.char = { traits: ['quick_feet'] };
  assert.ok(Math.abs(quick.dodgeCooldown() - base * 0.75) < 1e-9);
});

test('Endurance makes a guard stop more of a blow and come back sooner once broken', () => {
  const weak = actor({ end: 5 }), tough = actor({ end: 100 });
  assert.ok(Math.abs(weak.guardCooldown() - 1.96) < 1e-9);
  assert.ok(Math.abs(tough.guardCooldown() - 1.2) < 1e-9);
  assert.ok(tough.guardChip() < weak.guardChip());
  assert.ok(weak.guardChip() <= 0.18 && tough.guardChip() >= 0.18 * 0.6 - 1e-9);
  // (a Devil Fruit user keeps their head above water a little longer, too)
  assert.ok(tough.struggleTime() > weak.struggleTime());
});

test('a broken guard cannot be raised again until it has come back', () => {
  const a = actor();
  a.guardCd = 1;
  a.setBlock(true);
  assert.equal(a.blocking, false);
  a.guardCd = 0;
  a.setBlock(true);
  assert.equal(a.blocking, true);
});

test('you sprint as long as you like; anyone else in bursts of five seconds, then three easing off', () => {
  const you = actor();
  you.isPlayer = true;
  for (let t = 0; t < 60; t += 0.1) assert.equal(you.sprintOk(0.1), true);
  const npc = actor();
  let sprinted = 0;
  while (npc.sprintOk(0.1)) sprinted += 0.1;
  assert.ok(sprinted >= 4.9 && sprinted <= 5.15, `burst lasted ${sprinted.toFixed(1)} s`);
  assert.ok(Math.abs(npc.sprintRest - 3) < 1e-9);
  // (your crew keep up with you)
  const mate = actor();
  mate.crewId = 'zoro';
  for (let t = 0; t < 30; t += 0.1) assert.equal(mate.sprintOk(0.1), true);
});
