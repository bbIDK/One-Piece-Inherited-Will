// Held weapons for the 3D characters and the first-person viewmodel. Each is
// one small vertex-coloured mesh (shared geometry and material) placed at the
// hand every frame: +X along the blade/barrel from the grip, the flat of a
// blade facing ±Z (a sword's edge toward -Y: every sword its own model, see
// swords.js).
import { Builder, Prim, M, between, THREE } from './geom.js';
import { weaponMaterial, sharedOutline, glowMaterial } from './mats.js';
import { swordGeo, swordLook, bladeSpan } from './swords.js';

const SLOT = { main: 0, second: 1, mouth: 2 };

const GEOS = new Map();
function geo(key, make) {
  let g = GEOS.get(key);
  if (!g) { const b = new Builder(); make(b); g = b.buildStatic(); g.userData.shared = true; GEOS.set(key, g); }
  return g;
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
/** Everyday things townsfolk hold, along +X from the grip: a broom, a fishing rod, a mug. */
export function propGeo(kind) {
  return geo('prop:' + kind, (b) => {
    if (kind === 'broom') {
      b.add(Prim.cyl(6), between([-0.5, 0, 0], [0.82, 0, 0], 0.016), '#9c6b3f');
      b.add(Prim.frustum(0.45, 8), M(0.95, 0, 0, 0, 0, Math.PI / 2, [0.11, 0.3, 0.05]), '#d9b45a');
      b.add(Prim.cyl(6), M(0.83, 0, 0, 0, 0, Math.PI / 2, [0.055, 0.05, 0.035]), '#7a4f2a');
    } else if (kind === 'rod') {
      b.add(Prim.cyl(5), between([-0.25, 0, 0], [1.75, 0, 0], 0.012, 0.012), '#6d4c33');
      b.add(Prim.torus(0.35, 5, 10), M(0.05, -0.04, 0, 0, Math.PI / 2, 0, 0.04), '#37474f');
      // the line, hanging from the tip
      b.add(Prim.cyl(4), between([1.75, 0, 0], [1.9, -1.1, 0], 0.003, 0.003), '#eceff1');
      b.add(Prim.sphere(6, 4), M(1.9, -1.1, 0, 0, 0, 0, 0.025), '#e53935');
    } else if (kind === 'mug') {
      // the mug stands along +X (the pose points it up)
      b.add(Prim.cyl(10), M(0.07, 0, 0.0, 0, 0, Math.PI / 2, [0.055, 0.13, 0.055]), '#8d6e4a');
      b.add(Prim.cyl(10), M(0.137, 0, 0, 0, 0, Math.PI / 2, [0.05, 0.012, 0.05]), '#fff3e0');
      for (const x of [0.03, 0.11]) b.add(Prim.cyl(10), M(x, 0, 0, 0, 0, Math.PI / 2, [0.058, 0.012, 0.058]), '#5d4037');
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
    // (each sword its own model: swords.js)
    if (kind === 'sword') g = swordGeo(opts.id, SLOT[opts.variant] || 0, opts.haki);
    else if (kind === 'axe') g = axeGeo();
    else if (kind === 'staff') g = staffGeo();
    else if (kind === 'gun') g = gunGeo(opts.gun);
    else if (kind === 'prop') g = propGeo(opts.variant);
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
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    if (!opts.noOutline) {
      this.outline = new THREE.Mesh(g, opts.outline || sharedOutline(false));
      this.group.add(this.outline);
    }
    // (a blade that bleeds its own haze — Enma's red, the Shibireru's sparks — glows faintly round its length)
    const aura = kind === 'sword' && swordLook(opts.id, SLOT[opts.variant] || 0).aura;
    if (aura) {
      const [x0, x1] = bladeSpan(opts.id, SLOT[opts.variant] || 0);
      const m = new THREE.Mesh(energyBladeGeo(), glowMaterial(aura, 0.28));
      m.scale.set((x1 - x0) / 1.04, 1.5, 3);
      m.position.x = x0;
      m.renderOrder = 6;
      this.group.add(m);
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
