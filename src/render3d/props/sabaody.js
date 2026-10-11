// Sabaody's set pieces (data/islands/paradise2.js): the Yarukiman Mangroves,
// as the anime draws them — trunks broad as towers rising out of the shallows,
// their roots arching down into the water all round, a vast canopy far
// overhead, and the grove's number painted big and white on the bark facing
// the grove it stands for. (`yarukiman`: the trunk at the object, `face` the
// way to its grove, `num` the number; its footprint world/objects.js.)
import * as THREE from 'three';
import { meshOf, animate, bindCtx } from './mats.js';
import { model } from './street.js';
import { registerPropBuilder } from '../registry.js';
import { tubeGeo } from './wano.js';
import { hashN } from './punkhazard.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });
const col = (c) => new THREE.Color(c);
const BARK = col('#8a6a52'), BARK_DK = col('#5e4535'), BARK_LT = col('#a88a6e'), LEAF = col('#3f8f3a'), LEAF_DK = col('#2a6a2c'), LEAF_LT = col('#7cc06a');

export const YARUKIMAN = { trunk: 6.2, H: 64, roots: 7, reach: 15 };

/** Bark: vertical grain, darker in the furrows. */
function bark() {
  const tmp = new THREE.Color();
  return (p, n) => {
    const a = Math.atan2(p.z, p.x);
    const grain = Math.sin(a * 22 + Math.sin(p.y * 0.15) * 2);
    return tmp.copy(BARK).lerp(BARK_DK, grain > 0.55 ? 0.6 : 0.1).lerp(BARK_LT, Math.max(0, n.y) * 0.25);
  };
}

const numTex = new Map();
/** The grove's number, white paint on a transparent ground (one texture per number). */
function numberTexture(num) {
  if (numTex.has(num)) return numTex.get(num);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f8f4ea';
  g.font = 'bold 190px "Bangers", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  numTex.set(num, t);
  return t;
}

reg('yarukiman', (o) => {
  const { trunk: R, H, roots: NR, reach } = YARUKIMAN;
  const seed = o.num || 1;
  const geo = model(`yarukiman:${seed}`, (k) => {
    const brk = bark();
    // the trunk: wide at the foot, flaring where the roots leave it, tapering a little to the crown
    k.add(new THREE.CylinderGeometry(R * 0.82, R, H, 28, 8), { at: [0, H / 2 - 4, 0], color: brk, outline: 0.5 });
    k.add(new THREE.CylinderGeometry(R, R * 1.45, 9, 28), { at: [0, 0.5, 0], color: brk, outline: 0.3 });
    // the roots: out of the trunk's foot, arching up and over and down into the sea
    for (let i = 0; i < NR; i++) {
      const a = (i / NR) * Math.PI * 2 + hashN(i, seed) * 0.5, c = Math.cos(a), s = Math.sin(a);
      const d = reach * (0.8 + hashN(i, seed + 3) * 0.4), up = 6 + hashN(i, seed + 5) * 4;
      const pts = [[c * R * 0.8, 5, s * R * 0.8], [c * (R + d * 0.3), up, s * (R + d * 0.3)], [c * (R + d * 0.7), up * 0.7, s * (R + d * 0.7)], [c * (R + d), -3, s * (R + d)]];
      k.add(tubeGeo(pts, [2.4, 1.1], 10), { color: brk, outline: 0.25 });
    }
    // great boughs out of the crown, and the canopy over them: broad, flat-bottomed clouds of leaves
    const tmp = new THREE.Color();
    const leaf = (p, n) => tmp.copy(LEAF).lerp(LEAF_DK, n.y < -0.2 ? 0.6 : 0).lerp(LEAF_LT, Math.max(0, n.y - 0.4) * 0.8);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + hashN(i, seed + 7), c = Math.cos(a), s = Math.sin(a), d = 14 + hashN(i, seed + 9) * 6;
      k.add(tubeGeo([[0, H - 10, 0], [c * d * 0.5, H - 2, s * d * 0.5], [c * d, H + 2, s * d]], [2.6, 1.2], 8), { color: brk, outline: 0.2 });
      k.add(new THREE.SphereGeometry(11 + hashN(i, seed + 11) * 4, 18, 12), { at: [c * d, H + 6, s * d], scale: [1, 0.55, 1], color: leaf, outline: 0.5 });
    }
    k.add(new THREE.SphereGeometry(19, 22, 14), { at: [0, H + 10, 0], scale: [1, 0.55, 1], color: leaf, outline: 0.6 });
  });
  const root = new THREE.Group();
  root.name = 'yarukiman';
  const body = meshOf(geo);
  body.position.y = -1;
  root.add(body);
  // the grove's number, painted on the side of the trunk that faces its grove
  if (o.num) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: numberTexture(o.num), transparent: true, depthWrite: false, fog: true }));
    const f = o.face || 0;
    m.position.set(Math.cos(f) * (R * 0.92 + 0.15), 15, Math.sin(f) * (R * 0.92 + 0.15));
    m.rotation.y = Math.PI / 2 - f;
    root.add(m);
  }
  root.userData.noGround = true;
  // (the canopy stirring in the wind)
  animate(root, (t) => { body.rotation.z = Math.sin(t * 0.4 + seed) * 0.003; body.rotation.x = Math.sin(t * 0.33 + seed * 2) * 0.003; });
  return root;
});
