// Time of day, moon, wind and weather. Weather depends on the sea: the Blues
// are gentle, the Grand Line changes its mind every few minutes, the Calm Belt
// has no wind at all, and each Grand Line island has its own climate.
import { regionAt, REGION, isGrandLine, isCalmBelt, EQ, RM_X } from '../world/constants.js';
import { clamp, lerp, smoothstep, TAU, angleDiff } from '../core/math.js';
import { RM, canalAt, canalLevel, nearRM } from '../world/reverseMountain.js';
import { T } from '../world/tiles.js';

export const DAY_SECONDS = 960; // one in-game day = 16 real minutes

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
    this.forecast = 'Clear';
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
    const night = [0.21, 0.25, 0.46]; // moonlit blue, dark enough for lamplight to matter
    const dusk = [1.0, 0.72, 0.55];
    const day = [1, 1, 1];
    const duskAmt = Math.max(1 - Math.abs(c - 19) / 1.5, 1 - Math.abs(c - 6) / 1.5, 0) * 0.8;
    let amb = [0, 1, 2].map((i) => lerp(night[i], day[i], this.daylight));
    amb = amb.map((v, i) => lerp(v, dusk[i], clamp(duskAmt, 0, 1) * (this.daylight > 0.05 ? 1 : 0.4)));
    // weather darkening
    const dark = this.storm * 0.35 + this.fog * 0.15;
    amb = amb.map((v) => v * (1 - dark));
    if (this.lightning > 0) { amb = amb.map((v) => Math.min(1.6, v + this.lightning * 1.2)); this.lightning = Math.max(0, this.lightning - dt * 4); }
    this.ambient = amb;
    if (game.world && game.world.zone === 2) this.ambient = amb.map((v) => v * 0.8);

    // region-specific weather
    const p = game.focus();
    const reg = game.world && game.world.zone === 0 ? regionAt(p.x, p.y) : REGION.EAST_BLUE;
    this.region = reg;
    this.weatherTimer -= dt;
    const gl = isGrandLine(reg);
    if (this.weatherTimer <= 0) {
      this.weatherTimer = gl ? 25 + Math.random() * 50 : 60 + Math.random() * 120;
      const stormChance = reg === REGION.NEW_WORLD ? 0.4 : gl ? 0.3 : reg === REGION.POLAR ? 0.2 : 0.08;
      this.stormTarget = Math.random() < stormChance ? 0.5 + Math.random() * 0.5 : Math.random() < 0.3 ? 0.25 : 0;
      this.windTarget = gl ? Math.random() * TAU : this.windTarget + (Math.random() - 0.5) * 1.2;
      this.forecast = this.stormTarget > 0.6 ? 'Storm' : this.stormTarget > 0.3 ? 'Squall' : 'Clear';
      if (gl && Math.random() < 0.25 && game.onGrandLineWeather) game.onGrandLineWeather();
    }
    if (isCalmBelt(reg)) this.stormTarget = 0;
    // islands have stable local weather in the Grand Line
    const onIsland = game.currentIsland && game.player && game.player.mode === 'foot';
    const localStorm = onIsland && gl ? this.stormTarget * 0.3 : this.stormTarget;
    this.storm += (localStorm - this.storm) * Math.min(1, dt * 0.25);
    this.rain = this.storm > 0.2 ? this.storm : 0;
    const clim = game.world ? game.world.climate(p.x, p.y) : 0;
    this.snow = clim === 3 || reg === REGION.POLAR ? Math.max(0.3, this.storm) : 0;
    if (this.snow) this.rain = 0;
    const fogRegion = game.inFogRegion ? game.inFogRegion(p.x, p.y) : 0;
    this.fog += (fogRegion - this.fog) * Math.min(1, dt * 0.5);
    // wind
    this.windAngle += clamp(angleDiff(this.windAngle, this.windTarget), -0.2, 0.2) * dt * (gl ? 0.5 : 0.15);
    const gust = gl ? 0.85 + Math.sin(this.time * 0.7) * 0.15 : 1;
    this.windStrength = isCalmBelt(reg) ? 0 : clamp((0.8 + this.storm * 0.5) * gust, 0.2, 1.4);
    this.windX = Math.cos(this.windAngle) * this.windStrength;
    this.windY = Math.sin(this.windAngle) * this.windStrength;
    if (this.storm > 0.55 && Math.random() < dt * this.storm * 0.12) {
      this.lightning = 1;
      game.audio?.sfx('thunder');
    }
  }

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
