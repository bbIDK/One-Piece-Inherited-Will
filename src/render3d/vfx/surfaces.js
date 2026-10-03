// Surfaces: triangles laid out on the CPU each frame in their final place,
// all in one draw call — the crescent smears of blades, fists and feet (a
// cupped band swept through the air, white-hot along its leading edge), the
// bands and walls of shockwaves running along the ground, and everything
// painted on the ground itself, following its rise and fall: cracks' scorch
// and soot, stains, wind-up warnings, the floors of area techniques, swirls,
// landing flashes. Ground-hugging pieces take their heights from a little
// grid of samples taken once per effect (see HeightPatch).
import * as THREE from 'three';
import { VS_COMMON, FS_COMMON, vfxMaterial, dynAttr, upload } from './kit.js';

export const SF = { SMEAR: 0, BAND: 1, WALL: 2, STAIN: 3, SCORCH: 4, GLOW: 5, TELE: 6, ZONE: 7, SWIRL: 8, PANEL: 9, FILL: 10, FROST: 11 };
/** Zone floor patterns (SF.ZONE's parameter). */
export const ZK = { field: 0, plant: 1, smoke: 2, dark: 3, gravity: 4, ice: 5, storm: 6, thunder: 7, meteor: 7, fists: 7, arms: 7, cage: 7 };

const VS = /* glsl */`
  ${VS_COMMON}
  attribute vec4 aUv, aCol, aCol2, aPrm;
  varying vec4 vUv, vCol, vCol2, vPrm;
  void main() {
    vec4 mv = viewMatrix * vec4(position, 1.0);
    vUv = aUv; vCol = aCol; vCol2 = aCol2; vPrm = aPrm;
    vfxFogNear(mv);
    gl_Position = projectionMatrix * mv;
  }
`;

const FS = /* glsl */`
  ${FS_COMMON}
  varying vec4 vUv, vCol, vCol2, vPrm;
  const float TAU = 6.2831853;
  void main() {
    int kind = int(vPrm.x + 0.5);
    float k = vPrm.y, seed = vPrm.z, prm = vPrm.w;
    vec3 c = vCol.rgb;
    float a = 0.0, w = vCol2.a;
    vec2 q = vUv.xy;
    if (kind == ${SF.SMEAR}) {
      // u: tail (0) → head (1); v: the outer, leading rim (0) → inner edge (1);
      // below 0, the glow of the air it cuts just outside the rim
      float u = q.x, v = q.y;
      float body = smoothstep(0.0, 0.45, u) * mix(0.55, 1.0, smoothstep(0.4, 0.9, u));
      if (v < 0.0) {
        float g = 1.0 + v / 0.35;
        c = vCol.rgb * 0.9;
        a = body * g * g * 0.45;
        w = mix(w, 1.0, 0.5);
      } else {
        // solid from the rim in, fraying out toward the inner edge
        float ln = texture2D(uNoise, vec2(v * 0.55 + seed, u * 0.05)).b;
        float inner = 1.0 - smoothstep(0.45 + 0.25 * ln, 1.0, v);
        float rim = (1.0 - smoothstep(0.0, 0.16, v)) * smoothstep(0.2, 0.9, u);
        // speed lines streaming along the arc
        float lines = mix(0.72, 1.1, smoothstep(0.45, 0.6, ln));
        c = mix(vCol.rgb * 0.95 * lines, vCol2.rgb * 2.0, rim);
        a = body * inner * mix(0.88, 1.0, rim);
        w = mix(w, 1.0, rim);
      }
    } else if (kind == ${SF.BAND}) {
      float v = abs(q.y);
      float m = 1.0 - smoothstep(0.5, 1.0, v);
      float core = (1.0 - smoothstep(0.0, 0.32, v)) * vUv.z;
      c = mix(vCol.rgb * 1.0, vCol2.rgb * 1.8, core);
      a = m;
    } else if (kind == ${SF.WALL}) {
      // a shockwave's wall: bright where it runs along the ground, streaked, thinning upward
      float v = q.y;
      float n = texture2D(uNoise, vec2(q.x * 7.0 + seed, v * 0.4 - uTime * 0.9)).g;
      float up = pow(1.0 - v, 1.7);
      float base = 1.0 - smoothstep(0.0, 0.16, v);
      c = mix(vCol.rgb * 0.9, vCol2.rgb * 1.6, base * vUv.z);
      a = up * mix(0.45, 1.0, smoothstep(0.3, 0.7, n)) * (1.0 - smoothstep(0.85, 1.0, v));
    } else {
      // things on the ground: q is the spot in the effect's own frame (-1..1 across)
      float r = length(q);
      if (kind == ${SF.STAIN}) {
        float n = texture2D(uNoise, q * 0.35 + seed).r;
        a = (1.0 - smoothstep(0.45, 1.0, r + (n - 0.5) * 0.35)) * 0.9;
        w = 0.0;
      } else if (kind == ${SF.SCORCH}) {
        float n = texture2D(uNoise, q * 0.5 + seed).r;
        float cell = texture2D(uNoise, q * 0.45 + seed * 1.7).a;
        float rr = r + (n - 0.5) * 0.3;
        float soot = 1.0 - smoothstep(0.35, 1.0, rr);
        // glowing veins of embers in the burn, cooling off
        float hot = clamp(1.0 - k * 2.2, 0.0, 1.0);
        float vein = (1.0 - smoothstep(0.03, 0.12, cell)) * smoothstep(0.15, 0.6, rr) * (1.0 - smoothstep(0.85, 1.0, rr)) * hot;
        float glow = (1.0 - smoothstep(0.0, 0.7, rr)) * hot * hot * 0.5;
        c = mix(vCol.rgb, vCol2.rgb * 2.4, max(vein, glow));
        a = max(soot * 0.82, vein);
        w = max(vein, glow) * 0.9;
      } else if (kind == ${SF.GLOW}) {
        a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.8, 1.0, r));
        c = vCol.rgb * 1.4 + vCol2.rgb * exp(-r * r * 14.0) * 1.5;
      } else if (kind == ${SF.FILL}) {
        a = 1.0 - smoothstep(0.96, 1.0, r);
      } else if (kind == ${SF.FROST}) {
        float cell = texture2D(uNoise, q * 0.7 + seed).a;
        float n = texture2D(uNoise, q * 0.4 + seed * 2.0).r;
        float edge = 1.0 - smoothstep(0.02, 0.09, cell);
        float body = 1.0 - smoothstep(0.55, 1.0, r + (n - 0.5) * 0.4);
        c = mix(vCol.rgb, vec3(1.3, 1.4, 1.5), edge);
        a = body * mix(0.35, 0.95, edge);
        w = edge * 0.4;
      } else if (kind == ${SF.TELE}) {
        // a wind-up warning: the area, filling as the blow comes, its edge pulsing
        float pulse = 0.5 + 0.5 * sin(uTime * 22.0);
        float fillIn = 1.0 - (1.0 - k) * (1.0 - k) * (1.0 - k);
        // inside the area, the part filled in so far, the distance (m) to its edge
        float inside, prog, edgeD;
        if (prm < 0.5) { // circle (e2: its radius)
          inside = 1.0 - smoothstep(0.985, 1.0, r);
          prog = 1.0 - smoothstep(fillIn - 0.01, fillIn + 0.01, r);
          edgeD = abs(r - 1.0) * vUv.w;
        } else if (prm < 1.5) { // arc, q.x along the facing (e1: half its angle, e2: its radius)
          float th = abs(atan(q.y, q.x)), half_ = vUv.z;
          float wedge = 1.0 - smoothstep(half_ - 0.004, half_ + 0.004, th);
          inside = (1.0 - smoothstep(0.985, 1.0, r)) * wedge;
          prog = inside * (1.0 - smoothstep(fillIn - 0.01, fillIn + 0.01, r));
          float dRim = th < half_ ? abs(r - 1.0) * vUv.w : 9.0;
          float dSide = (r < 1.0 && th < half_ + 0.4) ? r * abs(sin(th - half_)) * vUv.w : 9.0;
          edgeD = min(dRim, dSide);
        } else { // line: along 0..1, across −1..1 (e1: half its width, e2: its length)
          float along = vUv.x;
          inside = step(0.0, along) * step(along, 1.0);
          prog = step(along, fillIn) * inside;
          edgeD = min((1.0 - abs(q.y)) * vUv.z, min(along, 1.0 - along) * vUv.w);
          // chevrons pointing the way
          float ch = fract(along * max(1.0, vUv.w / 1.5) - uTime * 2.0);
          float chev = 1.0 - smoothstep(0.0, 0.06, abs(ch - 0.5 - abs(q.y) * 0.25));
          prog = max(prog, chev * 0.6 * inside);
        }
        float edge = 1.0 - smoothstep(0.03, 0.08, edgeD);
        a = min(1.0, inside * (0.14 + 0.12 * k) + prog * (0.24 + 0.3 * k) + edge * (0.6 + 0.4 * pulse * k));
        c = mix(vCol.rgb * 0.85, vCol.rgb * 1.3 + 0.12, edge);
      } else if (kind == ${SF.SWIRL} || kind == ${SF.ZONE}) {
        float th = atan(q.y, q.x);
        int zk = kind == ${SF.ZONE} ? int(prm + 0.5) : -1;
        if (kind == ${SF.SWIRL} || zk == ${ZK.dark} || zk == ${ZK.storm}) {
          // spiral arms wound in toward the middle
          float arms = max(vUv.z, 2.0);
          // logarithmic spiral arms (th − b·ln r constant along an arm), turning
          float sp = (th - 2.4 * log(max(r, 0.03)) - vUv.w) * arms / TAU;
          float arm = 1.0 - smoothstep(0.18, 0.5, abs(fract(sp) - 0.5) * 2.0);
          float body = (1.0 - smoothstep(0.75, 1.0, r)) * smoothstep(0.0, 0.12, r);
          bool dark = zk == ${ZK.dark} || prm < -0.5;
          if (dark) {
            // a pool of darkness: near black, the spiral faintly lit in it,
            // a ragged edge with a thin bright fringe, pitch black at the heart
            float n = texture2D(uNoise, q * 0.6 + vec2(uTime * 0.05, seed)).r;
            float rr = r + (n - 0.5) * 0.18;
            float pool = 1.0 - smoothstep(0.8, 0.97, rr);
            float rim = 1.0 - smoothstep(0.0, 0.045, abs(rr - 0.87));
            float hole = 1.0 - smoothstep(0.28, 0.4, r);
            c = mix(vCol2.rgb, vCol.rgb * 1.25, arm * 0.8);
            c = mix(c, vec3(0.0), hole);
            c = mix(c, vCol.rgb * 1.8, rim);
            a = max(max(pool * mix(0.8, 0.97, arm), hole), rim * 0.9);
            w = (arm * 0.3 + rim * 0.6) * (1.0 - hole);
          } else {
            a = body * (0.16 + 0.55 * arm);
            c = mix(vCol.rgb, vCol2.rgb * 1.3, arm);
          }
        } else if (zk == ${ZK.gravity}) {
          float ripple = 0.0;
          for (int i = 0; i < 3; i++) {
            float ph = fract(uTime * 0.9 + float(i) / 3.0);
            ripple = max(ripple, (1.0 - smoothstep(0.0, 0.04, abs(r - (1.0 - ph)))) * ph);
          }
          float rim = 1.0 - smoothstep(0.0, 0.05, abs(r - 0.97));
          a = (1.0 - smoothstep(0.96, 1.0, r)) * 0.22 + rim * 0.6 + ripple * 0.5;
          c = mix(vCol.rgb, vCol2.rgb * 1.6, max(rim, ripple));
        } else if (zk == ${ZK.ice}) {
          float cell = texture2D(uNoise, q * 1.1 + seed).a;
          float edge = 1.0 - smoothstep(0.02, 0.08, cell);
          float rim = 1.0 - smoothstep(0.0, 0.05, abs(r - 0.97));
          a = (1.0 - smoothstep(0.94, 1.0, r)) * (0.34 + 0.5 * edge) + rim * 0.5;
          c = mix(vCol.rgb, vec3(1.3, 1.4, 1.5), max(edge, rim));
          w = edge * 0.3;
        } else {
          // a field: drifting blotches, a soft edge
          float n = texture2D(uNoise, q * 0.45 + vec2(uTime * 0.02, seed)).r;
          float rim = 1.0 - smoothstep(0.0, 0.05, abs(r - 0.97));
          float blot = smoothstep(0.5, 0.62, n);
          a = (1.0 - smoothstep(0.94, 1.0, r)) * (0.14 + 0.2 * blot) + rim * 0.5;
          c = mix(vCol.rgb, vCol2.rgb * 1.4, rim);
        }
      } else if (kind == ${SF.PANEL}) {
        // a hexagon-celled barrier: q.x across (-1..1), q.y up (0..1)
        vec2 h = vec2(q.x * 3.2, q.y * 4.2);
        vec2 r2 = vec2(1.0, 1.732);
        vec2 ha = mod(h, r2) - r2 * 0.5, hb = mod(h - r2 * 0.5, r2) - r2 * 0.5;
        vec2 g = dot(ha, ha) < dot(hb, hb) ? ha : hb;
        vec2 ag = abs(g);
        float hexd = max(dot(ag, normalize(vec2(1.0, 1.732))), ag.x);
        float cellEdge = smoothstep(0.38, 0.47, hexd);
        float border = max(smoothstep(0.86, 0.98, abs(q.x)), max(1.0 - smoothstep(0.0, 0.06, q.y), smoothstep(0.92, 1.0, q.y)));
        float shim = 0.5 + 0.5 * sin(uTime * 6.0 + q.y * 9.0 + q.x * 4.0);
        a = 0.14 + 0.1 * shim + cellEdge * 0.45 + border * 0.7;
        c = mix(vCol.rgb, vCol2.rgb * 1.8, max(border, cellEdge * 0.6));
      }
    }
    if (a < 0.004) discard;
    gl_FragColor = vfxOut(c, a * vCol.a, w);
    #include <colorspace_fragment>
  }
`;

export class Surfaces {
  constructor(maxVerts = 24000) {
    this.maxV = maxVerts;
    this.maxI = maxVerts * 3;
    const g = new THREE.BufferGeometry();
    this.pos = dynAttr(maxVerts, 3); this.uv = dynAttr(maxVerts, 4); this.col = dynAttr(maxVerts, 4);
    this.col2 = dynAttr(maxVerts, 4); this.prm = dynAttr(maxVerts, 4);
    g.setAttribute('position', this.pos); g.setAttribute('aUv', this.uv); g.setAttribute('aCol', this.col);
    g.setAttribute('aCol2', this.col2); g.setAttribute('aPrm', this.prm);
    this.idx = new THREE.BufferAttribute(new Uint16Array(this.maxI), 1);
    this.idx.setUsage(THREE.DynamicDrawUsage);
    this.idx.vfxRange = { start: 0, count: 0 };
    g.setIndex(this.idx);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = vfxMaterial({ vertexShader: VS, fragmentShader: FS, polygonOffset: true });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'vfx-surfaces';
    this.nv = 0; this.ni = 0;
    this.cur = { kind: 0, c: null, alpha: 1, c2: null, w: 0, k: 0, seed: 0, prm: 0 };
  }

  begin() { this.nv = 0; this.ni = 0; }

  /** The look of the vertices that follow. */
  style(kind, c, alpha, c2, w, k = 0, seed = 0, prm = 0) {
    const s = this.cur;
    s.kind = kind; s.c = c; s.alpha = alpha; s.c2 = c2; s.w = w; s.k = k; s.seed = seed; s.prm = prm;
    return this;
  }
  /** Room for n more vertices and m more triangles? */
  room(n, m) { return this.nv + n <= this.maxV && this.ni + m * 3 <= this.maxI; }
  /** A vertex in the current style: where, its (u, v, e1, e2), an alpha factor. Returns its index. */
  vert(x, y, z, u, v, e1 = 0, e2 = 0, am = 1) {
    const i = this.nv++, o3 = i * 3, o4 = i * 4, s = this.cur;
    const P = this.pos.array, U = this.uv.array, C = this.col.array, C2 = this.col2.array, R = this.prm.array;
    P[o3] = x; P[o3 + 1] = y; P[o3 + 2] = z;
    U[o4] = u; U[o4 + 1] = v; U[o4 + 2] = e1; U[o4 + 3] = e2;
    C[o4] = s.c[0]; C[o4 + 1] = s.c[1]; C[o4 + 2] = s.c[2]; C[o4 + 3] = s.alpha * am;
    C2[o4] = s.c2[0]; C2[o4 + 1] = s.c2[1]; C2[o4 + 2] = s.c2[2]; C2[o4 + 3] = s.w;
    R[o4] = s.kind; R[o4 + 1] = s.k; R[o4 + 2] = s.seed; R[o4 + 3] = s.prm;
    return i;
  }
  /** Triangles of a grid of vertices laid down row by row (cols × rows). */
  grid(v0, cols, rows) {
    const I = this.idx.array;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = v0 + j * cols + i, b = a + 1, c = a + cols, d = c + 1;
        I[this.ni++] = a; I[this.ni++] = c; I[this.ni++] = b;
        I[this.ni++] = b; I[this.ni++] = c; I[this.ni++] = d;
      }
    }
  }

  /** Scale the alpha of every vertex written since vertex `from`. */
  fade(from, m) {
    const C = this.col.array;
    for (let i = from; i < this.nv; i++) C[i * 4 + 3] *= m;
  }

  end() {
    const nv = this.nv, ni = this.ni;
    this.geo.setDrawRange(0, ni);
    this.mesh.visible = ni > 0;
    if (!ni) return;
    upload(this.pos, nv); upload(this.uv, nv); upload(this.col, nv); upload(this.col2, nv); upload(this.prm, nv);
    upload(this.idx, ni);
  }
}

/**
 * The ground under an effect: heights sampled on an n × n grid over a square
 * (once, while the effect stays put), read back bilinearly.
 */
export class HeightPatch {
  constructor(n = 9) {
    this.n = n;
    this.h = new Float32Array(n * n);
    this.x = NaN; this.y = NaN; this.R = 0; this.world = null;
  }
  /** Sample round (x, y) (world tiles), R metres each way, if it isn't already. */
  at(view, x, y, R) {
    const w = view.world;
    if (this.world === w && Math.abs(this.x - x) < 0.05 && Math.abs(this.y - y) < 0.05 && this.R >= R && this.R < R * 1.6 + 0.5) return this;
    this.world = w; this.x = x; this.y = y; this.R = R;
    const n = this.n, h = this.h, step = (2 * R) / (n - 1);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) h[j * n + i] = view.ground(w.wx(x - R + i * step), y - R + j * step);
    }
    return this;
  }
  /** Ground height at an offset (dx, dy) metres from the middle. */
  get(dx, dy) {
    const n = this.n, R = this.R, fx = Math.max(0, Math.min(n - 1.001, ((dx + R) / (2 * R)) * (n - 1))), fy = Math.max(0, Math.min(n - 1.001, ((dy + R) / (2 * R)) * (n - 1)));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, h = this.h;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
}
