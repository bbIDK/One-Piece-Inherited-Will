// Towns out to the render distance. Past the range where a building has its
// full model (see Renderer3D.scanProps), it's drawn as a simple block (see
// buildings3d.farBuilding) merged with the others in its 32 m cell into ONE
// mesh, so a whole town on the horizon costs a couple of dozen draw calls.
//
// A cell's mesh holds every building of the cell that's in range. While a
// building's full model is in the scene its block is folded away (its
// vertices pulled into one point: no rebuild, a small upload), and it's
// unfolded again before the model goes, so the town never shows a gap.
import * as THREE from 'three';
import { Mesher, KIT } from './props/kit.js';
import { vcMat } from './props/mats.js';
import { farBuilding } from './buildings3d.js';
import { bangle } from '../world/bframe.js';
import { prof } from '../core/prof.js';

const CELL = 32;

export class FarBuildings {
  constructor(parent, ctx) {
    this.parent = parent; // (the renderer's props group: the meshes sit relative to its origin)
    this.ctx = ctx;
    this.cells = new Map(); // key → { x0, y0, members: Set, mesh, ranges: Map(building → [first, end) vertex), orig, dirty }
    this.cellOf = new Map(); // building → its cell
    this.hidden = new Set(); // buildings whose block is folded away (their model is up)
    this.seen = new Map(); // building → the full look that last found it in range
    this.stamp = 0;
    this.origin = { x: 0, y: 0 };
  }

  /** A full look over the render distance begins: add() what's in range, then end(). */
  begin() { this.stamp++; }

  /** Draw building b as a block (inRange: close enough to be taken on; once taken, it stays till end() misses it). */
  add(b, inRange) {
    if (this.cellOf.has(b)) { this.seen.set(b, this.stamp); return; }
    if (!inRange) return;
    const w = this.ctx.world;
    const cx = Math.floor(w.wx(b.x) / CELL), cy = Math.floor(b.y / CELL);
    const key = cy * 100000 + cx;
    let c = this.cells.get(key);
    if (!c) this.cells.set(key, (c = { key, x0: cx * CELL, y0: cy * CELL, members: new Set(), mesh: null, ranges: null, orig: null, dirty: true }));
    c.members.add(b);
    c.dirty = true;
    this.cellOf.set(b, c);
    this.seen.set(b, this.stamp);
  }

  /** The look is over: whatever it didn't find any more is out of range. */
  end() {
    for (const [b, s] of this.seen) if (s !== this.stamp) this.remove(b);
  }

  remove(b) {
    const c = this.cellOf.get(b);
    this.seen.delete(b);
    if (!c) return;
    this.cellOf.delete(b);
    c.members.delete(b);
    c.dirty = true;
    if (!c.members.size) { this.dispose(c); this.cells.delete(c.key); }
  }

  /** Show building b's block, or fold it away while its model stands there. */
  show(b, on) {
    if (on === !this.hidden.has(b)) return;
    if (on) this.hidden.delete(b); else this.hidden.add(b);
    const c = this.cellOf.get(b);
    if (c?.ranges?.has(b)) this.fold(c, b, !on);
  }

  /** Is b's block on screen (or is there none to wait for: it's out of range)? */
  drawn(b) {
    const c = this.cellOf.get(b);
    return !c || (!!c.ranges?.has(b) && !this.hidden.has(b));
  }

  /** Anything still to (re)build? */
  get busy() {
    for (const c of this.cells.values()) if (c.dirty) return true;
    return false;
  }

  /** Rebuild the cells whose buildings changed, nearest first, until `end` (performance.now()). */
  update(ox, oy, end) {
    let todo = null;
    const w = this.ctx.world;
    for (const c of this.cells.values()) {
      if (!c.dirty) continue;
      // (a town waits for the ground it stands on: never houses on the open sea)
      if (!c.mesh && this.ctx.landDrawn && !this.ctx.landDrawn(c.x0 + CELL / 2, c.y0 + CELL / 2)) continue;
      const dx = w.dx(ox, c.x0 + CELL / 2), dy = c.y0 + CELL / 2 - oy;
      (todo ||= []).push([c, dx * dx + dy * dy]);
    }
    if (!todo) return;
    todo.sort((a, b) => a[1] - b[1]);
    for (const [c] of todo) {
      this.build(c);
      if (performance.now() > end) break;
    }
  }

  build(c) {
    const t0 = performance.now();
    const w = this.ctx.world;
    const k = new Mesher();
    const ranges = new Map();
    KIT.noOutline = true; // (no ink outlines this far off)
    try {
      for (const b of c.members) {
        const v0 = k.vertexCount;
        k.save();
        k.translate(w.dx(c.x0, b.x), this.ctx.ground(b.x, b.y), b.y - c.y0);
        k.rotateY(bangle(b));
        try { farBuilding(k, b, this.ctx); } catch (e) { console.warn('far building failed', b.style, e); }
        k.restore();
        ranges.set(b, [v0, k.vertexCount]);
      }
    } finally { KIT.noOutline = false; }
    this.dispose(c);
    c.dirty = false;
    c.ranges = ranges;
    if (k.vertexCount) {
      const geo = k.build(false);
      c.orig = geo.attributes.position.array.slice();
      const m = new THREE.Mesh(geo, vcMat());
      m.name = 'far-buildings';
      m.castShadow = false;
      m.receiveShadow = false;
      m.position.set(w.dx(this.origin.x, c.x0), 0, c.y0 - this.origin.y);
      c.mesh = m;
      for (const b of c.members) if (this.hidden.has(b)) this.fold(c, b, true);
      this.parent.add(m);
    }
    prof('b.farcell', t0);
  }

  /** Pull b's block into a point (on) or put it back. */
  fold(c, b, on) {
    const r = c.ranges.get(b);
    if (!r || !c.mesh || r[1] <= r[0]) return;
    const P = c.mesh.geometry.attributes.position, a = P.array, o = c.orig;
    const [v0, v1] = r;
    if (on) for (let i = v0 * 3; i < v1 * 3; i += 3) { a[i] = o[v0 * 3]; a[i + 1] = o[v0 * 3 + 1]; a[i + 2] = o[v0 * 3 + 2]; }
    else a.set(o.subarray(v0 * 3, v1 * 3), v0 * 3);
    P.addUpdateRange(v0 * 3, (v1 - v0) * 3);
    P.needsUpdate = true;
  }

  /** Placed relative to the props' origin (see Renderer3D.rebase). */
  place(origin) {
    this.origin = { x: origin.x, y: origin.y };
    const w = this.ctx.world;
    if (!w) return;
    for (const c of this.cells.values()) c.mesh?.position.set(w.dx(origin.x, c.x0), 0, c.y0 - origin.y);
  }

  dispose(c) {
    if (!c.mesh) return;
    this.parent.remove(c.mesh);
    c.mesh.geometry.dispose();
    c.mesh = null;
    c.orig = null;
  }

  clear() {
    for (const c of this.cells.values()) this.dispose(c);
    this.cells.clear();
    this.cellOf.clear();
    this.hidden.clear();
    this.seen.clear();
  }

  /** Debug: cells, blocks in them, and how many are folded away for their models. */
  stats() {
    let meshes = 0;
    for (const c of this.cells.values()) if (c.mesh) meshes++;
    return { cells: this.cells.size, meshes, blocks: this.cellOf.size, folded: this.hidden.size };
  }
}
