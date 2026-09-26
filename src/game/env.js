// Time of day, moon, wind and weather. Weather depends on the sea: the Blues
// are gentle, the Grand Line changes its mind every few minutes, the Calm Belt
// has no wind at all, and each Grand Line island has its own climate.
import { regionAt, REGION, isGrandLine, isCalmBelt, EQ, RM_X } from '../world/constants.js';
import { clamp, lerp, smoothstep, TAU, angleDiff } from '../core/math.js';
import { REVERSE_MOUNTAIN } from '../world/worldgen.js';

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

/** Sea currents: Reverse Mountain canals flow uphill into the Grand Line. */
export function currentAt(world, x, y, out = { x: 0, y: 0, steer: 0 }) {
  out.x = 0; out.y = 0; out.steer = 0;
  if (world.zone !== 0) return out;
  const M = REVERSE_MOUNTAIN;
  const dx = world.dx(M.x, x), dy = y - M.y;
  if (Math.abs(dx) > M.rx + 70 || Math.abs(dy) > M.ry + 70) return out;
  if (!world.isLiquid(x, y)) return out;
  const d = Math.hypot(dx, dy);
  // exit canal into Paradise
  if (dx > 4 && Math.abs(dy) < 9 && dx < M.rx + 40) {
    out.x = 15; out.y = -dy * 0.6; out.steer = 1.5;
    return out;
  }
  const inside = Math.abs(dx) < M.rx * Math.sqrt(Math.max(0, 1 - (dy / M.ry) ** 2)) + 6;
  if (d < 10) { out.x = 12; out.y = -dy * 0.8; out.steer = 1.5; return out; }
  if (inside) {
    out.x = -dx / d * 16; out.y = -dy / d * 16; out.steer = 1.2;
    return out;
  }
  // gentle pull toward the nearest canal mouth
  for (const m of Object.values(M.mouths)) {
    const mx = world.dx(x, m.x), my = m.y - y;
    const md = Math.hypot(mx, my);
    if (md < 45) { out.x = mx / md * 3.5; out.y = my / md * 3.5; out.steer = 0.2; return out; }
  }
  return out;
}

export { EQ, RM_X };
