// Defence and the blows taken (see docs/ANIMATION.md, "reactions"). Each
// eases in over a frame or two and back out on its own clock (seconds since
// it happened, from the pose: see game/actor.js visualPose and
// render/combatfx.js actorVisuals), laid over whatever the body was doing.
import { sm01, mixN, mixP, toXY } from './timing.js';
import { GUARD } from './poses.js';
import { lerpPose } from './keys.js';

const armedStance = (pose) => { const st = pose.stanceP || GUARD; return !!pose.armed && st.wF !== null && st.wF !== undefined ? st : null; };

/**
 * The block: a high guard, the forearms up before the face with the elbows
 * in, the chin tucked down behind them, knees bent and feet braced. It
 * snaps up with a touch of overshoot (the parry window); a blade is held up
 * across the face instead (two of them crossed). A blow taken on it
 * (pose.blockHitAge) shoves it back into the face and rocks the body back.
 */
export function blockPose(P, pose) {
  const bt = pose.block;
  const over = bt < 0.18 ? Math.sin(Math.min(1, bt / 0.18) * Math.PI) : 0;
  P.hF = [0.2 + 0.03 * over, -0.13 - 0.04 * over]; P.hB = [0.19, -0.07 - 0.02 * over];
  P.eF = 1; P.eB = 1; P.zF = -0.03; P.zB = -0.02;
  P.b = [-0.02 * over, 0.08]; P.l = 0.15; P.ht = 0.12;
  P.fF = [0.21, 0]; P.fB = [-0.19, 0]; P.zfF = 0.02; P.zfB = 0.02;
  P.tw = 0.12; P.hp = 0.08;
  P.hand = 'fist'; P.handB = 'fist';
  const st = pose.armedBlock ? armedStance(pose) : null;
  if (st) {
    P.hF = [0.22, -0.06]; P.wF = -1.45; P.wt = 1.1;
    if (st.wB !== null && st.wB !== undefined) { P.hB = [0.2, -0.04]; P.wB = -1.45; } else P.wB = null;
  } else { P.wF = null; P.wB = null; }
  P.face = 'fierce';
  const ha = pose.blockHitAge;
  if (ha >= 0 && ha < 0.24) {
    const e = ha < 0.03 ? ha / 0.03 : Math.max(0, 1 - (ha - 0.03) / 0.21);
    const hF = toXY(P.hF), hB = toXY(P.hB);
    P.hF = [hF[0] - 0.06 * e, hF[1] + 0.02 * e]; P.hB = [hB[0] - 0.05 * e, hB[1] + 0.02 * e];
    P.l -= 0.14 * e; P.b = [P.b[0] - 0.05 * e, P.b[1] + 0.03 * e]; P.ht -= 0.08 * e;
    P.face = 'grit';
  }
}

/**
 * A parry (pose.parryAge): the lead forearm — or the blade — snaps out and
 * across, beating the blow aside, the body giving a little at the shock; a
 * beat held there (the flash), then back into the guard. A perfect parry
 * (pose.parryPerfect) snaps wider and the rear fist is already cocked for
 * the counter.
 */
export function parryPose(P, pose) {
  const a = pose.parryAge;
  if (!(a >= 0) || a > 0.42) return;
  const big = pose.parryPerfect ? 1.3 : 1;
  const k = a < 0.045 ? sm01(a / 0.045) : 1 - sm01((a - 0.12) / 0.28);
  const st = armedStance(pose);
  P.hF = mixP(P.hF, st ? [0.3, -0.04] : [0.3, -0.1], k);
  P.zF = mixN(P.zF || 0, 0.2 * big, k);
  P.eF = mixN(P.eF ?? 1, st ? 1 : -0.5, k);
  P.tw = (P.tw || 0) - 0.32 * big * k;
  P.hp = (P.hp || 0) - 0.1 * k;
  P.l = (P.l || 0) - 0.08 * k;
  P.b = [P.b[0] - 0.035 * k, P.b[1] + 0.02 * k];
  P.ht = (P.ht || 0) - 0.05 * k;
  if (st) {
    // (the blade beats it aside, swept out from across the body)
    P.wF = mixN(P.wF ?? st.wF, -0.35, k);
    P.wt = mixN(P.wt || 0, -0.5 * big, k);
  }
  if (pose.parryPerfect) { P.hB = mixP(P.hB, [0.0, 0.04], k); P.handB = 'fist'; }
  P.face = 'fierce';
}

/**
 * Parried (pose.parriedAge): the attacker's blow beaten aside — flung wide
 * open, the arms thrown up and out, the chest bared and the head snapped
 * back, a weapon knocked away; a stumbling step back (the back foot, then
 * the front one dragging after it) while still wide open, then gathering
 * back into the guard. Returns whether it's playing.
 */
export function parriedPose(P, pose) {
  const a = pose.parriedAge;
  if (!(a >= 0) || a > 0.95) return false;
  const open = a < 0.07 ? sm01(a / 0.07) : 1 - sm01((a - 0.5) / 0.42);
  const deep = 1 - sm01((a - 0.55) / 0.4);
  const s1 = sm01((a - 0.07) / 0.15), s2 = sm01((a - 0.24) / 0.18);
  const lift1 = a > 0.07 && a < 0.22 ? Math.sin(((a - 0.07) / 0.15) * Math.PI) : 0;
  const lift2 = a > 0.24 && a < 0.42 ? Math.sin(((a - 0.24) / 0.18) * Math.PI) : 0;
  P.hF = mixP(P.hF, [-0.02, -0.2], open); P.hB = mixP(P.hB, [-0.08, -0.16], open);
  P.zF = mixN(P.zF || 0, 0.36, open); P.zB = mixN(P.zB || 0, 0.34, open);
  P.eF = mixN(P.eF ?? 1, 0.3, open); P.eB = mixN(P.eB ?? 1, 0.3, open);
  if (open > 0.35) { P.hand = 'palm'; P.handB = 'palm'; }
  P.l = mixN(P.l || 0, -0.36, open); P.ht = mixN(P.ht || 0, -0.32, open);
  P.tw = mixN(P.tw || 0, 0, open); P.hp = mixN(P.hp || 0, 0, open); P.ls = 0;
  P.b = [mixN(P.b[0], -0.1, deep * sm01(a / 0.1)), mixN(P.b[1], 0.06, deep)];
  const fB = toXY(P.fB), fF = toXY(P.fF);
  P.fB = [mixN(fB[0], -0.3, s1 * deep), fB[1] - 0.08 * lift1];
  P.fF = [mixN(fF[0], 0.05, s2 * deep), fF[1] - 0.07 * lift2];
  const st = armedStance(pose);
  if (st) {
    P.wF = mixN(P.wF ?? st.wF, -2.3, open);
    if (st.wB !== null && st.wB !== undefined) P.wB = mixN(P.wB ?? st.wB, -2.1, open);
  }
  P.sm = 0; P.smF = 0; P.smB = 0; P.smfF = 0; P.smfB = 0;
  P.face = open > 0.3 ? 'shock' : 'fierce';
  return true;
}

/**
 * Guard broken (pose.guardBrokenAge): the guard smashed apart — the forearms
 * knocked up and out, a jolt back, the knees buckling; then two stumbling
 * steps back, bent over and dazed with the arms hanging and the head
 * lolling; then shaking it off back into the guard. Returns whether it's
 * playing.
 */
export function guardBrokenPose(P, pose) {
  const a = pose.guardBrokenAge;
  if (!(a >= 0) || a > 1.15) return false;
  const smash = a < 0.05 ? sm01(a / 0.05) : 1 - sm01((a - 0.07) / 0.2);
  const daze = sm01((a - 0.08) / 0.22) * (1 - sm01((a - 0.62) / 0.5));
  const any = Math.max(smash, daze);
  const s1 = sm01((a - 0.1) / 0.16), s2 = sm01((a - 0.3) / 0.16);
  const lift1 = a > 0.1 && a < 0.26 ? Math.sin(((a - 0.1) / 0.16) * Math.PI) : 0;
  const lift2 = a > 0.3 && a < 0.46 ? Math.sin(((a - 0.3) / 0.16) * Math.PI) : 0;
  P.hF = mixP(mixP(P.hF, [0.14, 0.3], daze), [0.08, -0.16], smash);
  P.hB = mixP(mixP(P.hB, [0.08, 0.32], daze), [-0.02, -0.1], smash);
  P.zF = mixN(mixN(P.zF || 0, 0.05, daze), 0.32, smash); P.zB = mixN(mixN(P.zB || 0, 0.04, daze), 0.32, smash);
  P.eF = mixN(P.eF ?? 1, 0.4, any); P.eB = mixN(P.eB ?? 1, 0.4, any);
  if (any > 0.3) { P.hand = 'palm'; P.handB = 'palm'; }
  P.l = mixN(mixN(P.l || 0, 0.32, daze), -0.32, smash);
  P.ht = mixN(mixN(P.ht || 0, 0.28, daze), -0.3, smash);
  P.tw = mixN(P.tw || 0, -0.25, smash); P.hp = mixN(P.hp || 0, 0, any);
  P.hr = (P.hr || 0) + Math.sin(a * 9) * 0.1 * daze;
  P.b = [mixN(P.b[0], -0.06, any), mixN(P.b[1], 0.1, any)];
  const fB = toXY(P.fB), fF = toXY(P.fF), back = 1 - sm01((a - 0.7) / 0.4);
  P.fB = [mixN(fB[0], -0.28, s1 * back), fB[1] - 0.07 * lift1];
  P.fF = [mixN(fF[0], 0.04, s2 * back), fF[1] - 0.06 * lift2];
  const st = armedStance(pose);
  if (st) {
    P.wF = mixN(P.wF ?? st.wF, 0.9, any);
    if (st.wB !== null && st.wB !== undefined) P.wB = mixN(P.wB ?? st.wB, 1.1, any);
  }
  P.sm = 0; P.smF = 0; P.smB = 0; P.smfF = 0; P.smfB = 0;
  P.face = smash > 0.3 ? 'shock' : daze > 0.2 ? 'hurt' : P.face;
  return true;
}

/**
 * Staggered for as long as the hitstun holds: the guard dropped, the knees
 * gone soft, swaying. (The blow itself is the flinch laid over it; with no
 * blow to tell where from — a Conqueror's stagger, say: pose.stunBlind —
 * knocked back.)
 */
export function hurtPose(P, pose, t) {
  const k = pose.hurtK ?? 1;
  const blind = pose.stunBlind ? 1 : 0;
  const sway = Math.sin(t * 7) * 0.025 * k;
  P.l = (P.l || 0) * (1 - k) + (0.06 - 0.36 * blind) * k + sway;
  P.b = [P.b[0] * (1 - k) - 0.06 * k * blind, P.b[1] * (1 - k) + 0.045 * k];
  P.hF = mixP(P.hF, blind ? [-0.2, 0.08] : [0.17, 0.2], k); P.hB = mixP(P.hB, blind ? [0.2, 0.0] : [0.08, 0.25], k);
  P.eF = 0.5; P.eB = 0.5; P.zF = 0.04 * k; P.zB = 0.04 * k;
  P.fF = [0.13, 0]; P.fB = [-0.15, -0.02];
  P.ht = (P.ht || 0) * (1 - k) + (blind ? -0.24 : 0.08) * k;
  P.tw = (P.tw || 0) * (1 - k); P.hp = (P.hp || 0) * (1 - k);
  P.wF = null; P.wB = null;
  P.hand = 'fist'; P.handB = 'fist';
  P.face = 'hurt';
}

/**
 * A blow's flinch, by where it came from and how hard: the body snaps away
 * from it in a couple of frames — struck from the front the trunk and the
 * head are thrown back, from behind pitched forward, from a side bent over
 * and turned away from it — the arms lagging behind the body and the knees
 * giving; then a rebound, and it settles. The head whips a beat after the
 * body. (pose.hitAge / hitDirRel / hitW from the combat code: hitDirRel is
 * the way the blow pushes, relative to the facing — π struck from the front,
 * 0 from behind, +π/2 pushed toward the right side; else pose.flinch, the
 * hit's own record.) `scale` damps it for a body busy swinging.
 */
export function flinch(P, pose, scale) {
  const fl = pose.flinch;
  const age = pose.hitAge ?? (fl ? fl.age : undefined);
  if (!(age >= 0) || age > 0.75) return;
  const rel = pose.hitDirRel ?? (fl ? fl.rel : Math.PI);
  const w = Math.min(1.5, pose.hitW ?? (fl ? fl.w : 0.5));
  const amp = Math.min(1.3, 0.3 + 0.8 * w) * scale;
  const tau = 0.07 + 0.1 * Math.min(1, w);
  const env = (x) => (x < 0 ? 0 : x < 0.035 ? Math.sin((x / 0.035) * Math.PI / 2) : Math.exp(-(x - 0.035) / tau) * Math.cos((x - 0.035) * 8));
  const e = env(age) * amp, eh = env(age - 0.03) * amp;
  if (Math.abs(e) < 0.004 && Math.abs(eh) < 0.004) return;
  const back = -Math.cos(rel), right = Math.sin(rel);
  P.l = (P.l || 0) - 0.5 * back * e;
  P.b = [P.b[0] - 0.07 * back * e, P.b[1] + 0.04 * Math.abs(e)];
  P.tw = (P.tw || 0) + 0.45 * right * e;
  P.ls = (P.ls || 0) + 0.42 * right * e;
  P.ht = (P.ht || 0) - 0.45 * back * eh;
  P.hr = (P.hr || 0) + 0.42 * right * eh;
  P.hy = (P.hy || 0) - 0.3 * right * eh;
  const hF = toXY(P.hF), hB = toXY(P.hB);
  P.hF = [hF[0] + 0.1 * back * e, hF[1] - 0.09 * Math.abs(back) * e];
  P.hB = [hB[0] + 0.08 * back * e, hB[1] - 0.07 * Math.abs(back) * e];
  P.zF = (P.zF || 0) + (0.07 + 0.08 * Math.max(0, right)) * Math.abs(e); P.zB = (P.zB || 0) + (0.07 + 0.08 * Math.max(0, -right)) * Math.abs(e);
  if (e > 0.25 * amp && scale > 0.5) P.face = 'hurt';
}

/**
 * A counter that landed with no swing of its own to carry it (a riposte off
 * the parry): the rear fist — or the blade's point — snapped out, the body
 * driven in behind it.
 */
export function counterPose(P, pose) {
  const a = pose.counterAge;
  if (!(a >= 0) || a > 0.32) return;
  const k = a < 0.05 ? sm01(a / 0.05) : 1 - sm01((a - 0.1) / 0.22);
  if (armedStance(pose)) {
    P.hF = mixP(P.hF, [0.46, -0.02], k); P.wF = mixN(P.wF ?? 0, -0.05, k);
    P.tw = (P.tw || 0) + 0.5 * k; P.hp = (P.hp || 0) + 0.3 * k;
  } else {
    P.hB = mixP(P.hB, [0.48, -0.04], k);
    P.tw = (P.tw || 0) - 0.6 * k; P.hp = (P.hp || 0) - 0.3 * k;
    P.smB = a < 0.08 ? 0.1 * k : 0;
  }
  P.l = (P.l || 0) + 0.2 * k;
  P.b = [P.b[0] + 0.08 * k, P.b[1] + 0.02 * k];
  P.face = 'shout';
}

/**
 * Armament Haki coated on (pose.armOn: seconds since): the fist brought up
 * before the face, the forearm upright and clenched till it shakes, the
 * other hand gripping its wrist, as the black runs down it (the material).
 */
export function hardenPose(P, a, t) {
  if (!(a >= 0) || a > 0.55) return;
  const e = a < 0.1 ? sm01(a / 0.1) : 1 - sm01((a - 0.3) / 0.25);
  const tr = Math.sin(t * 83) * 0.006 * e;
  P.hF = mixP(P.hF, [0.17 + tr, -0.1], e); P.eF = 1; P.zF = mixN(P.zF || 0, -0.02, e);
  P.hB = mixP(P.hB, [0.17, 0.02], e); P.zB = mixN(P.zB || 0, -0.1, e); P.eB = 1;
  if (e > 0.4) { P.hand = 'fist'; P.handB = 'claw'; P.face = 'grit'; }
  P.ht = (P.ht || 0) + 0.06 * e;
  P.tw = (P.tw || 0) + 0.15 * e;
  // (the weight drops a touch into the knees as the arm locks)
  P.b = [P.b[0], P.b[1] + 0.02 * e];
}

/**
 * Up off the ground after a knockdown (k: 0 → 1 over half a second): sat
 * up with the knees drawn in (the body still tipped back on the ground: see
 * chars/pose.js rigOptions), onto one knee with a hand on it, then a push up
 * off the knee into the guard, shaking the head clear.
 */
export function getUpPose(P, k, t) {
  const SIT = { b: [0, 0.34], l: 0.95, ht: 0.2, hF: [0.24, 0.32], hB: [0.2, 0.34], fF: [0.1, -0.16], fB: [-0.02, -0.08] };
  const KNEE = { b: [0.03, 0.31], l: 0.42, ht: 0.22, hF: [0.25, 0.3], hB: [0.02, 0.33], fF: [0.22, 0], fB: [-0.2, 0] };
  const s = sm01(k / 0.32), up = sm01((k - 0.6) / 0.4);
  const from = s < 1 ? lerpPose(SIT, KNEE, s) : KNEE;
  const G = { b: P.b, l: P.l || 0, ht: P.ht || 0, hF: P.hF, hB: P.hB, fF: P.fF, fB: P.fB };
  const X = lerpPose(from, G, up);
  P.b = X.b; P.l = X.l; P.ht = X.ht; P.hF = X.hF; P.hB = X.hB; P.fF = X.fF; P.fB = X.fB;
  P.eF = 1; P.eB = 1; P.tw = (P.tw || 0) * up; P.hp = (P.hp || 0) * up;
  P.hy = Math.sin(t * 22) * 0.12 * sm01((k - 0.55) / 0.15) * (1 - up);
  P.hand = 'palm'; P.handB = 'fist';
  P.wF = up > 0.6 ? P.wF : null; P.wB = up > 0.6 ? P.wB : null;
}

/** Blown away: folded round the blow, back first, the arms and legs trailing toward whoever struck, the head lolling forward. */
export function launchPose(P, L) {
  P.r = -0.85 * L; P.l = 0.4 * L;
  P.b = [-0.04 * L, 0.06 * L];
  P.hF = mixP(P.hF, [0.32, -0.08], L); P.hB = mixP(P.hB, [0.28, 0.0], L); P.eF = 0.35; P.eB = 0.35;
  P.zF = 0.12 * L; P.zB = 0.12 * L; P.hand = 'palm'; P.handB = 'palm';
  P.fF = [0.32, -0.24 * L]; P.fB = [0.2, -0.14 * L];
  P.ht = 0.28 * L; P.tw = 0; P.hp = 0; P.ls = 0;
  P.face = 'hurt';
  P.wF = null; P.wB = null;
}
