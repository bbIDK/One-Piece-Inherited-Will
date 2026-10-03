// The shared timing of every clip (see docs/ANIMATION.md): the easing
// curves, the small envelopes the reactions and loops are built from, the
// weight classes a blow is timed by and how a body's mass shifts them.
//
// Nothing here knows about any one move: a clip names its weight and the
// strike builder (render/anims.js strike) spaces its beats from this table,
// so a jab and a giant's cleave are timed by the same rules.

export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ easing
// k runs 0 → 1 across a segment between two keys; the curve is the key's own
// (`e` on the key it arrives at).
//   lin    constant speed (a hold that keeps moving)
//   out    fast start, eases into the key (arriving at a pose)
//   in     slow start, accelerating (letting go, falling)
//   inout  eases out of one pose and into the next (the way back to a stance)
//   snap   very fast in, a long ease at the end: the strike itself — most of
//          the travel in the first frames, the contact frame already there
//   back   overshoots the key a little and comes back to it (a light body's
//          snap, a limb whipping past its mark)
//   soft   a gentle smoothstep: drifting between two held poses (a loop, a float)
export const EASE = {
  lin: (k) => k,
  out: (k) => 1 - (1 - k) ** 3,
  in: (k) => k * k * k,
  inout: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  snap: (k) => 1 - (1 - k) ** 5,
  back: (k) => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
  soft: (k) => k * k * (3 - 2 * k),
};
export const ease = (name, k) => (EASE[name] || EASE.inout)(k);

// ------------------------------------------------------------------ small math
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mixN = (a, b, k) => a + (b - a) * k;
export const frac = (x) => x - Math.floor(x);
/** Smoothstep of x over [0, 1] (clamped): the eased 0 → 1 every reaction rides. */
export const sm01 = (x) => { const k = x < 0 ? 0 : x > 1 ? 1 : x; return k * k * (3 - 2 * k); };
/** A hand or foot target as [x, y] (a swing's wind-up gives an angle and a reach, {a, r}). */
export const toXY = (h, fb = [0, 0.4]) => (!h ? fb : Array.isArray(h) ? h : [Math.cos(h.a) * h.r, Math.sin(h.a) * h.r]);
/** Two targets mixed (either may be polar). */
export const mixP = (a, b, k) => { const A = toXY(a), B = toXY(b); return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]; };

// ------------------------------------------------------------------ envelopes
/** 0 → 1 → 0 across [a, b] (a smooth bump: a step's lift, a flap's beat). */
export const bump = (x, a, b) => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));
/** In over `inT`, held, out over `outT` ending at `end` (seconds): a reaction's life. */
export const envelope = (t, inT, holdEnd, end) => (t < 0 || t >= end ? 0 : t < inT ? sm01(t / inT) : t < holdEnd ? 1 : 1 - sm01((t - holdEnd) / (end - holdEnd)));
/** A spring let go at t = 0 (1 at rest): overshoots and rings down — a settle, a recoil. */
export const ring = (t, freq, tau) => (t < 0 ? 0 : Math.exp(-t / tau) * Math.cos(t * freq));

// ------------------------------------------------------------------ weight
// Every blow belongs to a weight class. The class decides how the beats of
// the strike are spaced inside the wind-up and recovery the move's data gives
// it (render/anims.js strike); the poses decide where the body goes.
//   loadAt  the share of the wind-up spent getting into the load (the rest is
//           the coiling hold and the strike: fast in)
//   antic   whether a beat the other way comes before the load (a long one)
//   hold    seconds the contact pose is held (hit-stop freezes it longer)
//   follow  where in the recovery the follow-through peaks (share)
//   carry   how far the trunk carries on past the blow, as a share of the
//           load-to-hit swing (follow-through made from the move itself)
//   settle  how deep the hips drop into the knees as the weight comes down
export const WEIGHT = {
  light: { loadAt: 0.58, antic: false, hold: 0.035, holdK: 0.35, follow: 0.35, carry: 0.06, settle: 0.012, settleLean: 0.015 },
  medium: { loadAt: 0.64, antic: true, hold: 0.05, holdK: 0.4, follow: 0.4, carry: 0.1, settle: 0.02, settleLean: 0.03 },
  heavy: { loadAt: 0.68, antic: true, hold: 0.075, holdK: 0.45, follow: 0.42, carry: 0.13, settle: 0.03, settleLean: 0.04 },
  massive: { loadAt: 0.72, antic: true, hold: 0.11, holdK: 0.5, follow: 0.45, carry: 0.15, settle: 0.04, settleLean: 0.05 },
};
export const WEIGHT_ORDER = ['light', 'medium', 'heavy', 'massive'];
/** The heavier of two classes. */
export const heavier = (a, b) => (WEIGHT_ORDER.indexOf(a) >= WEIGHT_ORDER.indexOf(b) ? a : b);

/**
 * A technique's weight class from what it does: a chain's opening blows are
 * light, its last one medium; a heavy blow heavy; one that stops the world
 * (an impact frame) or a big signature massive. Casts are timed as medium,
 * or massive behind a long build-up.
 */
export function weightOf(def) {
  if (!def) return 'medium';
  const steps = def.steps || [];
  const main = steps.find((s) => s.hit || s.proj || s.dash || s.zone) || {};
  const h = main.hit || main.dash?.hit || main.proj || main.zone || null;
  const w = def.windup ?? 0.1;
  if (def.m1Chain) return h && ((h.knockback ?? 0) >= 3.2 || (h.stun ?? 0) >= 0.3) ? 'medium' : 'light';
  if (h && (h.impactFrame || (h.damage ?? 0) >= 60)) return 'massive';
  if (h && (h.heavy || h.guardBreak)) return w >= 0.55 ? 'massive' : 'heavy';
  if (!h) return w >= 0.6 ? 'massive' : 'medium';
  return w >= 0.6 ? 'heavy' : 'medium';
}

/**
 * How heavy a body moves (1 for an ordinary build): the bigger and bulkier
 * it is, the longer it takes to load a blow, the longer it holds it and the
 * deeper it settles — a Buccaneer's swing is the same move as anyone's, with
 * more body behind it. Light frames (a Mink, the Longleg tribe) are snappier.
 */
export function massOf(look) {
  if (!look) return 1;
  const FR = { brawny: 1.18, heavy: 1.14, stocky: 1.08, athletic: 1.03, average: 1, lean: 0.95, slim: 0.93, lanky: 0.94, curvy: 0.98, petite: 0.9 };
  let m = (look.scale || 1) * (1 + ((look.bulk || 1) - 1) * 0.8) * (FR[look.frame] || 1);
  if (look.race === 'mink') m *= 0.92;
  if (look.race === 'longleg') m *= 0.95;
  return clamp(m, 0.85, 1.6);
}
