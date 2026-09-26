// The insides of enterable buildings (see world/interiors.js for the shared
// layout): hollow ground-floor walls with real window and door openings, the
// door leaf that swings (or slides) open, and the furnished room — floor,
// wall linings, ceiling, curtains, beds, counters, shelves of bottles, a
// fire in the hearth — built when you come near enough to look in.
//
// Rooms are lit without shadows (the roof would otherwise leave them dark)
// and their lamps and fires glow at night.
import * as THREE from 'three';
import { Mesher, box, cyl, blob, extrude, shade, hash } from './props/kit.js';
import { vcMat } from './props/mats.js';
import { registerFrameHook } from './registry.js';
import { layoutOf, doorOf, groundWindows, WALL_T, lowStyle } from '../world/interiors.js';

// ------------------------------------------------------------ palettes
const BASE = {
  floor: '#9c6b43', floor2: '#86582f', pattern: 'planks', wall: '#efe2c8', wall2: '#e3d3b4', skirt: '#6d4c33', ceil: '#e9dcc3', beam: '#6b4a2e', beams: true,
  wood: '#8d5a34', woodL: '#b07a4a', woodD: '#5a3a22', metal: '#5d6d7e', sheet: '#f4efe4', cloth: ['#b03a2e', '#2e6b8a', '#4f7d3a', '#8e44ad', '#d68910', '#1a5276'],
};
const PAL = {
  village: {},
  town: { wall: '#f3e7d3', wall2: '#e9d9bf', beams: false },
  port: { floor: '#7d5a3c', floor2: '#6a4a30', wall: '#e5d3b3' },
  city: { floor: '#8a5a3a', floor2: '#6e452b', pattern: 'parquet', wall: '#efe0cc', wall2: '#dcc6a8', beams: false },
  giant: {},
  snow: { floor: '#8d6e4a', floor2: '#76593a', wall: '#b08968', wall2: '#9c7656', pattern: 'planks', skirt: '#5d4037', ceil: '#9c7a58', beam: '#5d4037', cloth: ['#b71c1c', '#1a237e', '#2e7d32', '#e65100'] },
  wano: { floor: '#cdb97d', floor2: '#6b5a2e', pattern: 'tatami', wall: '#f1e9d6', wall2: '#e6dcc4', skirt: '#3e2723', ceil: '#d8c7a0', beam: '#3e2723', wood: '#6d4c33', woodL: '#8d6e4a', woodD: '#3e2723', cloth: ['#1f3a68', '#7b1f1f', '#2e5e3a', '#4a2e6b'] },
  chinese: { floor: '#8e5b3a', floor2: '#6d4228', wall: '#f6e3cf', wall2: '#ecd3bb', skirt: '#8e2b22', beam: '#8e2b22', wood: '#8e2b22', woodL: '#b03a2e', woodD: '#5c1d17', cloth: ['#b03a2e', '#d4ac0d', '#1e8449'] },
  desert: { floor: '#d8b98c', floor2: '#c29f70', pattern: 'tiles', wall: '#f2dfbf', wall2: '#e6cfa6', skirt: '#b08b5b', ceil: '#ecd8b4', beams: true, cloth: ['#c0392b', '#d68910', '#1a5276', '#7d3c98'] },
  marine: { floor: '#a7a39a', floor2: '#8f8b82', pattern: 'tiles', wall: '#f4f6f8', wall2: '#e2e8ee', skirt: '#1b4f72', ceil: '#eef1f4', beams: false, cloth: ['#1b4f72', '#2e86c1', '#1b4f72'] },
  noble: { floor: '#ece6da', floor2: '#cdbfa6', pattern: 'tiles', wall: '#fbf3e4', wall2: '#efe2c9', skirt: '#b9975b', ceil: '#fffaf0', beam: '#d4ac0d', beams: false, wood: '#6d3b1f', woodL: '#8e5132', cloth: ['#7d3c98', '#1a5276', '#922b21'] },
  sky: { floor: '#f4f6f7', floor2: '#dfe6ea', pattern: 'tiles', wall: '#fdfefe', wall2: '#eef6fb', skirt: '#aed6f1', ceil: '#ffffff', beams: false, wood: '#c9b28f', woodL: '#e0cba8', cloth: ['#aed6f1', '#f9e79f', '#d2b4de'] },
  candy: { floor: '#f5c6d6', floor2: '#eba5bd', pattern: 'tiles', wall: '#fdebd0', wall2: '#fadbd8', skirt: '#e74c3c', ceil: '#fff5e6', beams: false, wood: '#c0845a', woodL: '#e0a878', cloth: ['#ec7063', '#af7ac5', '#5dade2'] },
  fishman: { floor: '#a3e4d7', floor2: '#7fcfbf', pattern: 'tiles', wall: '#e8f6f3', wall2: '#d1f2eb', skirt: '#48c9b0', ceil: '#d6eaf8', beams: false, wood: '#b9770e', woodL: '#d4a24a', cloth: ['#48c9b0', '#f1948a', '#5dade2'] },
  future: { floor: '#d5d8dc', floor2: '#b3b9bf', pattern: 'tiles', wall: '#f2f4f4', wall2: '#e5e8e8', skirt: '#48c9b0', ceil: '#ffffff', beams: false, wood: '#7f8c8d', woodL: '#a6acaf', cloth: ['#48c9b0', '#e74c3c', '#3498db'] },
  spooky: { floor: '#5b4a3a', floor2: '#473a2d', wall: '#7d6b86', wall2: '#6c5b76', skirt: '#2c2c3a', ceil: '#5b4a6b', beam: '#2c2c3a', wood: '#4e3b30', woodL: '#6a5244', cloth: ['#4a235a', '#1c2833', '#641e16'] },
};
export function palOf(b) {
  const p = { ...BASE, ...(PAL[b.style] || {}) };
  // a little variety between neighbours
  const v = b.v || 0;
  if (!PAL[b.style]?.wall && v % 3 === 1) { p.wall = '#e8efe6'; p.wall2 = '#d9e3d6'; }
  if (!PAL[b.style]?.wall && v % 3 === 2) { p.wall = '#f2e3d9'; p.wall2 = '#e6d0c2'; }
  return p;
}

/** Axis-aligned box from corner to corner. */
function B(k, x0, y0, z0, x1, y1, z1, color, o = {}) {
  k.add(box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), { at: [(x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2], color, ...o });
}

// ------------------------------------------------------------ openings

/** The outline of a window opening centred at (cx, cy) in a wall's (u, y) plane. */
export function openingPath(kind, cx, cy, w, h) {
  const P = new THREE.Path();
  if (kind === 'round') { P.absarc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2, false); return P; }
  if (kind === 'arch' || kind === 'gothic') {
    const r = w / 2;
    P.moveTo(cx - r, cy - h / 2); P.lineTo(cx + r, cy - h / 2); P.lineTo(cx + r, cy + h / 2 - r);
    if (kind === 'gothic') {
      P.quadraticCurveTo(cx + r, cy + h / 2 - r * 0.2, cx, cy + h / 2 + r * 0.35);
      P.quadraticCurveTo(cx - r, cy + h / 2 - r * 0.2, cx - r, cy + h / 2 - r);
    } else P.absarc(cx, cy + h / 2 - r, r, 0, Math.PI, false);
    P.closePath();
    return P;
  }
  P.moveTo(cx - w / 2, cy - h / 2); P.lineTo(cx + w / 2, cy - h / 2); P.lineTo(cx + w / 2, cy + h / 2); P.lineTo(cx - w / 2, cy + h / 2); P.closePath();
  return P;
}

/** A wall outline from u0 to u1 and yb to top, with the door notched out of its foot (if any). */
function wallShape(u0, u1, yb, top, door, y0) {
  const s = new THREE.Shape();
  s.moveTo(u0, yb);
  if (door) {
    const dl = door.x - door.dw / 2, dr = door.x + door.dw / 2, dt = y0 + door.dh;
    s.lineTo(dl, yb);
    if (door.kind === 'arch') { const r = door.dw / 2; s.lineTo(dl, dt - r); s.absarc(door.x, dt - r, r, Math.PI, 0, true); }
    else { s.lineTo(dl, dt); s.lineTo(dr, dt); }
    s.lineTo(dr, yb);
  }
  s.lineTo(u1, yb); s.lineTo(u1, top); s.lineTo(u0, top);
  s.closePath();
  return s;
}

/** Where the ground-floor openings are, in each wall's own (u, y) plane. */
export function openingsOf(b, y0) {
  const out = { front: [], left: [], right: [] };
  for (const w of groundWindows(b)) out[w.face].push({ ...w, y: y0 + w.y });
  return out;
}

/**
 * The ground floor as a hollow shell: the front wall with the doorway
 * notched out and window holes, the side walls with theirs, the back wall.
 */
export function hollowWalls(k, b, o) {
  const { fw, fd, y0, top, wallCol } = o;
  const T = WALL_T, yb = y0 - 0.05;
  const ops = openingsOf(b, y0);
  const front = wallShape(-fw / 2, fw / 2, yb, top, doorOf(b), y0);
  for (const w of ops.front) front.holes.push(openingPath(w.kind, w.u, w.y, w.w, w.h));
  k.add(extrude(front, T, 0, 10), { at: [0, 0, -T / 2], color: wallCol, outline: 0.045 });
  for (const side of ['left', 'right']) {
    const s = wallShape(-fd + T, -T, yb, top, null, y0);
    for (const w of ops[side]) s.holes.push(openingPath(w.kind, w.u, w.y, w.w, w.h));
    const x = side === 'left' ? -fw / 2 + T / 2 : fw / 2 - T / 2;
    k.add(extrude(s, T, 0, 10), { at: [x, 0, 0], rot: [0, -Math.PI / 2, 0], color: wallCol, outline: 0.045 });
  }
  B(k, -fw / 2, yb, -fd, fw / 2, top, -fd + T, wallCol, { outline: 0.045 });
  return ops;
}

/** A thin ring frame around a rectangular opening (w × h) centred on the origin. */
export function rectFrame(k, w, h, t, z0, z1, color) {
  B(k, -w / 2 - t, -h / 2 - t, z0, w / 2 + t, -h / 2, z1, color);
  B(k, -w / 2 - t, h / 2, z0, w / 2 + t, h / 2 + t, z1, color);
  B(k, -w / 2 - t, -h / 2, z0, -w / 2, h / 2, z1, color);
  B(k, w / 2, -h / 2, z0, w / 2 + t, h / 2, z1, color);
}

/** A flat ring between a shape scaled up by (sx, sy) and the shape itself. */
export function shapeFrame(shape, sx, sy) {
  const outer = new THREE.Shape(shape.getPoints(10).map((p) => new THREE.Vector2(p.x * sx, p.y * sy)));
  outer.holes.push(new THREE.Path(shape.getPoints(10)));
  return new THREE.ShapeGeometry(outer, 10);
}

// ------------------------------------------------------------ the door leaf

/** The door itself on a hinge at its left edge (a Group whose rotation.y opens it). */
export function doorLeaf(b, o) {
  const { y0, wood, frame } = o;
  const d = doorOf(b);
  const dw = d.dw, dh = d.dh, t = 0.07;
  const k = new Mesher();
  if (d.kind === 'arch') {
    const r = dw / 2;
    const s = new THREE.Shape();
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, dh - r); s.absarc(0, dh - r, r, 0, Math.PI, false); s.closePath();
    k.add(extrude(s, t, 0, 10), { at: [r, 0, 0], color: wood, outline: 0.015 });
    for (let i = 1; i < 4; i++) B(k, i * dw / 4 - 0.012, 0.08, t / 2, i * dw / 4 + 0.012, dh - r * 0.6, t / 2 + 0.02, shade(wood, -0.3));
  } else if (d.kind === 'noren') {
    // a sliding lattice door
    B(k, 0, 0, -t / 2, dw, dh, t / 2, '#3e2723', { outline: 0.012 });
    B(k, 0.08, 0.1, t / 2, dw - 0.08, dh - 0.1, t / 2 + 0.01, '#f3ead3');
    for (let i = 1; i < 3; i++) B(k, i * dw / 3 - 0.015, 0.1, t / 2, i * dw / 3 + 0.015, dh - 0.1, t / 2 + 0.03, '#5d4037');
    for (let i = 1; i < 5; i++) B(k, 0.08, i * dh / 5 - 0.015, t / 2, dw - 0.08, i * dh / 5 + 0.015, t / 2 + 0.03, '#5d4037');
  } else {
    B(k, 0, 0, -t / 2, dw, dh, t / 2, wood, { outline: 0.015 });
    for (const sgn of [1, -1]) {
      const z = sgn * (t / 2 + 0.01);
      if (d.kind === 'plank') for (let i = 1; i < 4; i++) B(k, i * dw / 4 - 0.012, 0.05, z - 0.01, i * dw / 4 + 0.012, dh - 0.05, z + 0.01, shade(wood, -0.3));
      else { B(k, 0.12, 0.25, z - 0.012, dw - 0.12, dh * 0.45, z + 0.012, shade(wood, 0.12)); B(k, 0.12, dh * 0.55, z - 0.012, dw - 0.12, dh - 0.15, z + 0.012, shade(wood, 0.12)); }
    }
  }
  if (d.kind !== 'noren') for (const sgn of [1, -1]) k.add(new THREE.SphereGeometry(0.05, 6, 4), { at: [dw - 0.16, dh * 0.47, sgn * (t / 2 + 0.04)], color: '#f1c40f' });
  const mesh = new THREE.Mesh(k.build(false), vcMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  pivot.position.set(d.x - dw / 2, y0, -WALL_T / 2);
  pivot.userData = { baseX: d.x - dw / 2, y0, dw, slide: d.kind === 'noren', a: 0 };
  void frame;
  return pivot;
}

/** Swing (or slide) the leaf toward where the game says the door is. */
export function animateDoor(pivot, b, dt) {
  const u = pivot.userData;
  if (b.doorBroken) {
    // kicked flat into the room
    pivot.position.set(u.baseX + 0.1, u.y0 + 0.05, -WALL_T / 2 - 0.05);
    pivot.rotation.set(-Math.PI / 2 + 0.06, 0, 0.22);
    u.fallen = true;
    return;
  }
  if (u.fallen) { u.fallen = false; pivot.rotation.set(0, 0, 0); pivot.position.set(u.baseX, u.y0, -WALL_T / 2); }
  const want = b.doorOpen ? 1 : 0;
  u.a += (want - u.a) * Math.min(1, dt * (want ? 7 : 5));
  const shake = b.doorShake > 0 ? Math.sin(performance.now() * 0.06) * 0.05 * b.doorShake / 0.35 : 0;
  if (u.slide) { pivot.position.x = u.baseX - u.a * (u.dw - 0.12); pivot.rotation.y = 0; }
  else pivot.rotation.y = u.a * 1.55 + shake;
}

// ------------------------------------------------------------ the room

/** The furnished room of an enterable building (one merged, shadow-free mesh). */
export function buildRoom(b, o) {
  const { fw, fd, y0, ceil } = o;
  const L = layoutOf(b);
  const P = palOf(b);
  const T = WALL_T;
  const k = new Mesher();
  const x0 = -fw / 2 + T, x1 = fw / 2 - T, z0 = -fd + T, z1 = -T;
  const top = y0 + ceil;
  const R = (i) => hash(b.x, b.y, i + 0.37);
  const cloth = P.cloth[Math.floor(R(1) * P.cloth.length)];
  // floor
  B(k, x0, y0 - 0.04, z0, x1, y0 + 0.012, z1, P.floor);
  B(k, L.door.x - L.door.dw / 2, y0 - 0.04, -T, L.door.x + L.door.dw / 2, y0 + 0.008, 0, P.floor2);
  floorPattern(k, P, x0, x1, z0, z1, y0 + 0.012);
  // wall linings (their own colour, no shadows), skirting and ceiling
  const ops = openingsOf(b, y0);
  const lf = wallShape(x0, x1, y0, top, L.door, y0);
  for (const w of ops.front) lf.holes.push(openingPath(w.kind, w.u, w.y, w.w, w.h));
  k.add(extrude(lf, 0.02, 0, 10), { at: [0, 0, z1 - 0.011], color: P.wall });
  for (const side of ['left', 'right']) {
    const s = wallShape(z0, z1, y0, top, null, y0);
    for (const w of ops[side]) s.holes.push(openingPath(w.kind, w.u, w.y, w.w, w.h));
    k.add(extrude(s, 0.02, 0, 10), { at: [side === 'left' ? x0 + 0.011 : x1 - 0.011, 0, 0], rot: [0, -Math.PI / 2, 0], color: P.wall });
  }
  B(k, x0, y0, z0, x1, top, z0 + 0.02, P.wall);
  // a darker dado band and skirting boards (split at the door)
  const dado = y0 + 0.95;
  const dl = L.door.x - L.door.dw / 2, dr = L.door.x + L.door.dw / 2;
  for (const [a, c] of [[x0, dl], [dr, x1]]) {
    if (c - a < 0.02) continue;
    B(k, a, y0, z1 - 0.045, c, y0 + 0.12, z1 - 0.02, P.skirt);
    if (P.beams) B(k, a, dado, z1 - 0.04, c, dado + 0.05, z1 - 0.02, P.skirt);
  }
  B(k, x0, y0, z0 + 0.02, x1, y0 + 0.12, z0 + 0.045, P.skirt);
  for (const sx of [x0 + 0.02, x1 - 0.045]) B(k, sx, y0, z0, sx + 0.025, y0 + 0.12, z1, P.skirt);
  if (P.beams) {
    B(k, x0, dado, z0 + 0.02, x1, dado + 0.05, z0 + 0.04, P.skirt);
    for (const sx of [x0 + 0.02, x1 - 0.04]) B(k, sx, dado, z0, sx + 0.02, dado + 0.05, z1, P.skirt);
  }
  B(k, x0, top - 0.05, z0, x1, top + 0.02, z1, P.ceil);
  if (P.beams) for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.25) B(k, x - 0.07, top - 0.2, z0, x + 0.07, top - 0.05, z1, P.beam, { outline: 0.01 });
  // curtains in homes, inns and taverns
  if (L.room === 'house' || L.room === 'tavern' || L.room === 'inn' || L.room === 'restaurant' || L.room === 'doctor') curtains(k, ops, P, cloth, x0, x1, z0, z1, y0, lowStyle(b));
  // furniture
  for (const it of L.items) {
    k.save();
    const y = it.k === 'lamp' ? top : y0;
    k.translate(it.x, y, it.z);
    k.rotateY(it.rot || 0);
    try { piece(k, it, P, cloth, R, top - y0); } catch (e) { console.warn('furniture failed', it.k, e); }
    k.restore();
  }
  const mesh = new THREE.Mesh(k.build(false), vcMat());
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function floorPattern(k, P, x0, x1, z0, z1, y) {
  const c = P.floor2;
  if (P.pattern === 'tatami') {
    // mats 0.9 × 1.8 with dark cloth borders
    for (let x = x0; x < x1 - 0.05; x += 0.9) B(k, x - 0.02, y, z0, x + 0.02, y + 0.006, z1, c);
    for (let z = z0; z < z1 - 0.05; z += 1.8) B(k, x0, y, z - 0.02, x1, y + 0.006, z + 0.02, c);
    return;
  }
  if (P.pattern === 'tiles') {
    for (let x = x0 + 0.5; x < x1; x += 0.5) B(k, x - 0.008, y, z0, x + 0.008, y + 0.004, z1, c);
    for (let z = z0 + 0.5; z < z1; z += 0.5) B(k, x0, y, z - 0.008, x1, y + 0.004, z + 0.008, c);
    return;
  }
  if (P.pattern === 'parquet') {
    let i = 0;
    for (let z = z0; z < z1 - 0.05; z += 0.45, i++) {
      for (let x = x0 + (i % 2) * 0.45; x < x1 - 0.05; x += 0.9) B(k, x, y, z, Math.min(x1, x + 0.45), y + 0.003, Math.min(z1, z + 0.45), c);
    }
    return;
  }
  // planks along x with staggered joints
  let i = 0;
  for (let z = z0 + 0.22; z < z1; z += 0.22, i++) {
    B(k, x0, y, z - 0.008, x1, y + 0.004, z + 0.008, c);
    for (let x = x0 + ((i * 0.73) % 1.4) + 0.4; x < x1 - 0.1; x += 1.4) B(k, x - 0.008, y, z - 0.22, x + 0.008, y + 0.004, z, c);
  }
}

function curtains(k, ops, P, cloth, x0, x1, z0, z1, y0, low) {
  const col = low ? '#f3ead3' : cloth;
  for (const w of ops.front) {
    const hh = w.h + 0.3, yTop = w.y + w.h / 2 + 0.18;
    B(k, w.u - w.w / 2 - 0.35, yTop, z1 - 0.1, w.u + w.w / 2 + 0.35, yTop + 0.04, z1 - 0.06, P.woodD);
    for (const s of [-1, 1]) {
      const cx = w.u + s * (w.w / 2 + 0.12);
      for (let i = 0; i < 3; i++) B(k, cx - 0.14 + i * 0.1, yTop - hh, z1 - 0.1 - (i % 2) * 0.03, cx - 0.14 + i * 0.1 + 0.1, yTop, z1 - 0.07 - (i % 2) * 0.03, shade(col, (i % 2) * -0.12));
    }
  }
  for (const side of ['left', 'right']) {
    const sx = side === 'left' ? x0 + 0.07 : x1 - 0.07;
    for (const w of ops[side]) {
      const hh = w.h + 0.3, yTop = w.y + w.h / 2 + 0.18;
      B(k, sx - 0.02, yTop, w.u - w.w / 2 - 0.35, sx + 0.02, yTop + 0.04, w.u + w.w / 2 + 0.35, P.woodD);
      for (const s of [-1, 1]) {
        const cz = w.u + s * (w.w / 2 + 0.12);
        for (let i = 0; i < 3; i++) {
          const dz = (side === 'left' ? 1 : -1) * (i % 2) * 0.03;
          B(k, sx - 0.015 + dz, yTop - hh, cz - 0.14 + i * 0.1, sx + 0.015 + dz, yTop, cz - 0.14 + i * 0.1 + 0.1, shade(col, (i % 2) * -0.12));
        }
      }
    }
  }
  void z0; void y0;
}

// ------------------------------------------------------------ furniture
// Each piece is built around its own origin: x across its width, z out of
// its front (+z), y up from the floor.

const BOTTLES = ['#2e7d32', '#6d4c41', '#1b5e20', '#827717', '#4e342e', '#b71c1c', '#1565c0'];
const GOODS = ['#c0392b', '#d68910', '#27ae60', '#2980b9', '#8e44ad', '#f1c40f', '#a1887f', '#e67e22'];
const BOOKS = ['#7b241c', '#1a5276', '#145a32', '#6e2c00', '#4a235a', '#7d6608', '#512e5f', '#1b2631'];

function legs(k, w, d, h, col, t = 0.06, inset = 0.04) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(k, sx * (w / 2 - inset) - t / 2, 0, sz * (d / 2 - inset) - t / 2, sx * (w / 2 - inset) + t / 2, h, sz * (d / 2 - inset) + t / 2, col);
}

function shelves(k, w, d, h, n, P, fill, R) {
  const wood = P.wood;
  B(k, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.03, shade(wood, -0.15));
  for (const s of [-1, 1]) B(k, s > 0 ? w / 2 - 0.035 : -w / 2, 0, -d / 2, s > 0 ? w / 2 : -w / 2 + 0.035, h, d / 2, wood, { outline: 0.01 });
  for (let i = 0; i <= n; i++) {
    const y = 0.06 + i * (h - 0.1) / n;
    B(k, -w / 2, y, -d / 2, w / 2, y + 0.035, d / 2, P.woodL);
    if (i < n && fill) fill(y + 0.035, (h - 0.1) / n - 0.05, i);
  }
  void R;
}

function piece(k, it, P, cloth, R, ceilH) {
  const { w, d, h } = it;
  const wood = P.wood, woodL = P.woodL, woodD = P.woodD;
  switch (it.k) {
    case 'bed': {
      B(k, -w / 2, 0.12, -d / 2, w / 2, 0.38, d / 2, wood, { outline: 0.015 });
      legs(k, w, d, 0.14, woodD, 0.08, 0.05);
      B(k, -w / 2 + 0.04, 0.38, -d / 2 + 0.05, w / 2 - 0.04, 0.52, d / 2 - 0.04, P.sheet);
      B(k, -w / 2 + 0.02, 0.4, -d / 2 + 0.62, w / 2 - 0.02, 0.58, d / 2 - 0.02, cloth, { outline: 0.01 });
      B(k, -w / 2 + 0.03, 0.52, -d / 2 + 0.08, w / 2 - 0.03, 0.6, -d / 2 + 0.4, '#ffffff');
      B(k, -w / 2 - 0.02, 0.12, -d / 2 - 0.02, w / 2 + 0.02, 0.98, -d / 2 + 0.05, woodD, { outline: 0.015 });
      B(k, -w / 2 - 0.02, 0.12, d / 2 - 0.05, w / 2 + 0.02, 0.62, d / 2 + 0.02, woodD);
      break;
    }
    case 'futon': {
      B(k, -w / 2, 0, -d / 2, w / 2, 0.09, d / 2, P.sheet);
      B(k, -w / 2 + 0.02, 0.05, -d / 2 + 0.55, w / 2 - 0.02, 0.14, d / 2 - 0.03, cloth);
      B(k, -w / 2 + 0.2, 0.09, -d / 2 + 0.08, w / 2 - 0.2, 0.17, -d / 2 + 0.35, '#e8e0cc');
      break;
    }
    case 'table': {
      B(k, -w / 2, h - 0.06, -d / 2, w / 2, h, d / 2, woodL, { outline: 0.012 });
      legs(k, w, d, h - 0.06, wood, 0.07);
      // a mug and a plate
      k.add(cyl(0.045, 0.04, 0.1, 7), { at: [w * 0.18, h, d * 0.1], color: '#d7ccc8' });
      k.add(cyl(0.11, 0.1, 0.02, 10), { at: [-w * 0.15, h, -d * 0.08], color: '#fafafa' });
      break;
    }
    case 'lowtable': {
      B(k, -w / 2, h - 0.05, -d / 2, w / 2, h, d / 2, woodD, { outline: 0.012 });
      legs(k, w, d, h - 0.05, woodD, 0.07);
      k.add(cyl(0.04, 0.035, 0.07, 7), { at: [0.12, h, 0], color: '#eceff1' });
      k.add(cyl(0.06, 0.05, 0.08, 7), { at: [-0.12, h, 0.05], color: '#5d4037' });
      break;
    }
    case 'roundtable': {
      k.add(cyl(w / 2, w / 2, 0.05, 14), { at: [0, h - 0.05, 0], color: woodL, outline: 0.012 });
      k.add(cyl(0.06, 0.07, h - 0.05, 7), { color: wood });
      k.add(cyl(0.22, 0.25, 0.04, 10), { color: woodD });
      // mugs of grog
      for (const [x, z] of [[0.15, 0.1], [-0.12, 0.14], [0.02, -0.18]]) {
        k.add(cyl(0.05, 0.045, 0.12, 7), { at: [x, h, z], color: '#8d6e63' });
        k.add(cyl(0.045, 0.045, 0.02, 7), { at: [x, h + 0.11, z], color: '#fff3e0' });
      }
      break;
    }
    case 'chair': {
      B(k, -0.21, 0.42, -0.21, 0.21, 0.47, 0.21, woodL);
      legs(k, 0.42, 0.42, 0.42, wood, 0.045, 0.03);
      B(k, -0.21, 0.47, -0.21, 0.21, 0.92, -0.17, wood);
      break;
    }
    case 'stool': {
      k.add(cyl(0.18, 0.17, 0.06, 10), { at: [0, 0.64, 0], color: woodL, outline: 0.01 });
      for (let i = 0; i < 3; i++) { const a = i * 2.09; k.add(cyl(0.025, 0.03, 0.64, 5), { at: [Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11], color: wood }); }
      break;
    }
    case 'cushion': {
      B(k, -0.24, 0, -0.24, 0.24, 0.09, 0.24, cloth);
      break;
    }
    case 'cupboard': case 'dresser': case 'tansu': {
      B(k, -w / 2, 0.05, -d / 2, w / 2, h, d / 2, it.k === 'tansu' ? woodD : wood, { outline: 0.015 });
      B(k, -w / 2 - 0.03, h - 0.05, -d / 2, w / 2 + 0.03, h + 0.02, d / 2 + 0.03, woodD);
      if (it.k === 'cupboard') {
        for (const s of [-1, 1]) {
          B(k, s > 0 ? 0.02 : -w / 2 + 0.06, 0.18, d / 2, s > 0 ? w / 2 - 0.06 : -0.02, h - 0.12, d / 2 + 0.02, woodL);
          k.add(new THREE.SphereGeometry(0.03, 5, 4), { at: [s * 0.07, h * 0.52, d / 2 + 0.03], color: '#d4ac0d' });
        }
      } else {
        const n = it.k === 'tansu' ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const ya = 0.1 + i * (h - 0.16) / n, yb = ya + (h - 0.16) / n - 0.04;
          B(k, -w / 2 + 0.05, ya, d / 2, w / 2 - 0.05, yb, d / 2 + 0.02, it.k === 'tansu' ? wood : woodL);
          B(k, -0.08, (ya + yb) / 2 - 0.02, d / 2 + 0.02, 0.08, (ya + yb) / 2 + 0.02, d / 2 + 0.04, it.k === 'tansu' ? '#1c1c1c' : '#d4ac0d');
        }
      }
      if (it.k === 'dresser') k.add(cyl(0.07, 0.09, 0.2, 8), { at: [w * 0.25, h + 0.02, 0], color: '#5dade2' });
      break;
    }
    case 'shelf': case 'lowshelf': case 'goods': case 'books': case 'bookcase': case 'bottles': case 'medcabinet': {
      const kind = it.k;
      const n = Math.max(2, Math.round(h / 0.42));
      shelves(k, w, d, h, n, P, (y, gap, row) => {
        let x = -w / 2 + 0.06;
        let i = 0;
        while (x < w / 2 - 0.08) {
          const r = R(row * 31 + i * 7 + (it.x * 13 | 0));
          if (kind === 'books' || kind === 'bookcase') {
            const bw = 0.04 + r * 0.05, bh = gap * (0.6 + r * 0.35);
            B(k, x, y, -d / 2 + 0.05, x + bw, y + bh, d / 2 - 0.04, BOOKS[Math.floor(r * BOOKS.length)]);
            x += bw + 0.004;
          } else if (kind === 'bottles' || kind === 'medcabinet') {
            const bh = gap * (0.45 + r * 0.4);
            const col = kind === 'medcabinet' ? ['#fafafa', '#aed6f1', '#f5b7b1', '#abebc6'][Math.floor(r * 4)] : BOTTLES[Math.floor(r * BOTTLES.length)];
            k.add(cyl(0.032, 0.038, bh * 0.7, 6), { at: [x + 0.04, y, 0], color: col });
            k.add(cyl(0.012, 0.018, bh * 0.3, 5), { at: [x + 0.04, y + bh * 0.7, 0], color: col });
            x += 0.1 + r * 0.04;
          } else {
            // jars, boxes and plates
            const s = 0.1 + r * 0.12;
            if (r < 0.4) k.add(cyl(s * 0.45, s * 0.5, s * 1.1, 7), { at: [x + s / 2, y, 0], color: GOODS[Math.floor(r * 17) % GOODS.length] });
            else if (r < 0.75) B(k, x, y, -d / 2 + 0.06, x + s, y + s * 0.9, d / 2 - 0.05, GOODS[Math.floor(r * 23) % GOODS.length]);
            else k.add(cyl(s * 0.6, s * 0.6, 0.02, 10), { at: [x + s / 2, y + s * 0.5, -d / 2 + 0.06], rot: [Math.PI / 2, 0, 0], color: '#fafafa' });
            x += s + 0.03;
          }
          i++;
          if (i > 40) break;
        }
      }, R);
      if (kind === 'medcabinet') {
        B(k, -w / 2, h * 0.45, d / 2 - 0.01, w / 2, h, d / 2 + 0.005, '#d6eaf8', { glow: null });
        B(k, -0.12, h + 0.02, d / 2 - 0.02, 0.12, h + 0.26, d / 2, '#fafafa');
        B(k, -0.03, h + 0.05, d / 2, 0.03, h + 0.23, d / 2 + 0.01, '#c0392b');
        B(k, -0.09, h + 0.11, d / 2, 0.09, h + 0.17, d / 2 + 0.01, '#c0392b');
      }
      break;
    }
    case 'wallrack': case 'rack': {
      B(k, -w / 2, 0.3, -d / 2, w / 2, h, -d / 2 + 0.04, woodD, { outline: 0.01 });
      for (const s of [-1, 1]) B(k, s * w / 2 - 0.05, 0, -d / 2, s * w / 2, h, d / 2, wood);
      const n = Math.max(2, Math.round(w / 0.28));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * w / n;
        if (i % 3 === 2) { k.add(cyl(0.15, 0.15, 0.04, 10), { at: [x, h * 0.55, -d / 2 + 0.06], rot: [Math.PI / 2, 0, 0], color: '#95a5a6' }); continue; }
        B(k, x - 0.018, 0.35, -d / 2 + 0.06, x + 0.018, h - 0.25, -d / 2 + 0.09, '#dfe6e9');
        B(k, x - 0.07, h - 0.3, -d / 2 + 0.05, x + 0.07, h - 0.26, -d / 2 + 0.1, '#d4ac0d');
        B(k, x - 0.025, h - 0.26, -d / 2 + 0.06, x + 0.025, h - 0.08, -d / 2 + 0.09, '#3e2723');
      }
      break;
    }
    case 'stove': {
      B(k, -w / 2, 0.08, -d / 2, w / 2, h, d / 2, '#2d3436', { outline: 0.015 });
      legs(k, w, d, 0.1, '#1e272e', 0.05);
      B(k, -w / 2 + 0.1, 0.25, d / 2, w / 2 - 0.1, 0.55, d / 2 + 0.02, '#1e272e');
      B(k, -w / 2 + 0.16, 0.3, d / 2 + 0.01, w / 2 - 0.16, 0.48, d / 2 + 0.03, '#e67e22', { glow: '#ff7f24', flicker: 0.4 });
      k.add(cyl(0.07, 0.07, ceilH - h, 8), { at: [0, h, -d / 4], color: '#2d3436' });
      k.add(cyl(0.16, 0.13, 0.2, 10), { at: [w * 0.15, h, d * 0.1], color: '#6d4c41' });
      break;
    }
    case 'fireplace': {
      B(k, -w / 2, 0, -d / 2, w / 2, h, d / 2, '#9e9a90', { outline: 0.02 });
      B(k, -w / 2 + 0.25, 0.08, d / 2 - 0.02, w / 2 - 0.25, h - 0.45, d / 2 + 0.005, '#2b2622');
      B(k, -w / 2 - 0.08, h - 0.08, -d / 2, w / 2 + 0.08, h, d / 2 + 0.1, woodD);
      B(k, -w / 2 + 0.3, h, -d / 2, w / 2 - 0.3, ceilH, -d / 2 + 0.4, '#9e9a90');
      // logs and a fire
      for (let i = 0; i < 2; i++) k.add(cyl(0.05, 0.05, 0.4, 6), { at: [-0.2 + i * 0.12, 0.1, d / 2 - 0.2], rot: [0, 0, Math.PI / 2], color: '#5d4037' });
      k.add(new THREE.ConeGeometry(0.16, 0.34, 6), { at: [0, 0.28, d / 2 - 0.2], color: '#ffb74d', glow: '#ff9f40', flicker: 0.6 });
      k.add(new THREE.ConeGeometry(0.09, 0.24, 6), { at: [0.1, 0.24, d / 2 - 0.15], color: '#ffe082', glow: '#ffd180', flicker: 0.7 });
      k.add(cyl(0.035, 0.035, 0.22, 6), { at: [-w / 4, h, 0], color: '#f5f5f5' });
      k.add(new THREE.SphereGeometry(0.03, 5, 4), { at: [-w / 4, h + 0.24, 0], color: '#ffd54f', glow: '#ffcc66', flicker: 0.5 });
      break;
    }
    case 'hibachi': {
      B(k, -w / 2, 0, -d / 2, w / 2, h, d / 2, '#6d4c41', { outline: 0.01 });
      B(k, -w / 2 + 0.05, h - 0.02, -d / 2 + 0.05, w / 2 - 0.05, h + 0.005, d / 2 - 0.05, '#9e9e9e');
      k.add(new THREE.SphereGeometry(0.03, 5, 4), { at: [0, h + 0.02, 0], color: '#ff7043', glow: '#ff7043', flicker: 0.4 });
      k.add(cyl(0.09, 0.11, 0.14, 8), { at: [0.06, h, 0.04], color: '#37474f' });
      break;
    }
    case 'chest': {
      B(k, -w / 2, 0, -d / 2, w / 2, h * 0.7, d / 2, woodL, { outline: 0.015 });
      B(k, -w / 2 - 0.01, h * 0.7, -d / 2 - 0.01, w / 2 + 0.01, h, d / 2 + 0.01, wood);
      for (const s of [-1, 1]) B(k, s * w * 0.3 - 0.03, 0, -d / 2 - 0.012, s * w * 0.3 + 0.03, h + 0.01, d / 2 + 0.012, '#4a4a4a');
      B(k, -0.05, h * 0.55, d / 2, 0.05, h * 0.8, d / 2 + 0.03, '#d4ac0d');
      break;
    }
    case 'barrel': {
      k.add(cyl(w * 0.44, w * 0.4, h, 10), { color: wood, outline: 0.012 });
      k.add(cyl(w * 0.46, w * 0.46, 0.05, 10), { at: [0, h * 0.2, 0], color: '#4a4a4a' });
      k.add(cyl(w * 0.46, w * 0.46, 0.05, 10), { at: [0, h * 0.78, 0], color: '#4a4a4a' });
      k.add(cyl(w * 0.4, w * 0.4, 0.02, 10), { at: [0, h, 0], color: woodL });
      break;
    }
    case 'crate': {
      B(k, -w / 2, 0, -d / 2, w / 2, h, d / 2, '#b08850', { outline: 0.012 });
      for (const y of [0.05, h - 0.1]) B(k, -w / 2 - 0.01, y, -d / 2 - 0.01, w / 2 + 0.01, y + 0.06, d / 2 + 0.01, '#8d6e4a');
      break;
    }
    case 'sacks': {
      for (let i = 0; i < 3; i++) k.add(blob(0.24, 1), { at: [-0.22 + i * 0.22, 0.2 + (i === 1 ? 0.18 : 0), (i % 2) * 0.05], scale: [1, 0.85, 0.8], color: '#c8a97e', flat: true });
      break;
    }
    case 'plant': {
      k.add(cyl(0.16, 0.12, 0.32, 8), { color: '#b9653b', outline: 0.01 });
      k.add(blob(0.3, 1), { at: [0, 0.62, 0], scale: [1, 1.2, 1], color: '#4f8a3a', flat: true });
      k.add(blob(0.2, 1), { at: [0.12, 0.88, 0.04], color: '#5c9c44', flat: true });
      break;
    }
    case 'counter': {
      B(k, -w / 2, 0, -d / 2, w / 2, h - 0.05, d / 2, wood, { outline: 0.015 });
      B(k, -w / 2 - 0.04, h - 0.05, -d / 2 - 0.04, w / 2 + 0.04, h, d / 2 + 0.06, woodL, { outline: 0.012 });
      for (let x = -w / 2 + 0.3; x < w / 2 - 0.1; x += 0.6) B(k, x, 0.12, d / 2, x + 0.45, h - 0.2, d / 2 + 0.02, shade(wood, 0.12));
      k.add(cyl(0.05, 0.07, 0.05, 8), { at: [w / 2 - 0.25, h, 0], color: '#d4ac0d' });
      break;
    }
    case 'desk': case 'workbench': {
      B(k, -w / 2, h - 0.06, -d / 2, w / 2, h, d / 2, it.k === 'workbench' ? '#a1784f' : woodL, { outline: 0.012 });
      legs(k, w, d, h - 0.06, wood, 0.08);
      B(k, w / 2 - 0.45, 0.1, -d / 2 + 0.03, w / 2 - 0.05, h - 0.06, d / 2 - 0.03, wood);
      if (it.k === 'desk') {
        B(k, -0.25, h, -0.12, 0.05, h + 0.012, 0.12, '#fafafa');
        k.add(cyl(0.03, 0.035, 0.06, 6), { at: [0.2, h, 0.05], color: '#1c2833' });
      } else {
        B(k, -0.4, h, -0.05, 0.05, h + 0.05, 0.02, '#7f8c8d');
        k.add(cyl(0.02, 0.02, 0.28, 5), { at: [0.2, h + 0.02, 0.1], rot: [0, 0, Math.PI / 2], color: '#6d4c33' });
        B(k, 0.25, h, 0.05, 0.36, h + 0.06, 0.15, '#34495e');
      }
      break;
    }
    case 'medbed': {
      B(k, -w / 2, 0.45, -d / 2, w / 2, 0.52, d / 2, '#bdc3c7', { outline: 0.012 });
      legs(k, w, d, 0.45, '#95a5a6', 0.04);
      B(k, -w / 2 + 0.03, 0.52, -d / 2 + 0.03, w / 2 - 0.03, 0.64, d / 2 - 0.03, '#fafafa');
      B(k, -w / 2 + 0.55, 0.55, -d / 2 + 0.02, w / 2 - 0.02, 0.68, d / 2 - 0.02, '#aed6f1');
      B(k, -w / 2 + 0.06, 0.64, -d / 2 + 0.12, -w / 2 + 0.45, 0.72, d / 2 - 0.12, '#ffffff');
      B(k, -w / 2 - 0.02, 0.45, -d / 2, -w / 2 + 0.02, 1.0, d / 2, '#95a5a6');
      break;
    }
    case 'screen': {
      for (let i = 0; i < 3; i++) {
        const x = -w / 2 + i * w / 3;
        B(k, x, 0.05, -0.02, x + w / 3 - 0.02, h, 0.02, '#ecf0f1', { outline: 0.008 });
        B(k, x, 0, -0.03, x + 0.03, h + 0.02, 0.03, '#95a5a6');
      }
      break;
    }
    case 'armorstand': {
      k.add(cyl(0.18, 0.2, 0.05, 8), { color: woodD });
      k.add(cyl(0.03, 0.03, h * 0.6, 5), { color: woodD });
      B(k, -0.24, h * 0.55, -0.14, 0.24, h * 0.85, 0.14, '#95a5a6', { outline: 0.012 });
      k.add(new THREE.SphereGeometry(0.15, 8, 6), { at: [0, h * 0.93, 0], color: '#7f8c8d' });
      break;
    }
    case 'dummy': {
      k.add(cyl(0.2, 0.22, 0.06, 8), { color: woodD });
      k.add(cyl(0.04, 0.04, h, 5), { color: woodD });
      k.add(cyl(0.17, 0.19, 0.7, 8), { at: [0, h - 1.0, 0], color: '#d4b16a', outline: 0.012 });
      k.add(new THREE.SphereGeometry(0.14, 8, 6), { at: [0, h - 0.12, 0], color: '#d4b16a' });
      B(k, -0.4, h - 0.45, -0.03, 0.4, h - 0.39, 0.03, woodD);
      break;
    }
    case 'shrine': {
      B(k, -w / 2, 0.9, -d / 2, w / 2, 0.96, d / 2, woodD, { outline: 0.012 });
      B(k, -w * 0.3, 0.96, -d / 2 + 0.05, w * 0.3, 1.3, d / 2 - 0.08, woodL, { outline: 0.01 });
      k.add(cyl(0.1, 0.1, 0.02, 12), { at: [0, 1.13, d / 2 - 0.06], rot: [Math.PI / 2, 0, 0], color: '#f1c40f' });
      for (const s of [-1, 1]) B(k, s * w * 0.38 - 0.02, 0.62, d / 2 - 0.1, s * w * 0.38 + 0.02, 0.9, d / 2 - 0.08, '#ffffff');
      for (const s of [-1, 1]) k.add(cyl(0.05, 0.05, 0.12, 6), { at: [s * w * 0.4, 0.96, 0], color: '#ecf0f1', glow: '#ffcc66', flicker: 0.4 });
      break;
    }
    case 'pew': {
      B(k, -w / 2, 0.42, -d / 2, w / 2, 0.47, d / 2 - 0.05, woodL, { outline: 0.012 });
      B(k, -w / 2, 0.47, -d / 2, w / 2, h, -d / 2 + 0.05, wood, { outline: 0.01 });
      for (const s of [-1, 1]) B(k, s * w / 2 - 0.05 * (s > 0 ? 1 : 0), 0, -d / 2, s * w / 2 + 0.05 * (s < 0 ? 1 : 0), h * 0.7, d / 2, wood);
      break;
    }
    case 'altar': {
      B(k, -w / 2, 0, -d / 2, w / 2, h, d / 2, '#ecf0f1', { outline: 0.015 });
      B(k, -w / 2 + 0.1, h - 0.3, d / 2, w / 2 - 0.1, h, d / 2 + 0.02, '#c0392b');
      for (const s of [-1, 1]) {
        k.add(cyl(0.035, 0.035, 0.3, 6), { at: [s * w * 0.35, h, 0], color: '#fdfefe' });
        k.add(new THREE.SphereGeometry(0.035, 5, 4), { at: [s * w * 0.35, h + 0.33, 0], color: '#ffd54f', glow: '#ffcc66', flicker: 0.5 });
      }
      B(k, -0.15, h, -0.1, 0.15, h + 0.04, 0.1, '#6e2c00');
      break;
    }
    case 'safe': {
      B(k, -w / 2, 0, -d / 2, w / 2, h, d / 2, '#34495e', { outline: 0.015 });
      k.add(cyl(0.1, 0.1, 0.04, 12), { at: [0, h * 0.55, d / 2], rot: [Math.PI / 2, 0, 0], color: '#d4ac0d' });
      B(k, 0.15, h * 0.35, d / 2, 0.2, h * 0.75, d / 2 + 0.04, '#bdc3c7');
      break;
    }
    case 'bench': {
      B(k, -w / 2, h - 0.05, -d / 2, w / 2, h, d / 2, woodL, { outline: 0.01 });
      legs(k, w, d, h - 0.05, wood, 0.06);
      break;
    }
    case 'filing': {
      B(k, -w / 2, 0, -d / 2, w / 2, h, d / 2, '#6c7a6b', { outline: 0.012 });
      for (let i = 0; i < 4; i++) {
        const y = 0.08 + i * (h - 0.1) / 4;
        B(k, -w / 2 + 0.04, y, d / 2, w / 2 - 0.04, y + (h - 0.1) / 4 - 0.04, d / 2 + 0.01, '#7f8f7e');
        B(k, -0.06, y + 0.1, d / 2 + 0.01, 0.06, y + 0.13, d / 2 + 0.03, '#bdc3c7');
      }
      break;
    }
    case 'stairs': {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + i * w / n;
        B(k, x, 0, -d / 2, x + w / n, (i + 1) * h / n, d / 2, i % 2 ? woodL : wood, { outline: 0.008 });
      }
      for (let i = 0; i <= 4; i++) { const x = -w / 2 + i * w / 4; B(k, x - 0.02, (i + 0.5) * h / 5, d / 2 - 0.05, x + 0.02, (i + 0.5) * h / 5 + 0.9, d / 2 - 0.01, woodD); }
      break;
    }
    case 'lumber': {
      for (let i = 0; i < 6; i++) B(k, -w / 2 + (i % 2) * 0.05, i * 0.1, -d / 2 + (i % 3) * 0.04, w / 2 - (i % 2) * 0.05, i * 0.1 + 0.09, d / 2 - 0.1 + (i % 3) * 0.04, i % 2 ? '#c49a6c' : '#b08850');
      break;
    }
    case 'hull': {
      B(k, -w / 2, 0.1, -0.06, w / 2, 0.22, 0.06, '#8d6e4a', { outline: 0.01 });
      for (let i = 0; i < 6; i++) {
        const x = -w / 2 + 0.25 + i * (w - 0.5) / 5;
        const s = 1 - Math.abs(i - 2.5) / 3.5;
        for (const sz of [-1, 1]) {
          k.add(box(0.05, h * s, 0.05), { at: [x, 0.15, sz * 0.12 * s], rot: [sz * -0.5, 0, 0], color: '#a1784f' });
        }
      }
      k.add(box(0.1, 0.1, 0.1), { at: [w / 2 - 0.2, 0, 0.4], color: '#6d4c33' });
      break;
    }
    case 'produce': {
      B(k, -w / 2, 0.5, -d / 2, w / 2, 0.56, d / 2, woodL, { outline: 0.01 });
      legs(k, w, d, 0.5, wood, 0.06);
      const fr = ['#e74c3c', '#f39c12', '#27ae60', '#f1c40f', '#8e44ad'];
      for (let i = 0; i < 3; i++) {
        const x = -w / 2 + 0.2 + i * (w - 0.4) / 2;
        k.add(cyl(0.16, 0.13, 0.12, 9), { at: [x, 0.56, 0], color: '#a1784f' });
        for (let j = 0; j < 5; j++) k.add(new THREE.SphereGeometry(0.055, 6, 4), { at: [x + Math.cos(j * 1.3) * 0.08, 0.7 + (j % 2) * 0.04, Math.sin(j * 1.3) * 0.08], color: fr[(i + j) % fr.length] });
      }
      break;
    }
    case 'rug': {
      B(k, -w / 2, 0.012, -d / 2, w / 2, 0.022, d / 2, shade(cloth, -0.25));
      B(k, -w / 2 + 0.1, 0.022, -d / 2 + 0.1, w / 2 - 0.1, 0.026, d / 2 - 0.1, cloth);
      B(k, -w / 4, 0.026, -d / 4, w / 4, 0.029, d / 4, '#f5e6c4');
      break;
    }
    case 'tatami': case 'mats': {
      B(k, -w / 2, 0.012, -d / 2, w / 2, 0.03, d / 2, '#d6c68e');
      for (let x = -w / 2; x <= w / 2 + 1e-3; x += Math.min(0.9, w / 2)) B(k, x - 0.02, 0.03, -d / 2, x + 0.02, 0.034, d / 2, '#4e4a2e');
      B(k, -w / 2, 0.03, -0.02, w / 2, 0.034, 0.02, '#4e4a2e');
      break;
    }
    case 'picture': {
      B(k, -w / 2, 1.3, -0.02, w / 2, 1.3 + h, 0.02, woodD, { outline: 0.008 });
      B(k, -w / 2 + 0.05, 1.3 + h * 0.45, 0.02, w / 2 - 0.05, 1.3 + h - 0.05, 0.03, '#85c1e9');
      B(k, -w / 2 + 0.05, 1.35, 0.02, w / 2 - 0.05, 1.3 + h * 0.45, 0.03, '#58a55c');
      k.add(new THREE.SphereGeometry(0.05, 6, 4), { at: [w * 0.2, 1.3 + h * 0.72, 0.03], color: '#fef9e7' });
      break;
    }
    case 'poster': case 'wanted': {
      const n = it.k === 'wanted' ? Math.max(2, Math.floor(w / 0.42)) : 1;
      if (it.k === 'wanted') B(k, -w / 2 - 0.05, 1.05, -0.02, w / 2 + 0.05, 1.05 + h + 0.1, 0.01, '#8d6e4a', { outline: 0.008 });
      for (let i = 0; i < n; i++) {
        const pw = it.k === 'wanted' ? Math.min(0.36, w / n - 0.06) : w, ph = pw * 1.3;
        const cx = -w / 2 + (i + 0.5) * w / n, cy = 1.1 + (it.k === 'wanted' ? (i % 2) * 0.08 + 0.05 : 0.15);
        const tilt = (R(i + 9) - 0.5) * 0.12;
        k.save(); k.translate(cx, cy, 0.015 + i * 0.001); k.rotateZ(tilt);
        B(k, -pw / 2, 0, 0, pw / 2, ph, 0.006, '#ead9ae');
        B(k, -pw * 0.34, ph * 0.3, 0.006, pw * 0.34, ph * 0.78, 0.01, '#7a6650');
        k.add(new THREE.SphereGeometry(pw * 0.12, 6, 4), { at: [0, ph * 0.56, 0.012], scale: [1, 1, 0.3], color: '#e0b48a' });
        B(k, -pw * 0.38, ph * 0.83, 0.006, pw * 0.38, ph * 0.93, 0.01, '#3e2a1a');
        B(k, -pw * 0.3, ph * 0.13, 0.006, pw * 0.3, ph * 0.2, 0.01, '#3e2a1a');
        B(k, -pw * 0.34, ph * 0.05, 0.006, pw * 0.34, ph * 0.09, 0.01, '#8b1a1a');
        k.restore();
      }
      break;
    }
    case 'redcross': {
      B(k, -w / 2, 1.55, -0.01, w / 2, 1.55 + h, 0.01, '#fafafa', { outline: 0.006 });
      B(k, -w * 0.1, 1.55 + h * 0.15, 0.01, w * 0.1, 1.55 + h * 0.85, 0.02, '#c0392b');
      B(k, -w * 0.35, 1.55 + h * 0.4, 0.01, w * 0.35, 1.55 + h * 0.6, 0.02, '#c0392b');
      break;
    }
    case 'flag': case 'marineflag': {
      B(k, -w / 2 - 0.05, 2.0, -0.02, w / 2 + 0.05, 2.04, 0.04, '#d4ac0d');
      B(k, -w / 2, 2.0 - h * 0.75, -0.005, w / 2, 2.0, 0.01, '#fdfefe', { outline: 0.006 });
      k.add(cyl(w * 0.2, w * 0.2, 0.01, 14), { at: [0, 2.0 - h * 0.38, 0.012], rot: [Math.PI / 2, 0, 0], color: '#1b4f72' });
      B(k, -w * 0.16, 2.0 - h * 0.4, 0.02, w * 0.16, 2.0 - h * 0.36, 0.025, '#fdfefe');
      break;
    }
    case 'board': {
      B(k, -w / 2, 1.1, -0.02, w / 2, 1.1 + h, 0.02, '#a1784f', { outline: 0.008 });
      break;
    }
    case 'lamp': {
      // hangs from the ceiling (this piece's origin is at the ceiling)
      k.add(cyl(0.008, 0.008, 0.42, 4), { at: [0, -0.42, 0], color: '#2d3436' });
      k.add(cyl(0.16, 0.08, 0.1, 8), { at: [0, -0.52, 0], color: '#2d3436' });
      k.add(new THREE.SphereGeometry(0.11, 8, 6), { at: [0, -0.6, 0], color: '#fff1c4', glow: '#ffcf70', flicker: 0.12 });
      break;
    }
    default:
      B(k, -w / 2, 0, -d / 2, w / 2, h, d / 2, wood);
  }
  void woodD;
}

// Rooms are big merges: one is built per frame, the nearest waiting one first.
const pending = [];
export function requestRoom(d, build) { pending.push([d, build]); }
registerFrameHook(() => {
  if (!pending.length) return;
  let best = pending[0];
  for (const q of pending) if (q[0] < best[0]) best = q;
  pending.length = 0;
  best[1]();
});
