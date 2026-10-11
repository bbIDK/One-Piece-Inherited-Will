// `npm test`: co-op (src/net/coop.js) — a boss two friends fight is one boss:
// blows on either screen wear down both copies, and the blow that ends them
// ends them everywhere, the win counting for all who were there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installCoop, sharedFoe } from '../src/net/coop.js';

function fakeGame() {
  const ev = {}, sent = [];
  const g = {
    time: 0, player: { x: 0, y: 0, isPlayer: true }, actors: [], logs: [],
    on(k, f) { (ev[k] || (ev[k] = [])).push(f); },
    emit(k, ...a) { for (const f of ev[k] || []) f(...a); },
    actorsNear() { return g.actors; },
    log(t) { g.logs.push(t); },
    net: { over: false, inWorld: true, send: (m) => sent.push(m) },
  };
  installCoop(g);
  return { g, sent };
}
const boss = (g) => {
  const a = { npcId: 'buggy', name: 'Buggy', boss: true, alive: true, state: 'idle', hp: 300, d: { maxHp: 300 } };
  a.knockOut = (game, att) => { a.state = 'knocked'; game.emit('knockout', a, att); };
  g.actors.push(a);
  return a;
};

test('only the foes that matter are shared', () => {
  assert.ok(sharedFoe({ npcId: 'x', boss: true }));
  assert.ok(sharedFoe({ npcId: 'x', bountyValue: 1e6 }));
  assert.ok(!sharedFoe({ boss: true }));
  assert.ok(!sharedFoe({ npcId: 'x' }));
});

test('your blows on a boss tell the others how much is left, a few times a second at most', () => {
  const { g, sent } = fakeGame(), a = boss(g);
  a.hp = 200; g.emit('playerHit', a, 100);
  a.hp = 150; g.emit('playerHit', a, 50);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { k: 'bh', id: 'buggy', f: 0.667 });
  g.time = 0.3; g.emit('playerHit', a, 50);
  assert.equal(sent.length, 2);
});

test("a friend's blows wear your copy down, never to zero; their finishing blow downs it here, as yours", () => {
  const { g, sent } = fakeGame(), a = boss(g);
  let credit = null;
  g.on('knockout', (x, att) => { credit = att; });
  g.coop.receive({ k: 'bh', id: 'buggy', f: 0.5 }, { label: 'Kaito' });
  assert.equal(a.hp, 150);
  g.coop.receive({ k: 'bh', id: 'buggy', f: 0.9 }, { label: 'Kaito' });
  assert.equal(a.hp, 150, 'never healed back up');
  g.coop.receive({ k: 'bh', id: 'buggy', f: 0 }, { label: 'Kaito' });
  assert.equal(a.hp, 1);
  g.coop.receive({ k: 'bd', id: 'buggy' }, { label: 'Kaito' });
  assert.equal(a.state, 'knocked');
  assert.equal(credit, g.player, 'the win is yours too');
  assert.equal(sent.length, 0, 'no echo back to the voyage');
  assert.ok(g.logs[0].includes('Kaito'));
});

test('your own finishing blow is sent; nothing goes out off a voyage', () => {
  const { g, sent } = fakeGame(), a = boss(g);
  a.knockOut(g, g.player);
  assert.deepEqual(sent.at(-1), { k: 'bd', id: 'buggy' });
  const b = boss(g); b.npcId = 'alvida';
  g.net = null;
  b.knockOut(g, g.player);
  assert.equal(sent.length, 1);
  g.coop.receive({ k: 'bd', id: 'nobody' }, null);
});
