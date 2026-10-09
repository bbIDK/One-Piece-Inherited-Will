// Hitboxes, projectiles and damage resolution.
//
// Canon rules implemented here:
//  * Logia users are intangible: physical hits pass through them unless the
//    attacker uses Armament Haki, Seastone, or the Logia's elemental weakness
//    (water for Crocodile's sand, rubber vs lightning — Luffy's fists land on
//    Enel —, magma beats fire...). Nor does a Logia's body escape the
//    surgeon inside his ROOM, or a blow that ruins it from the inside.
//  * A Special Paramecia that acts like a Logia (Katakuri's mochi) lets some
//    blows pass through a hole it makes in itself.
//  * Rubber (Gomu Gomu) shrugs off blunt force and lightning.
//  * A barrier (Bari Bari) stops anything that comes at its front; Repel and
//    Balloon send shots back; a Black Hole swallows them (powers.js).
//  * Up in the air (flight.js): shots and beams reach a flier, a blow only
//    one about level with it; a heavy blow knocks it out of the sky.
//
// Guarding (the numbers are in difficulty.js, by where the fight is):
//  * Holding block (F) takes a blow from the front for a little chip damage.
//  * A PARRY: the guard raised on a fresh press of F just before the blow
//    lands (within the tier's window; mashing F doesn't count — see
//    Actor.setBlock). The attacker reels, posture broken, whatever else of
//    that move was swinging stops, and your next blow on them within the reel
//    is a COUNTER: more damage, through any guard, staggering even a boss.
//    The first sliver of the window is a PERFECT parry: a beat of slow
//    motion, a longer reel, a harder counter, and health and Haki back.
//  * Guard-breaking blows (the red glint) smash a guard aside instead — they
//    can't be parried: dodge them. Unblockable ones go straight through it.
//    A blast (an explosion, a field of something) can be blocked, never parried.
//  * A sword can turn a shot aside with a parry (one that doesn't go off).
//  * A dodge at the last instant through a heavy blow is a PERFECT DODGE: a
//    lesser counter on the foe who overreached.
//  * No stun-locks: after a few blows in a row you break free for a moment.
import { angleDiff, clamp, TAU } from '../core/math.js';
import { hullGap, BIG_SHIP } from '../world/hull.js';
import { hostile } from './entity.js';
import { tierOf, PARRY } from './difficulty.js';
import { barrierStops, reflectShot, absorbShot } from './powers.js';
import { reachesUp, downFlyer } from './flight.js';
import { raceHit, unshakable } from './racial.js';
import { hardening, hasRyou, RYOU } from './haki.js';

const ELEMENT_COLORS = {
  physical: '#ffffff', fire: '#ff7b39', ice: '#9be7ff', lightning: '#fff176', sand: '#e1c16e', smoke: '#cfd8dc',
  light: '#fff9c4', magma: '#ff5722', dark: '#7e57c2', quake: '#e0f7fa', poison: '#aed581', water: '#4fc3f7', haki: '#9c27b0',
  slash: '#ecf0f1', explosion: '#ffab40', gas: '#b2dfdb', string: '#f8bbd0', wax: '#fff8e1', snow: '#ffffff', swamp: '#6d4c41',
};

// A flurry: blows landing on you each within FLURRY_GAP seconds of the last.
// Breaking free of one leaves you untouchable for BREAK_IFRAMES.
const FLURRY_GAP = 0.8;
const BREAK_IFRAMES = 0.6;

/**
 * How long after a guard comes up a blow from `att` can still be parried by
 * `tgt` (s), and the start of that which is perfect: the tier's, a little
 * tighter against a far stronger foe (and wider against a weaker one), a
 * little wider with Observation Haki on.
 */
export function parryWindow(game, att, tgt) {
  const T = tierOf(game, tgt);
  const ratio = att?.power && tgt.power ? att.power() / Math.max(1, tgt.power()) : 1;
  const k = clamp(1.1 - 0.1 * ratio, 0.85, 1.1);
  return { window: T.parry * k + (tgt.observation ? PARRY.observation : 0), perfect: T.perfect };
}

/** How heavy a blow is, ~0 (a jab) to 1.5 (a counter strike): what hit-stop, sparks and flinches are scaled by. */
export function blowWeight(att, tgt, h, final, crit, counter) {
  const def = h.def || (att && att.action ? att.action.def : null);
  const m1 = !!(def && def.m1Chain && !h.sprite);
  let w = m1 ? 0.22 : h.sprite ? 0.35 : 0.45;
  if (m1 && (h.knockback ?? 0) >= 3.2) w = 0.52;
  if (h.heavy) w = Math.max(w, 0.72);
  if (h.guardBreak) w += 0.06;
  if (h.impactFrame) w = Math.max(w, 1);
  const maxHp = tgt.d ? tgt.d.maxHp : 100;
  w += Math.min(0.3, (final / maxHp) * 1.2);
  if (crit) w += 0.22;
  if (h.interval) w *= 0.55;
  w = Math.min(1.25, w);
  return counter ? Math.min(1.5, w + 0.3) : w;
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.hitboxes = [];
    this.projectiles = [];
  }

  /** Register a hitbox that lives for `duration` seconds and hits each target once. */
  hitbox(h) {
    h.t = 0;
    h.duration = h.duration ?? 0.1;
    h.hit = h.hit || new Set();
    h.interval = h.interval || 0; // re-hit every N seconds (multi-hit)
    h.lastHit = new Map();
    this.hitboxes.push(h);
    return h;
  }

  projectile(p) {
    p.t = 0;
    p.hit = new Set();
    p.alive = true;
    p.traveled = 0;
    this.projectiles.push(p);
    return p;
  }

  /** Stop whatever of `a`'s blows are still swinging (a parried move: the rest of it never lands). */
  cancelBlows(a) {
    for (const h of this.hitboxes) if (h.owner === a && !h.blast) h.cancelled = true;
  }

  update(dt) {
    const game = this.game;
    const actors = game.actorsNear(game.player ? game.player.x : 0, game.player ? game.player.y : 0, 60);
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const h = this.hitboxes[i];
      if (h.cancelled) { this.hitboxes.splice(i, 1); continue; }
      h.t += dt;
      if (h.follow && h.owner && h.owner.alive) {
        h.x = h.owner.x + (h.offX || 0); h.y = h.owner.y + (h.offY || 0);
        if (h.followAngle) h.angle = h.owner.facing;
      }
      for (const a of actors) {
        if (h.cancelled) break;
        if (!this.canHit(h.owner, a, h)) continue;
        if (!this.overlaps(h, a)) continue;
        if (h.interval) {
          const last = h.lastHit.get(a.id);
          if (last !== undefined && h.t - last < h.interval) continue;
          h.lastHit.set(a.id, h.t);
        } else {
          if (h.hit.has(a.id)) continue;
          h.hit.add(a.id);
        }
        this.applyHit(h.owner, a, h);
      }
      if (h.hitShips && !h.cancelled) this.hitShips(h);
      if (h.owner?.isPlayer && !h.cancelled) this.hitDummies(h);
      if (h.t >= h.duration) this.hitboxes.splice(i, 1);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.homing && p.target && p.target.alive) {
        const want = Math.atan2(p.target.y - p.y, game.world.dx(p.x, p.target.x));
        const cur = Math.atan2(p.vy, p.vx);
        const na = cur + clamp(angleDiff(cur, want), -p.homing * dt, p.homing * dt);
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
      const sx = p.vx * dt, sy = p.vy * dt;
      p.x = game.world.wx(p.x + sx); p.y += sy;
      p.traveled += Math.hypot(sx, sy);
      if (p.trail) p.trail(p, game);
      if (p.isProj && !p.cued) this.shotGlint(p);
      let dead = p.traveled >= p.range || p.t > (p.life ?? 6);
      if (!p.passWalls && !dead) {
        const t = game.world.type(p.x, p.y);
        if (game.world.solid(p.x, p.y) || game.world.hitsProp(p.x, p.y, 0.04, true) || t === 25 || t === 26 || t === 27 || t === 41 || t === 50) dead = true;
      }
      // (swallowed by a Black Hole; sent back by a Repel or a Balloon)
      if (!dead && game.areaZones?.length && absorbShot(game, p)) dead = true;
      if (!dead) reflectShot(game, p, actors);
      if (!dead) {
        for (const a of actors) {
          if (p.hit.has(a.id) || !this.canHit(p.owner, a, p)) continue;
          if (game.world.dist2(p.x, p.y, a.x, a.y - 0.5) > (p.radius + a.r + 0.2) ** 2) continue;
          p.hit.add(a.id);
          p.angle = Math.atan2(p.vy, p.vx);
          this.applyHit(p.owner, a, p);
          // (a barrier stops even a shot that goes through people)
          if (!p.pierce || p.stopped) { dead = true; break; }
        }
        if (p.hitShips && !dead) {
          for (const s of game.ships) {
            if (s === p.ownerShip || s.sunk) continue;
            const on = s.def.length >= BIG_SHIP ? hullGap(s, game.world.dx(s.x, p.x), p.y - s.y) < 0.5 + (p.radius || 0.3) : game.world.dist2(p.x, p.y, s.x, s.y) < (s.def.length * 0.45) ** 2;
            if (on) { s.damage(p.shipDamage ?? p.damage, p.owner, p); dead = true; break; }
          }
        }
      }
      if (dead) {
        p.alive = false;
        if (p.onEnd) p.onEnd(p, game);
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * A foe's shot about to reach you while you hold a sword: a glint on it,
   * a tier's cueLead before it gets to you — the moment to turn it aside.
   */
  shotGlint(p) {
    const game = this.game, pl = game.player, o = p.owner;
    if (!pl || !o || o.isPlayer || o.faction === 'player' || p.explodes || p.unblockable || pl.state !== 'idle') return;
    if (!pl.hasWeapon?.('sword') || !this.canHit(o, pl, p)) return;
    const dx = game.world.dx(p.x, pl.x), dy = pl.y - 0.5 - p.y, d = Math.hypot(dx, dy);
    const sp = Math.hypot(p.vx, p.vy) || 1;
    if ((dx * p.vx + dy * p.vy) / (d * sp || 1) < 0.85) return;
    const T = tierOf(game, pl);
    if (d / sp > T.cueLead) return;
    p.cued = true;
    const k = pl.observation ? 1 : T.cue;
    if (k > 0) game.fx.parryCue?.({ x: p.x, y: p.y, z: 0.9, follow: p }, false, k * 0.8);
  }

  canHit(owner, target, h) {
    if (!target.alive || target === owner) return false;
    if (target.state === 'dead') return false;
    if (target.state === 'knocked' && !h.hitsDowned) return false;
    if (h.friendly) return false;
    if (owner && owner.faction === 'player' && target.faction === 'player') return false;
    if (!owner) return true;
    if (target.invulnerable) return false;
    // up on a big ship's quarterdeck, out of reach of a blade swung on the main deck below (shots and blasts still carry)
    if (owner.deck && target.deck && owner.deck.ship === target.deck.ship && h.vx === undefined && !h.radial) {
      if (Math.abs(owner.deck.h + (owner.z || 0) - target.deck.h - (target.z || 0)) > 1.6) return false;
    }
    // (a Room technique reaches what's inside the ROOM, nothing beyond it)
    if (h.room && this.game.world.distance(h.room.x, h.room.y, target.x, target.y) > h.room.r + (target.r || 0.3)) return false;
    // (up in the air: a blow reaches only what's about level with it)
    if ((owner.flying || target.flying) && !reachesUp(owner, target, h, this.game)) return false;
    return hostile(owner, target) || (owner.isPlayer && target.provoked) || (target.isPlayer && owner.provoked) || h.hitsAll;
  }

  /**
   * Training dummies: a blow of yours that lands on one thumps it (straw
   * flies), and every blow is practice — a little mastery in the style and
   * weapon you hit it with, up to the basics (a dummy can't teach more: see
   * DUMMY_CAP). No timer, no limit a day: train as long as you like.
   */
  hitDummies(h) {
    const g = this.game, w = g.world;
    const near = w.objects?.near?.(h.x, h.y, (h.range || 1) + 1.2, (o) => o.kind === 'dummy');
    if (!near?.length) return;
    for (const o of near) {
      const key = o.key || `${Math.round(o.x * 10)}_${Math.round(o.y * 10)}`;
      if ((h.dummies ||= new Set()).has(key)) continue;
      if (!this.overlaps(h, { x: o.x, y: o.y + 0.4, r: 0.35 })) continue;
      h.dummies.add(key);
      g.progression?.dummyHit?.(h);
      g.audio?.sfx('punch', { x: o.x, y: o.y }, { w: 0.4 });
      g.fx.burst(o.x, o.y - 0.2, 7, { color: ['#d4ac0d', '#e8d5b5'], speed: 2.5, vz: 2.5, g: 9, life: 0.5 });
      o.struck = g.time;
    }
  }

  overlaps(h, a) {
    const w = this.game.world;
    const dx = w.dx(h.x, a.x), dy = (a.y - 0.4) - h.y;
    const d = Math.hypot(dx, dy);
    const rr = a.r + 0.15;
    if (h.shape === 'circle') return d <= h.range + rr;
    if (h.shape === 'arc') {
      if (d > h.range + rr) return false;
      if (d < rr + 0.4) return true;
      return Math.abs(angleDiff(h.angle, Math.atan2(dy, dx))) <= h.arc / 2 + rr / Math.max(d, 0.1);
    }
    if (h.shape === 'line') {
      const ca = Math.cos(h.angle), sa = Math.sin(h.angle);
      const along = dx * ca + dy * sa;
      const perp = Math.abs(-dx * sa + dy * ca);
      return along >= -rr && along <= h.range + rr && perp <= h.width / 2 + rr;
    }
    if (h.shape === 'ring') return Math.abs(d - h.range) <= (h.width || 1) / 2 + rr;
    return false;
  }

  hitShips(h) {
    for (const s of this.game.ships) {
      if (s.sunk || s === h.ownerShip) continue;
      if (h.hitShipSet && h.hitShipSet.has(s.id)) continue;
      const d = this.game.world.distance(h.x, h.y, s.x, s.y);
      if (s.def.length >= BIG_SHIP ? hullGap(s, this.game.world.dx(s.x, h.x), h.y - s.y) < h.range : d < h.range + s.def.length * 0.4) {
        h.hitShipSet = h.hitShipSet || new Set();
        h.hitShipSet.add(s.id);
        s.damage((h.shipDamage ?? h.damage * 0.5), h.owner, h);
      }
    }
  }

  /** Resolve one hit. `h` carries damage, element, knockback, stun, status. */
  applyHit(att, tgt, h) {
    const game = this.game;
    const fx = game.fx;
    const now = game.env ? game.env.time : game.time;
    const el = h.element || 'physical';
    const isPlayerInvolved = (att && att.isPlayer) || tgt.isPlayer;
    const ang = h.angle ?? (att ? Math.atan2(tgt.y - att.y, game.world.dx(att.x, tgt.x)) : 0);
    const kbAng = h.shape === 'circle' || h.radial ? Math.atan2(tgt.y - h.y, game.world.dx(h.x, tgt.x)) : ang;

    // dodge i-frames (and the moment after a parry or breaking free: nothing gets through, quietly)
    if (tgt.iframes > 0) {
      const quiet = (game.time || 0) < (tgt.quietUntil ?? -1);
      // a dodge at the last instant through a heavy, guard-smashing blow: the
      // foe overreaches, and your next blow on them is a counter (a lesser one;
      // foes earn it too, but never in the Blues)
      const d = tgt.dash;
      const perfect = !quiet && !!att && !!d?.dodge && d.t0 - d.t <= PARRY.dodgeWindow && (h.guardBreak || h.unblockable || h.heavy) && h.vx === undefined && !h.blast
        && att.state === 'idle' && game.world.distance(att.x, att.y, tgt.x, tgt.y) < 4 && (tgt.isPlayer || tierOf(game, tgt).npcParry > 0);
      if (perfect) {
        tgt.counterOn = att; tgt.counterLeft = PARRY.dodgeCounter; tgt.counterMul = PARRY.dodgeCounterMul;
        fx.perfectDodge?.(tgt, att);
        if (tgt.isPlayer) game.hint('perfectdodge', 'PERFECT DODGE! Slipping a heavy blow at the last instant leaves them overreaching — your next strike is a COUNTER.');
      } else if (!quiet && (tgt.isPlayer || att?.isPlayer)) fx.text(tgt.x, tgt.y - 1.2, 'DODGE', '#b2ebf2', 0.32);
      if (!quiet && tgt.isPlayer) game.emit('playerEvaded', att, h);
      return false;
    }
    // Observation Haki: the blow heard before it comes, and slipped — a step
    // aside out of its path, an afterimage left standing in it, a beat of slow
    // motion (FORESIGHT: combatfx.js foresightFx)
    if (tgt.observation && tgt.hakiLevel('observation') > 0 && !h.unblockable) {
      const lvl = tgt.hakiLevel('observation');
      const chance = 0.12 + lvl * 0.0035 - (att?.observation ? 0.15 : 0);
      if (Math.random() < chance && tgt.haki >= 4) {
        tgt.haki -= 4;
        tgt.iframes = 0.2;
        const side = ang + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        if (tgt.state === 'idle' && !tgt.onShip && !tgt.climb) tgt.knock(Math.cos(side) * 4.5, Math.sin(side) * 4.5);
        fx.foresight?.(tgt, att);
        game.audio?.sfx('foresight', tgt);
        if (tgt.isPlayer) game.emit('playerEvaded', att, h);
        return false;
      }
    }

    // a barrier: whatever comes at its front stops dead
    if (barrierStops(game, tgt, att, h)) {
      h.stopped = true;
      fx.ring(tgt.x + Math.cos(tgt.facing) * 0.6, tgt.y + Math.sin(tgt.facing) * 0.45, 0.1, 1, '#b3e5fc', 0.25, 0.08, { z: 0.9, flat: 0.4, add: true });
      if (isPlayerInvolved) fx.text(tgt.x, tgt.y - 1.3, 'BARRIER', '#b3e5fc', 0.32);
      game.audio?.sfx('block', tgt);
      return false;
    }
    // Logia intangibility (Ryou, a master's Armament pushed into what it hits, reaches one as well)
    const ryou = !!att && hasRyou(att) && h.vx === undefined && !h.isProj && (!h.element || h.element === 'physical');
    const armed = att && (att.armament || h.haki || h.seastone);
    const lg = tgt.fruitDef && tgt.fruitDef.logia ? tgt.fruitDef : tgt.fakeLogia || null;
    if (lg && !tgt.seastoned && (lg === tgt.fakeLogia ? tgt.state !== 'knocked' && !tgt.inWater && !tgt.status.freeze : tgt.intangibleOK())) {
      const weakness = lg.weakTo || [];
      // (an elemental weakness; sea water on them, or on the hands hitting
      // a sand body; a rubber body — what lightning can't touch can touch it)
      const counters = weakness.includes(el) || (el === 'water' && tgt.status.wet) || (att && att.status.wet && weakness.includes('water')) || (!!att?.fruitDef?.rubber && weakness.includes('rubber'));
      if (!armed && !counters && !h.trueDamage && !h.ignoreLogia) {
        fx.burst(tgt.x, tgt.y - 0.7, 8, { color: lg.color || '#fff', speed: 3, g: 0, life: 0.35, kind: 'smoke', size: 0.2 });
        if (isPlayerInvolved) fx.text(tgt.x, tgt.y - 1.3, 'INTANGIBLE', lg.color || '#fff', 0.3);
        if (att && att.isPlayer) game.hint('logia', att.hakiUnlocked?.() ? 'Logia users are intangible. Use Armament Haki, Seastone, or their elemental weakness to hit them.' : 'Your blows pass straight through them! Logia users are intangible — Seastone or their elemental weakness can still reach them.');
        return false;
      }
    }
    // a body that behaves like a Logia's (Katakuri's mochi): some blows pass through a hole it makes
    const lk = tgt.fruitDef?.passive;
    if (lk?.logiaLike && !tgt.seastoned && !armed && !h.trueDamage && !h.ignoreLogia && tgt.state === 'idle' && !tgt.inWater && !tgt.status.freeze
      && !(lk.weakTo || []).includes(el) && Math.random() < (lk.intangible || 0)) {
      fx.burst(tgt.x, tgt.y - 0.7, 6, { color: tgt.fruitDef.color || '#fff8e1', speed: 2.5, g: 0, life: 0.3, kind: 'smoke', size: 0.2 });
      if (isPlayerInvolved) fx.text(tgt.x, tgt.y - 1.3, 'MOCHI!', tgt.fruitDef.color || '#fff8e1', 0.3);
      return false;
    }
    // Rubber: blunt force and lightning barely work
    let dmg = h.damage;
    if (tgt.fruitDef && tgt.fruitDef.rubber && !armed) {
      if (el === 'lightning') { dmg = 0; if (isPlayerInvolved) fx.text(tgt.x, tgt.y - 1.2, 'RUBBER!', '#fff176', 0.34); }
      else if (!h.slashing && el === 'physical') dmg *= 0.35;
    }
    // elemental interactions
    if (tgt.fruitDef && tgt.fruitDef.resist && tgt.fruitDef.resist.includes(el)) dmg *= 0.25;
    if (tgt.fruitDef && tgt.fruitDef.weakTo && tgt.fruitDef.weakTo.includes(el)) dmg *= 1.5;
    if (tgt.race === 'lunarian' && tgt.flameLit) dmg *= 0.55;

    // Armament hardening on defence (game/haki.js)
    if (tgt.armament) dmg *= 1 - hardening(tgt.hakiLevel('armament'));
    // Ryou: the Haki goes on into them and breaks them from the inside
    if (ryou) dmg *= 1 + RYOU.internal;
    // defence stat
    dmg *= 1 - (tgt.d ? tgt.d.def : 0);
    if (tgt.defMul) dmg *= tgt.defMul;
    // how hard the fight is where it happens: a foe's blows land softer on you
    // (and your crew) in the gentler seas
    const T = tierOf(game, tgt);
    if (att && !att.isPlayer && att.faction !== 'player' && (tgt.isPlayer || tgt.faction === 'player')) dmg *= T.dmg;

    // a counter strike: the first blow you land on a foe reeling from your parry
    const counter = !!att && att.counterOn === tgt && att.counterLeft > 0;
    if (counter) dmg *= att.counterMul || PARRY.counterMul;

    // block / parry
    let blocked = false;
    if (tgt.blocking && !h.unblockable && !counter) {
      const facingDiff = Math.abs(angleDiff(tgt.facing, ang + Math.PI));
      if (facingDiff < 1.9) {
        const pw = parryWindow(game, att, tgt);
        const inWindow = tgt.blockTime <= pw.window;
        // (a blast can't be parried, nor a guard-breaking blow; a shot only by
        // a sword, and only one that doesn't go off)
        const blast = h.blast || (h.radial && !h.follow);
        const shot = h.isProj || h.vx !== undefined;
        const parryable = !!att && !blast && !h.guardBreak && (!shot || (!h.explodes && !h.onEnd && !!tgt.hasWeapon?.('sword')));
        if (parryable && inWindow && tgt.guardFresh) {
          this.parry(att, tgt, h, ang, tgt.blockTime <= pw.perfect);
          return false;
        }
        if (tgt.isPlayer && parryable && inWindow && !tgt.guardFresh) game.hint('mash', 'Not a parry — that guard wasn\'t fresh. A parry takes one clean press of F as the blow lands: not mashed, not held through your own swing.');
        blocked = true;
        if (tgt.isPlayer) game.emit('playerBlocked', att, h);
        if (h.guardBreak) {
          // a heavy blow smashes the guard aside: staggered, and it can't come
          // up again for a moment (dodge those — the red glint gives them away)
          dmg *= 0.6;
          tgt.blocking = false;
          tgt.guardCd = tgt.guardCooldown();
          tgt.guardBrokenT = now;
          tgt.stagger(tgt.isPlayer ? T.gbStun : 1.1);
          fx.guardBreak(tgt, att, ang); // shattered guard, "GUARD BREAK", a jolt
          game.audio?.sfx('guardbreak', tgt);
          if (tgt.isPlayer) {
            game.emit('playerGuardBroken', att, h);
            game.hint('guardbreak', 'GUARD BREAK! A red-glint blow smashes a guard aside — and it can\'t come up again until the F slot fills. Dodge (Q) those instead.');
          }
        } else {
          // (Ryou flows through a guard: much of the blow gets in anyway)
          dmg *= ryou ? Math.max(tgt.guardChip(), RYOU.guard) : tgt.guardChip();
          game.audio?.sfx('block', tgt);
        }
      }
    }

    dmg = Math.max(0, dmg);
    const crit = !blocked && h.critChance && Math.random() < h.critChance;
    if (crit) dmg *= 1.6;
    const final = Math.round(dmg);
    tgt.takeDamage(final, att, h, game);
    const w = blowWeight(att, tgt, h, final, crit, counter);
    // (a blow landed with Armament on sends a ripple through the coat: render3d/chars/haki.js)
    if (att?.armament && (!h.element || h.element === 'physical' || h.haki)) att.armHitT = now;

    // knockback & stun
    if (!blocked) {
      const kb = (h.knockback ?? 2) * (tgt.kbResist ?? 1);
      if (kb > 0) tgt.knock(Math.cos(kbAng) * kb, Math.sin(kbAng) * kb, h.forceWater);
      // (a counter staggers through a boss's poise — and a Buccaneer's frame; and no one blow holds you longer than a flurry may)
      let stun = counter ? Math.max(h.stun || 0, PARRY.counterStun) : h.stun;
      if (tgt.isPlayer && stun > T.stunCap) stun = T.stunCap;
      if (stun && (counter || !(unshakable(tgt) && !h.guardBreak && stun < 0.6))) tgt.stagger(stun * (tgt.stunResist ?? 1));
      if (h.status) for (const [k, v] of Object.entries(h.status)) tgt.addStatus(k, v, att);
      // (a quake throws them off their feet; a heavy blow knocks a flier out of the sky)
      if (h.launch && !tgt.flying && !tgt.inWater && !tgt.climb && !tgt.onShip && !((tgt.z || 0) > 0.3) && tgt.state === 'idle') {
        tgt.vz = Math.max(tgt.vz || 0, h.launch * (tgt.boss ? 0.5 : 1));
        tgt.z = Math.max(tgt.z || 0, 0.02); tgt.airT = 0; tgt.jumpK = 0;
      }
      if (tgt.flying && tgt.flight && (h.heavy || h.guardBreak || (h.stun || 0) >= 0.6 || h.fling)) downFlyer(tgt, game);
      // (a paw that repels them clean off the field: Kuma's "trip")
      if (h.fling && tgt.state === 'idle' && !tgt.onShip && !tgt.climb) {
        const sp = h.fling * (tgt.boss ? 0.35 : 1);
        tgt.dash = { vx: Math.cos(kbAng) * sp, vy: Math.sin(kbAng) * sp, t: 1.1, ignoreWater: true, flung: true };
        tgt.vz = Math.max(tgt.vz || 0, 8); tgt.z = Math.max(tgt.z || 0, 0.02); tgt.airT = 0;
      }
      if (h.onHit) h.onHit(tgt, att, game, h);
      raceHit(att, tgt, h, game);
      if (final > 0 || h.trueDamage) { tgt.hitT = now; tgt.hitDir = kbAng; tgt.hitW = w; }
      if (tgt.isPlayer && tgt.state === 'idle') this.flurry(tgt, att, kbAng, T);
    }
    if (counter) {
      att.counterOn = null; att.counterLeft = 0;
      att.counterT = now;
      fx.counter?.(att, tgt, kbAng, w);
      if (att.isPlayer) game.emit('playerCounter', tgt, final);
    }

    // feedback: impact star, sparks, hit-stop, camera kick and a combined damage
    // number, all scaled by the weight of the blow (see render/combatfx.js)
    fx.hit(att, tgt, h, { final, crit, blocked, el, ang: kbAng, playerInvolved: isPlayerInvolved, w, counter, ryou });
    if (att?.isPlayer) game.emit('playerLanded', tgt, { final, crit, blocked, counter });
    const thud = h.slashing ? (h.heavy ? 'slash_heavy' : 'slash_hit') : (h.heavy ? 'punch_heavy' : 'punch');
    game.audio?.sfx(blocked ? 'block' : h.sfxHit || (el === 'physical' ? thud : el), tgt);
    return true;
  }

  /**
   * `tgt` parries `att`'s blow: `att` reels, posture broken (the rest of the
   * move stops), and `tgt`'s next blow on them while they reel is a counter.
   * A sword against a shot turns it aside instead (nobody reels: the shooter
   * is over there). A perfect parry reels them longer, makes the counter
   * harder and gives back health and Haki.
   */
  parry(att, tgt, h, ang, perfect) {
    const game = this.game, fx = game.fx;
    const now = game.env ? game.env.time : game.time;
    tgt.parryT = now;
    tgt.parryPerfect = perfect;
    // (the next press of F is fresh however soon; and nothing else of this blow gets through)
    tgt.parryEarned = true;
    tgt.iframes = Math.max(tgt.iframes, 0.12);
    tgt.quietUntil = (game.time || 0) + 0.12;
    if (h.isProj || h.vx !== undefined) {
      fx.deflect?.(tgt, h, ang, perfect);
      game.audio?.sfx('parry', tgt);
      if (tgt.isPlayer) game.onPlayerParry(att);
      return;
    }
    const reel = (att.isPlayer ? PARRY.playerReel : PARRY.reel * (att.boss ? PARRY.bossReel : 1)) + (perfect ? PARRY.perfectReel : 0);
    this.cancelBlows(att);
    att.dash = null;
    att.parriedT = now;
    att.stagger(reel);
    // (the blow rebounds: a shove back the way it came)
    const back = ang + Math.PI;
    att.knock(Math.cos(back) * 2.5, Math.sin(back) * 2.5);
    tgt.counterOn = att;
    tgt.counterLeft = reel;
    tgt.counterMul = perfect ? PARRY.perfectCounterMul : PARRY.counterMul;
    if (tgt.hakiUnlocked()) tgt.haki = Math.min(tgt.d.maxHaki, tgt.haki + (perfect ? PARRY.haki : PARRY.parryHaki));
    if (perfect && tgt.d) tgt.heal(Math.max(1, Math.round(tgt.d.maxHp * PARRY.heal)), game);
    fx.parry(tgt, att, ang, perfect); // flash, ring, "PARRY!", hit-stop (and, perfect, a beat of slow motion)
    game.audio?.sfx('parry', tgt);
    if (tgt.isPlayer) {
      game.onPlayerParry(att);
      game.hint('parried', 'PARRIED! They reel — strike now: your next blow is a COUNTER, harder and through any guard. Parry at the very last instant for a PERFECT parry.');
    }
    if (att.isPlayer) {
      game.emit('playerParried', tgt);
      game.hint('foeparry', 'Your blow was PARRIED — you reel, wide open. Out past the Blues, foes read your swings too: don\'t hammer at a guard that has just come up.');
    }
  }

  /**
   * No stun-locks: blows landing on you one after another (each within
   * FLURRY_GAP of the last) are a flurry. After a tier's stunHits of them,
   * or stunCap seconds of it with you still reeling, you break free: the
   * stagger shaken off, a moment untouchable, shoved a step clear.
   */
  flurry(tgt, att, ang, T) {
    const game = this.game, now = game.time || 0;
    const f = tgt.flurryRun || (tgt.flurryRun = { n: 0, t0: now, last: -Infinity });
    if (now - f.last > FLURRY_GAP) { f.n = 0; f.t0 = now; }
    f.n++; f.last = now;
    if (!(tgt.hitstun > 0) || (f.n < T.stunHits && now - f.t0 < T.stunCap)) return;
    f.n = 0; f.t0 = now; f.last = -Infinity;
    tgt.hitstun = 0;
    tgt.iframes = Math.max(tgt.iframes, BREAK_IFRAMES);
    tgt.quietUntil = now + BREAK_IFRAMES;
    tgt.knock(Math.cos(ang) * 3, Math.sin(ang) * 3);
    game.fx.breakFree?.(tgt);
    if (tgt.isPlayer) {
      game.emit('playerBrokeFree', att);
      game.hint('breakfree', 'You shook free of the flurry! Nobody can keep you pinned for long — use the moment to dodge clear or hit back.');
    }
  }
}

export { ELEMENT_COLORS, TAU };
