// `npm test`: a multiplayer voyage between two (or three) games, over the
// local transport (Node's own BroadcastChannel), with just enough of a game
// for net/session.js: the host's welcome, who's aboard, the host's clock and
// weather reaching a guest, each drawing the other where they are, chat,
// a game of another version turned away, a code nobody hosts, two hosts on
// one code, and the host leaving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Voyage } from '../src/net/session.js';
import { BIT } from '../src/net/protocol.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 4000;
function world(islands = [{ id: 'dawn', x: 100, y: 200, radius: 40 }]) {
  return {
    width: W, height: 2000, zone: 0, islands,
    wx: (x) => ((x % W) + W) % W,
    dx: (a, b) => { const d = b - a; return ((((d + W / 2) % W) + W) % W) - W / 2; },
    dist2(ax, ay, bx, by) { const dx = this.dx(ax, bx), dy = by - ay; return dx * dx + dy * dy; },
    distance(ax, ay, bx, by) { return Math.sqrt(this.dist2(ax, ay, bx, by)); },
  };
}
/** Just enough of a game; `name` puts a pirate in the world. */
function game(name = null, islands) {
  const w = world(islands);
  const days = [];
  const g = {
    surface: w, world: w, ships: [], net: null, paused: false, days,
    env: { day: 1, clock: 8.5, stormTarget: 0, windTarget: 0.4, windAngle: 0.4, forecast: 'Clear', weatherTimer: 30, time: 0, update(dt) { this.clock += dt * 24 / 960; } },
    inZone: () => null,
    onNewDay: (d) => days.push(d),
    state: null, player: null,
  };
  if (name) enterWorld(g, name);
  return g;
}
function enterWorld(g, name, x = 120, y = 210) {
  g.state = { char: { name, race: 'human', faction: 'civilian', crewName: null, jr: null } };
  g.player = {
    x, y, z: 0, facing: 0, vx: 0, vy: 0, vz: 0, speed: 0, moving: false, intent: { sprint: false, mz: 0 },
    look: { race: 'human', hair: 'short', top: '#d63031' }, style: 'brawler', weapon: null, fruit: null, gills: false, buffs: [],
    mode: 'foot', state: 'idle', atkSpeed: () => 1,
  };
}
const code = () => 'V' + Math.random().toString(36).slice(2, 7).toUpperCase();
/** Run every voyage's frame for `ms` of real time. */
async function run(voyages, ms) {
  const t0 = Date.now();
  let last = performance.now();
  while (Date.now() - t0 < ms) {
    await sleep(16);
    const now = performance.now(), dt = (now - last) / 1000;
    last = now;
    for (const v of voyages) v.frame(dt);
  }
}
const open = async (g, opts) => { const v = new Voyage(g, { kind: 'local', ...opts }); g.net = v; await v.start(); return v; };

test('a guest finds the host by its code, is welcomed, and each sees the other where they are', async () => {
  const c = code();
  const gh = game('Rin Stormwell'), gg = game('Kaito Kurogane');
  gh.env.day = 7; gh.env.clock = 20.5; gh.env.stormTarget = 0.8; gh.env.forecast = 'Storm';
  const host = await open(gh, { role: 'host', code: c, slot: 1 });
  const guest = await open(gg, { role: 'guest', code: c, slot: 2 });
  let joined = 0, chat = null;
  guest.on('joined', () => joined++);
  host.on('chat', (m) => { chat = m; });
  await run([host, guest], 400);
  assert.equal(host.status, 'open');
  assert.equal(guest.status, 'joined');
  assert.equal(joined, 1);
  assert.equal(guest.hostName, 'Rin Stormwell');
  assert.deepEqual(host.crew().map((m) => m.name), ['Rin Stormwell', 'Kaito Kurogane']);
  // (the host's clock and weather are the guest's, and the guest rolls no weather of its own)
  assert.equal(gg.env.day, 7);
  assert.ok(Math.abs(gg.env.clock - gh.env.clock) < 0.05, `${gg.env.clock} vs ${gh.env.clock}`);
  assert.equal(gg.env.stormTarget, 0.8);
  assert.equal(gg.env.forecast, 'Storm');
  assert.ok(gg.env.weatherTimer > 1e8);
  assert.deepEqual(gg.days, [7]);
  // each draws the other, named and dressed as they are
  assert.equal(host.avatars.length, 1);
  assert.equal(host.avatars[0].name, 'Kaito Kurogane');
  assert.equal(guest.avatars[0].look.top, '#d63031');
  // the guest walks east: the host draws them following, a moment behind, never ahead
  const p = gg.player;
  for (let i = 0; i < 40; i++) {
    p.x += 0.1; p.vx = 6; p.moving = true; p.speed = 6;
    await run([host, guest], 16);
    const seen = host.avatars[0];
    assert.ok(seen.x <= p.x + 1e-6, 'drawn ahead of where they are');
  }
  p.vx = 0; p.moving = false; p.speed = 0;
  await run([host, guest], 900);
  assert.ok(Math.abs(host.avatars[0].x - p.x) < 0.02, `drawn at ${host.avatars[0].x}, really at ${p.x}`);
  assert.equal(host.avatars[0].moving, false);
  // chat: cleaned, named
  guest.say('  Ahoy\u0007 captain!  ');
  await run([host, guest], 100);
  assert.deepEqual({ name: chat.name, text: chat.text }, { name: 'Kaito Kurogane', text: 'Ahoy captain!' });
  // the host leaves: the voyage is over for the guest, who sails on alone
  let failed = null;
  guest.on('failed', (e) => { failed = e.code; });
  host.close('quit');
  await run([guest], 200);
  assert.equal(failed, 'hostLeft');
  assert.equal(gg.net, null);
  assert.ok(gg.env.weatherTimer < 100, 'the guest\'s own weather back');
});

test('a technique, a dodge and a ship: drawn on the other game as they happen', async () => {
  const c = code();
  const gh = game('Rin'), gg = game('Kaito');
  const host = await open(gh, { role: 'host', code: c });
  const guest = await open(gg, { role: 'guest', code: c });
  await run([host, guest], 300);
  const p = gh.player;
  // a heavy blow (any registered technique will do: the stand-in only animates it)
  p.action = { def: { id: 'nonexistent_move', windup: 0.2 }, t: 0 };
  await run([host, guest], 300);
  const r = [...guest.remotes.values()][0];
  assert.equal(r.now.aid, 'nonexistent_move');
  assert.equal(guest.avatars[0].action, null, 'an unknown technique is not drawn');
  p.action = null;
  p.dash = { vx: 10, vy: 0, t: 0.2, t0: 0.22, dodge: true };
  await run([host, guest], 120);
  p.dash = null;
  // (drawn a moment after it happened, as everything of theirs is)
  await run([host, guest], 350);
  assert.ok(r.dodgeN >= 1, 'the dodge came over');
  // at the helm of a sloop, under sail
  const ship = { uid: 'ship1', id: 9, type: 'sloop', name: 'Sea Sparrow', x: 300, y: 260, heading: 1, speed: 0, sailSet: 1, upgrades: [], owner: 'player', def: { length: 14 } };
  gh.ships.push(ship);
  Object.assign(p, { mode: 'sail', ship, onShip: true, x: ship.x, y: ship.y });
  await run([host, guest], 500);
  const seen = guest.ships[0];
  assert.ok(seen, 'the ship is drawn');
  assert.equal(seen.type, 'sloop');
  assert.equal(seen.name, 'Sea Sparrow');
  assert.ok(Math.abs(seen.x - 300) < 0.5 && Math.abs(seen.y - 260) < 0.5);
  const a = guest.avatars[0];
  assert.equal(a.mode, 'sail');
  assert.equal(a.ship, seen);
  assert.ok(a.deck && a.deck.ship === seen, 'at her helm, on her deck');
  assert.ok(r.now.b & BIT.helm);
  host.close(); guest.close();
});

test('a game of another version (another world) is turned away, with the reason', async () => {
  const c = code();
  const host = await open(game('Rin'), { role: 'host', code: c });
  const gg = game(null, [{ id: 'dawn', x: 101, y: 200, radius: 40 }]);
  const guest = await open(gg, { role: 'guest', code: c });
  let why = null;
  guest.on('failed', (e) => { why = e.code; });
  await run([host, guest], 300);
  assert.equal(why, 'world');
  assert.equal(host.remotes.size, 0);
  host.close();
});

test('a code nobody hosts: the guest gives up looking, and says so', async () => {
  const gg = game();
  const guest = await open(gg, { role: 'guest', code: code(), searchMs: 250 });
  let why = null;
  guest.on('failed', (e) => { why = e.code; });
  await run([guest], 450);
  assert.equal(why, 'notfound');
  assert.equal(gg.net, null);
});

test('two hosts on one code (a lineage hosted in two tabs): the later gives way', async () => {
  const c = code();
  const a = await open(game('Rin'), { role: 'host', code: c });
  await sleep(5);
  const b = await open(game('Rin'), { role: 'host', code: c });
  let why = null;
  b.on('failed', (e) => { why = e.code; });
  await run([a, b], 300);
  assert.equal(why, 'taken');
  assert.equal(a.status, 'open');
  a.close();
});

test('a guest leaving: gone from the host\'s crew at once', async () => {
  const c = code();
  const host = await open(game('Rin'), { role: 'host', code: c });
  const guest = await open(game('Kaito'), { role: 'guest', code: c });
  const notes = [];
  host.on('note', (t) => notes.push(t));
  await run([host, guest], 300);
  assert.equal(host.remotes.size, 1);
  guest.close('left');
  await run([host], 150);
  assert.equal(host.remotes.size, 0);
  assert.equal(host.avatars.length, 0);
  assert.ok(notes.some((t) => /Kaito has left the voyage/.test(t)), notes.join(' | '));
  host.close();
});
