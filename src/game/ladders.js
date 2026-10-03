// The ladders down the big ships' sides (one each side, amidships: see
// hull.js). Her side is a wall too tall to jump from the water; at the foot of
// her ladder — swimming, standing in a boat alongside, or on the quay she
// lies at — E climbs it, up her side and over the rail onto her deck. Your
// crew climb it after you (see ai.js).
import { shipDims, deckToWorld, sideAt, hbAt, shipLift, topAt } from '../world/hull.js';
import { allShips } from './ship.js';

/**
 * The foot of a ship's ladder: where you swim (or stand) to climb it (x, y,
 * just out from her side at the water), and where its top lands you on her
 * deck ({ t, v }: just inside her rail).
 */
export function ladderFoot(ship, l) {
  const d = shipDims(ship.def);
  const p = deckToWorld(ship, l.t, l.s * (sideAt(d, l.t, 0.2) + 0.5));
  return { x: p.x, y: p.y, deck: { t: l.t, v: l.s * (hbAt(l.t, d.B) * d.walk - 0.5) } };
}

/** Can `a` climb a ladder now? On their feet, or swimming at the surface (the sea takes a Devil Fruit user's strength: no climbing out of it). */
export function canClimb(a) {
  if (a.state !== 'idle' || a.climb || a.onShip || a.mode === 'sail' || a.hitstun > 0 || a.status?.freeze || a.status?.root) return false;
  if (a.inWater && (a.under || (a.fruit && !a.gills))) return false;
  return !((a.z || 0) > 0.3);
}

/**
 * The ladder `a` can climb from where they are: within reach of its foot,
 * with their feet below her rail (in the water, a boat or on a quay), and not
 * already aboard her — { ship, l, foot, d } (the nearest, another player's
 * ship's too), or null. `only`: just that ship's.
 */
export function ladderAt(game, a, reach = 1.5, only = null) {
  const w = game.world, time = game.env?.time || 0;
  let best = null;
  for (const s of allShips(game)) {
    if (s.sunk || s.alive === false || a.deck?.ship === s || (only && s !== only)) continue;
    const d = shipDims(s.def);
    if (!d.ladders?.length || w.distance(a.x, a.y, s.x, s.y) > d.L * 0.6 + reach + 2) continue;
    for (const l of d.ladders) {
      const f = ladderFoot(s, l), dd = w.distance(a.x, a.y, f.x, f.y);
      if (dd > reach || (best && dd >= best.d)) continue;
      if (a.feetH(game) > shipLift(s, time, l.u, f.deck.v, topAt(d, l.t)) - 0.3) continue;
      best = { ship: s, l, foot: f, d: dd };
    }
  }
  return best;
}

/** Up the ladder (`at`: from ladderAt), hand over hand, onto her deck. */
export function climbLadder(game, a, at) {
  a.startClimb(game, { ship: at.ship, t: at.foot.deck.t, v: at.foot.deck.v, ladder: at.l });
  game.audio?.sfx('step', a);
}

export function installLadders(game) {
  game.ladderAt = (a, reach, only) => ladderAt(game, a, reach, only);
  game.climbLadder = (a, at) => climbLadder(game, a, at);
  // the one E there is at a ship's side: at the foot of her ladder
  const prevFoot = game.footInteraction;
  game.footInteraction = (p) => {
    const other = prevFoot ? prevFoot(p) : null;
    const at = p.mode === 'foot' && canClimb(p) ? ladderAt(game, p) : null;
    if (!at) return other;
    const mine = { d: at.d, x: at.foot.x, y: at.foot.y, label: `Climb the ladder (the ${at.ship.name})`, run: () => climbLadder(game, p, at) };
    return !other || mine.d <= other.d ? mine : other;
  };
}
