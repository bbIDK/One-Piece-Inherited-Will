// TURN relays for voyages between networks that won't connect directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { turnServers, saveTurn, savedTurn } from '../src/net/transport.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('always a public relay to fall back on; a page address or a saved one added first', async () => {
  const none = await turnServers('', mem(), null);
  assert.ok(none.length >= 1 && none.every((s) => [].concat(s.urls).every((u) => /^turns?:/.test(u))));
  const q = await turnServers('?turn=turn:relay.example:3478&turnuser=a&turnpass=b', mem(), null);
  assert.deepEqual(q[0], { urls: ['turn:relay.example:3478'], username: 'a', credential: 'b' });
  const st = mem();
  saveTurn({ urls: ['turns:t.example:443'], username: 'u', credential: 'p' }, st);
  assert.equal(savedTurn(st).username, 'u');
  const s = await turnServers('', st, null);
  assert.equal(s[0].urls[0], 'turns:t.example:443');
});

test('a credentials URL is fetched for fresh ICE servers (only its TURN ones kept); a dead one is skipped', async () => {
  const st = mem();
  saveTurn({ url: 'https://x.metered.live/api/v1/turn/credentials?apiKey=k' }, st);
  const ok = async () => ({ json: async () => [{ urls: 'stun:stun.x:80' }, { urls: 'turn:x:443?transport=tcp', username: 'n', credential: 'c' }] });
  const s = await turnServers('', st, ok);
  assert.equal(s[0].urls, 'turn:x:443?transport=tcp');
  assert.ok(!s.some((x) => x.urls === 'stun:stun.x:80'));
  const dead = await turnServers('', st, async () => { throw new Error('offline'); });
  assert.ok(dead.length >= 1);
  saveTurn(null, st);
  assert.equal(savedTurn(st), null);
});
