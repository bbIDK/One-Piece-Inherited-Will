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
//
// The pose may also turn what the side plane can't show (all optional, 0 if
// absent): tw / hp the chest's and the pelvis's turn (radians, + brings the
// right shoulder or hip forward) on top of what the hands' and feet's reach
// gives them — so a cross can lead with the hips and drive the shoulder
// through; ls a sideways bend of the trunk (+ toward the right); hy / hr the
// head's turn and roll on the neck (+ toward the left, + onto the right
// shoulder); zF / zB and zfF / zfB how far a hand or a foot is carried out to
// its own side (2D units, + outward: a hook swung wide, arms flung open);
// smF / smB / smfF / smfB a limb's smear — the blow overreaching itself by
// that share of its length for a frame or two, the snap of a strike.
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
const _att = V(), _attP = V(), _g2 = V();

/**
 * An idle attitude's hand target (model space) and elbow pole for arm k:
 * 'cross' — arms folded, the right forearm over the left, each hand at the
 * other arm; 'hips' — hands on the hips, elbows out.
 */
function attitude(d, k, side, kind, hip, T, P) {
  const Bk = d.Bk, BkD = 1 + (Bk - 1) * 0.85;
  if (kind === 'hips') {
    T.set(0.005, 0.1 * d.chestLen, side * ((d.fem ? 0.112 : 0.13) * Bk + 0.045)).add(hip);
    P.set(-0.45, -0.15, side);
  } else {
    const top = k === 0;
    T.set((top ? 0.2 : 0.165) * BkD, d.shY - (top ? 0.17 : 0.215), -side * (top ? 0.1 : 0.115) * Bk).add(hip);
    P.set(0.3, -1, side * 0.6);
  }
}

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
   * punches in flight), grip2 / grip2K (the other hand on the first one's
   * weapon, this far along it, and how much: 0..1), shape: ['fist'|'palm'|
   * 'finger'|'claw'|'flat', …] }.
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
    const tk = o.twistK ?? 1;
    // (the turn the reach gives, and the pose's own on top: the hips drive, the shoulders follow)
    const twist = clamp(clamp((hF[0] - hB[0]) * 0.85, -0.5, 0.5) + (P.tw || 0), -1.35, 1.35) * tk;
    const ptw = clamp(clamp((fF[0] - fB[0]) * 0.45, -0.3, 0.3) + (P.hp || 0), -1.1, 1.1) * tk;
    const bend = P.ls || 0;
    this.qLean.setFromAxisAngle(Z, -l);
    if (bend) this.qLean.multiply(_qa.setFromAxisAngle(X, bend));
    this.qChest.setFromAxisAngle(Y, twist).multiply(this.qLean);
    this.qPelvis.setFromAxisAngle(Y, ptw).multiply(_qa.setFromAxisAngle(Z, -l * 0.25));
    if (bend) this.qPelvis.multiply(_qa.setFromAxisAngle(X, bend * 0.3));
    this.pos[B.hips].copy(hip); this.quat[B.hips].copy(this.qPelvis);
    this.pos[B.chest].copy(hip); this.quat[B.chest].copy(this.qChest);

    // head: pivot at the top of the neck
    this.neck.set(0, d.chestLen + d.neck, 0).applyQuaternion(this.qChest).add(hip);
    const tilt = (P.ht || 0) + (o.tiltAdd || 0);
    // (turned first, then nodded about its own axis: a head turned to the side
    // and bowed looks down over that shoulder)
    this.qHead.copy(this.qChest);
    // (and the eyes stay on whoever's in front: the head turns back against most of the chest's turn)
    const yaw = (o.lookYaw || 0) + (P.hy || 0) - twist * 0.75, roll = (o.headRoll || 0) + (P.hr || 0);
    if (yaw) this.qHead.multiply(_qb.setFromAxisAngle(Y, yaw));
    this.qHead.multiply(_qa.setFromAxisAngle(Z, -tilt));
    if (roll) this.qHead.multiply(_qb.setFromAxisAngle(X, roll));
    this.pos[B.head].copy(this.neck); this.quat[B.head].copy(this.qHead);
    this.headC.set(d.hx || 0, d.hc, 0).applyQuaternion(this.qHead).add(this.neck);

    // arms
    const tiltA = o.tilt || 0;
    const broom = o.prop === 'broom';
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      const h = k === 0 ? hF : hB;
      const S = this.S[k], J = this.J[k], E = this.E[k];
      S.set(0, d.shY, side * d.shW).applyQuaternion(this.qChest).add(hip);
      const T = this._T;
      const reach = k === 0 ? o.reachR : o.reachL;
      if (reach) T.copy(reach);
      else if (k === 1 && broom) {
        // the other hand up the broom's handle
        T.copy(this.E[0]).addScaledVector(this.blade[0], -0.42);
      } else {
        const hx = h[0], hy = h[1];
        const fwdK = clamp(hx / 0.43, 0, 1);
        const restK = clamp(1 - hx / 0.2, 0, 1) * clamp(hy / 0.3, 0, 1);
        // (at rest the arms hang a hand's breadth clear of the hips, not pinned to them;
        // a hand carried out to its side — a hook's arc, arms flung wide — goes on from there)
        const out = (k === 0 ? P.zF : P.zB) || 0;
        const lat = side * (-d.shW * 0.74 * fwdK * clamp(1 - out * 3, 0, 1) + 0.075 * restK + (o.spread || 0) + out * d.kA);
        T.set(hx * d.kA, -hy * d.kA, lat);
        if (tiltA) T.applyAxisAngle(X, tiltA * side);
        T.applyQuaternion(this.qLean).add(S);
        if (o.att && o.attK > 0) { attitude(d, k, side, o.att, hip, _att, _attP); T.lerp(_att, o.attK); }
        // the Longarm tribe's arms hang bent at the second elbow, the forearm
        // carried forward — not trailing down past the knees through their
        // clothes and swinging through their legs
        if (d.Am > 1.25 && restK > 0.02) {
          const lk = Math.min(1, (d.Am - 1.25) / 0.4) * Math.min(1, restK * 1.6) * 0.85;
          _att.set(0.3 * d.Am * 0.6, -(d.A1 + d.A2) * 0.6, side * (d.shW * 0.95 + 0.05)).applyQuaternion(this.qLean).add(S);
          T.lerp(_att, lk);
        }
        // the other hand on the first one's weapon — a staff's or an axe's
        // shaft (o.grip2: how far along it from the first hand), eased on
        // and off by o.grip2K
        if (k === 1 && o.grip2 && o.grip2K > 0) T.lerp(_g2.copy(this.E[0]).addScaledVector(this.blade[0], o.grip2), o.grip2K);
      }
      // a blow at full stretch overreaches itself for a frame or two (its smear)
      let stretch = !!P.stretch || !!reach;
      const sm = (k === 0 ? P.smF : P.smB) || 0;
      if (sm > 0 && !stretch) {
        _t.subVectors(T, S);
        const L = d.A1 + d.A2, dist = _t.length();
        const out = clamp((dist / L - 0.8) / 0.2, 0, 1);
        if (out > 0 && dist > 1e-4) { T.copy(S).addScaledVector(_t, L * (1 + sm * out) / dist); stretch = true; }
      }
      // elbow pole: the 2D bend side in the swing plane, flared outward
      const e = k === 0 ? (P.eF ?? 1) : (P.eB ?? 1);
      _t.subVectors(T, S);
      const lxy = Math.hypot(_t.x, _t.y) || 1;
      const sg = e < 0 ? -1 : 1;
      this._pole.set(_t.y / lxy * sg, -_t.x / lxy * sg, side * 0.42);
      // (a hand held out to a fixed point — food held up, a rubber arm's fist — keeps its
      // elbow down and back: with the target near shoulder height the swing-plane pole
      // would flip over as the body bobs, and the whole arm and the palm with it)
      if (reach) this._pole.set(-0.75, -0.65, side * 0.45);
      if (o.att && o.attK > 0 && !reach && !(k === 1 && (broom || (o.grip2 && o.grip2K > 0.5)))) this._pole.lerp(_attP, o.attK);
      ik(S, T, d.A1, d.A2, this._pole, e === 0 ? 0 : e, stretch, J, E);
      const U = k === 0 ? B.uarmR : B.uarmL, F = k === 0 ? B.farmR : B.farmL, Hd = k === 0 ? B.handR : B.handL;
      this.pos[U].copy(S); aimNegY(this.quat[U], _t.subVectors(J, S), this._pole);
      this.len[U] = clamp(S.distanceTo(J) / d.A1, 0.5, 8);
      this.pos[F].copy(J); aimNegY(this.quat[F], _t.subVectors(E, J), this._pole);
      this.len[F] = clamp(J.distanceTo(E) / d.A2, 0.5, 8);
      // hand: fingers continue the forearm, back of the hand up/outward
      _u.subVectors(E, J).normalize();
      const shape = o.shape ? o.shape[k] : 'fist';
      // (a flat hand — swimming — keeps its fingers in line and its back up)
      if (shape === 'flat') this._ref.set(0.1, 1, side * 0.35);
      else if (shape === 'hold') this._ref.set(0.25, -1, side * 0.35); // (holding food: the palm up under it)
      else if (shape === 'eat') this._ref.set(1, 0.25, side * 0.3); // (eating: the hand at the mouth, its palm toward the face)
      else this._ref.set(-0.3, 0.6, side * 0.8);
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
        // (rolled about the reach: a blade held up across the face, two of them crossed)
        if (P.wt) { this.blade[k].applyAxisAngle(X, -P.wt * side); this.plane[k].applyAxisAngle(X, -P.wt * side); }
        this.blade[k].applyQuaternion(this.qLean); this.plane[k].applyQuaternion(this.qLean);
        this.bladeOn[k] = true;
      } else {
        this.blade[k].copy(_u);
        this.plane[k].copy(this._pole).cross(_u).normalize();
        this.bladeOn[k] = false;
      }
      if (k === 0 && broom) {
        // a broom reaches from the hand down to the ground in front, however
        // long the arms (the pose's angle is right for ordinary arms: long
        // ones hold it lower and would drive it into the ground), its head
        // swept in toward the middle
        const L = 1.08, drop = clamp(E.y - 0.03, 0.2, L * 0.97);
        const dz = (0 - E.z) * 0.6;
        const hx = Math.sqrt(Math.max(0.01, L * L - drop * drop - dz * dz));
        this.blade[0].set(hx, -drop, dz).normalize();
        this.plane[0].set(0, 0, 1).addScaledVector(this.blade[0], -this.blade[0].z).normalize();
        this.bladeOn[0] = true;
      }
    }

    // legs (foot targets relative to the ground under the hip)
    const walk = o.walkRel;
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      const f = k === 0 ? fF : fB;
      const Hj = _c.set(0, -0.07, side * d.hipW).applyQuaternion(this.qPelvis).add(hip);
      const T = this._T;
      let fx = f[0] * d.kL, fz = side * (d.hipW + 0.012 + (o.legSpread || 0) + ((k === 0 ? P.zfF : P.zfB) || 0) * d.kL);
      if (walk !== undefined && walk !== null) {
        // (stepping sideways the stride is a little shorter, and each foot
        // keeps to its own side: the trailing foot closes up to the leading
        // one — a side-step — instead of crossing through the other leg)
        fz += fx * Math.sin(walk) * 0.8; fx *= Math.cos(walk);
        fz = side * Math.max(d.hipW * 0.35, side * fz);
      }
      T.set(hip.x + fx, d.hA + Math.max(0, -f[1] * d.kL), fz);
      _t.subVectors(T, Hj);
      // (a kick's smear: the leg out at full stretch overreaches itself, as an arm's blow does)
      const sm = (k === 0 ? P.smfF : P.smfB) || 0;
      let reachOut = false;
      if (sm > 0) {
        const L = d.T1 + d.T2, dist = _t.length();
        const out = clamp((dist / L - 0.8) / 0.2, 0, 1);
        if (out > 0 && dist > 1e-4) { T.copy(Hj).addScaledVector(_t, L * (1 + sm * out) / dist); _t.subVectors(T, Hj); reachOut = true; }
      }
      const lxy = Math.hypot(_t.x, _t.y) || 1;
      this._pole.set(-_t.y / lxy, _t.x / lxy, side * 0.12);
      const Kn = this.K[k], Ft = this.F[k];
      const Hs = this.pos[k === 0 ? B.thighR : B.thighL].copy(Hj);
      ik(Hs, T, d.T1, d.T2, this._pole, 1, reachOut, Kn, Ft);
      const Th = k === 0 ? B.thighR : B.thighL, Sh = k === 0 ? B.shinR : B.shinL, Fo = k === 0 ? B.footR : B.footL;
      aimNegY(this.quat[Th], _t.subVectors(Kn, Hs), this._pole);
      this.pos[Sh].copy(Kn); aimNegY(this.quat[Sh], _t.subVectors(Ft, Kn), this._pole);
      this.len[Th] = reachOut ? clamp(Hs.distanceTo(Kn) / d.T1, 1, 1.5) : 1;
      this.len[Sh] = reachOut ? clamp(Kn.distanceTo(Ft) / d.T2, 1, 1.5) : 1;
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
