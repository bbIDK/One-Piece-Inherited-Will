// Traffic at sea: a few ships going about their business — merchantmen and
// fishing boats plying between the islands, Marine patrols, pirates on the
// prowl — each with its crew on deck, sailing smoothly around the coasts.
// Pirates (and, once you're wanted, the Marines) come for your ship.
//
// Come alongside and board, swim up and climb aboard, or jump across from your
// own deck, and you're raiding her: the crew fights for their ship. Beat them
// and the hold is yours to plunder and the helm yours to take — a stolen ship
// joins your fleet. Raiding or stealing from anyone but pirates is piracy, and
// the bounty that comes with it grows the way One Piece bounties do.
import { makeNPC, ARCHETYPES } from './npcs.js';
import { crime } from './reputation.js';
import { earn, addItem } from './inventory.js';
import { persist } from './lineage.js';
import { board } from './interact.js';
import { regionAt, REGION, isGrandLine, isCalmBelt } from '../world/constants.js';
import { TAU, clamp, angleDiff } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { placeOnDeck, helmSpot, hatchSpot, deckDist, nearestDeck, freeDeckSpot } from './decks.js';
import { shipDims, hullGap } from '../world/hull.js';
import { SHIPS } from '../data/ships.js';
import { wantedTier } from './wanted.js';

const SAILOR = { name: 'Sailor', faction: 'civilian', style: 'brawler', look: { top: '#eceff1', bottom: '#37474f', hat: 'bandana', hatColor: '#1565c0' }, skill: 0.1, barks: ['Repel boarders!', 'Get off our ship!'] };
const FISHER = { name: 'Fisherman', faction: 'civilian', style: 'brawler', look: { top: '#8d6e63', bottom: '#455a64', hat: 'cap', hatColor: '#6d8f5e' }, skill: 0.05, barks: ['Not the catch!', 'Help!'] };
const CREW = { dinghy: 1, sloop: 2, caravel: 3, brigantine: 4, carrack: 6, war_galleon: 8, man_o_war: 10, great_galleon: 12, marine_battleship: 10 };

export function installTraffic(game) {
  const T = game.traffic = { t: 3, ships: [] };
  const reset = () => { for (const s of T.ships) { for (const a of s.traffic?.crew || []) a.alive = false; s.alive = false; } T.ships = []; };
  game.on('tick', (dt) => tick(game, T, dt));
  game.on('characterStart', () => { T.ships = []; });
  game.on('enterZone', reset);
  game.on('leaveZone', () => { T.ships = []; });
  // raids that land on a deck however they happen (a jump from your own deck counts)
  T.startRaid = (s) => startRaid(game, T, s);
  T.spawn = (o) => spawnShip(game, T, game.player, regionAt(game.player.x, game.player.y), o);

  // at the helm: board a ship alongside, or leave the wheel and walk your deck
  const prevSea = game.seaInteraction;
  game.seaInteraction = (p, s) => {
    const other = prevSea ? prevSea(p, s) : null;
    if (other) return other;
    const w = game.world;
    for (const o of T.ships) {
      if (o.sunk || !o.alive || o.owner === 'player') continue;
      // (the gap between the hulls, however long either ship is)
      const gap = hullGap(o, w.dx(o.x, s.x), s.y - o.y) - s.def.beam * 0.5;
      // alongside, and near enough the same speed to jump across
      const rvx = Math.cos(s.heading) * s.speed - Math.cos(o.heading) * o.speed, rvy = Math.sin(s.heading) * s.speed - Math.sin(o.heading) * o.speed;
      if (gap < 3.5 && Math.hypot(rvx, rvy) < 3.5) return { label: `Board and raid the ${o.name}`, key: 'E', run: () => boardFromHelm(game, T, p, s, o) };
    }
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
  for (const s of T.ships) crewFor(game, T, s, p);
  // raids: landing on a ship's deck starts one; beating the crew ends it
  const dk = p.deck?.ship;
  if (dk && dk.traffic && !dk.traffic.raided && dk.owner !== 'player') startRaid(game, T, dk);
  for (const s of T.ships) if (s.traffic?.raided && !s.traffic.cleared) checkCleared(game, s);
  T.t -= dt;
  if (T.t > 0) return;
  T.t = 4;
  T.ships = T.ships.filter((s) => {
    const keep = s.alive && !s.sunk && s.owner !== 'player' && (s.traffic?.raided ? w.distance(s.x, s.y, p.x, p.y) < 400 : w.distance(s.x, s.y, p.x, p.y) < 300);
    if (!keep && s.owner !== 'player') { for (const a of s.traffic?.crew || []) a.alive = false; if (!s.sunk) s.alive = false; }
    return keep;
  });
  const reg = regionAt(p.x, p.y);
  if (isCalmBelt(reg) || (game.sea?.rmState)) return;
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
  for (let tries = 0; tries < 18; tries++) {
    // out in the haze, on open water, heading past you
    const a = rng.range(0, TAU), r = rng.range(150, 210);
    const x = force ? force.x : w.wx(p.x + Math.cos(a) * r), y = force ? force.y : p.y + Math.sin(a) * r;
    const kind = force?.kind || pickKind(rng, reg, game);
    const gl = isGrandLine(reg), nw = reg === REGION.NEW_WORLD;
    // from rowboats to One Piece-scale galleons and battleships
    const type = force?.type || (kind === 'fishing' ? rng.pick(['dinghy', 'sloop'])
      : kind === 'marine' ? (nw ? rng.pick(['marine_warship', 'marine_battleship', 'marine_battleship']) : gl ? rng.pick(['brigantine', 'marine_warship', 'marine_battleship']) : rng.pick(['sloop', 'brigantine', 'brigantine', 'marine_warship']))
        : kind === 'merchant' ? rng.pick(gl ? ['caravel', 'brigantine', 'galleon', 'carrack', 'carrack'] : ['sloop', 'caravel', 'caravel', 'carrack'])
          : rng.pick(nw ? ['galleon', 'war_galleon', 'man_o_war', 'man_o_war', 'great_galleon'] : gl ? ['caravel', 'brigantine', 'frigate', 'war_galleon'] : ['sloop', 'caravel', 'sloop', 'caravel', 'war_galleon']));
    // (a big ship wants plenty of sea room)
    if (!force && (!w.sailable(x, y) || w.sd(x, y) > -8 - SHIPS[type].length * 0.5)) continue;
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
    s.traffic = { kind, dest, level: lvl, crew: null, raided: false, cleared: false, plundered: false };
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

/** Does this ship mean to fight the player's ship? */
function hostile(s, game) {
  const tr = s.traffic;
  if (s.provoked || tr.raided) return tr.kind !== 'merchant' && tr.kind !== 'fishing';
  if (tr.kind === 'pirate') return true;
  if (tr.kind === 'marine') return wantedTier(game) >= 2;
  return false;
}

/** Sail on past (round the coasts, clear of other ships) — or fight. */
function trafficAI(s, dt, game) {
  const tr = s.traffic, w = game.world, p = game.player;
  if (tr.raided || tr.surrender) { s.sail = 0; s.anchored = true; s.rowing = 0; return; }
  const target = p.mode === 'sail' && p.ship && !p.ship.sunk ? p.ship : null;
  const d = w.distance(s.x, s.y, p.x, p.y);
  let want;
  if (target && d < 55 && hostile(s, game) && (s.def.cannons || 0) > 0) {
    // bring a broadside to bear at a cannon's range
    s.sail = 1;
    const toT = Math.atan2(target.y - s.y, w.dx(s.x, target.x));
    want = d > 13 ? toT : toT + Math.PI / 2 * (angleDiff(s.heading, toT) > 0 ? -1 : 1);
    const side = Math.abs(Math.abs(angleDiff(s.heading, toT)) - Math.PI / 2);
    if (d < 17 && side < 0.6 && s.cannonCd <= 0) s.fireBroadside(game, target.x, target.y, { name: s.name, faction: s.faction, isShip: true, power: () => (s.level || 5) * 10 });
    if (!tr.warned) { tr.warned = true; game.log(tr.kind === 'marine' ? `The ${s.name} runs up its colours — Marines, closing on you!` : `The ${s.name} is coming about to attack!`, tr.kind === 'marine' ? '#64b5f6' : '#ff8a80'); }
  } else {
    s.sail = tr.running ? 1 : tr.kind === 'fishing' ? 0.45 : tr.kind === 'merchant' ? 0.7 : 0.8;
    // a merchant that's been shot at runs for it
    if (tr.running && d < 60) want = Math.atan2(s.y - p.y, w.dx(p.x, s.x));
    else want = Math.atan2(tr.dest.y - s.y, w.dx(s.x, tr.dest.x));
    if (w.distance(s.x, s.y, tr.dest.x, tr.dest.y) < 25) { tr.dest = { x: w.wx(s.x + Math.cos(s.heading) * 300), y: s.y + Math.sin(s.heading) * 300 }; }
  }
  // round the coast: look ahead, and turn toward the open side
  const L = s.def.length;
  const open = (ang, dist) => { const x = w.wx(s.x + Math.cos(ang) * dist), y = s.y + Math.sin(ang) * dist; return w.sailable(x, y) && w.sd(x, y) < -2.5; };
  if (!open(want, L + 14) || !open(s.heading, L + 10)) {
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
  else if (tr.crew && d > 115 && !tr.raided) { for (const a of tr.crew) a.alive = false; tr.crew = null; }
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
    const a = makeNPC({ ...A, level: lvl, hostile: false, ai: 'idle', seed: Math.floor(Math.random() * 1e9), name: i === 0 && tr.kind === 'marine' ? 'Marine Lieutenant' : A.name, fleeAt: 0.15 }, s.x, s.y);
    a.crewOf = s;
    a.showName = false;
    a.faceHome = undefined;
    a.stationary = true;
    game.addActor(a);
    // spread along the deck: the helmsman aft, the rest forward of him
    let t = i === 0 ? Math.min(0.46, (d.helmX + d.L / 2) / d.L + 0.08) : 0.3 + (i / Math.max(1, n)) * 0.5;
    let v = i === 0 ? 0 : ((i % 2) ? 1 : -1) * s.def.beam * 0.18;
    if (d.big) ({ t, v } = i === 0 ? helmSpot(s) : freeDeckSpot(s, 0.34 + (i / Math.max(1, n)) * 0.46, ((i % 2) ? 1 : -1) * s.def.beam * (0.12 + (i % 3) * 0.08)));
    placeOnDeck(game, a, s, t, v);
    a.facing = s.heading + (i === 0 ? 0 : (i % 2 ? 1 : -1) * 1.2);
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
  const lvl = tr.level || 5;
  if (!tr.crimeDone) {
    tr.crimeDone = true;
    if (tr.kind === 'marine') crime(game, 1500000 * (1 + lvl / 40), 'raided a Marine ship', { rep: 4 });
    else if (tr.kind === 'merchant') crime(game, 700000, `raided the ${s.name}`, { rep: 8 });
    else if (tr.kind === 'fishing') crime(game, 250000, 'raided a fishing boat', { rep: 8 });
  }
  const who = tr.kind === 'marine' ? 'the Marines' : tr.kind === 'pirate' ? 'the pirates' : 'the crew';
  game.ui.banner('RAID!', s.name, `Beat ${who} — then the hold and the helm are yours.`, 3);
  if (game.audio && game.audio.theme !== 'battle') { tr.prevTheme = game.audio.theme; game.audio.music('battle'); }
  // any Marine ship in sight joins in
  for (const o of T.ships) if (o !== s && o.traffic?.kind === 'marine' && game.world.distance(o.x, o.y, s.x, s.y) < 80) o.provoked = true;
}

function checkCleared(game, s) {
  const tr = s.traffic;
  const standing = (tr.crew || []).filter((a) => a.alive && a.state === 'idle' && a.deck?.ship === s);
  if (standing.length) return;
  tr.cleared = true;
  if (game.audio?.theme === 'battle') game.audio.music(tr.prevTheme || 'sea');
  game.ui.toast('THE SHIP IS YOURS', `${s.name}: plunder the hold (the hatch amidships), or take the helm to sail her away.`, '#ffd54f');
  game.log(`The crew of the ${s.name} is beaten!`, '#ffe082');
}

function boardFromHelm(game, T, p, mine, s) {
  // leave the wheel...
  mine.captain = null; mine.sail = 0; mine.rowing = 0; mine.anchored = true;
  mine.passengers = mine.passengers.filter((x) => x !== p);
  p.mode = 'foot'; p.onShip = false; p.ship = mine;
  // ...and over the rail onto her deck
  const n = nearestDeck(game, { x: mine.x, y: mine.y }, s);
  placeOnDeck(game, p, s, n ? n.t : 0.5, n ? n.v * 0.5 : 0);
  game.fx.burst(p.x, p.y, 8, { color: ['#d7ccc8', '#bcaaa4'], speed: 2, life: 0.4, kind: 'dust', size: 0.14 });
  startRaid(game, T, s);
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
  game.audio?.sfx('coin');
  if (tr.kind !== 'pirate' && !tr.plunderCrime) { tr.plunderCrime = true; crime(game, 300000, 'plundered a ship\'s hold', { rep: 3, quiet: true }); }
}

/** Take the helm of a beaten ship: she's yours now. */
function claim(game, T, s) {
  const c = game.state?.char, p = game.player, tr = s.traffic;
  const lvl = tr.level || 5;
  if (tr.kind === 'marine') crime(game, 3000000 * (1 + lvl / 40), `stole the ${s.name}`, { rep: 6 });
  else if (tr.kind !== 'pirate') crime(game, 1200000, `stole the ${s.name}`, { rep: 8 });
  // the beaten crew are put over the side in a boat
  for (const a of tr.crew || []) a.alive = false;
  s.owner = 'player'; s.faction = 'player';
  s.ai = null; s.traffic = null; s.provoked = false;
  s.showBar = false; s.label = null; s.expire = undefined;
  s.cannonsOverride = undefined;
  s.jr = c?.jr || null;
  s.uid = `s${Date.now().toString(36)}x`;
  s.hull = Math.max(s.hull, Math.round(s.maxHull * 0.5));
  if (tr.kind === 'marine') s.name = `Stolen ${s.name.replace(/^Marine /, '')}`;
  T.ships = T.ships.filter((x) => x !== s);
  if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
  board(game, p, s);
  game.ui.toast('SHIP TAKEN', `The ${s.name} sails under your command now.`, '#ffd54f');
  game.audio?.sfx('reveal');
  persist(game);
}

// ------------------------------------------------------------ E prompts

function footInteraction(game, T, p) {
  const w = game.world;
  if (p.mode !== 'foot' || p.state !== 'idle') return null;
  // on a deck: the helm and the hold
  const s = p.deck?.ship;
  if (s) {
    if (s.owner === 'player') {
      const d = deckDist(game, p, s, helmSpot(s));
      if (d < 1.4) return { d, label: `Take the helm of the ${s.name}`, run: () => { p.deck.ship.aboard?.delete(p); p.deck = null; board(game, p, s); } };
      return null;
    }
    const tr = s.traffic;
    if (!tr || !tr.cleared) return null;
    const dh = deckDist(game, p, s, hatchSpot(s));
    if (!tr.plundered && dh < 1.3) return { d: dh, label: `Plunder the hold of the ${s.name}`, run: () => plunder(game, s) };
    const d = deckDist(game, p, s, helmSpot(s));
    if (d < 1.4) return { d, label: `Take the helm — steal the ${s.name}`, run: () => claim(game, T, s) };
    return null;
  }
  // in the water beside a hull: climb aboard (a Devil Fruit user can't)
  if (p.inWater && !(p.fruit && !p.gills) && !(p.depth > 0.6)) {
    for (const o of T.ships) {
      if (o.sunk || !o.alive || o.owner === 'player') continue;
      if (!game.deckAt(p.x, p.y, -1.3) || game.deckAt(p.x, p.y, -1.3).ship !== o) continue;
      return { d: 0.5, x: o.x, y: o.y, label: o.traffic?.raided ? `Climb aboard the ${o.name}` : `Climb aboard and raid the ${o.name}`, run: () => {
        const n = nearestDeck(game, p, o);
        placeOnDeck(game, p, o, n ? n.t : 0.5, n ? n.v * 0.6 : 0);
        startRaid(game, T, o);
      } };
    }
  }
  return null;
}
