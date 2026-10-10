// Getting about (see docs/ANIMATION.md, "locomotion"): the stride, a weapon
// carried on the move, everyday poses, swimming, the jump, the charged
// crouch and the dodge. Each writes its channels into a pose P that already
// holds the stance.
import { TAU, frac, clamp01, mixN, mixP, sm01, bump, toXY } from './timing.js';
import { SWORD, SWORD2, GUN } from './poses.js';

// ------------------------------------------------------------------ gait
// A proper stride: each foot is planted and sweeps back under the body for a
// share of the cycle (long when walking, short when running), then lifts off
// behind — the heel kicking up — and reaches forward to land again. Running
// has a flight phase with both feet off the ground; the body dips as it takes
// its weight and rises as it pushes off; the arms swing against the legs.
// The cycle's pace is matched to the ground speed so feet don't skate.

/** Stride shape at a speed (m/s, for a human-sized body). */
export function gaitParams(v, sprint) {
  const k = clamp01((v - 1.4) / 3); // 0 walk … 1 run
  const s = sprint ? 1 : 0;
  return {
    k, s,
    sigma: 0.62 - 0.26 * k - 0.05 * s, // share of the cycle each foot is planted
    R: 0.24 + 0.03 * k + 0.06 * s, // half the foot's sweep (2D leg units: 0.49 = a leg)
    H: 0.06 + 0.17 * k + 0.12 * s, // how high the swinging heel kicks up
  };
}

/** Stride cycles per second at a speed: the planted foot keeps pace with the ground. */
export function gaitCadence(v, sprint) {
  const g = gaitParams(v, sprint);
  const sweep = (2 * g.R / 0.49) * 0.86; // metres the foot travels while planted (a 0.86 m leg)
  return Math.max(0.5, v / (sweep / g.sigma));
}

/** One foot at cycle phase u (0 = touching down in front): [forward, lift]. */
function legAt(u, g) {
  if (u < g.sigma) return [g.R - 2 * g.R * (u / g.sigma), 0];
  const v = (u - g.sigma) / (1 - g.sigma);
  const x = -g.R * Math.cos(Math.PI * v);
  const lift = g.H * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.75)), 1.15);
  return [x, lift];
}

/** The legs alone keep walking (a blow thrown on the move: the clip has the upper body). */
export function walkLegs(P, pose) {
  const g = gaitParams(pose.speed ?? 3, pose.sprint);
  const u = frac((pose.walk || 0) / TAU);
  const a = legAt(u, g), b = legAt(frac(u + 0.5), g);
  P.fF = [0.03 + a[0], -a[1]];
  P.fB = [-0.03 + b[0], -b[1]];
}

/** Legs, bob, lean and (unless busy fighting) arms of the stride. */
export function gaitPose(P, pose, base) {
  const g = gaitParams(pose.speed ?? 3, pose.sprint);
  const u = frac((pose.walk || 0) / TAU);
  const uB = frac(u + 0.5);
  const a = legAt(u, g), b = legAt(uB, g);
  P.fF = [0.03 + a[0], -a[1]];
  P.fB = [-0.03 + b[0], -b[1]];
  // the body is lowest mid-stance, highest (off the ground, running) in between
  const mid = (w) => (w < g.sigma ? Math.sin(Math.PI * w / g.sigma) : 0);
  const load = Math.max(mid(u), mid(uB));
  P.b = [0.02 * g.k + 0.02 * g.s, 0.012 + load * (0.012 + 0.03 * g.k + 0.015 * g.s)];
  if (g.sigma < 0.5) {
    const fl = (w) => (w >= g.sigma && w < 0.5 ? Math.sin(Math.PI * (w - g.sigma) / (0.5 - g.sigma)) : 0);
    P.z = (P.z || 0) + Math.max(fl(u), fl(uB)) * (0.025 * g.k + 0.025 * g.s);
  }
  P.l = (P.l || 0) * (1 - g.k) + 0.03 + 0.15 * g.k + 0.12 * g.s;
  P.ht = (P.ht || 0) - P.l * 0.45;
  const armed = base.wF !== null && base.wF !== undefined;
  // (fists up in a fight stay up: only a weapon's carry moves with the stride)
  if (pose.combat && !armed) return;
  // arms swing against the legs: the right hand forward as the right foot goes back
  const swF = clamp01(0.5 - a[0] / (2 * g.R)), swB = clamp01(0.5 - b[0] / (2 * g.R));
  const run = clamp01(g.k * 1.3 - 0.2);
  const walkArm = (s) => [mixN(-0.1, 0.14, s), 0.38 - s * 0.03];
  const runArm = (s) => [mixN(-0.14, 0.22 + 0.04 * g.s, s), mixN(0.28, 0.06, s)];
  const wF = walkArm(swF), wB = walkArm(swB), rF = runArm(swF), rB = runArm(swB);
  const freeB = [mixN(wB[0], rB[0], run) - 0.01, mixN(wB[1], rB[1], run)];
  if (armed) { carryPose(P, pose, base, freeB, u, load); return; }
  P.hF = [mixN(wF[0], rF[0], run) + 0.02, mixN(wF[1], rF[1], run)];
  P.hB = freeB;
  P.eF = 1; P.eB = 1;
  if (run > 0.5) { P.hand = 'fist'; P.handB = 'fist'; }
}

/**
 * A weapon in hand, on the move: carried, not swung about like an empty arm.
 * Held in its stance, rocking a little with each step; at a sprint a blade
 * trails low behind you (two of them, for two swords — the swordsman's run),
 * a gun is held low, and a staff or an axe is carried across the body. The
 * hand that isn't on the weapon swings with the stride.
 */
function carryPose(P, pose, base, freeB, u, load) {
  const sw = Math.sin(u * TAU), bob = 0.014 * load, sprint = !!pose.sprint;
  const sword = base === SWORD || base === SWORD2, two = base === SWORD2;
  P.eF = 1; P.eB = 1;
  if (base === GUN) {
    P.hF = sprint ? [0.15 + 0.02 * sw, 0.27 + bob] : [0.21 + 0.02 * sw, 0.19 + bob];
    P.wF = sprint ? 1.25 : 0.8;
    P.hB = freeB;
    return;
  }
  if (sprint && sword) {
    P.hF = [-0.13 + 0.03 * sw, 0.3 + bob]; P.wF = 2.55;
    if (two) { P.hB = [-0.16 - 0.03 * sw, 0.3 + bob]; P.wB = 2.65; } else P.hB = freeB;
    return;
  }
  const hF = toXY(base.hF), hB = toXY(base.hB), low = sprint ? 0.05 : 0.02;
  P.hF = [hF[0] + 0.015 * sw, hF[1] + low + bob];
  P.hB = [hB[0] - 0.015 * sw, hB[1] + low + bob];
  P.wF = base.wF + 0.05 * sw + (sprint ? 0.2 : 0);
  if (base.wB !== null && base.wB !== undefined) P.wB = base.wB - 0.05 * sw + (sprint ? 0.2 : 0);
}

// ------------------------------------------------------------------ everyday
/**
 * Everyday poses for townsfolk (see game/townlife.js): leaning on a wall with
 * the arms folded, sitting, chatting with the hands, sweeping, minding a
 * stall, fishing, swaying with a mug. (The 3D rig adds the seat height and
 * folds the arms across; see chars/pose.js.)
 */
export function activityPose(P, act, t) {
  const s1 = Math.sin(t * 1.3), s2 = Math.sin(t * 0.7);
  switch (act) {
    case 'lean':
      P.l = -0.1; P.b = [-0.05, 0.005];
      P.hF = [0.14, 0.2]; P.hB = [0.13, 0.22]; P.eF = 1; P.eB = 1;
      P.fF = [0.15, 0]; P.fB = [0.01, 0];
      P.ht = -0.05 + s2 * 0.035;
      break;
    case 'sit':
      P.l = 0.1; P.b = [-0.07, 0];
      P.fF = [0.3, 0]; P.fB = [0.27, 0];
      P.hF = [0.27, 0.34]; P.hB = [0.25, 0.36]; P.hand = 'palm'; P.handB = 'palm';
      P.ht = s2 * 0.04;
      break;
    case 'chat': {
      // talking with the hands, a nod now and then
      const g = Math.max(0, Math.sin(t * 1.9 + 1));
      P.hF = [0.1 + g * 0.12, 0.36 - g * 0.24]; P.hand = g > 0.3 ? 'palm' : 'fist';
      P.hB = [0.02, 0.4];
      P.ht = Math.sin(t * 2.3) * 0.05;
      P.fF = [0.08, 0]; P.fB = [-0.08, 0];
      break;
    }
    case 'sweep': {
      const k = Math.sin(t * 3.2);
      P.l = 0.2; P.b = [0.02, 0.03];
      P.hF = [0.22 + k * 0.1, 0.34]; P.hB = [0.1 + k * 0.1, 0.12];
      P.wF = 1.25 + k * 0.22; P.wB = null;
      P.fF = [0.15, 0]; P.fB = [-0.12, 0];
      break;
    }
    case 'vend': {
      const call = Math.sin(t * 0.5) > 0.85;
      P.l = 0.1;
      P.hF = call ? [0.12, -0.3] : [0.27, 0.3]; P.hB = [0.25, 0.31]; P.hand = 'palm'; P.handB = 'palm';
      P.ht = call ? -0.12 : 0;
      break;
    }
    case 'fish':
      P.l = 0.12; P.b = [-0.06, 0];
      P.fF = [0.32, 0]; P.fB = [0.28, 0];
      P.hF = [0.26, 0.2]; P.hB = [0.2, 0.28];
      P.wF = -0.5 + s1 * 0.03; P.wB = null;
      break;
    case 'drunk':
      P.l = 0.1 + s2 * 0.09; P.b = [0.035 * s1, 0.025];
      P.hF = [0.17, 0.06 + Math.max(0, s1) * 0.1]; P.wF = -1.35; P.hB = [-0.02, 0.4];
      P.ht = 0.14 * s2;
      P.fF = [0.1, 0]; P.fB = [-0.12, 0];
      break;
    // ---- stances: how someone with a part to play stands about waiting
    // (quest-givers and bosses — see game/npcs.js stanceFor), each breathing,
    // shifting their weight now and then
    case 'fold': {
      // arms folded high across the chest, feet planted apart, chin up
      const w = Math.sin(t * 0.37) > 0.6 ? 1 : 0;
      P.hF = [0.13, 0.1]; P.hB = [0.12, 0.12]; P.eF = 1; P.eB = 1;
      P.fF = [0.1 + 0.02 * w, 0]; P.fB = [-0.1, 0];
      P.l = -0.03; P.ht = -0.05 + s2 * 0.02;
      break;
    }
    case 'hips': {
      // fists on the hips, elbows out, standing wide: daring you
      P.hF = [-0.02, 0.27]; P.hB = [-0.03, 0.28]; P.hand = 'fist'; P.handB = 'fist';
      P.fF = [0.13, 0]; P.fB = [-0.13, 0];
      P.l = -0.04; P.ht = -0.06 + s2 * 0.025;
      break;
    }
    case 'attention': {
      // a Marine at ease: hands clasped behind the back, straight-backed
      P.hF = [-0.13, 0.31]; P.hB = [-0.14, 0.32];
      P.fF = [0.06, 0]; P.fB = [-0.06, 0];
      P.l = -0.02; P.ht = -0.04 + s2 * 0.015;
      break;
    }
    case 'shoulder': {
      // the blade drawn and laid back over the shoulder, weight on the back foot
      P.hF = [0.07, -0.02]; P.wF = -2.35; P.hand = 'fist'; P.eF = 1;
      P.hB = [0.06, 0.37];
      P.fF = [0.14, 0]; P.fB = [-0.09, 0];
      P.l = -0.05; P.ht = -0.03 + s2 * 0.02;
      break;
    }
    case 'fistpalm': {
      // impatient: punching a fist into the open palm, again and again
      const k = Math.max(0, Math.sin(t * 2.2));
      P.hB = [0.2, 0.2]; P.handB = 'palm';
      P.hF = [0.22 - 0.06 * (1 - k), 0.18 - 0.08 * (1 - k)]; P.hand = 'fist';
      P.fF = [0.11, 0]; P.fB = [-0.11, 0];
      P.l = 0.04; P.ht = -0.02 + 0.03 * k;
      break;
    }
    case 'think': {
      // a hand to the chin, the other arm across under it
      P.hF = [0.11, 0.0]; P.hand = 'fist'; P.eF = 1;
      P.hB = [0.12, 0.16]; P.eB = 1;
      P.fF = [0.07, 0]; P.fB = [-0.08, 0];
      P.ht = 0.05 + s2 * 0.03;
      break;
    }
    // a wanted poster's (ui/screens.js wantedPoster): the face it's struck
    // with is part of the pose
    case 'poster-fist':
      // a fist up by the face, grinning
      P.hF = [0.13, -0.14]; P.hand = 'fist'; P.eF = 1;
      P.hB = [0.04, 0.38];
      P.ht = -0.04;
      break;
    case 'poster-fold':
      // arms folded high across the chest, chin up, a cold look
      P.hF = [0.13, 0.1]; P.hB = [0.12, 0.12]; P.eF = 1; P.eB = 1;
      P.ht = -0.06; P.face = 'glare';
      break;
    case 'poster-power':
      // an open hand held up beside the head, the power in it
      P.hF = [0.15, -0.17]; P.hand = 'palm'; P.eF = 1;
      P.hB = [0.06, 0.36]; P.handB = 'fist';
      P.l = 0.08; P.face = 'fierce';
      break;
    case 'poster-point':
      // pointing straight out of the poster at whoever's reading it
      P.hF = [0.38, 0.06]; P.hand = 'fist'; P.eF = 0.1;
      P.hB = [0.1, 0.3]; P.handB = 'fist';
      P.l = 0.1; P.face = 'fierce';
      break;
    case 'poster-blade':
      // the blade drawn and laid back over the shoulder
      P.hF = [0.07, -0.02]; P.wF = -2.35; P.hand = 'fist'; P.eF = 1;
      P.hB = [0.05, 0.36];
      P.ht = -0.03; P.face = 'glare';
      break;
    case 'poster-roar':
      // both fists up, roaring
      P.hF = [0.2, -0.08]; P.hB = [0.2, -0.06]; P.hand = 'fist'; P.handB = 'fist'; P.eF = 1; P.eB = 1;
      P.ht = -0.14; P.l = 0.06; P.face = 'shout';
      break;
  }
}

// ------------------------------------------------------------------ swimming
/**
 * A looping key track, sampled smoothly: keys are [u, ...values] with u in
 * [0, 1) in order; between them a cubic runs through every key without
 * stopping at it (the tangents come from the neighbours, so an uneven
 * spacing of keys still eases in and out properly). Writes into `out`.
 */
export function loopTrack(keys, u, out) {
  const n = keys.length;
  u = ((u % 1) + 1) % 1;
  let i = n - 1;
  for (let k = 0; k < n; k++) if (keys[k][0] > u) { i = (k - 1 + n) % n; break; }
  const gap = (a, b) => (((b[0] - a[0]) % 1) + 1) % 1 || 1;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  const g0 = gap(k0, k1), g1 = gap(k1, k2), g2 = gap(k2, k3);
  const t = ((((u - k1[0]) % 1) + 1) % 1) / g1;
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  for (let j = 1; j < k1.length; j++) {
    const m1 = (k2[j] - k0[j]) / (g0 + g1), m2 = (k3[j] - k1[j]) / (g1 + g2);
    out[j - 1] = h00 * k1[j] + h10 * g1 * m1 + h01 * k2[j] + h11 * g1 * m2;
  }
  return out;
}

// The breaststroke along the surface, as swimmers are taught it (and as it
// looks from the side): out of the glide the hands press out wide; they sweep
// down and in under the chest — the head and shoulders rise for the breath,
// the hips sink — meet under the chin and shoot forward together, just under
// the surface, while the heels come up to the seat, knees apart; then the
// frog kick whips the feet out and back together and the body lunges long and
// flat into the glide. Only the head, and the shoulders at the breath, show
// above the water.
//   BODY: u, the body's angle above level (degrees), sink (hips drop at the
//   breath), the back's arch; the hands as seen from the side (reach forward
//   and height, from the shoulder, in arm lengths of 0.43), how wide (spread)
//   and the elbows' bend
const STROKE_BODY = [
  [0.00, 11, 0.000, 0.00, 0.425, -0.07, -0.10, 0.05],
  [0.15, 13, 0.000, 0.00, 0.37, -0.09, 0.24, 0.2],
  [0.28, 20, -0.010, -0.05, 0.24, -0.24, 0.16, 0.85],
  [0.38, 25, -0.030, -0.10, 0.12, -0.18, -0.10, 1],
  [0.46, 23, -0.030, -0.08, 0.19, -0.11, -0.12, 0.8],
  [0.56, 15, -0.015, -0.02, 0.42, -0.075, -0.10, 0.1],
  [0.78, 10, 0.005, 0.00, 0.43, -0.07, -0.10, 0.05],
];
//   LEGS: u, the feet (forward, up: the heels drawn up to the seat, in 2D leg
//   units) and how far apart
const STROKE_LEGS = [
  [0.00, 0, 0, -0.05],
  [0.26, -0.004, -0.02, -0.03],
  [0.38, -0.03, -0.12, 0.06],
  [0.47, -0.042, -0.17, 0.11],
  [0.55, -0.03, -0.11, 0.21],
  [0.63, -0.008, -0.03, 0.14],
  [0.70, 0, 0, -0.05],
];
const _sb = [], _sl = [];
/** The body-frame hand target for a hand at (fwd, up) from the shoulder, seen from the side, with the body turned face-down by r. */
const sideHand = (r, fwd, up) => [fwd * Math.cos(r) - up * Math.sin(r), -(fwd * Math.sin(r) + up * Math.cos(r))];

/**
 * Swimming. The horizontal strokes turn the whole body face-down (P.r), so an
 * arm "overhead" in the body's frame reaches forward through the water.
 *   tread: upright, sculling hands, egg-beater legs (a rest at the surface)
 *   crawl: along the surface: the breaststroke (above), head up
 *   dive: underwater breaststroke (both arms sweep, a frog kick), tipping with the dive
 *   float: hanging in the water, slow sculling
 *   fish: a dolphin kick, arms along the sides, fast and smooth (Fish-Men swim
 *     the breaststroke like everyone, quicker: see actor.js swimRate)
 *   struggle: a Devil Fruit user thrashing to keep their head up
 *   sink: a Devil Fruit user whose strength has gone, limp and going down
 */
export function swimPose(P, kind, t, dir) {
  P.wF = null; P.wB = null; P.b = [0, 0]; P.l = 0; P.z = 0; P.legSpread = 0;
  switch (kind) {
    case 'crawl': {
      // (in step with the first-person arms: one stroke every 2π/3.6 s)
      const u = (t * 3.6) / TAU;
      const [deg, sink, arch, fwd, up, spread, elbow] = loopTrack(STROKE_BODY, u, _sb);
      const [fx, fy, legs] = loopTrack(STROKE_LEGS, u, _sl);
      const r = Math.PI / 2 - deg * Math.PI / 180;
      P.r = r; P.l = arch; P.z = sink;
      P.hF = sideHand(r, fwd, up); P.hB = P.hF.slice();
      P.eF = elbow; P.eB = elbow; P.spread = spread;
      P.hand = 'flat'; P.handB = 'flat';
      P.fF = [fx, fy]; P.fB = [fx, fy]; P.legSpread = legs;
      // the head up, looking ahead over the water (its axis some 35° off
      // upright, whatever the body's doing)
      P.ht = 0.61 - r - arch;
      break;
    }
    case 'dive': {
      const w = t * 2.3, s = Math.sin(w);
      P.hF = [0.16 + 0.12 * Math.cos(w), -0.48 + 0.36 * Math.max(0, s)]; P.hB = P.hF.slice();
      P.eF = 0.5; P.eB = 0.5; P.hand = 'flat'; P.handB = 'flat';
      const kick = Math.max(0, -s);
      P.fF = [0.05 * kick, -0.16 * kick]; P.fB = [0.05 * kick, -0.16 * kick];
      P.r = 1.28 - dir * 0.4; P.ht = -0.3;
      P.spread = 0.12 * Math.max(0, s);
      break;
    }
    case 'fish': {
      const w = t * 5.5;
      P.hF = [0.02, 0.42]; P.hB = [0.02, 0.42]; P.eF = 0.2; P.eB = 0.2;
      const k = Math.sin(w) * 0.12;
      P.fF = [k, 0]; P.fB = [k, 0];
      P.r = 1.45 + Math.sin(w - 0.8) * 0.07 - dir * 0.3; P.ht = -0.35;
      break;
    }
    case 'float': {
      const w = t * 1.6;
      P.hF = [0.22 + 0.05 * Math.sin(w), 0.18]; P.hB = [0.2 - 0.05 * Math.sin(w), 0.2];
      P.hand = 'flat'; P.handB = 'flat';
      P.fF = [0.05 * Math.sin(w * 0.7), -0.04 * Math.max(0, Math.sin(w * 0.7))]; P.fB = [-0.05 * Math.sin(w * 0.7), -0.04 * Math.max(0, -Math.sin(w * 0.7))];
      P.r = 0.4;
      break;
    }
    case 'struggle': {
      const w = t * 9;
      P.hF = [0.1 + 0.1 * Math.sin(w), -0.42 + 0.16 * Math.cos(w)]; P.hB = [0.08 - 0.1 * Math.sin(w + 1), -0.36 + 0.16 * Math.cos(w + 1)];
      P.hand = 'palm'; P.handB = 'palm'; P.eF = 0.4; P.eB = 0.4;
      P.fF = [0.12 * Math.sin(w * 0.8), -0.12 * Math.max(0, Math.cos(w * 0.8))]; P.fB = [-0.12 * Math.sin(w * 0.8), -0.12 * Math.max(0, -Math.cos(w * 0.8))];
      P.ht = -0.28; P.r = -0.08; P.face = 'hurt';
      break;
    }
    case 'sink': {
      // a Devil Fruit user with no strength left: limp, going down feet first,
      // the arms trailing up above the head in the water, head lolling
      const w = t * 1.2, s = Math.sin(w);
      P.hF = [0.12 + 0.04 * s, -0.36 + 0.05 * Math.cos(w)]; P.hB = [0.06 - 0.04 * s, -0.32 - 0.05 * Math.cos(w)];
      P.hand = 'relaxed'; P.handB = 'relaxed'; P.eF = 0.3; P.eB = 0.3;
      P.fF = [0.05 + 0.02 * s, -0.06]; P.fB = [-0.04 - 0.02 * s, -0.1];
      P.ht = -0.22 + 0.04 * s; P.r = -0.12; P.face = 'hurt';
      break;
    }
    default: { // tread
      const w = t * 2.6;
      P.hF = [0.2 + 0.06 * Math.sin(w), 0.26]; P.hB = [0.18 - 0.06 * Math.sin(w), 0.28];
      P.hand = 'flat'; P.handB = 'flat';
      P.fF = [0.1 * Math.sin(w), -0.1 * Math.max(0, Math.cos(w))]; P.fB = [-0.1 * Math.sin(w), -0.1 * Math.max(0, -Math.cos(w))];
      P.r = 0.08; P.ht = 0.05;
    }
  }
}

// ------------------------------------------------------------------ jumps
/** In the air from a jump: knees drawn up and arms high on the way up, legs reaching for the ground on the way down. */
export function airPose(P, air) {
  const k = air.k || 0;
  if (air.up) {
    // (the knees come up in front of the body, never back up into it)
    P.fF = [0.22, -0.16 - 0.06 * k]; P.fB = [0.02, -0.2 - 0.08 * k];
    P.hF = [0.16, -0.24 - 0.08 * k]; P.hB = [0.0, -0.2 - 0.06 * k];
    P.l = 0.06;
  } else {
    P.fF = [0.12, -0.06]; P.fB = [-0.1, -0.12];
    P.hF = [0.28, 0.02]; P.hB = [-0.24, 0.06];
    P.l = 0.1;
  }
  P.b = [0, 0.02];
  P.eF = 1; P.eB = 1;
}

/**
 * Climbing (pose.climb: k 0..1 through it). Up a ledge — a mantle: both
 * hands up on the top, the body hauled up close against the edge (the
 * hands, staying put on the top, come down the body to the chest), a knee
 * brought up over the edge, then a push off the hands to stand. Up a
 * ladder: hand over hand, each hand reaching for the rung over the other as
 * the opposite foot steps up, the body close in to it, and over the rail at
 * the top as up a ledge.
 */
export function climbPose(P, c) {
  const k = c.k;
  P.eF = 1; P.eB = 1; P.hand = 'fist'; P.handB = 'fist';
  if (c.ladder && k < 0.82) {
    // Hand over hand, as you really climb one: each hand closes on a rung
    // and stays on it — the body rising past it, so it comes down from over
    // your head toward your shoulder — then lets go and reaches up past the
    // other for the next rung but one; the opposite foot does the same on
    // the rungs below (a step up as that hand reaches). A cycle is two rungs
    // (0.6 m) climbed; the two sides half a cycle apart, so one hand always holds.
    const cyc = (c.rise || 0) / 0.6;
    const limb = (u, top, low, out) => {
      u -= Math.floor(u);
      // (holding: 78% of the cycle, sliding down with the climb; reaching: the rest, an eased lift)
      if (u < 0.78) return [out, top + (low - top) * (u / 0.78), 1];
      const r = sm01((u - 0.78) / 0.22);
      return [out - 0.05 * Math.sin(r * Math.PI), low + (top - low) * r, 0];
    };
    const [hxF, hyF, gF] = limb(cyc, -0.5, -0.06, 0.2), [hxB, hyB, gB] = limb(cyc + 0.5, -0.5, -0.06, 0.2);
    // (the feet: the left foot steps as the right hand reaches)
    const [fxF, fyF] = limb(cyc + 0.5 + 0.12, -0.34, 0.02, 0.12), [fxB, fyB] = limb(cyc + 0.12, -0.34, 0.02, 0.12);
    P.l = 0.06; P.b = [0.03, 0.05];
    P.hF = [hxF, hyF]; P.hB = [hxB, hyB];
    P.fF = [fxF, fyF]; P.fB = [fxB, fyB];
    // (the hand on a rung is closed round it; the reaching one opens for the next)
    P.hand = gF ? 'fist' : 'palm'; P.handB = gB ? 'fist' : 'palm';
    // (looking up the ladder a little, toward the hand that reaches)
    P.ht = -0.14;
    return;
  }
  const m = c.ladder ? (k - 0.82) / 0.18 : k;
  const ss = (a, b) => sm01((m - a) / (b - a));
  const grip = ss(0, 0.18), haul = ss(0.12, 0.62), knee = bump(m, 0.4, 0.95), stand = ss(0.68, 1);
  // the hands: up over the head on the top, then (staying there as the body
  // rises past them) down to the chest, then pushing down at the hips
  const hy = -0.42 * grip + 0.55 * haul + 0.12 * stand, hx = 0.2 - 0.04 * haul;
  P.hF = [hx, hy]; P.hB = [hx - 0.02, hy + 0.02];
  if (stand > 0.6) { P.hand = 'palm'; P.handB = 'palm'; }
  P.l = 0.1 + 0.18 * haul * (1 - stand) + 0.04 * (1 - stand);
  P.b = [0.03, 0.04 + 0.12 * knee * (1 - stand)];
  // the legs hang and scrabble, then one knee comes up over the edge, the other foot follows
  // (the knee comes forward onto the edge, in front of the hips: not drawn up into the chest)
  P.fF = [0.06 + 0.3 * knee * (1 - stand) + 0.07 * stand, -0.1 * (1 - grip) - 0.18 * knee * (1 - stand)];
  P.fB = [-0.04 + 0.08 * haul * (1 - stand) - 0.05 * stand, -0.04 * (1 - haul) - 0.12 * haul * (1 - stand)];
  P.ht = -0.15 * (1 - haul) + 0.08 * haul * (1 - stand);
  P.face = 'grit';
}

/**
 * Crouched to sneak (k 0..1 easing in): hips low, knees bent, the body bent
 * forward with the head up to see ahead, and the free hands held low in
 * front — the stride (already in P) kept, shorter and lower.
 */
export function crouchPose(P, k, pose) {
  const b = toXY(P.b);
  P.b = [b[0] + 0.03 * k, b[1] + 0.16 * k];
  P.l = (P.l || 0) * (1 - 0.6 * k) + 0.26 * k;
  P.ht = (P.ht || 0) * (1 - k) - 0.12 * k;
  if (P.z) P.z *= 1 - k;
  const fF = toXY(P.fF || [0.13, 0]), fB = toXY(P.fB || [-0.13, 0]);
  if (pose.moving) {
    P.fF = [fF[0] * (1 - 0.15 * k) + 0.04 * k, fF[1] * (1 - 0.4 * k)];
    P.fB = [fB[0] * (1 - 0.15 * k) + 0.04 * k, fB[1] * (1 - 0.4 * k)];
  } else {
    P.fF = [fF[0] + (0.15 - fF[0]) * k, fF[1] * (1 - k)];
    P.fB = [fB[0] + (-0.11 - fB[0]) * k, fB[1] * (1 - k)];
  }
  // (fists up in a fight, or a weapon in hand, keep their place)
  const armed = P.wF !== null && P.wF !== undefined;
  if (pose.combat || armed || pose.block !== undefined) return;
  const sw = pose.moving ? Math.sin(pose.walk || 0) * 0.04 : 0;
  const hF = toXY(P.hF || [0, 0.38]), hB = toXY(P.hB || [0, 0.38]);
  P.hF = [mixN(hF[0], 0.15 - sw, k), mixN(hF[1], 0.27, k)];
  P.hB = [mixN(hB[0], 0.08 + sw, k), mixN(hB[1], 0.3, k)];
  P.eF = 1; P.eB = 1;
  if (k > 0.5) { P.hand = 'palm'; P.handB = 'palm'; }
}

/** Crouched to spring (a charged jump): hips down, weight forward, arms swung back — a tremble at full charge. */
export function chargePose(P, k, t) {
  const tr = k > 0.95 ? Math.sin(t * 70) * 0.006 : 0;
  P.b = [0.02 * k + tr, 0.04 + 0.19 * k];
  P.l = 0.1 + 0.24 * k;
  P.fF = [0.15, 0]; P.fB = [-0.13, 0];
  P.hF = [0.08 - 0.26 * k, 0.3 + 0.06 * k]; P.hB = [0.02 - 0.28 * k, 0.32 + 0.05 * k];
  P.eF = 1; P.eB = 1;
  P.ht = 0.1 * k;
  if (k > 0.5) P.face = 'fierce';
}

// ------------------------------------------------------------------ the dodge
// A dodge is a dash, not a tumble: pushed off low, the body thrown into the
// way it goes, and braked to a stop low and ready — the anime dash-stop. It
// runs 0 → 1 across the dash (pose.dodge), along any heading from the facing
// (pose.dodgeDir: cos of it, pose.dodgeSide: sin, + to the right), mixing a
// forward lunge, a backstep hop and a side-step slide by how much of each
// the heading is. A race dodges its own way (pose.dodgeKind):
//   dash    anyone: low and fast, the feet just off the ground
//   glide   a Skypiean: a light hop that floats on its little wings
//   wing    a Lunarian: one great beat of the black wings, a short flight
//   pounce  a Mink: a springing bound, low, the claws near the ground
//   heavy   a big body (a Buccaneer): a lumbering shove of a step, grounded
// The three beats: push (the first sixth), travel, brake (the last third).
// `r` pitches the whole body (legs and all) — the dash is thrown forward off
// its feet, the hop rocks back — while `l` bends the trunk over the hips.
const DODGE = {
  fwd: {
    push: { r: 0.04, b: [0.03, 0.08], l: 0.36, ht: -0.16, tw: -0.12, hp: -0.06, fF: [0.15, -0.05], fB: [-0.26, 0], hF: [0.02, 0.2], hB: [-0.12, 0.17], eF: 0.7, eB: 0.7 },
    fly: { r: 0.22, b: [0.05, 0.06], z: 0.05, l: 0.32, ht: -0.34, tw: -0.05, hp: 0, fF: [0.24, -0.09], fB: [-0.3, -0.08], hF: [-0.22, 0.24], hB: [-0.28, 0.2], zF: 0.05, zB: 0.05, eF: 0.4, eB: 0.4 },
    brake: { r: -0.05, b: [-0.04, 0.12], l: 0.14, ht: -0.02, tw: 0.08, hp: 0.06, fF: [0.32, 0], fB: [-0.18, 0], hF: [0.2, 0.03], hB: [0.1, 0.08], eF: 1, eB: 1 },
  },
  back: {
    push: { r: 0, b: [0.02, 0.08], l: 0.14, ht: 0.04, tw: 0.1, hp: 0.04, fF: [0.17, 0], fB: [-0.15, -0.04], hF: [0.21, -0.04], hB: [0.13, 0.02] },
    fly: { r: -0.13, b: [-0.04, 0.03], z: 0.12, l: 0.0, ht: 0.16, tw: 0.12, hp: 0.06, fF: [0.13, -0.11], fB: [-0.12, -0.05], hF: [0.2, -0.08], hB: [0.14, -0.02] },
    brake: { r: 0, b: [-0.04, 0.13], l: 0.18, ht: 0.06, tw: 0.1, hp: 0.06, fF: [0.22, 0], fB: [-0.26, 0], hF: [0.21, -0.03], hB: [0.13, 0.03] },
  },
  side: {
    push: { r: 0, b: [0, 0.1], l: 0.1, ht: 0.02, tw: 0.08, fF: [0.14, 0], fB: [-0.1, 0], hF: [0.21, 0], hB: [0.12, 0.05] },
    fly: { r: 0, b: [0, 0.12], z: 0.03, l: 0.12, ht: 0.03, tw: 0.08, fF: [0.12, -0.06], fB: [-0.08, -0.02], hF: [0.22, 0.01], hB: [0.12, 0.06] },
    brake: { r: 0, b: [0, 0.15], l: 0.14, ht: 0.04, tw: 0.1, fF: [0.15, 0], fB: [-0.12, 0], hF: [0.21, -0.01], hB: [0.12, 0.04] },
  },
};
const DODGE_CH = ['r', 'b', 'l', 'ht', 'tw', 'hp', 'z', 'fF', 'fB', 'hF', 'hB', 'zF', 'zB', 'eF', 'eB', 'zfF', 'zfB'];
const _dq = {};
/** One direction's pose at k: push → fly → brake → (the stance it lands in). */
function dodgeBeat(D, k, out) {
  const w0 = 1 - sm01(k / 0.16), w2 = sm01((k - 0.6) / 0.28);
  const w1 = Math.max(0, 1 - w0 - w2);
  for (const c of DODGE_CH) {
    const a = D.push[c], b = D.fly[c], e = D.brake[c];
    if (a === undefined && b === undefined && e === undefined) { out[c] = undefined; continue; }
    if (Array.isArray(a ?? b ?? e)) {
      const A = a || [0, 0], B = b || A, E = e || B;
      out[c] = [A[0] * w0 + B[0] * w1 + E[0] * w2, A[1] * w0 + B[1] * w1 + E[1] * w2];
    } else out[c] = (a ?? 0) * w0 + (b ?? 0) * w1 + (e ?? 0) * w2;
  }
  return out;
}

/**
 * The dodge pose (see above). The 3D rig leans the whole body into a
 * sideways slide (chars/pose.js rigOptions).
 */
export function dodgePose(P, pose) {
  const k = clamp01(pose.dodge), kind = pose.dodgeKind || 'dash';
  const dir = pose.dodgeDir ?? 1, side = pose.dodgeSide ?? (Math.abs(dir) < 0.35 ? 1 : 0);
  const n = Math.hypot(dir, side) || 1;
  const c = dir / n, s = side / n;
  const wF = Math.max(0, c) ** 2, wB = Math.max(0, -c) ** 2, wS = s * s;
  const F = wF > 0.001 ? dodgeBeat(DODGE.fwd, k, {}) : null;
  const Bk = wB > 0.001 ? dodgeBeat(DODGE.back, k, {}) : null;
  const S = wS > 0.001 ? dodgeBeat(DODGE.side, k, _dq) : null;
  const tot = wF + wB + wS || 1;
  for (const ch of DODGE_CH) {
    let x = 0, y = 0, arr = false, any = false;
    for (const [D, w] of [[F, wF], [Bk, wB], [S, wS]]) {
      if (!D || D[ch] === undefined) continue;
      any = true;
      if (Array.isArray(D[ch])) { arr = true; x += D[ch][0] * w; y += D[ch][1] * w; } else x += D[ch] * w;
    }
    if (!any) continue;
    P[ch] = arr ? [x / tot, y / tot] : x / tot;
  }
  // sideways: the leading foot reaches out to its own side and the other
  // closes up after it, the leading arm out a little for balance
  if (wS > 0.001) {
    const lead = s > 0 ? 1 : -1, reach = bump(k, 0.05, 0.85), close = sm01((k - 0.55) / 0.4);
    const out = 0.3 * reach * wS + 0.12 * close * wS, trail = 0.04 * wS + 0.06 * close * wS;
    P.zfF = (lead > 0 ? out : trail); P.zfB = (lead > 0 ? trail : out);
    if (lead > 0) P.zF = (P.zF || 0) + 0.08 * reach * wS; else P.zB = (P.zB || 0) + 0.08 * reach * wS;
  }
  const fly = bump(k, 0.1, 0.9);
  // each race's own
  if (kind === 'glide') {
    // up on the little wings, toes pointed, arms opening for balance; a soft landing
    P.z = (P.z || 0) + 0.22 * fly;
    P.r = (P.r || 0) * 0.6; P.l = (P.l || 0) * 0.7;
    P.fF = mixP(P.fF, [0.05, -0.12], fly * 0.7); P.fB = mixP(P.fB, [-0.1, -0.16], fly * 0.7);
    P.zF = (P.zF || 0) + 0.14 * fly; P.zB = (P.zB || 0) + 0.14 * fly;
    P.ws = sm01(k / 0.15) * (1 - sm01((k - 0.8) / 0.2));
    P.wg = Math.sin(Math.min(1, k / 0.45) * Math.PI) * 0.9;
  } else if (kind === 'wing') {
    // one great downbeat of the wings throws the body into a short flight,
    // laid out along the way it goes, the legs trailing straight together
    P.z = (P.z || 0) + 0.32 * fly;
    P.r = mixN(P.r || 0, 0.75 * (wF + 0.4 * wS) - 0.35 * wB, fly);
    P.l = mixN(P.l || 0, 0.08, fly);
    P.ht = mixN(P.ht || 0, -0.62 * (wF + 0.4 * wS) + 0.2 * wB, fly);
    P.fF = mixP(P.fF, [-0.02, 0.0], fly * 0.85); P.fB = mixP(P.fB, [-0.06, -0.03], fly * 0.85);
    P.hF = mixP(P.hF, [-0.06, 0.36], fly * 0.7); P.hB = mixP(P.hB, [-0.1, 0.36], fly * 0.7);
    P.ws = sm01(k / 0.12) * (1 - sm01((k - 0.82) / 0.18));
    P.wg = k < 0.3 ? -1 + 2 * sm01(k / 0.3) : 1 - 1.4 * sm01((k - 0.3) / 0.5);
  } else if (kind === 'pounce') {
    // a beast's bound: crouched with the claws by the ground, a springing arc
    // reaching out with them, landing low
    const push = bump(k, -0.05, 0.3), arc = bump(k, 0.12, 0.85), land = bump(k, 0.7, 1.05);
    const fw = wF + 0.5 * wS;
    P.z = (P.z || 0) + 0.14 * arc;
    P.b = [P.b[0], P.b[1] + 0.06 * push + 0.04 * land];
    P.r = (P.r || 0) + 0.18 * arc * fw;
    P.l = (P.l || 0) + 0.16 * push * fw;
    P.hF = mixP(mixP(mixP(P.hF, [0.24, 0.3], push * 0.8), [0.38, 0.06], arc * fw), [0.25, 0.28], land * 0.6);
    P.hB = mixP(mixP(mixP(P.hB, [0.16, 0.32], push * 0.8), [0.33, 0.1], arc * fw), [0.17, 0.3], land * 0.6);
    P.fF = mixP(P.fF, [0.06, -0.16], arc * fw * 0.6); P.fB = mixP(P.fB, [-0.22, -0.12], arc * fw * 0.6);
    P.hand = 'claw'; P.handB = 'claw';
  } else if (kind === 'heavy') {
    // all weight and no air: lower, shorter, the shoulder first
    P.z = 0; P.r = (P.r || 0) * 0.4;
    P.b = [P.b[0] * 0.8, P.b[1] + 0.03];
    P.fF = mixP(P.fF, [0.2, 0], 0.4); P.fB = mixP(P.fB, [-0.2, 0], 0.4);
    P.tw = (P.tw || 0) - 0.14 * fly * wF;
  }
  P.wF = null; P.wB = null;
  P.hand = P.hand === 'claw' ? 'claw' : 'fist'; P.handB = P.handB === 'claw' ? 'claw' : 'fist';
  P.face = 'fierce';
}
