// Mary Geoise's landmark (world/worldgen.js buildMaryGeoise): Pangaea
// Castle as the story draws it — a vast cream palace standing over the Holy
// Land, row on row of tall windows, steep green roofs with dormers, corner
// turrets with green cones, and at its heart a tower climbing in tiers to a
// needle spire high over everything. It faces south (+z) over the town.
import * as THREE from 'three';
import { Mesher } from './kit.js';
import { meshOf, bindCtx } from './mats.js';
import { model } from './street.js';
import { registerPropBuilder } from '../registry.js';
import { PANGAEA } from '../../world/objects.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });

const WALL = new THREE.Color('#efe6cf'), WALL_DK = new THREE.Color('#d6caa9'), STONE = new THREE.Color('#cfc8b8');
const GLASS = new THREE.Color('#7f98b3'), ROOF = new THREE.Color('#3f8f6b'), ROOF_DK = new THREE.Color('#2f6f53');
const GOLD = new THREE.Color('#d8b24a'), GATE = new THREE.Color('#5d5146');

/** A ridge roof: a triangular prism `len` long (along x), `w` wide and `h` high, its eaves at y = 0. */
function prism(len, w, h) {
  const g = new THREE.CylinderGeometry(1, 1, len, 3, 1);
  g.rotateZ(Math.PI / 2);
  // (the triangle's apex turned up, then sized to the roof)
  g.rotateX(-Math.PI / 6);
  g.scale(1, h / 1.5, w / Math.sqrt(3));
  g.translate(0, h / 3, 0);
  return g;
}

/** A row of windows on the face z = zf of a block: `cols` × `rows` between x0..x1, y0..y1. */
function windows(k, x0, x1, y0, y1, zf, cols, rows, dir = 1) {
  const dx = (x1 - x0) / cols, dy = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + dx * (c + 0.5), y = y0 + dy * (r + 0.5);
      k.add(new THREE.BoxGeometry(dx * 0.42, dy * 0.62, 0.3), { at: [x, y, zf + dir * 0.08], color: GLASS, outline: 0 });
    }
  }
}

const castle = () => model('pangaea', (k) => {
  const W = PANGAEA.w, D = PANGAEA.d;
  // the plinth it stands on, and steps down to the town in front
  k.add(new THREE.BoxGeometry(W, 2.2, D), { at: [0, 1.1, 0], color: STONE, flat: true, outline: 0.15 });
  for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(14 - i, 0.55, 1.2), { at: [0, 0.28 + i * 0.55, D / 2 + 3.6 - i * 1.2], color: STONE, flat: true, outline: 0.05 });
  // the main block: five storeys of tall windows
  const mw = W - 10, mh = 22, md = 14, mz = 3;
  k.add(new THREE.BoxGeometry(mw, mh, md), { at: [0, 2.2 + mh / 2, mz], color: WALL, flat: true, outline: 0.25 });
  windows(k, -mw / 2 + 1, mw / 2 - 1, 4, 2.2 + mh - 1.5, mz + md / 2, 15, 5);
  windows(k, -mw / 2 + 1, mw / 2 - 1, 4, 2.2 + mh - 1.5, mz - md / 2, 15, 5, -1);
  // (string courses and a gilt cornice under the roof)
  for (const y of [8.2, 14.2, 2.2 + mh]) k.add(new THREE.BoxGeometry(mw + 0.6, 0.45, md + 0.6), { at: [0, y, mz], color: y > 20 ? GOLD : WALL_DK, flat: true, outline: 0.05 });
  // its steep green roof, a row of dormers in it
  k.add(prism(mw, md + 1, 11), { at: [0, 2.2 + mh, mz], color: ROOF, flat: true, outline: 0.2 });
  for (let i = 0; i < 7; i++) {
    const x = -mw / 2 + mw * (i + 0.5) / 7;
    k.add(new THREE.BoxGeometry(2.2, 3, 2), { at: [x, 2.2 + mh + 2.2, mz + md / 2 - 2.2], color: WALL, flat: true, outline: 0.08 });
    k.add(new THREE.BoxGeometry(1, 1.6, 0.3), { at: [x, 2.2 + mh + 2.2, mz + md / 2 - 1.15], color: GLASS, outline: 0 });
    k.add(prism(2.6, 2.6, 2), { at: [x, 2.2 + mh + 3.7, mz + md / 2 - 2.2], rot: [0, Math.PI / 2, 0], color: ROOF_DK, flat: true, outline: 0.06 });
  }
  // the wings at either end: taller, each under a great green pyramid
  for (const sx of [-1, 1]) {
    const wx = sx * (W / 2 - 5), wh = 27, wd = D - 8;
    k.add(new THREE.BoxGeometry(10, wh, wd), { at: [wx, 2.2 + wh / 2, 1], color: WALL, flat: true, outline: 0.25 });
    windows(k, wx - 4, wx + 4, 4, 2.2 + wh - 2, 1 + wd / 2, 3, 6);
    k.add(new THREE.BoxGeometry(10.6, 0.5, wd + 0.6), { at: [wx, 2.2 + wh, 1], color: GOLD, flat: true, outline: 0.05 });
    k.add(new THREE.ConeGeometry(1, 1, 4), { at: [wx, 2.2 + wh + 8, 1], rot: [0, Math.PI / 4, 0], scale: [7.6, 16, (wd + 1) * 0.72], color: ROOF, flat: true, outline: 0.2 });
    // turrets at their outer corners, green cones on top
    for (const sz of [-1, 1]) {
      const tx = wx + sx * 5, tz = 1 + sz * wd / 2, th = 31;
      k.add(new THREE.CylinderGeometry(2.1, 2.3, th, 10), { at: [tx, 2.2 + th / 2, tz], color: WALL, outline: 0.15 });
      k.add(new THREE.CylinderGeometry(2.5, 2.5, 0.5, 10), { at: [tx, 2.2 + th, tz], color: GOLD, outline: 0.04 });
      k.add(new THREE.ConeGeometry(2.6, 10, 10), { at: [tx, 2.2 + th + 5, tz], color: ROOF, outline: 0.12 });
      k.add(new THREE.ConeGeometry(0.18, 2.5, 6), { at: [tx, 2.2 + th + 11.2, tz], color: GOLD, outline: 0 });
    }
  }
  // the gate: a great arch in the middle of the front, a gilt sun over it
  k.add(new THREE.BoxGeometry(8, 11, 1.2), { at: [0, 2.2 + 5.5, mz + md / 2 + 0.4], color: WALL_DK, flat: true, outline: 0.1 });
  k.add(new THREE.BoxGeometry(5, 8, 0.6), { at: [0, 2.2 + 4, mz + md / 2 + 0.9], color: GATE, outline: 0.05 });
  k.add(new THREE.CylinderGeometry(2.5, 2.5, 0.6, 16, 1, false, 0, Math.PI), { at: [0, 2.2 + 8, mz + md / 2 + 0.9], rot: [Math.PI / 2, 0, Math.PI / 2], color: GATE, outline: 0.04 });
  k.add(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 16), { at: [0, 2.2 + 12.2, mz + md / 2 + 1.05], rot: [Math.PI / 2, 0, 0], color: GOLD, outline: 0.04 });
  // the great tower behind, climbing in tiers to the needle spire
  const tz = -D / 2 + 7;
  k.add(new THREE.BoxGeometry(16, 40, 12), { at: [0, 2.2 + 20, tz], color: WALL, flat: true, outline: 0.25 });
  windows(k, -7, 7, 26, 40, tz + 6, 4, 4);
  let y = 2.2 + 40;
  for (const [r, h] of [[7, 9], [5.2, 8], [3.6, 7]]) {
    k.add(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.6, 8), { at: [0, y, tz], color: GOLD, outline: 0.04 });
    k.add(new THREE.CylinderGeometry(r, r, h, 8), { at: [0, y + h / 2, tz], color: WALL, flat: true, outline: 0.15 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      k.add(new THREE.BoxGeometry(0.9, h * 0.55, 0.3), { at: [Math.cos(a) * r * 0.93, y + h / 2, tz + Math.sin(a) * r * 0.93], rot: [0, -a + Math.PI / 2, 0], color: GLASS, outline: 0 });
    }
    y += h;
    k.add(new THREE.ConeGeometry(r * 1.1, h * 0.55, 8), { at: [0, y + h * 0.27, tz], color: ROOF, flat: true, outline: 0.1 });
    y += h * 0.15;
  }
  k.add(new THREE.ConeGeometry(1.6, 30, 8), { at: [0, y + 15, tz], color: ROOF_DK, flat: true, outline: 0.1 });
  k.add(new THREE.SphereGeometry(0.8, 8, 6), { at: [0, y + 30.4, tz], color: GOLD, outline: 0 });
  k.add(new THREE.ConeGeometry(0.25, 5, 6), { at: [0, y + 33.2, tz], color: GOLD, outline: 0 });
});

reg('pangaea', () => {
  const m = meshOf(castle());
  m.userData.founded = true;
  return m;
});
