// Over the pole: the chart is a planet's surface, so walking north past the
// top row brings you down the far side — half way round, heading south.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Actor } = await import('../src/game/actor.js');

const W = 24576, H = 12288;
const world = { width: W, height: H, wrap: true, wx: (x) => ((x % W) + W) % W };

test('north over the pole: half way round, heading south, the view turned with you', () => {
  const game = { surface: world, view3d: { rig: { yaw: 0.3 } }, log() {} };
  const a = { isPlayer: true, game, x: 1000, y: 0.6, facing: -Math.PI / 2, vx: 0, vy: -4, kb: { x: 0, y: 0 } };
  assert.ok(Actor.prototype.overPole.call(a, world));
  assert.equal(a.x, 1000 + W / 2);
  assert.ok(Math.abs(a.y - 1.4) < 1e-9, `y ${a.y}`);
  assert.ok(Math.abs(a.facing - Math.PI / 2) < 1e-9);
  assert.equal(a.vy, 4);
  assert.ok(Math.abs(game.view3d.rig.yaw - (0.3 + Math.PI)) < 1e-9);
});

test('south over the pole wraps the other way; not for others, or below the surface', () => {
  const game = { surface: world, log() {} };
  const a = { isPlayer: true, game, x: W - 100, y: H - 0.5, facing: Math.PI / 2, vx: 0, vy: 3, kb: { x: 0, y: 0 } };
  assert.ok(Actor.prototype.overPole.call(a, world));
  assert.equal(a.x, W / 2 - 100);
  assert.ok(Math.abs(a.y - (H - 1.5)) < 1e-9);
  const npc = { isPlayer: false, game, x: 5, y: 0.5 };
  assert.equal(Actor.prototype.overPole.call(npc, world), false);
  const zone = { ...world, wrap: false };
  assert.equal(Actor.prototype.overPole.call({ isPlayer: true, game, x: 5, y: 0.5 }, zone), false);
});
