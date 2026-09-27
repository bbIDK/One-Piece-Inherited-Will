// NPC brains.
//   hostile  – fights anything it is hostile to; returns home when leashed
//   guard    – stands still until provoked or an enemy comes close
//   wander   – ambles around home (civilians); flees from fights
//   follower – crew companions: follow the player and fight beside them
//   boss     – hostile + phase scripts
import { angleDiff, clamp, TAU } from '../core/math.js';
import { placeOnDeck, freeDeckSpot, crewStation } from './decks.js';
import { clearLine, findPath } from './path.js';
import { getAbility, canUse } from './abilities.js';
import { hostile } from './entity.js';

// Path searches are the expensive part of walking about: a few a frame at
// most (anyone else heads straight on for a frame and asks again).
const PATHS_PER_FRAME = 2;
let pathFrame = -1, pathsLeft = 0;
function mayPath(game) {
  if (game.time !== pathFrame) { pathFrame = game.time; pathsLeft = PATHS_PER_FRAME; }
  return pathsLeft-- > 0;
}

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
  return !!d && w.distance(out.x, out.y, d.mid.x, d.mid.y) < 3;
}

/**
 * Can `a` see `b`? Not through a wall, a house or a cliff (trees, carts and
 * the like don't hide you), and only into or out of a room by its open door.
 */
export function canSee(game, a, b) {
  if (!sameRoom(game, a, b)) return false;
  const w = game.world;
  const dx = w.dx(a.x, b.x), dy = b.y - a.y;
  const n = Math.ceil(Math.hypot(dx, dy) / 0.45);
  const inside = w.interiorAt ? w.interiorAt(a.x, a.y) || w.interiorAt(b.x, b.y) : null;
  for (let i = 1; i < n; i++) {
    const t = i / n, x = w.wx(a.x + dx * t), y = a.y + dy * t;
    if (w.solid(x, y)) return false;
    if (!inside && w.isBlocked(x, y)) return false;
    if (w.hitsProp(x, y, 0.05, true)) return false;
  }
  return true;
}

const LOST_LINES = ["Tch... where'd they go?", 'Lost them...', 'Get back here, coward!', 'Next time...', "They're gone."];

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
    // how long they'll hunt for you once you're out of sight, and how far
    // from where the fight started they'll follow
    this.patience = o.patience ?? (o.kind === 'guard' ? 5 : 7);
    this.pursuit = o.pursuit ?? (this.leash ? Math.max(36, this.leash * 2.2) : 0);
  }

  onHurt(a, att, game) {
    if (att && att !== a) {
      if (this.kind === 'wander' || this.kind === 'civilian' || this.kind === 'townsfolk') { this.state = 'flee'; this.fleeFrom = att; this.fleeT = 4; return; }
      if (!this.target || Math.random() < 0.5) this.target = att;
      this.state = 'chase';
      this.sawAt(att, game, a);
      // alert allies
      for (const b of game.actorsNear(a.x, a.y, 10)) {
        if (b !== a && b.faction === a.faction && b.controller instanceof AIController && !b.controller.target && b.state === 'idle') {
          b.controller.target = att; b.controller.state = 'chase'; b.controller.sawAt(att, game, b);
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
      if (b.isPlayer && b.disguised && a.faction === 'marine' && !a.provoked) continue;
      if (d >= bd) continue;
      // they see what's in front of them (a wide cone) and hear what's close behind
      const real = game.world.distance(a.x, a.y, b.x, b.y);
      const off = Math.abs(angleDiff(a.facing || 0, Math.atan2(b.y - a.y, game.world.dx(a.x, b.x))));
      if (off > 1.95 && real > 4) continue;
      if (!canSee(game, a, b)) continue;
      bd = d; best = b;
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
    if (this.kind === 'townsfolk') return game.townLife ? game.townLife.update(a, this, dt) : this.wander(a, dt, game);
    if (this.kind === 'idle') return;

    // validate target: gone, down, or aboard a ship
    if (this.target && (!this.target.alive || this.target.state !== 'idle' || this.target.onShip)) this.loseTarget(a);
    // keep an eye on them: where they were last seen, and for how long they've been out of sight
    if (this.target) {
      const t = this.target;
      if (!this.engage) this.sawAt(t, game, a);
      if ((this.seeT = (this.seeT || 0) - dt) <= 0) {
        this.seeT = 0.25;
        this.sees = w.distance(a.x, a.y, t.x, t.y) < 50 && canSee(game, a, t);
        if (this.sees) this.sawAt(t, game);
      }
      const lost = (game.time || 0) - this.seenT;
      const far = this.pursuit && w.distance(a.x, a.y, this.engage.x, this.engage.y) > this.pursuit;
      if (lost > this.patience * (a.boss ? 1.6 : 1) || far) {
        if (t.isPlayer && lost > 1 && !far && Math.random() < 0.6) game.fx.text(a.x, a.y - 2.1, LOST_LINES[Math.floor(Math.random() * LOST_LINES.length)], '#fff', 0.3, { life: 1.6 });
        this.loseTarget(a);
      }
    }
    if (!this.target && this.think <= 0) {
      this.think = 0.4;
      if (this.kind !== 'guard' || a.provoked) {
        const t = this.findTarget(a, game);
        if (t) {
          this.target = t; this.state = 'chase'; this.sawAt(t, game, a);
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
    // leash: wandering too far from home (a chase has its own limits, above)
    if (!this.target && this.home && this.leash && w.distance(a.x, a.y, this.home.x, this.home.y) > this.leash && this.state !== 'return') {
      this.state = 'return';
    }
    if (this.state === 'return') {
      if (!this.home) { this.state = 'idle'; return; }
      // (back home at a walk)
      const d = this.moveToward(a, this.home.x, this.home.y, game);
      a.intent.mx *= 0.6; a.intent.my *= 0.6;
      // (no healing up on the way home: walk away from a fight and come back, and it's still hurt)
      if (d < 1) this.state = 'idle';
      return;
    }
    if (!this.target) {
      if (this.kind === 'patrol' || (this.kind === 'hostile' && this.home && Math.random() < 0.3)) this.wander(a, dt, game, true);
      return;
    }
    const t = this.target;
    if (!this.sees && w.distance(a.x, a.y, t.x, t.y) > 2.2) {
      // out of sight: make for where they were last seen, then look about
      const d = w.distance(a.x, a.y, this.seenX, this.seenY);
      if (d > 1.2) { this.moveToward(a, this.seenX, this.seenY, game); a.intent.sprint = d > 5 && a.stamina > a.d.maxStamina * 0.4; }
      else a.facing += dt * 2.2 * this.strafeDir;
      if (a.blocking) a.setBlock(false);
      return;
    }
    const dx = w.dx(a.x, t.x), dy = t.y - a.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);

    // flee when nearly beaten (grunts only)
    if (this.fleeAt && a.hp / a.d.maxHp < this.fleeAt && !a.boss) {
      a.intent.mx = -dx / (dist || 1); a.intent.my = -dy / (dist || 1); a.intent.sprint = true;
      a.facing = ang + Math.PI;
      return;
    }

    // on another deck of a big ship: make for the stairs before anything else
    const up = game.deckRoute?.(a, t.x, t.y);
    if (up) { this.moveToward(a, up.x, up.y, game, true); a.intent.sprint = dist > 4 && a.stamina > a.d.maxStamina * 0.4; return; }

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
    // something in the way (a house, a fence, a cart): go round it
    if (dist > 1.8) {
      const wp = this.steer(a, t.x, t.y, game);
      if (wp.x !== t.x || wp.y !== t.y) { this.moveToward(a, wp.x, wp.y, game, true); a.intent.sprint = dist > 4 && a.stamina > a.d.maxStamina * 0.4; return; }
    }
    let mx = 0, my = 0;
    if (dist > want + 0.4) { mx = dx / dist; my = dy / dist; a.intent.sprint = dist > 6 && a.stamina > a.d.maxStamina * 0.5; }
    else if (dist < want - 0.8 && this.ranged) { mx = -dx / dist; my = -dy / dist; }
    else if (Math.random() < 0.02) this.strafeDir *= -1;
    if (dist < want + 1.5) { mx += -dy / dist * this.strafeDir * 0.5; my += dx / dist * this.strafeDir * 0.5; }
    const l = Math.hypot(mx, my);
    if (l > 0) { a.intent.mx = mx / l; a.intent.my = my / l; }
    this.avoidStuck(a, dt, game);
  }

  /** Seen them just now (and, starting a hunt, remember where it began). */
  sawAt(t, game, a = null) {
    this.seenT = game.time || 0; this.seenX = t.x; this.seenY = t.y; this.sees = true;
    if (a && !this.engage) this.engage = { x: a.x, y: a.y };
    else if (!this.engage) this.engage = { x: t.x, y: t.y };
  }

  /** Give up the hunt: home (or stand down). */
  loseTarget(a) {
    this.target = null; this.engage = null; this.sees = false;
    this.state = this.home ? 'return' : 'idle';
    if (a.blocking) a.setBlock(false);
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
    let tx = x, ty = y;
    if (!direct) {
      // in or out of a building by its door, and round anything in the way
      const via = game.deckRoute?.(a, x, y) || game.buildings?.route(a, x, y);
      if (via) { tx = via.x; ty = via.y; }
      const wp = this.steer(a, tx, ty, game);
      tx = wp.x; ty = wp.y;
    }
    const dx = game.world.dx(a.x, tx), dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.3) { a.intent.mx = dx / d; a.intent.my = dy / d; a.facing = Math.atan2(dy, dx); }
    this.avoidStuck(a, 0.016, game);
    return tx === x && ty === y ? d : Math.hypot(game.world.dx(a.x, x), y - a.y);
  }

  /** The next point to head for on the way to (x, y): straight there, or a path round whatever's in the way. */
  steer(a, x, y, game) {
    const w = game.world, now = game.time || 0;
    const P = this.path;
    if (P && Math.hypot(w.dx(P.tx, x), P.ty - y) < 1.2 && now - P.t < 6) {
      while (P.i < P.pts.length && Math.hypot(w.dx(a.x, P.pts[P.i].x), P.pts[P.i].y - a.y) < 0.45) P.i++;
      if (P.i < P.pts.length) return P.pts[P.i];
      this.path = null;
      return { x, y };
    }
    // the straight line is the usual case: check it a couple of times a second
    if (now < (this.lineT || 0) && Math.hypot(w.dx(this.lineX, x), this.lineY - y) < 1) {
      if (this.lineOk || now < (this.pathCd || 0)) return { x, y };
    } else {
      const d = Math.hypot(w.dx(a.x, x), y - a.y);
      this.lineOk = d < 1.2 || clearLine(w, a.x, a.y, x, y, a.r * 0.85);
      this.lineT = now + 0.5; this.lineX = x; this.lineY = y;
      if (this.lineOk) { this.path = null; return { x, y }; }
    }
    if (now < (this.pathCd || 0) || !mayPath(game)) return { x, y };
    const pts = findPath(w, a.x, a.y, x, y, a.r * 0.85, 1600);
    this.pathCd = now + (pts ? 0.7 : 2);
    if (!pts || !pts.length) return { x, y };
    this.path = { pts, i: 0, tx: x, ty: y, t: now };
    return pts[0];
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
        if (bx) {
          this.wanderTo = { x: clamp(this.wanderTo.x, bx.x0 + 0.35, bx.x1 - 0.35), y: clamp(this.wanderTo.y, bx.y0 + 0.35, bx.y1 - 0.35) };
          // indoors: only to clear floor (never into the furniture)
          if (a.homeB && game.buildings?.freeAt && !game.buildings.freeAt(a.homeB, this.wanderTo.x, this.wanderTo.y)) {
            let ok = null;
            for (let k = 0; k < 8 && !ok; k++) {
              const q = { x: bx.x0 + 0.35 + Math.random() * (bx.x1 - bx.x0 - 0.7), y: bx.y0 + 0.35 + Math.random() * (bx.y1 - bx.y0 - 0.7) };
              if (game.buildings.freeAt(a.homeB, q.x, q.y)) ok = q;
            }
            this.wanderTo = ok;
          }
        } else if (game.world.isBlocked(this.wanderTo.x, this.wanderTo.y)) this.wanderTo = null;
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
    if (p.onShip) {
      const s = p.ship;
      if (s && !s.sunk && s.def.big) {
        // a big ship's crew stand their stations on deck while you steer
        if (a.deck?.ship !== s) {
          const crew = game.actors.filter((b) => b.alive && b.controller?.kind === 'follower');
          const st = crewStation(s, Math.max(0, crew.indexOf(a)));
          placeOnDeck(game, a, s, st.t, st.v);
          a.facing = s.heading;
        }
        a.hidden = false;
        a.intent.mx = 0; a.intent.my = 0;
        this.target = null;
        return;
      }
      a.hidden = true; a.x = p.x; a.y = p.y; return;
    }
    if (a.hidden) {
      a.hidden = false;
      // come up on deck with you (or ashore beside you)
      if (p.deck && p.deck.lvl !== undefined) { const sp = freeDeckSpot(p.deck.ship, p.deck.t + 0.04, (Math.random() - 0.5) * 2, typeof p.deck.lvl === 'string' ? p.deck.lvl : 'main'); placeOnDeck(game, a, p.deck.ship, sp.t, sp.v); }
      else if (p.deck) placeOnDeck(game, a, p.deck.ship, Math.min(0.8, p.deck.t + 0.12 + Math.random() * 0.25), (Math.random() - 0.5) * p.deck.ship.def.beam * 0.4);
      else { a.x = p.x + (Math.random() - 0.5) * 2; a.y = p.y + 1; }
    }
    // you went ashore and left them standing on deck: they come ashore with you
    if (a.deck && !p.deck && !p.inWater && !a.deck.ship.traffic) {
      a.deck.ship.aboard?.delete(a); a.deck = null; a.z = 0; a.vz = 0;
      a.x = p.x + (Math.random() - 0.5) * 2; a.y = p.y + 1;
    }
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
    if (d > 22) {
      // left behind (on a ship's deck, or ashore): catch up
      if (a.deck) { a.deck.ship.aboard?.delete(a); a.deck = null; }
      a.z = 0; a.vz = 0;
      a.x = p.x - Math.cos(p.facing) * 1.5; a.y = p.y + 0.5;
      return;
    }
    if (d > 2.2) {
      this.moveToward(a, p.x - Math.cos(p.facing) * 1.2, p.y - Math.sin(p.facing) * 1.2 + 0.3, game);
      a.intent.sprint = d > 5;
    }
    void clamp; void angleDiff; void TAU;
  }
}
