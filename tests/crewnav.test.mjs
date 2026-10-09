// `npm test`: your crew getting from one ship to another (src/game/crewnav.js,
// and decks.js deckRoute for a gangway): out to her rail by a clear way (not
// into one of her guns), a leap from it where the gap's a jump — else a dive,
// for the other's ladder — and in the air on for the other's deck; up a
// gangway's steps along its middle, never beside them; and in the water round
// a hull's bow or stern, never in under her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipNav, clearLane } from '../src/game/crewnav.js';
import { installDecks, deckRoute } from '../src/game/decks.js';
import { layPlank } from '../src/game/gangway.js';
import { SHIPS, shipStats } from '../src/data/ships.js';
import { shipDims, deckPoint, deckToWorld, hbAt, hullGap } from '../src/world/hull.js';

const world = { dx: (a, b) => b - a, wx: (x) => x, isLiquid: () => true, isDock: () => false, distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay) };
const ship = (type, x, y, heading, o = {}) => ({ type, def: shipStats(type, []), x, y, heading, speed: 0, sailSet: 0, name: type, owner: 'pirate', alive: true, sunk: false, ...o });
function game(ships) {
  const g = { world, env: { time: 0 }, planks: [], ships, on: () => {} };
  installDecks(g);
  g.deckRoute = (a, x, y, who) => deckRoute(g, a, x, y, who);
  return g;
}
/** Ship b lying alongside a to starboard, `gap` metres of water between the hulls. */
function pair(ta, tb, gap) {
  const a = ship(ta, 1000, 1000, 0.4, { owner: 'player' }), off = (a.def.beam + SHIPS[tb].beam) / 2 + gap;
  const b = ship(tb, 1000 - Math.sin(0.4) * off, 1000 + Math.cos(0.4) * off, 0.4);
  return { a, b };
}
const big = Object.keys(SHIPS).filter((k) => shipDims({ ...SHIPS[k] }).big);
/** Someone standing on ship `s`'s deck at (t, v) (her own frame): one of your crew, or you. */
function on(g, s, t, v, o = {}) {
  const q = deckToWorld(s, t, v), dk = deckPoint(s, q.x - s.x, q.y - s.y, 0);
  return { name: 'mate', x: q.x, y: q.y, z: 0, vz: 0, r: 0.35, state: 'idle', inWater: false, onShip: false, climb: null, deck: dk && { ...dk, ship: s }, feetH: () => (dk ? dk.h : 0), ...o };
}
/** Where (x, y) is in ship `s`'s frame. */
const frame = (s, x, y) => ({ u: (x - s.x) * Math.cos(s.heading) + (y - s.y) * Math.sin(s.heading), v: -(x - s.x) * Math.sin(s.heading) + (y - s.y) * Math.cos(s.heading) });
/** Nothing in the way (a gun, a mast, the bulwark) along the deck of `s` from (x0, y0) toward (x1, y1), as far as her deck goes. */
function clearRun(s, x0, y0, x1, y1, r) {
  const l = Math.hypot(x1 - x0, y1 - y0);
  for (let k = 0; k <= l; k += 0.1) {
    const dp = deckPoint(s, x0 + (x1 - x0) * k / l - s.x, y0 + (y1 - y0) * k / l - s.y, r);
    if (!dp) return true;
    if (dp.solid) return false;
  }
  return true;
}

test('from amidships on every big ship, a clear way out to her rail toward a ship alongside, and over it: a leap where it\'s a jump, else a dive', () => {
  for (const ta of big) {
    for (const [gap, leap] of [[1.2, true], [14, false]]) {
      const { a: T, b: S } = pair(ta, 'caravel', gap), g = game([T, S]);
      const you = on(g, S, 0.5, 0);
      // (a spot on her main deck near the middle, clear of the mainmast)
      let mate = null;
      for (let k = 0; k < 40 && !(mate?.deck && !mate.deck.solid && mate.deck.lvl === 'main'); k++) mate = on(g, T, 0.5 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.01, -1.5);
      // first to the inboard end of a clear way out (or straight there if it's already in one)
      let nav = shipNav(g, mate, you);
      assert.ok(nav && !nav.climb, `${ta}: nowhere to go`);
      const lane = clearLane(g, T, 1, mate.deck.t, 0.35, 'main');
      assert.ok(lane, `${ta}: no clear way out to her starboard rail`);
      if (deckPoint(T, nav.x - T.x, nav.y - T.y, 0)) {
        assert.ok(Math.hypot(nav.x - lane.inb.x, nav.y - lane.inb.y) < 0.01, `${ta}: not making for the clear way`);
        const f = frame(T, nav.x, nav.y);
        mate = on(g, T, (f.u + shipDims(T.def).L / 2) / shipDims(T.def).L, f.v);
        nav = shipNav(g, mate, you);
      }
      // then straight out over her rail, and nothing on her deck in the way
      assert.ok(!deckPoint(T, nav.x - T.x, nav.y - T.y, 0), `${ta}: not out over her side`);
      assert.ok(clearRun(T, mate.x, mate.y, nav.x, nav.y, 0.35 * 0.7), `${ta}: a gun or the like between ${mate.deck.t.toFixed(3)} and her rail`);
      // at her rail: over it — a leap for the other's deck, or a dive for her ladder
      const f = frame(T, lane.out.x, lane.out.y), dT = shipDims(T.def);
      const atRail = on(g, T, (f.u + dT.L / 2) / dT.L, f.v);
      const go = shipNav(g, atRail, you);
      assert.equal(go.jump, leap ? 1 : 0.55, `${ta}, ${gap} m of water: ${go.jump}`);
      assert.ok(atRail.navJump?.ship === S && atRail.navJump.leap === leap, `${ta}: the jump over her rail`);
    }
  }
});

test('in the air off her rail: a leap makes on for the other deck, a dive for her ladder', () => {
  const { a: T, b: S } = pair('galleon', 'brigantine', 1.2), g = game([T, S]);
  const you = on(g, S, 0.5, 0);
  const mid = { x: (T.x + S.x) / 2, y: (T.y + S.y) / 2 };
  const flying = (o) => ({ name: 'mate', ...mid, z: 1.2, vz: 2, r: 0.35, state: 'idle', inWater: false, onShip: false, climb: null, deck: null, feetH: () => 4, ...o });
  const leap = shipNav(g, flying({ navJump: { ship: S, leap: true } }), you);
  assert.ok(deckPoint(S, leap.x - S.x, leap.y - S.y, 0), 'a leap: on for her deck');
  const dive = shipNav(g, flying({ navJump: { ship: S, leap: false } }), you);
  assert.ok(!deckPoint(S, dive.x - S.x, dive.y - S.y, 0), 'a dive: for her ladder, in the water');
});

test('up a gangway along its middle: from beside its steps back to their foot first; on it, along its line', () => {
  for (const [ta, tb] of [['war_galleon', 'brigantine'], ['galleon', 'galleon'], ['sloop', 'man_o_war']]) {
    const { a: A, b: B } = pair(ta, tb, 2.4), g = game([A, B]);
    const P = layPlank(g, A, B);
    assert.ok(P, `${ta}/${tb}: no plank`);
    g.planks.push(P);
    const L = P.pts(), d = L.dir, n = { x: -d.y, y: d.x };
    const pt = (k, e) => ({ x: L.x + d.x * k + n.x * e, y: L.y + d.y * k + n.y * e });
    const ke = (p) => ({ k: (p.x - L.x) * d.x + (p.y - L.y) * d.y, e: -(p.x - L.x) * d.y + (p.y - L.y) * d.x });
    const you = on(g, B, 0.5, 0);
    // (someone on A's deck at (k, e) from the plank's foot there — on the deck, not on its steps)
    const at = (k, e) => { const q = pt(k, e), dk = deckPoint(A, q.x - A.x, q.y - A.y, 0); return { name: 'mate', ...q, z: 0, r: 0.35, deck: dk && { ...dk, ship: A } }; };
    // beside its steps, halfway up them: back round to their foot, not along beside them
    const beside = at(0.8, 0.36), r1 = ke(deckRoute(g, beside, you.x, you.y, you));
    assert.ok(r1.k < -0.5 && Math.abs(r1.e) < 0.01, `${ta}/${tb}: from beside its steps to k ${r1.k.toFixed(2)} e ${r1.e.toFixed(2)}`);
    // lined up behind their foot: on up them, along its middle
    const behind = at(-0.9, 0.2), r2 = ke(deckRoute(g, behind, you.x, you.y, you));
    assert.ok(r2.k > -0.9 && r2.k < 0.2 && Math.abs(r2.e) < 0.01, `${ta}/${tb}: from behind its foot to k ${r2.k.toFixed(2)} e ${r2.e.toFixed(2)}`);
    // on it: along its middle line toward your end, or theirs
    const q = pt(L.len / 2, 0.1), dk = g.deckAt(q.x, q.y, 0);
    assert.ok(dk?.plank === P);
    const walker = { name: 'mate', ...q, z: 0, r: 0.35, deck: dk };
    const r3 = ke(deckRoute(g, walker, you.x, you.y, you)), back = on(g, A, 0.5, 0), r4 = ke(deckRoute(g, walker, back.x, back.y, back));
    assert.ok(r3.k > L.len / 2 && Math.abs(r3.e) < 0.01 && r4.k < L.len / 2 && Math.abs(r4.e) < 0.01);
  }
});

test('in the water on the far side of a hull from the ladder they want, they swim round her bow or stern, never under her', () => {
  const { a: T, b: S } = pair('war_galleon', 'brigantine', 3), g = game([T, S]);
  const you = on(g, S, 0.5, 0);
  // (off T's port side — S lies to her starboard)
  const q = deckToWorld(T, 0.5, -(hbAt(0.5, shipDims(T.def).B) + 2.5));
  const swimmer = { name: 'mate', x: q.x, y: q.y, z: 0, vz: 0, r: 0.35, state: 'idle', inWater: true, onShip: false, climb: null, deck: null, feetH: () => -0.6 };
  const nav = shipNav(g, swimmer, you);
  assert.ok(nav && !nav.climb);
  // (a point clear of T's hull, the straight swim to it clear of her too)
  assert.ok(hullGap(T, nav.x - T.x, nav.y - T.y) > 0, 'swimming for a point under her');
  for (let k = 0; k <= 1; k += 0.02) {
    const x = swimmer.x + (nav.x - swimmer.x) * k, y = swimmer.y + (nav.y - swimmer.y) * k;
    assert.ok(hullGap(T, x - T.x, y - T.y) > 0, `the way to it runs under her (at ${k.toFixed(2)})`);
  }
  assert.ok(Math.abs(frame(T, nav.x, nav.y).u) > shipDims(T.def).L / 2, 'not round her end');
  // and on round, a stroke at a time, to the foot of S's ladder — out in the open water all the way
  let go = nav, n = 0;
  for (; n < 600 && !go.climb; n++) {
    const dx = go.x - swimmer.x, dy = go.y - swimmer.y, l = Math.hypot(dx, dy);
    if (l > 1e-6) { swimmer.x += dx / l * Math.min(0.4, l); swimmer.y += dy / l * Math.min(0.4, l); }
    for (const s of [T, S]) assert.ok(hullGap(s, swimmer.x - s.x, swimmer.y - s.y) > 0, `under the ${s.type} after ${n} strokes`);
    go = shipNav(g, swimmer, you);
  }
  assert.ok(go.climb?.ship === S, `still swimming after ${n} strokes`);
});
