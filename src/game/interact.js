// Context-sensitive "E" interactions.
import { WALKABLE } from '../world/tiles.js';
import { angleDiff } from '../core/math.js';
import { placeOnDeck, helmSpot, boardingSpot, freeDeckSpot } from './decks.js';
import { shipDims, deckToWorld, footprint, seatsOf } from '../world/hull.js';
import { bfront } from '../world/bframe.js';
import { canSee } from './ai.js';
import { allShips } from './ship.js';

export function findInteraction(game, p) {
  const w = game.world;
  if (p.state !== 'idle') return null;
  if (p.mode === 'sail') {
    const s = p.ship;
    if (!s) return null;
    // custom sea interactions (Knock Up Stream, Fish-Man Island dive, Red Port...)
    const special = game.seaInteraction ? game.seaInteraction(p, s) : null;
    if (special) return special;
    // E at the helm only lets go of it (there's no going ashore, or aboard
    // anything, at a key press: walk to her rail and jump). Under sail she
    // sails on, holding her course (Sea of Thieves style); a rowboat's oars
    // you ship when she's all but stopped
    if (!s.def.oarsOnly) return { label: s.sailSet > 0.05 || Math.abs(s.speed) > 1.6 ? 'Leave the helm (she sails on)' : 'Leave the helm (walk the deck)', key: 'E', run: () => leaveHelm(game, p, s) };
    if (Math.abs(s.speed) < 1.6) return { label: 'Leave the oars (stand up)', key: 'E', run: () => leaveHelm(game, p, s) };
    return null;
  }
  // sat on a chair, a bench or a barrel aboard (decks.js sitAboard): E gets you up
  if (p.seat && game.standUp) return { label: 'Stand up', key: 'E', run: () => game.standUp(p) };
  // on foot / swimming (boarding is by hand: jump onto a deck from a pier or
  // another deck — over her rail, never up her side — or into a rowboat from
  // the water; a big ship's ladder is climbed at its foot: see ladders.js)
  const cands = [];
  if (p.inWater && p.fruit && !p.gills && !p.climb) {
    // a Devil Fruit user in the sea can't climb, but can grab a line thrown
    // from the deck (of a ship of yours, or a friend's on a voyage together)
    for (const s of allShips(game)) {
      if (s.sunk || (s.owner !== 'player' && !s.netRemote)) continue;
      const d = w.distance(p.x, p.y, s.x, s.y);
      if (d < s.def.length * 0.55 + 6) cands.push({ d: d - 1, x: s.x, y: s.y, label: `Grab the line from the ${s.name}`, run: () => hauledAboard(game, p, s) });
    }
  }
  // people: only the one under your crosshair (or cursor) — standing near
  // someone isn't the same as talking to them
  const v3a = game.view3d?.active && game.view3d.rayHitsActor ? game.view3d : null;
  const ray = v3a ? v3a.pointerRay(game) : null;
  for (const a of game.actorsNear(p.x, p.y, ray ? 3.4 : 2.4)) {
    if (a === p || a.state !== 'idle' || !a.talk) continue;
    if (a.provoked && a.hostileNow) continue;
    const d = w.distance(p.x, p.y, a.x, a.y);
    if (ray) {
      const hit = v3a.rayHitsActor(ray, a);
      // (not through a wall or a shut door)
      if (!hit || !canSee(game, p, a)) continue;
      cands.push({ d: hit.miss * 0.4 + d * 0.05, aimed: true, x: a.x, y: a.y, label: `Talk to ${a.unmet ? '???' : a.name}`, run: () => game.emit('talk', a) });
    } else cands.push({ d, x: a.x, y: a.y, label: `Talk to ${a.unmet ? '???' : a.name}`, run: () => game.emit('talk', a) });
  }
  for (const a of game.actorsNear(p.x, p.y, 2.2)) {
    if (a === p || a.state !== 'knocked' || !a.canCarry) continue;
    cands.push({ d: w.distance(p.x, p.y, a.x, a.y) + 0.5, x: a.x, y: a.y, label: a.carryLabel || `Carry ${a.name}`, run: () => game.emit('carry', a) });
  }
  if (game.buildings) game.buildings.candidates(p, cands);
  if (w.objects) {
    for (const o of w.objects.near(p.x, p.y, 3.2)) {
      if (o.enterable) continue; // walk in (see game/buildings.js)
      if (o.kind === 'building' && o.role && o.role !== 'house' && o.door) {
        const f = bfront(o);
        const d = w.distance(p.x, p.y, o.door.x + f.x * 0.3, o.door.y + f.y * 0.3);
        if (d < 1.6) cands.push({ d, x: o.door.x, y: o.door.y, label: o.name ? `Enter ${o.name}` : 'Enter', run: () => game.emit('enterBuilding', o) });
      } else if (o.kind === 'building' && o.role === 'house' && o.door) {
        const f = bfront(o);
        const d = w.distance(p.x, p.y, o.door.x + f.x * 0.3, o.door.y + f.y * 0.3);
        if (d < 1.2) cands.push({ d: d + 0.5, x: o.door.x, y: o.door.y, label: 'Knock on the door', run: () => game.emit('knockDoor', o) });
      } else if (o.kind === 'chest' && !o.opened) {
        const d = w.distance(p.x, p.y, o.x, o.y);
        if (d < 1.6) cands.push({ d, x: o.x, y: o.y, label: 'Open the chest', run: () => game.emit('openChest', o) });
      } else if (o.interact) {
        const d = w.distance(p.x, p.y, o.x, o.y);
        if (d < (o.interactRange || 1.8)) cands.push({ d, x: o.x, y: o.y, label: o.interact, run: () => game.emit('useObject', o) });
      } else if (o.kind === 'dummy') {
        const d = w.distance(p.x, p.y, o.x, o.y);
        if (d < 1.8) cands.push({ d: d + 0.3, x: o.x, y: o.y, label: 'Train (strike the dummy)', run: () => game.emit('trainDummy', o) });
      }
    }
  }
  // aboard one of your own ships: turn in for the night in a bunk or a hammock
  // (where you'll wake if you fall, as at an inn — and free)
  const own = p.deck?.ship;
  if (own && own.owner === 'player' && !own.sunk && game.services?.restAboard) {
    const d = shipDims(own.def);
    const u = p.deck.t * d.L - d.L / 2, v = p.deck.v;
    for (const it of d.furniture || []) {
      if (it.kind !== 'bunk' && it.kind !== 'hammock') continue;
      // (in the same room as you, on its floor; within reach of its side or its end)
      if (Math.abs((p.deck.h ?? 0) - it.floor) > 0.6) continue;
      const f = footprint(it);
      const dd = Math.hypot(Math.max(f.u0 - u, 0, u - f.u1), Math.max(f.v0 - v, 0, v - f.v1));
      if (dd > 1.1) continue;
      const at = deckToWorld(own, (it.u + d.L / 2) / d.L, it.v);
      cands.push({ d: dd + 0.3, x: at.x, y: at.y, label: `Sleep in the ${it.kind} (wake here if you fall)`, run: () => game.services.restAboard(own, it) });
    }
  }
  // aboard any ship, out of a fight: sit down on a chair, a bench or a barrel
  // (in the same room as you, within a step of it)
  const on = p.deck?.ship;
  if (on && !on.sunk && !p.deck.plank && !p.inCombat && game.sitAboard) {
    const d = shipDims(on.def);
    const u = p.deck.t * d.L - d.L / 2, v = p.deck.v;
    for (const st of seatsOf(d)) {
      if (Math.abs((p.deck.h ?? 0) - st.floor) > 0.6) continue;
      const dd = Math.hypot(st.u - u, st.v - v);
      if (dd > 1.25) continue;
      const at = deckToWorld(on, (st.u + d.L / 2) / d.L, st.v);
      cands.push({ d: dd + 0.4, x: at.x, y: at.y, label: `Sit on the ${st.kind}`, run: () => game.sitAboard(p, on, st) });
    }
  }
  for (const it of game.groundItems || []) {
    const d = w.distance(p.x, p.y, it.x, it.y);
    if (d < 1.4) cands.push({ d: d - 0.2, x: it.x, y: it.y, label: `Pick up ${it.label}`, run: () => game.emit('pickup', it) });
  }
  if (game.footInteraction) { const x = game.footInteraction(p); if (x) cands.push(x); }
  if (!cands.length) return null;
  // in the 3D view, prefer what you are looking at
  const v3 = game.view3d?.active ? game.view3d : null;
  if (v3 && cands.length > 1) {
    for (const c of cands) {
      if (c.x === undefined || c.aimed) continue;
      c.d += Math.abs(angleDiff(v3.rig.yaw, Math.atan2(c.y - p.y, w.dx(p.x, c.x)))) * 0.9;
    }
  }
  cands.sort((a, b) => a.d - b.d);
  return cands[0];
}

/** Is there room to stand at (x, y): open ground, clear of walls and props, with a little room behind? */
export function standable(w, x, y) {
  if (!WALKABLE[w.type(x, y)] || w.isBlocked(x, y) || w.hitsProp(x, y, 0.4)) return false;
  return !!WALKABLE[w.type(x, y - 0.4)] && !w.isBlocked(x, y - 0.4);
}

export function findShore(w, x, y, r) {
  let best = null, bd = Infinity;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r || d >= bd) continue;
      const tx = x + dx, ty = y + dy;
      if (!standable(w, tx, ty)) continue;
      bd = d; best = { x: Math.floor(tx) + 0.5, y: Math.floor(ty) + 0.8 };
    }
  }
  return best;
}

/**
 * Let go of the wheel (or ship the oars) and stand on the deck beside it. A
 * ship under sail keeps them set and sails on, straight ahead, till you take
 * the wheel again; a rowboat with nobody at the oars drifts to a stop.
 */
export function leaveHelm(game, p, s) {
  const sailing = !s.def.oarsOnly && s.sail > 0.02;
  s.captain = null; s.rowing = 0; s.rowPow = 0; s.rowL = 0; s.rowR = 0;
  if (!sailing) { s.sail = 0; s.anchored = true; }
  s.passengers = s.passengers.filter((x) => x !== p);
  p.mode = 'foot';
  p.onShip = false;
  const hs = helmSpot(s), d = shipDims(s.def);
  if (d.big) {
    // (beside the double wheel, between it and the stairs up to the poop,
    // clear of the cabin front behind it)
    const sp = freeDeckSpot(s, (d.wheelU + d.L / 2) / d.L, 1.12, 'quarter');
    placeOnDeck(game, p, s, sp.t, sp.v);
  } else if (s.def.oarsOnly) placeOnDeck(game, p, s, hs.t - 0.12, 0);
  else placeOnDeck(game, p, s, hs.t, 0);
  game.emit('disembark', s, null);
  game.hint?.('deck', s.def.oarsOnly
    ? 'Stand in your boat, and jump over her side to go ashore or for a swim (from the water, a jump brings you back in over her low side). Press E at the seat to take the oars again.'
    : 'Walk your deck freely — she keeps the sails you set and sails on straight ahead. Jump over the rail to go ashore or for a swim (her ladder amidships brings you back up: E at its foot). To board a ship lying alongside, hold Space for a charged leap across — or stop beside her, and your crew run a plank over. Press E at the wheel to take the helm again: steer, or lower the sails (S) to stop.');
}

/** A Devil Fruit user in the sea, hauled up onto the deck on a line thrown from it. */
export function hauledAboard(game, p, s) {
  const spot = boardingSpot(game, s, p.x, p.y);
  p.startClimb(game, { ship: s, t: spot.t, v: spot.v });
  game.log(s.netRemote ? `A line from the ${s.name}: you're hauled up her side, dripping and weak.` : `Your crew haul you up the side of the ${s.name} on a line, dripping and weak.`, '#81d4fa');
}

export function board(game, p, s) {
  if (p.inWater) p.leaveWater?.(game);
  if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
  p.mode = 'sail';
  p.ship = s;
  p.onShip = true;
  p.inWater = false;
  s.captain = p;
  p.x = s.x; p.y = s.y;
  p.setBlock(false);
  p.action = null;
  game.emit('board', s);
  if (s.def.oarsOnly) game.hint('rowing', 'Rowing: W pulls on the oars, S backs water, A/D pull one oar to turn her. No sail and no wind — just your arms (and the currents). Once she\'s all but stopped, E ships the oars and you stand up in her: jump over her side to go ashore.');
  else game.hint('sailing', 'Sailing: W raises the sails, S lowers them, A/D steer. Hold SPACE to row (works without wind). Left-click fires a broadside toward the mouse. E leaves the helm: walk her deck, and jump over her rail to go ashore.');
  game.audio?.sfx('board');
}
