// Ground cover: grass tufts, wild flowers, ferns, pebbles, shells and shore
// rocks, scattered procedurally around the camera from the tile map (nothing
// is stored in the world), drawn as instanced meshes. Grass, flowers and ferns
// sway in the wind. Density thins with distance and the fog hides the edge.
//
// Cheap to draw: close by (within NEAR of the cover's centre) each kind has
// its full model; beyond, a simpler one (a few flat blades, a flat flower
// head) split into eight wedges around the centre, each with its own bounds,
// so the wedges behind the camera aren't drawn at all.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { T, IS_LIQUID, OVERLAY, CLIMATE } from '../world/tiles.js';
import { toonGradient } from './materials.js';
import { FOG } from './fog.js';
import { prof } from '../core/prof.js';
import { WedgeSet } from './wedges.js';

const CELL = 16; // tiles per cached cell
const NEAR = 22; // m from the cover's centre: full models inside, simple ones beyond
const KINDS = ['grass', 'flower', 'fern', 'pebble', 'shell', 'rock'];
// how far out each kind grows (share of the cover radius)
const REACH = { grass: 1, flower: 0.72, fern: 0.85, pebble: 0.45, shell: 0.45, rock: 1 };
// instances: near, and beyond (in all the wedges together)
const MAXN = { grass: 5200, flower: 1400, fern: 1100, pebble: 1600, shell: 500, rock: 400 };
const MAXF = { grass: 16000, flower: 2600, fern: 2000, pebble: 1400, shell: 400, rock: 1200 };
const PAD = { grass: 0.7, flower: 0.6, fern: 1.2, pebble: 0.3, shell: 0.2, rock: 2 }; // model size (for bounds)
const WEDGES = { grass: 8, flower: 4, fern: 4, pebble: 1, shell: 1, rock: 4 }; // (see wedges.js)
const SWAY = { grass: 1, flower: 0.7, fern: 0.45 };
const THIN = { grass: 1, flower: 1, fern: 1 }; // thinned out with distance
const FILL_BUDGET_MS = 2.5; // building new cells, per frame

// tiles that never get cover (paved, built, walls, floors)
const PAVED = new Uint8Array(64);
for (const t of [T.STONE, T.COBBLE, T.PLANK, T.MARBLE, T.WALL, T.RAIL, T.BRIDGE, T.CARPET, T.TATAMI, T.STEEL, T.GOLD, T.CAKE, T.ISLAND_CLOUD, T.ICE, T.PACK_ICE, T.RED_ROCK, T.MASONRY, T.CANOPY]) PAVED[t] = 1;

function hash(x, y, k) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(k | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- geometry
function colored(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/**
 * A tuft of blades (lit like the ground they grow from, see coverMaterial).
 * Near: seven curved blades, each a narrow kite (root, bend, tip). Far: four
 * straight flat blades.
 */
function grassGeo(far = false) {
  const pos = [], shade = [];
  const n = far ? 4 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 0.7;
    const r = 0.02 + (i % 3) * 0.03;
    const ca = Math.cos(a), sa = Math.sin(a);
    const bx = ca * r, bz = sa * r;
    const h = 0.26 + ((i * 37) % 5) * 0.045;
    const lean = 0.1 + (i % 2) * 0.07;
    const w = far ? 0.06 : 0.05;
    const px = -sa * w, pz = ca * w;
    const tx = bx + ca * lean, tz = bz + sa * lean;
    if (far) {
      pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
      for (let k = 0; k < 3; k++) shade.push(h);
      continue;
    }
    // root → the widest point, bending out → tip
    const mx = bx + ca * lean * 0.35, mz = bz + sa * lean * 0.35, my = h * 0.45;
    pos.push(bx, 0, bz, mx + px, my, mz + pz, mx - px, my, mz - pz);
    pos.push(mx - px, my, mz - pz, mx + px, my, mz + pz, tx, h, tz);
    for (let k = 0; k < 6; k++) shade.push(h);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // darker at the root (it blends into the ground), bright at the tips
  const hs = shade;
  let k = 0;
  return colored(g, (c, x, y) => { const f = y / hs[k++]; c.setRGB(0.78 + f * 0.62, 0.8 + f * 0.6, 0.72 + f * 0.4); });
}

/** A flower: a stem, five petals and a heart; far away just a stem and a flat head. */
function flowerGeo(far = false) {
  const parts = [];
  if (far) {
    const stem = new THREE.BufferGeometry();
    stem.setAttribute('position', new THREE.Float32BufferAttribute([-0.012, 0, 0, 0.012, 0, 0, 0, 0.28, 0], 3));
    stem.computeVertexNormals();
    colored(stem, (c) => c.setRGB(0.25, 0.55, 0.2));
    parts.push(stem);
    const head = new THREE.CircleGeometry(0.09, 5);
    head.rotateX(-Math.PI / 2 + 0.35);
    head.translate(0, 0.29, 0);
    colored(head, (c, x, y, z) => (x * x + z * z < 0.0009 ? c.setRGB(1.4, 1.1, 0.2) : c.setRGB(1, 1, 1)));
    parts.push(head);
    return merge(parts);
  }
  const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.28, 3, 1, true);
  stem.translate(0, 0.14, 0);
  colored(stem, (c) => c.setRGB(0.25, 0.55, 0.2));
  parts.push(stem);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.CircleGeometry(0.045, 4);
    petal.rotateX(-Math.PI / 2 + 0.35);
    petal.translate(Math.cos(a) * 0.045, 0.29, Math.sin(a) * 0.045);
    colored(petal, (c) => c.setRGB(1, 1, 1));
    parts.push(petal);
  }
  const heart = new THREE.SphereGeometry(0.022, 5, 3);
  heart.translate(0, 0.3, 0);
  colored(heart, (c) => c.setRGB(1.4, 1.1, 0.2)); // tinted by the flower colour, stays warm
  parts.push(heart);
  return merge(parts);
}

function fernGeo(far = false) {
  const pos = [];
  const n = far ? 5 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const L = 0.55 + (i % 3) * 0.12;
    const ca = Math.cos(a), sa = Math.sin(a);
    const w = far ? 0.11 : 0.09;
    // a frond: base → arched middle → drooping tip
    const m = [ca * L * 0.55, 0.32, sa * L * 0.55], t = [ca * L, 0.12, sa * L];
    const px = -sa * w, pz = ca * w;
    pos.push(0, 0.02, 0, m[0] + px, m[1], m[2] + pz, m[0] - px, m[1], m[2] - pz);
    pos.push(m[0] + px, m[1], m[2] + pz, t[0], t[1], t[2], m[0] - px, m[1], m[2] - pz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  for (let i = 0; i < nr.count; i++) nr.setXYZ(i, nr.getX(i) * 0.3, Math.abs(nr.getY(i)) + 0.6, nr.getZ(i) * 0.3);
  return colored(g, (c, x, y) => c.setRGB(0.6 + y * 0.8, 0.7 + y * 0.8, 0.55 + y * 0.4));
}

function pebbleGeo(far = false) {
  const g = far ? new THREE.OctahedronGeometry(0.1, 0) : new THREE.IcosahedronGeometry(0.1, 0);
  g.scale(1, 0.55, 0.8);
  g.translate(0, 0.02, 0);
  return colored(g, (c, x, y) => c.setRGB(0.85 + y, 0.85 + y, 0.85 + y));
}

function shellGeo() {
  const g = new THREE.ConeGeometry(0.07, 0.05, 7, 1, true);
  g.scale(1, 1, 0.7);
  g.translate(0, 0.02, 0);
  return colored(g, (c, x, y) => c.setRGB(1, 0.95 - y, 0.9 - y));
}

function rockGeo(far = false) {
  const g = far ? new THREE.IcosahedronGeometry(0.5, 0) : new THREE.DodecahedronGeometry(0.5, 0);
  g.scale(1, 0.62, 0.85);
  g.translate(0, 0.12, 0);
  return colored(g, (c, x, y) => c.setRGB(0.9 + y * 0.3, 0.9 + y * 0.3, 0.9 + y * 0.3));
}

function merge(list) {
  let n = 0;
  for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}

// ---------------------------------------------------------------- materials
const uTime = { value: 0 };
function coverMaterial(kind) {
  const soft = kind === 'grass' || kind === 'fern' || kind === 'flower';
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: soft ? THREE.DoubleSide : THREE.FrontSide });
  const sway = SWAY[kind] || 0;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOG, { uTime });
    if (kind === 'grass') {
      // blades take the light of the ground they stand on, whichever side you see
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`);
    }
    if (!sway) return;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float ph = uTime * 1.6 + ip.x * 0.45 + ip.z * 0.31;
        float k = transformed.y * transformed.y * ${(2.6 * sway).toFixed(2)};
        transformed.x += (sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25) * k * 0.35;
        transformed.z += cos(ph * 0.8) * k * 0.12;
      }`);
  };
  m.customProgramCacheKey = () => 'cover2-' + kind;
  return m;
}

// ---------------------------------------------------------------- placement
/** Colour palettes by climate: grass tint (sRGB, like the tile palette), flower colours. */
const SRGB = THREE.SRGBColorSpace;
function grassTint(clim, c, r) {
  switch (clim) {
    case CLIMATE.TROPICAL: return c.setRGB(0.3 + r * 0.06, 0.66 + r * 0.06, 0.22, SRGB);
    case CLIMATE.AUTUMN: return c.setRGB(0.7 + r * 0.08, 0.56 + r * 0.08, 0.2, SRGB);
    case CLIMATE.ARID: return c.setRGB(0.66, 0.64 + r * 0.05, 0.34, SRGB);
    case CLIMATE.VOLCANIC: return c.setRGB(0.4, 0.44, 0.28, SRGB);
    case CLIMATE.GLOOM: return c.setRGB(0.34, 0.4, 0.32, SRGB);
    case CLIMATE.SAKURA: return c.setRGB(0.44 + r * 0.06, 0.68, 0.34, SRGB);
    case CLIMATE.SPRING: return c.setRGB(0.42 + r * 0.06, 0.72, 0.3, SRGB);
    default: return c.setRGB(0.34 + r * 0.07, 0.64 + r * 0.06, 0.25 + r * 0.04, SRGB);
  }
}
const FLOWERS = [[1, 1, 1], [1, 0.86, 0.25], [1, 0.55, 0.7], [0.92, 0.25, 0.28], [0.7, 0.5, 1], [0.45, 0.7, 1], [1, 0.62, 0.2]];

/** Smooth value noise in [0, 1] (patches of flowers, bare spots). */
function vnoise(x, y, k) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, k), b = hash(xi + 1, yi, k), c = hash(xi, yi + 1, k), d = hash(xi + 1, yi + 1, k);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/**
 * The cover in one cell: per kind, a flat list of [x, y, h, rot, scale, r, g, b]
 * (x, y absolute tiles; h metres).
 */
function buildCell(world, terrain, cx, cy) {
  const out = {};
  for (const k of KINDS) out[k] = [];
  const x0 = cx * CELL, y0 = cy * CELL;
  const col = new THREE.Color();
  const put = (k, x, y, rot, s, c) => {
    let h = terrain(x, y);
    if (k === 'rock') h = Math.max(h, -0.35); // shore rocks break the surface
    else if (!(h > 0.05)) return;
    out[k].push(x, y, h, rot, s, c.r, c.g, c.b);
  };
  for (let j = 0; j < CELL; j++) {
    const y = y0 + j;
    if (y < 1 || y >= world.height - 1) continue;
    for (let i = 0; i < CELL; i++) {
      const x = world.wx(x0 + i);
      const t = world.type(x, y);
      const r1 = hash(x, y, 1), r2 = hash(x, y, 2), r3 = hash(x, y, 3);
      if (IS_LIQUID[t]) {
        // rocks in the shallows along the shore
        if (t === T.SEA && r1 < 0.022) {
          const sd = world.sd ? world.sd(x, y) : -1;
          if (sd > -2.5) put('rock', x + r2, y + r3, r1 * 60, 0.7 + r2 * 1.3, col.setRGB(0.62, 0.6, 0.56));
        }
        continue;
      }
      if (OVERLAY[t] || PAVED[t] || world.isBlocked(x, y)) continue;
      const clim = world.climate ? world.climate(x, y) : 0;
      const winter = clim === CLIMATE.WINTER || t === T.SNOW;
      if (t === T.GRASS || t === T.LAWN || t === T.FARM || t === T.FLOWERS || t === T.FOREST || t === T.JUNGLE || t === T.SAKURA || t === T.MANGROVE) {
        if (winter) continue;
        const n = t === T.FOREST || t === T.JUNGLE ? 2 : t === T.LAWN ? 1 : 3;
        for (let q = 0; q < n; q++) {
          const a = hash(x, y, 10 + q), b = hash(x, y, 20 + q);
          if (a < 0.12) continue;
          put('grass', x + a, y + b, a * 40, 0.7 + b * 0.7, grassTint(clim, col, hash(x, y, 30 + q)));
        }
        const patch = vnoise(x / 7, y / 7, 5);
        const fp = t === T.FLOWERS ? 0.55 : t === T.SAKURA ? 0.25 : t === T.GRASS ? 0.015 + Math.max(0, patch - 0.62) * 1.1 : 0.02;
        if (r1 < fp) {
          // one or two colours per patch, like real wild flowers
          const pick = hash(Math.floor(x / 7), Math.floor(y / 7), 6) * FLOWERS.length + (r2 < 0.3 ? 2 : 0);
          const f = clim === CLIMATE.SAKURA ? FLOWERS[2 + Math.floor(r2 * 2)] : FLOWERS[Math.floor(pick) % FLOWERS.length];
          put('flower', x + r3, y + r2, r1 * 50, 0.8 + r3 * 0.6, col.setRGB(f[0], f[1], f[2]));
        }
        if ((t === T.FOREST || t === T.JUNGLE || t === T.MANGROVE) && r3 < (t === T.JUNGLE ? 0.35 : 0.22)) {
          put('fern', x + r1, y + r2, r3 * 60, 0.75 + r1 * 0.7, grassTint(clim, col, r2).multiplyScalar(0.85));
        }
        if (r2 > 0.985) put('pebble', x + r1, y + r3, r2 * 50, 0.8 + r1, col.setRGB(0.7, 0.68, 0.64));
      } else if (t === T.SAND) {
        const sd = world.sd ? world.sd(x, y) : 3;
        if (r1 < 0.05 && sd < 3) put('shell', x + r2, y + r3, r1 * 80, 0.8 + r2 * 0.6, col.setRGB(1, 0.86 + r3 * 0.1, 0.78));
        else if (r1 > 0.965) put('pebble', x + r2, y + r3, r1 * 40, 0.7 + r2, col.setRGB(0.78, 0.74, 0.66));
        if (r2 < 0.04 && sd > 3 && !winter) put('grass', x + r3, y + r1, r2 * 50, 0.6 + r3 * 0.4, col.setRGB(0.66, 0.7, 0.36));
      } else if (t === T.DIRT || t === T.MUD || t === T.GRAVEL) {
        if (r1 < (t === T.GRAVEL ? 0.4 : 0.1)) put('pebble', x + r2, y + r3, r1 * 30, 0.6 + r2 * 0.8, col.setRGB(0.66, 0.62, 0.56));
        if (r3 < 0.2 && t !== T.GRAVEL && !winter) put('grass', x + r1, y + r2, r3 * 40, 0.55 + r1 * 0.4, grassTint(clim, col, r1).multiplyScalar(0.9));
      } else if (t === T.ROCK || t === T.MOUNTAIN || t === T.CLIFF || t === T.ASH || t === T.SNOWROCK) {
        // (nothing on a steep face: a boulder doesn't sit on a cliff — and one
        // there, the sun low across the face, cast a long dark streak down it)
        const h0 = terrain(x + 0.5, y + 0.5);
        if (Math.abs(terrain(x + 1.5, y + 0.5) - h0) > 0.9 || Math.abs(terrain(x + 0.5, y + 1.5) - h0) > 0.9) continue;
        if (r1 < 0.3) put('pebble', x + r2, y + r3, r1 * 30, 0.7 + r2 * 1.2, t === T.ASH ? col.setRGB(0.34, 0.32, 0.3) : col.setRGB(0.6, 0.58, 0.55));
        if (r2 < 0.045) put('rock', x + r3, y + r1, r2 * 70, 0.6 + r3 * 1.1, col.setRGB(0.66, 0.63, 0.6));
        if (r3 < 0.08 && !winter && t !== T.ASH) put('grass', x + r1, y + r2, r3 * 40, 0.5 + r1 * 0.3, grassTint(clim, col, r2).multiplyScalar(0.85));
      } else if (t === T.DESERT) {
        if (r1 < 0.05) put('pebble', x + r2, y + r3, r1 * 30, 0.7 + r2, col.setRGB(0.82, 0.72, 0.56));
        if (r2 < 0.012) put('rock', x + r3, y + r1, r2 * 50, 0.5 + r3, col.setRGB(0.84, 0.7, 0.52));
      } else if (t === T.SNOW) {
        if (r1 < 0.03) put('pebble', x + r2, y + r3, r1 * 30, 0.8 + r2, col.setRGB(0.6, 0.6, 0.64));
      } else if (t === T.CORAL) {
        if (r1 < 0.2) put('fern', x + r2, y + r3, r1 * 60, 0.6 + r2 * 0.5, col.setRGB(1, 0.45 + r3 * 0.3, 0.55));
      } else if (t === T.CANDY) {
        if (r1 < 0.12) put('flower', x + r2, y + r3, r1 * 50, 1 + r2, col.setRGB(1, 0.5 + r3 * 0.5, 0.7 + r2 * 0.3));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the system
const RINGS = new Map();
/** Cell offsets within `cr`, nearest first. */
function ring(cr) {
  let r = RINGS.get(cr);
  if (!r) {
    r = [];
    for (let j = -cr; j <= cr; j++) for (let i = -cr; i <= cr; i++) r.push([i, j]);
    r.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
    RINGS.set(cr, r);
  }
  return r;
}

class GroundCover {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'groundcover';
    scene.add(this.group);
    const near = { grass: grassGeo(), flower: flowerGeo(), fern: fernGeo(), pebble: pebbleGeo(), shell: shellGeo(), rock: rockGeo() };
    const far = { grass: grassGeo(true), flower: flowerGeo(true), fern: fernGeo(true), pebble: pebbleGeo(true), shell: near.shell, rock: rockGeo(true) };
    this.sets = {};
    for (const k of KINDS) {
      this.sets[k] = new WedgeSet(this.group, k, {
        geo: near[k], farGeo: far[k], mat: coverMaterial(k), capNear: MAXN[k], capFar: MAXF[k], near: NEAR, wedges: WEDGES[k], pad: PAD[k],
        setup: (m) => { m.receiveShadow = k === 'rock' || k === 'grass' || k === 'pebble'; m.castShadow = k === 'rock'; },
      });
    }
    this.cells = new Map();
    this.world = null;
    this.origin = null;
    this.key = '';
    this.want = null; // the centre cell wanted, until its cover is placed
    this.t = 0;
  }

  update(ctx, env, dt) {
    const game = ctx.game, v = game.view3d, w = ctx.world;
    if (!w || !v) return;
    if (w !== this.world) { this.world = w; this.cells.clear(); this.key = ''; this.want = null; }
    uTime.value = env.time;
    const low = v.quality === 'low';
    const R = low ? 36 : 64;
    const ox = v.ox, oy = v.oy;
    const ccx = Math.floor(w.wx(ox) / CELL), ccy = Math.floor(oy / CELL);
    const key = `${ccx},${ccy},${low ? 1 : 0}`;
    this.t -= dt;
    if (key !== this.key) { this.key = key; this.want = { ccx, ccy, R, low, placed: false }; }
    const wt = this.want;
    if (wt && this.t <= 0) {
      // build the cells it needs (nearest first, a little a frame), then place
      // the cover: as soon as the ground around the centre is ready, and again
      // once everything out to the edge is
      const t0 = performance.now();
      const cr = Math.ceil(wt.R / CELL) + 1;
      let nearReady = true, allReady = true;
      for (const [i, j] of ring(cr)) {
        const k = this.cellKey(w, wt.ccx + i, wt.ccy + j);
        if (k < 0 || this.cells.has(k)) continue;
        if (performance.now() - t0 > FILL_BUDGET_MS) {
          allReady = false;
          if (Math.max(Math.abs(i), Math.abs(j)) <= Math.ceil(NEAR / CELL)) nearReady = false;
          break;
        }
        this.cells.set(k, buildCell(w, ctx.terrain, k % 100000, wt.ccy + j));
      }
      prof('gc.cells', t0);
      if (allReady || (nearReady && !wt.placed)) {
        const t1 = performance.now();
        this.place(w, wt.ccx, wt.ccy, wt.R, wt.low);
        prof('gc.place', t1);
        wt.placed = true;
        this.t = 0.15;
        if (allReady) this.want = null;
      }
    }
    if (this.origin) this.group.position.set(w.dx(ox, this.origin.x), 0, this.origin.y - oy);
  }

  /** The cache key of cell (cx, cy) (wrapped around the world on X), or -1 off the map. */
  cellKey(w, cx, cy) {
    if (cy < 0 || cy * CELL >= w.height) return -1;
    const n = Math.ceil(w.width / CELL);
    if (w.wrap) cx = ((cx % n) + n) % n;
    else if (cx < 0 || cx >= n) return -1;
    return cy * 100000 + cx;
  }

  /** Lay out the instances around the centre of cell (ccx, ccy). */
  place(w, ccx, ccy, R, low) {
    const cr = Math.ceil(R / CELL) + 1;
    const ox = (ccx + 0.5) * CELL, oy = (ccy + 0.5) * CELL;
    this.origin = { x: ox, y: oy };
    for (const k of KINDS) this.sets[k].reset();
    const keep = new Set();
    // nearest cells first, so the caps cut the far edge, never what's around you
    for (const [i, j] of ring(cr)) {
      const k = this.cellKey(w, ccx + i, ccy + j);
      if (k < 0) continue;
      keep.add(k);
      const cell = this.cells.get(k);
      if (!cell) continue;
      for (const kind of KINDS) {
        const list = cell[kind];
        if (!list.length) continue;
        const Rk = R * REACH[kind], R2 = Rk * Rk;
        const thin = THIN[kind], thinK = low ? 2.4 : 1.7;
        const set = this.sets[kind];
        const grass = kind === 'grass';
        for (let q = 0; q < list.length; q += 8) {
          const x = list[q], y = list[q + 1];
          const dx = w.dx(ox, x), dz = y - oy;
          const d2 = dx * dx + dz * dz;
          if (d2 > R2) continue;
          // thin out with distance (grass, flowers and ferns)
          if (thin && d2 > R2 * 0.25) {
            const f = Math.sqrt(d2) / Rk;
            if (hash(Math.floor(x * 7), Math.floor(y * 7), 91) < (f - 0.5) * thinK) continue;
          }
          const sc = list[q + 4];
          set.put(dx, list[q + 2] - 0.02, dz, list[q + 3], sc, sc * (grass ? 0.8 + (sc % 0.3) : 1), list[q + 5], list[q + 6], list[q + 7]);
        }
      }
    }
    for (const k of KINDS) this.sets[k].finish();
    // forget far cells
    if (this.cells.size > 900) for (const k of this.cells.keys()) if (!keep.has(k)) this.cells.delete(k);
  }
}

let cover = null;
registerFrameHook((env, ctx, dt) => {
  if (!cover) { cover = new GroundCover(ctx.scene); if (ctx.game?.view3d) ctx.game.view3d.groundCover = cover; }
  cover.update(ctx, env, dt || 1 / 60);
}, 'groundcover');
