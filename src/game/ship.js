// Ships: wind-driven sailing, currents, hull collision against coasts,
// broadside cannons, damage, sinking.
import { Entity } from './entity.js';
import { SHIPS, SHIP_UPGRADES } from '../data/ships.js';
import { drawShip } from '../render/ship.js';
import { drawCharacter } from '../render/character.js';
import { SAILABLE } from '../world/tiles.js';
import { angleDiff, clamp, TAU } from '../core/math.js';
import { drawProjectile } from '../render/projectiles.js';
import { hbAt, hullGap, BIG_SHIP } from '../world/hull.js';

// where the hull meets the water, as fractions of the length and beam (the small ships)
const SMALL_HULL = [[0.47, 0], [-0.46, 0], [0.2, 0.42], [0.2, -0.42], [-0.25, 0.42], [-0.25, -0.42]];

/** Sailing speed multiplier for the bigger world (see WORLD_SCALE). */
const SEA_PACE = 1.25;

export class Ship extends Entity {
  constructor(o) {
    super({ ...o, kind: 'ship' });
    this.type = o.type || 'dinghy';
    this.upgrades = o.upgrades || [];
    this.applyDef();
    this.heading = o.heading ?? 0;
    this.speed = 0;
    this.sail = 0; // requested sail level 0..1
    this.sailSet = 0;
    this.hull = o.hull ?? this.maxHull;
    this.owner = o.owner || 'player';
    this.faction = o.faction || (this.owner === 'player' ? 'player' : 'pirate');
    this.name = o.name || this.def.name;
    this.jr = o.jr || null;
    this.sailColor = o.sailColor || null;
    this.anchored = true;
    this.cannonCd = 0;
    this.crew = o.crew || [];
    this.captain = null; // actor at the helm
    this.passengers = [];
    this.sunk = false;
    this.sinkT = 0;
    this.seed = Math.random() * 10;
    this.rowing = 0;
    this.burstCd = 0;
    this.ai = o.ai || null;
    this.cannonsOverride = o.cannons;
    this.sortY = this.y;
    this.r = this.def.beam * 0.5;
    this.coated = !!o.coated;
  }

  applyDef() {
    const base = SHIPS[this.type] || SHIPS.dinghy;
    const d = { ...base };
    const mods = {};
    for (const u of this.upgrades) SHIP_UPGRADES[u]?.apply(mods);
    d.speed *= mods.speedMul || 1;
    d.cannons = (d.cannons || 0) + (mods.extraCannons || 0);
    if (mods.seastone) d.seastone = true;
    if (mods.oars) d.oars = true;
    this.def = d;
    this.maxHull = Math.round(base.hull * (mods.hullMul || 1));
  }

  hullPoints(x, y, h) {
    const L = this.def.length, B = this.def.beam;
    const c = Math.cos(h), s = Math.sin(h);
    const pts = [];
    const add = (ax, ay) => pts.push([x + c * ax * L - s * ay * B, y + s * ax * L + c * ay * B]);
    if (L < BIG_SHIP) { for (const [ax, ay] of SMALL_HULL) add(ax, ay); return pts; }
    // the big ships: all the way round the waterline, every few metres
    const n = Math.ceil(L / 3);
    for (let i = 0; i <= n; i++) {
      const t = 0.03 + 0.93 * i / n, hb = hbAt(t, 1) * 0.95;
      add(t - 0.5, hb); add(t - 0.5, -hb);
    }
    add(0.49, 0);
    return pts;
  }

  fits(w, x, y, h) {
    for (const [px, py] of this.hullPoints(x, y, h)) {
      const t = w.type(px, py);
      if (!SAILABLE[t] || w.isBlocked(px, py)) return false;
    }
    return true;
  }

  update(dt, game) {
    if (this.sunk) {
      this.sinkT += dt;
      if (this.sinkT > 4) this.alive = false;
      return;
    }
    const w = game.world;
    const x0 = this.x, y0 = this.y, h0 = this.heading;
    this.sortY = this.y;
    this.cannonCd = Math.max(0, this.cannonCd - dt);
    this.burstCd = Math.max(0, this.burstCd - dt);
    if (this.ai) this.ai(this, dt, game);

    const env = game.env;
    const calm = game.isCalmAt(this.x, this.y);
    const windA = env.windAngle, windS = calm ? 0 : env.windStrength;
    this.sailSet += (this.sail - this.sailSet) * Math.min(1, dt * 1.5);
    const rel = Math.cos(angleDiff(this.heading, windA));
    const windFactor = (0.35 + 0.65 * clamp((rel + 0.4) / 1.4, 0, 1)) * windS;
    // (the seas were widened with the world, so sails carry a little further)
    let target = this.def.speed * SEA_PACE * this.sailSet * windFactor * (this.owner === 'player' ? game.crewMods?.speedMul || 1 : 1);
    // rowing / paddles work without wind
    const rowSpeed = this.def.paddle ? 0.6 : this.def.oars || this.type === 'dinghy' ? 0.42 : 0.12;
    if (this.rowing) target = Math.max(target, this.def.speed * rowSpeed * this.rowing);
    if (this.coupT > 0) { this.coupT -= dt; target = this.def.speed * 5; }
    // storms slow you and batter the hull
    if (env.storm > 0.3 && !game.isCalmAt(this.x, this.y)) {
      target *= 1 - env.storm * 0.25;
      if (this.owner === 'player' && Math.random() < dt * env.storm * 0.3 * (1 - (this.def.stormResist || 0.3))) this.damage(4 + env.storm * 8, null, { weather: true });
    }
    this.speed += (target - this.speed) * Math.min(1, dt * (target > this.speed ? 0.7 : 1.2));
    const cur = game.currentAt(this.x, this.y);
    let vx = Math.cos(this.heading) * this.speed + cur.x;
    let vy = Math.sin(this.heading) * this.speed + cur.y;
    // heading follows strong currents a little (Reverse Mountain)
    if (cur.steer) this.heading += clamp(angleDiff(this.heading, Math.atan2(cur.y, cur.x)), -1, 1) * dt * cur.steer;
    const nx = w.wx(this.x + vx * dt), ny = this.y + vy * dt;
    // (hulls don't pass through each other: a ship alongside is as solid as a quay)
    const ok = (x, y) => this.fits(w, x, y, this.heading) && !this.shipIn(game, x, y, this.heading);
    if (ok(nx, ny)) {
      this.x = nx; this.y = ny;
    } else if (ok(nx, this.y)) {
      this.x = nx; this.speed *= 0.7;
    } else if (ok(this.x, ny)) {
      this.y = ny; this.speed *= 0.7;
    } else {
      const impact = Math.hypot(vx, vy);
      if (impact > 5 && this.owner === 'player') {
        this.damage(Math.round(impact * (cur.steer ? 5 : 2)), null, { crash: true });
        game.fx.shake(0.4);
        game.fx.burst(this.x + Math.cos(this.heading) * this.def.length * 0.5, this.y + Math.sin(this.heading) * this.def.length * 0.5, 14, { color: ['#8d6e63', '#e1f5fe'], speed: 4, g: 8, life: 0.6 });
        game.audio?.sfx('crash');
        if (cur.steer) game.log('CRASH! Steer with the current — hit the canal walls and you will sink!', '#ff8a80');
      }
      this.speed *= -0.25;
      // nudge out of the wall
      if (!this.fits(w, this.x, this.y, this.heading)) this.unstick(w);
    }
    // (the wake is drawn on the water by the 3D view: see render3d/ships3d.js WakeTrail)
    // carry the crew
    for (const p of this.passengers) { p.x = this.x; p.y = this.y + 0.01; }
    // and everyone standing on the deck, turning with the ship
    if (this.aboard && this.aboard.size) {
      const dh = this.heading - h0, c = Math.cos(dh), sn = Math.sin(dh);
      for (const a of this.aboard) {
        if (!a.alive || !a.deck || a.deck.ship !== this) { this.aboard.delete(a); continue; }
        const rx = w.dx(x0, a.x), ry = a.y - y0;
        a.x = w.wx(this.x + rx * c - ry * sn); a.y = this.y + rx * sn + ry * c;
        if (dh) a.facing += dh;
      }
    }
  }

  /**
   * Find the nearest clear water (a big ship searches further, and swings
   * round to lie along the coast if she must; `far`: a fresh berth, not a nudge).
   */
  /** Another ship's hull where this one's would be at (x, y, h), if any. */
  shipIn(game, x, y, h) {
    const w = game.world;
    let pts = null;
    for (const o of game.ships) {
      if (o === this || o.sunk || o.alive === false) continue;
      const reach = (this.def.length + o.def.length) * 0.5 + 1;
      const dx = w.dx(o.x, x), dy = y - o.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      // (already overlapping — say, launched on top of each other: let them part)
      if (hullGap(o, w.dx(o.x, this.x), this.y - o.y) <= 0) continue;
      pts = pts || this.hullPoints(x, y, h);
      for (const [px, py] of pts) if (hullGap(o, w.dx(o.x, px), py - o.y) <= 0) return o;
    }
    return null;
  }

  unstick(w, far = false) {
    const big = this.def.length >= BIG_SHIP;
    const R = big ? this.def.length * (far ? 1.6 : 0.5) : 6, dr = big ? 1.5 : 0.5;
    const hs = big ? [this.heading, this.heading + Math.PI / 2, this.heading - Math.PI / 2, this.heading + Math.PI] : [this.heading];
    for (const h of hs) {
      for (let r = dr; r < R; r += dr) {
        const da = big ? Math.min(0.5, 2.2 / r) : 0.5;
        for (let a = 0; a < TAU; a += da) {
          const x = w.wx(this.x + Math.cos(a) * r), y = this.y + Math.sin(a) * r;
          if (this.fits(w, x, y, h)) { this.x = x; this.y = y; this.heading = h; return true; }
        }
      }
      if (!far) break;
    }
    return false;
  }

  /** A big ship moors alongside a pier head, bow out to sea (as near as she'll fit). */
  berth(w, dock) {
    const L = this.def.length, B = this.def.beam;
    const dx = dock.dirX || 0, dy = dock.dirY || 1, hd = Math.atan2(dy, dx);
    const end = dock.end || dock;
    for (let k = 0; k < 10; k++) {
      for (const sg of [1, -1]) {
        // (alongside the pier's T-head, clear of it)
        const along = L * 0.5 - 5 + k * 2.5, off = sg * (B * 0.5 + (dock.headHalf ?? 1) + 1.4);
        const x = w.wx(end.x + 0.5 + dx * along - dy * off), y = end.y + 0.5 + dy * along + dx * off;
        if (this.fits(w, x, y, hd)) { this.x = x; this.y = y; this.heading = hd; return true; }
      }
    }
    return false;
  }

  damage(n, attacker, info = {}) {
    if (this.sunk || n <= 0) return;
    this.hull -= n;
    this.lastHitBy = attacker;
    if (this.game) {
      this.game.fx.text(this.x, this.y - 1, String(Math.round(n)), '#ffcc80', 0.45);
      this.game.fx.burst(this.x, this.y - 0.5, 8, { color: ['#8d6e63', '#bcaaa4', '#ffab40'], speed: 4, g: 7, life: 0.5 });
      if (this.onDamage) this.onDamage(this, n, attacker, info);
    }
    if (this.hull <= 0) {
      this.hull = 0;
      this.sink();
    }
  }

  sink() {
    this.sunk = true;
    this.sinkT = 0;
    this.speed = 0;
    if (this.game) this.game.onShipSunk(this);
  }

  /** Fire a broadside at a world point. */
  fireBroadside(game, tx, ty, owner) {
    const n = Math.max(1, Math.min(10, Math.ceil((this.cannonsOverride ?? this.def.cannons ?? 0) / 2)));
    if (!this.def.cannons && this.cannonsOverride === undefined) return false;
    if (this.cannonCd > 0) return false;
    this.cannonCd = 2.2 + n * 0.08;
    const toT = Math.atan2(ty - this.y, game.world.dx(this.x, tx));
    const side = angleDiff(this.heading, toT) > 0 ? 1 : -1;
    const baseA = this.heading + side * Math.PI / 2;
    const aim = clamp(angleDiff(baseA, toT), -0.6, 0.6);
    const L = this.def.length, B = this.def.beam;
    for (let i = 0; i < n; i++) {
      const along = -L * 0.3 + (n === 1 ? 0.3 * L : (i / (n - 1)) * L * 0.6);
      const px = this.x + Math.cos(this.heading) * along + Math.cos(baseA) * B * 0.5;
      const py = this.y + Math.sin(this.heading) * along + Math.sin(baseA) * B * 0.5;
      const a = baseA + aim + (Math.random() - 0.5) * 0.08;
      const sp = 17;
      game.combat.projectile({
        owner, ownerShip: this, x: game.world.wx(px), y: py + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, range: 16 + Math.random() * 3,
        radius: 0.3, damage: 22 * (owner?.isPlayer ? game.crewMods?.cannonMul || 1 : 1), shipDamage: 26 * (owner?.isPlayer ? game.crewMods?.cannonMul || 1 : 1), element: 'explosion', knockback: 6, stun: 0.4, sprite: 'cannonball', hitShips: true, passWalls: true,
        draw: drawProjectile, delay: i * 0.05,
        onEnd: (p, g) => {
          if (g.world.isLiquid(p.x, p.y)) g.fx.burst(p.x, p.y, 10, { color: ['#e1f5fe', '#81d4fa'], speed: 3, vz: 5, g: 10, life: 0.6, size: 0.14 });
          else g.fx.burst(p.x, p.y, 10, { color: ['#ffab40', '#616161'], speed: 4, g: 6, life: 0.5, kind: 'fire', size: 0.2 });
        },
      });
      game.fx.burst(px, py, 6, { color: ['#eeeeee', '#9e9e9e'], speed: 2, g: -0.5, life: 0.8, kind: 'smoke', size: 0.3, grow: 0.4, angle: a, spread: 0.6 });
    }
    game.fx.shake(0.15);
    game.audio?.sfx('cannon');
    return true;
  }

  draw(g, env) {
    const k = this.sunk ? Math.min(1, this.sinkT / 4) : 0;
    g.globalAlpha = 1 - k;
    g.save();
    if (this.sunk) g.rotate(k * 0.4);
    drawShip(g, this.def, {
      heading: this.heading, sailSet: this.sailSet, windAngle: this.game ? this.game.env.windAngle : 0, jr: this.jr, t: env.time,
      damage: 1 - this.hull / this.maxHull, seed: this.seed, sailColor: this.sailColor, coated: this.coated,
      // the player's ships fly the Marine colours while they serve, their own
      // Jolly Roger once they found a crew, and no flag at all before that
      marine: this.owner === 'player' && this.game?.state?.char?.faction === 'marine',
      noFlag: this.owner === 'player' && !this.jr,
    });
    g.restore();
    // captain and crew on deck (upright characters)
    const deck = [];
    if (this.captain) deck.push([this.captain, -0.28]);
    this.passengers.forEach((p, i) => { if (p !== this.captain) deck.push([p, 0.1 + i * 0.2]); });
    for (const [a, along] of deck) {
      const L = this.def.length;
      const ox = Math.cos(this.heading) * along * L, oy = Math.sin(this.heading) * along * L;
      g.save();
      g.translate(ox, oy + 0.35);
      g.scale(0.75, 0.75);
      drawCharacter(g, a.look, { facing: this.heading, moving: false, time: env.time, state: 'idle' });
      g.restore();
    }
    for (const c of this.crewActors || []) {
      g.save(); g.translate(c.ox, c.oy + 0.35); g.scale(0.7, 0.7);
      drawCharacter(g, c.look, { facing: this.heading, moving: false, time: env.time + c.ox, state: 'idle' });
      g.restore();
    }
    g.globalAlpha = 1;
    if (this.showBar && !this.sunk) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(-1, -this.def.length * 0.45 - 0.6, 2, 0.14);
      g.fillStyle = this.faction === 'marine' ? '#64b5f6' : '#ffb74d'; g.fillRect(-1, -this.def.length * 0.45 - 0.6, 2 * this.hull / this.maxHull, 0.14);
      if (this.label) { g.font = 'bold 0.3px Nunito, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 0.06; g.strokeText(this.label, 0, -this.def.length * 0.45 - 0.75); g.fillText(this.label, 0, -this.def.length * 0.45 - 0.75); }
    }
  }
}
