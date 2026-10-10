// Sea Kings in 3D: a giant serpent rearing out of the sea — a horned head
// with a hinged jaw full of teeth, red eyes, a neck rising from the water and
// humps of its coils breaking the surface behind it, spined along the back.
// It rears back during its wind-up and lunges when it bites; knocked out, it
// rolls over and sinks.
import * as THREE from 'three';
import { toon, addOutline } from '../materials.js';
import { mixHex } from '../../core/math.js';
import { Label } from './fx.js';

const TAU = Math.PI * 2;
const SPH = new THREE.SphereGeometry(1, 16, 12);
const CONE = new THREE.ConeGeometry(1, 1, 6);
CONE.translate(0, 0.5, 0);

function part(geo, mat, s, p, parent, outline = 0.06) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(...s);
  m.position.set(...p);
  m.castShadow = true;
  if (outline) addOutline(m, outline);
  parent.add(m);
  return m;
}

export class SeaKingView {
  constructor(a) {
    this.a = a;
    const col = a.bodyColor || '#2e7d32';
    const body = toon(col), belly = toon(mixHex(col, '#fff3e0', 0.5)), dark = toon(mixHex(col, '#000000', 0.35));
    const white = toon('#f4f1ea'), red = toon('#c62828'), black = toon('#1a1010');
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.root.add(this.yaw);
    this.bodyG = new THREE.Group();
    this.yaw.add(this.bodyG);
    const S = 1.0;
    // neck: a rising chain from the water to the head
    this.neck = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.95 - i * 0.07;
      this.neck.push(part(SPH, i % 2 ? body : body, [r, r, r * 0.95], [0, 0, 0], this.bodyG, 0.07));
    }
    // head
    this.head = new THREE.Group();
    this.bodyG.add(this.head);
    part(SPH, body, [1.75 * S, 0.95 * S, 1.2 * S], [0.5, 0.25, 0], this.head, 0.08);
    part(SPH, belly, [1.5 * S, 0.45 * S, 1.0 * S], [0.75, -0.25, 0], this.head, 0);
    // snout ridge, horns, crest
    part(SPH, dark, [0.9, 0.3, 0.35], [1.35, 0.72, 0], this.head, 0.04);
    for (const s of [-1, 1]) {
      const h = part(CONE, white, [0.22, 1.3, 0.22], [-0.45, 0.8, s * 0.55], this.head, 0.03);
      h.rotation.set(s * 0.45, 0, 0.9);
      // eyes: white with a slit red pupil
      part(SPH, white, [0.28, 0.24, 0.16], [0.95, 0.62, s * 0.92], this.head, 0.03);
      part(SPH, red, [0.12, 0.2, 0.08], [1.02, 0.62, s * 1.02], this.head, 0);
      part(SPH, black, [0.035, 0.14, 0.05], [1.06, 0.62, s * 1.07], this.head, 0);
      // whiskers / fins on the cheeks
      const f = part(CONE, dark, [0.18, 1.1, 0.05], [-0.2, 0.1, s * 1.05], this.head, 0.03);
      f.rotation.set(s * 1.25, 0.3, 1.6);
    }
    for (let i = 0; i < 4; i++) {
      const c = part(CONE, dark, [0.14, 0.7 - i * 0.1, 0.06], [-0.1 - i * 0.45, 1.05 - i * 0.12, 0], this.head, 0.03);
      c.rotation.z = 0.9;
    }
    // upper teeth
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      const t = part(CONE, white, [0.07, 0.3, 0.07], [1.9 - i * 0.28, -0.05, s * (0.55 - i * 0.02)], this.head, 0);
      t.rotation.x = Math.PI;
    }
    // hinged lower jaw
    this.jaw = new THREE.Group();
    this.jaw.position.set(-0.6, -0.1, 0);
    this.head.add(this.jaw);
    part(SPH, belly, [1.55, 0.32, 0.95], [1.35, -0.18, 0], this.jaw, 0.06);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) part(CONE, white, [0.06, 0.26, 0.06], [2.3 - i * 0.3, -0.05, s * (0.52 - i * 0.03)], this.jaw, 0);
    part(SPH, toon('#8e2430'), [1.2, 0.08, 0.7], [1.3, 0.02, 0], this.jaw, 0);
    // coils breaking the surface behind, spined
    this.humps = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const r = 0.95 - i * 0.08;
      part(SPH, body, [r * 1.35, r, r * 0.95], [0, 0, 0], g, 0.06);
      part(SPH, belly, [r * 1.2, r * 0.5, r * 0.8], [0, -r * 0.45, 0], g, 0);
      const sp = part(CONE, dark, [0.1, 0.55 * r, 0.05], [0, r * 0.9, 0], g, 0.03);
      sp.rotation.z = 0.35;
      this.bodyG.add(g);
      this.humps.push(g);
    }
    this.bodyG.scale.setScalar(1.25);
    this.label = new Label();
    this.root.add(this.label.sprite);
    this.lift = 0;
    this.lunge = 0;
  }

  update(a, env, ctx) {
    const t = env.time + (a.seed || 0);
    this.yaw.rotation.y = -(a.facing || 0);
    const act = a.action;
    let rear = 0, bite = 0;
    if (act) {
      const w = act.def.windup ?? 0.9;
      if (act.t < w) rear = Math.sin(Math.min(1, act.t / w) * Math.PI * 0.5);
      else bite = Math.max(0, 1 - (act.t - w) / 0.5);
    }
    const knocked = a.state === 'knocked' || a.state === 'dead';
    const kt = knocked ? (a.knockT || 0) : 0;
    // neck curve from the water up to the head
    const hx = 0.4 - rear * 1.2 + bite * 2.2, hy = 3.3 + rear * 1.0 - bite * 1.2 + Math.sin(t * 1.3) * 0.18;
    for (let i = 0; i < this.neck.length; i++) {
      const u = (i + 1) / (this.neck.length + 1);
      const x = -1.6 * (1 - u) * (1 - u) + hx * u * u + (-0.8) * 2 * u * (1 - u);
      const y = -0.6 * (1 - u) * (1 - u) + (hy - 0.3) * u * u + hy * 0.3 * 2 * u * (1 - u);
      this.neck[i].position.set(x, y, Math.sin(t * 1.1 + i) * 0.1);
    }
    this.head.position.set(hx, hy, 0);
    this.head.rotation.z = -0.15 + rear * 0.5 - bite * 0.45 + Math.sin(t * 1.3) * 0.04;
    this.jaw.rotation.z = -(0.12 + rear * 0.5 + bite * 0.35 + (act ? 0 : Math.max(0, Math.sin(t * 0.7)) * 0.15));
    for (let i = 0; i < this.humps.length; i++) {
      const g = this.humps[i];
      const ph = t * 1.5 - i * 0.9;
      g.position.set(-2.4 - i * 1.35, Math.max(-0.55, Math.sin(ph) * 0.55) - 0.25, Math.sin(t * 0.8 + i * 0.7) * 0.35);
      g.rotation.z = Math.cos(ph) * 0.3;
    }
    // knocked out: roll over and sink
    this.bodyG.position.y = knocked ? -Math.min(3.5, kt * 1.2) : 0;
    this.bodyG.rotation.x = knocked ? Math.min(1.4, kt * 0.9) : 0;
    // name + health
    const showBar = (a.damageShown > 0 || a.boss) && !a.boss && a.state === 'idle' && !a.hideBar;
    this.label.set(a.showName && a.state === 'idle' ? a.name : null, a.nameColor || '#fff', showBar ? Math.max(0, a.hp / a.d.maxHp) : null, '#ef5350');
    this.label.sprite.position.set(0, 6.4, 0);
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    const k = Math.min(2.4, Math.max(0.5, dist / 8));
    this.label.sprite.scale.set(2.2 * k, 2.2 * k * 40 / 256, 1);
  }

  dispose() { this.label.dispose(); this.root.removeFromParent(); }
}
