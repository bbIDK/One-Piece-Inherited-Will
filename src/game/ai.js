// NPC brains.
//   hostile  – fights anything it is hostile to, to the end (nobody runs off
//              when nearly beaten); returns home when leashed
//   guard    – stands still until provoked or an enemy comes close
//   wander   – ambles around home (civilians); flees from fights
//   follower – crew companions: follow the player and fight beside them
//   boss     – hostile + phase scripts
import { angleDiff, clamp, TAU } from '../core/math.js';
import { placeOnDeck, freeDeckSpot, crewStation } from './decks.js';
import { shipNav } from './crewnav.js';
import { clearLine, findPath, standable } from './path.js';
import { interiorRect } from '../world/interiors.js';
import { bw } from '../world/bframe.js';
import { getAbility, canUse, breaksGuard, ownRoom } from './abilities.js';
import { hostile } from './entity.js';
import { tierOf } from './difficulty.js';
import { aiFlight, feetOf } from './flight.js';

/** Does this technique open a ROOM (Ope Ope)? */
const opensRoom = (def) => !!def && (def.steps || []).some((s) => s.zone?.kind === 'room');
/** Does this technique need its target about level with the one using it (a blow, a charge — not a shot, a beam or a field)? */
const reachesOnlyLevel = (def) => !!def && (def.steps || []).some((s) => (s.hit && s.hit.shape !== 'line') || s.dash?.hit) && !(def.steps || []).some((s) => s.proj || s.zone || s.hit?.shape === 'line');
/** How far apart two fighters are up and down (m) — a flier above a foe on the ground. */
const heightGap = (game, a, t) => (a.flying || t.flying ? Math.abs(feetOf(a, game) - feetOf(t, game)) : 0);

// Taking turns. Only so many foes go for the player at once (one in the four
// Blues, where everyone starts; two in Paradise; three in the New World; a
// boss always may). The rest hold back a few steps off, circling and waiting
// for their turn: a mob that all swings at once isn't a fight a new pirate
// can win, and it isn't how a brawl looks either. A long turn passes to
// someone who's waiting, and whoever the player hits gets theirs next.
//
// And everyone fights at the pace of the sea they're in (difficulty.js): in
// the Blues a foe pauses longer between attacks, strings fewer blows
// together, stands catching their breath after a big move (the moment to
// punish them), seldom guards and never parries; and their guard-breaking
// blows (a boss's signature smash, anyone's heavy) come at least a tier's
// breakGap apart and never twice running.
const TURN_LONG = 7; // s: a turn this long can be handed on
const TURN_IDLE = 2.5; // s: …and one spent not getting to grips with them (stuck behind something), sooner
const turnsAllowed = (game, p) => tierOf(game, p).turns;
/** Does this technique smash guards (or go through them)? */
const smashes = (def) => !!def && (def.steps || []).some(breaksGuard);
/** May `a` attack the player `t` now? (claims a turn if one's free; `hit`: the player just struck them) */
function takeTurn(game, a, t, hit = false) {
  if (!t.isPlayer || a.boss) return true;
  const T = game.turns || (game.turns = new Map()); // holder → { since, close: last time at grips }
  const Q = game.turnQueue || (game.turnQueue = new Map()); // waiting → since when
  const now = game.time || 0, w = game.world;
  const out = (h, far) => !h.alive || h.state === 'knocked' || h.controller?.target !== t || w.distance(h.x, h.y, t.x, t.y) > far;
  for (const [h, u] of T) {
    if (out(h, 9)) { T.delete(h); continue; }
    if (h.action || w.distance(h.x, h.y, t.x, t.y) < (h.controller?.meleeRange?.(h) || 1.3) + 1.2) u.close = now;
  }
  if (T.has(a)) return true;
  for (const [h] of Q) if (out(h, 14)) Q.delete(h);
  if (!Q.has(a)) Q.set(a, now);
  // (turns go in the order people started waiting — or at once to someone the player has just hit)
  if (!hit) for (const [h, s0] of Q) if (s0 < Q.get(a) && h !== a) return false;
  if (T.size >= turnsAllowed(game, t)) {
    // hand on a long turn, or one going nowhere (stuck behind something)
    let old = null, score = -Infinity;
    for (const [h, u] of T) {
      const s0 = Math.max(now - u.since - TURN_LONG, now - u.close - TURN_IDLE);
      if (s0 > score) { score = s0; old = h; }
    }
    if (!old || (!hit && score < 0)) return false;
    T.delete(old);
    Q.set(old, now); // (to the back of the queue)
  }
  Q.delete(a);
  T.set(a, { since: now, close: now });
  return true;
}

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
  const ra = w.roomOf(a), rb = w.roomOf(b);
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
  const inside = w.interiorAt ? w.roomOf(a) || w.roomOf(b) : null;
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
    this.prefRange = o.prefRange ?? (this.ranged ? 6 : 1.2);
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
      if (att.isPlayer && this.target === att) takeTurn(game, a, att, true);
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
      // (some keep to themselves until the player starts it: pirates at home
      // in a village, say — your crew walking by included)
      if ((b.isPlayer || b.faction === 'player') && a.calm && !a.provoked) continue;
      let d = game.world.dist2(a.x, a.y, b.x, b.y);
      const stealth = b.buffs?.find((x) => x.mods?.stealth);
      if (stealth) d *= 1 + stealth.mods.stealth * 6;
      // (someone sneaking is seen at not much over half the distance)
      const sneak = !!b.crouch;
      if (sneak) d *= 2.8;
      if (b.isPlayer && b.disguised && a.faction === 'marine' && !a.provoked) continue;
      if (d >= bd) continue;
      // they see what's in front of them (a wide cone) and hear what's close behind
      const real = game.world.distance(a.x, a.y, b.x, b.y);
      const off = Math.abs(angleDiff(a.facing || 0, Math.atan2(b.y - a.y, game.world.dx(a.x, b.x))));
      // (sneaking: only what's well in front of them, and close behind hardly at all)
      if (sneak ? off > 1.3 && real > 1.4 : off > 1.95 && real > 4) continue;
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
      if (a.hakiSkill.armament > 0) {
        // (the coat spreading up their arms, with its clank: render3d/chars/haki.js, audio/sfx.js)
        if (fighting && !a.armament) game.audio?.sfx('haki', a);
        a.armament = fighting;
      }
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
      // (nobody left to fight: a flier comes down)
      if (a.flying && a.flight) a.flight.landing = true;
      // (some of a crew at ease stroll about where they are; the rest stay put)
      if (this.kind === 'patrol' || (this.kind === 'hostile' && this.home && (this.roams ??= Math.random() < 0.3))) this.wander(a, dt, game, true);
      return;
    }
    const t = this.target;
    if (!this.sees && w.distance(a.x, a.y, t.x, t.y) > 2.2) {
      // out of sight: make for where they were last seen, then look about
      const d = w.distance(a.x, a.y, this.seenX, this.seenY);
      if (d > 1.2) { this.moveToward(a, this.seenX, this.seenY, game); a.intent.sprint = d > 5; }
      else a.facing += dt * 2.2 * this.strafeDir;
      if (a.blocking) a.setBlock(false);
      return;
    }
    const dx = w.dx(a.x, t.x), dy = t.y - a.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);

    // on another deck of a big ship (or down in her hold): make for the stairs (or the ladder) before anything else
    const up = game.deckRoute?.(a, t.x, t.y, t);
    if (up) { this.moveToward(a, up.x, up.y, game, true); a.intent.sprint = dist > 4; return; }

    // the pace of the sea we're in (difficulty.js)
    const T = tierOf(game, a);
    const now = game.time || 0;
    // (those who can fly take to the air after a target that has, or now and then to fight from up there: flight.js)
    if (a.fruit || a.race === 'lunarian') {
      this.sorties ??= this.moves.some((id) => (getAbility(id)?.steps || []).some((s) => s.proj || s.zone || s.hit?.shape === 'line' || s.dash?.hit));
      aiFlight(a, this, t, dist, game, this.sorties);
    }
    // (a target up in the air, out of reach of a blow: only shots, beams and fields will do)
    const gap = heightGap(game, a, t);
    const high = gap > 2.4 * (a.look?.scale || 1);
    // a big move of our own just finished (a technique, a heavy — not one cut
    // short): a breather, standing our ground — the moment to punish us
    const was = this.lastAct;
    this.lastAct = a.action;
    if (was && !a.action && !was.def.m1Chain && !(a.hitstun > 0) && was.step > 0) this.rest = T.rest;
    if (this.rest > 0) this.rest -= dt;
    // (a gunner kept at close quarters, for how long: see below)
    this.cornered = this.ranged && dist < T.closeShot ? (this.cornered || 0) + dt : 0;

    // defend against incoming attacks (seldom where fights are gentle, never
    // while catching our breath): one look at each swing of theirs — and a
    // swing we let come doesn't put off our own attack (or a flurry of jabs
    // would keep anyone from ever swinging back)
    const ta = t.action;
    if (ta && ta !== this.sawSwing && dist < 4 && !a.action && !(this.rest > 0) && ta.t < (ta.def.windup ?? 0.1) + 0.05 && this.think <= 0.35) {
      this.sawSwing = ta;
      const roll = Math.random();
      // (a blow that would smash a guard aside is one to get out of the way of;
      // and a guard that parries is the sea's call: never in the Blues)
      if (roll < this.skill * 0.55 * T.block && !smashes(ta.def)) { a.facing = ang; a.setBlock(true, Math.random() < T.npcParry * (0.5 + this.skill)); if (a.blocking) { this.blockT = 0.5; this.think = 0.5; } }
      else if (roll < this.skill * 0.85 * T.block && a.tryDodge(game, -dy, dx * this.strafeDir)) this.think = 0.5;
    }
    if (this.blockT > 0) { this.blockT -= dt; a.facing = ang; if (this.blockT <= 0) a.setBlock(false); return; }

    a.facing = a.action ? a.facing : ang;
    if (this.rest > 0 && !a.action) return;
    // (a parry of ours earned a counter: strike while they reel)
    if (a.counterOn === t && a.counterLeft > 0) this.think = Math.min(this.think, 0);
    // not our turn yet: hold back a few steps off and circle, facing them
    if (!a.action && !takeTurn(game, a, t)) {
      this.comboLeft = 0;
      const ring = 3.4 + (a.id % 5) * 0.25;
      let mx = 0, my = 0;
      if (dist > ring + 1.2) { mx = dx / dist; my = dy / dist; a.intent.sprint = dist > 7; }
      else if (dist < ring - 0.6) { mx = -dx / dist; my = -dy / dist; }
      if (dist < ring + 2) { mx += (-dy / dist) * this.strafeDir * 0.55; my += (dx / dist) * this.strafeDir * 0.55; }
      if (Math.random() < 0.01) this.strafeDir *= -1;
      const l = Math.hypot(mx, my);
      if (l > 0) { a.intent.mx = mx / l * 0.6; a.intent.my = my / l * 0.6; }
      this.avoidStuck(a, dt, game);
      return;
    }
    // choose a technique
    if (!a.action && this.think <= 0) {
      this.think = (0.35 + (1 - this.aggression) * 0.8) * (0.7 + Math.random() * 0.6) * T.think;
      // (a guard-breaking move only once its time has come round again, and never two running)
      const smashOk = now >= (this.smashT || 0) && !this.smashed;
      const room = ownRoom(a, game);
      const usable = this.moves.map(getAbility).filter((m) => m && !m.flight && canUse(a, m) && this.inRangeFor(m, dist, a, game) && (smashOk || !smashes(m))
        && !(high && reachesOnlyLevel(m)) && !(room && opensRoom(m)));
      // a surgeon opens a ROOM before anything else (the rest of the Ope Ope needs one)
      const opener = usable.find(opensRoom);
      if (opener && dist < 7) {
        a.facing = ang;
        if (a.tryTechnique(opener.id, game, t)) this.used(opener, T, now);
        return;
      }
      if (usable.length && Math.random() < 0.55) {
        const m = usable[Math.floor(Math.random() * usable.length)];
        a.facing = ang;
        if (a.tryTechnique(m.id, game, t)) this.used(m, T, now);
        return;
      }
      // (out of reach up there, no blow will do: wait for them below)
      if (dist < this.meleeRange(a) + 0.3 && !this.ranged && !high) {
        a.facing = ang;
        if (Math.random() < 0.15 && smashOk && a.tryHeavy(game)) { this.used(a.action?.def, T, now); return; }
        a.tryM1(game);
        this.smashed = false;
        this.comboLeft = Math.floor(Math.random() * (T.combo + 1));
        return;
      }
      // (a gunner opens fire from a few paces further off than they like to stand — not from across the square;
      // and, where fights are gentle, not point-blank either: they back off first, unless they're cornered)
      if (this.ranged && dist < this.prefRange + 2 && (dist >= T.closeShot || this.cornered > 1.2)) { a.facing = ang; a.tryM1(game); return; }
    }
    if (this.comboLeft > 0 && !a.action && dist < this.meleeRange(a) + 0.5 && !high) { this.comboLeft--; a.tryM1(game); }

    // movement: approach to preferred range, strafe when close
    const want = this.ranged ? this.prefRange : this.meleeRange(a) * 0.8;
    // a wall between us: go round by the door
    const via = game.buildings?.route(a, t.x, t.y);
    if (via) { this.moveToward(a, via.x, via.y, game, true); a.intent.sprint = dist > 4; return; }
    // something in the way (a house, a fence, a cart): go round it
    if (dist > 1.8) {
      const wp = this.steer(a, t.x, t.y, game);
      if (wp.x !== t.x || wp.y !== t.y) { this.moveToward(a, wp.x, wp.y, game, true); a.intent.sprint = dist > 4; return; }
    }
    let mx = 0, my = 0, pace = 1;
    if (dist > want + 0.4) { mx = dx / dist; my = dy / dist; a.intent.sprint = dist > 6; }
    // (a gunner backs off walking backwards — slower where fights are gentle: run them down)
    else if (dist < want - 0.8 && this.ranged) { mx = -dx / dist; my = -dy / dist; pace = T.backpedal; }
    else if (Math.random() < 0.02) this.strafeDir *= -1;
    if (dist < want + 1.5) { mx += -dy / dist * this.strafeDir * 0.5; my += dx / dist * this.strafeDir * 0.5; }
    const l = Math.hypot(mx, my);
    if (l > 0) { a.intent.mx = mx / l * pace; a.intent.my = my / l * pace; }
    this.avoidStuck(a, dt, game);
  }

  /** A move just used: a guard-breaking one puts the next off a tier's breakGap (and an ordinary one in between). */
  used(def, T, now) {
    this.smashed = smashes(def);
    if (this.smashed) this.smashT = now + T.breakGap;
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

  inRangeFor(m, dist, a = null, game = null) {
    // (a Room technique: the target has to be in the Room — Shambles to come at them from across it, Takt anywhere in it)
    const pw = (m.steps || []).find((x) => x.power && (x.power.kind === 'shambles' || x.power.kind === 'takt'));
    if (pw && a && game) {
      const z = ownRoom(a, game), t = this.target;
      if (!z || !t || game.world.distance(z.x, z.y, t.x, t.y) > z.r) return false;
      return pw.power.kind === 'shambles' ? dist > 2.5 : true;
    }
    const s = (m.steps || []).find((x) => x.hit || x.proj || x.dash || x.zone || x.teleport || x.pull || x.buff || x.conqueror);
    if (!s) return dist < 3;
    if (s.zone?.kind === 'room') return dist < 7;
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

  moveToward(a, x, y, game, direct = false, who = null) {
    let tx = x, ty = y;
    if (!direct) {
      // in or out of a building by its door, and round anything in the way
      // (after someone: by the deck they're on — a plank's far end, not the
      // water a step behind them that the point might be over)
      const via = game.deckRoute?.(a, x, y, who) || game.buildings?.route(a, x, y);
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

  /**
   * Running from a fight (or a burglar): to somewhere clear and away from
   * them, the way people really go — round the furniture, and out of the
   * door if they aren't between you and it — cowering, facing them, when
   * there's nowhere further to go. (Never flat out in a straight line away
   * from them, into the nearest wall.)
   */
  flee(a, dt, game) {
    const w = game.world, f = this.fleeFrom;
    this.fleeT -= dt;
    // (a burglar who's left the house and gone off is no longer anything to run from)
    if (f && a.homeB && w.interiorAt(f.x, f.y) !== a.homeB && w.distance(a.x, a.y, f.x, f.y) > 10) this.fleeT = Math.min(this.fleeT, 0.5);
    if (this.fleeT <= 0 || !f) { this.state = 'idle'; this.fleeFrom = null; this.fleeTo = null; return; }
    if ((this.fleePick = (this.fleePick || 0) - dt) <= 0) {
      this.fleePick = 0.8 + Math.random() * 0.4;
      this.fleeTo = fleeSpot(a, f, game, this.fleeTo);
    }
    const to = this.fleeTo;
    const d = to ? this.moveToward(a, to.x, to.y, game) : 0;
    if (!to || d < 0.5) {
      a.intent.mx = 0; a.intent.my = 0;
      a.facing = Math.atan2(f.y - a.y, w.dx(a.x, f.x));
      return;
    }
    a.intent.sprint = d > 2;
  }

  wander(a, dt, game, combatant) {
    if (this.state === 'flee' && this.fleeFrom) return this.flee(a, dt, game);
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
    // (a fight that isn't theirs is no reason to run: they run when it's
    // them being hit — onHurt — or their door kicked in)
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
    // (once you're ashore — not while you're in the air between two decks)
    if (a.deck && !p.deck && !p.inWater && !p.climb && !((p.z || 0) > 0.05 || p.vz) && !a.deck.ship.traffic && !a.climb) {
      a.deck.ship.aboard?.delete(a); a.deck = null; a.z = 0; a.vz = 0;
      a.x = p.x + (Math.random() - 0.5) * 2; a.y = p.y + 1;
    }
    if (a.climb) return; // (up a ship's ladder: see crewnav.js)
    // fight nearby enemies of the captain (once down from a jump over a ship's rail: see crewnav.js)
    if (!this.target || this.target.state !== 'idle' || !this.target.alive) {
      this.target = null;
      if (this.think <= 0 && !a.navJump) {
        this.think = 0.5;
        let best = null, bd = 64;
        for (const b of game.actorsNear(p.x, p.y, 8)) {
          if (b.state !== 'idle' || b.faction === 'player') continue;
          // (they join a fight, they don't pick one: whoever's after you or
          // one of the crew, anyone you've gone for, or a foe out looking
          // for trouble — never pirates at ease in their den, say, who'd only
          // fight someone who broke in or laid a hand on them)
          const t = b.controller?.target;
          const fighting = b.provoked || t === p || t?.faction === 'player';
          if (!fighting && !(hostile(a, b) && b.aggroPlayer !== false && !b.calm)) continue;
          const d = game.world.dist2(a.x, a.y, b.x, b.y);
          if (d < bd) { bd = d; best = b; }
        }
        this.target = best;
      }
    }
    // a ship's side between them and whoever they're making for — you, or the
    // foe they're after on another deck: across first, as you would (a jump
    // from rail to rail, or over the side and up her ladder), and never in
    // under her (see crewnav.js; a gangway's walked: deckRoute)
    const nav = shipNav(game, a, this.target || p);
    if (nav) {
      if (nav.climb) { game.climbLadder?.(a, nav.climb); this.navT = 0; this.navX = undefined; return; }
      this.moveToward(a, nav.x, nav.y, game, true);
      a.intent.sprint = !!nav.run || a.inWater;
      if (nav.jump !== undefined && a.canJump()) a.tryJump(game, nav.jump);
      // (getting nowhere for a good while — boxed in, say: they catch up with
      // you; making for somewhere new, it's how near they get to that)
      const w = game.world, dn = w.distance(a.x, a.y, nav.x, nav.y);
      if (this.navX === undefined || w.distance(this.navX, this.navY, nav.x, nav.y) > 1.5) this.navBest = dn;
      this.navX = nav.x; this.navY = nav.y;
      if (dn < this.navBest - 0.5) { this.navBest = dn; this.navT = 0; }
      if ((this.navT = (this.navT || 0) + dt) > 8) { this.navT = 0; this.navX = undefined; catchUp(game, a, p); }
      return;
    }
    this.navX = undefined; this.navT = 0;
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
    if (d > 22) { catchUp(game, a, p); return; }
    if (d > 2.2) {
      this.moveToward(a, p.x - Math.cos(p.facing) * 1.2, p.y - Math.sin(p.facing) * 1.2 + 0.3, game, false, p);
      a.intent.sprint = d > 5;
    }
    void clamp; void angleDiff; void TAU;
  }
}

/**
 * Left behind (on a ship's deck, ashore, in the water): one of your crew
 * catches up with you — on your deck beside you if you're aboard a ship (on
 * a gangway, a step behind you on it), else beside you ashore or in the
 * water, clear of any hull (never in under one).
 */
function catchUp(game, a, p) {
  if (a.climb) return;
  if (a.deck) { a.deck.ship.aboard?.delete(a); a.deck = null; }
  a.z = 0; a.vz = 0;
  const dk = p.deck, w = game.world;
  if (dk && !dk.plank) {
    const sp = dk.lvl !== undefined ? freeDeckSpot(dk.ship, dk.t - 0.03, dk.v * 0.8, typeof dk.lvl === 'string' && !dk.room ? dk.lvl : 'main') : { t: Math.max(0.15, dk.t - 0.1), v: dk.v * 0.5 };
    placeOnDeck(game, a, dk.ship, sp.t, sp.v);
    return;
  }
  if (dk?.plank) {
    const L = dk.plank.pts(), k = dk.k > 1.2 ? dk.k - 1.2 : dk.k + 1.2;
    a.x = w.wx(L.x + L.dir.x * k); a.y = L.y + L.dir.y * k;
    a.deck = game.deckAt(a.x, a.y, 0) || null;
    if (a.deck) (a.deck.ship.aboard ||= new Set()).add(a);
    return;
  }
  for (const [ox, oy] of [[-Math.cos(p.facing) * 1.5, 0.5], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4], [2, 2], [-2, -2], [2, -2], [-2, 2]]) {
    a.x = w.wx(p.x + ox); a.y = p.y + oy;
    if (!game.hullAt?.(a.x, a.y, a.r || 0.35)) break;
  }
}

/**
 * Where to run from `f`: out of the house if the way to its door is clear of
 * them, else the far side of the room, on clear floor; out of doors, clear
 * ground away from them (off to one side if straight away is blocked).
 * Null: cornered. (`cur`, where they were already running, is kept while
 * it's as good.)
 */
function fleeSpot(a, f, game, cur) {
  const w = game.world, B = game.buildings;
  const from = (p) => Math.hypot(w.dx(f.x, p.x), p.y - f.y);
  const b = w.interiorAt(a.x, a.y);
  if (b && B) {
    const dp = B.doorPts(b);
    const mine = Math.hypot(w.dx(a.x, dp.mid.x), dp.mid.y - a.y);
    // (a fight out in the street: stay in, away from it; someone in here with you: out, if you can get past them)
    if (w.interiorAt(f.x, f.y) === b && from(dp.mid) > mine + 1.2 && (!B.isLocked(b) || a.homeB === b || b.doorOpen)) {
      for (const z of [4, 2.5]) {
        const q = bw(b, dp.lx, z), p = { x: w.wx(q.x), y: q.y };
        if (standable(w, p.x, p.y, a.r) && !w.interiorAt(p.x, p.y)) return p;
      }
    }
    const R = interiorRect(b);
    let best = null, bd = -Infinity;
    for (let i = 0; i < 16; i++) {
      const p = { x: R.x0 + 0.45 + Math.random() * Math.max(0, R.x1 - R.x0 - 0.9), y: R.y0 + 0.45 + Math.random() * Math.max(0, R.y1 - R.y0 - 0.9) };
      if (!B.freeAt(b, p.x, p.y, 0.4)) continue;
      const s = from(p);
      if (s > bd) { bd = s; best = p; }
    }
    if (cur && w.interiorAt(cur.x, cur.y) === b && from(cur) > bd - 0.6) return cur;
    return best;
  }
  if (cur && !w.interiorAt(cur.x, cur.y) && from(cur) > from(a) + 2 && Math.hypot(w.dx(a.x, cur.x), cur.y - a.y) > 1) return cur;
  const away = Math.atan2(a.y - f.y, w.dx(f.x, a.x));
  for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8]) {
    for (const L of [7, 4]) {
      const x = w.wx(a.x + Math.cos(away + off) * L), y = a.y + Math.sin(away + off) * L;
      if (w.interiorAt(x, y)) continue; // (not into somebody else's house)
      if (standable(w, x, y, a.r) && clearLine(w, a.x, a.y, x, y, a.r * 0.85)) return { x, y };
    }
  }
  return null;
}
