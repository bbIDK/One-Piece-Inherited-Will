// Geometry toolkit for the 3D characters: every rigid part of a character
// (head, hair, hat, torso, limbs, hands, feet…) is merged into ONE skinned
// geometry with per-vertex colours, rigidly bound to a bone per part, so a
// whole character draws in a couple of calls. Parts are made from a few
// primitives (tapered capsules, lathes, parametric caps, spheres, cones…)
// placed with a matrix.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

// ------------------------------------------------------------------ colours
const LIN = new Map();
/** A hex/rgb colour string → a linear THREE.Color (cached). */
export function lin(c) {
  let k = LIN.get(c);
  if (k) return k;
  k = new THREE.Color();
  try { k.set(c || '#888888'); } catch { k.set('#888888'); }
  LIN.set(c, k);
  return k;
}

// ------------------------------------------------------------------ matrices
/** Matrix from position, Euler rotation (x, y, z) and scale (number or [x, y, z]). */
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  _p.set(px, py, pz);
  _e.set(rx, ry, rz, 'XYZ');
  _q.setFromEuler(_e);
  if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.set(s, s, s);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
/** Matrix that puts a unit primitive's +Y axis from point a to point b (scaled: radius r across, length |ab|). */
export function between(a, b, rx, rz = rx, extra = 0) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length() || 1e-4;
  d.divideScalar(L);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  _s.set(rx, L + extra, rz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
export const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);

// ---------------------------------------------------------------- primitives
const PRIM = new Map();
function prim(key, make) {
  let g = PRIM.get(key);
  if (!g) { g = make(); PRIM.set(key, g); }
  return g;
}
export const Prim = {
  sphere: (w = 10, h = 7) => prim(`s${w}.${h}`, () => new THREE.SphereGeometry(1, w, h)),
  /** unit cylinder, height 1 centred on the origin along +Y */
  cyl: (r = 8, open = false) => prim(`c${r}.${open}`, () => new THREE.CylinderGeometry(1, 1, 1, r, 1, open)),
  /** truncated cone: bottom radius 1, top radius t, height 1 centred */
  frustum: (t, r = 8) => prim(`f${t}.${r}`, () => new THREE.CylinderGeometry(t, 1, 1, r, 1, false)),
  /** cone, apex at +0.5, base radius 1 at -0.5 */
  cone: (r = 6) => prim(`k${r}`, () => new THREE.ConeGeometry(1, 1, r, 1)),
  torus: (t = 0.3, r = 6, s = 12) => prim(`t${t}.${r}.${s}`, () => new THREE.TorusGeometry(1, t, r, s)),
  /** an ear (see earGeo): the right one, unit half-height */
  ear: (hi = true) => prim(`ear${hi ? 1 : 0}`, () => earGeo(hi)),
  /** a flat box (hard edges; for tiny details only) */
  box: () => prim('box', () => new THREE.BoxGeometry(2, 2, 2)),
  /** a rounded box of half-size 1 (smooth normals so outlines stay closed) */
  rbox: (k = 0.35, w = 8, h = 6) => prim(`rb${k}.${w}.${h}`, () => {
    const g = new THREE.SphereGeometry(1, w, h);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      const f = (x) => Math.sign(x) * Math.pow(Math.abs(x), k);
      _v.set(f(_v.x), f(_v.y), f(_v.z));
      p.setXYZ(i, _v.x, _v.y, _v.z);
    }
    g.computeVertexNormals();
    return g;
  }),
};

// ------------------------------------------------------------ ears
// An ear as a shell: its D-shaped outline (full and round behind, flatter
// in front where it joins the cheek, narrowing to the lobe) with, across it,
// the profile of the rim curling over (the helix), the groove inside it, the
// ridge (antihelix) and the bowl (concha) in the middle. +X forward, +Y up,
// +Z out from the head; unit half-height.
const EAR_PROF = [[0, 0], [0.85, 0], [1, 0.12], [0.97, 0.3], [0.84, 0.34], [0.74, 0.22], [0.6, 0.27], [0.4, 0.14], [0, 0.08]];
const EAR_PROF_LO = [[0, 0], [1, 0.12], [0.9, 0.32], [0.62, 0.24], [0, 0.08]];
export const EAR_CEN = [0.08, -0.12];
function earOutline(a) {
  const c = Math.cos(a), s = Math.sin(a);
  let x = c * (c > 0 ? 0.42 : 0.62), y = s * (s > 0 ? 1 : 0.92);
  if (s < 0) x *= 1 - 0.35 * -s * (c < 0 ? 0.6 : 1); // (the lobe)
  x -= 0.12 * Math.max(0, s); // (the top sweeps back)
  return [x, y];
}
function earGeo(hi) {
  const prof = hi ? EAR_PROF : EAR_PROF_LO, U = hi ? 14 : 8, V = prof.length - 1, T = 1.0;
  const g = grid((u, v) => {
    const [r, z] = prof[Math.round(v * V)];
    const [x, y] = earOutline(u * Math.PI * 2);
    return [EAR_CEN[0] + (x - EAR_CEN[0]) * r, EAR_CEN[1] + (y - EAR_CEN[1]) * r, z * T];
  }, U, V);
  // (smooth across the seam, and at the two centres where a whole row meets in a point)
  const n = g.attributes.normal, W = U + 1, a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let j = 0; j <= V; j++) {
    a.fromBufferAttribute(n, j * W); b.fromBufferAttribute(n, j * W + U); a.add(b).normalize();
    n.setXYZ(j * W, a.x, a.y, a.z); n.setXYZ(j * W + U, a.x, a.y, a.z);
  }
  for (const j of [0, V]) {
    a.set(0, 0, 0);
    for (let i = 0; i <= U; i++) a.add(b.fromBufferAttribute(n, j * W + i));
    a.normalize();
    for (let i = 0; i <= U; i++) n.setXYZ(j * W + i, a.x, a.y, a.z);
  }
  return g;
}

// ------------------------------------------------------------ parametric
/**
 * A BufferGeometry from a grid of points fn(u, v) → [x, y, z, (u, v)].
 * Outward faces when u runs around from +X toward +Z and v runs downward
 * (the way the head, hair caps and face decal are parametrised).
 */
export function grid(fn, U, V, uv = false) {
  // (whole numbers of columns and rows: a fraction throws the indices off)
  U = Math.max(1, Math.round(U)); V = Math.max(1, Math.round(V));
  const pos = [], uvs = [], idx = [];
  for (let j = 0; j <= V; j++) {
    for (let i = 0; i <= U; i++) {
      const p = fn(i / U, j / V);
      pos.push(p[0], p[1], p[2]);
      if (uv) uvs.push(p[3] ?? i / U, p[4] ?? 1 - j / V);
    }
  }
  const W = U + 1;
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < U; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Surface of revolution around +Y: profile [[radius, y], …] from bottom to
 * top (or any order), `segs` around, optional partial sweep (phi0 at +X going
 * toward -Z… i.e. three.js lathe convention rotated so phi = 0 faces +X).
 * `flip` turns it inside out (linings).
 */
export function lathe(profile, segs = 10, phi0 = 0, phiLen = Math.PI * 2, flip = false) {
  const pos = [], idx = [];
  const closed = Math.abs(phiLen - Math.PI * 2) < 1e-6;
  const U = segs;
  for (let j = 0; j < profile.length; j++) {
    const [r, y] = profile[j];
    for (let i = 0; i <= U; i++) {
      const a = phi0 + (i / U) * phiLen;
      // phi = 0 → +X (forward), phi = 90° → +Z (right)
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  const W = U + 1;
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < U; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      // outward normals for a profile going up (y increasing)
      if (!flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closed) weldSeam(g, U, profile.length);
  return g;
}
/** Average the normals across a closed lathe's seam (no shading crease). */
function weldSeam(g, U, rows) {
  const n = g.attributes.normal;
  const W = U + 1;
  for (let j = 0; j < rows; j++) {
    const a = j * W, b = j * W + U;
    _n.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, _n.x, _n.y, _n.z); n.setXYZ(b, _n.x, _n.y, _n.z);
  }
}

/**
 * Tapered capsule from (0, 0, 0) down to (0, -L, 0): radius r0 at the top
 * joint, r1 at the bottom one (rounded ends), `rs` segments around.
 */
export function tcap(r0, r1, L, rs = 8, cap = 3) {
  const prof = [];
  // bottom hemisphere (from the pole up), then the top one
  for (let k = 0; k <= cap; k++) {
    const a = -Math.PI / 2 + (k / cap) * Math.PI / 2;
    prof.push([Math.cos(a) * r1 + 1e-5, -L + Math.sin(a) * r1]);
  }
  for (let k = 0; k <= cap; k++) {
    const a = (k / cap) * Math.PI / 2;
    prof.push([Math.cos(a) * r0 + 1e-5, Math.sin(a) * r0]);
  }
  return lathe(prof, rs);
}

// ---------------------------------------------------------------- builder
/**
 * Accumulates geometry: positions, normals, linear vertex colours, up to two
 * bones per vertex with weights, detail-texture UVs and a "part" tag the body
 * shader uses to recolour forearms/shins (Diable Jambe) and hide parts in
 * first person — and, set after building, each limb's "reach" (how far up
 * the arm or leg a vertex is: how far Armament Haki has spread over it).
 *
 * Parts are made in their bone's own frame (a limb hanging down -Y from its
 * joint). With `bind` (a rest matrix per bone, see bones.js bindPose) they
 * are stored where they sit in the rest pose, and a part can blend into a
 * neighbouring bone near a joint — elbows, knees, shoulders, hips, the waist
 * and the neck bend smoothly instead of like a jointed doll.
 */
export class Builder {
  constructor(bind = null, blankUV = [0, 0]) {
    this.pos = []; this.nor = []; this.col = []; this.bone = []; this.bone2 = []; this.w2 = []; this.part = []; this.idx = []; this.uv = [];
    // (optional, per vertex: which limb, and how far up it — see build.js limbReach)
    this.limb = null;
    this.x4 = new Map();
    this.bind = bind;
    this.blankUV = blankUV;
  }
  get count() { return this.pos.length / 3; }
  /** The rest matrix of a bone (set for bones placed while building, e.g. finger joints). */
  setBind(bone, m) { if (this.bind) this.bind[bone] = m; }

  /**
   * Add geometry `g` transformed by matrix `m`. `color` is a colour string /
   * THREE.Color, or fn(x, y, z) of the primitive's local position → colour.
   * opts: { uv: use g's own uv attribute as detail-texture UVs,
   *         blend: fn(x, y, z) of the position in the bone's frame → [bone2, weight2] or null,
   *         skin: fn(x, y, z) → [bone1, bone2, weight2], or up to four bones
   *               [b1, b2, b3, b4, w2, w3, w4]: the bones it follows instead
   *               (still placed from `bone`'s frame) }
   */
  add(g, m, color, bone = 0, part = 0, opts = null) {
    const P = g.attributes.position, N = g.attributes.normal;
    const UV = (opts && opts.uv) || (g.userData && g.userData.detail) ? g.attributes.uv : null;
    const blend = opts && opts.blend, skin = opts && opts.skin;
    const base = this.count;
    _nm.getNormalMatrix(m);
    const fn = typeof color === 'function' ? color : null;
    const c0 = fn ? null : (color && color.isColor ? color : lin(color));
    const bm = this.bind && this.bind[bone];
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i);
      const c = fn ? toColor(fn(_v.x, _v.y, _v.z)) : c0;
      _v.applyMatrix4(m);
      const sk = skin ? skin(_v.x, _v.y, _v.z) : null;
      const bw = sk ? [sk[1], sk[2]] : blend ? blend(_v.x, _v.y, _v.z) : null;
      if (bm) _v.applyMatrix4(bm);
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(c.r, c.g, c.b);
      this.bone.push(sk ? sk[0] : bone);
      if (sk && sk.length > 3) {
        // (four bones: the third and fourth are kept aside, for the few vertices that have them)
        this.bone2.push(sk[1]); this.w2.push(sk[4]);
        this.x4.set(base + i, [sk[2], sk[5], sk[3], sk[6]]);
      } else if (bw && bw[1] > 1e-3) { this.bone2.push(bw[0]); this.w2.push(Math.min(1, bw[1])); } else { this.bone2.push(0); this.w2.push(0); }
      this.part.push(part);
      if (UV) this.uv.push(UV.getX(i), UV.getY(i)); else this.uv.push(this.blankUV[0], this.blankUV[1]);
    }
    const flip = m.determinant() < 0;
    if (g.index) {
      const a = g.index.array;
      for (let k = 0; k < a.length; k += 3) {
        if (flip) this.idx.push(base + a[k], base + a[k + 2], base + a[k + 1]);
        else this.idx.push(base + a[k], base + a[k + 1], base + a[k + 2]);
      }
    } else {
      for (let k = 0; k < P.count; k += 3) {
        if (flip) this.idx.push(base + k, base + k + 2, base + k + 1);
        else this.idx.push(base + k, base + k + 1, base + k + 2);
      }
    }
    return this;
  }

  /** A BufferGeometry ready for a SkinnedMesh (one or two bones per vertex, detail UVs). */
  build() {
    const n = this.count;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const w2 = this.w2[i];
      si[i * 4] = this.bone[i]; sw[i * 4] = 1 - w2;
      si[i * 4 + 1] = this.bone2[i]; sw[i * 4 + 1] = w2;
    }
    for (const [i, [b3, w3, b4, w4]] of this.x4) {
      si[i * 4 + 2] = b3; sw[i * 4 + 2] = w3;
      si[i * 4 + 3] = b4; sw[i * 4 + 3] = w4;
      sw[i * 4] = Math.max(0, 1 - sw[i * 4 + 1] - w3 - w4);
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    if (this.limb) g.setAttribute('aLimb', new THREE.Float32BufferAttribute(this.limb, 1));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  /** A plain (non-skinned) geometry: position, normal, colour. */
  buildStatic() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
function toColor(c) { return c && c.isColor ? c : lin(c); }

export { THREE };
