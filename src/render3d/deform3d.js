// The ground moved by a Devil Fruit, drawn: world/deform.js's shapes in the
// shaders that draw the ground (terrain3d.js), the grass on it
// (groundcover.js), the sea (water3d.js, a tilt only) and what stands on it
// (props: a tilt only — a house rides the slab it stands on). Uniforms are
// shared: filled once a frame (update), relative to the view's moving origin.
import * as THREE from 'three';
import { DEFORM, envelope } from '../world/deform.js';

export const DEF_N = 8;
const uDefA = { value: Array.from({ length: DEF_N }, () => new THREE.Vector4(0, 0, 1, 0)) };
const uDefB = { value: Array.from({ length: DEF_N }, () => new THREE.Vector4(0, 1, 0, 1)) };
export const DEF_UNIFORMS = { uDefA, uDefB };

/** Fill the uniforms for this frame: centres in the view's frame (origin ox, oy). */
export function updateDeform3d(world, ox, oy) {
  const L = DEFORM.list;
  for (let i = 0; i < DEF_N; i++) {
    const d = L[i], A = uDefA.value[i], B = uDefB.value[i];
    if (!d) { A.w = 0; B.x = 0; continue; }
    A.set(world?.dx ? world.dx(ox, d.x) : d.x - ox, d.y - oy, d.r, d.amp * envelope(d));
    B.set(d.kind, d.c, d.s, d.w);
  }
}

/** Is anything deformed just now (so a shader can skip the loop)? */
export const anyDeform = () => DEFORM.list.length > 0;

/**
 * GLSL: deformH(p, mask) — how far the ground stands off at view-frame xz
 * `p` (mask 1: everything; 2: a tilt only, for the sea and for props).
 * The same shapes as world/deform.js shapeAt.
 */
export const DEFORM_GLSL = /* glsl */`
  uniform vec4 uDefA[${DEF_N}];
  uniform vec4 uDefB[${DEF_N}];
  // (squares written out: GLSL's pow is undefined for a negative base)
  float defSq(float x) { return x * x; }
  float defSst(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
  float deformH(vec2 p, float mask) {
    float h = 0.0;
    for (int i = 0; i < ${DEF_N}; i++) {
      vec4 A = uDefA[i], B = uDefB[i];
      if (abs(A.w) < 1e-4) continue;
      float kind = B.x;
      // (ice — kind 5 — doesn't shape the ground; under it the sea is hidden: mask 2)
      if (kind > 4.5) { if (mask > 1.5 && length(p - A.xy) < A.z) h -= 3.0 * min(1.0, abs(A.w) * 1.4); continue; }
      if (mask > 1.5 && kind > 1.5) continue;
      vec2 l = p - A.xy;
      float r = A.z, amp = A.w, c = B.y, s = B.z, w = B.w;
      float q = length(l) / r;
      if (kind < 1.5) {
        if (q < 1.0) h += amp * dot(l, vec2(c, s)) / r * (1.0 - defSst(0.55, 1.0, q));
      } else if (kind < 2.5) {
        if (q < 1.5) {
          float bowl = q < 1.0 ? -amp * (1.0 - q * q) : 0.0;
          h += bowl + amp * 0.3 * exp(-defSq((q - 1.0) / 0.18));
        }
      } else if (kind < 3.5) {
        float u = l.x * c + l.y * s, v = -l.x * s + l.y * c;
        if (u > -w && u < r + w) {
          float run = defSst(-w, w * 0.5, u) * (1.0 - defSst(r - w * 1.5, r + w, u));
          h += -amp * exp(-defSq(v / w)) * run + amp * 0.18 * exp(-defSq((abs(v) - w * 1.3) / (w * 0.5))) * run;
        }
      } else {
        if (q < 1.0) h += amp * (1.0 - defSst(0.0, 1.0, q));
      }
    }
    return h;
  }
`;
