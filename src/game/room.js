// Ope Ope no Mi: the ROOM, and the surgeon at work inside it.
//
// ROOM (data/fruits.js ope_room) is a zone of kind 'room': a pale blue
// sphere opened where it was cast, and there it stays — however its surgeon
// moves about — until it fades, another is cast, or they go down (or into
// the sea). Inside their own Room the surgeon's techniques work (outside it
// most don't — `room: 'need'`, see abilities.js canUse — and the rest are
// half as strong), their blows reach whatever is in the Room (and nothing
// outside it) and pass through a Logia's body, and they can:
//   Shambles – change places with anyone in the Room (foe, friend or beast:
//              a foe winding up a blow finds themselves somewhere else, the
//              blow gone), or simply be wherever in it they aim;
//   Takt     – lift everyone in the Room into the air, hold them there,
//              helpless, and slam them down (the lift is the victim's own,
//              run from Actor.update: see updateLift).
// Cut to pieces (Amputate, Radio Knife: 'pieces') and a heart taken out in a
// cube (Mes: 'heartless') are statuses: see actor.js HELPLESS.
import { flyableAt } from './flight.js';

export const ROOM_BLUE = '#81d4fa';

/** Is (x, y) inside Room zone `z` (within `pad` of its edge)? */
export function inRoom(game, z, x, y, pad = 0) {
  return !!z && z.t > 0 && game.world.distance(z.x, z.y, x, y) <= z.r + pad;
}

/** The ROOM of `actor`'s own that they stand in just now, or null. */
export function ownRoom(actor, game = actor?.game) {
  const zs = game?.areaZones;
  if (!zs || !zs.length || !actor) return null;
  for (const z of zs) {
    if (z.kind !== 'room' || z.owner !== actor || !(z.t > 0)) continue;
    if (game.world.distance(z.x, z.y, actor.x, actor.y) <= z.r) return z;
  }
  return null;
}

/** Any ROOM of `actor`'s still open, wherever they are (or null). */
export function roomOf(actor, game = actor?.game) {
  for (const z of game?.areaZones || []) if (z.kind === 'room' && z.owner === actor && z.t > 0) return z;
  return null;
}

/** Can Shambles move this body? (not someone at a ship's helm, up a ladder, or one the story keeps where it is) */
function movable(e, actor) {
  return e !== actor && e.alive !== false && e.state !== 'dead' && !e.hidden && !e.onShip && !e.climb && !e.invulnerable && !e.seaCreature
    && (e.deck?.ship || null) === (actor.deck?.ship || null);
}

/**
 * Shambles: change places with whoever is aimed at in the Room — or, with
 * nobody there, be at the spot aimed at (kept inside the Room).
 */
export function shambles(actor, p, game, a, s) {
  const z = a.room || ownRoom(actor, game);
  if (!z) return;
  const w = game.world;
  let who = a.target && a.target.alive !== undefined && movable(a.target, actor) && inRoom(game, z, a.target.x, a.target.y) ? a.target : null;
  if (!who && a.tx !== undefined) {
    let bd = 2.2 * 2.2;
    for (const e of game.actorsNear(a.tx, a.ty, 2.2)) {
      if (!movable(e, actor) || !inRoom(game, z, e.x, e.y)) continue;
      const d = w.dist2(a.tx, a.ty, e.x, e.y);
      if (d < bd) { bd = d; who = e; }
    }
  }
  const x0 = actor.x, y0 = actor.y;
  if (who) {
    actor.x = who.x; actor.y = who.y;
    who.x = x0; who.y = y0;
    // (a foe finds themselves somewhere else: whatever they were swinging is gone)
    if (game.combat.canHit(actor, who, {})) {
      who.stagger(who.boss ? 0.2 : 0.4);
      who.facing = Math.atan2(actor.y - who.y, w.dx(who.x, actor.x));
    }
    actor.facing = Math.atan2(who.y - actor.y, w.dx(actor.x, who.x));
    if (who.lastG !== undefined) who.lastG = null;
  } else {
    // (to the spot aimed at: kept inside the Room, and somewhere there's room to be)
    let tx = a.tx ?? actor.x + Math.cos(a.angle) * 5, ty = a.ty ?? actor.y + Math.sin(a.angle) * 5;
    const dx = w.dx(z.x, tx), dy = ty - z.y, d = Math.hypot(dx, dy), lim = Math.max(0.5, z.r - 0.6);
    if (d > lim) { tx = w.wx(z.x + dx / d * lim); ty = z.y + dy / d * lim; }
    const free = (x, y) => (actor.flying ? flyableAt(actor, game, x, y) : actor.canOccupy(w, x, y));
    const bx = w.dx(tx, actor.x), by = actor.y - ty;
    for (let k = 0; k <= 16; k++) {
      const x = w.wx(tx + bx * (k / 16)), y = ty + by * (k / 16);
      if (free(x, y)) { actor.x = x; actor.y = y; break; }
    }
  }
  actor.lastG = null;
  actor.iframes = Math.max(actor.iframes, 0.2);
  game.fx.tech(actor, s, a, 'power', { x0, y0, swapped: who, room: z });
  game.audio?.sfx('whoosh', actor);
}

/**
 * Takt: everyone in the Room (who can be hurt) is lifted into the air and
 * held there, then slammed down for `damage`.
 */
export function takt(actor, p, game, a, s) {
  const z = a.room || ownRoom(actor, game);
  if (!z) return;
  const lifted = [];
  for (const e of game.actorsNear(z.x, z.y, z.r + 1)) {
    if (e === actor || !inRoom(game, z, e.x, e.y) || !game.combat.canHit(actor, e, { room: z })) continue;
    if (e.state !== 'idle' || e.inWater || e.flying || e.onShip || e.climb || e.lift) continue;
    startLift(e, actor, game, { h: p.h ?? 2.6, hold: p.hold ?? 1.1, damage: (p.damage || 20) * a.mult, def: a.def });
    lifted.push(e);
  }
  game.fx.tech(actor, s, a, 'power', { room: z, lifted });
  if (actor.isPlayer && !lifted.length) game.fx.text(actor.x, actor.y - 1.8, 'Nobody in the Room', '#81d4fa', 0.3);
}

/**
 * Lift `e` into the air on `owner`'s say: up to `h` m, held there helpless
 * for `hold` s (a boss for less of it, and lower; you never for long), then
 * slammed down for `damage` (see updateLift).
 */
export function startLift(e, owner, game, o) {
  let hold = o.hold * (e.boss ? 0.6 : 1);
  if (e.isPlayer) hold = Math.min(hold, 0.9);
  e.lift = { t: 0, hold, h: o.h * (e.boss ? 0.7 : 1), damage: o.damage, owner, def: o.def, slam: false };
  e.addStatus('lifted', hold + 0.8, owner);
  e.action = null; e.blocking = false; e.dash = null; e.charging = 0;
  e.kb.x = 0; e.kb.y = 0;
}

/** A lifted body this frame (after its fall, if any: see Actor.update): up, held, then down hard. */
export function updateLift(e, dt, game) {
  const L = e.lift;
  if (!L) return;
  if (e.state !== 'idle' || e.alive === false || e.inWater || e.flying) { e.lift = null; delete e.status.lifted; return; }
  L.t += dt;
  // (the cube that grips the body goes up and down with it: see combatfx's Takt)
  if (L.cube) L.cube.z = (e.z || 0) + 0.9;
  if (!L.slam) {
    // (up quickly, easing to a stop, and held there)
    const k = Math.min(1, L.t / 0.35);
    e.z = L.h * (1 - (1 - k) * (1 - k));
    e.vz = 0; e.vx = 0; e.vy = 0; e.kb.x = 0; e.kb.y = 0;
    e.airT = 0.1;
    if (L.t >= L.hold) { L.slam = true; e.vz = -20; }
    return;
  }
  if ((e.z || 0) > 0.02 || e.vz) return;
  // down: the slam lands
  e.lift = null;
  delete e.status.lifted;
  if (!L.owner || L.owner.alive === false || L.owner.state !== 'idle') return;
  game.combat.applyHit(L.owner, e, {
    owner: L.owner, x: e.x, y: e.y - 0.4, shape: 'circle', range: 0.5, damage: L.damage, knockback: 1.5, stun: 0.7, heavy: true,
    unblockable: true, radial: true, def: L.def, ignoreLogia: true, element: 'physical', critChance: 0, impactFrame: false,
  });
  game.fx.ring(e.x, e.y, 0.2, 1.6, '#e1f5fe', 0.4, 0.14, { z: 0.05, flat: 0.6, add: true });
  game.fx.crack(e.x, e.y, 1.1, 1.6);
  game.fx.burst(e.x, e.y, 10, { color: ['#d7ccc8', '#efebe9'], speed: 3, g: 1.2, z: 0.1, vz: 0.8, life: 0.5, kind: 'dust', size: 0.2, grow: 0.4 });
  if (e.isPlayer || L.owner.isPlayer) game.fx.shake(0.3);
}
