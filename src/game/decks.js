// Walking the decks of ships. A ship's deck (main deck, quarterdeck and
// forecastle) is solid ground for anyone standing on it, and carries them
// along as the ship sails or turns; the bulwarks keep you aboard unless you
// jump over the rail, and you can't swim through a hull — you climb aboard.
import { deckPoint, deckToWorld, helmPoint, shipDims } from '../world/hull.js';

export function installDecks(game) {
  /** The deck under a point: { ship, t, v, h, edge } or null (margin: how far in from the rail). */
  game.deckAt = (x, y, margin = 0.2) => {
    const w = game.world;
    for (const s of game.ships) {
      if (s.sunk) continue;
      const r = s.def.length * 0.56;
      const dx = w.dx(s.x, x), dy = y - s.y;
      if (dx * dx + dy * dy > r * r) continue;
      const d = deckPoint(s, dx, dy, margin);
      if (d) { d.ship = s; return d; }
    }
    return null;
  };
}

/** Put an actor on a ship's deck at (t along, v across), facing the bow. */
export function placeOnDeck(game, a, ship, t, v = 0) {
  const p = deckToWorld(ship, t, v);
  a.x = game.world.wx(p.x); a.y = p.y;
  a.z = 0; a.vz = 0; a.vx = 0; a.vy = 0;
  a.inWater = false; a.depth = 0; a.under = false;
  if (a.deck && a.deck.ship !== ship) a.deck.ship.aboard?.delete(a);
  a.deck = game.deckAt(a.x, a.y, 0) || { ship, t, v, h: p.h, edge: 0.3 };
  a.deck.ship = ship;
  (ship.aboard || (ship.aboard = new Set())).add(a);
  a.facing = ship.heading;
}

/** Where the wheel is (deck position just forward of it). */
export function helmSpot(ship) {
  const d = shipDims(ship.def);
  const hp = helmPoint(ship.def);
  return { t: Math.min(0.5, (hp.x + d.L / 2) / d.L + 0.06), v: 0 };
}

/** The main hatch (the hold) on a ship's deck. */
export function hatchSpot(ship) {
  const d = shipDims(ship.def);
  return { t: d.open ? 0.5 : 0.55, v: 0 };
}

/** Distance from an actor to a deck spot. */
export function deckDist(game, a, ship, spot) {
  const p = deckToWorld(ship, spot.t, spot.v);
  return game.world.distance(a.x, a.y, p.x, p.y);
}

/** The nearest point on a ship's deck to a swimmer beside it (for climbing aboard). */
export function nearestDeck(game, a, ship) {
  let best = null;
  for (let t = 0.12; t <= 0.9; t += 0.04) {
    for (const v of [-0.35, 0, 0.35]) {
      const p = deckToWorld(ship, t, v * ship.def.beam * 0.5);
      const dd = game.world.distance(a.x, a.y, p.x, p.y);
      if (!best || dd < best.d) best = { t, v: v * ship.def.beam * 0.5, d: dd };
    }
  }
  return best;
}
