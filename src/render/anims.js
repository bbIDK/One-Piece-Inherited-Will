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
const STAFF = { ...SWORD, wF: -1.2 };
// Black Leg: hands in the pockets, weight on the back foot
const POCKETS = { ...STAND, b: [0, 0.03], l: -0.05, hF: [-0.02, 0.33], hB: [-0.08, 0.32], eF: -1, eB: -1, fF: [0.17, 0], fB: [-0.13, 0] };
// Okama Kenpo: a ballet fifth position, arms spread
const BALLET = { ...GUARD, b: [0, 0.02], l: 0.02, hF: [0.3, -0.12], hB: [-0.26, -0.1], hand: 'palm', handB: 'palm', fF: [0.08, 0], fB: [-0.1, 0] };
const CLAWS = { ...GUARD, hand: 'claw', handB: 'claw', b: [0, 0.06], l: 0.14, hF: [0.25, -0.04], hB: [0.13, 0.04] };
// Rokushiki: upright, one finger cocked
const FINGER = { ...GUARD, b: [0, 0.02], l: 0.03, hF: [0.2, 0.04], hB: [-0.05, 0.3], hand: 'finger', fF: [0.14, 0], fB: [-0.11, 0] };

/** Combat stances by name (a style's resting fighting pose). */
export const STANCES = { guard: GUARD, palms: PALMS, sword: SWORD, sword2: SWORD2, gun: GUN, heavyw: HEAVYW, staff: STAFF, legs: POCKETS, ballet: BALLET, claw: CLAWS, finger: FINGER, stand: STAND };
/** Stances that hold the weapon out (the weapon is drawn, not sheathed). */
export const STANCE_ARMED = { sword: 'sword', sword2: 'sword', gun: 'gun', heavyw: 'axe', staff: 'staff' };
const STYLE_STANCE = {
  brawler: 'guard', ittoryu: 'sword', nitoryu: 'sword2', santoryu: 'sword2', black_leg: 'legs', fishman_karate: 'palms', rokushiki: 'finger',
  okama_kenpo: 'ballet', electro: 'claw', hasshoken: 'guard', weather_science: 'staff', elbaf: 'heavyw', ryusoken: 'claw', sniper: 'gun',
};
/** A style's fighting stance, falling back to fists when its weapon is missing. */
export function stanceFor(style, weapon) {
  let s = STYLE_STANCE[style] || 'guard';
  const need = STANCE_ARMED[s];
  if (need && (!weapon || weapon.kind !== need)) s = 'guard';
  if (s === 'sword2' && (weapon.count || 1) < 2) s = 'sword';
  return s;
}
/** 'sling' for slingshots (Usopp's Kabuto…), else a firearm. */
export function gunKind(weapon) {
  if (!weapon || weapon.kind !== 'gun') return undefined;
  const ids = weapon.ids || [];
  return ids.some((id) => /sling|kabuto/.test(id)) ? 'sling' : weapon.gun;
}

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
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return k < 0.5 ? a : b;
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
//   (dash window, flurry window, weapon count, the style's stance...)
const S = (c, o) => ({ ...o, stance: o.stance || c.stance, holdT: c.dashT ? Math.max(o.holdT ?? 0.055, c.dashT) : o.holdT, holdK: c.dashT ? 0.9 : o.holdK });
const sw = (c) => (c.two ? SWORD2 : SWORD);
const spun = (c, base) => ({ ...(c.stance || base || GUARD), sp: 1 });

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
  claw_x: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.7, load: { l: -0.2, b: [-0.04, 0.04], hF: [0.0, -0.4], hB: [-0.06, -0.36], hand: 'claw', handB: 'claw', face: 'fierce' }, hit: { l: 0.36, b: [0.18, 0.08], hF: [0.36, 0.28], hB: [0.3, 0.32], hand: 'claw', handB: 'claw', fF: [0.3, 0], fB: [-0.18, 0], face: 'shout' } })), jitter: 0.008 }),
  grab: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.06], l: -0.08, hF: [0.1, 0.02], hand: 'claw' }, hit: { b: [0.12, 0.03], l: 0.26, hF: [0.5, -0.05], hand: 'claw', face: 'fierce' }, follow: { hand: 'fist', hF: [0.4, -0.02], l: 0.18 } })) }),
  grab2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.02, 0.06], l: -0.1, hB: [0.02, 0.06], handB: 'claw' }, hit: { b: [0.13, 0.03], l: 0.3, hB: [0.5, -0.04], handB: 'claw', hF: [0.08, 0.14], face: 'fierce' }, follow: { handB: 'fist', hB: [0.4, 0.0] } })) }),
  chop: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.14, b: [-0.02, 0.04], hF: { a: -2.1, r: 0.36 }, hand: 'palm' }, hit: { l: 0.26, b: [0.12, 0.06], hF: { a: 0.55, r: 0.43 }, hand: 'palm', face: 'fierce' } })) }),
  chop2: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: 0.12, b: [0, 0.08], hF: { a: 2.0, r: 0.34 }, hand: 'palm' }, hit: { l: -0.14, b: [0.12, 0.02], hF: { a: -0.62, r: 0.43 }, hand: 'palm', face: 'fierce' } })) }),
  thrust: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.05, 0.09], l: -0.06, hF: [0.08, 0.06] }, hit: { b: [0.14, 0.04], l: 0.46, hF: [0.44, 0.0], hB: [-0.22, 0.16], fF: [0.26, 0], fB: [-0.32, -0.08], face: 'shout' } })) }),
  charge: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [-0.06, 0.12], l: 0.1, hF: [0.1, 0.18], hB: [-0.1, 0.2] }, hit: { b: [0.12, 0.08], l: 0.58, hF: [0.18, 0.2], hB: [-0.2, 0.2], fF: [0.26, 0], fB: [-0.38, -0.1], face: 'shout' } })), legs: true }),
  headbutt: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.4, b: [-0.06, 0.02], hF: [0.1, 0.25], hB: [0.02, 0.28] }, hit: { l: 0.52, b: [0.18, 0.06], ht: 0.3, face: 'shout' } })) }),

  // ---------------------------------------------------------------- kicks
  kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.1, fF: [0.12, -0.3], hF: [0.18, 0.04], hB: [0.06, 0.14] }, hit: { l: -0.22, b: [0.05, -0.02], fF: [0.68, -0.42], fB: [-0.08, 0], hF: [0.1, 0.12], hB: [-0.12, 0.16], face: 'fierce' } })), legs: true }),
  kick_high: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { l: -0.18, fF: [0.02, -0.36], fB: [-0.05, 0] }, hit: { l: -0.44, b: [0.02, -0.02], fF: [0.58, -0.84], fB: [-0.06, 0], hF: [-0.16, 0.12], hB: [0.26, -0.06], face: 'fierce' }, follow: { l: -0.3, fF: [0.44, -0.6] } })), legs: true }),
  kick_low: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.2], l: 0.08, fF: [-0.1, -0.05], fB: [-0.12, 0] }, hit: { b: [0.05, 0.27], l: 0.2, fF: [0.74, -0.06], fB: [-0.22, 0], hF: [0.26, 0.34], hB: [0.0, 0.3], face: 'fierce' } })), legs: true }),
  kick_spin: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { sp: 0, fF: [0.05, -0.22], l: -0.06 }, hit: { sp: 1, fF: [0.7, -0.54], fB: [-0.06, 0], l: -0.32, hF: [-0.1, 0.15], hB: [0.22, -0.05], face: 'shout' }, hitEase: 'out', end: spun(c) })), legs: true }),
  sweep: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.22], l: 0.22, fF: [0.06, -0.04], hF: [0.22, 0.3], hB: [-0.04, 0.3] }, hit: { sp: 1, b: [0.02, 0.3], l: 0.3, fF: [0.8, -0.05], fB: [-0.2, 0], hF: [0.26, 0.42], hB: [-0.1, 0.36], face: 'fierce' }, hitEase: 'out', end: spun(c) })), legs: true }),
  knee: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { fF: [0.1, -0.1], l: 0.05, b: [0, 0.06] }, hit: { fF: [0.26, -0.42], l: 0.12, b: [0.08, -0.05], z: 0.06, hF: [0.32, 0.04], hB: [0.26, 0.1], face: 'shout' }, follow: { z: 0 } })), legs: true }),
  axe_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.75, load: { z: 0.55, l: -0.32, fF: [0.2, -0.95], fB: [-0.1, -0.12], hF: [-0.1, -0.1], hB: [0.2, -0.2] }, hit: { z: 0, b: [0.1, 0.08], l: 0.3, fF: [0.58, -0.06], fB: [-0.16, 0], hF: [-0.1, 0.2], hB: [0.1, 0.15], face: 'shout' } })), legs: true }),
  rise_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.18], l: 0.14, fF: [0.28, -0.04], hF: [0.1, 0.3] }, hit: { b: [0, -0.04], z: 0.18, l: -0.52, fF: [0.3, -1.02], fB: [-0.04, 0], hF: [-0.22, 0.1], hB: [0.12, 0.2], face: 'shout' }, follow: { z: 0.05 } })), legs: true }),
  mouton: (w, T, c) => ({ keys: strike(w, T, S(c, { loadAt: 0.7, load: { l: -0.32, z: 0.08, fF: [-0.05, -0.46], hF: [0.1, -0.1] }, hit: { l: -0.78, b: [0.26, 0], z: 0.16, fF: [0.88, -0.56], fB: [-0.12, -0.12], hF: [-0.36, 0.25], hB: [-0.32, 0.3], face: 'shout' }, follow: { z: 0.0, l: -0.4 } })), legs: true }),
  handstand: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.14], l: 0.3, hF: [0.3, 0.4], hB: [0.2, 0.4] }, hit: { r: Math.PI, b: [0, 0], l: 0, hF: [0.12, -0.72], hB: [-0.08, -0.72], hand: 'palm', handB: 'palm', fF: [0.58, -0.45], fB: [-0.58, -0.45] }, hold: { r: Math.PI, fF: [0.58, -0.4], fB: [-0.58, -0.5] }, holdT: c.hitDur || 0.4, holdK: 0.85 })), legs: true }),
  flying_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { b: [0, 0.14], l: 0.2, fF: [0.1, 0] }, hit: { z: 0.3, l: -0.34, fF: [0.78, -0.46], fB: [-0.06, -0.3], hF: [-0.2, 0.05], hB: [0.2, -0.1], face: 'shout' }, follow: { z: 0 } })), legs: true }),
  stomp: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { fF: [0.18, -0.55], l: -0.1, hF: [0.2, -0.1], hB: [-0.1, -0.1] }, hit: { fF: [0.26, 0], b: [0.04, 0.12], l: 0.2, face: 'shout' } })), legs: true }),
  // Okama Kenpo: ballet
  ballet_kick: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: BALLET, load: { b: [0, 0.1], hF: [0.14, 0.24], hB: [-0.08, 0.24] }, hit: { fF: [0.36, -1.0], fB: [-0.02, 0], l: -0.12, b: [0.02, -0.03], hF: [0.34, -0.24], hB: [-0.36, -0.22], face: 'fierce' } })), legs: true }),
  pirouette: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: BALLET, load: { b: [0, 0.1], hF: [0.14, 0.2], hB: [-0.1, 0.22] }, hit: { sp: 1, fF: [0.64, -0.55], fB: [0, 0], l: -0.18, hF: [0.14, -0.44], hB: [0.0, -0.46], face: 'fierce' }, hitEase: 'out', end: { ...BALLET, sp: 1 } })), legs: true }),
  jete: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: BALLET, load: { b: [0, 0.14], l: 0.1, hF: [0.1, 0.25] }, hit: { z: 0.36, fF: [0.58, -0.26], fB: [-0.56, -0.42], l: 0.12, hF: [0.44, -0.22], hB: [-0.38, -0.14], face: 'fierce' }, follow: { z: 0 } })), legs: true }),
  arabesque: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: BALLET, load: { b: [0, 0.1], hF: [0.1, 0.2] }, hit: { l: 0.5, b: [0.1, 0], fB: [-0.66, -0.62], fF: [0.04, 0], hF: [0.46, -0.1], hB: [-0.3, -0.14], face: 'fierce' } })), legs: true }),

  // ---------------------------------------------------------------- blades
  slash: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), load: { l: -0.16, b: [-0.03, 0.04], hF: { a: -2.1, r: 0.34 }, wF: -2.55, hB: [-0.04, 0.18] }, hit: { l: 0.27, b: [0.13, 0.08], hF: { a: 0.55, r: 0.43 }, wF: 0.8, hB: [0.2, 0.16], fF: [0.3, 0], fB: [-0.17, 0], face: 'fierce' }, follow: { l: 0.3, hF: { a: 0.9, r: 0.42 }, wF: 1.15 } })) }),
  slash2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), load: { l: 0.12, b: [0, 0.1], hF: { a: 2.0, r: 0.34 }, wF: 2.45 }, hit: { l: -0.14, b: [0.12, 0.02], hF: { a: -0.62, r: 0.43 }, wF: -0.95, face: 'fierce' }, follow: { hF: { a: -0.95, r: 0.42 }, wF: -1.35 } })) }),
  rise_slash: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), loadAt: 0.62, load: { b: [-0.02, 0.15], l: 0.26, hF: { a: 1.85, r: 0.36 }, wF: 2.5, hB: [0.0, 0.22], face: 'fierce' }, hit: { b: [0.12, -0.03], z: 0.04, l: -0.22, hF: { a: -1.2, r: 0.43 }, wF: -1.5, hB: [-0.1, 0.12], fF: [0.26, 0], fB: [-0.16, -0.04], face: 'shout' }, follow: { z: 0, hF: { a: -1.45, r: 0.42 }, wF: -1.8, l: -0.26 } })) }),
  slash3: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), loadAt: 0.7, load: { l: -0.22, b: [-0.04, 0.08], hF: { a: 2.7, r: 0.36 }, wF: 3.0, sp: 0 }, hit: { sp: 1, l: 0.22, b: [0.16, 0.06], hF: { a: 0.08, r: 0.43 }, wF: 0.06, fF: [0.3, 0], fB: [-0.2, 0], face: 'shout' }, hitEase: 'out', end: { ...sw(c), sp: 1 } })) }),
  stab: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), load: { l: -0.14, b: [-0.08, 0.06], hF: [-0.02, 0.08], wF: 0.0, hB: [-0.06, 0.1] }, hit: { l: 0.32, b: [0.22, 0.04], hF: [0.46, -0.03], wF: -0.03, hB: [-0.2, 0.16], fF: [0.36, 0], fB: [-0.22, -0.03], face: 'shout' } })) }),
  cleave: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.72, load: { l: -0.24, b: [-0.06, 0.0], hF: { a: -1.85, r: 0.36 }, hB: { a: -1.75, r: 0.33 }, wF: -2.25, face: 'fierce' }, hit: { l: 0.4, b: [0.22, 0.15], hF: { a: 0.78, r: 0.4 }, hB: { a: 0.88, r: 0.35 }, wF: 1.0, fF: [0.36, 0], fB: [-0.22, 0], face: 'shout' }, follow: { l: 0.44, b: [0.24, 0.17] } })), jitter: 0.01 }),
  iai: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: { ...SWORD, hF: [0.04, 0.3], wF: 2.7, hB: [0.0, 0.3] }, load: { b: [0, 0.16], l: 0.34, hF: [0.02, 0.3], wF: 2.7, face: 'fierce' }, hit: { l: 0.5, b: [0.2, 0.08], hF: [0.46, 0.04], wF: 0.1, fB: [-0.36, -0.12], face: 'shout' }, follow: { l: 0.2, hF: [0.1, 0.28], wF: 2.6 } })) }),
  // two blades (Nitoryu): alternating cuts, then an X
  dual1: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: -0.16, hF: { a: -2.1, r: 0.34 }, wF: -2.55 }, hit: { l: 0.26, b: [0.12, 0.07], hF: { a: 0.55, r: 0.43 }, wF: 0.8, face: 'fierce' } })) }),
  dual2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: -0.14, hB: { a: -2.2, r: 0.33 }, wB: -2.6 }, hit: { l: 0.28, b: [0.13, 0.07], hB: { a: 0.6, r: 0.43 }, wB: 0.85, hF: [0.14, 0.14], face: 'fierce' } })) }),
  dual3: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: 0.12, b: [0, 0.1], hF: { a: 2.0, r: 0.34 }, wF: 2.45, hB: { a: 2.2, r: 0.32 }, wB: 2.6 }, hit: { l: -0.14, b: [0.12, 0.02], hF: { a: -0.62, r: 0.43 }, wF: -0.95, hB: { a: -0.4, r: 0.42 }, wB: -0.7, face: 'fierce' } })) }),
  dualx: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, loadAt: 0.7, load: { l: -0.2, b: [-0.04, 0.02], hF: { a: -2.3, r: 0.34 }, wF: -2.5, hB: { a: -1.6, r: 0.34 }, wB: -1.9, face: 'fierce' }, hit: { l: 0.32, b: [0.18, 0.1], hF: { a: 0.9, r: 0.42 }, wF: 1.1, hB: { a: 0.2, r: 0.43 }, wB: 0.5, face: 'shout' } })) }),
  dual_stab: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, load: { l: -0.16, b: [-0.1, 0.07], hF: [-0.04, 0.06], hB: [-0.1, 0.1], wF: 0.05, wB: 0.1, face: 'fierce' }, hit: { l: 0.36, b: [0.24, 0.05], hF: [0.46, -0.05], hB: [0.4, 0.04], wF: -0.06, wB: 0.04, fF: [0.38, 0], fB: [-0.24, -0.04], face: 'shout' } })) }),
  tora: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: SWORD2, loadAt: 0.72, load: { z: 0.4, l: -0.32, hF: { a: -2.0, r: 0.36 }, hB: { a: -2.2, r: 0.34 }, wF: -2.6, wB: -2.8, fF: [0.12, -0.25], fB: [-0.14, -0.2], face: 'fierce' }, hit: { z: 0, l: 0.46, b: [0.24, 0.15], hF: { a: 0.9, r: 0.4 }, hB: { a: 1.1, r: 0.38 }, wF: 1.0, wB: 1.2, fF: [0.36, 0], fB: [-0.2, 0], face: 'shout' } })), jitter: 0.008 }),
  bladespin: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: sw(c), load: { l: -0.1, b: [0, 0.1], hF: { a: 2.6, r: 0.38 }, wF: 2.9 }, hit: { l: 0.1, hF: [0.42, -0.04], wF: 0.02, hB: [0.36, 0.04], wB: 0.2, face: 'shout' }, holdT: c.hitDur || 0.3, holdK: 0.8 })) }),
  // big weapons
  axe: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.7, load: { l: -0.3, b: [-0.05, 0.02], hF: { a: -2.4, r: 0.34 }, hB: { a: -2.3, r: 0.3 }, wF: -2.8, face: 'fierce' }, hit: { l: 0.36, b: [0.2, 0.12], hF: { a: 0.7, r: 0.42 }, hB: { a: 0.9, r: 0.36 }, wF: 1.0, fF: [0.34, 0], fB: [-0.2, 0], face: 'shout' }, follow: { l: 0.4 } })) }),
  axe2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.7, load: { l: 0.1, b: [0, 0.12], hF: { a: 2.2, r: 0.34 }, hB: { a: 2.3, r: 0.3 }, wF: 2.6 }, hit: { l: -0.2, b: [0.16, 0.02], hF: { a: -0.8, r: 0.42 }, hB: { a: -0.6, r: 0.36 }, wF: -1.1, face: 'shout' } })) }),
  axe_slam: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: HEAVYW, loadAt: 0.74, load: { z: 0.18, l: -0.4, b: [-0.06, -0.02], hF: { a: -1.9, r: 0.4 }, hB: { a: -1.8, r: 0.36 }, wF: -1.75, fF: [0.12, -0.1], face: 'fierce' }, hit: { z: 0, l: 0.52, b: [0.24, 0.24], hF: { a: 1.05, r: 0.42 }, hB: { a: 1.15, r: 0.36 }, wF: 1.35, fF: [0.38, 0], fB: [-0.24, 0], face: 'shout' }, follow: { l: 0.5, b: [0.24, 0.24] } })), jitter: 0.012 }),
  staff: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAFF, load: { l: -0.14, hF: { a: -2.0, r: 0.34 }, wF: -2.4, hB: [0.0, 0.2] }, hit: { l: 0.24, b: [0.1, 0.05], hF: { a: 0.5, r: 0.43 }, wF: 0.6, face: 'fierce' } })) }),
  staff2: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAFF, load: { l: 0.1, b: [0, 0.08], hF: { a: 1.9, r: 0.34 }, wF: 2.3 }, hit: { l: -0.12, b: [0.1, 0.02], hF: { a: -0.5, r: 0.43 }, wF: -0.8, face: 'fierce' } })) }),
  staff_jab: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAFF, load: { l: -0.12, b: [-0.07, 0.06], hF: [0.0, 0.06], wF: 0.02 }, hit: { l: 0.3, b: [0.2, 0.04], hF: [0.46, -0.02], wF: -0.02, fF: [0.34, 0], fB: [-0.22, -0.02], face: 'shout' } })) }),

  // ---------------------------------------------------------------- guns & throws
  shoot: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: GUN, loadAt: 0.55, load: { hF: [0.42, -0.04], wF: 0, hB: c.sling ? [0.02, -0.04] : [0.3, 0.05], l: 0.03 }, hit: { hF: [0.34, -0.13], wF: -0.4, hB: c.sling ? [0.34, -0.02] : [0.26, 0.04], l: -0.1, b: [-0.07, 0] }, follow: { hF: [0.4, -0.06], wF: -0.1, l: 0 } })) }),
  aim: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: GUN, loadAt: 0.3, load: { hF: [0.44, -0.06], wF: -0.02, hB: c.sling ? [-0.02, -0.06] : [0.32, -0.01], l: 0.05, b: [0, 0.06], face: 'fierce' }, hold: { hF: [0.3, -0.24], wF: -0.7, l: -0.16, b: [-0.14, 0.02] }, hit: { hF: [0.3, -0.24], wF: -0.7, hB: c.sling ? [0.36, -0.04] : [0.24, 0.02], l: -0.16, b: [-0.14, 0.02] } })) }),
  flick: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { hF: [0.02, 0.2], l: -0.06 }, hit: { hF: [0.46, -0.1], l: 0.16, b: [0.06, 0.02], hand: 'palm', face: 'fierce' } })) }),
  throw: (w, T, c) => ({ keys: strike(w, T, S(c, { load: { hF: { a: -2.4, r: 0.4 }, l: -0.16, b: [-0.04, 0.04] }, hit: { hF: { a: 0.15, r: 0.43 }, l: 0.26, b: [0.1, 0.04], hand: 'palm', face: 'fierce' } })) }),

  // ---------------------------------------------------------------- casting
  push: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.7, load: { b: [-0.04, 0.1], l: -0.14, hF: [-0.12, 0.18], hB: [-0.16, 0.2], hand: 'palm', handB: 'palm', fF: [0.2, 0], fB: [-0.16, 0], face: 'fierce' }, hit: { b: [0.1, 0.04], l: 0.22, hF: [0.47, -0.06], hB: [0.43, 0.03], hand: 'palm', handB: 'palm', fF: [0.28, 0], fB: [-0.18, 0], face: 'shout' } })), jitter: 0.006 }),
  point: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, load: { hF: [0.1, 0.1], l: -0.06, face: 'fierce' }, hit: { hF: [0.48, -0.12], hand: 'finger', l: 0.1, hB: [-0.05, 0.3], fF: [0.18, 0], fB: [-0.12, 0] } })) }),
  raise: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.75, load: { hF: [0.1, -0.5], hand: 'palm', l: -0.14, b: [0, 0.02], hB: [-0.06, 0.3], face: 'fierce' }, hit: { hF: [0.46, -0.02], hand: 'palm', l: 0.14, b: [0.04, 0.04], face: 'shout' } })), jitter: 0.004 }),
  summon: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.6, load: { b: [0, 0.1], l: 0.18, hF: [0.14, 0.2], hB: [-0.1, 0.22], hand: 'palm', handB: 'palm', face: 'fierce' }, hit: { b: [0, -0.02], l: -0.16, hF: [0.18, -0.5], hB: [-0.16, -0.48], hand: 'palm', handB: 'palm', face: 'shout' }, holdT: 0.18 })), jitter: 0.01 }),
  powerup: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.8, load: { b: [0, 0.16], l: 0.26, hF: [0.02, 0.27], hB: [-0.06, 0.29], fF: [0.2, 0], fB: [-0.2, 0], face: 'fierce' }, hit: { b: [0, -0.03], l: -0.18, hF: [0.3, -0.34], hB: [-0.28, -0.34], hand: 'palm', handB: 'palm', fF: [0.22, 0], fB: [-0.22, 0], face: 'shout' }, holdT: 0.14 })), jitter: 0.012 }),
  spread: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.72, load: { b: [0, 0.13], hF: [0.1, 0.26], hB: [0.0, 0.26], l: 0.22, face: 'fierce' }, hit: { b: [0, -0.02], hF: [0.4, -0.14], hB: [-0.38, -0.14], hand: 'palm', handB: 'palm', l: -0.1, fF: [0.2, 0], fB: [-0.2, 0], face: 'shout' }, holdT: c.hitDur ? Math.min(0.5, c.hitDur) : 0.12 })), jitter: 0.008 }),
  hana: (w, T, c) => ({ keys: strike(w, T, S(c, { stance: STAND, loadAt: 0.55, load: { b: [0, 0.03], hF: [0.14, 0.02], hB: [0.2, -0.05], eF: 1, eB: -1, hand: 'palm', handB: 'palm', face: 'fierce' }, hit: { b: [0, 0.02], ht: -0.06, hF: [0.19, -0.06], hB: [0.23, -0.13], eF: 1, eB: -1, hand: 'palm', handB: 'palm', face: 'fierce' }, holdT: c.hitDur ? Math.min(0.9, c.hitDur) : 0.22, holdK: 0.85 })) }),
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

/** Resolve an animation for an action. Unknown names fall back to a sensible base clip. */
export function buildClip(name, w, T, c = {}) {
  const key = CLIPS[name] ? name : ALIAS[name] || 'jab';
  const f = CLIPS[key];
  const clip = f(Math.max(0, w), Math.max(T, w + 0.08), c);
  clip.name = key;
  clip.w = w;
  if (c.flurry) clip.flurry = c.flurry;
  if (c.spin) clip.spin = c.spin;
  clip.limb = LIMB[key] || (clip.legs ? 'fF' : 'hF');
  clip.sweep = SWEEP[key] || 0;
  // smears only during the swing itself (not the wind-back to the stance)
  const K = clip.keys;
  clip.trailFrom = K[1] ? K[1].t : 0;
  clip.trailTo = Math.max((K[3] ? K[3].t : w) + 0.07, c.flurry ? c.flurry.t1 : 0, c.spin ? c.spin.t1 : 0);
  return clip;
}
const ALIAS = { punch: 'cross', heavy: 'haymaker', cast: 'push', block: 'guardup', slashing: 'slash', kick: 'kick', grab: 'grab' };
export const hasClip = (name) => !!CLIPS[name];

// ------------------------------------------------------------------ ability → clip
const GENERIC = new Set(['punch', 'heavy', 'slash', 'thrust', 'kick', 'grab', 'cast', 'shoot', 'block']);
const MAIN = (s) => s.hit || s.proj || s.dash || s.zone || s.teleport || s.pull || s.conqueror || s.heal || s.buff || s.summon;

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
 * then a specific clip name in `anim`, then the generic anim names used by
 * content packs ('punch', 'heavy', 'slash'...) resolved from what the
 * technique actually does (dash, projectile, ring, beam...) and the weapon.
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
  if (c.hitDur) {
    if (FLURRY.has(name) && !SPINS.has(name)) c.flurry = { t0: w, t1: w + c.hitDur, rate: 12, legs: name.startsWith('kick') };
    if (SPINS.has(name) && name !== 'handstand') c.spin = { t0: w, t1: w + c.hitDur, turns: Math.max(1, Math.round(c.hitDur * 5)) };
  }
  const clip = buildClip(name, w, T, c);
  clip.weapon = wk;
  return clip;
}

function pickClip(def, actor, s, steps, c, wk) {
  if (def.clip && CLIPS[def.clip]) return def.clip;
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
      if (rubber) return proj ? 'bazooka' : 'bazooka';
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
      if (proj) return 'thrust';
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
      if (hit && (hit.shape === 'circle' || hit.shape === 'ring')) return multi ? 'spread' : 'spread';
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
  const g = gaitParams(pose.speed ?? 3, pose.sprint);
  const u = frac((pose.walk || 0) / TAU);
  const a = legAt(u, g), b = legAt(frac(u + 0.5), g);
  P.fF = [0.03 + a[0], -a[1]];
  P.fB = [-0.03 + b[0], -b[1]];
}

// ------------------------------------------------------------ gait
// A proper stride: each foot is planted and sweeps back under the body for a
// share of the cycle (long when walking, short when running), then lifts off
// behind — the heel kicking up — and reaches forward to land again. Running
// has a flight phase with both feet off the ground; the body dips as it takes
// its weight and rises as it pushes off; the arms swing against the legs.
// The cycle's pace is matched to the ground speed so feet don't skate.
const frac = (x) => x - Math.floor(x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mixN = (a, b, k) => a + (b - a) * k;

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

/** Legs, bob, lean and (unless busy fighting) arms of the stride. */
function gaitPose(P, pose, base) {
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
  if (pose.combat) return;
  // arms swing against the legs: the right hand forward as the right foot goes back
  const swF = clamp01(0.5 - a[0] / (2 * g.R)), swB = clamp01(0.5 - b[0] / (2 * g.R));
  const run = clamp01(g.k * 1.3 - 0.2);
  const walkArm = (sw) => [mixN(-0.1, 0.14, sw), 0.38 - sw * 0.03];
  const runArm = (sw) => [mixN(-0.14, 0.22 + 0.04 * g.s, sw), mixN(0.28, 0.06, sw)];
  const wF = walkArm(swF), wB = walkArm(swB), rF = runArm(swF), rB = runArm(swB);
  P.hF = [mixN(wF[0], rF[0], run) + 0.02, mixN(wF[1], rF[1], run)];
  P.hB = [mixN(wB[0], rB[0], run) - 0.01, mixN(wB[1], rB[1], run)];
  P.eF = 1; P.eB = 1;
  if (run > 0.5) { P.hand = 'fist'; P.handB = 'fist'; }
  if (pose.sprint) { P.wF = base.wF === null ? null : -2.4; P.wB = base.wB === null ? null : -2.5; }
}

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
  return P;
}

/**
 * Everyday poses for townsfolk (see game/townlife.js): leaning on a wall with
 * the arms folded, sitting, chatting with the hands, sweeping, minding a
 * stall, fishing, swaying with a mug. (The 3D rig adds the seat height and
 * folds the arms across; see chars/pose.js.)
 */
function activityPose(P, act, t) {
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
  }
}

/**
 * Swimming. The horizontal strokes turn the whole body face-down (P.r), so an
 * arm "overhead" in the body's frame reaches forward through the water.
 *   tread: upright, sculling hands, egg-beater legs (a rest at the surface)
 *   crawl: along the surface: a breaststroke, head up (as in first person)
 *   dive: underwater breaststroke (both arms sweep, a frog kick), tipping with the dive
 *   float: hanging in the water, slow sculling
 *   fish: a Fish-Man's dolphin kick, arms along the sides, fast and smooth
 *   struggle: a Devil Fruit user thrashing to keep their head up
 *   sink: a Devil Fruit user whose strength has gone, limp and going down
 */
function swimPose(P, kind, t, dir) {
  P.wF = null; P.wB = null; P.b = [0, 0]; P.l = 0;
  switch (kind) {
    case 'crawl': {
      // (the stroke along the surface is a breaststroke, in step with the
      // first-person arms: reach forward together, sweep wide and back, tuck
      // in under the chin; the frog kick drives as the arms recover. The head
      // stays up, looking where you're going.)
      const w = t * 3.6, s = Math.sin(w), c = Math.cos(w);
      P.hF = [0.2 + 0.14 * c, -0.44 + 0.34 * Math.max(0, s)]; P.hB = P.hF.slice();
      P.eF = 0.55; P.eB = 0.55; P.hand = s < -0.2 ? 'relaxed' : 'flat'; P.handB = P.hand;
      P.spread = 0.04 + 0.24 * Math.max(0, s);
      const kick = Math.max(0, -s);
      P.fF = [0.07 * kick, -0.2 * kick]; P.fB = [0.07 * kick, -0.2 * kick];
      P.r = 1.12 + 0.05 * s; P.ht = 0.42;
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

/** Pose when no action is running: idle, fighting stance, walk, sprint, swim, hurt, block, dodge. */
export function restPose(pose) {
  const t = pose.time || 0;
  const stance = pose.stanceP || GUARD;
  const base = pose.block !== undefined ? GUARD : pose.combat ? stance : STAND;
  const P = { ...base };
  P.b = [base.b[0], base.b[1] + Math.sin(t * 2.2) * 0.012];
  if (pose.combat && !pose.moving) {
    // light fighter's bounce
    const bounce = Math.abs(Math.sin(t * 4.2));
    P.b = [base.b[0], base.b[1] + bounce * 0.022];
    if (Array.isArray(base.hF)) P.hF = [base.hF[0], base.hF[1] + bounce * 0.015];
    if (Array.isArray(base.hB)) P.hB = [base.hB[0], base.hB[1] + bounce * 0.012];
  }
  if (pose.moving) gaitPose(P, pose, base);
  if (pose.activity) activityPose(P, pose.activity, t);
  if (pose.bounce) {
    // Gear Fourth: the whole body bounces like a ball
    const k = Math.abs(Math.sin(t * 5.2));
    P.z = (P.z || 0) + k * 0.32;
    P.b = [P.b[0], P.b[1] + (1 - k) * 0.08];
    P.hF = [0.28, -0.02]; P.hB = [0.16, 0.04];
  }
  if (pose.charge) {
    // crouched to spring: hips down, weight forward, arms swung back (a tremble at full charge)
    const k = pose.charge, tr = k > 0.95 ? Math.sin(t * 70) * 0.006 : 0;
    P.b = [0.02 * k + tr, 0.04 + 0.19 * k];
    P.l = 0.1 + 0.24 * k;
    P.fF = [0.15, 0]; P.fB = [-0.13, 0];
    P.hF = [0.08 - 0.26 * k, 0.3 + 0.06 * k]; P.hB = [0.02 - 0.28 * k, 0.32 + 0.05 * k];
    P.eF = 1; P.eB = 1;
    P.ht = 0.1 * k;
    if (k > 0.5) P.face = 'fierce';
  }
  if (pose.air) {
    // in the air: knees drawn up and arms high on the way up, legs reaching for the ground on the way down
    const k = pose.air.k || 0;
    if (pose.air.up) {
      P.fF = [0.16, -0.22 - 0.1 * k]; P.fB = [-0.02, -0.3 - 0.12 * k];
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
  if (pose.swimming) swimPose(P, pose.swim || 'tread', t, pose.swimDir || 0);
  if (pose.block !== undefined) {
    // cross-arm guard in front of the face; a fresh guard (parry window) snaps up
    const fresh = Math.max(0, 1 - pose.block / 0.2);
    P.hF = [0.2 + fresh * 0.04, -0.13 - fresh * 0.03]; P.hB = [0.23, -0.03]; P.eF = 1; P.eB = -0.8;
    P.b = [-0.02 * fresh, 0.08]; P.l = 0.14;
    P.fF = [0.21, 0]; P.fB = [-0.19, 0];
    P.hand = 'fist'; P.handB = 'fist';
    if (base.wF !== null && pose.armedBlock) { P.wF = -1.35; P.hF = [0.2, -0.05]; }
    else P.wF = null;
    P.wB = null;
    P.face = 'fierce';
  }
  if (pose.state === 'hurt') {
    const k = pose.hurtK ?? 1;
    P.l = -0.4 * k; P.b = [-0.07 * k, 0.05];
    P.hF = [-0.2, 0.08]; P.hB = [0.2, 0.0]; P.eF = 0.3; P.eB = 0.3;
    P.fF = [0.12, 0]; P.fB = [-0.14, -0.02];
    P.ht = -0.24;
    P.wF = null; P.wB = null;
  }
  if (pose.dodge !== undefined) {
    const k = pose.dodge;
    const dir = pose.dodgeDir ?? 1;
    if (Math.abs(dir) > 0.35) {
      // tucked roll (forwards or backwards)
      P.r = Math.sign(dir) * k * TAU;
      P.b = [0, 0.22 * Math.sin(k * Math.PI)];
      P.hF = [0.2, 0.18]; P.hB = [0.16, 0.2];
      P.fF = [0.18, -0.26 * Math.sin(k * Math.PI)]; P.fB = [0.06, -0.3 * Math.sin(k * Math.PI)];
      P.l = 0.4 * Math.sin(k * Math.PI);
    } else {
      // side-step: a low, leaning slide
      const e = Math.sin(k * Math.PI);
      P.b = [0, 0.16 * e]; P.l = 0.2 * e;
      P.fF = [0.28, 0]; P.fB = [-0.3, -0.04];
      P.hF = [0.26, 0.1]; P.hB = [-0.2, 0.16];
    }
    P.wF = null; P.wB = null;
  }
  if (pose.getUp !== undefined) {
    const k = pose.getUp; // 0 → 1: kneel, push up, stand
    const e = 1 - (1 - k) * (1 - k);
    P.b = [0, 0.3 * (1 - e)]; P.l = 0.55 * (1 - e);
    P.hF = [0.22, 0.46 * (1 - e) + 0.08]; P.hB = [0.12, 0.42 - 0.1 * e];
    P.fF = [0.24 * (1 - e) + 0.06, 0]; P.fB = [-0.2, -0.02 * (1 - e)];
    P.ht = 0.2 * (1 - e);
  }
  if (pose.launch) {
    P.r = -pose.launch * 0.9;
    P.hF = [-0.1, -0.3]; P.hB = [0.14, -0.26]; P.fF = [0.3, -0.25]; P.fB = [0.12, -0.12];
    P.ht = -0.3;
  }
  return P;
}
