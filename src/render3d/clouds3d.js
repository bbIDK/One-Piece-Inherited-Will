// Clouds you can fly through: real heaps of cumulus, out in the world.
//
// The sky dome (sky3d.js) paints the far sky's clouds; these are the near
// ones, a kilometre round you, as puffs in the world itself — a cluster of
// cel-shaded billows to a cloud, flat-bottomed, lit by the sun on top and
// shaded lavender underneath in the same colours the sky gives its own. They
// lie in cells fixed to the world (wrapping round the planet with it), so the
// same cloud is over the same island as you come and go, and the whole field
// drifts with the wind. How many there are is the weather's (env.cloud: a
// clear day, a few; a grey one, many, lower and greyer). The planet's bend
// takes the far ones down to the horizon; they fade into the sky there, and
// fade away as you fly into one (seen from inside: a white-out, not its
// back faces).
import * as THREE from 'three';
import { curveStmt } from './curvature.js';

const CELL = 240; // m: one cloud a cell, at most
const REACH = 5; // cells out from you each way (≈1.2 km)
const PUFFS = 9; // billows a cloud, at most
const NEAR = 28, FAR0 = 760, FAR1 = 1150; // m: where they fade (into you, into the sky)

const hash = (a, b, k) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(k | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const VERT = /* glsl */`
  uniform float uNear, uFar0, uFar1;
  varying vec3 vN;
  varying float vFade;
  varying float vLow;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    // (how far up the billow this point is: the undersides shade darker)
    vLow = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    float d = length(wp.xz - cameraPosition.xz);
    float r = length(wp.xyz - cameraPosition);
    vFade = smoothstep(uNear * 0.35, uNear, r) * (1.0 - smoothstep(uFar0, uFar1, d));
    ${curveStmt('wp')}
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRAG = /* glsl */`
  uniform vec3 uLit, uMid, uShade, uSun;
  uniform float uOpacity;
  varying vec3 vN;
  varying float vFade;
  varying float vLow;
  void main() {
    float l = dot(normalize(vN), uSun) * 0.5 + 0.5;
    l = mix(l, l * 0.55, 1.0 - smoothstep(0.0, 0.45, vLow));
    // three flat tones, anime style: sunlit, mid, shade
    vec3 c = l > 0.62 ? uLit : l > 0.38 ? uMid : uShade;
    float a = vFade * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a);
  }
`;

export class Clouds {
  constructor(scene, sky) {
    this.sky = sky;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const u = sky.uniforms;
    this.uniforms = {
      uLit: u.uCLit, uMid: u.uCMid, uShade: u.uCShade,
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uOpacity: { value: 1 }, uNear: { value: NEAR }, uFar0: { value: FAR0 }, uFar1: { value: FAR1 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true });
    const n = (REACH * 2 + 1) ** 2 * PUFFS;
    this.mesh = new THREE.InstancedMesh(geo, this.material, n);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = -1;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
    this.drift = { x: 0, y: 0 };
    this.key = '';
    this.lastT = null;
    this.on = true;
  }

  /** Lay out the clouds round cell (cx, cy) of the drifting field: as many as `cover` (0..1) brings. */
  build(cx, cy, cover, storm, low, rain) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const e = new THREE.Euler();
    let k = 0;
    const R = low ? REACH - 1 : REACH;
    // (the share of cells with a cloud; heavier skies bring them lower and bigger)
    const share = 0.12 + cover * 0.75;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const gx = cx + i, gy = cy + j;
      // (where it's raining, the rain comes out of something: heavy cloud right over you and round you)
      const over = rain > 0.1 && Math.abs(i) <= 1 && Math.abs(j) <= 1;
      if (!over && hash(gx, gy, 1) > share) continue;
      const size = 0.6 + hash(gx, gy, 2) * 0.8 + storm * 0.5 + (over ? 0.6 + rain * 0.6 : 0);
      const ox = (gx + 0.2 + hash(gx, gy, 3) * 0.6) * CELL, oy = (gy + 0.2 + hash(gx, gy, 4) * 0.6) * CELL;
      const base = 150 + hash(gx, gy, 5) * 70 - storm * 50 - (over ? 30 + rain * 25 : 0);
      const n = 4 + Math.floor(hash(gx, gy, 6) * (PUFFS - 4 + 1));
      const len = 40 * size, wid = 22 * size;
      const ang = hash(gx, gy, 7) * Math.PI;
      for (let b = 0; b < n && k < this.mesh.instanceMatrix.count; b++) {
        const t = n > 1 ? b / (n - 1) - 0.5 : 0;
        const mid = 1 - Math.abs(t) * 1.4; // (the middle billows tallest)
        const r = (14 + hash(gx * 7 + b, gy, 8) * 10) * size * (0.7 + mid * 0.5);
        const along = t * len * 2, across = (hash(gx, gy * 3 + b, 9) - 0.5) * wid;
        p.set(ox + Math.cos(ang) * along - Math.sin(ang) * across, base + r * 0.45 + mid * 6 * size, oy + Math.sin(ang) * along + Math.cos(ang) * across);
        // (flat-bottomed: squashed a little, sitting on the cloud's base)
        s.set(r, r * 0.72, r * (0.85 + hash(b, gx, 10) * 0.3));
        q.setFromEuler(e.set(0, hash(gx, b, 11) * Math.PI * 2, 0));
        m.compose(p, q, s);
        this.mesh.setMatrixAt(k++, m);
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Each frame: drift on the wind, follow the view, show as many as the
   * weather has. (ox, oy): where the view is in the world; w: the world.
   */
  update(env, w, ox, oy, low) {
    const zone = w?.zone || 0;
    const show = this.on && zone === 0 && !!w;
    this.mesh.visible = show;
    if (!show) return;
    const dt = this.lastT === null ? 0 : Math.min(0.25, Math.max(0, env.time - this.lastT));
    this.lastT = env.time;
    // (the wind carries them along: a few metres a second)
    const wX = env.windX ?? 0.7, wY = env.windY ?? 0.3;
    this.drift.x += wX * 3.2 * dt;
    this.drift.y += wY * 3.2 * dt;
    const W = w.width || 1;
    const dx = ((this.drift.x % W) + W) % W, dy = this.drift.y;
    // the field is laid out in its own (drifting) frame: whole cells of it round you
    const fx = ox - dx, fy = oy - dy;
    const cx = Math.floor(fx / CELL), cy = Math.floor(fy / CELL);
    const cover = Math.min(1, this.sky.uniforms.uCloud.value);
    const storm = this.sky.uniforms.uStorm.value;
    const rain = Math.max(env.rain || 0, env.snow || 0);
    const key = `${cx},${cy},${Math.round(cover * 20)},${Math.round(storm * 10)},${Math.round(rain * 5)},${low ? 1 : 0}`;
    if (key !== this.key) { this.key = key; this.build(cx, cy, cover, storm, low, rain); }
    // the field's frame, about the view (the world is drawn round a floating origin at you)
    this.mesh.position.set(-fx, 0, -fy);
    this.uniforms.uSun.value.copy(this.sky.lightDir || this.sky.sunDir);
    this.uniforms.uOpacity.value = 1;
  }
}
