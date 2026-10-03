// Shared pieces of the 3D effects layer: colour parsing (the fx engine speaks
// CSS colours: '#fff', '#ff7043', 'rgba(255,60,60,1)'), the tiling noise
// texture every shader breaks its shapes up with, the GLSL every effect
// material shares (fog, the near-camera fade, the blend) and small helpers.
//
// Every batch draws with one blend mode, premultiplied alpha
// (ONE, ONE_MINUS_SRC_ALPHA): a fragment that returns alpha 0 adds its light
// (sparks, flashes, glows), one that returns its coverage covers what's
// behind (smoke, dust, ink-dark rings) — and anything in between, so a
// flame can be a solid cel-shaded shape and glow at the same time. One draw
// call per batch, whatever mix of effects is in it.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Deterministic pseudo-random in [0, 1) (the same hash as the 2D drawers). */
export function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// ------------------------------------------------------------------ colours
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const COLS = new Map();
const _tc = new THREE.Color();
/**
 * A CSS colour as linear [r, g, b, a] (cached: the same few dozen strings
 * come round every frame). Arrays of colours pick their first.
 */
export function col(s) {
  if (Array.isArray(s)) s = s[0];
  if (typeof s !== 'string') s = '#ffffff';
  let c = COLS.get(s);
  if (c) return c;
  c = new Float32Array([1, 1, 1, 1]);
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    c[0] = srgb(+m[1] / 255); c[1] = srgb(+m[2] / 255); c[2] = srgb(+m[3] / 255); c[3] = m[4] !== undefined ? +m[4] : 1;
  } else if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16);
    c[0] = srgb(((n >> 16) & 255) / 255); c[1] = srgb(((n >> 8) & 255) / 255); c[2] = srgb((n & 255) / 255);
    if (h.length === 8) c[3] = parseInt(h.slice(6), 16) / 255;
  } else {
    try { _tc.setStyle(s); c[0] = _tc.r; c[1] = _tc.g; c[2] = _tc.b; } catch { /* white */ }
  }
  if (COLS.size > 600) COLS.clear();
  COLS.set(s, c);
  return c;
}
/** Perceived brightness of a linear colour (0..1). */
export const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// ------------------------------------------------------------------ noise
/**
 * A tiling 128² noise texture: R, G, B are value-noise octaves at rising
 * frequencies, A is cellular (distance to the nearest of a few scattered
 * points) — billows for smoke and clouds, cells for cracks and crystals.
 */
let NOISE = null;
export function noiseTexture() {
  if (NOISE) return NOISE;
  const S = 128;
  let seed = 9187;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lattice = (f) => { const L = new Float32Array(f * f); for (let i = 0; i < L.length; i++) L[i] = rand(); return L; };
  const value = (L, f, x, y) => {
    const fx = x * f, fy = y * f, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const x0 = ix % f, x1 = (ix + 1) % f, y0 = iy % f, y1 = (iy + 1) % f;
    const a = L[y0 * f + x0], b = L[y0 * f + x1], c = L[y1 * f + x0], d = L[y1 * f + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const oct = [[4, 8, 16], [8, 16, 32], [16, 32, 64]].map((fs) => fs.map((f) => [f, lattice(f)]));
  const W = 6, pts = [];
  for (let i = 0; i < W * W; i++) pts.push([(i % W + 0.15 + rand() * 0.7) / W, (Math.floor(i / W) + 0.15 + rand() * 0.7) / W]);
  const data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = i / S, y = j / S, k = (j * S + i) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const o = oct[ch];
        const v = value(o[0][1], o[0][0], x, y) * 0.55 + value(o[1][1], o[1][0], x, y) * 0.3 + value(o[2][1], o[2][0], x, y) * 0.15;
        data[k + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
      // cellular: the nearest point, the cells wrapping round
      const cx = Math.floor(x * W), cy = Math.floor(y * W);
      let best = 9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const gx = (cx + dx + W) % W, gy = (cy + dy + W) % W, p = pts[gy * W + gx];
          const px = p[0] + (cx + dx - gx) / W, py = p[1] + (cy + dy - gy) / W;
          const d = Math.hypot(px - x, py - y) * W;
          if (d < best) best = d;
        }
      }
      data[k + 3] = Math.max(0, Math.min(255, Math.round(Math.min(1, best / 0.85) * 255)));
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  NOISE = t;
  return t;
}

// ------------------------------------------------------------------ shared uniforms
/** Uniforms every effect material shares (one object: set once a frame). */
export const SHARED = {
  uNoise: { value: null },
  uTime: { value: 0 },
  uNearA: { value: 0.35 }, // m from the camera: invisible this close…
  uNearB: { value: 1.1 }, //  …fully there from here (first person: your own hands and body)
  uFlashMax: { value: 0.9 }, // a flash's half-size at most this × its distance (no flash fills the view)
  uSunV: { value: new THREE.Vector3(0.3, 0.8, 0.5) }, // the sun in view space (puffs, solids)
  uSunW: { value: new THREE.Vector3(0.3, 0.8, 0.5) }, // …and in the world
  uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  uAmb: { value: new THREE.Color(0.6, 0.62, 0.7) },
};

// ------------------------------------------------------------------ GLSL
/** Vertex side: fog (computed per vertex: effects are small and near) and the near fade. */
export const VS_COMMON = /* glsl */`
  uniform sampler2D uNoise;
  uniform float uTime, uNearA, uNearB;
  varying float vFog, vNear;
  varying vec3 vFogCol;
  #ifdef USE_FOG
    uniform vec3 fogColor;
    uniform float fogNear, fogFar;
    uniform float fogDensity2, fogHeightK, fogBase;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #endif
  #endif
  float hash1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
  // fog as the world's own materials have it (render3d/fog.js), and the fade
  // that keeps effects from filling the view when they're on top of the camera
  void vfxFogNear(vec4 mv) {
    // (by distance, not depth: what's at your feet is well away, what's at your hand isn't)
    vNear = smoothstep(uNearA, uNearB, length(mv.xyz));
    vFog = 0.0;
    vFogCol = vec3(0.0);
    #ifdef USE_FOG
      vec3 ray = transpose(mat3(viewMatrix)) * mv.xyz;
      float d = length(ray);
      float kdy = fogHeightK * ray.y;
      float hf = abs(kdy) > 1e-3 ? (1.0 - exp(-kdy)) / kdy : 1.0;
      float opt = fogDensity2 * exp(-fogHeightK * max(cameraPosition.y - fogBase, -40.0)) * hf * d;
      float f = 1.0 - exp(-max(opt, 0.0));
      #ifdef FOG_EXP2
        f = max(f, 1.0 - exp(-fogDensity * fogDensity * d * d));
      #else
        f = max(f, smoothstep(fogNear, fogFar, d));
      #endif
      vFog = clamp(f, 0.0, 1.0);
      vFogCol = fogColor;
    #endif
  }
`;
/** Fragment side: the premultiplied output (c: colour, may be over 1; a: coverage; w: 0 covers … 1 adds). */
export const FS_COMMON = /* glsl */`
  uniform sampler2D uNoise;
  uniform float uTime;
  varying float vFog, vNear;
  varying vec3 vFogCol;
  float hash1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
  vec4 vfxOut(vec3 c, float a, float w) {
    a *= vNear;
    vec3 cn = mix(c, vFogCol, vFog);
    vec3 ca = c * (1.0 - vFog);
    return vec4(mix(cn, ca, w) * a, a * (1.0 - w));
  }
`;

/**
 * A material for one batch: premultiplied blending, depth-tested but not
 * written, fog uniforms (refreshed by three), the shared uniforms.
 */
export function vfxMaterial({ vertexShader, fragmentShader, uniforms = {}, defines = {}, depthWrite = false, side = THREE.DoubleSide, polygonOffset = false }) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
    vertexShader, fragmentShader, defines,
    transparent: true, depthWrite, depthTest: true, side, fog: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  // the shared uniforms by reference (one update a frame reaches every batch)
  for (const k of Object.keys(SHARED)) m.uniforms[k] = SHARED[k];
  if (polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
  return m;
}

/** A float attribute buffer for per-vertex / per-instance data, uploaded in part each frame. */
export function dynAttr(n, size, instanced, Arr = Float32Array) {
  const a = instanced ? new THREE.InstancedBufferAttribute(new Arr(n * size), size) : new THREE.BufferAttribute(new Arr(n * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  a.vfxRange = { start: 0, count: 0 }; // (reused: no garbage a frame)
  return a;
}
/** Mark the first `count` items of an attribute for upload. */
export function upload(a, count) {
  a.clearUpdateRanges();
  if (count > 0) {
    const r = a.vfxRange;
    r.start = 0; r.count = count * a.itemSize;
    a.updateRanges.push(r);
    a.needsUpdate = true;
  }
}
