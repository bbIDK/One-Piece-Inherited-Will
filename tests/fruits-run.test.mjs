// Every Devil Fruit technique, run for real — its base set, its heavy, its
// forms' switches and moves (Gum-Gum's Gears...), its awakened set — each one
// started by someone who has eaten the fruit (mastered it, with Haki to spare
// — inside a ROOM for a Room technique), next to a foe, on open ground, and
// played through to the end with the game's own actors, abilities, combat,
// fields and effects. None may throw, every one must start, and each must do
// what it's for: hurt or hold the foe, or change its user (a form, a heal, a
// move, the sky).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../src/game/game.js');
const { Actor } = await import('../src/game/actor.js');
const { Combat } = await import('../src/game/combat.js');
const { FX } = await import('../src/game/fx.js');
const { getAbility, abilityTotal } = await import('../src/game/abilities.js');
const { T } = await import('../src/world/tiles.js');
await import('../src/data/styles.js');
const { FRUITS } = await import('../src/data/fruits.js');
await import('../src/data/haki.js');
await import('../src/content/index.js');

/** Open flat grass in the Blues, and a game just big enough to fight in. */
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
  // (a summon — Doppelman — is a body like any other)
  g.summon = (owner, spec) => { const a = body(g, { dx: owner.x - 20000 + 1, faction: owner.faction, name: spec.name }); a.summonedBy = owner; a.y = owner.y + 1; };
  return g;
}
function body(g, o = {}) {
  const a = new Actor({ name: o.name || 'Fighter', race: o.race || 'human', attrs: { str: 20, agi: 20, end: 20, vit: 20, wil: 20 }, faction: o.faction || 'pirate', hpMul: o.hpMul || 1 });
  a.game = g; a.x = 20000 + (o.dx || 0); a.y = 2000; a.facing = o.facing ?? 0;
  if (o.player) { a.isPlayer = true; a.faction = 'player'; g.player = a; }
  g.actors.push(a);
  return a;
}
function stepAll(g, seconds, dt = 1 / 30, each = null) {
  for (let t = 0; t < seconds; t += dt) {
    g.time += dt; g.env.time += dt;
    for (const a of g.actors) if (a.alive) a.update(dt, g);
    g.combat.update(dt);
    g.updateZones(dt);
    g.fx.update(dt);
    if (each) each();
  }
}

/** Someone who has eaten `fid` and mastered it, a foe a couple of steps east (and another further off), all on open ground. */
function setup(fid) {
  const g = arena();
  const you = body(g, { player: true });
  you.fruit = fid; you.fruitMastery = 100;
  you.hakiSkill = { armament: 60, observation: 60, conqueror: 60 }; you.haki = you.d.maxHaki = 999;
  // (hurt, so a heal has something to mend)
  you.recalc(); you.hp = Math.round(you.d.maxHp * 0.5);
  const foe = body(g, { dx: 2.2, facing: Math.PI, hpMul: 50 });
  foe.provoked = true;
  const far = body(g, { dx: 7, facing: Math.PI, hpMul: 50 });
  far.provoked = true;
  for (const f of [foe, far]) f.hp = f.d.maxHp;
  return { g, you, foe, far };
}

/** Every technique a fruit brings: its base set, the rest it registers (`more`), its heavy, its forms' and its awakened set's (data/fruitForms.js). */
function allOf(F) {
  const aw = F.awakening || {};
  const ids = [...F.techniques.map((t) => t.id), ...(F.more || []).map((t) => t.id), F.heavy, ...(F.forms || []).flatMap((x) => [x.activate, ...(x.skills || []), x.heavy]), aw.activate, ...(aw.skills || []), aw.heavy];
  return [...new Set(ids.filter(Boolean))];
}

const snapshot = (a) => JSON.stringify({ hp: Math.round(a.hp), x: a.x.toFixed(2), y: a.y.toFixed(2), st: Object.keys(a.status).sort(), b: a.buffs.map((b) => b.id).sort(), f: !!a.flying });

for (const [fid, F] of Object.entries(FRUITS)) {
  test(`${F.name}: every technique runs, start to finish`, () => {
    for (const id of allOf(F)) {
      const t = { id };
      const { g, you, foe, far } = setup(fid);
      const def = getAbility(t.id);
      assert.ok(def, `${t.id} is registered`);
      if (def.room) {
        // (a Room technique: open the ROOM first, round you both)
        assert.ok(you.tryTechnique('ope_room', g, foe), 'ROOM opens');
        stepAll(g, abilityTotal(getAbility('ope_room')) + 0.1);
        assert.ok(g.areaZones.some((z) => z.kind === 'room' && z.owner === you), 'there is a Room');
      }
      const before = { you: snapshot(you), foe: snapshot(foe), far: snapshot(far) };
      const hp0 = foe.hp + far.hp;
      let ok;
      assert.doesNotThrow(() => { ok = you.tryTechnique(t.id, g, foe); }, `${t.id} starts without throwing`);
      assert.ok(ok, `${t.id} starts`);
      const total = def.flight ? 1.5 : abilityTotal(def) + 2.5;
      // (what it did, at any moment of it: a form or a hold may be over by the end)
      let changed = false;
      const look = () => { changed ||= snapshot(foe) !== before.foe || snapshot(far) !== before.far || snapshot(you) !== before.you || g.combat.projectiles.length > 0; };
      assert.doesNotThrow(() => stepAll(g, total, 1 / 30, look), `${t.id} plays through without throwing`);
      if (!def.flight) assert.equal(you.action, null, `${t.id} is over`);
      const hurt = foe.hp + far.hp < hp0;
      assert.ok(hurt || changed, `${t.id} does something`);
      if (def.flight) assert.ok(you.flying || you.flightGauge !== undefined, `${t.id} takes to the air`);
      // and the world settles afterwards (fields run out, nothing stays airborne for ever)
      assert.doesNotThrow(() => stepAll(g, 20), `${t.id}: what it left behind settles`);
    }
  });
}
