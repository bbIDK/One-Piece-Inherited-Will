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
  if (dk.plank) return null;
  const s = dk.ship, d = shipDims(s.def), w = game.world;
  const to = who?.deck?.ship === s ? who.deck : deckPoint(s, w.dx(s.x, tx), ty - s.y, 0);
  if (!to) return null;
  if (dk.lvl === undefined) return roundSolids(game, a, tx, ty);
  const lvl = (p) => (typeof p.lvl === 'string' ? p.lvl : null);
  const here = lvl(dk), there = lvl(to);
  // (on the same deck — or making for someone on a flight of stairs off it:
  // round whatever's in the way to them)
  if (!there || here === there) return here ? roundSolids(game, a, tx, ty) : null;
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
 * On her deck, to (tx, ty) on the same deck: round whatever stands on it in
 * the way — the shot pile by the mainmast, a gun, the capstan, a mast, the
 * ship's boat. The shortest way round, from corner to corner of what's there
 * (kept inside her bulwarks, on this deck), worked out when the straight way's
 * blocked and kept while they're on it. A point to make for, or null when the
 * way's clear (walk straight there).
 */
function roundSolids(game, a, tx, ty) {
  const dk = a.deck, s = dk.ship, d = shipDims(s.def), w = game.world;
  const c = Math.cos(s.heading), sn = Math.sin(s.heading);
  const frame = (x, y) => { const dx = w.dx(s.x, x), dy = y - s.y; return [dx * c + dy * sn, -dx * sn + dy * c]; };
  const world = (q) => ({ x: w.wx(s.x + q[0] * c - q[1] * sn), y: s.y + q[0] * sn + q[1] * c });
  const A = frame(a.x, a.y), B = frame(tx, ty);
  // (no one comes nearer anything on deck than seven tenths of their girth —
  // actor.js — and the corners to go by are a stride out from that)
  const M = (a.r || 0.35) * 0.7, R = M + 0.3, K = R - M + 0.02;
  const lv = typeof dk.lvl === 'string' ? dk.lvl : null;
  // (what stands on this deck, a few metres either side of the way)
  const u0 = Math.min(A[0], B[0]) - 4, u1 = Math.max(A[0], B[0]) + 4, v0 = Math.min(A[1], B[1]) - 4, v1 = Math.max(A[1], B[1]) + 4;
  const near = [];
  for (const o of d.solids) {
    if (o.lvl && lv !== null && o.lvl !== lv) continue;
    if (o.r === undefined ? o.u1 < u0 || o.u0 > u1 || o.v1 < v0 || o.v0 > v1 : o.u + o.r < u0 || o.u - o.r > u1 || o.v + o.r < v0 || o.v - o.r > v1) continue;
    near.push(o.r === undefined ? { o, box: { u0: o.u0 - R, u1: o.u1 + R, v0: o.v0 - R, v1: o.v1 + R } } : { o, r: o.r + R });
  }
  if (!near.length) { a._deckPath = null; return null; }
  const inside = (q, u, v, k = 0) => (q.box ? u > q.box.u0 + k && u < q.box.u1 - k && v > q.box.v0 + k && v < q.box.v1 - k : Math.hypot(u - q.o.u, v - q.o.v) < q.r - k);
  // (where they're going is in the lee of something — behind you, say, and
  // you've your back to the shot pile: the near side of it instead)
  for (const q of near) {
    if (!inside(q, B[0], B[1])) continue;
    if (q.box) {
      const X = q.box, out = [[X.u0 - 0.05 - B[0], 0], [X.u1 + 0.05 - B[0], 0], [0, X.v0 - 0.05 - B[1]], [0, X.v1 + 0.05 - B[1]]];
      out.sort((m, n) => Math.hypot(...m) - Math.hypot(...n));
      B[0] += out[0][0]; B[1] += out[0][1];
    } else {
      const ang = Math.atan2(B[1] - q.o.v, B[0] - q.o.u);
      B[0] = q.o.u + Math.cos(ang) * (q.r + 0.05); B[1] = q.o.v + Math.sin(ang) * (q.r + 0.05);
    }
  }
  // (does the way from p to q run into anything — as near as anyone can come to it?)
  const meets = (x, p, q) => {
    const du = q[0] - p[0], dv = q[1] - p[1];
    if (x.box) {
      let t0 = 0, t1 = 1;
      for (const [o, dd, lo, hi] of [[p[0], du, x.box.u0 + K, x.box.u1 - K], [p[1], dv, x.box.v0 + K, x.box.v1 - K]]) {
        if (Math.abs(dd) < 1e-9) { if (o <= lo || o >= hi) return false; continue; }
        let ta = (lo - o) / dd, tb = (hi - o) / dd;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 >= t1) return false;
      }
      return true;
    }
    const fu = p[0] - x.o.u, fv = p[1] - x.o.v, aa = du * du + dv * dv, bb = 2 * (fu * du + fv * dv), cc = fu * fu + fv * fv - (x.r - K) ** 2;
    if (cc < 0) return true;
    const disc = bb * bb - 4 * aa * cc;
    if (aa < 1e-9 || disc <= 0) return false;
    const t = (-bb - Math.sqrt(disc)) / (2 * aa);
    return t >= 0 && t <= 1;
  };
  const blocked = (p, q) => near.some((x) => meets(x, p, q));
  if (!blocked(A, B)) { a._deckPath = null; return null; }
  const now = game.time || 0, C = a._deckPath;
  if (C && C.s === s && C.lv === lv && (now - C.t < 0.3 || (Math.hypot(C.b[0] - B[0], C.b[1] - B[1]) < 0.8 && now - C.t < 2.5))) {
    // (on the way already: past the corners reached, and on to the furthest one in sight)
    while (C.pts.length && Math.hypot(C.pts[0][0] - A[0], C.pts[0][1] - A[1]) < 0.35) C.pts.shift();
    for (let i = C.pts.length - 1; i > 0; i--) if (!blocked(A, C.pts[i])) { C.pts.splice(0, i); break; }
    if (C.pts.length) return world(C.pts[0]);
  }
  // the corners round everything here (an octagon round a mast or the
  // capstan), on this deck and inside her bulwarks, clear of everything else
  const nodes = [];
  const add = (u, v) => {
    const t = (u + d.L / 2) / d.L;
    if (t < 0.03 || t > 0.97 || Math.abs(v) > hbAt(t, d.B) * d.walk - M) return;
    if (lv !== null && levelAt(d, t, v) !== lv) return;
    if (near.some((q) => inside(q, u, v, 0.01))) return;
    nodes.push([u, v]);
  };
  for (const q of near) {
    if (q.box) for (const [u, v] of [[q.box.u0 - 0.02, q.box.v0 - 0.02], [q.box.u0 - 0.02, q.box.v1 + 0.02], [q.box.u1 + 0.02, q.box.v0 - 0.02], [q.box.u1 + 0.02, q.box.v1 + 0.02]]) add(u, v);
    else for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, rr = (q.r + 0.03) / Math.cos(Math.PI / 8); add(q.o.u + Math.cos(ang) * rr, q.o.v + Math.sin(ang) * rr); }
  }
  // (a crowded deck — a gun deck's batteries — just those nearest the way)
  if (nodes.length > 64) {
    const du = B[0] - A[0], dv = B[1] - A[1], L2 = du * du + dv * dv || 1;
    const off = (q) => { const t = Math.max(0, Math.min(1, ((q[0] - A[0]) * du + (q[1] - A[1]) * dv) / L2)); return Math.hypot(q[0] - A[0] - du * t, q[1] - A[1] - dv * t); };
    nodes.sort((m, n) => off(m) - off(n)).length = 64;
  }
  // A*, from here to there by those corners (whether one's in sight of
  // another worked out only as it's needed)
  const N = nodes.length, goal = N;
  nodes.push(B);
  const g = new Float64Array(N + 1).fill(Infinity), from = new Int32Array(N + 1).fill(-1), done = new Uint8Array(N + 1);
  const h = (i) => Math.hypot(nodes[i][0] - B[0], nodes[i][1] - B[1]);
  for (let j = 0; j <= N; j++) if (!blocked(A, nodes[j])) { g[j] = Math.hypot(nodes[j][0] - A[0], nodes[j][1] - A[1]); from[j] = -2; }
  for (;;) {
    let i = -1, bf = Infinity;
    for (let j = 0; j <= N; j++) if (!done[j] && g[j] + h(j) < bf) { bf = g[j] + h(j); i = j; }
    if (i < 0 || i === goal) break;
    done[i] = 1;
    for (let j = 0; j <= N; j++) {
      if (done[j] || j === i) continue;
      const nd = g[i] + Math.hypot(nodes[j][0] - nodes[i][0], nodes[j][1] - nodes[i][1]);
      if (nd < g[j] && !blocked(nodes[i], nodes[j])) { g[j] = nd; from[j] = i; }
    }
  }
  if (!Number.isFinite(g[goal])) { a._deckPath = null; return null; }
  const pts = [];
  for (let i = from[goal]; i >= 0; i = from[i]) pts.unshift(nodes[i]);
  if (!pts.length) { a._deckPath = null; return null; }
  a._deckPath = { s, lv, b: B.slice(), t: now, pts };
  return world(pts[0]);
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
