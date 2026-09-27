// Detail for the terrain's deck, quay and wall tiles, one merged mesh per
// terrain chunk (called by terrain3d for full-detail chunks):
//   * harbour piers: plank seams across the deck, stringers under its edges,
//     tall pilings standing on the sea bed with cross-bracing between them,
//     rope rails along the sides, bollards along the T-shaped head where the
//     ships berth, and a lantern on each corner of it;
//   * the stone quay at the root of a pier: paving level with the deck, a
//     coping round its edge, a sea wall down into the water in front and a
//     retaining wall wherever the ground beside it lies lower;
//   * bridges: seams, trim and short pilings with a rope rail;
//   * sea-train rails: sleepers and two steel rails;
//   * town and fortress walls: a coping band and crenellations.
// Coordinates are chunk-local tiles, like terrain3d's deck boxes (tile i, j
// spans x ∈ [i, i + 1], z ∈ [j, j + 1]).
import * as THREE from 'three';
import { Mesher, box, cyl, C } from './kit.js';
import { vcMat } from './mats.js';
import { T, IS_LIQUID, OVERLAY } from '../../world/tiles.js';
import { DECK_Y, DOCK_Y, WALL_H, CHUNK } from '../height.js';

const SEAM = '#5d4030', TRIM = '#6d4c33', PILE = '#5a3e2b', ROPE = '#c8b89a', IRON = '#2e2a28';
const STEEL = '#8a9499', SLEEPER = '#5d4a3a';
const STONE = ['#a39c90', '#978f83', '#9d968a'], COPING = '#b3ada2', WALLSTONE = '#857d71', WEED = '#4f5a44';

/** A Mesh with the detail for chunk (x0, y0), or null when it has no decks, quays or walls. */
export function dockDetails(world, x0, y0, size = CHUNK, hf = null) {
  const k = new Mesher();
  const type = (i, j) => world.type(x0 + i, y0 + j);
  const water = (i, j) => { const t = type(i, j); return IS_LIQUID[t] && !OVERLAY[t]; };
  const deck = (i, j) => OVERLAY[type(i, j)] === 1;
  const pier = (i, j) => world.isDock(x0 + i, y0 + j);
  const quay = (i, j) => world.isQuay(x0 + i, y0 + j);
  const wall = (i, j) => type(i, j) === T.WALL;
  const floor = (x, z) => (hf ? hf.terrain(x0 + x, y0 + z) : -3);
  let any = false;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const t = type(i, j);
      if (OVERLAY[t]) {
        any = true;
        const info = world.dockAt(x0 + i, y0 + j);
        if (info) { pierTile(k, i, j, x0, y0, info, { water, pier, floor }); continue; }
        bridgeTile(k, i, j, x0, y0, t, { water, deck });
      } else if (world.quays.size && quay(i, j)) {
        any = true;
        quayTile(k, i, j, x0, y0, { water, quay, pier, floor });
      } else if (t === T.WALL) {
        any = true;
        const cx = i + 0.5, cz = j + 0.5;
        const wtop = 0.4 + WALL_H;
        k.add(box(1.02, 0.18, 1.02), { at: [cx, wtop - 0.18, cz], color: '#6f675c' });
        // merlons on alternate tiles, on the outer faces
        if (((x0 + i) + (y0 + j)) % 2 === 0) k.add(box(0.5, 0.55, 0.5), { at: [cx, wtop, cz], color: '#8a7f70', outline: 0.02 });
        if (!wall(i, j + 1) && !deck(i, j + 1)) k.add(box(1.0, 0.1, 0.06), { at: [cx, 0.9, j + 1.02], color: '#6f675c' });
      }
    }
  }
  if (!any) return null;
  const mesh = new THREE.Mesh(k.build(false), vcMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'deck-detail';
  return mesh;
}

// ------------------------------------------------------------------ harbour piers
const EDGES = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function pierTile(k, i, j, x0, y0, info, { water, pier, floor }) {
  const top = DOCK_Y, cx = i + 0.5, cz = j + 0.5;
  const alongX = info.vx !== 0; // the pier runs along x here
  const wx = x0 + i, wy = y0 + j;
  // plank seams across the pier
  for (const s of [-0.34, 0, 0.34]) {
    k.add(box(alongX ? 0.03 : 1.0, 0.012, alongX ? 1.0 : 0.03), { at: [cx + (alongX ? s + 0.16 : 0), top, cz + (alongX ? 0 : s + 0.16)], color: SEAM });
  }
  // a row of piles down the middle of the pier, every other tile
  if (!(info.a & 1) && !(info.b & 1) && Math.abs(info.b) < info.hb) {
    const f = floor(cx, cz);
    k.add(cyl(0.16, 0.18, top - f - 0.1, 7), { at: [cx, f, cz], color: PILE });
  }
  for (const [dx, dz] of EDGES) {
    if (pier(i + dx, j + dz) || !water(i + dx, j + dz)) continue;
    const alongEdgeX = dz !== 0;
    const ex = dx > 0 ? i + 1 : dx < 0 ? i : cx, ez = dz > 0 ? j + 1 : dz < 0 ? j : cz;
    // is this the pier's side (running with it), or an end (the head's front, the shoulders of the T)?
    const side = alongEdgeX === alongX;
    // the stringer under the edge and a trim board on it
    k.add(box(alongEdgeX ? 1.0 : 0.16, 0.34, alongEdgeX ? 0.16 : 1.0), { at: [ex - dx * 0.08, top - 0.5, ez - dz * 0.08], color: TRIM });
    k.add(box(alongEdgeX ? 1.02 : 0.1, 0.14, alongEdgeX ? 0.1 : 1.02), { at: [ex + dx * 0.02, top - 0.14, ez + dz * 0.02], color: '#7a5638' });
    // a piling at every other tile corner along the edge, standing on the sea bed and up past the deck
    const parity = ((alongEdgeX ? wx : wy) & 1) === 0;
    if (parity) {
      const px = alongEdgeX ? i : ex - dx * 0.1, pz = alongEdgeX ? ez - dz * 0.1 : j;
      const f = floor(px + dx * 0.3, pz + dz * 0.3);
      // (up past the deck as the rail posts along the pier's sides; flush with it elsewhere)
      const rail = side && !info.head;
      const up = rail ? 0.95 : -0.04;
      k.add(cyl(0.15, 0.18, top + up - f, 8), { at: [px, f, pz], color: PILE, outline: 0.015 });
      if (rail) k.add(cyl(0.17, 0.17, 0.06, 8), { at: [px, top + up, pz], color: '#4a3223' });
      // cross-bracing to the next piling along (two tiles on), between the water and the deck
      const nx = alongEdgeX ? px + 2 : px, nz = alongEdgeX ? pz : pz + 2;
      const next = alongEdgeX ? pier(i + 1, j) && water(i + 1 + dx, j + dz) : pier(i, j + 1) && water(i + dx, j + 1 + dz);
      if (next) {
        const y0b = -0.2, y1b = top - 0.6, len = Math.hypot(2, y1b - y0b), ang = Math.atan2(y1b - y0b, 2);
        for (const flip of [1, -1]) {
          k.save();
          k.translate((px + nx) / 2 + dx * 0.02, (y0b + y1b) / 2, (pz + nz) / 2 + dz * 0.02);
          if (!alongEdgeX) k.rotateY(Math.PI / 2);
          k.rotateZ(ang * flip);
          k.add(box(len, 0.12, 0.08), { at: [0, -0.06, 0], color: '#5c4230' });
          k.restore();
        }
        // and a rope rail between the rail posts along the pier's sides
        if (side && !info.head) {
          const r = Math.hypot(nx - px, nz - pz);
          k.add(cyl(0.025, 0.025, r, 4), { at: [px, top + 0.82, pz], rot: alongEdgeX ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0], color: ROPE });
          k.add(cyl(0.02, 0.02, r, 4), { at: [px, top + 0.45, pz], rot: alongEdgeX ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0], color: ROPE });
        }
      }
    }
    // bollards to make fast to, along the sides of the head where the ships berth
    if (info.head && side && ((alongEdgeX ? wx : wy) % 3 === 1)) {
      const bx = alongEdgeX ? cx : ex - dx * 0.35, bz = alongEdgeX ? ez - dz * 0.35 : cz;
      k.add(cyl(0.16, 0.19, 0.42, 9), { at: [bx, top, bz], color: IRON, outline: 0.015 });
      k.add(cyl(0.22, 0.22, 0.08, 9), { at: [bx, top + 0.42, bz], color: IRON });
    }
  }
  // a lantern on a post at each outer corner of the head
  if (info.last && Math.abs(info.b) === info.hb) {
    // (towards the corner: out to sea, and out to this side)
    const sb = Math.sign(info.b), px = -info.vy, pz = info.vx;
    const lx = cx + 0.25 * (info.vx + px * sb), lz = cz + 0.25 * (info.vy + pz * sb);
    k.add(cyl(0.07, 0.09, 2.3, 6), { at: [lx, top, lz], color: '#3e2a1e', outline: 0.012 });
    k.add(box(0.5, 0.06, 0.06), { at: [lx, top + 2.25, lz], color: '#3e2a1e' });
    k.add(cyl(0.15, 0.17, 0.36, 6), { at: [lx, top + 1.86, lz], color: '#fff3c4', glow: '#ffcf70', flicker: 0.2, outline: 0.012 });
    k.add(cyl(0.02, 0.22, 0.18, 6), { at: [lx, top + 2.22, lz], color: IRON });
  }
}

// ------------------------------------------------------------------ bridges, rails
function bridgeTile(k, i, j, x0, y0, t, { water, deck }) {
  const top = DECK_Y, cx = i + 0.5, cz = j + 0.5;
  // which way does the deck run? (seams go across it)
  const alongX = (deck(i - 1, j) ? 1 : 0) + (deck(i + 1, j) ? 1 : 0) >= (deck(i, j - 1) ? 1 : 0) + (deck(i, j + 1) ? 1 : 0);
  if (t === T.RAIL) {
    // sea-train track: sleepers across, two rails along
    for (let s = 0; s < 2; s++) {
      const o = -0.25 + s * 0.5;
      k.add(box(alongX ? 0.16 : 1.1, 0.06, alongX ? 1.1 : 0.16), { at: [cx + (alongX ? o : 0), top, cz + (alongX ? 0 : o)], color: SLEEPER });
    }
    for (const r of [-0.3, 0.3]) k.add(box(alongX ? 1.0 : 0.07, 0.09, alongX ? 0.07 : 1.0), { at: [cx + (alongX ? 0 : r), top + 0.06, cz + (alongX ? r : 0)], color: STEEL });
    return;
  }
  for (const s of [-0.34, 0, 0.34]) {
    k.add(box(alongX ? 0.025 : 1.0, 0.012, alongX ? 1.0 : 0.025), { at: [cx + (alongX ? s + 0.16 : 0), top, cz + (alongX ? 0 : s + 0.16)], color: SEAM });
  }
  // edges over the water: a trim board, pilings and a rope rail
  const edges = [[-1, 0, i, cz], [1, 0, i + 1, cz], [0, -1, cx, j], [0, 1, cx, j + 1]];
  for (const [dx, dz, ex, ez] of edges) {
    if (!water(i + dx, j + dz)) continue;
    const alongEdgeX = dz !== 0;
    k.add(box(alongEdgeX ? 1.0 : 0.12, 0.3, alongEdgeX ? 0.12 : 1.0), { at: [ex - dx * 0.06, top - 0.26, ez - dz * 0.06], color: TRIM });
    const wx = x0 + i, wy = y0 + j;
    if (((alongEdgeX ? wx : wy) & 1) === 0) {
      const px = alongEdgeX ? i : ex - dx * 0.1, pz = alongEdgeX ? ez - dz * 0.1 : j;
      k.add(cyl(0.12, 0.14, 3.3, 7), { at: [px, top - 2.8, pz], color: PILE, outline: 0.015 });
      k.add(cyl(0.13, 0.13, 0.06, 7), { at: [px, top + 0.5, pz], color: '#4a3223' });
      const nx = alongEdgeX ? i + 2 : px, nz = alongEdgeX ? pz : j + 2;
      const nextDeck = alongEdgeX ? deck(i + 1, j) && water(i + 1 + dx, j + dz) : deck(i, j + 1) && water(i + dx, j + 1 + dz);
      if (nextDeck) {
        const len = Math.hypot(nx - px, nz - pz);
        k.add(cyl(0.022, 0.022, len, 4), { at: [px, top + 0.36, pz], rot: alongEdgeX ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0], color: ROPE });
      }
    }
  }
}

// ------------------------------------------------------------------ the quays
function quayTile(k, i, j, x0, y0, { water, quay, pier, floor }) {
  const top = DOCK_Y, cx = i + 0.5, cz = j + 0.5;
  const shadeOf = STONE[Math.abs((x0 + i) * 7 + (y0 + j) * 13) % 3];
  // the paving (a hair above the ground under it)
  k.add(box(1.0, 0.24, 1.0), { at: [cx, top - 0.24, cz], color: shadeOf });
  for (const [dx, dz] of EDGES) {
    const ni = i + dx, nj = j + dz;
    if (quay(ni, nj) || pier(ni, nj)) continue;
    const alongEdgeX = dz !== 0;
    const ex = dx > 0 ? i + 1 : dx < 0 ? i : cx, ez = dz > 0 ? j + 1 : dz < 0 ? j : cz;
    const wlen = 1.02;
    // how far the ground (or the sea bed) falls away beyond this edge
    const f = water(ni, nj) ? Math.min(floor(ex + dx * 0.6, ez + dz * 0.6), -0.6) : Math.min(floor(ex + dx * 0.3 + (alongEdgeX ? 0.45 : 0), ez + dz * 0.3 + (alongEdgeX ? 0 : 0.45)), floor(ex + dx * 0.3 - (alongEdgeX ? 0.45 : 0), ez + dz * 0.3 - (alongEdgeX ? 0 : 0.45)));
    // (where the road runs on to the quay it's flush: no kerb)
    if (f > top - 0.3) continue;
    // a coping stone along the edge of the drop
    k.add(box(alongEdgeX ? wlen : 0.34, 0.14, alongEdgeX ? 0.34 : wlen), { at: [ex - dx * 0.12, top - 0.02, ez - dz * 0.12], color: COPING, outline: 0.01 });
    if (f > top - 0.35) continue;
    // a sea wall (or a retaining wall) from below the ground up to the coping
    const h = top - 0.02 - (f - 0.3);
    k.add(box(alongEdgeX ? wlen : 0.3, h, alongEdgeX ? 0.3 : wlen), { at: [ex + dx * 0.02, f - 0.3, ez + dz * 0.02], color: WALLSTONE, outline: 0.012 });
    // weed and wet stone at the waterline
    if (water(ni, nj)) k.add(box(alongEdgeX ? wlen : 0.06, 0.5, alongEdgeX ? 0.06 : wlen), { at: [ex + dx * 0.17, -0.3, ez + dz * 0.17], color: WEED });
  }
}

export { C };
