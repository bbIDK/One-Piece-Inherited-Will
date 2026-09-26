// Sky dome, sun, moon, stars and clouds, plus the scene lighting and fog —
// all driven by the game's clock and weather.
import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }
`;
const FRAG = /* glsl */`
  uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunCol, uMoonDir;
  uniform float uNight, uTime, uCloud, uStorm, uZone;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-y * 3.0, 0.0, 1.0));
    // sun and its glow
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.35) * (1.0 - uStorm * 0.8);
    // moon
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.9993, 0.9996, md) * uNight;
    // stars
    if (y > 0.0 && uNight > 0.01) {
      vec2 sp = d.xz / (d.y + 0.3) * 60.0;
      float s = step(0.996, hash(floor(sp))) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(floor(sp) + 3.1) * 20.0));
      col += vec3(s) * uNight * smoothstep(0.0, 0.25, y) * (1.0 - uStorm);
    }
    // clouds (a slow-moving layer)
    if (y > 0.0 && uZone != 2.0) {
      vec2 cp = d.xz / (d.y + 0.15) * 1.6 + vec2(uTime * 0.01, uTime * 0.004);
      float c = smoothstep(0.52 - uCloud * 0.25, 0.85, fbm(cp));
      vec3 cc = mix(vec3(1.0), uHorizon, 0.25) * (1.0 - uNight * 0.75) * (1.0 - uStorm * 0.55);
      col = mix(col, cc, c * smoothstep(0.0, 0.2, y) * 0.9);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uTime: { value: 0 },
      uCloud: { value: 0.3 }, uStorm: { value: 0 }, uZone: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x6b5a3a, 1.1);
    scene.add(this.hemi);
    this.fog = new THREE.Fog(0xbfdcff, 60, 700);
    scene.fog = this.fog;
    this.sunDir = new THREE.Vector3();
    this.sunCol = new THREE.Color();
    this.horizon = new THREE.Color();
  }

  update(env, world, sailing) {
    const u = this.uniforms;
    const zone = world?.zone || 0;
    const c = env.clock;
    // sun path: rises in the east (+x), sets in the west
    const a = (c - 6) / 12 * Math.PI; // 0 at 6h, π at 18h
    this.sunDir.set(Math.cos(a), Math.sin(a) * 0.95 + 0.05, 0.35).normalize();
    const moon = new THREE.Vector3(-Math.cos(a), -Math.sin(a) * 0.9 + 0.1, -0.3).normalize();
    const day = env.daylight;
    const night = 1 - day;
    const dusk = Math.max(0, 1 - Math.abs(c - 18.8) / 1.6, 1 - Math.abs(c - 6.2) / 1.6);
    let top = lerp3([0.02, 0.04, 0.12], [0.2, 0.47, 0.86], day);
    let hor = lerp3([0.06, 0.09, 0.2], [0.68, 0.84, 0.97], day);
    hor = lerp3(hor, [1.0, 0.62, 0.38], dusk * 0.75);
    top = lerp3(top, [0.35, 0.33, 0.6], dusk * 0.35);
    // weather
    const grey = Math.min(1, env.storm * 1.1 + env.fog * 0.6);
    top = lerp3(top, [0.32, 0.35, 0.4].map((v) => v * (0.3 + day * 0.7)), grey * 0.85);
    hor = lerp3(hor, [0.5, 0.53, 0.56].map((v) => v * (0.3 + day * 0.7)), grey * 0.85);
    let bottom = lerp3(hor, [0.05, 0.12, 0.2], 0.6);
    if (zone === 2) { // undersea
      top = [0.02, 0.12, 0.25]; hor = [0.04, 0.22, 0.38]; bottom = [0.01, 0.05, 0.1];
    } else if (zone === 3) { // prison interior
      top = [0.05, 0.02, 0.02]; hor = [0.18, 0.08, 0.06]; bottom = [0.05, 0.02, 0.02];
    } else if (zone === 1) { // sky island: brighter, whiter horizon
      hor = lerp3(hor, [0.95, 0.97, 1.0], 0.5 * day);
    }
    if (env.lightning > 0.3) { const k = env.lightning * 0.6; top = lerp3(top, [0.9, 0.92, 1], k); hor = lerp3(hor, [0.9, 0.92, 1], k); }
    u.uTop.value.setRGB(...top);
    u.uHorizon.value.setRGB(...hor);
    u.uBottom.value.setRGB(...bottom);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(moon);
    this.sunCol.setRGB(1, 0.92 - dusk * 0.2, 0.8 - dusk * 0.35);
    u.uSunCol.value.copy(this.sunCol);
    u.uNight.value = night;
    u.uTime.value = env.time;
    u.uCloud.value = 0.3 + env.storm * 0.7;
    u.uStorm.value = env.storm;
    u.uZone.value = zone;
    this.horizon.setRGB(...hor);

    // lighting: the sun by day, a cool moon by night
    const amb = env.ambient || [1, 1, 1];
    const lit = this.sunDir.y > 0 ? this.sunDir : moon;
    this.sun.position.copy(lit).multiplyScalar(120);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = (this.sunDir.y > 0 ? 2.4 * Math.min(1, day + 0.15) : 0.5) * (1 - env.storm * 0.55) * (zone === 3 ? 0.25 : zone === 2 ? 0.6 : 1);
    this.sun.color.setRGB(this.sunDir.y > 0 ? 1 : 0.6, this.sunDir.y > 0 ? 0.95 - dusk * 0.2 : 0.7, this.sunDir.y > 0 ? 0.88 - dusk * 0.35 : 1);
    this.hemi.color.setRGB(amb[0] * 0.8, amb[1] * 0.85, amb[2] * 0.95);
    this.hemi.groundColor.setRGB(amb[0] * 0.45, amb[1] * 0.4, amb[2] * 0.35);
    this.hemi.intensity = 1.0 + (zone === 3 ? -0.3 : 0);
    // fog: thick in storms, fog banks and under the sea; long at sea on a clear day
    const clear = sailing ? 900 : 520;
    let far = clear * (1 - env.fog * 0.8) * (1 - env.storm * 0.5);
    if (zone === 2) far = 160;
    if (zone === 3) far = 90;
    this.fog.near = Math.min(far * 0.35, 80);
    this.fog.far = Math.max(50, far);
    this.fog.color.copy(this.horizon);
  }
}
