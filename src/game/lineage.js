// The lineage layer: birth, lives, death, and the Inherited Will.
//
//  "Inherited Will, the Swell of the Ages, and the Dreams of the People. As
//   long as people continue to pursue the meaning of Freedom, these things
//   will never cease!" — Gol D. Roger
import { RNG } from '../core/rng.js';
import { RACES, rollRace, makeLook } from '../data/races.js';
import { ITEMS } from '../data/items.js';
import { STYLES } from '../data/styles.js';
import { FRUITS, unlockedFruitTechniques } from '../data/fruits.js';
import { DREAMS } from '../data/dreams.js';
import { Actor } from './actor.js';
import { baseAttrs, ATTR_KEYS } from './stats.js';
import { saveChar, saveLegacy, clearChar } from './save.js';
import { regionAt, SEA_IDS } from '../world/constants.js';
import { findShore } from './interact.js';

// --------------------------------------------------------------- birth traits
export const TRAITS = {
  will_of_d: { name: 'Will of D.', rarity: 'legendary', weight: 0, desc: 'Your name carries a hidden "D." Fate bends around you: you laugh in the face of death, and Conqueror\'s Haki may stir in your blood.', attrs: { wil: 3 } },
  conqueror: { name: "King's Disposition", rarity: 'legendary', weight: 0, desc: 'One in several million is born with the qualities of a king. Your Conqueror\'s Haki will awaken the first time your will is truly tested.' },
  iron_stomach: { name: 'Iron Stomach', rarity: 'common', weight: 10, desc: 'Food heals 30% more.' },
  sea_legs: { name: 'Sea Legs', rarity: 'common', weight: 10, desc: 'Storms and crashes damage your ship 30% less.' },
  silver_tongue: { name: 'Silver Tongue', rarity: 'common', weight: 10, desc: 'Shops charge you 10% less.' },
  hard_head: { name: 'Hard Head', rarity: 'common', weight: 10, desc: 'You recover from stuns faster.', attrs: { end: 1 } },
  quick_feet: { name: 'Quick Feet', rarity: 'common', weight: 10, desc: 'Dodges cost less stamina.', attrs: { agi: 1 } },
  lucky: { name: 'Lucky Star', rarity: 'uncommon', weight: 6, desc: 'Treasure chests hold more.' },
  night_owl: { name: 'Night Owl', rarity: 'uncommon', weight: 6, desc: '+10% damage at night.' },
  born_fighter: { name: 'Born Fighter', rarity: 'uncommon', weight: 6, desc: 'Style mastery grows 15% faster.', attrs: { str: 1 } },
  keen_eye: { name: 'Keen Eye', rarity: 'uncommon', weight: 5, desc: 'You spot Devil Fruits and treasure from further away.' },
  thick_skin: { name: 'Thick Skin', rarity: 'uncommon', weight: 5, desc: '+10% maximum health.', attrs: { vit: 2 } },
  sickly: { name: 'Sickly', rarity: 'common', weight: 4, desc: 'You tire quickly (-1 Endurance) — but you\'ve learned to read people (+1 Willpower).', attrs: { end: -1, wil: 1 } },
};

// ------------------------------------------------------- Inherited Will perks
export const PERKS = {
  lives: { name: 'Stubborn Bloodline', desc: '+1 starting life (vivre card).', costs: [60, 160], icon: '📃' },
  berries: { name: 'Family Treasure', desc: '+3,000 starting berries per level.', costs: [20, 30, 40], icon: '💰' },
  reroll: { name: "Fate's Coin", desc: 'Re-roll your race once per level at birth.', costs: [35, 70, 120], icon: '🪙' },
  attrs: { name: 'Trained from Birth', desc: '+2 to every attribute per level.', costs: [50, 110], icon: '💪' },
  ship: { name: 'Old Sea Dog', desc: 'Start with a Sloop instead of a rowboat.', costs: [70], icon: '⛵' },
  chart: { name: "Grandfather's Chart", desc: 'Every island your ancestors discovered starts charted on your map.', costs: [30], icon: '🗺' },
  haki: { name: 'Latent Haki', desc: 'Haki training is 25% faster per level.', costs: [80, 160], icon: '🖤' },
  will_of_d: { name: 'Will of D.', desc: 'Much higher chance to be born with the hidden "D."', costs: [90], icon: 'D' },
  kings_blood: { name: 'Kingly Bloodline', desc: "Much higher chance to be born with Conqueror's Haki.", costs: [150], icon: '👑' },
  rare_races: { name: 'Distant Relatives', desc: 'Rare, epic and legendary races are twice as likely.', costs: [100], icon: '🧬' },
};

export function perkLevel(legacy, id) { return (legacy.perks && legacy.perks[id]) || 0; }
export function perkCost(legacy, id) {
  const p = PERKS[id];
  const lvl = perkLevel(legacy, id);
  return lvl < p.costs.length ? p.costs[lvl] : null;
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
  const dChance = 0.03 * (perkLevel(legacy, 'will_of_d') ? 4 : 1);
  if (rng.chance(dChance)) traits.push('will_of_d');
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
  if (choices.dream === 'warrior') attrs.wil += 2;
  for (const k of ATTR_KEYS) attrs[k] = Math.max(1, attrs[k]);
  let name = (choices.name || 'Nameless').trim().slice(0, 28);
  if (birth.traits.includes('will_of_d') && !/ D\. /.test(name)) {
    const parts = name.split(' ');
    name = parts.length > 1 ? `${parts[0]} D. ${parts.slice(1).join(' ')}` : `${name} D.`;
  }
  const lives = Math.min(5, race.lives + perkLevel(legacy, 'lives'));
  let style = 'brawler';
  const masteries = { brawler: 0 };
  const techniques = [];
  if (birth.race === 'fishman') { style = 'fishman_karate'; masteries.fishman_karate = 8; techniques.push('fmk_uchimizu'); }
  if (birth.race === 'mink') { masteries.electro = 5; techniques.push('elec_discharge'); style = 'electro'; }
  const inventory = [{ id: 'meat', qty: 3 }, { id: 'rice_ball', qty: 2 }, { id: 'bandage', qty: 2 }];
  const equipped = { weapons: [], hat: null, coat: null };
  if (choices.dream === 'swordsman') { inventory.push({ id: 'rusty_katana', qty: 1 }); equipped.weapons = ['rusty_katana']; }
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
    dream: choices.dream || 'king',
    jr: choices.jr || { skull: 'classic', bones: 'cross', accessory: 'none', color: '#f5f6fa' },
    attrs,
    lives, maxLives: lives,
    berries: 1500 + perkLevel(legacy, 'berries') * 3000,
    bounty: 0,
    faction: choices.dream === 'admiral' ? 'civilian' : 'civilian',
    marineRank: null, merit: 0,
    style, masteries, techniques, hotbar: techniques.slice(0, 6),
    fruit: null, fruitMastery: 0, fruitsEaten: 0,
    haki: { armament: 0, observation: birth.race === 'three_eye' ? 8 : 0, conqueror: 0 },
    getUpCharges: 1,
    inventory, equipped,
    ships: [],
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

export function resolveSpawn(world, char) {
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
  const byId = allTowns.filter(({ t }) => wanted.includes(t.id));
  if (byId.length) pick = rng.pick(byId);
  if (!pick) {
    const inSea = allTowns.filter(({ isl }) => regionAt(isl.x, isl.y) === seaRegion);
    if (inSea.length) pick = rng.pick(inSea);
  }
  if (!pick) pick = allTowns[0];
  const { isl, t } = pick;
  return { x: t.plaza.x + 0.5, y: t.plaza.y + 2.5, island: isl, town: t, sea, name: `${t.name}, ${isl.name}` };
}

/** Make the live player actor from the character record. */
export function buildPlayer(game, char) {
  const a = new Actor({ name: char.name, look: equippedLook(char), race: char.race, attrs: effectiveAttrs(char) });
  a.char = char;
  a.game = game;
  a.style = char.style;
  a.masteries = char.masteries;
  a.techniques = char.techniques;
  a.hotbar = char.hotbar;
  a.fruit = char.fruit;
  a.fruitMastery = char.fruitMastery;
  a.hakiSkill = char.haki;
  a.weapon = weaponFromChar(char);
  a.persistent = true;
  a.recalc();
  a.hp = a.d.maxHp;
  a.stamina = a.d.maxStamina;
  a.haki = a.hakiUnlocked() ? a.d.maxHaki : 0;
  return a;
}

export function effectiveAttrs(char) {
  const a = { ...char.attrs };
  for (const slot of ['hat', 'coat']) {
    const d = ITEMS[char.equipped?.[slot]];
    if (d?.bonus) for (const [k, v] of Object.entries(d.bonus)) a[k] = (a[k] || 0) + v;
  }
  return a;
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

/** Re-sync the live player after equipment / attribute changes. */
export function refreshPlayer(game) {
  const p = game.player, c = p.char;
  const hpFrac = p.hp / p.d.maxHp;
  p.attrs = effectiveAttrs(c);
  p.look = equippedLook(c);
  p.weapon = weaponFromChar(c);
  p.style = c.style;
  p.fruit = c.fruit;
  p.fruitMastery = c.fruitMastery;
  p.hakiSkill = c.haki;
  p.techniques = c.techniques;
  p.hotbar = c.hotbar;
  p.recalc();
  p.hp = Math.max(1, Math.round(p.d.maxHp * hpFrac));
}

/** Copy the live state back into the character record (before saving). */
export function snapshot(game) {
  const p = game.player, c = p.char;
  if (!c) return;
  c.masteries = p.masteries;
  c.fruitMastery = p.fruitMastery;
  c.style = p.style;
  c.hotbar = p.hotbar;
  c.techniques = p.techniques;
  c.world.day = game.env.day;
  c.world.clock = game.env.clock;
  c.pos = { x: p.x, y: p.y, zone: game.world.id, mode: p.mode };
  c.ships = game.ships.filter((s) => s.owner === 'player' && !s.sunk).map((s) => ({
    uid: s.uid, type: s.type, name: s.name, upgrades: s.upgrades, hull: s.hull, x: s.x, y: s.y, heading: s.heading, zone: s.zoneId || 'surface', coated: s.coated,
  }));
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
  if (!game.state?.char || game.state.char.dead) return;
  snapshot(game);
  game.state.char.lastSaved = Date.now();
  saveChar(game.state.char);
  saveLegacy(game.state.legacy);
}

// ------------------------------------------------------------ will & legacy
export function computeWill(char) {
  const islands = (char.discovered || []).length;
  const bosses = (char.bosses || []).length;
  const bounty = char.bounty || 0;
  const days = Math.max(0, (char.world?.day || 1) - 1);
  let will = 5 + islands + bosses * 6 + Math.floor(Math.sqrt(bounty / 100000)) * 2 + Math.floor(days / 2);
  if (char.marineRank) will += 10;
  if (char.dreamDone) will += 120;
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
    days: char.world?.day || 1, cause, dream: char.dream, dreamDone: !!char.dreamDone, bosses: (char.bosses || []).length,
    islands: (char.discovered || []).length, fruit: char.fruit, will, when: Date.now(), look: char.look, jr: char.jr,
  });
  legacy.hall = legacy.hall.slice(0, 40);
  legacy.charted = [...new Set([...(legacy.charted || []), ...(char.discovered || [])])];
  if (char.fruit) legacy.reincarnatedFruits = [...(legacy.reincarnatedFruits || []), char.fruit].slice(-6);
  legacy.generation += 1;
  legacy.heirloom = null;
  char.dead = true;
  clearChar();
  saveLegacy(legacy);
  return will;
}

export { DREAMS, FRUITS, STYLES, unlockedFruitTechniques };
