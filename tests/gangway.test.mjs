// `npm test`: gangways (src/game/gangway.js) — a plank run across between two
// ships lying stopped alongside each other: laid for every pair of big ships,
// from a clear stretch of one main deck to the other's, up steps over each
// rail and across the water between; not laid between ships apart or across
// each other's bows; hauled in once one's under way; and walked like a deck
// (but not from down in the hold under its steps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layPlank, plankDeck, plankJoins, PLANK_W } from '../src/game/gangway.js';
import { SHIPS, shipStats } from '../src/data/ships.js';
import { shipDims, deckPoint, hullGap, topAt } from '../src/world/hull.js';

const world = { dx: (a, b) => b - a, wx: (x) => x, isLiquid: () => true, isDock: () => false, distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay) };
const ship = (type, x, y, heading, o = {}) => ({ type, def: shipStats(type, []), x, y, heading, speed: 0, sailSet: 0, name: type, owner: 'pirate', alive: true, sunk: false, ...o });
const game = () => ({ world, env: { time: 0 }, planks: [] });
/** Ship b lying alongside a to starboard (heading `dh` off hers, `along` metres ahead of abreast), `gap` metres of water between the hulls. */
function pair(ta, tb, gap = 2.4, dh = 0, along = 0) {
  const a = ship(ta, 1000, 1000, 0.4, { owner: 'player' }), off = (a.def.beam + SHIPS[tb].beam) / 2 + gap;
  const b = ship(tb, 1000 - Math.sin(0.4) * off + Math.cos(0.4) * along, 1000 + Math.cos(0.4) * off + Math.sin(0.4) * along, 0.4 + dh);
  return { a, b };
}
const big = Object.keys(SHIPS).filter((k) => shipDims({ ...SHIPS[k] }).big);

test('every pair of big ships lying stopped alongside gets a plank: from a clear stretch of one main deck, up over both rails and across, to the other\'s', () => {
  for (const ta of big) {
    for (const tb of big) {
      const g = game(), { a, b } = pair(ta, tb);
      const P = layPlank(g, a, b);
      assert.ok(P, `${ta} alongside ${tb}: no plank`);
      const L = P.pts(), at = (s) => ({ x: L.x + L.dir.x * s, y: L.y + L.dir.y * s });
      // (its ends on each main deck, clear of the guns and the like, and its four heights: deck, rail, rail, deck)
      for (const [s, sh, k] of [[0.05, a, 0], [L.len - 0.05, b, 3]]) {
        const q = at(s), dp = deckPoint(sh, q.x - sh.x, q.y - sh.y, 0);
        assert.ok(dp && dp.lvl === 'main' && !dp.solid, `${ta} alongside ${tb}: the plank's end on the ${sh.type}'s deck`);
        assert.ok(Math.abs(L.h[k] - dp.h - 0.05 - 0.1) < 0.25, `${ta}/${tb}: the end at ${L.h[k].toFixed(2)} m, her deck at ${dp.h.toFixed(2)} m`);
      }
      assert.ok(L.h[1] > topAt(shipDims(a.def), 0.5) - 0.2 && L.h[2] > topAt(shipDims(b.def), 0.5) - 0.2, `${ta}/${tb}: under a rail`);
      // (between the rails it's over the water, clear of both hulls)
      const m = at((L.s[1] + L.s[2]) / 2);
      assert.ok(hullGap(a, m.x - a.x, m.y - a.y) > 0 && hullGap(b, m.x - b.x, m.y - b.y) > 0, `${ta}/${tb}: its middle over a hull`);
      // (walked like a deck there, as wide as it is)
      g.planks.push(P);
      const dk = plankDeck(g, m.x, m.y, 0);
      assert.ok(dk && dk.plank === P && dk.ship === a && Math.abs(dk.edge - PLANK_W / 2) < 0.05);
      assert.ok(plankJoins(dk, { ship: b }) && plankJoins({ ship: a }, dk));
    }
  }
});

test('lying a little ahead or astern of abreast, or the other way about, she still gets one', () => {
  for (const [ta, tb] of [['war_galleon', 'brigantine'], ['man_o_war', 'great_galleon'], ['sloop', 'marine_battleship'], ['caravel', 'caravel'], ['frigate', 'galleon']]) {
    // (by up to an eighth of the shorter one's length: hove to alongside you, she lies abreast)
    const L = Math.min(SHIPS[ta].length, SHIPS[tb].length);
    for (const along of [-0.125 * L, -0.06 * L, 0.07 * L, 0.125 * L]) {
      for (const dh of [0, Math.PI, 0.2]) {
        const { a, b } = pair(ta, tb, 2.4, dh, along);
        assert.ok(layPlank(game(), a, b), `${ta} with ${tb} ${along} m along, ${dh.toFixed(1)} rad about`);
      }
    }
  }
});

test('no plank between ships apart, across each other, or under way; it\'s hauled in when one gets under way', () => {
  for (const [gap, dh] of [[9, 0], [2.4, 0.8]]) {
    const { a, b } = pair('war_galleon', 'caravel', gap, dh);
    assert.equal(layPlank(game(), a, b), null, `gap ${gap}, ${dh} rad off`);
  }
  const g = game(), { a, b } = pair('galleon', 'brigantine');
  const P = layPlank(g, a, b);
  assert.ok(P.holds());
  b.speed = 0.5; assert.ok(P.holds(), 'a little way on her');
  b.speed = 1.5; assert.ok(!P.holds(), 'she\'s under way');
  b.speed = 0; a.sailSet = 0.8; assert.ok(!P.holds(), 'your sails are set');
  a.sailSet = 0; b.y += 1.5; P.cache = null; assert.ok(!P.holds(), 'they\'ve drifted apart');
});

test('from down in the hold under its steps, a plank isn\'t underfoot', () => {
  const g = game(), { a, b } = pair('war_galleon', 'frigate');
  const P = layPlank(g, a, b);
  g.planks.push(P);
  const L = P.pts(), q = { x: L.x + L.dir.x * 0.5, y: L.y + L.dir.y * 0.5 };
  const d = shipDims(a.def);
  assert.ok(plankDeck(g, q.x, q.y, 0, a, d.deckY + 0.1), 'on her deck at the foot of its steps');
  assert.equal(plankDeck(g, q.x, q.y, 0, a, d.holdY), null, 'in her hold under them');
});
