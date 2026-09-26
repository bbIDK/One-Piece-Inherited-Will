// Hitboxes, projectiles and damage resolution.
//
// Canon rules implemented here:
//  * Logia users are intangible: physical hits pass through them unless the
//    attacker uses Armament Haki, Seastone, or the Logia's elemental weakness
//    (water for Crocodile's sand, rubber vs lightning, magma beats fire...).
//  * Blocking reduces damage from the front; a well-timed block is a parry.
//  * Rubber (Gomu Gomu) shrugs off blunt force and lightning.
import { angleDiff, clamp, TAU } from '../core/math.js';
import { hostile } from './entity.js';

const ELEMENT_COLORS = {
  physical: '#ffffff', fire: '#ff7b39', ice: '#9be7ff', lightning: '#fff176', sand: '#e1c16e', smoke: '#cfd8dc',
  light: '#fff9c4', magma: '#ff5722', dark: '#7e57c2', quake: '#e0f7fa', poison: '#aed581', water: '#4fc3f7', haki: '#9c27b0',
  slash: '#ecf0f1', explosion: '#ffab40', gas: '#b2dfdb', string: '#f8bbd0', wax: '#fff8e1', snow: '#ffffff', swamp: '#6d4c41',
};

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

  update(dt) {
    const game = this.game;
    const actors = game.actorsNear(game.player ? game.player.x : 0, game.player ? game.player.y : 0, 60);
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const h = this.hitboxes[i];
      h.t += dt;
      if (h.follow && h.owner && h.owner.alive) {
        h.x = h.owner.x + (h.offX || 0); h.y = h.owner.y + (h.offY || 0);
        if (h.followAngle) h.angle = h.owner.facing;
      }
      for (const a of actors) {
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
      if (h.hitShips) this.hitShips(h);
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
      let dead = p.traveled >= p.range || p.t > (p.life ?? 6);
      if (!p.passWalls && !dead) {
        const t = game.world.type(p.x, p.y);
        if (game.world.isBlocked(p.x, p.y) || t === 25 || t === 26 || t === 27 || t === 41 || t === 50) dead = true;
      }
      if (!dead) {
        for (const a of actors) {
          if (p.hit.has(a.id) || !this.canHit(p.owner, a, p)) continue;
          if (game.world.dist2(p.x, p.y, a.x, a.y - 0.5) > (p.radius + a.r + 0.2) ** 2) continue;
          p.hit.add(a.id);
          p.angle = Math.atan2(p.vy, p.vx);
          this.applyHit(p.owner, a, p);
          if (!p.pierce) { dead = true; break; }
        }
        if (p.hitShips && !dead) {
          for (const s of game.ships) {
            if (s === p.ownerShip || s.sunk) continue;
            if (game.world.dist2(p.x, p.y, s.x, s.y) < (s.def.length * 0.45) ** 2) { s.damage(p.shipDamage ?? p.damage, p.owner, p); dead = true; break; }
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

  canHit(owner, target, h) {
    if (!target.alive || target === owner) return false;
    if (target.state === 'dead') return false;
    if (target.state === 'knocked' && !h.hitsDowned) return false;
    if (h.friendly) return false;
    if (owner && owner.faction === 'player' && target.faction === 'player') return false;
    if (!owner) return true;
    if (target.invulnerable) return false;
    return hostile(owner, target) || (owner.isPlayer && target.provoked) || (target.isPlayer && owner.provoked) || h.hitsAll;
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
      if (d < h.range + s.def.length * 0.4) {
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
    const el = h.element || 'physical';
    const isPlayerInvolved = (att && att.isPlayer) || tgt.isPlayer;
    const ang = h.angle ?? (att ? Math.atan2(tgt.y - att.y, game.world.dx(att.x, tgt.x)) : 0);
    const kbAng = h.shape === 'circle' || h.radial ? Math.atan2(tgt.y - h.y, game.world.dx(h.x, tgt.x)) : ang;

    // dodge i-frames
    if (tgt.iframes > 0) {
      if (tgt.isPlayer || att?.isPlayer) fx.text(tgt.x, tgt.y - 1.2, 'DODGE', '#b2ebf2', 0.32);
      if (tgt.isPlayer) game.emit('playerEvaded', att, h);
      return false;
    }
    // Observation Haki auto-evade
    if (tgt.observation && tgt.hakiLevel('observation') > 0 && !h.unblockable) {
      const lvl = tgt.hakiLevel('observation');
      const chance = 0.12 + lvl * 0.0035 - (att?.observation ? 0.15 : 0);
      if (Math.random() < chance && tgt.haki >= 4) {
        tgt.haki -= 4;
        tgt.iframes = 0.2;
        fx.text(tgt.x, tgt.y - 1.2, 'FORESIGHT', '#e1bee7', 0.3);
        fx.burst(tgt.x, tgt.y - 0.5, 6, { color: '#ce93d8', speed: 3, g: 0, life: 0.3 });
        return false;
      }
    }

    // Logia intangibility
    const armed = att && (att.armament || h.haki || h.seastone);
    const lg = tgt.fruitDef && tgt.fruitDef.logia ? tgt.fruitDef : tgt.fakeLogia || null;
    if (lg && !tgt.seastoned && (lg === tgt.fakeLogia ? tgt.state !== 'knocked' && !tgt.inWater && !tgt.status.freeze : tgt.intangibleOK())) {
      const weakness = lg.weakTo || [];
      const counters = weakness.includes(el) || (el === 'water' && tgt.status.wet) || (att && att.status.wet && weakness.includes('water'));
      if (!armed && !counters && !h.trueDamage) {
        fx.burst(tgt.x, tgt.y - 0.7, 8, { color: lg.color || '#fff', speed: 3, g: 0, life: 0.35, kind: 'smoke', size: 0.2 });
        if (isPlayerInvolved) fx.text(tgt.x, tgt.y - 1.3, 'INTANGIBLE', lg.color || '#fff', 0.3);
        if (att && att.isPlayer) game.hint('logia', att.hakiUnlocked?.() ? 'Logia users are intangible. Use Armament Haki, Seastone, or their elemental weakness to hit them.' : 'Your blows pass straight through them! Logia users are intangible — Seastone or their elemental weakness can still reach them.');
        return false;
      }
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

    // Armament hardening on defence
    if (tgt.armament) dmg *= 1 - Math.min(0.35, 0.12 + tgt.hakiLevel('armament') * 0.0025);
    // defence stat
    dmg *= 1 - (tgt.d ? tgt.d.def : 0);
    if (tgt.defMul) dmg *= tgt.defMul;

    // block / parry
    let blocked = false;
    if (tgt.blocking && !h.unblockable) {
      const facingDiff = Math.abs(angleDiff(tgt.facing, ang + Math.PI));
      if (facingDiff < 1.9) {
        if (tgt.blockTime < 0.2 && att && !h.projectileOnly) {
          // PARRY
          att.stagger(0.9);
          tgt.stamina = Math.min(tgt.d.maxStamina, tgt.stamina + 15);
          if (tgt.hakiUnlocked()) tgt.haki = Math.min(tgt.d.maxHaki, tgt.haki + 6);
          fx.burst(tgt.x + Math.cos(ang + Math.PI) * 0.5, tgt.y - 0.7, 14, { color: ['#fff', '#fff59d'], speed: 6, g: 0, life: 0.3, kind: 'line' });
          fx.ring(tgt.x, tgt.y, 0.3, 1.6, '#fff59d', 0.3, 0.12);
          fx.text(tgt.x, tgt.y - 1.4, 'PARRY!', '#fff59d', 0.44);
          fx.stop(0.12);
          game.audio?.sfx('parry');
          if (tgt.isPlayer) game.onPlayerParry(att);
          return false;
        }
        blocked = true;
        if (tgt.isPlayer) game.emit('playerBlocked', att, h);
        dmg *= h.guardBreak ? 0.6 : 0.18;
        tgt.stamina -= (h.guardDmg ?? 10) + h.damage * 0.25;
        if (tgt.stamina <= 0) {
          tgt.stamina = 0;
          tgt.blocking = false;
          tgt.stagger(1.1);
          fx.text(tgt.x, tgt.y - 1.4, 'GUARD BREAK', '#ff7675', 0.4);
          game.audio?.sfx('guardbreak');
        } else {
          game.audio?.sfx('block');
        }
      }
    }

    dmg = Math.max(0, dmg);
    const crit = !blocked && h.critChance && Math.random() < h.critChance;
    if (crit) dmg *= 1.6;
    const final = Math.round(dmg);
    tgt.takeDamage(final, att, h, game);

    // knockback & stun
    if (!blocked) {
      const kb = (h.knockback ?? 2) * (tgt.kbResist ?? 1);
      if (kb > 0) tgt.knock(Math.cos(kbAng) * kb, Math.sin(kbAng) * kb, h.forceWater);
      if (h.stun && !(tgt.poise && !h.guardBreak && h.stun < 0.6)) tgt.stagger(h.stun * (tgt.stunResist ?? 1));
      if (h.status) for (const [k, v] of Object.entries(h.status)) tgt.addStatus(k, v, att);
      if (h.onHit) h.onHit(tgt, att, game, h);
    }

    // feedback
    const col = ELEMENT_COLORS[el] || '#fff';
    const hx = tgt.x, hy = tgt.y - 0.7;
    fx.burst(hx, hy, blocked ? 5 : 8 + Math.min(12, final / 8), { color: blocked ? '#b0bec5' : [col, '#ffffff'], speed: 5, g: 4, life: 0.3, kind: 'line', size: 0.12 });
    if (final > 0) fx.text(hx, tgt.y - 1.2, String(final), blocked ? '#b0bec5' : crit ? '#ffeb3b' : tgt.isPlayer ? '#ff6b6b' : '#ffffff', crit ? 0.55 : 0.45, { crit });
    if (isPlayerInvolved) {
      const heavy = (h.heavy || final > (tgt.d ? tgt.d.maxHp * 0.12 : 50));
      fx.stop(heavy ? 0.09 : 0.04);
      fx.shake(heavy ? 0.35 : 0.12);
      if (h.impactFrame) fx.impactFrame(0.07);
    }
    game.audio?.sfx(blocked ? 'block' : h.sfxHit || (el === 'physical' ? (h.slashing ? 'slash_hit' : 'punch') : el));
    return true;
  }
}

export { ELEMENT_COLORS, TAU };
