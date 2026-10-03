// The key data model (see docs/ANIMATION.md): a clip is a list of keys
// { t, p, e } — at time t (seconds) the body is in pose p (only what changes
// from the key before), arrived at along the easing e. `finalize` turns the
// changes into whole poses; `seg` finds the two keys either side of a moment.
import { EASE, toXY } from './timing.js';
import { STAND } from './poses.js';

/** One channel a share k of the way from a to b (numbers, hand targets, booleans, names). */
export function lerpVal(a, b, k) {
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return k < 0.5 ? a : b;
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (!Array.isArray(a) && !Array.isArray(b)) return { a: a.a + (b.a - a.a) * k, r: a.r + (b.r - a.r) * k };
    const A = toXY(a), B = toXY(b);
    return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k];
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return k < 0.5 ? a : b;
  // (a hand shape or a face changes a little before halfway: it leads the move)
  return k < 0.35 ? a : b;
}

/** A pose a share k of the way from A to B (past 1, carried on beyond B). */
export function lerpPose(A, B, k) {
  const P = {};
  for (const key in B) P[key] = lerpVal(A[key], B[key], k);
  return P;
}

/**
 * Each key's whole pose: the one before it with the key's changes on top
 * (or, for a `from` key — [keyA, keyB, k] — a pose carried on past two
 * earlier ones: a wind-up that keeps coiling, a follow-through that carries
 * on past the blow).
 */
export function finalize(keys, base = STAND) {
  let prev = base;
  for (const k of keys) {
    const b = k.from ? lerpPose(k.from[0].P, k.from[1].P, k.from[2]) : prev;
    k.P = { ...b, ...k.p };
    prev = k.P;
  }
  return keys;
}

const _seg = { a: null, b: null, k: 0, i: 0 };
/** The keys either side of t and the eased share between them (one shared result: copy what you keep). */
export function seg(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const k0 = keys[i], k1 = keys[i + 1] || k0;
  const span = k1.t - k0.t;
  let k = span > 0 ? (t - k0.t) / span : 1;
  k = k < 0 ? 0 : k > 1 ? 1 : k;
  _seg.a = k0.P; _seg.b = k1.P; _seg.k = (EASE[k1.e] || EASE.inout)(k); _seg.i = i;
  return _seg;
}
