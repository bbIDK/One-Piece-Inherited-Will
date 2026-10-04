// A terraced city in 3D (see world/terraces.js — Water 7): the stone of it
// and the water running down it. The ground itself (each level's paving, the
// stairways' slopes) is the terrain's; here, round every level, its retaining
// wall — sandstone in courses under a pale cornice, a balustrade along the
// top — the stairways' flights of steps and their parapets, and the water
// from the great fountain: running in the stone gutters across each level,
// pouring over every corner to the level below in a sheet, churning white
// where it lands, and on into the canals at the foot.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { vcMat } from './props/mats.js';
import { Mesher, box } from './props/kit.js';
import { terraceTile } from '../world/terraces.js';

const STONE = new THREE.Color('#d9c7a1'), COURSE = new THREE.Color('#b79f76'), CORNICE = new THREE.Color('#f1e6cc'), PLINTH = new THREE.Color('#a48d68');
const RAIL = new THREE.Color('#f4ecda'), STEP = new THREE.Color('#cdbb95'), RISER = new THREE.Color('#b29a72'), GUTTER = new THREE.Color('#bfae8a');
const WALL_T = 1.2; // (how far out from a level's edge its wall stands: it covers the face tiles)

// ------------------------------------------------------------ the water's look
const VERT = /* glsl */`
  attribute float aKind;
  attribute float aT;
  varying vec2 vUv;
  varying float vKind;
  varying float vT;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv; vKind = aKind; vT = aT;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAG = /* glsl */`
  uniform float uTime;
  uniform float uDay;
  varying vec2 vUv;
  varying float vKind;
  varying float vT;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    float t = uTime;
    vec3 deep = vec3(0.07, 0.42, 0.66), light = vec3(0.42, 0.8, 0.94), foamC = vec3(0.94, 0.99, 1.0);
    vec3 col; float a;
    if (vKind < 0.5) {
      // a gutter: the water running along it (uv: across 0..1, along in metres), white against its sides
      float run = t * 2.4;
      float s = noise(vec2(vUv.x * 5.0, vUv.y * 0.8 - run)) * 0.6 + noise(vec2(vUv.x * 13.0, vUv.y * 2.2 - run * 1.5)) * 0.4;
      float side = 1.0 - smoothstep(0.0, 0.2, min(vUv.x, 1.0 - vUv.x));
      col = mix(deep, light, smoothstep(0.32, 0.78, s));
      col = mix(col, foamC, smoothstep(0.66, 0.86, s + side * 0.38) * 0.85);
      // (and white as it tips over the lip)
      col = mix(col, foamC, smoothstep(0.75, 1.0, vT) * 0.7);
      a = 0.94;
    } else if (vKind < 1.5 || vKind > 3.5) {
      // a falling sheet: streaks racing down it (uv.y metres fallen), thin and bright at its edges
      // (a ring of it round a fountain's bowl, kind 4, has none), white where it lands
      float run = t * 6.5;
      float s = noise(vec2(vUv.x * 8.0, vUv.y * 0.9 - run)) * 0.55 + noise(vec2(vUv.x * 21.0, vUv.y * 2.6 - run * 1.3)) * 0.45;
      col = mix(light * 1.05, foamC, smoothstep(0.42, 0.8, s));
      col = mix(col, foamC, smoothstep(0.7, 1.0, vT) * 0.8);
      float edge = vKind > 3.5 ? 1.0 : smoothstep(0.0, 0.16, min(vUv.x, 1.0 - vUv.x));
      a = (0.5 + 0.45 * s) * edge * (0.75 + 0.25 * vT);
    } else if (vKind > 2.5) {
      // a basin's still water (uv in metres): rings spreading where the fountain falls in, glints
      float r = length(vUv);
      float ring = 0.5 + 0.5 * sin(r * 2.6 - t * 2.4);
      float s = noise(vUv * 0.7 + vec2(t * 0.15, -t * 0.1)) * 0.6 + noise(vUv * 2.1 - t * 0.3) * 0.4;
      col = mix(deep, light, smoothstep(0.35, 0.8, s * 0.7 + ring * 0.35));
      col = mix(col, foamC, smoothstep(0.86, 0.97, s + ring * 0.12) * 0.7);
      a = 0.9;
    } else {
      // where it lands: churning foam, spreading and thinning out
      vec2 q = vUv - 0.5;
      float r = length(q) * 2.0;
      float s = noise(q * 6.0 + vec2(t * 0.9, -t * 0.6)) * 0.55 + noise(q * 15.0 - vec2(t * 1.7, t * 1.1)) * 0.45;
      col = mix(light, foamC, smoothstep(0.3, 0.68, s + (1.0 - r) * 0.35));
      a = (1.0 - smoothstep(0.55, 1.0, r)) * (0.65 + 0.3 * s);
    }
    // (unlit: kept under the bloom's threshold, post.js, or the white water
    // would glow like the sun — a halo over every fall and the fountain)
    col *= mix(0.3, 0.84, uDay);
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }
`;

let waterMat = null;
const U = { uTime: { value: 0 }, uDay: { value: 1 } };
function water() {
  if (waterMat) return waterMat;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(uniforms, U);
  waterMat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return waterMat;
}
/** The water's material and clock (the Great Fountain's water is the same: props/landmarks.js). */
export function terraceWater() { return water(); }

/** A growing set of water triangles: position, uv, kind, how far along (0..1). */
class Water {
  constructor() { this.p = []; this.uv = []; this.k = []; this.t = []; this.i = []; }
  v(x, y, z, u, w, k, t) { this.p.push(x, y, z); this.uv.push(u, w); this.k.push(k); this.t.push(t); return this.p.length / 3 - 1; }
  quad(a, b, c, d) { this.i.push(a, b, c, b, d, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.k, 1));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(this.t, 1));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------ the stone
/** Points round a level's edge, every ~1 m (and every 6° round its corners): { x, y, nx, ny } about the terrace's middle. */
function perimeter(l) {
  const out = [];
  const cx = l.ax - l.rc, cy = l.ay - l.rc;
  // four straight sides and four arcs, anticlockwise from the east side's south end
  const legs = [
    [cx, -cy, cx, cy, 1, 0, 0], [cx, cy, -cx, cy, 0, 1, Math.PI / 2], [-cx, cy, -cx, -cy, -1, 0, Math.PI], [-cx, -cy, cx, -cy, 0, -1, -Math.PI / 2],
  ];
  for (const [x0, y0, x1, y1, nx, ny, a0] of legs) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L));
    for (let i = 0; i < n; i++) {
      const s = i / n;
      out.push({ x: x0 + (x1 - x0) * s + nx * l.rc, y: y0 + (y1 - y0) * s + ny * l.rc, nx, ny });
    }
    // the corner after this side, round (x1, y1)
    const m = 15;
    for (let i = 0; i < m; i++) {
      const a = a0 + (i / m) * (Math.PI / 2);
      out.push({ x: x1 + Math.cos(a) * l.rc, y: y1 + Math.sin(a) * l.rc, nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
  return out;
}

/**
 * Lay a band of quads (a list of rows of [x, y, z]) into geometry arrays,
 * coloured per row; `nrm` the normal down each column ([x, y, z] per point
 * along the band, the same in every row).
 */
function band(M, rows, cols, nrm) {
  const base = M.pos.length / 3;
  const R = rows.length, N = rows[0].length;
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < N; i++) {
      const p = rows[j][i], n = nrm[i];
      M.pos.push(p[0], p[1], p[2]); M.nor.push(n[0], n[1], n[2]);
      const c = cols[j]; M.col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = base + j * N + i, b = a + 1, c = a + N, d = c + 1;
      M.idx.push(a, c, b, b, c, d);
    }
  }
}

function geometryOf(M) {
  const g = new THREE.BufferGeometry();
  const n = M.pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(M.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(M.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(M.col, 3));
  g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  g.setIndex(M.idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * The stone of terrace T, about its middle (x east, z south, y up): walls,
 * cornices, parapets and pillars round every level; the stairways' steps,
 * parapets and end walls; the gutters' kerbs. `ground(dx, dy)` is the land's
 * height at the foot.
 */
function stoneOf(T, ground) {
  const M = { pos: [], nor: [], col: [], idx: [] };
  const k = new Mesher();
  const wallAt = (x, y) => terraceTile(T, Math.floor(T.x + x), Math.floor(T.y + y)) === 'wall';
  T.L.forEach((l, lev) => {
    const top = l.h + 0.02;
    const lips = T.falls.filter((f) => f.k === lev);
    const pts = perimeter(l);
    // runs of the edge where the wall stands (not where a stairway's landing opens through it)
    const runs = [];
    let run = null;
    pts.forEach((p, i) => {
      const on = wallAt(p.x + p.nx * 0.5, p.y + p.ny * 0.5);
      if (on) { if (!run) runs.push(run = []); run.push(i); } else run = null;
    });
    // (the run round the end of the list joins up with the first)
    if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1].at(-1) === pts.length - 1) runs[0] = runs.pop().concat(runs[0]);
    else if (runs.length === 1 && runs[0].length === pts.length) runs[0].push(0);
    for (const r of runs) {
      const P = r.map((i) => pts[i]);
      const foot = P.map((p) => (lev ? T.L[lev - 1].h : ground(p.x + p.nx * (WALL_T + 0.6), p.y + p.ny * (WALL_T + 0.6))) - 0.35);
      const at = (p, o, y) => [p.x + p.nx * o, y, p.y + p.ny * o];
      const nOut = P.map((p) => [p.nx, 0, p.ny]), nUp = P.map(() => [0, 1, 0]);
      // the cap (level with the paving) out to the wall's face
      band(M, [P.map((p) => at(p, -0.05, top)), P.map((p) => at(p, WALL_T, top))], [CORNICE, CORNICE], nUp);
      // the cornice: a pale ledge standing out a little under the top
      band(M, [P.map((p) => at(p, WALL_T, top)), P.map((p) => at(p, WALL_T + 0.18, top - 0.12)), P.map((p) => at(p, WALL_T + 0.18, top - 0.42)), P.map((p) => at(p, WALL_T, top - 0.5))],
        [CORNICE, CORNICE, CORNICE, CORNICE], nOut);
      // the face, in courses (a dark line every 1.1 m)
      const rows = [], cols = [];
      const H = Math.max(...P.map((p, i) => top - 0.5 - foot[i]));
      const nC = Math.max(1, Math.round(H / 1.1));
      for (let c = 0; c <= nC; c++) {
        const f = c / nC;
        rows.push(P.map((p, i) => at(p, WALL_T, top - 0.5 - (top - 0.5 - foot[i]) * f)));
        cols.push(STONE);
        if (c > 0 && c < nC) { rows.push(P.map((p, i) => at(p, WALL_T, top - 0.5 - (top - 0.5 - foot[i]) * f - 0.07))); cols.push(COURSE); rows.push(P.map((p, i) => at(p, WALL_T, top - 0.5 - (top - 0.5 - foot[i]) * f - 0.075))); cols.push(STONE); }
      }
      band(M, rows, cols, nOut);
      // the plinth: a battered course at the foot, sloping out to the ground
      band(M, [P.map((p, i) => at(p, WALL_T, foot[i] + 0.9)), P.map((p, i) => at(p, WALL_T + 0.45, foot[i] - 0.1))], [PLINTH, PLINTH], P.map((p) => [p.nx * 0.9, 0.45, p.ny * 0.9]));
      // the balustrade: a low parapet with a coping, broken where the water pours over
      let seg = [];
      const flush = () => {
        if (seg.length > 1) {
          const nI = seg.map((p) => [-p.nx, 0, -p.ny]);
          band(M, [seg.map((p) => at(p, 0.72, top)), seg.map((p) => at(p, 0.72, top + 0.55))], [RAIL, RAIL], nI);
          band(M, [seg.map((p) => at(p, 0.62, top + 0.55)), seg.map((p) => at(p, 1.12, top + 0.55))], [RAIL, RAIL], seg.map(() => [0, 1, 0]));
          band(M, [seg.map((p) => at(p, 1.02, top + 0.55)), seg.map((p) => at(p, 1.02, top))], [RAIL, RAIL], seg.map((p) => [p.nx, 0, p.ny]));
        }
        seg = [];
      };
      P.forEach((p, i) => {
        const nearLip = lips.some((f) => Math.hypot(p.x - f.x, p.y - f.y) < 2.3);
        if (nearLip) { flush(); return; }
        seg.push(p);
        // (a pillar every three metres or so)
        if (i % 3 === 0) k.add(box(0.36, 0.78, 0.36), { at: [p.x + p.nx * 0.87, top, p.y + p.ny * 0.87], rot: [0, -Math.atan2(p.ny, p.nx), 0], color: RAIL, outline: 0.02 });
      });
      flush();
    }
  });
  // the stairways: their steps, the parapet along the open side and the wall closing the top end
  for (const r of T.ramps) {
    const l = T.L[r.k];
    const lo = r.lo, hi = r.hi;
    const flight = r.a1 - r.land - r.a0, n = Math.max(4, Math.round((hi - lo) / 0.2));
    const X = (b) => r.side * (l.ax + b), Y = (along) => along * r.up;
    const footAt = (b, along) => (r.k ? lo : ground(X(b), Y(along)));
    for (let i = 0; i < n; i++) {
      const a0 = r.a0 + (flight * i) / n, a1 = r.a0 + (flight * (i + 1)) / n;
      const ytop = lo + ((hi - lo) * (i + 1)) / n;
      const yb = Math.min(footAt(2.5, (a0 + a1) / 2), lo) - 0.3;
      k.add(box(3.0, ytop - yb, a1 - a0 + 0.02), { at: [X(2.5), yb, Y((a0 + a1) / 2)], color: (i % 2 ? STEP : RISER), flat: true });
    }
    // the landing
    k.add(box(3.0, 0.5, r.land), { at: [X(2.5), hi - 0.48, Y(r.a1 - r.land / 2)], color: STEP, flat: true });
    // the parapet on the open side, stepping up with the flight (and along the landing)
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const s0 = r.a0 + ((r.a1 - r.a0) * i) / segs, s1 = r.a0 + ((r.a1 - r.a0) * (i + 1)) / segs;
      const h0 = lo + (hi - lo) * Math.min(1, Math.max(0, (s1 - r.a0) / flight));
      const yb = Math.min(footAt(4.5, (s0 + s1) / 2), lo) - 0.3;
      k.add(box(1.0, h0 + 0.9 - yb, s1 - s0 + 0.02), { at: [X(4.5), yb, Y((s0 + s1) / 2)], color: i % 2 ? STONE : COURSE, flat: true });
      k.add(box(1.16, 0.12, s1 - s0 + 0.04), { at: [X(4.5), h0 + 0.9, Y((s0 + s1) / 2)], color: RAIL, flat: true });
    }
    // the wall closing the top end of the landing
    const ybEnd = Math.min(footAt(2.5, r.a1 + 0.5), lo) - 0.3;
    k.add(box(5.2, hi + 0.9 - ybEnd, 1.0), { at: [X(2.4), ybEnd, Y(r.a1 + 0.5)], color: STONE, flat: true, outline: 0.03 });
    k.add(box(5.36, 0.12, 1.16), { at: [X(2.4), hi + 0.9, Y(r.a1 + 0.5)], color: RAIL, flat: true });
  }
  // the gutters' kerbs
  for (const c of T.chans) {
    const dx = c.bx - c.ax, dy = c.by - c.ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const h = T.L[c.k].h, hw = T.gutter.hw;
    for (const s of [-1, 1]) {
      const ox = -uy * s * (hw + 0.12), oy = ux * s * (hw + 0.12);
      k.add(box(0.26, 0.2, L), { at: [(c.ax + c.bx) / 2 + ox, h - 0.12, (c.ay + c.by) / 2 + oy], rot: [0, Math.atan2(dx, dy), 0], color: GUTTER, flat: true });
    }
  }
  const walls = new THREE.Mesh(geometryOf(M), vcMat({ side: THREE.DoubleSide }));
  const bits = new THREE.Mesh(k.build(false), vcMat());
  for (const m of [walls, bits]) { m.castShadow = true; m.receiveShadow = true; }
  const g = new THREE.Group();
  g.add(walls, bits);
  return g;
}

// ------------------------------------------------------------ the water
function waterOf(T) {
  const W = new Water();
  const R2 = Math.SQRT1_2;
  // the gutters, from the fountain (or the fall above) to the lip — and on over the wall's cap
  for (const c of T.chans) {
    const dx = c.bx - c.ax, dy = c.by - c.ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const hw = T.gutter.hw - 0.08, y = T.L[c.k].h - 0.13;
    const n = Math.max(2, Math.ceil(L / 2));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = (L * i) / n, x = c.ax + ux * s, z = c.ay + uy * s;
      const a = W.v(x - uy * hw, y, z + ux * hw, 0, s, 0, i / n), b = W.v(x + uy * hw, y, z - ux * hw, 1, s, 0, i / n);
      if (prev) W.quad(prev[0], prev[1], a, b);
      prev = [a, b];
    }
    // (over the cap to its edge, a little higher, as it tips)
    const a = W.v(c.bx - uy * hw + c.sx * R2 * 0.05, y + 0.15, c.by + ux * hw + c.sy * R2 * 0.05, 0, L, 0, 0.9), b = W.v(c.bx + uy * hw + c.sx * R2 * 0.05, y + 0.15, c.by - ux * hw + c.sy * R2 * 0.05, 1, L, 0, 0.9);
    const ex = c.sx * R2 * WALL_T, ey = c.sy * R2 * WALL_T;
    const a2 = W.v(c.bx - uy * hw + ex, y + 0.17, c.by + ux * hw + ey, 0, L + WALL_T, 0, 1), b2 = W.v(c.bx + uy * hw + ex, y + 0.17, c.by - ux * hw + ey, 1, L + WALL_T, 0, 1);
    W.quad(prev[0], prev[1], a, b);
    W.quad(a, b, a2, b2);
  }
  // the falls: a sheet over each corner, arcing out from the wall and down to the level below (or the canal)
  for (const f of T.falls) {
    const nx = f.sx * R2, ny = f.sy * R2, tx = -ny, ty = nx;
    const top = f.top + 0.15, drop = top - f.foot;
    const U = 6, V = 14, half = T.gutter.hw - 0.05;
    const idx = [];
    for (let j = 0; j <= V; j++) {
      const v = j / V, out = WALL_T + 0.05 + 1.6 * Math.sqrt(v) * Math.sqrt(drop / 6), y = top - drop * v, w = half * (1 + 0.3 * v);
      const row = [];
      for (let i = 0; i <= U; i++) {
        const u = i / U, s = (u - 0.5) * 2 * w;
        row.push(W.v(f.x + nx * out + tx * s, y, f.y + ny * out + ty * s, u, drop * v, 1, v));
      }
      idx.push(row);
    }
    for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) W.quad(idx[j][i], idx[j][i + 1], idx[j + 1][i], idx[j + 1][i + 1]);
    // the foam where it lands
    const fx = f.x + nx * (WALL_T + 0.05 + 1.6 * Math.sqrt(drop / 6)), fz = f.y + ny * (WALL_T + 0.05 + 1.6 * Math.sqrt(drop / 6));
    const fy = (f.k ? f.foot - 0.1 : 0.04), r = 2.6;
    const a = W.v(fx - r, fy, fz - r, 0, 0, 2, 0), b = W.v(fx + r, fy, fz - r, 1, 0, 2, 0), c = W.v(fx - r, fy, fz + r, 0, 1, 2, 0), d = W.v(fx + r, fy, fz + r, 1, 1, 2, 0);
    W.quad(a, b, c, d);
  }
  const m = new THREE.Mesh(W.build(), water());
  m.renderOrder = 3;
  return m;
}

// ------------------------------------------------------------ in the scene
const views = new Map(); // terrace → group
let root = null;

registerFrameHook((env, ctx) => {
  const game = ctx.game, v = game?.view3d, w = ctx.world;
  if (!root) { root = new THREE.Group(); root.name = 'terraces'; ctx.scene.add(root); }
  const list = (w && w === game?.world && w.zone === 0 && w.terraces) || [];
  for (const [T, g] of views) {
    if (list.includes(T)) continue;
    g.removeFromParent();
    g.traverse((o) => o.geometry?.dispose());
    views.delete(T);
  }
  U.uTime.value = (env.time || 0) % 3600;
  U.uDay.value = env.daylight ?? 1;
  if (!v || !list.length) return;
  const px = game.player?.x ?? v.ox, py = game.player?.y ?? v.oy;
  for (const T of list) {
    let g = views.get(T);
    const near = w.distance(px, py, T.x, T.y) < 1100;
    if (!near) { if (g) g.visible = false; continue; }
    if (!g) {
      // (the land at the wall's foot, as the terrain has it)
      const ground = (dx, dy) => (ctx.terrain ? ctx.terrain(T.x + dx, T.y + dy) : T.base);
      g = new THREE.Group();
      g.name = 'terrace';
      g.add(stoneOf(T, ground), waterOf(T));
      views.set(T, g);
      root.add(g);
    }
    g.visible = true;
    g.position.set(w.dx(v.ox, T.x), 0, T.y - v.oy);
  }
}, 'terraces');
