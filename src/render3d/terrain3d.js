// Streams terrain chunks around the camera: a coloured height mesh per 32x32
// tile chunk (full detail nearby, coarse far away so islands show on the
// horizon) out to the render distance, plus wooden decks over the water and
// vertical wall blocks.
import * as THREE from 'three';
import { T, IS_LIQUID, OVERLAY, PALETTE } from '../world/tiles.js';
import { CHUNK, DECK_Y, DOCK_Y, WALL_H, HeightField } from './height.js';
import { toonGradient } from './materials.js';
import { FOG } from './fog.js';
import { dockDetails } from './props/docks.js';
import { vcMat } from './props/mats.js';

const NEAR_R = 6; // chunks of full detail around the camera
const BUILD_BUDGET_MS = 4; // per frame
const COARSE = 4; // far chunks' detail: one corner in four each way

// tile colours as linear-ish floats
const COL = new Float32Array(256 * 3);
const ACC = new Float32Array(256 * 3);
{
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  for (let t = 0; t < 256; t++) {
    const p = PALETTE[t] || ['#8a8a8a', '#9a9a9a'];
    const a = hex(p[0]), b = hex(p[1]);
    COL.set(a, t * 3);
    ACC.set(b, t * 3);
  }
}
const SEABED = [0.55, 0.6, 0.52];
const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class TerrainManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.material = terrainMaterial();
    this.uOrigin = this.material.userData.uOrigin;
    this.deckMat = new THREE.MeshToonMaterial({ color: 0x9a6a3c, gradientMap: toonGradient() });
    this.postMat = new THREE.MeshToonMaterial({ color: 0x5d4030, gradientMap: toonGradient() });
    this.wallMat = new THREE.MeshToonMaterial({ color: 0x8a7f70, gradientMap: toonGradient() });
    this.world = null;
    this.hf = null;
    this.live = new Map(); // key → { mesh: Object3D, lod, x0, y0 }
    this.queue = [];
    this.nearR = NEAR_R;
    this.reachFoot = 12; this.reachSea = 18; // (the render distance: see setReach)
    this.sailing = false;
    this.farR = this.reachFoot;
    this.floorR = 0;
    this.budget = BUILD_BUDGET_MS; // (screenshot scenarios raise it to have the land at once)
  }

  /** Fast graphics draws less terrain detail nearby. */
  setDetail(q) {
    this.quality = q;
    this.nearR = q === 'low' ? 4 : NEAR_R;
  }

  /** How far (in chunks) the land is drawn on foot and at sea: the render distance. */
  setReach(foot, sea) {
    this.reachFoot = foot;
    this.reachSea = sea;
    this.farR = this.reach(this.sailing);
  }

  reach(sailing) { return sailing ? this.reachSea : this.reachFoot; }

  /** Draw the open-sea floor this many chunks around (0: none — nobody's in the water). */
  setSeaFloor(r) { this.floorR = r; }

  setSailing(on) {
    this.sailing = !!on;
    this.farR = this.reach(this.sailing);
  }

  /**
   * Distance (m) out to which every direction has terrain, from anywhere in
   * the camera's chunk (see wanted): where the fog must close in.
   */
  get extent() { return this.farR * CHUNK; }

  setWorld(world) {
    for (const c of this.live.values()) this.disposeChunk(c);
    this.live.clear();
    this.wantAt = null;
    this.want = null;
    this.world = world;
    this.hf = new HeightField(world);
    this.cw = Math.ceil(world.width / CHUNK);
    this.ch = Math.ceil(world.height / CHUNK);
    // which chunks contain (or touch) land: everything else is open sea
    // (a terrain chunk is one of the world's tile blocks)
    const has = new Uint8Array(this.cw * this.ch);
    for (let cy = 0; cy < this.ch; cy++) {
      for (let cx = 0; cx < this.cw; cx++) if (world.blockHasLand(cx, cy)) has[cy * this.cw + cx] = 1;
    }
    // shallow sea floor around land is visible too
    this.hasLand = new Uint8Array(has.length);
    for (let cy = 0; cy < this.ch; cy++) {
      for (let cx = 0; cx < this.cw; cx++) {
        let v = 0;
        for (let j = -1; j <= 1 && !v; j++) for (let i = -1; i <= 1 && !v; i++) {
          let x = cx + i; const y = cy + j;
          if (y < 0 || y >= this.ch) continue;
          if (world.wrap) x = (x + this.cw) % this.cw; else if (x < 0 || x >= this.cw) continue;
          if (has[y * this.cw + x]) v = has[cy * this.cw + cx] ? 2 : 1;
        }
        this.hasLand[cy * this.cw + cx] = v;
      }
    }
  }

  /** Is the land at (x, y) on screen, or none wanted there (nothing to wait for)? */
  landDrawn(x, y) {
    const w = this.world;
    if (!w || !this.want) return false;
    const k = Math.floor(y / CHUNK) * 100000 + Math.floor(w.wx(x) / CHUNK);
    return !this.want.has(k) || this.live.has(k);
  }

  groundAt(x, y) { return this.hf ? this.hf.ground(x, y) : 0; }
  /** Where a small prop of foot radius r stands (see HeightField.rest). */
  restAt(x, y, r) { return this.hf ? this.hf.rest(x, y, r) : 0; }
  terrainAt(x, y) { return this.hf ? this.hf.terrain(x, y) : 0; }

  /** Stream chunks around (ox, oy) and place them relative to that origin. */
  update(ox, oy) {
    // the detail textures are anchored to the world, not to the moving origin
    if (this.uOrigin) this.uOrigin.value.set(this.world ? this.world.wx(ox) : ox, oy);
    const w = this.world;
    if (!w) return;
    const ccx = Math.floor(w.wx(ox) / CHUNK), ccy = Math.floor(oy / CHUNK);
    // what's wanted only changes when the camera crosses into another chunk
    // (or the reach changes): the rest of the time there's nothing to decide
    const at = this.wantAt;
    if (!at || at[0] !== ccx || at[1] !== ccy || at[2] !== this.nearR || at[3] !== this.farR || at[4] !== this.floorR) {
      this.wantAt = [ccx, ccy, this.nearR, this.farR, this.floorR];
      this.want = this.wanted(ccx, ccy);
      this.dropUnwanted();
      this.missing = true;
    }
    if (this.missing) this.buildMissing();
    // place relative to the origin (the world wraps around on X)
    for (const c of this.live.values()) {
      if (!c.mesh) continue;
      const rx = w.wrap ? w.dx(ox, c.x0 + CHUNK / 2) - CHUNK / 2 : c.x0 - ox;
      c.mesh.position.set(rx, 0, c.y0 - oy);
    }
  }

  /**
   * The chunks to show around chunk (ccx, ccy), with their detail level:
   * every chunk with any part within farR chunks of any part of the camera's
   * own, so the land reaches the render distance in every direction wherever
   * in its chunk the camera stands.
   */
  wanted(ccx, ccy) {
    const w = this.world;
    const want = new Map();
    const NR = this.nearR, FR = this.farR;
    for (let j = -FR - 1; j <= FR + 1; j++) {
      const cy = ccy + j;
      if (cy < 0 || cy >= this.ch) continue;
      const gy = Math.max(0, Math.abs(j) - 1);
      for (let i = -FR - 1; i <= FR + 1; i++) {
        const gx = Math.max(0, Math.abs(i) - 1);
        if (gx * gx + gy * gy > FR * FR) continue;
        const d2 = i * i + j * j;
        let cx = ccx + i;
        if (w.wrap) cx = ((cx % this.cw) + this.cw) % this.cw;
        else if (cx < 0 || cx >= this.cw) continue;
        const land = this.hasLand[cy * this.cw + cx];
        if (!land) {
          // open sea: just its floor, and only while someone is down in the water
          if (d2 <= this.floorR * this.floorR) want.set(cy * 100000 + cx, { cx, cy, lod: 1, d2 });
          continue;
        }
        const lod = d2 <= NR * NR ? 1 : COARSE;
        if (lod === COARSE && land === 1) continue; // far shallows are invisible anyway
        want.set(cy * 100000 + cx, { cx, cy, lod, d2 });
      }
    }
    return want;
  }

  /** Drop what is no longer wanted (or wanted at another detail level). */
  dropUnwanted() {
    for (const [k, c] of this.live) {
      const wnt = this.want.get(k);
      if (!wnt || wnt.lod !== c.lod) {
        if (wnt && c.mesh) {
          // keep showing the old mesh until the new one is built
          c.stale = true;
          continue;
        }
        this.disposeChunk(c);
        this.live.delete(k);
      } else c.stale = false; // (a coarse stand-in that is now all that's wanted)
    }
  }

  /**
   * Build the nearest missing chunks within the frame budget. Holes come
   * first, and a hole beyond the ground at your feet is first filled with a
   * quick coarse mesh (a sixteenth of the work), so after a jump across the
   * world the whole island is there within a few frames (never houses
   * standing on the sea) and the detail follows, nearest first.
   */
  buildMissing() {
    const todo = [];
    for (const [k, wnt] of this.want) {
      const c = this.live.get(k);
      if (!c) todo.push([k, wnt, 0]);
      else if (c.stale) todo.push([k, wnt, 1]);
    }
    todo.sort((a, b) => a[2] - b[2] || a[1].d2 - b[1].d2);
    const t0 = performance.now();
    let n = 0;
    for (const [k, wnt, stage] of todo) {
      if (performance.now() - t0 > this.budget) break;
      const old = this.live.get(k);
      const lod = stage === 0 && wnt.lod < COARSE && wnt.d2 > 2 ? COARSE : wnt.lod;
      const c = this.buildChunk(wnt.cx, wnt.cy, lod);
      if (lod !== wnt.lod) c.stale = true; // (the detailed mesh replaces it in its turn)
      if (old) this.disposeChunk(old);
      this.live.set(k, c);
      n++;
    }
    this.missing = n < todo.length;
  }

  disposeChunk(c) {
    if (!c.mesh) return;
    this.group.remove(c.mesh);
    c.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  buildChunk(cx, cy, lod) {
    const w = this.world;
    const g = this.hf.grid(cx, cy);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const N = CHUNK + 1;
    const step = lod;
    const n = CHUNK / step + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const pave = new Float32Array(n * n * 3); // how much of the ground round each corner is flagstones / cobbles / marble
    let minH = Infinity;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const gi = i * step, gj = j * step;
        const h = g[gj * N + gi];
        if (h < minH) minH = h;
        const k = (j * n + i) * 3;
        pos[k] = gi; pos[k + 1] = h; pos[k + 2] = gj;
        this.cornerColor(x0 + gi, y0 + gj, h, col, k, pave);
      }
    }
    const idx = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, d, b, a, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('pave', new THREE.BufferAttribute(pave, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = true;
    const root = new THREE.Group();
    root.add(mesh);
    this.addDecksAndWalls(root, x0, y0, lod === 1);
    this.group.add(root);
    return { mesh: root, lod, x0, y0, minH };
  }

  cornerColor(cx, cy, h, out, k, pave = null) {
    const w = this.world;
    let r = 0, gg = 0, b = 0, n = 0, pf = 0, pc = 0, pm = 0;
    for (let j = -1; j <= 0; j++) {
      for (let i = -1; i <= 0; i++) {
        const t = w.type(cx + i, cy + j);
        if (IS_LIQUID[t] || OVERLAY[t]) continue;
        if (t === T.STONE) pf++; else if (t === T.COBBLE) pc++; else if (t === T.MARBLE) pm++;
        const v = w.variant(cx + i, cy + j) / 255;
        const mix = 0.18 + v * 0.3 * hash(cx + i, cy + j);
        r += COL[t * 3] * (1 - mix) + ACC[t * 3] * mix;
        gg += COL[t * 3 + 1] * (1 - mix) + ACC[t * 3 + 1] * mix;
        b += COL[t * 3 + 2] * (1 - mix) + ACC[t * 3 + 2] * mix;
        n++;
      }
    }
    if (!n) {
      // sea floor: sandy near the shore, darker in the deep
      const deep = Math.min(1, Math.max(0, -h / 8));
      out[k] = SEABED[0] * (1 - deep * 0.55); out[k + 1] = SEABED[1] * (1 - deep * 0.45); out[k + 2] = SEABED[2] * (1 - deep * 0.35);
      return;
    }
    r /= n; gg /= n; b /= n;
    if (pave) { pave[k] = pf / n; pave[k + 1] = pc / n; pave[k + 2] = pm / n; }
    // beaches: blend towards sand right at the waterline
    if (h < 0.9) {
      const s = Math.max(0, Math.min(1, (0.9 - h) / 0.7));
      r = r + (0.91 - r) * s * 0.6; gg = gg + (0.83 - gg) * s * 0.6; b = b + (0.6 - b) * s * 0.6;
    }
    // a little per-vertex variation so grass doesn't look painted flat
    const jit = (hash(cx * 3, cy * 7) - 0.5) * 0.06;
    out[k] = Math.max(0, r + jit); out[k + 1] = Math.max(0, gg + jit); out[k + 2] = Math.max(0, b + jit * 0.5);
  }

  /**
   * Wooden decks over water, and wall blocks, for one chunk: with all their
   * detail (full), or as plain blocks in one mesh for a far chunk.
   */
  addDecksAndWalls(root, x0, y0, full = true) {
    const w = this.world;
    const decks = [], piers = [], walls = [], posts = [], piles = [], quayed = [];
    let quays = 0;
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const t = w.type(x0 + i, y0 + j);
        const third = ((x0 + i) % 3 === 0) && ((y0 + j) % 3 === 0);
        if (OVERLAY[t]) {
          // harbour piers stand tall on their own pilings (see props/docks.js); bridges on short posts
          if (w.docks.size && w.isDock(x0 + i, y0 + j)) { piers.push(i, j); if (third && !w.dockAt(x0 + i, y0 + j)?.deck) piles.push(i, j); continue; }
          decks.push(i, j);
          if (third) posts.push(i, j);
        } else if (t === T.WALL) walls.push(i, j);
        else if (w.quays.size && w.isQuay(x0 + i, y0 + j)) { quays++; quayed.push(i, j); }
      }
    }
    // (each wall block stands on the ground beside it: see HeightField.wallSpan)
    const spans = walls.length ? new Float32Array(walls.length) : null;
    for (let q = 0; q < walls.length; q += 2) { const s = this.hf.wallSpan(x0 + walls[q], y0 + walls[q + 1]); spans[q] = s[0]; spans[q + 1] = s[1]; }
    // a bridge's deck is as high as the land it joins (see HeightField.span):
    // its posts reach down to the water's bed from under it
    const hf = this.hf;
    const bridge = (q, list) => w.type(x0 + list[q], y0 + list[q + 1]) === T.BRIDGE;
    const deckSpans = decks.length ? new Float32Array(decks.length) : null;
    for (let q = 0; q < decks.length; q += 2) {
      const top = bridge(q, decks) ? hf.deckTile(x0 + decks[q], y0 + decks[q + 1]) : DECK_Y;
      deckSpans[q] = top - 0.22; deckSpans[q + 1] = top;
    }
    const postSpans = posts.length ? new Float32Array(posts.length) : null;
    for (let q = 0; q < posts.length; q += 2) {
      if (!bridge(q, posts)) { postSpans[q] = DECK_Y - 3.3; postSpans[q + 1] = DECK_Y - 0.1; continue; }
      const x = x0 + posts[q] + 0.65, y = y0 + posts[q + 1] + 0.65;
      postSpans[q] = Math.min(hf.terrain(x, y), DECK_Y - 1) - 0.4; postSpans[q + 1] = hf.deckAt(x, y) - 0.2;
    }
    if (!full) {
      const m = farBoxes([
        [decks, 1, 0.22, 1, DECK_Y - 0.11, 0x9a6a3c, 0, deckSpans], [piers, 1, 0.26, 1, DOCK_Y - 0.13, 0x9a6a3c],
        [posts, 0.22, 3.2, 0.22, DECK_Y - 1.7, 0x5d4030, 0.15, postSpans], [piles, 0.3, DOCK_Y + 2.74, 0.3, (DOCK_Y - 3.26) / 2, 0x5d4030],
        [quayed, 1, DOCK_Y + 1.5, 1, (DOCK_Y - 1.5) / 2, 0xa39c90], [walls, 1, WALL_H, 1, 0.4 + WALL_H / 2, 0x8a7f70, 0, spans],
      ]);
      if (m) root.add(m);
      return;
    }
    if (decks.length) root.add(deckBoxes(decks, x0, y0, (i, j) => w.type(i, j) === T.BRIDGE, (cx, cy) => hf.deckCorner(cx, cy), this.deckMat));
    if (piers.length) root.add(boxes(piers, 1, 0.26, 1, DOCK_Y - 0.13, this.deckMat));
    if (posts.length) root.add(boxes(posts, 0.22, 3.2, 0.22, DECK_Y - 1.7, this.postMat, 0.15, postSpans));
    if (walls.length) {
      const m = boxes(walls, 1, WALL_H, 1, 0.4 + WALL_H / 2, this.wallMat, 0, spans);
      m.castShadow = true;
      root.add(m);
    }
    // planks, pilings, rope rails, rails on sleepers, crenellations
    if (decks.length || piers.length || walls.length || quays) {
      try { const det = dockDetails(w, x0, y0, CHUNK, this.hf); if (det) root.add(det); } catch (e) { console.warn('dock details failed', e); }
    }
  }
}

/**
 * A small tileable value-noise texture (two octaves in R and G), used to break
 * up the flat tile colours: R varies over tens of metres, G is fine grain.
 */
function detailTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const lattice = (n, seed) => {
    const g = new Float32Array(n * n);
    let h = seed;
    for (let i = 0; i < g.length; i++) { h = (h * 1103515245 + 12345) & 0x7fffffff; g[i] = (h % 1000) / 1000; }
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
      const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const big = lattice(8, 7), mid = lattice(16, 31), fine = lattice(64, 97), finer = lattice(128, 151);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const r = big(u * 8, v * 8) * 0.65 + mid(u * 16, v * 16) * 0.35;
      const g = fine(u * 64, v * 64) * 0.6 + finer(u * 128, v * 128) * 0.4;
      const o = (y * N + x) * 4;
      data[o] = r * 255; data[o + 1] = g * 255; data[o + 2] = 0; data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// the caustic network on the sea floor (edges between drifting Voronoi cells)
export const CTIME = { value: 0 };
export const CAUSTIC = /* glsl */`
  vec2 cHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float causticNet(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.42 * sin(t * 0.8 + 6.2831 * cHash2(i + g));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return 1.0 - smoothstep(0.0, 0.09, d2 - d1);
  }
`;

/**
 * The terrain's cel-shaded material, with world-anchored detail: broad colour
 * drift, fine grain, and bare rock showing on steep slopes.
 */
// Town paving, drawn on the ground rather than painted flat: flagstones in
// offset rows (STONE), small rounded cobbles (COBBLE), big polished squares
// (MARBLE), each stone its own shade, with dark joints that moss and grass
// grow in here and there. It fades out with distance (a pattern finer than a
// pixel would only shimmer), leaving the plain colour.
const PAVING = /* glsl */`
  float paveHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
  // one course of stones w x h metres, every other row shifted half a stone:
  // .x the stone's shade (0..1), .y distance (m) to its edge
  vec2 paveCourse(vec2 p, vec2 size, float round) {
    float row = floor(p.y / size.y);
    vec2 q = vec2(p.x / size.x + fract(row * 0.5) * 1.0, p.y / size.y);
    vec2 cell = floor(q), f = fract(q);
    vec2 d = min(f, 1.0 - f) * size; // metres to the nearest edges
    float e = min(d.x, d.y);
    // rounded corners (cobbles)
    vec2 c = max(round - d, 0.0);
    e = min(e, round - length(c));
    return vec2(paveHash(cell + row * 7.13), e);
  }
  vec3 paving(vec3 base, vec2 p, vec3 kind, float broad, float grain) {
    float fw = fwidth(p.x) + fwidth(p.y);
    float fade = 1.0 - smoothstep(0.05, 0.22, fw);
    if (fade <= 0.0) return base;
    float tot = kind.x + kind.y + kind.z;
    vec2 flag = paveCourse(p, vec2(1.15, 0.72), 0.05);
    vec2 cob = paveCourse(p + vec2(0.13, 0.0), vec2(0.34, 0.27), 0.1);
    vec2 mar = paveCourse(p, vec2(1.6, 1.6), 0.0);
    vec2 s = (flag * kind.x + cob * kind.y + mar * kind.z) / max(tot, 0.001);
    float polish = kind.z / max(tot, 0.001); // (marble is kept: no weeds in it)
    // damp, little-trodden patches: the joints open up and grass takes them,
    // and here and there a stone is gone and a tuft of grass fills the hole
    float wild = smoothstep(0.5, 0.75, broad + (grain - 0.5) * 0.35) * (1.0 - polish * 0.85);
    float gap = mix(0.035, 0.018, polish) * (1.0 + wild * 1.6);
    float joint = 1.0 - smoothstep(gap * 0.4, gap + fw * 0.5, s.y);
    // each stone a little lighter or darker (marble barely), a hint of wear in the middle
    float shade = 0.9 + (s.x - 0.5) * mix(0.22, 0.08, polish) + smoothstep(0.02, 0.2, s.y) * 0.05;
    vec3 stone = base * shade;
    vec3 grass = vec3(0.3, 0.45, 0.19) * (0.85 + grain * 0.3);
    float gone = step(s.x, 0.16 * wild) * smoothstep(0.0, 0.06, s.y);
    stone = mix(stone, grass, gone);
    // the joints: dark, and green with moss and grass where the ground is damp
    vec3 grout = mix(base * 0.55, grass, min(1.0, wild * 1.3) * 0.9);
    vec3 paved = mix(stone, grout, joint);
    return mix(base, paved, fade * min(1.0, tot * 1.2));
  }
`;

function terrainMaterial() {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const uOrigin = { value: new THREE.Vector2() };
  const uDetail = { value: detailTexture() };
  m.userData.uOrigin = uOrigin;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FOG, { uOrigin, uDetail, uCTime: CTIME });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uOrigin;\nattribute vec3 pave;\nvarying vec3 vPave;\nvarying vec2 vTerrainXZ;\nvarying float vTerrainUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 tWorld = modelMatrix * vec4(transformed, 1.0);\nvTerrainXZ = tWorld.xz + uOrigin;\nvTerrainUp = normalize(objectNormal).y;\nvTerrainY = tWorld.y;\nvPave = pave;')
      .replace('varying float vTerrainUp;', 'varying float vTerrainUp;\nvarying float vTerrainY;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform float uCTime;\nvarying vec3 vPave;\nvarying vec2 vTerrainXZ;\nvarying float vTerrainUp;\nvarying float vTerrainY;\n' + CAUSTIC + PAVING)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float broad = texture2D(uDetail, vTerrainXZ / 64.0).r;
          float grain = texture2D(uDetail, vTerrainXZ / 6.0).g;
          diffuseColor.rgb *= 0.86 + broad * 0.2 + (grain - 0.5) * 0.12;
          if (vPave.x + vPave.y + vPave.z > 0.01) diffuseColor.rgb = paving(diffuseColor.rgb, vTerrainXZ, vPave, broad, grain);
          // steep ground shows bare rock (not on beaches and water edges, which are flat)
          float steep = smoothstep(0.62, 0.42, vTerrainUp);
          vec3 rock = vec3(0.47, 0.43, 0.39) * (0.85 + grain * 0.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, rock * (0.7 + 0.3 * diffuseColor.rgb / max(max(diffuseColor.r, diffuseColor.g), 0.2)), steep * 0.75);
          // under the sea: bluer with depth, and sunlight rippling across the bottom
          if (vTerrainY < -0.15) {
            float dd = -vTerrainY;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.8, 0.95), clamp(0.2 + dd / 12.0, 0.0, 0.85));
            float c = causticNet(vTerrainXZ * 0.9 + vec2(uCTime * 0.05, uCTime * 0.03), uCTime * 1.2) * 0.7 + causticNet(vTerrainXZ * 1.45 - vec2(uCTime * 0.03, -uCTime * 0.05) + 3.1, uCTime * 1.6) * 0.45;
            diffuseColor.rgb += vec3(0.5, 0.85, 0.8) * c * 0.16 * exp(-dd * 0.08) * smoothstep(0.1, 0.8, vTerrainUp);
          }
        }`);
  };
  m.customProgramCacheKey = () => 'terrain-detail-paved-2';
  return m;
}

/** One merged mesh of axis-aligned boxes at tile coordinates (list of i, j pairs). */
function boxes(list, sx, sy, sz, cy, mat, inset = 0, spans = null) {
  const n = list.length / 2;
  const base = new THREE.BoxGeometry(sx, sy, sz);
  const bp = base.attributes.position.array, bn = base.attributes.normal.array, bi = base.index.array;
  const vc = bp.length / 3;
  const pos = new Float32Array(n * bp.length), nor = new Float32Array(n * bn.length);
  const idx = new Uint32Array(n * bi.length);
  for (let k = 0; k < n; k++) {
    const ox = list[k * 2] + 0.5 + inset, oz = list[k * 2 + 1] + 0.5 + inset;
    // (spans: each box's own [bottom, top] instead of cy ± sy/2)
    const ky = spans ? (spans[k * 2 + 1] - spans[k * 2]) / sy : 1, kc = spans ? (spans[k * 2] + spans[k * 2 + 1]) / 2 : cy;
    for (let v = 0; v < vc; v++) {
      pos[(k * vc + v) * 3] = bp[v * 3] + ox;
      pos[(k * vc + v) * 3 + 1] = bp[v * 3 + 1] * ky + kc;
      pos[(k * vc + v) * 3 + 2] = bp[v * 3 + 2] + oz;
      nor[(k * vc + v) * 3] = bn[v * 3]; nor[(k * vc + v) * 3 + 1] = bn[v * 3 + 1]; nor[(k * vc + v) * 3 + 2] = bn[v * 3 + 2];
    }
    for (let q = 0; q < bi.length; q++) idx[k * bi.length + q] = bi[q] + k * vc;
  }
  base.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/**
 * Deck tiles (list: chunk-local [i, j] pairs), 0.22 m thick: a bridge's
 * (isBridge(world tile x, y)) with its top at the deck's height at each
 * corner (corner(x, y) → m), so it runs smoothly up or down from one bank to
 * the other; any other (a sea-train's track, a boardwalk) level at DECK_Y.
 */
function deckBoxes(list, x0, y0, isBridge, corner, mat) {
  const n = list.length / 2;
  const base = new THREE.BoxGeometry(1, 0.22, 1);
  const bp = base.attributes.position.array, bi = base.index.array;
  const vc = bp.length / 3;
  const pos = new Float32Array(n * bp.length);
  const idx = new Uint32Array(n * bi.length);
  const ch = new Float32Array(4);
  for (let k = 0; k < n; k++) {
    const i = list[k * 2], j = list[k * 2 + 1];
    const wi = x0 + i, wj = y0 + j;
    // (the corners: [x0z0, x1z0, x0z1, x1z1])
    if (isBridge(wi, wj)) for (let c = 0; c < 4; c++) ch[c] = corner(wi + (c & 1), wj + (c >> 1));
    else ch.fill(DECK_Y);
    for (let v = 0; v < vc; v++) {
      const sx = bp[v * 3] > 0 ? 1 : 0, sz = bp[v * 3 + 2] > 0 ? 1 : 0;
      pos[(k * vc + v) * 3] = bp[v * 3] + i + 0.5;
      pos[(k * vc + v) * 3 + 1] = ch[sx + sz * 2] + (bp[v * 3 + 1] > 0 ? 0 : -0.22);
      pos[(k * vc + v) * 3 + 2] = bp[v * 3 + 2] + j + 0.5;
    }
    for (let q = 0; q < bi.length; q++) idx[k * bi.length + q] = bi[q] + k * vc;
  }
  base.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/**
 * The decks, piers, posts, quays and walls of a far chunk as plain blocks in
 * ONE vertex-coloured mesh (their planks, pilings and crenellations would be
 * a pixel at that distance). groups: [[list, sx, sy, sz, cy, colour, inset, spans]]
 * (spans: each block's own [bottom, top], see boxes).
 */
function farBoxes(groups) {
  let n = 0;
  for (const g of groups) n += g[0].length / 2;
  if (!n) return null;
  const base = new THREE.BoxGeometry(1, 1, 1);
  const bp = base.attributes.position.array, bn = base.attributes.normal.array, bi = base.index.array;
  const vc = bp.length / 3;
  const pos = new Float32Array(n * vc * 3), nor = new Float32Array(n * vc * 3), col = new Float32Array(n * vc * 3);
  const idx = new Uint32Array(n * bi.length);
  const c = new THREE.Color();
  let k = 0;
  for (const [list, sx, sy, sz, cy, color, inset = 0, spans = null] of groups) {
    c.set(color);
    for (let q = 0; q < list.length; q += 2, k++) {
      const ox = list[q] + 0.5 + inset, oz = list[q + 1] + 0.5 + inset;
      const ky = spans ? spans[q + 1] - spans[q] : sy, kc = spans ? (spans[q] + spans[q + 1]) / 2 : cy;
      for (let v = 0; v < vc; v++) {
        const o = (k * vc + v) * 3;
        pos[o] = bp[v * 3] * sx + ox; pos[o + 1] = bp[v * 3 + 1] * ky + kc; pos[o + 2] = bp[v * 3 + 2] * sz + oz;
        nor[o] = bn[v * 3]; nor[o + 1] = bn[v * 3 + 1]; nor[o + 2] = bn[v * 3 + 2];
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      }
      for (let q2 = 0; q2 < bi.length; q2++) idx[k * bi.length + q2] = bi[q2] + k * vc;
    }
  }
  base.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * vc), 1));
  geo.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n * vc * 4), 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, vcMat());
  m.receiveShadow = true;
  return m;
}
