// Water 7's own landmarks (data/islands/paradise2.js): the Great Fountain on
// top of the terraced city — a stone basin, and rising out of it a tower of
// three bowls on columns, each spilling a ring of water into the one below
// and the lowest into the basin, a jet thrown up from the top — and the
// Galley-La Company's numbered docks round the shore: big timber sheds over
// stone slipways running down into the sea, a ship on the stocks in each,
// the dock's number on a great plate at either end.
import * as THREE from 'three';
import { box, cyl, lathe, torus, extrude } from './kit.js';
import { meshOf, animate, bindCtx, glowMat } from './mats.js';
import { model } from './street.js';
import { registerPropBuilder } from '../registry.js';
import { terraceWater } from '../terraces3d.js';
import { hullGeometry } from '../ships3d.js';
import { SHIPS } from '../../data/ships.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });

/** Water geometry in the terrace water's attributes (kind: 0 run, 1 sheet, 2 foam, 3 still, 4 ring sheet). */
function waterGeo(pos, uv, kind, t, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** A still disc of water, radius r, at height y. */
function pool(r, y, seg = 40) {
  const pos = [0, y, 0], uv = [0, 0], kind = [3], t = [0], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * r, y, Math.sin(a) * r); uv.push(Math.cos(a) * r, Math.sin(a) * r); kind.push(3); t.push(0);
    if (i) idx.push(0, i + 1, i);
  }
  return waterGeo(pos, uv, kind, t, idx);
}

/** A ring of water falling from radius r0 at y0 to radius r1 at y1 (bulging out as it falls). */
function curtain(r0, y0, r1, y1, seg = 36) {
  const pos = [], uv = [], kind = [], t = [], idx = [];
  const V = 8, drop = y0 - y1;
  for (let j = 0; j <= V; j++) {
    const v = j / V, r = r0 + (r1 - r0) * Math.sqrt(v), y = y0 - drop * v;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r); uv.push((i / seg) * Math.round(r * 2.2), drop * v); kind.push(4); t.push(v);
    }
  }
  const N = seg + 1;
  for (let j = 0; j < V; j++) for (let i = 0; i < seg; i++) { const a = j * N + i; idx.push(a, a + 1, a + N, a + 1, a + N + 1, a + N); }
  return waterGeo(pos, uv, kind, t, idx);
}

// ------------------------------------------------------------ the Great Fountain
const BASIN = 9.5;
// the tower: [column top, bowl radius] — each bowl sits on its column, its rim 1.2 m up
const TIERS = [[6.6, 6.4], [12.4, 4.2], [17.2, 2.5]];
const STONE = '#e9dcc0', STONE2 = '#cdbb98', TRIM = '#f6efe0', DARK = '#a48f6a';

const fountainGeo = () => model('greatfountain', (k) => {
  // the basin: a broad rim on a moulded wall, a step round its foot (up the
  // outside, over the rim and down the inside: a lathe's faces look the way
  // its profile turns, so this way round they face out)
  k.add(lathe([[BASIN + 1.35, -0.3], [BASIN + 1.3, 0.2], [BASIN + 0.55, 0.25], [BASIN + 0.42, 0.62], [BASIN + 0.5, 1.0], [BASIN + 0.35, 1.18], [BASIN - 0.3, 1.18], [BASIN - 0.6, 0.98], [BASIN - 0.6, 0.15]], 48), { color: STONE, outline: 0.05 });
  k.add(cyl(BASIN - 0.55, BASIN - 0.55, 0.2, 48), { at: [0, 0.0, 0], color: '#7fa6b0' });
  // the tower's foot in the basin, and its columns and bowls
  k.add(lathe([[3.4, 0], [3.4, 1.4], [2.8, 2.0], [2.2, 2.4], [2.2, 3.1], [2.6, 3.4], [0.01, 3.5]], 24), { color: STONE2, outline: 0.04 });
  let y = 3.4;
  TIERS.forEach(([top, R], i) => {
    const rc = [1.7, 1.15, 0.72][i];
    k.add(cyl(rc * 0.85, rc, top - y, 16), { at: [0, y, 0], color: STONE, outline: 0.03 });
    for (const yy of [y + 0.25, top - 0.35]) k.add(torus(rc * 0.98, 0.14, 6, 18), { at: [0, yy, 0], rot: [Math.PI / 2, 0, 0], color: TRIM });
    // the bowl: underside swelling out to a thick rim
    k.add(lathe([[0.01, -0.2], [rc * 1.1, -0.2], [R * 0.55, 0.25], [R * 0.9, 0.85], [R, 1.15], [R + 0.18, 1.25], [R + 0.1, 1.38], [R - 0.3, 1.32], [R * 0.6, 0.95], [0.01, 0.8]], 32), { at: [0, top, 0], color: i % 2 ? STONE2 : STONE, outline: 0.04 });
    // (a ring of carved leaves under each bowl)
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2;
      k.add(box(0.5, 0.7, 0.18), { at: [Math.cos(a) * R * 0.72, top + 0.15, Math.sin(a) * R * 0.72], rot: [0.5, -a + Math.PI / 2, 0], color: DARK });
    }
    y = top + 1.0;
  });
  // the finial, the jet's nozzle at its top
  k.add(lathe([[0.55, 0], [0.62, 0.5], [0.34, 1.2], [0.5, 1.9], [0.22, 2.6], [0.3, 3.2], [0.08, 3.6], [0.01, 3.7]], 16), { at: [0, y - 0.1, 0], color: TRIM, outline: 0.03 });
  // four spouts on the basin's rim at its corners, where the gutters begin
  for (let j = 0; j < 4; j++) {
    const a = Math.PI / 4 + (j * Math.PI) / 2;
    k.add(box(1.4, 0.7, 1.2), { at: [Math.cos(a) * (BASIN + 0.1), 0.9, Math.sin(a) * (BASIN + 0.1)], rot: [0, -a + Math.PI / 2, 0], color: TRIM, outline: 0.03 });
    k.add(box(0.5, 0.5, 0.5), { at: [Math.cos(a) * (BASIN + 0.75), 1.25, Math.sin(a) * (BASIN + 0.75)], rot: [0, -a + Math.PI / 4, 0], color: DARK, outline: 0.02 });
  }
});

let fWater = null;
function fountainWater() {
  if (fWater) return fWater;
  const parts = [pool(BASIN - 0.6, 0.86)];
  let below = 0.86;
  const bowls = TIERS.map(([top, R]) => ({ y: top + 1.05, R }));
  // each bowl's own water, and the ring spilling off its rim into the one below (the lowest into the basin)
  bowls.forEach((b, i) => {
    parts.push(pool(b.R - 0.25, b.y, 32));
    const into = i ? bowls[i - 1].y : below;
    parts.push(curtain(b.R + 0.2, b.y + 0.2, b.R + 0.75, into));
  });
  // the four outlets: a short sheet over the rim into each gutter
  const pos = [], uv = [], kind = [], t = [], idx = [];
  for (let j = 0; j < 4; j++) {
    const a = Math.PI / 4 + (j * Math.PI) / 2, cx = Math.cos(a), cz = Math.sin(a), tx = -cz, tz = cx;
    const base = pos.length / 3;
    for (let v = 0; v <= 4; v++) {
      const f = v / 4, r = BASIN + 0.3 + 0.9 * Math.sqrt(f), y = 1.15 - 1.3 * f;
      for (let u = 0; u <= 2; u++) {
        const s = (u - 1) * 0.95;
        pos.push(cx * r + tx * s, y, cz * r + tz * s); uv.push(u / 2, 1.3 * f); kind.push(1); t.push(f);
      }
    }
    for (let v = 0; v < 4; v++) for (let u = 0; u < 2; u++) { const q = base + v * 3 + u; idx.push(q, q + 1, q + 3, q + 1, q + 4, q + 3); }
  }
  parts.push(waterGeo(pos, uv, kind, t, idx));
  fWater = parts;
  return parts;
}

reg('greatfountain', (o, ctx) => {
  const root = new THREE.Group();
  root.name = 'greatfountain';
  root.add(meshOf(fountainGeo()));
  for (const g of fountainWater()) {
    const m = new THREE.Mesh(g, terraceWater());
    m.renderOrder = 3;
    root.add(m);
  }
  // the jet: droplets thrown up off the top and falling back into the top bowl
  const top = TIERS[2][0] + 1.0 + 3.5;
  const N = 64;
  const drop = new THREE.IcosahedronGeometry(0.11, 0);
  const dp = drop.attributes.position.array, per = dp.length;
  const arr = new Float32Array(per * N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const drops = new THREE.Mesh(g, glowMat(0xcfe8f4, { opacity: 0.85 }));
  drops.frustumCulled = false;
  root.add(drops);
  // (and the column of it, a pale shaft going up)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 6.5, 10, 1, true), glowMat(0xcde6f2, { opacity: 0.45 }));
  shaft.position.y = top + 3.25;
  root.add(shaft);
  animate(root, (t) => {
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 * 7.3 + t * 0.3;
      const ph = (t * 0.55 + k / N) % 1;
      const r = 0.2 + ph * 2.1, y = top + 6.2 * Math.sin(ph * Math.PI * 0.62) - ph * ph * 4.5;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      for (let v = 0; v < per; v += 3) { arr[k * per + v] = dp[v] + cx; arr[k * per + v + 1] = dp[v + 1] + y; arr[k * per + v + 2] = dp[v + 2] + cz; }
    }
    g.attributes.position.needsUpdate = true;
    shaft.scale.set(1 + Math.sin(t * 9) * 0.06, 1 + Math.sin(t * 3.1) * 0.04, 1 + Math.cos(t * 8) * 0.06);
  });
  root.userData.founded = true;
  return root;
});

// ------------------------------------------------------------ Galley-La docks
// (a shed YARD.w wide and YARD.d deep — world/islandgen.js — its front, +z, out over the water)
const DW = 20, DD = 22;
const WOOD = '#8a6038', DARKW = '#5e3f22', PLANK = '#b0834f', ROOF = '#a4472c', ROOF2 = '#7f3420', SLIP = '#a59a86';

const shedGeo = () => model('galleydock', (k) => {
  const hx = DW / 2, z0 = -DD / 2, z1 = DD / 2 - 2.5, wallH = 9, ridge = 14.5;
  // posts down both sides and along the back
  for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 6) for (const sx of [-1, 1]) k.add(box(0.7, wallH, 0.7), { at: [sx * hx, -0.4, z], color: DARKW, outline: 0.03 });
  // the side walls: a stone footing, planking above, a band of windows under the eaves
  for (const sx of [-1, 1]) {
    k.add(box(0.5, 1.6, z1 - z0), { at: [sx * hx, -0.6, (z0 + z1) / 2], color: SLIP, outline: 0.03 });
    k.add(box(0.3, 4.8, z1 - z0), { at: [sx * hx, 1.0, (z0 + z1) / 2], color: PLANK, outline: 0.02 });
    for (let z = z0 + 1.8; z < z1 - 1; z += 3.2) k.add(box(0.34, 1.6, 2.0), { at: [sx * hx, 6.2, z], color: '#3b2a1a' });
    k.add(box(0.32, 1.4, z1 - z0), { at: [sx * hx, 7.8, (z0 + z1) / 2], color: PLANK, outline: 0.02 });
  }
  // the back wall, its great doorway onto the street (and the frame round it)
  for (const sx of [-1, 1]) k.add(box(hx - 3.2, wallH, 0.4), { at: [sx * (3.2 + (hx - 3.2) / 2), -0.4, z0], color: PLANK, outline: 0.02 });
  k.add(box(6.4, wallH - 6.2, 0.4), { at: [0, 5.8, z0], color: PLANK, outline: 0.02 });
  for (const sx of [-1, 1]) k.add(box(0.6, 6.6, 0.6), { at: [sx * 3.25, -0.4, z0], color: DARKW, outline: 0.02 });
  k.add(box(7.1, 0.6, 0.6), { at: [0, 6.0, z0], color: DARKW, outline: 0.02 });
  // the gables, front and back, and the roof
  const gable = new THREE.Shape();
  gable.moveTo(-hx, 0); gable.lineTo(hx, 0); gable.lineTo(0, ridge - wallH); gable.closePath();
  for (const z of [z0, z1]) k.add(extrude(gable, 0.3), { at: [0, wallH - 0.4, z], color: PLANK, outline: 0.02 });
  const slope = Math.atan2(ridge - wallH, hx), L = Math.hypot(hx + 0.9, ridge - wallH + 0.6);
  for (const sx of [-1, 1]) {
    k.save(); k.translate(sx * (hx + 0.9) / 2, wallH - 0.4 + (ridge - wallH) / 2 - 0.1, (z0 + z1) / 2); k.rotateZ(-sx * slope);
    k.add(box(L, 0.35, z1 - z0 + 1.6), { at: [0, -0.17, 0], color: ROOF, outline: 0.04 });
    // (ribs of tiles running down it)
    for (let z = z0 - 0.6; z < z1 + 0.8; z += 1.4) k.add(box(L, 0.12, 0.18), { at: [0, 0.18, z - (z0 + z1) / 2], color: ROOF2 });
    k.restore();
  }
  k.add(box(0.6, 0.6, z1 - z0 + 1.8), { at: [0, ridge - 0.65, (z0 + z1) / 2], color: ROOF2, outline: 0.03 });
  // the slipway: stone, running down from inside the shed into the sea, with timber ways along it
  k.save(); k.translate(0, -0.9, (z0 + DD / 2 + 4) / 2 + 1.5); k.rotateX(0.085);
  k.add(box(9.5, 0.6, DD + 3), { at: [0, -0.3, 0], color: SLIP, outline: 0.03 });
  for (const sx of [-1, 1]) k.add(box(0.5, 0.3, DD + 3), { at: [sx * 2.2, 0.15, 0], color: DARKW });
  k.restore();
  // a crane at the front corner
  k.add(box(0.7, 15, 0.7), { at: [hx - 1.2, -0.5, z1 + 1.6], color: DARKW, outline: 0.03 });
  k.save(); k.translate(hx - 1.2, 14.2, z1 + 1.6); k.rotateY(0.6); k.rotateZ(-0.35);
  k.add(box(9, 0.5, 0.5), { at: [-4, 0, 0], color: WOOD, outline: 0.03 });
  k.restore();
});

const plateCache = new Map();
/** The dock's number on a round plate (a canvas texture, white on Galley-La blue, ringed in gold). */
function numberPlate(n) {
  let m = plateCache.get(n);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a54a'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1d4f86'; g.beginPath(); g.arc(128, 128, 106, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f5e6c4'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffffff'; g.font = 'bold 150px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  m = new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
  plateCache.set(n, m);
  return m;
}
let bannerMat = null;
function banner() {
  if (bannerMat) return bannerMat;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#1d4f86'; g.beginPath(); g.roundRect(4, 4, 504, 88, 14); g.fill();
  g.strokeStyle = '#c9a54a'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#f5e6c4'; g.font = 'bold 54px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('GALLEY-LA COMPANY', 256, 52, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  bannerMat = new THREE.MeshToonMaterial({ map: tex });
  return bannerMat;
}

// a ship on the stocks (in a hull's own frame: bow along +x, beam along z):
// the hull, her masts not yet stepped, sloping down the slipway stern first,
// scaffolding along both sides and cradle blocks under her
const hullOnStocks = () => model('galleydock-hull', (k) => {
  const def = SHIPS.brigantine || SHIPS.caravel || Object.values(SHIPS)[1];
  const g = hullGeometry(def).clone();
  const f = 13 / (def.length || 13);
  g.scale(f, f, f);
  k.save(); k.translate(-0.5, 0.6, 0); k.rotateZ(0.085);
  k.add(g, { attrs: true });
  k.restore();
  for (const sz of [-1, 1]) for (let x = -6; x <= 5.5; x += 2.9) {
    k.add(box(0.16, 7.5, 0.16), { at: [x, -0.6, sz * 3.4], color: WOOD });
    k.add(box(2.9, 0.16, 0.16), { at: [x + 1.45, 3.2, sz * 3.4], color: WOOD });
  }
  for (let x = -5; x <= 4; x += 3) k.add(box(0.9, 0.9, 4.2), { at: [x, -0.6, 0], color: DARKW });
});

reg('galleydock', (o, ctx) => {
  const root = new THREE.Group();
  root.name = 'galleydock';
  root.add(meshOf(shedGeo()));
  // (the ship lies along the slipway: the shed's long axis)
  const hull = meshOf(hullOnStocks());
  hull.rotation.y = Math.PI / 2;
  root.add(hull);
  // the number, on the front gable (to the sea) and over the door (to the street); the company's name over the door
  const pl = new THREE.CircleGeometry(1.7, 32);
  const front = new THREE.Mesh(pl, numberPlate(o.n || 1));
  front.position.set(0, 11.2, DD / 2 - 2.5 + 0.25);
  const back = new THREE.Mesh(pl, numberPlate(o.n || 1));
  back.position.set(0, 7.6, -DD / 2 - 0.25); back.rotation.y = Math.PI;
  const name = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.2), banner());
  name.position.set(0, 10.6, -DD / 2 - 0.25); name.rotation.y = Math.PI;
  root.add(front, back, name);
  root.rotation.y = o.yaw || 0;
  root.userData.founded = true;
  return root;
});
