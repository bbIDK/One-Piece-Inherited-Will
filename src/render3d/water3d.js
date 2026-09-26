// The ocean: one big plane at sea level that follows the camera. The shader
// reads the world's coastline-distance field, so it knows how deep the water
// is everywhere: turquoise shallows, deep blue open sea, surf on the beaches.
// It also colours the other "liquids": the Skypiea cloud sea, lava, acid.
import * as THREE from 'three';

const VERT = /* glsl */`
  uniform vec2 uOrigin;
  varying vec3 vWorld;
  varying vec3 vView;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = vec3(wp.x + uOrigin.x, wp.y, wp.z + uOrigin.y);
    vView = cameraPosition - wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uMap;   // r = coastline distance (128 = shore), g = liquid tile type
  uniform vec2 uSize;       // world size in tiles
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSky;
  uniform float uDay;
  uniform float uZone;
  uniform float uStorm;
  varying vec3 vWorld;
  varying vec3 vView;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float waves(vec2 p, float t) {
    float h = 0.0;
    h += sin(p.x * 0.35 + t * 1.1) * 0.5 + sin(p.y * 0.28 - t * 0.9) * 0.5;
    h += (noise(p * 0.6 + vec2(t * 0.35, t * 0.2)) - 0.5) * 1.2;
    h += (noise(p * 1.7 - vec2(t * 0.6, -t * 0.4)) - 0.5) * 0.5;
    return h;
  }

  void main() {
    vec2 uv = vec2(vWorld.x / uSize.x, vWorld.z / uSize.y);
    vec4 m = texture2D(uMap, uv);
    float sd = (m.r * 255.0 - 128.0) * 0.25;   // + land, - water (tiles)
    float kind = floor(m.g * 255.0 + 0.5);
    float depth = clamp(-sd, 0.0, 30.0);

    // wave normal
    float t = uTime * (1.0 + uStorm * 0.8);
    vec2 p = vWorld.xz;
    float e = 0.35;
    float h0 = waves(p, t);
    vec3 n = normalize(vec3(-(waves(p + vec2(e, 0.0), t) - h0) / e * (0.18 + uStorm * 0.25), 1.0, -(waves(p + vec2(0.0, e), t) - h0) / e * (0.18 + uStorm * 0.25)));
    vec3 v = normalize(vView);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    vec3 deep = vec3(0.05, 0.27, 0.52);
    vec3 shallow = vec3(0.16, 0.66, 0.78);
    if (uZone > 1.5 && uZone < 2.5) { deep = vec3(0.02, 0.1, 0.25); shallow = vec3(0.05, 0.35, 0.55); }
    float sh = exp(-depth * 0.22);
    vec3 col = mix(deep, shallow, sh);
    float alpha = mix(0.93, 0.62, sh);

    // other liquids
    if (kind == 3.0) { col = mix(vec3(0.86, 0.91, 0.97), vec3(1.0), noise(p * 0.15 + t * 0.05)); alpha = 1.0; fres *= 0.3; }
    else if (kind == 4.0) { col = mix(vec3(0.9, 0.25, 0.05), vec3(1.0, 0.7, 0.2), noise(p * 0.5 + t * 0.3)); alpha = 1.0; }
    else if (kind == 8.0) { col = mix(vec3(0.42, 0.69, 0.3), vec3(0.73, 0.86, 0.35), noise(p * 0.7 + t * 0.2)); alpha = 0.95; }
    else if (kind == 6.0) { col = vec3(0.02, 0.08, 0.18); alpha = 0.97; }

    float light = mix(0.28, 1.0, uDay);
    col *= light;
    col = mix(col, uSky * (0.55 + 0.45 * uDay), fres * 0.55);
    // sun glitter
    vec3 hlf = normalize(uSunDir + v);
    float spec = pow(max(dot(n, hlf), 0.0), 120.0) * (0.4 + 0.6 * uDay);
    col += uSunCol * spec * 1.4;
    // surf on the beaches and whitecaps in storms
    float foamBand = smoothstep(-1.4, -0.15, sd) * (1.0 - smoothstep(-0.15, 0.25, sd));
    float foamNoise = noise(p * 1.3 + vec2(t * 0.5, 0.0));
    float surf = foamBand * smoothstep(0.35, 0.65, foamNoise + 0.25 * sin(sd * 6.0 - t * 2.5));
    float caps = uStorm * smoothstep(0.72, 0.9, noise(p * 0.45 + t * 0.4));
    if (kind < 2.5 || kind == 7.0) col = mix(col, vec3(0.97) * light + 0.1, clamp(surf + caps, 0.0, 1.0) * 0.85);
    alpha = max(alpha, clamp(surf, 0.0, 1.0));

    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

export class Water {
  constructor(scene) {
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMap: { value: null },
        uSize: { value: new THREE.Vector2(1, 1) },
        uOrigin: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
        uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
        uSky: { value: new THREE.Color(0.6, 0.8, 1) },
        uDay: { value: 1 },
        uZone: { value: 0 },
        uStorm: { value: 0 },
      },
    ]);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, fog: true,
    });
    const geo = new THREE.PlaneGeometry(3000, 3000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.tex = null;
  }

  setWorld(world) {
    if (this.tex) this.tex.dispose();
    const W = world.width, H = world.height;
    const data = new Uint8Array(W * H * 2);
    const d = world.data, dist = world.dist;
    for (let i = 0, n = W * H; i < n; i++) {
      data[i * 2] = dist[i];
      const t = d[i << 2];
      data[i * 2 + 1] = t < 16 ? t : 255;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGFormat, THREE.UnsignedByteType);
    tex.wrapS = world.wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.tex = tex;
    this.uniforms.uMap.value = tex;
    this.uniforms.uSize.value.set(W, H);
    this.uniforms.uZone.value = world.zone || 0;
  }

  update(ox, oy, env, sunDir, sunCol, sky) {
    const u = this.uniforms;
    u.uOrigin.value.set(ox, oy);
    u.uTime.value = env.time;
    u.uDay.value = env.daylight;
    u.uStorm.value = env.storm;
    if (sunDir) u.uSunDir.value.copy(sunDir);
    if (sunCol) u.uSunCol.value.copy(sunCol);
    if (sky) u.uSky.value.copy(sky);
  }
}
