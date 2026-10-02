// Traffic at sea: a few ships going about their business — merchantmen and
// fishing boats plying between the islands, Marine patrols, pirates on the
// prowl — each with its crew on deck, sailing smoothly around the coasts.
// Pirates (and, once you're wanted, the Marines) come for your ship.
//
// Come alongside and jump across onto her deck from your own (or swim over
// and climb her ladder), and you're raiding her: the crew fights for their
// ship. Beat them
// and the hold is yours to plunder (the ship herself isn't: new ships come
// only from a harbour's shipwright, see shipwrights.js). Raiding anyone but
// pirates is piracy, and the bounty that comes with it grows the way One
// Piece bounties do.
import { makeNPC, ARCHETYPES } from './npcs.js';
import { crime } from './reputation.js';
import { earn, addItem } from './inventory.js';
import { board } from './interact.js';
import { regionAt, REGION, isGrandLine, isCalmBelt, isBlue } from '../world/constants.js';
import { TAU, clamp, angleDiff } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { placeOnDeck, helmSpot, hatchSpot, deckDist, freeDeckSpot } from './decks.js';
import { shipDims } from '../world/hull.js';
import { SHIPS } from '../data/ships.js';
import { wantedTier } from './wanted.js';
import { T as TT } from '../world/tiles.js';
import { nearRM } from '../world/reverseMountain.js';

const SAILOR = { name: 'Sailor', faction: 'civilian', style: 'brawler', look: { top: '#eceff1', bottom: '#37474f', hat: 'bandana', hatColor: '#1565c0' }, skill: 0.1, barks: ['Repel boarders!', 'Get off our ship!'] };
const FISHER = { name: 'Fisherman', faction: 'civilian', style: 'brawler', look: { top: '#8d6e63', bottom: '#455a64', hat: 'cap', hatColor: '#6d8f5e' }, skill: 0.05, barks: ['Not the catch!', 'Help!'] };
// (as many as have room to stand on deck)
const CREW = { dinghy: 1, sloop: 3, caravel: 4, brigantine: 5, frigate: 6, galleon: 6, marine_warship: 6, carrack: 6, war_galleon: 8, man_o_war: 10, great_galleon: 12, marine_battleship: 10 };
// where the hands stand on a small ship's deck (t along from the stern, v
// across in beams): clear of the mast, the hatch, the barrels and the crate
const SMALL_STATIONS = [[0.82, 0], [0.36, 0.26], [0.64, -0.3], [0.36, -0.26], [0.72, 0.28]];

export function installTraffic(game) {
  const T = game.traffic = { t: 3, ships: [] };
  // (a ship on demand — tests, creative mode and the sea's encounters (sea.js) — force: { kind, type, x, y, heading, dest, level })
  T.spawn = (force) => (game.player ? spawnShip(game, T, game.player, regionAt(game.player.x, game.player.y), force) : null);
  const reset = () => { for (const s of T.ships) { for (const a of s.traffic?.crew || []) a.alive = false; s.alive = false; } T.ships = []; };
  game.on('tick', (dt) => tick(game, T, dt));
  game.on('characterStart', () => { T.ships = []; });
  game.on('enterZone', reset);
  game.on('leaveZone', () => { T.ships = []; });
  // raids that land on a deck however they happen (a jump from your own deck counts)
  T.startRaid = (s) => startRaid(game, T, s);

  // Boarding is done by hand: heave to alongside, leave the helm, and jump
  // across onto her deck. Landing on a deck is what starts a raid (see tick).
  const prevSea = game.seaInteraction;
  game.seaInteraction = (p, s) => {
    const other = prevSea ? prevSea(p, s) : null;
    if (other) return other;
    return null;
  };
  // on foot / swimming: climb aboard, take the helm, plunder the hold
  const prevFoot = game.footInteraction;
  game.footInteraction = (p) => {
    const other = prevFoot ? prevFoot(p) : null;
    const mine = footInteraction(game, T, p);
    if (!mine) return other;
    if (!other) return mine;
    return mine.d <= other.d ? mine : other;
  };
}

// ------------------------------------------------------------ the traffic

function tick(game, T, dt) {
  const p = game.player, w = game.world;
  if (!p || !w || w !== game.surface) return;
  // every ship at sea that isn't yours has her crew aboard (these, and your
  // Marine escorts: see factions.js) — and with nobody left standing on her
  // deck she's adrift, not sailing on empty
  for (const s of game.ships) {
    const tr = s.traffic;
    if (!tr || s.owner === 'player') continue;
    crewFor(game, T, s, p);
    if (tr.crew && !tr.raided && !tr.adrift && !tr.escort && !s.sunk && !tr.crew.some((a) => standing(a, s))) adrift(game, s);
  }
  // raids: landing on a ship's deck starts one; beating the crew ends it
  const dk = p.deck?.ship;
  if (dk && dk.traffic && !dk.traffic.raided && dk.owner !== 'player') {
    if (friendlyBoarding(game, dk)) welcomeAboard(game, dk);
    else startRaid(game, T, dk);
  }
  for (const s of T.ships) if (s.traffic?.raided && !s.traffic.cleared) checkCleared(game, s);
  T.t -= dt;
  if (T.t > 0) return;
  T.t = 4;
  // (a ship gone — out of sight, or to the bottom — takes her crew with her)
  for (const a of game.actors) if (a.crewOf && a.crewOf.alive === false) a.alive = false;
  // (out of sight before she's gone: see sightRange)
  const S = sightRange(game);
  T.ships = T.ships.filter((s) => {
    const keep = s.alive && !s.sunk && s.owner !== 'player' && w.distance(s.x, s.y, p.x, p.y) < (s.traffic?.raided ? Math.max(400, S + 120) : S + 120);
    if (!keep && s.owner !== 'player') { for (const a of s.traffic?.crew || []) a.alive = false; if (!s.sunk) s.alive = false; }
    return keep;
  });
  const reg = regionAt(p.x, p.y);
  if (isCalmBelt(reg) || game.sea?.rmState || nearRM(w.wx(p.x), p.y)) return;
  const nearCoast = w.sd && w.sd(p.x, p.y) < 30;
  const want = p.mode === 'sail' ? 3 : nearCoast ? 2 : 0;
  if (T.ships.filter((s) => !s.traffic?.raided).length < want) spawnShip(game, T, p, reg);
}

function pickKind(rng, reg, game) {
  const nw = reg === REGION.NEW_WORLD, gl = isGrandLine(reg);
  const r = rng.next();
  const marine = wantedTier(game) >= 2 ? 0.34 : 0.22;
  if (nw) return r < 0.42 ? 'pirate' : r < 0.42 + marine ? 'marine' : 'merchant';
  if (gl) return r < 0.32 ? 'pirate' : r < 0.32 + marine ? 'marine' : r < 0.86 ? 'merchant' : 'fishing';
  return r < 0.14 ? 'pirate' : r < 0.14 + marine ? 'marine' : r < 0.66 ? 'merchant' : 'fishing';
}

/** A merchantman or fishing boat under fire: most heave to and wait to be boarded; some run. */
function underFire(game, s) {
  const tr = s.traffic;
  if (!tr || tr.raided || tr.surrender || tr.running || (tr.kind !== 'merchant' && tr.kind !== 'fishing')) return;
  if (Math.random() < 0.7) {
    tr.surrender = true;
    game.fx.text(s.x, s.y - 3, 'We surrender! Don\'t shoot!', '#fff', 0.36, { life: 2.2 });
    game.log(`The ${s.name} strikes her sails and heaves to — come alongside and board her.`, '#ffe082');
  } else {
    tr.running = true;
    game.log(`The ${s.name} crowds on sail and runs for it!`, '#b0bec5');
  }
}

function spawnShip(game, T, p, reg, force = null) {
  const w = game.world;
  const rng = new RNG((Math.floor(game.time * 997) ^ (T.ships.length * 7919)) >>> 0);
  // out beyond the haze, on open water, heading past you: she sails into sight
  const S = sightRange(game);
  for (let tries = 0; tries < 18; tries++) {
    const a = rng.range(0, TAU), r = rng.range(S + 20, S + 80);
    const x = force ? force.x : w.wx(p.x + Math.cos(a) * r), y = force ? force.y : p.y + Math.sin(a) * r;
    const kind = force?.kind || pickKind(rng, reg, game);
    const gl = isGrandLine(reg), nw = reg === REGION.NEW_WORLD;
    // from rowboats to One Piece-scale galleons and battleships
    const type = force?.type || (kind === 'fishing' ? rng.pick(['dinghy', 'sloop'])
      : kind === 'marine' ? (nw ? rng.pick(['marine_warship', 'marine_battleship', 'marine_battleship']) : gl ? rng.pick(['brigantine', 'marine_warship', 'marine_battleship']) : rng.pick(['sloop', 'brigantine', 'brigantine', 'marine_warship']))
        : kind === 'merchant' ? rng.pick(gl ? ['caravel', 'brigantine', 'galleon', 'carrack', 'carrack'] : ['sloop', 'caravel', 'caravel', 'carrack'])
          : rng.pick(nw ? ['galleon', 'war_galleon', 'man_o_war', 'man_o_war', 'great_galleon'] : gl ? ['caravel', 'brigantine', 'frigate', 'war_galleon'] : ['sloop', 'caravel', 'sloop', 'caravel', 'war_galleon']));
    // (a big ship wants plenty of sea room — and nobody sails the canals of Reverse Mountain for fun)
    if (!force && (!w.sailable(x, y) || w.sd(x, y) > -8 - SHIPS[type].length * 0.5 || w.type(x, y) === TT.RAPIDS || nearRM(w.wx(x), y))) continue;
    const pass = a + Math.PI + rng.range(-0.5, 0.5);
    const dest = force?.dest || { x: w.wx(p.x + Math.cos(pass) * r), y: p.y + Math.sin(pass) * r };
    const heading = force?.heading ?? Math.atan2(dest.y - y, w.dx(x, dest.x));
    const faction = kind === 'marine' ? 'marine' : kind === 'pirate' ? 'pirate' : 'civilian';
    const s = game.addShip({
      type, x, y, heading, owner: kind, faction,
      name: kind === 'marine' ? (type === 'marine_battleship' ? 'Marine Battleship' : rng.pick(['Marine Patrol', 'Marine Cutter', 'Marine Escort'])) : kind === 'pirate' ? pirateName(rng) : kind === 'fishing' ? rng.pick(['Fishing Boat', 'Trawler', 'Little Catch']) : rng.pick(['Merchant Ship', 'Trading Brig', 'Cargo Ship', 'Supply Ship']),
      jr: kind === 'pirate' ? { skull: rng.pick(['classic', 'grin', 'eyepatch']), bones: rng.pick(['cross', 'swords']), accessory: rng.pick(['bandana', 'horns', 'tricorne', 'none', 'flames']), color: '#f5f6fa' } : null,
    });
    if (!s.fits(w, x, y, heading)) { s.alive = false; if (force) return null; continue; }
    const lvl = force?.level || (nw ? rng.int(45, 70) : gl ? rng.int(20, 40) : reg === REGION.EAST_BLUE ? rng.int(4, 10) : rng.int(8, 18));
    s.level = lvl;
    // (`hunt`: seconds she comes after you from out of sight, once she means to fight you — a Marine patrol on your trail)
    s.traffic = { kind, dest, level: lvl, crew: null, raided: false, cleared: false, plundered: false, huntUntil: force?.hunt ? (game.time || 0) + force.hunt : 0 };
    s.ai = trafficAI;
    s.hull = s.maxHull = Math.round(s.maxHull * (0.5 + lvl / 40));
    s.loot = Math.round((kind === 'merchant' ? 3500 : kind === 'marine' ? 2500 : kind === 'fishing' ? 400 : 2000) * (1 + lvl / 10) * Math.max(1, s.def.length / 10));
    if (kind === 'merchant' || kind === 'fishing') s.cannonsOverride = 0;
    s.expire = Infinity;
    s.onDamage = (sh, n, att) => { if (att?.isPlayer || att === game.player || att?.ownerShip?.owner === 'player') underFire(game, sh); };
    T.ships.push(s);
    return s;
  }
  return null;
}

function pirateName(rng) {
  return `${rng.pick(['Black', 'Crimson', 'Howling', 'Iron', 'Salty', 'Grinning', 'Rotten', 'Screaming', 'Golden'])} ${rng.pick(['Shark', 'Maiden', 'Gull', 'Kraken', 'Widow', 'Barracuda', 'Skull', 'Jackal', 'Tide'])}`;
}

/**
 * Does this ship mean to fight the player's ship? Pirates keep to their own
 * business at sea — fire on one, or board her, and it's another matter;
 * Marines come after you once your face is known.
 */
function hostile(s, game) {
  const tr = s.traffic;
  if (s.provoked || tr.raided) return tr.kind !== 'merchant' && tr.kind !== 'fishing';
  if (tr.kind === 'marine') return wantedTier(game) >= 2;
  return false;
}

/**
 * A fighting ship after yours. While you sail she gives chase — in the Blues
 * no faster than a small boat can hope to get away from — and once she's up
 * with you she runs abreast at your pace, her broadside on you. Once you've
 * stopped, she comes alongside and heaves to there, close enough to jump or
 * climb aboard (her guns still speak). Sets her sail and speed limit and
 * returns the heading she wants.
 */
export function engage(s, game, target) {
  const w = game.world;
  const d = w.distance(s.x, s.y, target.x, target.y);
  const th = target.heading, nx = -Math.sin(th), ny = Math.cos(th);
  const rx = w.dx(target.x, s.x), ry = s.y - target.y;
  const side = rx * nx + ry * ny >= 0 ? 1 : -1;
  const abeam = Math.abs(rx * nx + ry * ny), ahead = rx * Math.cos(th) + ry * Math.sin(th);
  s.anchored = false;
  s.sail = 1;
  // (close by — as far off as she'll need to come round onto the lane alongside, however long she is)
  if (Math.abs(target.speed) < 1.5 && d < 45 + s.def.length * 0.6) {
    // she's stopped: alongside her, on whichever side we're coming up (and
    // that side, once we've chosen it, as we come round), and heave to
    const bs = s.berthSide ??= side;
    const off = (s.def.beam + target.def.beam) / 2 + 2.4, hx = Math.cos(th), hy = Math.sin(th);
    const ax = w.wx(target.x + nx * off * bs), ay = target.y + ny * off * bs;
    const da = w.distance(s.x, s.y, ax, ay);
    if (da > 2.5) {
      s.heaveTo = false;
      // (up a lane alongside her to the berth, not bow-on into her side: onto
      // it just clear of her bow or her stern, whichever we're nearer, slowing
      // to come round onto it; then along it, slowing to stop at the berth)
      const ex = w.dx(ax, s.x), ey = s.y - ay, along = ex * hx + ey * hy, across = (ex * nx + ey * ny) * bs;
      if (Math.abs(across) < 2) s.lane = true; else if (Math.abs(across) > 6) s.lane = false;
      if (!s.lane) {
        const reach = (target.def.length / 2 + s.def.length / 2 + 4) * (along >= 0 ? 1 : -1), lx = w.wx(ax + hx * reach), ly = ay + hy * reach;
        s.speedCap = Math.max(3, 1.5 + w.distance(s.x, s.y, lx, ly) * 0.25);
        return Math.atan2(ly - s.y, w.dx(s.x, lx));
      }
      s.speedCap = 1.2 + da * 0.35;
      return Math.atan2(ay - s.y, w.dx(s.x, ax));
    }
    s.heaveTo = true; s.lane = false; s.sail = 0; s.speedCap = 0; s.anchored = true;
    // (lying alongside her, head the same way as she came up the lane)
    return Math.abs(angleDiff(s.heading, th)) <= Math.PI / 2 ? th : th + Math.PI;
  }
  s.heaveTo = false; s.lane = false; s.berthSide = null;
  const blues = isBlue(regionAt(target.x, target.y));
  const pace = Math.abs(target.speed);
  // (abreast of her at a gun's range, side to side — however broad the two of them are)
  const lane = (s.def.beam + target.def.beam) / 2 + 7;
  if (d > lane + 2) {
    // (in chase: never much faster than her, and in the Blues hardly faster than a rowboat)
    s.speedCap = blues ? 8.5 : Math.max(10, pace * 1.2 + 2);
    return Math.atan2(target.y - s.y, w.dx(s.x, target.x));
  }
  // up with her: abreast at a gun's range, keeping her pace (a little faster to draw level)
  s.speedCap = Math.min(blues ? 8.5 : 99, pace + clamp(-ahead * 0.3, -1.5, 2) + 0.3);
  return th - side * clamp((abeam - lane) * 0.1, -0.6, 0.6);
}

/** Your ship, while you're at her helm or on her deck (or null). */
export function playerShip(p) {
  const s = p.mode === 'sail' ? p.ship : p.deck?.ship?.owner === 'player' ? p.deck.ship : null;
  return s && !s.sunk ? s : null;
}

/** How far off (middle to middle) her guns reach another ship: a cannonball's flight from her side to the other's. */
export const gunReach = (s, target) => 12 + (s.def.beam + target.def.beam) / 2;

/**
 * How far off (m) a ship can be seen: the render distance at sea, where the
 * haze closes in completely (render3d/sky3d.js). Ships come and go beyond
 * it, so none appears or vanishes in plain sight. (Without a 3D view: the
 * default render distance.)
 */
export function sightRange(game) { return game.view3d?.viewDist?.(true) ?? 576; }

/** A broadside when her guns bear (lying hove to alongside, only now and then: you're meant to be able to board her). */
export function fireOn(game, s, target, d) {
  const toT = Math.atan2(target.y - s.y, game.world.dx(s.x, target.x));
  const side = Math.abs(Math.abs(angleDiff(s.heading, toT)) - Math.PI / 2);
  if (d < gunReach(s, target) && side < 0.6 && s.cannonCd <= 0 && s.fireBroadside(game, target.x, target.y, { name: s.name, faction: s.faction, isShip: true, power: () => (s.level || 5) * 10 }) && s.heaveTo) s.cannonCd = Math.max(s.cannonCd, 6.5);
}

/** Sail on past (round the coasts, clear of other ships) — or fight. */
function trafficAI(s, dt, game) {
  const tr = s.traffic, w = game.world, p = game.player;
  // (her news, once she's come out of the haze: see sea.js encounter)
  if (s.announce && w.distance(s.x, s.y, p.x, p.y) < sightRange(game) * 0.75) { game.log(...s.announce); s.announce = null; }
  if (tr.raided || tr.surrender || tr.adrift) { s.sail = 0; s.anchored = true; s.rowing = 0; s.speedCap = 0; return; }
  // shot to pieces: her rigging's gone and she lies dead in the water — still firing, but you can board her
  if (!tr.crippled && (tr.kind === 'pirate' || tr.kind === 'marine') && s.hull < s.maxHull * 0.35) {
    tr.crippled = true;
    game.log(`The ${s.name}'s rigging is in tatters — she's dead in the water. Come alongside and board her!`, '#ffe082');
  }
  if (tr.crippled) {
    s.sail = 0; s.rowing = 0; s.anchored = true; s.speedCap = 0;
    const target = playerShip(p);
    if (target && hostile(s, game) && (s.def.cannons || 0) > 0 && s.cannonCd <= 0 && w.distance(s.x, s.y, target.x, target.y) < gunReach(s, target)) s.fireBroadside(game, target.x, target.y, { name: s.name, faction: s.faction, isShip: true, power: () => (s.level || 5) * 10 });
    return;
  }
  const target = playerShip(p);
  const d = w.distance(s.x, s.y, p.x, p.y);
  let want;
  // (a patrol on your trail comes after you from as far off as she can see you, till her time's up)
  const hunting = tr.huntUntil > (game.time || 0) && d < sightRange(game) + 60;
  const fighting = target && (d < 55 + s.def.length * 0.6 || hunting) && hostile(s, game) && (s.def.cannons || 0) > 0;
  if (s.heaveTo && !fighting && hostile(s, game) && d < 30) {
    // hove to alongside, she waits for you (swimming over to board her, say)
    s.sail = 0; s.speedCap = 0; s.anchored = true;
    return;
  }
  if (fighting) {
    // give chase, run abreast with her broadside on you, or heave to alongside once you've stopped
    want = engage(s, game, target);
    fireOn(game, s, target, d);
    if (!tr.warned) { tr.warned = true; game.log(tr.kind === 'marine' ? `The ${s.name} runs up its colours — Marines, closing on you!` : `The ${s.name} is coming about to attack!`, tr.kind === 'marine' ? '#64b5f6' : '#ff8a80'); }
  } else {
    s.speedCap = null; s.heaveTo = false;
    // (a pirate sailing by lets you know she's there, and no more)
    if (tr.kind === 'pirate' && !tr.passed && target && d < 40) { tr.passed = true; game.log(`The ${s.name} sails past under her Jolly Roger, her crew jeering from the rail — they've better prey today.`, '#b0bec5'); }
    s.sail = tr.running ? 1 : tr.kind === 'fishing' ? 0.45 : tr.kind === 'merchant' ? 0.7 : 0.8;
    // a merchant that's been shot at runs for it
    if (tr.running && d < 60) want = Math.atan2(s.y - p.y, w.dx(p.x, s.x));
    else want = Math.atan2(tr.dest.y - s.y, w.dx(s.x, tr.dest.x));
    if (w.distance(s.x, s.y, tr.dest.x, tr.dest.y) < 25) { tr.dest = { x: w.wx(s.x + Math.cos(s.heading) * 300), y: s.y + Math.sin(s.heading) * 300 }; }
  }
  // stuck against the coast (or another hull) for a few seconds: come about
  // and make for the openest water; still stuck, she's eased clear (or, out
  // of your sight, quietly sails off the map)
  const now = game.time || 0;
  if (!tr.lastPos) tr.lastPos = { x: s.x, y: s.y, t: now };
  if (now - tr.lastPos.t > 3) {
    const moved = w.distance(s.x, s.y, tr.lastPos.x, tr.lastPos.y);
    tr.stuck = moved < 2.5 && s.sail > 0.3 ? (tr.stuck || 0) + 1 : 0;
    tr.lastPos = { x: s.x, y: s.y, t: now };
    if (tr.stuck >= 1) {
      let bestA = s.heading + Math.PI, bestSd = Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, r = s.def.length + 18;
        const x = w.wx(s.x + Math.cos(a) * r), y = s.y + Math.sin(a) * r;
        const sd = w.sailable(x, y) ? w.sd(x, y) : 99;
        if (sd < bestSd) { bestSd = sd; bestA = a; }
      }
      tr.escape = { a: bestA, until: now + 9 };
      tr.dest = { x: w.wx(s.x + Math.cos(bestA) * 300), y: s.y + Math.sin(bestA) * 300 };
      s.speed = Math.min(s.speed, 1);
    }
    if (tr.stuck >= 3) {
      if (w.distance(s.x, s.y, p.x, p.y) > sightRange(game)) { for (const a of tr.crew || []) a.alive = false; s.alive = false; return; }
      s.unstick(w, true);
      tr.stuck = 0;
    }
  }
  if (tr.escape) { if (now > tr.escape.until) tr.escape = null; else if (!fighting) want = tr.escape.a; }
  // round the coast: look ahead, and turn toward the open side (lying hove to, she just lies there)
  const L = s.def.length;
  const open = (ang, dist) => { const x = w.wx(s.x + Math.cos(ang) * dist), y = s.y + Math.sin(ang) * dist; return w.sailable(x, y) && w.sd(x, y) < -2.5; };
  if (!s.heaveTo && (!open(want, L + 14) || !open(s.heading, L + 10))) {
    for (const off of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.1, -2.1, 3]) {
      if (open(s.heading + off, L + 14) && open(s.heading + off, L + 6)) { want = s.heading + off; break; }
    }
  }
  // and keep clear of other ships
  for (const o of game.ships) {
    if (o === s || o.sunk) continue;
    const dd = w.distance(o.x, o.y, s.x, s.y);
    const room = (L + o.def.length) * 0.55 + 5;
    if (dd < room && !(target === o && hostile(s, game))) {
      const away = Math.atan2(s.y - o.y, w.dx(o.x, s.x));
      want = s.heading + clamp(angleDiff(s.heading, away), -1.2, 1.2) * (1 - dd / room);
    }
  }
  s.heading += clamp(angleDiff(s.heading, want), -1, 1) * s.def.turn * 0.55 * dt;
}

// ------------------------------------------------------------ crews

function crewFor(game, T, s, p) {
  const tr = s.traffic;
  if (!tr || s.sunk) return;
  const d = game.world.distance(s.x, s.y, p.x, p.y);
  if (!tr.crew && d < 75) spawnCrew(game, s);
  else if (tr.crew && d > 115 && !tr.raided && !tr.adrift) { for (const a of tr.crew) a.alive = false; tr.crew = null; }
}

/** One of her crew on his feet aboard her. */
const standing = (a, s) => a.alive && a.state === 'idle' && a.deck?.ship === s;

/**
 * Her crew are all down (shot down at their posts, say) or gone over the
 * side: nobody's sailing her. She lies there with her sails struck, hers for
 * the taking — board her, and the hold is yours.
 */
function adrift(game, s) {
  const tr = s.traffic;
  tr.adrift = true;
  s.sail = 0; s.anchored = true; s.rowing = 0; s.speedCap = 0; s.heaveTo = false;
  if (game.world.distance(s.x, s.y, game.player.x, game.player.y) < 120) game.log(`Nobody's left standing on the ${s.name}'s deck — she's adrift. Come alongside and take what's in her hold.`, '#ffe082');
}

function spawnCrew(game, s) {
  const tr = s.traffic;
  const n = CREW[s.type] ?? 5;
  const arch = tr.kind === 'marine' ? ['marine', 'marine_rifle', 'marine', 'marine_officer', 'marine']
    : tr.kind === 'pirate' ? ['pirate', 'pirate_gunner', 'brute', 'pirate', 'pirate']
      : tr.kind === 'fishing' ? [FISHER] : [SAILOR];
  const d = shipDims(s.def);
  tr.crew = [];
  for (let i = 0; i < n; i++) {
    const key = arch[i % arch.length];
    const A = typeof key === 'string' ? ARCHETYPES[key] : key;
    const lvl = Math.max(3, Math.round(tr.level * (tr.kind === 'merchant' || tr.kind === 'fishing' ? 0.6 : 1)));
    const a = makeNPC({ ...A, level: lvl, hostile: false, ai: 'idle', seed: Math.floor(Math.random() * 1e9), name: i === 0 && tr.kind === 'marine' ? 'Marine Lieutenant' : A.name }, s.x, s.y);
    a.crewOf = s;
    a.showName = false;
    a.faceHome = undefined;
    a.stationary = true;
    game.addActor(a);
    // the helmsman aft, the rest at their stations (clear of the deck's cargo)
    const st = SMALL_STATIONS[(i - 1) % SMALL_STATIONS.length];
    let t = i === 0 ? helmSpot(s).t : st[0];
    let v = i === 0 ? 0 : st[1] * s.def.beam;
    if (d.big) ({ t, v } = i === 0 ? helmSpot(s) : freeDeckSpot(s, 0.34 + (i / Math.max(1, n)) * 0.46, ((i % 2) ? 1 : -1) * s.def.beam * (0.12 + (i % 3) * 0.08)));
    placeOnDeck(game, a, s, t, v);
    a.facing = s.heading + (i === 0 ? 0 : (i % 2 ? 1 : -1) * 1.2);
    // (a rowboat's hand sits at her oars and rows her)
    if (i === 0 && s.def.oarsOnly) s.rower = a;
    if (a.controller) a.controller.home = null;
    tr.crew.push(a);
  }
}

// ------------------------------------------------------------ raids

function startRaid(game, T, s) {
  const tr = s.traffic;
  if (!tr || tr.raided) return;
  if (!tr.crew) spawnCrew(game, s);
  tr.raided = true;
  s.sail = 0; s.anchored = true;
  s.showBar = true; s.label = s.name;
  const p = game.player;
  for (const a of tr.crew) {
    if (!a.alive || a.state !== 'idle') continue;
    a.provoked = true; a.aggroPlayer = true; a.stationary = false;
    if (a.controller) { a.controller.kind = 'hostile'; a.controller.target = p; a.controller.state = 'chase'; a.controller.home = null; a.controller.aggroRange = 14; a.controller.leash = 40; }
  }
  // whoever has the helm leaves the wheel and comes down to deal with you
  const helm = tr.crew[0];
  if (helm?.alive && helm.state === 'idle') {
    helm.showName = true;
    helm.name = tr.kind === 'marine' ? helm.name : tr.kind === 'pirate' ? 'Pirate Helmsman' : tr.kind === 'fishing' ? 'Skipper' : 'Ship\'s Master';
    const line = tr.kind === 'marine' ? 'Boarders! I have the deck — stand fast, men!' : tr.kind === 'pirate' ? 'Somebody take the wheel! This one\'s MINE!' : tr.kind === 'fishing' ? 'Get off my boat!' : 'Boarders! Leave the wheel — I\'ll handle this myself!';
    game.fx.text(helm.x, helm.y - 2.2, line, '#ffffff', 0.34, { life: 2.4 });
  }
  const lvl = tr.level || 5;
  if (!tr.crimeDone) {
    tr.crimeDone = true;
    if (tr.kind === 'marine') crime(game, 1500000 * (1 + lvl / 40), 'raided a Marine ship', { rep: 4 });
    else if (tr.kind === 'merchant') crime(game, 700000, `raided the ${s.name}`, { rep: 8 });
    else if (tr.kind === 'fishing') crime(game, 250000, 'raided a fishing boat', { rep: 8 });
  }
  const who = tr.kind === 'marine' ? 'the Marines' : tr.kind === 'pirate' ? 'the pirates' : 'the crew';
  // (adrift, with nobody left standing on her deck, she's yours already)
  const up = tr.crew.some((a) => standing(a, s));
  game.ui.banner('BOARDED!', s.name, up ? `The helmsman is coming for you. Beat ${who} — then the hold is yours.` : 'Nobody aboard her is left standing.', 3);
  if (up && game.audio && game.audio.theme !== 'battle') { tr.prevTheme = game.audio.theme; game.audio.music('battle'); }
  // any Marine ship in sight joins in
  for (const o of T.ships) if (o !== s && o.traffic?.kind === 'marine' && game.world.distance(o.x, o.y, s.x, s.y) < 80) o.provoked = true;
}

function checkCleared(game, s) {
  const tr = s.traffic;
  if ((tr.crew || []).some((a) => standing(a, s))) return;
  tr.cleared = true;
  if (game.audio?.theme === 'battle') game.audio.music(tr.prevTheme || 'sea');
  game.ui.toast('THE DECK IS YOURS', `${s.name}: plunder her hold (down the hatch amidships — the chest at the foot of the ladder).`, '#ffd54f');
  game.log(`The crew of the ${s.name} is beaten!`, '#ffe082');
}

/** A Marine coming aboard a Navy ship is among friends. */
function friendlyBoarding(game, s) {
  const c = game.state?.char;
  return !!c && c.faction === 'marine' && s.traffic?.kind === 'marine' && !s.provoked;
}

function welcomeAboard(game, s) {
  const tr = s.traffic, c = game.state.char;
  if (tr.welcomed) return;
  tr.welcomed = true;
  const helm = (tr.crew || [])[0];
  const line = `${c.marineRank || 'Officer'} on deck! Welcome aboard the ${s.name}!`;
  if (helm?.alive) game.fx.text(helm.x, helm.y - 2.2, line, '#90caf9', 0.34, { life: 2.6 });
  game.log(`The crew of the ${s.name} salute as you come aboard.`, '#90caf9');
}

/** Plunder what's in the hold. */
function plunder(game, s) {
  const tr = s.traffic;
  tr.plundered = true;
  const rng = new RNG(Math.floor(s.x * 31 + s.y * 7) >>> 0);
  earn(game, s.loot || 1000, `the hold of the ${s.name}`);
  const goods = tr.kind === 'fishing' ? ['fresh_fish', 'fresh_fish', 'fresh_fish', 'elephant_tuna']
    : tr.kind === 'marine' ? ['bandage', 'bandage', 'meat', 'rumble_ball', 'seastone']
      : tr.kind === 'pirate' ? ['gold_coins', 'jewels', 'sake', 'meat']
        : ['gold_coins', 'sake', 'meat', 'fish_stew', 'cola', 'jewels'];
  const n = tr.kind === 'fishing' ? rng.int(3, 6) : rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const id = rng.pick(goods);
    if (id === 'seastone' && !rng.chance(0.15)) continue;
    addItem(game, id, 1);
  }
  // her powder and shot, carried across to your own ship (as much as she'll hold)
  const mine = game.ships.find((o) => o.owner === 'player' && !o.sunk && o.shotCap > o.shot && game.world.distance(o.x, o.y, s.x, s.y) < 60);
  if (mine && s.shot > 0) {
    const take = Math.min(s.shot, mine.shotCap - mine.shot);
    mine.shot += take; s.shot -= take;
    if (take) game.log(`You carry ${take} cannonballs across to the ${mine.name}.`, '#a5d6a7');
  }
  game.audio?.sfx('coin');
  if (tr.kind !== 'pirate' && !tr.plunderCrime) { tr.plunderCrime = true; crime(game, 300000, 'plundered a ship\'s hold', { rep: 3, quiet: true }); }
}

// ------------------------------------------------------------ E prompts

function footInteraction(game, T, p) {
  const w = game.world;
  if (p.mode !== 'foot' || p.state !== 'idle') return null;
  // on a deck: the helm and the hold
  const s = p.deck?.ship;
  if (s) {
    // (the wheel's on the quarterdeck: not from the cabin under it, or the hold)
    const room = p.deck.room?.kind || null;
    if (s.owner === 'player') {
      const d = deckDist(game, p, s, helmSpot(s));
      if (!room && d < (s.def.oarsOnly ? 0.9 : 1.4)) return { d, label: s.def.oarsOnly ? `Take the oars of the ${s.name}` : `Take the helm of the ${s.name}`, run: () => { p.deck.ship.aboard?.delete(p); p.deck = null; board(game, p, s); } };
      return null;
    }
    const tr = s.traffic;
    if (!tr || !tr.cleared) return null;
    // the plunder's in the treasure chest down in her hold (a small boat's, under the thwarts)
    const hs = hatchSpot(s), dh = deckDist(game, p, s, hs);
    if (!tr.plundered && (hs.room ? room === hs.room : !room) && dh < 1.3) return { d: dh, label: `Plunder the hold of the ${s.name}`, run: () => plunder(game, s) };
    // (her helm stays hers: ships are bought from a harbour's shipwright, not taken)
    return null;
  }
  // (in the water beside a hull there's no prompt: her side's a wall, and a
  // rowboat's low one you jump over — but for the foot of her ladder: see ladders.js)
  return null;
}
