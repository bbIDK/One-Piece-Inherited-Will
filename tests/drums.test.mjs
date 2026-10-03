// The Drum Rockies (world/drums.js): a drum is a sheer cylinder with a flat
// top — inside its round the ground is its height, outside it the land's own,
// with the cliff one tile thick between; its face tiles are a cliff nobody
// walks up. And the ropeway's cable (game/ropeway.js) runs from station to
// station with a gentle sag, never under either end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { T, WALKABLE } from '../src/world/tiles.js';
import { computeDistanceField } from '../src/world/worldgen.js';
import { HeightField } from '../src/render3d/height.js';
import { drumR, inDrum, drumTile, drumAt, drumFace } from '../src/world/drums.js';
import { cableAt } from '../src/game/ropeway.js';

/** A snowy island with one drum (radius R, top H m) in the middle, its tiles laid as islandgen lays them. */
async function island(R = 20, H = 60) {
  const w = new World(160, 160, { wrap: false, zone: 0, id: 'test', fill: T.SEA });
  for (let y = 10; y < 150; y++) for (let x = 10; x < 150; x++) w.setTile(x, y, T.SNOW, 40);
  const d = { name: 'Drum Rock', x: 80, y: 80, R, H, seed: 1.3 };
  w.drums = [d];
  for (let y = 50; y < 110; y++) {
    for (let x = 50; x < 110; x++) {
      const k = drumTile(w, d, x, y);
      if (k === 1) w.setTile(x, y, T.SNOWROCK);
      else if (k === 2) w.setTile(x, y, T.SNOW, 250);
    }
  }
  await computeDistanceField(w);
  return { w, d, hf: new HeightField(w) };
}

test('a drum: a flat top at its height, sheer sides, the land round it untouched', async () => {
  const { w, d, hf } = await island();
  // the top: within a metre and a half of its height, all over
  for (const [x, y] of [[80, 80], [70, 85], [92, 74], [80, 64]]) {
    const h = hf.terrain(x + 0.5, y + 0.5);
    assert.ok(Math.abs(h - d.H) < 1.6, `on top at (${x}, ${y}): ${h.toFixed(1)} m (${d.H} m)`);
    assert.ok(drumAt(w, x + 0.5, y + 0.5) === d);
  }
  // the land a few metres out from its face: as low as the land is
  for (const a of [0, 1, 2, 3, 4, 5]) {
    const r = drumR(d, a) + 3, x = d.x + Math.cos(a) * r, y = d.y + Math.sin(a) * r;
    const h = hf.terrain(x, y);
    assert.ok(h < 8, `the foot of the cliff at angle ${a}: ${h.toFixed(1)} m`);
    assert.ok(!drumAt(w, x, y));
  }
  // the face: from the top to the foot in under two metres out
  for (const a of [0.3, 1.9, 3.7, 5.2]) {
    const r = drumR(d, a), top = hf.terrain(d.x + Math.cos(a) * (r - 1.2), d.y + Math.sin(a) * (r - 1.2));
    const foot = hf.terrain(d.x + Math.cos(a) * (r + 1.6), d.y + Math.sin(a) * (r + 1.6));
    assert.ok(top - foot > d.H - 12, `a sheer face at angle ${a}: ${top.toFixed(1)} → ${foot.toFixed(1)} m`);
  }
});

test("a drum's face is a cliff (snow-rock), its top walkable snow, and the round of it a little uneven", async () => {
  const { w, d } = await island();
  let face = 0, top = 0;
  for (let y = 50; y < 110; y++) {
    for (let x = 50; x < 110; x++) {
      const k = drumTile(w, d, x, y);
      if (k === 1) { face++; assert.equal(w.type(x, y), T.SNOWROCK); assert.ok(drumFace(w, x, y)); assert.ok(!WALKABLE[w.type(x, y)]); }
      if (k === 2) { top++; assert.ok(WALKABLE[w.type(x, y)]); assert.ok(!drumFace(w, x, y)); }
    }
  }
  assert.ok(top > Math.PI * (d.R - 2) ** 2 * 0.9, `its top: ${top} tiles`);
  assert.ok(face > 2 * Math.PI * d.R * 0.9 && face < 2 * Math.PI * d.R * 2.2, `its face: a ring a tile or so thick (${face} tiles)`);
  // (not a perfect circle: rock)
  const rs = Array.from({ length: 64 }, (_, i) => drumR(d, (i / 64) * Math.PI * 2));
  assert.ok(Math.max(...rs) - Math.min(...rs) > 0.6, 'an uneven round');
  assert.ok(inDrum(w, d, d.x, d.y) && !inDrum(w, d, d.x + d.R * 1.2, d.y));
});

test('the ropeway cable: from station to station, sagging a little between, never under either end', () => {
  const rw = { ha: 6, hb: 78, sag: 2.4 };
  assert.equal(cableAt(rw, 0), 6);
  assert.equal(cableAt(rw, 1), 78);
  // (the middle: under the straight line by the sag)
  assert.ok(Math.abs(cableAt(rw, 0.5) - (42 - 2.4)) < 1e-9);
  let last = -Infinity;
  for (let s = 0; s <= 1.0001; s += 0.05) { const h = cableAt(rw, s); assert.ok(h >= 6 - 1e-9 && h <= 78 + 1e-9); assert.ok(h >= last - 1e-9, 'climbing all the way'); last = h; }
});
