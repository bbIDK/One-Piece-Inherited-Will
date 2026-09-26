// Props placed in the world (trees, rocks, buildings, docks furniture...).
// Stored in a chunked spatial index so rendering and interaction only look
// at nearby objects.

export const CHUNK = 32;

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
    if (obj.block) this.stamp(obj, 1);
    return obj;
  }

  remove(obj) {
    const list = this.chunks.get(obj._chunk);
    if (list) {
      const i = list.indexOf(obj);
      if (i >= 0) list.splice(i, 1);
    }
    this.byId.delete(obj.id);
    this.count--;
    if (obj.block) this.stamp(obj, 0);
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

/** Tile rect covered by an object (x,y is the base centre; w/d footprint). */
export function footprint(o) {
  const w = o.fw || 1, d = o.fd || 1;
  const x0 = Math.floor(o.x - w / 2 + 0.001), y0 = Math.floor(o.y - d + 0.001);
  return { x0, y0, x1: x0 + w, y1: y0 + d };
}
