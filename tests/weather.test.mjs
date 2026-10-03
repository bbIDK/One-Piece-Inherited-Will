// `npm test`: the weather by place (game/weather.js, game/env.js). Each sea
// and each charted island has its own climate: the East Blue is mild, the
// Grand Line erratic, the New World extreme, the Calm Belt windless; winter
// islands snow, summer ones are hot and clear, desert ones dry and dusty.
// Whatever the weather does, it does smoothly, and the fields other code
// reads (rain, storm, stormTarget, fog, windStrength, clock…) stay put.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIMATES, KINDS, placeAt, rollWeather, weatherTargets, allowed } from '../src/game/weather.js';
import { Env } from '../src/game/env.js';
import { EQ, GL_TOP, CB_TOP, RM_X, W as WORLD_W, regionAt, REGION } from '../src/world/constants.js';

/** A seeded 0..1 random source. */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** How often each kind comes up in n rolls of a climate (each roll following the last, as the game does). */
function odds(climate, n = 4000, seed = 7) {
  const r = rng(seed), out = {};
  let prev = null;
  for (let i = 0; i < n; i++) { const w = rollWeather(climate, r, prev); out[w.kind] = (out[w.kind] || 0) + 1 / n; prev = w.kind; }
  return out;
}
const sum = (o, ks) => ks.reduce((a, k) => a + (o[k] || 0), 0);

// spots on the chart (world tiles)
const EAST_BLUE = { x: RM_X + 3000, y: EQ - 3000 }; // north-east of Reverse Mountain
const PARADISE = { x: RM_X + 3000, y: EQ + 200 };
const NEW_WORLD = { x: RM_X - 3000, y: EQ - 200 };
const CALM = { x: RM_X + 3000, y: (CB_TOP + GL_TOP) / 2 };

/** Just enough of a world for placeAt: a few charted islands. */
function world(islands = []) {
  return {
    zone: 0, width: WORLD_W, islands,
    dx: (a, b) => { let d = (b - a) % WORLD_W; if (d > WORLD_W / 2) d -= WORLD_W; else if (d < -WORLD_W / 2) d += WORLD_W; return d; },
    isLiquid: () => true, climate: () => 0,
  };
}
const island = (id, climate, x, y, radius = 200) => ({ id, x, y, radius, def: { id, name: id, climate } });

test('the seas are where the chart says, each with its own climate', () => {
  assert.equal(regionAt(EAST_BLUE.x, EAST_BLUE.y), REGION.EAST_BLUE);
  assert.equal(regionAt(PARADISE.x, PARADISE.y), REGION.PARADISE);
  assert.equal(regionAt(NEW_WORLD.x, NEW_WORLD.y), REGION.NEW_WORLD);
  assert.ok(regionAt(CALM.x, CALM.y) === REGION.CALM_NORTH);
  const w = world();
  assert.equal(placeAt(w, EAST_BLUE.x, EAST_BLUE.y).climate, 'east_blue');
  assert.equal(placeAt(w, PARADISE.x, PARADISE.y).climate, 'paradise');
  assert.equal(placeAt(w, NEW_WORLD.x, NEW_WORLD.y).climate, 'new_world');
  assert.equal(placeAt(w, CALM.x, CALM.y).climate, 'calm_belt');
  // above the clouds, under the sea, in the prison
  assert.equal(placeAt({ zone: 1, islands: [] }, 10, 10).climate, 'sky');
  assert.equal(placeAt({ zone: 2, islands: [] }, 10, 10).climate, 'none');
  assert.equal(placeAt(null, 0, 0).climate, 'east_blue');
});

test("near a charted island its own climate takes over, and holds a little farther out on the way back", () => {
  const P = PARADISE;
  const drum = island('drum', 'winter', P.x, P.y, 250), sand = island('sand', 'desert', P.x + 3000, P.y, 300);
  const plain = island('plain', 'temperate', P.x + 6000, P.y), blue = island('blue', 'temperate', EAST_BLUE.x, EAST_BLUE.y);
  const islet = { id: 'islet_1', x: P.x + 9000, y: P.y, radius: 20, def: { id: 'islet_1', name: null, islet: true, climate: 3 } };
  const w = world([drum, sand, plain, blue, islet]);
  assert.equal(placeAt(w, P.x + 100, P.y).climate, 'winter');
  assert.equal(placeAt(w, P.x + 3000, P.y + 400).climate, 'desert');
  // a temperate island in the Grand Line keeps a steadier weather of its own; in a Blue, the sea's
  assert.equal(placeAt(w, P.x + 6000, P.y).climate, 'temperate');
  assert.equal(placeAt(w, EAST_BLUE.x + 50, EAST_BLUE.y).climate, 'east_blue');
  // the little uncharted islets keep the sea's
  assert.equal(placeAt(w, P.x + 9000, P.y).climate, 'paradise');
  // its air reaches out over the sea, and lets go a little farther out than it took hold
  const edge = 250 + 260;
  assert.equal(placeAt(w, P.x + edge, P.y).climate, 'paradise');
  const inside = placeAt(w, P.x + 300, P.y);
  assert.equal(placeAt(w, P.x + edge, P.y, inside.key).climate, 'winter');
});

test('ashore, a strong climate in the ground has the last word (Punk Hazard burns on one side and freezes on the other)', () => {
  const P = NEW_WORLD;
  const ph = island('punk_hazard', 'volcanic', P.x, P.y, 300);
  const w = world([ph]);
  w.isLiquid = () => false;
  w.climate = (x) => (x < P.x ? 3 : 5); // (winter tiles to the west, volcanic to the east)
  assert.equal(placeAt(w, P.x + 50, P.y).climate, 'volcanic');
  assert.equal(placeAt(w, P.x - 50, P.y).climate, 'winter');
  // the volcano's own weather: ash
  const ash = weatherTargets('ash', 1, 'volcanic');
  assert.ok(ash.ash > 0.5 && ash.rain === 0);
});

test('the East Blue is mild and mostly fair; the Grand Line erratic; the New World extreme', () => {
  const eb = odds('east_blue'), gl = odds('paradise'), nw = odds('new_world');
  const fine = (o) => sum(o, ['clear', 'fair', 'cloudy']);
  const storms = (o) => sum(o, ['storm', 'squall']);
  assert.ok(fine(eb) > 0.7, `East Blue fine ${fine(eb).toFixed(2)}`);
  assert.ok(storms(eb) > 0 && storms(eb) < 0.08, `East Blue storms and squalls ${storms(eb).toFixed(3)}`);
  assert.ok(storms(gl) > 0.25, `Paradise storms and squalls ${storms(gl).toFixed(2)}`);
  assert.ok(storms(nw) > storms(gl), `the New World stormier (${storms(nw).toFixed(2)}) than Paradise (${storms(gl).toFixed(2)})`);
  assert.ok(sum(nw, ['crimson', 'violet', 'aurora']) > 0.05, 'the New World has its odd skies');
  // the Grand Line changes its mind far more often, and its storms come harder
  assert.ok(CLIMATES.paradise.dur[1] < CLIMATES.east_blue.dur[0]);
  assert.ok(CLIMATES.new_world.k[0] >= CLIMATES.east_blue.k[1]);
  // a settled sea doesn't go from a clear sky to a storm and back over and over
  const r = rng(3);
  let jumps = 0;
  for (let i = 0; i < 2000; i++) if (rollWeather('east_blue', r, 'clear').kind === 'storm') jumps++;
  assert.ok(jumps / 2000 < 0.01, `clear → storm ${jumps / 2000}`);
});

test('the Calm Belt has no wind and no storms; winter islands snow; desert islands never rain', () => {
  assert.deepEqual(Object.keys(CLIMATES.calm_belt.w), ['calm']);
  const calm = weatherTargets('calm', 1, 'calm_belt');
  assert.equal(calm.storm, 0);
  assert.equal(calm.wind, 0);
  assert.equal(calm.calm, 1);
  // every kind of weather a winter island has falls as snow, and none as rain
  const winter = odds('winter');
  for (const k of Object.keys(CLIMATES.winter.w)) assert.equal(weatherTargets(k, 1, 'winter').rain, 0, k);
  assert.ok(sum(winter, ['snow', 'flurries', 'blizzard']) > 0.6, `winter snows ${sum(winter, ['snow', 'flurries', 'blizzard']).toFixed(2)}`);
  // …and rain anywhere cold is snow
  assert.ok(weatherTargets('rain', 1, 'winter').snow > 0.5);
  for (const k of Object.keys(KINDS)) assert.equal(weatherTargets(k, 1, 'desert').rain, 0, `rain in the desert (${k})`);
  const desert = odds('desert');
  assert.ok(sum(desert, ['dust', 'sandstorm']) > 0.3, 'the desert is dusty');
  assert.ok(sum(desert, ['heat', 'clear']) > 0.4, 'and hot');
  const summer = odds('summer');
  assert.ok(sum(summer, ['heat', 'clear', 'fair']) > 0.65, `summer islands hot and clear ${sum(summer, ['heat', 'clear', 'fair']).toFixed(2)}`);
  assert.deepEqual(Object.keys(CLIMATES.sky.w), ['clear'], 'above the clouds it never rains');
  assert.ok(!allowed('desert', 'rain') && allowed('desert', 'sandstorm'));
});

/** Just enough of a game for Env.update: someone at (x, y) in a world. */
function game(x, y, islands = []) {
  const g = { world: world(islands), player: { x, y }, focus() { return this.player; }, inFogRegion: () => 0, audio: null };
  return g;
}
function run(env, g, seconds, dt = 0.1, each) {
  for (let t = 0; t < seconds; t += dt) { env.update(dt, g); each?.(env); }
}

test('the env keeps the fields the rest of the game reads, and takes each place\'s weather', () => {
  const env = new Env(), g = game(EAST_BLUE.x, EAST_BLUE.y);
  env.update(0.1, g);
  for (const k of ['rain', 'snow', 'storm', 'stormTarget', 'fog', 'windStrength', 'windAngle', 'windX', 'windY', 'clock', 'day', 'daylight', 'lightning', 'weatherTimer', 'time'])
    assert.equal(typeof env[k], 'number', k);
  assert.ok(Array.isArray(env.ambient) && env.ambient.length === 3);
  assert.equal(typeof env.forecast, 'string');
  assert.equal(env.climate, 'east_blue');
  // sail into the Calm Belt: no wind there at all, and the sea goes glassy
  g.player = { x: CALM.x, y: CALM.y };
  run(env, g, 40);
  assert.equal(env.climate, 'calm_belt');
  assert.equal(env.weather, 'calm');
  assert.equal(env.windStrength, 0);
  assert.equal(env.stormTarget, 0);
  assert.ok(env.calm > 0.95 && env.storm < 0.01 && env.rain === 0, JSON.stringify({ calm: env.calm, storm: env.storm, rain: env.rain }));
});

test('a winter island snows, a desert island blows with dust, each fading in as you come', () => {
  const P = PARADISE;
  const drum = island('drum', 'winter', P.x, P.y, 250), sand = island('sand', 'desert', P.x + 4000, P.y, 300);
  const env = new Env(), g = game(P.x - 1500, P.y, [drum, sand]);
  env.update(0.1, g);
  env.setWeather('snow', { k: 1 });
  // arriving at Drum: its own climate; held snowing, the snow comes on over a few seconds, not at once
  g.player = { x: P.x + 50, y: P.y };
  env.update(0.6, g);
  assert.equal(env.climate, 'winter');
  env.setWeather('snow', { k: 1, hold: true });
  const seen = [];
  run(env, g, 60, 0.1, (e) => seen.push(e.snow));
  assert.ok(env.snow > 0.5 && env.rain === 0, `snow ${env.snow} rain ${env.rain}`);
  assert.ok(env.mistSnow > 0.2, `snow mist ${env.mistSnow}`);
  for (let i = 1; i < seen.length; i++) assert.ok(Math.abs(seen[i] - seen[i - 1]) < 0.05, 'the snow jumped');
  // the desert: dry whatever the sky wants, its sand blown on the wind
  g.player = { x: P.x + 4000, y: P.y };
  env.weatherTimer = 10;
  run(env, g, 2);
  assert.equal(env.climate, 'desert');
  env.setWeather('sandstorm', { hold: true });
  run(env, g, 60);
  assert.ok(env.dust > 0.9 && env.mistDust > 0.5, `dust ${env.dust} mist ${env.mistDust}`);
  assert.equal(env.rain, 0);
  env.stormTarget = 0.9; // (a story's storm over the desert: a few drops at most)
  run(env, g, 30);
  assert.ok(env.rain < 0.2, `rain in the desert ${env.rain}`);
});

test("an island's own snow (Drum's) falls from its own grey sky, not out of a clear one", () => {
  const P = PARADISE;
  const drum = island('drum', 'winter', P.x, P.y, 250);
  const env = new Env(), g = game(P.x, P.y, [drum]);
  env.update(0.1, g);
  env.setWeather('clear', { now: true, hold: true });
  // (news.js sets it every tick while you're on the island)
  run(env, g, 60, 0.1, (e) => { e.ownSnow = 0.55; });
  assert.ok(env.snow > 0.5 && env.cloud > 0.85, JSON.stringify({ snow: env.snow, cloud: env.cloud }));
  run(env, g, 90, 0.1, (e) => { e.ownSnow = 0; });
  assert.ok(env.snow === 0 && env.cloud < 0.1, JSON.stringify({ snow: env.snow, cloud: env.cloud }));
});

test('weather changes smoothly: clouds before the rain, the rain stops before the sky clears', () => {
  const env = new Env(), g = game(EAST_BLUE.x, EAST_BLUE.y);
  env.update(0.1, g);
  env.setWeather('clear', { now: true, hold: true });
  run(env, g, 5);
  assert.ok(env.cloud < 0.1 && env.rain === 0);
  env.setWeather('storm', { hold: true });
  let cloudFirst = null, prev = { cloud: env.cloud, rain: env.rain, storm: env.storm };
  run(env, g, 90, 0.05, (e) => {
    // nothing jumps: at most a little a frame
    assert.ok(Math.abs(e.cloud - prev.cloud) < 0.02 && Math.abs(e.rain - prev.rain) < 0.03 && Math.abs(e.storm - prev.storm) < 0.02, JSON.stringify([prev, e.cloud, e.rain, e.storm]));
    if (cloudFirst === null && e.rain > 0.05) cloudFirst = e.cloud;
    prev = { cloud: e.cloud, rain: e.rain, storm: e.storm };
  });
  assert.ok(cloudFirst > 0.5, `it rained under a cloud cover of only ${cloudFirst}`);
  assert.ok(env.cloud > 0.97 && env.rain > 0.8 && env.storm > 0.8, JSON.stringify({ cloud: env.cloud, rain: env.rain, storm: env.storm }));
  env.setWeather('clear', { hold: true });
  let rainGone = null;
  run(env, g, 90, 0.05, (e) => { if (rainGone === null && e.rain === 0) rainGone = e.cloud; });
  assert.ok(rainGone > 0.4, `the rain kept on till the clouds were down to ${rainGone}`);
  assert.ok(env.cloud < 0.1 && env.storm < 0.05);
});

test('a story or an island that wants a storm still gets one, clouds, rain and all', () => {
  const env = new Env(), g = game(EAST_BLUE.x, EAST_BLUE.y);
  env.update(0.1, g);
  env.setWeather('fair', { now: true, hold: true });
  run(env, g, 1, 0.1, (e) => { e.stormTarget = Math.max(e.stormTarget, 0.85); });
  run(env, g, 60, 0.1, (e) => { e.stormTarget = Math.max(e.stormTarget, 0.85); });
  assert.ok(env.storm > 0.8 && env.cloud > 0.95 && env.rain > 0.6, JSON.stringify({ storm: env.storm, cloud: env.cloud, rain: env.rain }));
});

test('code that sets env.storm outright gets its clouds and rain at once (the tools and the story do)', () => {
  const env = new Env(), g = game(EAST_BLUE.x, EAST_BLUE.y);
  env.update(0.1, g);
  env.setWeather('fair', { now: true, hold: true });
  run(env, g, 2);
  env.storm = env.stormTarget = 0.85;
  env.update(1 / 30, g);
  assert.ok(env.cloud > 0.9 && env.rain > 0.8, JSON.stringify({ cloud: env.cloud, rain: env.rain }));
  // the New World's dry lightning: bolts, and not a drop
  const nw = new Env(), gn = game(NEW_WORLD.x, NEW_WORLD.y);
  nw.update(0.1, gn);
  nw.setWeather('violet', { now: true, hold: true });
  const strikes = new Set();
  let wet = 0;
  run(nw, gn, 60, 1 / 30, (e) => { strikes.add(e.strike.t); wet = Math.max(wet, e.rain); });
  assert.equal(wet, 0, 'it rained under the dry lightning');
  assert.ok(strikes.size > 2, `${strikes.size - 1} bolts of dry lightning`);
});

test('lightning: bolts in a thunderstorm, flickering in strokes, none on a fine day', () => {
  const env = new Env(), g = game(NEW_WORLD.x, NEW_WORLD.y);
  const heard = [];
  g.audio = { sfx: (name, at, k) => heard.push([name, k?.far]) };
  env.update(0.1, g);
  env.setWeather('storm', { now: true, hold: true });
  const strikes = new Set();
  let flickers = 0, last = 0;
  run(env, g, 120, 1 / 30, (e) => {
    strikes.add(e.strike.t);
    if (e.lightning > last + 0.15) flickers++;
    last = e.lightning;
  });
  assert.ok(strikes.size > 8, `${strikes.size - 1} bolts in two minutes of storm`);
  assert.ok(flickers > strikes.size, 'each bolt flickers in more than one stroke');
  assert.ok(heard.length > 8 && heard.every(([n, far]) => n === 'thunder' && far >= 0 && far <= 1));
  assert.ok(env.strike.dist > 100 && Number.isFinite(env.strike.angle));
  env.setWeather('fair', { now: true, hold: true });
  run(env, g, 5);
  const t0 = env.strike.t;
  run(env, g, 120);
  assert.equal(env.strike.t, t0, 'lightning out of a fine sky');
  // (a flash raised by other code fades as it always has)
  env.lightning = 1;
  run(env, g, 0.5);
  assert.equal(env.lightning, 0);
});

test('a pinned weather stays put as you move (the tests\' and a multiplayer guest\'s)', () => {
  const P = PARADISE;
  const drum = island('drum', 'winter', P.x, P.y, 250);
  const env = new Env(), g = game(P.x - 2000, P.y, [drum]);
  env.update(0.1, g);
  env.storm = 0; env.stormTarget = 0; env.weatherTimer = 1e9;
  const kind = env.weather;
  g.player = { x: P.x, y: P.y };
  run(env, g, 30);
  assert.equal(env.weather, kind);
  assert.equal(env.climate, 'winter');
});
