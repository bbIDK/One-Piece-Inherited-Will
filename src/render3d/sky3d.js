// Sky dome, sun, moon, stars and clouds, plus the scene lighting and fog —
// all driven by the game's clock and weather (game/env.js).
//
// The look is the anime's: a clean blue gradient; fair-weather cumulus cut
// crisp out of one shared noise texture (skynoise.js), cel-shaded in three
// flat tones — sunlit white tops, blue-lavender shade, a flat darker base —
// with a silver lining toward the sun; and the weather taking the whole sky
// over smoothly. Rain greys it under a soft deck; a thunderstorm brings a
// dark, heavy deck with structure (rolls and billows, not grey fog), ragged
// scud racing under it, a cumulonimbus tower on the horizon (it shows before
// the storm arrives), rain hanging from it in shafts, and lightning lighting
// the clouds from inside. By night: a starfield of many faint stars and a few
// bright ones, gently twinkling, a soft Milky Way, the moon in its phase; the
// stars fade behind cloud and overcast. Above the clouds (the sky islands) a
// sea of cloud lies below the horizon.
//
// It costs one full-screen-ish pass over the sky's own pixels (it's drawn
// after the opaque world, so only where the sky shows), a handful of texture
// taps each; 'low' quality (the LOW define) leaves out the scud, the rain
// shafts, the tower's detail, the Milky Way and most of the stars.
import * as THREE from 'three';
import { FOG } from './fog.js';
import { SunShadow } from './sunshadow.js';
import { DEEP, MID } from './bubble3d.js';
import { skyNoise } from './skynoise.js';
// the lowest the light that casts the shadows goes (sine of its elevation)
const MIN_LIGHT_Y = 0.24;

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
  uniform float uNight, uTime, uZone, uDusk;
  uniform float uCloud;     // fair-weather cloud cover 0..1
  uniform float uOvercast;  // the grey deck over everything 0..1
  uniform float uStorm;     // how dark and wild the deck is, and the scud under it
  uniform float uRainSky;   // rain hanging under the clouds far off, in shafts
  uniform float uFront;     // a cumulonimbus tower on the horizon…
  uniform vec2 uFrontDir;   // …this way (x, z)
  uniform vec4 uFlash;      // lightning: toward it (xyz), how bright (w)
  uniform vec4 uDrift;      // how far the clouds have drifted: cumulus (xy), deck (zw)
  uniform vec2 uScudDrift;
  uniform vec3 uCLit, uCMid, uCShade, uDeckLo, uDeckHi, uFlashCol;
  uniform float uMoonPhase; // 0 full … 0.5 new
  uniform float uMoonLight; // how much of the moon is lit
  uniform mat3 uStarRot;    // the stars' turn round the pole
  uniform float uAurora, uHeat, uDust;
  uniform vec3 uDustCol;
  uniform sampler2D uNoise;
  varying vec3 vDir;

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  vec4 N(vec2 uv) { return texture2D(uNoise, uv); }
  // (the finest level: for broad shapes read inside a branch, where a pixel's
  // neighbours may not run with it and the mip level can't be worked out)
  vec4 N0(vec2 uv) { return textureLod(uNoise, uv, 0.0); }

  // the fair-weather layer's density: a smooth cover with round billows on it
  float cumulus(vec2 p) {
    float r = N(p * 0.12).r;
    float b = N(mat2(0.8, -0.6, 0.6, 0.8) * p * 0.15 + vec2(0.31, 0.17)).b;
    float a = N(mat2(0.6, 0.8, -0.8, 0.6) * p * 0.19 + vec2(0.77, 0.53)).a;
    return r * 0.6 + b * 0.27 + a * 0.13;
  }
  // three flat tones (lit 0..1), hard bands between them
  vec3 cel(float lit, vec3 shade, vec3 mid, vec3 light) {
    vec3 c = mix(shade, mid, smoothstep(0.3, 0.36, lit));
    return mix(c, light, smoothstep(0.6, 0.66, lit));
  }

  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    float px = max(length(fwidth(d)), 1e-4); // (how much of the sky a pixel covers: before any branch)
    // 10,000 m down (Fish-Man Island, out in the deep beyond its bubble): no
    // sun, moon or stars — the dark of the deep sea, the daylight filtering
    // down from far above in rays
    if (uZone == 2.0) {
      float az = atan(d.z, d.x);
      vec3 c2 = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.6)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.4, -y));
      float r = 0.5 + 0.5 * sin(az * 23.0 + sin(az * 5.0 + uTime * 0.05) * 2.0);
      c2 += uTop * 1.4 * pow(r, 4.0) * smoothstep(0.2, 1.0, y) * (1.0 - uNight * 0.8);
      c2 += vec3(0.25, 0.45, 0.55) * pow(max(y, 0.0), 6.0) * 0.6 * (1.0 - uNight * 0.8);
      gl_FragColor = vec4(c2, 1.0);
      return;
    }
    // ---- the clear sky: below the horizon it only ever shows past the edge
    // of the sea, so it keeps the far sea's hazy colour there
    vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.35, -y) * 0.6);
    // hot air: a white glare low down; windborne dust: an ochre haze
    col = mix(col, uHorizon * 1.08 + 0.03, uHeat * 0.35 * exp(-max(y, 0.0) * 9.0));
    col = mix(col, uDustCol, uDust * 0.75 * exp(-max(y, 0.0) * 3.5));
    float clearSky = 1.0 - uOvercast;
    // the sun, and its glow (through cloud a broad pale glow, no disc)
    float sd = max(dot(d, uSunDir), 0.0);
    float disc = smoothstep(0.99955, 0.9997, sd) * 5.0 + pow(sd, 900.0) * 2.0;
    col += uSunCol * (disc * clearSky * clearSky * (1.0 - uDust * 0.6) + pow(sd, 12.0) * 0.35 * (1.0 - uOvercast * 0.6) + pow(sd, 3.0) * (0.08 * uDusk + 0.1 * uHeat));
    col += uSunCol * pow(sd, 4.0) * 0.18 * uOvercast * (1.0 - uStorm * 0.7);
    // ---- night: the moon, the stars, the Milky Way (fading behind cloud)
    // (the stars wait for the dark; the moon shows from dusk)
    float nightVis = smoothstep(0.45, 0.9, uNight) * clearSky;
    if (y > -0.05 && uNight * clearSky > 0.02) {
      vec3 sd3 = uStarRot * d;
      float low = smoothstep(-0.02, 0.18, y);
      // the moon's glow drowns the faint stars near it
      float mGlow = pow(max(dot(d, uMoonDir), 0.0), 40.0) * uMoonLight;
      float starK = nightVis * low * (1.0 - mGlow * 0.85);
      vec3 stars = vec3(0.0);
      #ifndef LOW
      // the Milky Way: a soft, clumpy band round a great circle, a dark rift down it
      const vec3 MW = vec3(0.36, 0.42, 0.83), MWA = vec3(0.92, -0.32, -0.23);
      float lat = dot(sd3, MW);
      vec3 MWB = cross(MW, MWA);
      float lon = atan(dot(sd3, MWB), dot(sd3, MWA)) / 6.2831853;
      vec4 mn = N0(vec2(lon * 3.0, lat * 1.4 + 0.5));
      float band = exp(-lat * lat / (0.012 + 0.02 * mn.g));
      float rift = exp(-pow((lat - 0.015 * sin(lon * 31.4)) / 0.018, 2.0)) * smoothstep(0.35, 0.75, mn.r);
      float mw = band * (0.45 + 0.9 * mn.b * mn.r) * (1.0 - 0.7 * rift);
      stars += mix(vec3(0.42, 0.5, 0.75), vec3(0.75, 0.66, 0.55), mn.a * band) * mw * 0.09;
      // stars in three layers: many faint, some brighter, a few bright
      for (int i = 0; i < 3; i++) {
        float S = i == 0 ? 210.0 : i == 1 ? 96.0 : 44.0;
        float dens = (i == 0 ? 0.11 : i == 1 ? 0.1 : 0.1) + band * (i == 0 ? 0.3 : 0.12);
      #else
      float band = 0.0;
      for (int i = 1; i < 2; i++) {
        float S = 96.0, dens = 0.2;
      #endif
        vec3 p = sd3 * S, c = floor(p);
        vec3 h = hash33(c + float(i) * 17.13);
        if (h.x < dens) {
          vec3 o = hash33(c + 41.7 + float(i));
          vec3 q = normalize(c + 0.2 + 0.6 * o) * S; // (the star, on the sphere)
          vec3 f = q - c;
          if (all(greaterThan(f, vec3(0.12))) && all(lessThan(f, vec3(0.88)))) {
            float r = length(p - q);
            float mag = i == 0 ? 0.05 + 0.12 * h.y : i == 1 ? 0.16 + 0.34 * h.y * h.y : 0.5 + 1.3 * pow(h.y, 3.0);
            float sz = px * S * (0.42 + 0.22 * h.z + float(i) * 0.14);
            float tw = 1.0 + (0.18 + 0.3 * (1.0 - y)) * sin(uTime * (1.3 + 3.0 * h.z) + h.y * 40.0) * float(i > 0);
            vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.66), o.z);
            stars += tint * mag * tw * exp(-r * r / (sz * sz));
          }
        }
      }
      col += stars * starK;
      // the moon in its phase: lit where it faces the sun, the dark side just
      // showing by earthshine, a halo round it
      float md = dot(d, uMoonDir);
      if (md > 0.99) {
        vec3 mr = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
        vec3 mu = cross(mr, uMoonDir);
        vec2 q = vec2(dot(d, mr), dot(d, mu)) / 0.036;
        float r2 = dot(q, q);
        if (r2 < 1.2) {
          vec3 n = vec3(q, sqrt(max(0.0, 1.0 - r2)));
          float ph = uMoonPhase * 6.2831853;
          float lit = smoothstep(-0.04, 0.06, dot(n, vec3(sin(ph), 0.0, cos(ph))));
          float maria = textureLod(uNoise, q * 0.22 + 0.5, 0.0).g;
          vec3 mc = vec3(1.0, 0.97, 0.88) * (0.78 + 0.3 * smoothstep(0.35, 0.6, maria)) * lit * 1.6 + vec3(0.05, 0.06, 0.09);
          float edge = 1.0 - smoothstep(0.92, 1.0, r2);
          col = mix(col, mc, edge * smoothstep(0.05, 0.4, uNight) * (1.0 - uOvercast));
        }
      }
      col += vec3(0.5, 0.6, 0.85) * (pow(max(md, 0.0), 300.0) * 0.25 + mGlow * 0.06) * uNight * (1.0 - uOvercast * 0.5);
      // the aurora: curtains of light low in the north
      #ifndef LOW
      if (uAurora > 0.01) {
        float az = atan(d.z, d.x) / 6.2831853;
        vec4 an = N0(vec2(az * 3.0 + uTime * 0.004, 0.37));
        float h0 = 0.08 + 0.22 * an.r;
        float rays = 0.55 + 0.45 * N0(vec2(az * 26.0, uTime * 0.03)).b;
        float a = smoothstep(h0, h0 + 0.04, y) * exp(-(y - h0) * 5.0) * rays * smoothstep(-0.1, 0.6, -d.z);
        col += mix(vec3(0.1, 1.0, 0.55), vec3(0.65, 0.25, 0.95), smoothstep(h0 + 0.05, h0 + 0.3, y)) * a * uAurora * nightVis * 0.55;
      }
      #endif
    }
    if (uZone == 3.0) { gl_FragColor = vec4(col, 1.0); return; }

    float az = atan(d.z, d.x);
    vec2 ap = vec2(cos(az), sin(az));
    vec2 sunH = normalize(uSunDir.xz + vec2(1e-4));
    float sunUp = clamp(uSunDir.y * 3.0 + 0.3, 0.0, 1.0);
    // (a lightning flash lights the clouds from inside: all of them a little,
    // those toward it a lot)
    float flash = uFlash.w * (0.1 + 0.9 * pow(max(dot(d, uFlash.xyz), 0.0), 6.0));

    // ---- above the clouds (the sky islands): a sea of cloud below the horizon
    if (uZone == 1.0) {
      if (y < 0.02) {
        vec2 cp = d.xz / (0.06 - min(y, 0.0)) * 0.9 + uDrift.xy * 0.5;
        float dn = cumulus(cp * 0.7);
        float dl = cumulus(cp * 0.7 + sunH * 0.5);
        float lit = clamp(0.55 + (dn - dl) * 5.0 + uSunDir.y * 0.2, 0.0, 1.0);
        vec3 cc = cel(lit, uCShade, uCMid, uCLit);
        cc = mix(cc, uHorizon, smoothstep(-0.25, 0.015, y) * 0.75);
        col = mix(col, cc, smoothstep(0.02, 0.0, y));
      }
      // wisps of cirrus high above
      vec2 hp = d.xz / (y + 0.25) * 0.6 + uDrift.xy * 0.3;
      float ci = N(vec2(hp.x * 0.05, hp.y * 0.22)).g;
      col = mix(col, uCLit, smoothstep(0.68, 0.8, ci) * 0.35 * smoothstep(0.08, 0.3, y));
      gl_FragColor = vec4(col, 1.0);
      return;
    }

    // ---- distant banks of cloud low on the horizon: flat-bottomed,
    // billowing on top, coming and going round the compass
    if (y > -0.012 && y < 0.26) {
      vec4 bn = N0(ap * 0.21 + 0.43);
      float bank = clamp(smoothstep(0.42, 0.72, bn.r) + uCloud * 0.45 + uOvercast * 0.4 - 0.12, 0.0, 1.0);
      if (bank > 0.01) {
        float topH = bank * (0.02 + 0.09 * bn.g);
        // a lumpy upper edge (in two scales) over a straight base
        float lumps = (N0(ap * 1.3 + vec2(y * 3.0, 0.3)).r - 0.5) * 0.06 + (N0(ap * 4.1 + 1.3).g - 0.5) * 0.02;
        float inside = topH + lumps * (0.4 + bank) - y;
        if (inside > 0.0) {
          float body = smoothstep(0.0, 0.004, inside) * smoothstep(-0.012, 0.003, y);
          float up = clamp(y / max(topH, 0.004), 0.0, 1.0);
          float toward = dot(ap, sunH);
          float lit = clamp(0.25 + up * 0.5 + toward * 0.25 * sunUp + (inside < 0.01 ? 0.12 : 0.0), 0.0, 1.0);
          vec3 cc = cel(lit, uCShade, uCMid, uCLit);
          cc += uSunCol * (1.0 - smoothstep(0.0, 0.01, inside)) * pow(sd, 6.0) * 0.6 * clearSky;
          cc += uFlashCol * flash * 0.3;
          // the farthest melt into the haze at the horizon
          cc = mix(cc, uHorizon, (1.0 - smoothstep(0.0, 0.06, y)) * 0.5);
          col = mix(col, cc, body * (0.6 + 0.35 * bank));
        }
      }
    }

    // ---- a storm's cumulonimbus: a dark tower on the horizon spreading into
    // an anvil, lit from inside by its lightning, rain hanging under it
    float towerBase = 0.0, towerA = 0.0;
    if (uFront > 0.01 && y > -0.02 && y < 0.62) {
      float da = acos(clamp(dot(ap, uFrontDir), -1.0, 1.0));
      float W = 0.55 + 0.35 * uFront;
      if (da < W * 1.7) {
        float H = uFront * 0.42;
        float k = da / W;
        float body = H * sqrt(max(0.0, 1.0 - k * k));
        // the anvil: flat on top, reaching out past the tower
        float anvil = H * 1.08 * smoothstep(1.7, 1.0, k) * step(H * 0.72, y);
        // (along the tower from its middle, so no seam at the back of the compass)
        float sa = atan(ap.y * uFrontDir.x - ap.x * uFrontDir.y, dot(ap, uFrontDir));
        #ifndef LOW
        float lump = (N0(vec2(sa * 1.1, y * 1.5) + 0.2).b - 0.5) * 0.07 + (N0(vec2(sa * 3.7, y * 4.0)).a - 0.5) * 0.025;
        #else
        float lump = (N0(vec2(sa * 1.1, y * 1.5) + 0.2).b - 0.5) * 0.07;
        #endif
        float top = max(body, anvil) + lump * uFront;
        if (y < top) {
          float a = smoothstep(0.0, 0.006, top - y) * smoothstep(1.7, 1.45, k);
          float up = clamp(y / max(H, 0.01), 0.0, 1.0);
          float lit = clamp(0.12 + up * 0.55 + dot(ap, sunH) * 0.2 * sunUp + (top - y < 0.015 ? 0.15 : 0.0), 0.0, 1.0);
          vec3 tc = cel(lit, uDeckLo, mix(uDeckLo, uDeckHi, 0.6), mix(uDeckHi, uCLit, 0.35));
          tc += uSunCol * (1.0 - smoothstep(0.0, 0.012, top - y)) * pow(sd, 5.0) * 0.5 * clearSky;
          tc += uFlashCol * flash * (0.3 + 0.5 * smoothstep(0.4, 0.7, N0(vec2(sa * 2.0, y * 3.0)).b));
          tc = mix(tc, uHorizon, (1.0 - smoothstep(0.0, 0.05, y)) * 0.35);
          col = mix(col, tc, a);
          towerA = a;
          towerBase = smoothstep(1.2, 0.6, k) * uFront;
        }
      }
    }

    // ---- the fair-weather cumulus overhead, drifting on the wind
    float cover = uCloud;
    if (y > 0.03 && cover > 0.01 && uOvercast < 0.97) {
      // (a layer low enough that clouds toward the horizon keep some size, not slivers)
      vec2 cp = d.xz / (y + 0.24) * 1.45 + uDrift.xy;
      float th = 0.54 + (0.5 - cover) * 0.42;
      // (all three taps every pixel: no texture reads in a branch that splits a cloud's edge)
      float n0 = cumulus(cp);
      // light: thinner toward the sun is the lit side; thinner toward the
      // zenith is a top; seen from right below, mostly the flat base
      float n1 = cumulus(cp + sunH * 0.16);
      float lit = 0.42 + (n0 - n1) * 9.0 * sunUp + uSunDir.y * 0.08;
      #ifndef LOW
      vec2 tz = cp - uDrift.xy;
      float n2 = cumulus(cp - normalize(tz + 1e-4) * 0.16);
      lit += (n0 - n2) * 7.0 * (1.0 - smoothstep(0.35, 0.9, y));
      #endif
      if (n0 > th - 0.02) {
        // (from right below, mostly the flat base; toward the sun, backlit: dark bodies, bright edges)
        lit -= smoothstep(0.45, 1.0, y) * 0.22 + pow(sd, 3.0) * 0.4 * clearSky;
        lit = clamp(lit, 0.0, 1.0);
        float w = mix(0.006, 0.016, y);
        float edge = smoothstep(th, th + w, n0);
        vec3 cc = cel(lit, uCShade, uCMid, uCLit);
        // a silver lining where it's thin and the sun is behind it
        cc += uSunCol * (1.0 - smoothstep(th, th + 0.07, n0)) * pow(sd, 4.0) * 1.4 * clearSky;
        cc += uFlashCol * flash * 0.35;
        cc = mix(cc, uHorizon, (1.0 - smoothstep(0.03, 0.22, y)) * 0.25);
        col = mix(col, cc, edge * smoothstep(0.03, 0.1, y));
      }
    }

    // ---- the deck: a soft grey sheet in the rain; in a storm one dark mass,
    // heavy billows cel-shaded like the fair-weather clouds but in slate,
    // their tops catching what light there is, darker still between them
    if (uOvercast > 0.01 && y > -0.01) {
      vec2 dp = d.xz / (y + 0.07) * 1.1 + uDrift.zw;
      float sn = N(dp * 0.035).r * 0.7 + N(mat2(0.8, -0.6, 0.6, 0.8) * dp * 0.12 + 0.3).g * 0.3;
      // (as a storm comes up the deck spreads from its side of the sky; the
      // tower's body stays in sight under it till the storm is overhead)
      float th = 1.05 - uOvercast * 1.2 + uFront * (1.0 - uOvercast) * (0.25 - 0.5 * (dot(ap, uFrontDir) * 0.5 + 0.5));
      float cov = smoothstep(th, th + 0.12, sn + 0.08) * smoothstep(-0.01, 0.03, y) * (1.0 - towerA * (1.0 - smoothstep(0.75, 1.0, uOvercast)));
      // (in a storm the sheet between the billows is an even dark: the billows give it its shape)
      vec3 dc = mix(mix(uDeckHi, uDeckLo, 0.45 * uStorm), uDeckLo, smoothstep(0.2, 0.85, sn) * (0.65 - 0.4 * uStorm));
      vec2 bp = dp * 0.5 + 7.0;
      float bn = cumulus(bp);
      float bth = 0.6 - uStorm * 0.16;
      #ifndef LOW
      // (lit from above and a little from the sun's side: one tap set toward both)
      float bu = cumulus(bp - normalize(dp - uDrift.zw + 1e-4) * 0.1 + sunH * 0.045 * sunUp);
      float blit = clamp(0.42 + (bn - bu) * 10.0 - smoothstep(0.5, 1.0, y) * 0.2, 0.0, 1.0);
      #else
      float blit = 0.45;
      #endif
      float bedge = smoothstep(bth, bth + 0.018, bn) * smoothstep(0.015, 0.08, y);
      vec3 bc = mix(cel(blit, uDeckLo * 0.62, uDeckLo * 0.95, mix(uDeckLo, uDeckHi, 0.75)), cel(blit, uDeckLo * 0.8, mix(uDeckLo, uDeckHi, 0.5), uDeckHi * 1.1), 1.0 - uStorm);
      dc = mix(dc, bc, bedge * (0.3 + 0.7 * uStorm));
      // (where the sun is behind it, it glows a little)
      dc += uSunCol * pow(sd, 6.0) * 0.25 * (1.0 - uStorm * 0.8) * (1.0 - uNight);
      dc += uFlashCol * flash * (0.22 + 0.55 * bedge * smoothstep(0.3, 0.7, blit));
      dc = mix(dc, uHorizon, (1.0 - smoothstep(0.0, 0.16, y)) * 0.45);
      col = mix(col, dc, cov);
    }

    #ifndef LOW
    // ---- scud: low, ragged, dark, racing under the storm
    if (uStorm > 0.3 && y > 0.02 && y < 0.7) {
      vec2 sp = d.xz / (y + 0.035) * 0.9 + uScudDrift;
      vec4 s1 = N(sp * 0.07);
      float sn = s1.g * 0.65 + N(sp * 0.23 + s1.rb * 0.3).a * 0.35;
      float th = 0.88 - (uStorm - 0.3) * 0.32;
      float sc = smoothstep(th, th + 0.05, sn) * smoothstep(0.02, 0.07, y) * smoothstep(0.7, 0.4, y) * smoothstep(0.3, 0.8, uOvercast);
      vec3 scC = mix(uDeckLo * 0.8, uDeckHi, smoothstep(th + 0.02, th + 0.12, N(sp * 0.23 + 0.5).b) * 0.5) + uFlashCol * flash * 0.15;
      col = mix(col, scC, sc * 0.85);
    }
    // ---- rain hanging from the clouds far off, in shafts down to the sea
    float shafts = max(uRainSky, towerBase * 0.8);
    if (shafts > 0.01 && y > -0.03 && y < 0.2) {
      // (whole turns of the texture round the compass: no seam)
      float az2 = az / 6.2831853;
      float curtain = smoothstep(0.35, 0.7, N0(vec2(az2 * 7.0 + uTime * 0.0005, 0.12)).r) * max(uRainSky, towerBase);
      float streak = N0(vec2(az2 * 128.0, y * 0.6 - uTime * 0.05)).g;
      float sh = curtain * (0.55 + 0.45 * streak) * smoothstep(0.2, 0.04, y) * smoothstep(-0.03, 0.0, y);
      col = mix(col, mix(uDeckLo, uHorizon, 0.45), sh * 0.75);
    }
    #endif

    // a lightning flash lights the sky behind the clouds too
    col += uFlashCol * flash * 0.1;
    // blowing sand veils the whole sky, thickest low down
    col = mix(col, uDustCol, uDust * (0.3 + 0.55 * exp(-max(y, 0.0) * 2.5)));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** An odd sky's colour over a colour: its brightness kept, its hue the sky's (a blue sky turns red, not purple-grey). */
const oddTint = (c, tint, k) => {
  if (k <= 0) return c;
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return lerp3(c, [l * tint[0] * 1.7, l * tint[1] * 1.7, l * tint[2] * 1.7], k);
};
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// (the haze inside Fish-Man Island's bubble: between the colours of its skin low down)
const BUBBLE_HAZE = lerp3(DEEP, MID, 0.45);
const _haze = new THREE.Color();
const DUST = [0.62, 0.45, 0.27]; // windborne sand: warm ochre
const POLE = new THREE.Vector3(0.1, 0.8, -0.59).normalize(); // the stars turn round it (north, part way up)
const _m4 = new THREE.Matrix4();

/** How grey the whole sky is: the overcast the weather makes. */
export function overcastOf(env) {
  // (the clouds' cover, which a storm brings with it; not the rain or the snow themselves: a
  // sun-shower, or the Grand Line's snow out of a clear sky, leave it clear)
  return Math.min(1, Math.max(sm(0.55, 0.95, env.cloud ?? (env.storm || 0) * 1.6), (env.ash || 0) * 0.9, (env.fog || 0) * 0.5));
}

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uTime: { value: 0 },
      uCloud: { value: 0.3 }, uOvercast: { value: 0 }, uStorm: { value: 0 }, uRainSky: { value: 0 }, uZone: { value: 0 }, uDusk: { value: 0 },
      uFront: { value: 0 }, uFrontDir: { value: new THREE.Vector2(1, 0) }, uFlash: { value: new THREE.Vector4(0, 1, 0, 0) },
      uDrift: { value: new THREE.Vector4() }, uScudDrift: { value: new THREE.Vector2() },
      uCLit: { value: new THREE.Color() }, uCMid: { value: new THREE.Color() }, uCShade: { value: new THREE.Color() },
      uDeckLo: { value: new THREE.Color() }, uDeckHi: { value: new THREE.Color() }, uFlashCol: { value: new THREE.Color(0.85, 0.88, 1.0) },
      uMoonPhase: { value: 0 }, uMoonLight: { value: 1 }, uStarRot: { value: new THREE.Matrix3() },
      uAurora: { value: 0 }, uHeat: { value: 0 }, uDust: { value: 0 },
      uDustCol: { value: new THREE.Color(...DUST) }, uNoise: { value: skyNoise() },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.material);
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
    this.overcast = 0; // (for the sea and the grading: see index.js)
    this.grade = { sat: 1, contrast: 1 };
    this.lastT = null;
  }

  /** 'low' quality: a plainer sky (no scud, rain shafts, Milky Way or faint stars). */
  setDetail(q) {
    const low = q === 'low', m = this.material;
    if (!!m.defines.LOW === low) return;
    if (low) m.defines.LOW = 1; else delete m.defines.LOW;
    m.needsUpdate = true;
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
    // (and it climbs as high as where you are lets it: overhead at noon on the
    // Grand Line, lower and lower toward the poles, standing to the south of
    // you in the north and to the north of you in the south; z is south)
    const lat = zone === 0 ? env.lat || 0 : 0.35, cl = Math.cos(lat), sl = Math.sin(lat);
    this.sunDir.set(Math.cos(a), Math.sin(a) * cl * 0.95 + 0.05, Math.sin(a) * sl + 0.12 * Math.sign(sl || 1)).normalize();
    // (10,000 m down the daylight comes from straight overhead, all day long)
    if (zone === 2) this.sunDir.set(0.22, 0.95, 0.2).normalize();
    // (Fish-Man Island: 1 inside its bubble, 0 out in the deep: see bubble3d.js)
    const ib = zone === 2 ? this.inBubble ?? 1 : 1;
    // (the moon keeps its own hours: opposite the sun when full, rising later each night after)
    const am = a + Math.PI + (env.moonPhase ?? 0) * Math.PI * 2 * 0.25;
    const moon = this.moonDir.set(Math.cos(am), Math.sin(am) * cl * 0.9 + 0.1, Math.sin(am) * sl - 0.1 * Math.sign(sl || 1)).normalize();
    const day = env.daylight;
    const night = 1 - day;
    const dusk = Math.max(0, 1 - Math.abs(c - 18.8) / 1.6, 1 - Math.abs(c - 6.2) / 1.6);
    // ---- the weather, as the sky shows it (above the clouds and below the sea, none)
    const wx = zone === 0;
    const storm = wx ? env.storm || 0 : 0, ov = wx ? overcastOf(env) : 0;
    const dust = wx ? env.dust || 0 : 0, heat = wx ? env.heat || 0 : 0, odd = wx ? env.odd || 0 : 0;
    this.overcast = ov;
    // ---- the clear sky's colours: day, dusk and night…
    // (by day the anime's: a deep cerulean overhead, still blue down to the
    // horizon, so the white cumulus stand out against it)
    let top = lerp3([0.02, 0.04, 0.12], [0.055, 0.26, 0.76], day);
    let hor = lerp3([0.06, 0.09, 0.2], [0.36, 0.62, 0.91], day);
    hor = lerp3(hor, [1.0, 0.62, 0.38], dusk * 0.75 * (1 - ov * 0.7));
    top = lerp3(top, [0.35, 0.33, 0.6], dusk * 0.35 * (1 - ov * 0.7));
    // …a deeper blue in the heat…
    top = lerp3(top, [0.1, 0.33, 0.8].map((v) => v * (0.25 + day * 0.75)), heat * 0.35);
    // …greyed by the weather: a soft grey for rain, slate for a storm
    const dayK = 0.18 + day * 0.82, nl = sm(0.25, 0.85, night);
    const greyTop = lerp3([0.3, 0.33, 0.38], [0.075, 0.09, 0.115], storm), greyHor = lerp3([0.5, 0.53, 0.56], [0.17, 0.19, 0.22], storm);
    const grey = Math.min(1, ov * 0.95 + (env.fog || 0) * 0.5 * (zone === 0 ? 1 : 0));
    // (an overcast night: a dark navy, not a grey)
    top = lerp3(top, lerp3(mul3(greyTop, dayK), [0.012, 0.015, 0.03], nl), grey);
    hor = lerp3(hor, lerp3(mul3(greyHor, dayK), [0.03, 0.036, 0.06], nl), grey);
    // (windborne dust browns the low sky; the snow whitens it)
    hor = lerp3(hor, mul3(DUST, 0.35 + day * 0.85), dust * 0.75);
    if (wx && env.snow) hor = lerp3(hor, mul3([0.78, 0.8, 0.84], dayK), env.snow * 0.35);
    let bottom = lerp3(hor, [0.05, 0.12, 0.2], 0.6);
    if (zone === 2) { // undersea: the deep sea (from inside the bubble, its skin is the sky: bubble3d.js)
      const k = 0.25 + 0.75 * day;
      top = [0.02, 0.1, 0.22].map((v) => v * k); hor = [0.012, 0.06, 0.13].map((v) => v * k); bottom = [0.004, 0.02, 0.05];
    } else if (zone === 3) { // prison interior
      top = [0.05, 0.02, 0.02]; hor = [0.18, 0.08, 0.06]; bottom = [0.05, 0.02, 0.02];
    } else if (zone === 1) { // above the clouds: a deep blue overhead, a white horizon over the cloud sea
      top = lerp3(top, [0.1, 0.32, 0.78].map((v) => v * (0.2 + day * 0.8)), 0.6);
      // (a soft blue-white haze, not a glare: the cloud sea below is white enough)
      hor = lerp3(hor, [0.78, 0.85, 0.94], 0.4 * day);
      bottom = hor;
    }
    // (the New World's odd skies: a red sky at noon, violet storm light)
    const tint = env.tint || [1, 1, 1];
    top = oddTint(top, tint, odd); hor = oddTint(hor, tint, odd); bottom = oddTint(bottom, tint, odd);
    u.uTop.value.setRGB(...top);
    u.uHorizon.value.setRGB(...hor);
    u.uBottom.value.setRGB(...bottom);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(moon);
    this.sunCol.setRGB(1, 0.92 - dusk * 0.2, 0.8 - dusk * 0.35);
    if (dust) this.sunCol.lerp(_haze.setRGB(1, 0.62, 0.35), dust * 0.5);
    u.uSunCol.value.copy(this.sunCol);
    u.uNight.value = night;
    u.uTime.value = env.time;
    u.uDusk.value = dusk;
    u.uZone.value = zone;
    // ---- the clouds: how many, how grey, how wild
    const cloud = wx ? env.cloud ?? Math.min(1, 0.3 + storm) : zone === 1 ? 0.25 : 0.3;
    u.uCloud.value = Math.min(1, cloud * 1.15) * (1 - sm(0.75, 1, ov) * 0.6);
    u.uOvercast.value = ov;
    u.uStorm.value = storm;
    u.uRainSky.value = wx ? Math.min(1, (env.rain || 0) * 0.6 + storm * 0.5) : 0;
    u.uFront.value = wx ? Math.max(env.front || 0, sm(0.5, 0.9, storm) * 0.8) : 0;
    const fa = env.frontAngle ?? (env.windAngle || 0) + Math.PI;
    u.uFrontDir.value.set(Math.cos(fa), Math.sin(fa));
    u.uHeat.value = heat;
    u.uDust.value = dust;
    u.uDustCol.value.setRGB(...mul3(DUST, 0.3 + day * 0.9));
    u.uAurora.value = wx || zone === 1 ? env.aurora || 0 : 0;
    // the clouds drift on the wind (a frame at a time, so a change in the wind never makes them jump)
    const dt = this.lastT === null ? 0 : Math.min(0.25, Math.max(0, env.time - this.lastT));
    this.lastT = env.time;
    const wX = env.windX ?? 0.7, wY = env.windY ?? 0.3;
    const D = u.uDrift.value, sp = 0.0095 * dt;
    D.x += wX * sp; D.y += wY * sp;
    D.z += wX * sp * 1.6; D.w += wY * sp * 1.6;
    u.uScudDrift.value.x += wX * sp * 9 * (1 + storm);
    u.uScudDrift.value.y += wY * sp * 9 * (1 + storm);
    // the moon waxes and wanes (full every eighth day)
    const ph = env.moonPhase ?? 0;
    const moonLit = 0.5 + 0.5 * Math.cos(ph * Math.PI * 2);
    // cloud colours: sunlit white tops and blue-lavender shade by day; at
    // sunset orange-pink over purple; by night dark navy, a little moonlit;
    // greyer and darker as the weather closes in
    let lit = lerp3([1, 1, 1], [this.sunCol.r, this.sunCol.g, this.sunCol.b], 0.3);
    lit = lerp3(lit, [1.0, 0.6, 0.44], dusk * 0.8);
    let shade = lerp3(hor, top, 0.45).map((v) => v * 0.7 + 0.07);
    shade = lerp3(shade, [0.36, 0.27, 0.44], dusk * 0.55);
    shade = lerp3(shade, [0.42, 0.44, 0.5], ov * 0.6);
    const litW = lerp3(lit, [0.62, 0.64, 0.68], ov * 0.75);
    const moonC = [0.075, 0.085, 0.13].map((v) => v * (0.55 + 0.45 * moonLit));
    u.uCLit.value.setRGB(...oddTint(lerp3(mul3(litW, 0.93 * (1 - storm * 0.4)), moonC, nl), tint, odd * 0.8));
    u.uCMid.value.setRGB(...oddTint(lerp3(mul3(lerp3(litW, shade, 0.45), 1 - storm * 0.3), mul3(moonC, 0.72), nl), tint, odd));
    u.uCShade.value.setRGB(...oddTint(lerp3(mul3(shade, 1 - storm * 0.35), [0.022, 0.026, 0.045], nl), tint, odd));
    // the deck: soft grey in the rain, slate in a storm (anime storm clouds: #37474f, their undersides #263238)
    const deckK = dayK * (dusk > 0.2 ? 1 - dusk * 0.25 : 1);
    // (by night a dark navy, faintly lit)
    u.uDeckLo.value.setRGB(...oddTint(lerp3(mul3(lerp3([0.2, 0.22, 0.26], [0.021, 0.027, 0.039], storm), deckK), [0.009, 0.011, 0.022], nl), tint, odd));
    u.uDeckHi.value.setRGB(...oddTint(lerp3(mul3(lerp3([0.42, 0.45, 0.5], [0.12, 0.14, 0.17], storm), deckK), [0.03, 0.036, 0.062], nl), tint, odd));
    // lightning: toward the bolt, white-violet
    const S = env.strike, fresh = S && env.time - S.t < 1.5;
    const fl = wx ? env.lightning || 0 : 0;
    if (fresh) {
      const el = 0.18 + 0.35 * Math.max(0, 1 - S.dist / 2500);
      u.uFlash.value.set(Math.cos(S.angle), el, Math.sin(S.angle), fl);
      const L = Math.hypot(u.uFlash.value.x, el, u.uFlash.value.z);
      u.uFlash.value.x /= L; u.uFlash.value.y /= L; u.uFlash.value.z /= L;
    } else u.uFlash.value.set(0, 1, 0, fl * 0.6);
    // the stars turn round the pole with the night
    u.uStarRot.value.setFromMatrix4(_m4.makeRotationAxis(POLE, (c / 24) * Math.PI * 2));
    u.uMoonPhase.value = ph;
    u.uMoonLight.value = moonLit;
    this.horizon.setRGB(...hor);
    this.top.setRGB(...top);

    // lighting: the sun by day, a cool moon by night (the light itself is
    // placed with its shadow map, round you: see shadowAt). The sun fades
    // out over its last few degrees down to the horizon, warming as it goes,
    // and the moon's light comes up only as the sky darkens after it (and
    // goes before the dawn): the one light changes over from the one to the
    // other while it's dark, so the shadows never swing round at a stroke.
    // Under cloud the sun dims and its shadows soften away; the sky's light
    // (the hemisphere) takes over, so it's grey, not black.
    const amb = env.ambient || [1, 1, 1];
    const sunUp = this.sunDir.y > 0;
    const low = 1 - sm(0.02, 0.4, this.sunDir.y); // 1 at the horizon, 0 well up
    const warm = Math.max(dusk, low * 0.9) * (1 - ov * 0.8);
    this.lightDir.copy(sunUp ? this.sunDir : moon);
    // (never lower than about 14 degrees: a sun right down on the horizon
    // throws shadows dozens of metres long, streaked across a whole island at
    // dusk; long and soft is the evening's look, not a field of black stripes)
    if (this.lightDir.y < MIN_LIGHT_Y) {
      const h = Math.hypot(this.lightDir.x, this.lightDir.z) || 1, k = Math.sqrt(1 - MIN_LIGHT_Y * MIN_LIGHT_Y) / h;
      this.lightDir.set(this.lightDir.x * k, MIN_LIGHT_Y, this.lightDir.z * k);
    }
    const weatherK = (1 - ov * 0.72) * (1 - storm * 0.2) * (1 - dust * 0.35);
    this.sun.intensity = (sunUp ? 2.4 * Math.min(1, day + 0.15) * sm(0, 0.1, this.sunDir.y) : 0.5 * sm(0, 0.15, -this.sunDir.y) * sm(0, 0.1, moon.y) * (0.6 + 0.4 * moonLit))
      * weatherK * (zone === 3 ? 0.25 : zone === 2 ? 0.35 + 0.5 * ib : zone === 1 ? 0.7 : 1);
    // (and the low sun's shadows grow fainter as it goes down)
    this.sun.shadow.intensity = (1 - sm(0.3, 0.9, ov) * 0.85) * (sunUp ? 1 - 0.5 * low : 0.75);
    if (sunUp) this.sun.color.setRGB(1, 0.95 - warm * 0.24, 0.88 - warm * 0.42);
    else this.sun.color.setRGB(0.6, 0.7, 1);
    if (dust) this.sun.color.lerp(_haze.setRGB(1, 0.75, 0.5), dust * 0.4);
    this.hemi.color.setRGB(amb[0] * 0.8, amb[1] * 0.85, amb[2] * 0.95);
    this.hemi.groundColor.setRGB(amb[0] * 0.45, amb[1] * 0.4, amb[2] * 0.35);
    // (up on the sky islands the cloud underfoot throws so much light back that it's toned down, or it all glares white)
    this.hemi.intensity = 1.0 + ov * 0.35 * day + (zone === 3 ? -0.3 : zone === 1 ? -0.22 : 0);
    // the picture's grading: flatter and cooler under cloud, richer in the heat
    this.grade.sat = 1 - ov * 0.14 - storm * 0.08 + heat * 0.06 - dust * 0.05;
    this.grade.contrast = 1 - ov * 0.05 + storm * 0.04;

    // Fog (see fog.js): a thin sea haze on a clear day that thickens in storms,
    // snow and fog banks. On a clear day it closes in over the last 40% of the
    // render distance (maxFar, set from the terrain's reach, which is the
    // Settings one), complete right at its edge, so nothing is seen to pop in
    // or out; thick weather draws it in nearer still.
    let far = this.maxFar || (sailing ? 900 : 620);
    const rain = wx ? env.rain || 0 : 0, snow = wx ? env.snow || 0 : 0;
    far *= (1 - (env.fog || 0) * 0.72) * (1 - storm * 0.35) * (1 - rain * 0.15) * (1 - snow * 0.3) * (1 - dust * 0.45);
    // (inside Fish-Man Island's bubble the air's clear right across it; out
    // in the deep, its dark lies over the island seen through the bubble)
    if (zone === 2) far = 420 + 220 * ib;
    if (zone === 3) far = 95;
    far = Math.max(60, Math.min(far, this.maxFar || far));
    this.fog.far = far;
    this.fog.near = far * 0.6;
    this.fog.color.copy(this.horizon);
    // (inside the bubble, the haze is the deep's colour through its skin, low down)
    if (zone === 2) this.fog.color.lerp(_haze.setRGB(...BUBBLE_HAZE.map((v) => v * (0.22 + 0.78 * day))), ib);
    let dens = 0.0011 + storm * 0.004 + (env.fog || 0) * 0.013 + (snow ? 0.0025 : 0) + night * 0.0004 + rain * 0.0016 + dust * 0.004 + heat * 0.0003;
    if (sailing) dens *= 0.8;
    if (zone === 2) dens = 0.0012 + 0.0018 * (1 - ib);
    else if (zone === 3) dens = 0.02;
    else if (zone === 1) dens = 0.0014;
    FOG.fogDensity2.value = dens;
    FOG.fogHeightK.value = zone === 1 ? 0.012 : 0.028;
    FOG.fogBase.value = zone === 1 ? -25 : 0; // the sky islands' haze lies on the cloud sea below
    // (the haze glows round the sun till it's well down, fading as it goes;
    // then, faded in from nothing, round the moon)
    const sunHaze = this.sunDir.y > -0.15;
    FOG.fogSunDir.value.copy(sunHaze ? this.sunDir : moon);
    const glow = (sunHaze ? sm(-0.15, 0, this.sunDir.y) : 0.25 * sm(-0.15, -0.3, this.sunDir.y)) * (1 - ov * 0.8) * (zone >= 2 ? 0.3 : 1);
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
