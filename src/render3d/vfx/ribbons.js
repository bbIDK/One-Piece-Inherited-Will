// Ribbons: polylines built on the CPU each frame and widened on the GPU —
// turned to face the camera (lightning, cut lines, speed lines, strings,
// claw rakes, cracked air, the trails behind projectiles), or laid flat on
// the ground (cracks, skid marks, gashes). One draw call for all of them.
// A ribbon's look comes from its kind: a lightning glow with a white-hot
// core, a crisp blade line, a round shaded tube (a rubber arm), a dark
// fissure with a pale lip, a soft speed line, a licking flame trail.
import * as THREE from 'three';
import { VS_COMMON, FS_COMMON, vfxMaterial, dynAttr, upload } from './kit.js';

export const RK = { GLOW: 0, LINE: 1, TUBE: 2, CRACK: 3, SPEED: 4, FIRE: 5, SMOKE: 6, THIN: 7 };
/** How a ribbon widens: toward the camera, flat on the ground, or along a given side vector. */
export const RM = { FACE: 0, FLAT: 1, SIDE: 2 };

const VS = /* glsl */`
  ${VS_COMMON}
  attribute vec4 aTan, aCol, aCol2, aPrm;
  varying vec2 vUv;
  varying vec4 vCol, vCol2;
  varying float vKind;
  void main() {
    vec3 P = position;
    float mode = aPrm.w;
    vec3 S;
    if (mode > 1.5) S = aTan.xyz;
    else {
      vec3 ref = mode > 0.5 ? vec3(0.0, 1.0, 0.0) : cameraPosition - P;
      S = cross(aTan.xyz, ref);
      float l = length(S);
      S = l > 1e-6 ? S / l : vec3(0.0, 1.0, 0.0);
    }
    float side = aTan.w > 0.0 ? 1.0 : -1.0;
    vec4 mv = viewMatrix * vec4(P + S * side * aPrm.x, 1.0);
    vUv = vec2(aPrm.y, side);
    vCol = aCol; vCol2 = aCol2; vKind = aPrm.z;
    vfxFogNear(mv);
    gl_Position = projectionMatrix * mv;
  }
`;

const FS = /* glsl */`
  ${FS_COMMON}
  varying vec2 vUv;
  varying vec4 vCol, vCol2;
  varying float vKind;
  void main() {
    int kind = int(vKind + 0.5);
    float u = vUv.x, v = abs(vUv.y);
    vec3 c = vCol.rgb;
    float a = 0.0, w = vCol2.a;
    if (kind == ${RK.GLOW}) {
      // lightning: a wide soft glow, a coloured body, a white-hot core
      float core = 1.0 - smoothstep(0.0, 0.16, v);
      float body = exp(-v * v * 9.0);
      c = mix(vCol.rgb * 1.05, vCol2.rgb * 2.4, core);
      a = max(body * 0.85, core);
      w = mix(w, 1.0, core);
    } else if (kind == ${RK.LINE}) {
      float m = 1.0 - smoothstep(0.62, 1.0, v);
      float core = 1.0 - smoothstep(0.0, 0.38, v);
      c = mix(vCol.rgb * 1.0, vCol2.rgb * 2.0, core);
      a = m;
    } else if (kind == ${RK.TUBE}) {
      // a round, cel-lit tube with an inked edge
      float sh = sqrt(max(0.0, 1.0 - v * v));
      float lit = smoothstep(0.35, 0.5, sh + (vUv.y > 0.0 ? 0.12 : -0.12));
      c = vCol.rgb * mix(0.7, 1.08, lit);
      c = mix(c, vCol2.rgb, smoothstep(0.78, 0.86, v));
      a = 1.0 - smoothstep(0.95, 1.0, v);
      w = 0.0;
    } else if (kind == ${RK.CRACK}) {
      // a fissure: a near-black split, a soft shadow either side of it, a
      // thin catch of light along one lip
      float dark = 1.0 - smoothstep(0.32, 0.52, v);
      float shade = 1.0 - smoothstep(0.55, 1.0, v);
      float lip = (1.0 - smoothstep(0.0, 0.12, abs(vUv.y - 0.62))) * 0.6;
      c = mix(vCol.rgb * 1.6, vCol.rgb, dark);
      c = mix(c, vCol2.rgb, lip * (1.0 - dark));
      a = max(dark, max(shade * 0.38, lip * 0.5));
      w = 0.0;
    } else if (kind == ${RK.SPEED}) {
      float m = 1.0 - smoothstep(0.3, 1.0, v);
      a = m * smoothstep(0.0, 0.2, u) * (1.0 - smoothstep(0.75, 1.0, u));
    } else if (kind == ${RK.FIRE}) {
      // a flame trail: bands torn by noise flowing back along it
      float n = texture2D(uNoise, vec2(u * 2.2 - uTime * 1.8, vUv.y * 0.35)).g;
      float n2 = texture2D(uNoise, vec2(u * 4.7 - uTime * 2.6, vUv.y * 0.6 + 0.3)).b;
      float d = 1.0 - v * (1.1 - 0.4 * u) + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.35 - (1.0 - u) * 0.35;
      float body = smoothstep(0.0, 0.06, d);
      float mid = smoothstep(0.25, 0.31, d);
      float core = smoothstep(0.5, 0.56, d);
      vec3 rim = vCol.rgb * vec3(0.95, 0.36, 0.2);
      c = mix(rim, vCol.rgb * 1.15, mid);
      c = mix(c, vCol2.rgb * 1.8, core);
      a = body;
      w = mix(w * 0.4, 0.85, core);
    } else if (kind == ${RK.SMOKE}) {
      float n = texture2D(uNoise, vec2(u * 1.6 - uTime * 0.2, vUv.y * 0.3)).r;
      float d = 1.0 - v + (n - 0.5) * 0.7;
      a = smoothstep(0.1, 0.3, d) * 0.7;
      w = 0.0;
    } else {
      float m = 1.0 - smoothstep(0.5, 1.0, v);
      c = mix(vCol.rgb, vCol2.rgb * 1.5, 1.0 - smoothstep(0.0, 0.4, v));
      a = m;
    }
    if (a < 0.004) discard;
    gl_FragColor = vfxOut(c, a * vCol.a, w);
    #include <colorspace_fragment>
  }
`;

const MAXP = 64; // points in one ribbon

export class Ribbons {
  constructor(maxVerts = 16384) {
    this.maxV = maxVerts;
    this.maxI = maxVerts * 3;
    const g = new THREE.BufferGeometry();
    this.pos = dynAttr(maxVerts, 3); this.tan = dynAttr(maxVerts, 4); this.col = dynAttr(maxVerts, 4);
    this.col2 = dynAttr(maxVerts, 4); this.prm = dynAttr(maxVerts, 4);
    g.setAttribute('position', this.pos); g.setAttribute('aTan', this.tan); g.setAttribute('aCol', this.col);
    g.setAttribute('aCol2', this.col2); g.setAttribute('aPrm', this.prm);
    this.idx = new THREE.BufferAttribute(new Uint16Array(this.maxI), 1);
    this.idx.setUsage(THREE.DynamicDrawUsage);
    this.idx.vfxRange = { start: 0, count: 0 };
    g.setIndex(this.idx);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = vfxMaterial({ vertexShader: VS, fragmentShader: FS });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.name = 'vfx-ribbons';
    // the ribbon being built
    this.px = new Float32Array(MAXP * 3); this.pw = new Float32Array(MAXP); this.pa = new Float32Array(MAXP);
    this.pn = 0;
    this.side = new Float32Array(3);
    this.nv = 0; this.ni = 0;
  }

  begin() { this.nv = 0; this.ni = 0; }

  /** Start a ribbon (kind, how it widens, colour + alpha, core colour + additive weight). */
  start(kind, mode, c, alpha, c2, w) {
    this.pn = 0;
    this.kind = kind; this.mode = mode; this.c = c; this.alpha = alpha; this.c2 = c2; this.w = w;
    return this;
  }
  /** For RM.SIDE ribbons: the direction they widen in. */
  sideVec(x, y, z) { this.side[0] = x; this.side[1] = y; this.side[2] = z; return this; }
  /** A point: where, half its width there, an alpha there. */
  point(x, y, z, hw, a = 1) {
    const n = this.pn;
    if (n >= MAXP) return this;
    this.px[n * 3] = x; this.px[n * 3 + 1] = y; this.px[n * 3 + 2] = z;
    this.pw[n] = hw; this.pa[n] = a;
    this.pn++;
    return this;
  }
  /** Write the ribbon (needs two points or more). */
  finish() {
    const n = this.pn;
    if (n < 2 || !(this.alpha > 0.003)) return;
    if (this.nv + n * 2 > this.maxV || this.ni + (n - 1) * 6 > this.maxI) return;
    const X = this.px, P = this.pos.array, T = this.tan.array, C = this.col.array, C2 = this.col2.array, R = this.prm.array, I = this.idx.array;
    // arc length for u
    let total = 0;
    for (let i = 1; i < n; i++) total += Math.hypot(X[i * 3] - X[i * 3 - 3], X[i * 3 + 1] - X[i * 3 - 2], X[i * 3 + 2] - X[i * 3 - 1]);
    if (!(total > 1e-5)) return;
    const c = this.c, c2 = this.c2, side = this.mode === RM.SIDE;
    let run = 0;
    const v0 = this.nv;
    for (let i = 0; i < n; i++) {
      if (i) run += Math.hypot(X[i * 3] - X[i * 3 - 3], X[i * 3 + 1] - X[i * 3 - 2], X[i * 3 + 2] - X[i * 3 - 1]);
      const a = i ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
      let tx, ty, tz;
      if (side) { tx = this.side[0]; ty = this.side[1]; tz = this.side[2]; } else { tx = X[b * 3] - X[a * 3]; ty = X[b * 3 + 1] - X[a * 3 + 1]; tz = X[b * 3 + 2] - X[a * 3 + 2]; }
      const u = run / total;
      for (let s = 0; s < 2; s++) {
        const v = this.nv++;
        const o3 = v * 3, o4 = v * 4;
        P[o3] = X[i * 3]; P[o3 + 1] = X[i * 3 + 1]; P[o3 + 2] = X[i * 3 + 2];
        T[o4] = tx; T[o4 + 1] = ty; T[o4 + 2] = tz; T[o4 + 3] = s ? 1 : -1;
        C[o4] = c[0]; C[o4 + 1] = c[1]; C[o4 + 2] = c[2]; C[o4 + 3] = this.alpha * this.pa[i];
        C2[o4] = c2[0]; C2[o4 + 1] = c2[1]; C2[o4 + 2] = c2[2]; C2[o4 + 3] = this.w;
        R[o4] = this.pw[i]; R[o4 + 1] = u; R[o4 + 2] = this.kind; R[o4 + 3] = this.mode;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = v0 + i * 2;
      I[this.ni++] = a; I[this.ni++] = a + 1; I[this.ni++] = a + 2;
      I[this.ni++] = a + 1; I[this.ni++] = a + 3; I[this.ni++] = a + 2;
    }
  }

  end() {
    const nv = this.nv, ni = this.ni;
    this.geo.setDrawRange(0, ni);
    this.mesh.visible = ni > 0;
    if (!ni) return;
    upload(this.pos, nv); upload(this.tan, nv); upload(this.col, nv); upload(this.col2, nv); upload(this.prm, nv);
    upload(this.idx, ni);
  }
}
