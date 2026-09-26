// The sea floor: coral reefs in warm seas (branching staghorn, brain and table
// corals, sea fans, tube sponges, anemones and giant clams), kelp forests in
// cold ones, meadows of sea grass in the sandy shallows, boulders on the
// slopes and starfish on the sand. Scattered procedurally around the camera
// from the tile map and the sea-floor height (nothing is stored), drawn as a
// few instanced meshes; the soft ones sway in the swell and everything
// catches the rippling caustic light. Deep water past the reef edge is bare
// but for a rock or a sponge — the abyss is dark and empty.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { T } from '../world/tiles.js';
import { hash, warmth, clamAt } from '../world/seabed.js';
import { toonGradient } from './materials.js';
import { FOG } from './fog.js';
import { CAUSTIC, CTIME } from './terrain3d.js';

const TAU = Math.PI * 2;
const CELL = 16; // tiles per cached cell
const KINDS = ['branch', 'brain', 'table', 'fan', 'tube', 'anemone', 'kelp', 'seagrass', 'boulder', 'star', 'clam'];
const MAX = { branch: 1400, brain: 1000, table: 420, fan: 800, tube: 600, anemone: 700, kelp: 1500, seagrass: 5000, boulder: 1100, star: 500, clam: 60 };
const SWAY = { fan: 0.5, anemone: 0.7, kelp: 1, seagrass: 0.9 };
const GLOW = { branch: 0.07, brain: 0.04, table: 0.05, fan: 0.08, tube: 0.06, anemone: 0.16, clam: 0.14, star: 0.06 };
const STRIDE = 9; // x, y, h, rot, scale, yScale, r, g, b

function vnoise(x, y, k) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, k), b = hash(xi + 1, yi, k), c = hash(xi, yi + 1, k), d = hash(xi + 1, yi + 1, k);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- geometry
function colored(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function merge(list) {
  let n = 0;
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) { if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of flat) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return m;
}
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** A tapered open tube from a to b. */
function limb(a, b, r0, r1, seg = 4) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}
/** A flat ribbon through the points (each [x, y, z, halfWidth]), facing ±z. */
function ribbon(pts, twist = 0) {
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, z0, w0] = pts[i], [x1, y1, z1, w1] = pts[i + 1];
    const c0 = Math.cos(twist * i), s0 = Math.sin(twist * i), c1 = Math.cos(twist * (i + 1)), s1 = Math.sin(twist * (i + 1));
    const a = [x0 - w0 * c0, y0, z0 - w0 * s0], b = [x0 + w0 * c0, y0, z0 + w0 * s0];
    const c = [x1 + w1 * c1, y1, z1 + w1 * s1], d = [x1 - w1 * c1, y1, z1 - w1 * s1];
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Staghorn coral: limbs from the base, each forking twice, pale at the tips. */
function branchGeo() {
  const parts = [], r = rng(11);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + r() * 0.6;
    const tilt = 0.2 + r() * 0.5, L = 0.2 + r() * 0.14;
    const base = V(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04);
    const mid = V(base.x + Math.cos(a) * Math.sin(tilt) * L, L * Math.cos(tilt), base.z + Math.sin(a) * Math.sin(tilt) * L);
    parts.push(limb(base, mid, 0.032, 0.024, 5));
    for (const s of [-1, 1]) {
      const a2 = a + s * (0.35 + r() * 0.4), t2 = tilt * 0.45 + r() * 0.3, L2 = L * (0.7 + r() * 0.4);
      const tip = V(mid.x + Math.cos(a2) * Math.sin(t2) * L2, mid.y + Math.cos(t2) * L2, mid.z + Math.sin(a2) * Math.sin(t2) * L2);
      parts.push(limb(mid, tip, 0.022, 0.009, 5));
    }
  }
  // brownish at the root, the living tips pale
  return colored(merge(parts), (c, x, y) => { const f = Math.min(1, y / 0.5); c.setScalar(0.55 + f * 0.75); });
}

/** Brain / boulder coral: a lumpy dome with meandering ridges. */
function brainGeo() {
  const g = new THREE.IcosahedronGeometry(0.42, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.07 * Math.sin(x * 9 + z * 5) * Math.cos(z * 8 - x * 3);
    y = (y < -0.02 ? -0.02 : y) * 0.62;
    p.setXYZ(i, x * k, y * k + 0.02, z * k);
  }
  g.computeVertexNormals();
  return colored(g, (c, x, y, z) => { const ridge = 0.78 + 0.22 * Math.sin(x * 34 + Math.sin(z * 23) * 2.6); c.setScalar(ridge + y * 0.3); });
}

/** Table coral: a flat plate on a short stalk. */
function tableGeo() {
  const plate = new THREE.CircleGeometry(0.55, 11);
  plate.rotateX(-Math.PI / 2);
  const p = plate.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z);
    p.setY(i, 0.36 + rr * 0.08 + Math.sin(Math.atan2(z, x) * 5) * 0.025 * rr);
  }
  plate.computeVertexNormals();
  const stalk = limb(V(0, 0, 0), V(0.02, 0.37, 0), 0.08, 0.05, 5);
  return colored(merge([plate, stalk]), (c, x, y, z) => { const rr = Math.hypot(x, z); c.setScalar(y > 0.3 ? 0.8 + rr * 0.45 : 0.6); });
}

/** A sea fan: a flat lattice fan on a stem (swaying). */
function fanGeo() {
  const pos = [];
  const n = 9, R = 0.72, y0 = 0.1;
  for (let i = 0; i < n; i++) {
    const a0 = 0.35 + (i / n) * (Math.PI - 0.7), a1 = 0.35 + ((i + 1) / n) * (Math.PI - 0.7);
    const r0 = R * (0.86 + 0.14 * Math.sin(i * 1.7)), r1 = R * (0.86 + 0.14 * Math.sin((i + 1) * 1.7));
    pos.push(0, y0, 0, Math.cos(a1) * r1, y0 + Math.sin(a1) * r1, 0, Math.cos(a0) * r0, y0 + Math.sin(a0) * r0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const stem = limb(V(0, 0, 0), V(0, y0 + 0.02, 0), 0.04, 0.03, 4);
  return colored(merge([g, stem]), (c, x, y) => { const f = Math.min(1, y / 0.8); c.setScalar(0.55 + f * 0.6 + 0.12 * Math.sin(x * 40) * Math.sin(y * 40)); });
}

/** Tube sponges: a clutch of open barrels, darker inside the rim. */
function tubeGeo() {
  const parts = [], r = rng(23);
  const spots = [[0, 0, 0.62], [0.13, 0.06, 0.44], [-0.1, 0.1, 0.36], [0.02, -0.14, 0.5]];
  for (const [x, z, h] of spots) {
    const g = new THREE.CylinderGeometry(0.075 + r() * 0.02, 0.06, h, 7, 2, true);
    g.translate(x, h / 2, z);
    parts.push(g);
  }
  return colored(merge(parts), (c, x, y) => c.setScalar(0.6 + Math.min(1, y / 0.6) * 0.5));
}

/** Anemone: a squat foot and a crown of soft tentacles (swaying). */
function anemoneGeo() {
  const parts = [];
  const foot = new THREE.CylinderGeometry(0.1, 0.13, 0.12, 8, 1, false);
  foot.translate(0, 0.06, 0);
  parts.push(foot);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const L = 0.2 + (i % 3) * 0.04, out = 0.45 + (i % 2) * 0.25;
    const r0 = 0.08;
    // built reaching out along +z (its width along x), then turned to face out
    const g = ribbon([[0, 0.12, r0, 0.022], [0, 0.12 + L * 0.6, r0 + L * 0.5 * out, 0.016], [0, 0.12 + L, r0 + L * out, 0.004]]);
    g.rotateY(Math.PI / 2 - a);
    parts.push(g);
  }
  return colored(merge(parts), (c, x, y) => c.setScalar(y < 0.12 ? 0.6 : 0.85 + (y - 0.12) * 1.4));
}

/** A kelp frond: a wavy stipe with leaf blades, 1 m tall (scaled per instance). */
function kelpGeo() {
  const parts = [];
  const pts = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push([Math.sin(u * 7) * 0.03, u, Math.cos(u * 5) * 0.02, 0.012 * (1 - u * 0.4)]);
  }
  parts.push(ribbon(pts));
  for (let i = 1; i < 12; i++) {
    const u = i / 12.5, s = i % 2 ? 1 : -1;
    const bx = Math.sin(u * 7) * 0.03, bz = Math.cos(u * 5) * 0.02;
    const L = 0.26 + 0.08 * Math.sin(i * 2.1);
    // long ruffled leaves on alternate sides, drooping a little
    parts.push(ribbon([[bx, u, bz, 0.006], [bx + 0.02, u + 0.035, bz + s * L * 0.35, 0.065], [bx - 0.01, u + 0.05, bz + s * L * 0.7, 0.05], [bx, u + 0.045, bz + s * L, 0.006]]));
  }
  return colored(merge(parts), (c, x, y) => c.setScalar(0.7 + y * 0.45));
}

/** Sea grass: a tuft of long soft ribbons (swaying). */
function seagrassGeo() {
  const parts = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + i * 0.9;
    const h = 0.38 + (i % 3) * 0.1, lean = 0.08 + (i % 2) * 0.06, r0 = 0.03 + (i % 2) * 0.03;
    const g = ribbon([[0, 0, r0, 0.018], [0, h * 0.55, r0 + lean * 0.4, 0.016], [0, h, r0 + lean, 0.006]]);
    g.rotateY(Math.PI / 2 - a);
    parts.push(g);
  }
  return colored(merge(parts), (c, x, y) => c.setScalar(0.62 + y * 1.1));
}

function boulderGeo() {
  const g = new THREE.DodecahedronGeometry(0.5, 0).toNonIndexed();
  g.scale(1, 0.58, 0.82);
  g.translate(0, 0.1, 0);
  g.computeVertexNormals();
  return colored(g, (c, x, y) => c.setScalar(0.82 + y * 0.35));
}

/** A starfish lying on the sand. */
function starGeo() {
  const pos = [];
  const arms = 5, ro = 0.13, ri = 0.05, hc = 0.03;
  for (let i = 0; i < arms * 2; i++) {
    const a0 = (i / (arms * 2)) * TAU, a1 = ((i + 1) / (arms * 2)) * TAU;
    const r0 = i % 2 ? ri : ro, r1 = i % 2 ? ro : ri;
    pos.push(0, hc, 0, Math.cos(a1) * r1, 0.008, Math.sin(a1) * r1, Math.cos(a0) * r0, 0.008, Math.sin(a0) * r0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return colored(g, (c, x, y) => c.setScalar(0.85 + y * 5));
}

/** A giant clam, gaping, its mantle bright blue-violet between fluted shells. */
function clamGeo() {
  const parts = [];
  for (const s of [-1, 1]) {
    const shell = new THREE.SphereGeometry(0.42, 10, 4, 0, Math.PI, 0, Math.PI / 2);
    shell.scale(1, 0.55, 0.62);
    const p = shell.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const flute = 1 + 0.1 * Math.max(0, Math.cos(Math.atan2(z, x) * 5)) * (1 - y * 2);
      p.setXYZ(i, x * flute, y, z * flute);
    }
    shell.rotateX(s * (Math.PI / 2 - 0.28));
    shell.translate(0, 0.2, 0);
    parts.push(shell);
  }
  const mantle = new THREE.SphereGeometry(0.34, 10, 3);
  mantle.scale(1, 0.3, 0.2);
  mantle.translate(0, 0.28, 0);
  parts.push(mantle);
  // (the mantle is picked out by colour: see below)
  return colored(merge(parts), (c, x, y, z) => {
    if (Math.abs(z) < 0.075 && y > 0.18) c.setRGB(0.25, 0.55, 1.6); // the glowing mantle (tinted blue whatever the shell)
    else c.setScalar(0.8 + y * 0.4);
  });
}

// ---------------------------------------------------------------- materials
const uTime = { value: 0 };
const uOrigin = { value: new THREE.Vector2() };
function seabedMaterial(kind) {
  const soft = !!SWAY[kind] || kind === 'fan' || kind === 'table' || kind === 'star' || kind === 'tube';
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: soft ? THREE.DoubleSide : THREE.FrontSide });
  const sway = SWAY[kind] || 0, glow = GLOW[kind] || 0;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOG, { uTime, uCTime: CTIME, uSeaOrigin: uOrigin });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vSeaW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      ${sway ? `{
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float ph = uTime * 0.85 + ip.x * 0.23 + ip.z * 0.19;
        float k = transformed.y * transformed.y * ${(0.42 * sway).toFixed(2)} + transformed.y * ${(0.08 * sway).toFixed(2)};
        transformed.x += (sin(ph) * 0.7 + sin(ph * 2.3 + 1.3) * 0.3) * k;
        transformed.z += cos(ph * 0.73 + 0.4) * k * 0.7;
      }` : ''}
      vSeaW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCTime;\nuniform vec2 uSeaOrigin;\nvarying vec3 vSeaW;\n' + CAUSTIC)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float dd = -vSeaW.y;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.88, 1.0), clamp(dd / 24.0, 0.0, 0.7));
        vec2 cp = vSeaW.xz + uSeaOrigin;
        float c = causticNet(cp * 0.9 + vec2(uCTime * 0.05, uCTime * 0.03), uCTime * 1.2);
        diffuseColor.rgb += vec3(0.5, 0.85, 0.8) * c * 0.12 * exp(-max(dd, 0.0) * 0.09);
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => 'seabed1-' + kind;
  return m;
}

// ---------------------------------------------------------------- placement
const SRGB = THREE.SRGBColorSpace;
const CORAL = [[0.86, 0.72, 0.55], [0.93, 0.52, 0.6], [0.62, 0.45, 0.84], [0.95, 0.8, 0.42], [0.92, 0.55, 0.32], [0.45, 0.62, 0.88], [0.55, 0.78, 0.46], [0.82, 0.4, 0.42]];
const BRAIN = [[0.84, 0.72, 0.5], [0.6, 0.74, 0.46], [0.88, 0.6, 0.62], [0.76, 0.58, 0.42], [0.56, 0.68, 0.74]];
const FANS = [[0.6, 0.36, 0.8], [0.84, 0.3, 0.34], [0.92, 0.55, 0.28], [0.92, 0.76, 0.36]];
const TUBES = [[0.55, 0.38, 0.74], [0.9, 0.56, 0.32], [0.88, 0.76, 0.36], [0.42, 0.56, 0.84]];
const ANEMONES = [[0.95, 0.55, 0.68], [0.52, 0.88, 0.6], [0.95, 0.62, 0.32], [0.7, 0.58, 0.95]];
const STARS = [[0.95, 0.48, 0.22], [0.86, 0.28, 0.28], [0.58, 0.38, 0.82], [0.95, 0.78, 0.3], [0.32, 0.5, 0.9]];
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

/** The decor in one cell: per kind, a flat list of STRIDE numbers per piece. */
function buildCell(world, terrain, cx, cy) {
  const out = {};
  for (const k of KINDS) out[k] = [];
  const x0 = cx * CELL, y0 = cy * CELL;
  const col = new THREE.Color();
  const warm = warmth(world, x0 + CELL / 2, y0 + CELL / 2);
  const reefy = warm > 0.55, cold = warm < 0.35;
  const put = (k, x, y, rot, s, sy, c, sink = 0.04) => {
    const h = terrain(x, y);
    out[k].push(x, y, h - sink, rot, s, sy, c[0], c[1], c[2]);
  };
  const rgb = (c, k = 1) => { col.setRGB(c[0] * k, c[1] * k, c[2] * k, SRGB); return [col.r, col.g, col.b]; };
  for (let j = 0; j < CELL; j++) {
    const y = y0 + j;
    if (y < 1 || y >= world.height - 1) continue;
    for (let i = 0; i < CELL; i++) {
      const x = world.wx(x0 + i);
      const t = world.type(x, y);
      if (t !== T.SEA && t !== T.REEF) continue;
      const depth = -terrain(x + 0.5, y + 0.5);
      if (!(depth > 0.45)) continue; // the wet sand at the water's edge
      const r1 = hash(x, y, 101), r2 = hash(x, y, 102), r3 = hash(x, y, 103), r4 = hash(x, y, 104);
      const patch = vnoise(x / 9, y / 9, 41), patch2 = vnoise(x / 14, y / 14, 43);
      const reefTile = t === T.REEF;
      // sea grass meadows on the sandy shallows
      if (depth < 7 && !cold && patch2 > 0.42) {
        const n = patch2 > 0.6 ? 3 : 1;
        for (let q = 0; q < n; q++) {
          const a = hash(x, y, 110 + q), b = hash(x, y, 120 + q);
          if (a < 0.25) continue;
          put('seagrass', x + a, y + b, a * 40, 0.8 + b * 0.7, 1 + depth * 0.05, rgb([0.36 + b * 0.1, 0.56 + a * 0.08, 0.26]));
        }
      }
      // the coral reef: warm water, a few metres down, in patches (and all over a charted reef)
      const reefK = reefTile ? 1.2 : reefy && depth > 0.8 && depth < 20 ? smooth(0.36, 0.62, patch) * (1 - smooth(14, 20, depth)) * 1.4 : 0;
      if (reefK > 0) {
        for (let q = 0; q < 3; q++) {
          const a = hash(x, y, 130 + q), b = hash(x, y, 140 + q), c = hash(x, y, 150 + q);
          if (a > reefK * 0.5) continue;
          const px = x + b, py = y + hash(x, y, 180 + q), rot = a * 70;
          if (c < 0.36) put('branch', px, py, rot, 0.75 + b * 0.8, 1, rgb(pick(CORAL, hash(x >> 2, y >> 2, 160 + q))));
          else if (c < 0.56) put('brain', px, py, rot, 0.5 + b * 0.9, 1, rgb(pick(BRAIN, b)), 0.06);
          else if (c < 0.64) put('table', px, py, rot, 0.6 + b * 0.8, 1, rgb(pick(CORAL, hash(x >> 3, y >> 3, 170))));
          else if (c < 0.78) put('fan', px, py, rot, 0.6 + b * 0.7, 1, rgb(pick(FANS, a * 3)));
          else if (c < 0.88) put('tube', px, py, rot, 0.6 + b * 0.8, 1, rgb(pick(TUBES, b * 2)));
          else put('anemone', px, py, rot, 0.8 + b * 0.8, 1, rgb(pick(ANEMONES, a * 2)));
        }
      }
      // a kelp forest: cool water, reaching for the light
      if (!reefy && depth > 2.4 && depth < 26 && patch2 > (cold ? 0.4 : 0.55) && r3 < (cold ? 0.6 : 0.34)) {
        const h = Math.min(depth * 0.82, 3 + r1 * 7.5);
        put('kelp', x + r2, y + r4, r1 * 60, 0.9 + r2 * 0.6, h, rgb([0.44 + r4 * 0.1, 0.46 + r2 * 0.08, 0.18]));
        if (r4 < 0.4) put('kelp', x + r4, y + r2, r2 * 60, 0.8 + r1 * 0.5, h * 0.7, rgb([0.4, 0.48, 0.2]));
      }
      // boulders on the slopes; the odd sponge in the deep
      if (depth > 1.2 && r4 < (depth > 16 ? 0.03 : 0.012)) put('boulder', x + r1, y + r3, r4 * 90, 0.7 + r2 * 2.2, 1, rgb(depth > 20 ? [0.36, 0.4, 0.44] : [0.5, 0.52, 0.46]), 0.12);
      if (depth > 22 && r2 < 0.006) put('tube', x + r3, y + r1, r2 * 90, 1 + r4, 1, rgb([0.5, 0.4, 0.6], 0.8));
      // starfish on the sand
      if (depth > 0.6 && depth < 12 && r2 > 0.992) put('star', x + r1, y + r4, r2 * 90, 0.8 + r3 * 0.8, 1, rgb(pick(STARS, r3)), 0);
      // giant clams (a pearl for a diver who finds one)
      if (clamAt(world, x, y, depth)) put('clam', x + 0.5, y + 0.5, r1 * TAU, 1.3 + r2 * 0.5, 1, rgb([0.86, 0.82, 0.72]), 0.05);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the system
const RINGS = new Map();
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

class SeaBed {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'seabed';
    scene.add(this.group);
    const geos = { branch: branchGeo(), brain: brainGeo(), table: tableGeo(), fan: fanGeo(), tube: tubeGeo(), anemone: anemoneGeo(), kelp: kelpGeo(), seagrass: seagrassGeo(), boulder: boulderGeo(), star: starGeo(), clam: clamGeo() };
    this.meshes = {};
    for (const k of KINDS) {
      const m = new THREE.InstancedMesh(geos[k], seabedMaterial(k), MAX[k]);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX[k] * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.receiveShadow = false;
      m.castShadow = false;
      this.group.add(m);
      this.meshes[k] = m;
    }
    this.cells = new Map();
    this.world = null;
    this.origin = null;
    this.key = '';
    this.t = 0;
  }

  update(ctx, env, dt) {
    const game = ctx.game, v = game.view3d, w = ctx.world;
    if (!w || !v) return;
    if (w !== this.world) { this.world = w; this.cells.clear(); this.key = ''; }
    uTime.value = env.time;
    uOrigin.value.set(w.wx(v.ox), v.oy);
    const low = v.quality === 'low';
    const under = !!v.isUnder;
    // near the water only: the floor can't be seen from inland or the open ocean's surface
    const cam = ctx.camera;
    const camH = cam ? cam.position.y : 0;
    const R = low ? 28 : under ? 46 : 40;
    const show = camH < 40;
    this.group.visible = show;
    if (!show) return;
    const ccx = Math.floor(w.wx(v.ox) / CELL), ccy = Math.floor(v.oy / CELL);
    const key = `${ccx},${ccy},${R}`;
    this.t -= dt;
    if (key !== this.key && this.t <= 0) {
      this.t = 0.3;
      this.key = key;
      this.rebuild(ctx, w, ccx, ccy, R);
    }
    if (this.origin) this.group.position.set(w.dx(v.ox, this.origin.x), 0, this.origin.y - v.oy);
  }

  rebuild(ctx, w, ccx, ccy, R) {
    const cr = Math.ceil(R / CELL) + 1;
    const ox = (ccx + 0.5) * CELL, oy = (ccy + 0.5) * CELL;
    this.origin = { x: ox, y: oy };
    const counts = {};
    for (const k of KINDS) counts[k] = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const keep = new Set();
    let built = 0, missing = false;
    const n = Math.ceil(w.width / CELL);
    for (const [i, j] of ring(cr)) {
      const cy = ccy + j;
      if (cy < 0 || cy * CELL >= w.height) continue;
      let cx = ccx + i;
      if (w.wrap) cx = ((cx % n) + n) % n;
      const k = cy * 100000 + cx;
      keep.add(k);
      let cell = this.cells.get(k);
      if (!cell) {
        if (built >= 16) { missing = true; continue; }
        cell = buildCell(w, ctx.terrain, cx, cy);
        this.cells.set(k, cell);
        built++;
      }
      for (const kind of KINDS) {
        const list = cell[kind];
        if (!list.length) continue;
        const mesh = this.meshes[kind];
        const small = kind === 'seagrass' || kind === 'star' || kind === 'anemone';
        for (let o = 0; o < list.length; o += STRIDE) {
          if (counts[kind] >= MAX[kind]) break;
          const x = list[o], y = list[o + 1];
          const dx = w.dx(ox, x), dz = y - oy;
          const d2 = dx * dx + dz * dz;
          if (d2 > (small ? R * 0.7 : R) ** 2) continue;
          const sc = list[o + 4];
          p.set(dx, list[o + 2], dz);
          q.setFromAxisAngle(UP, list[o + 3]);
          s.set(sc, sc * list[o + 5], sc);
          m4.compose(p, q, s);
          const idx = counts[kind]++;
          mesh.setMatrixAt(idx, m4);
          mesh.instanceColor.setXYZ(idx, list[o + 6], list[o + 7], list[o + 8]);
        }
      }
    }
    for (const kind of KINDS) {
      const mesh = this.meshes[kind];
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    if (this.cells.size > 700) for (const k of this.cells.keys()) if (!keep.has(k)) this.cells.delete(k);
    if (missing) { this.key = ''; this.t = 0.05; }
  }
}

let bed = null;
registerFrameHook((env, ctx, dt) => {
  if (!bed) { bed = new SeaBed(ctx.scene); if (ctx.game?.view3d) ctx.game.view3d.seabed = bed; }
  bed.update(ctx, env, dt || 1 / 60);
});
