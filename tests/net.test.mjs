// `npm test`: multiplayer's pure parts — room codes (src/net/code.js), the
// wire format and its checks on what comes in (protocol.js), the smooth
// in-between drawing of the other players (interp.js), and the local
// transport between pages of one browser (transport.js, over Node's own
// BroadcastChannel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCode, normalizeCode, showCode, CODE_ABC, CODE_LEN } from '../src/net/code.js';
import { readHello, readLook, readShip, readState, readSay, readEnv, stateChanged, flat, cleanText, worldSig, BIT, PROTO } from '../src/net/protocol.js';
import { SnapBuffer } from '../src/net/interp.js';
import { localTransport, netKind } from '../src/net/transport.js';

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
