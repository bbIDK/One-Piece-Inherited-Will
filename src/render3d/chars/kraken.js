// The Kraken in 3D (game/kraken.js), the way the anime draws its giant
// octopuses: a great rounded head-mantle half out of the sea, two huge
// glaring eyes with bar pupils under heavy brows, and eight long arms —
// thick at the root, tapering to a whip, pale and suckered underneath —
// rising out of the water round it. The idle ones loll and coil in the swell;
// one sent at you rears up high over the deck, hangs there, and comes down
// like a falling mast; the ones holding a ship arch over her gunwale and
// cling to the deck. Every arm is one smooth tube bent along a curve that
// eases from pose to pose, so nothing snaps.
import * as THREE from 'three';
import { toon, addOutline, outlineMaterial, toonGradient } from '../materials.js';
import { mixHex } from '../../core/math.js';
import { Label } from './fx.js';

const SPH = new THREE.SphereGeometry(1, 20, 14);
const RINGS = 26, SIDES = 11;

function part(geo, mat, s, p, parent, outline = 0.05, r = null) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(...s);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  m.castShadow = true;
  if (outline) addOutline(m, outline);
  parent.add(m);
  return m;
}

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
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

const _T = new THREE.Vector3(), _U = new THREE.Vector3(), _S = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ease = (cur, to, k, dt) => cur + (to - cur) * Math.min(1, dt * k);

export class KrakenView {
  constructor(a) {
    this.a = a;
    const col = a.bodyColor || '#b0413e';
    this.cTop = new THREE.Color(mixHex(col, '#000000', 0.1));
    this.cSide = new THREE.Color(col);
    this.cUnder = new THREE.Color(mixHex(col, '#ffe0d6', 0.68));
    this.cSucker = new THREE.Color(mixHex(col, '#ffe0d6', 0.45));
    this.S = Math.min(2.2, 1 + Math.max(0, (a.level || 40) - 40) / 50) * (a.boss ? 1.2 : 1);
    this.root = new THREE.Group();
    // the arms (each a tube and its ink line), and the curve each follows
    this.armMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    this.lineMat = outlineMaterial();
    this.arms = [];
    for (let i = 0; i < 8; i++) {
      const tube = tubeMesh(this.armMat), line = tubeMesh(this.lineMat);
      tube.castShadow = true;
      this.root.add(tube, line);
      this.arms.push({ tube, line, pts: Array.from({ length: RINGS }, () => new THREE.Vector3()), tip: new THREE.Vector3(), mid: new THREE.Vector3(), init: false, seed: i * 1.7 });
    }
    // the mantle: the great bulb of a head, the eyes and brows, a siphon at the side
    this.mantle = new THREE.Group();
    this.root.add(this.mantle);
    const body = toon(col), dark = toon(mixHex(col, '#000000', 0.35)), pale = toon(mixHex(col, '#ffe0d6', 0.55));
    const white = toon('#f6efd8'), black = toon('#140c0c'), gold = toon('#f2c230');
    this.mats = [body, dark, pale, white, black, gold];
    part(SPH, body, [1.75, 2.3, 1.65], [-0.35, 2.0, 0], this.mantle, 0.09, [0, 0, 0.32]);
    part(SPH, body, [1.6, 1.05, 1.7], [0.15, 0.55, 0], this.mantle, 0.07);
    // (blotches on the mantle)
    for (let i = 0; i < 7; i++) {
      const th = i * 2.1, ph = 0.6 + (i % 3) * 0.45;
      part(SPH, dark, [0.32, 0.22, 0.3], [-0.35 + Math.cos(th) * Math.sin(ph) * 1.55, 2.0 + Math.cos(ph) * 2.05, Math.sin(th) * Math.sin(ph) * 1.5], this.mantle, 0);
    }
    for (const s of [-1, 1]) {
      // the eyes: big, round, gold-rimmed, a black bar of a pupil
      part(SPH, gold, [0.62, 0.58, 0.45], [1.25, 1.05, s * 0.88], this.mantle, 0.05);
      part(SPH, white, [0.5, 0.48, 0.4], [1.42, 1.05, s * 0.93], this.mantle, 0);
      part(SPH, black, [0.1, 0.16, 0.42], [1.73, 1.04, s * 0.96], this.mantle, 0, [0, 0, 0]);
      // brows, heavy and scowling
      part(SPH, dark, [0.8, 0.22, 0.48], [1.2, 1.62, s * 0.86], this.mantle, 0.04, [s * 0.25, 0, -0.35]);
    }
    part(SPH, pale, [0.38, 0.3, 0.3], [0.2, 0.7, 1.55], this.mantle, 0.04); // the siphon
    this.mantle.scale.setScalar(this.S);
    this.label = new Label();
    this.root.add(this.label.sprite);
    this.sink = 0;
    this.lastT = null;
  }

  /** The curve an arm follows: from its root under the mantle, through `mid`, to `tip` (local). */
  bend(arm, base, dt, t) {
    const P = arm.pts, m = arm.mid, tip = arm.tip;
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1), v = 1 - u;
      // a quadratic through the root, the bend and the tip, with a ripple running down it
      P[i].set(v * v * base.x + 2 * u * v * m.x + u * u * tip.x, v * v * base.y + 2 * u * v * m.y + u * u * tip.y, v * v * base.z + 2 * u * v * m.z + u * u * tip.z);
      const w = Math.sin(t * 2.2 - u * 7 + arm.seed) * 0.18 * u * this.S;
      P[i].x += w * Math.cos(arm.seed); P[i].z += w * Math.sin(arm.seed);
    }
    // the very tip curls
    const c = (0.6 + 0.4 * Math.sin(t * 1.6 + arm.seed)) * 0.9 * this.S;
    const ox = P[RINGS - 1].x - P[0].x, oz = P[RINGS - 1].z - P[0].z, ol = Math.hypot(ox, oz) || 1;
    for (let i = RINGS - 7; i < RINGS; i++) {
      const k = (i - (RINGS - 7)) / 6;
      // (curling back over itself, the way an octopus's arm-tip rolls up)
      P[i].x -= (ox / ol) * c * k * k * 1.2; P[i].z -= (oz / ol) * c * k * k * 1.2; P[i].y += c * Math.sin(k * Math.PI) * 0.8;
    }
  }

  skin(arm) {
    const P = arm.pts, S = this.S;
    const pos = arm.tube.geometry.attributes.position.array, nor = arm.tube.geometry.attributes.normal.array, colA = arm.tube.geometry.attributes.color.array;
    const lp = arm.line.geometry.attributes.position.array;
    const line = 0.06 * S;
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1);
      const r = S * (0.78 * Math.pow(1 - u, 1.15) + 0.06);
      _T.subVectors(P[Math.min(RINGS - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
      _U.copy(UP).addScaledVector(_T, -UP.dot(_T));
      if (_U.lengthSq() < 1e-4) _U.set(1, 0, 0);
      _U.normalize();
      _S.crossVectors(_T, _U).normalize();
      for (let j = 0; j <= SIDES; j++) {
        const th = (j / SIDES) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        _n.copy(_U).multiplyScalar(c).addScaledVector(_S, s);
        const k = (i * (SIDES + 1) + j) * 3;
        pos[k] = P[i].x + _n.x * r; pos[k + 1] = P[i].y + _n.y * r; pos[k + 2] = P[i].z + _n.z * r;
        lp[k] = P[i].x + _n.x * (r + line); lp[k + 1] = P[i].y + _n.y * (r + line); lp[k + 2] = P[i].z + _n.z * (r + line);
        nor[k] = _n.x; nor[k + 1] = _n.y; nor[k + 2] = _n.z;
        // underneath: pale, with rows of suckers; on top: the dark of its back
        if (c < -0.35) _c.copy(((i + (j >> 1)) & 1) && c < -0.7 ? this.cSucker : this.cUnder);
        else _c.copy(c > 0.5 ? this.cTop : this.cSide);
        colA[k] = _c.r; colA[k + 1] = _c.g; colA[k + 2] = _c.b;
      }
    }
    for (const m of [arm.tube, arm.line]) {
      const g = m.geometry;
      g.attributes.position.needsUpdate = true;
      if (m === arm.tube) { g.attributes.normal.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    }
  }

  update(a, env, ctx) {
    const t = env.time + (a.seed || 0) * 10;
    const dt = Math.min(0.2, Math.max(0, env.time - (this.lastT ?? env.time - 1 / 60)));
    this.lastT = env.time;
    const S = this.S, w = a.game?.world;
    const knocked = a.state === 'knocked' || a.state === 'dead';
    this.sink = ease(this.sink, a.submerged ? 1 : 0, 1.5, dt);
    const down = this.sink * 6 * S + (knocked ? Math.min(7 * S, (a.knockT || 0) * 1.6 * S) : 0);
    const rootY = this.root.position.y;
    // the mantle: bobbing in the swell, turned to glare at you
    this.mantle.position.y = -0.6 * S + Math.sin(t * 0.9) * 0.18 * S - down;
    this.mantle.rotation.y = -(a.facing || 0);
    this.mantle.rotation.z = Math.sin(t * 0.6) * 0.04;
    const L = 9.5 * S;
    for (const [i, arm] of a.arms.entries()) {
      const A = this.arms[i];
      if (!A) continue;
      const ang = arm.a ?? (i / 8) * Math.PI * 2;
      const base = new THREE.Vector3(Math.cos(ang) * 1.2 * S, -0.5 * S - down, Math.sin(ang) * 1.2 * S);
      const tip = new THREE.Vector3(), mid = new THREE.Vector3();
      let k = 3;
      if (arm.mode !== 'idle' && w && !knocked) {
        const lx = w.dx(a.x, arm.x), lz = arm.y - a.y, ly = (arm.h || 0) - rootY;
        if (arm.mode === 'slam') {
          const p = Math.min(1, arm.t / (arm.strikeT || 1));
          if (arm.t < arm.strikeT) {
            // reared up over its target, pulling back as it winds up
            const back = 0.2 + 0.25 * p;
            tip.set(lx * (1 - back), ly + L * (0.45 + 0.2 * p), lz * (1 - back));
            mid.set(lx * 0.3, ly + L * (0.75 + 0.15 * p), lz * 0.3);
            k = 4;
          } else {
            // down on it
            tip.set(lx, ly + 0.25, lz);
            mid.set(lx * 0.45, ly + L * 0.38, lz * 0.45);
            k = 16;
          }
        } else {
          // gripping: arched over the gunwale and laid along the deck
          tip.set(lx, ly + 0.3 + Math.sin(t * 3 + i) * 0.1, lz);
          mid.set(lx * 0.5, Math.max(ly + 2.2 * S, 2.5 * S), lz * 0.5);
          k = 5;
        }
      } else {
        // idle: lolling in the swell round it, a loop or a curl breaking the surface
        const reach = L * (0.7 + 0.15 * Math.sin(t * 0.5 + i * 2.3));
        const sway = Math.sin(t * 0.7 + i * 1.3) * 0.35;
        const lift = (i % 3 === 0 ? 1.0 : i % 3 === 1 ? 0.5 : 0.12) * (1 + 0.3 * Math.sin(t * 0.8 + i));
        // (the high ones stand up out of the sea in an S, tip curled over; the low ones loop along the surface)
        const r2 = lift > 0.7 ? reach * 0.6 : reach;
        tip.set(Math.cos(ang + sway) * r2, -0.8 * S + lift * L * 0.62 - down, Math.sin(ang + sway) * r2);
        mid.set(Math.cos(ang + sway * 0.5) * r2 * 0.75, lift * L * 0.28 - down, Math.sin(ang + sway * 0.5) * r2 * 0.75);
        if (knocked) { tip.y -= 3 * S; mid.y -= 2 * S; }
      }
      if (!A.init) { A.tip.copy(tip); A.mid.copy(mid); A.init = true; }
      A.tip.x = ease(A.tip.x, tip.x, k, dt); A.tip.y = ease(A.tip.y, tip.y, k, dt); A.tip.z = ease(A.tip.z, tip.z, k, dt);
      A.mid.x = ease(A.mid.x, mid.x, k * 0.8, dt); A.mid.y = ease(A.mid.y, mid.y, k * 0.8, dt); A.mid.z = ease(A.mid.z, mid.z, k * 0.8, dt);
      this.bend(A, base, dt, t);
      this.skin(A);
    }
    this.root.visible = this.sink < 0.97;
    const showBar = a.damageShown > 0 && a.state === 'idle' && !a.hideBar;
    this.label.set(a.showName && a.state === 'idle' ? a.name : null, a.nameColor || '#fff', showBar ? Math.max(0, a.hp / a.d.maxHp) : null, '#ef5350', showBar ? `${Math.max(0, Math.ceil(a.hp))} / ${Math.round(a.d.maxHp)}` : null);
    this.label.sprite.position.set(0, 5.4 * S - down, 0);
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    const ks = Math.min(2.4, Math.max(0.5, dist / 8));
    this.label.sprite.scale.set(2.2 * ks, 2.2 * ks * 40 / 256, 1);
  }

  dispose() {
    this.label.dispose();
    for (const A of this.arms) { A.tube.geometry.dispose(); A.line.geometry.dispose(); }
    this.armMat.dispose();
    this.root.removeFromParent();
  }
}
