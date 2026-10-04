// A posable 3D anime character: skeleton + one skinned cel-shaded mesh (the
// whole body, hair and hat), its ink outline, the face decal (a shared canvas
// texture per expression) and held weapons. `pose(P, o)` applies a sampled
// 2D-rig pose through the 3D rig; the caller turns the model to its facing.
import * as THREE from 'three';
import { BONES, B, PARENT, restOffsets, SKIRT_N, skirtWaist, COAT_N, RUB, RUBL } from './bones.js';
import { getBody, releaseBody, faceGeo, headLevel } from './build.js';
import { Rig } from './rig.js';
import { bodyMaterial, sharedOutline, glowMaterial, senseMaterial, SELF_SHADE, SELF_SHADE_VM } from './mats.js';
import { faceMaterial, releaseFace, expression } from './face.js';
import { HeldWeapon } from './weapons.js';

const IDENT = new THREE.Matrix4();
const ZERO = new THREE.Vector3(0, 0, 0), ONE = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const LIMBS = [B.uarmR, B.farmR, B.uarmL, B.farmL, B.thighR, B.shinR, B.thighL, B.shinL];
// the bones the rig places in the model's own space each frame
const POSED = [B.hips, B.chest, B.head, B.uarmR, B.farmR, B.handR, B.uarmL, B.farmL, B.handL, B.thighR, B.shinR, B.footR, B.thighL, B.shinL, B.footL, ...RUB[0], ...RUB[1], ...RUBL[0], ...RUBL[1]];
/** A rubber limb's motion between frames (see CharacterModel.rubberMotion). */
const rubberState = () => ({ amp: 0, ph: 0, sag: 0.02, k: 2.5, tilt: 0, len: 0, v: 0, dir: new THREE.Vector3(), prev: new THREE.Vector3(), has: false });
const SHAPES = ['fist', 'palm', 'finger'];
// Articulated hands (the first-person view): per hand shape, how far each
// finger bends at the knuckle (a) and the middle joint (b), index…little, in
// radians; how far the fingers fan out (sp) and the thumb closes across (th).
const GRIPS = {
  fist: { a: [1.5, 1.56, 1.6, 1.62], b: [1.72, 1.76, 1.76, 1.7], sp: 0, th: 1 },
  grip: { a: [1.3, 1.38, 1.46, 1.52], b: [1.45, 1.52, 1.56, 1.56], sp: 0, th: 0.85 },
  grab: { a: [0.72, 0.82, 0.9, 0.98], b: [0.95, 1.05, 1.12, 1.15], sp: 0.25, th: 0.65 },
  hold: { a: [0.34, 0.4, 0.46, 0.52], b: [0.5, 0.56, 0.62, 0.68], sp: 0.35, th: 0.25 },
  eat: { a: [0.5, 0.56, 0.62, 0.68], b: [0.62, 0.68, 0.74, 0.8], sp: 0.2, th: 0.45 },
  relaxed: { a: [0.3, 0.4, 0.5, 0.62], b: [0.4, 0.5, 0.6, 0.72], sp: 0.35, th: 0.3 },
  palm: { a: [0.06, 0.08, 0.1, 0.14], b: [0.08, 0.1, 0.13, 0.17], sp: 1, th: 0 },
  flat: { a: [0.04, 0.04, 0.05, 0.06], b: [0.05, 0.05, 0.06, 0.08], sp: 0, th: 0.2 },
  claw: { a: [0.35, 0.3, 0.3, 0.36], b: [1.1, 1.15, 1.15, 1.1], sp: 0.9, th: 0.35 },
  finger: { a: [0.04, 1.5, 1.56, 1.6], b: [0.05, 1.72, 1.76, 1.7], sp: 0, th: 0.9 },
};
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
const _dr = Array.from({ length: 8 }, () => new THREE.Vector3());
const smooth = (x) => x * x * (3 - 2 * x);
const TAU = Math.PI * 2;
// a skirt's panels: the legs (hip joint, knee, ankle), the points down them it
// must clear (thigh, then shin), and how far each panel reaches round
const LEG3 = [[B.thighR, B.shinR, B.footR], [B.thighL, B.shinL, B.footL]];
const SKIRT_T = [0.4, 0.7, 1.0, 0.35, 0.7, 1.0];
const SKIRT_REACH = Math.PI / SKIRT_N * 2, SKIRT_FADE = 0.35;
const _sq = new THREE.Quaternion(), _sax = new THREE.Vector3();
const _spts = Array.from({ length: SKIRT_T.length * 2 }, () => new THREE.Vector3());
const _srad = new Float32Array(SKIRT_T.length * 2), _sleg = new Uint8Array(SKIRT_T.length * 2);
/**
 * How far out from the vertical (radians) a panel hanging from a pivot must
 * swing for a leg point `u` out from the pivot and `h` below it, `r` thick,
 * to be inside the cloth — for a panel `len` long, facing `a` (the point at
 * `psi` round the waist: panels further round it than their neighbours
 * care less, and not at all beyond).
 */
function panelNeed(u, h, r, len, psi, a, reach = SKIRT_REACH) {
  let da = Math.abs(psi - a) % TAU;
  if (da > Math.PI) da = TAU - da;
  if (da > reach + SKIRT_FADE || h < -0.05 || h > len + 0.05) return -1;
  const fade = da <= reach ? 1 : 1 - (da - reach) / SKIRT_FADE;
  const R = Math.hypot(u, h);
  // (u·cos φ − h·sin φ ≤ −r: the point at least r inside the panel's line)
  const phi = R <= r ? 1.75 : Math.acos(Math.max(-1, -r / R)) - Math.atan2(h, u);
  return phi * fade;
}

// a coat's tail (coatPanels): gravity's pull on a panel, the wind of moving on
// it (per m/s), how quickly its swing dies (upper, lower), how hard each
// panel pulls its neighbours along (so the tail holds together), and how far
// out it may swing (radians) — the feel of the cloth
export const COAT_FEEL = { g: 9.8, wind: 1.05, damp: 3.2, damp2: 2.6, link: 5, max: 1.15, max2: 1.4, smooth: 0.09 };
const _cv = new THREE.Vector3(), _cv2 = new THREE.Vector3(), _cv3 = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion(), _cm = new THREE.Matrix4(), _cax = new THREE.Vector3();
const _cpts = Array.from({ length: SKIRT_T.length * 2 }, () => new THREE.Vector3());
const _crad = new Float32Array(SKIRT_T.length * 2), _cleg = new Uint8Array(SKIRT_T.length * 2);

// ------------------------------------------------------------------ hair and cloth that swing
// Long hair and a coat's tail are each a weight on a spring at the end of
// their bone, moving in the world: they lag when you set off, swing on when
// you stop or turn, stream back in the wind of a run and settle hanging when
// you stand. Swings are kept off the body (hair doesn't swing into the head,
// a coat tail not forward into the legs).
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _d3 = new THREE.Vector3(), _d4 = new THREE.Vector3(), _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion();
class Dangle {
  /** bone; len (metres); rest: the direction it hangs in its parent's frame; o: { K spring, g gravity, drag, damp, fwd/back/side limits (radians) } */
  constructor(bone, len, rest, o) {
    this.bone = bone; this.len = len; this.rest = rest.clone().normalize(); this.o = o;
    this.tip = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.piv = new THREE.Vector3(); this.on = false;
    this.rp = Math.atan2(this.rest.x, -this.rest.y); this.rr = Math.atan2(this.rest.z, -this.rest.y);
  }
  step(dt) {
    const o = this.o, b = this.bone, pw = b.parent.matrixWorld;
    const piv = _d1.copy(b.position).applyMatrix4(pw);
    const sc = _d4.setFromMatrixScale(pw).y;
    const L = this.len * sc;
    _dm.extractRotation(pw);
    const restW = _d2.copy(this.rest).applyMatrix4(_dm).normalize();
    if (!this.on || dt > 0.3 || piv.distanceToSquared(this.piv) > 2.25) {
      // first frame, a long gap or a jump (the world's origin moving): hang at rest
      this.tip.copy(piv).addScaledVector(restW, L); this.vel.set(0, 0, 0); this.piv.copy(piv); this.on = true;
    } else if (dt > 0) {
      // the wind of moving: air pushes the tip back against the pivot's motion
      const pv = _d3.subVectors(piv, this.piv).divideScalar(Math.max(dt, 1e-3));
      this.piv.copy(piv);
      const acc = _d4.copy(piv).addScaledVector(restW, L).sub(this.tip).multiplyScalar(o.K);
      acc.y -= 9.8 * o.g;
      acc.addScaledVector(pv, -o.drag);
      this.vel.multiplyScalar(Math.exp(-o.damp * dt)).addScaledVector(acc, dt);
      this.tip.addScaledVector(this.vel, dt);
    }
    // keep its length, and its swing off the body (limits in the parent's frame)
    const dir = _d3.subVectors(this.tip, piv).normalize();
    _dq.setFromRotationMatrix(_dm).invert();
    dir.applyQuaternion(_dq);
    let pitch = Math.atan2(dir.x, -dir.y), roll = Math.atan2(dir.z, -dir.y);
    pitch = Math.max(this.rp - o.back, Math.min(this.rp + o.fwd, pitch));
    roll = Math.max(this.rr - o.side, Math.min(this.rr + o.side, roll));
    dir.set(Math.tan(Math.max(-1.35, Math.min(1.35, pitch))), -1, Math.tan(Math.max(-1.35, Math.min(1.35, roll)))).normalize();
    b.quaternion.setFromUnitVectors(this.rest, dir);
    this.tip.copy(dir).applyMatrix4(_dm).multiplyScalar(L).add(piv);
  }
}

/**
 * How far to lift a body so its soles meet the ground: the lowest point of
 * whatever's on its feet, below the ankle (measured on the geometry, in the
 * rest pose), less the ankle's height when standing (dims.hA). Cached with
 * the body.
 */
function soleLift(body, d) {
  if (body.soleLift !== undefined) return body.soleLift;
  const geo = body.geo, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) {
    let best = -1, bw = 0;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    if (best === B.footR || best === B.footL) min = Math.min(min, pos.getY(i));
  }
  // (the ankle at rest: the legs hang straight from the hip joints)
  const ankle = d.hip0 - 0.07 - d.T1 - d.T2;
  body.soleLift = Number.isFinite(min) ? Math.max(-0.03, Math.min(0.06, ankle - min - d.hA)) : 0;
  return body.soleLift;
}

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
    // (the whole body is lifted by however far its soles — a boot's, a geta's
    // teeth, bare toes — reach below the ankle height the legs stand on, so
    // they rest on a floor or a deck instead of sinking into it)
    this.soleLift = soleLift(this.body, this.d);
    this.rig = new Rig(this.d);
    this.rig.tA = this.body.rubTA || [0, 0];
    // (each rubber limb's ripple and slack, carried from frame to frame)
    this.rub = [rubberState(), rubberState()];
    this.rubL = [rubberState(), rubberState()];
    this.group = new THREE.Group();
    this.group.name = 'char';
    this.bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    for (const n of BONES) (PARENT[n] ? this.bones[B[PARENT[n]]] : this.group).add(this.bones[B[n]]);
    // (inverse bind matrices: the geometry is stored in the rest pose — see bones.js bindPose)
    this.skeleton = new THREE.Skeleton(this.bones, this.body.inv.map((m) => m.clone()));
    // (a figure twice the size ignores twice as much of its own shade: one step, so
    // there's only the one extra shader)
    this.mat = bodyMaterial({ fog: opts.fog ?? true, self: opts.viewmodel ? SELF_SHADE_VM : SELF_SHADE * ((look?.scale || 1) >= 1.5 ? 2 : 1) });
    this.mesh = new THREE.SkinnedMesh(this.body.geo, this.mat);
    this.mesh.bind(this.skeleton, IDENT);
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.4);
    this.mesh.castShadow = !opts.viewmodel;
    // (in a wall's or a sail's shade, a figure is in shade too: see SELF_SHADE)
    this.mesh.receiveShadow = true;
    this.outline = new THREE.SkinnedMesh(this.body.geo, opts.outline || sharedOutline());
    this.outline.bind(this.skeleton, IDENT);
    this.outline.boundingSphere = this.mesh.boundingSphere;
    this.group.add(this.mesh, this.outline);
    // attachments' rest offsets
    const d = this.d;
    const R = restOffsets(d);
    for (const n of ['hairTail', 'tail', 'wingR', 'wingL']) this.bones[B[n]].position.set(...R[n]);
    for (let i = 0; i < SKIRT_N; i++) { this.bones[B['skirt' + i]].position.set(...R['skirt' + i]); this.bones[B['skirtK' + i]].position.set(...R['skirtK' + i]); }
    for (let i = 0; i < COAT_N; i++) { this.bones[B['coat' + i]].position.set(...R['coat' + i]); this.bones[B['coatK' + i]].position.set(...R['coatK' + i]); }
    this.restFingers();
    // face decal on the head
    this.face = new THREE.Mesh(faceGeo(look, headLevel(this.lod)), undefined);
    this.face.receiveShadow = true;
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

  /**
   * Whether the sun's shadows fall on the figure, and on what it holds: not
   * indoors, where rooms are lit without them (interiors3d.js) and the roof
   * would leave only the people in the room in the dark.
   */
  setShaded(on) {
    this.group.traverse((o) => { if (o.isMesh) o.receiveShadow = on; });
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
    for (let i = 0; i < nb.inv.length; i++) this.skeleton.boneInverses[i].copy(nb.inv[i]);
    this.rig.tA = nb.rubTA || [0, 0];
    this.restFingers();
    this.face.geometry = faceGeo(this.look, headLevel(lod));
    this.dangles = null;
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

  /** The swinging parts this body has (long hair, a coat's tail). */
  makeDangles() {
    const u = this.body.used || new Set(), d = this.d, out = [];
    if (u.has(B.hairTail)) out.push(new Dangle(this.bones[B.hairTail], d.headR * 2.2, new THREE.Vector3(-0.35, -1, 0), { K: 70, g: 0.55, drag: 0.32, damp: 5, fwd: 0.12, back: 1.0, side: 0.45 }));
    if (u.has(B.coatTail)) out.push(new Dangle(this.bones[B.coatTail], 0.62 * d.Lg, new THREE.Vector3(-0.03, -1, 0), { K: 45, g: 0.45, drag: 0.45, damp: 4, fwd: 0.05, back: 1.1, side: 0.3 }));
    return out;
  }

  /** Swing the long hair and the coat's tail (after the model and its root are posed for the frame). */
  swing(dt, root) {
    const D = this.dangles || (this.dangles = this.makeDangles());
    if (!D.length && !this.body.coat) return;
    root.updateMatrixWorld(true);
    for (const s of D) s.step(dt);
    if (this.body.coat) this.coatSwing(dt);
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
    o.drawBlade = null; o.drawHold2 = true;
    if (o.draw && o.wpn) this.drawPath(P, o);
    o.rub = this.rub; o.rubL = this.rubL;
    rig.solve(P, o);
    // (how long since the last pose: the rubber's ripple and slack run on it)
    const rdt = this.poseT === undefined ? 0 : Math.max(0, Math.min(0.1, t - this.poseT));
    this.poseT = t;
    this.rubberMotion(rdt);
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
      if (s === 'claw' || s === 'flat' || s === 'relaxed' || s === 'grab' || s === 'hold' || s === 'eat') s = s === 'grab' || s === 'hold' || s === 'eat' ? 'fist' : 'palm';
      const H = k === 0 ? 'R' : 'L';
      for (const sh of SHAPES) this.showBone(B[sh + H], sh === s);
    }
    // top-level bones from the rig
    for (const i of POSED) {
      bones[i].position.copy(rig.pos[i]);
      bones[i].quaternion.copy(rig.quat[i]);
    }
    for (const i of LIMBS) bones[i].scale.set(1, rig.len[i], 1);
    // the rubber chains: stretched along with the forearm (or shin) at rest, their own length when it runs out
    for (let k = 0; k < 2; k++) {
      // (Gear Third: an arm blown up like a balloon, the fist huge)
      // (o.infR: a giant fist still out on its rubber keeps the arm blown up till it's home;
      // o.infR / o.infL: a punch thrown in Gear Third — chars/forms.js)
      const inf = Math.max((k === 0 ? P.inF : P.inB) || 0, (k === 0 ? o.infR : o.infL) || 0), g = 1 + 1.6 * inf;
      for (const i of RUB[k]) bones[i].scale.set(g, rig.rubSY[k], g);
      for (const i of RUBL[k]) bones[i].scale.set(1, rig.rubSYL[k], 1);
      if (inf > 0) {
        const U = k === 0 ? B.uarmR : B.uarmL, F = k === 0 ? B.farmR : B.farmL;
        bones[U].scale.set(1 + 0.9 * inf, rig.len[U], 1 + 0.9 * inf);
        bones[F].scale.set(g, rig.len[F], g);
        bones[k === 0 ? B.handR : B.handL].scale.setScalar(1 + 3.4 * inf);
      } else bones[k === 0 ? B.handR : B.handL].scale.setScalar(1);
    }
    if (this.body.skirt) this.skirtPanels(o.dt);
    if (this.body.coat) this.coatPanels(o.dt);
    if (this.visibleParts) for (const [i, on] of this.visibleParts) this.showBone(i, on);
    if (this.fing) for (let k = 0; k < 2; k++) this.poseFingers(k, this.shape[k], t);

    // attachments: the coat tail hangs and streams back, hair hangs, tail sways, wings flap
    const lean = (P.l || 0) + (o.leanAdd || 0);
    const flow = o.flow || 0;
    if (!this.dangles || !this.dangles.length) {
      bones[B.coatTail].quaternion.setFromAxisAngle(AZ, lean * 0.85 - flow - 0.04 + Math.sin(t * 2.1) * 0.02);
      _q.copy(rig.qHead).invert();
      bones[B.hairTail].quaternion.slerpQuaternions(_q2.identity(), _q, 0.75)
        .multiply(_q.setFromAxisAngle(AZ, -flow * 0.6 + Math.sin(t * 2.4) * 0.03));
    }
    bones[B.tail].quaternion.setFromAxisAngle(AY, Math.sin(t * 3.2) * 0.35).multiply(_q.setFromAxisAngle(AZ, Math.sin(t * 2.1) * 0.12 - flow * 0.5));
    this.poseWings(P, o, t);

    // weapons: in hand when armed, sheathed otherwise
    const w = o.wpn;
    this.showBone(B.hilts, !(armed && w && (w.kind === 'sword' || w.kind === 'gun')));
    this.showBone(B.backWpn, !(armed && w && (w.kind === 'axe' || w.kind === 'staff' || w.kind === 'sword')));
    // (each sword its own model: which one is in which hand — swords.js)
    const hk = o.armament ? 1 : 0, ids = w?.ids || [];
    const want0 = o.blade ? 'energy:' + o.blade : armed ? `${w.kind}:main:${w.gun || ''}:${hk}:${ids[0] || ''}` : o.prop ? `prop:${o.prop}` : '';
    const want1 = o.bladeB ? 'energy:' + o.bladeB : armed && o.drawHold2 && w.kind === 'sword' && (w.count || 1) >= 2 ? `sword:second::${hk}:${ids[1] || ''}` : '';
    const want2 = armed && o.drawHold2 && w.kind === 'sword' && (w.count || 1) >= 3 ? `sword:mouth::${hk}:${ids[2] || ''}` : '';
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
      hw.place(_v2, k === 0 && o.drawBlade ? o.drawBlade : rig.blade[k], rig.plane[k]);
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
    g.position.y += (o.lift || 0) + this.soleLift;
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
    // banked into a turn (in flight): rolled about the body's length, round the hips
    const bk = P.bk || 0;
    if (bk) {
      _q.setFromAxisAngle(AX, bk);
      _v.set(0, pivot + (o.lift || 0) + this.soleLift, 0);
      g.position.sub(_v).applyQuaternion(_q).add(_v);
      g.quaternion.premultiply(_q);
    }
    if (o.squash && o.squash !== 1) g.scale.set(1 / Math.sqrt(o.squash), o.squash, 1 / Math.sqrt(o.squash)); else g.scale.set(1, 1, 1);
  }

  /**
   * A rubber limb's life between frames: how fast it's stretching (out, or
   * snapping back), which way its end is flying, and from that the ripple
   * running along it and its slack — taut and barely rippling as the fist
   * flies out, a twang where it turns back, slack and whipping as it snaps
   * home. (The rig shapes the limb from these: rig.js solveRubber.)
   */
  rubberMotion(dt) {
    const rig = this.rig;
    for (let j = 0; j < 4; j++) {
      const leg = j >= 2, k = j % 2;
      const R = leg ? this.rubL[k] : this.rub[k];
      const on = leg ? rig.rubOnL[k] : rig.rubOn[k], len = leg ? rig.rubLenL[k] : rig.rubLen[k];
      const E = leg ? rig.F[k] : rig.E[k];
      if (!on) { R.amp *= Math.exp(-dt * 14); R.len = 0; R.v = 0; R.has = false; R.dir.set(0, 0, 0); continue; }
      if (!R.has || dt <= 0) {
        // (just stretched: a fresh ripple, in its own plane)
        R.has = true; R.prev.copy(E); R.len = len; R.v = 0;
        R.ph = 0; R.amp = Math.max(R.amp, 0.02 + 0.012 * len); R.sag = 0.02;
        R.tilt = (k ? -0.5 : 0.5) + Math.sin(len * 13.7) * 0.4;
        R.k = 2 + (len % 1);
        continue;
      }
      const v = (len - R.len) / dt;
      _v.subVectors(E, R.prev).divideScalar(dt);
      const sp = _v.length();
      if (sp > 2.5) R.dir.copy(_v).divideScalar(sp); else R.dir.set(0, 0, 0);
      R.prev.copy(E);
      // the twang where it stops going out and starts coming back
      if (R.v > 1.5 && v < -1.5) R.amp += 0.05 + 0.025 * Math.min(len, 6);
      const want = Math.min(0.09, 0.008 * Math.sqrt(Math.abs(v)) * Math.min(1, len / 1.5));
      R.amp += (want - R.amp) * Math.min(1, dt * (R.amp > want ? 5 : 10));
      // the ripple runs out along it as it stretches, back down it as it comes home
      R.ph += dt * (v >= -0.5 ? 22 : -30);
      R.sag += ((v < -1 ? 0.07 : 0.018) - R.sag) * Math.min(1, dt * 8);
      R.len = len; R.v = v;
    }
  }

  /**
   * Wings on the back (a Lunarian's, a Skypiean's): at rest half folded,
   * stirring; driven by the pose (P.ws spread, P.wg the beat: −1 up … +1
   * down, P.wf swept back) they open out to the sides and beat — a little
   * bigger spread wide, as a flight feather fans.
   */
  poseWings(P, o, t) {
    const bones = this.bones, lunar = this.look.wings === 'lunar';
    let yaw, roll, sc = 1;
    if (P.ws !== undefined && P.ws !== null) {
      const sp = Math.max(0, Math.min(1, P.ws)), beat = P.wg || 0, back = P.wf || 0;
      // (folded: swept back along the body and drooping; spread: straight out, beating about the shoulder)
      yaw = -0.95 + 0.85 * sp - 0.75 * back;
      roll = 0.3 * (1 - sp) - 0.12 * sp + beat * 0.72 * sp;
      sc = 1 + 0.35 * sp;
    } else {
      const flap = Math.sin(t * (lunar ? 2.4 : 3.2)) * (lunar ? 0.1 : 0.14) + (o.moving ? 0.12 : 0);
      yaw = -0.35 - flap * 0.5; roll = -0.25 + flap;
    }
    // (spread to fly, the wings beat up and down in the world however the body
    // is pitched: their root turned back against the chest's pitch)
    const pitch = P.ws ? ((P.r || 0) + (P.l || 0) + (o.leanAdd || 0)) * Math.max(0, Math.min(1, P.ws)) : 0;
    _q2.setFromAxisAngle(AZ, pitch);
    bones[B.wingR].quaternion.copy(_q2).multiply(_q.setFromAxisAngle(AY, yaw)).multiply(_q.setFromAxisAngle(AX, roll));
    bones[B.wingL].quaternion.copy(_q2).multiply(_q.setFromAxisAngle(AY, -yaw)).multiply(_q.setFromAxisAngle(AX, -roll));
    bones[B.wingR].scale.setScalar(sc); bones[B.wingL].scale.setScalar(sc);
  }

  /**
   * A skirt's six panels (bones skirt0..5, hung round the waist from the front
   * toward the right): each swings out about its own horizontal axis just as
   * far as it must for the thighs, knees and shins beneath it to stay inside
   * the cloth — a stride, a knee bent at rest, sitting down — and settles back
   * more gently than it was pushed, as cloth falls. A long skirt bends again
   * at the knee (skirtK0..5): the upper panel lies over the thigh, the lower
   * hangs from the knee, clear of the shin.
   */
  skirtPanels(dt) {
    const S = this.body.skirt, d = this.d, rig = this.rig, bones = this.bones;
    const th = this.skirtTh || (this.skirtTh = new Float32Array(SKIRT_N * 2));
    const F = d.F || {}, Bk = d.Bk;
    // (the legs' reach: the thigh's and shin's radius and a little room for the cloth)
    const rT = 0.088 * (F.th || 1) * Bk + 0.028, rS = 0.056 * (F.ca || 1) * Bk + 0.024;
    const [Dp, Wp] = skirtWaist(d);
    const hHem = -S.yb, hK = S.hK, two = hK > 0;
    _sq.copy(rig.quat[B.hips]).invert();
    const H = rig.pos[B.hips];
    // the leg points it must clear, in the hips' frame (+X forward, +Z right)
    let n = 0;
    for (const [hi, ki, fi] of LEG3) {
      const A = rig.pos[hi], K = rig.pos[ki], Ft = rig.pos[fi];
      for (let s = 0; s < SKIRT_T.length; s++) {
        const t = SKIRT_T[s], P = _spts[n];
        (s < 3 ? P.lerpVectors(A, K, t) : P.lerpVectors(K, Ft, t)).sub(H).applyQuaternion(_sq);
        _srad[n] = s < 3 ? rT - 0.018 * t : rS - 0.012 * t;
        _sleg[n] = s < 3 ? (t === 1 ? 2 : 0) : 1; // 0 thigh, 1 shin, 2 knee
        n++;
      }
    }
    const fall = Math.min(0.2, dt || 0.016) * 2.6;
    for (let i = 0; i < SKIRT_N; i++) {
      const a = (i / SKIRT_N) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const rp = Math.hypot(ca * Dp, sa * Wp), rh = Math.hypot(ca * S.Dh, sa * S.Wh);
      const phi0 = Math.atan2(rh - rp, hHem);
      // the upper panel (or the whole of a short skirt), from the waist
      let phiA = phi0;
      for (let k = 0; k < n; k++) {
        if (two && _sleg[k] === 1) continue;
        const P = _spts[k];
        const need = panelNeed(P.x * ca + P.z * sa - rp, -P.y, _srad[k], hHem, Math.atan2(P.z, P.x), a);
        if (need > phiA) phiA = need;
      }
      const tA = Math.min(1.75, phiA) - phi0;
      th[i] = tA >= th[i] ? tA : Math.max(tA, th[i] - fall);
      bones[B['skirt' + i]].quaternion.setFromAxisAngle(_sax.set(-sa, 0, ca), th[i]);
      if (!two) continue;
      // the lower panel: hangs from where the upper one reaches at the knee, clear of the shin
      const ang = phi0 + th[i], L = hK / Math.cos(phi0);
      const ku = rp + Math.sin(ang) * L, kh = Math.cos(ang) * L; // (the bend: out from the axis, down from the waist)
      let phiB = phi0;
      for (let k = 0; k < n; k++) {
        // (the shins below the bend: the knee is the upper panel's to clear —
        // it sits right at the bend, inside the cloth, where no swing of the
        // lower panel could take it any further in, and it would fling that
        // out flat)
        if (_sleg[k] !== 1) continue;
        const P = _spts[k], hB = -P.y - kh;
        if (hB < 0.04) continue;
        const need = panelNeed(P.x * ca + P.z * sa - ku, hB, _srad[k], hHem - hK, Math.atan2(P.z, P.x), a);
        if (need > phiB) phiB = need;
      }
      // (its own angle from the vertical settles back; it turns against the upper panel's)
      const pB = Math.min(1.3, phiB), j = SKIRT_N + i;
      th[j] = pB >= th[j] ? pB : Math.max(pB, th[j] - fall);
      bones[B['skirtK' + i]].quaternion.setFromAxisAngle(_sax, Math.max(phi0, th[j]) - phi0 - th[i]);
    }
  }

  /**
   * A coat's tail, as cloth: six panels round the back hung from the waist
   * (coat0..5), each bending again part way down (coatK0..5). Each panel is
   * a pendulum — the body's own moves swing it (set off and it lags, stop or
   * turn and it swings on), the wind of moving streams it back, it settles
   * as it hangs, and neighbours pull on each other so the tail holds
   * together (coatSwing, close by) — and whatever it's doing, it swings out
   * as far as it must to clear the thighs and shins (as a skirt's panels do).
   * Here, every frame: where the legs are, and (further off, with nothing
   * swinging it) the cloth falling back to hang, pushed out by the legs.
   * th: each upper panel's swing out from its rest (radians), then each
   * lower panel's (its own, not its upper's).
   */
  coatPanels(dt) {
    const C = this.body.coat, N = COAT_N, d = this.d, rig = this.rig;
    const S = this.coatS || (this.coatS = { th: new Float32Array(N * 2), om: new Float32Array(N * 2), need: new Float32Array(N), live: 0, n: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), on: false });
    // the legs' points, in the hips' frame (+X forward, +Z right), and how thick they are there
    const F = d.F || {}, Bk = d.Bk;
    const rT = 0.088 * (F.th || 1) * Bk + 0.03, rS = 0.056 * (F.ca || 1) * Bk + 0.026;
    _cq.copy(rig.quat[B.hips]).invert();
    const H = rig.pos[B.hips];
    let n = 0;
    for (const [hi, ki, fi] of LEG3) {
      const A = rig.pos[hi], K = rig.pos[ki], Ft = rig.pos[fi];
      for (let s = 0; s < SKIRT_T.length; s++) {
        const t = SKIRT_T[s], P = _cpts[n];
        (s < 3 ? P.lerpVectors(A, K, t) : P.lerpVectors(K, Ft, t)).sub(H).applyQuaternion(_cq);
        _crad[n] = s < 3 ? rT - 0.018 * t : rS - 0.012 * t;
        _cleg[n] = s < 3 ? (t === 1 ? 2 : 0) : 1;
        n++;
      }
    }
    S.n = n;
    // the upper panels: as far out as they must go to clear the thighs and knees
    for (let i = 0; i < N; i++) {
      const a = C.a[i], ca = Math.cos(a), sa = Math.sin(a), rp = Math.hypot(ca * C.Dp, sa * C.Wp);
      const phi0 = Math.atan2(rp * C.flare, C.L);
      let need = phi0;
      for (let k = 0; k < n; k++) {
        if (_cleg[k] === 1) continue;
        const P = _cpts[k];
        const v = panelNeed(P.x * ca + P.z * sa - rp, -P.y, _crad[k], C.hK + 0.08, Math.atan2(P.z, P.x), a, C.reach);
        if (v > need) need = v;
      }
      S.need[i] = Math.min(1.6, need) - phi0;
    }
    // (nothing swinging it — too far off to see it swing: it falls back to
    // hanging, as gently as cloth falls, held out by the legs)
    S.live -= dt || 0.016;
    if (S.live > 0) return;
    const fall = Math.min(0.2, dt || 0.016) * 2.2;
    for (let i = 0; i < N; i++) {
      const up = Math.max(S.need[i], S.th[i] > 0 ? Math.max(0, S.th[i] - fall) : Math.min(0, S.th[i] + fall));
      S.th[i] = up; S.om[i] = 0;
      const lo = this.coatLowNeed(i, up), j = N + i, cur = S.th[j];
      S.th[j] = Math.max(lo, cur > 0 ? Math.max(0, cur - fall) : Math.min(0, cur + fall)); S.om[j] = 0;
    }
    this.coatApply();
  }

  /** How far out (from its rest) lower panel i must swing to clear the shins, its upper panel `up` out from its rest. */
  coatLowNeed(i, up) {
    const C = this.body.coat, S = this.coatS;
    const a = C.a[i], ca = Math.cos(a), sa = Math.sin(a), rp = Math.hypot(ca * C.Dp, sa * C.Wp);
    const phi0 = Math.atan2(rp * C.flare, C.L), Lb = C.hK / Math.cos(phi0), ang = phi0 + up;
    // (the bend: out from the axis, down from the waist)
    const ku = rp + Math.sin(ang) * Lb, kh = Math.cos(ang) * Lb;
    let need = phi0;
    for (let k = 0; k < S.n; k++) {
      if (_cleg[k] === 0) continue;
      const P = _cpts[k], hB = -P.y - kh;
      if (hB < 0.04) continue;
      const v = panelNeed(P.x * ca + P.z * sa - ku, hB, _crad[k], C.L - C.hK + 0.05, Math.atan2(P.z, P.x), a, C.reach);
      if (v > need) need = v;
    }
    return Math.min(1.6, need) - phi0;
  }

  /**
   * The coat's tail swung as cloth (close by: after the model's posed and
   * placed in the world for the frame): the hips' own motion — how fast
   * they go and how that changes, how fast they turn — in their own frame
   * drives each panel's pendulum; the legs keep it out (coatPanels).
   */
  coatSwing(dt) {
    const S = this.coatS, C = this.body.coat, N = COAT_N, K = COAT_FEEL;
    if (!S) return;
    const hips = this.bones[B.hips];
    const p = _cv.setFromMatrixPosition(hips.matrixWorld);
    _cq.setFromRotationMatrix(_cm.extractRotation(hips.matrixWorld));
    S.live = 0.25;
    if (!S.on || !(dt > 0) || dt > 0.3 || p.distanceToSquared(S.p) > 4) {
      // (first frame, a long gap or a jump: hanging still)
      S.p.copy(p); S.v.set(0, 0, 0); S.q.copy(_cq); S.on = true;
      this.coatApply();
      return;
    }
    // (the body's way through the world, smoothed: a stride's sway and the
    // bob of a run aren't the cloth's to answer, only the body going
    // somewhere, starting, stopping and turning)
    const v = _cv2.subVectors(p, S.p).divideScalar(dt);
    v.y = 0;
    v.lerpVectors(S.v, v, 1 - Math.exp(-dt / K.smooth));
    const acc = _cv3.subVectors(v, S.v).divideScalar(dt);
    if (acc.lengthSq() > 900) acc.setLength(30);
    // (how fast the hips turn about the upright)
    _cq2.copy(S.q).invert().premultiply(_cq);
    const yawRate = 2 * Math.atan2(_cq2.y, _cq2.w) / dt;
    S.p.copy(p); S.v.copy(v); S.q.copy(_cq);
    // into the hips' frame
    _cq2.copy(_cq).invert();
    v.applyQuaternion(_cq2); acc.applyQuaternion(_cq2);
    const g = K.g, w2 = Math.min(25, yawRate * yawRate);
    const lU = C.hK * 0.6, lL = (C.L - C.hK) * 0.6, th = S.th, om = S.om;
    const steps = Math.min(4, Math.ceil(dt / (1 / 60))), h = dt / steps;
    for (let st = 0; st < steps; st++) {
      for (let i = 0; i < N; i++) {
        const a = C.a[i], ca = Math.cos(a), sa = Math.sin(a), rp = Math.hypot(ca * C.Dp, sa * C.Wp);
        // the air on its face (a run streams the back of it out behind), the
        // lag of its own weight as the body speeds up, slows or turns
        const wind = -(v.x * ca + v.z * sa) * K.wind;
        const push = -(acc.x * ca + acc.z * sa) + w2 * rp;
        const t0 = th[i];
        const link = K.link * ((i > 0 ? th[i - 1] : t0) + (i < N - 1 ? th[i + 1] : t0) - 2 * t0);
        const al = (-g * Math.sin(t0) + (wind + push) * Math.cos(t0)) / lU - K.damp * om[i] + link;
        om[i] += al * h;
        th[i] += om[i] * h;
        if (th[i] < S.need[i]) { th[i] = S.need[i]; if (om[i] < 0) om[i] = 0; }
        if (th[i] > K.max) { th[i] = K.max; if (om[i] > 0) om[i] = 0; }
        // the lower panel, hung from where the upper one bends: pushed the same way, and by the upper's swing
        const j = N + i, t1 = th[j];
        const linkL = K.link * ((i > 0 ? th[j - 1] : t1) + (i < N - 1 ? th[j + 1] : t1) - 2 * t1);
        const alL = (-g * Math.sin(t1) + (wind * 1.15 + push - al * C.hK) * Math.cos(t1)) / lL - K.damp2 * om[j] + linkL;
        om[j] += alL * h;
        th[j] += om[j] * h;
        const lo = this.coatLowNeed(i, th[i]);
        if (th[j] < lo) { th[j] = lo; if (om[j] < 0) om[j] = 0; }
        if (th[j] > K.max2) { th[j] = K.max2; if (om[j] > 0) om[j] = 0; }
      }
    }
    this.coatApply();
  }

  /** Set the coat panels' bones from their swings. */
  coatApply() {
    const S = this.coatS, C = this.body.coat, bones = this.bones;
    for (let i = 0; i < COAT_N; i++) {
      const a = C.a[i];
      _cax.set(-Math.sin(a), 0, Math.cos(a));
      bones[B['coat' + i]].quaternion.setFromAxisAngle(_cax, S.th[i]);
      bones[B['coatK' + i]].quaternion.setFromAxisAngle(_cax, S.th[COAT_N + i] - S.th[i]);
    }
  }

  /**
   * Drawing a weapon: the right hand goes to its grip — a sword's hilt at the
   * left hip, a pistol's butt at the right, a staff's end (or Yoru's hilt)
   * over the right shoulder — takes hold, draws it out along its sheath and brings it up
   * into the stance; putting it away runs the same the other way.
   */
  drawPath(P, o) {
    const D = o.draw, rig = this.rig, d = this.d, w = o.wpn;
    // the stance's hand and blade this frame (without the draw), for the end of it
    rig.solve(P, { ...o, reachR: null, draw: null });
    const stanceHand = _dr[0].copy(rig.E[0]), stanceBlade = _dr[1].copy(rig.blade[0]);
    const S = rig.S[0];
    const G = _dr[2], out = _dr[3];
    let len;
    if (w.kind === 'sword' && !w.back) {
      const z = -(d.hipOut + 0.012);
      const ax = 0.1, ay = 0.02, ex = -0.62, ey = -0.4;
      out.set(ax - ex, ay - ey, 0.1).normalize();
      G.set(ax, ay, z).addScaledVector(out, 0.1).applyQuaternion(rig.qPelvis).add(rig.hip);
      out.applyQuaternion(rig.qPelvis);
      len = 0.72;
    } else if (w.kind === 'gun') {
      G.set(0.07, 0.04, d.hipOut + 0.03).applyQuaternion(rig.qPelvis).add(rig.hip);
      out.set(0.25, 1, 0.1).normalize().applyQuaternion(rig.qPelvis);
      len = 0.2;
    } else {
      const a = _dr[4].set(-0.16 * d.Bk, d.chestLen - 0.02, 0.22), e = _dr[5].set(-0.17 * d.Bk, 0.05, -0.28);
      out.subVectors(a, e).normalize().applyQuaternion(rig.qChest);
      G.copy(a).applyQuaternion(rig.qChest).add(rig.hip);
      len = w.kind === 'sword' ? 0.68 : 0.55;
    }
    // (putting it away runs the draw backwards)
    const k = D.out ? D.k : 1 - D.k;
    const rest = _dr[4].set(S.x + 0.04, S.y - (d.A1 + d.A2) * 0.9, S.z + 0.03 * (S.z > 0 ? 1 : -1));
    const T = _dr[5];
    if (k < 0.42) T.lerpVectors(rest, G, smooth(k / 0.42));
    else if (k < 0.78) T.copy(G).addScaledVector(out, smooth((k - 0.42) / 0.36) * len);
    else T.copy(G).addScaledVector(out, len).lerp(stanceHand, smooth((k - 0.78) / 0.22));
    o.reachR = T;
    // the blade: back down the sheath while it's still in it, then round into the stance
    if (k >= 0.42) {
      const b = _dr[6].copy(out).negate();
      o.drawBlade = k < 0.78 ? b : b.lerp(stanceBlade, smooth((k - 0.78) / 0.22)).normalize();
    }
    o.drawHold2 = k > 0.86;
  }

  setHeld(k, want, o) {
    if (this.heldKey[k] === want) return;
    this.heldKey[k] = want;
    const old = this.held[k];
    if (old) { old.group.parent?.remove(old.group); this.held[k] = null; }
    if (!want) return;
    const [kind, variant, gun, haki, id] = want.split(':');
    const opts = kind === 'energy' ? { color: variant } : { variant, gun, haki: haki === '1', id: id || null, ...(this.opts.weaponOpts || {}) };
    const hw = new HeldWeapon(kind, opts);
    this.held[k] = hw;
    (k === 2 ? this.bones[B.head] : this.group).add(hw.group);
  }

  /** The body material's effect uniforms (flash, haki, legFx, freeze). */
  get fx() { return this.mat.userData.u; }

  /**
   * Sensed by Observation Haki: the body glowing through walls in `col` (the
   * senser's tint), `k` strong; null lets it go (see mats.js senseMaterial).
   */
  sense(col, k = 1) {
    const sm = this.senseMesh;
    if (!col) { if (sm) sm.visible = false; return; }
    if (!sm) {
      this.senseMesh = new THREE.SkinnedMesh(this.body.geo, senseMaterial());
      this.senseMesh.bind(this.skeleton, IDENT);
      this.senseMesh.boundingSphere = this.mesh.boundingSphere;
      // (after the world and the other characters: drawn over them)
      this.senseMesh.renderOrder = 8;
      this.group.add(this.senseMesh);
    }
    const m = this.senseMesh;
    if (m.geometry !== this.body.geo) m.geometry = this.body.geo;
    m.visible = true;
    const u = m.material.userData.u;
    if (this.senseCol !== col) { this.senseCol = col; u.uCol.value.set(col); }
    u.uK.value = k;
  }

  dispose() {
    releaseBody(this.body);
    releaseFace(this.faceE);
    this.mat.dispose();
    if (this.senseMesh) this.senseMesh.material.dispose();
    if (this.bubble) { this.bubble.geometry.dispose(); this.bubble.material.dispose(); }
    this.skeleton.dispose();
    this.group.removeFromParent();
  }
}

export { expression, glowMaterial };
