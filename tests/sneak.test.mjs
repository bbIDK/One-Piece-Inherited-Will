// Sneaking (Alt): a crouched player is seen at not much over half the
// distance, only well in front, and hardly heard from behind; standing, the
// same foe spots them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../src/game/game.js');
const { Actor } = await import('../src/game/actor.js');
const { AIController } = await import('../src/game/ai.js');
const { T } = await import('../src/world/tiles.js');

function arena() {
  const world = {
    width: 24576, height: 12288, zone: 0, quays: new Set(), islands: [],
    dx: (a, b) => b - a, wx: (x) => x, distance: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay), dist2: (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2,
    type: () => T.GRASS, solid: () => false, walkable: () => true, isBlocked: () => false, hitsProp: () => false,
    speedAt: () => 1, isLiquid: () => false, isOverlay: () => false, damageAt: () => 0, isQuay: () => false,
  };
  const g = Object.create(Game.prototype);
  Object.assign(g, { world, surface: world, hooks: {}, hintsShown: new Set(), logLines: [], actors: [], ships: [], areaZones: [], zones: new Map(), time: 0, ui: null, audio: null, env: { time: 0, daylight: 1 } });
  g.actorsNear = (x, y, r) => g.actors.filter((a) => Math.hypot(a.x - x, a.y - y) <= r);
  return g;
}
function body(g, o = {}) {
  const a = new Actor({ name: 'X', race: 'human', attrs: { str: 5, agi: 5, end: 5, vit: 5, wil: 5 }, style: 'brawler', faction: o.faction || 'pirate' });
  a.game = g; a.x = 20000 + (o.dx || 0); a.y = 2000; a.facing = o.facing ?? 0;
  if (o.player) { a.isPlayer = true; a.faction = 'player'; g.player = a; }
  g.actors.push(a);
  return a;
}

/** Does a pirate facing east (or west: `back`) spot the player `dx` tiles east of it? */
function spots(dx, crouch, back = false) {
  const g = arena();
  const foe = body(g, { facing: back ? Math.PI : 0 });
  foe.controller = new AIController({ kind: 'hostile' });
  const you = body(g, { player: true, dx });
  you.crouch = crouch;
  return foe.controller.findTarget(foe, g) === you;
}

test('in front: seen standing at 7 m, sneaking only up close', () => {
  assert.equal(spots(7, false), true);
  assert.equal(spots(7, true), false);
  assert.equal(spots(4, true), true);
});

test('behind: heard standing within 4 m, sneaking only right at their back', () => {
  assert.equal(spots(3, false, true), true);
  assert.equal(spots(3, true, true), false);
  assert.equal(spots(1, true, true), true);
});
