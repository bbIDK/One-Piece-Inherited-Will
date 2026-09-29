// A bridge joins the land at its ends at the land's height: on an island that
// stands high over the water, its deck spans the channel high over it, and
// the banks it lands on are built up to meet it. (It used to lie just over
// the water whatever it joined, at the foot of banks taller than you.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { T } from '../src/world/tiles.js';
import { computeDistanceField } from '../src/world/worldgen.js';
import { HeightField, DECK_Y } from '../src/render3d/height.js';

/** Two stretches of land (elevation e) with a channel 6 tiles wide between them, and a bridge 3 wide across it. */
async function channel(e) {
  const w = new World(128, 96, { wrap: false, zone: 3, id: 'test', fill: T.SEA });
  for (let y = 20; y < 76; y++) {
    for (let x = 10; x < 118; x++) {
      if (x >= 61 && x < 67) continue; // (the channel)
      w.setTile(x, y, T.GRASS, e);
    }
  }
  for (let y = 46; y < 49; y++) for (let x = 61; x < 67; x++) w.setTile(x, y, T.BRIDGE);
  await computeDistanceField(w);
  return { w, hf: new HeightField(w) };
}

test('a bridge between high banks runs at their height, and the banks meet it', async () => {
  const { w, hf } = await channel(170);
  // (the land well in from the water: a plateau)
  const land = hf.terrain(40.5, 30.5);
  assert.ok(land > 10, `a high island (${land.toFixed(1)} m)`);
  // the deck, end to end, as high as the land it joins
  for (const x of [61.5, 64, 66.5]) {
    const top = hf.ground(x, 47.5);
    assert.ok(Math.abs(top - land) < 0.6, `deck at ${x}: ${top.toFixed(2)} m, land ${land.toFixed(2)} m`);
  }
  // stepping off either end onto the bank: no ledge, no drop
  for (const [a, b] of [[60.9, 61.1], [66.9, 67.1]]) {
    const step = Math.abs(hf.ground(a, 47.5) - hf.ground(b, 47.5));
    assert.ok(step < 0.35, `from deck to bank at x ${a}: a step of ${step.toFixed(2)} m`);
  }
  // the water under it is still water: the channel beside the bridge keeps its width
  assert.ok(hf.terrain(64, 40.5) < 0.5, 'the channel beside the bridge is at the water');
});

test('a high deck has a handrail over the water, none where it comes ashore', async () => {
  const { hf } = await channel(170);
  assert.equal(hf.railAt(63, 46, 63, 45), true, 'over the water beside it');
  assert.equal(hf.railAt(63, 48, 63, 49), true, 'on the other side too');
  assert.equal(hf.railAt(63, 47, 64, 47), false, 'along the deck');
  assert.equal(hf.railAt(61, 47, 60, 47), false, 'onto the bank at its end');
});

test('a bridge between low shores lies just over the water, with no handrail', async () => {
  const { hf } = await channel(0);
  const top = hf.ground(64, 47.5);
  assert.ok(top >= DECK_Y - 0.01 && top < 2, `a low deck (${top.toFixed(2)} m)`);
  assert.equal(hf.railAt(63, 46, 63, 45), false);
});
