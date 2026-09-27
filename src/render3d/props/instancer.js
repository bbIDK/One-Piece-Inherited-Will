// Instanced batches for the common static props (trees, rocks, bushes,
// barrels, fences…). Everything that shares a model inside one 32 m cell is
// drawn by one InstancedMesh, so a dense forest costs a few dozen draw calls
// instead of thousands. Far off (past LOD.merge), a cell's props join those of
// the 128 m square round it instead, in their outline-free far models: the
// woods of an island out at the render distance cost one draw call per model
// per square, not per cell.
//
// A builder returns a lightweight marker (an empty Object3D with no per-frame
// update). The renderer adds it to its props group, positioned from the
// group's origin; the marker's 'added' / 'removed' events claim and free the
// instance slots, and one frame hook keeps each cell's meshes placed relative
// to the renderer's floating origin (read from any live marker of the cell),
// picks each cell's detail level by its distance, and re-checks dynamic parts
// (fruit) a slice at a time. Instance matrices are relative to the cell (or
// square) corner, so they never change while the player walks.
import * as THREE from 'three';
import { vcMat, bindCtx } from './mats.js';
import { registerFrameHook } from '../registry.js';

export const CELL = 32;
const SUPER = 128; // the far squares (4 × 4 cells)
const cells = new Map();
const supers = new Map();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const WHITE = new THREE.Color(1, 1, 1);
// where the viewer (the player) is, in world tiles: new cells start at the right detail for it
const VIEW = { x: 0, y: 0, world: null };

/** One model's instances in one cell (or far square): a single InstancedMesh. */
class Batch {
  constructor(home, key, part) {
    this.home = home;
    this.key = key;
    this.geo = part.geo;
    this.farGeo = part.far || part.geo.userData.far || null;
    this.tinted = !!part.tinted;
    this.material = part.material || vcMat({ sway: part.sway, side: part.side, inst: this.tinted ? 'c' : 'i' });
    // (a far square is well beyond the shadows)
    this.castShadow = !home.isSuper && part.castShadow !== false;
    this.receiveShadow = !home.isSuper && part.receiveShadow !== false;
    this.count = 0;
    this.refs = [];
    this.minY = Infinity;
    this.maxY = -Infinity;
    const bb = this.geo.boundingBox || (this.geo.computeBoundingBox(), this.geo.boundingBox);
    this.h = bb.max.y * 1.45;
    this.r = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * 1.45;
    this.mesh = null;
    this.alloc(8);
  }

  alloc(cap) {
    const old = this.mesh, S = this.home.size;
    const m = new THREE.InstancedMesh(this.home.far && this.farGeo ? this.farGeo : this.geo, this.material, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.tinted) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.count = this.count;
    m.castShadow = this.castShadow;
    m.receiveShadow = this.receiveShadow;
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(S / 2, 0, S / 2), S);
    m.name = 'inst:' + this.key;
    if (old) {
      m.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.count * 16));
      if (old.instanceColor && m.instanceColor) m.instanceColor.array.set(old.instanceColor.array.subarray(0, this.count * 3));
      m.position.copy(old.position);
      m.boundingSphere.copy(old.boundingSphere);
      const parent = old.parent;
      if (parent) { parent.remove(old); parent.add(m); }
      old.dispose();
    } else {
      m.position.set(this.home.px, 0, this.home.pz);
      this.home.parent?.add(m);
    }
    this.mesh = m;
    this.cap = cap;
  }

  push(ref, matrix, color, y) {
    if (this.count >= this.cap) this.alloc(this.cap * 2);
    const slot = this.count++;
    this.refs[slot] = ref;
    ref.slot = slot;
    this.mesh.count = this.count;
    this.write(slot, matrix, color, y);
    return slot;
  }

  write(slot, matrix, color, y) {
    const m = this.mesh, S = this.home.size;
    m.setMatrixAt(slot, matrix);
    m.instanceMatrix.needsUpdate = true;
    if (this.tinted) { m.setColorAt(slot, color || WHITE); m.instanceColor.needsUpdate = true; }
    if (y < this.minY || y > this.maxY) {
      this.minY = Math.min(this.minY, y);
      this.maxY = Math.max(this.maxY, y);
      const half = (this.maxY - this.minY + this.h) / 2;
      m.boundingSphere.center.set(S / 2, this.minY + half, S / 2);
      m.boundingSphere.radius = Math.hypot(S / 2, S / 2, half) + this.r;
    }
  }

  remove(slot) {
    const last = this.count - 1;
    const m = this.mesh;
    if (slot !== last) {
      const a = m.instanceMatrix.array;
      a.copyWithin(slot * 16, last * 16, last * 16 + 16);
      if (m.instanceColor) m.instanceColor.array.copyWithin(slot * 3, last * 3, last * 3 + 3);
      const moved = this.refs[last];
      this.refs[slot] = moved;
      moved.slot = slot;
    }
    this.refs.length = last;
    this.count = last;
    m.count = last;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (!this.count) {
      m.parent?.remove(m);
      m.dispose();
      this.home.batches.delete(this.key);
      gc(this.home);
    }
  }
}

/** Forget a cell with nothing left in it (or a far square no cell uses any more). */
function gc(h) {
  if (h.batches.size) return;
  if (h.isSuper) { if (!h.members.size) supers.delete(h.key); return; }
  if (h.markers.size) return;
  if (h.sup) { h.sup.members.delete(h); gc(h.sup); h.sup = null; }
  cells.delete(h.key);
}

/** How far (m) the viewer is from the nearest point of a square of the world. */
function viewDist(x0, y0, size) {
  const w = VIEW.world;
  if (!w) return 0;
  const dx = w.dx(VIEW.x, x0), dy = y0 - VIEW.y;
  const nx = Math.max(dx, Math.min(0, dx + size)), ny = Math.max(dy, Math.min(0, dy + size));
  return Math.hypot(nx, ny);
}

function cellFor(o, ctx, parent) {
  const cx = Math.floor(o.x / CELL), cy = Math.floor(o.y / CELL);
  const wid = ctx?.world?.id || '';
  const key = `${wid}:${cx},${cy}`;
  let c = cells.get(key);
  if (!c) {
    c = { key, wid, x0: cx * CELL, y0: cy * CELL, size: CELL, px: 0, pz: 0, batches: new Map(), parent, markers: new Set(), rep: null, far: false, merged: false, sup: null };
    // (it starts at the detail its distance calls for, rather than swapping a frame later)
    const d = VIEW.world === ctx?.world ? viewDist(c.x0, c.y0, CELL) : 0;
    c.far = d > LOD.far;
    if (d > LOD.merge) join(c);
    cells.set(key, c);
  }
  if (!c.parent && parent) c.parent = parent;
  return c;
}

/** The far square cell c belongs to (made if need be); c's props are drawn in it from now on. */
function join(c) {
  const sx = Math.floor(c.x0 / SUPER), sy = Math.floor(c.y0 / SUPER);
  const key = `${c.wid}:${sx},${sy}`;
  let s = supers.get(key);
  if (!s) supers.set(key, (s = { key, x0: sx * SUPER, y0: sy * SUPER, size: SUPER, px: c.px + (sx * SUPER - c.x0), pz: c.pz + (sy * SUPER - c.y0), batches: new Map(), parent: c.parent, members: new Set(), far: true, isSuper: true }));
  if (!s.parent && c.parent) s.parent = c.parent;
  s.members.add(c);
  c.sup = s;
  c.merged = true;
}

/** The object's transform inside its cell (or far square): base point, yaw, scale, then the part's own matrix. */
function partMatrix(u, part, home, out) {
  const o = u.o;
  _p.set(o.x - home.x0, u.y, o.y - home.y0);
  _e.set(0, u.yaw, 0);
  _q.setFromEuler(_e);
  _s.setScalar(u.scale);
  out.compose(_p, _q, _s);
  if (part.local) out.multiply(part.local);
  return out;
}

function claim(u, part) {
  const cell = u.cell, home = cell.merged ? cell.sup : cell;
  // (fruit and such small parts aren't drawn that far off)
  if (cell.merged && part.nearOnly) { part.ref = null; return; }
  let b = home.batches.get(part.key);
  if (!b) {
    b = new Batch(home, part.key, part);
    home.batches.set(part.key, b);
  }
  part.ref = { slot: -1, batch: b };
  b.push(part.ref, partMatrix(u, part, home, _m), part.color, u.y);
}

function release(part) {
  if (!part.ref) return;
  part.ref.batch.remove(part.ref.slot);
  part.ref = null;
}

/** Move a cell's props into its far square's batches (on), or back into its own. */
function setMerged(cell, on) {
  for (const mk of cell.markers) for (const p of mk.userData.parts) release(p);
  const old = cell.sup;
  if (on) join(cell);
  else {
    cell.merged = false;
    cell.sup = null;
    cell.far = true; // (the far squares start well past the outlines' range)
  }
  for (const mk of cell.markers) {
    const u = mk.userData;
    if (u.live) for (const p of u.parts) if (!p.hidden) claim(u, p);
  }
  if (!on && old) { old.members.delete(cell); gc(old); }
}

const dynMarkers = new Set();
let dynList = [];
let dynDirty = false;
let dynAt = 0;

function onAdded(e) {
  const mk = e.target;
  const u = mk.userData;
  const cell = cellFor(u.o, u.ctx, mk.parent);
  u.cell = cell;
  cell.markers.add(mk);
  if (!cell.rep) cell.rep = mk;
  for (const p of u.parts) if (!p.hidden) claim(u, p);
  u.live = true;
  u.placed = false;
  if (u.dyn) { dynMarkers.add(mk); dynDirty = true; }
}

function onRemoved(e) {
  const mk = e.target;
  const u = mk.userData;
  for (const p of u.parts) release(p);
  u.live = false;
  const cell = u.cell;
  if (cell) {
    cell.markers.delete(mk);
    if (cell.rep === mk) cell.rep = cell.markers.values().next().value || null;
    gc(cell);
  }
  if (u.dyn) { dynMarkers.delete(mk); dynDirty = true; }
}

// cells farther than `far` (m) drop their outlines; farther than `merge`, they join their far square
export const LOD = { far: 62, merge: 124 };

/** Once per frame: place every cell (and far square) from one of its markers, pick its detail level; re-check a slice of the dynamic parts. */
function frame(env, ctx) {
  const v3 = ctx?.game?.view3d;
  if (v3 && ctx.world) { VIEW.x = v3.ox; VIEW.y = v3.oy; VIEW.world = ctx.world; }
  let moves = 0;
  for (const cell of cells.values()) {
    const mk = cell.rep;
    if (!mk) continue;
    const o = mk.userData.o;
    const px = mk.position.x - (o.x - cell.x0), pz = mk.position.z - (o.y - cell.y0);
    if (Math.abs(px - cell.px) > 1e-3 || Math.abs(pz - cell.pz) > 1e-3) {
      cell.px = px; cell.pz = pz;
      for (const b of cell.batches.values()) b.mesh.position.set(px, 0, pz);
    }
    const s = cell.sup;
    if (s) {
      const sx = px + (s.x0 - cell.x0), sz = pz + (s.y0 - cell.y0);
      if (Math.abs(sx - s.px) > 1e-3 || Math.abs(sz - s.pz) > 1e-3) {
        s.px = sx; s.pz = sz;
        for (const b of s.batches.values()) b.mesh.position.set(sx, 0, sz);
      }
    }
    // distance from the camera origin (the player) to the nearest point of the cell
    const gp = mk.parent ? mk.parent.position : null;
    const cx = (gp ? gp.x : 0) + px, cz = (gp ? gp.z : 0) + pz;
    const nx = Math.max(cx, Math.min(0, cx + CELL)), nz = Math.max(cz, Math.min(0, cz + CELL));
    const d = Math.hypot(nx, nz);
    const merged = cell.merged ? d > LOD.merge - 6 : d > LOD.merge + 6;
    // (a few cells a frame at most: walking only ever moves a few over the line)
    if (merged !== cell.merged && moves < 6) { setMerged(cell, merged); moves++; }
    if (cell.merged) continue;
    const far = cell.far ? d > LOD.far - 4 : d > LOD.far + 4;
    if (far !== cell.far) {
      cell.far = far;
      for (const b of cell.batches.values()) if (b.farGeo) b.mesh.geometry = far ? b.farGeo : b.geo;
    }
  }
  if (dynDirty) { dynList = [...dynMarkers]; dynDirty = false; dynAt = 0; }
  const n = dynList.length;
  if (!n || !env) return;
  const step = Math.max(1, Math.ceil(n / 20));
  for (let i = 0; i < step; i++) {
    const mk = dynList[(dynAt + i) % n];
    const u = mk.userData;
    if (u.live) u.dyn(u.o, env, ctx, u);
  }
  dynAt = (dynAt + step) % n;
}
registerFrameHook(frame, 'instancer');

/** Show or hide one part of an instanced prop (e.g. the fruit on a tree). */
export function setPartVisible(u, part, on) {
  if (on === !part.hidden) return;
  part.hidden = !on;
  if (!u.live) return;
  if (on) claim(u, part); else release(part);
}

/**
 * A marker for an instanced prop.
 * parts: [{ key, geo, color?: THREE.Color (instance tint), tinted?, sway?, castShadow?, local?: Matrix4, hidden?, nearOnly? (not drawn far off) }]
 * opts: { yaw, scale, dyn(o, env, ctx, u) }
 */
export function instanced(o, ctx, parts, opts = {}) {
  bindCtx(ctx);
  const mk = new THREE.Object3D();
  mk.name = 'prop:' + o.kind;
  // (only its position is read: no matrices to keep up, nothing to draw)
  mk.matrixAutoUpdate = false;
  mk.matrixWorldAutoUpdate = false;
  mk.visible = false;
  const u = mk.userData;
  u.marker = mk;
  u.o = o;
  u.ctx = ctx;
  u.parts = parts;
  u.yaw = opts.yaw || 0;
  u.scale = opts.scale || 1;
  u.y = ctx?.ground ? ctx.ground(o.x, o.y) : 0;
  u.dyn = opts.dyn || null;
  u.live = false;
  mk.addEventListener('added', onAdded);
  mk.addEventListener('removed', onRemoved);
  return mk;
}

/** A local matrix helper for parts: translate, yaw, uniform scale. */
export function local(x = 0, y = 0, z = 0, yaw = 0, s = 1) {
  _e.set(0, yaw, 0);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(s, s, s));
}

/** Debug: how many cells / far squares / batches / instances are live. */
export function instancerStats() {
  let batches = 0, instances = 0, merged = 0, farBatches = 0;
  for (const c of cells.values()) { if (c.merged) merged++; for (const b of c.batches.values()) { batches++; instances += b.count; } }
  for (const s of supers.values()) for (const b of s.batches.values()) { farBatches++; instances += b.count; }
  return { cells: cells.size, merged, supers: supers.size, batches, farBatches, instances };
}
