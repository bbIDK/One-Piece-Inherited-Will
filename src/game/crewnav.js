// How your crew get about between ships (see ai.js follow): across a gangway
// when one's laid between them (decks.js deckRoute), else the way you would —
// a running jump from one rail to the other where the gap's a jump, or over
// the side and up the other ship's ladder (into a rowboat, over her low side)
// where it isn't — and back again the same way. In the water they swim round
// a hull's ends, never in under her.
import { shipDims, deckPoint, deckToWorld, hbAt, topAt, shipLift, xAt, deckLift } from '../world/hull.js';
import { ladderFoot, ladderAt, canClimb } from './ladders.js';

// (a running jump: how fast they're going as they leave the deck — a little
// under a sprint, to be sure of it — and how it falls: see actor.js)
const RUN = 5, GRAV = 22;
// (a big ship's decks open to the sky, with a rail to jump from)
const OPEN_DECKS = ['main', 'quarter', 'fore', 'poop'];

/** The ship whose deck `a` stands on (on a gangway: none — it's walked: see deckRoute). */
const shipOf = (a) => (a?.deck && !a.deck.plank ? a.deck.ship : null);

/** A clear spot on ship `s`'s deck near (x, y): her main deck, a little inside her rail. { x, y } */
function spotNear(game, s, x, y) {
  const w = game.world, d = shipDims(s.def), c = Math.cos(s.heading), sn = Math.sin(s.heading);
  const dx = w.dx(s.x, x), dy = y - s.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
  const t0 = d.big ? Math.max(d.tq + 0.04, 0.3) : 0.25, t1 = d.big ? Math.min(d.fore ? d.tf - 0.04 : 0.84, 0.75) : 0.75;
  const t = Math.max(t0, Math.min(t1, (u + d.L / 2) / d.L)), sg = v >= 0 ? 1 : -1;
  for (const inset of [1.3, 2, 2.8, 0.8]) {
    for (let k = 0; k < 24; k++) {
      const tt = t + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6 / d.L, vv = sg * Math.max(0, hbAt(tt, d.B) * d.walk - inset);
      const dp = deckPoint(s, ...rel(s, tt, vv), 0.3);
      if (dp && !dp.solid && (!d.big || dp.lvl === 'main')) { const q = deckToWorld(s, tt, vv); return { x: w.wx(q.x), y: q.y }; }
    }
  }
  const q = deckToWorld(s, 0.5, 0);
  return { x: w.wx(q.x), y: q.y };
}
// (deckPoint takes offsets from her middle: the world offset of (t, v))
function rel(s, t, v) {
  const d = shipDims(s.def), u = xAt(d, t), c = Math.cos(s.heading), sn = Math.sin(s.heading);
  return [u * c - v * sn, u * sn + v * c];
}
/** (x, y) in ship `s`'s own frame: { u along her, v across }. */
function frameOf(w, s, x, y) {
  const c = Math.cos(s.heading), sn = Math.sin(s.heading), dx = w.dx(s.x, x), dy = y - s.y;
  return { u: dx * c + dy * sn, v: -dx * sn + dy * c };
}

/**
 * A clear way out to big ship T's bulwark on side `sg` (+1: starboard), near
 * `t0` along her: from a couple of metres in from it out to it, all on deck
 * `lvl`, with no gun, mast or hatch in the way (her guns stand along her
 * sides: run straight at her rail and you fetch up against a carriage).
 * { u, edge (how far out her bulwark is there), inb (the inboard end of the
 * way, in the world), out (just inside her bulwark), beyond (a few metres
 * out over the water) }, or null.
 */
export function clearLane(game, T, sg, t0, r, lvl) {
  const w = game.world, d = shipDims(T.def);
  for (let k = 0; k < 48; k++) {
    const t = t0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35 / d.L;
    if (t < 0.08 || t > 0.92) continue;
    const edge = hbAt(t, d.B) * d.walk;
    let ok = edge > 1.5;
    for (let v = Math.max(0, edge - 2.4); ok && v <= edge - 0.3 + 1e-6; v += 0.2) {
      const dp = deckPoint(T, ...rel(T, t, sg * v), r * 0.7);
      ok = !!dp && !dp.solid && dp.lvl === lvl;
    }
    if (!ok) continue;
    const at = (v) => { const q = deckToWorld(T, t, sg * v); return { x: w.wx(q.x), y: q.y }; };
    return { u: xAt(d, t), edge, inb: at(Math.max(0, edge - 2.2)), out: at(edge - 0.3), beyond: at(edge + 4) };
  }
  return null;
}

/**
 * Along the line from `a` (on ship T's deck) to (gx, gy) on ship S's deck:
 * where it leaves T's deck and comes onto S's — the gap between the two
 * rails, and how far S's rail stands over T's deck. Or null.
 */
function railGap(game, a, T, S, gx, gy) {
  const w = game.world, time = game.env?.time || 0;
  const dx = w.dx(a.x, gx), dy = gy - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  let off = null, on = null;
  for (let l = 0; l <= len; l += 0.1) {
    const x = w.wx(a.x + ux * l), y = a.y + uy * l;
    if (off === null) { if (!deckPoint(T, w.dx(T.x, x), y - T.y, 0)) off = l; continue; }
    if (deckPoint(S, w.dx(S.x, x), y - S.y, 0)) { on = l; break; }
  }
  if (off === null || on === null) return null;
  const dS = shipDims(S.def), x = w.wx(a.x + ux * on), y = a.y + uy * on, c = Math.cos(S.heading), sn = Math.sin(S.heading);
  const ex = w.dx(S.x, x), ey = y - S.y, u = ex * c + ey * sn, v = -ex * sn + ey * c;
  const rail = shipLift(S, time, u, v, topAt(dS, Math.max(0, Math.min(1, (u + dS.L / 2) / dS.L))));
  return { gap: on - off, rise: rail - deckLift(a.deck, time) };
}

/**
 * Can `a` make it across (railGap's `rg`) with a charged running jump: still
 * up over the far rail (or near enough to swing a leg over it) by the time
 * they're across the water to it?
 */
function leapable(a, rg) {
  const J = a.jumpStats ? a.jumpStats() : { v: 7.6, charge: 1.45 }, v0 = J.v * J.charge, t = (rg.gap + 0.5) / RUN;
  return v0 * t - GRAV / 2 * t * t >= rg.rise - 0.05;
}

/**
 * At the rail of the deck `a` stands on, going for (gx, gy) over it: the
 * deck's edge right in front of them on the way there (not some other rail
 * they happen to stand by).
 */
function atRail(game, a, gx, gy) {
  if (!a.deck || a.deck.edge > 0.5 || (a.z || 0) > 0.02) return false;
  const w = game.world, s = a.deck.ship, dx = w.dx(a.x, gx), dy = gy - a.y, l = Math.hypot(dx, dy) || 1;
  const x = w.wx(a.x + dx / l * 0.8), y = a.y + dy / l * 0.8;
  return !deckPoint(s, w.dx(s.x, x), y - s.y, 0);
}

/**
 * In the water: on the way to (gx, gy), round the end of any hull that lies
 * across it (just clear of her bow or her stern, whichever's the shorter way)
 * — the next point to swim for.
 */
function roundHulls(game, a, gx, gy) {
  const w = game.world, dx = w.dx(a.x, gx), dy = gy - a.y, len = Math.hypot(dx, dy);
  const n = Math.ceil(len / 0.8);
  for (const s of game.ships) {
    if (s.sunk || s.alive === false) continue;
    const d = shipDims(s.def), c = Math.cos(s.heading), sn = Math.sin(s.heading);
    if (w.distance(s.x, s.y, a.x, a.y) > len + d.L) continue;
    let crosses = false;
    for (let k = 1; k < n - 1 && !crosses; k++) {
      const ex = w.dx(s.x, a.x + dx * k / n), ey = a.y + dy * k / n - s.y, u = ex * c + ey * sn, v = -ex * sn + ey * c;
      const t = (u + d.L / 2) / d.L;
      // (in through her side — not along it, up a narrow gap between two hulls)
      crosses = t > -0.02 && t < 1.02 && Math.abs(v) < hbAt(Math.max(0, Math.min(1, t)), d.B) + 0.1;
    }
    if (!crosses) continue;
    // (round whichever end of her is the shorter way, a few metres clear of
    // it: to its corner on our side, then across her bow or stern to the one
    // on the far side — once we're out past her end, that one)
    const ex = w.dx(s.x, a.x), ey = a.y - s.y, ua = ex * c + ey * sn, side = -ex * sn + ey * c >= 0 ? 1 : -1;
    const gex = w.dx(s.x, gx), gey = gy - s.y, sideG = -gex * sn + gey * c >= 0 ? 1 : -1;
    const at = (u, v) => ({ x: w.wx(s.x + u * c - v * sn), y: s.y + u * sn + v * c });
    let best = null, bd = Infinity;
    for (const e of [1, -1]) {
      const near = at(e * (d.L / 2 + 3), side * (d.B / 2 + 1.5)), far = at(e * (d.L / 2 + 3), sideG * (d.B / 2 + 1.5));
      const past = e * ua > d.L / 2 + 2, via = past ? far : near;
      const dd = w.distance(a.x, a.y, via.x, via.y) + w.distance(via.x, via.y, far.x, far.y) + w.distance(far.x, far.y, gx, gy);
      if (dd < bd) { bd = dd; best = via; }
    }
    return best;
  }
  return { x: gx, y: gy };
}

/**
 * Where `a` (one of your crew) heads to get to `who` — you, or a foe they're
 * after — when there's a ship's side between them: { x, y } to make for,
 * with `jump` (a charge, 0..1) to jump there now, or `climb` (a ladder to
 * climb, from ladderAt). Null when there's nothing to cross: both on one
 * deck, a gangway between their decks (deckRoute's), or both ashore.
 */
export function shipNav(game, a, who) {
  if (!who || a.climb || a.state !== 'idle' || a.onShip) return null;
  const air = (a.z || 0) > 0.05 || !!a.vz;
  // (a jump of theirs over a rail — a leap across for another ship's deck, or
  // a dive over the side — ends where it comes down: on a deck, or in the
  // sea; till then a leap is for her deck, whoever's where)
  const J = a.navJump;
  if (J && (a.inWater || (a.deck && !air))) a.navJump = null;
  else if (J?.leap && air && (!a.deck || a.deck.ship === J.ship)) {
    const goal = spotNear(game, J.ship, a.x, a.y);
    return { x: goal.x, y: goal.y, run: true };
  }
  const w = game.world, S = shipOf(who), T = shipOf(a);
  // (on a gangway, or one laid between the two decks: walked, by deckRoute)
  if (who.deck?.plank || a.deck?.plank) return null;
  if (S && T && (S === T || (game.planks || []).some((P) => (P.a === S && P.b === T) || (P.a === T && P.b === S)))) return null;
  // (in the air over a deck — coming down from a jump that wasn't over her
  // rail — down onto it first, not off over her side on the way)
  if (T && air && !a.navJump) return { x: a.x, y: a.y };
  if (S) {
    // ---- onto ship S's deck: from another deck, from the water, from the shore
    if (T) {
      let goal = spotNear(game, S, a.x, a.y), to = goal;
      const dT = shipDims(T.def);
      if (dT.big) {
        // (down in her hold, or on her stairs: up on deck first, by her ladder or the stairs — see deckRoute)
        if (!OPEN_DECKS.includes(a.deck.lvl)) {
          const on = spotNear(game, T, goal.x, goal.y), up = game.deckRoute?.(a, on.x, on.y);
          if (up) return { x: up.x, y: up.y, run: true };
        }
        // (out to her rail by a clear way, and on over it, straight out from her side)
        const f = frameOf(w, T, a.x, a.y), sg = frameOf(w, T, goal.x, goal.y).v >= 0 ? 1 : -1;
        const lane = clearLane(game, T, sg, (f.u + dT.L / 2) / dT.L, a.r || 0.35, a.deck.lvl);
        if (lane) {
          if (Math.abs(f.u - lane.u) > 0.3 || sg * f.v < lane.edge - 2.6) return { x: lane.inb.x, y: lane.inb.y, run: true };
          goal = spotNear(game, S, lane.out.x, lane.out.y);
          to = lane.beyond;
        }
      }
      const rg = railGap(game, a, T, S, goal.x, goal.y);
      // a running jump across, from her rail, when it's no further than one
      // goes — else over the side, to swim for the other's ladder (not for a
      // Devil Fruit user: they wait for you, and catch up)
      const jump = !!rg && leapable(a, rg);
      if (!jump && a.fruit && !a.gills) return null;
      const at = atRail(game, a, to.x, to.y);
      if (at) a.navJump = { ship: S, leap: jump };
      return { x: to.x, y: to.y, run: true, jump: at ? (jump ? 1 : 0.55) : undefined };
    }
    const d = shipDims(S.def);
    if (d.ladders?.length) {
      // up her ladder: at its foot, climb; else make for the nearest foot (round any hull in the way)
      const at = ladderAt(game, a, 1.3, S);
      if (at && canClimb(a)) return { climb: at };
      let best = null, bd = Infinity;
      for (const l of d.ladders) { const f = ladderFoot(S, l), dd = w.distance(a.x, a.y, f.x, f.y); if (dd < bd) { bd = dd; best = f; } }
      return a.inWater ? roundHulls(game, a, best.x, best.y) : { x: best.x, y: best.y, run: true };
    }
    // a rowboat: up against her low side, and a jump out of the water over it
    if (a.inWater) {
      const near = game.hullAt(a.x, a.y, a.r + 0.6)?.ship === S;
      return { x: S.x, y: S.y, jump: near ? 0.4 : undefined };
    }
    return null;
  }
  // ---- after someone in the water: over our rail toward them
  if (who.inWater && T && !(a.fruit && !a.gills)) {
    const at = atRail(game, a, who.x, who.y);
    if (at) a.navJump = { ship: null, leap: false };
    return { x: who.x, y: who.y, run: true, jump: at ? 0.55 : undefined };
  }
  return null;
}
