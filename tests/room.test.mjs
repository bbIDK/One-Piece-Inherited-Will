// The claude.ai room transport (src/net/room.js): the outbox in a presence, read back in order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outbox, reader, ascii, roomTransport } from '../src/net/room.js';

test('outbox: messages read back once each, in order, for everyone or for us', () => {
  let t = 0;
  const box = outbox({ now: () => t });
  const read = reader('me'), other = reader('them');
  box.add({ k: 'hi', n: 'Kaito' }, 'me');
  box.add({ k: 'say', text: 'ahoy' });
  assert.deepEqual(read(box.entries()).map((m) => m.k), ['hi', 'say']);
  assert.deepEqual(other(box.entries()).map((m) => m.k), ['say']);
  // (read again: nothing new)
  assert.deepEqual(read(box.entries()), []);
  box.add({ k: 'say', text: 'again' });
  assert.deepEqual(read(box.entries()).map((m) => m.text), ['again']);
});

test('outbox: the latest state stands in for the one before; one-offs go after a while', () => {
  let t = 0;
  const box = outbox({ now: () => t });
  for (let i = 0; i < 50; i++) box.add({ k: 'st', x: i });
  const sts = box.entries();
  assert.equal(sts.length, 1);
  assert.equal(JSON.parse(sts[0][4]).x, 49);
  box.add({ k: 'say', text: 'hi' });
  t = 10000; box.pump();
  assert.deepEqual(box.entries().map((e) => JSON.parse(e[4]).k), ['st']);
});

test('outbox: big messages go in pieces under 1 KiB, within the 4 KiB presence', () => {
  let t = 0;
  const box = outbox({ now: () => t });
  const big = { k: 'lk', look: 'x'.repeat(2500), name: 'Zoë' };
  box.add(big);
  for (let i = 0; i < 20; i++) box.add({ k: 'say', text: 'y'.repeat(150) + i });
  const e = box.entries();
  assert.ok(e.every((x) => x[4].length <= 1000));
  assert.ok(JSON.stringify(e).length <= 4096);
  assert.ok(/^[\x20-\x7e]*$/.test(JSON.stringify(e)), 'ASCII only');
  const got = reader('me')(e);
  assert.equal(got[0].name, 'Zoë');
  assert.equal(got[0].look.length, 2500);
  // the rest wait their turn, and all arrive in order as the earlier ones go
  const read = reader('me'), seen = [];
  for (let k = 0; k < 40 && seen.length < 21; k++) { seen.push(...read(box.entries())); t += 500; box.pump(); }
  assert.equal(seen.length, 21);
  assert.deepEqual(seen.slice(1).map((m) => m.text.slice(150)), Array.from({ length: 20 }, (_, i) => String(i)));
});

test('ascii: nothing outside printable ASCII, and it parses back', () => {
  const s = ascii({ n: 'Zoë ​ 🏴‍☠️' });
  assert.ok(/^[\x20-\x7e]*$/.test(s));
  assert.equal(JSON.parse(s).n, 'Zoë ​ 🏴‍☠️');
});

// a fake room: pages share presence through it
function fakeHub() {
  const pages = new Set();
  const snap = () => [...pages].map((p) => p.peer);
  return {
    page(peer) {
      const me = { peer, pres: {}, subs: new Set() };
      const view = (forPeer) => [...pages].map((p) => ({ peer: p.peer, sameTab: p.peer === forPeer, isMe: p.peer === forPeer, kind: 'viewer', guest: false, by: null, presence: p.pres }));
      const notify = (ch) => { for (const p of pages) for (const f of p.subs) f({ peers: view(p.peer), joined: ch.joined(p.peer), updated: ch.updated(p.peer), left: ch.left || [] }); };
      const named = {
        peers: () => view(peer),
        presence: async (patch) => { me.pres = { ...me.pres, ...patch }; notify({ joined: () => [], updated: (to) => (to === peer ? [] : view(to).filter((x) => x.peer === peer)) }); },
        onPeers: (f) => { me.subs.add(f); queueMicrotask(() => f({ peers: view(peer), joined: view(peer), updated: [], left: [] })); return () => me.subs.delete(f); },
        connected: () => true,
        leave: async () => { pages.delete(me); for (const p of pages) for (const f of p.subs) f({ peers: view(p.peer), joined: [], updated: [], left: [{ peer }] }); },
      };
      pages.add(me);
      for (const p of pages) if (p !== me) for (const f of p.subs) f({ peers: view(p.peer), joined: view(p.peer).filter((x) => x.peer === peer), updated: [], left: [] });
      return { join: async () => named, peers: () => view(peer) };
    },
    snap,
  };
}

test('roomTransport: two games meet, talk to each other and to one another only', async () => {
  const hub = fakeHub();
  const got = { a: [], b: [] }, joined = { a: [], b: [] }, leftA = [];
  const a = await roomTransport(hub.page('pa'), 'ABCDEF', { onMessage: (m, f) => got.a.push([m.k, f]), onPeerJoin: (id) => joined.a.push(id), onPeerLeave: (id) => leftA.push(id) });
  const b = await roomTransport(hub.page('pb'), 'ABCDEF', { onMessage: (m, f) => got.b.push([m.k, f]), onPeerJoin: (id) => joined.b.push(id) });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(joined.a, ['pb']);
  assert.deepEqual(joined.b, ['pa']);
  a.send({ k: 'hi' }, 'pb');
  b.send({ k: 'say', text: 'yo' });
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(got.b, [['hi', 'pa']]);
  assert.deepEqual(got.a, [['say', 'pb']]);
  assert.deepEqual(a.relays(), { open: 1, all: 1 });
  b.leave();
  await new Promise((r) => setTimeout(r, 600));
  assert.deepEqual(got.a.map((x) => x[0]), ['say', 'bye']);
  assert.deepEqual(leftA, ['pb']);
  a.leave();
});
