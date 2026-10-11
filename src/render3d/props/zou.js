// Zou's set piece (data/islands/newWorld.js): Zunesha, the elephant that has
// walked the sea for a thousand years with the Mokomo Dukedom on its back.
// The island is its back; at its east end the great head rises out of the
// sea — the domed brow, the small sad eyes, the ears spread like sails, the
// tusks curving up, the trunk hanging down into the water — the forelegs
// standing in the sea under it, wading. (`zunesha`: the head stands where
// the object is, the island behind it to the west; its footprint
// world/objects.js.)
import * as THREE from 'three';
import { meshOf, animate, bindCtx } from './mats.js';
import { model } from './street.js';
import { registerPropBuilder } from '../registry.js';
import { tubeGeo } from './wano.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });
const col = (c) => new THREE.Color(c);
const HIDE = col('#a49d90'), HIDE_DK = col('#7a7368'), HIDE_LT = col('#bdb6a8'), EAR_IN = col('#b58e86'), TUSK = col('#f1ead9'), TUSK_DK = col('#cfc5ad'), EYE = col('#1d1712');

/** Hide, wrinkled: darker in the folds (bands across `axis` every `step` metres), lighter on top. */
function hide(step, axis = 'y', base = HIDE) {
  const tmp = new THREE.Color();
  return (p, n) => {
    const v = axis === 'x' ? p.x : axis === 'z' ? p.z : p.y;
    const fold = Math.sin(v * (Math.PI * 2) / step + Math.sin(p.x * 0.07 + p.z * 0.05) * 1.4);
    tmp.copy(base).lerp(HIDE_DK, fold > 0.7 ? 0.55 : 0.12).lerp(HIDE_LT, Math.max(0, n.y) * 0.3);
    return tmp;
  };
}

reg('zunesha', (o) => {
  const S = o.s || 1;
  const geo = model(`zunesha:${S}`, (k) => {
    const R = 18 * S;
    // the forelegs, wading: columns down into the sea, wrinkled at the knee
    for (const sz of [-1, 1]) {
      k.add(new THREE.CylinderGeometry(8 * S, 9.5 * S, 34 * S, 20), { at: [-8 * S, -12 * S, sz * 14 * S], color: hide(3.2 * S), outline: 0.4 });
    }
    // the shoulders and the neck, rising out of the island's east end
    k.add(new THREE.SphereGeometry(24 * S, 32, 20), { at: [-18 * S, 6 * S, 0], scale: [1, 0.78, 1.12], color: hide(4.5 * S, 'x'), outline: 0.6 });
    // the head, and the great domed brow over it — two lobes, as an Asian elephant has
    k.add(new THREE.SphereGeometry(R, 36, 24), { at: [0, 26 * S, 0], scale: [0.95, 1.08, 1.0], color: hide(3.6 * S), outline: 0.6 });
    for (const sz of [-1, 1]) k.add(new THREE.SphereGeometry(11 * S, 24, 16), { at: [-3 * S, 39 * S, sz * 6.5 * S], scale: [1.05, 0.8, 1], color: hide(3.6 * S), outline: 0.4 });
    // the ears, spread wide like sails, pink inside where the light comes through
    for (const sz of [-1, 1]) {
      k.add(new THREE.SphereGeometry(21 * S, 28, 18), {
        at: [-9 * S, 25 * S, sz * 20 * S], scale: [0.12, 1.12, 1], rot: [sz * 0.12, sz * 0.42, 0],
        color: (p, n) => (n.x > 0.35 ? EAR_IN : hide(2.8 * S, 'z')(p, n)), outline: 0.4,
      });
    }
    // the eyes: small, heavy-lidded, under the brow
    for (const sz of [-1, 1]) {
      k.add(new THREE.SphereGeometry(1.8 * S, 12, 8), { at: [13.2 * S, 30 * S, sz * 9.2 * S], scale: [0.6, 1, 1.25], color: EYE });
      k.add(new THREE.SphereGeometry(3.1 * S, 14, 8), { at: [12.4 * S, 32 * S, sz * 9.4 * S], scale: [0.7, 0.55, 1.3], color: HIDE_DK, outline: 0.15 });
    }
    // the trunk: down from between the eyes, curling at the end into the sea
    const trunk = [[14, 22, 0], [19, 12, 0], [22, 2, 1], [23, -6, 3], [21, -14, 5]].map(([x, y, z]) => [x * S, y * S, z * S]);
    k.add(tubeGeo(trunk, [7 * S, 3.6 * S], 18), { color: hide(1.6 * S), outline: 0.4 });
    // the tusks: out of the jaw either side of the trunk, sweeping forward and up
    for (const sz of [-1, 1]) {
      const pts = [[9, 15, sz * 8.5], [17, 10, sz * 13], [27, 11, sz * 16], [35, 18, sz * 15], [38, 27, sz * 11]].map(([x, y, z]) => [x * S, y * S, z * S]);
      k.add(tubeGeo(pts, [2.8 * S, 0.5 * S], 12), { color: (p) => (p.x > 30 * S ? TUSK : TUSK_DK).clone().lerp(TUSK, 0.6), outline: 0.25 });
    }
    // the lower lip under the trunk's root
    k.add(new THREE.SphereGeometry(6 * S, 18, 10), { at: [10 * S, 12 * S, 0], scale: [1.1, 0.55, 1.2], color: hide(2 * S), outline: 0.2 });
  });
  const root = new THREE.Group();
  root.name = 'zunesha';
  const body = meshOf(geo);
  root.add(body);
  root.userData.noGround = true;
  // (breathing: the head rising and settling, very slowly)
  animate(root, (t) => { body.position.y = Math.sin(t * 0.35) * 0.6 * S; body.rotation.z = Math.sin(t * 0.35 + 0.8) * 0.006; });
  return root;
});
