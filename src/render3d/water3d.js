// The ocean: a disc of water centred on the player, dense near the middle so
// gentle swells can roll through it, sparse toward the horizon. The shader
// reads the world's coastline-distance field, so it knows how deep the water
// is everywhere: glass-clear turquoise shallows with sunlight rippling on the
// sand below, deep ocean blue offshore, lines of surf rolling into the
// beaches, foam at the waterline, sun sparkles and the sky mirrored at a
// glance. It also colours the other "liquids": the Skypiea cloud sea, lava,
// acid.
import * as THREE from 'three';

// The wind swells, shared by both shaders (the vertices move with them; the
// pixels shade with them, so the level-of-detail rings of the disc never show
// as seams). Three trains of waves, each gathered into groups that come and
// go across the sea, their crests gently bent, so from high up they don't
// line up into a repeating grid.
const SWELL = /* glsl */`
  float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
  }
  // two octaves, rotated against each other (no grid-aligned blobs)
  float sFbm(vec2 p) {
    float a = sNoise(p);
    p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.03 + 17.3;
    return a * 0.64 + sNoise(p) * 0.36;
  }
  float swells(vec2 p, float t, out vec2 slope) {
    const vec2 D1 = vec2(0.96, 0.28), D2 = vec2(-0.37, 0.93), D3 = vec2(0.75, -0.66);
    const float K1 = 0.2856, K2 = 0.4833, K3 = 0.7854;       // 22 m, 13 m, 8 m
    const float W1 = 1.673, W2 = 2.177, W3 = 2.774;         // deep-water speeds
    // bent crests
    vec2 q = p + (vec2(sNoise(p * 0.021), sNoise(p * 0.021 + 7.7)) - 0.5) * 14.0;
    // wave groups
    float g1 = 0.35 + 0.9 * sFbm(p * 0.011 + vec2(t * 0.02, 0.0));
    float g2 = 0.3 + 0.9 * sFbm(p * 0.017 + 31.0 - vec2(0.0, t * 0.025));
    float g3 = 0.3 + 0.9 * sFbm(p * 0.026 + 57.0);
    float a1 = K1 * dot(D1, q) - W1 * t, a2 = K2 * dot(D2, q) - W2 * t + 1.7, a3 = K3 * dot(D3, q) - W3 * t + 4.1;
    float h = sin(a1) * g1 + sin(a2) * 0.6 * g2 + sin(a3) * 0.35 * g3;
    slope = (D1 * K1 * cos(a1) * g1 + D2 * K2 * cos(a2) * 0.6 * g2 + D3 * K3 * cos(a3) * 0.35 * g3) / 1.95;
    return h / 1.95;
  }
`;

const VERT = /* glsl */`
  uniform vec2 uOrigin;
  uniform sampler2D uMap;
  uniform vec2 uSize;
  uniform float uTime;
  uniform float uAmp;
  uniform vec2 uWin;
  varying vec3 vWorld;
  varying vec3 vView;
  varying vec3 vSwell;   // slope x, slope z, height (-1..1)
  #include <fog_pars_vertex>

  ${SWELL}

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 P = vec2(wp.x + uOrigin.x, wp.z + uOrigin.y);
    // calmer in the shallows (the sea floor rises), fading out with distance
    vec4 m = texture2D(uMap, P / uSize);
    float sd = (m.r * 255.0 - 128.0) * 0.25;
    // (the tile type is read at the tile's centre: blending types makes phantom liquids)
    float kind = floor(texture2D(uMap, (floor(P) + 0.5) / uSize).g * 255.0 + 0.5);
    // (past the edge of the window round the camera: open sea)
    if (max(abs(P.x - uWin.x), abs(P.y - uWin.y)) > 1000.0) { sd = -32.0; kind = 0.0; }
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
  uniform vec2 uSize;       // the window's size in tiles (it repeats)
  uniform vec2 uWin;        // the window's centre
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSky;
  uniform vec3 uSkyTop;
  uniform float uDay;
  uniform float uZone;
  uniform float uStorm;
  uniform float uDetail;
  uniform float uUnder;
  varying vec3 vWorld;
  varying vec3 vView;
  varying vec3 vSwell;
  #include <fog_pars_fragment>

  uniform float uAmp;
  ${SWELL}
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
    // seen from below (diving): a bright rippling ceiling — the sky shows through
    // a window straight overhead, beyond it the surface mirrors the deep
    if (!gl_FrontFacing) {
      if (uUnder < 0.5) discard;
      float tu = uTime;
      vec2 pu = vWorld.xz;
      vec3 vu = normalize(vView);
      float up = clamp(-vu.y, 0.0, 1.0);
      float r0u = ripples(pu, tu);
      float wob = (ripples(pu + vec2(0.3, 0.0), tu) - r0u) * 0.8;
      float win = smoothstep(0.62, 0.8, up + wob * 0.12);
      vec3 deepU = vec3(0.02, 0.2, 0.3) * mix(0.3, 1.0, uDay);
      vec3 skyU = mix(uSky, uSkyTop, 0.5) * (0.35 + 0.75 * uDay) + uSunCol * pow(up, 24.0) * 0.8 * uDay;
      vec3 colU = mix(deepU * (0.8 + 0.4 * r0u), skyU, win);
      colU += vec3(0.6, 0.9, 1.0) * caustic(pu * 0.35 + vec2(tu * 0.05, tu * 0.03), tu) * 0.12 * uDay * win;
      gl_FragColor = vec4(colU, 1.0);
      #include <fog_fragment>
      return;
    }
    vec2 uv = vec2(vWorld.x / uSize.x, vWorld.z / uSize.y);
    vec4 m = texture2D(uMap, uv);
    float sd = (m.r * 255.0 - 128.0) * 0.25;   // + land, - water (tiles)
    float kind = floor(texture2D(uMap, (floor(vWorld.xz) + 0.5) / uSize).g * 255.0 + 0.5);
    if (max(abs(vWorld.x - uWin.x), abs(vWorld.z - uWin.y)) > 1000.0) { sd = -32.0; kind = 0.0; }
    // (Reverse Mountain's canals run up the mountain: they draw their own water)
    if (kind == 9.0) discard;
    float depth = clamp(-sd, 0.0, 30.0);
    bool water = kind < 2.5 || kind == 5.0 || kind == 7.0;

    // the surface normal: swells plus small ripples (the swell worked out
    // again for this pixel, the same as the vertices had it)
    float t = uTime * (1.0 + uStorm * 0.8);
    vec2 p = vWorld.xz;
    vec3 sw = vSwell;
    if (uDetail > 0.5) {
      float liquidF = kind < 2.5 || kind == 5.0 || kind == 7.0 ? 1.0 : kind == 3.0 ? 0.5 : 0.15;
      float A = uAmp * mix(0.35, 1.0, smoothstep(0.5, -7.0, sd)) * (1.0 - smoothstep(70.0, 190.0, length(vView.xz))) * liquidF;
      vec2 sl;
      float sh = swells(p, uTime, sl);
      sw = vec3(sl * A, sh * step(0.001, A));
    }
    // how much of the crests to show: the three swells add up to a regular
    // lattice of peaks, which reads as a pattern stamped over the sea once a
    // wide stretch of it is seen from high up — so from up there the light
    // through the crests and the whitecaps keep to the water near the eye
    float crestReach = mix(190.0, 85.0, smoothstep(20.0, 60.0, vView.y));
    float crestFade = 1.0 - smoothstep(crestReach * 0.35, crestReach, length(vView));
    float e = 0.3;
    float r0 = ripples(p, t);
    vec2 rip = vec2(ripples(p + vec2(e, 0.0), t) - r0, ripples(p + vec2(0.0, e), t) - r0) / e * (0.09 + uStorm * 0.22);
    vec3 n = normalize(vec3(-sw.x - rip.x, 1.0, -sw.y - rip.y));
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
    // light through the tops of the swells (patchy, like real water)
    col += shallow * clamp(sw.z, 0.0, 1.0) * 0.2 * (0.5 + sFbm(p * 0.045)) * crestFade;
    // see-through in the shallows; the open sea is opaque (its floor is only
    // built while someone is down in it, and far off the colour says it all)
    float alpha = mix(0.96, 0.5, exp(-depth * 0.35));
    alpha = mix(alpha, 1.0, max(smoothstep(8.0, 16.0, depth), smoothstep(160.0, 320.0, length(vView))));

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
      // whitecaps: rare and ragged in a calm, everywhere in a storm
      float capN = sFbm(p * 0.21 + vec2(t * 0.12, -t * 0.07)) * 0.7 + sFbm(p * 0.047 - t * 0.02) * 0.3;
      float caps = smoothstep(0.6, 0.85, sw.z) * smoothstep(0.7 - uStorm * 0.35, 0.8 - uStorm * 0.35, capN) * (0.06 + uStorm * 0.94);
      // further off, a storm's whitecaps are scattered where the noise says
      float capsFar = smoothstep(0.72, 0.84, sFbm(p * 0.09 + vec2(t * 0.05, 0.0)) * 0.6 + sFbm(p * 0.023 - t * 0.01) * 0.4) * uStorm * 0.8;
      caps = mix(capsFar, caps, crestFade);
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

// The coastline map the water reads (r = distance to the coast, g = liquid
// type) is a window of WIN × WIN tiles round the camera, addressed modulo WIN
// (the texture repeats), so moving it on means filling in only the strip of
// tiles it moved onto.
const WIN = 2048;
const WMASK = WIN - 1;
const STEP = 256; // the window moves on in steps this big
const SLICE = 32; // columns (or rows) filled in per frame while it does

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
  constructor(scene, renderer = null) {
    this.renderer = renderer;
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
        uUnder: { value: 0 },
        uWin: { value: new THREE.Vector2(-1e9, -1e9) },
      },
    ]);
    // the water writes depth, so the ink outlines see its surface (not the sea floor under it)
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: true, fog: true, side: THREE.DoubleSide,
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
    this.world = world;
    if (!this.tex) {
      this.winData = new Uint8Array(WIN * WIN * 2);
      const mk = () => {
        const t = new THREE.DataTexture(this.winData, WIN, WIN, THREE.RGFormat, THREE.UnsignedByteType);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        return t;
      };
      this.tex = mk();
      this.src = mk(); // (the same bytes: the source of the partial uploads)
      this.box = new THREE.Box2();
      this.pos = new THREE.Vector2();
    }
    this.win = null; // filled in round the camera on the next update
    this.pending = [];
    this.uniforms.uMap.value = this.tex;
    this.uniforms.uSize.value.set(WIN, WIN);
    this.uniforms.uZone.value = world.zone || 0;
  }

  /** Fill in the tiles of [x0, x0+w) × [y0, y0+h) (world tiles, unwrapped) in the window's bytes. */
  fill(x0, y0, w, h) {
    const world = this.world, d = this.winData;
    const x1 = x0 + w, y1 = y0 + h;
    // a block at a time: most of the sea is one flat block
    for (let by = Math.floor(y0 / 32); by <= Math.floor((y1 - 1) / 32); by++) {
      const ya = Math.max(y0, by * 32), yb = Math.min(y1, by * 32 + 32);
      for (let bx = Math.floor(x0 / 32); bx <= Math.floor((x1 - 1) / 32); bx++) {
        const xa = Math.max(x0, bx * 32), xb = Math.min(x1, bx * 32 + 32);
        let wbx = bx;
        if (world.wrap) wbx = ((bx % world.bw) + world.bw) % world.bw;
        const inside = by >= 0 && by < world.bh && wbx >= 0 && wbx < world.bw;
        const u = inside ? world.blockUniform(wbx, by) : -1;
        const b = inside ? by * world.bw + wbx : -1;
        if (u >= 0 && !world.bs[b]) {
          const r = world.us[b], g = u < 16 ? u : 255;
          for (let y = ya; y < yb; y++) {
            const row = (y & WMASK) * WIN;
            for (let x = xa; x < xb; x++) { const o = (row + (x & WMASK)) * 2; d[o] = r; d[o + 1] = g; }
          }
          continue;
        }
        for (let y = ya; y < yb; y++) {
          const row = (y & WMASK) * WIN;
          for (let x = xa; x < xb; x++) {
            const o = (row + (x & WMASK)) * 2;
            d[o] = world.distRaw(x, y);
            const t = world.type(x, y);
            d[o + 1] = t < 16 ? t : 255;
          }
        }
      }
    }
  }

  /** Send [x0, x0+w) × [y0, y0+h) of the window's bytes to the GPU (split where it wraps). */
  upload(x0, y0, w, h) {
    const r = this.renderer;
    if (!r || !this.tex.__uploaded) { this.tex.needsUpdate = true; return; }
    const tx = x0 & WMASK, ty = y0 & WMASK;
    const xs = tx + w > WIN ? [[tx, WIN - tx], [0, tx + w - WIN]] : [[tx, w]];
    const ys = ty + h > WIN ? [[ty, WIN - ty], [0, ty + h - WIN]] : [[ty, h]];
    for (const [ax, aw] of xs) {
      for (const [ay, ah] of ys) {
        this.box.min.set(ax, ay); this.box.max.set(ax + aw, ay + ah);
        this.pos.set(ax, ay);
        r.copyTextureToTexture(this.src, this.tex, this.box, this.pos);
      }
    }
  }

  /** Keep the window centred on the camera. */
  follow(ox, oy) {
    const cx = Math.floor(ox), cy = Math.floor(oy);
    const w = this.win;
    const far = w && this.world.wrap ? Math.abs(this.world.dx(w.cx, cx)) : w ? Math.abs(cx - w.cx) : 0;
    if (!w || far > WIN / 2 - 200 || Math.abs(cy - w.cy) > WIN / 2 - 200) {
      // (a jump: fill it all in at once)
      const x0 = Math.floor(cx / 32) * 32 - WIN / 2, y0 = Math.floor(cy / 32) * 32 - WIN / 2;
      this.fill(x0, y0, WIN, WIN);
      this.tex.needsUpdate = true;
      this.win = { x0, y0, cx: x0 + WIN / 2, cy: y0 + WIN / 2 };
      this.pending.length = 0;
    } else if (!this.pending.length) {
      // (the camera's x is kept near the window's even across the world's seam)
      const dx = this.world.wrap ? this.world.dx(w.cx, cx) : cx - w.cx, dy = cy - w.cy;
      const sx = Math.abs(dx) >= STEP ? Math.sign(dx) * STEP : 0, sy = Math.abs(dy) >= STEP ? Math.sign(dy) * STEP : 0;
      if (sx || sy) {
        const nx0 = w.x0 + sx, ny0 = w.y0 + sy;
        if (sx > 0) this.pending.push({ x0: w.x0 + WIN, y0: ny0, w: sx, h: WIN, cols: true });
        else if (sx < 0) this.pending.push({ x0: nx0, y0: ny0, w: -sx, h: WIN, cols: true });
        if (sy > 0) this.pending.push({ x0: nx0, y0: w.y0 + WIN, w: WIN, h: sy });
        else if (sy < 0) this.pending.push({ x0: nx0, y0: ny0, w: WIN, h: -sy });
        this.win = { x0: nx0, y0: ny0, cx: nx0 + WIN / 2, cy: ny0 + WIN / 2 };
      }
    }
    // a slice of the strips it moved onto, each frame
    const p = this.pending[0];
    if (p) {
      if (p.cols) {
        const n = Math.min(SLICE, p.w);
        this.fill(p.x0, p.y0, n, p.h); this.upload(p.x0, p.y0, n, p.h);
        p.x0 += n; p.w -= n;
      } else {
        const n = Math.min(SLICE, p.h);
        this.fill(p.x0, p.y0, p.w, n); this.upload(p.x0, p.y0, p.w, n);
        p.y0 += n; p.h -= n;
      }
      if (p.w <= 0 || p.h <= 0) this.pending.shift();
    }
    this.uniforms.uWin.value.set(this.win.cx, this.win.cy);
  }

  update(ox, oy, env, sunDir, sunCol, sky, skyTop) {
    const u = this.uniforms;
    if (this.world) this.follow(ox, oy);
    // (once three.js has made the texture, strips go up on their own)
    if (this.tex && !this.tex.__uploaded && this.renderer?.properties.get(this.tex).__webglTexture) this.tex.__uploaded = true;
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
