// `npm test`: sea routes for the ships that aren't yours (src/game/searoute.js):
// round an island that lies between a ship and where she's going, with open
// water along every leg; straight there when nothing's in the way; to the open
// water nearest an end that's in among the land; across the date line of a
// world that wraps; and a ship steered by it gets there without touching land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, seaClear, seaHeading } from '../src/game/searoute.js';

/** A sea `width` wide (wrapping east-west), with round islands in it: [x, y, r]. */
function sea(islands, width = 4000) {
  const dx = (a, b) => { let d = b - a; if (d > width / 2) d -= width; if (d < -width / 2) d += width; return d; };
  // (the signed distance to the nearest coast: + on land, − at sea, as the world's is, up to 32 m)
  const sd = (x, y) => Math.max(-32, Math.min(32, Math.max(...islands.map(([ix, iy, r]) => r - Math.hypot(dx(ix, x), y - iy)), -1e9)));
  return { dx, wx: (x) => ((x % width) + width) % width, distance: (ax, ay, bx, by) => Math.hypot(dx(ax, bx), by - ay), sd, sailable: (x, y) => sd(x, y) < 0 };
}
const ISLE = [1000, 1000, 150];

test('a route round an island in the way: open water along every leg, clear of its shore', () => {
  const w = sea([ISLE]);
  assert.equal(seaClear(w, 600, 1000, 1400, 1000, 8), false);
  const pts = planRoute(w, 600, 1000, 1400, 1000, 8);
  assert.ok(pts && pts.length >= 2, 'a route with a turn in it');
  assert.deepEqual(pts[pts.length - 1], { x: 1400, y: 1000 });
  let cur = { x: 600, y: 1000 }, wide = 0;
  for (const p of pts) {
    assert.ok(seaClear(w, cur.x, cur.y, p.x, p.y, 8), `the leg to (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) is open water`);
    wide = Math.max(wide, Math.abs(p.y - 1000));
    cur = p;
  }
  assert.ok(wide > 150, 'out round the island, not through it');
  // (no longer than it needs to be: round one side, about the half-circle and the two runs in)
  const len = pts.reduce((a, p, i) => a + Math.hypot(p.x - (i ? pts[i - 1].x : 600), p.y - (i ? pts[i - 1].y : 1000)), 0);
  assert.ok(len < 800 + 2 * 170, `${len.toFixed(0)} m`);
});

test('straight there when nothing is in the way', () => {
  const w = sea([ISLE]);
  assert.deepEqual(planRoute(w, 600, 600, 1400, 600, 8), [{ x: 1400, y: 600 }]);
});

test('an end in among the land: the route stops at the open water nearest it', () => {
  const w = sea([ISLE]);
  const pts = planRoute(w, 600, 1000, 1000, 1080, 8);
  assert.ok(pts && pts.length);
  const last = pts[pts.length - 1];
  assert.ok(w.sd(last.x, last.y) < -8, 'the last point is open water');
  assert.ok(Math.hypot(last.x - 1000, last.y - 1080) < 120, 'near the end she was making for');
});

test('across the east-west edge of a world that wraps', () => {
  const w = sea([[60, 1000, 40]], 4000);
  const pts = planRoute(w, 3900, 1000, 220, 1000, 6);
  assert.ok(pts && pts.length >= 2);
  assert.deepEqual(pts[pts.length - 1], { x: 220, y: 1000 });
  for (const p of pts) assert.ok(p.x >= 0 && p.x < 4000, 'points on the chart');
});

test('a ship steered by it comes round the island to where she is going, never touching land', () => {
  const w = sea([ISLE, [1250, 820, 60]]);
  const s = { x: 600, y: 1010, heading: 0, def: { length: 24 }, route: null };
  const game = { world: w, time: 0 };
  let closest = Infinity;
  for (let i = 0; i < 2400 && w.distance(s.x, s.y, 1450, 990) > 15; i++) {
    game.time += 0.1;
    const want = seaHeading(game, s, 1450, 990, 8);
    let d = want - s.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    s.heading += Math.max(-0.05, Math.min(0.05, d));
    s.x += Math.cos(s.heading) * 0.8; s.y += Math.sin(s.heading) * 0.8;
    closest = Math.min(closest, -w.sd(s.x, s.y));
  }
  assert.ok(w.distance(s.x, s.y, 1450, 990) <= 15, `there: (${s.x.toFixed(0)}, ${s.y.toFixed(0)})`);
  assert.ok(closest > 0, `never on the land (closest ${closest.toFixed(1)} m off it)`);
});
