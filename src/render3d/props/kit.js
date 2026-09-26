// Geometry kit for the 3D world objects. A model is built by appending simple
// primitives (boxes, cylinders, cones, blobs, ribbons, lathes…) through a
// canvas-like transform stack into ONE merged, vertex-coloured geometry, so a
// whole prop costs a single draw call. Options per primitive:
//   color    hex / '#rrggbb' / THREE.Color / fn(p, n) → Color (per vertex)
//   tint     1 = recoloured by the instance colour (foliage, candy, stone…)
//   glow     emissive colour at night (lamp glass, lit windows, lanterns)
//   flicker  0..1 how much that glow flickers (fires, lanterns)
//   flat     faceted normals (rocks, crystals, planks)
//   outline  thickness in metres of an anime outline: an inverted hull baked
//            into the same geometry (no extra draw call)
//   normals  fn(p, n) → Vector3: override the lighting normal (canopies use
//            normals radiating from the crown so they shade like one mass)
//   double   also add the back faces (thin leaves, sails, flags)
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const OUTLINE = new THREE.Color(0x1d130c);

/** Build-time switches: KIT.noOutline builds the far (distance LOD) variant of a model. */
export const KIT = { noOutline: false };

/** Build a model twice: as-is and without outlines (for far cells). */
export function withFar(build) {
  const near = build();
  KIT.noOutline = true;
  let far;
  try { far = build(); } finally { KIT.noOutline = false; }
  return { near, far };
}

/** Anything colour-like → a THREE.Color (linear working space). */
export function C(c) {
  if (c && c.isColor) return c;
  if (Array.isArray(c)) return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  return new THREE.Color(c ?? 0xffffff);
}

/** Lighten (k > 0) or darken (k < 0) a colour in sRGB, like the 2D shade(). */
const WHITE = new THREE.Color(1, 1, 1);
export function shade(c, k) {
  const s = C(c).clone().convertLinearToSRGB();
  if (k < 0) s.multiplyScalar(1 + k); else s.lerp(WHITE, k);
  return s.convertSRGBToLinear();
}

/** Mix two colours (sRGB space). */
export function mix(a, b, t) {
  const x = C(a).clone().convertLinearToSRGB();
  const y = C(b).clone().convertLinearToSRGB();
  return x.lerp(y, t).convertSRGBToLinear();
}

/** Deterministic hash → [0, 1). */
export function hash(a, b = 0, c = 0) {
  let h = Math.imul((a * 1000) | 0, 374761393) ^ Math.imul((b * 1000) | 0, 668265263) ^ Math.imul((c * 1000) | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A tiny seeded random generator. */
export function rng(seed) {
  let s = (Math.floor(seed * 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ------------------------------------------------------------------ primitives
// All "standing" primitives have their base at y = 0 (so they stack easily).

export function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

/** Box centred on the origin. */
export function cbox(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

export function cyl(rTop, rBot, h, seg = 8, open = false, hSeg = 1) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, hSeg, open);
  g.translate(0, h / 2, 0);
  return g;
}

export function cone(r, h, seg = 8, open = false, hSeg = 1) { return cyl(0, r, h, seg, open, hSeg); }

/** Low-poly sphere (icosphere). */
export function blob(r, detail = 1) { return new THREE.IcosahedronGeometry(r, detail); }

export function sphere(r, ws = 8, hs = 6, phiStart = 0, phiLen = Math.PI * 2, thStart = 0, thLen = Math.PI) {
  return new THREE.SphereGeometry(r, ws, hs, phiStart, phiLen, thStart, thLen);
}

/** Lathe from [radius, y] pairs (bottom to top). */
export function lathe(pts, seg = 10) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
}

export function torus(R, r, rs = 6, ts = 12, arc = Math.PI * 2) { return new THREE.TorusGeometry(R, r, rs, ts, arc); }

/** Extrude a 2D shape (x right, y up) by `depth` along +z, centred on z. */
export function extrude(shape, depth, bevel = 0, curveSegments = 6) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A tube along a curve. */
export function tube(curve, segs = 8, r = 0.1, radial = 6) { return new THREE.TubeGeometry(curve, segs, r, radial, false); }

/**
 * A ribbon through points [[x, y, z, halfWidth], ...] whose width runs along
 * `side` (default: horizontal, perpendicular to the path). `fold` raises the
 * centre line (a V-shaped leaf).
 */
export function ribbon(pts, { side = null, fold = 0 } = {}) {
  const pos = [], idx = [];
  const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    let s = side ? new THREE.Vector3(...side) : new THREE.Vector3(-t.z, 0, t.x);
    if (s.lengthSq() < 1e-6) s = new THREE.Vector3(1, 0, 0);
    s.normalize().multiplyScalar(pts[i][3]);
    const up = new THREE.Vector3().crossVectors(s, t).normalize().multiplyScalar(-fold * pts[i][3]);
    pos.push(P[i].x - s.x, P[i].y - s.y, P[i].z - s.z);
    pos.push(P[i].x + up.x, P[i].y + up.y, P[i].z + up.z);
    pos.push(P[i].x + s.x, P[i].y + s.y, P[i].z + s.z);
  }
  for (let i = 0; i < P.length - 1; i++) {
    const a = i * 3, b = (i + 1) * 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat quad in the XY plane (w × h), base at y = 0, facing +z. */
export function quad(w, h, ws = 1, hs = 1) {
  const g = new THREE.PlaneGeometry(w, h, ws, hs);
  g.translate(0, h / 2, 0);
  return g;
}

/** A disc in the XZ plane facing up. */
export function disc(r, seg = 12) {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A 2D polygon [[x, y], ...] extruded into a slab (x right, y up, thickness along z). */
export function slab(points, depth, bevel = 0) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return extrude(s, depth, bevel);
}

// ---------------------------------------------------------------------- mesher

export class Mesher {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.tnt = []; this.glw = []; this.idx = [];
    this.m = new THREE.Matrix4();
    this.stack = [];
  }

  get vertexCount() { return this.pos.length / 3; }

  save() { this.stack.push(this.m.clone()); return this; }
  restore() { this.m.copy(this.stack.pop()); return this; }
  translate(x, y, z) { this.m.multiply(new THREE.Matrix4().makeTranslation(x, y, z)); return this; }
  rotateX(a) { this.m.multiply(new THREE.Matrix4().makeRotationX(a)); return this; }
  rotateY(a) { this.m.multiply(new THREE.Matrix4().makeRotationY(a)); return this; }
  rotateZ(a) { this.m.multiply(new THREE.Matrix4().makeRotationZ(a)); return this; }
  scale(x, y = x, z = x) { this.m.multiply(new THREE.Matrix4().makeScale(x, y, z)); return this; }
  transform(m) { this.m.multiply(m); return this; }

  /**
   * Append a primitive. o.at = [x, y, z] and o.rot = [rx, ry, rz] (applied Y, X, Z)
   * and o.scale place it relative to the current transform.
   */
  add(geo, o = {}) {
    let g = geo;
    if (o.flat) { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); }
    else if (o.split && g.index) g = g.toNonIndexed(); // per-face colours, smooth normals
    if (!g.attributes.normal) g.computeVertexNormals();
    const M = this.m.clone();
    if (o.at) M.multiply(new THREE.Matrix4().makeTranslation(o.at[0], o.at[1], o.at[2]));
    if (o.rot) M.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rot[0] || 0, o.rot[1] || 0, o.rot[2] || 0, 'YXZ')));
    if (o.scale !== undefined) {
      const s = o.scale;
      M.multiply(new THREE.Matrix4().makeScale(Array.isArray(s) ? s[0] : s, Array.isArray(s) ? s[1] : s, Array.isArray(s) ? s[2] : s));
    }
    _m3.getNormalMatrix(M);
    const P = g.attributes.position, NA = g.attributes.normal;
    const base = this.pos.length / 3;
    // o.attrs: keep the source geometry's own colour / tint / glow (e.g. a ship hull reused as a wreck)
    const sC = o.attrs ? g.attributes.color : null, sT = o.attrs ? g.attributes.tint : null, sG = o.attrs ? g.attributes.glow : null;
    const mul = o.colorMul ?? 1;
    const cfn = typeof o.color === 'function' ? o.color : null;
    const cc = cfn ? null : C(o.color ?? 0xffffff);
    const _sc = new THREE.Color();
    const tfn = typeof o.tint === 'function' ? o.tint : null;
    const tint = o.tint ? 1 : 0;
    const gl = o.glow ? C(o.glow) : null;
    const fl = o.flicker || 0;
    const geomN = o.outline && !KIT.noOutline ? new Float32Array(P.count * 3) : null;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(M);
      _n.fromBufferAttribute(NA, i).applyMatrix3(_m3).normalize();
      if (geomN) { geomN[i * 3] = _n.x; geomN[i * 3 + 1] = _n.y; geomN[i * 3 + 2] = _n.z; }
      const c = sC ? _sc.fromBufferAttribute(sC, i) : cfn ? C(cfn(_v, _n, i)) : cc;
      const n = o.normals ? o.normals(_v, _n) : _n;
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(c.r * mul, c.g * mul, c.b * mul);
      this.tnt.push(sT ? sT.getX(i) : tfn ? tfn(_v, _n, i) : tint);
      if (sG) this.glw.push(sG.getX(i), sG.getY(i), sG.getZ(i), sG.getW(i));
      else if (gl) this.glw.push(gl.r, gl.g, gl.b, fl); else this.glw.push(0, 0, 0, 0);
    }
    const tris = [];
    if (g.index) for (let i = 0; i < g.index.count; i++) tris.push(g.index.getX(i));
    else for (let i = 0; i < P.count; i++) tris.push(i);
    for (const t of tris) this.idx.push(t + base);
    if (o.double) {
      const b2 = this.pos.length / 3;
      for (let i = 0; i < P.count; i++) {
        const k = (base + i) * 3;
        this.pos.push(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
        this.nor.push(-this.nor[k], -this.nor[k + 1], -this.nor[k + 2]);
        const back = o.backShade ?? 0.8;
        this.col.push(this.col[k] * back, this.col[k + 1] * back, this.col[k + 2] * back);
        this.tnt.push(this.tnt[base + i]);
        if (gl) this.glw.push(gl.r, gl.g, gl.b, fl); else this.glw.push(0, 0, 0, 0);
      }
      for (let i = 0; i < tris.length; i += 3) this.idx.push(tris[i] + b2, tris[i + 2] + b2, tris[i + 1] + b2);
    }
    if (o.outline && !KIT.noOutline) this.shell(base, P.count, tris, geomN, o.outline, o.outlineColor);
    return this;
  }

  /** Inverted hull: the primitive pushed out along its (position-averaged) normals, faces flipped. */
  shell(base, count, tris, geomN, thick, color) {
    const avg = new Map();
    const key = (k) => `${Math.round(this.pos[k] * 500)},${Math.round(this.pos[k + 1] * 500)},${Math.round(this.pos[k + 2] * 500)}`;
    for (let i = 0; i < count; i++) {
      const kk = key((base + i) * 3);
      let a = avg.get(kk);
      if (!a) avg.set(kk, (a = [0, 0, 0]));
      a[0] += geomN[i * 3]; a[1] += geomN[i * 3 + 1]; a[2] += geomN[i * 3 + 2];
    }
    const oc = color ? C(color) : OUTLINE;
    const b2 = this.pos.length / 3;
    for (let i = 0; i < count; i++) {
      const k = (base + i) * 3;
      const a = avg.get(key(k));
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      const nx = a[0] / l, ny = a[1] / l, nz = a[2] / l;
      this.pos.push(this.pos[k] + nx * thick, this.pos[k + 1] + ny * thick, this.pos[k + 2] + nz * thick);
      this.nor.push(-nx, -ny, -nz);
      this.col.push(oc.r, oc.g, oc.b);
      this.tnt.push(0);
      this.glw.push(0, 0, 0, 0);
    }
    for (let i = 0; i < tris.length; i += 3) this.idx.push(tris[i] + b2, tris[i + 2] + b2, tris[i + 1] + b2);
  }

  /** Append another mesher's output through the current transform. */
  merge(other) {
    if (!other.pos.length) return this;
    const g = other.build(false);
    const M = this.m;
    _m3.getNormalMatrix(M);
    const base = this.pos.length / 3;
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(M);
      _n.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
    }
    this.col.push(...other.col);
    this.tnt.push(...other.tnt);
    this.glw.push(...other.glw);
    for (const t of other.idx) this.idx.push(t + base);
    return this;
  }

  /** The merged BufferGeometry (shared: never disposed by the renderer). */
  build(shared = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.tnt, 1));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(this.glw, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    if (shared) g.userData.shared = true;
    return g;
  }
}

/** Normals radiating from a point (with a little of the surface normal kept). */
export function radial(cx, cy, cz, keep = 0.25) {
  const out = new THREE.Vector3();
  return (p, n) => {
    out.set(p.x - cx, (p.y - cy) * 1.2, p.z - cz).normalize().multiplyScalar(1 - keep);
    out.addScaledVector(n, keep).normalize();
    return out;
  };
}

/** Per-vertex colour: `top` on up-facing surfaces (snow, moss), `base` elsewhere. */
export function capColor(base, top, threshold = 0.55) {
  const b = C(base), t = C(top);
  return (p, n) => (n.y > threshold ? t : b);
}

/** Per-vertex vertical gradient from `bottom` (y0) to `top` (y1). */
export function vgrad(bottom, top, y0, y1) {
  const b = C(bottom), t = C(top);
  const tmp = new THREE.Color();
  return (p) => tmp.copy(b).lerp(t, Math.min(1, Math.max(0, (p.y - y0) / (y1 - y0))));
}

export { THREE };
