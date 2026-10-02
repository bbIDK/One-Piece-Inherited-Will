// Room codes for multiplayer: six letters a friend can read out loud or type
// in, from an alphabet without the two easily taken for numbers (is that an
// I or a one? an O or a nought?). 24⁶ is nearly 200 million codes, so two
// voyages drawing the same one by chance practically never happens.
export const CODE_LEN = 6;
export const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** A random number in [0, 1), from the browser's strong random source where there is one. */
function strongRandom() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}

/** A fresh room code (`rnd`: a [0, 1) source, for the tests). */
export function newCode(rnd = strongRandom) {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ABC[Math.min(CODE_ABC.length - 1, Math.floor(rnd() * CODE_ABC.length))];
  return s;
}

/**
 * What was typed (or pasted), as a code: upper case, with the spaces, dashes
 * and dots people put in dropped — or null when it isn't one.
 */
export function normalizeCode(s) {
  const t = String(s ?? '').toUpperCase().replace(/[\s\-_.·]/g, '');
  if (t.length !== CODE_LEN) return null;
  for (const ch of t) if (!CODE_ABC.includes(ch)) return null;
  return t;
}

/** A code as the screens show it: in two halves, ABC DEF. */
export const showCode = (c) => (c ? `${c.slice(0, 3)} ${c.slice(3)}` : '');
