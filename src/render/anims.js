// Keyframed animation clips for the character rig (3D: render3d/chars/rig.js;
// the flat renderer: ./character.js). The house style and the rules every
// clip keeps are in docs/ANIMATION.md; the shared pieces live in ./anim/:
// timing.js (easing, weight classes, mass), poses.js (stances and the pose
// library), keys.js (the key model), react.js (blocks, parries, flinches),
// move.js (stride, swim, dodge) and flight.js.
//
// A pose P is a small bag of numbers:
//   b: [dx, dy]   hip offset (dx forward, dy down)      l: torso lean (+ forward)
//   r: body roll  z: airborne height   sp: body spin in turns   ht: head tilt
//   hF/hB: front/back hand target relative to the shoulder, [x, y] or polar {a, r}
//   eF/eB: elbow side (-1..1)   fF/fB: foot target relative to the ground under the hip
//   wF/wB: blade angles (upper-body frame)   m: mouth-blade angle (Santoryu)
//   hand/handB: 'fist' | 'palm' | 'finger' | 'claw' | 'flat' | 'relaxed'
//   face: 'fierce' | 'shout' | 'grit' (effort) | 'shock' | 'glare' | 'hurt'
//   stretch: rubber limbs may exceed their length
// and, for the 3D rig (the flat renderer leaves them be):
//   tw / hp: the chest's and the pelvis's turn (+ brings the front shoulder or hip forward)
//   ls: the trunk bent sideways (+ toward the front side)   hy / hr: the head turned and rolled
//   zF / zB, zfF / zfB: a hand or a foot carried out to its own side (+ outward)
//   wt: the blades rolled about the reach (a sword held across the body)
//   sm: the striking limb's smear (it overreaches itself by that share for a
//   frame or two) — or smF / smB / smfF / smfB, limb by limb
//   ws / wg / wf: wings on the back spread (0 folded … 1), beating (−1 up …
//   +1 down) and swept back; bk: the whole body banked about its length
//   (into a turn in flight); sq: squash and stretch (1 as built)
//   inF / inB: an arm blown up like a balloon (Gear Third: 0 … 1)
// All positions are in tiles, side view, facing right; the renderer mirrors
// and projects them for the other facings.
//
// Every strike clip has the same rhythm, the way the anime cuts a blow: a
// beat the other way before a big one, the load (the body coils away from
// the blow, the weight back, the fist cocked), the strike (landing exactly at
// the ability's windup, its hit frame, the limb smeared out past its length
// for a frame), a short hold (which hit-stop freezes), the follow-through
// (the body carries on past the blow) and the settle (the weight drops back
// into the knees) on the way back to the stance. How those beats are spaced
// is the blow's weight class and the body's mass (anim/timing.js WEIGHT,
// massOf). Within a pose the parts move a beat apart (see samplePose): the
// hips lead a blow, the head comes after it.
import { TAU, toXY, WEIGHT, weightOf, heavier, massOf } from './anim/timing.js';
import { STAND, GUARD, PALMS, SWORD, SWORD2, GUN, HEAVYW, STAFF, POCKETS, BALLET, STANCES, STANCE_ARMED, stanceFor, gunKind } from './anim/poses.js';
import { lerpVal, finalize, seg } from './anim/keys.js';
import { blockPose, parryPose, parriedPose, guardBrokenPose, hurtPose, flinch, counterPose, hardenPose, getUpPose, launchPose } from './anim/react.js';
import { gaitParams, gaitCadence, walkLegs, gaitPose, activityPose, swimPose, airPose, chargePose, dodgePose } from './anim/move.js';
import { flightPose, flightLegs, flightState } from './anim/flight.js';

export { STAND, GUARD, STANCES, STANCE_ARMED, stanceFor, gunKind, gaitParams, gaitCadence };

const NO_SMEAR = { sm: 0, smF: 0, smB: 0, smfF: 0, smfB: 0 };
// the trunk: what a beat the other way, and a follow-through, are made of
const TRUNK = ['l', 'tw', 'hp', 'ht', 'ls'];
const add2 = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];

/**
 * A beat the other way before a load: the stance pushed away from where
 * the load takes it, by a share k (the trunk and the hips only).
 */
function counter(st, load, k) {
  const p = {};
  for (const c of TRUNK) if (load[c] !== undefined) p[c] = (st[c] || 0) - (load[c] - (st[c] || 0)) * k;
  if (load.b) p.b = [st.b[0] - (load.b[0] - st.b[0]) * k, st.b[1] + Math.abs(load.b[1] - st.b[1]) * k * 0.5];
  return p;
}

/** The trunk carried on past the blow, a share k of the way it swung from the load. */
function carry(load, hit, k) {
  const p = {};
  for (const c of TRUNK) if (hit[c] !== undefined) p[c] = hit[c] + (hit[c] - (load[c] ?? hit[c])) * k;
  if (hit.b && load.b) p.b = add2(hit.b, sub2(hit.b, load.b), k * 0.6);
  return p;
}

/**
 * Standard strike timeline: stance → (a beat the other way) → load → (still
 * coiling) → STRIKE (at windup) → hold → follow-through → settle → stance.
 * o: { stance, load, hit, antic?, coil?, hold?, follow?, end?, weight, mass,
 * chained, loadAt?, anticAt?, holdT?, holdK?, followAt?, settle?, loadEase?,
 * hitEase? }. The weight class (anim/timing.js WEIGHT) spaces the beats; a
 * heavier body loads later, holds longer and settles deeper. An `antic` or
 * `follow` the clip doesn't give is made from the move itself (the load
 * reversed, the swing carried on); `false` leaves it out.
 */
function strike(w, T, o) {
  const W = WEIGHT[o.weight] || WEIGHT.medium;
  const m = o.mass || 1;
  const st = o.stance || GUARD;
  const loadAt = Math.min(0.84, (o.loadAt ?? W.loadAt) + 0.06 * (m - 1));
  const tLoad = Math.max(0.016, Math.min(w * loadAt, w - 0.014));
  const tHit = Math.max(tLoad + 0.014, w);
  const rest = Math.max(0.04, T - tHit);
  const tHold = tHit + Math.min((o.holdT ?? W.hold) * Math.sqrt(m), rest * (o.holdK ?? W.holdK));
  const tEnd = Math.max(T, tHold + 0.05);
  const K0 = { t: 0, p: st };
  const keys = [K0];
  // (before a long wind-up, a dip or a lean the other way, so the load reads as a load —
  // not for a follow-up in a chain: the last blow's recovery was its anticipation)
  const antic = o.antic === false || o.chained ? null : o.antic || (W.antic ? counter(st, o.load, 0.22) : null);
  if (antic && tLoad >= 0.12) keys.push({ t: tLoad * (o.anticAt ?? 0.38), p: antic, e: 'inout' });
  const KL = { t: tLoad, p: o.load, e: o.loadEase || 'out' };
  keys.push(KL);
  // (and a long one keeps coiling, a moving hold, instead of freezing in the load)
  if (tHit - tLoad >= 0.1 && o.coil !== false) keys.push(o.coil ? { t: tLoad + (tHit - tLoad) * 0.7, p: o.coil, e: 'inout' } : { t: tLoad + (tHit - tLoad) * 0.7, p: {}, from: [K0, KL, 1.12], e: 'inout' });
  const h = o.hit;
  keys.push({ t: tHit, p: h, e: o.hitEase || 'snap' });
  // the hold: the blow stays out (hit-stop freezes it here), its smear drawn back in
  keys.push({ t: tHold, p: { sm: (h.sm || 0) * 0.3, smF: (h.smF || 0) * 0.3, smB: (h.smB || 0) * 0.3, smfF: (h.smfF || 0) * 0.3, smfB: (h.smfB || 0) * 0.3, ...(o.hold || {}) }, e: 'lin' });
  let tPrev = tHold;
  // the follow-through: the body carries on past the blow
  const follow = o.follow === false ? null : { ...carry(o.load, h, W.carry * (0.8 + 0.2 * m)), ...(o.follow || {}) };
  if (follow) {
    const tf = tHold + (tEnd - tHold) * (o.followAt ?? W.follow);
    keys.push({ t: tf, p: { ...NO_SMEAR, ...follow }, e: 'out' });
    tPrev = tf;
  }
  const end = o.end || st;
  // the weight settles into the knees on the way back
  if (o.settle !== false && tEnd - tPrev > 0.08) {
    const dip = W.settle * m;
    keys.push({ t: tPrev + (tEnd - tPrev) * 0.55, p: { ...end, ...NO_SMEAR, b: [end.b[0], end.b[1] + dip], l: (end.l || 0) + W.settleLean }, e: 'inout' });
  }
  keys.push({ t: tEnd, p: end, e: 'inout' });
  return finalize(keys);
}

// ------------------------------------------------------------------ clip table
// Each clip: (w, T, c) → { keys, legs?, flurry?, spin?, jitter?, shake? }
//   w = windup (hit frame), T = total duration, c = context from the caller
//   (dash window, flurry window, weapon count, the style's stance...)
// (a clip's options with what the caller knows: the stance, the move's weight
// class and the body's mass, a follow-up in a chain, a dash the blow is
// held out through)
const S = (c, o) => ({
  ...o, stance: o.stance || c.stance, weight: o.weight || c.weight, mass: c.mass, chained: c.chained,
  holdT: c.dashT ? Math.max(o.holdT ?? 0.055, c.dashT) : o.holdT, holdK: c.dashT ? 0.9 : o.holdK,
});
const sw = (c) => (c.two ? SWORD2 : SWORD);
const spun = (c, base) => ({ ...(c.stance || base || GUARD), sp: 1 });
// (Black Leg keeps its hands in its pockets through every kick; anyone else's arms swing for balance)
const arms = (c, o) => ((c.stance || GUARD) === POCKETS ? {} : o);

const CLIPS = {
  // ---------------------------------------------------------------- fists
  // the lead fist snapped straight out from the chin, the lead foot stepping in under it; the other fist never leaves the chin
  jab: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.06], l: 0.05, tw: -0.12, hp: -0.04, ht: 0.08, hF: [0.13, 0.0], hB: [0.11, -0.01], face: 'fierce' }, hit: { b: [0.1, 0.035], l: 0.2, tw: 0.36, hp: 0.14, ht: 0.02, hF: [0.47, -0.05], hB: [0.1, -0.03], fF: [0.25, 0], fB: [-0.12, -0.01], sm: 0.1, face: 'fierce' }, follow: { hF: [0.36, -0.02], tw: 0.28, l: 0.17 } })) }),
  // the rear hand: the hips whip round and drive the shoulder through, the back heel up, the lead fist pulled home
  cross: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.04, 0.06], l: 0.02, tw: 0.22, hp: 0.12, ht: 0.06, hB: [0.05, 0.0], hF: [0.22, -0.03], face: 'fierce' }, hit: { b: [0.13, 0.04], l: 0.28, tw: -0.62, hp: -0.42, ht: 0.0, hB: [0.49, -0.05], hF: [0.1, 0.0], fF: [0.25, 0], fB: [-0.14, -0.05], sm: 0.12, face: 'shout' }, follow: { tw: -0.72, l: 0.3, hB: [0.42, -0.02] } })) }),
  // wide and flat: the elbow up, the fist swung round from the side as the whole body turns into it
  hook: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.08], l: 0.06, tw: -0.4, hp: -0.12, ht: 0.06, hF: [0.1, -0.02], zF: 0.2, eF: -1, hB: [0.12, -0.01], face: 'fierce' }, hit: { b: [0.08, 0.06], l: 0.2, tw: 0.62, hp: 0.32, ht: 0.03, hF: [0.36, -0.06], zF: -0.04, eF: -0.8, hB: [0.1, 0.0], fF: [0.21, 0], fB: [-0.15, -0.04], sm: 0.06, face: 'shout' }, follow: { tw: 0.8, l: 0.24, hF: [0.3, -0.03], zF: -0.12, eF: -0.7 } })) }),
  // the finisher: dropped low and coiled, then up off the ground behind the fist
  uppercut: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.13], l: 0.26, tw: -0.32, hp: -0.16, ht: 0.12, hF: [0.12, 0.3], eF: 1, hB: [0.12, -0.02], fF: [0.2, 0], fB: [-0.17, 0], face: 'grit' }, hit: { b: [0.07, -0.07], z: 0.11, l: -0.06, tw: 0.5, hp: 0.28, ht: -0.24, hF: [0.3, -0.33], eF: 0.5, hB: [0.06, 0.1], fF: [0.2, -0.05], fB: [-0.08, -0.18], sm: 0.08, face: 'shout' }, follow: { z: 0.05, l: -0.03, hF: [0.27, -0.3] } })), legs: true }),
  // a dip forward, the arm swung right back with the whole trunk wound up behind it, then everything thrown through it
  haymaker: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.66, antic: { b: [0.03, 0.07], l: 0.16, tw: 0.12, hF: [0.24, 0.0], ht: 0.1 }, load: { b: [-0.1, 0.07], l: -0.28, tw: -0.8, hp: -0.32, ht: -0.04, hF: [-0.32, -0.12], zF: 0.06, eF: 0.9, hB: [0.24, -0.02], handB: 'palm', fF: [0.24, 0], fB: [-0.19, 0], face: 'grit' }, hit: { b: [0.25, 0.05], l: 0.44, tw: 0.78, hp: 0.48, ht: -0.12, hF: [0.5, -0.03], eF: 0.2, hB: [-0.14, 0.16], zB: 0.1, handB: 'fist', fF: [0.36, 0], fB: [-0.12, -0.08], sm: 0.14, face: 'shout' }, follow: { b: [0.28, 0.08], l: 0.5, tw: 0.9, hF: [0.44, 0.06] } })), jitter: 0.012 }),
  // Fish-Man Karate: the palm from the hip, the other hand pulled back to its hip as it goes (and the kiai)
  palm: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: PALMS, load: { b: [-0.02, 0.11], l: 0.02, tw: -0.28, hp: -0.1, hF: [0.03, 0.19], hB: [0.3, -0.02], hand: 'palm', handB: 'palm', face: 'fierce' }, hit: { b: [0.13, 0.08], l: 0.18, tw: 0.46, hp: 0.22, hF: [0.49, -0.03], hB: [-0.02, 0.2], hand: 'palm', handB: 'fist', fF: [0.27, 0], fB: [-0.18, -0.02], sm: 0.08, face: 'shout' }, follow: { hF: [0.45, -0.01], l: 0.2 } })) }),
  palm2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: PALMS, load: { b: [-0.03, 0.11], l: 0.0, tw: 0.3, hp: 0.12, hB: [0.0, 0.2], hF: [0.3, -0.02], hand: 'palm', handB: 'palm', face: 'fierce' }, hit: { b: [0.14, 0.08], l: 0.24, tw: -0.55, hp: -0.3, hB: [0.5, -0.03], hF: [-0.02, 0.2], hand: 'fist', handB: 'palm', fF: [0.27, 0], fB: [-0.18, -0.03], sm: 0.08, face: 'shout' }, follow: { hB: [0.45, -0.01], l: 0.25 } })) }),
  // both palms gathered at one hip, the body wound round them, then driven out together (the Shark Tile Fist)
  palm_double: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: PALMS, loadAt: 0.7, antic: { b: [0.02, 0.08], l: 0.1, hF: [0.3, 0.0], hB: [0.28, 0.04] }, load: { b: [-0.08, 0.14], l: -0.16, tw: -0.5, hp: -0.2, hF: [-0.06, 0.2], hB: [-0.1, 0.17], hand: 'palm', handB: 'palm', fF: [0.23, 0], fB: [-0.17, 0], face: 'grit' }, hit: { b: [0.23, 0.08], l: 0.3, tw: 0.2, hp: 0.25, hF: [0.5, -0.07], hB: [0.47, 0.07], hand: 'palm', handB: 'palm', fF: [0.33, 0], fB: [-0.19, -0.04], smF: 0.1, smB: 0.1, face: 'shout' }, follow: { l: 0.34, b: [0.25, 0.1] } })), jitter: 0.01 }),
  // Shigan: a fencer's lunge behind one stabbing finger, the other hand kept at the small of the back
  shigan: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.03, 0.05], l: -0.04, tw: -0.15, hp: -0.06, hF: [0.03, -0.06], hand: 'finger', face: 'fierce' }, hit: { b: [0.18, 0.05], l: 0.3, tw: 0.6, hp: 0.36, hF: [0.53, -0.07], hand: 'finger', hB: [-0.14, 0.26], fF: [0.31, 0], fB: [-0.2, -0.02], sm: 0.16, face: 'fierce' }, follow: { hF: [0.46, -0.05] } })) }),
  shigan2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.03, 0.05], l: -0.06, tw: 0.25, hp: 0.1, hB: [0.0, -0.05], handB: 'finger', hF: [0.18, 0.02], face: 'fierce' }, hit: { b: [0.19, 0.05], l: 0.32, tw: -0.66, hp: -0.4, hB: [0.53, -0.07], handB: 'finger', hF: [-0.1, 0.24], fF: [0.31, 0], fB: [-0.2, -0.02], sm: 0.16, face: 'fierce' }, follow: { hB: [0.46, -0.05] } })) }),
  // a claw raked down from high behind the head (and back up, and both crossing)
  claw: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.08, b: [-0.02, 0.05], tw: -0.35, ls: -0.08, hF: { a: -2.15, r: 0.38 }, zF: 0.08, hand: 'claw', eF: 1, face: 'fierce' }, hit: { l: 0.32, b: [0.12, 0.08], tw: 0.5, ls: 0.08, hF: { a: 0.75, r: 0.43 }, zF: -0.08, hand: 'claw', fF: [0.24, 0], fB: [-0.15, -0.02], sm: 0.06, face: 'shout' }, follow: { hF: { a: 1.15, r: 0.4 }, zF: -0.14, tw: 0.62 } })) }),
  claw2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: 0.18, b: [0, 0.1], tw: 0.32, hB: { a: 1.7, r: 0.36 }, zB: 0.06, handB: 'claw', face: 'fierce' }, hit: { l: -0.1, b: [0.1, 0.0], tw: -0.55, hB: { a: -0.95, r: 0.43 }, zB: -0.06, handB: 'claw', hF: [0.12, 0.1], sm: 0.06, face: 'shout' }, follow: { hB: { a: -1.25, r: 0.41 } } })) }),
  claw_x: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.68, antic: { b: [0, 0.1], l: 0.2, hF: [0.2, 0.15], hB: [0.15, 0.18] }, load: { l: -0.24, b: [-0.04, 0.03], ht: -0.12, hF: { a: -2.0, r: 0.42 }, hB: { a: -1.85, r: 0.4 }, zF: 0.12, zB: 0.12, hand: 'claw', handB: 'claw', face: 'grit' }, hit: { l: 0.4, b: [0.18, 0.1], ht: 0.1, hF: { a: 0.95, r: 0.43 }, hB: { a: 0.8, r: 0.42 }, zF: -0.12, zB: -0.12, hand: 'claw', handB: 'claw', fF: [0.3, 0], fB: [-0.18, -0.02], smF: 0.07, smB: 0.07, face: 'shout' }, follow: { l: 0.44, b: [0.2, 0.12] } })), jitter: 0.008 }),
  // Ryusoken: the claw cocked by the ear, lunged out open, then crushed shut on what it caught
  grab: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.07], l: -0.06, tw: -0.32, hF: [0.02, -0.12], zF: 0.06, hand: 'claw', eF: -0.6, face: 'fierce' }, hit: { b: [0.14, 0.04], l: 0.28, tw: 0.5, hp: 0.25, hF: [0.5, -0.06], hand: 'claw', fF: [0.26, 0], fB: [-0.15, -0.02], sm: 0.1, face: 'shout' }, follow: { hand: 'fist', hF: [0.43, -0.02], hr: 0.08, l: 0.22 } })) }),
  grab2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.07], l: -0.08, tw: 0.3, hB: [0.0, -0.1], zB: 0.06, handB: 'claw', eB: -0.6, face: 'fierce' }, hit: { b: [0.15, 0.04], l: 0.3, tw: -0.58, hp: -0.3, hB: [0.5, -0.05], handB: 'claw', hF: [0.08, 0.12], sm: 0.1, face: 'shout' }, follow: { handB: 'fist', hB: [0.43, -0.01], hr: -0.08 } })) }),
  chop: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.14, b: [-0.02, 0.04], tw: -0.3, hF: { a: -2.15, r: 0.37 }, hand: 'palm', face: 'fierce' }, hit: { l: 0.28, b: [0.12, 0.07], tw: 0.42, hp: 0.2, hF: { a: 0.6, r: 0.43 }, hand: 'palm', fF: [0.24, 0], sm: 0.06, face: 'fierce' }, follow: { hF: { a: 0.9, r: 0.42 }, tw: 0.5 } })) }),
  chop2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: 0.12, b: [0, 0.08], tw: 0.25, hF: { a: 2.0, r: 0.34 }, hand: 'palm', face: 'fierce' }, hit: { l: -0.14, b: [0.12, 0.02], tw: -0.3, hF: { a: -0.62, r: 0.43 }, hand: 'palm', sm: 0.06, face: 'fierce' }, follow: { hF: { a: -0.9, r: 0.42 } } })) }),
  // a long lunging thrust of one arm, the other flung back behind for the reach
  thrust: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.06, 0.1], l: -0.06, tw: -0.4, hp: -0.15, hF: [0.04, 0.06], hB: [0.2, 0.0], face: 'grit' }, hit: { b: [0.16, 0.05], l: 0.46, tw: 0.6, hp: 0.3, hF: [0.47, -0.01], hB: [-0.22, 0.16], fF: [0.28, 0], fB: [-0.33, -0.08], sm: 0.14, face: 'shout' } })) }),
  // head down, the shoulder first, arms tucked: a battering ram
  charge: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.06, 0.13], l: 0.12, tw: -0.2, hF: [0.1, 0.18], hB: [-0.1, 0.2], face: 'grit' }, hit: { b: [0.12, 0.09], l: 0.6, tw: 0.55, hp: 0.25, ht: -0.25, hF: [0.12, 0.15], hB: [-0.24, 0.18], fF: [0.26, 0], fB: [-0.38, -0.1], face: 'shout' } })), legs: true }),
  // hands on the other's collar, reared right back, then the brow brought down into them
  headbutt: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.42, b: [-0.07, 0.03], ht: -0.2, hF: [0.32, -0.02], hB: [0.3, 0.02], hand: 'claw', handB: 'claw', face: 'grit' }, hit: { l: 0.55, b: [0.19, 0.06], ht: 0.32, hF: [0.24, 0.06], hB: [0.22, 0.1], hand: 'fist', handB: 'fist', fF: [0.27, 0], fB: [-0.17, -0.03], face: 'shout' } })) }),

  // ---------------------------------------------------------------- kicks
  // a snap kick: the knee chambered high, the leg whipped out level, the hips turned over into it and the body back to balance it
  kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.06], l: -0.12, hp: -0.12, fF: [0.13, -0.32], fB: [-0.07, 0], ...arms(c, { hF: [0.18, 0.02], hB: [0.08, 0.1] }), face: 'fierce' }, hit: { b: [0.05, -0.02], l: -0.26, hp: 0.35, tw: -0.1, ht: 0.1, fF: [0.68, -0.42], fB: [-0.09, 0], sm: 0.1, ...arms(c, { hF: [0.08, 0.14], hB: [-0.16, 0.14] }), face: 'fierce' }, follow: { fF: [0.6, -0.36], l: -0.22 } })), legs: true }),
  kick_high: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.07], l: -0.16, hp: -0.15, fF: [0.04, -0.38], fB: [-0.05, 0], ...arms(c, { hF: [0.16, 0.0], hB: [0.1, 0.06] }), face: 'fierce' }, hit: { b: [0.02, -0.02], l: -0.46, hp: 0.42, ls: -0.06, ht: 0.2, fF: [0.57, -0.85], fB: [-0.06, 0], sm: 0.1, ...arms(c, { hF: [-0.18, 0.1], hB: [0.28, -0.04] }), face: 'fierce' }, follow: { l: -0.32, fF: [0.46, -0.62] } })), legs: true }),
  // a whirling kick: a turn the other way, the leg whipped round, and the body spun on through after it
  kick_spin: (w, T, c) => ({ keys: strike(w, T, S(c, { followAt: 0.35, load: { sp: -0.06, b: [0, 0.07], l: -0.08, hp: -0.25, fF: [0.06, -0.24], ...arms(c, { hF: [0.2, 0.0], hB: [0.0, 0.1] }), face: 'fierce' }, hit: { sp: 0, b: [0.03, -0.01], l: -0.3, hp: 0.5, ls: -0.1, fF: [0.7, -0.55], fB: [-0.06, 0], sm: 0.12, ...arms(c, { hF: [-0.12, 0.12], hB: [0.24, -0.06] }), face: 'shout' }, follow: { sp: 0.55, fF: [0.36, -0.38], l: -0.18 }, end: spun(c) })), legs: true }),
  sweep: (w, T, c) => ({ keys: strike(w, T, S(c, { followAt: 0.35, load: { b: [0, 0.24], l: 0.24, fF: [0.06, -0.04], ...arms(c, { hF: [0.22, 0.32], hB: [-0.04, 0.32] }), face: 'fierce' }, hit: { b: [0.02, 0.31], l: 0.32, hp: 0.4, fF: [0.82, -0.05], fB: [-0.2, 0], sm: 0.08, ...arms(c, { hF: [0.26, 0.44], hB: [-0.1, 0.38] }), face: 'fierce' }, follow: { sp: 0.5, fF: [0.5, -0.04] }, end: spun(c) })), legs: true }),
  // the Rankyaku finisher: a hop and the leg swept up and over in a crescent, the arms flung out to balance it
  rankyaku: (w, T, c) => ({ keys: strike(w, T, S(c, { followAt: 0.3, load: { b: [0, 0.12], l: 0.08, hp: -0.25, fF: [0.12, -0.18], fB: [-0.08, 0], ...arms(c, { hF: [0.18, 0.06], hB: [0.06, 0.12] }), face: 'grit' }, hit: { b: [0.02, -0.04], z: 0.12, l: -0.55, hp: 0.5, ls: -0.16, ht: 0.25, fF: [0.42, -0.98], fB: [-0.06, -0.06], sm: 0.12, ...arms(c, { hF: [-0.12, -0.04], hB: [0.24, -0.16], zF: 0.18, zB: 0.12 }), face: 'shout' }, follow: { z: 0.04, l: -0.38, fF: [0.66, -0.48] } })), legs: true }),
  // Hasshoken: the palm driven in and stopped dead against the body, the whole arm shuddering as the blow goes on through it
  vibe_palm: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.66, load: { b: [-0.03, 0.09], l: 0.0, tw: -0.4, hp: -0.15, hF: [0.02, 0.16], hand: 'palm', hB: [0.28, -0.02], handB: 'palm', face: 'grit' }, hit: { b: [0.14, 0.07], l: 0.22, tw: 0.5, hp: 0.3, hF: [0.44, -0.03], hand: 'palm', hB: [0.0, 0.18], handB: 'fist', fF: [0.27, 0], fB: [-0.17, -0.03], sm: 0.05, face: 'shout' }, holdT: 0.16, holdK: 0.6 })), shake: { a: 0.014, t: 0.18 } }),
  // both hands on the other's head, pulling it down onto the knee driven up to meet it
  knee:(w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.07], l: 0.04, hp: -0.1, fF: [0.1, -0.1], hF: [0.3, -0.04], hB: [0.26, 0.0], hand: 'claw', handB: 'claw', face: 'fierce' }, hit: { b: [0.08, -0.05], z: 0.07, l: 0.16, hp: 0.3, fF: [0.26, -0.44], fB: [-0.08, -0.02], hF: [0.3, 0.1], hB: [0.27, 0.13], hand: 'fist', handB: 'fist', ht: 0.15, face: 'shout' }, follow: { z: 0 } })), legs: true }),
  axe_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.75, load: { z: 0.55, l: -0.34, hp: 0.2, ht: -0.1, fF: [0.18, -0.98], fB: [-0.1, -0.14], ...arms(c, { hF: [-0.12, -0.1], hB: [0.22, -0.22] }), face: 'grit' }, hit: { z: 0, b: [0.1, 0.1], l: 0.32, hp: 0, ht: 0.15, fF: [0.58, -0.04], fB: [-0.17, 0], smfF: 0.08, ...arms(c, { hF: [-0.1, 0.22], hB: [0.1, 0.16] }), face: 'shout' } })), legs: true }),
  // Collier: crouched, then up off the ground with the leg swung in an arc to the throat
  rise_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.19], l: 0.16, hp: -0.15, fF: [0.28, -0.03], fB: [-0.12, 0], ...arms(c, { hF: [0.1, 0.28], hB: [0.0, 0.26] }), face: 'grit' }, hit: { b: [0.02, -0.05], z: 0.16, l: -0.5, hp: 0.3, ht: 0.2, fF: [0.38, -0.98], fB: [-0.05, -0.04], sm: 0.12, ...arms(c, { hF: [-0.22, 0.1], hB: [0.14, 0.2] }), face: 'shout' }, follow: { z: 0.06, fF: [0.42, -0.85] } })), legs: true }),
  // Mouton Shot: a dip, the knee drawn right up to the chest, then the sole driven out straight with a hop behind it
  mouton: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.66, antic: { b: [0, 0.1], l: 0.12, fF: [0.2, 0] }, load: { l: -0.36, z: 0.08, hp: -0.2, b: [-0.04, 0.04], ht: 0.12, fF: [-0.05, -0.48], fB: [-0.04, 0], ...arms(c, { hF: [0.1, -0.1] }), face: 'grit' }, hit: { l: -0.78, b: [0.27, 0], z: 0.17, hp: 0.35, ht: 0.35, fF: [0.9, -0.56], fB: [-0.12, -0.13], smfF: 0.12, ...arms(c, { hF: [-0.36, 0.25], hB: [-0.32, 0.3] }), face: 'shout' }, follow: { z: 0.0, l: -0.42 } })), legs: true }),
  handstand: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.14], l: 0.3, hF: [0.3, 0.4], hB: [0.2, 0.4] }, hit: { r: Math.PI, b: [0, 0], l: 0, hF: [0.12, -0.72], hB: [-0.08, -0.72], hand: 'palm', handB: 'palm', fF: [0.58, -0.45], fB: [-0.58, -0.45] }, hold: { r: Math.PI, fF: [0.58, -0.4], fB: [-0.58, -0.5] }, holdT: c.hitDur || 0.4, holdK: 0.85 })), legs: true }),
  flying_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.14], l: 0.2, fF: [0.1, 0], face: 'grit' }, hit: { z: 0.3, l: -0.34, hp: 0.3, fF: [0.78, -0.46], fB: [-0.06, -0.3], smfF: 0.08, ...arms(c, { hF: [-0.2, 0.05], hB: [0.2, -0.1] }), face: 'shout' }, follow: { z: 0 } })), legs: true }),
  stomp: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { fF: [0.18, -0.55], l: -0.1, ...arms(c, { hF: [0.2, -0.1], hB: [-0.1, -0.1] }), face: 'grit' }, hit: { fF: [0.26, 0], b: [0.04, 0.12], l: 0.2, face: 'shout' } })), legs: true }),
  // Okama Kenpo: ballet
  ballet_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: BALLET, load: { b: [0, 0.11], hF: [0.14, 0.24], hB: [-0.08, 0.24], zF: 0.08, zB: 0.08 }, hit: { fF: [0.36, -1.0], fB: [-0.02, 0], l: -0.12, b: [0.02, -0.04], hp: 0.25, hF: [0.34, -0.24], hB: [-0.36, -0.22], zF: 0.12, zB: 0.12, sm: 0.06, face: 'fierce' } })), legs: true }),
  pirouette: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: BALLET, followAt: 0.35, load: { b: [0, 0.1], sp: -0.05, hF: [0.14, 0.2], hB: [-0.1, 0.22] }, hit: { sp: 0, fF: [0.64, -0.55], fB: [0, 0], l: -0.18, hp: 0.3, hF: [0.14, -0.44], hB: [0.0, -0.46], zF: 0.05, zB: 0.05, sm: 0.08, face: 'fierce' }, follow: { sp: 0.6 }, end: { ...BALLET, sp: 1 } })), legs: true }),
  jete: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: BALLET, load: { b: [0, 0.14], l: 0.1, hF: [0.1, 0.25] }, hit: { z: 0.36, fF: [0.58, -0.26], fB: [-0.56, -0.42], l: 0.12, hF: [0.44, -0.22], hB: [-0.38, -0.14], zF: 0.1, zB: 0.1, smfF: 0.06, face: 'fierce' }, follow: { z: 0 } })), legs: true }),
  arabesque: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: BALLET, load: { b: [0, 0.1], hF: [0.1, 0.2] }, hit: { l: 0.5, b: [0.1, 0], fB: [-0.66, -0.62], fF: [0.04, 0], hF: [0.46, -0.1], hB: [-0.3, -0.14], zB: 0.1, smfB: 0.08, face: 'fierce' } })), legs: true }),

  // ---------------------------------------------------------------- blades
  // the blade raised back over the shoulder, the body wound away, then cut down through with the hips behind it
  slash: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), load: { l: -0.16, b: [-0.03, 0.05], tw: -0.42, hp: -0.15, hF: { a: -2.15, r: 0.35 }, wF: -2.6, hB: [-0.04, 0.18], face: 'fierce' }, hit: { l: 0.3, b: [0.14, 0.08], tw: 0.5, hp: 0.3, hF: { a: 0.6, r: 0.43 }, wF: 0.85, hB: [0.16, 0.18], fF: [0.31, 0], fB: [-0.17, -0.02], face: 'shout' }, follow: { l: 0.34, tw: 0.62, hF: { a: 0.95, r: 0.42 }, wF: 1.25 } })) }),
  slash2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), load: { l: 0.14, b: [0, 0.1], tw: 0.3, hp: 0.1, hF: { a: 2.05, r: 0.34 }, wF: 2.5, face: 'fierce' }, hit: { l: -0.14, b: [0.12, 0.03], tw: -0.35, hp: -0.15, hF: { a: -0.62, r: 0.43 }, wF: -1.0, face: 'fierce' }, follow: { hF: { a: -1.0, r: 0.42 }, wF: -1.45, tw: -0.42 } })) }),
  rise_slash: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), loadAt: 0.62, load: { b: [-0.02, 0.17], l: 0.28, tw: -0.4, hp: -0.12, hF: { a: 1.9, r: 0.36 }, wF: 2.55, hB: [0.0, 0.22], face: 'grit' }, hit: { b: [0.12, -0.04], z: 0.06, l: -0.22, tw: 0.42, hp: 0.25, hF: { a: -1.2, r: 0.43 }, wF: -1.55, hB: [-0.12, 0.1], fF: [0.26, 0], fB: [-0.16, -0.06], face: 'shout' }, follow: { z: 0, hF: { a: -1.45, r: 0.42 }, wF: -1.85, l: -0.26 } })) }),
  slash3: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), loadAt: 0.7, followAt: 0.35, load: { l: -0.22, b: [-0.04, 0.08], tw: -0.5, hF: { a: 2.7, r: 0.36 }, wF: 3.0, sp: -0.05, face: 'grit' }, hit: { sp: 0, l: 0.22, b: [0.16, 0.06], tw: 0.55, hp: 0.3, hF: { a: 0.08, r: 0.43 }, wF: 0.06, fF: [0.3, 0], fB: [-0.2, 0], face: 'shout' }, follow: { sp: 0.55, wF: 0.3 }, end: { ...sw(c), sp: 1 } })) }),
  // a deep lunge behind the point, the free hand laid along to aim it
  stab: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), load: { l: -0.14, b: [-0.09, 0.07], tw: -0.45, hp: -0.2, hF: [-0.04, 0.06], wF: 0.0, hB: [0.14, -0.04], handB: 'palm', face: 'grit' }, hit: { l: 0.34, b: [0.23, 0.05], tw: 0.55, hp: 0.4, hF: [0.47, -0.03], wF: -0.03, hB: [-0.22, 0.14], handB: 'fist', fF: [0.37, 0], fB: [-0.23, -0.03], face: 'shout' } })) }),
  cleave: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.7, antic: { b: [0.02, 0.08], l: 0.12, hF: [0.2, 0.18], wF: -0.4 }, load: { l: -0.26, b: [-0.06, 0.0], tw: -0.25, ht: -0.1, hF: { a: -1.85, r: 0.38 }, hB: { a: -1.75, r: 0.34 }, wF: -2.3, face: 'grit' }, hit: { l: 0.4, b: [0.23, 0.13], tw: 0.3, hp: 0.3, ht: 0.2, hF: { a: 0.72, r: 0.41 }, hB: { a: 0.82, r: 0.36 }, wF: 0.78, fF: [0.37, 0], fB: [-0.23, 0], face: 'shout' }, follow: { l: 0.44, b: [0.25, 0.15], wF: 0.86 } })), jitter: 0.01 }),
  // the quick draw: crouched low with the hand on the hilt at the hip, the cut drawn out through the dash, and the blade slid home after
  iai: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...SWORD, hF: [0.04, 0.3], wF: 2.7, hB: [0.0, 0.3] }, load: { b: [0, 0.17], l: 0.36, tw: -0.5, hp: -0.2, ht: -0.15, hF: [-0.02, 0.32], zF: -0.12, wF: 2.75, hB: [0.02, 0.3], face: 'grit' }, hit: { l: 0.5, b: [0.22, 0.09], tw: 0.6, hp: 0.4, hF: [0.47, 0.03], wF: 0.08, hB: [-0.1, 0.24], fB: [-0.37, -0.12], face: 'shout' }, follow: { l: 0.2, tw: 0.2, hF: [0.12, 0.27], zF: -0.08, wF: 2.6 } })) }),
  // two blades (Nitoryu): alternating cuts, then an X
  dual1: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: -0.16, tw: -0.4, hF: { a: -2.1, r: 0.34 }, wF: -2.55, face: 'fierce' }, hit: { l: 0.28, b: [0.12, 0.07], tw: 0.45, hp: 0.25, hF: { a: 0.55, r: 0.43 }, wF: 0.8, face: 'fierce' }, follow: { tw: 0.55, wF: 1.1 } })) }),
  dual2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: -0.14, tw: 0.35, hB: { a: -2.2, r: 0.33 }, wB: -2.6, face: 'fierce' }, hit: { l: 0.3, b: [0.13, 0.07], tw: -0.5, hp: -0.25, hB: { a: 0.6, r: 0.43 }, wB: 0.85, hF: [0.14, 0.14], face: 'fierce' }, follow: { tw: -0.6, wB: 1.15 } })) }),
  dual3: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: 0.12, b: [0, 0.1], tw: 0.2, hF: { a: 2.0, r: 0.34 }, wF: 2.45, hB: { a: 2.2, r: 0.32 }, wB: 2.6, face: 'fierce' }, hit: { l: -0.14, b: [0.12, 0.02], tw: -0.25, hF: { a: -0.62, r: 0.43 }, wF: -0.95, hB: { a: -0.4, r: 0.42 }, wB: -0.7, face: 'fierce' } })) }),
  dualx: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, loadAt: 0.7, load: { l: -0.2, b: [-0.04, 0.02], ht: -0.08, hF: { a: -2.3, r: 0.34 }, wF: -2.5, hB: { a: -1.6, r: 0.34 }, wB: -1.9, zF: 0.06, zB: 0.06, face: 'grit' }, hit: { l: 0.34, b: [0.18, 0.1], ht: 0.12, hp: 0.2, hF: { a: 0.9, r: 0.42 }, wF: 1.1, hB: { a: 0.2, r: 0.43 }, wB: 0.5, zF: -0.08, zB: -0.08, fF: [0.31, 0], fB: [-0.2, -0.02], face: 'shout' }, follow: { l: 0.38 } })) }),
  dual_stab: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: -0.16, b: [-0.1, 0.07], tw: -0.3, hF: [-0.04, 0.06], hB: [-0.1, 0.1], wF: 0.05, wB: 0.1, face: 'grit' }, hit: { l: 0.36, b: [0.24, 0.05], tw: 0.3, hp: 0.3, hF: [0.46, -0.05], hB: [0.4, 0.04], wF: -0.06, wB: 0.04, fF: [0.38, 0], fB: [-0.24, -0.04], face: 'shout' } })) }),
  // Tora Gari: up off the ground with the blades raised high, and down through the landing in one cut
  tora: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, loadAt: 0.72, load: { z: 0.4, l: -0.32, ht: -0.1, hF: { a: -2.0, r: 0.36 }, hB: { a: -2.2, r: 0.34 }, wF: -2.6, wB: -2.8, fF: [0.12, -0.25], fB: [-0.14, -0.2], face: 'grit' }, hit: { z: 0, l: 0.42, b: [0.24, 0.12], ht: 0.18, hp: 0.25, hF: { a: 0.75, r: 0.4 }, hB: { a: 0.9, r: 0.38 }, wF: 0.72, wB: 0.86, zF: 0.08, zB: 0.08, fF: [0.36, 0], fB: [-0.2, 0], face: 'shout' } })), jitter: 0.008 }),
  bladespin: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), load: { l: -0.1, b: [0, 0.1], tw: -0.4, hF: { a: 2.6, r: 0.38 }, wF: 2.9, face: 'grit' }, hit: { l: 0.1, hF: [0.42, -0.04], wF: 0.02, hB: [0.36, 0.04], wB: 0.2, zF: 0.1, zB: 0.1, face: 'shout' }, holdT: c.hitDur || 0.3, holdK: 0.8 })) }),
  // big weapons: swung with the whole body; the head comes down on the ground in front, not through it
  axe: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.7, load: { l: -0.3, b: [-0.05, 0.02], tw: -0.35, hp: -0.15, ht: -0.1, hF: { a: -2.4, r: 0.34 }, hB: { a: -2.3, r: 0.3 }, wF: -2.8, face: 'grit' }, hit: { l: 0.36, b: [0.2, 0.1], tw: 0.3, hp: 0.25, ht: 0.15, hF: { a: 0.62, r: 0.42 }, hB: { a: 0.8, r: 0.36 }, wF: 0.72, fF: [0.34, 0], fB: [-0.2, 0], face: 'shout' }, follow: { l: 0.4, wF: 0.8 } })) }),
  axe2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.7, load: { l: 0.1, b: [0, 0.12], tw: 0.3, hF: { a: 2.2, r: 0.34 }, hB: { a: 2.3, r: 0.3 }, wF: 2.6, face: 'grit' }, hit: { l: -0.2, b: [0.16, 0.02], tw: -0.3, hp: -0.2, hF: { a: -0.8, r: 0.42 }, hB: { a: -0.6, r: 0.36 }, wF: -1.1, face: 'shout' }, follow: { wF: -1.4, tw: -0.4 } })) }),
  axe_slam: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.74, load: { z: 0.18, l: -0.4, b: [-0.06, -0.02], ht: -0.15, hF: { a: -1.9, r: 0.4 }, hB: { a: -1.8, r: 0.36 }, wF: -1.75, fF: [0.12, -0.1], face: 'grit' }, hit: { z: 0, l: 0.46, b: [0.24, 0.16], ht: 0.2, hF: { a: 0.62, r: 0.43 }, hB: { a: 0.74, r: 0.38 }, wF: 0.58, fF: [0.38, 0], fB: [-0.24, 0], face: 'shout' }, follow: { l: 0.48, b: [0.24, 0.17], wF: 0.64 } })), jitter: 0.012 }),
  staff: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAFF, load: { l: -0.14, tw: -0.35, hF: { a: -2.0, r: 0.34 }, wF: -2.4, hB: [0.0, 0.2], face: 'fierce' }, hit: { l: 0.26, b: [0.1, 0.05], tw: 0.4, hp: 0.2, hF: { a: 0.5, r: 0.43 }, wF: 0.6, face: 'fierce' }, follow: { tw: 0.5, wF: 0.85 } })) }),
  staff2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAFF, load: { l: 0.1, b: [0, 0.08], tw: 0.3, hF: { a: 1.9, r: 0.34 }, wF: 2.3, face: 'fierce' }, hit: { l: -0.12, b: [0.1, 0.02], tw: -0.35, hF: { a: -0.5, r: 0.43 }, wF: -0.8, face: 'fierce' }, follow: { wF: -1.1 } })) }),
  staff_jab: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAFF, load: { l: -0.12, b: [-0.07, 0.06], tw: -0.35, hF: [0.0, 0.06], wF: 0.02, face: 'grit' }, hit: { l: 0.3, b: [0.2, 0.04], tw: 0.45, hp: 0.3, hF: [0.46, -0.02], wF: -0.02, fF: [0.34, 0], fB: [-0.22, -0.02], face: 'shout' } })) }),

  // ---------------------------------------------------------------- guns & throws
  // a pistol held out and fired, the recoil kicking the hand up; a slingshot's band
  // drawn back to the cheek and let go, the drawing hand springing open
  shoot: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: GUN, loadAt: 0.55, load: { hF: [0.43, -0.04], wF: 0, tw: 0.3, ht: 0.06, hB: c.sling ? [-0.02, -0.07] : [0.3, 0.05], l: 0.04, face: 'fierce' }, hit: { hF: c.sling ? [0.42, -0.1] : [0.35, -0.13], wF: c.sling ? -0.15 : -0.45, tw: 0.25, hB: c.sling ? [-0.07, -0.09] : [0.26, 0.04], handB: c.sling ? 'palm' : 'fist', l: c.sling ? -0.02 : -0.12, b: [-0.08, 0] }, follow: { hF: [0.41, -0.06], wF: -0.12, l: 0, handB: 'fist' } })) }),
  // a long aim, the eye down the barrel (or along the band), then the shot: a gun's recoil throws the arm up, a slingshot's band snaps the hand open
  aim: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: GUN, loadAt: 0.3, load: { hF: [0.44, -0.06], wF: -0.02, tw: 0.35, hr: 0.14, hB: c.sling ? [-0.03, -0.07] : [0.32, -0.01], l: 0.05, b: [0, 0.06], face: 'fierce' }, hold: c.sling ? { hF: [0.42, -0.1], wF: -0.15, l: -0.04, b: [-0.05, 0.05], hr: 0.06 } : { hF: [0.3, -0.24], wF: -0.7, l: -0.16, b: [-0.14, 0.02], hr: 0 }, hit: c.sling ? { hF: [0.42, -0.1], wF: -0.15, hB: [-0.09, -0.1], handB: 'palm', l: -0.04, b: [-0.05, 0.05], face: 'shout' } : { hF: [0.3, -0.24], wF: -0.7, hB: [0.24, 0.02], l: -0.16, b: [-0.14, 0.02], face: 'shout' } })) }),
  flick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { hF: [0.02, 0.2], tw: -0.25, l: -0.06 }, hit: { hF: [0.46, -0.1], tw: 0.35, l: 0.16, b: [0.06, 0.02], hand: 'palm', face: 'fierce' } })) }),
  throw: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { hF: { a: -2.4, r: 0.4 }, tw: -0.45, hp: -0.2, l: -0.16, b: [-0.04, 0.04], hB: [0.3, -0.06], handB: 'palm', face: 'fierce' }, hit: { hF: { a: 0.15, r: 0.43 }, tw: 0.5, hp: 0.3, l: 0.26, b: [0.1, 0.04], hB: [-0.1, 0.16], handB: 'fist', hand: 'palm', fF: [0.24, 0], fB: [-0.15, -0.03], face: 'fierce' } })) }),

  // ---------------------------------------------------------------- casting
  // both palms driven out together behind a beam
  push: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.7, load: { b: [-0.05, 0.11], l: -0.16, tw: -0.25, hF: [-0.12, 0.18], hB: [-0.15, 0.2], hand: 'palm', handB: 'palm', fF: [0.21, 0], fB: [-0.17, 0], face: 'grit' }, hit: { b: [0.12, 0.05], l: 0.24, tw: 0.15, hF: [0.48, -0.07], hB: [0.44, 0.04], hand: 'palm', handB: 'palm', fF: [0.29, 0], fB: [-0.19, -0.02], face: 'shout' } })), jitter: 0.006 }),
  // the arm thrown out to point, the body turned side-on behind it
  point: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { hF: [0.08, 0.06], tw: -0.2, l: -0.06, hB: [0.0, 0.3], face: 'fierce' }, hit: { hF: [0.49, -0.12], hand: 'finger', tw: 0.4, hp: 0.15, l: 0.1, hB: [-0.08, 0.3], fF: [0.19, 0], fB: [-0.13, 0], face: 'fierce' } })) }),
  // a hand raised high, then flung forward to send it
  raise: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.75, load: { hF: [0.1, -0.5], hand: 'palm', l: -0.14, ht: -0.15, tw: -0.25, b: [0, 0.02], hB: [-0.06, 0.3], face: 'fierce' }, hit: { hF: [0.46, -0.02], hand: 'palm', l: 0.16, tw: 0.35, b: [0.05, 0.04], ht: 0.0, face: 'shout' } })), jitter: 0.004 }),
  // both arms swept up to the sky
  summon: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.6, load: { b: [0, 0.12], l: 0.2, ht: 0.2, hF: [0.14, 0.2], hB: [-0.1, 0.22], hand: 'palm', handB: 'palm', face: 'grit' }, hit: { b: [0, -0.03], l: -0.2, ht: -0.3, hF: { a: -1.75, r: 0.43 }, hB: { a: -1.4, r: 0.43 }, zF: 0.12, zB: 0.12, hand: 'palm', handB: 'palm', face: 'shout' }, holdT: 0.18 })), jitter: 0.01 }),
  // a transformation: hunched over clenched fists, gathering it in, then thrown open with the head back — the roar
  powerup: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.78, load: { b: [0, 0.17], l: 0.3, ht: 0.25, hF: [0.04, 0.28], hB: [-0.04, 0.3], zF: 0.06, zB: 0.06, fF: [0.21, 0], fB: [-0.21, 0], zfF: 0.04, zfB: 0.04, face: 'grit' }, hit: { b: [0, -0.03], l: -0.2, ht: -0.25, hF: [0.18, -0.08], hB: [-0.16, -0.06], zF: 0.22, zB: 0.22, hand: 'fist', handB: 'fist', fF: [0.22, 0], fB: [-0.22, 0], face: 'shout' }, holdT: 0.16 })), jitter: 0.012 }),
  // arms crossed before the chest, coiled, then flung wide: a burst from the hands
  spread: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.72, load: { b: [0, 0.13], l: 0.2, hF: [0.18, 0.06], hB: [0.16, 0.08], zF: -0.12, zB: -0.12, face: 'grit' }, hit: { b: [0, -0.02], l: -0.1, hF: [0.36, -0.14], hB: [-0.36, -0.14], zF: 0.14, zB: 0.14, hand: 'palm', handB: 'palm', fF: [0.21, 0], fB: [-0.21, 0], face: 'shout' }, holdT: c.hitDur ? Math.min(0.5, c.hitDur) : 0.12 })), jitter: 0.008 }),
  hana: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.55, load: { b: [0, 0.03], hF: [0.14, 0.02], hB: [0.2, -0.05], eF: 1, eB: -1, hand: 'palm', handB: 'palm', face: 'fierce' }, hit: { b: [0, 0.02], ht: -0.06, hF: [0.19, -0.06], hB: [0.23, -0.13], eF: 1, eB: -1, hand: 'palm', handB: 'palm', face: 'fierce' }, holdT: c.hitDur ? Math.min(0.9, c.hitDur) : 0.22, holdK: 0.85, settle: false })) }),
  slam: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.72, load: { z: 0.3, l: -0.24, ht: -0.15, hF: [0.12, -0.46], hB: [0.05, -0.46], zF: 0.03, zB: 0.03, fF: [0.1, -0.2], fB: [-0.1, -0.2], face: 'grit' }, hit: { z: 0, b: [0.1, 0.27], l: 0.5, ht: 0.25, hF: [0.36, 0.5], hB: [0.3, 0.52], fF: [0.27, 0], fB: [-0.21, 0], face: 'shout' } })), legs: true, jitter: 0.008 }),
  // a punch at the air itself: the fist cocked back, driven out, stopped dead and shuddering
  quake: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.7, antic: { b: [0.02, 0.07], l: 0.12 }, load: { b: [-0.06, 0.09], l: -0.24, tw: -0.6, hp: -0.25, hF: [-0.24, -0.06], hB: [0.22, 0.04], face: 'grit' }, hit: { b: [0.2, 0.06], l: 0.36, tw: 0.6, hp: 0.4, hF: [0.5, -0.05], hB: [-0.1, 0.2], fF: [0.32, 0], fB: [-0.18, 0], sm: 0.06, face: 'shout' }, holdT: 0.14 })), jitter: 0.014, shake: { a: 0.012, t: 0.14 } }),
  pray: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { hF: [0.16, 0.04], hB: [0.14, 0.05], zF: -0.06, zB: -0.06, hand: 'palm', handB: 'palm', b: [0, 0.03], ht: 0.12 }, hit: { hF: [0.2, -0.3], hB: [-0.18, -0.3], zF: 0.08, zB: 0.08, hand: 'palm', handB: 'palm', b: [0, -0.02], ht: -0.1 } })) }),
  blink: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.16], l: 0.32, hF: [-0.1, 0.2], hB: [-0.14, 0.22] }, hit: { l: 0.5, b: [0.2, 0.06], hF: [-0.2, 0.2], hB: [-0.24, 0.22], fB: [-0.3, -0.1] } })), legs: true }),
  // Conqueror's Haki: no wind-up to speak of, only stillness — standing tall, chin up, fists at the sides, and a glare
  will: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.85, load: { b: [-0.02, 0.0], l: -0.1, ht: -0.16, hF: [0.03, 0.36], hB: [-0.05, 0.36], zF: 0.05, zB: 0.05, face: 'glare' }, hit: { b: [0, -0.02], l: -0.14, ht: -0.22, hF: [0.06, 0.34], hB: [-0.08, 0.34], zF: 0.12, zB: 0.12, face: 'glare' }, holdT: 0.35, settle: false })) }),
  // braced like iron: the guard locked tight, the feet planted wide
  guardup: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: GUARD, load: { b: [0, 0.08], hF: [0.15, -0.1], hB: [0.2, -0.02], eB: -1, zF: -0.05 }, hit: { b: [0, 0.1], hF: [0.16, -0.12], hB: [0.2, -0.03], eB: -1, zF: -0.06, zB: -0.04, zfF: 0.05, zfB: 0.05, face: 'grit' }, holdT: 0.3, settle: false })) }),
  flex: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { b: [0, 0.12], l: 0.12, hF: [0.12, 0.2], hB: [-0.1, 0.22], face: 'grit' }, hit: { b: [0, 0.1], l: -0.06, ht: -0.12, hF: [0.12, -0.24], hB: [-0.14, -0.24], zF: 0.2, zB: 0.2, eF: 1, eB: 1, face: 'shout' }, holdT: 0.2 })), jitter: 0.012 }),
  breath: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.75, load: { l: -0.34, ht: -0.22, b: [-0.04, 0.02], hF: [-0.1, 0.18], hB: [-0.16, 0.2], face: 'grit' }, hit: { l: 0.36, ht: 0.12, b: [0.08, 0.06], face: 'shout', hF: [-0.12, 0.24], hB: [-0.18, 0.26] }, holdT: c.hitDur ? Math.min(0.5, c.hitDur) : 0.18 })), jitter: 0.01 }),
  pull: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { hF: [0.48, -0.06], hand: 'claw', tw: 0.3, l: 0.16, b: [0.06, 0.04] }, hit: { hF: [0.08, 0.04], hand: 'fist', tw: -0.3, l: -0.22, b: [-0.08, 0.06], face: 'shout' } })) }),
  // ---------------------------------------------------------------- Devil Fruit signatures
  // Gum-Gum Pistol: the arm wound far back on its rubber, the body twisted away from it and the other hand aiming — then let go
  pistol: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.24, b: [-0.07, 0.06], tw: -0.75, hp: -0.3, hF: [-0.62, -0.03], zF: 0.05, stretch: true, hB: [0.3, -0.04], handB: 'palm', fF: [0.25, 0], fB: [-0.18, 0], face: 'grit' }, hit: { l: 0.28, b: [0.14, 0.03], tw: 0.65, hp: 0.4, hF: [0.47, -0.05], stretch: true, hB: [-0.05, 0.12], handB: 'fist', fF: [0.29, 0], fB: [-0.15, -0.05], face: 'shout' }, holdT: 0.12 })) }),
  // Gum-Gum Bazooka: both arms stretched back behind, then the two palms slammed out together
  bazooka: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.7, antic: { b: [0.02, 0.09], l: 0.14, hF: [0.25, 0.05], hB: [0.24, 0.08] }, load: { b: [-0.08, 0.09], l: -0.32, tw: -0.3, hF: [-0.7, 0.0], hB: [-0.72, 0.08], zF: 0.04, zB: 0.04, hand: 'palm', handB: 'palm', stretch: true, fF: [0.27, 0], fB: [-0.2, 0], face: 'grit' }, hit: { b: [0.23, 0.05], l: 0.33, tw: 0.15, hp: 0.2, hF: [0.53, -0.05], hB: [0.51, 0.07], hand: 'palm', handB: 'palm', stretch: true, fF: [0.34, 0], fB: [-0.16, -0.05], face: 'shout' }, holdT: 0.1 })) }),
  // a flurry: the stance wide, leaning in behind fists that blur (see samplePose)
  gatling: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.14, b: [-0.04, 0.08], tw: -0.2, hF: [-0.16, 0.02], hB: [-0.2, 0.06], fF: [0.26, 0], fB: [-0.2, 0], face: 'grit' }, hit: { l: 0.24, b: [0.08, 0.07], ht: 0.05, hF: [0.42, -0.02], hB: [0.38, 0.04], fF: [0.28, 0], fB: [-0.2, -0.02], face: 'shout' }, holdT: c.hitDur || 0.6, holdK: 0.85 })) }),
  kneel: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.5, load: { b: [0, 0.26], l: 0.46, hF: [0.24, 0.52], hB: [-0.1, 0.3], fF: [0.3, 0], fB: [-0.26, -0.02], face: 'grit' }, hit: { b: [0, 0.24], l: 0.4, hF: [0.24, 0.5], hB: [-0.12, 0.3], fF: [0.3, 0], fB: [-0.26, -0.02], face: 'fierce' }, holdT: 0.12 })), legs: true }),
  rocket: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.12], l: -0.26, hF: [-0.54, 0.08], hB: [-0.56, 0.12], stretch: true, face: 'grit' }, hit: { l: 0.62, z: 0.16, hF: [0.46, 0.0], hB: [0.44, 0.06], fF: [-0.3, -0.3], fB: [-0.42, -0.36], face: 'shout' } })), legs: true }),
  fly: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { b: [0, 0.12], l: 0.2 }, hit: { z: 0.5, l: 0.55, hF: [-0.3, 0.1], hB: [-0.34, 0.12], fF: [-0.25, -0.3], fB: [-0.35, -0.2] } })), legs: true }),
  // Hiken: the fist pulled back to the hip in its fire, the body wound round it and the other hand out to aim — then thrown with everything behind it
  hiken: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.62, antic: { b: [0.02, 0.07], l: 0.1, hF: [0.26, 0.0] }, load: { b: [-0.08, 0.1], l: -0.12, tw: -0.7, hp: -0.3, ht: 0.05, hF: [-0.2, 0.12], eF: 1, hB: [0.34, -0.06], handB: 'palm', fF: [0.27, 0], fB: [-0.21, 0], face: 'grit' }, hit: { b: [0.24, 0.06], l: 0.36, tw: 0.75, hp: 0.5, ht: -0.08, hF: [0.5, -0.04], hB: [-0.1, 0.18], handB: 'fist', fF: [0.38, 0], fB: [-0.15, -0.07], sm: 0.14, face: 'shout' }, follow: { l: 0.4, b: [0.27, 0.08], hF: [0.45, -0.02] }, holdT: 0.14 })), jitter: 0.006 }),
  // Gura Gura: the fist cocked high by the ear, the elbow up and back, then punched into the empty air in front — where it stops dead and the air cracks
  kaishin: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.66, antic: { b: [0.02, 0.08], l: 0.12 }, load: { b: [-0.06, 0.12], l: -0.12, tw: -0.62, hp: -0.25, hF: [-0.12, -0.16], eF: -0.5, zF: 0.06, hB: [0.22, 0.04], fF: [0.27, 0], fB: [-0.2, 0], face: 'grit' }, hit: { b: [0.17, 0.08], l: 0.3, tw: 0.55, hp: 0.4, hF: [0.42, -0.06], eF: 0.6, hB: [-0.08, 0.16], fF: [0.33, 0], fB: [-0.17, -0.04], sm: 0.04, face: 'shout' }, holdT: 0.18, holdK: 0.6 })), jitter: 0.016, shake: { a: 0.016, t: 0.2 } }),
  // Seaquake: both hands up gripping the air itself, then the whole body wrenching it round and down — the world tilts
  tilt: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.6, load: { b: [0, 0.06], l: -0.1, ht: -0.12, hF: [0.3, -0.18], hB: [0.28, -0.2], zF: 0.18, zB: 0.18, hand: 'claw', handB: 'claw', fF: [0.24, 0], fB: [-0.2, 0], zfF: 0.05, zfB: 0.05, face: 'grit' }, hit: { b: [0.04, 0.14], l: 0.2, ls: 0.35, tw: 0.4, ht: 0.05, hF: [0.32, 0.05], hB: [0.3, -0.25], zF: 0.1, zB: 0.12, hand: 'fist', handB: 'fist', face: 'shout' }, holdT: 0.3 })), jitter: 0.012, shake: { a: 0.012, t: 0.3 } }),
  // El Thor: the arm thrust up at the sky, the finger raised — and swept down at the target as the bolt falls
  skyward: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.45, load: { b: [0, 0.03], l: -0.1, ht: -0.25, tw: -0.15, hF: { a: -1.5, r: 0.43 }, hand: 'finger', hB: [0.02, 0.32], zB: 0.04, face: 'fierce' }, hit: { b: [0.04, 0.07], l: 0.12, ht: 0.05, tw: 0.3, hF: [0.42, 0.12], hand: 'finger', hB: [-0.05, 0.3], face: 'shout' }, holdT: 0.2 })), jitter: 0.005 }),
  // Ice Age: the palm raised high, then down onto one knee and slapped flat on the ground (it freezes out from there)
  groundpalm: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.55, load: { b: [0, -0.02], z: 0.02, l: -0.08, ht: -0.1, tw: -0.2, hF: { a: -1.3, r: 0.4 }, hand: 'palm', hB: [0.05, 0.3], face: 'fierce' }, hit: { b: [0.08, 0.34], l: 0.74, ht: -0.32, tw: 0.2, hF: [0.24, 0.72], hand: 'palm', hB: [-0.12, 0.25], fF: [0.31, 0], fB: [-0.24, 0.0], face: 'shout' }, holdT: c.hitDur ? Math.min(0.5, c.hitDur) : 0.3, holdK: 0.8 })), legs: true }),
  // ROOM: a hand held up before the face, open as if round a sphere, as the dome spreads out from it
  room: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.6, load: { b: [0, 0.05], l: 0.04, tw: -0.1, hF: [0.16, 0.06], hand: 'claw', hB: [0.0, 0.32], face: 'fierce' }, hit: { b: [0, 0.06], l: -0.04, ht: -0.08, tw: 0.15, hF: [0.24, -0.17], zF: 0.03, hand: 'claw', eF: 1, hB: [-0.02, 0.32], face: 'fierce' }, holdT: 0.28, settle: false })) }),
  // Dai Enkai: both hands raised high under the second sun, then one arm hurling it down at them
  sunraise: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.7, load: { b: [0, 0.04], l: -0.18, ht: -0.25, hF: { a: -1.55, r: 0.42 }, hB: { a: -1.45, r: 0.42 }, zF: 0.08, zB: 0.08, hand: 'palm', handB: 'palm', fF: [0.2, 0], fB: [-0.18, 0], face: 'grit' }, hit: { b: [0.16, 0.06], l: 0.32, tw: 0.4, ht: 0.0, hF: [0.47, -0.08], hB: [-0.1, 0.12], hand: 'palm', handB: 'fist', fF: [0.3, 0], fB: [-0.17, -0.04], face: 'shout' }, holdT: 0.15 })), jitter: 0.008 }),
};

// which limb (or blade) lands the blow — drives element glows and smears
const LIMB = {
  cross: 'hB', palm2: 'hB', shigan2: 'hB', claw2: 'hB', grab2: 'hB', dual2: 'wB',
  kick: 'fF', kick_high: 'fF', kick_low: 'fF', kick_spin: 'fF', sweep: 'fF', knee: 'fF', axe_kick: 'fF', rise_kick: 'fF', mouton: 'fF', handstand: 'fF', flying_kick: 'fF', stomp: 'fF',
  ballet_kick: 'fF', pirouette: 'fF', jete: 'fF', arabesque: 'fB', rocket: 'hF',
  slash: 'wF', slash2: 'wF', rise_slash: 'wF', slash3: 'wF', stab: 'wF', cleave: 'wF', iai: 'wF', dual1: 'wF', dual3: 'wF', dualx: 'wF', dual_stab: 'wF', tora: 'wF', bladespin: 'wF',
  axe: 'wF', axe2: 'wF', axe_slam: 'wF', staff: 'wF', staff2: 'wF', staff_jab: 'wF', shoot: 'wF', aim: 'wF', headbutt: 'head', breath: 'head',
};
// sweep direction of a cut across the facing (+1 clockwise on screen, -1 counter)
const SWEEP = { slash: 1, slash2: -1, rise_slash: -1, slash3: 1, cleave: 1, dual1: 1, dual2: 1, dual3: -1, dualx: 1, tora: 1, axe: 1, axe2: -1, axe_slam: 1, staff: 1, staff2: -1, chop: 1, chop2: -1, claw: 1, claw2: -1, claw_x: 1, bladespin: 1, kick_spin: -1, sweep: -1, pirouette: -1, iai: 1 };
const FLURRY = new Set(['gatling', 'jab', 'cross', 'shigan', 'shigan2', 'palm', 'claw', 'grab', 'kick', 'thrust']);
const SPINS = new Set(['kick_spin', 'pirouette', 'bladespin', 'handstand', 'sweep', 'slash3']);
// a smear's channel by the limb that strikes (see the rig)
const SM_CH = { hF: 'smF', hB: 'smB', fF: 'smfF', fB: 'smfB' };
// Each clip's own weight class (docs/ANIMATION.md): what it's timed as when
// nothing says otherwise. A move's data can make it heavier (a heavy blow,
// an impact frame: anim/timing.js weightOf); a chain's blows are timed by
// where they come in the chain.
const CLIP_WEIGHT = {
  light: 'jab cross palm palm2 shigan shigan2 claw claw2 grab grab2 chop chop2 kick slash slash2 dual1 dual2 dual3 staff staff2 shoot flick ballet_kick pirouette',
  medium: 'hook kick_high kick_spin sweep rise_slash stab dual_stab staff_jab thrust throw point push raise room pull pray hana spread guardup flex blink jete knee rise_kick pistol skyward breath',
  heavy: 'uppercut haymaker palm_double claw_x headbutt charge mouton axe_kick flying_kick stomp arabesque cleave iai dualx tora bladespin axe axe2 aim slam rankyaku vibe_palm rocket fly hiken groundpalm summon powerup tilt bazooka gatling kneel quake handstand slash3',
  massive: 'axe_slam kaishin sunraise will',
};
const WEIGHT_OF = {};
for (const [k, v] of Object.entries(CLIP_WEIGHT)) for (const n of v.split(' ')) WEIGHT_OF[n] = k;

/** Resolve an animation for an action. Unknown names fall back to a sensible base clip. */
export function buildClip(name, w, T, c = {}) {
  const key = CLIPS[name] ? name : ALIAS[name] || 'jab';
  const f = CLIPS[key];
  if (!c.weight) c = { ...c, weight: WEIGHT_OF[key] || 'medium' };
  const clip = f(Math.max(0, w), Math.max(T, w + 0.08), c);
  clip.name = key;
  clip.w = w;
  if (c.flurry) clip.flurry = c.flurry;
  if (c.spin) clip.spin = c.spin;
  clip.limb = LIMB[key] || (clip.legs ? 'fF' : 'hF');
  clip.sweep = SWEEP[key] || 0;
  // smears only during the swing itself (from the last of the wind-up; not the way back to the stance)
  const K = clip.keys;
  const hi = K.findIndex((k) => k.t >= w - 1e-4);
  clip.trailFrom = hi > 0 ? K[hi - 1].t : K[1] ? K[1].t : 0;
  const hold = K.find((k) => k.t > w + 1e-4);
  clip.trailTo = Math.max((hold ? hold.t : w) + 0.07, c.flurry ? c.flurry.t1 : 0, c.spin ? c.spin.t1 : 0);
  return clip;
}
const ALIAS = { punch: 'cross', heavy: 'haymaker', cast: 'push', block: 'guardup', slashing: 'slash', kick: 'kick', grab: 'grab' };
export const hasClip = (name) => !!CLIPS[name];

// ------------------------------------------------------------------ ability → clip
const GENERIC = new Set(['punch', 'heavy', 'slash', 'thrust', 'kick', 'grab', 'cast', 'shoot', 'block']);
const MAIN = (s) => s.hit || s.proj || s.dash || s.zone || s.teleport || s.pull || s.conqueror || s.heal || s.buff || s.summon;
// the signature techniques that have a wind-up and a release of their own
// (their data only says 'punch' or 'cast'): Hiken's fist pulled back in its
// fire, the Gura Gura fist cracking the air, El Thor's arm raised to the sky,
// Ice Age's palm to the ground, the hand raised for a ROOM, the second sun —
// and the last hit of a combo that should end it with a flourish
const TECH_CLIP = {
  mera_hiken: 'hiken', ryu_hiken: 'hiken', magu_daifunka: 'hiken',
  gura_punch: 'kaishin', gura_kaishin: 'kaishin', haki_emission: 'kaishin', gura_tsunami: 'tilt',
  goro_elthor: 'skyward', clima_thunderbolt: 'skyward', zushi_meteor: 'skyward',
  hie_ageand: 'groundpalm', suna_dry: 'groundpalm', suna_spada: 'groundpalm',
  ope_room: 'room', mera_entei: 'sunraise',
  roku_3: 'rankyaku', elec_3: 'kick_spin', hassho_3: 'vibe_palm', hassho_heavy: 'vibe_palm',
};

/** How heavy an actor moves: its look's mass, with a transformation's bulk or size on top. */
export function actorMass(actor) {
  if (!actor || !actor.look) return 1;
  const bufs = actor.buffs || [];
  const bl = bufs.find((b) => b.look);
  const sc = bufs.find((b) => b.mods && b.mods.scale);
  const look = bl ? { ...actor.look, ...bl.look } : actor.look;
  return massOf(sc ? { ...look, scale: (look.scale || 1) * sc.mods.scale } : look);
}

/**
 * What the poses need to know about an actor beyond its moment-to-moment
 * state (called once a frame from render/combatfx.js actorVisuals, into the
 * pose): how heavy it moves, how its race dodges, a Gear it's in, and its
 * flight.
 */
export function poseExtras(actor, out, now) {
  const m = actorMass(actor);
  if (m !== 1) out.mass = m;
  const race = actor.race || actor.look?.race;
  out.dodgeKind = race === 'skypiean' ? 'glide' : race === 'lunarian' ? 'wing' : race === 'mink' ? 'pounce' : race === 'longleg' ? 'stride' : m >= 1.25 ? 'heavy' : 'dash';
  if ((actor.buffs || []).some((b) => b.id === 'gear2')) out.gear = 2;
  if (now !== undefined && (actor.flying || actor._fly)) {
    const F = flightState(actor, now);
    if (F) out.flight = F;
  }
  return out;
}

/** Total duration of a technique (mirrors abilities.js abilityTotal). */
function defTotal(def) {
  const last = Math.max(0, ...(def.steps || []).map((s) => (s.at ?? def.windup ?? 0) + (s.dash ? s.dash.time : 0) + (s.hit ? s.hit.duration ?? 0.1 : 0)));
  return Math.max((def.windup ?? 0) + (def.active ?? 0.1), last) + (def.recover ?? 0.2);
}

/** Which weapon (if any) the actor swings for this technique. */
export function weaponFor(def, actor) {
  const wpn = actor && actor.weapon;
  if (!wpn) return null;
  if (def.weapon) return actor.hasWeapon ? (actor.hasWeapon(def.weapon) ? def.weapon : null) : wpn.kind === def.weapon ? def.weapon : null;
  const s = (def.steps || []).find(MAIN) || {};
  const slashing = s.hit?.slashing || s.dash?.hit?.slashing || s.proj?.slashing;
  if (wpn.kind === 'gun') return def.anim === 'shoot' ? 'gun' : null;
  if ((wpn.kind === 'sword' && slashing) || ((wpn.kind === 'axe' || wpn.kind === 'staff') && (def.anim === 'slash' || def.anim === 'heavy' || def.anim === 'thrust'))) return wpn.kind;
  return null;
}

/**
 * The clip an actor plays for a technique: an explicit `clip` field wins,
 * then a signature technique's own, then a specific clip name in `anim`,
 * then the generic anim names used by content packs ('punch', 'heavy',
 * 'slash'...) resolved from what the technique actually does (dash,
 * projectile, ring, beam...) and the weapon.
 */
export function actionClip(def, actor, stanceName) {
  const w = Math.max(0, def.windup ?? 0.1);
  const steps = def.steps || [];
  const T = defTotal(def);
  const main = steps.find(MAIN) || steps[0] || {};
  const wk = weaponFor(def, actor);
  const c = { stance: STANCES[stanceName] || GUARD };
  for (const s of steps) if (s.dash) c.dashT = Math.max(c.dashT || 0, (s.at ?? w) - w + s.dash.time);
  const hitDur = main.hit ? main.hit.duration || 0 : 0;
  if (hitDur > 0.2) c.hitDur = hitDur;
  if (wk === 'sword' && (actor.weapon?.count || 1) >= 2) c.two = true;
  if (wk === 'gun' && gunKind(actor.weapon) === 'sling') c.sling = true;
  const name = pickClip(def, actor, main, steps, c, wk);
  // timed by its weight (a chain's blows by where they come in it) and the body's mass
  const dw = weightOf(def);
  c.weight = def.m1Chain ? dw : heavier(WEIGHT_OF[name] || dw, dw);
  c.mass = actorMass(actor);
  c.chained = !!def.chained;
  if (c.hitDur) {
    // (Gum-Gum fists blur out far past where an arm could reach)
    const rubber = !!actor && actor.fruit === 'gomu' && (def.source || '').startsWith('fruit');
    if (FLURRY.has(name) && !SPINS.has(name)) c.flurry = { t0: w, t1: w + c.hitDur, rate: 12, legs: name.startsWith('kick'), reach: rubber ? 0.6 : 0.34, stretch: rubber };
    if (SPINS.has(name) && name !== 'handstand') c.spin = { t0: w, t1: w + c.hitDur, turns: Math.max(1, Math.round(c.hitDur * 5)) };
  }
  const clip = buildClip(name, w, T, c);
  clip.weapon = wk;
  return clip;
}

function pickClip(def, actor, s, steps, c, wk) {
  if (def.clip && CLIPS[def.clip]) return def.clip;
  const sig = TECH_CLIP[def.id];
  if (sig && !wk) return sig;
  const a = def.anim || 'punch';
  if (CLIPS[a] && !GENERIC.has(a)) return a;
  const hit = s.hit, dash = s.dash, proj = s.proj;
  const rubber = actor && actor.fruit === 'gomu' && (def.source || '').startsWith('fruit');
  const multi = hit && (hit.duration || 0) > 0.3;
  const buffy = steps.some((x) => x.buff);
  switch (a) {
    case 'punch':
      if (rubber) return multi ? 'gatling' : 'pistol';
      if (multi) return 'gatling';
      if (hit && hit.shape === 'circle') return 'slam';
      return proj && proj.count > 2 ? 'push' : 'cross';
    case 'heavy':
      if (wk === 'sword') return dash ? 'iai' : c.two ? 'tora' : 'cleave';
      if (wk === 'axe') return hit && hit.shape === 'circle' ? 'axe_slam' : 'axe';
      if (wk === 'staff') return 'staff';
      if (wk === 'gun') return 'aim';
      if (dash) return 'charge';
      if (rubber) return 'bazooka';
      if (hit && (hit.shape === 'circle' || hit.shape === 'ring')) return 'slam';
      if (s.zone) return 'slam';
      if (hit && hit.shape === 'line') return 'quake';
      return 'haymaker';
    case 'slash':
      if (wk === 'sword') return dash ? 'iai' : hit && hit.shape === 'circle' ? 'bladespin' : c.two ? 'dual1' : 'slash';
      if (wk === 'axe') return hit && hit.shape === 'circle' ? 'axe_slam' : 'axe';
      if (wk === 'staff') return 'staff';
      if (dash) return 'charge';
      if (proj) return 'throw';
      if (hit && hit.shape === 'circle') return 'kick_spin';
      return 'chop';
    case 'thrust':
      if (dash) return wk === 'sword' ? 'iai' : rubber ? 'rocket' : 'charge';
      if (wk === 'sword') return c.two ? 'dual_stab' : 'stab';
      if (wk === 'staff') return 'staff_jab';
      return 'thrust';
    case 'kick':
      if (hit && (hit.shape === 'circle' || hit.shape === 'ring')) return multi ? 'handstand' : 'kick_spin';
      if (dash) return 'flying_kick';
      if (proj) return 'kick_high';
      if (hit && (hit.stun || 0) >= 1) return 'rise_kick';
      if (hit && hit.heavy) return 'mouton';
      return 'kick';
    case 'grab':
      if (s.pull) return 'pull';
      if (s.zone) return 'raise';
      if (hit && hit.shape === 'line') return 'slam';
      if (proj) return 'throw';
      return 'grab';
    case 'cast':
      if (s.conqueror) return 'will';
      if (s.heal) return 'pray';
      if (s.teleport) return 'blink';
      if (dash) return dash.air ? 'fly' : 'charge';
      if (s.summon) return 'summon';
      if (buffy && !hit && !proj && !s.zone) return 'powerup';
      if (s.zone) return s.zone.atTarget ? 'point' : 'spread';
      if (s.pull) return 'pull';
      if (hit && (hit.shape === 'circle' || hit.shape === 'ring')) return 'spread';
      if (hit && hit.shape === 'line') return 'push';
      if (proj) return proj.count > 3 ? 'spread' : 'push';
      return 'powerup';
    case 'shoot':
      if (wk === 'gun') return (def.windup ?? 0.1) >= 0.45 ? 'aim' : 'shoot';
      if (s.zone) return 'throw';
      return proj && proj.count > 1 ? 'throw' : 'flick';
    case 'block':
      return 'guardup';
    default:
      return 'cross';
  }
}

// ------------------------------------------------------------------ sampling
// The parts of a body move a beat apart (overlap): the hips start a blow
// LEAD seconds ahead of the rest and come home first; the head follows LAG
// seconds behind, so a blow drives through the body instead of every joint
// arriving on the same frame.
const LEAD = 0.024, LAG = 0.032;
const HEAD = ['ht', 'hy', 'hr'];

/** Sample a clip at time t. `pose` carries movement info (walk cycle while attacking) and the blows taken. */
export function samplePose(A, t, pose) {
  const keys = A.keys;
  const s0 = seg(keys, t);
  const A0 = s0.a, A1 = s0.b, k = s0.k;
  const P = {};
  for (const key in A0) P[key] = lerpVal(A0[key], A1[key], k);
  if (keys.length > 2) {
    const L = seg(keys, Math.min(keys[keys.length - 1].t, t + LEAD));
    P.b = lerpVal(L.a.b, L.b.b, L.k);
    P.hp = lerpVal(L.a.hp, L.b.hp, L.k);
    const G = seg(keys, Math.max(0, t - LAG));
    for (const key of HEAD) P[key] = lerpVal(G.a[key], G.b[key], G.k);
  }
  // charge tremble during long wind-ups
  if (A.jitter && t < (A.w ?? keys[2]?.t ?? 0)) {
    const amp = A.jitter * Math.min(1, t / 0.2);
    P.b = [P.b[0] + Math.sin(t * 91) * amp, P.b[1] + Math.cos(t * 77) * amp];
  }
  // the shudder of a blow that stops dead (the Gura Gura fist cracking the air)
  const sh = A.shake;
  if (sh && t >= A.w && t < A.w + sh.t) {
    const amp = sh.a * (1 - (t - A.w) / sh.t);
    P.b = [P.b[0] + Math.sin(t * 97) * amp, P.b[1] + Math.cos(t * 83) * amp * 0.6];
    const h = toXY(P.hF);
    P.hF = [h[0] + Math.sin(t * 131) * amp * 0.8, h[1] + Math.cos(t * 113) * amp * 0.8];
  }
  // flurries: alternate the fists (or feet) rapidly, the shoulders rolling behind each one
  const f = A.flurry;
  if (f && t >= f.t0 && t <= f.t1) {
    const ph = (t - f.t0) * (f.rate || 11);
    const tri = Math.abs((ph % 2) - 1); // 1 → 0 → 1
    if (f.legs) {
      P.fF = [0.12 + 0.52 * tri, -0.3 - 0.2 * tri];
      P.fB = [-0.05, 0];
      P.smfF = 0.06 * tri;
    } else {
      const R = f.reach || 0.34;
      // (each fist snaps out and comes back slower: most of the beat is the blow arriving)
      const out = (x) => 1 - (1 - x) ** 2;
      P.hF = [0.12 + R * out(tri), -0.04 + 0.06 * (1 - tri)];
      P.hB = [0.12 + R * out(1 - tri), 0.02 + 0.05 * tri];
      P.tw = (P.tw || 0) + 0.3 * (tri - 0.5);
      P.hp = (P.hp || 0) + 0.1 * (tri - 0.5);
      P.smF = 0.08 * tri; P.smB = 0.08 * (1 - tri);
      if (f.stretch) P.stretch = true;
    }
  }
  // spins: whole-body turns through all facings
  const s = A.spin;
  if (s && t >= s.t0 && t <= s.t1) P.sp = (P.sp || 0) + ((t - s.t0) / Math.max(0.05, s.t1 - s.t0)) * s.turns;
  // the striking limb's smear (the rig overreaches it)
  if (P.sm) { const ch = SM_CH[A.limb]; if (ch) P[ch] = Math.max(P[ch] || 0, P.sm); }
  if (pose) {
    // in the air the legs hang as the flight has them; on the ground they keep
    // walking while the arms swing (unless the clip drives the legs)
    if (pose.flight && !A.legs) flightLegs(P, pose);
    else if (pose.moving && !A.legs) walkLegs(P, pose);
    // a blow taken mid-swing (armoured through it): a flinch on top
    flinch(P, pose, 0.45);
    // a counter that landed: the follow-through driven on harder
    const ca = pose.counterAge;
    if (ca >= 0 && ca < 0.22) {
      const e = Math.sin((ca / 0.22) * Math.PI);
      P.l = (P.l || 0) + 0.1 * e;
      P.b = [P.b[0] + 0.04 * e, P.b[1] + 0.02 * e];
    }
  }
  return P;
}

// channels that fade back to nothing when a pose that drove them gives way
// to one that doesn't (the wings fold, the bank comes level, the body unsquashes)
const FADE = { ws: 0, wg: 0, wf: 0, bk: 0, sq: 1, inF: 0, inB: 0 };

/** Mix two poses (used to ease between clips, stances and states). */
export function blendPose(A, B, k) {
  if (!A || k >= 1) return B;
  if (k <= 0) return A;
  const P = {};
  for (const key in B) {
    let a = A[key];
    const b = B[key];
    // turns and rolls wrap around: take the short way
    if (key === 'sp' && typeof a === 'number' && typeof b === 'number') a = b + ((((a - b) % 1) + 1.5) % 1) - 0.5;
    else if (key === 'r' && typeof a === 'number' && typeof b === 'number') a = b + ((((a - b) % TAU) + TAU * 1.5) % TAU) - Math.PI;
    P[key] = lerpVal(a, b, k);
  }
  for (const key in FADE) if (B[key] === undefined && typeof A[key] === 'number') P[key] = A[key] + (FADE[key] - A[key]) * k;
  return P;
}

// Gear Second: low and coiled, a hand down by the ground (the Enies Lobby crouch)
const GEAR2 = { ...GUARD, b: [0, 0.16], l: 0.4, ht: -0.18, hF: [0.24, 0.3], hB: [0.13, 0.05], eF: 1, hand: 'palm', fF: [0.25, 0], fB: [-0.21, 0], zfF: 0.04, zfB: 0.04, tw: 0.12, hp: 0.06 };
// Gear Fourth: the swollen arms up, one cocked, the body bouncing like a ball
const GEAR4 = { ...GUARD, b: [0, 0.03], l: 0.12, ht: 0.02, hF: [0.24, -0.06], hB: [0.08, -0.04], zF: 0.16, zB: 0.12, eF: -0.6, eB: -0.6, fF: [0.13, 0], fB: [-0.13, 0], zfF: 0.05, zfB: 0.05, tw: 0.16 };

/** Pose when no action is running: idle, fighting stance, walk, sprint, swim, flight, block, the blows taken, dodge, get-up. */
export function restPose(pose) {
  const t = pose.time || 0;
  let stance = pose.stanceP || GUARD;
  // (a transformation fights from its own stance)
  if (pose.gear === 2 && stance === GUARD) stance = GEAR2;
  if (pose.bounce && !stance.wF) stance = GEAR4;
  // (a weapon taken in hand is held ready in its stance, in a fight or not)
  const base = pose.block !== undefined ? GUARD : pose.combat || pose.drawn ? stance : STAND;
  const P = { ...base };
  P.b = [base.b[0], base.b[1] + Math.sin(t * 2.2) * 0.012];
  if (pose.combat && !pose.moving && !pose.bounce) {
    // light fighter's bounce (a heavier body bounces slower and sinks deeper)
    const m = pose.mass || 1;
    const bounce = Math.abs(Math.sin(t * 4.2 / Math.sqrt(m)));
    P.b = [base.b[0], base.b[1] + bounce * 0.022 * m];
    if (Array.isArray(base.hF)) P.hF = [base.hF[0], base.hF[1] + bounce * 0.015];
    if (Array.isArray(base.hB)) P.hB = [base.hB[0], base.hB[1] + bounce * 0.012];
  }
  if (pose.flight) flightPose(P, pose);
  else if (pose.moving) gaitPose(P, pose, base);
  if (pose.activity) activityPose(P, pose.activity, t);
  if (pose.bounce && !pose.flight) gear4Bounce(P, t, pose.moving);
  if (pose.charge) chargePose(P, pose.charge, t);
  if (pose.air && !pose.flight) airPose(P, pose.air);
  if (pose.swimming) swimPose(P, pose.swim || 'tread', t * (pose.swimRate || 1), pose.swimDir || 0);
  if (pose.block !== undefined) blockPose(P, pose);
  if (pose.armOn !== undefined && !pose.swimming) hardenPose(P, pose.armOn, t);
  if (pose.parryAge !== undefined) parryPose(P, pose);
  // a parried attacker reels open and a broken guard stumbles; any other blow
  // staggers, flinching away from where it came from
  if (!(parriedPose(P, pose) || guardBrokenPose(P, pose))) {
    if (pose.state === 'hurt') hurtPose(P, pose, t);
    flinch(P, pose, 1);
  }
  if (pose.counterAge !== undefined && pose.state !== 'hurt') counterPose(P, pose);
  if (pose.dodge !== undefined) dodgePose(P, pose);
  if (pose.getUp !== undefined) getUpPose(P, pose.getUp, t);
  if (pose.launch) launchPose(P, pose.launch);
  return P;
}

/**
 * Gear Fourth: Boundman bounces where he stands like a ball — a long float
 * up (stretched tall, the knees drawn in), a short hard contact (squashed,
 * the knees deep), the swollen fists up all the while. Walking, the bounce
 * carries him along in longer hops.
 */
function gear4Bounce(P, t, moving) {
  const per = moving ? 0.5 : 0.62, ph = (t / per) % 1;
  // (in contact for the first fifth of the cycle; a parabola in the air the rest)
  const contact = 0.2;
  let z = 0, sq = 1, knee = 0;
  if (ph < contact) {
    const u = ph / contact, d = Math.sin(u * Math.PI);
    sq = 1 - 0.13 * d; knee = d;
  } else {
    const u = (ph - contact) / (1 - contact);
    z = 4 * u * (1 - u);
    sq = 1 + 0.06 * Math.sin(Math.min(1, u * 2.2) * Math.PI) * (1 - u);
  }
  P.z = (P.z || 0) + z * (moving ? 0.42 : 0.3);
  P.b = [P.b[0], P.b[1] + 0.14 * knee];
  P.l = (P.l || 0) + 0.08 * knee;
  P.sq = sq;
  if (!moving) {
    P.fF = [0.13, -0.05 * (1 - knee) * Math.min(1, z * 3)]; P.fB = [-0.13, -0.06 * (1 - knee) * Math.min(1, z * 3)];
  }
  const hF = toXY(P.hF), hB = toXY(P.hB);
  P.hF = [hF[0], hF[1] + 0.05 * knee - 0.03 * z]; P.hB = [hB[0], hB[1] + 0.05 * knee - 0.03 * z];
  P.face = 'fierce';
}
