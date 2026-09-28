// Ships: wind-driven sailing, currents, hull collision against coasts,
// broadside cannons, damage, sinking (not yours, while SHIPS_UNBREAKABLE).
import { Entity } from './entity.js';
import { SHIPS_UNBREAKABLE, shipStats, shotCapFor } from '../data/ships.js';
import { drawShip } from '../render/ship.js';
import { drawCharacter } from '../render/character.js';
import { SAILABLE } from '../world/tiles.js';
import { angleDiff, clamp, TAU } from '../core/math.js';
import { drawProjectile } from '../render/projectiles.js';
import { hbAt, hullGap, BIG_SHIP, oarStroke, oarDrive, shipDims, deckToWorld, xAt } from '../world/hull.js';

// where the hull meets the water, as fractions of the length and beam (the small ships)
const SMALL_HULL = [[0.47, 0], [-0.46, 0], [0.2, 0.42], [0.2, -0.42], [-0.25, 0.42], [-0.25, -0.42]];

// a rowboat's oars: seconds a stroke, held ready (blades just clear of the
// water), and at rest (trailing aft alongside, nobody at them)
const STROKE_T = 1.15;
const OAR_READY = { a: 0.15, b: 0.22, f: 1 };
const OAR_REST = { a: -1.15, b: 0.12, f: 1 };

/**
 * Sailing speed multiplier: the seas are wide (islands kilometres apart, see
 * POS_SCALE), so a ship under full sail with the wind behind her makes a
 * crossing between neighbouring islands in a couple of minutes.
 */
const SEA_PACE = 2;

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
    this.rowPow = 0; // (a rowboat's pace at the oars, −0.6 backing water … 1 full: it holds till you change it)
    // a rowboat's oars: which way each is pulling (1 ahead, -1 backing, 0 held),
    // where the stroke is, and how each lies now (see updateOars)
    this.rowL = 0; this.rowR = 0; this.rowPh = 0; this.drive = 0;
    this.oars = this.def.oarsOnly ? [{ ...OAR_REST }, { ...OAR_REST }] : null;
    this.speedCap = null; // (a pursuer holding back to your pace: see traffic.js)
    this.burstCd = 0;
    this.ai = o.ai || null;
    this.cannonsOverride = o.cannons;
    // cannonballs in her hold: a broadside takes one a gun (see fireBroadside)
    this.shot = Math.max(0, Math.min(this.shotCap, o.shot ?? this.shotCap));
    this.sortY = this.y;
    this.r = this.def.beam * 0.5;
    this.coated = !!o.coated;
  }

  applyDef() {
    const { maxHull, ...d } = shipStats(this.type, this.upgrades);
    this.def = d;
    this.maxHull = maxHull;
  }

  /** How many cannonballs she can carry (none, without guns). */
  get shotCap() { return shotCapFor(this.cannonsOverride ?? this.def.cannons ?? 0); }

  /** One of yours (or a Navy escort sailing with you): nothing breaks her (see SHIPS_UNBREAKABLE). */
  get unbreakable() { return SHIPS_UNBREAKABLE && (this.owner === 'player' || this.escortOf === 'player'); }

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
    // (a hull of yours is always sound: an old save's damage, or new plating, is made good)
    if (this.hull < this.maxHull && this.unbreakable) this.hull = this.maxHull;
    if (this.crashT > 0) this.crashT -= dt;
    this.cannonCd = Math.max(0, this.cannonCd - dt);
    this.burstCd = Math.max(0, this.burstCd - dt);
    if (this.ai) this.ai(this, dt, game);

    const env = game.env;
    const calm = game.isCalmAt(this.x, this.y);
    const windA = env.windAngle, windS = calm ? 0 : env.windStrength;
    const oared = this.def.oarsOnly;
    let target;
    if (oared) {
      // a rowboat has no sail: the oars drive her, wind or no wind (someone
      // sailing her by the AI's "sail" rows at that pace)
      this.sail = this.captain ? 0 : this.sail;
      this.sailSet = 0;
      if (!this.captain) { const k = this.sail > 0.05 && this.ai ? 1 : 0; this.rowL = k; this.rowR = k; }
      this.updateOars(dt);
      const pull = this.captain ? (this.rowL + this.rowR) / 2 : (this.rowL ? this.sail : 0);
      // (each stroke surges her on and she slows between; backing water is slower)
      target = this.def.speed * pull * (pull < 0 ? 0.55 : 1) * (0.78 + 0.44 * this.drive);
    } else {
      this.sailSet += (this.sail - this.sailSet) * Math.min(1, dt * 1.5);
      const rel = Math.cos(angleDiff(this.heading, windA));
      const windFactor = (0.35 + 0.65 * clamp((rel + 0.4) / 1.4, 0, 1)) * windS;
      // (the seas were widened with the world, so sails carry a little further)
      target = this.def.speed * SEA_PACE * this.sailSet * windFactor * (this.owner === 'player' ? game.crewMods?.speedMul || 1 : 1);
      // rowing / paddles work without wind
      const rowSpeed = this.def.paddle ? 0.6 : this.def.oars ? 0.42 : 0.12;
      if (this.rowing) target = Math.max(target, this.def.speed * rowSpeed * this.rowing);
    }
    if (this.speedCap != null && target > this.speedCap) target = this.speedCap;
    if (this.coupT > 0) { this.coupT -= dt; target = this.def.speed * 5; }
    // storms slow you and batter the hull
    if (env.storm > 0.3 && !game.isCalmAt(this.x, this.y)) {
      target *= 1 - env.storm * 0.25;
      if (this.owner === 'player' && Math.random() < dt * env.storm * 0.3 * (1 - (this.def.stormResist || 0.3))) this.damage(4 + env.storm * 8, null, { weather: true });
    }
    const cur = game.currentAt(this.x, this.y, this);
    // riding Reverse Mountain the current does the sailing: the sails can only help a little
    if (cur.canal) target *= 0.35;
    // (a light boat under oars answers each stroke; a ship under sail gathers way slowly)
    this.speed += (target - this.speed) * Math.min(1, dt * (oared ? 1.6 : target > this.speed ? 0.7 : 1.2));
    // the water's height under the keel (up the mountain's canals) and the slope she's riding
    this.lvl = cur.level;
    const along = cur.canal ? Math.cos(angleDiff(this.heading, Math.atan2(cur.y, cur.x))) : 0;
    const pitchT = Math.atan(cur.slope) * along;
    this.pitch = (this.pitch || 0) + (pitchT - (this.pitch || 0)) * Math.min(1, dt * 3);
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
      if (impact > 5 && this.owner === 'player' && !(this.crashT > 0)) {
        // (a scrape along Reverse Mountain's walls hurts — but one knock doesn't sink you)
        this.crashT = cur.steer ? 0.9 : 0.4;
        this.damage(Math.round(cur.steer ? Math.min(28, impact * 1.6) : impact * 2), null, { crash: true });
        game.fx.shake(0.4);
        game.fx.burst(this.x + Math.cos(this.heading) * this.def.length * 0.5, this.y + Math.sin(this.heading) * this.def.length * 0.5, 14, { color: ['#8d6e63', '#e1f5fe'], speed: 4, g: 8, life: 0.6 });
        game.audio?.sfx('crash', this);
        if (cur.steer) game.log(this.unbreakable ? 'CRASH! Steer with the current — keep to the middle of the canal!' : 'CRASH! Steer with the current — hit the canal walls and you will sink!', '#ff8a80');
      }
      this.speed *= -0.25;
      // nudge out of the wall
      if (!this.fits(w, this.x, this.y, this.heading)) this.unstick(w);
    }
    // hulls that overlap (launched on top of each other, shoved together by a
    // current, a collision at speed) ease apart instead of sticking
    if (game.ships.length > 1) this.separate(game, dt);
    // (the wake is drawn on the water by the 3D view: see render3d/ships3d.js WakeTrail)
    // carry the crew (and whoever's at the helm, so the view rides with her exactly)
    for (const p of this.passengers) { p.x = this.x; p.y = this.y + 0.01; }
    if (this.captain) { this.captain.x = this.x; this.captain.y = this.y; }
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
   * A rowboat's oars, stroke by stroke: the blades dip in at the catch, sweep
   * aft through the drive, lift out and swing forward again feathered flat.
   * An oar that isn't pulling is held ready, blade clear of the water; with
   * nobody at them they trail alongside. The rower's hands keep hold of the
   * grips (see render3d/chars/pose.js stationReach).
   */
  updateOars(dt) {
    const stroking = this.rowL || this.rowR;
    // (a fresh start begins at the catch; an easy pace is a slower stroke)
    const tempo = 0.55 + 0.45 * Math.min(1, Math.max(Math.abs(this.rowL), Math.abs(this.rowR)));
    this.rowPh = stroking ? (this.rowPh + dt / STROKE_T * tempo) % 1 : 0;
    const manned = !!this.captain || !!(this.rower && this.rower.alive && this.rower.deck?.ship === this && this.rower.state === 'idle');
    for (let i = 0; i < 2; i++) {
      const pull = i ? this.rowR : this.rowL, o = this.oars[i];
      const want = pull ? oarStroke(this.rowPh, pull) : manned ? OAR_READY : OAR_REST;
      const k = Math.min(1, dt * (pull ? 14 : 4));
      o.a += (want.a - o.a) * k; o.b += (want.b - o.b) * k; o.f += (want.f - o.f) * k;
    }
    this.drive = stroking ? oarDrive(this.rowPh) : 0;
  }

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

  /** Push away from any ship whose hull ours is inside. */
  separate(game, dt) {
    const w = game.world;
    let pts = null;
    for (const o of game.ships) {
      if (o === this || o.sunk || o.alive === false) continue;
      const reach = (this.def.length + o.def.length) * 0.5 + 1;
      const dx = w.dx(o.x, this.x), dy = this.y - o.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      pts = pts || this.hullPoints(this.x, this.y, this.heading);
      let inside = 0;
      for (const [px, py] of pts) if (hullGap(o, w.dx(o.x, px), py - o.y) < 0.15) inside++;
      if (!inside) continue;
      // (straight apart; two ships lying exactly on top of each other part sideways)
      const d = Math.hypot(dx, dy);
      const ux = d > 0.05 ? dx / d : -Math.sin(o.heading), uy = d > 0.05 ? dy / d : Math.cos(o.heading);
      // (an anchored or raided ship is the rock; the moving one gives way)
      const k = (this.anchored && !o.anchored ? 0.3 : 1) * Math.min(4, 1 + inside * 0.35);
      const nx = w.wx(this.x + ux * k * dt), ny = this.y + uy * k * dt;
      if (this.fits(w, nx, ny, this.heading)) { this.x = nx; this.y = ny; }
      this.speed *= Math.pow(0.5, dt);
      pts = null;
    }
  }

  /**
   * Find the nearest clear water (a big ship searches further, and swings
   * round to lie along the coast if she must; `far`: a fresh berth, not a nudge).
   */
  unstick(w, far = false) {
    // (already clear where she lies — a boat just moored alongside a pier: leave her be)
    if (!far && this.fits(w, this.x, this.y, this.heading) && !(this.game && this.shipIn(this.game, this.x, this.y, this.heading))) return true;
    const big = this.def.length >= BIG_SHIP;
    const R = big ? this.def.length * (far ? 1.6 : 0.5) : 6, dr = big ? 1.5 : 0.5;
    const hs = big ? [this.heading, this.heading + Math.PI / 2, this.heading - Math.PI / 2, this.heading + Math.PI] : [this.heading];
    for (const h of hs) {
      for (let r = dr; r < R; r += dr) {
        const da = big ? Math.min(0.5, 2.2 / r) : 0.5;
        for (let a = 0; a < TAU; a += da) {
          const x = w.wx(this.x + Math.cos(a) * r), y = this.y + Math.sin(a) * r;
          if (this.fits(w, x, y, h) && !(this.game && this.shipIn(this.game, x, y, h))) { this.x = x; this.y = y; this.heading = h; return true; }
        }
      }
      if (!far) break;
    }
    return false;
  }

  /**
   * A big ship berths alongside a pier head, bow out to sea: her waist (the
   * main deck, where her rail's lowest: a jump from the planks) alongside the
   * head — or, where the water's too shallow for that, as near it as she'll lie.
   */
  berth(w, dock) {
    const L = this.def.length, B = this.def.beam, d = shipDims(this.def);
    const dx = dock.dirX ?? 0, dy = dock.dirY ?? 1, hd = Math.atan2(dy, dx);
    const end = dock.end || dock;
    // (the head's planks, from 2.5 m short of its end, alongside her main deck just forward of the stairs up to her quarterdeck)
    const qs = d.big ? d.stairs.find((s) => s.la === 'quarter' && s.lb === 'main') : null;
    const waist = Math.min(L * 0.5 - 5, qs ? -xAt(d, qs.tb) - 3.2 : Infinity);
    for (let k = 0; k < 26; k++) {
      for (const sg of [1, -1]) {
        // (alongside the pier's T-head, clear of it)
        const along = waist + k * 2, off = sg * (B * 0.5 + (dock.headHalf ?? 1) + 1.4);
        const x = w.wx(end.x + 0.5 + dx * along - dy * off), y = end.y + 0.5 + dy * along + dx * off;
        if (this.fits(w, x, y, hd)) { this.x = x; this.y = y; this.heading = hd; return true; }
      }
    }
    return false;
  }

  /**
   * A small ship ties up alongside a pier head, bow out to sea, her side a
   * short step from its edge (so you can step or jump down onto her deck).
   */
  moorAlongside(w, dock) {
    const L = this.def.length, B = this.def.beam;
    const dx = dock.dirX ?? 0, dy = dock.dirY ?? 1, hd = Math.atan2(dy, dx);
    const end = dock.end || dock, edge = (dock.headHalf ?? 1) + 0.5;
    for (const gap of [0.3, 0.6, 1]) {
      for (let k = 0; k < 6; k++) {
        for (const sg of [1, -1]) {
          const along = 0.3 - L / 2 - k * 1.2, off = sg * (edge + gap + B / 2);
          const x = w.wx(end.x + 0.5 + dx * along - dy * off), y = end.y + 0.5 + dy * along + dx * off;
          if (this.fits(w, x, y, hd) && !(this.game && this.shipIn(this.game, x, y, hd))) { this.x = x; this.y = y; this.heading = hd; return true; }
        }
      }
    }
    return false;
  }

  damage(n, attacker, info = {}) {
    if (this.sunk || n <= 0) return;
    if (this.unbreakable) {
      // (the shot bounces off her timbers: a puff of splinters, nothing more)
      if (this.game && !info.weather && !info.crash) this.game.fx.burst(this.x, this.y - 0.5, 5, { color: ['#8d6e63', '#bcaaa4'], speed: 3, g: 7, life: 0.4 });
      return;
    }
    this.hull -= n;
    this.lastHitBy = attacker;
    // (fire on a ship and she'll fire back, newcomer or not)
    if (attacker && this.owner !== 'player' && (attacker.isPlayer || attacker.ownerShip?.owner === 'player')) this.provoked = true;
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
  /**
   * A broadside toward (tx, ty): every gun on that side fires, a cannonball
   * each, from its own port (a small boat's guns: along her side), and the
   * balls arc out over the water. None left in the hold, and the guns are silent.
   */
  fireBroadside(game, tx, ty, owner) {
    const cannons = this.cannonsOverride ?? this.def.cannons ?? 0;
    if (!cannons) return false;
    if (this.cannonCd > 0) return false;
    const toT = Math.atan2(ty - this.y, game.world.dx(this.x, tx));
    const side = angleDiff(this.heading, toT) > 0 ? 1 : -1;
    const baseA = this.heading + side * Math.PI / 2;
    const aim = clamp(angleDiff(baseA, toT), -0.6, 0.6);
    const d = shipDims(this.def);
    // the guns on that side (as the 3D ship has them); the rest of her weight of shot is in their size
    const want = Math.max(1, Math.min(10, Math.ceil(cannons / 2)));
    let guns = d.big ? [...d.guns, ...(d.lowGuns || [])].filter((g) => g.s === side) : [];
    if (guns.length > 16) guns = guns.filter((g, i) => i % Math.ceil(guns.length / 16) === 0);
    let n = guns.length || want;
    if (this.shot <= 0) { this.outOfShot(game, owner); this.cannonCd = 1.5; return false; }
    n = Math.min(n, this.shot);
    this.shot -= n;
    if (guns.length > n) guns = guns.slice(0, n);
    const heavy = want / n;
    this.cannonCd = 2.2 + n * 0.08;
    const L = this.def.length, B = this.def.beam;
    const mul = owner?.isPlayer ? game.crewMods?.cannonMul || 1 : 1;
    for (let i = 0; i < n; i++) {
      let px, py, h0;
      const g = guns[i];
      if (g) {
        const t = g.t, low = d.lowGuns?.includes(g);
        const m = deckToWorld(this, t, side * (hbAt(t, B) + 0.35));
        px = m.x; py = m.y;
        h0 = (low ? d.holdY + 0.42 * Math.max(0.85, d.gunScale || 1) : d.deckY + 0.42) + (this.lvl || 0) + 0.05;
      } else {
        const along = -L * 0.3 + (n === 1 ? 0.3 * L : (i / (n - 1)) * L * 0.6);
        px = this.x + Math.cos(this.heading) * along + Math.cos(baseA) * B * 0.5;
        py = this.y + Math.sin(this.heading) * along + Math.sin(baseA) * B * 0.5;
        h0 = (d.deckY || 0.4) + 0.4;
      }
      const a = baseA + aim + (Math.random() - 0.5) * 0.08;
      const sp = 17, range = 16 + Math.random() * 3;
      game.combat.projectile({
        owner, ownerShip: this, x: game.world.wx(px), y: py + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, range,
        radius: 0.3, damage: 22 * mul * heavy, shipDamage: 26 * mul * heavy, element: 'explosion', knockback: 6, stun: 0.4, sprite: 'cannonball', hitShips: true, passWalls: true,
        // (out of the port and over the water in an arc, down into the sea at the end of its range)
        arc: { h0, apex: 1.2 + range * 0.05 },
        draw: drawProjectile, delay: i * 0.05,
        onEnd: (p, gm) => {
          if (gm.world.isLiquid(p.x, p.y)) gm.fx.burst(p.x, p.y, 10, { color: ['#e1f5fe', '#81d4fa'], speed: 3, vz: 5, g: 10, life: 0.6, size: 0.14 });
          else gm.fx.burst(p.x, p.y, 10, { color: ['#ffab40', '#616161'], speed: 4, g: 6, life: 0.5, kind: 'fire', size: 0.2 });
        },
      });
      game.fx.burst(px, py, 6, { color: ['#eeeeee', '#9e9e9e'], speed: 2, g: -0.5, life: 0.8, kind: 'smoke', size: 0.3, grow: 0.4, angle: a, spread: 0.6 });
    }
    game.fx.shake(0.15);
    game.audio?.sfx('cannon', this);
    return true;
  }

  /** The guns are silent: nothing left to load them with. */
  outOfShot(game, owner) {
    if (!(owner?.isPlayer || this.owner === 'player')) return;
    const now = game.time || 0;
    if (now - (this._dryT ?? -9) < 3) return;
    this._dryT = now;
    game.audio?.sfx('dry', this);
    game.log(`The ${this.name} is out of cannonballs! A shipwright will sell you more — or take them from a ship's hold.`, '#ff8a80');
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
