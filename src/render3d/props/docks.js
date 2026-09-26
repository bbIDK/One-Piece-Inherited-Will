// Detail for the terrain's deck and wall tiles, one merged mesh per terrain
// chunk (called by terrain3d for full-detail chunks):
//   * docks and bridges: plank seams across the deck, a trim board and
//     pilings with a rope rail along the edges over the water, bollards
//     at the pier heads;
//   * sea-train rails: sleepers and two steel rails;
//   * town and fortress walls: a coping band and crenellations.
// Coordinates are chunk-local tiles, like terrain3d's deck boxes (tile i, j
// spans x ∈ [i, i + 1], z ∈ [j, j + 1]).
import * as THREE from 'three';
import { Mesher, box, cyl, C } from './kit.js';
import { vcMat } from './mats.js';
import { T, IS_LIQUID, OVERLAY } from '../../world/tiles.js';
import { DECK_Y, WALL_H, CHUNK } from '../height.js';

const PLANK = '#9a6a3c', SEAM = '#5d4030', TRIM = '#6d4c33', PILE = '#5a3e2b', ROPE = '#c8b89a';
const STEEL = '#8a9499', SLEEPER = '#5d4a3a';

/** A Mesh with the detail for chunk (x0, y0), or null when it has no decks or walls. */
export function dockDetails(world, x0, y0, size = CHUNK) {
  const k = new Mesher();
  const type = (i, j) => world.type(x0 + i, y0 + j);
  const water = (i, j) => { const t = type(i, j); return IS_LIQUID[t] && !OVERLAY[t]; };
  const deck = (i, j) => OVERLAY[type(i, j)] === 1;
  const wall = (i, j) => type(i, j) === T.WALL;
  let any = false;
  const top = DECK_Y;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const t = type(i, j);
      if (OVERLAY[t]) {
        any = true;
        const cx = i + 0.5, cz = j + 0.5;
        // which way does the deck run? (seams go across it)
        const alongX = (deck(i - 1, j) ? 1 : 0) + (deck(i + 1, j) ? 1 : 0) >= (deck(i, j - 1) ? 1 : 0) + (deck(i, j + 1) ? 1 : 0);
        if (t === T.RAIL) {
          // sea-train track: sleepers across, two rails along
          for (let s = 0; s < 2; s++) {
            const o = -0.25 + s * 0.5;
            k.add(box(alongX ? 0.16 : 1.1, 0.06, alongX ? 1.1 : 0.16), { at: [cx + (alongX ? o : 0), top, cz + (alongX ? 0 : o)], color: SLEEPER });
          }
          for (const r of [-0.3, 0.3]) k.add(box(alongX ? 1.0 : 0.07, 0.09, alongX ? 0.07 : 1.0), { at: [cx + (alongX ? 0 : r), top + 0.06, cz + (alongX ? r : 0)], color: STEEL });
          continue;
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
          // a piling at every other tile corner along the edge
          if (((alongEdgeX ? wx : wy) & 1) === 0) {
            const px = alongEdgeX ? i : ex - dx * 0.1, pz = alongEdgeX ? ez - dz * 0.1 : j;
            k.add(cyl(0.12, 0.14, 3.3, 7), { at: [px, top - 2.8, pz], color: PILE, outline: 0.015 });
            k.add(cyl(0.13, 0.13, 0.06, 7), { at: [px, top + 0.5, pz], color: '#4a3223' });
            // rope to the next piling along the edge (two tiles on)
            const nx = alongEdgeX ? i + 2 : px, nz = alongEdgeX ? pz : j + 2;
            const nextDeck = alongEdgeX ? deck(i + 1, j) && water(i + 1 + dx, j + dz) : deck(i, j + 1) && water(i + dx, j + 1 + dz);
            if (nextDeck) {
              const len = Math.hypot(nx - px, nz - pz);
              k.add(cyl(0.022, 0.022, len, 4), { at: [px, top + 0.36, pz], rot: alongEdgeX ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0], color: ROPE });
            }
          }
        }
        // a pier head (deck with water on three sides) gets a bollard
        const open = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dx, dz]) => water(i + dx, j + dz)).length;
        if (open >= 3) {
          k.add(cyl(0.15, 0.17, 0.45, 8), { at: [cx, top, cz], color: '#3e2723', outline: 0.015 });
          k.add(cyl(0.2, 0.2, 0.07, 8), { at: [cx, top + 0.45, cz], color: '#2e1f18' });
        }
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

export { C };
