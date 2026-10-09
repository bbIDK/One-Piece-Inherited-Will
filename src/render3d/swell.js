// The swells, worked out the same way on the GPU (the water's shaders: the
// vertices move with them, the pixels shade with them) and here, for the
// things that float on them: a ship rises, falls and leans with them
// (world/hull.js), a swimmer rides them, a wake and the rings on the water
// lie on them. Five trains of waves — a long swell, a cross swell strong in
// some stretches of sea and gone in others, and three shorter seas — each
// gathered into groups that come and go across the sea, their crests bent
// (a little everywhere, and in long slow curves), so from high up they don't
// line up into stripes or a grid; all but the shortest peaked (sharp crests,
// wide troughs: e^sin, less its mean).
// The shorter a train, the nearer the eye it stops: further off the water is
// drawn too coarsely to carry it (and there it's only shaded: water3d.js).
//
// (The hash is one that comes out the same in the GPU's 32-bit floats and in
// JavaScript's 64-bit ones — a sin()-based hash of big numbers doesn't — so
// what floats here stays on the water drawn there.)
import { CANALS } from '../world/reverseMountain.js';

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
  // d: how far from the eye (m) — the shorter trains stop nearer it
  float swells(vec2 p, float t, float d, out vec2 slope) {
    const vec2 D0 = vec2(0.86, 0.51), D1 = vec2(0.17, 0.985), D2 = vec2(-0.81, 0.59), D3 = vec2(0.75, -0.66), D4 = vec2(0.42, -0.91);
    const float K0 = 0.1366, K1 = 0.2856, K2 = 0.4833, K3 = 0.7854, K4 = 0.1848;   // 46 m, 22 m, 13 m, 8 m; a cross swell of 34 m
    const float W0 = 1.157, W1 = 1.673, W2 = 2.177, W3 = 2.774, W4 = 1.346;       // deep-water speeds
    // bent crests (a little everywhere, and long slow curves)
    vec2 q = p + (vec2(sNoise(p * 0.021), sNoise(p * 0.021 + 7.7)) - 0.5) * 14.0 + (vec2(sNoise(p * 0.0055 + 3.1), sNoise(p * 0.0055 + 9.4)) - 0.5) * 44.0;
    // wave groups
    float g0 = (0.36 + 0.45 * sFbm(p * 0.006 + vec2(0.0, t * 0.012) + 91.0)) * (1.0 - smoothstep(160.0, 320.0, d));
    float g1 = (0.35 + 0.9 * sFbm(p * 0.011 + vec2(t * 0.02, 0.0))) * 0.75 * (1.0 - smoothstep(150.0, 300.0, d));
    float g2 = (0.3 + 0.9 * sFbm(p * 0.017 + 31.0 - vec2(0.0, t * 0.025))) * 0.4 * (1.0 - smoothstep(45.0, 100.0, d));
    float g3 = (0.3 + 0.9 * sFbm(p * 0.026 + 57.0)) * 0.22 * (1.0 - smoothstep(25.0, 55.0, d));
    // (the cross swell strong in some stretches of sea, gone in others)
    float g4 = (0.7 * sFbm(p * 0.0045 - 51.0 + vec2(t * 0.01, 0.0)) + 0.15) * 0.8 * (1.0 - smoothstep(160.0, 320.0, d));
    float a0 = K0 * dot(D0, q) - W0 * t + 0.6, a1 = K1 * dot(D1, q) - W1 * t, a2 = K2 * dot(D2, q) - W2 * t + 1.7, a3 = K3 * dot(D3, q) - W3 * t + 4.1, a4 = K4 * dot(D4, q) - W4 * t + 2.3;
    // (peaked: e^(sin a - 1), less its mean 0.466, scaled back to a peak of 1)
    float e0 = exp(sin(a0) - 1.0) * 1.873, e1 = exp(sin(a1) - 1.0) * 1.873, e2 = exp(sin(a2) - 1.0) * 1.873, e4 = exp(sin(a4) - 1.0) * 1.873;
    float h = (e0 - 0.873) * g0 + (e1 - 0.873) * g1 + (e2 - 0.873) * g2 + sin(a3) * g3 + (e4 - 0.873) * g4;
    slope = (D0 * K0 * e0 * cos(a0) * g0 + D1 * K1 * e1 * cos(a1) * g1 + D2 * K2 * e2 * cos(a2) * g2 + D3 * K3 * cos(a3) * g3 + D4 * K4 * e4 * cos(a4) * g4) / 2.6;
    return h / 2.6;
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
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The swell's height at world (x, y) at time t, `d` m from the eye: about -0.6..1 (times the amplitude: see swellAt). */
export function swells(x, y, t, d = 0) {
  const qx = x + (sNoise(x * 0.021, y * 0.021) - 0.5) * 14 + (sNoise(x * 0.0055 + 3.1, y * 0.0055 + 3.1) - 0.5) * 44;
  const qy = y + (sNoise(x * 0.021 + 7.7, y * 0.021 + 7.7) - 0.5) * 14 + (sNoise(x * 0.0055 + 9.4, y * 0.0055 + 9.4) - 0.5) * 44;
  const g0 = (0.36 + 0.45 * sFbm(x * 0.006 + 91, y * 0.006 + t * 0.012 + 91)) * (1 - sst(160, 320, d));
  const g1 = (0.35 + 0.9 * sFbm(x * 0.011 + t * 0.02, y * 0.011)) * 0.75 * (1 - sst(150, 300, d));
  const g2 = (0.3 + 0.9 * sFbm(x * 0.017 + 31, y * 0.017 + 31 - t * 0.025)) * 0.4 * (1 - sst(45, 100, d));
  const g3 = (0.3 + 0.9 * sFbm(x * 0.026 + 57, y * 0.026 + 57)) * 0.22 * (1 - sst(25, 55, d));
  const g4 = (0.7 * sFbm(x * 0.0045 - 51 + t * 0.01, y * 0.0045 - 51) + 0.15) * 0.8 * (1 - sst(160, 320, d));
  const a0 = 0.1366 * (0.86 * qx + 0.51 * qy) - 1.157 * t + 0.6;
  const a1 = 0.2856 * (0.17 * qx + 0.985 * qy) - 1.673 * t;
  const a2 = 0.4833 * (-0.81 * qx + 0.59 * qy) - 2.177 * t + 1.7;
  const a3 = 0.7854 * (0.75 * qx - 0.66 * qy) - 2.774 * t + 4.1;
  const a4 = 0.1848 * (0.42 * qx - 0.91 * qy) - 1.346 * t + 2.3;
  const e0 = Math.exp(Math.sin(a0) - 1) * 1.873, e1 = Math.exp(Math.sin(a1) - 1) * 1.873, e2 = Math.exp(Math.sin(a2) - 1) * 1.873, e4 = Math.exp(Math.sin(a4) - 1) * 1.873;
  return ((e0 - 0.873) * g0 + (e1 - 0.873) * g1 + (e2 - 0.873) * g2 + Math.sin(a3) * g3 + (e4 - 0.873) * g4) / 2.6;
}

/** How big the swells are: calm on a fine day, heavy in a storm, all but none in the Calm Belt, still water indoors and under the sea. */
export const swellAmp = (storm, zone, calm = 0) => (zone >= 2 ? 0 : (0.85 + storm * 1.4) * (1 - calm * 0.85));

// how much of the swell a liquid has (the sea all of it, a lake half, lava and the like a little)
const LIQUID = new Float32Array(256).fill(0.15);
for (const k of [0, 1, 2, 5, 7]) LIQUID[k] = 1;
LIQUID[3] = 0.5;
LIQUID[9] = 0; // (Reverse Mountain's canals draw their own water)

/**
 * Calm water round Reverse Mountain's canal mouths, where the canals' own
 * water fades in over the sea (rmCanals3d.js) and a swell would heave up
 * through it: [x, y, r] each — flat within r × 0.45 of (x, y), the swell
 * back to its own by r. (Shared with the water's shader: water3d.js uCalm.)
 */
export function calmPoints(world) {
  if (!world?.reverseMountain) return [];
  if (world.calmPts) return world.calmPts;
  const out = [];
  for (const c of CANALS) {
    if (c.i0 === undefined) continue;
    // (centred 48 m out to sea from where the rock begins)
    const land = c.exit ? c.i1 - 3 : c.i0 + 3;
    const j = Math.max(0, Math.min(c.x.length - 1, land + (c.exit ? 12 : -12)));
    out.push([c.x[j], c.y[j], 170]);
  }
  return (world.calmPts = out);
}
function calmAt(w, x, y) {
  let k = 1;
  for (const [cx, cy, r] of calmPoints(w)) k = Math.min(k, sst(r * 0.45, r, Math.hypot(w.dx ? w.dx(cx, x) : x - cx, y - cy)));
  return k;
}

// this frame's sea (set by the water as it updates: see water3d.js)
const S = { t: 0, amp: 0, world: null, ox: 0, oy: 0 };
export function setSwell(t, amp, world, ox, oy) { S.t = t; S.amp = amp; S.world = world; S.ox = ox; S.oy = oy; }

/**
 * How far the sea's surface stands above (or below) its level at world (x, y)
 * just now, as the water is drawn there: calmer in the shallows, flat far off
 * (each train stops some way out, as the water's do). `t`: a moment other
 * than the water's own now.
 */
export function swellAt(x, y, t = S.t) {
  const w = S.world;
  if (!w || !S.amp) return 0;
  const dx = w.dx ? w.dx(S.ox, x) : x - S.ox, dy = y - S.oy;
  const d = Math.hypot(dx, dy);
  if (d > 320) return 0;
  const k = w.type(Math.floor(x), Math.floor(y));
  const liquid = LIQUID[k < 16 ? k : 255];
  if (!liquid) return 0;
  const shore = 0.35 + 0.65 * sst(0.5, -7, w.sd ? w.sd(x, y) : -32);
  return swells(x, y, t, d) * S.amp * shore * liquid * (w.reverseMountain ? calmAt(w, x, y) : 1);
}
/** Is there a swell at all just now (the sea out of doors, not the Calm Belt's glass)? */
export const swellOn = () => !!(S.world && S.amp > 0.01);
