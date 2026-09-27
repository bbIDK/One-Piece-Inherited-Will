// Runtime world: tile data + spatial queries. The surface map is W x H tiles and
// wraps on X. Special places (sky islands, Fish-Man Island, Impel Down, …) are
// separate "zones" that reuse this class with their own dimensions.
import { T, IS_LIQUID, WALKABLE, SAILABLE, SWIMMABLE, OVERLAY, SPEED, DAMAGE } from './tiles.js';

export class World {
  constructor(width, height, { wrap = true, zone = 0, id = 'surface' } = {}) {
    this.width = width;
    this.height = height;
    this.wrap = wrap;
    this.zone = zone; // 0 surface, 1 sky, 2 undersea, 3 interior/prison
    this.id = id;
    // RGBA per tile: type, elevation, climate, variant
    this.data = new Uint8Array(width * height * 4);
    this.blocked = new Uint8Array(width * height); // objects occupying tiles
    this.colliders = new Map(); // 4 m cell → small props' colliders (objects.js COLLIDE)
    this.colW = Math.ceil(width / 4);
    this.floors = new Map(); // 4 m cell → raised floors (rings, stages) over the ground
    this.dist = new Uint8Array(width * height); // encoded signed distance
    this.quays = new Set(); // tiles of the stone quays at the foot of piers (level with the deck)
    this.docks = new Map(); // tiles of the harbour piers (taller than bridges) → how the pier runs there
    this.dockPads = []; // the quays as rectangles, for blending the ground into them (see render3d/height.js)
    this.padIndex = null;
    this.objects = null; // ObjectIndex
    this.islands = []; // generated island records
    this.fogW = Math.ceil(width / 8);
    this.fogH = Math.ceil(height / 8);
    this.fog = new Uint8Array(this.fogW * this.fogH);
    this.fogDirty = false;
  }

  wx(x) {
    const w = this.width;
    return this.wrap ? ((x % w) + w) % w : x;
  }
  dx(a, b) {
    let d = b - a;
    if (!this.wrap) return d;
    const w = this.width;
    d %= w;
    if (d > w / 2) d -= w;
    else if (d < -w / 2) d += w;
    return d;
  }
  dist2(ax, ay, bx, by) {
    const dx = this.dx(ax, bx), dy = by - ay;
    return dx * dx + dy * dy;
  }
  distance(ax, ay, bx, by) { return Math.sqrt(this.dist2(ax, ay, bx, by)); }

  inBounds(x, y) {
    return y >= 0 && y < this.height && (this.wrap || (x >= 0 && x < this.width));
  }
  idx(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    return y * this.width + x;
  }

  type(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (y < 0 || y >= this.height) return this.zone === 1 ? T.CLOUD_SEA : T.PACK_ICE;
    if (!this.wrap && (x < 0 || x >= this.width)) return this.zone === 1 ? T.CLOUD_SEA : T.SEA;
    return this.data[this.idx(x, y) << 2];
  }
  elev(x, y) {
    if (!this.inBounds(Math.floor(x), Math.floor(y))) return 0;
    return this.data[(this.idx(x, y) << 2) + 1];
  }
  markQuay(x, y) { if (this.inBounds(Math.floor(x), Math.floor(y))) this.quays.add(this.idx(x, y)); }
  isQuay(x, y) { return this.quays.size > 0 && this.inBounds(Math.floor(x), Math.floor(y)) && this.quays.has(this.idx(x, y)); }
  /** A pier tile: `info` says which way the pier runs (vx, vy), how far out (a) and across (b) the tile is. */
  markDock(x, y, info = {}) { if (this.inBounds(Math.floor(x), Math.floor(y))) this.docks.set(this.idx(x, y), info); }
  isDock(x, y) { return this.docks.size > 0 && this.inBounds(Math.floor(x), Math.floor(y)) && this.docks.has(this.idx(x, y)); }
  dockAt(x, y) { return this.docks.size && this.inBounds(Math.floor(x), Math.floor(y)) ? this.docks.get(this.idx(x, y)) || null : null; }
  /** The quays whose ground ramp reaches tile corner (cx, cy) (indexed by 32-tile cell). */
  padsNear(cx, cy) {
    if (!this.dockPads.length) return null;
    const cw = Math.ceil(this.width / 32);
    const cell = (x) => (this.wrap ? ((x % cw) + cw) % cw : x);
    if (!this.padIndex) {
      this.padIndex = new Map();
      for (const p of this.dockPads) {
        // the quay and its ramps, and the pier running out from it (the ground beside it is cut down)
        let X0 = p.x0 - p.r, X1 = p.x1 + 1 + p.r, Y0 = p.y0 - p.r, Y1 = p.y1 + 1 + p.r;
        if (p.pierLen) {
          const ex = p.cx + p.vx * p.pierLen, ey = p.cy + p.vy * p.pierLen, wd = p.pierHalf + 4;
          X0 = Math.min(X0, ex - wd); X1 = Math.max(X1, ex + wd); Y0 = Math.min(Y0, ey - wd); Y1 = Math.max(Y1, ey + wd);
        }
        for (let y = Math.floor(Y0 / 32); y <= Math.floor(Y1 / 32); y++) {
          for (let x = Math.floor(X0 / 32); x <= Math.floor(X1 / 32); x++) {
            const k = y * 65536 + cell(x);
            let l = this.padIndex.get(k);
            if (!l) this.padIndex.set(k, (l = []));
            if (!l.includes(p)) l.push(p);
          }
        }
      }
    }
    return this.padIndex.get(Math.floor(cy / 32) * 65536 + cell(Math.floor(this.wx(cx) / 32))) || null;
  }

  climate(x, y) {
    if (!this.inBounds(Math.floor(x), Math.floor(y))) return 0;
    return this.data[(this.idx(x, y) << 2) + 2];
  }
  setType(x, y, t) {
    if (!this.inBounds(Math.floor(x), Math.floor(y))) return;
    this.data[this.idx(x, y) << 2] = t;
  }
  setTile(x, y, t, elev, clim) {
    if (!this.inBounds(Math.floor(x), Math.floor(y))) return;
    const i = this.idx(x, y) << 2;
    this.data[i] = t;
    if (elev !== undefined) this.data[i + 1] = elev;
    if (clim !== undefined) this.data[i + 2] = clim;
  }

  /** Signed distance to the coast in tiles (+ land, - water). Bilinear. */
  sd(x, y) {
    const fx = x - 0.5, fy = y - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const s = (xx, yy) => {
      if (yy < 0 || yy >= this.height) return -32;
      if (!this.wrap && (xx < 0 || xx >= this.width)) return -32;
      return (this.dist[this.idx(xx, yy)] - 128) * 0.25;
    };
    const a = s(x0, y0), b = s(x0 + 1, y0), c = s(x0, y0 + 1), d = s(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  isLiquid(x, y) { return IS_LIQUID[this.type(x, y)] === 1; }
  isOverlay(x, y) { return OVERLAY[this.type(x, y)] === 1; }
  isBlocked(x, y) {
    if (!this.inBounds(Math.floor(x), Math.floor(y))) return true;
    return this.blocked[this.idx(x, y)] !== 0;
  }
  /**
   * Solid to walk into? Like isBlocked, except the floor inside an enterable
   * building (marked 2): its walls and furniture collide as colliders instead.
   * isBlocked still counts it (nothing spawns or grows indoors).
   */
  solid(x, y) {
    if (!this.inBounds(Math.floor(x), Math.floor(y))) return true;
    return this.blocked[this.idx(x, y)] === 1;
  }
  /** Register a collider ({ x, y, r } circle or { x, y, hw, hd } box) in the 4 m hash. */
  addCol(col) {
    const ex = col.r ?? col.hw, ey = col.r ?? col.hd;
    col.keys = [];
    for (let cy = Math.floor((col.y - ey) / 4); cy <= Math.floor((col.y + ey) / 4); cy++) {
      for (let cx = Math.floor((col.x - ex) / 4); cx <= Math.floor((col.x + ex) / 4); cx++) {
        const k = this.colKey(cx, cy);
        let list = this.colliders.get(k);
        if (!list) this.colliders.set(k, (list = []));
        list.push(col);
        col.keys.push(k);
      }
    }
    return col;
  }
  removeCol(col) {
    if (!col?.keys) return;
    for (const k of col.keys) {
      const list = this.colliders.get(k);
      if (!list) continue;
      const i = list.indexOf(col);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.colliders.delete(k);
    }
    col.keys = null;
  }
  colKey(cx, cy) {
    if (this.wrap) cx = ((cx % this.colW) + this.colW) % this.colW;
    return cy * this.colW + cx;
  }
  /** A raised floor you can stand on (x0..x1 × y0..y1, h metres over the ground). */
  addFloor(f) {
    for (let cy = Math.floor(f.y0 / 4); cy <= Math.floor(f.y1 / 4); cy++) {
      for (let cx = Math.floor(f.x0 / 4); cx <= Math.floor(f.x1 / 4); cx++) {
        const k = this.colKey(cx, cy);
        let list = this.floors.get(k);
        if (!list) this.floors.set(k, (list = []));
        list.push(f);
      }
    }
  }
  removeFloor(f) {
    for (const [k, list] of this.floors) {
      const i = list.indexOf(f);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.floors.delete(k);
    }
  }
  /** The raised floor under (x, y) (a ring, a stage, a building's ground floor), or null. */
  floorRec(x, y) {
    if (!this.floors.size) return null;
    const list = this.floors.get(this.colKey(Math.floor(this.wx(x) / 4), Math.floor(y / 4)));
    if (!list) return null;
    for (const f of list) {
      const dx = this.dx(f.x0, x);
      if (dx >= 0 && dx <= f.x1 - f.x0 && y >= f.y0 && y <= f.y1) return f;
    }
    return null;
  }
  /** Height of a raised floor under (x, y), or 0. */
  floorAt(x, y) { return this.floorRec(x, y)?.h || 0; }
  /** The enterable building whose ground floor (x, y) is on, or null. */
  interiorAt(x, y) { const f = this.floorRec(x, y); return f && f.interior ? f.o : null; }

  /** Does a circle of radius r at (x, y) overlap a small prop (lamp, barrel, tree trunk...)? */
  hitsProp(x, y, r, wallsOnly = false) {
    if (!this.colliders.size) return false;
    for (let cy = Math.floor((y - r) / 4); cy <= Math.floor((y + r) / 4); cy++) {
      for (let cx = Math.floor((x - r) / 4); cx <= Math.floor((x + r) / 4); cx++) {
        const list = this.colliders.get(this.colKey(cx, cy));
        if (!list) continue;
        for (const c of list) {
          if (wallsOnly && !c.wall) continue;
          const dx = this.dx(c.x, x), dy = y - c.y;
          if (c.r !== undefined) { const rr = c.r + r; if (dx * dx + dy * dy < rr * rr) return true; }
          else {
            const qx = Math.max(Math.abs(dx) - c.hw, 0), qy = Math.max(Math.abs(dy) - c.hd, 0);
            if (qx * qx + qy * qy < r * r) return true;
          }
        }
      }
    }
    return false;
  }

  /** Can a character stand here on foot? */
  walkable(x, y) {
    const t = this.type(x, y);
    return WALKABLE[t] === 1 && !this.solid(x, y);
  }
  swimmable(x, y) { return SWIMMABLE[this.type(x, y)] === 1 && !this.isBlocked(x, y); }
  sailable(x, y) {
    const t = this.type(x, y);
    return SAILABLE[t] === 1 && !this.isBlocked(x, y);
  }
  speedAt(x, y) { return SPEED[this.type(x, y)]; }
  damageAt(x, y) { return DAMAGE[this.type(x, y)]; }

  /** Mark a circle of the fog-of-war as explored. */
  reveal(x, y, r) {
    const fx = Math.floor(this.wx(x) / 8), fy = Math.floor(y / 8), fr = Math.ceil(r / 8);
    for (let j = -fr; j <= fr; j++) {
      const yy = fy + j;
      if (yy < 0 || yy >= this.fogH) continue;
      for (let i = -fr; i <= fr; i++) {
        if (i * i + j * j > fr * fr) continue;
        let xx = fx + i;
        if (this.wrap) xx = ((xx % this.fogW) + this.fogW) % this.fogW;
        else if (xx < 0 || xx >= this.fogW) continue;
        const k = yy * this.fogW + xx;
        if (this.fog[k] !== 255) { this.fog[k] = 255; this.fogDirty = true; }
      }
    }
  }
  isExplored(x, y) {
    const fx = Math.floor(this.wx(x) / 8), fy = Math.floor(y / 8);
    if (fy < 0 || fy >= this.fogH) return false;
    return this.fog[fy * this.fogW + fx] > 0;
  }

  islandAt(x, y) {
    x = this.wx(x);
    for (const isl of this.islands) {
      const b = isl.bbox;
      const dx = this.dx(b.cx, x);
      if (Math.abs(dx) <= b.hw && y >= b.y0 && y <= b.y1) {
        if (!isl.containsTile || isl.containsTile(x, y)) return isl;
      }
    }
    return null;
  }

  nearestIsland(x, y, maxDist = Infinity) {
    let best = null, bd = maxDist * maxDist;
    for (const isl of this.islands) {
      const d = this.dist2(x, y, isl.x, isl.y);
      if (d < bd) { bd = d; best = isl; }
    }
    return best;
  }

  /** Straight-line clearance test for walking/sailing (used by AI). */
  lineClear(ax, ay, bx, by, test) {
    const dx = this.dx(ax, bx), dy = by - ay;
    const steps = Math.ceil(Math.hypot(dx, dy) * 2);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!test(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }
}
