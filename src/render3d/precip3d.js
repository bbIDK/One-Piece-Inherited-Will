// Rain and snow that fall through the world, not across the screen. Streaks
// and flakes fill a box of air around the camera but belong to the world:
// walk through the rain and it stays where it is, the wind leans it over,
// and it stops where something is in the way — a roof (nothing falls indoors
// or under the eaves; from inside you watch it come down past the door), or
// the ground, where each drop bursts into a splash, or a ring on the water.
// Snow drifts down slowly, swaying, and settles where it lands (ash from a
// volcano too, grey). On a desert wind, sand streaks along the ground. In a
// storm, lightning forks down out of the clouds to the sea. (The weather's
// mists: mist3d.js.)
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import './mist3d.js';
import './windlines3d.js';
import { heightsOf } from '../world/interiors.js';
import { bfoot } from '../world/bframe.js';
import { RAIN_HITS } from '../audio/ambience.js';

const RAIN = { n: 9000, box: 34, tall: 20, below: 6, fall: 11, near: 2.6 };
const SNOW = { n: 7000, box: 30, tall: 16, below: 5, fall: 1.25, near: 0.9 };
const MAX_SPLASH = 320;
const SH = 64; // shelter map: SH x SH metres around the camera, a texel a metre
const NONE = -1e4;

// ------------------------------------------------------------ shelter map
/**
 * What's overhead around the camera, a metre at a time: the ground height (R)
 * and, under a roof, the height of the roof (G; NONE in the open). Drops
 * vanish below either. Rebuilt as the camera moves on.
 */
class Shelter {
  constructor() {
    this.data = new Float32Array(SH * SH * 4);
    this.tex = new THREE.DataTexture(this.data, SH, SH, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.x0 = null; this.y0 = null; this.world = null;
  }

  /** Re-centre on (wx, wy) — in 8 m steps — when needed. */
  update(ctx, wx, wy) {
    const w = ctx.world;
    const x0 = Math.round(wx / 8) * 8 - SH / 2, y0 = Math.round(wy / 8) * 8 - SH / 2;
    if (x0 === this.x0 && y0 === this.y0 && w === this.world) return;
    this.x0 = x0; this.y0 = y0; this.world = w;
    const d = this.data;
    for (let j = 0; j < SH; j++) {
      for (let i = 0; i < SH; i++) {
        const k = (j * SH + i) * 4;
        d[k] = ctx.ground(w.wx(x0 + i + 0.5), y0 + j + 0.5);
        d[k + 1] = NONE;
      }
    }
    // roofs (with a little overhang for the eaves)
    const hf = ctx.game?.view3d?.terrain?.hf;
    if (w.objects) {
      for (const b of w.objects.query(x0 - 12, y0 - 12, x0 + SH + 12, y0 + SH + 12)) {
        if (!b.fw || !b.fd || !(b.hgt || b.enterable)) continue;
        const floor = b.enterable && hf ? hf.floorY(b) : ctx.ground(b.x, b.y);
        const top = floor + heightsOf(b).H + 0.4;
        const r = bfoot(b), bx = w.dx(x0, r.x0);
        const i0 = Math.max(0, Math.floor(bx - 0.45)), i1 = Math.min(SH - 1, Math.floor(bx + (r.x1 - r.x0) + 0.45));
        const j0 = Math.max(0, Math.floor(r.y0 - y0 - 0.45)), j1 = Math.min(SH - 1, Math.floor(r.y1 - y0 + 0.45));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = (j * SH + i) * 4 + 1;
          if (top > d[k]) d[k] = top;
        }
      }
    }
    this.tex.needsUpdate = true;
  }

  /** Ground height at a world point, or null under cover (or off the map). */
  open(w, x, y) {
    const i = Math.floor(w.dx(this.x0, x)), j = Math.floor(y - this.y0);
    if (i < 0 || j < 0 || i >= SH || j >= SH) return null;
    const k = (j * SH + i) * 4;
    return this.data[k + 1] > NONE ? null : this.data[k];
  }
}

// ---------------------------------------------------------------- shaders
const COMMON = /* glsl */`
  attribute vec4 aSeed;
  uniform float uTime, uBox, uTall, uBelow, uFall;
  uniform vec2 uWind, uOrig, uShelterO;
  uniform vec2 uDrift;   // how far the wind has carried them (wrapped into the box)
  uniform sampler2D uShelter;
  varying float vA;
  varying vec2 vC;
  // a drop's place: fixed in the world (wrapped into the box around the camera), falling
  vec3 dropAt(float fall, vec2 sway) {
    vec2 rel = mod(aSeed.xy * uBox + uDrift + sway - uOrig - cameraPosition.xz + uBox * 0.5, uBox) - uBox * 0.5;
    float base = cameraPosition.y - uBelow;
    float y = base + mod(aSeed.z * uTall - fall * uTime - base, uTall);
    return vec3(cameraPosition.x + rel.x, y, cameraPosition.z + rel.y);
  }
  // under a roof, or down in the ground?
  bool sheltered(vec3 p) {
    vec2 uv = (p.xz - uShelterO) / ${SH.toFixed(1)};
    if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return false;
    vec4 s = texture2D(uShelter, uv);
    return p.y < s.r || p.y < s.g;
  }
  uniform float uNear;
  float boxFade(vec3 p) {
    float r = length(p.xz - cameraPosition.xz);
    return (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, r)) * smoothstep(uNear * 0.35, uNear, length(p - cameraPosition));
  }
`;

const RAIN_VS = /* glsl */`
  ${COMMON}
  uniform float uLen, uWidth;
  void main() {
    float k = 0.85 + 0.3 * aSeed.w;
    float fall = uFall * k;
    vec3 p = dropAt(fall, vec2(0.0));
    vC = position.xy;
    vA = boxFade(p);
    if (sheltered(p)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
    // a streak along the way it's falling, turned to face the camera
    vec3 v = normalize(vec3(uWind.x, -fall, uWind.y));
    vec3 toCam = cameraPosition - p;
    float dist = length(toCam);
    vec3 side = normalize(cross(v, toCam / dist));
    float w = max(uWidth, dist * 0.0012);
    vec3 q = p - v * (position.y * uLen * k) + side * (position.x * w);
    gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
  }
`;
const RAIN_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vA;
  varying vec2 vC;
  void main() {
    float a = uAlpha * vA * (1.0 - abs(vC.x)) * (1.0 - vC.y * 0.75);
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const SNOW_VS = /* glsl */`
  ${COMMON}
  uniform float uSize;
  void main() {
    float k = 0.7 + 0.6 * aSeed.w;
    // flakes tumble and sway as they come down
    vec2 sway = vec2(sin(uTime * (0.55 + aSeed.w * 0.5) + aSeed.x * 40.0), cos(uTime * (0.45 + aSeed.z * 0.4) + aSeed.y * 37.0)) * 0.5;
    vec3 p = dropAt(uFall * k, sway);
    vC = position.xy;
    vA = boxFade(p);
    if (sheltered(p)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float dist = length(cameraPosition - p);
    float s = max(uSize * (0.55 + 0.9 * aSeed.w), dist * 0.0016);
    vec3 q = p + (right * position.x + up * position.y) * s;
    gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
  }
`;
const SNOW_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vA;
  varying vec2 vC;
  void main() {
    float a = uAlpha * vA * smoothstep(1.0, 0.3, length(vC));
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

function fallMesh(spec, vs, fs, corners, shelter, extra) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(spec.n * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = 0;
  const uniforms = {
    uTime: { value: 0 }, uBox: { value: spec.box }, uTall: { value: spec.tall }, uBelow: { value: spec.below }, uFall: { value: spec.fall },
    uWind: { value: new THREE.Vector2() }, uDrift: { value: new THREE.Vector2() }, uOrig: { value: new THREE.Vector2() }, uShelterO: { value: new THREE.Vector2(-1e5, -1e5) },
    uShelter: { value: shelter.tex }, uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0 }, uNear: { value: spec.near }, ...extra,
  };
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  return mesh;
}

// ---------------------------------------------------------------- splashes
function splashTexture(ring) {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (ring) {
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.stroke();
  } else {
    // a little crown of spray
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, r = S * (0.2 + (i % 3) * 0.07);
      g.beginPath(); g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 2.6 - (i % 3) * 0.5, 0, Math.PI * 2); g.fill();
    }
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.22);
    grd.addColorStop(0, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Splashes {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mk = (ring) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: splashTexture(ring), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX_SPLASH);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLASH * 3), 3);
      m.frustumCulled = false; m.count = 0; m.renderOrder = 2;
      scene.add(m);
      return m;
    };
    this.ground = mk(false);
    this.water = mk(true);
    this.list = [];
    this.acc = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
  }

  update(ctx, shelter, rain, bright, wx, wy, dt, time) {
    const w = ctx.world;
    // new splashes where the rain reaches the ground in the open
    this.acc += rain * 420 * dt;
    while (this.acc >= 1 && this.list.length < MAX_SPLASH) {
      this.acc -= 1;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 15;
      const x = w.wx(wx + Math.cos(a) * r), y = wy + Math.sin(a) * r;
      const h = shelter.open(w, x, y);
      // (the drops you'll hear: those landing near you, each where it lands — on the roof over you too)
      if (r < 9 && RAIN_HITS.length < 24) {
        const rig = ctx.game.view3d?.rig;
        // (the view's right hand is (-sin yaw, cos yaw) on the ground: sin(a - yaw), +1 hard right)
        const rel = a - (rig ? rig.yaw : 0);
        RAIN_HITS.push({ d: r, pan: Math.sin(rel), on: h === null ? 'roof' : w.isLiquid(x, y) && !w.isOverlay(x, y) ? 'water' : 'ground' });
      }
      if (h === null) continue;
      const water = w.isLiquid(x, y) && !w.isOverlay(x, y);
      this.list.push({ x, y, h, t: time, water, life: water ? 0.55 : 0.22 });
    }
    if (this.acc > 1) this.acc = 1;
    this.list = this.list.filter((s) => time - s.t < s.life);
    const v = ctx.game.view3d;
    let ng = 0, nw = 0;
    for (const s of this.list) {
      const k = (time - s.t) / s.life;
      const size = s.water ? 0.08 + k * 0.5 : 0.12 + k * 0.22;
      const m = s.water ? this.water : this.ground;
      const n = s.water ? nw++ : ng++;
      this.p.set(w.dx(v.ox, s.x), s.h + 0.03, s.y - v.oy);
      this.s.set(size, 1, size);
      this.m4.compose(this.p, this.q, this.s);
      m.setMatrixAt(n, this.m4);
      const f = (1 - k) * (1 - k) * bright * (s.water ? 0.5 : 0.6);
      this.c.setRGB(f, f, f);
      m.setColorAt(n, this.c);
    }
    for (const [m, n] of [[this.ground, ng], [this.water, nw]]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  clear() { this.list.length = 0; this.ground.count = 0; this.water.count = 0; }
}

// ---------------------------------------------------------------- lightning
// A fork from the clouds down to the sea where the weather's bolt struck
// (env.strike: which way, how far), built once per bolt into one buffer kept
// for it: a jagged main channel (each segment split in two with its middle
// pushed aside, again and again, for the zigzag) and a few branches dying out
// in mid-air, each drawn twice — a thin white-hot core (HDR: the bloom on
// 'high' catches it) and a wide violet-blue glow. The leader runs down first
// and the stroke flashes after it (as Sea of Thieves animates its strikes),
// the branches go before the main channel, and it flickers with the
// stroke's pulses (env.lightning).
const BOLT_V = 3600; // vertices (6 a segment, two layers)

const BOLT_VS = /* glsl */`
  attribute vec3 aInfo; // glow (1) or core (0), how far down the main channel (0..1), a branch (1)
  attribute float aSide;
  varying vec3 vInfo;
  varying float vSide;
  void main() {
    vInfo = aInfo;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BOLT_FS = /* glsl */`
  uniform vec3 uCore, uGlow;
  uniform float uLead, uFlash, uBranch;
  varying vec3 vInfo;
  varying float vSide;
  void main() {
    if (vInfo.y > uLead) discard;
    float across = 1.0 - abs(vSide);
    float a = vInfo.x > 0.5 ? across * across * 0.55 : smoothstep(0.0, 0.5, across);
    a *= uFlash * (vInfo.z > 0.5 ? uBranch : 1.0);
    if (a < 0.003) discard;
    gl_FragColor = vec4((vInfo.x > 0.5 ? uGlow : uCore) * a, a);
  }
`;

class Lightning {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(BOLT_V * 3);
    this.info = new Float32Array(BOLT_V * 3);
    this.side = new Float32Array(BOLT_V);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(this.side, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = {
      uCore: { value: new THREE.Color(1.9, 1.95, 2.3) }, uGlow: { value: new THREE.Color(0.62, 0.62, 1.45) },
      uLead: { value: 0 }, uFlash: { value: 0 }, uBranch: { value: 1 },
    };
    // (premultiplied: added on top of what's behind, never darkening it)
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: BOLT_VS, fragmentShader: BOLT_FS, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.t = -1e9; // (the bolt drawn: its env.strike time)
    this.n = 0;
    this.at = new THREE.Vector3();
    this.toCam = new THREE.Vector3();
    this.d = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  /** Builds the fork for this bolt: from the cloud base above (x, z) to the sea, seen from the camera. */
  build(cam, S) {
    let seed = S.seed >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const ax = cam.position.x + Math.cos(S.angle) * S.dist, az = cam.position.z + Math.sin(S.angle) * S.dist;
    const H = Math.min(430, Math.max(170, S.dist * 0.42));
    const wCore = Math.max(0.9, S.dist * 0.0021), wGlow = wCore * 7;
    this.n = 0;
    const seg = (x0, y0, z0, x1, y1, z1, k0, k1, wd, branch) => {
      for (const glow of [1, 0]) {
        if (this.n + 6 > BOLT_V) return;
        const w = glow ? wd * wGlow : wd * wCore;
        this.toCam.set(cam.position.x - (x0 + x1) / 2, cam.position.y - (y0 + y1) / 2, cam.position.z - (z0 + z1) / 2).normalize();
        this.d.set(x1 - x0, y1 - y0, z1 - z0).normalize();
        this.s.crossVectors(this.d, this.toCam).normalize().multiplyScalar(w);
        const s = this.s;
        const v = [[x0 - s.x, y0 - s.y, z0 - s.z, -1, k0], [x0 + s.x, y0 + s.y, z0 + s.z, 1, k0], [x1 + s.x, y1 + s.y, z1 + s.z, 1, k1],
          [x0 - s.x, y0 - s.y, z0 - s.z, -1, k0], [x1 + s.x, y1 + s.y, z1 + s.z, 1, k1], [x1 - s.x, y1 - s.y, z1 - s.z, -1, k1]];
        for (const q of v) {
          const i = this.n++;
          this.pos[i * 3] = q[0]; this.pos[i * 3 + 1] = q[1]; this.pos[i * 3 + 2] = q[2];
          this.side[i] = q[3];
          this.info[i * 3] = glow; this.info[i * 3 + 1] = q[4]; this.info[i * 3 + 2] = branch ? 1 : 0;
        }
      }
    };
    // the main channel: midpoint displacement, angular as the anime draws it
    const pts = [[ax, H, az], [ax + (rnd() - 0.5) * H * 0.35, 0, az + (rnd() - 0.5) * H * 0.35]];
    for (let pass = 0; pass < 5; pass++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        out.push([(a[0] + b[0]) / 2 + (rnd() - 0.5) * L * 0.42, (a[1] + b[1]) / 2 + (rnd() - 0.5) * L * 0.12, (a[2] + b[2]) / 2 + (rnd() - 0.5) * L * 0.42], b);
      }
      pts.length = 0; pts.push(...out);
    }
    const last = pts.length - 1;
    for (let i = 1; i <= last; i++) {
      const a = pts[i - 1], b = pts[i];
      seg(a[0], a[1], a[2], b[0], Math.max(0, b[1]), b[2], (i - 1) / last, i / last, 1 - 0.3 * (i / last), false);
    }
    // branches, splitting off down the upper two thirds and dying away in the air
    const nb = 3 + Math.floor(rnd() * 4);
    for (let j = 0; j < nb; j++) {
      const i0 = 1 + Math.floor(rnd() * last * 0.66), o = pts[i0];
      const len = H * (0.15 + rnd() * 0.25), dir = rnd() * Math.PI * 2;
      let x = o[0], y = o[1], z = o[2];
      const steps = 6 + Math.floor(rnd() * 5);
      for (let k = 0; k < steps && y > 8; k++) {
        const l = len / steps;
        const nx = x + (Math.cos(dir) * 0.55 + (rnd() - 0.5) * 0.9) * l, ny = y - l * (0.55 + rnd() * 0.5), nz = z + (Math.sin(dir) * 0.55 + (rnd() - 0.5) * 0.9) * l;
        seg(x, y, z, nx, ny, nz, i0 / last + (k / steps) * 0.25, i0 / last + ((k + 1) / steps) * 0.25, 0.55 * (1 - k / steps * 0.7), true);
        x = nx; y = ny; z = nz;
      }
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'aInfo', 'aSide']) {
      const at = g.attributes[k];
      at.clearUpdateRanges();
      at.addUpdateRange(0, this.n * at.itemSize);
      at.needsUpdate = true;
    }
  }

  update(env, ctx) {
    const S = env.strike, now = env.time;
    // a new bolt down to the sea: build its fork (out here, on the surface)
    if (S && S.ground && S.t !== this.t && ctx.world?.zone === 0 && !ctx.game?.view3d?.isUnder) {
      this.t = S.t;
      this.build(ctx.camera, S);
    }
    const age = now - this.t;
    const on = this.n > 0 && age >= 0 && age < 0.75;
    this.mesh.visible = on;
    if (!on) return;
    const u = this.uniforms;
    // the leader runs down in a few hundredths of a second; then the stroke flashes, and flickers
    u.uLead.value = Math.min(1.001, age / 0.07);
    const l = env.lightning || 0;
    u.uFlash.value = age < 0.07 ? 0.5 : Math.min(1.2, l / Math.max(0.3, S.k) * 1.1) * (age > 0.55 ? (0.75 - age) / 0.2 : 1);
    u.uBranch.value = Math.max(0, 1 - age / 0.3);
  }

  /** Shown for the shaders' warm-up (Renderer3D.warmUp). */
  warm(on) { this.mesh.visible = on; }
}

// ---------------------------------------------------------------- weather
// sand blown along the ground on a desert wind: streaks, like the rain's, but
// flying low and nearly level
const DUST = { n: 3200, box: 30, tall: 6, below: 2.2, fall: 0.6, near: 1.2 };

class Precipitation {
  constructor(scene) {
    this.shelter = new Shelter();
    const quad = [-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0];
    const sq = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
    this.rain = fallMesh(RAIN, RAIN_VS, RAIN_FS, quad, this.shelter, { uLen: { value: 0.55 }, uWidth: { value: 0.011 } });
    this.snow = fallMesh(SNOW, SNOW_VS, SNOW_FS, sq, this.shelter, { uSize: { value: 0.05 } });
    this.dust = fallMesh(DUST, RAIN_VS, RAIN_FS, quad, this.shelter, { uLen: { value: 0.75 }, uWidth: { value: 0.009 } });
    scene.add(this.rain, this.snow, this.dust);
    this.splash = new Splashes(scene);
    this.bolt = new Lightning(scene);
  }

  update(env, ctx, dt) {
    const game = ctx.game, v = game?.view3d, w = ctx.world;
    if (!v || !w) return;
    this.bolt.update(env, ctx);
    const zone = w.zone;
    // (under the sea, or below decks: a ship's cabins, her forecastle and her hold keep it off)
    const lv = game.player?.deck?.lvl;
    const under = !!v.isUnder || lv === 'cabin' || lv === 'captain' || lv === 'forecastle' || lv === 'hold';
    const rain = !zone && !under ? env.rain || 0 : 0;
    // (falling ash is drawn with the snow's flakes, in grey)
    const ash = !zone && !under ? env.ash || 0 : 0;
    const snow = zone !== 1 && zone !== 2 && !under ? Math.max(env.snow || 0, ash) : 0;
    const dust = !zone && !under ? env.mistDust || 0 : 0;
    const low = v.quality === 'low';
    this.rain.visible = rain > 0.03;
    this.snow.visible = snow > 0.03;
    this.dust.visible = dust > 0.08;
    if (!this.rain.visible) this.splash.clear();
    if (!this.rain.visible && !this.snow.visible && !this.dust.visible) return;
    const cam = ctx.camera;
    const wx = v.ox + cam.position.x, wy = v.oy + cam.position.z;
    this.shelter.update(ctx, w.wx(wx), wy);
    const so = (this._so || (this._so = new THREE.Vector2())).set(w.dx(v.ox, this.shelter.x0), this.shelter.y0 - v.oy);
    // lit like everything else: grey by day, dim at night, white in a lightning flash
    const amb = env.ambient || [1, 1, 1];
    const bright = Math.min(1.4, (amb[0] + amb[1] + amb[2]) / 3);
    const set = (mesh, spec, k, wind, col, alpha) => {
      const u = mesh.material.uniforms;
      u.uTime.value = env.time;
      u.uOrig.value.set(((v.ox % spec.box) + spec.box) % spec.box, ((v.oy % spec.box) + spec.box) % spec.box);
      u.uShelterO.value.copy(so);
      u.uWind.value.set((env.windX || 0) * wind, (env.windY || 0) * wind);
      // carried along by the wind a frame at a time (the wind times the game's
      // whole clock sent them racing whenever the wind or the storm changed)
      const dt = Math.min(0.25, Math.max(0, env.time - (mesh.userData.t ?? env.time)));
      mesh.userData.t = env.time;
      const d = u.uDrift.value.addScaledVector(u.uWind.value, dt);
      d.set(d.x % spec.box, d.y % spec.box);
      u.uColor.value.setRGB(col[0] * bright, col[1] * bright, col[2] * bright);
      u.uAlpha.value = alpha;
      mesh.geometry.instanceCount = Math.floor(spec.n * Math.min(1, k) * (low ? 0.5 : 1));
    };
    if (this.rain.visible) {
      set(this.rain, RAIN, 0.25 + rain * 0.75, 3.2 + (env.storm || 0) * 3, [0.78, 0.84, 0.95], 0.24 + rain * 0.22);
      this.splash.update(ctx, this.shelter, rain, bright, wx, wy, dt, env.time);
    }
    if (this.snow.visible) {
      const grey = ash > (env.snow || 0) ? 1 : 0;
      set(this.snow, SNOW, 0.2 + snow * 0.8, (1.1 + (env.storm || 0) * 2.2) * (grey ? 0.6 : 1), grey ? [0.32, 0.3, 0.3] : [1, 1, 1], grey ? 0.75 : 0.9);
    }
    if (this.dust.visible) set(this.dust, DUST, dust, 11, [0.86, 0.68, 0.45], 0.16 + dust * 0.26);
  }

  /** Every weather's shaders shown for the warm-up compile (Renderer3D.warmUp), then put back. */
  warm(on) {
    if (on) this.was = [this.rain.visible, this.snow.visible, this.dust.visible];
    [this.rain, this.snow, this.dust].forEach((m, i) => { m.visible = on || this.was[i]; });
    this.bolt.warm(on);
  }
}

let precip = null;
registerFrameHook((env, ctx, dt) => {
  if (!precip) { precip = new Precipitation(ctx.scene); if (ctx.game?.view3d) ctx.game.view3d.precip = precip; }
  precip.update(env, ctx, dt || 1 / 60);
}, 'precip');
