// The wind swells, worked out the same way on the GPU (the water's shaders:
// the vertices move with them, the pixels shade with them) and here, for the
// things that float on them: a swimmer rides them, a wake and the rings on
// the water lie on them. Three trains of waves, each gathered into groups
// that come and go across the sea, their crests gently bent, so from high up
// they don't line up into a repeating grid.
//
// (The hash is one that comes out the same in the GPU's 32-bit floats and in
// JavaScript's 64-bit ones — a sin()-based hash of big numbers doesn't — so
// what floats here stays on the water drawn there.)
export const SWELL_GLSL = /* glsl */`
  float sHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float sNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
  }
  // two octaves, rotated against each other (no grid-aligned blobs)
  float sFbm(vec2 p) {
    float a = sNoise(p);
    p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.03 + 17.3;
    return a * 0.64 + sNoise(p) * 0.36;
  }
  float swells(vec2 p, float t, out vec2 slope) {
    const vec2 D1 = vec2(0.96, 0.28), D2 = vec2(-0.37, 0.93), D3 = vec2(0.75, -0.66);
    const float K1 = 0.2856, K2 = 0.4833, K3 = 0.7854;       // 22 m, 13 m, 8 m
    const float W1 = 1.673, W2 = 2.177, W3 = 2.774;         // deep-water speeds
    // bent crests
    vec2 q = p + (vec2(sNoise(p * 0.021), sNoise(p * 0.021 + 7.7)) - 0.5) * 14.0;
    // wave groups
    float g1 = 0.35 + 0.9 * sFbm(p * 0.011 + vec2(t * 0.02, 0.0));
    float g2 = 0.3 + 0.9 * sFbm(p * 0.017 + 31.0 - vec2(0.0, t * 0.025));
    float g3 = 0.3 + 0.9 * sFbm(p * 0.026 + 57.0);
    float a1 = K1 * dot(D1, q) - W1 * t, a2 = K2 * dot(D2, q) - W2 * t + 1.7, a3 = K3 * dot(D3, q) - W3 * t + 4.1;
    float h = sin(a1) * g1 + sin(a2) * 0.6 * g2 + sin(a3) * 0.35 * g3;
    slope = (D1 * K1 * cos(a1) * g1 + D2 * K2 * cos(a2) * 0.6 * g2 + D3 * K3 * cos(a3) * 0.35 * g3) / 1.95;
    return h / 1.95;
  }
`;

// ---- the same, in JavaScript
const fract = (v) => v - Math.floor(v);
function sHash(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = a;
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
function sNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = sHash(ix, iy), b = sHash(ix + 1, iy), c = sHash(ix, iy + 1), d = sHash(ix + 1, iy + 1);
  const top = a + (b - a) * ux, bot = c + (d - c) * ux;
  return top + (bot - top) * uy;
}
function sFbm(x, y) {
  const a = sNoise(x, y);
  // (GLSL's mat2 is column by column)
  const px = (0.8 * x + 0.6 * y) * 2.03 + 17.3, py = (-0.6 * x + 0.8 * y) * 2.03 + 17.3;
  return a * 0.64 + sNoise(px, py) * 0.36;
}
/** The swell's height at world (x, y) at time t, -1..1 (times the amplitude: see swellAt). */
export function swells(x, y, t) {
  const qx = x + (sNoise(x * 0.021, y * 0.021) - 0.5) * 14;
  const qy = y + (sNoise(x * 0.021 + 7.7, y * 0.021 + 7.7) - 0.5) * 14;
  const g1 = 0.35 + 0.9 * sFbm(x * 0.011 + t * 0.02, y * 0.011);
  const g2 = 0.3 + 0.9 * sFbm(x * 0.017 + 31, y * 0.017 + 31 - t * 0.025);
  const g3 = 0.3 + 0.9 * sFbm(x * 0.026 + 57, y * 0.026 + 57);
  const a1 = 0.2856 * (0.96 * qx + 0.28 * qy) - 1.673 * t;
  const a2 = 0.4833 * (-0.37 * qx + 0.93 * qy) - 2.177 * t + 1.7;
  const a3 = 0.7854 * (0.75 * qx - 0.66 * qy) - 2.774 * t + 4.1;
  return (Math.sin(a1) * g1 + Math.sin(a2) * 0.6 * g2 + Math.sin(a3) * 0.35 * g3) / 1.95;
}

/** How big the swells are: calm on a fine day, heavy in a storm, still water indoors and under the sea. */
export const swellAmp = (storm, zone) => (zone >= 2 ? 0 : 0.14 + storm * 0.34);

const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// how much of the swell a liquid has (the sea all of it, a lake half, lava and the like a little)
const LIQUID = new Float32Array(256).fill(0.15);
for (const k of [0, 1, 2, 5, 7]) LIQUID[k] = 1;
LIQUID[3] = 0.5;
LIQUID[9] = 0; // (Reverse Mountain's canals draw their own water)

// this frame's sea (set by the water as it updates: see water3d.js)
const S = { t: 0, amp: 0, world: null, ox: 0, oy: 0 };
export function setSwell(t, amp, world, ox, oy) { S.t = t; S.amp = amp; S.world = world; S.ox = ox; S.oy = oy; }

/**
 * How far the sea's surface stands above (or below) its level at world (x, y)
 * just now, as the water is drawn there: calmer in the shallows, none out of
 * sight (the swells fade out 70–190 m off, as the water's do).
 */
export function swellAt(x, y) {
  const w = S.world;
  if (!w || !S.amp) return 0;
  const dx = w.dx ? w.dx(S.ox, x) : x - S.ox, dy = y - S.oy;
  const fade = 1 - sst(70, 190, Math.hypot(dx, dy));
  if (fade <= 0) return 0;
  const t = w.type(Math.floor(x), Math.floor(y));
  const liquid = LIQUID[t < 16 ? t : 255];
  const shore = 0.35 + 0.65 * sst(0.5, -7, w.sd ? w.sd(x, y) : -32);
  return swells(x, y, S.t) * S.amp * shore * fade * liquid;
}
