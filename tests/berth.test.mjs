// A big ship berths at a pier with her waist — her main deck, where her rail's
// lowest — beside its head, so you can jump aboard from the planks and off
// onto them: alongside the head bow out where the water by the shore is deep,
// and where a reef or a sandbar keeps her stern off the shore, bow in, or
// across the head's end. Never with her tall quarterdeck beside the pier (its
// rail 4.5–6.4 m up: no jump reaches it), which is where she used to end up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { T } from '../src/world/tiles.js';
import { Ship } from '../src/game/ship.js';
import { shipDims } from '../src/world/hull.js';

/**
 * A straight coast (land north of y 60), `reef` tiles of reef off the beach
 * (too shallow to sail), and a pier from the beach `len` tiles out to sea (12,
 * as most are): a walkway 5 wide, a T-head 9 wide on its last 3 tiles. The
 * dock as islandgen records it.
 */
function harbour(reef, len = 12) {
  const w = new World(220, 220, { wrap: false, zone: 3, id: 'test', fill: T.SEA });
  for (let y = 0; y < 60; y++) for (let x = 0; x < 220; x++) w.setTile(x, y, y > 56 ? T.SAND : T.GRASS, 30);
  for (let y = 60; y < 60 + reef; y++) for (let x = 0; x < 220; x++) w.setTile(x, y, T.REEF, 0);
  const end = 60 + len - 1;
  for (let y = 60; y <= end; y++) {
    const half = y > end - 3 ? 4 : 2;
    for (let x = 110 - half; x <= 110 + half; x++) w.setTile(x, y, T.PLANK, 0);
  }
  return { w, end, dock: { x: 110, y: end, dirX: 0, dirY: 1, end: { x: 110, y: end }, half: 2, headHalf: 4, len, moor: { x: 117.5, y: end - 0.5 } } };
}

/** The pier head's planks within a couple of metres of her side, by which deck of hers they're beside. */
function beside(w, s, end) {
  const d = shipDims(s.def), c = Math.cos(s.heading), sn = Math.sin(s.heading), out = { main: 0, other: 0 };
  for (let y = end - 2; y <= end; y++) {
    for (let x = 106; x <= 114; x++) {
      const dx = x + 0.5 - s.x, dy = y + 0.5 - s.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
      if (Math.abs(u) > d.L / 2 || Math.abs(v) > d.B / 2 + 2.2) continue;
      const t = (u + d.L / 2) / d.L;
      if (t >= d.mainT0 && t <= d.mainT1) out.main++; else out.other++;
    }
  }
  return out;
}

for (const type of ['sloop', 'caravel', 'galleon']) {
  test(`a ${type} at a long pier on a deep shore lies alongside its head, bow out, her main deck beside it`, () => {
    const { w, dock, end } = harbour(0, 26);
    const s = new Ship({ type, x: dock.moor.x, y: dock.moor.y, heading: 0 });
    assert.ok(s.berth(w, dock), 'berthed');
    assert.ok(s.fits(w, s.x, s.y, s.heading), 'afloat');
    assert.ok(Math.abs(Math.sin(s.heading - Math.PI / 2)) < 0.01 && Math.cos(s.heading - Math.PI / 2) > 0, `bow out to sea (heading ${s.heading.toFixed(2)})`);
    const b = beside(w, s, end);
    assert.ok(b.main >= 3 && b.other === 0, `the head beside her main deck only (${JSON.stringify(b)})`);
  });

  test(`a ${type} at a short pier lies alongside its head (bow in if she must), her main deck beside it`, () => {
    const { w, dock, end } = harbour(0);
    const s = new Ship({ type, x: dock.moor.x, y: dock.moor.y, heading: 0 });
    assert.ok(s.berth(w, dock), 'berthed');
    assert.ok(s.fits(w, s.x, s.y, s.heading), 'afloat');
    assert.ok(Math.abs(Math.cos(s.heading)) < 0.01, `alongside the pier (heading ${s.heading.toFixed(2)})`);
    const b = beside(w, s, end);
    assert.ok(b.main >= 3 && b.other === 0, `the head beside her main deck only (${JSON.stringify(b)})`);
  });

  test(`a ${type} at a pier with a reef off the beach still has her waist to the head`, () => {
    const { w, dock, end } = harbour(7);
    const s = new Ship({ type, x: dock.moor.x, y: dock.moor.y, heading: 0 });
    assert.ok(s.berth(w, dock), 'berthed');
    assert.ok(s.fits(w, s.x, s.y, s.heading), 'afloat, clear of the reef');
    const b = beside(w, s, end);
    assert.ok(b.main >= 2, `planks beside her main deck to jump from (${JSON.stringify(b)})`);
    // (and the head's no further than a jump from her side)
    const d = shipDims(s.def);
    assert.ok(Math.hypot(s.x - 110.5, s.y - end - 0.5) < d.L / 2 + 6, 'lying at the pier, not out in the roads');
  });
}
