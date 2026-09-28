// `npm test`: body frames rolled for people by their work (src/data/races.js),
// and a weapon on the hotbar drawn and sheathed again (src/game/inventory.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLook } from '../src/data/races.js';
import { FRAMES_M, FRAMES_F, FRAME } from '../src/render3d/chars/bones.js';
import { useItem } from '../src/game/inventory.js';

test('people roll a frame that suits their build and work, with muscle to match', () => {
  const seen = { m: new Set(), f: new Set() };
  for (const role of ['civilian', 'pirate', 'marine', 'swordsman', 'wano', 'fishman']) {
    for (let seed = 1; seed <= 60; seed++) {
      const L = makeLook('human', seed * 7919, { role });
      const set = L.fem ? FRAMES_F : FRAMES_M;
      assert.ok(set.includes(L.frame), `${role} #${seed}: ${L.frame} is a ${L.fem ? "woman's" : "man's"} frame`);
      seen[L.fem ? 'f' : 'm'].add(L.frame);
      if (!L.fem) assert.ok(L.muscle >= 0.15 && L.muscle <= 1.2);
    }
  }
  // (all sorts, not one body copied about)
  assert.ok(seen.m.size >= 6, [...seen.m].join());
  assert.ok(seen.f.size >= 4, [...seen.f].join());
  // brawny men carry more muscle than lanky ones, on the whole
  const mus = (frame) => {
    const ms = [];
    for (let seed = 1; seed <= 400 && ms.length < 20; seed++) { const L = makeLook('human', seed, { role: 'pirate', fem: false }); if (L.frame === frame) ms.push(L.muscle); }
    return ms.reduce((a, b) => a + b, 0) / ms.length;
  };
  assert.ok(mus('brawny') > mus('lanky') + 0.4);
  // a frame asked for is kept, and the big ones sized by hand get none on top
  assert.equal(makeLook('human', 5, { frame: 'stocky', fem: false }).frame, 'stocky');
  assert.equal(makeLook('human', 5, { bulk: 1.6 }).frame, undefined);
  assert.ok(FRAME.brawny.sh > FRAME.lanky.sh);
});

test('a weapon on the hotbar: the first press puts it on and draws it, then it sheathes and draws', () => {
  const c = {
    attrs: { str: 5, agi: 5, end: 5, vit: 5, wil: 5 }, traits: [], flags: {}, look: { race: 'human' },
    equipped: { weapons: [], accessories: [] }, inventory: [{ id: 'fine_katana', qty: 1 }, { id: 'flintlock', qty: 1 }],
    masteries: {}, techniques: [], hotbar: [], style: 'brawler', haki: {}, weaponMastery: {},
  };
  const p = { char: c, hp: 10, d: { maxHp: 10 }, baseMods: {}, recalc() {}, state: 'idle' };
  const game = { state: { char: c }, player: p, log() {}, audio: null };
  assert.equal(useItem(game, 'fine_katana'), true);
  assert.equal(p.weapon.kind, 'sword');
  assert.equal(p.drawn, true);
  // (again: back in its sheath — still worn, at the hip)
  useItem(game, 'fine_katana');
  assert.equal(p.drawn, false);
  assert.deepEqual(c.equipped.weapons, ['fine_katana']);
  useItem(game, 'fine_katana');
  assert.equal(p.drawn, true);
  // another weapon's key swaps to it, drawn
  useItem(game, 'flintlock');
  assert.equal(p.weapon.kind, 'gun');
  assert.equal(p.drawn, true);
  assert.deepEqual(c.equipped.weapons, ['flintlock']);
});
