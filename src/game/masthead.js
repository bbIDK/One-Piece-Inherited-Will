// Up the mainmast to the crow's nest (big ships: hull.js mastNest; the
// ladder's drawn in render3d/bigship.js). At its foot on deck, E climbs it:
// W up, S down, Space lets go; at the top you're in the nest, looking out
// over the sea (S climbs back down). All of it rides with the ship as she
// sails, rolls and pitches.
import { shipDims, mastNest, shipLift } from '../world/hull.js';
import { placeOnDeck } from './decks.js';

const CLIMB_SPEED = 1.7; // m a second up (or down) the rungs

/** Where the ladder is on a ship: { nest, u (the rungs), footU (where you stand to climb), t (of the foot) } — or null. */
export function mastLadder(ship) {
  const d = shipDims(ship.def), nest = mastNest(d);
  if (!nest) return null;
  const u = nest.mu - nest.mr - 0.14, footU = u - 0.45;
  return { nest, u, footU, t: (footU + d.L / 2) / d.L };
}

/** Can `p` climb her masthead ladder from where they stand? (on her main deck, at its foot) */
function ladderHere(game, p) {
  const s = p.deck?.ship;
  if (!s || p.climb || p.mode !== 'foot' || p.state !== 'idle' || p.hitstun > 0) return null;
  const L = mastLadder(s);
  if (!L) return null;
  const c = Math.cos(s.heading), sn = Math.sin(s.heading), dx = game.world.dx(s.x, p.x), dy = p.y - s.y;
  const u = dx * c + dy * sn, v = -dx * sn + dy * c;
  const dist = Math.hypot(u - L.footU, v);
  if (dist > 1.3 || Math.abs((p.deck.h ?? L.nest.base) - L.nest.base) > 0.5) return null;
  return { ship: s, L, d: dist };
}

export function installMasthead(game) {
  game.mastLadder = mastLadder;
  game.placeOnDeck = (a, s, t, v) => placeOnDeck(game, a, s, t, v);
  const prev = game.footInteraction;
  game.footInteraction = (p) => {
    const other = prev ? prev(p) : null;
    const h = ladderHere(game, p);
    if (!h) return other;
    const mine = { d: h.d, x: p.x, y: p.y, label: 'Climb to the crow\'s nest', run: () => startMastClimb(game, p, h) };
    return !other || mine.d <= other.d ? mine : other;
  };
  game.on('tick', (dt) => {
    const p = game.player;
    if (p?.climb?.mast) mastStep(game, p, dt);
  });
}

function startMastClimb(game, p, h) {
  const { ship, L } = h;
  if (p.deck) { ship.aboard?.delete(p); p.deck = null; }
  p.climb = { mast: true, ship, L, k: 0, H: L.nest.y - L.nest.base, top: false };
  p.vx = p.vy = p.vz = 0; p.dash = null; p.blocking = false;
  if (p.action?.def.m1Chain) p.action = null;
  game.audio?.sfx('step', p);
  if (p.isPlayer) game.hint?.('masthead', 'Up the mast: hold W to climb, S to climb down, Space to let go. At the top you\'re in the crow\'s nest.');
}

/** A frame on the mast: up or down the rungs (or settled in the nest), riding with her. */
function mastStep(game, p, dt) {
  const c = p.climb, s = c.ship;
  if (!s || s.sunk || s.alive === false) { p.climb = null; p.vz = -0.01; return; }
  if (p.letGo) { p.letGo = false; p.climb = null; p.vz = -0.01; p.lastG = null; return; }
  const inp = p.climbInput || 0;
  c.k = Math.max(0, Math.min(1, c.k + (inp * CLIMB_SPEED * dt) / c.H));
  if (c.k <= 0 && inp < 0) {
    // (back down at its foot: on the deck again)
    p.climb = null;
    placeOnDeck(game, p, s, c.L.t, 0);
    return;
  }
  const n = c.L.nest, time = game.env?.time || 0;
  // on the rungs, facing the mast; over the top's rim into the nest at the very end
  const into = Math.max(0, (c.k - 0.94) / 0.06);
  const u = c.L.u - 0.32 + (n.u - 0.15 - (c.L.u - 0.32)) * into;
  const hh = n.base + c.H * Math.min(1, c.k / 0.94) + Math.sin(Math.PI * into) * 0.25;
  const cs = Math.cos(s.heading), sn = Math.sin(s.heading);
  p.x = game.world.wx(s.x + u * cs);
  p.y = s.y + u * sn;
  p.z = shipLift(s, time, u, 0, hh) - p.groundAt(game, p.x, p.y);
  if (c.k < 0.94) p.facing = s.heading;
  p.airT = 0.1;
  c.top = c.k >= 1;
  if (c.top && !c.saidTop && p.isPlayer) { c.saidTop = true; game.hint?.('nest', 'In the crow\'s nest: look out over the sea. S climbs back down.'); }
}
