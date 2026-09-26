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
    this.dist = new Uint8Array(width * height); // encoded signed distance
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
  /** Can a character stand here on foot? */
  walkable(x, y) {
    const t = this.type(x, y);
    return WALKABLE[t] === 1 && !this.isBlocked(x, y);
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
