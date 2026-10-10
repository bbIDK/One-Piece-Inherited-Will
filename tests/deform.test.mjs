import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFORM, addDeform, tickDeform, deformAt, envelope, clearDeform } from '../src/world/deform.js';

test('a tilt raises one side, lowers the other, and settles back to nothing', () => {
  clearDeform(); tickDeform(0, null);
  const d = addDeform({ kind: 'tilt', x: 0, y: 0, r: 20, amp: 4, ang: 0, rise: 0.5, hold: 2, fall: 2 });
  tickDeform(1, null);
  assert.equal(envelope(d), 1);
  assert.ok(deformAt(8, 0) > 1, 'the far side rises');
  assert.ok(deformAt(-8, 0) < -1, 'the near side sinks');
  assert.equal(deformAt(0, 8), 0, 'the hinge stays put');
  assert.equal(deformAt(40, 0), 0, 'nothing beyond its reach');
  assert.ok(Math.abs(deformAt(8, 0, true)) > 1, 'the sea tilts with it');
  tickDeform(10, null);
  assert.equal(DEFORM.list.length, 0, 'gone once settled');
  assert.equal(deformAt(8, 0), 0);
});

test('a crater is a bowl with a lip; a meteor\'s waits for it to land', () => {
  clearDeform(); tickDeform(0, null);
  addDeform({ kind: 'crater', x: 10, y: 10, r: 5, amp: 2, rise: 0.1, hold: 3, fall: 1, delay: 1 });
  tickDeform(0.5, null);
  assert.equal(deformAt(10, 10), 0, 'not yet');
  tickDeform(1.5, null);
  assert.ok(deformAt(10, 10) < -1.9, 'the bottom of the bowl');
  assert.ok(deformAt(15, 10) > 0.3, 'the lip heaped up');
  assert.equal(deformAt(10, 10, true), 0, 'the sea does not dent');
  clearDeform();
});
