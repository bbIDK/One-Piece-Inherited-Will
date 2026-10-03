// The sky's noise: one tiling 256² texture the clouds, the stars' Milky Way
// and the mists are all cut from (texture taps instead of noise worked out
// pixel by pixel). R and G are value-noise fbm (four octaves from a 4 × 4
// lattice, and from 8 × 8), B is billows (cellular: 1 − the distance to the
// nearest of 8 × 8 scattered points, so round puffs with creases between),
// A is fine cellular (16 × 16) for crisp detail. Each channel is stretched to
// fill 0..1. The same every run (seeded), so a view looks the same each time.
import * as THREE from 'three';

const N = 256;

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiling fbm of value noise: base lattice `p` cells across, `oct` octaves. */
function fbm(out, p, oct, rnd) {
  const lat = [];
  for (let o = 0, q = p; o < oct; o++, q *= 2) {
    const g = new Float32Array(q * q);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    lat.push([q, g]);
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0, a = 0.5, tot = 0;
      for (const [q, g] of lat) {
        const fx = x / N * q, fy = y / N * q;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const x0 = ix % q, y0 = iy % q, x1 = (x0 + 1) % q, y1 = (y0 + 1) % q;
        const top = g[y0 * q + x0] + (g[y0 * q + x1] - g[y0 * q + x0]) * tx;
        const bot = g[y1 * q + x0] + (g[y1 * q + x1] - g[y1 * q + x0]) * tx;
        v += (top + (bot - top) * ty) * a;
        tot += a;
        a *= 0.5;
      }
      out[y * N + x] = v / tot;
    }
  }
}

/** Tiling cellular noise: 1 − the distance to the nearest of p × p jittered points (in cells). */
function cells(out, p, rnd) {
  const px = new Float32Array(p * p), py = new Float32Array(p * p);
  for (let i = 0; i < p * p; i++) { px[i] = 0.1 + 0.8 * rnd(); py[i] = 0.1 + 0.8 * rnd(); }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = x / N * p, fy = y / N * p, cx = Math.floor(fx), cy = Math.floor(fy);
      let d = 9;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i, gy = cy + j, k = (((gy % p) + p) % p) * p + (((gx % p) + p) % p);
          const dx = gx + px[k] - fx, dy = gy + py[k] - fy;
          d = Math.min(d, dx * dx + dy * dy);
        }
      }
      out[y * N + x] = 1 - Math.sqrt(d);
    }
  }
}

function stretch(a) {
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo || 1);
  return a;
}

let tex = null;
/** The shared sky noise (made once). */
export function skyNoise() {
  if (tex) return tex;
  const rnd = mulberry(20240611);
  const ch = [0, 1, 2, 3].map(() => new Float32Array(N * N));
  fbm(ch[0], 4, 2, rnd);
  fbm(ch[1], 8, 4, rnd);
  cells(ch[2], 8, rnd);
  cells(ch[3], 16, rnd);
  ch.forEach(stretch);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(ch[c][i] * 255);
  tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.userData.channels = ch; // (for the tests and for tuning)
  return tex;
}
