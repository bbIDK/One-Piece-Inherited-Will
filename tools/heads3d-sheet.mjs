// Contact sheet of 3D heads from every side: front, three-quarter, profile
// and from behind, drawn with the game's own character views (VIEWS.actor)
// on the creator's lit stage, the head held still (no glancing at you).
// Much quicker than booting the game for a look at faces and profiles.
//
//   node tools/heads3d-sheet.mjs [--only=man,woman,...] [--views=front,34,side,back] [--size=300] [--dist=1.15] [--tag=name]
//                                [--hairs=short,spiky,... (on a man)] [--fhairs=bob,long,... (on a woman)] [--races=mink,fishman,...] [--lod=2|1] [--light=noon (the game's midday sun) [--sun=x,y,z]]
//
// Writes shots/heads3d-sheet.{html,js} and shots/heads3d[-tag].png.
// Nothing here is part of the game bundle.
import * as esbuild from 'esbuild';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shots');

const ENTRY = `
import * as THREE from 'three';
import { VIEWS } from './src/render3d/registry.js';
import { Actor } from './src/game/actor.js';
import './src/render3d/chars3d.js';
import { makeLook } from './src/data/races.js';

const q = new URLSearchParams(location.search);
const base = { race: 'human', seed: 5, idle: 'rest', bottomStyle: 'trousers', bottom: '#2b2b33' };
const LOOKS = {
  man: { fem: false, frame: 'average', hair: 'bald', skin: '#f1c9a0', topStyle: 'tee', top: '#3b6ea5', eyeShape: 'sharp' },
  zoro: { fem: false, frame: 'athletic', hair: 'crop', hairColor: '#3fae4a', skin: '#e8b98f', topStyle: 'kimono', openShirt: true, top: '#2f6b3a', eyeShape: 'sharp', frown: true, mouth: 'flat', muscle: 0.9 },
  luffy: { fem: false, frame: 'lean', hair: 'messy', hairColor: '#141414', skin: '#f3c9a0', topStyle: 'vest', top: '#d12b2b', eyeShape: 'bold', scarCheek: true, grin: true, muscle: 0.75 },
  brawny: { fem: false, frame: 'brawny', hair: 'buzz', hairColor: '#3b2a1a', skin: '#c68a5e', topStyle: 'tank', top: '#555555', eyeShape: 'sharp', muscle: 1.1, faceShape: 'square', chin: 'strong' },
  woman: { fem: true, frame: 'average', hair: 'bald', skin: '#f6d5b8', topStyle: 'tee', top: '#c0392b', eyeShape: 'soft' },
  nami: { fem: true, frame: 'curvy', hair: 'wavy', hairColor: '#e8742a', skin: '#f6cfae', topStyle: 'bikini', top: '#3c9a52', eyeShape: 'bright' },
  bob: { fem: true, frame: 'average', hair: 'bob', hairColor: '#3b2a1a', skin: '#f6d5b8', topStyle: 'tee', top: '#c0392b', eyeShape: 'soft' },
  old: { fem: false, frame: 'stocky', hair: 'short', hairColor: '#d8d8d8', skin: '#e0b08a', topStyle: 'shirt', top: '#8d6e63', eyeShape: 'tired', noseShape: 'big', faceShape: 'long' },
  // bald, for the head's shape: every face shape, chin and nose
  square: { fem: false, hair: 'bald', skin: '#e8b98f', faceShape: 'square', chin: 'strong', noseShape: 'normal', top: '#607d8b' },
  long: { fem: false, hair: 'bald', skin: '#e8b98f', faceShape: 'long', chin: 'round', noseShape: 'hooked', top: '#607d8b' },
  round: { fem: false, hair: 'bald', skin: '#e8b98f', faceShape: 'round', chin: 'round', noseShape: 'button', top: '#607d8b' },
  heart: { fem: true, hair: 'bald', skin: '#f6d5b8', faceShape: 'heart', chin: 'pointed', noseShape: 'small', top: '#8e44ad' },
  bignose: { fem: false, hair: 'bald', skin: '#e8b98f', faceShape: 'oval', chin: 'round', noseShape: 'big', top: '#607d8b' },
  fround: { fem: true, hair: 'bald', skin: '#f6d5b8', faceShape: 'round', chin: 'round', noseShape: 'button', top: '#8e44ad' },
};
// how far the head is turned from facing you (to its left: you see its right side)
const ANG = { front: 0, 34: 0.75, side: Math.PI / 2, back: 2.4, left: -Math.PI / 2 };
// (--races=a,b,…: the game's own rolls of those races)
for (const r of (q.get('races') || '').split(',').filter(Boolean)) LOOKS['r-' + r] = { ...makeLook(r, 7), race: r };
// (--hairs=a,b,…: those hairstyles on a man, --fhairs on a woman)
for (const hs of (q.get('hairs') || '').split(',').filter(Boolean)) LOOKS['m-' + hs] = { fem: false, hair: hs, hairColor: '#4a2f1d', skin: '#e8b98f', top: '#607d8b' };
for (const hs of (q.get('fhairs') || '').split(',').filter(Boolean)) LOOKS['f-' + hs] = { fem: true, hair: hs, hairColor: '#7a3b1d', skin: '#f6d5b8', top: '#8e44ad' };
const only = (q.get('only') || [...(q.get('hairs') || '').split(',').filter(Boolean).map((h) => 'm-' + h), ...(q.get('fhairs') || '').split(',').filter(Boolean).map((h) => 'f-' + h), ...(q.get('races') || '').split(',').filter(Boolean).map((r) => 'r-' + r)].join(',') || 'man,zoro,luffy,brawny,woman,nami').split(',');
const views = (q.get('views') || 'front,34,side,back').split(',');
const S = Number(q.get('size') || 300);
const errors = [];

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(1);
renderer.setSize(S, S, false);
renderer.setClearColor(0xb9c7d3, 1);
const scene = new THREE.Scene();
if (q.get('light') === 'noon') {
  // (as in the game at midday: a high sun and the sky)
  scene.add(new THREE.HemisphereLight(0xbfdcff, 0x6b5a3a, 1.0));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4); sun.position.set(...(q.get('sun') || '0.3,1,0.35').split(',').map(Number)); scene.add(sun);
} else {
  // (the character creator's stage)
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x7a6448, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(2.2, 4, 3.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe3ff, 1.4); rim.position.set(-3, 2.5, -3); scene.add(rim);
}
const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 60);
const ctx = { THREE, scene, game: null, ground: () => 0, terrain: () => 0, camera, world: null, yaw: 0, mode: 'third' };
const env = { time: 0, daylight: 1, ambient: [1, 1, 1], clock: 12, storm: 0, fog: 0 };

const sheet = document.createElement('canvas');
sheet.width = S * views.length; sheet.height = S * only.length;
sheet.id = 'sheet';
document.body.appendChild(sheet);
const g = sheet.getContext('2d');
only.forEach((name, r) => {
  try {
    const look = { ...base, ...LOOKS[name] };
    const a = new Actor({ name: '', look, race: look.race || 'human' });
    a.facing = Math.PI / 2;
    // (--lod=2 or 1: the model the game uses across the street / far off)
    const v = VIEWS.actor(a, ctx, { dist: { 0: 0, 2: 15, 1: 30 }[q.get('lod') || 0] ?? 0 });
    v.lookAt = () => 0; v.headYaw = 0;
    scene.add(v.root);
    views.forEach((vw, c) => {
      a.facing = Math.PI / 2 + (ANG[vw] ?? 0);
      v.visF = a.facing;
      for (let i = 0; i < 3; i++) v.update(a, env, ctx, { camYaw3: 0, redraw: true });
      v.root.position.set(0, 0, 0);
      v.root.updateMatrixWorld(true);
      // (the head: its bone, where the face decal hangs)
      const p = new THREE.Vector3();
      (v.model.face || v.root).getWorldPosition(p);
      const dist = Number(q.get('dist') || 1.15);
      camera.position.set(p.x, p.y + 0.02, p.z + dist);
      camera.lookAt(p.x, p.y - 0.09, p.z);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      g.drawImage(renderer.domElement, c * S, r * S);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.font = '12px sans-serif'; g.fillText(name + ' ' + vw, c * S + 6, r * S + 14);
    });
    scene.remove(v.root);
    v.dispose?.();
  } catch (e) { errors.push(name + ': ' + (e.stack || e.message)); }
});
window.SHEET = { done: true, errors };
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#222} canvas{display:block}</style></head><body><script src="heads3d-sheet.js"></script></body></html>`;

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
mkdirSync(outDir, { recursive: true });
const res = await esbuild.build({
  stdin: { contents: ENTRY, resolveDir: root, sourcefile: 'heads3d-sheet-entry.js', loader: 'js' },
  bundle: true, format: 'iife', target: ['es2020'], write: false,
  loader: { '.css': 'text', '.glsl': 'text' }, logLevel: 'silent',
});
writeFileSync(join(outDir, 'heads3d-sheet.js'), res.outputFiles[0].text);
writeFileSync(join(outDir, 'heads3d-sheet.html'), HTML);

const { chromium } = await import('playwright-core');
const { startServer } = await import('./serve.mjs');
const chromePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => existsSync(p));
const port = 24000 + Math.floor(Math.random() * 2000);
const server = await startServer(port);
const browser = await chromium.launch({ executablePath: chromePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text()); } });
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.stack || e.message); });
const qs = new URLSearchParams(); for (const k of ['only', 'views', 'size', 'dist', 'hairs', 'fhairs', 'races', 'light', 'sun', 'lod']) if (args[k]) qs.set(k, args[k]);
await page.goto(`http://localhost:${port}/shots/heads3d-sheet.html?${qs}`, { waitUntil: 'commit', timeout: 0 });
try {
  await page.waitForFunction(() => window.SHEET && window.SHEET.done, null, { timeout: 600000 });
  const { errors: e2 } = await page.evaluate(() => window.SHEET);
  for (const e of e2) { console.log('[draw-error]', e); errors.push(e); }
  const file = join(outDir, `heads3d${args.tag ? '-' + args.tag : ''}.png`);
  await (await page.$('#sheet')).screenshot({ path: file });
  console.log('shot →', file);
} catch (e) { console.log('[sheet-error]', e.message); errors.push(e.message); }
await browser.close();
server.close();
console.log(`heads3d sheet: ${errors.length} error(s)`);
process.exit(errors.length ? 1 : 0);
