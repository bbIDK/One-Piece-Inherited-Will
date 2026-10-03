// Camera-facing sprites, all in one instanced draw: every particle (sparks
// stretched along their flight, flames, embers, smoke and dust puffs, drops,
// petals, bubbles...) and the billboard parts of the shapes (impact stars,
// glints, glows, air rings, storm-cloud puffs, landing flashes). Each sprite's
// look is drawn by the fragment shader from its kind — no textures but the
// shared noise — so a flame is a cel-shaded tongue of fire with a white-hot
// heart, a smoke puff a two-tone billow lit from the sun's side that frays
// away as it thins, an impact star a spiky inked burst.
import * as THREE from 'three';
import { VS_COMMON, FS_COMMON, vfxMaterial, dynAttr, upload } from './kit.js';

/** Sprite kinds (the fragment shader's switch). */
export const SK = {
  GLOW: 0, FIRE: 1, EMBER: 2, STAR: 3, BURST: 4, SMOKE: 5, DUST: 6, STREAK: 7, DROP: 8,
  RING: 9, BUBBLE: 10, PETAL: 11, SQUARE: 12, CLOUD: 13, FLASH: 14, HEART: 15, SPECK: 16,
};

const VS = /* glsl */`
  ${VS_COMMON}
  attribute vec4 iPos, iCol, iCol2, iPrm, iVel;
  varying vec2 vUv;
  varying vec4 vCol, vCol2, vPrm, vX;
  void main() {
    int kind = int(iPrm.x + 0.5);
    vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
    float size = iPos.w;
    vec2 q = position.xy;
    vUv = q;
    vec2 off;
    if (kind == ${SK.STREAK} || kind == ${SK.DROP}) {
      // stretched along the way it flies, the head at the particle
      vec3 vv = mat3(viewMatrix) * iVel.xyz;
      float sl = length(vv.xy);
      vec2 dir = sl > 1e-5 ? vv.xy / sl : vec2(0.0, 1.0);
      float L = iVel.w * clamp(sl / max(length(vv), 1e-5), 0.2, 1.0);
      L = max(L, size * 2.0);
      off = dir * (q.x * 0.5 - 0.5) * L + vec2(-dir.y, dir.x) * q.y * size;
    } else {
      // hit flashes are pulled toward the camera (keeping their size on
      // screen), so a body in between — your own, from behind — doesn't hide them
      if (iVel.w > 0.0 && kind != ${SK.RING}) {
        float d0 = length(mv.xyz), d1 = max(0.45, d0 - iVel.w);
        mv.xyz *= d1 / d0;
        size *= d1 / d0;
      }
      float c = cos(iPrm.y), s = sin(iPrm.y);
      off = mat2(c, s, -s, c) * q * size;
      // soft round things are drawn a little toward the camera, so the
      // ground doesn't slice through the bottom of a puff
      if (kind == ${SK.SMOKE} || kind == ${SK.DUST} || kind == ${SK.CLOUD} || kind == ${SK.GLOW} || kind == ${SK.FIRE} || kind == ${SK.FLASH}) {
        float d = length(mv.xyz);
        mv.xyz -= mv.xyz / max(d, 1e-4) * min(size * 0.55, max(0.0, d - 0.6));
      }
    }
    mv.xy += off;
    vCol = iCol; vCol2 = iCol2; vPrm = iPrm; vX = iVel;
    vfxFogNear(mv);
    gl_Position = projectionMatrix * mv;
  }
`;

const FS = /* glsl */`
  ${FS_COMMON}
  uniform vec3 uSunV;
  varying vec2 vUv;
  varying vec4 vCol, vCol2, vPrm, vX;
  const float TAU = 6.2831853;
  float puffLight(vec2 p, float r, float bump) {
    // a billow lit from the sun's side: two tones, cel-shaded
    vec3 n = normalize(vec3(p * 0.95, sqrt(max(0.0, 1.0 - r * r)) + 0.2));
    return smoothstep(0.0, 0.18, dot(n, uSunV) + bump);
  }
  void main() {
    int kind = int(vPrm.x + 0.5);
    float seed = vPrm.z, k = vPrm.w;
    vec2 p = vUv;
    float r = length(p);
    vec3 c = vCol.rgb;
    float a = 0.0;
    float w = vCol2.a;
    if (kind == ${SK.GLOW}) {
      float f = exp(-r * r * 4.2) * (1.0 - smoothstep(0.75, 1.0, r));
      float core = exp(-r * r * 26.0);
      c = vCol.rgb * 0.95 + vCol2.rgb * core * 1.7;
      a = f;
    } else if (kind == ${SK.FIRE}) {
      // a tongue of flame: round below, drawn up into a flickering tip; three hard bands
      vec2 nuv = vec2(p.x * 0.3, p.y * 0.24 - uTime * 0.55) + seed * 0.137;
      float n = texture2D(uNoise, nuv).g;
      float n2 = texture2D(uNoise, nuv * 2.3 + 0.5).b;
      vec2 s = vec2(p.x * (1.0 + max(p.y, 0.0) * 0.5), p.y < 0.0 ? p.y * 1.25 : p.y * 0.68);
      float d = 1.0 - length(s) + (n - 0.5) * 0.8 + (n2 - 0.5) * 0.3 - k * 0.38;
      float body = smoothstep(0.0, 0.05, d);
      float mid = smoothstep(0.24, 0.29, d);
      float core = smoothstep(0.47, 0.52, d);
      vec3 rim = vCol.rgb * vec3(0.9, 0.3, 0.16);
      c = mix(rim, vCol.rgb * 1.15, mid);
      c = mix(c, vCol2.rgb * 1.7, core);
      a = body;
      w = mix(w * 0.3, 0.8, core);
    } else if (kind == ${SK.EMBER}) {
      float f = 1.0 - smoothstep(0.15, 1.0, r);
      float fl = 0.6 + 0.4 * sin(uTime * 38.0 + seed * 13.0);
      c = vCol.rgb * 1.6 * fl + vec3(0.5) * exp(-r * r * 12.0);
      a = f;
    } else if (kind == ${SK.STAR}) {
      // a four-point glint: two long thin rays, two shorter diagonals, a soft heart
      vec2 ap = abs(p);
      float ray = max(exp(-ap.y * 26.0) * (1.0 - ap.x), exp(-ap.x * 26.0) * (1.0 - ap.y));
      vec2 dp = vec2(p.x + p.y, p.x - p.y) * 0.7071;
      vec2 ad = abs(dp);
      float diag = max(exp(-ad.y * 34.0) * (1.0 - ad.x * 1.8), exp(-ad.x * 34.0) * (1.0 - ad.y * 1.8)) * 0.6;
      float disc = exp(-r * r * 14.0);
      float f = max(max(ray, diag), disc);
      c = mix(vCol.rgb * 1.0, vCol2.rgb * 2.1, smoothstep(0.35, 1.0, f));
      a = clamp(f, 0.0, 1.0) * (1.0 - smoothstep(0.9, 1.0, r));
    } else if (kind == ${SK.BURST}) {
      // the impact star: spikes of random length round a white-hot heart, inked round the edge
      float n = max(vX.x, 5.0);
      float ang = atan(p.y, p.x) + 3.14159;
      float sec = ang / TAU * n;
      float i = floor(sec + 0.5);
      float d = abs(sec - i) * 2.0;
      float len = mix(0.6, 1.0, hash1(seed + mod(i, n) * 7.13));
      float inner = 0.3 + 0.08 * hash1(seed + 3.1);
      float edge = mix(len, inner, pow(d, 0.8));
      float aa = 0.025;
      float body = 1.0 - smoothstep(edge - aa, edge + aa, r);
      float ink = 1.0 - smoothstep(edge + 0.035 - aa, edge + 0.035 + aa, r);
      float cedge = mix(len * 0.62, inner * 0.62, pow(d, 0.8));
      float core = 1.0 - smoothstep(cedge - aa, cedge + aa, r);
      c = mix(vCol.rgb * 1.05, vCol2.rgb * 2.2, core);
      c = mix(vec3(0.07, 0.04, 0.05), c, body);
      a = max(body, ink * 0.85);
      w = mix(0.0, mix(0.25, 0.9, core), body);
    } else if (kind == ${SK.SMOKE} || kind == ${SK.DUST} || kind == ${SK.CLOUD}) {
      bool dust = kind == ${SK.DUST}, cloud = kind == ${SK.CLOUD};
      vec2 q = dust ? vec2(p.x, p.y * 1.25 + 0.12) : p;
      float rq = length(q);
      vec2 nuv = q * (cloud ? 0.16 : 0.24) + seed * 0.31 + vec2(0.0, -uTime * 0.025);
      float n = texture2D(uNoise, nuv).r;
      float cell = texture2D(uNoise, q * (cloud ? 0.2 : 0.3) + seed * 0.17).a;
      float d = 1.0 - rq * (0.82 + 0.32 * cell) + (n - 0.5) * 0.45;
      float th = (dust ? 0.16 : 0.1) + pow(k, 1.5) * (dust ? 0.6 : 0.55);
      float m = smoothstep(th, th + 0.07, d);
      float lit = puffLight(q, min(rq, 1.0), (cell - 0.5) * 0.35);
      // two tones (the lit side lifted toward white a little, so dark smoke still reads as billows)
      vec3 shade = cloud ? vec3(0.55, 0.55, 0.66) : dust ? vec3(0.74, 0.7, 0.68) : vec3(0.7, 0.72, 0.82);
      vec3 hi = cloud ? vCol.rgb * 1.9 + 0.1 : vCol.rgb * 1.18 + 0.08;
      c = mix(vCol.rgb * shade, hi, lit);
      a = m * (cloud ? 0.95 : dust ? 0.6 : 0.78);
    } else if (kind == ${SK.STREAK}) {
      // a spark: a spindle, white-hot along its middle, tapering off behind
      float t = p.x * 0.5 + 0.5;
      float wd = mix(0.3, 1.0, t);
      float ac = abs(p.y) / wd;
      float m = (1.0 - smoothstep(0.6, 1.0, ac)) * smoothstep(0.0, 0.3, t) * (1.0 - smoothstep(0.93, 1.0, t));
      float core = (1.0 - smoothstep(0.0, 0.55, ac)) * t;
      c = mix(vCol.rgb * 1.0, vCol2.rgb * 2.2, core);
      a = m;
    } else if (kind == ${SK.DROP}) {
      float t = p.x * 0.5 + 0.5;
      float wd = mix(0.35, 1.0, smoothstep(0.0, 0.8, t));
      float ac = abs(p.y) / wd;
      float m = (1.0 - smoothstep(0.75, 1.0, ac)) * smoothstep(0.0, 0.35, t) * (1.0 - smoothstep(0.9, 1.0, t));
      float hl = (1.0 - smoothstep(0.0, 0.5, abs(p.y - 0.3 * wd) / wd)) * smoothstep(0.5, 0.9, t);
      c = mix(vCol.rgb, vec3(1.2), hl * 0.8);
      a = m * 0.9;
    } else if (kind == ${SK.RING}) {
      // a ring in the air (round a fist, a muzzle): crisp, brighter along its middle
      float th = atan(p.y, p.x);
      float R = 0.8 * (1.0 + vX.y * sin(th * max(vX.z, 1.0) + uTime * 40.0));
      float wd = max(vX.x, 0.03);
      float dd = abs(r - R);
      float m = 1.0 - smoothstep(wd * 0.5, wd * 0.5 + 0.035, dd);
      float core = (1.0 - smoothstep(0.0, wd * 0.3, dd)) * vX.w;
      c = mix(vCol.rgb * 1.0, vCol2.rgb * 1.8, core);
      a = m;
    } else if (kind == ${SK.BUBBLE}) {
      float m = 1.0 - smoothstep(0.06, 0.12, abs(r - 0.86));
      float hl = exp(-dot(p - vec2(-0.35, 0.38), p - vec2(-0.35, 0.38)) * 40.0);
      c = mix(vCol.rgb, vec3(1.3), hl);
      a = max(m, hl) + 0.12 * (1.0 - smoothstep(0.8, 0.9, r));
    } else if (kind == ${SK.PETAL}) {
      float e = length(vec2(p.x, p.y * 2.1));
      a = 1.0 - smoothstep(0.86, 1.0, e);
      c = vCol.rgb * mix(1.12, 0.8, smoothstep(0.2, 1.0, e));
    } else if (kind == ${SK.SQUARE}) {
      float e = max(abs(p.x), abs(p.y));
      a = 1.0 - smoothstep(0.9, 1.0, e);
      c = mix(vec3(0.1, 0.07, 0.07), vCol.rgb, step(e, 0.74));
    } else if (kind == ${SK.SPECK}) {
      float e = max(abs(p.x), abs(p.y));
      a = 1.0 - smoothstep(0.7, 1.0, e);
      c = vCol.rgb * mix(0.8, 1.1, step(p.y, 0.0));
    } else if (kind == ${SK.FLASH}) {
      float f = 1.0 - smoothstep(0.55, 1.0, r);
      c = vCol.rgb * 1.0 + vCol2.rgb * exp(-r * r * 9.0) * 1.3;
      a = f * (0.55 + 0.45 * exp(-r * r * 6.0));
    } else if (kind == ${SK.HEART}) {
      vec2 h = vec2(abs(p.x) * 1.1, p.y * 1.1 + 0.25);
      float dh = h.y - sqrt(max(0.0, abs(h.x) * (1.0 - abs(h.x)) * 1.6)) * 0.95;
      float m = 1.0 - smoothstep(0.0, 0.06, length(vec2(h.x * 1.2, dh)) - 0.62);
      a = m;
      c = vCol.rgb * 1.3;
    }
    if (a < 0.004) discard;
    gl_FragColor = vfxOut(c, a * vCol.a, w);
    #include <colorspace_fragment>
  }
`;

export class Sprites {
  constructor(max = 1400) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = dynAttr(max, 4, true); this.col = dynAttr(max, 4, true); this.col2 = dynAttr(max, 4, true);
    this.prm = dynAttr(max, 4, true); this.xtra = dynAttr(max, 4, true);
    g.setAttribute('iPos', this.pos); g.setAttribute('iCol', this.col); g.setAttribute('iCol2', this.col2);
    g.setAttribute('iPrm', this.prm); g.setAttribute('iVel', this.xtra);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = vfxMaterial({ vertexShader: VS, fragmentShader: FS });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'vfx-sprites';
    this.n = 0;
    this.P = this.pos.array; this.C = this.col.array; this.C2 = this.col2.array; this.R = this.prm.array; this.V = this.xtra.array;
  }

  begin() { this.n = 0; }

  /**
   * One sprite: kind, centre, size (half-width, m), colour (linear [r,g,b]) and
   * alpha, core colour and additive weight (0 covers … 1 adds light), screen
   * rotation, seed, age (0..1). Returns its index (for vel()), or -1 when full.
   */
  put(kind, x, y, z, size, c, alpha, c2, w, rot = 0, seed = 0, k = 0) {
    const i = this.n;
    if (i >= this.max || !(alpha > 0.003) || !(size > 0.001)) return -1;
    this.n++;
    const o = i * 4;
    const P = this.P, C = this.C, C2 = this.C2, R = this.R, V = this.V;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = size;
    C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2]; C[o + 3] = alpha;
    C2[o] = c2[0]; C2[o + 1] = c2[1]; C2[o + 2] = c2[2]; C2[o + 3] = w;
    R[o] = kind; R[o + 1] = rot; R[o + 2] = seed; R[o + 3] = k;
    V[o] = 0; V[o + 1] = 0; V[o + 2] = 0; V[o + 3] = 0;
    return i;
  }

  /** Extra per-sprite data: a velocity and streak length (sparks, drops), or the kind's own parameters. */
  vel(i, a, b, c, d) {
    if (i < 0) return;
    const o = i * 4, V = this.V;
    V[o] = a; V[o + 1] = b; V[o + 2] = c; V[o + 3] = d;
  }

  end() {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    upload(this.pos, n); upload(this.col, n); upload(this.col2, n); upload(this.prm, n); upload(this.xtra, n);
  }
}
