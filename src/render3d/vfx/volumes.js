// Volumes: instanced spheres and tubes shaped on the GPU, one draw call each.
//  Shells (spheres, stretched along an axis): shockwave bubbles bright at
//  their rims, balls of fire whose surface boils with noise in hard cel bands,
//  domes (the Room's pale-blue hemisphere, the Birdcage), glowing orbs,
//  dark orbs, water and goo.
//  Tubes (open cylinders from a point along a direction, a radius at each
//  end): beams with energy streaming down them, pillars of light, fire and
//  darkness, funnels of wind and sand spinning up off the ground.
import * as THREE from 'three';
import { VS_COMMON, FS_COMMON, vfxMaterial, dynAttr, upload } from './kit.js';

export const VK = { BUBBLE: 0, FIRE: 1, DOME: 2, DARK: 3, ORB: 4, WATER: 5, GOO: 6, HAKI: 7 };
export const TK = { BEAM: 0, PILLAR: 1, FUNNEL: 2, FIRE: 3, DARK: 4 };

// ------------------------------------------------------------------ shells
const SHELL_VS = /* glsl */`
  ${VS_COMMON}
  attribute vec4 iPos, iAxis, iCol, iCol2, iPrm;
  varying vec4 vCol, vCol2, vPrm;
  varying vec3 vN, vV, vObj;
  varying vec2 vUv;
  varying float vY, vTame;
  void main() {
    int kind = int(iPrm.x + 0.5);
    vec3 n = position;
    vec3 ax = iAxis.xyz;
    float along = dot(n, ax);
    vec3 p = n + ax * along * (iAxis.w - 1.0);
    if (kind == ${VK.FIRE}) {
      // the surface boils: displaced by noise flowing back along the axis
      vec2 nuv = uv * vec2(4.0, 2.0) + vec2(iPrm.z * 0.13, -uTime * 0.7);
      float d = textureLod(uNoise, nuv, 0.0).g - 0.5;
      float d2 = textureLod(uNoise, nuv * 2.1 + 0.37, 0.0).b - 0.5;
      p += n * (d * 0.55 + d2 * 0.25) * iPrm.w;
      // flames lick back, away from where it's going
      p -= ax * max(0.0, -along) * (0.25 + 0.4 * (d + 0.5)) * (iAxis.w - 0.9);
    } else if (kind == ${VK.WATER} || kind == ${VK.GOO}) {
      float d = textureLod(uNoise, uv * vec2(3.0, 2.0) + vec2(uTime * 0.25, iPrm.z * 0.1), 0.0).r - 0.5;
      p += n * d * 0.18;
    } else if (kind == ${VK.DOME}) {
      p.y *= iPrm.w;
    } else if (kind == ${VK.HAKI}) {
      // (a wave of will: squat, its skin rippling as it goes)
      float d = textureLod(uNoise, uv * vec2(5.0, 2.0) + vec2(uTime * 0.5, iPrm.z * 0.1), 0.0).r - 0.5;
      p += n * d * 0.07;
      p.y *= iPrm.w;
    }
    vec3 wp = iPos.xyz + p * iPos.w;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    vN = normalize(mat3(viewMatrix) * n);
    vV = normalize(-mv.xyz);
    vObj = n;
    vUv = uv;
    vY = wp.y - iPos.y;
    // (a ball filling the view gives up its overbright heart and most of its added light)
    float dc = -(viewMatrix * vec4(iPos.xyz, 1.0)).z;
    vTame = smoothstep(0.45, 1.3, iPos.w * max(1.0, iAxis.w) * projectionMatrix[1][1] / max(dc, 0.05));
    vCol = iCol; vCol2 = iCol2; vPrm = iPrm;
    vfxFogNear(mv);
    gl_Position = projectionMatrix * mv;
  }
`;
const SHELL_FS = /* glsl */`
  ${FS_COMMON}
  uniform vec3 uSunV;
  varying vec4 vCol, vCol2, vPrm;
  varying vec3 vN, vV, vObj;
  varying vec2 vUv;
  varying float vY, vTame;
  void main() {
    int kind = int(vPrm.x + 0.5);
    float k = vPrm.y, seed = vPrm.z;
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    float ndv = abs(dot(N, normalize(vV)));
    float fr = 1.0 - ndv;
    vec3 c = vCol.rgb;
    float a = 0.0, w = vCol2.a;
    if (kind == ${VK.BUBBLE}) {
      // a shockwave sphere: clear in the middle, bright round its rim
      float rim = pow(fr, 3.0);
      float edge = smoothstep(0.82, 0.97, fr);
      c = mix(vCol.rgb * 1.0, vCol2.rgb * 1.6, edge);
      a = rim * 0.85 + edge * 0.3;
    } else if (kind == ${VK.FIRE}) {
      vec2 nuv = vUv * vec2(5.0, 2.5) + vec2(seed * 0.21, -uTime * 1.1);
      float n = texture2D(uNoise, nuv).g;
      float n2 = texture2D(uNoise, nuv * 1.9 + 0.31).b;
      float d = ndv * 1.15 + (n - 0.5) * 0.7 + (n2 - 0.5) * 0.3 - k * 0.35;
      float body = smoothstep(0.08, 0.14, d);
      float mid = smoothstep(0.42, 0.48, d);
      float core = smoothstep(0.68, 0.74, d);
      vec3 rim = vCol.rgb * vec3(0.95, 0.36, 0.2);
      c = mix(rim, vCol.rgb * 1.15, mid);
      c = mix(c, vCol2.rgb * 1.8, core);
      a = body;
      w = mix(w * 0.4, 0.85, core);
    } else if (kind == ${VK.DOME}) {
      // the Room / the Birdcage: a pale skin, lines over it, a bright rim, cut at the ground
      if (vY < -0.02) discard;
      float th = atan(vObj.z, vObj.x);
      float lat = asin(clamp(vObj.y, -1.0, 1.0));
      float merid = k > 0.5 ? 16.0 : 10.0;
      float spin = uTime * 0.15;
      float lm = 1.0 - smoothstep(0.008, 0.022, abs(fract((th + spin) / 6.2831853 * merid + 0.5) - 0.5));
      float lp = 1.0 - smoothstep(0.01, 0.03, abs(fract(lat / 1.5708 * 3.0 + 0.5) - 0.5));
      float scan = 1.0 - smoothstep(0.0, 0.03, abs(fract(uTime * 0.35) - lat / 1.5708));
      float rim = pow(fr, 3.0);
      float base = 1.0 - smoothstep(0.0, 0.2, vY);
      // (seen from inside — the camera in the Room — it's only a faint skin)
      float inside = gl_FrontFacing ? 1.0 : 0.22;
      a = (0.07 + rim * 0.4 + max(lm, lp * 0.6) * 0.22 + scan * 0.18 + base * 0.2) * inside;
      c = mix(vCol.rgb * 0.9, vCol2.rgb * 1.3, max(rim, max(lm, scan) * 0.6));
    } else if (kind == ${VK.HAKI}) {
      // Conqueror's going out: clear in the middle, a band of black at its
      // skin, the king's own colour burning along its very edge, torn by the
      // noise; thinning as it spreads (k: how far through it is). Cut at the ground.
      if (vY < -0.02) discard;
      float sw = texture2D(uNoise, vUv * vec2(7.0, 2.0) + vec2(uTime * 0.9, seed * 0.1)).g;
      float f2 = fr + (sw - 0.5) * 0.3;
      float edge = smoothstep(0.88, 0.98, f2);
      c = mix(vec3(0.012, 0.0, 0.02), vCol2.rgb * 1.6, edge);
      // (seen from inside it — it's gone past the camera — only a faint skin)
      float inside = gl_FrontFacing ? 1.0 : 0.2;
      a = smoothstep(0.55, 0.86, f2) * 0.65 * (1.0 - k * k) * inside;
      w = edge * 0.9;
    } else if (kind == ${VK.DARK}) {
      float sw = texture2D(uNoise, vUv * vec2(3.0, 1.5) + vec2(uTime * 0.4, 0.0)).g;
      float rim = smoothstep(0.55, 0.95, fr + (sw - 0.5) * 0.3);
      c = mix(vec3(0.02, 0.0, 0.04), vCol2.rgb * 1.6, rim);
      a = 0.96;
      w = rim * 0.6;
    } else if (kind == ${VK.ORB}) {
      // a coloured ball, a small white-hot heart, a bright rim
      float core = pow(ndv, 8.0) * 0.85;
      c = mix(vCol.rgb * 1.05, vCol2.rgb * 1.8, core);
      a = 0.55 + 0.45 * core + pow(fr, 4.0) * 0.5;
      w = mix(w, 1.0, core);
    } else if (kind == ${VK.WATER}) {
      float spec = pow(max(0.0, dot(N, normalize(uSunV + normalize(vV)))), 40.0);
      c = mix(vCol.rgb, vec3(1.25), max(smoothstep(0.5, 0.95, fr) * 0.8, spec));
      a = 0.62 + 0.38 * fr;
      w = spec * 0.6;
    } else if (kind == ${VK.GOO}) {
      float l = dot(N, uSunV);
      float lit = smoothstep(-0.05, 0.1, l);
      c = vCol.rgb * mix(0.72, 1.08, lit);
      float spec = step(0.92, max(0.0, dot(N, normalize(uSunV + normalize(vV)))));
      c = mix(c, vec3(1.2), spec * 0.7);
      c = mix(c, vCol2.rgb, smoothstep(0.78, 0.86, fr));
      a = 1.0;
      w = 0.0;
    }
    c = mix(c, min(c, vec3(0.92)), vTame);
    w *= 1.0 - 0.7 * vTame;
    if (a < 0.004) discard;
    gl_FragColor = vfxOut(c, a * vCol.a, w);
    #include <colorspace_fragment>
  }
`;

// ------------------------------------------------------------------ tubes
const TUBE_VS = /* glsl */`
  ${VS_COMMON}
  attribute vec4 iPos, iDir, iCol, iCol2, iPrm;
  varying vec4 vCol, vCol2, vPrm;
  varying vec3 vN, vV;
  varying vec2 vUv;
  varying float vLen;
  void main() {
    int kind = int(iPrm.x + 0.5);
    vec3 d = normalize(iDir.xyz);
    vec3 e1 = normalize(abs(d.y) < 0.98 ? cross(d, vec3(0.0, 1.0, 0.0)) : cross(d, vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(d, e1);
    float y = position.y;
    vec2 ci = position.xz;
    float rad = mix(iDir.w, iPrm.w, y);
    float spin = 0.0;
    if (kind == ${TK.FUNNEL}) {
      spin = uTime * 3.0 + y * 2.5;
      float n = textureLod(uNoise, vec2(uv.x + iPrm.z * 0.1, y * 0.5 - uTime * 0.3), 0.0).r - 0.5;
      rad *= 1.0 + n * 0.35;
    } else if (kind == ${TK.FIRE}) {
      float n = textureLod(uNoise, vec2(uv.x * 2.0 + iPrm.z * 0.1, y * 1.2 - uTime * 1.3), 0.0).g - 0.5;
      rad *= 1.0 + n * 0.6;
    } else if (kind == ${TK.BEAM}) {
      // a little swell along the beam, rippling down it
      rad *= 1.0 + 0.08 * sin(y * iPos.w * 2.5 - uTime * 30.0 + iPrm.z);
    }
    float cs = cos(spin), sn = sin(spin);
    vec2 cr = vec2(ci.x * cs - ci.y * sn, ci.x * sn + ci.y * cs);
    vec3 nrm = e1 * cr.x + e2 * cr.y;
    vec3 wp = iPos.xyz + d * (y * iPos.w) + nrm * rad;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    vN = normalize(mat3(viewMatrix) * nrm);
    vV = normalize(-mv.xyz);
    vUv = vec2(uv.x, y);
    vLen = iPos.w;
    vCol = iCol; vCol2 = iCol2; vPrm = iPrm;
    vfxFogNear(mv);
    gl_Position = projectionMatrix * mv;
  }
`;
const TUBE_FS = /* glsl */`
  ${FS_COMMON}
  varying vec4 vCol, vCol2, vPrm;
  varying vec3 vN, vV;
  varying vec2 vUv;
  varying float vLen;
  void main() {
    int kind = int(vPrm.x + 0.5);
    float k = vPrm.y, seed = vPrm.z;
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float y = vUv.y;
    vec3 c = vCol.rgb;
    float a = 0.0, w = vCol2.a;
    if (kind == ${TK.BEAM} || kind == ${TK.PILLAR}) {
      // brightest down the middle of what you see of it, soft at its edges,
      // energy streaming along it
      float core = pow(ndv, 3.0);
      bool beam = kind == ${TK.BEAM};
      // (along a beam the energy rushes forward; up a pillar it streams up in long streaks)
      vec2 nuv = beam ? vec2(vUv.x * 3.0 + seed, y * vLen * 0.25 - uTime * 3.5) : vec2(vUv.x * 5.0 + seed, y * vLen * 0.07 - uTime * 0.9);
      float n = texture2D(uNoise, nuv).g;
      float streak = smoothstep(0.46, 0.68, n);
      c = mix(vCol.rgb * (0.75 + streak * 0.35), vCol2.rgb * 1.8, core);
      a = smoothstep(0.0, 0.7, ndv) * (beam ? 0.4 + 0.4 * streak : 0.18 + 0.62 * streak) + core * 0.35;
      if (kind == ${TK.PILLAR}) a *= 1.0 - smoothstep(0.55, 1.0, y);
      else a *= smoothstep(0.0, 0.04, y) * (1.0 - smoothstep(0.97, 1.0, y));
    } else if (kind == ${TK.FUNNEL}) {
      // streaks of sand or wind wound round it, spinning up
      vec2 nuv = vec2(vUv.x * 2.0 + y * 1.4 - uTime * 1.1, y * 0.5 - uTime * 0.25) + seed;
      float n = texture2D(uNoise, nuv * vec2(1.0, 2.5)).r;
      float n2 = texture2D(uNoise, nuv * vec2(2.0, 6.0) + 0.3).g;
      float band = smoothstep(0.45, 0.58, n + (n2 - 0.5) * 0.3);
      float fade = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.75, 1.0, y));
      float lit = smoothstep(0.3, 0.7, ndv);
      c = mix(vCol.rgb * mix(0.62, 0.95, lit), vCol2.rgb * 1.05, band);
      a = fade * (0.22 + 0.6 * band) * (0.55 + 0.45 * (1.0 - ndv));
    } else if (kind == ${TK.FIRE}) {
      vec2 nuv = vec2(vUv.x * 3.0 + seed, y * vLen * 0.35 - uTime * 2.2);
      float n = texture2D(uNoise, nuv).g;
      float n2 = texture2D(uNoise, nuv * 2.2 + 0.4).b;
      float d = ndv * 1.1 + (n - 0.5) * 0.8 + (n2 - 0.5) * 0.3 - y * 0.55 - k * 0.3;
      float body = smoothstep(0.05, 0.11, d);
      float mid = smoothstep(0.35, 0.41, d);
      float core = smoothstep(0.62, 0.68, d);
      vec3 rim = vCol.rgb * vec3(0.95, 0.36, 0.2);
      c = mix(rim, vCol.rgb * 1.15, mid);
      c = mix(c, vCol2.rgb * 1.8, core);
      a = body;
      w = mix(w * 0.4, 0.85, core);
    } else if (kind == ${TK.DARK}) {
      // darkness boiling up: black, purple light licking round its edges
      float n = texture2D(uNoise, vec2(vUv.x * 2.0 + y * 0.8 - uTime * 0.6 + seed, y * 1.5 - uTime * 0.9)).r;
      float rim = smoothstep(0.62, 0.92, 1.0 - ndv + (n - 0.5) * 0.45);
      float hole = smoothstep(0.4, 0.55, n);
      c = mix(vec3(0.03, 0.0, 0.06), vCol2.rgb * 1.4, rim);
      a = (0.75 + 0.25 * hole + 0.3 * rim) * (1.0 - smoothstep(0.55, 1.0, y + (n - 0.5) * 0.3));
      w = rim * 0.55;
    }
    if (a < 0.004) discard;
    gl_FragColor = vfxOut(c, a * vCol.a, w);
    #include <colorspace_fragment>
  }
`;

class Instanced {
  constructor(geo, names, max, mat, order, name) {
    const g = new THREE.InstancedBufferGeometry();
    g.index = geo.index;
    for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
    this.attrs = names.map((nm) => { const a = dynAttr(max, 4, true); g.setAttribute(nm, a); return a; });
    this.arr = this.attrs.map((a) => a.array);
    g.instanceCount = 0;
    this.geo = g;
    this.max = max;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.name = name;
    this.n = 0;
  }
  begin() { this.n = 0; }
  next() { return this.n < this.max ? this.n++ : -1; }
  set(slot, i, a, b, c, d) { const A = this.arr[slot], o = i * 4; A[o] = a; A[o + 1] = b; A[o + 2] = c; A[o + 3] = d; }
  /** Scale the alpha of every instance put since index `from`. */
  fade(from, m) { const A = this.arr[2]; for (let i = from; i < this.n; i++) A[i * 4 + 3] *= m; }
  end() {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n) for (let j = 0; j < this.attrs.length; j++) upload(this.attrs[j], n);
  }
}

export class Shells extends Instanced {
  constructor(max = 160) {
    const sphere = new THREE.SphereGeometry(1, 40, 24);
    super(sphere, ['iPos', 'iAxis', 'iCol', 'iCol2', 'iPrm'], max, vfxMaterial({ vertexShader: SHELL_VS, fragmentShader: SHELL_FS }), 5, 'vfx-shells');
  }
  /**
   * A shell: kind, centre, radius, stretch along an axis (unit vector; 1 = round),
   * colour + alpha, rim/core colour + additive weight, age, seed, extra (a dome's
   * height factor; how hard a ball of fire boils).
   */
  put(kind, x, y, z, R, ax, ay, az, stretch, c, alpha, c2, w, k = 0, seed = 0, extra = 1) {
    if (!(alpha > 0.003) || !(R > 0.001)) return -1;
    const i = this.next();
    if (i < 0) return -1;
    this.set(0, i, x, y, z, R);
    this.set(1, i, ax, ay, az, stretch);
    this.set(2, i, c[0], c[1], c[2], alpha);
    this.set(3, i, c2[0], c2[1], c2[2], w);
    this.set(4, i, kind, k, seed, extra);
    return i;
  }
}

export class Tubes extends Instanced {
  constructor(max = 96) {
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 28, 14, true);
    cyl.translate(0, 0.5, 0);
    super(cyl, ['iPos', 'iDir', 'iCol', 'iCol2', 'iPrm'], max, vfxMaterial({ vertexShader: TUBE_VS, fragmentShader: TUBE_FS }), 5, 'vfx-tubes');
  }
  /** A tube from (x, y, z) along unit (dx, dy, dz) for L metres, radius r0 → r1. */
  put(kind, x, y, z, dx, dy, dz, L, r0, r1, c, alpha, c2, w, k = 0, seed = 0) {
    if (!(alpha > 0.003) || !(L > 0.01)) return -1;
    const i = this.next();
    if (i < 0) return -1;
    this.set(0, i, x, y, z, L);
    this.set(1, i, dx, dy, dz, r0);
    this.set(2, i, c[0], c[1], c[2], alpha);
    this.set(3, i, c2[0], c2[1], c2[2], w);
    this.set(4, i, kind, k, seed, r1);
    return i;
  }
}
