// `npm test`: the owned-ships fleet (src/game/fleet.js) — old saves become
// fleets, ships join and leave it, and bringing one round to a pier leaves
// just one of her afloat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeFleet, recordShip, dropShip, ownsShip, launchShip, liveShips, dockOf } from '../src/game/fleet.js';
import { SHIPS, SHIPS_UNBREAKABLE, shipStats, shotCapFor } from '../src/data/ships.js';

test('your ships are unbreakable (for now), with shot and stats worked out from the class', () => {
  assert.equal(SHIPS_UNBREAKABLE, true);
  assert.equal(shotCapFor(0), 0);
  assert.equal(shotCapFor(4), 32);
  const d = shipStats('sloop', ['extra_cannons', 'hull_plating']);
  assert.equal(d.cannons, SHIPS.sloop.cannons + 2);
  assert.equal(d.maxHull, Math.round(SHIPS.sloop.hull * 1.3));
});

test('an old save: the ships it had (afloat or left in a zone) become owned ships', () => {
  const c = {
    ships: [{ uid: 'a', type: 'dinghy', name: 'Little Rowboat', x: 1, y: 2 }, { type: 'caravel', name: 'No Uid', x: 5, y: 6 }, { uid: 'z', type: 'bogus', name: 'Not a ship' }],
    zoneShips: [{ uid: 'b', type: 'sloop', name: 'Up In The Sky', zone: 'skypiea' }, { uid: 'a', type: 'dinghy', name: 'Little Rowboat' }],
  };
  upgradeFleet(c);
  assert.deepEqual(c.fleet.map((f) => f.name), ['Little Rowboat', 'No Uid', 'Up In The Sky']);
  // (a ship with no uid gets one, in the fleet and where she's saved afloat alike)
  assert.ok(c.ships[1].uid);
  assert.equal(c.fleet[1].uid, c.ships[1].uid);
  // (a save that already has a fleet is left alone)
  const again = JSON.stringify(c.fleet);
  upgradeFleet(c);
  assert.equal(JSON.stringify(c.fleet), again);
});

test('ships join the fleet, keep their records up to date, and leave it when they sink', () => {
  const c = { fleet: [] };
  recordShip(c, { uid: 's1', type: 'sloop', name: 'Sea Sparrow', upgrades: [], shot: 24 });
  recordShip(c, { uid: 's1', type: 'sloop', name: 'Renamed', upgrades: ['better_sails'], shot: 3 });
  recordShip(c, { uid: 's2', type: 'nope', name: 'Bogus' });
  assert.equal(c.fleet.length, 1);
  assert.deepEqual({ name: c.fleet[0].name, up: c.fleet[0].upgrades, shot: c.fleet[0].shot }, { name: 'Renamed', up: ['better_sails'], shot: 3 });
  c.activeShip = 's1';
  dropShip(c, 's1');
  assert.equal(c.fleet.length, 0);
  assert.equal(c.activeShip, null);
});

test('owning a Grand Line ship counts whether she is afloat or laid up', () => {
  const game = { state: { char: { fleet: [{ uid: 'x', type: 'dinghy', upgrades: [] }] } }, ships: [] };
  assert.equal(ownsShip(game, (d) => d.grandLine), false);
  game.state.char.fleet.push({ uid: 'y', type: 'sloop', upgrades: ['extra_cannons'] });
  assert.equal(ownsShip(game, (d) => d.grandLine), true);
  assert.equal(ownsShip(game, (d) => d.cannons >= 4), true);
  // (no fleet yet: what's afloat)
  assert.equal(ownsShip({ state: { char: {} }, ships: [{ owner: 'player', def: SHIPS.caravel }] }, (d) => d.grandLine), true);
});

// A flat sea with two piers far apart, and just enough of a game to launch ships at them.
function harbour() {
  const pier = (x, name) => ({ name, end: { x, y: 0 }, moor: { x: x + 5, y: 0 }, headHalf: 4, dirX: 0, dirY: 1 });
  const A = pier(0, 'A'), B = pier(1000, 'B');
  const world = { islands: [{ x: 0, y: -20, radius: 30, docks: [A] }, { x: 1000, y: -20, radius: 30, docks: [B] }], dx: (a, b) => b - a, distance: (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0) };
  const c = { fleet: [] };
  let n = 0;
  const game = { world, state: { char: c }, ships: [], player: { mode: 'foot', ship: null, deck: null } };
  game.giveShip = (type, x, y, name, extra = {}) => {
    const s = { type, name, x, y, heading: 0, uid: extra.uid || `u${n++}`, owner: 'player', def: shipStats(type), upgrades: extra.upgrades || [], shot: extra.shot, alive: true, sunk: false, aboard: new Set(), passengers: [], shipIn: () => null, unstick: () => true };
    game.ships.push(s);
    recordShip(c, s);
    return s;
  };
  return { game, c, A, B };
}

test('a bought ship is launched at the pier, and whatever of yours lay there goes into the yard', () => {
  const { game, c, A } = harbour();
  const boat = game.giveShip('dinghy', A.moor.x, A.moor.y, 'Little Rowboat');
  assert.equal(dockOf(game.world, boat), A);
  const r = launchShip(game, { type: 'sloop', name: 'Sea Sparrow' }, A);
  assert.equal(r.ship.name, 'Sea Sparrow');
  assert.deepEqual(r.laidUp, ['Little Rowboat']);
  assert.deepEqual(liveShips(game).map((s) => s.name), ['Sea Sparrow']);
  assert.deepEqual(c.fleet.map((f) => f.name), ['Little Rowboat', 'Sea Sparrow']);
  assert.equal(c.activeShip, r.ship.uid);
  assert.equal(game.player.ship, r.ship);
});

test('bringing a ship round takes her from wherever she was: one of her afloat, never two', () => {
  const { game, c, A, B } = harbour();
  const s = game.giveShip('caravel', B.moor.x, B.moor.y, 'Far Away');
  const r = launchShip(game, c.fleet[0], A);
  const copies = liveShips(game).filter((x) => x.uid === s.uid);
  assert.equal(copies.length, 1);
  assert.equal(dockOf(game.world, copies[0]), A);
  assert.equal(r.ship.uid, s.uid);
  // (she's here already; and you can't have her fetched out from under your feet)
  assert.equal(launchShip(game, c.fleet[0], A).why, 'here');
  game.player.deck = { ship: copies[0] };
  assert.equal(launchShip(game, c.fleet[0], B).why, 'aboard');
  // (a ship laid up in the yards is brought round too)
  game.player.deck = null;
  const up = { uid: 'navy1', type: 'sloop', name: 'Marine Cutter', upgrades: [], from: 'the Navy' };
  c.fleet.push(up);
  const r2 = launchShip(game, up, B);
  assert.equal(r2.ship.name, 'Marine Cutter');
  assert.equal(liveShips(game).length, 2);
});
