// Enterable buildings: which town buildings you can walk into, where their
// doors and ground-floor windows are, and the rooms behind them. One layout
// is shared by the game (walls and furniture collide, counters and cupboards
// are things to use, keepers and residents have places to stand) and by the
// 3D view (it builds the rooms from the same list), so what you see is what
// you bump into.
//
// Local frame (as in buildings3d.js): the front wall — street side, with the
// door — is at z = 0 and faces +z; the building goes back to z = -fd; x runs
// from -fw/2 to fw/2. The building is turned in the world by b.rot (see
// bframe.js: bw() takes a local point to the world, bl() back).

import { bw, bl, bbox } from './bframe.js';

export const WALL_T = 0.22; // wall thickness (m)
export const PLINTH = 0.35; // the ground floor over the street in front
export const STEPS_MAX = 3; // the highest a flight of steps up to a front door goes (higher, the door opens onto the drop)

const WIN = {
  village: 'cross', town: 'cross', port: 'cross', city: 'tall', desert: 'arch', snow: 'cross', wano: 'shoji', chinese: 'lattice', sky: 'round', candy: 'round',
  fishman: 'round', marine: 'tall', noble: 'tall', spooky: 'gothic', future: 'round', tribal: 'none', mink: 'round', giant: 'cross', ruins: 'hole',
};
const DOOR = {
  village: 'plank', town: 'panel', port: 'plank', city: 'panel', desert: 'arch', snow: 'plank', wano: 'noren', chinese: 'panel', sky: 'arch', candy: 'arch',
  fishman: 'arch', marine: 'panel', noble: 'panel', spooky: 'plank', future: 'panel', tribal: 'hide', mink: 'plank', giant: 'plank', ruins: 'hole',
};
export const winKind = (b) => WIN[b.style] || 'cross';
export const doorKind = (b) => DOOR[b.style] || 'plank';
/** How much bigger than a person's a building is made: a giants' town, or one kept by someone very tall (b.tall: game/npcs.js sizeBuildingsForOccupants). */
export const styleScale = (b) => Math.max(b.style === 'giant' ? 2.1 : 1, b.tall || 1);
/** Floor-sitting interiors: futons, low tables and cushions. */
export const lowStyle = (b) => b.style === 'wano';

// public buildings and their opening hours ([open, close) on the 24 h clock)
export const HOURS = {
  shop: [7, 21], market: [6, 20], weapons: [8, 20], bank: [8, 18], bounty: [7, 21], library: [8, 20], cafe: [7, 21], restaurant: [10, 23],
  tavern: [0, 24], bar: [0, 24], inn: [0, 24], doctor: [0, 24], marine_base: [0, 24], church: [6, 22], dojo: [6, 21], trainer: [6, 21], shipwright: [7, 20],
};
const NOT_ENTERABLE = new Set(['palace', 'hall', 'lighthouse']);
const HUTS = new Set(['tribal', 'ruins']);

/** Can you walk into this building? */
export function isEnterable(b) {
  if (!b || b.kind !== 'building' || b.noEnter) return false;
  const role = b.role || 'house';
  if (NOT_ENTERABLE.has(role) || HUTS.has(b.style)) return false;
  if (b.roofType === 'hut' || b.roofType === 'ruin') return false;
  return (b.fw || 3) >= 3.5 && (b.fd || 3) >= 2.5;
}

/** The front door: local x, width, height, kind. */
export function doorOf(b) {
  const fw = Math.max(2, b.fw || 3), g = styleScale(b);
  const role = b.role || 'house';
  const big = (role === 'marine_base' || role === 'palace' || role === 'hall' || role === 'church') && fw >= 5;
  const x = Math.max(-fw / 2 + 0.9, Math.min(fw / 2 - 0.9, doorLocalX(b)));
  return { x, dw: (big ? 1.7 : 1.05) * g, dh: (big ? 2.5 : 2.15) * g, big, kind: doorKind(b) };
}

/** Where along the front the door is (local x): set by the town, else from its world spot. */
export function doorLocalX(b) {
  if (b.doorX !== undefined) return b.doorX;
  return b.door ? bl(b, b.door.x, b.door.y).lx : 0;
}

/** Storeys and heights over the ground floor. */
export function heightsOf(b) {
  const g = styleScale(b);
  const storeys = Math.max(1, Math.min(5, (b.hgt || 2) - 1));
  const storeyH = 2.75 * g;
  return { g, storeys, storeyH, ceil: storeys > 1 ? storeyH : 3.0 * g, H: 3.0 * g + (storeys - 1) * storeyH };
}

/**
 * Ground-floor windows: { face: 'front' | 'left' | 'right', u, y, w, h, kind, i }.
 * `u` runs along the wall (x on the front, z on the sides); `y` is the centre over the floor.
 */
/** Styles whose windows have shutters beside them (they need room on the wall). */
export const hasShutters = (b) => b.style === 'village' || b.style === 'town';

/**
 * Where the windows go on one floor: centres along the front (x) and along
 * each side wall (z), spaced so frames and shutters never overlap each other,
 * the door or the corners — and none on a side that stands against a
 * neighbour. Shared by the 3D model and the walk-in ground floor.
 */
export function windowSlots(b, floor = 0) {
  const kind = winKind(b);
  const none = { front: [], left: [], right: [], w: 0, reach: 0 };
  if (kind === 'none' || kind === 'hole') return none;
  const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3), g = styleScale(b);
  const d = doorOf(b);
  const winW = 0.85 * g;
  const reach = winW / 2 + (hasShutters(b) && (kind === 'cross' || kind === 'tall') ? 0.1 + winW * 0.45 : 0.14);
  const pitch = 2 * reach + 0.3 * g;
  const spread = (len) => {
    const usable = len - 2 * (0.3 + reach);
    if (usable < 0) return [];
    const n = Math.floor(usable / pitch) + 1;
    return n === 1 ? [0] : Array.from({ length: n }, (_, i) => -usable / 2 + i * usable / (n - 1));
  };
  let front = spread(fw);
  if (floor === 0) front = front.filter((x) => Math.abs(x - d.x) >= d.dw / 2 + 0.2 + reach);
  // on the gable ends: one window a floor, two on deep houses
  const zs = fd < 3 ? [] : fd >= 6.5 ? [-fd * 0.3, -fd * 0.7] : [-fd / 2];
  const at = b.attach || {};
  return { front, left: at.left ? [] : zs, right: at.right ? [] : zs, w: winW, reach };
}

export function groundWindows(b) {
  const kind = winKind(b);
  if (kind === 'none' || kind === 'hole') return [];
  const g = styleScale(b);
  const winW = 0.85 * g, winH = 1.05 * g;
  const h = kind === 'tall' ? winH * 1.2 : winH;
  const y = 1.55 * g;
  const W = windowSlots(b, 0);
  const out = [];
  for (const x of W.front) out.push({ face: 'front', u: x, y, w: winW, h, kind, i: out.length });
  for (const face of ['left', 'right']) for (const z of W[face]) out.push({ face, u: z, y, w: winW, h, kind, i: out.length });
  return out;
}

/** World-space rectangle of the free floor inside (x0..x1 × y0..y1). */
export function interiorRect(b) {
  const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
  return bbox(b, -fw / 2 + WALL_T, fw / 2 - WALL_T, -fd + WALL_T, -WALL_T);
}

// ------------------------------------------------------------------ layout

function hash(a, b = 0, c = 0) {
  let h = Math.imul((a * 1000) | 0, 374761393) ^ Math.imul((b * 1000) | 0, 668265263) ^ Math.imul((c * 1000) | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(seed) {
  let s = (Math.floor(seed * 2654435761) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** A pirate's hideout among the houses (Jolly Roger over the door; breaking in isn't a crime). */
export function isPirateHouse(b) {
  return (b.role || 'house') === 'house' && !b.npc && isEnterable(b) && hash(b.x, b.y, 7.7) < 0.09;
}

const rectOf = (x, z, rot, w, d) => {
  const side = Math.abs(Math.sin(rot)) > 0.5;
  const hx = (side ? d : w) / 2, hz = (side ? w : d) / 2;
  return { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
};
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;

/** Packs furniture into a room against its walls, keeping the doorway (and windows, for tall things) clear. */
class Placer {
  constructor(L, R) {
    this.L = L; this.R = R;
    this.rects = [];
    this.keep = []; // always clear (the door swing)
    this.low = []; // clear of tall furniture (windows)
  }
  fits(r, tall) {
    const L = this.L;
    if (r.x0 < L.x0 - 1e-3 || r.x1 > L.x1 + 1e-3 || r.z0 < L.z0 - 1e-3 || r.z1 > L.z1 + 1e-3) return false;
    for (const q of this.keep) if (overlap(r, q)) return false;
    if (tall) for (const q of this.low) if (overlap(r, q)) return false;
    for (const q of this.rects) if (overlap(r, q, 0.04)) return false;
    return true;
  }
  /** Try to put an item at (x, z) facing `rot`; returns the item or null. */
  at(item, x, z, rot = 0) {
    const r = rectOf(x, z, rot, item.w, item.d);
    if (!this.fits(r, (item.h || 0) > 1.05)) return null;
    const it = { ...item, x, z, rot, rect: r };
    if (!item.ghost) this.rects.push(r);
    this.L.items.push(it);
    return it;
  }
  /** Slide an item along a wall ('back' | 'left' | 'right' | 'front'), in the given order. */
  wall(item, wall, order = 'center', gap = 0.02) {
    const L = this.L;
    let rot, fixed, a0, a1;
    if (wall === 'back') { rot = 0; fixed = L.z0 + item.d / 2 + gap; a0 = L.x0 + item.w / 2; a1 = L.x1 - item.w / 2; }
    else if (wall === 'front') { rot = Math.PI; fixed = L.z1 - item.d / 2 - gap; a0 = L.x0 + item.w / 2; a1 = L.x1 - item.w / 2; }
    else if (wall === 'left') { rot = Math.PI / 2; fixed = L.x0 + item.d / 2 + gap; a0 = L.z0 + item.w / 2; a1 = L.z1 - item.w / 2; }
    else { rot = -Math.PI / 2; fixed = L.x1 - item.d / 2 - gap; a0 = L.z0 + item.w / 2; a1 = L.z1 - item.w / 2; }
    if (a1 < a0 - 1e-6) return null;
    const cands = [];
    const n = Math.max(1, Math.round((a1 - a0) / 0.1));
    for (let i = 0; i <= n; i++) cands.push(a0 + (a1 - a0) * (i / n));
    if (order === 'center') { const m = (a0 + a1) / 2; cands.sort((p, q) => Math.abs(p - m) - Math.abs(q - m)); }
    else if (order === 'end') cands.reverse();
    else if (order === 'random') cands.sort(() => this.R() - 0.5);
    for (const a of cands) {
      const it = wall === 'back' || wall === 'front' ? this.at(item, a, fixed, rot) : this.at(item, fixed, a, rot);
      if (it) return it;
    }
    return null;
  }
  /** Anywhere on the floor (free-standing tables), nearest to (px, pz) first. */
  free(item, px = 0, pz = null, rot = 0) {
    const L = this.L;
    const cz = pz ?? (L.z0 + L.z1) / 2;
    const cands = [];
    for (let x = L.x0 + item.w / 2; x <= L.x1 - item.w / 2 + 1e-6; x += 0.15) {
      for (let z = L.z0 + item.d / 2; z <= L.z1 - item.d / 2 + 1e-6; z += 0.15) cands.push([x, z]);
    }
    cands.sort((a, b) => Math.hypot(a[0] - px, a[1] - cz) - Math.hypot(b[0] - px, b[1] - cz));
    for (const [x, z] of cands) { const it = this.at(item, x, z, rot); if (it) return it; }
    return null;
  }
  /** Things that don't take floor space (rugs, wall pictures, lamps). */
  deco(item, x, z, rot = 0) { const it = { ...item, x, z, rot, ghost: true }; this.L.items.push(it); return it; }
}

// furniture sizes (w along the wall, d out from it, h) — scaled by the style's giant factor
const F = {
  bed: { k: 'bed', w: 1.0, d: 2.0, h: 0.6 },
  futon: { k: 'futon', w: 1.0, d: 2.0, h: 0.14, ghost: true },
  table: { k: 'table', w: 0.95, d: 0.8, h: 0.76 },
  lowTable: { k: 'lowtable', w: 1.0, d: 0.7, h: 0.36 },
  roundTable: { k: 'roundtable', w: 0.9, d: 0.9, h: 0.76 },
  chair: { k: 'chair', w: 0.44, d: 0.44, h: 0.92, ghost: true },
  stool: { k: 'stool', w: 0.38, d: 0.38, h: 0.7, ghost: true },
  cushion: { k: 'cushion', w: 0.5, d: 0.5, h: 0.1, ghost: true },
  cupboard: { k: 'cupboard', w: 0.95, d: 0.45, h: 1.85 },
  dresser: { k: 'dresser', w: 1.0, d: 0.45, h: 0.9 },
  tansu: { k: 'tansu', w: 0.95, d: 0.45, h: 1.1 },
  shelf: { k: 'shelf', w: 1.2, d: 0.34, h: 1.9 },
  lowShelf: { k: 'lowshelf', w: 1.1, d: 0.36, h: 1.0 },
  bookcase: { k: 'bookcase', w: 1.2, d: 0.36, h: 2.1 },
  stove: { k: 'stove', w: 0.75, d: 0.6, h: 0.95 },
  fireplace: { k: 'fireplace', w: 1.3, d: 0.5, h: 1.35 },
  hibachi: { k: 'hibachi', w: 0.55, d: 0.55, h: 0.35 },
  chest: { k: 'chest', w: 0.8, d: 0.5, h: 0.55 },
  barrel: { k: 'barrel', w: 0.62, d: 0.62, h: 0.95 },
  crate: { k: 'crate', w: 0.62, d: 0.62, h: 0.6 },
  sacks: { k: 'sacks', w: 0.8, d: 0.55, h: 0.6 },
  plant: { k: 'plant', w: 0.45, d: 0.45, h: 1.1 },
  counter: { k: 'counter', w: 2.0, d: 0.48, h: 1.02 },
  desk: { k: 'desk', w: 1.3, d: 0.62, h: 0.78 },
  medbed: { k: 'medbed', w: 1.95, d: 0.9, h: 0.68 },
  cabinet: { k: 'medcabinet', w: 1.0, d: 0.36, h: 1.8 },
  screen: { k: 'screen', w: 1.1, d: 0.12, h: 1.6 },
  rack: { k: 'rack', w: 1.3, d: 0.3, h: 1.6 },
  armor: { k: 'armorstand', w: 0.6, d: 0.5, h: 1.75 },
  dummy: { k: 'dummy', w: 0.55, d: 0.55, h: 1.75 },
  shrine: { k: 'shrine', w: 1.2, d: 0.4, h: 1.2 },
  pew: { k: 'pew', w: 1.9, d: 0.5, h: 0.92 },
  altar: { k: 'altar', w: 1.4, d: 0.6, h: 1.0 },
  safe: { k: 'safe', w: 0.8, d: 0.7, h: 1.2 },
  bench: { k: 'bench', w: 1.4, d: 0.42, h: 0.46 },
  board: { k: 'board', w: 1.3, d: 0.06, h: 1.0, ghost: true },
  filing: { k: 'filing', w: 0.6, d: 0.5, h: 1.3 },
  flag: { k: 'flag', w: 1.1, d: 0.05, h: 1.6, ghost: true },
  stairs: { k: 'stairs', w: 2.6, d: 0.95, h: 2.4 },
  workbench: { k: 'workbench', w: 1.7, d: 0.7, h: 0.9 },
  lumber: { k: 'lumber', w: 1.8, d: 0.6, h: 0.7 },
  hull: { k: 'hull', w: 2.4, d: 1.2, h: 1.1 },
  produce: { k: 'produce', w: 1.1, d: 0.6, h: 0.8 },
};
const sized = (it, g) => (g === 1 ? it : { ...it, w: it.w * g, d: it.d * g, h: it.h * g });

// what each building type is, as a room
const GROUP = {
  house: 'house', shop: 'shop', market: 'market', weapons: 'weapons', bank: 'bank', bounty: 'bounty', library: 'library',
  tavern: 'tavern', bar: 'tavern', inn: 'inn', restaurant: 'restaurant', cafe: 'restaurant', doctor: 'doctor',
  dojo: 'dojo', trainer: 'dojo', church: 'church', marine_base: 'marine', shipwright: 'shipwright',
};
export const roomOf = (b) => GROUP[b.role || 'house'] || 'house';

/** What a keeper is called, by room. */
export const KEEPER = {
  shop: 'Shopkeeper', market: 'Grocer', weapons: 'Armourer', bank: 'Banker', bounty: 'Bounty Clerk', library: 'Librarian', tavern: 'Barkeep', inn: 'Innkeeper',
  restaurant: 'Cook', doctor: 'Doctor', dojo: 'Sensei', church: 'Priest', marine: 'Marine Officer', shipwright: 'Shipwright',
};

/**
 * The room behind the door (cached on the building):
 * { x0, x1, z0, z1, door, items: [{ k, x, z, w, d, h, rot, ghost?, loot?, ... }],
 *   use: [{ kind, x, z, label }], keeper: { x, z } | null, residents: [{ x, z, sit? }], rest: { x, z } | null }
 * Items face `rot` (0 = +z, toward the street); `ghost` ones don't block.
 */
export function layoutOf(b) {
  if (b._layout) return b._layout;
  const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3), g = styleScale(b);
  const T = WALL_T;
  const door = doorOf(b);
  const L = { x0: -fw / 2 + T, x1: fw / 2 - T, z0: -fd + T, z1: -T, door, items: [], use: [], keeper: null, residents: [], rest: null, room: roomOf(b) };
  const R = rng(hash(b.x, b.y, (b.v || 0) + 1));
  const P = new Placer(L, R);
  // the door swings in: keep its arc and the way in clear
  P.keep.push({ x0: door.x - door.dw / 2 - 0.22, x1: door.x + door.dw / 2 + 0.22, z0: L.z1 - Math.max(1.0, door.dw) - 0.06, z1: L.z1 + 1 });
  for (const w of groundWindows(b)) {
    const hw = w.w / 2 + 0.12;
    if (w.face === 'front') P.low.push({ x0: w.u - hw, x1: w.u + hw, z0: L.z1 - 0.7, z1: L.z1 + 1 });
    else if (w.face === 'left') P.low.push({ x0: L.x0 - 1, x1: L.x0 + 0.7, z0: w.u - hw, z1: w.u + hw });
    else P.low.push({ x0: L.x1 - 0.7, x1: L.x1 + 1, z0: w.u - hw, z1: w.u + hw });
  }
  const S = (k) => sized(F[k], g);
  (ROOMS[L.room] || ROOMS.house)(P, L, b, R, S, g);
  // a lamp from the ceiling over the middle of the room
  P.deco({ k: 'lamp', w: 0.3, d: 0.3, h: 0.5 }, (L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2);
  b._layout = L;
  return L;
}

/** A counter across the back with room behind it for the keeper, and shelves on the back wall. */
function counterRoom(P, L, S, g, { shelf = 'goods', len = 2.2, gapBehind = 0.58 } = {}) {
  const width = L.x1 - L.x0;
  const bd = 0.26 * g; // the wall shelves' depth
  const cw = Math.min(len * g, width - 0.75 * g);
  const cz = L.z0 + bd + gapBehind * g + S('counter').d / 2;
  // the counter's left end meets the wall; a gap at the right lets the keeper out
  const counter = P.at({ ...S('counter'), w: cw }, L.x0 + cw / 2 + 0.02, cz, 0) || P.at({ ...S('counter'), w: cw * 0.8 }, L.x0 + cw * 0.4 + 0.02, cz, 0);
  if (!counter) return null;
  const bw = Math.min(width - 0.1, cw + 0.4 * g);
  P.deco({ k: shelf, w: bw, d: bd, h: 1.9 * g }, L.x0 + bw / 2 + 0.02, L.z0 + bd / 2 + 0.01, 0);
  P.rects.push({ x0: L.x0, x1: L.x0 + bw + 0.02, z0: L.z0, z1: counter.rect.z0 });
  // customers stand in front of it
  P.keep.push({ x0: counter.x - 0.55, x1: counter.x + 0.55, z0: counter.rect.z1, z1: counter.rect.z1 + 0.85 });
  L.keeper = { x: counter.x, z: L.z0 + bd + gapBehind * g * 0.5 };
  L.use.push({ kind: 'service', x: counter.x, z: counter.rect.z1 + 0.45, label: null });
  return counter;
}

// ------------------------------------------------------------------ homes
// Every home has somewhere to sleep, a hearth, and a chest or chest of drawers
// worth searching — but a fisherman's hut, a carpenter's workshop-home, a
// scholar's study, a farmhouse and an old sailor's place all look different.

/** A bed (or a futon) in a back corner, falling back to a side wall. */
function bedIn(P, S, low, order) {
  const k = low ? 'futon' : 'bed';
  return P.wall(S(k), 'back', order) || P.wall(S(k), 'left', 'start') || P.wall(S(k), 'right', 'start');
}
/** Something to search, with the spot to stand at in front of it. */
function searchable(L, it, label) {
  if (!it) return null;
  const f = [Math.sin(it.rot), Math.cos(it.rot)];
  L.use.push({ kind: 'loot', x: it.x + f[0] * (it.d / 2 + 0.42), z: it.z + f[1] * (it.d / 2 + 0.42), label });
  return it;
}
function stash(P, L, S, k, walls, label) {
  for (const [wall, order] of walls) {
    const it = P.wall({ ...S(k), loot: true }, wall, order);
    if (it) return searchable(L, it, label);
  }
  return null;
}
/** A chest at the foot of a bed against the back wall. */
function footChest(P, L, S, bed, label) {
  if (!bed || bed.rot !== 0) return null;
  const c = S('chest'), r = bed.rect;
  const it = P.at({ ...c, loot: true }, (r.x0 + r.x1) / 2, r.z1 + c.d / 2 + 0.05, 0);
  if (it) L.use.push({ kind: 'loot', x: it.x, z: it.rect.z1 + 0.45, label });
  return it;
}
function hearthIn(P, L, b, S, low, order) {
  const k = b.style === 'snow' || b.style === 'village' || b.style === 'giant' ? 'fireplace' : low ? 'hibachi' : 'stove';
  const st = P.wall(S(k), 'back', order) || P.wall(S(k), 'left', 'end') || P.wall(S(k), 'right', 'end');
  if (st) L.residents.push({ x: st.x + Math.sin(st.rot) * (st.d / 2 + 0.35), z: st.z + Math.cos(st.rot) * (st.d / 2 + 0.35) });
  return st;
}
/** A table with a seat either side (people sit at them). */
function tableIn(P, L, S, low, kind, x, z, seat) {
  const tb = P.free(S(low ? 'lowTable' : kind), x, z);
  if (!tb) return null;
  for (const s of [-1, 1]) {
    const st = S(low ? 'cushion' : seat);
    const sx = tb.x + s * (tb.w / 2 + st.w * 0.45);
    if (sx - st.w / 2 < L.x0 || sx + st.w / 2 > L.x1) continue;
    P.deco(st, sx, tb.z, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    L.residents.push({ x: sx, z: tb.z, sit: true, face: s < 0 ? 0 : Math.PI });
  }
  return tb;
}
const sides = (R) => (R() < 0.5 ? ['start', 'end'] : ['end', 'start']);

const HOMES = {
  family(P, L, b, R, S, g, low) {
    const [end, other] = sides(R);
    const bed = bedIn(P, S, low, end);
    if (bed && (L.x1 - L.x0) > 5) P.wall(S(low ? 'futon' : 'bed'), 'back', other);
    if (!low) footChest(P, L, S, bed, 'Search the chest');
    stash(P, L, S, low ? 'tansu' : 'cupboard', [['left', 'random'], ['right', 'random'], ['front', 'start']], 'Search the cupboard');
    hearthIn(P, L, b, S, low, other);
    tableIn(P, L, S, low, 'table', (L.x0 + L.x1) / 2 + (end === 'start' ? 0.8 : -0.8), L.z0 + (L.z1 - L.z0) * 0.55, 'chair');
    P.wall(S('shelf'), 'right', 'random') || P.wall(S('lowShelf'), 'front', 'end');
    if (R() < 0.6) P.wall(S('barrel'), 'front', R() < 0.5 ? 'start' : 'end');
    if (R() < 0.5) P.wall(S('plant'), 'front', 'end');
  },
  // nets, floats and barrels of salt fish; a sea chest by the bed
  fisher(P, L, b, R, S, g, low) {
    const [end, other] = sides(R);
    const bed = bedIn(P, S, low, end);
    footChest(P, L, S, bed, 'Search the sea chest') || stash(P, L, S, 'chest', [['right', 'random'], ['left', 'random']], 'Search the sea chest');
    hearthIn(P, L, b, S, low, other);
    P.wall(S('rack'), 'left', 'random');
    P.wall(S('barrel'), 'right', 'start'); P.wall(S('barrel'), 'right', 'start');
    P.wall(S('crate'), 'front', R() < 0.5 ? 'start' : 'end');
    tableIn(P, L, S, low, 'roundTable', (L.x0 + L.x1) / 2, L.z0 + (L.z1 - L.z0) * 0.6, 'stool');
    stash(P, L, S, low ? 'tansu' : 'dresser', [['front', 'end'], ['left', 'end']], 'Search the drawers');
  },
  // a carpenter or smith who works at home: a workbench, timber, tools
  crafter(P, L, b, R, S, g, low) {
    const [end, other] = sides(R);
    const wb = P.wall(S('workbench'), 'back', other) || P.wall(S('workbench'), 'left', 'random') || P.wall(S('workbench'), 'right', 'random');
    if (wb) { const f = [Math.sin(wb.rot), Math.cos(wb.rot)]; L.residents.push({ x: wb.x + f[0] * (wb.d / 2 + 0.3), z: wb.z + f[1] * (wb.d / 2 + 0.3), face: wb.rot + Math.PI }); }
    P.wall(S('rack'), 'right', 'random') || P.wall(S('rack'), 'left', 'random');
    P.wall(S('lumber'), 'front', R() < 0.5 ? 'start' : 'end') || P.wall(S('crate'), 'front', 'start');
    const bed = bedIn(P, S, low, end);
    footChest(P, L, S, bed, 'Search the tool chest');
    stash(P, L, S, low ? 'tansu' : 'dresser', [['left', 'random'], ['right', 'random'], ['front', 'end']], 'Search the drawers');
    hearthIn(P, L, b, S, low, 'center');
    if (R() < 0.7) P.wall(S('crate'), 'right', 'end');
  },
  // books everywhere, a desk under the lamp
  scholar(P, L, b, R, S, g, low) {
    const [end, other] = sides(R);
    P.wall(S('bookcase'), 'back', other) || P.wall(S('shelf'), 'back', other);
    P.wall(S('bookcase'), 'left', 'random') || P.wall(S('lowShelf'), 'left', 'random');
    const desk = P.wall(S('desk'), 'right', 'random') || P.free(S('desk'), 0, (L.z0 + L.z1) / 2);
    if (desk) {
      const f = [Math.sin(desk.rot), Math.cos(desk.rot)], ch = S('chair');
      const cx = desk.x + f[0] * (desk.d / 2 + ch.d * 0.4), cz = desk.z + f[1] * (desk.d / 2 + ch.d * 0.4);
      P.deco(ch, cx, cz, desk.rot + Math.PI);
      L.residents.push({ x: cx, z: cz, sit: true, face: desk.rot + Math.PI });
    }
    const bed = bedIn(P, S, low, end);
    footChest(P, L, S, bed, 'Search the chest') || stash(P, L, S, 'chest', [['front', 'end'], ['left', 'end']], 'Search the chest');
    hearthIn(P, L, b, S, low, 'center');
    if (R() < 0.7) P.wall(S('plant'), 'front', 'end');
  },
  // sacks of grain, barrels, baskets of produce
  farmer(P, L, b, R, S, g, low) {
    const [end, other] = sides(R);
    const bed = bedIn(P, S, low, end);
    stash(P, L, S, low ? 'tansu' : 'cupboard', [['right', 'random'], ['front', 'end'], ['left', 'random']], 'Search the cupboard');
    hearthIn(P, L, b, S, low, other);
    P.wall(S('sacks'), 'left', 'start'); P.wall(S('sacks'), 'left', 'end');
    P.wall(S('produce'), 'right', 'random') || P.wall(S('barrel'), 'right', 'random');
    P.wall(S('barrel'), 'front', R() < 0.5 ? 'start' : 'end');
    tableIn(P, L, S, low, 'table', (L.x0 + L.x1) / 2, L.z0 + (L.z1 - L.z0) * 0.58, 'chair');
    if (!low) footChest(P, L, S, bed, 'Search the chest');
  },
  // an old sea-dog's place: a hammock-bed, a sea chest, a round table and rum
  sailor(P, L, b, R, S, g, low) {
    const [end, other] = sides(R);
    const bed = bedIn(P, S, low, end);
    footChest(P, L, S, bed, 'Search the sea chest') || stash(P, L, S, 'chest', [['left', 'random']], 'Search the sea chest');
    P.wall(S('barrel'), 'back', other); P.wall(S('barrel'), 'right', 'start');
    tableIn(P, L, S, low, 'roundTable', (L.x0 + L.x1) / 2 + (end === 'start' ? 0.5 : -0.5), L.z0 + (L.z1 - L.z0) * 0.55, 'stool');
    P.wall(S('lowShelf'), 'left', 'random') || P.wall(S('shelf'), 'right', 'random');
    hearthIn(P, L, b, S, low, 'center');
    stash(P, L, S, low ? 'tansu' : 'dresser', [['front', 'start'], ['right', 'end']], 'Search the drawers');
  },
};

const ROOMS = {
  house(P, L, b, R, S, g) {
    // homes differ with who lives there
    const low = lowStyle(b);
    const kinds = ['family', 'family', 'fisher', 'crafter', 'scholar', 'farmer', 'sailor'];
    const kind = b.npc ? 'family' : kinds[Math.floor(hash(b.x, b.y, 3.3) * kinds.length) % kinds.length];
    L.kind = kind;
    HOMES[kind](P, L, b, R, S, g, low);
    if (!L.use.some((u) => u.kind === 'loot')) {
      const walls = [['left', 'random'], ['right', 'random'], ['front', 'start'], ['front', 'end'], ['back', 'center']];
      if (!stash(P, L, S, 'chest', walls, 'Search the chest')) {
        const it = P.free({ ...S('chest'), loot: true }, 0, (L.z0 + L.z1) / 2);
        if (it) searchable(L, it, 'Search the chest');
      }
    }
    // the rug, a picture on the wall, and somebody home
    P.deco({ k: low ? 'tatami' : 'rug', w: Math.min(2.2 * g, (L.x1 - L.x0) * 0.6), d: Math.min(1.5 * g, (L.z1 - L.z0) * 0.5), h: 0.02 }, (L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2 + 0.2);
    P.deco({ k: R() < 0.35 ? 'poster' : 'picture', w: 0.55, d: 0.04, h: 0.7 }, L.x0 + (L.x1 - L.x0) * (0.3 + R() * 0.4), L.z0 + 0.02, 0);
    if (!L.residents.length) L.residents.push({ x: (L.x0 + L.x1) / 2, z: (L.z0 + L.z1) / 2 });
  },
  shop(P, L, b, R, S, g) {
    counterRoom(P, L, S, g, { shelf: 'goods' });
    P.wall(S('shelf'), 'left', 'start') || P.wall(S('lowShelf'), 'left', 'start');
    P.wall(S('shelf'), 'right', 'start') || P.wall(S('lowShelf'), 'right', 'start');
    P.wall(S('barrel'), 'front', 'start');
    P.wall(S('crate'), 'front', 'end');
    if (L.z1 - L.z0 > 3) P.free(S('produce'), 0, L.z1 - 1.4);
    P.deco({ k: 'rug', w: 1.4 * g, d: 0.9 * g, h: 0.02 }, L.door.x, L.z1 - 0.7);
  },
  market(P, L, b, R, S, g) {
    counterRoom(P, L, S, g, { shelf: 'goods' });
    P.wall(S('produce'), 'left', 'start');
    P.wall(S('produce'), 'right', 'start');
    P.wall(S('sacks'), 'front', 'start');
    P.wall(S('barrel'), 'front', 'end');
    P.wall(S('crate'), 'left', 'end');
  },
  weapons(P, L, b, R, S, g) {
    counterRoom(P, L, S, g, { shelf: 'wallrack' });
    P.wall(S('rack'), 'left', 'start') || P.wall(S('rack'), 'left', 'end');
    P.wall(S('rack'), 'right', 'start') || P.wall(S('armor'), 'right', 'start');
    P.wall(S('armor'), 'front', 'start');
    P.wall(S('barrel'), 'front', 'end');
  },
  bank(P, L, b, R, S, g) {
    counterRoom(P, L, S, g, { shelf: 'goods', len: 2.6 });
    P.wall(S('safe'), 'right', 'start');
    P.wall(S('bench'), 'left', 'end') || P.wall(S('bench'), 'front', 'start');
    P.wall(S('plant'), 'front', 'end');
  },
  bounty(P, L, b, R, S, g) {
    counterRoom(P, L, S, g, { shelf: 'goods', len: 1.6 });
    // a wall of wanted posters (left wall)
    P.deco({ k: 'wanted', w: Math.min(1.8, (L.z1 - L.z0) - 0.4), d: 0.04, h: 1.0 }, L.x0 + 0.03, (L.z0 + L.z1) / 2 + 0.2, Math.PI / 2);
    P.wall(S('filing'), 'right', 'start');
    P.wall(S('bench'), 'front', 'start');
  },
  library(P, L, b, R, S, g) {
    counterRoom(P, L, S, g, { shelf: 'books', len: 1.6 });
    P.wall(S('bookcase'), 'left', 'start'); P.wall(S('bookcase'), 'left', 'end');
    P.wall(S('bookcase'), 'right', 'start'); P.wall(S('bookcase'), 'right', 'end');
    const tb = P.free(S('table'), 0.6, L.z1 - 1.5);
    if (tb) for (const s of [-1, 1]) P.deco(S('chair'), tb.x + s * (tb.w / 2 + 0.2), tb.z, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    L.use.push({ kind: 'read', x: L.x0 + 0.7, z: (L.z0 + L.z1) / 2, label: 'Browse the shelves' });
  },
  tavern(P, L, b, R, S, g) {
    counterRoom(P, L, S, g, { shelf: 'bottles', len: 3.0 });
    // stools along the bar
    const bar = L.items.find((it) => it.k === 'counter');
    if (bar) for (let x = bar.rect.x0 + 0.35; x < bar.rect.x1 - 0.2; x += 0.62) P.deco(S('stool'), x, bar.rect.z1 + 0.3, 0);
    // round tables
    for (const px of [L.x0 + 0.9, L.x1 - 0.9]) {
      const t = P.free(S('roundTable'), px, L.z1 - 1.05);
      if (!t) continue;
      for (const a of [0, 2.1, 4.2]) {
        const x = t.x + Math.cos(a) * 0.62, z = t.z + Math.sin(a) * 0.62;
        if (x < L.x0 + 0.15 || x > L.x1 - 0.15 || z < L.z0 + 0.15 || z > L.z1 - 0.15) continue;
        P.deco(S('stool'), x, z, 0);
      }
      L.residents.push({ x: t.x + 0.62, z: t.z, sit: true, face: Math.PI / 2 });
    }
    P.wall(S('barrel'), 'right', 'end') || P.wall(S('barrel'), 'front', 'end');
    P.wall(S('barrel'), 'left', 'end');
    P.deco({ k: 'wanted', w: 0.9, d: 0.04, h: 0.8 }, L.x1 - 0.03, (L.z0 + L.z1) / 2, -Math.PI / 2);
    L.rest = bar ? { x: bar.x, z: bar.rect.z1 + 0.7 } : { x: 0, z: L.z1 - 1 };
  },
  inn(P, L, b, R, S, g) {
    ROOMS.tavern(P, L, b, R, S, g);
    // stairs up to the rooms (if there's a free side wall)
    P.wall(S('stairs'), 'left', 'start') || P.wall(S('stairs'), 'right', 'start');
  },
  restaurant(P, L, b, R, S, g) {
    counterRoom(P, L, S, g, { shelf: 'bottles', len: 2.2 });
    // the dining room: a little café has a table by each front corner; a
    // big hall (the Baratie's) has rows of them across its floor, aisles
    // between, a diner at some
    const W = L.x1 - L.x0, D = L.z1 - L.z0;
    const cols = Math.max(2, Math.floor((W - 1.0) / (3.2 * g)));
    const small = cols === 2 && D - 3.0 * g < 5.6 * g;
    // (a big hall's rows go back from the front wall as far as the room left before the counter)
    const rows = small ? 1 : Math.max(1, Math.min(4, 1 + Math.floor((D - 3.7 * g) / (2.4 * g))));
    let diners = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = small ? (c ? L.x1 - 0.8 : L.x0 + 0.8) : L.x0 + 0.5 + (c + 0.5) * (W - 1.0) / cols;
        const pz = L.z1 - (small ? 1.1 : 1.1 * g + r * 2.4 * g);
        const t = small ? P.free(S('table'), px, pz) : P.at(S('table'), px, pz, 0);
        if (!t) continue;
        for (const s of [-1, 1]) {
          const x = t.x + s * (t.w / 2 + 0.22);
          if (x < L.x0 + 0.2 || x > L.x1 - 0.2) continue;
          P.deco(S('chair'), x, t.z, s < 0 ? Math.PI / 2 : -Math.PI / 2);
        }
        if (small || (diners < 6 && (r + c) % 2 === 0)) { L.residents.push({ x: t.x + t.w / 2 + 0.22, z: t.z, sit: true, face: -Math.PI / 2 }); diners++; }
      }
    }
    P.wall(S('plant'), 'front', 'end');
  },
  doctor(P, L, b, R, S, g) {
    // the doctor's desk at the back, medicine behind, beds along the walls
    const desk = P.wall(S('desk'), 'back', 'start', 0.62 * g);
    if (desk) {
      L.keeper = { x: desk.x, z: desk.rect.z0 - 0.32 };
      P.rects.push({ x0: desk.rect.x0, x1: desk.rect.x1, z0: L.z0, z1: desk.rect.z0 });
      L.use.push({ kind: 'service', x: desk.x, z: desk.rect.z1 + 0.45, label: null });
      P.deco(S('chair'), desk.x, desk.rect.z0 - 0.3, 0);
    }
    P.wall(S('cabinet'), 'back', 'end');
    const b1 = P.wall(S('medbed'), 'right', 'start') || P.wall(S('medbed'), 'left', 'start');
    if (b1) L.residents.push({ x: b1.x, z: b1.z, lie: true, rot: b1.rot });
    P.wall(S('medbed'), 'left', 'start');
    P.wall(S('screen'), 'right', 'end');
    P.deco({ k: 'redcross', w: 0.6, d: 0.03, h: 0.6 }, desk ? desk.x : 0, L.z0 + 0.02, 0);
    P.wall(S('plant'), 'front', 'end');
  },
  dojo(P, L, b, R, S, g) {
    P.deco({ k: 'mats', w: (L.x1 - L.x0) - 0.4, d: (L.z1 - L.z0) - 0.3, h: 0.03 }, (L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2);
    const sh = P.wall(S('shrine'), 'back', 'center');
    L.keeper = { x: sh ? sh.x : 0, z: (sh ? sh.rect.z1 : L.z0) + 0.55 };
    P.rects.push({ x0: L.keeper.x - 0.4, x1: L.keeper.x + 0.4, z0: L.keeper.z - 0.35, z1: L.keeper.z + 0.35 });
    P.wall(S('rack'), 'left', 'start'); P.wall(S('rack'), 'right', 'start');
    P.free(S('dummy'), L.x0 + 1.0, L.z1 - 1.2); P.free(S('dummy'), L.x1 - 1.0, L.z1 - 1.2);
    L.use.push({ kind: 'service', x: L.keeper.x, z: L.keeper.z + 0.9, label: null });
  },
  church(P, L, b, R, S, g) {
    const al = P.wall(S('altar'), 'back', 'center', 0.6 * g);
    if (al) {
      L.keeper = { x: al.x, z: al.rect.z0 - 0.3 };
      P.rects.push({ x0: al.rect.x0, x1: al.rect.x1, z0: L.z0, z1: al.rect.z0 });
      L.use.push({ kind: 'service', x: al.x, z: al.rect.z1 + 0.5, label: null });
    }
    for (let z = (al ? al.rect.z1 : L.z0) + 0.9; z < L.z1 - 1.2; z += 0.95) {
      for (const s of [-1, 1]) {
        const w = Math.min(1.9 * g, (L.x1 - L.x0) / 2 - 0.7);
        if (w < 0.8) continue;
        P.at({ ...S('pew'), w }, s * ((L.x1 - L.x0) / 4 + 0.15), z, Math.PI);
      }
    }
    P.wall(S('plant'), 'front', 'start'); P.wall(S('plant'), 'front', 'end');
  },
  marine(P, L, b, R, S, g) {
    const desk = P.wall(S('desk'), 'back', 'center', 0.62 * g);
    if (desk) {
      L.keeper = { x: desk.x, z: desk.rect.z0 - 0.32 };
      P.rects.push({ x0: desk.rect.x0, x1: desk.rect.x1, z0: L.z0, z1: desk.rect.z0 });
      L.use.push({ kind: 'service', x: desk.x, z: desk.rect.z1 + 0.45, label: null });
      P.deco(S('chair'), desk.x, desk.rect.z0 - 0.3, 0);
      P.deco({ ...S('flag'), k: 'marineflag' }, desk.x, L.z0 + 0.03, 0);
    }
    P.wall(S('filing'), 'back', 'start'); P.wall(S('filing'), 'back', 'end');
    P.wall(S('rack'), 'left', 'start');
    P.wall(S('bench'), 'right', 'end') || P.wall(S('bench'), 'front', 'start');
    P.deco({ k: 'wanted', w: 1.2, d: 0.04, h: 0.9 }, L.x1 - 0.03, (L.z0 + L.z1) / 2 - 0.3, -Math.PI / 2);
    L.residents.push({ x: L.x0 + 0.8, z: L.z1 - 1.0, guard: true });
  },
  shipwright(P, L, b, R, S, g) {
    const wb = P.wall(S('workbench'), 'back', 'start', 0.62 * g);
    if (wb) {
      L.keeper = { x: wb.x, z: wb.rect.z0 - 0.32 };
      P.rects.push({ x0: wb.rect.x0, x1: wb.rect.x1, z0: L.z0, z1: wb.rect.z0 });
      L.use.push({ kind: 'service', x: wb.x, z: wb.rect.z1 + 0.45, label: null });
    }
    P.free(S('hull'), L.x1 - 1.6, (L.z0 + L.z1) / 2);
    P.wall(S('lumber'), 'front', 'start') || P.wall(S('lumber'), 'left', 'end');
    P.wall(S('rack'), 'right', 'start');
    P.wall(S('barrel'), 'front', 'end');
  },
};

/** Local (x, z) → world. */
export const toWorld = (b, x, z) => bw(b, x, z);

/** Is the world point inside this building's walls? */
export function insideBuilding(b, x, y, dx = (a, c) => c - a, pad = 0) {
  const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
  const { lx, lz } = bl(b, b.x + dx(b.x, x), y);
  return lx > -fw / 2 + pad && lx < fw / 2 - pad && lz > -fd + pad && lz < -pad;
}
