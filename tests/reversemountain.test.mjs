// `npm test`: the summit pool of Reverse Mountain (src/world/reverseMountain.js
// canalAt) — a ship carried up any of the four canals crosses the pool into
// the torrent with every part of her hull on the water, the rowboat to the
// greatest galleon: her middle carried by the current and her head following
// it, as ship.js has them. (The pool's current used to run round the rim,
// and the long ships ground on it there.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RM, canalAt } from '../src/world/reverseMountain.js';
import { hbAt } from '../src/world/hull.js';
import { SHIPS } from '../src/data/ships.js';

// (the water up there: the pool, and the width of a canal either side of its middle, as worldgen carves them)
const water = (x, y) => {
  if (Math.hypot(x - RM.x, y - RM.y) <= RM.poolR) return true;
  const k = canalAt(x, y, 40, {});
  return !!k && (k.pool || k.d <= RM.halfW + 0.5);
};
const angle = (a) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hull(type, x, y, h) {
  const L = SHIPS[type].length, B = SHIPS[type].beam, c = Math.cos(h), s = Math.sin(h), pts = [];
  const add = (ax, ay) => pts.push([x + c * ax * L - s * ay * B, y + s * ax * L + c * ay * B]);
  const n = Math.ceil(L / 3);
  for (let i = 0; i <= n; i++) { const t = 0.03 + 0.93 * i / n, hb = hbAt(t, 1) * 0.95; add(t - 0.5, hb); add(t - 0.5, -hb); }
  add(0.49, 0);
  return pts;
}
/** From high on the climb of canal (sx, sy) to the torrent: { seconds in the pool, hull points ever off the water }. */
function ride(type, sx, sy) {
  let x = RM.x + 70 * sx, y = RM.y + 420 * sy, h = Math.atan2((70 - 420) * sy, (24 - 70) * sx);
  let t = 0, tin = null, aground = 0;
  for (let i = 0; i < 30 * 60; i++) {
    const k = canalAt(x, y, 40, {});
    assert.ok(k, `still on the mountain's water at (${(x - RM.x).toFixed(0)}, ${(y - RM.y).toFixed(0)})`);
    const pool = Math.hypot(x - RM.x, y - RM.y) < RM.poolR;
    const sp = pool ? 12 : k.canal.exit ? RM.downSpeed : RM.upSpeed;
    const back = pool ? 0 : clamp(-k.side * 0.55, -6, 6);
    const cx = k.fx * sp - k.fy * back, cy = k.fy * sp + k.fx * back;
    h += clamp(angle(Math.atan2(cy, cx) - h), -1, 1) / 30 * 2.6;
    x += (Math.cos(h) * 3 + cx) / 30; y += (Math.sin(h) * 3 + cy) / 30; t += 1 / 30;
    if (pool && tin === null) tin = t;
    if (Math.hypot(x - RM.x, y - RM.y) < RM.poolR + 70) aground += hull(type, x, y, h).filter(([px, py]) => !water(px, py)).length;
    if (tin !== null && x - RM.x > RM.poolR + 30) return { pool: t - tin, aground };
  }
  return { pool: Infinity, aground };
}

for (const [id, sx, sy] of [['east_blue', 1, -1], ['north_blue', -1, -1], ['west_blue', -1, 1], ['south_blue', 1, 1]]) {
  test(`up the ${id.replace('_', ' ')} canal and across the summit pool: every ship clear of the rock`, () => {
    for (const type of ['dinghy', 'sloop', 'caravel', 'war_galleon', 'man_o_war', 'marine_battleship', 'great_galleon']) {
      const r = ride(type, sx, sy);
      assert.equal(r.aground, 0, `${type}: hull on the rock ${r.aground} times`);
      assert.ok(r.pool < 12, `${type}: ${r.pool.toFixed(1)} s in the pool`);
    }
  });
}

test('the pool runs out east, into the torrent, from everywhere in it', () => {
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    for (const r of [5, 25, 50]) {
      const k = canalAt(RM.x + Math.cos(a) * r, RM.y + Math.sin(a) * r, 40, {});
      assert.ok(k.pool);
      assert.ok(Math.abs(Math.hypot(k.fx, k.fy) - 1) < 1e-6);
      // (out on the exit side it runs east; elsewhere in toward the middle, from where it runs east)
      if (Math.cos(a) > 0.97) assert.ok(k.fx > 0.8, `east at ${r} m, ${(a * 57.3).toFixed(0)}°`);
    }
  }
});
