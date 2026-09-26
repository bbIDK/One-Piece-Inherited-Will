// Instanced batches for the common static props (trees, rocks, bushes,
// barrels, fences…). Everything that shares a model inside one 32 m cell is
// drawn by one InstancedMesh, so a dense forest costs a few dozen draw calls
// instead of thousands.
//
// A builder returns a lightweight marker (an empty Object3D with no per-frame
// update). The renderer adds it to its props group and positions it on every
// prop rebuild; the marker's 'added' / 'removed' events claim and free the
// instance slots, and one frame hook keeps each cell's meshes placed relative
// to the renderer's floating origin (read from any live marker of the cell)
// and re-checks dynamic parts (fruit) a slice at a time. Instance matrices
// are relative to the cell corner, so they never change while the player walks.
import * as THREE from 'three';
import { vcMat, bindCtx } from './mats.js';
import { registerFrameHook } from '../registry.js';

export const CELL = 32;
const cells = new Map();
const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const WHITE = new THREE.Color(1, 1, 1);

class Batch {
  constructor(cell, key, part) {
    this.cell = cell;
    this.key = key;
    this.geo = part.geo;
    this.farGeo = part.far || part.geo.userData.far || null;
    this.material = part.material || vcMat({ sway: part.sway, side: part.side });
    this.tinted = !!part.tinted;
    this.castShadow = part.castShadow !== false;
    this.receiveShadow = part.receiveShadow !== false;
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
    const old = this.mesh;
    const m = new THREE.InstancedMesh(this.cell.far && this.farGeo ? this.farGeo : this.geo, this.material, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.tinted) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.count = this.count;
    m.castShadow = this.castShadow;
    m.receiveShadow = this.receiveShadow;
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(CELL / 2, 0, CELL / 2), CELL);
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
      m.position.set(this.cell.px, 0, this.cell.pz);
      this.cell.parent?.add(m);
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
    const m = this.mesh;
    m.setMatrixAt(slot, matrix);
    m.instanceMatrix.needsUpdate = true;
    if (this.tinted) { m.setColorAt(slot, color || WHITE); m.instanceColor.needsUpdate = true; }
    if (y < this.minY || y > this.maxY) {
      this.minY = Math.min(this.minY, y);
      this.maxY = Math.max(this.maxY, y);
      const half = (this.maxY - this.minY + this.h) / 2;
      m.boundingSphere.center.set(CELL / 2, this.minY + half, CELL / 2);
      m.boundingSphere.radius = Math.hypot(CELL / 2, CELL / 2, half) + this.r;
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
      this.cell.batches.delete(this.key);
      if (!this.cell.batches.size) cells.delete(this.cell.key);
    }
  }
}

function cellFor(o, ctx, parent) {
  const cx = Math.floor(o.x / CELL), cy = Math.floor(o.y / CELL);
  const key = `${ctx?.world?.id || ''}:${cx},${cy}`;
  let c = cells.get(key);
  if (!c) {
    c = { key, x0: cx * CELL, y0: cy * CELL, px: 0, pz: 0, batches: new Map(), parent, markers: new Set(), rep: null, far: false };
    cells.set(key, c);
  }
  if (!c.parent && parent) c.parent = parent;
  return c;
}

/** The object's transform inside its cell: base point, yaw, scale, then the part's own matrix. */
function partMatrix(u, part, out) {
  const o = u.o;
  _p.set(o.x - u.cell.x0, u.y, o.y - u.cell.y0);
  _e.set(0, u.yaw, 0);
  _q.setFromEuler(_e);
  _s.setScalar(u.scale);
  out.compose(_p, _q, _s);
  if (part.local) out.multiply(part.local);
  return out;
}

function claim(u, part) {
  let b = u.cell.batches.get(part.key);
  if (!b) {
    b = new Batch(u.cell, part.key, part);
    u.cell.batches.set(part.key, b);
  }
  part.ref = { slot: -1, batch: b };
  b.push(part.ref, partMatrix(u, part, _m), part.color, u.y);
}

function release(part) {
  if (!part.ref) return;
  part.ref.batch.remove(part.ref.slot);
  part.ref = null;
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
  }
  if (u.dyn) { dynMarkers.delete(mk); dynDirty = true; }
}

export const LOD = { far: 62 }; // cells farther than this (m) drop their outlines

/** Once per frame: place every cell from one of its markers, pick its detail level; re-check a slice of the dynamic parts. */
function frame(env, ctx) {
  for (const cell of cells.values()) {
    const mk = cell.rep;
    if (!mk) continue;
    const o = mk.userData.o;
    const px = mk.position.x - (o.x - cell.x0), pz = mk.position.z - (o.y - cell.y0);
    if (Math.abs(px - cell.px) > 1e-3 || Math.abs(pz - cell.pz) > 1e-3) {
      cell.px = px; cell.pz = pz;
      for (const b of cell.batches.values()) b.mesh.position.set(px, 0, pz);
    }
    // distance from the camera origin (the player) to the nearest point of the cell
    const gp = mk.parent ? mk.parent.position : null;
    const cx = (gp ? gp.x : 0) + px, cz = (gp ? gp.z : 0) + pz;
    const nx = Math.max(cx, Math.min(0, cx + CELL)), nz = Math.max(cz, Math.min(0, cz + CELL));
    const d = Math.hypot(nx, nz);
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
registerFrameHook(frame);

/** Show or hide one part of an instanced prop (e.g. the fruit on a tree). */
export function setPartVisible(u, part, on) {
  if (on === !part.hidden) return;
  part.hidden = !on;
  if (!u.live) return;
  if (on) claim(u, part); else release(part);
}

/**
 * A marker for an instanced prop.
 * parts: [{ key, geo, color?: THREE.Color (instance tint), tinted?, sway?, castShadow?, local?: Matrix4, hidden? }]
 * opts: { yaw, scale, dyn(o, env, ctx, u) }
 */
export function instanced(o, ctx, parts, opts = {}) {
  bindCtx(ctx);
  const mk = new THREE.Object3D();
  mk.name = 'prop:' + o.kind;
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

/** Debug: how many cells / batches / instances are live. */
export function instancerStats() {
  let batches = 0, instances = 0;
  for (const c of cells.values()) for (const b of c.batches.values()) { batches++; instances += b.count; }
  return { cells: cells.size, batches, instances };
}

void _t;
