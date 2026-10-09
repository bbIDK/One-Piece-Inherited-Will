// Time zones round the planet, and the air's temperature by place and hour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Env, zoneOffset, ZONE_X } from '../src/game/env.js';
import { temperature, seaClimate } from '../src/game/weather.js';
import { W, H, REGION, CB_TOP, CB_BOTTOM } from '../src/world/constants.js';

test('local time runs an hour ahead for every 24th of the way east, and wraps round', () => {
  assert.equal(zoneOffset(ZONE_X), 0);
  assert.ok(Math.abs(zoneOffset(ZONE_X + W / 24) - 1) < 1e-9);
  assert.ok(Math.abs(Math.abs(zoneOffset(ZONE_X + W / 2)) - 12) < 1e-9);
  assert.ok(Math.abs(zoneOffset(ZONE_X - W / 8) + 3) < 1e-9);
  const e = new Env();
  e.utc = 10; e.zone = 3;
  assert.equal(e.clock, 13);
  e.clock = 8; // (setting the local hour moves the world clock to match)
  assert.equal(e.utc, 5);
  e.zone = -9;
  assert.equal(e.clock, 20); // (the same moment, nine hours west of there… of the meridian)
});

test('waiting past midnight rolls the day over', () => {
  const e = new Env();
  e.zone = 0; e.utc = 22; e.day = 3;
  const days = [];
  const game = { focus: () => null, world: null, onNewDay: (d) => days.push(d), inFogRegion: () => 0 };
  e.clock = e.clock + 5;
  try { e.update(0.001, game); } catch { /* (the weather wants a world: the day's counted first) */ }
  assert.equal(e.day, 4);
  assert.deepEqual(days, [4]);
});

test('colder toward the poles, by night, and in the snow; the Blues cold and warm by latitude', () => {
  const noonEq = temperature('east_blue', 0, 14.5), noonPole = temperature('east_blue', 1.1, 14.5), night = temperature('east_blue', 0, 3);
  assert.ok(noonPole < noonEq - 4 && night < noonEq - 6);
  assert.ok(temperature('winter', 0.5, 12, { snow: 1 }) < 0);
  assert.ok(temperature('desert', 0.2, 15) > 35);
  assert.equal(seaClimate(REGION.NORTH_BLUE, 400, H, CB_TOP, CB_BOTTOM), 'cold_sea');
  assert.equal(seaClimate(REGION.SOUTH_BLUE, CB_BOTTOM + 200, H, CB_TOP, CB_BOTTOM), 'warm_sea');
  assert.equal(seaClimate(REGION.EAST_BLUE, 3000, H, CB_TOP, CB_BOTTOM), 'east_blue');
  assert.equal(seaClimate(REGION.PARADISE, 400, H, CB_TOP, CB_BOTTOM), 'paradise');
});
