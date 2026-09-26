// A posable 3D anime character: skeleton + one skinned cel-shaded mesh (the
// whole body, hair and hat), its ink outline, the face decal (a shared canvas
// texture per expression) and held weapons. `pose(P, o)` applies a sampled
// 2D-rig pose through the 3D rig; the caller turns the model to its facing.
import * as THREE from 'three';
import { BONES, B, PARENT } from './bones.js';
import { getBody, releaseBody, faceGeo } from './build.js';
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

export class CharacterModel {
  /**
   * look: the (effective) look; wpn: { kind, count, gun } or null.
   * opts: { viewmodel, outline (material), fog }
   */
  constructor(look, wpn, opts = {}) {
    this.look = look;
    this.wpn = wpn;
    this.opts = opts;
    this.lod = opts.lod ?? 0;
    this.body = getBody(look, wpn, this.lod);
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
    // face decal on the head
    this.face = new THREE.Mesh(faceGeo(look, this.lod === 0 ? 'near' : 'far'), undefined);
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

  /** Switch detail level (near / far): same skeleton, another shared geometry. */
  setLod(lod) {
    if (lod === this.lod) return;
    const nb = getBody(this.look, this.wpn, lod);
    releaseBody(this.body);
    this.body = nb;
    this.lod = lod;
    this.mesh.geometry = nb.geo;
    this.outline.geometry = nb.geo;
    this.face.geometry = faceGeo(this.look, lod === 0 ? 'near' : 'far');
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
      if (s === 'claw' || s === 'flat') s = 'palm';
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
