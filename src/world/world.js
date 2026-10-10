// Runtime world: tile data + spatial queries. The surface map is W x H tiles and
// wraps on X. Special places (sky islands, Fish-Man Island, Impel Down, …) are
// separate "zones" that reuse this class with their own dimensions.
//
// The surface is tens of kilometres across, so tiles are kept in 32 × 32
// blocks and only the blocks that differ from their surroundings take memory:
//  * a block nobody has written to is uniform (open sea, say): one type,
//    elevation and climate for all of it;
//  * or it is "procedural" (MIXED): the Red Line and the polar ice are worked
//    out from a formula (world.base) — on first use such a block is filled in
//    and kept, and pristine ones are let go again when too many pile up;
//  * writing a tile makes its block real (islands, canals, docks).
// The coastline distance and the "something stands here" marks live in
// blocks of their own, made only where needed.
import { T, IS_LIQUID, WALKABLE, SAILABLE, SWIMMABLE, OVERLAY, SPEED, DAMAGE } from './tiles.js';

export const BS = 32; // tiles per block side
const BSH = 5; // log2(BS)
const BM = BS - 1;
const BN = BS * BS;
export const MIXED = 255; // a block's uniform type: "ask world.base"
const PRISTINE_MAX = 6000; // procedural blocks kept filled in (≈ 30 MB)

/** The per-tile variation byte (0..127): a hash of the position. */
export const variantAt = (x, y) => (Math.imul((Math.imul(y, 0x9E3779B1) ^ x) >>> 0, 2654435761) >>> 25) & 127;

/** How tall the low things you can jump over are (m): over their tops, they're no wall. */
const PROP_TOP = { signboard: 1.15, barrel: 1.0, crate: 0.9, planter: 0.6, sacks: 0.75, chest: 0.65, mooring: 0.6, haystack: 1.2, bench: 0.5, stump: 0.5, rock: 0.7 };

export class World {
  constructor(width, height, { wrap = true, zone = 0, id = 'surface', fill = T.SEA, fogCell = 8 } = {}) {
    this.width = width;
    this.height = height;
    this.wrap = wrap;
    this.zone = zone; // 0 surface, 1 sky, 2 undersea, 3 interior/prison
    this.id = id;
    this.bw = Math.ceil(width / BS);
    this.bh = Math.ceil(height / BS);
    const nb = this.bw * this.bh;
    // tiles: RGBA per tile (type, elevation, climate, variant), per block
    this.bd = new Array(nb).fill(null);
    this.ut = new Uint8Array(nb).fill(fill); // uniform type (or MIXED)
    this.ue = new Uint8Array(nb); // uniform elevation
    this.uc = new Uint8Array(nb); // uniform climate
    // coastline distance (encoded 128 + 4 × tiles) per block, or a uniform value
    this.bs = new Array(nb).fill(null);
    this.us = new Uint8Array(nb).fill(IS_LIQUID[fill] ? 0 : 255);
    // objects occupying tiles (1 solid, 2 floor of an enterable building)
    this.bo = new Array(nb).fill(null);
    this.base = null; // { tile(x, y, out), dist(x, y), hasLand(bx, by) } for MIXED blocks
    this.pristine = new Map(); // procedural blocks filled in on demand (oldest first)
    this.editedMixed = new Set(); // procedural blocks something was built into (their coast is measured)
    this.colliders = new Map(); // 4 m cell → small props' colliders (objects.js COLLIDE)
    this.colW = Math.ceil(width / 4);
    this.floors = new Map(); // 4 m cell → raised floors (rings, stages) over the ground
    this.quays = new Set(); // tiles of the stone quays at the foot of piers (level with the deck)
    this.docks = new Map(); // tiles of the harbour piers (taller than bridges) → how the pier runs there
    this.dockPads = []; // the quays as rectangles, for blending the ground into them (see render3d/height.js)
    this.padIndex = null;
    this.objects = null; // ObjectIndex
    this.islands = []; // generated island records
    this.fogCell = fogCell; // tiles per fog-of-war cell
    this.fogW = Math.ceil(width / fogCell);
    this.fogH = Math.ceil(height / fogCell);
    this.fog = new Uint8Array(this.fogW * this.fogH);
    this.fogDirty = false;
    this.fogRect = null; // cells changed since the last upload
    this._t = [0, 0, 0];
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
  /** A tile's number (a key for sets and maps: y × width + x). */
  idx(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    return y * this.width + x;
  }

  // --- blocks ---------------------------------------------------------------------
  /** The tile data of block b, filled in if it is procedural (null if uniform). */
  _read(b) {
    const d = this.bd[b];
    if (d || this.ut[b] !== MIXED) return d;
    return this._fill(b, true);
  }
  /** Make block b real (to write to it). */
  _mat(b) {
    let d = this.bd[b];
    if (d) {
      if (this.pristine.size && this.pristine.delete(b)) { d.edited = true; this.editedMixed?.add(b); }
      return d;
    }
    if (this.ut[b] === MIXED) { d = this._fill(b, false); this.editedMixed?.add(b); return d; }
    d = new Uint8Array(BN * 4);
    const t = this.ut[b], e = this.ue[b], c = this.uc[b];
    const x0 = (b % this.bw) << BSH, y0 = Math.floor(b / this.bw) << BSH;
    for (let i = 0; i < BN; i++) {
      const o = i << 2;
      d[o] = t; d[o + 1] = e; d[o + 2] = c; d[o + 3] = variantAt(x0 + (i & BM), y0 + (i >> BSH));
    }
    this.bd[b] = d;
    return d;
  }
  /** Fill in a procedural block from world.base; `keepLoose` lets it go again later. */
  _fill(b, keepLoose) {
    const d = new Uint8Array(BN * 4);
    const x0 = (b % this.bw) << BSH, y0 = Math.floor(b / this.bw) << BSH;
    const out = this._t, base = this.base;
    for (let i = 0; i < BN; i++) {
      const x = x0 + (i & BM), y = y0 + (i >> BSH);
      base.tile(x, y, out);
      const o = i << 2;
      d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = variantAt(x, y);
    }
    this.bd[b] = d;
    if (keepLoose) {
      this.pristine.set(b, d);
      if (this.pristine.size > PRISTINE_MAX) {
        // let the oldest go (they are filled in again when next needed)
        let n = this.pristine.size - PRISTINE_MAX + 256;
        for (const k of this.pristine.keys()) { if (n-- <= 0) break; this.pristine.delete(k); this.bd[k] = null; }
      }
    } else d.edited = true;
    return d;
  }
  /** Block number and index within the block of an in-bounds tile (x already wrapped). */
  _b(x, y) { return (y >> BSH) * this.bw + (x >> BSH); }

  /** Fill a whole world (zones) with one tile. */
  fillAll(t, elev = 0, clim = 0) {
    this.bd.fill(null); this.pristine.clear();
    this.ut.fill(t); this.ue.fill(elev); this.uc.fill(clim);
    this.us.fill(IS_LIQUID[t] ? 0 : 255);
  }
  /** Does block (bx, by) hold any land (or deck)? */
  blockHasLand(bx, by) {
    const b = by * this.bw + bx;
    const d = this.bd[b];
    if (d) { for (let i = 0; i < BN * 4; i += 4) if (d[i] >= 16) return true; return false; }
    if (this.ut[b] === MIXED) return this.base?.hasLand ? this.base.hasLand(bx, by) : true;
    return this.ut[b] >= 16;
  }
  /** Is block (bx, by) all one open (never written, not procedural) tile? */
  blockUniform(bx, by) {
    const b = by * this.bw + bx;
    return !this.bd[b] && this.ut[b] !== MIXED ? this.ut[b] : -1;
  }

  type(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (y < 0 || y >= this.height) return this.zone === 1 ? T.CLOUD_SEA : T.PACK_ICE;
    if (x < 0 || x >= this.width) {
      if (!this.wrap) return this.zone === 1 ? T.CLOUD_SEA : T.SEA;
      x = ((x % this.width) + this.width) % this.width;
    }
    const b = (y >> BSH) * this.bw + (x >> BSH);
    const d = this.bd[b];
    if (d) return d[(((y & BM) << BSH) | (x & BM)) << 2];
    const u = this.ut[b];
    // (a procedural block's tile type is cheap to work out: no need to fill it in)
    return u !== MIXED ? u : this.base.type(x, y);
  }
  elev(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return 0;
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    const b = (y >> BSH) * this.bw + (x >> BSH);
    const d = this._read(b);
    return d ? d[((((y & BM) << BSH) | (x & BM)) << 2) + 1] : this.ue[b];
  }
  climate(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return 0;
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    const b = (y >> BSH) * this.bw + (x >> BSH);
    const d = this._read(b);
    return d ? d[((((y & BM) << BSH) | (x & BM)) << 2) + 2] : this.uc[b];
  }
  /** The tile's variation byte (0..127). */
  variant(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return 0;
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    const d = this._read(this._b(x, y));
    return d ? d[((((y & BM) << BSH) | (x & BM)) << 2) + 3] : variantAt(x, y);
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

  setType(x, y, t) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    const d = this._mat(this._b(x, y));
    d[(((y & BM) << BSH) | (x & BM)) << 2] = t;
  }
  setTile(x, y, t, elev, clim) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    const d = this._mat(this._b(x, y));
    const i = (((y & BM) << BSH) | (x & BM)) << 2;
    d[i] = t;
    if (elev !== undefined) d[i + 1] = elev;
    if (clim !== undefined) d[i + 2] = clim;
  }
  setElev(x, y, e) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    this._mat(this._b(x, y))[((((y & BM) << BSH) | (x & BM)) << 2) + 1] = e;
  }

  /** 1 for ground (not a deck over water), 0 for water, for tiles x..x+n-1 of row y, into out[off..]. */
  solidRow(y, x, n, out, off) {
    const W = this.width;
    for (let i = 0; i < n;) {
      let xx = x + i;
      if (this.wrap) { if (xx < 0 || xx >= W) xx = ((xx % W) + W) % W; }
      else xx = xx < 0 ? 0 : xx >= W ? W - 1 : xx;
      const run = this.wrap || (x + i >= 0 && x + i < W) ? Math.min(n - i, BS - (xx & BM)) : 1;
      const b = (y >> BSH) * this.bw + (xx >> BSH);
      const d = this.bd[b];
      if (d) {
        let o = (((y & BM) << BSH) | (xx & BM)) << 2;
        for (let k = 0; k < run; k++, o += 4) { const t = d[o]; out[off + i + k] = t >= 16 && !OVERLAY[t] ? 1 : 0; }
      } else if (this.ut[b] === MIXED) {
        for (let k = 0; k < run; k++) { const t = this.base.type(xx + k, y); out[off + i + k] = t >= 16 && !OVERLAY[t] ? 1 : 0; }
      } else {
        const t = this.ut[b];
        out.fill(t >= 16 && !OVERLAY[t] ? 1 : 0, off + i, off + i + run);
      }
      i += run;
    }
  }
  /** Store encoded coastline distances for tiles x..x+n-1 of row y from vals[off..]. */
  setDistRow(y, x, n, vals, off) {
    const W = this.width;
    for (let i = 0; i < n;) {
      let xx = x + i;
      if (this.wrap) { if (xx < 0 || xx >= W) xx = ((xx % W) + W) % W; }
      else if (xx < 0 || xx >= W) { i++; continue; }
      const run = Math.min(n - i, BS - (xx & BM), this.wrap ? n : W - xx);
      const b = (y >> BSH) * this.bw + (xx >> BSH);
      let s = this.bs[b];
      if (!s) {
        const u = this.ut[b] === MIXED ? -1 : this.us[b];
        let same = u >= 0;
        for (let k = 0; k < run && same; k++) if (vals[off + i + k] !== u) same = false;
        if (same) { i += run; continue; }
        s = this._distBlock(b);
      }
      const o = ((y & BM) << BSH) | (xx & BM);
      for (let k = 0; k < run; k++) s[o + k] = vals[off + i + k];
      i += run;
    }
  }

  /** The encoded coastline distance (128 + 4 × tiles) at an integer tile. */
  distRaw(x, y) {
    if (y < 0 || y >= this.height) return 0;
    if (x < 0 || x >= this.width) {
      if (!this.wrap) return 0;
      x = ((x % this.width) + this.width) % this.width;
    }
    const b = (y >> BSH) * this.bw + (x >> BSH);
    const s = this.bs[b];
    if (s) return s[((y & BM) << BSH) | (x & BM)];
    return this.ut[b] === MIXED ? this.base.dist(x, y) : this.us[b];
  }
  /** Store an encoded coastline distance (only where it differs from the block's own). */
  setDistRaw(x, y, v) {
    const b = (y >> BSH) * this.bw + (x >> BSH);
    let s = this.bs[b];
    if (!s) {
      if (v === (this.ut[b] === MIXED ? -1 : this.us[b])) return;
      s = this._distBlock(b);
    }
    s[((y & BM) << BSH) | (x & BM)] = v;
  }
  /** Give block b a coastline-distance array of its own (filled with what it had). */
  _distBlock(b) {
    const s = this.bs[b] = new Uint8Array(BN);
    if (this.ut[b] !== MIXED) s.fill(this.us[b]);
    else {
      const x0 = (b % this.bw) << BSH, y0 = Math.floor(b / this.bw) << BSH;
      for (let i = 0; i < BN; i++) s[i] = this.base.dist(x0 + (i & BM), y0 + (i >> BSH));
    }
    return s;
  }

  /** Signed distance to the coast in tiles (+ land, - water). Bilinear. */
  sd(x, y) {
    const fx = x - 0.5, fy = y - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const s = (xx, yy) => (this.distRaw(xx, yy) - 128) * 0.25;
    const a = s(x0, y0), b = s(x0 + 1, y0), c = s(x0, y0 + 1), d = s(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  isLiquid(x, y) { return IS_LIQUID[this.type(x, y)] === 1; }
  isOverlay(x, y) { return OVERLAY[this.type(x, y)] === 1; }
  isBlocked(x, y) { return this.blockedAt(x, y) !== 0; }
  /** What stands on a tile: 0 nothing, 1 solid, 2 an enterable building's floor (outside the world: 1). */
  blockedAt(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (y < 0 || y >= this.height) return 1;
    if (x < 0 || x >= this.width) {
      if (!this.wrap) return 1;
      x = ((x % this.width) + this.width) % this.width;
    }
    const o = this.bo[(y >> BSH) * this.bw + (x >> BSH)];
    return o ? o[((y & BM) << BSH) | (x & BM)] : 0;
  }
  setBlocked(x, y, v) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    if (this.wrap) x = ((x % this.width) + this.width) % this.width;
    const b = (y >> BSH) * this.bw + (x >> BSH);
    let o = this.bo[b];
    if (!o) { if (!v) return; o = this.bo[b] = new Uint8Array(BN); }
    o[((y & BM) << BSH) | (x & BM)] = v;
  }
  /**
   * Solid to walk into? Like isBlocked, except the floor inside an enterable
   * building (marked 2): its walls and furniture collide as colliders instead.
   * isBlocked still counts it (nothing spawns or grows indoors).
   */
  solid(x, y) { return this.blockedAt(x, y) === 1; }
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
  /** The building someone is inside (not on its roof: see game/actor.js roofed), or null. */
  roomOf(a) { return a.roofed || a.upTop ? null : this.interiorAt(a.x, a.y); }

  /** Does a circle of radius r at (x, y) overlap a small prop (lamp, barrel, tree trunk...)? */
  hitsProp(x, y, r, wallsOnly = false, feet = null) {
    if (!this.colliders.size) return false;
    for (let cy = Math.floor((y - r) / 4); cy <= Math.floor((y + r) / 4); cy++) {
      for (let cx = Math.floor((x - r) / 4); cx <= Math.floor((x + r) / 4); cx++) {
        const list = this.colliders.get(this.colKey(cx, cy));
        if (!list) continue;
        for (const c of list) {
          if (wallsOnly && !c.wall) continue;
          // (over the top of something low — a sandwich board, a barrel — in a jump: clear of it)
          if (feet !== null && c.o && PROP_TOP[c.o.kind] !== undefined && feet >= PROP_TOP[c.o.kind] * (c.o.s || 1)) continue;
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
    const F = this.fogCell;
    const fx = Math.floor(this.wx(x) / F), fy = Math.floor(y / F), fr = Math.ceil(r / F);
    for (let j = -fr; j <= fr; j++) {
      const yy = fy + j;
      if (yy < 0 || yy >= this.fogH) continue;
      for (let i = -fr; i <= fr; i++) {
        if (i * i + j * j > fr * fr) continue;
        let xx = fx + i;
        if (this.wrap) xx = ((xx % this.fogW) + this.fogW) % this.fogW;
        else if (xx < 0 || xx >= this.fogW) continue;
        const k = yy * this.fogW + xx;
        if (this.fog[k] !== 255) {
          this.fog[k] = 255; this.fogDirty = true;
          const R = this.fogRect;
          if (!R) this.fogRect = { x0: xx, y0: yy, x1: xx, y1: yy };
          else { if (xx < R.x0) R.x0 = xx; if (xx > R.x1) R.x1 = xx; if (yy < R.y0) R.y0 = yy; if (yy > R.y1) R.y1 = yy; }
        }
      }
    }
  }
  /** How explored (0..1) round (x, y): the fog-of-war cells blended, for soft edges. */
  exploredAt(x, y) {
    const F = this.fogCell;
    const fx = this.wx(x) / F - 0.5, fy = y / F - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const c = (i, j) => {
      if (j < 0 || j >= this.fogH) return 0;
      if (this.wrap) i = ((i % this.fogW) + this.fogW) % this.fogW; else if (i < 0 || i >= this.fogW) return 0;
      return this.fog[j * this.fogW + i];
    };
    const a = c(ix, iy), b = c(ix + 1, iy), d = c(ix, iy + 1), e = c(ix + 1, iy + 1);
    return ((a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty) / 255;
  }
  isExplored(x, y) {
    const F = this.fogCell;
    const fx = Math.floor(this.wx(x) / F), fy = Math.floor(y / F);
    if (fy < 0 || fy >= this.fogH || fx < 0 || fx >= this.fogW) return false;
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
