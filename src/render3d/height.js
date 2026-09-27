// The 3D height model. The game simulation stays on the 2D tile plane; this
// turns a tile map (type, elevation, coastline distance) into ground heights
// in metres (1 tile = 1 m, sea level = 0) so the 3D view, the camera and every
// entity agree on where the ground is.
//
//  * Land rises from the waterline over a few tiles to its tile elevation.
//  * Mountains, cliffs and the Red Line get extra height so they tower.
//  * Water tiles slope down to a sea floor.
//  * Decks (docks, bridges, sea-train rails) are platforms above the water.
//  * Walls are vertical blocks (see WALL_H), not hills.
import { T, IS_LIQUID, OVERLAY } from '../world/tiles.js';
import { RM_X, RL_HALF, chart } from '../world/constants.js';
import { RM, canalAt, coneAt, nearRM } from '../world/reverseMountain.js';
import { PLINTH } from '../world/interiors.js';
import { bw, bl, bfoot } from '../world/bframe.js';

export const SEA_Y = 0;
export const DECK_Y = 0.55; // top of bridges (and sea-train tracks)
export const DOCK_Y = 1.5; // top of the harbour piers and their stone quays

/** The top of the deck at an overlay tile: a harbour pier stands taller than a bridge. */
export const deckTop = (world, x, y) => (world.docks?.size && world.isDock(x, y) ? DOCK_Y : DECK_Y);
export const WALL_H = 3.2; // town walls, prison walls
export const CHUNK = 32; // tiles per terrain chunk side

const ELEV_K = 0.075; // metres per elevation unit
const BOOST = new Float32Array(256);
BOOST[T.MOUNTAIN] = 7;
BOOST[T.CLIFF] = 4;
BOOST[T.SNOWROCK] = 9;
BOOST[T.RED_ROCK] = 0; // the Red Line gets its own curve below
BOOST[T.ROCK] = 1.2;
BOOST[T.FOREST] = 0.3;
BOOST[T.JUNGLE] = 0.4;

export const isWallTile = (t) => t === T.WALL;

/** The height of the water's surface at (x, y): the sea, or up Reverse Mountain in its canals. */
export function waterLevel(world, x, y) {
  if (world.zone !== 0 || world.type(x, y) !== T.RAPIDS) return SEA_Y;
  const k = canalAt(world.wx(x), y, 60);
  return k ? k.level : SEA_Y;
}

/** Is this surface tile part of the Red Line (or the Reverse Mountain massif)? */
function onRedLine(world, x) {
  if (world.zone !== 0) return false;
  const dm = Math.abs(world.dx(x, RM_X)), ds = Math.abs(world.dx(x, 0));
  return dm < RL_HALF + chart(90) || ds < RL_HALF + chart(30);
}

/** Height of one land tile before the coastal ramp. */
function landHeight(world, x, t, e) {
  if (t === T.RED_ROCK || (t === T.SNOWROCK && onRedLine(world, x))) {
    // the Red Line: a wall of red rock that dwarfs everything
    return 38 + Math.max(0, e - 90) * 0.55 + (t === T.SNOWROCK ? 9 : 0);
  }
  return 0.45 + Math.min(e, 190) * ELEV_K + BOOST[t];
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Smooth value noise in [0, 1). */
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (i, j) => {
    let v = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * The sea floor (metres, negative) by distance from the coast: a sandy shelf
 * you can nearly stand on by the beach, a drop-off, a slope into deep water,
 * and far out at sea a rolling abyss 35–60 m down. (Zones keep their own
 * shallow basins.)
 */
function seaFloor(world, cx, cy, sd) {
  if (world.zone !== 0) return Math.max(-12, sd * 0.9) - 0.25;
  const d = -sd; // tiles out from the coast (the distance field stops at 32)
  let h;
  if (d < 5) h = -0.25 - d * 0.3;
  else if (d < 14) h = -1.75 - (d - 5) * 0.95;
  else h = -10.3 - (d - 14) * 1.3;
  if (d > 24) {
    const k = smooth(24, 32, d);
    const abyss = -(35 + vnoise(cx * 0.004, cy * 0.004) * 25);
    h = h * (1 - k) + abyss * k;
  }
  // sand ripples, rocks and hollows on the bottom
  h += (vnoise(cx * 0.19, cy * 0.19) - 0.5) * Math.min(1.4, d * 0.09);
  return h;
}

/**
 * Height at a tile corner (integer cx, cy). Averages the land tiles around the
 * corner and ramps down to the waterline using the smooth coastline distance.
 */
export function cornerHeight(world, cx, cy) {
  const h = naturalHeight(world, cx, cy);
  const pads = world.dockPads?.length ? world.padsNear(cx, cy) : null;
  return pads ? quayRamp(world, cx, cy, h, pads) : h;
}

/**
 * The ground round a harbour quay: level with the pier under the quay itself,
 * ramping smoothly back to the lie of the land over a few metres behind and
 * beside it (never out into the water in front: the sea wall stands there).
 */
function quayRamp(world, cx, cy, h, pads) {
  for (const p of pads) {
    const dx = world.dx(p.cx, cx), dy = cy - p.cy;
    const along = dx * p.vx + dy * p.vy; // + out to sea
    if (along > -0.01) {
      // alongside the pier out over the water: no bank of sand standing
      // higher than the deck (it would bulge up through it) — the ground is
      // cut down beside it and rises gently back to the beach
      if (p.pierLen && along < p.pierLen) {
        const side = Math.abs(dy * p.vx - dx * p.vy) - p.pierHalf;
        if (side < 4) {
          const cap = DOCK_Y - 0.45 + Math.max(0, side) * 0.8;
          if (h > cap) h = cap;
        }
      }
      continue;
    }
    const across = Math.abs(dy * p.vx - dx * p.vy);
    const d = Math.hypot(Math.max(0, -p.depth - along), Math.max(0, across - p.halfW));
    // (the further the ground has to come down (or up) to the quay, the longer the ramp)
    const R = Math.min(p.r, 3 + Math.abs(h - DOCK_Y) * 0.8);
    if (d >= R) continue;
    // (the beach down at the water's edge stays a beach)
    const w = d <= 0 ? 1 : (1 - smooth(0, R, d)) * smooth(-0.3, 0.7, h);
    h += (DOCK_Y - 0.06 - h) * w;
  }
  return h;
}

/** Height at a tile corner before anything is built on it. */
function naturalHeight(world, cx, cy) {
  let sum = 0, n = 0, walls = 0, tall = 0, rapids = 0;
  for (let j = -1; j <= 0; j++) {
    for (let i = -1; i <= 0; i++) {
      const x = cx + i, y = cy + j;
      const t = world.type(x, y);
      if (t === T.RAPIDS) rapids++;
      if (IS_LIQUID[t] || OVERLAY[t]) continue;
      if (t === T.WALL) { walls++; continue; }
      const h = landHeight(world, x, t, world.elev(x, y));
      sum += h; n++;
      if (h > tall) tall = h;
    }
  }
  const sd = world.sd(cx, cy);
  // Reverse Mountain: its canals run up the mountain, so their water (and
  // the banks either side) are as high as the canal has climbed
  const rm = world.zone === 0 && nearRM(cx, cy) ? rmShape(cx, cy, !!rapids) : null;
  if (!n) {
    if (walls) return 0.4; // wall blocks stand on flat ground
    if (rm && rapids) return rm.level - 2.4; // the canal's bed
    return seaFloor(world, cx, cy, sd);
  }
  // mostly keep the average, but let peaks read as peaks
  let land = sum / n * 0.75 + tall * 0.25;
  const base = rm ? rm.level : 0;
  if (rm) land = Math.min(land + rm.cone, rm.bank);
  if (sd <= 0) return base + 0.2 + sd * 0.4;
  return base + 0.25 + (land - base - 0.25) * smooth(0, 3.2, sd);
}

/**
 * Reverse Mountain at a tile corner: the mountain on the Red Line (cone), the
 * water level of the nearest canal (level) and how high the rock may stand
 * there (bank: the canal's groove, with steep walls).
 */
const RMS = { cone: 0, level: 0, bank: 0 };
function rmShape(cx, cy, wet) {
  const cone = coneAt(cx, cy);
  const k = canalAt(cx, cy, 90);
  const pd = Math.hypot(cx - RM.x, cy - RM.y);
  if (!k && pd > RM.poolR + 90) { if (!cone) return null; RMS.cone = cone; RMS.level = 0; RMS.bank = 1e9; return RMS; }
  let level = k ? k.level : RM.top, bank = 1e9;
  const rough = (vnoise(cx * 0.21, cy * 0.21) - 0.5) * 1.6;
  if (k) bank = k.level + 1.6 + Math.max(0, k.d - RM.halfW) * 2.6 + rough;
  // the rim of the summit pool
  if (pd < RM.poolR + 90) {
    const rim = RM.top + 1.6 + Math.max(0, pd - RM.poolR) * 2.2 + rough;
    if (rim < bank) bank = rim;
    if (pd < RM.poolR + 4 && (!k || wet)) level = RM.top;
  }
  RMS.cone = cone; RMS.level = level; RMS.bank = bank;
  return RMS;
}

/**
 * Per-world cache of chunk height grids ((CHUNK+1)^2 corners each), shared by
 * the terrain meshes and by ground queries for entities.
 */
export class HeightField {
  constructor(world) {
    this.world = world;
    this.chunks = new Map();
    this.cw = Math.ceil(world.width / CHUNK);
    this.ch = Math.ceil(world.height / CHUNK);
  }

  key(cx, cy) { return cy * 100000 + cx; }

  /** Height grid for chunk (cx, cy); cx is wrapped for wrapping worlds. */
  grid(cx, cy) {
    const w = this.world;
    if (w.wrap) cx = ((cx % this.cw) + this.cw) % this.cw;
    const k = this.key(cx, cy);
    let g = this.chunks.get(k);
    if (g) return g;
    const N = CHUNK + 1;
    g = new Float32Array(N * N);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) g[j * N + i] = cornerHeight(w, x0 + i, y0 + j);
    }
    // the ground inside a walk-in building is dug down to the street in front
    // of it (the walls hide the cut), so its floor is a step up from the street
    if (w.objects) {
      for (const b of w.objects.query(x0 - 12, y0 - 12, x0 + CHUNK + 12, y0 + CHUNK + 12)) {
        if (!b.enterable) continue;
        const r = bfoot(b);
        const bx0 = r.x0, bx1 = r.x1, by0 = r.y0, by1 = r.y1;
        // the street level: the front edge's corners (outside the cut)
        const fc = bw(b, 0, 0);
        const front = cornerHeight(w, Math.round(fc.x), Math.round(fc.y));
        for (let j = 0; j < N; j++) {
          const cy = y0 + j;
          if (cy <= by0 || cy >= by1) continue;
          for (let i = 0; i < N; i++) {
            const cx = x0 + i;
            const dx = w.dx(bx0, cx);
            if (dx <= 0 || dx >= bx1 - bx0) continue;
            const q = j * N + i;
            if (g[q] > front + 0.2) g[q] = front + 0.2;
          }
        }
      }
    }
    this.chunks.set(k, g);
    if (this.chunks.size > 2400) {
      // forget the oldest grids (they are cheap to rebuild)
      const first = this.chunks.keys().next().value;
      this.chunks.delete(first);
    }
    return g;
  }

  /** Height of the terrain surface at (x, y), matching the rendered mesh. */
  terrain(x, y) {
    const w = this.world;
    x = w.wx(x);
    if (y < 0 || y >= w.height || (!w.wrap && (x < 0 || x >= w.width))) return -12;
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const g = this.grid(cx, cy);
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
    const i = Math.min(CHUNK - 1, Math.floor(lx)), j = Math.min(CHUNK - 1, Math.floor(ly));
    const fx = lx - i, fy = ly - j;
    const N = CHUNK + 1;
    const a = g[j * N + i], b = g[j * N + i + 1], c = g[(j + 1) * N + i], d = g[(j + 1) * N + i + 1];
    // the mesh splits each quad along the a–d diagonal
    if (fx >= fy) return a + (b - a) * fx + (d - b) * fy;
    return a + (d - c) * fx + (c - a) * fy;
  }

  /** Where feet rest at (x, y): decks, quays and wall tops over the terrain. */
  ground(x, y) {
    const w = this.world, t = w.type(x, y);
    if (OVERLAY[t]) return deckTop(w, x, y);
    if (w.quays.size && w.isQuay(x, y)) return DOCK_Y;
    const h = this.terrain(x, y);
    if (IS_LIQUID[t]) return Math.max(h, t === T.RAPIDS ? waterLevel(w, x, y) : SEA_Y);
    const f = w.floorRec ? w.floorRec(x, y) : null;
    if (!f) return h;
    if (f.interior) return this.floorY(f.o);
    if (f.steps !== undefined) return Math.max(h, this.stepTop(f.o, x, y, h));
    // (a ring or stage is level, standing on the ground at its middle like its model)
    if (f.o) return f.top ?? (f.top = this.terrain(f.o.x, f.o.y) + f.h);
    return h + f.h;
  }

  /**
   * Where a small prop of footprint radius r stands at (x, y): on the land,
   * the lowest ground round its foot, so on a slope or a bump it sinks a
   * little into the high side rather than floating off the low one (its
   * base is hidden in the ground either way); on a pier, a deck or a wall
   * top, that surface.
   */
  rest(x, y, r) {
    const w = this.world, t = w.type(x, y);
    const g = this.ground(x, y);
    if (!(r > 0.2) || OVERLAY[t] || IS_LIQUID[t] || t === T.WALL || (w.quays.size && w.isQuay(x, y)) || w.floorRec?.(x, y)) return g;
    let lo = g;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const tt = w.type(px, py);
      if (OVERLAY[tt] || IS_LIQUID[tt] || tt === T.WALL || w.floorRec?.(px, py)) continue;
      lo = Math.min(lo, this.terrain(px, py));
    }
    // (never more than a little way down: the world keeps landmarks off cliff
    // edges, and a prop sunk deeper would lose its feet)
    return Math.max(lo, g - 0.5);
  }

  /**
   * The ground floor of an enterable building (absolute): a step up from the
   * street in front, and always over the ground inside the walls.
   */
  /**
   * The top of the step you're on in front of a walk-in door (built like
   * buildings3d doorAt: n steps 0.32 m deep, each a rise lower), or h.
   */
  stepTop(b, x, y, h) {
    const front = this.terrain(b.x, b.y);
    const y0 = this.floorY(b) - front;
    const n = Math.max(1, Math.round(y0 / 0.2));
    const { lz } = bl(b, x, y, this.world);
    const i = Math.floor(lz / 0.32);
    if (i < 0 || i >= n) return h;
    return front + y0 - (i + 1) * y0 / (n + 1);
  }

  floorY(b) {
    if (b._floorY !== undefined && b._floorW === this.world) return b._floorY;
    const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
    const front = this.terrain(b.x, b.y);
    let top = -Infinity;
    for (let z = -fd + 0.3; z <= -0.3 + 1e-6; z += Math.max(0.5, (fd - 0.6) / 4)) {
      for (let x = -fw / 2 + 0.3; x <= fw / 2 - 0.3 + 1e-6; x += Math.max(0.5, (fw - 0.6) / 5)) { const q = bw(b, x, z); top = Math.max(top, this.terrain(q.x, q.y)); }
    }
    b._floorW = this.world;
    b._floorY = Math.max(front + PLINTH, top + 0.08);
    return b._floorY;
  }

  /** Invalidate after the tile map changed in a rectangle (tiles). */
  invalidate(x0, y0, x1, y1) {
    for (let cy = Math.floor((y0 - 1) / CHUNK); cy <= Math.floor((y1 + 1) / CHUNK); cy++) {
      for (let cx = Math.floor((x0 - 1) / CHUNK); cx <= Math.floor((x1 + 1) / CHUNK); cx++) {
        const wcx = this.world.wrap ? ((cx % this.cw) + this.cw) % this.cw : cx;
        this.chunks.delete(this.key(wcx, cy));
      }
    }
  }
}
