// Food, medicine and Devil Fruits held in the hand: a small model for each
// item (made once and shared), sized in metres to sit in a fist. Used by the
// first-person arms and by your own body in third person (see heldItemMesh).
//
// Item space: the item's middle at the origin, its long axis along X, the
// top (a stem, the bottle's neck) toward +Y.
import * as THREE from 'three';
import { Mesher } from '../props/kit.js';
import { vcMat } from '../props/mats.js';
import { sunSelf } from '../sunshadow.js';
import { SELF_SHADE, SELF_SHADE_VM } from './mats.js';
import { ITEMS } from '../../data/items.js';
import { FRUITS } from '../../data/fruits.js';
import { B } from './bones.js';

const cache = new Map();
const sph = (w = 10, h = 7) => new THREE.SphereGeometry(1, w, h);
const cyl = (r0, r1, h, n = 8) => new THREE.CylinderGeometry(r1, r0, h, n);
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };

/** What an item looks like in the hand (by id, then by type). */
function kindOf(id, d) {
  if (d.type === 'fruit') return 'devil';
  if (/meat/.test(id)) return 'meat';
  if (/steak/.test(id)) return 'steak';
  if (/rice_ball/.test(id)) return 'onigiri';
  if (/fish|tuna/.test(id)) return 'fish';
  if (/stew|course/.test(id)) return 'bowl';
  if (/sake/.test(id)) return 'bottle';
  if (/antidote/.test(id)) return 'vial';
  if (/bandage/.test(id)) return 'bandage';
  if (/rumble/.test(id)) return 'pill';
  if (/hormone/.test(id)) return 'syringe';
  if (/banana/.test(id)) return 'banana';
  if (/coconut/.test(id)) return 'coconut';
  if (/cherr/.test(id)) return 'cherry';
  if (/tangerine|orange/.test(id)) return 'citrus';
  if (/mango/.test(id)) return 'mango';
  if (/apple/.test(id)) return 'apple';
  return d.type === 'medicine' ? 'vial' : 'apple';
}

function leaf(k, at, rot, col = '#43a047') {
  k.add(sph(6, 4), { at, rot, scale: [0.022, 0.004, 0.011], color: col });
}

const BUILD = {
  apple(k) {
    k.add(sph(), { scale: 0.034, color: '#d32f2f' });
    k.add(cyl(0.0025, 0.002, 0.02, 5), { at: [0, 0.036, 0], rot: [0, 0, 0.2], color: '#5d4037' });
    leaf(k, [0.012, 0.04, 0], [0, 0, -0.5]);
  },
  citrus(k) {
    k.add(sph(), { scale: [0.035, 0.031, 0.035], color: '#fb8c00' });
    leaf(k, [0.01, 0.034, 0], [0.2, 0, -0.35], '#2e7d32');
  },
  mango(k) {
    k.add(sph(), { scale: [0.042, 0.032, 0.03], color: (v) => (v.x > 0 ? '#f9a825' : '#ef6c00') });
    k.add(cyl(0.002, 0.002, 0.012, 4), { at: [0.04, 0.012, 0], rot: [0, 0, -1], color: '#5d4037' });
  },
  coconut(k) {
    k.add(sph(9, 6), { scale: [0.048, 0.044, 0.046], color: '#6d4c41', flat: true });
    for (const [a, b] of [[0.4, 0.2], [0.9, -0.1], [0.65, 0.5]]) k.add(sph(5, 4), { at: [Math.cos(a) * 0.012, 0.043, Math.sin(b) * 0.012], scale: 0.005, color: '#3e2723' });
  },
  banana(k) {
    k.add(new THREE.TorusGeometry(0.07, 0.013, 6, 10, 1.7), { rot: [0, 0, 2.3], at: [0.02, -0.05, 0], color: '#fdd835' });
    k.add(cyl(0.005, 0.004, 0.018, 5), { at: [0.066, 0.02, 0], rot: [0, 0, -0.5], color: '#6d4c41' });
  },
  cherry(k) {
    for (const s of [-1, 1]) {
      k.add(sph(), { at: [s * 0.014, -0.008, 0], scale: 0.013, color: '#b71c1c' });
      k.add(cyl(0.0015, 0.0015, 0.04, 4), { at: [s * 0.007, 0.012, 0], rot: [0, 0, s * 0.35], color: '#558b2f' });
    }
  },
  meat(k) {
    // the meat on the bone every rubber-brained captain dreams of
    k.add(sph(12, 8), { scale: [0.055, 0.046, 0.044], color: (v) => (v.y > 0.03 ? '#8d4a24' : '#a0522d') });
    k.add(cyl(0.011, 0.011, 0.16, 7), { rot: [0, 0, Math.PI / 2], color: '#f5f0e1' });
    for (const s of [-1, 1]) for (const dz of [-0.009, 0.009]) k.add(sph(6, 5), { at: [s * 0.08, 0.004, dz], scale: 0.013, color: '#fffaf0' });
  },
  steak(k) {
    k.add(sph(12, 8), { scale: [0.075, 0.018, 0.055], color: (v) => (Math.hypot(v.x / 0.075, v.z / 0.055) > 0.86 ? '#f3e5d8' : '#9b2f2f') });
  },
  fish(k) {
    k.add(sph(10, 6), { scale: [0.07, 0.025, 0.017], color: (v) => (v.y > 0 ? '#3f6f98' : '#cfd8dc') });
    k.add(new THREE.ConeGeometry(0.022, 0.04, 4), { at: [-0.085, 0, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.3], color: '#3f6f98' });
    k.add(sph(5, 4), { at: [0.052, 0.008, 0.012], scale: 0.004, color: '#111111' });
  },
  onigiri(k) {
    // a rice ball: a rounded triangle with its band of nori
    k.add(new THREE.CylinderGeometry(0.018, 0.05, 0.06, 3, 1), { rot: [Math.PI / 2, 0, 0], scale: [1, 0.55, 1], color: '#fafafa' });
    k.add(new THREE.BoxGeometry(0.05, 0.028, 0.034), { at: [0, -0.02, 0], color: '#1b2a1b' });
  },
  bowl(k) {
    k.add(new THREE.CylinderGeometry(0.055, 0.035, 0.04, 12, 1, true), { color: '#6d4c41', double: true });
    k.add(new THREE.CircleGeometry(0.052, 12), { at: [0, 0.014, 0], rot: [-Math.PI / 2, 0, 0], color: '#e07b39' });
    k.add(sph(6, 4), { at: [0.015, 0.02, 0.01], scale: [0.016, 0.007, 0.012], color: '#fff3e0' });
  },
  bottle(k) {
    k.add(new THREE.LatheGeometry([[0, -0.07], [0.034, -0.07], [0.04, -0.03], [0.034, 0.01], [0.013, 0.04], [0.012, 0.065], [0.016, 0.07], [0, 0.07]].map(([r, y]) => new THREE.Vector2(r, y)), 10), { color: (v) => (v.y > -0.02 && v.y < -0.005 ? '#1565c0' : '#f5f0e1') });
  },
  vial(k) {
    k.add(cyl(0.017, 0.017, 0.06, 8), { at: [0, -0.01, 0], color: '#66bb6a' });
    k.add(cyl(0.008, 0.008, 0.02, 6), { at: [0, 0.03, 0], color: '#e0f2f1' });
    k.add(cyl(0.01, 0.01, 0.01, 6), { at: [0, 0.045, 0], color: '#8d6e63' });
  },
  bandage(k) {
    k.add(cyl(0.024, 0.024, 0.05, 10), { rot: [Math.PI / 2, 0, 0], color: '#fafafa' });
    k.add(new THREE.BoxGeometry(0.004, 0.05, 0.045), { at: [0.026, -0.02, 0], rot: [0, 0, 0.2], color: '#f5f5f5' });
  },
  pill(k) {
    k.add(sph(), { scale: 0.016, color: (v) => (Math.abs(v.y) < 0.004 ? '#8d6e00' : '#fdd835') });
  },
  syringe(k) {
    k.add(cyl(0.012, 0.012, 0.08, 8), { rot: [0, 0, Math.PI / 2], color: '#e1f5fe' });
    k.add(cyl(0.009, 0.009, 0.06, 6), { at: [-0.01, 0, 0], rot: [0, 0, Math.PI / 2], color: '#f06292' });
    k.add(cyl(0.0015, 0.0015, 0.04, 4), { at: [0.06, 0, 0], rot: [0, 0, Math.PI / 2], color: '#b0bec5' });
    k.add(cyl(0.004, 0.004, 0.02, 6), { at: [-0.05, 0, 0], rot: [0, 0, Math.PI / 2], color: '#90a4ae' });
  },
  devil(k, d) {
    // a Devil Fruit: swirls all over it, and a curled stem
    const f = FRUITS[d.fruit] || {};
    const base = new THREE.Color(f.color || '#8e44ad'), dark = shade(base, 0.62);
    const swirl = (v) => {
      const r = Math.hypot(v.x, v.y, v.z) || 1;
      const th = Math.atan2(v.z, v.x), ph = Math.acos(v.y / r);
      return Math.sin(th * 3 + ph * 7) > 0.35 ? dark : base;
    };
    k.add(sph(14, 10), { scale: [0.045, 0.043, 0.045], color: swirl });
    let p = new THREE.Vector3(0, 0.042, 0), a = 0.4;
    for (let i = 0; i < 5; i++) {
      const q = p.clone().add(new THREE.Vector3(Math.sin(a) * 0.009, 0.008 - i * 0.002, Math.cos(a) * 0.004));
      const mid = p.clone().add(q).multiplyScalar(0.5), dir = q.clone().sub(p);
      const g = cyl(0.003, 0.003, dir.length(), 4);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      k.add(g, { at: [mid.x, mid.y, mid.z], color: '#33691e' });
      p = q; a += 1.1;
    }
    leaf(k, [-0.012, 0.046, 0.004], [0.3, 0.4, 0.5], '#558b2f');
  },
};

/**
 * A new mesh (sharing its geometry) of the item in the hand, or null.
 * `opts.viewmodel`: drawn in the first-person pass (no fog).
 */
export function heldItemMesh(id, opts = {}) {
  const d = ITEMS[id];
  if (!d) return null;
  let geo = cache.get(id);
  if (!geo) {
    const k = new Mesher();
    (BUILD[kindOf(id, d)] || BUILD.apple)(k, d);
    geo = k.build(false);
    cache.set(id, geo);
  }
  const mat = opts.viewmodel ? vmMat() : heldMat();
  const m = new THREE.Mesh(geo, mat);
  m.name = 'held-' + id;
  m.castShadow = !opts.viewmodel;
  m.receiveShadow = true;
  m.frustumCulled = false;
  m.userData.shared = true; // (the geometry is cached: never dispose it with the model)
  return m;
}

let _vm = null, _held = null;
function vmMat() {
  if (_vm) return _vm;
  const base = vcMat();
  _vm = base.clone();
  _vm.onBeforeCompile = base.onBeforeCompile; // (the tint and glow attributes: see props/mats)
  _vm.customProgramCacheKey = () => 'opvc-vm';
  _vm.defines = { ...base.defines, SUN_SELF: sunSelf(SELF_SHADE_VM) };
  _vm.fog = false;
  _vm.transparent = true;
  return _vm;
}
/** What a character holds takes the sun's shadow, though not its own hand's (see SELF_SHADE). */
function heldMat() {
  if (_held) return _held;
  const base = vcMat();
  _held = base.clone();
  _held.onBeforeCompile = base.onBeforeCompile;
  _held.customProgramCacheKey = () => 'opvc-held';
  _held.defines = { ...base.defines, SUN_SELF: sunSelf(SELF_SHADE) };
  return _held;
}

// item → hand: the item's top (+Y) away from the palm (hand -X), its long axis across the hand (Z)
const HOLD_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)));

/**
 * Put item `id` (or nothing) in a character model's right hand, keeping the
 * one already there if it's the same. The hand's -Y runs to the knuckles and
 * +X is the back of the hand (see rig.js aimNegY): the item rests on the
 * palm, in the middle of it, the fingers curled up round it (the 'hold' hand).
 */
export function holdItem(model, id, opts = {}) {
  if ((model._heldId || null) === (id || null)) return model._held || null;
  if (model._held) model._held.removeFromParent();
  model._held = null;
  model._heldId = id || null;
  if (!id) return null;
  const m = heldItemMesh(id, opts);
  if (!m) return null;
  const g = m.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const k = model.body?.fingers?.R?.k || 1.06; // (the hand's size)
  m.userData.palm = 0.021 * k;
  m.userData.under = -g.boundingBox.min.y;
  m.quaternion.copy(HOLD_Q);
  m.position.set(0, -0.05 * k, 0);
  model.bones[B.handR].add(m);
  model._held = m;
  heldSize(model, 1);
  return m;
}

/** Shrink the item in the hand (as it's eaten), still resting on the palm. */
export function heldSize(model, s) {
  const m = model._held;
  if (!m) return;
  m.scale.setScalar(s);
  m.position.x = -(m.userData.palm + m.userData.under * s);
}
