// Fish-Man Island's bubble as you see it (world/bubble.js has its shape): a
// dome of air over the whole zone, 10,000 m under the sea.
//   From inside, its skin is the sky: the deep sea seen through it, dark
//   round its foot and lighter overhead, where the sunlight comes down from
//   far above — fanned out in rays, rippling — with a bubble's thin-film
//   colours where you see the skin edge on, and a bright line round its foot
//   on the water.
//   From outside (a ship coming down through the deep: zones.js dive), a
//   great bubble glowing in the dark, the island lit up inside it.
// And Eve's light: shafts of sunlight falling from high above, through the
// bubble, onto the island.
import * as THREE from 'three';
import { domeR } from '../world/bubble.js';

const DOME_VERT = /* glsl */`
  varying vec3 vL; varying vec3 vN; varying vec3 vV;
  void main() {
    vL = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// the skin from inside: the deep sea through it (coloured by where on the
// dome a point is, not by the way you look, so it's the same sky from anywhere)
const INNER_FRAG = /* glsl */`
  uniform float uTime, uDay;
  uniform vec3 uDeep, uMid, uGlow;
  varying vec3 vL; varying vec3 vN; varying vec3 vV;
  void main() {
    float hgt = clamp(vL.y, 0.0, 1.0);
    float az = atan(vL.z, vL.x);
    vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.75, hgt));
    col = mix(col, uGlow, smoothstep(0.6, 1.0, hgt) * 0.8);
    // the sun's light coming down through the water, fanned out from overhead
    float rays = 0.5 + 0.5 * sin(az * 31.0 + sin(az * 7.0 + uTime * 0.07) * 2.6 + uTime * 0.02);
    rays *= 0.5 + 0.5 * sin(az * 13.0 - uTime * 0.05 + 1.7);
    col += uGlow * pow(rays, 3.0) * smoothstep(0.12, 0.9, hgt) * 0.3;
    // and rippling high up, as it does under the surface of the sea
    vec2 cp = vL.xz * 9.0;
    float cs = sin(cp.x + uTime * 0.5 + sin(cp.y * 1.3 + uTime * 0.31)) * sin(cp.y * 1.1 - uTime * 0.4 + sin(cp.x * 0.9));
    col += uGlow * smoothstep(0.55, 1.0, cs) * smoothstep(0.45, 1.0, hgt) * 0.16;
    // the bubble's skin: thin-film colours seen edge on, a bright line round its foot on the water
    vec3 n = normalize(vN), v = normalize(vV);
    float f = 1.0 - abs(dot(n, v));
    vec3 irid = 0.55 + 0.45 * cos(6.2831 * (f * 1.6 + hgt * 2.0 + uTime * 0.03 + vec3(0.0, 0.33, 0.67)));
    col = mix(col, irid * mix(uMid, vec3(1.0), 0.5), pow(f, 3.0) * 0.3);
    col += vec3(0.75, 0.95, 1.0) * smoothstep(0.04, 0.0, hgt) * 0.55;
    col *= mix(0.22, 1.0, uDay);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// the skin from outside: a soap bubble the size of an island, glowing in the dark
const OUTER_FRAG = /* glsl */`
  uniform float uTime, uDay;
  varying vec3 vL; varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 n = normalize(vN), v = normalize(vV);
    float f = 1.0 - abs(dot(n, v));
    float rim = pow(f, 2.0);
    vec3 irid = 0.55 + 0.45 * cos(6.2831 * (f * 1.3 + vL.y * 0.6 + uTime * 0.04 + vec3(0.0, 0.33, 0.67)));
    vec3 col = mix(vec3(0.7, 0.92, 1.0), irid, 0.45);
    float spec = pow(max(0.0, dot(reflect(-v, n), normalize(vec3(0.2, 1.0, 0.3)))), 60.0);
    col += spec * 1.2;
    float a = 0.07 + rim * 0.55 + spec;
    gl_FragColor = vec4(col * mix(0.4, 1.0, uDay), clamp(a, 0.0, 0.9));
  }
`;

// a shaft of sunlight: bright down its middle, nothing at its edges, fading
// in below the surface far above and out before the ground
const SHAFT_VERT = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying float vT;
  void main() {
    vT = 0.5 - position.y; // (0 at the top of the unit cylinder, 1 at its foot)
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const SHAFT_FRAG = /* glsl */`
  uniform float uTime, uDay, uSeed;
  varying vec3 vN; varying vec3 vV; varying float vT;
  void main() {
    vec3 n = normalize(vN), v = normalize(vV);
    float core = pow(abs(dot(n, v)), 1.6);
    float along = smoothstep(0.0, 0.3, vT) * (1.0 - smoothstep(0.62, 1.0, vT));
    float flick = 0.72 + 0.28 * sin(uTime * 0.55 + uSeed * 7.0 + vT * 3.0);
    // (no white-out when you stand in one)
    float near = smoothstep(6.0, 45.0, length(vV));
    float a = core * along * flick * near * 0.11 * mix(0.15, 1.0, uDay);
    gl_FragColor = vec4(vec3(0.78, 0.96, 1.0), a);
  }
`;

// the colours of the deep through the bubble, by day (the sky's, and the haze's: sky3d.js)
export const DEEP = [0.035, 0.17, 0.33], MID = [0.08, 0.37, 0.6], GLOW = [0.56, 0.86, 0.96];

export class BubbleDome {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.bubble = null;
    this.time = { value: 0 };
    this.day = { value: 1 };
  }

  /** Build (or take down) the dome for the world being drawn. */
  setWorld(world) {
    const b = world?.bubble || null;
    if (b === this.bubble) return;
    this.dispose();
    this.bubble = b;
    if (!b) return;
    const g = this.group = new THREE.Group();
    g.name = 'bubble-dome';
    // half an ellipsoid (and a skirt a little way under the sea, so no seam shows at its foot)
    const geo = new THREE.SphereGeometry(1, 96, 40, 0, Math.PI * 2, 0, Math.PI * 0.53);
    const col = (c) => new THREE.Vector3(...c);
    const common = { uTime: this.time, uDay: this.day };
    const inner = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { ...common, uDeep: { value: col(DEEP) }, uMid: { value: col(MID) }, uGlow: { value: col(GLOW) } },
      vertexShader: DOME_VERT, fragmentShader: INNER_FRAG, side: THREE.BackSide, fog: false,
    }));
    const outer = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: common, vertexShader: DOME_VERT, fragmentShader: OUTER_FRAG,
      side: THREE.FrontSide, transparent: true, depthWrite: false, fog: false,
    }));
    outer.renderOrder = 6;
    for (const m of [inner, outer]) { m.scale.set(b.a, b.h, b.b); m.frustumCulled = false; g.add(m); }
    // Eve's light: shafts falling from far above onto the island (round the middle of the bubble)
    const shaftGeo = new THREE.CylinderGeometry(1, 1.7, 1, 20, 1, true);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + 0.6, r = 0.12 + 0.3 * Math.sqrt((i + 0.5) / n);
      const m = new THREE.Mesh(shaftGeo, new THREE.ShaderMaterial({
        uniforms: { ...common, uSeed: { value: i * 0.37 } }, vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
        side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      const wide = 7 + (i % 3) * 3.5, len = b.h * 2.6;
      m.scale.set(wide, len, wide);
      // (slanting a little, all the same way, as light does)
      m.rotation.set(0.07, 0, -0.1);
      m.position.set(Math.cos(a) * r * b.a, len / 2 - 4, Math.sin(a) * r * b.b);
      m.renderOrder = 7;
      m.frustumCulled = false;
      g.add(m);
    }
    this.scene.add(g);
  }

  dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    const geos = new Set();
    this.group.traverse((o) => { if (o.isMesh) { geos.add(o.geometry); o.material.dispose(); } });
    for (const gg of geos) gg.dispose();
    this.group = null;
  }

  /**
   * Each frame: placed in the view's frame (whose origin is (ox, oy) in the
   * world). Returns how far inside the bubble the camera is: 1 inside, 0
   * outside, between them across its skin (for the sky and the haze).
   */
  update(world, ox, oy, env, cam) {
    if ((world?.bubble || null) !== this.bubble) this.setWorld(world);
    const b = this.bubble;
    if (!b || !this.group) return 1;
    this.group.position.set(world.dx(ox, b.x), 0, b.y - oy);
    this.time.value = env.time;
    this.day.value = env.daylight;
    const r = domeR(b, ox + cam.position.x, oy + cam.position.z, cam.position.y);
    return 1 - Math.min(1, Math.max(0, (r - 0.985) / 0.03));
  }
}
