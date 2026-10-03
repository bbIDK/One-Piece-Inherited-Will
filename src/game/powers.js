// What some Devil Fruits do beyond a blow, a shot or a field — the rules the
// anime gives them, kept apart from the data (data/fruits.js) and the
// hit-resolution that calls into them (combat.js, actor.js, game.js):
//
//  * `power` steps by kind (abilities.js runStep): Shambles and Takt inside a
//    ROOM (room.js), a Liberation that lets out what the darkness swallowed.
//  * Fields with rules of their own (game.addZone): Ice Age's ice, a road
//    over the sea while it lasts (iceAt); the Birdcage, closing in and
//    letting nobody out; a Black Hole that swallows shots; gravity that
//    drags fliers out of the sky; a ROOM that goes when its surgeon falls.
//  * Bodies that stop or turn things: Bartolomeo's barrier (in front of him,
//    or all round him in a ball), Kuma's Repel and Luffy's Balloon (shots
//    sent back the way they came).
//  * The look of the helpless states a power leaves (Mes: a heart in a cube;
//    Amputate: a body in pieces; Parasite: strings; a stolen shadow).
import { angleDiff } from '../core/math.js';
import { shambles, takt, roomFollows } from './room.js';

/**
 * Liberation (Yami): let out everything the darkness swallowed — the shots
 * a Black Hole took in (absorbShots) come back out as one blast.
 */
function release(actor, p, game, a, s) {
  const store = Math.min(p.cap ?? 220, actor.absorbed || 0);
  actor.absorbed = 0;
  if (store <= 0) return;
  game.combat.hitbox({
    owner: actor, x: actor.x, y: actor.y - 0.4, shape: 'circle', range: p.range || 5, damage: store * (p.mul ?? 1.2) * (a.mult || 1), knockback: 10, stun: 0.6,
    element: 'dark', heavy: true, radial: true, duration: 0.1, def: a.def, blast: true,
  });
  game.fx.tech(actor, s, a, 'power', { store });
  if (actor.isPlayer) game.fx.text(actor.x, actor.y - 2, 'LIBERATION!', '#b388ff', 0.45);
}

export const POWERS = { shambles, takt, release };

// ------------------------------------------------------------------ fields
/** Is there ice underfoot at (x, y) — Ice Age's frozen sea — just now? */
export function iceAt(game, x, y) {
  const zs = game?.areaZones;
  if (!zs || !zs.length) return false;
  for (const z of zs) if (z.freezeWater && z.t > 0 && game.world.distance(z.x, z.y, x, y) <= z.r) return true;
  return false;
}

/**
 * A field's own rules, each frame (after everyone has moved: game.updateZones):
 * one that goes with its maker, a cage that shrinks and holds whoever's in
 * it, gravity that pulls fliers down.
 */
export function zoneRules(game, z, dt) {
  const o = z.owner;
  if (z.whileOwner && (!o || o.alive === false || o.state !== 'idle' || o.inWater)) { z.t = 0; return; }
  // (an awakened surgeon's ROOM goes where they go: room.js)
  if (z.kind === 'room' && roomFollows(z)) { z.x = o.x; z.y = o.y; }
  if (z.shrink) {
    // (the Birdcage closes in: to (1 - shrink) of its size by the end)
    z.r0 = z.r0 ?? z.r;
    z.r = z.r0 * (1 - z.shrink * (1 - Math.max(0, z.t) / Math.max(0.01, z.t0)));
    if (z.shape) z.shape.r = z.r;
  }
  if (z.cage) {
    const w = game.world;
    z.held = z.held || new Set();
    // (whoever is inside the strings — and whoever comes in — is caught)
    for (const a of game.actorsNear(z.x, z.y, z.r)) if (a !== o && a.state !== 'dead' && game.combat.canHit(o, a, {})) z.held.add(a);
    for (const a of z.held) {
      if (!a.alive || a.state === 'dead') { z.held.delete(a); continue; }
      const dx = w.dx(z.x, a.x), dy = a.y - z.y, d = Math.hypot(dx, dy);
      // (nobody gets out: back inside the strings)
      const lim = Math.max(0.3, z.r - (a.r || 0.3) - 0.05);
      if (d > lim) {
        const k = lim / (d || 1);
        a.x = w.wx(z.x + dx * k); a.y = z.y + dy * k;
        a.kb.x *= -0.2; a.kb.y *= -0.2;
        if (a.dash) a.dash = null;
        if (a.flying) a.flightOut = true;
      }
    }
  }
  if (z.grounds) {
    // (gravity drags whoever flies over it out of the sky)
    for (const a of game.actorsNear(z.x, z.y, z.r)) if (a.flying && a.flight && game.combat.canHit(o, a, {})) a.flightOut = true;
  }
}

// ------------------------------------------------------------------ shots
/**
 * A shot meeting a body that sends it back (Repel, Balloon): turned round
 * at whoever fired it, theirs now. Three times at most back and forth.
 * True if `p` was turned.
 */
export function reflectShot(game, p, actors) {
  if ((p.reflected || 0) >= 3 || !p.owner) return false;
  const w = game.world;
  for (const a of actors) {
    if (a === p.owner || !a.alive || a.state !== 'idle') continue;
    const R = reflectRadius(a);
    if (!R || w.dist2(p.x, p.y, a.x, a.y - 0.5) > R * R) continue;
    if (!game.combat.canHit(p.owner, a, p)) continue;
    const back = p.owner, sp = Math.hypot(p.vx, p.vy) * 1.1;
    const ang = back.alive !== false ? Math.atan2(back.y - 0.5 - p.y, w.dx(p.x, back.x)) : Math.atan2(-p.vy, -p.vx);
    p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
    p.owner = a; p.target = back; p.hit = new Set(); p.traveled = 0; p.t = 0;
    p.range = Math.max(p.range, w.distance(p.x, p.y, back.x, back.y) + 3);
    p.reflected = (p.reflected || 0) + 1;
    p.cued = true;
    game.fx.ring(p.x, p.y, 0.1, 1.2, '#ffffff', 0.25, 0.08, { z: 0.9, add: true });
    game.fx.text(a.x, a.y - 1.6, a.buffs.find((b) => b.reflect)?.reflectWord || 'REPEL!', '#ffffff', 0.32);
    game.audio?.sfx('parry', a);
    return true;
  }
  return false;
}

/** How far out a body turns shots back just now (Repel, Balloon), or 0. */
export function reflectRadius(a) {
  let R = 0;
  for (const b of a.buffs || []) if (b.reflect) R = Math.max(R, b.reflect);
  return R;
}

/**
 * A shot flying into a Black Hole (a zone with `absorb`) of somebody else's:
 * swallowed, and stored up in its maker for a Liberation. True if it was.
 */
export function absorbShot(game, p) {
  const zs = game.areaZones;
  if (!zs || !zs.length) return false;
  for (const z of zs) {
    if (!z.absorb || !(z.t > 0) || z.owner === p.owner || !z.owner) continue;
    if (game.world.distance(z.x, z.y, p.x, p.y) > z.r) continue;
    z.owner.absorbed = Math.min(400, (z.owner.absorbed || 0) + (p.damage || 0) * 0.6);
    p.onEnd = null; // (swallowed whole: nothing goes off)
    game.fx.burst(p.x, p.y + 0.5, 6, { color: ['#12001c', '#311b92', '#7e57c2'], speed: 2, g: 0, z: 0.9, life: 0.35, kind: 'smoke', size: 0.2 });
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ barriers
/**
 * Does a barrier stop this blow (or shot) on `tgt`? Bartolomeo's barrier
 * ({ barrier: 'front' }) is a wall in front of him — from behind he's open;
 * a Barrier Ball ('all') stops everything. Nothing breaks it; only what
 * works from the inside (a Gamma Knife, Ryuo) gets through.
 */
export function barrierStops(game, tgt, att, h) {
  const b = (tgt.buffs || []).find((x) => x.barrier);
  if (!b || h.trueDamage) return false;
  if (b.barrier === 'all') return true;
  const w = game.world;
  let from;
  if (h.vx !== undefined) from = Math.atan2(-h.vy, -h.vx);
  else if (h.radial && !h.follow) from = Math.atan2(h.y + 0.4 - tgt.y, w.dx(tgt.x, h.x));
  else if (att) from = Math.atan2(att.y - tgt.y, w.dx(tgt.x, att.x));
  else return false;
  return Math.abs(angleDiff(tgt.facing, from)) < 1.75;
}

// ------------------------------------------------------------------ the look of a helpless body
/** A status some power has just put on `a` (by `src`): how it looks. */
export function statusFx(game, a, k, dur, src) {
  const fx = game?.fx;
  if (!fx) return;
  const l = a._lastLook || a.look || {};
  if (k === 'pieces') {
    // (cut into pieces that hang in the air where the body was, still alive)
    fx.add('pieces', { x: a.x, y: a.y, follow: a, r: 0.75 * (l.scale || 1), skin: l.skin, top: l.top, bottom: l.bottom, life: dur });
    fx.burst(a.x, a.y, 8, { color: ['#e1f5fe', '#81d4fa'], speed: 3, g: 0, z: 0.9, life: 0.3, kind: 'line', size: 0.06 });
  } else if (k === 'heartless' && src) {
    // (the heart, still beating, in a cube in the surgeon's hand)
    fx.add('cube', { x: src.x, y: src.y, follow: src, ox: Math.cos(src.facing || 0) * 0.45, oy: Math.sin(src.facing || 0) * 0.3, z: 1.15, size: 0.22, color: '#81d4fa', heart: true, life: dur, spin: 0.8 });
    fx.text(a.x, a.y - 1.8, 'MES', '#81d4fa', 0.34);
  } else if (k === 'puppet' && src) {
    fx.add('strings', { x: src.x, y: src.y, x1: a.x, y1: a.y, color: '#f8bbd0', n: 5, life: Math.min(dur, 2.5) });
  } else if (k === 'shadowless') {
    fx.burst(a.x, a.y, 10, { color: ['#263238', '#000000'], speed: 1.5, g: 0, z: 0.2, life: 0.6, kind: 'smoke', size: 0.25 });
  }
}
