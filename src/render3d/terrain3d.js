// Streams terrain chunks around the camera: a coloured height mesh per 32x32
// tile chunk (full detail nearby, coarse far away so islands show on the
// horizon), plus wooden decks over the water and vertical wall blocks.
import * as THREE from 'three';
import { T, IS_LIQUID, OVERLAY, PALETTE } from '../world/tiles.js';
import { CHUNK, DECK_Y, WALL_H, HeightField } from './height.js';
import { toonGradient } from './materials.js';

const NEAR_R = 6; // chunks of full detail around the camera
const FAR_R = 15; // coarse chunks out to here (islands on the horizon)
const BUILD_BUDGET_MS = 6; // per frame

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
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    this.deckMat = new THREE.MeshToonMaterial({ color: 0x9a6a3c, gradientMap: toonGradient() });
    this.postMat = new THREE.MeshToonMaterial({ color: 0x5d4030, gradientMap: toonGradient() });
    this.wallMat = new THREE.MeshToonMaterial({ color: 0x8a7f70, gradientMap: toonGradient() });
    this.world = null;
    this.hf = null;
    this.live = new Map(); // key → { mesh: Object3D, lod, x0, y0 }
    this.queue = [];
  }

  setWorld(world) {
    for (const c of this.live.values()) this.disposeChunk(c);
    this.live.clear();
    this.world = world;
    this.hf = new HeightField(world);
    this.cw = Math.ceil(world.width / CHUNK);
    this.ch = Math.ceil(world.height / CHUNK);
    // which chunks contain (or touch) land: everything else is open sea
    const has = new Uint8Array(this.cw * this.ch);
    const W = world.width, H = world.height, d = world.data;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const cy = Math.floor(y / CHUNK) * this.cw;
      for (let x = 0; x < W; x++) {
        if (d[(row + x) << 2] >= 16) has[cy + Math.floor(x / CHUNK)] = 1;
      }
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

  groundAt(x, y) { return this.hf ? this.hf.ground(x, y) : 0; }
  terrainAt(x, y) { return this.hf ? this.hf.terrain(x, y) : 0; }

  /** Stream chunks around (ox, oy) and place them relative to that origin. */
  update(ox, oy) {
    const w = this.world;
    if (!w) return;
    const ccx = Math.floor(w.wx(ox) / CHUNK), ccy = Math.floor(oy / CHUNK);
    const want = new Map();
    for (let j = -FAR_R; j <= FAR_R; j++) {
      const cy = ccy + j;
      if (cy < 0 || cy >= this.ch) continue;
      for (let i = -FAR_R; i <= FAR_R; i++) {
        const d2 = i * i + j * j;
        if (d2 > FAR_R * FAR_R) continue;
        let cx = ccx + i;
        if (w.wrap) cx = ((cx % this.cw) + this.cw) % this.cw;
        else if (cx < 0 || cx >= this.cw) continue;
        const land = this.hasLand[cy * this.cw + cx];
        if (!land) continue;
        const lod = d2 <= NEAR_R * NEAR_R ? 1 : 4;
        if (lod === 4 && land === 1) continue; // far shallows are invisible anyway
        want.set(cy * 100000 + cx, { cx, cy, lod, d2 });
      }
    }
    // drop what is no longer wanted (or wanted at another detail level)
    for (const [k, c] of this.live) {
      const wnt = want.get(k);
      if (!wnt || wnt.lod !== c.lod) {
        if (wnt && c.mesh) {
          // keep showing the old mesh until the new one is built
          c.stale = true;
          continue;
        }
        this.disposeChunk(c);
        this.live.delete(k);
      }
    }
    // build the nearest missing chunks within the frame budget
    const todo = [];
    for (const [k, wnt] of want) {
      const c = this.live.get(k);
      if (!c || c.stale) todo.push([k, wnt]);
    }
    todo.sort((a, b) => a[1].d2 - b[1].d2);
    const t0 = performance.now();
    for (const [k, wnt] of todo) {
      if (performance.now() - t0 > BUILD_BUDGET_MS) break;
      const old = this.live.get(k);
      const c = this.buildChunk(wnt.cx, wnt.cy, wnt.lod);
      if (old) this.disposeChunk(old);
      this.live.set(k, c);
    }
    // place relative to the origin (the world wraps around on X)
    for (const c of this.live.values()) {
      if (!c.mesh) continue;
      const rx = w.wrap ? w.dx(ox, c.x0 + CHUNK / 2) - CHUNK / 2 : c.x0 - ox;
      c.mesh.position.set(rx, 0, c.y0 - oy);
    }
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
    let minH = Infinity;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const gi = i * step, gj = j * step;
        const h = g[gj * N + gi];
        if (h < minH) minH = h;
        const k = (j * n + i) * 3;
        pos[k] = gi; pos[k + 1] = h; pos[k + 2] = gj;
        this.cornerColor(x0 + gi, y0 + gj, h, col, k);
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
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = true;
    const root = new THREE.Group();
    root.add(mesh);
    if (lod === 1) this.addDecksAndWalls(root, x0, y0);
    this.group.add(root);
    return { mesh: root, lod, x0, y0, minH };
  }

  cornerColor(cx, cy, h, out, k) {
    const w = this.world;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let j = -1; j <= 0; j++) {
      for (let i = -1; i <= 0; i++) {
        const t = w.type(cx + i, cy + j);
        if (IS_LIQUID[t] || OVERLAY[t]) continue;
        const v = (w.data[(w.idx(cx + i, cy + j) << 2) + 3] || 0) / 255;
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
    // beaches: blend towards sand right at the waterline
    if (h < 0.9) {
      const s = Math.max(0, Math.min(1, (0.9 - h) / 0.7));
      r = r + (0.91 - r) * s * 0.6; gg = gg + (0.83 - gg) * s * 0.6; b = b + (0.6 - b) * s * 0.6;
    }
    // a little per-vertex variation so grass doesn't look painted flat
    const jit = (hash(cx * 3, cy * 7) - 0.5) * 0.06;
    out[k] = Math.max(0, r + jit); out[k + 1] = Math.max(0, gg + jit); out[k + 2] = Math.max(0, b + jit * 0.5);
  }

  /** Wooden decks over water, and wall blocks, for one full-detail chunk. */
  addDecksAndWalls(root, x0, y0) {
    const w = this.world;
    const decks = [], walls = [], posts = [];
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const t = w.type(x0 + i, y0 + j);
        if (OVERLAY[t]) {
          decks.push(i, j);
          if (((x0 + i) % 3 === 0) && ((y0 + j) % 3 === 0)) posts.push(i, j);
        } else if (t === T.WALL) walls.push(i, j);
      }
    }
    if (decks.length) root.add(boxes(decks, 1, 0.22, 1, DECK_Y - 0.11, this.deckMat));
    if (posts.length) root.add(boxes(posts, 0.22, 3.2, 0.22, DECK_Y - 1.7, this.postMat, 0.15));
    if (walls.length) {
      const m = boxes(walls, 1, WALL_H, 1, 0.4 + WALL_H / 2, this.wallMat);
      m.castShadow = true;
      root.add(m);
    }
  }
}

/** One merged mesh of axis-aligned boxes at tile coordinates (list of i, j pairs). */
function boxes(list, sx, sy, sz, cy, mat, inset = 0) {
  const n = list.length / 2;
  const base = new THREE.BoxGeometry(sx, sy, sz);
  const bp = base.attributes.position.array, bn = base.attributes.normal.array, bi = base.index.array;
  const vc = bp.length / 3;
  const pos = new Float32Array(n * bp.length), nor = new Float32Array(n * bn.length);
  const idx = new Uint32Array(n * bi.length);
  for (let k = 0; k < n; k++) {
    const ox = list[k * 2] + 0.5 + inset, oz = list[k * 2 + 1] + 0.5 + inset;
    for (let v = 0; v < vc; v++) {
      pos[(k * vc + v) * 3] = bp[v * 3] + ox;
      pos[(k * vc + v) * 3 + 1] = bp[v * 3 + 1] + cy;
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
