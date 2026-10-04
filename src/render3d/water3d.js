// The ocean: a disc of water centred on the player, dense near the middle so
// gentle swells can roll through it, sparse toward the horizon. The shader
// reads the world's coastline-distance field, so it knows how deep the water
// is everywhere: glass-clear turquoise shallows with sunlight rippling on the
// sand below, deep ocean blue offshore, lines of surf rolling into the
// beaches, foam at the waterline, sun sparkles and the sky mirrored at a
// glance. It also colours the other "liquids": the Skypiea cloud sea, lava,
// acid.
import * as THREE from 'three';
import { SWELL_GLSL, swellAmp, setSwell, calmPoints } from './swell.js';

// The wind swells (see swell.js: the same waves are worked out there for the
// things that float on them)
const SWELL = SWELL_GLSL;
// calm water: no swell heaving round Reverse Mountain's canal mouths, where
// the canals' own water fades in over the sea (rmCanals3d.js) — a swell
// there would heave up through it. (Only the surface's height: it's still
// shaded as the swells have it, so it looks the same as the sea round it.)
// (x, y: the middle, world tiles; z: how far out the calm reaches, the inner
// half of it flat)
const CALM_N = 5;
const CALM = /* glsl */`
  uniform vec4 uCalm[${CALM_N}];
  float calmAt(vec2 P) {
    float k = 1.0;
    for (int i = 0; i < ${CALM_N}; i++) {
      vec4 c = uCalm[i];
      if (c.z > 0.0) k = min(k, smoothstep(c.z * 0.45, c.z, distance(P, c.xy)));
    }
    return k;
  }
`;

// the open sea's blues (as they show on screen): the main one, and the ones
// wide stretches of it turn to, blending — a turquoise, a deeper cobalt, a
// soft grey-green (water3d's seaHue)
const SEA_HUES = ['#629aca', '#5bb0cc', '#4f86c6', '#6aa3b6'];

// the ships near the eye, for how they meet the sea (the foam round each
// hull, the bow wave, the water heaped up at her stem): x, z (render space),
// cos and sin of her heading; her length, beam, speed (kn) and 1 = on. Her
// waterline's outline is the one the sea's kept out of her by (world/hull.js hbAt).
const SHIPS_N = 8;
const HULLS = /* glsl */`
  uniform vec4 uShips[${SHIPS_N}];
  uniform vec4 uShipD[${SHIPS_N}];
  float hullHalf(float t) {
    float tc = clamp(t, 0.0, 1.0);
    return tc > 0.58 ? sqrt(max(0.0, 1.0 - pow((tc - 0.58) / 0.42, 2.2))) : tc < 0.14 ? 0.74 + 0.26 * sin(tc / 0.14 * 1.5707963) : 1.0;
  }
  // ship i, seen from render-space point r: (u: m forward of her middle, v: m out to starboard, t: 0 stern → 1 bow, how far outside her waterline, m)
  vec4 hullFrame(int i, vec2 r) {
    vec4 S = uShips[i], D = uShipD[i];
    vec2 q = r - S.xy;
    float u = q.x * S.z + q.y * S.w, v = -q.x * S.w + q.y * S.z;
    float t = u / D.x + 0.5;
    float off = abs(v) - hullHalf(t) * D.y * 0.5;
    if (t > 1.0) off = max(off, (t - 1.0) * D.x);
    if (t < 0.0) off = max(off, -t * D.x);
    return vec4(u, v, t, off);
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
  ${CALM}
  ${HULLS}

  // where a hull pushes the sea aside: heaped up at her stem (the faster she
  // goes, the higher), drawn down a little along her sides
  float hullPush(vec2 r) {
    float h = 0.0;
    for (int i = 0; i < ${SHIPS_N}; i++) {
      vec4 D = uShipD[i];
      if (D.w < 0.5) continue;
      vec4 f = hullFrame(i, r);
      if (f.z < -0.5 || f.z > 1.5 || f.w > D.y * 2.0 + 3.0) continue;
      float spd = clamp(D.z / 8.0, 0.0, 1.2);
      float o = max(f.w, 0.0);
      float stem = exp(-pow((f.z - 0.98) * D.x / (1.2 + D.y * 0.25), 2.0) - pow(o / (0.9 + D.y * 0.12), 2.0));
      float side = exp(-pow(o / 1.6, 2.0)) * smoothstep(0.1, 0.3, f.z) * (1.0 - smoothstep(0.6, 0.85, f.z));
      h += (stem * (0.12 + 0.35 * spd) - side * 0.12 * spd) * step(0.0, f.w + 0.4);
    }
    return h;
  }

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
    float A = uAmp * shore * liquid * calmAt(P);
    vec2 slope;
    // (reckoned from the eye — the disc's middle — as swellAt reckons it, so what floats sits on it)
    float h = swells(P, uTime, length(wp.xz), slope);
    wp.y += h * A;
    // (only near the eye: the disc's too coarse further off)
    if (length(wp.xz) < 160.0) wp.y += hullPush(wp.xz) * step(0.5, liquid);
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
  uniform float uRipT;      // the ripples' clock (it runs faster in a storm)
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSky;
  uniform vec3 uSkyTop;
  uniform float uDay;
  uniform float uZone;
  uniform float uStorm;
  uniform float uOvercast;  // a grey sky over it (0..1)
  uniform float uGlass;     // the Calm Belt's glassy stillness
  uniform float uRain;
  uniform float uDetail;
  uniform float uUnder;
  uniform vec4 uHull;   // the hull you're aboard: its middle (render space x, z), cos and sin of its heading
  uniform vec3 uHullD;  // its length, its beam, 1 = on
  uniform vec4 uBubble; // Fish-Man Island's bubble: its middle (world x, y) and half-widths (none: 0)
  varying vec3 vWorld;
  varying vec3 vView;
  varying vec3 vSwell;
  #include <fog_pars_fragment>

  uniform float uAmp;
  uniform vec3 uSeaA, uSeaB, uSeaC, uSeaD; // the open sea's blues (see SEA_HUES)
  ${SWELL}
  ${HULLS}
  // the open sea's colour here: wide stretches of it in different blues — the
  // main one, a turquoise, a cobalt, a soft grey-green — each running into
  // the next over a few hundred metres, so no two stretches of sea are alike
  vec3 seaHue(vec2 p) {
    float a = sFbm(p * 0.0011 + 13.0), b = sFbm(p * 0.0004 - 7.0), c = sFbm(p * 0.0031 + 29.0);
    vec3 col = mix(uSeaA, uSeaB, smoothstep(0.42, 0.72, a));
    col = mix(col, uSeaC, smoothstep(0.48, 0.78, b) * 0.85);
    col = mix(col, uSeaD, smoothstep(0.55, 0.8, 1.0 - a) * smoothstep(0.4, 0.66, b) * 0.6);
    return col * (0.92 + 0.16 * c);
  }
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
  // the chop as an anime painting has it: the sea broken into small planes,
  // each tilted its own way and turning slowly, so each catches the light (or
  // the sky, or the sun) on its own — p's cell (the nearest of some drifting
  // points), its tilt eased into its neighbour's right at the edge. A slope
  // (dh/dx, dh/dz), up to about 1.
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
  // the foam where a hull meets the sea (r: render space; p: world): a band
  // of churned white along her waterline — wider at her bow, and the faster
  // she goes — laced, not solid; and her bow wave, a line of it running out
  // and back from her stem at the angle a ship's waves keep (19.5°)
  // (x: the foam; y: the paler, churned water round it)
  vec2 hullFoam(vec2 r, vec2 p, float t) {
    float foam = 0.0;
    for (int i = 0; i < ${SHIPS_N}; i++) {
      vec4 D = uShipD[i];
      if (D.w < 0.5) continue;
      vec4 f = hullFrame(i, r);
      if (f.z < -0.6 || f.z > 1.4 || f.w > D.y * 4.0 + 8.0) continue;
      float spd = clamp(D.z / 8.0, 0.0, 1.2);
      // along her side
      float wdt = 0.3 + spd * 0.35 + spd * 0.95 * smoothstep(0.55, 1.0, f.z);
      float band = (1.0 - smoothstep(wdt * 0.3, wdt, f.w)) * step(-0.3, f.w);
      // the bow wave: out from the stem, back along her
      float back = (0.98 - f.z) * D.x;
      float edge = abs(abs(f.y) - (D.y * 0.12 + back * 0.36));
      float bw = (1.0 - smoothstep(0.25 + back * 0.03, 0.7 + back * 0.06, edge)) * smoothstep(0.0, 1.5, back) * (1.0 - smoothstep(D.x * 0.4, D.x * 1.2, back)) * step(0.0, f.w) * spd;
      foam = max(foam, max(band * (0.55 + 0.45 * spd), bw * 0.85));
    }
    if (foam <= 0.0) return vec2(0.0);
    // (laced: veins of white over thinner patches, churning)
    float lace = noise(p * vec2(1.7, 2.3) + vec2(t * 1.1, -t * 0.7)) * 0.6 + noise(p * 4.3 - t * 1.6) * 0.4;
    return vec2(clamp(foam * smoothstep(0.42, 0.66, lace + foam * 0.22), 0.0, 1.0), foam);
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
    // (10,000 m down, the sea is only inside Fish-Man Island's bubble: past
    // its skin there's no surface, only the deep — world/bubble.js)
    if (uBubble.z > 0.0) { vec2 eb = (vWorld.xz - uBubble.xy) / uBubble.zw; if (dot(eb, eb) > 1.0) discard; }
    // no sea inside the hull you're aboard (down in her hold it would lie
    // across the room): her waterline's outline, as world/hull.js hbAt has it
    if (uHullD.z > 0.5) {
      vec2 q = (cameraPosition.xz - vView.xz) - uHull.xy;
      float hu = q.x * uHull.z + q.y * uHull.w, hv = -q.x * uHull.w + q.y * uHull.z;
      float ht = hu / uHullD.x + 0.5;
      if (ht > 0.005 && ht < 0.995) {
        float hk = ht > 0.58 ? sqrt(max(0.0, 1.0 - pow((ht - 0.58) / 0.42, 2.2))) : ht < 0.14 ? 0.74 + 0.26 * sin(ht / 0.14 * 1.5707963) : 1.0;
        if (abs(hv) < hk * uHullD.y * 0.5 * 0.94) discard;
      }
    }
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

    // the surface normal: the swells (worked out again for this pixel —
    // and, only shaded, carried twice as far out as the water's drawn with
    // them), the chop's facets over them, a faint ripple
    float t = uRipT;
    vec2 p = vWorld.xz;
    vec3 sw = vSwell;
    float dist = length(vView);
    if (uDetail > 0.5) {
      float liquidF = kind < 2.5 || kind == 5.0 || kind == 7.0 ? 1.0 : kind == 3.0 ? 0.5 : 0.15;
      float A = uAmp * mix(0.35, 1.0, smoothstep(0.5, -7.0, sd)) * liquidF;
      vec2 sl;
      float sh = swells(p, uTime, length(vView.xz) * 0.45, sl);
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
    // (rougher in a storm and in the rain; glassy in a calm)
    vec2 rip = vec2(ripples(p + vec2(e, 0.0), t) - r0, ripples(p + vec2(0.0, e), t) - r0) / e * (0.04 + uStorm * 0.12 + uRain * 0.05) * (1.0 - uGlass * 0.8);
    // the facets: a big chop and a small one over it (one on the lower setting), fading out far off
    vec2 fc = vec2(0.0);
    if (water) {
      float rough = (0.62 + uStorm * 0.7 + uRain * 0.2) * (1.0 - uGlass * 0.85) * (1.0 - smoothstep(80.0, 320.0, dist));
      // (stretches choppier and smoother, choppier on the crests; the cells
      // warped, so they never fall into an even grid)
      rough *= (0.45 + 0.95 * sFbm(p * 0.006 + 71.0)) * (0.8 + 0.4 * clamp(sw.z, 0.0, 1.0));
      vec2 pf = p + (vec2(sNoise(p * 0.045), sNoise(p * 0.045 + 3.3)) - 0.5) * 7.0;
      fc = facets(pf * 0.85, t * 0.5) * 0.36;
      if (uDetail > 0.5) fc += facets(pf * 2.1 + 7.3, t * 0.75) * 0.16;
      fc *= rough;
    }
    // (the swells' slopes drawn steeper than they are, so their shapes read under the chop)
    vec3 n = normalize(vec3(-sw.x * 3.4 - rip.x - fc.x, 1.0, -sw.y * 3.4 - rip.y - fc.y));
    vec3 v = normalize(vView);
    float ndv = max(dot(n, v), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    float light = mix(0.26, 1.0, uDay);

    // water colour by depth: lagoon, turquoise, blue, deep ocean
    vec3 open = seaHue(p);
    vec3 deep = open, mid = mix(open, vec3(0.12, 0.42, 0.62), 0.3), shallow = vec3(0.08, 0.52, 0.6), lagoon = vec3(0.22, 0.76, 0.68);
    if (uZone > 1.5 && uZone < 2.5) { deep = vec3(0.01, 0.06, 0.18); mid = vec3(0.02, 0.14, 0.32); shallow = vec3(0.04, 0.32, 0.5); lagoon = shallow; }
    // under a grey sky the sea turns a dark grey-green; in a storm, slate
    else if (uOvercast > 0.0) {
      vec3 og = mix(vec3(0.028, 0.085, 0.1), vec3(0.012, 0.033, 0.045), uStorm);
      deep = mix(deep, og * 0.75, uOvercast * (0.7 + 0.2 * uStorm));
      mid = mix(mid, og * 1.25, uOvercast * (0.65 + 0.25 * uStorm));
      shallow = mix(shallow, vec3(0.06, 0.2, 0.2) * (1.0 - uStorm * 0.4), uOvercast * 0.5);
      lagoon = mix(lagoon, vec3(0.12, 0.3, 0.27) * (1.0 - uStorm * 0.4), uOvercast * 0.5);
    }
    vec3 col = mix(deep, mid, exp(-depth * 0.07));
    col = mix(col, shallow, exp(-depth * 0.32));
    col = mix(col, lagoon, exp(-depth * 1.1) * 0.7);
    // the sea's wide patches, drifting: stretches a shade darker and lighter
    // (so no stretch of it is the same as the next, from up high too), and
    // the swells' crests lighter, their troughs darker
    if (water) {
      float big = sFbm(p * 0.0045 + vec2(uTime * 0.004, -uTime * 0.003)) * 0.65 + sFbm(p * 0.017 + 41.0 - uTime * 0.006) * 0.35;
      col *= mix(0.82, 1.1, smoothstep(0.3, 0.72, big)) * (1.0 + 0.32 * clamp(sw.z, -1.0, 1.0));
    }
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
      col += vec3(0.55, 0.95, 0.85) * c * exp(-depth * 0.45) * 0.28 * uDay * (1.0 - uStorm) * (1.0 - uOvercast * 0.8);
    }
    // the sky, mirrored at a glance — on the sea, a facet at a time: one
    // turned to the sky shows it, one turned to you the deep blue (crisply,
    // like paint, not a soft blur)
    vec3 rd = reflect(-v, n);
    vec3 skyR = mix(uSky, uSkyTop, pow(clamp(rd.y, 0.0, 1.0), 0.6));
    float sheen = water ? mix(fres, smoothstep(0.07, 0.16, fres) * 0.42 + fres * 0.4, 1.0 - smoothstep(120.0, 400.0, dist)) : fres;
    // (a facet's sheen is the sky's blue more than its pale haze: a lighter, brighter blue, as paint has it)
    vec3 skyF = water ? mix(skyR, uSkyTop * 1.15, 0.45 * (1.0 - smoothstep(150.0, 450.0, dist))) : skyR;
    col = mix(col, skyF * (0.45 + 0.55 * uDay), sheen * 0.85);
    // the sun: a hard highlight, and sparkles along its path
    vec3 hlf = normalize(uSunDir + v);
    float nh = max(dot(n, hlf), 0.0);
    float sunUp = smoothstep(-0.05, 0.1, uSunDir.y) * (1.0 - max(uStorm * 0.85, uOvercast * 0.92));
    col += uSunCol * (pow(nh, 320.0) * 3.2 + pow(nh, 42.0) * 0.12) * sunUp;
    // glints: a facet turned just so throws the sun back, a small hard flash
    // (a few small ones on each facet — not the whole facet lit up)
    if (water) col += uSunCol * smoothstep(0.988, 0.996, nh) * step(0.62, hash(floor(p * 4.0))) * 1.6 * sunUp * smoothstep(2.0, 12.0, dist) * (1.0 - smoothstep(40.0, 280.0, dist) * 0.7);
    if (uDetail > 0.5) {
      vec2 cell = floor(p * 2.6);
      float g = hash(cell);
      float tw = pow(max(0.0, sin(t * 3.1 + g * 40.0)), 12.0);
      vec2 fc = fract(p * 2.6) - 0.5;
      float dotS = 1.0 - smoothstep(0.04, 0.16, length(fc));
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
      float caps = smoothstep(0.68 - uStorm * 0.12, 0.88 - uStorm * 0.12, sw.z) * smoothstep(0.68 - uStorm * 0.32, 0.78 - uStorm * 0.32, capN) * (0.24 + uStorm * 0.76);
      // further off, a storm's whitecaps are scattered where the noise says
      float capsFar = smoothstep(0.72, 0.84, sFbm(p * 0.09 + vec2(t * 0.05, 0.0)) * 0.6 + sFbm(p * 0.023 - t * 0.01) * 0.4) * uStorm * 0.8;
      caps = mix(capsFar, caps, crestFade);
      // (broken up into streaks and flecks, not smooth white ovals)
      caps *= smoothstep(0.4 + 0.06 * (1.0 - uStorm), 0.62, noise(p * vec2(0.9, 2.3) + vec2(t * 0.4, 0.0)) * 0.65 + noise(p * 3.1 - t * 0.6) * 0.35);
      foam = clamp(max(edge, line * band * 0.9) + caps, 0.0, 1.0);
      // where the ships meet it: laced white, in paler churned water
      if (dist < 220.0) {
        vec2 hf = hullFoam(cameraPosition.xz - vView.xz, p, t);
        col = mix(col, vec3(0.3, 0.68, 0.92) * light, hf.y * 0.45);
        foam = max(foam, hf.x);
      }
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

/** A disc of rings: ~0.6 m apart at the centre, growing outward to the horizon (dense enough out to 300 m to carry the swells). */
function discGeometry(radius = 1600, segs = 160) {
  const rings = [0];
  let r = 0.6, dr = 0.6;
  while (r < radius) { rings.push(r); dr *= 1.045; r += dr; }
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
        uRipT: { value: 0 },
        uAmp: { value: 0.14 },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
        uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
        uSky: { value: new THREE.Color(0.6, 0.8, 1) },
        uSkyTop: { value: new THREE.Color(0.2, 0.45, 0.85) },
        uDay: { value: 1 },
        uZone: { value: 0 },
        uStorm: { value: 0 },
        uOvercast: { value: 0 },
        uGlass: { value: 0 },
        uRain: { value: 0 },
        uDetail: { value: 1 },
        uUnder: { value: 0 },
        uWin: { value: new THREE.Vector2(-1e9, -1e9) },
        uHull: { value: new THREE.Vector4() },
        uHullD: { value: new THREE.Vector3() },
        uBubble: { value: new THREE.Vector4() },
        uCalm: { value: Array.from({ length: CALM_N }, () => new THREE.Vector4()) },
        uShips: { value: Array.from({ length: SHIPS_N }, () => new THREE.Vector4()) },
        uSeaA: { value: new THREE.Color(SEA_HUES[0]) }, uSeaB: { value: new THREE.Color(SEA_HUES[1]) },
        uSeaC: { value: new THREE.Color(SEA_HUES[2]) }, uSeaD: { value: new THREE.Color(SEA_HUES[3]) },
        uShipD: { value: Array.from({ length: SHIPS_N }, () => new THREE.Vector4()) },
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

  /** The hull to keep the sea out of ({ x, z (render space), h (heading), L, B }), or null. */
  setHull(h) {
    const u = this.uniforms;
    if (!h) { u.uHullD.value.z = 0; return; }
    u.uHull.value.set(h.x, h.z, Math.cos(h.h), Math.sin(h.h));
    u.uHullD.value.set(h.L, h.B, 1);
  }

  /**
   * The ships near the eye, for the foam and the push of their hulls in the
   * sea: [{ x, z (render space), h (heading), L, B, sp (kn) }], nearest first
   * (as many as there's room for).
   */
  setShips(list) {
    const S = this.uniforms.uShips.value, D = this.uniforms.uShipD.value;
    for (let i = 0; i < SHIPS_N; i++) {
      const s = list[i];
      if (!s) { D[i].w = 0; continue; }
      S[i].set(s.x, s.z, Math.cos(s.h), Math.sin(s.h));
      D[i].set(s.L, s.B, s.sp, 1);
    }
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
    const b = world.bubble;
    this.uniforms.uBubble.value.set(b ? b.x : 0, b ? b.y : 0, b ? b.a : 0, b ? b.b : 0);
    // (calm where Reverse Mountain's canals meet the sea: from the rock out
    // over the stretch where their water fades in — rmCanals3d.js)
    const calm = this.uniforms.uCalm.value;
    for (const v of calm) v.set(0, 0, 0, 0);
    calmPoints(world).slice(0, CALM_N).forEach(([x, y, r], k) => calm[k].set(x, y, r, 0));
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

  update(ox, oy, env, sunDir, sunCol, sky, skyTop, overcast = 0) {
    const u = this.uniforms;
    if (this.world) this.follow(ox, oy);
    // (once three.js has made the texture, strips go up on their own)
    if (this.tex && !this.tex.__uploaded && this.renderer?.properties.get(this.tex).__webglTexture) this.tex.__uploaded = true;
    u.uOrigin.value.set(ox, oy);
    u.uTime.value = env.time;
    // the ripples, surf and sparkles run up to 1.8× as fast in a storm, so
    // their clock is wound on a frame at a time at the storm's pace (the
    // game's whole clock times the pace jumped with every change in the
    // weather: half an hour in, a storm coming on sent them 300× too fast)
    const dt = Math.min(0.25, Math.max(0, env.time - (this.lastT ?? env.time)));
    this.lastT = env.time;
    this.ripT = (this.ripT ?? env.time) + dt * (1 + env.storm * 0.8);
    u.uRipT.value = this.ripT;
    u.uDay.value = env.daylight;
    u.uStorm.value = env.storm;
    u.uOvercast.value = overcast;
    u.uGlass.value = env.calm || 0;
    u.uRain.value = env.rain || 0;
    // calm swells on a fine day, heavy ones in a storm, none in the Calm Belt; still water indoors and under the sea
    const zone = u.uZone.value;
    u.uAmp.value = swellAmp(env.storm, zone, env.calm);
    setSwell(env.time, u.uAmp.value, this.world, ox, oy);
    if (sunDir) u.uSunDir.value.copy(sunDir);
    if (sunCol) u.uSunCol.value.copy(sunCol);
    if (sky) u.uSky.value.copy(sky);
    if (skyTop) u.uSkyTop.value.copy(skyTop);
  }
}
