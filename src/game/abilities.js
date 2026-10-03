// Ability runtime. Techniques are data (see data/styles.js, data/fruits.js,
// data/haki.js) made of timed "steps" using a few primitives:
//   hit      – melee hitbox (arc / circle / line / ring) in front of the user
//   proj     – projectile(s)
//   dash     – move the user quickly (optionally carrying a hitbox)
//   buff     – timed stat modifiers / auras / transformations
//   zone     – lingering damaging or slowing area
//   pull     – drag enemies toward a point (Black Hole, Kurouzu)
//   teleport – blink forward (Soru, Yata no Kagami), or to the target (toTarget)
//   heal     – restore health (Phoenix flames)
//   power    – a Devil Fruit's own mechanic, by kind (Shambles, Takt, a
//              Liberation... see powers.js and room.js)
//   fx       – purely visual flourish
//
// A technique may also be a Room technique (Ope Ope: `room: 'need'` — only
// inside your own ROOM; `room: 'weak'` — half as strong outside it; its blows
// reach only what's in the Room, and pass through a Logia's body), or a way
// of taking to the sky (`flight`: see flight.js — it takes off or lands).
//
// A foe's blow is wound up long enough to be read where fights are gentle
// (see difficulty.js), and just before it lands a glint on them shows the
// moment: yellow, parry it (F); red, it smashes guards — dodge it (Q).
import { TAU, clamp } from '../core/math.js';
import { ELEMENT_COLORS } from './combat.js';
import { drawProjectile } from '../render/projectiles.js';
import { tierOf, stretchWindup } from './difficulty.js';
import { POWERS } from './powers.js';
import { ownRoom } from './room.js';
import { flyableAt } from './flight.js';
import { clashes, FUTURE_SIGHT, sigOf } from './haki.js';

const REG = new Map();
export function registerAbilities(list, source) {
  for (const a of list) { a.source = a.source || source; REG.set(a.id, a); }
}
export const getAbility = (id) => REG.get(id);
export const allAbilities = () => [...REG.values()];
export { ownRoom };

/** Is this a kick (for the Longleg Tribe's whip legs)? */
export function isKick(def) {
  if (!def) return false;
  return /kick|sweep|knee|axe_kick|mouton|stomp|jete|ballet|pirouette|arabesque|handstand|rankyaku/.test(def.anim || '') || def.style === 'black_leg' || def.style === 'okama_kenpo';
}

export function abilityTotal(def) {
  const last = Math.max(0, ...(def.steps || []).map((s) => (s.at ?? def.windup ?? 0) + (s.dash ? s.dash.time : 0) + (s.hit ? s.hit.duration ?? 0.1 : 0)));
  return Math.max((def.windup ?? 0) + (def.active ?? 0.1), last) + (def.recover ?? 0.2);
}

/** Damage multiplier for an ability used by an actor. */
export function powerFor(actor, def) {
  const src = def.source || '';
  if (actor.dmgOverride) return actor.dmgOverride * (actor.buffMul('damage'));
  const str = actor.d ? actor.d.dmg : 1;
  let m = 1;
  if (src.startsWith('fruit')) {
    const fm = actor.fruitMastery || 0;
    m = (0.7 + str * 0.35) * (1 + fm * 0.022);
  } else if (src.startsWith('haki')) {
    m = (0.6 + str * 0.3) * (1 + (actor.hakiLevel(def.hakiType || 'armament') || 0) * 0.02) * (1 + (actor.attrs?.wil || 0) * 0.01);
  } else {
    const sm = actor.styleMastery ? actor.styleMastery(def.style || actor.style) : 0;
    m = str * (1 + sm * 0.012);
    if (def.weapon && actor.weaponMul) m *= actor.weaponMul(def.weapon);
    // weapon mastery: the more you fight with a kind of weapon, the harder it hits
    if (actor.weaponMastery) m *= 1 + (actor.weaponMastery[weaponKindOf(actor, def)] || 0) * 0.006;
  }
  // (a Longleg's legs are whips; a Skypiean knows a Dial as nobody from the Blue Sea does)
  if (actor.race === 'longleg' && isKick(def)) m *= 1.3;
  if (actor.race === 'skypiean' && def.id?.startsWith('dial_')) m *= 1.25;
  m *= actor.buffMul('damage');
  if (actor.armament && !src.startsWith('fruit_ranged')) m *= 1.25 + (actor.hakiLevel('armament') || 0) * 0.004;
  if (actor.conquerorInfused) m *= 1.4;
  return m;
}

/** Which weapon mastery a technique trains and benefits from. */
export function weaponKindOf(actor, def) {
  if (def.weaponKind) return def.weaponKind;
  if (def.weapon) return def.weapon;
  const src = def.source || '';
  if (src.startsWith('style')) {
    const st = def.style || actor.style;
    if (/ittoryu|nitoryu|santoryu/.test(st)) return actor.hasWeapon?.('sword') ? 'sword' : 'fists';
    if (st === 'sniper') return actor.hasWeapon?.('gun') ? 'gun' : 'fists';
    if (st === 'weather_science') return actor.hasWeapon?.('staff') ? 'staff' : 'fists';
    if (st === 'elbaf') return actor.hasWeapon?.('axe') ? 'axe' : 'fists';
    if (st === 'black_leg' || st === 'okama_kenpo') return 'legs';
  }
  return 'fists';
}

export function canUse(actor, def) {
  if (!def) return false;
  if ((actor.cooldowns[def.id] || 0) > 0) return false;
  const c = def.cost || {};
  if (c.haki && actor.haki < c.haki) return false;
  if (def.source?.startsWith('fruit') && (actor.inWater || actor.seastoned)) return false;
  // (worn out — Gear Fourth spent: no Haki in you for a while)
  if (def.source?.startsWith('haki') && actor.buffs?.some((b) => b.noHaki)) return false;
  // (a style's technique needs that style's weapon: Santoryu moves want three swords, whatever you fight with)
  if (def.weapon && !actor.hasWeapon(def.weapon, def.style)) return false;
  if (def.requiresBuff && !actor.hasBuff(def.requiresBuff)) return false;
  // (a Room technique works only inside your own ROOM)
  if (def.room === 'need' && !ownRoom(actor)) return false;
  return true;
}

/** Does this step deal damage (a blow, a shot, a charge, a field that hurts, a power that does)? */
export const isDamaging = (s) => !!(s.hit || s.proj || (s.zone && s.zone.damage > 0) || s.dash?.hit || s.power?.blow);
/** Does this step's blow smash a guard aside, or go straight through one? (the red glint: dodge it) */
export const breaksGuard = (s) => !!(s.hit?.guardBreak || s.hit?.unblockable || s.dash?.hit?.guardBreak || s.dash?.hit?.unblockable || s.proj?.unblockable || s.power?.unblockable);
/** The first step of a technique that deals damage (its index), or -1. */
export function firstBlow(def) { return (def.steps || []).findIndex(isDamaging); }

export function startAbility(actor, def, game, target) {
  const c = def.cost || {};
  if (c.haki) actor.haki -= c.haki;
  const cdMul = actor.cdMul ?? 1;
  if (def.cd) actor.cooldowns[def.id] = def.cd * cdMul;
  const angle = actor.facing;
  const tx = target ? target.x : actor.x + Math.cos(angle) * 5;
  const ty = target ? target.y : actor.y + Math.sin(angle) * 5;
  actor.action = { def, t: 0, step: 0, angle, tx, ty, target, total: abilityTotal(def) / (def.noSpeedup ? 1 : actor.atkSpeed()), mult: powerFor(actor, def) };
  // (begun while a parry's counter is there to land: it stays there till this move is done)
  if (actor.counterLeft > 0) actor.action.counter = true;
  // a Room technique: its blows reach what's in your ROOM (and only that); a
  // weaker one used outside a Room is half as strong
  if (def.room) {
    const z = ownRoom(actor, game);
    if (z) actor.action.room = z;
    else if (def.room === 'weak') {
      actor.action.mult *= 0.5;
      if (actor.isPlayer) game.hint?.('roomweak', `${def.name} is only half as strong outside your ROOM. Cast ROOM first, then fight inside it.`);
    }
  }
  // (a Longarm's second elbow snaps a bare-handed jab back quicker)
  if (actor.race === 'longarm' && def.m1Chain && !def.weapon) actor.action.total *= 0.8;
  // a foe's blow: wound up long enough to read, and the moment it lands shown by a glint
  if (!actor.isPlayer && actor.faction !== 'player') {
    readable(actor, actor.action, game);
    // (Observation Haki hears it coming: their will flagged the moment they start it at you)
    const p = game.player;
    if (p?.observation && p !== actor && (target === p || actor.controller?.target === p) && firstBlow(def) >= 0) game.fx.sensed?.(actor, p);
  }
  if (def.say && Math.random() < 0.9) game.fx.text(actor.x, actor.y - 2.1, def.say, '#ffffff', 0.34, { life: 1.2 });
  if (!actor.isPlayer && def.telegraph !== false) telegraph(actor, def, game);
  if (def.onStart) def.onStart(actor, game);
  game.audio?.sfx(def.sfxStart || 'whoosh', actor);
}

/**
 * Make a foe's move readable: its wind-up stretched to what the sea allows
 * (the move's clock runs slow until its first blow: see updateAbility), and
 * the moment the blow lands worked out for the glint — `cueT`, on the move's
 * own clock, a tier's cueLead before it lands (a charge's run in to you
 * counted). A shot glints a cueLead before it's fired (`shot`): the moment
 * to get your guard up or get out of its way (a sword wielder's parry gets
 * a glint on the shot itself as it reaches them instead: combat.js).
 */
function readable(actor, a, game) {
  const def = a.def, i = firstBlow(def);
  if (i < 0) return;
  const s = def.steps[i];
  const T = tierOf(game, actor);
  const speed = def.noSpeedup ? 1 : actor.atkSpeed();
  const at = s.at ?? def.windup ?? 0;
  const w = at / speed;
  const want = stretchWindup(T, w, !!def.chained);
  a.hitAt = at;
  a.slow = w > 0.001 && want > w ? want / w : 1;
  // (a field of something — gas, lightning — is no blow to parry either: get out of it)
  a.breaks = breaksGuard(s) || !!s.zone;
  a.shot = !!s.proj;
  // (a charge lands once it reaches you)
  const who = a.target || actor.controller?.target;
  let travel = 0;
  if (s.dash && who) travel = Math.max(0, game.world.distance(actor.x, actor.y, who.x, who.y) - 1) / Math.max(1, s.dash.dist / s.dash.time);
  const real = Math.max(0, want + travel - T.cueLead);
  a.cueT = want > 0 && real <= want ? real / want * at : at + Math.max(0, real - want) * speed;
}

/**
 * The glint: on a foe whose blow is about to land on you, a tier's cueLead
 * before it does — yellow for one to parry, red (and "!!" in the Blues) for
 * one that smashes guards. Plain in the Blues, fainter further out, and
 * plain again anywhere with Observation Haki on. Taught once, the first
 * time a foe swings at you.
 */
function glint(actor, a, game) {
  const p = game.player;
  if (!p || p === actor || p.state !== 'idle') return;
  const who = a.target || actor.controller?.target;
  if (who !== p || game.world.distance(actor.x, actor.y, p.x, p.y) > (a.shot ? 14 : 10)) return;
  // (a sword wielder's glint for a shot is on the shot itself)
  if (a.shot && !a.breaks && p.hasWeapon?.('sword')) return;
  const T = tierOf(game, p);
  const k = p.observation ? 1 : T.cue;
  if (!(k > 0)) return;
  game.fx.parryCue?.(actor, a.breaks, k);
  // (Future Sight: a vision of the blow, the moment before it lands)
  if (futureSight(p)) game.fx.vision?.(actor, p);
  // (the first of each in a life: the world slows a moment, time to read the hint and act on it)
  const key = a.breaks ? 'redglint' : a.shot ? 'shotglint' : 'parry';
  if (!game.hintsShown?.has(key) && game.settings?.showHints !== false) game.fx.slowmo(1.2, 0.2);
  if (a.breaks) game.hint('redglint', 'A RED glint: that blow smashes any guard (and some go straight through one). Don\'t block it — dodge (Q) just before it lands.');
  else if (a.shot) game.hint('shotglint', 'A glint on a gunman: a shot is coming. Hold F to block it, or sidestep and dodge (Q) — a sword can even turn it aside with a parry.');
  else game.hint('parry', 'A YELLOW glint: the blow is about to land — tap F right then to PARRY it. A parried foe reels, open to a COUNTER. (Hold F to simply block.)');
}

/** Does Observation show you visions of the blows coming (Future Sight on, or mastered far enough with Observation on)? */
export function futureSight(p) {
  return !!p && (!!p.hasBuff?.('future_sight') || (!!p.observation && (p.hakiLevel?.('observation') || 0) >= FUTURE_SIGHT));
}

function telegraph(actor, def, game) {
  const a = actor.action;
  const wind = (a?.hitAt ?? def.windup ?? 0.2) * (a?.slow || 1) / (def.noSpeedup ? 1 : actor.atkSpeed());
  if (wind < 0.12) return;
  const first = (def.steps || []).find((s) => s.hit || s.proj || s.dash || (s.zone && s.zone.damage > 0) || s.power?.blow);
  if (!first) return;
  // red: get out of the way (it smashes guards, or it's a blast); amber: a blow you can parry
  const parryable = (first.hit || first.dash?.hit) && !breaksGuard(first) && !first.zone;
  const col = parryable ? 'rgba(255,193,7,1)' : actor.boss ? 'rgba(255,40,80,1)' : 'rgba(255,60,60,1)';
  const life = wind * (actor.game?.player?.observation ? 1.35 : 1);
  if (first.power) {
    // (a power over a whole ROOM — Takt: the Room itself lights up)
    const z = a?.room || ownRoom(actor, game);
    if (z) game.fx.telegraph(z.x, z.y, 'circle', { r: z.r, life, color: col });
    return;
  }
  if (first.hit) {
    const h = first.hit;
    const ox = actor.x + Math.cos(actor.facing) * (h.offset || 0), oy = actor.y + Math.sin(actor.facing) * (h.offset || 0);
    if (h.shape === 'circle' || h.shape === 'ring') game.fx.telegraph(ox, oy, 'circle', { r: h.range, life, color: col, follow: h.offset ? null : actor });
    else if (h.shape === 'line') game.fx.telegraph(actor.x, actor.y, 'line', { angle: actor.facing, length: h.range, width: h.width || 1, life, color: col });
    else game.fx.telegraph(ox, oy, 'arc', { r: h.range, angle: actor.facing, arc: h.arc || 1.4, life, color: col });
  } else if (first.proj || first.dash) {
    const len = first.proj ? Math.min(14, first.proj.range || 10) : first.dash.dist;
    game.fx.telegraph(actor.x, actor.y, 'line', { angle: actor.facing, length: len, width: first.proj ? (first.proj.radius || 0.4) * 2 + 0.3 : 1.2, life, color: col });
  } else if (first.zone) {
    game.fx.telegraph(actor.action.tx, actor.action.ty, 'circle', { r: first.zone.range, life, color: col });
  }
}

export function updateAbility(actor, dt, game) {
  const a = actor.action;
  const def = a.def;
  // (a foe's wind-up runs slow where fights are gentle: see readable)
  a.t += dt * (def.noSpeedup ? 1 : actor.atkSpeed()) / (a.slow > 1 && a.t < a.hitAt ? a.slow : 1);
  if (a.cueT !== undefined && !a.cued && a.t >= a.cueT) { a.cued = true; glint(actor, a, game); }
  const steps = def.steps || [];
  if (def.track && a.t < (def.windup ?? 0)) a.angle = actor.facing; // aim during windup
  while (a.step < steps.length && a.t >= (steps[a.step].at ?? def.windup ?? 0)) {
    runStep(actor, steps[a.step], game, a);
    a.step++;
  }
  if (a.t >= a.total * (def.noSpeedup ? 1 : actor.atkSpeed())) {
    if (def.onEnd) def.onEnd(actor, game);
    actor.action = null;
  }
}

function runStep(actor, s, game, a) {
  const ang = s.angleOffset ? a.angle + s.angleOffset : a.angle;
  const mult = a.mult;
  const col = ELEMENT_COLORS[s.hit?.element || s.proj?.element || 'physical'];
  if (s.hit) {
    const h = s.hit;
    const off = h.offset ?? 0;
    const reach = actor.reach ?? 1;
    const hb = {
      owner: actor, x: game.world.wx(actor.x + Math.cos(ang) * off * reach), y: actor.y - 0.4 + Math.sin(ang) * off * reach,
      // (Conqueror's Infusion: the black lightning round a blow lands it a little beyond the fist)
      shape: h.shape || 'arc', range: (h.range || 1.4) * (h.shape === 'circle' ? 1 : reach) + (actor.conquerorInfused && h.shape !== 'circle' && h.shape !== 'ring' ? INFUSED_REACH : 0), arc: h.arc ?? 1.8, width: h.width, angle: ang,
      damage: (h.damage || 5) * mult, knockback: h.knockback, stun: h.stun ?? 0.25, element: h.element || 'physical',
      status: h.status, duration: h.duration ?? 0.1, interval: h.interval, heavy: h.heavy, slashing: h.slashing, guardBreak: h.guardBreak,
      unblockable: h.unblockable, haki: h.haki || (actor.armament && def_isPhysical(h)), critChance: h.crit ?? (actor.critChance || 0.05),
      follow: h.follow, offX: Math.cos(ang) * off * reach, offY: -0.4 + Math.sin(ang) * off * reach, followAngle: h.followAngle,
      impactFrame: h.impactFrame, trueDamage: h.trueDamage, hitShips: h.hitShips, shipDamage: h.shipDamage, radial: h.radial,
      onHit: h.onHit, forceWater: h.forceWater, hitsAll: h.hitsAll, def: a.def,
      // (cuts that don't kill — Amputate; an explosion, never parried; a
      // quake that throws you off your feet; a paw that sends you flying off
      // the field; a blow that reaches only what's in the ROOM it was struck
      // in, and passes through no Logia's body)
      nonLethal: h.nonLethal, blast: h.blast, launch: h.launch, fling: h.fling, room: a.room || null, ignoreLogia: h.ignoreLogia || !!a.room, reachZ: h.reachZ,
    };
    game.combat.hitbox(hb);
    // the technique's look: smears, rings, beams, signatures (render/combatfx.js)
    game.fx.tech(actor, s, a, 'hit', hb);
    if (h.shake) game.fx.shake(h.shake, ang);
  }
  if (s.proj) {
    const p = s.proj;
    const n = p.count || 1;
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? (i / (n - 1) - 0.5) * (p.spread ?? 0.5) : (p.jitter ? (Math.random() - 0.5) * p.jitter : 0);
      const pa = ang + spread;
      const sp = p.speed || 14;
      const sx = actor.x + Math.cos(pa) * 0.6, sy = actor.y - 0.5 + Math.sin(pa) * 0.6;
      game.combat.projectile({
        owner: actor, x: game.world.wx(sx), y: sy, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp,
        range: p.range || 10, radius: p.radius || 0.3, damage: (p.damage || 5) * mult, element: p.element || 'physical',
        knockback: p.knockback ?? 2, stun: p.stun ?? 0.2, status: p.status, pierce: p.pierce, homing: p.homing,
        target: a.target, sprite: p.sprite || 'orb', color: p.color || col, size: p.size || 1, haki: actor.armament && p.element === undefined,
        stretch: p.stretch ? actor : null, passWalls: p.passWalls, hitShips: p.hitShips ?? true, shipDamage: p.shipDamage,
        slashing: p.slashing, heavy: p.heavy, critChance: 0.05, unblockable: p.unblockable, def: a.def,
        // (a shot, not a blow: a sword can turn it aside with a parry — unless it goes off on impact)
        isProj: true, explodes: !!p.explode,
        onEnd: p.explode ? (pr, g) => explode(pr, g, p.explode, mult) : null,
        trail: p.trail ? (pr, g) => trail(pr, g, p.trail) : null,
        draw: drawProjectile,
      });
    }
    game.fx.tech(actor, s, a, 'proj');
  }
  if (s.dash) {
    const d = s.dash;
    const dist = d.dist * (actor.dashMul || 1);
    // (`dive`: from the air, the charge comes down on its target — see flight.js)
    actor.dash = { vx: Math.cos(ang) * dist / d.time, vy: Math.sin(ang) * dist / d.time, t: d.time, ignoreWater: d.air, dive: d.dive };
    if (d.iframes) actor.iframes = Math.max(actor.iframes, d.iframes);
    if (d.hit) {
      game.combat.hitbox({
        owner: actor, x: actor.x, y: actor.y - 0.4, shape: 'circle', range: d.hit.range || 1.1, damage: (d.hit.damage || 5) * mult,
        knockback: d.hit.knockback ?? 4, stun: d.hit.stun ?? 0.3, element: d.hit.element || 'physical', follow: true, offX: 0, offY: -0.4,
        duration: d.time + 0.05, slashing: d.hit.slashing, heavy: d.hit.heavy, status: d.hit.status, radial: true, guardBreak: d.hit.guardBreak,
        unblockable: d.hit.unblockable, def: a.def, launch: d.hit.launch, ignoreLogia: !!a.room, reachZ: d.dive ? 3.5 : undefined,
      });
    }
    game.fx.tech(actor, s, a, 'dash'); // dust, streaks, afterimages, trail, cut lines
  }
  if (s.teleport) {
    const t = s.teleport;
    let dist = t.dist, tang = ang;
    // (to the target: right up in front of them, if they're within reach — the light-speed kick)
    const who = t.toTarget ? a.target || actor.controller?.target : null;
    if (who && who.alive !== false && who.x !== undefined) {
      const dx = game.world.dx(actor.x, who.x), dy = who.y - actor.y, d = Math.hypot(dx, dy);
      if (d <= dist + 1) { tang = Math.atan2(dy, dx); dist = Math.max(0, d - (t.gap ?? 1.1)); a.angle = tang; actor.facing = tang; }
    }
    // (in the air, anywhere you could fly; on foot, somewhere you could stand)
    const free = (x, y) => (actor.flying ? flyableAt(actor, game, x, y) : actor.canOccupy(game.world, x, y));
    let nx = actor.x, ny = actor.y;
    for (let k = 0; k < 20; k++) {
      const tx = actor.x + Math.cos(tang) * dist * (1 - k / 20), ty = actor.y + Math.sin(tang) * dist * (1 - k / 20);
      if (free(tx, ty)) { nx = tx; ny = ty; break; }
    }
    const x0 = actor.x, y0 = actor.y;
    actor.x = game.world.wx(nx); actor.y = ny;
    game.fx.tech(actor, s, a, 'teleport', { x0, y0 }); // afterimages / light streak / Room cubes
    actor.iframes = Math.max(actor.iframes, 0.15);
  }
  if (s.buff) {
    const b = actor.addBuff({ ...s.buff, source: a.def.id });
    game.fx.tech(actor, s, a, 'buff', { buff: b }); // transformation burst, Room dome, barrier...
  }
  if (s.heal) {
    const amt = s.heal * (a.def.source?.startsWith('fruit') ? 1 + (actor.fruitMastery || 0) * 0.02 : 1);
    actor.heal(amt, game);
    game.fx.tech(actor, s, a, 'heal');
  }
  // (the Phoenix's regenerating flames: its hybrid form shows while they burn)
  if (s.phoenix) actor.phoenixUntil = Math.max(actor.phoenixUntil || 0, (game.env?.time ?? game.time ?? 0) + s.phoenix);
  if (s.zone) {
    const z = s.zone;
    const zx = z.atTarget ? a.tx : actor.x + Math.cos(ang) * (z.offset || 0);
    const zy = z.atTarget ? a.ty : actor.y + Math.sin(ang) * (z.offset || 0);
    // (`grow`: metres more across for each point of fruit mastery — a ROOM grows with its surgeon)
    const r = z.range + (z.grow ? z.grow * (actor.fruitMastery || 0) : 0);
    const zone = {
      owner: actor, x: game.world.wx(zx), y: zy, r, t: z.duration, interval: z.interval || 0.5, damage: (z.damage || 0) * mult, element: z.element || 'physical', status: z.status, slow: z.slow, color: z.color || col, kind: z.kind || 'field', pull: z.pull,
      // a field's own rules (powers.js): ice that makes the sea a road, a cage
      // of strings that closes in and lets no one out, darkness that swallows
      // shots, gravity that drags fliers down, one that goes when its maker falls
      freezeWater: z.freezeWater, cage: z.cage, shrink: z.shrink, edge: z.edge, absorb: z.absorb, grounds: z.grounds, whileOwner: z.whileOwner, def: a.def,
    };
    // (one of a kind at a time: a new ROOM replaces the last)
    if (z.single) for (const o of game.areaZones) if (o.owner === actor && o.kind === zone.kind) o.t = 0;
    game.addZone(zone);
    game.fx.zone(zone, z, actor, a); // clouds, vortices, cages, sprouting arms, meteors...
  }
  if (s.power) {
    const fn = POWERS[s.power.kind];
    if (fn) fn(actor, s.power, game, a, s);
  }
  if (s.pull) {
    for (const e of game.actorsNear(actor.x, actor.y, s.pull.range)) {
      if (!game.combat.canHit(actor, e, {})) continue;
      const dx = game.world.dx(e.x, actor.x), dy = actor.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.knock(dx / d * s.pull.strength, dy / d * s.pull.strength);
      if (s.pull.stun) e.stagger(s.pull.stun);
      if (s.pull.nullify) e.addStatus('seastone', s.pull.nullify);
    }
    game.fx.tech(actor, s, a, 'pull');
  }
  if (s.conqueror) conquerorBurst(actor, game, s.conqueror, mult);
  if (s.summon && game.summon) game.summon(actor, s.summon);
  if (s.self) {
    if (s.self.iframes) actor.iframes = Math.max(actor.iframes, s.self.iframes);
    if (s.self.cleanse) actor.status = {};
    if (s.self.hurt && actor.d) {
      // recoil (Impact / Reject Dials): never lethal on its own
      const n = Math.round(actor.d.maxHp * s.self.hurt);
      actor.hp = Math.max(1, actor.hp - n);
      game.fx.text(actor.x, actor.y - 1.2, String(n), '#ff6b6b', 0.4);
      if (actor.isPlayer) game.ui?.onPlayerHurt(n);
    }
  }
  if (s.fx) game.fx.tech(actor, s.fx.color ? s : { ...s, fx: { ...s.fx, color: col } }, a, 'fx'); // rings, bursts, shake, impact frame, flash, callout
  if (s.sfx) game.audio?.sfx(s.sfx, actor);
}

function def_isPhysical(h) { return !h.element || h.element === 'physical'; }

function explode(p, game, e, mult) {
  // (a blast: blocked, perhaps, but never parried)
  game.combat.hitbox({ owner: p.owner, x: p.x, y: p.y, shape: 'circle', range: e.range || 1.8, damage: (e.damage || 10) * mult, knockback: e.knockback ?? 6, stun: e.stun ?? 0.4, element: e.element || 'explosion', duration: 0.1, radial: true, heavy: true, hitShips: true, status: e.status, blast: true });
  game.fx.explosion(p.x, p.y, e, p.owner); // fireball, shock ring, smoke, debris, scorch, shake
  game.audio?.sfx('explosion', p);
}

function trail(p, game, t) {
  game.fx.projTrail(p, t);
}

/** How much further (m) a blow wreathed in Conqueror's Infusion reaches: it hits without touching. */
export const INFUSED_REACH = 0.9;

/**
 * Conqueror's Haki: a king's will let loose. The weak-willed faint where
 * they stand; the strong are shaken. You it never knocks out — it buckles
 * your knees — unless you were born a king yourself: then yours answers it
 * at last (lives.js awaken), or, awakened, the two wills clash. Two kings
 * (one a boss, or you) clash rather than wash over each other: see clash.
 * Returns what happened ({ fainted, clash }).
 */
export function conquerorBurst(actor, game, c, mult) {
  const lvl = actor.hakiLevel('conqueror') || 20;
  const my = actor.power();
  // another king within reach: the two wills meet (game/haki.js clashes)
  let rival = null, rd = Infinity;
  for (const e of game.actorsNear(actor.x, actor.y, c.range * 1.5)) {
    if (e === actor || !game.combat.canHit(actor, e, {})) continue;
    const d = game.world.distance(actor.x, actor.y, e.x, e.y);
    if (d < rd && clashes(actor, e, d, c.range * 1.5)) { rival = e; rd = d; }
  }
  if (rival) { clash(actor, rival, game, c); return { fainted: 0, clash: rival }; }
  game.fx.conqueror(actor, c); // black lightning in their colour, shockwaves, cracked ground, impact frame, shake
  game.audio?.sfx('conqueror', actor);
  let fainted = 0;
  for (const e of game.actorsNear(actor.x, actor.y, c.range)) {
    if (e === actor || !game.combat.canHit(actor, e, {})) continue;
    if (e.isPlayer) { underPressure(e, actor, game, c, mult); continue; }
    if (overwhelms(e, my, lvl)) { e.faint(game); fainted++; continue; }
    e.stagger(0.6 + lvl * 0.01);
    e.takeDamage(Math.round((c.damage || 0) * mult), actor, { element: 'haki' }, game);
  }
  if (fainted && actor.isPlayer) game.log(`${fainted} ${fainted === 1 ? 'foe' : 'foes'} fainted before your will.`, '#ef5350');
  return { fainted, clash: null };
}

/** Does a king's will (Doriki `my`, Conqueror's `lvl`) knock `e` out cold? The weak-willed, never a boss. */
function overwhelms(e, my, lvl) {
  const resist = (e.hakiLevel && e.hakiLevel('conqueror') > 0) ? 0.5 : 0;
  return !e.boss && e.power() / Math.max(1, my) < 0.35 + lvl * 0.004 - resist;
}

/** The player under a foe's Conqueror's: a king-to-be wakes to it; a king stands unshaken; anyone else's knees buckle. */
function underPressure(p, k, game, c, mult) {
  const ch = p.char;
  if (ch?.traits?.includes('conqueror') && !p.hakiLevel('conqueror') && game.lives?.awaken) { game.lives.awaken('pressure', k); return; }
  if (p.hakiLevel('conqueror') > 0) { game.fx.text(p.x, p.y - 1.6, 'UNSHAKEN', sigOf(p).conqueror, 0.36); return; }
  // (Willpower steadies you)
  p.stagger(Math.max(0.25, 0.75 - (p.attrs?.wil || 0) * 0.006));
  p.takeDamage(Math.round((c.damage || 0) * mult * 0.5), k, { element: 'haki' }, game);
  game.fx.text(p.x, p.y - 1.6, 'PRESSURE!', '#ef9a9a', 0.36);
  game.log(`${k.name}'s will presses down on you like a weight: Conqueror's Haki. Your knees buckle, but you stay standing.`, '#ef9a9a');
  game.hintHaki?.();
}

/**
 * Two kings' Conqueror's meeting: the colours collide where their wills meet
 * and the sky splits above it (combatfx.js clashFx); neither gives way —
 * both are thrown back — and anyone weak-willed caught near is knocked out
 * cold by the overflow. Returns how many fainted.
 */
export function clash(a, b, game, c) {
  const w = game.world;
  const dx = w.dx(a.x, b.x), dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  game.fx.clash?.(a, b);
  game.audio?.sfx('conqueror_clash', a.isPlayer ? a : b);
  for (const [x, s] of [[a, -1], [b, 1]]) {
    x.knock(dx / d * 8 * s, dy / d * 8 * s);
    if (x.state === 'idle') x.stagger(x.isPlayer ? 0.35 : 0.55);
  }
  const strong = Math.max(a.power(), b.power()), lvl = Math.max(a.hakiLevel('conqueror'), b.hakiLevel('conqueror'));
  const mx = w.wx(a.x + dx / 2), my = a.y + dy / 2;
  let fainted = 0;
  for (const e of game.actorsNear(mx, my, (c?.range || 9) + d / 2)) {
    if (e === a || e === b || e.isPlayer || e.state !== 'idle' || e.faction === 'player') continue;
    if (overwhelms(e, strong, lvl)) { e.faint(game); fainted++; }
  }
  const p = a.isPlayer ? a : b.isPlayer ? b : null;
  if (p) {
    const o = p === a ? b : a;
    game.log(`Your Conqueror's Haki clashes with ${o.name}'s! The sky splits between your two wills.${fainted ? ` ${fainted} ${fainted === 1 ? 'onlooker' : 'onlookers'} fainted.` : ''}`, sigOf(p).conqueror);
    game.emit?.('conquerorClash', o);
  }
  return fainted;
}

export { clamp };
