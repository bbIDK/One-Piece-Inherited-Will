// Walking the decks of ships. A ship's deck (main deck, quarterdeck and
// forecastle) is solid ground for anyone standing on it, and carries them
// along as the ship sails or turns; the bulwarks keep you aboard unless you
// jump over the rail, and a hull's side is a wall to anyone outside her, up
// to her rail: you come aboard from above it (a jump from a pier or another
// deck), or up her ladder from the water.
import { deckPoint, deckToWorld, helmPoint, shipDims, hullSolid, shipLift, hullPoint, hbAt, levelAt, topAt, sideAt, floorAt } from '../world/hull.js';
import { plankDeck } from './gangway.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** How close to the top of a rail your feet have to be to get over it (a leg swung over a waist-high wall). */
export const RAIL_CLEAR = 0.2;

export function installDecks(game) {
  // taking the helm, you look out over the bow (at a rowboat's oars, down a
  // little at your oars and the water ahead)
  game.on('board', (s) => {
    const r = game.view3d?.rig;
    if (r && s) { r.yaw = ((s.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); r.pitch = s.def.oarsOnly ? -0.35 : -0.04; }
  });
  /**
   * The deck under a point: { ship, t, v, h, edge } or null (margin: how far
   * in from the rail). `hRef`: the height of the feet asking (above that ship's
   * waterline) — down in the hold or in a cabin, the floor there.
   */
  game.deckAt = (x, y, margin = 0.2, hRef = null, only = null) => {
    const w = game.world;
    // (a gangway laid across to another ship — see gangway.js — is what's
    // underfoot wherever it is, over the decks at its ends too: you walk up
    // its steps, not under them; `only`: one laid to or from that ship)
    if (game.planks?.length) { const pk = plankDeck(game, x, y, margin, only, hRef); if (pk) return pk; }
    for (const s of game.ships) {
      if (s.sunk || (only && s !== only)) continue;
      const r = s.def.length * 0.56;
      const dx = w.dx(s.x, x), dy = y - s.y;
      if (dx * dx + dy * dy > r * r) continue;
      const d = deckPoint(s, dx, dy, margin, only === s ? hRef : null);
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
      h.ship = s; h.rail = shipLift(s, time, h.u, h.v, h.top); h.deckH = shipLift(s, time, h.u, h.v, h.floor);
      return h;
    }
    return null;
  };
  /**
   * How high (m above the sea, as she rides now) the top of a ship's rail is
   * where (x, y) crosses her side: you're over her bulwark once your feet are
   * up there (see RAIL_CLEAR), and against it while they aren't.
   */
  game.railAt = (s, x, y) => {
    const d = shipDims(s.def), c = Math.cos(s.heading), sn = Math.sin(s.heading);
    const dx = game.world.dx(s.x, x), dy = y - s.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
    return shipLift(s, game.env?.time || 0, u, v, topAt(d, clamp01((u + d.L / 2) / d.L)));
  };
  /**
   * Is `a` (feet at the height they are now) up against a hull at (x, y) —
   * their body inside her side, below her rail? { ship, t, u, v, side (her
   * half-width at their height), depth (how far in), top (her rail), hh (the
   * feet, in her frame), floor (her deck there) } — or null. Not the ship
   * they stand on (`only`: just that one). Over her rail you're clear of her
   * side; below her keel, a diver passes under her.
   */
  game.hullWall = (a, x, y, only = null) => {
    const w = game.world, time = game.env?.time || 0, r = a.r ?? 0.28, sc = a.look?.scale || 1;
    let feet = null;
    for (const s of game.ships) {
      if (s.sunk || s.alive === false || s === a.deck?.ship || (only && s !== only)) continue;
      const d = shipDims(s.def), R = d.L * 0.56 + r + 1;
      const dx = w.dx(s.x, x), dy = y - s.y;
      if (dx * dx + dy * dy > R * R) continue;
      const c = Math.cos(s.heading), sn = Math.sin(s.heading), u = dx * c + dy * sn, v = -dx * sn + dy * c;
      const t = (u + d.L / 2) / d.L, tc = clamp01(t);
      if (Math.abs(t - tc) * d.L > r) continue;
      if (feet === null) feet = a.feetH(game);
      const hh = feet - shipLift(s, time, u, v, 0), top = topAt(d, tc);
      if (hh >= top - RAIL_CLEAR) continue;
      // (the body from the feet up to the head, or as far as her rail)
      const y1 = Math.min(top, hh + 1.7 * sc);
      const side = Math.max(sideAt(d, tc, hh), sideAt(d, tc, (hh + y1) / 2), sideAt(d, tc, y1));
      const depth = side + r - Math.abs(v);
      if (depth > 0) return { ship: s, t: tc, u, v, side, depth, top, hh, floor: floorAt(d, tc) };
    }
    return null;
  };
  /** The next point on the way to (x, y) across a big ship's decks (by the stairs), or null. */
  game.deckRoute = (a, x, y, who = null) => deckRoute(game, a, x, y, who);
  /** Is (x, y) at height h inside ship s's timbers — or (a camera's question) in her sails while they're set? */
  game.inShip = (s, x, y, h, sails = false) => {
    if (s.sunk) return false;
    const r = s.def.length * 0.56 + (sails ? s.def.length * 0.3 : 0);
    const dx = game.world.dx(s.x, x), dy = y - s.y;
    if (dx * dx + dy * dy > r * r) return false;
    // (in her own frame: as she rolls and pitches, her timbers ride up and down with her)
    const ch = Math.cos(s.heading), sh = Math.sin(s.heading);
    const hh = h - shipLift(s, game.env?.time || 0, dx * ch + dy * sh, -dx * sh + dy * ch, 0);
    if (hullSolid(s, dx, dy, hh)) return true;
    if (sails && s.sailBoxes) {
      // (in each sail's own frame: from its mast, turned as the yards are braced; furled, only a gaff sail's still there)
      const c = Math.cos(s.heading), sn = Math.sin(s.heading), u = dx * c + dy * sn, v = -dx * sn + dy * c;
      const bc = Math.cos(s.brace || 0), bs = Math.sin(s.brace || 0), set = (s.sailSet || 0) > 0.05;
      for (const b of s.sailBoxes) {
        if ((!set && !b.always) || hh < b.h0 || hh > b.h1) continue;
        const x = b.braced ? (u - b.m) * bc + v * bs : u - b.m, z = b.braced ? -(u - b.m) * bs + v * bc : v;
        if (x > b.u0 && x < b.u1 && Math.abs(z) < b.v) return true;
      }
    }
    return false;
  };
  /** The same, for any ship (`except`: not that one). */
  game.shipSolidAt = (x, y, h, sails = false, except = null) => game.ships.some((s) => s !== except && game.inShip(s, x, y, h, sails));
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

/**
 * Put an actor back where they stood aboard a ship ({ t, v, h }: along, across,
 * and the height of the deck or floor they were on: a cabin's or the hold's
 * below). False if there's no ship to stand on.
 */
export function standAboard(game, a, ship, at) {
  if (!ship || !at) return false;
  placeOnDeck(game, a, ship, at.t, at.v);
  const dk = game.deckAt(a.x, a.y, 0, at.h ?? null, ship);
  if (dk) { a.deck = dk; dk.ship = ship; }
  a.mode = 'foot';
  return true;
}

/** Where you take the helm: just aft of the wheel (on the big ships, of the double wheel; at a rowboat's oars, her thwart). */
export function helmSpot(ship) {
  const d = shipDims(ship.def);
  const hp = helmPoint(ship.def);
  if (d.big) return { t: (hp.x - 0.15 + d.L / 2) / d.L, v: 0 };
  if (d.row) return { t: d.row.seatT, v: 0 };
  if (d.wheelU !== undefined) return { t: (d.wheelU - 0.45 + d.L / 2) / d.L, v: 0 };
  return { t: Math.min(0.5, (hp.x + d.L / 2) / d.L + 0.06), v: 0 };
}

/** Where a ship's plunder is: the treasure chest down in her hold (a small boat's, amidships on deck). */
export function hatchSpot(ship) {
  const d = shipDims(ship.def);
  const ch = d.big && d.furniture?.find((f) => f.treasure);
  if (ch) return { t: (ch.u + d.L / 2) / d.L, v: ch.v, room: 'hold' };
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
    [d.fore ? 'fore' : 'main', d.fore ? 0.93 : 0.86, 0], ['main', (d.capstanT ?? d.hatchT) + 0.06, B * 0.22], ['quarter', d.tq - 0.03, -B * 0.25], ['main', 0.62, -B * 0.28],
    ['main', 0.75, B * 0.26], [d.fore ? 'fore' : 'main', d.fore ? d.tf + 0.05 : 0.8, -B * 0.2], ['main', d.hatchT, -B * 0.3], ['quarter', d.tq - 0.06, B * 0.28],
  ];
  const [lvl, t, v] = S[i % S.length];
  return { ...freeDeckSpot(ship, t, v, lvl), lvl };
}

/**
 * On a big ship's deck with someone to reach on another deck of her: the
 * next point to head for (the foot or the head of the right flight of stairs,
 * or of the ladder down to the hold). `who`: the one being reached, if it's
 * someone (down in the hold, say, under the deck at their feet).
 */
export function deckRoute(game, a, tx, ty, who = null) {
  const dk = a.deck;
  if (!dk || dk.lvl === undefined) return null;
  const s = dk.ship, d = shipDims(s.def), w = game.world;
  const to = who?.deck?.ship === s ? who.deck : deckPoint(s, w.dx(s.x, tx), ty - s.y, 0);
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
  // which deck to cross to next on the way (main ↔ quarter ↔ poop, main ↔ fore, main ↔ the hold down the ladder)
  const path = {
    main: { quarter: 'quarter', poop: 'quarter', fore: 'fore', hold: 'hold' }, quarter: { main: 'main', fore: 'main', poop: 'poop', hold: 'main' },
    poop: { quarter: 'quarter', main: 'quarter', fore: 'quarter', hold: 'quarter' }, fore: { main: 'main', quarter: 'main', poop: 'main', hold: 'main' },
    hold: { main: 'main', quarter: 'main', poop: 'main', fore: 'main', cabin: 'main', captain: 'main', forecastle: 'main' },
  };
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
