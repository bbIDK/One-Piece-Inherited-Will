// The water of Reverse Mountain's canals: ribbons laid along each canal at
// the height its water has climbed to, with a shader of their own — streaks
// racing along with the current, foam against the rock walls, white water
// where the slope is steepest — and the churning pool on the summit where
// the four currents meet. (The sea's own water leaves these tiles alone: see
// water3d.js, kind 9.) Out at sea before each gate (and after the torrent's
// mouth) a ribbon fades in from the open sea over a hundred metres — its
// colour, its foam and its edges — so the sea runs into the rapids without a
// seam; the sea lies calm there under it (water3d.js uCalm).
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { RM, CANALS } from '../world/reverseMountain.js';
import { rmArch } from './props/landmarks.js';
import { SWELL_GLSL } from './swell.js';

const VERT = /* glsl */`
  attribute float aSlope;
  attribute float aSpeed;
  attribute float aFade;
  varying vec2 vUv;
  varying float vSlope;
  varying float vSpeed;
  varying float vFade;
  varying vec3 vWorld;
  varying vec3 vView;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv; vSlope = aSlope; vSpeed = aSpeed; vFade = aFade;
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
  uniform float uRipT;    // the sea's chop clock (water3d.js)
  uniform vec2 uOrigin;   // world tiles at the render origin: the sea's own coordinates
  uniform float uDay;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSky;
  uniform vec3 uSkyTop;
  uniform float uPool;
  varying vec2 vUv;
  varying float vSlope;
  varying float vSpeed;
  varying float vFade;
  varying vec3 vWorld;
  varying vec3 vView;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  ${SWELL_GLSL}
  // the sea's chop, cell for cell as water3d.js has it (so where this water
  // fades in over the sea, the two are the same planes)
  vec2 facets(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    vec2 c1 = i, c2 = i;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g);
      o = 0.5 + 0.38 * sin(t * 0.6 + 6.2831 * o);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; c2 = c1; d1 = d; c1 = i + g; } else if (d < d2) { d2 = d; c2 = i + g; }
    }
    vec2 h1 = hash2(c1 + 13.7), h2 = hash2(c2 + 13.7);
    float a1 = h1.x * 6.2831 + t * (h1.y - 0.5) * 1.6, a2 = h2.x * 6.2831 + t * (h2.y - 0.5) * 1.6;
    vec2 n1 = vec2(cos(a1), sin(a1)) * (0.3 + 0.7 * h1.y), n2 = vec2(cos(a2), sin(a2)) * (0.3 + 0.7 * h2.y);
    return mix(n2, n1, 0.5 + 0.5 * smoothstep(0.0, 0.16, d2 - d1));
  }

  void main() {
    float t = uTime;
    vec2 uv = vUv;
    // along the canal (metres) and across it (0..1); the pool swirls round
    float along = uv.y, across = uv.x, pr = 0.0;
    if (uPool > 0.5) {
      // (the pool: its water wound round its middle — twisted more the
      // nearer the middle and turning with time — and read off the twisted
      // point itself, so no seam runs across it, as an angle's would at
      // half a turn)
      vec2 d = uv - 0.5;
      float r = length(d) * 2.0;
      pr = r;
      float tw = t * 0.55 + (1.0 - r) * 3.2;
      vec2 q = vec2(d.x * cos(tw) - d.y * sin(tw), d.x * sin(tw) + d.y * cos(tw));
      along = q.x * 60.0 + q.y * 25.0; across = 0.5 + q.y * 0.9;
    }
    // (out at sea before a gate, 0: the open sea's own; 1 in the rapids)
    float fade = uPool > 0.5 ? 1.0 : vFade;
    float run = t * vSpeed * (0.35 + 0.65 * fade);
    // streaks stretched along the flow, racing with it
    float s1 = noise(vec2(across * 9.0, along * 0.22 - run * 0.22));
    float s2 = noise(vec2(across * 23.0 + 5.0, along * 0.6 - run * 0.55));
    float streak = s1 * 0.65 + s2 * 0.35;
    // the water's colour: the sea's own blue while the current runs level
    // (into the gates and through the gorges), turning to turquoise rapids
    // as it climbs the mountain (and races down the far side)
    float up = smoothstep(2.0, 30.0, vWorld.y);
    // the surface: the sea's chop (its own planes, in its own coordinates),
    // tilted by the streaks — the planes fewer as the rush takes over
    vec2 pw = vWorld.xz + uOrigin;
    vec2 fc = (facets(pw * 0.85, uRipT * 0.5) * 0.5 + facets(pw * 2.1 + 7.3, uRipT * 0.75) * 0.24) * 0.62 * mix(1.0, 0.4, up);
    float e = 0.02;
    float sx = noise(vec2((across + e) * 9.0, along * 0.22 - run * 0.22)) - s1;
    vec3 n = normalize(vec3(-sx * 3.0 * mix(0.4, 1.0, fade) - fc.x, 1.0, -(s2 - 0.5) * 0.4 - fc.y));
    vec3 v = normalize(vView);
    float light = mix(0.3, 1.0, uDay);
    vec3 deep = mix(vec3(0.006, 0.05, 0.27), vec3(0.02, 0.26, 0.44), up), bright = mix(vec3(0.01, 0.13, 0.46), vec3(0.12, 0.62, 0.72), up);
    vec3 col = mix(deep, bright, streak * mix(0.45, 0.7, up) * mix(0.5, 1.0, fade) + 0.15);
    // (and the sea's wide drifting patches, where it runs level)
    float big = sFbm(pw * 0.0045 + vec2(uTime * 0.004, -uTime * 0.003)) * 0.65 + sFbm(pw * 0.017 + 41.0 - uTime * 0.006) * 0.35;
    col *= mix(1.0, mix(0.62, 1.18, smoothstep(0.3, 0.72, big)), 1.0 - up);
    // foam: against the walls, in the steep runs, and in the churning pool
    float wall = 1.0 - smoothstep(0.0, 0.16, min(across, 1.0 - across));
    float steep = smoothstep(0.08, 0.3, abs(vSlope));
    float foamN = noise(vec2(across * 14.0, along * 0.9 - run * 0.9)) * 0.6 + noise(vec2(across * 31.0, along * 2.1 - run * 1.7)) * 0.4;
    float foam = smoothstep(0.66, 0.88, foamN + wall * 0.4 + steep * 0.16);
    if (uPool > 0.5) foam = max(foam, smoothstep(0.5, 0.75, foamN + (1.0 - pr) * 0.2));
    foam *= fade * fade * mix(0.45, 1.0, up);
    col = mix(col, vec3(0.93, 0.98, 1.0), foam * 0.85);
    col *= light * (0.8 + 0.2 * max(dot(n, uSunDir), 0.0));
    // sky at a glance — a facet at a time, as on the sea — and the sun glinting off the rush
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    float sheen = mix(fres, smoothstep(0.07, 0.16, fres) * 0.42 + fres * 0.4, 1.0 - up * 0.6);
    vec3 skyF = mix(uSky, uSkyTop * 1.15, 0.45);
    col = mix(col, skyF * (0.45 + 0.55 * uDay), sheen * mix(0.85, 0.6, up));
    vec3 h = normalize(uSunDir + v);
    float nh = max(dot(n, h), 0.0), sunUp = smoothstep(-0.05, 0.1, uSunDir.y);
    col += uSunCol * pow(nh, 120.0) * 1.4 * sunUp;
    col += uSunCol * smoothstep(0.988, 0.996, nh) * step(0.62, hash(floor(pw * 4.0))) * 1.6 * sunUp;
    // (at sea its edges melt into the water either side, as the middle does ahead)
    float edge = mix(smoothstep(0.0, 0.32, min(across, 1.0 - across)), 1.0, fade * fade);
    gl_FragColor = vec4(col, smoothstep(0.1, 1.0, fade) * edge);
    #include <fog_fragment>
  }
`;

const FADE_N = 25; // samples (4 m each) over which a canal's water fades in from the open sea
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

class CanalWater {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'rm-canals';
    scene.add(this.group);
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 }, uRipT: { value: 0 }, uOrigin: { value: new THREE.Vector2() }, uDay: { value: 1 }, uPool: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uSky: { value: new THREE.Color(0.6, 0.8, 1) },
        uSkyTop: { value: new THREE.Color(0.2, 0.45, 0.85) },
      },
    ]);
    const mat = (pool) => {
      const m = new THREE.ShaderMaterial({ uniforms: { ...this.uniforms, uPool: { value: pool ? 1 : 0 } }, vertexShader: VERT, fragmentShader: FRAG, fog: true, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
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
      // (out over the sea at the mouth, fading in from the open water: see the
      // shader's fade, and the sea calmed under it — water3d.js uCalm. The
      // rock begins 3 samples in from c.i0; on the torrent, 3 short of c.i1.)
      const last = c.x.length - 1;
      const land = c.exit ? (c.i1 ?? last) - 3 : (c.i0 ?? 0) + 3;
      const i0 = c.exit ? Math.max(0, c.i0 ?? 0) : Math.max(0, land - FADE_N);
      const i1 = c.exit ? Math.min(last, land + FADE_N) : Math.min(last, c.i1 ?? last);
      if (i1 <= i0) continue;
      const n = i1 - i0 + 1;
      const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), slope = new Float32Array(n * 2), speed = new Float32Array(n * 2), fade = new Float32Array(n * 2);
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
          fade[o] = c.exit ? 1 - smooth((i - land - 1) / (FADE_N - 1)) : smooth((i - (land - FADE_N)) / (FADE_N - 1));
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
      g.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mat);
      // (after the sea, which lies under its faded stretch out at sea: drawn
      // first, it kept the sea from being drawn there and the sky showed through)
      m.renderOrder = 2;
      this.group.add(m);
    }
    // the pool on the summit
    const pg = new THREE.CircleGeometry(RM.poolR + 1.5, 48);
    pg.rotateX(-Math.PI / 2);
    pg.translate(0, RM.top + 0.03, 0);
    const n = pg.attributes.position.count;
    pg.setAttribute('aSlope', new THREE.BufferAttribute(new Float32Array(n), 1));
    pg.setAttribute('aSpeed', new THREE.BufferAttribute(new Float32Array(n).fill(9), 1));
    pg.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    const pool = new THREE.Mesh(pg, this.poolMat);
    pool.renderOrder = 2;
    this.group.add(pool);
    // the stone gates (landmarks seen from far off: they belong with the canals, not the nearby props)
    this.arches = [];
    for (const gt of world.rmGates || []) {
      const arch = rmArch(gt.a, RM.halfW);
      arch.position.set(gt.x - RM.x, gt.level, gt.y - RM.y);
      this.group.add(arch);
      this.arches.push(arch);
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
    // (a gate past the edge of what's drawn would stand alone in the haze, a
    // ghost against the sky, with no cliff round it: out there, none)
    const cam = v.rig?.camera, far = v.sky?.fog?.far;
    if (cam && far) {
      for (const a of this.arches) a.visible = Math.hypot(a.position.x + dx - cam.position.x, a.position.z + dz - cam.position.z) < far * 0.97;
    }
    const u = this.uniforms;
    u.uTime.value = env.time % 3600;
    u.uDay.value = env.daylight ?? 1;
    const wu = v.water?.uniforms;
    if (wu) {
      u.uSunDir.value.copy(wu.uSunDir.value); u.uSunCol.value.copy(wu.uSunCol.value); u.uSky.value.copy(wu.uSky.value); u.uSkyTop.value.copy(wu.uSkyTop.value);
      u.uRipT.value = wu.uRipT.value;
    }
    u.uOrigin.value.set(ox, oy);
  }
}

let water = null;
registerFrameHook((env, ctx) => {
  if (!water) water = new CanalWater(ctx.scene);
  water.update(ctx, env);
}, 'rm-canals');
