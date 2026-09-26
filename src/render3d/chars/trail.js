// Weapon and limb smears in 3D: the clip is re-sampled a few moments into the
// past (like the 2D renderer does), the rig solved for each sample, and a
// ribbon drawn through the blade's sweep (a crescent from the blade's middle
// to its tip, bright at the leading edge and fading behind) — or a tapered
// ribbon behind a striking fist or foot. Only during the swing itself.
import * as THREE from 'three';
import { samplePose } from '../../render/anims.js';
import { Rig } from './rig.js';

const N = 8;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color();

export class Trail {
  constructor() {
    this.pos = new Float32Array(2 * N * 2 * 3);
    this.col = new Float32Array(2 * N * 2 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let r = 0; r < 2; r++) for (let i = 0; i < N - 1; i++) {
      const a = r * N * 2 + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    this.rig = null;
    this.tips = [[], []];
    this.bases = [[], []];
    for (let r = 0; r < 2; r++) for (let i = 0; i < N; i++) { this.tips[r].push(new THREE.Vector3()); this.bases[r].push(new THREE.Vector3()); }
  }

  hide() { this.mesh.visible = false; }

  /** Rebuild the ribbon for this frame (model: CharacterModel, P: this frame's pose). */
  update(model, a, pose, P, o) {
    const A = pose.anim;
    if (!A || A.t <= 0.005 || A.t < (A.trailFrom ?? 0) - 0.005 || A.t > (A.trailTo ?? 99)) { this.hide(); return; }
    if (!this.rig || this.rig.d !== model.d) this.rig = new Rig(model.d);
    const dt = A.trailDt || 0.016;
    const tMin = Math.max(0, (A.trailFrom ?? 0) - 0.02);
    const wk = pose.weapon && pose.weapon.kind;
    const bladed = (pose.armed && (wk === 'sword' || wk === 'axe' || wk === 'staff')) || !!pose.blade;
    const L = pose.blade ? (pose.bladeLen || 1) * 1.05 : wk === 'axe' ? 0.95 : wk === 'staff' ? 0.8 : 1.0;
    const dual = bladed && ((pose.weapon && pose.weapon.count >= 2 && wk === 'sword') || !!pose.bladeB);
    const limb = A.limb;
    let n = 0;
    for (let k = 0; k < N; k++) {
      const t = A.t - k * dt;
      if (t < tMin) break;
      const rig = k === 0 ? model.rig : this.rig.solve(samplePose(A, t, pose), { ...o, shape: null, reachR: null });
      for (let r = 0; r < (dual ? 2 : 1); r++) {
        const E = rig.E[r];
        if (bladed) {
          this.tips[r][k].copy(E).addScaledVector(rig.blade[r], L + 0.08);
          this.bases[r][k].copy(E).addScaledVector(rig.blade[r], L * 0.32);
        } else {
          const p = limb === 'fF' ? rig.F[0] : limb === 'fB' ? rig.F[1] : limb === 'hB' ? rig.E[1] : limb === 'head' ? rig.headC : rig.E[0];
          this.tips[r][k].copy(p);
        }
      }
      n++;
    }
    if (n < 3) { this.hide(); return; }
    const rows = dual ? 2 : 1;
    // did it actually sweep?
    const moved = this.tips[0][0].distanceTo(this.tips[0][n - 1]);
    if (moved < (bladed ? 0.3 : 0.25)) { this.hide(); return; }
    const col = (pose.fx && (pose.fx.trail || pose.fx.color)) || '#ffffff';
    _c.set(col);
    this.mat.blending = pose.fx && pose.fx.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    const P3 = this.pos, C4 = this.col;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < N; i++) {
        const j = Math.min(i, n - 1);
        const u = j / (n - 1);
        const vi = (r * N * 2 + i * 2);
        const tip = this.tips[Math.min(r, rows - 1)][j];
        let inner;
        if (bladed) {
          // crescent: the inner edge closes onto the tip toward the tail
          inner = _v.copy(this.bases[Math.min(r, rows - 1)][j]).lerp(tip, Math.pow(u, 0.75) * 0.9);
        } else {
          // tapered ribbon across the motion (vertical-ish)
          const nx = this.tips[0][Math.min(n - 1, j + 1)];
          _w.subVectors(tip, nx);
          const up = _v.set(0, 1, 0).addScaledVector(_w.normalize(), -_w.y).normalize();
          inner = up.multiplyScalar(-0.13 * (1 - u)).add(tip);
          tip.addScaledVector(up, 0);
        }
        P3.set([tip.x, tip.y, tip.z], vi * 3);
        P3.set([inner.x, inner.y, inner.z], (vi + 1) * 3);
        const lead = (1 - u) * (1 - u);
        const aT = (bladed ? 0.95 : 0.8) * (1 - u), aI = (bladed ? 0.35 : 0.5) * (1 - u) * (1 - u);
        const wr = _c.r + (1 - _c.r) * lead, wg = _c.g + (1 - _c.g) * lead, wb = _c.b + (1 - _c.b) * lead;
        C4.set([wr, wg, wb, r >= rows ? 0 : aT], vi * 4);
        C4.set([_c.r, _c.g, _c.b, r >= rows ? 0 : aI], (vi + 1) * 4);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
