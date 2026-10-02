// The lineage layer: birth, lives, death, and the Inherited Will.
//
//  "Inherited Will, the Swell of the Ages, and the Dreams of the People. As
//   long as people continue to pursue the meaning of Freedom, these things
//   will never cease!" — Gol D. Roger
import { RNG } from '../core/rng.js';
import { RACES, rollRace, makeLook } from '../data/races.js';
import { ITEMS } from '../data/items.js';
import { STYLES, WEAPON_STYLE } from '../data/styles.js';
import { FRUITS, unlockedFruitTechniques } from '../data/fruits.js';
import { DREAMS, LEGENDS } from '../data/dreams.js';
import { Actor } from './actor.js';
import { baseAttrs, ATTR_KEYS } from './stats.js';
import { saveChar, saveLegacy, clearChar } from './save.js';
import { regionAt, SEA_IDS, POS_SCALE, SIZE_SCALE } from '../world/constants.js';
import { findShore } from './interact.js';
import { upgradeFleet, recordShip, liveShips } from './fleet.js';

// --------------------------------------------------------------- birth traits
export const TRAITS = {
  will_of_d: { name: 'Will of D.', rarity: 'legendary', weight: 0, desc: 'Your name carries a hidden "D." — the mark of those who laugh in the face of death. Fate bends around you, and the world\'s powers will come to fear the name.', attrs: { wil: 3 } },
  // hidden: never shown until it awakens
  conqueror: { name: "King's Disposition", rarity: 'legendary', weight: 0, hidden: true, desc: 'One in several million is born with the qualities of a king. It awakened the first time your will was truly tested.' },
  iron_stomach: { name: 'Iron Stomach', rarity: 'common', weight: 10, desc: 'Food heals 30% more.' },
  sea_legs: { name: 'Sea Legs', rarity: 'common', weight: 10, desc: 'Storms and crashes damage your ship 30% less.' },
  silver_tongue: { name: 'Silver Tongue', rarity: 'common', weight: 10, desc: 'Shops charge you 10% less.' },
  hard_head: { name: 'Hard Head', rarity: 'common', weight: 10, desc: 'You recover from stuns faster.', attrs: { end: 1 } },
  quick_feet: { name: 'Quick Feet', rarity: 'common', weight: 10, desc: 'Your dodge comes back a quarter sooner.', attrs: { agi: 1 } },
  lucky: { name: 'Lucky Star', rarity: 'uncommon', weight: 6, desc: 'Treasure chests hold more.' },
  night_owl: { name: 'Night Owl', rarity: 'uncommon', weight: 6, desc: '+10% damage at night.' },
  born_fighter: { name: 'Born Fighter', rarity: 'uncommon', weight: 6, desc: 'Style mastery grows 15% faster.', attrs: { str: 1 } },
  keen_eye: { name: 'Keen Eye', rarity: 'uncommon', weight: 5, desc: 'You spot Devil Fruits and treasure from further away.' },
  thick_skin: { name: 'Thick Skin', rarity: 'uncommon', weight: 5, desc: '+10% maximum health.', attrs: { vit: 2 } },
  sickly: { name: 'Sickly', rarity: 'common', weight: 4, desc: 'You tire quickly (-1 Endurance) — but you\'ve learned to read people (+1 Willpower).', attrs: { end: -1, wil: 1 } },
};

// ------------------------------------------------------- Inherited Will perks
export const PERKS = {
  lives: { name: 'Stubborn Bloodline', desc: '+1 starting life (vivre card).', costs: [60, 160], icon: 'lives' },
  berries: { name: 'Family Treasure', desc: '+3,000 starting berries per level.', costs: [20, 30, 40], icon: 'berries' },
  reroll: { name: "Fate's Coin", desc: 'Re-roll your birth once per level.', costs: [35, 70, 120], icon: 'reputation' },
  attrs: { name: 'Trained from Birth', desc: '+2 to every attribute per level.', costs: [50, 110], icon: 'skills' },
  ship: { name: 'Old Sea Dog', desc: 'Start with a Sloop instead of a rowboat.', costs: [70], icon: 'ship' },
  chart: { name: "Grandfather's Chart", desc: 'Every island your ancestors discovered starts charted on your map.', costs: [30], icon: 'map' },
  haki: { name: 'Latent Spirit', desc: 'Hidden powers, once awakened, grow 25% faster per level.', costs: [80, 160], icon: 'character' },
  will_of_d: { name: 'Will of D.', desc: 'Triples the chance to be born with the hidden "D." (5% → 15%).', costs: [90], icon: 'journal' },
  kings_blood: { name: 'Kingly Bloodline', desc: 'Much higher chance to be born with the qualities of a king.', costs: [150], icon: 'crew' },
  rare_races: { name: 'Distant Relatives', desc: 'Rare, epic and legendary races are twice as likely.', costs: [100], icon: 'character' },
};

/** Has this character awakened any Haki? (Until then the game never mentions it.) */
export const hakiKnown = (c) => !!(c?.haki && (c.haki.armament || c.haki.observation || c.haki.conqueror));
/** Does a technique need Haki (so it stays hidden until Haki awakens)? */
export const needsHaki = (d) => !!(d && (d.hakiType || d.requiresHaki || d.cost?.haki || d.learn?.haki));

export function perkLevel(legacy, id) { return (legacy.perks && legacy.perks[id]) || 0; }
export function perkCost(legacy, id) {
  const p = PERKS[id];
  const lvl = perkLevel(legacy, id);
  return lvl < p.costs.length ? p.costs[lvl] : null;
}

/** Chance of being born with the hidden "D." in your name. */
export function dChance(legacy) { return 0.05 * (perkLevel(legacy, 'will_of_d') ? 3 : 1); }

/** Insert the "D." into a name: "Kaito Stormwell" → "Kaito D. Stormwell". */
export function nameWithD(name) {
  name = (name || 'Nameless').trim();
  if (/(^| )D\.( |$)/.test(name)) return name;
  const parts = name.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} D. ${parts.slice(1).join(' ')}` : `${name} D.`;
}

export function rollBirth(legacy, seed) {
  const rng = new RNG(seed);
  const boosts = {};
  if (perkLevel(legacy, 'rare_races')) for (const r of ['longarm', 'longleg', 'buccaneer', 'three_eye', 'lunarian']) boosts[r] = 2;
  const race = rollRace(rng, boosts);
  const traits = [];
  // one ordinary trait
  const pool = Object.entries(TRAITS).filter(([, t]) => t.weight > 0).map(([id, t]) => [id, t.weight]);
  traits.push(rng.weighted(pool));
  if (rng.chance(0.25)) { const t2 = rng.weighted(pool); if (!traits.includes(t2)) traits.push(t2); }
  if (rng.chance(dChance(legacy))) traits.push('will_of_d');
  const kChance = (traits.includes('will_of_d') ? 0.25 : 0.015) * (perkLevel(legacy, 'kings_blood') ? 4 : 1);
  if (rng.chance(kChance)) traits.push('conqueror');
  return { race, traits, seed };
}

/** Build a fresh character record from the birth roll + creation choices. */
export function createCharacter(legacy, birth, choices) {
  const race = RACES[birth.race];
  const rng = new RNG(birth.seed + ':char');
  const attrs = baseAttrs();
  for (const k of ATTR_KEYS) attrs[k] += (race.stats[k] || 0) + perkLevel(legacy, 'attrs') * 2;
  for (const t of birth.traits) for (const [k, v] of Object.entries(TRAITS[t]?.attrs || {})) attrs[k] += v;
  for (const k of ATTR_KEYS) attrs[k] = Math.max(1, attrs[k]);
  let name = (choices.name || 'Nameless').trim().slice(0, 28) || 'Nameless';
  if (birth.traits.includes('will_of_d')) name = nameWithD(name);
  const lives = Math.min(5, race.lives + perkLevel(legacy, 'lives'));
  let style = 'brawler';
  const masteries = { brawler: 0 };
  const techniques = [];
  if (birth.race === 'fishman') { style = 'fishman_karate'; masteries.fishman_karate = 8; techniques.push('fmk_uchimizu'); }
  if (birth.race === 'mink') { masteries.electro = 5; techniques.push('elec_discharge'); style = 'electro'; }
  const inventory = [{ id: 'meat', qty: 3 }, { id: 'rice_ball', qty: 2 }, { id: 'bandage', qty: 2 }];
  const equipped = { weapons: [], hat: null, coat: null, accessories: [], pose: null };
  if (legacy.heirloom && ITEMS[legacy.heirloom.id]) {
    const it = legacy.heirloom;
    inventory.push({ id: it.id, qty: 1, heirloom: true, from: it.from });
    const d = ITEMS[it.id];
    if (d.type === 'hat') equipped.hat = it.id;
    else if (d.type === 'coat') equipped.coat = it.id;
    else if (d.type === 'weapon' && !equipped.weapons.length) equipped.weapons = [it.id];
  }
  const char = {
    version: 1,
    id: 'c' + Math.floor(rng.next() * 1e9).toString(36),
    runSeed: Math.floor(rng.next() * 1e9),
    generation: legacy.generation,
    name,
    race: birth.race,
    traits: birth.traits.slice(),
    look: choices.look || makeLook(birth.race, birth.seed),
    dream: null,
    // no crew and no flag yet: you found your own pirate crew later (Crew menu)
    jr: null,
    crewName: null,
    reputation: 0,
    weaponMastery: { fists: 0, legs: 0, sword: 0, gun: 0, staff: 0, axe: 0 },
    train: { str: 0, agi: 0, end: 0, vit: 0, wil: 0 },
    legends: [],
    attrs,
    lives, maxLives: lives,
    berries: 1500 + perkLevel(legacy, 'berries') * 3000,
    bounty: 0,
    faction: 'civilian',
    marineRank: null, merit: 0,
    style, masteries, techniques, hotbar: techniques.slice(0, 6),
    fruit: null, fruitMastery: 0, fruitsEaten: 0,
    haki: { armament: 0, observation: birth.race === 'three_eye' ? 8 : 0, conqueror: 0 },
    getUpCharges: 1,
    inventory, equipped,
    ships: [],
    fleet: [], // every ship you own (see fleet.js); `ships` is where those afloat lie
    crew: [],
    discovered: [],
    logPose: { has: false, target: null, last: null, progress: 0, needles: 1 },
    eternalPoses: [],
    quests: {}, flags: {}, defeated: {}, bosses: [], liberated: [],
    trained: {},
    stats: { playTime: 0, sailed: 0, kills: 0, knockdowns: 0, deathsAvoided: 0 },
    world: { day: 1, clock: 8.5, chests: {}, npc: {}, fruitSpawns: null },
    pos: null,
    rest: null,
    worldVer: WORLD_VERSION,
    createdAt: Date.now(),
  };
  if (perkLevel(legacy, 'chart')) char.discovered = (legacy.charted || []).slice();
  return char;
}

// ------------------------------------------------------------- spawn logic
const HUMAN_STARTERS = {
  east_blue: ['foosha', 'shells_town', 'orange_town', 'syrup_village', 'shimotsuki_village', 'cocoyasi', 'satsuruzo_town', 'oykot_castle_town'],
  north_blue: ['lvneel_town', 'notice_town', 'spider_miles_port', 'swallow_town', 'rakesh_port', 'whiteland_town'],
  west_blue: ['kano_town', 'ilisia_town', 'toroa_town', 'las_camp_town', 'soja_village', 'esperia_town'],
  south_blue: ['baterilla_town', 'karate_dojo_town', 'sorbet_town', 'briss_town', 'centaurea_town', 'kutsukku_town'],
};

/**
 * Towns nobody should wake up in: where a named crew who fight whoever walks
 * in stand about the square (Arlong Park), or a band of them is camped right
 * by it, for as long as they're still about. (`defs`: the NPC definitions,
 * `groups`: the enemy groups; a crew that keeps to itself till you start it
 * — `calm` — doesn't count, nor one boss behind the door of his hall, nor a
 * lone troublemaker down at the pier: the square is where you wake.)
 */
export function heldTowns(world, defs, groups, char) {
  const held = new Set();
  const about = (d) => { try { return !d.when || !!d.when(char); } catch (e) { return true; } };
  for (const d of defs) {
    if (!d.hostile || d.calm || !d.at || typeof d.at !== 'object' || !d.at.town) continue;
    const pl = d.at;
    const inSquare = pl.plaza || (!pl.building && !pl.door && !pl.dock && !pl.spot && !pl.dx);
    if (inSquare && about(d)) held.add(pl.town);
  }
  for (const grp of groups || []) {
    if (grp.calm || !about(grp)) continue;
    const isl = world.islands.find((i) => i.id === grp.island);
    if (!isl) continue;
    const base = grp.spot ? isl.spots?.[grp.spot] : { x: isl.x + (grp.dx || 0) * isl.def.w / 2, y: isl.y + (grp.dy || 0) * isl.def.h / 2 };
    if (!base) continue;
    for (const t of isl.towns) if (t.plaza && world.distance(base.x, base.y, t.plaza.x, t.plaza.y) < (grp.radius || 5) + 16) held.add(t.id);
  }
  return held;
}

/** The town (x, y) is in, of those in `ids`. */
export function townAt(world, x, y, ids) {
  for (const isl of world.islands) {
    if (Math.abs(world.dx(isl.x, x)) > isl.radius + 60 || Math.abs(isl.y - y) > isl.radius + 60) continue;
    for (const t of isl.towns) if ((!ids || ids.has(t.id)) && x >= t.x0 - 3 && x <= t.x1 + 3 && y >= t.y0 - 3 && y <= t.y1 + 3) return t;
  }
  return null;
}

export function resolveSpawn(world, char, avoid = new Set()) {
  const rng = new RNG(char.runSeed + ':spawn');
  const race = RACES[char.race];
  const sea = rng.pick(race.spawnSeas);
  const seaRegion = SEA_IDS[sea];
  const allTowns = [];
  for (const isl of world.islands) for (const t of isl.towns) allTowns.push({ isl, t });
  let pick = null;
  if (race.spawnIslet && world.islets) {
    const cands = world.islets.filter((o) => o.region === seaRegion && o.r >= 5);
    if (cands.length) {
      const o = rng.pick(cands);
      const spot = findShore(world, o.x, o.y, o.r + 2) || { x: o.x, y: o.y };
      return { x: spot.x, y: spot.y, island: o.rec, town: null, sea, name: 'an uncharted islet' };
    }
  }
  const wanted = race.spawnTowns || HUMAN_STARTERS[sea] || [];
  const byId = allTowns.filter(({ t }) => wanted.includes(t.id) && !avoid.has(t.id));
  if (byId.length) pick = rng.pick(byId);
  if (!pick) {
    const inSea = allTowns.filter(({ isl, t }) => regionAt(isl.x, isl.y) === seaRegion && !avoid.has(t.id));
    if (inSea.length) pick = rng.pick(inSea);
  }
  if (!pick) pick = allTowns.find(({ t }) => !avoid.has(t.id)) || allTowns[0];
  const { isl, t } = pick;
  return { x: t.plaza.x + 0.5, y: t.plaza.y + 2.5, island: isl, town: t, sea, name: `${t.name}, ${isl.name}` };
}

/** Make the live player actor from the character record. */
export function buildPlayer(game, char) {
  const a = new Actor({ name: char.name, look: equippedLook(char), race: char.race, attrs: effectiveAttrs(char) });
  a.char = char;
  a.game = game;
  // (you set out with your weapon in its sheath: X draws it)
  a.style = unarmedStyle(char);
  a.masteries = char.masteries;
  a.techniques = char.techniques;
  a.hotbar = char.hotbar;
  a.fruit = char.fruit;
  a.fruitMastery = char.fruitMastery;
  a.hakiSkill = char.haki;
  a.weapon = weaponFromChar(char);
  a.weaponMastery = char.weaponMastery;
  a.baseMods.armor = armorOf(char);
  a.persistent = true;
  a.recalc();
  a.hp = a.d.maxHp;
  a.haki = a.hakiUnlocked() ? a.d.maxHaki : 0;
  return a;
}

export function effectiveAttrs(char) {
  const a = { ...char.attrs };
  const eq = char.equipped || {};
  const worn = [eq.hat, eq.coat, ...(eq.accessories || [])];
  for (const id of worn) {
    const d = ITEMS[id];
    if (d?.bonus) for (const [k, v] of Object.entries(d.bonus)) a[k] = (a[k] || 0) + v;
  }
  return a;
}

/** Damage reduction from worn armour (hat + body). */
export function armorOf(char) {
  const eq = char.equipped || {};
  return [eq.hat, eq.coat].reduce((s, id) => s + (ITEMS[id]?.armor || 0), 0);
}

/** Bring older saves up to date (new fields, retired systems). */
export function upgradeChar(c) {
  if (!c) return c;
  c.equipped = c.equipped || { weapons: [], hat: null, coat: null };
  c.equipped.accessories = c.equipped.accessories || [];
  // the Log Pose slot: the Eternal Pose you were following, else your Log Pose
  if (c.equipped.pose === undefined) {
    const has = (id) => (c.inventory || []).some((i) => i.id === id);
    const lp = c.logPose || {};
    c.equipped.pose = lp.eternal && has(lp.eternal) ? lp.eternal
      : (c.inventory || []).find((i) => ITEMS[i.id]?.logPose)?.id || (c.inventory || []).find((i) => ITEMS[i.id]?.type === 'pose')?.id || null;
    delete lp.eternal;
  }
  c.weaponMastery = c.weaponMastery || { fists: 0, legs: 0, sword: 0, gun: 0, staff: 0, axe: 0 };
  c.train = c.train || { str: 0, agi: 0, end: 0, vit: 0, wil: 0 };
  if (c.reputation === undefined) c.reputation = 0;
  c.legends = c.legends || [];
  if (c.crewName === undefined) c.crewName = c.faction === 'pirate' && c.jr ? `${c.name.split(' ')[0]} Pirates` : null;
  if (!c.crewName) c.jr = null;
  // the ships you had are the ships you own
  upgradeFleet(c);
  // attribute points from the old breakthrough system are spent automatically
  if (c.unspent > 0) {
    const keys = ['str', 'agi', 'end', 'vit', 'wil'];
    for (let i = 0; i < c.unspent; i++) { const k = keys[i % keys.length]; c.attrs[k] = Math.min(100, c.attrs[k] + 1); }
    c.unspent = 0;
  }
  return c;
}

export function equippedLook(char) {
  const look = { ...char.look };
  const hat = ITEMS[char.equipped?.hat];
  if (hat?.look) Object.assign(look, hat.look);
  const coat = ITEMS[char.equipped?.coat];
  if (coat?.look) Object.assign(look, coat.look);
  const ws = (char.equipped?.weapons || []).map((id) => ITEMS[id]).filter(Boolean);
  const swords = ws.filter((w) => w.kind === 'sword').length;
  look.swords = swords;
  look.weapon = ws[0]?.kind === 'sword' ? 'sword' : ws[0]?.kind || null;
  return look;
}

export function weaponFromChar(char) {
  const ws = (char.equipped?.weapons || []).map((id) => ITEMS[id]).filter(Boolean);
  if (!ws.length) return null;
  const kind = ws[0].kind;
  const same = ws.filter((w) => w.kind === kind);
  const power = same.reduce((s, w) => s + (w.power || 1), 0) / same.length;
  return { kind, power, count: same.length, ids: char.equipped.weapons.slice() };
}

/**
 * The style the character fights with right now (the live player's `style`;
 * `char.style` is the one picked in Skills). The picked style, as long as it
 * suits what's in their hands. A style that doesn't use the weapon they hold,
 * or needs more swords than they carry, gives way to a style they've learned
 * for that weapon — or else to its plainest one (a brawler who picks up a
 * cutlass swings the cutlass). A weapon style with nothing in hand falls back
 * on bare fists.
 */
export function fightingStyle(char) {
  const style = STYLES[char.style] ? char.style : 'brawler';
  const st = STYLES[style], w = weaponFromChar(char);
  if (!w) return st.weapon ? 'brawler' : style;
  const suits = (s) => STYLES[s]?.weapon === w.kind && w.count >= (STYLES[s].swords || 1);
  if (suits(style)) return style;
  const learned = Object.keys(char.masteries || {}).filter(suits).sort((a, b) => char.masteries[b] - char.masteries[a]);
  return learned[0] || WEAPON_STYLE[w.kind] || (st.weapon ? 'brawler' : style);
}

/**
 * The style your fists fight in (your weapon in its sheath, or none): the one
 * picked in Skills if it's an unarmed one, else the unarmed one you know
 * best, else plain brawling.
 */
export function unarmedStyle(char) {
  if (STYLES[char.style] && !STYLES[char.style].weapon) return char.style;
  const known = Object.keys(char.masteries || {}).filter((s) => STYLES[s] && !STYLES[s].weapon).sort((a, b) => char.masteries[b] - char.masteries[a]);
  return known[0] || 'brawler';
}

/** The live player's style for what's in hand: the weapon's, drawn; the fists', sheathed. */
export function handStyle(p) {
  const c = p.char;
  if (!c) return p.style;
  return p.weapon && p.drawn ? fightingStyle(c) : unarmedStyle(c);
}

/**
 * Draw your weapon (on) or put it back in its sheath (off). Not at a ship's
 * helm or at the oars: your hands are full. True if it changed.
 */
export function setDrawn(game, on) {
  const p = game.player;
  if (!p) return false;
  on = !!on && !!p.weapon && p.mode !== 'sail';
  if (!!p.drawn === on) return false;
  p.drawn = on;
  if (on && p.held) { p.held = null; p.eating = null; } // (food goes back in the bag)
  p.style = handStyle(p);
  game.audio?.sfx('equip');
  game.emit?.('weaponDrawn', on);
  return true;
}

/** Re-sync the live player after equipment / attribute changes. */
export function refreshPlayer(game) {
  const p = game.player, c = p.char;
  const hpFrac = p.hp / p.d.maxHp;
  p.attrs = effectiveAttrs(c);
  p.look = equippedLook(c);
  p.weapon = weaponFromChar(c);
  if (!p.weapon) p.drawn = false;
  p.style = handStyle(p);
  p.fruit = c.fruit;
  p.fruitMastery = c.fruitMastery;
  p.hakiSkill = c.haki;
  p.techniques = c.techniques;
  p.hotbar = c.hotbar;
  p.weaponMastery = c.weaponMastery;
  p.baseMods.armor = armorOf(c);
  p.recalc();
  p.hp = Math.max(1, Math.round(p.d.maxHp * hpFrac));
}

/** Copy the live state back into the character record (before saving). */
export function snapshot(game) {
  const p = game.player, c = p.char;
  if (!c) return;
  c.masteries = p.masteries;
  c.fruitMastery = p.fruitMastery;
  // (the style stays the one picked in Skills: the live one is what they're fighting with)
  c.hotbar = p.hotbar;
  c.techniques = p.techniques;
  c.world.day = game.env.day;
  c.world.clock = game.env.clock;
  c.pos = { x: p.x, y: p.y, zone: game.world.id, mode: p.mode };
  // (on one of your ships' decks, or down in her: where on her, to stand there again — see session.js)
  const dk = p.deck;
  if (p.mode !== 'sail' && dk?.ship?.uid && !dk.ship.sunk) c.pos.deck = { uid: dk.ship.uid, t: dk.t, v: dk.v, h: dk.h };
  // where your ships lie (those waiting on the surface while you're in a zone too)
  const afloat = liveShips(game);
  c.ships = afloat.map((s) => ({
    uid: s.uid, type: s.type, name: s.name, upgrades: s.upgrades, hull: s.hull, x: s.x, y: s.y, heading: s.heading, zone: s.zoneId || 'surface', coated: s.coated, shot: s.shot,
  }));
  for (const s of afloat) recordShip(c, s);
  c.activeShip = p.ship && !p.ship.sunk ? p.ship.uid : c.activeShip;
  c.fogSurface = game.surface ? encodeFog(game.surface.fog) : c.fogSurface;
  c.hintsShown = [...game.hintsShown];
}

function encodeFog(fog) {
  // run-length encode the explored mask (it is mostly 0s and 255s)
  const out = [];
  let cur = fog[0] ? 1 : 0, run = 0;
  for (let i = 0; i < fog.length; i++) {
    const v = fog[i] ? 1 : 0;
    if (v === cur && run < 65535) run++;
    else { out.push(cur ? run : -run); cur = v; run = 1; }
  }
  out.push(cur ? run : -run);
  return out;
}
export function decodeFog(enc, fog) {
  if (!enc) return;
  let i = 0;
  for (const r of enc) {
    const n = Math.abs(r), v = r > 0 ? 255 : 0;
    fog.fill(v, i, i + n);
    i += n;
  }
}

export function persist(game) {
  if (!game.state?.char || game.state.char.dead) return false;
  snapshot(game);
  game.state.char.lastSaved = Date.now();
  const ok = saveChar(game.state.char);
  saveLegacy(game.state.legacy);
  if (ok) game.emit?.('saved');
  return ok;
}

// ------------------------------------------------------------ will & legacy
export function computeWill(char) {
  const islands = (char.discovered || []).length;
  const bosses = (char.bosses || []).length;
  const bounty = char.bounty || 0;
  const days = Math.max(0, (char.world?.day || 1) - 1);
  let will = 5 + islands + bosses * 6 + Math.floor(Math.sqrt(bounty / 100000)) * 2 + Math.floor(days / 2);
  if (char.marineRank) will += 10;
  for (const id of char.legends || []) will += LEGENDS[id]?.will || 0;
  return Math.round(will);
}

export function endLineage(game, cause) {
  const { char, legacy } = game.state;
  snapshot(game);
  const will = computeWill(char);
  legacy.will += will;
  legacy.totalWill += will;
  legacy.hall.unshift({
    name: char.name, race: char.race, generation: char.generation, bounty: char.bounty, faction: char.faction, marineRank: char.marineRank,
    days: char.world?.day || 1, cause, legends: (char.legends || []).slice(), crewName: char.crewName, bosses: (char.bosses || []).length,
    islands: (char.discovered || []).length, fruit: char.fruit, will, when: Date.now(), look: char.look, jr: char.jr,
  });
  legacy.hall = legacy.hall.slice(0, 40);
  legacy.charted = [...new Set([...(legacy.charted || []), ...(char.discovered || [])])];
  if (char.fruit) legacy.reincarnatedFruits = [...(legacy.reincarnatedFruits || []).filter((f) => f !== char.fruit), char.fruit].slice(-6);
  legacy.generation += 1;
  legacy.heirloom = null;
  char.dead = true;
  clearChar();
  saveLegacy(legacy);
  return will;
}

export { DREAMS, FRUITS, STYLES, unlockedFruitTechniques };

// ------------------------------------------------------------- old saves

/**
 * The layout of the world a character's positions were saved in. 1: the seas
 * 1.5× the chart; 2: the seas 6× (islands 2.25×) — see POS_SCALE.
 */
export const WORLD_VERSION = 2;
const OLD_SCALE = 1.5;

/**
 * Move a character saved on an older, smaller world onto this one: a place on
 * or near an island keeps its spot on that island (which has grown), a place
 * out at sea keeps its spot on the chart. Their chart starts over from the
 * islands they know.
 */
export function migrateWorld(char, world, islandDefs) {
  if ((char.worldVer || 1) >= WORLD_VERSION) return false;
  const move = (pt) => {
    if (!pt || typeof pt.x !== 'number' || (pt.zone && pt.zone !== 'surface')) return;
    // the nearest charted island, where it used to be
    let best = null, bd = Infinity;
    for (const d of islandDefs) {
      const ox = (d.x / POS_SCALE) * OLD_SCALE, oy = (d.y / POS_SCALE) * OLD_SCALE;
      const r = (Math.max(d.w, d.h) / SIZE_SCALE) * OLD_SCALE * 0.5;
      const dd = Math.hypot(pt.x - ox, pt.y - oy) - r;
      if (dd < bd) { bd = dd; best = { d, ox, oy }; }
    }
    if (best && bd < 40) {
      const k = SIZE_SCALE / OLD_SCALE;
      pt.x = best.d.x + (pt.x - best.ox) * k;
      pt.y = best.d.y + (pt.y - best.oy) * k;
    } else {
      pt.x *= POS_SCALE / OLD_SCALE;
      pt.y *= POS_SCALE / OLD_SCALE;
    }
    pt.x = world.wx(pt.x);
    // (onto solid ground, or at least not inside a wall)
    if (!pt.mode || pt.mode === 'foot') {
      if (!world.walkable(pt.x, pt.y) && !world.swimmable(pt.x, pt.y)) {
        const spot = findShore(world, pt.x, pt.y, 24);
        if (spot) { pt.x = spot.x; pt.y = spot.y; }
      }
    }
  };
  move(char.pos); move(char.rest); move(char.spawn);
  for (const s of char.ships || []) if (!s.zone || s.zone === 'surface') move(s);
  for (const s of char.zoneShips || []) move(s);
  char.fogSurface = null; // (the chart is redrawn from the islands they know)
  char.worldVer = WORLD_VERSION;
  return true;
}
