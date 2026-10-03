// Flight. Those who fly in canon fly here too:
//   'phoenix' – Tori Tori no Mi, Model: Phoenix (Marco): blue-flame wings,
//               flames that regenerate; the longest in the air of anyone
//   'dragon'  – Uo Uo no Mi, Model: Seiryu (Kaido): the Azure Dragon,
//               riding the clouds it makes
//   'ride'    – a Logia user borne up on their element (Smoker's smoke,
//               Crocodile's sand), Fujitora on a rock he lifts
//   'float'   – Kizaru drifting as light, Doflamingo on strings hooked to
//               the clouds (Sora no Michi)
//   'wings'   – a Lunarian's black wings (King)
//   'geppo'   – Geppo (Rokushiki) and Sky Walk (Black Leg): a few kicks off
//               the air in a jump — not true flight (`flying` stays false)
// A fruit's flight comes with a technique of its own (data/fruits.js, the
// one with `flight`), once mastery reaches it; a race's with the race
// (data/races.js `flight`).
//
// How it plays:
//  * Take off with a second press of Space in the air (a jump, then Space
//    again: a double tap), or with the power's own technique. In the air
//    Space climbs and C dives (as in creative mode), Shift speeds you up.
//    Land by coming down onto the ground (C), with a double tap of Space,
//    or with the technique again.
//  * Endurance: a flier's gauge drains in the air — more climbing or flat
//    out, less gliding down — and several times faster over the open sea,
//    where nothing refills it; it fills up again on your feet (a deck
//    counts). Run dry and you come down whether you like it or not — out at
//    sea, into it, where a Devil Fruit user sinks. Sailing stays the way
//    across the sea: the Phoenix and the Dragon can hop a strait, nobody
//    an ocean.
//  * Nothing is solid to a flier but the ground (a cliff is a wall), the
//    buildings below their roofs, walls, trees and the like low down, and
//    ships. No sky indoors, under the sea or in Impel Down.
//  * Fighting: shots and beams reach anything in the air; a blow reaches
//    only what's about level with you (combat.js canHit: reachesUp) — so a
//    flier swoops down onto whatever it swings at, and a dive (Phoenix
//    Brand) comes down on its target. A heavy blow knocks a flier out of
//    the sky; so does Seastone (a fruit's flight only) or gravity (Zushi).
//
// What the animation reads (render3d): a.flying, a.flightStyle (above, or
// null), a.flightRide (what a 'ride'/'float'/'dragon' flier is borne on:
// 'smoke' | 'sand' | 'rock' | 'light' | 'strings' | 'cloud'), a.flightBank
// (-1..1, leaning into a turn), a.flightClimb (m/s up, - diving),
// a.flightSpeed (m/s), a.flightGauge (0..1), a.flightTired (run dry, coming
// down), a.takeoffT / a.landT / a.airStepT (env time of the last take-off,
// landing and Geppo kick off the air), a.phoenixForm (actor.js).
import { clamp, angleDiff, TAU } from '../core/math.js';
import { RACES } from '../data/races.js';
import { deckLift } from '../world/hull.js';

const DEF = { speed: 10, climb: 6, dive: 9, ceiling: 35, drain: 1, sea: 3.5, refill: 6 };
const SEA_CEILING = 14; // m over the water: no climbing out of sight over the open sea
const LOW = 3.5; // m over the ground below which walls, trees and the like are in the way

const helpless = (a) => !!(a.status && (a.status.freeze || a.status.despair || a.status.heartless || a.status.pieces || a.status.lifted || a.status.puppet));
const timeOf = (game) => game.env?.time ?? game.time ?? 0;

/**
 * How `a` flies, if they can just now: { style, gauge (s), speed, climb,
 * dive (m/s), ceiling (m over the ground), drain (×), sea (× out over the
 * open sea), refill (s from empty), ride, fruit (it's a fruit's: Seastone and
 * the sea take it) } — the best of their fruit's (mastered far enough) and
 * their race's — or null.
 */
export function flightOf(a) {
  let best = null;
  const f = a?.fruitDef;
  if (f) {
    for (const t of f.techniques) {
      if (!t.flight || (a.fruitMastery || 0) < t.mastery) continue;
      const s = { ...DEF, ...t.flight, fruit: true, tech: t.id };
      if (!best || s.gauge > best.gauge) best = s;
    }
  }
  const R = RACES[a?.race]?.flight;
  if (R && (!best || R.gauge > best.gauge)) best = { ...DEF, ...R, fruit: false };
  return best;
}

/** The height of the ground (or the sea's surface) at (x, y), as fliers are drawn over it. */
export function groundBase(game, x, y) {
  return game.view3d ? Math.max(0, game.view3d.ground(x, y)) : 0;
}

/** Where `a`'s feet are (m above the sea): up in the air, or as they stand. */
export function feetOf(a, game) {
  if (a.flying && a.alt != null) return a.alt;
  return a.feetH ? a.feetH(game) : (a.z || 0);
}

/** Out over the open sea at (x, y)? (not a pier, a bridge, a deck or land) */
export function overOpenSea(game, x, y) {
  const w = game.world;
  if (!w.isLiquid?.(x, y) || w.isOverlay?.(x, y)) return false;
  if (game.deckAt && game.ships?.length && game.deckAt(x, y, 0)) return false;
  return true;
}

/** Can a flier be at (x, y) at `alt` m (or where it is now)? */
export function flyableAt(a, game, x, y, alt = a.alt ?? feetOf(a, game)) {
  const w = game.world;
  if (y < 1 || y > w.height - 1) return false;
  if (w.interiorAt?.(x, y)) return false;
  const g = groundBase(game, x, y);
  // (rising ground: a gentle rise is flown up over, a cliff is a wall)
  if (g > alt + 0.6) return false;
  const roof = game.view3d?.roofAt?.(x, y);
  if (roof && roof.h > alt + 0.5) return false;
  if (alt - g < LOW && (w.solid?.(x, y) || w.hitsProp?.(x, y, (a.r || 0.28) * 0.9))) return false;
  if (game.inShip && game.ships?.length) for (const s of game.ships) if (game.inShip(s, x, y, alt + 0.9, true)) return false;
  return true;
}

/** The highest thing under a flier at (x, y) it could come down on: the ground or the sea, a roof, a deck. */
function floorUnder(a, game, x, y) {
  let f = groundBase(game, x, y);
  const roof = game.view3d?.roofAt?.(x, y, a.alt + 0.3);
  if (roof && roof.h > f) f = roof.h;
  if (game.deckAt && game.ships?.length) {
    const dk = game.deckAt(x, y, 0.1);
    if (dk) { const h = deckLift(dk, timeOf(game)); if (h > f && h <= a.alt + 0.3) f = h; }
  }
  return f;
}

/** Why `a` can't take off just now (a word for the player), or '' if they can. */
export function cantTakeOff(a, game) {
  const S = flightOf(a);
  if (!S) return 'nowings';
  if (a.flying) return 'flying';
  if (a.state !== 'idle' || a.onShip || a.climb || helpless(a) || a.hitstun > 0.25 || a.status?.grounded) return 'busy';
  if (a.inWater) return 'water';
  const zone = game.world.zone;
  if (zone === 2 || zone === 3) return 'nosky';
  if (game.world.interiorAt?.(a.x, a.y) && !a.roofed) return 'indoors';
  if (S.fruit && a.seastoned) return 'seastone';
  if ((a.flightGauge ?? 1) < 0.25) return 'tired';
  return '';
}

const WHY = {
  water: 'You can\'t take off from the water.', nosky: 'There\'s no sky to fly in down here.', indoors: 'No room to fly in here.',
  seastone: 'Seastone holds your power down.', tired: 'Too tired to fly — catch your breath on solid ground.', busy: '',
};

/** Up into the air. True if they took off. */
export function takeOff(a, game) {
  const why = cantTakeOff(a, game);
  if (why) {
    if (a.isPlayer && WHY[why]) game.log(WHY[why], '#ff8a80');
    return false;
  }
  const S = flightOf(a);
  const alt = feetOf(a, game);
  if (a.deck) { a.deck.ship.aboard?.delete(a); a.deck = null; }
  a.flying = true;
  a.flightStyle = S.style;
  a.flightRide = S.ride || null;
  a.flight = { spec: S, t: 0, lift: (a.z || 0) > 0.6 ? 0.15 : 0.4, tired: false, landing: false };
  a.alt = alt;
  a.vz = 0; a.charging = 0; a.wading = 0;
  if (!a.dash?.dodge) a.dash = null;
  if (a.flightGauge === undefined) a.flightGauge = 1;
  a.flightTired = false;
  a.takeoffT = timeOf(game);
  takeoffFx(a, game, S);
  game.audio?.sfx('jump_big', a);
  if (a.isPlayer) {
    game.emit?.('playerTakeOff', S.style);
    game.hint?.('flight', 'FLYING! Space climbs, C dives, Shift for speed. Your flight gauge drains in the air — far faster out over the open sea — and fills up again on solid ground. Come down onto the ground (or double-tap Space) to land.');
  }
  return true;
}

/** Down onto whatever's under you (the ground, a roof, a deck — or the sea). */
export function land(a, game, quiet = false) {
  if (!a.flying || !a.flight) return;
  endFlight(a, game, -0.01);
  a.landT = timeOf(game);
  if (!quiet && (a.z || 0) < 0.6) {
    game.fx.burst(a.x, a.y, 8, { color: ['#d7ccc8', '#efebe9'], speed: 2.2, g: 1.2, z: 0.1, vz: 0.5, life: 0.45, kind: 'dust', size: 0.18, grow: 0.4 });
    game.audio?.sfx('land', a);
  }
}

/** Out of the sky without a landing: knocked down, run dry over the sea, Seastone, gravity. */
export function fall(a, game) {
  if (!a.flying || !a.flight) return;
  endFlight(a, game, Math.min(-1, a.flightClimb || -1));
}

function endFlight(a, game, vz) {
  const g = a.groundAt ? a.groundAt(game, a.x, a.y) : 0;
  a.flying = false;
  a.flight = null;
  a.flightStyle = null;
  a.flightRide = null;
  a.flightTired = false;
  a.flightClimb = 0; a.flightBank = 0;
  a.z = Math.max(0, (a.alt ?? g) - g);
  a.vz = a.z > 0.02 ? vz : 0;
  a.alt = null;
  a.airT = 0;
  // (from where you are: on a roof under you, or on down to the street)
  a.lastG = g; a.lastGX = a.x; a.lastGY = a.y;
}

/** Knocked out of the sky by a heavy blow. */
export function downFlyer(a, game) {
  if (!a.flying || !a.flight) return;
  fall(a, game);
  game.fx.text(a.x, a.y - 1.6, 'DOWNED!', '#ff8a80', 0.34);
}

/** Take off, or (flying) come down to land. */
export function toggleFlight(a, game) {
  if (a.flying && a.flight) { a.flight.landing = true; return true; }
  return takeOff(a, game);
}

/**
 * A flier's frame (Actor.update calls it instead of walking): the gauge,
 * moving about the sky, climbing and diving, swooping onto what it swings
 * at, bumping into what's solid, and coming down.
 */
export function flyStep(a, dt, game) {
  const F = a.flight, S = F.spec, i = a.intent, w = game.world;
  F.t += dt;
  a.inWater = false; a.under = false; a.depth = 0; a.wading = 0;
  if (a.alt == null) a.alt = feetOf(a, game);
  // what brings a flier down
  if (a.flightOut || helpless(a) || a.status.grounded || (S.fruit && a.seastoned) || w.zone === 2 || w.zone === 3) {
    a.flightOut = false;
    fall(a, game);
    return;
  }
  // the gauge
  const sea = overOpenSea(game, a.x, a.y);
  const moving = Math.hypot(i.mx, i.my) > 0.1;
  let rate = S.drain;
  if (i.sprint && moving) rate *= 1.7;
  if (F.lift > 0 || (i.mz > 0 && !F.tired)) rate *= 1.3;
  else if (i.mz < 0 || F.landing || F.tired) rate *= 0.5;
  if (sea) rate *= S.sea;
  a.flightGauge = Math.max(0, (a.flightGauge ?? 1) - rate * dt / S.gauge);
  if (a.flightGauge <= 0 && !F.tired) {
    F.tired = true;
    a.flightTired = true;
    if (a.isPlayer) game.log(sea ? 'Your strength gives out over the open sea — you\'re coming down!' : 'Your strength gives out — you\'re coming down.', '#ff8a80');
  }
  // across the sky
  let sp = S.speed * (i.sprint && !F.tired ? 1.6 : 1) * (F.tired ? 0.7 : 1);
  if (a.action) sp *= a.action.def.moveMul ?? (a.action.def.m1Chain ? 0.6 : 0.4);
  if (a.hitstun > 0) sp = 0;
  if (a.status.slowmo) sp *= 0.2;
  if (a.status.chill) sp *= 0.6;
  if (a.zoneSlow) sp *= a.zoneSlow;
  const k = Math.min(1, dt * 3.5);
  const hv0 = Math.atan2(a.vy, a.vx), s0 = Math.hypot(a.vx, a.vy);
  a.vx += (i.mx * sp - a.vx) * k; a.vy += (i.my * sp - a.vy) * k;
  let vx = a.vx, vy = a.vy;
  if (a.dash) {
    vx = a.dash.vx; vy = a.dash.vy;
    a.dash.t -= dt;
    if (a.dash.t <= 0) { a.dash = null; a.vx *= 0.3; a.vy *= 0.3; }
  }
  vx += a.kb.x; vy += a.kb.y;
  const decay = Math.exp(-dt * 8);
  a.kb.x *= decay; a.kb.y *= decay;
  if (Math.abs(a.kb.x) < 0.05) a.kb.x = 0;
  if (Math.abs(a.kb.y) < 0.05) a.kb.y = 0;
  // up and down
  let vz;
  if (F.lift > 0) { F.lift -= dt; vz = S.climb * 1.2; }
  else if (F.landing) vz = -S.dive;
  else if (F.tired) vz = -3.5;
  else vz = (i.mz || 0) * ((i.mz || 0) > 0 ? S.climb : S.dive);
  const sw = swoopAlt(a, game);
  if (sw !== null) vz = clamp((sw - a.alt) * 6, -16, Math.max(vz, 3));
  a.alt += vz * dt;
  // (bumping into what's solid, a step at a time)
  const n = Math.max(1, Math.ceil(Math.hypot(vx, vy) * dt / 0.25));
  for (let s = 0; s < n; s++) {
    const nx = w.wx(a.x + vx * dt / n), ny = a.y + vy * dt / n;
    if (flyableAt(a, game, nx, a.y)) a.x = nx; else { a.vx *= 0.2; a.kb.x *= -0.3; if (a.dash) a.dash.vx = 0; }
    if (flyableAt(a, game, a.x, ny)) a.y = ny; else { a.vy *= 0.2; a.kb.y *= -0.3; if (a.dash) a.dash.vy = 0; }
  }
  // the floor and the ceiling
  const g = groundBase(game, a.x, a.y);
  const ceil = g + (sea ? SEA_CEILING : S.ceiling);
  if (a.alt > ceil) a.alt = Math.max(ceil, a.alt - 6 * dt);
  const floor = floorUnder(a, game, a.x, a.y);
  if (a.alt < floor) a.alt = floor;
  a.z = a.alt - g;
  // (how it's flying, for the animation: speed, climb, a lean into turns)
  const sp2 = Math.hypot(vx, vy);
  a.flightSpeed = sp2;
  a.flightClimb = vz;
  const turn = s0 > 1 && sp2 > 1 ? angleDiff(hv0, Math.atan2(a.vy, a.vx)) / Math.max(dt, 1e-3) : 0;
  a.flightBank = clamp((a.flightBank || 0) + (clamp(turn * 0.35, -1, 1) - (a.flightBank || 0)) * Math.min(1, dt * 5), -1, 1);
  a.moving = sp2 > 0.4; a.speed = sp2;
  if (a.moving && !a.action && !a.isPlayer) a.facing += angleDiff(a.facing, Math.atan2(vy, vx)) * Math.min(1, dt * 8);
  trailFx(a, game, S, dt);
  // down onto something: landed (on purpose, run dry, or down onto the sea)
  if (a.alt <= floor + 0.05 && vz <= 0 && F.t > 0.3 && (F.landing || F.tired || (i.mz || 0) < 0)) land(a, game);
}

/**
 * A flier swinging at something below (or above) comes to it: the height to
 * be at for the blow, while it's wound up and swung (null: no swoop). A
 * dive (`dash.dive`: Phoenix Brand) comes down on its target over the charge.
 */
function swoopAlt(a, game) {
  const act = a.action;
  if (!act) return null;
  const def = act.def;
  const melee = (def.steps || []).some((s) => (s.hit && s.hit.shape !== 'line' && !s.proj) || s.dash?.hit);
  if (!melee || act.t > (def.windup ?? 0.1) + 0.45) return null;
  const t = act.target && act.target.alive !== undefined && act.target.state === 'idle' ? act.target : foeBelow(a, game);
  if (!t) return a.dash?.dive ? groundBase(game, a.x, a.y) + 0.4 : null;
  return feetOf(t, game) + 0.3;
}

/** The nearest foe within a few metres of a flier, roughly where it faces (for a swoop). */
function foeBelow(a, game) {
  let best = null, bd = Infinity;
  for (const e of game.actorsNear(a.x, a.y, 4.5)) {
    if (e === a || e.state !== 'idle' || !game.combat.canHit(a, e, { vx: 0 })) continue;
    const dx = game.world.dx(a.x, e.x), dy = e.y - a.y;
    if (Math.abs(angleDiff(a.facing, Math.atan2(dy, dx))) > 1.3) continue;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/**
 * Can a blow (or a field, or a blast) from `att` reach `tgt` up or down?
 * Shots and beams reach anything in the air; a blow only about level with
 * the one swinging it (a big one a little further), a field or a blast as
 * high as it stands over the ground there.
 */
export function reachesUp(att, tgt, h, game) {
  if (!(att?.flying || tgt.flying)) return true;
  if (h.vx !== undefined || h.isProj || h.shape === 'line') return true;
  const groundRef = h.zone || (h.radial && !h.follow);
  const from = groundRef ? groundBase(game, h.x ?? tgt.x, (h.y ?? tgt.y) + 0.4) : feetOf(att, game);
  const gap = Math.abs(from - feetOf(tgt, game));
  const reach = h.reachZ ?? (h.radial || h.shape === 'circle' ? Math.max(2.4, (h.range || 1) * 0.7) : 2.4);
  return gap <= reach * Math.max(att?.look?.scale || 1, tgt.look?.scale || 1);
}

/** A flier's gauge fills again with its feet on something solid (not swimming). */
export function refill(a, dt, game) {
  if (a.flying || !(a.flightGauge < 1)) return;
  if (a.inWater || (a.z || 0) > 0.05 || a.vz || a.state !== 'idle') return;
  const S = flightOf(a);
  if (!S) return;
  a.flightGauge = Math.min(1, a.flightGauge + dt / S.refill);
}

// ------------------------------------------------------------------ Geppo
/** How many times `a` can kick off the air in one jump (Geppo, Sky Walk), or 0. */
export function geppoSteps(a) {
  const t = a.techniques || [];
  let n = 0;
  if (t.includes('roku_geppo')) n = Math.max(n, 2 + Math.floor((a.masteries?.rokushiki || 0) / 35));
  if (t.includes('bleg_skywalk')) n = Math.max(n, 2 + Math.floor((a.masteries?.black_leg || 0) / 35));
  return n;
}

/** Kick off the air (Geppo): up again, and on the way you're going. True if it happened. */
export function airStep(a, game) {
  const n = geppoSteps(a);
  if (!n || a.flying || (a.airSteps || 0) >= n) return false;
  if (a.state !== 'idle' || helpless(a) || a.hitstun > 0 || a.inWater || a.climb || a.onShip) return false;
  if (!((a.z || 0) > 0.35 || a.vz > 0.5)) return false;
  const J = a.jumpStats();
  a.vz = J.v * 0.9;
  const l = Math.hypot(a.intent.mx, a.intent.my);
  const dx = l > 0.2 ? a.intent.mx / l : Math.cos(a.facing), dy = l > 0.2 ? a.intent.my / l : Math.sin(a.facing);
  a.dash = { vx: dx * 9, vy: dy * 9, t: 0.22, ignoreWater: true };
  a.airSteps = (a.airSteps || 0) + 1;
  a.flightStyle = 'geppo';
  a.airStepT = timeOf(game);
  for (let k = 0; k < 2; k++) game.fx.add('ring', { x: a.x, y: a.y, r0: 0.1, r1: 0.7 + k * 0.3, color: '#ffffff', width: 0.07, life: 0.3, z: Math.max(0.05, a.z || 0), flat: 0.5, add: true, delay: k * 0.05 });
  game.audio?.sfx('jump', a);
  return true;
}

// ------------------------------------------------------------------ the look of it
function takeoffFx(a, game, S) {
  const fx = game.fx, z = Math.max(0.05, a.z || 0);
  fx.burst(a.x, a.y, 10, { color: ['#d7ccc8', '#efebe9'], speed: 3, g: 1.2, z, vz: 0.6, life: 0.5, kind: 'dust', size: 0.2, grow: 0.4 });
  fx.ring(a.x, a.y, 0.2, 1.6, S.color || '#ffffff', 0.35, 0.1, { z, flat: 0.55, add: true });
  const c = S.color || '#ffffff';
  if (S.style === 'phoenix') fx.burst(a.x, a.y, 18, { color: ['#4dd0e1', '#80deea', '#fff59d'], speed: 3, g: -1, z: z + 1, vz: 1.5, life: 0.7, kind: 'fire', size: 0.2 });
  else if (S.style === 'dragon') fx.burst(a.x, a.y, 14, { color: ['#eceff1', '#cfd8dc', '#ffffff'], speed: 3, g: 0, z: z + 0.3, life: 0.9, kind: 'smoke', size: 0.5, grow: 0.6 });
  else if (S.style === 'wings') fx.burst(a.x, a.y, 10, { color: ['#212121', '#37474f'], speed: 3, g: 2, z: z + 1.2, vz: 1, life: 0.8, kind: 'leaf', size: 0.12 });
  else fx.burst(a.x, a.y, 12, { color: [c, '#ffffff'], speed: 2.5, g: 0, z: z + 0.2, life: 0.6, kind: S.ride === 'light' ? 'glow' : S.ride === 'sand' ? 'sand' : 'smoke', size: 0.3, grow: 0.3 });
}

/** What streams off a flier as it goes (near the player only). */
function trailFx(a, game, S, dt) {
  const p = game.player;
  if (!p || (a !== p && game.world.dist2(a.x, a.y, p.x, p.y) > 40 * 40)) return;
  a._flyFxT = (a._flyFxT || 0) - dt;
  if (a._flyFxT > 0) return;
  a._flyFxT = 0.05;
  const fx = game.fx, z = a.z || 0, r = () => (Math.random() - 0.5);
  const back = { vx: -(a.vx || 0) * 0.25, vy: -(a.vy || 0) * 0.25 };
  switch (S.style) {
    case 'phoenix':
      // (blue flames streaming off the wings and the tail)
      for (let k = 0; k < 2; k++) fx.particle({ x: a.x + r() * 1.4, y: a.y + r() * 0.6, z: z + 1.1 + r() * 0.5, ...back, vz: 0.5, g: -0.6, life: 0.5, size: 0.16, grow: -0.12, color: ['#4dd0e1', '#80deea', '#26c6da', '#fff59d'][k + (Math.random() < 0.5 ? 0 : 2)], kind: 'fire' });
      break;
    case 'dragon':
      fx.particle({ x: a.x + r() * 1.6, y: a.y + r() * 0.8, z: z + 0.1, ...back, vz: -0.2, g: 0, life: 1.1, size: 0.45, grow: 0.5, color: Math.random() < 0.5 ? '#eceff1' : '#cfd8dc', kind: 'smoke' });
      if (Math.random() < 0.08) fx.burst(a.x, a.y, 3, { color: '#90caf9', speed: 3, g: 0, z: z + 1, life: 0.15, kind: 'line', size: 0.05 });
      break;
    case 'wings':
      if (Math.random() < 0.25) fx.particle({ x: a.x + r() * 0.8, y: a.y + r() * 0.4, z: z + 1.3, ...back, vz: -0.3, g: 0.6, life: 1.2, size: 0.1, color: '#212121', kind: 'leaf', rot: Math.random() * TAU, vr: r() * 6 });
      break;
    case 'ride':
      fx.particle({ x: a.x + r() * 0.6, y: a.y + r() * 0.4, z: Math.max(0, z - 0.15), ...back, vz: -0.4, g: 0, life: 0.8, size: S.ride === 'rock' ? 0.12 : 0.35, grow: S.ride === 'rock' ? 0 : 0.4, color: S.color || '#eceff1', kind: S.ride === 'sand' ? 'sand' : S.ride === 'rock' ? 'dust' : 'smoke' });
      break;
    case 'float':
      if (S.ride === 'strings') fx.particle({ x: a.x + r() * 0.4, y: a.y + r() * 0.2, z: z + 1.6, vx: 0, vy: 0, vz: 7, g: 0, life: 0.3, size: 0.04, color: '#f8bbd0', kind: 'line' });
      else fx.particle({ x: a.x + r() * 0.8, y: a.y + r() * 0.5, z: z + 0.4 + Math.random(), ...back, vz: 0.2, g: 0, life: 0.4, size: 0.14, color: S.color || '#fff59d', kind: 'glow' });
      break;
    default: break;
  }
}

// ------------------------------------------------------------------ fliers the game drives
/**
 * A foe who can fly (Kaido the dragon, King on his wings) — called each
 * frame by the AI (ai.js): up after a target that's taken to the air, or —
 * a boss with something to throw or dive with from up there (`sorties`) —
 * now and then for a few seconds over the fight; down again when tired, or
 * when the sortie's over. Sets a.intent.mz; the AI steers as ever (and a
 * blow swung from up there swoops down to its target: see flyStep).
 */
export function aiFlight(a, ctl, t, dist, game, sorties = false) {
  if (!a.flying) a.intent.mz = 0;
  const S = flightOf(a);
  if (!S) return;
  const now = game.time || 0;
  if (!a.flying) {
    if (ctl.flyNext === undefined) ctl.flyNext = now + 6 + Math.random() * 8;
    const above = !!t.flying && feetOf(t, game) - feetOf(a, game) > 2.2;
    const sortie = a.boss && sorties && now >= ctl.flyNext && dist < 14;
    if ((above || sortie) && !cantTakeOff(a, game)) {
      takeOff(a, game);
      ctl.flyChase = above;
      ctl.flyUntil = now + (above ? 30 : 5 + Math.random() * 3);
      ctl.flyNext = now + 16 + Math.random() * 10;
    }
    return;
  }
  if (!a.flight) return;
  // (down when tired, when the sortie's over — or when the one they went up after comes down)
  if (a.flightGauge < 0.2 || (now > (ctl.flyUntil ?? 0) && !t.flying) || (ctl.flyChase && !t.flying)) a.flight.landing = true;
  const want = t.flying ? feetOf(t, game) : feetOf(t, game) + (a.flight.landing ? 0 : 4.5);
  a.intent.mz = clamp((want - a.alt) / 2, -1, 1);
}
