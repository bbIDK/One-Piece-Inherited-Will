// Ships: wind-driven sailing, currents, hull collision against coasts,
// broadside cannons, damage, sinking (not yours, while SHIPS_UNBREAKABLE).
import { Entity } from './entity.js';
import { hullStep } from './physics.js';
import { SHIPS_UNBREAKABLE, shipStats, shotCapFor } from '../data/ships.js';
import { drawShip } from '../render/ship.js';
import { drawCharacter } from '../render/character.js';
import { SAILABLE } from '../world/tiles.js';
import { angleDiff, clamp, TAU, springStep } from '../core/math.js';
import { BOAT_FEEL } from './boatFeel.js';
import { drawProjectile } from '../render/projectiles.js';
import { hbAt, hullGap, BIG_SHIP, oarStroke, oarDrive, shipDims, deckToWorld, xAt } from '../world/hull.js';

// where the hull meets the water, as fractions of the length and beam (the small ships)
const SMALL_HULL = [[0.47, 0], [-0.46, 0], [0.2, 0.42], [0.2, -0.42], [-0.25, 0.42], [-0.25, -0.42]];

// a rowboat's oars: seconds a stroke, held ready (blades just clear of the
// water), and at rest (trailing aft alongside, nobody at them)
const STROKE_T = 1.15;
const OAR_READY = { a: 0.15, b: 0.22, f: 1 };
const OAR_REST = { a: -1.15, b: 0.12, f: 1 };
const _sp = [0, 0];

/**
 * Sailing speed multiplier: the seas are wide (islands kilometres apart, see
 * POS_SCALE), so a ship under full sail with the wind behind her makes a
 * crossing between neighbouring islands in a couple of minutes.
 */
const SEA_PACE = 2;

const NONE = [];
/**
 * The other players' ships as they're drawn here just now, in a multiplayer
 * voyage (stand-ins: see net/remote.js) — else none. Here they're as solid as
 * any ship: her side a wall, her decks to stand on and her ladders to climb,
 * and no hull passes through hers. Nothing of theirs is simulated, though:
 * their own game sails them, and nobody here takes her helm or her guns.
 */
export function theirShips(game) { return game.net?.ships || NONE; }
/** Every ship there is to stand on or run into: the game's own, and the other players'. */
export function allShips(game) {
  const theirs = theirShips(game);
  return theirs.length ? game.ships.concat(theirs) : game.ships;
}
/** Any ship here at all, of anyone's? */
export function anyShips(game) { return game.ships.length > 0 || theirShips(game).length > 0; }

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
    // (her owner's choice of paint: hull colour, sails, figurehead — see ui/shipDesigner.js)
    this.paint = o.paint || null;
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
    // the helm (-1 hard a-port … 1 hard a-starboard) and how fast it's going
    // over, how fast she's turning (rad/s), and the wheel as it lies (radians:
    // + turned to starboard, the top of it gone over to the right): see steer()
    this.helm = 0; this.helmV = 0; this.yawRate = 0; this.wheel = 0; this.wheelV = 0; this.steered = false;
    this.push = 0; // (what's driving her on, eased: see update)
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
    // (from the heading everyone aboard was last carried to: a turn of the
    // helm made since — yours, steered before her update — swings them round
    // with her too, not just a turn she makes in here)
    const x0 = this.x, y0 = this.y, h0 = this.hCarried ?? this.heading;
    this.sortY = this.y;
    // (a hull of yours is always sound: an old save's damage, or new plating, is made good)
    if (this.hull < this.maxHull && this.unbreakable) this.hull = this.maxHull;
    if (this.crashT > 0) this.crashT -= dt;
    this.cannonCd = Math.max(0, this.cannonCd - dt);
    this.burstCd = Math.max(0, this.burstCd - dt);
    if (this.ai) this.ai(this, dt, game);
    // nobody at her helm this moment (you've let go of it, or left it): it
    // comes back amidships, and her turn dies away as it does
    if (!this.steered && (this.helm || this.yawRate || this.wheel)) {
      // (at anchor, or moored: she doesn't swing on round — only the wheel spins back)
      if (this.anchored) { this.helm = this.helmV = this.yawRate = 0; }
      this.steer(0, 0, dt);
      if (Math.abs(this.helm) + Math.abs(this.yawRate) + Math.abs(this.wheel) < 1e-4) { this.helm = this.helmV = this.yawRate = this.wheel = this.wheelV = 0; }
    }
    this.steered = false;

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
      // (beating into the wind she still makes good way — tacking, as a real ship would — just not her best)
      const windFactor = (0.62 + 0.38 * clamp((rel + 0.4) / 1.4, 0, 1)) * windS;
      // (the seas were widened with the world, so sails carry a little further)
      target = this.def.speed * SEA_PACE * this.sailSet * windFactor * (this.owner === 'player' ? game.crewMods?.speedMul || 1 : 1);
      // rowing / paddles work without wind
      const rowSpeed = this.def.paddle ? 0.6 : this.def.oars ? 0.42 : 0.12;
      if (this.rowing) target = Math.max(target, this.def.speed * rowSpeed * this.rowing);
    }
    // (crowding on sail to come up with her flagship: see factions.js escortAI)
    if (this.catchUp) target *= this.catchUp;
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
    // — and what drives her builds up and dies away over a moment (the sails
    // filling, the oars biting), so she never lurches into a new pace
    this.push += (target - this.push) * (1 - Math.exp(-dt / Math.max(0.01, oared ? BOAT_FEEL.speedSmoothOars : BOAT_FEEL.speedSmooth)));
    // a light boat under oars answers each stroke; a ship under sail is driven
    // by her sails against the water's drag on her hull (physics.js hullStep:
    // m dv/dt = drive - ½ρv²C·S), so she gathers way slowly, carries it, and
    // coasts on when the sails come in — a heavier hull for longer
    if (oared) this.speed += (this.push - this.speed) * Math.min(1, dt * 1.6);
    // (her anchor down, or hove to with her sails backed against the wind: those
    // brake her hard — the chain's drag, the wind on the sails' fronts — and she
    // comes to rest in a few lengths rather than coasting on)
    else if (this.anchored || this.speedCap === 0) this.speed += (this.push - this.speed) * Math.min(1, dt * 1.2);
    else this.speed = hullStep(this.speed, this.push, this.def.speed * SEA_PACE, 2 + (this.def.length || 20) * 0.06, dt);
    // the water's height under the keel (up the mountain's canals) and the slope she's riding
    // (and, diving to Fish-Man Island, how far over or under it she is: zones.js)
    this.lvl = cur.level + (this.dive || 0);
    const along = cur.canal ? Math.cos(angleDiff(this.heading, Math.atan2(cur.y, cur.x))) : 0;
    const pitchT = Math.atan(cur.slope) * along;
    this.pitch = (this.pitch || 0) + (pitchT - (this.pitch || 0)) * Math.min(1, dt * 3);
    let vx = Math.cos(this.heading) * this.speed + cur.x;
    let vy = Math.sin(this.heading) * this.speed + cur.y;
    // heading follows strong currents a little (Reverse Mountain) — as far
    // as her hull has room to swing (a long ship's ends sweep wide: turned
    // into the rock, she'd be stuck there, and shoved out of it)
    if (cur.steer) {
      const turn = clamp(angleDiff(this.heading, Math.atan2(cur.y, cur.x)), -1, 1) * dt * cur.steer;
      for (const f of [1, 0.5, 0.25]) { if (this.fits(w, this.x, this.y, this.heading + turn * f)) { this.heading += turn * f; break; } }
    }
    const nx = w.wx(this.x + vx * dt), ny = this.y + vy * dt;
    // (hulls don't pass through each other: a ship alongside is as solid as a quay)
    const ok = (x, y) => this.fits(w, x, y, this.heading) && !this.shipIn(game, x, y, this.heading);
    if (ok(nx, ny)) {
      this.x = nx; this.y = ny;
    } else if (ok(nx, this.y)) {
      this.x = nx; this.scrape(game); this.speed *= 0.7;
    } else if (ok(this.x, ny)) {
      this.y = ny; this.scrape(game); this.speed *= 0.7;
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
      // (riding a canal's current she loses way at the wall, not bouncing back against the flow)
      this.speed *= cur.steer ? 0.5 : -0.25;
      // nudge out of the wall
      if (!this.fits(w, this.x, this.y, this.heading)) this.unstick(w);
    }
    // hulls that overlap (launched on top of each other, shoved together by a
    // current, a collision at speed) ease apart instead of sticking
    if (game.ships.length + theirShips(game).length > 1) this.separate(game, dt);
    // (the wake is drawn on the water by the 3D view: see render3d/ships3d.js WakeTrail)
    // carry the crew (and whoever's at the helm, so the view rides with her exactly)
    for (const p of this.passengers) { p.x = this.x; p.y = this.y + 0.01; }
    if (this.captain) { this.captain.x = this.x; this.captain.y = this.y; }
    // and everyone standing on the deck, turning with the ship
    this.carry(w, x0, y0, h0);
    this.hCarried = this.heading;
  }

  /**
   * Everyone standing on her deck rides with her, from where she was (x0, y0,
   * heading h0) to where she is now: each stays just where they stood on her,
   * turned as she's turned — and `also`, someone on their way up her side.
   * (As she sails, in her update; another player's ship, as she's drawn
   * here: see net/remote.js.)
   */
  carry(w, x0, y0, h0, also = null) {
    if (!this.aboard?.size && !also) return;
    const dh = angleDiff(h0, this.heading), c = Math.cos(dh), sn = Math.sin(dh);
    const ride = (a) => {
      const rx = w.dx(x0, a.x), ry = a.y - y0;
      a.x = w.wx(this.x + rx * c - ry * sn); a.y = this.y + rx * sn + ry * c;
      if (dh) a.facing += dh;
    };
    for (const a of this.aboard || []) {
      if (!a.alive || !a.deck || a.deck.ship !== this) { this.aboard.delete(a); continue; }
      ride(a);
    }
    if (also) ride(also);
  }

  /**
   * Steer her: `turn` is the helm you're asking for (-1 hard a-port … 1 hard
   * a-starboard, from the keys or a stick), `rate` how fast she turns hard
   * over (rad/s). The helm goes over and comes back easing in and out (no
   * snap), she answers it a moment later as her turn builds (and dies away
   * when it's back amidships), and the wheel spins with it — see BOAT_FEEL.
   */
  steer(turn, rate, dt) {
    const F = BOAT_FEEL, h = this.helm;
    // (going over — or over the other way — at the helmIn pace; back amidships at helmOut's)
    const back = Math.abs(turn) < Math.abs(h) - 1e-3 && Math.sign(turn) !== -Math.sign(h);
    const w = 4.74 / Math.max(0.02, back ? F.helmOut : F.helmIn);
    const o = springStep(h, this.helmV, clamp(turn, -1, 1), w, dt, 1, _sp);
    this.helm = o[0]; this.helmV = o[1];
    if (Math.abs(this.helm) > 1) { this.helm = Math.sign(this.helm); this.helmV = 0; }
    const lag = Math.max(0.01, F.turnLag + F.turnLagPerM * (this.def.length || 3));
    this.yawRate += (this.helm * rate * F.turnRate - this.yawRate) * (1 - Math.exp(-dt / lag));
    this.heading += this.yawRate * dt;
    const ww = springStep(this.wheel, this.wheelV, this.helm * F.wheelMax, F.wheelSpeed, dt, 1, _sp);
    this.wheel = ww[0]; this.wheelV = ww[1];
    this.steered = true;
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

  /** Another ship's hull where this one's would be at (x, y, h), if any (another player's among them). */
  shipIn(game, x, y, h) {
    const w = game.world;
    let pts = null;
    for (const o of allShips(game)) {
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

  /** Lying still: moored, anchored, hove to or just stopped — no way on her, no sail set, nobody rowing. */
  get still() { return this.anchored || (Math.abs(this.speed) < 0.3 && (this.sailSet || 0) < 0.05 && !this.rowing); }

  /**
   * Push away from any ship whose hull ours is inside. A ship lying still is
   * the rock: one under way that's come up against her gives way, and she
   * isn't shoved along by it (nothing moves a ship but her sails, her oars
   * and Reverse Mountain's currents); two lying on top of each other — just
   * launched so — both ease apart, unless one's yours: the other gives way.
   * (Another player's ship is never moved here: their game sails her.)
   */
  separate(game, dt) {
    const w = game.world;
    let pts = null;
    const still = this.still, mine = this.owner === 'player';
    for (const o of allShips(game)) {
      if (o === this || o.sunk || o.alive === false || (still && (!o.still || (mine && o.owner !== 'player')))) continue;
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
      const k = Math.min(4, 1 + inside * 0.35);
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
    if (far && !big) {
      // (a small boat found up on the land: to the nearest water she'll float in, any way round)
      for (let r = 0.5; r < 40; r += 0.5) {
        for (let a = 0; a < TAU; a += Math.min(0.5, 1.5 / r)) {
          const x = w.wx(this.x + Math.cos(a) * r), y = this.y + Math.sin(a) * r;
          for (let k = 0; k < 4; k++) {
            const h = this.heading + (k * Math.PI) / 2;
            if (this.fits(w, x, y, h) && !(this.game && this.shipIn(this.game, x, y, h))) { this.x = x; this.y = y; this.heading = h; return true; }
          }
        }
      }
      return false;
    }
    // (a nudge — her hull scraping a rock, a root, a quay — eases her the least
    // way out of it, astern first, then either side: never a jump across the water)
    if (!far) {
      const back = this.heading + Math.PI;
      for (let r = 0.25; r <= (big ? 4 : 2.5); r += 0.25) {
        for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.25, -1.25, 1.7, -1.7, 2.3, -2.3, Math.PI]) {
          const x = w.wx(this.x + Math.cos(back + da) * r), y = this.y + Math.sin(back + da) * r;
          if (this.fits(w, x, y, this.heading) && !(this.game && this.shipIn(this.game, x, y, this.heading))) { this.x = x; this.y = y; return true; }
        }
      }
    }
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
   * Afloat off a beach: the nearest spot out from (x, y) toward bearing `dir`
   * (or a little either side of it) where her whole hull's in the water, her
   * bow out to sea. False if there's none within 40 m.
   */
  launchFrom(w, x, y, dir) {
    if (dir === null || dir === undefined) return false;
    for (let r = this.def.length * 0.5; r < this.def.length * 0.5 + 40; r += 0.5) {
      for (const da of [0, 0.2, -0.2, 0.45, -0.45, 0.75, -0.75]) {
        const h = dir + da, px = w.wx(x + Math.cos(h) * r), py = y + Math.sin(h) * r;
        if (this.fits(w, px, py, h) && !(this.game && this.shipIn(this.game, px, py, h))) { this.x = px; this.y = py; this.heading = h; return true; }
      }
    }
    return false;
  }

  /**
   * A big ship berths at a pier head with her waist to its planks — the main
   * deck, where her rail's lowest: a jump from the pier — never her tall
   * quarterdeck while there's a berth that keeps her waist there. Alongside
   * the head, bow out to sea, as far out as that lets her lie; or, where the
   * water by the pier's too shallow for her stern, across the end of the head
   * out in the deep water, her waist (and her ladder) to its face; or bow in.
   * Only when none of those will take her, alongside further out.
   */
  berth(w, dock) {
    const B = this.def.beam, d = shipDims(this.def);
    const dx = dock.dirX ?? 0, dy = dock.dirY ?? 1, hd = Math.atan2(dy, dx);
    const end = dock.end || dock, hh = dock.headHalf ?? 1, ex = end.x + 0.5, ey = end.y + 0.5;
    // (her main deck along her, from amidships: clear of the stairs at either end)
    const m0 = xAt(d, d.mainT0 ?? 0.3) + 0.8, m1 = xAt(d, d.mainT1 ?? 0.84) - 0.8;
    const lie = (x, y, h) => {
      if (!this.fits(w, x, y, h) || (this.game && this.shipIn(this.game, x, y, h))) return false;
      this.x = x; this.y = y; this.heading = h;
      return true;
    };
    // alongside the head (its planks run from 0.5 m past the end tile's middle
    // to 2.5 m short of it), her side 0.9 m off its edge; `along`: her middle
    // out from the end tile's
    const off = B * 0.5 + hh + 1.4;
    const beside = (along, h) => [1, -1].some((sg) => lie(w.wx(ex + dx * along - dy * sg * off), ey + dy * along + dx * sg * off, h));
    // 1. bow out, the whole head beside her main deck (u = -along - 2.5 .. -along + 0.5)
    for (let along = -m0 - 2.5; along >= 0.5 - m1; along -= 0.5) if (beside(along, hd)) return true;
    // 2. bow out still, a metre or more of the head's end beside her main deck
    // at least (jumped from there: off her, onto the head's breadth of planks)
    // — better than bow in: you sail straight off, no turning her round in the shallows
    for (let along = -m0 - 2; along <= -m0 - 0.5; along += 0.5) if (beside(along, hd)) return true;
    // 3. bow in, the whole head beside her main deck (u = along - 0.5 .. along +
    // 2.5): she lies further out so, her stern in the deep water and her bow
    // tapering in toward the shallows
    for (let along = m1 - 2.5; along >= m0 + 0.5; along -= 0.5) if (beside(along, hd + Math.PI)) return true;
    // (or bow in, the head's end beside the forward end of her main deck)
    for (let along = m1 - 2; along <= m1 - 0.5; along += 0.5) if (beside(along, hd + Math.PI)) return true;
    // 4. across the end of the head: her side 0.9 m off its face, the middle
    // of the face (the pier's walkway behind it) at her ladder on that side, or
    // the middle of her main deck, or as near it as she'll lie with 2.5 m of
    // her waist at the face
    const mid = (m0 + m1) / 2, face = hh + 0.5;
    const out = 0.5 + 0.9 + B * 0.5;
    for (const sd of [1, -1]) {
      const h = Math.atan2(dx, -dy) + (sd > 0 ? 0 : Math.PI), fx = Math.cos(h), fy = Math.sin(h);
      const lad = d.ladders?.find((l) => l.s === sd);
      const cs = lad && lad.u > m0 - face + 2.5 && lad.u < m1 + face - 2.5 ? [lad.u] : [];
      for (let k = 0; k < 40; k++) {
        const c = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
        if (Math.min(c + face, m1) - Math.max(c - face, m0) >= 2.5) cs.push(c);
      }
      for (const c of cs) if (lie(w.wx(ex + dx * out - fx * c), ey + dy * out - fy * c, h)) return true;
    }
    // 5. alongside further out, as near the head as she'll lie
    for (let k = 1; k < 26; k++) if (beside(-m0 - 2.5 + k * 2, hd)) return true;
    return false;
  }

  /**
   * A small ship ties up alongside a pier head, bow out to sea, her side a
   * short step from its edge (so you can step or jump down onto her deck).
   */
  moorAlongside(w, dock) {
    const L = this.def.length, B = this.def.beam;
    const dx = dock.dirX ?? 0, dy = dock.dirY ?? 1, hd = Math.atan2(dy, dx);
    const end = dock.end || dock, ex = end.x + 0.5, ey = end.y + 0.5;
    const lie = (x, y, h) => {
      if (!this.fits(w, x, y, h) || (this.game && this.shipIn(this.game, x, y, h))) return false;
      this.x = x; this.y = y; this.heading = h;
      return true;
    };
    for (const gap of [0.3, 0.6, 1]) {
      for (let k = 0; k < 6; k++) {
        // (beside the head — its planks from 0.5 m past the end tile's middle to
        // 2.5 m short of it — or, lying further in, the narrower pier's edge)
        const along = 0.3 - L / 2 - k * 1.2;
        const edge = (along + L / 2 > -2.5 ? dock.headHalf ?? 1 : dock.half ?? 1) + 0.5;
        for (const sg of [1, -1]) {
          const off = sg * (edge + gap + B / 2);
          if (lie(w.wx(ex + dx * along - dy * off), ey + dy * along + dx * off, hd)) return true;
        }
      }
    }
    // (no room beside it: across the end of the head, her side to its face)
    for (const gap of [0.3, 0.6, 1]) {
      for (const sd of [1, -1]) {
        const h = Math.atan2(dx, -dy) + (sd > 0 ? 0 : Math.PI), out = 0.5 + gap + B / 2;
        for (const c of [0, 1.5, -1.5, 3, -3]) if (lie(w.wx(ex + dx * out - Math.cos(h) * c), ey + dy * out - Math.sin(h) * c, h)) return true;
      }
    }
    return false;
  }

  /** A glancing knock along rock or another hull: a grinding scrape (yours, and only now and then). */
  scrape(game) {
    const now = performance.now() / 1000;
    if (this.owner !== 'player' || Math.abs(this.speed) < 1.5 || (this.scrapeT || 0) > now) return;
    this.scrapeT = now + 1.2;
    game.audio?.sfx('scrape', this, { s: Math.min(1.4, Math.abs(this.speed) / 6) });
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
