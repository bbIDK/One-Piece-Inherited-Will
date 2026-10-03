// The Drum Ropeway: a cabin on a cable from the foot of Drum Rock up its
// sheer face to Drum Castle on the summit — the way up, short of climbing a
// cliff seventy metres tall (or riding down the rope on a reindeer's sled).
// E at either station rides it: you step into the cabin, it swings out over
// the snow and climbs (or drops down) the face, and you step out at the other
// end. (world.ropeways: laid out by islandgen.js; drawn by render3d/ropeway3d.js.)
//
// A ride is a climb (actor.climb, with `ride`): nobody fights, jumps or
// dodges hanging off a cable, and the body stands at ease in the cabin.

/** How far under its cable a cabin's floor hangs (m). */
export const HANG = 4.2;
/** A cabin's floor over the platform it stops at (m). */
export const FLOOR = 0.3;
/** Its speed on the cable (m/s), and the time to step in or out (s). */
const SPEED = 7.5, STEP_T = 1.2;

const smooth = (k) => k * k * (3 - 2 * k);

/**
 * The ropeway's heights, worked out once the ground's there to stand on:
 * each station's platform (its floor, `fa`/`fb`) and the cable over it
 * (`ha`/`hb`), and how far the cable sags in the middle.
 */
export function rigRopeway(game, rw) {
  if (rw.ha !== undefined) return rw;
  const v = game.view3d;
  if (!v) return null;
  rw.fa = v.ground(rw.aExit.x, rw.aExit.y) + FLOOR;
  rw.fb = v.ground(rw.bExit.x, rw.bExit.y) + FLOOR;
  rw.ha = rw.fa + HANG; rw.hb = rw.fb + HANG;
  const w = game.world, run = Math.hypot(w.dx(rw.a.x, rw.b.x), rw.b.y - rw.a.y);
  rw.len = Math.hypot(run, rw.hb - rw.ha);
  rw.sag = Math.min(3, rw.len * 0.025);
  return rw;
}

/** The cable's height (m over the sea) at `s` along it (0 the foot station, 1 the top). */
export function cableAt(rw, s) {
  return rw.ha + (rw.hb - rw.ha) * s - rw.sag * 4 * s * (1 - s);
}

/** Where the cable is over the ground at `s` along it. */
export function cableXY(world, rw, s) {
  return { x: world.wx(rw.a.x + world.dx(rw.a.x, rw.b.x) * s), y: rw.a.y + (rw.b.y - rw.a.y) * s };
}

/** Is someone riding ropeway `rw` just now (the cabin's away from its station)? */
export const busyRope = (game, rw) => (game.actors || []).some((a) => a.climb?.ride === rw);

/**
 * Ride `rw` from the station at `from` ('a' the foot, 'b' the top): into the
 * cabin waiting there (it comes down — or up — to fetch you first if it's at
 * the other end), along the cable, and out at the other station.
 */
export function startRide(game, a, rw, from) {
  if (!rigRopeway(game, rw) || a.climb || a.onShip) return false;
  const up = from === 'a';
  // (the cabin's at the other end: it's fetched first, empty)
  const fetch = rw.at !== undefined && rw.at !== (up ? 0 : 1);
  if (a.deck) { a.deck.ship.aboard?.delete(a); a.deck = null; }
  a.climb = { ride: rw, up, phase: fetch ? 'wait' : 'in', t: 0, to: {}, x0: a.x, y0: a.y, h0: a.feetH(game) };
  a.vx = 0; a.vy = 0; a.vz = 0; a.kb.x = 0; a.kb.y = 0;
  a.dash = null; a.blocking = false; a.charging = 0; a.lastG = null;
  if (a.isPlayer) {
    game.audio?.sfx('bell', a);
    game.log(up ? 'You step into the cabin. The bell rings, and the cable takes up the strain.' : 'You step into the cabin for the long drop down the face of Drum Rock.', '#b3e5fc');
  }
  return true;
}

/** One step of a ride (from actor.updateClimb). */
export function rideStep(a, dt, game) {
  const c = a.climb, rw = c.ride, w = game.world;
  const [s0, s1] = c.up ? [0, 1] : [1, 0];
  const bay0 = c.up ? rw.a : rw.b, bay1 = c.up ? rw.b : rw.a;
  const exit1 = c.up ? rw.bExit : rw.aExit;
  const floor0 = c.up ? rw.fa : rw.fb, floor1 = c.up ? rw.fb : rw.fa;
  const place = (x, y, h) => { a.x = w.wx(x); a.y = y; a.z = h - a.groundAt(game, a.x, a.y); };
  c.t += dt;
  a.airT = 0; a.iframes = Math.max(a.iframes || 0, 0.2);
  if (c.phase === 'wait') {
    // the empty cabin coming to fetch you
    const T = rw.len / SPEED;
    const k = Math.min(1, c.t / T);
    rw.s = s1 + (s0 - s1) * smooth(k);
    if (k >= 1) { rw.at = s0; c.phase = 'in'; c.t = 0; }
    return;
  }
  if (c.phase === 'in') {
    // across the platform and into the cabin
    const k = Math.min(1, c.t / STEP_T), e = smooth(k);
    rw.s = s0;
    place(c.x0 + w.dx(c.x0, bay0.x) * e, c.y0 + (bay0.y - c.y0) * e, c.h0 + (floor0 - c.h0) * e);
    a.facing = Math.atan2(bay0.y - c.y0, w.dx(c.x0, bay0.x)) || a.facing;
    a.moving = k < 1;
    if (k >= 1) {
      c.phase = 'go'; c.t = 0; c.T = rw.len / SPEED + 1.2; rw.at = undefined;
      if (a.isPlayer) game.audio?.sfx('anchor_weigh', a);
    }
    return;
  }
  if (c.phase === 'go') {
    // along the cable: a gentle start, a steady run, a gentle stop
    const k = Math.min(1, c.t / c.T), e = smooth(k);
    const s = s0 + (s1 - s0) * e;
    rw.s = s;
    const p = cableXY(w, rw, s);
    place(p.x, p.y, cableAt(rw, s) - HANG);
    // (facing the way she's going, out of the cabin's front window)
    a.facing = Math.atan2(bay1.y - bay0.y, w.dx(bay0.x, bay1.x));
    a.moving = false;
    if (k >= 1) {
      rw.at = s1; c.phase = 'out'; c.t = 0;
      if (a.isPlayer) game.audio?.sfx('hull_creak', a);
    }
    return;
  }
  // out of the cabin onto the platform, and off it onto your own two feet
  const k = Math.min(1, c.t / STEP_T), e = smooth(k);
  rw.s = s1;
  const g1 = floor1 - FLOOR;
  place(bay1.x + w.dx(bay1.x, exit1.x) * e, bay1.y + (exit1.y - bay1.y) * e, floor1 + (g1 - floor1) * e);
  a.facing = Math.atan2(exit1.y - bay1.y, w.dx(bay1.x, exit1.x)) || a.facing;
  a.moving = k < 1;
  if (k >= 1) endRide(a, game);
}

/** Off the ropeway: on your feet at the station you rode to (or, cut short, where the cabin is). */
export function endRide(a, game) {
  const c = a.climb;
  if (!c?.ride) return;
  const rw = c.ride;
  a.climb = null;
  const done = c.phase === 'out';
  const ex = done ? (c.up ? rw.bExit : rw.aExit) : (c.up && c.phase !== 'wait' ? rw.bExit : rw.aExit);
  a.x = game.world.wx(ex.x); a.y = ex.y; a.z = 0; a.vz = 0;
  a.lastG = null; a.airT = 0; a.moving = false;
  a.lastLanded = game.time || 0;
  if (!done) rw.at = c.up && c.phase !== 'wait' ? 1 : 0;
  if (a.isPlayer && done) game.emit?.('ropewayArrived', { rw, up: c.up });
}

/** The stations: E rides the cabin (the one there, or fetches it). */
export function installRopeways(game) {
  game.interactions.onObject('ropeway', (o) => {
    const p = game.player, rw = game.world.ropeways?.find((r) => r.id === o.rope);
    if (!p || !rw) return;
    if (busyRope(game, rw)) { game.log('The cabin is out on the cable. Wait for it to come in.', '#b0bec5'); return; }
    startRide(game, p, rw, o.end);
  });
  // (a ride is never saved half-way: a save mid-ride puts you at the station you were making for)
  game.on('characterStart', () => { for (const rw of game.world?.ropeways || []) { rw.s = undefined; rw.at = undefined; } });
}
