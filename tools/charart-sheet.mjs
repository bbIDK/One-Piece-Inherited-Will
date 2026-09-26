// Contact sheet for the head art (src/render/charart.js), drawn through the
// real character renderer (src/render/character.js) so heads are seen on
// their bodies, exactly as the game draws them.
//
//   node tools/charart-sheet.mjs [--only=hair,races,hats,matrix,world,closeup,heads,eyes,cache,api,bench] [--dsf=1]
//
// Bundles a small entry script with esbuild, writes shots/charart-sheet.{html,js}
// and screenshots every section into shots/charart-<section>.png:
//   hair-L*   every hairstyle: 4 facings + expressions, large (~220 px tall)
//   hair-S    the same, small (~60 px tall), on grass and on parchment
//   races-L*  / races-S   race heads (fish-men, minks, three-eyes, lunarians…) and face flags
//   hats-L*   / hats-S    every hat in every facing
//   matrix-*  every hat on every hairstyle (front, profile, back)
//   world     random townsfolk at the in-game zoom
//   closeup   a few heads very large (plus the knocked-out face via drawHead)
//   heads*    every hairstyle in all four views, head and shoulders
//   eyes      the eye shapes (look.eyeShape) and expressions, big
//   cache     the same townsfolk drawn live and from the head bitmap cache
//   api       drawHair / drawHat called on their own, every style/hat/view
//   bench     (only with --only=bench) ms per head and per character at 46 px/tile
//   scene     (only with --only=scene) 30 fighters over 90 frames, live vs cached; add --gpu for the harness's
//             SwiftShader, --cachedfirst to time the cache on a cold page, --frames=N
// Exits non-zero if any drawing threw. Nothing here is part of the game bundle.
import * as esbuild from 'esbuild';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shots');

const ENTRY = `
import { drawCharacter, STAND, GUARD } from './src/render/character.js';
import { drawHead, drawHair, drawHat } from './src/render/charart.js';
import { makeLook } from './src/data/races.js';

const q = new URLSearchParams(location.search);
const only = (q.get('only') || 'hair,races,hats,matrix,world,closeup,heads,eyes,cache,api').split(',');
const sections = [];
const errors = [];

const FACE = { down: Math.PI / 2, left: Math.PI, right: 0, up: -Math.PI / 2 };
const GRASS = '#5f9140', PARCH = '#f3e3c0';
const HAIRS = ['short', 'spiky', 'long', 'ponytail', 'buzz', 'curly', 'afro', 'topknot', 'mohawk', 'bald', 'bun', 'pompadour', 'weird_unknown'];
const HAIR_COLS = ['#1e1e1e', '#6b4423', '#f2d16b', '#c0392b', '#2980b9', '#dfe6e9', '#2ecc71', '#e67e22', '#8e44ad', '#3b2a1a', '#e84393', '#16a085', '#c69c6d'];
const HATS = ['straw', 'bandana', 'tricorne', 'captain', 'cowboy', 'marine', 'pinkhat', 'goggles', 'headband', 'horns', 'horns:#cfd8dc', 'crown', 'halo', 'bubble', 'beanie', 'antlers', 'mystery_hat'];
const COLS = [
  ['down', {}], ['left', {}], ['right', {}], ['up', {}],
  ['grin', { d: 'down', look: { grin: true } }],
  ['fierce', { d: 'down', face: 'fierce' }],
  ['shout', { d: 'down', face: 'shout' }],
  ['hurt', { d: 'down', state: 'hurt' }],
  ['blink', { d: 'down', blink: true }],
  ['side-shout', { d: 'right', face: 'shout' }],
  ['knocked', { d: 'down', state: 'knocked' }],
];

function baseLook(over) {
  return Object.assign(makeLook(over.race || 'human', over.seedIn || 7), { top: '#d63031', bottom: '#2d3436', openShirt: false, skin: '#f1c9a0', hat: null, eyeColor: '#3b2a1a' }, over);
}

/** Draw one character into a fresh canvas. px: pixels per tile. */
function draw(look, o, px, w, h, bg) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  const d = o.d || 'down';
  const P = { ...STAND, face: o.face || null };
  const pose = { facing: FACE[d], moving: !!o.moving, walk: o.walk || 0, time: o.t ?? 1.3, state: o.state || 'idle', P, blink: !!o.blink, knockT: 1 };
  const L = o.look ? { ...look, ...o.look } : look;
  try {
    // knocked characters lie on their back with the head to the left of the feet
    const kx = o.state === 'knocked' ? 0.72 * px : 0;
    g.setTransform(px, 0, 0, px, w / 2 + kx, h - (o.foot ?? (o.state === 'knocked' ? 0.9 : 0.2)) * px);
    drawCharacter(g, L, pose);
  } catch (e) { errors.push(String(e && e.stack || e)); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'red'; g.fillRect(0, 0, w, 6); }
  return c;
}

function section(id, title, bg = '#2b2b2b', fg = '#eee') {
  const s = document.createElement('section');
  s.id = id; s.style.background = bg; s.style.color = fg;
  s.innerHTML = '<h2>' + title + '</h2>';
  document.body.appendChild(s); sections.push(id);
  return s;
}
function row(sec, label, cells, cw, bg) {
  const r = document.createElement('div'); r.className = 'row';
  const l = document.createElement('div'); l.className = 'rl'; l.textContent = label; r.appendChild(l);
  for (const [lab, cv] of cells) {
    const d = document.createElement('div'); d.className = 'cell'; d.style.width = cw + 'px';
    if (bg) d.style.background = bg;
    d.appendChild(cv);
    const t = document.createElement('div'); t.className = 'lbl'; t.textContent = lab; d.appendChild(t);
    r.appendChild(d);
  }
  sec.appendChild(r);
}
function header(sec, labels, cw) {
  const r = document.createElement('div'); r.className = 'row hdr';
  const l = document.createElement('div'); l.className = 'rl'; r.appendChild(l);
  for (const s of labels) { const d = document.createElement('div'); d.className = 'cell'; d.style.width = cw + 'px'; d.textContent = s; r.appendChild(d); }
  sec.appendChild(r);
}

/** Rows × COLS at a scale; big lists are split into chunks of 'per' rows (one screenshot each). */
function grid(id, title, rows, px, cw, ch, per = 99, bgs = [PARCH, GRASS]) {
  for (let i = 0, k = 1; i < rows.length; i += per, k++) {
    const sec = section(rows.length > per ? id + k : id, title + (rows.length > per ? ' (' + k + ')' : ''));
    header(sec, COLS.map((c) => c[0]), cw);
    rows.slice(i, i + per).forEach(([label, look], j) => {
      const bg = bgs[(i + j) % bgs.length];
      row(sec, label, COLS.map(([lab, o]) => [lab, draw(look, { d: o.d || lab, ...o }, px, cw, ch, bg)]), cw);
    });
  }
}

const hairRows = HAIRS.map((h, i) => [h, baseLook({ hair: h, hairColor: HAIR_COLS[i % HAIR_COLS.length], seedIn: 11 + i })]);
hairRows.push(['nika (Gear 5)', baseLook({ hair: 'short', hairColor: '#ffffff', nika: true, top: '#ffffff', bottom: '#ffffff' })]);
hairRows.push(['lunarian long', baseLook({ race: 'lunarian', hair: 'long', hairColor: '#f5f6fa', skin: '#5c3a21', wings: null, backFlame: false })]);

const raceRows = [];
const R = (label, race, seed, over = {}) => raceRows.push([label, Object.assign(makeLook(race, seed), { openShirt: false, hat: null }, over)]);
R('human', 'human', 3, { hair: 'short' });
R('fishman shark', 'fishman', 5, { kind: 'Saw Shark', skin: '#7fa7c9', grin: true, hair: 'long', hairColor: '#1e1e1e' });
R('fishman octopus', 'fishman', 9, { kind: 'Octopus', skin: '#e17b77', grin: false, hair: 'bald' });
R('fishman manta', 'fishman', 21, { kind: 'Manta Ray', skin: '#546de5', grin: false, hair: 'curly', hairColor: '#2c3e50' });
R('mink cat', 'mink', 1, { kind: 'Cat', ears: 'pointy', fur: '#f0932b', skin: '#f0932b', hairColor: '#f0932b', muzzle: false, furFace: true, hair: 'short' });
R('mink dog', 'mink', 2, { kind: 'Dog', ears: 'pointy', fur: '#dfe6e9', skin: '#dfe6e9', hairColor: '#dfe6e9', muzzle: true, furFace: true, hair: 'spiky' });
R('mink rabbit', 'mink', 3, { kind: 'Rabbit', ears: 'long', fur: '#f5f6fa', skin: '#f5f6fa', hairColor: '#f5f6fa', muzzle: false, furFace: false, hair: 'long' });
R('mink bear', 'mink', 4, { kind: 'Bear', ears: 'round', fur: '#6d4c41', skin: '#6d4c41', hairColor: '#6d4c41', muzzle: true, furFace: true, hair: 'bald' });
R('mink panda', 'mink', 6, { kind: 'Panda', ears: 'round', fur: '#f5f6fa', skin: '#f5f6fa', hairColor: '#f5f6fa', muzzle: false, furFace: true, hair: 'buzz' });
R('mink lion', 'mink', 7, { kind: 'Lion', ears: 'round', fur: '#f6b93b', skin: '#f6b93b', hairColor: '#e67e22', muzzle: true, furFace: true, hair: 'afro' });
R('mink sulong', 'mink', 8, { kind: 'Rabbit', ears: 'long', fur: '#f5f6fa', skin: '#f5f6fa', hairColor: '#f5f6fa', furWhite: true, furFace: true, hair: 'long' });
R('skypiean', 'skypiean', 4, { hair: 'curly', hairColor: '#f5f6fa' });
R('longarm', 'longarm', 5, { hair: 'mohawk', hairColor: '#c0392b' });
R('longleg', 'longleg', 6, { hair: 'ponytail', hairColor: '#8e44ad' });
R('buccaneer', 'buccaneer', 7, { hair: 'buzz', hairColor: '#1e1e1e' });
R('three-eye', 'three_eye', 8, { hair: 'long', hairColor: '#e84393' });
R('lunarian', 'lunarian', 9, { hair: 'spiky' });
R('long nose', 'human', 10, { hair: 'curly', hairColor: '#1e1e1e', nose: 'long', skin: '#c68642' });
R('red nose', 'human', 11, { hair: 'long', hairColor: '#1976d2', nose: 'red', skin: '#fafafa' });
R('scar eye', 'human', 12, { hair: 'short', hairColor: '#c0392b', scarEye: true });
R('shades', 'human', 13, { hair: 'short', hairColor: '#f2d16b', goggles: true });
R('grin teeth', 'human', 14, { hair: 'curly', hairColor: '#1e1e1e', grin: true, sharpTeeth: true, skin: '#d7a67a' });

const hatRows = HATS.map((hv, i) => {
  const [hat, hc] = hv.split(':');
  return [hv, baseLook({ hat, hatColor: hc || undefined, hair: HAIRS[i % 12], hairColor: HAIR_COLS[(i + 3) % HAIR_COLS.length], seedIn: 40 + i })];
});

if (only.includes('hair')) {
  grid('hair-L', 'Hairstyles — large', hairRows, 112, 150, 245, 5);
  const sec = section('hair-S', 'Hairstyles — small (~60 px) on grass | parchment');
  header(sec, [...COLS.map((c) => c[0]), ...COLS.map((c) => c[0])], 58);
  for (const [label, look] of hairRows) row(sec, label, [...COLS.map(([lab, o]) => [lab, draw(look, { d: o.d || lab, ...o }, 31, 58, 72, GRASS)]), ...COLS.map(([lab, o]) => [lab, draw(look, { d: o.d || lab, ...o }, 31, 58, 72, PARCH)])], 58);
}
if (only.includes('races')) {
  grid('races-L', 'Races and face flags — large', raceRows, 112, 150, 245, 6);
  const sec = section('races-S', 'Races — small (~60 px) on grass | parchment');
  header(sec, [...COLS.map((c) => c[0]), ...COLS.map((c) => c[0])], 58);
  for (const [label, look] of raceRows) row(sec, label, [...COLS.map(([lab, o]) => [lab, draw(look, { d: o.d || lab, ...o }, 31, 58, 72, GRASS)]), ...COLS.map(([lab, o]) => [lab, draw(look, { d: o.d || lab, ...o }, 31, 58, 72, PARCH)])], 58);
}
if (only.includes('hats')) {
  grid('hats-L', 'Hats — large', hatRows, 112, 150, 265, 6);
  const sec = section('hats-S', 'Hats — small (~60 px) on grass | parchment');
  header(sec, [...COLS.map((c) => c[0]), ...COLS.map((c) => c[0])], 58);
  for (const [label, look] of hatRows) row(sec, label, [...COLS.map(([lab, o]) => [lab, draw(look, { d: o.d || lab, ...o }, 31, 58, 78, GRASS)]), ...COLS.map(([lab, o]) => [lab, draw(look, { d: o.d || lab, ...o }, 31, 58, 78, PARCH)])], 58);
}
if (only.includes('matrix')) {
  for (const d of ['down', 'right', 'up']) {
    const sec = section('matrix-' + d, 'Every hat on every hairstyle — ' + d);
    header(sec, HAIRS.slice(0, 12), 84);
    HATS.forEach((hv, i) => {
      const [hat, hc] = hv.split(':');
      row(sec, hv, HAIRS.slice(0, 12).map((h, j) => [h, draw(baseLook({ hair: h, hat, hatColor: hc || undefined, hairColor: HAIR_COLS[j], seedIn: 90 + j }), { d, foot: -0.5 }, 62, 84, 96, (i + j) % 2 ? PARCH : GRASS)]), 84);
    });
  }
}
if (only.includes('world')) {
  const sec = section('world', 'Townsfolk at the in-game zoom (46 px/tile) — random makeLook');
  const races = ['human', 'human', 'human', 'fishman', 'mink', 'skypiean', 'longarm', 'longleg', 'buccaneer', 'three_eye', 'lunarian'];
  const hats = [null, null, null, 'bandana', 'straw', 'cowboy', 'marine', 'beanie', 'captain', 'headband', 'goggles', 'tricorne'];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    for (let k = 0; k < 16; k++) {
      const i = r * 16 + k;
      const L = makeLook(races[i % races.length], 1000 + i * 17);
      if (i % 3 === 0) L.hat = hats[i % hats.length];
      const d = ['down', 'right', 'left', 'up'][(i + r) % 4];
      cells.push([d, draw(L, { d, moving: i % 5 === 0, walk: i }, 46, 70, 100, r % 2 ? GRASS : '#c9b27c')]);
    }
    row(sec, 'row ' + (r + 1), cells, 70);
  }
}
if (only.includes('closeup')) {
  const sec = section('closeup', 'Close-ups (300 px/tile)');
  const picks = [['short', '#1e1e1e', null], ['long', '#f2d16b', null], ['spiky', '#c0392b', 'straw'], ['ponytail', '#6b4423', null], ['curly', '#2980b9', 'bandana'], ['afro', '#1e1e1e', null]];
  for (const [h, c, hat] of picks) {
    const look = baseLook({ hair: h, hairColor: c, hat, seedIn: 5 });
    const ko = document.createElement('canvas'); ko.width = 250; ko.height = 330;
    { const g = ko.getContext('2d'); g.fillStyle = PARCH; g.fillRect(0, 0, 250, 330); g.setTransform(300, 0, 0, 300, 125, 200); drawHead(g, look, 0, 0.3, 'down', { state: 'knocked' }, 1, null); }
    row(sec, h + (hat ? '+' + hat : ''), [...['down', 'right', 'up', 'grin', 'shout'].map((k) => {
      const o = k === 'grin' ? { d: 'down', look: { grin: true } } : k === 'shout' ? { d: 'down', face: 'shout' } : { d: k };
      return [k, draw(look, { ...o, foot: -0.76 }, 300, 250, 330, PARCH)];
    }), ['ko (drawHead)', ko]], 250);
  }
}
if (only.includes('api')) {
  // the exported pieces on their own: drawHair (both layers over a plain circle face, as the knocked pose uses it) and drawHat
  const sec = section('api', 'drawHair / drawHat standalone, every style and hat in every view');
  const cell = (fn) => { const c = document.createElement('canvas'); c.width = 60; c.height = 64; const g = c.getContext('2d'); g.fillStyle = PARCH; g.fillRect(0, 0, 60, 64);
    g.setTransform(60, 0, 0, 60, 30, 40); try { fn(g); } catch (e) { errors.push(String(e && e.stack || e)); } return c; };
  for (const d of ['down', 'right', 'up']) {
    row(sec, 'hair ' + d, HAIRS.map((h, i) => [h, cell((g) => { g.beginPath(); g.arc(0, 0, 0.3, 0, Math.PI * 2); g.fillStyle = '#f1c9a0'; g.fill(); drawHair(g, h, HAIR_COLS[i], 0, 0.3, d, h === 'spiky' ? 1.2 : null); })]), 60);
    row(sec, 'hat ' + d, HATS.map((hv) => { const [hat, hc] = hv.split(':'); return [hat, cell((g) => drawHat(g, hat, 0, 0.3, d, { hair: 'short', hatColor: hc || undefined, seed: 4 }))]; }), 60);
  }
}
if (only.includes('heads')) {
  // every hairstyle in all four views, head and shoulders at 190 px/tile (drawn live: above the cache size)
  const rows = HAIRS.slice(0, 12).map((h, i) => [h, baseLook({ hair: h, hairColor: HAIR_COLS[i % HAIR_COLS.length], seedIn: 11 + i })]);
  rows.push(['nika', baseLook({ hair: 'short', hairColor: '#ffffff', nika: true, top: '#ffffff', bottom: '#ffffff' })]);
  for (let i = 0, k = 1; i < rows.length; i += 5, k++) {
    const sec = section('heads' + k, 'Heads, all views (' + k + ')');
    for (const [label, look] of rows.slice(i, i + 5)) {
      row(sec, label, ['down', 'left', 'right', 'up'].map((d) => [d, draw(look, { d, foot: -0.72 }, 190, 180, 200, (i + k) % 2 ? PARCH : GRASS)]), 180);
    }
  }
}
// --scene: a crowd mid-combat, timed frame by frame (with a GPU sync per frame), live vs cached heads.
// Run with --gpu to use the play-test harness's SwiftShader flags.
let scene = null;
if (only.includes('scene')) {
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const races = ['human', 'human', 'fishman', 'mink', 'skypiean', 'longarm', 'longleg', 'buccaneer', 'three_eye', 'lunarian'];
  const hats = [null, 'straw', 'bandana', null, 'cowboy', 'marine', 'beanie', 'captain', 'headband', null, 'goggles', 'tricorne'];
  const cast = [];
  for (let i = 0; i < 30; i++) {
    const L = makeLook(races[i % races.length], 7000 + i * 29);
    L.hat = hats[i % hats.length];
    if (i % 5 === 0) L.grin = true;
    cast.push({ L, x: 70 + (i % 10) * 120, y: 200 + Math.floor(i / 10) * 220, facing: [Math.PI / 2, 0, Math.PI, -Math.PI / 2][i % 4], role: i % 6 });
  }
  const frame = (f) => {
    const t = 1.3 + f / 30;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = GRASS; g.fillRect(0, 0, 1280, 720);
    for (const c of cast) {
      g.setTransform(46, 0, 0, 46, c.x, c.y);
      // roles: 0 fierce jab, 1 shout, 2 hurt (flinching every other beat), 3 blocking, 4 walking, 5 idle (blinks)
      const beat = Math.floor(t * 2 + c.x) % 2;
      const pose = { facing: c.facing, time: t, walk: t * 8, moving: c.role === 4, state: c.role === 2 && beat ? 'hurt' : 'idle', combat: c.role < 4 };
      if (c.role === 0) pose.P = { ...GUARD, face: beat ? 'fierce' : null };
      else if (c.role === 1) pose.P = { ...GUARD, face: beat ? 'shout' : 'fierce' };
      else if (c.role === 3) pose.block = true;
      drawCharacter(g, c.L, pose);
    }
    g.getImageData(0, 0, 1, 1); // wait for the raster (GPU canvases draw lazily)
  };
  const run = (live, n) => {
    globalThis.CHARART_NOCACHE = live;
    const ms = [];
    for (let f = 0; f < n; f++) { const t0 = performance.now(); frame(f); ms.push(performance.now() - t0); }
    const s = ms.slice(5).sort((a, b) => a - b);
    return { first: +ms[0].toFixed(1), first5: ms.slice(0, 5).map((v) => +v.toFixed(1)), max: +Math.max(...ms).toFixed(1), median: +s[s.length >> 1].toFixed(1), total: Math.round(ms.reduce((a, b) => a + b, 0)) };
  };
  const n = Number(q.get('frames') || 90);
  // --cachedfirst: the cached pass runs on a cold page (it pays the renderer's warm-up, as the game would)
  if (q.get('cachedfirst')) { const cached = run(false, n); scene = { cached, live: run(true, n), frames: n, order: 'cached first' }; }
  else scene = { live: run(true, n), cached: run(false, n), frames: n, order: 'live first' };
  globalThis.CHARART_NOCACHE = false;
  console.log('SCENE ' + JSON.stringify(scene));
}
if (only.includes('eyes')) {
  // eye shapes (look.eyeShape) and expressions, big
  const sec = section('eyes', 'Eye shapes (look.eyeShape) at 260 px/tile');
  for (const shape of ['round', 'sharp', 'soft', 'fish']) {
    const look = baseLook({ hair: 'short', hairColor: '#3b2a1a', eyeShape: shape, eyeColor: shape === 'fish' ? '#1e3799' : '#27ae60', seedIn: 21 });
    row(sec, shape, [['down', {}], ['right', {}], ['fierce', { face: 'fierce' }], ['shout', { face: 'shout' }], ['side fierce', { d: 'right', face: 'fierce' }], ['blink', { blink: true }]].map(([lab, o]) =>
      [lab, draw(look, { d: o.d || (lab === 'right' ? 'right' : 'down'), ...o, foot: -0.84 }, 260, 200, 200, PARCH)]), 200);
  }
}
if (only.includes('cache')) {
  // the same townsfolk drawn live (top) and from the head cache (bottom), at the in-game zoom, off the pixel grid
  const sec = section('cache', 'Head cache check at 46 px/tile: live (odd rows) vs cached (even rows)');
  const races = ['human', 'fishman', 'mink', 'skypiean', 'three_eye', 'lunarian', 'human', 'buccaneer'];
  const hats = [null, 'straw', 'bandana', null, 'cowboy', 'marine', 'beanie', 'captain', 'headband', null];
  for (let r = 0; r < 2; r++) {
    for (const live of [true, false]) {
      globalThis.CHARART_NOCACHE = live;
      const cells = [];
      for (let k = 0; k < 12; k++) {
        const i = r * 12 + k;
        const L = makeLook(races[i % races.length], 3000 + i * 13);
        L.hat = hats[i % hats.length];
        const d = ['down', 'right', 'left', 'up'][i % 4];
        const c = document.createElement('canvas'); c.width = 64; c.height = 96;
        const g = c.getContext('2d'); g.fillStyle = r % 2 ? GRASS : PARCH; g.fillRect(0, 0, 64, 96);
        g.setTransform(46, 0, 0, 46, 32.37, 90.61);
        drawCharacter(g, L, { facing: FACE[d], moving: false, time: 1.3 + i, state: 'idle', P: { ...STAND }, blink: false });
        cells.push([(live ? 'live ' : 'cache ') + d, c]);
      }
      row(sec, (live ? 'live' : 'cached') + ' ' + (r + 1), cells, 64);
    }
  }
  globalThis.CHARART_NOCACHE = false;
}
// --bench: time the heads alone and whole characters at the in-game zoom (46 px/tile)
let bench = null;
if (only.includes('bench')) {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
  const g = c.getContext('2d');
  const looks = [];
  const races = ['human', 'human', 'human', 'fishman', 'mink', 'skypiean', 'longarm', 'longleg', 'buccaneer', 'three_eye', 'lunarian'];
  const hats = [null, null, 'bandana', 'straw', 'cowboy', 'marine', 'beanie', 'captain', 'headband', 'goggles', 'tricorne', 'horns'];
  for (let i = 0; i < 64; i++) { const L = makeLook(races[i % races.length], 500 + i * 31); if (i % 2) L.hat = hats[i % hats.length]; looks.push(L); }
  const dirs = ['down', 'right', 'left', 'up'];
  const run = (fn, n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) fn(i); return (performance.now() - t0) / n; };
  const head = (i) => { g.setTransform(46, 0, 0, 46, 40 + (i % 30) * 40, 60 + ((i / 30) | 0) % 16 * 40); drawHead(g, looks[i % 64], -1.19, 0.3, dirs[i % 4], { state: 'idle' }, i * 0.1, null); };
  const full = (i) => { g.setTransform(46, 0, 0, 46, 40 + (i % 30) * 40, 90 + ((i / 30) | 0) % 16 * 40); drawCharacter(g, looks[i % 64], { facing: [Math.PI / 2, 0, Math.PI, -Math.PI / 2][i % 4], moving: i % 3 === 0, walk: i, time: i * 0.1, state: 'idle' }); };
  run(head, 400); run(full, 400); // warm-up (paths are built and cached lazily)
  const n = Number(q.get('n') || 3000);
  bench = { headMs: +run(head, n).toFixed(4), characterMs: +run(full, n).toFixed(4), n };
  console.log('BENCH ' + JSON.stringify(bench));
}
window.SHEET = { done: true, sections, errors, bench, scene };
console.log('SHEET ' + JSON.stringify({ sections: sections.length, errors: errors.slice(0, 5) }));
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Head art sheet</title>
<style>
body { margin: 0; font: 11px/1.2 system-ui, sans-serif; background: #222; }
section { padding: 8px 10px 10px; display: inline-block; min-width: 100%; box-sizing: border-box; }
h2 { margin: 0 0 6px; font-size: 14px; }
.row { display: flex; gap: 2px; align-items: flex-start; margin-bottom: 2px; }
.row.hdr .cell { font-weight: 700; text-align: center; }
.rl { width: 84px; flex: none; font-size: 11px; padding-top: 4px; }
.cell { display: flex; flex-direction: column; align-items: center; flex: none; }
.lbl { font-size: 9px; opacity: .7; }
canvas { display: block; }
</style></head><body><script src="charart-sheet.js"></script></body></html>`;

/** Bundle the sheet script and write shots/charart-sheet.{html,js}. Returns the page path. */
export async function buildSheet() {
  mkdirSync(outDir, { recursive: true });
  const res = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: root, sourcefile: 'charart-sheet-entry.js', loader: 'js' },
    bundle: true, format: 'iife', target: ['es2020'], write: false,
    loader: { '.css': 'text', '.glsl': 'text' }, logLevel: 'silent',
  });
  writeFileSync(join(outDir, 'charart-sheet.js'), res.outputFiles[0].text);
  writeFileSync(join(outDir, 'charart-sheet.html'), HTML);
  return '/shots/charart-sheet.html';
}

/** Wait for the sheet, screenshot every section. */
export async function shootSheet(page) {
  await page.waitForFunction(() => window.SHEET && window.SHEET.done, null, { timeout: 1800000 });
  const { sections, errors } = await page.evaluate(() => window.SHEET);
  const files = [];
  for (const s of sections) {
    const file = join(outDir, `charart-${s}.png`);
    await (await page.$('#' + s)).screenshot({ path: file });
    files.push(file);
  }
  return { files, errors };
}

// ------------------------------------------------------------------ CLI
if (process.argv[1] && normalize(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const { chromium } = await import('playwright-core');
  const { startServer } = await import('./serve.mjs');
  const pagePath = await buildSheet();
  const chromePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => existsSync(p));
  const port = 22000 + Math.floor(Math.random() * 2000);
  const server = await startServer(port);
  // --gpu: the play-test harness's flags (tools/shot.mjs): canvases are GPU-accelerated through SwiftShader
  const browser = await chromium.launch({ executablePath: chromePath, args: args.gpu ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [] });
  const page = await browser.newPage({ viewport: { width: Number(args.w || 1400), height: 900 }, deviceScaleFactor: Number(args.dsf || 1) });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text()); } else if (/^(SHEET|BENCH|SCENE)/.test(m.text())) console.log(m.text().slice(0, 2000)); });
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.stack || e.message); });
  const qs = new URLSearchParams(); for (const k of ['only', 'frames', 'cachedfirst']) if (args[k]) qs.set(k, args[k]);
  await page.goto(`http://localhost:${port}${pagePath}?${qs}`, { waitUntil: 'commit', timeout: 0 });
  try {
    const res = await shootSheet(page);
    for (const f of res.files) console.log('shot →', f);
    for (const e of res.errors) { console.log('[draw-error]', e); errors.push(e); }
  } catch (e) { console.log('[sheet-error]', e.message); errors.push(e.message); }
  await browser.close();
  server.close();
  console.log(`charart sheet: ${errors.length} error(s)`);
  process.exit(errors.length ? 1 : 0);
}
