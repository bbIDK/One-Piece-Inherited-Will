// The water of Reverse Mountain's canals: ribbons laid along each canal at
// the height its water has climbed to, with a shader of their own — streaks
// racing along with the current, foam against the rock walls, white water
// where the slope is steepest — and the churning pool on the summit where
// the four currents meet. (The sea's own water leaves these tiles alone: see
// water3d.js, kind 9.)
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { RM, CANALS } from '../world/reverseMountain.js';
import { rmArch } from './props/landmarks.js';

const VERT = /* glsl */`
  attribute float aSlope;
  attribute float aSpeed;
  varying vec2 vUv;
  varying float vSlope;
  varying float vSpeed;
  varying vec3 vWorld;
  varying vec3 vView;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv; vSlope = aSlope; vSpeed = aSpeed;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vView = cameraPosition - wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */`
  uniform float uTime;
  uniform float uDay;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSky;
  uniform float uPool;
  varying vec2 vUv;
  varying float vSlope;
  varying float vSpeed;
  varying vec3 vWorld;
  varying vec3 vView;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    float t = uTime;
    vec2 uv = vUv;
    // along the canal (metres) and across it (0..1); the pool swirls round
    float along = uv.y, across = uv.x;
    if (uPool > 0.5) {
      vec2 d = uv - 0.5;
      float r = length(d) * 2.0, a = atan(d.y, d.x);
      along = a * 18.0 + r * 30.0; across = r;
    }
    float run = t * vSpeed;
    // streaks stretched along the flow, racing with it
    float s1 = noise(vec2(across * 9.0, along * 0.22 - run * 0.22));
    float s2 = noise(vec2(across * 23.0 + 5.0, along * 0.6 - run * 0.55));
    float streak = s1 * 0.65 + s2 * 0.35;
    // the surface: a normal tilted by the streaks
    float e = 0.02;
    float sx = noise(vec2((across + e) * 9.0, along * 0.22 - run * 0.22)) - s1;
    vec3 n = normalize(vec3(-sx * 3.0, 1.0, -(s2 - 0.5) * 0.4));
    vec3 v = normalize(vView);
    float light = mix(0.3, 1.0, uDay);
    vec3 deep = vec3(0.02, 0.26, 0.44), bright = vec3(0.12, 0.62, 0.72);
    vec3 col = mix(deep, bright, streak * 0.7 + 0.15);
    // foam: against the walls, in the steep runs, and in the churning pool
    float wall = 1.0 - smoothstep(0.0, 0.16, min(across, 1.0 - across));
    float steep = smoothstep(0.08, 0.3, abs(vSlope));
    float foamN = noise(vec2(across * 14.0, along * 0.9 - run * 0.9)) * 0.6 + noise(vec2(across * 31.0, along * 2.1 - run * 1.7)) * 0.4;
    float foam = smoothstep(0.66, 0.88, foamN + wall * 0.4 + steep * 0.16);
    if (uPool > 0.5) foam = max(foam, smoothstep(0.5, 0.75, foamN + (1.0 - across) * 0.2));
    col = mix(col, vec3(0.93, 0.98, 1.0), foam * 0.85);
    col *= light * (0.8 + 0.2 * max(dot(n, uSunDir), 0.0));
    // sky at a glance, and the sun glinting off the rush
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    col = mix(col, uSky * (0.45 + 0.55 * uDay), fres * 0.6);
    vec3 h = normalize(uSunDir + v);
    col += uSunCol * pow(max(dot(n, h), 0.0), 120.0) * 1.4 * smoothstep(-0.05, 0.1, uSunDir.y);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

class CanalWater {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'rm-canals';
    scene.add(this.group);
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 }, uDay: { value: 1 }, uPool: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uSky: { value: new THREE.Color(0.6, 0.8, 1) },
      },
    ]);
    const mat = (pool) => {
      const m = new THREE.ShaderMaterial({ uniforms: { ...this.uniforms, uPool: { value: pool ? 1 : 0 } }, vertexShader: VERT, fragmentShader: FRAG, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      // (the shared uniforms stay shared: only uPool is the material's own)
      for (const k of Object.keys(this.uniforms)) if (k !== 'uPool') m.uniforms[k] = this.uniforms[k];
      return m;
    };
    this.mat = mat(false);
    this.poolMat = mat(true);
    this.built = false;
  }

  build(world) {
    this.built = true;
    for (const c of CANALS) {
      // (a little way out over the sea at the mouth, drawn over it: see polygonOffset)
      const i0 = Math.max(0, (c.i0 ?? 0) - (c.exit ? 0 : 1)), i1 = Math.min(c.x.length - 1, (c.i1 ?? c.x.length - 1) + (c.exit ? 1 : 0));
      if (i1 <= i0) continue;
      const n = i1 - i0 + 1;
      const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), slope = new Float32Array(n * 2), speed = new Float32Array(n * 2);
      const W = RM.halfW + 0.9;
      for (let k = 0; k < n; k++) {
        const i = i0 + k;
        const nx = -c.fy[i], ny = c.fx[i];
        const a = Math.max(i0, i - 1), b = Math.min(i1, i + 1);
        const sl = (c.lv[b] - c.lv[a]) / Math.max(0.1, c.s[b] - c.s[a]);
        const sp = c.exit ? RM.downSpeed : c.lv[i] > 0.5 ? RM.upSpeed : RM.upSpeed * 0.75;
        for (let side = 0; side < 2; side++) {
          const f = side ? 1 : -1;
          const o = (k * 2 + side);
          pos[o * 3] = c.x[i] + nx * W * f - RM.x;
          pos[o * 3 + 1] = c.lv[i] + 0.06;
          pos[o * 3 + 2] = c.y[i] + ny * W * f - RM.y;
          uv[o * 2] = side; uv[o * 2 + 1] = c.s[i];
          slope[o] = sl; speed[o] = sp;
        }
      }
      const idx = [];
      // (wound to face up)
      for (let k = 0; k < n - 1; k++) { const a = k * 2, b = a + 1, cc = a + 2, d = a + 3; idx.push(a, b, cc, b, d, cc); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aSlope', new THREE.BufferAttribute(slope, 1));
      g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mat);
      m.renderOrder = 1;
      this.group.add(m);
    }
    // the pool on the summit
    const pg = new THREE.CircleGeometry(RM.poolR + 1.5, 48);
    pg.rotateX(-Math.PI / 2);
    pg.translate(0, RM.top + 0.03, 0);
    const n = pg.attributes.position.count;
    pg.setAttribute('aSlope', new THREE.BufferAttribute(new Float32Array(n), 1));
    pg.setAttribute('aSpeed', new THREE.BufferAttribute(new Float32Array(n).fill(9), 1));
    const pool = new THREE.Mesh(pg, this.poolMat);
    pool.renderOrder = 1;
    this.group.add(pool);
    // the stone gates (landmarks seen from far off: they belong with the canals, not the nearby props)
    for (const gt of world.rmGates || []) {
      const arch = rmArch(gt.a);
      arch.position.set(gt.x - RM.x, gt.level, gt.y - RM.y);
      this.group.add(arch);
    }
  }

  update(ctx, env) {
    const w = ctx.world, g = ctx.game, v = g?.view3d;
    const on = !!(w && w.zone === 0 && w.reverseMountain && v);
    this.group.visible = on;
    if (!on) return;
    if (!this.built) this.build(w);
    const ox = v.ox, oy = v.oy;
    const dx = w.dx(ox, RM.x), dz = RM.y - oy;
    // (only when it could be in view at all)
    this.group.visible = Math.abs(dx) < 3500 && Math.abs(dz) < 4000;
    if (!this.group.visible) return;
    this.group.position.set(dx, 0, dz);
    const u = this.uniforms;
    u.uTime.value = env.time % 3600;
    u.uDay.value = env.daylight ?? 1;
    const wu = v.water?.uniforms;
    if (wu) { u.uSunDir.value.copy(wu.uSunDir.value); u.uSunCol.value.copy(wu.uSunCol.value); u.uSky.value.copy(wu.uSky.value); }
  }
}

let water = null;
registerFrameHook((env, ctx) => {
  if (!water) water = new CanalWater(ctx.scene);
  water.update(ctx, env);
}, 'rm-canals');
