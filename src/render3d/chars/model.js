// A posable 3D anime character: skeleton + one skinned cel-shaded mesh (the
// whole body, hair and hat), its ink outline, the face decal (a shared canvas
// texture per expression) and held weapons. `pose(P, o)` applies a sampled
// 2D-rig pose through the 3D rig; the caller turns the model to its facing.
import * as THREE from 'three';
import { BONES, B, PARENT } from './bones.js';
import { getBody, releaseBody, faceGeo, headLevel } from './build.js';
import { Rig } from './rig.js';
import { bodyMaterial, sharedOutline, glowMaterial } from './mats.js';
import { faceMaterial, releaseFace, expression } from './face.js';
import { HeldWeapon } from './weapons.js';

const IDENT = new THREE.Matrix4();
const ZERO = new THREE.Vector3(0, 0, 0), ONE = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const LIMBS = [B.uarmR, B.farmR, B.uarmL, B.farmL, B.thighR, B.shinR, B.thighL, B.shinL];
const SHAPES = ['fist', 'palm', 'finger'];
// Articulated hands (the first-person view): per hand shape, how far each
// finger bends at the knuckle (a) and the middle joint (b), index…little, in
// radians; how far the fingers fan out (sp) and the thumb closes across (th).
const GRIPS = {
  fist: { a: [1.5, 1.56, 1.6, 1.62], b: [1.72, 1.76, 1.76, 1.7], sp: 0, th: 1 },
  grip: { a: [1.3, 1.38, 1.46, 1.52], b: [1.45, 1.52, 1.56, 1.56], sp: 0, th: 0.85 },
  grab: { a: [0.72, 0.82, 0.9, 0.98], b: [0.95, 1.05, 1.12, 1.15], sp: 0.25, th: 0.65 },
  relaxed: { a: [0.3, 0.4, 0.5, 0.62], b: [0.4, 0.5, 0.6, 0.72], sp: 0.35, th: 0.3 },
  palm: { a: [0.06, 0.08, 0.1, 0.14], b: [0.08, 0.1, 0.13, 0.17], sp: 1, th: 0 },
  flat: { a: [0.04, 0.04, 0.05, 0.06], b: [0.05, 0.05, 0.06, 0.08], sp: 0, th: 0.2 },
  claw: { a: [0.35, 0.3, 0.3, 0.36], b: [1.1, 1.15, 1.15, 1.1], sp: 0.9, th: 0.35 },
  finger: { a: [0.04, 1.5, 1.56, 1.6], b: [0.05, 1.72, 1.76, 1.7], sp: 0, th: 0.9 },
};
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);

export class CharacterModel {
  /**
   * look: the (effective) look; wpn: { kind, count, gun } or null.
   * opts: { viewmodel, outline (material), fog, fingers (articulated hands up close) }
   */
  constructor(look, wpn, opts = {}) {
    this.look = look;
    this.wpn = wpn;
    this.opts = opts;
    this.lod = opts.lod ?? 0;
    this.body = getBody(look, wpn, this.lod, !!opts.fingers);
    this.d = this.body.dims;
    this.rig = new Rig(this.d);
    this.group = new THREE.Group();
    this.group.name = 'char';
    this.bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    for (const n of BONES) (PARENT[n] ? this.bones[B[PARENT[n]]] : this.group).add(this.bones[B[n]]);
    this.skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4()));
    this.mat = bodyMaterial({ fog: opts.fog ?? true });
    this.mesh = new THREE.SkinnedMesh(this.body.geo, this.mat);
    this.mesh.bind(this.skeleton, IDENT);
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.4);
    this.mesh.castShadow = !opts.viewmodel;
    this.outline = new THREE.SkinnedMesh(this.body.geo, opts.outline || sharedOutline());
    this.outline.bind(this.skeleton, IDENT);
    this.outline.boundingSphere = this.mesh.boundingSphere;
    this.group.add(this.mesh, this.outline);
    // attachments' rest offsets
    const d = this.d;
    this.bones[B.hairTail].position.set(d.hx, d.hc, 0);
    this.bones[B.tail].position.set(-0.13 * d.Bk, -0.06, 0);
    this.bones[B.wingR].position.set(-0.11 * d.Bk, d.chestLen * 0.8, 0.05);
    this.bones[B.wingL].position.set(-0.11 * d.Bk, d.chestLen * 0.8, -0.05);
    this.restFingers();
    // face decal on the head
    this.face = new THREE.Mesh(faceGeo(look, headLevel(this.lod)), undefined);
    this.face.position.set(d.hx, d.hc, 0);
    this.face.scale.setScalar(d.headR);
    this.face.renderOrder = 1;
    this.bones[B.head].add(this.face);
    this.faceE = null;
    this.faceKey = '';
    if (this.body.bubble) {
      const bub = new THREE.Mesh(new THREE.SphereGeometry(d.headR * 1.85, 16, 12), new THREE.MeshBasicMaterial({ color: 0xc8ebff, transparent: true, opacity: 0.22, depthWrite: false }));
      bub.position.set(d.hx, d.hc + d.headR * 0.1, 0);
      this.bones[B.head].add(bub);
      this.bubble = bub;
    }
    // held weapons (created on demand)
    this.held = [null, null, null];
    this.heldKey = ['', '', ''];
    this.shape = ['fist', 'fist'];
    this.t = 0;
    this.visibleParts = null;
  }

  /** Put the finger joints where this body's hands have them (articulated hands only). */
  restFingers() {
    const F = this.body.fingers;
    this.fing = null;
    if (!F) return;
    this.fing = [0, 1].map(() => ({ a: [0.3, 0.4, 0.5, 0.6], b: [0.4, 0.5, 0.6, 0.7], sp: 0.35, th: 0.3, lag: 0, prev: new THREE.Vector3(), t: -1 }));
    for (const H of ['R', 'L']) {
      const r = F[H];
      for (let i = 0; i < 4; i++) {
        this.bones[B['k' + (i + 1) + H]].position.set(...r.knuckle[i]);
        this.bones[B['j' + (i + 1) + H]].position.set(0, -r.lp[i], 0);
      }
      this.bones[B['tb' + H]].position.set(...r.thumb);
      this.bones[B['tc' + H]].position.set(0, -r.lt, 0);
    }
  }

  /**
   * Bend the fingers of an articulated hand toward its shape — easing there
   * rather than snapping (fists close fast, hands open slower) — with a little
   * life on top: each finger drifting on its own, and loose fingers lagging
   * as the hand swings.
   */
  poseFingers(k, shape, t) {
    const F = this.fing[k], G = GRIPS[shape] || GRIPS.relaxed;
    const H = k === 0 ? 'R' : 'L', r = this.body.fingers[H], th = r.th, bones = this.bones;
    const first = F.t < 0;
    const dt = first ? 1 : Math.min(0.1, Math.max(0, t - F.t));
    F.t = t;
    // how the hand is moving: toward the palm pushes loose fingers back, away curls them
    const E = this.rig.E[k];
    if (!first && dt > 0) {
      _t1.subVectors(E, F.prev).divideScalar(Math.max(dt, 1e-3));
      _t2.set(-1, 0, 0).applyQuaternion(this.rig.quat[k === 0 ? B.handR : B.handL]);
      const drag = Math.max(-0.45, Math.min(0.45, -_t1.dot(_t2) * 0.09));
      F.lag += (drag - F.lag) * Math.min(1, dt * 9);
    }
    F.prev.copy(E);
    const closing = G.a[1] > F.a[1];
    const ease = Math.min(1, dt * (closing ? 16 : 9));
    const loose = 1 - Math.min(1, G.a[1] / 1.3); // open hands move more than fists
    for (let i = 0; i < 4; i++) {
      const n = Math.sin(t * 1.3 + i * 1.9 + k * 2.3) * 0.6 + Math.sin(t * 0.71 + i * 2.7 + k) * 0.4;
      const life = n * (0.03 + 0.07 * loose) + F.lag * loose * (0.75 + i * 0.12);
      F.a[i] += (G.a[i] + life - F.a[i]) * ease;
      F.b[i] += (G.b[i] + life * 1.25 - F.b[i]) * ease;
      const splay = -th * (1.5 - i) * 0.075 * F.sp;
      bones[B['k' + (i + 1) + H]].quaternion.setFromAxisAngle(AX, splay).multiply(_q.setFromAxisAngle(AZ, -Math.max(-0.25, F.a[i])));
      bones[B['j' + (i + 1) + H]].quaternion.setFromAxisAngle(AZ, -Math.max(-0.1, F.b[i]));
    }
    F.sp += (G.sp - F.sp) * ease;
    F.th += (G.th + Math.sin(t * 0.9 + k) * 0.04 * loose - F.th) * ease;
    // the thumb swings from out beside the index finger to across the curled fingers
    const c = Math.max(0, Math.min(1, F.th));
    _t1.set(-0.22, -0.72, th * 0.66).normalize();
    _t2.set(-0.9, -0.3, -th * 0.32).normalize();
    _t1.lerp(_t2, c).normalize();
    const tb = bones[B['tb' + H]], tc = bones[B['tc' + H]];
    tb.quaternion.setFromUnitVectors(DOWN, _t1);
    // the tip bends in toward the palm
    _t2.set(-1, 0, 0).multiplyScalar(0.25 + c * 0.9).add(_t1).normalize();
    _q2.copy(tb.quaternion).invert();
    tc.quaternion.setFromUnitVectors(DOWN, _t2).premultiply(_q2);
  }

  /** Switch detail level (0 near, 2 mid, 1 far): same skeleton, another shared geometry. */
  setLod(lod) {
    if (lod === this.lod) return;
    const nb = getBody(this.look, this.wpn, lod, !!this.opts.fingers);
    releaseBody(this.body);
    this.body = nb;
    this.lod = lod;
    this.mesh.geometry = nb.geo;
    this.outline.geometry = nb.geo;
    this.restFingers();
    this.face.geometry = faceGeo(this.look, headLevel(lod));
  }

  /** Swap the face texture for this frame's expression. */
  setExpression(X) {
    const key = X.eyes + X.mouth + X.brow + (X.small ? 1 : 0);
    if (key === this.faceKey) return;
    this.faceKey = key;
    const e = faceMaterial(this.look, X);
    releaseFace(this.faceE);
    this.faceE = e;
    this.face.material = e.mat;
  }

  /** Show or hide a bone's geometry (scale 0 hides; children follow). */
  showBone(i, on) { this.bones[i].scale.copy(on ? ONE : ZERO); }

  /**
   * Pose the model. P: a sampled 2D-rig pose. o (see Rig.solve) plus:
   *   dt, time, moving, sprint, armed, wpn, blade/bladeB (energy blade colours),
   *   armament, roll, lift, squash, lying (0..1 knocked-down fall), flow.
   */
  pose(P, o = {}) {
    const d = this.d, rig = this.rig, bones = this.bones;
    const t = o.time || 0;
    // hand shapes
    this.shape[0] = P.hand || 'fist'; this.shape[1] = P.handB || 'fist';
    o.shape = this.shape;
    rig.solve(P, o);
    // hand/weapon grips: armed hands close into fists
    const armed = !!o.armed && !!o.wpn;
    for (let k = 0; k < 2; k++) {
      let s = this.shape[k];
      if (armed && (k === 0 || (o.wpn.kind === 'sword' && (o.wpn.count || 1) >= 2))) s = 'fist';
      if ((k === 0 && o.blade) || (k === 1 && o.bladeB)) s = 'fist';
      if (this.fing) {
        // (the articulated hand is posed once the rig has placed the hand, below)
        if (s === 'fist') s = armed || (k === 0 && o.prop) ? 'grip' : o.relaxHands ? 'relaxed' : 'fist';
        this.shape[k] = s;
        continue;
      }
      if (s === 'claw' || s === 'flat' || s === 'relaxed' || s === 'grab') s = s === 'grab' ? 'fist' : 'palm';
      const H = k === 0 ? 'R' : 'L';
      for (const sh of SHAPES) this.showBone(B[sh + H], sh === s);
    }
    // top-level bones from the rig
    for (const i of [B.hips, B.chest, B.head, B.uarmR, B.farmR, B.handR, B.uarmL, B.farmL, B.handL, B.thighR, B.shinR, B.footR, B.thighL, B.shinL, B.footL]) {
      bones[i].position.copy(rig.pos[i]);
      bones[i].quaternion.copy(rig.quat[i]);
    }
    for (const i of LIMBS) bones[i].scale.set(1, rig.len[i], 1);
    if (this.visibleParts) for (const [i, on] of this.visibleParts) this.showBone(i, on);
    if (this.fing) for (let k = 0; k < 2; k++) this.poseFingers(k, this.shape[k], t);

    // attachments: the coat tail hangs and streams back, hair hangs, tail sways, wings flap
    const lean = (P.l || 0) + (o.leanAdd || 0);
    const flow = o.flow || 0;
    bones[B.coatTail].quaternion.setFromAxisAngle(AZ, lean * 0.85 - flow - 0.04 + Math.sin(t * 2.1) * 0.02);
    _q.copy(rig.qHead).invert();
    bones[B.hairTail].quaternion.slerpQuaternions(_q2.identity(), _q, 0.75)
      .multiply(_q.setFromAxisAngle(AZ, -flow * 0.6 + Math.sin(t * 2.4) * 0.03));
    bones[B.tail].quaternion.setFromAxisAngle(AY, Math.sin(t * 3.2) * 0.35).multiply(_q.setFromAxisAngle(AZ, Math.sin(t * 2.1) * 0.12 - flow * 0.5));
    const lunar = this.look.wings === 'lunar';
    const flap = Math.sin(t * (lunar ? 2.4 : 3.2)) * (lunar ? 0.1 : 0.14) + (o.moving ? 0.12 : 0);
    bones[B.wingR].quaternion.setFromAxisAngle(AY, -0.35 - flap * 0.5).multiply(_q.setFromAxisAngle(AX, -0.25 + flap));
    bones[B.wingL].quaternion.setFromAxisAngle(AY, 0.35 + flap * 0.5).multiply(_q.setFromAxisAngle(AX, 0.25 - flap));

    // weapons: in hand when armed, sheathed otherwise
    const w = o.wpn;
    this.showBone(B.hilts, !(armed && w && (w.kind === 'sword' || w.kind === 'gun')));
    this.showBone(B.backWpn, !(armed && w && (w.kind === 'axe' || w.kind === 'staff')));
    const want0 = o.blade ? 'energy:' + o.blade : armed ? `${w.kind}:main:${w.gun || ''}:${o.armament ? 1 : 0}` : o.prop ? `prop:${o.prop}` : '';
    const want1 = o.bladeB ? 'energy:' + o.bladeB : armed && w.kind === 'sword' && (w.count || 1) >= 2 ? `sword:second::${o.armament ? 1 : 0}` : '';
    const want2 = armed && w.kind === 'sword' && (w.count || 1) >= 3 ? `sword:mouth::${o.armament ? 1 : 0}` : '';
    this.setHeld(0, want0, o);
    this.setHeld(1, want1, o);
    this.setHeld(2, want2, o);
    for (let k = 0; k < 2; k++) {
      const hw = this.held[k];
      if (!hw) continue;
      // grip inside the fist, a little along the fingers
      _v.subVectors(rig.E[k], rig.J[k]).normalize();
      _v2.copy(rig.E[k]).addScaledVector(_v, 0.045);
      if (hw.kind === 'energy') hw.group.scale.setScalar(o.bladeLen || 1);
      hw.place(_v2, rig.blade[k], rig.plane[k]);
    }
    if (this.held[2]) {
      // Santoryu: the third blade in the mouth, held across to the side
      const hw = this.held[2];
      const m = P.m ?? 0.15;
      _v.set(0.18, -Math.sin(m) * 0.3 - 0.1, 1).normalize();
      _v2.set(d.hx + d.headR * 0.9, d.hc - d.headR * 0.55, -d.headR * 0.12);
      _v3.set(0, 1, 0);
      hw.place(_v2, _v, _v3);
      hw.group.position.addScaledVector(_v, -0.12);
    }

    // whole-body transforms: roll (dodge rolls, handstands), airborne height, squash, knock-down
    const g = this.group;
    const roll = (P.r || 0) + (o.roll || 0);
    const pivot = d.hip0 * 0.92;
    g.quaternion.setFromAxisAngle(AZ, -roll);
    g.position.set(0, pivot, 0).applyQuaternion(g.quaternion).negate().add(_v.set(0, pivot, 0));
    g.position.y += (o.lift || 0);
    if (o.sideRoll) {
      _q.setFromAxisAngle(AX, o.sideRoll);
      g.quaternion.premultiply(_q);
      g.position.applyQuaternion(_q);
    }
    if (o.lying) {
      const k = o.lying;
      _q.setFromAxisAngle(AZ, Math.PI / 2 * 0.94 * k);
      g.quaternion.premultiply(_q);
      g.position.applyQuaternion(_q);
      g.position.y += 0.13 * k + (o.bounce || 0);
      g.position.x += 0.1 * k;
    }
    if (o.squash && o.squash !== 1) g.scale.set(1 / Math.sqrt(o.squash), o.squash, 1 / Math.sqrt(o.squash)); else g.scale.set(1, 1, 1);
  }

  setHeld(k, want, o) {
    if (this.heldKey[k] === want) return;
    this.heldKey[k] = want;
    const old = this.held[k];
    if (old) { old.group.parent?.remove(old.group); this.held[k] = null; }
    if (!want) return;
    const [kind, variant, gun, haki] = want.split(':');
    const opts = kind === 'energy' ? { color: variant } : { variant, gun, haki: haki === '1', ...(this.opts.weaponOpts || {}) };
    const hw = new HeldWeapon(kind, opts);
    this.held[k] = hw;
    (k === 2 ? this.bones[B.head] : this.group).add(hw.group);
  }

  /** The body material's effect uniforms (flash, haki, legFx, freeze). */
  get fx() { return this.mat.userData.u; }

  dispose() {
    releaseBody(this.body);
    releaseFace(this.faceE);
    this.mat.dispose();
    if (this.bubble) { this.bubble.geometry.dispose(); this.bubble.material.dispose(); }
    this.skeleton.dispose();
    this.group.removeFromParent();
  }
}

export { expression, glowMaterial };
