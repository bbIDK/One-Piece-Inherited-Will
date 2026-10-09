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
import { PLINTH, STEPS_MAX } from '../world/interiors.js';
import { bw, bl, bfoot } from '../world/bframe.js';
import { drumAt, drumTop, nearDrum, drumTile } from '../world/drums.js';
import { terraceAt, terraceGround } from '../world/terraces.js';

export const SEA_Y = 0;
export const DECK_Y = 0.55; // top of bridges (and sea-train tracks)
export const DOCK_Y = 1.5; // top of the harbour piers and their stone quays
// a bridge's deck this far over the water (m) has a handrail (it keeps you on it) and room to swim under it
export const HIGH_DECK = 2.2;

/** The top of the deck at an overlay tile: a harbour pier stands taller than a bridge. */
export const deckTop = (world, x, y) => (world.docks?.size && world.isDock(x, y) ? DOCK_Y : DECK_Y);
export const WALL_H = 3.2; // town walls, prison walls
export const CHUNK = 32; // tiles per terrain chunk side

const ELEV_K = 0.075; // metres per elevation unit
const BOOST = new Float32Array(256);
BOOST[T.MOUNTAIN] = 7;
BOOST[T.CLIFF] = 4;
BOOST[T.SNOWROCK] = 9;
BOOST[T.RED_ROCK] = 7; // (red crags on an island; the Red Line itself gets its own curve below)
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

/**
 * Is this surface tile part of the Red Line (or the Reverse Mountain massif)?
 * Its rock is the world's own (see worldgen's base), not an island's red crags.
 */
function onRedLine(world, x, y) {
  if (world.zone !== 0) return false;
  if (world.base?.type) {
    const t = world.base.type(world.wx(Math.floor(x)), Math.floor(y));
    return t === T.RED_ROCK || t === T.SNOWROCK;
  }
  const dm = Math.abs(world.dx(x, RM_X)), ds = Math.abs(world.dx(x, 0));
  return dm < RL_HALF + chart(90) || ds < RL_HALF + chart(30);
}

/** The top of the Red Line, away from its edges: a plateau (worldgen's elevations top out at 255). */
const RL_TOP = 38 + (255 - 90) * 0.55;

/** Is this tile in Mary Geoise, the city on top of the Red Line (see worldgen)? */
function inMaryGeoise(world, x, y) {
  const MG = world.zone === 0 && world.maryGeoise;
  return !!MG?.rx && Math.hypot(world.dx(MG.x, x) / MG.rx, (y - MG.y) / MG.ry) < 0.97;
}

/** Height of one land tile before the coastal ramp. */
function landHeight(world, x, y, t, e) {
  if ((t === T.RED_ROCK || t === T.SNOWROCK) && onRedLine(world, x, y)) {
    // the Red Line: a wall of red rock that dwarfs everything
    return 38 + Math.max(0, e - 90) * 0.55 + (t === T.SNOWROCK ? 9 : 0);
  }
  // the polar ice: not a flat sheet at the sea's edge but an ice shelf, a
  // cliff some 30 m high a few steps in from the water, then the ice cap
  // (the floes drifting off it stay low)
  if (t === T.PACK_ICE && world.zone === 0 && world.base?.ptop) {
    const B = world.base, xi = world.wx(Math.floor(x));
    const d = y < B.ptop[xi] ? B.ptop[xi] - y : y > B.pbot[xi] ? y - B.pbot[xi] : -1;
    if (d >= 0) {
      const k = Math.min(1, d / 5);
      return 2 + 30 * k * k * (3 - 2 * k) + Math.max(0, d - 5) * 0.08;
    }
  }
  // (Mary Geoise is built on top of it, level with its plateau, not down in a pit cut into it)
  if (inMaryGeoise(world, x, y)) return RL_TOP;
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

const TG = { h: 0, base: false, t: 1 };
/** Height at a tile corner before anything is built on it. */
function naturalHeight(world, cx, cy) {
  // (on a terraced city — Water 7 — its levels, stairways and gutters: see terraces.js;
  // the first flight's foot is the land's own)
  const tr = world.terraces?.length && world.zone === 0 ? terraceAt(world, cx, cy) : null;
  if (tr && terraceGround(tr, world.dx(tr.x, cx), cy - tr.y, TG)) {
    if (!TG.base) return TG.h;
    const land = landAt(world, cx, cy);
    return land + (TG.h - land) * TG.t;
  }
  return landAt(world, cx, cy);
}

/** Height at a tile corner from the land itself (its tiles, the coast, Reverse Mountain, the Drum Rockies). */
function landAt(world, cx, cy) {
  // (on top of one of the Drum Rockies: its own height — its face a sheer wall a tile thick, see drums.js)
  const nd = world.drums?.length && world.zone === 0 ? nearDrum(world, cx, cy, 2) : null;
  if (nd) {
    const d = drumAt(world, cx, cy);
    if (d) return drumTop(world, d, cx, cy);
  }
  let sum = 0, n = 0, walls = 0, tall = 0, rapids = 0;
  for (let j = -1; j <= 0; j++) {
    for (let i = -1; i <= 0; i++) {
      const x = cx + i, y = cy + j;
      let t = world.type(x, y);
      if (t === T.RAPIDS) rapids++;
      if (IS_LIQUID[t] || OVERLAY[t]) continue;
      if (t === T.WALL) { walls++; continue; }
      // (the foot of a drum's face is the land's own: no scree of rock piled against it)
      if (nd && t === T.SNOWROCK && drumTile(world, nd, x, y) === 1) t = T.SNOW;
      const h = landHeight(world, x, y, t, world.elev(x, y));
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
    this.raiseAbutments(g, x0, y0);
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
    if (t === T.BRIDGE) return this.deckAt(x, y);
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
    // (a door higher than a flight of steps goes opens onto the drop: none drawn, none to walk on)
    if (y0 > STEPS_MAX + 0.01) return h;
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

  /**
   * A wall tile's block, [base, top] (m): standing on the ground beside it
   * (from just under the lowest of it to WALL_H over the highest — stepped
   * up a slope), wherever the town is. (Towns stand on raised ground: a wall
   * at a fixed height would be buried in it, and block the way unseen.)
   */
  wallSpan(x, y) {
    const w = this.world;
    let lo = Infinity, hi = -Infinity;
    for (let r = 1; r <= 3 && lo === Infinity; r++) {
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
          const t = w.type(x + i, y + j);
          if (t === T.WALL || IS_LIQUID[t] || OVERLAY[t]) continue;
          const h = this.terrain(x + i + 0.5, y + j + 0.5);
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
    }
    if (lo === Infinity) return [0.4, 0.4 + WALL_H]; // (walls in the sea: on the sea bed's flat)
    return [lo - 0.35, hi + WALL_H];
  }

  // ---------------------------------------------------------------- bridges
  // A bridge spans from the land at one end to the land at the other, at
  // their height: its deck runs from one bank to the other (on an island
  // that stands high over the sea, high over the water between), and the
  // banks it lands on are built up to meet it. (It used to lie just over the
  // water whatever it joined: down at the foot of a bank much taller than
  // you, out of reach of the land it was meant to join.)

  /** The run of bridge tiles (x, y) is part of: { top: Map(tile → deck top), ends: [{ tiles, h }] }, or null. */
  span(x, y) {
    const w = this.world;
    const tx = w.wx(Math.floor(x)), ty = Math.floor(y);
    if (w.type(tx, ty) !== T.BRIDGE) return null;
    const S = this.spans || (this.spans = new Map());
    const k = ty * w.width + tx;
    let s = S.get(k);
    if (!s) { s = buildSpan(w, tx, ty); for (const q of s.top.keys()) S.set(q, s); }
    return s;
  }

  /** A bridge tile's deck top (m). */
  deckTile(tx, ty) {
    const w = this.world;
    tx = w.wx(tx);
    const s = this.span(tx, ty);
    return s ? s.top.get(ty * w.width + tx) : DECK_Y;
  }

  /** The deck at a tile corner: level with the bridge tiles round it. */
  deckCorner(cx, cy) {
    const w = this.world;
    let sum = 0, n = 0;
    for (let j = -1; j <= 0; j++) {
      for (let i = -1; i <= 0; i++) {
        if (w.type(cx + i, cy + j) !== T.BRIDGE) continue;
        sum += this.deckTile(cx + i, cy + j); n++;
      }
    }
    return n ? sum / n : DECK_Y;
  }

  /** The top of a bridge's deck at (x, y) (smooth from tile to tile, as it's drawn). */
  deckAt(x, y) {
    x = this.world.wx(x);
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const a = this.deckCorner(i, j), b = this.deckCorner(i + 1, j), c = this.deckCorner(i, j + 1), d = this.deckCorner(i + 1, j + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  /**
   * Does a high bridge's handrail run along the edge from its deck tile
   * (tx, ty) to the tile beside it (nx, ny)? Where the deck stands high over
   * the water — or over ground well below it. (Drawn: props/docks.js; it
   * keeps you on the deck unless you jump it: game/actor.js.)
   */
  railAt(tx, ty, nx, ny) {
    const w = this.world, t = w.type(nx, ny);
    if (w.type(tx, ty) !== T.BRIDGE || OVERLAY[t] || t === T.WALL) return false;
    const top = this.deckAt(Math.floor(tx) + 0.5, Math.floor(ty) + 0.5);
    if (top <= HIGH_DECK) return false;
    return !!IS_LIQUID[t] || this.terrain(Math.floor(nx) + 0.5, Math.floor(ny) + 0.5) < top - 2;
  }

  /**
   * The land where a bridge comes ashore, built up to its deck and easing
   * back to the lie of the land over a few metres (never cut down: a bank
   * already higher keeps its height).
   */
  raiseAbutments(g, x0, y0) {
    const w = this.world, N = CHUNK + 1, R = ABUT_R;
    let ends = null;
    for (let y = y0 - R - 1; y <= y0 + CHUNK + R; y++) {
      for (let x = x0 - R - 1; x <= x0 + CHUNK + R; x++) {
        if (w.type(x, y) !== T.BRIDGE) continue;
        const s = this.span(x, y);
        if (!s || !s.ends.length) continue;
        (ends || (ends = new Set()));
        for (const e of s.ends) ends.add(e);
      }
    }
    if (!ends) return;
    // (a corner of some dry ground: 0 none (the water, a harbour's quay or pier keeping their own
    // height), 1 on the bank by open water, 2 inland; built up by the bank only where the
    // bridge lands, so the river or the channel beside it keeps its width)
    const land = (cx, cy) => {
      let dry = false, wet = false;
      for (let j = -1; j <= 0; j++) {
        for (let i = -1; i <= 0; i++) {
          const t = w.type(cx + i, cy + j);
          if (w.quays.size && w.isQuay(cx + i, cy + j)) return 0;
          if (!IS_LIQUID[t] && !OVERLAY[t]) dry = true;
          else if (!OVERLAY[t]) wet = true;
        }
      }
      return dry ? (wet ? 1 : 2) : 0;
    };
    const K = new Float32Array(N * N);
    for (const e of ends) {
      // (each corner by the nearest of the tiles it lands on)
      K.fill(0);
      let any = false;
      for (const [tx, ty] of e.tiles) {
        for (let cy = ty - R; cy <= ty + 1 + R; cy++) {
          const j = cy - y0;
          if (j < 0 || j >= N) continue;
          for (let cx = tx - R; cx <= tx + 1 + R; cx++) {
            const i = w.dx(x0, cx);
            if (i < 0 || i >= N) continue;
            // (how far the corner is from the landing tile's square)
            const dx = Math.max(0, tx - cx, cx - (tx + 1)), dy = Math.max(0, ty - cy, cy - (ty + 1));
            const d = Math.hypot(dx, dy);
            if (d >= R) continue;
            const k = 1 - smooth(0, R, d), q = j * N + i;
            if (k > K[q]) { K[q] = k; any = true; }
          }
        }
      }
      if (!any) continue;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const q = j * N + i;
          if (!K[q] || g[q] >= e.h - 0.02) continue;
          const L = land(x0 + i, y0 + j);
          if (!L || (L === 1 && K[q] < 1)) continue;
          g[q] += (e.h - 0.02 - g[q]) * K[q];
        }
      }
    }
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

// ------------------------------------------------------------------ bridges
const ABUT_R = 4; // how far (tiles) round where a bridge lands the bank is built up to it
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * A run of bridge tiles and its deck: the land touching it, in one group
 * per bank, each at its own height (the land's, where it has risen from the
 * water's edge: 3–4 m in from the bank); every tile of the deck between them
 * in proportion to how far it lies from each (straight from one to the other
 * between two banks).
 */
function buildSpan(w, tx, ty) {
  const W = w.width, key = (x, y) => y * W + x;
  const tiles = [], seen = new Set([key(tx, ty)]), st = [[tx, ty]];
  while (st.length) {
    const [x, y] = st.pop();
    tiles.push([x, y]);
    for (const [dx, dy] of N4) {
      const nx = w.wx(x + dx), ny = y + dy, k = key(nx, ny);
      if (!seen.has(k) && w.type(nx, ny) === T.BRIDGE) { seen.add(k); st.push([nx, ny]); }
    }
  }
  // the land it touches (and which way it lies from the deck)
  const shore = new Map();
  for (const [x, y] of tiles) {
    for (const [dx, dy] of N4) {
      const nx = w.wx(x + dx), ny = y + dy, t = w.type(nx, ny);
      if (IS_LIQUID[t] || OVERLAY[t] || t === T.WALL) continue;
      const k = key(nx, ny);
      if (!shore.has(k)) shore.set(k, { x: nx, y: ny, dx, dy });
    }
  }
  // in groups, one per bank (touching tiles, diagonally too)
  const ends = [], group = new Map();
  for (const [k0, s0] of shore) {
    if (group.has(k0)) continue;
    const e = { tiles: [], h: DECK_Y, rise: [] };
    const q = [s0];
    group.set(k0, e);
    while (q.length) {
      const s = q.pop();
      e.tiles.push([s.x, s.y]);
      // the land's own height 3.5 m in from the bank (where it has risen from the water)
      const px = s.x + s.dx * 3.5, py = s.y + s.dy * 3.5;
      e.rise.push(naturalHeight(w, Math.round(px), Math.round(py)));
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const nk = key(w.wx(s.x + i), s.y + j);
          if (!group.has(nk) && shore.has(nk)) { group.set(nk, e); q.push(shore.get(nk)); }
        }
      }
    }
    e.rise.sort((a, b) => a - b);
    e.land = Math.max(DECK_Y, e.rise[Math.floor(e.rise.length / 2)]);
    ends.push(e);
  }
  // how far each deck tile is from each bank, along the deck
  const dist = ends.map((e) => {
    const D = new Map(), q = [];
    for (const [x, y] of tiles) {
      for (const [dx, dy] of N4) if (group.get(key(w.wx(x + dx), y + dy)) === e) { D.set(key(x, y), 0.5); q.push([x, y]); break; }
    }
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h], d = D.get(key(x, y));
      for (const [dx, dy] of N4) {
        const nx = w.wx(x + dx), ny = y + dy, k = key(nx, ny);
        if (seen.has(k) && !D.has(k)) { D.set(k, d + 1); q.push([nx, ny]); }
      }
    }
    return D;
  });
  const top = new Map();
  for (const [x, y] of tiles) {
    const k = key(x, y);
    let h = DECK_Y;
    if (ends.length === 1) h = ends[0].land;
    else if (ends.length === 2) {
      const a = dist[0].get(k) ?? 1e6, b = dist[1].get(k) ?? 1e6;
      h = (ends[0].land * b + ends[1].land * a) / (a + b);
    } else if (ends.length) {
      let sw = 0, sh = 0;
      ends.forEach((e, n) => { const d = dist[n].get(k) ?? 1e6; const wt = 1 / (d * d); sw += wt; sh += wt * e.land; });
      h = sh / sw;
    }
    top.set(k, Math.max(DECK_Y, h));
  }
  // (each bank is built up to the deck where it lands: see raiseAbutments)
  ends.forEach((e, n) => {
    let sum = 0, c = 0;
    for (const [k, d] of dist[n]) if (d === 0.5) { sum += top.get(k); c++; }
    e.h = c ? sum / c : e.land;
    e.rise = null;
  });
  return { top, ends };
}
