// A Zoan's beasts in 3D, the way the anime draws them. A form's buff carries
// `look.zoan` (data/fruitForms.js ZOAN_LOOK) and the actor's view builds one
// of these with its model:
//
//  * on the body — a hybrid, still on two legs, fighting with the moves the
//    rig already plays: its own head over the human one (a leopard's for Rob
//    Lucci, Chopper's furry reindeer face under his pink hat for Heavy Point,
//    a shaggy monster's with antlers like a tree for Monster Point), claws on
//    the hands, a tail off the hips; the skin under them its fur (rosettes
//    for the leopard: mats.js uZoan) — or, for Kaido's hybrid, his own head
//    with long branched golden horns and a dragon's whiskers, blue scales
//    spreading over him, a dragon's tail and claws;
//  * in place of the body — the whole beast, moved by its own procedural
//    motion (the humanoid clips don't fit it; a technique's effects play as
//    ever): a great leopard on all fours (Lucci), a reindeer (Walk Point), the
//    Phoenix — a great bird of blue flame with a tail of gold, its wings the
//    hybrid's wing fire (flame.js PhoenixWings) — and the Azure Dragon:
//    Kaido's serpent tens of metres long, blue scales on its back and a ribbed
//    cream belly, a ragged black mane down its spine, branched golden horns,
//    whiskers, four short clawed limbs, coiling after its head along the way
//    it has come and undulating as it goes, on the ground or in the sky.
//
// In first person a whole beast isn't drawn (you look out of its head), nor a
// hybrid's head. Each frame the beast's mouth is put on the actor
// (`a._mouthAt`: see ZoanForm.mouth) for the breath and the beams to come out of.
import * as THREE from 'three';
import { toon, outlineMaterial } from '../materials.js';
import { B } from './bones.js';
import { lin } from './geom.js';
import { PhoenixWings, BackFlame } from './flame.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const INK = 0x1d130c;
/** The forms that take the body's place (the rest go on it). */
export const BEASTS = new Set(['leopard', 'walk', 'phoenix', 'dragon']);
/** How far the third-person camera stands back for each beast (× its usual distance, with the body's scale). */
export const ZOAN_CAM = { leopard: 1.05, walk: 1.0, phoenix: 1.15, dragon: 2.6, dragon_hybrid: 1.1, monster: 1.05, heavy: 1.0, leopard_hybrid: 1.0 };

// ------------------------------------------------------------------ shared pieces
const SPH = new THREE.SphereGeometry(1, 20, 14);
const CONE = new THREE.ConeGeometry(1, 1, 8); CONE.translate(0, 0.5, 0);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10); CYL.translate(0, 0.5, 0);
const TOR = new THREE.TorusGeometry(1, 0.28, 6, 14);

/** An ink outline round a part: a back-face shell `w` thick (in its parent's units), whatever its scale. */
function ink(mesh, w) {
  if (!w) return;
  const sh = new THREE.Mesh(mesh.geometry, outlineMaterial(INK));
  const s = mesh.scale;
  sh.scale.set(1 + w / Math.max(1e-3, Math.abs(s.x)), 1 + w / Math.max(1e-3, Math.abs(s.y)), 1 + w / Math.max(1e-3, Math.abs(s.z)));
  // (a cone or a cylinder grows from its foot: the shell sits a little below it)
  if (mesh.geometry === CONE || mesh.geometry === CYL) sh.position.y = -w / Math.max(1e-3, Math.abs(s.y)) * 0.5;
  sh.castShadow = false;
  mesh.add(sh);
}
/** A part: geometry, material (or colour), scale, position, rotation, outline. */
function part(parent, geo, mat, s, p = [0, 0, 0], r = [0, 0, 0], w = 0.02) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? toon(mat) : mat);
  m.scale.set(...s); m.position.set(...p); m.rotation.set(...r);
  m.castShadow = true;
  ink(m, w);
  parent.add(m);
  return m;
}
const group = (parent, p = [0, 0, 0], r = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...p); g.rotation.set(...r); parent.add(g); return g; };

// A leopard's coat: golden fur and black rosettes (cellular noise on the part's
// own surface, at its true size), or plain black spots (`dots`, the head and legs).
const SPOT_CACHE = new Map();
function spotMat(color, kind = 'rosette') {
  const key = color + kind;
  if (SPOT_CACHE.has(key)) return SPOT_CACHE.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toon(color).gradientMap });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSp = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSp;
float sh1(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec2 scell(vec3 p) {
  vec3 i = floor(p), f = fract(p); float best = 9.0, id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(sh1(i + g), sh1(i + g + 17.3), sh1(i + g + 41.7));
    float d = length(g + o * 0.8 + 0.1 - f);
    if (d < best) { best = d; id = sh1(i + g + 7.1); }
  }
  return vec2(best, id);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 c = scell(vSp * ${kind === 'dots' ? '22.0' : '13.0'});
  ${kind === 'dots'
    ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.02, 0.015), 1.0 - smoothstep(0.17, 0.21, c.x + c.y * 0.08));'
    : `float br = sh1(floor(vSp * 60.0));
  float ring = smoothstep(0.2, 0.24, c.x) * (1.0 - smoothstep(0.34, 0.38, c.x)) * step(0.3, fract(atan(vSp.y, vSp.x) * 3.0 + c.y * 5.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 0.68, 0.5), (1.0 - smoothstep(0.16, 0.2, c.x)) * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.02, 0.015), ring);`}
}`);
  };
  m.customProgramCacheKey = () => 'zoan-spots-' + kind;
  SPOT_CACHE.set(key, m);
  return m;
}

// ------------------------------------------------------------------ a tube laid out each frame
// A tapered tube along points given each frame (a tail, a whisker, the
// dragon's whole body): rings round each point, `up` keeping its belly down;
// uv-like attribute aDU = (metres along it, the way round: 0.5 underneath).
const _t = new THREE.Vector3(), _sd = new THREE.Vector3(), _nr = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _tmp = new THREE.Vector3();
const inkShellMat = (w) => {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${w.toFixed(4)};`); };
  m.customProgramCacheKey = () => 'zoan-ink-' + w.toFixed(4);
  return m;
};
class Tube {
  constructor(N, M, mat, w = 0.02) {
    this.N = N; this.M = M;
    const n = N * (M + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3); this.du = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('aDU', new THREE.BufferAttribute(this.du, 2));
    const idx = [];
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + M + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    if (w) { this.ink = new THREE.Mesh(g, inkShellMat(w)); this.ink.frustumCulled = false; this.mesh.add(this.ink); }
    this.side = new THREE.Vector3(0, 0, 1);
    // (each ring's frame, kept for whatever rides the tube: limbs, the mane)
    this.P = Array.from({ length: N }, () => new THREE.Vector3());
    this.T = Array.from({ length: N }, () => new THREE.Vector3());
    this.S = Array.from({ length: N }, () => new THREE.Vector3());
    this.U = Array.from({ length: N }, () => new THREE.Vector3());
    this.R = new Float32Array(N);
  }
  /** pts: N Vector3s, rad(i): ring radius, s0: metres at the first ring. */
  set(pts, rad, s0 = 0) {
    const { N, M, pos, nor, du } = this;
    let along = s0;
    let side = this.side;
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      _t.subVectors(b, a); if (_t.lengthSq() < 1e-10) _t.set(1, 0, 0); _t.normalize();
      _sd.crossVectors(_t, _up);
      if (_sd.lengthSq() < 0.02) _sd.copy(side); // (straight up or down: the last ring's side kept)
      _sd.normalize(); side = _sd;
      _nr.crossVectors(_sd, _t).normalize();
      if (i > 0) along += pts[i].distanceTo(pts[i - 1]);
      const r = rad(i);
      this.P[i].copy(pts[i]); this.T[i].copy(_t); this.S[i].copy(_sd); this.U[i].copy(_nr); this.R[i] = r;
      for (let j = 0; j <= M; j++) {
        const th = (j / M) * TAU, c = Math.cos(th), sn = Math.sin(th);
        const k = (i * (M + 1) + j);
        const nx = _nr.x * c + _sd.x * sn, ny = _nr.y * c + _sd.y * sn, nz = _nr.z * c + _sd.z * sn;
        pos[k * 3] = pts[i].x + nx * r; pos[k * 3 + 1] = pts[i].y + ny * r; pos[k * 3 + 2] = pts[i].z + nz * r;
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
        du[k * 2] = along; du[k * 2 + 1] = j / M;
      }
    }
    this.side.copy(side);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.aDU.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); this.ink?.material.dispose(); }
}

// The Azure Dragon's hide on a tube: the back bright blue under rows of darker
// wave-edged scales, a row of dark dots where it meets the belly, the belly a
// broad cream band with dark ribs across it the whole way down.
function dragonHideMat(o = {}) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon('#ffffff').gradientMap });
  const belly = (o.belly ?? 0.17).toFixed(3);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aDU;\nvarying vec2 vDU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDU = aDU;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDU;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float s = vDU.x, v = vDU.y;
  float b = abs(v - 0.5);
  vec3 back = vec3(0.13, 0.42, 0.85), backDk = vec3(0.04, 0.17, 0.5), dotC = vec3(0.03, 0.07, 0.2);
  vec3 cream = vec3(0.86, 0.74, 0.5), rib = vec3(0.32, 0.22, 0.1);
  // scales: rows down the body, each a round edge toward the tail
  vec2 q = vec2(s * ${(o.rows ?? 2.6).toFixed(2)}, v * ${(o.round ?? 14).toFixed(1)});
  float row = floor(q.x);
  float cx = fract(q.y + row * 0.5) - 0.5;
  float edge = fract(q.x) + cx * cx * 2.2;
  vec3 col = mix(back, backDk, smoothstep(0.8, 0.9, edge));
  col = mix(col, back * 1.15, smoothstep(0.25, 0.0, edge) * 0.4);
  // the dots along the belly's edge
  float dv = abs(b - (${belly} + 0.045)) * ${(o.round ?? 14).toFixed(1)} * 0.9;
  float ds = fract(s * ${(o.rows ?? 2.6).toFixed(2)} * 0.6) - 0.5;
  col = mix(col, dotC, 1.0 - smoothstep(0.18, 0.24, length(vec2(ds * 1.6, dv))));
  // the belly: cream, ribbed across
  float bel = 1.0 - smoothstep(${belly} - 0.008, ${belly} + 0.008, b);
  float r = abs(fract(s * ${(o.ribs ?? 1.6).toFixed(2)}) - 0.5);
  vec3 bc = mix(cream, rib, 1.0 - smoothstep(0.03, 0.06, r));
  col = mix(col, bc, bel);
  diffuseColor.rgb *= col;
}`);
  };
  m.customProgramCacheKey = () => 'zoan-dragonhide-' + belly;
  return m;
}

// ------------------------------------------------------------------ heads
// Each head is built in units of its own size (about 1 across), facing +x,
// +y up, +z its right; `mouth` is an anchor at its mouth.

/** A leopard's head: golden, spotted, a white muzzle and chin, round ears, slit yellow eyes, whiskers. */
function leopardHead(parent, fur = '#e9a845') {
  const h = group(parent);
  const F = spotMat(fur, 'dots'), cream = '#f6ead2';
  part(h, SPH, F, [0.82, 0.74, 0.78], [0, 0.08, 0], [0, 0, 0], 0.05);
  // the face: a broad short muzzle, puffed cheeks
  part(h, SPH, F, [0.5, 0.42, 0.58], [0.5, -0.2, 0], [0, 0, -0.1], 0.04);
  for (const z of [-1, 1]) part(h, SPH, cream, [0.36, 0.3, 0.3], [0.78, -0.3, z * 0.2], [0, 0, 0], 0.03);
  part(h, SPH, cream, [0.36, 0.2, 0.34], [0.62, -0.56, 0], [0, 0, 0.15], 0.03);
  // the nose: a dark wedge on the muzzle's ridge
  part(h, SPH, '#4a2a22', [0.13, 0.09, 0.16], [1.06, -0.1, 0], [0, 0, -0.3], 0.02);
  part(h, SPH, F, [0.45, 0.16, 0.2], [0.82, 0.04, 0], [0, 0, -0.35], 0);
  // mouth line and a glint of fangs
  for (const z of [-1, 1]) part(h, CONE, '#ffffff', [0.035, 0.12, 0.035], [0.95, -0.42, z * 0.1], [Math.PI, 0, 0], 0.012);
  // eyes: yellow, slit, under a heavy dark brow
  for (const z of [-1, 1]) {
    part(h, SPH, '#ffd54f', [0.1, 0.11, 0.16], [0.7, 0.14, z * 0.33], [0, z * -0.5, 0.2], 0.025);
    part(h, SPH, '#111111', [0.04, 0.09, 0.05], [0.79, 0.14, z * 0.35], [0, z * -0.5, 0], 0);
    part(h, SPH, '#3a2412', [0.2, 0.05, 0.14], [0.7, 0.27, z * 0.32], [z * 0.25, z * -0.4, -0.15], 0.015);
    // ears: round, set wide, dark behind with a pale inside
    const e = group(h, [-0.18, 0.62, z * 0.52], [z * -0.5, 0, -0.15]);
    part(e, SPH, '#2a1a10', [0.12, 0.26, 0.24], [0, 0.1, 0], [0, 0, 0], 0.025);
    part(e, SPH, '#f3d9b5', [0.08, 0.18, 0.16], [0.05, 0.1, 0], [0, 0, 0], 0);
    // whiskers
    for (let k = 0; k < 3; k++) {
      const wk = part(h, CYL, '#ffffff', [0.008, 0.55, 0.008], [0.86, -0.3 - k * 0.05, z * 0.32], [z * (1.35 + k * 0.12), 0, 0.25 - k * 0.15], 0);
      wk.castShadow = false;
    }
  }
  // a pale throat ruff below
  part(h, SPH, cream, [0.5, 0.36, 0.56], [0.05, -0.55, 0], [0, 0, 0], 0.03);
  h.userData.mouth = group(h, [1.0, -0.42, 0]);
  return h;
}

/** Antlers: a main beam each side, sweeping up and out, with tines (`big`: Monster Point's tree). */
function antlers(parent, col, big = false, base = [0, 0.55, 0.32]) {
  const k = big ? 1.8 : 1;
  for (const z of [-1, 1]) {
    const g = group(parent, [base[0], base[1], z * base[2]], [z * -0.55, 0, -0.25]);
    const beam = (p, r, len, thick) => part(g, CYL, col, [thick, len, thick], p, r, 0.025);
    beam([0, 0, 0], [0, 0, 0], 0.55 * k, 0.07 * k);
    beam([0, 0.5 * k, 0], [z * -0.5, 0, -0.5], 0.5 * k, 0.06 * k);
    beam([0, 0.3 * k, 0], [0, 0, 0.9], 0.35 * k, 0.05 * k);
    beam([-0.2 * k, 0.88 * k, z * 0.22 * k], [z * -0.2, 0, 0.5], 0.35 * k, 0.045 * k);
    beam([-0.2 * k, 0.88 * k, z * 0.22 * k], [z * -0.6, 0, -0.6], 0.32 * k, 0.045 * k);
    if (big) { beam([0, 0.2 * k, 0], [z * -1.1, 0, 0.3], 0.4 * k, 0.05 * k); beam([-0.35 * k, 0.75 * k, 0], [z * 0.5, 0, -1.1], 0.35 * k, 0.045 * k); }
  }
}
/** Chopper's pink top hat with its white cross, the antlers coming out through it. */
function chopperHat(parent, y = 0.62) {
  const g = group(parent, [-0.05, y, 0], [0, 0, -0.12]);
  part(g, CYL, '#f06292', [0.78, 0.05, 0.78], [0, 0, 0], [0, 0, 0], 0.03);
  part(g, CYL, '#f48fb1', [0.52, 0.62, 0.52], [0, 0.04, 0], [0, 0, 0], 0.03);
  part(g, CYL, '#f06292', [0.535, 0.1, 0.535], [0, 0.1, 0], [0, 0, 0], 0);
  // (the cross on its front)
  for (const r of [0.7, -0.7]) part(g, CYL, '#ffffff', [0.05, 0.36, 0.03], [0.5, 0.18, 0], [r, 0, 0], 0);
  return g;
}
/** Chopper's furry face: brown, a pale short muzzle, the blue nose, round black eyes, ears out sideways. */
function reindeerFace(parent, o = {}) {
  const h = group(parent);
  const fur = o.fur || '#8a5a3c', pale = o.pale || '#d9b48c';
  part(h, SPH, fur, [0.8, 0.78, 0.78], [0, 0.06, 0], [0, 0, 0], 0.05);
  part(h, SPH, pale, [0.42, 0.34, 0.46], [0.6, -0.26, 0], [0, 0, -0.1], 0.035);
  part(h, SPH, '#3d74e0', [0.14, 0.11, 0.16], [0.98, -0.14, 0], [0, 0, 0], 0.025);
  for (const z of [-1, 1]) {
    if (o.monster) {
      part(h, SPH, '#ffffff', [0.08, 0.1, 0.12], [0.66, 0.2, z * 0.3], [0, z * -0.4, 0], 0.025);
      part(h, SPH, '#c62828', [0.03, 0.04, 0.05], [0.73, 0.2, z * 0.31], [0, 0, 0], 0);
      part(h, SPH, '#2a160c', [0.22, 0.06, 0.12], [0.66, 0.33, z * 0.28], [z * 0.4, z * -0.4, -0.35], 0.015);
      part(h, CONE, '#ffffff', [0.05, 0.2, 0.05], [0.82, -0.44, z * 0.16], [Math.PI, 0, 0], 0.012);
    } else {
      part(h, SPH, '#141414', [0.1, 0.14, 0.12], [0.66, 0.18, z * 0.3], [0, z * -0.4, 0], 0.02);
      part(h, SPH, '#ffffff', [0.035, 0.045, 0.04], [0.73, 0.23, z * 0.31], [0, 0, 0], 0);
    }
    // ears out sideways, leaf-shaped
    const e = group(h, [-0.1, 0.32, z * 0.7], [z * -1.25, 0, 0]);
    part(e, SPH, fur, [0.12, 0.3, 0.07], [0, 0.18, 0], [0, 0, 0], 0.02);
    part(e, SPH, '#f3c7b0', [0.08, 0.2, 0.03], [0.035, 0.18, 0], [0, 0, 0], 0);
  }
  part(h, SPH, '#3a2014', [0.22, 0.04, 0.3], [0.78, -0.42, 0], [0, 0, 0.2], 0);
  if (o.monster) {
    // wild shaggy fur all round the head
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      part(h, CONE, fur, [0.16, 0.5, 0.16], [-0.25 + Math.cos(a) * 0.2, 0.05 + Math.sin(a) * 0.55, Math.sin(a * 2) * 0.1 + (i % 2 ? 0.5 : -0.5)], [Math.sin(a) * 0.6 + (i % 2 ? -0.8 : 0.8), 0, Math.PI / 2 + Math.cos(a) * 0.9], 0.02);
    }
    antlers(h, '#c8a46a', true, [-0.1, 0.55, 0.3]);
  } else {
    antlers(h, '#d4ac72', false, [-0.05, 0.6, 0.36]);
    if (o.hat !== false) chopperHat(h);
  }
  h.userData.mouth = group(h, [0.85, -0.38, 0]);
  return h;
}

/** Kaido's horns: long, golden, branched like antlers, sweeping up and back off the brow. */
function dragonHorns(parent, k = 1, col = '#d9b25f') {
  const out = [];
  for (const z of [-1, 1]) {
    const g = group(parent, [0.1 * k, 0.45 * k, z * 0.26 * k], [z * -0.35, 0, 0.5]);
    const seg = (p, r, len, th) => part(g, CYL, col, [th * k, len * k, th * k], p.map((x) => x * k), r, 0.02 * k);
    seg([0, 0, 0], [0, 0, 0], 0.7, 0.08);
    seg([0, 0.65, 0], [z * -0.15, 0, 0.55], 0.75, 0.065);
    seg([-0.38, 1.28, 0], [z * -0.1, 0, 0.95], 0.6, 0.05);
    // tines up off the beam
    seg([0, 0.4, 0], [z * -0.2, 0, -0.45], 0.42, 0.045);
    seg([-0.22, 1.0, 0], [z * -0.35, 0, -0.25], 0.36, 0.04);
    seg([-0.6, 1.5, 0], [z * 0.2, 0, 0.1], 0.3, 0.035);
    out.push(g);
  }
  return out;
}

// ------------------------------------------------------------------ the beasts
/** A beast on four legs: a leopard, or a reindeer (Walk Point). Built in metres at scale 1, standing on y = 0, facing +x. */
class Quadruped {
  constructor(parent, kind) {
    this.kind = kind;
    const deer = kind === 'walk';
    this.H = deer ? 0.78 : 0.62; // (the body's height)
    const root = this.group = group(parent);
    const body = this.body = group(root, [0, this.H, 0]);
    const fur = deer ? '#8a5a3c' : '#e9a845';
    const F = deer ? toon(fur) : spotMat(fur), Fd = deer ? toon(fur) : spotMat(fur, 'dots');
    const belly = deer ? '#d9b48c' : '#f6ead2';
    const w = 0.025;
    if (deer) {
      part(body, SPH, F, [0.36, 0.3, 0.26], [0.3, 0.03, 0], [0, 0, 0], w);
      part(body, SPH, F, [0.33, 0.29, 0.25], [-0.3, 0.04, 0], [0, 0, 0], w);
      part(body, SPH, belly, [0.42, 0.2, 0.2], [0, -0.1, 0], [0, 0, 0], w);
      part(body, SPH, F, [0.1, 0.1, 0.1], [-0.6, 0.12, 0], [0, 0, 0.6], w); // (a stub of a tail)
      part(body, SPH, '#f3e3cc', [0.06, 0.06, 0.07], [-0.66, 0.1, 0], [0, 0, 0], 0.015);
      // a neck held up, and the head on it
      part(body, SPH, F, [0.15, 0.32, 0.15], [0.5, 0.3, 0], [0, 0, -0.45], w);
      this.head = group(body, [0.66, 0.62, 0], [0, 0, 0]);
      const hd = reindeerFace(this.head, {});
      hd.scale.setScalar(0.27);
      this.mouthAt = hd.userData.mouth;
    } else {
      part(body, SPH, F, [0.38, 0.33, 0.28], [0.36, 0.0, 0], [0, 0, 0], w);
      part(body, SPH, F, [0.35, 0.3, 0.26], [-0.36, 0.03, 0], [0, 0, 0], w);
      part(body, SPH, F, [0.55, 0.26, 0.24], [0, 0.0, 0], [0, 0, 0], w);
      part(body, SPH, belly, [0.5, 0.15, 0.18], [0.05, -0.15, 0], [0, 0, 0], 0);
      // shoulder blades riding up as it walks
      this.blades = [-1, 1].map((z) => part(body, SPH, F, [0.2, 0.16, 0.1], [0.42, 0.18, z * 0.18], [0, 0, -0.3], 0));
      part(body, SPH, F, [0.3, 0.2, 0.19], [0.62, 0.16, 0], [0, 0, 0.55], w);
      this.head = group(body, [0.8, 0.28, 0], [0, 0, 0]);
      const hd = leopardHead(this.head);
      hd.scale.setScalar(0.27);
      this.mouthAt = hd.userData.mouth;
    }
    // legs: [front?, side] — a joint, the upper leg, a knee (a hock behind), the lower leg and a paw or a hoof
    this.legs = [];
    for (const [front, z] of [[1, -1], [1, 1], [0, -1], [0, 1]]) {
      const x = front ? (deer ? 0.34 : 0.4) : (deer ? -0.36 : -0.4);
      const j = group(body, [x, -0.04, z * (deer ? 0.14 : 0.17)]);
      const L1 = this.H * (front ? 0.5 : 0.52), L2 = this.H * 0.5;
      const th = deer ? 0.07 : 0.11;
      part(j, SPH, front ? F : F, [th * (front ? 1.15 : 1.4), L1 * 0.62, th * 1.05], [front ? 0 : -0.04, -L1 * 0.42, 0], [0, 0, 0], w);
      const knee = group(j, [0, -L1, 0]);
      part(knee, SPH, Fd, [th * 0.72, L2 * 0.55, th * 0.72], [0, -L2 * 0.48, 0], [0, 0, 0], w);
      if (deer) part(knee, CYL, '#2b1a10', [0.05, 0.08, 0.05], [0, -L2 - 0.02, 0], [0, 0, 0], 0.015);
      else part(knee, SPH, Fd, [0.1, 0.055, 0.085], [0.04, -L2 + 0.01, 0], [0, 0, 0], 0.02);
      this.legs.push({ j, knee, front, z, L1, L2 });
    }
    // the tail: long and spotted, carried low and curling up at the tip
    if (!deer) { this.tail = new Tube(14, 8, Fd, 0.018); body.add(this.tail.mesh); this.tailPts = Array.from({ length: 14 }, () => new THREE.Vector3()); }
    this.phase = 0; this.lunge = 0;
  }

  update(a, t, dt, sp, act) {
    const deer = this.kind === 'walk';
    const moving = sp > 0.4;
    const run = clamp(sp / 7, 0, 1);
    // stride: a walk (one foot at a time) easing into a bounding gallop (forelegs together, then the hind)
    this.phase = (this.phase + dt * (moving ? 0.8 + sp * (deer ? 0.32 : 0.36) : 0)) % 1;
    const gal = run > 0.55 && !deer;
    const off = gal ? [0, 0.08, 0.5, 0.58] : [0.25, 0.75, 0, 0.5];
    this.moveK = (this.moveK || 0) + ((moving ? 1 : 0) - (this.moveK || 0)) * Math.min(1, dt * 8);
    const mk = this.moveK;
    const amp = (0.35 + 0.35 * run) * mk;
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i], ph = (this.phase + off[i]) * TAU;
      const sw = Math.sin(ph) * amp, lift = Math.max(0, Math.cos(ph)) * mk;
      L.j.rotation.z = sw;
      L.knee.rotation.z = (L.front ? -1 : 1) * (0.12 + lift * (0.7 + run * 0.4));
    }
    // the body: a bob with each stride, the spine flexing in a gallop, a crouch to spring
    let pitch = gal ? Math.sin(this.phase * TAU) * 0.08 : 0, y = this.H + Math.abs(Math.sin(this.phase * TAU * 2)) * 0.03 * mk, x = 0;
    // a technique: rear back as it winds up (forepaws up for a claw), then lunge into it
    if (act) {
      const wnd = act.def?.windup ?? 0.2, tt = act.t || 0;
      const up = smooth(0, Math.max(0.05, wnd), tt), go = smooth(wnd, wnd + 0.12, tt) * (1 - smooth(wnd + 0.2, wnd + 0.55, tt));
      pitch += up * (1 - go) * 0.45 - go * 0.25;
      x += go * 0.35 - up * (1 - go) * 0.1;
      y += up * (1 - go) * 0.12;
      for (const L of this.legs) if (L.front) { L.j.rotation.z += up * (1 - go) * 1.1 + go * 1.3; L.knee.rotation.z -= up * (1 - go) * 0.6; }
      this.lunge = go;
    } else this.lunge = 0;
    // airborne (a leap, a pounce): legs stretched out fore and aft
    if ((a.z || 0) > 0.15) { for (const L of this.legs) { L.j.rotation.z = L.front ? 0.9 : -0.8; L.knee.rotation.z = L.front ? -0.2 : 0.3; } }
    this.body.position.set(x, y, 0);
    this.body.rotation.z = pitch;
    this.head.rotation.z = -pitch * 0.7 + (act ? -this.lunge * 0.2 : Math.sin(t * 1.3) * 0.04);
    // knocked flat: rolled over onto its side
    const down = a.state === 'knocked' || a.state === 'dead';
    this.group.rotation.x = down ? 1.35 : 0;
    this.group.position.y = down ? 0.25 : 0;
    if (this.tail) {
      const P = this.tailPts, n = P.length;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        // (out behind, sagging, then up at the tip; streaming level at a run; swishing side to side)
        const len = 0.95 * u;
        const droop = (1 - run * 0.7) * (Math.sin(u * 2.6) * 0.42) - u * u * 0.35 * (1 - run);
        P[i].set(-0.62 - len * (0.85 + run * 0.15), 0.08 - droop, Math.sin(t * 2.2 - u * 3) * 0.18 * u + Math.sin(t * 0.7) * 0.05 * u);
      }
      this.tail.set(P, (i) => 0.05 * (1 - i / (n - 1) * 0.55));
    }
  }
}

/** The Phoenix: a great bird of blue flame, gold at the tail and crest. Metres at scale 1, standing on y = 0, facing +x. */
class Phoenix {
  constructor(parent, seed) {
    this.group = group(parent);
    this.body = group(this.group, [0, 1.0, 0]);
    const blue = toon('#36c3ef', { emissive: '#0b4f9e' }), pale = toon('#bff3ff', { emissive: '#2a8fc0' }), gold = toon('#ffcd3c', { emissive: '#a05a00' });
    part(this.body, SPH, blue, [0.48, 0.3, 0.3], [0, 0, 0], [0, 0, 0], 0.025);
    part(this.body, SPH, pale, [0.34, 0.22, 0.22], [0.16, -0.06, 0], [0, 0, 0], 0);
    // neck and head
    part(this.body, SPH, blue, [0.18, 0.3, 0.16], [0.42, 0.2, 0], [0, 0, -0.6], 0.02);
    this.head = group(this.body, [0.62, 0.42, 0]);
    part(this.head, SPH, blue, [0.2, 0.18, 0.17], [0, 0, 0], [0, 0, 0], 0.02);
    part(this.head, CONE, gold, [0.07, 0.26, 0.06], [0.14, -0.03, 0], [0, 0, -Math.PI / 2 - 0.25], 0.015);
    for (const z of [-1, 1]) {
      part(this.head, SPH, '#ffffff', [0.05, 0.04, 0.03], [0.11, 0.05, z * 0.13], [0, 0, 0], 0.01);
      part(this.head, SPH, '#0a1a3a', [0.025, 0.03, 0.02], [0.13, 0.05, z * 0.145], [0, 0, 0], 0);
    }
    this.mouthAt = group(this.head, [0.36, -0.05, 0]);
    // talons, folded up in flight
    this.legs = [-1, 1].map((z) => {
      const g = group(this.body, [0.05, -0.22, z * 0.12]);
      part(g, CYL, gold, [0.03, 0.45, 0.03], [0, -0.45, 0], [0, 0, 0], 0.012);
      for (const r of [-0.6, 0, 0.6]) part(g, CONE, gold, [0.02, 0.16, 0.02], [0, -0.45, 0], [r, 0, -1.4], 0.008);
      return g;
    });
    const BLUE = { uRim: '#1673c9', uMid: '#2fc8ee', uHot: '#7fe8fb', uCore: '#d9fbff' };
    const GOLD = { uRim: '#d86f00', uMid: '#ffb72e', uHot: '#ffe27a', uCore: '#fff8d8' };
    // the crest, flames over the back and the tail's gold
    this.flames = [
      { f: new BackFlame(seed + 1, GOLD, '#ffc04d'), at: this.head, p: [-0.06, 0.12, 0], size: 0.45 },
      { f: new BackFlame(seed + 2, BLUE, '#4fc3f7'), at: this.body, p: [-0.05, 0.2, 0], size: 0.7 },
      { f: new BackFlame(seed + 3, BLUE, '#4fc3f7'), at: this.body, p: [0.25, 0.18, 0], size: 0.5 },
      { f: new BackFlame(seed + 4, GOLD, '#ffc04d'), at: this.body, p: [-0.5, 0.05, 0], size: 0.6 },
    ];
    for (const F of this.flames) { F.f.group.position.set(...F.p); F.at.add(F.f.group); }
    this.wings = new PhoenixWings(seed);
    this.body.add(this.wings.group);
    // the synthetic arms the wings are laid along: shoulders, elbows, wrists (the body's frame)
    this.rig = { S: [new THREE.Vector3(), new THREE.Vector3()], J: [new THREE.Vector3(), new THREE.Vector3()], E: [new THREE.Vector3(), new THREE.Vector3()], hip: new THREE.Vector3(-0.35, -0.02, 0), qChest: new THREE.Quaternion() };
    this.dims = { Bk: 1.3, chestLen: 0.2 };
    this.trail = new THREE.Vector3(-1, 0, 0);
    this.flap = 0;
  }

  update(a, t, dt, sp, act) {
    const fly = !!a.flying || (a.z || 0) > 0.3;
    this.flyK = (this.flyK || 0) + ((fly ? 1 : 0) - (this.flyK || 0)) * Math.min(1, dt * 5);
    const fk = this.flyK;
    // flying: laid out level, beating; on the ground: upright on its talons, wings half spread and stirring
    this.flap += dt * (fly ? 5.5 - Math.min(2.5, sp * 0.15) : 1.8);
    const beat = Math.sin(this.flap) * (0.25 + 0.55 * fk);
    this.body.position.y = 1.0 * (1 - fk) + 0.5 * fk + Math.sin(this.flap) * 0.06 * fk;
    this.body.rotation.z = (1 - fk) * 0.55 + fk * (-(a.flightClimb || 0) * 0.04);
    this.head.rotation.z = -(1 - fk) * 0.45;
    for (const L of this.legs) L.rotation.z = fk * 1.25;
    let reach = 1;
    if (act) {
      // a technique: wings flung wide and the body thrust at it
      const wnd = act.def?.windup ?? 0.2, tt = act.t || 0;
      const go = smooth(wnd * 0.5, wnd + 0.1, tt) * (1 - smooth(wnd + 0.25, wnd + 0.6, tt));
      this.body.position.x = go * 0.3;
      reach = 1 + go * 0.25;
    } else this.body.position.x = 0;
    const R = this.rig;
    for (let s = 0; s < 2; s++) {
      const z = s === 0 ? 1 : -1;
      const up = beat, sw = 0.15;
      R.S[s].set(0.08, 0.12, z * 0.2);
      R.J[s].set(0.08 - sw * 0.5, 0.12 + Math.sin(up) * 0.6, z * (0.2 + Math.cos(up) * 0.6 * reach));
      R.E[s].set(0.0 - sw, 0.12 + Math.sin(up * 1.3) * 1.25, z * (0.2 + Math.cos(up * 1.3) * 1.3 * reach));
    }
    this.trail.set(-1, -0.15 + 0.1 * fk, 0).normalize();
    this.wings.update(t, dt, R, this.dims, this.trail, true, false);
    for (const F of this.flames) F.f.update(t, dt, F.size, _tmp.set(-0.15 - sp * 0.03, 0, 0), true);
    const down = a.state === 'knocked' || a.state === 'dead';
    this.group.rotation.x = down ? 1.2 : 0;
  }
  dispose() { this.wings.dispose(); for (const F of this.flames) F.f.dispose(); }
}

// ------------------------------------------------------------------ the Azure Dragon
const DN = 96, DM = 18, DL = 24; // rings, round each, and its length (metres at scale 1)
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _e0 = new THREE.Euler();
/** Kaido's dragon: rides the root (not turned with the facing) — its body lies along the way its head has come. */
class Dragon {
  constructor(parent) {
    this.group = group(parent);
    this.hide = dragonHideMat();
    this.tube = new Tube(DN, DM, this.hide, 0.045);
    this.group.add(this.tube.mesh);
    this.pts = Array.from({ length: DN }, () => new THREE.Vector3());
    this.trail = []; // world points the head has passed: { x, y, h }
    this.head = this.buildHead();
    this.group.add(this.head);
    this.limbs = [0.09, 0.42].flatMap((u) => [-1, 1].map((z) => this.buildLimb(u, z)));
    // the mane down the spine: ragged black flames, rebuilt each frame on the body's top
    const NF = 70;
    this.NF = NF;
    const g = new THREE.BufferGeometry();
    this.manePos = new Float32Array(NF * 5 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.manePos, 3));
    const idx = [];
    for (let i = 0; i < NF; i++) { const b = i * 5; idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b + 1, b + 4, b + 2); }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mane = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0c0a12, side: THREE.DoubleSide }));
    this.mane.frustumCulled = false; this.mane.castShadow = true;
    this.group.add(this.mane);
    this.whiskers = [-1, 1].map(() => { const w = new Tube(10, 5, toon('#e8d9a8'), 0.012); this.group.add(w.mesh); return { tube: w, pts: Array.from({ length: 10 }, () => new THREE.Vector3()) }; });
    this.flyK = 0; this.t0 = null;
  }

  buildHead() {
    const h = new THREE.Group();
    const blue = toon('#2f86dc'), blueDk = toon('#1c5fae'), cream = toon('#e6d3a2'), w = 0.035;
    // skull and the long snout, the nose pad at its end
    part(h, SPH, blue, [0.62, 0.42, 0.5], [0, 0.12, 0], [0, 0, 0], w);
    part(h, SPH, blue, [0.72, 0.24, 0.36], [0.72, 0.02, 0], [0, 0, -0.06], w);
    part(h, SPH, blueDk, [0.26, 0.16, 0.3], [1.38, 0.1, 0], [0, 0, 0], w);
    for (const z of [-1, 1]) part(h, SPH, '#0b1830', [0.05, 0.04, 0.06], [1.6, 0.12, z * 0.12], [0, 0, 0], 0);
    // a ridge of scales up the snout
    for (let i = 0; i < 4; i++) part(h, SPH, blueDk, [0.16, 0.06, 0.12], [1.15 - i * 0.24, 0.22 + i * 0.04, 0], [0, 0, -0.1], 0.015);
    // the upper fangs along the jaw
    for (let i = 0; i < 5; i++) for (const z of [-1, 1]) part(h, CONE, '#ffffff', [0.04, 0.16 - i * 0.015, 0.04], [1.38 - i * 0.2, -0.16, z * (0.26 - i * 0.008)], [Math.PI, 0, 0], 0.012);
    // the lower jaw, hinged under the ear: cream underneath, fangs up, a pink tongue
    this.jaw = group(h, [0.0, -0.12, 0]);
    part(this.jaw, SPH, blue, [0.68, 0.14, 0.32], [0.68, -0.1, 0], [0, 0, 0], w);
    part(this.jaw, SPH, cream, [0.62, 0.1, 0.27], [0.66, -0.17, 0], [0, 0, 0], 0);
    part(this.jaw, SPH, '#e57390', [0.48, 0.05, 0.16], [0.68, -0.02, 0], [0, 0, 0], 0);
    part(this.jaw, SPH, '#5a1020', [0.6, 0.04, 0.22], [0.66, -0.04, 0], [0, 0, 0], 0);
    for (let i = 0; i < 4; i++) for (const z of [-1, 1]) part(this.jaw, CONE, '#ffffff', [0.035, 0.12, 0.035], [1.2 - i * 0.2, -0.04, z * (0.24 - i * 0.01)], [0, 0, 0], 0.01);
    // the throat under it, a beard of pale scales
    part(h, SPH, cream, [0.5, 0.26, 0.4], [0.05, -0.18, 0], [0, 0, 0], 0);
    // fierce yellow eyes under heavy brows
    for (const z of [-1, 1]) {
      part(h, SPH, '#ffd21f', [0.12, 0.08, 0.06], [0.48, 0.3, z * 0.36], [0, z * -0.45, -0.15], 0.022);
      part(h, SPH, '#111111', [0.03, 0.07, 0.03], [0.53, 0.3, z * 0.385], [0, z * -0.45, 0], 0);
      part(h, SPH, blueDk, [0.28, 0.08, 0.14], [0.5, 0.42, z * 0.33], [z * 0.3, z * -0.4, -0.25], 0.02);
      // the ruff: spiky blue scales round the cheeks and the back of the head
      for (let i = 0; i < 6; i++) {
        const a = -0.9 + i * 0.42;
        part(h, CONE, i % 2 ? blueDk : blue, [0.1, 0.48, 0.05], [-0.15 + Math.sin(a) * 0.05, 0.08 + Math.sin(a) * 0.3, z * (0.42 + Math.cos(a) * 0.05)], [z * (1.2 + Math.sin(a) * 0.3), 0, Math.PI / 2 + 0.5 + a * 0.6], 0.02);
      }
    }
    // the black mane flaring round the head and the neck
    for (let i = 0; i < 11; i++) {
      const a = (i / 10 - 0.5) * 2.8;
      part(h, CONE, '#0c0a12', [0.12, 0.75 + (i % 3) * 0.2, 0.04], [-0.35, 0.2 + Math.cos(a) * 0.3, Math.sin(a) * 0.35], [Math.sin(a) * 1.2, 0, Math.PI / 2 + 0.6 + Math.cos(a) * 0.3], 0);
    }
    dragonHorns(h, 1);
    h.userData.mouth = this.mouthAt = group(h, [1.45, -0.12, 0]);
    this.whiskerRoot = [-1, 1].map((z) => group(h, [1.3, -0.02, z * 0.28]));
    return h;
  }

  buildLimb(u, z) {
    const g = new THREE.Group();
    const blue = toon('#2f86dc'), pale = toon('#a8d8f5');
    const up = group(g);
    part(up, SPH, blue, [0.17, 0.34, 0.17], [0, -0.28, 0], [0, 0, 0], 0.025);
    // purple tufts at the elbow
    for (let i = 0; i < 3; i++) part(up, CONE, '#6e4a9e', [0.06, 0.28, 0.04], [-0.06, -0.55, (i - 1) * 0.06], [(i - 1) * 0.4, 0, Math.PI / 2 + 0.6], 0.012);
    const lo = group(up, [0, -0.58, 0]);
    part(lo, SPH, blue, [0.13, 0.3, 0.13], [0, -0.24, 0], [0, 0, 0], 0.025);
    // the wrist's dark spiked bracelet
    part(lo, TOR, '#1a1a24', [0.14, 0.14, 0.14], [0, -0.44, 0], [Math.PI / 2, 0, 0], 0.012);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; part(lo, CONE, '#2a2a36', [0.025, 0.1, 0.025], [Math.cos(a) * 0.17, -0.44, Math.sin(a) * 0.17], [Math.sin(a) * 1.57, 0, -Math.cos(a) * 1.57], 0); }
    // a big pale three-clawed hand
    const hand = group(lo, [0, -0.55, 0]);
    part(hand, SPH, pale, [0.18, 0.1, 0.17], [0.05, -0.04, 0], [0, 0, 0], 0.02);
    for (const c of [-1, 0, 1]) part(hand, CONE, '#eef6ff', [0.035, 0.26, 0.035], [0.18, -0.08, c * 0.1], [c * 0.3, 0, -Math.PI / 2 - 0.5], 0.012);
    this.group.add(g);
    return { g, up, lo, u, z };
  }

  /** The way the head has come, in the world: it starts out lying coiled behind. */
  coil(a, w, rootY, s, f) {
    this.trail.length = 0;
    const c = Math.cos(f), sn = Math.sin(f);
    for (let i = 0; i <= 70; i++) {
      const d = i * 0.42;
      // (back from the head in loose loops, sinking toward the ground)
      const lx = -d * 0.6, lz = Math.sin(d * 0.32) * 3.2 * Math.min(1, d / 5), ly = Math.max(0.55, 1.6 - d * 0.07);
      this.trail.push({ x: a.x + (lx * c - lz * sn) * s, y: a.y + (lx * sn + lz * c) * s, h: rootY + ly * s });
    }
  }

  update(a, view, env, ctx, t, dt, sp, act) {
    const w = ctx.world, root = view.root, s = root.scale.x || 1;
    const f = view.visF ?? a.facing ?? 0, c = Math.cos(f), sn = Math.sin(f);
    const fly = !!a.flying;
    this.flyK += ((fly ? 1 : 0) - this.flyK) * Math.min(1, dt * 3);
    const fk = this.flyK;
    const rootY = root.position.y;
    // the head: a little above the ground on its cloud (or in the sky), riding where the actor is
    const h0 = 1.6 * (1 - fk) + 0.6 * fk;
    const headH = rootY + h0 * s;
    if (!this.trail.length || this.t0 === null) this.coil(a, w, rootY, s, f);
    this.t0 = t;
    // (a sudden jump — a teleport, the world's origin moving under us: lie coiled again)
    const last = this.trail[0];
    const dxw = w ? w.dx(last.x, a.x) : a.x - last.x;
    if (Math.hypot(dxw, a.y - last.y) > 25 * s) this.coil(a, w, rootY, s, f);
    else if (Math.hypot(dxw, a.y - last.y, headH - last.h) > 0.35 * s) {
      this.trail.unshift({ x: a.x, y: a.y, h: headH });
      // (no more of it than the body needs)
      let len = 0;
      for (let i = 1; i < this.trail.length; i++) {
        const A = this.trail[i - 1], Bp = this.trail[i];
        len += Math.hypot(w ? w.dx(A.x, Bp.x) : Bp.x - A.x, Bp.y - A.y, Bp.h - A.h);
        if (len > DL * s * 1.3) { this.trail.length = i + 1; break; }
      }
    }
    // the trail in the root's frame (metres at scale 1)
    const L = this.trail.map((P) => _p0.set((w ? w.dx(a.x, P.x) : P.x - a.x) / s, (P.h - rootY) / s, (P.y - a.y) / s).clone());
    // the head itself, a little forward of where the neck leaves the trail
    L.unshift(new THREE.Vector3(0, h0, 0));
    const cum = [0];
    for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + L[i].distanceTo(L[i - 1]));
    const at = (d, out) => {
      let i = 1;
      while (i < L.length - 1 && cum[i] < d) i++;
      const A = L[i - 1], Bp = L[i], seg = Math.max(1e-4, cum[i] - cum[i - 1]);
      return out.copy(A).lerp(Bp, (d - cum[i - 1]) / seg);
    };
    // undulating: a wave running down the body, side to side, and up and down in the air
    const mv = clamp(sp / 6, 0, 1);
    this.wph = (this.wph || 0) + dt * (1.2 + mv * 3.5);
    const amp = 0.35 + 0.55 * mv, ampY = (0.2 + 0.5 * mv) * (0.4 + 0.6 * fk);
    const sag = 1 - fk; // (on the ground the body lies along it, low)
    for (let i = 0; i < DN; i++) {
      const u = i / (DN - 1), d = u * DL;
      const P = at(d, this.pts[i]);
      at(Math.max(0, d - 0.5), _p1);
      _tmp.subVectors(P, _p1); _tmp.y = 0;
      if (_tmp.lengthSq() < 1e-6) _tmp.set(-c, 0, -sn); _tmp.normalize();
      const env = smooth(0, 0.12, u);
      const wv = Math.sin(d * 0.55 - this.wph) * amp * env;
      P.x += -_tmp.z * wv; P.z += _tmp.x * wv;
      P.y += Math.sin(d * 0.4 - this.wph * 0.8) * ampY * env;
      // (lying down: the body settles toward the ground past the neck, its belly on it)
      if (sag > 0.01) P.y = P.y + (Math.max(0.5, Math.min(P.y, 0.62 + 0.2 * Math.sin(d * 0.3))) - P.y) * smooth(0.04, 0.2, u) * sag;
      if (P.y < 0.4) P.y = 0.4;
    }
    // where the neck meets the head: the head's own forward way
    this.pts[0].set(0, h0, 0);
    this.tube.set(this.pts, (i) => {
      const u = i / (DN - 1);
      return (0.36 + 0.24 * smooth(0, 0.12, u)) * (1 - smooth(0.45, 1, u) * 0.88) * (1 + 0.03 * Math.sin(u * 60));
    });
    // the head: facing the actor's way, nodding with the climb, the jaw working
    let pitch = clamp((a.flightClimb || 0) * 0.04, -0.5, 0.5) + Math.sin(t * 1.1) * 0.04;
    let jaw = 0.12 + Math.max(0, Math.sin(t * 0.7)) * 0.1, thrust = 0;
    if (act) {
      const wnd = act.def?.windup ?? 0.3, tt = act.t || 0;
      const up = smooth(0, Math.max(0.05, wnd), tt), go = smooth(wnd * 0.8, wnd + 0.1, tt) * (1 - smooth(wnd + 0.4, wnd + 0.9, tt));
      pitch += up * (1 - go) * 0.4 - go * 0.15;
      jaw = Math.max(jaw, up * 0.35 + go * 0.75);
      thrust = go * 0.5 - up * (1 - go) * 0.4;
    }
    const down = a.state === 'knocked' || a.state === 'dead';
    this.head.position.set(c * (0.25 + thrust), h0 + (down ? -0.8 : 0) + 0.05, sn * (0.25 + thrust));
    this.head.rotation.set(down ? 0.9 : 0, -f, pitch, 'YXZ');
    this.head.rotation.order = 'YZX';
    this.head.rotation.set(0, -f, pitch + (down ? -0.4 : 0));
    this.jaw.rotation.z = -jaw;
    // the limbs: hung off the body's sides, paddling as it goes
    const T = this.tube;
    for (const Lb of this.limbs) {
      const i = Math.round(Lb.u * (DN - 1));
      const r = T.R[i];
      _p0.copy(T.P[i]).addScaledVector(T.S[i], Lb.z * r * 0.85).addScaledVector(T.U[i], -r * 0.35);
      Lb.g.position.copy(_p0);
      // (frame: x along the body forward, y its up, z its side)
      _p1.copy(T.T[i]).negate();
      _m4.makeBasis(_p1, T.U[i], _tmp.crossVectors(_p1, T.U[i]));
      Lb.g.quaternion.setFromRotationMatrix(_m4);
      const ph = this.wph * 1.3 + Lb.u * 6 + (Lb.z > 0 ? Math.PI : 0);
      Lb.up.rotation.set(Lb.z * (0.5 + fk * 0.2), 0, 0.6 + Math.sin(ph) * (0.25 + 0.35 * mv) + fk * 0.5);
      Lb.lo.rotation.set(0, 0, -0.9 - Math.cos(ph) * 0.2);
    }
    // the mane: a ragged black flame on every stretch of the spine, leaning back
    const mp = this.manePos;
    for (let k = 0; k < this.NF; k++) {
      const u = (k + 0.5) / this.NF * 0.97, i = Math.min(DN - 2, Math.floor(u * (DN - 1)));
      const r = T.R[i], P = T.P[i], U = T.U[i], Tg = T.T[i];
      const hgt = (0.85 - 0.6 * u) * (0.75 + 0.35 * Math.sin(k * 2.3)) + Math.sin(t * 6 + k) * 0.05;
      const half = DL / this.NF * 0.75;
      const put = (n, along, up) => {
        mp[(k * 5 + n) * 3] = P.x + U.x * (r * 0.92 + up) + Tg.x * along;
        mp[(k * 5 + n) * 3 + 1] = P.y + U.y * (r * 0.92 + up) + Tg.y * along;
        mp[(k * 5 + n) * 3 + 2] = P.z + U.z * (r * 0.92 + up) + Tg.z * along;
      };
      // (Tg points tailward: the tips lean back along it)
      put(0, -half, -0.05); put(1, half, -0.05); put(2, half * 1.6, hgt); put(3, -half * 0.3, hgt * 0.55); put(4, half * 2.2, hgt * 0.6);
    }
    this.mane.geometry.attributes.position.needsUpdate = true;
    // the whiskers: long and trailing, waving
    this.head.updateMatrixWorld(true);
    this.group.updateMatrixWorld(true);
    _m4.copy(this.group.matrixWorld).invert();
    for (let k = 0; k < 2; k++) {
      const W = this.whiskers[k], z = k ? 1 : -1;
      this.whiskerRoot[k].getWorldPosition(_p0).applyMatrix4(_m4);
      for (let i = 0; i < 10; i++) {
        const u = i / 9, d = u * 3.2;
        W.pts[i].set(_p0.x - c * d * 0.85 + (-sn * z) * (0.3 * u + Math.sin(t * 2.5 - u * 4) * 0.25 * u),
          _p0.y - d * 0.2 + Math.sin(t * 2 - u * 5) * 0.2 * u,
          _p0.z - sn * d * 0.85 + (c * z) * (0.3 * u + Math.sin(t * 2.5 - u * 4) * 0.25 * u));
      }
      W.tube.set(W.pts, (i) => 0.035 * (1 - i / 10));
    }
    this.group.visible = true;
  }
  dispose() {
    this.tube.dispose(); this.mane.geometry.dispose(); this.mane.material.dispose(); this.hide.dispose();
    for (const W of this.whiskers) W.tube.dispose();
  }
}

// ------------------------------------------------------------------ the skin
/** A Zoan's coat on the body's own skin (mats.js uZoan): a leopard's rosettes, a dragon's scales — or none. */
export function zoanSkin(m, look) {
  const u = m.fx;
  if (!u?.uZoan) return;
  if (look.spots) { const c = lin(look.skin || '#f1c9a0'); u.uZoan.value.set(c.r, c.g, c.b, 1); }
  else if (look.scales) { const c = lin(look.skin || '#f1c9a0'); u.uZoan.value.set(c.r, c.g, c.b, 2); u.uZoanB.value.copy(lin(look.scales)); }
  else u.uZoan.value.w = 0;
}

// ------------------------------------------------------------------ the form on an actor's view
const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion(), _fw = new THREE.Vector3();
export class ZoanForm {
  /** For the actor view `view` (chars3d.js ActorView) with its model `m`, as `look.zoan`. */
  constructor(view, m, look, seed = 0) {
    this.kind = look.zoan;
    this.beast = BEASTS.has(this.kind);
    this.m = m;
    this.parts = [];
    zoanSkin(m, look);
    const d = m.d, bones = m.bones;
    if (this.beast) {
      if (this.kind === 'dragon') { this.dragon = new Dragon(view.root); this.obj = this.dragon.group; }
      else if (this.kind === 'phoenix') { this.bird = new Phoenix(view.yaw, seed); this.obj = this.bird.group; }
      else { this.quad = new Quadruped(view.yaw, this.kind); this.obj = this.quad.group; }
      return;
    }
    // ---- a hybrid: its head over the human one, claws, a tail
    const hb = bones[B.head];
    const R = d.headR;
    if (this.kind === 'leopard_hybrid' || this.kind === 'heavy' || this.kind === 'monster') {
      const g = group(hb, [d.hx * 0.6, d.hc * 0.95, 0]);
      if (this.kind === 'leopard_hybrid') { leopardHead(g, look.fur); g.scale.setScalar(R * 1.3); }
      else { reindeerFace(g, { fur: look.fur, monster: this.kind === 'monster', pale: this.kind === 'monster' ? '#a07a58' : '#d9b48c' }); g.scale.setScalar(R * (this.kind === 'monster' ? 1.35 : 1.25)); }
      this.head = g; this.replaceHead = true;
      this.mouthAt = g.children[0]?.userData.mouth;
    } else if (this.kind === 'dragon_hybrid') {
      // Kaido's own head, crowned with the dragon's horns, its whiskers, and a black mane down his back
      const g = group(hb, [d.hx, d.hc, 0]);
      g.scale.setScalar(R);
      dragonHorns(g, 1.25);
      for (const z of [-1, 1]) {
        const wsk = group(g, [0.85, -0.25, z * 0.25], [z * 0.5, 0, 0]);
        for (let i = 0; i < 4; i++) part(wsk, CYL, '#141414', [0.04 - i * 0.006, 0.42, 0.04 - i * 0.006], [-i * 0.08, -i * 0.4, z * i * 0.1], [z * 0.2, 0, -0.35 - i * 0.12], 0);
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * 2.4;
        part(g, CONE, '#141414', [0.16, 1.1 + (i % 2) * 0.4, 0.07], [-0.55, 0.15 + Math.cos(a) * 0.35, Math.sin(a) * 0.55], [Math.sin(a) * 1.0, 0, Math.PI / 2 + 0.9], 0);
      }
      this.head = g;
      this.mouthAt = group(g, [0.95, -0.42, 0]);
    }
    // claws on the hands
    const clawCol = this.kind === 'dragon_hybrid' ? '#e9eef5' : this.kind === 'leopard_hybrid' ? '#f5f1e6' : '#3a2a20';
    for (const hand of [B.handR, B.handL]) {
      const g = group(bones[hand], [0.012, -0.085 * d.Am, 0]);
      for (let i = 0; i < 4; i++) part(g, CONE, clawCol, [0.011, 0.055 * (this.kind === 'heavy' ? 0.6 : 1), 0.011], [0.01, 0, (i - 1.5) * 0.019], [0, 0, Math.PI + 0.45], 0.004);
      this.parts.push(g);
    }
    // the tail
    if (this.kind === 'leopard_hybrid' || this.kind === 'dragon_hybrid') {
      const dragon = this.kind === 'dragon_hybrid';
      const n = dragon ? 22 : 16;
      this.tail = new Tube(n, dragon ? 14 : 8, dragon ? dragonHideMat({ rows: 9, round: 10, ribs: 7, belly: 0.2 }) : spotMat(look.fur || '#e9a845', 'dots'), 0.012);
      this.tailPts = Array.from({ length: n }, () => new THREE.Vector3());
      bones[B.hips].add(this.tail.mesh);
      this.tailLen = dragon ? 1.6 : 1.05; this.tailR = dragon ? 0.11 : 0.04;
      if (dragon) {
        // (its black mane: a row of flames along the top)
        this.tailFins = Array.from({ length: 8 }, () => part(bones[B.hips], CONE, '#0c0a12', [0.05, 0.22, 0.02], [0, 0, 0], [0, 0, 0], 0));
      }
    }
    // Monster Point: shaggy fur on the shoulders, the forearms and the shins
    if (this.kind === 'monster' || this.kind === 'heavy') {
      const fur = look.fur || '#6e4a35';
      const tuft = (bone, p, r, sc) => this.parts.push(part(bones[bone], CONE, fur, sc, p, r, 0.006));
      const Bk = d.Bk, big = this.kind === 'monster' ? 1.6 : 1;
      for (const z of [-1, 1]) {
        for (let i = 0; i < 4; i++) tuft(B.chest, [-0.04 + i * 0.03, d.chestLen - 0.05, z * (0.16 + i * 0.04) * Bk], [z * (0.9 + i * 0.2), 0, 0.3 - i * 0.3], [0.04 * big, 0.13 * big, 0.03 * big]);
      }
      for (const b of [B.farmR, B.farmL, B.shinR, B.shinL]) for (let i = 0; i < 3; i++) tuft(b, [-0.03, -0.05 - i * 0.06, (i - 1) * 0.025], [(i - 1) * 0.5, 0, 0.4], [0.025 * big, 0.1 * big, 0.02 * big]);
    }
  }

  /**
   * Each frame, after the body's been posed: the beast moved, the human body
   * hidden under it (or the human head under a hybrid's), the mouth on the actor.
   */
  update(view, a, env, ctx, fp, dt) {
    const m = this.m, t = env.time + (a.seed || 0) * 0.37;
    const sp = a.flying ? (a.flightSpeed || Math.hypot(a.vx || 0, a.vy || 0)) : Math.hypot(a.vx || 0, a.vy || 0);
    const s = view.root.scale.x || 1;
    const spd = sp / s;
    const act = a.action && a.state !== 'knocked' ? a.action : null;
    if (this.beast) {
      m.group.visible = false;
      this.obj.visible = !fp;
      if (!fp) {
        if (this.quad) this.quad.update(a, t, dt, spd, act);
        else if (this.bird) this.bird.update(a, t, dt, spd, act);
        else this.dragon.update(a, view, env, ctx, t, dt, sp / s, act);
      } else if (this.dragon) this.dragon.update(a, view, env, ctx, t, dt, sp / s, act);
    } else {
      m.group.visible = true;
      if (this.replaceHead) {
        m.fx.uHideHead.value = 1;
        m.face.visible = false;
      }
      if (this.head) this.head.visible = !fp;
      if (this.tail) this.layTail(a, t, spd, m.d);
    }
    this.mouth(view, a, fp);
  }

  /** The hybrid's tail off the small of the back: hanging and curling, swishing; streaming out at a run. */
  layTail(a, t, sp, d) {
    const P = this.tailPts, n = P.length, run = clamp(sp / 6, 0, 1), dragon = this.kind === 'dragon_hybrid';
    const Lt = this.tailLen * (d.Bk || 1);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), len = Lt * u;
      const down = dragon ? (0.75 - run * 0.4) : (0.85 - run * 0.5);
      const ang = -Math.PI / 2 - (1 - down) * 1.2 + u * (dragon ? 0.9 : 1.5) * (1 - run * 0.5);
      // (an arc: out of the back, down, and — a leopard's — curling up at the tip)
      const x = -0.1 * d.Bk + Math.cos(ang) * len * 0.35 - len * 0.55, y = -0.04 + Math.sin(ang) * len * 0.75 + (dragon ? 0 : u * u * 0.3 * Lt);
      P[i].set(x, Math.max(y, -d.hip0 + 0.05 + (dragon ? this.tailR * (1 - u) : 0)), Math.sin(t * 2 - u * 3.5) * 0.16 * u * Lt);
    }
    this.tail.set(P, (i) => this.tailR * (1 - (i / (n - 1)) * 0.85));
    if (this.tailFins) {
      const T = this.tail;
      this.tailFins.forEach((f, k) => {
        const i = Math.min(n - 1, 1 + Math.floor(k * (n - 2) / 8));
        f.position.copy(T.P[i]).addScaledVector(T.U[i], T.R[i] * 0.8);
        _m4.makeBasis(_p1.copy(T.T[i]).negate(), T.U[i], _p0.crossVectors(_p1, T.U[i]));
        f.quaternion.setFromRotationMatrix(_m4);
        f.rotateZ(0.7);
        f.scale.set(0.05, 0.24 * (1 - k / 10), 0.02);
      });
    }
  }

  /**
   * Where the beast's mouth is, for the breath and the beams to come out of:
   * a._mouthAt = { X, Y, Z } in the scene, { dx, dy } from the actor on the
   * map and `h` the height (m above the sea), `dir` [x, y, up] the way it
   * points, and `t` (performance.now() / 1000) when it was put there.
   */
  mouth(view, a, fp) {
    const anchor = this.dragon ? this.dragon.mouthAt : this.bird ? this.bird.mouthAt : this.quad ? this.quad.mouthAt : this.mouthAt;
    let src = anchor;
    if (!src || (fp && !this.dragon)) {
      // (the human head's mouth, under a hybrid's in first person, or Kaido's own)
      src = null;
    }
    view.root.updateMatrixWorld(true);
    if (src) {
      src.getWorldPosition(_wp);
      src.getWorldQuaternion(_wq);
      _fw.set(1, 0, 0).applyQuaternion(_wq);
    } else {
      const m = this.m, d = m.d, hb = m.bones[B.head];
      _wp.set(d.hx + d.headR * 0.9, d.hc - d.headR * 0.45, 0).applyMatrix4(hb.matrixWorld);
      hb.getWorldQuaternion(_wq);
      _fw.set(1, 0, 0).applyQuaternion(_wq);
    }
    const r = view.root.position;
    const o = a._mouthAt || (a._mouthAt = { X: 0, Y: 0, Z: 0, dx: 0, dy: 0, h: 0, dir: [1, 0, 0], t: 0 });
    o.X = _wp.x; o.Y = _wp.y; o.Z = _wp.z;
    o.dx = _wp.x - r.x; o.dy = _wp.z - r.z; o.h = _wp.y;
    o.dir[0] = _fw.x; o.dir[1] = _fw.z; o.dir[2] = _fw.y;
    o.t = performance.now() / 1000;
  }

  dispose(a) {
    this.obj?.removeFromParent();
    this.bird?.dispose();
    this.dragon?.dispose();
    this.tail?.dispose();
    if (a && a._mouthAt) a._mouthAt = null;
  }
}
