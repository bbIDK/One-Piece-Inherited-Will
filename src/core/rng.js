// Deterministic random numbers. Everything procedural in the world is derived
// from the world seed so the map can be regenerated instead of saved.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Integer hash of 2D coords + seed → uint32. */
export function hash2i(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash of 2D coords + seed → float in [0, 1). */
export const hash2 = (x, y, seed = 0) => hash2i(x, y, seed) / 4294967296;

export class RNG {
  constructor(seed = 1) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
  }
  next() {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  gauss() {
    const u = 1 - this.next(), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  /** Pick from [{weight, ...}] or [[item, weight]] lists. */
  weighted(list, weightKey = 'weight') {
    let total = 0;
    for (const e of list) total += Array.isArray(e) ? e[1] : e[weightKey];
    let r = this.next() * total;
    for (const e of list) {
      r -= Array.isArray(e) ? e[1] : e[weightKey];
      if (r <= 0) return Array.isArray(e) ? e[0] : e;
    }
    const last = list[list.length - 1];
    return Array.isArray(last) ? last[0] : last;
  }
  fork(salt) { return new RNG(hashString(String(salt)) ^ Math.floor(this.next() * 4294967296)); }
}
