// Sky dome, sun, moon, stars and clouds, plus the scene lighting and fog —
// all driven by the game's clock and weather.
import * as THREE from 'three';
import { FOG } from './fog.js';
import { SunShadow } from './sunshadow.js';

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
  uniform float uNight, uTime, uCloud, uStorm, uZone, uDusk;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }

  // Cel-shaded cloud colour: sunlit tops, blue-grey undersides, a warm rim
  // when the sun is behind; lit is 0..1 (how much a point faces the sun).
  vec3 cloudCol(float lit, float rim) {
    vec3 sunC = mix(vec3(1.0), uSunCol, 0.45 + uDusk * 0.4);
    vec3 lightC = sunC * (1.0 - uNight * 0.82) * (1.0 - uStorm * 0.45);
    vec3 shadowC = mix(uHorizon, uTop, 0.45) * 0.72 + vec3(0.08, 0.09, 0.12);
    shadowC = mix(shadowC, vec3(0.42, 0.44, 0.5), uStorm * 0.6) * (1.0 - uNight * 0.75);
    float band = smoothstep(0.42, 0.5, lit) * 0.75 + smoothstep(0.7, 0.76, lit) * 0.25;
    vec3 c = mix(shadowC, lightC, band);
    return c + uSunCol * rim * 0.6 * (1.0 - uStorm) * (1.0 - uNight);
  }

  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    // below the horizon the sky only ever shows past the edge of the sea: keep it the far sea's hazy colour
    vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.35, -y) * 0.6);
    // sun and its glow
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.08 * uDusk) * (1.0 - uStorm * 0.8);
    // moon
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.9993, 0.9996, md) * uNight;
    // stars
    if (y > 0.0 && uNight > 0.01) {
      vec2 sp = d.xz / (d.y + 0.3) * 60.0;
      float s = step(0.996, hash(floor(sp))) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(floor(sp) + 3.1) * 20.0));
      col += vec3(s) * uNight * smoothstep(0.0, 0.25, y) * (1.0 - uStorm);
    }
    if (uZone == 2.0 || uZone == 3.0) { gl_FragColor = vec4(col, 1.0); return; }

    // --- distant cloud banks low on the horizon: flat-bottomed, billowing on
    // top, coming and going around the compass (noise, not circles)
    float az = atan(d.z, d.x);
    vec2 sunH = normalize(uSunDir.xz + vec2(1e-4));
    if (y > -0.012 && y < 0.24) {
      vec2 ap = vec2(cos(az), sin(az));
      float bank = smoothstep(0.42, 0.72, fbm(ap * 1.6 + 11.0)) + uCloud * 0.55 - 0.08;
      bank = clamp(bank, 0.0, 1.0);
      if (bank > 0.01) {
        float topH = bank * (0.022 + 0.1 * fbm(ap * 4.3 + 3.0));
        // a lumpy upper edge (in two scales) over a straight base
        float lumps = (fbm(ap * 14.0 + vec2(y * 26.0, 5.0)) - 0.5) * 0.045 + (noise(ap * 42.0 + 1.3) - 0.5) * 0.012;
        float inside = topH + lumps * (0.4 + bank) - y;
        if (inside > 0.0) {
          float body = smoothstep(0.0, 0.006, inside) * smoothstep(-0.012, 0.003, y);
          // lit from above and from the sun's side; the base in shade
          float up = clamp(y / max(topH, 0.004), 0.0, 1.0);
          float toward = dot(normalize(d.xz), sunH);
          float lit = clamp(0.3 + up * 0.5 + toward * 0.22 * clamp(uSunDir.y * 3.0 + 0.3, 0.0, 1.0) + (inside < 0.012 ? 0.12 : 0.0), 0.0, 1.0);
          float rim = (1.0 - smoothstep(0.0, 0.01, inside)) * pow(max(dot(d, uSunDir), 0.0), 6.0);
          vec3 cc = cloudCol(lit, rim);
          // the farthest melt into the haze at the horizon line
          cc = mix(cc, uHorizon, (1.0 - smoothstep(0.0, 0.07, y)) * 0.55);
          col = mix(col, cc, body * (0.55 + 0.4 * bank));
        }
      }
    }

    // --- fair-weather cumulus overhead, drifting on the wind
    if (y > 0.04) {
      vec2 cp = d.xz / (d.y + 0.12) * 1.25 + vec2(uTime * 0.008, uTime * 0.003);
      float cover = 0.56 - uCloud * 0.2;
      float n0 = fbm(cp);
      if (n0 > cover - 0.08) {
        // light: how the density falls away toward the sun (sunward edges are bright)
        float n1 = fbm(cp + sunH * 0.09);
        float lit = clamp(0.5 + (n0 - n1) * 6.0 + uSunDir.y * 0.25, 0.0, 1.0);
        float edge = smoothstep(cover, cover + 0.025, n0);
        float rim = (1.0 - smoothstep(cover, cover + 0.08, n0)) * pow(max(dot(d, uSunDir), 0.0), 4.0);
        vec3 cc = cloudCol(lit, rim * 2.0);
        col = mix(col, cc, edge * smoothstep(0.04, 0.2, y) * 0.96);
      }
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
      uCloud: { value: 0.3 }, uStorm: { value: 0 }, uZone: { value: 0 }, uDusk: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000; // after the opaque world: only the visible sky runs this shader
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow = new SunShadow();
    this.lightDir = new THREE.Vector3(0, 1, 0); // toward the sun by day, the moon by night
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x6b5a3a, 1.1);
    scene.add(this.hemi);
    this.fog = new THREE.Fog(0xbfdcff, 60, 700);
    scene.fog = this.fog;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.sunCol = new THREE.Color();
    this.horizon = new THREE.Color();
    this.top = new THREE.Color();
  }

  update(env, world, sailing) {
    const u = this.uniforms;
    const zone = world?.zone || 0;
    const c = env.clock;
    // sun path: rises in the east (+x), sets in the west, keeping to the day's
    // light (env.js: half light at 6h and at 19h), so it's still up, low and
    // golden, while the evening sky glows, and down only as it darkens. (Day
    // and night are each half a turn, at their own pace.)
    const a = c >= 6 && c <= 19 ? (c - 6) / 13 * Math.PI : Math.PI * (1 + ((c - 19 + 24) % 24) / 11);
    this.sunDir.set(Math.cos(a), Math.sin(a) * 0.95 + 0.05, 0.35).normalize();
    const moon = this.moonDir.set(-Math.cos(a), -Math.sin(a) * 0.9 + 0.1, -0.3).normalize();
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
    u.uCloud.value = 0.3 + env.storm * 0.7 + (env.fog || 0) * 0.2;
    u.uDusk.value = dusk;
    u.uStorm.value = env.storm;
    u.uZone.value = zone;
    this.horizon.setRGB(...hor);
    this.top.setRGB(...top);

    // lighting: the sun by day, a cool moon by night (the light itself is
    // placed with its shadow map, round you: see shadowAt). The sun fades
    // out over its last few degrees down to the horizon, warming as it goes,
    // and the moon's light comes up only as the sky darkens after it (and
    // goes before the dawn): the one light changes over from the one to the
    // other while it's dark, so the shadows never swing round at a stroke.
    const amb = env.ambient || [1, 1, 1];
    const sunUp = this.sunDir.y > 0;
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const low = 1 - sm(0.02, 0.4, this.sunDir.y); // 1 at the horizon, 0 well up
    const warm = Math.max(dusk, low * 0.9);
    this.lightDir.copy(sunUp ? this.sunDir : moon);
    this.sun.intensity = (sunUp ? 2.4 * Math.min(1, day + 0.15) * sm(0, 0.1, this.sunDir.y) : 0.5 * sm(0, 0.15, -this.sunDir.y) * sm(0, 0.1, moon.y))
      * (1 - env.storm * 0.55) * (zone === 3 ? 0.25 : zone === 2 ? 0.6 : 1);
    if (sunUp) this.sun.color.setRGB(1, 0.95 - warm * 0.24, 0.88 - warm * 0.42);
    else this.sun.color.setRGB(0.6, 0.7, 1);
    this.hemi.color.setRGB(amb[0] * 0.8, amb[1] * 0.85, amb[2] * 0.95);
    this.hemi.groundColor.setRGB(amb[0] * 0.45, amb[1] * 0.4, amb[2] * 0.35);
    this.hemi.intensity = 1.0 + (zone === 3 ? -0.3 : 0);
    // Fog (see fog.js): a thin sea haze on a clear day that thickens in storms,
    // snow and fog banks. On a clear day it closes in over the last 40% of the
    // render distance (maxFar, set from the terrain's reach, which is the
    // Settings one), complete right at its edge, so nothing is seen to pop in
    // or out; thick weather draws it in nearer still.
    let far = this.maxFar || (sailing ? 900 : 620);
    far *= (1 - env.fog * 0.72) * (1 - env.storm * 0.4);
    if (zone === 2) far = 170;
    if (zone === 3) far = 95;
    far = Math.max(60, Math.min(far, this.maxFar || far));
    this.fog.far = far;
    this.fog.near = far * 0.6;
    this.fog.color.copy(this.horizon);
    let dens = 0.0011 + env.storm * 0.0045 + env.fog * 0.013 + (env.snow ? 0.0025 : 0) + night * 0.0004;
    if (sailing) dens *= 0.8;
    if (zone === 2) dens = 0.012;
    else if (zone === 3) dens = 0.02;
    else if (zone === 1) dens = 0.0014;
    FOG.fogDensity2.value = dens;
    FOG.fogHeightK.value = zone === 1 ? 0.012 : 0.028;
    FOG.fogBase.value = zone === 1 ? -25 : 0; // the sky islands' haze lies on the cloud sea below
    // (the haze glows round the sun till it's well down, fading as it goes;
    // then, faded in from nothing, round the moon)
    const sunHaze = this.sunDir.y > -0.15;
    FOG.fogSunDir.value.copy(sunHaze ? this.sunDir : moon);
    const glow = (sunHaze ? sm(-0.15, 0, this.sunDir.y) : 0.25 * sm(-0.15, -0.3, this.sunDir.y)) * (1 - env.storm * 0.8) * (zone >= 2 ? 0.3 : 1);
    FOG.fogSunColor.value.copy(this.horizon).lerp(this.sunCol, 0.75 * glow).multiplyScalar(1 + 0.25 * glow);
  }

  /**
   * Places the sun (and its shadow map) round you: (x, y, z) where you stand
   * in the view's frame, (fx, fz) the way you look along the ground, (ox, oy)
   * where the view's frame sits in the world. See SunShadow.follow.
   */
  shadowAt(x, y, z, fx, fz, ox, oy) {
    this.sun.shadow.follow(this.sun, this.lightDir, x, y, z, fx, fz, ox, oy);
  }
}
