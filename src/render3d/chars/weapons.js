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

/** A flat 2D outline [[x, y], …] extruded `t` thick along Z (centred): blade heads. */
function plate(pts, t) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -t / 2);
  return g;
}
/** A crescent axe bit on side `s` (+1: the edge toward -Y), from the eye at x0 out `reach`, `span` along the haft. */
function axeBit(b, x0, s, reach, span, cols, t = 0.016) {
  const P = [], E = [], n = 9;
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = (u - 0.5) * 2;
    // the cutting edge: a convex arc, its horns swept back toward the haft
    P.push([x0 + a * span * 0.5 + (1 - a * a) * 0.0, -s * (reach - Math.abs(a) ** 2.2 * reach * 0.22)]);
  }
  const neck = [[x0 + span * 0.16, -s * 0.03], [x0 - span * 0.16, -s * 0.03]];
  const out = [...P, ...neck];
  b.add(plate(s > 0 ? out : out.slice().reverse(), t), M(0, 0, 0), cols.cheek);
  for (let i = 0; i < n; i++) {
    const a0 = P[i], a1 = P[i + 1];
    b.add(Prim.cyl(4), between([a0[0], a0[1] + s * 0.012, 0], [a1[0], a1[1] + s * 0.012, 0], 0.013, t * 0.6, 0.006), cols.edge);
  }
}
const AXES = {
  woodsman_axe: { haft: [-0.12, 0.74], r: 0.02, wood: '#8a5a32', wrap: '#4a3022', head: 0.68, bits: [1], reach: 0.23, span: 0.25, cheek: '#7d8a94', edge: '#e4ebef', poll: true },
  giant_axe: { haft: [-0.3, 1.05], r: 0.03, wood: '#5b3a24', wrap: '#7a2a20', head: 0.92, bits: [1, -1], reach: 0.3, span: 0.36, cheek: '#6f7b86', edge: '#dfe7ec', bands: '#c9a24e', spike: true },
  morgan_axe: { haft: [-0.08, 0.6], r: 0.026, wood: '#9aa3ad', wrap: '#2d3436', head: 0.5, bits: [1], reach: 0.34, span: 0.42, cheek: '#a9b4bd', edge: '#f1f5f8', socket: true },
};
/** An axe by item id (the woodsman's when it has none). */
export function axeGeo(id) {
  const A = AXES[id] || AXES.woodsman_axe;
  return geo('axe:' + (AXES[id] ? id : 'woodsman_axe'), (b) => {
    const [h0, h1] = A.haft, wood = A.wood;
    b.add(Prim.cyl(8), between([h0, 0, 0], [h1, 0, 0], A.r, A.r * 0.9), wood);
    for (let x = h0 + 0.05; x < h0 + 0.3; x += 0.045) b.add(Prim.torus(0.32, 4, 10), M(x, 0, 0, 0, Math.PI / 2, 0.25, A.r * 1.05), A.wrap);
    b.add(Prim.sphere(8, 5), M(h0, 0, 0, 0, 0, 0, [A.r * 1.3, A.r * 1.25, A.r * 1.25]), A.socket ? '#2d3436' : shadeHex(wood, -0.2));
    if (A.socket) b.add(Prim.cyl(10), between([h0 - 0.02, 0, 0], [h0 + 0.12, 0, 0], 0.05, 0.05), '#5c6670');
    if (A.bands) for (const x of [A.head - A.span * 0.6, (h0 + A.head) / 2]) b.add(Prim.cyl(8), between([x - 0.02, 0, 0], [x + 0.02, 0, 0], A.r * 1.25), A.bands);
    // the eye: a socket block round the haft
    b.add(Prim.rbox(0.3), M(A.head, 0, 0, 0, 0, 0, [A.span * 0.24, A.r * 1.9, A.r * 1.5]), A.cheek);
    for (const s of A.bits) axeBit(b, A.head, s, A.reach, A.span, A, A.socket ? 0.02 : 0.016);
    if (A.poll) b.add(Prim.rbox(0.3), M(A.head, 0.05, 0, 0, 0, 0, [0.03, 0.03, A.r * 1.3]), shadeHex(A.cheek, -0.15));
    if (A.spike) b.add(Prim.cone(6), between([A.head + A.span * 0.2, 0, 0], [A.head + A.span * 0.55, 0, 0], 0.03), A.edge);
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
const STAFFS = {
  bo_staff: { segs: 1, rod: '#9c6b3f', grain: '#7d522c', cap: '#5f6a72', wrap: '#e8dcc0' },
  clima_tact: { segs: 3, rod: '#4fb3e8', grain: '#3a95c9', cap: '#1f6fa8', joint: '#1f6fa8' },
  sorcery_clima_tact: { segs: 3, rod: '#2a4f8f', grain: '#1f3d70', cap: '#f2c94c', joint: '#f2c94c', orb: '#9fe3ff' },
};
/** A staff by item id: a bo of banded wood, or a Clima-Tact's three blue rods with their ball joints. */
export function staffGeo(id) {
  const S = STAFFS[id] || STAFFS.bo_staff;
  return geo('staff:' + (STAFFS[id] ? id : 'bo_staff'), (b) => {
    const x0 = -0.34, x1 = 0.76, r = 0.016;
    if (S.segs === 1) {
      b.add(Prim.cyl(8), between([x0, 0, 0], [x1, 0, 0], r), S.rod);
      for (let x = x0 + 0.12; x < x1 - 0.1; x += 0.13) b.add(Prim.cyl(8), between([x, 0, 0], [x + 0.012, 0, 0], r * 1.04), S.grain);
      for (const x of [x0, x1]) b.add(Prim.cyl(8), between([x - 0.035 * Math.sign(x), 0, 0], [x + 0.004 * Math.sign(x), 0, 0], r * 1.22), S.cap);
      for (let x = -0.08; x < 0.12; x += 0.03) b.add(Prim.torus(0.3, 4, 10), M(x, 0, 0, 0, Math.PI / 2, 0.3, r * 1.12), S.wrap);
    } else {
      const L = (x1 - x0) / 3;
      for (let i = 0; i < 3; i++) {
        const a = x0 + i * L, c = a + L;
        b.add(Prim.cyl(8), between([a + 0.02, 0, 0], [c - 0.02, 0, 0], r * 0.95), S.rod);
        b.add(Prim.cyl(8), between([a + L * 0.45, 0, 0], [a + L * 0.55, 0, 0], r * 1.08), S.grain);
      }
      for (let i = 0; i <= 3; i++) {
        const x = x0 + i * L, end = i === 0 || i === 3;
        b.add(Prim.sphere(8, 6), M(x, 0, 0, 0, 0, 0, end ? r * 2.3 : r * 1.55), end ? S.cap : S.joint);
        if (end && S.orb) b.add(Prim.sphere(8, 6), M(x + (i ? 0.02 : -0.02), 0, 0, 0, 0, 0, r * 1.2), S.orb);
      }
    }
  });
}
/** A gun by item id (else by its kind: 'sling' or a pistol). */
export function gunGeo(kind, id) {
  const key = id && GUNS[id] ? id : kind === 'sling' ? 'slingshot' : 'flintlock';
  return geo('gun:' + key, (b) => GUNS[key](b));
}
const HALF_RING = new THREE.TorusGeometry(1, 0.18, 4, 10, Math.PI);
const BRASS = '#c9a24e', STEELD = '#3b4247', WALNUT = '#7a4a2a';
function flintlock(b, long = false) {
  const end = long ? 0.95 : 0.42, stockBack = long ? -0.42 : -0.02;
  // the barrel: octagonal, a brass ring at the muzzle, the ramrod under it
  b.add(Prim.cyl(8), between([0.03, 0.035, 0], [end, 0.035, 0], 0.016, 0.016), STEELD);
  b.add(Prim.cyl(8), between([end - 0.02, 0.035, 0], [end, 0.035, 0], 0.02), BRASS);
  b.add(Prim.cyl(5), between([0.1, 0.008, 0], [end - 0.04, 0.008, 0], 0.005), '#6d4c33');
  // the fore-stock along under the barrel, with its bands
  b.add(Prim.rbox(0.45), M((0.04 + end * 0.82) / 2, 0.02, 0, 0, 0, 0, [(end * 0.82 - 0.04) / 2, 0.016, 0.017]), WALNUT);
  if (long) for (const x of [0.4, 0.62]) b.add(Prim.cyl(8), between([x, 0.026, 0], [x + 0.015, 0.026, 0], 0.024, 0.021), BRASS);
  // the lock: plate, hammer (cock) with its flint, frizzen, pan
  b.add(Prim.rbox(0.3), M(0.06, 0.03, 0.017, 0, 0, 0, [0.04, 0.014, 0.004]), '#7f8c98');
  b.add(Prim.rbox(0.3), M(0.03, 0.06, 0.012, 0, 0, -0.5, [0.008, 0.024, 0.005]), '#7f8c98');
  b.add(Prim.box(), M(0.042, 0.082, 0.012, 0, 0, 0, [0.008, 0.005, 0.005]), '#2b2b2b');
  b.add(Prim.box(), M(0.075, 0.064, 0.012, 0, 0, 0.3, [0.004, 0.016, 0.008]), '#7f8c98');
  if (long) {
    // a rifle's butt stock back to the shoulder, a brass plate on its heel
    b.add(Prim.rbox(0.4), M(-0.18, -0.005, 0, 0, 0, 0.08, [0.24, 0.03, 0.02]), WALNUT);
    b.add(Prim.rbox(0.4), M(stockBack + 0.06, -0.03, 0, 0, 0, 0.22, [0.07, 0.055, 0.021]), WALNUT);
    b.add(Prim.box(), M(stockBack + 0.005, -0.035, 0, 0, 0, 0.22, [0.006, 0.06, 0.022]), BRASS);
  } else {
    // a pistol's curved grip, the brass skull-crusher cap at its butt
    b.add(Prim.rbox(0.45), M(0.03, 0.018, 0, 0, 0, 0, [0.05, 0.02, 0.017]), WALNUT);
    b.add(Prim.cyl(10), between([0.015, 0.01, 0], [-0.045, -0.085, 0], 0.023, 0.016), WALNUT);
    b.add(Prim.sphere(8, 6), M(-0.05, -0.09, 0, 0, 0, 0.55, [0.03, 0.022, 0.021]), BRASS);
  }
  // trigger and its brass guard
  b.add(Prim.box(), M(0.045, -0.008, 0, 0, 0, 0.3, [0.004, 0.016, 0.003]), '#2b2b2b');
  b.add(HALF_RING, M(0.045, 0.002, 0, 0, 0, Math.PI, [0.028, 0.026, 0.026]), BRASS);
}
/** A Y of wood (or Kabuto's beetle horns), its band and leather pouch, along +X from the grip. */
function sling(b, L) {
  const s = L.size;
  b.add(Prim.cyl(7), between([-0.06 * s, 0, 0], [0.12 * s, 0, 0], 0.017 * s), L.wood);
  for (let x = -0.05 * s; x < 0.08 * s; x += 0.02 * s) b.add(Prim.torus(0.22, 4, 8), M(x, 0, 0, 0, Math.PI / 2, 0.3, 0.0175 * s), L.wrap);
  const tips = [];
  for (const k of [-1, 1]) {
    const mid = [0.2 * s, k * 0.06 * s, 0], tip = [0.29 * s, k * 0.085 * s, 0];
    b.add(Prim.cyl(7), between([0.12 * s, 0, 0], mid, 0.015 * s, 0.015 * s, 0.01), L.wood);
    b.add(Prim.cyl(7), between(mid, tip, 0.014 * s, 0.013 * s, 0.005), L.wood);
    if (L.horn) b.add(Prim.cone(6), between(tip, [0.33 * s, k * 0.06 * s, 0], 0.014 * s), L.horn);
    b.add(Prim.sphere(6, 4), M(tip[0], tip[1], tip[2], 0, 0, 0, 0.017 * s), L.cap || L.wood);
    tips.push(tip);
  }
  if (L.horn) {
    b.add(Prim.cone(6), between([0.12 * s, 0, 0], [0.36 * s, 0, 0], 0.022 * s), L.horn);
    if (L.dial) b.add(Prim.sphere(10, 8), M(0.11 * s, 0, 0, 0, 0, 0, [0.028 * s, 0.032 * s, 0.032 * s]), L.dial);
  }
  // the band, drawn back a little to the pouch
  const P = [0.16 * s, 0, 0];
  for (const t of tips) b.add(Prim.cyl(4), between(t, P, 0.0045 * s, 0.003 * s), L.band);
  b.add(Prim.rbox(0.4), M(P[0], P[1], P[2], 0, 0, 0, [0.012 * s, 0.02 * s, 0.012 * s]), '#6d4c33');
}
const GUNS = {
  flintlock: (b) => flintlock(b),
  marine_rifle: (b) => flintlock(b, true),
  slingshot: (b) => sling(b, { size: 1, wood: '#8a5a32', wrap: '#c9b083', band: '#e8b77a' }),
  kabuto: (b) => sling(b, { size: 1.5, wood: '#3e4f2b', wrap: '#2a2a2a', band: '#e8b77a', horn: '#55703a', cap: '#c9a24e', dial: '#f2e3b3' }),
  kuro_kabuto: (b) => sling(b, { size: 1.6, wood: '#1d1b20', wrap: '#8e1f1f', band: '#d8d0c0', horn: '#2b2830', cap: '#b8352a', dial: '#9fd2ff' }),
};
function shadeHex(c, k) { const col = new THREE.Color(c); col.offsetHSL(0, 0, k * 0.5); return '#' + col.getHexString(); }

/** Every held weapon by name, for tools/propsheet.mjs. */
export const WEAPON_MODELS = {
  ...Object.fromEntries(Object.keys(AXES).map((k) => [k, () => axeGeo(k)])),
  ...Object.fromEntries(Object.keys(STAFFS).map((k) => [k, () => staffGeo(k)])),
  ...Object.fromEntries(Object.keys(GUNS).map((k) => [k, () => gunGeo(null, k)])),
};
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

let ICEBLADE = null;
/** The Ice Saber's crystal: a long faceted blade along +x with frost teeth up its edges. */
function iceBladeGeo() {
  if (ICEBLADE) return ICEBLADE;
  const parts = [];
  const main = new THREE.OctahedronGeometry(1, 0);
  main.scale(0.54, 0.075, 0.03); main.translate(0.54, 0, 0);
  parts.push(main);
  for (let i = 0; i < 7; i++) {
    const t = 0.18 + i * 0.12, side = i % 2 ? 1 : -1;
    const sp = new THREE.ConeGeometry(0.025, 0.12 + (i % 3) * 0.04, 4);
    sp.rotateZ(-side * (Math.PI / 2 - 0.5));
    sp.translate(t, side * 0.07, 0);
    parts.push(sp);
  }
  let n = 0;
  for (const g of parts) n += (g.index ? g.toNonIndexed() : g).attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (let g of parts) { if (g.index) g = g.toNonIndexed(); pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  ICEBLADE = new THREE.BufferGeometry();
  ICEBLADE.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ICEBLADE.computeVertexNormals();
  ICEBLADE.userData.shared = true;
  return ICEBLADE;
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
    else if (kind === 'axe') g = axeGeo(opts.id);
    else if (kind === 'staff') g = staffGeo(opts.id);
    else if (kind === 'gun') g = gunGeo(opts.gun, opts.id);
    else if (kind === 'prop') g = propGeo(opts.variant);
    else if (kind === 'energy') {
      this.mesh = new THREE.Mesh(energyBladeGeo(), glowMaterial(opts.color || '#b3e5fc', 0.8));
      this.core = new THREE.Mesh(energyBladeGeo(), glowMaterial('#ffffff', 0.9));
      this.core.scale.set(0.95, 0.4, 0.6);
      this.mesh.add(this.core);
      // (ice — the Ice Saber — is a blade of real crystal: faceted, edged with
      // jagged teeth of frost, the glow inside it)
      if (/^#(b3e5fc|e1f5fe|81d4fa)$/i.test(opts.color || '')) {
        const crystal = new THREE.Mesh(iceBladeGeo(), glowMaterial('#e8f7ff', 0.55));
        this.mesh.add(crystal);
        this.mesh.material.opacity = 0.45;
      }
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
