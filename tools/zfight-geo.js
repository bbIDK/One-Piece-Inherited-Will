// The geometry side of the z-fighting finder (tools/zfight.mjs): every face of
// a model, the pairs of faces lying in one plane facing the same way and
// overlapping, and whether such a pair can be seen at all. Also used by
// tests/zfight.test.mjs.
import * as THREE from 'three';

const _im = new THREE.Matrix4();

/** Every front-facing triangle of an object, in the frame `frame` (default: the object's own). */
export function triangles(root, frame = null, { buried = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = frame ? frame : new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat && mat.side === THREE.BackSide) return; // (ink outline shells)
    const g = o.geometry, pos = g?.attributes?.position;
    if (!pos) return;
    const idx = g.index, col = g.attributes.color, glow = g.attributes.glow;
    const mats = [];
    const base = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    if (o.isInstancedMesh) for (let i = 0; i < Math.min(o.count, 300); i++) { o.getMatrixAt(i, _im); mats.push(new THREE.Matrix4().multiplyMatrices(base, _im)); }
    else mats.push(base);
    const n = idx ? idx.count : pos.count;
    for (const M of mats) {
      for (let t = 0; t + 2 < n; t += 3) {
        const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
        if (glow && glow.itemSize === 4 && glow.getW(ia) < -0.5) continue; // (an ink shell: only its silhouette is ever drawn)
        const a = new THREE.Vector3().fromBufferAttribute(pos, ia).applyMatrix4(M);
        const b = new THREE.Vector3().fromBufferAttribute(pos, ib).applyMatrix4(M);
        const c = new THREE.Vector3().fromBufferAttribute(pos, ic).applyMatrix4(M);
        // (buried under the street: no one sees it, though it still bounds a solid)
        const under = buried && !frame && Math.max(a.y, b.y, c.y) < -0.15;
        out.push({ under, a, b, c, col: col ? hex(col.getX(ia), col.getY(ia), col.getZ(ia)) : mat?.color ? '#' + mat.color.getHexString() : '?', mesh: o.name || '', glass: !!mat?.transparent });
      }
    }
  });
  return out;
}
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

// 2D convex clipping (Sutherland–Hodgman): the area two triangles share
function clip(poly, a, b) {
  const out = [];
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
const area2 = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
function overlap(A, B) {
  if (area2(A) < 0) A = [A[0], A[2], A[1]];
  if (area2(B) < 0) B = [B[0], B[2], B[1]];
  let P = A;
  for (let i = 0; i < 3 && P.length; i++) P = clip(P, B[i], B[(i + 1) % 3]);
  return P.length >= 3 ? { area: Math.abs(area2(P)), P } : { area: 0, P: null };
}

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _s = new THREE.Vector3();

/**
 * A bounding-volume tree over the faces (built once per list, kept on it), so
 * a ray looks only at the faces near its path, not at every one of a ship's
 * hundred thousand.
 */
function bvhOf(tris) {
  if (tris._bvh) return tris._bvh;
  const N = tris.length, lo = new Float32Array(N * 3), hi = new Float32Array(N * 3), mid = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const T = tris[i];
    for (let k = 0; k < 3; k++) {
      const a = T.a.getComponent(k), b = T.b.getComponent(k), c = T.c.getComponent(k);
      lo[i * 3 + k] = Math.min(a, b, c); hi[i * 3 + k] = Math.max(a, b, c); mid[i * 3 + k] = (a + b + c) / 3;
    }
  }
  const order = Array.from({ length: N }, (_, i) => i);
  const nodes = [];
  const build = (s, e) => {
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = s; i < e; i++) for (let k = 0; k < 3; k++) { box[k] = Math.min(box[k], lo[order[i] * 3 + k]); box[k + 3] = Math.max(box[k + 3], hi[order[i] * 3 + k]); }
    const node = { box, s, e, l: null, r: null };
    nodes.push(node);
    if (e - s > 8) {
      let ax = 0, best = -1;
      for (let k = 0; k < 3; k++) if (box[k + 3] - box[k] > best) { best = box[k + 3] - box[k]; ax = k; }
      const part = order.slice(s, e).sort((p, q) => mid[p * 3 + ax] - mid[q * 3 + ax]);
      for (let i = s; i < e; i++) order[i] = part[i - s];
      const m = (s + e) >> 1;
      node.l = build(s, m); node.r = build(m, e);
    }
    return node;
  };
  tris._bvh = { root: N ? build(0, N) : null, order };
  return tris._bvh;
}
const slab = (box, o, inv) => {
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    const ok = o.getComponent(k), ik = inv[k];
    let a = (box[k] - ok) * ik, b = (box[k + 3] - ok) * ik;
    if (a > b) [a, b] = [b, a];
    if (!(a <= b)) { if (ok < box[k] || ok > box[k + 3]) return false; continue; } // (parallel to this slab: inside it or never)
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1 + 1e-6) return false;
  }
  return true;
};

/**
 * Can the patch two faces share be seen at all? From just off it, along its
 * normal and on out past the whole model, count the faces crossed: in through
 * one face, out through another. More outs than ins means the patch lies
 * inside a solid (a trim's back inside a wall, a slab's end in the next one,
 * boxes run through each other); something within a centimetre over it
 * covers it; and if every way out of it, straight and slanting, runs into the
 * model, it's roofed over (a wall's top under the eaves). Either way no one
 * ever sees it flicker.
 */
export function hidden(tris, f) {
  const { root, order } = bvhOf(tris);
  const o = _s.copy(f.c3).addScaledVector(f.nv, 0.004);
  const cast = (dir) => {
    let depth = 0, near = Infinity;
    const inv = [1 / dir.x, 1 / dir.y, 1 / dir.z];
    const stack = root ? [root] : [];
    while (stack.length) {
      const nd = stack.pop();
      if (!slab(nd.box, o, inv)) continue;
      if (nd.l) { stack.push(nd.l, nd.r); continue; }
      for (let i = nd.s; i < nd.e; i++) {
        const T = tris[order[i]];
        _e1.subVectors(T.b, T.a); _e2.subVectors(T.c, T.a);
        _p.crossVectors(dir, _e2);
        const det = _e1.dot(_p);
        if (Math.abs(det) < 1e-12) continue;
        const iv = 1 / det;
        _q.subVectors(o, T.a);
        const uu = _q.dot(_p) * iv;
        if (uu < 0 || uu > 1) continue;
        _q.cross(_e1);
        const vv = dir.dot(_q) * iv;
        if (vv < 0 || uu + vv > 1) continue;
        const t = _e2.dot(_q) * iv;
        if (t <= 1e-5) continue;
        depth += det < 0 ? 1 : -1; // (met from behind: a way out of a solid)
        if (t < near) near = t;
      }
    }
    return { depth, near };
  };
  const n = f.nv, r = cast(n);
  if (r.depth > 0 || r.near < 0.01) return true;
  if (r.near === Infinity) return false;
  const u = new THREE.Vector3(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = new THREE.Vector3().copy(n).multiplyScalar(0.5).addScaledVector(u, Math.cos(a) * 0.866).addScaledVector(v, Math.sin(a) * 0.866).normalize();
    if (cast(d).near === Infinity) return false;
  }
  return true;
}

/**
 * Pairs of same-facing faces closer than `sep` to the same plane that overlap
 * by more than `minArea` m². `owner(t)` keys the pieces: with it, only faces of
 * different owners are paired (one object against another).
 */
export function fights(tris, { sep = 0.006, minArea = 4e-4, owner = null, verbose = false } = {}) {
  const buckets = new Map();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < tris.length; i++) {
    const T = tris[i];
    if (T.under) continue;
    e1.subVectors(T.b, T.a); e2.subVectors(T.c, T.a);
    const n = new THREE.Vector3().crossVectors(e1, e2);
    const A2 = n.length();
    if (A2 < 2 * minArea) continue;
    n.divideScalar(A2);
    T.n = n; T.d = n.dot(T.a); T.area = A2 / 2;
    const key = `${Math.round(n.x * 60)},${Math.round(n.y * 60)},${Math.round(n.z * 60)}`;
    T.key = key; T.dk = Math.floor(T.d / sep);
    const k = key + '|' + T.dk;
    let L = buckets.get(k);
    if (!L) buckets.set(k, (L = []));
    L.push(T);
  }
  const found = [];
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  for (const [k, L] of buckets) {
    const [key, dk] = k.split('|');
    const next = buckets.get(key + '|' + (Number(dk) + 1)) || [];
    // one 2D frame for the plane, every face in it (and the next layer up)
    // laid flat in it, then swept along u: only faces whose spans meet are compared
    const n0 = L[0].n;
    u.set(Math.abs(n0.x) < 0.9 ? 1 : 0, Math.abs(n0.x) < 0.9 ? 0 : 1, 0).cross(n0).normalize();
    v.crossVectors(n0, u);
    const flat = (T, layer) => {
      const A = [T.a, T.b, T.c].map((p) => [p.dot(u), p.dot(v)]);
      return { T, A, layer, u0: Math.min(A[0][0], A[1][0], A[2][0]), u1: Math.max(A[0][0], A[1][0], A[2][0]), v0: Math.min(A[0][1], A[1][1], A[2][1]), v1: Math.max(A[0][1], A[1][1], A[2][1]) };
    };
    const items = [...L.map((T) => flat(T, 0)), ...next.map((T) => flat(T, 1))].sort((p, q) => p.u0 - q.u0);
    for (let i = 0; i < items.length; i++) {
      const I = items[i];
      for (let j = i + 1; j < items.length && items[j].u0 < I.u1; j++) {
        const J = items[j];
        if (I.layer && J.layer) continue; // (both in the next layer up: that layer's own turn)
        if (J.v0 >= I.v1 || I.v0 >= J.v1 || J.u1 <= I.u0) continue;
        const S = I.T, T = J.T;
        if (owner && owner(S) === owner(T)) continue;
        if (S.n.dot(T.n) < 0.9995 || Math.abs(S.d - T.d) > sep) continue;
        const { area: ar, P: poly } = overlap(I.A, J.A);
        if (ar < minArea) continue;
        // (the middle of the shared patch, back in 3D)
        let px = 0, py = 0;
        for (const q of poly) { px += q[0]; py += q[1]; }
        px /= poly.length; py /= poly.length;
        const n = S.n;
        const c = new THREE.Vector3().addScaledVector(u, px).addScaledVector(v, py).addScaledVector(n0, 0);
        c.addScaledVector(n, Math.max(S.d, T.d) - c.dot(n));
        const tv = (X) => [X.a, X.b, X.c].map((p) => [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
        found.push({ c3: c, nv: n.clone(), same: S.col === T.col, ...(verbose ? { triA: tv(S), triB: tv(T) } : {}), sep: Math.abs(S.d - T.d), area: ar, at: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], n: [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(2)], cols: [S.col, T.col], meshes: [S.mesh, T.mesh], glass: S.glass || T.glass, owners: owner ? [owner(S), owner(T)] : null });
      }
    }
  }
  return found;
}
