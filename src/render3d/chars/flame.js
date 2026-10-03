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
// (the Phoenix's: blue flames with a gold heart, as Marco's burn)
const PHOENIX = { uRim: '#1259c3', uMid: '#1fa2ef', uHot: '#7fdcff', uCore: '#fff3a0' };

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

const _Y = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _d = new THREE.Vector3();

/**
 * The Phoenix's wings: each arm a wing of blue flame — a fan of long tongues
 * set along it from the shoulder to the hand, streaming back off it (the
 * longest out at the hand, like a bird's primaries) — and a tail of three
 * more off the small of the back; gold at the heart of every flame. Laid out
 * afresh each frame from the rig (shoulders, elbows and hands, in the body's
 * own frame: add the group to the model's), so the wings spread and fold
 * with the arms; they flare up from nothing and die back the same way.
 */
export class PhoenixWings {
  constructor(seed = 0) {
    this.group = new THREE.Group();
    this.tongues = [];
    for (let side = 0; side < 2; side++) for (let i = 0; i < 6; i++) this.add(seed + side * 13 + i * 2.1, { side, i });
    for (let i = 0; i < 3; i++) this.add(seed + 50 + i * 3.3, { tail: i });
    this.grow = 0;
  }

  add(seed, slot) {
    const mat = bodyMat(seed, PHOENIX);
    const m = new THREE.Mesh(flameGeo(), mat);
    m.renderOrder = 2;
    this.group.add(m);
    this.tongues.push({ m, mat, slot });
  }

  /**
   * Burn for a frame. `rig`: the body's solved rig (S, J, E: shoulders, elbows,
   * hands; hip, qChest); `d`: its dims; `trail`: the way the flames stream, in
   * the body's frame (+x ahead, +y up, +z its right; a unit vector); `lit`:
   * burning (grows) or going out (dies back).
   */
  update(t, dt, rig, d, trail, lit = true) {
    this.grow += ((lit ? 1 : 0) - this.grow) * Math.min(1, dt * (lit ? 6 : 8));
    this.group.visible = this.grow > 0.02;
    if (!this.group.visible) return;
    for (const { m, mat, slot } of this.tongues) {
      let len, wide;
      if (slot.tail !== undefined) {
        // the tail: off the small of the back, fanned a little, streaming back and down
        const f = slot.tail - 1;
        _p.set(-0.12 * d.Bk, d.chestLen * 0.22, f * 0.07).applyQuaternion(rig.qChest).add(rig.hip);
        _d.copy(trail).addScaledVector(_Y, -0.25);
        _d.z += f * 0.3;
        len = 0.95 - Math.abs(f) * 0.18; wide = 0.5;
      } else {
        // along the arm, shoulder to elbow to hand, streaming back and out from it
        const k = slot.i / 5, S = rig.S[slot.side], J = rig.J[slot.side], E = rig.E[slot.side];
        if (k < 0.5) _p.lerpVectors(S, J, k * 2); else _p.lerpVectors(J, E, (k - 0.5) * 2);
        _d.copy(trail).addScaledVector(_Y, 0.12 - k * 0.1);
        _d.z += (slot.side === 0 ? 1 : -1) * (0.25 + k * 0.3);
        len = 0.45 + 0.7 * k; wide = 0.62 - 0.18 * k;
      }
      m.position.copy(_p);
      m.quaternion.setFromUnitVectors(_Y, _d.normalize());
      m.scale.set(wide * this.grow, len * (0.4 + 0.6 * this.grow), wide * this.grow);
      mat.uniforms.uTime.value = t; mat.uniforms.uGrow.value = this.grow;
    }
  }

  dispose() { for (const { mat } of this.tongues) mat.dispose(); }
}

/** World-space drift (x, z: the air going past) into a parent's frame. */
export function driftInto(parent, wx, wz, out) {
  parent.getWorldQuaternion(_q).invert();
  return out.set(wx, 0, wz).applyQuaternion(_q);
}
