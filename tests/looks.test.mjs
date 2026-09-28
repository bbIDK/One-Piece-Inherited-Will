// `npm test`: body frames rolled for people by their work (src/data/races.js),
// and a weapon on the hotbar drawn and sheathed again (src/game/inventory.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLook } from '../src/data/races.js';
import { FRAMES_M, FRAMES_F, FRAME } from '../src/render3d/chars/bones.js';
import { useItem } from '../src/game/inventory.js';
import { headSDF, headShapeFor, FACE_SHAPES, CHINS, NOSES } from '../src/render3d/chars/build.js';
import { eyeSpan, EYES_M, EYES_F } from '../src/render3d/chars/face.js';

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

test('heads read as real heads in profile: brow, nose, chin, a jaw clear of the neck, the skull ending at the nape', () => {
  for (const fem of [false, true]) {
    for (const faceShape of FACE_SHAPES) {
      for (const chin of CHINS) {
        const L = { fem, faceShape, chin, seed: 3 };
        const f = headSDF(L), who = `${fem ? 'F' : 'M'} ${faceShape}/${chin}`;
        // how far forward the face comes at a height (down the middle)
        const front = (y) => { let x = 1.6; while (x > 0 && f(x, y, 0) > 0) x -= 0.005; return x; };
        const brow = front(0.25), nose = front(-0.4), mouth = front(-0.665);
        // (the chin's point: lower on a long face)
        let chinX = 0;
        for (let y = -0.85; y > -1.25; y -= 0.02) chinX = Math.max(chinX, front(y));
        assert.ok(nose > brow + 0.1, `${who}: the nose stands out past the brow (${nose.toFixed(2)} vs ${brow.toFixed(2)})`);
        assert.ok(mouth > 0.82 && mouth < nose, `${who}: the mouth sits forward, behind the nose (${mouth.toFixed(2)})`);
        assert.ok(chinX > mouth - 0.12, `${who}: the chin comes forward under the mouth (${chinX.toFixed(2)} vs ${mouth.toFixed(2)})`);
        // under the skull behind the jaw is neck, not a round bowl of head
        for (const [x, y] of [[-0.45, -0.7], [-0.7, -0.62], [-0.3, -0.62], [0, -1.0]]) assert.ok(f(x, y, 0) > 0, `${who}: (${x}, ${y}) is under the head`);
        // …while the back of the skull, the cheek and the jaw are head
        for (const [x, y, z] of [[-0.9, 0, 0], [0.6, -0.3, 0.5], [0.3, -0.85, 0.3]]) assert.ok(f(x, y, z) < 0, `${who}: (${x}, ${y}, ${z}) is head`);
      }
    }
  }
  // in profile the eye sits above the nose: the nose's root between the
  // eyes, a little above their middle, its tip well below the lower lid
  for (const fem of [false, true]) {
    for (const noseShape of NOSES.filter((n) => n !== 'long' && n !== 'red')) {
      for (const eyeShape of fem ? EYES_F : EYES_M) {
        const L = { fem, noseShape, eyeShape, seed: 3 };
        const f = headSDF(L), e = eyeSpan(L), who = `${fem ? 'F' : 'M'} ${noseShape} nose, ${eyeShape} eyes`;
        const front = (y) => { let x = 1.6; while (x > 0 && f(x, y, 0) > 0) x -= 0.005; return x; };
        // (the tip: where the nose comes furthest forward)
        let tipY = 0, tipX = 0;
        for (let y = -0.1; y > -0.6; y -= 0.01) { const x = front(y); if (x > tipX) { tipX = x; tipY = y; } }
        assert.ok(tipY < e.bottom - 0.015, `${who}: the nose's tip (${tipY.toFixed(2)}) comes out below the eye (${e.bottom.toFixed(2)})`);
        assert.ok(e.iris - tipY > 0.2, `${who}: the eye (${e.iris.toFixed(2)}) sits well above the nose's tip (${tipY.toFixed(2)})`);
        assert.ok(e.top < 0.25, `${who}: the eye (${e.top.toFixed(2)}) is under the brow`);
      }
    }
  }
  // hair is laid on a shell that is never inside the head (it lies over the nape)
  const L = { fem: false, seed: 5 }, hs = headShapeFor(L, true), hh = headShapeFor(L);
  for (let th = 5; th < 180; th += 10) {
    for (let ph = 0; ph < 360; ph += 15) {
      const t = th * Math.PI / 180, p = ph * Math.PI / 180, d = [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
      assert.ok(Math.hypot(...hs(...d)) >= Math.hypot(...hh(...d)) - 1e-3, `hair shell at ${th}°/${ph}°`);
    }
  }
});
