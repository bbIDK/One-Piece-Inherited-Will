// The foley director: it watches the game every frame and plays what's due —
// the sounds nobody asks for by name because they come from what's happening
// rather than from a single event:
//
//   * at the oars: each stroke's catch, drive and release, on the boat's own
//     stroke (ship.rowPh), the port and starboard oars each on their side;
//   * under sail: the canvas going up or coming down, the anchor let go or
//     weighed, the wheel's spokes clicking as she turns, the hull's groans and
//     the rigging's creaks, the water past the hull and the wind in the sails;
//   * swimming: strokes in time with the arms you see (the breaststroke's pull
//     and kick), treading water, thrashing (a Devil Fruit user), diving under
//     (the whole mix goes muffled) and breaking the surface; wet feet after;
//   * on foot: landings by what's underfoot, ladders rung by rung, a scramble
//     up a ledge, a heartbeat when your health runs low in a fight;
//   * the ambience: which beds, how loud, and which spots, for where you are;
//   * the menus opening and closing, quests taken and done, a bounty raised.
//
// It only reads the game (game events and state); the one-shot sounds the
// game code asks for itself go through audio.sfx as before.
import { TAU } from '../core/math.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Did a phase going round 0..1 pass `x` between `a` and `b`? */
const crossed = (a, b, x) => (a <= b ? a < x && x <= b : a < x || x <= b);
// climates with trees and birds in them
const LEAFY = { temperate: 1, spring: 1, autumn: 1, jungle: 1, tropical: 1, sakura: 1, mangrove: 1, prehistoric: 1, marsh: 1 };

export class Foley {
  constructor(audio) {
    this.audio = audio;
    this.game = null;
    this.t = 0;
    this.ambT = 0;
    this.coast = 0;
    this.coastT = 0;
    this.surfT = 4;
    this.under = false;
    this.shelter = 0;
  }

  get A() { return this.audio; }

  attach(game) {
    if (this.game === game) return;
    this.game = game;
    const A = this.audio;
    // (every handler guarded: the sound must never take the game down with it)
    const on = (ev, fn) => game.on(ev, (...a) => {
      try { if (A.ready()) fn(...a); } catch (e) { if (!this.warned) { this.warned = true; console.warn('foley', ev, e); } }
    });
    on('tick', (dt) => this.tick(dt));
    on('playerLand', (impact) => this.land(impact));
    on('playerClimb', () => { this.climbT = 0; if (!this.game.player?.climb?.ladder) A.sfx('climb', null, { surf: this.surf() }); });
    on('playerHit', () => A.director?.heat(0.05));
    on('playerHurt', () => A.director?.heat(0.07));
    on('knockout', (a) => { if (a && !a.isPlayer && a.faction !== 'player') A.director?.ko(false); });
    on('bossDefeated', () => A.director?.ko(true));
    on('shipSunk', (s) => { if (s?.owner !== 'player') A.director?.ko(false); });
    on('questStarted', () => A.sfx('quest_accept'));
    on('questStage', () => A.sfx('quest_update'));
    on('questDone', () => A.sfx('quest_complete'));
    on('pickup', () => A.sfx('pickup'));
    on('foraged', () => A.sfx('forage'));
    on('logSet', () => A.sfx('logset'));
    on('bountyChanged', (b, first) => {
      // (a raise worth a poster: the first, or a tenth more)
      if (first || (b > (this.bounty || 0) * 1.1 && b - (this.bounty || 0) > 1e6)) A.sfx('bounty');
      this.bounty = b;
    });
    game.on('characterStart', () => { this.bounty = game.state?.char?.bounty || 0; this.techs = null; });
  }

  /** What the player stands on, for a jump, a landing or a scramble. */
  surf() {
    const g = this.game, p = g?.player;
    if (!p) return 'dirt';
    try { return p.footSurface ? p.footSurface(g) : 'dirt'; } catch { return 'dirt'; }
  }

  /** A landing from a jump or a fall (`impact` the speed coming down; the big ones the game plays itself). */
  land(impact) {
    const g = this.game, p = g.player;
    this.landEv = g.time;
    if (!p || p.inWater || impact > 9) return;
    this.audio.sfx('land', null, { surf: this.surf(), s: Math.min(1.1, 0.35 + impact / 9) });
  }

  // ------------------------------------------------------------ every frame
  tick(dt) {
    const A = this.audio, g = this.game, p = g?.player;
    if (!p || !A.ready()) return;
    this.t += dt;
    this.ship(dt, p, g);
    this.swim(dt, p, g);
    this.feet(dt, p, g);
    // the drawn weapon, for the next 'equip' (see audio.js)
    A.lastDrawn = !!p.drawn;
  }

  /** Oars, sails, anchor, helm, creaks: the player's own boat. */
  ship(dt, p, g) {
    const A = this.audio, s = p.mode === 'sail' ? p.ship : p.deck?.ship || null;
    const mine = s && (s === p.ship || s.owner === 'player');
    if (!s || !mine || s.sunk) { this.rowPh = null; this.sailWas = null; this.anchWas = null; this.hd = null; return; }
    const atHelm = p.mode === 'sail' && s.captain === p;
    const yaw = A.yaw();
    const sidePan = (side) => Math.max(-0.6, Math.min(0.6, Math.sin(s.heading + side * Math.PI / 2 - yaw) * 0.6));
    if (s.def.oarsOnly) {
      // a rowboat: the stroke itself (both oars together; a turn pulls one)
      const stroking = s.rowL || s.rowR;
      if (stroking) {
        const ph = s.rowPh, prev = this.rowPh ?? -0.01;
        const tempo = 0.55 + 0.45 * Math.min(1, Math.max(Math.abs(s.rowL), Math.abs(s.rowR)));
        for (const [pull, side] of [[s.rowL, -1], [s.rowR, 1]]) {
          if (!pull) continue;
          const k = { s: 0.6 + 0.4 * Math.abs(pull), pan: sidePan(side) };
          if (crossed(prev, ph, 0.02)) A.sfx('oar_catch', null, k);
          if (crossed(prev, ph, 0.1)) A.sfx('oar_pull', null, { ...k, dur: 0.44 * 1.15 / tempo });
          if (crossed(prev, ph, 0.53)) A.sfx('oar_release', null, k);
        }
        this.rowPh = ph;
      } else this.rowPh = null;
    } else {
      // sails set and struck, the anchor, the oars of a ship rowed by hand (Space)
      const set = (s.sail || 0) > 0.04;
      if (this.sailWas != null && set !== this.sailWas && atHelm) A.sfx(set ? 'sail_raise' : 'sail_lower', s);
      this.sailWas = set;
      if (s.rowing) {
        this.sweepPh = ((this.sweepPh ?? -0.01) + dt / 1.6);
        if (this.sweepPh >= 1 || this.sweepPh < 0) {
          this.sweepPh = this.sweepPh >= 1 ? this.sweepPh - 1 : 0;
          for (const side of [-1, 1]) { A.sfx('oar_catch', null, { s: 0.8, pan: sidePan(side) }); A.sfx('oar_pull', null, { s: 0.7, pan: sidePan(side), dur: 0.7 }); }
        }
      } else this.sweepPh = null;
      // the wheel: a spoke's click for every tenth of a radian she turns under you
      if (atHelm) {
        if (this.hd != null) {
          this.turn = (this.turn || 0) + Math.abs(wrap(s.heading - this.hd));
          if (this.turn > 0.1) { this.turn = 0; A.sfx('helm', null, { pan: 0 }); }
        }
        this.hd = s.heading;
      } else this.hd = null;
    }
    if (this.anchWas != null && s.anchored !== this.anchWas && (atHelm || p.deck)) A.sfx(s.anchored ? 'anchor_drop' : 'anchor_weigh', s);
    this.anchWas = s.anchored;
    // the boat working: timbers groaning, the rigging creaking, waves slapping her
    const storm = g.env?.storm || 0, sp = Math.abs(s.speed || 0);
    const big = (s.def.length || 6) > 9;
    if (Math.random() < dt * (0.08 + storm * 0.5 + sp * 0.01) * (big ? 1.4 : 0.8)) A.sfx('hull_creak', null, { s: big ? 1.1 : 0.7, pan: rnd(-0.6, 0.6) });
    if (!s.def.oarsOnly && Math.random() < dt * (0.06 + storm * 0.3 + (s.sailSet || 0) * 0.08)) A.sfx('rigging', null, { pan: rnd(-0.5, 0.5) });
    if (Math.random() < dt * (0.12 + storm * 0.4 + sp * 0.015)) A.sfx('hull_slap', null, { s: Math.min(1.2, 0.4 + sp * 0.06 + storm * 0.6), pan: rnd(-0.7, 0.7) });
  }

  /** Swimming: strokes, treading, thrashing, diving and surfacing. */
  swim(dt, p, g) {
    const A = this.audio;
    const under = !!p.under;
    if (under !== this.under) {
      // the plunge: the mix goes dull (and comes back as the head breaks the surface)
      A.E.setMuffle(under ? 1 : 0, under ? 0.18 : 0.35);
      if (under) A.sfx('dive');
      else if (p.inWater && !p.lowAir) A.sfx('surface');
      this.under = under;
    }
    if (!p.inWater) {
      if (this.wasIn) this.wetUntil = this.t + 9;
      this.wasIn = false; this.swimPh = null;
      return;
    }
    this.wasIn = true;
    const df = !!p.fruit && !p.gills;
    if (df) {
      // a Devil Fruit user thrashing to keep their head up
      if (!p.sinking && Math.random() < dt * 3.2) A.sfx('thrash');
      return;
    }
    const moving = p.moving || !!p.intent?.mz;
    if (!moving) {
      if (!under && Math.random() < dt * 0.75) A.sfx('tread');
      this.swimPh = null;
      return;
    }
    // the stroke: in first person the arms you see (their own phase), else the body's (see render/anims.js swimPose)
    const vm = g.view3d?.vm;
    let ph;
    if (vm && vm.root?.visible && vm.swimPh != null) ph = (((vm.swimPh / TAU) % 1) + 1) % 1;
    else if (under) ph = ((((g.env?.time || 0) + (p.seed || 0)) * 2.3 / TAU) % 1 + 1) % 1;
    else ph = ((((g.env?.time || 0) + (p.seed || 0)) * (p.gills ? 5.5 / 3.6 : 1) * 3.6 / TAU) % 1 + 1) % 1;
    const prev = this.swimPh ?? ph;
    const fp = !!(vm && vm.root?.visible);
    // (first person: the pull is as the arms sweep out, the kick as they come back in; third: the breaststroke's own beats)
    const pullAt = fp ? 0.02 : 0.22, kickAt = fp ? 0.5 : 0.52;
    if (under) {
      if (crossed(prev, ph, pullAt)) A.sfx('swim_under');
    } else {
      if (crossed(prev, ph, pullAt)) A.sfx('swim_pull');
      if (crossed(prev, ph, kickAt)) A.sfx('swim_kick');
      if (crossed(prev, ph, 0.34) && Math.random() < 0.6) A.sfx('swim_breath');
    }
    this.swimPh = ph;
  }

  /** Feet: small landings the game doesn't announce, ladders rung by rung, the low-health heartbeat. */
  feet(dt, p, g) {
    const A = this.audio;
    if (p.lastLanded !== this.lastLanded) {
      // (not into the water: that's a splash, and the game makes it)
      const wet = p.inWater || (p.waterUnder ? p.waterUnder(g) > 0 : false);
      if (this.lastLanded != null && p.lastLanded !== this.landEv && !wet) A.sfx('land', null, { surf: this.surf(), s: 0.35 });
      this.lastLanded = p.lastLanded;
    }
    const c = p.climb;
    if (c) {
      this.climbT = (this.climbT || 0) + dt;
      if (c.ladder && this.climbT > 0.32) { this.climbT = 0; A.sfx('step', null, { creak: Math.random() < 0.3 }); }
    }
    // doki... doki...: your heart, when a fight has you on your last legs
    if (p.inCombat && p.d && p.hp > 0 && p.hp / p.d.maxHp < 0.25 && p.state === 'idle') {
      this.beatT = (this.beatT || 0) - dt;
      if (this.beatT <= 0) { this.beatT = 0.85; A.sfx('heartbeat'); }
    }
  }

  /** Wet feet: how wet (1 just out of the sea … 0 dry again). */
  wet() { return this.wetUntil > this.t ? Math.min(1, (this.wetUntil - this.t) / 6) : 0; }

  // ------------------------------------------------------------ the ambience (a few times a second)
  /** Work out the beds and spots for where the player is (`w` the director's picture of it). */
  ambience(dt, w) {
    const A = this.audio, g = this.game, p = g?.player, amb = A.amb;
    if (!amb) return;
    const L = {}, S = {};
    if (!p || w?.title) {
      // the title: the East Blue lapping at Dawn Island, a gull now and then
      L.ocean = 0.35; L.wind = 0.08; S.gull = 2;
      amb.update(L, S, dt);
      this.setShelter(0);
      return;
    }
    const env = g.env || {}, night = !!w.night, storm = env.storm || 0;
    const zone = w.zone, isl = w.island, clim = isl?.def?.climate || (zone === 'sky' ? 'sky' : null);
    // sheltered: indoors, or below decks
    const inside = !!(g.world?.interiorAt?.(p.x, p.y) || g.view3d?.isUnder);
    this.setShelter(inside ? 1 : 0);
    const ship = p.mode === 'sail' ? p.ship : p.deck?.ship || null;
    const atSea = !!ship || p.inWater || (!isl && zone === 'surface');
    // how much sea is round about (checked every half second: eight points out to 30 m)
    this.coastT -= dt;
    if (this.coastT <= 0 && zone !== 'sky') {
      this.coastT = 0.5;
      let wet = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU, r = 12 + (i % 2) * 16;
        if (g.world.isLiquid?.(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)) wet++;
      }
      this.coast = wet / 8;
    }
    const calm = w.seaId === 'calm_belt' && zone === 'surface';
    if (zone === 'surface') {
      L.ocean = (atSea ? 0.55 : this.coast * 0.5) * (calm ? 0.4 : 1) * (1 + storm * 0.6);
      L.wind = calm ? 0.04 : ((env.windStrength || 1) * 0.18 + storm * 0.35) * (atSea ? 1.2 : 0.75);
      L.howl = storm > 0.5 ? (storm - 0.5) * 0.9 : 0;
      L.rain = (env.rain || 0) * 0.75;
      if (env.snow > 0.05) L.wind += env.snow * 0.15;
    }
    if (zone === 'sky') { L.sky = 0.45; L.wind = 0.12; }
    if (zone === 'undersea') { L.deep = 0.35; S.bubbles = 4; S.whale = 0.8; }
    if (zone === 'prison') {
      L.deep = 0.15; S.drip = 6; S.chains = 1.5;
      if (/level4/.test(isl?.id || '')) { L.fire = 0.4; S.embers = 6; }
      if (/level5/.test(isl?.id || '')) L.howl = 0.25;
    }
    if (w.rm) L.torrent = 0.9;
    if (p.under) { L.deep = 0.7; S.bubbles = 10; L.ocean = 0; L.wind = 0; L.rain = 0; L.howl = 0; }
    // land: towns, forests, jungles
    if (isl && !atSea) {
      const leafy = LEAFY[clim];
      if (w.town) {
        L.town = (night ? 0.18 : 0.55);
        S.voice = night ? 3 : 10; S.laugh = night ? 1 : 2; S.clink = night ? 0 : 2; S.dog = 0.8;
      } else if (leafy) {
        L.leaves = 0.2 * (env.windStrength || 1);
        if (!night) { S.bird = clim === 'jungle' || clim === 'tropical' ? 3 : 6; if (clim === 'jungle' || clim === 'tropical' || clim === 'prehistoric') { S.tropical = 3; L.cicada = 0.3; } }
        else { L.cricket = 0.28; S.owl = 1.2; if (clim === 'marsh' || clim === 'jungle' || clim === 'mangrove') S.frog = 3; }
      }
      if (clim === 'volcanic') { L.fire = 0.25; S.embers = 3; }
      if (night && w.town && LEAFY[clim]) L.cricket = 0.15;
    }
    // gulls over the coasts of the Blues and Paradise by day
    if (zone === 'surface' && !night && !calm && !p.under && (this.coast > 0.1 || (atSea && isl)) && w.seaId !== 'new_world') S.gull = 3 + this.coast * 4;
    if (calm && atSea) S.moan = 0.5;
    if (isl?.id === 'twin_cape') S.whale = 1;
    // the boat under you
    if (ship) {
      const sp = Math.abs(ship.speed || 0);
      L.hull = Math.min(0.7, sp / 14) * (inside ? 0.6 : 1);
      if (!ship.def.oarsOnly && (ship.sailSet || 0) > 0.05) {
        L.sails = Math.min(0.5, (ship.sailSet || 0) * (env.windStrength || 0) * 0.4);
        // (luffing: the wind from ahead and the canvas flogging)
        const rel = Math.cos(wrap(ship.heading - (env.windAngle || 0)));
        amb.luff(Math.max(0, -rel));
      }
    }
    // the shore: waves breaking now and then, louder the nearer the water
    if (zone === 'surface' && !ship && !p.inWater && this.coast > 0.05 && this.coast < 0.95 && !calm) {
      this.surfT -= dt;
      if (this.surfT <= 0) { this.surfT = rnd(6, 11) / (1 + storm); amb.spot('surf', { s: Math.min(1, this.coast * 1.6) * (1 + storm * 0.5), pan: rnd(-0.5, 0.5), far: 0.2 }); }
    }
    if ((env.rain || 0) > 0.4 && !inside) S.drops = 6 * env.rain;
    amb.update(L, S, dt);
  }

  setShelter(k) {
    if (k === this.shelter) return;
    this.shelter = k;
    this.audio.E.setShelter(k);
  }

  // ------------------------------------------------------------ the menus
  /** Panels and maps opening and closing (the game is paused then: this runs on the audio clock). */
  menus() {
    const ui = this.game?.ui;
    if (!ui) return;
    const n = (ui.stack?.length || 0) + (ui.mapOpen ? 1 : 0) + (ui.screenEl ? 1 : 0);
    if (this.menuN != null && n !== this.menuN) this.audio.sfx(n > this.menuN ? 'ui_open' : 'ui_close');
    this.menuN = n;
    // a technique newly learnt
    const c = this.game.state?.char;
    const k = c?.techniques?.length;
    if (k != null) { if (this.techs != null && k > this.techs) this.audio.sfx('unlock'); this.techs = k; }
  }
}

