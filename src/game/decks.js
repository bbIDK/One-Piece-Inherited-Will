// Walking the decks of ships. A ship's deck (main deck, quarterdeck and
// forecastle) is solid ground for anyone standing on it, and carries them
// along as the ship sails or turns; the bulwarks keep you aboard unless you
// jump over the rail, and a hull's side is a wall to anyone outside her, up
// to her rail: you come aboard from above it (a jump from a pier or another
// deck), or up her ladder from the water. In a multiplayer voyage the other
// players' ships are all of that too, as they're drawn here (see ship.js
// theirShips) — and when one's gone from under you, you're set down where you
// stood (shipGone).
import { deckPoint, deckToWorld, helmPoint, shipDims, hullSolid, shipLift, hullPoint, hbAt, levelAt, topAt, sideAt, floorAt, deckLift } from '../world/hull.js';
import { IS_LIQUID, OVERLAY } from '../world/tiles.js';
import { plankDeck } from './gangway.js';
import { allShips } from './ship.js';

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
  // Sitting down aboard, on a chair, a bench or a barrel (hull.js seatsOf):
  // you stay sat on it as she sails, turns and rolls under you, until you
  // get up (E again), walk off, jump, or have to fight.
  game.sitAboard = (a, s, st) => {
    const d = shipDims(s.def), from = a.deck?.ship === s ? { t: a.deck.t, v: a.deck.v, h: a.deck.h } : null;
    standAboard(game, a, s, { t: (st.u + d.L / 2) / d.L, v: st.v, h: st.floor });
    a.seat = { ship: s, st, from };
    a.act3d = { pose: 'sit', h: st.h };
    a.facing = s.heading + st.face;
    a.intent.mx = a.intent.my = 0;
  };
  game.standUp = (a, step = true) => {
    const sat = a.seat;
    if (!sat) return;
    a.seat = null; a.act3d = null;
    // (up, and a step clear of it: back from a table, else out in front or to
    // a side — wherever there's floor and nothing in the way)
    const s = sat.ship, st = sat.st, d = shipDims(s.def);
    if (!step || s.sunk || a.deck?.ship !== s) return;
    // (and failing that, back where you stood to sit down)
    let to = sat.from;
    for (const [da, r] of [[Math.PI, 0.62], [0, 0.62], [Math.PI / 2, 0.62], [-Math.PI / 2, 0.62], [Math.PI, 0.9], [0, 0.9]]) {
      const u = st.u + Math.cos(st.face + da) * r, v = st.v + Math.sin(st.face + da) * r, t = (u + d.L / 2) / d.L;
      const pt = deckToWorld(s, t, v), dk = game.deckAt(game.world.wx(pt.x), pt.y, 0.2, st.floor, s);
      if (!dk || dk.solid || Math.abs((dk.h ?? st.floor) - st.floor) > 0.3) continue;
      to = { t, v, h: st.floor };
      break;
    }
    if (to) standAboard(game, a, s, to);
    a.facing = s.heading + st.face;
  };
  game.on('tick', () => {
    const a = game.player, sat = a?.seat;
    if (!sat) return;
    const s = sat.ship;
    if (s.sunk || s.alive === false || !a.alive || a.state !== 'idle' || a.inWater || a.mode === 'sail' || a.action || a.hitstun > 0 || a.inCombat || a.deck?.ship !== s) { game.standUp(a, false); return; }
    // (a jump or a step gets you up and off it)
    if ((a.z || 0) > 0.05 || (a.vz || 0) > 0 || Math.hypot(a.intent.mx || 0, a.intent.my || 0) > 0.1) { game.standUp(a); return; }
    // (sat where the seat is now, as she's moved and turned)
    const d = shipDims(s.def), st = sat.st, p = deckToWorld(s, (st.u + d.L / 2) / d.L, st.v);
    a.x = game.world.wx(p.x); a.y = p.y; a.vx = a.vy = 0;
    a.facing = s.heading + st.face;
    if (!a.act3d) a.act3d = { pose: 'sit', h: st.h };
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
    for (const s of allShips(game)) {
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
    for (const s of allShips(game)) {
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
    for (const s of allShips(game)) {
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
  /** The same, for any ship (`except`: not that one) — another player's among them. */
  game.shipSolidAt = (x, y, h, sails = false, except = null) => allShips(game).some((s) => s !== except && game.inShip(s, x, y, h, sails));
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

/**
 * A ship gone from under whoever stood on her: another player's (see
 * net/session.js) — sailed off into another world, laid up or gone to the
 * bottom, another taken in her place, or her captain gone from the voyage.
 * Each aboard her is set down where they stood (see stepOff), anyone on her
 * ladder lets go of it, and a gangway laid to her is gone with her.
 */
export function shipGone(game, s) {
  const p = game.player;
  if (p && (p.deck?.ship === s || p.climb?.to?.ship === s)) game.log?.(`The ${s.name} is gone from under your feet.`, '#b0bec5');
  for (const a of [...(s.aboard || [])]) stepOff(game, a, s);
  s.aboard?.clear();
  for (const a of game.actors || []) if (a.climb?.to?.ship === s) a.endClimb(game, true);
  if (game.planks?.length) game.planks = game.planks.filter((P) => P.a !== s && P.b !== s);
}

/**
 * Off a deck that's no longer there (see shipGone), just where you stood on
 * it — as if you'd stepped off her side: down onto the pier or the beach
 * there, or into the water (from the height of her deck: a drop, and a
 * splash). Someone the sea would drown, a Devil Fruit user, is set down on dry
 * land close by instead — or, with none, aboard a ship of their own (her crew
 * fish them out); with neither, the sea it is. Never inside anything.
 */
export function stepOff(game, a, s) {
  const w = game.world, dk = a.deck;
  s.aboard?.delete(a);
  if (!dk || dk.ship !== s) return;
  const feet = deckLift(dk, game.env?.time || 0) + Math.max(0, a.z || 0), t = w.type(a.x, a.y);
  a.deck = null;
  if (IS_LIQUID[t] === 1 && !OVERLAY[t] && a.fruit && !a.gills) {
    const land = dryLand(game, a, a.x, a.y, 12);
    if (land) { a.x = land.x; a.y = land.y; } else {
      let own = null, bd = Infinity;
      for (const o of game.ships) {
        if (o.owner !== 'player' || o.sunk || o.alive === false) continue;
        const d = w.distance(a.x, a.y, o.x, o.y);
        if (d < bd) { bd = d; own = o; }
      }
      if (own) {
        const sp = boardingSpot(game, own, a.x, a.y);
        placeOnDeck(game, a, own, sp.t, sp.v);
        if (a.isPlayer) game.log?.(`Your crew fish you out of the sea: you're aboard the ${own.name}.`, '#81d4fa');
        return;
      }
    }
  }
  clearOf(game, a);
  // (from down in her hold, below the waterline: at the surface)
  const g = a.groundAt(game, a.x, a.y);
  a.z = Math.max(0, feet - g);
  if (!a.vz && a.z > 0) a.vz = -0.01;
  a.lastG = g; a.lastGX = a.x; a.lastGY = a.y;
}

/** The nearest spot within `r` of (x, y) where `a` can stand out of the water (a pier, a quay, the beach), or null. */
function dryLand(game, a, x, y, r) {
  const w = game.world;
  for (let d = 0; d <= r; d += 0.5) {
    const n = Math.max(1, Math.ceil(d * 3));
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2, px = w.wx(x + Math.cos(ang) * d), py = y + Math.sin(ang) * d, t = w.type(px, py);
      if ((IS_LIQUID[t] !== 1 || OVERLAY[t]) && a.standsAt(game, px, py)) return { x: px, y: py };
    }
  }
  return null;
}

/** Out of anything solid where `a` is (a post on a pier, a rock in the shallows) to the nearest clear spot. */
function clearOf(game, a) {
  const w = game.world, r = (a.r ?? 0.28) * 0.9;
  const free = (x, y) => !w.solid(x, y) && !w.hitsProp(x, y, r);
  if (free(a.x, a.y)) return;
  for (let d = 0.25; d <= 4; d += 0.25) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2, x = w.wx(a.x + Math.cos(ang) * d), y = a.y + Math.sin(ang) * d;
      if (free(x, y)) { a.x = x; a.y = y; return; }
    }
  }
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
 * someone (down in the hold, say, under the deck at their feet). Someone on
 * another ship's deck, with a gangway laid between her and this one: by it.
 */
export function deckRoute(game, a, tx, ty, who = null) {
  const dk = a.deck;
  if (!dk) return null;
  if (game.planks?.length) { const pr = plankRoute(game, a, tx, ty, who); if (pr !== undefined) return pr; }
  if (dk.lvl === undefined || dk.plank) return null;
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
 * To (tx, ty) on another ship's deck by a gangway laid between it and the
 * deck you're on (see gangway.js): the foot of its steps on this deck (by
 * her stairs, from another deck of her), then up it and along it, keeping to
 * its middle (alongside its steps is the deck, and they're a step too high
 * to get onto from there), and off it at the far end. Undefined when there's
 * no gangway in it.
 */
function plankRoute(game, a, tx, ty, who) {
  const dk = a.deck, to = who?.deck || game.deckAt(tx, ty, 0);
  if (!to) return undefined;
  const here = dk.plank || dk.ship, there = to.plank || to.ship;
  if (here === there) return undefined;
  const w = game.world;
  for (const P of game.planks) {
    const L = P.pts(), d = L.dir;
    // (the point on its middle line `k` along it from your ship's end — past
    // its ends, out on the deck there — and where `a` is: k along it, e off it)
    const on = (k) => ({ x: w.wx(L.x + d.x * k), y: L.y + d.y * k });
    const ox = w.dx(L.x, a.x), oy = a.y - L.y, k0 = ox * d.x + oy * d.y, e0 = -ox * d.y + oy * d.x;
    // (on along its middle, a short way ahead toward one end)
    const ahead = (toB) => on(toB ? Math.min(L.len + 1.2, k0 + 0.8) : Math.max(-1.2, k0 - 0.8));
    if (dk.plank === P) {
      // on it: along it to the end on their side, and off
      if (there === P.a) return ahead(false);
      if (there === P.b) return ahead(true);
      continue;
    }
    if (here !== P.a && here !== P.b) continue;
    const fromA = here === P.a;
    if (there !== P && there !== (fromA ? P.b : P.a)) continue;
    // lined up behind the foot of its steps: up them; else to there first
    const behind = fromA ? -k0 : k0 - L.len;
    if (behind > -0.2 && behind < 1.6 && Math.abs(e0) < 0.35) return ahead(fromA);
    const foot = on(fromA ? -1.2 : L.len + 1.2);
    return deckRoute(game, { deck: dk, x: a.x, y: a.y }, foot.x, foot.y) || foot;
  }
  return undefined;
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
