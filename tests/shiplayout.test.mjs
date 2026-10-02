// `npm test`: the ships' sizes, rails you can jump and ladders up their sides, and the big ships' layouts (tools/shiplayout.mjs)
// — furniture that fits its rooms, stands clear of everything else and faces
// the right way, drawn as big as what you walk round; doors, the hatch and the
// ladder you can walk through; masts you can walk right up to; nothing of the
// hull (a stair's rail, a quarter gallery, a figurehead) through into a room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkShipLayout, bigTypes } from '../tools/shiplayout.mjs';
import { SHIPS, shipClassLine } from '../src/data/ships.js';
import { shipDims, floorAt, hbAt, levelAt, solidAt } from '../src/world/hull.js';
import { RAIL_CLEAR } from '../src/game/decks.js';
import { Mesher } from '../src/render3d/props/kit.js';
import { furniture, bigPalette, bigHull, bigMastPlan, bigSailPlan } from '../src/render3d/bigship.js';

test('ships come in sizes that make sense: the rowboat small, then sloop < caravel < brigantine < frigate < galleon < carrack < war galleon < man-o\'-war < great galleon', () => {
  assert.ok(SHIPS.dinghy.length < 4 && SHIPS.dinghy.beam < 1.5);
  const up = ['sloop', 'caravel', 'brigantine', 'frigate', 'galleon', 'carrack', 'war_galleon', 'man_o_war', 'great_galleon'];
  for (let i = 1; i < up.length; i++) {
    assert.ok(SHIPS[up[i]].length > SHIPS[up[i - 1]].length, `${up[i]} longer than ${up[i - 1]}`);
    assert.ok(SHIPS[up[i]].beam > SHIPS[up[i - 1]].beam, `${up[i]} broader than ${up[i - 1]}`);
  }
  // (a caravel like the Going Merry: a deck to walk round, about twice and a quarter what she was)
  assert.ok(SHIPS.caravel.length >= 25 && SHIPS.caravel.beam >= 8);
  // (the Thousand Sunny's bigger than the Merry; the Navy's warship a frigate's match)
  assert.ok(SHIPS.adam_brig.length > SHIPS.caravel.length && SHIPS.marine_warship.length > SHIPS.frigate.length);
  assert.equal(shipClassLine(SHIPS.sloop), 'Small ship · 24 m · 1 mast');
  assert.equal(shipClassLine(SHIPS.caravel), 'Ship · 28 m · 2 masts');
  assert.equal(shipClassLine(SHIPS.great_galleon), 'Great ship · 90 m · 4 masts');
  // every ship but the rowboat at least twice as long as she first was (One Piece's scale)
  const was = { sloop: 11.5, caravel: 12.5, brigantine: 14.5, frigate: 17, galleon: 20, adam_brig: 16, marine_warship: 20, carrack: 21, war_galleon: 24, man_o_war: 32, great_galleon: 44, marine_battleship: 38 };
  for (const [type, L] of Object.entries(was)) assert.ok(SHIPS[type].length >= 2 * L, `${type}: ${SHIPS[type].length} m against ${L} m`);
});

test('the big ships\' decks, rooms and hold are sized for people: headroom, a rail at the waist, a deck a jump from a pier can reach', () => {
  for (const type of bigTypes()) {
    const d = shipDims({ ...SHIPS[type] });
    for (const r of d.rooms) assert.ok(r.ceil - r.floor >= 2.1, `${type} ${r.kind}: headroom ${r.ceil - r.floor}`);
    assert.ok(d.bulH >= 1 && d.bulH <= 1.2, `${type}: rail ${d.bulH}`);
    // (a pier's planks are 1.5 m over the sea: a charged jump — 7.6 m/s, 1.45 times
    // that at full charge, against a gravity of 22 — has your feet up over her rail)
    const charged = (7.6 * 1.45) ** 2 / (2 * 22);
    assert.ok(d.deckY + d.bulH - RAIL_CLEAR <= 1.5 + charged, `${type}: rail ${d.deckY + d.bulH} m over the sea`);
    // (and her bulwark is a low wall a plain jump from her deck clears: 7.6 m/s)
    assert.ok(d.bulH - RAIL_CLEAR <= 7.6 ** 2 / (2 * 22), `${type}: bulwark ${d.bulH} m`);
  }
});

test('every big ship has a ladder down each side amidships: over no gunport, up onto a clear stretch of her main deck', () => {
  for (const type of bigTypes()) {
    const d = shipDims({ ...SHIPS[type] });
    for (const s of [1, -1]) {
      const l = d.ladders.find((x) => x.s === s);
      assert.ok(l, `${type}: no ladder down her ${s > 0 ? 'starboard' : 'port'} side`);
      assert.ok(Math.abs(l.t - 0.5) < 0.15, `${type}: her ladder at t ${l.t.toFixed(2)} isn't amidships`);
      for (const g of [...d.guns, ...d.lowGuns]) if (g.s === s) assert.ok(Math.abs(g.u - l.u) >= l.w / 2 + 0.31, `${type}: her ladder hangs over a gunport`);
      const v = s * (hbAt(l.t, d.B) * d.walk - 0.5);
      assert.equal(levelAt(d, l.t, v), 'main', `${type}: her ladder comes up off the main deck`);
      assert.equal(solidAt(d, l.u, v, 0.3, 'main'), 0, `${type}: something stands where her ladder comes over the rail`);
    }
  }
  assert.equal(shipDims({ ...SHIPS.dinghy }).ladders, undefined); // (a rowboat's low side you just jump)
});

test('the spanker\'s boom is head-high over every deck it reaches over, never in through a cabin front or a ceiling', () => {
  for (const type of bigTypes()) {
    const def = { ...SHIPS[type] }, d = shipDims(def);
    for (const m of bigMastPlan(d)) {
      for (const sp of bigSailPlan(def, d, m)) {
        if (sp.type !== 'gaff') continue;
        for (let x = sp.x - sp.len; x <= sp.x; x += 0.1) {
          const over = sp.y0 - 0.1 - floorAt(d, (x + d.L / 2) / d.L);
          assert.ok(over >= 1.9, `${type}: the spanker's boom at u ${x.toFixed(1)} is ${over.toFixed(2)} m over the deck`);
        }
      }
    }
  }
});

// each piece built on its own, as the 3D view builds it: where it's drawn
const P = bigPalette(SHIPS.caravel);
function drawnBounds(d, it) {
  const k = new Mesher();
  furniture(k, d, P, it);
  if (!k.pos.length) return null;
  const b = { u0: Infinity, u1: -Infinity, y0: Infinity, y1: -Infinity, v0: Infinity, v1: -Infinity };
  for (let i = 0; i < k.pos.length; i += 3) {
    const x = k.pos[i], y = k.pos[i + 1], z = k.pos[i + 2];
    b.u0 = Math.min(b.u0, x); b.u1 = Math.max(b.u1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.v0 = Math.min(b.v0, z); b.v1 = Math.max(b.v1, z);
  }
  return b;
}

// her hull, as the 3D view builds it (nothing of it is to come through into a room)
const hullOf = (def, d) => { const k = bigHull(def, d); return { pos: k.pos, idx: k.idx }; };

for (const type of bigTypes()) {
  test(`${type}: every room furnished right, the hatch and the masts clear, nothing of the hull through the rooms`, () => {
    assert.deepEqual(checkShipLayout(type, { draw: drawnBounds, hull: hullOf }), []);
  });
}
