import test from 'node:test';
import assert from 'node:assert/strict';
import { feltTemp, bodyTarget, thirstRate, nourishment } from '../src/game/survival.js';
import { ITEMS } from '../src/data/items.js';

test('body temperature follows the air, with shelter and nature taking the edge off', () => {
  assert.equal(bodyTarget(feltTemp(20)), 37);
  assert.ok(bodyTarget(feltTemp(-14)) < 35, 'polar air chills you');
  assert.ok(bodyTarget(feltTemp(-14, { indoors: true })) >= 36.5, 'indoors you warm up');
  assert.ok(bodyTarget(feltTemp(-7, { coat: true })) > bodyTarget(feltTemp(-7)), 'a coat helps');
  assert.equal(bodyTarget(feltTemp(-14, { coldProof: true })), 37, 'fire in your veins');
  assert.ok(bodyTarget(feltTemp(42)) > 39, 'the desert sun overheats you');
});

test('heat makes you thirsty faster', () => {
  assert.ok(thirstRate(40, 37) > 2.5 * thirstRate(20, 37));
  assert.equal(thirstRate(20, 37), 1);
});

test('food fills, drinks quench', () => {
  assert.ok(nourishment(ITEMS.meat).food > 0.25);
  assert.ok(nourishment(ITEMS.water_flask).water >= 0.5 && nourishment(ITEMS.water_flask).food === 0);
  assert.ok(nourishment(ITEMS.coconut).water > 0);
  assert.equal(nourishment(ITEMS.cutlass).food, 0);
});
