// People are solid to one another (game/bodies.js): two people standing in
// each other are eased apart; the dead, someone mid-dodge and a seated
// figure don't push or get pushed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { ObjectIndex } from '../src/world/objects.js';
import { T } from '../src/world/tiles.js';
import { Actor } from '../src/game/actor.js';
import { separateBodies } from '../src/game/bodies.js';

function scene(...pos) {
  const w = new World(128, 128, { wrap: false, fill: T.GRASS });
  w.objects = new ObjectIndex(w);
  const actors = pos.map(([x, y]) => new Actor({ x, y, name: 'P', attrs: { str: 5, agi: 5, end: 5, vit: 5, wil: 5 } }));
  const game = { world: w, player: actors[0], actors };
  return { w, game, actors };
}
const settle = (game) => { for (let i = 0; i < 60; i++) separateBodies(game, 1 / 60); };
const gap = (w, a, b) => Math.hypot(w.dx(a.x, b.x), b.y - a.y);

test('two people standing in each other are eased apart to touching', () => {
  const { w, game, actors: [a, b] } = scene([60, 60], [60.1, 60]);
  settle(game);
  assert.ok(gap(w, a, b) >= (a.r + b.r) * 0.9, `apart: ${gap(w, a, b).toFixed(3)}`);
});

test('the knocked-down and someone mid-dodge are passed through', () => {
  const { w, game, actors: [a, b, c] } = scene([60, 60], [60.1, 60], [70, 70]);
  b.state = 'knocked';
  settle(game);
  assert.ok(gap(w, a, b) < 0.2, 'over the knocked-down');
  c.x = 70.1; c.y = 70; const d = new Actor({ x: 70, y: 70, name: 'D', attrs: { str: 5, agi: 5, end: 5, vit: 5, wil: 5 } });
  game.actors.push(d); d.dash = { t: 0.2, vx: 1, vy: 0 };
  separateBodies(game, 1 / 60);
  assert.ok(gap(w, c, d) < 0.2, 'a dodge goes through');
});

test('a seated figure stays put; the one walking into it gives way', () => {
  const { w, game, actors: [a, b] } = scene([60, 60], [60.2, 60]);
  b.act3d = { pose: 'sit', h: 0.45 };
  const bx = b.x, by = b.y;
  settle(game);
  assert.equal(b.x, bx); assert.equal(b.y, by);
  assert.ok(gap(w, a, b) >= (a.r + b.r) * 0.9);
});
