// Held weapons for the 3D characters and the first-person viewmodel. Each is
// one small vertex-coloured mesh (shared geometry and material) placed at the
// hand every frame: +X along the blade/barrel from the grip, +Y the cutting
// edge, the flat of the blade facing ±Z.
import { Builder, Prim, M, between, lin, THREE } from './geom.js';
import { weaponMaterial, sharedOutline, glowMaterial } from './mats.js';

/** A katana blade along +X: diamond cross-section, slight curve toward +Y (the edge). */
function blade(b, x0, L, w, t, cols) {
  const N = 6;
  const P = [], C = [], I = [];
  const sec = (u) => {
    const x = x0 + u * L, curve = 0.035 * u * u;
    const ww = w * (1 - 0.3 * u);
    return [[x, curve + ww * 0.5, 0], [x, curve, t * 0.5], [x, curve - ww * 0.5, 0], [x, curve, -t * 0.5]];
  };
  for (let i = 0; i <= N; i++) {
    const s = sec(i / N);
    for (let k = 0; k < 4; k++) { P.push(...s[k]); C.push(cols[k]); }
  }
  // tip
  P.push(x0 + L + 0.06, 0.035 + w * 0.12, 0); C.push(cols[0]);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b2 = i * 4 + ((k + 1) % 4), c = a + 4, d = b2 + 4;
      I.push(a, b2, c, b2, d, c);
    }
  }
  const tip = (N + 1) * 4, last = N * 4;
  for (let k = 0; k < 4; k++) I.push(last + k, last + ((k + 1) % 4), tip);
  // root cap
  I.push(0, 2, 1, 0, 3, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  // per-vertex colour through the builder: colour by cross-section slot
  const colOf = (i) => C[i];
  const slot = [];
  for (let i = 0; i < P.length / 3; i++) slot.push(colOf(i));
  let n = 0;
  b.add(g, M(), () => lin(slot[n++]));
}

const GEOS = new Map();
function geo(key, make) {
  let g = GEOS.get(key);
  if (!g) { const b = new Builder(); make(b); g = b.buildStatic(); g.userData.shared = true; GEOS.set(key, g); }
  return g;
}

/** Katana geometry. variant: 'main' | 'second' | 'mouth'; haki: black blade. */
export function swordGeo(variant = 'main', haki = false) {
  return geo(`sword:${variant}:${haki}`, (b) => {
    const hilt = variant === 'second' ? '#1b2631' : variant === 'mouth' ? '#fafafa' : '#2d2a32';
    const guard = variant === 'mouth' ? '#b71c1c' : '#d4ac0d';
    b.add(Prim.cyl(7), between([-0.13, 0, 0], [0.1, 0, 0], 0.017), hilt);
    for (let i = 0; i < 3; i++) b.add(Prim.torus(0.3, 3, 7), M(-0.08 + i * 0.06, 0, 0, 0, Math.PI / 2, 0, 0.019), '#b8a07a');
    b.add(Prim.cyl(10), between([0.1, 0, 0], [0.114, 0, 0], 0.045), guard);
    b.add(Prim.cyl(6), between([0.114, 0, 0], [0.135, 0, 0], 0.02), guard);
    const cols = haki ? ['#b388ff', '#1a1622', '#0d0b12', '#1a1622'] : ['#ffffff', '#d5dee6', '#8d9aa7', '#c3ced8'];
    blade(b, 0.13, 0.84, 0.034, 0.009, cols);
  });
}
export function axeGeo() {
  return geo('axe', (b) => {
    b.add(Prim.cyl(7), between([-0.3, 0, 0], [0.92, 0, 0], 0.022), '#6d4c41');
    b.add(Prim.rbox(0.4), M(0.78, 0, 0, 0, 0, 0, [0.12, 0.05, 0.03]), '#90a4ae');
    for (const s of [-1, 1]) {
      b.add(Prim.rbox(0.45), M(0.78, s * 0.16, 0, 0, 0, s * 0.12, [0.09, 0.14, 0.012]), '#cfd8dc');
      b.add(Prim.rbox(0.45), M(0.8, s * 0.27, 0, 0, 0, 0, [0.14, 0.04, 0.01]), '#eceff1');
    }
  });
}
export function staffGeo() {
  return geo('staff', (b) => {
    b.add(Prim.cyl(7), between([-0.34, 0, 0], [0.74, 0, 0], 0.016), '#4fc3f7');
    for (const x of [-0.34, 0.2, 0.76]) b.add(Prim.sphere(7, 5), M(x, 0, 0, 0, 0, 0, x === 0.2 ? 0.028 : 0.04), '#0288d1');
  });
}
export function gunGeo(kind) {
  return geo('gun:' + (kind || ''), (b) => {
    if (kind === 'sling') {
      b.add(Prim.cyl(6), between([-0.04, 0, 0], [0.12, 0, 0], 0.016), '#6d4c41');
      for (const s of [-1, 1]) b.add(Prim.cyl(6), between([0.12, 0, 0], [0.24, s * 0.08, 0], 0.013), '#6d4c41');
      for (const s of [-1, 1]) b.add(Prim.cyl(4), between([0.24, s * 0.08, 0], [0.14, 0, 0], 0.005), '#ffcc80');
    } else {
      b.add(Prim.cyl(8), between([0.02, 0.03, 0], [0.4, 0.03, 0], 0.018), '#2d3436');
      b.add(Prim.rbox(0.4), M(0.13, 0.03, 0, 0, 0, 0, [0.1, 0.025, 0.022]), '#636e72');
      b.add(Prim.rbox(0.45), M(-0.01, -0.04, 0, 0, 0, 0.55, [0.035, 0.07, 0.02]), '#8d5b33');
      b.add(Prim.torus(0.25, 3, 7), M(0.06, -0.01, 0, 0, 0, 0, 0.02), '#b0bec5');
    }
  });
}
let EBLADE = null;
export function energyBladeGeo() {
  if (!EBLADE) {
    EBLADE = new THREE.SphereGeometry(1, 10, 6);
    EBLADE.translate(1, 0, 0);
    EBLADE.scale(0.52, 0.05, 0.02);
    EBLADE.userData.shared = true;
  }
  return EBLADE;
}

/** A held weapon: a mesh plus its ink outline. */
export class HeldWeapon {
  constructor(kind, opts = {}) {
    this.kind = kind;
    this.group = new THREE.Group();
    this.opts = opts;
    this.set(kind, opts);
  }
  set(kind, opts) {
    this.group.clear();
    this.kind = kind;
    let g;
    if (kind === 'sword') g = swordGeo(opts.variant, opts.haki);
    else if (kind === 'axe') g = axeGeo();
    else if (kind === 'staff') g = staffGeo();
    else if (kind === 'gun') g = gunGeo(opts.gun);
    else if (kind === 'energy') {
      this.mesh = new THREE.Mesh(energyBladeGeo(), glowMaterial(opts.color || '#b3e5fc', 0.8));
      this.core = new THREE.Mesh(energyBladeGeo(), glowMaterial('#ffffff', 0.9));
      this.core.scale.set(0.95, 0.4, 0.6);
      this.mesh.add(this.core);
      this.group.add(this.mesh);
      return;
    }
    this.mesh = new THREE.Mesh(g, opts.material || weaponMaterial());
    this.mesh.castShadow = !opts.noShadow;
    this.group.add(this.mesh);
    if (!opts.noOutline) {
      this.outline = new THREE.Mesh(g, opts.outline || sharedOutline());
      this.group.add(this.outline);
    }
  }
  /** Place at a grip point with the blade along `dir` and the flat facing `plane`. */
  place(grip, dir, plane) {
    const x = _x.copy(dir).normalize();
    const z = _z.copy(plane).addScaledVector(x, -plane.dot(x));
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(x, -x.z);
    z.normalize();
    const y = _y.crossVectors(z, x);
    _mm.makeBasis(x, y, z);
    this.group.quaternion.setFromRotationMatrix(_mm);
    this.group.position.copy(grip);
  }
}
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _mm = new THREE.Matrix4();
