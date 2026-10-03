// The weather's mists, in the world (never laid over the screen): sand blown
// on the desert wind, snow blowing in a whiteout, the grey murk of heavy rain,
// spray torn off the crests in a storm at sea. Two parts:
//  * a low layer in the fog (fog.js fogMist): lying on the low ground round
//    you (the snowfields, the valley floor, the sea) and thinning as it climbs
//    — up the Drum Rockies' cliffs, a plateau standing up out of it — tinted
//    the mist's own colour and broken into banks that drift with the wind;
//  * soft cards of mist drifting along the ground round you (a few dozen,
//    one draw call): streaky for sand, round puffs for snow, tall veils for
//    rain, low and quick over the water for spray.
// Both come and go with the weather (game/env.js mistDust, mistSnow,
// mistRain; the storm and the wind for spray), each blending into the next.
// Indoors, under the sea and below decks there's none. 'low' quality: fewer
// cards and an unbroken layer.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { FOG } from './fog.js';
import { skyNoise } from './skynoise.js';

const MAX = 40; // cards
const BOX = 150; // m: they live within half of this round you
const PERIOD = 96; // m: the fog's mist noise repeats this often (fog.js)

// the kinds: colour (lit), shade, the layer's thickness at the ground (/m)
// and how fast it thins with height (/m), the cards' size (w, h), their
// height off the ground, how fast they ride the wind, streakiness
const KIND = {
  dust: { lit: [0.86, 0.68, 0.46], shade: [0.6, 0.43, 0.27], dens: 0.04, k: 0.03, w: 15, h: 7, lift: -0.5, speed: 1, streak: 1, alpha: 1 },
  snow: { lit: [0.94, 0.96, 1.0], shade: [0.7, 0.75, 0.84], dens: 0.034, k: 0.045, w: 13, h: 9, lift: -0.5, speed: 0.75, streak: 0.25, alpha: 0.85 },
  rain: { lit: [0.62, 0.66, 0.7], shade: [0.42, 0.46, 0.5], dens: 0.012, k: 0.045, w: 22, h: 14, lift: -1, speed: 0.4, streak: 0.1, alpha: 0.4 },
  spray: { lit: [0.9, 0.94, 0.96], shade: [0.62, 0.7, 0.74], dens: 0.02, k: 0.35, w: 9, h: 3.5, lift: -0.3, speed: 1.3, streak: 0.4, alpha: 0.65 },
};
const KEYS = Object.keys(KIND);
const _white = new THREE.Color(1, 1, 1);

const VS = /* glsl */`
  attribute vec4 aCard; // how faded in, stretch along the wind, size jitter, seed
  uniform vec2 uWind;   // the wind (m/s, x z)
  uniform float uTime, uBox;
  varying vec2 vUv;
  varying vec2 vN;
  varying float vA;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; // its foot
    float w = length(instanceMatrix[0].xyz), h = length(instanceMatrix[1].xyz);
    // turned to face the camera round the upright
    vec3 toCam = cameraPosition - p;
    vec2 tc = normalize(toCam.xz + 1e-4);
    vec3 right = vec3(tc.y, 0.0, -tc.x);
    vec3 q = p + right * position.x * w + vec3(0.0, position.y * h, 0.0);
    vUv = position.xy; // x -1..1 across, y 0..1 up
    float dist = length(toCam + vec3(0.0, -h * 0.4, 0.0));
    // faded near the eye (never a hard card across the view) and far off (the fog has it there)
    vA = aCard.x * smoothstep(w * 0.3, w * 0.8 + 4.0, dist) * (1.0 - smoothstep(uBox * 0.36, uBox * 0.5, dist));
    // the noise slides along the card the way the wind blows across it, billowing
    float along = dot(right.xz, uWind);
    vN = vec2((position.x * w - along * uTime) / aCard.y, position.y * h - uTime * 0.25) * 0.035 + aCard.w * 0.37;
    vec4 mvPosition = viewMatrix * vec4(q, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FS = /* glsl */`
  uniform sampler2D uNoise;
  uniform vec3 uLit, uShade;
  uniform float uStreak, uAlpha;
  varying vec2 vUv;
  varying vec2 vN;
  varying float vA;
  #include <fog_pars_fragment>
  void main() {
    // a soft bank: round at the ends, fading into the ground at its foot
    float r = length(vec2(vUv.x, (vUv.y - 0.42) * 1.7));
    float shape = smoothstep(1.0, 0.0, r);
    shape *= shape * smoothstep(0.0, 0.35, vUv.y);
    vec4 n = texture2D(uNoise, vN);
    // soft billows (snow, rain), long streaks along the wind (sand)
    float b = mix(n.r * 0.6 + n.b * 0.4, n.g, uStreak);
    float a = smoothstep(0.3, 0.9, b * (0.5 + 0.7 * shape)) * shape * vA * uAlpha;
    if (a < 0.004) discard;
    vec3 c = mix(uShade, uLit, smoothstep(0.25, 0.9, vUv.y * 0.6 + b * 0.6));
    gl_FragColor = vec4(c, a);
    #include <fog_fragment>
  }
`;

class Mist {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.card = new Float32Array(MAX * 4);
    this.cardAttr = new THREE.InstancedBufferAttribute(this.card, 4);
    this.cardAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aCard', this.cardAttr);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uNoise: { value: skyNoise() }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() },
      uStreak: { value: 0 }, uAlpha: { value: 0 }, uWind: { value: new THREE.Vector2() }, uTime: { value: 0 }, uBox: { value: BOX },
    }]);
    this.uniforms.uNoise.value = skyNoise();
    FOG.fogNoise.value = skyNoise(); // (the fog's mist layer is broken up with it too)
    const m = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(g, m, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.cards = Array.from({ length: MAX }, () => ({ x: 0, y: 0, age: 0, life: 0, w: 1, h: 1, seed: Math.random(), live: false }));
    this.m4 = new THREE.Matrix4();
    this.amount = 0; // (eased: the mist comes and goes; inside, it fades away)
    this.base = 0;
    this.floorWant = null;
    this.floorT = 0;
    this.drift = new THREE.Vector2();
    this.mix = { lit: [0, 0, 0], shade: [0, 0, 0], dens: 0, k: 0, w: 0, h: 0, lift: 0, speed: 0, streak: 0, alpha: 0 };
    this.low = false;
  }

  /** Shown for the shaders' warm-up (Renderer3D.warmUp), then put back. */
  warm(on) {
    if (on) { this.was = this.mesh.visible; this.mesh.visible = true; } else this.mesh.visible = !!this.was;
  }

  /** The mists' blend of kinds now: weights by kind, into this.mix; the strongest. */
  blend(wts) {
    let tot = 0;
    for (const k of KEYS) tot += wts[k];
    // (none now: keep the last blend while what's left of it fades away)
    if (tot <= 0) return 0;
    const M = this.mix;
    M.dens = M.k = M.w = M.h = M.lift = M.speed = M.streak = M.alpha = 0;
    M.lit[0] = M.lit[1] = M.lit[2] = M.shade[0] = M.shade[1] = M.shade[2] = 0;
    for (const k of KEYS) {
      const f = wts[k] / tot, K = KIND[k];
      if (!f) continue;
      for (let i = 0; i < 3; i++) { M.lit[i] += K.lit[i] * f; M.shade[i] += K.shade[i] * f; }
      M.dens += K.dens * f; M.k += K.k * f; M.w += K.w * f; M.h += K.h * f; M.lift += K.lift * f; M.speed += K.speed * f; M.streak += K.streak * f; M.alpha += K.alpha * f;
    }
    return Math.max(wts.dust, wts.snow, wts.rain, wts.spray);
  }

  update(env, ctx, dt) {
    const game = ctx.game, v = game?.view3d, w = ctx.world;
    if (!v || !w) return;
    const p = game.player;
    // (none indoors, under the sea, below decks, above the clouds or underground)
    const lv = p?.deck?.lvl;
    const inside = !!v.isUnder || lv === 'cabin' || lv === 'captain' || lv === 'forecastle' || lv === 'hold' || !!(p && w.interiorAt?.(p.x, p.y)) || w.zone !== 0;
    const cam = ctx.camera;
    const wx = v.ox + cam.position.x, wy = v.oy + cam.position.z;
    const atSea = p?.mode === 'sail' || !!p?.inWater || (w.isLiquid?.(w.wx(wx), wy) && !w.isOverlay?.(w.wx(wx), wy));
    const storm = env.storm || 0;
    const wts = this.wts || (this.wts = { dust: 0, snow: 0, rain: 0, spray: 0 });
    wts.dust = env.mistDust || 0;
    wts.snow = env.mistSnow || 0;
    wts.rain = env.mistRain || 0;
    wts.spray = atSea ? Math.max(0, storm - 0.45) * 1.6 * Math.min(1, env.windStrength || 0) : 0;
    const top = this.blend(wts), want = inside ? 0 : top;
    this.amount += (want - this.amount) * Math.min(1, dt * (inside ? 4 : 0.6));
    // (the weather set outright: the mist with it)
    if (env.snapT !== undefined && env.snapT !== this.snapSeen) { this.snapSeen = env.snapT; this.amount = want; }
    const a = this.amount, M = this.mix;
    // ---- the layer in the fog
    const ambK = Math.min(1.2, ((env.ambient?.[0] ?? 1) + (env.ambient?.[1] ?? 1) + (env.ambient?.[2] ?? 1)) / 3);
    const light = 0.18 + 0.82 * Math.min(1, ambK);
    // (its colour half its own, half the air's: the fog's, which is the sky's at the horizon)
    const fc = v.sky?.fog?.color || _white;
    const F = FOG;
    if (a < 0.01 || v.isUnder) {
      F.fogMist.value.w = 0;
    } else {
      // (the layer's floor: the low ground round you — the snowfields, the
      // valley floor, the sea — so it lies there and climbs the cliffs from
      // there, and a plateau stands up out of it; looked for a few times a
      // second, eased as you go)
      if ((this.floorT -= dt) <= 0 || this.floorWant === null) {
        this.floorT = 0.4;
        let lo = atSea ? 0 : Math.max(0, ctx.ground(w.wx(wx), wy));
        for (let i = 0; i < 16 && lo > 0; i++) {
          const r = i < 8 ? 30 : 70, t = (i % 8) * Math.PI / 4 + (i < 8 ? 0 : Math.PI / 8);
          lo = Math.min(lo, Math.max(0, ctx.ground(w.wx(wx + Math.cos(t) * r), wy + Math.sin(t) * r)));
        }
        const snap = this.floorWant === null;
        this.floorWant = lo;
        if (snap) this.base = lo;
      }
      this.base += (this.floorWant - this.base) * Math.min(1, dt * 1.2);
      F.fogMist.value.set(M.dens * Math.min(1.2, a), M.k, this.low ? 0 : 0.85, Math.min(1, a * 1.4));
      F.fogMistBase.value = this.base;
      F.fogMistCol.value.setRGB(fc.r * 0.4 + (M.lit[0] * 0.55 + M.shade[0] * 0.45) * light * 0.6, fc.g * 0.4 + (M.lit[1] * 0.55 + M.shade[1] * 0.45) * light * 0.6, fc.b * 0.4 + (M.lit[2] * 0.55 + M.shade[2] * 0.45) * light * 0.6);
      // (it drifts with the wind; the noise is anchored in the world, wrapped so it never loses precision)
      const d = this.drift;
      d.x = (d.x - (env.windX || 0) * M.speed * 6 * dt / PERIOD) % 1;
      d.y = (d.y - (env.windY || 0) * M.speed * 6 * dt / PERIOD) % 1;
      F.fogMistO.value.set(((v.ox % PERIOD) + PERIOD) % PERIOD, ((v.oy % PERIOD) + PERIOD) % PERIOD, d.x, d.y);
    }
    // ---- the cards
    const n = a < 0.02 ? 0 : Math.min(MAX, Math.round(MAX * Math.min(1, a * 1.3) * (this.low ? 0.4 : 1)));
    this.mesh.visible = n > 0;
    if (!n) { for (const c of this.cards) c.live = false; this.mesh.count = 0; return; }
    const u = this.uniforms;
    u.uLit.value.setRGB(fc.r * 0.45 + M.lit[0] * light * 0.55, fc.g * 0.45 + M.lit[1] * light * 0.55, fc.b * 0.45 + M.lit[2] * light * 0.55);
    u.uShade.value.setRGB(fc.r * 0.4 + M.shade[0] * light * 0.5, fc.g * 0.4 + M.shade[1] * light * 0.5, fc.b * 0.4 + M.shade[2] * light * 0.5);
    u.uStreak.value = M.streak;
    u.uAlpha.value = Math.min(0.85, 0.35 + a * 0.5) * M.alpha;
    const windV = 3 + 9 * Math.min(1.4, env.windStrength || 0) * M.speed; // m/s the cards ride the wind
    const wdx = Math.cos(env.windAngle || 0), wdy = Math.sin(env.windAngle || 0);
    u.uWind.value.set(wdx * windV, wdy * windV);
    u.uTime.value = env.time;
    const half = BOX / 2;
    let k = 0;
    for (let i = 0; i < MAX; i++) {
      const c = this.cards[i];
      if (i >= n) { c.live = false; continue; }
      c.age += dt;
      c.x += wdx * windV * dt * (0.8 + c.seed * 0.4);
      c.y += wdy * windV * dt * (0.8 + c.seed * 0.4);
      const dx = w.dx(wx, c.x), dy = c.y - wy;
      if (!c.live || c.age > c.life || Math.abs(dx) > half || Math.abs(dy) > half) {
        // a new one somewhere round you (more of them upwind, so they drift past)
        const r = 10 + Math.random() * (half - 12), t = Math.random() * Math.PI * 2;
        c.x = w.wx(wx + Math.cos(t) * r - wdx * half * 0.3 * Math.random());
        c.y = wy + Math.sin(t) * r - wdy * half * 0.3 * Math.random();
        c.age = 0; c.life = 5 + Math.random() * 7; c.live = true; c.seed = Math.random();
        c.w = M.w * (0.7 + Math.random() * 0.6); c.h = M.h * (0.75 + Math.random() * 0.5);
        c.sea = wts.spray > Math.max(wts.dust, wts.snow, wts.rain);
      }
      // spray only over the water; the rest on the ground (or the sea, in the rain)
      const water = w.isLiquid?.(w.wx(c.x), c.y);
      if (c.sea && !water) { c.age = c.life + 1; continue; }
      const gy = water ? 0 : Math.max(0, ctx.ground(w.wx(c.x), c.y));
      const fade = Math.min(1, c.age / 1.6) * Math.min(1, (c.life - c.age) / 1.6);
      this.m4.makeScale(c.w, c.h, 1).setPosition(w.dx(v.ox, c.x), gy + M.lift, c.y - v.oy);
      this.mesh.setMatrixAt(k, this.m4);
      this.card[k * 4] = Math.max(0, fade);
      this.card[k * 4 + 1] = 1 + M.streak * 3;
      this.card[k * 4 + 2] = 1;
      this.card[k * 4 + 3] = c.seed;
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cardAttr.needsUpdate = true;
  }
}

let mist = null;
registerFrameHook((env, ctx, dt) => {
  if (!mist) { mist = new Mist(ctx.scene); if (ctx.game?.view3d) ctx.game.view3d.mist = mist; }
  mist.low = ctx.game?.view3d?.quality === 'low';
  mist.update(env, ctx, dt || 1 / 60);
}, 'mist');
