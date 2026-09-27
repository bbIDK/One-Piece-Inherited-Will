// The swimmers that hunt you, in 3D: the Sea Cow of the Blues (a cow's face on
// a whale's body) and the horned Fighting Fish of the Grand Line. Each turns
// with its heading, beats its tail, gapes and snaps when it bites, and rolls
// belly-up and sinks when it's beaten.
import * as THREE from 'three';
import { toon, addOutline } from '../materials.js';
import { mixHex } from '../../core/math.js';
import { Label } from './fx.js';

const SPH = new THREE.SphereGeometry(1, 16, 10);
const CONE = new THREE.ConeGeometry(1, 1, 8);
CONE.translate(0, 0.5, 0);

/** A flat fin: a triangle (base from b0 to b1, tip at t) with a little thickness, in the xy plane. */
function finGeo(b0, b1, t, th = 0.03) {
  const pos = [];
  const f = [[...b0, th], [...b1, th], [...t, 0]], k = [[...b0, -th], [...t, 0], [...b1, -th]];
  pos.push(...f.flat(), ...k.flat());
  pos.push(b0[0], b0[1], th, b0[0], b0[1], -th, b1[0], b1[1], -th, b0[0], b0[1], th, b1[0], b1[1], -th, b1[0], b1[1], th);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function part(geo, mat, s, p, parent, outline = 0.03) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(...s);
  m.position.set(...p);
  m.castShadow = true;
  if (outline) addOutline(m, outline);
  parent.add(m);
  return m;
}

/**
 * Shared behaviour of the big swimmers that hunt you: a body that turns with
 * its heading and noses up or down toward its depth, a tail that beats, a jaw
 * that gapes through the wind-up and snaps shut, a name and health bar, and
 * belly-up and sinking when it's beaten.
 */
class SeaBeastView {
  constructor(a) {
    this.a = a;
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.root.add(this.yaw);
    this.body = new THREE.Group();
    this.yaw.add(this.body);
    this.gape = 0;
    this.tailAxis = 'y';
    this.labelY = 1.6;
    this.pecs = [];
  }

  finish(a) {
    this.body.scale.setScalar(a.look?.scale || 1);
    this.label = new Label();
    this.root.add(this.label.sprite);
  }

  update(a, env, ctx) {
    const t = env.time + (a.seed || 0);
    this.yaw.rotation.y = -(a.facing || 0);
    const moving = Math.hypot(a.vx || 0, a.vy || 0);
    const beat = (this.tailAxis === 'z' ? 1.8 : 3) + moving * 1.2;
    if (this.tailAxis === 'z') this.tail.rotation.z = Math.sin(t * beat) * 0.35;
    else { this.tail.rotation.y = Math.sin(t * beat) * 0.42; this.body.rotation.y = -Math.sin(t * beat - 0.8) * 0.06; }
    for (let i = 0; i < this.pecs.length; i++) this.pecs[i].rotation.z = Math.sin(t * 1.4 + i) * 0.18;
    this.extra?.(t, a);
    const act = a.action;
    let want = 0.05;
    if (act) {
      const w = act.def.windup ?? 0.3;
      want = act.t < w ? 0.55 * Math.min(1, act.t / w) : Math.max(0, 0.55 - (act.t - w) * 5);
    }
    this.gape += (want - this.gape) * Math.min(1, 0.3 + (act ? 0.5 : 0));
    if (this.jaw) this.jaw.rotation.z = -this.gape;
    this.body.rotation.z = Math.max(-0.35, Math.min(0.35, ((a._lastDepth ?? a.depth) - a.depth) * 6));
    a._lastDepth = a.depth;
    const knocked = a.state === 'knocked' || a.state === 'dead';
    const kt = knocked ? (a.knockT || 0) : 0;
    this.body.rotation.x = knocked ? Math.min(Math.PI, kt * 2.4) : 0;
    this.body.position.y = knocked ? -Math.min(2.5, kt * 0.8) : 0;
    const showBar = a.damageShown > 0 && a.state === 'idle';
    this.label.set(a.showName && a.state === 'idle' ? a.name : null, a.nameColor || '#fff', showBar ? Math.max(0, a.hp / a.d.maxHp) : null, '#ef5350');
    this.label.sprite.position.set(0, this.labelY * (a.look?.scale || 1), 0);
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    const k = Math.min(2.4, Math.max(0.5, dist / 8));
    this.label.sprite.scale.set(2 * k, 0.56 * k, 1);
  }

  dispose() { this.label.dispose(); this.root.removeFromParent(); }
}

/**
 * A Sea Cow of the Blues (like Arlong's Momoo): a great lilac beast with a
 * cow's face on a whale's body — curling horns, floppy ears, a pink muzzle
 * with a gold ring through the nose, flippers and a broad tail fluke.
 */
export class SeaCowView extends SeaBeastView {
  constructor(a) {
    super(a);
    const col = a.bodyColor || '#8e7ca8';
    const hide = toon(col), belly = toon(mixHex(col, '#fff4fb', 0.72)), dark = toon(mixHex(col, '#1a1026', 0.45));
    const muzzle = toon('#f4b3c2'), nostril = toon('#6b2a3a'), horn = toon('#f3ead2'), gold = toon('#f1c40f');
    const white = toon('#ffffff'), black = toon('#141018');
    const B = this.body;
    this.tailAxis = 'z';
    this.labelY = 2.0;
    // the whale body
    part(SPH, hide, [1.35, 0.62, 0.66], [0, 0, 0], B, 0.05);
    part(SPH, belly, [1.2, 0.36, 0.52], [0.05, -0.3, 0], B, 0);
    // spots
    for (const [x, z, r] of [[0.3, 0.5, 0.2], [-0.4, -0.52, 0.24], [-0.1, 0.55, 0.14], [0.55, -0.45, 0.16]]) part(SPH, dark, [r, r * 0.7, 0.05], [x, 0.22, z], B, 0);
    // the head
    const H = new THREE.Group();
    H.position.set(1.25, 0.15, 0);
    B.add(H);
    part(SPH, hide, [0.62, 0.55, 0.58], [0, 0, 0], H, 0.045);
    part(SPH, muzzle, [0.36, 0.3, 0.44], [0.48, -0.16, 0], H, 0.035);
    for (const s of [-1, 1]) {
      part(SPH, nostril, [0.06, 0.08, 0.05], [0.82, -0.09, s * 0.14], H, 0);
      // eyes: big and a bit dopey
      part(SPH, white, [0.14, 0.16, 0.08], [0.3, 0.22, s * 0.46], H, 0.025);
      part(SPH, black, [0.06, 0.08, 0.04], [0.36, 0.2, s * 0.52], H, 0);
      // floppy ears
      const ear = part(SPH, hide, [0.24, 0.07, 0.13], [-0.08, 0.3, s * 0.62], H, 0.03);
      ear.rotation.set(s * 0.6, 0, -0.4);
      // horns curling up and out
      const h1 = part(CONE, horn, [0.09, 0.42, 0.09], [-0.12, 0.45, s * 0.35], H, 0.025);
      h1.rotation.set(s * 0.7, 0, -0.2);
    }
    // the nose ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 14), gold);
    ring.position.set(0.86, -0.2, 0);
    ring.rotation.y = Math.PI / 2;
    H.add(ring);
    // the jaw (under the muzzle)
    this.jaw = new THREE.Group();
    this.jaw.position.set(0.3, -0.34, 0);
    H.add(this.jaw);
    part(SPH, muzzle, [0.3, 0.09, 0.34], [0.2, -0.02, 0], this.jaw, 0.02);
    part(SPH, nostril, [0.24, 0.05, 0.26], [0.2, 0.04, 0], this.jaw, 0);
    // flippers
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(0.55, -0.32, s * 0.55);
      const f = part(SPH, dark, [0.42, 0.06, 0.2], [-0.18, -0.05, s * 0.2], hinge, 0.025);
      f.rotation.y = s * 0.5;
      B.add(hinge);
      this.pecs.push(hinge);
    }
    // the tail stock and a broad horizontal fluke
    this.tail = new THREE.Group();
    this.tail.position.set(-1.2, 0.05, 0);
    B.add(this.tail);
    part(SPH, hide, [0.7, 0.3, 0.3], [-0.45, 0, 0], this.tail, 0.04);
    for (const s of [-1, 1]) {
      const fl = part(SPH, dark, [0.36, 0.06, 0.34], [-1.05, 0, s * 0.3], this.tail, 0.03);
      fl.rotation.y = s * 0.55;
    }
    this.head = H;
    this.extra = (t) => { H.rotation.z = Math.sin(t * 0.9) * 0.05; ring.rotation.z = Math.sin(t * 2.3) * 0.3; };
    this.finish(a);
  }
}

/**
 * A Fighting Fish of the Grand Line: a big, mean fish with a long straight
 * horn out of its forehead, a jutting jaw of teeth, a spiny red sail of a
 * dorsal fin and red fins, and glaring eyes under a heavy brow.
 */
export class FightingFishView extends SeaBeastView {
  constructor(a) {
    super(a);
    const col = a.bodyColor || '#324a7a';
    const back = toon(col), belly = toon(mixHex(col, '#f2ead8', 0.8)), stripe = toon(mixHex(col, '#000000', 0.35));
    const fin = toon('#d84315'), finD = toon('#8e2a0c'), ivory = toon('#f1e6cc'), white = toon('#ffffff'), black = toon('#141018'), mouth = toon('#6b2430');
    const B = this.body;
    this.labelY = 1.7;
    const L = 1.45;
    part(SPH, back, [L, 0.46, 0.4], [0, 0, 0], B, 0.045);
    part(SPH, belly, [L * 0.9, 0.3, 0.33], [0.05, -0.17, 0], B, 0);
    for (let i = 0; i < 4; i++) part(SPH, stripe, [0.05, 0.36, 0.41], [0.55 - i * 0.38, 0.05, 0], B, 0);
    // the horn: long, straight, ringed at the base
    const horn = part(CONE, ivory, [0.09, 1.35, 0.09], [L * 0.72, 0.3, 0], B, 0.025);
    horn.rotation.z = -Math.PI / 2 + 0.12;
    part(new THREE.TorusGeometry(1, 0.35, 5, 10), ivory, [0.1, 0.1, 0.1], [L * 0.72, 0.3, 0], B, 0).rotation.y = Math.PI / 2;
    // eyes under a heavy brow
    for (const s of [-1, 1]) {
      part(SPH, white, [0.1, 0.1, 0.06], [L * 0.7, 0.12, s * 0.3], B, 0.02);
      part(SPH, black, [0.045, 0.06, 0.04], [L * 0.74, 0.11, s * 0.34], B, 0);
      const brow = part(SPH, stripe, [0.16, 0.04, 0.05], [L * 0.7, 0.24, s * 0.3], B, 0);
      brow.rotation.x = s * 0.2; brow.rotation.z = -0.35;
    }
    // the jutting lower jaw with teeth
    this.jaw = new THREE.Group();
    this.jaw.position.set(L * 0.6, -0.18, 0);
    B.add(this.jaw);
    part(SPH, belly, [0.5, 0.1, 0.24], [0.32, -0.02, 0], this.jaw, 0.02);
    part(SPH, mouth, [0.42, 0.06, 0.2], [0.3, 0.03, 0], this.jaw, 0);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
      part(CONE, white, [0.022, 0.08, 0.022], [0.62 - i * 0.09, 0.04, s * (0.15 - i * 0.012)], this.jaw, 0);
      const up = part(CONE, white, [0.022, 0.08, 0.022], [L * 0.6 + 0.6 - i * 0.09, -0.12, s * (0.16 - i * 0.012)], B, 0);
      up.rotation.x = Math.PI;
    }
    // the spiny red sail along the back
    const sail = new THREE.Mesh(finGeo([0.75, 0.38], [-0.9, 0.34], [-0.1, 1.05], 0.03), fin);
    addOutline(sail, 0.025);
    B.add(sail);
    for (let i = 0; i < 6; i++) part(CONE, finD, [0.018, 0.55, 0.018], [0.6 - i * 0.28, 0.4, 0], B, 0).rotation.z = 0.25;
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(0.35, -0.22, s * 0.3);
      const f = new THREE.Mesh(finGeo([0.2, 0], [-0.25, 0], [-0.55, -0.6], 0.025), fin);
      f.rotation.x = s * 1.1;
      addOutline(f, 0.02);
      hinge.add(f);
      B.add(hinge);
      this.pecs.push(hinge);
    }
    // the forked red tail
    this.tail = new THREE.Group();
    this.tail.position.set(-L * 0.85, 0.02, 0);
    B.add(this.tail);
    part(SPH, back, [0.5, 0.17, 0.15], [-0.35, 0, 0], this.tail, 0.03);
    for (const [b0, b1, tip] of [[[-0.7, 0.05], [-0.95, -0.02], [-1.3, 0.75]], [[-0.72, 0], [-0.9, 0], [-1.25, -0.65]]]) {
      const f = new THREE.Mesh(finGeo(b0, b1, tip, 0.025), fin);
      addOutline(f, 0.025);
      this.tail.add(f);
    }
    this.finish(a);
  }
}
