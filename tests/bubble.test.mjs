// Fish-Man Island lives in a bubble (world/bubble.js): the zone's islands,
// where ships come down and the ways out all lie inside it, and past its skin
// there's nowhere to go (its tiles are walled off).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bubbleR, inBubble, domeHeight, domeR } from '../src/world/bubble.js';
import { ZONES } from '../src/data/zones/index.js';
import { generateZoneWorld } from '../src/world/zonegen.js';

const B = { x: 100, y: 50, a: 40, b: 20, h: 30 };

test('the bubble\'s shape: an ellipse at its foot, half an ellipsoid over it', () => {
  assert.equal(bubbleR(B, 100, 50), 0);
  assert.ok(Math.abs(bubbleR(B, 140, 50) - 1) < 1e-9 && Math.abs(bubbleR(B, 100, 30) - 1) < 1e-9);
  assert.equal(domeHeight(B, 100, 50), 30);
  assert.equal(domeHeight(B, 141, 50), 0);
  assert.ok(Math.abs(domeHeight(B, 120, 50) - 30 * Math.sqrt(0.75)) < 1e-9);
  // (on its skin, inside it, outside it)
  assert.ok(Math.abs(domeR(B, 120, 50, domeHeight(B, 120, 50)) - 1) < 1e-9);
  assert.ok(domeR(B, 100, 50, 10) < 1 && domeR(B, 100, 50, 31) > 1);
  const w = { bubble: B };
  assert.ok(inBubble(w, 135, 50) && !inBubble(w, 135, 50, 6) && !inBubble(w, 141, 50));
  assert.ok(inBubble({}, 1e6, 1e6), 'no bubble: everywhere is inside');
});

test('Fish-Man Island\'s zone: all of it inside its bubble, nothing to reach outside', () => {
  const z = ZONES.fishman_island;
  const w = generateZoneWorld(z);
  assert.ok(w.bubble, 'the zone has its bubble');
  // the islands (every tile of their land), where ships come down, and the ways out
  for (const isl of w.islands) {
    const B = isl.landBox;
    for (let y = Math.floor(B.y0); y <= B.y1; y++) {
      for (let x = Math.floor(B.x0); x <= B.x1; x++) {
        if (!w.isLiquid(x, y)) assert.ok(inBubble(w, x + 0.5, y + 0.5, 6), `${isl.id} land at ${x},${y} is out by the bubble's skin`);
      }
    }
  }
  assert.ok(inBubble(w, z.arrive.x, z.arrive.y, 30), 'ships come down well inside');
  assert.ok(w.sailable(z.arrive.x, z.arrive.y), 'onto open water');
  for (const e of z.exits) assert.ok(inBubble(w, e.x, e.y, 4) && w.sailable(e.x, e.y), `exit ${e.id} is inside, on the water`);
  // past the skin: walled off for ships, swimmers and walkers alike
  for (const [x, y] of [[5, 5], [w.width - 6, 8], [10, w.height - 10], [w.width - 3, w.height - 3]]) {
    assert.ok(!inBubble(w, x, y) && w.isBlocked(x, y) && !w.sailable(x, y) && !w.swimmable(x, y), `${x},${y}`);
  }
  // (Ryugu Palace stands on the island, in the north)
  const isl = w.islands.find((i) => i.id === 'fishman_island');
  const ry = isl.landmarks.find((o) => o.kind === 'ryugu');
  assert.ok(ry && ry.y < isl.y && !w.isLiquid(ry.x, ry.y), 'Ryugu Palace on its stalk');
});
