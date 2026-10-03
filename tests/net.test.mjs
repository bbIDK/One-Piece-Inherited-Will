// `npm test`: multiplayer's pure parts — room codes (src/net/code.js), the
// wire format and its checks on what comes in (protocol.js), the smooth
// in-between drawing of the other players (interp.js), and the local
// transport between pages of one browser (transport.js, over Node's own
// BroadcastChannel). And going aboard another player's ship: her stand-in
// solid and walkable here (game/decks.js, ladders.js), riding her as she
// sails and turns (Ship.carry), set down safely when she's gone, and three
// games over the local transport each drawing you on her as they draw her.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCode, normalizeCode, showCode, CODE_ABC, CODE_LEN } from '../src/net/code.js';
import { readHello, readLook, readShip, readState, readSay, readEnv, stateChanged, flat, cleanText, worldSig, BIT, PROTO, REV } from '../src/net/protocol.js';
import { SnapBuffer } from '../src/net/interp.js';
import { localTransport, netKind, relayUrls } from '../src/net/transport.js';
import { Voyage, shipId } from '../src/net/session.js';
import { Ship, anyShips, allShips } from '../src/game/ship.js';
import { installDecks, placeOnDeck, shipGone } from '../src/game/decks.js';
import { installLadders, ladderFoot } from '../src/game/ladders.js';
import { Actor } from '../src/game/actor.js';
import { T } from '../src/world/tiles.js';
import { shipDims, deckToWorld, deckLift, topAt } from '../src/world/hull.js';

test('room codes: six letters without I or O, typed in any case with spaces or dashes', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const c = newCode();
    assert.equal(c.length, CODE_LEN);
    for (const ch of c) assert.ok(CODE_ABC.includes(ch), c);
    assert.ok(!/[IO0-9]/.test(c));
    seen.add(c);
  }
  assert.ok(seen.size > 495, 'codes repeat far too often');
  // (the extremes of the random source stay in the alphabet)
  assert.equal(newCode(() => 0), 'AAAAAA');
  assert.equal(newCode(() => 0.9999999), 'ZZZZZZ');
  assert.equal(normalizeCode(' abc-def '), 'ABCDEF');
  assert.equal(normalizeCode('Abc Def'), 'ABCDEF');
  assert.equal(normalizeCode('ab.cd.ef'), 'ABCDEF');
  for (const bad of ['ABCDE', 'ABCDEFG', 'ABCDE1', 'ABCDEO', 'ABCDEI', '', null, undefined, 123456]) assert.equal(normalizeCode(bad), null, String(bad));
  assert.equal(showCode('ABCDEF'), 'ABC DEF');
});

test('what comes in is checked: types, ranges, short strings, no nesting, nothing unknown passed on', () => {
  assert.equal(cleanText('  Ahoy\u0000 there\n\tmate  ', 50), 'Ahoy there mate');
  assert.equal(cleanText('x'.repeat(500), 200).length, 200);
  assert.equal(cleanText(42, 10, 'd'), 'd');
  const f = flat({ hair: 'spiky', scale: 1.2, fem: false, hat: null, bad: { x: 1 }, arr: [1], 'no-dash': 1, __proto__: { evil: 1 }, fn: () => 1, big: 1e99 });
  assert.deepEqual(Object.keys(f).sort(), ['big', 'fem', 'hair', 'hat', 'scale']);
  assert.equal(f.big, 1e6);
  assert.equal(flat('nope'), null);
  assert.equal(flat([1, 2]), null);

  assert.equal(readHello({ k: 'hi', role: 'admin' }), null);
  const hi = readHello({ k: 'hi', v: PROTO, role: 'guest', sig: 'abc', name: 'Rin\u0007 Stormwell', slot: 2, play: 1 });
  assert.equal(hi.name, 'Rin Stormwell');
  assert.equal(hi.play, true);

  const lk = readLook({ k: 'lk', n: 'Kaito', r: 'mink', look: { race: 'mink', fur: '#fff' }, wp: { kind: 'sword', count: 9, ids: ['wado', 'x y'] }, fr: 'gomu', bf: [{ id: 'gear2', aura: 'rgba(255,0,0,.5)', scale: 99 }, { id: 'bad id' }] });
  assert.equal(lk.race, 'mink');
  assert.deepEqual(lk.weapon.ids, ['wado']);
  assert.equal(lk.weapon.count, 3);
  assert.equal(lk.buffs.length, 1);
  assert.equal(lk.buffs[0].scale, 6);
  assert.equal(readLook({ k: 'lk', n: 'x', look: 'not a look' }), null);
  assert.equal(readLook({ k: 'lk', n: 'x', look: {}, wp: { kind: 'bazooka' } }).weapon, null);

  assert.deepEqual(readShip({ k: 'sh', id: null }), { id: null });
  const sh = readShip({ k: 'sh', id: 's1', ty: 'caravel', n: 'Going Merry', co: 1, up: ['sails', 7, 'cannon'] });
  assert.deepEqual(sh.upgrades, ['sails', 'cannon']);
  assert.equal(sh.coated, true);
  assert.equal(readShip({ k: 'sh', id: 's1', ty: '../evil' }), null);

  assert.equal(readState({ k: 'st', t: 1, x: NaN, y: 0 }), null);
  const st = readState({ k: 'st', q: 3, t: 1000, w: '', x: 12.5, y: -4, z: 0.4, f: 1.2, b: BIT.moving | BIT.sprint, st: 'brawler', dk: [1, 0.5, 2.1], s: [10, 20, 0.5, 3, 1, 0, 0, 0, 0], si: 's1', a: [4, 'brawler_m1', 0.1, 1.2], dg: [1, 3, 4, 0.05], z9: 'ignored' });
  assert.equal(st.x, 12.5);
  assert.equal(st.du, 1);
  assert.equal(st.sx, 10);
  assert.equal(st.aid, 'brawler_m1');
  assert.equal(st.gn, 1);
  assert.equal(st.z9, undefined);
  assert.equal(readState({ k: 'st', t: 1, x: 0, y: 0, a: [1, '<img>', 0, 1] }).aid, undefined);
  assert.equal(readState({ k: 'st', t: 1, x: 1e30, y: 0 }).x, 1e7);

  assert.equal(readSay({ k: 'say', text: '   ' }), null);
  assert.equal(readSay({ k: 'say', text: '<b>hi</b>' }), '<b>hi</b>'); // (shown as text, never as HTML)
  const env = readEnv({ live: true, day: 0, clock: 30, st: 3 });
  assert.equal(env.day, 1);
  assert.equal(env.clock, 23.9999);
  assert.equal(env.st, 1);
});

test('a state only counts as changed when something did (to the centimetre)', () => {
  const a = { k: 'st', q: 1, t: 100, x: 1.25, y: 2, f: 0.5, b: 0, s: [1, 2, 3] };
  assert.equal(stateChanged(a, { ...a, q: 2, t: 200 }), false);
  assert.equal(stateChanged(a, { ...a, x: 1.26 }), true);
  assert.equal(stateChanged(a, { ...a, s: [1, 2, 4] }), true);
  assert.equal(stateChanged(a, { ...a, s: undefined }), true);
  const { s, ...noShip } = a;
  assert.equal(stateChanged(a, noShip), true);
  assert.equal(stateChanged(noShip, { ...noShip, dk: [1, 2, 3] }), true);
  assert.equal(stateChanged(null, a), true);
  assert.ok(s);
});

test('the world fingerprint changes when any island moves', () => {
  const w = { width: 1000, height: 500, islands: [{ id: 'a', x: 10, y: 20, radius: 5 }, { id: 'b', x: 300, y: 40, radius: 9 }] };
  const sig = worldSig(w);
  assert.equal(sig, worldSig(JSON.parse(JSON.stringify(w))));
  w.islands[1].x = 302;
  assert.notEqual(worldSig(w), sig);
});

/** States from a player walking east at `v` m/s, sent every `gap` ms, arriving `lat` ms (± jitter) later. */
function feed(buf, { n = 30, gap = 83, v = 5, lat = 40, jitter = 0, x0 = 0, rnd = () => 0.5, t0 = 1000, extra = () => ({}) } = {}) {
  const arrivals = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + i * gap;
    arrivals.push({ s: { t, x: x0 + v * (t - t0) / 1000, y: 7, f: 0, vx: v, vy: 0, b: 1, w: '', ...extra(i) }, at: t + 5000 + lat + (rnd() - 0.5) * 2 * jitter });
  }
  arrivals.sort((a, b) => a.at - b.at);
  for (const a of arrivals) buf.push(a.s, a.at);
  return arrivals;
}

test('in between: drawn a moment in the past, gliding between states, with the clock offset and delay found', () => {
  const buf = new SnapBuffer();
  feed(buf);
  // (their clock runs 5 s behind ours plus the way here)
  assert.ok(Math.abs(buf.offset - 5040) < 1, `offset ${buf.offset}`);
  assert.ok(buf.delay > 90 && buf.delay < 200, `delay ${buf.delay}`);
  // walking at 5 m/s: at any moment, exactly where they were `delay` ms before
  let prev = null;
  for (let now = 7600; now < 8300; now += 16) {
    const s = buf.sample(now);
    const T = now - buf.offset - buf.delay;
    assert.ok(Math.abs(s.x - 5 * (T - 1000) / 1000) < 1e-6, `x ${s.x} at ${T}`);
    if (prev) assert.ok(s.x - prev.x > 0 && s.x - prev.x < 0.09, `a step of ${(s.x - prev.x).toFixed(3)} m in 16 ms`);
    prev = s;
  }
});

test('uneven arrivals still glide: no step backwards, none much bigger than the walking pace', () => {
  let seed = 7;
  const rnd = () => ((seed = Math.imul(seed, 1103515245) + 12345 >>> 0) / 4294967296);
  const buf = new SnapBuffer();
  const arr = feed(buf, { n: 60, jitter: 35, rnd });
  const start = arr[0].at + 400, end = arr[arr.length - 1].at;
  let prev = null, worst = 0;
  for (let now = start; now < end; now += 16) {
    const s = buf.sample(now);
    if (prev) {
      const d = s.x - prev.x;
      assert.ok(d >= -1e-9, `went back ${d}`);
      worst = Math.max(worst, d);
    }
    prev = s;
  }
  // (5 m/s is 0.08 m a frame; the delay easing in and out stretches it a little at most)
  assert.ok(worst < 0.12, `largest step ${worst.toFixed(3)} m`);
});

test('drawn while states keep coming, very unevenly (a slow machine, a bad line): never a step back, no leaps', () => {
  // a sender at 2 to 12 states a second, latency spiking now and then; drawn at 60 Hz as they arrive
  let seed = 11;
  const rnd = () => ((seed = Math.imul(seed, 1103515245) + 12345 >>> 0) / 4294967296);
  const buf = new SnapBuffer();
  const v = 4; // m/s
  const sent = [];
  let t = 0;
  for (let i = 0; t < 12000; i++) {
    sent.push({ t: 1000 + t, x: v * t / 1000, at: 1000 + t + 30 + (rnd() < 0.15 ? 250 * rnd() : 20 * rnd()) });
    t += [83, 400, 120, 700, 90, 300][i % 6] * (0.8 + 0.4 * rnd());
  }
  // (then they stop where they are: a state saying so, and "all quiet" every half second)
  const end = sent[sent.length - 1].x;
  for (let j = 0; j < 6; j++) sent.push({ t: 1000 + t + j * 500, x: end, hb: j > 0, at: 1000 + t + j * 500 + 40 });
  sent.sort((a, b) => a.at - b.at);
  let k = 0, prev = null, worst = 0, back = 0;
  for (let now = 1000; now < 1000 + t + 3500; now += 16) {
    while (k < sent.length && sent[k].at <= now) { const s = sent[k++]; buf.push({ t: s.t, x: s.x, y: 0, vx: s.hb || s.x === end ? 0 : v * 3, vy: 0, w: '', hb: s.hb }, now); }
    const s = buf.sample(now);
    if (!s) continue;
    if (prev) {
      const d = s.x - prev;
      if (d < -1e-9) back++;
      worst = Math.max(worst, d);
    }
    prev = s.x;
  }
  assert.equal(back, 0, 'stepped back');
  // (4 m/s is 0.064 m a frame. Catching up after a state came late is eased in at no more than a
  // quarter again of their pace and a brisk walk on top; the guess ahead goes by how fast they
  // really went — not the speed they say, here three times too high)
  assert.ok(worst <= (4 * 1.25 + 1.5) * 0.016 + 0.02 + 1e-9, `largest step ${worst.toFixed(3)} m`);
  assert.ok(Math.abs(prev - end) < 0.01, `ended at ${prev}, they stopped at ${end}`);
});

test('late states: guessed on along the way for a moment, then held', () => {
  const buf = new SnapBuffer({ ahead: 200 });
  feed(buf, { n: 10 });
  const last = buf.latest();
  const at = (late) => buf.sample(last.t + buf.offset + buf.delay + late);
  assert.ok(Math.abs(at(100).x - (last.x + 0.5)) < 1e-6);
  assert.ok(Math.abs(at(1000).x - (last.x + 1)) < 1e-6, 'held after 200 ms ahead');
  assert.ok(at(1000).late >= 999);
});

test('the world wraps east-west: the in-betweens go the short way across the seam', () => {
  const buf = new SnapBuffer({ width: 1000 });
  feed(buf, { n: 12, x0: 998, v: 12 });
  for (let now = 6200; now < 6900; now += 20) {
    const s = buf.sample(now);
    assert.ok(s.x >= 0 && s.x < 1000);
    const T = now - buf.offset - buf.delay, want = (998 + 12 * (T - 1000) / 1000) % 1000;
    assert.ok(Math.abs(buf.dx(want, s.x)) < 1e-6, `${s.x} vs ${want}`);
  }
});

test('angles turn the short way; a leap is not slid across', () => {
  const buf = new SnapBuffer();
  buf.push({ t: 0, x: 0, y: 0, f: 3.1, w: '' }, 100);
  buf.push({ t: 100, x: 0, y: 0, f: -3.1, w: '' }, 200);
  buf.push({ t: 200, x: 500, y: 0, f: -3.1, w: '' }, 300); // (a journey to a friend)
  buf.push({ t: 300, x: 501, y: 0, f: -3.1, w: '' }, 400);
  const mid = buf.sample(150 + buf.offset + buf.delay - 100);
  assert.ok(Math.abs(Math.abs(mid.f) - Math.PI) < 0.1, `turned the long way: ${mid.f}`);
  const leap = buf.sample(150 + buf.offset + buf.delay);
  assert.equal(leap.x, 0, 'slid towards the far place');
  assert.equal(buf.sample(250 + buf.offset + buf.delay).x, 500.5);
});

test('their page started over (its clock back at nought): the buffer starts afresh', () => {
  const buf = new SnapBuffer();
  feed(buf, { n: 10, t0: 90000 });
  assert.equal(buf.push({ t: 90000 + 5 * 83, x: 0, y: 0, w: '' }, 1e6), false, 'an old state is dropped');
  assert.equal(buf.push({ t: 50, x: 3, y: 4, w: '' }, 2e6), true);
  assert.equal(buf.buf.length, 1);
  assert.equal(buf.sample(2e6 + 500).x, 3);
});

test('discrete fields come from the state before the moment drawn; ship fields glide too', () => {
  const buf = new SnapBuffer();
  feed(buf, { n: 20, extra: (i) => ({ b: i < 10 ? BIT.moving : 0, an: i < 10 ? 0 : 1, aid: i < 10 ? undefined : 'heavy', sx: 100 + i, sy: 50, sh: 0.2 * i, si: 'ship1' }) });
  const t9 = 1000 + 9 * 83, t10 = 1000 + 10 * 83;
  const s = buf.sample((t9 + t10) / 2 + buf.offset + buf.delay);
  assert.equal(s.b, BIT.moving);
  assert.equal(s.aid, undefined);
  assert.ok(Math.abs(s.sx - 109.5) < 1e-6 && Math.abs(s.sh - 1.9) < 1e-6);
  const s2 = buf.sample(t10 + 10 + buf.offset + buf.delay);
  assert.equal(s2.aid, 'heavy');
  assert.ok(s2.lag > 0.009 && s2.lag < 0.011);
});

test('netKind: ?net=local picks the local transport, anything else the real one', () => {
  assert.equal(netKind('?net=local'), 'local');
  assert.equal(netKind('?debug=1&net=local'), 'local');
  assert.equal(netKind(''), 'trystero');
  assert.equal(netKind('?net=carrier-pigeon'), 'trystero');
});

test('relayUrls: ?relay= names the relays to meet through (wss:// or ws:// only), else the public ones', () => {
  assert.equal(relayUrls(''), null);
  assert.equal(relayUrls('?debug=1'), null);
  assert.deepEqual(relayUrls('?relay=wss://relay.example.org'), ['wss://relay.example.org']);
  assert.deepEqual(relayUrls('?debug=1&relay=ws://127.0.0.1:7777&net=x'), ['ws://127.0.0.1:7777']);
  assert.deepEqual(relayUrls('?relay=' + encodeURIComponent('wss://a.example, wss://b.example/nostr')), ['wss://a.example', 'wss://b.example/nostr']);
  // (anything that isn't a WebSocket address is left out; nothing left, the public ones)
  assert.deepEqual(relayUrls('?relay=javascript:alert(1),https://x.example,wss://ok.example'), ['wss://ok.example']);
  assert.equal(relayUrls('?relay=ftp://nope'), null);
  assert.equal(relayUrls('?relay=%E0%A4%A'), null);
  assert.equal(relayUrls('?relay=' + Array.from({ length: 12 }, (_, i) => `wss://r${i}.example`).join(',')).length, 8);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await wait(10); } };

test('the local transport: games in one room meet, talk to all or to one, and part', async () => {
  const code = 'T' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const log = { a: [], b: [], c: [] };
  const mk = (who) => localTransport(code, {
    onPeerJoin: (id) => log[who].push(['join', id]),
    onPeerLeave: (id) => log[who].push(['leave', id]),
    onMessage: (m, from) => log[who].push(['msg', from, m]),
  }, { beat: 50, timeout: 300 });
  const a = mk('a');
  const b = mk('b');
  await until(() => a.peers().includes(b.selfId) && b.peers().includes(a.selfId));
  // (a game in another room hears none of it)
  const other = localTransport(code + 'X', { onPeerJoin: () => assert.fail('another room') });
  b.send({ k: 'say', text: 'ahoy' });
  await until(() => log.a.some((e) => e[0] === 'msg'));
  assert.deepEqual(log.a.find((e) => e[0] === 'msg'), ['msg', b.selfId, { k: 'say', text: 'ahoy' }]);
  // a third: everyone meets everyone; a message to one reaches only that one
  const c = mk('c');
  await until(() => a.peers().length === 2 && b.peers().length === 2 && c.peers().length === 2);
  a.send({ k: 'x' }, c.selfId);
  await until(() => log.c.some((e) => e[0] === 'msg' && e[2].k === 'x'));
  await wait(60);
  assert.ok(!log.b.some((e) => e[0] === 'msg' && e[2].k === 'x'), 'b heard a message for c');
  // goodbye: at once
  c.leave();
  await until(() => !a.peers().includes(c.selfId) && !b.peers().includes(c.selfId));
  assert.ok(log.a.some((e) => e[0] === 'leave' && e[1] === c.selfId));
  // (and nothing more is sent or heard once you've left)
  c.send({ k: 'after' });
  b.send({ k: 'last' });
  await until(() => log.a.some((e) => e[0] === 'msg' && e[2].k === 'last'));
  assert.ok(!log.a.some((e) => e[0] === 'msg' && e[2].k === 'after'));
  assert.ok(!log.c.some((e) => e[0] === 'msg' && e[2].k === 'last'));
  // (each met the other two once, however many hellos and heartbeats passed)
  assert.equal(log.a.filter((e) => e[0] === 'join').length, 2, JSON.stringify(log.a.filter((e) => e[0] !== 'msg')));
  other.leave();
  a.leave();
  b.leave();
});

test('the local transport: a page gone silent is taken for gone after the timeout', async () => {
  const code = 'S' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const left = [];
  const a = localTransport(code, { onPeerLeave: (id) => left.push(id) }, { beat: 40, timeout: 250 });
  // (a "page" that says hello, then nothing more: a raw channel)
  const bc = new BroadcastChannel(`inherited-will.one-piece-roguelike:voyage-${code}`);
  bc.postMessage({ type: 'join', from: 'ghost' });
  await until(() => a.peers().includes('ghost'));
  bc.close();
  await until(() => left.includes('ghost'), 2000);
  a.leave();
});

// ------------------------------------------------------------ aboard another player's ship

test('aboard another player\'s ship (REV 1): whose she is, which, and where on her — checked; an older game reads you where you are', () => {
  assert.ok(REV >= 1);
  assert.equal(readHello({ k: 'hi', v: PROTO, role: 'guest' }).rev, 0, 'an older game\'s hello says nothing: 0');
  assert.equal(readHello({ k: 'hi', v: PROTO, rev: REV, role: 'guest' }).rev, REV);
  const base = { k: 'st', t: 1000, x: 310.5, y: 262.25, z: 0.3, b: BIT.roofed, g: 2.15 };
  const s = readState({ ...base, ab: ['Lpeer01abc', 'sA1', 4.5, -1.25, 1.9] });
  assert.deepEqual([s.ao, s.ai, s.au, s.av, s.ah], ['Lpeer01abc', 'sA1', 4.5, -1.25, 1.9]);
  // (anything else is no ship at all: a bad id, a number missing or not one, no list)
  for (const ab of [['bad id!', 'sA1', 0, 0, 0], ['L1', '', 0, 0, 0], ['L1', 'sA1', 0, NaN, 0], ['L1', 'sA1', 0, 0], 'L1', [7, 'sA1', 0, 0, 0], ['L1', { x: 1 }, 0, 0, 0], ['x'.repeat(65), 'sA1', 0, 0, 0]]) {
    const r = readState({ ...base, ab });
    assert.equal(r.ai, undefined, JSON.stringify(ab));
    assert.equal(r.au, undefined);
  }
  // (cut short, and kept to her size)
  const far = readState({ ...base, ab: ['L1', 'x'.repeat(90), 1e9, -1e9, 1e9] });
  assert.equal(far.ai.length, 40);
  assert.deepEqual([far.au, far.av, far.ah], [400, -100, 200]);
  // an older game knows nothing of `ab`: it reads where you are, and the height of the deck you're on
  const old = readState(base);
  assert.deepEqual([old.x, old.y, old.g, !!(old.b & BIT.roofed), old.ai], [310.5, 262.25, 2.15, true, undefined]);
  // (a state only counts as changed when where you stand on her does)
  const m = { ...base, ab: ['L1', 'sA1', 4.5, -1.25, 1.9] };
  assert.equal(stateChanged(m, { ...m, ab: ['L1', 'sA1', 4.5, -1.25, 1.9] }), false);
  assert.equal(stateChanged(m, { ...m, ab: ['L1', 'sA1', 4.51, -1.25, 1.9] }), true);
  assert.equal(stateChanged(m, base), true);
});

test('in between: where they stand aboard her glides; aboard another ship (or none) is a leap', () => {
  const buf = new SnapBuffer();
  feed(buf, { n: 20, v: 0, extra: (i) => ({ ao: 'L1', ai: 'sA1', au: i * 0.1, av: -1, ah: 1.9 }) });
  const t9 = 1000 + 9 * 83, t10 = 1000 + 10 * 83;
  const s = buf.sample((t9 + t10) / 2 + buf.offset + buf.delay);
  assert.ok(Math.abs(s.au - 0.95) < 1e-6, `au ${s.au}`);
  assert.equal(s.ai, 'sA1');
  const b2 = new SnapBuffer();
  feed(b2, { n: 4, v: 0, extra: (i) => (i < 2 ? { ao: 'L1', ai: 'sA1', au: 1, av: 0, ah: 1 } : i < 3 ? { ao: 'L2', ai: 'sA1', au: 5, av: 0, ah: 1 } : {}) });
  assert.deepEqual(b2.buf.map((x) => !!x.cut), [false, false, true, true]);
});

/** A sea (and a pier along it, east of x = pierX): just enough of a world for hulls, decks and the bodies on them. */
function seaWorld(pierX = Infinity) {
  const W = 4000;
  return {
    width: W, height: 4000, zone: 0, islands: [], quays: new Set(),
    wx: (x) => ((x % W) + W) % W,
    dx: (a, b) => { const d = b - a; return ((((d + W / 2) % W) + W) % W) - W / 2; },
    dist2(ax, ay, bx, by) { const dx = this.dx(ax, bx), dy = by - ay; return dx * dx + dy * dy; },
    distance(ax, ay, bx, by) { return Math.sqrt(this.dist2(ax, ay, bx, by)); },
    type(x) { return this.wx(x) >= pierX ? T.PLANK : T.SEA; },
    isLiquid(x, y) { return this.type(x, y) === T.SEA; },
    isOverlay(x, y) { return this.type(x, y) === T.PLANK; },
    solid: () => false, isBlocked: () => false, hitsProp: () => false, speedAt: () => 1, roomOf: () => null, interiorAt: () => null, floorRec: () => null, isQuay: () => false,
  };
}
/** Just enough of a game for decks, ladders and the bodies on them, and a voyage (no 3D view: the sea's surface is at 0). */
function seaGame(world = seaWorld()) {
  const g = {
    world, surface: world, ships: [], actors: [], planks: [], net: null, player: null, state: null, time: 0, paused: false, logs: [],
    env: { time: 0, day: 1, clock: 8.5, stormTarget: 0, windTarget: 0.4, windAngle: 0.4, forecast: 'Clear', weatherTimer: 30, update(dt) { this.clock += dt * 24 / 960; } },
    fx: { ripple() {}, burst() {}, text() {}, shake() {}, particle() {} },
    on() {}, emit() {}, log(t) { this.logs.push(t); }, inZone: () => null, onNewDay() {},
  };
  installDecks(g); installLadders(g);
  return g;
}
const body = (g, name, x = 0, y = 0) => { const a = new Actor({ name, look: { race: 'human', hair: 'short' } }); Object.assign(a, { game: g, x, y, mode: 'foot' }); g.actors.push(a); return a; };
/** A friend's ship as this game draws her (see net/remote.js applyShip). */
function standIn(x, y, heading, owner = 'Lfriend') {
  const s = new Ship({ type: 'sloop', x, y, heading, owner: 'remote', faction: 'player', name: 'Going Merry' });
  Object.assign(s, { netRemote: true, netOwner: owner, uid: 'sA1', anchored: false });
  return s;
}
/** Where `a` stands in ship `s`'s own frame: [u along her, v across]. */
function onHer(w, s, a) {
  const dx = w.dx(s.x, a.x), dy = a.y - s.y, c = Math.cos(s.heading), sn = Math.sin(s.heading);
  return [dx * c + dy * sn, -dx * sn + dy * c];
}
const near = (a, b, eps, what) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= eps, `${what}: ${a.map((v) => v.toFixed(4))} vs ${b.map((v) => v.toFixed(4))}`); };

test('riding a ship: each aboard stays just where they stood on her deck as she sails and turns (across the world\'s seam, and through ±π)', () => {
  const g = seaGame(), w = g.world, s = standIn(3990, 500, 3.0);
  g.net = { ships: [s] };
  const a = body(g, 'Kaito'), b = body(g, 'Rin');
  placeOnDeck(g, a, s, 0.62, 1.4); placeOnDeck(g, b, s, 0.3, -2);
  const a0 = onHer(w, s, a), b0 = onHer(w, s, b), f0 = a.facing;
  // (and someone on their way up her side: carried too)
  const up = { x: w.wx(s.x + 3), y: s.y - 4.4, facing: 0 }, up0 = onHer(w, s, up);
  let turned = 0;
  for (let i = 0; i < 150; i++) {
    const x0 = s.x, y0 = s.y, h0 = s.heading;
    // east across the seam at 12 m/s or so, turning to port through ±π (her heading kept in (−π, π], as a game might send it)
    s.x = w.wx(s.x + Math.cos(h0) * 0.1 + 0.3); s.y += Math.sin(h0) * 0.1;
    s.heading = Math.atan2(Math.sin(h0 + 0.004), Math.cos(h0 + 0.004));
    turned += 0.004;
    s.carry(w, x0, y0, h0, up);
    assert.ok(a.x >= 0 && a.x < w.width && up.x >= 0 && up.x < w.width);
  }
  assert.ok(s.x < 100, 'across the seam');
  assert.ok(s.heading < 0, 'through ±π');
  near(onHer(w, s, a), a0, 1e-6, 'Kaito on her deck');
  near(onHer(w, s, b), b0, 1e-6, 'Rin on her deck');
  near(onHer(w, s, up), up0, 1e-6, 'up her side');
  assert.ok(Math.abs(a.facing - f0 - turned) < 1e-9, `turned with her: ${a.facing - f0} vs ${turned}`);
  // someone no longer on her deck stays where they are, and isn't aboard any more
  b.deck = null;
  const bx = b.x, x0 = s.x;
  s.x = w.wx(s.x + 2);
  s.carry(w, x0, s.y, s.heading);
  assert.equal(b.x, bx);
  assert.ok(!s.aboard.has(b) && s.aboard.has(a));
});

test('another player\'s ship, as she\'s drawn here: her deck underfoot, her side a wall, her ladder climbed, and no hull through hers', () => {
  const g = seaGame(), w = g.world, s = standIn(500, 500, 0.7);
  const a = body(g, 'Kaito');
  const mid = deckToWorld(s, 0.5, 1);
  // (she's in no list the game's own systems go through: only the voyage's, while she's drawn)
  assert.equal(g.deckAt(mid.x, mid.y), null, 'no voyage: nothing there');
  assert.equal(anyShips(g), false);
  g.net = { ships: [s] };
  assert.ok(anyShips(g));
  assert.deepEqual(allShips(g), [s]);
  assert.equal(g.ships.length, 0);
  assert.equal(g.deckAt(mid.x, mid.y)?.ship, s, 'her deck');
  assert.equal(g.hullAt(mid.x, mid.y)?.ship, s, 'her hull');
  // swimming alongside: clear water beside her, but her side's a wall
  const d = shipDims(s.def), c = Math.cos(s.heading), sn = Math.sin(s.heading), half = d.B / 2;
  const off = (v) => ({ x: s.x - sn * v, y: s.y + c * v });
  const out = off(half + 1.5), into = off(half - 0.4);
  Object.assign(a, out, { inWater: true, depth: 0 });
  assert.ok(a.canOccupy(w, out.x + 0.1, out.y), 'clear water beside her');
  assert.equal(a.canOccupy(w, into.x, into.y), false, 'not into her side');
  assert.equal(a.blocked?.ship, s);
  // at the foot of her ladder: E climbs it
  const f = ladderFoot(s, d.ladders[0]);
  Object.assign(a, { x: f.x, y: f.y });
  assert.equal(g.ladderAt(a)?.ship, s);
  assert.match(g.footInteraction(a)?.label || '', /^Climb the ladder \(the Going Merry\)/);
  // on her deck: walked on, kept aboard by her bulwark, and found underfoot as you go
  a.inWater = false;
  placeOnDeck(g, a, s, 0.5, 0);
  const along = deckToWorld(s, 0.52, 0.3), over = off(half + 0.7);
  assert.ok(a.canOccupy(w, along.x, along.y), 'along her deck');
  assert.equal(a.canOccupy(w, over.x, over.y), false, 'not over her rail on foot');
  Object.assign(a, { x: along.x, y: along.y });
  a.updateDeck(g);
  assert.equal(a.deck?.ship, s);
  assert.ok(s.aboard.has(a));
  // a ship of yours alongside: no hull passes through hers
  const mine = new Ship({ type: 'sloop', ...off(10), heading: s.heading, owner: 'player' });
  mine.game = g; g.ships.push(mine);
  assert.equal(mine.shipIn(g, mine.x, mine.y, mine.heading), null, 'clear alongside');
  const o = off(5);
  assert.equal(mine.shipIn(g, o.x, o.y, mine.heading), s, 'not through her');
});

test('her deck gone from under you: set down where you stood — on the pier there, in the water — and a Devil Fruit user never left to drown', () => {
  // a pier a step off her side (her bow north: across her, +v, is east)
  const half = shipDims(standIn(0, 0, 0).def).B / 2;
  const g = seaGame(seaWorld(500 + half + 1.5)), w = g.world, s = standIn(500, 500, -Math.PI / 2);
  g.net = { ships: [s] };
  const swimmer = body(g, 'Kaito'), df = body(g, 'Luffy'), climber = body(g, 'Zoro');
  g.player = swimmer;
  df.fruit = 'gomu';
  placeOnDeck(g, swimmer, s, 0.5, half - 1.2); placeOnDeck(g, df, s, 0.4, half - 1);
  const at = { x: swimmer.x, y: swimmer.y }, deckH = deckLift(swimmer.deck, 0);
  climber.climb = { t: 0.2, T: 1, h0: 0, to: { ship: s, t: 0.5, v: 0 }, x0: 0, y0: 0 };
  g.planks.push({ a: {}, b: s });
  assert.equal(w.type(at.x, at.y), T.SEA, 'over the water, by the pier');
  g.net.ships = [];
  shipGone(g, s);
  assert.equal(s.aboard.size, 0);
  assert.equal(swimmer.deck, null);
  assert.deepEqual([swimmer.x, swimmer.y], [at.x, at.y], 'where they stood');
  assert.ok(Math.abs(swimmer.z - deckH) < 1e-9 && swimmer.vz < 0, `dropping from her deck's height into the water: z ${swimmer.z} vz ${swimmer.vz}`);
  assert.equal(df.deck, null);
  assert.equal(w.type(df.x, df.y), T.PLANK, 'the Devil Fruit user: onto the pier');
  assert.ok(w.distance(df.x, df.y, at.x, at.y) < 6);
  assert.equal(climber.climb, null, 'off her ladder');
  assert.ok(climber.vz < 0);
  assert.equal(g.planks.length, 0, 'the plank to her gone with her');
  assert.ok(g.logs.some((t) => /The Going Merry is gone from under your feet/.test(t)), g.logs.join(' | '));
  // at sea, nowhere to stand: a ship of their own (their crew fish them out) — with none, the sea
  const g2 = seaGame(), s2 = standIn(500, 500, 0);
  g2.net = { ships: [] };
  const own = new Ship({ type: 'sloop', x: 900, y: 650, heading: 1, owner: 'player', name: 'Thousand Sunny' });
  own.game = g2;
  const luffy = body(g2, 'Luffy'), chopper = body(g2, 'Chopper');
  luffy.fruit = 'gomu'; chopper.fruit = 'hito';
  placeOnDeck(g2, luffy, s2, 0.5, 0); placeOnDeck(g2, chopper, s2, 0.6, 0);
  goneFrom(g2, s2, [luffy]);
  assert.equal(luffy.deck, null, 'no ship of his own about: the sea');
  g2.ships.push(own);
  goneFrom(g2, s2, [chopper]);
  assert.equal(chopper.deck?.ship, own, 'aboard his own ship');
});
/** (her deck gone from under just these) */
function goneFrom(g, s, who) { const keep = [...s.aboard].filter((a) => !who.includes(a)); for (const a of keep) s.aboard.delete(a); shipGone(g, s); for (const a of keep) s.aboard.add(a); }

// ---- games over the local transport: A sails her, B stands aboard, C looks on
/** A pirate in the world (a body of the game's own: see Actor), at (x, y). */
function enter(g, name, x, y) {
  g.state = { char: { name, race: 'human', faction: 'pirate', crewName: null, jr: null } };
  g.player = body(g, name, x, y);
  g.player.isPlayer = true;
  return g.player;
}
/** A voyage over the local transport (closed when the test `t` is over, however it went: a page left open keeps the run alive). */
async function voyage(t, g, opts) { const v = new Voyage(g, { kind: 'local', ...opts }); g.net = v; t.after(() => v.close()); await v.start(); return v; }
/** Every voyage's frame for `ms` of real time (`each`: before each frame, with its dt). */
async function sail(voyages, ms, each) {
  const t0 = Date.now();
  let last = performance.now();
  while (Date.now() - t0 < ms) {
    await wait(16);
    const now = performance.now(), dt = (now - last) / 1000;
    last = now;
    each?.(dt);
    for (const v of voyages) v.frame(dt);
  }
}

test('aboard a friend\'s ship: you ride her as she sails, and everyone draws you on her as they draw her — the real one on her captain\'s screen', async (t) => {
  const code = 'D' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const gA = seaGame(), gB = seaGame(), gC = seaGame();
  const pA = enter(gA, 'Rin', 300, 300), pB = enter(gB, 'Kaito', 330, 310);
  enter(gC, 'Nami', 280, 330);
  // A's ship, moored, and A at her helm
  const ship = new Ship({ type: 'sloop', x: 300, y: 300, heading: 0.4, owner: 'player', name: 'Going Merry' });
  ship.uid = 'sA1'; ship.game = gA; gA.ships.push(ship);
  Object.assign(pA, { mode: 'sail', ship, onShip: true });
  ship.captain = pA;
  const A = await voyage(t, gA, { role: 'host', code }), B = await voyage(t, gB, { role: 'guest', code }), C = await voyage(t, gC, { role: 'guest', code });
  await sail([A, B, C], 700);
  assert.equal(B.status, 'joined');
  const herB = B.shipOf(A.selfId, 'sA1'), herC = C.shipOf(A.selfId, 'sA1');
  assert.ok(herB && herC, 'B and C draw her');
  assert.equal(B.remotes.get(A.selfId).rev, REV);
  assert.equal(shipId(ship), 'sA1');
  // B comes aboard (up her ladder, say: on her deck, in the end)
  placeOnDeck(gB, pB, herB, 0.66, -1.3);
  assert.ok(herB.aboard.has(pB));
  const uv = onHer(gB.world, herB, pB);
  // A sails off, turning; B rides her, just where they stood, as B's game draws her
  const seenA = () => A.avatars.find((a) => a.name === 'Kaito'), seenC = () => C.avatars.find((a) => a.name === 'Kaito');
  let worst = 0, frames = 0, onA = 0, onC = 0;
  await sail([A, B, C], 2200, (dt) => {
    // (each game as it drew its last frame: B where B's game drew her, A's drawing of B on her where she was then)
    if (pB.deck?.ship === herB) {
      frames++;
      worst = Math.max(worst, Math.hypot(...onHer(gB.world, herB, pB).map((v, i) => v - uv[i])));
      // on A's screen: on her (the real one); on C's, on C's drawing of her
      const a = seenA(), c = seenC();
      if (a?.deck?.ship === ship) { onA++; near(onHer(gA.world, ship, a), uv, 0.02, 'drawn on A\'s ship'); }
      if (c?.deck?.ship === herC) { onC++; near(onHer(gC.world, herC, c), uv, 0.02, 'drawn on C\'s drawing of her'); }
    }
    // A's game sails her on (then each game's frame)
    ship.sail = 1; ship.sailSet = 1; ship.speed = 9; ship.anchored = false;
    ship.x = gA.world.wx(ship.x + Math.cos(ship.heading) * 9 * dt); ship.y += Math.sin(ship.heading) * 9 * dt;
    ship.heading += 0.3 * dt;
    pA.x = ship.x; pA.y = ship.y;
  });
  assert.equal(pB.deck?.ship, herB, 'still aboard');
  assert.ok(frames > 60, `${frames} frames`);
  assert.ok(worst < 1e-6, `B slid ${worst} m on her deck`);
  assert.ok(gB.world.distance(herB.x, herB.y, 300, 300) > 10, 'and she did sail');
  assert.ok(onA > frames * 0.8 && onC > frames * 0.8, `drawn aboard on A ${onA}, on C ${onC} of ${frames} frames`);
  // what B sends: whose ship, which, where on her — and, for an older game, where B is at the deck's height
  const st = B.packState(performance.now(), B.shipShown());
  assert.deepEqual(st.ab.slice(0, 2), [A.selfId, 'sA1']);
  near(st.ab.slice(2, 4), uv, 0.006, 'sent');
  assert.ok(st.b & BIT.roofed && Math.abs(st.g - deckLift(pB.deck, 0)) < 0.01 && Math.abs(st.x - pB.x) < 0.01);
  // she's brought round to another pier (a leap): B rides her till B's game draws her leap, and
  // isn't carried off with her then, but set down just where B stood that moment
  ship.x = gA.world.wx(ship.x + 600);
  let last = null;
  await sail([A, B, C], 900, () => { if (pB.deck) last = { x: pB.x, y: pB.y }; });
  assert.equal(pB.deck, null, 'set down');
  assert.ok(last && gB.world.distance(pB.x, pB.y, last.x, last.y) < 1e-9, 'where B stood');
  assert.ok(gB.world.distance(pB.x, pB.y, herB.x, herB.y) > 500, 'not off with her');
  assert.ok(!herB.aboard.has(pB));
  // aboard again; then A leaves the voyage: her stand-in's gone, and B with it into the water where B stood
  await sail([A, B, C], 300);
  placeOnDeck(gB, pB, herB, 0.5, 0);
  const at = { x: pB.x, y: pB.y };
  A.close('left');
  await sail([B, C], 300);
  assert.equal(pB.deck, null);
  assert.ok(gB.world.distance(pB.x, pB.y, at.x, at.y) < 0.01, 'where B stood');
  assert.equal(B.ships.length, 0);
  assert.equal(herB.alive, false);
});

test('two friends, each aboard the other\'s ship: each drawn on the real one by her captain', async (t) => {
  const code = 'E' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const gA = seaGame(), gB = seaGame();
  const pA = enter(gA, 'Rin', 300, 300), pB = enter(gB, 'Kaito', 330, 310);
  const mk = (g, uid, x, y, name) => { const s = new Ship({ type: 'sloop', x, y, heading: 0, owner: 'player', name }); s.uid = uid; s.game = g; g.ships.push(s); return s; };
  const shipA = mk(gA, 'sA1', 300, 300, 'Going Merry'), shipB = mk(gB, 'sB1', 300, 312, 'Thousand Sunny');
  const A = await voyage(t, gA, { role: 'host', code }), B = await voyage(t, gB, { role: 'guest', code });
  await sail([A, B], 700);
  const herA = B.shipOf(A.selfId, 'sA1'), herB = A.shipOf(B.selfId, 'sB1');
  assert.ok(herA && herB, 'each draws the other\'s ship (lying close by)');
  placeOnDeck(gA, pA, herB, 0.4, 1); placeOnDeck(gB, pB, herA, 0.7, -1);
  const uvA = onHer(gA.world, herB, pA), uvB = onHer(gB.world, herA, pB);
  await sail([A, B], 700);
  const seenB = A.avatars[0], seenA = B.avatars[0];
  assert.equal(seenB.deck?.ship, shipA, 'A draws B on A\'s own ship');
  assert.equal(seenA.deck?.ship, shipB, 'B draws A on B\'s own ship');
  near(onHer(gA.world, shipA, seenB), uvB, 0.02, 'B on A\'s ship');
  near(onHer(gB.world, shipB, seenA), uvA, 0.02, 'A on B\'s ship');
  // (and each keeps their own ship in the other's sight, standing on the other's)
  assert.equal(A.shipShown(), shipA);
  assert.equal(B.shipShown(), shipB);
});
