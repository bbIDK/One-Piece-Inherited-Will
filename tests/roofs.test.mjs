// What you stand on up on a building is its roof as it's drawn
// (render3d/roofs.js): a house's walls and a pitched roof over them, turned
// as a building is, give the heights of the eaves and the ridge, no more
// than its upward faces (not the top of its walls' sides), and nothing past
// its eaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoofIndex } from '../src/render3d/roofs.js';
import { bw } from '../src/world/bframe.js';

const world = { width: 4096, height: 4096, wrap: false, wx: (x) => x, dx: (a, b) => b - a };

/** A house 6 m wide and 4 deep in its own frame (front at z = 0, back at z = -4): walls 3 m, a gable roof rising 1.8 m to a ridge along x, eaves 0.4 m out. */
function house(rot, { veranda = false } = {}) {
  const b = { x: 100, y: 200, rot, fw: 6, fd: 4 };
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4));
  walls.position.set(0, 1.5, -2);
  g.add(walls);
  // the two slopes: from the eaves (0.4 m past the walls, 0.18 m lower) up to the ridge over z = -2
  const slope = (zEave) => {
    const geo = new THREE.BufferGeometry();
    const y0 = 3 - 0.18, y1 = 4.8;
    const p = [-3.4, y0, zEave, 3.4, y0, zEave, 3.4, y1, -2, -3.4, y0, zEave, 3.4, y1, -2, -3.4, y1, -2];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return new THREE.Mesh(geo);
  };
  g.add(slope(0.4), slope(-4.4));
  if (veranda) {
    // (a veranda along the front, 42 cm up: 800 little triangles)
    const v = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9, 40, 10).rotateX(-Math.PI / 2));
    v.position.set(0, 0.42, 0.45);
    g.add(v);
  }
  g.rotation.y = rot * Math.PI / 2;
  g.position.set(b.x, 10, b.y);
  return { b, g };
}

for (const rot of [0, 1, 2, 3]) {
  test(`a gable roof's heights, turned ${rot} quarters`, () => {
    const { b, g } = house(rot);
    const R = new RoofIndex(world);
    R.add(b, g, 10);
    const at = (lx, lz) => { const q = bw(b, lx, lz); return R.at(q.x, q.y); };
    // the ridge, over the middle
    assert.ok(Math.abs(at(0, -2).h - 14.8) < 0.08, `ridge ${at(0, -2)?.h}`);
    // half way up the front slope: half way between the eave and the ridge
    const mid = at(1, -0.8).h;
    const want = 10 + (2.82 + (4.8 - 2.82) * (0.8 + 0.4) / 2.4);
    assert.ok(Math.abs(mid - want) < 0.08, `slope ${mid} (want ${want.toFixed(2)})`);
    // out over the street under the eave: the eave
    assert.ok(Math.abs(at(0, 0.3).h - (10 + 2.82 + 1.98 * 0.1 / 2.4)) < 0.1, `eave ${at(0, 0.3)?.h}`);
    // past the eaves, nothing
    assert.equal(at(0, 0.7), null);
    assert.equal(at(3.8, -2), null);
    // a roof higher than you'd look below: none
    assert.equal(R.at(...Object.values(bw(b, 0, -2)), 13), null);
    assert.ok(Math.abs(R.at(...Object.values(bw(b, 0, 0.3)), 13).h - 12.9) < 0.1, 'the eave, below 13 m');
    // and once its model is gone, nothing to stand on
    R.remove(b);
    assert.equal(at(0, -2), null);
  });
}

test('a grid made a little at a time is the same as one made at once', () => {
  const { b, g } = house(1, { veranda: true });
  const once = new RoofIndex(world), bits = new RoofIndex(world);
  once.add(b, g, 10); bits.add(b, g, 10);
  // (no time to spare at all: a slice of it each call)
  let calls = 0;
  while (bits.recs.get(b).grid === null && calls < 1000) { bits.warm(b.x, b.y, 50, -Infinity); calls++; }
  assert.ok(calls > 3 && bits.recs.get(b).grid, `made over ${calls} calls`);
  // (out in front of the eaves: the veranda)
  const v = bw(b, 0, 0.7);
  assert.ok(Math.abs(once.at(v.x, v.y).h - 10.42) < 0.01);
  for (const [lx, lz] of [[0, -2], [1, -0.8], [0, 0.3], [-2.9, -3.5], [0, 0.7]]) {
    const q = bw(b, lx, lz);
    assert.deepEqual(bits.at(q.x, q.y), once.at(q.x, q.y));
  }
});
