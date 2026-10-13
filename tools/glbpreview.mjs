// Look at a GLB model (as generated, or as converted) from four sides:
//
//   node tools/glbpreview.mjs <in.glb | src/assets/models/<name>.js> <out.png>
//
// Bundles three.js + GLTFLoader for a throwaway page in the installed
// Chromium and screenshots a 2x2 sheet (front, side, back, three-quarter).
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) { console.error('usage: node tools/glbpreview.mjs <in.glb|model.js> <out.png>'); process.exit(2); }
const isGlb = inPath.endsWith('.glb');
const dir = mkdtempSync(join(tmpdir(), 'glbprev-'));
const entry = join(dir, 'entry.js');
writeFileSync(entry, `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
window.go = async (src, isGlb) => {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(1024, 1024); r.setClearColor(0x9fb8c8);
  document.body.appendChild(r.domElement);
  let obj;
  if (isGlb) {
    const bin = Uint8Array.from(atob(src), (c) => c.charCodeAt(0)).buffer;
    obj = (await new GLTFLoader().parseAsync(bin, '')).scene;
  } else {
    const m = JSON.parse(src), dec = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dec(m.pos).buffer), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(dec(m.nor).buffer), 3));
    const c8 = dec(m.col); g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(c8, (v) => v / 255), 3));
    obj = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  }
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
  const scene = new THREE.Scene(); scene.add(obj);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 3, 2); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(35, 1, s / 100, s * 10);
  const out = document.createElement('canvas'); out.width = out.height = 1024; const cx = out.getContext('2d');
  const views = [[0, 0.15], [Math.PI / 2, 0.15], [Math.PI, 0.15], [Math.PI / 4, 0.5]];
  views.forEach(([a, e], i) => {
    const d = s * 1.5;
    cam.position.set(c.x + Math.sin(a) * Math.cos(e) * d, c.y + Math.sin(e) * d, c.z + Math.cos(a) * Math.cos(e) * d);
    cam.lookAt(c); r.render(scene, cam);
    cx.drawImage(r.domElement, (i % 2) * 512, Math.floor(i / 2) * 512, 512, 512);
  });
  return { size: [s], tris: (() => { let n = 0; obj.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; })(), png: out.toDataURL('image/png') };
};
`);
const bundle = join(dir, 'bundle.js');
await esbuild.build({ entryPoints: [entry], bundle: true, outfile: bundle, format: 'iife', nodePaths: [join(root, 'node_modules')], logLevel: 'error' });
let src;
if (isGlb) src = readFileSync(inPath).toString('base64');
else { const m = (await import(resolve(inPath))).default; src = JSON.stringify(m); }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ path: bundle });
  const res = await page.evaluate(([s, g]) => window.go(s, g), [src, isGlb]);
  writeFileSync(outPath, Buffer.from(res.png.split(',')[1], 'base64'));
  console.log(`${outPath}: ${res.tris} triangles`);
} finally { await browser.close(); }
