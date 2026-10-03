// The music's choices, without a sound card: every place gets a theme the
// composer can play, the original pieces are as they were, a fight's and a
// night's versions are what they should be, and the director tells places apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, placeTheme, battleOf, nightOf, islandTheme } from '../src/audio/themes.js';
import { MODES, INSTRUMENTS, compose } from '../src/audio/music.js';
import { Director } from '../src/audio/director.js';
import { ALL_ISLANDS } from '../src/data/islands/index.js';
import { ZONES } from '../src/data/zones/index.js';

const playable = (t, where) => {
  assert.ok(t, `${where}: a theme`);
  assert.ok(MODES[t.mode], `${where}: mode ${t.mode}`);
  for (const k of ['lead', 'arp', 'bass', 'bassInst', 'padInst']) if (t[k]) assert.ok(INSTRUMENTS.includes(t[k]), `${where}: ${k} ${t[k]} is an instrument`);
  assert.ok(t.bpm > 30 && t.bpm < 200, `${where}: tempo ${t.bpm}`);
  const S = compose(t);
  assert.ok(S.bars >= 2 && S.barDur > 0.5, `${where}: a piece`);
  for (const c of S.chords) for (const d of c) assert.ok(Number.isFinite(S.midi(d, 0)), `${where}: notes`);
};

test('every island and zone island has a theme the composer can play, by day, by night and in a fight', () => {
  for (const isl of ALL_ISLANDS) {
    const w = { zone: 'surface', island: { id: isl.id, def: isl, sea: isl.sea }, seaId: isl.sea };
    playable(placeTheme(w), isl.id);
    playable(placeTheme({ ...w, night: true }), isl.id + ' (night)');
    playable(battleOf(placeTheme(w)), isl.id + ' (fight)');
    playable(battleOf(placeTheme(w), true), isl.id + ' (boss)');
  }
  for (const [zid, z] of Object.entries(ZONES)) {
    const kind = z.kind === 'sky' ? 'sky' : z.kind === 'undersea' ? 'undersea' : 'prison';
    for (const isl of z.islands || []) playable(placeTheme({ zone: kind, zoneId: zid, island: { id: isl.id, def: isl } }), `${zid}/${isl.id}`);
  }
});

test('the original pieces are exactly as they were', () => {
  assert.deepEqual({ ...THEMES.sea, id: undefined }, { id: undefined, key: 55, mode: 'mixolydian', bpm: 58, feel: 'lilt', prog: [[0, 3, 0, 4], [0, 6, 3, 0], [0, 3, 6, 0]], lead: 'flute', arp: 'pluck', pad: true, arpDensity: 0.75, bars: [16, 32], rest: [18, 45], melody: 0.75 });
  assert.equal(THEMES.title.lead, 'piano');
  assert.equal(THEMES.battle.bpm, 128);
  assert.equal(THEMES.battle.key, 45);
  // (the open East Blue plays the original sea by day and the original night piece by night)
  assert.equal(placeTheme({ zone: 'surface', seaId: 'east_blue' }), THEMES.sea);
  assert.equal(placeTheme({ zone: 'surface', seaId: 'east_blue', night: true }), THEMES.night);
  assert.equal(placeTheme({ zone: 'surface', seaId: 'paradise' }), THEMES.grandline);
  assert.equal(placeTheme({ zone: 'surface', seaId: 'east_blue', under: true }), THEMES.underwater);
  assert.equal(placeTheme({ title: true }), THEMES.title);
});

test('a fight takes its place\'s colours, a boss more; night is slower and quieter', () => {
  const east = battleOf(THEMES.sea);
  assert.equal(east.key, 45); assert.equal(east.mode, 'dorian'); assert.equal(east.lead, 'pluck');
  const wano = battleOf(THEMES.wano);
  assert.equal(wano.mode, 'in');
  assert.equal(wano.key % 12, THEMES.wano.key % 12);
  const boss = battleOf(THEMES.wano, true);
  assert.ok(boss.bpm > wano.bpm);
  assert.ok(boss.battle && boss.loop);
  const n = nightOf(THEMES.baratie);
  assert.ok(n.bpm < THEMES.baratie.bpm);
  assert.equal(n.drums, null);
  assert.equal(nightOf(THEMES.whiskey_peak), THEMES.whiskey_peak_night);
});

test('islands without a theme of their own still differ from each other', () => {
  const plain = ALL_ISLANDS.filter((i) => ['sixis', 'cozia', 'satsuruzo', 'mirror_ball'].includes(i.id));
  const keys = new Set(plain.map((i) => { const t = islandTheme(i, i.sea); return `${t.key}:${t.bpm}:${t.lead}`; }));
  assert.ok(keys.size >= 2);
});

test('the director tells the places apart', () => {
  const d = new Director({ E: { now: () => 0 }, mu: null });
  const k = (w) => d.placeKey(w);
  assert.equal(k({ title: true }), 'title');
  assert.equal(k({ zone: 'surface', rm: true }), 'rm');
  assert.equal(k({ zone: 'surface', under: true }), 'under');
  assert.equal(k({ zone: 'surface', seaId: 'north_blue' }), 'sea:north_blue');
  assert.equal(k({ zone: 'surface', island: { id: 'baratie' } }), 'isl:baratie');
  assert.equal(k({ zone: 'surface', island: { id: 'conomi_islands' }, town: { id: 'arlong_park' } }), 'town:conomi_islands:arlong_park');
  assert.equal(k({ zone: 'undersea', zoneId: 'fishman_island', under: true, island: { id: 'fishman_island' } }), 'zone:fishman_island:fishman_island');
  // a fight: foes after you, and how hard
  const p = { x: 0, y: 0, state: 'idle', hp: 20, d: { maxHp: 100 } };
  const foe = (o = {}) => ({ alive: true, state: 'idle', controller: { target: p, state: 'attack' }, ...o });
  const game = { player: p, engaged: true, combatT: 5, actorsNear: () => [foe(), foe({ boss: true })] };
  const c = d.combat(game);
  assert.ok(c.on && c.boss && c.intensity >= 0.85);
  assert.equal(d.combat({ player: p, engaged: false, combatT: 0, actorsNear: () => [] }).on, false);
});
