// The ocean: a disc of water centred on the player, dense near the middle so
// gentle swells can roll through it, sparse toward the horizon. The shader
// reads the world's coastline-distance field, so it knows how deep the water
// is everywhere: glass-clear turquoise shallows with sunlight rippling on the
// sand below, deep ocean blue offshore, lines of surf rolling into the
// beaches, foam at the waterline, sun sparkles and the sky mirrored at a
// glance. It also colours the other "liquids": the Skypiea cloud sea, lava,
// acid.
import * as THREE from 'three';

const VERT = /* glsl */`
  uniform vec2 uOrigin;
  uniform sampler2D uMap;
  uniform vec2 uSize;
  uniform float uTime;
  uniform float uAmp;
  varying vec3 vWorld;
  varying vec3 vView;
  varying vec3 vSwell;   // slope x, slope z, height (-1..1)
  #include <fog_pars_vertex>

  // three wind swells (world-anchored); returns height, writes the slope
  float swells(vec2 p, float t, out vec2 slope) {
    const vec2 D1 = vec2(0.96, 0.28), D2 = vec2(-0.37, 0.93), D3 = vec2(0.75, -0.66);
    const float K1 = 0.2856, K2 = 0.4833, K3 = 0.7854;       // 22 m, 13 m, 8 m
    const float W1 = 1.673, W2 = 2.177, W3 = 2.774;         // deep-water speeds
    float a1 = K1 * dot(D1, p) - W1 * t, a2 = K2 * dot(D2, p) - W2 * t + 1.7, a3 = K3 * dot(D3, p) - W3 * t + 4.1;
    float h = sin(a1) * 1.0 + sin(a2) * 0.6 + sin(a3) * 0.35;
    slope = (D1 * K1 * cos(a1) * 1.0 + D2 * K2 * cos(a2) * 0.6 + D3 * K3 * cos(a3) * 0.35) / 1.95;
    return h / 1.95;
  }

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 P = vec2(wp.x + uOrigin.x, wp.z + uOrigin.y);
    // calmer in the shallows (the sea floor rises), fading out with distance
    vec4 m = texture2D(uMap, P / uSize);
    float sd = (m.r * 255.0 - 128.0) * 0.25;
    float kind = floor(m.g * 255.0 + 0.5);
    float liquid = kind < 2.5 || kind == 5.0 || kind == 7.0 ? 1.0 : kind == 3.0 ? 0.5 : 0.15;
    float shore = mix(0.35, 1.0, smoothstep(0.5, -7.0, sd));
    float fade = 1.0 - smoothstep(70.0, 190.0, length(wp.xz - cameraPosition.xz));
    float A = uAmp * shore * fade * liquid;
    vec2 slope;
    float h = swells(P, uTime, slope);
    wp.y += h * A;
    vSwell = vec3(slope * A, h * step(0.001, A));
    vWorld = vec3(P.x, wp.y, P.y);
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
  uniform vec3 uSkyTop;
  uniform float uDay;
  uniform float uZone;
  uniform float uStorm;
  uniform float uDetail;
  varying vec3 vWorld;
  varying vec3 vView;
  varying vec3 vSwell;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float ripples(vec2 p, float t) {
    float h = (noise(p * 0.6 + vec2(t * 0.35, t * 0.2)) - 0.5) * 1.2;
    h += (noise(p * 1.7 - vec2(t * 0.6, -t * 0.4)) - 0.5) * 0.5;
    h += (noise(p * 4.1 + vec2(t * 0.9, t * 0.7)) - 0.5) * 0.18;
    return h;
  }
  // caustic network: the edges between moving Voronoi cells
  float caustic(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g);
      o = 0.5 + 0.42 * sin(t * 0.8 + 6.2831 * o);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return 1.0 - smoothstep(0.0, 0.09, d2 - d1);
  }

  void main() {
    vec2 uv = vec2(vWorld.x / uSize.x, vWorld.z / uSize.y);
    vec4 m = texture2D(uMap, uv);
    float sd = (m.r * 255.0 - 128.0) * 0.25;   // + land, - water (tiles)
    float kind = floor(m.g * 255.0 + 0.5);
    float depth = clamp(-sd, 0.0, 30.0);
    bool water = kind < 2.5 || kind == 5.0 || kind == 7.0;

    // the surface normal: swells plus small ripples
    float t = uTime * (1.0 + uStorm * 0.8);
    vec2 p = vWorld.xz;
    float e = 0.3;
    float r0 = ripples(p, t);
    vec2 rip = vec2(ripples(p + vec2(e, 0.0), t) - r0, ripples(p + vec2(0.0, e), t) - r0) / e * (0.09 + uStorm * 0.22);
    vec3 n = normalize(vec3(-vSwell.x - rip.x, 1.0, -vSwell.y - rip.y));
    vec3 v = normalize(vView);
    float ndv = max(dot(n, v), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    float light = mix(0.26, 1.0, uDay);

    // water colour by depth: lagoon, turquoise, blue, deep ocean
    vec3 deep = vec3(0.006, 0.07, 0.24), mid = vec3(0.01, 0.2, 0.44), shallow = vec3(0.03, 0.52, 0.56), lagoon = vec3(0.18, 0.74, 0.64);
    if (uZone > 1.5 && uZone < 2.5) { deep = vec3(0.01, 0.06, 0.18); mid = vec3(0.02, 0.14, 0.32); shallow = vec3(0.04, 0.32, 0.5); lagoon = shallow; }
    vec3 col = mix(deep, mid, exp(-depth * 0.07));
    col = mix(col, shallow, exp(-depth * 0.32));
    col = mix(col, lagoon, exp(-depth * 1.1) * 0.7);
    // light through the tops of the swells
    col += shallow * clamp(vSwell.z, 0.0, 1.0) * 0.28;
    float alpha = mix(0.96, 0.5, exp(-depth * 0.35));

    // other liquids
    if (kind == 3.0) { col = mix(vec3(0.86, 0.91, 0.97), vec3(1.0), noise(p * 0.15 + t * 0.05)); alpha = 1.0; fres *= 0.3; }
    else if (kind == 4.0) { col = mix(vec3(0.9, 0.25, 0.05), vec3(1.0, 0.7, 0.2), noise(p * 0.5 + t * 0.3)); alpha = 1.0; }
    else if (kind == 8.0) { col = mix(vec3(0.42, 0.69, 0.3), vec3(0.73, 0.86, 0.35), noise(p * 0.7 + t * 0.2)); alpha = 0.95; }
    else if (kind == 6.0) { col = vec3(0.02, 0.08, 0.18); alpha = 0.97; }

    col *= light * (0.82 + 0.18 * max(dot(n, uSunDir), 0.0));
    // sunlight rippling on the sand under the shallows
    if (water && uDetail > 0.5 && depth < 6.0) {
      float c = caustic(p * 0.42 + vec2(t * 0.03, t * 0.02), t) + caustic(p * 0.71 - vec2(t * 0.02, -t * 0.03) + 3.1, t * 1.3) * 0.6;
      col += vec3(0.55, 0.95, 0.85) * c * exp(-depth * 0.45) * 0.28 * uDay * (1.0 - uStorm);
    }
    // the sky, mirrored at a glance
    vec3 rd = reflect(-v, n);
    vec3 skyR = mix(uSky, uSkyTop, pow(clamp(rd.y, 0.0, 1.0), 0.6));
    col = mix(col, skyR * (0.45 + 0.55 * uDay), fres * 0.85);
    // the sun: a hard highlight, and sparkles along its path
    vec3 hlf = normalize(uSunDir + v);
    float nh = max(dot(n, hlf), 0.0);
    float sunUp = smoothstep(-0.05, 0.1, uSunDir.y) * (1.0 - uStorm * 0.85);
    col += uSunCol * (pow(nh, 320.0) * 3.2 + pow(nh, 42.0) * 0.12) * sunUp;
    if (uDetail > 0.5) {
      vec2 cell = floor(p * 2.6);
      float g = hash(cell);
      float tw = pow(max(0.0, sin(t * 3.1 + g * 40.0)), 12.0);
      vec2 fc = fract(p * 2.6) - 0.5;
      float dotS = 1.0 - smoothstep(0.04, 0.16, length(fc));
      float dist = length(vView);
      col += uSunCol * step(0.9, g) * tw * dotS * pow(nh, 14.0) * 2.5 * sunUp * (1.0 - smoothstep(18.0, 70.0, dist));
    }
    // surf: lines rolling in toward the beach, foam at the waterline, whitecaps
    float foam = 0.0;
    if (water) {
      float band = smoothstep(-5.0, -0.4, sd);
      float wave = fract(sd * 0.32 - t * 0.16 + noise(p * 0.18) * 0.55);
      float line = smoothstep(0.84, 0.9, wave) * (1.0 - smoothstep(0.93, 0.99, wave));
      line *= step(0.36, noise(p * 0.8 + vec2(t * 0.15, 0.0)));
      float edge = smoothstep(-1.0, -0.15, sd + (noise(p * 1.4 + t * 0.4) - 0.5) * 0.6);
      float caps = smoothstep(0.55, 0.8, vSwell.z) * step(0.62 - uStorm * 0.3, noise(p * 0.32 + t * 0.2)) * (0.15 + uStorm * 0.85);
      foam = clamp(max(edge, line * band * 0.9) + caps, 0.0, 1.0);
    } else if (kind == 7.0) {
      foam = smoothstep(-0.6, -0.1, sd) * 0.6;
    }
    col = mix(col, vec3(0.96, 0.99, 1.0) * light * 1.05, foam * 0.9);
    alpha = max(alpha, foam);

    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

/** A disc of rings: ~0.6 m apart at the centre, growing outward to the horizon. */
function discGeometry(radius = 1600, segs = 96) {
  const rings = [0];
  let r = 0.6, dr = 0.6;
  while (r < radius) { rings.push(r); dr *= 1.075; r += dr; }
  rings.push(radius);
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let k = 1; k < rings.length; k++) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * rings[k], 0, Math.sin(a) * rings[k]);
    }
  }
  const ring = (k, i) => (k === 0 ? 0 : 1 + (k - 1) * segs + ((i % segs) + segs) % segs);
  for (let i = 0; i < segs; i++) idx.push(0, ring(1, i + 1), ring(1, i));
  for (let k = 1; k < rings.length - 1; k++) {
    for (let i = 0; i < segs; i++) {
      const a = ring(k, i), b = ring(k, i + 1), c = ring(k + 1, i), d = ring(k + 1, i + 1);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Water {
  constructor(scene) {
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMap: { value: null },
        uSize: { value: new THREE.Vector2(1, 1) },
        uOrigin: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uAmp: { value: 0.14 },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
        uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
        uSky: { value: new THREE.Color(0.6, 0.8, 1) },
        uSkyTop: { value: new THREE.Color(0.2, 0.45, 0.85) },
        uDay: { value: 1 },
        uZone: { value: 0 },
        uStorm: { value: 0 },
        uDetail: { value: 1 },
      },
    ]);
    // the water writes depth, so the ink outlines see its surface (not the sea floor under it)
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: true, fog: true,
    });
    this.mesh = new THREE.Mesh(discGeometry(), this.material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.tex = null;
  }

  /** 'high' shows caustics and sparkles; 'low' skips them. */
  setDetail(q) { this.uniforms.uDetail.value = q === 'low' ? 0 : 1; }

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

  update(ox, oy, env, sunDir, sunCol, sky, skyTop) {
    const u = this.uniforms;
    u.uOrigin.value.set(ox, oy);
    u.uTime.value = env.time;
    u.uDay.value = env.daylight;
    u.uStorm.value = env.storm;
    // calm swells on a fine day, heavy ones in a storm; still water indoors and under the sea
    const zone = u.uZone.value;
    u.uAmp.value = zone >= 2 ? 0 : 0.14 + env.storm * 0.34;
    if (sunDir) u.uSunDir.value.copy(sunDir);
    if (sunCol) u.uSunCol.value.copy(sunCol);
    if (sky) u.uSky.value.copy(sky);
    if (skyTop) u.uSkyTop.value.copy(skyTop);
  }
}
