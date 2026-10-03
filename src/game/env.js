// Time of day, moon, wind and weather. The weather is the place's: each sea
// and each charted island has its own climate (weather.js: the Blues are
// gentle, the Grand Line changes its mind every minute or so, the Calm Belt
// has no wind at all, winter islands snow and desert ones blow with dust),
// and every field eases toward what the weather there wants, so it comes and
// goes smoothly — the clouds first, then the rain; the rain stops, then the
// sky clears — and sailing from one sea (or island) into the next changes it
// over as you go.
import { regionAt, REGION, isGrandLine, isCalmBelt, EQ, RM_X } from '../world/constants.js';
import { clamp, lerp, smoothstep, TAU, angleDiff } from '../core/math.js';
import { RM, canalAt, canalLevel, nearRM } from '../world/reverseMountain.js';
import { T } from '../world/tiles.js';
import { KINDS, CLIMATES, LABELS, placeAt, rollWeather, weatherTargets, allowed } from './weather.js';

export const DAY_SECONDS = 960; // one in-game day = 16 real minutes

// how long each field takes to follow the weather (s, to get most of the way)
const TAU_CLOUD = 14, TAU_CLEAR = 22, TAU_PRECIP = 5, TAU_STORM = 9, TAU_FOG = 5, TAU_SLOW = 12, TAU_FRONT = 7;
const ease = (v, to, dt, tau) => v + (to - v) * (1 - Math.exp(-dt / tau));
// (climates whose weather is much the same: crossing between them keeps it)
const MILD = new Set(['east_blue', 'north_blue', 'west_blue', 'south_blue', 'red_line', 'temperate', 'spring', 'autumn', 'candy']);
// the light's colour by night, by day and at dusk
const NIGHT = [0.21, 0.25, 0.46]; // moonlit blue, dark enough for lamplight to matter
const DAY = [1, 1, 1];
const DUSK = [1.0, 0.72, 0.55];
const FLASH = [0.92, 0.96, 1.1]; // a lightning flash: a cold white
const DUSTY = [1.06, 0.9, 0.7]; // the light through blowing sand

export class Env {
  constructor() {
    this.time = 0;
    this.clock = 8.5; // hours
    this.day = 1;
    this.windAngle = 0.4;
    this.windStrength = 1;
    this.windTarget = 0.4;
    this.storm = 0;
    this.stormTarget = 0;
    this.rain = 0;
    this.snow = 0;
    this.fog = 0;
    this.lightning = 0;
    this.weatherTimer = 30;
    this.daylight = 1;
    this.ambient = [1, 1, 1];
    this.mapMode = false;
    this.revealAll = false;
    this.windX = 0.7; this.windY = 0.3;
    this.region = REGION.EAST_BLUE;
    this.forecast = 'Fair';
    // ---- the weather (weather.js): its kind, how hard it comes, and where
    this.weather = 'fair';
    this.weatherK = 0.7;
    this.climate = 'east_blue';
    this.placeKey = null;
    this.placeWorld = undefined;
    this.placeT = 0;
    this.island = null; // (the charted island whose air you're in)
    this.cold = false; // (rain falls as snow)
    this.wt = weatherTargets('fair', 0.7, 'east_blue', {});
    // ---- what it does, each easing toward the weather's wants
    this.cloud = this.wt.cloud; // cloud cover, 0 clear … 1 overcast
    this.dust = 0; // windborne sand
    this.heat = 0; // hot, clear, shimmering air
    this.ash = 0; // volcanic ash falling
    this.calm = 0; // the Calm Belt's glassy stillness
    this.odd = 0; // a strangely coloured sky (the New World)…
    this.tint = [1, 1, 1]; // …in this colour
    this.aurora = 0;
    this.front = 0; // a storm's towering cloud on the horizon (it shows before the storm arrives)…
    this.frontAngle = this.windAngle + Math.PI; // …this way (radians, world x/y: it comes up from upwind)
    this.thunder = 0; // lightning without a storm (dry lightning under the New World's violet sky)
    this.windK = 1;
    // the mists the weather raises (drawn in the world: render3d/mist3d.js)
    this.mistDust = 0; this.mistSnow = 0; this.mistRain = 0; this.mist = 0;
    // ---- lightning: the last bolt (for the sky, the fork and the thunder)
    this.strike = { t: -1e9, angle: 0, dist: 1000, ground: false, seed: 0, k: 0 };
    this.pulses = []; // time, strength of each of its strokes
    this.flashT = 4;
    this.flashExt = 0;
    this.lightOut = 0;
    this.stormOut = 0;
  }

  get moonPhase() { return ((this.day % 8) / 8); }
  get fullMoon() { return this.day % 8 === 0; }
  get isNight() { return this.daylight < 0.35; }

  update(dt, game) {
    this.time += dt;
    this.clock += dt * 24 / DAY_SECONDS;
    if (this.clock >= 24) { this.clock -= 24; this.day++; game.onNewDay?.(this.day); }
    // daylight curve: sunrise 5-7, sunset 18-20
    const c = this.clock;
    const rise = smoothstep(5, 7, c), set = 1 - smoothstep(18, 20, c);
    this.daylight = Math.min(rise, set);

    // ---- where you are, and so whose weather
    const p = game.focus();
    const w = game.world;
    if ((this.placeT -= dt) <= 0 || w !== this.placeWorld) {
      this.placeT = 0.5;
      this.placeWorld = w;
      const pl = placeAt(w, p.x, p.y, this.placeKey);
      this.island = pl.island ? pl.island.id : null;
      this.cold = !!CLIMATES[pl.climate]?.cold || !!(w && w.zone === 0 && w.climate?.(p.x, p.y) === 3);
      if (pl.key !== this.placeKey) this.enterPlace(pl, game);
    }
    const reg = w && w.zone === 0 ? regionAt(p.x, p.y) : REGION.EAST_BLUE;
    this.region = reg;
    const gl = isGrandLine(reg);
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) this.roll(game, true);
    if (isCalmBelt(reg)) this.stormTarget = 0;

    // ---- every field toward the weather's wants, raised by whatever wants a
    // storm here (an island's own, the story's)
    const W = this.wt, st = this.stormTarget;
    // (code that sets env.storm outright gets its clouds and its rain at once)
    const jumped = this.storm > this.stormOut + 0.02;
    this.storm = ease(this.storm, st, dt, TAU_STORM);
    // (a storm beyond this weather's own brings its clouds: a sandstorm's is sand)
    const stormy = Math.max(st, this.storm), own = W.storm + 0.02;
    const cloudT = Math.max(W.cloud, stormy > own ? Math.min(1, stormy * 1.6) : 0);
    // (never thinner than such a storm: code that sets env.storm outright gets its clouds at once)
    this.cloud = Math.max(ease(this.cloud, cloudT, dt, cloudT > this.cloud ? TAU_CLOUD : TAU_CLEAR), this.storm > own ? Math.min(1, this.storm * 1.1) : 0);
    // rain and snow wait for the clouds (a sun-shower doesn't), and stop before they clear
    const gate = W.gate ? smoothstep(0.55, 0.85, this.cloud) : 1;
    // (a storm raised past this weather's own — an island's, a story's — rains
    // too; dry lightning and a sandstorm don't; over the desert, a few drops)
    const dry = CLIMATES[this.climate]?.dry ? 0.15 : 1;
    const ext = st > W.storm + 0.02 && st > 0.2 ? st : 0;
    const precip = Math.max(W.rain + W.snow, ext) * gate * dry;
    const asSnow = this.cold || (W.snow > 0 && !W.rain);
    this.rain = ease(this.rain, asSnow ? 0 : precip, dt, TAU_PRECIP);
    this.snow = ease(this.snow, asSnow ? precip : 0, dt, TAU_PRECIP);
    if (jumped && this.storm > 0.2) {
      const now = this.storm * gate * dry;
      if (asSnow) this.snow = Math.max(this.snow, now); else this.rain = Math.max(this.rain, now);
    }
    if (this.rain < 0.003) this.rain = 0;
    if (this.snow < 0.003) this.snow = 0;
    this.dust = ease(this.dust, W.dust, dt, TAU_SLOW);
    this.heat = ease(this.heat, W.heat * (1 - this.cloud), dt, TAU_SLOW);
    this.ash = ease(this.ash, W.ash, dt, TAU_SLOW);
    this.calm = ease(this.calm, isCalmBelt(reg) ? 1 : W.calm, dt, 6);
    this.odd = ease(this.odd, W.odd, dt, TAU_SLOW);
    for (let i = 0; i < 3; i++) this.tint[i] = ease(this.tint[i], W.tint[i], dt, TAU_SLOW);
    this.aurora = ease(this.aurora, W.aurora, dt, TAU_SLOW);
    this.thunder = ease(this.thunder, W.thunder, dt, TAU_SLOW);
    this.front = ease(this.front, Math.max(W.storm > 0.35 ? W.storm : 0, W.thunder, st > 0.5 ? st : 0), dt, TAU_FRONT);
    const fogRegion = game.inFogRegion ? game.inFogRegion(p.x, p.y) : 0;
    this.fog = ease(this.fog, Math.max(fogRegion, W.fog), dt, TAU_FOG);
    if (this.fog < 0.002) this.fog = 0;

    // ---- wind
    this.windAngle += clamp(angleDiff(this.windAngle, this.windTarget), -0.2, 0.2) * dt * (gl ? 0.5 : 0.15);
    const gust = gl ? 0.85 + Math.sin(this.time * 0.7) * 0.15 : 1;
    this.stormOut = this.storm;
    this.windK = ease(this.windK, W.wind, dt, 8);
    this.windStrength = isCalmBelt(reg) ? 0 : clamp((0.8 + this.storm * 0.5) * gust * this.windK, 0.2, 1.4);
    this.windX = Math.cos(this.windAngle) * this.windStrength;
    this.windY = Math.sin(this.windAngle) * this.windStrength;

    // the mists the weather raises: dust on the desert wind, snow blowing in a
    // whiteout, the murk and spray of heavy rain
    this.mistDust = this.dust * clamp(0.35 + this.windStrength * 0.55, 0, 1.1);
    this.mistSnow = this.snow * clamp(0.3 + this.storm * 0.9 + this.snow * 0.25, 0, 1);
    this.mistRain = smoothstep(0.45, 0.95, this.rain) * (0.45 + this.storm * 0.55);
    this.mist = Math.max(this.mistDust, this.mistSnow, this.mistRain);

    // ---- lightning: in a thunderstorm (and under the New World's violet sky),
    // now and then a bolt — mostly flashes inside the clouds, sometimes a fork
    // down to the sea — each a few strokes flickering in quick succession; a
    // storm on its way flickers far off in its tower before it arrives
    const coming = Math.max(0, this.front - this.storm);
    const th = Math.max(this.thunder, smoothstep(0.55, 0.9, this.storm), coming * 0.6);
    if (th > 0.05 && (this.flashT -= dt) <= 0) {
      this.flashT = lerp(16, 4.5, th) * (0.4 + Math.random() * 1.2) * (reg === REGION.NEW_WORLD ? 0.7 : 1);
      const far = coming > 0.25 && this.storm < 0.55;
      this.bolt(game, far ? { angle: this.frontAngle + (Math.random() - 0.5) * 0.6, dist: 1500 + Math.random() * 1100, ground: Math.random() < 0.3 } : { ground: Math.random() < 0.25 + th * 0.2 });
    }
    // (other code raises env.lightning for a flash of its own: that fades as it always has)
    if (this.lightning > this.lightOut + 1e-6) this.flashExt = this.lightning;
    this.flashExt = Math.max(0, this.flashExt - dt * 4);
    let f = 0;
    for (let i = this.pulses.length - 2; i >= 0; i -= 2) {
      const age = this.time - this.pulses[i];
      if (age > 0.6) { this.pulses.splice(i, 2); continue; }
      if (age >= 0) f = Math.max(f, this.pulses[i + 1] * Math.exp(-age / 0.055));
    }
    this.lightning = this.lightOut = Math.max(this.flashExt, f);

    // ---- the light: day, dusk and night, darkened by the weather
    const duskAmt = clamp(Math.max(1 - Math.abs(c - 19) / 1.5, 1 - Math.abs(c - 6) / 1.5, 0) * 0.8, 0, 1) * (this.daylight > 0.05 ? 1 : 0.4);
    const dark = Math.min(0.55, this.storm * 0.3 + this.cloud * 0.1 + this.fog * 0.15 + this.dust * 0.12 + this.ash * 0.18);
    const amb = this.ambient;
    for (let i = 0; i < 3; i++) {
      let v = lerp(lerp(NIGHT[i], DAY[i], this.daylight), DUSK[i], duskAmt) * (1 - dark);
      // (an odd sky's colour on everything; a sandstorm's ochre)
      if (this.odd > 0.01) v *= lerp(1, 0.45 + 0.55 * this.tint[i], this.odd * 0.6);
      if (this.dust > 0.01) v *= lerp(1, DUSTY[i], this.dust * 0.45);
      if (this.lightning > 0) v = Math.min(1.6, v + this.lightning * 1.2 * FLASH[i]);
      amb[i] = w && w.zone === 2 ? v * 0.8 : v;
    }
  }

  /** Into a new place: its climate's weather (a mild one keeps the weather it shares with the last). */
  enterPlace(pl, game) {
    const first = this.placeKey === null, was = this.climate;
    this.placeKey = pl.key;
    this.climate = pl.climate;
    // (a pinned weather stays — a test's, or a guest's, which is the host's —
    // though rain still falls as snow where it's cold)
    const keep = this.weatherTimer > 1e8 || (allowed(pl.climate, this.weather) && (first || pl.climate === was || (MILD.has(was) && MILD.has(pl.climate))));
    if (keep) { weatherTargets(this.weather, this.weatherK, this.climate, this.wt); return; }
    this.roll(game, false);
  }

  /** The next weather here. (The Grand Line plays its own tricks now and then, on its turns.) */
  roll(game, turn) {
    const r = rollWeather(this.climate, Math.random, this.weather);
    this.setKind(r.kind, r.k);
    this.weatherTimer = r.dur;
    if (!turn) return;
    const gl = isGrandLine(this.region);
    this.windTarget = gl ? Math.random() * TAU : this.windTarget + (Math.random() - 0.5) * 1.2;
    if (gl && Math.random() < 0.25 && game?.onGrandLineWeather) game.onGrandLineWeather();
  }

  setKind(kind, k = 1) {
    this.weather = KINDS[kind] ? kind : 'clear';
    this.weatherK = k;
    weatherTargets(this.weather, k, this.climate, this.wt);
    this.stormTarget = this.wt.storm;
    this.forecast = LABELS[this.weather];
    // (a storm comes up from upwind)
    if (this.wt.storm > 0.35 || this.wt.thunder) this.frontAngle = this.windAngle + Math.PI + (Math.random() - 0.5) * 0.9;
  }

  /**
   * Set the weather (creative mode, the story, the tests): kind (weather.js
   * KINDS), { k: how hard, now: there at once, hold: and kept till set again,
   * dur: or for this long, sync: a guest taking the host's }.
   */
  setWeather(kind, { k = 1, now = false, hold = false, dur = 0, sync = false } = {}) {
    if (!KINDS[kind]) return false;
    this.setKind(kind, k);
    if (hold || sync) this.weatherTimer = 1e9;
    else if (dur) this.weatherTimer = dur;
    if (now) {
      this.snapT = this.time; // (for what eases on its own: the mists)
      const W = this.wt;
      this.storm = this.stormOut = W.storm;
      this.cloud = W.cloud;
      const precip = W.rain + W.snow, asSnow = this.cold || (W.snow > 0 && !W.rain);
      this.rain = asSnow ? 0 : precip;
      this.snow = asSnow ? precip : 0;
      this.fog = W.fog; this.dust = W.dust; this.heat = W.heat * (1 - this.cloud); this.ash = W.ash; this.calm = W.calm;
      this.odd = W.odd; this.tint[0] = W.tint[0]; this.tint[1] = W.tint[1]; this.tint[2] = W.tint[2];
      this.aurora = W.aurora; this.thunder = W.thunder; this.windK = W.wind;
      this.front = Math.max(W.storm > 0.35 ? W.storm : 0, W.thunder);
    }
    return true;
  }

  /**
   * A bolt of lightning: { ground: a fork down to the sea (else a flash in the
   * clouds), angle (world radians from you), dist (m), near: close by }.
   */
  bolt(game, { ground = false, angle, dist, near = false } = {}) {
    const S = this.strike;
    const over = smoothstep(0.6, 0.9, this.storm);
    S.t = this.time;
    S.ground = ground;
    S.angle = angle ?? this.frontAngle + (Math.random() - 0.5) * lerp(2.2, TAU, over);
    S.dist = dist ?? (near ? 170 + Math.random() * 150 : ground ? 320 + Math.random() * 1300 : 260 + Math.random() * 2200);
    S.seed = (Math.random() * 1e9) | 0;
    // (near, a strike lights the whole world; far off, a glow in the clouds)
    S.k = clamp(1.25 - S.dist / 2200, 0.3, 1) * (ground ? 1 : 0.65);
    this.pulses.length = 0;
    const n = ground ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 3);
    // (a fork's first stroke flashes as its leader reaches the sea: see precip3d.js)
    let t = this.time + (ground ? 0.07 : 0);
    for (let i = 0; i < n; i++) {
      this.pulses.push(t, S.k * (i ? 0.45 + Math.random() * 0.5 : 1));
      t += 0.05 + Math.random() * 0.12;
    }
    game?.audio?.sfx?.('thunder', null, { far: clamp(S.dist / 2400, 0, 1) });
  }

  /** A bolt now, down to the sea (tests and screenshots): see bolt. */
  strikeNow(opts = {}) { this.bolt(null, { ground: true, ...opts }); }

  clockString() {
    const h = Math.floor(this.clock), m = Math.floor((this.clock - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/**
 * Sea currents: Reverse Mountain's canals run up the mountain from every
 * Blue and down into the Grand Line — always one way. `level` is the height
 * of the water there and `slope` how steeply it climbs (+) or falls (−)
 * along the flow; `canal` says you're in one.
 */
export function currentAt(world, x, y, out = { x: 0, y: 0, steer: 0, level: 0, slope: 0, canal: null }) {
  out.x = 0; out.y = 0; out.steer = 0; out.level = 0; out.slope = 0; out.canal = null;
  if (world.zone !== 0) return out;
  const ux = world.wx(x);
  if (!nearRM(ux, y)) return out;
  const k = canalAt(ux, y, 70);
  if (!k) return out;
  const c = k.canal;
  if (world.type(x, y) === T.RAPIDS || k.pool) {
    // in the canal: carried along it, and back toward the middle
    const sp = k.pool ? 12 : c.exit ? RM.downSpeed : k.level > 0.5 ? RM.upSpeed : RM.upSpeed * 0.75;
    const back = Math.max(-6, Math.min(6, -k.side * 0.55));
    out.x = k.fx * sp - k.fy * back;
    out.y = k.fy * sp + k.fx * back;
    out.steer = 2.6;
    out.level = k.level;
    out.slope = k.pool ? 0 : (canalLevel(c, k.s + 3) - canalLevel(c, k.s - 3)) / 6;
    out.canal = c;
    return out;
  }
  // out at sea before a gate: a strengthening pull into the mouth
  if (!c.exit && k.s < c.s[c.i0 ?? 0] + 10) {
    const f = 3 + 5 * Math.min(1, k.s / Math.max(1, c.s[c.i0 ?? 0]));
    out.x = k.fx * f + k.fy * k.side * 0.12;
    out.y = k.fy * f - k.fx * k.side * 0.12;
    out.steer = 0.35;
  }
  return out;
}

export { EQ, RM_X };
