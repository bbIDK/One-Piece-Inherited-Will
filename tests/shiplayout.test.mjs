// `npm test`: the ships' sizes, and the big ships' layouts (tools/shiplayout.mjs)
// — furniture that fits its rooms, stands clear of everything else and faces
// the right way, drawn as big as what you walk round; doors, the hatch and the
// ladder you can walk through; masts you can walk right up to; nothing of the
// hull (a stair's rail, a quarter gallery, a figurehead) through into a room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkShipLayout, bigTypes } from '../tools/shiplayout.mjs';
import { SHIPS, shipClassLine } from '../src/data/ships.js';
import { shipDims } from '../src/world/hull.js';
import { Mesher } from '../src/render3d/props/kit.js';
import { furniture, bigPalette, bigHull } from '../src/render3d/bigship.js';

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
  assert.equal(shipClassLine(SHIPS.sloop), 'Small ship · 20 m · 1 mast');
  assert.equal(shipClassLine(SHIPS.caravel), 'Ship · 28 m · 2 masts');
  assert.equal(shipClassLine(SHIPS.great_galleon), 'Great ship · 62 m · 4 masts');
});

test('the big ships\' decks, rooms and hold are sized for people: headroom, a rail at the waist, a deck a jump from a pier can reach', () => {
  for (const type of bigTypes()) {
    const d = shipDims({ ...SHIPS[type] });
    for (const r of d.rooms) assert.ok(r.ceil - r.floor >= 2.1, `${type} ${r.kind}: headroom ${r.ceil - r.floor}`);
    assert.ok(d.bulH >= 1 && d.bulH <= 1.2, `${type}: rail ${d.bulH}`);
    // (a pier's planks are 1.5 m over the sea: a jump of 1.3 m and a reach of 1.35 over the rail)
    assert.ok(d.deckY + d.bulH <= 1.5 + 1.3 + 1.3, `${type}: rail ${d.deckY + d.bulH} m over the sea`);
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
