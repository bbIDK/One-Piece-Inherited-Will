// A contact sheet of the kit-built prop models, each from three-quarters
// above, with the game's own cel material and outlines:
//
//   node tools/propsheet.mjs <out.png> [--set=street|weapons] [--only=barrel,crate] [--cell=256]
//
// Models come from the named exports (STREET_MODELS and the like) of the
// prop modules; add a module's map to SOURCES to include it.
import * as esbuild from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
if (!out) { console.error('usage: node tools/propsheet.mjs <out.png> [--only=a,b] [--cell=256] [--yaw=0.8]'); process.exit(2); }
const SETS = {
  street: [['STREET_MODELS', 'src/render3d/props/street.js']],
  landmarks: [['LANDMARK_MODELS', 'src/render3d/props/landmarks.js']],
  interiors: [['INTERIOR_MODELS', 'src/render3d/interiors3d.js']],
  weapons: [['WEAPON_MODELS', 'src/render3d/chars/weapons.js'], ['SWORD_MODELS', 'src/render3d/chars/swords.js']],
};
const SOURCES = SETS[opt.set || 'street'];
const dir = mkdtempSync(join(tmpdir(), 'propsheet-'));
const entry = join(dir, 'entry.js');
writeFileSync(entry, `
import * as THREE from 'three';
import { meshOf } from ${JSON.stringify(join(root, 'src/render3d/props/mats.js'))};
${SOURCES.map(([n, p]) => `import { ${n} } from ${JSON.stringify(join(root, p))};`).join('\n')}
const ALL = Object.assign({}, ${SOURCES.map(([n]) => n).join(', ')});
window.go = (only, cell, yaw) => {
  const names = Object.keys(ALL).filter((n) => !only || only.includes(n));
  const cols = Math.min(names.length, 6), rows = Math.ceil(names.length / cols);
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(cell, cell); r.setClearColor(0xa9c4d4);
  r.shadowMap.enabled = true;
  const out = document.createElement('canvas'); out.width = cols * cell; out.height = rows * cell;
  const cx = out.getContext('2d'); cx.font = '14px sans-serif'; cx.fillStyle = '#123';
  const tris = {};
  names.forEach((n, i) => {
    const geo = ALL[n]();
    const scene = new THREE.Scene();
    const m = meshOf(geo); scene.add(m);
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b5a48, 1.4));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
    const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
    const cam = new THREE.PerspectiveCamera(30, 1, s / 50, s * 20), d = s * 1.75;
    cam.position.set(c.x + Math.sin(yaw) * d * 0.94, c.y + d * 0.34, c.z + Math.cos(yaw) * d * 0.94);
    cam.lookAt(c); r.render(scene, cam);
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    cx.drawImage(r.domElement, x, y);
    tris[n] = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    cx.fillText(n + ' (' + tris[n] + ')', x + 6, y + 18);
  });
  return { tris, png: out.toDataURL('image/png') };
};
`);
const bundle = join(dir, 'bundle.js');
await esbuild.build({ entryPoints: [entry], bundle: true, outfile: bundle, format: 'iife', nodePaths: [join(root, 'node_modules')], logLevel: 'error', loader: { '.glsl': 'text' } });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page:', e.message));
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ path: bundle });
  const res = await page.evaluate(([o, c, y]) => window.go(o, c, y), [opt.only ? opt.only.split(',') : null, +(opt.cell || 256), +(opt.yaw ?? 0.8)]);
  writeFileSync(out, Buffer.from(res.png.split(',')[1], 'base64'));
  console.log(out, JSON.stringify(res.tris));
} finally { await browser.close(); }
