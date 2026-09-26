// The 3D rig: turns a sampled 2D pose P (render/anims.js — hand/foot targets
// in the body's side plane, lean, hip offset, head tilt, blade angles…) into
// joint transforms for the skeleton in bones.js, so every clip reads the
// same in 3D as in 2D.
//
// The side plane (x forward, y up) is mapped onto the character's facing
// plane; the F limbs are the RIGHT side (+Z), B the left. Lateral placement
// is added in 3D: hands drift to the centre line as they reach forward,
// elbows flare out, strikes twist the chest, and blade arcs tilt into
// diagonals (the clip's sweep) so combos cross in X patterns.
import * as THREE from 'three';
import { B } from './bones.js';

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const toXY = (h, fb) => (!h ? fb : Array.isArray(h) ? h : [Math.cos(h.a) * h.r, Math.sin(h.a) * h.r]);

const _m = new THREE.Matrix4();
const _a = V(), _b = V(), _c = V(), _d = V(), _u = V(), _p = V(), _t = V();
const _qa = Q(), _qb = Q(), _qc = Q();

/** Quaternion whose local -Y points along `dir`, +X toward `ref` (orthogonalised). */
function aimNegY(q, dir, ref) {
  _b.copy(dir).normalize().negate();          // Y axis
  _a.copy(ref).addScaledVector(_b, -ref.dot(_b));
  if (_a.lengthSq() < 1e-6) { _a.set(1, 0, 0).addScaledVector(_b, -_b.x); if (_a.lengthSq() < 1e-6) _a.set(0, 0, 1); }
  _a.normalize();
  _c.crossVectors(_a, _b);                     // Z = X × Y
  _m.makeBasis(_a, _b, _c);
  return q.setFromRotationMatrix(_m);
}
/** Quaternion whose local +X points along `fwd`, +Y toward `up` (orthogonalised). */
function aimX(q, fwd, up) {
  _a.copy(fwd).normalize();
  _b.copy(up).addScaledVector(_a, -up.dot(_a));
  if (_b.lengthSq() < 1e-6) { _b.set(0, 1, 0).addScaledVector(_a, -_a.y); if (_b.lengthSq() < 1e-6) _b.set(-1, 0, 0); }
  _b.normalize();
  _c.crossVectors(_a, _b);
  _m.makeBasis(_a, _b, _c);
  return q.setFromRotationMatrix(_m);
}

/**
 * Two-bone IK: from root S toward target T (bone lengths L1, L2), bending
 * toward `pole` by |bend| (0 = straight, 1 = a true IK bend, as in 2D).
 * Writes the joint into J and the end into E. Rubber limbs may stretch.
 */
function ik(S, T, L1, L2, pole, bend, stretch, J, E) {
  _d.subVectors(T, S);
  let dist = _d.length();
  const max = (L1 + L2) * 0.999;
  if (dist > max && !stretch) { _d.multiplyScalar(max / dist); dist = max; }
  if (dist < 1e-4) { _d.set(0, -1e-4, 0); dist = 1e-4; }
  E.copy(S).add(_d);
  if (dist >= max) { J.copy(S).addScaledVector(_d, L1 / (L1 + L2)); return; }
  _u.copy(_d).divideScalar(dist);
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0).addScaledVector(_u, -_u.y);
  _p.normalize();
  const c = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const ang = Math.acos(clamp(c, -1, 1)) * Math.min(1, Math.abs(bend));
  J.copy(S).addScaledVector(_u, Math.cos(ang) * L1).addScaledVector(_p, Math.sin(ang) * L1);
}

export class Rig {
  constructor(d) {
    this.d = d;
    const n = Object.keys(B).length;
    this.pos = Array.from({ length: n }, V);
    this.quat = Array.from({ length: n }, Q);
    this.len = new Float32Array(n).fill(1); // limb stretch (scale along the bone)
    // extras for weapons, effects and the viewmodel
    this.hip = V(); this.neck = V(); this.headC = V();
    this.S = [V(), V()]; this.J = [V(), V()]; this.E = [V(), V()];
    this.K = [V(), V()]; this.F = [V(), V()];
    this.blade = [V(), V()]; this.plane = [V(), V()]; this.bladeOn = [false, false];
    this.qLean = Q(); this.qChest = Q(); this.qPelvis = Q(); this.qHead = Q();
    this._pole = V(); this._T = V(); this._ref = V();
  }

  /**
   * Solve a pose. `o`: { tilt, walkRel (radians, when the legs follow the walk
   * cycle), spread (extra arm spread), legSpread, leanAdd, tiltAdd (head),
   * lookYaw, reachR / reachL (Vector3 targets overriding a hand: rubber
   * punches in flight), shape: ['fist'|'palm'|'finger'|'claw', …] }.
   */
  solve(P, o = {}) {
    const d = this.d;
    const l = (P.l || 0) + (o.leanAdd || 0);
    const bx = P.b ? P.b[0] : 0, by = P.b ? P.b[1] : 0;
    this.hip.set(bx * d.kL * 0.8, d.hip0 - by * d.kHip, 0);
    // on a seat (o.sitY: model units over the feet; o.sitK: 0..1 eased in)
    if (o.sitK > 0) this.hip.y += ((o.sitY ?? d.hA) + 0.07 - this.hip.y) * o.sitK;
    const hip = this.hip;
    const hF = toXY(P.hF, [0.05, 0.4]), hB = toXY(P.hB, [-0.03, 0.4]);
    const fF = P.fF || [0.05, 0], fB = P.fB || [-0.05, 0];
    const twist = clamp((hF[0] - hB[0]) * 0.85, -0.5, 0.5) * (o.twistK ?? 1);
    const ptw = clamp((fF[0] - fB[0]) * 0.45, -0.3, 0.3) * (o.twistK ?? 1);
    this.qLean.setFromAxisAngle(Z, -l);
    this.qChest.setFromAxisAngle(Y, twist).multiply(this.qLean);
    this.qPelvis.setFromAxisAngle(Y, ptw).multiply(_qa.setFromAxisAngle(Z, -l * 0.25));
    this.pos[B.hips].copy(hip); this.quat[B.hips].copy(this.qPelvis);
    this.pos[B.chest].copy(hip); this.quat[B.chest].copy(this.qChest);

    // head: pivot at the top of the neck
    this.neck.set(0, d.chestLen + d.neck, 0).applyQuaternion(this.qChest).add(hip);
    const tilt = (P.ht || 0) + (o.tiltAdd || 0);
    this.qHead.copy(this.qChest).multiply(_qa.setFromAxisAngle(Z, -tilt));
    if (o.lookYaw) this.qHead.multiply(_qb.setFromAxisAngle(Y, o.lookYaw));
    if (o.headRoll) this.qHead.multiply(_qb.setFromAxisAngle(X, o.headRoll));
    this.pos[B.head].copy(this.neck); this.quat[B.head].copy(this.qHead);
    this.headC.set(d.hx || 0, d.hc, 0).applyQuaternion(this.qHead).add(this.neck);

    // arms
    const tiltA = o.tilt || 0;
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      const h = k === 0 ? hF : hB;
      const S = this.S[k], J = this.J[k], E = this.E[k];
      S.set(0, d.shY, side * d.shW).applyQuaternion(this.qChest).add(hip);
      const T = this._T;
      const reach = k === 0 ? o.reachR : o.reachL;
      if (reach) T.copy(reach);
      else {
        const hx = h[0], hy = h[1];
        const fwdK = clamp(hx / 0.43, 0, 1);
        const restK = clamp(1 - hx / 0.2, 0, 1) * clamp(hy / 0.3, 0, 1);
        const lat = side * (-d.shW * 0.74 * fwdK + 0.055 * restK + (o.spread || 0));
        T.set(hx * d.kA, -hy * d.kA, lat);
        if (tiltA) T.applyAxisAngle(X, tiltA * side);
        T.applyQuaternion(this.qLean).add(S);
      }
      // elbow pole: the 2D bend side in the swing plane, flared outward
      const e = k === 0 ? (P.eF ?? 1) : (P.eB ?? 1);
      _t.subVectors(T, S);
      const lxy = Math.hypot(_t.x, _t.y) || 1;
      const sg = e < 0 ? -1 : 1;
      this._pole.set(_t.y / lxy * sg, -_t.x / lxy * sg, side * 0.42);
      ik(S, T, d.A1, d.A2, this._pole, e === 0 ? 0 : e, !!P.stretch || !!reach, J, E);
      const U = k === 0 ? B.uarmR : B.uarmL, F = k === 0 ? B.farmR : B.farmL, Hd = k === 0 ? B.handR : B.handL;
      this.pos[U].copy(S); aimNegY(this.quat[U], _t.subVectors(J, S), this._pole);
      this.len[U] = clamp(S.distanceTo(J) / d.A1, 0.5, 8);
      this.pos[F].copy(J); aimNegY(this.quat[F], _t.subVectors(E, J), this._pole);
      this.len[F] = clamp(J.distanceTo(E) / d.A2, 0.5, 8);
      // hand: fingers continue the forearm, back of the hand up/outward
      _u.subVectors(E, J).normalize();
      const shape = o.shape ? o.shape[k] : 'fist';
      this._ref.set(-0.3, 0.6, side * 0.8);
      aimNegY(this.quat[Hd], _u, this._ref);
      if (shape === 'palm' || shape === 'claw') {
        // wrist bent back so an open palm faces where the arm reaches
        const flat = 1 - Math.abs(_u.y);
        if (flat > 0.1) this.quat[Hd].multiply(_qa.setFromAxisAngle(Z, 1.15 * flat));
      }
      this.pos[Hd].copy(E);
      // blade direction (upper-body frame angle), and the swing plane
      const w = k === 0 ? P.wF : P.wB;
      if (w !== undefined && w !== null) {
        this.blade[k].set(Math.cos(w), -Math.sin(w), 0);
        this.plane[k].set(0, 0, 1);
        if (tiltA) { this.blade[k].applyAxisAngle(X, tiltA * side); this.plane[k].applyAxisAngle(X, tiltA * side); }
        this.blade[k].applyQuaternion(this.qLean); this.plane[k].applyQuaternion(this.qLean);
        this.bladeOn[k] = true;
      } else {
        this.blade[k].copy(_u);
        this.plane[k].copy(this._pole).cross(_u).normalize();
        this.bladeOn[k] = false;
      }
    }

    // legs (foot targets relative to the ground under the hip)
    const walk = o.walkRel;
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      const f = k === 0 ? fF : fB;
      const Hj = _c.set(0, -0.07, side * d.hipW).applyQuaternion(this.qPelvis).add(hip);
      const T = this._T;
      let fx = f[0] * d.kL, fz = side * (d.hipW + 0.012 + (o.legSpread || 0));
      if (walk !== undefined && walk !== null) { fz += fx * Math.sin(walk); fx *= Math.cos(walk); }
      T.set(hip.x + fx, d.hA + Math.max(0, -f[1] * d.kL), fz);
      _t.subVectors(T, Hj);
      const lxy = Math.hypot(_t.x, _t.y) || 1;
      this._pole.set(-_t.y / lxy, _t.x / lxy, side * 0.12);
      const Kn = this.K[k], Ft = this.F[k];
      const Hs = this.pos[k === 0 ? B.thighR : B.thighL].copy(Hj);
      ik(Hs, T, d.T1, d.T2, this._pole, 1, false, Kn, Ft);
      const Th = k === 0 ? B.thighR : B.thighL, Sh = k === 0 ? B.shinR : B.shinL, Fo = k === 0 ? B.footR : B.footL;
      aimNegY(this.quat[Th], _t.subVectors(Kn, Hs), this._pole);
      this.pos[Sh].copy(Kn); aimNegY(this.quat[Sh], _t.subVectors(Ft, Kn), this._pole);
      this.len[Th] = 1; this.len[Sh] = 1;
      // foot: flat on the ground, following the shin when raised (pointed kicks)
      _u.subVectors(Ft, Kn).normalize();
      const raise = clamp((Ft.y - d.hA) / 0.28, 0, 1);
      const toe = 0.12 + ptw * 0.5 * side;
      _a.set(Math.cos(toe), 0, side * Math.sin(toe));
      _b.copy(_u).addScaledVector(_a, 0.9).normalize();
      _d.copy(_a).lerp(_b, raise).normalize();
      this.pos[Fo].copy(Ft);
      aimX(this.quat[Fo], _d, _c.set(0, 1, 0).lerp(_u.clone().negate(), raise * 0.5));
    }
    return this;
  }
}
