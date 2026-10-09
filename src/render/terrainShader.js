// Terrain fragment shader: draws the whole planet from tile textures.
//  uWorld  RGBA8  r=tile type, g=elevation, b=climate, a=variant   (NEAREST)
//  uDist   R8     signed distance to the coast, 128 + 4*tiles      (LINEAR+mips)
//  uPal    RGBA8  256x2 palette: row 0 base colour, row 1 accent    (NEAREST)
//  uMap    RGBA8  half-res painted world map                        (LINEAR+mips)
//  uFog    R8     explored mask, 1 texel = 8x8 tiles                (LINEAR)
import { W, H, EQ, GL_HALF, CB, RL_HALF, RM_X, POLAR } from '../world/constants.js';

export const TERRAIN_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uWorld;
uniform sampler2D uDist;
uniform sampler2D uPal;
uniform sampler2D uMap;
uniform sampler2D uFog;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uWorldSize;
uniform vec3 uAmbient;
uniform float uDay;
uniform float uMapMode;
uniform float uStorm;
uniform vec2 uWind;
uniform int uZone;
uniform float uSurfaceMap;
uniform float uGlobe; // the chart as the globe (M) takes it: its seas coloured by region
uniform vec4 uLights[24];
uniform vec3 uLightCol[24];
uniform int uNumLights;

out vec4 outColor;

const float WW = ${W}.0;
const float HH = ${H}.0;
const float EQY = ${EQ}.0;
const float GLH = ${GL_HALF}.0;
const float CBW = ${CB}.0;
const float RLH = ${RL_HALF}.0;
const float RMX = ${RM_X}.0;
const float POL = ${POLAR}.0;

uint hashu(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v.x;
}
float hash(vec2 p) { return float(hashu(uvec2(ivec2(floor(p)) + 262144))) * (1.0 / 4294967295.0); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

ivec2 wsz() { return ivec2(uWorldSize); }
vec4 fetchW(ivec2 c) {
  ivec2 s = wsz();
  c.x = ((c.x % s.x) + s.x) % s.x;
  c.y = clamp(c.y, 0, s.y - 1);
  return texelFetch(uWorld, c, 0);
}
int typeOf(vec4 t) { return int(t.r * 255.0 + 0.5); }
vec3 pal(int t, int row) { return texelFetch(uPal, ivec2(t, row), 0).rgb; }
float sdAt(vec2 wp) { return (texture(uDist, wp / uWorldSize).r * 255.0 - 128.0) * 0.25; }

bool manmade(int t) {
  return t == 28 || t == 29 || t == 30 || t == 31 || t == 40 || t == 41 || t == 44 || t == 45 || t == 52 || t == 53 || t == 54 || t == 42;
}
bool overlayT(int t) { return t == 30 || t == 44 || t == 45; }

// 0 blues, 1 paradise, 2 new world, 3 calm belt, 4 polar, 5 red line
int regionOf(vec2 p) {
  float x = mod(p.x, WW);
  if (p.y < POL || p.y > HH - POL) return 4;
  if (abs(x - RMX) < RLH || x < RLH || x > WW - RLH) return 5;
  float dy = abs(p.y - EQY);
  if (dy < GLH) return x > RMX ? 1 : 2;
  if (dy < GLH + CBW) return 3;
  return 0;
}

vec3 climateTint(int cl, vec3 c) {
  if (cl == 1) return c * vec3(0.85, 1.08, 0.82);          // tropical: lush
  if (cl == 2) return mix(c, c * vec3(1.45, 0.95, 0.55), 0.55); // autumn
  if (cl == 3) return mix(c, vec3(0.86, 0.9, 0.93), 0.35);   // wintry
  if (cl == 4) return mix(c, c * vec3(1.25, 1.1, 0.7), 0.5);  // arid
  if (cl == 5) return mix(c, c * vec3(0.7, 0.65, 0.6), 0.5);  // volcanic
  if (cl == 8) return mix(c, c * vec3(1.1, 1.0, 1.0), 0.3);   // sakura
  if (cl == 10) return mix(c, c * vec3(0.6, 0.62, 0.72), 0.6); // gloom (Thriller Bark)
  if (cl == 11) return c * vec3(0.98, 1.06, 0.9);            // spring
  return c;
}

// Detail patterns for ground types.
vec3 groundDetail(int t, vec3 c, vec3 acc, vec2 wp, float var, float zoomFade) {
  float n = vnoise(wp * 3.1);
  float fine = vnoise(wp * 9.7) * zoomFade;
  if (t == 17 || t == 47 || t == 19 || t == 20 || t == 37) { // grass-like
    float blades = smoothstep(0.72, 0.95, vnoise(wp * vec2(14.0, 6.0))) * zoomFade;
    c = mix(c, acc, n * 0.45);
    c *= 0.92 + fine * 0.14;
    c = mix(c, acc * 1.1, blades * 0.35);
    if (t == 19) c *= 0.86;
    if (t == 20) c = mix(c, c * vec3(0.8, 1.05, 0.8), 0.4);
    if (t == 37) c = mix(c, vec3(0.55, 0.45, 0.3), smoothstep(0.6, 0.9, vnoise(wp * 1.3)) * 0.4);
  } else if (t == 16 || t == 23) { // sand / desert
    float ripple = sin(wp.x * 2.6 + wp.y * 1.2 + vnoise(wp * 0.7) * 5.0);
    c = mix(c, acc, n * 0.5);
    c *= 0.95 + fine * 0.08;
    if (t == 23) c *= 0.94 + 0.06 * smoothstep(-0.2, 1.0, ripple) * zoomFade;
  } else if (t == 18 || t == 46 || t == 38 || t == 39 || t == 43) { // dirt, gravel, ash, mud, bone
    c = mix(c, acc, n * 0.5);
    c *= 0.9 + fine * 0.2;
    if (t == 46) c *= 0.92 + step(0.8, vnoise(wp * 11.0)) * 0.12 * zoomFade;
  } else if (t == 21 || t == 22 || t == 51) { // snow / ice
    c = mix(c, acc, n * 0.6);
    float sparkle = step(0.97, vnoise(wp * 23.0 + floor(uTime * 2.0))) * zoomFade;
    c += sparkle * 0.25;
    if (t == 22) c = mix(c, c * vec3(0.85, 0.95, 1.05), smoothstep(0.4, 0.6, vnoise(wp * vec2(0.6, 4.0))) * 0.4);
  } else if (t == 24 || t == 25 || t == 26 || t == 50) { // rock / mountains
    float cracks = smoothstep(0.46, 0.5, abs(vnoise(wp * 2.2) - 0.5) + 0.46) * zoomFade;
    c = mix(c, acc, n * 0.5);
    c *= 0.88 + fine * 0.2 - cracks * 0.15;
  } else if (t == 27) { // red line strata
    float strata = sin(wp.y * 0.9 + vnoise(wp * 0.2) * 6.0);
    c = mix(c, acc, smoothstep(-0.3, 0.9, strata) * 0.5 + n * 0.2);
    c *= 0.9 + fine * 0.15;
  } else if (t == 32) { // flowers
    c = mix(c, pal(17, 1), n * 0.4);
    float fl = step(0.84, vnoise(wp * 5.0)) * zoomFade;
    vec3 fc = mix(acc, vec3(1.0, 0.9, 0.3), step(0.5, hash(floor(wp * 5.0) + 7.0)));
    c = mix(c, fc, fl);
  } else if (t == 33) { // sakura petals on grass
    c = mix(c, pal(17, 1), n * 0.35);
    c = mix(c, acc, step(0.8, vnoise(wp * 6.0)) * 0.8 * zoomFade);
  } else if (t == 34 || t == 48) { // candy / cake
    float stripe = step(0.5, fract((wp.x + wp.y) * 0.5));
    c = mix(c, acc, stripe * 0.35 + n * 0.2);
    if (t == 34) c = mix(c, vec3(0.6, 0.85, 1.0), step(0.9, vnoise(wp * 4.0)) * 0.6 * zoomFade);
  } else if (t == 35) { // island cloud
    float puff = fbm(wp * 0.8 + uTime * 0.02);
    c = mix(acc, c * 0.93, smoothstep(0.35, 0.75, puff));
  } else if (t == 36 || t == 49) { // coral / sea floor
    c = mix(c, acc, n * 0.6);
    c = mix(c, vec3(0.95, 0.5, 0.55), step(0.86, vnoise(wp * 4.3)) * 0.5 * zoomFade);
  }
  return c;
}

vec3 manmadeDetail(int t, vec3 c, vec3 acc, vec2 wp, float var, float zoomFade) {
  vec2 f = fract(wp);
  if (t == 28 || t == 40) { // stone slabs / marble
    vec2 g = fract(wp * vec2(1.0, 1.0) + vec2(step(0.5, fract(wp.y * 0.5)) * 0.5, 0.0));
    float edge = (1.0 - smoothstep(0.0, 0.06, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)))) * zoomFade;
    c = mix(c, acc, vnoise(wp * 2.0) * 0.4);
    c *= 1.0 - edge * 0.22;
    if (t == 40) c = mix(c, vec3(0.8, 0.78, 0.74), smoothstep(0.55, 0.6, vnoise(wp * vec2(3.0, 0.7))) * 0.2 * zoomFade);
  } else if (t == 29) { // cobbles
    vec2 g = wp * 2.2;
    g.x += step(0.5, fract(g.y * 0.5)) * 0.5;
    vec2 cf = fract(g) - 0.5;
    float cob = 1.0 - smoothstep(0.32, 0.5, length(cf));
    c = mix(c * 0.7, mix(c, acc, hash(floor(g))), cob * zoomFade + (1.0 - zoomFade));
  } else if (t == 30 || t == 45) { // planks
    float plank = fract(wp.y * 2.0);
    float seam = (1.0 - smoothstep(0.0, 0.08, min(plank, 1.0 - plank))) * zoomFade;
    float grain = vnoise(vec2(wp.x * 1.5, floor(wp.y * 2.0) * 7.0));
    c = mix(c, acc, grain * 0.5);
    c *= 1.0 - seam * 0.35;
  } else if (t == 31) { // farm rows
    float row = sin(wp.y * 6.2832 * 1.5);
    c = mix(c, acc, smoothstep(-0.2, 0.6, row));
    c = mix(c, vec3(0.35, 0.6, 0.25), step(0.55, row) * step(0.5, vnoise(wp * 3.0)) * 0.6);
  } else if (t == 44) { // sea-train rails over water
    float sleeper = step(0.72, fract(wp.x * 2.0));
    c = mix(vec3(0.24, 0.5, 0.7), c, sleeper);
    float rail = step(abs(f.y - 0.3), 0.05) + step(abs(f.y - 0.7), 0.05);
    c = mix(c, acc, clamp(rail, 0.0, 1.0));
  } else if (t == 41) { // walls
    vec2 b = fract(wp * vec2(2.0, 4.0) + vec2(step(0.5, fract(wp.y * 2.0)) * 0.5, 0.0));
    float mortar = 1.0 - smoothstep(0.0, 0.08, min(min(b.x, 1.0 - b.x), min(b.y, 1.0 - b.y)));
    c = mix(c, acc, vnoise(wp * 3.0) * 0.3);
    c *= 1.0 - mortar * 0.3 * zoomFade;
  } else if (t == 53) { // tatami
    vec2 g = fract(wp * vec2(0.5, 1.0));
    float edge = 1.0 - smoothstep(0.0, 0.05, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
    c = mix(c, acc, vnoise(vec2(wp.x * 8.0, wp.y)) * 0.3);
    c = mix(c, vec3(0.25, 0.35, 0.2), edge * zoomFade);
  } else if (t == 52) { // carpet
    c = mix(c, acc, step(0.5, fract((wp.x + wp.y) * 1.0)) * 0.2);
    float border = 1.0 - smoothstep(0.0, 0.12, min(f.x, 1.0 - f.x));
    c = mix(c, vec3(0.85, 0.7, 0.2), border * 0.0);
  } else if (t == 54) { // steel
    c = mix(c, acc, vnoise(wp * vec2(0.5, 6.0)) * 0.5);
    float rivet = step(length(fract(wp * 2.0) - 0.5), 0.07) * zoomFade;
    c = mix(c, vec3(0.8), rivet * 0.5);
  } else if (t == 42) { // gold
    c = mix(c, acc, vnoise(wp * 4.0));
    c += step(0.93, vnoise(wp * 12.0 + uTime)) * 0.4 * zoomFade;
  }
  return c;
}

vec3 waterColor(int lt, float sd, vec2 wp, float zoomFade) {
  int reg = regionOf(wp);
  float depth = clamp(-sd, 0.0, 32.0);
  float t = uTime;
  vec3 shallow = vec3(0.30, 0.84, 0.86);
  vec3 mid = vec3(0.09, 0.56, 0.80);
  vec3 deep = vec3(0.04, 0.28, 0.58);
  float waveAmp = 1.0;
  if (reg == 1) { mid = vec3(0.06, 0.52, 0.72); deep = vec3(0.02, 0.24, 0.50); waveAmp = 1.3; }
  else if (reg == 2) { mid = vec3(0.08, 0.44, 0.72); deep = vec3(0.05, 0.19, 0.46); waveAmp = 1.6; }
  else if (reg == 3) { mid = vec3(0.18, 0.52, 0.66); deep = vec3(0.13, 0.40, 0.55); waveAmp = 0.05; }
  else if (reg == 4) { mid = vec3(0.22, 0.52, 0.70); deep = vec3(0.14, 0.34, 0.52); waveAmp = 0.8; }
  if (lt == 1 || lt == 7) { shallow = vec3(0.36, 0.80, 0.78); mid = vec3(0.16, 0.56, 0.70); deep = mid; waveAmp = 0.4; }
  if (lt == 2) { shallow = vec3(0.28, 0.66, 0.78); mid = vec3(0.14, 0.50, 0.70); deep = mid; waveAmp = 0.3; }
  if (uZone == 2) { shallow = vec3(0.20, 0.55, 0.75); mid = vec3(0.07, 0.30, 0.55); deep = vec3(0.02, 0.10, 0.28); }

  vec3 col = mix(shallow, mid, smoothstep(0.0, 4.5, depth));
  col = mix(col, deep, smoothstep(4.0, 20.0, depth));
  waveAmp *= 1.0 + uStorm * 1.5;

  vec2 wd = uWind * (0.6 + uStorm);
  float n1 = vnoise(wp * 0.55 + wd * t * 0.45);
  float n2 = vnoise(wp * 1.7 - vec2(wd.y, -wd.x) * t * 0.7 + 31.0);
  float n3 = vnoise(wp * 4.3 + wd * t * 1.3 + 71.0) * zoomFade;
  float waves = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
  col *= 0.93 + waves * 0.16 * min(waveAmp, 1.4);
  float crest = smoothstep(0.66, 0.84, waves) * waveAmp;
  col = mix(col, vec3(0.85, 0.95, 1.0), crest * 0.1);
  // caustics in shallow water
  float caus = abs(sin(vnoise(wp * 2.2 + t * 0.35) * 9.0)) ;
  col += (1.0 - caus) * 0.08 * (1.0 - smoothstep(0.0, 3.0, depth)) * zoomFade * uDay;
  // sun glints
  float glint = step(0.975, vnoise(wp * 6.0 + vec2(t * 0.9, -t * 0.4))) * zoomFade * waveAmp;
  col += glint * 0.35 * (0.3 + 0.7 * uDay);
  // coastline foam
  float nearCoast = smoothstep(-2.2, -0.15, sd);
  float fp = sin(sd * 5.5 - t * 2.1 + vnoise(wp * 1.3) * 7.0);
  col = mix(col, vec3(0.93, 0.97, 1.0), nearCoast * smoothstep(0.35, 0.95, fp) * 0.55 * (reg == 3 ? 0.3 : 1.0));
  col = mix(col, vec3(0.92, 0.97, 1.0), smoothstep(-0.32, -0.04, sd) * 0.65);
  if (reg == 3) { // glassy calm belt with long slow swells
    float swell = sin(wp.y * 0.35 + vnoise(wp * 0.08) * 6.0 + t * 0.15);
    col *= 0.97 + swell * 0.02;
  }
  return col;
}

vec3 liquidSpecial(int lt, vec3 col, vec2 wp, float sd) {
  float t = uTime;
  if (lt == 4) { // lava
    float f = fbm(wp * 0.9 + vec2(t * 0.1, -t * 0.07));
    vec3 c = mix(vec3(0.55, 0.06, 0.02), vec3(1.0, 0.45, 0.05), smoothstep(0.35, 0.7, f));
    c = mix(c, vec3(1.0, 0.85, 0.3), smoothstep(0.68, 0.8, f));
    return c;
  }
  if (lt == 3) { // sea cloud
    float puff = fbm(wp * 0.35 + vec2(t * 0.03, t * 0.01));
    vec3 c = mix(vec3(0.80, 0.88, 0.97), vec3(1.0), smoothstep(0.35, 0.75, puff));
    c = mix(c, vec3(0.70, 0.80, 0.95), smoothstep(-3.0, -12.0, sd) * 0.3);
    return c;
  }
  if (lt == 6) { // abyss / waterfall hole
    float swirl = vnoise(vec2(atan(wp.y, wp.x) * 3.0, length(wp) * 0.3 - t));
    return mix(vec3(0.01, 0.05, 0.12), vec3(0.1, 0.3, 0.5), swirl * 0.4);
  }
  if (lt == 5) { // reef
    float r = vnoise(wp * 2.4);
    return mix(col, vec3(0.93, 0.85, 0.62), smoothstep(0.45, 0.8, r) * 0.55);
  }
  if (lt == 8) { // poison
    return mix(vec3(0.3, 0.6, 0.2), vec3(0.7, 0.9, 0.3), vnoise(wp * 2.0 + t * 0.3));
  }
  return col;
}

vec3 applyLights(vec3 col, vec2 wp) {
  vec3 lit = col * uAmbient;
  vec3 add = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= uNumLights) break;
    vec4 L = uLights[i];
    float dx = wp.x - L.x;
    dx -= WW * floor(dx / WW + 0.5);
    float d = length(vec2(dx, wp.y - L.y));
    float a = max(0.0, 1.0 - d / L.z);
    add += uLightCol[i] * a * a * L.w;
  }
  return lit + col * add;
}

vec4 mapColor(vec2 wp) {
  vec2 uv = vec2(mod(wp.x, WW), wp.y) / uWorldSize;
  vec3 mc = texture(uMap, uv).rgb;
  float sd = (texture(uDist, uv).r * 255.0 - 128.0) * 0.25;
  float fog = texture(uFog, uv).r;
  float px = 1.0 / uZoom;
  vec3 parch = vec3(0.94, 0.88, 0.73) * (0.9 + 0.1 * fbm(wp * 0.02));
  parch *= 1.0 - 0.08 * smoothstep(0.55, 0.9, fbm(wp * 0.006 + 3.0));
  vec3 col = mix(parch, mc, 0.62);
  float ink = 1.0 - smoothstep(0.0, 1.8 * px + 0.25, abs(sd));
  col = mix(col, vec3(0.28, 0.2, 0.12), ink * 0.85);
  // Grand Line / Calm Belt boundary lines like Nami's chart
  float yy = wp.y;
  float lw = 1.3 * px;
  float gl = 1.0 - smoothstep(0.0, lw, min(abs(yy - (EQY - GLH)), abs(yy - (EQY + GLH))));
  float cb = 1.0 - smoothstep(0.0, lw * 0.7, min(abs(yy - (EQY - GLH - CBW)), abs(yy - (EQY + GLH + CBW))));
  int reg = regionOf(wp);
  if (reg != 5) {
    col = mix(col, vec3(0.2, 0.45, 0.35), gl * 0.9);
    col = mix(col, vec3(0.35, 0.45, 0.5), cb * 0.5);
  }
  // hatching in the calm belts
  if (reg == 3 && sd < 0.0) {
    float h = step(0.5, fract((wp.x + wp.y) * 0.06 / max(px, 0.05) * px * 4.0));
    col = mix(col, col * 0.9, h * 0.35);
  }
  // unexplored parts fade to blank parchment
  col = mix(parch * vec3(0.98, 0.96, 0.92), col, smoothstep(0.05, 0.6, fog) * 0.85 + 0.15 * uSurfaceMap);
  // (on the globe: the seas told apart by colour as on the world map, fog or not — the Blues blue,
  // the Calm Belts a still grey-green, hatched, Paradise gold, the New World amber; the Red Line red)
  if (uGlobe > 0.5) {
    float ady = abs(wp.y - EQY);
    vec3 tint = ady < GLH ? (mod(wp.x, WW) > RMX ? vec3(0.97, 0.86, 0.6) : vec3(0.95, 0.74, 0.56))
      : ady < GLH + CBW ? vec3(0.7, 0.76, 0.72)
      : (wp.y < POL || wp.y > HH - POL) ? vec3(0.86, 0.9, 0.94) : vec3(0.66, 0.8, 0.94);
    if (reg == 5) tint = sd > 0.0 ? vec3(0.86, 0.48, 0.4) : vec3(0.66, 0.8, 0.94);
    float sea = reg == 5 ? 1.0 : 1.0 - smoothstep(-0.5, 0.5, sd) * smoothstep(0.05, 0.6, fog);
    col *= mix(vec3(1.0), tint, sea);
    if (reg == 3 && sd < 0.0) {
      float hp = max(4.0, px * 9.0);
      col *= 1.0 - 0.1 * step(0.6, fract((wp.x + wp.y) / hp));
    }
  }
  // latitude/longitude grid
  float gx = abs(fract(wp.x / 256.0 + 0.5) - 0.5) * 256.0;
  float gy = abs(fract(wp.y / 256.0 + 0.5) - 0.5) * 256.0;
  float grid = 1.0 - smoothstep(0.0, px * 0.9, min(gx, gy));
  col = mix(col, vec3(0.45, 0.35, 0.22), grid * 0.12);
  return vec4(col, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 wp = uCam + vec2(frag.x - uRes.x * 0.5, uRes.y * 0.5 - frag.y) / uZoom;
  if (uMapMode > 0.5) {
    if (wp.y < 0.0 || wp.y > HH) { outColor = vec4(0.16, 0.12, 0.08, 1.0); return; }
    outColor = mapColor(wp);
    return;
  }
  if (wp.y < 0.0 || wp.y > uWorldSize.y) {
    vec3 edge = uZone == 1 ? vec3(0.55, 0.75, 0.98) : (uZone == 2 ? vec3(0.02, 0.08, 0.2) : vec3(0.85, 0.93, 0.98));
    outColor = vec4(edge * uAmbient, 1.0);
    return;
  }
  wp.x = mod(wp.x, uWorldSize.x);
  float zoomFade = smoothstep(6.0, 18.0, uZoom);

  float sd = sdAt(wp);
  ivec2 cell = ivec2(floor(wp));
  vec4 tc = fetchW(cell);
  int ctype = typeOf(tc);
  vec3 col;

  if (manmade(ctype)) {
    col = manmadeDetail(ctype, pal(ctype, 0), pal(ctype, 1), wp, tc.a, zoomFade);
    if (overlayT(ctype)) {
      // soft shadow at deck edges over water
      vec2 f = fract(wp);
      float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      bool nL = typeOf(fetchW(cell + ivec2(-1, 0))) < 16;
      bool nR = typeOf(fetchW(cell + ivec2(1, 0))) < 16;
      bool nU = typeOf(fetchW(cell + ivec2(0, -1))) < 16;
      bool nD = typeOf(fetchW(cell + ivec2(0, 1))) < 16;
      float edgeDark = 0.0;
      if (nL) edgeDark = max(edgeDark, 1.0 - smoothstep(0.0, 0.12, f.x));
      if (nR) edgeDark = max(edgeDark, 1.0 - smoothstep(0.0, 0.12, 1.0 - f.x));
      if (nU) edgeDark = max(edgeDark, 1.0 - smoothstep(0.0, 0.12, f.y));
      if (nD) edgeDark = max(edgeDark, 1.0 - smoothstep(0.0, 0.18, 1.0 - f.y));
      col *= 1.0 - edgeDark * 0.45;
    }
  } else {
    // organic blending of the 4 nearest tiles, with a noisy sample offset
    vec2 wpp = wp + (vec2(vnoise(wp * 1.3), vnoise(wp * 1.3 + 57.0)) - 0.5) * 0.9;
    vec2 q = wpp - 0.5;
    ivec2 i0 = ivec2(floor(q));
    vec2 f = fract(q);
    vec4 t00 = fetchW(i0), t10 = fetchW(i0 + ivec2(1, 0)), t01 = fetchW(i0 + ivec2(0, 1)), t11 = fetchW(i0 + ivec2(1, 1));
    int y00 = typeOf(t00), y10 = typeOf(t10), y01 = typeOf(t01), y11 = typeOf(t11);
    float w00 = (1.0 - f.x) * (1.0 - f.y), w10 = f.x * (1.0 - f.y), w01 = (1.0 - f.x) * f.y, w11 = f.x * f.y;
    bool water = sd < 0.0;
    if (water) {
      // dominant liquid
      int lt = 0; float best = -1.0;
      if (y00 < 16 && w00 > best) { best = w00; lt = y00; }
      if (y10 < 16 && w10 > best) { best = w10; lt = y10; }
      if (y01 < 16 && w01 > best) { best = w01; lt = y01; }
      if (y11 < 16 && w11 > best) { best = w11; lt = y11; }
      if (best < 0.0) lt = ctype < 16 ? ctype : 0;
      col = waterColor(lt, sd, wp, zoomFade);
      col = liquidSpecial(lt, col, wp, sd);
    } else {
      vec3 acc3 = vec3(0.0); float wsum = 0.0; int dom = 17; float best = -1.0;
      float m00 = (y00 >= 16 && !manmade(y00)) ? w00 : 0.0;
      float m10 = (y10 >= 16 && !manmade(y10)) ? w10 : 0.0;
      float m01 = (y01 >= 16 && !manmade(y01)) ? w01 : 0.0;
      float m11 = (y11 >= 16 && !manmade(y11)) ? w11 : 0.0;
      if (m00 + m10 + m01 + m11 < 0.0001) { m00 = w00; m10 = w10; m01 = w01; m11 = w11; }
      int c00 = int(t00.b * 255.0 + 0.5), c10 = int(t10.b * 255.0 + 0.5), c01 = int(t01.b * 255.0 + 0.5), c11 = int(t11.b * 255.0 + 0.5);
      if (m00 > 0.0) { acc3 += climateTint(c00, pal(y00, 0)) * m00; wsum += m00; if (m00 > best) { best = m00; dom = y00; } }
      if (m10 > 0.0) { acc3 += climateTint(c10, pal(y10, 0)) * m10; wsum += m10; if (m10 > best) { best = m10; dom = y10; } }
      if (m01 > 0.0) { acc3 += climateTint(c01, pal(y01, 0)) * m01; wsum += m01; if (m01 > best) { best = m01; dom = y01; } }
      if (m11 > 0.0) { acc3 += climateTint(c11, pal(y11, 0)) * m11; wsum += m11; if (m11 > best) { best = m11; dom = y11; } }
      col = acc3 / max(wsum, 0.0001);
      if (dom >= 16 && dom < 256) {
        int cl = int(tc.b * 255.0 + 0.5);
        col = groundDetail(dom, col, climateTint(cl, pal(dom, 1)), wp, tc.a, zoomFade);
      }
      // hill shading from elevation
      vec2 qe = wp - 0.5;
      ivec2 j0 = ivec2(floor(qe));
      vec2 g = fract(qe);
      float e00 = fetchW(j0).g, e10 = fetchW(j0 + ivec2(1, 0)).g, e01 = fetchW(j0 + ivec2(0, 1)).g, e11 = fetchW(j0 + ivec2(1, 1)).g;
      float ex = mix(e10 - e00, e11 - e01, g.y);
      float ey = mix(e01 - e00, e11 - e10, g.x);
      float elev = mix(mix(e00, e10, g.x), mix(e01, e11, g.x), g.y);
      vec3 nrm = normalize(vec3(-ex * 9.0, -ey * 9.0, 1.0));
      float lambert = dot(nrm, normalize(vec3(-0.55, -0.75, 0.9)));
      col *= 0.72 + 0.36 * lambert;
      if (dom == 50) {
        float slope = length(vec2(ex, ey)) * 12.0;
        float snow = smoothstep(0.25, 0.55, elev + vnoise(wp * 0.8) * 0.12) * (1.0 - smoothstep(0.5, 1.2, slope));
        col = mix(col, vec3(0.95, 0.97, 1.0) * (0.85 + 0.2 * lambert), snow);
      }
      // wet sand at the waterline
      col *= 1.0 - (1.0 - smoothstep(0.0, 0.45, sd)) * 0.18;
    }
  }
  // storms darken and desaturate
  float grey = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(grey) * 0.8, uStorm * 0.45);
  col = applyLights(col, wp);
  if (uZone == 2) col = mix(col, vec3(0.05, 0.25, 0.45), 0.25) + 0.05 * smoothstep(0.6, 1.0, vnoise(vec2(wp.x * 0.1 + uTime * 0.05, 0.0)));
  outColor = vec4(col, 1.0);
}
`;
