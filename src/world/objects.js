// Props placed in the world (trees, rocks, buildings, docks furniture...).
// Stored in a chunked spatial index so rendering and interaction only look
// at nearby objects.
import { isEnterable, isPirateHouse, layoutOf, doorOf, WALL_T, PLINTH } from './interiors.js';
import { bw, bbox, bfoot } from './bframe.js';

export const CHUNK = 32;

// Small props collide as the size of their 3D model (a circle of this radius
// in metres, times the object's scale; [halfW, halfD] for a box) instead of
// blocking whole 1 m tiles — a lamp post or a barrel used to throw an
// invisible wall around itself.
export const COLLIDE = {
  // street furniture
  lamp: 0.16, lantern: 0.2, sign: 0.15, flagpole: 0.15, mooring: 0.2, barrel: 0.34, crate: 0.42, haystack: 0.6, chest: 0.4,
  bench: [0.8, 0.3], stall: [1.25, 0.75], fence: [0.9, 0.12], tent: [1.2, 1.0], campfire: 0.45, well: 0.95, fountain: 1.3,
  // nature
  tree: 0.3, rock: 0.5, mushroom: 0.25, crystal: 0.4,
  // landmarks (sized like their models; gates and arches you walk through)
  statue: 0.7, pillar: 0.45, totem: 0.35, dummy: 0.28, cannon: 0.55, anchor: 0.5, grave: 0.3, bell: 0.6, ruins: 0.8,
  poneglyph: [0.8, 0.35], boat: [1.4, 0.6], shipwreck: [2.5, 1.2], lighthouse: 1.6, tower: 2.0, windmill: 1.5, wheel: 1.0, elevator: 1.5,
  gate: 0, torii: 0, arch: 0, bones: 0, skull: 0, bubble: 0,
  platform: 0, // a raised floor you walk onto (see floorOf)
};

/** Raised floors you can stand on (boxing rings, stages, scaffolds), sized like their models. */
export function floorOf(o) {
  if (o.kind !== 'platform') return null;
  const n = o.name || '';
  const s = o.s || 1;
  if (/ring/i.test(n)) return { hw: 2.3 * s, hd: 2.3 * s, oy: 0, h: 0.88 * s };
  if (/stage|carnival/i.test(n)) return { hw: 2.4 * s, hd: 1.7 * s, oy: 0, h: 1.02 * s };
  return { hw: 1.8 * s, hd: 1.4 * s, oy: -0.2 * s, h: 2.4 * s };
}

// furniture that collides as a circle
const ROUND = new Set(['barrel', 'roundtable', 'dummy', 'plant']);

let nextObjectId = 1;

export class ObjectIndex {
  constructor(world) {
    this.world = world;
    this.cw = Math.ceil(world.width / CHUNK);
    this.ch = Math.ceil(world.height / CHUNK);
    this.chunks = new Map();
    this.byId = new Map();
    this.count = 0;
  }

  key(cx, cy) { return cy * this.cw + cx; }

  add(obj) {
    obj.id = obj.id || nextObjectId++;
    obj.x = this.world.wx(obj.x);
    const cx = Math.floor(obj.x / CHUNK), cy = Math.floor(obj.y / CHUNK);
    const k = this.key(cx, cy);
    let list = this.chunks.get(k);
    if (!list) this.chunks.set(k, (list = []));
    list.push(obj);
    obj._chunk = k;
    this.byId.set(obj.id, obj);
    this.count++;
    const fl = floorOf(obj);
    if (fl) this.world.addFloor({ x0: obj.x - fl.hw, x1: obj.x + fl.hw, y0: obj.y + fl.oy - fl.hd, y1: obj.y + fl.oy + fl.hd, h: fl.h, o: obj });
    const c = obj.block && COLLIDE[obj.kind];
    if (obj.block && isEnterable(obj)) {
      // a building you can walk into: its floor is open (2), its walls and furniture collide
      obj.enterable = true;
      obj.pirate = isPirateHouse(obj);
      this.stamp(obj, 2);
      this.addInterior(obj);
    } else if (c !== undefined && obj.block && (fl || ((obj.fw || 1) <= 2 && (obj.fd || 1) <= 2))) {
      // collider-sized props don't block tiles (see COLLIDE)
      obj.soft = true;
      if (c) this.addCollider(obj, c);
    } else if (obj.block) this.stamp(obj, 1);
    return obj;
  }

  addCollider(obj, c) {
    const s = obj.s || 1;
    const col = Array.isArray(c) ? { x: obj.x, y: obj.y, hw: c[0] * s, hd: c[1] * s, o: obj } : { x: obj.x, y: obj.y, r: c * s, o: obj };
    obj.col = this.world.addCol(col);
  }

  removeCollider(obj) {
    if (!obj.col) return;
    this.world.removeCol(obj.col);
    obj.col = null;
  }

  /** Walls (with a doorway) and the ground floor of an enterable building (furniture: see addFurniture). */
  addInterior(b) {
    const w = this.world;
    const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3), T = WALL_T;
    const d = doorOf(b);
    const cols = [];
    // (a box in the building's frame, as a world rectangle)
    const rect = (x0, x1, z0, z1) => { const r = bbox(b, x0, x1, z0, z1); return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, hw: (r.x1 - r.x0) / 2, hd: (r.y1 - r.y0) / 2 }; };
    const box = (x0, x1, z0, z1, extra) => {
      if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return null;
      const col = w.addCol({ ...rect(x0, x1, z0, z1), o: b, ...extra });
      cols.push(col);
      return col;
    };
    const wall = { wall: true };
    box(-fw / 2, d.x - d.dw / 2, -T, 0, wall);
    box(d.x + d.dw / 2, fw / 2, -T, 0, wall);
    box(-fw / 2, fw / 2, -fd, -fd + T, wall);
    box(-fw / 2, -fw / 2 + T, -fd, 0, wall);
    box(fw / 2 - T, fw / 2, -fd, 0, wall);
    b.cols = cols;
    // the doorway, closed until something opens it (see game/buildings.js)
    b.doorBox = { ...rect(d.x - d.dw / 2, d.x + d.dw / 2, -T, 0), o: b, wall: true, door: true };
    b.doorCol = w.addCol({ ...b.doorBox });
    // the ground floor (its height is worked out by the 3D view from the ground under it)
    b.floor = { ...bbox(b, -fw / 2, fw / 2, -fd, -0.002), h: PLINTH, o: b, interior: true };
    w.addFloor(b.floor);
  }

  /** The furniture collides too (laid out lazily: when someone comes near or the island fills with people). */
  addFurniture(b) {
    if (b.furnished || !b.enterable) return;
    b.furnished = true;
    const w = this.world, L = layoutOf(b);
    for (const it of L.items) {
      if (it.ghost || !it.rect) continue;
      const r = it.rect, sh = 0.03;
      if (ROUND.has(it.k)) b.cols.push(w.addCol({ ...bw(b, it.x, it.z), r: Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2 - sh, o: b }));
      else {
        const q = bbox(b, r.x0 + sh, r.x1 - sh, r.z0 + sh, r.z1 - sh);
        b.cols.push(w.addCol({ x: (q.x0 + q.x1) / 2, y: (q.y0 + q.y1) / 2, hw: (q.x1 - q.x0) / 2, hd: (q.y1 - q.y0) / 2, o: b }));
      }
    }
  }

  removeInterior(b) {
    const w = this.world;
    for (const c of b.cols || []) w.removeCol(c);
    if (b.doorCol) w.removeCol(b.doorCol);
    if (b.floor) w.removeFloor(b.floor);
    b.cols = null; b.doorCol = null; b.floor = null; b.furnished = false;
  }

  remove(obj) {
    const list = this.chunks.get(obj._chunk);
    if (list) {
      const i = list.indexOf(obj);
      if (i >= 0) list.splice(i, 1);
    }
    this.byId.delete(obj.id);
    this.count--;
    if (obj.enterable) { this.removeInterior(obj); this.stamp(obj, 0); }
    else if (obj.soft) this.removeCollider(obj);
    else if (obj.block) this.stamp(obj, 0);
  }

  /** Mark or clear the tiles covered by an object's footprint. */
  stamp(obj, v) {
    const w = this.world;
    const fp = footprint(obj);
    for (let y = fp.y0; y < fp.y1; y++) {
      for (let x = fp.x0; x < fp.x1; x++) {
        if (y < 0 || y >= w.height) continue;
        w.blocked[w.idx(x, y)] = v;
      }
    }
  }

  /** Objects whose chunk intersects the rect [x0,x1]x[y0,y1] (x may wrap). */
  query(x0, y0, x1, y1, out = []) {
    const pad = 2; // big objects spill into neighbour chunks
    const cx0 = Math.floor(x0 / CHUNK) - pad, cx1 = Math.floor(x1 / CHUNK) + pad;
    const cy0 = Math.max(0, Math.floor(y0 / CHUNK) - pad), cy1 = Math.min(this.ch - 1, Math.floor(y1 / CHUNK) + pad);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const wcx = this.world.wrap ? ((cx % this.cw) + this.cw) % this.cw : cx;
        if (wcx < 0 || wcx >= this.cw) continue;
        const list = this.chunks.get(this.key(wcx, cy));
        if (list) for (const o of list) out.push(o);
      }
    }
    return out;
  }

  near(x, y, r, filter) {
    const out = [];
    for (const o of this.query(x - r, y - r, x + r, y + r)) {
      if (this.world.dist2(x, y, o.x, o.y) <= r * r && (!filter || filter(o))) out.push(o);
    }
    return out;
  }
}

/** Tile rect covered by an object (x,y is the base centre; w/d footprint; buildings turn: see bframe.js). */
export function footprint(o) {
  if (o.rot) {
    const r = bfoot(o);
    const x0 = Math.floor(r.x0 + 0.001), y0 = Math.floor(r.y0 + 0.001);
    return { x0, y0, x1: x0 + Math.round(r.x1 - r.x0), y1: y0 + Math.round(r.y1 - r.y0) };
  }
  const w = o.fw || 1, d = o.fd || 1;
  const x0 = Math.floor(o.x - w / 2 + 0.001), y0 = Math.floor(o.y - d + 0.001);
  return { x0, y0, x1: x0 + w, y1: y0 + d };
}
