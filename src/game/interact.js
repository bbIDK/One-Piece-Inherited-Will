// Context-sensitive "E" interactions.
import { WALKABLE } from '../world/tiles.js';
import { angleDiff } from '../core/math.js';
import { placeOnDeck, helmSpot, boardingSpot } from './decks.js';
import { shipDims } from '../world/hull.js';
import { bfront } from '../world/bframe.js';
import { canSee } from './ai.js';

export function findInteraction(game, p) {
  const w = game.world;
  if (p.state !== 'idle') return null;
  if (p.mode === 'sail') {
    const s = p.ship;
    if (!s) return null;
    // custom sea interactions (Knock Up Stream, Fish-Man Island dive, Red Port...)
    const special = game.seaInteraction ? game.seaInteraction(p, s) : null;
    if (special) return special;
    const spot = findShore(w, s.x, s.y, s.def.length * 0.5 + 2.5);
    if (spot && Math.abs(s.speed) < 4.5) {
      const isl = w.islandAt(spot.x, spot.y) || w.nearestIsland(spot.x, spot.y, 40);
      return { label: `Go ashore${isl && isl.name ? ' — ' + isl.name : ''}`, key: 'E', run: () => disembark(game, p, spot) };
    }
    // hove to: leave the wheel and walk your own deck
    if (Math.abs(s.speed) < 1.6) return { label: 'Leave the helm (walk the deck)', key: 'E', run: () => leaveHelm(game, p, s) };
    return null;
  }
  // on foot / swimming (boarding is by hand: jump onto a deck from a pier or
  // another deck, or climb her side from the water — Space at the hull)
  const cands = [];
  if (p.inWater && p.fruit && !p.gills && !p.climb) {
    // a Devil Fruit user in the sea can't climb, but can grab a line thrown from the deck
    for (const s of game.ships) {
      if (s.sunk || s.owner !== 'player') continue;
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
      cands.push({ d: hit.miss * 0.4 + d * 0.05, aimed: true, x: a.x, y: a.y, label: `Talk to ${a.name}`, run: () => game.emit('talk', a) });
    } else cands.push({ d, x: a.x, y: a.y, label: `Talk to ${a.name}`, run: () => game.emit('talk', a) });
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

export function findShore(w, x, y, r) {
  let best = null, bd = Infinity;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r || d >= bd) continue;
      const tx = x + dx, ty = y + dy;
      const t = w.type(tx, ty);
      if (!WALKABLE[t] || w.isBlocked(tx, ty) || w.hitsProp(tx, ty, 0.4)) continue;
      // need a little standing room
      if (!WALKABLE[w.type(tx, ty - 0.4)] || w.isBlocked(tx, ty - 0.4)) continue;
      bd = d; best = { x: Math.floor(tx) + 0.5, y: Math.floor(ty) + 0.8 };
    }
  }
  return best;
}

export function disembark(game, p, spot) {
  const s = p.ship;
  if (s) { s.captain = null; s.sail = 0; s.rowing = 0; s.anchored = true; s.passengers = s.passengers.filter((x) => x !== p); }
  p.mode = 'foot';
  p.onShip = false;
  p.x = spot.x; p.y = spot.y;
  p.vx = p.vy = 0;
  game.emit('disembark', s, spot);
  game.audio?.sfx('step');
}

/** Let go of the wheel and stand on the deck beside it (the ship heaves to). */
export function leaveHelm(game, p, s) {
  s.captain = null; s.sail = 0; s.rowing = 0; s.anchored = true;
  s.passengers = s.passengers.filter((x) => x !== p);
  p.mode = 'foot';
  p.onShip = false;
  const hs = helmSpot(s);
  if (shipDims(s.def).big) placeOnDeck(game, p, s, hs.t, 0.9);
  else placeOnDeck(game, p, s, hs.t + 0.05, 0);
  game.emit('disembark', s, null);
  game.hint?.('deck', 'Walk your deck freely — jump over the rail for a swim (Space at her side climbs back aboard), and press E at the wheel to take the helm again.');
}

/** A Devil Fruit user in the sea, hauled up onto the deck on a line thrown from it. */
export function hauledAboard(game, p, s) {
  const spot = boardingSpot(game, s, p.x, p.y);
  p.startClimb(game, { ship: s, t: spot.t, v: spot.v });
  game.log(`Your crew haul you up the side of the ${s.name} on a line, dripping and weak.`, '#81d4fa');
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
  game.hint('sailing', 'Sailing: W raises the sails, S lowers them, A/D steer. Hold SPACE to row (works without wind). Left-click fires a broadside toward the mouse. E near land to go ashore.');
  game.audio?.sfx('board');
}
