// The sun and the moon. The one light that throws shadows hands over from the
// sun to the moon (and back) only while it's dark, so shadows never swing
// round at a stroke; and the sun keeps to the daylight: it set at 18:12 with
// the sky still at full daylight, and the evening street went flat and grey
// under a weak blue moon for the next two hours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { Sky } = await import('../src/render3d/sky3d.js');
const { Env } = await import('../src/game/env.js');

const game = { focus: () => ({ x: 0, y: 0 }), world: null };
function lightAt(sky, env, clock) {
  env.clock = clock;
  env.update(0, game);
  sky.update(env, { zone: 0 }, false);
  return { dir: sky.lightDir.clone(), k: sky.sun.intensity, sunY: sky.sunDir.y, day: env.daylight };
}
const hm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

test('the light that throws shadows never swings round or jumps, minute by minute through a day', () => {
  const sky = new Sky(new THREE.Scene()), env = new Env();
  let prev = lightAt(sky, env, 0);
  for (let m = 1; m <= 24 * 60; m++) {
    const h = (m / 60) % 24, cur = lightAt(sky, env, h);
    // a light strong enough to see may turn only as fast as the sun crosses the sky
    const turn = cur.dir.angleTo(prev.dir) * Math.min(cur.k, prev.k);
    assert.ok(turn < 0.02, `${hm(h)}: the light turned ${cur.dir.angleTo(prev.dir).toFixed(3)} rad in a minute at intensity ${Math.min(cur.k, prev.k).toFixed(2)}`);
    // (a game minute is two thirds of a second: fades take many of them)
    assert.ok(Math.abs(cur.k - prev.k) < 0.3, `${hm(h)}: the light jumped from ${prev.k.toFixed(2)} to ${cur.k.toFixed(2)}`);
    prev = cur;
  }
});

test('the sun is up while the sky is light and down once it has darkened, evening and morning', () => {
  const sky = new Sky(new THREE.Scene()), env = new Env();
  let set = null, rise = null, wasUp = null;
  for (let m = 0; m < 24 * 60; m += 2) {
    const h = m / 60, L = lightAt(sky, env, h);
    if (L.day > 0.6) assert.ok(L.sunY > 0, `${hm(h)}: daylight ${L.day.toFixed(2)}, but the sun is down`);
    if (L.day < 0.2) assert.ok(L.sunY < 0, `${hm(h)}: dark (daylight ${L.day.toFixed(2)}), but the sun is up`);
    const up = L.sunY > 0;
    if (wasUp !== null && up !== wasUp) { if (up) rise = h; else set = h; }
    wasUp = up;
  }
  assert.ok(set > 18.8 && set < 19.6, `the sun sets at ${hm(set)}`);
  assert.ok(rise > 5.4 && rise < 6.2, `the sun rises at ${hm(rise)}`);
});
