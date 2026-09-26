// NPC brains.
//   hostile  – fights anything it is hostile to; returns home when leashed
//   guard    – stands still until provoked or an enemy comes close
//   wander   – ambles around home (civilians); flees from fights
//   follower – crew companions: follow the player and fight beside them
//   boss     – hostile + phase scripts
import { angleDiff, clamp, TAU } from '../core/math.js';
import { getAbility, canUse } from './abilities.js';
import { hostile } from './entity.js';

/** Can `a` see `b` — both out in the open, both in the same room, or `b` at the open door of `a`'s room? */
function sameRoom(game, a, b) {
  const w = game.world;
  if (!w.interiorAt) return true;
  const ra = w.interiorAt(a.x, a.y), rb = w.interiorAt(b.x, b.y);
  if (ra === rb) return true;
  const room = ra || rb;
  if (!room.doorOpen) return false;
  const out = ra ? b : a; // whoever is outside must be at the doorway
  const d = game.buildings?.doorPts(room);
  return !!d && w.distance(out.x, out.y, d.x, d.mid) < 3;
}

export class AIController {
  constructor(o = {}) {
    this.kind = o.kind || 'hostile';
    this.home = o.home ? { ...o.home } : null;
    this.leash = o.leash ?? 22;
    this.aggroRange = o.aggroRange ?? 9;
    this.moves = o.moves || []; // technique ids
    this.skill = o.skill ?? 0.3; // defensive skill 0..1
    this.aggression = o.aggression ?? 0.7;
    this.ranged = !!o.ranged;
    this.prefRange = o.prefRange ?? (this.ranged ? 7 : 1.2);
    this.fleeAt = o.fleeAt ?? (o.kind === 'hostile' ? 0.15 : 0);
    this.state = 'idle';
    this.target = null;
    this.think = Math.random() * 0.5;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.wanderT = 0;
    this.wanderTo = null;
    this.phases = o.phases || null; // [{ at: hpFraction, run(a, game) }]
    this.phaseIdx = 0;
    this.barks = o.barks || null;
    this.barkT = 3 + Math.random() * 5;
    this.lastSeen = 0;
  }

  onHurt(a, att, game) {
    if (att && att !== a) {
      if (this.kind === 'wander' || this.kind === 'civilian') { this.state = 'flee'; this.fleeFrom = att; this.fleeT = 4; return; }
      if (!this.target || Math.random() < 0.5) this.target = att;
      this.state = 'chase';
      // alert allies
      for (const b of game.actorsNear(a.x, a.y, 10)) {
        if (b !== a && b.faction === a.faction && b.controller instanceof AIController && !b.controller.target && b.state === 'idle') {
          b.controller.target = att; b.controller.state = 'chase';
          if (att.isPlayer) b.provoked = true;
        }
      }
    }
  }

  findTarget(a, game) {
    const r = this.aggroRange;
    let best = null, bd = r * r;
    for (const b of game.actorsNear(a.x, a.y, r)) {
      if (b === a || b.state !== 'idle' || b.onShip) continue;
      const isFoe = hostile(a, b) || (b.isPlayer && a.provoked) || (a.faction === 'player' && b.provoked);
      if (!isFoe) continue;
      let d = game.world.dist2(a.x, a.y, b.x, b.y);
      const stealth = b.buffs?.find((x) => x.mods?.stealth);
      if (stealth) d *= 1 + stealth.mods.stealth * 6;
      if (b.isPlayer && b.disguised && a.faction === 'marine') continue;
      if (!sameRoom(game, a, b)) continue;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  update(a, dt, game) {
    const w = game.world;
    a.intent.mx = 0; a.intent.my = 0; a.intent.sprint = false;
    this.think -= dt;
    if (this.barks && (this.barkT -= dt) <= 0 && (this.state === 'chase' || this.state === 'attack')) {
      this.barkT = 5 + Math.random() * 8;
      game.fx.text(a.x, a.y - 2.1, this.barks[Math.floor(Math.random() * this.barks.length)], '#fff', 0.3, { life: 1.6 });
    }
    // boss phases
    if (this.phases && this.phaseIdx < this.phases.length && a.hp / a.d.maxHp <= this.phases[this.phaseIdx].at) {
      const ph = this.phases[this.phaseIdx++];
      ph.run(a, game);
    }

    if (this.kind === 'follower') return this.follow(a, dt, game);
    if (this.kind === 'wander' || this.kind === 'civilian') return this.wander(a, dt, game);
    if (this.kind === 'idle') return;

    // validate target
    if (this.target && (!this.target.alive || this.target.state !== 'idle' || this.target.onShip || w.distance(a.x, a.y, this.target.x, this.target.y) > this.aggroRange * 2.5)) {
      this.target = null;
      this.state = this.home ? 'return' : 'idle';
    }
    if (!this.target && this.think <= 0) {
      this.think = 0.4;
      if (this.kind !== 'guard' || a.provoked) {
        const t = this.findTarget(a, game);
        if (t) {
          this.target = t; this.state = 'chase';
          if (t.isPlayer && a.alertLine && !a.saidAlert) { a.saidAlert = true; game.fx.text(a.x, a.y - 2.1, a.alertLine, '#fff', 0.32, { life: 1.8 }); }
        }
      }
    }
    // Haki users fight with it on, and rest it when the fight is over
    if (a.hakiSkill && !a.isPlayer) {
      const fighting = !!this.target && a.haki > 2;
      if (a.hakiSkill.armament > 0) a.armament = fighting;
      if (a.hakiSkill.observation > 0) a.observation = fighting;
    }
    // leash
    if (this.home && this.leash && w.distance(a.x, a.y, this.home.x, this.home.y) > this.leash && this.state !== 'return') {
      this.state = 'return'; this.target = null;
    }
    if (this.state === 'return') {
      if (!this.home) { this.state = 'idle'; return; }
      const d = this.moveToward(a, this.home.x, this.home.y, game);
      if (d < 1) { this.state = 'idle'; a.hp = Math.min(a.d.maxHp, a.hp + a.d.maxHp * 0.5); }
      return;
    }
    if (!this.target) {
      if (this.kind === 'patrol' || (this.kind === 'hostile' && this.home && Math.random() < 0.3)) this.wander(a, dt, game, true);
      return;
    }
    const t = this.target;
    const dx = w.dx(a.x, t.x), dy = t.y - a.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);

    // flee when nearly beaten (grunts only)
    if (this.fleeAt && a.hp / a.d.maxHp < this.fleeAt && !a.boss) {
      a.intent.mx = -dx / (dist || 1); a.intent.my = -dy / (dist || 1); a.intent.sprint = true;
      a.facing = ang + Math.PI;
      return;
    }

    // defend against incoming attacks
    const ta = t.action;
    if (ta && dist < 4 && !a.action && ta.t < (ta.def.windup ?? 0.1) + 0.05 && this.think <= 0.35) {
      const roll = Math.random();
      if (roll < this.skill * 0.55) { a.facing = ang; a.setBlock(true); this.blockT = 0.5; }
      else if (roll < this.skill * 0.85) { a.tryDodge(game, -dy, dx * this.strafeDir); }
      this.think = 0.5;
    }
    if (this.blockT > 0) { this.blockT -= dt; a.facing = ang; if (this.blockT <= 0) a.setBlock(false); return; }

    a.facing = a.action ? a.facing : ang;
    // choose a technique
    if (!a.action && this.think <= 0) {
      this.think = (0.35 + (1 - this.aggression) * 0.8) * (0.7 + Math.random() * 0.6);
      const usable = this.moves.map(getAbility).filter((m) => m && canUse(a, m) && this.inRangeFor(m, dist));
      if (usable.length && Math.random() < 0.55) {
        const m = usable[Math.floor(Math.random() * usable.length)];
        a.facing = ang;
        a.tryTechnique(m.id, game, t);
        return;
      }
      if (dist < this.meleeRange(a) + 0.3 && !this.ranged) {
        a.facing = ang;
        if (Math.random() < 0.15 && a.tryHeavy(game)) return;
        a.tryM1(game);
        this.comboLeft = Math.floor(Math.random() * 3);
        return;
      }
      if (this.ranged && dist < this.prefRange + 3) { a.facing = ang; a.tryM1(game); return; }
    }
    if (this.comboLeft > 0 && !a.action && dist < this.meleeRange(a) + 0.5) { this.comboLeft--; a.tryM1(game); }

    // movement: approach to preferred range, strafe when close
    const want = this.ranged ? this.prefRange : this.meleeRange(a) * 0.8;
    // a wall between us: go round by the door
    const via = game.buildings?.route(a, t.x, t.y);
    if (via) { this.moveToward(a, via.x, via.y, game, true); a.intent.sprint = dist > 4 && a.stamina > a.d.maxStamina * 0.4; return; }
    let mx = 0, my = 0;
    if (dist > want + 0.4) { mx = dx / dist; my = dy / dist; a.intent.sprint = dist > 6 && a.stamina > a.d.maxStamina * 0.5; }
    else if (dist < want - 0.8 && this.ranged) { mx = -dx / dist; my = -dy / dist; }
    else if (Math.random() < 0.02) this.strafeDir *= -1;
    if (dist < want + 1.5) { mx += -dy / dist * this.strafeDir * 0.5; my += dx / dist * this.strafeDir * 0.5; }
    const l = Math.hypot(mx, my);
    if (l > 0) { a.intent.mx = mx / l; a.intent.my = my / l; }
    this.avoidStuck(a, dt, game);
  }

  meleeRange(a) { return 1.3 * (a.reach || 1) * (a.look?.scale || 1); }

  inRangeFor(m, dist) {
    const s = (m.steps || []).find((x) => x.hit || x.proj || x.dash || x.zone || x.teleport || x.pull || x.buff || x.conqueror);
    if (!s) return dist < 3;
    if (s.buff || s.heal) return dist < 12;
    if (s.hit) return dist < (s.hit.range || 1.5) + (s.hit.offset || 0) + 0.6;
    if (s.proj) return dist < (s.proj.range || 10) * 0.85 && dist > 1.5;
    if (s.dash) return dist < s.dash.dist + 1 && dist > 1.5;
    if (s.zone) return dist < 10;
    if (s.pull) return dist < s.pull.range && dist > 2.5;
    if (s.teleport) return dist > 4 && dist < 12;
    if (s.conqueror) return dist < s.conqueror.range * 0.8;
    return dist < 3;
  }

  moveToward(a, x, y, game, direct = false) {
    if (!direct) {
      const via = game.buildings?.route(a, x, y);
      if (via) { x = via.x; y = via.y; }
    }
    const dx = game.world.dx(a.x, x), dy = y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.3) { a.intent.mx = dx / d; a.intent.my = dy / d; a.facing = Math.atan2(dy, dx); }
    this.avoidStuck(a, 0.016, game);
    return d;
  }

  avoidStuck(a, dt, game) {
    // if we barely moved while trying to, sidestep around the obstacle
    const moved = Math.hypot(game.world.dx(this.lastX ?? a.x, a.x), a.y - (this.lastY ?? a.y));
    const trying = Math.hypot(a.intent.mx, a.intent.my) > 0.1;
    if (trying && moved < 0.01) this.stuckT = (this.stuckT || 0) + dt; else this.stuckT = 0;
    if (this.stuckT > 0.25) {
      const side = this.strafeDir;
      const mx = a.intent.mx, my = a.intent.my;
      a.intent.mx = -my * side; a.intent.my = mx * side;
      if (this.stuckT > 1.2) { this.strafeDir *= -1; this.stuckT = 0; }
    }
    this.lastX = a.x; this.lastY = a.y;
  }

  wander(a, dt, game, combatant) {
    if (this.state === 'flee' && this.fleeFrom) {
      this.fleeT -= dt;
      const dx = game.world.dx(this.fleeFrom.x, a.x), dy = a.y - this.fleeFrom.y;
      const d = Math.hypot(dx, dy) || 1;
      a.intent.mx = dx / d; a.intent.my = dy / d; a.intent.sprint = true;
      a.facing = Math.atan2(dy, dx);
      if (this.fleeT <= 0) { this.state = 'idle'; this.fleeFrom = null; }
      this.avoidStuck(a, dt, game);
      return;
    }
    if (!this.home) this.home = { x: a.x, y: a.y };
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 2 + Math.random() * 5;
      if (Math.random() < (a.stationary ? 0 : 0.6)) {
        const r = combatant ? 5 : (a.wanderRadius ?? 4);
        this.wanderTo = { x: this.home.x + (Math.random() - 0.5) * 2 * r, y: this.home.y + (Math.random() - 0.5) * 2 * r };
        // people at home potter about their own rooms; passers-by stay out of other people's
        const bx = a.wanderBox;
        if (bx) this.wanderTo = { x: clamp(this.wanderTo.x, bx.x0 + 0.35, bx.x1 - 0.35), y: clamp(this.wanderTo.y, bx.y0 + 0.35, bx.y1 - 0.35) };
        else if (game.world.isBlocked(this.wanderTo.x, this.wanderTo.y)) this.wanderTo = null;
      } else this.wanderTo = null;
    }
    if (this.wanderTo) {
      const d = this.moveToward(a, this.wanderTo.x, this.wanderTo.y, game);
      a.intent.mx *= 0.45; a.intent.my *= 0.45;
      if (d < 0.5) this.wanderTo = null;
    } else if (a.faceHome !== undefined) a.facing = a.faceHome;
    // civilians watch fights nervously
    if (!combatant && game.player && game.player.inCombat && game.world.distance(a.x, a.y, game.player.x, game.player.y) < 7) {
      this.state = 'flee'; this.fleeFrom = game.player; this.fleeT = 2.5;
    }
  }

  follow(a, dt, game) {
    const p = game.player;
    if (!p) return;
    if (p.onShip) { a.hidden = true; a.x = p.x; a.y = p.y; return; }
    if (a.hidden) { a.hidden = false; a.x = p.x + (Math.random() - 0.5) * 2; a.y = p.y + 1; }
    // fight nearby enemies of the captain
    if (!this.target || this.target.state !== 'idle' || !this.target.alive) {
      this.target = null;
      if (this.think <= 0) {
        this.think = 0.5;
        let best = null, bd = 64;
        for (const b of game.actorsNear(p.x, p.y, 8)) {
          if (b.state !== 'idle' || !(hostile(a, b) || b.provoked) || b.faction === 'player') continue;
          const d = game.world.dist2(a.x, a.y, b.x, b.y);
          if (d < bd) { bd = d; best = b; }
        }
        this.target = best;
      }
    }
    if (this.target) {
      const saveKind = this.kind;
      this.kind = 'hostile';
      this.home = null;
      this.update(a, dt, game);
      this.kind = saveKind;
      if (game.world.distance(a.x, a.y, p.x, p.y) > 14) this.target = null;
      return;
    }
    const d = game.world.distance(a.x, a.y, p.x, p.y);
    if (d > 22) { a.x = p.x - Math.cos(p.facing) * 1.5; a.y = p.y + 0.5; return; }
    if (d > 2.2) {
      this.moveToward(a, p.x - Math.cos(p.facing) * 1.2, p.y - Math.sin(p.facing) * 1.2 + 0.3, game);
      a.intent.sprint = d > 5;
    }
    void clamp; void angleDiff; void TAU;
  }
}
