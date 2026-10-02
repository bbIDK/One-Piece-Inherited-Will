// What you can stand on up on top of a building: the roof (and its chimney,
// a dome, the eaves, an awning over the street) as it's drawn. Worked out
// from the building's own model, so every style matches what you see: its
// upward-facing faces are laid onto a grid in the building's frame (a
// quarter of a metre a cell), each cell keeping the highest of them over
// it. A building's grid is made a little at a time while a frame has time
// to spare, the nearest first (see warm) — or all at once, if something
// asks about a spot on it before then (only someone up in the air or on
// the roofs asks: see game/actor.js) — and forgotten with its model.
import * as THREE from 'three';
import { bl, bfoot } from '../world/bframe.js';

const CELL = 0.25; // m
const PAD = 0.9; // m past the walls the grid reaches (the eaves, an awning, a veranda)
const FLAT = 0.35; // faces steeper than this (|normal.y| below it) are walls, not something to stand on
const HASH = 8; // m: the cells of the index
const NONE = -1e9;

const V = new THREE.Vector3();

export class RoofIndex {
  constructor(world) {
    this.world = world;
    this.cells = new Map(); // hash cell → [record]
    this.recs = new Map(); // building → record
  }

  /** A building's model is up: its grid is made when first asked for. `group` stands at height `y0`. */
  add(b, group, y0) {
    this.remove(b);
    const f = bfoot(b);
    const r = { b, group, y0, x0: f.x0 - PAD, x1: f.x1 + PAD, y0w: f.y0 - PAD, y1w: f.y1 + PAD, grid: null, keys: [] };
    for (let cy = Math.floor(r.y0w / HASH); cy <= Math.floor(r.y1w / HASH); cy++) {
      for (let cx = Math.floor(r.x0 / HASH); cx <= Math.floor(r.x1 / HASH); cx++) {
        const k = this.key(cx, cy);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(r);
        r.keys.push(k);
      }
    }
    this.recs.set(b, r);
  }

  remove(b) {
    const r = this.recs.get(b);
    if (!r) return;
    for (const k of r.keys) {
      const list = this.cells.get(k);
      if (!list) continue;
      const i = list.indexOf(r);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.cells.delete(k);
    }
    this.recs.delete(b);
  }

  /**
   * Work on the grid of the nearest building within `r` m of (x, y) still
   * without one, until it's done or it's `until` (performance.now()): a
   * big one is made over a few frames, never in one go.
   */
  warm(x, y, r, until) {
    let best = null, bd = r * r;
    for (const rec of this.recs.values()) {
      if (rec.grid !== null) continue;
      const dx = this.world.dx(x, rec.b.x), dy = rec.b.y - y, d = dx * dx + dy * dy - (rec.make ? 1e6 : 0); // (the one under way first)
      if (d < bd) { bd = d; best = rec; }
    }
    if (best) build(best, until);
  }

  key(cx, cy) {
    const w = this.world, n = Math.ceil(w.width / HASH);
    if (w.wrap) cx = ((cx % n) + n) % n;
    return cy * n + cx;
  }

  /**
   * The highest surface over (x, y) up on the buildings there — { h (m,
   * above the sea), b (the building) } — or null. Below `under` only
   * (the roof you'd land on from there, not one higher up over your head)
   * when it's given.
   */
  at(x, y, under = Infinity) {
    const w = this.world;
    const list = this.cells.get(this.key(Math.floor(w.wx(x) / HASH), Math.floor(y / HASH)));
    if (!list) return null;
    let best = null;
    for (const r of list) {
      const dx = w.dx(r.x0, x);
      if (dx < 0 || dx > r.x1 - r.x0 || y < r.y0w || y > r.y1w) continue;
      if (r.grid === null) build(r, Infinity);
      const g = r.grid;
      if (!g) continue;
      const h = sample(g, bl(r.b, x, y, w));
      if (h === null) continue;
      const top = r.y0 + h;
      if (top <= under && (!best || top > best.h)) best = { h: top, b: r.b };
    }
    return best;
  }
}

/** Make (or carry on making) a building's grid until it's `until`: then it's the grid, or false (nothing up there). */
function build(r, until) {
  const m = r.make || (r.make = startGrid(r));
  if (!stepGrid(m, until)) return;
  r.grid = m.any ? { h: m.h, NX: m.NX, NZ: m.NZ, X0: m.X0, Z0: m.Z0 } : false;
  r.make = null;
}

/** A building's grid to make, from its model as it stands in the scene (heights from its foot): what goes onto it. */
function startGrid(r) {
  const b = r.b, fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
  const X0 = -fw / 2 - PAD, Z0 = -fd - PAD;
  const NX = Math.ceil((fw + 2 * PAD) / CELL), NZ = Math.ceil((fd + 2 * PAD) / CELL);
  const grp = r.group;
  grp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
  const meshes = [];
  // (in the building's own frame, unturned: x across, z from its front back)
  grp.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position && !o.userData.noRoof) meshes.push({ o, m: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) }); });
  return { h: new Float32Array(NX * NZ).fill(NONE), NX, NZ, X0, Z0, meshes, mi: 0, t: 0, P: null, any: false };
}

/** Lay the meshes' upward faces onto the grid, a triangle at a time, until done (true) or it's `until`. */
function stepGrid(g, until) {
  const { h, NX, NZ, X0, Z0 } = g;
  let n = 0;
  while (g.mi < g.meshes.length) {
    const { o, m } = g.meshes[g.mi];
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    if (!g.P) {
      g.P = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        V.fromBufferAttribute(pos, i).applyMatrix4(m);
        g.P[i * 3] = V.x; g.P[i * 3 + 1] = V.y; g.P[i * 3 + 2] = V.z;
      }
    }
    const P = g.P, count = idx ? idx.count : pos.count;
    for (; g.t + 2 < count; g.t += 3) {
      if ((++n & 127) === 0 && performance.now() > until) return false;
      const t = g.t;
      const ia = (idx ? idx.getX(t) : t) * 3, ib = (idx ? idx.getX(t + 1) : t + 1) * 3, ic = (idx ? idx.getX(t + 2) : t + 2) * 3;
      const ax = P[ia], ay = P[ia + 1], az = P[ia + 2], bx = P[ib], by = P[ib + 1], bz = P[ib + 2], cx = P[ic], cy = P[ic + 1], cz = P[ic + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (!(len > 1e-9) || Math.abs(ny) / len < FLAT) continue;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((Math.max(ax, bx, cx) - X0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((Math.max(az, bz, cz) - Z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        const pz = Z0 + (j + 0.5) * CELL;
        for (let i = i0; i <= i1; i++) {
          const px = X0 + (i + 0.5) * CELL;
          const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
          const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
          const y = l1 * ay + l2 * by + l3 * cy, q = j * NX + i;
          if (y > h[q]) { h[q] = y; g.any = true; }
        }
      }
    }
    g.mi++; g.t = 0; g.P = null;
  }
  return true;
}

/**
 * The height of the tops at a spot in the building's frame: between the
 * four cells round it (a slope is smooth underfoot, not a stair of cells)
 * where they're all there; at an edge, the cell it's in.
 */
function sample(g, { lx, lz }) {
  const fx = (lx - g.X0) / CELL - 0.5, fz = (lz - g.Z0) / CELL - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz);
  const ci = Math.round(fx), cj = Math.round(fz);
  if (ci < 0 || cj < 0 || ci >= g.NX || cj >= g.NZ) return null;
  const own = g.h[cj * g.NX + ci];
  if (own <= NONE) return null;
  if (i < 0 || j < 0 || i + 1 >= g.NX || j + 1 >= g.NZ) return own;
  const a = g.h[j * g.NX + i], b = g.h[j * g.NX + i + 1], c = g.h[(j + 1) * g.NX + i], d = g.h[(j + 1) * g.NX + i + 1];
  if (a <= NONE || b <= NONE || c <= NONE || d <= NONE) return own;
  // (not across a step, the foot of a chimney or a roof's edge over a lower one: there, the cell it's in)
  const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
  if (hi - lo > 0.6) return own;
  const tx = fx - i, tz = fz - j;
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
