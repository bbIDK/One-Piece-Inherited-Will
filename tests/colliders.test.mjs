// What you walk into is where it's drawn: props' colliders turn with their
// models and fit them, and things that block whole tiles stand on the grid.
// (The whole world's towns are walked by `node tools/shot.mjs barrierhunt`.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { ObjectIndex, colliderOf } from '../src/world/objects.js';
import { T } from '../src/world/tiles.js';

function world() {
  const w = new World(256, 256, { wrap: false, fill: T.GRASS });
  w.objects = new ObjectIndex(w);
  return w;
}
// a point in a prop's own frame (x across, z to its front) on the map, as its 3D model is turned
const at = (o, lx, lz) => { const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0); return [o.x + lx * c + lz * s, o.y - lx * s + lz * c]; };

test('a landmark placed off the tile grid is set on it, its model over its blocked tiles', () => {
  const w = world();
  const b = w.objects.add({ kind: 'building', role: 'hall', name: 'Hall', x: 100.4, y: 100.82, fw: 8, fd: 5, block: true });
  assert.equal(b.x - b.fw / 2, Math.round(b.x - b.fw / 2));
  assert.equal(b.y - b.fd, Math.round(b.y - b.fd));
  assert.ok(w.isBlocked(b.x - 3.5, b.y - 0.5) && w.isBlocked(b.x + 3.5, b.y - 4.5), 'under its corners');
  assert.ok(!w.isBlocked(b.x - 4.5, b.y - 2) && !w.isBlocked(b.x + 4.5, b.y - 2) && !w.isBlocked(b.x, b.y - 5.5) && !w.isBlocked(b.x, b.y + 0.5), 'nothing past its walls');
});

test('a turned stall collides along its length, not as a box square to the map', () => {
  const w = world();
  const o = w.objects.add({ kind: 'stall', x: 60, y: 60, yaw: 0.6, block: true });
  const [hw, hd] = colliderOf(o);
  // the counter's ends (inside), and the free ground past its front and back
  for (const u of [-hw + hd, 0, hw - hd]) assert.ok(w.hitsProp(...at(o, u, 0), 0.05), `on its long axis at ${u}`);
  assert.ok(!w.hitsProp(...at(o, 0, hd + 0.2), 0.05) && !w.hitsProp(...at(o, 0, -hd - 0.2), 0.05), 'clear before and behind it');
  assert.ok(!w.hitsProp(...at(o, hw + 0.2, 0), 0.05) && !w.hitsProp(...at(o, -hw - 0.2, 0), 0.05), 'clear past its ends');
});

test('ruins collide along their broken wall, turned as it is drawn', () => {
  const w = world();
  const o = w.objects.add({ kind: 'ruins', x: 50.3, y: 50.7, block: true });
  assert.ok(Number.isFinite(o.yaw), 'turned (as the model is)');
  assert.ok(w.hitsProp(...at(o, -1.0, 0), 0.05) && w.hitsProp(...at(o, 0.3, 0), 0.05), 'along the wall');
  // the wall is half a metre thick: a step to either side of it is free
  assert.ok(!w.hitsProp(...at(o, -0.3, 0.55), 0.05) && !w.hitsProp(...at(o, -0.3, -0.55), 0.05), 'beside the wall');
});

test('tree trunks collide at their own thickness', () => {
  assert.ok(colliderOf({ kind: 'tree', sub: 'lollipop' }) < 0.12, 'a lollipop stick is thin');
  assert.ok(colliderOf({ kind: 'tree', sub: 'candycane' }) < 0.2);
  assert.ok(colliderOf({ kind: 'tree', sub: 'jungle' }) > colliderOf({ kind: 'tree', sub: 'oak' }), 'jungle giants spread wide');
  assert.equal(colliderOf({ kind: 'bamboo' }), colliderOf({ kind: 'tree', sub: 'bamboo' }), 'the species as kinds of their own');
});

test('a big bell hangs between two posts you walk between', () => {
  const w = world();
  const o = w.objects.add({ kind: 'bell', x: 80, y: 80, block: true });
  assert.ok(!w.hitsProp(o.x, o.y, 0.3), 'under the bell');
  assert.ok(w.hitsProp(...at(o, 1.55, 0), 0.05) && w.hitsProp(...at(o, -1.55, 0), 0.05), 'its posts');
});
