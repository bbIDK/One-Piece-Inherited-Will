// Loot on the ground and flotsam at sea, in 3D: dropped items float over a
// glowing ring with their icon, Devil Fruits get a swirled fruit, and drifting
// barrels bob on the waves with a "?" over them. Runs as a frame hook.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { itemIcon } from '../render/icons.js';
import { toon, toonGradient } from './materials.js';

const iconMats = new Map();
function iconMaterial(id) {
  let m = iconMats.get(id);
  if (!m) {
    const cv = itemIcon(id, 96);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
    iconMats.set(id, m);
  }
  return m;
}

let fruitTex = null;
function devilFruitTexture() {
  if (fruitTex) return fruitTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8e44ad'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#d7a6f0'; g.lineWidth = 3;
  // the famous swirls
  for (let k = 0; k < 6; k++) {
    const cx = 12 + k * 21, cy = 18 + (k % 2) * 26;
    g.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = a * 1.1; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.stroke();
  }
  fruitTex = new THREE.CanvasTexture(c);
  fruitTex.colorSpace = THREE.SRGBColorSpace;
  fruitTex.wrapS = THREE.RepeatWrapping;
  return fruitTex;
}

const ringGeo = new THREE.RingGeometry(0.28, 0.42, 24);
ringGeo.rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
const fruitRingMat = new THREE.MeshBasicMaterial({ color: 0xff9e80, transparent: true, opacity: 0.6, depthWrite: false, fog: true });
let fruitMat = null;

function makeItemView(it) {
  const root = new THREE.Group();
  const isFruit = !!(it.id && it.id.startsWith('fruit_'));
  const ring = new THREE.Mesh(ringGeo, isFruit ? fruitRingMat : ringMat);
  ring.position.y = 0.04;
  root.add(ring);
  let spin = null;
  if (isFruit) {
    fruitMat ||= new THREE.MeshToonMaterial({ color: 0xffffff, map: devilFruitTexture(), gradientMap: toonGradient() });
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), fruitMat);
    fruit.scale.set(1, 1.1, 1);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.14, 6), toon(0x5d4037));
    stem.position.y = 0.26;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(0x2e7d32));
    leaf.scale.set(1.4, 0.35, 0.8);
    leaf.position.set(0.08, 0.3, 0);
    spin = new THREE.Group();
    spin.add(fruit, stem, leaf);
    spin.position.y = 0.55;
    root.add(spin);
  } else {
    const s = new THREE.Sprite(iconMaterial(it.id || 'pouch'));
    s.scale.set(0.55, 0.55, 1);
    s.position.y = 0.6;
    root.add(s);
    spin = s;
  }
  return { root, spin };
}

let barrelProto = null;
function makeBarrel() {
  if (!barrelProto) {
    // an upright barrel, laid on its side to float
    const upright = new THREE.Group();
    upright.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.8, 14), toon(0x8d5b33)));
    const bandMat = toon(0x4a4a4a);
    for (const y of [-0.26, 0.26]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.07, 14), bandMat);
      b.position.y = y;
      upright.add(b);
    }
    upright.rotation.z = Math.PI / 2;
    barrelProto = new THREE.Group();
    barrelProto.add(upright);
  }
  const root = new THREE.Group();
  root.add(barrelProto.clone());
  const q = new THREE.Sprite(questionMaterial());
  q.scale.set(0.5, 0.5, 1);
  q.position.y = 1.0;
  root.add(q);
  return root;
}

let qMat = null;
function questionMaterial() {
  if (qMat) return qMat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '900 52px Nunito, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#3b2a1a'; g.strokeText('?', 32, 34);
  g.fillStyle = '#ffd54f'; g.fillText('?', 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  qMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
  return qMat;
}

const views = new Map(); // record → { root, spin?, kind }
let group = null;

registerFrameHook((env, ctx) => {
  const game = ctx.game;
  const v = game.view3d;
  if (!group) { group = new THREE.Group(); group.name = 'pickups'; ctx.scene.add(group); }
  const w = ctx.world;
  if (!w || !v) return;
  const ox = v.ox, oy = v.oy;
  const seen = new Set();
  const t = env.time;
  const place = (rec, kind, make) => {
    const dx = w.dx(ox, rec.x), dz = rec.y - oy;
    if (dx * dx + dz * dz > 120 * 120) return;
    seen.add(rec);
    let view = views.get(rec);
    if (!view) {
      view = make();
      view.kind = kind;
      views.set(rec, view);
      group.add(view.root);
    }
    if (kind === 'item') {
      view.root.position.set(dx, ctx.ground(rec.x, rec.y), dz);
      if (view.spin) {
        view.spin.position.y = 0.55 + Math.sin(t * 3 + rec.x) * 0.06;
        if (view.spin.isGroup) view.spin.rotation.y = t * 1.2;
      }
    } else {
      view.root.position.set(dx, Math.sin(t * 2 + (rec.t || 0)) * 0.08 - 0.12, dz);
      view.root.rotation.set(Math.sin(t * 1.3 + (rec.t || 0)) * 0.12, (rec.t || 0), Math.cos(t * 1.1) * 0.1);
    }
  };
  for (const it of game.groundItems || []) place(it, 'item', () => makeItemView(it));
  for (const f of game.flotsam || []) if (f.alive) place(f, 'barrel', () => ({ root: makeBarrel() }));
  for (const [rec, view] of views) {
    if (seen.has(rec)) continue;
    group.remove(view.root);
    if (view.kind === 'item') view.root.traverse((o) => { if (o.geometry && o.geometry !== ringGeo) o.geometry.dispose(); });
    views.delete(rec);
  }
}, 'pickups');
