// The flame a Lunarian carries on their back, between the wings — a fire that
// burns as long as they do, and the reason their skin turns blades and shot.
// Built as a real fire in 3D, not a picture of one: a teardrop of flame whose
// surface boils and licks upward (its shape pushed about by rising noise in
// the vertex shader), eaten away into tongues toward the top, banded in the
// flat colours of a cel-shaded fire — deep red at the rim, orange, yellow,
// a white-hot heart — with a smaller additive core inside it, two lesser
// flames licking up beside it, sparks streaming off the tips and a soft glow
// round the whole. It leans back off a runner's shoulders and whips about
// when they stop or are knocked flying (a spring on the way they move).
// The same fire, blue and gold, makes the Phoenix's wings (PhoenixWings).
import * as THREE from 'three';
import { glowSpriteMat } from './fx.js';

// ------------------------------------------------------------------ shared pieces
const NOISE = /* glsl */`
  float fhash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fhash(i), fhash(i + vec3(1, 0, 0)), f.x), mix(fhash(i + vec3(0, 1, 0)), fhash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(fhash(i + vec3(0, 0, 1)), fhash(i + vec3(1, 0, 1)), f.x), mix(fhash(i + vec3(0, 1, 1)), fhash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float ffbm(vec3 p) { return fnoise(p) * 0.55 + fnoise(p * 2.03 + 7.1) * 0.3 + fnoise(p * 4.1 + 3.7) * 0.15; }
`;

const VERT = /* glsl */`
  uniform float uTime, uSeed, uGrow;
  uniform vec3 uLean;
  varying float vH;
  varying vec3 vP, vN, vV;
  ${NOISE}
  void main() {
    vec3 p = position;
    float h = clamp(p.y, 0.0, 1.0), t = uTime + uSeed;
    // the surface boils: rising turbulence swells and pinches it, more toward the tip
    float n = fnoise(vec3(p.x * 3.2, p.y * 2.4 - t * 2.8, p.z * 3.2)) - 0.5;
    p.xz *= 1.0 + n * 0.85 * h + 0.09 * sin(t * 11.0 + h * 8.0) * h;
    // the tip sways and licks up and down
    p.x += (sin(t * 4.7 + h * 3.1) * 0.07 + sin(t * 9.3 + h * 6.0) * 0.035) * h * h;
    p.z += (cos(t * 5.3 + h * 2.7) * 0.07 + sin(t * 8.1 + h * 5.0) * 0.035) * h * h;
    p.y *= (1.0 + 0.09 * sin(t * 6.3) + 0.05 * sin(t * 13.7)) * uGrow;
    p.xz *= mix(0.6, 1.0, uGrow);
    // blown back by the way they're moving
    p += uLean * h * h;
    vH = h; vP = position;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// (the body of the flame: flat bands of colour with narrow soft steps between, like the anime's fire)
const FRAG_BODY = /* glsl */`
  uniform float uTime, uSeed, uAlpha;
  uniform vec3 uRim, uMid, uHot, uCore;
  varying float vH;
  varying vec3 vP, vN, vV;
  ${NOISE}
  void main() {
    float t = uTime + uSeed;
    float face = abs(dot(normalize(vN), normalize(vV)));
    // tongues: noise streaming up the flame eats it away from the top
    float n = ffbm(vec3(vP.x * 4.6, vP.y * 3.3 - t * 3.6, vP.z * 4.6));
    float body = (1.0 - vH) * 1.22 + face * 0.2 - n * 0.9;
    if (body < 0.16) discard;
    float heat = body + (face - 0.55) * 0.4 - vH * 0.15;
    vec3 col = mix(uRim, uMid, smoothstep(0.4, 0.46, heat));
    col = mix(col, uHot, smoothstep(0.7, 0.76, heat));
    col = mix(col, uCore, smoothstep(0.95, 1.0, heat));
    float a = smoothstep(0.16, 0.24, body) * uAlpha;
    gl_FragColor = vec4(col, a);
  }
`;

// (the white-hot heart inside, added on: bright enough for the bloom to catch)
const FRAG_CORE = /* glsl */`
  uniform float uTime, uSeed, uAlpha;
  uniform vec3 uCore;
  varying float vH;
  varying vec3 vP, vN, vV;
  ${NOISE}
  void main() {
    float t = uTime + uSeed;
    float face = abs(dot(normalize(vN), normalize(vV)));
    float n = ffbm(vec3(vP.x * 5.0, vP.y * 3.6 - t * 4.0, vP.z * 5.0));
    float body = (1.0 - vH) * 1.05 + face * 0.35 - n * 0.75;
    if (body < 0.35) discard;
    float a = smoothstep(0.35, 0.7, body) * face * uAlpha * 0.7;
    gl_FragColor = vec4(uCore * 1.3 * a, a);
  }
`;

const SPARK_VERT = /* glsl */`
  attribute vec3 seed;
  uniform float uTime, uPx, uGrow;
  uniform vec3 uLean;
  varying float vLife;
  void main() {
    float life = fract(uTime * (0.6 + seed.z * 0.55) + seed.x);
    vec3 p = vec3(cos(seed.y) * 0.1, 0.25 + seed.z * 0.2, sin(seed.y) * 0.1);
    p.y += life * 1.25 * uGrow;
    p.x += sin(uTime * 3.1 + seed.y * 5.0) * 0.14 * life;
    p.z += cos(uTime * 2.7 + seed.x * 7.0) * 0.14 * life;
    p += uLean * life * 1.7;
    vLife = life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPx * 0.035 * (1.0 - life * 0.7) / max(0.2, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FRAG = /* glsl */`
  uniform float uAlpha;
  varying float vLife;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = (1.0 - d) * (1.0 - vLife) * uAlpha;
    gl_FragColor = vec4(mix(vec3(1.0, 0.9, 0.55), vec3(1.0, 0.36, 0.08), vLife) * 1.5 * a, a);
  }
`;

let GEO = null;
/** The teardrop: a round foot, widest a fifth of the way up, drawn out to a point (1 high). */
function flameGeo() {
  if (GEO) return GEO;
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const y = i / 18;
    const foot = Math.sin(Math.min(1, y / 0.2) * Math.PI / 2);
    const r = 0.25 * Math.sqrt(foot) * Math.pow(1 - y, 1.1) * (1 - 0.1 * y);
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  GEO = new THREE.LatheGeometry(pts, 16);
  return GEO;
}

let SPARKS = null;
function sparkGeo() {
  if (SPARKS) return SPARKS;
  const n = 18, seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    seed[i * 3] = (i * 0.618) % 1; seed[i * 3 + 1] = i * 2.399; seed[i * 3 + 2] = ((i * 0.381) % 1);
  }
  SPARKS = new THREE.BufferGeometry();
  SPARKS.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  SPARKS.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  // (the points are placed in the shader: bounds big enough never to be culled)
  SPARKS.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 3);
  return SPARKS;
}

const COLS = { uRim: '#d42a16', uMid: '#ff6a12', uHot: '#ffb52e', uCore: '#fff0b8' };

function bodyMat(seed, cols = COLS) {
  const u = { uTime: { value: 0 }, uSeed: { value: seed }, uGrow: { value: 1 }, uAlpha: { value: 1 }, uLean: { value: new THREE.Vector3() } };
  for (const [k, c] of Object.entries(cols)) u[k] = { value: new THREE.Color(c) };
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG_BODY, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}
function coreMat(seed) {
  const u = { uTime: { value: 0 }, uSeed: { value: seed }, uGrow: { value: 1 }, uAlpha: { value: 1 }, uLean: { value: new THREE.Vector3() }, uCore: { value: new THREE.Color('#ffe9a8') } };
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG_CORE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _sz = new THREE.Vector2();

export class BackFlame {
  constructor(seed = Math.random() * 100) {
    this.group = new THREE.Group();
    this.mats = [];
    const add = (mat, sc, x, z, ry = 0, order = 2) => {
      const m = new THREE.Mesh(flameGeo(), mat);
      m.scale.set(sc[0], sc[1], sc[0]); m.position.set(x, 0, z); m.rotation.y = ry;
      m.renderOrder = order;
      this.group.add(m);
      this.mats.push(mat);
      return m;
    };
    // the main flame, two lesser ones licking up either side of it (out over the wings), and the heart
    add(bodyMat(seed), [1, 1], 0, 0);
    add(bodyMat(seed + 3.7), [0.62, 0.72], -0.05, 0.1, 0.4);
    add(bodyMat(seed + 7.3), [0.58, 0.64], -0.04, -0.11, -0.5);
    add(coreMat(seed + 1.9), [0.55, 0.62], 0.02, 0, 0, 3);
    // sparks streaming off the tips
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 800 }, uGrow: { value: 1 }, uAlpha: { value: 1 }, uLean: { value: new THREE.Vector3() } },
      vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sparks = new THREE.Points(sparkGeo(), this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 3;
    // (how big a point a metre across is, on this screen: set just before it's drawn)
    this.sparks.onBeforeRender = (r, sc, cam) => {
      r.getDrawingBufferSize(_sz);
      this.sparkMat.uniforms.uPx.value = _sz.y / (2 * Math.tan(((cam.fov || 60) * Math.PI) / 360));
    };
    this.group.add(this.sparks);
    // the glow round it all
    this.glowMat = glowSpriteMat('#ff6d2a').clone();
    this.glowMat.opacity = 0.42;
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.position.set(0, 0.42, 0);
    this.glow.renderOrder = 1;
    this.group.add(this.glow);
    this.lean = new THREE.Vector3(); this.leanV = new THREE.Vector3();
    this.grow = 0; // lit up from nothing when first seen
  }

  /**
   * Burn for a frame. `t`: seconds; `dt`: since the last; `size`: the flame's
   * height (the group's own units); `drift`: the way the air's going past it
   * (the group's frame — the opposite of the way they're moving), which the
   * flame leans into on a spring; `lit`: burning (grows) or going out (shrinks).
   */
  update(t, dt, size, drift, lit = true) {
    this.grow += ((lit ? 1 : 0) - this.grow) * Math.min(1, dt * (lit ? 5 : 8));
    this.group.visible = this.grow > 0.02;
    if (!this.group.visible) return;
    // the lean: a spring after the drift, so the flame streams back as they
    // set off, and flicks forward over their shoulders when they stop
    const k = 60, c = 9;
    this.leanV.x += ((drift.x - this.lean.x) * k - this.leanV.x * c) * dt;
    this.leanV.y += ((drift.y - this.lean.y) * k - this.leanV.y * c) * dt;
    this.leanV.z += ((drift.z - this.lean.z) * k - this.leanV.z * c) * dt;
    this.lean.addScaledVector(this.leanV, dt);
    this.group.scale.setScalar(size);
    _v.copy(this.lean).divideScalar(Math.max(0.01, size));
    for (const m of this.mats) {
      const u = m.uniforms;
      u.uTime.value = t; u.uGrow.value = this.grow; u.uLean.value.copy(_v);
    }
    const s = this.sparkMat.uniforms;
    s.uTime.value = t; s.uGrow.value = this.grow; s.uLean.value.copy(_v); s.uAlpha.value = this.grow;
    const fl = 0.85 + 0.1 * Math.sin(t * 17.3) + 0.05 * Math.sin(t * 29.1);
    this.glow.scale.setScalar(1.1 * this.grow * fl);
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.sparkMat.dispose(); this.glowMat.dispose();
  }
}

const _j = new THREE.Vector3(), _h = new THREE.Vector3(), _a = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3(), _e = new THREE.Vector3();

// The wing's skin: a sheet of blue flame cut into long pointed feathers along
// its trailing edge (the primaries longest, out at the hand), each feather a
// flat cel-banded flame — a dark blue rim, the cyan body, a pale heart along
// the arm, gold at the tips — with tongues of colour streaming back along it
// and the tips licking about. One clean silhouette, the way Marco's wings
// read in the anime: no loose puffs of fire round it.
const WING_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const WING_FRAG = /* glsl */`
  uniform float uTime, uSeed, uAlpha, uN, uTipGold, uFront;
  uniform vec3 uRim, uMid, uHot, uCore, uGold, uFire;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float t = uTime + uSeed;
    float u = vUv.x;
    // va: 0 on the arm, 1 at the longest feather's tip, below 0 the fringe
    // of fire licking up off the arm (uFront of the sheet's rows)
    float va = (vUv.y - uFront) / (1.0 - uFront);
    float fu = u * uN;
    // each feather a tongue of flame that sways as it streams back: bent side
    // to side by a wave running down it, and by noise, more toward its tip
    float tipw = max(va, 0.0);
    float sway = sin(va * 5.0 - t * 7.0 + floor(fu) * 1.7) * 0.08 * tipw
               + (fnoise(vec3(fu * 0.8, va * 2.0 - t * 2.2, 1.0)) - 0.5) * 0.4 * tipw;
    float fs = fu + sway, fid = floor(fs);
    float cf = abs(fract(fs) * 2.0 - 1.0);
    float n = fnoise(vec3(fs * 1.3, va * 3.2 - t * 2.6, fid * 0.37));
    float n2 = fnoise(vec3(fs * 3.1 + 7.0, va * 7.0 - t * 4.1, t * 0.6));
    // (every feather its own length, flickering longer and shorter)
    float len = 0.74 + 0.16 * fract(sin(fid * 12.9898 + uSeed) * 43758.5) + (fnoise(vec3(fid * 0.7, t * 1.6, 2.0)) - 0.5) * 0.26;
    float vv = va / len;
    // a tongue: the feathers one sheet at the root, each narrowing to a point at its tip
    float body = 1.3 * (1.0 - pow(clamp(vv, 0.0, 1.0), 1.5)) - cf + (n - 0.5) * 0.4 * tipw;
    // the fringe off the arm: little tongues licking up and flickering
    float fr = uFront / (1.0 - uFront);
    float tn = fnoise(vec3(u * uN * 4.5, t * 2.4 - va * 3.0, 9.0));
    float front = uFront > 0.0 ? (va + fr * (0.2 + 0.8 * pow(tn, 1.3))) * 7.0 : 1.0;
    float d = min(body, front);
    if (d < 0.0) discard;
    // three hard bands like the techniques' fire: a deep blue rim, the cyan body,
    // the white-hot heart along the arm, streaks of heat flowing back off it
    float mid = smoothstep(0.1, 0.13, d);
    float streak = fnoise(vec3(fs * 2.2, va * 1.6 - t * 3.4, 5.0));
    float hot = smoothstep(0.66, 0.7, streak + (1.0 - vv) * 0.28) * smoothstep(0.22, 0.26, d);
    float core = smoothstep(0.2, 0.16, va + (n2 - 0.5) * 0.16) * smoothstep(0.3, 0.34, d);
    vec3 c = mix(uRim, uMid, mid);
    c = mix(c, uHot * 1.1, hot);
    c = mix(c, uCore * 1.3, core);
    // gold where the feathers burn out at their tips, as Marco's are drawn
    float g = smoothstep(0.7, 0.74, vv + (n2 - 0.5) * 0.3) * uTipGold;
    c = mix(c, mix(uFire, uGold * 1.25, mid), g);
    gl_FragColor = vec4(c, uAlpha);
  }
`;
// (the share of a wing's sheet, in v, that's the fringe of fire ahead of the arm)
const WING_FRONT = 0.14;
const WING_COLS = { uRim: '#1673c9', uMid: '#2fc8ee', uHot: '#7fe8fb', uCore: '#d9fbff', uGold: '#ffd23f', uFire: '#ff8a1c' };

function wingMat(seed, n, gold, front = 0) {
  const u = { uTime: { value: 0 }, uSeed: { value: seed }, uAlpha: { value: 1 }, uN: { value: n }, uTipGold: { value: gold }, uFront: { value: front } };
  for (const [k, c] of Object.entries(WING_COLS)) u[k] = { value: new THREE.Color(c) };
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: WING_VERT, fragmentShader: WING_FRAG, transparent: true, depthWrite: true, side: THREE.DoubleSide });
}

/**
 * A sheet NU × NV whose vertices are laid out each frame (uv: u along the
 * span, v back along the chord). With `front`, its first row is a fringe
 * ahead of the leading edge (v 0..front) and the rest the chord (front..1).
 */
function sheetGeo(NU, NV, front = 0) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(NU * NV * 3), uv = new Float32Array(NU * NV * 2), idx = [];
  const vOf = (j) => (front ? (j === 0 ? 0 : front + (1 - front) * (j - 1) / (NV - 2)) : j / (NV - 1));
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const k = i * NV + j; uv[k * 2] = i / (NU - 1); uv[k * 2 + 1] = vOf(j); }
  for (let i = 0; i < NU - 1; i++) for (let j = 0; j < NV - 1; j++) {
    const a = i * NV + j, b = a + NV;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4);
  return g;
}

/**
 * The Phoenix's wings: each arm the leading edge of a broad wing of blue
 * flame, shoulder to hand and a little past it, the feathers streaming back
 * off it (longest at the hand, like a bird's primaries) and a fanned tail of
 * long gold-tipped feathers off the small of the back. Laid out afresh each
 * frame from the rig (shoulders, elbows and hands, in the body's own frame:
 * add the group to the model's), so the wings spread, fold and beat with the
 * arms; they unfurl from nothing and fold away the same way.
 */
export class PhoenixWings {
  constructor(seed = 0) {
    this.group = new THREE.Group();
    this.NU = 18; this.NV = 6;
    this.wings = [0, 1].map((side) => {
      const mat = wingMat(seed + side * 7.7, 7, 1, WING_FRONT);
      const m = new THREE.Mesh(sheetGeo(this.NU, this.NV, WING_FRONT), mat);
      m.frustumCulled = false; m.renderOrder = 2;
      this.group.add(m);
      return { m, mat, side };
    });
    this.TU = 9;
    const tmat = wingMat(seed + 31, 5, 1);
    this.tail = new THREE.Mesh(sheetGeo(this.TU, this.NV), tmat);
    this.tail.frustumCulled = false; this.tail.renderOrder = 2;
    this.tailMat = tmat;
    this.group.add(this.tail);
    this.grow = 0;
  }

  /**
   * Burn for a frame. `rig`: the body's solved rig (S, J, E: shoulders, elbows,
   * hands; hip, qChest); `d`: its dims; `trail`: the way the flames stream, in
   * the body's frame (+x ahead, +y up, +z its right; a unit vector); `lit`:
   * burning (unfurls) or going out (folds away); `hold`: a technique's
   * under way — the wings stay spread wide, steady, rather than following
   * the arms through the swing (they'd fold and crumple into the body).
   */
  update(t, dt, rig, d, trail, lit = true, hold = false) {
    this.grow += ((lit ? 1 : 0) - this.grow) * Math.min(1, dt * (lit ? 6 : 8));
    this.hold = (this.hold || 0) + ((hold ? 1 : 0) - (this.hold || 0)) * Math.min(1, dt * (hold ? 14 : 5));
    this.group.visible = this.grow > 0.02;
    if (!this.group.visible) return;
    const g = this.grow, NV = this.NV;
    for (const w of this.wings) {
      const S = rig.S[w.side], S2 = rig.S[1 - w.side];
      // out from the body: away from the other shoulder, level
      _o.subVectors(S, S2); _o.y = 0; _o.normalize();
      // (the arm as the rig has it, or — mid-technique — held out level and a little raised)
      const J = _j.copy(rig.J[w.side]), E = _h.copy(rig.E[w.side]);
      if (this.hold > 0.001) {
        const l1 = S.distanceTo(rig.J[w.side]), l2 = rig.J[w.side].distanceTo(rig.E[w.side]);
        _a.copy(S).addScaledVector(_o, l1 * 0.97).addScaledVector(_Y, l1 * 0.22);
        J.lerp(_a, this.hold);
        _a.addScaledVector(_o, l2 * 0.95).addScaledVector(_Y, l2 * 0.32);
        E.lerp(_a, this.hold);
      }
      // (past the hand: the arm's line carried on a little, for the longest feathers to grow from)
      _e.subVectors(E, J).normalize().multiplyScalar(0.45).add(E);
      const pos = w.m.geometry.attributes.position.array;
      for (let i = 0; i < this.NU; i++) {
        const u = i / (this.NU - 1);
        // the leading edge: shoulder → elbow → hand → past it
        if (u < 0.42) _p.lerpVectors(S, J, u / 0.42);
        else if (u < 0.86) _p.lerpVectors(J, E, (u - 0.42) / 0.44);
        else _p.lerpVectors(E, _e, (u - 0.86) / 0.14);
        // (in close to the body at the shoulder, so there's no gap under the arm)
        if (u < 0.12) _p.addScaledVector(_o, -(0.12 - u) * 0.6);
        // the feathers stream back, swept out and a touch down, longer toward the hand
        // (swept up and back in a great V, as Marco's are — so they read from the front and the side too, never edge-on)
        _d.copy(trail).multiplyScalar(0.6).addScaledVector(_o, 0.15 + 0.3 * u).addScaledVector(_Y, 0.25 + 0.45 * u).normalize();
        const chord = (0.65 + 1.55 * Math.pow(u, 1.1)) * (0.25 + 0.75 * g);
        for (let j = 0; j < NV; j++) {
          const k = (i * NV + j) * 3;
          if (j === 0) {
            // (the fringe: fire licking up off the arm and a little ahead)
            const f = chord * WING_FRONT / (1 - WING_FRONT);
            pos[k] = _p.x - trail.x * f * 0.35; pos[k + 1] = _p.y + f; pos[k + 2] = _p.z - trail.z * f * 0.35;
            continue;
          }
          const v = (j - 1) / (NV - 2);
          // (a little camber: the feathers droop as they trail)
          pos[k] = _p.x + _d.x * chord * v;
          pos[k + 1] = _p.y + _d.y * chord * v - 0.1 * v * v * chord;
          pos[k + 2] = _p.z + _d.z * chord * v;
        }
      }
      w.m.geometry.attributes.position.needsUpdate = true;
      w.mat.uniforms.uTime.value = t;
    }
    // the tail: a fan off the small of the back, the middle feathers longest
    _p.set(-0.12 * d.Bk, d.chestLen * 0.15, 0).applyQuaternion(rig.qChest).add(rig.hip);
    _o.set(-trail.z, 0, trail.x); if (_o.lengthSq() < 1e-4) _o.set(0, 0, 1); _o.normalize();
    const pos = this.tail.geometry.attributes.position.array;
    for (let i = 0; i < this.TU; i++) {
      const u = i / (this.TU - 1), f = u * 2 - 1;
      _d.copy(trail).addScaledVector(_Y, -0.35).addScaledVector(_o, f * 0.55).normalize();
      const chord = (1.0 + 0.8 * (1 - f * f)) * (0.25 + 0.75 * g);
      for (let j = 0; j < NV; j++) {
        const v = j / (NV - 1), k = (i * NV + j) * 3;
        pos[k] = _p.x + _o.x * f * 0.1 + _d.x * chord * v;
        pos[k + 1] = _p.y + _d.y * chord * v;
        pos[k + 2] = _p.z + _o.z * f * 0.1 + _d.z * chord * v;
      }
    }
    this.tail.geometry.attributes.position.needsUpdate = true;
    this.tailMat.uniforms.uTime.value = t;
  }

  dispose() {
    for (const w of this.wings) { w.mat.dispose(); w.m.geometry.dispose(); }
    this.tailMat.dispose(); this.tail.geometry.dispose();
  }
}

/** World-space drift (x, z: the air going past) into a parent's frame. */
export function driftInto(parent, wx, wz, out) {
  parent.getWorldQuaternion(_q).invert();
  return out.set(wx, 0, wz).applyQuaternion(_q);
}
