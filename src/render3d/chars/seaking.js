// Sea Kings in 3D, as the anime draws them: one long, smooth body — a serpent's,
// thick as a ship at the middle and tapering to the tail — its coils rolling
// through the swell behind it in a wave that runs down its length, the neck
// rising out of the sea in an arc to a great head. Pale belly, darker back
// with bands across it, a frilled fin running down the spine and a pair of
// fins at the shoulders. Four kinds of head, as the anime's Calm Belt has
// them:
//   serpent — the classic: long jaw, swept-back horns, a crest, slit red eyes;
//   croc    — broad, flat and long, rows of teeth showing even shut;
//   fish    — a huge round-eyed fish head with catfish whiskers and a gaping mouth;
//   dragon  — horned and maned, long trailing whiskers, a beard of spines.
// It rears back on its wind-up and lunges down when it bites, lashes its tail
// round for a sweep, spits a jet of seawater; dives and comes up again;
// knocked out, it rolls over and sinks.
import * as THREE from 'three';
import { toon, addOutline, outlineMaterial, toonGradient } from '../materials.js';
import { mixHex } from '../../core/math.js';
import { Label } from './fx.js';

const SPH = new THREE.SphereGeometry(1, 16, 12);
const CONE = new THREE.ConeGeometry(1, 1, 8);
CONE.translate(0, 0.5, 0);
export const KINDS = ['serpent', 'croc', 'fish', 'dragon'];

const RINGS = 44, SIDES = 14;

function part(geo, mat, s, p, parent, outline = 0.06, r = null) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(...s);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  m.castShadow = true;
  if (outline) addOutline(m, outline);
  parent.add(m);
  return m;
}

/** A tube whose spine is set every frame (the body), with its own vertex colours. */
function tubeMesh(mat) {
  const g = new THREE.BufferGeometry();
  const n = RINGS * (SIDES + 1);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const idx = [];
  for (let i = 0; i < RINGS - 1; i++) for (let j = 0; j < SIDES; j++) {
    const a = i * (SIDES + 1) + j, b = a + SIDES + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

export class SeaKingView {
  constructor(a) {
    this.a = a;
    const seed = Math.abs(Math.floor((a.seed || 0) * 1000)) || 1;
    this.kind = a.species || KINDS[seed % KINDS.length];
    const col = a.bodyColor || '#2e7d32';
    this.cBack = new THREE.Color(mixHex(col, '#000000', 0.18));
    this.cSide = new THREE.Color(col);
    this.cBelly = new THREE.Color(mixHex(col, '#fff3e0', 0.62));
    this.cBand = new THREE.Color(mixHex(col, '#000000', 0.42));
    const body = toon(col), belly = toon(mixHex(col, '#fff3e0', 0.6)), dark = toon(mixHex(col, '#000000', 0.38)), fin = toon(mixHex(col, '#ffffff', 0.25), { side: THREE.DoubleSide });
    const white = toon('#f4f1ea'), red = toon('#d32f2f'), black = toon('#1a1010'), gum = toon('#8e2430'), yellow = toon('#ffca28');
    this.mats = { body, belly, dark, fin };
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.root.add(this.yaw);
    this.bodyG = new THREE.Group();
    this.yaw.add(this.bodyG);
    // (bigger the higher its level: the Calm Belt's are islands)
    this.S = Math.min(2.6, 1 + Math.max(0, (a.level || 20) - 20) / 45) * (a.boss ? 1.25 : 1);

    // the body, and its ink line (the same tube, a little fatter, drawn inside out)
    this.bodyMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    this.tube = tubeMesh(this.bodyMat);
    this.tube.castShadow = true;
    this.line = tubeMesh(outlineMaterial());
    this.bodyG.add(this.tube, this.line);
    this.spine = Array.from({ length: RINGS }, () => new THREE.Vector3());
    this.radius = new Float32Array(RINGS);

    // the dorsal frill: thin fins standing up along the back, and the shoulder fins
    this.frill = [];
    for (let i = 0; i < 14; i++) {
      const f = part(CONE, fin, [0.06, 1, 0.5], [0, 0, 0], this.bodyG, 0.025);
      this.frill.push(f);
    }
    this.flippers = [-1, 1].map((s) => {
      const g = new THREE.Group();
      part(SPH, fin, [1.1, 0.08, 0.55], [0.9, 0, s * 0.3], g, 0.03, [0, s * 0.5, 0]);
      this.bodyG.add(g);
      return g;
    });

    // the head
    this.head = new THREE.Group();
    this.bodyG.add(this.head);
    this.jaw = new THREE.Group();
    this.buildHead({ body, belly, dark, white, red, black, gum, yellow, fin });
    this.label = new Label();
    this.root.add(this.label.sprite);
    this.rear = 0; this.bite = 0; this.sweep = 0; this.spit = 0; this.dive = 0;
  }

  buildHead(m) {
    const h = this.head, k = this.kind;
    const eye = (x, y, z, r = 0.26, slit = true) => {
      for (const s of [-1, 1]) {
        part(SPH, m.white, [r, r * 0.85, r * 0.6], [x, y, s * z], h, 0.03);
        part(SPH, slit ? m.red : m.yellow, [r * 0.5, r * 0.75, r * 0.3], [x + 0.04, y, s * (z + r * 0.35)], h, 0);
        part(SPH, m.black, [r * 0.14, r * 0.6, r * 0.2], [x + 0.06, y, s * (z + r * 0.5)], h, 0);
        // the brow ridge over it, scowling
        part(SPH, m.dark, [r * 1.4, r * 0.35, r * 0.6], [x - 0.05, y + r * 0.75, s * z], h, 0.02, [0, 0, -0.25]);
      }
    };
    const teeth = (parent, n, x0, step, y, z0, dz, len, down) => {
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
        part(CONE, m.white, [0.07, len, 0.07], [x0 - i * step, y, s * (z0 - i * dz)], parent, 0, [down ? Math.PI : 0, 0, 0]);
      }
    };
    if (k === 'croc') {
      part(SPH, m.body, [2.6, 0.62, 1.1], [1.2, 0.2, 0], h, 0.08);
      part(SPH, m.dark, [1.2, 0.5, 0.9], [-0.2, 0.55, 0], h, 0.05);
      for (const s of [-1, 1]) part(SPH, m.dark, [0.18, 0.12, 0.14], [3.6, 0.55, s * 0.32], h, 0); // nostrils
      eye(0.35, 0.92, 0.55, 0.24, true);
      teeth(h, 9, 3.4, 0.38, 0.0, 0.85, 0.01, 0.34, true);
      this.jaw.position.set(-0.6, -0.1, 0);
      part(SPH, m.belly, [2.5, 0.35, 1.0], [1.8, -0.22, 0], this.jaw, 0.06);
      teeth(this.jaw, 8, 3.8, 0.4, -0.05, 0.8, 0.01, 0.28, false);
      part(SPH, m.gum, [2.1, 0.06, 0.75], [1.8, 0.02, 0], this.jaw, 0);
    } else if (k === 'fish') {
      part(SPH, m.body, [1.9, 1.5, 1.45], [0.6, 0.3, 0], h, 0.09);
      part(SPH, m.belly, [1.6, 0.9, 1.2], [0.85, -0.45, 0], h, 0);
      eye(1.1, 0.95, 0.95, 0.42, false);
      // whiskers: long, drooping
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
        const w = part(CONE, m.dark, [0.07, 2.4 - i * 0.6, 0.07], [2.0, -0.1 - i * 0.2, s * 0.6], h, 0.02);
        w.rotation.set(s * (1.9 + i * 0.25), 0, -0.6);
      }
      teeth(h, 5, 2.25, 0.22, -0.2, 0.75, 0.04, 0.3, true);
      this.jaw.position.set(0.3, -0.45, 0);
      part(SPH, m.belly, [1.7, 0.5, 1.25], [1.1, -0.25, 0], this.jaw, 0.06);
      teeth(this.jaw, 4, 2.4, 0.24, 0.05, 0.7, 0.05, 0.26, false);
      part(SPH, m.gum, [1.4, 0.08, 0.95], [1.2, 0.0, 0], this.jaw, 0);
      // gill fins
      for (const s of [-1, 1]) part(SPH, m.fin, [0.9, 0.7, 0.08], [-0.6, 0.1, s * 1.25], h, 0.03, [0, s * 0.6, 0]);
    } else if (k === 'dragon') {
      part(SPH, m.body, [2.0, 1.0, 1.15], [0.8, 0.3, 0], h, 0.08);
      part(SPH, m.dark, [1.0, 0.32, 0.4], [1.9, 0.82, 0], h, 0.04);
      eye(1.0, 0.75, 0.82, 0.25, true);
      for (const s of [-1, 1]) {
        // antlered horns: a sweep back and a tine up
        part(CONE, m.white, [0.2, 1.9, 0.2], [-0.2, 1.0, s * 0.55], h, 0.03, [s * 0.35, 0, 1.1]);
        part(CONE, m.white, [0.12, 0.8, 0.12], [-0.9, 1.6, s * 0.75], h, 0.02, [s * 0.4, 0, 0.3]);
        // long trailing whiskers
        const w = part(CONE, m.dark, [0.06, 3.2, 0.06], [2.4, 0.2, s * 0.45], h, 0.02);
        w.rotation.set(s * 1.7, 0, -1.2);
        // the mane, flaring back from the cheeks
        for (let i = 0; i < 4; i++) part(CONE, m.fin, [0.25, 1.4 - i * 0.15, 0.05], [-0.6 - i * 0.3, 0.3 - i * 0.2, s * 0.95], h, 0.02, [s * (1.3 + i * 0.1), 0, 1.4]);
      }
      teeth(h, 6, 2.5, 0.3, -0.05, 0.6, 0.02, 0.32, true);
      this.jaw.position.set(-0.5, -0.1, 0);
      part(SPH, m.belly, [1.9, 0.35, 1.0], [1.6, -0.2, 0], this.jaw, 0.06);
      teeth(this.jaw, 5, 2.9, 0.3, -0.05, 0.58, 0.02, 0.26, false);
      part(SPH, m.gum, [1.5, 0.06, 0.7], [1.6, 0.02, 0], this.jaw, 0);
      // beard of spines under the jaw
      for (let i = 0; i < 5; i++) part(CONE, m.dark, [0.08, 0.7, 0.08], [1.6 - i * 0.4, -0.5, 0], this.jaw, 0.02, [0, 0, Math.PI - 0.3]);
    } else {
      // serpent
      part(SPH, m.body, [2.1, 0.95, 1.2], [0.7, 0.25, 0], h, 0.08);
      part(SPH, m.dark, [1.1, 0.3, 0.38], [1.6, 0.72, 0], h, 0.04);
      eye(1.0, 0.65, 0.88, 0.26, true);
      for (const s of [-1, 1]) {
        part(CONE, m.white, [0.24, 1.6, 0.24], [-0.4, 0.85, s * 0.6], h, 0.03, [s * 0.45, 0, 1.0]);
        part(CONE, m.fin, [0.2, 1.2, 0.05], [-0.1, 0.1, s * 1.05], h, 0.03, [s * 1.25, 0.3, 1.6]);
      }
      for (let i = 0; i < 5; i++) part(CONE, m.fin, [0.16, 0.9 - i * 0.12, 0.06], [-0.1 - i * 0.45, 1.05 - i * 0.12, 0], h, 0.03, [0, 0, 0.9]);
      teeth(h, 7, 2.3, 0.3, -0.05, 0.58, 0.02, 0.32, true);
      this.jaw.position.set(-0.6, -0.1, 0);
      part(SPH, m.belly, [1.9, 0.34, 1.0], [1.5, -0.2, 0], this.jaw, 0.06);
      teeth(this.jaw, 6, 2.7, 0.32, -0.05, 0.56, 0.02, 0.26, false);
      part(SPH, m.gum, [1.5, 0.07, 0.75], [1.5, 0.02, 0], this.jaw, 0);
    }
    h.add(this.jaw);
  }

  /** The spine: coils rolling through the swell behind, then the neck rising in an arc to the head. */
  layout(t, hx, hy, S, sinkY) {
    const sp = this.spine, R = this.radius;
    const L = 16 * S, coil = 0.62;
    const swim = t * 2.2;
    const end = new THREE.Vector3(0, -0.2 * S, 0);
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1);
      if (u <= coil) {
        const v = u / coil;
        const amp = (0.35 + 0.65 * v) * S;
        // (a wave runs down it: humps breaking the surface, troughs under it)
        sp[i].set(-L * (1 - v), Math.sin(swim - v * 11) * 0.95 * amp - 0.55 * S + v * 0.35 * S, Math.sin(t * 0.9 + v * 5) * 0.7 * S * (1 - v * 0.6));
        if (i === Math.round(coil * (RINGS - 1))) end.copy(sp[i]);
      } else {
        // the neck: a curve from the water up to the back of the head
        const w = (u - coil) / (1 - coil);
        const a = end, c = new THREE.Vector3(-0.8 * S, hy * 0.95, 0), b = new THREE.Vector3(hx - 0.9 * S, hy - 0.2 * S, 0);
        const q = 1 - w;
        sp[i].set(q * q * a.x + 2 * q * w * c.x + w * w * b.x, q * q * a.y + 2 * q * w * c.y + w * w * b.y, q * q * a.z + 2 * q * w * c.z + w * w * b.z);
      }
      sp[i].y += sinkY;
      // thickest at the middle, tapering to a point at the tail and narrowing a little at the neck
      R[i] = S * (u < 0.5 ? 0.18 + 0.92 * Math.sin((u / 0.5) * Math.PI * 0.5) : 1.1 - 0.3 * (u - 0.5) / 0.5);
    }
  }

  /** Lay the tube (and its ink line, a lens-width fatter) round the spine; belly pale, back dark, bands across it. */
  skin() {
    const sp = this.spine, R = this.radius;
    const P = this.tube.geometry.attributes.position.array, N = this.tube.geometry.attributes.normal.array, C = this.tube.geometry.attributes.color.array;
    const LP = this.line.geometry.attributes.position.array;
    const T = new THREE.Vector3(), U = new THREE.Vector3(), Sd = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), col = new THREE.Color();
    const line = 0.07 * this.S;
    for (let i = 0; i < RINGS; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(RINGS - 1, i + 1)];
      T.subVectors(b, a).normalize();
      U.copy(up).addScaledVector(T, -up.dot(T));
      if (U.lengthSq() < 1e-4) U.set(1, 0, 0);
      U.normalize();
      Sd.crossVectors(T, U).normalize();
      const band = Math.sin(i * 0.9) > 0.55;
      for (let j = 0; j <= SIDES; j++) {
        const th = (j / SIDES) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        n.copy(U).multiplyScalar(c).addScaledVector(Sd, s);
        const k = (i * (SIDES + 1) + j) * 3;
        // (a little flattened: wider than deep)
        P[k] = sp[i].x + n.x * R[i]; P[k + 1] = sp[i].y + n.y * R[i] * 0.9; P[k + 2] = sp[i].z + n.z * R[i] * 1.08;
        LP[k] = sp[i].x + n.x * (R[i] + line); LP[k + 1] = sp[i].y + n.y * (R[i] * 0.9 + line); LP[k + 2] = sp[i].z + n.z * (R[i] * 1.08 + line);
        N[k] = n.x; N[k + 1] = n.y; N[k + 2] = n.z;
        if (c < -0.25) col.copy(this.cBelly);
        else if (c > 0.55) col.copy(band ? this.cBand : this.cBack);
        else col.copy(band && c > 0.1 ? this.cBand : this.cSide);
        C[k] = col.r; C[k + 1] = col.g; C[k + 2] = col.b;
      }
    }
    for (const m of [this.tube, this.line]) {
      const g = m.geometry;
      g.attributes.position.needsUpdate = true;
      if (m === this.tube) { g.attributes.normal.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    }
    // the frill along the back of the coils and the neck, standing up off the spine
    for (let f = 0; f < this.frill.length; f++) {
      const i = Math.round(6 + (f / (this.frill.length - 1)) * (RINGS - 10));
      const a = sp[i], b = sp[Math.min(RINGS - 1, i + 1)];
      T.subVectors(b, a).normalize();
      const m = this.frill[f];
      m.position.set(a.x, a.y + R[i] * 0.85, a.z);
      m.scale.set(0.06 * this.S, (0.55 + 0.5 * Math.sin((f / this.frill.length) * Math.PI)) * this.S, 0.45 * this.S);
      m.rotation.set(0, 0, Math.atan2(T.y, T.x) - Math.PI / 2 + 0.6);
    }
    // the shoulder fins, where the neck leaves the water
    const si = Math.round(RINGS * 0.66), s0 = sp[si];
    for (const [k, g] of this.flippers.entries()) {
      const s = k ? 1 : -1;
      g.position.set(s0.x, s0.y, s0.z + s * R[si] * 0.9);
      g.scale.setScalar(this.S);
      g.rotation.set(s * (0.3 + Math.sin(this.t * 2.4) * 0.25), 0, -0.4);
    }
  }

  update(a, env, ctx) {
    const t = (this.t = env.time + (a.seed || 0) * 10);
    const dt = Math.min(0.2, Math.max(0, env.time - (this.lastT ?? env.time - 1 / 60)));
    this.lastT = env.time;
    const S = this.S;
    this.yaw.rotation.y = -(a.facing || 0);
    const act = a.action, kind = act?.def?.seaking;
    let rear = 0, bite = 0, sweep = 0, spit = 0;
    if (act) {
      const w = act.def.windup ?? 0.9, p = act.t < w ? Math.min(1, act.t / w) : 1, post = Math.max(0, act.t - w);
      if (kind === 'sweep') sweep = act.t < w ? -p : Math.min(1, post / 0.3) * (1 - Math.max(0, post - 0.4) / 0.6);
      else if (kind === 'spit') { rear = p * 0.6; spit = act.t < w ? 0 : Math.max(0, 1 - post / 0.8); }
      else if (act.t < w) rear = Math.sin(p * Math.PI * 0.5);
      else bite = Math.max(0, 1 - post / 0.5);
    }
    // eased so it never snaps from one pose to the next
    const ease = (cur, to, k) => cur + (to - cur) * Math.min(1, dt * k);
    this.rear = ease(this.rear, rear, 9); this.bite = ease(this.bite, bite, 18); this.sweep = ease(this.sweep, sweep, 8); this.spit = ease(this.spit, spit, 10);
    this.dive = ease(this.dive, a.submerged ? 1 : 0, 2.5);
    const knocked = a.state === 'knocked' || a.state === 'dead';
    const kt = knocked ? (a.knockT || 0) : 0;
    const sink = -this.dive * 7 * S - (knocked ? Math.min(6 * S, kt * 1.5 * S) : 0);
    // where the head is: rearing back and up, lunging forward and down, swaying while it watches you
    const hx = (0.6 - this.rear * 1.6 + this.bite * 3.2) * S, hy = (4.4 + this.rear * 1.6 - this.bite * 1.8 + Math.sin(t * 1.1) * 0.25) * S;
    this.layout(t, hx, hy, S, sink);
    // the tail sweeping round: the whole coil swung out to one side
    if (this.sweep) for (let i = 0; i < RINGS * 0.62; i++) { const v = i / (RINGS * 0.62); this.spine[i].z += this.sweep * (1 - v) * (1 - v) * 9 * S; }
    this.skin();
    const last = this.spine[RINGS - 1], prev = this.spine[RINGS - 3];
    this.head.position.copy(last);
    this.head.scale.setScalar(S);
    this.head.rotation.set(Math.sin(t * 0.7) * 0.05, 0, Math.atan2(last.y - prev.y, last.x - prev.x) * 0.35 - 0.12 + this.rear * 0.45 - this.bite * 0.55 + this.spit * 0.15);
    this.jaw.rotation.z = -(0.08 + this.rear * 0.55 + this.bite * 0.3 + this.spit * 0.7 + (act ? 0 : Math.max(0, Math.sin(t * 0.6)) * 0.12));
    // knocked out: rolls belly-up as it goes down
    this.bodyG.rotation.x = knocked ? Math.min(2.6, kt * 1.2) : 0;
    this.root.visible = this.dive < 0.97 || knocked;
    // name + health
    const showBar = (a.damageShown > 0 || a.boss) && !a.boss && a.state === 'idle' && !a.hideBar;
    this.label.set(a.showName && a.state === 'idle' ? a.name : null, a.nameColor || '#fff', showBar ? Math.max(0, a.hp / a.d.maxHp) : null, '#ef5350', showBar ? `${Math.max(0, Math.ceil(a.hp))} / ${Math.round(a.d.maxHp)}` : null);
    this.label.sprite.position.set(0, hy + 2.6 * S, 0);
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    const k = Math.min(2.4, Math.max(0.5, dist / 8));
    this.label.sprite.scale.set(2.2 * k, 2.2 * k * 40 / 256, 1);
  }

  dispose() {
    this.label.dispose();
    this.tube.geometry.dispose(); this.line.geometry.dispose(); this.bodyMat.dispose();
    this.root.removeFromParent();
  }
}
