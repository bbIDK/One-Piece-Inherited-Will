// Sharks in 3D: a torpedo body, slate-blue above and white below, a tall
// dorsal fin that cuts the surface while it circles, sweeping pectorals, and a
// crescent tail that beats side to side. It gapes and snaps when it bites;
// knocked out, it rolls belly-up and sinks.
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

export class SharkView {
  constructor(a) {
    this.a = a;
    const col = a.bodyColor || '#6f8796';
    const back = toon(col), belly = toon(mixHex(col, '#ffffff', 0.82)), dark = toon(mixHex(col, '#000000', 0.4));
    const black = toon('#0d0d10'), white = toon('#f4f1ea'), mouth = toon('#6b2430');
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.root.add(this.yaw);
    this.body = new THREE.Group();
    this.yaw.add(this.body);
    const L = 1.25; // half length
    // the torpedo: back, belly and a pointed snout
    part(SPH, back, [L, 0.34, 0.36], [0, 0, 0], this.body, 0.04);
    part(SPH, belly, [L * 0.92, 0.22, 0.3], [0.05, -0.13, 0], this.body, 0);
    part(SPH, back, [0.55, 0.22, 0.26], [L * 0.78, -0.02, 0], this.body, 0.035);
    part(SPH, belly, [0.45, 0.12, 0.2], [L * 0.8, -0.1, 0], this.body, 0);
    // eyes and gill slits
    for (const s of [-1, 1]) {
      part(SPH, black, [0.045, 0.045, 0.03], [L * 0.93, 0.05, s * 0.19], this.body, 0);
      for (let i = 0; i < 4; i++) part(SPH, dark, [0.012, 0.11, 0.02], [L * 0.52 - i * 0.07, -0.02, s * 0.31], this.body, 0);
    }
    // the jaw (hinged under the snout) with rows of teeth
    this.jaw = new THREE.Group();
    this.jaw.position.set(L * 0.62, -0.14, 0);
    this.body.add(this.jaw);
    part(SPH, belly, [0.42, 0.07, 0.2], [0.28, -0.03, 0], this.jaw, 0.02);
    part(SPH, mouth, [0.36, 0.05, 0.16], [0.28, 0.02, 0], this.jaw, 0);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      part(CONE, white, [0.018, 0.06, 0.018], [0.52 - i * 0.07, 0.02, s * (0.11 - i * 0.008)], this.jaw, 0);
      const up = part(CONE, white, [0.018, 0.06, 0.018], [L * 0.62 + 0.5 - i * 0.07, -0.1, s * (0.12 - i * 0.008)], this.body, 0);
      up.rotation.x = Math.PI;
    }
    // fins: the tall dorsal, pectorals, a small second dorsal
    const dorsal = new THREE.Mesh(finGeo([0.25, 0.28], [-0.35, 0.26], [-0.28, 0.95], 0.035), back);
    addOutline(dorsal, 0.03);
    this.body.add(dorsal);
    const d2 = new THREE.Mesh(finGeo([-0.75, 0.2], [-0.95, 0.18], [-0.95, 0.38], 0.02), back);
    this.body.add(d2);
    this.pecs = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(0.3, -0.18, s * 0.26);
      const f = new THREE.Mesh(finGeo([0.2, 0], [-0.2, 0], [-0.45, -0.55], 0.025), back);
      f.rotation.x = s * 1.1;
      addOutline(f, 0.025);
      hinge.add(f);
      this.body.add(hinge);
      this.pecs.push(hinge);
    }
    // the tail: stock and a crescent fin, beating from a hinge
    this.tail = new THREE.Group();
    this.tail.position.set(-L * 0.85, 0.02, 0);
    this.body.add(this.tail);
    part(SPH, back, [0.5, 0.14, 0.13], [-0.35, 0, 0], this.tail, 0.03);
    const fin = new THREE.Mesh(finGeo([-0.7, 0.05], [-0.95, -0.02], [-1.15, 0.72], 0.025), back);
    addOutline(fin, 0.03);
    this.tail.add(fin);
    const lower = new THREE.Mesh(finGeo([-0.72, 0], [-0.9, 0], [-1.05, -0.45], 0.02), back);
    this.tail.add(lower);
    this.body.scale.setScalar(a.look?.scale || 1);
    this.label = new Label();
    this.root.add(this.label.sprite);
    this.gape = 0;
  }

  update(a, env, ctx) {
    const t = env.time + (a.seed || 0);
    this.yaw.rotation.y = -(a.facing || 0);
    const moving = Math.hypot(a.vx || 0, a.vy || 0);
    const beat = 3 + moving * 1.4;
    this.tail.rotation.y = Math.sin(t * beat) * 0.42;
    this.body.rotation.y = -Math.sin(t * beat - 0.8) * 0.06;
    for (let i = 0; i < this.pecs.length; i++) this.pecs[i].rotation.z = Math.sin(t * 0.9 + i) * 0.08;
    // bites: the jaw drops during the wind-up and snaps shut
    const act = a.action;
    let want = 0.05;
    if (act) {
      const w = act.def.windup ?? 0.3;
      want = act.t < w ? 0.55 * Math.min(1, act.t / w) : Math.max(0, 0.55 - (act.t - w) * 5);
    }
    this.gape += (want - this.gape) * Math.min(1, 0.3 + (act ? 0.5 : 0));
    this.jaw.rotation.z = -this.gape;
    // nosing up or down toward its depth
    this.body.rotation.z = Math.max(-0.35, Math.min(0.35, ((a._lastDepth ?? a.depth) - a.depth) * 6));
    a._lastDepth = a.depth;
    // knocked out: belly-up, sinking
    const knocked = a.state === 'knocked' || a.state === 'dead';
    const kt = knocked ? (a.knockT || 0) : 0;
    this.body.rotation.x = knocked ? Math.min(Math.PI, kt * 2.4) : 0;
    this.body.position.y = knocked ? -Math.min(2.5, kt * 0.8) : 0;
    const showBar = a.damageShown > 0 && a.state === 'idle';
    this.label.set(a.showName && a.state === 'idle' ? a.name : null, a.nameColor || '#fff', showBar ? Math.max(0, a.hp / a.d.maxHp) : null, '#ef5350');
    this.label.sprite.position.set(0, 1.5, 0);
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    const k = Math.min(2.4, Math.max(0.5, dist / 8));
    this.label.sprite.scale.set(2 * k, 0.56 * k, 1);
  }

  dispose() { this.label.dispose(); this.root.removeFromParent(); }
}
