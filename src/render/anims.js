// Keyframed animation clips for the character rig (see ./character.js).
//
// A pose P is a small bag of numbers:
//   b: [dx, dy]   hip offset (dx forward, dy down)      l: torso lean (+ forward)
//   r: body roll  z: airborne height   sp: body spin in turns   ht: head tilt
//   hF/hB: front/back hand target relative to the shoulder, [x, y] or polar {a, r}
//   eF/eB: elbow side (-1..1)   fF/fB: foot target relative to the ground under the hip
//   wF/wB: blade angles (upper-body frame)   m: mouth-blade angle (Santoryu)
//   hand/handB: 'fist' | 'palm' | 'finger' | 'claw'   face: 'fierce' | 'shout'
//   stretch: rubber limbs may exceed their length
// All positions are in tiles, side view, facing right; the renderer mirrors
// and projects them for the other facings.
//
// Every strike clip has the same rhythm: anticipation (load) → strike (lands
// exactly at the ability's windup, i.e. its hit frame) → short hold (which
// hit-stop freezes) → follow-through → back to the stance.

const TAU = Math.PI * 2;

export const STAND = { b: [0, 0], l: 0, r: 0, z: 0, sp: 0, ht: 0, hF: [0.05, 0.4], hB: [-0.03, 0.4], eF: 1, eB: 1, fF: [0.05, 0], fB: [-0.05, 0], wF: null, wB: null, m: 0.15, hand: 'fist', handB: 'fist', face: null, stretch: false };
export const GUARD = { ...STAND, b: [0, 0.035], l: 0.07, hF: [0.21, 0.02], hB: [0.13, 0.08], fF: [0.16, 0], fB: [-0.13, 0] };
const PALMS = { ...GUARD, hF: [0.24, 0.0], hB: [0.12, 0.1], hand: 'palm', handB: 'palm', b: [0, 0.07], fF: [0.2, 0], fB: [-0.16, 0] };
const SWORD = { ...STAND, b: [0, 0.045], l: 0.06, hF: [0.2, 0.12], hB: [0.13, 0.15], wF: -0.75, fF: [0.19, 0], fB: [-0.14, 0] };
const SWORD2 = { ...SWORD, hF: [0.22, 0.1], hB: [0.1, 0.12], wF: -0.55, wB: -1.05 };
const GUN = { ...STAND, hF: [0.26, 0.16], wF: 0.35, hB: [0.0, 0.34], fF: [0.12, 0], fB: [-0.1, 0] };
const HEAVYW = { ...SWORD, hF: [0.16, 0.14], hB: [0.1, 0.17], wF: -1.1 };

const EASE = {
  lin: (k) => k,
  out: (k) => 1 - (1 - k) ** 3,
  in: (k) => k * k * k,
  inout: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  snap: (k) => 1 - (1 - k) ** 5,
  back: (k) => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
};

const toXY = (h) => (Array.isArray(h) ? h : [Math.cos(h.a) * h.r, Math.sin(h.a) * h.r]);
function lerpVal(a, b, k) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (!Array.isArray(a) && !Array.isArray(b)) return { a: a.a + (b.a - a.a) * k, r: a.r + (b.r - a.r) * k };
    const A = toXY(a), B = toXY(b);
    return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k];
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return k < 0.5 ? a : b;
  return k < 0.35 ? a : b;
}

function finalize(keys) {
  let prev = STAND;
  for (const k of keys) { k.P = { ...prev, ...k.p }; prev = k.P; }
  return keys;
}

/** Standard strike timeline: stance → load → STRIKE (at windup) → hold → follow → stance. */
function strike(w, T, o) {
  const st = o.stance || GUARD;
  const tLoad = Math.max(0.016, Math.min(w * (o.loadAt ?? 0.64), w - 0.014));
  const tHit = Math.max(tLoad + 0.014, w);
  const rest = Math.max(0.04, T - tHit);
  const tHold = tHit + Math.min(o.holdT ?? 0.055, rest * (o.holdK ?? 0.4));
  const keys = [
    { t: 0, p: st },
    { t: tLoad, p: o.load, e: o.loadEase || 'out' },
    { t: tHit, p: o.hit, e: o.hitEase || 'snap' },
    { t: tHold, p: o.hold || o.hit, e: 'lin' },
  ];
  if (o.follow) keys.push({ t: tHold + (Math.max(T, tHold + 0.05) - tHold) * (o.followAt ?? 0.4), p: o.follow, e: 'out' });
  keys.push({ t: Math.max(T, tHold + 0.05), p: o.end || st, e: 'inout' });
  return finalize(keys);
}

// ------------------------------------------------------------------ clip table
// Each clip: (w, T, c) → { keys, legs?, flurry?, spin?, jitter? }
//   w = windup (hit frame), T = total duration, c = context from the caller
//   (dash window, flurry window, weapon count...)
const S = (c, o) => ({ ...o, holdT: c.dashT ? Math.max(o.holdT ?? 0.055, c.dashT) : o.holdT, holdK: c.dashT ? 0.9 : o.holdK });

const CLIPS = {
  // ---------------------------------------------------------------- fists
  jab: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.05], l: 0.02, hF: [0.12, 0.07] }, hit: { b: [0.1, 0.02], l: 0.18, hF: [0.46, -0.07], hB: [0.1, 0.1], fF: [0.22, 0], fB: [-0.14, 0], face: 'fierce' } })) }),
  cross: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.03, 0.05], l: -0.06, hB: [0.04, 0.1], hF: [0.18, 0.02] }, hit: { b: [0.13, 0.02], l: 0.3, hB: [0.48, -0.08], hF: [0.08, 0.12], fF: [0.24, 0], fB: [-0.16, -0.02], face: 'fierce' } })) }),
  hook: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.03, 0.06], l: -0.18, hF: [-0.12, 0.02], eF: 1 }, hit: { b: [0.08, 0.03], l: 0.26, hF: [0.34, -0.1], eF: -0.9, hB: [0.1, 0.1], face: 'fierce' }, follow: { l: 0.32, hF: [0.22, -0.02], eF: -0.4 } })) }),
  uppercut: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.16], l: 0.22, hF: [0.12, 0.3], eF: 1, fF: [0.2, 0], fB: [-0.16, 0] }, hit: { b: [0.08, -0.06], z: 0.08, l: -0.16, hF: [0.2, -0.46], eF: 0.5, hB: [0.14, 0.14], fF: [0.18, -0.03], fB: [-0.12, -0.12], face: 'shout' }, follow: { z: 0, l: -0.1 } })), legs: true }),
  haymaker: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.72, load: { b: [-0.1, 0.08], l: -0.34, hF: [-0.36, -0.12], eF: 0.9, hB: [0.2, 0.0], fF: [0.24, 0], fB: [-0.18, 0], face: 'fierce' }, hit: { b: [0.24, 0.03], l: 0.42, hF: [0.5, -0.03], eF: 0.2, hB: [-0.12, 0.2], fF: [0.34, 0], fB: [-0.14, -0.06], face: 'shout' }, follow: { b: [0.26, 0.06], l: 0.46, hF: [0.44, 0.1] } })), jitter: 0.012 }),
  palm: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: PALMS, load: { b: [-0.02, 0.08], l: 0.0, hF: [0.1, 0.1] }, hit: { b: [0.12, 0.05], l: 0.22, hF: [0.48, -0.02], hB: [0.08, 0.14], fF: [0.26, 0], face: 'fierce' } })) }),
  palm2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: PALMS, load: { b: [-0.03, 0.08], l: -0.08, hB: [0.0, 0.12], hF: [0.2, 0.04] }, hit: { b: [0.14, 0.05], l: 0.3, hB: [0.5, -0.03], hF: [0.06, 0.14], fF: [0.26, 0], fB: [-0.18, -0.02], face: 'fierce' } })) }),
  palm_double: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: PALMS, loadAt: 0.7, load: { b: [-0.08, 0.12], l: -0.2, hF: [-0.12, 0.14], hB: [-0.16, 0.18] }, hit: { b: [0.22, 0.06], l: 0.32, hF: [0.5, -0.06], hB: [0.46, 0.06], fF: [0.32, 0], fB: [-0.18, -0.03], face: 'shout' }, follow: { l: 0.36 } })), jitter: 0.01 }),
  shigan: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.03, 0.05], l: -0.06, hF: [0.04, 0.1], hand: 'finger' }, hit: { b: [0.16, 0.02], l: 0.32, hF: [0.52, -0.06], hand: 'finger', hB: [-0.08, 0.2], fF: [0.26, 0], fB: [-0.18, -0.02], face: 'fierce' } })) }),
  shigan2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.03, 0.05], l: -0.08, hB: [0.0, 0.12], handB: 'finger' }, hit: { b: [0.17, 0.02], l: 0.34, hB: [0.52, -0.06], handB: 'finger', hF: [0.06, 0.16], fF: [0.26, 0], fB: [-0.18, -0.02], face: 'fierce' } })) }),
  claw: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.12, hF: [0.02, -0.38], hand: 'claw', eF: 1 }, hit: { l: 0.28, b: [0.1, 0.05], hF: [0.34, 0.26], hand: 'claw', face: 'fierce' } })) }),
  claw2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: 0.12, b: [0, 0.08], hB: [0.02, 0.32], handB: 'claw' }, hit: { l: -0.12, b: [0.1, 0.0], hB: [0.36, -0.32], handB: 'claw', hF: [0.12, 0.12], face: 'fierce' } })) }),
  grab: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.06], l: -0.08, hF: [0.1, 0.02], hand: 'claw' }, hit: { b: [0.12, 0.03], l: 0.26, hF: [0.5, -0.05], hand: 'claw', face: 'fierce' }, follow: { hand: 'fist', hF: [0.4, -0.02], l: 0.18 } })) }),
  grab2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.06], l: -0.1, hB: [0.02, 0.06], handB: 'claw' }, hit: { b: [0.13, 0.03], l: 0.3, hB: [0.5, -0.04], handB: 'claw', hF: [0.08, 0.14], face: 'fierce' }, follow: { handB: 'fist', hB: [0.4, 0.0] } })) }),
  chop: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.14, b: [-0.02, 0.04], hF: { a: -2.1, r: 0.36 }, hand: 'palm' }, hit: { l: 0.26, b: [0.12, 0.06], hF: { a: 0.55, r: 0.43 }, hand: 'palm', face: 'fierce' } })) }),
  thrust: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.05, 0.09], l: -0.06, hF: [0.08, 0.06] }, hit: { b: [0.14, 0.04], l: 0.46, hF: [0.44, 0.0], hB: [-0.22, 0.16], fF: [0.26, 0], fB: [-0.32, -0.08], face: 'shout' } })) }),
  charge: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.06, 0.12], l: 0.1, hF: [0.1, 0.18], hB: [-0.1, 0.2] }, hit: { b: [0.12, 0.08], l: 0.58, hF: [0.18, 0.2], hB: [-0.2, 0.2], fF: [0.26, 0], fB: [-0.38, -0.1], face: 'shout' } })), legs: true }),
  headbutt: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.4, b: [-0.06, 0.02], hF: [0.1, 0.25], hB: [0.02, 0.28] }, hit: { l: 0.52, b: [0.18, 0.06], ht: 0.3, face: 'shout' } })) }),

  // ---------------------------------------------------------------- kicks
  kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.1, fF: [0.12, -0.3], hF: [0.18, 0.04], hB: [0.06, 0.14] }, hit: { l: -0.22, b: [0.05, -0.02], fF: [0.68, -0.42], fB: [-0.08, 0], hF: [0.1, 0.12], hB: [-0.12, 0.16], face: 'fierce' } })), legs: true }),
  kick_high: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.18, fF: [0.02, -0.36], fB: [-0.05, 0] }, hit: { l: -0.44, b: [0.02, -0.02], fF: [0.58, -0.84], fB: [-0.06, 0], hF: [-0.16, 0.12], hB: [0.26, -0.06], face: 'fierce' }, follow: { l: -0.3, fF: [0.44, -0.6] } })), legs: true }),
  kick_low: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.2], l: 0.08, fF: [-0.1, -0.05], fB: [-0.12, 0] }, hit: { b: [0.05, 0.27], l: 0.2, fF: [0.74, -0.06], fB: [-0.22, 0], hF: [0.26, 0.34], hB: [0.0, 0.3], face: 'fierce' } })), legs: true }),
  kick_spin: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { sp: 0, fF: [0.05, -0.22], l: -0.06 }, hit: { sp: 1, fF: [0.7, -0.54], fB: [-0.06, 0], l: -0.32, hF: [-0.1, 0.15], hB: [0.22, -0.05], face: 'shout' }, hitEase: 'out', end: { ...GUARD, sp: 1 } })), legs: true }),
  knee: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { fF: [0.1, -0.1], l: 0.05, b: [0, 0.06] }, hit: { fF: [0.26, -0.42], l: 0.12, b: [0.08, -0.05], z: 0.06, hF: [0.32, 0.04], hB: [0.26, 0.1], face: 'shout' }, follow: { z: 0 } })), legs: true }),
  axe_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.75, load: { z: 0.55, l: -0.32, fF: [0.2, -0.95], fB: [-0.1, -0.12], hF: [-0.1, -0.1], hB: [0.2, -0.2] }, hit: { z: 0, b: [0.1, 0.08], l: 0.3, fF: [0.58, -0.06], fB: [-0.16, 0], hF: [-0.1, 0.2], hB: [0.1, 0.15], face: 'shout' } })), legs: true }),
  rise_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.18], l: 0.14, fF: [0.28, -0.04], hF: [0.1, 0.3] }, hit: { b: [0, -0.04], z: 0.18, l: -0.52, fF: [0.3, -1.02], fB: [-0.04, 0], hF: [-0.22, 0.1], hB: [0.12, 0.2], face: 'shout' }, follow: { z: 0.05 } })), legs: true }),
  mouton: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.7, load: { l: -0.32, z: 0.08, fF: [-0.05, -0.46], hF: [0.1, -0.1] }, hit: { l: -0.78, b: [0.26, 0], z: 0.16, fF: [0.88, -0.56], fB: [-0.12, -0.12], hF: [-0.36, 0.25], hB: [-0.32, 0.3], face: 'shout' }, follow: { z: 0.0, l: -0.4 } })), legs: true }),
  handstand: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.14], l: 0.3, hF: [0.3, 0.4], hB: [0.2, 0.4] }, hit: { r: Math.PI, b: [0, 0], l: 0, hF: [0.12, -0.72], hB: [-0.08, -0.72], hand: 'palm', handB: 'palm', fF: [0.58, -0.45], fB: [-0.58, -0.45] }, hold: { r: Math.PI, fF: [0.58, -0.4], fB: [-0.58, -0.5] }, holdT: c.hitDur || 0.4, holdK: 0.85 })), legs: true }),
  flying_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.14], l: 0.2, fF: [0.1, 0] }, hit: { z: 0.3, l: -0.34, fF: [0.78, -0.46], fB: [-0.06, -0.3], hF: [-0.2, 0.05], hB: [0.2, -0.1], face: 'shout' }, follow: { z: 0 } })), legs: true }),
  stomp: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { fF: [0.18, -0.55], l: -0.1, hF: [0.2, -0.1], hB: [-0.1, -0.1] }, hit: { fF: [0.26, 0], b: [0.04, 0.12], l: 0.2, face: 'shout' } })), legs: true }),
  // Okama Kenpo: ballet
  ballet_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...GUARD, hF: [0.3, -0.1], hB: [-0.24, -0.1], hand: 'palm', handB: 'palm' }, load: { b: [0, 0.1], hF: [0.14, 0.24], hB: [-0.08, 0.24] }, hit: { fF: [0.36, -1.0], fB: [-0.02, 0], l: -0.12, b: [0.02, -0.03], hF: [0.34, -0.24], hB: [-0.36, -0.22], face: 'fierce' } })), legs: true }),
  pirouette: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...GUARD, hand: 'palm', handB: 'palm' }, load: { b: [0, 0.1], hF: [0.14, 0.2], hB: [-0.1, 0.22] }, hit: { sp: 1, fF: [0.64, -0.55], fB: [0, 0], l: -0.18, hF: [0.14, -0.44], hB: [0.0, -0.46], face: 'fierce' }, hitEase: 'out', end: { ...GUARD, hand: 'palm', handB: 'palm', sp: 1 } })), legs: true }),
  jete: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...GUARD, hand: 'palm', handB: 'palm' }, load: { b: [0, 0.14], l: 0.1, hF: [0.1, 0.25] }, hit: { z: 0.36, fF: [0.58, -0.26], fB: [-0.56, -0.42], l: 0.12, hF: [0.44, -0.22], hB: [-0.38, -0.14], face: 'fierce' }, follow: { z: 0 } })), legs: true }),
  arabesque: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...GUARD, hand: 'palm', handB: 'palm' }, load: { b: [0, 0.1], hF: [0.1, 0.2] }, hit: { l: 0.5, b: [0.1, 0], fB: [-0.66, -0.62], fF: [0.04, 0], hF: [0.46, -0.1], hB: [-0.3, -0.14], face: 'fierce' } })), legs: true }),

  // ---------------------------------------------------------------- blades
  slash: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: c.two ? SWORD2 : SWORD, load: { l: -0.16, b: [-0.03, 0.04], hF: { a: -2.1, r: 0.34 }, wF: -2.55, hB: [-0.04, 0.18] }, hit: { l: 0.27, b: [0.13, 0.08], hF: { a: 0.55, r: 0.43 }, wF: 0.8, hB: [0.2, 0.16], fF: [0.3, 0], fB: [-0.17, 0], face: 'fierce' }, follow: { l: 0.3, hF: { a: 0.9, r: 0.42 }, wF: 1.15 } })) }),
  slash2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: c.two ? SWORD2 : SWORD, load: { l: 0.12, b: [0, 0.1], hF: { a: 2.0, r: 0.34 }, wF: 2.45 }, hit: { l: -0.14, b: [0.12, 0.02], hF: { a: -0.62, r: 0.43 }, wF: -0.95, face: 'fierce' }, follow: { hF: { a: -0.95, r: 0.42 }, wF: -1.35 } })) }),
  slash3: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: c.two ? SWORD2 : SWORD, loadAt: 0.7, load: { l: -0.22, b: [-0.04, 0.08], hF: { a: 2.7, r: 0.36 }, wF: 3.0, sp: 0 }, hit: { sp: 1, l: 0.22, b: [0.16, 0.06], hF: { a: 0.08, r: 0.43 }, wF: 0.06, fF: [0.3, 0], fB: [-0.2, 0], face: 'shout' }, hitEase: 'out', end: { ...(c.two ? SWORD2 : SWORD), sp: 1 } })) }),
  stab: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: c.two ? SWORD2 : SWORD, load: { l: -0.14, b: [-0.08, 0.06], hF: [-0.02, 0.08], wF: 0.0, hB: [-0.06, 0.1] }, hit: { l: 0.32, b: [0.22, 0.04], hF: [0.46, -0.03], wF: -0.03, hB: [-0.2, 0.16], fF: [0.36, 0], fB: [-0.22, -0.03], face: 'shout' } })) }),
  cleave: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.72, load: { l: -0.24, b: [-0.06, 0.0], hF: { a: -1.85, r: 0.36 }, hB: { a: -1.75, r: 0.33 }, wF: -2.25, face: 'fierce' }, hit: { l: 0.4, b: [0.22, 0.15], hF: { a: 0.78, r: 0.4 }, hB: { a: 0.88, r: 0.35 }, wF: 1.0, fF: [0.36, 0], fB: [-0.22, 0], face: 'shout' }, follow: { l: 0.44, b: [0.24, 0.17] } })), jitter: 0.01 }),
  iai: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...SWORD, hF: [0.04, 0.3], wF: 2.7, hB: [0.0, 0.3] }, load: { b: [0, 0.16], l: 0.34, hF: [0.02, 0.3], wF: 2.7, face: 'fierce' }, hit: { l: 0.5, b: [0.2, 0.08], hF: [0.46, 0.04], wF: 0.1, fB: [-0.36, -0.12], face: 'shout' }, follow: { l: 0.2, hF: [0.1, 0.28], wF: 2.6 } })) }),
  // two blades (Nitoryu): alternating cuts, then an X
  dual1: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: -0.16, hF: { a: -2.1, r: 0.34 }, wF: -2.55 }, hit: { l: 0.26, b: [0.12, 0.07], hF: { a: 0.55, r: 0.43 }, wF: 0.8, face: 'fierce' } })) }),
  dual2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: -0.14, hB: { a: -2.2, r: 0.33 }, wB: -2.6 }, hit: { l: 0.28, b: [0.13, 0.07], hB: { a: 0.6, r: 0.43 }, wB: 0.85, hF: [0.14, 0.14], face: 'fierce' } })) }),
  dual3: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: 0.12, b: [0, 0.1], hF: { a: 2.0, r: 0.34 }, wF: 2.45, hB: { a: 2.2, r: 0.32 }, wB: 2.6 }, hit: { l: -0.14, b: [0.12, 0.02], hF: { a: -0.62, r: 0.43 }, wF: -0.95, hB: { a: -0.4, r: 0.42 }, wB: -0.7, face: 'fierce' } })) }),
  dualx: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, loadAt: 0.7, load: { l: -0.2, b: [-0.04, 0.02], hF: { a: -2.3, r: 0.34 }, wF: -2.5, hB: { a: -1.6, r: 0.34 }, wB: -1.9, face: 'fierce' }, hit: { l: 0.32, b: [0.18, 0.1], hF: { a: 0.9, r: 0.42 }, wF: 1.1, hB: { a: 0.2, r: 0.43 }, wB: 0.5, face: 'shout' } })) }),
  tora: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, loadAt: 0.72, load: { z: 0.4, l: -0.32, hF: { a: -2.0, r: 0.36 }, hB: { a: -2.2, r: 0.34 }, wF: -2.6, wB: -2.8, fF: [0.12, -0.25], fB: [-0.14, -0.2], face: 'fierce' }, hit: { z: 0, l: 0.46, b: [0.24, 0.15], hF: { a: 0.9, r: 0.4 }, hB: { a: 1.1, r: 0.38 }, wF: 1.0, wB: 1.2, fF: [0.36, 0], fB: [-0.2, 0], face: 'shout' } })), jitter: 0.008 }),
  bladespin: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: c.two ? SWORD2 : SWORD, load: { l: -0.1, b: [0, 0.1], hF: { a: 2.6, r: 0.38 }, wF: 2.9 }, hit: { l: 0.1, hF: [0.42, -0.04], wF: 0.02, hB: [0.36, 0.04], wB: 0.2, face: 'shout' }, holdT: c.hitDur || 0.3, holdK: 0.8 })) }),
  // big weapons
  axe: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.7, load: { l: -0.3, b: [-0.05, 0.02], hF: { a: -2.4, r: 0.34 }, hB: { a: -2.3, r: 0.3 }, wF: -2.8, face: 'fierce' }, hit: { l: 0.36, b: [0.2, 0.12], hF: { a: 0.7, r: 0.42 }, hB: { a: 0.9, r: 0.36 }, wF: 1.0, fF: [0.34, 0], fB: [-0.2, 0], face: 'shout' }, follow: { l: 0.4 } })) }),
  axe2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.7, load: { l: 0.1, b: [0, 0.12], hF: { a: 2.2, r: 0.34 }, hB: { a: 2.3, r: 0.3 }, wF: 2.6 }, hit: { l: -0.2, b: [0.16, 0.02], hF: { a: -0.8, r: 0.42 }, hB: { a: -0.6, r: 0.36 }, wF: -1.1, face: 'shout' } })) }),
  staff: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...SWORD, wF: -1.2 }, load: { l: -0.14, hF: { a: -2.0, r: 0.34 }, wF: -2.4, hB: [0.0, 0.2] }, hit: { l: 0.24, b: [0.1, 0.05], hF: { a: 0.5, r: 0.43 }, wF: 0.6, face: 'fierce' } })) }),
  staff2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...SWORD, wF: -1.2 }, load: { l: 0.1, b: [0, 0.08], hF: { a: 1.9, r: 0.34 }, wF: 2.3 }, hit: { l: -0.12, b: [0.1, 0.02], hF: { a: -0.5, r: 0.43 }, wF: -0.8, face: 'fierce' } })) }),

  // ---------------------------------------------------------------- guns & throws
  shoot: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: GUN, loadAt: 0.55, load: { hF: [0.42, -0.04], wF: 0, hB: c.sling ? [0.02, -0.04] : [0.3, 0.05], l: 0.03 }, hit: { hF: [0.34, -0.13], wF: -0.4, hB: c.sling ? [0.34, -0.02] : [0.26, 0.04], l: -0.1, b: [-0.07, 0] }, follow: { hF: [0.4, -0.06], wF: -0.1, l: 0 } })) }),
  aim: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: GUN, loadAt: 0.3, load: { hF: [0.44, -0.06], wF: -0.02, hB: c.sling ? [-0.02, -0.06] : [0.32, -0.01], l: 0.05, b: [0, 0.06], face: 'fierce' }, hold: { hF: [0.3, -0.24], wF: -0.7, l: -0.16, b: [-0.14, 0.02] }, hit: { hF: [0.3, -0.24], wF: -0.7, hB: c.sling ? [0.36, -0.04] : [0.24, 0.02], l: -0.16, b: [-0.14, 0.02] } })) }),
  flick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { hF: [0.02, 0.2], l: -0.06 }, hit: { hF: [0.46, -0.1], l: 0.16, b: [0.06, 0.02], hand: 'palm', face: 'fierce' } })) }),
  throw: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { hF: { a: -2.4, r: 0.4 }, l: -0.16, b: [-0.04, 0.04] }, hit: { hF: { a: 0.15, r: 0.43 }, l: 0.26, b: [0.1, 0.04], hand: 'palm', face: 'fierce' } })) }),

  // ---------------------------------------------------------------- casting
  push: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.7, load: { b: [-0.04, 0.1], l: -0.14, hF: [-0.12, 0.18], hB: [-0.16, 0.2], hand: 'palm', handB: 'palm', fF: [0.2, 0], fB: [-0.16, 0], face: 'fierce' }, hit: { b: [0.1, 0.04], l: 0.22, hF: [0.47, -0.06], hB: [0.43, 0.03], hand: 'palm', handB: 'palm', fF: [0.28, 0], fB: [-0.18, 0], face: 'shout' } })), jitter: 0.006 }),
  point: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { hF: [0.1, 0.1], l: -0.06, face: 'fierce' }, hit: { hF: [0.48, -0.12], hand: 'finger', l: 0.1, hB: [-0.05, 0.3], fF: [0.18, 0], fB: [-0.12, 0] } })) }),
  raise: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.75, load: { hF: [0.1, -0.5], hand: 'palm', l: -0.14, b: [0, 0.02], hB: [-0.06, 0.3], face: 'fierce' }, hit: { hF: [0.46, -0.02], hand: 'palm', l: 0.14, b: [0.04, 0.04], face: 'shout' } })), jitter: 0.004 }),
  powerup: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.8, load: { b: [0, 0.16], l: 0.26, hF: [0.02, 0.27], hB: [-0.06, 0.29], fF: [0.2, 0], fB: [-0.2, 0], face: 'fierce' }, hit: { b: [0, -0.03], l: -0.18, hF: [0.3, -0.34], hB: [-0.28, -0.34], hand: 'palm', handB: 'palm', fF: [0.22, 0], fB: [-0.22, 0], face: 'shout' }, holdT: 0.14 })), jitter: 0.012 }),
  spread: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.72, load: { b: [0, 0.13], hF: [0.1, 0.26], hB: [0.0, 0.26], l: 0.22, face: 'fierce' }, hit: { b: [0, -0.02], hF: [0.4, -0.14], hB: [-0.38, -0.14], hand: 'palm', handB: 'palm', l: -0.1, fF: [0.2, 0], fB: [-0.2, 0], face: 'shout' }, holdT: c.hitDur ? Math.min(0.5, c.hitDur) : 0.12 })), jitter: 0.008 }),
  slam: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.72, load: { z: 0.3, hF: [0.14, -0.46], hB: [0.06, -0.46], l: -0.22, fF: [0.1, -0.2], fB: [-0.1, -0.2], face: 'fierce' }, hit: { z: 0, b: [0.1, 0.26], l: 0.48, hF: [0.36, 0.5], hB: [0.3, 0.52], fF: [0.26, 0], fB: [-0.2, 0], face: 'shout' } })), legs: true, jitter: 0.008 }),
  quake: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.72, load: { b: [-0.06, 0.08], l: -0.26, hF: [-0.24, -0.04], hB: [0.2, 0.05], face: 'fierce' }, hit: { b: [0.2, 0.05], l: 0.36, hF: [0.5, -0.05], hB: [-0.1, 0.2], fF: [0.32, 0], fB: [-0.18, 0], face: 'shout' } })), jitter: 0.014 }),
  pray: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { hF: [0.16, 0.04], hB: [0.14, 0.05], hand: 'palm', handB: 'palm', b: [0, 0.03], ht: 0.12 }, hit: { hF: [0.2, -0.3], hB: [-0.18, -0.3], hand: 'palm', handB: 'palm', b: [0, -0.02], ht: -0.1 } })) }),
  blink: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.16], l: 0.32, hF: [-0.1, 0.2], hB: [-0.14, 0.22] }, hit: { l: 0.5, b: [0.2, 0.06], hF: [-0.2, 0.2], hB: [-0.24, 0.22], fB: [-0.3, -0.1] } })), legs: true }),
  will: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.8, load: { b: [0, 0.1], hF: [0.0, 0.32], hB: [-0.04, 0.32], l: 0.1, ht: 0.15, face: 'fierce' }, hit: { b: [0, -0.04], l: -0.12, ht: -0.12, hF: [0.14, 0.36], hB: [-0.1, 0.36], face: 'shout' }, holdT: 0.2 })), jitter: 0.01 }),
  guardup: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: GUARD, load: { b: [0, 0.07], hF: [0.14, -0.1], hB: [0.2, -0.02], eB: -1 }, hit: { b: [0, 0.06], hF: [0.16, -0.12], hB: [0.2, -0.02], eB: -1, face: 'fierce' }, holdT: 0.3 })) }),
  flex: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { b: [0, 0.1], hF: [0.18, -0.2], hB: [-0.18, -0.2], eF: 1, eB: 1, face: 'fierce' }, hit: { b: [0, 0.12], hF: [0.2, -0.24], hB: [-0.2, -0.24], face: 'shout' }, holdT: 0.2 })), jitter: 0.012 }),
  breath: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.75, load: { l: -0.34, ht: -0.22, b: [-0.04, 0.02], hF: [-0.1, 0.18], hB: [-0.16, 0.2], face: 'fierce' }, hit: { l: 0.36, ht: 0.12, b: [0.08, 0.06], face: 'shout', hF: [-0.12, 0.24], hB: [-0.18, 0.26] }, holdT: c.hitDur ? Math.min(0.5, c.hitDur) : 0.18 })), jitter: 0.01 }),
  pull: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { hF: [0.48, -0.06], hand: 'claw', l: 0.16, b: [0.06, 0.04] }, hit: { hF: [0.08, 0.04], hand: 'fist', l: -0.22, b: [-0.08, 0.06], face: 'shout' } })) }),
  // ---------------------------------------------------------------- rubber
  pistol: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.22, b: [-0.06, 0.05], hF: [-0.56, -0.02], stretch: true, face: 'fierce' }, hit: { l: 0.26, b: [0.12, 0.02], hF: [0.47, -0.05], stretch: true, face: 'shout' }, holdT: 0.12 })) }),
  bazooka: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.74, load: { b: [-0.06, 0.07], l: -0.3, hF: [-0.66, 0.0], hB: [-0.7, 0.08], hand: 'palm', handB: 'palm', stretch: true, face: 'fierce' }, hit: { b: [0.22, 0.04], l: 0.32, hF: [0.52, -0.04], hB: [0.5, 0.07], hand: 'palm', handB: 'palm', stretch: true, face: 'shout' }, holdT: 0.1 })) }),
  gatling: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.12, hF: [-0.14, 0.04], hB: [-0.16, 0.08], face: 'fierce' }, hit: { l: 0.2, b: [0.08, 0.04], hF: [0.4, -0.02], hB: [0.36, 0.05], face: 'shout' }, holdT: c.hitDur || 0.6, holdK: 0.85 })) }),
  kneel: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.5, load: { b: [0, 0.26], l: 0.46, hF: [0.24, 0.52], hB: [-0.1, 0.3], fF: [0.3, 0], fB: [-0.26, -0.02], face: 'fierce' }, hit: { b: [0, 0.24], l: 0.4, hF: [0.24, 0.5], hB: [-0.12, 0.3], fF: [0.3, 0], fB: [-0.26, -0.02], face: 'fierce' }, holdT: 0.12 })), legs: true }),
  rocket: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.12], l: -0.26, hF: [-0.54, 0.08], hB: [-0.56, 0.12], stretch: true }, hit: { l: 0.62, z: 0.16, hF: [0.46, 0.0], hB: [0.44, 0.06], fF: [-0.3, -0.3], fB: [-0.42, -0.36], face: 'shout' } })), legs: true }),
  fly: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { b: [0, 0.12], l: 0.2 }, hit: { z: 0.5, l: 0.55, hF: [-0.3, 0.1], hB: [-0.34, 0.12], fF: [-0.25, -0.3], fB: [-0.35, -0.2] } })), legs: true }),
};

/** Resolve an animation for an action. Unknown names fall back to a sensible base clip. */
export function buildClip(name, w, T, c = {}) {
  const f = CLIPS[name] || CLIPS[ALIAS[name]] || CLIPS.jab;
  const clip = f(Math.max(0, w), Math.max(T, w + 0.08), c);
  clip.name = name;
  if (c.flurry) clip.flurry = c.flurry;
  if (c.spin) clip.spin = c.spin;
  return clip;
}
const ALIAS = { punch: 'jab', heavy: 'haymaker', cast: 'push', block: 'guardup', slashing: 'slash', grab: 'grab' };
export const hasClip = (name) => !!CLIPS[name];

/** Sample a clip at time t. `pose` carries movement info (walk cycle while attacking). */
export function samplePose(A, t, pose) {
  const keys = A.keys;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i], k1 = keys[i + 1] || k0;
  const span = k1.t - k0.t;
  let k = span > 0 ? (t - k0.t) / span : 1;
  k = k < 0 ? 0 : k > 1 ? 1 : k;
  k = (EASE[k1.e] || EASE.inout)(k);
  const A0 = k0.P, A1 = k1.P;
  const P = {};
  for (const key in A0) P[key] = lerpVal(A0[key], A1[key], k);
  // charge tremble during long wind-ups
  if (A.jitter && t < (A.w ?? keys[2]?.t ?? 0)) {
    const amp = A.jitter * Math.min(1, t / 0.2);
    P.b = [P.b[0] + Math.sin(t * 91) * amp, P.b[1] + Math.cos(t * 77) * amp];
  }
  // flurries: alternate the fists (or feet) rapidly
  const f = A.flurry;
  if (f && t >= f.t0 && t <= f.t1) {
    const ph = (t - f.t0) * (f.rate || 11);
    const tri = Math.abs((ph % 2) - 1); // 1 → 0 → 1
    if (f.legs) {
      P.fF = [0.12 + 0.52 * tri, -0.3 - 0.2 * tri];
      P.fB = [-0.05, 0];
    } else {
      P.hF = [0.12 + 0.34 * tri, -0.04 + 0.06 * (1 - tri)];
      P.hB = [0.12 + 0.34 * (1 - tri), 0.02 + 0.05 * tri];
    }
  }
  // spins: whole-body turns through all facings
  const s = A.spin;
  if (s && t >= s.t0 && t <= s.t1) P.sp = (P.sp || 0) + ((t - s.t0) / Math.max(0.05, s.t1 - s.t0)) * s.turns;
  // keep walking while swinging (unless the clip drives the legs)
  if (pose && pose.moving && !A.legs) walkLegs(P, pose);
  return P;
}

function walkLegs(P, pose) {
  const w = pose.walk || 0;
  const s = Math.sin(w), c = Math.cos(w);
  const stride = 0.15;
  P.fF = [0.04 + s * stride, -Math.max(0, c) * 0.08];
  P.fB = [-0.04 - s * stride, -Math.max(0, -c) * 0.08];
}

/** Pose when no action is running: idle, fighting stance, walk, sprint, swim, hurt, block, dodge. */
export function restPose(pose) {
  const t = pose.time || 0;
  const base = pose.block !== undefined ? GUARD : pose.combat ? GUARD : STAND;
  const P = { ...base };
  P.b = [base.b[0], base.b[1] + Math.sin(t * 2.2) * 0.012];
  if (pose.combat && !pose.moving) {
    // light boxer's bounce
    const bounce = Math.abs(Math.sin(t * 4.2));
    P.b = [0, 0.03 + bounce * 0.025];
    P.hF = [0.21, 0.02 + bounce * 0.015];
  }
  if (pose.moving) {
    const w = pose.walk || 0;
    const s = Math.sin(w), c = Math.cos(w);
    const sprint = !!pose.sprint;
    const stride = sprint ? 0.26 : 0.15;
    P.fF = [0.03 + s * stride, -Math.max(0, c) * (sprint ? 0.16 : 0.08)];
    P.fB = [-0.03 - s * stride, -Math.max(0, -c) * (sprint ? 0.16 : 0.08)];
    P.b = [0, 0.02 - Math.abs(c) * 0.035];
    if (sprint) {
      P.l = 0.3;
      P.hF = [-s * 0.24 + 0.06, 0.18 + Math.max(0, s) * 0.05];
      P.hB = [s * 0.24 + 0.02, 0.18 + Math.max(0, -s) * 0.05];
      P.eF = 1; P.eB = 1;
    } else if (!pose.combat) {
      P.hF = [-s * 0.14 + 0.03, 0.38];
      P.hB = [s * 0.14 - 0.02, 0.38];
    }
  }
  if (pose.swimming) {
    const s = Math.sin(t * 5);
    P.hF = [0.3 + s * 0.12, -0.05 + Math.cos(t * 5) * 0.1];
    P.hB = [0.28 - s * 0.12, -0.02 - Math.cos(t * 5) * 0.1];
  }
  if (pose.block !== undefined) {
    // cross-arm guard in front of the face
    const fresh = Math.max(0, 1 - pose.block / 0.2);
    P.hF = [0.2, -0.13]; P.hB = [0.23, -0.03]; P.eF = 1; P.eB = -0.8;
    P.b = [-0.02 * fresh, 0.07]; P.l = 0.12;
    P.fF = [0.2, 0]; P.fB = [-0.18, 0];
    P.face = 'fierce';
  }
  if (pose.state === 'hurt') {
    const k = pose.hurtK ?? 1;
    P.l = -0.38 * k; P.b = [-0.06 * k, 0.05];
    P.hF = [-0.18, 0.1]; P.hB = [0.18, 0.02]; P.eF = 0.3; P.eB = 0.3;
    P.ht = -0.2;
  }
  if (pose.dodge !== undefined) {
    // tucked forward roll
    const k = pose.dodge;
    P.r = k * TAU;
    P.b = [0, 0.22 * Math.sin(k * Math.PI)];
    P.hF = [0.2, 0.18]; P.hB = [0.16, 0.2];
    P.fF = [0.18, -0.26 * Math.sin(k * Math.PI)]; P.fB = [0.06, -0.3 * Math.sin(k * Math.PI)];
    P.l = 0.4 * Math.sin(k * Math.PI);
  }
  if (pose.getUp !== undefined) {
    const k = pose.getUp; // 0 → 1
    P.b = [0, 0.25 * (1 - k)]; P.l = 0.5 * (1 - k);
    P.hF = [0.2, 0.4 * (1 - k) + 0.1]; P.hB = [0.1, 0.4];
  }
  if (pose.launch) {
    P.r = -pose.launch * 0.9;
    P.hF = [-0.1, -0.3]; P.hB = [0.14, -0.26]; P.fF = [0.3, -0.25]; P.fB = [0.12, -0.12];
    P.ht = -0.3;
  }
  return P;
}
