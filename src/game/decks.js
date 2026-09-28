// Walking the decks of ships. A ship's deck (main deck, quarterdeck and
// forecastle) is solid ground for anyone standing on it, and carries them
// along as the ship sails or turns; the bulwarks keep you aboard unless you
// jump over the rail, and you can't swim through a hull — you climb aboard.
import { deckPoint, deckToWorld, helmPoint, shipDims, hullSolid, shipBob, hullPoint, pitchRise, hbAt, levelAt } from '../world/hull.js';

export function installDecks(game) {
  // taking the helm, you look out over the bow
  game.on('board', (s) => {
    const r = game.view3d?.rig;
    if (r && s) { r.yaw = ((s.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); r.pitch = -0.04; }
  });
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
  /**
   * The hull under a point, out to her planking (plus `pad`): { ship, t, u, v,
   * rail (the top of her side there), deckH (her deck there) } — heights in
   * metres above the sea as she rides now — or null.
   */
  game.hullAt = (x, y, pad = 0) => {
    const w = game.world, time = game.env?.time || 0;
    for (const s of game.ships) {
      if (s.sunk || s.alive === false) continue;
      const r = s.def.length * 0.56 + pad;
      const dx = w.dx(s.x, x), dy = y - s.y;
      if (dx * dx + dy * dy > r * r) continue;
      const h = hullPoint(s, dx, dy, pad);
      if (!h) continue;
      const lift = shipBob(s, time) + pitchRise(s, h.u);
      h.ship = s; h.rail = h.top + lift; h.deckH = h.floor + lift;
      return h;
    }
    return null;
  };
  /** The next point on the way to (x, y) across a big ship's decks (by the stairs), or null. */
  game.deckRoute = (a, x, y) => deckRoute(game, a, x, y);
  /** Is (x, y) at height h inside any ship's timbers? */
  game.shipSolidAt = (x, y, h) => {
    const w = game.world;
    for (const s of game.ships) {
      if (s.sunk) continue;
      const r = s.def.length * 0.56;
      const dx = w.dx(s.x, x), dy = y - s.y;
      if (dx * dx + dy * dy > r * r) continue;
      if (hullSolid(s, dx, dy, h - shipBob(s, game.env?.time || 0))) return true;
    }
    return false;
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

/** Where the wheel is (deck position just forward of it; on the big ships, just aft of the double wheel). */
export function helmSpot(ship) {
  const d = shipDims(ship.def);
  const hp = helmPoint(ship.def);
  if (d.big) return { t: (hp.x - 0.15 + d.L / 2) / d.L, v: 0 };
  return { t: Math.min(0.5, (hp.x + d.L / 2) / d.L + 0.06), v: 0 };
}

/** The main hatch (the hold) on a ship's deck. */
export function hatchSpot(ship) {
  const d = shipDims(ship.def);
  return { t: d.big ? d.hatchT : d.open ? 0.5 : 0.55, v: 0 };
}

/** A spot on a big ship's deck (the main deck, or `lvl`) near (t, v) that's clear of masts, stairs and the boat. */
export function freeDeckSpot(ship, t, v, lvl = 'main') {
  const d = shipDims(ship.def);
  if (!d.big) return { t, v };
  for (let k = 0; k < 40; k++) {
    const tt = t + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.01;
    const p = deckToWorld(ship, tt, v);
    const dp = deckPoint(ship, p.x - ship.x, p.y - ship.y, 0.4);
    if (dp && !dp.solid && dp.lvl === lvl) return { t: tt, v };
  }
  return { t: 0.5, v: d.B * 0.25 };
}

/** Where your crew stand while you steer a big ship: a lookout forward, hands amidships, an officer by the helm. */
export function crewStation(ship, i) {
  const d = shipDims(ship.def), B = d.B;
  const S = [
    ['fore', 0.93, 0], ['main', d.capstanT + 0.06, B * 0.22], ['quarter', d.tq - 0.03, -B * 0.25], ['main', 0.62, -B * 0.28],
    ['main', 0.75, B * 0.26], ['fore', d.tf + 0.05, -B * 0.2], ['main', d.hatchT, -B * 0.3], ['quarter', d.tq - 0.06, B * 0.28],
  ];
  const [lvl, t, v] = S[i % S.length];
  return { ...freeDeckSpot(ship, t, v, lvl), lvl };
}

/**
 * On a big ship's deck with someone to reach on another deck of her: the
 * next point to head for (the foot or the head of the right flight of stairs).
 */
export function deckRoute(game, a, tx, ty) {
  const dk = a.deck;
  if (!dk || dk.lvl === undefined) return null;
  const s = dk.ship, d = shipDims(s.def), w = game.world;
  const to = deckPoint(s, w.dx(s.x, tx), ty - s.y, 0);
  if (!to) return null;
  const lvl = (p) => (typeof p.lvl === 'string' ? p.lvl : null);
  const here = lvl(dk), there = lvl(to);
  if (!there || here === there) return null;
  // on a flight already: carry on to whichever end is nearer the goal
  const end = (st, top) => {
    const tt = top ? (st.ha > st.hb ? st.ta - 0.5 / d.L : st.tb + 0.5 / d.L) : (st.ha > st.hb ? st.tb + 0.5 / d.L : st.ta - 0.5 / d.L);
    return deckToWorld(s, tt, (st.va + st.vb) / 2);
  };
  const upper = (st) => (st.ha > st.hb ? st.la : st.lb), lower = (st) => (st.ha > st.hb ? st.lb : st.la);
  // which deck to cross to next on the way (main ↔ quarter ↔ poop, main ↔ fore)
  const path = { main: { quarter: 'quarter', poop: 'quarter', fore: 'fore' }, quarter: { main: 'main', fore: 'main', poop: 'poop' }, poop: { quarter: 'quarter', main: 'quarter', fore: 'quarter' }, fore: { main: 'main', quarter: 'main', poop: 'main' } };
  if (!here) {
    // on a flight already: up it, unless the way to the goal lies below
    const st = dk.lvl, up = upper(st), lo = lower(st);
    return end(st, there === up || (there !== lo && path[up]?.[there] !== lo));
  }
  const next = path[here]?.[there];
  if (!next) return null;
  let best = null, bd = Infinity;
  for (const st of d.stairs) {
    if (!((upper(st) === here && lower(st) === next) || (lower(st) === here && upper(st) === next))) continue;
    const p = end(st, lower(st) !== here);
    const dd = w.distance(a.x, a.y, p.x, p.y) + w.distance(p.x, p.y, tx, ty) * 0.5;
    if (dd < bd) { bd = dd; best = { st, p }; }
  }
  if (!best) return null;
  // at the near end: step onto the flight and head for its far end
  if (w.distance(a.x, a.y, best.p.x, best.p.y) < 0.6) return end(best.st, lower(best.st) === here);
  return best.p;
}

/**
 * Where you come aboard over a ship's side at (x, y): the deck just inside
 * her rail there (on the big ships, the deck at that height, clear of the
 * guns and the like) — { t, v }.
 */
export function boardingSpot(game, ship, x, y) {
  const d = shipDims(ship.def), w = game.world;
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading), dx = w.dx(ship.x, x), dy = y - ship.y;
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  const t = Math.max(0.1, Math.min(0.9, (u + d.L / 2) / d.L));
  const room = Math.max(0, hbAt(t, d.B) * d.walk - 0.32), vv = Math.max(-room, Math.min(room, v));
  if (!d.big) return { t, v: vv };
  const lv = levelAt(d, t, vv);
  return freeDeckSpot(ship, t, vv, typeof lv === 'string' ? lv : 'main');
}

/** Distance from an actor to a deck spot. */
export function deckDist(game, a, ship, spot) {
  const p = deckToWorld(ship, spot.t, spot.v);
  return game.world.distance(a.x, a.y, p.x, p.y);
}
