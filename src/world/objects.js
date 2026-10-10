// Props placed in the world (trees, rocks, buildings, docks furniture...).
// Stored in a chunked spatial index so rendering and interaction only look
// at nearby objects.
import { isEnterable, isPirateHouse, layoutOf, doorOf, WALL_T, PLINTH } from './interiors.js';
import { bw, bbox, bfoot } from './bframe.js';
import { hash01 } from '../core/rng.js';

export const CHUNK = 32;

// Small props collide as the size of their 3D model (a circle of this radius
// in metres, times the object's scale; [halfW, halfD] for a box) instead of
// blocking whole 1 m tiles — a lamp post or a barrel used to throw an
// invisible wall around itself.
export const COLLIDE = {
  // street furniture
  lamp: 0.16, lantern: 0.2, sign: 0.15, flagpole: 0.15, mooring: 0.2, barrel: 0.34, crate: 0.42, haystack: 0.6, chest: 0.4, planter: 0.3, sacks: 0.45, weaponrack: 0.4, signboard: 0.3,
  bench: [0.8, 0.3], stall: [0.95, 0.4], fence: [0.54, 0.1], tent: [1.2, 1.0], campfire: 0.45, well: 0.95, fountain: 1.55, // (its basin's step)
  // nature
  tree: 0.3, rock: 0.5, mushroom: 0.25, crystal: 0.4,
  // landmarks (sized like their models; gates and arches you walk through)
  statue: 0.7, pillar: 0.45, totem: 0.35, dummy: 0.28, cannon: 0.55, anchor: 0.2, grave: 0.3, bell: 0.6, ruins: 0.8,
  poneglyph: [0.8, 0.35], boat: [1.4, 0.6], shipwreck: [2.5, 1.2], lighthouse: 1.6, tower: 2.0, windmill: 1.5, wheel: 1.0, elevator: 1.5,
  ryugu: 8.2, // (Ryugu Palace's coral stalk, at its foot)
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

/**
 * Tree trunks at body height, by species (their models: render3d/props/
 * vegetation.js): a lollipop's stick or a candy cane is thin, a jungle
 * giant's roots spread wide — one size for all left an invisible ring round
 * the thin ones.
 */
const TRUNK = {
  oak: 0.26, autumn: 0.26, cottoncandy: 0.26, cloudtree: 0.26, palm: 0.23, pine: 0.21, snowpine: 0.21, jungle: 0.45, cactus: 0.32,
  dead: 0.22, deadsnow: 0.22, spooky: 0.22, lollipop: 0.09, candycane: 0.16, bamboo: 0.3, coral: 0.13, kelp: 0.3, sakura: 0.28, blossom: 0.28,
};
/**
 * Treasure Tree Adam's trunk on the Sun World (render3d/props/elbaf.js):
 * its radius at the ground, and its buttress roots spreading over the plate
 * round it — [angle (rad), how far out from the trunk they reach (m), how
 * thick they start (m)].
 */
export const ADAM = {
  trunk: 31,
  roots: [[0.25, 20, 6.2], [0.95, 15, 5], [1.6, 22, 6.5], [2.3, 14, 4.6], [2.95, 19, 5.8], [3.65, 16, 5.2], [4.35, 21, 6.4], [5.05, 13, 4.4], [5.7, 18, 5.6]],
};

/** A prop's collider (see COLLIDE; scaled by its size). */
export function colliderOf(o) {
  if (o.kind === 'tree') return TRUNK[o.sub || 'oak'] ?? COLLIDE.tree;
  if (TRUNK[o.kind] !== undefined) return TRUNK[o.kind];
  // (a beached ship, not a rowboat)
  if (o.kind === 'boat' && /flagship|perfume/i.test(o.name || '')) return [3.3, 1.15];
  // a gateway's posts and legs stand solid where they're drawn (render3d/props/
  // landmarks.js); between them you walk through
  if (o.kind === 'torii') return { circles: [[-1.55, 0, 0.3], [1.55, 0, 0.3]] };
  // (Elbaph: Treasure Tree Adam's trunk and the buttress roots round it, the
  // spires of rock round the Sun World's foot, the great roots reaching down
  // into the Underworld — their feet, where they meet the ground: elbaf.js)
  if (o.kind === 'adamtree') {
    const c = [[0, 0, ADAM.trunk + 1]];
    for (const [a, len, r0] of ADAM.roots) {
      for (let t = 0.25; t <= 1.001; t += 0.25) {
        const d = ADAM.trunk + len * t, r = r0 * (1 - t * 0.7) * 0.8;
        c.push([Math.cos(a) * d, Math.sin(a) * d, Math.max(0.8, r)]);
      }
    }
    return { circles: c };
  }
  if (o.kind === 'spire') return { circles: [[0, 0, (o.r || 4) * 0.95]] };
  if (o.kind === 'adamroot') return { circles: [[0, 3, 2.7], [0, 7, 2.3], [0, 11, 1.9], [0, 15, 1.4], [0, 18.5, 1.0]] };
  // (Water 7's Great Fountain: its basin, all round — render3d/props/water7.js)
  if (o.kind === 'greatfountain') return { circles: [[0, 0, 10.1]] };
  // a Galley-La dock's shed: its side walls, its back wall either side of the
  // great doorway, the ship on the stocks down the middle and the crane — its
  // front open to the sea (the shed's own frame: x across, z out to sea)
  if (o.kind === 'galleydock') {
    const c = [];
    for (let z = -10.6; z <= 8.4; z += 0.85) c.push([-10, z, 0.45], [10, z, 0.45]);
    for (let x = -9.6; x <= 9.6; x += 0.85) if (Math.abs(x) > 3.6) c.push([x, -11, 0.45]);
    for (let z = -5.6; z <= 7.6; z += 1.65) c.push([0, z, 3.4]);
    c.push([8.8, 10.1, 0.5]);
    return { circles: c };
  }
  // Buggy's Big Top: its ring of poles, the king pole, the cannon's
  // platform at the back (render3d/props/landmarks.js); under the canvas
  // between the poles you walk straight in
  if (o.kind === 'bigtop') {
    const c = [[0, 0, 0.35]];
    for (let i = 0; i < 16; i += 2) { const a = i / 16 * Math.PI * 2; c.push([Math.cos(a) * 8.6, Math.sin(a) * 8.6, 0.25]); }
    for (const z of [-0.9, 0, 0.9]) c.push([-7.0, z, 1.0]);
    return { circles: c };
  }
  // (the Baratie: her two masts stand on her deck — render3d/props/baratie.js; the rest of her is round it)
  if (o.kind === 'baratie') return { circles: [[-18.5, 0, 0.55], [18.5, 0, 0.55]] };
  if (o.kind === 'gate') {
    const k = /justice/i.test(o.name || '') ? 2.2 : 1; // (the Gate of Justice is drawn 2.2 times the size)
    return { circles: [-1, 1].flatMap((sx) => [[sx * 3.5 * k, -0.45 * k, 0.78 * k], [sx * 3.5 * k, 0.45 * k, 0.78 * k]]) };
  }
  if (o.kind === 'arch') {
    const n = o.name || '';
    if (/heaven/i.test(n)) return { circles: [[-3.2, 0, 0.9], [3.2, 0, 0.9]] };
    if (/mine|hatch|laboratory/i.test(n)) return COLLIDE.arch;
    const [x, r, d] = /one piece|resting/i.test(n) ? [3.1, 0.5, 1.6] : [1.92, 0.38, 1.2];
    return { circles: [-1, 1].flatMap((sx) => [[sx * x, d * 0.25, r], [sx * x, d * 0.75, r]]) };
  }
  // a big bell hangs over your head between two posts (you walk under it); a harbour bell's small frame is solid
  if (o.kind === 'bell') return /harbou?r/i.test(o.name || '') ? [0.72, 0.2] : { circles: [[-1.55, 0, 0.26], [1.55, 0, 0.26]] };
  // a broken wall, three or four blocks long from x = -1.2 and half a metre
  // thick (render3d/props/street.js ruins; the rubble before it you step over)
  if (o.kind === 'ruins') {
    const n = 3 + (Math.floor(hash01(o.x, o.y, 2) * 3) % 2), a = -0.95, b = 0.6 * n - 1.45;
    const m = Math.ceil((b - a) / 0.35) + 1;
    return { circles: Array.from({ length: m }, (_, i) => [a + ((b - a) * i) / (m - 1), 0, 0.28]) };
  }
  return COLLIDE[o.kind];
}

/** How props are turned (radians about the vertical, as their 3D models are): market stalls face the square (set where they're placed). */
export const TURN = {
  boat: (o) => hash01(o.x, o.y) * Math.PI * 2,
  shipwreck: (o) => hash01(o.x, o.y) * Math.PI * 2,
  tent: (o) => (hash01(o.x, o.y, 5) - 0.5) * 0.5,
  ruins: (o) => hash01(o.x, o.y) * Math.PI * 2,
};

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
    // (a landmark seen from far off: the 3D view keeps a list of these)
    if (obj.far) (this.world.farObjects ||= []).push(obj);
    const fl = floorOf(obj);
    if (fl) this.world.addFloor({ x0: obj.x - fl.hw, x1: obj.x + fl.hw, y0: obj.y + fl.oy - fl.hd, y1: obj.y + fl.oy + fl.hd, h: fl.h, o: obj });
    // (how some props are turned — the model and its collider turn together)
    if (obj.yaw === undefined && TURN[obj.kind]) obj.yaw = TURN[obj.kind](obj);
    const c = obj.block && colliderOf(obj);
    if (obj.block && isEnterable(obj)) {
      // a building you can walk into: its floor is open (2), its walls and furniture collide
      obj.enterable = true;
      obj.pirate = isPirateHouse(obj);
      this.align(obj);
      this.stamp(obj, 2);
      this.addInterior(obj);
    } else if (obj.block && isHut(obj)) {
      // a round hut: its wall collides where it's drawn (an ellipse inside its
      // plot, see render3d/buildings3d hut) and the plot's corners stay open
      // to walk through; the plot is still kept clear of trees and spawns (2)
      obj.hut = true;
      this.align(obj);
      this.stamp(obj, 2);
      this.addHutWall(obj);
    } else if (c !== undefined && obj.block && (fl || ((obj.fw || 1) <= 2 && (obj.fd || 1) <= 2))) {
      // collider-sized props don't block tiles (see COLLIDE)
      obj.soft = true;
      if (c) this.addCollider(obj, c);
    } else if (obj.block) { this.align(obj); this.stamp(obj, 1); }
    if (obj.kind === 'building' && obj.style === 'chinese') this.addColumns(obj);
    if (obj.kind === 'building' && obj.style === 'wano' && obj.block && !isHut(obj)) this.addVeranda(obj);
    return obj;
  }

  /** A Wano house's raised wooden veranda along its front (see buildings3d engawa): a floor you step up onto. */
  addVeranda(b) {
    const fw = Math.max(2, b.fw || 3);
    const att = b.attach || {};
    b.veranda = { ...bbox(b, -fw / 2 - (att.left ? 0 : 0.1), fw / 2 + (att.right ? 0 : 0.1), 0.002, 0.9), h: 0.42, o: b };
    this.world.addFloor(b.veranda);
  }

  /** The red columns along a Chinese front stand out from the wall: they're solid (see buildings3d 'column'). */
  addColumns(b) {
    const fw = Math.max(2, b.fw || 3);
    const n = Math.max(2, Math.round(fw / 1.6));
    const d = b.enterable ? doorOf(b) : null;
    b.colCols = [];
    for (let i = 0; i <= n; i++) {
      const x = -fw / 2 + i * fw / n;
      if (d && x > d.x - d.dw / 2 - 0.33 && x < d.x + d.dw / 2 + 0.33) continue; // (none in the doorway)
      b.colCols.push(this.world.addCol({ ...bw(b, x, 0.25), r: 0.2, o: b }));
    }
  }

  /**
   * A hut's elliptical wall (see render3d/buildings3d hut) as a chain of
   * circles along its long axis, each the biggest that fits inside the
   * ellipse there, the last ones round its ends: within a few centimetres of
   * the drawn wall and never outside it.
   */
  addHutWall(b) {
    const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
    const A = Math.max(fw, fd) / 2, Bm = Math.min(fw, fd) / 2; // the semi-axes
    const end = A - (Bm * Bm) / A; // (the centre of curvature at each end)
    const inside = (u) => { let d = Infinity; for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI; d = Math.min(d, Math.hypot(A * Math.cos(t) - u, Bm * Math.sin(t))); } return d; };
    const n = end > 0.01 ? Math.ceil((2 * end) / 0.5) + 1 : 1;
    b.cols = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : -end + (2 * end * i) / (n - 1);
      const p = fw >= fd ? bw(b, u, -fd / 2) : bw(b, 0, -fd / 2 + u);
      b.cols.push(this.world.addCol({ x: p.x, y: p.y, r: inside(u) - 0.02, o: b }));
    }
  }

  addCollider(obj, c) {
    const s = obj.s || 1, w = this.world;
    if (c.circles) {
      // circles in the model's own frame (x across, z its front), turned and scaled with it
      const yaw = obj.yaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
      obj.cols = c.circles.map(([lx, lz, r]) => w.addCol({ x: obj.x + (lx * cs + lz * sn) * s, y: obj.y + (-lx * sn + lz * cs) * s, r: r * s, o: obj }));
      obj.col = obj.cols[0];
      return;
    }
    if (!Array.isArray(c)) { obj.col = w.addCol({ x: obj.x, y: obj.y, r: c * s, o: obj }); return; }
    let hw = c[0] * s, hd = c[1] * s;
    const yaw = obj.yaw || 0, sn = Math.sin(yaw), cs = Math.cos(yaw);
    if (Math.abs(Math.sin(2 * yaw)) < 0.08) {
      // square to the grid (turned a quarter, it's the other way round)
      if (Math.abs(sn) > 0.7) [hw, hd] = [hd, hw];
      obj.col = w.addCol({ x: obj.x, y: obj.y, hw, hd, o: obj });
      return;
    }
    // turned at an angle (a market stall facing the square from its corner, a
    // boat drawn up on a beach): a row of circles down its length, turned as
    // the model is — a box that stayed square to the grid would stand where
    // the model doesn't, an invisible wall beside it
    const long = hw >= hd, L = long ? hw : hd, R = long ? hd : hw;
    // (the model's own x axis is (cos, -sin) on the map, its z axis (sin, cos))
    const ax = long ? cs : sn, ay = long ? -sn : cs;
    const n = Math.max(1, Math.ceil((2 * (L - R)) / R) + 1);
    obj.cols = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : -(L - R) + (2 * (L - R) * i) / (n - 1);
      obj.cols.push(w.addCol({ x: obj.x + ax * u, y: obj.y + ay * u, r: R, o: obj }));
    }
    obj.col = obj.cols[0];
  }

  removeCollider(obj) {
    if (!obj.col) return;
    for (const c of obj.cols || [obj.col]) this.world.removeCol(c);
    obj.col = null; obj.cols = null;
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
    // the steps up to the door: you walk up them (their heights: see render3d/height.js)
    b.stepsFloor = { ...bbox(b, d.x - d.dw / 2 - 0.2, d.x + d.dw / 2 + 0.2, 0.002, 1.3), h: 0, o: b, steps: d.x };
    w.addFloor(b.stepsFloor);
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
    if (b.stepsFloor) w.removeFloor(b.stepsFloor);
    b.cols = null; b.doorCol = null; b.floor = null; b.stepsFloor = null; b.furnished = false;
  }

  remove(obj) {
    const list = this.chunks.get(obj._chunk);
    if (list) {
      const i = list.indexOf(obj);
      if (i >= 0) list.splice(i, 1);
    }
    if (obj.far && this.world.farObjects) this.world.farObjects = this.world.farObjects.filter((o) => o !== obj);
    this.byId.delete(obj.id);
    this.count--;
    if (obj.veranda) { this.world.removeFloor(obj.veranda); obj.veranda = null; }
    if (obj.enterable) { this.removeInterior(obj); this.stamp(obj, 0); }
    else if (obj.hut) { for (const c of obj.cols || []) this.world.removeCol(c); obj.cols = null; this.stamp(obj, 0); }
    else if (obj.soft) this.removeCollider(obj);
    else if (obj.block) this.stamp(obj, 0);
  }

  /**
   * Set something that blocks whole tiles onto the tile grid (a landmark
   * placed by its spot can stand a fraction of a tile off it): its tiles are
   * whole ones and its model is drawn where it stands, so off the grid a
   * strip of blocked tiles along one side had nothing drawn on it (an
   * invisible wall) and the other side's wall hung over open ground.
   */
  align(obj) {
    let fx, fy;
    if (obj.rot) { const r = bfoot(obj); fx = r.x0; fy = r.y0; }
    else { fx = obj.x - (obj.fw || 1) / 2; fy = obj.y - (obj.fd || 1); }
    obj.x = this.world.wx(obj.x + Math.round(fx) - fx);
    obj.y += Math.round(fy) - fy;
  }

  /** Mark or clear the tiles covered by an object's footprint. */
  stamp(obj, v) {
    const w = this.world;
    const fp = footprint(obj);
    for (let y = fp.y0; y < fp.y1; y++) {
      for (let x = fp.x0; x < fp.x1; x++) {
        if (y < 0 || y >= w.height) continue;
        w.setBlocked(x, y, v);
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
/** Drawn as a round hut (see render3d/buildings3d: the tribal style's walls, or a hut roof). */
export function isHut(o) {
  return o.kind === 'building' && (o.style === 'tribal' || o.roofType === 'hut');
}

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
